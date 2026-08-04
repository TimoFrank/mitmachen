#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CREATE_OPERATION,
  EXPECTED_CONTINUE_URL,
  EXPECTED_ENVIRONMENT,
  IdentityPlatformOnboardingError,
  RECOVER_LINK_OPERATION,
  createIdentityToolkitAdminClient,
  executeIdentityPlatformAccountOnboarding,
  generateUnsharedBootstrapPassword,
  identityPlatformAccountFingerprint,
  loadProtectedIdentityPlatformAccountDocument,
  parseIdentityPlatformAccountArguments,
  validateIdentityPlatformAccountConfirmations,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";

const projectRoot = new URL("../", import.meta.url);
const operatorSource = await fs.readFile(
  new URL("scripts/provision_pre_gematik_identity_platform_account.mjs", projectRoot),
  "utf8"
);
const identityPlatformTerraform = await fs.readFile(
  new URL("deploy/terraform/gcp-autopilot/identity-platform.tf", projectRoot),
  "utf8"
);
const pilotRunbook = await fs.readFile(
  new URL(
    "dokumentation/betrieb-und-deployment/PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md",
    projectRoot
  ),
  "utf8"
);

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) => error instanceof IdentityPlatformOnboardingError && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) => error instanceof IdentityPlatformOnboardingError && pattern.test(error.message)
  );
}

const documentValue = {
  version: 1,
  project_id: "pilot-project-123",
  uid: "pilot_account_001",
  email: "pilot.user@example.invalid",
  display_name: "Pilot User",
  email_ownership_verified: true,
  continue_url: EXPECTED_CONTINUE_URL
};
const document = validateIdentityPlatformAccountDocument(documentValue);
const fingerprint = identityPlatformAccountFingerprint(document);

assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  fingerprint,
  identityPlatformAccountFingerprint(validateIdentityPlatformAccountDocument({
    continue_url: documentValue.continue_url,
    email_ownership_verified: true,
    display_name: documentValue.display_name,
    email: documentValue.email,
    uid: documentValue.uid,
    project_id: documentValue.project_id,
    version: 1
  }))
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    email_ownership_verified: false
  }),
  /Inhaberschaft/u
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    email: "Pilot.User@example.invalid"
  }),
  /kleingeschrieben/u
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    email: `${"a".repeat(245)}@example.invalid`
  }),
  /ungueltig/u
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    password: "must-never-be-an-input"
  }),
  /nicht freigegebene Felder/u
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    continue_url: `${EXPECTED_CONTINUE_URL}?token=not-allowed`
  }),
  /ohne Zugangsdaten, Query oder Fragment/u
);
safeFailure(
  () => validateIdentityPlatformAccountDocument({
    ...documentValue,
    continue_url: "https://versorgungs-kompass.de/"
  }),
  /exakt https:\/\/versorgungs-kompass\.de\/start/u
);

const previewOptions = parseIdentityPlatformAccountArguments([
  "--input", "/protected/account.json"
]);
assert.equal(previewOptions.apply, false);
assert.equal(previewOptions.recoverLinkOnly, false);
validateIdentityPlatformAccountConfirmations(previewOptions, document, fingerprint);

const recoveryPreviewOptions = parseIdentityPlatformAccountArguments([
  "--input", "/protected/account.json",
  "--recover-link-only"
]);
assert.equal(recoveryPreviewOptions.recoverLinkOnly, true);
safeFailure(
  () => validateIdentityPlatformAccountConfirmations(
    parseIdentityPlatformAccountArguments([
      "--input", "/protected/account.json",
      "--output", "/protected/link.txt"
    ]),
    document,
    fingerprint
  ),
  /nur zusammen mit --apply/u
);

function applyOptions(output, { recoverLinkOnly = false } = {}) {
  return parseIdentityPlatformAccountArguments([
    "--input", "/protected/account.json",
    "--output", output,
    "--apply",
    ...(recoverLinkOnly ? ["--recover-link-only"] : []),
    "--confirm-environment", EXPECTED_ENVIRONMENT,
    "--confirm-project", document.project_id,
    "--confirm-operation", recoverLinkOnly ? RECOVER_LINK_OPERATION : CREATE_OPERATION,
    "--confirm-fingerprint", fingerprint
  ]);
}

safeFailure(
  () => validateIdentityPlatformAccountConfirmations(
    parseIdentityPlatformAccountArguments([
      "--input", "/protected/account.json",
      "--output", "/protected/link.txt",
      "--apply",
      "--confirm-environment", EXPECTED_ENVIRONMENT,
      "--confirm-project", document.project_id,
      "--confirm-operation", CREATE_OPERATION,
      "--confirm-fingerprint", `sha256:${"0".repeat(64)}`
    ]),
    document,
    fingerprint
  ),
  /Apply-Bestaetigungen/u
);

const fixedBootstrap = generateUnsharedBootstrapPassword(
  () => Buffer.alloc(36, 0x41)
);
assert.ok(fixedBootstrap.length >= 20);
assert.match(fixedBootstrap, /[a-z]/u);
assert.match(fixedBootstrap, /[A-Z]/u);
assert.match(fixedBootstrap, /[0-9]/u);
assert.match(fixedBootstrap, /[^A-Za-z0-9]/u);

const adminApiKey = `AIza${"A".repeat(35)}`;
const generatedActionApiKey = `AIza${"B".repeat(35)}`;
const adminAccessToken = `ya29.${"a".repeat(64)}`;
const adminRequests = [];
const adminUsers = new Map();
const adminFetch = async (url, options) => {
  adminRequests.push({ url, options: { ...options, headers: { ...options.headers } } });
  const pathname = new URL(url).pathname;
  const body = JSON.parse(options.body);
  const response = (status, value) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(value)
  });

  if (pathname.endsWith("/accounts:lookup")) {
    const uid = body.localId?.[0];
    const email = body.email?.[0];
    const user = uid
      ? adminUsers.get(uid)
      : [...adminUsers.values()].find((candidate) => candidate.email === email);
    return response(200, user ? { users: [user] } : {});
  }
  if (pathname.endsWith("/accounts")) {
    const user = {
      localId: body.localId,
      email: body.email,
      emailVerified: body.emailVerified,
      disabled: body.disabled,
      displayName: body.displayName
    };
    adminUsers.set(user.localId, user);
    return response(200, { localId: user.localId, email: user.email });
  }
  if (pathname.endsWith("/accounts:sendOobCode")) {
    return response(200, {
      oobLink: "https://pilot-project-123.firebaseapp.com/__/auth/action"
        + `?mode=resetPassword&oobCode=rest-one-time-secret-code&apiKey=${generatedActionApiKey}`
        + `&continueUrl=${encodeURIComponent(document.continue_url)}`
        + "&lang=en"
    });
  }
  if (pathname === "/v1/accounts:resetPassword") {
    return response(200, {
      email: document.email,
      requestType: "PASSWORD_RESET"
    });
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
  adminClient.getUser(document.uid),
  (error) => error?.code === "auth/user-not-found"
);
const restCreated = await adminClient.createUser({
  uid: document.uid,
  email: document.email,
  emailVerified: true,
  password: fixedBootstrap,
  displayName: document.display_name,
  disabled: false
});
assert.equal(restCreated.uid, document.uid);
assert.equal(restCreated.emailVerified, true);
const restLink = await adminClient.generatePasswordResetLink(document.email, {
  url: document.continue_url,
  handleCodeInApp: false
});
assert.match(restLink, /mode=resetPassword/u);
const restVerification = await adminClient.verifyPasswordResetCode(
  "rest-one-time-secret-code",
  "https://versorgungs-kompass.de/"
);
assert.deepEqual(restVerification, {
  email: document.email,
  requestType: "PASSWORD_RESET"
});
assert.ok(adminRequests.every((request) => request.options.method === "POST"));
const adminAuthorizedRequests = adminRequests.filter(
  (request) => new URL(request.url).pathname !== "/v1/accounts:resetPassword"
);
const browserKeyVerificationRequests = adminRequests.filter(
  (request) => new URL(request.url).pathname === "/v1/accounts:resetPassword"
);
assert.ok(adminAuthorizedRequests.every(
  (request) => request.options.headers.authorization === `Bearer ${adminAccessToken}`
));
assert.equal(browserKeyVerificationRequests.length, 1);
const browserKeyVerificationRequest = browserKeyVerificationRequests[0];
assert.equal(
  new URL(browserKeyVerificationRequest.url).origin,
  "https://identitytoolkit.googleapis.com"
);
assert.equal(browserKeyVerificationRequest.options.redirect, "error");
assert.deepEqual(
  JSON.parse(browserKeyVerificationRequest.options.body),
  { oobCode: "rest-one-time-secret-code" }
);
assert.equal(browserKeyVerificationRequest.options.headers.authorization, undefined);
assert.equal(
  browserKeyVerificationRequest.options.headers["x-goog-user-project"],
  undefined
);
assert.equal(
  browserKeyVerificationRequest.options.headers.referer,
  "https://versorgungs-kompass.de/"
);
assert.ok(adminRequests.every((request) => request.options.signal instanceof AbortSignal));
assert.ok(adminRequests.every((request) => new URL(request.url).searchParams.get("key") === adminApiKey));
assert.ok(adminRequests.some((request) => new URL(request.url).pathname.endsWith("/accounts")));
assert.ok(adminRequests.some(
  (request) => new URL(request.url).pathname.endsWith("/accounts:sendOobCode")
));

class MockIdentityPlatformAuth {
  constructor() {
    this.webApiKey = adminApiKey;
    this.usersByUid = new Map();
    this.usersByEmail = new Map();
    this.createCalls = [];
    this.linkCalls = [];
    this.verifyCalls = [];
    this.failLink = false;
    this.failVerification = false;
    this.verificationResponse = null;
  }

  notFound() {
    return Object.assign(new Error("sensitive user lookup detail"), {
      code: "auth/user-not-found"
    });
  }

  async getUser(uid) {
    const user = this.usersByUid.get(uid);
    if (!user) throw this.notFound();
    return user;
  }

  async getUserByEmail(email) {
    const user = this.usersByEmail.get(email);
    if (!user) throw this.notFound();
    return user;
  }

  async createUser(value) {
    this.createCalls.push({ ...value });
    if (this.usersByUid.has(value.uid)) {
      throw Object.assign(new Error(`sensitive duplicate ${value.email}`), {
        code: "auth/uid-already-exists"
      });
    }
    if (this.usersByEmail.has(value.email)) {
      throw Object.assign(new Error(`sensitive duplicate ${value.email}`), {
        code: "auth/email-already-exists"
      });
    }
    const user = Object.freeze({
      uid: value.uid,
      email: value.email,
      emailVerified: value.emailVerified,
      disabled: value.disabled,
      displayName: value.displayName,
      providerIds: Object.freeze(["password"]),
      providers: Object.freeze([]),
      hasPasswordCredential: true,
      phoneNumber: "",
      emailLinkSignin: false,
      customAuth: false,
      hasCustomAttributes: false,
      hasMfaEnrollment: false,
      tenantId: "",
      initialEmail: ""
    });
    this.usersByUid.set(value.uid, user);
    this.usersByEmail.set(value.email, user);
    return user;
  }

  async generatePasswordResetLink(email, settings) {
    this.linkCalls.push({ email, settings: { ...settings } });
    if (this.failLink) {
      throw new Error(`raw provider failure for ${email}`);
    }
    return "https://pilot-project-123.firebaseapp.com/__/auth/action"
      + `?mode=resetPassword&oobCode=one-time-secret-code&apiKey=${generatedActionApiKey}`
      + `&continueUrl=${encodeURIComponent(document.continue_url)}`
      + "&lang=en";
  }

  async verifyPasswordResetCode(oobCode, referer) {
    this.verifyCalls.push({ oobCode, referer });
    if (this.failVerification) {
      throw new Error("raw reset-code verification failure");
    }
    return this.verificationResponse || {
      email: document.email,
      requestType: "PASSWORD_RESET"
    };
  }
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vk-idp-onboarding-"));
const repository = path.join(temporaryRoot, "repo");
const protectedDirectory = path.join(temporaryRoot, "protected");
await fs.mkdir(repository, { mode: 0o700 });
await fs.mkdir(protectedDirectory, { mode: 0o700 });
await fs.chmod(protectedDirectory, 0o700);

const inputPath = path.join(protectedDirectory, "account.json");
await fs.writeFile(inputPath, `${JSON.stringify(documentValue)}\n`, { mode: 0o600 });
await fs.chmod(inputPath, 0o600);
assert.deepEqual(
  await loadProtectedIdentityPlatformAccountDocument(inputPath, { repository }),
  document
);

const inputInsideRepository = path.join(repository, "account.json");
await fs.writeFile(inputInsideRepository, `${JSON.stringify(documentValue)}\n`, { mode: 0o600 });
await safeRejection(
  () => loadProtectedIdentityPlatformAccountDocument(inputInsideRepository, { repository }),
  /ausserhalb des Git-Worktrees/u
);

const auth = new MockIdentityPlatformAuth();
const previewLogs = [];
const previewResult = await executeIdentityPlatformAccountOnboarding({
  auth,
  document,
  fingerprint,
  options: previewOptions,
  repository,
  log: (value) => previewLogs.push(value)
});
assert.deepEqual(previewResult, {
  applied: false,
  accountCreated: false,
  linkWritten: false
});
assert.equal(auth.createCalls.length, 0);
assert.equal(auth.linkCalls.length, 0);
assert.match(previewLogs[0], /mode=PREVIEW/u);
assert.match(previewLogs[0], /target_state=absent/u);
assert.ok(previewLogs[0].includes(fingerprint));

const outputPath = path.join(protectedDirectory, "set-password-link.txt");
const applyLogs = [];
const applyResult = await executeIdentityPlatformAccountOnboarding({
  auth,
  document,
  fingerprint,
  options: applyOptions(outputPath),
  repository,
  randomBytes: () => Buffer.alloc(36, 0x42),
  log: (value) => applyLogs.push(value)
});
assert.deepEqual(applyResult, {
  applied: true,
  accountCreated: true,
  linkWritten: true
});
assert.equal(auth.createCalls.length, 1);
assert.equal(auth.linkCalls.length, 1);
assert.deepEqual(auth.verifyCalls, [
  {
    oobCode: "one-time-secret-code",
    referer: "https://versorgungs-kompass.de/"
  }
]);
assert.deepEqual(
  {
    uid: auth.createCalls[0].uid,
    email: auth.createCalls[0].email,
    emailVerified: auth.createCalls[0].emailVerified,
    displayName: auth.createCalls[0].displayName,
    disabled: auth.createCalls[0].disabled
  },
  {
    uid: document.uid,
    email: document.email,
    emailVerified: true,
    displayName: document.display_name,
    disabled: false
  }
);
assert.ok(auth.createCalls[0].password.length >= 20);
assert.match(auth.createCalls[0].password, /[a-z]/u);
assert.match(auth.createCalls[0].password, /[A-Z]/u);
assert.match(auth.createCalls[0].password, /[0-9]/u);
assert.match(auth.createCalls[0].password, /[^A-Za-z0-9]/u);
assert.deepEqual(auth.linkCalls[0].settings, {
  url: document.continue_url,
  handleCodeInApp: false
});
const linkFile = await fs.readFile(outputPath, "utf8");
assert.match(linkFile, /mode=resetPassword/u);
assert.match(linkFile, /oobCode=one-time-secret-code/u);
assert.equal(new URL(linkFile.trim()).origin, new URL(document.continue_url).origin);
assert.equal(new URL(linkFile.trim()).pathname, "/konto/passwort-festlegen");
assert.equal(new URL(linkFile.trim()).searchParams.get("apiKey"), adminApiKey);
assert.equal(new URL(linkFile.trim()).searchParams.get("lang"), "de");
assert.doesNotMatch(linkFile, /firebaseapp/u);
if (process.platform !== "win32") {
  assert.equal((await fs.stat(outputPath)).mode & 0o077, 0);
}

const forbiddenLogValues = [
  document.email,
  document.uid,
  document.display_name,
  auth.createCalls[0].password,
  "one-time-secret-code",
  linkFile.trim()
];

await safeRejection(
  () => executeIdentityPlatformAccountOnboarding({
    auth,
    document,
    fingerprint,
    options: applyOptions(path.join(protectedDirectory, "must-not-exist.txt")),
    repository
  }),
  /create-only/u
);
assert.equal(auth.createCalls.length, 1);

const recoveryOutput = path.join(protectedDirectory, "set-password-link-recovery.txt");
const recoveryLogs = [];
const recoveryResult = await executeIdentityPlatformAccountOnboarding({
  auth,
  document,
  fingerprint,
  options: applyOptions(recoveryOutput, { recoverLinkOnly: true }),
  repository,
  log: (value) => recoveryLogs.push(value)
});
assert.deepEqual(recoveryResult, {
  applied: true,
  accountCreated: false,
  linkWritten: true
});
assert.equal(auth.createCalls.length, 1);
assert.equal(auth.linkCalls.length, 2);
assert.equal(auth.verifyCalls.length, 2);
assert.match(recoveryLogs[0], /target_state=exact-existing/u);

const partialAuth = new MockIdentityPlatformAuth();
partialAuth.failLink = true;
const partialOutput = path.join(protectedDirectory, "partial-link.txt");
await assert.rejects(
  () => executeIdentityPlatformAccountOnboarding({
    auth: partialAuth,
    document,
    fingerprint,
    options: applyOptions(partialOutput),
    repository,
    randomBytes: () => Buffer.alloc(36, 0x43),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof IdentityPlatformOnboardingError);
    assert.match(error.message, /Account wurde moeglicherweise create-only angelegt/u);
    assert.ok(!error.message.includes(document.email));
    assert.ok(!error.message.includes("raw provider failure"));
    return true;
  }
);
assert.equal(partialAuth.createCalls.length, 1);
await assert.rejects(fs.stat(partialOutput), (error) => error?.code === "ENOENT");

const uncertainCreateAuth = new MockIdentityPlatformAuth();
uncertainCreateAuth.createUser = async (value) => {
  await MockIdentityPlatformAuth.prototype.createUser.call(uncertainCreateAuth, value);
  throw Object.assign(new Error("response lost after commit"), {
    code: "auth/internal-error"
  });
};
const uncertainOutput = path.join(protectedDirectory, "uncertain-create-link.txt");
await assert.rejects(
  () => executeIdentityPlatformAccountOnboarding({
    auth: uncertainCreateAuth,
    document,
    fingerprint,
    options: applyOptions(uncertainOutput),
    repository,
    randomBytes: () => Buffer.alloc(36, 0x45),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof IdentityPlatformOnboardingError);
    assert.match(error.message, /moeglicherweise create-only angelegt/u);
    assert.ok(!error.message.includes(document.email));
    assert.ok(!error.message.includes("response lost"));
    return true;
  }
);
assert.equal(uncertainCreateAuth.createCalls.length, 1);
assert.equal(uncertainCreateAuth.usersByUid.has(document.uid), true);
await assert.rejects(fs.stat(uncertainOutput), (error) => error?.code === "ENOENT");

partialAuth.failLink = false;
await safeRejection(
  () => executeIdentityPlatformAccountOnboarding({
    auth: partialAuth,
    document,
    fingerprint,
    options: applyOptions(path.join(protectedDirectory, "partial-create-retry.txt")),
    repository,
    log: () => {}
  }),
  /create-only/u
);
assert.equal(partialAuth.createCalls.length, 1);

const partialRecoveryPreviewLogs = [];
const partialRecoveryPreview = await executeIdentityPlatformAccountOnboarding({
  auth: partialAuth,
  document,
  fingerprint,
  options: recoveryPreviewOptions,
  repository,
  log: (value) => partialRecoveryPreviewLogs.push(value)
});
assert.deepEqual(partialRecoveryPreview, {
  applied: false,
  accountCreated: false,
  linkWritten: false
});
assert.match(partialRecoveryPreviewLogs[0], /target_state=exact-existing/u);
assert.equal(partialAuth.linkCalls.length, 1);

const recoveredPartialOutput = path.join(protectedDirectory, "partial-link-recovered.txt");
await executeIdentityPlatformAccountOnboarding({
  auth: partialAuth,
  document,
  fingerprint,
  options: applyOptions(recoveredPartialOutput, { recoverLinkOnly: true }),
  repository,
  log: () => {}
});
assert.equal(partialAuth.createCalls.length, 1);
assert.equal(partialAuth.linkCalls.length, 2);
assert.equal(partialAuth.verifyCalls.length, 1);

const hostileLinkAuth = new MockIdentityPlatformAuth();
await hostileLinkAuth.createUser({
  uid: document.uid,
  email: document.email,
  emailVerified: true,
  password: fixedBootstrap,
  displayName: document.display_name,
  disabled: false
});
hostileLinkAuth.generatePasswordResetLink = async () =>
  `https://attacker.example.invalid/action?mode=resetPassword`
  + `&oobCode=hostile-one-time-secret-code&apiKey=${adminApiKey}`
  + `&continueUrl=${encodeURIComponent(document.continue_url)}`;
const hostileLinkOutput = path.join(protectedDirectory, "hostile-link.txt");
await safeRejection(
  () => executeIdentityPlatformAccountOnboarding({
    auth: hostileLinkAuth,
    document,
    fingerprint,
    options: applyOptions(hostileLinkOutput, { recoverLinkOnly: true }),
    repository,
    log: () => {}
  }),
  /gueltigen Set-password-Link/u
);
await assert.rejects(fs.stat(hostileLinkOutput), (error) => error?.code === "ENOENT");

const generatedKeyRewriteAuth = new MockIdentityPlatformAuth();
await generatedKeyRewriteAuth.createUser({
  uid: document.uid,
  email: document.email,
  emailVerified: true,
  password: fixedBootstrap,
  displayName: document.display_name,
  disabled: false
});
const otherValidApiKey = `AIza${"B".repeat(35)}`;
generatedKeyRewriteAuth.generatePasswordResetLink = async () =>
  `https://${document.project_id}.firebaseapp.com/__/auth/action?mode=resetPassword`
  + `&oobCode=generated-key-one-time-secret-code&apiKey=${otherValidApiKey}`
  + `&continueUrl=${encodeURIComponent(document.continue_url)}`;
const generatedKeyRewriteOutput = path.join(
  protectedDirectory,
  "generated-key-rewritten-link.txt"
);
await executeIdentityPlatformAccountOnboarding({
  auth: generatedKeyRewriteAuth,
  document,
  fingerprint,
  options: applyOptions(generatedKeyRewriteOutput, { recoverLinkOnly: true }),
  repository,
  log: () => {}
});
const generatedKeyRewriteLink = (
  await fs.readFile(generatedKeyRewriteOutput, "utf8")
).trim();
assert.equal(
  new URL(generatedKeyRewriteLink).searchParams.get("apiKey"),
  adminApiKey
);
assert.ok(!generatedKeyRewriteLink.includes(otherValidApiKey));
assert.equal(generatedKeyRewriteAuth.verifyCalls.length, 1);

const wrongVerificationAuth = new MockIdentityPlatformAuth();
await wrongVerificationAuth.createUser({
  uid: document.uid,
  email: document.email,
  emailVerified: true,
  password: fixedBootstrap,
  displayName: document.display_name,
  disabled: false
});
wrongVerificationAuth.verificationResponse = {
  email: "different@example.invalid",
  requestType: "PASSWORD_RESET"
};
const wrongVerificationOutput = path.join(
  protectedDirectory,
  "wrong-verification-link.txt"
);
await safeRejection(
  () => executeIdentityPlatformAccountOnboarding({
    auth: wrongVerificationAuth,
    document,
    fingerprint,
    options: applyOptions(wrongVerificationOutput, { recoverLinkOnly: true }),
    repository,
    log: () => {}
  }),
  /Portal-Key bestaetigt/u
);
await assert.rejects(
  fs.stat(wrongVerificationOutput),
  (error) => error?.code === "ENOENT"
);

for (const unsafeRecoveryShape of [
  {
    providerIds: Object.freeze(["google.com", "password"]),
    hasPasswordCredential: true
  },
  {
    providerIds: Object.freeze(["google.com"]),
    hasPasswordCredential: false
  }
]) {
  const unsafeRecoveryAuth = new MockIdentityPlatformAuth();
  const passwordUser = await unsafeRecoveryAuth.createUser({
    uid: document.uid,
    email: document.email,
    emailVerified: true,
    password: fixedBootstrap,
    displayName: document.display_name,
    disabled: false
  });
  const unsafeUser = Object.freeze({
    ...passwordUser,
    ...unsafeRecoveryShape
  });
  unsafeRecoveryAuth.usersByUid.set(document.uid, unsafeUser);
  unsafeRecoveryAuth.usersByEmail.set(document.email, unsafeUser);
  await safeRejection(
    () => executeIdentityPlatformAccountOnboarding({
      auth: unsafeRecoveryAuth,
      document,
      fingerprint,
      options: recoveryPreviewOptions,
      repository,
      log: () => {}
    }),
    /nicht exakt/u
  );
  assert.equal(unsafeRecoveryAuth.linkCalls.length, 0);
}

for (const logValue of [
  ...previewLogs,
  ...applyLogs,
  ...recoveryLogs,
  ...partialRecoveryPreviewLogs
]) {
  assert.match(
    logValue,
    /^mode=(?:PREVIEW|APPLY) operation=(?:account-create-only|link-recovery) account_count=1 target_state=(?:absent|exact-existing) set_password_link_file_created=(?:true|false) input_fingerprint=sha256:[a-f0-9]{64}$/u
  );
  for (const forbidden of forbiddenLogValues) {
    assert.ok(!logValue.includes(forbidden), "Operator-Logs enthalten geschuetzte Kontodaten.");
  }
}

const insideRepositoryOutput = path.join(repository, "set-password-link.txt");
const emptyAuth = new MockIdentityPlatformAuth();
await safeRejection(
  () => executeIdentityPlatformAccountOnboarding({
    auth: emptyAuth,
    document,
    fingerprint,
    options: applyOptions(insideRepositoryOutput),
    repository,
    randomBytes: () => Buffer.alloc(36, 0x44),
    log: () => {}
  }),
  /ausserhalb des Git-Worktrees/u
);
assert.equal(emptyAuth.createCalls.length, 0);

assert.match(identityPlatformTerraform, /disabled_user_signup\s*=\s*true/u);
assert.doesNotMatch(operatorSource, /createUserWithEmailAndPassword|accounts:signUp/u);
assert.doesNotMatch(operatorSource, /firebase-admin/u);
assert.match(operatorSource, /identitytoolkit\.googleapis\.com/u);
assert.match(operatorSource, /\/accounts:sendOobCode/u);
assert.doesNotMatch(operatorSource, /console\.(?:log|error)\([^)]*(?:setPasswordLink|bootstrapPassword)/u);
assert.match(
  pilotRunbook,
  /native Reset-Link bleibt ausdrücklich\s+vom Einladungsweg ausgeschlossen/u
);
assert.match(
  pilotRunbook,
  /konto\/passwort-festlegen#einladung=<TOKEN>/u
);
assert.match(
  pilotRunbook,
  /`accepted_at`[\s\S]{0,120}`expires_at` exakt 48 Stunden später/u
);
assert.match(pilotRunbook, /kein\s+passwortloser IAP-Login/u);
assert.doesNotMatch(
  pilotRunbook,
  /Übergabe von Benutzername und Initialpasswort über getrennte Kanäle/u
);

await fs.rm(temporaryRoot, { recursive: true, force: true });

console.log(
  "Identity Platform Onboarding OK: create-only Account, geschuetzte Set-password-Linkdatei und Recovery bleiben ohne Secret-Ausgabe."
);
