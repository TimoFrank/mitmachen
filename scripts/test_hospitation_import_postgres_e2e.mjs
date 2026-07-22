import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const schemaSql = readFileSync(new URL("../deploy/postgres/pre-gematik/schema.sql", import.meta.url), "utf8");
const runtimeRoleSql = readFileSync(new URL("../deploy/postgres/pre-gematik/runtime-role.sql", import.meta.url), "utf8");
const grantsSql = readFileSync(new URL("../deploy/postgres/pre-gematik/grants.sql", import.meta.url), "utf8");
const requireDocker = process.argv.includes("--require-docker");
const ownerProfileId = "synthetic-hospitation-import-owner";
const existingOwnerProfileId = "synthetic-existing-domain-owner";
const runtimeRoleName = "vk_app_runtime";
const runtimeUser = "vk_hosp_import_e2e_app";
const dockerImage = "postgres:16-alpine";
const stateTables = Object.freeze([
  ["profiles", "row_value.id"],
  ["organizations", "row_value.id"],
  ["contacts", "row_value.id"],
  ["contact_owners", "row_value.contact_id, row_value.profile_id"],
  ["hospitations", "row_value.id"],
  ["hospitation_observations", "row_value.id"],
  ["hospitation_observation_changes", "row_value.id"],
  ["import_runs", "row_value.id"],
  ["activity_events", "row_value.id"]
]);

function dockerIsAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function runDocker(args, { input, quiet = false } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: quiet ? "ignore" : "pipe",
    timeout: 180_000
  });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || "unbekannter Docker-Fehler";
    throw new Error(`Docker-Aufruf fehlgeschlagen: ${String(detail).trim()}`);
  }
  return String(result.stdout || "").trim();
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function unusedLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.ok(port > 0, "Es konnte kein freier lokaler API-Port bestimmt werden.");
  return port;
}

async function waitForPostgres(pool) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`PostgreSQL wurde nicht rechtzeitig bereit: ${lastError?.message || "unbekannter Fehler"}`);
}

async function waitForApi(baseUrl, child, logs) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Die Test-API wurde vorzeitig beendet (Exit ${child.exitCode}).\n${logs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/readyz`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      lastError = new Error(`readyz antwortete mit HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Die Test-API wurde nicht rechtzeitig bereit: ${lastError?.message || "unbekannter Fehler"}\n${logs()}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timeout = delay(5000).then(() => "timeout");
  if (await Promise.race([exited, timeout]) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    if (await Promise.race([exited, delay(2000).then(() => "timeout")]) === "timeout") {
      throw new Error("Der lokale Test-API-Prozess konnte nicht beendet werden.");
    }
  }
}

function syntheticManifest(suffix, snapshotId, startsAt) {
  const organizationId = `synthetic-import-org-${suffix}`;
  const contactId = `synthetic-import-contact-${suffix}`;
  const hospitationId = `synthetic-import-hospitation-${suffix}`;
  const observationId = `synthetic-import-observation-${suffix}`;
  const label = suffix.toUpperCase();
  const createdAt = "2026-07-22T08:00:00.000Z";
  return {
    schemaVersion: "hospitation-staging/v1",
    snapshot: {
      id: snapshotId,
      createdAt,
      source: "local-hospitation"
    },
    ownerRef: "timo-frank",
    organizations: [{
      id: organizationId,
      name: `Synthetische Import-Organisation ${label}`,
      sector: "Praxis",
      city: "Teststadt",
      source: "synthetic-http-postgres-e2e",
      status: "active"
    }],
    contacts: [{
      id: contactId,
      name: `Synthetischer Import-Kontakt ${label}`,
      organizationId,
      organization: `Synthetische Import-Organisation ${label}`,
      sector: "Praxis",
      city: "Teststadt",
      topics: ["Synthetischer Testprozess"],
      source: "synthetic-http-postgres-e2e",
      status: "active"
    }],
    hospitations: [{
      id: hospitationId,
      contactId,
      contactName: `Synthetischer Import-Kontakt ${label}`,
      organizationId,
      organizationName: `Synthetische Import-Organisation ${label}`,
      status: "Dokumentiert",
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
      city: "Teststadt",
      sector: "Praxis",
      goal: "Ausschließlich synthetischer Ende-zu-Ende-Test",
      topics: ["Synthetischer Testprozess"],
      documentationSummary: "Synthetische Dokumentation ohne Personen- oder Produktivdaten.",
      documentedAt: startsAt
    }],
    observations: [{
      id: observationId,
      hospitationId,
      sequence: 1,
      title: `Synthetische Beobachtung ${label}`,
      situation: "Kontrollierte synthetische Testsituation.",
      description: "Ein rein synthetischer Ablauf wurde für den Importtest beobachtet.",
      processPhase: "Testvorbereitung",
      problemType: "Synthetischer Testfall",
      impact: "Keine Auswirkung außerhalb des Wegwerfcontainers.",
      observationType: "Prozessbeobachtung",
      evidenceType: "directly_observed",
      relevanceScore: 4,
      usageRecommendation: "Nur zur automatisierten Qualitätssicherung verwenden.",
      involvedRoles: ["Synthetische Testrolle"],
      affectedProducts: ["Synthetisches Testsystem"],
      topics: ["Synthetischer Testprozess"],
      source: "synthetic-http-postgres-e2e",
      internalUseAllowed: true,
      externalUseAllowed: false,
      status: "active",
      createdAt,
      updatedAt: createdAt
    }]
  };
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${pathname} lieferte kein JSON (HTTP ${response.status}).`);
  }
  return { status: response.status, payload };
}

async function preview(baseUrl, manifest) {
  return postJson(baseUrl, "/api/admin/hospitation-import/preview", { manifest });
}

async function apply(baseUrl, manifest, previewPayload) {
  return postJson(baseUrl, "/api/admin/hospitation-import/apply", {
    manifest,
    manifestFingerprint: previewPayload.manifestFingerprint,
    targetFingerprint: previewPayload.targetFingerprint,
    confirmation: "HOSPITATIONEN IMPORTIEREN",
    backupConfirmed: true
  });
}

async function databaseState(pool) {
  const state = {};
  for (const [table, order] of stateTables) {
    const result = await pool.query(
      `select coalesce(jsonb_agg(to_jsonb(row_value) order by ${order}), '[]'::jsonb)::text as value
         from public.${table} as row_value`
    );
    state[table] = result.rows[0].value;
  }
  return state;
}

async function countById(pool, table, id) {
  const result = await pool.query(`select count(*)::int as count from public.${table} where id = $1`, [id]);
  return result.rows[0].count;
}

function manifestIds(manifest) {
  return {
    organizationId: manifest.organizations[0].id,
    contactId: manifest.contacts[0].id,
    hospitationId: manifest.hospitations[0].id,
    observationId: manifest.observations[0].id
  };
}

async function assertManifestRowsAbsent(pool, manifest) {
  const ids = manifestIds(manifest);
  assert.equal(await countById(pool, "organizations", ids.organizationId), 0);
  assert.equal(await countById(pool, "contacts", ids.contactId), 0);
  assert.equal(await countById(pool, "hospitations", ids.hospitationId), 0);
  assert.equal(await countById(pool, "hospitation_observations", ids.observationId), 0);
  const changes = await pool.query(
    "select count(*)::int as count from public.hospitation_observation_changes where observation_id = $1",
    [ids.observationId]
  );
  assert.equal(changes.rows[0].count, 0);
  const runs = await pool.query(
    "select count(*)::int as count from public.import_runs where report ->> 'snapshotId' = $1",
    [manifest.snapshot.id]
  );
  assert.equal(runs.rows[0].count, 0);
  const activities = await pool.query(
    "select count(*)::int as count from public.activity_events where origin_ref = $1",
    [manifest.snapshot.id]
  );
  assert.equal(activities.rows[0].count, 0);
}

async function assertSuccessfulImport(pool, manifest, result) {
  const ids = manifestIds(manifest);
  assert.equal(await countById(pool, "organizations", ids.organizationId), 1);
  assert.equal(await countById(pool, "contacts", ids.contactId), 1);
  assert.equal(await countById(pool, "hospitations", ids.hospitationId), 1);
  assert.equal(await countById(pool, "hospitation_observations", ids.observationId), 1);

  const contact = await pool.query(
    "select owner_id, organization_id from public.contacts where id = $1",
    [ids.contactId]
  );
  assert.deepEqual(contact.rows[0], { owner_id: ownerProfileId, organization_id: ids.organizationId });
  const ownerRelation = await pool.query(
    "select assigned_by from public.contact_owners where contact_id = $1 and profile_id = $2",
    [ids.contactId, ownerProfileId]
  );
  assert.equal(ownerRelation.rowCount, 1, "Die additive Kontakt-Owner-Relation fehlt.");
  assert.equal(ownerRelation.rows[0].assigned_by, ownerProfileId);

  const hospitation = await pool.query(
    "select owner_id, requester_profile_id, documented_by from public.hospitations where id = $1",
    [ids.hospitationId]
  );
  assert.deepEqual(hospitation.rows[0], {
    owner_id: ownerProfileId,
    requester_profile_id: ownerProfileId,
    documented_by: ownerProfileId
  });

  const run = await pool.query(
    "select id, status, total_rows, valid_rows, imported_contacts, report, created_by from public.import_runs where id = $1",
    [result.importRunId]
  );
  assert.equal(run.rowCount, 1);
  assert.equal(run.rows[0].status, "completed");
  assert.equal(run.rows[0].total_rows, 4);
  assert.equal(run.rows[0].valid_rows, 4);
  assert.equal(run.rows[0].imported_contacts, 1);
  assert.equal(run.rows[0].created_by, ownerProfileId);
  assert.equal(run.rows[0].report.snapshotId, manifest.snapshot.id);
  assert.equal(run.rows[0].report.manifestFingerprint, result.manifestFingerprint);
  assert.equal(run.rows[0].report.imageImport, "excluded");

  const activity = await pool.query(
    `select event_key, entity_type, entity_id, actor_id, origin_type, origin_ref
       from public.activity_events
      where entity_id = $1 and origin_ref = $2`,
    [result.importRunId, manifest.snapshot.id]
  );
  assert.deepEqual(activity.rows, [{
    event_key: "hospitation.updated",
    entity_type: "hospitation_import",
    entity_id: result.importRunId,
    actor_id: ownerProfileId,
    origin_type: "data_import",
    origin_ref: manifest.snapshot.id
  }]);

  const observationChange = await pool.query(
    `select action, changed_by
       from public.hospitation_observation_changes
      where observation_id = $1
      order by id`,
    [ids.observationId]
  );
  assert.deepEqual(observationChange.rows, [{ action: "create", changed_by: ownerProfileId }]);
}

async function seedArchivedOwnerPreservationTarget(pool, manifest) {
  const ids = manifestIds(manifest);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into public.organizations
         (id, name, normalized_name, sector, city, source, status, created_by, updated_by)
       values ($1, $2, $3, 'Praxis', 'Teststadt', 'synthetic-http-postgres-e2e', 'archived', $4, $4)`,
      [ids.organizationId, manifest.organizations[0].name, manifest.organizations[0].name.toLocaleLowerCase("de-DE"), existingOwnerProfileId]
    );
    await client.query(
      `insert into public.contacts
         (id, name, organization_id, organization, sector, city, topics, source, status,
          owner_id, created_by, updated_by)
       values ($1, $2, $3, $4, 'Praxis', 'Teststadt', $5, 'synthetic-http-postgres-e2e',
               'archived', $6, $6, $6)`,
      [
        ids.contactId,
        manifest.contacts[0].name,
        ids.organizationId,
        manifest.organizations[0].name,
        manifest.contacts[0].topics,
        existingOwnerProfileId
      ]
    );
    await client.query(
      `insert into public.contact_owners (contact_id, profile_id, assigned_by)
       values ($1, $2, $2)`,
      [ids.contactId, existingOwnerProfileId]
    );
    await client.query(
      `insert into public.hospitations
         (id, contact_id, contact_name, organization_id, organization_name, status, starts_at, ends_at,
          city, sector, owner_id, requester_profile_id, documented_by, created_by, updated_by)
       values ($1, $2, $3, $4, $5, 'Archiviert', $6, $7, 'Teststadt', 'Praxis', $8, $8, $8, $8, $8)`,
      [
        ids.hospitationId,
        ids.contactId,
        manifest.contacts[0].name,
        ids.organizationId,
        manifest.organizations[0].name,
        manifest.hospitations[0].startsAt,
        manifest.hospitations[0].endsAt,
        existingOwnerProfileId
      ]
    );
    await client.query(
      `insert into public.hospitation_observations
         (id, hospitation_id, sequence, title, description, evidence_type, payload, status,
          archived_at, archived_by, created_by, updated_by)
       values ($1, $2, 1, $3, 'Bereits produktiv archivierter synthetischer Inhalt.',
               'reported', '{"existingOnly":true}'::jsonb, 'archived', now(), $4, $4, $4)`,
      [ids.observationId, ids.hospitationId, manifest.observations[0].title, existingOwnerProfileId]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function assertArchivedOwnerPreservation(pool, manifest) {
  const ids = manifestIds(manifest);
  const organization = await pool.query("select status from public.organizations where id = $1", [ids.organizationId]);
  assert.equal(organization.rows[0].status, "archived", "Ein aktiver Staging-Status darf eine Organisation nicht reaktivieren.");

  const contact = await pool.query("select status, owner_id from public.contacts where id = $1", [ids.contactId]);
  assert.deepEqual(contact.rows[0], { status: "archived", owner_id: existingOwnerProfileId },
    "Status und bestehender primärer Kontakt-Owner müssen erhalten bleiben.");
  const ownerRelations = await pool.query(
    "select profile_id from public.contact_owners where contact_id = $1 order by profile_id",
    [ids.contactId]
  );
  assert.deepEqual(ownerRelations.rows.map((row) => row.profile_id), [existingOwnerProfileId, ownerProfileId].sort(),
    "Der Import-Owner muss additiv ergänzt werden, ohne die bestehende Relation zu entfernen.");

  const hospitation = await pool.query(
    `select status, owner_id, requester_profile_id, documented_by
       from public.hospitations where id = $1`,
    [ids.hospitationId]
  );
  assert.deepEqual(hospitation.rows[0], {
    status: "Archiviert",
    owner_id: existingOwnerProfileId,
    requester_profile_id: existingOwnerProfileId,
    documented_by: existingOwnerProfileId
  }, "Eine archivierte Hospitation und ihre bestehenden Verantwortlichkeiten müssen erhalten bleiben.");

  const observation = await pool.query(
    `select status, archived_at is not null as has_archived_at, archived_by
       from public.hospitation_observations where id = $1`,
    [ids.observationId]
  );
  assert.deepEqual(observation.rows[0], {
    status: "archived",
    has_archived_at: true,
    archived_by: existingOwnerProfileId
  }, "Eine produktiv archivierte Beobachtung darf nicht reaktiviert werden.");
  const observationChanges = await pool.query(
    `select action
       from public.hospitation_observation_changes
      where observation_id = $1
      order by id`,
    [ids.observationId]
  );
  assert.ok(observationChanges.rows.some((row) => row.action === "update"));
  assert.ok(observationChanges.rows.every((row) => row.action !== "restore"),
    "Der Observation-Trigger darf für den ergänzenden Import keinen Restore protokollieren.");
}

if (!dockerIsAvailable()) {
  const message = "Docker ist nicht verfügbar: isolierter Hospitationsimport-E2E-Test wurde übersprungen.";
  if (requireDocker) throw new Error(`${message} Der Produktivfreigabe-Befehl arbeitet absichtlich fail-closed.`);
  console.log(`${message} Für die explizite Freigabe test:hospitation-import-e2e:release verwenden.`);
  process.exit(0);
}

const randomSuffix = crypto.randomBytes(6).toString("hex");
const containerName = `vk-hosp-import-e2e-${process.pid}-${randomSuffix}`;
const databaseUser = "vk_import_e2e";
const databaseName = "versorgungs_kompass";
const databasePassword = `synthetic-${crypto.randomBytes(18).toString("hex")}`;
const runtimePassword = `synthetic-runtime-${crypto.randomBytes(18).toString("hex")}`;
let pool;
let apiChild;
let apiLogs = "";

try {
  runDocker([
    "run", "--rm", "-d", "--name", containerName,
    "--label", "versorgungs-kompass.test=hospitation-import-e2e",
    "-e", `POSTGRES_USER=${databaseUser}`,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-e", `POSTGRES_DB=${databaseName}`,
    "-p", "127.0.0.1::5432",
    dockerImage,
    "postgres", "-c", "log_statement=all", "-c", "log_min_error_statement=error"
  ]);
  const portOutput = runDocker(["port", containerName, "5432/tcp"]);
  const portMatch = /127\.0\.0\.1:(\d+)\s*$/mu.exec(portOutput);
  assert.ok(portMatch, `Der lokale PostgreSQL-Port konnte nicht bestimmt werden: ${portOutput}`);
  const databaseUrl = `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${portMatch[1]}/${databaseName}`;

  pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 1000 });
  await waitForPostgres(pool);
  const version = await pool.query("show server_version_num");
  assert.match(String(version.rows[0].server_version_num), /^16\d{4}$/u, "Der E2E-Test erfordert PostgreSQL 16.");
  await pool.query(schemaSql);
  await pool.query(
    `insert into public.profiles (id, email, display_name, initials, role, active, team, bio)
     values
       ($1, 'import-owner@synthetic.example.invalid', 'Synthetischer Import-Owner', 'SI', 'admin', true,
        'Synthetische Qualitätssicherung', 'Ausschließlich für den isolierten Hospitationsimport-E2E-Test.'),
       ($2, 'existing-owner@synthetic.example.invalid', 'Synthetischer bestehender Owner', 'SO', 'editor', true,
        'Synthetische Qualitätssicherung', 'Bestehende Zuordnung für den isolierten Hospitationsimport-E2E-Test.')`,
    [ownerProfileId, existingOwnerProfileId]
  );
  runDocker([
    "exec", "-i", containerName,
    "psql", "-v", "ON_ERROR_STOP=1",
    "-U", databaseUser, "-d", databaseName
  ], { input: runtimeRoleSql });
  runDocker([
    "exec", "-i", containerName,
    "psql", "-v", "ON_ERROR_STOP=1", "-v", `runtime_role=${runtimeRoleName}`,
    "-U", databaseUser, "-d", databaseName
  ], { input: grantsSql });
  await pool.query(
    `create role ${runtimeUser}
       login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
       in role ${runtimeRoleName}
       password '${runtimePassword}'`
  );
  const runtimeDatabaseUrl = `postgresql://${runtimeUser}:${encodeURIComponent(runtimePassword)}@127.0.0.1:${portMatch[1]}/${databaseName}`;
  const runtimeProbe = new Pool({ connectionString: runtimeDatabaseUrl, max: 1, connectionTimeoutMillis: 1000 });
  try {
    const identity = await runtimeProbe.query(
      `select session_user,
              current_user,
              pg_has_role(current_user, $1, 'member') as runtime_member,
              has_schema_privilege(current_user, 'public', 'create') as can_create_in_public,
              has_table_privilege(current_user, 'public.import_runs', 'select,insert,update,delete') as import_run_access,
              has_table_privilege(current_user, 'public.activity_events', 'select,insert,update,delete') as activity_access,
              (select rolsuper from pg_catalog.pg_roles where rolname = current_user) as is_superuser`,
      [runtimeRoleName]
    );
    assert.deepEqual(identity.rows[0], {
      session_user: runtimeUser,
      current_user: runtimeUser,
      runtime_member: true,
      can_create_in_public: false,
      import_run_access: true,
      activity_access: true,
      is_superuser: false
    }, "Die Test-API muss über die echte Least-Privilege-Laufzeitrolle statt über den Datenbank-Owner laufen.");
    await assert.rejects(
      runtimeProbe.query("create table public.synthetic_runtime_must_not_create_objects (id integer)"),
      /permission denied/iu,
      "Die Laufzeitidentität darf keine Objekte im public-Schema anlegen."
    );
  } finally {
    await runtimeProbe.end();
  }

  const apiPort = await unusedLocalPort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const apiEnvironment = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    LANG: process.env.LANG || "C.UTF-8",
    TZ: "UTC",
    NODE_ENV: "test",
    PORT: String(apiPort),
    DATABASE_URL: runtimeDatabaseUrl,
    DB_SSL_MODE: "disable",
    PGSSLMODE: "disable",
    DB_POOL_MAX: "3",
    API_AUTH_MODE: "trusted-header",
    API_AUTH_ALLOW_DEV_PROFILE: "1",
    API_AUTH_ALLOW_BEARER_DEV: "0",
    API_DEV_PROFILE_ID: ownerProfileId,
    HOSPITATION_IMPORT_OWNER_PROFILE_ID: ownerProfileId,
    ALLOWED_ORIGIN: "",
    IMAGE_UPLOAD_MODE: "disabled",
    ATTACHMENT_UPLOAD_MODE: "disabled",
    API_LOG_REQUESTS: "0"
  };
  apiChild = spawn(process.execPath, ["api/server.mjs"], {
    cwd: projectRoot,
    env: apiEnvironment,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const appendLog = (chunk) => {
    apiLogs = `${apiLogs}${chunk}`.slice(-64 * 1024);
  };
  apiChild.stdout.on("data", appendLog);
  apiChild.stderr.on("data", appendLog);
  await waitForApi(baseUrl, apiChild, () => apiLogs);

  const primaryManifest = syntheticManifest(
    "primary",
    "synthetic-hospitation-import-e2e-primary-v1",
    "2026-08-03T08:00:00.000Z"
  );
  const stateBeforePreview = await databaseState(pool);
  const initialPreview = await preview(baseUrl, primaryManifest);
  assert.equal(initialPreview.status, 200, JSON.stringify(initialPreview.payload));
  assert.equal(initialPreview.payload.canApply, true);
  assert.equal(initialPreview.payload.summary.total.create, 4);
  assert.equal(initialPreview.payload.summary.total.update, 0);
  assert.equal(initialPreview.payload.summary.total.conflict, 0);
  assert.equal(initialPreview.payload.owner.id, ownerProfileId);
  assert.deepEqual(await databaseState(pool), stateBeforePreview, "Die Vorschau darf keinerlei Datenbankzustand verändern.");

  await pool.query(
    `insert into public.organizations
       (id, name, normalized_name, sector, city, source, status, created_by, updated_by)
     values
       ('synthetic-import-concurrent-change', 'Synthetische parallele Änderung',
        'synthetische parallele änderung', 'Praxis', 'Teststadt',
        'synthetic-http-postgres-e2e', 'active', $1, $1)`,
    [ownerProfileId]
  );
  const stateBeforeStaleApply = await databaseState(pool);
  const staleApply = await apply(baseUrl, primaryManifest, initialPreview.payload);
  assert.equal(staleApply.status, 409, JSON.stringify(staleApply.payload));
  assert.match(String(staleApply.payload.error || ""), /Produktionsbestand.*Vorschau/iu);
  assert.deepEqual(await databaseState(pool), stateBeforeStaleApply, "Ein veralteter Fingerprint darf keine Teilschreibvorgänge erzeugen.");
  await assertManifestRowsAbsent(pool, primaryManifest);

  const stateBeforeFreshPreview = await databaseState(pool);
  const freshPreview = await preview(baseUrl, primaryManifest);
  assert.equal(freshPreview.status, 200, JSON.stringify(freshPreview.payload));
  assert.notEqual(freshPreview.payload.targetFingerprint, initialPreview.payload.targetFingerprint);
  assert.deepEqual(await databaseState(pool), stateBeforeFreshPreview, "Auch die erneute Vorschau muss schreibfrei bleiben.");

  const successfulApply = await apply(baseUrl, primaryManifest, freshPreview.payload);
  assert.equal(successfulApply.status, 200, JSON.stringify(successfulApply.payload));
  assert.equal(successfulApply.payload.ok, true);
  assert.equal(successfulApply.payload.alreadyCurrent, false);
  assert.equal(successfulApply.payload.summary.total.create, 4);
  await assertSuccessfulImport(pool, primaryManifest, successfulApply.payload);

  const stateBeforeSecondPreview = await databaseState(pool);
  const secondPreview = await preview(baseUrl, primaryManifest);
  assert.equal(secondPreview.status, 200, JSON.stringify(secondPreview.payload));
  assert.equal(secondPreview.payload.canApply, false);
  assert.equal(secondPreview.payload.summary.total.create, 0);
  assert.equal(secondPreview.payload.summary.total.update, 0);
  assert.equal(secondPreview.payload.summary.total.unchanged, 4);
  assert.equal(secondPreview.payload.targetFingerprint, successfulApply.payload.appliedFingerprint);
  assert.deepEqual(await databaseState(pool), stateBeforeSecondPreview, "Die idempotente zweite Vorschau muss schreibfrei bleiben.");

  const preservationManifest = syntheticManifest(
    "preservation",
    "synthetic-hospitation-import-e2e-preservation-v1",
    "2026-08-05T08:00:00.000Z"
  );
  await seedArchivedOwnerPreservationTarget(pool, preservationManifest);
  const preservationPreview = await preview(baseUrl, preservationManifest);
  assert.equal(preservationPreview.status, 200, JSON.stringify(preservationPreview.payload));
  assert.equal(preservationPreview.payload.canApply, true);
  assert.equal(preservationPreview.payload.summary.total.create, 0);
  assert.equal(preservationPreview.payload.summary.total.conflict, 0);
  assert.ok(preservationPreview.payload.summary.total.update >= 1);
  const preservationApply = await apply(baseUrl, preservationManifest, preservationPreview.payload);
  assert.equal(preservationApply.status, 200, JSON.stringify(preservationApply.payload));
  assert.equal(preservationApply.payload.ok, true);
  await assertArchivedOwnerPreservation(pool, preservationManifest);
  const preservationSecondPreview = await preview(baseUrl, preservationManifest);
  assert.equal(preservationSecondPreview.status, 200, JSON.stringify(preservationSecondPreview.payload));
  assert.equal(preservationSecondPreview.payload.summary.total.update, 0);
  assert.equal(preservationSecondPreview.payload.summary.total.unchanged, 4);

  const rollbackManifest = syntheticManifest(
    "rollback",
    "synthetic-hospitation-import-e2e-rollback-v1",
    "2026-08-04T08:00:00.000Z"
  );
  const rollbackPreview = await preview(baseUrl, rollbackManifest);
  assert.equal(rollbackPreview.status, 200, JSON.stringify(rollbackPreview.payload));
  assert.equal(rollbackPreview.payload.canApply, true);
  assert.equal(rollbackPreview.payload.summary.total.create, 4);

  await pool.query(`
    create function public.synthetic_hospitation_import_e2e_failure()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.origin_ref = 'synthetic-hospitation-import-e2e-rollback-v1' then
        raise exception 'synthetic_hospitation_import_e2e_forced_failure';
      end if;
      return new;
    end;
    $$;
    create trigger synthetic_hospitation_import_e2e_failure
    after insert on public.activity_events
    for each row execute function public.synthetic_hospitation_import_e2e_failure();
  `);
  const stateBeforeFailedApply = await databaseState(pool);
  try {
    const failedApply = await apply(baseUrl, rollbackManifest, rollbackPreview.payload);
    assert.equal(failedApply.status, 500, JSON.stringify(failedApply.payload));
    assert.equal(failedApply.payload.error, "API-Anfrage fehlgeschlagen.", "Interne Datenbankdetails dürfen nicht an den Client gelangen.");
    assert.deepEqual(await databaseState(pool), stateBeforeFailedApply, "Der erzwungene späte Datenbankfehler muss alle Import- und Audit-Schreibvorgänge zurückrollen.");
    await assertManifestRowsAbsent(pool, rollbackManifest);
  } finally {
    await pool.query("drop trigger if exists synthetic_hospitation_import_e2e_failure on public.activity_events");
    await pool.query("drop function if exists public.synthetic_hospitation_import_e2e_failure()");
  }

  console.log("Hospitationsimport E2E OK: echte HTTP/API/PostgreSQL-16-Kette mit Least-Privilege-Laufzeitrolle; Vorschau schreibfrei, stale Fingerprint ohne Teilschreiben, Apply mit Owner-/Audit-/Trigger-Nachweisen, Archiv- und Owner-Schutz, zweite Vorschau idempotent und erzwungener DB-Fehler vollständig zurückgerollt.");
} catch (error) {
  const databaseLogResult = spawnSync("docker", ["logs", "--tail", "160", containerName], {
    encoding: "utf8",
    timeout: 30_000
  });
  const databaseLogs = `${databaseLogResult.stdout || ""}${databaseLogResult.stderr || ""}`;
  throw new Error([
    error?.stack || error?.message || String(error),
    apiLogs ? `Letzte API-Ausgabe:\n${apiLogs}` : "",
    databaseLogs ? `Letzte PostgreSQL-Ausgabe:\n${databaseLogs}` : ""
  ].filter(Boolean).join("\n"), { cause: error });
} finally {
  const cleanupErrors = [];
  try {
    await stopChild(apiChild);
  } catch (error) {
    cleanupErrors.push(error.message);
  }
  if (pool) {
    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(`Admin-Pool konnte nicht geschlossen werden: ${error.message}`);
    }
  }
  const containerCleanup = spawnSync("docker", ["rm", "--force", containerName], {
    encoding: "utf8",
    timeout: 30_000
  });
  const containerCleanupOutput = `${containerCleanup.stdout || ""}${containerCleanup.stderr || ""}`;
  if (containerCleanup.status !== 0 && !/No such container/iu.test(containerCleanupOutput)) {
    cleanupErrors.push(`Wegwerfcontainer konnte nicht entfernt werden: ${containerCleanupOutput.trim() || containerCleanup.error?.message || "unbekannter Fehler"}`);
  }
  if (cleanupErrors.length) {
    console.error(`E2E-Cleanup fehlgeschlagen:\n${cleanupErrors.join("\n")}`);
    process.exitCode = 1;
  }
}
