import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const apiSource = fs.readFileSync(new URL("../api/server.mjs", import.meta.url), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = apiSource.indexOf(startMarker);
  const end = apiSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Startmarke fehlt: ${startMarker}`);
  assert.ok(end > start, `Endmarke fehlt: ${endMarker}`);
  return apiSource.slice(start, end);
}

function evaluate(declarations, sandbox, exportNames) {
  const context = vm.createContext({ ...sandbox });
  vm.runInContext([
    declarations,
    ...exportNames.map((name) => `globalThis.${name}ForTest = ${name};`)
  ].join("\n"), context, { filename: "api-postgres-contract.js" });
  return Object.fromEntries(exportNames.map((name) => [name, context[`${name}ForTest`]]));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

{
  const { buildWhere } = evaluate(
    sourceBetween("function dbValue(", "function buildOrder("),
    {
      URLSearchParams,
      tableFields: () => new Set(["hospitation_id", "status", "id"]),
      qid: (identifier) => `"${identifier}"`,
      validationError: (message) => new Error(message)
    },
    ["buildWhere"]
  );
  const values = [];
  const where = buildWhere("hospitation_observations", new URLSearchParams({
    hospitation_id: "eq.hospitation-1",
    status: "eq.active",
    id: 'not.in.("observation-keep-1","observation-keep-2")'
  }), values);
  assert.equal(
    where,
    ' where "hospitation_id" = $1 and "status" = $2 and not ("id" = any($3))',
    "Der Plain-Postgres-Adapter muss not.in als echte Negation abbilden."
  );
  assert.deepEqual(plain(values), ["hospitation-1", "active", ["observation-keep-1", "observation-keep-2"]]);

  const quotedValues = [];
  buildWhere("hospitation_observations", new URLSearchParams({
    id: 'not.in.("observation,with-comma","observation\\"with-quote")'
  }), quotedValues);
  assert.deepEqual(plain(quotedValues), [["observation,with-comma", 'observation"with-quote']]);
}

{
  const fields = new Set(["id", "hospitation_id", "title", "created_by", "updated_by"]);
  const { insertSql } = evaluate(
    sourceBetween("function sanitizeRowForTable(", "async function insertRows("),
    {
      tableFields: () => fields,
      qid: (identifier) => `"${identifier}"`,
      validationError: (message) => new Error(message)
    },
    ["insertSql"]
  );
  const { sql } = insertSql(
    "hospitation_observations",
    [{
      id: "observation-1",
      hospitation_id: "hospitation-1",
      title: "Beobachtung",
      created_by: "profile-1",
      updated_by: "profile-1"
    }],
    new URLSearchParams({ on_conflict: "id" }),
    {
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      conflictMatchFields: ["hospitation_id"],
      conflictPreserveFields: ["created_by"]
    }
  );
  assert.match(sql, /on conflict \("id"\) do update set/);
  assert.doesNotMatch(sql, /"created_by" = excluded\."created_by"/);
  assert.match(sql, /where "hospitation_observations"\."hospitation_id" = excluded\."hospitation_id"/);
}

{
  const queries = [];
  const transaction = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ ok: true }] };
    }
  };
  const { databaseQuery } = evaluate(
    sourceBetween("function databaseQuery(", "async function selectRows("),
    {
      getPool: () => {
        throw new Error("Transaktionsrouting darf den Pool nicht direkt verwenden.");
      }
    },
    ["databaseQuery"]
  );
  const result = await databaseQuery(transaction, "select $1::text", ["transaction"]);
  assert.deepEqual(plain(result.rows), [{ ok: true }]);
  assert.deepEqual(plain(queries), [{ sql: "select $1::text", values: ["transaction"] }]);
}

{
  const log = [];
  let released = 0;
  const client = {
    query: async (sql) => {
      log.push(sql);
      return { rows: [] };
    },
    release: () => { released += 1; }
  };
  const { withDomainTransaction } = evaluate(
    sourceBetween("const DOMAIN_TRANSACTION", "// Private write boundary"),
    { getPool: () => ({ connect: async () => client }) },
    ["withDomainTransaction"]
  );
  await withDomainTransaction(async (transaction) => {
    await transaction.query("domain write");
  });
  assert.deepEqual(log, [
    "begin",
    "set local lock_timeout = '5s'",
    "set local idle_in_transaction_session_timeout = '15s'",
    "domain write",
    "commit"
  ]);
  assert.equal(released, 1);

  log.length = 0;
  await assert.rejects(
    withDomainTransaction(async (transaction) => {
      await transaction.query("failing domain write");
      throw new Error("constraint failure");
    }),
    /constraint failure/
  );
  assert.deepEqual(log, [
    "begin",
    "set local lock_timeout = '5s'",
    "set local idle_in_transaction_session_timeout = '15s'",
    "failing domain write",
    "rollback"
  ]);
  assert.equal(released, 2);
}

{
  const calls = [];
  const transaction = { query: async () => ({ rows: [] }) };
  const sandbox = {
    URLSearchParams,
    HOSPITATION_OBSERVATION_FIELDS: ["id", "hospitation_id"],
    readValidatedJsonBody: async () => ({ observations: [{ id: "observation-keep" }] }),
    userIdFromToken: () => "profile-1",
    hospitationObservationToDb: (observation, hospitationId) => ({ id: observation.id, hospitation_id: hospitationId }),
    hospitationObservationToDto: (row) => row,
    recordActivityEventInternal: async () => {},
    withDomainTransaction: async (work) => work(transaction),
    cloudSqlRest: async (path, _request, params, options = {}) => {
      calls.push({ path, params: Object.fromEntries(params), options });
      if (options.method === "POST") return options.body;
      if (!options.method) return [{ id: "observation-keep", hospitation_id: "hospitation-1" }];
      return [];
    }
  };
  const { syncHospitationObservations } = evaluate(
    sourceBetween("async function syncHospitationObservations(", "async function listRoadmapItems("),
    sandbox,
    ["syncHospitationObservations"]
  );
  const result = await syncHospitationObservations({}, "hospitation-1");
  assert.deepEqual(plain(result.items), [{ id: "observation-keep", hospitation_id: "hospitation-1" }]);
  assert.equal(calls[0].params.on_conflict, "id");
  assert.deepEqual(plain(calls[0].options.conflictMatchFields), ["hospitation_id"]);
  assert.equal(calls[1].params.id, 'not.in.("observation-keep")');
  assert.ok(calls.every((call) => call.options.transaction === transaction), "Upsert, Archivierung und Rücklesen müssen dieselbe Transaktion verwenden.");
}

async function testAtomicReplace({ startMarker, endMarker, functionName, table, mapperName, dtoName, fieldsName }) {
  const calls = [];
  const transaction = { query: async () => ({ rows: [] }) };
  const input = table === "hospitation_roadmap_assessments"
    ? { roadmapItemId: "roadmap-1" }
    : { title: "Ungedeckter Bedarf" };
  const mapper = table === "hospitation_roadmap_assessments"
    ? (item, hospitationId) => ({ hospitation_id: hospitationId, roadmap_item_id: item.roadmapItemId })
    : (item, hospitationId) => ({ hospitation_id: hospitationId, title: item.title });
  const sandbox = {
    URLSearchParams,
    readValidatedJsonBody: async () => ({ items: [input] }),
    assertAllowedFields: () => {},
    userIdFromToken: () => "profile-1",
    recordActivityEventInternal: async () => {},
    withDomainTransaction: async (work) => work(transaction),
    cloudSqlRest: async (path, _request, params, options = {}) => {
      calls.push({ path, params: Object.fromEntries(params), options });
      return options.method === "POST" ? options.body : [];
    },
    [mapperName]: mapper,
    [dtoName]: (row) => row,
    [fieldsName]: ["id"]
  };
  sandbox[table === "hospitation_roadmap_assessments"
    ? "HOSPITATION_ROADMAP_ASSESSMENT_INPUT_FIELDS"
    : "HOSPITATION_UNMET_NEED_INPUT_FIELDS"] = Object.keys(input);
  const functions = evaluate(sourceBetween(startMarker, endMarker), sandbox, [functionName]);
  await functions[functionName]({}, "hospitation-1");
  assert.deepEqual(calls.map((call) => call.options.method), ["DELETE", "POST"]);
  assert.ok(calls.every((call) => call.path === table));
  assert.ok(calls.every((call) => call.options.transaction === transaction), `${table}: Delete und Insert müssen dieselbe Transaktion verwenden.`);
}

await testAtomicReplace({
  startMarker: "async function replaceHospitationRoadmapAssessments(",
  endMarker: "async function listHospitationUnmetNeeds(",
  functionName: "replaceHospitationRoadmapAssessments",
  table: "hospitation_roadmap_assessments",
  mapperName: "hospitationRoadmapAssessmentToDb",
  dtoName: "hospitationRoadmapAssessmentToDto",
  fieldsName: "HOSPITATION_ROADMAP_ASSESSMENT_FIELDS"
});

await testAtomicReplace({
  startMarker: "async function replaceHospitationUnmetNeeds(",
  endMarker: "async function createContact(",
  functionName: "replaceHospitationUnmetNeeds",
  table: "hospitation_unmet_needs",
  mapperName: "hospitationUnmetNeedToDb",
  dtoName: "hospitationUnmetNeedToDto",
  fieldsName: "HOSPITATION_UNMET_NEED_FIELDS"
});

{
  const exportSource = sourceBetween("async function exportCloudSqlData(", "function jsonDownload(");
  const requiredTables = [
    "profiles",
    "organizations",
    "organization_primary_systems",
    "contacts",
    "contact_owners",
    "changes",
    "activity_events",
    "contact_notes",
    "contact_note_attachments",
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
    "expert_contacts",
    "expert_organizations",
    "expert_entity_links",
    "stakeholder_types",
    "stakeholder_organizations",
    "stakeholder_people",
    "saved_views",
    "user_settings",
    "notification_events",
    "notification_recipients",
    "import_runs"
  ];
  requiredTables.forEach((table) => {
    assert.match(exportSource, new RegExp(`"${table}"`), `Cloud-SQL-Export muss ${table} enthalten.`);
  });
}

console.log("API Postgres Contracts OK: Beobachtungs-Upsert/Archivierung, atomare Replace-Abläufe und vollständiger Export sind abgesichert.");
