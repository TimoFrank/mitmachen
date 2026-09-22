import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DOMAIN_TABLES } from "./extract-remote.mjs";

export const digest = value => createHash("sha256").update(value).digest("hex");
export const json = value => JSON.stringify(value, null, 2) + "\n";
const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif", "application/pdf": ".pdf", "text/plain": ".txt", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx" };

export async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

export async function writePrivate(file, contents) {
  await fs.writeFile(file, contents, { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

export function validateSnapshot(snapshot) {
  if (snapshot.schemaVersion !== 1 || !Number.isFinite(Date.parse(snapshot.exportedAt)) || snapshot.sourceUrl !== "https://versorgungs-kompass.de") throw new Error("SNAPSHOT_INVALID");
  if (!snapshot.data || !snapshot.counts || Object.keys(snapshot.data).length < 30) throw new Error("SNAPSHOT_INCOMPLETE");
  if (snapshot.databaseReadOnly !== true || snapshot.databaseIsolation !== "repeatable read" || snapshot.completeness?.databaseComplete !== true || snapshot.completeness?.privateAssetsComplete !== true) throw new Error("SNAPSHOT_SOURCE_NOT_VERIFIED");
  if (DOMAIN_TABLES.filter(table => table !== "network_registrations").some(table => !Object.hasOwn(snapshot.data, table))) throw new Error("SNAPSHOT_REQUIRED_TABLE_MISSING");
  if (Object.keys(snapshot.counts).sort().join() !== Object.keys(snapshot.data).sort().join()) throw new Error("SNAPSHOT_COUNT_MISMATCH");
  for (const [table, rows] of Object.entries(snapshot.data)) {
    if (!/^[a-z][a-z0-9_]*$/.test(table) || !Array.isArray(rows) || snapshot.counts[table] !== rows.length) throw new Error("SNAPSHOT_COUNT_MISMATCH");
    if (snapshot.tableHashes?.[table] !== digest(JSON.stringify(rows))) throw new Error("SOURCE_TABLE_INTEGRITY_FAILED");
  }
  if ((snapshot.completeness?.missingAssets || []).length) throw new Error("PRIVATE_ASSETS_MISSING");
  if (snapshot.completeness?.databaseComplete === false || snapshot.completeness?.privateAssetsComplete === false) throw new Error("SNAPSHOT_INCOMPLETE");
  const expected = snapshot.completeness?.expectedPrivateAssetCount;
  if (expected !== undefined && expected !== snapshot.completeness.capturedPrivateAssetCount) throw new Error("PRIVATE_ASSET_COUNT_MISMATCH");
  const requiredAssets = [
    ...snapshot.data.profiles.filter(row => String(row.avatar_url || "").startsWith("gs://")).map(row => ["profiles", row.id ?? row.user_id, "avatar_url"]),
    ...snapshot.data.contacts.filter(row => row.image_storage_path).map(row => ["contacts", row.id, "image_storage_path"]),
    ...snapshot.data.contact_note_attachments.map(row => ["contact_note_attachments", row.id, "storage_path"]),
    ...snapshot.data.stakeholder_organizations.filter(row => String(row.logo_url || "").startsWith("private://stakeholder-logos/")).map(row => ["stakeholder_organizations", row.id, "logo_url"])
  ];
  const privateAssets = (snapshot.assets || []).filter(asset => asset.storageGeneration);
  if (requiredAssets.length !== expected || privateAssets.length !== expected || requiredAssets.some(([table, id, field]) => !privateAssets.some(asset => asset.table === table && asset.recordId === String(id) && asset.field === field))) throw new Error("PRIVATE_ASSET_COVERAGE_INCOMPLETE");
  if (Object.values(snapshot.externalSources || {}).some(source => source.status !== "captured")) throw new Error("EXTERNAL_SOURCE_MISSING");
  if (snapshot.completeness?.externalAssetsPending || snapshot.completeness?.relativeAssetsPending) throw new Error("EXTERNAL_ASSETS_PENDING");
}

export async function prepareArchive(root, snapshot, render) {
  validateSnapshot(snapshot);
  await privateDirectory(root);
  const snapshots = path.join(root, "snapshots");
  await privateDirectory(snapshots);
  const id = snapshot.exportedAt.replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const staging = path.join(snapshots, ".pending-" + id);
  await privateDirectory(staging);
  await privateDirectory(path.join(staging, "assets"));
  try {
    const assets = [];
    const files = {};
    for (const source of snapshot.assets || []) {
      const bytes = Buffer.from(source.base64 || "", "base64");
      if (!source.base64 || bytes.length !== source.size || digest(bytes) !== source.sha256) throw new Error("ASSET_INTEGRITY_FAILED");
      const relativePath = "assets/" + source.sha256 + (extensions[source.mimeType] || ".bin");
      await writePrivate(path.join(staging, relativePath), bytes);
      files[relativePath] = { sha256: source.sha256, size: bytes.length };
      const { base64, ...metadata } = source;
      assets.push({ ...metadata, relativePath });
    }
    const saved = { ...snapshot, assets };
    const snapshotText = json(saved);
    const html = await render({ snapshot: saved, assets });
    if (!html.includes("<!DOCTYPE html>") && !html.includes("<!doctype html>")) throw new Error("VIEWER_INVALID");
    await writePrivate(path.join(staging, "snapshot.json"), snapshotText);
    await writePrivate(path.join(staging, "index.html"), html);
    files["snapshot.json"] = { sha256: digest(snapshotText), size: Buffer.byteLength(snapshotText) };
    files["index.html"] = { sha256: digest(html), size: Buffer.byteLength(html) };
    const manifest = {
      schemaVersion: 1, snapshotId: id, exportedAt: saved.exportedAt, sourceUrl: saved.sourceUrl,
      createdAt: new Date().toISOString(), sourceRuntime: saved.sourceRuntime,
      counts: saved.counts, totalRows: Object.values(saved.counts).reduce((sum, value) => sum + value, 0),
      assetReferences: assets.length, uniqueFiles: Object.keys(files).length - 2,
      completeness: saved.completeness, externalSources: saved.externalSources,
      tables: Object.fromEntries(Object.entries(saved.data).map(([name, rows]) => [name, { count: rows.length, sha256: digest(JSON.stringify(rows)) }])),
      files
    };
    await writePrivate(path.join(staging, "manifest.json"), json(manifest));
    await verifyArchive(staging);
    return { staging, destination: path.join(snapshots, id), manifest };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyArchive(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  if (!manifest.files?.["snapshot.json"] || !manifest.files?.["index.html"]) throw new Error("MANIFEST_COVERAGE_INCOMPLETE");
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^(?:assets\/[a-f0-9]{64}\.[a-z0-9]+|index\.html|snapshot\.json)$/.test(name)) throw new Error("MANIFEST_PATH_INVALID");
    const value = await fs.readFile(path.join(directory, name));
    if (digest(value) !== expected.sha256 || value.length !== expected.size) throw new Error("ARCHIVE_INTEGRITY_FAILED");
  }
  const snapshot = JSON.parse(await fs.readFile(path.join(directory, "snapshot.json"), "utf8"));
  validateSnapshot(snapshot);
  const expectedFiles = new Set(["snapshot.json", "index.html", ...(snapshot.assets || []).map(asset => asset.relativePath)]);
  if (expectedFiles.size !== Object.keys(manifest.files).length || [...expectedFiles].some(file => !Object.hasOwn(manifest.files, file))) throw new Error("MANIFEST_COVERAGE_INCOMPLETE");
  if (Object.keys(snapshot.data).sort().join() !== Object.keys(manifest.tables || {}).sort().join()) throw new Error("MANIFEST_COVERAGE_INCOMPLETE");
  if (JSON.stringify(manifest.counts) !== JSON.stringify(snapshot.counts) || manifest.totalRows !== Object.values(snapshot.counts).reduce((sum, count) => sum + count, 0)) throw new Error("MANIFEST_COUNTS_INVALID");
  for (const asset of snapshot.assets || []) {
    const expected = manifest.files[asset.relativePath];
    if (expected.sha256 !== asset.sha256 || expected.size !== asset.size) throw new Error("ASSET_INTEGRITY_FAILED");
  }
  for (const [name, expected] of Object.entries(manifest.tables)) {
    if (snapshot.data[name]?.length !== expected.count || digest(JSON.stringify(snapshot.data[name])) !== expected.sha256) throw new Error("TABLE_INTEGRITY_FAILED");
  }
  return manifest;
}

export async function promoteArchive(root, archive) {
  await verifyArchive(archive.staging);
  await fs.rename(archive.staging, archive.destination);
  const temporary = path.join(root, ".current-" + randomUUID());
  await fs.symlink(path.relative(root, archive.destination), temporary);
  await fs.rename(temporary, path.join(root, "current"));
  return archive.manifest;
}
