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
const foreignEhcOwnerProfileId = "synthetic-global-duplicate-ehc-owner";
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

function nestedHospitationPayload({ id, contact, organization, scheduledOn, ownerId, status = "Angefragt" }) {
  return {
    id,
    contact,
    ...(typeof organization === "undefined" ? {} : { organization }),
    scheduledOn,
    ...(ownerId ? { ownerId } : {}),
    sector: "Praxis",
    status
  };
}

function normalizedEntityName(value) {
  return String(value || "").trim().replace(/\s+/gu, " ").toLowerCase();
}

function assertHttpError(result, status, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.payload)}`);
  assert.equal(typeof result.payload?.error, "string", `${label}: verständlicher Fehlertext fehlt.`);
  assert.ok(result.payload.error.trim(), `${label}: verständlicher Fehlertext darf nicht leer sein.`);
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

async function organizationRowsByNormalizedName(pool, name) {
  const result = await pool.query(
    `select id, name, normalized_name
       from public.organizations
      where normalized_name = $1
      order by id`,
    [normalizedEntityName(name)]
  );
  return result.rows;
}

async function contactRowsByNormalizedName(pool, name) {
  const result = await pool.query(
    `select id, name, organization_id, organization
       from public.contacts
      where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = $1
      order by id`,
    [normalizedEntityName(name)]
  );
  return result.rows;
}

async function nestedDomainCounts(pool) {
  const result = await pool.query(
    `select
       (select count(*)::int from public.organizations) as organizations,
       (select count(*)::int from public.contacts) as contacts,
       (select count(*)::int from public.contact_owners) as contact_owners,
       (select count(*)::int from public.changes) as changes,
       (select count(*)::int from public.hospitations) as hospitations,
       (select count(*)::int from public.activity_events) as activity_events,
       (select count(*)::int from public.notification_events) as notification_events,
       (select count(*)::int from public.notification_recipients) as notification_recipients`
  );
  return result.rows[0];
}

async function hospitationRowsByIds(pool, ids) {
  const result = await pool.query(
    `select id, contact_id, contact_name, organization_id, organization_name, scheduled_on::text
       from public.hospitations
      where id = any($1::text[])
      order by id`,
    [ids]
  );
  return result.rows;
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

async function seedAmbiguousNestedOrganizations(pool) {
  const normalizedName = "mehrdeutige nested praxis";
  const ids = ["synthetic-nested-ambiguous-org-a", "synthetic-nested-ambiguous-org-b"];
  await pool.query(
    `insert into public.organizations
       (id, name, normalized_name, sector, city, source, status, created_by, updated_by)
     values
       ($1, 'Mehrdeutige Nested Praxis', $3, 'Praxis', 'Berlin',
        'synthetic-nested-hospitation-e2e', 'active', $4, $4),
       ($2, ' mehrdeutige   nested praxis ', $3, 'Praxis', 'Berlin',
        'synthetic-nested-hospitation-e2e', 'active', $4, $4)`,
    [...ids, normalizedName, ownerProfileId]
  );
  return { ids, name: normalizedName };
}

async function seedAmbiguousNestedContacts(pool) {
  const ids = ["synthetic-nested-ambiguous-contact-a", "synthetic-nested-ambiguous-contact-b"];
  await pool.query(
    `insert into public.contacts
       (id, name, organization_id, organization, sector, city, source, status, owner_id, created_by, updated_by)
     values
       ($1, 'Mehrdeutiger Nested Kontakt', $3, 'Synthetische Praxis Gamma', 'Praxis', 'Koeln',
        'synthetic-nested-hospitation-e2e', 'active', $4, $4, $4),
       ($2, ' mehrdeutiger   nested kontakt ', $3, 'Synthetische Praxis Gamma', 'Praxis', 'Koeln',
        'synthetic-nested-hospitation-e2e', 'active', $4, $4, $4)`,
    [...ids, organizationIds.gamma, ownerProfileId]
  );
  return { ids, name: "mehrdeutiger nested kontakt" };
}

async function seedLegacyEhcContact(pool, { id, name, ownerId, organization = "" }) {
  await pool.query(
    `insert into public.contacts
       (id, name, organization, sector, source, status, owner_id,
        ehc_consent_status, ehc_consent_effective_at, ehc_consent_source, ehc_consent_recorded_by,
        created_by, updated_by)
     values
       ($1, $2, nullif($3, ''), 'Praxis', 'synthetic-nested-ehc-e2e', 'active', $4,
        'granted', now(), 'written', $4, $4, $4)`,
    [id, name, organization, ownerId]
  );
  return { id, name, ownerId, organization };
}

async function seedHistoryOnlyEhcContact(pool, { id, name, ownerId }) {
  await pool.query(
    `insert into public.contacts
       (id, name, sector, source, status, owner_id,
        ehc_consent_status, ehc_consent_note, created_by, updated_by)
     values
       ($1, $2, 'Praxis', 'synthetic-nested-ehc-history-e2e', 'active', $3,
        'not_requested', 'Historischer EHC-Nachweis ohne aktuellen Status.', $3, $3)`,
    [id, name, ownerId]
  );
  return { id, name, ownerId };
}

async function seedScheduledHospitation(pool, { id, contactId = null, contactName, organizationName = null, scheduledOn, ownerId }) {
  await pool.query(
    `insert into public.hospitations
       (id, contact_id, contact_name, organization_name, owner_id, requester_profile_id,
        status, scheduled_on, sector, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $5, 'Angefragt', $6::date, 'Praxis', $5, $5)`,
    [id, contactId, contactName, organizationName, ownerId, scheduledOn]
  );
}

async function nestedContactSideEffects(pool, contactId) {
  const [owners, changes, activities, notificationRecipients] = await Promise.all([
    pool.query("select profile_id from public.contact_owners where contact_id = $1 order by profile_id", [contactId]),
    pool.query("select action from public.changes where contact_id = $1 order by id", [contactId]),
    pool.query("select event_key from public.activity_events where contact_id = $1 order by id", [contactId]),
    pool.query(
      `select recipient.user_id
         from public.notification_events event
         join public.notification_recipients recipient on recipient.event_id = event.id
        where event.entity_type = 'contact' and event.entity_id = $1 and event.event_type = 'contact_created'
        order by recipient.user_id`,
      [contactId]
    )
  ]);
  return {
    ownerIds: owners.rows.map((row) => row.profile_id),
    changes: changes.rows.map((row) => row.action),
    activities: activities.rows.map((row) => row.event_key),
    notificationRecipientIds: notificationRecipients.rows.map((row) => row.user_id)
  };
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

async function assertNestedHospitationContracts(baseUrl, pool, canonicalContact) {
  const validationCounts = await nestedDomainCounts(pool);
  const validationCases = [
    {
      label: "unbekannter Kontaktmodus",
      body: nestedHospitationPayload({
        id: "synthetic-nested-invalid-contact-mode",
        contact: { mode: "lookup", name: "Ungültiger Kontaktmodus" },
        scheduledOn: "2099-01-01"
      })
    },
    {
      label: "fehlende bestehende Kontakt-ID",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-contact-id",
        contact: { mode: "existing" },
        scheduledOn: "2099-01-02"
      })
    },
    {
      label: "fehlender neuer Kontaktname",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-contact-name",
        contact: { mode: "create" },
        scheduledOn: "2099-01-03"
      })
    },
    {
      label: "unbekannter Organisationsmodus",
      body: nestedHospitationPayload({
        id: "synthetic-nested-invalid-organization-mode",
        contact: { mode: "create", name: "Rollback Kontakt Organisationsmodus" },
        organization: { mode: "lookup", name: "Ungültiger Organisationsmodus" },
        scheduledOn: "2099-01-04"
      })
    },
    {
      label: "fehlende bestehende Organisations-ID",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-organization-id",
        contact: { mode: "create", name: "Rollback Kontakt ohne Organisations-ID" },
        organization: { mode: "existing" },
        scheduledOn: "2099-01-05"
      })
    },
    {
      label: "fehlender neuer Organisationsname",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-organization-name",
        contact: { mode: "create", name: "Rollback Kontakt ohne Organisationsname" },
        organization: { mode: "create" },
        scheduledOn: "2099-01-06"
      })
    },
    {
      label: "fehlender Kontakt im verschachtelten POST-Vertrag",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-contact",
        contact: null,
        organization: { mode: "create", name: "Rollback Organisation ohne Kontakt" },
        scheduledOn: "2099-01-07"
      })
    },
    {
      label: "fehlender Hospitationstag im verschachtelten POST-Vertrag",
      body: nestedHospitationPayload({
        id: "synthetic-nested-missing-scheduled-on",
        contact: { mode: "create", name: "Rollback Kontakt ohne Hospitationstag" }
      })
    },
    {
      label: "unbekanntes äußeres Hospitationsfeld",
      body: {
        ...nestedHospitationPayload({
          id: "synthetic-nested-unknown-outer-field",
          contact: { mode: "create", name: "Rollback Kontakt unbekanntes Feld" },
          scheduledOn: "2099-01-08"
        }),
        unexpectedNestedContractField: "nicht erlaubt"
      }
    }
  ];
  for (const testCase of validationCases) {
    const result = await postJson(baseUrl, "/api/hospitations", testCase.body);
    assertHttpError(result, 400, testCase.label);
  }
  assert.deepEqual(
    await nestedDomainCounts(pool),
    validationCounts,
    "Ungültige verschachtelte Referenzen dürfen keine Kontakte, Organisationen, Hospitationen oder Begleitdaten hinterlassen."
  );

  const createdContactName = "Atomarer Nested Kontakt";
  const createdOrganizationName = "Atomare Nested Praxis";
  const createdBoth = assertCreated(await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-create-both",
    contact: { mode: "create", name: createdContactName },
    organization: { mode: "create", name: createdOrganizationName },
    scheduledOn: "2099-02-01"
  })), "verschachtelte Hospitation mit neuem Kontakt und neuer Organisation");
  assert.ok(createdBoth.resolvedContact?.id, "Die verschachtelte POST-Antwort muss den aufgelösten Kontakt liefern.");
  assert.ok(createdBoth.resolvedOrganization?.id, "Die verschachtelte POST-Antwort muss die aufgelöste Organisation liefern.");
  assert.equal(createdBoth.contactId, createdBoth.resolvedContact.id);
  assert.equal(createdBoth.organizationId, createdBoth.resolvedOrganization.id);
  assert.equal(createdBoth.resolvedContact.organizationId, createdBoth.resolvedOrganization.id);
  assert.equal(createdBoth.contactName, createdContactName);
  assert.equal(createdBoth.organizationName, createdOrganizationName);

  const createdBothRows = await hospitationRowsByIds(pool, [createdBoth.id]);
  assert.deepEqual(createdBothRows, [{
    id: createdBoth.id,
    contact_id: createdBoth.resolvedContact.id,
    contact_name: createdContactName,
    organization_id: createdBoth.resolvedOrganization.id,
    organization_name: createdOrganizationName,
    scheduled_on: "2099-02-01"
  }], "Kontakt, Organisation und Hospitation müssen gemeinsam kanonisch gespeichert werden.");
  assert.deepEqual(await organizationRowsByNormalizedName(pool, createdOrganizationName), [{
    id: createdBoth.resolvedOrganization.id,
    name: createdOrganizationName,
    normalized_name: normalizedEntityName(createdOrganizationName)
  }]);
  assert.deepEqual(await contactRowsByNormalizedName(pool, createdContactName), [{
    id: createdBoth.resolvedContact.id,
    name: createdContactName,
    organization_id: createdBoth.resolvedOrganization.id,
    organization: createdOrganizationName
  }]);

  const organizationCountBeforeExistingReference = (await nestedDomainCounts(pool)).organizations;
  const existingOrganization = assertCreated(await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-existing-organization",
    contact: { mode: "create", name: "Nested Kontakt Bestehende Organisation" },
    organization: { mode: "existing", id: organizationIds.beta },
    scheduledOn: "2099-02-02"
  })), "verschachtelte Hospitation mit bestehender Organisation");
  assert.equal(existingOrganization.organizationId, organizationIds.beta);
  assert.equal(existingOrganization.resolvedOrganization?.id, organizationIds.beta);
  assert.equal(existingOrganization.resolvedContact?.organizationId, organizationIds.beta);
  assert.equal((await nestedDomainCounts(pool)).organizations, organizationCountBeforeExistingReference,
    "Eine bestehende Organisationsreferenz darf keine neue Organisation erzeugen.");

  const withoutOrganization = assertCreated(await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-without-organization",
    contact: { mode: "create", name: "Nested Kontakt Ohne Organisation" },
    scheduledOn: "2099-02-03"
  })), "verschachtelte Hospitation ohne optionale Organisation");
  assert.ok(withoutOrganization.resolvedContact?.id);
  assert.equal(withoutOrganization.organizationId, "");
  assert.equal(withoutOrganization.resolvedContact.organizationId, "");
  assert.equal(withoutOrganization.resolvedOrganization, null);
  assert.deepEqual(await hospitationRowsByIds(pool, [withoutOrganization.id]), [{
    id: withoutOrganization.id,
    contact_id: withoutOrganization.resolvedContact.id,
    contact_name: "Nested Kontakt Ohne Organisation",
    organization_id: null,
    organization_name: null,
    scheduled_on: "2099-02-03"
  }]);

  const reusedBoth = assertCreated(await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-normalized-reuse",
    contact: { mode: "create", name: "  atomarer   nested kontakt  " },
    organization: { mode: "create", name: "  ATOMARE   nested praxis  " },
    scheduledOn: "2099-02-04"
  })), "normalisierte Wiederverwendung von Kontakt und Organisation");
  assert.equal(reusedBoth.contactId, createdBoth.contactId);
  assert.equal(reusedBoth.organizationId, createdBoth.organizationId);
  assert.equal(reusedBoth.resolvedContact?.id, createdBoth.contactId);
  assert.equal(reusedBoth.resolvedOrganization?.id, createdBoth.organizationId);
  assert.equal(reusedBoth.contactName, createdContactName, "Die Hospitation muss den kanonischen Kontaktnamen übernehmen.");
  assert.equal(reusedBoth.organizationName, createdOrganizationName, "Die Hospitation muss den kanonischen Organisationsnamen übernehmen.");
  assert.equal((await contactRowsByNormalizedName(pool, createdContactName)).length, 1,
    "Normalisierte Wiederverwendung darf keine Kontaktdublette erzeugen.");
  assert.equal((await organizationRowsByNormalizedName(pool, createdOrganizationName)).length, 1,
    "Normalisierte Wiederverwendung darf keine Organisationsdublette erzeugen.");

  const organizationOnlyPatch = await patchJson(
    baseUrl,
    `/api/hospitations/${encodeURIComponent(createdBoth.id)}`,
    { organization: { mode: "existing", id: createdBoth.organizationId } }
  );
  assert.equal(organizationOnlyPatch.status, 200, `reiner Organisations-PATCH: ${JSON.stringify(organizationOnlyPatch.payload)}`);
  assert.equal(organizationOnlyPatch.payload.contactId, createdBoth.contactId,
    "Ein reiner Organisations-PATCH muss den bestehenden Kontakt bewahren.");
  assert.equal(organizationOnlyPatch.payload.organizationId, createdBoth.organizationId);
  assert.equal(organizationOnlyPatch.payload.resolvedOrganization?.id, createdBoth.organizationId);
  assert.deepEqual(await hospitationRowsByIds(pool, [createdBoth.id]), [{
    id: createdBoth.id,
    contact_id: createdBoth.contactId,
    contact_name: createdContactName,
    organization_id: createdBoth.organizationId,
    organization_name: createdOrganizationName,
    scheduled_on: "2099-02-01"
  }]);

  const legacyContactAlias = "Legacy Kontaktalias im Termin";
  const legacyOrganizationAlias = "Legacy Organisationsalias im Termin";
  await pool.query(
    `update public.hospitations
        set contact_name = $2, organization_name = $3
      where id = $1`,
    [createdBoth.id, legacyContactAlias, legacyOrganizationAlias]
  );
  const nullReferencePatch = await patchJson(
    baseUrl,
    `/api/hospitations/${encodeURIComponent(createdBoth.id)}`,
    { contact: null, organization: null, requestNote: "Identität bleibt erhalten" }
  );
  assert.equal(nullReferencePatch.status, 200, `PATCH mit null-Referenzen: ${JSON.stringify(nullReferencePatch.payload)}`);
  assert.equal(nullReferencePatch.payload.contactId, createdBoth.contactId);
  assert.equal(nullReferencePatch.payload.organizationId, createdBoth.organizationId);
  assert.equal(nullReferencePatch.payload.contactName, legacyContactAlias,
    "Eine null-Kontaktreferenz muss einen gespeicherten Legacy-Kontaktalias bewahren.");
  assert.equal(nullReferencePatch.payload.organizationName, legacyOrganizationAlias,
    "Eine null-Organisationsreferenz muss einen gespeicherten Legacy-Organisationsalias bewahren.");
  assert.equal(nullReferencePatch.payload.resolvedContact, null, "Eine null-Kontaktreferenz darf keinen Kontakt als neu aufgelöst melden.");
  assert.deepEqual(await hospitationRowsByIds(pool, [createdBoth.id]), [{
    id: createdBoth.id,
    contact_id: createdBoth.contactId,
    contact_name: legacyContactAlias,
    organization_id: createdBoth.organizationId,
    organization_name: legacyOrganizationAlias,
    scheduled_on: "2099-02-01"
  }], "Ein null/null-PATCH darf gespeicherte Legacy-Aliase nicht kanonisch überschreiben.");

  const ownerLegacyEhcContact = await seedLegacyEhcContact(pool, {
    id: "synthetic-nested-owner-legacy-ehc-contact",
    name: "Legacy EHC Eigenkontakt",
    ownerId: ownerProfileId
  });
  const ownerLegacyJunctionBefore = await pool.query(
    "select profile_id from public.contact_owners where contact_id = $1 order by profile_id",
    [ownerLegacyEhcContact.id]
  );
  assert.deepEqual(ownerLegacyJunctionBefore.rows, [],
    "Der Legacy-EHC-Testkontakt darf absichtlich noch keinen contact_owners-Eintrag besitzen.");
  const ownerLegacyReuse = assertCreated(await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-owner-legacy-ehc-reuse",
    contact: { mode: "create", name: "  legacy   ehc eigenkontakt  " },
    scheduledOn: "2099-02-10"
  })), "Wiederverwendung eines eigenen Legacy-EHC-Kontakts");
  assert.equal(ownerLegacyReuse.contactId, ownerLegacyEhcContact.id,
    "owner_id muss bei fehlender Junction weiterhin den Zugriff und die Wiederverwendung erlauben.");
  assert.equal(ownerLegacyReuse.resolvedContact?.id, ownerLegacyEhcContact.id);
  assert.deepEqual(ownerLegacyReuse.resolvedContact?.ownerIds, [ownerProfileId],
    "Der Legacy-owner_id muss als effektive Owner-Zuordnung projiziert werden.");
  assert.equal((await contactRowsByNormalizedName(pool, ownerLegacyEhcContact.name)).length, 1,
    "Die Wiederverwendung des Legacy-EHC-Kontakts darf keine Dublette erzeugen.");
  const ownerLegacyJunctionAfter = await pool.query(
    "select profile_id from public.contact_owners where contact_id = $1 order by profile_id",
    [ownerLegacyEhcContact.id]
  );
  assert.deepEqual(ownerLegacyJunctionAfter.rows, [],
    "Die reine Wiederverwendung muss keinen Legacy-Datensatz stillschweigend migrieren.");

  const foreignEhcContact = await seedLegacyEhcContact(pool, {
    id: "synthetic-nested-foreign-ehc-contact",
    name: "Fremder EHC Kontakt",
    ownerId: foreignEhcOwnerProfileId
  });
  const foreignEhcHospitationId = "synthetic-nested-foreign-ehc-hospitation";
  await seedScheduledHospitation(pool, {
    id: foreignEhcHospitationId,
    contactId: foreignEhcContact.id,
    contactName: foreignEhcContact.name,
    scheduledOn: "2099-02-11",
    ownerId: foreignEhcOwnerProfileId
  });
  const foreignEhcShadowResult = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-foreign-ehc-shadow",
    contact: { mode: "create", name: foreignEhcContact.name },
    scheduledOn: "2099-02-11"
  }));
  assert.equal(foreignEhcShadowResult.status, 201,
    `Ein fremder EHC-Kontakt und dessen Termin dürfen weder Wiederverwendung noch 409 erzwingen: ${JSON.stringify(foreignEhcShadowResult.payload)}`);
  assert.equal(foreignEhcShadowResult.payload?.duplicateId, undefined,
    "Die ID einer fremden EHC-Hospitation darf nicht offengelegt werden.");
  assert.ok(foreignEhcShadowResult.payload?.contactId,
    "Für den aktuellen Owner muss ein eigener, sichtbarer Kontakt erzeugt werden.");
  assert.notEqual(foreignEhcShadowResult.payload.contactId, foreignEhcContact.id,
    "Ein fremder EHC-Kontakt darf nicht wiederverwendet werden.");
  assert.equal(foreignEhcShadowResult.payload.resolvedContact?.id, foreignEhcShadowResult.payload.contactId);
  assert.equal((await contactRowsByNormalizedName(pool, foreignEhcContact.name)).length, 2,
    "Fremder und eigener EHC-Sichtbarkeitsbereich müssen getrennte gleichnamige Kontakte erlauben.");
  assert.deepEqual(await hospitationRowsByIds(pool, [foreignEhcShadowResult.payload.id]), [{
    id: foreignEhcShadowResult.payload.id,
    contact_id: foreignEhcShadowResult.payload.contactId,
    contact_name: foreignEhcContact.name,
    organization_id: null,
    organization_name: null,
    scheduled_on: "2099-02-11"
  }]);
  assert.equal((await hospitationRowsByIds(pool, [foreignEhcHospitationId])).length, 1,
    "Der fremde EHC-Termin muss unverändert bestehen bleiben.");

  const foreignHistoryOnlyEhcContact = await seedHistoryOnlyEhcContact(pool, {
    id: "synthetic-nested-foreign-history-only-ehc-contact",
    name: "Fremder EHC Historienkontakt",
    ownerId: foreignEhcOwnerProfileId
  });
  const foreignHistoryOnlyResult = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-foreign-history-only-ehc-shadow",
    contact: { mode: "create", name: foreignHistoryOnlyEhcContact.name },
    scheduledOn: "2099-02-13"
  }));
  assert.equal(foreignHistoryOnlyResult.status, 201,
    `Auch reine EHC-Historienfelder müssen den fremden Kontakt vor Wiederverwendung und Existenzsignalen schützen: ${JSON.stringify(foreignHistoryOnlyResult.payload)}`);
  assert.equal(foreignHistoryOnlyResult.payload?.duplicateId, undefined,
    "Ein history-only EHC-Kontakt darf keine Dubletten-ID offenlegen.");
  assert.ok(foreignHistoryOnlyResult.payload?.contactId);
  assert.notEqual(foreignHistoryOnlyResult.payload.contactId, foreignHistoryOnlyEhcContact.id);
  assert.equal((await contactRowsByNormalizedName(pool, foreignHistoryOnlyEhcContact.name)).length, 2,
    "Der eigene Kontakt muss getrennt vom fremden history-only EHC-Kontakt angelegt werden.");

  const legacyTextOrganizationContact = await seedLegacyEhcContact(pool, {
    id: "synthetic-nested-legacy-text-organization-contact",
    name: "Legacy Textorganisation Kontakt",
    ownerId: ownerProfileId,
    organization: "Synthetische Praxis Beta"
  });
  const legacyTextOrganizationReuse = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-legacy-text-organization-reuse",
    contact: { mode: "create", name: "  legacy textorganisation   kontakt " },
    organization: { mode: "existing", id: organizationIds.beta },
    scheduledOn: "2099-02-14"
  }));
  assert.equal(legacyTextOrganizationReuse.status, 201,
    `Ein eindeutiger Legacy-Kontakt mit passendem Organisationstext muss wiederverwendet werden: ${JSON.stringify(legacyTextOrganizationReuse.payload)}`);
  assert.equal(legacyTextOrganizationReuse.payload.contactId, legacyTextOrganizationContact.id);
  assert.equal(legacyTextOrganizationReuse.payload.organizationId, organizationIds.beta);
  assert.equal(legacyTextOrganizationReuse.payload.resolvedContact?.id, legacyTextOrganizationContact.id);
  assert.equal(legacyTextOrganizationReuse.payload.resolvedOrganization?.id, organizationIds.beta);
  assert.deepEqual(await contactRowsByNormalizedName(pool, legacyTextOrganizationContact.name), [{
    id: legacyTextOrganizationContact.id,
    name: legacyTextOrganizationContact.name,
    organization_id: null,
    organization: "Synthetische Praxis Beta"
  }], "Die Wiederverwendung darf den Legacy-Kontakt weder duplizieren noch stillschweigend migrieren.");

  const mixedNullContactPatch = await patchJson(
    baseUrl,
    `/api/hospitations/${encodeURIComponent(createdBoth.id)}`,
    {
      contact: null,
      contactId: foreignEhcContact.id,
      requestNote: "Gemischter Vertrag bewahrt bestehende Identität"
    }
  );
  assert.equal(mixedNullContactPatch.status, 200,
    `gemischter PATCH mit contact:null und fremder contactId: ${JSON.stringify(mixedNullContactPatch.payload)}`);
  assert.equal(mixedNullContactPatch.payload.contactId, createdBoth.contactId,
    "contact:null muss die flache fremde contactId neutralisieren und den bestehenden Kontakt bewahren.");
  assert.notEqual(mixedNullContactPatch.payload.contactId, foreignEhcContact.id);
  assert.equal(mixedNullContactPatch.payload.contactName, legacyContactAlias);
  assert.equal(mixedNullContactPatch.payload.organizationName, legacyOrganizationAlias);
  assert.deepEqual(await hospitationRowsByIds(pool, [createdBoth.id]), [{
    id: createdBoth.id,
    contact_id: createdBoth.contactId,
    contact_name: legacyContactAlias,
    organization_id: createdBoth.organizationId,
    organization_name: legacyOrganizationAlias,
    scheduled_on: "2099-02-01"
  }], "Der gemischte PATCH darf weder Kontakt noch gespeicherte Legacy-Aliase verändern.");

  const legacyOrganizationContact = await seedLegacyEhcContact(pool, {
    id: "synthetic-nested-legacy-organization-contact",
    name: "Legacy Organisationskonflikt Kontakt",
    ownerId: ownerProfileId,
    organization: "Legacy Praxis A"
  });
  const legacyOrganizationMismatchCounts = await nestedDomainCounts(pool);
  const explicitLegacyOrganizationName = "Explizite Legacy Praxis B";
  const legacyOrganizationMismatch = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-legacy-organization-mismatch",
    contact: { mode: "existing", id: legacyOrganizationContact.id },
    organization: { mode: "create", name: explicitLegacyOrganizationName },
    scheduledOn: "2099-02-12"
  }));
  assertHttpError(legacyOrganizationMismatch, 400,
    "Legacy-Kontakt ohne organization_id mit abweichendem Organisationstext");
  assert.deepEqual(await nestedDomainCounts(pool), legacyOrganizationMismatchCounts,
    "Der Legacy-Organisationskonflikt muss Organisation, Hospitation und sämtliche Begleitdaten zurückrollen.");
  assert.equal((await organizationRowsByNormalizedName(pool, explicitLegacyOrganizationName)).length, 0,
    "Die vor der Validierung erzeugte explizite Organisation muss zurückgerollt werden.");
  assert.equal((await hospitationRowsByIds(pool, ["synthetic-nested-legacy-organization-mismatch"])).length, 0);

  const patchCreateBothSourceId = "synthetic-nested-patch-create-both-source";
  await seedScheduledHospitation(pool, {
    id: patchCreateBothSourceId,
    contactId: canonicalContact.id,
    contactName: canonicalContact.name,
    organizationName: canonicalContact.organization,
    scheduledOn: "2099-03-01",
    ownerId: ownerProfileId
  });
  const patchCreatedContactName = "Atomarer PATCH Kontakt";
  const patchCreatedOrganizationName = "Atomare PATCH Praxis";
  const patchCreateBothResult = await patchJson(
    baseUrl,
    `/api/hospitations/${encodeURIComponent(patchCreateBothSourceId)}`,
    {
      contact: { mode: "create", name: patchCreatedContactName },
      organization: { mode: "create", name: patchCreatedOrganizationName },
      scheduledOn: "2099-03-01",
      ownerId: foreignEhcOwnerProfileId,
      status: "Angefragt"
    }
  );
  assert.equal(patchCreateBothResult.status, 200,
    `PATCH mit neuem Kontakt und neuer Organisation: ${JSON.stringify(patchCreateBothResult.payload)}`);
  const patchCreatedBoth = patchCreateBothResult.payload;
  assert.ok(patchCreatedBoth.resolvedContact?.id, "Der PATCH muss den neu angelegten Kontakt zurückgeben.");
  assert.ok(patchCreatedBoth.resolvedOrganization?.id, "Der PATCH muss die neu angelegte Organisation zurückgeben.");
  assert.equal(patchCreatedBoth.contactId, patchCreatedBoth.resolvedContact.id);
  assert.equal(patchCreatedBoth.organizationId, patchCreatedBoth.resolvedOrganization.id);
  assert.equal(patchCreatedBoth.resolvedContact.organizationId, patchCreatedBoth.organizationId);
  assert.deepEqual(await hospitationRowsByIds(pool, [patchCreateBothSourceId]), [{
    id: patchCreateBothSourceId,
    contact_id: patchCreatedBoth.contactId,
    contact_name: patchCreatedContactName,
    organization_id: patchCreatedBoth.organizationId,
    organization_name: patchCreatedOrganizationName,
    scheduled_on: "2099-03-01"
  }], "Ein erfolgreicher create-both-PATCH muss alle drei Entitäten kanonisch verknüpfen.");
  const patchCreateBothSideEffects = await nestedContactSideEffects(pool, patchCreatedBoth.contactId);
  assert.deepEqual(patchCreateBothSideEffects.ownerIds, [foreignEhcOwnerProfileId],
    "Der neue Kontakt muss die angeforderte Owner-Junction erhalten.");
  assert.deepEqual(patchCreateBothSideEffects.changes, ["create"],
    "Der neue Kontakt muss genau den create-Änderungseintrag erhalten.");
  assert.equal(patchCreateBothSideEffects.activities.filter((eventKey) => eventKey === "contact.created").length, 1,
    "Der neue Kontakt muss genau ein contact.created-Aktivitätsereignis erhalten.");
  assert.deepEqual(patchCreateBothSideEffects.notificationRecipientIds, [foreignEhcOwnerProfileId],
    "Die Kontaktanlage per PATCH muss den neuen Owner benachrichtigen.");

  const patchRollbackSourceId = "synthetic-nested-patch-rollback-source";
  const patchRollbackDuplicateId = "synthetic-nested-patch-rollback-duplicate";
  const patchRollbackScheduledOn = "2099-03-02";
  const patchRollbackContactName = "Dr. PATCH Rollback Kontakt";
  const patchRollbackOrganizationName = "PATCH Rollback Praxis";
  await seedScheduledHospitation(pool, {
    id: patchRollbackSourceId,
    contactId: canonicalContact.id,
    contactName: canonicalContact.name,
    organizationName: canonicalContact.organization,
    scheduledOn: patchRollbackScheduledOn,
    ownerId: ownerProfileId
  });
  await seedScheduledHospitation(pool, {
    id: patchRollbackDuplicateId,
    contactName: "PATCH Rollback Kontakt",
    organizationName: patchRollbackOrganizationName,
    scheduledOn: patchRollbackScheduledOn,
    ownerId: ownerProfileId
  });
  const patchRollbackCounts = await nestedDomainCounts(pool);
  const patchRollbackResult = await patchJson(
    baseUrl,
    `/api/hospitations/${encodeURIComponent(patchRollbackSourceId)}`,
    {
      contact: { mode: "create", name: patchRollbackContactName },
      organization: { mode: "create", name: patchRollbackOrganizationName },
      scheduledOn: patchRollbackScheduledOn
    }
  );
  assertDuplicateConflict(patchRollbackResult, {
    code: "HOSPITATION_DUPLICATE",
    duplicateId: patchRollbackDuplicateId,
    label: "nachgelagerter Hospitations-Dublettenkonflikt im create-both-PATCH"
  });
  assert.deepEqual(await nestedDomainCounts(pool), patchRollbackCounts,
    "Der nachgelagerte Hospitationskonflikt muss Kontakt, Organisation, Junction, Änderungen, Aktivitäten und Notifications zurückrollen.");
  assert.equal((await contactRowsByNormalizedName(pool, patchRollbackContactName)).length, 0,
    "Der innerhalb des gescheiterten PATCH erzeugte Kontakt muss zurückgerollt werden.");
  assert.equal((await organizationRowsByNormalizedName(pool, patchRollbackOrganizationName)).length, 0,
    "Die innerhalb des gescheiterten PATCH erzeugte Organisation muss zurückgerollt werden.");
  assert.deepEqual(await hospitationRowsByIds(pool, [patchRollbackSourceId]), [{
    id: patchRollbackSourceId,
    contact_id: canonicalContact.id,
    contact_name: canonicalContact.name,
    organization_id: null,
    organization_name: canonicalContact.organization,
    scheduled_on: patchRollbackScheduledOn
  }], "Der gescheiterte PATCH muss die ursprüngliche Hospitation unverändert lassen.");
  assert.equal((await hospitationRowsByIds(pool, [patchRollbackDuplicateId])).length, 1,
    "Die kanonische Dubletten-Hospitation muss bestehen bleiben.");

  const mismatchCounts = await nestedDomainCounts(pool);
  const mismatchedOrganizationName = "Rollback Nested Praxis Falsche Zuordnung";
  const mismatchedOrganization = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-mismatched-organization",
    contact: { mode: "existing", id: canonicalContact.id },
    organization: { mode: "create", name: mismatchedOrganizationName },
    scheduledOn: "2099-02-05"
  }));
  assertHttpError(mismatchedOrganization, 400, "Kontakt mit abweichender neuer Organisation");
  assert.deepEqual(await nestedDomainCounts(pool), mismatchCounts,
    "Die abweichende Organisation und sämtliche Begleitdaten müssen vollständig zurückgerollt werden.");
  assert.equal((await organizationRowsByNormalizedName(pool, mismatchedOrganizationName)).length, 0);
  assert.equal((await hospitationRowsByIds(pool, ["synthetic-nested-mismatched-organization"])).length, 0);

  const ambiguousOrganizations = await seedAmbiguousNestedOrganizations(pool);
  assert.equal((await organizationRowsByNormalizedName(pool, ambiguousOrganizations.name)).length, 2);
  const ambiguousOrganizationCounts = await nestedDomainCounts(pool);
  const ambiguousOrganizationResult = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-ambiguous-organization",
    contact: { mode: "create", name: "Rollback Kontakt Mehrdeutige Organisation" },
    organization: { mode: "create", name: "  MEHRDEUTIGE   nested praxis " },
    scheduledOn: "2099-02-06"
  }));
  assertHttpError(ambiguousOrganizationResult, 409, "mehrdeutiger normalisierter Organisationsname");
  assert.deepEqual(await nestedDomainCounts(pool), ambiguousOrganizationCounts,
    "Ein Organisationskonflikt darf keinen Kontakt oder Hospitationstermin hinterlassen.");

  const ambiguousContacts = await seedAmbiguousNestedContacts(pool);
  assert.equal((await contactRowsByNormalizedName(pool, ambiguousContacts.name)).length, 2);
  const ambiguousContactCounts = await nestedDomainCounts(pool);
  const ambiguousContactResult = await postJson(baseUrl, "/api/hospitations", nestedHospitationPayload({
    id: "synthetic-nested-ambiguous-contact",
    contact: { mode: "create", name: "  MEHRDEUTIGER   nested kontakt " },
    organization: { mode: "existing", id: organizationIds.gamma },
    scheduledOn: "2099-02-07"
  }));
  assertHttpError(ambiguousContactResult, 409, "mehrdeutiger normalisierter Kontaktname");
  assert.deepEqual(await nestedDomainCounts(pool), ambiguousContactCounts,
    "Ein Kontaktkonflikt darf keine Hospitation oder Begleitdaten hinterlassen.");

  const parallelContactName = "Paralleler Nested Kontakt";
  const parallelOrganizationName = "Parallele Nested Praxis";
  const parallelInputs = [
    { id: "synthetic-nested-parallel-create-a", scheduledOn: "2099-02-08" },
    { id: "synthetic-nested-parallel-create-b", scheduledOn: "2099-02-09" }
  ];
  const parallelResults = await Promise.all(parallelInputs.map((input) => postJson(
    baseUrl,
    "/api/hospitations",
    nestedHospitationPayload({
      ...input,
      contact: { mode: "create", name: parallelContactName },
      organization: { mode: "create", name: parallelOrganizationName }
    })
  )));
  assert.ok(parallelResults.every((result) => result.status === 201),
    `Beide parallelen verschachtelten POSTs müssen erfolgreich sein: ${JSON.stringify(parallelResults)}`);
  const [parallelA, parallelB] = parallelResults.map((result) => result.payload);
  assert.equal(parallelA.contactId, parallelB.contactId, "Parallele Anlagen müssen denselben Kontakt wiederverwenden.");
  assert.equal(parallelA.organizationId, parallelB.organizationId, "Parallele Anlagen müssen dieselbe Organisation wiederverwenden.");
  assert.equal(parallelA.resolvedContact?.id, parallelA.contactId);
  assert.equal(parallelB.resolvedContact?.id, parallelA.contactId);
  assert.equal(parallelA.resolvedOrganization?.id, parallelA.organizationId);
  assert.equal(parallelB.resolvedOrganization?.id, parallelA.organizationId);
  const parallelOrganizations = await organizationRowsByNormalizedName(pool, parallelOrganizationName);
  const parallelContacts = await contactRowsByNormalizedName(pool, parallelContactName);
  assert.equal(parallelOrganizations.length, 1, "Das Parallelrennen darf nur eine Organisation erzeugen.");
  assert.equal(parallelContacts.length, 1, "Das Parallelrennen darf nur einen Kontakt erzeugen.");
  assert.equal(parallelContacts[0].organization_id, parallelOrganizations[0].id);
  assert.deepEqual(await hospitationRowsByIds(pool, parallelInputs.map((input) => input.id)), [
    {
      id: parallelInputs[0].id,
      contact_id: parallelContacts[0].id,
      contact_name: parallelContactName,
      organization_id: parallelOrganizations[0].id,
      organization_name: parallelOrganizationName,
      scheduled_on: parallelInputs[0].scheduledOn
    },
    {
      id: parallelInputs[1].id,
      contact_id: parallelContacts[0].id,
      contact_name: parallelContactName,
      organization_id: parallelOrganizations[0].id,
      organization_name: parallelOrganizationName,
      scheduled_on: parallelInputs[1].scheduledOn
    }
  ], "Beide parallelen Hospitationen müssen mit den gemeinsam wiederverwendeten Entitäten gespeichert werden.");
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
     values
       ($1, 'duplicate-guard-owner@synthetic.example.invalid', 'Synthetischer Dublettenschutz-Owner',
        'SD', 'editor', true, 'Synthetische Qualitätssicherung',
        'Ausschließlich für den isolierten globalen Dublettenschutz-E2E-Test.'),
       ($2, 'duplicate-guard-ehc-owner@synthetic.example.invalid', 'Fremder EHC-Testowner',
        'FE', 'editor', true, 'Synthetische Qualitätssicherung',
        'Ausschließlich für EHC-Sichtbarkeitsprüfungen im isolierten E2E-Test.')`,
    [ownerProfileId, foreignEhcOwnerProfileId]
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
  await assertNestedHospitationContracts(baseUrl, pool, canonicalContact);

  console.log("Globaler Dublettenschutz E2E OK: echte HTTP/API/PostgreSQL-16-Kette mit Least-Privilege-Laufzeitrolle; Kontakt- und Termindubletten sowie verschachtelte Hospitationsreferenzen bei POST/PATCH inklusive atomarem Rollback, normalisierter Wiederverwendung und Parallelrennen abgesichert.");
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
