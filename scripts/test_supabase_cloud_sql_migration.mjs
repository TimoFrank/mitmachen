#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import {
  GENERATED_COLUMNS,
  EXPECTED_SYNTHETIC_SEED_CONTENT_FINGERPRINTS,
  MIGRATION_TABLES,
  MigrationSafetyError,
  SYNTHETIC_SEED_ID,
  SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM,
  SYNTHETIC_SEED_CONTENT_MANIFESTS,
  assertSourceTlsConfig,
  assertTargetDatabaseConnection,
  closeSourceSnapshotBeforeTargetCommit,
  commitTargetMigration,
  inspectSchema,
  isTypeCompatible,
  loadVerifiedStorageManifest,
  normalizeSyntheticSeedRecord,
  runDatabaseMigration,
  sourceUrlMatchesProject,
  syntheticSeedContentFingerprint
} from "./lib/pre-gematik-database-migration.mjs";
import { parseArguments } from "./migrate_supabase_to_pre_gematik.mjs";
import { buildStorageMigrationManifest } from "./migrate_supabase_storage_to_gcs.mjs";
import {
  CloudSqlManagedProxyError,
  assertCloudSqlGateTarget
} from "./lib/cloud-sql-managed-proxy.mjs";

const root = new URL("../", import.meta.url);
const schemaSql = readFileSync(new URL("deploy/postgres/pre-gematik/schema.sql", root), "utf8");
const syntheticSeedSql = readFileSync(new URL("deploy/postgres/pre-gematik/seed.synthetic.sql", root), "utf8");
const syntheticAvatarPatchSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/seed.synthetic-profile-avatars.sql", root),
  "utf8"
);
const runtimeRoleSql = readFileSync(new URL("deploy/postgres/pre-gematik/runtime-role.sql", root), "utf8");
const runtimeGrantsSql = readFileSync(new URL("deploy/postgres/pre-gematik/grants.sql", root), "utf8");
const migrationSource = readFileSync(new URL("scripts/lib/pre-gematik-database-migration.mjs", root), "utf8");
const managedProxySource = readFileSync(new URL("scripts/lib/cloud-sql-managed-proxy.mjs", root), "utf8");
const cliSource = readFileSync(new URL("scripts/migrate_supabase_to_pre_gematik.mjs", root), "utf8");

const EXPECTED_TABLES = Object.freeze([
  "profiles",
  "organizations",
  "contacts",
  "organization_primary_systems",
  "contact_owners",
  "activity_events",
  "changes",
  "contact_notes",
  "contact_note_attachments",
  "saved_views",
  "user_settings",
  "formats",
  "format_participants",
  "hospitation_slots",
  "hospitations",
  "hospitation_observations",
  "hospitation_observation_changes",
  "roadmap_items",
  "hospitation_roadmap_assessments",
  "hospitation_unmet_needs",
  "expert_groups",
  "expert_organizations",
  "expert_contacts",
  "expert_entity_links",
  "stakeholder_types",
  "stakeholder_organizations",
  "stakeholder_people",
  "notification_events",
  "notification_recipients"
]);

class ConcurrentQueryRejectingClient {
  constructor() {
    this.active = false;
    this.queryCount = 0;
  }

  async query(statement) {
    if (this.active) throw new Error("concurrent query on one pg.Client");
    this.active = true;
    this.queryCount += 1;
    try {
      await new Promise((resolve) => setImmediate(resolve));
      if (/information_schema\.columns/u.test(statement)) {
        return {
          rowCount: 1,
          rows: [{
            column_name: "id",
            data_type: "text",
            udt_name: "text",
            is_nullable: "NO",
            column_default: null,
            is_generated: "NEVER",
            identity_generation: null,
            character_maximum_length: null,
            numeric_precision: null,
            numeric_scale: null,
            datetime_precision: null,
            ordinal_position: 1
          }]
        };
      }
      if (/pg_catalog\.pg_index/u.test(statement)) {
        return { rowCount: 1, rows: [{ column_name: "id" }] };
      }
      throw new Error("unexpected schema inspection query");
    } finally {
      this.active = false;
    }
  }
}

{
  const source = new ConcurrentQueryRejectingClient();
  const target = new ConcurrentQueryRejectingClient();
  const plans = await inspectSchema(source, target);
  assert.equal(plans.length, EXPECTED_TABLES.length);
  assert.equal(source.queryCount, EXPECTED_TABLES.length * 2);
  assert.equal(target.queryCount, EXPECTED_TABLES.length * 2);
}

assert.equal(MIGRATION_TABLES.length, 29, "Die Allowlist muss exakt 29 unterstützte Fachtabellen enthalten.");
assert.deepEqual(MIGRATION_TABLES, EXPECTED_TABLES, "Allowlist oder FK-Reihenfolge wurde unbeabsichtigt geändert.");
assert.equal(new Set(MIGRATION_TABLES).size, MIGRATION_TABLES.length, "Die Allowlist enthält Duplikate.");
for (const forbidden of [
  "identity_bindings",
  "import_runs",
  "login_aliases",
  "network_registration_rate_limits",
  "network_registrations",
  "protected_source_snapshots"
]) {
  assert.equal(MIGRATION_TABLES.includes(forbidden), false, `${forbidden} darf keine Quell-Fachtabelle sein.`);
}
assert.deepEqual(GENERATED_COLUMNS, {
  contacts: ["contact_search_vector"],
  contact_notes: ["search_vector"],
  contact_note_attachments: ["search_vector"]
});
assert.equal(SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM, "complete-replaceable-content-v2");
assert.equal(SYNTHETIC_SEED_CONTENT_MANIFESTS.length, 6);
assert.equal(
  new Set(SYNTHETIC_SEED_CONTENT_MANIFESTS.map((manifest) => manifest.id)).size,
  SYNTHETIC_SEED_CONTENT_MANIFESTS.length,
  "Jede erlaubte Seed-Variante braucht eine eindeutige Manifest-ID."
);
assert.equal(
  new Set(EXPECTED_SYNTHETIC_SEED_CONTENT_FINGERPRINTS).size,
  SYNTHETIC_SEED_CONTENT_MANIFESTS.length,
  "Jede erlaubte Seed-Variante braucht einen eindeutigen Inhaltsfingerprint."
);
for (const manifest of SYNTHETIC_SEED_CONTENT_MANIFESTS) {
  assert.match(manifest.id, /^pre-gematik-synthetic-v1@[0-9a-f]{7}\/(?:base|avatar-patch-v1)$/u);
  assert.match(manifest.seedRevision, /^[0-9a-f]{7}$/u);
  assert.match(manifest.seedArtifactSha256, /^sha256:[0-9a-f]{64}$/u);
  assert.match(manifest.fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(manifest), true);
}
assert.deepEqual(
  normalizeSyntheticSeedRecord("profiles", {
    id: "demo-profile-admin",
    avatar_url: "/public/demo-profile-admin.svg",
    updated_at: "deployment-variable",
    display_name: "Demo Administration"
  }),
  {
    id: "demo-profile-admin",
    avatar_url: "/public/demo-profile-admin.svg",
    updated_at: "<synthetic-profile-avatar-patch-time>",
    display_name: "Demo Administration"
  },
  "Nur die belegte Triggerzeit des exakten Avatar-Paars darf normalisiert werden."
);
assert.equal(
  normalizeSyntheticSeedRecord("profiles", {
    id: "demo-profile-admin",
    avatar_url: "/public/anderer-avatar.svg",
    updated_at: "must-stay"
  }).updated_at,
  "must-stay",
  "Bei einem abweichenden Fachwert darf auch die Auditzeit nicht normalisiert werden."
);
assert.deepEqual(
  normalizeSyntheticSeedRecord("hospitation_observation_changes", {
    id: 1,
    changed_at: "deployment-variable",
    after_value: { title: "Fachinhalt bleibt exakt" }
  }),
  {
    id: 1,
    changed_at: "<seed-trigger-time>",
    after_value: { title: "Fachinhalt bleibt exakt" }
  }
);
const column = (udtName, overrides = {}) => ({
  udt_name: udtName,
  character_maximum_length: null,
  numeric_precision: null,
  numeric_scale: null,
  datetime_precision: null,
  ...overrides
});
assert.equal(isTypeCompatible(column("uuid"), column("text")), true);
assert.equal(isTypeCompatible(column("int8"), column("int4")), false);
assert.equal(isTypeCompatible(column("numeric"), column("float8")), false);
assert.equal(isTypeCompatible(column("float4"), column("float8")), true);
assert.equal(
  isTypeCompatible(
    column("numeric", { numeric_precision: 10, numeric_scale: 2 }),
    column("numeric", { numeric_precision: 12, numeric_scale: 2 })
  ),
  true
);
assert.equal(
  isTypeCompatible(
    column("numeric", { numeric_precision: 10, numeric_scale: 2 }),
    column("numeric", { numeric_precision: 10, numeric_scale: 1 })
  ),
  false
);
assert.equal(
  isTypeCompatible(
    column("varchar", { character_maximum_length: 200 }),
    column("varchar", { character_maximum_length: 100 })
  ),
  false
);
assert.match(migrationSource, /begin isolation level repeatable read, read only/i);
assert.match(migrationSource, /begin isolation level serializable, read write/i);
assert.match(migrationSource, /pg_advisory_xact_lock/i);
assert.match(migrationSource, /SOURCE_RLS_BYPASS_NOT_PROVEN/);
assert.match(migrationSource, /SOURCE_TLS_VERIFY_FULL_REQUIRED/);
assert.match(migrationSource, /synthetic-with-protected-bootstrap-profile/);
assert.match(migrationSource, /BOOTSTRAP_PROFILE_REPLACEMENT_NOT_CONFIRMED/);
assert.match(migrationSource, /PROFILE_IMAGE_SOURCE_PATH_INVALID/);
assert.match(migrationSource, /\^avatar\\\.\(jpg\|png\|webp\)\$/i);
assert.match(
  migrationSource,
  /closeSourceSnapshotBeforeTargetCommit\(source\)[\s\S]{0,500}commitTargetMigration\(target, importRunId\)/,
  "Der read-only Quellsnapshot muss vor dem Ziel-COMMIT beendet werden."
);
assert.doesNotMatch(migrationSource, /commit-source-snapshot/,
  "Nach dem Ziel-COMMIT darf kein separater Quell-COMMIT mehr folgen.");
assert.match(migrationSource, /delete from public\.hospitation_observation_changes/i);
assert.match(migrationSource, /primaryKeyFingerprint/);
assert.match(migrationSource, /contentFingerprint/);
assert.match(migrationSource, /sha256/i);
assert.match(migrationSource, /EXPECTED_SYNTHETIC_SEED_CONTENT_FINGERPRINTS/);
assert.match(migrationSource, /STORAGE_MANIFEST_FINGERPRINT_MISMATCH/);
assert.match(migrationSource, /STORAGE_MANIFEST_REFERENCE_MISSING/);
assert.match(migrationSource, /SOURCE_SNAPSHOT_FINGERPRINT_MISMATCH/);
assert.match(migrationSource, /PROJECT_PAIR_FINGERPRINT_MISMATCH/);
assert.doesNotMatch(migrationSource, /confirmProfileImagesCopied/,
  "Ein ungebundenes Boolean darf den Storage-Nachweis nicht ersetzen.");
assert.match(migrationSource, /fingerprint-identity-bindings/i);
assert.match(migrationSource, /delete-target-extra-profiles/i);
assert.match(migrationSource, /on conflict \(\$\{plan\.primaryKey/i);
assert.match(migrationSource, /advance-identity-sequence/i);
assert.doesNotMatch(migrationSource, /insert into public\.identity_bindings/i,
  "Die Datenmigration darf die schreibgeschuetzte Identity-Grenze nicht umgehen.");
assert.doesNotMatch(migrationSource, /delete from public\.identity_bindings/i,
  "Die Datenmigration darf Identity-Bindungen weder loeschen noch kaskadierend ersetzen.");
assert.doesNotMatch(migrationSource, /setval\(/i,
  "Die Runtime-Rolle hat bewusst kein Sequence-UPDATE; Sequenzen muessen nur per USAGE vorwaerts laufen.");
assert.match(migrationSource, /verify-foreign-key/i);
assert.doesNotMatch(migrationSource, /console\.(?:log|error)\([^\n]*(?:DatabaseUrl|connectionString)/i,
  "Verbindungsstrings dürfen nicht geloggt werden.");
assert.doesNotMatch(cliSource, /console\.(?:log|error)\([^\n]*(?:SOURCE_DATABASE_URL|TARGET_DATABASE_URL)/i,
  "Die CLI darf Secret-Umgebungswerte nicht loggen.");
assert.match(migrationSource, /startManagedCloudSqlAuthProxy/,
  "Apply muss den instanzgebundenen Auth Proxy selbst starten.");
assert.match(migrationSource, /managedProxyGateVerifier\(managedProxy, gateResult\)/,
  "Der laufende Proxy muss unmittelbar vor Zielschreibzugriffen erneut gegen den Gate geprueft werden.");
assert.match(migrationSource, /PRE_IMPORT_BACKUP_ID:\s*config\.preImportBackupId/,
  "Der GCP-Gate muss zwingend die im Datenbank-Apply bestaetigte Backup-ID verwenden.");
assert.match(managedProxySource, /"--sql-data"/,
  "Der lokale Operator-Proxy muss den geschuetzten Cloud-SQL-Datentunnel ohne oeffentliche DB-IP verwenden.");
assert.match(managedProxySource, /"--private-ip"/,
  "Der GKE-Operator muss den expliziten privaten Cloud-SQL-IP-Pfad unterstuetzen.");
assert.match(managedProxySource, /TARGET_PROXY_CONNECT_MODE_INVALID/,
  "Unbekannte Proxy-Verbindungsmodi muessen fail-closed abgewiesen werden.");
assert.match(managedProxySource, /"unix-socket-path"/,
  "Der werkzeugverwaltete Proxy muss einen exklusiven Unix-Socket verwenden.");
assert.match(managedProxySource, /CLOUD_SQL_AUTH_PROXY_SHA256/,
  "Der offizielle Proxy muss vor dem Start gegen einen unabhaengigen Binaer-Pin geprueft werden.");
assert.doesNotMatch(managedProxySource, /credentials-file|json-credentials|--token/,
  "Der Proxy-Start darf keine langlebigen Schluessel oder Token als Prozessargumente akzeptieren.");

{
  const finalizationOrder = [];
  await closeSourceSnapshotBeforeTargetCommit({
    async query(query) {
      finalizationOrder.push(`source:${query}`);
      return { rows: [] };
    }
  });
  const ambiguousRunId = "supabase-to-pre-gematik-v1-regression-run";
  await assert.rejects(
    commitTargetMigration({
      async query(query) {
        finalizationOrder.push(`target:${query}`);
        throw Object.assign(new Error("synthetic transport loss"), { code: "ECONNRESET" });
      }
    }, ambiguousRunId),
    (error) => error instanceof MigrationSafetyError
      && error.code === "TARGET_COMMIT_OUTCOME_UNKNOWN"
      && error.importRunId === ambiguousRunId
      && error.pgCode === "ECONNRESET"
      && error.message.includes("public.import_runs")
      && error.message.includes(ambiguousRunId)
      && /Do not retry|second import/i.test(error.message)
  );
  assert.deepEqual(finalizationOrder, ["source:rollback", "target:commit"]);
}

assert.equal(
  sourceUrlMatchesProject("postgresql://postgres.project-ref@aws-0-eu-central-1.pooler.supabase.com/postgres", "project-ref"),
  true
);
assert.equal(
  sourceUrlMatchesProject("postgresql://postgres@db.project-ref.supabase.co/postgres", "project-ref"),
  true
);
assert.equal(
  sourceUrlMatchesProject("postgresql://postgres.other@pooler.example.invalid/postgres", "project-ref"),
  false
);
assert.equal(
  sourceUrlMatchesProject("postgresql://postgres.project-ref@pooler.example.invalid/postgres", "project-ref"),
  false,
  "Ein beliebiger TLS-Host darf nicht allein durch einen passend aussehenden Benutzernamen zur Quelle werden."
);
assert.equal(
  sourceUrlMatchesProject("postgresql://postgres.project-ref@pooler.supabase.com.evil.example/postgres", "project-ref"),
  false
);
assert.throws(
  () => assertSourceTlsConfig("postgresql://postgres.project-ref@pooler.example.invalid/postgres"),
  (error) => error instanceof MigrationSafetyError && error.code === "SOURCE_TLS_VERIFY_FULL_REQUIRED"
);
assert.throws(
  () => assertSourceTlsConfig(
    "postgresql://postgres.project-ref@pooler.example.invalid/postgres?sslmode=require&sslrootcert=%2Ftmp%2Fca.crt"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "SOURCE_TLS_VERIFY_FULL_REQUIRED"
);
assert.throws(
  () => assertSourceTlsConfig(
    "postgresql://postgres.project-ref@pooler.example.invalid/postgres?sslmode=verify-ca&sslrootcert=%2Ftmp%2Fca.crt"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "SOURCE_TLS_VERIFY_FULL_REQUIRED"
);
assert.throws(
  () => assertSourceTlsConfig(
    "postgresql://postgres.project-ref@pooler.example.invalid/postgres?sslmode=verify-full"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "SOURCE_TLS_ROOT_CERT_REQUIRED"
);
assert.throws(
  () => assertSourceTlsConfig(
    "postgresql://postgres.project-ref@pooler.example.invalid/postgres?sslmode=verify-full&sslrootcert=%2Fdefinitely-missing%2Fsupabase-ca.crt"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "SOURCE_TLS_ROOT_CERT_INVALID"
);
assert.deepEqual(
  assertTargetDatabaseConnection(
    "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=disable"
  ),
  {
    hostname: "127.0.0.1",
    port: "5433",
    database: "target",
    transport: "cloud-sql-auth-proxy-loopback",
    sslMode: "disable",
    rootCertificateVerified: false
  }
);
for (const invalidLoopbackUrl of [
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target",
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=require",
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=verify-full"
]) {
  assert.throws(
    () => assertTargetDatabaseConnection(invalidLoopbackUrl),
    (error) => error instanceof MigrationSafetyError && error.code === "TARGET_LOOPBACK_SSLMODE_INVALID"
  );
}
for (const overridingLoopbackUrl of [
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=disable&host=database.example.invalid",
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=disable&port=6432",
  "postgresql://migration-admin:private-secret@127.0.0.1:5433/target?sslmode=disable&sslrootcert=%2Ftmp%2Fca.crt"
]) {
  assert.throws(
    () => assertTargetDatabaseConnection(overridingLoopbackUrl),
    (error) => error instanceof MigrationSafetyError && error.code === "TARGET_LOOPBACK_PARAMETERS_INVALID"
  );
}
assert.throws(
  () => assertTargetDatabaseConnection(
    "postgresql://migration-admin:private-secret@database.example.invalid:5432/target?sslmode=disable"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "TARGET_REMOTE_SSLMODE_INVALID"
);
assert.throws(
  () => assertTargetDatabaseConnection(
    "postgresql://migration-admin:private-secret@database.example.invalid:5432/target?sslmode=verify-full&sslrootcert=relative-ca.crt"
  ),
  (error) => error instanceof MigrationSafetyError && error.code === "TARGET_TLS_ROOT_CERT_REQUIRED"
);
assert.deepEqual(parseArguments([]), {
  apply: false,
  replaceSyntheticTarget: false,
  confirmReplacement: "",
  preImportBackupId: "",
  targetProfileImageBucket: "",
  targetContactImageBucket: "",
  targetContactNoteAttachmentBucket: "",
  targetStakeholderLogoBucket: "",
  storageMigrationManifestPath: "",
  confirmStorageManifestFingerprint: "",
  confirmSourceSnapshotFingerprint: "",
  confirmQuarantinedObjectCount: "",
  confirmBootstrapProfileFingerprint: ""
});
assert.deepEqual(parseArguments([
  "--apply",
  "--replace-synthetic-target",
  "--confirm-replacement",
  SYNTHETIC_SEED_ID,
  "--pre-import-backup-id",
  "backup-static-test",
  "--target-profile-image-bucket",
  "profile-images-static-test",
  "--target-contact-image-bucket",
  "contact-images-static-test",
  "--target-contact-note-attachment-bucket",
  "contact-attachments-static-test",
  "--target-stakeholder-logo-bucket",
  "stakeholder-logos-static-test",
  "--storage-manifest",
  "/private/tmp/storage-apply-static-test.json",
  "--confirm-storage-manifest-fingerprint",
  `sha256:${"b".repeat(64)}`,
  "--confirm-source-snapshot-fingerprint",
  `sha256:${"c".repeat(64)}`,
  "--confirm-quarantined-object-count",
  "0",
  "--confirm-bootstrap-profile-fingerprint",
  `sha256:${"a".repeat(64)}`
]), {
  apply: true,
  replaceSyntheticTarget: true,
  confirmReplacement: SYNTHETIC_SEED_ID,
  preImportBackupId: "backup-static-test",
  targetProfileImageBucket: "profile-images-static-test",
  targetContactImageBucket: "contact-images-static-test",
  targetContactNoteAttachmentBucket: "contact-attachments-static-test",
  targetStakeholderLogoBucket: "stakeholder-logos-static-test",
  storageMigrationManifestPath: "/private/tmp/storage-apply-static-test.json",
  confirmStorageManifestFingerprint: `sha256:${"b".repeat(64)}`,
  confirmSourceSnapshotFingerprint: `sha256:${"c".repeat(64)}`,
  confirmQuarantinedObjectCount: "0",
  confirmBootstrapProfileFingerprint: `sha256:${"a".repeat(64)}`
});

await assert.rejects(
  runDatabaseMigration({
    sourceDatabaseUrl: "postgresql://postgres.static-source@127.0.0.1/source",
    targetDatabaseUrl: "postgresql://postgres@127.0.0.1/target",
    expectedSourceProjectId: "static-source",
    expectedTargetDatabaseName: "target",
    apply: true,
    replaceSyntheticTarget: true,
    confirmReplacement: SYNTHETIC_SEED_ID
  }, { logger: { log() {} } }),
  (error) => error instanceof MigrationSafetyError && error.code === "PRE_IMPORT_BACKUP_REQUIRED"
);

console.log("Static migration contract OK: 29 allowlisted tables, generated-column omissions and safety gates verified.");

function docker(args, { input, quiet = false } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: quiet ? "ignore" : "pipe"
  });
  if (result.status !== 0) {
    throw new Error(`Docker command failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result.stdout?.trim() || "";
}

function dockerAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function openssl(args) {
  const result = spawnSync("openssl", args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`OpenSSL command failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
}

function createTlsFixture(directory) {
  const caKey = join(directory, "ca.key");
  const caCertificate = join(directory, "ca.crt");
  const serverKey = join(directory, "server.key");
  const serverRequest = join(directory, "server.csr");
  const serverCertificate = join(directory, "server.crt");
  const serverExtensions = join(directory, "server.ext");
  writeFileSync(serverExtensions, [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ""
  ].join("\n"));
  openssl([
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "2",
    "-subj", "/CN=Versorgungs-Kompass Migration Smoke Root",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    "-keyout", caKey, "-out", caCertificate
  ]);
  openssl([
    "req", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-subj", "/CN=localhost",
    "-keyout", serverKey, "-out", serverRequest
  ]);
  openssl([
    "x509", "-req", "-sha256", "-days", "2",
    "-in", serverRequest,
    "-CA", caCertificate,
    "-CAkey", caKey,
    "-CAcreateserial",
    "-extfile", serverExtensions,
    "-out", serverCertificate
  ]);
  chmodSync(serverKey, 0o600);
  return { caCertificate, serverCertificate, serverKey };
}

async function waitForPostgres(url) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 1_000 });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`PostgreSQL 16 did not become ready: ${lastError?.code || "unknown"}`);
}

async function withClient(url, callback) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

const SUPPLEMENTARY_SOURCE_FIXTURE = `
begin;

update profiles
   set email = 'protected-admin@migration-smoke.example.invalid',
       avatar_url = 'https://migration-smoke-source.supabase.co/storage/v1/object/sign/profile-images/demo-profile-admin/original-avatar.png?token=synthetic-token'
 where id = 'demo-profile-admin';

update contacts
   set image_storage_path = 'migration-smoke/contact.png'
 where id = 'demo-contact-01';

insert into activity_events (
  id, event_key, category, action, entity_type, entity_id, contact_id, actor_id,
  origin_type, "references", changes, metadata, legacy_source, legacy_id
) values (
  9001, 'contact.created', 'master_data', 'created', 'contact', 'demo-contact-01',
  'demo-contact-01', 'demo-profile-admin', 'legacy',
  '[{"type":"contact","id":"demo-contact-01"}]'::jsonb,
  '{}'::jsonb, '{"synthetic":true}'::jsonb, 'migration-smoke', 'event-1'
);

insert into changes (
  id, contact_id, action, new_value, changed_by, activity_event_id, canonicalized_at
) values (
  9001, 'demo-contact-01', 'create', 'Synthetischer Wert', 'demo-profile-admin', 9001, now()
);

insert into contact_notes (
  id, contact_id, content_type, body, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000009001', 'demo-contact-01', 'free_note',
  'Rein synthetische Migrationsnotiz', 'demo-profile-admin', 'demo-profile-admin'
);

insert into contact_note_attachments (
  id, contact_id, note_id, file_name, storage_path, mime_type, file_size,
  extraction_status, extracted_text, uploader_id
) values (
  '00000000-0000-4000-8000-000000009002', 'demo-contact-01',
  '00000000-0000-4000-8000-000000009001', 'synthetic.txt',
  'migration-smoke/synthetic.txt', 'text/plain', 10, 'complete',
  'Synthetischer Inhalt', 'demo-profile-admin'
);

insert into saved_views (id, owner_id, name, view_type, is_default)
values ('migration-smoke-view', 'demo-profile-admin', 'Synthetische Ansicht', 'contacts', true);

insert into user_settings (user_id, default_view_id)
values ('demo-profile-admin', 'migration-smoke-view');

insert into hospitation_slots (
  id, contact_id, organization_id, starts_at, owner_id, created_by, updated_by
) values (
  'migration-smoke-slot', 'demo-contact-01', 'demo-org-nordstadt', now() + interval '1 day',
  'demo-profile-admin', 'demo-profile-admin', 'demo-profile-admin'
);

insert into roadmap_items (
  id, slug, product_area, product_name, feature_name, created_by, updated_by
) values (
  'migration-smoke-roadmap', 'migration-smoke-roadmap', 'Test', 'Testprodukt',
  'Testfunktion', 'demo-profile-admin', 'demo-profile-admin'
);

insert into hospitation_roadmap_assessments (
  id, hospitation_id, roadmap_item_id, care_relevance, comparison_role, created_by, updated_by
) values (
  'migration-smoke-assessment', 'demo-hospitation-medikationsabgleich-entlassung', 'migration-smoke-roadmap',
  4, 'top_priority', 'demo-profile-admin', 'demo-profile-admin'
);

insert into hospitation_unmet_needs (
  id, hospitation_id, related_roadmap_item_id, title, urgency, created_by, updated_by
) values (
  'migration-smoke-need', 'demo-hospitation-medikationsabgleich-entlassung', 'migration-smoke-roadmap',
  'Synthetischer Bedarf', 5, 'demo-profile-admin', 'demo-profile-admin'
);

insert into expert_groups (id, name)
values ('migration-smoke-expert-group', 'Synthetische Expertengruppe');

insert into expert_organizations (id, name, normalized_name, group_id)
values (
  'migration-smoke-expert-org', 'Synthetische Expertenorganisation',
  'synthetische expertenorganisation', 'migration-smoke-expert-group'
);

insert into expert_contacts (
  id, name, organization_id, group_id, group_name, owner_id, owner_ids
) values (
  'migration-smoke-expert', 'Synthetischer Experte', 'migration-smoke-expert-org',
  'migration-smoke-expert-group', 'Synthetische Expertengruppe',
  'demo-profile-admin', array['demo-profile-admin']
);

insert into expert_entity_links (
  id, link_type, contact_id, expert_contact_id, created_by, updated_by
) values (
  'migration-smoke-expert-link', 'contact', 'demo-contact-01',
  'migration-smoke-expert', 'demo-profile-admin', 'demo-profile-admin'
);

insert into stakeholder_types (id, label)
values ('migration-smoke-stakeholder-type', 'Synthetischer Typ');

insert into stakeholder_organizations (
  id, stakeholder_type_id, name, normalized_name, logo_url
) values (
  'migration-smoke-stakeholder-org', 'migration-smoke-stakeholder-type',
  'Synthetischer Stakeholder', 'synthetischer stakeholder',
  'private://stakeholder-logos/migration-smoke/logo.png'
);

insert into stakeholder_people (
  id, stakeholder_type_id, organization_id, name, topics
) values (
  'migration-smoke-stakeholder-person', 'migration-smoke-stakeholder-type',
  'migration-smoke-stakeholder-org', 'Synthetische Person', array['Pre-Integration']
);

insert into notification_events (
  id, event_type, entity_type, entity_id, actor_id, title
) values (
  'migration-smoke-notification', 'migration_smoke', 'contact', 'demo-contact-01',
  'demo-profile-admin', 'Synthetische Benachrichtigung'
);

insert into notification_recipients (event_id, user_id)
values ('migration-smoke-notification', 'demo-profile-admin');

commit;
`;

if (!dockerAvailable()) {
  console.log("PostgreSQL-16 migration smoke SKIPPED: Docker daemon is not available.");
  process.exit(0);
}

const containerName = `vk-migration-pg16-${process.pid}-${randomBytes(3).toString("hex")}`;
const password = randomBytes(18).toString("hex");
const runtimePassword = randomBytes(18).toString("hex");
const sourceProjectId = "migration-smoke-source";
const databaseUser = `postgres.${sourceProjectId}`;
const encodedUser = encodeURIComponent(databaseUser);
const encodedPassword = encodeURIComponent(password);
const certificateDirectory = mkdtempSync(join(tmpdir(), "vk-migration-tls-"));
const tlsFixture = createTlsFixture(certificateDirectory);
let baseUrl = "";

try {
  docker([
    "run", "--detach", "--rm", "--name", containerName,
    "--env", `POSTGRES_USER=${databaseUser}`,
    "--env", `POSTGRES_PASSWORD=${password}`,
    "--env", "POSTGRES_DB=postgres",
    "--publish", "127.0.0.1::5432",
    "postgres:16-alpine"
  ]);
  const portOutput = docker(["port", containerName, "5432/tcp"]);
  const port = /:(\d+)$/.exec(portOutput)?.[1];
  assert.ok(port, "Der dynamische PostgreSQL-Port wurde nicht gefunden.");
  baseUrl = `postgresql://${encodedUser}:${encodedPassword}@127.0.0.1:${port}`;
  const adminUrl = `${baseUrl}/postgres`;
  await waitForPostgres(adminUrl);

  await withClient(adminUrl, async (admin) => {
    await admin.query("create database source_snapshot");
    await admin.query("create database target_migration");
    await admin.query("create database target_rollback");
    await admin.query("create database target_bootstrap");
  });

  const sourceSetupUrl = `${baseUrl}/source_snapshot`;
  const targetUrl = `${baseUrl}/target_migration`;
  const rollbackTargetUrl = `${baseUrl}/target_rollback`;
  const bootstrapTargetUrl = `${baseUrl}/target_bootstrap`;

  await withClient(sourceSetupUrl, async (source) => {
    await source.query(schemaSql);
    await source.query(syntheticSeedSql);
    await source.query(SUPPLEMENTARY_SOURCE_FIXTURE);
  });
  for (const url of [targetUrl, rollbackTargetUrl]) {
    await withClient(url, async (target) => {
      await target.query(schemaSql);
      await target.query(syntheticSeedSql);
      await target.query(
        `insert into identity_bindings (issuer, subject, profile_id, active)
         values ('https://identity.smoke.example.invalid', 'synthetic-smoke-subject', 'demo-profile-admin', true)`
      );
    });
  }
  await withClient(bootstrapTargetUrl, async (target) => {
    await target.query(schemaSql);
    await target.query(syntheticSeedSql);
    await target.query(`
      insert into profiles (id, email, display_name, initials, role, active, team, bio)
      values (
        'protected-bootstrap-admin', 'protected-admin@migration-smoke.example.invalid',
        'Geschuetzter Bootstrap', 'GB', 'admin', true, 'Pre-Integration',
        'Zeitlich begrenztes, nicht synthetisches Bootstrap-Profil.'
      )
    `);
    await target.query(`
      insert into user_settings (user_id, theme, font_scale, preferences)
      values (
        'protected-bootstrap-admin', 'system', 1,
        '{"navigation":"expanded","bootstrapFixture":"protected-settings"}'::jsonb
      )
    `);
  });

  for (const databaseName of ["target_migration", "target_rollback", "target_bootstrap"]) {
    docker([
      "exec", "--interactive", containerName,
      "psql", "--username", databaseUser, "--dbname", databaseName,
      "--set", "ON_ERROR_STOP=1", "--file", "-"
    ], { input: runtimeRoleSql });
    docker([
      "exec", "--interactive", containerName,
      "psql", "--username", databaseUser, "--dbname", databaseName,
      "--set", "ON_ERROR_STOP=1", "--set", "runtime_role=vk_app_runtime", "--file", "-"
    ], { input: runtimeGrantsSql });
  }
  await withClient(adminUrl, async (admin) => {
    await admin.query(`create role vk_app login password '${runtimePassword}'`);
    await admin.query("grant vk_app_runtime to vk_app");
  });
  const encodedRuntimePassword = encodeURIComponent(runtimePassword);
  const runtimeTargetUrl = `postgresql://vk_app:${encodedRuntimePassword}@127.0.0.1:${port}/target_migration?sslmode=disable`;
  const runtimeRollbackTargetUrl = `postgresql://vk_app:${encodedRuntimePassword}@127.0.0.1:${port}/target_rollback?sslmode=disable`;
  const runtimeBootstrapTargetUrl = `postgresql://vk_app:${encodedRuntimePassword}@127.0.0.1:${port}/target_bootstrap?sslmode=disable`;

  await withClient(runtimeTargetUrl, async (runtime) => {
    const privileges = await runtime.query(`
      select
        has_table_privilege(current_user, 'public.identity_bindings', 'SELECT') as binding_select,
        has_table_privilege(current_user, 'public.identity_bindings', 'INSERT') as binding_insert,
        has_table_privilege(current_user, 'public.identity_bindings', 'UPDATE') as binding_update,
        has_table_privilege(current_user, 'public.identity_bindings', 'DELETE') as binding_delete,
        has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'USAGE') as sequence_usage,
        has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'SELECT') as sequence_select,
        has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'UPDATE') as sequence_update
    `);
    assert.deepEqual(privileges.rows[0], {
      binding_select: true,
      binding_insert: false,
      binding_update: false,
      binding_delete: false,
      sequence_usage: true,
      sequence_select: true,
      sequence_update: false
    }, "Der Migrations-Smoke muss exakt mit der produktiven vk_app-Runtime-Grenze laufen.");
  });

  docker(["cp", tlsFixture.serverCertificate, `${containerName}:/var/lib/postgresql/data/server.crt`]);
  docker(["cp", tlsFixture.serverKey, `${containerName}:/var/lib/postgresql/data/server.key`]);
  docker([
    "exec", "--user", "root", containerName,
    "chown", "postgres:postgres",
    "/var/lib/postgresql/data/server.crt",
    "/var/lib/postgresql/data/server.key"
  ]);
  docker([
    "exec", "--user", "root", containerName,
    "chmod", "600", "/var/lib/postgresql/data/server.key"
  ]);
  await withClient(adminUrl, async (admin) => {
    await admin.query("alter system set ssl = 'on'");
    const reloaded = await admin.query("select pg_reload_conf() as reloaded");
    assert.equal(reloaded.rows[0].reloaded, true);
  });
  const sourceTlsUrl = `${sourceSetupUrl}?sslmode=verify-full&sslrootcert=${encodeURIComponent(tlsFixture.caCertificate)}`;
  const sourceUrlDescriptor = new URL(sourceTlsUrl);
  sourceUrlDescriptor.hostname = "migration-smoke.pooler.supabase.com";
  const sourceUrl = sourceUrlDescriptor.toString();
  assert.deepEqual(assertSourceTlsConfig(sourceUrl), {
    sslMode: "verify-full",
    rootCertificateVerified: true
  });
  const remoteTargetDescriptor = new URL(
    "postgresql://migration-admin:private-secret@database.example.invalid:5432/target_migration"
  );
  remoteTargetDescriptor.searchParams.set("sslmode", "verify-full");
  remoteTargetDescriptor.searchParams.set("sslrootcert", tlsFixture.caCertificate);
  assert.equal(
    assertTargetDatabaseConnection(remoteTargetDescriptor.toString()).transport,
    "remote-verify-full"
  );
  await waitForPostgres(sourceTlsUrl);

  const expectedTargetProjectId = "migration-smoke-target";
  const expectedProjectPairFingerprint = `sha256:${createHash("sha256")
    .update(`${sourceProjectId}\0${expectedTargetProjectId}`)
    .digest("hex")}`;
  const storageObjects = [
    {
      sourceBucket: "profile-images",
      name: "demo-profile-admin/avatar.png",
      sha256: "b".repeat(64),
      size: 128,
      targetMimeType: "image/png"
    },
    {
      sourceBucket: "contact-images",
      name: "migration-smoke/contact.png",
      sha256: "e".repeat(64),
      size: 96,
      targetMimeType: "image/png"
    },
    {
      sourceBucket: "stakeholder-logos",
      name: "migration-smoke/logo.png",
      sha256: "c".repeat(64),
      size: 256,
      targetMimeType: "image/png"
    },
    {
      sourceBucket: "contact-note-attachments",
      name: "migration-smoke/synthetic.txt",
      sha256: "d".repeat(64),
      size: 10,
      targetMimeType: "text/plain"
    }
  ];
  const generatedStorageManifest = buildStorageMigrationManifest({
    apply: true,
    snapshot: storageObjects,
    sourceSnapshot: { sourceObjectCount: storageObjects.length, quarantined: [] },
    config: {
      expectedSourceProjectId: sourceProjectId,
      expectedTargetProjectId,
      expectedProjectPairFingerprint,
      targetBuckets: {
        "profile-images": "profile-images-migration-smoke",
        "contact-images": "contact-images-migration-smoke",
        "contact-note-attachments": "contact-attachments-migration-smoke",
        "stakeholder-logos": "stakeholder-logos-migration-smoke"
      }
    },
    plan: { missing: [], identical: [] },
    targetStatuses: new Map([
      ["profile-images\0demo-profile-admin/avatar.png", "verified-identical"],
      ["contact-images\0migration-smoke/contact.png", "created"],
      ["stakeholder-logos\0migration-smoke/logo.png", "created"],
      ["contact-note-attachments\0migration-smoke/synthetic.txt", "created"]
    ]),
    snapshotFingerprint: `sha256:${"a".repeat(64)}`,
    remediationManifestFingerprint: `sha256:${"8".repeat(64)}`,
    remediatedObjectCount: 1
  });
  const { manifestFingerprint: storageManifestFingerprint, ...storageManifestPayload } =
    generatedStorageManifest;
  const storageManifestPath = join(certificateDirectory, "storage-apply-manifest.json");
  writeFileSync(
    storageManifestPath,
    `${JSON.stringify({ ...storageManifestPayload, manifestFingerprint: storageManifestFingerprint }, null, 2)}\n`
  );
  chmodSync(storageManifestPath, 0o600);

  const baseConfig = {
    sourceDatabaseUrl: sourceUrl,
    targetDatabaseUrl: runtimeTargetUrl,
    expectedSourceProjectId: sourceProjectId,
    expectedTargetProjectId,
    expectedProjectPairFingerprint,
    expectedTargetDatabaseName: "target_migration",
    targetProfileImageBucket: "profile-images-migration-smoke",
    targetContactImageBucket: "contact-images-migration-smoke",
    targetContactNoteAttachmentBucket: "contact-attachments-migration-smoke",
    targetStakeholderLogoBucket: "stakeholder-logos-migration-smoke",
    storageMigrationManifestPath: storageManifestPath,
    confirmStorageManifestFingerprint: storageManifestFingerprint,
    confirmSourceSnapshotFingerprint: `sha256:${"0".repeat(64)}`,
    confirmQuarantinedObjectCount: "0"
  };
  assert.equal(
    loadVerifiedStorageManifest(baseConfig).manifestFingerprint,
    generatedStorageManifest.manifestFingerprint,
    "Das vom Storage-Werkzeug erzeugte Apply-Manifest muss unveraendert vom DB-Importer akzeptiert werden."
  );
  assert.equal(loadVerifiedStorageManifest(baseConfig).remediatedObjectCount, 1);
  assert.equal(
    loadVerifiedStorageManifest(baseConfig).remediationManifestFingerprint,
    `sha256:${"8".repeat(64)}`
  );

  function writeStorageManifestFixture(fileName, payload) {
    const fingerprint = `sha256:${createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")}`;
    const manifestPath = join(certificateDirectory, fileName);
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ ...payload, manifestFingerprint: fingerprint }, null, 2)}\n`
    );
    chmodSync(manifestPath, 0o600);
    return { fingerprint, manifestPath };
  }

  const missingRemediationFingerprintPayload = {
    ...storageManifestPayload,
    remediationManifestFingerprint: null
  };
  const missingRemediationFingerprintFixture = writeStorageManifestFixture(
    "storage-apply-missing-remediation-fingerprint.json",
    missingRemediationFingerprintPayload
  );
  assert.throws(
    () => loadVerifiedStorageManifest({
      ...baseConfig,
      storageMigrationManifestPath: missingRemediationFingerprintFixture.manifestPath,
      confirmStorageManifestFingerprint: missingRemediationFingerprintFixture.fingerprint
    }),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_COUNT_INVALID"
  );

  const excessiveRemediationCountPayload = {
    ...storageManifestPayload,
    remediatedObjectCount: storageManifestPayload.migratableObjectCount + 1
  };
  const excessiveRemediationCountFixture = writeStorageManifestFixture(
    "storage-apply-excessive-remediation-count.json",
    excessiveRemediationCountPayload
  );
  assert.throws(
    () => loadVerifiedStorageManifest({
      ...baseConfig,
      storageMigrationManifestPath: excessiveRemediationCountFixture.manifestPath,
      confirmStorageManifestFingerprint: excessiveRemediationCountFixture.fingerprint
    }),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_COUNT_INVALID"
  );

  const legacyStorageManifestPayload = {
    ...storageManifestPayload,
    schemaVersion: "versorgungs-kompass-storage-manifest-v1"
  };
  const legacyStorageManifestFixture = writeStorageManifestFixture(
    "storage-apply-legacy-v1.json",
    legacyStorageManifestPayload
  );
  assert.throws(
    () => loadVerifiedStorageManifest({
      ...baseConfig,
      storageMigrationManifestPath: legacyStorageManifestFixture.manifestPath,
      confirmStorageManifestFingerprint: legacyStorageManifestFixture.fingerprint
    }),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_MODE_INVALID"
  );
  const silentLogger = { log() {} };
  const syntheticTargetConnectionName = "migration-smoke-target:europe-west3:migration-smoke-postgres";
  let gcpGateCalls = 0;
  const migrationOptions = {
    logger: silentLogger,
    async gcpGate() {
      gcpGateCalls += 1;
      return {
        ok: true,
        fingerprint: `sha256:${"9".repeat(64)}`,
        targetDatabase: {
          connectionName: syntheticTargetConnectionName
        }
      };
    },
    clientFactory(connectionString, applicationName, role) {
      const effectiveUrl = new URL(connectionString);
      if (role === "source") effectiveUrl.hostname = "127.0.0.1";
      return new Client({
        connectionString: effectiveUrl.toString(),
        application_name: applicationName,
        connectionTimeoutMillis: 15_000,
        keepAlive: true
      });
    },
    async cloudSqlProxyFactory({ gateResult, targetDatabaseUrl }) {
      const target = assertCloudSqlGateTarget(gateResult);
      let active = true;
      return {
        connectionName: target.connectionName,
        createClient(applicationName) {
          if (!active) throw new Error("synthetic managed proxy stopped");
          return migrationOptions.clientFactory(targetDatabaseUrl, applicationName, "target");
        },
        isActive() {
          return active;
        },
        async stop() {
          active = false;
        }
      };
    },
    managedProxyGateVerifier(session, gateResult) {
      const target = assertCloudSqlGateTarget(gateResult);
      if (!session.isActive() || session.connectionName !== target.connectionName) {
        throw new CloudSqlManagedProxyError(
          "Synthetic managed proxy instance mismatch.",
          "TARGET_MANAGED_PROXY_INSTANCE_MISMATCH"
        );
      }
      return { verified: true, connectionName: target.connectionName };
    }
  };
  const replaceSyntheticConfig = {
    ...baseConfig,
    apply: true,
    replaceSyntheticTarget: true,
    confirmReplacement: SYNTHETIC_SEED_ID,
    preImportBackupId: "pg16-profile-image-contract-backup"
  };

  await assert.rejects(
    runDatabaseMigration({
      ...replaceSyntheticConfig,
      expectedProjectPairFingerprint: `sha256:${"0".repeat(64)}`
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "PROJECT_PAIR_FINGERPRINT_MISMATCH"
  );
  await assert.rejects(
    runDatabaseMigration({
      ...replaceSyntheticConfig,
      confirmStorageManifestFingerprint: `sha256:${"0".repeat(64)}`
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_FINGERPRINT_MISMATCH"
  );

  await withClient(sourceTlsUrl, async (source) => {
    await source.query(`
      update profiles
         set avatar_url = 'https://migration-smoke-source.supabase.co/storage/v1/object/sign/profile-images/demo-profile-admin/avatar.png?token=synthetic-token'
       where id = 'demo-profile-admin'
    `);
  });
  const approvedSourcePreview = await runDatabaseMigration(baseConfig, migrationOptions);
  assert.match(approvedSourcePreview.sourceSnapshotFingerprint, /^sha256:[0-9a-f]{64}$/);
  baseConfig.confirmSourceSnapshotFingerprint = approvedSourcePreview.sourceSnapshotFingerprint;
  replaceSyntheticConfig.confirmSourceSnapshotFingerprint = approvedSourcePreview.sourceSnapshotFingerprint;
  await withClient(targetUrl, async (target) => {
    await target.query("update contacts set name = 'MANIPULIERTER BESTEHENDER DEMO-INHALT' where id = 'demo-contact-01'");
  });
  const tamperedSeedDryRun = await runDatabaseMigration(baseConfig, migrationOptions);
  assert.equal(tamperedSeedDryRun.targetClassification, "protected-non-synthetic");
  assert.equal(
    tamperedSeedDryRun.targetClassificationEvidence.syntheticSeedContentMatchesVersionedManifest,
    false
  );
  assert.match(
    tamperedSeedDryRun.targetClassificationEvidence.syntheticSeedContentFingerprint,
    /^sha256:[0-9a-f]{64}$/
  );
  await assert.rejects(
    runDatabaseMigration(replaceSyntheticConfig, migrationOptions),
    (error) => error instanceof MigrationSafetyError && error.code === "TARGET_NOT_SYNTHETIC"
  );
  await withClient(targetUrl, async (target) => {
    await target.query(`
      update contacts
         set name = 'Demo-Kontakt 01',
             updated_at = '2026-05-01T09:00:00.000Z'
       where id = 'demo-contact-01'
    `);
  });
  const restoredSeedDryRun = await runDatabaseMigration(baseConfig, migrationOptions);
  assert.equal(restoredSeedDryRun.targetClassification, "synthetic");
  assert.equal(
    restoredSeedDryRun.targetClassificationEvidence.syntheticSeedContentMatchesVersionedManifest,
    true
  );
  assert.equal(
    restoredSeedDryRun.targetClassificationEvidence.syntheticSeedContentManifestId,
    "pre-gematik-synthetic-v1@c3013bb/base"
  );
  assert.equal(
    restoredSeedDryRun.targetClassificationEvidence.syntheticSeedContentFingerprintAlgorithm,
    SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM
  );
  await assert.rejects(
    runDatabaseMigration({
      ...replaceSyntheticConfig,
      confirmSourceSnapshotFingerprint: `sha256:${"0".repeat(64)}`
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "SOURCE_SNAPSHOT_FINGERPRINT_MISMATCH"
  );

  const missingReferencePayload = {
    ...storageManifestPayload,
    sourceObjectCount: storageManifestPayload.sourceObjectCount - 1,
    migratableObjectCount: storageManifestPayload.sourceObjectCount - 1,
    entries: storageManifestPayload.entries.filter(
      (entry) => entry.sourceRef.bucket !== "contact-note-attachments"
    )
  };
  const missingReferenceFingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify(missingReferencePayload))
    .digest("hex")}`;
  const missingReferenceManifestPath = join(certificateDirectory, "storage-apply-missing-reference.json");
  writeFileSync(
    missingReferenceManifestPath,
    `${JSON.stringify({
      ...missingReferencePayload,
      manifestFingerprint: missingReferenceFingerprint
    }, null, 2)}\n`
  );
  chmodSync(missingReferenceManifestPath, 0o600);
  await assert.rejects(
    runDatabaseMigration({
      ...replaceSyntheticConfig,
      storageMigrationManifestPath: missingReferenceManifestPath,
      confirmStorageManifestFingerprint: missingReferenceFingerprint
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_REFERENCE_MISSING"
  );

  const quarantinedReferencePayload = {
    ...storageManifestPayload,
    migratableObjectCount: storageManifestPayload.sourceObjectCount - 1,
    quarantinedObjectCount: 1,
    entries: storageManifestPayload.entries.map((entry) => (
      entry.sourceRef.bucket === "contact-note-attachments"
        ? { ...entry, status: "quarantined", reason: "synthetic-contract-rejection" }
        : entry
    ))
  };
  const quarantinedReferenceFingerprint = `sha256:${createHash("sha256")
    .update(JSON.stringify(quarantinedReferencePayload))
    .digest("hex")}`;
  const quarantinedReferenceManifestPath = join(
    certificateDirectory,
    "storage-apply-quarantined-reference.json"
  );
  writeFileSync(
    quarantinedReferenceManifestPath,
    `${JSON.stringify({
      ...quarantinedReferencePayload,
      manifestFingerprint: quarantinedReferenceFingerprint
    }, null, 2)}\n`
  );
  chmodSync(quarantinedReferenceManifestPath, 0o600);
  await assert.rejects(
    runDatabaseMigration({
      ...replaceSyntheticConfig,
      storageMigrationManifestPath: quarantinedReferenceManifestPath,
      confirmStorageManifestFingerprint: quarantinedReferenceFingerprint,
      confirmQuarantinedObjectCount: "1"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "STORAGE_MANIFEST_REFERENCE_QUARANTINED"
  );

  await withClient(sourceTlsUrl, async (source) => {
    await source.query(`
      update profiles
         set avatar_url = 'https://foreign-project.supabase.co/storage/v1/object/sign/profile-images/demo-profile-admin/avatar.png?token=synthetic-token'
       where id = 'demo-profile-admin'
    `);
  });
  await assert.rejects(
    runDatabaseMigration(replaceSyntheticConfig, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "UNSUPPORTED_PROFILE_IMAGE_URL"
  );
  await withClient(sourceTlsUrl, async (source) => {
    await source.query(`
      update profiles
         set avatar_url = 'https://migration-smoke-source.supabase.co/storage/v1/object/sign/profile-images/demo-profile-admin/original-avatar.png?token=synthetic-token'
       where id = 'demo-profile-admin'
    `);
  });
  await assert.rejects(
    runDatabaseMigration(replaceSyntheticConfig, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "PROFILE_IMAGE_SOURCE_PATH_INVALID"
  );
  await withClient(targetUrl, async (target) => {
    const marker = await target.query(
      "select count(*)::int as count from import_runs where id = $1 or id = 'demo-import-' || $1",
      [SYNTHETIC_SEED_ID]
    );
    assert.equal(marker.rows[0].count, 1, "Ein ungueltiger Profilbildname darf das Ziel nicht veraendern.");
  });

  await withClient(sourceTlsUrl, async (source) => {
    await source.query(`
      update profiles
         set avatar_url = 'https://migration-smoke-source.supabase.co/storage/v1/object/sign/profile-images/other-profile/avatar.png?token=synthetic-token'
       where id = 'demo-profile-admin'
    `);
  });
  await assert.rejects(
    runDatabaseMigration(replaceSyntheticConfig, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "PROFILE_IMAGE_SOURCE_PATH_INVALID"
  );
  await withClient(targetUrl, async (target) => {
    const marker = await target.query(
      "select count(*)::int as count from import_runs where id = $1 or id = 'demo-import-' || $1",
      [SYNTHETIC_SEED_ID]
    );
    assert.equal(marker.rows[0].count, 1, "Eine fremde Profil-ID im Bildpfad darf das Ziel nicht veraendern.");
  });

  await withClient(sourceTlsUrl, async (source) => {
    await source.query(`
      update profiles
         set avatar_url = 'https://migration-smoke-source.supabase.co/storage/v1/object/sign/profile-images/demo-profile-admin/avatar.png?token=synthetic-token'
       where id = 'demo-profile-admin'
    `);
  });
  const finalSourcePreview = await runDatabaseMigration(baseConfig, migrationOptions);
  baseConfig.confirmSourceSnapshotFingerprint = finalSourcePreview.sourceSnapshotFingerprint;
  replaceSyntheticConfig.confirmSourceSnapshotFingerprint = finalSourcePreview.sourceSnapshotFingerprint;
  const bootstrapBaseConfig = {
    ...baseConfig,
    targetDatabaseUrl: runtimeBootstrapTargetUrl,
    expectedTargetDatabaseName: "target_bootstrap"
  };
  const bootstrapDryRun = await runDatabaseMigration(bootstrapBaseConfig, migrationOptions);
  assert.equal(bootstrapDryRun.targetClassification, "synthetic-with-protected-bootstrap-profile");
  assert.match(
    bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    /^sha256:[0-9a-f]{64}$/
  );
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileCount, 1);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapSourceIdMatchCount, 0);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapSourceEmailMatchCount, 1);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapIdentityBindingCount, 0);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.userSettingsRows, 1);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapUserSettingsCount, 1);
  assert.equal(bootstrapDryRun.targetClassificationEvidence.protectedBootstrapUserSettingsOwnerMatchCount, 1);
  assert.doesNotMatch(
    JSON.stringify(bootstrapDryRun),
    /protected-bootstrap-admin|protected-admin@migration-smoke\.example\.invalid|Geschuetzter Bootstrap|protected-settings/,
    "Der Dry-run darf weder Bootstrap-Profilidentifikatoren noch Einstellungen ausgeben."
  );

  let originalBootstrapSettingsUpdatedAt;
  await withClient(bootstrapTargetUrl, async (target) => {
    const originalSettings = await target.query(`
      select theme, updated_at::text as updated_at
        from user_settings
       where user_id = 'protected-bootstrap-admin'
    `);
    assert.equal(originalSettings.rowCount, 1);
    assert.equal(originalSettings.rows[0].theme, "system");
    originalBootstrapSettingsUpdatedAt = originalSettings.rows[0].updated_at;
    await target.query(`
      update user_settings
         set theme = 'contrast'
       where user_id = 'protected-bootstrap-admin'
    `);
  });
  const manipulatedBootstrapSettingsDryRun = await runDatabaseMigration(bootstrapBaseConfig, migrationOptions);
  assert.equal(
    manipulatedBootstrapSettingsDryRun.targetClassification,
    "synthetic-with-protected-bootstrap-profile"
  );
  assert.notEqual(
    manipulatedBootstrapSettingsDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    "Jede Aenderung am vollstaendigen Bootstrap-Settings-Datensatz muss den Freigabe-Fingerprint aendern."
  );
  await assert.rejects(
    runDatabaseMigration({
      ...bootstrapBaseConfig,
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      confirmBootstrapProfileFingerprint:
        bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
      preImportBackupId: "pg16-bootstrap-settings-backup"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "BOOTSTRAP_PROFILE_REPLACEMENT_NOT_CONFIRMED"
  );
  await withClient(bootstrapTargetUrl, async (target) => {
    await target.query(
      `update user_settings
          set theme = 'system', updated_at = $1
        where user_id = 'protected-bootstrap-admin'`,
      [originalBootstrapSettingsUpdatedAt]
    );
    await target.query(`
      insert into user_settings (user_id, theme, preferences)
      values ('demo-profile-admin', 'light', '{"foreignFixture":true}'::jsonb)
    `);
  });
  const foreignBootstrapSettingsDryRun = await runDatabaseMigration(bootstrapBaseConfig, migrationOptions);
  assert.equal(foreignBootstrapSettingsDryRun.targetClassification, "protected-non-synthetic");
  assert.equal(foreignBootstrapSettingsDryRun.targetClassificationEvidence.userSettingsRows, 2);
  assert.equal(foreignBootstrapSettingsDryRun.targetClassificationEvidence.unprovenDomainRows, 0);
  await withClient(bootstrapTargetUrl, async (target) => {
    await target.query("delete from user_settings where user_id = 'demo-profile-admin'");
  });
  const restoredBootstrapDryRun = await runDatabaseMigration(bootstrapBaseConfig, migrationOptions);
  assert.equal(restoredBootstrapDryRun.targetClassification, "synthetic-with-protected-bootstrap-profile");
  assert.equal(
    restoredBootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    "Das exakte Wiederherstellen der Bootstrap-Einstellungen muss den urspruenglichen Fingerprint ergeben."
  );
  await assert.rejects(
    runDatabaseMigration({
      ...bootstrapBaseConfig,
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      preImportBackupId: "pg16-bootstrap-backup"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "BOOTSTRAP_PROFILE_REPLACEMENT_NOT_CONFIRMED"
  );
  await assert.rejects(
    runDatabaseMigration({
      ...bootstrapBaseConfig,
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      confirmBootstrapProfileFingerprint: `sha256:${"0".repeat(64)}`,
      preImportBackupId: "pg16-bootstrap-backup"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError
      && error.code === "BOOTSTRAP_PROFILE_REPLACEMENT_NOT_CONFIRMED"
  );
  const bootstrapApplied = await runDatabaseMigration({
    ...bootstrapBaseConfig,
    apply: true,
    replaceSyntheticTarget: true,
    confirmReplacement: SYNTHETIC_SEED_ID,
    confirmBootstrapProfileFingerprint:
      bootstrapDryRun.targetClassificationEvidence.protectedBootstrapProfileFingerprint,
    preImportBackupId: "pg16-bootstrap-backup"
  }, migrationOptions);
  assert.equal(bootstrapApplied.targetClassification, "synthetic-with-protected-bootstrap-profile");
  await withClient(bootstrapTargetUrl, async (target) => {
    const removedBootstrap = await target.query(
      "select count(*)::int as count from profiles where id = 'protected-bootstrap-admin'"
    );
    assert.equal(removedBootstrap.rows[0].count, 0, "Das bestaetigte, ungebundene Bootstrap-Profil muss entfernt werden.");
    const sourceProfile = await target.query(
      "select count(*)::int as count from profiles where id = 'demo-profile-admin' and email = 'protected-admin@migration-smoke.example.invalid'"
    );
    assert.equal(sourceProfile.rows[0].count, 1, "Das passende Quellprofil muss ueber seine stabile ID importiert werden.");
    const bindings = await target.query("select count(*)::int as count from identity_bindings");
    assert.equal(bindings.rows[0].count, 0, "Die E-Mail-Uebereinstimmung darf keine Identity-Bindung erzeugen.");
  });

  const dryRun = await runDatabaseMigration(baseConfig, migrationOptions);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.writesPerformed, false);
  assert.equal(
    dryRun.targetClassification,
    "synthetic",
    `Synthetic classification evidence: ${JSON.stringify(dryRun.targetClassificationEvidence)}`
  );
  assert.equal(dryRun.identityBindingCount, 1);
  assert.equal(dryRun.missingIdentityBindingProfiles, 0);
  assert.equal(dryRun.profileImageMigration.rewritableSupabaseUrls, 1);

  await assert.rejects(
    runDatabaseMigration({
      ...baseConfig,
      targetProfileImageBucket: "",
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      preImportBackupId: "pg16-smoke-backup"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError && error.code === "PROFILE_IMAGE_BUCKET_REQUIRED"
  );

  await assert.rejects(
    runDatabaseMigration({
      ...baseConfig,
      apply: true,
      preImportBackupId: "pg16-smoke-backup"
    }, migrationOptions),
    (error) => error instanceof MigrationSafetyError && error.code === "SYNTHETIC_REPLACEMENT_NOT_CONFIRMED"
  );

  await assert.rejects(
    runDatabaseMigration({
      ...baseConfig,
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      preImportBackupId: "pg16-smoke-backup",
      gcpEnvironment: { PRE_IMPORT_BACKUP_ID: "stale-unapproved-backup" }
    }, {
      ...migrationOptions,
      gcpGate: async (gateEnvironment) => {
        assert.equal(gateEnvironment.PRE_IMPORT_BACKUP_ID, "pg16-smoke-backup",
          "Der Gate muss exakt die im Apply bestaetigte Backup-ID pruefen.");
        return { ok: false, fingerprint: "" };
      }
    }),
    (error) => error instanceof MigrationSafetyError && error.code === "GCP_GATE_REQUIRED"
  );
  let changingGateCalls = 0;
  await assert.rejects(
    runDatabaseMigration({
      ...baseConfig,
      apply: true,
      replaceSyntheticTarget: true,
      confirmReplacement: SYNTHETIC_SEED_ID,
      preImportBackupId: "pg16-smoke-backup"
    }, {
      ...migrationOptions,
      gcpGate: async () => {
        changingGateCalls += 1;
        return {
          ok: true,
          fingerprint: `sha256:${"8".repeat(64)}`,
          targetDatabase: {
            connectionName: changingGateCalls === 1
              ? syntheticTargetConnectionName
              : "migration-smoke-target:europe-west3:other-postgres"
          }
        };
      }
    }),
    (error) => error instanceof MigrationSafetyError
      && error.code === "TARGET_MANAGED_PROXY_INSTANCE_MISMATCH"
  );

  const applied = await runDatabaseMigration({
    ...baseConfig,
    apply: true,
    replaceSyntheticTarget: true,
    confirmReplacement: SYNTHETIC_SEED_ID,
    preImportBackupId: "pg16-smoke-backup"
  }, migrationOptions);
  assert.equal(applied.mode, "apply");
  assert.ok(gcpGateCalls > 0, "Jeder schreibende DB-Pfad muss das frische GCP-Gate durchlaufen.");
  assert.equal(applied.writesPerformed, true);
  assert.equal(applied.supportedTableCount, 29);
  assert.ok(applied.verifiedForeignKeyCount > 0);
  assert.equal(applied.storageMigration.remediatedObjectCount, 1);
  assert.equal(
    applied.storageMigration.remediationManifestFingerprint,
    `sha256:${"8".repeat(64)}`
  );
  for (const table of MIGRATION_TABLES) {
    assert.ok(applied.source[table].count > 0, `Der PG16-Smoke muss ${table} mit mindestens einer Zeile migrieren.`);
    assert.deepEqual(applied.targetAfter[table], applied.source[table], `${table} wurde nicht exakt reconciled.`);
  }

  await withClient(targetUrl, async (target) => {
    const identity = await target.query(
      "select issuer, subject, profile_id, active from identity_bindings"
    );
    assert.deepEqual(identity.rows, [{
      issuer: "https://identity.smoke.example.invalid",
      subject: "synthetic-smoke-subject",
      profile_id: "demo-profile-admin",
      active: true
    }]);
    const generated = await target.query(
      "select contact_search_vector is not null as generated from contacts where id = 'demo-contact-01'"
    );
    assert.equal(generated.rows[0].generated, true, "Die Ziel-DB muss Suchvektoren selbst generieren.");
    const avatar = await target.query("select avatar_url from profiles where id = 'demo-profile-admin'");
    assert.equal(
      avatar.rows[0].avatar_url,
      "gs://profile-images-migration-smoke/profile-images/demo-profile-admin/avatar.png",
      "Supabase-Profilbild-URLs müssen deterministisch auf den bestätigten GCS-Pfad umgeschrieben werden."
    );
    const stakeholderLogo = await target.query(
      "select logo_url from stakeholder_organizations where id = 'migration-smoke-stakeholder-org'"
    );
    assert.equal(
      stakeholderLogo.rows[0].logo_url,
      "private://stakeholder-logos/migration-smoke/logo.png",
      "Private Stakeholder-Logo-Referenzen müssen unverändert bleiben."
    );
    const runs = await target.query("select id, report from import_runs order by created_at");
    assert.equal(runs.rowCount, 1, "Der synthetische Marker muss durch genau einen aggregierten Migrationslauf ersetzt werden.");
    assert.equal(runs.rows[0].id, applied.importRunId);
    assert.equal(runs.rows[0].report.preImportBackupId, "pg16-smoke-backup");
    assert.equal("rows" in runs.rows[0].report, false, "Import-Metadaten dürfen keine Datensätze enthalten.");
  });

  await withClient(sourceTlsUrl, async (source) => {
    await source.query("update contacts set name = 'ROLLBACK TRIGGER' where id = 'demo-contact-01'");
  });
  await withClient(rollbackTargetUrl, async (target) => {
    await target.query(
      "alter table contacts add constraint migration_smoke_rollback_check check (name <> 'ROLLBACK TRIGGER')"
    );
  });

  const rollbackPreviewConfig = {
    ...baseConfig,
    targetDatabaseUrl: runtimeRollbackTargetUrl,
    expectedTargetDatabaseName: "target_rollback"
  };
  const rollbackSourcePreview = await runDatabaseMigration(rollbackPreviewConfig, migrationOptions);
  const rollbackConfig = {
    ...rollbackPreviewConfig,
    confirmSourceSnapshotFingerprint: rollbackSourcePreview.sourceSnapshotFingerprint,
    apply: true,
    replaceSyntheticTarget: true,
    confirmReplacement: SYNTHETIC_SEED_ID,
    preImportBackupId: "pg16-smoke-rollback-backup"
  };
  await assert.rejects(
    runDatabaseMigration(rollbackConfig, migrationOptions),
    (error) => error?.code === "DATABASE_OPERATION_FAILED" && error.table === "contacts"
  );
  await withClient(rollbackTargetUrl, async (target) => {
    const contact = await target.query("select name from contacts where id = 'demo-contact-01'");
    assert.notEqual(contact.rows[0].name, "ROLLBACK TRIGGER", "Fehlgeschlagener Import muss vollständig zurückgerollt werden.");
    const identity = await target.query("select count(*)::int as count from identity_bindings");
    assert.equal(identity.rows[0].count, 1, "Rollback muss Identity Bindings erhalten.");
    const seedMarker = await target.query(
      "select count(*)::int as count from import_runs where id = $1 or id = 'demo-import-' || $1",
      [SYNTHETIC_SEED_ID]
    );
    assert.equal(seedMarker.rows[0].count, 1, "Rollback muss den synthetischen Importmarker wiederherstellen.");
  });
  await withClient(rollbackTargetUrl, async (target) => {
    await target.query(syntheticAvatarPatchSql);
    const avatarPatchedFingerprint = await syntheticSeedContentFingerprint(target);
    assert.equal(
      SYNTHETIC_SEED_CONTENT_MANIFESTS.find(
        (manifest) => manifest.fingerprint === avatarPatchedFingerprint
      )?.id,
      "pre-gematik-synthetic-v1@c3013bb/avatar-patch-v1",
      "Der versionierte synthetische Avatar-Patch braucht einen exakten Seed-Manifest-Fingerprint."
    );
    await target.query(`
      update profiles
         set updated_at = updated_at + interval '37 minutes'
       where id in ('demo-profile-admin', 'demo-profile-editor', 'demo-profile-viewer')
    `);
    assert.equal(
      await syntheticSeedContentFingerprint(target),
      avatarPatchedFingerprint,
      "Die belegte, trigger-variable Avatar-Auditzeit muss stabil normalisiert werden."
    );
    await target.query(`
      update profiles
         set display_name = 'MANIPULIERTER FACHINHALT'
       where id = 'demo-profile-admin'
    `);
    assert.equal(
      EXPECTED_SYNTHETIC_SEED_CONTENT_FINGERPRINTS.includes(
        await syntheticSeedContentFingerprint(target)
      ),
      false,
      "Die Auditzeit-Normalisierung darf manipulierte Profil-Fachfelder niemals verdecken."
    );
  });

  console.log("PostgreSQL-16 migration smoke OK: dry-run, safety confirmation, 29-table import, reconciliation and rollback verified.");
} catch (error) {
  const logs = spawnSync("docker", ["logs", "--tail", "80", containerName], { encoding: "utf8" });
  const safeLogs = (logs.stderr || logs.stdout || "").slice(-8_000);
  throw new Error(`${error.message}\nPostgreSQL smoke container logs:\n${safeLogs}`, { cause: error });
} finally {
  if (containerName) spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  rmSync(certificateDirectory, { recursive: true, force: true });
}
