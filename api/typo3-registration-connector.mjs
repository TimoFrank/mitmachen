import crypto from "node:crypto";

export const TYPO3_REGISTRATION_CONNECTOR_PATH = "/api/connectors/typo3/mitmachen-registrations";
export const TYPO3_REGISTRATION_SCHEMA_VERSION = "mitmachen-typo3-registration-v1";
export const TYPO3_CONNECTOR_SIGNATURE_VERSION = "v1";
export const TYPO3_CONNECTOR_BODY_LIMIT_BYTES = 24_000;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const MESSAGE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const PAYLOAD_FIELDS = new Set([
  "schema_version",
  "submission_id",
  "submitted_at",
  "source_form_uid",
  "source_record_uid",
  "source_url",
  "form_version",
  "privacy_notice_version",
  "privacy_notice_presented_at",
  "consent_text_version",
  "email_permission_requested",
  "email",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "organization",
  "sector",
  "message",
  "language"
]);

const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  "schema_version",
  "submission_id",
  "submitted_at",
  "source_form_uid",
  "source_record_uid",
  "source_url",
  "form_version",
  "privacy_notice_version",
  "privacy_notice_presented_at",
  "consent_text_version",
  "email_permission_requested",
  "email",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "organization",
  "sector",
  "message",
  "language"
]);

export class Typo3ConnectorError extends Error {
  constructor(message, status = 400, code = "TYPO3_CONNECTOR_INVALID_REQUEST") {
    super(message);
    this.name = "Typo3ConnectorError";
    this.status = status;
    this.code = code;
  }
}

function configurationError(message) {
  throw new Error(`TYPO3-Connector-Konfiguration: ${message}`);
}

function configuredText(env, name, { required = false, maxLength = 500 } = {}) {
  const value = String(env[name] || "").trim();
  if (required && !value) configurationError(`${name} fehlt.`);
  if (value.length > maxLength) configurationError(`${name} ist zu lang.`);
  return value;
}

function configuredInteger(env, name, fallback, minimum, maximum) {
  const raw = String(env[name] ?? "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    configurationError(`${name} muss eine ganze Zahl zwischen ${minimum} und ${maximum} sein.`);
  }
  return value;
}

function canonicalBase64Secret(value, label) {
  const encoded = String(value || "").trim();
  if (
    !encoded
    || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)
  ) {
    configurationError(`${label} muss ein kanonisch base64-kodiertes Secret sein.`);
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length < 32) configurationError(`${label} muss mindestens 32 Byte Entropie enthalten.`);
  if (decoded.toString("base64") !== encoded) configurationError(`${label} ist nicht kanonisch base64-kodiert.`);
  return decoded;
}

function configuredHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    configurationError(`${label} muss eine gueltige HTTPS-URL sein.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.hash
    || parsed.href !== value
  ) {
    configurationError(`${label} muss eine kanonische HTTPS-URL ohne Zugangsdaten oder Fragment sein.`);
  }
  return parsed;
}

function addConfiguredKey(keys, keyId, encodedSecret, label) {
  const id = String(keyId || "").trim();
  const secret = String(encodedSecret || "").trim();
  if (!id && !secret) return;
  if (!id || !secret) configurationError(`${label}-Key-ID und -Secret muessen gemeinsam gesetzt sein.`);
  if (!KEY_ID_PATTERN.test(id)) configurationError(`${label}-Key-ID ist ungueltig.`);
  if (keys.has(id)) configurationError("Aktuelle und vorherige Key-ID muessen verschieden sein.");
  keys.set(id, canonicalBase64Secret(secret, `${label}-Secret`));
}

export function typo3ConnectorConfiguration(env = process.env) {
  const enabled = String(env.TYPO3_CONNECTOR_ENABLED || "0").trim() === "1";
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      keys: new Map(),
      bodyLimitBytes: TYPO3_CONNECTOR_BODY_LIMIT_BYTES,
      clockSkewSeconds: 300
    });
  }

  const keys = new Map();
  addConfiguredKey(
    keys,
    configuredText(env, "TYPO3_CONNECTOR_KEY_ID", { required: true, maxLength: 64 }),
    configuredText(env, "TYPO3_CONNECTOR_HMAC_SECRET_BASE64", { required: true, maxLength: 4096 }),
    "Aktueller"
  );
  addConfiguredKey(
    keys,
    configuredText(env, "TYPO3_CONNECTOR_PREVIOUS_KEY_ID", { maxLength: 64 }),
    configuredText(env, "TYPO3_CONNECTOR_PREVIOUS_HMAC_SECRET_BASE64", { maxLength: 4096 }),
    "Vorheriger"
  );

  const sourceUrl = configuredHttpsUrl(
    configuredText(env, "TYPO3_CONNECTOR_SOURCE_URL", { required: true }),
    "TYPO3_CONNECTOR_SOURCE_URL"
  );
  const formVersion = configuredText(env, "TYPO3_CONNECTOR_FORM_VERSION", { required: true, maxLength: 120 });
  const privacyNoticeVersion = configuredText(
    env,
    "TYPO3_CONNECTOR_PRIVACY_NOTICE_VERSION",
    { required: true, maxLength: 120 }
  );
  const consentTextVersion = configuredText(
    env,
    "TYPO3_CONNECTOR_CONSENT_TEXT_VERSION",
    { required: true, maxLength: 120 }
  );

  return Object.freeze({
    enabled: true,
    keys,
    formUid: configuredInteger(env, "TYPO3_CONNECTOR_FORM_UID", 41, 1, 2_147_483_647),
    sourceUrl: sourceUrl.href,
    formVersion,
    privacyNoticeVersion,
    consentTextVersion,
    bodyLimitBytes: configuredInteger(
      env,
      "TYPO3_CONNECTOR_BODY_LIMIT_BYTES",
      TYPO3_CONNECTOR_BODY_LIMIT_BYTES,
      1024,
      64 * 1024
    ),
    clockSkewSeconds: configuredInteger(env, "TYPO3_CONNECTOR_CLOCK_SKEW_SECONDS", 300, 30, 900)
  });
}

function headerValue(request, name) {
  const value = request?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "").trim() : "";
  return String(value || "").trim();
}

function connectorRequestError(
  message = "Connector-Authentifizierung fehlgeschlagen.",
  status = 401,
  code = "TYPO3_CONNECTOR_AUTH_FAILED"
) {
  return new Typo3ConnectorError(message, status, code);
}

export function typo3ConnectorSigningInput(keyId, unixSeconds, rawBody) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const bodySha256 = crypto.createHash("sha256").update(body).digest("hex");
  return [
    TYPO3_CONNECTOR_SIGNATURE_VERSION,
    String(keyId),
    String(unixSeconds),
    bodySha256
  ].join("\n");
}

export function signTypo3ConnectorBody(secret, keyId, unixSeconds, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(typo3ConnectorSigningInput(keyId, unixSeconds, rawBody), "utf8")
    .digest("hex");
}

export function verifyTypo3ConnectorRequest(request, rawBody, configuration, nowMs = Date.now()) {
  if (!configuration?.enabled) {
    throw connectorRequestError("Not found", 404, "TYPO3_CONNECTOR_DISABLED");
  }
  const keyId = headerValue(request, "x-mitmachen-key-id");
  const timestampHeader = headerValue(request, "x-mitmachen-timestamp");
  const signatureHeader = headerValue(request, "x-mitmachen-signature");
  if (!KEY_ID_PATTERN.test(keyId) || !/^\d{10}$/u.test(timestampHeader) || !/^sha256=[a-f0-9]{64}$/u.test(signatureHeader)) {
    throw connectorRequestError();
  }
  const secret = configuration.keys.get(keyId);
  if (!secret) throw connectorRequestError();
  const unixSeconds = Number(timestampHeader);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (
    !Number.isSafeInteger(unixSeconds)
    || Math.abs(nowSeconds - unixSeconds) > configuration.clockSkewSeconds
  ) {
    throw connectorRequestError();
  }
  const expected = Buffer.from(signTypo3ConnectorBody(secret, keyId, unixSeconds, rawBody), "hex");
  const supplied = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    throw connectorRequestError();
  }
  return Object.freeze({ keyId, unixSeconds });
}

export async function readTypo3ConnectorBody(request, maximumBytes = TYPO3_CONNECTOR_BODY_LIMIT_BYTES) {
  const contentType = headerValue(request, "content-type").toLowerCase();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(contentType)) {
    throw new Typo3ConnectorError(
      "Der Connector akzeptiert ausschliesslich application/json mit UTF-8.",
      415,
      "TYPO3_CONNECTOR_CONTENT_TYPE"
    );
  }
  const contentLength = Number(headerValue(request, "content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Typo3ConnectorError("Die Connector-Anfrage ist zu gross.", 413, "TYPO3_CONNECTOR_BODY_TOO_LARGE");
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > maximumBytes) {
      throw new Typo3ConnectorError("Die Connector-Anfrage ist zu gross.", 413, "TYPO3_CONNECTOR_BODY_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  if (!totalBytes) {
    throw new Typo3ConnectorError("Die Connector-Anfrage ist leer.", 400, "TYPO3_CONNECTOR_EMPTY_BODY");
  }
  return Buffer.concat(chunks, totalBytes);
}

function parseCanonicalUtc(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const timestamp = typeof value === "string" ? value : "";
  if (!CANONICAL_UTC_PATTERN.test(timestamp)) {
    throw new Typo3ConnectorError(`${field} muss ein kanonischer UTC-Zeitstempel sein.`);
  }
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Typo3ConnectorError(`${field} muss ein gueltiger UTC-Zeitstempel sein.`);
  }
  const milliseconds = parsed.toISOString();
  const seconds = milliseconds.replace(/\.000Z$/u, "Z");
  if (timestamp !== milliseconds && timestamp !== seconds) {
    throw new Typo3ConnectorError(`${field} muss ein kanonischer UTC-Zeitstempel sein.`);
  }
  return timestamp;
}

function text(value, field, maximumLength, { required = false, message = false } = {}) {
  if (value === null && !required) return null;
  if (typeof value !== "string") throw new Typo3ConnectorError(`${field} muss Text oder null sein.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Typo3ConnectorError(`${field} ist erforderlich.`);
  if ([...normalized].length > maximumLength) throw new Typo3ConnectorError(`${field} ist laenger als erlaubt.`);
  const controlPattern = message ? MESSAGE_CONTROL_PATTERN : SINGLE_LINE_CONTROL_PATTERN;
  if (controlPattern.test(normalized)) throw new Typo3ConnectorError(`${field} enthaelt unzulaessige Steuerzeichen.`);
  return normalized || null;
}

function requiredText(value, field, maximumLength) {
  return text(value, field, maximumLength, { required: true });
}

function validateSourceUrl(value, configuration) {
  const source = requiredText(value, "source_url", 500);
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Typo3ConnectorError("source_url ist ungueltig.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.hash
    || parsed.href !== source
    || parsed.href !== configuration.sourceUrl
  ) {
    throw new Typo3ConnectorError("source_url ist fuer diesen Connector nicht freigegeben.");
  }
  return source;
}

function parsePayloadObject(rawBody) {
  let value;
  try {
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    value = JSON.parse(bodyText);
  } catch {
    throw new Typo3ConnectorError("Die Connector-Anfrage enthaelt kein gueltiges JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Typo3ConnectorError("Die Connector-Anfrage muss ein JSON-Objekt enthalten.");
  }
  const unknown = Object.keys(value).filter((field) => !PAYLOAD_FIELDS.has(field));
  if (unknown.length) throw new Typo3ConnectorError("Die Connector-Anfrage enthaelt unbekannte Felder.");
  const missing = REQUIRED_PAYLOAD_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing.length) throw new Typo3ConnectorError("Die Connector-Anfrage ist unvollstaendig.");
  return value;
}

export function normalizeTypo3RegistrationPayload(rawBody, configuration, nowMs = Date.now()) {
  const input = parsePayloadObject(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody));
  if (input.schema_version !== TYPO3_REGISTRATION_SCHEMA_VERSION) {
    throw new Typo3ConnectorError("schema_version wird nicht unterstuetzt.");
  }
  const submissionId = String(input.submission_id || "").trim().toLowerCase();
  if (!UUID_V4_PATTERN.test(submissionId)) throw new Typo3ConnectorError("submission_id muss eine UUIDv4 sein.");
  if (!Number.isSafeInteger(input.source_form_uid) || input.source_form_uid !== configuration.formUid) {
    throw new Typo3ConnectorError("source_form_uid ist fuer diesen Connector nicht freigegeben.");
  }
  if (
    !Number.isSafeInteger(input.source_record_uid)
    || input.source_record_uid < 1
    || input.source_record_uid > Number.MAX_SAFE_INTEGER
  ) {
    throw new Typo3ConnectorError("source_record_uid ist ungueltig.");
  }

  const submittedAt = parseCanonicalUtc(input.submitted_at, "submitted_at");
  const privacyNoticePresentedAt = parseCanonicalUtc(
    input.privacy_notice_presented_at,
    "privacy_notice_presented_at"
  );
  const submittedMs = new Date(submittedAt).getTime();
  const privacyPresentedMs = new Date(privacyNoticePresentedAt).getTime();
  if (submittedMs > nowMs + configuration.clockSkewSeconds * 1000) {
    throw new Typo3ConnectorError("submitted_at darf nicht in der Zukunft liegen.");
  }
  if (privacyPresentedMs > submittedMs || submittedMs - privacyPresentedMs > 24 * 60 * 60 * 1000) {
    throw new Typo3ConnectorError("privacy_notice_presented_at passt nicht zum Absendezeitpunkt.");
  }

  const formVersion = requiredText(input.form_version, "form_version", 120);
  const privacyNoticeVersion = requiredText(input.privacy_notice_version, "privacy_notice_version", 120);
  if (formVersion !== configuration.formVersion) {
    throw new Typo3ConnectorError("form_version ist nicht freigegeben.");
  }
  if (privacyNoticeVersion !== configuration.privacyNoticeVersion) {
    throw new Typo3ConnectorError("privacy_notice_version ist nicht freigegeben.");
  }
  if (typeof input.email_permission_requested !== "boolean") {
    throw new Typo3ConnectorError("email_permission_requested muss boolesch sein.");
  }
  const consentTextVersion = text(input.consent_text_version, "consent_text_version", 120);
  if (
    (input.email_permission_requested && consentTextVersion !== configuration.consentTextVersion)
    || (!input.email_permission_requested && consentTextVersion !== null)
  ) {
    throw new Typo3ConnectorError("consent_text_version passt nicht zur optionalen Auswahl.");
  }

  const email = requiredText(input.email, "email", 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Typo3ConnectorError("email ist ungueltig.");
  const language = requiredText(input.language, "language", 12).toLowerCase();
  if (language !== "de") throw new Typo3ConnectorError("language wird nicht unterstuetzt.");

  return Object.freeze({
    schemaVersion: TYPO3_REGISTRATION_SCHEMA_VERSION,
    submissionId,
    submittedAt,
    sourceSystem: "typo3_powermail",
    sourceFormUid: input.source_form_uid,
    sourceRecordUid: input.source_record_uid,
    sourceUrl: validateSourceUrl(input.source_url, configuration),
    formVersion,
    privacyNoticeVersion,
    privacyNoticePresentedAt,
    consentTextVersion,
    emailPermissionRequested: input.email_permission_requested,
    emailPermissionStatus: input.email_permission_requested ? "pending" : "not_requested",
    email,
    salutation: text(input.salutation, "salutation", 80),
    title: text(input.title, "title", 80),
    firstName: text(input.first_name, "first_name", 120),
    lastName: text(input.last_name, "last_name", 120),
    organization: text(input.organization, "organization", 240),
    sector: text(input.sector, "sector", 120),
    message: text(input.message, "message", 3000, { message: true }),
    language
  });
}

export function canonicalTypo3RegistrationFingerprint(payload) {
  const canonical = {
    schema_version: payload.schemaVersion,
    submission_id: payload.submissionId,
    submitted_at: payload.submittedAt,
    source_system: payload.sourceSystem,
    source_form_uid: payload.sourceFormUid,
    source_record_uid: payload.sourceRecordUid,
    source_url: payload.sourceUrl,
    form_version: payload.formVersion,
    privacy_notice_version: payload.privacyNoticeVersion,
    privacy_notice_presented_at: payload.privacyNoticePresentedAt,
    consent_text_version: payload.consentTextVersion,
    email_permission_requested: payload.emailPermissionRequested,
    email: payload.email,
    salutation: payload.salutation,
    title: payload.title,
    first_name: payload.firstName,
    last_name: payload.lastName,
    organization: payload.organization,
    sector: payload.sector,
    message: payload.message,
    language: payload.language
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function connectorConflict() {
  return new Typo3ConnectorError(
    "submission_id oder Powermail-Quellvorgang wurde bereits mit abweichenden Daten verwendet.",
    409,
    "TYPO3_CONNECTOR_IDEMPOTENCY_CONFLICT"
  );
}

async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local idle_in_transaction_session_timeout = '15s'");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function persistTypo3Registration(pool, payload, receivedAt = new Date()) {
  const payloadSha256 = canonicalTypo3RegistrationFingerprint(payload);
  return withTransaction(pool, async (client) => {
    const inserted = await client.query(
      `insert into public.network_registrations (
         submission_id,
         schema_version,
         source_system,
         source_form_uid,
         source_record_uid,
         source_payload_sha256,
         received_at,
         submitted_at,
         status,
         onboarding_stage,
         salutation,
         title,
         first_name,
         last_name,
         email,
         organization,
         sector,
         message,
         email_permission_status,
         email_permission_requested_at,
         consent_contact_version,
         privacy_notice_version,
         privacy_notice_presented_at,
         form_version,
         language,
         source_url,
         privacy_check_status
       ) values (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, 'neu', 'registered',
         $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, 'bereit_zur_pruefung'
       )
       on conflict do nothing
       returning id, submission_id`,
      [
        payload.submissionId,
        payload.schemaVersion,
        payload.sourceSystem,
        payload.sourceFormUid,
        payload.sourceRecordUid,
        payloadSha256,
        receivedAt.toISOString(),
        payload.submittedAt,
        payload.salutation,
        payload.title,
        payload.firstName,
        payload.lastName,
        payload.email,
        payload.organization,
        payload.sector,
        payload.message,
        payload.emailPermissionStatus,
        payload.emailPermissionRequested ? payload.submittedAt : null,
        payload.consentTextVersion,
        payload.privacyNoticeVersion,
        payload.privacyNoticePresentedAt,
        payload.formVersion,
        payload.language,
        payload.sourceUrl
      ]
    );
    if (inserted.rows[0]) {
      return Object.freeze({
        created: true,
        duplicate: false,
        id: inserted.rows[0].id,
        submissionId: inserted.rows[0].submission_id,
        emailPermissionStatus: payload.emailPermissionStatus
      });
    }

    const existing = await client.query(
      `select id, submission_id, source_payload_sha256
         from public.network_registrations
        where submission_id = $1::uuid
           or (
             source_system = $2
             and source_form_uid = $3
             and source_record_uid = $4
           )
        order by (submission_id = $1::uuid) desc
        limit 2`,
      [payload.submissionId, payload.sourceSystem, payload.sourceFormUid, payload.sourceRecordUid]
    );
    if (
      existing.rows.length !== 1
      || existing.rows[0].submission_id !== payload.submissionId
      || existing.rows[0].source_payload_sha256 !== payloadSha256
    ) {
      throw connectorConflict();
    }
    return Object.freeze({
      created: false,
      duplicate: true,
      id: existing.rows[0].id,
      submissionId: existing.rows[0].submission_id,
      emailPermissionStatus: payload.emailPermissionStatus
    });
  });
}

export async function receiveTypo3Registration(request, pool, configuration, nowMs = Date.now()) {
  if (!configuration?.enabled) {
    throw connectorRequestError("Not found", 404, "TYPO3_CONNECTOR_DISABLED");
  }
  const rawBody = await readTypo3ConnectorBody(request, configuration.bodyLimitBytes);
  verifyTypo3ConnectorRequest(request, rawBody, configuration, nowMs);
  const payload = normalizeTypo3RegistrationPayload(rawBody, configuration, nowMs);
  const persisted = await persistTypo3Registration(pool, payload, new Date(nowMs));
  return Object.freeze({
    status: persisted.created ? 201 : 200,
    body: {
      ok: true,
      duplicate: persisted.duplicate,
      intake_id: persisted.id,
      submission_id: persisted.submissionId,
      email_permission_status: persisted.emailPermissionStatus
    }
  });
}
