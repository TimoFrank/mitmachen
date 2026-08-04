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
const DEFAULT_IP_LIMIT = 20;
const DEFAULT_EMAIL_LIMIT = 5;
const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 10_000;
const PASSWORD_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const PASSWORD_INVITATION_DIGEST_DOMAIN = "versorgungs-kompass-password-invitation-token-v1\0";
const PASSWORD_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PASSWORD_ACTION_CODE_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/u;
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
const ACCOUNT_PRIVATE_IDENTITY_ERRORS = new Set([
  "CAPTCHA_CHECK_FAILED",
  "EMAIL_NOT_FOUND",
  "INVALID_EMAIL",
  "INVALID_RECAPTCHA_TOKEN",
  "MISSING_CAPTCHA_TOKEN",
  "RESET_PASSWORD_EXCEED_LIMIT",
  "TOO_MANY_ATTEMPTS",
  "TOO_MANY_ATTEMPTS_TRY_LATER",
  "USER_DISABLED",
  "USER_NOT_FOUND"
]);

export class PasswordResetInfrastructureError extends Error {
  constructor(message = "Der Passwort-Reset-Dienst ist vorübergehend nicht erreichbar.", options = {}) {
    super(message, options);
    this.name = "PasswordResetInfrastructureError";
    this.status = 503;
  }
}

export class PasswordInvitationInvalidError extends Error {
  constructor() {
    super(PASSWORD_INVITATION_INVALID_MESSAGE);
    this.name = "PasswordInvitationInvalidError";
    this.status = 400;
  }
}

class IdentityPlatformRequestError extends Error {
  constructor(code, options = {}) {
    super("Identity Platform hat die Passwort-Reset-Anfrage nicht verarbeitet.", options);
    this.name = "IdentityPlatformRequestError";
    this.code = code;
    this.accountPrivate = ACCOUNT_PRIVATE_IDENTITY_ERRORS.has(code);
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
  now = Date.now()
}) {
  const timestamp = Number(now);
  const preparedAt = canonicalIsoTimestamp(value?.prepared_at);
  const acceptedAt = canonicalIsoTimestamp(value?.accepted_at);
  const expiresAt = canonicalIsoTimestamp(value?.expires_at);
  const email = normalizePasswordResetEmail(value?.email);
  if (
    !exactKeys(value, PASSWORD_INVITATION_KEYS)
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
    || timestamp >= expiresAt
  ) {
    throw invalidInvitation();
  }
  return Object.freeze({ ...value });
}

function infrastructureError(cause) {
  if (cause instanceof PasswordResetInfrastructureError) return cause;
  return new PasswordResetInfrastructureError(undefined, { cause });
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
  const hasPasswordEvidence = (
    (typeof user.passwordHash === "string" && user.passwordHash.length > 0)
    || (typeof user.passwordSalt === "string" && user.passwordSalt.length > 0)
    || (typeof user.password === "string" && user.password.length > 0)
    || (typeof user.salt === "string" && user.salt.length > 0)
    || (typeof user.rawPassword === "string" && user.rawPassword.length > 0)
    || (Number.isInteger(user.version) && user.version > 0)
    || (typeof user.passwordUpdatedAt === "number" && Number.isFinite(user.passwordUpdatedAt) && user.passwordUpdatedAt > 0)
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
    || parsed.searchParams.get("apiKey") !== apiKey
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
  return branded.href;
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
      metadataUrl.searchParams.set("fields", "name,size,contentType,generation");
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
      const metadata = metadataBody.value;
      const generation = String(metadata.generation || "");
      const objectSize = String(metadata.size || "");
      if (
        !exactKeys(metadata, ["contentType", "generation", "name", "size"])
        || metadata.name !== objectName
        || metadata.contentType !== "application/json"
        || !/^[1-9][0-9]{0,30}$/u.test(generation)
        || !/^[1-9][0-9]{0,4}$/u.test(objectSize)
        || Number(objectSize) > MAX_PASSWORD_INVITATION_BYTES
      ) {
        throw infrastructureError();
      }
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
        value: mediaBody.value
      });
    },
    async deleteActive(objectName, generation) {
      if (!/^[1-9][0-9]{0,30}$/u.test(String(generation || ""))) {
        throw infrastructureError();
      }
      const url = new URL(`${bucketPath}/${encodeURIComponent(objectName)}`);
      url.searchParams.set("ifGenerationMatch", generation);
      const response = await storageFetch(url.href, { method: "DELETE" });
      if (response.status === 404 || response.status === 412) return false;
      if (response.status !== 204) throw infrastructureError();
      return true;
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

  async function post(pathname, body) {
    let token;
    try {
      token = await accessTokenProvider();
    } catch (cause) {
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
      throw infrastructureError(cause);
    }
    const payload = await boundedJsonResponse(response);
    if (!response.ok) {
      throw new IdentityPlatformRequestError(identityPlatformErrorCode(payload));
    }
    return payload;
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
        if (error instanceof IdentityPlatformRequestError && error.accountPrivate) return null;
        throw infrastructureError(error);
      }
    },
    async sendPasswordReset(email, userIp) {
      try {
        const payload = await post("/accounts:sendOobCode", {
          requestType: "PASSWORD_RESET",
          email,
          userIp,
          continueUrl: resetContinueUrl,
          canHandleCodeInApp: false,
          returnOobLink: false,
          clientType: "CLIENT_TYPE_WEB",
          ...(tenantId ? { tenantId } : {})
        });
        if (
          payload.oobLink !== undefined
          || normalizePasswordResetEmail(payload.email) !== email
        ) {
          throw infrastructureError();
        }
        return true;
      } catch (error) {
        if (error instanceof IdentityPlatformRequestError && error.accountPrivate) return false;
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
        });
        if (
          payload.email !== undefined
          && normalizePasswordResetEmail(payload.email) !== email
        ) {
          throw infrastructureError();
        }
        return brandedPasswordActionUrl(String(payload.oobLink || ""), {
          projectId,
          apiKey,
          continueUrl: resetContinueUrl
        });
      } catch (error) {
        if (error instanceof IdentityPlatformRequestError && error.accountPrivate) return null;
        throw infrastructureError(error);
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
  invitationStore = null,
  isEligibleUser = async () => true,
  projectId = "",
  tenantId = "",
  continueUrl = "",
  rateLimiter = createPasswordResetRateLimiter(),
  onDeliveryError = async () => {},
  now = () => Date.now(),
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  minimumResponseMs = 750
}) {
  if (
    !identityClient
    || typeof identityClient.lookupByEmail !== "function"
    || typeof identityClient.sendPasswordReset !== "function"
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
      || typeof invitationStore?.deleteActive !== "function"
      || typeof identityClient.generatePasswordResetActionUrl !== "function"
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(String(projectId || ""))
      || (tenantId && !/^[A-Za-z0-9_-]{1,128}$/u.test(tenantId))
      || canonicalHttpsStartUrl(continueUrl) !== continueUrl
    )
  ) {
    throw new TypeError("Die Passwort-Einladungs-Abhängigkeiten sind unvollständig.");
  }

  const pendingDeliveries = new Set();

  function schedulePasswordReset(email, clientIp) {
    const delivery = Promise.resolve()
      .then(() => identityClient.sendPasswordReset(email, clientIp))
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

  async function redeemInvitation(invitationToken, clientIp) {
    if (!invitationEnabled || !isIP(clientIp)) throw invalidInvitation();
    const objectName = passwordInvitationObjectName(invitationToken);
    if (!rateLimiter.allow(`password-invitation:${objectName}`, clientIp)) {
      throw invalidInvitation();
    }
    const stored = await invitationStore.getActive(objectName);
    if (!stored) throw invalidInvitation();
    const invitation = validateActivePasswordInvitation(stored.value, {
      projectId,
      tenantId,
      continueUrl,
      now: now()
    });
    const rawUser = await identityClient.lookupByEmail(invitation.email);
    const user = exactPasswordOnlyIdentityUser(rawUser, invitation.email, tenantId);
    if (
      !user
      || user.uid !== invitation.uid
      || !(await isEligibleUser(user))
    ) {
      throw invalidInvitation();
    }
    if (!(await invitationStore.deleteActive(objectName, stored.generation))) {
      throw invalidInvitation();
    }
    const actionUrl = await identityClient.generatePasswordResetActionUrl(invitation.email);
    if (!actionUrl) throw invalidInvitation();
    return Object.freeze({ redeemed: true, actionUrl });
  }

  return Object.freeze({
    async request({ email: inputEmail, invitationToken, clientIp }) {
      const startedAt = now();
      try {
        if (invitationToken !== undefined) {
          return await redeemInvitation(invitationToken, clientIp);
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
        schedulePasswordReset(email, clientIp);
        return PASSWORD_RESET_ACCEPTED_RESPONSE;
      } catch (cause) {
        if (cause instanceof PasswordInvitationInvalidError) throw cause;
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
