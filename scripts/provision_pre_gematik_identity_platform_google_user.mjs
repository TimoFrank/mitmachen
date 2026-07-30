#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  IdentityPlatformOnboardingError,
  defaultIdentityPlatformAuth
} from "./provision_pre_gematik_identity_platform_account.mjs";

export const EXPECTED_ENVIRONMENT = "pre-gematik";
export const GOOGLE_PROVIDER_ID = "google.com";
export const GOOGLE_IMPORT_OPERATION =
  "IMPORT_PRE_GEMATIK_IDENTITY_PLATFORM_GOOGLE_USER";

const MAX_INPUT_BYTES = 64 * 1024;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const LOCAL_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const GOOGLE_PROVIDER_UID_PATTERN = /^[0-9]{6,255}$/u;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze([
  "project_id",
  "local_id",
  "email",
  "display_name",
  "google_provider_uid",
  "email_ownership_verified"
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new IdentityPlatformOnboardingError(`${label} muss ein JSON-Objekt sein.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new IdentityPlatformOnboardingError(
      `${label} enthaelt fehlende oder nicht freigegebene Felder.`
    );
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
    throw new IdentityPlatformOnboardingError(`${label} ist ungueltig.`);
  }
}

export function validateGoogleUserImportDocument(value) {
  assertExactKeys(value, INPUT_KEYS, "Eingabedokument");
  assertText(value.project_id, "Eingabedokument.project_id", 30, PROJECT_PATTERN);
  assertText(value.local_id, "Eingabedokument.local_id", 128, LOCAL_ID_PATTERN);
  assertText(value.email, "Eingabedokument.email", 256, EMAIL_PATTERN);
  if (value.email !== value.email.toLowerCase()) {
    throw new IdentityPlatformOnboardingError(
      "Eingabedokument.email muss bereits kanonisch kleingeschrieben sein."
    );
  }
  assertText(value.display_name, "Eingabedokument.display_name", 128);
  assertText(
    value.google_provider_uid,
    "Eingabedokument.google_provider_uid",
    255,
    GOOGLE_PROVIDER_UID_PATTERN
  );
  if (value.email_ownership_verified !== true) {
    throw new IdentityPlatformOnboardingError(
      "Die unabhaengige E-Mail-Inhaberschaft muss vor dem Google-Import bestaetigt sein."
    );
  }
  return Object.freeze({
    project_id: value.project_id,
    local_id: value.local_id,
    email: value.email,
    display_name: value.display_name,
    google_provider_uid: value.google_provider_uid,
    email_ownership_verified: true
  });
}

function canonicalDocument(document) {
  return JSON.stringify({
    display_name: document.display_name,
    email: document.email,
    email_ownership_verified: document.email_ownership_verified,
    google_provider_uid: document.google_provider_uid,
    local_id: document.local_id,
    project_id: document.project_id
  });
}

function sha256Fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function googleUserImportFingerprint(document) {
  return sha256Fingerprint(canonicalDocument(validateGoogleUserImportDocument(document)));
}

function repositoryRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Der Git-Worktree konnte nicht sicher bestimmt werden."
    );
  }
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

export async function loadProtectedGoogleUserImportDocument(
  inputPath,
  { repository = repositoryRoot() } = {}
) {
  if (!path.isAbsolute(String(inputPath || ""))) {
    throw new IdentityPlatformOnboardingError(
      "--input muss ein absoluter geschuetzter Dateipfad sein."
    );
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(inputPath);
  } catch {
    throw new IdentityPlatformOnboardingError("Das geschuetzte Eingabedokument fehlt.");
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Eingabedokument darf kein Symlink sein."
    );
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
    throw new IdentityPlatformOnboardingError(
      "Das Eingabedokument muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  try {
    return validateGoogleUserImportDocument(
      JSON.parse(await fs.readFile(resolved, "utf8"))
    );
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Eingabedokument enthaelt kein gueltiges JSON."
    );
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new IdentityPlatformOnboardingError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseGoogleUserImportArguments(argv) {
  const options = {
    help: false,
    apply: false,
    input: "",
    confirmEnvironment: "",
    confirmProject: "",
    confirmOperation: "",
    confirmFingerprint: "",
    confirmCurrentStateFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-project", "confirmProject"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"],
    ["--confirm-current-state-fingerprint", "confirmCurrentStateFingerprint"]
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const canonicalArgument = argument === "-h" ? "--help" : argument;
    if (seen.has(canonicalArgument)) {
      throw new IdentityPlatformOnboardingError(
        "Kommandozeilenoptionen duerfen nicht mehrfach angegeben werden."
      );
    }
    seen.add(canonicalArgument);
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new IdentityPlatformOnboardingError(
        "Unbekannte oder unvollstaendige Kommandozeilenoption."
      );
    }
  }
  return Object.freeze(options);
}

export function validateGoogleUserImportConfirmations(
  options,
  document,
  fingerprint,
  currentStateFingerprint
) {
  if (!options.apply) {
    if (
      options.confirmEnvironment
      || options.confirmProject
      || options.confirmOperation
      || options.confirmFingerprint
      || options.confirmCurrentStateFingerprint
    ) {
      throw new IdentityPlatformOnboardingError(
        "Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt."
      );
    }
    return;
  }
  if (
    options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || options.confirmProject !== document.project_id
    || options.confirmOperation !== GOOGLE_IMPORT_OPERATION
    || options.confirmFingerprint !== fingerprint
    || options.confirmCurrentStateFingerprint !== currentStateFingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
    || !FINGERPRINT_PATTERN.test(options.confirmCurrentStateFingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Apply-Bestaetigungen fuer Projekt, Operation, Eingabe- oder Istzustands-Fingerprint fehlen."
    );
  }
}

function userNotFound(error) {
  return ["auth/user-not-found", "USER_NOT_FOUND"].includes(String(error?.code || ""));
}

async function lookupUser(auth, method, values) {
  try {
    const user = await auth[method](...values);
    if (!isPlainObject(user)) {
      throw new Error("invalid admin readback");
    }
    return user;
  } catch (error) {
    if (userNotFound(error)) return null;
    throw new IdentityPlatformOnboardingError(
      "Der Identity-Platform-Istzustand konnte nicht sicher gelesen werden."
    );
  }
}

function canonicalProvider(provider) {
  return {
    provider_id: String(provider?.providerId || ""),
    raw_id: String(provider?.rawId || ""),
    federated_id: String(provider?.federatedId || ""),
    email: String(provider?.email || ""),
    display_name: String(provider?.displayName || ""),
    phone_number_present: Boolean(provider?.phoneNumber)
  };
}

function canonicalUser(user) {
  if (!user) return null;
  return {
    local_id: String(user.uid || ""),
    email: String(user.email || ""),
    display_name: String(user.displayName || ""),
    email_verified: user.emailVerified === true,
    disabled: user.disabled === true,
    provider_ids: [...(Array.isArray(user.providerIds) ? user.providerIds : [])].sort(),
    providers: (Array.isArray(user.providers) ? user.providers : [])
      .map(canonicalProvider)
      .sort((left, right) => (
        `${left.provider_id}\u0000${left.raw_id}`.localeCompare(
          `${right.provider_id}\u0000${right.raw_id}`
        )
      )),
    has_password_credential: user.hasPasswordCredential === true,
    phone_number_present: Boolean(user.phoneNumber),
    email_link_signin: user.emailLinkSignin === true,
    custom_auth: user.customAuth === true,
    custom_attributes_present: user.hasCustomAttributes === true,
    mfa_enrollment_present: user.hasMfaEnrollment === true,
    tenant_id: String(user.tenantId || ""),
    initial_email: String(user.initialEmail || "")
  };
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function exactGoogleUser(user, document) {
  const canonical = canonicalUser(user);
  if (!canonical) return false;
  if (
    canonical.local_id !== document.local_id
    || canonical.email !== document.email
    || canonical.display_name !== document.display_name
    || canonical.email_verified !== true
    || canonical.disabled
    || !sameArray(canonical.provider_ids, [GOOGLE_PROVIDER_ID])
    || canonical.providers.length !== 1
    || canonical.has_password_credential
    || canonical.phone_number_present
    || canonical.email_link_signin
    || canonical.custom_auth
    || canonical.custom_attributes_present
    || canonical.mfa_enrollment_present
    || canonical.tenant_id
    || (canonical.initial_email && canonical.initial_email !== document.email)
  ) {
    return false;
  }
  const provider = canonical.providers[0];
  const allowedFederatedIds = new Set([
    "",
    document.google_provider_uid,
    `https://accounts.google.com/${document.google_provider_uid}`
  ]);
  return provider.provider_id === GOOGLE_PROVIDER_ID
    && provider.raw_id === document.google_provider_uid
    && allowedFederatedIds.has(provider.federated_id)
    && provider.email === document.email
    && provider.display_name === document.display_name
    && !provider.phone_number_present;
}

function currentStateFingerprint(readback) {
  return sha256Fingerprint(JSON.stringify({
    by_email: canonicalUser(readback.byEmail),
    by_local_id: canonicalUser(readback.byLocalId),
    by_provider_uid: canonicalUser(readback.byProviderUid)
  }));
}

export async function inspectGoogleUserImportState(auth, document) {
  const expectedDocument = validateGoogleUserImportDocument(document);
  if (
    typeof auth?.getUser !== "function"
    || typeof auth?.getUserByEmail !== "function"
    || typeof auth?.getUserByProviderUid !== "function"
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Identity-Platform-Admin-Client besitzt nicht alle getrennten Readback-Funktionen."
    );
  }
  const [byLocalId, byEmail, byProviderUid] = await Promise.all([
    lookupUser(auth, "getUser", [expectedDocument.local_id]),
    lookupUser(auth, "getUserByEmail", [expectedDocument.email]),
    lookupUser(auth, "getUserByProviderUid", [
      GOOGLE_PROVIDER_ID,
      expectedDocument.google_provider_uid
    ])
  ]);
  const readback = Object.freeze({ byLocalId, byEmail, byProviderUid });
  const stateFingerprint = currentStateFingerprint(readback);
  if (!byLocalId && !byEmail && !byProviderUid) {
    return Object.freeze({
      targetState: "absent",
      currentStateFingerprint: stateFingerprint
    });
  }
  if (
    !byLocalId
    || !byEmail
    || !byProviderUid
    || String(byLocalId.uid || "") !== String(byEmail.uid || "")
    || String(byLocalId.uid || "") !== String(byProviderUid.uid || "")
    || !exactGoogleUser(byLocalId, expectedDocument)
    || !exactGoogleUser(byEmail, expectedDocument)
    || !exactGoogleUser(byProviderUid, expectedDocument)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Local-ID, E-Mail oder Google-Provider-UID kollidieren oder bilden einen Teilzustand."
    );
  }
  return Object.freeze({
    targetState: "exact-existing",
    currentStateFingerprint: stateFingerprint
  });
}

export function buildGoogleUserImportRecord(document) {
  const expectedDocument = validateGoogleUserImportDocument(document);
  return Object.freeze({
    localId: expectedDocument.local_id,
    email: expectedDocument.email,
    emailVerified: true,
    displayName: expectedDocument.display_name,
    disabled: false,
    providerUserInfo: Object.freeze([
      Object.freeze({
        providerId: GOOGLE_PROVIDER_ID,
        rawId: expectedDocument.google_provider_uid,
        email: expectedDocument.email,
        displayName: expectedDocument.display_name
      })
    ])
  });
}

function safeSummary({
  apply,
  targetState,
  imported,
  fingerprint,
  currentStateFingerprint
}) {
  return [
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    "operation=google-user-import-create-only",
    `target_state=${targetState}`,
    `import_performed=${imported}`,
    "account_count=1",
    `input_fingerprint=${fingerprint}`,
    `current_state_fingerprint=${currentStateFingerprint}`
  ].join(" ");
}

export async function executeGoogleUserImport({
  auth,
  document,
  fingerprint,
  options,
  log = console.log
}) {
  const expectedDocument = validateGoogleUserImportDocument(document);
  const expectedFingerprint = googleUserImportFingerprint(expectedDocument);
  if (fingerprint !== expectedFingerprint) {
    throw new IdentityPlatformOnboardingError(
      "Der Eingabe-Fingerprint stimmt nicht mit dem validierten Dokument ueberein."
    );
  }
  const before = await inspectGoogleUserImportState(auth, expectedDocument);
  validateGoogleUserImportConfirmations(
    options,
    expectedDocument,
    expectedFingerprint,
    before.currentStateFingerprint
  );

  if (before.targetState === "exact-existing") {
    log(safeSummary({
      apply: options.apply,
      targetState: before.targetState,
      imported: false,
      fingerprint: expectedFingerprint,
      currentStateFingerprint: before.currentStateFingerprint
    }));
    return Object.freeze({
      applied: false,
      imported: false,
      noOp: true,
      targetState: "exact-existing",
      currentStateFingerprint: before.currentStateFingerprint
    });
  }

  if (!options.apply) {
    log(safeSummary({
      apply: false,
      targetState: before.targetState,
      imported: false,
      fingerprint: expectedFingerprint,
      currentStateFingerprint: before.currentStateFingerprint
    }));
    return Object.freeze({
      applied: false,
      imported: false,
      noOp: false,
      targetState: "absent",
      currentStateFingerprint: before.currentStateFingerprint
    });
  }

  if (typeof auth?.importGoogleUserCreateOnly !== "function") {
    throw new IdentityPlatformOnboardingError(
      "Der Identity-Platform-Admin-Client besitzt keine create-only Google-Importfunktion."
    );
  }

  try {
    const result = await auth.importGoogleUserCreateOnly(
      buildGoogleUserImportRecord(expectedDocument)
    );
    if (result?.successCount !== 1 || result?.failureCount !== 0) {
      throw new Error("ambiguous import result");
    }
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Der create-only Google-Import wurde abgewiesen oder hat moeglicherweise committed. "
      + "Nicht blind wiederholen; neuen Preview-Istzustand pruefen. Ein exakt vorhandener "
      + "Sollaccount wird beim bestaetigten Rerun als No-op behandelt.",
      1
    );
  }

  let after;
  try {
    after = await inspectGoogleUserImportState(auth, expectedDocument);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Der Google-Import hat moeglicherweise committed, aber der getrennte Admin-Readback "
      + "ist nicht exakt. Keine Reparatur oder Wiederholung ohne neuen Istzustandsabgleich.",
      1
    );
  }
  if (after.targetState !== "exact-existing") {
    throw new IdentityPlatformOnboardingError(
      "Der Google-Import hat keinen exakt bestaetigten Sollzustand erzeugt.",
      1
    );
  }
  log(safeSummary({
    apply: true,
    targetState: after.targetState,
    imported: true,
    fingerprint: expectedFingerprint,
    currentStateFingerprint: after.currentStateFingerprint
  }));
  return Object.freeze({
    applied: true,
    imported: true,
    noOp: false,
    targetState: "exact-existing",
    currentStateFingerprint: after.currentStateFingerprint
  });
}

export function usage() {
  return `Create-only Import genau eines bestehenden Google-Kontos in Identity Platform

Preview:
  node scripts/provision_pre_gematik_identity_platform_google_user.mjs \\
    --input /absolut/owner-only/google-user.json

Apply nach unmittelbar geprueftem Preview:
  node scripts/provision_pre_gematik_identity_platform_google_user.mjs \\
    --input /absolut/owner-only/google-user.json \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project PROJECT_ID \\
    --confirm-operation ${GOOGLE_IMPORT_OPERATION} \\
    --confirm-fingerprint sha256:EINGABE_FINGERPRINT \\
    --confirm-current-state-fingerprint sha256:ISTZUSTAND_FINGERPRINT

Das owner-only Eingabedokument liegt ausserhalb des Git-Worktrees und enthaelt
exakt project_id, local_id, email, display_name, google_provider_uid sowie
email_ownership_verified=true. Der Operator importiert keinen Passwort-,
Telefon-, MFA-, Tenant-, Custom-Claims- oder weiteren Provider-Zugang und
gibt weder Kontodaten, Admin-Token noch API-Key aus.`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseGoogleUserImportArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const document = await loadProtectedGoogleUserImportDocument(options.input);
  const fingerprint = googleUserImportFingerprint(document);
  const auth = await defaultIdentityPlatformAuth(document.project_id);
  await executeGoogleUserImport({
    auth,
    document,
    fingerprint,
    options
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof IdentityPlatformOnboardingError
      ? error.message
      : "Der Identity-Platform-Google-Importoperator ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode = error instanceof IdentityPlatformOnboardingError ? error.exitCode : 1;
  });
}
