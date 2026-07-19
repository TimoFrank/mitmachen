import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const apiSource = fs.readFileSync(new URL("../api/server.mjs", import.meta.url), "utf8");
const validationErrorStart = apiSource.indexOf("function validationError(");
const validationErrorEnd = apiSource.indexOf("\n}\n", validationErrorStart) + 2;
const consentRulesStart = apiSource.indexOf("const MITMACHEN_CONSENT_STATUSES");
const consentRulesEnd = apiSource.indexOf("function contactPatchToDb(", consentRulesStart);
const avatarValidationStart = apiSource.indexOf("function pngProfileAvatarMetadata(");
const avatarValidationEnd = apiSource.indexOf("\nasync function uploadCurrentProfileAvatar(", avatarValidationStart);
assert.ok(validationErrorStart >= 0 && validationErrorEnd > validationErrorStart);
assert.ok(consentRulesStart >= 0 && consentRulesEnd > consentRulesStart);
assert.ok(avatarValidationStart >= 0 && avatarValidationEnd > avatarValidationStart);

const consentSandbox = {};
vm.runInNewContext([
  apiSource.slice(validationErrorStart, validationErrorEnd),
  apiSource.slice(consentRulesStart, consentRulesEnd),
  "globalThis.validateMitmachenConsentForTest = validateMitmachenConsent;"
].join("\n"), consentSandbox, { filename: "mitmachen-consent-validation.js" });
const validateMitmachenConsent = consentSandbox.validateMitmachenConsentForTest;

const avatarSandbox = { Buffer };
vm.runInNewContext([
  "const PROFILE_IMAGE_BUCKET = 'profile-images-test';",
  apiSource.slice(avatarValidationStart, avatarValidationEnd),
  "globalThis.detectedProfileAvatarContentTypeForTest = detectedProfileAvatarContentType;",
  "globalThis.profileAvatarMetadataForTest = profileAvatarMetadata;",
  "globalThis.profileAvatarObjectNameForTest = profileAvatarObjectName;",
  "globalThis.decodeProfileAvatarBase64ForTest = decodeProfileAvatarBase64;"
].join("\n"), avatarSandbox, { filename: "profile-avatar-validation.js" });
const detectAvatarContentType = avatarSandbox.detectedProfileAvatarContentTypeForTest;
const avatarMetadata = avatarSandbox.profileAvatarMetadataForTest;
const avatarObjectName = avatarSandbox.profileAvatarObjectNameForTest;
const decodeAvatarBase64 = avatarSandbox.decodeProfileAvatarBase64ForTest;

function pngFixture(width = 1, height = 1) {
  function chunk(type, data) {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    return Buffer.concat([size, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", Buffer.from([0])),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function jpegFixture(width = 1, height = 1) {
  const frame = Buffer.alloc(15);
  frame[0] = 8;
  frame.writeUInt16BE(height, 1);
  frame.writeUInt16BE(width, 3);
  frame[5] = 3;
  frame.set([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0], 6);
  const scan = Buffer.from([3, 1, 0, 2, 0, 3, 0, 0, 63, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11]),
    frame,
    Buffer.from([0xff, 0xda, 0x00, 0x0c]),
    scan,
    Buffer.from([0, 0xff, 0xd9])
  ]);
}

function webpFixture(width = 1, height = 1, imageWidth = width, imageHeight = height) {
  function chunk(type, data) {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([Buffer.from(type, "ascii"), size, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  }
  const extended = Buffer.alloc(10);
  extended.writeUIntLE(width - 1, 4, 3);
  extended.writeUIntLE(height - 1, 7, 3);
  const widthMinusOne = imageWidth - 1;
  const heightMinusOne = imageHeight - 1;
  const lossless = Buffer.from([
    0x2f,
    widthMinusOne & 0xff,
    ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6),
    (heightMinusOne >> 2) & 0xff,
    (heightMinusOne >> 10) & 0x0f
  ]);
  const buffer = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WEBP", "ascii"),
    chunk("VP8X", extended),
    chunk("VP8L", lossless)
  ]);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  return buffer;
}

const pngAvatar = pngFixture();
const jpegAvatar = jpegFixture();
const webpAvatar = webpFixture();
assert.equal(detectAvatarContentType(pngAvatar), "image/png");
assert.equal(detectAvatarContentType(jpegAvatar), "image/jpeg");
assert.equal(detectAvatarContentType(webpAvatar), "image/webp");
assert.equal(avatarMetadata(pngAvatar).width, 1);
assert.equal(avatarMetadata(jpegAvatar).height, 1);
assert.equal(avatarMetadata(webpAvatar).width, 1);
assert.equal(avatarMetadata(pngFixture(4097, 1)).width, 4097, "Das Upload-Limit kann aus dem Bildheader geprüft werden.");
assert.equal(avatarMetadata(webpFixture(1, 1, 4097, 1)).width, 4097,
  "Ein kleiner VP8X-Canvas darf größere Bitstream-Dimensionen nicht verbergen.");
assert.equal(detectAvatarContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "");
assert.equal(detectAvatarContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "");
assert.equal(detectAvatarContentType(Buffer.from("RIFF0000WEBP", "ascii")), "");
assert.equal(detectAvatarContentType(Buffer.from("<svg>")), "", "SVG/HTML darf nicht als Profilfoto durchgehen.");
assert.deepEqual(decodeAvatarBase64(pngAvatar.toString("base64")), pngAvatar);
assert.throws(() => decodeAvatarBase64("%%%="), (error) => error.status === 400 && /Base64/i.test(error.message));
assert.throws(() => decodeAvatarBase64("YQ"), (error) => error.status === 400 && /Base64/i.test(error.message));
const versionedAvatarName = "profile-images/profile-current/avatar-123e4567-e89b-42d3-a456-426614174000.png";
assert.equal(
  avatarObjectName(`gs://profile-images-test/${versionedAvatarName}`, "profile-current"),
  versionedAvatarName
);
assert.equal(
  avatarObjectName("gs://profile-images-test/profile-images/profile-current/avatar.jpg", "profile-current"),
  "profile-images/profile-current/avatar.jpg",
  "Der bisherige kanonische Dateiname bleibt für vorhandene Uploads lesbar."
);
assert.equal(avatarObjectName(`gs://other-bucket/${versionedAvatarName}`, "profile-current"), "");
assert.equal(avatarObjectName(`gs://profile-images-test/${versionedAvatarName}`, "other-profile"), "");
assert.equal(avatarObjectName("https://attacker.example/avatar.png", "profile-current"), "");

const validGrantedConsent = {
  mitmachen_consent_status: "granted",
  mitmachen_consent_effective_at: "2025-07-16T10:00:00.000Z",
  mitmachen_consent_recorded_by: "validation-test-user"
};
assert.doesNotThrow(() => validateMitmachenConsent({
  ...validGrantedConsent,
  mitmachen_consent_source: "manual_transfer",
  mitmachen_consent_note: "Nachweis aus dem Altsystem fachlich geprüft."
}));
assert.doesNotThrow(() => validateMitmachenConsent({
  ...validGrantedConsent,
  mitmachen_consent_source: "email",
  mitmachen_consent_note: ""
}));

function expectConsentValidationFailure(values, expectedMessage) {
  let caught;
  try {
    validateMitmachenConsent(values);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "Die ungültige Einwilligung muss vom API-Validator abgewiesen werden.");
  assert.equal(caught.status, 400);
  assert.match(caught.message, expectedMessage);
}

expectConsentValidationFailure({
  ...validGrantedConsent,
  mitmachen_consent_source: "manual_transfer",
  mitmachen_consent_note: "   "
}, /manuell übertragene.*Nachweisvermerk/i);
assert.doesNotThrow(() => validateMitmachenConsent({
  mitmachen_consent_status: "not_requested",
  mitmachen_consent_source: "manual_transfer",
  mitmachen_consent_note: "Übertragungsvermerk"
}));
expectConsentValidationFailure({
  ...validGrantedConsent,
  mitmachen_consent_source: "verbal_confirmed",
  mitmachen_consent_note: ""
}, /mündlich bestätigte.*Nachweisvermerk/i);
expectConsentValidationFailure({
  ...validGrantedConsent,
  mitmachen_consent_effective_at: "kein-zeitpunkt",
  mitmachen_consent_source: "email"
}, /gültiger Wirksamkeitszeitpunkt/i);
expectConsentValidationFailure({
  ...validGrantedConsent,
  mitmachen_consent_effective_at: "2099-01-01T00:00:00.000Z",
  mitmachen_consent_source: "email"
}, /nicht in der Zukunft/i);
expectConsentValidationFailure({
  mitmachen_consent_status: "declined",
  mitmachen_consent_effective_at: "2099-01-01T00:00:00.000Z"
}, /nicht in der Zukunft/i);
expectConsentValidationFailure({
  mitmachen_consent_status: "withdrawn",
  mitmachen_consent_effective_at: "2099-01-01T00:00:00.000Z"
}, /nicht in der Zukunft/i);
expectConsentValidationFailure({
  mitmachen_consent_status: "declined",
  mitmachen_consent_effective_at: "ungueltig"
}, /gültiger Zeitpunkt/i);
expectConsentValidationFailure({
  mitmachen_consent_status: "withdrawn",
  mitmachen_consent_effective_at: ""
}, /gültiger Zeitpunkt/i);
assert.doesNotThrow(() => validateMitmachenConsent({
  mitmachen_consent_status: "declined",
  mitmachen_consent_effective_at: "2025-07-16T10:00:00.000Z"
}));
assert.doesNotThrow(() => validateMitmachenConsent({
  mitmachen_consent_status: "withdrawn",
  mitmachen_consent_effective_at: "2025-07-16T10:00:00.000Z",
  mitmachen_consent_source: "manual_transfer",
  mitmachen_consent_note: "Der ursprüngliche Nachweis bleibt nach dem Widerruf erhalten."
}));

const port = 19000 + Math.floor(Math.random() * 1000);
const env = {
  ...process.env,
  PORT: String(port),
  API_AUTH_ALLOW_BEARER_DEV: "1",
  API_AUTH_ALLOW_DEV_PROFILE: "1",
  API_DEV_PROFILE_ID: "validation-test-user",
  API_AUTH_MODE: "trusted-header",
  ALLOWED_ORIGIN: "https://frontend.pre-gematik.example"
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeToken() {
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ sub: "validation-test-user" })}.`;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("API-Server ist fuer den Validierungstest nicht gestartet.")), 5000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Versorgungs-Kompass API listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      const message = String(chunk);
      if (/EADDRINUSE|Error:/i.test(message)) {
        clearTimeout(timeout);
        reject(new Error(message.trim()));
      }
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`API-Server wurde unerwartet beendet (${code}).`));
      }
    });
  });
}

async function expectValidationFailure(path, body, expectedField, method = "PATCH") {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${fakeToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== 400) {
    throw new Error(`${path}: erwartete 400, bekam ${response.status}.`);
  }
  if (!String(payload.error || "").includes(expectedField)) {
    throw new Error(`${path}: Fehlermeldung nennt das unbekannte Feld nicht: ${JSON.stringify(payload)}`);
  }
}

async function expectMethodNotAllowed(path, body = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${fakeToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== 405) {
    throw new Error(`${path}: erwartete 405, bekam ${response.status}.`);
  }
  if (!/nicht direkt|nicht erlaubt|deaktiviert/i.test(String(payload.error || ""))) {
    throw new Error(`${path}: 405 benötigt eine verständliche Sicherheitsmeldung: ${JSON.stringify(payload)}`);
  }
}

async function expectIapBootstrapBoundary() {
  const allowedReturn = "https://frontend.pre-gematik.example/versorgungs-kompass.html?iap_authenticated=1";
  const allowed = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap?return=${encodeURIComponent(allowedReturn)}`, {
    redirect: "manual"
  });
  assert.equal(allowed.status, 302);
  assert.equal(allowed.headers.get("location"), allowedReturn);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://frontend.pre-gematik.example");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

  const foreign = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap?return=${encodeURIComponent("https://attacker.example/")}`, {
    redirect: "manual"
  });
  assert.equal(foreign.status, 400, "Ein fremder IAP-Ruecksprung muss abgewiesen werden.");
}

const child = spawn(process.execPath, ["api/server.mjs"], {
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  await expectValidationFailure("/api/profile", { displayName: "Validierung", injectedSql: "select * from contacts" }, "injectedSql");
  await expectValidationFailure("/api/profile", { displayName: "Validierung", avatarUrl: "https://attacker.example/avatar.svg" }, "avatarUrl");
  await expectValidationFailure("/api/hospitation-slots/test-slot", { startsAt: "2026-07-01T10:00:00.000Z", injectedSql: "select * from hospitation_slots" }, "injectedSql");
  await expectValidationFailure("/api/hospitations/test-hospitation", { status: "Gebucht", injectedSql: "select * from hospitations" }, "injectedSql");
  await expectMethodNotAllowed("/api/activities", {
    eventKey: "hospitation.created",
    entityType: "hospitation",
    entityId: "hospitation-1",
    contactId: "contact-1"
  });
  await expectIapBootstrapBoundary();
  console.log("API Validation Test OK: JSON-Felder, Aktivitaets-Producer und #Mitmachen-Nachweisregeln werden serverseitig validiert.");
} finally {
  child.kill("SIGTERM");
}
