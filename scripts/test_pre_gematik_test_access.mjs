#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_ACCESS_ADMIN_ROLE,
  accessDocumentFingerprint,
  buildAccessPlan,
  parseAccessArguments,
  validateAccessAdministrationPrivileges,
  validateAccessAdministrationSession,
  validateAccessConfirmations,
  validateAccessDocument
} from "./provision_pre_gematik_test_access.mjs";
import {
  parseTestAccessOperatorArguments,
  prepareTestAccessOperatorFiles
} from "./prepare_pre_gematik_test_access_operator.mjs";
import {
  EXPECTED_IAP_ISSUER,
  SafeCliError
} from "./provision_iap_identity_bindings.mjs";

const root = new URL("../", import.meta.url);
const schemaSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/schema.sql", root),
  "utf8"
);
const migrationSql = await fs.readFile(
  new URL(
    "deploy/postgres/pre-gematik/migrations/202607240001_add_test_access_enrollment.sql",
    root
  ),
  "utf8"
);
const roleSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/access-enrollment-admin-role.sql", root),
  "utf8"
);
const legacyIdentityRoleSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/identity-admin-role.sql", root),
  "utf8"
);
const grantsSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/grants.sql", root),
  "utf8"
);

assert.match(schemaSql, /access_scope text not null default 'standard'/u);
assert.match(schemaSql, /constraint identity_bindings_access_scope_check check/u);
assert.match(schemaSql, /create table if not exists public\.identity_enrollment_requests/u);
assert.match(schemaSql, /unique \(issuer, subject\)/u);
assert.match(schemaSql, /create table if not exists public\.test_access_objects/u);
assert.match(schemaSql, /primary key \(entity_type, entity_id\)/u);
assert.match(migrationSql, /add column if not exists access_scope/u);
assert.match(
  migrationSql,
  /grant select \(request_id, issuer, subject, verified_email, status, expires_at\)/u
);
assert.match(migrationSql, /grant insert \(issuer, subject, verified_email, expires_at\)/u);
assert.match(migrationSql, /grant update \(last_seen_at\)/u);
assert.match(migrationSql, /grant select \(scope_ref, entity_type, entity_id\)/u);
assert.match(migrationSql, /grant insert \(scope_ref, entity_type, entity_id, created_by\)/u);
assert.match(migrationSql, /revoke insert, update on table public\.identity_bindings from vk_identity_admin/u);
assert.match(
  grantsSql,
  /grant select \(request_id, issuer, subject, verified_email, status, expires_at\)/u
);
assert.match(grantsSql, /grant select \(scope_ref, entity_type, entity_id\)/u);
assert.match(roleSql, /create role vk_access_enrollment_admin nologin noinherit/iu);
assert.match(roleSql, /grant insert \(id, email, display_name, initials, role, active, team, bio\)/u);
assert.match(roleSql, /grant update \(status, applied_profile_id\)/u);
assert.doesNotMatch(
  roleSql,
  /revoke all privileges on all functions in schema public from vk_access_enrollment_admin/iu
);
assert.match(
  roleSql,
  /routine\.proowner = \(\s*select oid from pg_catalog\.pg_roles where rolname = current_user\s*\)/u
);
assert.match(
  roleSql,
  /routine\.oid <> 'public\.pre_gematik_touch_updated_at\(\)'::pg_catalog\.regprocedure[\s\S]*has_function_privilege\('vk_access_enrollment_admin', routine\.oid, 'EXECUTE'\)/u
);
assert.doesNotMatch(
  roleSql,
  /grant[^;]*(?:delete|truncate|create|alter|drop)[^;]*vk_access_enrollment_admin/iu
);
assert.doesNotMatch(roleSql, /security\s+definer/iu);
assert.match(legacyIdentityRoleSql, /v2_access_contract_active/u);
assert.match(
  legacyIdentityRoleSql,
  /revoke insert, update on table public\.identity_bindings from vk_identity_admin/u
);
assert.match(
  legacyIdentityRoleSql,
  /grant update \(subject\) on table public\.identity_bindings to vk_identity_admin/u
);

const issuer = EXPECTED_IAP_ISSUER;
const requestId = "5de9a765-2b17-4f1f-89a9-2edc6eb0c7f8";
const existingBinding = {
  issuer,
  subject: "owner-subject",
  profile_id: "owner-profile",
  active: true,
  access_scope: "standard",
  scope_ref: null
};
const enrollment = {
  request_id: requestId,
  expected_email: "tester@example.invalid",
  profile: {
    id: "test-profile-viewer",
    email: "tester@example.invalid",
    display_name: "Test Person",
    initials: "TP",
    role: "viewer",
    active: true,
    team: "Externer Test",
    bio: null
  },
  binding: {
    active: true,
    access_scope: "test_only",
    scope_ref: "pre-gematik-external-test-2026-08"
  }
};

function accessDocument({ bindings = [existingBinding], enrollments = [enrollment] } = {}) {
  return validateAccessDocument({ version: 2, bindings, enrollments });
}

function safeFailure(action, pattern) {
  assert.throws(action, (error) => error instanceof SafeCliError && pattern.test(error.message));
}

const canonical = accessDocument();
assert.equal(canonical.version, 2);
assert.match(accessDocumentFingerprint(canonical), /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  accessDocumentFingerprint(canonical),
  accessDocumentFingerprint(validateAccessDocument({
    version: 2,
    bindings: [...canonical.bindings].reverse(),
    enrollments: [...canonical.enrollments].reverse()
  }))
);
safeFailure(
  () => accessDocument({
    enrollments: [{ ...enrollment, profile: { ...enrollment.profile, role: "admin" } }]
  }),
  /viewer oder editor/u
);
safeFailure(
  () => accessDocument({
    enrollments: [{
      ...enrollment,
      binding: { active: true, access_scope: "standard", scope_ref: null }
    }]
  }),
  /test_only/u
);
safeFailure(
  () => accessDocument({
    bindings: [{ ...existingBinding, access_scope: "standard", scope_ref: "must-be-null" }]
  }),
  /scope_ref/u
);
safeFailure(
  () => accessDocument({
    bindings: [{ ...existingBinding, access_scope: "test_only", scope_ref: "test-scope" }]
  }),
  /bereits bestehende standard-Bindung/u
);
safeFailure(
  () => accessDocument({
    enrollments: [{ ...enrollment, expected_email: "other@example.invalid" }]
  }),
  /widerspruechliche/u
);

const ownerProfile = {
  id: "owner-profile",
  email: "owner@example.invalid",
  display_name: "Owner",
  initials: "O",
  role: "admin",
  active: true,
  team: null,
  bio: null
};
const pendingRequest = {
  request_id: requestId,
  issuer,
  subject: "tester-subject",
  verified_email: "tester@example.invalid",
  status: "pending",
  expires_at: new Date("2026-07-26T12:00:00Z"),
  applied_profile_id: null
};
const previewPlan = buildAccessPlan(
  canonical,
  [ownerProfile],
  [pendingRequest],
  [existingBinding],
  new Date("2026-07-24T12:00:00Z")
);
assert.equal(previewPlan.profileInserts.length, 1);
assert.equal(previewPlan.profileUpdates.length, 0);
assert.equal(previewPlan.bindingInserts.length, 1);
assert.equal(previewPlan.bindingUpdates.length, 0);
assert.equal(previewPlan.requestUpdates.length, 1);
assert.equal(previewPlan.requestedCount, 2);
assert.equal(previewPlan.activeRequestedCount, 2);
assert.equal(previewPlan.unknownExistingCount, 0);
assert.match(previewPlan.expectedStateFingerprint, /^sha256:[a-f0-9]{64}$/u);

safeFailure(
  () => buildAccessPlan(
    validateAccessDocument({
      version: 2,
      bindings: [{
        ...existingBinding,
        subject: "new-direct-subject"
      }],
      enrollments: []
    }),
    [ownerProfile],
    [],
    [],
    new Date("2026-07-24T12:00:00Z")
  ),
  /keine neue Direktbindung/u
);
safeFailure(
  () => buildAccessPlan(
    validateAccessDocument({
      version: 2,
      bindings: [existingBinding],
      enrollments: []
    }),
    [ownerProfile],
    [],
    [{
      ...existingBinding,
      access_scope: "test_only",
      scope_ref: "legacy-test-scope"
    }],
    new Date("2026-07-24T12:00:00Z")
  ),
  /weder Profil noch access_scope oder scope_ref/u
);

safeFailure(
  () => buildAccessPlan(
    canonical,
    [ownerProfile],
    [{ ...pendingRequest, expires_at: new Date("2026-07-23T12:00:00Z") }],
    [existingBinding],
    new Date("2026-07-24T12:00:00Z")
  ),
  /abgelaufen/u
);
safeFailure(
  () => buildAccessPlan(
    canonical,
    [ownerProfile, { ...enrollment.profile }],
    [pendingRequest],
    [existingBinding],
    new Date("2026-07-24T12:00:00Z")
  ),
  /kein bereits vorhandenes Profil/u
);
safeFailure(
  () => buildAccessPlan(
    canonical,
    [ownerProfile],
    [pendingRequest],
    [
      existingBinding,
      {
        issuer,
        subject: "unknown",
        profile_id: "unknown-profile",
        active: false,
        access_scope: "standard",
        scope_ref: null
      }
    ],
    new Date("2026-07-24T12:00:00Z")
  ),
  /fehlen im v2-Vollzustand/u
);

const appliedBinding = {
  issuer,
  subject: "tester-subject",
  profile_id: enrollment.profile.id,
  ...enrollment.binding
};
const idempotentPlan = buildAccessPlan(
  canonical,
  [ownerProfile, { ...enrollment.profile }],
  [{
    ...pendingRequest,
    status: "applied",
    applied_profile_id: enrollment.profile.id
  }],
  [existingBinding, appliedBinding],
  new Date("2026-09-01T12:00:00Z")
);
assert.equal(idempotentPlan.profileInserts.length, 0);
assert.equal(idempotentPlan.profileUpdates.length, 0);
assert.equal(idempotentPlan.bindingInserts.length, 0);
assert.equal(idempotentPlan.bindingUpdates.length, 0);
assert.equal(idempotentPlan.requestUpdates.length, 0);
assert.equal(idempotentPlan.unchangedBindings.length, 2);

const safeSession = {
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
};
validateAccessAdministrationSession(safeSession);
safeFailure(
  () => validateAccessAdministrationSession({ ...safeSession, cloudsql_superuser_member: true }),
  /kurzlebigen/u
);

const safePrivileges = {
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
};
validateAccessAdministrationPrivileges(safePrivileges);
safeFailure(
  () => validateAccessAdministrationPrivileges({ ...safePrivileges, request_delete: true }),
  /Minimalrechte/u
);

const previewOptions = parseAccessArguments(["--input", "/protected/test-access-v2.json"]);
validateAccessConfirmations(previewOptions, canonical, accessDocumentFingerprint(canonical));
safeFailure(
  () => validateAccessConfirmations(
    parseAccessArguments([
      "--input", "/protected/test-access-v2.json",
      "--apply",
      "--confirm-environment", "pre-gematik",
      "--confirm-database", "versorgungs_kompass",
      "--confirm-operation", "APPLY_PRE_GEMATIK_TEST_ACCESS_V2",
      "--confirm-fingerprint", accessDocumentFingerprint(canonical),
      "--confirm-binding-count", "2",
      "--confirm-enrollment-count", "",
      "--confirm-active-binding-count", "2",
      "--allow-active-bindings"
    ]),
    canonical,
    accessDocumentFingerprint(canonical)
  ),
  /benoetigt einen Wert|Bestaetigungen/u
);

assert.equal(EXPECTED_ACCESS_ADMIN_ROLE, "vk_access_enrollment_admin");
const parsedPrepare = parseTestAccessOperatorArguments([
  "--output-directory", "/protected/run",
  "--project", "example-project-123",
  "--instance", "vk-pre-gematik-postgres",
  "--database", "versorgungs_kompass"
]);
assert.equal(parsedPrepare.database, "versorgungs_kompass");

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vk-test-access-operator-"));
const protectedDirectory = path.join(temporaryRoot, "protected");
const fakeRepository = path.join(temporaryRoot, "repository");
await fs.mkdir(protectedDirectory, { mode: 0o700 });
await fs.mkdir(fakeRepository, { mode: 0o700 });
try {
  const prepared = await prepareTestAccessOperatorFiles({
    outputDirectory: protectedDirectory,
    project: "example-project-123",
    instance: "vk-pre-gematik-postgres",
    database: "versorgungs_kompass"
  }, {
    repositoryRoot: fakeRepository,
    now: new Date("2026-07-24T12:00:00Z"),
    randomBytes: (size) => Buffer.alloc(size, 7),
    log: () => {}
  });
  for (const filePath of [
    prepared.createUserFlags,
    prepared.operatorEnvironment,
    prepared.operatorName,
    prepared.manifest
  ]) {
    const metadata = await fs.stat(filePath);
    assert.equal(metadata.mode & 0o777, 0o600);
  }
  const createFlags = JSON.parse(await fs.readFile(prepared.createUserFlags, "utf8"));
  assert.equal(createFlags["--database-roles"], EXPECTED_ACCESS_ADMIN_ROLE);
  const environmentText = await fs.readFile(prepared.operatorEnvironment, "utf8");
  assert.match(environmentText, /^PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL=/mu);
  assert.match(environmentText, /\nPRE_GEMATIK_ACCESS_TARGET_SHA256=sha256:[a-f0-9]{64}\n$/u);
  await assert.rejects(
    prepareTestAccessOperatorFiles({
      outputDirectory: protectedDirectory,
      project: "example-project-123",
      instance: "vk-pre-gematik-postgres",
      database: "versorgungs_kompass"
    }, {
      repositoryRoot: fakeRepository,
      now: new Date("2026-07-24T12:00:00Z"),
      randomBytes: (size) => Buffer.alloc(size, 7),
      log: () => {}
    }),
    (error) => error instanceof SafeCliError && /existiert bereits/u.test(error.message)
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("Pre-gematik test-access v2 contract tests passed.");
