#!/usr/bin/env node
/** Bootstrap an empty, isolated local database from a verified reading archive. */
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAIN_TABLES } from "../offline-copy/extract-remote.mjs";
import { verifyArchive } from "../offline-copy/archive.mjs";

const LOCAL_CONFIRMATION = "isolated-local-database";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "database"]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => Object.assign(new Error(code), { safeCode: code });
const identifier = (value) => {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/.test(value)) throw fail("UNSAFE_DATABASE_IDENTIFIER");
  return `"${value}"`;
};
const relation = (schema, table) => `${identifier(schema)}.${identifier(table)}`;

function safeDiagnostic(error, phase, table = "") {
  const diagnostic = { phase };
  if (DOMAIN_TABLES.includes(table)) diagnostic.table = table;
  if (/^[A-Z0-9]{5}$/.test(error?.code || "")) diagnostic.sqlState = error.code;
  else if (/^[A-Z][A-Z0-9_]+$/.test(error?.code || "")) diagnostic.runtimeCode = error.code;
  for (const key of ["schema", "constraint", "column"]) {
    if (/^[a-z_][a-z0-9_]*$/.test(error?.[key] || "")) diagnostic[key] = error[key];
  }
  return diagnostic;
}

export async function localConnectionConfig(env = process.env, read = readFile) {
  if (env.LOCAL_APP_IMPORT_CONFIRMATION !== LOCAL_CONFIRMATION) throw fail("LOCAL_IMPORT_CONFIRMATION_REQUIRED");
  const host = env.LOCAL_DB_HOST || "database";
  const database = env.LOCAL_DB_NAME || "versorgungs_kompass_local";
  const user = env.LOCAL_DB_USER || "vk_local_admin";
  const port = Number(env.LOCAL_DB_PORT || 5432);
  if (!LOCAL_HOSTS.has(host)) throw fail("NONLOCAL_DATABASE_FORBIDDEN");
  if (database !== "versorgungs_kompass_local" || user !== "vk_local_admin") throw fail("LOCAL_DATABASE_IDENTITY_MISMATCH");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail("INVALID_LOCAL_DATABASE_PORT");
  if (env.LOCAL_DB_PASSWORD && env.LOCAL_DB_PASSWORD_FILE) throw fail("AMBIGUOUS_LOCAL_PASSWORD");
  const password = env.LOCAL_DB_PASSWORD_FILE
    ? (await read(env.LOCAL_DB_PASSWORD_FILE, "utf8")).replace(/\r?\n$/, "")
    : env.LOCAL_DB_PASSWORD;
  if (!password || typeof password !== "string") throw fail("LOCAL_PASSWORD_REQUIRED");
  // Deliberately never consume DATABASE_URL, PG*, DB_* or cloud identities.
  return { host, database, user, port, password, ssl: false, application_name: "versorgungs-kompass-local-snapshot-import", connectionTimeoutMillis: 10000, query_timeout: 120000, statement_timeout: 120000 };
}

export function schemaBody(schemaSql) {
  if (typeof schemaSql !== "string") throw fail("SCHEMA_INVALID");
  const opening = /^(?:\s|--[^\n]*(?:\n|$))*begin\s*;/i.exec(schemaSql);
  const ending = /\bcommit\s*;\s*$/i.exec(schemaSql);
  if (!opening || !ending || ending.index <= opening[0].length) throw fail("SCHEMA_TRANSACTION_WRAPPER_REQUIRED");
  const body = schemaSql.slice(opening[0].length, ending.index);
  // Reject psql meta commands; node-postgres must execute only the known SQL.
  if (/^\s*\\/m.test(body)) throw fail("SCHEMA_META_COMMAND_FORBIDDEN");
  if (/^\s*(?:begin|commit|rollback|start\s+transaction)\s*;/im.test(body)) throw fail("SCHEMA_NESTED_TRANSACTION_FORBIDDEN");
  return body;
}

export function chooseLocalProfile(profiles, profileId = null) {
  const candidates = (Array.isArray(profiles) ? profiles : []).filter((profile) =>
    (!profileId || profile?.id === profileId) && profile.active === true && profile.role === "admin"
  );
  if (candidates.length !== 1 || !candidates[0].id || !candidates[0].email) throw fail("LOCAL_PROFILE_NOT_UNIQUE");
  return { profileId: String(candidates[0].id), profileEmail: String(candidates[0].email) };
}

export function tableImportPlan(table, rows, schemaColumns) {
  if (!DOMAIN_TABLES.includes(table) || !Array.isArray(rows) || !Array.isArray(schemaColumns) || !schemaColumns.length) throw fail("IMPORT_TABLE_CONTRACT_INVALID");
  const columns = new Map(schemaColumns.map((column) => [column.name, column]));
  const sourceColumns = rows.length ? Object.keys(rows[0]).sort() : [];
  const expectedShape = sourceColumns.join("\0");
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join("\0") !== expectedShape) throw fail("IMPORT_ROW_SHAPE_MISMATCH");
  }
  if (sourceColumns.some((name) => !columns.has(name))) throw fail("SOURCE_COLUMN_NOT_IN_LOCAL_SCHEMA");
  const generatedColumns = schemaColumns.filter((column) => column.generated).map((column) => column.name);
  const insertColumns = sourceColumns.filter((name) => !columns.get(name).generated);
  if (rows.length && !insertColumns.length) throw fail("IMPORT_COLUMNS_EMPTY");
  // Computed search vectors are regenerated; identity IDs are intentionally
  // preserved, because business relationships refer to those exact IDs.
  const importedRows = rows.map((row) => Object.fromEntries(insertColumns.map((name) => [name, row[name]])));
  const defaultsAddedByLocalSchema = schemaColumns.filter((column) => !column.generated && !sourceColumns.includes(column.name)).map((column) => column.name);
  return { table, columns: insertColumns, rows: importedRows, generatedColumns, defaultsAddedByLocalSchema };
}

export function foreignKeyRevalidationStatements(constraint) {
  const table = relation(constraint.schema_name, constraint.table_name);
  const name = identifier(constraint.constraint_name);
  const definition = String(constraint.definition || "").replace(/\s+NOT VALID\s*$/i, "");
  if (!/^FOREIGN KEY\s*\(/i.test(definition) || /;/.test(definition)) throw fail("FOREIGN_KEY_CONTRACT_INVALID");
  return [
    `ALTER TABLE ${table} DROP CONSTRAINT ${name}`,
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition} NOT VALID`,
    `ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`
  ];
}

async function assertEmptyLocalDatabase(client, expectedDatabase) {
  const identity = (await client.query("SELECT current_database() AS database_name, current_user AS user_name")).rows[0];
  if (identity?.database_name !== expectedDatabase || identity?.user_name !== "vk_local_admin") throw fail("LOCAL_DATABASE_IDENTITY_MISMATCH");
  const existing = await client.query("SELECT n.nspname, c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S') LIMIT 1");
  if (existing.rows.length) throw fail("LOCAL_DATABASE_NOT_EMPTY");
}

export async function loadSchemaColumns(client) {
  const result = await client.query("SELECT c.relname AS table_name, a.attname AS name, a.attgenerated <> '' AS generated, a.attidentity AS identity_kind FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum");
  const tables = new Map();
  for (const column of result.rows) {
    if (!tables.has(column.table_name)) tables.set(column.table_name, []);
    tables.get(column.table_name).push(column);
  }
  return tables;
}

export async function importTable(client, plan) {
  const table = relation("public", plan.table);
  if (plan.rows.length) {
    const selected = plan.columns.map(identifier).join(", ");
    // PostgreSQL casts dates, JSONB, arrays and identity values using its own
    // table type, avoiding lossy JavaScript type conversions.
    const result = await client.query(`INSERT INTO ${table} (${selected}) OVERRIDING SYSTEM VALUE SELECT ${selected} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [JSON.stringify(plan.rows)]);
    if (result.rowCount !== plan.rows.length) throw fail("LOCAL_IMPORT_COUNT_MISMATCH");
  }
}

export async function verifyImportedTable(client, plan) {
  const table = relation("public", plan.table);
  const result = await client.query(`SELECT count(*)::text AS count FROM ${table}`);
  if (result.rows[0]?.count !== String(plan.rows.length)) throw fail("LOCAL_IMPORT_COUNT_MISMATCH");
  if (!plan.rows.length) return { count: 0, verified: true };
  const selected = plan.columns.map(identifier).join(", ");
  // EXCEPT ALL verifies the entire row multiset, not only record counts or IDs.
  const comparison = await client.query(`WITH expected AS (SELECT ${selected} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)), actual AS (SELECT ${selected} FROM ${table}) SELECT NOT EXISTS ((SELECT * FROM expected EXCEPT ALL SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)) AS identical`, [JSON.stringify(plan.rows)]);
  if (comparison.rows[0]?.identical !== true) throw fail("LOCAL_IMPORT_CONTENT_MISMATCH");
  return { count: plan.rows.length, verified: true };
}

export async function resetIdentitySequences(client, schemaTables) {
  for (const [table, columns] of schemaTables) {
    for (const column of columns.filter((item) => item.identity_kind)) {
      const sequence = (await client.query("SELECT pg_get_serial_sequence($1, $2) AS name", [`public.${table}`, column.name])).rows[0]?.name;
      if (!sequence) throw fail("LOCAL_IDENTITY_SEQUENCE_MISSING");
      await client.query(`SELECT setval($1::regclass, greatest(coalesce((SELECT max(${identifier(column.name)}) FROM ${relation("public", table)}), 1), 1), EXISTS (SELECT 1 FROM ${relation("public", table)}))`, [sequence]);
    }
  }
}

/** The caller supplies a connected client made using localConnectionConfig. */
export async function importSnapshot({ client, snapshot, schemaSql, snapshotSha256, expectedDatabase = "versorgungs_kompass_local", profileId = null }) {
  if (!client || typeof client.query !== "function") throw fail("LOCAL_CLIENT_REQUIRED");
  if (expectedDatabase !== "versorgungs_kompass_local") throw fail("LOCAL_DATABASE_IDENTITY_MISMATCH");
  if (snapshot?.schemaVersion !== 1 || snapshot.sourceUrl !== "https://versorgungs-kompass.de" || !Number.isFinite(Date.parse(snapshot.exportedAt))) throw fail("SNAPSHOT_INVALID");
  if (!snapshot.data || !snapshot.counts || !/^[a-f0-9]{64}$/.test(snapshotSha256 || "")) throw fail("VERIFIED_SNAPSHOT_REQUIRED");
  if (Object.keys(snapshot.data).some((name) => !DOMAIN_TABLES.includes(name) && name !== "bundestag_health_committee")) throw fail("SNAPSHOT_UNEXPECTED_TABLE");
  for (const table of DOMAIN_TABLES) {
    if (!Object.hasOwn(snapshot.data, table)) {
      if (table === "network_registrations" && snapshot.completeness?.notDeployedTables?.includes(table)) continue;
      throw fail("SNAPSHOT_REQUIRED_TABLE_MISSING");
    }
    if (!Array.isArray(snapshot.data[table]) || snapshot.counts[table] !== snapshot.data[table].length) throw fail("SNAPSHOT_COUNT_MISMATCH");
  }
  const profile = chooseLocalProfile(snapshot.data.profiles, profileId);
  const sql = schemaBody(schemaSql);
  let transaction = false;
  let phase = "begin";
  let activeTable = "";
  try {
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-local-first-import-v1', 0))");
    phase = "empty_database_check";
    await assertEmptyLocalDatabase(client, expectedDatabase);
    phase = "schema_bootstrap";
    await client.query(sql);
    phase = "schema_inventory";
    const schemaTables = await loadSchemaColumns(client);
    const plans = DOMAIN_TABLES.filter((table) => Object.hasOwn(snapshot.data, table)).map((table) => tableImportPlan(table, snapshot.data[table], schemaTables.get(table)));
    // Only inside this isolated bootstrap transaction: disable mutating audit
    // triggers so importing history never creates extra or altered history.
    await client.query("SET LOCAL session_replication_role = replica");
    phase = "table_import";
    for (const plan of plans) {
      activeTable = plan.table;
      await importTable(client, plan);
    }
    activeTable = "";
    await client.query("SET LOCAL session_replication_role = origin");
    phase = "foreign_key_validation";
    const foreignKeys = await client.query("SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND con.contype = 'f' ORDER BY c.relname, con.conname");
    // VALIDATE alone would skip constraints already marked valid. Recreating
    // each FK as NOT VALID forces PostgreSQL to inspect every imported row.
    for (const constraint of foreignKeys.rows) {
      activeTable = constraint.table_name;
      for (const statement of foreignKeyRevalidationStatements(constraint)) await client.query(statement);
    }
    phase = "content_verification";
    const verification = {};
    for (const plan of plans) {
      activeTable = plan.table;
      verification[plan.table] = await verifyImportedTable(client, plan);
    }
    activeTable = "";
    phase = "identity_sequences";
    await resetIdentitySequences(client, schemaTables);
    phase = "final_constraint_validation";
    const invalid = await client.query("SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT con.convalidated");
    if (invalid.rows[0]?.count !== 0) throw fail("LOCAL_CONSTRAINTS_NOT_VALIDATED");
    const counts = Object.fromEntries(plans.map((plan) => [plan.table, plan.rows.length]));
    const marker = {
      schemaVersion: 1, seededAt: new Date().toISOString(), exportedAt: snapshot.exportedAt,
      sourceUrl: snapshot.sourceUrl, snapshotSha256, schemaSha256: digest(schemaSql),
      profileId: profile.profileId, counts, verification,
      omittedGeneratedColumns: Object.fromEntries(plans.filter((plan) => plan.generatedColumns.length).map((plan) => [plan.table, plan.generatedColumns])),
      defaultsAddedByLocalSchema: Object.fromEntries(plans.filter((plan) => plan.rows.length && plan.defaultsAddedByLocalSchema.length).map((plan) => [plan.table, plan.defaultsAddedByLocalSchema])),
      notDeployedSourceTables: snapshot.completeness?.notDeployedTables || [],
      externalTables: Object.keys(snapshot.data).filter((name) => !DOMAIN_TABLES.includes(name)),
      foreignKeysValidated: foreignKeys.rows.length
    };
    phase = "import_marker";
    await client.query("CREATE SCHEMA local_app");
    await client.query("REVOKE ALL ON SCHEMA local_app FROM PUBLIC");
    await client.query("CREATE TABLE local_app.meta (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), metadata jsonb NOT NULL)");
    await client.query("INSERT INTO local_app.meta (metadata) VALUES ($1::jsonb)", [JSON.stringify(marker)]);
    phase = "commit";
    await client.query("COMMIT");
    transaction = false;
    return { ...profile, exportedAt: snapshot.exportedAt, counts, marker };
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    const sanitized = error?.safeCode ? error : fail("LOCAL_IMPORT_FAILED");
    sanitized.diagnostic = safeDiagnostic(error, phase, activeTable);
    throw sanitized;
  }
}

export async function importVerifiedArchive({ snapshotDirectory, schemaPath, env = process.env }) {
  const resolvedArchive = await realpath(snapshotDirectory);
  const manifest = await verifyArchive(resolvedArchive);
  const snapshotText = await readFile(path.join(resolvedArchive, "snapshot.json"), "utf8");
  if (digest(snapshotText) !== manifest.files?.["snapshot.json"]?.sha256) throw fail("VERIFIED_SNAPSHOT_CHANGED");
  const schemaSql = await readFile(schemaPath, "utf8");
  const config = await localConnectionConfig(env);
  const require = createRequire(new URL("../../api/package.json", import.meta.url));
  const { Client } = require("pg");
  const client = new Client(config);
  try {
    await client.connect();
    return await importSnapshot({ client, snapshot: JSON.parse(snapshotText), schemaSql, snapshotSha256: digest(snapshotText), expectedDatabase: config.database, profileId: env.LOCAL_APP_PROFILE_ID || null });
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : "";
  const snapshotDirectory = option("--snapshot-dir");
  const schemaPath = option("--schema");
  if (!snapshotDirectory || !schemaPath) {
    console.error(JSON.stringify({ ok: false, code: "IMPORT_ARGUMENTS_REQUIRED" }));
    process.exitCode = 2;
  } else {
    try {
      const result = await importVerifiedArchive({ snapshotDirectory, schemaPath });
      // Profile identity stays in the local database / direct function result.
      console.log(JSON.stringify({ ok: true, exportedAt: result.exportedAt, counts: result.counts, foreignKeysValidated: result.marker.foreignKeysValidated }));
    } catch (error) {
      console.error(JSON.stringify({ ok: false, code: error.safeCode || "LOCAL_IMPORT_FAILED", diagnostic: error.diagnostic || safeDiagnostic(error, "archive_or_connection") }));
      process.exitCode = 1;
    }
  }
}
