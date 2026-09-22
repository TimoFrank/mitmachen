import { createHash } from "node:crypto";

// This explicit contract excludes credentials, identity bindings and access lists.
export const SYNC_PROTOCOL = 1;
export const SYNC_TABLES = Object.freeze([
  "profiles", "organizations", "organization_primary_systems", "contacts", "contact_owners",
  "changes", "activity_events", "contact_notes", "contact_note_attachments", "formats",
  "format_participants", "hospitation_slots", "hospitations", "hospitation_observations",
  "hospitation_observation_changes", "roadmap_items", "hospitation_roadmap_assessments",
  "hospitation_unmet_needs", "expert_groups", "expert_contacts", "expert_organizations",
  "expert_entity_links", "stakeholder_types", "stakeholder_organizations", "stakeholder_people",
  "saved_views", "user_settings", "notification_events", "notification_recipients", "import_runs"
]);
export const AUDIT_TABLES = new Set(["changes", "activity_events", "hospitation_observation_changes", "notification_events", "notification_recipients", "import_runs"]);
export const ENTITY_TABLES = SYNC_TABLES.filter(table => !AUDIT_TABLES.has(table));
export const PRIMARY_KEYS = Object.freeze({ contact_owners: ["contact_id", "profile_id"], user_settings: ["user_id"], notification_recipients: ["event_id", "user_id"] });
const DERIVED = new Set(["created_at", "updated_at", "search_document", "search_vector", "search_text"]);
const ROUTES = [
  ["POST", /^\/api\/(?:contacts|organizations|organization-primary-systems|contact-notes|expert-contacts|expert-organizations|expert-entity-links|saved-views|hospitation-slots|hospitations|hospitation-observations|hospitation-roadmap-assessments|hospitation-unmet-needs|formats)$/u],
  ["PATCH", /^\/api\/(?:contacts|organizations|organization-primary-systems|contact-notes|expert-contacts|saved-views|hospitation-slots|hospitations|hospitation-observations|hospitation-roadmap-assessments|hospitation-unmet-needs|formats)\/[^/]+$/u],
  ["DELETE", /^\/api\/(?:organization-primary-systems|contact-notes|expert-entity-links|saved-views|hospitation-slots|hospitations|hospitation-observations|hospitation-roadmap-assessments|hospitation-unmet-needs)\/[^/]+$/u],
  ["PATCH", /^\/api\/profile$/u], ["PUT", /^\/api\/user-settings$/u],
  ["PUT", /^\/api\/hospitations\/[^/]+\/(?:observations\/sync|roadmap-assessments|unmet-needs)$/u],
  ["POST", /^\/api\/formats\/[^/]+\/(?:participants|archive|restore)$/u],
  ["POST", /^\/api\/formats\/[^/]+\/participants\/batch$/u],
  ["DELETE", /^\/api\/formats\/[^/]+$/u],
  ["PATCH", /^\/api\/formats\/[^/]+\/participants\/[^/]+$/u],
  ["DELETE", /^\/api\/formats\/[^/]+\/participants\/[^/]+$/u],
  ["PATCH", /^\/api\/notifications\/(?:read|[^/]+\/read)$/u],
  ["POST", /^\/api\/notifications\/(?:read-all|dismiss-all)$/u]
];
export const syncError = (code, status = 409) => Object.assign(new Error(code), { code, status });
export function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
export const fingerprint = value => createHash("sha256").update(stable(value)).digest("hex");
export function rowKey(table, row) {
  if (!SYNC_TABLES.includes(table) || !row || typeof row !== "object") throw syncError("SYNC_ROW_INVALID", 400);
  const keys = PRIMARY_KEYS[table] || ["id"];
  if (keys.some(key => row[key] === null || row[key] === undefined)) throw syncError("SYNC_KEY_MISSING", 400);
  return stable(keys.map(key => String(row[key])));
}
export function comparable(row) {
  return row === null ? null : Object.fromEntries(Object.entries(row).filter(([key]) => !DERIVED.has(key)));
}
export const sameRow = (left, right) => stable(comparable(left)) === stable(comparable(right));
export function rowChanges(before, after, { includeVersions = false } = {}) {
  const changes = [];
  for (const table of ENTITY_TABLES) {
    const oldRows = new Map((before[table] || []).map(row => [rowKey(table, row), row]));
    const newRows = new Map((after[table] || []).map(row => [rowKey(table, row), row]));
    for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const previous = oldRows.get(key) || null, next = newRows.get(key) || null;
      if (!sameRow(previous, next) || (includeVersions && previous?.updated_at !== next?.updated_at)) changes.push({ table, key, before: previous, after: next });
    }
  }
  return changes;
}
export function conflictsFor(guards, data) {
  return guards.flatMap(guard => {
    const remote = data[guard.table]?.find(row => rowKey(guard.table, row) === guard.key) || null;
    return sameRow(guard.before, remote) ? [] : [{ ...guard, remote }];
  });
}
export function validateOperation(operation) {
  if (!operation || operation.protocol !== SYNC_PROTOCOL || !/^[a-f0-9-]{36}$/u.test(operation.id || "")) throw syncError("SYNC_OPERATION_INVALID", 400);
  if (!ROUTES.some(([method, route]) => method === operation.method && route.test(operation.path))
    || /[?\\#\u0000-\u001f]|%(?:2f|5c|00)/iu.test(operation.path)) throw syncError("SYNC_ROUTE_DISABLED", 403);
  if (!operation.body || Array.isArray(operation.body) || typeof operation.body !== "object" || Buffer.byteLength(stable(operation.body)) > 1_000_000) throw syncError("SYNC_BODY_INVALID", 400);
  if (!Array.isArray(operation.guards) || operation.guards.length > 2000) throw syncError("SYNC_GUARDS_INVALID", 400);
  const seen = new Set();
  for (const guard of operation.guards) {
    if (!ENTITY_TABLES.includes(guard.table) || typeof guard.key !== "string" || guard.key.length > 1000) throw syncError("SYNC_GUARDS_INVALID", 400);
    if (guard.before !== null && rowKey(guard.table, guard.before) !== guard.key) throw syncError("SYNC_GUARDS_INVALID", 400);
    if (guard.after !== null && rowKey(guard.table, guard.after) !== guard.key) throw syncError("SYNC_GUARDS_INVALID", 400);
    const key = `${guard.table}:${guard.key}`;
    if (seen.has(key)) throw syncError("SYNC_GUARDS_INVALID", 400);
    seen.add(key);
  }
  return operation;
}
export function operationFingerprint(operation) {
  return fingerprint({ protocol: operation.protocol, id: operation.id, method: operation.method, path: operation.path, body: operation.body });
}
// Local SQL defaults (for example assignment/documentation times) differ from
// the values accepted online. Carry the acknowledged values into the next
// operation's comparison, without changing its original retained draft.
export function prepareOperation(operation, receipts) {
  const prepared = structuredClone(operation);
  for (const entry of receipts.filter(item => Number(item.sequence) > Number(operation.normalizationCursor || 0))) {
    for (const accepted of entry.receipt?.changes || []) {
      const local = entry.operation.guards.find(guard => guard.table === accepted.table && guard.key === accepted.key)?.after;
      const remote = accepted.after;
      if (!local || !remote) continue;
      for (const guard of prepared.guards) {
        if (guard.table !== accepted.table || guard.key !== accepted.key || !guard.before) continue;
        for (const field of Object.keys(local)) if (stable(guard.before[field]) === stable(local[field]) && Object.hasOwn(remote, field)) guard.before[field] = remote[field];
      }
    }
  }
  function alignVersions(value) {
    if (!value || typeof value !== "object") return;
    const id = value.id || value.participantId || value.participant_id;
    const participant = /^\/api\/formats\/([^/]+)\/participants\/([^/]+)$/u.exec(prepared.path);
    const formatAction = /^\/api\/formats\/([^/]+)\/(?:archive|restore)$/u.exec(prepared.path);
    const matching = prepared.guards.filter(guard => {
      if (!guard.before?.updated_at) return false;
      if (participant) return guard.table === "format_participants" && String(guard.before.format_id) === decodeURIComponent(participant[1]) && String(guard.before.contact_id) === decodeURIComponent(participant[2]);
      if (formatAction) return guard.table === "formats" && String(guard.before.id) === decodeURIComponent(formatAction[1]);
      return id ? String(guard.before.id) === String(id) : prepared.path.endsWith(`/${encodeURIComponent(guard.before.id)}`);
    });
    for (const [key, item] of Object.entries(value)) {
      if (["expectedUpdatedAt", "expected_updated_at", "_expected_updated_at"].includes(key) && matching.length === 1) value[key] = matching[0].before.updated_at;
      else if (item && typeof item === "object") alignVersions(item);
    }
  }
  alignVersions(prepared.body);
  return prepared;
}
export function syncRouteAllowed(method, path) {
  try { validateOperation({ protocol: 1, id: "00000000-0000-4000-8000-000000000000", method, path, body: {}, guards: [] }); return true; }
  catch { return false; }
}
