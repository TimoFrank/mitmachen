#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  IdentityPlatformOnboardingError,
  createIdentityToolkitAdminClient
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  EXPECTED_ENVIRONMENT,
  GOOGLE_IMPORT_OPERATION,
  GOOGLE_PROVIDER_ID,
  buildGoogleUserImportRecord,
  executeGoogleUserImport,
  googleUserImportFingerprint,
  inspectGoogleUserImportState,
  loadProtectedGoogleUserImportDocument,
  parseGoogleUserImportArguments,
  validateGoogleUserImportConfirmations,
  validateGoogleUserImportDocument
} from "./provision_pre_gematik_identity_platform_google_user.mjs";

const projectRoot = new URL("../", import.meta.url);
const operatorSource = await fs.readFile(
  new URL("scripts/provision_pre_gematik_identity_platform_google_user.mjs", projectRoot),
  "utf8"
);
const adminClientSource = await fs.readFile(
  new URL("scripts/provision_pre_gematik_identity_platform_account.mjs", projectRoot),
  "utf8"
);
const packageJson = JSON.parse(await fs.readFile(new URL("package.json", projectRoot), "utf8"));

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) => error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) => error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

const documentValue = {
  project_id: "pilot-project-123",
  local_id: "google_user_001",
  email: "google.user@example.invalid",
  display_name: "Google Pilot User",
  google_provider_uid: "109876543210987654321",
  email_ownership_verified: true
};
const document = validateGoogleUserImportDocument(documentValue);
const fingerprint = googleUserImportFingerprint(document);

assert.deepEqual(document, documentValue);
assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  fingerprint,
  googleUserImportFingerprint(validateGoogleUserImportDocument({
    email_ownership_verified: true,
    google_provider_uid: documentValue.google_provider_uid,
    display_name: documentValue.display_name,
    email: documentValue.email,
    local_id: documentValue.local_id,
    project_id: documentValue.project_id
  }))
);
for (const [patch, pattern] of [
  [{ email_ownership_verified: false }, /Inhaberschaft/u],
  [{ email: "Google.User@example.invalid" }, /kleingeschrieben/u],
  [{ google_provider_uid: "not-a-google-subject" }, /google_provider_uid/u],
  [{ local_id: "short" }, /local_id/u]
]) {
  safeFailure(
    () => validateGoogleUserImportDocument({ ...documentValue, ...patch }),
    pattern
  );
}
for (const forbiddenField of ["version", "password", "provider_id", "tenant_id"]) {
  safeFailure(
    () => validateGoogleUserImportDocument({
      ...documentValue,
      [forbiddenField]: forbiddenField === "password" ? "must-never-exist" : 1
    }),
    /nicht freigegebene Felder/u
  );
}

const previewOptions = parseGoogleUserImportArguments([
  "--input", "/protected/google-user.json"
]);
assert.equal(previewOptions.apply, false);
safeFailure(
  () => parseGoogleUserImportArguments(["--input", "/protected/google-user.json", "--unknown"]),
  /Unbekannte/u
);
safeFailure(
  () => parseGoogleUserImportArguments([
    "--input", "/protected/google-user.json",
    "--input", "/protected/other-google-user.json"
  ]),
  /nicht mehrfach/u
);

function applyOptions(currentStateFingerprint, overrides = {}) {
  return Object.freeze({
    ...parseGoogleUserImportArguments([
      "--input", "/protected/google-user.json",
      "--apply",
      "--confirm-environment", EXPECTED_ENVIRONMENT,
      "--confirm-project", document.project_id,
      "--confirm-operation", GOOGLE_IMPORT_OPERATION,
      "--confirm-fingerprint", fingerprint,
      "--confirm-current-state-fingerprint", currentStateFingerprint
    ]),
    ...overrides
  });
}

safeFailure(
  () => validateGoogleUserImportConfirmations(
    parseGoogleUserImportArguments([
      "--input", "/protected/google-user.json",
      "--confirm-project", document.project_id
    ]),
    document,
    fingerprint,
    `sha256:${"1".repeat(64)}`
  ),
  /nur zusammen mit --apply/u
);
safeFailure(
  () => validateGoogleUserImportConfirmations(
    applyOptions(`sha256:${"1".repeat(64)}`, {
      confirmFingerprint: `sha256:${"0".repeat(64)}`
    }),
    document,
    fingerprint,
    `sha256:${"1".repeat(64)}`
  ),
  /Apply-Bestaetigungen/u
);

function exactUser(overrides = {}) {
  const provider = {
    providerId: GOOGLE_PROVIDER_ID,
    rawId: document.google_provider_uid,
    federatedId: "",
    email: document.email,
    displayName: document.display_name,
    ...(overrides.provider || {})
  };
  const user = {
    uid: document.local_id,
    email: document.email,
    emailVerified: true,
    disabled: false,
    displayName: document.display_name,
    providerIds: [GOOGLE_PROVIDER_ID],
    providers: [provider],
    hasPasswordCredential: false,
    phoneNumber: "",
    emailLinkSignin: false,
    customAuth: false,
    hasCustomAttributes: false,
    hasMfaEnrollment: false,
    tenantId: "",
    initialEmail: "",
    ...overrides
  };
  if (Object.hasOwn(overrides, "provider")) delete user.provider;
  return Object.freeze(user);
}

class MockGoogleImportAuth {
  constructor(readbacks = {}) {
    this.readbacks = {
      byLocalId: readbacks.byLocalId ?? null,
      byEmail: readbacks.byEmail ?? null,
      byProviderUid: readbacks.byProviderUid ?? null
    };
    this.lookupCalls = [];
    this.importCalls = [];
    this.importFailure = null;
    this.commitAsPartial = false;
  }

  notFound() {
    return Object.assign(new Error("sensitive lookup detail"), {
      code: "auth/user-not-found"
    });
  }

  async getUser(localId) {
    this.lookupCalls.push({ method: "localId", value: localId });
    if (!this.readbacks.byLocalId) throw this.notFound();
    return this.readbacks.byLocalId;
  }

  async getUserByEmail(email) {
    this.lookupCalls.push({ method: "email", value: email });
    if (!this.readbacks.byEmail) throw this.notFound();
    return this.readbacks.byEmail;
  }

  async getUserByProviderUid(providerId, rawId) {
    this.lookupCalls.push({ method: "provider", providerId, rawId });
    if (!this.readbacks.byProviderUid) throw this.notFound();
    return this.readbacks.byProviderUid;
  }

  async importGoogleUserCreateOnly(record) {
    this.importCalls.push(structuredClone(record));
    if (this.importFailure) throw this.importFailure;
    const created = exactUser();
    this.readbacks.byLocalId = created;
    this.readbacks.byEmail = this.commitAsPartial ? null : created;
    this.readbacks.byProviderUid = this.commitAsPartial ? null : created;
    return Object.freeze({ successCount: 1, failureCount: 0 });
  }
}

const emptyAuth = new MockGoogleImportAuth();
const emptyState = await inspectGoogleUserImportState(emptyAuth, document);
assert.equal(emptyState.targetState, "absent");
assert.match(emptyState.currentStateFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.deepEqual(
  emptyAuth.lookupCalls.map((call) => call.method).sort(),
  ["email", "localId", "provider"]
);

validateGoogleUserImportConfirmations(
  previewOptions,
  document,
  fingerprint,
  emptyState.currentStateFingerprint
);
const previewLogs = [];
const previewResult = await executeGoogleUserImport({
  auth: emptyAuth,
  document,
  fingerprint,
  options: previewOptions,
  log: (value) => previewLogs.push(value)
});
assert.deepEqual(previewResult, {
  applied: false,
  imported: false,
  noOp: false,
  targetState: "absent",
  currentStateFingerprint: emptyState.currentStateFingerprint
});
assert.equal(emptyAuth.importCalls.length, 0);
assert.match(previewLogs[0], /mode=PREVIEW/u);
assert.match(previewLogs[0], /target_state=absent/u);
await safeRejection(
  () => inspectGoogleUserImportState({
    getUser: async () => null,
    getUserByEmail: async () => null,
    getUserByProviderUid: async () => null
  }, document),
  /nicht sicher gelesen/u
);
await safeRejection(
  () => executeGoogleUserImport({
    auth: emptyAuth,
    document,
    fingerprint: `sha256:${"0".repeat(64)}`,
    options: previewOptions,
    log: () => {}
  }),
  /Fingerprint/u
);

const applyAuth = new MockGoogleImportAuth();
const applyState = await inspectGoogleUserImportState(applyAuth, document);
applyAuth.lookupCalls.length = 0;
const applyLogs = [];
const applyResult = await executeGoogleUserImport({
  auth: applyAuth,
  document,
  fingerprint,
  options: applyOptions(applyState.currentStateFingerprint),
  log: (value) => applyLogs.push(value)
});
assert.equal(applyResult.applied, true);
assert.equal(applyResult.imported, true);
assert.equal(applyResult.noOp, false);
assert.equal(applyResult.targetState, "exact-existing");
assert.equal(applyAuth.importCalls.length, 1);
assert.deepEqual(applyAuth.importCalls[0], {
  localId: document.local_id,
  email: document.email,
  emailVerified: true,
  displayName: document.display_name,
  disabled: false,
  providerUserInfo: [{
    providerId: GOOGLE_PROVIDER_ID,
    rawId: document.google_provider_uid,
    email: document.email,
    displayName: document.display_name
  }]
});
for (const forbidden of [
  "password",
  "passwordHash",
  "passwordSalt",
  "phoneNumber",
  "tenantId",
  "customAttributes"
]) {
  assert.equal(Object.hasOwn(applyAuth.importCalls[0], forbidden), false);
}
assert.deepEqual(
  applyAuth.lookupCalls.reduce((counts, call) => ({
    ...counts,
    [call.method]: (counts[call.method] || 0) + 1
  }), {}),
  { localId: 2, email: 2, provider: 2 }
);
assert.match(applyLogs[0], /mode=APPLY/u);
assert.match(applyLogs[0], /import_performed=true/u);

const exactState = await inspectGoogleUserImportState(applyAuth, document);
assert.equal(exactState.targetState, "exact-existing");
const rerunLogs = [];
const rerun = await executeGoogleUserImport({
  auth: applyAuth,
  document,
  fingerprint,
  options: applyOptions(exactState.currentStateFingerprint),
  log: (value) => rerunLogs.push(value)
});
assert.equal(rerun.noOp, true);
assert.equal(rerun.imported, false);
assert.equal(applyAuth.importCalls.length, 1);
assert.match(rerunLogs[0], /target_state=exact-existing/u);
assert.match(rerunLogs[0], /import_performed=false/u);

for (const readbacks of [
  { byLocalId: exactUser() },
  { byEmail: exactUser() },
  { byProviderUid: exactUser() },
  {
    byLocalId: exactUser(),
    byEmail: exactUser({ uid: "different_google_user" }),
    byProviderUid: exactUser()
  },
  {
    byLocalId: exactUser(),
    byEmail: exactUser(),
    byProviderUid: exactUser({ provider: { rawId: "100000000000000000000" } })
  },
  {
    byLocalId: exactUser({ hasPasswordCredential: true, providerIds: ["google.com", "password"] }),
    byEmail: exactUser({ hasPasswordCredential: true, providerIds: ["google.com", "password"] }),
    byProviderUid: exactUser({
      hasPasswordCredential: true,
      providerIds: ["google.com", "password"]
    })
  },
  {
    byLocalId: exactUser({ emailVerified: false }),
    byEmail: exactUser({ emailVerified: false }),
    byProviderUid: exactUser({ emailVerified: false })
  },
  {
    byLocalId: exactUser({ email: "Google.User@example.invalid" }),
    byEmail: exactUser({ email: "Google.User@example.invalid" }),
    byProviderUid: exactUser({ email: "Google.User@example.invalid" })
  },
  {
    byLocalId: exactUser({ hasCustomAttributes: true }),
    byEmail: exactUser({ hasCustomAttributes: true }),
    byProviderUid: exactUser({ hasCustomAttributes: true })
  },
  {
    byLocalId: exactUser({ hasMfaEnrollment: true }),
    byEmail: exactUser({ hasMfaEnrollment: true }),
    byProviderUid: exactUser({ hasMfaEnrollment: true })
  },
  {
    byLocalId: exactUser({ provider: { phoneNumber: "+49123456789" } }),
    byEmail: exactUser({ provider: { phoneNumber: "+49123456789" } }),
    byProviderUid: exactUser({ provider: { phoneNumber: "+49123456789" } })
  },
  {
    byLocalId: exactUser({ initialEmail: "previous@example.invalid" }),
    byEmail: exactUser({ initialEmail: "previous@example.invalid" }),
    byProviderUid: exactUser({ initialEmail: "previous@example.invalid" })
  },
  {
    byLocalId: exactUser({ provider: { federatedId: "different-google-subject" } }),
    byEmail: exactUser({ provider: { federatedId: "different-google-subject" } }),
    byProviderUid: exactUser({ provider: { federatedId: "different-google-subject" } })
  }
]) {
  const collisionAuth = new MockGoogleImportAuth(readbacks);
  await safeRejection(
    () => inspectGoogleUserImportState(collisionAuth, document),
    /kollidieren oder bilden einen Teilzustand/u
  );
  assert.equal(collisionAuth.importCalls.length, 0);
}

const staleAuth = new MockGoogleImportAuth();
const staleState = await inspectGoogleUserImportState(staleAuth, document);
await safeRejection(
  () => executeGoogleUserImport({
    auth: staleAuth,
    document,
    fingerprint,
    options: applyOptions(staleState.currentStateFingerprint, {
      confirmCurrentStateFingerprint: `sha256:${"f".repeat(64)}`
    }),
    log: () => {}
  }),
  /Apply-Bestaetigungen/u
);
assert.equal(staleAuth.importCalls.length, 0);

const rejectedImportAuth = new MockGoogleImportAuth();
rejectedImportAuth.importFailure = Object.assign(
  new Error(`raw duplicate detail for ${document.email}`),
  { code: "auth/import-user-error" }
);
const rejectedState = await inspectGoogleUserImportState(rejectedImportAuth, document);
await assert.rejects(
  () => executeGoogleUserImport({
    auth: rejectedImportAuth,
    document,
    fingerprint,
    options: applyOptions(rejectedState.currentStateFingerprint),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof IdentityPlatformOnboardingError);
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /moeglicherweise committed/u);
    assert.ok(!error.message.includes(document.email));
    assert.ok(!error.message.includes(document.local_id));
    assert.ok(!error.message.includes(document.google_provider_uid));
    assert.ok(!error.message.includes("raw duplicate detail"));
    return true;
  }
);

const partialCommitAuth = new MockGoogleImportAuth();
partialCommitAuth.commitAsPartial = true;
const partialCommitState = await inspectGoogleUserImportState(partialCommitAuth, document);
await assert.rejects(
  () => executeGoogleUserImport({
    auth: partialCommitAuth,
    document,
    fingerprint,
    options: applyOptions(partialCommitState.currentStateFingerprint),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof IdentityPlatformOnboardingError);
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /Readback/u);
    assert.ok(!error.message.includes(document.email));
    return true;
  }
);

const adminApiKey = `AIza${"A".repeat(35)}`;
const adminAccessToken = `ya29.${"a".repeat(64)}`;
const adminRequests = [];
const adminUsers = new Map();
let adminImportErrors = [];
const adminFetch = async (url, options) => {
  const pathname = new URL(url).pathname;
  const body = JSON.parse(options.body);
  adminRequests.push({
    pathname,
    body: structuredClone(body),
    headers: { ...options.headers },
    method: options.method,
    url
  });
  const response = (status, value) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(value)
  });
  if (pathname.endsWith("/accounts:lookup")) {
    let user;
    if (body.localId) {
      user = adminUsers.get(body.localId[0]);
    } else if (body.email) {
      user = [...adminUsers.values()].find(
        (candidate) => candidate.email === body.email[0]
      );
    } else if (body.federatedUserId) {
      const requested = body.federatedUserId[0];
      user = [...adminUsers.values()].find((candidate) => (
        candidate.providerUserInfo.some((provider) => (
          provider.providerId === requested.providerId
          && provider.rawId === requested.rawId
        ))
      ));
    }
    return response(200, user ? { users: [user] } : {});
  }
  if (pathname.endsWith("/accounts:batchCreate")) {
    if (adminImportErrors.length > 0) {
      return response(200, { error: structuredClone(adminImportErrors) });
    }
    const imported = body.users[0];
    adminUsers.set(imported.localId, {
      ...imported,
      providerUserInfo: imported.providerUserInfo.map((provider) => ({ ...provider }))
    });
    return response(200, {});
  }
  return response(404, { error: { message: "NOT_FOUND" } });
};

const adminClient = createIdentityToolkitAdminClient({
  projectId: document.project_id,
  apiKey: adminApiKey,
  accessToken: adminAccessToken,
  fetchImpl: adminFetch
});
await assert.rejects(
  adminClient.getUserByProviderUid(GOOGLE_PROVIDER_ID, document.google_provider_uid),
  (error) => error?.code === "auth/user-not-found"
);
const record = buildGoogleUserImportRecord(document);
const requestsBeforeInvalidRecords = adminRequests.length;
for (const invalidRecord of [
  { ...record, passwordHash: "must-never-pass" },
  { ...record, tenantId: "forbidden-tenant" },
  {
    ...record,
    providerUserInfo: [{
      ...record.providerUserInfo[0],
      providerId: "github.com"
    }]
  },
  {
    ...record,
    providerUserInfo: [
      record.providerUserInfo[0],
      {
        ...record.providerUserInfo[0],
        rawId: "100000000000000000000"
      }
    ]
  }
]) {
  await assert.rejects(
    adminClient.importGoogleUserCreateOnly(invalidRecord),
    (error) => error instanceof IdentityPlatformOnboardingError
  );
}
assert.equal(adminRequests.length, requestsBeforeInvalidRecords);
assert.deepEqual(
  await adminClient.importGoogleUserCreateOnly(record),
  { successCount: 1, failureCount: 0 }
);
const [byLocalId, byEmail, byProviderUid] = await Promise.all([
  adminClient.getUser(document.local_id),
  adminClient.getUserByEmail(document.email),
  adminClient.getUserByProviderUid(GOOGLE_PROVIDER_ID, document.google_provider_uid)
]);
assert.equal(byLocalId.uid, document.local_id);
assert.equal(byEmail.uid, document.local_id);
assert.equal(byProviderUid.uid, document.local_id);
assert.deepEqual(byProviderUid.providerIds, [GOOGLE_PROVIDER_ID]);
assert.equal(byProviderUid.hasPasswordCredential, false);
assert.equal(byProviderUid.hasCustomAttributes, false);
assert.equal(byProviderUid.hasMfaEnrollment, false);

const storedAdminUser = adminUsers.get(document.local_id);
storedAdminUser.customAttributes = "{\"forbidden\":true}";
storedAdminUser.mfaInfo = [{ mfaEnrollmentId: "forbidden-enrollment" }];
const extendedAdminUser = await adminClient.getUser(document.local_id);
assert.equal(extendedAdminUser.hasCustomAttributes, true);
assert.equal(extendedAdminUser.hasMfaEnrollment, true);
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
delete storedAdminUser.customAttributes;
delete storedAdminUser.mfaInfo;

storedAdminUser.providerUserInfo[0].phoneNumber = "+49123456789";
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
delete storedAdminUser.providerUserInfo[0].phoneNumber;

storedAdminUser.rawPassword = "must-never-be-accepted";
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
delete storedAdminUser.rawPassword;

storedAdminUser.passwordSalt = "must-never-be-accepted";
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
delete storedAdminUser.passwordSalt;

storedAdminUser.initialEmail = "previous@example.invalid";
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
delete storedAdminUser.initialEmail;

storedAdminUser.providerUserInfo[0].federatedId = "different-google-subject";
await safeRejection(
  () => inspectGoogleUserImportState(adminClient, document),
  /kollidieren oder bilden einen Teilzustand/u
);
storedAdminUser.providerUserInfo[0].federatedId =
  `https://accounts.google.com/${document.google_provider_uid}`;
assert.equal(
  (await inspectGoogleUserImportState(adminClient, document)).targetState,
  "exact-existing"
);
delete storedAdminUser.providerUserInfo[0].federatedId;

const batchRequest = adminRequests.find(
  (request) => request.pathname.endsWith("/accounts:batchCreate")
);
assert.deepEqual(Object.keys(batchRequest.body).sort(), [
  "allowOverwrite",
  "sanityCheck",
  "users"
]);
assert.equal(batchRequest.body.sanityCheck, true);
assert.equal(batchRequest.body.allowOverwrite, false);
assert.equal(batchRequest.body.users.length, 1);
assert.deepEqual(batchRequest.body.users[0], record);
assert.ok(adminRequests.every((request) => request.method === "POST"));
assert.ok(adminRequests.every(
  (request) => request.headers.authorization === `Bearer ${adminAccessToken}`
));
assert.ok(adminRequests.every(
  (request) => new URL(request.url).searchParams.get("key") === adminApiKey
));
assert.ok(adminRequests.some((request) => (
  request.pathname.endsWith("/accounts:lookup")
  && request.body.localId?.[0] === document.local_id
)));
assert.ok(adminRequests.some((request) => (
  request.pathname.endsWith("/accounts:lookup")
  && request.body.email?.[0] === document.email
)));
assert.ok(adminRequests.some((request) => (
  request.pathname.endsWith("/accounts:lookup")
  && request.body.federatedUserId?.[0]?.providerId === GOOGLE_PROVIDER_ID
  && request.body.federatedUserId?.[0]?.rawId === document.google_provider_uid
)));

adminImportErrors = [{
  index: 0,
  message: `sensitive duplicate detail ${document.email}`
}];
await assert.rejects(
  adminClient.importGoogleUserCreateOnly(record),
  (error) => (
    error?.code === "auth/import-user-error"
    && !error.message.includes(document.email)
    && !error.message.includes("sensitive duplicate detail")
  )
);

const ambiguousClient = createIdentityToolkitAdminClient({
  projectId: document.project_id,
  apiKey: adminApiKey,
  accessToken: adminAccessToken,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ users: [{ localId: "one" }, { localId: "two" }] })
  })
});
await assert.rejects(
  ambiguousClient.getUser(document.local_id),
  (error) => error?.code === "auth/internal-error"
);

const malformedLookupClient = createIdentityToolkitAdminClient({
  projectId: document.project_id,
  apiKey: adminApiKey,
  accessToken: adminAccessToken,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ users: { localId: document.local_id } })
  })
});
await assert.rejects(
  malformedLookupClient.getUser(document.local_id),
  (error) => error?.code === "auth/internal-error"
);

const malformedUserClient = createIdentityToolkitAdminClient({
  projectId: document.project_id,
  apiKey: adminApiKey,
  accessToken: adminAccessToken,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({
      users: [{
        localId: document.local_id,
        email: document.email,
        emailVerified: true,
        disabled: "false",
        providerUserInfo: []
      }]
    })
  })
});
await assert.rejects(
  malformedUserClient.getUser(document.local_id),
  (error) => error?.code === "auth/internal-error"
);

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vk-google-import-"));
const repository = path.join(temporaryRoot, "repo");
const protectedDirectory = path.join(temporaryRoot, "protected");
await fs.mkdir(repository, { mode: 0o700 });
await fs.mkdir(protectedDirectory, { mode: 0o700 });
await fs.chmod(protectedDirectory, 0o700);
const inputPath = path.join(protectedDirectory, "google-user.json");
await fs.writeFile(inputPath, `${JSON.stringify(documentValue)}\n`, { mode: 0o600 });
await fs.chmod(inputPath, 0o600);
assert.deepEqual(
  await loadProtectedGoogleUserImportDocument(inputPath, { repository }),
  document
);

const inputInsideRepository = path.join(repository, "google-user.json");
await fs.writeFile(inputInsideRepository, `${JSON.stringify(documentValue)}\n`, {
  mode: 0o600
});
await safeRejection(
  () => loadProtectedGoogleUserImportDocument(inputInsideRepository, { repository }),
  /ausserhalb des Git-Worktrees/u
);
if (process.platform !== "win32") {
  const openInputPath = path.join(protectedDirectory, "open-google-user.json");
  await fs.writeFile(openInputPath, `${JSON.stringify(documentValue)}\n`, { mode: 0o644 });
  await fs.chmod(openInputPath, 0o644);
  await safeRejection(
    () => loadProtectedGoogleUserImportDocument(openInputPath, { repository }),
    /owner-only/u
  );
}

for (const logValue of [...previewLogs, ...applyLogs, ...rerunLogs]) {
  assert.match(
    logValue,
    /^mode=(?:PREVIEW|APPLY) operation=google-user-import-create-only target_state=(?:absent|exact-existing) import_performed=(?:true|false) account_count=1 input_fingerprint=sha256:[a-f0-9]{64} current_state_fingerprint=sha256:[a-f0-9]{64}$/u
  );
  for (const forbidden of [
    document.email,
    document.local_id,
    document.display_name,
    document.google_provider_uid,
    adminApiKey,
    adminAccessToken
  ]) {
    assert.ok(!logValue.includes(forbidden), "Operator-Logs enthalten geschuetzte Daten.");
  }
}

assert.match(operatorSource, /getUserByProviderUid/u);
assert.match(operatorSource, /importGoogleUserCreateOnly/u);
assert.match(operatorSource, /providerId:\s*GOOGLE_PROVIDER_ID/u);
assert.doesNotMatch(operatorSource, /\bpassword(?:Hash|Salt)?\s*:/u);
assert.match(adminClientSource, /sanityCheck:\s*true/u);
assert.match(adminClientSource, /allowOverwrite:\s*false/u);
assert.match(adminClientSource, /federatedUserId:\s*\[\{ providerId, rawId \}\]/u);
assert.equal(
  packageJson.scripts["provision:pre-gematik-identity-platform-google-user"],
  "node scripts/provision_pre_gematik_identity_platform_google_user.mjs"
);
assert.equal(
  packageJson.scripts["test:pre-gematik-identity-platform-google-user-import"],
  "node scripts/test_pre_gematik_identity_platform_google_user_import.mjs"
);

await fs.rm(temporaryRoot, { recursive: true, force: true });

console.log(
  "Identity Platform Google Import OK: create-only, passwordlos, drei getrennte "
  + "Readbacks, exakter No-op-Rerun und fail-closed Kollisionen."
);
