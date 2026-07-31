#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  allowlistDocumentFingerprint,
  buildAllowlistPlan,
  validateAllowlistAdminPrivileges,
  validateAllowlistAdminSession,
  validateAllowlistDocument
} from "./provision_pre_gematik_test_access_allowlist.mjs";
import {
  EXPECTED_ALLOWLIST_ADMIN_ROLE,
  prepareAllowlistOperatorFiles
} from "./prepare_pre_gematik_test_access_allowlist_operator.mjs";
import { SafeCliError } from "./provision_iap_identity_bindings.mjs";

const root = new URL("../", import.meta.url);
const schemaSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/schema.sql", root),
  "utf8"
);
const migrationSql = await fs.readFile(
  new URL(
    "deploy/postgres/pre-gematik/migrations/202607250001_add_test_access_allowlist.sql",
    root
  ),
  "utf8"
);
const roleSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/access-allowlist-admin-role.sql", root),
  "utf8"
);
const grantsSql = await fs.readFile(
  new URL("deploy/postgres/pre-gematik/grants.sql", root),
  "utf8"
);

const functionPattern =
  /create or replace function public\.pre_gematik_consume_test_access_allowlist\([\s\S]*?\n\$pre_gematik_consume_allowlist\$;/u;
const schemaFunction = schemaSql.match(functionPattern)?.[0] || "";
const migrationFunction = migrationSql.match(functionPattern)?.[0] || "";
assert.ok(schemaFunction, "Schema muss die Consumption-Funktion enthalten.");
assert.equal(schemaFunction, migrationFunction, "Schema und Migration muessen exakt dieselbe Funktion definieren.");
assert.match(schemaSql, /create table if not exists public\.test_access_allowlist/u);
assert.match(schemaSql, /profile_id ~ '\^\[a-f0-9\]\{8\}.*-4/u);
assert.match(schemaSql, /role text not null check \(role in \('viewer', 'editor'\)\)/u);
assert.match(schemaSql, /test_access_allowlist_active_email_uidx/u);
assert.match(schemaFunction, /security definer\nset search_path = pg_catalog, public/u);
assert.doesNotMatch(schemaFunction, /\bexecute\b|\bformat\s*\(/iu, "Definer-Funktion darf kein dynamisches SQL enthalten.");
assert.doesNotMatch(schemaFunction, /\blike\b/iu, "E-Mail-Match muss exakte Gleichheit statt Pattern-Match verwenden.");
assert.match(schemaFunction, /allowlist\.email_normalized = normalized_email/u);
assert.match(schemaFunction, /translate\([\s\S]*'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[\s\S]*'abcdefghijklmnopqrstuvwxyz'/u);
const globalLockIndex = schemaFunction.indexOf(
  "hashtext('versorgungs-kompass:pre-gematik:identity-bindings')"
);
const subjectLockIndex = schemaFunction.indexOf("hashtextextended(p_issuer || chr(31) || p_subject, 0)");
assert.ok(globalLockIndex >= 0 && subjectLockIndex > globalLockIndex,
  "Consumption muss zuerst global und danach pro Subject sperren.");
assert.match(roleSql, /owner to vk_allowlist_executor/u);
assert.match(roleSql, /set local role vk_allowlist_executor/u);
assert.match(roleSql, /grant execute on function[\s\S]*to vk_app_runtime/u);
assert.match(roleSql, /revoke all on function[\s\S]*from public/u);
assert.match(roleSql, /prosecdef/u);
assert.match(roleSql, /search_path=pg_catalog, public/u);
assert.match(grantsSql, /revoke all privileges on table public\.test_access_allowlist/u);
assert.doesNotMatch(
  grantsSql,
  /grant[^;]+(?:select|insert|update|delete)[^;]+test_access_allowlist/iu,
  "Runtime darf keine direkten Allowlist-Tabellenrechte erhalten."
);

const activeEntry = {
  allowlist_id: "11111111-1111-4111-8111-111111111111",
  email_normalized: "tester@example.invalid",
  profile: {
    id: "22222222-2222-4222-8222-222222222222",
    display_name: "Test Person",
    initials: "TP",
    role: "viewer",
    active: true,
    team: "Externer Test",
    bio: null
  },
  access_scope: "test_only",
  scope_ref: "pre-gematik-external-test-2026-08",
  expires_at: "2026-09-30T16:00:00.000Z",
  desired_state: "active",
  revoke_reason: null
};

function document(entries = [activeEntry]) {
  return validateAllowlistDocument({ version: 1, entries });
}

function safeFailure(action, pattern) {
  assert.throws(action, (error) => error instanceof SafeCliError && pattern.test(error.message));
}

const canonical = document();
assert.match(allowlistDocumentFingerprint(canonical), /^sha256:[a-f0-9]{64}$/u);
safeFailure(
  () => document([{ ...activeEntry, email_normalized: "*@example.invalid" }]),
  /wildcard-frei|ungueltig/u
);
safeFailure(
  () => document([{ ...activeEntry, email_normalized: "TÉSTER@example.invalid" }]),
  /ungueltig/u
);
safeFailure(
  () => document([{ ...activeEntry, profile: { ...activeEntry.profile, id: "test-person-name" } }]),
  /profile\.id.*ungueltig/u
);
safeFailure(
  () => document([{ ...activeEntry, profile: { ...activeEntry.profile, role: "admin" } }]),
  /viewer oder editor/u
);
safeFailure(
  () => document([{ ...activeEntry, access_scope: "standard" }]),
  /test_only/u
);
safeFailure(
  () => document([{ ...activeEntry, desired_state: "revoked", revoke_reason: null }]),
  /revoke_reason/u
);

const insertPlan = buildAllowlistPlan(
  canonical,
  [],
  new Date("2026-07-25T12:00:00.000Z")
);
assert.equal(insertPlan.inserts.length, 1);
assert.equal(insertPlan.revocations.length, 0);
assert.equal(insertPlan.unknownCount, 0);

const activeRow = {
  allowlist_id: activeEntry.allowlist_id,
  email_normalized: activeEntry.email_normalized,
  profile_id: activeEntry.profile.id,
  display_name: activeEntry.profile.display_name,
  initials: activeEntry.profile.initials,
  role: activeEntry.profile.role,
  team: activeEntry.profile.team,
  bio: activeEntry.profile.bio,
  scope_ref: activeEntry.scope_ref,
  expires_at: new Date(activeEntry.expires_at),
  consumed_at: null,
  revoked_at: null,
  revoke_reason: null
};
const unchangedPlan = buildAllowlistPlan(canonical, [activeRow], new Date("2026-07-25T12:00:00.000Z"));
assert.equal(unchangedPlan.unchanged.length, 1);
assert.equal(unchangedPlan.currentStateFingerprint, unchangedPlan.expectedStateFingerprint);

const revokedEntry = {
  ...activeEntry,
  desired_state: "revoked",
  revoke_reason: "Freigabe widerrufen"
};
const revokePlan = buildAllowlistPlan(
  document([revokedEntry]),
  [activeRow],
  new Date("2026-07-25T12:00:00.000Z")
);
assert.equal(revokePlan.revocations.length, 1);
safeFailure(
  () => buildAllowlistPlan(
    document([{ ...activeEntry, profile: { ...activeEntry.profile, display_name: "Remap" } }]),
    [activeRow],
    new Date("2026-07-25T12:00:00.000Z")
  ),
  /umgebogen/u
);
safeFailure(
  () => buildAllowlistPlan(document([]), [activeRow], new Date("2026-07-25T12:00:00.000Z")),
  /fehlen im Vollzustand/u
);
safeFailure(
  () => buildAllowlistPlan(
    document([{ ...activeEntry, desired_state: "active" }]),
    [{ ...activeRow, consumed_at: new Date(), revoke_reason: null }],
    new Date("2026-07-25T12:00:00.000Z")
  ),
  /konsumierter.*unveraenderlich/u
);

const safeSession = {
  unassumed: true,
  login_can_login: true,
  login_inherit: true,
  login_superuser: false,
  login_create_database: false,
  login_create_role: false,
  login_replication: false,
  login_bypass_rls: false,
  admin_can_login: false,
  admin_inherit: false,
  admin_superuser: false,
  admin_create_database: false,
  admin_create_role: false,
  admin_replication: false,
  admin_bypass_rls: false,
  admin_member: true,
  cloudsql_superuser_member: false,
  postgres_member: false,
  login_membership_count: 1,
  login_admin_membership_count: 1,
  admin_parent_count: 0,
  admin_member_count: 2,
  expected_login_membership_count: 1,
  expected_owner_membership_count: 1
};
validateAllowlistAdminSession(safeSession);
safeFailure(
  () => validateAllowlistAdminSession({ ...safeSession, cloudsql_superuser_member: true }),
  /kurzlebigen/u
);
const safePrivileges = {
  expected_role: true,
  schema_usage: true,
  schema_create: false,
  allowlist_select: true,
  allowlist_insert: false,
  allowlist_update: false,
  allowlist_delete: false,
  email_insert: true,
  revoked_update: true,
  consumed_update: false,
  other_table_privileges: 0,
  sequence_privileges: 0
};
validateAllowlistAdminPrivileges(safePrivileges);
safeFailure(
  () => validateAllowlistAdminPrivileges({ ...safePrivileges, consumed_update: true }),
  /Minimalrechte/u
);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vk-allowlist-operator-"));
const protectedDirectory = path.join(tempRoot, "protected");
const fakeRepository = path.join(tempRoot, "repository");
await fs.mkdir(protectedDirectory, { mode: 0o700 });
await fs.mkdir(fakeRepository, { mode: 0o700 });
try {
  const prepared = await prepareAllowlistOperatorFiles({
    outputDirectory: protectedDirectory,
    project: "example-project-123",
    instance: "vk-pre-gematik-postgres",
    database: "versorgungs_kompass"
  }, {
    repositoryRoot: fakeRepository,
    now: new Date("2026-07-25T12:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, 3),
    log: () => {}
  });
  for (const filePath of Object.values(prepared).filter(
    (value) => typeof value === "string" && value.startsWith(protectedDirectory)
  )) {
    assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  }
  const flags = JSON.parse(await fs.readFile(prepared.createUserFlags, "utf8"));
  assert.equal(flags["--database-roles"], EXPECTED_ALLOWLIST_ADMIN_ROLE);
  assert.match(
    await fs.readFile(prepared.operatorEnvironment, "utf8"),
    /PRE_GEMATIK_ALLOWLIST_TARGET_SHA256=sha256:[a-f0-9]{64}/u
  );
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

console.log("Pre-gematik test-access allowlist contract tests passed.");
