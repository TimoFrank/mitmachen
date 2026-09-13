#!/usr/bin/env node

import { createHash, createPublicKey, verify } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { isIP } from "node:net";
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

function readProtectedFile(file, label, encoding = "utf8") {
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} ist keine symlinkfreie regulaere Datei.`);
  if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) {
    fail(`${label} muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen.`);
  }
  return readFileSync(file, encoding);
}

function exactKeyValues(source, expected, label = "Gate-Datei") {
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
      fail(`${label}-Zeile ${index + 1} ist ungueltig.`);
    }
    values.set(key, value);
  });
  return values;
}

function exactPackageChecksums(source) {
  const expectedFiles = new Set([
    "database.dump",
    "database.toc",
    "migration-metadata.tsv",
    "row-counts.tsv",
    "storage-reference-counts.tsv"
  ]);
  const lines = source.split("\n");
  if (lines.at(-1) !== "") fail("Migrations-SHA256SUMS benoetigt einen abschliessenden Zeilenumbruch.");
  lines.pop();
  if (lines.length !== expectedFiles.size) fail("Migrations-SHA256SUMS besitzt nicht das exakte Dateiinventar.");
  const checksums = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9.-]+)$/u.exec(line);
    if (!match || !expectedFiles.has(match[2]) || checksums.has(match[2])) {
      fail("Migrations-SHA256SUMS besitzt einen ungueltigen oder doppelten Eintrag.");
    }
    checksums.set(match[2], match[1]);
  }
  if ([...expectedFiles].some((file) => !checksums.has(file))) {
    fail("Migrations-SHA256SUMS ist unvollstaendig.");
  }
  return checksums;
}

function parseIsoTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString().replace(/\.000Z$/u, "Z") !== value
  ) fail(`${label} ist kein gueltiger kanonischer UTC-Zeitpunkt.`);
  return timestamp;
}

function parseCompactTimestamp(value, label) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) fail(`${label} ist kein gueltiger kompakter UTC-Zeitpunkt.`);
  const canonical = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const timestamp = Date.parse(canonical);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().replace(/\.000Z$/u, "Z") !== canonical) {
    fail(`${label} ist kein gueltiger kompakter UTC-Zeitpunkt.`);
  }
  return timestamp;
}

function requireRecentEvidence(timestamp, approvedAt, label, maximumAge = 10 * 60 * 1000) {
  const currentTime = Date.now();
  if (timestamp > approvedAt + 30_000 || timestamp > currentTime + 30_000) {
    fail(`${label} liegt unzulaessig in der Zukunft.`);
  }
  if (approvedAt - timestamp > maximumAge) fail(`${label} ist nicht frisch genug.`);
  if (currentTime - timestamp > maximumAge) fail(`${label} ist beim aktuellen Readback nicht mehr frisch genug.`);
}

function validateEvidence() {
  const [gateFile, migrationDirectory, stateDirectory, appHost, sourceRevision, pinnedPublicKeySha256] = process.argv.slice(3);
  if (
    !gateFile
    || !migrationDirectory
    || !stateDirectory
    || !appHost
    || !/^[a-f0-9]{40,64}$/u.test(sourceRevision || "")
    || !/^[a-f0-9]{64}$/u.test(pinnedPublicKeySha256 || "")
  ) {
    fail("Evidence-Aufruf ist unvollstaendig.");
  }
  const gateSource = readRegularFile(gateFile, "Open-Gate-Datei");
  const hex64 = /^[a-f0-9]{64}$/u;
  const values = exactKeyValues(gateSource, [
    ["schemaVersion", "2"],
    ["appHost", appHost],
    ["targetRevision", sourceRevision],
    ["migrationPackageSha256", hex64],
    ["databaseImportAttestationSha256", hex64],
    ["gkeFreezeStateSha256", hex64],
    ["sourceWriterGateNonce", hex64],
    ["sourceWriterEvidenceSha256", hex64],
    ["sourceWriterSignatureSha256", hex64],
    ["sourceWriterPublicKeySha256", hex64],
    ["backupSnapshotId", hex64],
    ["restoreResultSha256", hex64],
    ["identityAuditSha256", hex64],
    ["bucketInventorySha256", hex64],
    ["dnsReadbackSha256", hex64],
    ["approvedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ]);
  const approvedAt = parseIsoTimestamp(values.get("approvedAt"), "Open-Gate-Freigabezeitpunkt");
  const age = Date.now() - approvedAt;
  if (!Number.isFinite(age) || age < -30_000 || age > 10 * 60 * 1000) fail("Open-Gate ist nicht frisch genug.");

  const sumsSource = readRegularFile(path.join(migrationDirectory, "SHA256SUMS"), "Migrations-SHA256SUMS");
  if (sha256(sumsSource) !== values.get("migrationPackageSha256")) fail("Gate passt nicht zum Migrationspaket.");
  const packageChecksums = exactPackageChecksums(sumsSource);
  const metadata = readRegularFile(path.join(migrationDirectory, "migration-metadata.tsv"), "Migrationsmetadaten");
  if (sha256(metadata) !== packageChecksums.get("migration-metadata.tsv")) {
    fail("Migrationsmetadaten weichen vom attestierten Paket ab.");
  }
  const metadataLines = new Map(metadata.trimEnd().split("\n").slice(1).map((line) => line.split("\t")));
  if (metadataLines.get("target_revision") !== sourceRevision) fail("Migrationspaket passt nicht zur Zielrevision.");
  if (metadataLines.get("gke_freeze_state_sha256") !== values.get("gkeFreezeStateSha256")) {
    fail("Gate passt nicht zum GKE-Freeze des Migrationspakets.");
  }

  const evidenceDirectory = path.dirname(gateFile);
  const sourceWriterEvidence = readProtectedFile(
    path.join(evidenceDirectory, "initial-open-source-writer.attestation"),
    "Finaler Source-Writer-Nachweis",
    null
  );
  const sourceWriterSignature = readProtectedFile(
    path.join(evidenceDirectory, "initial-open-source-writer.attestation.sig"),
    "Signatur des finalen Source-Writer-Nachweises",
    null
  );
  const sourceWriterPublicKey = readProtectedFile(
    path.join(evidenceDirectory, "initial-open-source-writer.public.pem"),
    "Public Key des finalen Source-Writer-Nachweises",
    null
  );
  if (sha256(sourceWriterEvidence) !== values.get("sourceWriterEvidenceSha256")) {
    fail("Gate passt nicht zum finalen Source-Writer-Nachweis.");
  }
  if (sha256(sourceWriterSignature) !== values.get("sourceWriterSignatureSha256")) {
    fail("Gate passt nicht zur Signatur des finalen Source-Writer-Nachweises.");
  }
  if (sha256(sourceWriterPublicKey) !== values.get("sourceWriterPublicKeySha256")) {
    fail("Gate passt nicht zum Public Key des finalen Source-Writer-Nachweises.");
  }
  if (values.get("sourceWriterPublicKeySha256") !== pinnedPublicKeySha256) {
    fail("Source-Writer-Public-Key weicht vom vorab gepinnten Serverwert ab.");
  }
  let sourceWriterKey;
  try {
    sourceWriterKey = createPublicKey(sourceWriterPublicKey);
  } catch {
    fail("Public Key des finalen Source-Writer-Nachweises ist ungueltig.");
  }
  if (sourceWriterKey.asymmetricKeyType !== "ed25519") {
    fail("Finaler Source-Writer-Nachweis benoetigt einen Ed25519-Public-Key.");
  }
  if (!verify(null, sourceWriterEvidence, sourceWriterKey, sourceWriterSignature)) {
    fail("Signatur des finalen Source-Writer-Nachweises ist ungueltig.");
  }
  const projectId = metadataLines.get("cloud_sql_instance_connection_name")?.split(":")[0] || "";
  const sourceWriterValues = exactKeyValues(sourceWriterEvidence.toString("utf8"), [
    ["schemaVersion", "1"],
    ["evidenceKind", "initial-open-source-writer"],
    ["gateNonce", values.get("sourceWriterGateNonce")],
    ["migrationPackageSha256", values.get("migrationPackageSha256")],
    ["sourceDeployedRevision", metadataLines.get("source_deployed_revision") || ""],
    ["targetRevision", sourceRevision],
    ["operatorRevision", sourceRevision],
    ["gcpProjectId", projectId],
    ["cloudSqlInstanceConnectionName", metadataLines.get("cloud_sql_instance_connection_name") || ""],
    ["cloudSqlDatabase", "versorgungs_kompass"],
    ["gkeFreezeStateSha256", values.get("gkeFreezeStateSha256")],
    ["gkeBindingFingerprint", metadataLines.get("gke_binding_fingerprint") || ""],
    ["frozenDeploymentGeneration", /^[1-9]\d*$/u],
    ["namespaceInventorySha256", metadataLines.get("namespace_inventory_sha256") || ""],
    ["freshGlobalWriterAttestationSha256", hex64],
    ["globalWriterAttestedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u],
    ["gkeReplicas", "0"],
    ["gkeApiPods", "0"],
    ["foreignNamespaceDbWriterCandidates", "0"],
    ["otherNamespacesDbWriters", "none"],
    ["externalDbWriters", "none"],
    ["cloudSqlOtherClientSessions", "0"],
    ["observedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ], "Finaler Source-Writer-Nachweis");
  const sourceWriterObservedAt = parseIsoTimestamp(
    sourceWriterValues.get("observedAt"),
    "Source-Writer-Readback-Zeitpunkt"
  );
  const globalWriterAttestedAt = parseIsoTimestamp(
    sourceWriterValues.get("globalWriterAttestedAt"),
    "Globaler Writer-Attestierungszeitpunkt"
  );
  requireRecentEvidence(sourceWriterObservedAt, approvedAt, "Finaler Source-Writer-Nachweis");
  if (
    globalWriterAttestedAt > sourceWriterObservedAt + 30_000
    || sourceWriterObservedAt - globalWriterAttestedAt > 10 * 60 * 1000
  ) fail("Globaler Writer-Nachweis ist nicht frisch an den finalen Source-Readback gebunden.");
  const exportedAt = parseIsoTimestamp(metadataLines.get("exported_at") || "", "Migrations-Exportzeitpunkt");
  if (exportedAt > sourceWriterObservedAt) fail("Finaler Source-Writer-Nachweis liegt vor dem Migrations-Export.");

  const importAttestationSource = readProtectedFile(
    path.join(stateDirectory, ".database-import-attestation"),
    "Datenbankimport-Attestation"
  );
  if (sha256(importAttestationSource) !== values.get("databaseImportAttestationSha256")) {
    fail("Gate passt nicht zur Datenbankimport-Attestation.");
  }
  const importValues = exactKeyValues(importAttestationSource, [
    ["schemaVersion", "1"],
    ["packageSha256", values.get("migrationPackageSha256")],
    ["sourceRevision", sourceRevision],
    ["operationId", /^\d{8}T\d{6}Z-[1-9]\d*$/u],
    ["importedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ], "Datenbankimport-Attestation");
  const importedAt = parseIsoTimestamp(importValues.get("importedAt"), "Datenbankimport-Zeitpunkt");
  const importOperationAt = parseCompactTimestamp(
    importValues.get("operationId").split("-")[0],
    "Datenbankimport-Operationszeitpunkt"
  );
  if (importOperationAt > importedAt) fail("Datenbankimport-Abschluss liegt vor seinem Operationsbeginn.");
  if (exportedAt >= importOperationAt) {
    fail("Datenbankimport beginnt nicht eindeutig nach dem Migrations-Export.");
  }
  if (sourceWriterObservedAt <= importedAt) {
    fail("Finaler Source-Writer-Nachweis liegt nicht eindeutig nach dem attestierten Datenbankimport.");
  }
  if (importedAt > approvedAt || importedAt > Date.now() + 30_000) {
    fail("Datenbankimport-Attestation liegt nach der Open-Gate-Freigabe.");
  }

  const bucketInventorySource = readProtectedFile(
    path.join(evidenceDirectory, "cutover-bucket-inventory.conf"),
    "Cutover-Bucket-Inventur"
  );
  if (sha256(bucketInventorySource) !== values.get("bucketInventorySha256")) {
    fail("Gate passt nicht zur Cutover-Bucket-Inventur.");
  }
  const bucketName = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u;
  const bucketValues = exactKeyValues(bucketInventorySource, [
    ["schemaVersion", "1"],
    ["gcpProjectId", projectId],
    ["sourceRevision", metadataLines.get("source_deployed_revision") || ""],
    ["targetRevision", sourceRevision],
    ["migrationPackageSha256", values.get("migrationPackageSha256")],
    ["gkeFreezeStateSha256", values.get("gkeFreezeStateSha256")],
    ["contactImageBucket", bucketName],
    ["contactImageLiveObjects", "0"],
    ["contactNoteAttachmentBucket", bucketName],
    ["contactNoteAttachmentLiveObjects", "0"],
    ["profileImageBucket", bucketName],
    ["profileImageLiveObjects", "0"],
    ["stakeholderLogoBucket", bucketName],
    ["stakeholderLogoLiveObjects", "0"],
    ["inventoriedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ], "Cutover-Bucket-Inventur");
  const bucketNames = [
    bucketValues.get("contactImageBucket"),
    bucketValues.get("contactNoteAttachmentBucket"),
    bucketValues.get("profileImageBucket"),
    bucketValues.get("stakeholderLogoBucket")
  ];
  if (new Set(bucketNames).size !== bucketNames.length || bucketNames.some((name) => name.includes("REPLACE_WITH"))) {
    fail("Cutover-Bucket-Inventur benoetigt vier unterschiedliche reale Bucket-Namen.");
  }
  requireRecentEvidence(
    parseIsoTimestamp(bucketValues.get("inventoriedAt"), "Bucket-Inventurzeitpunkt"),
    approvedAt,
    "Cutover-Bucket-Inventur"
  );

  const dnsReadbackSource = readProtectedFile(
    path.join(evidenceDirectory, "cutover-dns-readback.conf"),
    "Cutover-DNS-Readback"
  );
  if (sha256(dnsReadbackSource) !== values.get("dnsReadbackSha256")) {
    fail("Gate passt nicht zum Cutover-DNS-Readback.");
  }
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
  const ipv6OrNone = /^(?:none|[0-9a-f:]+)$/u;
  const dnsValues = exactKeyValues(dnsReadbackSource, [
    ["schemaVersion", "1"],
    ["appHost", appHost],
    ["targetRevision", sourceRevision],
    ["vpsIpv4", ipv4],
    ["vpsIpv6", ipv6OrNone],
    ["vpsResolverA", ipv4],
    ["vpsResolverAAAA", ipv6OrNone],
    ["vpsResolverWwwCname", `${appHost}.`],
    ["externalResolver", "1.1.1.1"],
    ["externalResolverA", ipv4],
    ["externalResolverAAAA", ipv6OrNone],
    ["externalResolverWwwCname", `${appHost}.`],
    ["checkedAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u]
  ], "Cutover-DNS-Readback");
  const vpsIpv4 = dnsValues.get("vpsIpv4");
  const vpsIpv6 = dnsValues.get("vpsIpv6");
  if (
    isIP(vpsIpv4) !== 4
    || (vpsIpv6 !== "none" && isIP(vpsIpv6) !== 6)
    || dnsValues.get("vpsResolverA") !== vpsIpv4
    || dnsValues.get("externalResolverA") !== vpsIpv4
    || dnsValues.get("vpsResolverAAAA") !== vpsIpv6
    || dnsValues.get("externalResolverAAAA") !== vpsIpv6
  ) fail("Cutover-DNS-Readback passt nicht exakt zu den erwarteten VPS-Adressen.");
  requireRecentEvidence(
    parseIsoTimestamp(dnsValues.get("checkedAt"), "DNS-Readback-Zeitpunkt"),
    approvedAt,
    "Cutover-DNS-Readback"
  );
  const storageCounts = readRegularFile(
    path.join(migrationDirectory, "storage-reference-counts.tsv"),
    "Objektreferenzzaehlungen"
  );
  if (sha256(storageCounts) !== packageChecksums.get("storage-reference-counts.tsv")) {
    fail("Objektreferenzzaehlungen weichen vom attestierten Paket ab.");
  }
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
        const restoreTest = resultLines[1].slice("restoreTest=".length);
        const backupOperationId = resultLines[3].slice("backupOperationId=".length);
        const backupAt = parseCompactTimestamp(backupOperationId.split("-")[0], "Backup-Zeitpunkt");
        const restoredAt = parseCompactTimestamp(restoreTest, "Restore-Test-Zeitpunkt");
        if (directoryName !== restoreTest) fail("Restore-Testverzeichnis passt nicht zum attestierten Zeitpunkt.");
        if (backupAt <= importedAt) fail("Open-Gate-Backup liegt nicht eindeutig nach dem attestierten Datenbankimport.");
        if (restoredAt <= backupAt) fail("Restore-Test liegt nicht eindeutig nach dem gebundenen Backup.");
        if (sourceWriterObservedAt <= restoredAt) {
          fail("Finaler Source-Writer-Nachweis liegt nicht eindeutig nach dem Restore-Test.");
        }
        if (restoredAt > approvedAt || approvedAt - restoredAt > 6 * 60 * 60 * 1000) {
          fail("Restore-Test ist fuer das Open-Gate nicht frisch genug.");
        }
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
