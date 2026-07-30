import assert from "node:assert/strict";
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
  projectId = externalConfiguration.iapGcipProjectId
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
  return {
    iss: "https://cloud.google.com/iap",
    aud: audience,
    iat: fixedNowMs / 1000,
    exp: fixedNowMs / 1000 + 600,
    email: `${namespace}:${email}`,
    sub: `${namespace}:${subject}`,
    gcip: JSON.stringify({
      auth_time: fixedNowMs / 1000,
      email,
      email_verified: emailVerified,
      firebase,
      sub: subject
    })
  };
}

for (const provider of ["google.com", "password"]) {
  const payload = externalPayload({ provider });
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

assert.throws(
  () => assertIapJwtClaims(
    { ...externalPayload(), iss: "https://securetoken.google.com/steam-capsule-341212" },
    audience,
    { nowSeconds: fixedNowMs / 1000 }
  ),
  (error) => error?.status === 401,
  "Auch External Identities muessen weiterhin das von IAP signierte Outer-JWT verwenden."
);

for (const [name, mutate] of [
  ["fehlender GCIP-Claim", (payload) => { delete payload.gcip; }],
  ["nicht verifizierte E-Mail", (payload) => {
    const gcip = JSON.parse(payload.gcip);
    gcip.email_verified = false;
    payload.gcip = JSON.stringify(gcip);
  }],
  ["nicht freigegebener Provider", (payload) => {
    const gcip = JSON.parse(payload.gcip);
    gcip.firebase.sign_in_provider = "github.com";
    payload.gcip = JSON.stringify(gcip);
  }],
  ["abweichendes Outer-Subject", (payload) => { payload.sub += "-tampered"; }],
  ["abweichende Outer-E-Mail", (payload) => { payload.email = payload.email.replace("pilot@", "other@"); }],
  ["abweichendes Projekt", (payload) => {
    payload.sub = payload.sub.replace("steam-capsule-341212", "other-project-123");
    payload.email = payload.email.replace("steam-capsule-341212", "other-project-123");
  }],
  ["unerwarteter Tenant", (payload) => {
    const gcip = JSON.parse(payload.gcip);
    gcip.firebase.tenant = "tenant-a";
    payload.gcip = JSON.stringify(gcip);
  }]
]) {
  const payload = externalPayload();
  mutate(payload);
  assert.throws(
    () => assertIapExternalIdentityClaims(payload, externalConfiguration, { nowMs: fixedNowMs }),
    (error) => error?.status === 401,
    `${name} muss vor der Profilabfrage abgewiesen werden.`
  );
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

console.log("IAP External Identity Test OK: GCIP-Claims, Provider, Ablauf, Bindungen und IAM-Rollback sind fail-closed abgesichert.");
