import assert from "node:assert/strict";
import { appendFingerprint, createObservationAppendHandler, parseObservationAppend, stableJson } from "../api/hospitation-observation-append.mjs";
import { policyForRequest } from "../api/security-policy.mjs";

const source = { kind: "plaud_transcript", recordingId: `of_${"a".repeat(32)}`, sha256: "b".repeat(64), segmentStart: 5, segmentEnd: 9, indexBase: 1 };
const observation = { hospitationId: "synthetic-visit", title: "Synthetische Testbeobachtung", situation: "Synthetische Vorführung", description: "Nur Testdaten", limitations: "Kein echter Fall", topics: ["Test"] };
const input = { mode: "preview", source, observation };
let checks = 0;
function check(name, fn) { fn(); checks += 1; }
function fixture() {
  const state = { rows: [{ id: "synthetic-old", hospitation_id: "synthetic-visit", sequence: 1, title: "Unveränderte Testzeile", payload: { keep: "exact" }, status: "archived", created_at: "2020-01-01", updated_at: "2021-01-01" }], parent: { id: "synthetic-visit", status: "Dokumentiert", updated_at: "2022-01-01" }, writes: 0, events: 0, calls: [], userId: "synthetic-editor", authorized: true, eventFails: false };
  const deps = {
    readValidatedJsonBody: async (request) => request.body,
    userIdFromToken: () => state.userId,
    getHospitation: async (_request, _id, transaction) => {
      state.calls.push(transaction ? "transactional-visibility" : "visibility");
      if (transaction) assert.equal(transaction.id, "synthetic-transaction");
      if (!state.authorized || (state.denySecondVisibility && transaction)) {
        throw Object.assign(new Error("Keine Berechtigung"), { status: 403 });
      }
    },
    withDomainTransaction: async (work) => {
      state.calls.push("begin"); const before = structuredClone({ rows: state.rows, writes: state.writes, events: state.events });
      try { const r = await work({ id: "synthetic-transaction" }); state.calls.push("commit"); return r; }
      catch (e) { Object.assign(state, before); state.calls.push("rollback"); throw e; }
    },
    databaseQuery: async (_transaction, sql, values) => {
      state.calls.push(sql);
      if (sql.startsWith("lock table")) return { rows: [] };
      if (sql.startsWith("select * from public.hospitations")) {
        if (state.parentLocked) throw Object.assign(new Error("Synthetische Sperre"), { code: "55P03" });
        return { rows: state.parent ? [state.parent] : [] };
      }
      if (sql.startsWith("select id, hospitation_id")) return { rows: state.rows.filter((row) => row.id === values[0]) };
      return { rows: state.rows.filter((row) => row.hospitation_id === values[0]) };
    },
    hospitationObservationToDb: (o, visit) => ({ id: o.id, hospitation_id: visit, sequence: o.sequence, title: o.title, payload: { ...o }, status: o.status }),
    hospitationObservationToDto: (row) => ({ ...row.payload, id: row.id, sequence: row.sequence }),
    cloudSqlRest: async (_table, _request, _params, options) => {
      assert.equal(options.method, "POST"); assert.ok(options.transaction);
      state.writes += 1; state.rows.push(structuredClone(options.body)); return [state.rows.at(-1)];
    },
    recordActivityEventInternal: async () => { if (state.eventFails) throw new Error("synthetic activity failure"); state.events += 1; },
    observationFields: ["id", "payload"]
  };
  return { state, call: createObservationAppendHandler(deps) };
}
async function expectFailure(fn, status, code) { await assert.rejects(fn, (e) => (!status || e.status === status) && (!code || e.code === code)); checks += 1; }
function applyBody(preview, changes = {}) { return { ...structuredClone(input), mode: "apply", expectedTargetFingerprint: preview.targetFingerprint, expectedCandidateFingerprint: preview.candidateFingerprint, confirmation: "append-source-observation", ...changes }; }

check("editor policy retained", () => assert.equal(policyForRequest("POST", "/api/hospitation-observations").role, "editor"));
check("canonical key order", () => assert.equal(appendFingerprint({ z: 1, a: 2 }), appendFingerprint({ a: 2, z: 1 })));
check("timestamps are fingerprinted", () => assert.notEqual(stableJson(new Date("2020-01-01")), stableJson(new Date("2021-01-01"))));
for (const changed of [
  { source: { ...source, indexBase: 0 } },
  { source: { ...source, segmentEnd: 1 } },
  { source: { ...source, sha256: "wrong" } },
  { source: { ...source, sha256: [source.sha256] } },
  { source: { ...source, recordingId: [source.recordingId] } },
  { source: { ...source, path: "/private" } },
  { observation: { ...observation, evidenceType: "directly_observed" } },
  { observation: { ...observation, externalUseAllowed: true } },
  { observation: { ...observation, id: "caller-controlled" } },
  { observation: { ...observation, title: "" } },
  { observation: { ...observation, settingType: "x".repeat(161) } },
  { mode: "apply" }
]) { check("invalid input fails closed", () => assert.throws(() => parseObservationAppend({ ...input, ...changed }))); }

{
  const f = fixture(), old = stableJson(f.state.rows); const p = await f.call({ body: structuredClone(input) });
  check("preview does not write", () => { assert.equal(f.state.writes, 0); assert.equal(f.state.events, 0); assert.equal(stableJson(f.state.rows), old); });
  check("preview stable id and provenance", () => { assert.equal(p.item.id, `obs-plaud-${"a".repeat(32)}-s5-9`); assert.equal(p.item.evidenceType, "source_bound"); assert.equal(p.item.externalUseAllowed, false); assert.match(p.item.sourceReference, /einsbasiert/); });
  const a = await f.call({ body: applyBody(p) });
  check("append creates one", () => { assert.equal(a.action, "created"); assert.equal(f.state.writes, 1); assert.equal(f.state.events, 1); assert.equal(stableJson(f.state.rows.slice(0, 1)), old); });
  check("normal visibility before transaction", () => assert.ok(f.state.calls.indexOf("visibility") < f.state.calls.indexOf("begin")));
  check("table and parent version serialized", () => {
    assert.ok(f.state.calls.includes("lock table public.hospitation_observations in share row exclusive mode"));
    const parentLock = f.state.calls.findIndex((call) => call.endsWith("for update nowait"));
    assert.ok(parentLock >= 0 && parentLock < f.state.calls.indexOf("transactional-visibility"));
  });
  const after = stableJson(f.state.rows); const repeat = await f.call({ body: applyBody(p) });
  check("second apply exact noop", () => { assert.equal(repeat.action, "unchanged"); assert.equal(f.state.writes, 1); assert.equal(f.state.events, 1); assert.equal(stableJson(f.state.rows), after); });
  f.state.rows.at(-1).title = "Spätere manuelle Korrektur";
  await expectFailure(() => f.call({ body: applyBody(p) }), 409, "observation_append_id_conflict");
}
for (const mutate of [
  (state) => { state.parent.status = "Manuell geändert"; },
  (state) => { state.rows[0].payload.keep = "Manuell geändert"; },
  (state) => { state.rows.push({ id: "new-parallel", hospitation_id: "synthetic-visit", sequence: 2, title: "Parallel" }); }
]) {
  const f = fixture(), p = await f.call({ body: structuredClone(input) }); mutate(f.state);
  await expectFailure(() => f.call({ body: applyBody(p) }), 409, "observation_append_target_drift");
  check("drift never writes", () => assert.equal(f.state.writes, 0));
}
{
  const f = fixture(), p = await f.call({ body: structuredClone(input) });
  await expectFailure(() => f.call({ body: applyBody(p, { observation: { ...observation, title: "Nach Vorschau geändert" } }) }), 409, "observation_append_candidate_drift");
  f.state.authorized = false;
  await expectFailure(() => f.call({ body: structuredClone(input) }), 403);
  check("visibility denial performs no database write", () => assert.equal(f.state.writes, 0));
}
{
  const f = fixture(); f.state.userId = "";
  await expectFailure(() => f.call({ body: structuredClone(input) }), 401);
  check("unauthenticated no transaction", () => assert.equal(f.state.calls.length, 0));
}
{
  const f = fixture(); f.state.denySecondVisibility = true;
  await expectFailure(() => f.call({ body: structuredClone(input) }), 403);
  check("second visibility denial performs no insert", () => { assert.equal(f.state.writes, 0); assert.equal(f.state.events, 0); assert.equal(f.state.calls.at(-1), "rollback"); });
}
{
  const f = fixture(), p = await f.call({ body: structuredClone(input) }); f.state.eventFails = true;
  const before = stableJson(f.state.rows);
  await expectFailure(() => f.call({ body: applyBody(p) }));
  check("activity failure rolls back append", () => { assert.equal(f.state.writes, 0); assert.equal(stableJson(f.state.rows), before); });
}
{
  const f = fixture(); f.state.rows.push({ id: parseObservationAppend(input).id, hospitation_id: "another-visit" });
  await expectFailure(() => f.call({ body: structuredClone(input) }), 409, "observation_append_parent_conflict");
}
{
  const f = fixture();
  const preview = await f.call({ body: structuredClone(input) });
  f.state.parentLocked = true;
  await expectFailure(() => f.call({ body: applyBody(preview) }), 409, "observation_append_target_drift");
  check("locked parent rolls back before writing", () => {
    assert.equal(f.state.writes, 0);
    assert.equal(f.state.events, 0);
    assert.equal(f.state.calls.at(-1), "rollback");
  });
}
console.log(JSON.stringify({ ok: true, checks, realDataUsed: false, databaseConnected: false }));
