#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { defaultIdentityPlatformAuth } from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  EXPECTED_ACCESS_ADMIN_ROLE,
  assumeAccessAdministrationRole,
  checkAccessPrivileges
} from "./provision_pre_gematik_test_access.mjs";
import {
  EXPECTED_IAP_ISSUER,
  SafeCliError,
  assertFreshGcpMigrationGate,
  validateIdentityTargetFingerprint
} from "./provision_iap_identity_bindings.mjs";
import {
  CloudSqlManagedProxyError,
  assertManagedCloudSqlProxyMatchesGate,
  startManagedCloudSqlAuthProxy
} from "./lib/cloud-sql-managed-proxy.mjs";
import { checkPreGematikMigrationGcp } from "./check_pre_gematik_migration_gcp.mjs";

const { Client } = pg;

export const GUEST_ACCESS_INPUT_VERSION = 1;
export const GUEST_ACCESS_OPERATION = "PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST";
export const GUEST_ACCESS_CREATE_PROFILE_OPERATION =
  "CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST";
export const GUEST_ACCESS_REVOKE_OPERATION =
  "REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS";
export const EXPECTED_ENVIRONMENT = "pre-gematik";
export const EXPECTED_PASSWORD_PROVIDER = "password";

const ADVISORY_LOCK_NAME = "versorgungs-kompass:pre-gematik:identity-bindings";
const DATABASE_URL_ENV = "PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL";
const TARGET_FINGERPRINT_ENV = "PRE_GEMATIK_ACCESS_TARGET_SHA256";
const REPOSITORY_ROOT_ENV = "PRE_GEMATIK_ACCESS_REPOSITORY_ROOT";
const MAX_INPUT_BYTES = 64 * 1024;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const UID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const PROFILE_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SCOPE_REF_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new SafeCliError(`${label} muss ein JSON-Objekt sein.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SafeCliError(`${label} enthaelt fehlende oder nicht freigegebene Felder.`);
  }
}

function assertText(value, label, maximumLength, pattern) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > maximumLength
    || /[\u0000-\u001f\u007f]/u.test(value)
    || (pattern && !pattern.test(value))
  ) {
    throw new SafeCliError(`${label} ist ungueltig.`);
  }
}

export function identityPlatformGuestSubject(projectId, uid) {
  assertText(projectId, "project_id", 30, PROJECT_PATTERN);
  assertText(uid, "uid", 128, UID_PATTERN);
  const subject = `securetoken.google.com/${projectId}:${uid}`;
  assertText(subject, "abgeleiteter Identity-Platform-Subject", 512);
  return subject;
}

export function validateIdentityPlatformGuestAccessDocument(value) {
  assertExactKeys(
    value,
    [
      "version",
      "project_id",
      "uid",
      "email",
      "profile_id",
      "display_name",
      "role",
      "scope_ref"
    ],
    "Eingabedokument"
  );
  if (value.version !== GUEST_ACCESS_INPUT_VERSION) {
    throw new SafeCliError(
      `Eingabedokument.version muss exakt ${GUEST_ACCESS_INPUT_VERSION} sein.`
    );
  }
  assertText(value.project_id, "project_id", 30, PROJECT_PATTERN);
  assertText(value.uid, "uid", 128, UID_PATTERN);
  assertText(value.email, "email", 256, EMAIL_PATTERN);
  if (value.email !== value.email.toLowerCase()) {
    throw new SafeCliError("email muss bereits kanonisch kleingeschrieben sein.");
  }
  assertText(value.profile_id, "profile_id", 36, PROFILE_ID_PATTERN);
  assertText(value.display_name, "display_name", 256);
  if (!["viewer", "editor"].includes(value.role)) {
    throw new SafeCliError("role muss exakt viewer oder editor sein.");
  }
  assertText(value.scope_ref, "scope_ref", 128, SCOPE_REF_PATTERN);

  return Object.freeze({
    version: GUEST_ACCESS_INPUT_VERSION,
    project_id: value.project_id,
    uid: value.uid,
    email: value.email,
    profile_id: value.profile_id,
    display_name: value.display_name,
    role: value.role,
    scope_ref: value.scope_ref
  });
}

function canonicalInput(document) {
  return JSON.stringify({
    display_name: document.display_name,
    email: document.email,
    profile_id: document.profile_id,
    project_id: document.project_id,
    role: document.role,
    scope_ref: document.scope_ref,
    uid: document.uid,
    version: document.version
  });
}

export function identityPlatformGuestAccessFingerprint(document) {
  const canonical = validateIdentityPlatformGuestAccessDocument(document);
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalInput(canonical), "utf8")
    .digest("hex")}`;
}

function exactPasswordProvider(user) {
  if (!Array.isArray(user?.providerIds)) return false;
  const providers = [...new Set(user.providerIds.map((provider) => String(provider)))].sort();
  return providers.length === 1 && providers[0] === EXPECTED_PASSWORD_PROVIDER;
}

function exactVerifiedPasswordUser(user, document) {
  return user?.uid === document.uid
    && user?.email === document.email
    && user?.displayName === document.display_name
    && user?.emailVerified === true
    && user?.disabled === false
    && user?.hasPasswordCredential === true
    && String(user?.phoneNumber || "") === ""
    && user?.emailLinkSignin !== true
    && user?.customAuth !== true
    && user?.hasCustomAttributes !== true
    && user?.hasMfaEnrollment !== true
    && String(user?.tenantId || "") === ""
    && String(user?.initialEmail || "") === ""
    && exactPasswordProvider(user);
}

export async function verifyIdentityPlatformPasswordGuest(auth, documentValue) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  if (
    typeof auth?.getUser !== "function"
    || typeof auth?.getUserByEmail !== "function"
  ) {
    throw new SafeCliError(
      "Der administrative Identity-Platform-Readback ist nicht verfuegbar."
    );
  }

  let byUid;
  let byEmail;
  try {
    [byUid, byEmail] = await Promise.all([
      auth.getUser(document.uid),
      auth.getUserByEmail(document.email)
    ]);
  } catch {
    throw new SafeCliError(
      "Der eingeladene Identity-Platform-Account konnte nicht exakt verifiziert werden."
    );
  }
  if (
    !exactVerifiedPasswordUser(byUid, document)
    || !exactVerifiedPasswordUser(byEmail, document)
    || byUid.uid !== byEmail.uid
    || byUid.email !== byEmail.email
  ) {
    throw new SafeCliError(
      "UID, E-Mail, Anzeigename, Credential- oder Sicherheitszustand des "
      + "Identity-Platform-Accounts entsprechen nicht exakt dem geschuetzten Sollzustand."
    );
  }

  return Object.freeze({
    issuer: EXPECTED_IAP_ISSUER,
    subject: identityPlatformGuestSubject(document.project_id, document.uid),
    provider: EXPECTED_PASSWORD_PROVIDER
  });
}

function expectedProfile(document) {
  return Object.freeze({
    id: document.profile_id,
    email: document.email,
    display_name: document.display_name,
    role: document.role,
    active: true
  });
}

function expectedNewGuestProfile(document) {
  return Object.freeze({
    ...expectedProfile(document),
    initials: null,
    avatar_url: null,
    team: null,
    bio: null
  });
}

function expectedBinding(document) {
  return Object.freeze({
    issuer: EXPECTED_IAP_ISSUER,
    subject: identityPlatformGuestSubject(document.project_id, document.uid),
    profile_id: document.profile_id,
    active: true,
    access_scope: "test_only",
    scope_ref: document.scope_ref
  });
}

function canonicalProfile(profile) {
  return {
    id: String(profile?.id || ""),
    email: String(profile?.email || ""),
    display_name: String(profile?.display_name || ""),
    role: String(profile?.role || ""),
    active: profile?.active === true
  };
}

function canonicalNewGuestProfile(profile) {
  return {
    ...canonicalProfile(profile),
    initials: profile?.initials === null || profile?.initials === undefined
      ? null
      : String(profile.initials),
    avatar_url: profile?.avatar_url === null || profile?.avatar_url === undefined
      ? null
      : String(profile.avatar_url),
    team: profile?.team === null || profile?.team === undefined
      ? null
      : String(profile.team),
    bio: profile?.bio === null || profile?.bio === undefined
      ? null
      : String(profile.bio)
  };
}

function canonicalBinding(binding) {
  return {
    issuer: String(binding?.issuer || ""),
    subject: String(binding?.subject || ""),
    profile_id: String(binding?.profile_id || ""),
    active: binding?.active === true,
    access_scope: String(binding?.access_scope || ""),
    scope_ref: binding?.scope_ref === null || binding?.scope_ref === undefined
      ? null
      : String(binding.scope_ref)
  };
}

function canonicalRequest(request) {
  return {
    request_id: String(request?.request_id || ""),
    issuer: String(request?.issuer || ""),
    subject: String(request?.subject || ""),
    verified_email: String(request?.verified_email || ""),
    status: String(request?.status || ""),
    applied_profile_id:
      request?.applied_profile_id === null || request?.applied_profile_id === undefined
        ? null
        : String(request.applied_profile_id)
  };
}

function sameProfile(actual, expected) {
  return actual.id === expected.id
    && actual.email === expected.email
    && actual.display_name === expected.display_name
    && actual.role === expected.role
    && actual.active === expected.active;
}

function sameNewGuestProfile(actual, expected) {
  return sameProfile(actual, expected)
    && actual.initials === expected.initials
    && actual.avatar_url === expected.avatar_url
    && actual.team === expected.team
    && actual.bio === expected.bio;
}

function sameBinding(actual, expected) {
  return actual.issuer === expected.issuer
    && actual.subject === expected.subject
    && actual.profile_id === expected.profile_id
    && actual.active === expected.active
    && actual.access_scope === expected.access_scope
    && actual.scope_ref === expected.scope_ref;
}

function fingerprintState(state) {
  const profiles = state.profiles.map(canonicalProfile).sort((left, right) =>
    left.id.localeCompare(right.id) || left.email.localeCompare(right.email)
  );
  const bindings = state.bindings.map(canonicalBinding).sort((left, right) =>
    left.issuer.localeCompare(right.issuer)
      || left.subject.localeCompare(right.subject)
      || left.profile_id.localeCompare(right.profile_id)
  );
  const requests = state.requests.map(canonicalRequest).sort((left, right) =>
    left.request_id.localeCompare(right.request_id)
  );
  return `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify({ bindings, profiles, requests, version: 1 }), "utf8")
    .digest("hex")}`;
}

function fingerprintNewGuestState(state) {
  const profiles = state.profiles.map(canonicalNewGuestProfile).sort((left, right) =>
    left.id.localeCompare(right.id) || left.email.localeCompare(right.email)
  );
  const bindings = state.bindings.map(canonicalBinding).sort((left, right) =>
    left.issuer.localeCompare(right.issuer)
      || left.subject.localeCompare(right.subject)
      || left.profile_id.localeCompare(right.profile_id)
  );
  const requests = state.requests.map(canonicalRequest).sort((left, right) =>
    left.request_id.localeCompare(right.request_id)
  );
  return `sha256:${crypto
    .createHash("sha256")
    .update(JSON.stringify({ bindings, profiles, requests, version: 1 }), "utf8")
    .digest("hex")}`;
}

export function buildIdentityPlatformGuestPreBindingPlan(
  documentValue,
  profileRows,
  bindingRows,
  requestRows
) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  const profile = expectedProfile(document);
  const binding = expectedBinding(document);
  const profiles = profileRows.map(canonicalProfile);
  const bindings = bindingRows.map(canonicalBinding);
  const requests = requestRows.map(canonicalRequest);
  const currentStateFingerprint = fingerprintState({ profiles, bindings, requests });
  const expectedStateFingerprint = fingerprintState({
    profiles: [profile],
    bindings: [binding],
    requests: []
  });

  if (requests.length !== 0) {
    throw new SafeCliError(
      "Ein Enrollment-Request kollidiert mit dem administrativen Pre-Binding; "
      + "der Vorgang wurde fail-closed abgebrochen."
    );
  }
  if (profiles.length > 1 || bindings.length > 1) {
    throw new SafeCliError(
      "Profil-, E-Mail-, Subject- oder Binding-Kollision erkannt; der Vorgang wurde abgebrochen."
    );
  }
  if (profiles.length === 0) {
    throw new SafeCliError(
      "Das gepinnte App-Profil fehlt. Der Gast-Pre-Binding-Operator darf kein Profil "
      + "anlegen und wurde fail-closed abgebrochen."
    );
  }
  if (profiles.length === 1 && !sameProfile(profiles[0], profile)) {
    throw new SafeCliError(
      "Das vorhandene Profil entspricht nicht exakt dem gepinnten aktiven Sollprofil."
    );
  }
  if (bindings.length === 1 && !sameBinding(bindings[0], binding)) {
    throw new SafeCliError(
      "Die vorhandene Identity-Bindung entspricht nicht exakt dem gepinnten test_only-Sollzustand."
    );
  }
  const action = bindings.length === 0 ? "create_binding" : "unchanged";

  return Object.freeze({
    action,
    profile,
    binding,
    bindingInsertCount: action === "unchanged" ? 0 : 1,
    currentStateFingerprint,
    expectedStateFingerprint
  });
}

export function buildIdentityPlatformGuestProfileCreationPlan(
  documentValue,
  profileRows,
  bindingRows,
  requestRows
) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  const profile = expectedNewGuestProfile(document);
  const binding = expectedBinding(document);
  const profiles = profileRows.map(canonicalNewGuestProfile);
  const bindings = bindingRows.map(canonicalBinding);
  const requests = requestRows.map(canonicalRequest);
  const currentStateFingerprint = fingerprintNewGuestState({
    profiles,
    bindings,
    requests
  });
  const expectedStateFingerprint = fingerprintNewGuestState({
    profiles: [profile],
    bindings: [binding],
    requests: []
  });

  if (requests.length !== 0) {
    throw new SafeCliError(
      "Ein Enrollment-Request kollidiert mit der administrativen Neunutzeranlage; "
      + "der Vorgang wurde fail-closed abgebrochen."
    );
  }
  if (profiles.length === 0 && bindings.length === 0) {
    return Object.freeze({
      action: "create_profile_and_binding",
      profile,
      binding,
      profileInsertCount: 1,
      bindingInsertCount: 1,
      currentStateFingerprint,
      expectedStateFingerprint
    });
  }
  if (
    profiles.length === 1
    && bindings.length === 1
    && sameNewGuestProfile(profiles[0], profile)
    && sameBinding(bindings[0], binding)
  ) {
    return Object.freeze({
      action: "unchanged",
      profile,
      binding,
      profileInsertCount: 0,
      bindingInsertCount: 0,
      currentStateFingerprint,
      expectedStateFingerprint
    });
  }

  throw new SafeCliError(
    "Die Neunutzeranlage erlaubt nur einen vollstaendig leeren Zielzustand oder "
    + "den exakten vollstaendigen Profil-und-test_only-Binding-No-op."
  );
}

export function buildIdentityPlatformGuestRevocationPlan(
  documentValue,
  profileRows,
  bindingRows,
  requestRows
) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  const profile = expectedProfile(document);
  const activeBinding = expectedBinding(document);
  const revokedBinding = Object.freeze({ ...activeBinding, active: false });
  const profiles = profileRows.map(canonicalProfile);
  const bindings = bindingRows.map(canonicalBinding);
  const requests = requestRows.map(canonicalRequest);
  const currentStateFingerprint = fingerprintState({ profiles, bindings, requests });
  const expectedStateFingerprint = fingerprintState({
    profiles: [profile],
    bindings: [revokedBinding],
    requests: []
  });

  if (requests.length !== 0) {
    throw new SafeCliError(
      "Ein Enrollment-Request kollidiert mit dem administrativen Widerruf; "
      + "der Vorgang wurde fail-closed abgebrochen."
    );
  }
  if (profiles.length !== 1 || bindings.length !== 1) {
    throw new SafeCliError(
      "Der Widerruf verlangt exakt ein vorhandenes Sollprofil und genau eine "
      + "zugehoerige test_only-Bindung."
    );
  }
  if (!sameProfile(profiles[0], profile)) {
    throw new SafeCliError(
      "Das vorhandene Profil entspricht beim Widerruf nicht exakt dem gepinnten Sollprofil."
    );
  }
  if (
    !sameBinding(bindings[0], activeBinding)
    && !sameBinding(bindings[0], revokedBinding)
  ) {
    throw new SafeCliError(
      "Die vorhandene Identity-Bindung entspricht beim Widerruf weder dem aktiven "
      + "noch dem bereits widerrufenen gepinnten test_only-Zustand."
    );
  }

  const action = bindings[0].active ? "disable_binding" : "unchanged";
  return Object.freeze({
    action,
    profile,
    binding: revokedBinding,
    bindingUpdateCount: action === "disable_binding" ? 1 : 0,
    currentStateFingerprint,
    expectedStateFingerprint
  });
}

function repositoryRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw new SafeCliError("Der Git-Worktree konnte nicht sicher bestimmt werden.");
  }
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function loadProtectedIdentityPlatformGuestAccessDocument(
  inputPath,
  { repository = repositoryRoot() } = {}
) {
  if (!path.isAbsolute(String(inputPath || ""))) {
    throw new SafeCliError("--input muss ein absoluter geschuetzter Dateipfad sein.");
  }
  let linkState;
  try {
    linkState = await fs.lstat(inputPath);
  } catch {
    throw new SafeCliError("Das geschuetzte Gastzugriffs-Dokument fehlt.");
  }
  if (linkState.isSymbolicLink()) {
    throw new SafeCliError("Das Gastzugriffs-Dokument darf kein Symlink sein.");
  }
  const resolved = await fs.realpath(inputPath);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_INPUT_BYTES
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new SafeCliError(
      "Das Gastzugriffs-Dokument muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  try {
    return validateIdentityPlatformGuestAccessDocument(
      JSON.parse(await fs.readFile(resolved, "utf8"))
    );
  } catch (error) {
    if (error instanceof SafeCliError) throw error;
    throw new SafeCliError("Das geschuetzte Gastzugriffs-Dokument enthaelt kein gueltiges JSON.");
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new SafeCliError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseIdentityPlatformGuestAccessArguments(argv) {
  const options = {
    help: false,
    apply: false,
    revoke: false,
    createProfileAndPrebind: false,
    input: "",
    confirmEnvironment: "",
    confirmProject: "",
    confirmDatabase: "",
    confirmOperation: "",
    confirmFingerprint: "",
    confirmCurrentStateFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-project", "confirmProject"],
    ["--confirm-database", "confirmDatabase"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"],
    ["--confirm-current-state-fingerprint", "confirmCurrentStateFingerprint"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--revoke") options.revoke = true;
    else if (argument === "--create-profile-and-prebind") {
      options.createProfileAndPrebind = true;
    } else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
    }
  }
  if (options.revoke && options.createProfileAndPrebind) {
    throw new SafeCliError(
      "--revoke und --create-profile-and-prebind sind gegenseitig ausgeschlossen."
    );
  }
  return Object.freeze(options);
}

export function validateIdentityPlatformGuestAccessConfirmations(
  options,
  document,
  fingerprint
) {
  if (options.revoke && options.createProfileAndPrebind) {
    throw new SafeCliError(
      "--revoke und --create-profile-and-prebind sind gegenseitig ausgeschlossen."
    );
  }
  if (!options.input && !options.help) {
    throw new SafeCliError("--input mit einem geschuetzten Gastzugriffs-Dokument ist erforderlich.");
  }
  const confirmationValues = [
    options.confirmEnvironment,
    options.confirmProject,
    options.confirmDatabase,
    options.confirmOperation,
    options.confirmFingerprint,
    options.confirmCurrentStateFingerprint
  ];
  if (!options.apply) {
    if (confirmationValues.some(Boolean)) {
      throw new SafeCliError("Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt.");
    }
    return;
  }
  if (
    options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || options.confirmProject !== document.project_id
    || !options.confirmDatabase
    || options.confirmOperation !== (
      options.revoke
        ? GUEST_ACCESS_REVOKE_OPERATION
        : options.createProfileAndPrebind
          ? GUEST_ACCESS_CREATE_PROFILE_OPERATION
          : GUEST_ACCESS_OPERATION
    )
    || options.confirmFingerprint !== fingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
    || !FINGERPRINT_PATTERN.test(options.confirmCurrentStateFingerprint)
  ) {
    throw new SafeCliError(
      "Apply-Bestaetigungen fuer Umgebung, Projekt, Datenbank, Operation oder "
      + "Preview-Fingerprints fehlen."
    );
  }
}

async function readRelevantState(client, document) {
  const subject = identityPlatformGuestSubject(document.project_id, document.uid);
  const profileResult = await client.query(
    `select id, email, display_name, initials, role, active, avatar_url, team, bio
       from public.profiles
      where id = $1
         or lower(email) = lower($2)
      order by id, email`,
    [document.profile_id, document.email]
  );
  const bindingResult = await client.query(
    `select issuer, subject, profile_id, active, access_scope, scope_ref
       from public.identity_bindings
      where subject = $1
         or profile_id = $2
      order by issuer, subject, profile_id`,
    [subject, document.profile_id]
  );
  const requestResult = await client.query(
    `select request_id::text, issuer, subject, verified_email, status, applied_profile_id
       from public.identity_enrollment_requests
      where subject = $1
         or lower(verified_email) = lower($2)
         or applied_profile_id = $3
      order by request_id`,
    [subject, document.email, document.profile_id]
  );
  return Object.freeze({
    profiles: profileResult.rows,
    bindings: bindingResult.rows,
    requests: requestResult.rows
  });
}

function assertVerifiedEvidence(evidence, document) {
  if (
    evidence?.issuer !== EXPECTED_IAP_ISSUER
    || evidence?.subject !== identityPlatformGuestSubject(document.project_id, document.uid)
    || evidence?.provider !== EXPECTED_PASSWORD_PROVIDER
  ) {
    throw new SafeCliError(
      "Der administrative Identity-Platform-Readback lieferte keinen exakt gepinnten Password-Subject."
    );
  }
}

export function formatIdentityPlatformGuestAccessResult({
  applied,
  action,
  inputFingerprint,
  currentStateFingerprint,
  expectedStateFingerprint,
  complete
}) {
  const profileCount = applied || action === "create_binding" || action === "unchanged" ? 1 : 0;
  const bindingCount = applied || action === "unchanged" ? 1 : 0;
  return JSON.stringify({
    schema_version: 1,
    operation: GUEST_ACCESS_OPERATION,
    mode: applied ? "APPLY" : "PREVIEW",
    result: action,
    identity_platform_account_verified: true,
    provider_verified: EXPECTED_PASSWORD_PROVIDER,
    subject_namespace_verified: true,
    access_scope_verified: "test_only",
    profile_count: profileCount,
    binding_count: bindingCount,
    active_binding_count: bindingCount,
    profile_binding_complete: complete,
    database_transaction_committed: applied,
    input_fingerprint: inputFingerprint,
    current_state_fingerprint: currentStateFingerprint,
    expected_state_fingerprint: expectedStateFingerprint
  });
}

export function formatIdentityPlatformGuestProfileCreationResult({
  applied,
  action,
  inputFingerprint,
  currentStateFingerprint,
  expectedStateFingerprint,
  complete
}) {
  const stateIsComplete = applied || action === "unchanged";
  const profileCount = stateIsComplete ? 1 : 0;
  const bindingCount = stateIsComplete ? 1 : 0;
  return JSON.stringify({
    schema_version: 1,
    operation: GUEST_ACCESS_CREATE_PROFILE_OPERATION,
    mode: applied ? "APPLY" : "PREVIEW",
    result: action,
    identity_platform_account_verified: true,
    provider_verified: EXPECTED_PASSWORD_PROVIDER,
    subject_namespace_verified: true,
    access_scope_verified: "test_only",
    profile_count: profileCount,
    binding_count: bindingCount,
    active_binding_count: bindingCount,
    profile_binding_complete: complete,
    database_transaction_committed: applied,
    input_fingerprint: inputFingerprint,
    current_state_fingerprint: currentStateFingerprint,
    expected_state_fingerprint: expectedStateFingerprint
  });
}

export function formatIdentityPlatformGuestRevocationResult({
  applied,
  action,
  inputFingerprint,
  currentStateFingerprint,
  expectedStateFingerprint
}) {
  return JSON.stringify({
    schema_version: 1,
    operation: GUEST_ACCESS_REVOKE_OPERATION,
    mode: applied ? "APPLY" : "PREVIEW",
    result: action,
    identity_platform_account_verified: true,
    provider_verified: EXPECTED_PASSWORD_PROVIDER,
    subject_namespace_verified: true,
    access_scope_verified: "test_only",
    profile_count: 1,
    binding_count: 1,
    active_binding_count: action === "disable_binding" && !applied ? 1 : 0,
    access_revoked: action === "unchanged" || applied,
    database_transaction_committed: applied,
    input_fingerprint: inputFingerprint,
    current_state_fingerprint: currentStateFingerprint,
    expected_state_fingerprint: expectedStateFingerprint
  });
}

export class GuestAccessCommitOutcomeUnknownError extends SafeCliError {
  constructor(inputFingerprint, expectedStateFingerprint) {
    super(
      "COMMIT-Ergebnis fuer das Gast-Pre-Binding ist unbekannt. Nicht blind wiederholen; "
      + "zuerst einen neuen Preview ausfuehren. "
      + `input_fingerprint=${inputFingerprint} `
      + `expected_state_fingerprint=${expectedStateFingerprint}.`,
      1
    );
    this.name = "GuestAccessCommitOutcomeUnknownError";
    this.code = "GUEST_ACCESS_COMMIT_OUTCOME_UNKNOWN";
  }
}

export class GuestAccessProfileCreationCommitOutcomeUnknownError extends SafeCliError {
  constructor(inputFingerprint, expectedStateFingerprint) {
    super(
      "COMMIT-Ergebnis fuer die atomare Gastprofil-und-Binding-Anlage ist unbekannt. "
      + "Nicht blind wiederholen; zuerst einen neuen --create-profile-and-prebind-Preview "
      + "ausfuehren. "
      + `input_fingerprint=${inputFingerprint} `
      + `expected_state_fingerprint=${expectedStateFingerprint}.`,
      1
    );
    this.name = "GuestAccessProfileCreationCommitOutcomeUnknownError";
    this.code = "GUEST_ACCESS_PROFILE_CREATION_COMMIT_OUTCOME_UNKNOWN";
  }
}

export class GuestAccessRevocationCommitOutcomeUnknownError extends SafeCliError {
  constructor(inputFingerprint, expectedStateFingerprint) {
    super(
      "COMMIT-Ergebnis fuer den Gastzugriffs-Widerruf ist unbekannt. Nicht blind "
      + "wiederholen; zuerst einen neuen Widerrufs-Preview ausfuehren. "
      + `input_fingerprint=${inputFingerprint} `
      + `expected_state_fingerprint=${expectedStateFingerprint}.`,
      1
    );
    this.name = "GuestAccessRevocationCommitOutcomeUnknownError";
    this.code = "GUEST_ACCESS_REVOCATION_COMMIT_OUTCOME_UNKNOWN";
  }
}

export async function executeIdentityPlatformGuestPreBindingTransaction({
  client,
  document: documentValue,
  fingerprint,
  apply,
  confirmedCurrentStateFingerprint = "",
  expectedDatabase = "",
  verifyIdentity,
  log = console.log
}) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  if (identityPlatformGuestAccessFingerprint(document) !== fingerprint) {
    throw new SafeCliError("Der Gastzugriffs-Fingerprint entspricht nicht dem Eingabedokument.");
  }
  if (typeof verifyIdentity !== "function") {
    throw new SafeCliError("Der administrative Identity-Platform-Readback fehlt.");
  }

  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await assumeAccessAdministrationRole(client);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    const databaseResult = await client.query("select current_database() as database_name");
    if (apply && databaseResult.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname entspricht nicht --confirm-database.");
    }
    await checkAccessPrivileges(client);

    assertVerifiedEvidence(await verifyIdentity(), document);
    const current = await readRelevantState(client, document);
    const plan = buildIdentityPlatformGuestPreBindingPlan(
      document,
      current.profiles,
      current.bindings,
      current.requests
    );

    if (apply && confirmedCurrentStateFingerprint !== plan.currentStateFingerprint) {
      throw new SafeCliError(
        "Der aktuelle Gastzugriffs-Zustand entspricht nicht dem bestaetigten "
        + "current_state_fingerprint aus dem Preview."
      );
    }

    if (!apply) {
      await client.query("rollback");
      transactionOpen = false;
      log(formatIdentityPlatformGuestAccessResult({
        applied: false,
        action: plan.action,
        inputFingerprint: fingerprint,
        currentStateFingerprint: plan.currentStateFingerprint,
        expectedStateFingerprint: plan.expectedStateFingerprint,
        complete: plan.action === "unchanged"
      }));
      return plan;
    }

    if (plan.bindingInsertCount === 1) {
      const result = await client.query(
        `insert into public.identity_bindings
           (issuer, subject, profile_id, active, access_scope, scope_ref)
         values ($1, $2, $3, true, 'test_only', $4)`,
        [
          plan.binding.issuer,
          plan.binding.subject,
          plan.binding.profile_id,
          plan.binding.scope_ref
        ]
      );
      if (result.rowCount !== 1) {
        throw new SafeCliError("Das test_only-Sollbinding wurde nicht exakt einmal angelegt.");
      }
    }

    const finalState = await readRelevantState(client, document);
    const finalPlan = buildIdentityPlatformGuestPreBindingPlan(
      document,
      finalState.profiles,
      finalState.bindings,
      finalState.requests
    );
    if (
      finalPlan.action !== "unchanged"
      || finalPlan.currentStateFingerprint !== plan.expectedStateFingerprint
    ) {
      throw new SafeCliError(
        "Die transaktionale Abschlusskontrolle von Profil und test_only-Binding ist fehlgeschlagen."
      );
    }
    assertVerifiedEvidence(await verifyIdentity(), document);

    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      transactionOpen = false;
      throw new GuestAccessCommitOutcomeUnknownError(
        fingerprint,
        plan.expectedStateFingerprint
      );
    }
    transactionOpen = false;
    log(formatIdentityPlatformGuestAccessResult({
      applied: true,
      action: plan.action === "unchanged" ? "unchanged" : `${plan.action}_completed`,
      inputFingerprint: fingerprint,
      currentStateFingerprint: finalPlan.currentStateFingerprint,
      expectedStateFingerprint: plan.expectedStateFingerprint,
      complete: true
    }));
    return finalPlan;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await client.query("rollback").catch(() => {});
    }
    throw error;
  }
}

export async function executeIdentityPlatformGuestProfileCreationTransaction({
  client,
  document: documentValue,
  fingerprint,
  apply,
  confirmedCurrentStateFingerprint = "",
  expectedDatabase = "",
  verifyIdentity,
  log = console.log
}) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  if (identityPlatformGuestAccessFingerprint(document) !== fingerprint) {
    throw new SafeCliError("Der Gastzugriffs-Fingerprint entspricht nicht dem Eingabedokument.");
  }
  if (typeof verifyIdentity !== "function") {
    throw new SafeCliError("Der administrative Identity-Platform-Readback fehlt.");
  }

  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await assumeAccessAdministrationRole(client);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    const databaseResult = await client.query("select current_database() as database_name");
    if (apply && databaseResult.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname entspricht nicht --confirm-database.");
    }
    await checkAccessPrivileges(client);

    assertVerifiedEvidence(await verifyIdentity(), document);
    const current = await readRelevantState(client, document);
    const plan = buildIdentityPlatformGuestProfileCreationPlan(
      document,
      current.profiles,
      current.bindings,
      current.requests
    );
    if (apply && confirmedCurrentStateFingerprint !== plan.currentStateFingerprint) {
      throw new SafeCliError(
        "Der aktuelle Neunutzer-Zustand entspricht nicht dem bestaetigten "
        + "current_state_fingerprint aus dem --create-profile-and-prebind-Preview."
      );
    }

    if (!apply) {
      await client.query("rollback");
      transactionOpen = false;
      log(formatIdentityPlatformGuestProfileCreationResult({
        applied: false,
        action: plan.action,
        inputFingerprint: fingerprint,
        currentStateFingerprint: plan.currentStateFingerprint,
        expectedStateFingerprint: plan.expectedStateFingerprint,
        complete: plan.action === "unchanged"
      }));
      return plan;
    }

    if (plan.profileInsertCount === 1) {
      const result = await client.query(
        `insert into public.profiles
           (id, email, display_name, initials, role, active, team, bio)
         values ($1, $2, $3, null, $4, true, null, null)`,
        [
          plan.profile.id,
          plan.profile.email,
          plan.profile.display_name,
          plan.profile.role
        ]
      );
      if (result.rowCount !== 1) {
        throw new SafeCliError("Das gepinnte neue Gastprofil wurde nicht exakt einmal angelegt.");
      }
    }
    if (plan.bindingInsertCount === 1) {
      const result = await client.query(
        `insert into public.identity_bindings
           (issuer, subject, profile_id, active, access_scope, scope_ref)
         values ($1, $2, $3, true, 'test_only', $4)`,
        [
          plan.binding.issuer,
          plan.binding.subject,
          plan.binding.profile_id,
          plan.binding.scope_ref
        ]
      );
      if (result.rowCount !== 1) {
        throw new SafeCliError("Das neue test_only-Sollbinding wurde nicht exakt einmal angelegt.");
      }
    }

    const finalState = await readRelevantState(client, document);
    const finalPlan = buildIdentityPlatformGuestProfileCreationPlan(
      document,
      finalState.profiles,
      finalState.bindings,
      finalState.requests
    );
    if (
      finalPlan.action !== "unchanged"
      || finalPlan.currentStateFingerprint !== plan.expectedStateFingerprint
    ) {
      throw new SafeCliError(
        "Die transaktionale Abschlusskontrolle der atomaren Gastprofil-und-Binding-Anlage "
        + "ist fehlgeschlagen."
      );
    }
    assertVerifiedEvidence(await verifyIdentity(), document);

    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      transactionOpen = false;
      throw new GuestAccessProfileCreationCommitOutcomeUnknownError(
        fingerprint,
        plan.expectedStateFingerprint
      );
    }
    transactionOpen = false;
    log(formatIdentityPlatformGuestProfileCreationResult({
      applied: true,
      action: plan.action === "unchanged"
        ? "unchanged"
        : "create_profile_and_binding_completed",
      inputFingerprint: fingerprint,
      currentStateFingerprint: finalPlan.currentStateFingerprint,
      expectedStateFingerprint: plan.expectedStateFingerprint,
      complete: true
    }));
    return finalPlan;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await client.query("rollback").catch(() => {});
    }
    throw error;
  }
}

export async function executeIdentityPlatformGuestRevocationTransaction({
  client,
  document: documentValue,
  fingerprint,
  apply,
  confirmedCurrentStateFingerprint = "",
  expectedDatabase = "",
  verifyIdentity,
  log = console.log
}) {
  const document = validateIdentityPlatformGuestAccessDocument(documentValue);
  if (identityPlatformGuestAccessFingerprint(document) !== fingerprint) {
    throw new SafeCliError("Der Gastzugriffs-Fingerprint entspricht nicht dem Eingabedokument.");
  }
  if (typeof verifyIdentity !== "function") {
    throw new SafeCliError("Der administrative Identity-Platform-Readback fehlt.");
  }

  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await assumeAccessAdministrationRole(client);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    const databaseResult = await client.query("select current_database() as database_name");
    if (apply && databaseResult.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname entspricht nicht --confirm-database.");
    }
    await checkAccessPrivileges(client);

    assertVerifiedEvidence(await verifyIdentity(), document);
    const current = await readRelevantState(client, document);
    const plan = buildIdentityPlatformGuestRevocationPlan(
      document,
      current.profiles,
      current.bindings,
      current.requests
    );
    if (apply && confirmedCurrentStateFingerprint !== plan.currentStateFingerprint) {
      throw new SafeCliError(
        "Der aktuelle Gastzugriffs-Zustand entspricht nicht dem bestaetigten "
        + "current_state_fingerprint aus dem Widerrufs-Preview."
      );
    }

    if (!apply) {
      await client.query("rollback");
      transactionOpen = false;
      log(formatIdentityPlatformGuestRevocationResult({
        applied: false,
        action: plan.action,
        inputFingerprint: fingerprint,
        currentStateFingerprint: plan.currentStateFingerprint,
        expectedStateFingerprint: plan.expectedStateFingerprint
      }));
      return plan;
    }

    if (plan.bindingUpdateCount === 1) {
      const result = await client.query(
        `update public.identity_bindings
            set active = false
          where issuer = $1
            and subject = $2
            and profile_id = $3
            and active = true
            and access_scope = 'test_only'
            and scope_ref = $4`,
        [
          plan.binding.issuer,
          plan.binding.subject,
          plan.binding.profile_id,
          plan.binding.scope_ref
        ]
      );
      if (result.rowCount !== 1) {
        throw new SafeCliError(
          "Die gepinnte test_only-Bindung wurde konkurrierend veraendert; "
          + "der Widerruf wurde abgebrochen."
        );
      }
    }

    const finalState = await readRelevantState(client, document);
    const finalPlan = buildIdentityPlatformGuestRevocationPlan(
      document,
      finalState.profiles,
      finalState.bindings,
      finalState.requests
    );
    if (
      finalPlan.action !== "unchanged"
      || finalPlan.currentStateFingerprint !== plan.expectedStateFingerprint
    ) {
      throw new SafeCliError(
        "Die transaktionale Abschlusskontrolle des Gastzugriffs-Widerrufs ist fehlgeschlagen."
      );
    }
    assertVerifiedEvidence(await verifyIdentity(), document);

    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      transactionOpen = false;
      throw new GuestAccessRevocationCommitOutcomeUnknownError(
        fingerprint,
        plan.expectedStateFingerprint
      );
    }
    transactionOpen = false;
    log(formatIdentityPlatformGuestRevocationResult({
      applied: true,
      action: plan.action === "unchanged" ? "unchanged" : "disable_binding_completed",
      inputFingerprint: fingerprint,
      currentStateFingerprint: finalPlan.currentStateFingerprint,
      expectedStateFingerprint: plan.expectedStateFingerprint
    }));
    return finalPlan;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await client.query("rollback").catch(() => {});
    }
    throw error;
  }
}

export function usage() {
  return `Administratives Identity-Platform-Passwort-Gast-Pre-Binding

Preview:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json

Apply:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project <project-id> \\
    --confirm-database <database> \\
    --confirm-operation ${GUEST_ACCESS_OPERATION} \\
    --confirm-fingerprint sha256:<preview-input-fingerprint> \\
    --confirm-current-state-fingerprint sha256:<preview-state-fingerprint>

Expliziter Neunutzer-Preview fuer atomare Profil-und-Binding-Anlage:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json \\
    --create-profile-and-prebind

Explizite Neunutzeranlage anwenden:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json \\
    --create-profile-and-prebind \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project <project-id> \\
    --confirm-database <database> \\
    --confirm-operation ${GUEST_ACCESS_CREATE_PROFILE_OPERATION} \\
    --confirm-fingerprint sha256:<preview-input-fingerprint> \\
    --confirm-current-state-fingerprint sha256:<preview-state-fingerprint>

Widerrufs-Preview:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json \\
    --revoke

Widerruf anwenden:
  node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \\
    --input /absolut/owner-only/guest-access.json \\
    --revoke \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project <project-id> \\
    --confirm-database <database> \\
    --confirm-operation ${GUEST_ACCESS_REVOKE_OPERATION} \\
    --confirm-fingerprint sha256:<preview-input-fingerprint> \\
    --confirm-current-state-fingerprint sha256:<preview-state-fingerprint>

Der Operator versendet keine Aktivierungs- oder Reset-Mail. Er liest den bereits
administrativ angelegten password-only Account anhand UID und E-Mail exakt zurueck,
leitet den IAP-Subject selbst ab und legt im Standardmodus ausschliesslich ein aktives
test_only-Binding auf ein bereits vorhandenes, exakt gepinntes Profil an. Nur der
ausdrueckliche --create-profile-and-prebind-Modus darf aus einem vollstaendig leeren
Zielzustand Profil und test_only-Binding atomar anlegen; jeder Teilzustand bricht ab.
Der explizite --revoke-Modus deaktiviert ausschliesslich diese exakt gepinnte
test_only-Bindung. Vollstaendige Wiederholungslaeufe sind jeweils No-ops.
Die Verbindung kommt aus ${DATABASE_URL_ENV}; ${TARGET_FINGERPRINT_ENV} bindet sie
an das gepruefte Ziel. Der kurzlebige Login muss exklusiv
${EXPECTED_ACCESS_ADMIN_ROLE} besitzen.`;
}

function safeError(error) {
  if (error instanceof SafeCliError) return error.message;
  return "Der administrative Gastzugriffs-Operator ist fehlgeschlagen; "
    + "E-Mail, UID, Profil und Subject wurden nicht ausgegeben.";
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  {
    ClientClass = Client,
    authFactory = defaultIdentityPlatformAuth,
    gcpGate = checkPreGematikMigrationGcp,
    proxyFactory = startManagedCloudSqlAuthProxy,
    proxyVerifier = assertManagedCloudSqlProxyMatchesGate
  } = {}
) {
  const options = parseIdentityPlatformGuestAccessArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const configuredRepository = environment[REPOSITORY_ROOT_ENV];
  const root = configuredRepository || repositoryRoot();
  if (!path.isAbsolute(root) || root !== path.normalize(root)) {
    throw new SafeCliError(`${REPOSITORY_ROOT_ENV} muss ein normalisierter absoluter Pfad sein.`);
  }
  const document = await loadProtectedIdentityPlatformGuestAccessDocument(
    options.input,
    { repository: root }
  );
  const fingerprint = identityPlatformGuestAccessFingerprint(document);
  validateIdentityPlatformGuestAccessConfirmations(options, document, fingerprint);

  const connectionString = environment[DATABASE_URL_ENV];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    throw new SafeCliError(`${DATABASE_URL_ENV} fehlt.`);
  }
  validateIdentityTargetFingerprint(connectionString, environment[TARGET_FINGERPRINT_ENV]);

  let auth;
  try {
    auth = await authFactory(document.project_id);
  } catch {
    throw new SafeCliError(
      "Der administrative Identity-Platform-Readback konnte nicht initialisiert werden."
    );
  }
  const verifyIdentity = () => verifyIdentityPlatformPasswordGuest(auth, document);
  const applicationName = options.revoke
    ? "vk-identity-platform-guest-revocation"
    : options.createProfileAndPrebind
      ? "vk-identity-platform-guest-profile-create"
      : "vk-identity-platform-guest-prebinding";
  const useManagedProxy = options.apply
    || environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE !== undefined;
  const gateResult = useManagedProxy
    ? await assertFreshGcpMigrationGate(environment, gcpGate)
    : null;

  let proxy = null;
  let client = null;
  try {
    if (gateResult) {
      try {
        proxy = await proxyFactory({
          gateResult,
          targetDatabaseUrl: connectionString,
          environment
        });
        proxyVerifier(proxy, gateResult);
        client = proxy.createClient(applicationName);
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) throw new SafeCliError(error.message);
        throw error;
      }
    } else {
      client = new ClientClass({
        connectionString,
        application_name: applicationName
      });
    }
    await client.connect();
    if (proxy) {
      const freshGate = await assertFreshGcpMigrationGate(environment, gcpGate);
      proxyVerifier(proxy, freshGate);
    }
    const executeTransaction = options.revoke
      ? executeIdentityPlatformGuestRevocationTransaction
      : options.createProfileAndPrebind
        ? executeIdentityPlatformGuestProfileCreationTransaction
        : executeIdentityPlatformGuestPreBindingTransaction;
    await executeTransaction({
      client,
      document,
      fingerprint,
      apply: options.apply,
      confirmedCurrentStateFingerprint: options.confirmCurrentStateFingerprint,
      expectedDatabase: options.confirmDatabase,
      verifyIdentity
    });
  } finally {
    if (client) await client.end().catch(() => {});
    if (proxy) await proxy.stop().catch(() => {});
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FEHLER: ${safeError(error)}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
