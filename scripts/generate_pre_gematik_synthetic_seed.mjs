#!/usr/bin/env node

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const demoDataUrl = new URL("frontend/data/demo-data.js", root);
const defaultOutputUrl = new URL(
  "deploy/postgres/pre-gematik/seed.synthetic.sql",
  root
);

export const SEED_NAMESPACE = "pre-gematik-synthetic-v1";
export const EXPECTED_SYNTHETIC_SEED_COUNTS = Object.freeze({
  profiles: 3,
  organizations: 14,
  organization_primary_systems: 14,
  contacts: 36,
  contact_owners: 41,
  formats: 2,
  format_participants: 20,
  hospitations: 13,
  hospitation_observations: 39,
  observation_create_audits: 39,
  import_runs: 1,
  active_map_contacts: 36
});

const PROFILE_IDS = Object.freeze([
  "demo-profile-admin",
  "demo-profile-editor",
  "demo-profile-viewer"
]);
const PROFILE_REPLACEMENTS = Object.freeze([
  { id: PROFILE_IDS[0], email: "admin@versorgungs-kompass.example.invalid", display_name: "Demo Administration", initials: "DA", role: "admin" },
  { id: PROFILE_IDS[1], email: "redaktion@versorgungs-kompass.example.invalid", display_name: "Demo Redaktion", initials: "DR", role: "editor" },
  { id: PROFILE_IDS[2], email: "lesekonto@versorgungs-kompass.example.invalid", display_name: "Demo Lesekonto", initials: "DL", role: "viewer" }
]);

class SqlRaw {
  constructor(value) {
    this.value = value;
  }
}

function raw(value) {
  return new SqlRaw(value);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlValue(value) {
  if (value instanceof SqlRaw) return value.value;
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "Nicht-endliche Zahlen dürfen nicht in den Seed gelangen.");
    return String(value);
  }
  return sqlString(value);
}

function textArray(values) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
  return raw(`ARRAY[${normalized.map((value) => `${sqlString(value)}::text`).join(", ")}]::text[]`);
}

function jsonb(value) {
  return raw(`${sqlString(JSON.stringify(value))}::jsonb`);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function insertDoNothing(table, rows, conflictColumns) {
  assert.ok(rows.length > 0, `${table} benötigt mindestens eine Zeile.`);
  const columns = Object.keys(rows[0]);
  rows.forEach((row) => assert.deepEqual(Object.keys(row), columns, `${table} hat inkonsistente Spalten.`));
  const values = rows.map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(", ")})`).join(",\n");
  return [
    `insert into public.${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})`,
    "values",
    values,
    `on conflict (${conflictColumns.map(quoteIdent).join(", ")}) do nothing;`
  ].join("\n");
}

function sqlTextArrayLiteral(values) {
  return `ARRAY[${values.map((value) => sqlString(value)).join(", ")}]::text[]`;
}

function sqlValues(rows, columns) {
  return rows
    .map((row) => `(${columns.map((column) => sqlValue(row[column])).join(", ")})`)
    .join(",\n      ");
}

function dollarDo(tagName, body) {
  const tag = `$${tagName}$`;
  assert.ok(!body.includes(tag), `Unsicherer Dollar-Quote-Delimiter im ${tagName}-Block.`);
  return `do ${tag}\n${body}\n${tag};`;
}

function mappedProfileId(value, profileIdMap) {
  const sourceId = String(value || "").trim();
  if (!sourceId) return null;
  const mapped = profileIdMap.get(sourceId);
  assert.ok(mapped, `Unbekannte Demo-Profil-ID: ${sourceId}`);
  return mapped;
}

function seedMarkerText(value = "") {
  return [String(value || "").trim(), `[${SEED_NAMESPACE}]`].filter(Boolean).join("\n\n");
}

function observationId(value) {
  const sourceId = String(value || "").trim();
  assert.ok(sourceId, "Beobachtung ohne ID gefunden.");
  return `demo-observation-${sourceId.replace(/^obs-/, "")}`;
}

async function loadDemoData() {
  globalThis.window = globalThis;
  await import(demoDataUrl.href);
  const data = globalThis.VERSORGUNGS_COMPASS_DEMO_DATA;
  assert.ok(data && typeof data === "object", "Die synthetischen Frontend-Demodaten konnten nicht geladen werden.");
  return data;
}

function transformDemoData(data) {
  assert.equal(data.profiles.length, EXPECTED_SYNTHETIC_SEED_COUNTS.profiles);
  const profileIdMap = new Map(data.profiles.map((profile, index) => [profile.id, PROFILE_IDS[index]]));
  const seedActor = PROFILE_IDS[0];

  const profiles = data.profiles.map((source, index) => ({
    ...PROFILE_REPLACEMENTS[index],
    active: true,
    avatar_url: null,
    team: "Synthetische Qualitätssicherung",
    bio: `Rein synthetisches Profil für ${SEED_NAMESPACE}.`,
    created_at: source.created_at,
    updated_at: source.updated_at
  }));

  const organizations = data.organizations.map((source) => ({
    id: source.id,
    name: source.name,
    normalized_name: source.normalizedName,
    sector: source.sector,
    organization_type: source.organizationType,
    postal_code: source.postalCode,
    city: source.city,
    federal_state: source.state,
    latitude: source.lat,
    longitude: source.lon,
    website: `https://${source.id}.example.invalid`,
    phone: null,
    email: `${source.id}@example.invalid`,
    notes: seedMarkerText(source.notes),
    source: SEED_NAMESPACE,
    status: source.status === "archived" ? "archived" : "active",
    created_at: source.createdAt,
    created_by: seedActor,
    updated_at: source.updatedAt,
    updated_by: seedActor
  }));

  const organizationPrimarySystems = data.organizations.flatMap((organization) =>
    (organization.primarySystems || []).map((source) => ({
      id: source.id,
      organization_id: source.organizationId,
      system_type: source.systemType,
      vendor_name: source.vendorName,
      product_name: source.productName,
      source_url: `https://${SEED_NAMESPACE}.example.invalid/${source.id}`,
      created_at: source.createdAt,
      created_by: seedActor,
      updated_at: source.updatedAt,
      updated_by: seedActor
    }))
  );

  const organizationById = new Map(data.organizations.map((organization) => [organization.id, organization]));
  const contacts = data.contacts.map((source, index) => ({
    id: source.id,
    name: `Demo-Kontakt ${String(index + 1).padStart(2, "0")}`,
    organization_id: source.organizationId || null,
    organization: source.organization,
    sector: source.category,
    specialty: source.specialty,
    role: source.contactRole,
    priority: source.priority,
    owner_id: mappedProfileId(source.ownerId, profileIdMap),
    postal_code: source.postalCode,
    city: source.city,
    federal_state: source.state,
    latitude: source.lat ?? organizationById.get(source.organizationId)?.lat ?? null,
    longitude: source.lon ?? organizationById.get(source.organizationId)?.lon ?? null,
    email: `${source.id}@example.invalid`,
    phone: null,
    linkedin: null,
    mitmachen_consent_status: "not_requested",
    topics: textArray(source.themes),
    notes: seedMarkerText([source.note, source.nextStep ? `Nächster synthetischer Schritt: ${source.nextStep}` : ""].filter(Boolean).join("\n")),
    source: SEED_NAMESPACE,
    image_url: null,
    image_source_url: null,
    image_source_label: null,
    image_rights_note: null,
    image_updated_at: null,
    image_updated_by: null,
    image_storage_path: null,
    image_kind: null,
    image_mime_type: null,
    image_file_size: null,
    image_width: null,
    image_height: null,
    status: "active",
    created_at: source.createdAt,
    created_by: seedActor,
    updated_at: source.updatedAt,
    updated_by: seedActor
  }));

  const contactOwners = data.contacts.flatMap((contact) =>
    [...new Set(contact.ownerIds || [contact.ownerId].filter(Boolean))].map((sourceProfileId) => ({
      contact_id: contact.id,
      profile_id: mappedProfileId(sourceProfileId, profileIdMap),
      assigned_at: contact.createdAt,
      assigned_by: seedActor
    }))
  );

  const formats = data.formats.map((source) => ({
    id: source.id,
    title: source.title,
    format_type: source.formatType,
    starts_at: source.startsAt,
    ends_at: source.endsAt,
    location: source.location,
    goal: source.goal,
    owner_id: mappedProfileId(source.ownerId, profileIdMap),
    status: source.status,
    notes: seedMarkerText(source.notes),
    created_at: source.createdAt,
    created_by: mappedProfileId(source.createdBy, profileIdMap),
    updated_at: source.updatedAt,
    updated_by: mappedProfileId(source.updatedBy, profileIdMap)
  }));

  const formatParticipants = data.formats.flatMap((format) =>
    (format.participants || []).map((source) => ({
      id: source.id,
      format_id: source.formatId,
      contact_id: source.contactId,
      invitation_status: source.invitationStatus,
      participant_role: source.participantRole,
      notes: seedMarkerText(source.notes),
      invited_at: source.invitedAt,
      responded_at: source.respondedAt,
      participated_at: source.participatedAt,
      cancelled_at: source.cancelledAt,
      status_changed_at: source.statusChangedAt,
      created_at: source.createdAt,
      created_by: mappedProfileId(source.createdBy, profileIdMap),
      updated_at: source.updatedAt,
      updated_by: mappedProfileId(source.updatedBy, profileIdMap)
    }))
  );

  const observations = [];
  const hospitations = data.hospitations.map((source) => {
    const documentation = JSON.parse(source.documentationOutcome);
    documentation.observations = (documentation.observations || []).map((observation) => {
      const id = observationId(observation.id);
      const originalEvidenceType = observation.evidenceType || "synthetic_source_based";
      const payload = {
        ...observation,
        id,
        originalId: observation.id,
        hospitationId: source.id,
        evidenceType: "interpreted",
        originalEvidenceType,
        seedNamespace: SEED_NAMESPACE
      };
      observations.push({
        id,
        hospitation_id: source.id,
        sequence: observation.sequence,
        title: observation.title,
        situation: observation.situationContext,
        description: observation.observed,
        process_phase: observation.processPhase,
        problem_type: observation.problemType,
        impact: observation.impact,
        observation_type: null,
        evidence_type: "interpreted",
        relevance_score: null,
        usage_recommendation: null,
        involved_roles: textArray(observation.affectedRoles),
        affected_products: textArray([]),
        topics: textArray(observation.theme ? [observation.theme] : []),
        payload: jsonb(payload),
        status: "active",
        archived_at: null,
        archived_by: null,
        created_at: observation.createdAt || source.createdAt,
        created_by: seedActor,
        updated_at: observation.updatedAt || source.updatedAt,
        updated_by: seedActor
      });
      return payload;
    });
    documentation.seedNamespace = SEED_NAMESPACE;
    return {
      id: source.id,
      slot_id: source.slotId || null,
      contact_id: source.contactId || null,
      contact_name: source.contactName,
      organization_id: source.organizationId || null,
      organization_name: source.organizationName,
      requester_profile_id: mappedProfileId(source.requesterProfileId, profileIdMap),
      owner_id: mappedProfileId(source.ownerId, profileIdMap),
      status: source.status,
      requested_windows: jsonb(source.requestedWindows || []),
      starts_at: source.startsAt,
      ends_at: source.endsAt,
      location: source.location,
      city: source.city,
      federal_state: source.state,
      sector: source.sector,
      goal: source.goal,
      topics: textArray(source.topics),
      request_note: seedMarkerText(source.requestNote),
      documentation_summary: source.documentationSummary,
      documentation_outcome: JSON.stringify(documentation),
      follow_up_note: source.followUpNote,
      follow_up_owner_id: mappedProfileId(source.followUpOwnerId, profileIdMap),
      follow_up_due_at: source.followUpDueAt || null,
      documented_at: source.documentedAt,
      documented_by: mappedProfileId(source.documentedBy, profileIdMap),
      created_at: source.createdAt,
      created_by: mappedProfileId(source.createdBy, profileIdMap),
      updated_at: source.updatedAt,
      updated_by: mappedProfileId(source.updatedBy, profileIdMap)
    };
  });

  const importRuns = [{
    id: "demo-import-pre-gematik-synthetic-v1",
    file_name: "seed.synthetic.sql",
    status: "completed",
    total_rows: contacts.length,
    valid_rows: contacts.length,
    imported_contacts: contacts.length,
    skipped_rows: 0,
    error_count: 0,
    warning_count: 0,
    report: jsonb({ synthetic: true, seedNamespace: SEED_NAMESPACE, expectedCounts: EXPECTED_SYNTHETIC_SEED_COUNTS }),
    created_at: "2026-05-19T08:00:00.000Z",
    created_by: seedActor
  }];

  const result = {
    profiles,
    organizations,
    organization_primary_systems: organizationPrimarySystems,
    contacts,
    contact_owners: contactOwners,
    formats,
    format_participants: formatParticipants,
    hospitations,
    hospitation_observations: observations,
    import_runs: importRuns
  };
  for (const [table, expected] of Object.entries(EXPECTED_SYNTHETIC_SEED_COUNTS)) {
    if (table === "observation_create_audits" || table === "active_map_contacts") continue;
    assert.equal(result[table]?.length, expected, `${table}: unerwartete Seed-Zeilenzahl.`);
  }
  return result;
}

function collisionPreflight(rows) {
  const profileIds = sqlTextArrayLiteral(rows.profiles.map((row) => row.id));
  const organizationIds = sqlTextArrayLiteral(rows.organizations.map((row) => row.id));
  const contactIds = sqlTextArrayLiteral(rows.contacts.map((row) => row.id));
  const formatIds = sqlTextArrayLiteral(rows.formats.map((row) => row.id));
  const hospitationIds = sqlTextArrayLiteral(rows.hospitations.map((row) => row.id));
  const observationIds = sqlTextArrayLiteral(rows.hospitation_observations.map((row) => row.id));
  const primarySystemValues = sqlValues(rows.organization_primary_systems, ["id", "organization_id", "system_type", "vendor_name", "product_name"]);
  const participantValues = sqlValues(rows.format_participants, ["id", "format_id", "contact_id"]);
  const body = `begin
  if exists (
    select 1 from public.profiles
     where id = any(${profileIds})
       and (
         email not like '%@versorgungs-kompass.example.invalid'
         or position(${sqlString(SEED_NAMESPACE)} in coalesce(bio, '')) = 0
       )
  ) then
    raise exception 'Synthetic seed profile ID collides with a non-seed profile.';
  end if;
  if exists (select 1 from public.organizations where id = any(${organizationIds}) and source is distinct from ${sqlString(SEED_NAMESPACE)}) then
    raise exception 'Synthetic seed organization ID collides with a non-seed organization.';
  end if;
  if exists (
    select 1
      from public.organization_primary_systems actual
      join (values
      ${primarySystemValues}
      ) expected(id, organization_id, system_type, vendor_name, product_name)
        on expected.id = actual.id
     where actual.organization_id is distinct from expected.organization_id
        or actual.system_type is distinct from expected.system_type
        or actual.vendor_name is distinct from expected.vendor_name
        or actual.product_name is distinct from expected.product_name
        or actual.source_url not like ${sqlString(`https://${SEED_NAMESPACE}.example.invalid/%`)}
  ) then
    raise exception 'Synthetic seed primary-system ID collides with a non-seed primary system.';
  end if;
  if exists (select 1 from public.contacts where id = any(${contactIds}) and source is distinct from ${sqlString(SEED_NAMESPACE)}) then
    raise exception 'Synthetic seed contact ID collides with a non-seed contact.';
  end if;
  if exists (select 1 from public.formats where id = any(${formatIds}) and position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(notes, '')) = 0) then
    raise exception 'Synthetic seed format ID collides with a non-seed format.';
  end if;
  if exists (
    select 1
      from public.format_participants actual
      join (values
      ${participantValues}
      ) expected(id, format_id, contact_id)
        on expected.id = actual.id
     where actual.format_id is distinct from expected.format_id
        or actual.contact_id is distinct from expected.contact_id
        or position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(actual.notes, '')) = 0
  ) then
    raise exception 'Synthetic seed format-participant ID collides with a non-seed participant.';
  end if;
  if exists (select 1 from public.hospitations where id = any(${hospitationIds}) and position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(request_note, '')) = 0) then
    raise exception 'Synthetic seed hospitation ID collides with a non-seed hospitation.';
  end if;
  if exists (
    select 1 from public.hospitation_observations
     where id = any(${observationIds})
       and payload ->> 'seedNamespace' is distinct from ${sqlString(SEED_NAMESPACE)}
  ) then
    raise exception 'Synthetic seed observation ID collides with a non-seed observation.';
  end if;
  if exists (
    select 1 from public.import_runs
     where id = 'demo-import-pre-gematik-synthetic-v1'
       and report ->> 'seedNamespace' is distinct from ${sqlString(SEED_NAMESPACE)}
  ) then
    raise exception 'Synthetic seed import marker collides with a non-seed import run.';
  end if;
end
`;
  return dollarDo("seed_preflight", body);
}

function verificationBlock(rows) {
  const profileIds = sqlTextArrayLiteral(rows.profiles.map((row) => row.id));
  const organizationIds = sqlTextArrayLiteral(rows.organizations.map((row) => row.id));
  const contactIds = sqlTextArrayLiteral(rows.contacts.map((row) => row.id));
  const formatIds = sqlTextArrayLiteral(rows.formats.map((row) => row.id));
  const hospitationIds = sqlTextArrayLiteral(rows.hospitations.map((row) => row.id));
  const observationIds = sqlTextArrayLiteral(rows.hospitation_observations.map((row) => row.id));
  const primarySystemValues = sqlValues(rows.organization_primary_systems, ["id", "organization_id", "system_type", "vendor_name", "product_name"]);
  const contactOwnerValues = sqlValues(rows.contact_owners, ["contact_id", "profile_id"]);
  const participantValues = sqlValues(rows.format_participants, ["id", "format_id", "contact_id"]);
  const body = `declare
  actual integer;
begin
  select count(*) into actual from public.profiles
   where id = any(${profileIds})
     and email like '%@versorgungs-kompass.example.invalid'
     and position(${sqlString(SEED_NAMESPACE)} in coalesce(bio, '')) > 0;
  if actual <> ${rows.profiles.length} then raise exception 'Synthetic profile verification failed: %', actual; end if;
  select count(*) into actual from public.organizations where id = any(${organizationIds}) and source = ${sqlString(SEED_NAMESPACE)};
  if actual <> ${rows.organizations.length} then raise exception 'Synthetic organization verification failed: %', actual; end if;
  select count(*) into actual
    from public.organization_primary_systems actual
    join (values
    ${primarySystemValues}
    ) expected(id, organization_id, system_type, vendor_name, product_name)
      on expected.id = actual.id
     and expected.organization_id = actual.organization_id
     and expected.system_type = actual.system_type
     and expected.vendor_name = actual.vendor_name
     and expected.product_name = actual.product_name
   where actual.source_url like ${sqlString(`https://${SEED_NAMESPACE}.example.invalid/%`)};
  if actual <> ${rows.organization_primary_systems.length} then raise exception 'Synthetic primary-system verification failed: %', actual; end if;
  select count(*) into actual from public.contacts where id = any(${contactIds}) and source = ${sqlString(SEED_NAMESPACE)} and status = 'active';
  if actual <> ${rows.contacts.length} then raise exception 'Synthetic active-contact verification failed: %', actual; end if;
  select count(*) into actual
    from public.contact_owners actual
    join (values
    ${contactOwnerValues}
    ) expected(contact_id, profile_id)
      on expected.contact_id = actual.contact_id
     and expected.profile_id = actual.profile_id;
  if actual <> ${rows.contact_owners.length} then raise exception 'Synthetic contact-owner verification failed: %', actual; end if;
  select count(*) into actual from public.formats
   where id = any(${formatIds})
     and position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(notes, '')) > 0;
  if actual <> ${rows.formats.length} then raise exception 'Synthetic format verification failed: %', actual; end if;
  select count(*) into actual
    from public.format_participants actual
    join (values
    ${participantValues}
    ) expected(id, format_id, contact_id)
      on expected.id = actual.id
     and expected.format_id = actual.format_id
     and expected.contact_id = actual.contact_id
   where position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(actual.notes, '')) > 0;
  if actual <> ${rows.format_participants.length} then raise exception 'Synthetic format-participant verification failed: %', actual; end if;
  select count(*) into actual from public.hospitations
   where id = any(${hospitationIds})
     and position(${sqlString(`[${SEED_NAMESPACE}]`)} in coalesce(request_note, '')) > 0;
  if actual <> ${rows.hospitations.length} then raise exception 'Synthetic hospitation verification failed: %', actual; end if;
  select count(*) into actual from public.hospitation_observations
   where id = any(${observationIds})
     and status = 'active'
     and payload ->> 'seedNamespace' = ${sqlString(SEED_NAMESPACE)};
  if actual <> ${rows.hospitation_observations.length} then raise exception 'Synthetic observation verification failed: %', actual; end if;
  select count(*) into actual from public.hospitation_observation_changes where observation_id = any(${observationIds}) and action = 'create';
  if actual <> ${rows.hospitation_observations.length} then raise exception 'Synthetic observation-audit verification failed: %', actual; end if;
  select count(*) into actual
    from public.contacts contact
   where contact.id = any(${contactIds})
     and contact.status = 'active'
     and contact.latitude is not null
     and contact.longitude is not null
     and contact.latitude <> 0
     and contact.longitude <> 0;
  if actual <> ${rows.contacts.length} then raise exception 'Synthetic map-contact verification failed: %', actual; end if;
  if not exists (
    select 1 from public.import_runs
     where id = 'demo-import-pre-gematik-synthetic-v1'
       and report ->> 'seedNamespace' = ${sqlString(SEED_NAMESPACE)}
  ) then
    raise exception 'Synthetic import marker verification failed.';
  end if;
end
`;
  return dollarDo("seed_verify", body);
}

export async function buildPreGematikSyntheticSeed() {
  const rows = transformDemoData(await loadDemoData());
  const statements = [
    insertDoNothing("profiles", rows.profiles, ["id"]),
    insertDoNothing("organizations", rows.organizations, ["id"]),
    insertDoNothing("organization_primary_systems", rows.organization_primary_systems, ["id"]),
    insertDoNothing("contacts", rows.contacts, ["id"]),
    insertDoNothing("contact_owners", rows.contact_owners, ["contact_id", "profile_id"]),
    insertDoNothing("formats", rows.formats, ["id"]),
    insertDoNothing("format_participants", rows.format_participants, ["id"]),
    insertDoNothing("hospitations", rows.hospitations, ["id"]),
    insertDoNothing("hospitation_observations", rows.hospitation_observations, ["id"]),
    insertDoNothing("import_runs", rows.import_runs, ["id"])
  ];
  const sql = [
    "-- Generated by scripts/generate_pre_gematik_synthetic_seed.mjs.",
    `-- Namespace: ${SEED_NAMESPACE}. This artifact contains synthetic test data only.`,
    "-- Rebuild with: npm run generate:pre-gematik-seed",
    "",
    "begin;",
    "set local lock_timeout = '5s';",
    "set local statement_timeout = '120s';",
    `select pg_advisory_xact_lock(hashtext(${sqlString(`versorgungs-kompass:${SEED_NAMESPACE}`)}));`,
    "",
    collisionPreflight(rows),
    "",
    ...statements.flatMap((statement) => [statement, ""]),
    verificationBlock(rows),
    "",
    "commit;",
    ""
  ].join("\n");
  assert.doesNotMatch(sql, /^\s*(?:truncate|delete|drop|alter|create)\b/im, "Der synthetische Seed darf keine destruktiven oder DDL-Anweisungen enthalten.");
  assert.doesNotMatch(sql, /supabase\.co|storage\/v1|profile-images|contact-images/i, "Der synthetische Seed darf keine Supabase-/Bildreferenzen enthalten.");
  return { sql, rows };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const outputPath = process.argv[2]
    ? resolve(process.argv[2])
    : fileURLToPath(defaultOutputUrl);
  const { sql, rows } = await buildPreGematikSyntheticSeed();
  writeFileSync(outputPath, sql, "utf8");
  const summary = Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length]));
  console.log(JSON.stringify({ outputPath, seedNamespace: SEED_NAMESPACE, summary }, null, 2));
}
