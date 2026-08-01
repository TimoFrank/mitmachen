import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";

import {
  TYPO3_CONNECTOR_BODY_LIMIT_BYTES,
  TYPO3_REGISTRATION_SCHEMA_VERSION,
  Typo3ConnectorError,
  canonicalTypo3RegistrationFingerprint,
  normalizeTypo3RegistrationPayload,
  persistTypo3Registration,
  readTypo3ConnectorBody,
  receiveTypo3Registration,
  signTypo3ConnectorBody,
  typo3ConnectorConfiguration,
  typo3ConnectorSigningInput,
  verifyTypo3ConnectorRequest
} from "../api/typo3-registration-connector.mjs";

const NOW_MS = Date.parse("2026-07-30T10:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const CURRENT_SECRET = Buffer.alloc(32, 0x41);
const PREVIOUS_SECRET = Buffer.alloc(32, 0x42);
const ENVIRONMENT = Object.freeze({
  TYPO3_CONNECTOR_ENABLED: "1",
  TYPO3_CONNECTOR_KEY_ID: "mitmachen-2026-07",
  TYPO3_CONNECTOR_HMAC_SECRET_BASE64: CURRENT_SECRET.toString("base64"),
  TYPO3_CONNECTOR_PREVIOUS_KEY_ID: "mitmachen-2026-06",
  TYPO3_CONNECTOR_PREVIOUS_HMAC_SECRET_BASE64: PREVIOUS_SECRET.toString("base64"),
  TYPO3_CONNECTOR_FORM_UID: "41",
  TYPO3_CONNECTOR_SOURCE_URL: "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
  TYPO3_CONNECTOR_FORM_VERSION: "powermail-41-2026-07-30",
  TYPO3_CONNECTOR_PRIVACY_NOTICE_VERSION: "mitmachen-dse-2026-07-30",
  TYPO3_CONNECTOR_CONSENT_TEXT_VERSION: "mitmachen-email-2026-07-30",
  TYPO3_CONNECTOR_BODY_LIMIT_BYTES: String(TYPO3_CONNECTOR_BODY_LIMIT_BYTES),
  TYPO3_CONNECTOR_CLOCK_SKEW_SECONDS: "300"
});
const CONFIGURATION = typo3ConnectorConfiguration(ENVIRONMENT);
const DISABLED_CONFIGURATION = typo3ConnectorConfiguration({});
const readProjectFile = (relativePath) => fs.readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8"
);

const BASE_PAYLOAD = Object.freeze({
  schema_version: TYPO3_REGISTRATION_SCHEMA_VERSION,
  submission_id: "970aeb47-0f17-4c22-a0bd-177557bad900",
  submitted_at: "2026-07-30T09:59:30Z",
  source_form_uid: 41,
  source_record_uid: 12345,
  source_url: ENVIRONMENT.TYPO3_CONNECTOR_SOURCE_URL,
  form_version: ENVIRONMENT.TYPO3_CONNECTOR_FORM_VERSION,
  privacy_notice_version: ENVIRONMENT.TYPO3_CONNECTOR_PRIVACY_NOTICE_VERSION,
  privacy_notice_presented_at: "2026-07-30T09:55:00Z",
  consent_text_version: null,
  email_permission_requested: false,
  email: "person@example.invalid",
  salutation: null,
  title: null,
  first_name: null,
  last_name: null,
  organization: null,
  sector: null,
  message: null,
  language: "de"
});

function rawPayload(overrides = {}) {
  return Buffer.from(JSON.stringify({ ...BASE_PAYLOAD, ...overrides }), "utf8");
}

function streamRequest(rawBody, headers = {}) {
  const request = Readable.from(rawBody.length ? [rawBody] : []);
  request.headers = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
  request.socket = { remoteAddress: "192.0.2.10" };
  return request;
}

function signedHeaders(rawBody, {
  keyId = ENVIRONMENT.TYPO3_CONNECTOR_KEY_ID,
  secret = CURRENT_SECRET,
  timestamp = NOW_SECONDS,
  signature
} = {}) {
  const digest = signature ?? signTypo3ConnectorBody(secret, keyId, timestamp, rawBody);
  return {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(rawBody.length),
    "x-mitmachen-key-id": keyId,
    "x-mitmachen-timestamp": String(timestamp),
    "x-mitmachen-signature": `sha256=${digest}`,
    "x-request-id": crypto.randomUUID()
  };
}

function mockPool({ insertRows = [], selectRows = [] } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/insert into public\.network_registrations/u.test(sql)) return { rows: insertRows };
      if (/from public\.network_registrations/u.test(sql)) return { rows: selectRows };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "release", params: [] });
    }
  };
  return {
    calls,
    async connect() {
      return client;
    }
  };
}

assert.equal(typo3ConnectorConfiguration({}).enabled, false);
assert.equal(CONFIGURATION.enabled, true);
assert.equal(CONFIGURATION.keys.size, 2);
assert.deepEqual(CONFIGURATION.keys.get("mitmachen-2026-07"), CURRENT_SECRET);
assert.throws(
  () => typo3ConnectorConfiguration({
    ...ENVIRONMENT,
    TYPO3_CONNECTOR_HMAC_SECRET_BASE64: Buffer.from("too-short").toString("base64")
  }),
  /base64|32 Byte/u
);
assert.throws(
  () => typo3ConnectorConfiguration({ ...ENVIRONMENT, TYPO3_CONNECTOR_FORM_VERSION: "" }),
  /FORM_VERSION/u
);
assert.throws(
  () => typo3ConnectorConfiguration({
    ...ENVIRONMENT,
    TYPO3_CONNECTOR_SOURCE_URL: "http://www.gematik.de/mitmachen/versorgungs-netzwerk"
  }),
  /HTTPS/u
);

const signatureBody = rawPayload();
const signingInput = typo3ConnectorSigningInput(
  ENVIRONMENT.TYPO3_CONNECTOR_KEY_ID,
  NOW_SECONDS,
  signatureBody
);
assert.equal(
  signingInput,
  `v1\n${ENVIRONMENT.TYPO3_CONNECTOR_KEY_ID}\n${NOW_SECONDS}\n${crypto.createHash("sha256").update(signatureBody).digest("hex")}`
);
assert.equal(
  signTypo3ConnectorBody(CURRENT_SECRET, ENVIRONMENT.TYPO3_CONNECTOR_KEY_ID, NOW_SECONDS, signatureBody),
  crypto.createHmac("sha256", CURRENT_SECRET).update(signingInput, "utf8").digest("hex")
);
assert.equal(
  verifyTypo3ConnectorRequest(
    { headers: signedHeaders(signatureBody) },
    signatureBody,
    CONFIGURATION,
    NOW_MS
  ).keyId,
  ENVIRONMENT.TYPO3_CONNECTOR_KEY_ID
);
assert.equal(
  verifyTypo3ConnectorRequest(
    {
      headers: signedHeaders(signatureBody, {
        keyId: ENVIRONMENT.TYPO3_CONNECTOR_PREVIOUS_KEY_ID,
        secret: PREVIOUS_SECRET
      })
    },
    signatureBody,
    CONFIGURATION,
    NOW_MS
  ).keyId,
  ENVIRONMENT.TYPO3_CONNECTOR_PREVIOUS_KEY_ID
);
for (const headers of [
  signedHeaders(signatureBody, { keyId: "unknown-key" }),
  signedHeaders(signatureBody, { timestamp: NOW_SECONDS - 301 }),
  signedHeaders(signatureBody, { signature: "0".repeat(64) }),
  { ...signedHeaders(signatureBody), "x-mitmachen-signature": "v1=invalid" }
]) {
  assert.throws(
    () => verifyTypo3ConnectorRequest({ headers }, signatureBody, CONFIGURATION, NOW_MS),
    (error) => error instanceof Typo3ConnectorError && error.status === 401
  );
}
assert.throws(
  () => verifyTypo3ConnectorRequest(
    { headers: signedHeaders(signatureBody) },
    Buffer.concat([signatureBody, Buffer.from(" ")]),
    CONFIGURATION,
    NOW_MS
  ),
  (error) => error instanceof Typo3ConnectorError && error.status === 401
);

assert.deepEqual(
  await readTypo3ConnectorBody(
    streamRequest(signatureBody, { "content-type": "application/json", "content-length": signatureBody.length }),
    TYPO3_CONNECTOR_BODY_LIMIT_BYTES
  ),
  signatureBody
);
await assert.rejects(
  readTypo3ConnectorBody(streamRequest(signatureBody, { "content-type": "text/plain" })),
  (error) => error.status === 415
);
await assert.rejects(
  readTypo3ConnectorBody(
    streamRequest(Buffer.alloc(11), { "content-type": "application/json", "content-length": "11" }),
    10
  ),
  (error) => error.status === 413
);
await assert.rejects(
  readTypo3ConnectorBody(streamRequest(Buffer.alloc(0), { "content-type": "application/json" })),
  (error) => error.code === "TYPO3_CONNECTOR_EMPTY_BODY"
);

const normalized = normalizeTypo3RegistrationPayload(signatureBody, CONFIGURATION, NOW_MS);
assert.equal(normalized.emailPermissionStatus, "not_requested");
assert.equal(normalized.firstName, null);
assert.equal(normalized.lastName, null);
assert.equal(normalized.email, "person@example.invalid");

const optedIn = normalizeTypo3RegistrationPayload(
  rawPayload({
    email_permission_requested: true,
    consent_text_version: ENVIRONMENT.TYPO3_CONNECTOR_CONSENT_TEXT_VERSION,
    first_name: "  Ada  ",
    last_name: "Lovelace"
  }),
  CONFIGURATION,
  NOW_MS
);
assert.equal(optedIn.emailPermissionStatus, "pending");
assert.equal(optedIn.firstName, "Ada");
assert.notEqual(optedIn.emailPermissionStatus, "granted");

for (const overrides of [
  { source_form_uid: 42 },
  { source_url: "https://attacker.invalid/" },
  { form_version: "old" },
  { privacy_notice_version: "old" },
  { email_permission_requested: true, consent_text_version: null },
  { email_permission_requested: false, consent_text_version: ENVIRONMENT.TYPO3_CONNECTOR_CONSENT_TEXT_VERSION },
  { submitted_at: "2026-07-30T10:10:00Z" },
  { privacy_notice_presented_at: "2026-07-30T10:00:00Z" },
  { email: "not-an-email" },
  { language: "en" }
]) {
  assert.throws(
    () => normalizeTypo3RegistrationPayload(rawPayload(overrides), CONFIGURATION, NOW_MS),
    Typo3ConnectorError
  );
}
assert.throws(
  () => normalizeTypo3RegistrationPayload(
    Buffer.from(JSON.stringify({ ...BASE_PAYLOAD, datenschutzhinweis: true })),
    CONFIGURATION,
    NOW_MS
  ),
  /unbekannte Felder/u,
  "Der alte Pflichtmarker darf weder Einwilligung noch Intake-Status steuern."
);
assert.throws(
  () => normalizeTypo3RegistrationPayload(Buffer.from([0x7b, 0xff, 0x7d]), CONFIGURATION, NOW_MS),
  /gueltiges JSON/u
);
assert.equal(canonicalTypo3RegistrationFingerprint(normalized).length, 64);
assert.equal(
  canonicalTypo3RegistrationFingerprint(normalized),
  canonicalTypo3RegistrationFingerprint(normalized)
);

const createdPool = mockPool({
  insertRows: [{
    id: "intake-1",
    submission_id: BASE_PAYLOAD.submission_id
  }]
});
const created = await persistTypo3Registration(createdPool, normalized, new Date(NOW_MS));
assert.equal(created.created, true);
assert.equal(created.duplicate, false);
const insertCall = createdPool.calls.find(({ sql }) => /insert into public\.network_registrations/u.test(sql));
assert.equal(insertCall.params.length, 24);
assert.equal(insertCall.params[17], null);
assert.equal(insertCall.params[18], null);
assert.ok(createdPool.calls.some(({ sql }) => sql === "commit"));
assert.ok(createdPool.calls.some(({ sql }) => sql === "release"));

const payloadSha256 = canonicalTypo3RegistrationFingerprint(normalized);
const duplicatePool = mockPool({
  selectRows: [{
    id: "intake-1",
    submission_id: BASE_PAYLOAD.submission_id,
    source_payload_sha256: payloadSha256
  }]
});
const duplicate = await persistTypo3Registration(duplicatePool, normalized, new Date(NOW_MS));
assert.equal(duplicate.created, false);
assert.equal(duplicate.duplicate, true);

const conflictPool = mockPool({
  selectRows: [{
    id: "intake-1",
    submission_id: BASE_PAYLOAD.submission_id,
    source_payload_sha256: "f".repeat(64)
  }]
});
await assert.rejects(
  persistTypo3Registration(conflictPool, normalized, new Date(NOW_MS)),
  (error) => error.status === 409 && error.code === "TYPO3_CONNECTOR_IDEMPOTENCY_CONFLICT"
);
assert.ok(conflictPool.calls.some(({ sql }) => sql === "rollback"));

const receiveBody = rawPayload({
  email_permission_requested: true,
  consent_text_version: ENVIRONMENT.TYPO3_CONNECTOR_CONSENT_TEXT_VERSION
});
await assert.rejects(
  receiveTypo3Registration(
    streamRequest(receiveBody, { "content-type": "text/plain" }),
    mockPool(),
    DISABLED_CONFIGURATION,
    NOW_MS
  ),
  (error) => error.status === 404 && error.code === "TYPO3_CONNECTOR_DISABLED",
  "Ein deaktivierter Connector muss vor Body-Parsing fail-closed als 404 antworten."
);
const receivePool = mockPool({
  insertRows: [{
    id: "intake-2",
    submission_id: BASE_PAYLOAD.submission_id
  }]
});
const received = await receiveTypo3Registration(
  streamRequest(receiveBody, signedHeaders(receiveBody)),
  receivePool,
  CONFIGURATION,
  NOW_MS
);
assert.equal(received.status, 201);
assert.deepEqual(received.body, {
  ok: true,
  duplicate: false,
  intake_id: "intake-2",
  submission_id: BASE_PAYLOAD.submission_id,
  email_permission_status: "pending"
});

const helmValues = readProjectFile("deploy/helm/versorgungs-kompass/values.yaml");
const helmIngress = readProjectFile("deploy/helm/versorgungs-kompass/templates/ingress.yaml");
const helmService = readProjectFile("deploy/helm/versorgungs-kompass/templates/typo3-connector-service.yaml");
const helmBackendConfig = readProjectFile(
  "deploy/helm/versorgungs-kompass/templates/typo3-connector-backendconfig.yaml"
);
const helmDeployment = readProjectFile("deploy/helm/versorgungs-kompass/templates/deployment.yaml");
const helmConfigMap = readProjectFile("deploy/helm/versorgungs-kompass/templates/configmap.yaml");
assert.match(helmValues, /typo3Connector:\n\s+enabled: false/u);
assert.match(
  helmIngress,
  /path: \/api\/connectors\/typo3\/mitmachen-registrations\n\s+pathType: Exact/u
);
assert.match(helmIngress, /typo3ConnectorFullname/u);
assert.match(helmService, /kind: Service/u);
assert.match(helmService, /versorgungs-kompass\.selectorLabels/u);
assert.match(helmService, /cloud\.google\.com\/backend-config/u);
assert.match(helmBackendConfig, /kind: BackendConfig/u);
assert.match(helmBackendConfig, /iap:\n\s+enabled: false/u);
assert.match(helmDeployment, /name: TYPO3_CONNECTOR_HMAC_SECRET_BASE64[\s\S]*secretKeyRef:/u);
assert.match(helmDeployment, /name: TYPO3_CONNECTOR_PREVIOUS_HMAC_SECRET_BASE64[\s\S]*secretKeyRef:/u);
assert.doesNotMatch(helmConfigMap, /HMAC_SECRET_BASE64/u);
assert.match(helmConfigMap, /TYPO3_CONNECTOR_ENABLED/u);

console.log(
  "TYPO3 registration connector contract OK: HMAC, validation, consent states, "
  + "idempotency and isolated Helm ingress are enforced."
);
