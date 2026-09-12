#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const validator = fileURLToPath(new URL("./validate-cutover-open-gates.mjs", import.meta.url));
const temporaryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), "vk-cutover-gates-test-"));
const migrationDirectory = path.join(temporaryRoot, "migration");
const stateDirectory = path.join(temporaryRoot, "state");
const restoreDirectory = path.join(stateDirectory, "restore-tests", "20260911T120000Z");
const allowedEmails = path.join(temporaryRoot, "allowed-emails");
const gateFile = path.join(temporaryRoot, "cutover-open-gates.conf");
const appHost = "versorgungs-kompass.de";
const sourceRevision = "a".repeat(40);
const gkeSha256 = "b".repeat(64);
const snapshotId = "c".repeat(64);
const bucketSha256 = "d".repeat(64);
const dnsSha256 = "e".repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");

function run(args, input = "") {
  return spawnSync(process.execPath, [validator, ...args], { encoding: "utf8", input });
}

try {
  mkdirSync(migrationDirectory, { recursive: true });
  mkdirSync(restoreDirectory, { recursive: true });
  const sums = `${"1".repeat(64)}  database.dump\n`;
  writeFileSync(path.join(migrationDirectory, "SHA256SUMS"), sums);
  writeFileSync(path.join(migrationDirectory, "migration-metadata.tsv"), [
    "key\tvalue",
    `target_revision\t${sourceRevision}`,
    `gke_freeze_state_sha256\t${gkeSha256}`,
    ""
  ].join("\n"));
  writeFileSync(path.join(migrationDirectory, "storage-reference-counts.tsv"), [
    "reference_type\trows",
    "contact_images\t0",
    "contact_note_attachments\t0",
    "profile_images\t0",
    "stakeholder_logos\t0",
    ""
  ].join("\n"));
  const restoreResult = [
    "schemaVersion=1",
    "restoreTest=20260911T120000Z",
    `snapshotId=${snapshotId}`,
    "backupOperationId=20260911T110000Z-42",
    `sourceRevision=${sourceRevision}`,
    "databaseRuntimeReady=true",
    "objectStorageVerified=true",
    "result=success",
    ""
  ].join("\n");
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), restoreResult);
  writeFileSync(allowedEmails, "operator@example.org\n");
  const identityRows = "operator@example.org\tadmin\thttps://accounts.google.com\tsubject-1\tstandard\t\n";
  const identitySha256 = hash(identityRows);
  const gateSource = [
    "schemaVersion=1",
    `appHost=${appHost}`,
    `targetRevision=${sourceRevision}`,
    `migrationPackageSha256=${hash(sums)}`,
    `gkeFreezeStateSha256=${gkeSha256}`,
    `backupSnapshotId=${snapshotId}`,
    `restoreResultSha256=${hash(restoreResult)}`,
    `identityAuditSha256=${identitySha256}`,
    `bucketInventorySha256=${bucketSha256}`,
    `dnsReadbackSha256=${dnsSha256}`,
    `approvedAt=${new Date().toISOString().replace(/\.\d{3}Z$/u, "Z")}`,
    ""
  ].join("\n");
  writeFileSync(gateFile, gateSource);

  const evidence = run(["evidence", gateFile, migrationDirectory, stateDirectory, appHost, sourceRevision]);
  assert.equal(evidence.status, 0, evidence.stderr);
  assert.equal(evidence.stdout, [hash(gateSource), hash(sums), snapshotId, identitySha256, bucketSha256, dnsSha256].join("\t"));

  const identityHash = run(["identity-hash", allowedEmails], identityRows);
  assert.equal(identityHash.status, 0, identityHash.stderr);
  assert.equal(identityHash.stdout, identitySha256);
  assert.equal(run(["identity", identitySha256, allowedEmails], identityRows).status, 0);
  assert.notEqual(run(["identity", "f".repeat(64), allowedEmails], identityRows).status, 0);

  writeFileSync(gateFile, gateSource.replace(`appHost=${appHost}`, "appHost=wrong.example.org"));
  assert.notEqual(run(["evidence", gateFile, migrationDirectory, stateDirectory, appHost, sourceRevision]).status, 0);
  writeFileSync(gateFile, gateSource);
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), `${readFileSync(path.join(restoreDirectory, "RESULT.txt"), "utf8")}unexpected=true\n`);
  assert.notEqual(run(["evidence", gateFile, migrationDirectory, stateDirectory, appHost, sourceRevision]).status, 0);

  console.log("Cutover open gate test OK: migration, restore, identity and external evidence hashes are fail-closed bound.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
