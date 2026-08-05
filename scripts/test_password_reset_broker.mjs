import assert from "node:assert/strict";
import http from "node:http";

import {
  PASSWORD_INVITATION_INVALID_MESSAGE,
  PASSWORD_RESET_ACCEPTED_RESPONSE,
  PASSWORD_RESET_BROKER_PATH,
  PasswordInvitationInvalidError,
  PasswordResetInfrastructureError,
  createIdentityPlatformPasswordResetClient,
  createPasswordInvitationStore,
  createPasswordResetBroker,
  createPasswordResetRateLimiter,
  exactPasswordOnlyIdentityUser,
  normalizePasswordResetEmail,
  passwordInvitationObjectName,
  trustedPasswordResetClientIp,
  validateActivePasswordInvitation
} from "../api/password-reset-broker.mjs";
import {
  createPasswordResetHttpHandler,
  createPasswordResetServer,
  passwordResetServerConfiguration
} from "../api/password-reset-server.mjs";

const TEST_EMAIL = "timo.frank@gematik.de";
const TEST_PROJECT_ID = "versorgungs-kompass-test";
const TEST_API_KEY = `AIza${"a".repeat(35)}`;
const TEST_CONTINUE_URL = "https://versorgungs-kompass.de/start";
const TEST_INVITATION_BUCKET = `${TEST_PROJECT_ID}-vk-pre-gematik-invitations`;
const TEST_INVITATION_TOKEN = Buffer.alloc(32, 7).toString("base64url");
const TEST_ACCEPTED_AT = "2026-08-04T10:00:00.000Z";
const TEST_EXPIRES_AT = "2026-08-06T10:00:00.000Z";
const TEST_NOW = Date.parse("2026-08-04T11:00:00.000Z");
const TEST_OOB_CODE = "syntheticPasswordActionCode1234567890";
const TEST_RAW_ACTION_URL = `https://${TEST_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${TEST_OOB_CODE}&apiKey=${TEST_API_KEY}&continueUrl=${encodeURIComponent(TEST_CONTINUE_URL)}`;
const TEST_ACTION_URL = `https://versorgungs-kompass.de/konto/passwort-festlegen?mode=resetPassword&oobCode=${TEST_OOB_CODE}&apiKey=${TEST_API_KEY}&continueUrl=${encodeURIComponent(TEST_CONTINUE_URL)}&lang=de`;
const TEST_SMTP_PASSWORD = "synthetic-smtp-password";

async function rejectUnexpectedPasswordResetEmail() {
  throw new Error("Für diesen Test darf keine Reset-Mail versendet werden.");
}

function activeInvitation(overrides = {}) {
  return {
    version: "v1",
    purpose: "password_invitation",
    status: "active",
    project_id: TEST_PROJECT_ID,
    tenant_id: "",
    uid: "password-user-1",
    email: TEST_EMAIL,
    continue_url: TEST_CONTINUE_URL,
    prepared_at: "2026-08-04T09:00:00.000Z",
    accepted_at: TEST_ACCEPTED_AT,
    expires_at: TEST_EXPIRES_AT,
    account_fingerprint: `sha256:${"1".repeat(64)}`,
    guest_access_fingerprint: `sha256:${"2".repeat(64)}`,
    binding_state_fingerprint: `sha256:${"3".repeat(64)}`,
    profile_id: "11111111-1111-4111-8111-111111111111",
    role: "viewer",
    access_scope: "test_only",
    scope_ref: "external-pilot:synthetic-password-user",
    ...overrides
  };
}

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
    return new Response(JSON.stringify({
      email: TEST_EMAIL,
      oobLink: TEST_RAW_ACTION_URL
    }), {
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
assert.equal(await identityClient.generatePasswordResetActionUrl(TEST_EMAIL), TEST_ACTION_URL);
assert.equal(identityRequests.length, 2);

const [lookupRequest, generateRequest] = identityRequests;
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
  new URL(generateRequest.url).pathname,
  `/v1/projects/${TEST_PROJECT_ID}/accounts:sendOobCode`
);
assert.deepEqual(generateRequest.body, {
  requestType: "PASSWORD_RESET",
  email: TEST_EMAIL,
  continueUrl: TEST_CONTINUE_URL,
  canHandleCodeInApp: false,
  returnOobLink: true,
  clientType: "CLIENT_TYPE_WEB"
});

const brandedIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async () => new Response(JSON.stringify({
    email: TEST_EMAIL,
    oobLink: TEST_ACTION_URL.replace("lang=de", "lang=en")
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
});
assert.equal(
  await brandedIdentityClient.generatePasswordResetActionUrl(TEST_EMAIL),
  TEST_ACTION_URL,
  "Identity Platform darf den OOB-Link bereits auf dem kanonischen Portal-Origin liefern."
);

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
  await privateLookupClient.generatePasswordResetActionUrl(TEST_EMAIL),
  null,
  "Ein nach Aktivierung nicht mehr gültiges Konto darf keinen Aktionslink erhalten."
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

const invitationObjectName = passwordInvitationObjectName(TEST_INVITATION_TOKEN);
assert.match(invitationObjectName, /^active\/[a-f0-9]{64}\.json$/u);
assert.equal(invitationObjectName.includes(TEST_INVITATION_TOKEN), false);
for (const invalidToken of ["", "short", `${TEST_INVITATION_TOKEN}=`, TEST_INVITATION_TOKEN.slice(1)]) {
  assert.throws(() => passwordInvitationObjectName(invalidToken), PasswordInvitationInvalidError);
}
assert.deepEqual(
  validateActivePasswordInvitation(activeInvitation(), {
    projectId: TEST_PROJECT_ID,
    continueUrl: TEST_CONTINUE_URL,
    now: TEST_NOW
  }),
  activeInvitation()
);
for (const invalidInvitationDocument of [
  activeInvitation({ debug: true }),
  activeInvitation({ version: 1 }),
  activeInvitation({ access_scope: "standard" }),
  activeInvitation({ uid: "short" }),
  activeInvitation({ accepted_at: "2026-08-04T10:00:00Z" }),
  activeInvitation({ expires_at: "2026-08-06T09:59:59.999Z" }),
  activeInvitation({ continue_url: "https://attacker.example/start" })
]) {
  assert.throws(
    () => validateActivePasswordInvitation(invalidInvitationDocument, {
      projectId: TEST_PROJECT_ID,
      continueUrl: TEST_CONTINUE_URL,
      now: TEST_NOW
    }),
    PasswordInvitationInvalidError
  );
}
assert.throws(
  () => validateActivePasswordInvitation(activeInvitation(), {
    projectId: TEST_PROJECT_ID,
    continueUrl: TEST_CONTINUE_URL,
    now: Date.parse(TEST_EXPIRES_AT)
  }),
  PasswordInvitationInvalidError,
  "Die Einladung muss am exakten 48-Stunden-Ende abgelaufen sein."
);

const storageRequests = [];
const activeInvitationJson = JSON.stringify(activeInvitation());
const invitationStore = createPasswordInvitationStore({
  bucketName: TEST_INVITATION_BUCKET,
  accessTokenProvider: async () => "storage-access-token",
  fetchImpl: async (url, options) => {
    storageRequests.push({ url, options });
    if (options.method === "GET") {
      const requestUrl = new URL(url);
      const body = requestUrl.searchParams.get("alt") === "media"
        ? activeInvitationJson
        : JSON.stringify({
            name: invitationObjectName,
            size: String(Buffer.byteLength(activeInvitationJson, "utf8")),
            contentType: "application/json",
            generation: "42"
          });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      });
    }
    return new Response(null, { status: 204 });
  }
});
assert.deepEqual(await invitationStore.getActive(invitationObjectName), {
  generation: "42",
  value: activeInvitation()
});
assert.equal(await invitationStore.deleteActive(invitationObjectName, "42"), true);
assert.equal(storageRequests.length, 3);
const storageMetadataUrl = new URL(storageRequests[0].url);
assert.equal(storageMetadataUrl.origin, "https://storage.googleapis.com");
assert.equal(
  storageMetadataUrl.pathname,
  `/storage/v1/b/${TEST_INVITATION_BUCKET}/o/${encodeURIComponent(invitationObjectName)}`
);
assert.deepEqual(
  [...storageMetadataUrl.searchParams],
  [["fields", "name,size,contentType,generation"]]
);
const storageMediaUrl = new URL(storageRequests[1].url);
assert.equal(storageMediaUrl.pathname, storageMetadataUrl.pathname);
assert.deepEqual([...storageMediaUrl.searchParams], [
  ["alt", "media"],
  ["generation", "42"]
]);
const storageDeleteUrl = new URL(storageRequests[2].url);
assert.equal(storageDeleteUrl.pathname, storageMetadataUrl.pathname);
assert.deepEqual([...storageDeleteUrl.searchParams], [["ifGenerationMatch", "42"]]);
for (const request of storageRequests) {
  assert.equal(request.options.headers.authorization, "Bearer storage-access-token");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers["x-goog-user-project"], undefined);
}

const missingInvitationStore = createPasswordInvitationStore({
  bucketName: TEST_INVITATION_BUCKET,
  accessTokenProvider: async () => "storage-access-token",
  fetchImpl: async (_url, options) => new Response(null, {
    status: options.method === "DELETE" ? 412 : 404
  })
});
assert.equal(await missingInvitationStore.getActive(invitationObjectName), null);
assert.equal(await missingInvitationStore.deleteActive(invitationObjectName, "42"), false);

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

const brokerCalls = { lookup: [], generate: [], send: [] };
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
  async generatePasswordResetActionUrl(email) {
    brokerCalls.generate.push(email);
    return TEST_ACTION_URL;
  }
};
const broker = createPasswordResetBroker({
  identityClient: brokerIdentityClient,
  async sendPasswordResetEmail(message) {
    brokerCalls.send.push(message);
  },
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
assert.deepEqual(brokerCalls.generate, [TEST_EMAIL]);
assert.deepEqual(brokerCalls.send, [{ recipient: TEST_EMAIL, actionUrl: TEST_ACTION_URL }]);

const invitationSequence = [];
const invitationBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail(email) {
      invitationSequence.push("identity-lookup");
      return explicitPasswordUser({ email });
    },
    async generatePasswordResetActionUrl(email) {
      invitationSequence.push("oob-mint");
      assert.equal(email, TEST_EMAIL);
      return TEST_ACTION_URL;
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive(objectName) {
      invitationSequence.push("invitation-get");
      assert.equal(objectName, invitationObjectName);
      return { generation: "42", value: activeInvitation() };
    },
    async deleteActive(objectName, generation) {
      invitationSequence.push("conditional-delete");
      assert.equal(objectName, invitationObjectName);
      assert.equal(generation, "42");
      return true;
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => TEST_NOW,
  minimumResponseMs: 0
});
assert.deepEqual(
  await invitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.60"
  }),
  { redeemed: true, actionUrl: TEST_ACTION_URL }
);
assert.deepEqual(invitationSequence, [
  "invitation-get",
  "identity-lookup",
  "conditional-delete",
  "oob-mint"
]);

const invitationDelayCalls = [];
const durationInvitationBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive() {
      return { generation: "47", value: activeInvitation() };
    },
    async deleteActive() {
      return true;
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => TEST_NOW,
  delay: async (milliseconds) => invitationDelayCalls.push(milliseconds),
  minimumResponseMs: 750
});
await assert.rejects(
  () => durationInvitationBroker.request({
    invitationToken: "invalid",
    clientIp: "198.51.100.65"
  }),
  PasswordInvitationInvalidError
);
await durationInvitationBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.66"
});
assert.deepEqual(
  invitationDelayCalls,
  [750, 750],
  "Ungültige und gültige Einladungen müssen dieselbe Mindestdauer erhalten."
);

let racedMintCalls = 0;
const racedInvitationBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      racedMintCalls += 1;
      return TEST_ACTION_URL;
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive() {
      return { generation: "43", value: activeInvitation() };
    },
    async deleteActive() {
      return false;
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => TEST_NOW,
  minimumResponseMs: 0
});
await assert.rejects(
  () => racedInvitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.61"
  }),
  (error) => (
    error instanceof PasswordInvitationInvalidError
    && error.message === PASSWORD_INVITATION_INVALID_MESSAGE
    && !error.message.includes(TEST_INVITATION_TOKEN)
    && !error.message.includes(TEST_EMAIL)
  ),
  "Nur der Gewinner des generation-sicheren Deletes darf einen OOB-Code prägen."
);
assert.equal(racedMintCalls, 0);

let expiredIdentityLookups = 0;
const expiredInvitationBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      expiredIdentityLookups += 1;
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive() {
      return { generation: "44", value: activeInvitation() };
    },
    async deleteActive() {
      throw new Error("Eine abgelaufene Einladung darf nicht gelöscht werden.");
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => Date.parse(TEST_EXPIRES_AT),
  minimumResponseMs: 0
});
await assert.rejects(
  () => expiredInvitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.62"
  }),
  PasswordInvitationInvalidError
);
assert.equal(expiredIdentityLookups, 0);

const wrongIdentityInvitationBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser({ localId: "different-password-user" });
    },
    async generatePasswordResetActionUrl() {
      throw new Error("Ein UID-Mismatch darf keinen OOB-Code prägen.");
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive() {
      return { generation: "45", value: activeInvitation() };
    },
    async deleteActive() {
      throw new Error("Ein UID-Mismatch darf die Einladung nicht verbrauchen.");
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => TEST_NOW,
  minimumResponseMs: 0
});
await assert.rejects(
  () => wrongIdentityInvitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.63"
  }),
  PasswordInvitationInvalidError
);

const mintFailureSequence = [];
const mintFailureBroker = createPasswordResetBroker({
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      mintFailureSequence.push("oob-mint-failed");
      throw new Error(`private Identity failure for ${TEST_EMAIL}`);
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
  invitationStore: {
    async getActive() {
      return { generation: "46", value: activeInvitation() };
    },
    async deleteActive() {
      mintFailureSequence.push("conditional-delete");
      return true;
    }
  },
  projectId: TEST_PROJECT_ID,
  continueUrl: TEST_CONTINUE_URL,
  now: () => TEST_NOW,
  minimumResponseMs: 0
});
await assert.rejects(
  () => mintFailureBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.64"
  }),
  (error) => (
    error instanceof PasswordResetInfrastructureError
    && !error.message.includes(TEST_EMAIL)
    && !error.message.includes(TEST_INVITATION_TOKEN)
  )
);
assert.deepEqual(mintFailureSequence, ["conditional-delete", "oob-mint-failed"]);

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
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  async sendPasswordResetEmail() {
    deliveryStartedResolve();
    await deliveryRelease;
    throw new Error(`private delivery failure for ${TEST_EMAIL}`);
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
    async generatePasswordResetActionUrl() {
      throw new Error("Ein rate-limitierter Request darf keinen OOB-Link prägen.");
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
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
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
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

const validServerEnvironment = Object.freeze({
  NODE_ENV: "production",
  PORT: "8087",
  PASSWORD_RESET_BROKER_ENABLED: "1",
  PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de",
  IAP_GCIP_PROJECT_ID: TEST_PROJECT_ID,
  IAP_GCIP_TENANT_ID: "",
  IAP_EXTERNAL_AUTH_API_KEY: TEST_API_KEY,
  PASSWORD_INVITATION_BUCKET: TEST_INVITATION_BUCKET,
  PASSWORD_RESET_SMTP_PASSWORD: TEST_SMTP_PASSWORD
});
const validServerConfiguration = passwordResetServerConfiguration(validServerEnvironment);
assert.deepEqual(validServerConfiguration, {
  production: true,
  port: 8087,
  projectId: TEST_PROJECT_ID,
  tenantId: "",
  apiKey: TEST_API_KEY,
  invitationBucketName: TEST_INVITATION_BUCKET,
  allowedOrigin: "https://versorgungs-kompass.de",
  allowedHost: "versorgungs-kompass.de",
  continueUrl: TEST_CONTINUE_URL
});
assert.equal(
  JSON.stringify(validServerConfiguration).includes(TEST_SMTP_PASSWORD),
  false,
  "Das SMTP-Passwort darf nicht in die lesbare Serverkonfiguration gelangen."
);
const wiredPasswordResetServer = createPasswordResetServer({
  env: validServerEnvironment,
  accessTokenProvider: async () => "synthetic-access-token",
  minimumResponseMs: 0
});
assert.deepEqual(wiredPasswordResetServer.configuration, validServerConfiguration);
assert.equal(wiredPasswordResetServer.server.listening, false);
assert.equal(typeof wiredPasswordResetServer.broker.request, "function");
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
  },
  {
    PASSWORD_RESET_BROKER_ENABLED: "1",
    PASSWORD_RESET_ALLOWED_ORIGIN: "https://versorgungs-kompass.de",
    PASSWORD_RESET_SMTP_PASSWORD: ""
  }
]) {
  assert.throws(
    () => passwordResetServerConfiguration({
      NODE_ENV: "production",
      IAP_GCIP_PROJECT_ID: TEST_PROJECT_ID,
      IAP_GCIP_TENANT_ID: "",
      IAP_EXTERNAL_AUTH_API_KEY: TEST_API_KEY,
      PASSWORD_INVITATION_BUCKET: TEST_INVITATION_BUCKET,
      PASSWORD_RESET_SMTP_PASSWORD: TEST_SMTP_PASSWORD,
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
    return request.invitationToken
      ? { redeemed: true, actionUrl: TEST_ACTION_URL }
      : PASSWORD_RESET_ACCEPTED_RESPONSE;
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

  const redeemed = await httpRequest(port, {
    headers: browserHeaders,
    body: JSON.stringify({ invitationToken: TEST_INVITATION_TOKEN })
  });
  assert.equal(redeemed.status, 200);
  assert.deepEqual(redeemed.json, { redeemed: true, actionUrl: TEST_ACTION_URL });
  assert.equal(redeemed.headers["cache-control"], "no-store");
  assert.deepEqual(httpBrokerCalls, [
    { email: TEST_EMAIL, clientIp: "127.0.0.1" },
    { invitationToken: TEST_INVITATION_TOKEN, clientIp: "127.0.0.1" }
  ]);

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
    ["nicht-string E-Mail", JSON.stringify({ email: 42 })],
    ["beide Zwecke", JSON.stringify({ email: TEST_EMAIL, invitationToken: TEST_INVITATION_TOKEN })],
    ["nicht-string Einladung", JSON.stringify({ invitationToken: 42 })]
  ]) {
    const response = await httpRequest(port, { headers: browserHeaders, body });
    assert.equal(response.status, 400, `${label} muss 400 liefern.`);
  }
  assert.equal(httpBrokerCalls.length, 2, "Abgewiesene HTTP-Anfragen dürfen den Broker nicht erreichen.");
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

await withHttpHandler(localHttpConfiguration, {
  async request() {
    throw new PasswordInvitationInvalidError();
  }
}, async (port) => {
  const response = await httpRequest(port, {
    headers: browserHeaders,
    body: JSON.stringify({ invitationToken: TEST_INVITATION_TOKEN })
  });
  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { error: PASSWORD_INVITATION_INVALID_MESSAGE });
  assert.equal(response.text.includes(TEST_INVITATION_TOKEN), false);
  assert.equal(response.text.includes(TEST_EMAIL), false);
  assert.equal(response.headers["cache-control"], "no-store");
});

console.log("Password Reset Broker Test OK: Reset-Neutralität und atomare 48-Stunden-Einladungen sind abgesichert.");
