#!/usr/bin/env node
// Execute through stdin inside the existing API container. This process only
// reads the database and referenced objects; credentials never leave the pod.
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DOMAIN_TABLES = Object.freeze([
  "profiles", "organizations", "organization_primary_systems", "contacts",
  "contact_owners", "changes", "activity_events", "contact_notes",
  "contact_note_attachments", "formats", "format_participants", "hospitation_slots",
  "hospitations", "hospitation_observations", "hospitation_observation_changes",
  "roadmap_items", "hospitation_roadmap_assessments", "hospitation_unmet_needs",
  "expert_groups", "expert_contacts", "expert_organizations", "expert_entity_links",
  "stakeholder_types", "stakeholder_organizations", "stakeholder_people",
  "saved_views", "user_settings", "notification_events", "notification_recipients",
  "import_runs", "network_registrations"
]);
const OPTIONAL_NOT_DEPLOYED = new Set(["network_registrations"]);
const EXCLUDED_TABLES = Object.freeze({
  identity_bindings: "authentication_identity_mapping",
  identity_enrollment_requests: "authentication_enrollment",
  test_access_allowlist: "authentication_access_control",
  test_access_objects: "authentication_test_cohort_mapping"
});
const MIB = 1024 * 1024;
const HARD_OUTPUT_BYTES = 500 * MIB;

function failure(code, details = {}) {
  return Object.assign(new Error(code), { safeCode: code, safeDetails: details });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function positiveLimit(value, fallback, maximum) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw failure("INVALID_LOCAL_LIMIT");
  }
  return number;
}

function first(env, names) {
  return names.map((name) => env[name]).find((value) => typeof value === "string" && value.trim()) || "";
}

function tlsMaterial(env, inlineName, fileNames) {
  const inline = first(env, [inlineName]);
  const file = first(env, fileNames);
  if (inline && file) throw failure("AMBIGUOUS_DATABASE_TLS");
  return inline || (file ? readFileSync(file, "utf8") : "");
}

export function databaseConfig(env) {
  const connectionString = first(env, ["DATABASE_URL"]);
  const config = connectionString ? { connectionString } : {
    host: first(env, ["DB_HOST", "PGHOST"]),
    port: Number(first(env, ["DB_PORT", "PGPORT"]) || 5432),
    database: first(env, ["DB_NAME", "PGDATABASE"]) || "versorgungs_kompass",
    user: first(env, ["DB_USER", "PGUSER"]) || "vk_app",
    password: first(env, ["DB_PASSWORD", "PGPASSWORD"])
  };
  const parsed = connectionString ? new URL(connectionString) : null;
  const hostname = parsed?.hostname || config.host;
  if (!hostname) throw failure("DATABASE_HOST_MISSING");
  const localProxy = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
  const urlSsl = parsed && ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"].some((name) => parsed.searchParams.has(name));
  const envSsl = first(env, ["DB_SSL_MODE", "DB_SSL", "PGSSLMODE", "DB_SSL_CA", "DB_SSL_CA_FILE", "PGSSLROOTCERT", "DB_SSL_CERT", "DB_SSL_CERT_FILE", "PGSSLCERT", "DB_SSL_KEY", "DB_SSL_KEY_FILE", "PGSSLKEY", "DB_SSL_SERVERNAME", "DB_SSL_SERVER_NAME"]);
  if (urlSsl && envSsl) throw failure("AMBIGUOUS_DATABASE_TLS");
  if (urlSsl) {
    if (!localProxy && parsed.searchParams.get("sslmode") !== "verify-full") throw failure("DATABASE_TLS_REQUIRED");
  } else {
    const ca = tlsMaterial(env, "DB_SSL_CA", ["DB_SSL_CA_FILE", "PGSSLROOTCERT"]);
    const cert = tlsMaterial(env, "DB_SSL_CERT", ["DB_SSL_CERT_FILE", "PGSSLCERT"]);
    const key = tlsMaterial(env, "DB_SSL_KEY", ["DB_SSL_KEY_FILE", "PGSSLKEY"]);
    const servername = first(env, ["DB_SSL_SERVERNAME", "DB_SSL_SERVER_NAME"]);
    const rawMode = first(env, ["DB_SSL_MODE", "DB_SSL", "PGSSLMODE"]).toLowerCase();
    const aliases = { "0": "disable", false: "disable", off: "disable", "1": "require", true: "require", on: "require", "no-verify": "require", prefer: "require" };
    const mode = aliases[rawMode] || rawMode || ((ca || cert || key) ? "verify-full" : "disable");
    if (!localProxy && mode !== "verify-full") throw failure("DATABASE_TLS_REQUIRED");
    if (!["disable", "require", "verify-ca", "verify-full"].includes(mode)) throw failure("INVALID_DATABASE_TLS_MODE");
    if (Boolean(cert) !== Boolean(key)) throw failure("INCOMPLETE_DATABASE_TLS_CLIENT");
    if (mode === "verify-ca") throw failure("DATABASE_TLS_HOSTNAME_REQUIRED");
    config.ssl = mode === "disable" ? false : {
      rejectUnauthorized: mode !== "require",
      ...(ca ? { ca } : {}), ...(cert ? { cert, key } : {}), ...(servername ? { servername } : {})
    };
  }
  return {
    ...config,
    application_name: "versorgungs-kompass-offline-readonly",
    connectionTimeoutMillis: 10000,
    query_timeout: 65000,
    statement_timeout: 60000,
    options: "-c default_transaction_read_only=on",
    keepAlive: true
  };
}

export function classifyTables(tableNames) {
  const names = [...new Set(tableNames)].sort();
  const unknownTables = names.filter((name) => !DOMAIN_TABLES.includes(name) && !Object.hasOwn(EXCLUDED_TABLES, name));
  const missingTables = DOMAIN_TABLES.filter((name) => !names.includes(name) && !OPTIONAL_NOT_DEPLOYED.has(name));
  const inventory = names.map((name) => ({
    name,
    classification: DOMAIN_TABLES.includes(name) ? "business_data" : (EXCLUDED_TABLES[name] || "unclassified")
  }));
  if (unknownTables.length || missingTables.length) throw failure("DATABASE_TABLE_CONTRACT_MISMATCH", { inventory, unknownTables, missingTables });
  return {
    inventory,
    tables: DOMAIN_TABLES.filter((name) => names.includes(name)),
    notDeployedTables: [...OPTIONAL_NOT_DEPLOYED].filter((name) => !names.includes(name)),
    excludedTables: inventory.filter((item) => Object.hasOwn(EXCLUDED_TABLES, item.name))
  };
}

async function readDatabase(env, maximumOutputBytes) {
  const pg = await import("pg");
  const Client = pg.Client || pg.default.Client;
  const types = pg.types || pg.default.types;
  const config = databaseConfig(env);
  // Keep SQL dates/timestamps as source strings and bigint IDs as strings.
  config.types = { getTypeParser: (oid, format) => [1082, 1114, 1184].includes(oid) && format !== "binary" ? (value) => value : types.getTypeParser(oid, format) };
  const client = new Client(config);
  let started = false;
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    started = true;
    await client.query("SET LOCAL statement_timeout = '60s'");
    const metadata = await client.query("SELECT transaction_timestamp() AS snapshot_at, current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation");
    const snapshot = metadata.rows[0];
    if (snapshot.read_only !== "on" || snapshot.isolation !== "repeatable read") throw failure("READONLY_TRANSACTION_NOT_CONFIRMED");
    const tableResult = await client.query("SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY c.relname");
    const contract = classifyTables(tableResult.rows.map((row) => row.name));
    const data = {};
    const counts = {};
    const tableHashes = {};
    let dataBytes = 0;
    for (const table of contract.tables) {
      // Table identifiers originate only in DOMAIN_TABLES, never source data.
      const result = await client.query(`SELECT * FROM public."${table}" AS t ORDER BY to_jsonb(t)::text`);
      const countResult = await client.query(`SELECT count(*)::text AS count FROM public."${table}"`);
      if (String(result.rows.length) !== countResult.rows[0].count) throw failure("TABLE_COUNT_MISMATCH", { table });
      const encoded = JSON.stringify(result.rows);
      dataBytes += Buffer.byteLength(encoded);
      if (dataBytes > maximumOutputBytes) throw failure("DATABASE_OUTPUT_LIMIT_EXCEEDED");
      data[table] = result.rows;
      counts[table] = result.rows.length;
      tableHashes[table] = sha256(encoded);
    }
    await client.query("ROLLBACK");
    started = false;
    return { data, counts, tableHashes, snapshot, contract, dataBytes };
  } finally {
    if (started) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

function recordId(table, record) {
  if (record.id !== undefined && record.id !== null) return String(record.id);
  if (table === "profiles") return String(record.user_id || "");
  return String(record.event_id || record.user_id || "");
}

export function assetReferences(data, env) {
  const privateAssets = [];
  const externalAssetReferences = [];
  const relativeAssetReferences = [];
  function add(table, record, field, bucket, objectName, sourceUrl) {
    privateAssets.push({ table, recordId: recordId(table, record), field, bucket, objectName, sourceUrl });
  }
  for (const record of data.profiles || []) {
    const value = String(record.avatar_url || "");
    if (value.startsWith("gs://")) {
      const prefix = `gs://${env.PROFILE_IMAGE_BUCKET || ""}/`;
      add("profiles", record, "avatar_url", env.PROFILE_IMAGE_BUCKET, value.startsWith(prefix) ? value.slice(prefix.length) : "", value);
    }
  }
  for (const record of data.contacts || []) {
    if (record.image_storage_path) add("contacts", record, "image_storage_path", env.CONTACT_IMAGE_BUCKET, String(record.image_storage_path), `/api/contact-images/${encodeURIComponent(record.id)}`);
  }
  for (const record of data.contact_note_attachments || []) {
    add("contact_note_attachments", record, "storage_path", env.CONTACT_NOTE_ATTACHMENT_BUCKET, String(record.storage_path || ""), `/api/contact-note-attachments/${encodeURIComponent(record.id)}/content`);
  }
  for (const record of data.stakeholder_organizations || []) {
    const value = String(record.logo_url || "");
    const prefix = "private://stakeholder-logos/";
    if (value.startsWith(prefix)) add("stakeholder_organizations", record, "logo_url", env.STAKEHOLDER_LOGO_BUCKET, value.slice(prefix.length), value);
  }
  for (const [table, records] of Object.entries(data)) {
    for (const record of records) {
      for (const field of ["image_url", "logo_url", "avatar_url"]) {
        const value = String(record[field] || "").trim();
        if (!value || value.startsWith("gs://") || value.startsWith("private://") || value.startsWith("data:")) continue;
        // A storage-backed contact photo takes precedence over its legacy URL.
        if (table === "contacts" && field === "image_url" && record.image_storage_path) continue;
        const reference = { table, recordId: recordId(table, record), field, sourceUrl: value };
        if (/^https?:\/\//i.test(value)) externalAssetReferences.push(reference);
        else relativeAssetReferences.push(reference);
      }
    }
  }
  return { privateAssets, externalAssetReferences, relativeAssetReferences };
}

async function responseBuffer(response, maximumBytes) {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maximumBytes) throw failure("RESPONSE_SIZE_LIMIT_EXCEEDED");
  const chunks = [];
  let size = 0;
  if (!response.body) throw failure("EMPTY_RESPONSE_BODY");
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw failure("RESPONSE_SIZE_LIMIT_EXCEEDED");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function fetchJson(url, options, maximumBytes = 64 * 1024) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw failure("REMOTE_READ_FAILED", { httpStatus: response.status });
  return JSON.parse((await responseBuffer(response, maximumBytes)).toString("utf8"));
}

function tokenProvider(env) {
  let cached = "";
  let expiresAt = 0;
  return async () => {
    if (env.GOOGLE_OAUTH_ACCESS_TOKEN) return env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (cached && Date.now() < expiresAt) return cached;
    const result = await fetchJson("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "metadata-flavor": "Google" } });
    if (typeof result.access_token !== "string" || !result.access_token) throw failure("STORAGE_IDENTITY_UNAVAILABLE");
    cached = result.access_token;
    expiresAt = Date.now() + Math.max(0, Number(result.expires_in || 0) - 60) * 1000;
    return cached;
  };
}

async function readAsset(reference, accessToken, maximumAssetBytes) {
  const { bucket, objectName } = reference;
  if (!bucket || !objectName || /[\u0000-\u001f\u007f]/.test(objectName)) throw failure("INVALID_STORAGE_REFERENCE");
  const headers = { authorization: `Bearer ${await accessToken()}` };
  const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;
  const metadataUrl = new URL(endpoint);
  metadataUrl.searchParams.set("fields", "name,size,contentType,generation,md5Hash,crc32c");
  const metadata = await fetchJson(metadataUrl, { headers });
  const size = Number(metadata.size);
  if (metadata.name !== objectName || !Number.isSafeInteger(size) || size < 0 || size > maximumAssetBytes || !/^\d+$/.test(String(metadata.generation || ""))) throw failure("INVALID_STORAGE_METADATA");
  const mediaUrl = new URL(endpoint);
  mediaUrl.searchParams.set("alt", "media");
  mediaUrl.searchParams.set("generation", String(metadata.generation));
  const response = await fetch(mediaUrl, { headers, redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw failure("STORAGE_MEDIA_READ_FAILED", { httpStatus: response.status });
  const buffer = await responseBuffer(response, maximumAssetBytes);
  if (buffer.length !== size) throw failure("STORAGE_SIZE_MISMATCH");
  if (metadata.md5Hash && crypto.createHash("md5").update(buffer).digest("base64") !== metadata.md5Hash) throw failure("STORAGE_CHECKSUM_MISMATCH");
  return {
    table: reference.table, recordId: reference.recordId, field: reference.field,
    sourceUrl: reference.sourceUrl,
    mimeType: String(metadata.contentType || "application/octet-stream"),
    storageGeneration: String(metadata.generation), size,
    sha256: sha256(buffer), base64: buffer.toString("base64")
  };
}

async function readBundestagSource(externalAssetReferences, env) {
  if (env.VK_OFFLINE_SKIP_BUNDESTAG === "1") return { status: "pending_local_capture", code: "DEFERRED_BY_CALLER" };
  const candidates = ["api/bundestag-health-committee.mjs", "bundestag-health-committee.mjs"];
  const file = candidates.map((name) => path.resolve(process.cwd(), name)).find((name) => existsSync(name));
  if (!file) return { status: "pending_local_capture", code: "SOURCE_MODULE_NOT_DEPLOYED" };
  try {
    const module = await import(pathToFileURL(file).href);
    if (typeof module.createBundestagHealthCommitteeDirectory !== "function") throw failure("SOURCE_MODULE_CONTRACT_MISMATCH");
    const payload = await module.createBundestagHealthCommitteeDirectory().load();
    for (const member of payload.members || []) {
      if (member.imageUrl) externalAssetReferences.push({ table: "bundestag_health_committee", recordId: String(member.id || member.memberId || member.name || ""), field: "imageUrl", sourceUrl: member.imageUrl });
    }
    return { status: "captured", capturedAt: new Date().toISOString(), payload };
  } catch {
    return { status: "pending_local_capture", code: "SOURCE_READ_FAILED" };
  }
}

export async function extract(env = process.env) {
  const maximumOutputBytes = positiveLimit(env.VK_OFFLINE_MAX_OUTPUT_BYTES, 300 * MIB, HARD_OUTPUT_BYTES);
  const maximumAssetBytes = positiveLimit(env.VK_OFFLINE_MAX_ASSET_BYTES, 25 * MIB, 100 * MIB);
  const startedAt = new Date().toISOString();
  const database = await readDatabase(env, maximumOutputBytes);
  const references = assetReferences(database.data, env);
  const assets = [];
  const missingAssets = [];
  const accessToken = tokenProvider(env);
  let estimatedBytes = database.dataBytes;
  for (const reference of references.privateAssets) {
    try {
      const asset = await readAsset(reference, accessToken, maximumAssetBytes);
      estimatedBytes += Buffer.byteLength(JSON.stringify(asset));
      if (estimatedBytes > maximumOutputBytes) throw failure("TOTAL_OUTPUT_LIMIT_EXCEEDED");
      assets.push(asset);
    } catch (error) {
      if (error.safeCode === "TOTAL_OUTPUT_LIMIT_EXCEEDED") throw error;
      missingAssets.push({ table: reference.table, recordId: reference.recordId, field: reference.field, sourceUrl: reference.sourceUrl, code: error.safeCode || "STORAGE_READ_FAILED", ...(error.safeDetails?.httpStatus ? { httpStatus: error.safeDetails.httpStatus } : {}) });
    }
  }
  const externalSources = { bundestagHealthCommittee: await readBundestagSource(references.externalAssetReferences, env) };
  const result = {
    schemaVersion: 1,
    exportedAt: new Date(database.snapshot.snapshot_at).toISOString(),
    extractionFinishedAt: new Date().toISOString(),
    startedAt,
    sourceUrl: "https://versorgungs-kompass.de",
    databaseSnapshotAt: database.snapshot.snapshot_at,
    databaseReadOnly: true,
    databaseIsolation: "repeatable read",
    counts: database.counts,
    tableHashes: database.tableHashes,
    tableInventory: database.contract.inventory,
    data: database.data,
    assets,
    externalAssetReferences: references.externalAssetReferences,
    relativeAssetReferences: references.relativeAssetReferences,
    externalSources,
    completeness: {
      databaseComplete: true,
      privateAssetsComplete: missingAssets.length === 0,
      missingAssets,
      expectedPrivateAssetCount: references.privateAssets.length,
      capturedPrivateAssetCount: assets.length,
      notDeployedTables: database.contract.notDeployedTables,
      excludedTables: database.contract.excludedTables,
      externalAssetsPending: references.externalAssetReferences.length,
      relativeAssetsPending: references.relativeAssetReferences.length,
      externalSourcesPending: Object.values(externalSources).filter((source) => source.status !== "captured").length,
      scope: "business_data_reading_snapshot",
      databaseBackup: false
    }
  };
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized) > maximumOutputBytes) throw failure("TOTAL_OUTPUT_LIMIT_EXCEEDED");
  return serialized;
}

const invokedDirectly = (process.argv[1] === "-" && import.meta.url.endsWith("/[eval1]")) || (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    const serialized = await extract();
    await new Promise((resolve, reject) => process.stdout.write(`${serialized}\n`, (error) => error ? reject(error) : resolve()));
  } catch (error) {
    // Never print raw database, TLS, filesystem or HTTP errors: they may carry
    // passwords, query values, local paths, authorization headers or body data.
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, error: { code: error.safeCode || "EXTRACTION_FAILED", ...(error.safeDetails || {}) } })}\n`);
    process.exitCode = 1;
  }
}
