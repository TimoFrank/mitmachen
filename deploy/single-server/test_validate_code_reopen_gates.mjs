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
const invalidCalendarAlias = (milliseconds) => {
  const value = new Date(milliseconds);
  const targetMonth = value.getUTCMonth();
  const previousMonthYear = targetMonth === 0 ? value.getUTCFullYear() - 1 : value.getUTCFullYear();
  const previousMonth = targetMonth === 0 ? 12 : targetMonth;
  const previousMonthDays = new Date(Date.UTC(value.getUTCFullYear(), targetMonth, 0)).getUTCDate();
  const invalidDay = previousMonthDays + value.getUTCDate();
  return `${previousMonthYear}${String(previousMonth).padStart(2, "0")}${String(invalidDay).padStart(2, "0")}T${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}${String(value.getUTCSeconds()).padStart(2, "0")}Z`;
};
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
    "preparedAt=2026-09-11T12:00:00Z",
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

  const invalidPreparedSource = initialSource.replace(
    "preparedAt=2026-09-11T12:00:00Z",
    "preparedAt=2026-02-30T12:00:00Z"
  );
  const invalidPreparedGateSource = gateSource.replace(
    `initialCutoverAttestationSha256=${hash(initialSource)}`,
    `initialCutoverAttestationSha256=${hash(invalidPreparedSource)}`
  ).replace(
    `closedAttestationSha256=${hash(closedSource)}`,
    `closedAttestationSha256=${hash(closedSource.replace(hash(initialSource), hash(invalidPreparedSource)))}`
  );
  const invalidPreparedClosedSource = closedSource.replace(hash(initialSource), hash(invalidPreparedSource));
  writeFileSync(initialFile, invalidPreparedSource);
  writeFileSync(closedFile, invalidPreparedClosedSource);
  writeFileSync(gateFile, invalidPreparedGateSource);
  const invalidIsoCalendarDay = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(invalidIsoCalendarDay.status, 0, "Ungueltige Kalendertage in ISO-UTC-Zeitpunkten muessen blockieren.");
  writeFileSync(initialFile, initialSource);
  writeFileSync(closedFile, closedSource);
  writeFileSync(gateFile, gateSource);

  const equalPreparedClosedInitialSource = initialSource.replace(
    "preparedAt=2026-09-11T12:00:00Z",
    `preparedAt=${iso(closedAt)}`
  );
  const equalPreparedClosedSource = closedSource.replace(
    hash(initialSource),
    hash(equalPreparedClosedInitialSource)
  );
  const equalPreparedClosedGateSource = gateSource
    .replace(
      `initialCutoverAttestationSha256=${hash(initialSource)}`,
      `initialCutoverAttestationSha256=${hash(equalPreparedClosedInitialSource)}`
    )
    .replace(
      `closedAttestationSha256=${hash(closedSource)}`,
      `closedAttestationSha256=${hash(equalPreparedClosedSource)}`
    );
  writeFileSync(initialFile, equalPreparedClosedInitialSource);
  writeFileSync(closedFile, equalPreparedClosedSource);
  writeFileSync(gateFile, equalPreparedClosedGateSource);
  const equalPreparedClosed = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(equalPreparedClosed.status, 0,
    "Initial-Vorbereitung und Closed-Attestation mit identischem Sekundentimestamp muessen scheitern.");
  writeFileSync(initialFile, initialSource);
  writeFileSync(closedFile, closedSource);
  writeFileSync(gateFile, gateSource);

  const invalidBackupResult = restoreResult.replace(
    `backupOperationId=${compact(backupAt)}-42`,
    `backupOperationId=${invalidCalendarAlias(backupAt)}-42`
  );
  const invalidBackupGateSource = gateSource.replace(
    `restoreResultSha256=${hash(restoreResult)}`,
    `restoreResultSha256=${hash(invalidBackupResult)}`
  );
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), invalidBackupResult);
  writeFileSync(gateFile, invalidBackupGateSource);
  const invalidCompactCalendarDay = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(invalidCompactCalendarDay.status, 0, "Ungueltige Kalendertage in kompakten UTC-Zeitpunkten muessen blockieren.");

  const equalDeploymentBackupResult = restoreResult.replace(
    `backupOperationId=${compact(backupAt)}-42`,
    `backupOperationId=${compact(deployedAt)}-42`
  );
  const equalDeploymentBackupGateSource = gateSource.replace(
    `restoreResultSha256=${hash(restoreResult)}`,
    `restoreResultSha256=${hash(equalDeploymentBackupResult)}`
  );
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), equalDeploymentBackupResult);
  writeFileSync(gateFile, equalDeploymentBackupGateSource);
  const equalDeploymentBackup = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(equalDeploymentBackup.status, 0, "Das Backup muss strikt nach dem geschlossenen Deployment liegen.");
  writeFileSync(path.join(restoreDirectory, "RESULT.txt"), restoreResult);
  writeFileSync(gateFile, gateSource);

  const equalCloseDeploymentSource = deploymentSource.replace(
    `deployedAt=${iso(deployedAt)}`,
    `deployedAt=${iso(closedAt)}`
  );
  const equalCloseDeploymentGateSource = gateSource.replace(
    `closedDeploymentAttestationSha256=${hash(deploymentSource)}`,
    `closedDeploymentAttestationSha256=${hash(equalCloseDeploymentSource)}`
  );
  writeFileSync(deploymentFile, equalCloseDeploymentSource);
  writeFileSync(gateFile, equalCloseDeploymentGateSource);
  const equalCloseDeployment = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(equalCloseDeployment.status, 0,
    "Das geschlossene Deployment muss strikt nach der Closed-Attestation liegen.");
  writeFileSync(deploymentFile, deploymentSource);
  writeFileSync(gateFile, gateSource);

  const equalBackupRestoreTimestamp = compact(backupAt);
  const equalBackupRestoreDirectory = path.join(stateDirectory, "restore-tests", equalBackupRestoreTimestamp);
  const equalBackupRestoreResult = restoreResult.replace(
    `restoreTest=${restoreTimestamp}`,
    `restoreTest=${equalBackupRestoreTimestamp}`
  );
  mkdirSync(equalBackupRestoreDirectory, { recursive: true });
  writeFileSync(path.join(equalBackupRestoreDirectory, "RESULT.txt"), equalBackupRestoreResult);
  writeFileSync(gateFile, gateSource.replace(
    `restoreResultSha256=${hash(restoreResult)}`,
    `restoreResultSha256=${hash(equalBackupRestoreResult)}`
  ));
  const equalBackupRestore = run([
    gateFile,
    initialFile,
    closedFile,
    deploymentFile,
    stateDirectory,
    appHost,
    targetRevision,
    persistenceSha256
  ]);
  assert.notEqual(equalBackupRestore.status, 0,
    "Der Restore-Test muss strikt nach dem gebundenen Backup liegen.");
  rmSync(equalBackupRestoreDirectory, { recursive: true, force: true });
  writeFileSync(gateFile, gateSource);

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
