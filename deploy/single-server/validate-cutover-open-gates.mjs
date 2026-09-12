#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
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

function exactKeyValues(source, expected) {
  const lines = source.split("\n");
  if (lines.at(-1) !== "") fail("Gate-Datei benoetigt einen abschliessenden Zeilenumbruch.");
  lines.pop();
  if (lines.length !== expected.length) fail("Gate-Datei besitzt nicht die exakte Zeilenzahl.");
  const values = new Map();
  expected.forEach(([expectedKey, rule], index) => {
    const separator = lines[index].indexOf("=");
    const key = lines[index].slice(0, separator);
    const value = lines[index].slice(separator + 1);
    if (key !== expectedKey || (rule instanceof RegExp ? !rule.test(value) : value !== rule)) {
      fail(`Gate-Zeile ${index + 1} ist ungueltig.`);
    }
    values.set(key, value);
  });
  return values;
}

function validateEvidence() {
  const [gateFile, migrationDirectory, stateDirectory, appHost, sourceRevision] = process.argv.slice(3);
  if (!gateFile || !migrationDirectory || !stateDirectory || !appHost || !/^[a-f0-9]{40,64}$/u.test(sourceRevision || "")) {
    fail("Evidence-Aufruf ist unvollstaendig.");
  }
  const gateSource = readRegularFile(gateFile, "Open-Gate-Datei");
  const hex64 = /^[a-f0-9]{64}$/u;
  const values = exactKeyValues(gateSource, [
    ["schemaVersion", "1"],
    ["appHost", appHost],
    ["targetRevision", sourceRevision],
    ["migrationPackageSha256", hex64],
    ["gkeFreezeStateSha256", hex64],
    ["backupSnapshotId", hex64],
    ["restoreResultSha256", hex64],
    ["identityAuditSha256", hex64],
    ["bucketInventorySha256", hex64],
    ["dnsReadbackSha256", hex64],
    ["approvedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ]);
  const age = Date.now() - Date.parse(values.get("approvedAt"));
  if (!Number.isFinite(age) || age < -30_000 || age > 30 * 60 * 1000) fail("Open-Gate ist nicht frisch genug.");

  const sumsSource = readRegularFile(path.join(migrationDirectory, "SHA256SUMS"), "Migrations-SHA256SUMS");
  if (sha256(sumsSource) !== values.get("migrationPackageSha256")) fail("Gate passt nicht zum Migrationspaket.");
  const metadata = readRegularFile(path.join(migrationDirectory, "migration-metadata.tsv"), "Migrationsmetadaten");
  const metadataLines = new Map(metadata.trimEnd().split("\n").slice(1).map((line) => line.split("\t")));
  if (metadataLines.get("target_revision") !== sourceRevision) fail("Migrationspaket passt nicht zur Zielrevision.");
  if (metadataLines.get("gke_freeze_state_sha256") !== values.get("gkeFreezeStateSha256")) {
    fail("Gate passt nicht zum GKE-Freeze des Migrationspakets.");
  }
  const storageCounts = readRegularFile(
    path.join(migrationDirectory, "storage-reference-counts.tsv"),
    "Objektreferenzzaehlungen"
  );
  const expectedStorageCounts = [
    "reference_type\trows",
    "contact_images\t0",
    "contact_note_attachments\t0",
    "profile_images\t0",
    "stakeholder_logos\t0",
    ""
  ].join("\n");
  if (storageCounts !== expectedStorageCounts) fail("Open-Gate verlangt vier exakte Nullzaehlungen fuer Objektreferenzen.");

  const restoreRoot = path.join(stateDirectory, "restore-tests");
  let restoreMatches = 0;
  try {
    for (const directoryName of readdirSync(restoreRoot)) {
      const resultFile = path.join(restoreRoot, directoryName, "RESULT.txt");
      if (!existsSync(resultFile)) continue;
      const resultStat = lstatSync(resultFile);
      if (!resultStat.isFile() || resultStat.isSymbolicLink()) continue;
      const resultSource = readFileSync(resultFile, "utf8");
      if (sha256(resultSource) !== values.get("restoreResultSha256")) continue;
      const expected = [
        "schemaVersion=1",
        /^restoreTest=\d{8}T\d{6}Z$/u,
        `snapshotId=${values.get("backupSnapshotId")}`,
        /^backupOperationId=\d{8}T\d{6}Z-[1-9]\d*$/u,
        `sourceRevision=${sourceRevision}`,
        "databaseRuntimeReady=true",
        "objectStorageVerified=true",
        "result=success",
        ""
      ];
      const resultLines = resultSource.split("\n");
      if (resultLines.length !== expected.length) continue;
      if (expected.every((rule, index) => rule instanceof RegExp ? rule.test(resultLines[index]) : rule === resultLines[index])) {
        restoreMatches += 1;
      }
    }
  } catch {
    fail("Restore-Testverzeichnis ist nicht lesbar.");
  }
  if (restoreMatches !== 1) fail("Gate benoetigt genau einen passenden erfolgreichen Restore-Test.");

  process.stdout.write([
    sha256(gateSource),
    values.get("migrationPackageSha256"),
    values.get("backupSnapshotId"),
    values.get("identityAuditSha256"),
    values.get("bucketInventorySha256"),
    values.get("dnsReadbackSha256")
  ].join("\t"));
}

function validateIdentity(printHash = false) {
  const [firstArgument, secondArgument] = process.argv.slice(3);
  const expectedSha256 = printHash ? "" : firstArgument;
  const allowedEmailsFile = printHash ? firstArgument : secondArgument;
  if ((!printHash && !/^[a-f0-9]{64}$/u.test(expectedSha256 || "")) || !allowedEmailsFile) {
    fail("Identity-Aufruf ist unvollstaendig.");
  }
  const allowedSource = readRegularFile(allowedEmailsFile, "Allowlist");
  const allowed = allowedSource.trimEnd().split("\n").sort();
  const rawInput = readFileSync(0, "utf8");
  if (!rawInput.endsWith("\n")) fail("Identity-Readback benoetigt genau einen abschliessenden Zeilenumbruch.");
  const input = rawInput.slice(0, -1);
  if (input.endsWith("\n")) fail("Identity-Readback enthaelt eine unerwartete Leerzeile.");
  const rows = input ? input.split("\n").map((line) => line.split("\t")) : [];
  if (rows.length !== allowed.length || new Set(allowed).size !== allowed.length) fail("Identity-Zeilen passen nicht zur Allowlist.");
  rows.forEach(([email, role, issuer, subject, scope, scopeRef], index) => {
    if (
      email !== allowed[index]
      || !["viewer", "editor", "admin"].includes(role)
      || issuer !== "https://accounts.google.com"
      || !subject
      || !["standard", "test_only"].includes(scope)
      || (scope === "standard" && scopeRef)
      || (scope === "test_only" && !scopeRef)
    ) fail("Aktive Profile besitzen nicht exakt die freigegebenen Google-Bindungen.");
  });
  const canonical = `${input}\n`;
  const actualSha256 = sha256(canonical);
  if (!printHash && actualSha256 !== expectedSha256) fail("Identity-Readback passt nicht zum Open-Gate.");
  if (printHash) process.stdout.write(actualSha256);
}

const mode = process.argv[2];
if (mode === "evidence") validateEvidence();
else if (mode === "identity") validateIdentity();
else if (mode === "identity-hash") validateIdentity(true);
else fail("Aufruf: validate-cutover-open-gates.mjs evidence|identity ...");
