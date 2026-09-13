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

{
  const contextFields = ["situation", "situationContext", "situation_context", "context"];
  const contextValues = (value) => contextFields.map((field) => value[field] ?? null);
  const declarations = [
    sourceBetween("const HOSPITATION_OBSERVATION_FIELDS = [", "const ROADMAP_ITEM_FIELDS = ["),
    sourceBetween("const HOSPITATION_OBSERVATION_INPUT_FIELDS = [", "const HOSPITATION_IMPORT_PREVIEW_FIELDS = ["),
    sourceBetween("function splitList(", "function normalizePriority("),
    sourceBetween("function assertPlainObject(", "async function readJsonBody("),
    sourceBetween("function hospitationObservationEvidenceType(", "function hospitationSlotToDb("),
    sourceBetween("async function patchHospitationObservation(", "async function syncHospitationObservations("),
    `async function readValidatedJsonBody(request, fields, label) {
      assertAllowedFields(request.body, fields, label);
      return request.body;
    }`
  ].join("\n");

  for (const legacyPayload of [
    { context: "Nur im historischen Payload gespeicherter Kontext" },
    {
      situation: "Ursprüngliche Situation",
      situationContext: "Früherer Kontextalias",
      situation_context: "Historischer Unterstrichalias",
      context: "Historischer Payload-Kontext"
    }
  ]) {
    let storedRow = {
      id: "observation-context-contract",
      hospitation_id: "hospitation-context-contract",
      title: "Ursprüngliche Kurzfassung",
      situation: legacyPayload.situation || null,
      description: "Dokumentierte Beobachtung",
      status: "active",
      updated_at: "2026-01-01T12:00:00.000Z",
      payload: { ...legacyPayload }
    };
    const calls = [];
    const activityEvents = [];
    const transaction = { query: async () => ({ rows: [] }) };
    let rejectConcurrentWrite = false;
    const { patchHospitationObservation, hospitationObservationToDto, hospitationObservationToDb } = evaluate(
      declarations,
      {
        URLSearchParams,
        validationError: (message) => Object.assign(new Error(message), { status: 400 }),
        generatedId: () => { throw new Error("Ein PATCH darf keine neue Beobachtungs-ID erzeugen."); },
        userIdFromToken: () => "profile-context-contract",
        withDomainTransaction: async (work) => work(transaction),
        recordActivityEventInternal: async (actualTransaction, _request, event) => {
          assert.equal(actualTransaction, transaction);
          activityEvents.push(plain(event));
        },
        cloudSqlRest: async (path, _request, params, options = {}) => {
          assert.equal(path, "hospitation_observations");
          assert.equal(options.transaction, transaction);
          assert.equal(params.get("id"), `eq.${storedRow.id}`);
          calls.push({ method: options.method || "GET", params: Object.fromEntries(params), body: options.body && plain(options.body) });
          if (!options.method) return [plain(storedRow)];
          assert.equal(options.method, "PATCH");
          assert.equal(params.get("updated_at"), `eq.${storedRow.updated_at}`, "Jeder Schreibzugriff muss die gelesene Version absichern.");
          if (rejectConcurrentWrite) return [];
          storedRow = { ...storedRow, ...plain(options.body) };
          return [plain(storedRow)];
        }
      },
      ["patchHospitationObservation", "hospitationObservationToDto", "hospitationObservationToDb"]
    );
    const patch = (body) => patchHospitationObservation({ body: { ...body, expectedUpdatedAt: storedRow.updated_at } }, storedRow.id);
    const before = plain(hospitationObservationToDto(storedRow));
    for (const body of [{ title: "Überarbeitete Kurzfassung" }, { problemType: "Information fehlt" }]) {
      const result = await patch(body);
      for (const [field, value] of Object.entries(body)) assert.equal(result[field], value);
      assert.deepEqual(contextValues(result), contextValues(before), "Kurzfassung und Codes müssen alle vorhandenen Kontextalias erhalten.");
      assert.equal(result.description, before.description);
      assert.notEqual(result.updatedAt, before.updatedAt);
      assert.equal(result.updatedBy, "profile-context-contract");
      assert.equal(Object.hasOwn(storedRow.payload, "expectedUpdatedAt"), false);
    }

    const beforeConflict = plain(storedRow);
    const writesBeforeConflict = calls.filter((call) => call.method === "PATCH").length;
    const eventsBeforeConflict = activityEvents.length;
    await assert.rejects(
      patchHospitationObservation({ body: { situation: "", situationContext: "", expectedUpdatedAt: before.updatedAt } }, storedRow.id),
      (error) => error.status === 409
    );
    assert.deepEqual(storedRow, beforeConflict, "Eine veraltete Version darf den Kontext nicht leeren.");
    assert.equal(calls.filter((call) => call.method === "PATCH").length, writesBeforeConflict);
    assert.equal(activityEvents.length, eventsBeforeConflict);

    const combinedDescription = `${before.context}\n\n${before.description}`;
    const cleared = await patch({ description: combinedDescription, situation: "", situationContext: "" });
    assert.equal(cleared.description, combinedDescription);
    assert.deepEqual(contextValues(cleared), ["", "", "", ""]);
    assert.equal(storedRow.situation, null, "Die nullable Datenbankspalte muss beim expliziten Leeren leer bleiben.");
    assert.deepEqual(contextValues(storedRow.payload), ["", "", "", ""], "Auch historischer payload.context darf nicht wieder erscheinen.");
    const roundtrip = hospitationObservationToDto(hospitationObservationToDb(cleared, storedRow.hospitation_id));
    assert.deepEqual(contextValues(roundtrip), ["", "", "", ""]);
    assert.equal(roundtrip.description, combinedDescription);
    assert.equal(Object.hasOwn(storedRow.payload, "expectedUpdatedAt"), false);

    const repeated = await patch({ description: combinedDescription, situation: "", situationContext: "" });
    assert.equal(repeated.description, combinedDescription, "Erneutes Speichern darf den übernommenen Kontext nicht verdoppeln.");
    const aliasOnly = await patch({ situationContext: "  Neuer Kontext  " });
    assert.deepEqual(contextValues(aliasOnly), Array(4).fill("Neuer Kontext"), "Der erlaubte situationContext-PATCH muss alle Alias vereinheitlichen.");
    assert.equal(storedRow.situation, "Neuer Kontext");
    const explicitEmpty = await patch({ situation: "", situationContext: "Veralteter Fallback" });
    assert.deepEqual(contextValues(explicitEmpty), ["", "", "", ""], "Eine explizit leere Situation hat Vorrang vor einem befüllten Alias.");

    for (const usagePatch of [
      { usageRecommendation: "" }, { usage_recommendation: "" }, { nextUse: "" },
      { usageRecommendation: "", nextUse: "Veraltete Nutzung" }
    ]) {
      storedRow.usage_recommendation = "weiter validieren";
      Object.assign(storedRow.payload, {
        usageRecommendation: "weiter validieren", usage_recommendation: "weiter validieren", nextUse: "weiter validieren",
        next_use: "weiter validieren", possibleUse: "weiter validieren", possible_use: "weiter validieren"
      });
      const clearedUsage = await patch(usagePatch);
      assert.equal(clearedUsage.usageRecommendation, "", "Das Leeren der nächsten Nutzung darf keinen alten Alias reaktivieren.");
      assert.equal(storedRow.usage_recommendation, null);
      for (const alias of ["usage_recommendation", "nextUse", "next_use", "possibleUse", "possible_use"]) {
        assert.ok(!clearedUsage[alias], `Eine geleerte Nutzung darf nicht als ${alias} erhalten bleiben.`);
      }
      const usageRoundtrip = hospitationObservationToDto(hospitationObservationToDb(clearedUsage, storedRow.hospitation_id));
      assert.equal(usageRoundtrip.usageRecommendation, "");
      assert.equal((await patch({ title: "Kurzfassung nach geleerter Nutzung" })).usageRecommendation, "", "Eine spätere Änderung muss die leere Nutzung beibehalten.");
    }
    for (const [field, value] of [["nextUse", "Wissen teilen"], ["usage_recommendation", "Technik prüfen"]]) {
      assert.equal((await patch({ [field]: value })).usageRecommendation, value, "Ein reiner Nutzung-Alias-PATCH muss den kanonischen Altwert ersetzen.");
    }
    for (const relevancePatch of [{ relevanceScore: null }, { relevance_score: null }]) {
      storedRow.relevance_score = 4;
      Object.assign(storedRow.payload, { relevanceScore: 4, relevance_score: 4, careRelevance: 4, care_relevance: 4 });
      const clearedRelevance = await patch(relevancePatch);
      assert.equal(clearedRelevance.relevanceScore, null, "Das Zurücksetzen der Relevanz darf keinen alten Bewertungsalias reaktivieren.");
      assert.equal(storedRow.relevance_score, null);
      for (const alias of ["relevance_score", "careRelevance", "care_relevance"]) {
        assert.ok(clearedRelevance[alias] == null, `Ein zurückgesetzter Wert darf nicht als ${alias} erhalten bleiben.`);
      }
      assert.equal((await patch({ title: "Kurzfassung nach zurückgesetzter Relevanz" })).relevanceScore, null);
    }

    rejectConcurrentWrite = true;
    const beforeRace = plain(storedRow);
    const eventsBeforeRace = activityEvents.length;
    await assert.rejects(patch({ situationContext: "Darf nicht gespeichert werden" }), (error) => error.status === 409);
    assert.deepEqual(storedRow, beforeRace);
    assert.equal(activityEvents.length, eventsBeforeRace, "Ein konkurrierend abgelehnter PATCH darf kein Erfolgsevent schreiben.");
  }
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
