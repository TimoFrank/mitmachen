#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`FEHLER: ${message}\n`);
  process.exit(1);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readRegularFile(file, label) {
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} ist keine symlinkfreie regulaere Datei.`);
  return readFileSync(file, "utf8");
}

function exactKeyValues(source, expected, label) {
  const lines = source.split("\n");
  if (lines.at(-1) !== "") fail(`${label} benoetigt einen abschliessenden Zeilenumbruch.`);
  lines.pop();
  if (lines.length !== expected.length) fail(`${label} besitzt nicht die exakte Zeilenzahl.`);
  const values = new Map();
  expected.forEach(([expectedKey, rule], index) => {
    const separator = lines[index].indexOf("=");
    const key = lines[index].slice(0, separator);
    const value = lines[index].slice(separator + 1);
    if (key !== expectedKey || (rule instanceof RegExp ? !rule.test(value) : value !== rule)) {
      fail(`${label}, Zeile ${index + 1}, ist ungueltig.`);
    }
    values.set(key, value);
  });
  return values;
}

const [
  gateFile,
  initialAttestationFile,
  closedAttestationFile,
  closedDeploymentAttestationFile,
  stateDirectory,
  appHost,
  sourceRevision,
  persistenceContractSha256
] = process.argv.slice(2);
const revision = /^[a-f0-9]{40,64}$/u;
const hex64 = /^[a-f0-9]{64}$/u;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
if (
  !gateFile || !initialAttestationFile || !closedAttestationFile || !closedDeploymentAttestationFile
  || !stateDirectory || !appHost
  || !revision.test(sourceRevision || "") || !hex64.test(persistenceContractSha256 || "")
) fail("Code-Reopen-Aufruf ist unvollstaendig.");

const gateSource = readRegularFile(gateFile, "Code-Reopen-Gate-Datei");
const gate = exactKeyValues(gateSource, [
  ["schemaVersion", "1"],
  ["appHost", appHost],
  ["targetRevision", sourceRevision],
  ["initialCutoverAttestationSha256", hex64],
  ["closedAttestationSha256", hex64],
  ["closedDeploymentAttestationSha256", hex64],
  ["persistenceContractSha256", persistenceContractSha256],
  ["backupSnapshotId", hex64],
  ["restoreResultSha256", hex64],
  ["identityAuditSha256", hex64],
  ["approvedAt", timestamp]
], "Code-Reopen-Gate-Datei");
const age = Date.now() - Date.parse(gate.get("approvedAt"));
if (!Number.isFinite(age) || age < -30_000 || age > 30 * 60 * 1000) {
  fail("Code-Reopen-Gate ist nicht frisch genug.");
}
const approvedAtMilliseconds = Date.parse(gate.get("approvedAt"));

function compactTimestampMilliseconds(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(...match.slice(1).map(Number).map((part, index) => index === 1 ? part - 1 : part));
}

const initialSource = readRegularFile(initialAttestationFile, "Initiale Cutover-Attestation");
if (sha256(initialSource) !== gate.get("initialCutoverAttestationSha256")) {
  fail("Code-Reopen-Gate passt nicht zur initialen Cutover-Attestation.");
}
exactKeyValues(initialSource, [
  ["schemaVersion", "1"],
  ["appHost", appHost],
  ["initialRevision", revision],
  ["gateSha256", hex64],
  ["migrationPackageSha256", hex64],
  ["backupSnapshotId", hex64],
  ["promotedAt", timestamp]
], "Initiale Cutover-Attestation");

const closedSource = readRegularFile(closedAttestationFile, "Closed-Attestation");
if (sha256(closedSource) !== gate.get("closedAttestationSha256")) {
  fail("Code-Reopen-Gate passt nicht zur Closed-Attestation.");
}
const closed = exactKeyValues(closedSource, [
  ["schemaVersion", "1"],
  ["mode", "closed"],
  ["appHost", appHost],
  ["closedFromRevision", revision],
  ["initialCutoverSha256", gate.get("initialCutoverAttestationSha256")],
  ["persistenceContractSha256", persistenceContractSha256],
  ["closedAt", timestamp]
], "Closed-Attestation");
if (closed.get("persistenceContractSha256") !== gate.get("persistenceContractSha256")) {
  fail("Persistenzvertrag hat sich seit dem Schliessen veraendert.");
}
const closedAtMilliseconds = Date.parse(closed.get("closedAt"));
if (!Number.isFinite(closedAtMilliseconds) || closedAtMilliseconds > approvedAtMilliseconds) {
  fail("Closed-Attestation liegt nicht vor der aktuellen Freigabe.");
}

const deploymentSource = readRegularFile(closedDeploymentAttestationFile, "Closed-Deployment-Attestation");
if (sha256(deploymentSource) !== gate.get("closedDeploymentAttestationSha256")) {
  fail("Code-Reopen-Gate passt nicht zur Closed-Deployment-Attestation.");
}
const deployment = exactKeyValues(deploymentSource, [
  ["schemaVersion", "1"],
  ["mode", "closed"],
  ["appHost", appHost],
  ["deployedRevision", sourceRevision],
  ["persistenceContractSha256", persistenceContractSha256],
  ["deployedAt", timestamp]
], "Closed-Deployment-Attestation");
const deployedAtMilliseconds = Date.parse(deployment.get("deployedAt"));
if (
  !Number.isFinite(deployedAtMilliseconds)
  || deployedAtMilliseconds < closedAtMilliseconds
  || deployedAtMilliseconds > approvedAtMilliseconds
) fail("Geschlossenes Zieldeployment liegt nicht zwischen Close und aktueller Freigabe.");

const restoreRoot = path.join(stateDirectory, "restore-tests");
let restoreRootStat;
try {
  restoreRootStat = lstatSync(restoreRoot);
} catch {
  fail("Restore-Testverzeichnis fehlt.");
}
if (!restoreRootStat.isDirectory() || restoreRootStat.isSymbolicLink()) {
  fail("Restore-Testverzeichnis ist kein symlinkfreies Verzeichnis.");
}
let restoreMatches = 0;
for (const directoryName of readdirSync(restoreRoot)) {
  const directory = path.join(restoreRoot, directoryName);
  const resultFile = path.join(directory, "RESULT.txt");
  if (!existsSync(resultFile)) continue;
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) continue;
  const resultSource = readRegularFile(resultFile, "Restore-Ergebnis");
  if (sha256(resultSource) !== gate.get("restoreResultSha256")) continue;
  const expected = [
    "schemaVersion=1",
    /^restoreTest=\d{8}T\d{6}Z$/u,
    `snapshotId=${gate.get("backupSnapshotId")}`,
    /^backupOperationId=\d{8}T\d{6}Z-[1-9]\d*$/u,
    `sourceRevision=${sourceRevision}`,
    "databaseRuntimeReady=true",
    "objectStorageVerified=true",
    "result=success",
    ""
  ];
  const resultLines = resultSource.split("\n");
  if (
    resultLines.length === expected.length
    && expected.every((rule, index) => rule instanceof RegExp ? rule.test(resultLines[index]) : rule === resultLines[index])
  ) {
    const restoreTimestamp = resultLines[1].slice("restoreTest=".length);
    const backupTimestamp = resultLines[3].slice("backupOperationId=".length).split("-")[0];
    const restoreAtMilliseconds = compactTimestampMilliseconds(restoreTimestamp);
    const backupAtMilliseconds = compactTimestampMilliseconds(backupTimestamp);
    const restoreIsFresh = Number.isFinite(restoreAtMilliseconds)
      && Number.isFinite(backupAtMilliseconds)
      && directoryName === restoreTimestamp
      && backupAtMilliseconds >= deployedAtMilliseconds
      && restoreAtMilliseconds >= backupAtMilliseconds
      && approvedAtMilliseconds >= restoreAtMilliseconds
      && approvedAtMilliseconds - restoreAtMilliseconds <= 6 * 60 * 60 * 1000;
    if (restoreIsFresh) restoreMatches += 1;
  }
}
if (restoreMatches !== 1) {
  fail("Code-Reopen benoetigt genau einen nach dem Schliessen erzeugten und hoechstens sechs Stunden alten Restore-Test der Zielrevision.");
}

process.stdout.write([
  sha256(gateSource),
  gate.get("initialCutoverAttestationSha256"),
  gate.get("backupSnapshotId"),
  gate.get("identityAuditSha256")
].join("\t"));
