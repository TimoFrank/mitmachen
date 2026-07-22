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
const ownerProfileId = "synthetic-global-duplicate-owner";
const runtimeRoleName = "vk_app_runtime";
const runtimeUser = "vk_duplicate_guard_e2e_app";
const dockerImage = "postgres:16-alpine";

const organizationIds = Object.freeze({
  alpha: "synthetic-duplicate-org-alpha",
  beta: "synthetic-duplicate-org-beta",
  gamma: "synthetic-duplicate-org-gamma"
});

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
  if (await Promise.race([exited, delay(5000).then(() => "timeout")]) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    if (await Promise.race([exited, delay(2000).then(() => "timeout")]) === "timeout") {
      throw new Error("Der lokale Test-API-Prozess konnte nicht beendet werden.");
    }
  }
}

async function requestJson(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-auth-request-user": ownerProfileId
    },
    body: JSON.stringify(body),
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

function postJson(baseUrl, pathname, body) {
  return requestJson(baseUrl, "POST", pathname, body);
}

function patchJson(baseUrl, pathname, body) {
  return requestJson(baseUrl, "PATCH", pathname, body);
}

function assertCreated(result, label) {
  assert.equal(result.status, 201, `${label}: ${JSON.stringify(result.payload)}`);
  assert.ok(result.payload?.id, `${label}: Die Antwort muss die erzeugte ID enthalten.`);
  return result.payload;
}

function assertDuplicateConflict(result, { code, duplicateId, label }) {
  assert.equal(result.status, 409, `${label}: ${JSON.stringify(result.payload)}`);
  assert.equal(result.payload?.code, code, `${label}: maschinenlesbarer Konfliktcode fehlt.`);
  if (duplicateId) {
    assert.equal(result.payload?.duplicateId, duplicateId, `${label}: kanonische Dubletten-ID fehlt.`);
  } else {
    assert.equal(result.payload?.duplicateId, undefined, `${label}: eine nicht sichtbare archivierte ID darf nicht offengelegt werden.`);
  }
  assert.equal(typeof result.payload?.error, "string", `${label}: verständlicher Fehlertext fehlt.`);
  assert.ok(result.payload.error.trim(), `${label}: verständlicher Fehlertext darf nicht leer sein.`);
}

function contactPayload({ name, organizationId, organization, city, status = "active" }) {
  return {
    name,
    organizationId,
    organization,
    category: "Praxis",
    city,
    ownerId: ownerProfileId,
    source: "synthetic-global-duplicate-e2e",
    status
  };
}

function hospitationPayload({ id, contact, startsAt, status = "Gebucht" }) {
  return {
    id,
    contactId: contact.id,
    contactName: contact.name,
    organizationId: contact.organizationId,
    organizationName: contact.organization,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
    city: contact.city,
    sector: "Praxis",
    status
  };
}

function organizationOnlyHospitationPayload({ id, organizationId, organizationName, city, startsAt, status = "Gebucht" }) {
  return {
    id,
    organizationId,
    organizationName,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
    city,
    sector: "Praxis",
    status
  };
}

async function countContacts(pool, { name, organizationId, city }) {
  const result = await pool.query(
    `select count(*)::int as count
       from public.contacts
      where name = $1 and organization_id = $2 and city = $3`,
    [name, organizationId, city]
  );
  return result.rows[0].count;
}

async function countHospitations(pool, { contactId, startsAt }) {
  const result = await pool.query(
    `select count(*)::int as count
       from public.hospitations
      where contact_id = $1 and starts_at = $2::timestamptz`,
    [contactId, startsAt]
  );
  return result.rows[0].count;
}

async function hospitationIdsAt(pool, startsAt) {
  const result = await pool.query(
    `select id
       from public.hospitations
      where starts_at = $1::timestamptz
      order by id`,
    [startsAt]
  );
  return result.rows.map((row) => row.id);
}

async function seedOrganizations(pool) {
  await pool.query(
    `insert into public.organizations
       (id, name, normalized_name, sector, city, source, status, created_by, updated_by)
     values
       ($1, 'Synthetische Praxis Alpha', 'synthetische praxis alpha', 'Praxis', 'Hamburg',
        'synthetic-global-duplicate-e2e', 'active', $4, $4),
       ($2, 'Synthetische Praxis Beta', 'synthetische praxis beta', 'Praxis', 'Berlin',
        'synthetic-global-duplicate-e2e', 'active', $4, $4),
       ($3, 'Synthetische Praxis Gamma', 'synthetische praxis gamma', 'Praxis', 'Koeln',
        'synthetic-global-duplicate-e2e', 'active', $4, $4)`,
    [organizationIds.alpha, organizationIds.beta, organizationIds.gamma, ownerProfileId]
  );
}

async function seedArchivedContact(pool) {
  const id = "synthetic-archived-contact";
  await pool.query(
    `insert into public.contacts
       (id, name, organization_id, organization, sector, city, source, status, owner_id, created_by, updated_by)
     values
       ($1, 'Dr. Clara Archiv', $2, 'Synthetische Praxis Alpha', 'Praxis', 'Hamburg',
        'synthetic-global-duplicate-e2e', 'archived', $3, $3, $3)`,
    [id, organizationIds.alpha, ownerProfileId]
  );
  return id;
}

async function seedLegacyDuplicateContact(pool, canonicalContact) {
  const legacyContact = {
    id: "synthetic-legacy-duplicate-contact",
    name: "Ada Einmal",
    organizationId: canonicalContact.organizationId,
    organization: canonicalContact.organization,
    city: canonicalContact.city
  };
  await pool.query(
    `insert into public.contacts
       (id, name, organization_id, organization, sector, city, source, status, owner_id, created_by, updated_by)
     values
       ($1, $2, $3, $4, 'Praxis', $5, 'synthetic-legacy-existing-contact', 'active', $6, $6, $6)`,
    [
      legacyContact.id,
      legacyContact.name,
      legacyContact.organizationId,
      legacyContact.organization,
      legacyContact.city,
      ownerProfileId
    ]
  );
  return legacyContact;
}

async function seedArchivedHospitation(pool, contact, startsAt) {
  const id = "synthetic-archived-hospitation";
  await pool.query(
    `insert into public.hospitations
       (id, contact_id, contact_name, organization_id, organization_name, owner_id, requester_profile_id,
        status, starts_at, ends_at, city, sector, created_by, updated_by)
     values
       ($1, $2, $3, $4, $5, $6, $6, 'Archiviert', $7::timestamptz, $7::timestamptz + interval '1 hour',
        $8, 'Praxis', $6, $6)`,
    [id, contact.id, contact.name, contact.organizationId, contact.organization, ownerProfileId, startsAt, contact.city]
  );
  return id;
}

async function assertContactGuards(baseUrl, pool) {
  const canonical = assertCreated(await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Ada Einmal",
    organizationId: organizationIds.alpha,
    organization: "Synthetische Praxis Alpha",
    city: "Hamburg"
  })), "kanonischer Kontakt");

  const duplicate = await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Ada Einmal",
    organizationId: organizationIds.alpha,
    organization: "Synthetische Praxis Alpha",
    city: "Hamburg"
  }));
  assertDuplicateConflict(duplicate, {
    code: "CONTACT_DUPLICATE",
    duplicateId: canonical.id,
    label: "Kontakt-POST-Dublette"
  });

  const patchSource = assertCreated(await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Berta Quelle",
    organizationId: organizationIds.beta,
    organization: "Synthetische Praxis Beta",
    city: "Berlin"
  })), "Kontakt für PATCH-Konflikt");
  const patchConflict = await patchJson(baseUrl, `/api/contacts/${encodeURIComponent(patchSource.id)}`, {
    name: canonical.name,
    organizationId: canonical.organizationId,
    organization: canonical.organization,
    city: canonical.city
  });
  assertDuplicateConflict(patchConflict, {
    code: "CONTACT_DUPLICATE",
    duplicateId: canonical.id,
    label: "Kontakt-PATCH-Dublette"
  });
  const unchangedPatchSource = await pool.query(
    "select name, organization_id, city from public.contacts where id = $1",
    [patchSource.id]
  );
  assert.deepEqual(unchangedPatchSource.rows, [{
    name: "Dr. Berta Quelle",
    organization_id: organizationIds.beta,
    city: "Berlin"
  }], "Ein abgewiesenes PATCH darf den Kontakt nicht teilweise verändern.");

  await seedArchivedContact(pool);
  const archivedConflict = await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Clara Archiv",
    organizationId: organizationIds.alpha,
    organization: "Synthetische Praxis Alpha",
    city: "Hamburg"
  }));
  assertDuplicateConflict(archivedConflict, {
    code: "CONTACT_DUPLICATE",
    label: "archivierte Kontakt-Dublette"
  });

  const sameNameAlpha = assertCreated(await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Dana Mehrfach",
    organizationId: organizationIds.alpha,
    organization: "Synthetische Praxis Alpha",
    city: "Hamburg"
  })), "gleichnamiger Kontakt Alpha");
  const sameNameBeta = assertCreated(await postJson(baseUrl, "/api/contacts", contactPayload({
    name: "Dr. Dana Mehrfach",
    organizationId: organizationIds.beta,
    organization: "Synthetische Praxis Beta",
    city: "Berlin"
  })), "gleichnamiger Kontakt Beta");
  assert.notEqual(sameNameAlpha.id, sameNameBeta.id, "Klar unterschiedliche Organisationen und Orte müssen getrennte Kontakte erlauben.");

  const parallelPayload = contactPayload({
    name: "Dr. Emil Parallel",
    organizationId: organizationIds.gamma,
    organization: "Synthetische Praxis Gamma",
    city: "Koeln"
  });
  const parallelResults = await Promise.all(Array.from({ length: 4 }, () => postJson(baseUrl, "/api/contacts", parallelPayload)));
  const parallelCreated = parallelResults.filter((result) => result.status === 201);
  const parallelRejected = parallelResults.filter((result) => result.status === 409);
  assert.equal(parallelCreated.length, 1, `Parallele Kontakt-POSTs müssen genau eine Zeile erzeugen: ${JSON.stringify(parallelResults)}`);
  assert.equal(parallelRejected.length, 3, `Alle weiteren parallelen Kontakt-POSTs müssen mit 409 enden: ${JSON.stringify(parallelResults)}`);
  const parallelContact = parallelCreated[0].payload;
  for (const [index, result] of parallelRejected.entries()) {
    assertDuplicateConflict(result, {
      code: "CONTACT_DUPLICATE",
      duplicateId: parallelContact.id,
      label: `parallele Kontakt-Dublette ${index + 1}`
    });
  }
  assert.equal(await countContacts(pool, {
    name: parallelPayload.name,
    organizationId: parallelPayload.organizationId,
    city: parallelPayload.city
  }), 1, "Das Parallelrennen darf höchstens eine Kontaktzeile hinterlassen.");

  return canonical;
}

async function assertHospitationGuards(baseUrl, pool, contact) {
  const canonicalStartsAt = "2026-09-01T08:00:00.000Z";
  const canonicalId = "synthetic-hospitation-canonical";
  const canonical = assertCreated(await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: canonicalId,
    contact,
    startsAt: canonicalStartsAt
  })), "kanonischer Hospitationstermin");
  assert.equal(canonical.id, canonicalId);

  const duplicate = await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: "synthetic-hospitation-post-duplicate",
    contact,
    startsAt: canonicalStartsAt
  }));
  assertDuplicateConflict(duplicate, {
    code: "HOSPITATION_DUPLICATE",
    duplicateId: canonicalId,
    label: "Hospitation-POST-Dublette"
  });

  const legacyDuplicateContact = await seedLegacyDuplicateContact(pool, contact);
  const legacyContactConflict = await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: "synthetic-hospitation-legacy-contact-duplicate",
    contact: legacyDuplicateContact,
    startsAt: canonicalStartsAt
  }));
  assertDuplicateConflict(legacyContactConflict, {
    code: "HOSPITATION_DUPLICATE",
    duplicateId: canonicalId,
    label: "Hospitation-Dublette über zweite Legacy-Kontakt-ID"
  });

  const patchSourceStartsAt = "2026-09-02T08:00:00.000Z";
  const patchSourceId = "synthetic-hospitation-patch-source";
  assertCreated(await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: patchSourceId,
    contact,
    startsAt: patchSourceStartsAt
  })), "Hospitation für PATCH-Konflikt");
  const patchConflict = await patchJson(baseUrl, `/api/hospitations/${encodeURIComponent(patchSourceId)}`, {
    startsAt: canonicalStartsAt
  });
  assertDuplicateConflict(patchConflict, {
    code: "HOSPITATION_DUPLICATE",
    duplicateId: canonicalId,
    label: "Hospitation-PATCH-Dublette"
  });
  const unchangedPatchSource = await pool.query(
    "select starts_at from public.hospitations where id = $1",
    [patchSourceId]
  );
  assert.equal(unchangedPatchSource.rows[0].starts_at.toISOString(), patchSourceStartsAt,
    "Ein abgewiesenes Hospitations-PATCH darf den Termin nicht teilweise verändern.");

  const archivedStartsAt = "2026-09-03T08:00:00.000Z";
  await seedArchivedHospitation(pool, contact, archivedStartsAt);
  const archivedConflict = await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: "synthetic-hospitation-archived-duplicate",
    contact,
    startsAt: archivedStartsAt
  }));
  assertDuplicateConflict(archivedConflict, {
    code: "HOSPITATION_DUPLICATE",
    label: "archivierte Hospitation-Dublette"
  });

  const allowedDifferentTime = assertCreated(await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: "synthetic-hospitation-different-time",
    contact,
    startsAt: "2026-09-04T08:00:00.000Z"
  })), "Hospitation zu anderem Zeitpunkt");
  assert.equal(allowedDifferentTime.id, "synthetic-hospitation-different-time");

  const organizationOnlyStartsAt = "2026-09-06T08:00:00.000Z";
  const organizationOnlyCanonicalId = "synthetic-hospitation-org-only-alpha";
  assertCreated(await postJson(baseUrl, "/api/hospitations", organizationOnlyHospitationPayload({
    id: organizationOnlyCanonicalId,
    organizationId: organizationIds.alpha,
    organizationName: "Synthetische Praxis Alpha",
    city: "Hamburg",
    startsAt: organizationOnlyStartsAt
  })), "kanonische reine Organisations-Hospitation");
  const organizationOnlyConflict = await postJson(baseUrl, "/api/hospitations", organizationOnlyHospitationPayload({
    id: "synthetic-hospitation-org-only-alpha-duplicate",
    organizationId: organizationIds.alpha,
    organizationName: "Synthetische Praxis Alpha",
    city: "Hamburg",
    startsAt: organizationOnlyStartsAt
  }));
  assertDuplicateConflict(organizationOnlyConflict, {
    code: "HOSPITATION_DUPLICATE",
    duplicateId: organizationOnlyCanonicalId,
    label: "reine Organisations-Hospitation-Dublette"
  });
  const organizationOnlyDifferentOrganization = assertCreated(await postJson(
    baseUrl,
    "/api/hospitations",
    organizationOnlyHospitationPayload({
      id: "synthetic-hospitation-org-only-beta-same-time",
      organizationId: organizationIds.beta,
      organizationName: "Synthetische Praxis Beta",
      city: "Berlin",
      startsAt: organizationOnlyStartsAt
    })
  ), "reine Organisations-Hospitation anderer Organisation zur selben Zeit");
  assert.equal(organizationOnlyDifferentOrganization.id, "synthetic-hospitation-org-only-beta-same-time");
  assert.deepEqual(await hospitationIdsAt(pool, organizationOnlyStartsAt), [
    organizationOnlyCanonicalId,
    organizationOnlyDifferentOrganization.id
  ].sort(), "Zur selben Zeit dürfen genau die beiden fachlich unterschiedlichen Organisationstermine bestehen.");

  const personFirstStartsAt = "2026-09-07T08:00:00.000Z";
  const personFirstId = "synthetic-hospitation-person-before-org-only";
  const organizationAfterPersonId = "synthetic-hospitation-org-only-after-person";
  assertCreated(await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: personFirstId,
    contact,
    startsAt: personFirstStartsAt
  })), "personenbezogene Hospitation vor Organisations-Hospitation");
  assertCreated(await postJson(baseUrl, "/api/hospitations", organizationOnlyHospitationPayload({
    id: organizationAfterPersonId,
    organizationId: organizationIds.alpha,
    organizationName: "Synthetische Praxis Alpha",
    city: "Hamburg",
    startsAt: personFirstStartsAt
  })), "reine Organisations-Hospitation nach personenbezogener Hospitation");
  assert.deepEqual(await hospitationIdsAt(pool, personFirstStartsAt), [
    personFirstId,
    organizationAfterPersonId
  ].sort(), "Person und reine Organisation dürfen trotz gleicher Organisation und Zeit getrennte Hospitationen bleiben.");

  const organizationFirstStartsAt = "2026-09-08T08:00:00.000Z";
  const organizationFirstId = "synthetic-hospitation-org-only-before-person";
  const personAfterOrganizationId = "synthetic-hospitation-person-after-org-only";
  assertCreated(await postJson(baseUrl, "/api/hospitations", organizationOnlyHospitationPayload({
    id: organizationFirstId,
    organizationId: organizationIds.alpha,
    organizationName: "Synthetische Praxis Alpha",
    city: "Hamburg",
    startsAt: organizationFirstStartsAt
  })), "reine Organisations-Hospitation vor personenbezogener Hospitation");
  assertCreated(await postJson(baseUrl, "/api/hospitations", hospitationPayload({
    id: personAfterOrganizationId,
    contact,
    startsAt: organizationFirstStartsAt
  })), "personenbezogene Hospitation nach reiner Organisations-Hospitation");
  assert.deepEqual(await hospitationIdsAt(pool, organizationFirstStartsAt), [
    organizationFirstId,
    personAfterOrganizationId
  ].sort(), "Die Trennung Person↔Organisation muss unabhängig von der Anlagereihenfolge gelten.");

  const parallelStartsAt = "2026-09-05T08:00:00.000Z";
  const parallelResults = await Promise.all(Array.from({ length: 4 }, (_value, index) => postJson(
    baseUrl,
    "/api/hospitations",
    hospitationPayload({
      id: `synthetic-hospitation-parallel-${index + 1}`,
      contact,
      startsAt: parallelStartsAt
    })
  )));
  const parallelCreated = parallelResults.filter((result) => result.status === 201);
  const parallelRejected = parallelResults.filter((result) => result.status === 409);
  assert.equal(parallelCreated.length, 1, `Parallele Termin-POSTs müssen genau eine Zeile erzeugen: ${JSON.stringify(parallelResults)}`);
  assert.equal(parallelRejected.length, 3, `Alle weiteren parallelen Termin-POSTs müssen mit 409 enden: ${JSON.stringify(parallelResults)}`);
  const parallelHospitation = parallelCreated[0].payload;
  for (const [index, result] of parallelRejected.entries()) {
    assertDuplicateConflict(result, {
      code: "HOSPITATION_DUPLICATE",
      duplicateId: parallelHospitation.id,
      label: `parallele Hospitation-Dublette ${index + 1}`
    });
  }
  assert.equal(await countHospitations(pool, {
    contactId: contact.id,
    startsAt: parallelStartsAt
  }), 1, "Das Parallelrennen darf höchstens eine Hospitationszeile hinterlassen.");
}

if (!dockerIsAvailable()) {
  const message = "Docker ist nicht verfügbar: isolierter globaler Dublettenschutz-E2E-Test wurde übersprungen.";
  if (requireDocker) throw new Error(`${message} Der Produktivfreigabe-Befehl arbeitet absichtlich fail-closed.`);
  console.log(`${message} Für die explizite Freigabe test:duplicate-guards-e2e:release verwenden.`);
  process.exit(0);
}

const randomSuffix = crypto.randomBytes(6).toString("hex");
const containerName = `vk-duplicate-guard-e2e-${process.pid}-${randomSuffix}`;
const databaseUser = "vk_duplicate_guard_e2e";
const databaseName = "versorgungs_kompass";
const databasePassword = `synthetic-${crypto.randomBytes(18).toString("hex")}`;
const runtimePassword = `synthetic-runtime-${crypto.randomBytes(18).toString("hex")}`;
let pool;
let apiChild;
let apiLogs = "";

try {
  runDocker([
    "run", "--rm", "-d", "--name", containerName,
    "--label", "versorgungs-kompass.test=global-duplicate-guards-e2e",
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
     values ($1, 'duplicate-guard-owner@synthetic.example.invalid', 'Synthetischer Dublettenschutz-Owner',
             'SD', 'editor', true, 'Synthetische Qualitätssicherung',
             'Ausschließlich für den isolierten globalen Dublettenschutz-E2E-Test.')`,
    [ownerProfileId]
  );
  await seedOrganizations(pool);

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
      `select current_user,
              pg_has_role(current_user, $1, 'member') as runtime_member,
              has_schema_privilege(current_user, 'public', 'create') as can_create_in_public,
              has_table_privilege(current_user, 'public.contacts', 'select,insert,update,delete') as contact_access,
              has_table_privilege(current_user, 'public.hospitations', 'select,insert,update,delete') as hospitation_access,
              (select rolsuper from pg_catalog.pg_roles where rolname = current_user) as is_superuser`,
      [runtimeRoleName]
    );
    assert.deepEqual(identity.rows[0], {
      current_user: runtimeUser,
      runtime_member: true,
      can_create_in_public: false,
      contact_access: true,
      hospitation_access: true,
      is_superuser: false
    }, "Die Test-API muss mit der echten Least-Privilege-Laufzeitrolle arbeiten.");
  } finally {
    await runtimeProbe.end();
  }

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
      API_DEV_PROFILE_ID: ownerProfileId,
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

  const canonicalContact = await assertContactGuards(baseUrl, pool);
  await assertHospitationGuards(baseUrl, pool, canonicalContact);

  console.log("Globaler Dublettenschutz E2E OK: echte HTTP/API/PostgreSQL-16-Kette mit Least-Privilege-Laufzeitrolle; Kontakt- und Termindubletten bei POST/PATCH inklusive Archivschutz abgewiesen, legitime Varianten zugelassen und Parallelrennen ohne Mehrfacheinträge serialisiert.");
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
