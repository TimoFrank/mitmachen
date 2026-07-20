import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";

import {
  EXPECTED_IDENTITY_ADMIN_ROLE,
  EXPECTED_IAP_ISSUER,
  IdentityCommitOutcomeUnknownError,
  SafeCliError,
  assertFreshGcpMigrationGate,
  bindingDocumentFingerprint,
  buildIdentityBindingPlan,
  executeIdentityBindingTransaction,
  formatPlanSummary,
  identityManagedProxyRequired,
  identityRepositoryRoot,
  identityTargetFingerprint,
  loadProtectedBindingDocument,
  parseArguments,
  validateBindingDocument,
  validateExecutionConfirmations,
  validateIdentityAdministrationPrivileges,
  validateIdentityAdministrationSession,
  validateIdentityTargetFingerprint
} from "./provision_iap_identity_bindings.mjs";
import {
  CloudSqlManagedProxyError,
  assertManagedCloudSqlProxyMatchesGate,
  cloudSqlProxyArguments,
  cloudSqlProxyConnectMode,
  managedProxyClientOptions,
  startManagedCloudSqlAuthProxy,
  validateCloudSqlProxyExecutable
} from "./lib/cloud-sql-managed-proxy.mjs";
import {
  parseIdentityOperatorArguments,
  prepareIdentityOperatorFiles
} from "./prepare_pre_gematik_identity_operator.mjs";

const issuer = EXPECTED_IAP_ISSUER;
const identityAdminRoleSql = await fs.readFile(
  new URL("../deploy/postgres/pre-gematik/identity-admin-role.sql", import.meta.url),
  "utf8"
);

assert.match(identityAdminRoleSql, /relation\.relowner\s*=\s*\(/u,
  "Der Rollen-Bootstrap muss den bestehenden Objekt-Owner explizit verlangen.");
assert.match(identityAdminRoleSql, /rolcreaterole/iu,
  "Der Rollen-Bootstrap muss zusätzlich CREATEROLE verlangen.");
assert.match(identityAdminRoleSql, /create role vk_identity_admin nologin noinherit/iu);
assert.doesNotMatch(identityAdminRoleSql, /alter role vk_identity_admin/iu,
  "Cloud SQL's non-superuser object owner must not alter privileged role attributes.");
assert.match(identityAdminRoleSql, /vk_identity_admin has unsafe role attributes/iu,
  "Unsafe pre-existing role attributes must fail closed before privileges are reset.");
assert.match(identityAdminRoleSql, /with admin option, inherit false, set false/iu,
  "PostgreSQL 16's creator membership must be pinned to no SET and no INHERIT.");
assert.match(identityAdminRoleSql, /safe owner-only contract/iu,
  "The only persistent member must be the verified object owner.");
assert.match(identityAdminRoleSql, /unsafe_other_function_privileges/iu,
  "Every other effective public-function privilege must fail closed.");
assert.match(identityAdminRoleSql, /grant select on table public\.profiles to vk_identity_admin/iu);
assert.match(
  identityAdminRoleSql,
  /grant select, insert, update on table public\.identity_bindings to vk_identity_admin/iu
);
assert.doesNotMatch(identityAdminRoleSql, /grant[^;]*(?:delete|truncate|create|alter|drop)[^;]*vk_identity_admin/iu,
  "Die Identity-Admin-Rolle darf keine destruktiven oder DDL-Rechte erhalten.");
assert.doesNotMatch(identityAdminRoleSql, /security\s+definer/iu,
  "Der Rollen-Bootstrap darf keine privilegierte Funktion als Umgehungsweg anlegen.");
assert.doesNotMatch(identityAdminRoleSql, /(?:subject|profile_id)\s*=\s*'[^']+'/iu,
  "Der statische Rollen-Bootstrap darf keine umgebungsspezifischen Identity-Werte enthalten.");

const syntheticGateFingerprint = `sha256:${"9".repeat(64)}`;
const syntheticConnectionName = "example-target-project:example-region1:example-postgres";
const syntheticGateResult = {
  ok: true,
  fingerprint: syntheticGateFingerprint,
  targetDatabase: {
    connectionName: syntheticConnectionName
  }
};
assert.deepEqual(
  await assertFreshGcpMigrationGate({}, async () => syntheticGateResult),
  syntheticGateResult
);
await assert.rejects(
  assertFreshGcpMigrationGate({}, async () => ({ ok: false, fingerprint: "" })),
  (error) => error instanceof SafeCliError && /GCP-.+Backup-Gate/u.test(error.message)
);
assert.deepEqual(
  cloudSqlProxyArguments(syntheticConnectionName, "/tmp/vk-proxy-test/.s.PGSQL.5432"),
  [
    "--sql-data",
    "--run-connection-test",
    "--max-connections=8",
    "--max-sigterm-delay=0s",
    "--exit-zero-on-sigterm",
    "--quiet",
    `${syntheticConnectionName}?unix-socket-path=%2Ftmp%2Fvk-proxy-test%2F.s.PGSQL.5432`
  ]
);
assert.equal(cloudSqlProxyConnectMode({}), "sql-data");
assert.equal(
  cloudSqlProxyConnectMode({ CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private-ip" }),
  "private-ip"
);
assert.deepEqual(
  cloudSqlProxyArguments(
    syntheticConnectionName,
    "/tmp/vk-proxy-test/.s.PGSQL.5432",
    "private-ip"
  ),
  [
    "--private-ip",
    "--run-connection-test",
    "--max-connections=8",
    "--max-sigterm-delay=0s",
    "--exit-zero-on-sigterm",
    "--quiet",
    `${syntheticConnectionName}?unix-socket-path=%2Ftmp%2Fvk-proxy-test%2F.s.PGSQL.5432`
  ]
);
assert.throws(
  () => cloudSqlProxyConnectMode({ CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private" }),
  (error) => error instanceof CloudSqlManagedProxyError
    && error.code === "TARGET_PROXY_CONNECT_MODE_INVALID"
);
assert.throws(
  () => cloudSqlProxyArguments(
    syntheticConnectionName,
    "/tmp/vk-proxy-test/.s.PGSQL.5432",
    "auto"
  ),
  (error) => error instanceof CloudSqlManagedProxyError
    && error.code === "TARGET_PROXY_CONNECT_MODE_INVALID"
);
assert.throws(
  () => assertManagedCloudSqlProxyMatchesGate({ isActive: () => true }, syntheticGateResult),
  (error) => error instanceof CloudSqlManagedProxyError
    && error.code === "TARGET_MANAGED_PROXY_REQUIRED"
);

function document(bindings) {
  return validateBindingDocument({ version: 1, bindings });
}

function binding(subject, profileId, active = false) {
  return { issuer, subject, profile_id: profileId, active };
}

function assertSafeFailure(action, pattern) {
  assert.throws(action, (error) => error instanceof SafeCliError && pattern.test(error.message));
}

const safeIdentityAdminSession = Object.freeze({
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
  identity_admin_member: true,
  cloudsql_superuser_member: false,
  postgres_member: false,
  login_memberships: [EXPECTED_IDENTITY_ADMIN_ROLE],
  admin_parent_membership_count: 0,
  admin_member_count: 2,
  identity_objects_share_owner: true,
  admin_login_member_count: 1,
  admin_owner_member_count: 1,
  admin_unexpected_member_count: 0
});

const safeIdentityAdminPrivileges = Object.freeze({
  expected_admin_role: true,
  schema_usage: true,
  schema_create: false,
  profile_select: true,
  profile_insert: false,
  profile_update: false,
  profile_delete: false,
  profile_truncate: false,
  profile_references: false,
  profile_trigger: false,
  profile_column_insert: false,
  profile_column_update: false,
  profile_column_references: false,
  binding_select: true,
  binding_insert: true,
  binding_update: true,
  binding_delete: false,
  binding_truncate: false,
  binding_references: false,
  binding_trigger: false,
  binding_column_references: false,
  touch_function_execute: true,
  unsafe_other_table_privilege_count: 0,
  unsafe_sequence_privilege_count: 0,
  unsafe_other_function_privilege_count: 0
});

validateIdentityAdministrationSession(safeIdentityAdminSession);
validateIdentityAdministrationPrivileges(safeIdentityAdminPrivileges);
assertSafeFailure(
  () => validateIdentityAdministrationSession({
    ...safeIdentityAdminSession,
    cloudsql_superuser_member: true,
    login_memberships: ["cloudsqlsuperuser", EXPECTED_IDENTITY_ADMIN_ROLE]
  }),
  /exklusiven kurzlebigen/u
);
assertSafeFailure(
  () => validateIdentityAdministrationSession({
    ...safeIdentityAdminSession,
    login_inherits_roles: false,
    admin_login_member_count: 0,
    admin_unexpected_member_count: 1
  }),
  /exklusiven kurzlebigen/u
);
assertSafeFailure(
  () => validateIdentityAdministrationSession({
    ...safeIdentityAdminSession,
    admin_unexpected_member_count: 1
  }),
  /exklusiven kurzlebigen/u
);
assertSafeFailure(
  () => validateIdentityAdministrationSession({
    ...safeIdentityAdminSession,
    identity_objects_share_owner: false,
    admin_owner_member_count: 0
  }),
  /exklusiven kurzlebigen/u
);
assertSafeFailure(
  () => validateIdentityAdministrationPrivileges({
    ...safeIdentityAdminPrivileges,
    binding_delete: true
  }),
  /Minimalrechte/u
);
assertSafeFailure(
  () => validateIdentityAdministrationPrivileges({
    ...safeIdentityAdminPrivileges,
    unsafe_other_function_privilege_count: 1
  }),
  /Minimalrechte/u
);
assertSafeFailure(
  () => validateIdentityAdministrationPrivileges({
    ...safeIdentityAdminPrivileges,
    unsafe_other_table_privilege_count: 1
  }),
  /Minimalrechte/u
);

const unordered = document([
  binding("subject-z", "profile-z", false),
  binding("subject-a", "profile-a", true)
]);
const ordered = document([
  binding("subject-a", "profile-a", true),
  binding("subject-z", "profile-z", false)
]);
assert.equal(bindingDocumentFingerprint(unordered), bindingDocumentFingerprint(ordered));
assert.match(bindingDocumentFingerprint(ordered), /^sha256:[a-f0-9]{64}$/u);

assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [{ ...binding("subject-a", "profile-a"), email: "must-not-be-accepted@example.invalid" }]
}), /nicht erlaubte Felder/u);
assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [{ ...binding("subject-a", "profile-a"), active: "true" }]
}), /true oder false/u);
assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [{ ...binding("subject-a", "profile-a"), issuer: "http://not-secure.example.invalid" }]
}), /exakt dem freigegebenen IAP-Issuer/u);
assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [{ ...binding("subject-a", "profile-a"), issuer: "https://arbitrary-issuer.example.invalid" }]
}), /exakt dem freigegebenen IAP-Issuer/u);
assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [binding("subject-a", "profile-a"), binding("subject-b", "profile-a")]
}), /doppelte issuer\/profile_id/u);
assertSafeFailure(() => validateBindingDocument({
  version: 1,
  bindings: [binding("subject-a\nunsafe", "profile-a")]
}), /Steuerzeichen/u);

const previewOptions = parseArguments(["--input", "/protected/bindings.json"]);
validateExecutionConfirmations(previewOptions, ordered, bindingDocumentFingerprint(ordered));
assert.equal(identityManagedProxyRequired(previewOptions, {}), false);
assert.equal(
  identityManagedProxyRequired(previewOptions, { CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private-ip" }),
  true
);
assert.equal(identityManagedProxyRequired({ ...previewOptions, apply: true }, {}), true);
assert.equal(
  identityRepositoryRoot({ PRE_GEMATIK_IDENTITY_REPOSITORY_ROOT: "/workspace" }),
  "/workspace"
);
assertSafeFailure(
  () => identityRepositoryRoot({ PRE_GEMATIK_IDENTITY_REPOSITORY_ROOT: "relative/workspace" }),
  /normalisierter absoluter Pfad/u
);
assertSafeFailure(() => parseArguments(["--unexpected"]), /Unbekannte/u);
assertSafeFailure(() => validateExecutionConfirmations(
  parseArguments(["--input", "/protected/bindings.json", "--allow-active-bindings"]),
  ordered,
  bindingDocumentFingerprint(ordered)
), /nur zusammen mit --apply/u);
assertSafeFailure(() => validateExecutionConfirmations(
  parseArguments([
    "--input", "/protected/bindings.json",
    "--confirm-binding-count", "2",
    "--confirm-active-binding-count", "1"
  ]),
  ordered,
  bindingDocumentFingerprint(ordered)
), /nur zusammen mit --apply/u);

const fingerprint = bindingDocumentFingerprint(ordered);
const completeApplyOptions = parseArguments([
  "--input", "/protected/bindings.json",
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-database", "versorgungs_kompass",
  "--confirm-operation", "UPSERT_IAP_IDENTITY_BINDINGS",
  "--confirm-fingerprint", fingerprint,
  "--confirm-binding-count", "2",
  "--confirm-active-binding-count", "1",
  "--allow-active-bindings"
]);
validateExecutionConfirmations(completeApplyOptions, ordered, fingerprint);
assertSafeFailure(() => validateExecutionConfirmations(
  { ...completeApplyOptions, allowActiveBindings: false },
  ordered,
  fingerprint
), /--allow-active-bindings/u);
assertSafeFailure(() => validateExecutionConfirmations(
  { ...completeApplyOptions, confirmFingerprint: "sha256:wrong" },
  ordered,
  fingerprint
), /exakten Fingerprint/u);
assertSafeFailure(() => validateExecutionConfirmations(
  { ...completeApplyOptions, confirmBindingCount: "1" },
  ordered,
  fingerprint
), /exakte bestaetigte Gesamtzahl/u);
assertSafeFailure(() => validateExecutionConfirmations(
  { ...completeApplyOptions, confirmActiveBindingCount: "2" },
  ordered,
  fingerprint
), /exakte bestaetigte Zahl aktiver/u);

const targetUrl = "postgresql://identity-admin:private-secret@127.0.0.1:5433/versorgungs_kompass?sslmode=disable";
const targetFingerprint = identityTargetFingerprint(targetUrl);
const managedClientOptions = managedProxyClientOptions(
  targetUrl,
  "/tmp/vk-managed-proxy-client",
  "vk-managed-proxy-contract"
);
assert.equal(managedClientOptions.host, "/tmp/vk-managed-proxy-client");
assert.equal(managedClientOptions.port, 5432);
assert.equal(managedClientOptions.ssl, false);
assert.equal(managedClientOptions.database, "versorgungs_kompass");
assert.equal(managedClientOptions.application_name, "vk-managed-proxy-contract");
assert.match(targetFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  identityTargetFingerprint(targetUrl.replace("private-secret", "rotated-secret")),
  targetFingerprint,
  "Der Ziel-Pin darf Zugangsdaten nicht enthalten."
);
assert.equal(validateIdentityTargetFingerprint(targetUrl, targetFingerprint), targetFingerprint);
assertSafeFailure(
  () => validateIdentityTargetFingerprint(targetUrl, `sha256:${"0".repeat(64)}`),
  /geschuetzten Ziel-Fingerprint/u
);
assertSafeFailure(
  () => identityTargetFingerprint(
    "postgresql://identity-admin:private-secret@127.0.0.1:5433/versorgungs_kompass?sslmode=require"
  ),
  /loopback target.*sslmode=disable/iu
);
assertSafeFailure(
  () => identityTargetFingerprint(
    "postgresql://identity-admin:private-secret@database.example.invalid:5432/versorgungs_kompass?sslmode=disable"
  ),
  /remote target database.*sslmode=verify-full/iu
);
assertSafeFailure(
  () => identityTargetFingerprint(
    "postgresql://identity-admin:private-secret@database.example.invalid:5432/versorgungs_kompass?sslmode=verify-full&sslrootcert=relative-ca.crt"
  ),
  /absolute sslrootcert/iu
);

const existingRows = [
  binding("subject-a", "profile-a", false)
];
const planned = buildIdentityBindingPlan(ordered, [
  { id: "profile-a", active: true },
  { id: "profile-z", active: true }
], existingRows);
assert.equal(planned.inserts.length, 1);
assert.equal(planned.updates.length, 1);
assert.equal(planned.unchanged.length, 0);
assert.equal(planned.unknownExistingCount, 0);
assert.equal(planned.activeRequestedCount, 1);

const summary = formatPlanSummary(planned, fingerprint, false);
assert.match(summary, /mode=PREVIEW/u);
assert.match(summary, /unknown_existing_count=0/u);
assert.match(summary, new RegExp(fingerprint));
assert.doesNotMatch(summary, /subject-a|unknown-person|example\.invalid|profile-a/u);

assertSafeFailure(() => buildIdentityBindingPlan(ordered, [
  { id: "profile-a", active: true },
  { id: "profile-z", active: true }
], [
  binding("subject-a", "profile-a", false),
  binding("unknown-person@example.invalid", "profile-unknown", true)
]), /1 bestehende Bindungen fehlen im vollstaendigen Sollzustand/u);

assertSafeFailure(() => buildIdentityBindingPlan(
  document([binding("subject-a", "profile-new")]),
  [{ id: "profile-new", active: true }],
  [binding("subject-a", "profile-old")]
), /umgebogen/u);
assertSafeFailure(() => buildIdentityBindingPlan(
  document([binding("subject-new", "profile-a")]),
  [{ id: "profile-a", active: true }],
  [binding("subject-old", "profile-a")]
), /vollstaendigen Sollzustand/u);
assertSafeFailure(() => buildIdentityBindingPlan(
  document([binding("subject-a", "profile-missing")]),
  [],
  []
), /1 angeforderte Profile/u);
assertSafeFailure(() => buildIdentityBindingPlan(
  document([binding("subject-a", "profile-inactive", true)]),
  [{ id: "profile-inactive", active: false }],
  []
), /1 aktive Bindungen/u);

class MockClient {
  constructor({
    profiles,
    existing,
    failCommit = false,
    tamperFinalState = false,
    sessionState = safeIdentityAdminSession,
    privilegeState = safeIdentityAdminPrivileges
  }) {
    this.profiles = profiles.map((row) => ({ ...row }));
    this.existing = existing.map((row) => ({ ...row }));
    this.queries = [];
    this.failCommit = failCommit;
    this.tamperFinalState = tamperFinalState;
    this.sessionState = { ...sessionState };
    this.privilegeState = { ...privilegeState };
    this.bindingStateReads = 0;
  }

  async query(statement, parameters = []) {
    const sql = statement.replace(/\s+/gu, " ").trim().toLowerCase();
    this.queries.push({ sql, parameters });
    if (sql === "commit" && this.failCommit) {
      const error = new Error("synthetic transport loss after commit dispatch");
      error.code = "08006";
      throw error;
    }
    if (sql.startsWith("begin ") || sql.startsWith("set local ") || sql === "commit" || sql === "rollback") {
      return { rows: [], rowCount: null };
    }
    if (sql.includes("as login_memberships") && sql.includes("admin_member_count")) {
      return { rows: [{ ...this.sessionState }], rowCount: 1 };
    }
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (sql.includes("current_database()")) return { rows: [{ database_name: "versorgungs_kompass" }], rowCount: 1 };
    if (sql.includes("has_table_privilege")) {
      return {
        rows: [{ ...this.privilegeState }],
        rowCount: 1
      };
    }
    if (sql.startsWith("select id, active from public.profiles")) {
      const requested = new Set(parameters[0]);
      const rows = this.profiles.filter((profile) => requested.has(profile.id));
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("select issuer, subject, profile_id, active from public.identity_bindings")) {
      this.bindingStateReads += 1;
      const rows = this.existing.map((row) => ({ ...row }));
      if (this.tamperFinalState && this.bindingStateReads > 1 && rows.length > 0) {
        rows[0].active = !rows[0].active;
      }
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("insert into public.identity_bindings")) {
      this.existing.push({
        issuer: parameters[0],
        subject: parameters[1],
        profile_id: parameters[2],
        active: parameters[3]
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("update public.identity_bindings")) {
      const found = this.existing.find((row) => (
        row.issuer === parameters[0]
        && row.subject === parameters[1]
        && row.profile_id === parameters[2]
      ));
      if (!found) return { rows: [], rowCount: 0 };
      found.active = parameters[3];
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected mock query: ${sql}`);
  }
}

const transactionDocument = document([
  binding("private.person@example.invalid", "profile-a", false),
  binding("new-subject", "profile-b", false),
  binding("preserved-secret", "profile-preserved", true)
]);
const transactionFingerprint = bindingDocumentFingerprint(transactionDocument);
const previewClient = new MockClient({
  profiles: [
    { id: "profile-a", active: true },
    { id: "profile-b", active: true },
    { id: "profile-preserved", active: true }
  ],
  existing: [
    binding("private.person@example.invalid", "profile-a", true),
    binding("preserved-secret", "profile-preserved", true)
  ]
});
const previewLogs = [];
await executeIdentityBindingTransaction({
  client: previewClient,
  document: transactionDocument,
  fingerprint: transactionFingerprint,
  apply: false,
  expectedDatabase: "",
  log: (line) => previewLogs.push(line)
});
assert.equal(previewClient.existing.length, 2, "Preview darf den Mock-Datenbestand nicht veraendern.");
assert.ok(previewClient.queries.some(({ sql }) => sql === "rollback"));
assert.ok(previewClient.queries.some(({ sql }) => sql === "set local role vk_identity_admin"),
  "Preview und Apply muessen innerhalb der Transaktion auf die gepruefte NOLOGIN-Rolle reduzieren.");
assert.ok(!previewClient.queries.some(({ sql }) => /^(insert|update|delete) /u.test(sql)));
assert.equal(previewLogs.length, 1);
assert.doesNotMatch(previewLogs[0], /private\.person|new-subject|preserved-secret|profile-/u);

const overprivilegedLoginClient = new MockClient({
  profiles: [{ id: "profile-a", active: true }],
  existing: [],
  sessionState: {
    ...safeIdentityAdminSession,
    login_create_role: true,
    cloudsql_superuser_member: true,
    login_memberships: ["cloudsqlsuperuser", EXPECTED_IDENTITY_ADMIN_ROLE]
  }
});
await assert.rejects(
  executeIdentityBindingTransaction({
    client: overprivilegedLoginClient,
    document: document([binding("blocked-subject", "profile-a")]),
    fingerprint,
    apply: false,
    expectedDatabase: "",
    log: () => {}
  }),
  (error) => error instanceof SafeCliError && /exklusiven kurzlebigen/u.test(error.message)
);
assert.ok(overprivilegedLoginClient.queries.some(({ sql }) => sql === "rollback"));
assert.ok(!overprivilegedLoginClient.queries.some(({ sql }) => sql === "set local role vk_identity_admin"));

const overprivilegedRoleClient = new MockClient({
  profiles: [{ id: "profile-a", active: true }],
  existing: [],
  privilegeState: {
    ...safeIdentityAdminPrivileges,
    unsafe_other_table_privilege_count: 1
  }
});
await assert.rejects(
  executeIdentityBindingTransaction({
    client: overprivilegedRoleClient,
    document: document([binding("blocked-subject", "profile-a")]),
    fingerprint,
    apply: false,
    expectedDatabase: "",
    log: () => {}
  }),
  (error) => error instanceof SafeCliError && /Minimalrechte/u.test(error.message)
);
assert.ok(overprivilegedRoleClient.queries.some(({ sql }) => sql === "rollback"));
assert.ok(!overprivilegedRoleClient.queries.some(({ sql }) => (
  sql.startsWith("insert into public.identity_bindings")
  || sql.startsWith("update public.identity_bindings")
)));

const applyClient = new MockClient({
  profiles: [
    { id: "profile-a", active: true },
    { id: "profile-b", active: true },
    { id: "profile-preserved", active: true }
  ],
  existing: [
    binding("private.person@example.invalid", "profile-a", true),
    binding("preserved-secret", "profile-preserved", true)
  ]
});
const applyLogs = [];
await executeIdentityBindingTransaction({
  client: applyClient,
  document: transactionDocument,
  fingerprint: transactionFingerprint,
  apply: true,
  expectedDatabase: "versorgungs_kompass",
  log: (line) => applyLogs.push(line)
});
assert.equal(applyClient.existing.length, 3);
assert.ok(applyClient.existing.some((row) => row.subject === "preserved-secret" && row.active === true));
assert.ok(applyClient.queries.some(({ sql }) => sql === "commit"));
assert.equal(applyClient.bindingStateReads, 2,
  "Apply muss den vollstaendigen Bindungszustand vor und nach den Writes lesen.");
assert.ok(!applyClient.queries.some(({ sql }) => sql.startsWith("delete ")),
  "Das Werkzeug darf Bindungen nie implizit loeschen.");
assert.equal(applyLogs.length, 1);
assert.match(applyLogs[0], /mode=APPLY/u);
assert.doesNotMatch(applyLogs[0], /private\.person|new-subject|preserved-secret|profile-/u);

const unknownCommitClient = new MockClient({
  profiles: [
    { id: "profile-a", active: true },
    { id: "profile-b", active: true },
    { id: "profile-preserved", active: true }
  ],
  existing: [
    binding("private.person@example.invalid", "profile-a", true),
    binding("preserved-secret", "profile-preserved", true)
  ],
  failCommit: true
});
await assert.rejects(
  executeIdentityBindingTransaction({
    client: unknownCommitClient,
    document: transactionDocument,
    fingerprint: transactionFingerprint,
    apply: true,
    expectedDatabase: "versorgungs_kompass",
    log: () => {}
  }),
  (error) => {
    assert.ok(error instanceof IdentityCommitOutcomeUnknownError);
    assert.equal(error.code, "IDENTITY_COMMIT_OUTCOME_UNKNOWN");
    assert.match(error.message, /Keine automatische Wiederholung/u);
    assert.match(error.message, new RegExp(transactionFingerprint, "u"));
    assert.doesNotMatch(error.message, /private\.person|new-subject|preserved-secret|profile-/u);
    return true;
  }
);
const commitQueryIndex = unknownCommitClient.queries.findIndex(({ sql }) => sql === "commit");
assert.ok(commitQueryIndex >= 0);
assert.ok(!unknownCommitClient.queries.slice(commitQueryIndex + 1).some(({ sql }) => sql === "rollback"),
  "Nach unklarem COMMIT-Ausgang darf kein irrefuehrender Rollback oder automatischer Retry erfolgen.");

const tamperedFinalStateClient = new MockClient({
  profiles: [
    { id: "profile-a", active: true },
    { id: "profile-b", active: true },
    { id: "profile-preserved", active: true }
  ],
  existing: [
    binding("private.person@example.invalid", "profile-a", true),
    binding("preserved-secret", "profile-preserved", true)
  ],
  tamperFinalState: true
});
await assert.rejects(
  executeIdentityBindingTransaction({
    client: tamperedFinalStateClient,
    document: transactionDocument,
    fingerprint: transactionFingerprint,
    apply: true,
    expectedDatabase: "versorgungs_kompass",
    log: () => {}
  }),
  (error) => error instanceof SafeCliError && /vollstaendige Abschlusskontrolle/u.test(error.message)
);
assert.ok(tamperedFinalStateClient.queries.some(({ sql }) => sql === "rollback"));
assert.ok(!tamperedFinalStateClient.queries.some(({ sql }) => sql === "commit"),
  "Ein abweichender Endzustand muss vor COMMIT fail-closed abbrechen.");

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-iap-binding-test-"));
try {
  const preparedOptions = parseIdentityOperatorArguments([
    "--output-directory", temporaryDirectory,
    "--project", "example-target-project",
    "--instance", "example-postgres",
    "--database", "versorgungs_kompass"
  ]);
  let randomInvocation = 0;
  const credentialLogs = [];
  const preparedCredentials = await prepareIdentityOperatorFiles(preparedOptions, {
    repositoryRoot: process.cwd(),
    now: new Date("2026-07-20T12:00:00.000Z"),
    randomBytes(size) {
      randomInvocation += 1;
      return Buffer.alloc(size, randomInvocation === 1 ? 0x11 : 0x22);
    },
    log: (line) => credentialLogs.push(line)
  });
  const createUserFlags = JSON.parse(await fs.readFile(preparedCredentials.createUserFlagsPath, "utf8"));
  const protectedOperatorEnvironment = await fs.readFile(
    preparedCredentials.operatorEnvironmentPath,
    "utf8"
  );
  const protectedManifest = JSON.parse(await fs.readFile(preparedCredentials.manifestPath, "utf8"));
  assert.equal(createUserFlags["--database-roles"], EXPECTED_IDENTITY_ADMIN_ROLE);
  assert.equal(createUserFlags["--type"], "BUILT_IN");
  assert.equal("--cloudsqlsuperuser" in createUserFlags, false);
  assert.match(createUserFlags["--password"], /^[A-Za-z0-9_-]{64}$/u);
  assert.match(
    protectedOperatorEnvironment,
    /^PRE_GEMATIK_IDENTITY_ADMIN_DATABASE_URL=postgresql:\/\/vk_identity_operator_20260720_/u
  );
  assert.match(protectedOperatorEnvironment, /\nPRE_GEMATIK_IDENTITY_TARGET_SHA256=sha256:[a-f0-9]{64}\n$/u);
  assert.equal(protectedManifest.requiredRole, EXPECTED_IDENTITY_ADMIN_ROLE);
  assert.doesNotMatch(JSON.stringify(protectedManifest), /password|private-secret|vk_identity_operator_/iu);
  assert.equal(credentialLogs.length, 1);
  assert.doesNotMatch(credentialLogs[0], /postgresql|password|vk_identity_operator_|sha256:/iu);
  for (const protectedFile of [
    preparedCredentials.createUserFlagsPath,
    preparedCredentials.operatorEnvironmentPath,
    preparedCredentials.operatorNamePath,
    preparedCredentials.manifestPath
  ]) {
    const metadata = await fs.stat(protectedFile);
    assert.equal(metadata.mode & 0o777, 0o600);
  }
  await assert.rejects(
    prepareIdentityOperatorFiles(preparedOptions, { repositoryRoot: process.cwd(), log: () => {} }),
    (error) => error instanceof SafeCliError && /existiert bereits/u.test(error.message)
  );
  await assert.rejects(
    prepareIdentityOperatorFiles(
      { ...preparedOptions, outputDirectory: process.cwd() },
      { repositoryRoot: process.cwd(), log: () => {} }
    ),
    (error) => error instanceof SafeCliError && /ausserhalb des Git-Worktrees/u.test(error.message)
  );

  const proxyExecutable = path.join(temporaryDirectory, "cloud-sql-proxy");
  const proxyBytes = "#!/bin/sh\nexit 0\n";
  await fs.writeFile(proxyExecutable, proxyBytes, { mode: 0o700 });
  await fs.chmod(proxyExecutable, 0o700);
  const proxyFingerprint = `sha256:${crypto.createHash("sha256").update(proxyBytes).digest("hex")}`;
  const validatedProxy = await validateCloudSqlProxyExecutable(proxyExecutable, proxyFingerprint);
  assert.equal(validatedProxy.fingerprint, proxyFingerprint);
  await assert.rejects(
    validateCloudSqlProxyExecutable(proxyExecutable, `sha256:${"0".repeat(64)}`),
    (error) => error instanceof CloudSqlManagedProxyError
      && error.code === "TARGET_PROXY_BINARY_PIN_MISMATCH"
  );
  await assert.rejects(
    startManagedCloudSqlAuthProxy({
      gateResult: syntheticGateResult,
      targetDatabaseUrl: targetUrl,
      environment: {
        CLOUD_SQL_AUTH_PROXY_EXECUTABLE: proxyExecutable,
        CLOUD_SQL_AUTH_PROXY_SHA256: proxyFingerprint,
        CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private"
      }
    }),
    (error) => error instanceof CloudSqlManagedProxyError
      && error.code === "TARGET_PROXY_CONNECT_MODE_INVALID"
  );

  class FakeProxyChild extends EventEmitter {
    constructor() {
      super();
      this.exitCode = null;
      this.stdout = { resume() {} };
      this.stderr = { resume() {} };
    }

    kill() {
      this.exitCode = 0;
      queueMicrotask(() => this.emit("exit", 0, null));
      return true;
    }
  }

  class FakeProxyClient {
    constructor(options) {
      this.options = options;
    }
  }

  const proxySpawns = [];
  const managedSession = await startManagedCloudSqlAuthProxy({
    gateResult: syntheticGateResult,
    targetDatabaseUrl: targetUrl,
    environment: {
      CLOUD_SQL_AUTH_PROXY_EXECUTABLE: proxyExecutable,
      CLOUD_SQL_AUTH_PROXY_SHA256: proxyFingerprint,
      CLOUD_SQL_AUTH_PROXY_CONNECT_MODE: "private-ip",
      HOME: temporaryDirectory,
      SOURCE_DATABASE_URL: "must-not-reach-proxy-child"
    }
  }, {
    spawnProcess(executable, argumentsList, options) {
      proxySpawns.push({ executable, argumentsList, options });
      return new FakeProxyChild();
    },
    async waitForSocket() {},
    ClientClass: FakeProxyClient
  });
  assert.deepEqual(
    assertManagedCloudSqlProxyMatchesGate(managedSession, syntheticGateResult),
    { verified: true, connectionName: syntheticConnectionName }
  );
  const managedClient = managedSession.createClient("vk-managed-proxy-test");
  assert.equal(managedClient.options.application_name, "vk-managed-proxy-test");
  assert.equal(managedClient.options.host.startsWith("/tmp/vk-cloud-sql-proxy-"), true);
  assert.equal(managedSession.connectMode, "private-ip");
  assert.equal(proxySpawns.length, 1);
  assert.equal(proxySpawns[0].argumentsList[0], "--private-ip");
  assert.equal(proxySpawns[0].argumentsList.at(-1).startsWith(`${syntheticConnectionName}?`), true);
  assert.equal("SOURCE_DATABASE_URL" in proxySpawns[0].options.env, false);
  assert.throws(
    () => assertManagedCloudSqlProxyMatchesGate(managedSession, {
      ...syntheticGateResult,
      targetDatabase: { connectionName: "example-target-project:example-region1:other-postgres" }
    }),
    (error) => error instanceof CloudSqlManagedProxyError
      && error.code === "TARGET_MANAGED_PROXY_INSTANCE_MISMATCH"
  );
  await managedSession.stop();
  assert.equal(managedSession.isActive(), false);

  const protectedPath = path.join(temporaryDirectory, "bindings.json");
  await fs.writeFile(protectedPath, JSON.stringify({
    version: 1,
    bindings: [binding("file-subject", "profile-file")]
  }), { mode: 0o600 });
  await fs.chmod(protectedPath, 0o600);
  const loaded = await loadProtectedBindingDocument(protectedPath, { repositoryRoot: process.cwd() });
  assert.equal(loaded.bindings.length, 1);

  await fs.chmod(protectedPath, 0o644);
  await assert.rejects(
    loadProtectedBindingDocument(protectedPath, { repositoryRoot: process.cwd() }),
    (error) => error instanceof SafeCliError && /private Dateirechte/u.test(error.message)
  );
  await fs.chmod(protectedPath, 0o600);
  await assert.rejects(
    loadProtectedBindingDocument(protectedPath, { repositoryRoot: temporaryDirectory }),
    (error) => error instanceof SafeCliError && /ausserhalb des Git-Worktrees/u.test(error.message)
  );

  const caPath = path.join(temporaryDirectory, "remote-target-ca.crt");
  await fs.writeFile(caPath, rootCertificates[0], { mode: 0o600 });
  const remoteTargetUrl = new URL(
    "postgresql://identity-admin:private-secret@database.example.invalid:5432/versorgungs_kompass"
  );
  remoteTargetUrl.searchParams.set("sslmode", "verify-full");
  remoteTargetUrl.searchParams.set("sslrootcert", caPath);
  assert.match(identityTargetFingerprint(remoteTargetUrl.toString()), /^sha256:[a-f0-9]{64}$/u);
  remoteTargetUrl.searchParams.set("host", "127.0.0.1");
  assertSafeFailure(
    () => identityTargetFingerprint(remoteTargetUrl.toString()),
    /remote target accepts only/iu
  );
  remoteTargetUrl.searchParams.delete("host");

  const invalidCaPath = path.join(temporaryDirectory, "invalid-target-ca.crt");
  await fs.writeFile(invalidCaPath, "not a certificate", { mode: 0o600 });
  remoteTargetUrl.searchParams.set("sslrootcert", invalidCaPath);
  assertSafeFailure(
    () => identityTargetFingerprint(remoteTargetUrl.toString()),
    /not a readable CA certificate/iu
  );
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

console.log("IAP-Identity-Binding-Vertrag erfolgreich geprueft.");
