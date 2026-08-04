#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_CONTINUE_URL,
  EXPECTED_ENVIRONMENT,
  IdentityPlatformOnboardingError,
  identityPlatformAccountFingerprint,
  loadProtectedIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  identityPlatformGuestAccessFingerprint,
  loadProtectedIdentityPlatformGuestAccessDocument
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";

export const PASSWORD_INVITATION_OPERATION =
  "PREPARE_PRE_GEMATIK_PASSWORD_INVITATION";
export const PASSWORD_INVITATION_VERSION = "v1";
export const PASSWORD_INVITATION_PURPOSE = "password_invitation";
export const PASSWORD_INVITATION_ACCESS_SCOPE = "test_only";
export const PASSWORD_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
export const PASSWORD_INVITATION_ORIGIN = "https://versorgungs-kompass.de";
export const PASSWORD_INVITATION_PATH = "/konto/passwort-festlegen";

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_INVITATION_OBJECT_BYTES = 8 * 1024;
const MAX_GCS_RESPONSE_BYTES = 128 * 1024;
const GCS_TIMEOUT_MS = 15_000;
const GCS_JSON_ORIGIN = "https://storage.googleapis.com";
const ACCESS_TOKEN_PATTERN = /^[^\s\u0000-\u001f\u007f]{20,16384}$/u;
const BUCKET_PATTERN =
  /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const UID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu;
const PROFILE_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SCOPE_REF_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
const OBJECT_KEYS = Object.freeze([
  "access_scope",
  "accepted_at",
  "account_fingerprint",
  "binding_state_fingerprint",
  "continue_url",
  "email",
  "expires_at",
  "guest_access_fingerprint",
  "prepared_at",
  "profile_id",
  "project_id",
  "purpose",
  "role",
  "scope_ref",
  "status",
  "tenant_id",
  "uid",
  "version"
]);
const EVIDENCE_KEYS = Object.freeze([
  "access_scope_verified",
  "active_binding_count",
  "binding_count",
  "current_state_fingerprint",
  "database_transaction_committed",
  "expected_state_fingerprint",
  "identity_platform_account_verified",
  "input_fingerprint",
  "mode",
  "online_onboarding_gate",
  "operation",
  "profile_binding_complete",
  "profile_count",
  "provider_verified",
  "result",
  "schema_version",
  "subject_namespace_verified"
]);
const ONLINE_ONBOARDING_GATE_KEYS = Object.freeze([
  "automated_backups",
  "gate_fingerprint",
  "gate_policy",
  "latest_successful_automated_backup_end_time",
  "latest_successful_automated_backup_id",
  "point_in_time_recovery",
  "retained_backups",
  "retention_unit",
  "transaction_log_retention_days"
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
  return value;
}

function canonicalTimestamp(value, label) {
  assertText(value, label, 32);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new IdentityPlatformOnboardingError(`${label} ist kein kanonischer UTC-Zeitstempel.`);
  }
  return value;
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

async function loadOwnerOnlyJson(filePath, { label, repository }) {
  if (
    !path.isAbsolute(String(filePath || ""))
    || /[\u0000-\u001f\u007f]/u.test(String(filePath || ""))
  ) {
    throw new IdentityPlatformOnboardingError(`${label} muss ein absoluter Dateipfad sein.`);
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(filePath);
  } catch {
    throw new IdentityPlatformOnboardingError(`${label} fehlt.`);
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(`${label} darf kein Symlink sein.`);
  }
  const [resolved, resolvedRepository] = await Promise.all([
    fs.realpath(filePath),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolved);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_INPUT_BYTES
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      `${label} muss owner-only und ausserhalb des Git-Worktrees liegen.`
    );
  }
  try {
    return JSON.parse(await fs.readFile(resolved, "utf8"));
  } catch {
    throw new IdentityPlatformOnboardingError(`${label} enthaelt kein gueltiges JSON.`);
  }
}

export function validatePasswordInvitationPostApplyEvidence(value, guestFingerprint) {
  assertExactKeys(value, EVIDENCE_KEYS, "Post-Apply-Nachweis");
  assertExactKeys(
    value.online_onboarding_gate,
    ONLINE_ONBOARDING_GATE_KEYS,
    "Post-Apply-Nachweis.online_onboarding_gate"
  );
  const gate = value.online_onboarding_gate;
  if (
    value.schema_version !== 1
    || value.operation !== GUEST_ACCESS_CREATE_PROFILE_OPERATION
    || value.mode !== "PREVIEW"
    || value.result !== "unchanged"
    || value.identity_platform_account_verified !== true
    || value.provider_verified !== "password"
    || value.subject_namespace_verified !== true
    || value.access_scope_verified !== PASSWORD_INVITATION_ACCESS_SCOPE
    || value.profile_count !== 1
    || value.binding_count !== 1
    || value.active_binding_count !== 1
    || value.profile_binding_complete !== true
    || value.database_transaction_committed !== false
    || value.input_fingerprint !== guestFingerprint
    || !FINGERPRINT_PATTERN.test(value.current_state_fingerprint || "")
    || value.current_state_fingerprint !== value.expected_state_fingerprint
    || gate.gate_policy !== "online-guest-onboarding"
    || !FINGERPRINT_PATTERN.test(gate.gate_fingerprint || "")
    || gate.automated_backups !== true
    || gate.point_in_time_recovery !== true
    || !Number.isInteger(gate.transaction_log_retention_days)
    || gate.transaction_log_retention_days < 7
    || !Number.isInteger(gate.retained_backups)
    || gate.retained_backups < 1
    || gate.retention_unit !== "COUNT"
    || !/^[0-9]{1,32}$/u.test(gate.latest_successful_automated_backup_id || "")
  ) {
    throw new IdentityPlatformOnboardingError(
      "Der Post-Apply-Nachweis bestaetigt kein vollstaendiges aktives test_only-Binding."
    );
  }
  canonicalTimestamp(
    gate.latest_successful_automated_backup_end_time,
    "Post-Apply-Nachweis.online_onboarding_gate.latest_successful_automated_backup_end_time"
  );
  return Object.freeze({
    bindingStateFingerprint: value.current_state_fingerprint
  });
}

function validateBoundDocuments(account, guestAccess) {
  if (
    account.project_id !== guestAccess.project_id
    || account.uid !== guestAccess.uid
    || account.email !== guestAccess.email
    || account.display_name !== guestAccess.display_name
  ) {
    throw new IdentityPlatformOnboardingError(
      "Account-, Gastzugriffs- und Scope-Dokument sind nicht exakt gebunden."
    );
  }
}

export function passwordInvitationTokenDigest(token) {
  assertText(token, "Einladungstoken", 43, TOKEN_PATTERN);
  const digest = crypto.createHash("sha256");
  digest.update("versorgungs-kompass-password-invitation-token-v1\0", "utf8");
  digest.update(token, "ascii");
  return digest.digest("hex");
}

export function passwordInvitationLink(token) {
  passwordInvitationTokenDigest(token);
  return `${PASSWORD_INVITATION_ORIGIN}${PASSWORD_INVITATION_PATH}#einladung=${token}`;
}

export function validatePasswordInvitationLink(value) {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || Buffer.byteLength(value, "utf8") > 2048
    || /[\r\n\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die geschuetzte Linkdatei enthaelt keinen gueltigen 48-Stunden-Einladungslink."
    );
  }
  const match = value.match(
    /^https:\/\/versorgungs-kompass\.de\/konto\/passwort-festlegen#einladung=([A-Za-z0-9_-]{43})$/u
  );
  if (!match) {
    throw new IdentityPlatformOnboardingError(
      "Nur der exakte 48-Stunden-Wrapperlink ist als Einladung freigegeben."
    );
  }
  passwordInvitationTokenDigest(match[1]);
  return Object.freeze({ href: value, token: match[1] });
}

export function validatePasswordInvitationRecord(value, { expectedStatus } = {}) {
  assertExactKeys(value, OBJECT_KEYS, "Einladungsobjekt");
  if (
    value.version !== PASSWORD_INVITATION_VERSION
    || value.purpose !== PASSWORD_INVITATION_PURPOSE
    || !["prepared", "active"].includes(value.status)
    || (expectedStatus && value.status !== expectedStatus)
    || !PROJECT_PATTERN.test(value.project_id || "")
    || value.tenant_id !== ""
    || !UID_PATTERN.test(value.uid || "")
    || !EMAIL_PATTERN.test(value.email || "")
    || value.email !== value.email.toLowerCase()
    || value.continue_url !== EXPECTED_CONTINUE_URL
    || !FINGERPRINT_PATTERN.test(value.account_fingerprint || "")
    || !FINGERPRINT_PATTERN.test(value.guest_access_fingerprint || "")
    || !FINGERPRINT_PATTERN.test(value.binding_state_fingerprint || "")
    || !PROFILE_ID_PATTERN.test(value.profile_id || "")
    || !["viewer", "editor"].includes(value.role)
    || value.access_scope !== PASSWORD_INVITATION_ACCESS_SCOPE
    || !SCOPE_REF_PATTERN.test(value.scope_ref || "")
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das Einladungsobjekt entspricht nicht dem gepinnten v1-Vertrag."
    );
  }
  canonicalTimestamp(value.prepared_at, "Einladungsobjekt.prepared_at");
  if (value.status === "prepared") {
    if (value.accepted_at !== null || value.expires_at !== null) {
      throw new IdentityPlatformOnboardingError(
        "Ein vorbereitetes Einladungsobjekt muss zeitlich inert sein."
      );
    }
  } else {
    canonicalTimestamp(value.accepted_at, "Einladungsobjekt.accepted_at");
    canonicalTimestamp(value.expires_at, "Einladungsobjekt.expires_at");
    if (
      new Date(value.expires_at).valueOf() - new Date(value.accepted_at).valueOf()
      !== PASSWORD_INVITATION_TTL_MS
      || new Date(value.accepted_at).valueOf() < new Date(value.prepared_at).valueOf()
    ) {
      throw new IdentityPlatformOnboardingError(
        "Die aktive Einladung besitzt nicht exakt 48 Stunden Gueltigkeit."
      );
    }
  }
  return Object.freeze({ ...value });
}

function invitationRecord({ account, guestAccess, bindingStateFingerprint, preparedAt }) {
  return validatePasswordInvitationRecord({
    version: PASSWORD_INVITATION_VERSION,
    purpose: PASSWORD_INVITATION_PURPOSE,
    status: "prepared",
    project_id: account.project_id,
    tenant_id: "",
    uid: account.uid,
    email: account.email,
    continue_url: account.continue_url,
    prepared_at: canonicalTimestamp(preparedAt, "prepared_at"),
    accepted_at: null,
    expires_at: null,
    account_fingerprint: identityPlatformAccountFingerprint(account),
    guest_access_fingerprint: identityPlatformGuestAccessFingerprint(guestAccess),
    binding_state_fingerprint: bindingStateFingerprint,
    profile_id: guestAccess.profile_id,
    role: guestAccess.role,
    access_scope: PASSWORD_INVITATION_ACCESS_SCOPE,
    scope_ref: guestAccess.scope_ref
  }, { expectedStatus: "prepared" });
}

export function activatePasswordInvitationRecord(preparedRecord, acceptedAt) {
  const prepared = validatePasswordInvitationRecord(
    preparedRecord,
    { expectedStatus: "prepared" }
  );
  const accepted = canonicalTimestamp(acceptedAt, "accepted_at");
  return validatePasswordInvitationRecord({
    ...prepared,
    status: "active",
    accepted_at: accepted,
    expires_at: new Date(
      new Date(accepted).valueOf() + PASSWORD_INVITATION_TTL_MS
    ).toISOString()
  }, { expectedStatus: "active" });
}

function canonicalPreparationInput({ account, guestAccess, bindingStateFingerprint, bucket }) {
  return JSON.stringify({
    account_fingerprint: identityPlatformAccountFingerprint(account),
    binding_state_fingerprint: bindingStateFingerprint,
    bucket,
    guest_access_fingerprint: identityPlatformGuestAccessFingerprint(guestAccess),
    operation: PASSWORD_INVITATION_OPERATION,
    purpose: PASSWORD_INVITATION_PURPOSE,
    version: PASSWORD_INVITATION_VERSION
  });
}

export function passwordInvitationPreparationFingerprint(input) {
  const digest = crypto.createHash("sha256");
  digest.update("versorgungs-kompass-password-invitation-preparation-v1\0", "utf8");
  digest.update(canonicalPreparationInput(input), "utf8");
  return `sha256:${digest.digest("hex")}`;
}

export function validatePasswordInvitationBucket(value) {
  assertText(value, "Einladungs-Bucket", 63, BUCKET_PATTERN);
  if (
    value.startsWith("goog")
    || value.includes("google")
  ) {
    throw new IdentityPlatformOnboardingError("Der Einladungs-Bucket ist ungueltig.");
  }
  return value;
}

function shortLivedGoogleAccessToken(projectId) {
  let token;
  try {
    token = execFileSync(
      "gcloud",
      ["auth", "print-access-token", "--project", projectId, "--quiet"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 20 * 1024
      }
    ).trim();
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Es konnte kein kurzlebiges Google-Storage-Token bezogen werden."
    );
  }
  if (!ACCESS_TOKEN_PATTERN.test(token)) {
    throw new IdentityPlatformOnboardingError(
      "Das kurzlebige Google-Storage-Token ist ungueltig."
    );
  }
  return token;
}

function objectName(status, digest) {
  if (!DIGEST_PATTERN.test(digest) || !["prepared", "active"].includes(status)) {
    throw new IdentityPlatformOnboardingError("Der Einladungsobjektname ist ungueltig.");
  }
  return `${status}/${digest}.json`;
}

async function boundedResponseText(response) {
  const declaredLength = Number(response?.headers?.get?.("content-length") || "0");
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_GCS_RESPONSE_BYTES
  ) {
    throw new IdentityPlatformOnboardingError("Google Storage lieferte eine zu grosse Antwort.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_GCS_RESPONSE_BYTES) {
    throw new IdentityPlatformOnboardingError("Google Storage lieferte eine zu grosse Antwort.");
  }
  return text;
}

function validateObjectMetadata(value, { bucket, name }) {
  if (
    !isPlainObject(value)
    || value.bucket !== bucket
    || value.name !== name
    || !/^[1-9][0-9]{0,30}$/u.test(String(value.generation || ""))
    || String(value.size || "") === ""
    || !/^[0-9]{1,20}$/u.test(String(value.size))
    || Number(value.size) <= 0
    || Number(value.size) > MAX_INVITATION_OBJECT_BYTES
    || value.contentType !== "application/json"
  ) {
    throw new IdentityPlatformOnboardingError(
      "Google Storage bestaetigte das Einladungsobjekt nicht generationengenau."
    );
  }
  return Object.freeze({
    bucket,
    name,
    generation: String(value.generation),
    size: Number(value.size)
  });
}

export function createPasswordInvitationGcsStore({
  bucket,
  projectId,
  fetchImpl = globalThis.fetch,
  accessTokenProvider = shortLivedGoogleAccessToken
}) {
  const safeBucket = validatePasswordInvitationBucket(bucket);
  assertText(projectId, "project_id", 30, PROJECT_PATTERN);
  if (typeof fetchImpl !== "function" || typeof accessTokenProvider !== "function") {
    throw new IdentityPlatformOnboardingError(
      "Der Google-Storage-Zugriff ist nicht sicher konfiguriert."
    );
  }

  async function request(url, init, { expectedStatuses, json = true } = {}) {
    const accessToken = accessTokenProvider(projectId);
    if (!ACCESS_TOKEN_PATTERN.test(String(accessToken || ""))) {
      throw new IdentityPlatformOnboardingError(
        "Das kurzlebige Google-Storage-Token ist ungueltig."
      );
    }
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init?.headers || {})
        },
        redirect: "error",
        signal: AbortSignal.timeout(GCS_TIMEOUT_MS)
      });
    } catch {
      throw new IdentityPlatformOnboardingError(
        "Der generationengepinnte Google-Storage-Zugriff ist fehlgeschlagen."
      );
    }
    const text = await boundedResponseText(response);
    if (!expectedStatuses.includes(response.status)) {
      throw new IdentityPlatformOnboardingError(
        "Google Storage lehnte die create-only oder generationengepinnte Operation ab."
      );
    }
    if (!json) return text;
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new IdentityPlatformOnboardingError(
        "Google Storage lieferte keine gueltige JSON-Antwort."
      );
    }
  }

  function metadataUrl(name) {
    return `${GCS_JSON_ORIGIN}/storage/v1/b/${encodeURIComponent(safeBucket)}`
      + `/o/${encodeURIComponent(name)}`;
  }

  async function uploadCreateOnly(status, digest, record) {
    const name = objectName(status, digest);
    const body = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(body, "utf8") > MAX_INVITATION_OBJECT_BYTES) {
      throw new IdentityPlatformOnboardingError("Das Einladungsobjekt ist zu gross.");
    }
    const endpoint = new URL(
      `/upload/storage/v1/b/${encodeURIComponent(safeBucket)}/o`,
      GCS_JSON_ORIGIN
    );
    endpoint.searchParams.set("uploadType", "media");
    endpoint.searchParams.set("name", name);
    endpoint.searchParams.set("ifGenerationMatch", "0");
    const metadata = await request(endpoint.href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    }, { expectedStatuses: [200] });
    return validateObjectMetadata(metadata, { bucket: safeBucket, name });
  }

  async function readPrepared(digest) {
    const name = objectName("prepared", digest);
    const metadataValue = await request(metadataUrl(name), {
      method: "GET"
    }, { expectedStatuses: [200] });
    const metadata = validateObjectMetadata(
      metadataValue,
      { bucket: safeBucket, name }
    );
    const endpoint = new URL(metadataUrl(name));
    endpoint.searchParams.set("alt", "media");
    endpoint.searchParams.set("generation", metadata.generation);
    const raw = await request(endpoint.href, {
      method: "GET"
    }, { expectedStatuses: [200], json: false });
    if (Buffer.byteLength(raw, "utf8") > MAX_INVITATION_OBJECT_BYTES) {
      throw new IdentityPlatformOnboardingError(
        "Das vorbereitete Einladungsobjekt ueberschreitet 8 KiB."
      );
    }
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      throw new IdentityPlatformOnboardingError(
        "Das vorbereitete Einladungsobjekt enthaelt kein gueltiges JSON."
      );
    }
    return Object.freeze({
      digest,
      generation: metadata.generation,
      record: validatePasswordInvitationRecord(record, { expectedStatus: "prepared" })
    });
  }

  async function deletePrepared(digest, generation) {
    if (!/^[1-9][0-9]{0,30}$/u.test(String(generation || ""))) {
      throw new IdentityPlatformOnboardingError("Die vorbereitete Generation ist ungueltig.");
    }
    const endpoint = new URL(metadataUrl(objectName("prepared", digest)));
    endpoint.searchParams.set("ifGenerationMatch", String(generation));
    await request(endpoint.href, { method: "DELETE" }, {
      expectedStatuses: [204],
      json: false
    });
  }

  return Object.freeze({
    bucket: safeBucket,
    createPrepared: (digest, record) => uploadCreateOnly("prepared", digest, record),
    readPrepared,
    createActive: (digest, record) => uploadCreateOnly("active", digest, record),
    deletePrepared
  });
}

function recordMatchesAccount(record, account) {
  return record.project_id === account.project_id
    && record.uid === account.uid
    && record.email === account.email
    && record.continue_url === account.continue_url
    && record.account_fingerprint === identityPlatformAccountFingerprint(account);
}

export async function readBoundPreparedPasswordInvitation({
  actionUrl,
  account,
  store
}) {
  const { token } = validatePasswordInvitationLink(actionUrl);
  if (!store || typeof store.readPrepared !== "function") {
    throw new IdentityPlatformOnboardingError("Der Einladungs-Store ist nicht konfiguriert.");
  }
  const digest = passwordInvitationTokenDigest(token);
  const prepared = await store.readPrepared(digest);
  if (
    prepared.digest !== digest
    || !/^[1-9][0-9]{0,30}$/u.test(String(prepared.generation || ""))
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die vorbereitete Einladung wurde nicht generationengenau gelesen."
    );
  }
  const record = validatePasswordInvitationRecord(
    prepared.record,
    { expectedStatus: "prepared" }
  );
  if (!recordMatchesAccount(record, account)) {
    throw new IdentityPlatformOnboardingError(
      "Die vorbereitete Einladung gehoert nicht zum geschuetzten Gastkonto."
    );
  }
  return Object.freeze({ digest, generation: String(prepared.generation), record });
}

export async function activatePreparedPasswordInvitation({
  prepared,
  acceptedAt,
  store
}) {
  if (
    !prepared
    || !DIGEST_PATTERN.test(String(prepared.digest || ""))
    || !/^[1-9][0-9]{0,30}$/u.test(String(prepared.generation || ""))
    || !store
    || typeof store.createActive !== "function"
    || typeof store.deletePrepared !== "function"
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die Aktivierung der vorbereiteten Einladung ist nicht sicher gebunden."
    );
  }
  const activeRecord = activatePasswordInvitationRecord(
    prepared.record,
    acceptedAt
  );
  const activeMetadata = await store.createActive(prepared.digest, activeRecord);
  if (
    activeMetadata.name !== objectName("active", prepared.digest)
    || !/^[1-9][0-9]{0,30}$/u.test(String(activeMetadata.generation || ""))
  ) {
    throw new IdentityPlatformOnboardingError(
      "Die aktive Einladung wurde nicht create-only bestaetigt."
    );
  }
  await store.deletePrepared(prepared.digest, prepared.generation);
  return Object.freeze({
    digest: prepared.digest,
    generation: String(activeMetadata.generation),
    record: activeRecord
  });
}

async function protectedCreateOnlyOutputPath(outputPath, repository) {
  if (
    !path.isAbsolute(String(outputPath || ""))
    || /[\u0000-\u001f\u007f]/u.test(String(outputPath || ""))
  ) {
    throw new IdentityPlatformOnboardingError(
      "--output muss ein absoluter geschuetzter Dateipfad sein."
    );
  }
  const requested = path.resolve(outputPath);
  const parent = path.dirname(requested);
  let parentLinkMetadata;
  try {
    parentLinkMetadata = await fs.lstat(parent);
  } catch {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Ausgabeverzeichnis existiert nicht."
    );
  }
  if (parentLinkMetadata.isSymbolicLink()) {
    throw new IdentityPlatformOnboardingError(
      "Das geschuetzte Ausgabeverzeichnis darf kein Symlink sein."
    );
  }
  const [resolvedParent, resolvedRepository] = await Promise.all([
    fs.realpath(parent),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolvedParent);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolvedParent, resolvedRepository)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Das Ausgabeverzeichnis muss owner-only und ausserhalb des Git-Worktrees liegen."
    );
  }
  const resolvedOutput = path.join(resolvedParent, path.basename(requested));
  try {
    await fs.lstat(resolvedOutput);
    throw new IdentityPlatformOnboardingError(
      "Die 48-Stunden-Linkdatei existiert bereits; nichts wurde ueberschrieben."
    );
  } catch (error) {
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    if (error?.code !== "ENOENT") {
      throw new IdentityPlatformOnboardingError(
        "Die 48-Stunden-Linkdatei konnte nicht create-only geprueft werden."
      );
    }
  }
  return resolvedOutput;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new IdentityPlatformOnboardingError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parsePasswordInvitationArguments(argv) {
  const options = {
    help: false,
    apply: false,
    accountInput: "",
    guestAccessInput: "",
    postApplyEvidence: "",
    bucket: "",
    output: "",
    confirmEnvironment: "",
    confirmProject: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--account-input", "accountInput"],
    ["--guest-access-input", "guestAccessInput"],
    ["--post-apply-evidence", "postApplyEvidence"],
    ["--bucket", "bucket"],
    ["--output", "output"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-project", "confirmProject"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
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

function validatePreparationArguments(options, account, fingerprint) {
  for (const required of [
    "accountInput",
    "guestAccessInput",
    "postApplyEvidence",
    "bucket"
  ]) {
    if (!options[required]) {
      throw new IdentityPlatformOnboardingError(
        "Account-, Gastzugriffs-, Post-Apply- oder Bucket-Angabe fehlt."
      );
    }
  }
  validatePasswordInvitationBucket(options.bucket);
  if (!options.apply) {
    if (
      options.output
      || options.confirmEnvironment
      || options.confirmProject
      || options.confirmOperation
      || options.confirmFingerprint
    ) {
      throw new IdentityPlatformOnboardingError(
        "Output- und Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt."
      );
    }
    return;
  }
  if (
    !options.output
    || options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || options.confirmProject !== account.project_id
    || options.confirmOperation !== PASSWORD_INVITATION_OPERATION
    || options.confirmFingerprint !== fingerprint
    || !FINGERPRINT_PATTERN.test(options.confirmFingerprint)
  ) {
    throw new IdentityPlatformOnboardingError(
      "Apply-Bestaetigungen fuer Umgebung, Projekt, Operation, Fingerprint oder Output fehlen."
    );
  }
}

function safeSummary({ apply, fingerprint, prepared = false, linkWritten = false }) {
  return [
    "schema_version=1",
    `operation=${PASSWORD_INVITATION_OPERATION}`,
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `prepared_object_created=${prepared}`,
    `link_written=${linkWritten}`,
    `input_fingerprint=${fingerprint}`
  ].join("\n");
}

export async function executePasswordInvitationPreparation({
  account,
  guestAccess,
  bindingStateFingerprint,
  options,
  store,
  repository = repositoryRoot(),
  now = () => new Date(),
  tokenFactory = () => crypto.randomBytes(32).toString("base64url"),
  log = console.log
}) {
  validateBoundDocuments(account, guestAccess);
  assertText(
    bindingStateFingerprint,
    "binding_state_fingerprint",
    71,
    FINGERPRINT_PATTERN
  );
  const fingerprint = passwordInvitationPreparationFingerprint({
    account,
    guestAccess,
    bindingStateFingerprint,
    bucket: options.bucket
  });
  validatePreparationArguments(options, account, fingerprint);
  if (!options.apply) {
    log(safeSummary({ apply: false, fingerprint }));
    return Object.freeze({ applied: false, fingerprint });
  }
  if (!store || typeof store.createPrepared !== "function") {
    throw new IdentityPlatformOnboardingError("Der Einladungs-Store ist nicht konfiguriert.");
  }
  const outputPath = await protectedCreateOnlyOutputPath(options.output, repository);
  const token = tokenFactory();
  if (!TOKEN_PATTERN.test(String(token || ""))) {
    throw new IdentityPlatformOnboardingError(
      "Die kryptografische Erzeugung des Einladungstokens ist fehlgeschlagen."
    );
  }
  const digest = passwordInvitationTokenDigest(token);
  const preparedAt = now();
  if (!(preparedAt instanceof Date) || Number.isNaN(preparedAt.valueOf())) {
    throw new IdentityPlatformOnboardingError("Die Vorbereitungszeit ist ungueltig.");
  }
  const record = invitationRecord({
    account,
    guestAccess,
    bindingStateFingerprint,
    preparedAt: preparedAt.toISOString()
  });
  let preparedCreated = false;
  try {
    const metadata = await store.createPrepared(digest, record);
    if (
      metadata.name !== objectName("prepared", digest)
      || !/^[1-9][0-9]{0,30}$/u.test(String(metadata.generation || ""))
    ) {
      throw new IdentityPlatformOnboardingError(
        "Die vorbereitete Einladung wurde nicht create-only bestaetigt."
      );
    }
    preparedCreated = true;
    const handle = await fs.open(outputPath, "wx", 0o600);
    try {
      await handle.writeFile(`${passwordInvitationLink(token)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    log(safeSummary({
      apply: true,
      fingerprint,
      prepared: true,
      linkWritten: true
    }));
    return Object.freeze({ applied: true, fingerprint, prepared: true, linkWritten: true });
  } catch (error) {
    if (preparedCreated) {
      throw new IdentityPlatformOnboardingError(
        "Die Einladung wurde inert vorbereitet, aber die owner-only Linkdatei fehlt. "
        + "Nicht erneut vorbereiten; das prepared-Objekt generationengenau abgleichen.",
        1
      );
    }
    if (error instanceof IdentityPlatformOnboardingError) throw error;
    throw new IdentityPlatformOnboardingError(
      "Die 48-Stunden-Einladung konnte nicht sicher vorbereitet werden."
    );
  }
}

export function usage() {
  return `Inerte 48-Stunden-Passworteinladung fuer einen gebundenen pre-gematik Gast

Preview:
  node scripts/provision_pre_gematik_password_invitation.mjs \\
    --account-input /absolut/owner-only/account.json \\
    --guest-access-input /absolut/owner-only/guest-access.json \\
    --post-apply-evidence /absolut/owner-only/guest-post-preview.log \\
    --bucket PRIVATE_INVITATION_BUCKET

Create-only vorbereiten:
  zusaetzlich --output /absolut/owner-only/password-invitation-link.txt \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project PROJECT_ID \\
    --confirm-operation ${PASSWORD_INVITATION_OPERATION} \\
    --confirm-fingerprint sha256:<preview-fingerprint>

Der Operator schreibt niemals Token, E-Mail oder UID auf stdout. Das Token wird
als owner-only Wrapperlink ausgegeben; Google Storage erhaelt nur den
domain-separierten SHA-256-Digest. Das prepared-Objekt bleibt bis zu einer
erfolgreichen SMTP-250-Annahme inert.`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parsePasswordInvitationArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const repository = repositoryRoot();
  const [account, guestAccess, evidenceValue] = await Promise.all([
    loadProtectedIdentityPlatformAccountDocument(
      options.accountInput,
      { repository }
    ),
    loadProtectedIdentityPlatformGuestAccessDocument(
      options.guestAccessInput,
      { repository }
    ),
    loadOwnerOnlyJson(options.postApplyEvidence, {
      label: "Der geschuetzte Post-Apply-Nachweis",
      repository
    })
  ]);
  validateBoundDocuments(account, guestAccess);
  const guestFingerprint = identityPlatformGuestAccessFingerprint(guestAccess);
  const { bindingStateFingerprint } =
    validatePasswordInvitationPostApplyEvidence(evidenceValue, guestFingerprint);
  const store = options.apply
    ? createPasswordInvitationGcsStore({
      bucket: options.bucket,
      projectId: account.project_id
    })
    : null;
  await executePasswordInvitationPreparation({
    account,
    guestAccess,
    bindingStateFingerprint,
    options,
    store,
    repository
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof IdentityPlatformOnboardingError
      ? error.message
      : "Der 48-Stunden-Einladungsoperator ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode =
      error instanceof IdentityPlatformOnboardingError ? error.exitCode : 1;
  });
}
