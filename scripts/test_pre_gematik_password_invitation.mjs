#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_CONTINUE_URL,
  IdentityPlatformOnboardingError,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  identityPlatformGuestAccessFingerprint,
  validateIdentityPlatformGuestAccessDocument
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";
import {
  PASSWORD_INVITATION_ACCESS_SCOPE,
  PASSWORD_INVITATION_OPERATION,
  PASSWORD_INVITATION_TTL_MS,
  activatePasswordInvitationRecord,
  activatePreparedPasswordInvitation,
  createPasswordInvitationGcsStore,
  executePasswordInvitationPreparation,
  parsePasswordInvitationArguments,
  passwordInvitationLink,
  passwordInvitationPreparationFingerprint,
  passwordInvitationTokenDigest,
  readBoundPreparedPasswordInvitation,
  validatePasswordInvitationLink,
  validatePasswordInvitationPostApplyEvidence,
  validatePasswordInvitationRecord
} from "./provision_pre_gematik_password_invitation.mjs";

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) =>
      error instanceof IdentityPlatformOnboardingError
      && pattern.test(error.message)
  );
}

const account = validateIdentityPlatformAccountDocument({
  version: 1,
  project_id: "steam-capsule-341212",
  uid: "guest_invitation_test_001",
  email: "guest@example.invalid",
  display_name: "Einladung Test",
  email_ownership_verified: true,
  continue_url: EXPECTED_CONTINUE_URL
});
const guestAccess = validateIdentityPlatformGuestAccessDocument({
  version: 1,
  project_id: account.project_id,
  uid: account.uid,
  email: account.email,
  profile_id: "12345678-1234-4123-8123-123456789abc",
  display_name: account.display_name,
  role: "viewer",
  scope_ref: "external-pilot:gematik"
});
const guestFingerprint = identityPlatformGuestAccessFingerprint(guestAccess);
const bindingStateFingerprint = `sha256:${"b".repeat(64)}`;
const postApplyEvidence = {
  schema_version: 1,
  operation: GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  mode: "PREVIEW",
  result: "unchanged",
  identity_platform_account_verified: true,
  provider_verified: "password",
  subject_namespace_verified: true,
  access_scope_verified: "test_only",
  profile_count: 1,
  binding_count: 1,
  active_binding_count: 1,
  profile_binding_complete: true,
  database_transaction_committed: false,
  input_fingerprint: guestFingerprint,
  current_state_fingerprint: bindingStateFingerprint,
  expected_state_fingerprint: bindingStateFingerprint,
  online_onboarding_gate: {
    gate_policy: "online-guest-onboarding",
    gate_fingerprint: `sha256:${"c".repeat(64)}`,
    automated_backups: true,
    point_in_time_recovery: true,
    transaction_log_retention_days: 7,
    retained_backups: 14,
    retention_unit: "COUNT",
    latest_successful_automated_backup_id: "1785808800000",
    latest_successful_automated_backup_end_time: "2026-08-04T03:04:28.112Z"
  }
};
assert.deepEqual(
  validatePasswordInvitationPostApplyEvidence(
    postApplyEvidence,
    guestFingerprint
  ),
  { bindingStateFingerprint }
);
safeFailure(
  () => validatePasswordInvitationPostApplyEvidence(
    { ...postApplyEvidence, active_binding_count: 0 },
    guestFingerprint
  ),
  /test_only-Binding/u
);
safeFailure(
  () => validatePasswordInvitationPostApplyEvidence(
    { ...postApplyEvidence, unexpected: true },
    guestFingerprint
  ),
  /nicht freigegebene Felder/u
);

const tokenBytes = Buffer.alloc(32, 7);
const token = tokenBytes.toString("base64url");
assert.equal(token.length, 43);
const actionUrl = passwordInvitationLink(token);
assert.equal(
  actionUrl,
  `https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=${token}`
);
assert.deepEqual(validatePasswordInvitationLink(actionUrl), {
  href: actionUrl,
  token
});
assert.match(passwordInvitationTokenDigest(token), /^[a-f0-9]{64}$/u);
assert.equal(
  passwordInvitationTokenDigest(token),
  passwordInvitationTokenDigest(token)
);
for (const rejected of [
  actionUrl.replace("versorgungs-kompass.de", "example.invalid"),
  actionUrl.replace("#einladung=", "?einladung="),
  actionUrl.replace("#einladung=", "#token="),
  `${actionUrl}x`,
  "https://versorgungs-kompass.de/konto/passwort-festlegen"
    + "?mode=resetPassword&oobCode=abcdefghijklmnopqrstuvwxyz&apiKey=AIza"
]) {
  safeFailure(
    () => validatePasswordInvitationLink(rejected),
    /Wrapperlink|48-Stunden/u
  );
}

const preparedAt = "2026-08-04T10:00:00.000Z";
const acceptedAt = "2026-08-04T10:05:00.000Z";
const preparedRecord = validatePasswordInvitationRecord({
  version: "v1",
  purpose: "password_invitation",
  status: "prepared",
  project_id: account.project_id,
  tenant_id: "",
  uid: account.uid,
  email: account.email,
  continue_url: account.continue_url,
  prepared_at: preparedAt,
  accepted_at: null,
  expires_at: null,
  account_fingerprint: `sha256:${"a".repeat(64)}`,
  guest_access_fingerprint: guestFingerprint,
  binding_state_fingerprint: bindingStateFingerprint,
  profile_id: guestAccess.profile_id,
  role: guestAccess.role,
  access_scope: PASSWORD_INVITATION_ACCESS_SCOPE,
  scope_ref: guestAccess.scope_ref
}, { expectedStatus: "prepared" });
const activeRecord = activatePasswordInvitationRecord(preparedRecord, acceptedAt);
assert.equal(activeRecord.status, "active");
assert.equal(activeRecord.accepted_at, acceptedAt);
assert.equal(
  new Date(activeRecord.expires_at).valueOf() - new Date(acceptedAt).valueOf(),
  PASSWORD_INVITATION_TTL_MS
);
safeFailure(
  () => validatePasswordInvitationRecord({
    ...activeRecord,
    expires_at: "2026-08-06T10:04:59.999Z"
  }, { expectedStatus: "active" }),
  /48 Stunden/u
);

const bucket = "vk-private-password-invitations-test";
const fingerprint = passwordInvitationPreparationFingerprint({
  account,
  guestAccess,
  bindingStateFingerprint,
  bucket
});
const previewOptions = parsePasswordInvitationArguments([
  "--account-input", "/protected/account.json",
  "--guest-access-input", "/protected/guest-access.json",
  "--post-apply-evidence", "/protected/post-apply.log",
  "--bucket", bucket
]);
let tokenFactoryCalls = 0;
const previewLogs = [];
const preview = await executePasswordInvitationPreparation({
  account,
  guestAccess,
  bindingStateFingerprint,
  options: previewOptions,
  store: null,
  repository: process.cwd(),
  tokenFactory: () => {
    tokenFactoryCalls += 1;
    return token;
  },
  log: (line) => previewLogs.push(line)
});
assert.equal(preview.applied, false);
assert.equal(preview.fingerprint, fingerprint);
assert.equal(tokenFactoryCalls, 0);
assert.equal(previewLogs.length, 1);
assert.ok(!previewLogs[0].includes(account.email));
assert.ok(!previewLogs[0].includes(token));

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "vk-password-invitation-test-")
);
await fs.chmod(temporaryRoot, 0o700);
const repository = path.join(temporaryRoot, "repository");
await fs.mkdir(repository, { mode: 0o700 });
const output = path.join(temporaryRoot, "password-invitation-link.txt");
const applyOptions = parsePasswordInvitationArguments([
  "--account-input", path.join(temporaryRoot, "account.json"),
  "--guest-access-input", path.join(temporaryRoot, "guest-access.json"),
  "--post-apply-evidence", path.join(temporaryRoot, "post-apply.log"),
  "--bucket", bucket,
  "--output", output,
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", account.project_id,
  "--confirm-operation", PASSWORD_INVITATION_OPERATION,
  "--confirm-fingerprint", fingerprint
]);
let storedDigest = "";
let storedRecord;
const applyLogs = [];
const applied = await executePasswordInvitationPreparation({
  account,
  guestAccess,
  bindingStateFingerprint,
  options: applyOptions,
  repository,
  store: {
    createPrepared: async (digest, record) => {
      storedDigest = digest;
      storedRecord = record;
      return {
        name: `prepared/${digest}.json`,
        generation: "123"
      };
    }
  },
  now: () => new Date(preparedAt),
  tokenFactory: () => token,
  log: (line) => applyLogs.push(line)
});
assert.equal(applied.applied, true);
assert.equal(storedDigest, passwordInvitationTokenDigest(token));
assert.equal(storedRecord.status, "prepared");
assert.equal(storedRecord.accepted_at, null);
assert.equal(storedRecord.expires_at, null);
assert.equal(storedRecord.access_scope, "test_only");
assert.equal(storedRecord.scope_ref, guestAccess.scope_ref);
assert.equal(await fs.readFile(output, "utf8"), `${actionUrl}\n`);
if (process.platform !== "win32") {
  assert.equal((await fs.stat(output)).mode & 0o077, 0);
}
assert.equal(applyLogs.length, 1);
for (const secret of [token, actionUrl, account.email, account.uid]) {
  assert.ok(!applyLogs[0].includes(secret));
}
await safeRejection(
  () => executePasswordInvitationPreparation({
    account,
    guestAccess,
    bindingStateFingerprint,
    options: applyOptions,
    repository,
    store: { createPrepared: async () => ({}) },
    tokenFactory: () => token,
    log: () => {}
  }),
  /existiert bereits/u
);

const preparedForAccount = {
  ...storedRecord,
  account_fingerprint: (await import(
    "./provision_pre_gematik_identity_platform_account.mjs"
  )).identityPlatformAccountFingerprint(account)
};
const mockStoreCalls = [];
const mockStore = {
  readPrepared: async (digest) => {
    mockStoreCalls.push(["read", digest]);
    return { digest, generation: "123", record: preparedForAccount };
  },
  createActive: async (digest, record) => {
    mockStoreCalls.push(["createActive", digest, record]);
    return { name: `active/${digest}.json`, generation: "456" };
  },
  deletePrepared: async (digest, generation) => {
    mockStoreCalls.push(["deletePrepared", digest, generation]);
  }
};
const boundPrepared = await readBoundPreparedPasswordInvitation({
  actionUrl,
  account,
  store: mockStore
});
assert.equal(boundPrepared.generation, "123");
const activated = await activatePreparedPasswordInvitation({
  prepared: boundPrepared,
  acceptedAt,
  store: mockStore
});
assert.equal(activated.generation, "456");
assert.equal(activated.record.status, "active");
assert.deepEqual(
  mockStoreCalls.map((call) => call[0]),
  ["read", "createActive", "deletePrepared"]
);
assert.deepEqual(mockStoreCalls.at(-1), [
  "deletePrepared",
  storedDigest,
  "123"
]);

const gcsRequests = [];
const gcsStore = createPasswordInvitationGcsStore({
  bucket,
  projectId: account.project_id,
  accessTokenProvider: () => "x".repeat(64),
  fetchImpl: async (url, init) => {
    gcsRequests.push({ url, init });
    const parsed = new URL(url);
    const name = parsed.searchParams.get("name");
    return {
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        bucket,
        name,
        generation: "789",
        size: "500",
        contentType: "application/json"
      })
    };
  }
});
const createdMetadata = await gcsStore.createPrepared(
  storedDigest,
  preparedForAccount
);
assert.equal(createdMetadata.generation, "789");
const createUrl = new URL(gcsRequests[0].url);
assert.equal(createUrl.origin, "https://storage.googleapis.com");
assert.equal(createUrl.searchParams.get("uploadType"), "media");
assert.equal(createUrl.searchParams.get("ifGenerationMatch"), "0");
assert.equal(
  createUrl.searchParams.get("name"),
  `prepared/${storedDigest}.json`
);
assert.equal(gcsRequests[0].init.redirect, "error");
assert.equal(gcsRequests[0].init.headers.authorization, `Bearer ${"x".repeat(64)}`);
assert.ok(!gcsRequests[0].init.body.includes(token));

await fs.rm(temporaryRoot, { recursive: true, force: true });
console.log(
  "48-Stunden-Passworteinladung OK: domain-separierter Token-Digest, inertes "
  + "prepared, SMTP-gebundenes active und generationengepinnte GCS-Operationen."
);
