import { X509Certificate, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  constants as fsConstants,
  accessSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { checkPreGematikMigrationGcp } from "../check_pre_gematik_migration_gcp.mjs";
import {
  CloudSqlManagedProxyError,
  assertCloudSqlGateTarget,
  assertManagedCloudSqlProxyMatchesGate,
  cloudSqlProxyConnectMode,
  startManagedCloudSqlAuthProxy
} from "./cloud-sql-managed-proxy.mjs";
import {
  TargetDatabaseConnectionError,
  validateTargetDatabaseConnection
} from "./target-database-connection.mjs";

export const MIGRATION_VERSION = "supabase-to-pre-gematik-v1";
export const SYNTHETIC_SEED_ID = "pre-gematik-synthetic-v1";

export const SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM =
  "complete-replaceable-content-v2";

// Fail-closed manifests for immutable, reviewed synthetic seed artifacts.
// Every fingerprint covers every row and field in all migration tables plus
// the synthetic import marker. The only normalizations are documented next to
// normalizeSyntheticSeedRecord below. Adding a variant requires reconstructing
// its committed SQL artifact in PostgreSQL 16 and recording that artifact's
// own SHA-256 here as an independent provenance pin.
export const SYNTHETIC_SEED_CONTENT_MANIFESTS = Object.freeze([
  Object.freeze({
    id: "pre-gematik-synthetic-v1@76253c7/base",
    seedRevision: "76253c7",
    seedArtifactSha256: "sha256:42057ebbc13412a01df65882a5d886bc19cab14998915a11475f04c388a34b36",
    avatarPatch: false,
    fingerprint: "sha256:7a119e8d4ac2d33f271af13807a354a2cfcf90cb6196838c0549c693d0ac5d89"
  }),
  Object.freeze({
    id: "pre-gematik-synthetic-v1@76253c7/avatar-patch-v1",
    seedRevision: "76253c7",
    seedArtifactSha256: "sha256:42057ebbc13412a01df65882a5d886bc19cab14998915a11475f04c388a34b36",
    avatarPatch: true,
    fingerprint: "sha256:542a58741ffbdd02e535226f6f0f06c50015715eb6cffd61544c96dae001f44c"
  }),
  Object.freeze({
    id: "pre-gematik-synthetic-v1@fac533f/base",
    seedRevision: "fac533f",
    seedArtifactSha256: "sha256:b3b777c81808c28f38c93d06a50586cf9b25f494b23608a256a11c26140a6195",
    avatarPatch: false,
    fingerprint: "sha256:870f13b53c11489ac7089ae86ea7d283ee1ee9260c2d79f9e8278612e06b03e0"
  }),
  Object.freeze({
    id: "pre-gematik-synthetic-v1@fac533f/avatar-patch-v1",
    seedRevision: "fac533f",
    seedArtifactSha256: "sha256:b3b777c81808c28f38c93d06a50586cf9b25f494b23608a256a11c26140a6195",
    avatarPatch: true,
    fingerprint: "sha256:08a17503e957f8ed1a3a6414f2703bf2d372d2e9f29887c37a90e3c56e1cdfae"
  }),
  Object.freeze({
    id: "pre-gematik-synthetic-v1@c3013bb/base",
    seedRevision: "c3013bb",
    seedArtifactSha256: "sha256:1377380553b952ea8c274f85b5a3cc6ad0fbebf5ed838a805db4648cf2ed9b86",
    avatarPatch: false,
    fingerprint: "sha256:d64d686fde252fd41ae1e69a92872b51d45c3a69946b9d55f40d91e04c333834"
  }),
  Object.freeze({
    id: "pre-gematik-synthetic-v1@c3013bb/avatar-patch-v1",
    seedRevision: "c3013bb",
    seedArtifactSha256: "sha256:1377380553b952ea8c274f85b5a3cc6ad0fbebf5ed838a805db4648cf2ed9b86",
    avatarPatch: true,
    fingerprint: "sha256:32f5c96c1bc39be7db0171ea11a74396969b009c2b6f46b31ba2956028115d59"
  })
]);

export const EXPECTED_SYNTHETIC_SEED_CONTENT_FINGERPRINTS = Object.freeze(
  SYNTHETIC_SEED_CONTENT_MANIFESTS.map((manifest) => manifest.fingerprint)
);

// Reihenfolge ist zugleich die FK-sichere Importreihenfolge. Alles, was hier nicht
// explizit genannt ist, wird weder gelesen noch geschrieben.
export const MIGRATION_TABLES = Object.freeze([
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

export const GENERATED_COLUMNS = Object.freeze({
  contacts: Object.freeze(["contact_search_vector"]),
  contact_notes: Object.freeze(["search_vector"]),
  contact_note_attachments: Object.freeze(["search_vector"])
});

const REVERSE_MIGRATION_TABLES = Object.freeze([...MIGRATION_TABLES].reverse());
const IDENTITY_TABLES = Object.freeze([
  "activity_events",
  "changes",
  "hospitation_observation_changes"
]);
const SOURCE_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const TARGET_DATABASE_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,62}$/;
const BACKUP_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{2,255}$/;
const GCS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GCP_PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const STORAGE_MANIFEST_SCHEMA = "versorgungs-kompass-storage-manifest-v1";
const MAX_STORAGE_MANIFEST_BYTES = 16 * 1024 * 1024;
const PROJECT_ROOT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const PROFILE_IMAGE_EXTENSIONS = new Map([
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["png", "png"],
  ["webp", "webp"]
]);
const BATCH_SIZE = 100;
const MAX_SEQUENCE_ADVANCE = 1_000_000n;
const SYNTHETIC_PROFILE_AVATAR_PATCH_V1 = Object.freeze({
  "demo-profile-admin": "/public/demo-profile-admin.svg",
  "demo-profile-editor": "/public/demo-profile-editor.svg",
  "demo-profile-viewer": "/public/demo-profile-viewer.svg"
});

export class MigrationSafetyError extends Error {
  constructor(message, code = "MIGRATION_SAFETY") {
    super(message);
    this.name = "MigrationSafetyError";
    this.code = code;
  }
}

class SafeDatabaseError extends Error {
  constructor(operation, error, table = null) {
    const pgCode = typeof error?.code === "string" ? error.code : "unknown";
    const constraint = typeof error?.constraint === "string" ? error.constraint : null;
    const context = [table ? `table=${table}` : null, `pg_code=${pgCode}`, constraint ? `constraint=${constraint}` : null]
      .filter(Boolean)
      .join(", ");
    super(`Database operation '${operation}' failed (${context}). No row contents were logged.`);
    this.name = "SafeDatabaseError";
    this.code = "DATABASE_OPERATION_FAILED";
    this.pgCode = pgCode;
    this.table = table;
    this.constraint = constraint;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function assertNonSecretConfig(config) {
  if (!config.sourceDatabaseUrl) {
    throw new MigrationSafetyError("SOURCE_DATABASE_URL is required.", "SOURCE_URL_REQUIRED");
  }
  if (!config.targetDatabaseUrl) {
    throw new MigrationSafetyError("TARGET_DATABASE_URL is required.", "TARGET_URL_REQUIRED");
  }
  if (!SOURCE_PROJECT_ID_PATTERN.test(config.expectedSourceProjectId || "")) {
    throw new MigrationSafetyError(
      "EXPECTED_SOURCE_PROJECT_ID must be a lowercase project reference.",
      "SOURCE_PROJECT_ID_REQUIRED"
    );
  }
  if (!TARGET_DATABASE_PATTERN.test(config.expectedTargetDatabaseName || "")) {
    throw new MigrationSafetyError(
      "EXPECTED_TARGET_DATABASE_NAME must be an explicit database name.",
      "TARGET_DATABASE_REQUIRED"
    );
  }
  if (config.apply && !BACKUP_ID_PATTERN.test(config.preImportBackupId || "")) {
    throw new MigrationSafetyError(
      "Apply mode requires a concrete PRE_IMPORT_BACKUP_ID.",
      "PRE_IMPORT_BACKUP_REQUIRED"
    );
  }
  if (config.targetProfileImageBucket
      && (!GCS_BUCKET_PATTERN.test(config.targetProfileImageBucket)
        || config.targetProfileImageBucket.includes(".."))) {
    throw new MigrationSafetyError(
      "TARGET_PROFILE_IMAGE_BUCKET is not a valid explicit GCS bucket name.",
      "PROFILE_IMAGE_BUCKET_INVALID"
    );
  }
  if (config.targetContactImageBucket
      && (!GCS_BUCKET_PATTERN.test(config.targetContactImageBucket)
        || config.targetContactImageBucket.includes(".."))) {
    throw new MigrationSafetyError(
      "TARGET_CONTACT_IMAGE_BUCKET is not a valid explicit GCS bucket name.",
      "CONTACT_IMAGE_BUCKET_INVALID"
    );
  }
  if (config.targetContactNoteAttachmentBucket
      && (!GCS_BUCKET_PATTERN.test(config.targetContactNoteAttachmentBucket)
        || config.targetContactNoteAttachmentBucket.includes(".."))) {
    throw new MigrationSafetyError(
      "TARGET_CONTACT_NOTE_ATTACHMENT_BUCKET is not a valid explicit GCS bucket name.",
      "CONTACT_NOTE_ATTACHMENT_BUCKET_INVALID"
    );
  }
  if (config.targetStakeholderLogoBucket
      && (!GCS_BUCKET_PATTERN.test(config.targetStakeholderLogoBucket)
        || config.targetStakeholderLogoBucket.includes(".."))) {
    throw new MigrationSafetyError(
      "TARGET_STAKEHOLDER_LOGO_BUCKET is not a valid explicit GCS bucket name.",
      "STAKEHOLDER_LOGO_BUCKET_INVALID"
    );
  }
  if (config.apply && !GCP_PROJECT_ID_PATTERN.test(config.expectedTargetProjectId)) {
    throw new MigrationSafetyError(
      "Apply mode requires EXPECTED_TARGET_PROJECT_ID.",
      "TARGET_PROJECT_ID_REQUIRED"
    );
  }
  if (config.apply) {
    const actualProjectPairFingerprint = `sha256:${createHash("sha256")
      .update(`${config.expectedSourceProjectId}\0${config.expectedTargetProjectId}`)
      .digest("hex")}`;
    if (!SHA256_FINGERPRINT_PATTERN.test(config.expectedProjectPairFingerprint)
        || !timingSafeEqual(
          Buffer.from(actualProjectPairFingerprint),
          Buffer.from(config.expectedProjectPairFingerprint)
        )) {
      throw new MigrationSafetyError(
        "Protected source and target projects do not match the independently approved SHA-256 pin.",
        "PROJECT_PAIR_FINGERPRINT_MISMATCH"
      );
    }
  }
  if (config.apply && !config.storageMigrationManifestPath) {
    throw new MigrationSafetyError(
      "Apply mode requires the protected Storage apply manifest.",
      "STORAGE_MANIFEST_REQUIRED"
    );
  }
  if (config.apply && !SHA256_FINGERPRINT_PATTERN.test(config.confirmStorageManifestFingerprint)) {
    throw new MigrationSafetyError(
      "Apply mode requires the exact Storage manifest fingerprint.",
      "STORAGE_MANIFEST_FINGERPRINT_REQUIRED"
    );
  }
  if (config.apply && !SHA256_FINGERPRINT_PATTERN.test(config.confirmSourceSnapshotFingerprint)) {
    throw new MigrationSafetyError(
      "Apply mode requires the exact source snapshot fingerprint from the approved dry-run.",
      "SOURCE_SNAPSHOT_FINGERPRINT_REQUIRED"
    );
  }
  if (config.apply && !/^(?:0|[1-9][0-9]*)$/.test(config.confirmQuarantinedObjectCount)) {
    throw new MigrationSafetyError(
      "Apply mode requires the exact quarantined object count from the Storage manifest.",
      "STORAGE_QUARANTINE_CONFIRMATION_REQUIRED"
    );
  }
  if (config.confirmBootstrapProfileFingerprint
      && !SHA256_FINGERPRINT_PATTERN.test(config.confirmBootstrapProfileFingerprint)) {
    throw new MigrationSafetyError(
      "The bootstrap-profile confirmation must be a sha256 fingerprint from the current dry-run.",
      "BOOTSTRAP_PROFILE_FINGERPRINT_INVALID"
    );
  }
}

export function assertSourceTlsConfig(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new MigrationSafetyError("SOURCE_DATABASE_URL is not a valid URL.", "SOURCE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new MigrationSafetyError("SOURCE_DATABASE_URL must use PostgreSQL.", "SOURCE_URL_INVALID");
  }
  const sslModes = parsed.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || sslModes[0] !== "verify-full") {
    throw new MigrationSafetyError(
      "Supabase source TLS must use exactly sslmode=verify-full.",
      "SOURCE_TLS_VERIFY_FULL_REQUIRED"
    );
  }
  const rootCertificatePaths = parsed.searchParams.getAll("sslrootcert");
  if (rootCertificatePaths.length !== 1 || !isAbsolute(rootCertificatePaths[0])) {
    throw new MigrationSafetyError(
      "Supabase source TLS requires one absolute sslrootcert path.",
      "SOURCE_TLS_ROOT_CERT_REQUIRED"
    );
  }
  const certificatePath = rootCertificatePaths[0];
  try {
    accessSync(certificatePath, fsConstants.R_OK);
    if (!statSync(certificatePath).isFile()) throw new Error("not-a-file");
    const certificate = new X509Certificate(readFileSync(certificatePath));
    if (!certificate.ca) throw new Error("not-a-ca");
  } catch {
    throw new MigrationSafetyError(
      "The configured Supabase sslrootcert is not a readable CA certificate file.",
      "SOURCE_TLS_ROOT_CERT_INVALID"
    );
  }
  return Object.freeze({ sslMode: "verify-full", rootCertificateVerified: true });
}

export function assertTargetDatabaseConnection(connectionString) {
  try {
    return validateTargetDatabaseConnection(connectionString);
  } catch (error) {
    if (error instanceof TargetDatabaseConnectionError) {
      throw new MigrationSafetyError(error.message, error.code);
    }
    throw error;
  }
}

export function sourceUrlMatchesProject(connectionString, expectedProjectId) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username || "").toLowerCase();
  const projectId = String(expectedProjectId || "").toLowerCase();
  const directHostMatches = hostname === `db.${projectId}.supabase.co`;
  const officialPoolerHost = hostname.endsWith(".pooler.supabase.com")
    && hostname !== "pooler.supabase.com";
  return directHostMatches
    || (officialPoolerHost && username.endsWith(`.${projectId}`));
}

function assertSourceUrlIdentity(config) {
  if (!sourceUrlMatchesProject(config.sourceDatabaseUrl, config.expectedSourceProjectId)) {
    throw new MigrationSafetyError(
      "The source connection descriptor does not match EXPECTED_SOURCE_PROJECT_ID.",
      "SOURCE_IDENTITY_MISMATCH"
    );
  }
}

function pathIsInside(candidate, parent) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === ""
    || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

function assertExactObjectKeys(value, expectedKeys, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MigrationSafetyError("The Storage manifest structure is invalid.", code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new MigrationSafetyError("The Storage manifest structure is invalid.", code);
  }
}

function assertManifestObjectPath(value) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (typeof value !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$/.test(value)
      || value.includes("\\")
      || value.endsWith("/")
      || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new MigrationSafetyError("The Storage manifest contains an unsafe object path.", "STORAGE_MANIFEST_OBJECT_INVALID");
  }
}

function storageManifestFingerprint(payload) {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export function loadVerifiedStorageManifest(config) {
  const requestedPath = config.storageMigrationManifestPath;
  if (!isAbsolute(requestedPath)) {
    throw new MigrationSafetyError("The Storage manifest path must be absolute.", "STORAGE_MANIFEST_PATH_INVALID");
  }
  let manifestPath;
  let fileStat;
  let manifest;
  try {
    const unresolved = resolve(requestedPath);
    const linkStat = lstatSync(unresolved);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) throw new Error("unsafe-file");
    manifestPath = realpathSync(unresolved);
    fileStat = statSync(manifestPath);
    if (pathIsInside(manifestPath, PROJECT_ROOT)) throw new Error("inside-repository");
    if ((fileStat.mode & 0o777) !== 0o600) throw new Error("unsafe-mode");
    if (typeof process.getuid === "function" && fileStat.uid !== process.getuid()) throw new Error("wrong-owner");
    if (fileStat.size < 2 || fileStat.size > MAX_STORAGE_MANIFEST_BYTES) throw new Error("unsafe-size");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new MigrationSafetyError(
      "The protected Storage manifest is not a readable owner-only regular JSON file outside the repository.",
      "STORAGE_MANIFEST_FILE_INVALID"
    );
  }

  assertExactObjectKeys(manifest, [
    "schemaVersion",
    "mode",
    "sourceProject",
    "targetProject",
    "projectPairFingerprint",
    "snapshotFingerprint",
    "sourceObjectCount",
    "migratableObjectCount",
    "quarantinedObjectCount",
    "entries",
    "manifestFingerprint"
  ], "STORAGE_MANIFEST_STRUCTURE_INVALID");
  if (manifest.schemaVersion !== STORAGE_MANIFEST_SCHEMA || manifest.mode !== "apply") {
    throw new MigrationSafetyError("A completed Storage apply manifest is required.", "STORAGE_MANIFEST_MODE_INVALID");
  }
  if (manifest.sourceProject !== config.expectedSourceProjectId
      || manifest.targetProject !== config.expectedTargetProjectId) {
    throw new MigrationSafetyError("Storage manifest environment identity mismatch.", "STORAGE_MANIFEST_ENVIRONMENT_MISMATCH");
  }
  if (!SHA256_FINGERPRINT_PATTERN.test(manifest.projectPairFingerprint)
      || manifest.projectPairFingerprint !== config.expectedProjectPairFingerprint) {
    throw new MigrationSafetyError(
      "Storage manifest project-pair pin does not match the approved migration pair.",
      "STORAGE_MANIFEST_PROJECT_PAIR_MISMATCH"
    );
  }
  if (!SHA256_FINGERPRINT_PATTERN.test(manifest.snapshotFingerprint)
      || !SHA256_FINGERPRINT_PATTERN.test(manifest.manifestFingerprint)) {
    throw new MigrationSafetyError("Storage manifest fingerprints are malformed.", "STORAGE_MANIFEST_FINGERPRINT_INVALID");
  }
  if (!Array.isArray(manifest.entries)
      || !Number.isSafeInteger(manifest.sourceObjectCount)
      || !Number.isSafeInteger(manifest.migratableObjectCount)
      || !Number.isSafeInteger(manifest.quarantinedObjectCount)
      || Math.min(
        manifest.sourceObjectCount,
        manifest.migratableObjectCount,
        manifest.quarantinedObjectCount
      ) < 0
      || manifest.entries.length !== manifest.sourceObjectCount
      || manifest.migratableObjectCount + manifest.quarantinedObjectCount !== manifest.sourceObjectCount) {
    throw new MigrationSafetyError("Storage manifest aggregate counts are inconsistent.", "STORAGE_MANIFEST_COUNT_INVALID");
  }

  const sourceKeys = new Set();
  const targetKeys = new Set();
  let observedQuarantined = 0;
  for (const entry of manifest.entries) {
    const quarantine = entry?.status === "quarantined";
    assertExactObjectKeys(
      entry,
      quarantine
        ? ["sourceRef", "targetObject", "sha256", "size", "mimeType", "status", "reason"]
        : ["sourceRef", "targetObject", "sha256", "size", "mimeType", "status"],
      "STORAGE_MANIFEST_ENTRY_INVALID"
    );
    assertExactObjectKeys(entry.sourceRef, ["bucket", "object"], "STORAGE_MANIFEST_ENTRY_INVALID");
    assertExactObjectKeys(entry.targetObject, ["bucket", "object"], "STORAGE_MANIFEST_ENTRY_INVALID");
    if (!Object.hasOwn({ "created": true, "verified-identical": true, quarantined: true }, entry.status)
        || !["profile-images", "contact-images", "contact-note-attachments", "stakeholder-logos"]
          .includes(entry.sourceRef.bucket)
        || !GCS_BUCKET_PATTERN.test(entry.targetObject.bucket)
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(entry.sourceRef.bucket)
        || !SHA256_FINGERPRINT_PATTERN.test(entry.sha256)
        || !Number.isSafeInteger(entry.size)
        || entry.size < 0
        || typeof entry.mimeType !== "string"
        || entry.mimeType.length < 3
        || entry.mimeType.length > 255
        || (quarantine && (typeof entry.reason !== "string" || entry.reason.length < 1))) {
      throw new MigrationSafetyError("The Storage manifest contains an invalid entry.", "STORAGE_MANIFEST_ENTRY_INVALID");
    }
    assertManifestObjectPath(entry.sourceRef.object);
    assertManifestObjectPath(entry.targetObject.object);
    const sourceKey = `${entry.sourceRef.bucket}\0${entry.sourceRef.object}`;
    const targetKey = `${entry.targetObject.bucket}\0${entry.targetObject.object}`;
    if (sourceKeys.has(sourceKey) || targetKeys.has(targetKey)) {
      throw new MigrationSafetyError("The Storage manifest contains duplicate object references.", "STORAGE_MANIFEST_DUPLICATE_OBJECT");
    }
    sourceKeys.add(sourceKey);
    targetKeys.add(targetKey);
    if (quarantine) observedQuarantined += 1;
  }
  if (observedQuarantined !== manifest.quarantinedObjectCount
      || String(observedQuarantined) !== config.confirmQuarantinedObjectCount) {
    throw new MigrationSafetyError(
      "The quarantined Storage object count does not match the explicit confirmation.",
      "STORAGE_QUARANTINE_CONFIRMATION_MISMATCH"
    );
  }

  const payload = {
    schemaVersion: manifest.schemaVersion,
    mode: manifest.mode,
    sourceProject: manifest.sourceProject,
    targetProject: manifest.targetProject,
    projectPairFingerprint: manifest.projectPairFingerprint,
    snapshotFingerprint: manifest.snapshotFingerprint,
    sourceObjectCount: manifest.sourceObjectCount,
    migratableObjectCount: manifest.migratableObjectCount,
    quarantinedObjectCount: manifest.quarantinedObjectCount,
    entries: manifest.entries
  };
  const calculatedFingerprint = storageManifestFingerprint(payload);
  if (calculatedFingerprint !== manifest.manifestFingerprint
      || calculatedFingerprint !== config.confirmStorageManifestFingerprint) {
    throw new MigrationSafetyError(
      "Storage manifest content or explicit fingerprint confirmation does not match.",
      "STORAGE_MANIFEST_FINGERPRINT_MISMATCH"
    );
  }
  return Object.freeze({
    ...manifest,
    manifestPathVerified: true
  });
}

function createClient(connectionString, applicationName) {
  return new Client({
    connectionString,
    application_name: applicationName,
    connectionTimeoutMillis: 15_000,
    keepAlive: true
  });
}

async function safeQuery(client, operation, query, values = [], table = null) {
  try {
    return await client.query(query, values);
  } catch (error) {
    throw new SafeDatabaseError(operation, error, table);
  }
}

async function connect(client, label) {
  try {
    await client.connect();
  } catch (error) {
    throw new SafeDatabaseError(`connect-${label}`, error);
  }
}

async function beginSourceSnapshot(client) {
  await safeQuery(
    client,
    "begin-source-snapshot",
    "begin isolation level repeatable read, read only"
  );
  await safeQuery(client, "source-timeouts", "set local statement_timeout = '5min'");
  const state = await safeQuery(client, "verify-source-read-only", "show transaction_read_only");
  if (state.rows[0]?.transaction_read_only !== "on") {
    throw new MigrationSafetyError("Source transaction is not read-only.", "SOURCE_NOT_READ_ONLY");
  }
}

async function beginTargetTransaction(client, apply) {
  await safeQuery(
    client,
    "begin-target-transaction",
    apply
      ? "begin isolation level serializable, read write"
      : "begin isolation level repeatable read, read only"
  );
  await safeQuery(client, "target-timeouts", "set local lock_timeout = '10s'; set local statement_timeout = '5min'");
  const state = await safeQuery(client, "verify-target-mode", "show transaction_read_only");
  const expected = apply ? "off" : "on";
  if (state.rows[0]?.transaction_read_only !== expected) {
    throw new MigrationSafetyError(
      `Target transaction_read_only must be ${expected}.`,
      "TARGET_TRANSACTION_MODE_MISMATCH"
    );
  }
  if (apply) {
    await safeQuery(
      client,
      "migration-advisory-lock",
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [MIGRATION_VERSION]
    );
  }
}

async function verifyTargetDatabase(client, expectedDatabaseName) {
  const result = await safeQuery(client, "verify-target-database", "select current_database() as database_name");
  if (result.rows[0]?.database_name !== expectedDatabaseName) {
    throw new MigrationSafetyError(
      "Connected target database does not match EXPECTED_TARGET_DATABASE_NAME.",
      "TARGET_IDENTITY_MISMATCH"
    );
  }
}

async function verifyTargetMigrationPrivileges(client, apply) {
  const tables = [...MIGRATION_TABLES, "import_runs"];
  const tablePrivileges = await safeQuery(
    client,
    "verify-target-table-privileges",
    `select table_name,
            has_table_privilege(current_user, format('public.%I', table_name), 'SELECT') as can_select,
            has_table_privilege(current_user, format('public.%I', table_name), 'INSERT') as can_insert,
            has_table_privilege(current_user, format('public.%I', table_name), 'UPDATE') as can_update,
            has_table_privilege(current_user, format('public.%I', table_name), 'DELETE') as can_delete
       from unnest($1::text[]) as requested(table_name)
      order by table_name`,
    [tables]
  );
  const invalidTables = tablePrivileges.rows.filter((row) => (
    row.can_select !== true
    || (apply && (row.can_insert !== true || row.can_update !== true || row.can_delete !== true))
  ));
  if (invalidTables.length > 0) {
    throw new MigrationSafetyError(
      `Target migration role is missing required privileges on ${invalidTables.length} allowlisted table(s).`,
      "TARGET_MIGRATION_PRIVILEGES_MISSING"
    );
  }

  const boundary = await safeQuery(
    client,
    "verify-target-identity-boundary",
    `select has_table_privilege(current_user, 'public.identity_bindings', 'SELECT') as can_select`
  );
  if (boundary.rows[0]?.can_select !== true) {
    throw new MigrationSafetyError(
      "Target migration role cannot verify the identity-binding preservation boundary.",
      "TARGET_IDENTITY_READ_MISSING"
    );
  }

  if (apply) {
    const sequencePrivileges = await safeQuery(
      client,
      "verify-target-sequence-privileges",
      `select sequence_name,
              has_sequence_privilege(current_user, format('public.%I', sequence_name), 'USAGE') as can_use,
              has_sequence_privilege(current_user, format('public.%I', sequence_name), 'SELECT') as can_select
         from unnest($1::text[]) as requested(sequence_name)
        order by sequence_name`,
      [IDENTITY_TABLES.map((table) => `${table}_id_seq`)]
    );
    if (sequencePrivileges.rows.some((row) => row.can_use !== true || row.can_select !== true)) {
      throw new MigrationSafetyError(
        "Target migration role lacks the sequence privileges required for collision-safe advancement.",
        "TARGET_SEQUENCE_PRIVILEGES_MISSING"
      );
    }
  }
}

async function verifySourceCanSeeCompleteTables(client) {
  const result = await safeQuery(
    client,
    "verify-source-rls-bypass",
    `select count(*)::int as unsafe_table_count
       from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
       join pg_catalog.pg_roles login_role on login_role.rolname = current_user
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and relation.relkind in ('r', 'p')
        and not (
          login_role.rolsuper
          or login_role.rolbypassrls
          or (
            pg_has_role(current_user, relation.relowner, 'MEMBER')
            and not relation.relforcerowsecurity
          )
        )`,
    [MIGRATION_TABLES]
  );
  if (result.rows[0].unsafe_table_count !== 0) {
    throw new MigrationSafetyError(
      `${result.rows[0].unsafe_table_count} source table(s) may be filtered by row-level security; complete export is not proven.`,
      "SOURCE_RLS_BYPASS_NOT_PROVEN"
    );
  }
}

async function loadColumns(client, table) {
  const result = await safeQuery(
    client,
    "inspect-columns",
    `select
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default,
       is_generated,
       identity_generation,
       character_maximum_length,
       numeric_precision,
       numeric_scale,
       datetime_precision,
       ordinal_position
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [table],
    table
  );
  if (result.rowCount === 0) {
    throw new MigrationSafetyError(`Required table is missing: public.${table}.`, "TABLE_MISSING");
  }
  return result.rows;
}

async function loadPrimaryKey(client, table) {
  const result = await safeQuery(
    client,
    "inspect-primary-key",
    `select attribute.attname as column_name
       from pg_catalog.pg_index index_definition
       join pg_catalog.pg_class relation on relation.oid = index_definition.indrelid
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
       join unnest(index_definition.indkey) with ordinality as key(attnum, ordinal) on true
       join pg_catalog.pg_attribute attribute
         on attribute.attrelid = relation.oid and attribute.attnum = key.attnum
      where namespace.nspname = 'public'
        and relation.relname = $1
        and index_definition.indisprimary
      order by key.ordinal`,
    [table],
    table
  );
  if (result.rowCount === 0) {
    throw new MigrationSafetyError(`Primary key is missing: public.${table}.`, "PRIMARY_KEY_MISSING");
  }
  return result.rows.map((row) => row.column_name);
}

function isGenerated(column) {
  return column.is_generated === "ALWAYS";
}

function numericTypmodCanRepresent(source, target) {
  if (target.numeric_precision === null) return true;
  if (source.numeric_precision === null) return false;
  const sourceScale = Number(source.numeric_scale || 0);
  const targetScale = Number(target.numeric_scale || 0);
  const sourceIntegerDigits = Number(source.numeric_precision) - sourceScale;
  const targetIntegerDigits = Number(target.numeric_precision) - targetScale;
  return targetScale >= sourceScale && targetIntegerDigits >= sourceIntegerDigits;
}

export function isTypeCompatible(source, target) {
  if (source.udt_name === target.udt_name) {
    if (["varchar", "bpchar"].includes(source.udt_name)) {
      return target.character_maximum_length === null
        || (source.character_maximum_length !== null
          && Number(target.character_maximum_length) >= Number(source.character_maximum_length));
    }
    if (source.udt_name === "numeric") return numericTypmodCanRepresent(source, target);
    if (["timestamp", "timestamptz", "time", "timetz"].includes(source.udt_name)) {
      return target.datetime_precision === null
        || (source.datetime_precision !== null
          && Number(target.datetime_precision) >= Number(source.datetime_precision));
    }
    return true;
  }
  if (["text", "varchar", "bpchar"].includes(target.udt_name)
      && ["text", "varchar", "bpchar", "uuid", "citext", "name"].includes(source.udt_name)) {
    if (target.udt_name === "text") return true;
    if (["varchar", "bpchar"].includes(source.udt_name)) {
      return target.character_maximum_length === null
        || (source.character_maximum_length !== null
          && Number(target.character_maximum_length) >= Number(source.character_maximum_length));
    }
    return false;
  }
  if (target.udt_name === "_text" && ["_text", "_varchar", "_uuid", "_citext"].includes(source.udt_name)) {
    return true;
  }
  const safeIntegerTargets = Object.freeze({
    int2: new Set(["int4", "int8", "numeric"]),
    int4: new Set(["int8", "numeric"]),
    int8: new Set(["numeric"])
  });
  if (safeIntegerTargets[source.udt_name]?.has(target.udt_name)) {
    if (target.udt_name !== "numeric" || target.numeric_precision === null) return true;
    const requiredDigits = { int2: 5, int4: 10, int8: 19 }[source.udt_name];
    const targetScale = Number(target.numeric_scale || 0);
    return Number(target.numeric_precision) - targetScale >= requiredDigits;
  }
  return source.udt_name === "float4" && target.udt_name === "float8";
}

export async function inspectSchema(source, target) {
  const plans = [];
  for (const table of MIGRATION_TABLES) {
    // node-postgres serializes work on one Client. Keeping these awaits
    // explicit also prevents concurrent query calls from corrupting the
    // protocol state or surfacing a misleading TABLE_MISSING result.
    const sourceColumns = await loadColumns(source, table);
    const sourcePrimaryKey = await loadPrimaryKey(source, table);
    const targetColumns = await loadColumns(target, table);
    const targetPrimaryKey = await loadPrimaryKey(target, table);
    const sourceByName = new Map(sourceColumns.map((column) => [column.column_name, column]));
    const targetByName = new Map(targetColumns.map((column) => [column.column_name, column]));
    const declaredGenerated = new Set(GENERATED_COLUMNS[table] || []);

    for (const columnName of declaredGenerated) {
      const sourceColumn = sourceByName.get(columnName);
      const targetColumn = targetByName.get(columnName);
      if (sourceColumn && !isGenerated(sourceColumn)) {
        throw new MigrationSafetyError(
          `Expected source-generated column is writable: ${table}.${columnName}.`,
          "GENERATED_COLUMN_MISMATCH"
        );
      }
      if (targetColumn && !isGenerated(targetColumn)) {
        throw new MigrationSafetyError(
          `Expected target-generated column is writable: ${table}.${columnName}.`,
          "GENERATED_COLUMN_MISMATCH"
        );
      }
    }

    const migratedSourceNames = new Set();
    for (const sourceColumn of sourceColumns) {
      if (isGenerated(sourceColumn)) {
        const targetColumn = targetByName.get(sourceColumn.column_name);
        if (targetColumn && !isGenerated(targetColumn)) {
          const targetCanSupplyValue = targetColumn.is_nullable === "YES"
            || targetColumn.column_default !== null
            || targetColumn.identity_generation !== null;
          if (!targetCanSupplyValue) {
            throw new MigrationSafetyError(
              `Generated source column maps to a required writable target column: ${table}.${sourceColumn.column_name}.`,
              "GENERATED_COLUMN_MISMATCH"
            );
          }
        }
        continue;
      }
      const targetColumn = targetByName.get(sourceColumn.column_name);
      if (!targetColumn) {
        throw new MigrationSafetyError(
          `Target column is missing: ${table}.${sourceColumn.column_name}.`,
          "TARGET_COLUMN_MISSING"
        );
      }
      if (isGenerated(targetColumn)) {
        throw new MigrationSafetyError(
          `Source column maps to a generated target column: ${table}.${sourceColumn.column_name}.`,
          "GENERATED_COLUMN_MISMATCH"
        );
      }
      if (!isTypeCompatible(sourceColumn, targetColumn)) {
        throw new MigrationSafetyError(
          `Incompatible column types: ${table}.${sourceColumn.column_name}.`,
          "COLUMN_TYPE_MISMATCH"
        );
      }
      migratedSourceNames.add(sourceColumn.column_name);
    }

    for (const targetColumn of targetColumns) {
      if (isGenerated(targetColumn) || migratedSourceNames.has(targetColumn.column_name)) continue;
      const targetCanSupplyValue = targetColumn.is_nullable === "YES"
        || targetColumn.column_default !== null
        || targetColumn.identity_generation !== null;
      if (!targetCanSupplyValue) {
        throw new MigrationSafetyError(
          `Source cannot supply required target column: ${table}.${targetColumn.column_name}.`,
          "SOURCE_COLUMN_MISSING"
        );
      }
    }

    if (JSON.stringify(sourcePrimaryKey) !== JSON.stringify(targetPrimaryKey)) {
      throw new MigrationSafetyError(`Primary-key mismatch for ${table}.`, "PRIMARY_KEY_MISMATCH");
    }

    const columns = sourceColumns
      .filter((column) => !isGenerated(column))
      .map((column) => column.column_name);
    const columnTypes = Object.freeze(Object.fromEntries(
      columns.map((column) => [column, targetByName.get(column).udt_name])
    ));
    plans.push(Object.freeze({
      table,
      columns: Object.freeze(columns),
      columnTypes,
      primaryKey: Object.freeze(sourcePrimaryKey)
    }));
  }
  return Object.freeze(plans);
}

function canonicalFingerprint(domain, lines) {
  const hash = createHash("sha256");
  hash.update(`${MIGRATION_VERSION}\0${domain}\0`);
  for (const line of lines) hash.update(`${line}\0`);
  return `sha256:${hash.digest("hex")}`;
}

function tableAggregateFromRows(plan, rows) {
  const primaryKeys = rows.map((row) => canonicalJson(plan.primaryKey.map((column) => row[column])));
  const contents = rows.map((row) => canonicalJson(Object.fromEntries(
    plan.columns.map((column) => [column, row[column]])
  )));
  return Object.freeze({
    count: rows.length,
    primaryKeyFingerprint: canonicalFingerprint(`${plan.table}:primary-keys:v1`, primaryKeys),
    contentFingerprint: canonicalFingerprint(`${plan.table}:migrated-columns:v1`, contents)
  });
}

function collectAggregates(plans, rowsByTable) {
  const aggregates = {};
  for (const plan of plans) {
    aggregates[plan.table] = tableAggregateFromRows(plan, rowsByTable.get(plan.table));
  }
  return Object.freeze(aggregates);
}

function totalRows(aggregates) {
  return Object.values(aggregates).reduce((sum, aggregate) => sum + aggregate.count, 0);
}

function aggregateSnapshotFingerprint(aggregates) {
  return canonicalFingerprint(
    "complete-transformed-source-snapshot:v1",
    MIGRATION_TABLES.map((table) => canonicalJson({ table, ...aggregates[table] }))
  );
}

function canonicalJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new MigrationSafetyError("A non-finite numeric value cannot be fingerprinted.", "CONTENT_FINGERPRINT_INVALID");
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function protectedBootstrapProfileFingerprint(profileRecord, userSettingsRecord, targetDatabaseName) {
  return `sha256:${createHash("sha256")
    .update(`${MIGRATION_VERSION}\0protected-bootstrap-profile-and-settings-v2\0${targetDatabaseName}\0${canonicalJson({
      profile: profileRecord,
      userSettings: userSettingsRecord
    })}`)
    .digest("hex")}`;
}

export function normalizeSyntheticSeedRecord(table, rowRecord) {
  const record = { ...rowRecord };
  // The observation audit row is emitted by a trigger while the seed runs.
  // Its timestamp therefore cannot be fixed by the seed artifact itself.
  if (table === "hospitation_observation_changes") {
    record.changed_at = "<seed-trigger-time>";
  }
  // Avatar patch v1 changed exactly these three synthetic profiles. Before
  // migration 202607200002, the legacy touch trigger overwrote the patch's
  // explicit updated_at with now(). Normalize that audit timestamp only when
  // both the reserved profile id and its immutable local avatar path match.
  // All profile fachlich/identity fields, the avatar path itself and every
  // other row field remain byte-for-byte part of the fingerprint.
  if (
    table === "profiles"
    && SYNTHETIC_PROFILE_AVATAR_PATCH_V1[record.id] === record.avatar_url
  ) {
    record.updated_at = "<synthetic-profile-avatar-patch-time>";
  }
  return record;
}

export async function syntheticSeedContentFingerprint(target, excludedProfileId = null) {
  const lines = [];
  for (const table of MIGRATION_TABLES) {
    const primaryKey = await loadPrimaryKey(target, table);
    const excludedOwnerColumn = table === "profiles"
      ? "id"
      : table === "user_settings"
        ? "user_id"
        : null;
    const excludeProtectedBootstrapData = excludedProfileId !== null && excludedOwnerColumn !== null;
    const result = await safeQuery(
      target,
      "fingerprint-synthetic-seed-table",
      `select to_jsonb(seed_row) as row_record
         from public.${quoteIdentifier(table)} seed_row
         ${excludeProtectedBootstrapData
    ? `where seed_row.${quoteIdentifier(excludedOwnerColumn)}::text <> $1`
    : ""}
        order by ${primaryKey.map((column) => `seed_row.${quoteIdentifier(column)}`).join(", ")}`,
      excludeProtectedBootstrapData ? [excludedProfileId] : [],
      table
    );
    lines.push(`table:${table}`);
    for (const row of result.rows) {
      lines.push(canonicalJson(normalizeSyntheticSeedRecord(table, row.row_record)));
    }
  }
  const marker = await safeQuery(
    target,
    "fingerprint-synthetic-seed-marker",
    `select to_jsonb(seed_run) as row_record
       from public.import_runs seed_run
      where id = $1 or id = 'demo-import-' || $1
      order by id`,
    [SYNTHETIC_SEED_ID],
    "import_runs"
  );
  lines.push("table:import_runs:synthetic-marker");
  for (const row of marker.rows) lines.push(canonicalJson(row.row_record));
  return canonicalFingerprint(
    `${SYNTHETIC_SEED_ID}:${SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM}`,
    lines
  );
}

async function inspectProtectedBootstrapProfile(source, target, state, targetDatabaseName) {
  const baseIsSynthetic = state.seed_markers === 1
    && state.other_import_runs === 0
    && state.non_synthetic_contacts === 0
    && state.non_synthetic_organizations === 0
    && state.unproven_domain_rows === 0;
  if (
    !baseIsSynthetic
    || state.non_synthetic_profiles !== 1
    || state.identity_bindings !== 0
    || state.user_settings_rows > 1
  ) return null;

  const candidateResult = await safeQuery(
    target,
    "inspect-protected-bootstrap-profile",
    `select id::text as id,
            lower(email) as normalized_email,
            role,
            active,
            to_jsonb(profile) as profile_record,
            (select count(*)::int
               from public.identity_bindings binding
              where binding.profile_id = profile.id) as binding_count
       from public.profiles profile
      where email not like '%@versorgungs-kompass.example.invalid'
         or id not like 'demo-profile-%'
         or position($1 in coalesce(bio, '')) = 0`,
    [SYNTHETIC_SEED_ID],
    "profiles"
  );
  if (candidateResult.rowCount !== 1) return null;
  const candidate = candidateResult.rows[0];

  const settingsResult = await safeQuery(
    target,
    "inspect-protected-bootstrap-user-settings",
    `select user_id::text as user_id,
            to_jsonb(setting) as settings_record
       from public.user_settings setting
      order by user_id`,
    [],
    "user_settings"
  );
  const bootstrapSettings = settingsResult.rows[0] || null;
  const settingsOwnerMatches = settingsResult.rows.filter(
    (setting) => setting.user_id === candidate.id
  ).length;
  if (
    settingsResult.rowCount !== state.user_settings_rows
    || settingsOwnerMatches !== settingsResult.rowCount
  ) return null;

  const sourceProfiles = await safeQuery(
    source,
    "match-protected-bootstrap-profile",
    "select id::text as id, lower(email) as normalized_email, role, active from public.profiles"
  );
  const sourceIdMatches = sourceProfiles.rows.filter((profile) => profile.id === candidate.id).length;
  const sourceEmailMatches = sourceProfiles.rows.filter(
    (profile) => profile.normalized_email === candidate.normalized_email
  );
  const sourceActiveAdminMatches = sourceEmailMatches.filter(
    (profile) => profile.active === true && profile.role === "admin"
  ).length;
  const recognized = candidate.active === true
    && candidate.role === "admin"
    && candidate.binding_count === 0
    && sourceIdMatches === 0
    && sourceEmailMatches.length === 1
    && sourceActiveAdminMatches === 1;
  if (!recognized) return null;

  return Object.freeze({
    profileId: candidate.id,
    fingerprint: protectedBootstrapProfileFingerprint(
      candidate.profile_record,
      bootstrapSettings?.settings_record || null,
      targetDatabaseName
    ),
    evidence: Object.freeze({
      protectedBootstrapProfileCount: 1,
      protectedBootstrapActiveAdminCount: 1,
      protectedBootstrapSourceIdMatchCount: sourceIdMatches,
      protectedBootstrapSourceEmailMatchCount: sourceEmailMatches.length,
      protectedBootstrapSourceActiveAdminMatchCount: sourceActiveAdminMatches,
      protectedBootstrapIdentityBindingCount: candidate.binding_count,
      protectedBootstrapUserSettingsCount: settingsResult.rowCount,
      protectedBootstrapUserSettingsOwnerMatchCount: settingsOwnerMatches
    })
  });
}

async function classifyTarget(source, target, aggregates, targetDatabaseName) {
  const dataRows = totalRows(aggregates);
  const checks = await safeQuery(
    target,
    "classify-synthetic-target",
    `select
       (select count(*)::int
          from public.import_runs
         where (id = $1 or id = 'demo-import-' || $1)
           and (id = $1 or report @> jsonb_build_object('synthetic', true, 'seedNamespace', $1))) as seed_markers,
       (select count(*)::int
          from public.import_runs
         where not (
           (id = $1 or id = 'demo-import-' || $1)
           and (id = $1 or report @> jsonb_build_object('synthetic', true, 'seedNamespace', $1))
         )) as other_import_runs,
       (select count(*)::int from public.contacts where source is distinct from $1) as non_synthetic_contacts,
       (select count(*)::int from public.organizations where source is distinct from $1) as non_synthetic_organizations,
       (select count(*)::int
          from public.profiles
         where email not like '%@versorgungs-kompass.example.invalid'
            or id not like 'demo-profile-%'
            or position($1 in coalesce(bio, '')) = 0) as non_synthetic_profiles,
       (select count(*)::int from public.user_settings) as user_settings_rows,
       (
         (select count(*) from public.organization_primary_systems
           where id not like 'demo-%'
              or source_url not like 'https://' || $1 || '.example.invalid/%')
         + (select count(*) from public.contact_owners
             where contact_id not like 'demo-%' or profile_id not like 'demo-profile-%')
         + (select count(*) from public.activity_events)
         + (select count(*) from public.changes)
         + (select count(*) from public.contact_notes)
         + (select count(*) from public.contact_note_attachments)
         + (select count(*) from public.saved_views)
         + (select count(*) from public.formats
             where id not like 'demo-%' or position('[' || $1 || ']' in coalesce(notes, '')) = 0)
         + (select count(*) from public.format_participants
             where id not like 'demo-%' or format_id not like 'demo-%' or contact_id not like 'demo-%')
         + (select count(*) from public.hospitation_slots)
         + (select count(*) from public.hospitations
             where id not like 'demo-%' or position('[' || $1 || ']' in coalesce(request_note, '')) = 0)
         + (select count(*) from public.hospitation_observations
             where id not like 'demo-%' or payload ->> 'seedNamespace' is distinct from $1)
         + (select count(*)
              from public.hospitation_observation_changes audit
              left join public.hospitation_observations observation on observation.id = audit.observation_id
             where observation.id is null
                or observation.id not like 'demo-%'
                or observation.payload ->> 'seedNamespace' is distinct from $1)
         + (select count(*) from public.roadmap_items)
         + (select count(*) from public.hospitation_roadmap_assessments)
         + (select count(*) from public.hospitation_unmet_needs)
         + (select count(*) from public.expert_groups)
         + (select count(*) from public.expert_organizations)
         + (select count(*) from public.expert_contacts)
         + (select count(*) from public.expert_entity_links)
         + (select count(*) from public.stakeholder_types)
         + (select count(*) from public.stakeholder_organizations)
         + (select count(*) from public.stakeholder_people)
         + (select count(*) from public.notification_events)
         + (select count(*) from public.notification_recipients)
       )::int as unproven_domain_rows,
       (select count(*)::int from public.identity_bindings) as identity_bindings`,
    [SYNTHETIC_SEED_ID]
  );
  const state = checks.rows[0];
  const heuristicallySynthetic = state.seed_markers === 1
    && state.other_import_runs === 0
    && state.non_synthetic_contacts === 0
    && state.non_synthetic_organizations === 0
    && state.non_synthetic_profiles === 0
    && state.user_settings_rows === 0
    && state.unproven_domain_rows === 0;
  const isOperationallyEmpty = dataRows === 0
    && state.seed_markers === 0
    && state.other_import_runs === 0;
  const protectedBootstrap = await inspectProtectedBootstrapProfile(
    source,
    target,
    state,
    targetDatabaseName
  );
  const candidateForExactSeedProof = heuristicallySynthetic || protectedBootstrap !== null;
  const seedContentFingerprint = candidateForExactSeedProof
    ? await syntheticSeedContentFingerprint(target, protectedBootstrap?.profileId || null)
    : null;
  const seedContentManifest = seedContentFingerprint === null
    ? null
    : SYNTHETIC_SEED_CONTENT_MANIFESTS.find(
      (manifest) => manifest.fingerprint === seedContentFingerprint
    ) || null;
  const seedContentMatches = seedContentManifest !== null;
  const isSynthetic = heuristicallySynthetic && seedContentMatches;
  const mode = isOperationallyEmpty
    ? "empty"
    : isSynthetic
      ? "synthetic"
      : protectedBootstrap && seedContentMatches
        ? "synthetic-with-protected-bootstrap-profile"
        : "protected-non-synthetic";
  return Object.freeze({
    mode,
    dataRows,
    bootstrapProfileFingerprint: protectedBootstrap?.fingerprint || null,
    syntheticSeedContentFingerprint: seedContentFingerprint,
    evidence: Object.freeze({
      seedMarkers: state.seed_markers,
      otherImportRuns: state.other_import_runs,
      nonSyntheticContacts: state.non_synthetic_contacts,
      nonSyntheticOrganizations: state.non_synthetic_organizations,
      nonSyntheticProfiles: state.non_synthetic_profiles,
      userSettingsRows: state.user_settings_rows,
      unprovenDomainRows: state.unproven_domain_rows,
      identityBindingCount: state.identity_bindings,
      syntheticSeedContentFingerprint: seedContentFingerprint,
      syntheticSeedContentFingerprintAlgorithm: SYNTHETIC_SEED_CONTENT_FINGERPRINT_ALGORITHM,
      syntheticSeedContentMatchesVersionedManifest: seedContentMatches,
      syntheticSeedContentManifestId: seedContentManifest?.id || null,
      ...(protectedBootstrap?.evidence || {}),
      protectedBootstrapProfileFingerprint: protectedBootstrap?.fingerprint || null
    })
  });
}

async function loadIdentityBindingProfileIds(client) {
  const result = await safeQuery(
    client,
    "read-identity-binding-profile-identifiers",
    `select distinct profile_id
       from public.identity_bindings
      order by profile_id`
  );
  return result.rows.map((row) => String(row.profile_id));
}

async function identityBindingsFingerprint(client) {
  const result = await safeQuery(
    client,
    "fingerprint-identity-bindings",
    `select count(*)::int as count,
            md5(coalesce(string_agg(to_jsonb(binding)::text, E'\\n' order by issuer, subject), '')) as fingerprint
       from public.identity_bindings binding`
  );
  return Object.freeze({
    count: result.rows[0].count,
    fingerprint: result.rows[0].fingerprint
  });
}

async function countMissingBindingProfiles(source, identityBindingProfileIds) {
  if (identityBindingProfileIds.length === 0) return 0;
  const sourceProfiles = await safeQuery(source, "read-source-profile-identifiers", "select id::text as id from public.profiles");
  const profileIds = new Set(sourceProfiles.rows.map((row) => row.id));
  return identityBindingProfileIds.reduce((count, profileId) => count + (profileIds.has(profileId) ? 0 : 1), 0);
}

async function inspectSourceProfileImages(source, expectedSourceProjectId) {
  const result = await safeQuery(
    source,
    "inspect-source-profile-images",
    `select
       count(*) filter (
         where avatar_url like any(array[
           'https://' || $1 || '.supabase.co/storage/v1/object/public/profile-images/%',
           'https://' || $1 || '.supabase.co/storage/v1/object/sign/profile-images/%',
           'https://' || $1 || '.supabase.co/storage/v1/object/authenticated/profile-images/%'
         ])
       )::int as rewritable_supabase_urls,
       count(*) filter (
         where nullif(btrim(avatar_url), '') is not null
           and not (avatar_url like any(array[
             'https://' || $1 || '.supabase.co/storage/v1/object/public/profile-images/%',
             'https://' || $1 || '.supabase.co/storage/v1/object/sign/profile-images/%',
             'https://' || $1 || '.supabase.co/storage/v1/object/authenticated/profile-images/%'
           ]))
       )::int as unsupported_avatar_urls,
       (select count(*)::int
          from public.stakeholder_organizations
         where logo_url like 'private://stakeholder-logos/%') as private_stakeholder_logo_urls,
       (select count(*)::int
          from public.stakeholder_organizations
         where logo_url is not null
           and (
             logo_url not like 'private://stakeholder-logos/%'
             or logo_url like '%/../%'
             or logo_url like '%/./%'
             or logo_url like '%\\%'
             or logo_url ~ '[[:cntrl:]]'
           )) as unsupported_stakeholder_logo_urls
     from public.profiles`,
    [expectedSourceProjectId]
  );
  return Object.freeze({
    rewritableSupabaseUrls: result.rows[0].rewritable_supabase_urls,
    unsupportedAvatarUrls: result.rows[0].unsupported_avatar_urls,
    privateStakeholderLogoUrls: result.rows[0].private_stakeholder_logo_urls,
    unsupportedStakeholderLogoUrls: result.rows[0].unsupported_stakeholder_logo_urls
  });
}

function assertApplySafety(config, targetClassification, missingBindingProfiles, profileImages) {
  if (!config.apply) return;
  if (targetClassification.mode === "protected-non-synthetic") {
    throw new MigrationSafetyError(
      "Target contains data that cannot be proven synthetic; automatic replacement is refused.",
      "TARGET_NOT_SYNTHETIC"
    );
  }
  if (["synthetic", "synthetic-with-protected-bootstrap-profile"].includes(targetClassification.mode)) {
    if (!config.replaceSyntheticTarget || config.confirmReplacement !== SYNTHETIC_SEED_ID) {
      throw new MigrationSafetyError(
        `Replacing the synthetic target requires --replace-synthetic-target and --confirm-replacement ${SYNTHETIC_SEED_ID}.`,
        "SYNTHETIC_REPLACEMENT_NOT_CONFIRMED"
      );
    }
  }
  if (targetClassification.mode === "synthetic-with-protected-bootstrap-profile"
      && config.confirmBootstrapProfileFingerprint !== targetClassification.bootstrapProfileFingerprint) {
    throw new MigrationSafetyError(
      "Replacing the protected bootstrap profile requires its exact fingerprint from the current dry-run.",
      "BOOTSTRAP_PROFILE_REPLACEMENT_NOT_CONFIRMED"
    );
  }
  if (missingBindingProfiles > 0) {
    throw new MigrationSafetyError(
      `${missingBindingProfiles} identity binding(s) reference profiles absent from the source; replacement is refused.`,
      "IDENTITY_PROFILE_MISSING"
    );
  }
  if (profileImages.unsupportedAvatarUrls > 0) {
    throw new MigrationSafetyError(
      `${profileImages.unsupportedAvatarUrls} profile-image URL(s) are not bound to the approved Supabase source project; migration is refused.`,
      "UNSUPPORTED_PROFILE_IMAGE_URL"
    );
  }
  if (profileImages.unsupportedStakeholderLogoUrls > 0) {
    throw new MigrationSafetyError(
      `${profileImages.unsupportedStakeholderLogoUrls} unsupported stakeholder-logo reference(s) were detected; migration is refused.`,
      "UNSUPPORTED_STAKEHOLDER_LOGO_URL"
    );
  }
  if (profileImages.rewritableSupabaseUrls > 0) {
    if (!config.targetProfileImageBucket) {
      throw new MigrationSafetyError(
        "Supabase profile-image URLs require TARGET_PROFILE_IMAGE_BUCKET for deterministic rewriting.",
        "PROFILE_IMAGE_BUCKET_REQUIRED"
      );
    }
  }
}

async function fetchRows(source, plan) {
  const columnList = plan.columns.map(quoteIdentifier).join(", ");
  const orderBy = plan.primaryKey.map(quoteIdentifier).join(", ");
  const result = await safeQuery(
    source,
    "read-source-table",
    `select ${columnList} from public.${quoteIdentifier(plan.table)} order by ${orderBy}`,
    [],
    plan.table
  );
  return result.rows;
}

function supabaseProfileImageSource(value, profileId, expectedSourceProjectId) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== `${expectedSourceProjectId}.supabase.co`) return null;
  const marker = "/storage/v1/object/";
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  let pathParts;
  try {
    pathParts = parsed.pathname
      .slice(markerIndex + marker.length)
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    throw new MigrationSafetyError(
      "A Supabase profile image has an invalid encoded object path.",
      "PROFILE_IMAGE_SOURCE_PATH_INVALID"
    );
  }
  if (!["public", "sign", "authenticated"].includes(pathParts[0]) || pathParts[1] !== "profile-images") return null;
  const expectedProfileId = String(profileId || "");
  const fileName = pathParts[3] || "";
  const fileMatch = /^avatar\.(jpg|png|webp)$/i.exec(fileName);
  if (pathParts.length !== 4
      || pathParts[2] !== expectedProfileId
      || !fileMatch
      || !/^[a-zA-Z0-9._-]{1,200}$/.test(expectedProfileId)) {
    throw new MigrationSafetyError(
      "A Supabase profile image must use profile-images/<profile-id>/avatar.(jpg|png|webp).",
      "PROFILE_IMAGE_SOURCE_PATH_INVALID"
    );
  }
  const extension = PROFILE_IMAGE_EXTENSIONS.get(fileMatch[1].toLowerCase());
  return Object.freeze({
    extension,
    sourcePath: `${expectedProfileId}/avatar.${extension}`
  });
}

function rewriteSourceRows(plan, rows, config) {
  if (plan.table !== "profiles") return rows;
  return rows.map((row) => {
    const sourceImage = supabaseProfileImageSource(
      row.avatar_url,
      row.id,
      config.expectedSourceProjectId
    );
    if (sourceImage === null) return row;
    return {
      ...row,
      avatar_url: `gs://${config.targetProfileImageBucket}/profile-images/${sourceImage.sourcePath}`
    };
  });
}

function stakeholderLogoObjectPath(value) {
  const prefix = "private://stakeholder-logos/";
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const objectPath = value.slice(prefix.length);
  assertManifestObjectPath(objectPath);
  return objectPath;
}

function manifestEntryBySourceReference(manifest) {
  return new Map(manifest.entries.map((entry) => [
    `${entry.sourceRef.bucket}\0${entry.sourceRef.object}`,
    entry
  ]));
}

function assertCompletedManifestReference(entry, expectedTargetBucket, expectedTargetObject, dataClass) {
  if (!entry) {
    throw new MigrationSafetyError(
      `A referenced ${dataClass} object is absent from the verified Storage manifest.`,
      "STORAGE_MANIFEST_REFERENCE_MISSING"
    );
  }
  if (entry.status === "quarantined") {
    throw new MigrationSafetyError(
      `A referenced ${dataClass} object was quarantined; the database import is refused.`,
      "STORAGE_MANIFEST_REFERENCE_QUARANTINED"
    );
  }
  if (entry.targetObject.bucket !== expectedTargetBucket
      || entry.targetObject.object !== expectedTargetObject) {
    throw new MigrationSafetyError(
      `A referenced ${dataClass} target object does not match the database path contract.`,
      "STORAGE_MANIFEST_TARGET_MISMATCH"
    );
  }
}

function verifyStorageManifestReferences(sourceRows, config, manifest) {
  const bySource = manifestEntryBySourceReference(manifest);
  let profileImageReferenceCount = 0;
  for (const profile of sourceRows.get("profiles")) {
    if (profile.avatar_url === null || String(profile.avatar_url).trim() === "") continue;
    if (!config.targetProfileImageBucket) {
      throw new MigrationSafetyError(
        "Referenced profile images require TARGET_PROFILE_IMAGE_BUCKET.",
        "PROFILE_IMAGE_BUCKET_REQUIRED"
      );
    }
    const sourceImage = supabaseProfileImageSource(
      profile.avatar_url,
      profile.id,
      config.expectedSourceProjectId
    );
    if (!sourceImage) {
      throw new MigrationSafetyError(
        "A profile image is not bound to the approved source project.",
        "UNSUPPORTED_PROFILE_IMAGE_URL"
      );
    }
    const entry = bySource.get(`profile-images\0${sourceImage.sourcePath}`);
    assertCompletedManifestReference(
      entry,
      config.targetProfileImageBucket,
      `profile-images/${sourceImage.sourcePath}`,
      "profile image"
    );
    profileImageReferenceCount += 1;
  }

  let contactImageReferenceCount = 0;
  for (const contact of sourceRows.get("contacts")) {
    if (contact.image_storage_path === null || String(contact.image_storage_path).trim() === "") continue;
    if (!config.targetContactImageBucket) {
      throw new MigrationSafetyError(
        "Referenced contact images require TARGET_CONTACT_IMAGE_BUCKET.",
        "CONTACT_IMAGE_BUCKET_REQUIRED"
      );
    }
    const sourcePath = String(contact.image_storage_path);
    assertManifestObjectPath(sourcePath);
    assertCompletedManifestReference(
      bySource.get(`contact-images\0${sourcePath}`),
      config.targetContactImageBucket,
      sourcePath,
      "contact image"
    );
    contactImageReferenceCount += 1;
  }

  let contactNoteAttachmentReferenceCount = 0;
  for (const attachment of sourceRows.get("contact_note_attachments")) {
    if (!config.targetContactNoteAttachmentBucket) {
      throw new MigrationSafetyError(
        "Referenced contact-note attachments require TARGET_CONTACT_NOTE_ATTACHMENT_BUCKET.",
        "CONTACT_NOTE_ATTACHMENT_BUCKET_REQUIRED"
      );
    }
    const sourcePath = String(attachment.storage_path || "");
    assertManifestObjectPath(sourcePath);
    assertCompletedManifestReference(
      bySource.get(`contact-note-attachments\0${sourcePath}`),
      config.targetContactNoteAttachmentBucket,
      sourcePath,
      "contact-note attachment"
    );
    contactNoteAttachmentReferenceCount += 1;
  }

  let stakeholderLogoReferenceCount = 0;
  for (const stakeholder of sourceRows.get("stakeholder_organizations")) {
    if (stakeholder.logo_url === null || String(stakeholder.logo_url).trim() === "") continue;
    if (!config.targetStakeholderLogoBucket) {
      throw new MigrationSafetyError(
        "Referenced stakeholder logos require TARGET_STAKEHOLDER_LOGO_BUCKET.",
        "STAKEHOLDER_LOGO_BUCKET_REQUIRED"
      );
    }
    const sourcePath = stakeholderLogoObjectPath(stakeholder.logo_url);
    if (!sourcePath) {
      throw new MigrationSafetyError(
        "A stakeholder logo is not a private allowlisted reference.",
        "UNSUPPORTED_STAKEHOLDER_LOGO_URL"
      );
    }
    const entry = bySource.get(`stakeholder-logos\0${sourcePath}`);
    assertCompletedManifestReference(
      entry,
      config.targetStakeholderLogoBucket,
      sourcePath,
      "stakeholder logo"
    );
    stakeholderLogoReferenceCount += 1;
  }
  return Object.freeze({
    manifestFingerprint: manifest.manifestFingerprint,
    sourceObjectCount: manifest.sourceObjectCount,
    quarantinedObjectCount: manifest.quarantinedObjectCount,
    profileImageReferenceCount,
    contactImageReferenceCount,
    contactNoteAttachmentReferenceCount,
    stakeholderLogoReferenceCount
  });
}

async function deleteTargetData(target) {
  for (const table of REVERSE_MIGRATION_TABLES) {
    // Profile rows are reconciled in place. Deleting them would cascade into
    // identity_bindings, whose write boundary deliberately excludes vk_app.
    if (table === "profiles") continue;
    await safeQuery(
      target,
      "delete-target-table",
      `delete from public.${quoteIdentifier(table)}`,
      [],
      table
    );
  }
  await safeQuery(
    target,
    "delete-synthetic-import-marker",
    "delete from public.import_runs where id = $1 or id = 'demo-import-' || $1",
    [SYNTHETIC_SEED_ID],
    "import_runs"
  );
}

async function insertRows(target, plan, rows, { upsert = false } = {}) {
  if (rows.length === 0) return;
  const columns = plan.columns;
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((row) => {
      const rowPlaceholders = columns.map((column) => {
        const columnType = plan.columnTypes?.[column];
        const value = row[column];
        values.push(["json", "jsonb"].includes(columnType) && value !== null ? JSON.stringify(value) : value);
        const cast = columnType === "jsonb" ? "::jsonb" : columnType === "json" ? "::json" : "";
        return `$${values.length}${cast}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });
    const conflictClause = upsert
      ? ` on conflict (${plan.primaryKey.map(quoteIdentifier).join(", ")}) do update set ${columns
        .filter((column) => !plan.primaryKey.includes(column))
        .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
        .join(", ")}`
      : "";
    await safeQuery(
      target,
      "insert-target-table",
      `insert into public.${quoteIdentifier(plan.table)} (${quotedColumns}) values ${placeholders.join(", ")}${conflictClause}`,
      values,
      plan.table
    );
  }
}

async function reconcileTargetProfiles(target, plan, rows) {
  if (plan.table !== "profiles") {
    throw new MigrationSafetyError("Profile reconciliation received the wrong table plan.", "PROFILE_PLAN_INVALID");
  }
  if (rows.length === 0) {
    throw new MigrationSafetyError("Source snapshot contains no profiles.", "SOURCE_PROFILES_EMPTY");
  }
  const sourceProfileIds = rows.map((row) => String(row.id));
  await safeQuery(
    target,
    "delete-target-extra-profiles",
    `delete from public.profiles profile
      where not (profile.id = any($1::text[]))
        and not exists (
          select 1
            from public.identity_bindings binding
           where binding.profile_id = profile.id
        )`,
    [sourceProfileIds],
    "profiles"
  );
  const protectedExtras = await safeQuery(
    target,
    "verify-no-identity-bound-extra-profiles",
    `select count(*)::int as count
       from public.profiles profile
      where not (profile.id = any($1::text[]))`,
    [sourceProfileIds],
    "profiles"
  );
  if (protectedExtras.rows[0].count !== 0) {
    throw new MigrationSafetyError(
      "Identity-bound target profiles are absent from the source snapshot.",
      "IDENTITY_PROFILE_MISSING"
    );
  }

  // Neutral addresses make email swaps between retained profile IDs safe under
  // the non-deferrable lower(email) uniqueness index. The transaction keeps
  // these placeholders invisible and rolls them back on every later failure.
  await safeQuery(
    target,
    "neutralize-target-profile-emails",
    `update public.profiles
        set email = 'migration-' || md5(id) || '@versorgungs-kompass.example.invalid'
      where id = any($1::text[])`,
    [sourceProfileIds],
    "profiles"
  );
  await insertRows(target, plan, rows, { upsert: true });
}

async function advanceIdentitySequences(target) {
  for (const table of IDENTITY_TABLES) {
    const sequenceName = `${table}_id_seq`;
    const state = await safeQuery(
      target,
      "inspect-identity-sequence",
      `select sequence_state.last_value::bigint::text as last_value,
              sequence_state.is_called,
              coalesce((select max(id) from public.${quoteIdentifier(table)}), 0)::bigint::text as maximum_id
         from public.${quoteIdentifier(sequenceName)} sequence_state`,
      [],
      table
    );
    const lastValue = BigInt(state.rows[0].last_value);
    const maximumId = BigInt(state.rows[0].maximum_id);
    const nextValue = state.rows[0].is_called ? lastValue + 1n : lastValue;
    if (nextValue > maximumId) continue;
    const steps = maximumId - nextValue + 1n;
    if (steps > MAX_SEQUENCE_ADVANCE) {
      throw new MigrationSafetyError(
        `Sequence advancement safety limit exceeded for ${table}.`,
        "SEQUENCE_ADVANCE_LIMIT"
      );
    }
    const advanced = await safeQuery(
      target,
      "advance-identity-sequence",
      `select count(nextval($1::regclass))::bigint::text as advanced
         from generate_series(1, $2::bigint)`,
      [`public.${sequenceName}`, steps.toString()],
      table
    );
    if (BigInt(advanced.rows[0].advanced) !== steps) {
      throw new MigrationSafetyError(`Sequence advancement failed for ${table}.`, "SEQUENCE_ADVANCE_FAILED");
    }
  }
}

async function loadForeignKeys(client) {
  const result = await safeQuery(
    client,
    "inspect-foreign-keys",
    `select
       constraint_definition.conname as constraint_name,
       child.relname as child_table,
       parent.relname as parent_table,
       array_agg(child_attribute.attname::text order by child_key.ordinal)::text[] as child_columns,
       array_agg(parent_attribute.attname::text order by child_key.ordinal)::text[] as parent_columns
     from pg_catalog.pg_constraint constraint_definition
     join pg_catalog.pg_class child on child.oid = constraint_definition.conrelid
     join pg_catalog.pg_namespace child_namespace on child_namespace.oid = child.relnamespace
     join pg_catalog.pg_class parent on parent.oid = constraint_definition.confrelid
     join unnest(constraint_definition.conkey) with ordinality as child_key(attnum, ordinal) on true
     join unnest(constraint_definition.confkey) with ordinality as parent_key(attnum, ordinal)
       on parent_key.ordinal = child_key.ordinal
     join pg_catalog.pg_attribute child_attribute
       on child_attribute.attrelid = child.oid and child_attribute.attnum = child_key.attnum
     join pg_catalog.pg_attribute parent_attribute
       on parent_attribute.attrelid = parent.oid and parent_attribute.attnum = parent_key.attnum
    where constraint_definition.contype = 'f'
      and child_namespace.nspname = 'public'
      and child.relname = any($1::text[])
    group by constraint_definition.conname, child.relname, parent.relname
    order by child.relname, constraint_definition.conname`,
    [[...MIGRATION_TABLES, "identity_bindings"]]
  );
  return result.rows;
}

async function assertForeignKeys(target) {
  const foreignKeys = await loadForeignKeys(target);
  for (const foreignKey of foreignKeys) {
    const nonNull = foreignKey.child_columns
      .map((column) => `child.${quoteIdentifier(column)} is not null`)
      .join(" and ");
    const relationship = foreignKey.child_columns
      .map((column, index) => `parent.${quoteIdentifier(foreignKey.parent_columns[index])} = child.${quoteIdentifier(column)}`)
      .join(" and ");
    const result = await safeQuery(
      target,
      "verify-foreign-key",
      `select count(*)::int as violations
         from public.${quoteIdentifier(foreignKey.child_table)} child
        where ${nonNull}
          and not exists (
            select 1 from public.${quoteIdentifier(foreignKey.parent_table)} parent
             where ${relationship}
          )`,
      [],
      foreignKey.child_table
    );
    if (result.rows[0].violations !== 0) {
      throw new MigrationSafetyError(
        `Foreign-key verification failed: ${foreignKey.constraint_name} (${result.rows[0].violations} violation(s)).`,
        "FOREIGN_KEY_VIOLATION"
      );
    }
  }
  return foreignKeys.length;
}

function assertReconciliation(sourceAggregates, targetAggregates) {
  for (const table of MIGRATION_TABLES) {
    const source = sourceAggregates[table];
    const target = targetAggregates[table];
    if (source.count !== target.count
        || source.primaryKeyFingerprint !== target.primaryKeyFingerprint
        || source.contentFingerprint !== target.contentFingerprint) {
      throw new MigrationSafetyError(
        `Reconciliation failed for ${table}: count, primary-key or canonical content fingerprint differs.`,
        "RECONCILIATION_FAILED"
      );
    }
  }
}

async function createImportRun(
  target,
  config,
  sourceAggregates,
  foreignKeyCount,
  profileImages,
  targetClassification,
  storageManifestVerification
) {
  const now = new Date();
  const runId = `${MIGRATION_VERSION}-${now.toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const counts = Object.fromEntries(MIGRATION_TABLES.map((table) => [table, sourceAggregates[table].count]));
  const primaryKeyFingerprints = Object.fromEntries(
    MIGRATION_TABLES.map((table) => [table, sourceAggregates[table].primaryKeyFingerprint])
  );
  const contentFingerprints = Object.fromEntries(
    MIGRATION_TABLES.map((table) => [table, sourceAggregates[table].contentFingerprint])
  );
  const report = {
    migrationVersion: MIGRATION_VERSION,
    sourceProjectId: config.expectedSourceProjectId,
    sourceSnapshotFingerprint: aggregateSnapshotFingerprint(sourceAggregates),
    targetDatabaseName: config.expectedTargetDatabaseName,
    preImportBackupId: config.preImportBackupId,
    supportedTableCount: MIGRATION_TABLES.length,
    verifiedForeignKeyCount: foreignKeyCount,
    profileImageRewrite: {
      rewrittenCount: profileImages.rewritableSupabaseUrls,
      targetBucket: profileImages.rewritableSupabaseUrls > 0 ? config.targetProfileImageBucket : null,
      storageManifestFingerprint: storageManifestVerification.manifestFingerprint
    },
    storageMigration: storageManifestVerification,
    targetReplacement: {
      classification: targetClassification.mode,
      protectedBootstrapProfileFingerprint: targetClassification.bootstrapProfileFingerprint || null,
      syntheticSeedContentFingerprint: targetClassification.syntheticSeedContentFingerprint || null
    },
    counts,
    primaryKeyFingerprints,
    contentFingerprints
  };
  await safeQuery(
    target,
    "write-import-run",
    `insert into public.import_runs (
       id, file_name, status, total_rows, valid_rows, imported_contacts,
       skipped_rows, error_count, warning_count, report, created_at, created_by
     ) values ($1, $2, 'completed', $3, $3, $4, 0, 0, 0, $5::jsonb, $6, null)`,
    [
      runId,
      `database-snapshot:${config.expectedSourceProjectId}`,
      totalRows(sourceAggregates),
      sourceAggregates.contacts.count,
      JSON.stringify(report),
      now
    ],
    "import_runs"
  );
  return runId;
}

export async function closeSourceSnapshotBeforeTargetCommit(source) {
  await safeQuery(source, "close-source-snapshot-before-target-commit", "rollback");
}

export async function commitTargetMigration(target, importRunId) {
  try {
    await target.query("commit");
  } catch (error) {
    const outcomeError = new MigrationSafetyError(
      `Target COMMIT outcome is unknown for import run '${importRunId}'. Do not retry or start a second import automatically. Verify this exact run ID in public.import_runs through a new read-only target connection before deciding how to proceed.`,
      "TARGET_COMMIT_OUTCOME_UNKNOWN"
    );
    outcomeError.importRunId = importRunId;
    outcomeError.pgCode = typeof error?.code === "string" ? error.code : "unknown";
    throw outcomeError;
  }
}

function summarize(mode, sourceAggregates, targetAggregates, targetClassification, extra = {}) {
  return Object.freeze({
    mode,
    migrationVersion: MIGRATION_VERSION,
    supportedTableCount: MIGRATION_TABLES.length,
    sourceTotalRows: totalRows(sourceAggregates),
    targetTotalRowsBefore: totalRows(targetAggregates),
    targetClassification: targetClassification.mode,
    targetClassificationEvidence: targetClassification.evidence || null,
    source: sourceAggregates,
    targetBefore: targetAggregates,
    ...extra
  });
}

export async function runDatabaseMigration(
  inputConfig,
  {
    logger = console,
    clientFactory = createClient,
    gcpGate = checkPreGematikMigrationGcp,
    cloudSqlProxyFactory = startManagedCloudSqlAuthProxy,
    managedProxyGateVerifier = assertManagedCloudSqlProxyMatchesGate
  } = {}
) {
  const config = {
    sourceDatabaseUrl: inputConfig.sourceDatabaseUrl || "",
    targetDatabaseUrl: inputConfig.targetDatabaseUrl || "",
    expectedSourceProjectId: inputConfig.expectedSourceProjectId || "",
    expectedTargetDatabaseName: inputConfig.expectedTargetDatabaseName || "",
    preImportBackupId: inputConfig.preImportBackupId || "",
    apply: inputConfig.apply === true,
    replaceSyntheticTarget: inputConfig.replaceSyntheticTarget === true,
    confirmReplacement: inputConfig.confirmReplacement || "",
    targetProfileImageBucket: inputConfig.targetProfileImageBucket || "",
    targetContactImageBucket: inputConfig.targetContactImageBucket || "",
    targetContactNoteAttachmentBucket: inputConfig.targetContactNoteAttachmentBucket || "",
    targetStakeholderLogoBucket: inputConfig.targetStakeholderLogoBucket || "",
    expectedTargetProjectId: inputConfig.expectedTargetProjectId || "",
    expectedProjectPairFingerprint: inputConfig.expectedProjectPairFingerprint || "",
    storageMigrationManifestPath: inputConfig.storageMigrationManifestPath || "",
    confirmStorageManifestFingerprint: inputConfig.confirmStorageManifestFingerprint || "",
    confirmSourceSnapshotFingerprint: inputConfig.confirmSourceSnapshotFingerprint || "",
    confirmQuarantinedObjectCount: String(inputConfig.confirmQuarantinedObjectCount ?? ""),
    confirmBootstrapProfileFingerprint: inputConfig.confirmBootstrapProfileFingerprint || ""
  };
  assertNonSecretConfig(config);
  assertSourceTlsConfig(config.sourceDatabaseUrl);
  assertSourceUrlIdentity(config);
  assertTargetDatabaseConnection(config.targetDatabaseUrl);
  const storageManifest = config.apply ? loadVerifiedStorageManifest(config) : null;
  const proxyEnvironment = inputConfig.gcpEnvironment || inputConfig;
  let proxyConnectMode;
  try {
    proxyConnectMode = cloudSqlProxyConnectMode(proxyEnvironment);
  } catch (error) {
    if (error instanceof CloudSqlManagedProxyError) {
      throw new MigrationSafetyError(error.message, error.code);
    }
    throw error;
  }
  // A dry-run normally supports a direct verify-full target connection. Inside
  // GKE the target has no public IP, so the explicitly selected private-ip mode
  // uses the same pinned, instance-bound managed proxy as Apply.
  const managedProxyRequired = config.apply || proxyConnectMode === "private-ip";

  const source = clientFactory(config.sourceDatabaseUrl, `${MIGRATION_VERSION}-source`, "source");
  let target = null;
  let managedProxy = null;
  let sourceTransaction = false;
  let targetTransaction = false;

  const requireFreshGcpGate = async () => {
    const gateEnvironment = Object.freeze({
      ...proxyEnvironment,
      PRE_IMPORT_BACKUP_ID: config.preImportBackupId
    });
    const gateResult = await gcpGate(gateEnvironment);
    if (gateResult?.ok !== true || !SHA256_FINGERPRINT_PATTERN.test(gateResult.fingerprint || "")) {
      throw new MigrationSafetyError(
        "A managed target connection requires a fresh successful GCP project, cluster, Cloud SQL and backup gate.",
        "GCP_GATE_REQUIRED"
      );
    }
    try {
      assertCloudSqlGateTarget(gateResult);
    } catch (error) {
      if (error instanceof CloudSqlManagedProxyError) {
        throw new MigrationSafetyError(
          "A managed target connection requires a fresh successful GCP project, cluster, Cloud SQL and backup gate.",
          "GCP_GATE_REQUIRED"
        );
      }
      throw error;
    }
    return gateResult;
  };

  try {
    if (managedProxyRequired) {
      const initialGateResult = await requireFreshGcpGate();
      try {
        managedProxy = await cloudSqlProxyFactory({
          gateResult: initialGateResult,
          targetDatabaseUrl: config.targetDatabaseUrl,
          environment: proxyEnvironment
        });
        managedProxyGateVerifier(managedProxy, initialGateResult);
        target = managedProxy.createClient(`${MIGRATION_VERSION}-target`);
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) {
          throw new MigrationSafetyError(error.message, error.code);
        }
        throw error;
      }
    } else {
      target = clientFactory(config.targetDatabaseUrl, `${MIGRATION_VERSION}-target`, "target");
    }

    await connect(source, "source");
    await beginSourceSnapshot(source);
    sourceTransaction = true;
    await verifySourceCanSeeCompleteTables(source);

    await connect(target, "target");
    await beginTargetTransaction(target, config.apply);
    targetTransaction = true;
    await verifyTargetDatabase(target, config.expectedTargetDatabaseName);
    await verifyTargetMigrationPrivileges(target, config.apply);

    const plans = await inspectSchema(source, target);
    const rawSourceRows = new Map();
    const sourceRows = new Map();
    const targetRowsBefore = new Map();
    for (const plan of plans) {
      const fetchedSourceRows = await fetchRows(source, plan);
      rawSourceRows.set(plan.table, fetchedSourceRows);
      sourceRows.set(plan.table, rewriteSourceRows(
        plan,
        fetchedSourceRows,
        config
      ));
      targetRowsBefore.set(plan.table, await fetchRows(target, plan));
    }
    const sourceAggregates = collectAggregates(plans, sourceRows);
    const sourceSnapshotFingerprint = aggregateSnapshotFingerprint(sourceAggregates);
    const targetAggregates = collectAggregates(plans, targetRowsBefore);
    const targetClassification = await classifyTarget(
      source,
      target,
      targetAggregates,
      config.expectedTargetDatabaseName
    );
    const identityBindingProfileIds = await loadIdentityBindingProfileIds(target);
    const identityBindingsBefore = await identityBindingsFingerprint(target);
    const missingBindingProfiles = await countMissingBindingProfiles(source, identityBindingProfileIds);
    const profileImages = await inspectSourceProfileImages(source, config.expectedSourceProjectId);
    assertApplySafety(config, targetClassification, missingBindingProfiles, profileImages);
    if (config.apply && config.confirmSourceSnapshotFingerprint !== sourceSnapshotFingerprint) {
      throw new MigrationSafetyError(
        "The current source snapshot differs from the explicitly approved dry-run.",
        "SOURCE_SNAPSHOT_FINGERPRINT_MISMATCH"
      );
    }
    const storageManifestVerification = config.apply
      ? verifyStorageManifestReferences(rawSourceRows, config, storageManifest)
      : null;

    if (!config.apply) {
      await safeQuery(target, "rollback-dry-run-target", "rollback");
      targetTransaction = false;
      await safeQuery(source, "rollback-dry-run-source", "rollback");
      sourceTransaction = false;
      const summary = summarize("dry-run", sourceAggregates, targetAggregates, targetClassification, {
        sourceSnapshotFingerprint,
        identityBindingCount: identityBindingsBefore.count,
        missingIdentityBindingProfiles: missingBindingProfiles,
        profileImageMigration: {
          ...profileImages,
          targetBucketConfigured: Boolean(config.targetProfileImageBucket),
          storageApplyManifestRequiredForApply: true
        },
        writesPerformed: false
      });
      logger.log(JSON.stringify(summary, null, 2));
      return summary;
    }

    const gateResult = await requireFreshGcpGate();
    try {
      managedProxyGateVerifier(managedProxy, gateResult);
    } catch (error) {
      if (error instanceof CloudSqlManagedProxyError) {
        throw new MigrationSafetyError(error.message, error.code);
      }
      throw error;
    }

    await deleteTargetData(target);
    for (const plan of plans) {
      if (plan.table === "hospitation_observation_changes") {
        // Der Zieltrigger erzeugt beim Beobachtungsimport temporäre Auditzeilen.
        // Sie werden vor dem Import der unveränderten Quellhistorie entfernt.
        await safeQuery(
          target,
          "remove-generated-observation-audits",
          "delete from public.hospitation_observation_changes",
          [],
          "hospitation_observation_changes"
        );
      }
      if (plan.table === "profiles") {
        await reconcileTargetProfiles(target, plan, sourceRows.get(plan.table));
      } else {
        await insertRows(target, plan, sourceRows.get(plan.table));
      }
    }
    await advanceIdentitySequences(target);

    const targetRowsAfter = new Map();
    for (const plan of plans) targetRowsAfter.set(plan.table, await fetchRows(target, plan));
    const targetAggregatesAfter = collectAggregates(plans, targetRowsAfter);
    assertReconciliation(sourceAggregates, targetAggregatesAfter);
    const foreignKeyCount = await assertForeignKeys(target);
    const identityBindingsAfter = await identityBindingsFingerprint(target);
    if (identityBindingsAfter.count !== identityBindingsBefore.count
        || identityBindingsAfter.fingerprint !== identityBindingsBefore.fingerprint) {
      throw new MigrationSafetyError("Identity bindings were not preserved.", "IDENTITY_BINDINGS_CHANGED");
    }
    const remainingSupabaseProfileImages = await safeQuery(
      target,
      "verify-profile-image-rewrite",
      `select count(*)::int as count
         from public.profiles
        where avatar_url ~* '^https://[^/?#]+\\.supabase\\.co/storage/v1/object/'`
    );
    if (remainingSupabaseProfileImages.rows[0].count !== 0) {
      throw new MigrationSafetyError(
        "Supabase profile-image URLs remain after target rewriting.",
        "PROFILE_IMAGE_REWRITE_FAILED"
      );
    }
    const importRunId = await createImportRun(
      target,
      config,
      sourceAggregates,
      foreignKeyCount,
      profileImages,
      targetClassification,
      storageManifestVerification
    );

    // Die Quelle ist read-only. Ihr Snapshot wird zuerst beendet, damit nach
    // einem erfolgreichen Ziel-COMMIT kein Quell-COMMIT mehr fehlschlagen kann.
    await closeSourceSnapshotBeforeTargetCommit(source);
    sourceTransaction = false;
    // Sobald COMMIT abgesendet wird, kann sein Ergebnis bei einem Transportfehler
    // unbekannt sein. Dann weder automatisch rollbacken noch erneut importieren.
    targetTransaction = false;
    await commitTargetMigration(target, importRunId);

    const summary = summarize("apply", sourceAggregates, targetAggregates, targetClassification, {
      sourceSnapshotFingerprint,
      targetAfter: targetAggregatesAfter,
      identityBindingCount: identityBindingsBefore.count,
      verifiedForeignKeyCount: foreignKeyCount,
      profileImageMigration: {
        ...profileImages,
        targetBucket: profileImages.rewritableSupabaseUrls > 0 ? config.targetProfileImageBucket : null,
        storageManifestFingerprint: storageManifestVerification.manifestFingerprint
      },
      storageMigration: storageManifestVerification,
      importRunId,
      preImportBackupId: config.preImportBackupId,
      writesPerformed: true
    });
    logger.log(JSON.stringify(summary, null, 2));
    return summary;
  } catch (error) {
    if (targetTransaction && target) await target.query("rollback").catch(() => {});
    if (sourceTransaction) await source.query("rollback").catch(() => {});
    if (error instanceof MigrationSafetyError || error instanceof SafeDatabaseError) throw error;
    throw new SafeDatabaseError("unexpected-migration-failure", error);
  } finally {
    if (target) await target.end().catch(() => {});
    await source.end().catch(() => {});
    if (managedProxy) await managedProxy.stop().catch(() => {});
  }
}
