import assert from "node:assert/strict";
import http from "node:http";

import {
  PASSWORD_RESET_ACCEPTED_RESPONSE,
  PASSWORD_RESET_BROKER_PATH,
  PasswordResetInfrastructureError,
  createIdentityPlatformPasswordResetClient,
  createPasswordResetBroker,
  createPasswordResetRateLimiter,
  exactPasswordOnlyIdentityUser,
  normalizePasswordResetEmail,
  trustedPasswordResetClientIp
} from "../api/password-reset-broker.mjs";
import {
  createPasswordResetHttpHandler,
  passwordResetServerConfiguration
} from "../api/password-reset-server.mjs";

const TEST_EMAIL = "timo.frank@gematik.de";
const TEST_PROJECT_ID = "versorgungs-kompass-test";
const TEST_API_KEY = `AIza${"a".repeat(35)}`;
const TEST_CONTINUE_URL = "https://versorgungs-kompass.de/start";

function explicitPasswordUser(overrides = {}) {
  return {
    localId: "password-user-1",
    email: TEST_EMAIL,
    emailVerified: true,
    disabled: false,
    passwordHash: "redacted-password-hash",
    providerUserInfo: [{
      providerId: "password",
      rawId: TEST_EMAIL,
      email: TEST_EMAIL
    }],
    ...overrides
  };
}

function implicitPasswordUser(overrides = {}) {
  return explicitPasswordUser({
    providerUserInfo: [],
    ...overrides
  });
}

function googleUser(overrides = {}) {
  const user = explicitPasswordUser({
    providerUserInfo: [{
      providerId: "google.com",
      rawId: "google-subject-1",
      email: TEST_EMAIL
    }],
    ...overrides
  });
  delete user.passwordHash;
  return user;
}

function mixedProviderUser(overrides = {}) {
  return explicitPasswordUser({
    providerUserInfo: [
      {
        providerId: "password",
        rawId: TEST_EMAIL,
        email: TEST_EMAIL
      },
      {
        providerId: "google.com",
        rawId: "google-subject-1",
        email: TEST_EMAIL
      }
    ],
    ...overrides
  });
}

assert.equal(normalizePasswordResetEmail(`  ${TEST_EMAIL.toUpperCase()}  `), TEST_EMAIL);
for (const invalidEmail of [null, "", "no-at-sign", "a@@example.test", "a@", "ä@example.test"]) {
  assert.equal(normalizePasswordResetEmail(invalidEmail), "", `Ungültige E-Mail akzeptiert: ${String(invalidEmail)}`);
}

assert.deepEqual(
  exactPasswordOnlyIdentityUser(explicitPasswordUser(), TEST_EMAIL),
  { uid: "password-user-1", email: TEST_EMAIL },
  "Ein expliziter, verifizierter Password-only-User muss reset-fähig sein."
);
for (const [label, passwordEvidence] of [
  ["passwordHash", { passwordHash: "redacted-password-hash" }],
  ["passwordUpdatedAt", { passwordHash: undefined, passwordUpdatedAt: 1_753_923_600_000 }],
  ["version", { passwordHash: undefined, version: 1 }]
]) {
  assert.deepEqual(
    exactPasswordOnlyIdentityUser(implicitPasswordUser(passwordEvidence), TEST_EMAIL),
    { uid: "password-user-1", email: TEST_EMAIL },
    `Identity Toolkit darf ${label} liefern, obwohl providerUserInfo leer ist.`
  );
}

const ineligibleUsers = new Map([
  ["unbekannter User", null],
  ["User ohne Passwort-Evidenz", implicitPasswordUser({ passwordHash: undefined })],
  ["Google-only-User", googleUser()],
  ["gemischter Google-/Password-User", mixedProviderUser()],
  ["deaktivierter User", explicitPasswordUser({ disabled: true })],
  ["nicht verifizierter User", explicitPasswordUser({ emailVerified: false })],
  ["Tenant-User", explicitPasswordUser({ tenantId: "tenant-a" })],
  ["User mit MFA", explicitPasswordUser({ mfaInfo: [{ mfaEnrollmentId: "mfa-1" }] })],
  ["User mit Telefonnummer", explicitPasswordUser({ phoneNumber: "+491701234567" })],
  ["Password-Provider mit Telefonnummer", explicitPasswordUser({
    providerUserInfo: [{
      providerId: "password",
      rawId: TEST_EMAIL,
      email: TEST_EMAIL,
      phoneNumber: "+491701234567"
    }]
  })],
  ["Password-Provider mit fremder federatedId", explicitPasswordUser({
    providerUserInfo: [{
      providerId: "password",
      rawId: TEST_EMAIL,
      federatedId: "other@example.invalid",
      email: TEST_EMAIL
    }]
  })],
  ["doppelter Password-Provider", explicitPasswordUser({
    providerUserInfo: [
      { providerId: "password", rawId: TEST_EMAIL, email: TEST_EMAIL },
      { providerId: "password", rawId: TEST_EMAIL, email: TEST_EMAIL }
    ]
  })],
  ["User mit Email-Link-Sign-in", explicitPasswordUser({ emailLinkSignin: true })]
]);
for (const [label, user] of ineligibleUsers) {
  assert.equal(
    exactPasswordOnlyIdentityUser(user, TEST_EMAIL),
    null,
    `${label} darf keinen Passwort-Reset erhalten.`
  );
}

const identityRequests = [];
const identityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async (url, options) => {
    identityRequests.push({ url, options, body: JSON.parse(options.body) });
    if (String(url).includes("accounts:lookup")) {
      return new Response(JSON.stringify({ users: [implicitPasswordUser()] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ email: TEST_EMAIL }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
});

for (const invalidContinueUrl of [
  "http://versorgungs-kompass.de/start",
  "https://versorgungs-kompass.de/",
  "https://versorgungs-kompass.de/start?mode=resetPassword",
  "https://steam-capsule-341212.firebaseapp.com/__/auth/action"
]) {
  assert.throws(
    () => createIdentityPlatformPasswordResetClient({
      projectId: TEST_PROJECT_ID,
      apiKey: TEST_API_KEY,
      continueUrl: invalidContinueUrl,
      accessTokenProvider: async () => "test-token",
      fetchImpl: async () => new Response("{}")
    }),
    /kanonischer HTTPS-\/start-Pfad/,
    `Nicht-kanonische Reset-Weiterleitung akzeptiert: ${invalidContinueUrl}`
  );
}

assert.deepEqual(await identityClient.lookupByEmail(TEST_EMAIL), implicitPasswordUser());
assert.equal(await identityClient.sendPasswordReset(TEST_EMAIL, "198.51.100.42"), true);
assert.equal(identityRequests.length, 2);

const [lookupRequest, sendRequest] = identityRequests;
for (const request of identityRequests) {
  const parsedUrl = new URL(request.url);
  assert.equal(parsedUrl.origin, "https://identitytoolkit.googleapis.com");
  assert.equal(parsedUrl.searchParams.get("key"), TEST_API_KEY);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers.authorization, "Bearer test-oauth-access-token");
  assert.equal(request.options.headers["content-type"], "application/json");
  assert.equal(request.options.headers["x-firebase-locale"], "de");
  assert.equal(request.options.headers["x-goog-user-project"], undefined);
  assert.equal(request.options.headers.referer, "https://versorgungs-kompass.de/anmelden");
}
assert.equal(
  new URL(lookupRequest.url).pathname,
  `/v1/projects/${TEST_PROJECT_ID}/accounts:lookup`
);
assert.deepEqual(lookupRequest.body, { email: [TEST_EMAIL] });
assert.equal(
  new URL(sendRequest.url).pathname,
  `/v1/projects/${TEST_PROJECT_ID}/accounts:sendOobCode`
);
assert.deepEqual(sendRequest.body, {
  requestType: "PASSWORD_RESET",
  email: TEST_EMAIL,
  userIp: "198.51.100.42",
  continueUrl: TEST_CONTINUE_URL,
  canHandleCodeInApp: false,
  returnOobLink: false,
  clientType: "CLIENT_TYPE_WEB"
});

function errorResponse(code, status = 400) {
  return new Response(JSON.stringify({ error: { message: code } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const privateLookupClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-token",
  fetchImpl: async () => errorResponse("EMAIL_NOT_FOUND")
});
assert.equal(
  await privateLookupClient.lookupByEmail("unknown@example.invalid"),
  null,
  "Ein unbekanntes Konto muss intern als neutraler Lookup-Miss behandelt werden."
);
assert.equal(
  await privateLookupClient.sendPasswordReset(TEST_EMAIL, "198.51.100.42"),
  false,
  "Account-private sendOob-Fehler dürfen keine Kontoexistenz offenlegen."
);

const failingIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-token",
  fetchImpl: async () => errorResponse("INTERNAL_ERROR", 500)
});
await assert.rejects(
  () => failingIdentityClient.lookupByEmail(TEST_EMAIL),
  (error) => (
    error instanceof PasswordResetInfrastructureError
    && error.status === 503
    && !error.message.includes("INTERNAL_ERROR")
    && !error.message.includes(TEST_EMAIL)
  ),
  "Infrastrukturfehler müssen als generischer 503-Vertrag enden."
);

let nowMs = 10_000;
const rateLimiter = createPasswordResetRateLimiter({
  now: () => nowMs,
  windowMs: 60_000,
  ipLimit: 2,
  emailLimit: 1
});
assert.equal(rateLimiter.allow(TEST_EMAIL, "198.51.100.42"), true);
assert.equal(rateLimiter.allow(TEST_EMAIL, "198.51.100.42"), false);
assert.equal(rateLimiter.allow("other@example.invalid", "198.51.100.42"), false);
nowMs += 60_000;
assert.equal(rateLimiter.allow(TEST_EMAIL, "198.51.100.42"), true);

const brokerCalls = { lookup: [], send: [] };
const brokerIdentityClient = {
  async lookupByEmail(email) {
    brokerCalls.lookup.push(email);
    if (email === "unknown@example.invalid") return null;
    if (email === "google@example.invalid") {
      return googleUser({ email, providerUserInfo: [{
        providerId: "google.com",
        rawId: "google-subject-2",
        email
      }] });
    }
    return implicitPasswordUser({ email });
  },
  async sendPasswordReset(email, clientIp) {
    brokerCalls.send.push({ email, clientIp });
    return true;
  }
};
const broker = createPasswordResetBroker({
  identityClient: brokerIdentityClient,
  minimumResponseMs: 0
});

const eligibleResult = await broker.request({
  email: ` ${TEST_EMAIL.toUpperCase()} `,
  clientIp: "198.51.100.42"
});
const unknownResult = await broker.request({
  email: "unknown@example.invalid",
  clientIp: "198.51.100.43"
});
const googleResult = await broker.request({
  email: "google@example.invalid",
  clientIp: "198.51.100.44"
});
const invalidResult = await broker.request({
  email: "not-an-email",
  clientIp: "198.51.100.45"
});
await broker.drain();
for (const result of [eligibleResult, unknownResult, googleResult, invalidResult]) {
  assert.strictEqual(
    result,
    PASSWORD_RESET_ACCEPTED_RESPONSE,
    "Kontoexistenz und Eligibility müssen dieselbe neutrale Antwort liefern."
  );
}
assert.deepEqual(brokerCalls.lookup, [TEST_EMAIL, "unknown@example.invalid", "google@example.invalid"]);
assert.deepEqual(brokerCalls.send, [{ email: TEST_EMAIL, clientIp: "198.51.100.42" }]);

let deliveryStartedResolve;
let deliveryReleaseResolve;
const deliveryStarted = new Promise((resolve) => { deliveryStartedResolve = resolve; });
const deliveryRelease = new Promise((resolve) => { deliveryReleaseResolve = resolve; });
const deliveryErrors = [];
const deliveryFailureBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail(email) {
      return implicitPasswordUser({ email });
    },
    async sendPasswordReset() {
      deliveryStartedResolve();
      await deliveryRelease;
      throw new Error(`private delivery failure for ${TEST_EMAIL}`);
    }
  },
  async onDeliveryError(error) {
    deliveryErrors.push(error);
  },
  minimumResponseMs: 0
});
assert.strictEqual(
  await deliveryFailureBroker.request({ email: TEST_EMAIL, clientIp: "198.51.100.49" }),
  PASSWORD_RESET_ACCEPTED_RESPONSE,
  "Ein ausstehender Versand darf den neutralen HTTP-Vertrag nicht blockieren."
);
await deliveryStarted;
assert.equal(deliveryErrors.length, 0);
deliveryReleaseResolve();
await deliveryFailureBroker.drain();
assert.equal(deliveryErrors.length, 1);
assert.ok(deliveryErrors[0] instanceof PasswordResetInfrastructureError);
assert.equal(deliveryErrors[0].status, 503);
assert.equal(deliveryErrors[0].message.includes(TEST_EMAIL), false);

const rateLimitedBrokerCalls = [];
const rateLimitedBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail(email) {
      rateLimitedBrokerCalls.push(email);
      return explicitPasswordUser({ email });
    },
    async sendPasswordReset() {
      throw new Error("Ein rate-limitierter Request darf nicht senden.");
    }
  },
  rateLimiter: { allow: () => false },
  minimumResponseMs: 0
});
assert.strictEqual(
  await rateLimitedBroker.request({ email: TEST_EMAIL, clientIp: "198.51.100.46" }),
  PASSWORD_RESET_ACCEPTED_RESPONSE
);
assert.deepEqual(rateLimitedBrokerCalls, []);

const infrastructureBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      throw new Error(`private failure for ${TEST_EMAIL}`);
    },
    async sendPasswordReset() {
      return true;
    }
  },
  minimumResponseMs: 0
});
await assert.rejects(
  () => infrastructureBroker.request({ email: TEST_EMAIL, clientIp: "198.51.100.47" }),
  (error) => (
    error instanceof PasswordResetInfrastructureError
    && error.status === 503
    && !error.message.includes(TEST_EMAIL)
  )
);

const validServerConfiguration = passwordResetServerConfiguration({
  NODE_ENV: "production",
  PORT: "8087",
  PASSWORD_RESET_BROKER_ENABLED: "1",
  PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de",
  IAP_GCIP_PROJECT_ID: TEST_PROJECT_ID,
  IAP_GCIP_TENANT_ID: "",
  IAP_EXTERNAL_AUTH_API_KEY: TEST_API_KEY
});
assert.deepEqual(validServerConfiguration, {
  production: true,
  port: 8087,
  projectId: TEST_PROJECT_ID,
  tenantId: "",
  apiKey: TEST_API_KEY,
  allowedOrigin: "https://versorgungs-kompass.de",
  allowedHost: "versorgungs-kompass.de",
  continueUrl: TEST_CONTINUE_URL
});
for (const invalidEnvironment of [
  {
    PASSWORD_RESET_BROKER_ENABLED: "0",
    PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de"
  },
  {
    PASSWORD_RESET_BROKER_ENABLED: "1",
    PASSWORD_RESET_ALLOWED_ORIGIN: "http://versorgungs-kompass.de"
  },
  {
    PASSWORD_RESET_BROKER_ENABLED: "1",
    PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de",
    IAP_GCIP_PROJECT_ID: TEST_PROJECT_ID,
    IAP_GCIP_TENANT_ID: "tenant-a",
    IAP_EXTERNAL_AUTH_API_KEY: TEST_API_KEY
  }
]) {
  assert.throws(
    () => passwordResetServerConfiguration({
      NODE_ENV: "production",
      IAP_GCIP_PROJECT_ID: TEST_PROJECT_ID,
      IAP_GCIP_TENANT_ID: "",
      IAP_EXTERNAL_AUTH_API_KEY: TEST_API_KEY,
      ...invalidEnvironment
    })
  );
}

assert.equal(
  trustedPasswordResetClientIp({
    headers: {
      "x-password-reset-client-ip": "198.51.100.48",
      "x-forwarded-for": "203.0.113.9, 10.0.0.1"
    },
    socket: { remoteAddress: "127.0.0.1" }
  }, { production: true }),
  "198.51.100.48",
  "Produktion darf nur den vom Load Balancer überschriebenen Client-IP-Header verwenden."
);
assert.throws(
  () => trustedPasswordResetClientIp({
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" }
  }, { production: true }),
  PasswordResetInfrastructureError
);

function httpRequest(port, {
  method = "POST",
  path = PASSWORD_RESET_BROKER_PATH,
  headers = {},
  body = ""
} = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text,
          json: text ? JSON.parse(text) : null
        });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function withHttpHandler(configuration, brokerForHandler, callback) {
  const server = http.createServer(createPasswordResetHttpHandler({
    configuration,
    broker: brokerForHandler
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await callback(address.port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const localHttpConfiguration = Object.freeze({
  production: false,
  allowedOrigin: "http://portal.test",
  allowedHost: "portal.test"
});
const browserHeaders = Object.freeze({
  host: "portal.test",
  origin: "http://portal.test",
  "content-type": "application/json; charset=utf-8",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty"
});
const httpBrokerCalls = [];
await withHttpHandler(localHttpConfiguration, {
  async request(request) {
    httpBrokerCalls.push(request);
    return PASSWORD_RESET_ACCEPTED_RESPONSE;
  }
}, async (port) => {
  const health = await httpRequest(port, { method: "GET", path: "/healthz" });
  assert.equal(health.status, 200);
  assert.deepEqual(health.json, { ok: true });

  const accepted = await httpRequest(port, {
    headers: browserHeaders,
    body: JSON.stringify({ email: TEST_EMAIL })
  });
  assert.equal(accepted.status, 202);
  assert.deepEqual(accepted.json, PASSWORD_RESET_ACCEPTED_RESPONSE);
  assert.equal(accepted.headers["cache-control"], "no-store");
  assert.equal(accepted.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(httpBrokerCalls, [{ email: TEST_EMAIL, clientIp: "127.0.0.1" }]);

  for (const requestVariant of [
    { method: "GET", path: PASSWORD_RESET_BROKER_PATH },
    { method: "PUT", path: PASSWORD_RESET_BROKER_PATH },
    { method: "POST", path: `${PASSWORD_RESET_BROKER_PATH}?debug=1` },
    { method: "POST", path: `${PASSWORD_RESET_BROKER_PATH}/` }
  ]) {
    const response = await httpRequest(port, {
      ...requestVariant,
      headers: browserHeaders
    });
    assert.equal(response.status, 404, `${requestVariant.method} ${requestVariant.path} muss 404 liefern.`);
  }

  for (const [label, changedHeaders] of [
    ["Host", { host: "attacker.example" }],
    ["Origin", { origin: "https://attacker.example" }],
    ["Content-Type", { "content-type": "text/plain" }],
    ["Sec-Fetch-Site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Mode", { "sec-fetch-mode": "navigate" }],
    ["Sec-Fetch-Dest", { "sec-fetch-dest": "document" }],
    ["Authorization", { authorization: "Bearer browser-secret" }],
    ["Cookie", { cookie: "session=browser-secret" }]
  ]) {
    const response = await httpRequest(port, {
      headers: { ...browserHeaders, ...changedHeaders }
    });
    assert.equal(response.status, 403, `${label} muss fail-closed geprüft werden.`);
  }

  for (const [label, body] of [
    ["ungültiges JSON", "{"],
    ["Array statt Objekt", "[]"],
    ["zusätzliches Feld", JSON.stringify({ email: TEST_EMAIL, debug: true })],
    ["nicht-string E-Mail", JSON.stringify({ email: 42 })]
  ]) {
    const response = await httpRequest(port, { headers: browserHeaders, body });
    assert.equal(response.status, 400, `${label} muss 400 liefern.`);
  }
  assert.equal(httpBrokerCalls.length, 1, "Abgewiesene HTTP-Anfragen dürfen den Broker nicht erreichen.");
});

const originalConsoleError = console.error;
const capturedErrors = [];
console.error = (...values) => capturedErrors.push(values.join(" "));
try {
  await withHttpHandler(localHttpConfiguration, {
    async request() {
      throw new PasswordResetInfrastructureError(`private ${TEST_EMAIL}`);
    }
  }, async (port) => {
    const response = await httpRequest(port, {
      headers: browserHeaders,
      body: JSON.stringify({ email: TEST_EMAIL })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(response.json, {
      error: "Passwort-Reset ist vorübergehend nicht erreichbar."
    });
    assert.equal(response.text.includes(TEST_EMAIL), false);
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(capturedErrors.length, 1);
assert.equal(capturedErrors[0].includes(TEST_EMAIL), false, "Server-Logs dürfen die Reset-E-Mail nicht enthalten.");

console.log("Password Reset Broker Test OK: Eligibility, Neutralität, Identity-Platform-Vertrag, Rate-Limit und HTTP-Grenze sind abgesichert.");
