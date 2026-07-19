import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);
const requests = [];

globalThis.window = globalThis;
window.location = { origin: "https://app.example.invalid" };
window.atob ||= (value) => Buffer.from(value, "base64").toString("binary");
window.btoa ||= (value) => Buffer.from(value, "binary").toString("base64");
window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "api",
  apiBaseUrl: "https://gateway.example.invalid",
  apiCredentials: "include",
  authMode: "oidc",
  requireApiGateway: true
};

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  requests.push({ url, options });
  const cursor = url.searchParams.get("cursor");
  return {
    ok: true,
    status: 200,
    json: async () => ({
      items: [{ id: cursor ? "activity-2" : "activity-1" }],
      nextOffset: cursor ? 20 : 10,
      hasMore: !cursor,
      nextCursor: cursor ? null : "opaque-cursor"
    })
  };
};

const dataServiceSource = fs.readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8");
vm.runInThisContext(dataServiceSource, { filename: "data-service.js" });

const firstPage = await window.dataService.getActivities({
  limit: 250,
  eventKey: "contact.updated",
  category: "master_data",
  changedBy: "profile-1",
  q: "Berlin"
});
assert.deepEqual(firstPage.items, [{ id: "activity-1" }]);
assert.equal(firstPage.nextCursor, "opaque-cursor");
assert.equal(requests[0].url.origin, "https://gateway.example.invalid");
assert.equal(requests[0].url.pathname, "/api/activities");
assert.equal(requests[0].url.searchParams.get("limit"), "100", "Das Browserlimit muss auf 100 begrenzt werden.");
assert.equal(requests[0].url.searchParams.get("offset"), "0");
assert.equal(requests[0].url.searchParams.get("eventKey"), "contact.updated");
assert.equal(requests[0].url.searchParams.get("category"), "master_data");
assert.equal(requests[0].url.searchParams.get("changedBy"), "profile-1");
assert.equal(requests[0].url.searchParams.get("q"), "Berlin");
assert.equal(requests[0].options.credentials, "include");
assert.equal(requests[0].options.headers.Authorization, undefined, "Der Browser darf kein Datenbanktoken erzeugen.");

const cursorPage = await window.dataService.getActivities({ limit: 10, cursor: firstPage.nextCursor });
assert.deepEqual(cursorPage.items, [{ id: "activity-2" }]);
assert.equal(requests[1].url.searchParams.get("cursor"), "opaque-cursor");
assert.equal(requests[1].url.searchParams.has("offset"), false, "Der opake Cursor traegt den Folgeoffset serverseitig.");

await window.dataService.getActivities({ limit: 10, offset: 10, cursor: firstPage.nextCursor });
assert.equal(requests[2].url.searchParams.get("offset"), "10", "Explizite Legacy-Offsets bleiben kompatibel.");

await window.dataService.getContactChanges("contact/with space", {
  eventKey: "contact.updated",
  q: "Berlin"
});
assert.equal(requests[3].url.pathname, "/api/contacts/contact%2Fwith%20space/history");
assert.equal(requests[3].url.searchParams.get("eventKey"), "contact.updated");
assert.equal(requests[3].url.searchParams.get("q"), "Berlin");

const apiSource = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
for (const pattern of [
  /const ACTIVITY_PAGE_SIZE = 500/,
  /function activityMatchesFilters\(/,
  /function legacyChangeVisibleAtSnapshot\(/,
  /function activityRowVisibleToRequest\(/,
  /async function assertContactHistoryVisible\(/,
  /function encodeActivityCursor\(/,
  /function decodeActivityCursor\(/,
  /pageParams\.set\("limit", String\(ACTIVITY_PAGE_SIZE\)\)/,
  /nextCursor: page\.hasMore \? encodeActivityCursor/,
  /skip: cursor \? 0 : offset/,
  /rawVisible: \(row\) => legacyChangeVisibleAtSnapshot/,
  /rawVisible: \(row\) => activityRowVisibleToRequest/
]) {
  assert.match(apiSource, pattern, `Der serverseitige Aktivitaetsvertrag fehlt: ${pattern}`);
}

for (const relativePath of [
  "supabase/schema.sql",
  "supabase/migrations/20260716131500_harden_activity_event_ledger.sql"
]) {
  const sql = fs.readFileSync(new URL(relativePath, projectRoot), "utf8");
  assert.match(sql, /changes_activity_event_contact_fkey/);
  assert.match(sql, /foreign key \(contact_id, activity_event_id\)/);
  assert.match(sql, /activity_events_contact_reference_check/);
  assert.match(sql, /current_profile_role\(\)\) = 'admin'/);
  assert.match(sql, /current_profile_role\(\)\) in \('viewer', 'editor'\)/);
  assert.match(sql, /c\.status <> 'archived'/);
}

console.log("Activity Pagination Test OK: Browser nutzt nur das API; Pagination, Filter, Cursor und Sichtbarkeit bleiben serverseitig abgesichert.");
