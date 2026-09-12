#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const validator = fileURLToPath(new URL("./validate-code-reopen-gates.mjs", import.meta.url));
const contractHasher = fileURLToPath(new URL("./hash-persistence-contract.mjs", import.meta.url));
const temporaryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), "vk-code-reopen-test-"));
const stateDirectory = path.join(temporaryRoot, "state");
const gateFile = path.join(temporaryRoot, "code-reopen-gates.conf");
const initialFile = path.join(stateDirectory, ".initial-cutover-attestation");
const closedFile = path.join(stateDirectory, ".cutover-closed-attestation");
const deploymentFile = path.join(stateDirectory, ".closed-deployment-attestation");
const appHost = "versorgungs-kompass.de";
const initialRevision = "a".repeat(40);
const targetRevision = "b".repeat(40);
const snapshotId = "c".repeat(64);
const identitySha256 = "d".repeat(64);
const persistenceSha256 = "e".repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = Math.floor(Date.now() / 1000) * 1000;
const iso = (milliseconds) => new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/u, "Z");
const compact = (milliseconds) => iso(milliseconds).replaceAll("-", "").replaceAll(":", "");
const closedAt = now - 5 * 60 * 1000;
const deployedAt = now - 4 * 60 * 1000;
const backupAt = now - 3 * 60 * 1000;
const restoreAt = now - 2 * 60 * 1000;
const restoreTimestamp = compact(restoreAt);
const restoreDirectory = path.join(stateDirectory, "restore-tests", restoreTimestamp);

function run(args) {
  return spawnSync(process.execPath, [validator, ...args], { encoding: "utf8" });
}

try {
  mkdirSync(restoreDirectory, { recursive: true });
  const hasherResult = spawnSync(process.execPath, [contractHasher], { encoding: "utf8" });
  assert.equal(hasherResult.status, 0, hasherResult.stderr);
  assert.match(hasherResult.stdout, /^[a-f0-9]{64}\n$/u);

  const initialSource = [
    "schemaVersion=1",
    `appHost=${appHost}`,
    `initialRevision=${initialRevision}`,
    `gateSha256=${"1".repeat(64)}`,
    `migrationPackageSha256=${"2".repeat(64)}`,
    `backupSnapshotId=${"3".repeat(64)}`,
    "promotedAt=2026-09-11T12:00:00Z",
    ""
  ].join("\n");
  writeFileSync(initialFile, initialSource);
  const closedSource = [
    "schemaVersion=1",
    "mode=closed",
    `appHost=${appHost}`,
    `closedFromRevision=${initialRevision}`,
    `initialCutoverSha256=${hash(initialSource)}`,
    `persistenceContractSha256=${persistenceSha256}`,
    `closedAt=${iso(closedAt)}`,
    ""
  ].join("\n");
  writeFileSync(closedFile, closedSource);
  const deploymentSource = [
    "schemaVersion=1",
    "mode=closed",
    `appHost=${appHost}`,
    `deployedRevision=${targetRevision}`,
    `persistenceContractSha256=${persistenceSha256}`,
    `deployedAt=${iso(deployedAt)}`,
    ""
  ].join("\n");
  writeFileSync(deploymentFile, deploymentSource);
  const restoreResult = [
    "schemaVersion=1",
    `restoreTest=${restoreTimestamp}`,
    `snapshotId=${snapshotId}`,
    `backupOperationId=${compact(backupAt)}-42`,
    `sourceRevision=${targetRevision}`,
    "databaseRuntimeReady=true",
    "objectStorageVerified=true",
    "result=success",
    ""
  ].join("\n");
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), restoreResult);
  const gateSource = [
    "schemaVersion=1",
    `appHost=${appHost}`,
    `targetRevision=${targetRevision}`,
    `initialCutoverAttestationSha256=${hash(initialSource)}`,
    `closedAttestationSha256=${hash(closedSource)}`,
    `closedDeploymentAttestationSha256=${hash(deploymentSource)}`,
    `persistenceContractSha256=${persistenceSha256}`,
    `backupSnapshotId=${snapshotId}`,
    `restoreResultSha256=${hash(restoreResult)}`,
    `identityAuditSha256=${identitySha256}`,
    `approvedAt=${iso(now)}`,
    ""
  ].join("\n");
  writeFileSync(gateFile, gateSource);

  const valid = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, [hash(gateSource), hash(initialSource), snapshotId, identitySha256].join("\t"));

  const changedContract = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    "f".repeat(64)
  ]);
  assert.notEqual(changedContract.status, 0, "Ein geaenderter Persistenzvertrag muss den Code-Reopen blockieren.");

  const wrongRevision = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    "9".repeat(40),
    persistenceSha256
  ]);
  assert.notEqual(wrongRevision.status, 0, "Gate und Restore muessen exakt zur Zielrevision passen.");

  const staleClosedAt = now - 8 * 60 * 60 * 1000;
  const staleDeployedAt = now - 7 * 60 * 60 * 1000 - 2 * 60 * 1000;
  const staleBackupAt = now - 7 * 60 * 60 * 1000 - 60 * 1000;
  const staleRestoreAt = now - 7 * 60 * 60 * 1000;
  const staleRestoreTimestamp = compact(staleRestoreAt);
  const staleClosedSource = closedSource.replace(`closedAt=${iso(closedAt)}`, `closedAt=${iso(staleClosedAt)}`);
  const staleDeploymentSource = deploymentSource.replace(`deployedAt=${iso(deployedAt)}`, `deployedAt=${iso(staleDeployedAt)}`);
  const staleRestoreResult = restoreResult
    .replace(`restoreTest=${restoreTimestamp}`, `restoreTest=${staleRestoreTimestamp}`)
    .replace(`backupOperationId=${compact(backupAt)}-42`, `backupOperationId=${compact(staleBackupAt)}-42`);
  writeFileSync(closedFile, staleClosedSource);
  writeFileSync(deploymentFile, staleDeploymentSource);
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), staleRestoreResult);
  const staleRestoreDirectory = path.join(stateDirectory, "restore-tests", staleRestoreTimestamp);
  renameSync(restoreDirectory, staleRestoreDirectory);
  const staleGateSource = gateSource
    .replace(`closedAttestationSha256=${hash(closedSource)}`, `closedAttestationSha256=${hash(staleClosedSource)}`)
    .replace(`closedDeploymentAttestationSha256=${hash(deploymentSource)}`, `closedDeploymentAttestationSha256=${hash(staleDeploymentSource)}`)
    .replace(`restoreResultSha256=${hash(restoreResult)}`, `restoreResultSha256=${hash(staleRestoreResult)}`);
  writeFileSync(gateFile, staleGateSource);
  const staleRestore = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(staleRestore.status, 0, "Ein mehr als sechs Stunden alter Restore darf nicht erneut freigeben.");

  console.log("Code reopen gate test OK: initial cutover, close state, persistence contract, target restore and identity are bound.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
