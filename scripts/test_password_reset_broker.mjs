import assert from "node:assert/strict";
import http from "node:http";

import {
  PASSWORD_INVITATION_INVALID_MESSAGE,
  PASSWORD_RESET_ACCEPTED_RESPONSE,
  PASSWORD_RESET_BROKER_PATH,
  PasswordInvitationInvalidError,
  PasswordInvitationRateLimitError,
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
const TEST_PROVIDER_API_KEY = `AIza${"b".repeat(35)}`;
const TEST_CONTINUE_URL = "https://versorgungs-kompass.de/start";
const TEST_INVITATION_BUCKET = `${TEST_PROJECT_ID}-vk-pre-gematik-invitations`;
const TEST_INVITATION_TOKEN = Buffer.alloc(32, 7).toString("base64url");
const TEST_ACCEPTED_AT = "2026-08-04T10:00:00.000Z";
const TEST_EXPIRES_AT = "2026-08-06T10:00:00.000Z";
const TEST_NOW = Date.parse("2026-08-04T11:00:00.000Z");
const TEST_PASSWORD_UPDATED_AT = 1_754_302_800_000;
const TEST_PASSWORD_UPDATED_AFTER = TEST_PASSWORD_UPDATED_AT + 60_000;
const TEST_OOB_CODE = "syntheticPasswordActionCode1234567890";
const TEST_RAW_ACTION_URL = `https://${TEST_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${TEST_OOB_CODE}&apiKey=${TEST_API_KEY}&continueUrl=${encodeURIComponent(TEST_CONTINUE_URL)}`;
const TEST_PROVIDER_ACTION_URL = `https://${TEST_PROJECT_ID}.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${TEST_OOB_CODE}&apiKey=${TEST_PROVIDER_API_KEY}&continueUrl=${encodeURIComponent(TEST_CONTINUE_URL)}`;
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
    passwordUpdatedAt: TEST_PASSWORD_UPDATED_AT,
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
  ["passwordHash", { passwordHash: "redacted-password-hash", passwordUpdatedAt: undefined }],
  ["passwordUpdatedAt", { passwordHash: undefined, passwordUpdatedAt: 1_753_923_600_000 }],
  ["version", { passwordHash: undefined, passwordUpdatedAt: undefined, version: 1 }]
]) {
  assert.deepEqual(
    exactPasswordOnlyIdentityUser(implicitPasswordUser(passwordEvidence), TEST_EMAIL),
    { uid: "password-user-1", email: TEST_EMAIL },
    `Identity Toolkit darf ${label} liefern, obwohl providerUserInfo leer ist.`
  );
}

const ineligibleUsers = new Map([
  ["unbekannter User", null],
  ["User ohne Passwort-Evidenz", implicitPasswordUser({
    passwordHash: undefined,
    passwordUpdatedAt: undefined
  })],
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
    if (String(url).includes("accounts:resetPassword")) {
      return new Response(JSON.stringify({
        email: TEST_EMAIL,
        requestType: "PASSWORD_RESET"
      }), {
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
assert.equal(identityRequests.length, 3);

const [lookupRequest, generateRequest, validateOobRequest] = identityRequests;
for (const request of [lookupRequest, generateRequest]) {
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
assert.equal(new URL(validateOobRequest.url).pathname, "/v1/accounts:resetPassword");
assert.equal(new URL(validateOobRequest.url).searchParams.get("key"), TEST_API_KEY);
assert.equal(validateOobRequest.options.method, "POST");
assert.equal(validateOobRequest.options.headers.authorization, undefined);
assert.equal(validateOobRequest.options.headers.accept, "application/json");
assert.equal(validateOobRequest.options.headers["content-type"], "application/json");
assert.equal(validateOobRequest.options.headers.referer, "https://versorgungs-kompass.de/");
assert.equal(validateOobRequest.options.headers["x-firebase-locale"], undefined);
assert.deepEqual(validateOobRequest.body, { oobCode: TEST_OOB_CODE });

const brandedIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async (url) => new Response(JSON.stringify(
    String(url).includes("accounts:resetPassword")
      ? { email: TEST_EMAIL, requestType: "PASSWORD_RESET" }
      : { email: TEST_EMAIL, oobLink: TEST_ACTION_URL.replace("lang=de", "lang=en") }
  ), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
});
assert.equal(
  await brandedIdentityClient.generatePasswordResetActionUrl(TEST_EMAIL),
  TEST_ACTION_URL,
  "Identity Platform darf den OOB-Link bereits auf dem kanonischen Portal-Origin liefern."
);

const providerKeyRequests = [];
const providerKeyIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async (url, options) => {
    const request = { url: String(url), options, body: JSON.parse(options.body) };
    providerKeyRequests.push(request);
    if (request.url.includes("accounts:sendOobCode")) {
      return new Response(JSON.stringify({
        email: TEST_EMAIL,
        oobLink: TEST_PROVIDER_ACTION_URL
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    assert.equal(
      new URL(request.url).pathname,
      "/v1/accounts:resetPassword",
      "Ein fremder valider Provider-Key muss vor dem Umschreiben über den öffentlichen OOB-Endpunkt verifiziert werden."
    );
    return new Response(JSON.stringify({
      email: TEST_EMAIL,
      requestType: "PASSWORD_RESET"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
});
assert.equal(
  await providerKeyIdentityClient.generatePasswordResetActionUrl(TEST_EMAIL),
  TEST_ACTION_URL,
  "Nach erfolgreicher OOB-Prüfung muss der Link auf den fest konfigurierten Portal-Key umgeschrieben werden."
);
assert.equal(providerKeyRequests.length, 2);
const providerOobValidationRequest = providerKeyRequests[1];
assert.equal(new URL(providerOobValidationRequest.url).searchParams.get("key"), TEST_API_KEY);
assert.equal(providerOobValidationRequest.options.method, "POST");
assert.equal(providerOobValidationRequest.options.redirect, "error");
assert.equal(providerOobValidationRequest.options.headers.authorization, undefined);
assert.equal(providerOobValidationRequest.options.headers["content-type"], "application/json");
assert.deepEqual(providerOobValidationRequest.body, { oobCode: TEST_OOB_CODE });

const mismatchedProviderKeyIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async (url) => String(url).includes("accounts:sendOobCode")
    ? new Response(JSON.stringify({ email: TEST_EMAIL, oobLink: TEST_PROVIDER_ACTION_URL }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    : new Response(JSON.stringify({
        email: "attacker@example.invalid",
        requestType: "PASSWORD_RESET"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
});
await assert.rejects(
  () => mismatchedProviderKeyIdentityClient.generatePasswordResetActionUrl(TEST_EMAIL),
  (error) => error instanceof PasswordResetInfrastructureError && error.stage === "oob_validate",
  "Ein OOB-Code für eine andere E-Mail-Adresse darf trotz syntaktisch gültigem Provider-Key nicht übernommen werden."
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

for (const privateCode of ["EMAIL_NOT_FOUND", "USER_DISABLED", "USER_NOT_FOUND"]) {
  const privateCodeServerErrorClient = createIdentityPlatformPasswordResetClient({
    projectId: TEST_PROJECT_ID,
    apiKey: TEST_API_KEY,
    continueUrl: TEST_CONTINUE_URL,
    accessTokenProvider: async () => "test-token",
    fetchImpl: async () => errorResponse(privateCode, 500)
  });
  await assert.rejects(
    () => privateCodeServerErrorClient.lookupByEmail(TEST_EMAIL),
    (error) => error instanceof PasswordResetInfrastructureError && error.status === 503,
    `Ein HTTP-5xx mit ${privateCode} darf nicht als definitiver Lookup-Miss gelten.`
  );
  await assert.rejects(
    () => privateCodeServerErrorClient.generatePasswordResetActionUrl(TEST_EMAIL),
    (error) => (
      error instanceof PasswordResetInfrastructureError
      && error.stage === "oob_request"
      && error.mintOutcome === "unknown"
    ),
    `Ein HTTP-5xx mit ${privateCode} darf nicht als sicher nicht versendeter Reset gelten.`
  );
}

for (const transientCode of [
  "CAPTCHA_CHECK_FAILED",
  "INVALID_RECAPTCHA_TOKEN",
  "MISSING_CAPTCHA_TOKEN",
  "RESET_PASSWORD_EXCEED_LIMIT",
  "TOO_MANY_ATTEMPTS",
  "TOO_MANY_ATTEMPTS_TRY_LATER"
]) {
  const throttledIdentityClient = createIdentityPlatformPasswordResetClient({
    projectId: TEST_PROJECT_ID,
    apiKey: TEST_API_KEY,
    continueUrl: TEST_CONTINUE_URL,
    accessTokenProvider: async () => "test-token",
    fetchImpl: async () => errorResponse(transientCode)
  });
  await assert.rejects(
    () => throttledIdentityClient.generatePasswordResetActionUrl(TEST_EMAIL),
    (error) => (
      error instanceof PasswordResetInfrastructureError
      && error.stage === "oob_request"
      && error.mintOutcome === "not_sent"
    ),
    `${transientCode} muss die gültige Einladung reaktivierbar halten und als temporärer 503 enden.`
  );
}

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

function createSharedInvitationStore({
  generation = "42",
  metageneration = "1",
  metadata = {},
  value = activeInvitation()
} = {}) {
  let current = {
    generation,
    metageneration,
    metadata: { ...metadata },
    value: structuredClone(value)
  };
  let failAfterAppliedPatch = null;
  let deferredPatchUntilRetry = null;
  let deferNextPatch = false;
  const calls = [];

  function snapshot({ includeValue = true } = {}) {
    if (!current) return null;
    return {
      generation: current.generation,
      metageneration: current.metageneration,
      metadata: { ...current.metadata },
      ...(includeValue ? { value: structuredClone(current.value) } : {})
    };
  }

  const store = Object.freeze({
    async getActive(objectName) {
      assert.equal(objectName, invitationObjectName);
      calls.push({ method: "get", objectName });
      return snapshot();
    },
    async updateActiveMetadata(objectName, expectedGeneration, expectedMetageneration, nextMetadata) {
      assert.equal(objectName, invitationObjectName);
      calls.push({
        method: "patch",
        objectName,
        generation: expectedGeneration,
        metageneration: expectedMetageneration,
        metadata: structuredClone(nextMetadata)
      });
      if (deferredPatchUntilRetry) {
        current = {
          ...current,
          metageneration: String(Number(current.metageneration) + 1),
          metadata: deferredPatchUntilRetry
        };
        deferredPatchUntilRetry = null;
      }
      if (
        !current
        || expectedGeneration !== current.generation
        || expectedMetageneration !== current.metageneration
      ) {
        return null;
      }
      if (deferNextPatch) {
        deferNextPatch = false;
        deferredPatchUntilRetry = structuredClone(nextMetadata);
        throw new PasswordResetInfrastructureError(undefined, { stage: "invitation_claim" });
      }
      current = {
        ...current,
        metageneration: String(Number(current.metageneration) + 1),
        metadata: structuredClone(nextMetadata)
      };
      const updated = snapshot({ includeValue: false });
      if (failAfterAppliedPatch?.(updated)) {
        failAfterAppliedPatch = null;
        throw new PasswordResetInfrastructureError(undefined, { stage: "invitation_claim" });
      }
      return updated;
    }
  });

  return Object.freeze({
    store,
    calls,
    snapshot,
    failNextPatchAfterApply(predicate) {
      failAfterAppliedPatch = predicate;
    },
    deferNextPatchUntilRetry() {
      deferNextPatch = true;
    },
    tamperMetadata(change) {
      current = {
        ...current,
        metageneration: String(Number(current.metageneration) + 1),
        metadata: change(structuredClone(current.metadata))
      };
      return snapshot();
    }
  });
}

const storageRequests = [];
const activeInvitationJson = JSON.stringify(activeInvitation());
let storageCurrentMetageneration = 7;
let storageCurrentCustomMetadata = {};
const storageMintingMetadata = Object.freeze({
  vk_state: "minting",
  vk_attempt: Buffer.alloc(16, 5).toString("base64url"),
  vk_password_updated_at: String(TEST_PASSWORD_UPDATED_AT),
  vk_claimed_at: new Date(TEST_NOW).toISOString()
});
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
            generation: "42",
            metageneration: "7",
            metadata: {}
          });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      });
    }
    if (options.method === "PATCH") {
      const patch = JSON.parse(options.body).metadata;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete storageCurrentCustomMetadata[key];
        else storageCurrentCustomMetadata[key] = value;
      }
      storageCurrentMetageneration += 1;
      return new Response(JSON.stringify({
        name: invitationObjectName,
        generation: "42",
        metageneration: String(storageCurrentMetageneration),
        ...(Object.keys(storageCurrentCustomMetadata).length > 0
          ? { metadata: storageCurrentCustomMetadata }
          : {})
      }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    throw new Error(`Unerwartete Storage-Methode: ${options.method}`);
  }
});
assert.deepEqual(await invitationStore.getActive(invitationObjectName), {
  generation: "42",
  metageneration: "7",
  metadata: {},
  value: activeInvitation()
});
assert.deepEqual(
  await invitationStore.updateActiveMetadata(
    invitationObjectName,
    "42",
    "7",
    storageMintingMetadata
  ),
  {
    generation: "42",
    metageneration: "8",
    metadata: storageMintingMetadata
  }
);
assert.deepEqual(
  await invitationStore.updateActiveMetadata(
    invitationObjectName,
    "42",
    "8",
    {}
  ),
  {
    generation: "42",
    metageneration: "9",
    metadata: {}
  },
  "GCS-PATCH muss ausgelassene Zustandsfelder explizit mit null löschen."
);
assert.equal(storageRequests.length, 4);
const storageMetadataUrl = new URL(storageRequests[0].url);
assert.equal(storageMetadataUrl.origin, "https://storage.googleapis.com");
assert.equal(
  storageMetadataUrl.pathname,
  `/storage/v1/b/${TEST_INVITATION_BUCKET}/o/${encodeURIComponent(invitationObjectName)}`
);
assert.deepEqual(
  [...storageMetadataUrl.searchParams],
  [["fields", "name,size,contentType,generation,metageneration,metadata"]]
);
const storageMediaUrl = new URL(storageRequests[1].url);
assert.equal(storageMediaUrl.pathname, storageMetadataUrl.pathname);
assert.deepEqual([...storageMediaUrl.searchParams], [
  ["alt", "media"],
  ["generation", "42"]
]);
const storagePatchUrl = new URL(storageRequests[2].url);
assert.equal(storagePatchUrl.pathname, storageMetadataUrl.pathname);
assert.deepEqual([...storagePatchUrl.searchParams], [
  ["ifGenerationMatch", "42"],
  ["ifMetagenerationMatch", "7"],
  ["fields", "name,generation,metageneration,metadata"]
]);
assert.equal(storageRequests[2].options.method, "PATCH");
assert.equal(storageRequests[2].options.headers["content-type"], "application/json");
assert.deepEqual(JSON.parse(storageRequests[2].options.body), {
  metadata: {
    vk_action: null,
    vk_attempt: storageMintingMetadata.vk_attempt,
    vk_password_updated_at: storageMintingMetadata.vk_password_updated_at,
    vk_claimed_at: storageMintingMetadata.vk_claimed_at,
    vk_completed_at: null,
    vk_issued_at: null,
    vk_state: storageMintingMetadata.vk_state
  }
});
const storageReactivateUrl = new URL(storageRequests[3].url);
assert.equal(storageReactivateUrl.pathname, storageMetadataUrl.pathname);
assert.deepEqual([...storageReactivateUrl.searchParams], [
  ["ifGenerationMatch", "42"],
  ["ifMetagenerationMatch", "8"],
  ["fields", "name,generation,metageneration,metadata"]
]);
assert.deepEqual(JSON.parse(storageRequests[3].options.body), {
  metadata: {
    vk_action: null,
    vk_attempt: null,
    vk_password_updated_at: null,
    vk_claimed_at: null,
    vk_completed_at: null,
    vk_issued_at: null,
    vk_state: null
  }
});
for (const request of storageRequests) {
  assert.equal(request.options.headers.authorization, "Bearer storage-access-token");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers["x-goog-user-project"], undefined);
}

const missingInvitationStore = createPasswordInvitationStore({
  bucketName: TEST_INVITATION_BUCKET,
  accessTokenProvider: async () => "storage-access-token",
  fetchImpl: async (_url, options) => new Response(null, {
    status: options.method === "PATCH" ? 412 : 404
  })
});
assert.equal(await missingInvitationStore.getActive(invitationObjectName), null);
assert.equal(
  await missingInvitationStore.updateActiveMetadata(
    invitationObjectName,
    "42",
    "7",
    storageMintingMetadata
  ),
  null
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

function createInvitationBroker({
  shared,
  identityClient,
  now = () => TEST_NOW,
  delay = async () => {},
  rateLimiter = { allow: () => true },
  minimumResponseMs = 0
}) {
  return createPasswordResetBroker({
    identityClient,
    sendPasswordResetEmail: rejectUnexpectedPasswordResetEmail,
    invitationStore: shared.store,
    projectId: TEST_PROJECT_ID,
    apiKey: TEST_API_KEY,
    continueUrl: TEST_CONTINUE_URL,
    rateLimiter,
    now,
    delay,
    minimumResponseMs
  });
}

const rateLimitedShared = createSharedInvitationStore({ generation: "420" });
let invitationRateAllowed = false;
let rateLimitedLookups = 0;
const invitationRateLimitedBroker = createInvitationBroker({
  shared: rateLimitedShared,
  identityClient: {
    async lookupByEmail() {
      rateLimitedLookups += 1;
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  rateLimiter: { allow: () => invitationRateAllowed }
});
for (const finalize of [false, true]) {
  await assert.rejects(
    () => invitationRateLimitedBroker.request({
      invitationToken: TEST_INVITATION_TOKEN,
      ...(finalize ? { finalize: true } : {}),
      clientIp: "198.51.100.160"
    }),
    (error) => error instanceof PasswordInvitationRateLimitError && error.status === 429,
    "Ein temporäres Redeem-/Finalize-Limit darf die Einladung nicht als abgelaufen darstellen."
  );
}
assert.equal(rateLimitedLookups, 0);
assert.deepEqual(rateLimitedShared.snapshot().metadata, {});
invitationRateAllowed = true;
assert.deepEqual(
  await invitationRateLimitedBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.160"
  }),
  { redeemed: true, actionUrl: TEST_ACTION_URL },
  "Nach Ende des Limits muss dieselbe unveränderte Einladung wieder einlösbar sein."
);

function promiseWithin(promise, label, timeoutMs = 2_000) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} wurde nicht rechtzeitig erreicht.`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timeout));
}

const retryShared = createSharedInvitationStore();
let retryMintCalls = 0;
const retryInvitationBroker = createInvitationBroker({
  shared: retryShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      retryMintCalls += 1;
      return TEST_ACTION_URL;
    }
  }
});
const firstRedeem = await retryInvitationBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.60"
});
const retriedRedeem = await retryInvitationBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.60"
});
assert.deepEqual(firstRedeem, { redeemed: true, actionUrl: TEST_ACTION_URL });
assert.deepEqual(retriedRedeem, firstRedeem);
assert.equal(retryMintCalls, 1, "Ein Retry muss den bereits ausgegebenen Link wiederverwenden.");
assert.equal(retryShared.snapshot().metadata.vk_state, "issued");
assert.equal(
  retryShared.snapshot().metadata.vk_action.includes(TEST_OOB_CODE),
  false,
  "Der wiederverwendbare OOB-Link darf nicht im Klartext in den Objekt-Metadaten liegen."
);

const concurrentShared = createSharedInvitationStore({ generation: "43" });
let concurrentMintCalls = 0;
let mintStartedResolve;
let mintReleaseResolve;
let secondBrokerWaitingResolve;
const mintStarted = new Promise((resolve) => { mintStartedResolve = resolve; });
const mintRelease = new Promise((resolve) => { mintReleaseResolve = resolve; });
const secondBrokerWaiting = new Promise((resolve) => { secondBrokerWaitingResolve = resolve; });
const concurrentIdentityClient = {
  async lookupByEmail() {
    return explicitPasswordUser();
  },
  async generatePasswordResetActionUrl() {
    concurrentMintCalls += 1;
    mintStartedResolve();
    await mintRelease;
    return TEST_ACTION_URL;
  }
};
const firstConcurrentBroker = createInvitationBroker({
  shared: concurrentShared,
  identityClient: concurrentIdentityClient
});
const secondConcurrentBroker = createInvitationBroker({
  shared: concurrentShared,
  identityClient: concurrentIdentityClient,
  delay: async () => {
    secondBrokerWaitingResolve();
    await mintRelease;
  }
});
const firstConcurrentRequest = firstConcurrentBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.61"
});
await promiseWithin(mintStarted, "Der erste OOB-Mint");
const secondConcurrentRequest = secondConcurrentBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.62"
});
await promiseWithin(secondBrokerWaiting, "Der konkurrierende Minting-Readback");
mintReleaseResolve();
const concurrentResults = await promiseWithin(
  Promise.all([firstConcurrentRequest, secondConcurrentRequest]),
  "Die konkurrierende Einladungseinlösung"
);
assert.deepEqual(concurrentResults, [
  { redeemed: true, actionUrl: TEST_ACTION_URL },
  { redeemed: true, actionUrl: TEST_ACTION_URL }
]);
assert.equal(concurrentMintCalls, 1, "Zwei Brokerinstanzen auf demselben Store dürfen nur einmal prägen.");
assert.equal(concurrentShared.snapshot().metadata.vk_state, "issued");

const longMintShared = createSharedInvitationStore({ generation: "430" });
let longMintCalls = 0;
let longMintPolls = 0;
let longMintStartedResolve;
let longMintReleaseResolve;
const longMintStarted = new Promise((resolve) => { longMintStartedResolve = resolve; });
const longMintRelease = new Promise((resolve) => { longMintReleaseResolve = resolve; });
const longMintIdentityClient = {
  async lookupByEmail() {
    return explicitPasswordUser();
  },
  async generatePasswordResetActionUrl() {
    longMintCalls += 1;
    longMintStartedResolve();
    await longMintRelease;
    return TEST_ACTION_URL;
  }
};
const longMintWinner = createInvitationBroker({
  shared: longMintShared,
  identityClient: longMintIdentityClient
});
const longMintFollower = createInvitationBroker({
  shared: longMintShared,
  identityClient: longMintIdentityClient,
  delay: async () => {
    longMintPolls += 1;
    if (longMintPolls === 150) {
      longMintReleaseResolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
});
const longMintWinnerRequest = longMintWinner.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.161"
});
await promiseWithin(longMintStarted, "Der langsamere OOB-Mint");
const longMintFollowerRequest = longMintFollower.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.162"
});
assert.deepEqual(
  await promiseWithin(
    Promise.all([longMintWinnerRequest, longMintFollowerRequest]),
    "Der Retry innerhalb des vollständigen Mint-Zeitbudgets"
  ),
  [
    { redeemed: true, actionUrl: TEST_ACTION_URL },
    { redeemed: true, actionUrl: TEST_ACTION_URL }
  ]
);
assert.ok(longMintPolls > 120, "Das Konkurrenzbudget muss die frühere Sechs-Sekunden-Grenze überschreiten.");
assert.ok(longMintPolls <= 300);
assert.equal(longMintCalls, 1);

const lostPatchShared = createSharedInvitationStore({ generation: "44" });
lostPatchShared.failNextPatchAfterApply(
  (record) => record.metadata.vk_state === "issued"
);
let lostPatchMintCalls = 0;
const lostPatchBroker = createInvitationBroker({
  shared: lostPatchShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      lostPatchMintCalls += 1;
      return TEST_ACTION_URL;
    }
  }
});
assert.deepEqual(
  await lostPatchBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.63"
  }),
  { redeemed: true, actionUrl: TEST_ACTION_URL },
  "Nach verlorener PATCH-Antwort muss der Readback den bereits ausgegebenen Link bestätigen."
);
assert.equal(lostPatchMintCalls, 1);
assert.equal(lostPatchShared.snapshot().metadata.vk_state, "issued");

const delayedClaimShared = createSharedInvitationStore({ generation: "441" });
delayedClaimShared.deferNextPatchUntilRetry();
let delayedClaimMintCalls = 0;
const delayedClaimBroker = createInvitationBroker({
  shared: delayedClaimShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      delayedClaimMintCalls += 1;
      return TEST_ACTION_URL;
    }
  }
});
assert.deepEqual(
  await delayedClaimBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.163"
  }),
  { redeemed: true, actionUrl: TEST_ACTION_URL },
  "Ein erst vor dem Retry wirksamer Claim muss nach dessen 412 als eigener Erfolg erkannt werden."
);
assert.equal(delayedClaimMintCalls, 1);
assert.equal(delayedClaimShared.snapshot().metadata.vk_state, "issued");

const notSentShared = createSharedInvitationStore({ generation: "45" });
let notSentMintCalls = 0;
const notSentIdentityClient = createIdentityPlatformPasswordResetClient({
  projectId: TEST_PROJECT_ID,
  apiKey: TEST_API_KEY,
  continueUrl: TEST_CONTINUE_URL,
  accessTokenProvider: async () => "test-oauth-access-token",
  fetchImpl: async (url) => {
    if (String(url).includes("accounts:lookup")) {
      return new Response(JSON.stringify({ users: [explicitPasswordUser()] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    notSentMintCalls += 1;
    return errorResponse("OPERATION_NOT_ALLOWED", 400);
  }
});
const notSentBroker = createInvitationBroker({
  shared: notSentShared,
  identityClient: notSentIdentityClient
});
await assert.rejects(
  () => notSentBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.64"
  }),
  (error) => (
    error instanceof PasswordResetInfrastructureError
    && error.stage === "oob_request"
    && !error.message.includes(TEST_EMAIL)
  )
);
assert.equal(notSentMintCalls, 1);
assert.deepEqual(
  notSentShared.snapshot().metadata,
  {},
  "Eine definitive Identity-Ablehnung vor Versand muss die Einladung wieder aktivieren."
);

const unknownMintShared = createSharedInvitationStore({ generation: "46" });
let unknownMintCalls = 0;
const unknownMintBroker = createInvitationBroker({
  shared: unknownMintShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      unknownMintCalls += 1;
      throw new Error(`private unknown mint outcome for ${TEST_EMAIL}`);
    }
  }
});
await assert.rejects(
  () => unknownMintBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.65"
  }),
  (error) => (
    error instanceof PasswordResetInfrastructureError
    && !error.message.includes(TEST_EMAIL)
  )
);
assert.equal(unknownMintShared.snapshot().metadata.vk_state, "uncertain");
await assert.rejects(
  () => unknownMintBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.65"
  }),
  (error) => error instanceof PasswordResetInfrastructureError,
  "Ein unklarer Mint-Ausgang darf nicht durch einen zweiten OOB-Mint übergangen werden."
);
assert.equal(unknownMintCalls, 1);

for (const [index, privateCode] of ["EMAIL_NOT_FOUND", "USER_DISABLED"].entries()) {
  const privateCodeUnknownShared = createSharedInvitationStore({ generation: String(460 + index) });
  let privateCodeUnknownMintCalls = 0;
  const privateCodeUnknownIdentityClient = createIdentityPlatformPasswordResetClient({
    projectId: TEST_PROJECT_ID,
    apiKey: TEST_API_KEY,
    continueUrl: TEST_CONTINUE_URL,
    accessTokenProvider: async () => "test-oauth-access-token",
    fetchImpl: async (url) => {
      if (String(url).includes("accounts:lookup")) {
        return new Response(JSON.stringify({ users: [explicitPasswordUser()] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      privateCodeUnknownMintCalls += 1;
      return errorResponse(privateCode, 500);
    }
  });
  const privateCodeUnknownBroker = createInvitationBroker({
    shared: privateCodeUnknownShared,
    identityClient: privateCodeUnknownIdentityClient
  });
  await assert.rejects(
    () => privateCodeUnknownBroker.request({
      invitationToken: TEST_INVITATION_TOKEN,
      clientIp: `198.51.100.${166 + index}`
    }),
    (error) => (
      error instanceof PasswordResetInfrastructureError
      && error.stage === "oob_request"
      && error.mintOutcome === "unknown"
    )
  );
  assert.equal(privateCodeUnknownShared.snapshot().metadata.vk_state, "uncertain");
  await assert.rejects(
    () => privateCodeUnknownBroker.request({
      invitationToken: TEST_INVITATION_TOKEN,
      clientIp: `198.51.100.${166 + index}`
    }),
    (error) => error instanceof PasswordResetInfrastructureError,
    `Ein unklarer ${privateCode}-Mint darf nicht wiederholt werden.`
  );
  assert.equal(privateCodeUnknownMintCalls, 1);
}

const tamperedShared = createSharedInvitationStore({ generation: "47" });
let tamperedMintCalls = 0;
const tamperedBroker = createInvitationBroker({
  shared: tamperedShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      tamperedMintCalls += 1;
      return TEST_ACTION_URL;
    }
  }
});
await tamperedBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.66"
});
tamperedShared.tamperMetadata((metadata) => ({
  ...metadata,
  vk_action: `${metadata.vk_action.slice(0, -1)}${metadata.vk_action.endsWith("A") ? "B" : "A"}`
}));
await assert.rejects(
  () => tamperedBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.66"
  }),
  (error) => error instanceof PasswordResetInfrastructureError && error.stage === "invitation_issue",
  "Manipulierte ausgegebene Aktionsdaten müssen kryptografisch abgewiesen werden."
);
assert.equal(tamperedMintCalls, 1);

let expiredIdentityLookups = 0;
const expiredShared = createSharedInvitationStore({ generation: "48" });
const expiredInvitationBroker = createInvitationBroker({
  shared: expiredShared,
  identityClient: {
    async lookupByEmail() {
      expiredIdentityLookups += 1;
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      throw new Error("Eine abgelaufene Einladung darf keinen OOB-Code prägen.");
    }
  },
  now: () => Date.parse(TEST_EXPIRES_AT)
});
await assert.rejects(
  () => expiredInvitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.67"
  }),
  PasswordInvitationInvalidError
);
assert.equal(expiredIdentityLookups, 0);
assert.equal(expiredShared.calls.some((call) => call.method === "patch"), false);

const wrongIdentityShared = createSharedInvitationStore({ generation: "49" });
const wrongIdentityInvitationBroker = createInvitationBroker({
  shared: wrongIdentityShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser({ localId: "different-password-user" });
    },
    async generatePasswordResetActionUrl() {
      throw new Error("Ein UID-Mismatch darf keinen OOB-Code prägen.");
    }
  }
});
await assert.rejects(
  () => wrongIdentityInvitationBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.68"
  }),
  PasswordInvitationInvalidError
);
assert.equal(wrongIdentityShared.calls.some((call) => call.method === "patch"), false);

const finalizeShared = createSharedInvitationStore({ generation: "50" });
let currentPasswordUpdatedAt = TEST_PASSWORD_UPDATED_AT;
let finalizeMintCalls = 0;
let finalizeLookupCalls = 0;
const finalizeBroker = createInvitationBroker({
  shared: finalizeShared,
  identityClient: {
    async lookupByEmail() {
      finalizeLookupCalls += 1;
      return explicitPasswordUser({ passwordUpdatedAt: currentPasswordUpdatedAt });
    },
    async generatePasswordResetActionUrl() {
      finalizeMintCalls += 1;
      return TEST_ACTION_URL;
    }
  }
});
assert.deepEqual(
  await finalizeBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.69"
  }),
  { redeemed: true, actionUrl: TEST_ACTION_URL }
);
assert.deepEqual(
  await finalizeBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    finalize: true,
    clientIp: "198.51.100.69"
  }),
  { finalized: false },
  "Ohne erhöhtes passwordUpdatedAt darf die Einladung nicht als verbraucht markiert werden."
);
currentPasswordUpdatedAt = TEST_PASSWORD_UPDATED_AFTER;
assert.deepEqual(
  await finalizeBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    finalize: true,
    clientIp: "198.51.100.69"
  }),
  { finalized: true }
);
assert.equal(finalizeShared.snapshot().metadata.vk_state, "consumed");
assert.equal(finalizeShared.snapshot().metadata.vk_action, undefined);
assert.deepEqual(
  await finalizeBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    finalize: true,
    clientIp: "198.51.100.69"
  }),
  { finalized: true },
  "Finalize muss nach einem erfolgreichen Readback idempotent bleiben."
);
assert.deepEqual(
  await finalizeBroker.request({
    invitationToken: TEST_INVITATION_TOKEN,
    clientIp: "198.51.100.69"
  }),
  { redeemed: true, completed: true }
);
assert.equal(finalizeMintCalls, 1);
assert.equal(
  finalizeLookupCalls,
  3,
  "Ein terminal verbrauchter Wrapper muss ohne weiteren Identity-Readback idempotent antworten."
);

const invitationDelayCalls = [];
const durationShared = createSharedInvitationStore({ generation: "51" });
const durationInvitationBroker = createInvitationBroker({
  shared: durationShared,
  identityClient: {
    async lookupByEmail() {
      return explicitPasswordUser();
    },
    async generatePasswordResetActionUrl() {
      return TEST_ACTION_URL;
    }
  },
  delay: async (milliseconds) => invitationDelayCalls.push(milliseconds),
  minimumResponseMs: 750
});
await assert.rejects(
  () => durationInvitationBroker.request({
    invitationToken: "invalid",
    clientIp: "198.51.100.70"
  }),
  PasswordInvitationInvalidError
);
await durationInvitationBroker.request({
  invitationToken: TEST_INVITATION_TOKEN,
  clientIp: "198.51.100.71"
});
assert.deepEqual(
  invitationDelayCalls,
  [750, 750],
  "Ungültige und gültige Einladungen müssen dieselbe Mindestdauer erhalten."
);

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
    if (request.finalize) return { finalized: true };
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

  const finalized = await httpRequest(port, {
    headers: browserHeaders,
    body: JSON.stringify({ invitationToken: TEST_INVITATION_TOKEN, finalize: true })
  });
  assert.equal(finalized.status, 200);
  assert.deepEqual(finalized.json, { finalized: true });
  assert.equal(finalized.headers["cache-control"], "no-store");
  assert.deepEqual(httpBrokerCalls, [
    { email: TEST_EMAIL, clientIp: "127.0.0.1" },
    { invitationToken: TEST_INVITATION_TOKEN, clientIp: "127.0.0.1" },
    { invitationToken: TEST_INVITATION_TOKEN, finalize: true, clientIp: "127.0.0.1" }
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
    ["nicht-string Einladung", JSON.stringify({ invitationToken: 42 })],
    ["Finalize ohne Einladung", JSON.stringify({ finalize: true })],
    ["Finalize false", JSON.stringify({ invitationToken: TEST_INVITATION_TOKEN, finalize: false })],
    ["Finalize als String", JSON.stringify({ invitationToken: TEST_INVITATION_TOKEN, finalize: "true" })]
  ]) {
    const response = await httpRequest(port, { headers: browserHeaders, body });
    assert.equal(response.status, 400, `${label} muss 400 liefern.`);
  }
  assert.equal(httpBrokerCalls.length, 3, "Abgewiesene HTTP-Anfragen dürfen den Broker nicht erreichen.");
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
