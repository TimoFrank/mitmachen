#!/usr/bin/env node

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let snapshots;
try {
  snapshots = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  console.error("FEHLER: Restic-Snapshot-Inventar ist kein gueltiges JSON.");
  process.exit(1);
}
if (!Array.isArray(snapshots)) {
  console.error("FEHLER: Restic-Snapshot-Inventar ist keine Liste.");
  process.exit(1);
}
const [expectedId = "", expectedRevision = "", expectedVersion = ""] = process.argv.slice(2);
const exactMode = Boolean(expectedId || expectedRevision || expectedVersion);
if (exactMode && (
  !/^[a-f0-9]{64}$/u.test(expectedId)
  || !/^[a-f0-9]{40,64}$/u.test(expectedRevision)
  || !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(expectedVersion)
)) {
  console.error("FEHLER: Erwartete Snapshot-Provenienz ist ungueltig.");
  process.exit(1);
}
const rows = [];
const seenIds = new Set();
for (const snapshot of snapshots) {
  const tags = Array.isArray(snapshot?.tags) ? snapshot.tags : [];
  if (!exactMode && !tags.includes("versorgungs-kompass")) continue;
  const revisions = tags.filter((tag) => /^revision-[a-f0-9]{40,64}$/u.test(tag));
  const versions = tags.filter((tag) => /^version-[0-9]+\.[0-9]+\.[0-9]+$/u.test(tag));
  const operations = tags.filter((tag) => /^operation-[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$/u.test(tag));
  const operationId = operations[0]?.slice(10) || "";
  const expectedTags = new Set([
    "versorgungs-kompass",
    "daily",
    operations[0],
    revisions[0],
    versions[0]
  ]);
  if (!/^[a-f0-9]{64}$/u.test(snapshot?.id)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(snapshot?.time)
    || snapshot?.hostname !== "versorgungs-kompass-single-server"
    || revisions.length !== 1
    || versions.length !== 1
    || operations.length !== 1
    || tags.length !== 5
    || new Set(tags).size !== tags.length
    || tags.some((tag) => !expectedTags.has(tag))
    || !Array.isArray(snapshot?.paths)
    || snapshot.paths.length !== 2
    || snapshot.paths[0] !== `/source/database/snapshots/${operationId}`
    || snapshot.paths[1] !== "/source/object-storage"
    || seenIds.has(snapshot.id)) {
    console.error("FEHLER: Final markierter Snapshot besitzt unvollstaendige Provenienz.");
    process.exit(1);
  }
  seenIds.add(snapshot.id);
  rows.push([snapshot.id, snapshot.time, revisions[0].slice(9), versions[0].slice(8), operationId]);
}
if (exactMode && (
  snapshots.length !== 1
  || rows.length !== 1
  || rows[0][0] !== expectedId
  || rows[0][2] !== expectedRevision
  || rows[0][3] !== expectedVersion
)) {
  console.error("FEHLER: Snapshot passt nicht exakt zur ausgewaehlten ID, Revision und Version.");
  process.exit(1);
}
rows.sort((left, right) => right[1].localeCompare(left[1]));
console.log("snapshot_id\ttime_utc\tsource_revision\tproduct_version\toperation_id");
for (const row of rows) console.log(row.join("\t"));
