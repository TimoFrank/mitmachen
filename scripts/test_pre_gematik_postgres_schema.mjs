import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Pool } from "pg";
import {
  buildPreGematikSyntheticSeed,
  EXPECTED_SYNTHETIC_SEED_COUNTS,
  SEED_NAMESPACE
} from "./generate_pre_gematik_synthetic_seed.mjs";

const root = new URL("../", import.meta.url);
const schemaUrl = new URL("deploy/postgres/pre-gematik/schema.sql", root);
const runtimeRoleUrl = new URL("deploy/postgres/pre-gematik/runtime-role.sql", root);
const grantsUrl = new URL("deploy/postgres/pre-gematik/grants.sql", root);
const seedUrl = new URL("deploy/postgres/pre-gematik/seed.example.sql", root);
const syntheticSeedUrl = new URL("deploy/postgres/pre-gematik/seed.synthetic.sql", root);
const syntheticProfileAvatarsUrl = new URL(
  "deploy/postgres/pre-gematik/seed.synthetic-profile-avatars.sql",
  root
);
const apiUrl = new URL("api/server.mjs", root);
const schemaSql = readFileSync(schemaUrl, "utf8");
const runtimeRoleSql = readFileSync(runtimeRoleUrl, "utf8");
const grantsSql = readFileSync(grantsUrl, "utf8");
const seedSql = readFileSync(seedUrl, "utf8");
const syntheticSeedSql = readFileSync(syntheticSeedUrl, "utf8");
const syntheticProfileAvatarsSql = readFileSync(syntheticProfileAvatarsUrl, "utf8");
const apiSource = readFileSync(apiUrl, "utf8");

const EXPECTED_SYNTHETIC_PROFILE_AVATARS = Object.freeze({
  "demo-profile-admin": "/public/demo-profile-admin.svg",
  "demo-profile-editor": "/public/demo-profile-editor.svg",
  "demo-profile-viewer": "/public/demo-profile-viewer.svg"
});
const SYNTHETIC_PROFILE_IDS = Object.freeze(Object.keys(EXPECTED_SYNTHETIC_PROFILE_AVATARS));

const generatedSyntheticSeed = await buildPreGematikSyntheticSeed();
assert.equal(syntheticSeedSql, generatedSyntheticSeed.sql, "seed.synthetic.sql ist nicht aus dem aktuellen Generatorstand erzeugt.");
assert.doesNotMatch(syntheticSeedSql, /^\s*(?:truncate|delete|drop|alter|create)\b/im,
  "Der synthetische Seed darf keine destruktiven oder DDL-Anweisungen enthalten.");
assert.doesNotMatch(syntheticSeedSql, /supabase\.co|storage\/v1|profile-images|contact-images/i,
  "Der synthetische Seed darf keine Supabase-/Bildreferenzen enthalten.");
assert.match(syntheticSeedSql, /pg_advisory_xact_lock/i);
assert.match(syntheticSeedSql, /on conflict \("id"\) do nothing/i);

assert.doesNotMatch(syntheticProfileAvatarsSql, /^\s*(?:truncate|delete|drop|alter|create)\b/im,
  "Der synthetische Avatar-Patch darf keine destruktiven oder DDL-Anweisungen enthalten.");
assert.doesNotMatch(syntheticProfileAvatarsSql, /(?:https?|gs|data|blob):|supabase\.co|storage\/v1/i,
  "Der synthetische Avatar-Patch darf nur lokale, gleichurspr\u00fcngliche Bildpfade verwenden.");
assert.match(syntheticProfileAvatarsSql, /pg_advisory_xact_lock/i);
assert.match(syntheticProfileAvatarsSql, /profile\.avatar_url\s+is\s+null/i,
  "Der Avatar-Patch darf bestehende Profilbilder nicht \u00fcberschreiben.");
for (const [profileId, avatarUrl] of Object.entries(EXPECTED_SYNTHETIC_PROFILE_AVATARS)) {
  assert.ok(syntheticProfileAvatarsSql.includes(`('${profileId}', '${avatarUrl}')`),
    `Der Avatar-Patch muss die exakte Zuordnung f\u00fcr ${profileId} enthalten.`);
}

const fieldConstantNames = [
  "CONTACT_FIELDS",
  "ORGANIZATION_FIELDS",
  "ORGANIZATION_PRIMARY_SYSTEM_FIELDS",
  "PROFILE_FIELDS",
  "CHANGE_FIELDS",
  "ACTIVITY_EVENT_FIELDS",
  "CONTACT_NOTE_FIELDS",
  "CONTACT_NOTE_ATTACHMENT_FIELDS",
  "CONTACT_OWNER_FIELDS",
  "SAVED_VIEW_FIELDS",
  "USER_SETTINGS_FIELDS",
  "FORMAT_FIELDS",
  "FORMAT_PARTICIPANT_FIELDS",
  "HOSPITATION_SLOT_FIELDS",
  "HOSPITATION_FIELDS",
  "HOSPITATION_OBSERVATION_FIELDS",
  "ROADMAP_ITEM_FIELDS",
  "HOSPITATION_ROADMAP_ASSESSMENT_FIELDS",
  "HOSPITATION_UNMET_NEED_FIELDS",
  "EXPERT_GROUP_FIELDS",
  "EXPERT_CONTACT_FIELDS",
  "EXPERT_ORGANIZATION_FIELDS",
  "EXPERT_ENTITY_LINK_FIELDS",
  "STAKEHOLDER_TYPE_FIELDS",
  "STAKEHOLDER_ORGANIZATION_FIELDS",
  "STAKEHOLDER_PEOPLE_FIELDS"
];

function arrayConstantSource(name) {
  const start = apiSource.indexOf(`const ${name} = [`);
  assert.ok(start >= 0, `API-Feldkonstante fehlt: ${name}`);
  const end = apiSource.indexOf("];", start);
  assert.ok(end > start, `API-Feldkonstante ist nicht abgeschlossen: ${name}`);
  return apiSource.slice(start, end + 2);
}

const apiFieldSandbox = {};
vm.runInNewContext([
  ...fieldConstantNames.map(arrayConstantSource),
  ...fieldConstantNames.map((name) => `globalThis.${name}ForContract = ${name};`)
].join("\n"), apiFieldSandbox, { filename: "api-field-contract.js" });

const tableFieldsStart = apiSource.indexOf("const TABLE_FIELDS = new Map(");
const tableFieldsClosing = apiSource.indexOf("\n}));", tableFieldsStart);
assert.ok(tableFieldsStart >= 0 && tableFieldsClosing > tableFieldsStart, "TABLE_FIELDS wurde in der API nicht gefunden.");
const tableFieldContext = Object.fromEntries(fieldConstantNames.map((name) => [name, apiFieldSandbox[`${name}ForContract`]]));
vm.runInNewContext([
  apiSource.slice(tableFieldsStart, tableFieldsClosing + 5),
  "globalThis.apiTableFieldsForContract = Object.fromEntries(TABLE_FIELDS);"
].join("\n"), tableFieldContext, { filename: "api-table-contract.js" });
const apiTableFields = JSON.parse(JSON.stringify(tableFieldContext.apiTableFieldsForContract));

const supplementalContract = {
  identity_bindings: [
    "issuer", "subject", "profile_id", "active", "created_at", "updated_at"
  ],
  import_runs: [
    "id", "file_name", "status", "total_rows", "valid_rows", "imported_contacts",
    "skipped_rows", "error_count", "warning_count", "report", "created_at", "created_by"
  ],
  hospitation_observation_changes: [
    "id", "observation_id", "hospitation_id", "action", "before_value", "after_value", "changed_at", "changed_by"
  ]
};

function tableBody(table) {
  const marker = `create table if not exists public.${table}`;
  const start = schemaSql.toLowerCase().indexOf(marker);
  assert.ok(start >= 0, `DDL-Tabelle fehlt: ${table}`);
  const open = schemaSql.indexOf("(", start + marker.length);
  assert.ok(open >= 0, `DDL-Tabelle hat keine Spaltendefinition: ${table}`);
  let depth = 1;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = open + 1; index < schemaSql.length; index += 1) {
    const character = schemaSql[index];
    const next = schemaSql[index + 1];
    if (singleQuoted) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === '"') doubleQuoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return schemaSql.slice(open + 1, index);
    }
  }
  throw new Error(`DDL-Tabelle ist nicht abgeschlossen: ${table}`);
}

function splitTopLevel(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    const next = body[index + 1];
    if (singleQuoted) {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "'") singleQuoted = true;
    else if (character === '"') doubleQuoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts.filter(Boolean);
}

function tableColumns(table) {
  const ignored = new Set(["constraint", "primary", "foreign", "unique", "check", "exclude"]);
  const columns = new Map();
  for (const definition of splitTopLevel(tableBody(table))) {
    const match = /^"([^"]+)"\s+|^([a-z_][a-z0-9_]*)\s+/i.exec(definition);
    if (!match) continue;
    const name = match[1] || match[2];
    if (ignored.has(name.toLowerCase())) continue;
    columns.set(name, definition);
  }
  return columns;
}

for (const [table, fields] of Object.entries({ ...apiTableFields, ...supplementalContract })) {
  const columns = tableColumns(table);
  for (const field of fields) {
    assert.ok(columns.has(field), `${table}.${field} wird von der API benötigt, fehlt aber im Pre-Integrations-DDL.`);
  }
}

for (const [table, fields] of Object.entries({
  contacts: ["contact_search_vector"],
  contact_notes: ["search_vector"],
  contact_note_attachments: ["search_vector"]
})) {
  const columns = tableColumns(table);
  fields.forEach((field) => assert.ok(columns.has(field), `${table}.${field} fehlt für die API-Volltextsuche.`));
}

const textIdTables = [
  "profiles", "organizations", "contacts", "organization_primary_systems", "import_runs", "saved_views",
  "formats", "format_participants", "hospitation_slots", "hospitations", "hospitation_observations",
  "roadmap_items", "hospitation_roadmap_assessments", "hospitation_unmet_needs", "expert_groups",
  "expert_organizations", "expert_contacts", "expert_entity_links", "stakeholder_types",
  "stakeholder_organizations", "stakeholder_people", "notification_events"
];
for (const table of textIdTables) {
  assert.match(tableColumns(table).get("id"), /^id\s+text\b/i, `${table}.id muss zum Präfix-/SSO-Vertrag der API passen.`);
}
assert.match(tableColumns("contact_notes").get("id"), /^id\s+uuid\b/i);
assert.match(tableColumns("contact_note_attachments").get("id"), /^id\s+uuid\b/i);
assert.match(tableColumns("contact_note_attachments").get("note_id"), /^note_id\s+uuid\b/i);

assert.doesNotMatch(schemaSql, /\bauth\.|\bstorage\.|\bservice_role\b|\bauthenticated\b|\banon\b|enable\s+row\s+level\s+security|create\s+policy|\bgrant\s+/i,
  "Das Pre-Integrationsschema darf keine Supabase-Auth-/Storage-/RLS-/Rollenobjekte enthalten.");
assert.match(schemaSql, /kein freigegebenes gematik-zielschema/i);
assert.match(schemaSql, /create table if not exists public\.import_runs/i);
assert.match(schemaSql, /create table if not exists public\.hospitation_observation_changes/i);
assert.match(schemaSql, /drop trigger if exists hospitation_observations_pre_gematik_log_change/i);
assert.match(runtimeRoleSql, /create\s+role\s+vk_app_runtime\s+nologin/i);
assert.match(runtimeRoleSql, /alter\s+role\s+vk_app_runtime\s+nologin/i);
assert.match(runtimeRoleSql, /revoke\s+create\s+on\s+schema\s+public\s+from\s+public/i);
assert.match(grantsSql, /\\if\s+:\{\?runtime_role\}/);
assert.match(grantsSql, /to\s+:"runtime_role"/i);
assert.match(grantsSql, /rolcanlogin/i);
assert.doesNotMatch(grantsSql, /\bgrant\s+(?:all|create|alter|drop|truncate|references|trigger)\b|alter\s+default\s+privileges/i,
  "App-User darf ausschließlich die dokumentierten Laufzeitrechte erhalten.");
for (const table of Object.keys({ ...apiTableFields, ...supplementalContract })) {
  assert.match(grantsSql, new RegExp(`public\\.${table}\\b`, "i"), `grants.sql vergisst die API-Tabelle ${table}.`);
}

console.log(`Static contract OK: ${Object.keys(apiTableFields).length} API tables plus Ops-/Audit tables match the PostgreSQL DDL.`);

function runDocker(args, { quiet = false, input } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", input, stdio: quiet ? "ignore" : "pipe" });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result.stdout?.trim() || "";
}

function dockerIsAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

async function waitForPostgres(pool) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`PostgreSQL wurde nicht rechtzeitig bereit: ${lastError?.message || "unbekannter Fehler"}`);
}

async function assertDatabaseColumns(pool) {
  const result = await pool.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'`
  );
  const actual = new Map();
  result.rows.forEach(({ table_name: table, column_name: column }) => {
    if (!actual.has(table)) actual.set(table, new Set());
    actual.get(table).add(column);
  });
  for (const [table, fields] of Object.entries({ ...apiTableFields, ...supplementalContract })) {
    assert.ok(actual.has(table), `PostgreSQL-Tabelle fehlt nach Bootstrap: ${table}`);
    fields.forEach((field) => assert.ok(actual.get(table).has(field), `PostgreSQL-Spalte fehlt nach Bootstrap: ${table}.${field}`));
  }
}

async function databaseSmoke(pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`
      insert into profiles (id, email, display_name, initials, role)
      values ('contract-editor', 'editor@example.invalid', 'Contract Editor', 'CE', 'editor')
    `);
    await client.query(`
      insert into organizations (id, name, normalized_name, sector, created_by, updated_by)
      values ('organization-contract', 'Synthetische Testorganisation', 'synthetische testorganisation', 'Praxis', 'pre-gematik-admin', 'pre-gematik-admin')
    `);
    const system = await client.query(`
      insert into organization_primary_systems (organization_id, system_type, vendor_name, product_name, created_by, updated_by)
      values ('organization-contract', 'PVS', 'Testhersteller', 'Testprodukt', 'pre-gematik-admin', 'pre-gematik-admin')
      returning id
    `);
    assert.ok(system.rows[0].id);
    await client.query(`
      insert into contacts (
        id, name, organization_id, organization, sector, owner_id, topics, status, created_by, updated_by
      ) values (
        'contact-contract', 'Synthetischer Kontakt', 'organization-contract', 'Synthetische Testorganisation',
        'Praxis', 'contract-editor', array['Pre-Integration'], 'active', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into contact_owners (contact_id, profile_id, assigned_by)
      values ('contact-contract', 'contract-editor', 'pre-gematik-admin')
    `);
    const event = await client.query(`
      insert into activity_events (
        event_key, category, action, entity_type, entity_id, contact_id, actor_id, origin_type, "references", changes, metadata
      ) values (
        'contact.created', 'master_data', 'created', 'contact', 'contact-contract', 'contact-contract',
        'pre-gematik-admin', 'system', '[{"type":"contact","id":"contact-contract"}]'::jsonb,
        '{}'::jsonb, '{"contractTest":true}'::jsonb
      ) returning id
    `);
    await client.query(`
      insert into changes (contact_id, action, new_value, changed_by, activity_event_id, canonicalized_at)
      values ('contact-contract', 'create', 'Synthetischer Kontakt', 'pre-gematik-admin', $1, now())
    `, [event.rows[0].id]);
    await client.query(`
      insert into import_runs (id, file_name, status, total_rows, valid_rows, imported_contacts, created_by)
      values ('import-contract', 'synthetic.csv', 'completed', 1, 1, 1, 'pre-gematik-admin')
    `);
    const noteId = "00000000-0000-4000-8000-000000000001";
    const attachmentId = "00000000-0000-4000-8000-000000000002";
    await client.query(`
      insert into contact_notes (id, contact_id, content_type, body, created_by, updated_by)
      values ($1, 'contact-contract', 'free_note', 'Synthetische Pre-Integration Notiz', 'pre-gematik-admin', 'pre-gematik-admin')
    `, [noteId]);
    await client.query(`
      insert into contact_note_attachments (
        id, contact_id, note_id, file_name, storage_path, mime_type, file_size,
        extraction_status, extracted_text, uploader_id
      ) values (
        $1, 'contact-contract', $2, 'test.txt', 'contract/test.txt', 'text/plain', 20,
        'complete', 'Synthetischer extrahierter Text', 'pre-gematik-admin'
      )
    `, [attachmentId, noteId]);
    await client.query(`
      insert into saved_views (id, owner_id, name, view_type, is_default)
      values ('saved-view-contract', 'pre-gematik-admin', 'Contract View', 'contacts', true)
    `);
    await client.query(`
      insert into user_settings (user_id, default_view_id)
      values ('pre-gematik-admin', 'saved-view-contract')
    `);
    await client.query(`
      insert into formats (id, title, owner_id, created_by, updated_by)
      values ('format-contract', 'Synthetisches Format', 'pre-gematik-admin', 'pre-gematik-admin', 'pre-gematik-admin')
    `);
    await client.query(`
      insert into format_participants (format_id, contact_id, created_by, updated_by)
      values ('format-contract', 'contact-contract', 'pre-gematik-admin', 'pre-gematik-admin')
    `);
    await client.query(`
      insert into hospitation_slots (
        id, contact_id, organization_id, starts_at, owner_id, created_by, updated_by
      ) values (
        'hospitation-slot-contract', 'contact-contract', 'organization-contract', now() + interval '1 day',
        'pre-gematik-admin', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into hospitations (
        id, slot_id, contact_id, organization_id, requester_profile_id, owner_id, created_by, updated_by
      ) values (
        'hospitation-contract', 'hospitation-slot-contract', 'contact-contract', 'organization-contract',
        'pre-gematik-admin', 'pre-gematik-admin', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into hospitation_observations (
        id, hospitation_id, sequence, title, evidence_type, payload, created_by, updated_by
      ) values (
        'observation-contract', 'hospitation-contract', 1, 'Synthetische Beobachtung', 'directly_observed',
        '{"synthetic":true}'::jsonb, 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      update hospitation_observations
         set status = 'archived', archived_at = now(), archived_by = 'pre-gematik-admin', updated_by = 'pre-gematik-admin'
       where id = 'observation-contract'
    `);
    await client.query(`
      insert into roadmap_items (
        id, slug, product_area, product_name, feature_name, created_by, updated_by
      ) values (
        'roadmap-contract', 'contract-item', 'Test', 'Testprodukt', 'Testfunktion', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into hospitation_roadmap_assessments (
        hospitation_id, roadmap_item_id, care_relevance, comparison_role, created_by, updated_by
      ) values (
        'hospitation-contract', 'roadmap-contract', 4, 'top_priority', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into hospitation_unmet_needs (
        hospitation_id, related_roadmap_item_id, title, urgency, created_by, updated_by
      ) values (
        'hospitation-contract', 'roadmap-contract', 'Synthetischer Bedarf', 5, 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into expert_groups (id, name) values ('expert-group-contract', 'Synthetische Expertengruppe')
    `);
    await client.query(`
      insert into expert_organizations (id, name, normalized_name, group_id)
      values ('expert-org-contract', 'Synthetische Expertenorganisation', 'synthetische expertenorganisation', 'expert-group-contract')
    `);
    await client.query(`
      insert into expert_contacts (id, name, organization_id, group_id, group_name, owner_id, owner_ids)
      values (
        'expert-contact-contract', 'Synthetischer Experte', 'expert-org-contract', 'expert-group-contract',
        'Synthetische Expertengruppe', 'pre-gematik-admin', array['pre-gematik-admin']
      )
    `);
    await client.query(`
      insert into expert_entity_links (link_type, contact_id, expert_contact_id, created_by, updated_by)
      values ('contact', 'contact-contract', 'expert-contact-contract', 'pre-gematik-admin', 'pre-gematik-admin')
    `);
    await client.query(`
      insert into stakeholder_types (id, label) values ('stakeholder-type-contract', 'Synthetischer Typ')
    `);
    await client.query(`
      insert into stakeholder_organizations (id, stakeholder_type_id, name, normalized_name)
      values ('stakeholder-org-contract', 'stakeholder-type-contract', 'Synthetischer Stakeholder', 'synthetischer stakeholder')
    `);
    await client.query(`
      insert into stakeholder_people (id, stakeholder_type_id, organization_id, name, topics)
      values (
        'stakeholder-person-contract', 'stakeholder-type-contract', 'stakeholder-org-contract',
        'Synthetische Person', array['Pre-Integration']
      )
    `);
    await client.query(`
      insert into notification_events (id, event_type, entity_type, entity_id, actor_id, title)
      values (
        'notification-event-contract', 'contract_test', 'contact', 'contact-contract',
        'pre-gematik-admin', 'Synthetische Benachrichtigung'
      )
    `);
    await client.query(`
      insert into notification_recipients (event_id, user_id)
      values ('notification-event-contract', 'contract-editor')
    `);

    const search = await client.query(`
      with search_query as (select websearch_to_tsquery('german', 'synthetisch') as query)
      select count(*)::int as count from (
        select c.id as contact_id, null::uuid as note_id, null::uuid as attachment_id
          from contacts c cross join search_query q where c.contact_search_vector @@ q.query
        union all
        select n.contact_id, n.id, null::uuid
          from contact_notes n cross join search_query q where n.search_vector @@ q.query
        union all
        select a.contact_id, a.note_id, a.id
          from contact_note_attachments a cross join search_query q where a.search_vector @@ q.query
      ) as matches
    `);
    assert.ok(search.rows[0].count >= 3, "Volltextsuche muss Kontakt, Notiz und Anhang finden.");

    const observationAudit = await client.query(`
      select action from hospitation_observation_changes
       where observation_id = 'observation-contract'
       order by id
    `);
    assert.deepEqual(observationAudit.rows.map((row) => row.action), ["create", "archive"]);

    const populatedTables = [
      ...Object.keys(apiTableFields),
      "import_runs",
      "hospitation_observation_changes"
    ];
    for (const table of populatedTables) {
      const count = await client.query(`select count(*)::int as count from "${table}"`);
      assert.ok(count.rows[0].count > 0, `DB-Smoke hat ${table} nicht abgedeckt.`);
    }
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

async function assertAppUserCannotCreate(pool) {
  const client = await pool.connect();
  let denied = false;
  try {
    await client.query("begin");
    try {
      await client.query("create table public.pre_gematik_ddl_must_be_denied (id integer)");
    } catch (error) {
      denied = error.code === "42501";
    }
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
  assert.equal(denied, true, "Der App-User darf keine Tabellen im public-Schema anlegen.");
}

async function assertRuntimeRoleContract(adminPool, appPool, runtimeRole, appUser) {
  const runtimeState = await adminPool.query(`
    select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_catalog.pg_roles
     where rolname = $1
  `, [runtimeRole]);
  assert.equal(runtimeState.rowCount, 1, "Die PostgreSQL-Laufzeitrolle fehlt.");
  assert.deepEqual(runtimeState.rows[0], {
    rolcanlogin: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false
  }, "Die Laufzeitrolle muss NOLOGIN und frei von Verwaltungsattributen sein.");

  const memberships = await adminPool.query(`
    select granted_role.rolname as granted_role
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where member_role.rolname = $1
     order by granted_role.rolname
  `, [appUser]);
  assert.deepEqual(
    memberships.rows.map((row) => row.granted_role),
    [runtimeRole],
    "Der App-Login darf nur Mitglied der benutzerdefinierten Laufzeitrolle sein."
  );

  const effective = await appPool.query(`
    select
      current_user = $2 as expected_login,
      pg_has_role(current_user, $1, 'MEMBER') as runtime_member,
      has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
      has_schema_privilege(current_user, 'public', 'CREATE') as schema_create,
      has_table_privilege(current_user, 'public.profiles', 'SELECT') as table_select,
      has_table_privilege(current_user, 'public.profiles', 'INSERT') as table_insert,
      has_table_privilege(current_user, 'public.profiles', 'UPDATE') as table_update,
      has_table_privilege(current_user, 'public.profiles', 'DELETE') as table_delete,
      has_table_privilege(current_user, 'public.profiles', 'TRUNCATE') as table_truncate,
      has_table_privilege(current_user, 'public.identity_bindings', 'SELECT') as identity_binding_select,
      has_table_privilege(current_user, 'public.identity_bindings', 'INSERT') as identity_binding_insert,
      has_table_privilege(current_user, 'public.identity_bindings', 'UPDATE') as identity_binding_update,
      has_table_privilege(current_user, 'public.identity_bindings', 'DELETE') as identity_binding_delete,
      has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'USAGE') as sequence_usage,
      has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'SELECT') as sequence_select,
      has_function_privilege(current_user, 'public.pre_gematik_touch_updated_at()', 'EXECUTE') as function_execute
  `, [runtimeRole, appUser]);
  assert.deepEqual(effective.rows[0], {
    expected_login: true,
    runtime_member: true,
    schema_usage: true,
    schema_create: false,
    table_select: true,
    table_insert: true,
    table_update: true,
    table_delete: true,
    table_truncate: false,
    identity_binding_select: true,
    identity_binding_insert: false,
    identity_binding_update: false,
    identity_binding_delete: false,
    sequence_usage: true,
    sequence_select: true,
    function_execute: true
  }, "Der App-Login muss ausschließlich die effektiven Rechte der Laufzeitrolle erben.");
}

async function assertIdentityBindingBoundary(adminPool, appPool) {
  const issuer = "https://identity.contract.example.invalid";
  const subject = `contract-subject-${process.pid}`;
  await adminPool.query(
    `insert into identity_bindings (issuer, subject, profile_id, active)
     values ($1, $2, 'pre-gematik-admin', true)`,
    [issuer, subject]
  );
  try {
    const mapped = await appPool.query(
      `select binding.profile_id, profile.role
         from identity_bindings binding
         join profiles profile on profile.id = binding.profile_id
        where binding.issuer = $1 and binding.subject = $2 and binding.active = true`,
      [issuer, subject]
    );
    assert.deepEqual(mapped.rows, [{ profile_id: "pre-gematik-admin", role: "admin" }]);
    await assert.rejects(
      appPool.query(
        `insert into identity_bindings (issuer, subject, profile_id, active)
         values ($1, 'forbidden-subject', 'pre-gematik-admin', true)`,
        [issuer]
      ),
      /permission denied/i,
      "Die API-Laufzeitrolle darf Identity-Bindungen nicht selbst provisionieren."
    );
  } finally {
    await adminPool.query("delete from identity_bindings where issuer = $1 and subject = $2", [issuer, subject]);
  }
}

async function syntheticSeedSnapshot(pool) {
  const definitions = [
    ["profiles", "select profile.id::text as snapshot_key, profile.*, profile.xmin::text as row_xmin from profiles profile where profile.id like 'demo-profile-%' order by profile.id"],
    ["organizations", "select organization.id::text as snapshot_key, organization.*, organization.xmin::text as row_xmin from organizations organization where organization.source = $1 order by organization.id", [SEED_NAMESPACE]],
    ["organization_primary_systems", "select system.id::text as snapshot_key, system.*, system.xmin::text as row_xmin from organization_primary_systems system where system.id like 'demo-primary-system-%' order by system.id"],
    ["contacts", "select contact.id::text as snapshot_key, contact.*, contact.xmin::text as row_xmin from contacts contact where contact.source = $1 order by contact.id", [SEED_NAMESPACE]],
    ["contact_owners", "select owner.contact_id || ':' || owner.profile_id as snapshot_key, owner.*, owner.xmin::text as row_xmin from contact_owners owner where owner.contact_id like 'demo-contact-%' order by owner.contact_id, owner.profile_id"],
    ["formats", "select format.id::text as snapshot_key, format.*, format.xmin::text as row_xmin from formats format where format.id like 'demo-format-%' order by format.id"],
    ["format_participants", "select participant.id::text as snapshot_key, participant.*, participant.xmin::text as row_xmin from format_participants participant where participant.id like 'demo-format-%' order by participant.id"],
    ["hospitations", "select hospitation.id::text as snapshot_key, hospitation.*, hospitation.xmin::text as row_xmin from hospitations hospitation where hospitation.id like 'demo-hospitation-%' order by hospitation.id"],
    ["hospitation_observations", "select observation.id::text as snapshot_key, observation.*, observation.xmin::text as row_xmin from hospitation_observations observation where observation.payload ->> 'seedNamespace' = $1 order by observation.id", [SEED_NAMESPACE]],
    ["hospitation_observation_changes", "select audit.id::text as snapshot_key, audit.*, audit.xmin::text as row_xmin from hospitation_observation_changes audit join hospitation_observations observation on observation.id = audit.observation_id where observation.payload ->> 'seedNamespace' = $1 order by audit.id", [SEED_NAMESPACE]],
    ["import_runs", "select run.id::text as snapshot_key, run.*, run.xmin::text as row_xmin from import_runs run where run.id = 'demo-import-pre-gematik-synthetic-v1' order by run.id"]
  ];
  const snapshot = {};
  for (const [table, sql, params = []] of definitions) {
    const result = await pool.query(sql, params);
    snapshot[table] = result.rows;
  }
  return snapshot;
}

async function assertSyntheticSeedRejectsCollision(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      insert into organizations (id, name, normalized_name, source, created_by, updated_by)
      values (
        'synthetic-seed-collision-org', 'Collision Sentinel', 'collision sentinel',
        'contract-collision', 'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await client.query(`
      insert into organization_primary_systems (
        id, organization_id, system_type, vendor_name, product_name, source_url, created_by, updated_by
      ) values (
        'demo-primary-system-demo-org-nordstadt', 'synthetic-seed-collision-org',
        'PVS', 'Fremder Hersteller', 'Fremdes Produkt', 'https://collision.example.invalid',
        'pre-gematik-admin', 'pre-gematik-admin'
      )
    `);
    await assert.rejects(
      client.query(syntheticSeedSql),
      (error) => error?.code === "P0001" && /primary-system ID collides/.test(error.message),
      "Der Seed muss eine fremde reservierte Primärsystem-ID vor dem ersten Insert ablehnen."
    );
    await client.query("rollback");
    const sideEffects = await client.query(`
      select
        (select count(*)::int from profiles where id like 'demo-profile-%') as profiles,
        (select count(*)::int from organizations where source = $1) as organizations,
        (select count(*)::int from contacts where source = $1) as contacts,
        (select count(*)::int from formats where id like 'demo-format-%') as formats,
        (select count(*)::int from hospitations where id like 'demo-hospitation-%') as hospitations
    `, [SEED_NAMESPACE]);
    assert.deepEqual(sideEffects.rows[0], {
      profiles: 0,
      organizations: 0,
      contacts: 0,
      formats: 0,
      hospitations: 0
    }, "Ein abgelehnter Seed-Kollisionslauf darf keine Fachdaten hinterlassen.");
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query(`
      delete from organization_primary_systems
       where id = 'demo-primary-system-demo-org-nordstadt'
         and organization_id = 'synthetic-seed-collision-org'
    `).catch(() => {});
    await client.query("delete from organizations where id = 'synthetic-seed-collision-org'").catch(() => {});
    client.release();
  }
}

async function assertSyntheticSeed(pool) {
  const sentinelBefore = await pool.query(`
    select to_jsonb(sentinel) as value
      from (
        select profile.*, profile.xmin::text as row_xmin
          from profiles profile
         where profile.id = 'pre-gematik-admin'
      ) sentinel
  `);
  assert.equal(sentinelBefore.rowCount, 1, "Das bestehende Admin-Sentinelprofil fehlt vor dem synthetischen Seed.");

  await pool.query(syntheticSeedSql);
  const first = await syntheticSeedSnapshot(pool);
  await pool.query(syntheticSeedSql);
  const second = await syntheticSeedSnapshot(pool);
  assert.deepEqual(second, first, "Der zweite Seed-Lauf muss einschließlich xmin vollständig ohne Änderungen bleiben.");

  const sentinelAfter = await pool.query(`
    select to_jsonb(sentinel) as value
      from (
        select profile.*, profile.xmin::text as row_xmin
          from profiles profile
         where profile.id = 'pre-gematik-admin'
      ) sentinel
  `);
  assert.deepEqual(sentinelAfter.rows[0].value, sentinelBefore.rows[0].value,
    "Der synthetische Seed darf das bestehende IAP-/Adminprofil nicht verändern.");

  const expectedRows = {
    profiles: EXPECTED_SYNTHETIC_SEED_COUNTS.profiles,
    organizations: EXPECTED_SYNTHETIC_SEED_COUNTS.organizations,
    organization_primary_systems: EXPECTED_SYNTHETIC_SEED_COUNTS.organization_primary_systems,
    contacts: EXPECTED_SYNTHETIC_SEED_COUNTS.contacts,
    contact_owners: EXPECTED_SYNTHETIC_SEED_COUNTS.contact_owners,
    formats: EXPECTED_SYNTHETIC_SEED_COUNTS.formats,
    format_participants: EXPECTED_SYNTHETIC_SEED_COUNTS.format_participants,
    hospitations: EXPECTED_SYNTHETIC_SEED_COUNTS.hospitations,
    hospitation_observations: EXPECTED_SYNTHETIC_SEED_COUNTS.hospitation_observations,
    hospitation_observation_changes: EXPECTED_SYNTHETIC_SEED_COUNTS.observation_create_audits,
    import_runs: EXPECTED_SYNTHETIC_SEED_COUNTS.import_runs
  };
  for (const [table, expected] of Object.entries(expectedRows)) {
    assert.equal(first[table].length, expected, `${table}: unerwartete synthetische Zeilenzahl.`);
  }

  const contracts = await pool.query(`
    select
      (select count(*)::int
         from contacts contact
        where contact.source = $1
          and contact.status = 'active'
          and contact.latitude is not null
          and contact.longitude is not null
          and contact.latitude <> 0
          and contact.longitude <> 0) as map_contacts,
      (select count(*)::int
         from contacts contact
        where contact.source = $1
          and (
            contact.email !~ '@example\\.invalid$'
            or contact.image_url is not null
            or contact.image_source_url is not null
            or contact.image_storage_path is not null
          )) as unsafe_contacts,
      (select count(*)::int
         from organizations organization
        where organization.source = $1
          and (organization.email !~ '@example\\.invalid$' or organization.website !~ '^https://[^/]+\\.example\\.invalid$')) as unsafe_organizations,
      (select count(*)::int
         from profiles profile
        where profile.id like 'demo-profile-%'
          and (profile.email !~ '@versorgungs-kompass\\.example\\.invalid$' or profile.avatar_url is not null)) as unsafe_profiles,
      (select count(*)::int
         from hospitation_observations observation
        where observation.payload ->> 'seedNamespace' = $1
          and (
            observation.evidence_type <> 'interpreted'
            or observation.payload ->> 'originalEvidenceType' <> 'synthetic_source_based'
          )) as invalid_observations,
      (select count(*)::int
         from pg_constraint constraint_state
         join pg_namespace namespace on namespace.oid = constraint_state.connamespace
        where namespace.nspname = 'public' and not constraint_state.convalidated) as unvalidated_constraints
  `, [SEED_NAMESPACE]);
  assert.deepEqual(contracts.rows[0], {
    map_contacts: EXPECTED_SYNTHETIC_SEED_COUNTS.active_map_contacts,
    unsafe_contacts: 0,
    unsafe_organizations: 0,
    unsafe_profiles: 0,
    invalid_observations: 0,
    unvalidated_constraints: 0
  }, "Der synthetische Seed verletzt Karten-, Datenschutz-, Beobachtungs- oder Constraint-Verträge.");
}

async function profileStateSnapshot(pool, whereSql = "true", params = []) {
  const result = await pool.query(`
    select profile.id,
           to_jsonb(profile) as value,
           profile.xmin::text as row_xmin
      from profiles profile
     where ${whereSql}
     order by profile.id
  `, params);
  return result.rows;
}

async function assertSyntheticProfileAvatarRejectsCollision(pool) {
  const before = await profileStateSnapshot(pool);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const collision = await client.query(`
      update profiles
         set avatar_url = '/public/existing-custom-avatar.svg'
       where id = 'demo-profile-viewer'
         and avatar_url is null
      returning id
    `);
    assert.equal(collision.rowCount, 1,
      "Der Avatar-Kollisionstest benötigt den unveränderten synthetischen Basis-Seed.");
    await assert.rejects(
      client.query(syntheticProfileAvatarsSql),
      (error) => error?.code === "P0001"
        && /expected 3 protected demo profiles, got 2/i.test(error.message),
      "Der Avatar-Patch muss ein bereits individuell bebildertes Demo-Profil vor dem ersten Update ablehnen."
    );
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }

  const after = await profileStateSnapshot(pool);
  assert.deepEqual(after, before,
    "Ein abgelehnter Avatar-Patch darf einschließlich xmin keinerlei Profiländerungen hinterlassen.");
}

async function assertSyntheticProfileAvatars(pool) {
  const expectedRows = Object.entries(EXPECTED_SYNTHETIC_PROFILE_AVATARS).map(([id, avatar_url]) => ({
    id,
    avatar_url
  }));
  const expectedEmails = {
    "demo-profile-admin": "admin@versorgungs-kompass.example.invalid",
    "demo-profile-editor": "redaktion@versorgungs-kompass.example.invalid",
    "demo-profile-viewer": "lesekonto@versorgungs-kompass.example.invalid"
  };

  const initialTargets = await pool.query(`
    select id, email, avatar_url,
           position('pre-gematik-synthetic-v1' in coalesce(bio, '')) > 0 as protected_seed
      from profiles
     where id = any($1::text[])
     order by id
  `, [SYNTHETIC_PROFILE_IDS]);
  assert.deepEqual(initialTargets.rows, SYNTHETIC_PROFILE_IDS.map((id) => ({
    id,
    email: expectedEmails[id],
    avatar_url: null,
    protected_seed: true
  })), "Der Avatar-Patch darf erst nach dem unveränderten Basis-Seed mit drei leeren Demo-Avataren laufen.");

  const sentinelBefore = await profileStateSnapshot(pool, "profile.id = 'pre-gematik-admin'");
  assert.equal(sentinelBefore.length, 1, "Das bestehende IAP-/Admin-Sentinelprofil fehlt vor dem Avatar-Patch.");
  const nonTargetsBefore = await profileStateSnapshot(pool, "not (profile.id = any($1::text[]))", [SYNTHETIC_PROFILE_IDS]);
  const targetInvariantsBefore = await pool.query(`
    select profile.id,
           to_jsonb(profile) - 'avatar_url' - 'updated_at' as invariant
      from profiles profile
     where profile.id = any($1::text[])
     order by profile.id
  `, [SYNTHETIC_PROFILE_IDS]);

  await pool.query(syntheticProfileAvatarsSql);
  const firstTargetState = await profileStateSnapshot(pool, "profile.id = any($1::text[])", [SYNTHETIC_PROFILE_IDS]);
  assert.deepEqual(firstTargetState.map(({ id, value }) => ({ id, avatar_url: value.avatar_url })), expectedRows,
    "Der Avatar-Patch muss exakt die drei freigegebenen lokalen SVG-Pfade setzen.");

  const targetInvariantsAfter = await pool.query(`
    select profile.id,
           to_jsonb(profile) - 'avatar_url' - 'updated_at' as invariant
      from profiles profile
     where profile.id = any($1::text[])
     order by profile.id
  `, [SYNTHETIC_PROFILE_IDS]);
  assert.deepEqual(targetInvariantsAfter.rows, targetInvariantsBefore.rows,
    "Der Avatar-Patch darf an den drei Zielprofilen außer avatar_url/updated_at keine Felder verändern.");

  const nonTargetsAfterFirstRun = await profileStateSnapshot(
    pool,
    "not (profile.id = any($1::text[]))",
    [SYNTHETIC_PROFILE_IDS]
  );
  assert.deepEqual(nonTargetsAfterFirstRun, nonTargetsBefore,
    "Der Avatar-Patch darf Nicht-Zielprofile einschließlich xmin nicht verändern.");
  const sentinelAfterFirstRun = await profileStateSnapshot(pool, "profile.id = 'pre-gematik-admin'");
  assert.deepEqual(sentinelAfterFirstRun, sentinelBefore,
    "Der Avatar-Patch darf das bestehende IAP-/Adminprofil nicht verändern.");

  const exactScope = await pool.query(`
    select id, avatar_url
      from profiles
     where avatar_url = any($1::text[])
     order by id
  `, [Object.values(EXPECTED_SYNTHETIC_PROFILE_AVATARS)]);
  assert.deepEqual(exactScope.rows, expectedRows,
    "Die reservierten synthetischen Avatar-Pfade dürfen ausschließlich den drei erwarteten Profilen zugeordnet sein.");

  await pool.query(syntheticProfileAvatarsSql);
  const secondTargetState = await profileStateSnapshot(pool, "profile.id = any($1::text[])", [SYNTHETIC_PROFILE_IDS]);
  assert.deepEqual(secondTargetState, firstTargetState,
    "Der zweite Avatar-Patch-Lauf muss einschließlich updated_at und xmin vollständig ohne Änderungen bleiben.");
  const nonTargetsAfterSecondRun = await profileStateSnapshot(
    pool,
    "not (profile.id = any($1::text[]))",
    [SYNTHETIC_PROFILE_IDS]
  );
  assert.deepEqual(nonTargetsAfterSecondRun, nonTargetsBefore,
    "Auch ein wiederholter Avatar-Patch darf keine Nicht-Zielprofile verändern.");
}

let containerName = "";
let pool;
try {
  let connectionString = process.env.PRE_GEMATIK_SCHEMA_TEST_DATABASE_URL || "";
  if (!connectionString) {
    if (!dockerIsAvailable()) {
      console.log("Docker nicht verfügbar: PostgreSQL-16-Integrationstest übersprungen; statischer Vertrag ist grün.");
      process.exit(0);
    }
    containerName = `vk-pre-gematik-schema-${process.pid}-${Date.now()}`;
    const password = `pre-gematik-contract-${process.pid}`;
    runDocker([
      "run", "--rm", "-d", "--name", containerName,
      "-e", "POSTGRES_USER=vk_contract",
      "-e", `POSTGRES_PASSWORD=${password}`,
      "-e", "POSTGRES_DB=versorgungs_kompass",
      "-p", "127.0.0.1::5432",
      "postgres:16-alpine"
    ]);
    const portOutput = runDocker(["port", containerName, "5432/tcp"]);
    const portMatch = /:(\d+)\s*$/m.exec(portOutput);
    assert.ok(portMatch, `Docker-Port konnte nicht ermittelt werden: ${portOutput}`);
    connectionString = `postgresql://vk_contract:${encodeURIComponent(password)}@127.0.0.1:${portMatch[1]}/versorgungs_kompass`;
  }

  pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 1000 });
  await waitForPostgres(pool);
  const version = await pool.query("show server_version_num");
  assert.match(String(version.rows[0].server_version_num), /^16\d{4}$/, "Vertragstest erfordert PostgreSQL 16.");
  await pool.query(schemaSql);
  await pool.query(schemaSql);
  await pool.query(seedSql);
  await assertDatabaseColumns(pool);
  if (containerName) {
    const runtimeRole = "vk_app_runtime";
    const appUser = "vk_app_contract";
    const appPassword = `vk-app-contract-${process.pid}`;
    runDocker([
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "vk_contract", "-d", "versorgungs_kompass"
    ], { input: runtimeRoleSql });
    runDocker([
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "vk_contract", "-d", "versorgungs_kompass"
    ], { input: runtimeRoleSql });
    runDocker([
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1", "-v", `runtime_role=${runtimeRole}`,
      "-U", "vk_contract", "-d", "versorgungs_kompass"
    ], { input: grantsSql });
    runDocker([
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1", "-v", `runtime_role=${runtimeRole}`,
      "-U", "vk_contract", "-d", "versorgungs_kompass"
    ], { input: grantsSql });
    await pool.query(`create role ${appUser} login inherit in role ${runtimeRole} password '${appPassword}'`);
    const portOutput = runDocker(["port", containerName, "5432/tcp"]);
    const portMatch = /:(\d+)\s*$/m.exec(portOutput);
    assert.ok(portMatch);
    const appPool = new Pool({
      connectionString: `postgresql://${appUser}:${encodeURIComponent(appPassword)}@127.0.0.1:${portMatch[1]}/versorgungs_kompass`,
      max: 2
    });
    try {
      const syntheticAdmin = await appPool.query("select role from profiles where id = 'pre-gematik-admin'");
      assert.equal(syntheticAdmin.rows[0]?.role, "admin");
      await assertRuntimeRoleContract(pool, appPool, runtimeRole, appUser);
      await assertIdentityBindingBoundary(pool, appPool);
      await assertSyntheticSeedRejectsCollision(appPool);
      await assertSyntheticSeed(appPool);
      await assertSyntheticProfileAvatarRejectsCollision(appPool);
      await assertSyntheticProfileAvatars(appPool);
      await databaseSmoke(appPool);
      await assertAppUserCannotCreate(appPool);
    } finally {
      await appPool.end();
    }
  } else {
    await assertSyntheticSeedRejectsCollision(pool);
    await assertSyntheticSeed(pool);
    await assertSyntheticProfileAvatarRejectsCollision(pool);
    await assertSyntheticProfileAvatars(pool);
    await databaseSmoke(pool);
    console.log("Externe Test-DB verwendet: runtime-role.sql und grants.sql wurden statisch, aber nicht mit temporären Rollen ausgeführt.");
  }
  console.log("PostgreSQL 16 contract OK: Schema, Laufzeitrolle und synthetischer Avatar-Patch idempotent; Least-Privilege-Vererbung und relationaler Smoke-Test erfolgreich.");
} finally {
  if (pool) await pool.end().catch(() => {});
  if (containerName) {
    try {
      runDocker(["stop", "--time", "1", containerName]);
    } catch (error) {
      console.warn(`Temporärer PostgreSQL-Container konnte nicht beendet werden: ${error.message}`);
    }
  }
}
