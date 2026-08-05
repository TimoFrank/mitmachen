import crypto from "node:crypto";
import { isIP } from "node:net";

export const PASSWORD_RESET_BROKER_PATH = "/api/auth/password-reset";
export const PASSWORD_RESET_ACCEPTED_RESPONSE = Object.freeze({ accepted: true });
export const PASSWORD_INVITATION_INVALID_MESSAGE = "Einladungslink ist ungültig oder abgelaufen.";

const IDENTITY_TOOLKIT_ORIGIN = "https://identitytoolkit.googleapis.com";
const STORAGE_API_ORIGIN = "https://storage.googleapis.com";
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const MAX_IDENTITY_RESPONSE_BYTES = 64 * 1024;
const MAX_PASSWORD_INVITATION_BYTES = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RATE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_IP_LIMIT = 60;
const DEFAULT_EMAIL_LIMIT = 5;
const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 10_000;
const DEFAULT_INVITATION_POLL_MS = 50;
const DEFAULT_INVITATION_POLL_LIMIT = 300;
const DEFAULT_INVITATION_MINT_STALE_MS = 60_000;
const PASSWORD_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const PASSWORD_INVITATION_DIGEST_DOMAIN = "versorgungs-kompass-password-invitation-token-v1\0";
const PASSWORD_INVITATION_ACTION_KEY_DOMAIN = "versorgungs-kompass-password-invitation-action-key-v1\0";
const PASSWORD_INVITATION_ACTION_AAD_DOMAIN = "versorgungs-kompass-password-invitation-action-aad-v1\0";
const PASSWORD_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PASSWORD_ACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/u;
const PASSWORD_ACTION_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/u;
const PASSWORD_ACTION_PATH = "/konto/passwort-festlegen";
const FIREBASE_ACTION_PATH = "/__/auth/action";
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PROFILE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SCOPE_REF_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const PASSWORD_INVITATION_KEYS = Object.freeze([
  "accepted_at",
  "access_scope",
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
const PASSWORD_ACTION_PARAMETERS = new Set([
  "apiKey",
  "continueUrl",
  "lang",
  "mode",
  "oobCode"
]);
const ACCOUNT_LOOKUP_PRIVATE_IDENTITY_ERRORS = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_EMAIL",
  "USER_DISABLED",
  "USER_NOT_FOUND"
]);
const PASSWORD_RESET_ACCOUNT_UNAVAILABLE_ERRORS = new Set([
  "EMAIL_NOT_FOUND",
  "USER_DISABLED",
  "USER_NOT_FOUND"
]);
const PASSWORD_INVITATION_METADATA_KEYS = Object.freeze({
  action: "vk_action",
  attempt: "vk_attempt",
  baseline: "vk_password_updated_at",
  claimedAt: "vk_claimed_at",
  completedAt: "vk_completed_at",
  issuedAt: "vk_issued_at",
  state: "vk_state"
});
const PASSWORD_INVITATION_ATTEMPT_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const PASSWORD_INVITATION_BASELINE_PATTERN = /^[1-9][0-9]{0,15}$/u;
const PASSWORD_INVITATION_SEALED_ACTION_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{1,4096}$/u;
const PASSWORD_RESET_ERROR_STAGES = new Set([
  "invitation_claim",
  "invitation_finalize",
  "invitation_issue",
  "invitation_uncertain",
  "oob_request",
  "oob_validate"
]);

export class PasswordResetInfrastructureError extends Error {
  constructor(message = "Der Passwort-Reset-Dienst ist vorübergehend nicht erreichbar.", options = {}) {
    super(message, options);
    this.name = "PasswordResetInfrastructureError";
    this.status = 503;
    this.stage = PASSWORD_RESET_ERROR_STAGES.has(options.stage) ? options.stage : "";
  }
}

export class PasswordInvitationInvalidError extends Error {
  constructor() {
    super(PASSWORD_INVITATION_INVALID_MESSAGE);
    this.name = "PasswordInvitationInvalidError";
    this.status = 400;
  }
}

export class PasswordInvitationRateLimitError extends Error {
  constructor() {
    super("Die Einladung kann vorübergehend nicht verarbeitet werden.");
    this.name = "PasswordInvitationRateLimitError";
    this.status = 429;
  }
}

class IdentityPlatformRequestError extends Error {
  constructor(code, {
    definitiveClientError = false,
    mintOutcome = "",
    ...options
  } = {}) {
    super("Identity Platform hat die Passwort-Reset-Anfrage nicht verarbeitet.", options);
    this.name = "IdentityPlatformRequestError";
    this.code = code;
    this.definitiveClientError = definitiveClientError;
    this.lookupPrivate = ACCOUNT_LOOKUP_PRIVATE_IDENTITY_ERRORS.has(code);
    this.resetAccountUnavailable = PASSWORD_RESET_ACCOUNT_UNAVAILABLE_ERRORS.has(code);
    this.mintOutcome = mintOutcome;
  }
}

class PasswordResetMintError extends PasswordResetInfrastructureError {
  constructor(mintOutcome, stage, cause) {
    super(undefined, { cause, stage });
    this.name = "PasswordResetMintError";
    this.mintOutcome = mintOutcome;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidInvitation() {
  return new PasswordInvitationInvalidError();
}

function exactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value.length !== 24) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) return null;
  return timestamp;
}

function canonicalPasswordInvitationToken(value) {
  if (typeof value !== "string" || !PASSWORD_INVITATION_TOKEN_PATTERN.test(value)) return "";
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value ? value : "";
  } catch {
    return "";
  }
}

export function passwordInvitationObjectName(token) {
  const canonicalToken = canonicalPasswordInvitationToken(token);
  if (!canonicalToken) throw invalidInvitation();
  const digest = crypto
    .createHash("sha256")
    .update(PASSWORD_INVITATION_DIGEST_DOMAIN, "utf8")
    .update(canonicalToken, "ascii")
    .digest("hex");
  return `active/${digest}.json`;
}

export function validateActivePasswordInvitation(value, {
  projectId,
  tenantId = "",
  continueUrl,
  now = Date.now(),
  allowExpired = false
}) {
  const timestamp = Number(now);
  const preparedAt = canonicalIsoTimestamp(value?.prepared_at);
  const acceptedAt = canonicalIsoTimestamp(value?.accepted_at);
  const expiresAt = canonicalIsoTimestamp(value?.expires_at);
  const email = normalizePasswordResetEmail(value?.email);
  if (
    !Number.isFinite(timestamp)
    || !exactKeys(value, PASSWORD_INVITATION_KEYS)
    || value.version !== "v1"
    || value.purpose !== "password_invitation"
    || value.status !== "active"
    || value.project_id !== projectId
    || value.tenant_id !== tenantId
    || value.continue_url !== continueUrl
    || !/^[A-Za-z0-9_-]{8,128}$/u.test(String(value.uid || ""))
    || !email
    || email !== value.email
    || !FINGERPRINT_PATTERN.test(String(value.account_fingerprint || ""))
    || !FINGERPRINT_PATTERN.test(String(value.guest_access_fingerprint || ""))
    || !FINGERPRINT_PATTERN.test(String(value.binding_state_fingerprint || ""))
    || !PROFILE_ID_PATTERN.test(String(value.profile_id || ""))
    || !["viewer", "editor"].includes(value.role)
    || value.access_scope !== "test_only"
    || !SCOPE_REF_PATTERN.test(String(value.scope_ref || ""))
    || preparedAt === null
    || acceptedAt === null
    || expiresAt === null
    || preparedAt > acceptedAt
    || acceptedAt > timestamp
    || expiresAt - acceptedAt !== PASSWORD_INVITATION_TTL_MS
    || (!allowExpired && timestamp >= expiresAt)
  ) {
    throw invalidInvitation();
  }
  return Object.freeze({ ...value });
}

function infrastructureError(cause, stage = "") {
  if (
    cause instanceof PasswordResetInfrastructureError
    && (!stage || cause.stage)
  ) {
    return cause;
  }
  return new PasswordResetInfrastructureError(undefined, { cause, stage });
}

function canonicalHttpsStartUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Die Passwort-Reset-Weiterleitung ist ungültig.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/start"
    || parsed.search
    || parsed.hash
    || parsed.href !== value
  ) {
    throw new TypeError("Die Passwort-Reset-Weiterleitung muss ein kanonischer HTTPS-/start-Pfad sein.");
  }
  return parsed.href;
}

export function normalizePasswordResetEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  const separator = email.indexOf("@");
  if (
    !email
    || email.length >= 256
    || !/^[\x21-\x7e]+$/u.test(email)
    || separator <= 0
    || separator !== email.lastIndexOf("@")
    || separator === email.length - 1
  ) {
    return "";
  }
  return email;
}

export function identityPasswordUpdatedAt(value) {
  const raw = value?.passwordUpdatedAt;
  if (Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw !== "string" || !PASSWORD_INVITATION_BASELINE_PATTERN.test(raw)) return null;
  const timestamp = Number(raw);
  return Number.isSafeInteger(timestamp) && timestamp > 0 && String(timestamp) === raw
    ? timestamp
    : null;
}

function normalizedProviderIds(user) {
  if (user?.providerUserInfo === undefined) return [];
  if (!Array.isArray(user.providerUserInfo)) return null;
  const providerIds = [];
  for (const provider of user.providerUserInfo) {
    if (!isPlainObject(provider) || typeof provider.providerId !== "string") return null;
    const providerId = provider.providerId.trim();
    if (!providerId) return null;
    providerIds.push(providerId);
  }
  return [...new Set(providerIds)].sort();
}

export function exactPasswordOnlyIdentityUser(user, normalizedEmail, tenantId = "") {
  if (!isPlainObject(user)) return null;
  const uid = typeof user.localId === "string" ? user.localId.trim() : "";
  const email = normalizePasswordResetEmail(user.email);
  const providerIds = normalizedProviderIds(user);
  const passwordProvider = Array.isArray(user.providerUserInfo)
    ? user.providerUserInfo.find((provider) => provider?.providerId === "password")
    : null;
  const providerEmail = passwordProvider?.email == null
    ? normalizedEmail
    : normalizePasswordResetEmail(passwordProvider.email);
  const providerRawId = passwordProvider?.rawId == null
    ? normalizedEmail
    : normalizePasswordResetEmail(passwordProvider.rawId);
  const providerFederatedId = passwordProvider?.federatedId == null
    ? normalizedEmail
    : normalizePasswordResetEmail(passwordProvider.federatedId);
  const passwordUpdatedAt = identityPasswordUpdatedAt(user);
  const hasPasswordEvidence = (
    (typeof user.passwordHash === "string" && user.passwordHash.length > 0)
    || (typeof user.passwordSalt === "string" && user.passwordSalt.length > 0)
    || (typeof user.password === "string" && user.password.length > 0)
    || (typeof user.salt === "string" && user.salt.length > 0)
    || (typeof user.rawPassword === "string" && user.rawPassword.length > 0)
    || (Number.isInteger(user.version) && user.version > 0)
    || passwordUpdatedAt !== null
    || providerIds?.includes("password")
  );
  const effectiveProviderIds = providerIds ? new Set(providerIds) : null;
  if (hasPasswordEvidence) effectiveProviderIds?.add("password");

  if (
    !uid
    || uid.length > 128
    || email !== normalizedEmail
    || user.emailVerified !== true
    || user.disabled === true
    || !effectiveProviderIds
    || effectiveProviderIds.size !== 1
    || !effectiveProviderIds.has("password")
    || (Array.isArray(user.providerUserInfo) && user.providerUserInfo.length > 1)
    || !hasPasswordEvidence
    || providerEmail !== normalizedEmail
    || providerRawId !== normalizedEmail
    || providerFederatedId !== normalizedEmail
    || String(user.phoneNumber || "")
    || (Array.isArray(user.providerUserInfo)
      && user.providerUserInfo.some((provider) => String(provider?.phoneNumber || "")))
    || user.emailLinkSignin === true
    || user.customAuth === true
    || (typeof user.customAttributes === "string" && user.customAttributes.length > 0)
    || (Array.isArray(user.mfaInfo) && user.mfaInfo.length > 0)
    || String(user.tenantId || "") !== tenantId
    || String(user.initialEmail || "")
  ) {
    return null;
  }

  return Object.freeze({ uid, email });
}

function identityPlatformErrorCode(payload) {
  const raw = String(payload?.error?.message || payload?.error?.status || "").trim();
  const code = raw.split(/[\s:]/u, 1)[0];
  return /^[A-Z][A-Z0-9_]{1,127}$/u.test(code) ? code : "IDENTITY_PLATFORM_REQUEST_FAILED";
}

async function boundedJsonResponse(response) {
  const declaredLength = Number(response.headers?.get?.("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IDENTITY_RESPONSE_BYTES) {
    throw infrastructureError();
  }
  let text;
  try {
    text = await response.text();
  } catch (cause) {
    throw infrastructureError(cause);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_IDENTITY_RESPONSE_BYTES) {
    throw infrastructureError();
  }
  if (!text) return {};
  try {
    const payload = JSON.parse(text);
    if (!isPlainObject(payload)) throw new Error("Identity response is not an object.");
    return payload;
  } catch (cause) {
    throw infrastructureError(cause);
  }
}

function brandedPasswordActionUrl(rawLink, { projectId, apiKey, continueUrl }) {
  let parsed;
  try {
    parsed = new URL(rawLink);
  } catch {
    throw infrastructureError();
  }
  for (const [name] of parsed.searchParams) {
    if (
      !PASSWORD_ACTION_PARAMETERS.has(name)
      || parsed.searchParams.getAll(name).length !== 1
    ) {
      throw infrastructureError();
    }
  }
  const oobCode = parsed.searchParams.get("oobCode");
  const sourceApiKey = parsed.searchParams.get("apiKey");
  const language = parsed.searchParams.get("lang");
  const brandedOrigin = new URL(continueUrl).origin;
  const sourceIsExpected = (
    parsed.origin === `https://${projectId}.firebaseapp.com`
    && parsed.pathname === FIREBASE_ACTION_PATH
  ) || (
    parsed.origin === brandedOrigin
    && parsed.pathname === PASSWORD_ACTION_PATH
  );
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || !sourceIsExpected
    || parsed.hash
    || parsed.searchParams.get("mode") !== "resetPassword"
    || !PASSWORD_ACTION_API_KEY_PATTERN.test(sourceApiKey || "")
    || parsed.searchParams.get("continueUrl") !== continueUrl
    || !oobCode
    || !PASSWORD_ACTION_CODE_PATTERN.test(oobCode)
    || (language !== null && !["de", "en"].includes(language))
  ) {
    throw infrastructureError();
  }
  const branded = new URL(PASSWORD_ACTION_PATH, continueUrl);
  branded.searchParams.set("mode", "resetPassword");
  branded.searchParams.set("oobCode", oobCode);
  branded.searchParams.set("apiKey", apiKey);
  branded.searchParams.set("continueUrl", continueUrl);
  branded.searchParams.set("lang", "de");
  return Object.freeze({ href: branded.href, oobCode });
}

function passwordInvitationMetadataState(metadata) {
  if (!isPlainObject(metadata)) throw infrastructureError(undefined, "invitation_claim");
  const keys = Object.keys(metadata).sort();
  if (keys.length === 0) return Object.freeze({ kind: "active" });
  if (keys.some((key) => typeof metadata[key] !== "string")) {
    throw infrastructureError(undefined, "invitation_claim");
  }
  const state = metadata[PASSWORD_INVITATION_METADATA_KEYS.state];
  const commonKeys = [
    PASSWORD_INVITATION_METADATA_KEYS.attempt,
    PASSWORD_INVITATION_METADATA_KEYS.baseline,
    PASSWORD_INVITATION_METADATA_KEYS.claimedAt,
    PASSWORD_INVITATION_METADATA_KEYS.state
  ].sort();
  const expectedKeys = state === "issued"
    ? [...commonKeys,
        PASSWORD_INVITATION_METADATA_KEYS.action,
        PASSWORD_INVITATION_METADATA_KEYS.issuedAt].sort()
    : state === "consumed"
      ? [...commonKeys,
          PASSWORD_INVITATION_METADATA_KEYS.completedAt,
          PASSWORD_INVITATION_METADATA_KEYS.issuedAt].sort()
      : commonKeys;
  const attempt = metadata[PASSWORD_INVITATION_METADATA_KEYS.attempt];
  const baseline = metadata[PASSWORD_INVITATION_METADATA_KEYS.baseline];
  const claimedAt = metadata[PASSWORD_INVITATION_METADATA_KEYS.claimedAt];
  const claimedAtMs = canonicalIsoTimestamp(claimedAt);
  if (
    !["minting", "issued", "uncertain", "consumed"].includes(state)
    || keys.length !== expectedKeys.length
    || !keys.every((key, index) => key === expectedKeys[index])
    || !PASSWORD_INVITATION_ATTEMPT_PATTERN.test(attempt || "")
    || !PASSWORD_INVITATION_BASELINE_PATTERN.test(baseline || "")
    || claimedAtMs === null
  ) {
    throw infrastructureError(undefined, "invitation_claim");
  }
  const parsed = {
    attempt,
    baseline: Number(baseline),
    claimedAt,
    claimedAtMs,
    kind: state
  };
  if (!Number.isSafeInteger(parsed.baseline) || parsed.baseline <= 0) {
    throw infrastructureError(undefined, "invitation_claim");
  }
  if (state === "issued" || state === "consumed") {
    const issuedAt = metadata[PASSWORD_INVITATION_METADATA_KEYS.issuedAt];
    const issuedAtMs = canonicalIsoTimestamp(issuedAt);
    if (issuedAtMs === null || issuedAtMs < claimedAtMs) {
      throw infrastructureError(undefined, "invitation_claim");
    }
    parsed.issuedAt = issuedAt;
    parsed.issuedAtMs = issuedAtMs;
  }
  if (state === "issued") {
    const action = metadata[PASSWORD_INVITATION_METADATA_KEYS.action];
    if (!PASSWORD_INVITATION_SEALED_ACTION_PATTERN.test(action || "")) {
      throw infrastructureError(undefined, "invitation_issue");
    }
    parsed.action = action;
  }
  if (state === "consumed") {
    const completedAt = metadata[PASSWORD_INVITATION_METADATA_KEYS.completedAt];
    const completedAtMs = canonicalIsoTimestamp(completedAt);
    if (completedAtMs === null || completedAtMs < parsed.issuedAtMs) {
      throw infrastructureError(undefined, "invitation_finalize");
    }
    parsed.completedAt = completedAt;
    parsed.completedAtMs = completedAtMs;
  }
  return Object.freeze(parsed);
}

function mintingInvitationMetadata({ attempt, baseline, claimedAt }) {
  return Object.freeze({
    [PASSWORD_INVITATION_METADATA_KEYS.state]: "minting",
    [PASSWORD_INVITATION_METADATA_KEYS.attempt]: attempt,
    [PASSWORD_INVITATION_METADATA_KEYS.baseline]: String(baseline),
    [PASSWORD_INVITATION_METADATA_KEYS.claimedAt]: claimedAt
  });
}

function uncertainInvitationMetadata(state) {
  return Object.freeze({
    [PASSWORD_INVITATION_METADATA_KEYS.state]: "uncertain",
    [PASSWORD_INVITATION_METADATA_KEYS.attempt]: state.attempt,
    [PASSWORD_INVITATION_METADATA_KEYS.baseline]: String(state.baseline),
    [PASSWORD_INVITATION_METADATA_KEYS.claimedAt]: state.claimedAt
  });
}

function issuedInvitationMetadata(state, { action, issuedAt }) {
  return Object.freeze({
    [PASSWORD_INVITATION_METADATA_KEYS.state]: "issued",
    [PASSWORD_INVITATION_METADATA_KEYS.attempt]: state.attempt,
    [PASSWORD_INVITATION_METADATA_KEYS.baseline]: String(state.baseline),
    [PASSWORD_INVITATION_METADATA_KEYS.claimedAt]: state.claimedAt,
    [PASSWORD_INVITATION_METADATA_KEYS.issuedAt]: issuedAt,
    [PASSWORD_INVITATION_METADATA_KEYS.action]: action
  });
}

function consumedInvitationMetadata(state, completedAt) {
  return Object.freeze({
    [PASSWORD_INVITATION_METADATA_KEYS.state]: "consumed",
    [PASSWORD_INVITATION_METADATA_KEYS.attempt]: state.attempt,
    [PASSWORD_INVITATION_METADATA_KEYS.baseline]: String(state.baseline),
    [PASSWORD_INVITATION_METADATA_KEYS.claimedAt]: state.claimedAt,
    [PASSWORD_INVITATION_METADATA_KEYS.issuedAt]: state.issuedAt || state.claimedAt,
    [PASSWORD_INVITATION_METADATA_KEYS.completedAt]: completedAt
  });
}

function passwordInvitationActionAad({ objectName, generation, invitation, state }) {
  const invitationFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(PASSWORD_INVITATION_KEYS.map((key) => [key, invitation[key]])), "utf8")
    .digest("hex");
  return Buffer.from(
    `${PASSWORD_INVITATION_ACTION_AAD_DOMAIN}${objectName}\0${generation}\0${invitationFingerprint}`
      + `\0${state.attempt}\0${state.baseline}\0${state.claimedAt}\0${state.issuedAt}`,
    "utf8"
  );
}

function passwordInvitationActionKey(invitationToken, objectName) {
  const canonicalToken = canonicalPasswordInvitationToken(invitationToken);
  if (!canonicalToken) throw invalidInvitation();
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    Buffer.from(canonicalToken, "base64url"),
    Buffer.from(PASSWORD_INVITATION_ACTION_KEY_DOMAIN, "utf8"),
    Buffer.from(objectName, "utf8"),
    32
  ));
}

function canonicalBase64UrlBytes(value, expectedLength = null) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value.");
  }
  const bytes = Buffer.from(value, "base64url");
  if (
    bytes.length === 0
    || bytes.toString("base64url") !== value
    || (expectedLength !== null && bytes.length !== expectedLength)
  ) {
    throw new Error("Non-canonical base64url value.");
  }
  return bytes;
}

function sealPasswordInvitationAction(actionUrl, invitationToken, context) {
  if (typeof actionUrl !== "string" || actionUrl.length === 0 || actionUrl.length > 3072) {
    throw infrastructureError(undefined, "invitation_issue");
  }
  try {
    const plaintext = Buffer.from(actionUrl, "utf8");
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      passwordInvitationActionKey(invitationToken, context.objectName),
      nonce
    );
    cipher.setAAD(passwordInvitationActionAad(context), { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const sealed = `v1.${nonce.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
    if (!PASSWORD_INVITATION_SEALED_ACTION_PATTERN.test(sealed)) throw new Error("Invalid sealed action.");
    return sealed;
  } catch (cause) {
    throw infrastructureError(cause, "invitation_issue");
  }
}

function openPasswordInvitationAction(sealed, invitationToken, context) {
  if (!PASSWORD_INVITATION_SEALED_ACTION_PATTERN.test(sealed || "")) {
    throw infrastructureError(undefined, "invitation_issue");
  }
  try {
    const [, nonceValue, tagValue, ciphertextValue] = sealed.split(".");
    const nonce = canonicalBase64UrlBytes(nonceValue, 12);
    const tag = canonicalBase64UrlBytes(tagValue, 16);
    const ciphertext = canonicalBase64UrlBytes(ciphertextValue);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      passwordInvitationActionKey(invitationToken, context.objectName),
      nonce
    );
    decipher.setAuthTag(tag);
    decipher.setAAD(passwordInvitationActionAad(context), { plaintextLength: ciphertext.length });
    const actionUrl = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const branded = brandedPasswordActionUrl(actionUrl, context);
    if (branded.href !== actionUrl) throw new Error("Stored action URL is not canonical.");
    return actionUrl;
  } catch (cause) {
    throw infrastructureError(cause, "invitation_issue");
  }
}

function validStorageBucketName(value) {
  const bucketName = String(value || "");
  return bucketName.length >= 3
    && bucketName.length <= 63
    && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/u.test(bucketName)
    && !bucketName.startsWith("goog")
    && !bucketName.includes("google");
}

async function boundedPasswordInvitationResponse(response) {
  const declaredLength = Number(response.headers?.get?.("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PASSWORD_INVITATION_BYTES) {
    throw infrastructureError();
  }
  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (cause) {
    throw infrastructureError(cause);
  }
  if (bytes.length === 0 || bytes.length > MAX_PASSWORD_INVITATION_BYTES) {
    throw infrastructureError();
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw infrastructureError(cause);
  }
  try {
    const payload = JSON.parse(text);
    if (!isPlainObject(payload)) throw new Error("Invitation is not an object.");
    return Object.freeze({ byteLength: bytes.length, value: payload });
  } catch (cause) {
    throw infrastructureError(cause);
  }
}

export function createPasswordInvitationStore({
  bucketName,
  accessTokenProvider = createMetadataAccessTokenProvider(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (
    !validStorageBucketName(bucketName)
    || typeof accessTokenProvider !== "function"
    || typeof fetchImpl !== "function"
  ) {
    throw new TypeError("Der Passwort-Einladungsspeicher ist ungültig konfiguriert.");
  }
  const bucketPath = `${STORAGE_API_ORIGIN}/storage/v1/b/${encodeURIComponent(bucketName)}/o`;

  async function accessToken() {
    try {
      return await accessTokenProvider();
    } catch (cause) {
      throw infrastructureError(cause);
    }
  }

  async function storageFetch(url, options) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${await accessToken()}`,
          ...(options?.headers || {})
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (cause) {
      throw infrastructureError(cause);
    }
    return response;
  }

  return Object.freeze({
    async getActive(objectName) {
      const objectUrl = `${bucketPath}/${encodeURIComponent(objectName)}`;
      const metadataUrl = new URL(objectUrl);
      metadataUrl.searchParams.set(
        "fields",
        "name,size,contentType,generation,metageneration,metadata"
      );
      const metadataResponse = await storageFetch(metadataUrl.href, { method: "GET" });
      if (metadataResponse.status === 404) return null;
      if (!metadataResponse.ok) throw infrastructureError();
      const metadataResponseContentType = String(
        metadataResponse.headers?.get?.("content-type") || ""
      )
        .trim()
        .toLowerCase();
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(metadataResponseContentType)
      ) {
        throw infrastructureError();
      }
      const metadataBody = await boundedPasswordInvitationResponse(metadataResponse);
      const storageMetadata = metadataBody.value;
      const generation = String(storageMetadata.generation || "");
      const metageneration = String(storageMetadata.metageneration || "");
      const objectSize = String(storageMetadata.size || "");
      const customMetadata = storageMetadata.metadata === undefined
        ? {}
        : storageMetadata.metadata;
      const expectedMetadataKeys = storageMetadata.metadata === undefined
        ? ["contentType", "generation", "metageneration", "name", "size"]
        : ["contentType", "generation", "metadata", "metageneration", "name", "size"];
      if (
        !exactKeys(storageMetadata, expectedMetadataKeys)
        || storageMetadata.name !== objectName
        || storageMetadata.contentType !== "application/json"
        || !/^[1-9][0-9]{0,30}$/u.test(generation)
        || !/^[1-9][0-9]{0,30}$/u.test(metageneration)
        || !/^[1-9][0-9]{0,4}$/u.test(objectSize)
        || Number(objectSize) > MAX_PASSWORD_INVITATION_BYTES
        || !isPlainObject(customMetadata)
      ) {
        throw infrastructureError();
      }
      passwordInvitationMetadataState(customMetadata);
      const mediaUrl = new URL(objectUrl);
      mediaUrl.searchParams.set("alt", "media");
      mediaUrl.searchParams.set("generation", generation);
      const mediaResponse = await storageFetch(mediaUrl.href, { method: "GET" });
      if (mediaResponse.status === 404 || mediaResponse.status === 412) return null;
      if (!mediaResponse.ok) throw infrastructureError();
      const mediaContentType = String(mediaResponse.headers?.get?.("content-type") || "")
        .trim()
        .toLowerCase();
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(mediaContentType)) {
        throw infrastructureError();
      }
      const mediaBody = await boundedPasswordInvitationResponse(mediaResponse);
      if (mediaBody.byteLength !== Number(objectSize)) throw infrastructureError();
      return Object.freeze({
        generation,
        metageneration,
        metadata: Object.freeze({ ...customMetadata }),
        value: mediaBody.value
      });
    },
    async updateActiveMetadata(objectName, generation, metageneration, metadata) {
      if (
        !/^[1-9][0-9]{0,30}$/u.test(String(generation || ""))
        || !/^[1-9][0-9]{0,30}$/u.test(String(metageneration || ""))
      ) {
        throw infrastructureError(undefined, "invitation_claim");
      }
      passwordInvitationMetadataState(metadata);
      const metadataPatch = Object.fromEntries(
        Object.values(PASSWORD_INVITATION_METADATA_KEYS).map((key) => [
          key,
          Object.hasOwn(metadata, key) ? metadata[key] : null
        ])
      );
      const url = new URL(`${bucketPath}/${encodeURIComponent(objectName)}`);
      url.searchParams.set("ifGenerationMatch", generation);
      url.searchParams.set("ifMetagenerationMatch", metageneration);
      url.searchParams.set("fields", "name,generation,metageneration,metadata");
      const response = await storageFetch(url.href, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata: metadataPatch })
      });
      if (response.status === 404 || response.status === 412) return null;
      if (!response.ok) throw infrastructureError(undefined, "invitation_claim");
      const contentType = String(response.headers?.get?.("content-type") || "")
        .trim()
        .toLowerCase();
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(contentType)) {
        throw infrastructureError(undefined, "invitation_claim");
      }
      const responseBody = await boundedPasswordInvitationResponse(response);
      const updated = responseBody.value;
      const customMetadata = updated.metadata === undefined ? {} : updated.metadata;
      const expectedKeys = updated.metadata === undefined
        ? ["generation", "metageneration", "name"]
        : ["generation", "metadata", "metageneration", "name"];
      if (
        !exactKeys(updated, expectedKeys)
        || updated.name !== objectName
        || String(updated.generation || "") !== generation
        || !/^[1-9][0-9]{0,30}$/u.test(String(updated.metageneration || ""))
        || BigInt(updated.metageneration) <= BigInt(metageneration)
        || !isPlainObject(customMetadata)
      ) {
        throw infrastructureError(undefined, "invitation_claim");
      }
      passwordInvitationMetadataState(customMetadata);
      return Object.freeze({
        generation,
        metageneration: String(updated.metageneration),
        metadata: Object.freeze({ ...customMetadata })
      });
    }
  });
}

export function createMetadataAccessTokenProvider({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Eine Fetch-Implementierung ist erforderlich.");
  let cached = null;
  let pending = null;

  return async function metadataAccessToken() {
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      let response;
      try {
        response = await fetchImpl(METADATA_TOKEN_URL, {
          headers: { "metadata-flavor": "Google" },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (cause) {
        throw infrastructureError(cause);
      }
      if (!response.ok || response.headers?.get?.("metadata-flavor") !== "Google") {
        throw infrastructureError();
      }
      const payload = await boundedJsonResponse(response);
      const token = typeof payload.access_token === "string" ? payload.access_token : "";
      const expiresIn = Number(payload.expires_in);
      if (
        !token
        || token.length > 8192
        || /\s/u.test(token)
        || !Number.isFinite(expiresIn)
        || expiresIn <= 0
        || expiresIn > 3600
      ) {
        throw infrastructureError();
      }
      cached = { token, expiresAt: now() + expiresIn * 1000 };
      return token;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

export function createIdentityPlatformPasswordResetClient({
  projectId,
  apiKey,
  tenantId = "",
  continueUrl,
  accessTokenProvider = createMetadataAccessTokenProvider(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(String(projectId || ""))) {
    throw new TypeError("Die Identity-Platform-Projekt-ID ist ungültig.");
  }
  if (!/^AIza[0-9A-Za-z_-]{35}$/u.test(String(apiKey || ""))) {
    throw new TypeError("Der Identity-Platform-Web-API-Key ist ungültig.");
  }
  if (tenantId && !/^[A-Za-z0-9_-]{1,128}$/u.test(tenantId)) {
    throw new TypeError("Die Identity-Platform-Tenant-ID ist ungültig.");
  }
  const resetContinueUrl = canonicalHttpsStartUrl(continueUrl);
  const portalKeyReferer = new URL("/anmelden", resetContinueUrl).href;
  if (typeof accessTokenProvider !== "function" || typeof fetchImpl !== "function") {
    throw new TypeError("Die Identity-Platform-HTTP-Laufzeit fehlt.");
  }
  const apiRoot = `${IDENTITY_TOOLKIT_ORIGIN}/v1/projects/${encodeURIComponent(projectId)}`;

  async function post(pathname, body, { mint = false } = {}) {
    let token;
    try {
      token = await accessTokenProvider();
    } catch (cause) {
      if (mint) throw new PasswordResetMintError("not_sent", "oob_request", cause);
      throw infrastructureError(cause);
    }
    let response;
    try {
      response = await fetchImpl(`${apiRoot}${pathname}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "referer": portalKeyReferer,
          "x-firebase-locale": "de"
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (cause) {
      if (mint) throw new PasswordResetMintError("unknown", "oob_request", cause);
      throw infrastructureError(cause);
    }
    let payload;
    try {
      payload = await boundedJsonResponse(response);
    } catch (cause) {
      if (mint) {
        const outcome = response.status >= 400 && response.status < 500
          ? "not_sent"
          : "unknown";
        throw new PasswordResetMintError(outcome, "oob_request", cause);
      }
      throw cause;
    }
    if (!response.ok) {
      const definitiveClientError = response.status >= 400 && response.status < 500;
      throw new IdentityPlatformRequestError(identityPlatformErrorCode(payload), {
        definitiveClientError,
        mintOutcome: mint && definitiveClientError
          ? "not_sent"
          : mint
            ? "unknown"
            : ""
      });
    }
    return payload;
  }

  async function verifyPasswordResetActionCode(oobCode, email) {
    let response;
    try {
      response = await fetchImpl(
        `${IDENTITY_TOOLKIT_ORIGIN}/v1/accounts:resetPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "referer": new URL("/", resetContinueUrl).href
          },
          body: JSON.stringify({
            oobCode,
            ...(tenantId ? { tenantId } : {})
          }),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs)
        }
      );
    } catch (cause) {
      throw new PasswordResetMintError("unknown", "oob_validate", cause);
    }
    let payload;
    try {
      payload = await boundedJsonResponse(response);
    } catch (cause) {
      throw new PasswordResetMintError("unknown", "oob_validate", cause);
    }
    if (
      !response.ok
      || payload.requestType !== "PASSWORD_RESET"
      || normalizePasswordResetEmail(payload.email) !== email
    ) {
      throw new PasswordResetMintError("unknown", "oob_validate");
    }
  }

  return Object.freeze({
    async lookupByEmail(email) {
      try {
        const payload = await post("/accounts:lookup", {
          email: [email],
          ...(tenantId ? { tenantId } : {})
        });
        if (payload.users === undefined) return null;
        if (!Array.isArray(payload.users) || payload.users.length > 1) {
          throw infrastructureError();
        }
        return payload.users[0] || null;
      } catch (error) {
        if (
          error instanceof IdentityPlatformRequestError
          && error.definitiveClientError
          && error.lookupPrivate
        ) return null;
        throw infrastructureError(error);
      }
    },
    async generatePasswordResetActionUrl(email) {
      try {
        const payload = await post("/accounts:sendOobCode", {
          requestType: "PASSWORD_RESET",
          email,
          continueUrl: resetContinueUrl,
          canHandleCodeInApp: false,
          returnOobLink: true,
          clientType: "CLIENT_TYPE_WEB",
          ...(tenantId ? { tenantId } : {})
        }, { mint: true });
        if (
          payload.email !== undefined
          && normalizePasswordResetEmail(payload.email) !== email
        ) {
          throw new PasswordResetMintError("unknown", "oob_validate");
        }
        let branded;
        try {
          branded = brandedPasswordActionUrl(String(payload.oobLink || ""), {
            projectId,
            apiKey,
            continueUrl: resetContinueUrl
          });
        } catch (cause) {
          throw new PasswordResetMintError("unknown", "oob_validate", cause);
        }
        await verifyPasswordResetActionCode(branded.oobCode, email);
        return branded.href;
      } catch (error) {
        if (
          error instanceof IdentityPlatformRequestError
          && error.definitiveClientError
          && error.resetAccountUnavailable
          && error.mintOutcome === "not_sent"
        ) return null;
        if (error instanceof PasswordResetMintError) throw error;
        if (error instanceof IdentityPlatformRequestError) {
          throw new PasswordResetMintError(
            error.mintOutcome || "unknown",
            "oob_request",
            error
          );
        }
        throw new PasswordResetMintError("unknown", "oob_validate", error);
      }
    }
  });
}

export function createPasswordResetRateLimiter({
  now = () => Date.now(),
  windowMs = DEFAULT_RATE_WINDOW_MS,
  ipLimit = DEFAULT_IP_LIMIT,
  emailLimit = DEFAULT_EMAIL_LIMIT,
  maxBuckets = DEFAULT_MAX_RATE_LIMIT_BUCKETS
} = {}) {
  const buckets = new Map();
  const limits = { ip: Number(ipLimit), email: Number(emailLimit) };
  if (
    !Number.isFinite(windowMs)
    || windowMs < 60_000
    || !Number.isInteger(limits.ip)
    || limits.ip < 1
    || !Number.isInteger(limits.email)
    || limits.email < 1
    || !Number.isInteger(maxBuckets)
    || maxBuckets < 100
  ) {
    throw new TypeError("Die Passwort-Reset-Rate-Limits sind ungültig.");
  }

  function consume(key, limit, timestamp) {
    const current = buckets.get(key);
    if (!current && buckets.size >= maxBuckets) return false;
    const bucket = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + windowMs }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    return bucket.count <= limit;
  }

  return Object.freeze({
    allow(email, clientIp) {
      const timestamp = now();
      if (buckets.size >= maxBuckets) {
        for (const [key, bucket] of buckets) {
          if (bucket.resetAt <= timestamp) buckets.delete(key);
        }
      }
      const emailDigest = crypto.createHash("sha256").update(email, "utf8").digest("hex");
      const ipAllowed = consume(`ip:${clientIp}`, limits.ip, timestamp);
      const emailAllowed = consume(`email:${emailDigest}`, limits.email, timestamp);
      return ipAllowed && emailAllowed;
    }
  });
}

export function trustedPasswordResetClientIp(request, { production = false } = {}) {
  const loadBalancerClient = String(
    request?.headers?.["x-password-reset-client-ip"] || ""
  ).trim();
  const forwarded = String(request?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim());
  const forwardedClient = forwarded.length >= 2 ? forwarded.at(-2) : "";
  const socketClient = String(request?.socket?.remoteAddress || "").trim();
  const value = production
    ? loadBalancerClient
    : loadBalancerClient || forwardedClient || socketClient;
  if (!value || !isIP(value)) throw infrastructureError();
  return value;
}

export function createPasswordResetBroker({
  identityClient,
  sendPasswordResetEmail,
  invitationStore = null,
  isEligibleUser = async () => true,
  projectId = "",
  apiKey = "",
  tenantId = "",
  continueUrl = "",
  rateLimiter = createPasswordResetRateLimiter(),
  onDeliveryError = async () => {},
  now = () => Date.now(),
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  invitationPollMs = DEFAULT_INVITATION_POLL_MS,
  invitationPollLimit = DEFAULT_INVITATION_POLL_LIMIT,
  invitationMintStaleMs = DEFAULT_INVITATION_MINT_STALE_MS,
  minimumResponseMs = 750
}) {
  if (
    !identityClient
    || typeof identityClient.lookupByEmail !== "function"
    || typeof identityClient.generatePasswordResetActionUrl !== "function"
    || typeof sendPasswordResetEmail !== "function"
    || typeof isEligibleUser !== "function"
    || typeof rateLimiter?.allow !== "function"
    || typeof onDeliveryError !== "function"
  ) {
    throw new TypeError("Die Passwort-Reset-Broker-Abhängigkeiten sind unvollständig.");
  }
  const invitationEnabled = invitationStore !== null;
  if (
    invitationEnabled
    && (
      typeof invitationStore?.getActive !== "function"
      || typeof invitationStore?.updateActiveMetadata !== "function"
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(String(projectId || ""))
      || !PASSWORD_ACTION_API_KEY_PATTERN.test(String(apiKey || ""))
      || (tenantId && !/^[A-Za-z0-9_-]{1,128}$/u.test(tenantId))
      || canonicalHttpsStartUrl(continueUrl) !== continueUrl
    )
  ) {
    throw new TypeError("Die Passwort-Einladungs-Abhängigkeiten sind unvollständig.");
  }
  if (
    !Number.isInteger(invitationPollMs)
    || invitationPollMs < 1
    || invitationPollMs > 1_000
    || !Number.isInteger(invitationPollLimit)
    || invitationPollLimit < 1
    || invitationPollLimit > 1_000
    || !Number.isInteger(invitationMintStaleMs)
    || invitationMintStaleMs < 10_000
    || invitationMintStaleMs > 10 * 60_000
  ) {
    throw new TypeError("Die Passwort-Einladungs-Zeitbudgets sind ungültig.");
  }

  const pendingDeliveries = new Set();

  function schedulePasswordReset(email) {
    const delivery = Promise.resolve()
      .then(async () => {
        const actionUrl = await identityClient.generatePasswordResetActionUrl(email);
        if (!actionUrl) return false;
        await sendPasswordResetEmail({ recipient: email, actionUrl });
        return true;
      })
      .catch(async (cause) => {
        try {
          await onDeliveryError(infrastructureError(cause));
        } catch {
          // Reporting must never alter the account-neutral public contract.
        }
      })
      .finally(() => pendingDeliveries.delete(delivery));
    pendingDeliveries.add(delivery);
  }

  function currentIsoTimestamp(stage) {
    const timestamp = Number(now());
    if (!Number.isFinite(timestamp)) throw infrastructureError(undefined, stage);
    try {
      return new Date(timestamp).toISOString();
    } catch (cause) {
      throw infrastructureError(cause, stage);
    }
  }

  function invitationMetadataEqual(left, right) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const canonical = (value) => JSON.stringify(
      Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    );
    return canonical(left) === canonical(right);
  }

  function validateStoredInvitation(stored, allowExpired = false) {
    if (
      !isPlainObject(stored)
      || !/^[1-9][0-9]{0,30}$/u.test(String(stored.generation || ""))
      || !/^[1-9][0-9]{0,30}$/u.test(String(stored.metageneration || ""))
      || !isPlainObject(stored.metadata)
    ) {
      throw infrastructureError(undefined, "invitation_claim");
    }
    const invitation = validateActivePasswordInvitation(stored.value, {
      projectId,
      tenantId,
      continueUrl,
      now: now(),
      allowExpired
    });
    const state = passwordInvitationMetadataState(stored.metadata);
    return Object.freeze({ invitation, state, stored });
  }

  async function readStoredInvitation(objectName, allowExpired = false) {
    const stored = await invitationStore.getActive(objectName);
    if (!stored) throw invalidInvitation();
    return validateStoredInvitation(stored, allowExpired);
  }

  async function exactEligibleInvitationUser(invitation) {
    const rawUser = await identityClient.lookupByEmail(invitation.email);
    const user = exactPasswordOnlyIdentityUser(rawUser, invitation.email, tenantId);
    const passwordUpdatedAt = identityPasswordUpdatedAt(rawUser);
    if (
      !user
      || user.uid !== invitation.uid
      || passwordUpdatedAt === null
      || !(await isEligibleUser(user))
    ) {
      throw invalidInvitation();
    }
    return Object.freeze({ passwordUpdatedAt, user });
  }

  async function updateInvitationMetadata(
    objectName,
    current,
    nextMetadata,
    stage,
    allowExpired = false
  ) {
    let expected = current;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let updated;
      try {
        updated = await invitationStore.updateActiveMetadata(
          objectName,
          expected.stored.generation,
          expected.stored.metageneration,
          nextMetadata
        );
      } catch (cause) {
        const readback = await readStoredInvitation(objectName, allowExpired);
        if (readback.stored.generation !== expected.stored.generation) {
          throw invalidInvitation();
        }
        if (invitationMetadataEqual(readback.stored.metadata, nextMetadata)) return readback;
        if (
          attempt === 0
          && invitationMetadataEqual(readback.stored.metadata, expected.stored.metadata)
        ) {
          expected = readback;
          continue;
        }
        throw infrastructureError(cause, stage);
      }
      if (!updated) {
        const readback = await readStoredInvitation(objectName, allowExpired);
        if (readback.stored.generation !== expected.stored.generation) {
          throw invalidInvitation();
        }
        return invitationMetadataEqual(readback.stored.metadata, nextMetadata)
          ? readback
          : null;
      }
      if (
        String(updated.generation || "") !== expected.stored.generation
        || !/^[1-9][0-9]{0,30}$/u.test(String(updated.metageneration || ""))
        || !invitationMetadataEqual(updated.metadata, nextMetadata)
      ) {
        throw infrastructureError(undefined, stage);
      }
      return Object.freeze({
        invitation: expected.invitation,
        state: passwordInvitationMetadataState(updated.metadata),
        stored: Object.freeze({
          generation: String(updated.generation),
          metageneration: String(updated.metageneration),
          metadata: Object.freeze({ ...updated.metadata }),
          value: expected.stored.value
        })
      });
    }
    throw infrastructureError(undefined, stage);
  }

  function invitationActionContext(objectName, context, state) {
    return Object.freeze({
      objectName,
      generation: context.stored.generation,
      invitation: context.invitation,
      state,
      projectId,
      apiKey,
      continueUrl
    });
  }

  async function markInvitationUncertain(objectName, context, state) {
    try {
      const updated = await updateInvitationMetadata(
        objectName,
        context,
        uncertainInvitationMetadata(state),
        "invitation_uncertain"
      );
      return updated || await readStoredInvitation(objectName);
    } catch {
      return null;
    }
  }

  async function resetInvitationToActive(objectName, context) {
    const updated = await updateInvitationMetadata(
      objectName,
      context,
      {},
      "invitation_claim"
    );
    if (updated) return updated;
    const readback = await readStoredInvitation(objectName);
    if (readback.state.kind !== "active") {
      throw infrastructureError(undefined, "invitation_claim");
    }
    return readback;
  }

  async function consumeInvitation(objectName, context, state, allowExpired = false) {
    let current = context;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (current.state.kind === "consumed") return current;
      if (
        !["issued", "uncertain"].includes(current.state.kind)
        || current.state.attempt !== state.attempt
      ) {
        throw infrastructureError(undefined, "invitation_finalize");
      }
      const completedAt = currentIsoTimestamp("invitation_finalize");
      const issuedAtMs = current.state.issuedAtMs ?? current.state.claimedAtMs;
      if (Date.parse(completedAt) < issuedAtMs) {
        throw infrastructureError(undefined, "invitation_finalize");
      }
      const updated = await updateInvitationMetadata(
        objectName,
        current,
        consumedInvitationMetadata(current.state, completedAt),
        "invitation_finalize",
        allowExpired
      );
      if (updated) return updated;
      current = await readStoredInvitation(objectName, allowExpired);
    }
    throw infrastructureError(undefined, "invitation_finalize");
  }

  async function publishIssuedInvitation(
    invitationToken,
    objectName,
    context,
    claimState,
    actionUrl
  ) {
    const issuedAt = currentIsoTimestamp("invitation_issue");
    if (Date.parse(issuedAt) < claimState.claimedAtMs) {
      throw infrastructureError(undefined, "invitation_issue");
    }
    const issuedState = Object.freeze({ ...claimState, issuedAt });
    const sealedAction = sealPasswordInvitationAction(
      actionUrl,
      invitationToken,
      invitationActionContext(objectName, context, issuedState)
    );
    const targetMetadata = issuedInvitationMetadata(claimState, {
      action: sealedAction,
      issuedAt
    });
    let current = context;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const updated = await updateInvitationMetadata(
        objectName,
        current,
        targetMetadata,
        "invitation_issue"
      );
      if (updated) return updated;
      current = await readStoredInvitation(objectName);
      if (current.state.kind === "issued" && current.state.attempt === claimState.attempt) {
        return current;
      }
      if (current.state.kind === "consumed" && current.state.attempt === claimState.attempt) {
        return current;
      }
      if (current.state.kind !== "minting" || current.state.attempt !== claimState.attempt) {
        throw infrastructureError(undefined, "invitation_issue");
      }
    }
    throw infrastructureError(undefined, "invitation_issue");
  }

  async function mintClaimedInvitation(invitationToken, objectName, context) {
    const claimState = context.state;
    let actionUrl;
    try {
      actionUrl = await identityClient.generatePasswordResetActionUrl(context.invitation.email);
    } catch (cause) {
      if (cause?.mintOutcome === "not_sent") {
        await resetInvitationToActive(objectName, context);
      } else {
        await markInvitationUncertain(objectName, context, claimState);
      }
      throw cause;
    }
    if (!actionUrl) {
      await resetInvitationToActive(objectName, context);
      throw invalidInvitation();
    }
    let issued;
    try {
      issued = await publishIssuedInvitation(
        invitationToken,
        objectName,
        context,
        claimState,
        actionUrl
      );
    } catch (cause) {
      await markInvitationUncertain(objectName, context, claimState);
      throw cause;
    }
    if (issued.state.kind === "consumed") {
      return Object.freeze({ redeemed: true, completed: true });
    }
    if (issued.state.kind !== "issued" || issued.state.attempt !== claimState.attempt) {
      throw infrastructureError(undefined, "invitation_issue");
    }
    const replayActionUrl = openPasswordInvitationAction(
      issued.state.action,
      invitationToken,
      invitationActionContext(objectName, issued, issued.state)
    );
    if (replayActionUrl !== actionUrl) throw infrastructureError(undefined, "invitation_issue");
    return Object.freeze({ redeemed: true, actionUrl: replayActionUrl });
  }

  async function invitationRequestContext(invitationToken, clientIp, allowExpired = false) {
    if (!invitationEnabled || !isIP(clientIp)) throw invalidInvitation();
    const objectName = passwordInvitationObjectName(invitationToken);
    if (!rateLimiter.allow(`password-invitation:${objectName}`, clientIp)) {
      throw new PasswordInvitationRateLimitError();
    }
    const context = await readStoredInvitation(objectName, allowExpired);
    return Object.freeze({ context, objectName });
  }

  async function redeemInvitation(invitationToken, clientIp) {
    const initial = await invitationRequestContext(invitationToken, clientIp);
    let context = initial.context;
    const { objectName } = initial;
    if (context.state.kind === "consumed") {
      return Object.freeze({ redeemed: true, completed: true });
    }
    const eligible = await exactEligibleInvitationUser(context.invitation);

    for (let poll = 0; poll <= invitationPollLimit; poll += 1) {
      const state = context.state;
      if (state.kind === "consumed") {
        return Object.freeze({ redeemed: true, completed: true });
      }
      if (state.kind === "issued") {
        if (eligible.passwordUpdatedAt > state.baseline) {
          await consumeInvitation(objectName, context, state);
          return Object.freeze({ redeemed: true, completed: true });
        }
        const actionUrl = openPasswordInvitationAction(
          state.action,
          invitationToken,
          invitationActionContext(objectName, context, state)
        );
        return Object.freeze({ redeemed: true, actionUrl });
      }
      if (state.kind === "uncertain") {
        if (eligible.passwordUpdatedAt > state.baseline) {
          await consumeInvitation(objectName, context, state);
          return Object.freeze({ redeemed: true, completed: true });
        }
        throw infrastructureError(undefined, "invitation_uncertain");
      }
      if (state.kind === "active") {
        const claimedAt = currentIsoTimestamp("invitation_claim");
        const attempt = crypto.randomBytes(16).toString("base64url");
        const claimed = await updateInvitationMetadata(
          objectName,
          context,
          mintingInvitationMetadata({
            attempt,
            baseline: eligible.passwordUpdatedAt,
            claimedAt
          }),
          "invitation_claim"
        );
        if (claimed) return mintClaimedInvitation(invitationToken, objectName, claimed);
        context = await readStoredInvitation(objectName);
        continue;
      }
      if (state.kind === "minting") {
        const age = Number(now()) - state.claimedAtMs;
        if (!Number.isFinite(age) || age < 0) {
          throw infrastructureError(undefined, "invitation_claim");
        }
        if (age >= invitationMintStaleMs) {
          const uncertain = await updateInvitationMetadata(
            objectName,
            context,
            uncertainInvitationMetadata(state),
            "invitation_uncertain"
          );
          if (!uncertain) {
            context = await readStoredInvitation(objectName);
            continue;
          }
          throw infrastructureError(undefined, "invitation_uncertain");
        }
        if (poll === invitationPollLimit) {
          throw infrastructureError(undefined, "invitation_claim");
        }
        await delay(invitationPollMs);
        context = await readStoredInvitation(objectName);
      }
    }
    throw infrastructureError(undefined, "invitation_claim");
  }

  async function finalizeInvitation(invitationToken, clientIp) {
    const initial = await invitationRequestContext(invitationToken, clientIp, true);
    let context = initial.context;
    const { objectName } = initial;
    if (context.state.kind === "consumed") {
      return Object.freeze({ finalized: true });
    }
    if (context.state.kind === "active" || context.state.kind === "minting") {
      return Object.freeze({ finalized: false });
    }
    const eligible = await exactEligibleInvitationUser(context.invitation);
    if (eligible.passwordUpdatedAt <= context.state.baseline) {
      return Object.freeze({ finalized: false });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (context.state.kind === "consumed") {
        return Object.freeze({ finalized: true });
      }
      const consumed = await consumeInvitation(
        objectName,
        context,
        context.state,
        true
      );
      if (consumed.state.kind === "consumed") {
        return Object.freeze({ finalized: true });
      }
      context = await readStoredInvitation(objectName, true);
    }
    throw infrastructureError(undefined, "invitation_finalize");
  }

  return Object.freeze({
    async request({ email: inputEmail, invitationToken, finalize = false, clientIp }) {
      const startedAt = now();
      try {
        if (invitationToken !== undefined) {
          return finalize
            ? await finalizeInvitation(invitationToken, clientIp)
            : await redeemInvitation(invitationToken, clientIp);
        }
        const email = normalizePasswordResetEmail(inputEmail);
        if (!email || !isIP(clientIp) || !rateLimiter.allow(email, clientIp)) {
          return PASSWORD_RESET_ACCEPTED_RESPONSE;
        }
        const rawUser = await identityClient.lookupByEmail(email);
        const user = exactPasswordOnlyIdentityUser(rawUser, email, tenantId);
        if (!user || !(await isEligibleUser(user))) {
          return PASSWORD_RESET_ACCEPTED_RESPONSE;
        }
        schedulePasswordReset(email);
        return PASSWORD_RESET_ACCEPTED_RESPONSE;
      } catch (cause) {
        if (
          cause instanceof PasswordInvitationInvalidError
          || cause instanceof PasswordInvitationRateLimitError
        ) throw cause;
        throw infrastructureError(cause);
      } finally {
        const remaining = Number(minimumResponseMs) - (now() - startedAt);
        if (remaining > 0) await delay(remaining);
      }
    },
    async drain() {
      await Promise.allSettled([...pendingDeliveries]);
    }
  });
}
