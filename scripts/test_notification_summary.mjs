import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../api/server.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../frontend/data/data-service.js", import.meta.url), "utf8");

function functionSource(name, nextName, { async = false, nextAsync = false } = {}) {
  const start = source.indexOf(`${async ? "async " : ""}function ${name}(`);
  const end = source.indexOf(`\n${nextAsync ? "async " : ""}function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} muss aus der aktuellen API-Quelle stammen.`);
  return source.slice(start, end);
}

const state = { rows: [], error: null, queries: [], profileCalls: 0 };
const sandbox = {
  async loadProfiles() { state.profileCalls += 1; },
  userIdFromToken: (request) => request.currentProfile?.id || "",
  getPool: () => ({
    async query(sql, values) {
      state.queries.push({ sql, values });
      if (state.error) throw state.error;
      return { rows: state.rows };
    }
  })
};
vm.runInNewContext([
  functionSource("notificationContext", "notificationToDto"),
  functionSource("isMissingNotificationsError", "contactRoute"),
  functionSource("getNotificationSummary", "markNotificationRead", { async: true, nextAsync: true }),
  "globalThis.summary = getNotificationSummary;"
].join("\n"), sandbox);
const plain = (value) => JSON.parse(JSON.stringify(value));
const request = { currentProfile: { id: "profile-viewer-owned", role: "viewer" } };
state.rows = [
  { entity_type: "contact", event_type: "contact.updated", total_count: 140, unread_count: 105 },
  { entity_type: "organization", event_type: "organization.updated", total_count: 8, unread_count: 3 },
  { entity_type: "hospitation_observation", event_type: "observation.updated", total_count: 4, unread_count: 0 },
  { entity_type: "format_participant", event_type: "participant.updated", total_count: 2, unread_count: 1 },
  { entity_type: "profile", event_type: "profile.updated", total_count: 1, unread_count: 1 },
  { entity_type: "product", event_type: "product.updated", total_count: 100, unread_count: 99 },
  { entity_type: "other", event_type: "feature.released", total_count: 30, unread_count: 30 },
  { entity_type: "contact", event_type: "feature.changed", total_count: 1, unread_count: 0 },
  { entity_type: "other", event_type: "account.updated", total_count: 3, unread_count: 1 },
  { entity_type: "other", event_type: "other.updated", total_count: 2, unread_count: 1 }
];
assert.deepEqual(plain(await sandbox.summary(request)), {
  totalCount: 161,
  unreadTotal: 112,
  byContext: { contacts: 105, organizations: 3, formats: 1, team: 2, all: 1 }
}, "Alle zählt gelesene und ungelesene operative Meldungen auch jenseits einer Listenseite. Produktmeldungen bleiben getrennt.");
assert.equal(state.profileCalls, 1, "Die Zusammenfassung lädt den bestehenden Profilkontext.");
assert.deepEqual(plain(state.queries[0].values), ["profile-viewer-owned"], "Die Abfrage bindet ausschließlich den authentifizierten Nutzer.");
assert.match(state.queries[0].sql, /where\s+recipients\.user_id\s*=\s*\$1/i);
assert.match(state.queries[0].sql, /recipients\.dismissed_at\s+is\s+null/i);
assert.match(state.queries[0].sql, /count\(\*\)\s+filter\s*\(where\s+recipients\.read_at\s+is\s+null\)/i);
assert.doesNotMatch(state.queries[0].sql, /\blimit\b|\boffset\b/i, "Die Zusammenfassung darf nicht an eine Listenseite gebunden sein.");

const queriesBefore = state.queries.length;
assert.deepEqual(plain(await sandbox.summary({})), { totalCount: 0, unreadTotal: 0, byContext: {} });
assert.equal(state.queries.length, queriesBefore, "Ohne Nutzer gibt es keine Datenabfrage.");
state.rows = [];
assert.deepEqual(plain(await sandbox.summary(request)), { totalCount: 0, unreadTotal: 0, byContext: {} });
state.error = new Error('relation "notification_events" does not exist');
assert.deepEqual(plain(await sandbox.summary(request)), { totalCount: 0, unreadTotal: 0, byContext: {} });
state.error = new Error("database connection unavailable");
await assert.rejects(sandbox.summary(request), /database connection unavailable/);

const serviceStart = serviceSource.indexOf("getNotificationSummary: async function()");
const serviceEnd = serviceSource.indexOf("\n    markNotificationRead:", serviceStart);
assert.ok(serviceStart >= 0 && serviceEnd > serviceStart);
const serviceFunction = serviceSource.slice(serviceStart, serviceEnd)
  .replace("getNotificationSummary:", "globalThis.getSummary =")
  .replace(/,\s*$/, ";");
const serviceState = { payload: { unreadTotal: 7, byContext: { contacts: 3 } } };
const serviceSandbox = {
  profileCache: new Map([["profile-current", {}]]),
  supportsNotifications: true,
  async apiGet(path) {
    assert.equal(path, "/api/notifications/summary");
    return serviceState.payload;
  }
};
vm.runInNewContext(serviceFunction, serviceSandbox);
assert.deepEqual(plain(await serviceSandbox.getSummary()), {
  totalCount: null, unreadTotal: 7, byContext: { contacts: 3 }
}, "Eine ältere API ohne Gesamtzahl darf nicht als leerer Bestand erscheinen.");
serviceState.payload.totalCount = 12;
assert.equal((await serviceSandbox.getSummary()).totalCount, 12);
serviceState.payload.totalCount = 0;
assert.equal((await serviceSandbox.getSummary()).totalCount, 0);
serviceState.payload.totalCount = false;
assert.equal((await serviceSandbox.getSummary()).totalCount, null);
serviceSandbox.supportsNotifications = false;
assert.deepEqual(plain(await serviceSandbox.getSummary()), { totalCount: null, unreadTotal: 0, byContext: {} });

console.log("Benachrichtigungs-Zusammenfassung geprüft: eigene Gesamtzahl, Lesestatus, Produkttrennung, Nutzerbindung, Seitengrenzen und ältere API.");
