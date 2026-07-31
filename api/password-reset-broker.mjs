import crypto from "node:crypto";
import { isIP } from "node:net";

export const PASSWORD_RESET_BROKER_PATH = "/api/auth/password-reset";
export const PASSWORD_RESET_ACCEPTED_RESPONSE = Object.freeze({ accepted: true });

const IDENTITY_TOOLKIT_ORIGIN = "https://identitytoolkit.googleapis.com";
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const MAX_IDENTITY_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RATE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_IP_LIMIT = 20;
const DEFAULT_EMAIL_LIMIT = 5;
const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 10_000;
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
  isEligibleUser = async () => true,
  tenantId = "",
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

  return Object.freeze({
    async request({ email: inputEmail, clientIp }) {
      const startedAt = now();
      try {
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
