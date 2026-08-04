#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_PASSWORD_PROVIDER,
  GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  GUEST_ACCESS_OPERATION,
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION,
  GUEST_ACCESS_REVOKE_OPERATION,
  GuestAccessCommitOutcomeUnknownError,
  GuestAccessProfileCreationCommitOutcomeUnknownError,
  GuestAccessProfileDisplayNameReconciliationCommitOutcomeUnknownError,
  GuestAccessRevocationCommitOutcomeUnknownError,
  assertFreshGcpOnlineOnboardingGate,
  buildIdentityPlatformGuestPreBindingPlan,
  buildIdentityPlatformGuestProfileCreationPlan,
  buildIdentityPlatformGuestProfileDisplayNameReconciliationPlan,
  buildIdentityPlatformGuestRevocationPlan,
  executeIdentityPlatformGuestPreBindingTransaction,
  executeIdentityPlatformGuestProfileCreationTransaction,
  executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction,
  executeIdentityPlatformGuestRevocationTransaction,
  identityPlatformGuestAccessFingerprint,
  identityPlatformGuestSubject,
  loadProtectedIdentityPlatformGuestAccessDocument,
  main as identityPlatformGuestAccessMain,
  parseIdentityPlatformGuestAccessArguments,
  validateIdentityPlatformGuestAccessConfirmations,
  validateIdentityPlatformGuestAccessDocument,
  verifyIdentityPlatformPasswordGuest
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";
import { createIdentityToolkitAdminClient } from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  SafeCliError,
  identityTargetFingerprint
} from "./provision_iap_identity_bindings.mjs";

const projectRoot = new URL("../", import.meta.url);
const operatorSource = await fs.readFile(
  new URL(
    "scripts/provision_pre_gematik_identity_platform_guest_access.mjs",
    projectRoot
  ),
  "utf8"
);

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) => error instanceof SafeCliError && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) => error instanceof SafeCliError && pattern.test(error.message)
  );
}

const documentValue = {
  version: 1,
  project_id: "pilot-project-123",
  uid: "guest_password_001",
  email: "guest@example.invalid",
  profile_id: "11111111-2222-4333-8444-555555555555",
  display_name: "TestTimo",
  role: "editor",
  scope_ref: "external-pilot:test-timo"
};

const onlineOnboardingGate = Object.freeze({
  ok: true,
  fingerprint: `sha256:${"d".repeat(64)}`,
  gatePolicy: "online-guest-onboarding",
  backupPosture: Object.freeze({
    automatedBackups: true,
    pointInTimeRecovery: true,
    transactionLogRetentionDays: 7,
    retainedBackups: 14,
    retentionUnit: "COUNT",
    latestSuccessfulAutomatedBackupId: "20300615110000",
    latestSuccessfulAutomatedBackupEndTime: "2030-06-15T11:15:00.000Z"
  }),
  targetDatabase: Object.freeze({
    connectionName: "pilot-project-123:example-region1:example-private-postgres"
  })
});
const document = validateIdentityPlatformGuestAccessDocument(documentValue);
const fingerprint = identityPlatformGuestAccessFingerprint(document);
const subject =
  "securetoken.google.com/pilot-project-123:guest_password_001";

assert.equal(identityPlatformGuestSubject(document.project_id, document.uid), subject);
assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  fingerprint,
  identityPlatformGuestAccessFingerprint(validateIdentityPlatformGuestAccessDocument({
    scope_ref: document.scope_ref,
    role: document.role,
    display_name: document.display_name,
    profile_id: document.profile_id,
    email: document.email,
    uid: document.uid,
    project_id: document.project_id,
    version: 1
  }))
);

for (const [change, pattern] of [
  [{ email: "Guest@Example.invalid" }, /kleingeschrieben/u],
  [{ uid: "short" }, /uid ist ungueltig/u],
  [{ project_id: "FOREIGN" }, /project_id ist ungueltig/u],
  [{ profile_id: "not-a-uuid" }, /profile_id ist ungueltig/u],
  [{ role: "admin" }, /viewer oder editor/u],
  [{ scope_ref: "../other" }, /scope_ref ist ungueltig/u]
]) {
  safeFailure(
    () => validateIdentityPlatformGuestAccessDocument({ ...documentValue, ...change }),
    pattern
  );
}
safeFailure(
  () => validateIdentityPlatformGuestAccessDocument({
    ...documentValue,
    subject
  }),
  /nicht freigegebene Felder/u
);

function exactIdentity(overrides = {}) {
  return Object.freeze({
    uid: document.uid,
    email: document.email,
    displayName: document.display_name,
    emailVerified: true,
    disabled: false,
    providerIds: Object.freeze([EXPECTED_PASSWORD_PROVIDER]),
    hasPasswordCredential: true,
    phoneNumber: "",
    emailLinkSignin: false,
    customAuth: false,
    hasCustomAttributes: false,
    hasMfaEnrollment: false,
    tenantId: "",
    initialEmail: "",
    ...overrides
  });
}

function authFor(byUid = exactIdentity(), byEmail = byUid) {
  return {
    uidLookups: [],
    emailLookups: [],
    async getUser(uid) {
      this.uidLookups.push(uid);
      if (byUid instanceof Error) throw byUid;
      return byUid;
    },
    async getUserByEmail(email) {
      this.emailLookups.push(email);
      if (byEmail instanceof Error) throw byEmail;
      return byEmail;
    }
  };
}

const verifiedAuth = authFor();
const verifiedEvidence = await verifyIdentityPlatformPasswordGuest(verifiedAuth, document);
assert.deepEqual(verifiedEvidence, {
  issuer: "https://cloud.google.com/iap",
  subject,
  provider: "password"
});
assert.deepEqual(verifiedAuth.uidLookups, [document.uid]);
assert.deepEqual(verifiedAuth.emailLookups, [document.email]);

for (const [byUid, byEmail] of [
  [exactIdentity({ uid: "different_guest_001" }), exactIdentity()],
  [exactIdentity({ email: "other@example.invalid" }), exactIdentity()],
  [exactIdentity({ displayName: "Abweichend" }), exactIdentity({ displayName: "Abweichend" })],
  [exactIdentity({ emailVerified: false }), exactIdentity({ emailVerified: false })],
  [exactIdentity({ disabled: true }), exactIdentity({ disabled: true })],
  [
    exactIdentity({ hasPasswordCredential: false }),
    exactIdentity({ hasPasswordCredential: false })
  ],
  [exactIdentity({ providerIds: ["google.com"] }), exactIdentity({ providerIds: ["google.com"] })],
  [
    exactIdentity({ providerIds: ["password", "google.com"] }),
    exactIdentity({ providerIds: ["password", "google.com"] })
  ],
  [exactIdentity({ phoneNumber: "+4912345" }), exactIdentity({ phoneNumber: "+4912345" })],
  [exactIdentity({ emailLinkSignin: true }), exactIdentity({ emailLinkSignin: true })],
  [exactIdentity({ customAuth: true }), exactIdentity({ customAuth: true })],
  [
    exactIdentity({ hasCustomAttributes: true }),
    exactIdentity({ hasCustomAttributes: true })
  ],
  [exactIdentity({ hasMfaEnrollment: true }), exactIdentity({ hasMfaEnrollment: true })],
  [
    exactIdentity({ initialEmail: "old@example.invalid" }),
    exactIdentity({ initialEmail: "old@example.invalid" })
  ],
  [exactIdentity({ tenantId: "foreign-tenant" }), exactIdentity({ tenantId: "foreign-tenant" })],
  [exactIdentity(), exactIdentity({ uid: "different_guest_001" })]
]) {
  await safeRejection(
    () => verifyIdentityPlatformPasswordGuest(authFor(byUid, byEmail), document),
    /UID, E-Mail, Anzeigename, Credential- oder Sicherheitszustand/u
  );
}

const rawLookupFailure = Object.assign(
  new Error(`raw provider failure ${document.email} ${document.uid}`),
  { code: "auth/internal-error" }
);
await assert.rejects(
  () => verifyIdentityPlatformPasswordGuest(
    authFor(rawLookupFailure, rawLookupFailure),
    document
  ),
  (error) => {
    assert.ok(error instanceof SafeCliError);
    assert.doesNotMatch(error.message, new RegExp(document.email, "u"));
    assert.doesNotMatch(error.message, new RegExp(document.uid, "u"));
    return true;
  }
);

const adminApiKey = `AIza${"A".repeat(35)}`;
const adminAccessToken = `ya29.${"a".repeat(64)}`;
const rawIdentityToolkitUser = {
  localId: document.uid,
  email: document.email,
  emailVerified: true,
  disabled: false,
  providerUserInfo: [{
    providerId: "password",
    federatedId: document.email
  }],
  tenantId: ""
};
const identityToolkitClient = createIdentityToolkitAdminClient({
  projectId: document.project_id,
  apiKey: adminApiKey,
  accessToken: adminAccessToken,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ users: [rawIdentityToolkitUser] })
  })
});
assert.deepEqual(
  (await identityToolkitClient.getUser(document.uid)).providerIds,
  ["password"]
);

const profile = {
  id: document.profile_id,
  email: document.email,
  display_name: document.display_name,
  role: document.role,
  active: true
};
const binding = {
  issuer: "https://cloud.google.com/iap",
  subject,
  profile_id: document.profile_id,
  active: true,
  access_scope: "test_only",
  scope_ref: document.scope_ref
};
const revokedBinding = { ...binding, active: false };
const profileWithPreviousDisplayName = {
  ...profile,
  display_name: "Previous Test Name"
};

const newGuestCreationPlan = buildIdentityPlatformGuestProfileCreationPlan(
  document,
  [],
  [],
  []
);
assert.equal(newGuestCreationPlan.action, "create_profile_and_binding");
assert.equal(newGuestCreationPlan.profileInsertCount, 1);
assert.equal(newGuestCreationPlan.bindingInsertCount, 1);
assert.notEqual(
  newGuestCreationPlan.currentStateFingerprint,
  newGuestCreationPlan.expectedStateFingerprint
);

const newGuestNoopPlan = buildIdentityPlatformGuestProfileCreationPlan(
  document,
  [profile],
  [binding],
  []
);
assert.equal(newGuestNoopPlan.action, "unchanged");
assert.equal(newGuestNoopPlan.profileInsertCount, 0);
assert.equal(newGuestNoopPlan.bindingInsertCount, 0);
assert.equal(
  newGuestNoopPlan.currentStateFingerprint,
  newGuestNoopPlan.expectedStateFingerprint
);

for (const [profiles, bindings, requests, pattern] of [
  [[profile], [], [], /vollstaendig leeren Zielzustand/u],
  [[], [binding], [], /vollstaendig leeren Zielzustand/u],
  [[{ ...profile, display_name: "Different" }], [binding], [], /exakten vollstaendigen/u],
  [[{ ...profile, team: "unexpected-team" }], [binding], [], /exakten vollstaendigen/u],
  [[profile], [{ ...binding, scope_ref: "external-pilot:other" }], [], /exakten vollstaendigen/u],
  [
    [],
    [],
    [{
      request_id: "11111111-1111-4111-8111-111111111111",
      issuer: binding.issuer,
      subject,
      verified_email: document.email,
      status: "pending",
      applied_profile_id: null
    }],
    /Enrollment-Request/u
  ],
  [[profile, { ...profile, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], [binding], [], /exakten vollstaendigen/u]
]) {
  safeFailure(
    () => buildIdentityPlatformGuestProfileCreationPlan(
      document,
      profiles,
      bindings,
      requests
    ),
    pattern
  );
}

safeFailure(
  () => buildIdentityPlatformGuestPreBindingPlan(document, [], [], []),
  /darf kein Profil anlegen/u
);

const liveExistingProfilePlan = buildIdentityPlatformGuestPreBindingPlan(
  document,
  [profile],
  [],
  []
);
assert.equal(liveExistingProfilePlan.action, "create_binding");
assert.equal(liveExistingProfilePlan.bindingInsertCount, 1);

const unchangedPlan = buildIdentityPlatformGuestPreBindingPlan(
  document,
  [profile],
  [binding],
  []
);
assert.equal(unchangedPlan.action, "unchanged");
assert.equal(unchangedPlan.currentStateFingerprint, unchangedPlan.expectedStateFingerprint);
assert.equal(unchangedPlan.bindingInsertCount, 0);

const displayNameReconciliationPlan =
  buildIdentityPlatformGuestProfileDisplayNameReconciliationPlan(
    document,
    [profileWithPreviousDisplayName],
    [],
    []
  );
assert.equal(
  displayNameReconciliationPlan.action,
  "reconcile_profile_display_name_and_create_binding"
);
assert.equal(displayNameReconciliationPlan.profileUpdateCount, 1);
assert.equal(displayNameReconciliationPlan.bindingInsertCount, 1);
assert.notEqual(
  displayNameReconciliationPlan.currentStateFingerprint,
  displayNameReconciliationPlan.expectedStateFingerprint
);
const displayNameReconciliationNoopPlan =
  buildIdentityPlatformGuestProfileDisplayNameReconciliationPlan(
    document,
    [profile],
    [binding],
    []
  );
assert.equal(displayNameReconciliationNoopPlan.action, "unchanged");
assert.equal(displayNameReconciliationNoopPlan.profileUpdateCount, 0);
assert.equal(displayNameReconciliationNoopPlan.bindingInsertCount, 0);
assert.equal(
  displayNameReconciliationNoopPlan.currentStateFingerprint,
  displayNameReconciliationNoopPlan.expectedStateFingerprint
);
for (const [profiles, bindings, requests, pattern] of [
  [[profile], [], [], /ansonsten exaktes/u],
  [[profileWithPreviousDisplayName], [binding], [], /ansonsten exaktes/u],
  [[{ ...profileWithPreviousDisplayName, role: "viewer" }], [], [], /ansonsten exaktes/u],
  [[{ ...profileWithPreviousDisplayName, active: false }], [], [], /ansonsten exaktes/u],
  [[{ ...profileWithPreviousDisplayName, email: "other@example.invalid" }], [], [], /ansonsten exaktes/u],
  [[{ ...profileWithPreviousDisplayName, display_name: " Previous Test Name " }], [], [], /ansonsten exaktes/u],
  [[profileWithPreviousDisplayName, { ...profileWithPreviousDisplayName }], [], [], /ansonsten exaktes/u],
  [[profileWithPreviousDisplayName], [binding, { ...binding }], [], /ansonsten exaktes/u],
  [
    [profileWithPreviousDisplayName],
    [],
    [{
      request_id: "11111111-1111-4111-8111-111111111111",
      issuer: binding.issuer,
      subject,
      verified_email: document.email,
      status: "pending",
      applied_profile_id: null
    }],
    /Enrollment-Request/u
  ]
]) {
  safeFailure(
    () => buildIdentityPlatformGuestProfileDisplayNameReconciliationPlan(
      document,
      profiles,
      bindings,
      requests
    ),
    pattern
  );
}

const revokePlan = buildIdentityPlatformGuestRevocationPlan(
  document,
  [profile],
  [binding],
  []
);
assert.equal(revokePlan.action, "disable_binding");
assert.equal(revokePlan.bindingUpdateCount, 1);
const alreadyRevokedPlan = buildIdentityPlatformGuestRevocationPlan(
  document,
  [profile],
  [revokedBinding],
  []
);
assert.equal(alreadyRevokedPlan.action, "unchanged");
assert.equal(alreadyRevokedPlan.bindingUpdateCount, 0);
assert.equal(
  alreadyRevokedPlan.currentStateFingerprint,
  alreadyRevokedPlan.expectedStateFingerprint
);

for (const [profiles, bindings, requests, pattern] of [
  [[], [], [], /exakt ein vorhandenes Sollprofil/u],
  [[profile], [], [], /genau eine.*Bindung/u],
  [[{ ...profile, active: false }], [binding], [], /Sollprofil/u],
  [[profile], [{ ...binding, access_scope: "standard", scope_ref: null }], [], /test_only-Zustand/u],
  [[profile], [{ ...binding, subject: `${subject}-drift` }], [], /test_only-Zustand/u],
  [
    [profile],
    [binding],
    [{
      request_id: "11111111-1111-4111-8111-111111111111",
      issuer: binding.issuer,
      subject,
      verified_email: document.email,
      status: "pending",
      applied_profile_id: null
    }],
    /Enrollment-Request/u
  ]
]) {
  safeFailure(
    () => buildIdentityPlatformGuestRevocationPlan(
      document,
      profiles,
      bindings,
      requests
    ),
    pattern
  );
}

for (const [profiles, bindings, requests, pattern] of [
  [[{ ...profile, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], [], [], /Sollprofil/u],
  [[{ ...profile, email: "other@example.invalid" }], [], [], /Sollprofil/u],
  [[{ ...profile, display_name: "Different" }], [], [], /Sollprofil/u],
  [[{ ...profile, role: "viewer" }], [], [], /Sollprofil/u],
  [[{ ...profile, active: false }], [], [], /Sollprofil/u],
  [[profile], [{ ...binding, subject: `${subject}-collision` }], [], /Sollzustand/u],
  [[profile], [{ ...binding, profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], [], /Sollzustand/u],
  [[], [binding], [], /darf kein Profil anlegen/u],
  [
    [profile],
    [],
    [{
      request_id: "11111111-1111-4111-8111-111111111111",
      issuer: binding.issuer,
      subject,
      verified_email: document.email,
      status: "pending",
      applied_profile_id: null
    }],
    /Enrollment-Request/u
  ],
  [[profile, { ...profile, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], [], [], /Kollision/u]
]) {
  safeFailure(
    () => buildIdentityPlatformGuestPreBindingPlan(
      document,
      profiles,
      bindings,
      requests
    ),
    pattern
  );
}

const previewOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json"
]);
validateIdentityPlatformGuestAccessConfirmations(previewOptions, document, fingerprint);
assert.equal(previewOptions.apply, false);

function applyOptions(currentStateFingerprint) {
  return parseIdentityPlatformGuestAccessArguments([
    "--input", "/protected/guest-access.json",
    "--apply",
    "--confirm-environment", "pre-gematik",
    "--confirm-project", document.project_id,
    "--confirm-database", "versorgungs_kompass",
    "--confirm-operation", GUEST_ACCESS_OPERATION,
    "--confirm-fingerprint", fingerprint,
    "--confirm-current-state-fingerprint", currentStateFingerprint
  ]);
}

validateIdentityPlatformGuestAccessConfirmations(
  applyOptions(liveExistingProfilePlan.currentStateFingerprint),
  document,
  fingerprint
);
const createProfilePreviewOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--create-profile-and-prebind"
]);
assert.equal(createProfilePreviewOptions.createProfileAndPrebind, true);
validateIdentityPlatformGuestAccessConfirmations(
  createProfilePreviewOptions,
  document,
  fingerprint
);
const createProfileApplyOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--create-profile-and-prebind",
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", document.project_id,
  "--confirm-database", "versorgungs_kompass",
  "--confirm-operation", GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  "--confirm-fingerprint", fingerprint,
  "--confirm-current-state-fingerprint", newGuestCreationPlan.currentStateFingerprint
]);
validateIdentityPlatformGuestAccessConfirmations(
  createProfileApplyOptions,
  document,
  fingerprint
);
safeFailure(
  () => validateIdentityPlatformGuestAccessConfirmations(
    { ...createProfileApplyOptions, confirmOperation: GUEST_ACCESS_OPERATION },
    document,
    fingerprint
  ),
  /Apply-Bestaetigungen/u
);
const reconcilePreviewOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--reconcile-profile-display-name-and-prebind"
]);
assert.equal(reconcilePreviewOptions.reconcileProfileDisplayNameAndPrebind, true);
validateIdentityPlatformGuestAccessConfirmations(
  reconcilePreviewOptions,
  document,
  fingerprint
);
const reconcileApplyOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--reconcile-profile-display-name-and-prebind",
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", document.project_id,
  "--confirm-database", "versorgungs_kompass",
  "--confirm-operation", GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION,
  "--confirm-fingerprint", fingerprint,
  "--confirm-current-state-fingerprint",
  displayNameReconciliationPlan.currentStateFingerprint
]);
validateIdentityPlatformGuestAccessConfirmations(
  reconcileApplyOptions,
  document,
  fingerprint
);
safeFailure(
  () => validateIdentityPlatformGuestAccessConfirmations(
    { ...reconcileApplyOptions, confirmOperation: GUEST_ACCESS_OPERATION },
    document,
    fingerprint
  ),
  /Apply-Bestaetigungen/u
);
safeFailure(
  () => parseIdentityPlatformGuestAccessArguments([
    "--input", "/protected/guest-access.json",
    "--create-profile-and-prebind",
    "--reconcile-profile-display-name-and-prebind"
  ]),
  /gegenseitig ausgeschlossen/u
);
safeFailure(
  () => parseIdentityPlatformGuestAccessArguments([
    "--input", "/protected/guest-access.json",
    "--create-profile-and-prebind",
    "--revoke"
  ]),
  /gegenseitig ausgeschlossen/u
);
const revokePreviewOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--revoke"
]);
assert.equal(revokePreviewOptions.revoke, true);
validateIdentityPlatformGuestAccessConfirmations(
  revokePreviewOptions,
  document,
  fingerprint
);
const revokeApplyOptions = parseIdentityPlatformGuestAccessArguments([
  "--input", "/protected/guest-access.json",
  "--revoke",
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", document.project_id,
  "--confirm-database", "versorgungs_kompass",
  "--confirm-operation", GUEST_ACCESS_REVOKE_OPERATION,
  "--confirm-fingerprint", fingerprint,
  "--confirm-current-state-fingerprint", revokePlan.currentStateFingerprint
]);
validateIdentityPlatformGuestAccessConfirmations(
  revokeApplyOptions,
  document,
  fingerprint
);
safeFailure(
  () => validateIdentityPlatformGuestAccessConfirmations(
    { ...revokeApplyOptions, confirmOperation: GUEST_ACCESS_OPERATION },
    document,
    fingerprint
  ),
  /Apply-Bestaetigungen/u
);
safeFailure(
  () => validateIdentityPlatformGuestAccessConfirmations(
    parseIdentityPlatformGuestAccessArguments([
      "--input", "/protected/guest-access.json",
      "--confirm-project", document.project_id
    ]),
    document,
    fingerprint
  ),
  /nur zusammen mit --apply/u
);
safeFailure(
  () => validateIdentityPlatformGuestAccessConfirmations(
    parseIdentityPlatformGuestAccessArguments([
      "--input", "/protected/guest-access.json",
      "--apply",
      "--confirm-environment", "pre-gematik",
      "--confirm-project", document.project_id,
      "--confirm-database", "versorgungs_kompass",
      "--confirm-operation", GUEST_ACCESS_OPERATION,
      "--confirm-fingerprint", fingerprint,
      "--confirm-current-state-fingerprint", `sha256:${"0".repeat(64)}`
    ]),
    document,
    `sha256:${"1".repeat(64)}`
  ),
  /Apply-Bestaetigungen/u
);

const safeSessionState = Object.freeze({
  unassumed_session: true,
  login_can_login: true,
  login_inherits_roles: true,
  login_superuser: false,
  login_create_database: false,
  login_create_role: false,
  login_replication: false,
  login_bypass_rls: false,
  admin_can_login: false,
  admin_inherits_roles: false,
  admin_superuser: false,
  admin_create_database: false,
  admin_create_role: false,
  admin_replication: false,
  admin_bypass_rls: false,
  access_admin_member: true,
  cloudsql_superuser_member: false,
  postgres_member: false,
  login_membership_count: 1,
  login_access_admin_membership_count: 1,
  admin_parent_membership_count: 0,
  admin_member_count: 2,
  admin_login_member_count: 1,
  admin_owner_member_count: 1,
  admin_unexpected_member_count: 0,
  access_objects_share_owner: true
});

const safePrivilegeState = Object.freeze({
  expected_role: true,
  schema_usage: true,
  schema_create: false,
  profile_select: true,
  profile_insert: false,
  profile_update: false,
  profile_delete: false,
  profile_id_insert: true,
  profile_role_update: true,
  binding_select: true,
  binding_insert: false,
  binding_update: false,
  binding_delete: false,
  binding_subject_insert: true,
  binding_subject_update: false,
  request_select: true,
  request_update: false,
  request_delete: false,
  request_status_update: true,
  request_email_update: false,
  touch_execute: true,
  unsafe_other_table_privilege_count: 0,
  unsafe_sequence_privilege_count: 0,
  unsafe_other_function_privilege_count: 0
});

class MockTransactionalClient {
  constructor({
    profiles = [],
    bindings = [],
    requests = [],
    database = "versorgungs_kompass",
    failCommit = false,
    failBindingInsert = false
  } = {}) {
    this.state = structuredClone({ profiles, bindings, requests });
    this.database = database;
    this.failCommit = failCommit;
    this.failBindingInsert = failBindingInsert;
    this.calls = [];
    this.snapshot = null;
  }

  async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/gu, " ").trim().toLowerCase();
    this.calls.push({ sql: normalized, values: structuredClone(values) });
    if (normalized === "begin isolation level serializable") {
      this.snapshot = structuredClone(this.state);
      return { rows: [], rowCount: null };
    }
    if (normalized === "rollback") {
      if (this.snapshot) this.state = structuredClone(this.snapshot);
      this.snapshot = null;
      return { rows: [], rowCount: null };
    }
    if (normalized === "commit") {
      if (this.failCommit) throw new Error("simulated lost commit response");
      this.snapshot = null;
      return { rows: [], rowCount: null };
    }
    if (normalized.includes("current_user = session_user as unassumed_session")) {
      return { rows: [safeSessionState], rowCount: 1 };
    }
    if (normalized.includes("current_user = 'vk_access_enrollment_admin' as expected_role")) {
      return { rows: [safePrivilegeState], rowCount: 1 };
    }
    if (normalized.startsWith("select current_database()")) {
      return { rows: [{ database_name: this.database }], rowCount: 1 };
    }
    if (normalized.startsWith("insert into public.profiles")) {
      this.state.profiles.push({
        id: values[0],
        email: values[1],
        display_name: values[2],
        role: values[3],
        active: true
      });
      return { rows: [], rowCount: 1 };
    }
    if (
      normalized.startsWith("update public.profiles")
      && normalized.includes("set display_name = $1")
    ) {
      const profileIndex = this.state.profiles.findIndex((candidate) =>
        candidate.id === values[1]
        && candidate.email === values[2]
        && candidate.display_name === values[3]
        && candidate.role === values[4]
        && candidate.active === true
      );
      if (profileIndex === -1) return { rows: [], rowCount: 0 };
      this.state.profiles[profileIndex] = {
        ...this.state.profiles[profileIndex],
        display_name: values[0]
      };
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("insert into public.identity_bindings")) {
      if (this.failBindingInsert) {
        throw new Error("simulated binding insert failure");
      }
      this.state.bindings.push({
        issuer: values[0],
        subject: values[1],
        profile_id: values[2],
        active: true,
        access_scope: "test_only",
        scope_ref: values[3]
      });
      return { rows: [], rowCount: 1 };
    }
    if (
      normalized.startsWith("update public.identity_bindings")
      && normalized.includes("set active = false")
    ) {
      const bindingIndex = this.state.bindings.findIndex((candidate) =>
        candidate.issuer === values[0]
        && candidate.subject === values[1]
        && candidate.profile_id === values[2]
        && candidate.active === true
        && candidate.access_scope === "test_only"
        && candidate.scope_ref === values[3]
      );
      if (bindingIndex === -1) return { rows: [], rowCount: 0 };
      this.state.bindings[bindingIndex] = {
        ...this.state.bindings[bindingIndex],
        active: false
      };
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("from public.profiles")) {
      return { rows: structuredClone(this.state.profiles), rowCount: this.state.profiles.length };
    }
    if (normalized.includes("from public.identity_bindings")) {
      return { rows: structuredClone(this.state.bindings), rowCount: this.state.bindings.length };
    }
    if (normalized.includes("from public.identity_enrollment_requests")) {
      return { rows: structuredClone(this.state.requests), rowCount: this.state.requests.length };
    }
    return { rows: [], rowCount: null };
  }
}

function verifiedIdentityCallback({ failOnCall = 0 } = {}) {
  let calls = 0;
  const callback = async () => {
    calls += 1;
    if (calls === failOnCall) {
      throw new SafeCliError("simulated identity drift");
    }
    return verifiedEvidence;
  };
  callback.calls = () => calls;
  return callback;
}

const missingProfileClient = new MockTransactionalClient();
await safeRejection(
  () => executeIdentityPlatformGuestPreBindingTransaction({
    client: missingProfileClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /darf kein Profil anlegen/u
);
assert.deepEqual(missingProfileClient.state, { profiles: [], bindings: [], requests: [] });
assert.ok(missingProfileClient.calls.some((call) => call.sql === "rollback"));
assert.ok(
  !missingProfileClient.calls.some((call) => call.sql.startsWith("insert into public.profiles"))
);

const newGuestClient = new MockTransactionalClient();
const newGuestPreviewLogs = [];
const newGuestPreview = await executeIdentityPlatformGuestProfileCreationTransaction({
  client: newGuestClient,
  document,
  fingerprint,
  apply: false,
  verifyIdentity: verifiedIdentityCallback(),
  onlineOnboardingGate,
  log: (value) => newGuestPreviewLogs.push(value)
});
assert.equal(newGuestPreview.action, "create_profile_and_binding");
assert.deepEqual(newGuestClient.state, { profiles: [], bindings: [], requests: [] });
const newGuestPreviewOutput = JSON.parse(newGuestPreviewLogs[0]);
assert.equal(newGuestPreviewOutput.operation, GUEST_ACCESS_CREATE_PROFILE_OPERATION);
assert.equal(newGuestPreviewOutput.profile_count, 0);
assert.equal(newGuestPreviewOutput.binding_count, 0);
assert.equal(newGuestPreviewOutput.profile_binding_complete, false);
assert.deepEqual(newGuestPreviewOutput.online_onboarding_gate, {
  gate_policy: "online-guest-onboarding",
  gate_fingerprint: onlineOnboardingGate.fingerprint,
  automated_backups: true,
  point_in_time_recovery: true,
  transaction_log_retention_days: 7,
  retained_backups: 14,
  retention_unit: "COUNT",
  latest_successful_automated_backup_id: "20300615110000",
  latest_successful_automated_backup_end_time: "2030-06-15T11:15:00.000Z"
});

const newGuestApplyLogs = [];
const newGuestFinalState = await executeIdentityPlatformGuestProfileCreationTransaction({
  client: newGuestClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: newGuestPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  onlineOnboardingGate,
  log: (value) => newGuestApplyLogs.push(value)
});
assert.equal(newGuestFinalState.action, "unchanged");
assert.deepEqual(newGuestClient.state.profiles, [profile]);
assert.deepEqual(newGuestClient.state.bindings, [binding]);
assert.equal(
  newGuestClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.profiles")
  ).length,
  1
);
assert.equal(
  newGuestClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.identity_bindings")
  ).length,
  1
);
const newGuestApplyOutput = JSON.parse(newGuestApplyLogs[0]);
assert.equal(newGuestApplyOutput.result, "create_profile_and_binding_completed");
assert.equal(newGuestApplyOutput.profile_count, 1);
assert.equal(newGuestApplyOutput.binding_count, 1);
assert.equal(newGuestApplyOutput.profile_binding_complete, true);
assert.equal(newGuestApplyOutput.database_transaction_committed, true);

const newGuestNoopPreviewLogs = [];
const newGuestTransactionNoopPreview =
  await executeIdentityPlatformGuestProfileCreationTransaction({
    client: newGuestClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: (value) => newGuestNoopPreviewLogs.push(value)
  });
assert.equal(newGuestTransactionNoopPreview.action, "unchanged");
assert.equal(JSON.parse(newGuestNoopPreviewLogs[0]).profile_binding_complete, true);

const newGuestNoopApplyLogs = [];
await executeIdentityPlatformGuestProfileCreationTransaction({
  client: newGuestClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: newGuestTransactionNoopPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => newGuestNoopApplyLogs.push(value)
});
assert.equal(
  newGuestClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.profiles")
  ).length,
  1
);
assert.equal(
  newGuestClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.identity_bindings")
  ).length,
  1
);
assert.equal(JSON.parse(newGuestNoopApplyLogs[0]).result, "unchanged");

for (const partialState of [
  { profiles: [profile] },
  { bindings: [binding] },
  { profiles: [{ ...profile, team: "unexpected-team" }], bindings: [binding] }
]) {
  const partialClient = new MockTransactionalClient(partialState);
  await safeRejection(
    () => executeIdentityPlatformGuestProfileCreationTransaction({
      client: partialClient,
      document,
      fingerprint,
      apply: false,
      verifyIdentity: verifiedIdentityCallback(),
      log: () => {}
    }),
    /vollstaendig leeren Zielzustand|exakten vollstaendigen/u
  );
  assert.ok(partialClient.calls.some((call) => call.sql === "rollback"));
  assert.ok(
    !partialClient.calls.some((call) => call.sql.startsWith("insert into public.profiles"))
  );
  assert.ok(
    !partialClient.calls.some(
      (call) => call.sql.startsWith("insert into public.identity_bindings")
    )
  );
}

const newGuestIdentityDriftClient = new MockTransactionalClient();
await safeRejection(
  () => executeIdentityPlatformGuestProfileCreationTransaction({
    client: newGuestIdentityDriftClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: newGuestCreationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback({ failOnCall: 2 }),
    log: () => {}
  }),
  /simulated identity drift/u
);
assert.deepEqual(
  newGuestIdentityDriftClient.state,
  { profiles: [], bindings: [], requests: [] }
);
assert.ok(newGuestIdentityDriftClient.calls.some((call) => call.sql === "rollback"));
assert.ok(!newGuestIdentityDriftClient.calls.some((call) => call.sql === "commit"));

const newGuestBindingInsertFailureClient = new MockTransactionalClient({
  failBindingInsert: true
});
await assert.rejects(
  () => executeIdentityPlatformGuestProfileCreationTransaction({
    client: newGuestBindingInsertFailureClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: newGuestCreationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /simulated binding insert failure/u
);
assert.deepEqual(
  newGuestBindingInsertFailureClient.state,
  { profiles: [], bindings: [], requests: [] },
  "Ein fehlgeschlagener Binding-INSERT muss das zuvor angelegte Profil zurueckrollen."
);
assert.ok(
  newGuestBindingInsertFailureClient.calls.some(
    (call) => call.sql.startsWith("insert into public.profiles")
  )
);
assert.ok(
  newGuestBindingInsertFailureClient.calls.some(
    (call) => call.sql.startsWith("insert into public.identity_bindings")
  )
);
assert.ok(newGuestBindingInsertFailureClient.calls.some((call) => call.sql === "rollback"));
assert.ok(!newGuestBindingInsertFailureClient.calls.some((call) => call.sql === "commit"));

const newGuestStalePreviewClient = new MockTransactionalClient();
await safeRejection(
  () => executeIdentityPlatformGuestProfileCreationTransaction({
    client: newGuestStalePreviewClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: newGuestNoopPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /current_state_fingerprint/u
);
assert.deepEqual(
  newGuestStalePreviewClient.state,
  { profiles: [], bindings: [], requests: [] }
);
assert.ok(newGuestStalePreviewClient.calls.some((call) => call.sql === "rollback"));
assert.ok(
  !newGuestStalePreviewClient.calls.some(
    (call) => call.sql.startsWith("insert into public.profiles")
  )
);

const existingProfileClient = new MockTransactionalClient({ profiles: [profile] });
const existingPreviewLogs = [];
const existingProfilePreview =
  await executeIdentityPlatformGuestPreBindingTransaction({
    client: existingProfileClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: (value) => existingPreviewLogs.push(value)
  });
assert.equal(existingProfilePreview.action, "create_binding");
const existingPreviewOutput = JSON.parse(existingPreviewLogs[0]);
assert.equal(existingPreviewOutput.profile_count, 1);
assert.equal(existingPreviewOutput.binding_count, 0);
assert.equal(existingPreviewOutput.profile_binding_complete, false);

const existingProfileApplyLogs = [];
await executeIdentityPlatformGuestPreBindingTransaction({
  client: existingProfileClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: existingProfilePreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => existingProfileApplyLogs.push(value)
});
assert.equal(existingProfileClient.state.profiles.length, 1);
assert.deepEqual(existingProfileClient.state.bindings, [binding]);
assert.equal(
  existingProfileClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.profiles")
  ).length,
  0
);
assert.equal(
  JSON.parse(existingProfileApplyLogs[0]).result,
  "create_binding_completed"
);

const unchangedClient = new MockTransactionalClient({
  profiles: [profile],
  bindings: [binding]
});
const unchangedPreview = await executeIdentityPlatformGuestPreBindingTransaction({
  client: unchangedClient,
  document,
  fingerprint,
  apply: false,
  verifyIdentity: verifiedIdentityCallback(),
  log: () => {}
});
const unchangedLogs = [];
await executeIdentityPlatformGuestPreBindingTransaction({
  client: unchangedClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: unchangedPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => unchangedLogs.push(value)
});
assert.equal(
  unchangedClient.calls.filter((call) => call.sql.startsWith("insert into")).length,
  0
);
assert.equal(JSON.parse(unchangedLogs[0]).result, "unchanged");

const displayNameReconciliationClient = new MockTransactionalClient({
  profiles: [profileWithPreviousDisplayName]
});
const displayNameReconciliationPreviewLogs = [];
const displayNameReconciliationPreview =
  await executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: displayNameReconciliationClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: (value) => displayNameReconciliationPreviewLogs.push(value)
  });
assert.equal(
  displayNameReconciliationPreview.action,
  "reconcile_profile_display_name_and_create_binding"
);
assert.deepEqual(
  displayNameReconciliationClient.state.profiles,
  [profileWithPreviousDisplayName]
);
const displayNameReconciliationPreviewOutput =
  JSON.parse(displayNameReconciliationPreviewLogs[0]);
assert.equal(
  displayNameReconciliationPreviewOutput.operation,
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION
);
assert.equal(
  displayNameReconciliationPreviewOutput.profile_display_name_matches_identity,
  false
);
assert.equal(displayNameReconciliationPreviewOutput.profile_binding_complete, false);

const displayNameReconciliationApplyLogs = [];
await executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
  client: displayNameReconciliationClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint:
    displayNameReconciliationPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => displayNameReconciliationApplyLogs.push(value)
});
assert.deepEqual(displayNameReconciliationClient.state.profiles, [profile]);
assert.deepEqual(displayNameReconciliationClient.state.bindings, [binding]);
assert.equal(
  displayNameReconciliationClient.calls.filter(
    (call) => call.sql.startsWith("update public.profiles")
  ).length,
  1
);
assert.equal(
  displayNameReconciliationClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.identity_bindings")
  ).length,
  1
);
const displayNameReconciliationApplyOutput =
  JSON.parse(displayNameReconciliationApplyLogs[0]);
assert.equal(
  displayNameReconciliationApplyOutput.result,
  "profile_display_name_reconciled_and_binding_created"
);
assert.equal(
  displayNameReconciliationApplyOutput.profile_display_name_matches_identity,
  true
);
assert.equal(displayNameReconciliationApplyOutput.profile_binding_complete, true);

const displayNameReconciliationNoopPreviewLogs = [];
const displayNameReconciliationNoopPreview =
  await executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: displayNameReconciliationClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: (value) => displayNameReconciliationNoopPreviewLogs.push(value)
  });
assert.equal(displayNameReconciliationNoopPreview.action, "unchanged");
const displayNameReconciliationNoopApplyLogs = [];
await executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
  client: displayNameReconciliationClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint:
    displayNameReconciliationNoopPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => displayNameReconciliationNoopApplyLogs.push(value)
});
assert.equal(
  displayNameReconciliationClient.calls.filter(
    (call) => call.sql.startsWith("update public.profiles")
  ).length,
  1
);
assert.equal(
  displayNameReconciliationClient.calls.filter(
    (call) => call.sql.startsWith("insert into public.identity_bindings")
  ).length,
  1
);
assert.equal(JSON.parse(displayNameReconciliationNoopApplyLogs[0]).result, "unchanged");

const driftingDisplayNameReconciliationClient = new MockTransactionalClient({
  profiles: [profileWithPreviousDisplayName]
});
await safeRejection(
  () => executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: driftingDisplayNameReconciliationClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint:
      displayNameReconciliationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback({ failOnCall: 2 }),
    log: () => {}
  }),
  /simulated identity drift/u
);
assert.deepEqual(
  driftingDisplayNameReconciliationClient.state,
  { profiles: [profileWithPreviousDisplayName], bindings: [], requests: [] }
);
assert.ok(
  !driftingDisplayNameReconciliationClient.calls.some(
    (call) => call.sql === "commit"
  )
);

const staleDisplayNameReconciliationClient = new MockTransactionalClient({
  profiles: [profileWithPreviousDisplayName]
});
await safeRejection(
  () => executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: staleDisplayNameReconciliationClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint:
      displayNameReconciliationNoopPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /current_state_fingerprint/u
);
assert.deepEqual(
  staleDisplayNameReconciliationClient.state,
  { profiles: [profileWithPreviousDisplayName], bindings: [], requests: [] }
);

const wrongDatabaseDisplayNameReconciliationClient = new MockTransactionalClient({
  profiles: [profileWithPreviousDisplayName],
  database: "other_database"
});
await safeRejection(
  () => executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: wrongDatabaseDisplayNameReconciliationClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint:
      displayNameReconciliationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /tatsaechliche Datenbankname/u
);
assert.deepEqual(
  wrongDatabaseDisplayNameReconciliationClient.state,
  { profiles: [profileWithPreviousDisplayName], bindings: [], requests: [] }
);

const revokeClient = new MockTransactionalClient({
  profiles: [profile],
  bindings: [binding]
});
const revokePreviewLogs = [];
const revokeTransactionPreview =
  await executeIdentityPlatformGuestRevocationTransaction({
    client: revokeClient,
    document,
    fingerprint,
    apply: false,
    verifyIdentity: verifiedIdentityCallback(),
    log: (value) => revokePreviewLogs.push(value)
  });
assert.equal(revokeTransactionPreview.action, "disable_binding");
assert.deepEqual(revokeClient.state.bindings, [binding]);
const revokePreviewOutput = JSON.parse(revokePreviewLogs[0]);
assert.equal(revokePreviewOutput.operation, GUEST_ACCESS_REVOKE_OPERATION);
assert.equal(revokePreviewOutput.result, "disable_binding");
assert.equal(revokePreviewOutput.active_binding_count, 1);
assert.equal(revokePreviewOutput.access_revoked, false);
assert.equal(revokePreviewOutput.database_transaction_committed, false);

const revokeApplyLogs = [];
const revokedState = await executeIdentityPlatformGuestRevocationTransaction({
  client: revokeClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: revokeTransactionPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => revokeApplyLogs.push(value)
});
assert.equal(revokedState.action, "unchanged");
assert.deepEqual(revokeClient.state.bindings, [revokedBinding]);
assert.equal(
  revokeClient.calls.filter(
    (call) => call.sql.startsWith("update public.identity_bindings")
  ).length,
  1
);
const revokeApplyOutput = JSON.parse(revokeApplyLogs[0]);
assert.equal(revokeApplyOutput.result, "disable_binding_completed");
assert.equal(revokeApplyOutput.active_binding_count, 0);
assert.equal(revokeApplyOutput.access_revoked, true);
assert.equal(revokeApplyOutput.database_transaction_committed, true);

const revokedNoopPreviewLogs = [];
const revokedNoopPreview = await executeIdentityPlatformGuestRevocationTransaction({
  client: revokeClient,
  document,
  fingerprint,
  apply: false,
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => revokedNoopPreviewLogs.push(value)
});
assert.equal(revokedNoopPreview.action, "unchanged");
assert.equal(JSON.parse(revokedNoopPreviewLogs[0]).access_revoked, true);
const revokedNoopApplyLogs = [];
await executeIdentityPlatformGuestRevocationTransaction({
  client: revokeClient,
  document,
  fingerprint,
  apply: true,
  confirmedCurrentStateFingerprint: revokedNoopPreview.currentStateFingerprint,
  expectedDatabase: "versorgungs_kompass",
  verifyIdentity: verifiedIdentityCallback(),
  log: (value) => revokedNoopApplyLogs.push(value)
});
assert.equal(
  revokeClient.calls.filter(
    (call) => call.sql.startsWith("update public.identity_bindings")
  ).length,
  1
);
assert.equal(JSON.parse(revokedNoopApplyLogs[0]).result, "unchanged");

const staleRevokeClient = new MockTransactionalClient({
  profiles: [profile],
  bindings: [revokedBinding]
});
await safeRejection(
  () => executeIdentityPlatformGuestRevocationTransaction({
    client: staleRevokeClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: revokePlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /current_state_fingerprint/u
);
assert.deepEqual(staleRevokeClient.state.bindings, [revokedBinding]);

const driftClient = new MockTransactionalClient({ profiles: [profile] });
await safeRejection(
  () => executeIdentityPlatformGuestPreBindingTransaction({
    client: driftClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: liveExistingProfilePlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback({ failOnCall: 2 }),
    log: () => {}
  }),
  /simulated identity drift/u
);
assert.deepEqual(driftClient.state, { profiles: [profile], bindings: [], requests: [] });
assert.ok(driftClient.calls.some((call) => call.sql === "rollback"));
assert.ok(!driftClient.calls.some((call) => call.sql === "commit"));

const stalePreviewClient = new MockTransactionalClient({ profiles: [profile] });
await safeRejection(
  () => executeIdentityPlatformGuestPreBindingTransaction({
    client: stalePreviewClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: unchangedPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  /current_state_fingerprint/u
);
assert.equal(stalePreviewClient.state.bindings.length, 0);

const commitFailureClient = new MockTransactionalClient({
  profiles: [profile],
  failCommit: true
});
await assert.rejects(
  () => executeIdentityPlatformGuestPreBindingTransaction({
    client: commitFailureClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: liveExistingProfilePlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof GuestAccessCommitOutcomeUnknownError);
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /Nicht blind wiederholen/u);
    assert.doesNotMatch(error.message, new RegExp(document.email, "u"));
    assert.doesNotMatch(error.message, new RegExp(document.uid, "u"));
    return true;
  }
);

const newGuestCommitFailureClient = new MockTransactionalClient({
  failCommit: true
});
await assert.rejects(
  () => executeIdentityPlatformGuestProfileCreationTransaction({
    client: newGuestCommitFailureClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: newGuestCreationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof GuestAccessProfileCreationCommitOutcomeUnknownError);
    assert.equal(error.exitCode, 1);
    assert.equal(error.code, "GUEST_ACCESS_PROFILE_CREATION_COMMIT_OUTCOME_UNKNOWN");
    assert.match(error.message, /Nicht blind wiederholen/u);
    assert.match(error.message, /--create-profile-and-prebind-Preview/u);
    assert.doesNotMatch(error.message, new RegExp(document.email, "u"));
    assert.doesNotMatch(error.message, new RegExp(document.uid, "u"));
    return true;
  }
);
assert.ok(
  !newGuestCommitFailureClient.calls.some((call) => call.sql === "rollback"),
  "Ein unbekanntes COMMIT-Ergebnis darf nicht nachtraeglich zurueckgerollt werden."
);

const displayNameReconciliationCommitFailureClient = new MockTransactionalClient({
  profiles: [profileWithPreviousDisplayName],
  failCommit: true
});
await assert.rejects(
  () => executeIdentityPlatformGuestProfileDisplayNameReconciliationTransaction({
    client: displayNameReconciliationCommitFailureClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint:
      displayNameReconciliationPlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  (error) => {
    assert.ok(
      error
        instanceof GuestAccessProfileDisplayNameReconciliationCommitOutcomeUnknownError
    );
    assert.equal(
      error.code,
      "GUEST_ACCESS_PROFILE_DISPLAY_NAME_RECONCILIATION_COMMIT_OUTCOME_UNKNOWN"
    );
    assert.match(error.message, /Nicht blind wiederholen/u);
    assert.match(
      error.message,
      /--reconcile-profile-display-name-and-prebind-Preview/u
    );
    assert.doesNotMatch(error.message, new RegExp(document.email, "u"));
    assert.doesNotMatch(error.message, new RegExp(document.uid, "u"));
    assert.doesNotMatch(
      error.message,
      new RegExp(profileWithPreviousDisplayName.display_name, "u")
    );
    return true;
  }
);
assert.ok(
  !displayNameReconciliationCommitFailureClient.calls.some(
    (call) => call.sql === "rollback"
  ),
  "Ein unbekanntes Reconcile-COMMIT-Ergebnis darf nicht zurueckgerollt werden."
);

const revokeCommitFailureClient = new MockTransactionalClient({
  profiles: [profile],
  bindings: [binding],
  failCommit: true
});
await assert.rejects(
  () => executeIdentityPlatformGuestRevocationTransaction({
    client: revokeCommitFailureClient,
    document,
    fingerprint,
    apply: true,
    confirmedCurrentStateFingerprint: revokePlan.currentStateFingerprint,
    expectedDatabase: "versorgungs_kompass",
    verifyIdentity: verifiedIdentityCallback(),
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof GuestAccessRevocationCommitOutcomeUnknownError);
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /Nicht blind.*wiederholen/u);
    assert.doesNotMatch(error.message, new RegExp(document.email, "u"));
    assert.doesNotMatch(error.message, new RegExp(document.uid, "u"));
    return true;
  }
);

for (const output of [
  ...newGuestPreviewLogs,
  ...newGuestApplyLogs,
  ...newGuestNoopPreviewLogs,
  ...newGuestNoopApplyLogs,
  ...existingPreviewLogs,
  ...existingProfileApplyLogs,
  ...unchangedLogs,
  ...displayNameReconciliationPreviewLogs,
  ...displayNameReconciliationApplyLogs,
  ...displayNameReconciliationNoopPreviewLogs,
  ...displayNameReconciliationNoopApplyLogs,
  ...revokePreviewLogs,
  ...revokeApplyLogs,
  ...revokedNoopPreviewLogs,
  ...revokedNoopApplyLogs
]) {
  const parsed = JSON.parse(output);
  assert.equal(parsed.schema_version, 1);
  assert.ok([
    GUEST_ACCESS_CREATE_PROFILE_OPERATION,
    GUEST_ACCESS_OPERATION,
    GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION,
    GUEST_ACCESS_REVOKE_OPERATION
  ].includes(parsed.operation));
  assert.equal(parsed.identity_platform_account_verified, true);
  assert.equal(parsed.provider_verified, "password");
  assert.equal(parsed.subject_namespace_verified, true);
  assert.equal(parsed.access_scope_verified, "test_only");
  assert.match(parsed.input_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.match(parsed.current_state_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.match(parsed.expected_state_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.doesNotMatch(output, /https?:\/\//iu, "Maschinenausgabe enthaelt einen Link.");
  for (const forbidden of [
    document.email,
    document.uid,
    document.profile_id,
    document.display_name,
    profileWithPreviousDisplayName.display_name,
    subject,
    document.scope_ref
  ]) {
    assert.ok(!output.includes(forbidden), "Maschinenausgabe enthaelt geschuetzte Werte.");
  }
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vk-guest-prebinding-"));
const repository = path.join(temporaryRoot, "repo");
const protectedDirectory = path.join(temporaryRoot, "protected");
await fs.mkdir(repository, { mode: 0o700 });
await fs.mkdir(protectedDirectory, { mode: 0o700 });
await fs.chmod(protectedDirectory, 0o700);
const inputPath = path.join(protectedDirectory, "guest-access.json");
await fs.writeFile(inputPath, `${JSON.stringify(documentValue)}\n`, { mode: 0o600 });
await fs.chmod(inputPath, 0o600);
assert.deepEqual(
  await loadProtectedIdentityPlatformGuestAccessDocument(inputPath, { repository }),
  document
);
await safeRejection(
  () => identityPlatformGuestAccessMain(
    ["--input", inputPath],
    {
      PRE_GEMATIK_ACCESS_REPOSITORY_ROOT: repository,
      PRE_GEMATIK_ACCESS_EXPECTED_PROJECT_ID: "other-project-123"
    }
  ),
  /erwarteten Zielprojekt/u
);

const insideRepositoryInput = path.join(repository, "guest-access.json");
await fs.writeFile(
  insideRepositoryInput,
  `${JSON.stringify(documentValue)}\n`,
  { mode: 0o600 }
);
await safeRejection(
  () => loadProtectedIdentityPlatformGuestAccessDocument(
    insideRepositoryInput,
    { repository }
  ),
  /ausserhalb des Git-Worktrees/u
);
if (process.platform !== "win32") {
  const weakPermissionsInput = path.join(protectedDirectory, "weak.json");
  await fs.writeFile(
    weakPermissionsInput,
    `${JSON.stringify(documentValue)}\n`,
    { mode: 0o644 }
  );
  await fs.chmod(weakPermissionsInput, 0o644);
  await safeRejection(
    () => loadProtectedIdentityPlatformGuestAccessDocument(
      weakPermissionsInput,
      { repository }
    ),
    /owner-only/u
  );
}

const managedTargetUrl =
  "postgresql://access-admin:private-secret@127.0.0.1:5433/versorgungs_kompass?sslmode=disable";
const syntheticGateResult = Object.freeze({
  ok: true,
  fingerprint: `sha256:${"c".repeat(64)}`,
  targetDatabase: Object.freeze({
    connectionName: `${document.project_id}:example-region1:example-private-postgres`
  })
});
const stopAfterGate = new Error("stop after selected GCP gate");

for (const invalidOnlineGate of [
  syntheticGateResult,
  { ...syntheticGateResult, gatePolicy: "maintenance-migration" },
  { ...syntheticGateResult, gatePolicy: "online-guest-onboarding" },
  {
    ...syntheticGateResult,
    gatePolicy: "online-guest-onboarding",
    backupPosture: {
      automatedBackups: true,
      pointInTimeRecovery: false
    }
  },
  {
    ...syntheticGateResult,
    gatePolicy: "online-guest-onboarding",
    backupPosture: {
      automatedBackups: true,
      pointInTimeRecovery: true,
      transactionLogRetentionDays: 7,
      retainedBackups: 0,
      retentionUnit: "COUNT",
      latestSuccessfulAutomatedBackupId: "20300615110000",
      latestSuccessfulAutomatedBackupEndTime: "2030-06-15T11:15:00.000Z"
    }
  }
]) {
  await safeRejection(
    () => assertFreshGcpOnlineOnboardingGate(
      {},
      async () => invalidOnlineGate
    ),
    /Online-Neunutzeranlage erfordert/u
  );
}
assert.deepEqual(
  await assertFreshGcpOnlineOnboardingGate(
    {},
    async () => ({
      ...syntheticGateResult,
      gatePolicy: "online-guest-onboarding",
      backupPosture: onlineOnboardingGate.backupPosture
    })
  ),
  {
    ...syntheticGateResult,
    gatePolicy: "online-guest-onboarding",
    backupPosture: onlineOnboardingGate.backupPosture
  }
);

async function selectedManagedGate(argumentsList) {
  const calls = { migration: 0, online: 0 };
  await assert.rejects(
    identityPlatformGuestAccessMain(
      argumentsList,
      {
        PRE_GEMATIK_ACCESS_REPOSITORY_ROOT: repository,
        PRE_GEMATIK_ACCESS_EXPECTED_PROJECT_ID: document.project_id,
        PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL: managedTargetUrl,
        PRE_GEMATIK_ACCESS_TARGET_SHA256: identityTargetFingerprint(managedTargetUrl),
        CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private-ip"
      },
      {
        authFactory: async () => ({}),
        gcpGate: async () => {
          calls.migration += 1;
          return syntheticGateResult;
        },
        onlineOnboardingGcpGate: async () => {
          calls.online += 1;
          return {
            ...syntheticGateResult,
            gatePolicy: "online-guest-onboarding",
            backupPosture: onlineOnboardingGate.backupPosture
          };
        },
        proxyFactory: async () => {
          throw stopAfterGate;
        },
        proxyVerifier: () => {}
      }
    ),
    (error) => error === stopAfterGate
  );
  return calls;
}

assert.deepEqual(
  await selectedManagedGate([
    "--input", inputPath,
    "--create-profile-and-prebind"
  ]),
  { migration: 0, online: 1 },
  "Ausschliesslich die atomare Neunutzeranlage muss das Online-Onboarding-Gate nutzen."
);
for (const modeArguments of [
  [],
  ["--reconcile-profile-display-name-and-prebind"],
  ["--revoke"]
]) {
  assert.deepEqual(
    await selectedManagedGate(["--input", inputPath, ...modeArguments]),
    { migration: 1, online: 0 },
    "Bestands-, Reconcile- und Revoke-Modi muessen beim Migrationsgate bleiben."
  );
}
await fs.rm(temporaryRoot, { recursive: true, force: true });

assert.doesNotMatch(
  operatorSource,
  /accounts:sendOobCode|generatePasswordResetLink|sendPasswordResetEmail|createUser\s*\(/u
);
assert.doesNotMatch(
  operatorSource,
  /update\s+public\.identity_enrollment_requests/iu
);
assert.match(
  operatorSource,
  /--create-profile-and-prebind/u
);
assert.match(
  operatorSource,
  /CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST/u
);
assert.match(
  operatorSource,
  /RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST/u
);
assert.match(
  operatorSource,
  /--reconcile-profile-display-name-and-prebind/u
);
assert.match(
  operatorSource,
  /update public\.profiles[\s\S]*set display_name = \$1[\s\S]*and display_name = \$4/iu
);
assert.match(operatorSource, /insert\s+into\s+public\.profiles/iu);
const defaultPrebindingSource = operatorSource.slice(
  operatorSource.indexOf("export async function executeIdentityPlatformGuestPreBindingTransaction"),
  operatorSource.indexOf("export async function executeIdentityPlatformGuestProfileCreationTransaction")
);
assert.ok(defaultPrebindingSource.length > 0);
assert.doesNotMatch(defaultPrebindingSource, /insert\s+into\s+public\.profiles/iu);
assert.match(operatorSource, /begin isolation level serializable/u);
assert.match(operatorSource, /pg_advisory_xact_lock/u);
assert.match(operatorSource, /access_scope,\s*scope_ref\)[\s\S]*'test_only'/u);
assert.match(operatorSource, /securetoken\.google\.com\/\$\{projectId\}:\$\{uid\}/u);
assert.match(operatorSource, /getUser\(document\.uid\)/u);
assert.match(operatorSource, /getUserByEmail\(document\.email\)/u);

console.log(
  "Identity Platform Gast-Pre-Binding OK: password-only Readback, kontrolliertes "
  + "Bestandsprofil, atomarer Anzeigename-Abgleich, explizite Neunutzeranlage, "
  + "test_only-Binding, Widerruf und exakter No-op sind fail-closed."
);
