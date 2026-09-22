import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DOMAIN_TABLES } from "../offline-copy/extract-remote.mjs";
import { chooseLocalProfile, foreignKeyRevalidationStatements, importSnapshot, localConnectionConfig, schemaBody, tableImportPlan } from "./import-snapshot.mjs";

const environment = { LOCAL_APP_IMPORT_CONFIRMATION: "isolated-local-database", LOCAL_DB_PASSWORD: "synthetic-local-password" };

test("Verbindung ignoriert Produktivvariablen und erlaubt nur isolierten lokalen Zielnamen", async () => {
  const config = await localConnectionConfig({ ...environment, DATABASE_URL: "postgres://prod:secret@live.invalid/live", DB_HOST: "live.invalid", PGPASSWORD: "production-secret" });
  assert.equal(config.host, "database");
  assert.equal(config.database, "versorgungs_kompass_local");
  assert.equal(config.user, "vk_local_admin");
  assert.equal(config.password, "synthetic-local-password");
  for (const host of ["live.invalid", "10.0.0.1", "database.live.invalid", "127.0.0.2", "/tmp/socket"]) {
    await assert.rejects(localConnectionConfig({ ...environment, LOCAL_DB_HOST: host }), /NONLOCAL_DATABASE_FORBIDDEN/);
  }
  await assert.rejects(localConnectionConfig({ ...environment, LOCAL_DB_NAME: "production" }), /LOCAL_DATABASE_IDENTITY_MISMATCH/);
  await assert.rejects(localConnectionConfig({ ...environment, LOCAL_APP_IMPORT_CONFIRMATION: "" }), /LOCAL_IMPORT_CONFIRMATION_REQUIRED/);
});

test("lokales Passwort kann ausschließlich aus der dedizierten Secret-Datei stammen", async () => {
  const config = await localConnectionConfig({ LOCAL_APP_IMPORT_CONFIRMATION: "isolated-local-database", LOCAL_DB_PASSWORD_FILE: "/run/secrets/local-db-password" }, async (file) => {
    assert.equal(file, "/run/secrets/local-db-password");
    return "synthetic-password\n";
  });
  assert.equal(config.password, "synthetic-password");
  await assert.rejects(localConnectionConfig({ ...environment, LOCAL_DB_PASSWORD_FILE: "ambiguous" }), /AMBIGUOUS_LOCAL_PASSWORD/);
});

test("ausdrücklich gewähltes aktives Adminprofil wird übernommen; Namen wählen keine Identität", () => {
  const profile = { id: "synthetic-admin", email: "synthetic@example.invalid", display_name: "Alex Beispiel", active: true, role: "admin" };
  assert.deepEqual(chooseLocalProfile([profile, { ...profile, id: "test", display_name: "Testprofil" }], profile.id), { profileId: profile.id, profileEmail: profile.email });
  assert.throws(() => chooseLocalProfile([profile], "missing"), /LOCAL_PROFILE_NOT_UNIQUE/);
  assert.throws(() => chooseLocalProfile([{ ...profile, active: false }]), /LOCAL_PROFILE_NOT_UNIQUE/);
  assert.throws(() => chooseLocalProfile([profile, { ...profile, id: "duplicate" }]), /LOCAL_PROFILE_NOT_UNIQUE/);
});

test("aktuelles Schema liegt vollständig innerhalb der Importtransaktion", async () => {
  const sql = await readFile(new URL("../../deploy/postgres/pre-gematik/schema.sql", import.meta.url), "utf8");
  const body = schemaBody(sql);
  assert.match(body, /create table if not exists public\.hospitation_observations/i);
  assert.doesNotMatch(body, /^\s*(?:begin|commit)\s*;/im);
  assert.throws(() => schemaBody("create table x(id int);"), /SCHEMA_TRANSACTION_WRAPPER_REQUIRED/);
  assert.throws(() => schemaBody("begin;\ncommit;\ncreate table x(id int);\ncommit;"), /SCHEMA_NESTED_TRANSACTION_FORBIDDEN/);
  assert.throws(() => schemaBody("begin;\n\\include unknown.sql\ncommit;"), /SCHEMA_META_COMMAND_FORBIDDEN/);
});

test("berechnete Suchfelder werden ausgelassen, IDs und verschachtelte Fachdaten bleiben erhalten", () => {
  const input = [{ id: "9007199254740993", payload: { sourceReference: "synthetic", nested: ["a", null] }, search_vector: "'synthetic':1" }];
  const columns = [{ name: "id", generated: false, identity_kind: "d" }, { name: "payload", generated: false }, { name: "search_vector", generated: true }, { name: "new_column", generated: false }];
  const result = tableImportPlan("hospitation_observations", input, columns);
  assert.deepEqual(result.columns, ["id", "payload"]);
  assert.equal(result.rows[0].id, "9007199254740993");
  assert.deepEqual(result.rows[0].payload, input[0].payload);
  assert.deepEqual(result.generatedColumns, ["search_vector"]);
  assert.deepEqual(result.defaultsAddedByLocalSchema, ["new_column"]);
  assert.equal(input[0].search_vector, "'synthetic':1");
  assert.throws(() => tableImportPlan("hospitation_observations", [{ id: "x", unsupported: true }], columns), /SOURCE_COLUMN_NOT_IN_LOCAL_SCHEMA/);
  assert.throws(() => tableImportPlan("hospitation_observations", [{ id: "x" }, { id: "y", payload: {} }], columns), /IMPORT_ROW_SHAPE_MISMATCH/);
});

test("Fremdschlüssel werden NOT VALID neu angelegt und vollständig validiert", () => {
  const sql = foreignKeyRevalidationStatements({ schema_name: "public", table_name: "hospitations", constraint_name: "hospitations_contact_id_fkey", definition: "FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL" });
  assert.match(sql[0], /DROP CONSTRAINT/);
  assert.match(sql[1], /ON DELETE SET NULL NOT VALID$/);
  assert.match(sql[2], /VALIDATE CONSTRAINT/);
  assert.throws(() => foreignKeyRevalidationStatements({ schema_name: "public", table_name: "bad;name", constraint_name: "fkey", definition: "FOREIGN KEY (id) REFERENCES profiles(id)" }), /UNSAFE_DATABASE_IDENTIFIER/);
});

function snapshot() {
  const data = Object.fromEntries(DOMAIN_TABLES.filter((table) => table !== "network_registrations").map((table) => [table, []]));
  data.profiles = [{ id: "synthetic", email: "synthetic@example.invalid", display_name: "Alex Beispiel", active: true, role: "admin" }];
  return { schemaVersion: 1, sourceUrl: "https://versorgungs-kompass.de", exportedAt: "2026-09-20T00:00:00.000Z", data, counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])), completeness: { notDeployedTables: ["network_registrations"] } };
}

test("bereits vorhandene Datenbank wird ohne Schema- oder Datenänderung abgewiesen", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith("SELECT current_database")) return { rows: [{ database_name: "versorgungs_kompass_local", user_name: "vk_local_admin" }] };
    if (sql.includes("c.relkind IN ('r', 'p', 'v', 'm', 'S')")) return { rows: [{ nspname: "public", relname: "profiles" }] };
    return { rows: [] };
  } };
  await assert.rejects(importSnapshot({ client, snapshot: snapshot(), schemaSql: "begin;\nCREATE TABLE should_not_run (id int);\ncommit;", snapshotSha256: "a".repeat(64) }), /LOCAL_DATABASE_NOT_EMPTY/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.some((sql) => sql.includes("should_not_run")), false);
  assert.equal(calls.includes("COMMIT"), false);
});

test("Importfehler rollen vollständig zurück und geben keine Rohfehler preis", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith("SELECT current_database")) return { rows: [{ database_name: "versorgungs_kompass_local", user_name: "vk_local_admin" }] };
    if (sql.includes("CREATE TABLE synthetic_failure")) throw new Error("SECRET RAW DATABASE ERROR synthetic-password");
    return { rows: [] };
  } };
  await assert.rejects(importSnapshot({ client, snapshot: snapshot(), schemaSql: "begin;\nCREATE TABLE synthetic_failure (id int);\ncommit;", snapshotSha256: "a".repeat(64) }), (error) => error.message === "LOCAL_IMPORT_FAILED");
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.includes("COMMIT"), false);
});
