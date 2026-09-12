import crypto from "node:crypto";

export const IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS = 15 * 60;

const PURPOSE = "versorgungs-kompass-single-server-identity";
const GOOGLE_ISSUER = "https://accounts.google.com";
const CLOCK_SKEW_SECONDS = 30;
const MAX_CLAIM_BYTES = 4096;

function reject(message) {
  throw new Error(message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    reject(label + " muss ein Objekt sein.");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    reject(label + " enthaelt fehlende oder nicht erlaubte Felder.");
  }
}

function secretBytes(secretHex) {
  if (typeof secretHex !== "string" || !/^[a-f0-9]{64}$/u.test(secretHex)) {
    reject("Bootstrap-Signaturschluessel ist ungueltig.");
  }
  return Buffer.from(secretHex, "hex");
}

function canonicalEmail(value) {
  const email = String(value || "");
  if (
    email !== email.trim()
    || email !== email.toLowerCase()
    || email.includes("*")
    || !/^[a-z0-9.!#$%&+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(email)
  ) {
    reject("Bootstrap-Claim enthaelt keine kanonische Einzeladresse.");
  }
  return email;
}

function canonicalSubject(value) {
  const subject = String(value || "");
  if (!/^[A-Za-z0-9_-]{6,255}$/u.test(subject) || subject.includes("@")) {
    reject("Bootstrap-Claim enthaelt keinen stabilen Google-Subject-Identifier.");
  }
  return subject;
}

function signatureFor(encodedPayload, secretHex) {
  return crypto
    .createHmac("sha256", secretBytes(secretHex))
    .update("v1." + encodedPayload, "utf8")
    .digest("base64url");
}

export function createIdentityBootstrapClaim({
  issuer,
  subject,
  email,
  emailVerified,
  nowSeconds = Math.floor(Date.now() / 1000),
  nonce = crypto.randomBytes(16).toString("base64url")
}, secretHex) {
  if (issuer !== GOOGLE_ISSUER || emailVerified !== true) {
    reject("Nur eine verifizierte Google-Identitaet darf einen Bootstrap-Claim erhalten.");
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 1) {
    reject("Bootstrap-Zeitpunkt ist ungueltig.");
  }
  if (!/^[A-Za-z0-9_-]{22}$/u.test(nonce)) {
    reject("Bootstrap-Nonce ist ungueltig.");
  }
  const payload = {
    purpose: PURPOSE,
    issuer: GOOGLE_ISSUER,
    subject: canonicalSubject(subject),
    email: canonicalEmail(email),
    emailVerified: true,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS,
    nonce
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signatureFor(encodedPayload, secretHex);
  return Object.freeze({
    bootstrapClaim: `v1.${encodedPayload}.${signature}`,
    expiresAt: payload.expiresAt
  });
}

export function verifyIdentityBootstrapClaim(bootstrapClaim, secretHex, {
  nowSeconds = Math.floor(Date.now() / 1000)
} = {}) {
  if (
    typeof bootstrapClaim !== "string"
    || bootstrapClaim.length < 64
    || Buffer.byteLength(bootstrapClaim, "utf8") > MAX_CLAIM_BYTES
  ) {
    reject("Bootstrap-Claim ist ungueltig.");
  }
  const parts = bootstrapClaim.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^[A-Za-z0-9_-]+$/u.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/u.test(parts[2])) {
    reject("Bootstrap-Claim besitzt kein freigegebenes Format.");
  }
  const expectedSignature = signatureFor(parts[1], secretHex);
  const suppliedBytes = Buffer.from(parts[2], "base64url");
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  if (
    suppliedBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    reject("Bootstrap-Claim-Signatur ist ungueltig.");
  }
  let payload;
  try {
    const decoded = Buffer.from(parts[1], "base64url");
    if (decoded.toString("base64url") !== parts[1]) reject("Bootstrap-Claim ist nicht kanonisch codiert.");
    payload = JSON.parse(decoded.toString("utf8"));
  } catch {
    reject("Bootstrap-Claim-Payload ist ungueltig.");
  }
  exactKeys(payload, [
    "purpose",
    "issuer",
    "subject",
    "email",
    "emailVerified",
    "issuedAt",
    "expiresAt",
    "nonce"
  ], "Bootstrap-Claim-Payload");
  if (
    payload.purpose !== PURPOSE
    || payload.issuer !== GOOGLE_ISSUER
    || payload.emailVerified !== true
    || !/^[A-Za-z0-9_-]{22}$/u.test(String(payload.nonce || ""))
  ) {
    reject("Bootstrap-Claim ist nicht fuer diese Identitaetsbindung ausgestellt.");
  }
  if (
    !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.expiresAt - payload.issuedAt !== IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS
    || payload.issuedAt > nowSeconds + CLOCK_SKEW_SECONDS
    || payload.expiresAt <= nowSeconds
  ) {
    reject("Bootstrap-Claim ist abgelaufen oder besitzt ein ungueltiges Zeitfenster.");
  }
  return Object.freeze({
    issuer: GOOGLE_ISSUER,
    subject: canonicalSubject(payload.subject),
    email: canonicalEmail(payload.email),
    emailVerified: true,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt
  });
}
