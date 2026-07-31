import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  assertIapExternalAccessWindow,
  assertIapExternalIdentityClaims,
  assertIapJwtClaims,
  assertIapNativeIdentityClaims,
  policyForRequest,
  requireSingleActiveIdentityProfile,
  validateIdentityConfiguration
} from "../api/security-policy.mjs";
import { canonicalIapSubject } from "../api/test-access-enrollment.mjs";

const projectRoot = new URL("../", import.meta.url);
const fixedNowMs = Date.parse("2026-07-30T12:00:00Z");
const audience = "/projects/123456789/global/backendServices/987654321";
const externalAuthApiKey = `AIza${"A".repeat(35)}`;
const gcipClaimMaxBytes = 12 * 1024;
const baseExternalEnvironment = {
  NODE_ENV: "production",
  API_AUTH_MODE: "iap",
  IAP_JWT_AUDIENCE: audience,
  IAP_IDENTITY_MODE: "external",
  IAP_GCIP_PROJECT_ID: "steam-capsule-341212",
  IAP_EXTERNAL_LOGIN_PAGE_URI: "https://versorgungs-kompass-login.example.run.app/",
  IAP_EXTERNAL_AUTH_API_KEY: externalAuthApiKey,
  IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-09-30T12:00:00Z"
};
const externalConfiguration = validateIdentityConfiguration(baseExternalEnvironment, { nowMs: fixedNowMs });

assert.equal(externalConfiguration.mode, "iap");
assert.equal(externalConfiguration.iapIdentityMode, "external");
assert.equal(externalConfiguration.iapGcipProjectId, "steam-capsule-341212");
assert.equal(externalConfiguration.iapGcipTenantId, "");
assert.equal(
  externalConfiguration.iapExternalAccessExpiresAtMs,
  Date.parse(baseExternalEnvironment.IAP_EXTERNAL_ACCESS_EXPIRES_AT)
);

const nativeConfiguration = validateIdentityConfiguration({
  NODE_ENV: "production",
  API_AUTH_MODE: "iap",
  IAP_JWT_AUDIENCE: audience
});
assert.equal(nativeConfiguration.iapIdentityMode, "iam", "Der bestehende IAP/IAM-Modus muss der sichere Rollback-Default bleiben.");
assert.doesNotThrow(() => assertIapNativeIdentityClaims({
  iss: "https://cloud.google.com/iap",
  sub: "accounts.google.com:123456789"
}));
assert.throws(
  () => assertIapNativeIdentityClaims(externalPayload()),
  (error) => error?.status === 401,
  "Ein noch aktiver GCIP-Edge-Flow darf nach dem IAM-Rollback nicht unbemerkt weiterlaufen."
);

for (const [environment, expectedMessage] of [
  [{ ...baseExternalEnvironment, IAP_IDENTITY_MODE: "unknown" }, /IAP_IDENTITY_MODE/u],
  [{ ...baseExternalEnvironment, API_AUTH_MODE: "oidc" }, /API_AUTH_MODE=iap/u],
  [{ ...baseExternalEnvironment, IAP_GCIP_PROJECT_ID: "" }, /IAP_GCIP_PROJECT_ID/u],
  [{ ...baseExternalEnvironment, IAP_GCIP_PROJECT_ID: "Steam Capsule" }, /IAP_GCIP_PROJECT_ID/u],
  [{ ...baseExternalEnvironment, IAP_GCIP_TENANT_ID: "../tenant" }, /IAP_GCIP_TENANT_ID/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_LOGIN_PAGE_URI: "http://login.example.test/" }, /HTTPS-URL/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_LOGIN_PAGE_URI: "https://login.example.test/?apiKey=inline" }, /ohne Zugangsdaten, Query oder Fragment/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_AUTH_API_KEY: "not-a-google-api-key" }, /IAP_EXTERNAL_AUTH_API_KEY/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_ACCESS_EXPIRES_AT: "" }, /kanonischer UTC-Zeitstempel/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-09-30T22:00:00+00:00" }, /kanonischer UTC-Zeitstempel/u],
  [{ ...baseExternalEnvironment, IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-02-30T22:00:00Z" }, /kanonischer UTC-Zeitstempel/u]
]) {
  assert.throws(() => validateIdentityConfiguration(environment, { nowMs: fixedNowMs }), expectedMessage);
}

assert.throws(
  () => validateIdentityConfiguration({
    ...baseExternalEnvironment,
    IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-07-30T12:00:00Z"
  }, { nowMs: fixedNowMs }),
  /in der Zukunft/u
);
assert.throws(
  () => validateIdentityConfiguration({
    ...baseExternalEnvironment,
    IAP_EXTERNAL_ACCESS_EXPIRES_AT: "2026-09-30T12:00:01Z"
  }, { nowMs: fixedNowMs }),
  /hoechstens 62 Tage/u
);

function externalPayload({
  provider = "password",
  email = "pilot@example.invalid",
  subject = "gcIP-uid_123",
  emailVerified = true,
  tenantId = "",
  projectId = externalConfiguration.iapGcipProjectId,
  gcipFormat = "string"
} = {}) {
  const firebase = {
    identities: {
      email: [email],
      [provider]: provider === "google.com" ? ["google-account-123"] : [email]
    },
    sign_in_provider: provider
  };
  if (tenantId) firebase.tenant = tenantId;
  const namespace = `securetoken.google.com/${projectId}${tenantId ? `/${tenantId}` : ""}`;
  const gcip = {
    auth_time: fixedNowMs / 1000,
    email,
    email_verified: emailVerified,
    firebase,
    sub: subject
  };
  return {
    iss: "https://cloud.google.com/iap",
    aud: audience,
    iat: fixedNowMs / 1000,
    exp: fixedNowMs / 1000 + 600,
    email: `${namespace}:${email}`,
    sub: `${namespace}:${subject}`,
    gcip: gcipFormat === "object" ? gcip : JSON.stringify(gcip)
  };
}

for (const provider of ["google.com", "password"]) {
  for (const gcipFormat of ["string", "object"]) {
    const payload = externalPayload({ provider, gcipFormat });
    assert.doesNotThrow(() => assertIapJwtClaims(payload, audience, { nowSeconds: fixedNowMs / 1000 }));
    const identity = assertIapExternalIdentityClaims(payload, externalConfiguration, { nowMs: fixedNowMs });
    assert.equal(identity.provider, provider);
    assert.equal(identity.email, "pilot@example.invalid");
    assert.equal(identity.subject, payload.sub);
    assert.equal(
      canonicalIapSubject(payload.sub),
      payload.sub,
      "Ein GCIP-Subject darf niemals auf den inneren UID-Teil reduziert werden."
    );
  }
}

assert.doesNotThrow(
  () => assertIapJwtClaims(
    { ...externalPayload(), exp: fixedNowMs / 1000 + 660 },
    audience,
    { nowSeconds: fixedNowMs / 1000 }
  ),
  "Ein gueltiges IAP-JWT darf inklusive beider 30-Sekunden-Toleranzen exakt 660 Sekunden leben."
);
assert.throws(
  () => assertIapJwtClaims(
    { ...externalPayload(), exp: fixedNowMs / 1000 + 661 },
    audience,
    { nowSeconds: fixedNowMs / 1000 }
  ),
  (error) => error?.status === 401,
  "Ein IAP-JWT mit 661 Sekunden Laufzeit muss abgewiesen werden."
);

assert.throws(
  () => assertIapJwtClaims(
    { ...externalPayload(), iss: "https://securetoken.google.com/steam-capsule-341212" },
    audience,
    { nowSeconds: fixedNowMs / 1000 }
  ),
  (error) => error?.status === 401,
  "Auch External Identities muessen weiterhin das von IAP signierte Outer-JWT verwenden."
);

const baseGcip = JSON.parse(externalPayload().gcip);
const emptyPaddingGcip = { ...baseGcip, padding: "" };
const exactGcip = {
  ...baseGcip,
  padding: "x".repeat(gcipClaimMaxBytes - Buffer.byteLength(JSON.stringify(emptyPaddingGcip), "utf8"))
};
const exactGcipString = JSON.stringify(exactGcip);
assert.equal(Buffer.byteLength(exactGcipString, "utf8"), gcipClaimMaxBytes);
for (const gcip of [exactGcipString, exactGcip]) {
  const payload = externalPayload();
  payload.gcip = gcip;
  assert.doesNotThrow(
    () => assertIapExternalIdentityClaims(payload, externalConfiguration, { nowMs: fixedNowMs }),
    "Der GCIP-Claim darf als String und Objekt exakt 12 KiB gross sein."
  );
}
const oversizedGcip = {
  ...exactGcip,
  padding: `${exactGcip.padding}x`
};
const circularGcip = {};
circularGcip.self = circularGcip;
const prototypeFreeGcip = Object.assign(Object.create(null), baseGcip);
for (const [name, gcip] of [
  ["null", null],
  ["Array", []],
  ["Zahl", 123],
  ["Boolean", true],
  ["leerer String", ""],
  ["ungueltiger JSON-String", "{"],
  ["doppelt kodierter JSON-String", JSON.stringify(externalPayload().gcip)],
  ["zu grosser JSON-String", JSON.stringify(oversizedGcip)],
  ["zu grosses JSON-Objekt", oversizedGcip],
  ["nicht einfaches Objekt", new Date("2026-07-30T12:00:00Z")],
  ["Objekt ohne Standardprototyp", prototypeFreeGcip],
  ["zyklisches Objekt", circularGcip],
  ["nicht serialisierbares Objekt", { value: 1n }]
]) {
  const payload = externalPayload();
  payload.gcip = gcip;
  assert.throws(
    () => assertIapExternalIdentityClaims(payload, externalConfiguration, { nowMs: fixedNowMs }),
    (error) => error?.status === 401,
    `${name} muss als GCIP-Claim fail-closed abgewiesen werden.`
  );
}

function updateGcipClaim(payload, mutate) {
  const serialized = typeof payload.gcip === "string";
  const gcip = serialized ? JSON.parse(payload.gcip) : payload.gcip;
  mutate(gcip);
  payload.gcip = serialized ? JSON.stringify(gcip) : gcip;
}

for (const [name, mutate] of [
  ["fehlender GCIP-Claim", (payload) => { delete payload.gcip; }],
  ["nicht verifizierte E-Mail", (payload) => {
    updateGcipClaim(payload, (gcip) => { gcip.email_verified = false; });
  }],
  ["nicht freigegebener Provider", (payload) => {
    updateGcipClaim(payload, (gcip) => { gcip.firebase.sign_in_provider = "github.com"; });
  }],
  ["abweichendes Outer-Subject", (payload) => { payload.sub += "-tampered"; }],
  ["abweichende Outer-E-Mail", (payload) => { payload.email = payload.email.replace("pilot@", "other@"); }],
  ["abweichendes Projekt", (payload) => {
    payload.sub = payload.sub.replace("steam-capsule-341212", "other-project-123");
    payload.email = payload.email.replace("steam-capsule-341212", "other-project-123");
  }],
  ["unerwarteter Tenant", (payload) => {
    updateGcipClaim(payload, (gcip) => { gcip.firebase.tenant = "tenant-a"; });
  }]
]) {
  for (const gcipFormat of ["string", "object"]) {
    const payload = externalPayload({ gcipFormat });
    mutate(payload);
    assert.throws(
      () => assertIapExternalIdentityClaims(payload, externalConfiguration, { nowMs: fixedNowMs }),
      (error) => error?.status === 401,
      `${name} muss fuer einen GCIP-${gcipFormat} vor der Profilabfrage abgewiesen werden.`
    );
  }
}

assert.throws(
  () => assertIapExternalAccessWindow(
    externalConfiguration,
    { nowMs: externalConfiguration.iapExternalAccessExpiresAtMs }
  ),
  (error) => error?.status === 403 && /abgelaufen/u.test(error.message),
  "Der harte Pilotablauf muss auf jedem geschuetzten Request fail-closed greifen."
);

const tenantConfiguration = validateIdentityConfiguration({
  ...baseExternalEnvironment,
  IAP_GCIP_TENANT_ID: "pilot-tenant"
}, { nowMs: fixedNowMs });
const tenantPayload = externalPayload({ tenantId: "pilot-tenant" });
assert.equal(
  assertIapExternalIdentityClaims(tenantPayload, tenantConfiguration, { nowMs: fixedNowMs }).subject,
  tenantPayload.sub
);

const boundProfile = { id: "profile-pilot", active: true };
assert.equal(requireSingleActiveIdentityProfile([boundProfile]), boundProfile);
for (const rows of [[], [boundProfile, { id: "profile-duplicate" }], null]) {
  assert.throws(
    () => requireSingleActiveIdentityProfile(rows),
    (error) => error?.status === 403,
    "Unbekannte oder nicht eindeutige External Identities muessen fail-closed bleiben."
  );
}

assert.equal(policyForRequest("POST", "/api/auth/enrollment"), null);
assert.equal(policyForRequest("POST", "/api/auth/auto-enrollment"), null);
const applicationAuthSource = [
  readFileSync(new URL("frontend/login/auth-login.js", projectRoot), "utf8"),
  readFileSync(new URL("frontend/login/auth-guard.js", projectRoot), "utf8"),
  readFileSync(new URL("api/server.mjs", projectRoot), "utf8")
].join("\n");
assert.match(
  applicationAuthSource,
  /["']\/readyz["'][\s\S]*assertIapExternalAccessWindow\(IDENTITY_CONFIGURATION\)/u,
  "Readiness muss nach dem harten External-Identity-Ablauf ebenfalls fail-closed sein."
);
assert.doesNotMatch(
  applicationAuthSource,
  /createUserWithEmailAndPassword|accounts:signUp|\/api\/auth\/(?:auto-)?enrollment/u,
  "Der Anwendungs-Login darf keine Selbstregistrierung anbieten."
);

function signedIapJwt(payload, privateKey, kid) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signedData = `${encodedHeader}.${encodedPayload}`;
  const signature = sign("sha256", Buffer.from(signedData), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  }).toString("base64url");
  return {
    encodedPayload,
    token: `${signedData}.${signature}`
  };
}

function waitForApiStart(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`API-Server ist fuer den JWT-Boundary-Test nicht gestartet: ${stderr}`));
    }, 5000);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Versorgungs-Kompass API listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`API-Server wurde vor dem JWT-Boundary-Test beendet (${code}): ${stderr}`));
    });
  });
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function assertRealRequestGcipBoundary() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const kid = "iap-boundary-test-key";
  const publicJwk = {
    ...publicKey.export({ format: "jwk" }),
    alg: "ES256",
    kid,
    use: "sig"
  };
  const jwksJson = JSON.stringify({ keys: [publicJwk] });
  const mockJwksImport = `data:text/javascript,${encodeURIComponent(`
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "https://www.gstatic.com/iap/verify/public_key-jwk") {
        return new Response(process.env.TEST_IAP_JWKS_JSON, {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return realFetch(input, init);
    };
  `)}`;
  const port = 21000 + Math.floor(Math.random() * 1000);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(".000Z", "Z");
  const requestPayload = (gcip) => ({
    ...externalPayload(),
    iat: nowSeconds,
    exp: nowSeconds + 600,
    gcip
  });
  const exactJwt = signedIapJwt(requestPayload(exactGcipString), privateKey, kid);
  const oversizedJwt = signedIapJwt(requestPayload(JSON.stringify(oversizedGcip)), privateKey, kid);
  assert.ok(
    exactJwt.encodedPayload.length > 12_000,
    "Der Request-Test muss tatsaechlich das fruehere 12.000-Zeichen-Decoderlimit ueberschreiten."
  );

  const child = spawn(process.execPath, ["--import", mockJwksImport, "api/server.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      API_AUTH_MODE: "iap",
      API_AUTH_ALLOW_BEARER_DEV: "0",
      API_AUTH_ALLOW_DEV_PROFILE: "0",
      IAP_JWT_AUDIENCE: audience,
      IAP_IDENTITY_MODE: "external",
      IAP_GCIP_PROJECT_ID: baseExternalEnvironment.IAP_GCIP_PROJECT_ID,
      IAP_GCIP_TENANT_ID: "",
      IAP_EXTERNAL_LOGIN_PAGE_URI: baseExternalEnvironment.IAP_EXTERNAL_LOGIN_PAGE_URI,
      IAP_EXTERNAL_AUTH_API_KEY: externalAuthApiKey,
      IAP_EXTERNAL_ACCESS_EXPIRES_AT: accessExpiry,
      ALLOWED_ORIGIN: "",
      DATABASE_URL: "",
      DB_HOST: "",
      PGHOST: "",
      TEST_IAP_JWKS_JSON: jwksJson
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForApiStart(child);
    const request = (token) => fetch(`http://127.0.0.1:${port}/api/session`, {
      headers: { "x-goog-iap-jwt-assertion": token }
    });
    const exactResponse = await request(exactJwt.token);
    assert.equal(
      exactResponse.status,
      503,
      "Ein signierter Request mit exakt 12 KiB GCIP muss den echten Decoder passieren und erst an der absichtlich fehlenden Test-DB enden."
    );

    const oversizedResponse = await request(oversizedJwt.token);
    const oversizedBody = await oversizedResponse.json();
    assert.equal(
      oversizedResponse.status,
      401,
      "Ein signierter Request mit mehr als 12 KiB GCIP muss im echten Requestpfad fail-closed abgewiesen werden."
    );
    assert.match(String(oversizedBody.error || ""), /GCIP-Claim/u);

    const paddedSignatureResponse = await request(`${exactJwt.token}==`);
    assert.equal(
      paddedSignatureResponse.status,
      401,
      "Eine gepaddete Alternativdarstellung derselben JWT-Signatur muss im echten Requestpfad abgewiesen werden."
    );
  } finally {
    await stopApi(child);
  }
}

await assertRealRequestGcipBoundary();

console.log("IAP External Identity Test OK: GCIP-Claims, Provider, Ablauf, Bindungen und IAM-Rollback sind fail-closed abgesichert.");
