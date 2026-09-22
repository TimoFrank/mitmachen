import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { digest, json, prepareArchive, promoteArchive, validateSnapshot, verifyArchive } from "./archive.mjs";
import { refresh } from "./refresh.mjs";
import { DOMAIN_TABLES } from "./extract-remote.mjs";

const render = async () => "<!doctype html><html lang=\"de\"><title>Synthetische Lesekopie</title><p>Nur Testdaten</p></html>";

function fixture({ exportedAt = "2026-09-19T10:00:00.000Z", withAsset = true } = {}) {
  const data = Object.fromEntries(DOMAIN_TABLES.filter(name => name !== "network_registrations").map((name, index) => [
    name,
    [{ id: `synthetic-${index + 1}`, label: "Synthetischer Testdatensatz" }]
  ]));
  data.contact_note_attachments = [];
  if (withAsset) data.contacts[0].image_storage_path = "synthetic/image.txt";
  const bytes = Buffer.from("Synthetische Testanlage; keine personenbezogenen Daten.\n");
  return {
    schemaVersion: 1,
    sourceUrl: "https://versorgungs-kompass.de",
    exportedAt,
    databaseReadOnly: true,
    databaseIsolation: "repeatable read",
    data,
    counts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])),
    tableHashes: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, digest(JSON.stringify(rows))])),
    assets: withAsset ? [{ key: "synthetic-private-attachment", table: "contacts", recordId: data.contacts[0].id, field: "image_storage_path", storageGeneration: "1", mimeType: "text/plain", size: bytes.length, sha256: digest(bytes), base64: bytes.toString("base64") }] : [],
    completeness: { databaseComplete: true, privateAssetsComplete: true, expectedPrivateAssetCount: withAsset ? 1 : 0, capturedPrivateAssetCount: withAsset ? 1 : 0, missingAssets: [] },
    externalSources: { bundestagHealthCommittee: { status: "captured" } }
  };
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kompass-offline-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function installed(t) {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  await promoteArchive(root, archive);
  return { root, archive, target: await fs.readlink(path.join(root, "current")) };
}

async function assertPreserved(root, target) {
  assert.equal(await fs.readlink(path.join(root, "current")), target);
  await verifyArchive(path.join(root, "current"));
  assert.equal((await fs.readdir(path.join(root, "snapshots"))).some(name => name.startsWith(".pending-")), false);
}

test("vollstaendige synthetische Lesekopie wird geprueft und atomar umgeschaltet", async t => {
  const { root, archive: first, target } = await installed(t);
  const next = await prepareArchive(root, fixture({ exportedAt: "2026-09-19T11:00:00.000Z" }), render);
  assert.equal(await fs.readlink(path.join(root, "current")), target, "Vorbereitung darf den letzten Stand nicht ersetzen");
  const manifest = await promoteArchive(root, next);
  assert.equal(await fs.readlink(path.join(root, "current")), path.relative(root, next.destination));
  assert.equal(manifest.totalRows, 29);
  assert.equal(Object.keys(manifest.tables).length, 30);
  assert.equal(manifest.assetReferences, 1);
  await verifyArchive(first.destination);
  await verifyArchive(path.join(root, "current"));
  assert.equal((await fs.stat(next.destination)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(next.destination, "snapshot.json"))).mode & 0o777, 0o600);
  const saved = JSON.parse(await fs.readFile(path.join(next.destination, "snapshot.json"), "utf8"));
  assert.equal("base64" in saved.assets[0], false);
});

test("fehlgeschlagener Viewer-Bau erhaelt den letzten Stand und entfernt Zwischenablagen", async t => {
  const { root, target } = await installed(t);
  await assert.rejects(prepareArchive(root, fixture(), async () => { throw new Error("SYNTHETIC_RENDER_FAILURE"); }), /SYNTHETIC_RENDER_FAILURE/);
  await assertPreserved(root, target);
});

test("verfaelschte Anlage verhindert Vorbereitung und erhaelt den letzten Stand", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.assets[0].base64 = Buffer.from("Beschaedigt").toString("base64");
  await assert.rejects(prepareArchive(root, snapshot, render), /ASSET_INTEGRITY_FAILED/);
  await assertPreserved(root, target);
});

test("fehlende private Anlagen verhindern Uebernahme", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.completeness.missingAssets = ["synthetic-missing-attachment"];
  await assert.rejects(prepareArchive(root, snapshot, render), /PRIVATE_ASSETS_MISSING/);
  await assertPreserved(root, target);
});

test("abweichende Tabellenanzahl wird vor jedem Schreiben abgewiesen", () => {
  const snapshot = fixture();
  snapshot.counts.contacts += 1;
  assert.throws(() => validateSnapshot(snapshot), /SNAPSHOT_COUNT_MISMATCH/);
});

test("nachtraeglich veraenderte Snapshot-Datei wird erkannt", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  await fs.appendFile(path.join(archive.staging, "snapshot.json"), " ");
  await assert.rejects(verifyArchive(archive.staging), /ARCHIVE_INTEGRITY_FAILED/);
});

test("nachtraeglich geloeschte private Anlage wird erkannt", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  const asset = Object.keys(archive.manifest.files).find(name => name.startsWith("assets/"));
  await fs.unlink(path.join(archive.staging, asset));
  await assert.rejects(verifyArchive(archive.staging));
});

test("Manifest-Pfade ausserhalb des Archivs werden abgewiesen", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  archive.manifest.files["../outside.txt"] = { sha256: digest("outside"), size: 7 };
  await fs.writeFile(path.join(archive.staging, "manifest.json"), json(archive.manifest));
  await assert.rejects(verifyArchive(archive.staging), /MANIFEST_PATH_INVALID/);
});

test("abweichende Tabellen-Pruefsummen werden erkannt", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  archive.manifest.tables.contacts.count += 1;
  await fs.writeFile(path.join(archive.staging, "manifest.json"), json(archive.manifest));
  await assert.rejects(verifyArchive(archive.staging), /TABLE_INTEGRITY_FAILED/);
});

test("Manifest darf weder eine private Anlage noch deren Pruefung auslassen", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  const asset = Object.keys(archive.manifest.files).find(name => name.startsWith("assets/"));
  await fs.unlink(path.join(archive.staging, asset));
  delete archive.manifest.files[asset];
  await fs.writeFile(path.join(archive.staging, "manifest.json"), json(archive.manifest));
  await assert.rejects(verifyArchive(archive.staging));
});

test("Manifest darf keine Tabelle aus der Integritaetspruefung auslassen", async t => {
  const root = await workspace(t);
  const archive = await prepareArchive(root, fixture(), render);
  delete archive.manifest.tables.contacts;
  await fs.writeFile(path.join(archive.staging, "manifest.json"), json(archive.manifest));
  await assert.rejects(verifyArchive(archive.staging));
});

test("Konfigurationsfehler beim Aktualisieren erhaelt aktuellen Stand und gibt Sperre frei", async t => {
  const { root, target } = await installed(t);
  await fs.writeFile(path.join(root, "config.json"), "{}\n");
  await assert.rejects(refresh(root), /CONFIG_INVALID/);
  await assertPreserved(root, target);
  const status = JSON.parse(await fs.readFile(path.join(root, "status.json"), "utf8"));
  assert.equal(status.ok, false);
  assert.equal(status.code, "CONFIG_INVALID");
  assert.equal(status.lastSnapshotPreserved, true);
  await assert.rejects(fs.stat(path.join(root, ".refresh.lock")), { code: "ENOENT" });
});

test("Veraenderung zwischen Vorbereitung und Umschalten erhaelt den letzten Stand", async t => {
  const { root, target } = await installed(t);
  const next = await prepareArchive(root, fixture({ exportedAt: "2026-09-19T11:00:00.000Z" }), render);
  await fs.appendFile(path.join(next.staging, "index.html"), "<!-- synthetische Beschaedigung -->");
  await assert.rejects(promoteArchive(root, next), /ARCHIVE_INTEGRITY_FAILED/);
  assert.equal(await fs.readlink(path.join(root, "current")), target);
  await verifyArchive(path.join(root, "current"));
  await assert.rejects(fs.stat(next.destination), { code: "ENOENT" });
});

test("noch nicht gesicherte externe Quelle verhindert Uebernahme", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.externalSources.bundestagHealthCommittee.status = "pending_local_capture";
  await assert.rejects(prepareArchive(root, snapshot, render), /EXTERNAL_SOURCE_MISSING/);
  await assertPreserved(root, target);
});

test("noch nicht gesicherte externe Bilder verhindern Uebernahme", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.completeness.externalAssetsPending = 1;
  await assert.rejects(prepareArchive(root, snapshot, render), /EXTERNAL_ASSETS_PENDING/);
  await assertPreserved(root, target);
});

test("30 Tabellen mit fehlendem Pflichtbereich gelten nicht als vollstaendig", () => {
  const snapshot = fixture();
  delete snapshot.data.contacts;
  delete snapshot.counts.contacts;
  snapshot.data.synthetic_unrelated_table = [];
  snapshot.counts.synthetic_unrelated_table = 0;
  assert.throws(() => validateSnapshot(snapshot), /SNAPSHOT_REQUIRED_TABLE_MISSING/);
});

test("leere Fehlerliste kann fehlende private Anlagen nicht verdecken", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.assets = [];
  snapshot.completeness.missingAssets = [];
  await assert.rejects(prepareArchive(root, snapshot, render), /PRIVATE_ASSET_COVERAGE_INCOMPLETE/);
  await assertPreserved(root, target);
});

test("auf null gesetzte Anlagenzahlen koennen eine Datensatzreferenz nicht verdecken", () => {
  const snapshot = fixture();
  snapshot.assets = [];
  snapshot.completeness.expectedPrivateAssetCount = 0;
  snapshot.completeness.capturedPrivateAssetCount = 0;
  assert.throws(() => validateSnapshot(snapshot), /PRIVATE_ASSET_COVERAGE_INCOMPLETE/);
});

test("abweichende Anlagenzahlen werden abgewiesen", () => {
  const snapshot = fixture();
  snapshot.completeness.capturedPrivateAssetCount = 0;
  assert.throws(() => validateSnapshot(snapshot), /PRIVATE_ASSET_COUNT_MISMATCH/);
});

test("Snapshot ohne bestaetigten schreibgeschuetzten konsistenten Export wird abgewiesen", () => {
  for (const field of ["databaseReadOnly", "databaseIsolation"]) {
    const snapshot = fixture();
    delete snapshot[field];
    assert.throws(() => validateSnapshot(snapshot), /SNAPSHOT_SOURCE_NOT_VERIFIED/, field);
  }
  for (const field of ["databaseComplete", "privateAssetsComplete"]) {
    const snapshot = fixture();
    delete snapshot.completeness[field];
    assert.throws(() => validateSnapshot(snapshot), /SNAPSHOT_SOURCE_NOT_VERIFIED/, field);
  }
});

test("Aenderung nach der Quell-Pruefsumme verhindert Archivierung", async t => {
  const { root, target } = await installed(t);
  const snapshot = fixture();
  snapshot.data.contacts[0].label = "Synthetischer geaenderter Wert";
  await assert.rejects(prepareArchive(root, snapshot, render), /SOURCE_TABLE_INTEGRITY_FAILED/);
  await assertPreserved(root, target);
});

test("unverfaelschter Snapshot ohne private Referenzen bleibt gueltig", () => {
  assert.doesNotThrow(() => validateSnapshot(fixture({ withAsset: false })));
});
