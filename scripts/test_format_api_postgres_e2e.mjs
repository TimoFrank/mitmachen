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
const actorId = "synthetic-format-api-admin";
const runtimeRoleName = "vk_app_runtime";
const runtimeUser = "vk_format_api_e2e_app";
const dockerImage = "postgres:16-alpine";

function dockerIsAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function runDocker(args, { input } = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: "pipe",
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
  if (await Promise.race([exited, delay(5000).then(() => "timeout")]) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    if (await Promise.race([exited, delay(2000).then(() => "timeout")]) === "timeout") {
      throw new Error("Der lokale Test-API-Prozess konnte nicht beendet werden.");
    }
  }
}

async function requestJson(baseUrl, method, pathname, body, subject = actorId, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-auth-request-user": subject,
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${method} ${pathname} lieferte kein JSON (HTTP ${response.status}).`);
  }
  return { status: response.status, payload };
}

function expectError(result, status, code, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.payload)}`);
  assert.equal(result.payload?.code, code, `${label}: maschinenlesbarer Fehlercode fehlt.`);
}

async function seedDatabase(pool) {
  await pool.query(
    `insert into public.profiles (id, email, display_name, initials, role, active)
     values
       ($1, 'format-api-admin@synthetic.example.invalid', 'Synthetischer Format-Admin', 'FA', 'admin', true),
       ('synthetic-format-api-editor', 'format-api-editor@synthetic.example.invalid',
        'Synthetischer Format-Editor', 'FE', 'editor', true)`,
    [actorId]
  );
  await pool.query(
    `insert into public.organizations (id, name, normalized_name, status, created_by, updated_by)
     values ('synthetic-format-org', 'Synthetische Formatpraxis', 'synthetische formatpraxis', 'active', $1, $1)`,
    [actorId]
  );
  await pool.query(
    `insert into public.contacts (
       id, name, organization_id, organization, status, mitmachen_consent_status,
       mitmachen_consent_effective_at, mitmachen_consent_source,
       mitmachen_consent_text_version, mitmachen_consent_recorded_by,
       mitmachen_consent_note, created_by, updated_by
     ) values
       (
         'synthetic-format-contact-granted', 'Kontakt mit Einwilligung', 'synthetic-format-org',
         'Synthetische Formatpraxis', 'active', 'granted', now() - interval '1 day',
         'manual_transfer', 'format-e2e-v1', $1, 'Synthetischer Nachweis.', $1, $1
       ),
       (
         'synthetic-format-contact-open', 'Kontakt ohne Einwilligung', 'synthetic-format-org',
         'Synthetische Formatpraxis', 'active', 'not_requested', null, null, null, null, null, $1, $1
       ),
       (
         'synthetic-format-contact-import', 'Importkontakt mit Einwilligung', 'synthetic-format-org',
         'Synthetische Formatpraxis', 'active', 'granted', now() - interval '1 day',
         'manual_transfer', 'format-e2e-v1', $1, 'Synthetischer Nachweis.', $1, $1
       ),
       (
         'synthetic-format-contact-import-new', 'Neuer Importkontakt', 'synthetic-format-org',
         'Synthetische Formatpraxis', 'active', 'not_requested', null, null, null, null, null, $1, $1
       ),
       (
         'synthetic-format-contact-import-rollback', 'Rollback-Importkontakt', 'synthetic-format-org',
         'Synthetische Formatpraxis', 'active', 'not_requested', null, null, null, null, null, $1, $1
       )`,
    [actorId]
  );
}

async function exerciseFormatApi(baseUrl, pool) {
  const formatId = crypto.randomUUID();
  const createBody = {
    idempotencyKey: formatId,
    title: "Synthetischer Usability-Roundtable",
    formatType: "Roundtable",
    startsAt: "2026-08-05T08:30:00.000Z",
    endsAt: "2026-08-05T10:00:00.000Z",
    ownerId: actorId,
    status: "Planung"
  };

  expectError(
    await requestJson(baseUrl, "POST", "/api/formats", { title: "Ohne Schlüssel" }),
    428,
    "FORMAT_IDEMPOTENCY_KEY_REQUIRED",
    "Format ohne Idempotency-Key"
  );
  expectError(
    await requestJson(baseUrl, "POST", "/api/formats", {
      ...createBody,
      idempotencyKey: crypto.randomUUID(),
      status: "Unbekannt"
    }),
    400,
    "FORMAT_STATUS_INVALID",
    "Format mit ungültigem Status"
  );

  const parallelCreates = await Promise.all(
    Array.from({ length: 6 }, () => requestJson(baseUrl, "POST", "/api/formats", createBody))
  );
  parallelCreates.forEach((result, index) => {
    assert.equal(result.status, 201, `Parallele Formatanlage ${index + 1}: ${JSON.stringify(result.payload)}`);
    assert.equal(result.payload.id, formatId);
  });
  const created = parallelCreates[0];
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.id, formatId);
  assert.equal(created.payload.startsAt, createBody.startsAt);
  assert.equal(created.payload.endsAt, createBody.endsAt);

  const replay = await requestJson(baseUrl, "POST", "/api/formats", createBody);
  assert.equal(replay.status, 201, JSON.stringify(replay.payload));
  assert.equal(replay.payload.id, formatId);
  const persistedCreate = await pool.query(
    `select
       (select count(*)::int from formats where id = $1) as format_count,
       (select count(*)::int from activity_events where event_key = 'format.created' and entity_id = $1) as event_count`,
    [formatId]
  );
  assert.deepEqual(persistedCreate.rows[0], { format_count: 1, event_count: 1 },
    "Parallele idempotente POSTs und ein Replay dürfen weder Format noch Aktivität duplizieren.");

  expectError(
    await requestJson(baseUrl, "POST", "/api/formats", { ...createBody, title: "Andere Absicht" }),
    409,
    "FORMAT_IDEMPOTENCY_CONFLICT",
    "Idempotency-Key mit abweichender Absicht"
  );
  expectError(
    await requestJson(baseUrl, "PATCH", `/api/formats/${formatId}`, { title: "Ohne Version" }),
    428,
    "FORMAT_PRECONDITION_REQUIRED",
    "Format-PATCH ohne Versionsstand"
  );

  const beforePatchVersion = created.payload.updatedAt;
  const patched = await requestJson(baseUrl, "PATCH", `/api/formats/${formatId}`, {
    title: "Synthetischer Usability-Roundtable – final",
    expectedUpdatedAt: beforePatchVersion
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.payload));
  assert.equal(patched.payload.endsAt, createBody.endsAt,
    "Ein Teil-PATCH darf die unveränderte Endezeit nicht überschreiben.");
  expectError(
    await requestJson(baseUrl, "PATCH", `/api/formats/${formatId}`, {
      location: "Berlin",
      expectedUpdatedAt: beforePatchVersion
    }),
    409,
    "FORMAT_VERSION_CONFLICT",
    "Format-PATCH mit veraltetem Versionsstand"
  );

  const atomicFailure = await requestJson(
    baseUrl,
    "POST",
    `/api/formats/${formatId}/participants/batch`,
    {
      items: [
        { contactId: "synthetic-format-contact-granted", invitationStatus: "Kandidat" },
        { contactId: "synthetic-format-contact-missing", invitationStatus: "Kandidat" }
      ]
    }
  );
  expectError(
    atomicFailure,
    409,
    "FORMAT_PARTICIPANT_CONTACT_UNAVAILABLE",
    "atomarer Batch mit unbekanntem Kontakt"
  );
  const afterAtomicFailure = await pool.query(
    "select count(*)::int as count from format_participants where format_id = $1",
    [formatId]
  );
  assert.equal(afterAtomicFailure.rows[0].count, 0, "Ein fehlerhafter Batch darf keine Teilmenge schreiben.");

  const batch = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/participants/batch`, {
    items: [
      { contactId: "synthetic-format-contact-granted", invitationStatus: "Kandidat" },
      { contactId: "synthetic-format-contact-open", invitationStatus: "Kandidat" }
    ]
  });
  assert.equal(batch.status, 200, JSON.stringify(batch.payload));
  assert.equal(batch.payload.participants.length, 2);
  const versionAfterBatch = batch.payload.updatedAt;

  const duplicateBatch = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/participants/batch`, {
    items: [
      { contactId: "synthetic-format-contact-granted", invitationStatus: "Kandidat" },
      { contactId: "synthetic-format-contact-open", invitationStatus: "Kandidat" }
    ]
  });
  assert.equal(duplicateBatch.status, 200, JSON.stringify(duplicateBatch.payload));
  assert.equal(duplicateBatch.payload.updatedAt, versionAfterBatch,
    "Ein reiner Dubletten-Batch darf Formatversion und Benachrichtigungen nicht vortäuschen.");

  const openParticipant = batch.payload.participants.find(
    (participant) => participant.contactId === "synthetic-format-contact-open"
  );
  for (const invitationStatus of ["Eingeladen", "Zugesagt", "Teilgenommen"]) {
    const consentFailure = await requestJson(
      baseUrl,
      "PATCH",
      `/api/formats/${formatId}/participants/synthetic-format-contact-open`,
      { invitationStatus, expectedUpdatedAt: openParticipant.updatedAt }
    );
    expectError(
      consentFailure,
      409,
      "FORMAT_INVITATION_CONSENT_REQUIRED",
      `${invitationStatus} ohne Einwilligung`
    );
    assert.deepEqual(
      consentFailure.payload.blockedContactIds,
      ["synthetic-format-contact-open"],
      `${invitationStatus}: blockedContactIds müssen erhalten bleiben.`
    );
    assert.deepEqual(
      consentFailure.payload.details?.blockedContactIds,
      ["synthetic-format-contact-open"],
      `${invitationStatus}: details.blockedContactIds müssen erhalten bleiben.`
    );
  }

  const grantedParticipant = batch.payload.participants.find(
    (participant) => participant.contactId === "synthetic-format-contact-granted"
  );
  const invited = await requestJson(
    baseUrl,
    "PATCH",
    `/api/formats/${formatId}/participants/synthetic-format-contact-granted`,
    { invitationStatus: "Eingeladen", expectedUpdatedAt: grantedParticipant.updatedAt }
  );
  assert.equal(invited.status, 200, JSON.stringify(invited.payload));
  const invitationEvent = await pool.query(
    `select count(*)::int as count
       from activity_events
      where event_key = 'format.invitation.created'
        and contact_id = 'synthetic-format-contact-granted'`,
    []
  );
  assert.equal(invitationEvent.rows[0].count, 1);

  const imported = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/participants/import`, {
    items: [{ contactId: "synthetic-format-contact-import", invitationStatus: "Kandidat" }]
  });
  assert.equal(imported.status, 200, JSON.stringify(imported.payload));
  const importActor = await pool.query(
    `select created_by, updated_by
       from format_participants
      where format_id = $1 and contact_id = 'synthetic-format-contact-import'`,
    [formatId]
  );
  assert.deepEqual(importActor.rows[0], { created_by: actorId, updated_by: actorId },
    "Ein Import muss die anlegende und ändernde Person persistieren.");
  const importedParticipantBeforeUpdate = imported.payload.participants.find(
    (participant) => participant.contactId === "synthetic-format-contact-import"
  );
  const activityBeforeNoopImport = await pool.query(
    `select count(*)::int as count
       from activity_events
      where event_key = 'format.updated' and entity_id = $1`,
    [formatId]
  );
  const noopImport = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/participants/import`, {
    items: [{ contactId: "synthetic-format-contact-import", invitationStatus: "Kandidat" }]
  });
  assert.equal(noopImport.status, 200, JSON.stringify(noopImport.payload));
  assert.equal(
    noopImport.payload.updatedAt,
    imported.payload.updatedAt,
    "Eine identische Import-Dublette darf die Formatversion nicht verändern."
  );
  const activityAfterNoopImport = await pool.query(
    `select count(*)::int as count
       from activity_events
      where event_key = 'format.updated' and entity_id = $1`,
    [formatId]
  );
  assert.equal(
    activityAfterNoopImport.rows[0].count,
    activityBeforeNoopImport.rows[0].count,
    "Eine identische Import-Dublette darf kein generisches Formatereignis schreiben."
  );

  const importWithoutVersion = await requestJson(
    baseUrl,
    "POST",
    `/api/formats/${formatId}/participants/import`,
    {
      items: [
        {
          contactId: "synthetic-format-contact-import",
          invitationStatus: "Kandidat",
          notes: "Excel-Änderung ohne Version"
        },
        {
          contactId: "synthetic-format-contact-import-rollback",
          invitationStatus: "Kandidat"
        }
      ]
    }
  );
  expectError(
    importWithoutVersion,
    428,
    "FORMAT_PARTICIPANT_IMPORT_PRECONDITION_REQUIRED",
    "Import-Update ohne Versionsstand"
  );
  assert.deepEqual(
    importWithoutVersion.payload.details?.blockedContactIds,
    ["synthetic-format-contact-import"]
  );
  let rolledBackImport = await pool.query(
    `select count(*)::int as count
       from format_participants
      where format_id = $1 and contact_id = 'synthetic-format-contact-import-rollback'`,
    [formatId]
  );
  assert.equal(rolledBackImport.rows[0].count, 0,
    "Eine neue Importzeile muss bei fehlender Update-Version atomar zurückgerollt werden.");

  const importWithStaleVersion = await requestJson(
    baseUrl,
    "POST",
    `/api/formats/${formatId}/participants/import`,
    {
      items: [
        {
          contactId: "synthetic-format-contact-import",
          invitationStatus: "Kandidat",
          notes: "Excel-Änderung mit veralteter Version",
          expectedUpdatedAt: "2000-01-01T00:00:00.000Z"
        },
        {
          contactId: "synthetic-format-contact-import-rollback",
          invitationStatus: "Kandidat"
        }
      ]
    }
  );
  expectError(
    importWithStaleVersion,
    409,
    "FORMAT_PARTICIPANT_IMPORT_VERSION_CONFLICT",
    "Import-Update mit veraltetem Versionsstand"
  );
  assert.deepEqual(
    importWithStaleVersion.payload.blockedContactIds,
    ["synthetic-format-contact-import"]
  );
  rolledBackImport = await pool.query(
    `select count(*)::int as count
       from format_participants
      where format_id = $1 and contact_id = 'synthetic-format-contact-import-rollback'`,
    [formatId]
  );
  assert.equal(rolledBackImport.rows[0].count, 0,
    "Eine neue Importzeile muss bei einem Versionskonflikt atomar zurückgerollt werden.");

  const versionedImport = await requestJson(
    baseUrl,
    "POST",
    `/api/formats/${formatId}/participants/import`,
    {
      items: [
        {
          contactId: "synthetic-format-contact-import",
          invitationStatus: "Kandidat",
          notes: "Excel-Änderung mit Version",
          expectedUpdatedAt: importedParticipantBeforeUpdate.updatedAt
        },
        {
          contactId: "synthetic-format-contact-import-new",
          invitationStatus: "Kandidat"
        }
      ]
    }
  );
  assert.equal(versionedImport.status, 200, JSON.stringify(versionedImport.payload));
  assert.equal(
    versionedImport.payload.participants.find(
      (participant) => participant.contactId === "synthetic-format-contact-import"
    )?.notes,
    "Excel-Änderung mit Version"
  );
  assert.equal(
    versionedImport.payload.participants.some(
      (participant) => participant.contactId === "synthetic-format-contact-import-new"
    ),
    true,
    "Neue Importzeilen dürfen ohne expectedUpdatedAt angelegt werden."
  );

  const editorArchive = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/archive`, {
    expectedUpdatedAt: versionedImport.payload.updatedAt
  }, "synthetic-format-api-editor");
  assert.equal(editorArchive.status, 403, "Editor dürfen Formate nicht archivieren.");
  const archived = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/archive`, {
    expectedUpdatedAt: versionedImport.payload.updatedAt
  });
  assert.equal(archived.status, 200, JSON.stringify(archived.payload));
  assert.equal(archived.payload.status, "Archiviert");
  expectError(
    await requestJson(baseUrl, "PATCH", `/api/formats/${formatId}`, {
      status: "Planung",
      expectedUpdatedAt: archived.payload.updatedAt
    }),
    409,
    "FORMAT_RESTORE_ACTION_REQUIRED",
    "implizite Wiederherstellung"
  );
  expectError(
    await requestJson(baseUrl, "POST", `/api/formats/${formatId}/participants/batch`, {
      items: [{ contactId: "synthetic-format-contact-granted", invitationStatus: "Kandidat" }]
    }),
    409,
    "FORMAT_RESTORE_ACTION_REQUIRED",
    "Teilnehmeränderung an archiviertem Format"
  );
  const restored = await requestJson(baseUrl, "POST", `/api/formats/${formatId}/restore`, {
    expectedUpdatedAt: archived.payload.updatedAt
  });
  assert.equal(restored.status, 200, JSON.stringify(restored.payload));
  assert.equal(restored.payload.status, "Planung");

  const importedParticipant = restored.payload.participants.find(
    (participant) => participant.contactId === "synthetic-format-contact-import"
  );
  const changedImportedParticipant = await requestJson(
    baseUrl,
    "PATCH",
    `/api/formats/${formatId}/participants/synthetic-format-contact-import`,
    { notes: "Parallelitätsschutz", expectedUpdatedAt: importedParticipant.updatedAt }
  );
  assert.equal(changedImportedParticipant.status, 200, JSON.stringify(changedImportedParticipant.payload));
  const latestImportedParticipant = changedImportedParticipant.payload.participants.find(
    (participant) => participant.contactId === "synthetic-format-contact-import"
  );
  expectError(
    await requestJson(
      baseUrl,
      "DELETE",
      `/api/formats/${formatId}/participants/synthetic-format-contact-import`,
      { expectedUpdatedAt: importedParticipant.updatedAt }
    ),
    409,
    "FORMAT_PARTICIPANT_VERSION_CONFLICT",
    "Teilnehmer-DELETE mit veraltetem Versionsstand"
  );
  const removed = await requestJson(
    baseUrl,
    "DELETE",
    `/api/formats/${formatId}/participants/synthetic-format-contact-import`,
    { expectedUpdatedAt: latestImportedParticipant.updatedAt }
  );
  assert.equal(removed.status, 200, JSON.stringify(removed.payload));
  assert.equal(
    removed.payload.participants.some((participant) => participant.contactId === "synthetic-format-contact-import"),
    false,
    "Race-sicher gelöschte Teilnehmer dürfen nicht in der Antwort verbleiben."
  );

  const editorDelete = await requestJson(
    baseUrl,
    "DELETE",
    `/api/formats/${formatId}`,
    undefined,
    "synthetic-format-api-editor"
  );
  assert.equal(editorDelete.status, 403, "Editor dürfen Formate nicht löschen.");

  const deleteFormatId = crypto.randomUUID();
  const deleteCandidate = await requestJson(baseUrl, "POST", "/api/formats", {
    idempotencyKey: deleteFormatId,
    title: "Synthetischer Löschkandidat",
    status: "Planung"
  });
  assert.equal(deleteCandidate.status, 201, JSON.stringify(deleteCandidate.payload));
  expectError(
    await requestJson(baseUrl, "DELETE", `/api/formats/${deleteFormatId}`, {}),
    428,
    "FORMAT_PRECONDITION_REQUIRED",
    "Format-DELETE ohne Versionsstand"
  );
  const advancedDeleteCandidate = await requestJson(
    baseUrl,
    "PATCH",
    `/api/formats/${deleteFormatId}`,
    {
      notes: "Neue Version vor Löschung",
      expectedUpdatedAt: deleteCandidate.payload.updatedAt
    }
  );
  assert.equal(advancedDeleteCandidate.status, 200, JSON.stringify(advancedDeleteCandidate.payload));
  expectError(
    await requestJson(baseUrl, "DELETE", `/api/formats/${deleteFormatId}`, {
      expectedUpdatedAt: deleteCandidate.payload.updatedAt
    }),
    409,
    "FORMAT_VERSION_CONFLICT",
    "Format-DELETE mit veraltetem Versionsstand"
  );
  const deleted = await requestJson(
    baseUrl,
    "DELETE",
    `/api/formats/${deleteFormatId}`,
    undefined,
    actorId,
    { "if-match": `"${advancedDeleteCandidate.payload.updatedAt}"` }
  );
  assert.equal(deleted.status, 200, JSON.stringify(deleted.payload));
  const deletedFormatCount = await pool.query(
    "select count(*)::int as count from formats where id = $1",
    [deleteFormatId]
  );
  assert.equal(deletedFormatCount.rows[0].count, 0, "Die versioniert gelöschte Zeile muss entfernt sein.");
}

if (!dockerIsAvailable()) {
  const message = "Docker ist nicht verfügbar: isolierter Format-API-E2E-Test wurde übersprungen.";
  if (requireDocker) throw new Error(`${message} Der Release-Test arbeitet absichtlich fail-closed.`);
  console.log(`${message} Für die explizite Freigabe test:format-api-e2e:release verwenden.`);
  process.exit(0);
}

const suffix = crypto.randomBytes(6).toString("hex");
const containerName = `vk-format-api-e2e-${process.pid}-${suffix}`;
const databaseUser = "vk_format_api_e2e";
const databaseName = "versorgungs_kompass";
const databasePassword = `synthetic-${crypto.randomBytes(18).toString("hex")}`;
const runtimePassword = `synthetic-runtime-${crypto.randomBytes(18).toString("hex")}`;
let pool;
let apiChild;
let apiLogs = "";

try {
  runDocker([
    "run", "--rm", "-d", "--name", containerName,
    "--label", "versorgungs-kompass.test=format-api-e2e",
    "-e", `POSTGRES_USER=${databaseUser}`,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-e", `POSTGRES_DB=${databaseName}`,
    "-p", "127.0.0.1::5432",
    dockerImage
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
  await seedDatabase(pool);

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

  const apiPort = await unusedLocalPort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  apiChild = spawn(process.execPath, ["api/server.mjs"], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      LANG: process.env.LANG || "C.UTF-8",
      TZ: "UTC",
      NODE_ENV: "test",
      PORT: String(apiPort),
      DATABASE_URL: runtimeDatabaseUrl,
      DB_SSL_MODE: "disable",
      PGSSLMODE: "disable",
      DB_POOL_MAX: "8",
      API_AUTH_MODE: "trusted-header",
      API_AUTH_ALLOW_DEV_PROFILE: "0",
      API_AUTH_ALLOW_BEARER_DEV: "0",
      ALLOWED_ORIGIN: "",
      IMAGE_UPLOAD_MODE: "disabled",
      ATTACHMENT_UPLOAD_MODE: "disabled",
      API_LOG_REQUESTS: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const appendLog = (chunk) => {
    apiLogs = `${apiLogs}${chunk}`.slice(-64 * 1024);
  };
  apiChild.stdout.on("data", appendLog);
  apiChild.stderr.on("data", appendLog);
  await waitForApi(baseUrl, apiChild, () => apiLogs);
  await exerciseFormatApi(baseUrl, pool);

  console.log("Format API PostgreSQL E2E OK: parallele Idempotenz, strikte Validierung, Format-/Teilnehmer-Versionen, atomarer Batch/Import, Consent, No-op-Dubletten und explizites Archiv/Restore sind über die echte HTTP-/PostgreSQL-16-Kette abgesichert.");
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
  const removal = spawnSync("docker", ["rm", "-f", containerName], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30_000
  });
  if (![0, 1].includes(removal.status)) {
    cleanupErrors.push(`Docker-Container konnte nicht entfernt werden: ${removal.stderr || removal.stdout}`);
  }
  if (cleanupErrors.length) throw new Error(cleanupErrors.join("\n"));
}
