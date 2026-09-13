#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  chmodSync,
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
const restoreRoot = path.join(stateDirectory, "restore-tests");
const allowedEmails = path.join(temporaryRoot, "allowed-emails");
const gateFile = path.join(temporaryRoot, "cutover-open-gates.conf");
const appHost = "versorgungs-kompass.de";
const sourceDeployedRevision = "9".repeat(40);
const sourceRevision = "a".repeat(40);
const gkeSha256 = "b".repeat(64);
const gkeBindingFingerprint = "7".repeat(64);
const namespaceInventorySha256 = "5".repeat(64);
const gateNonce = "6".repeat(64);
const snapshotId = "c".repeat(64);
const cloudSqlConnectionName = "example-project:europe-west3:versorgungs-kompass";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = new Date(Math.floor(Date.now() / 1000) * 1000);
const isoBefore = (milliseconds) => new Date(now.getTime() - milliseconds).toISOString().replace(/\.000Z$/u, "Z");
const compact = (isoTimestamp) => isoTimestamp.replaceAll(/[-:]/gu, "");

function run(args, input = "") {
  return spawnSync(process.execPath, [validator, ...args], { encoding: "utf8", input });
}

try {
  mkdirSync(migrationDirectory, { recursive: true });
  mkdirSync(stateDirectory, { recursive: true });
  const exportedAt = isoBefore(60 * 60 * 1000);
  const databaseDump = "test-database-dump\n";
  const databaseToc = "test-database-toc\n";
  const rowCounts = "table_name\trows\npublic.profiles\t1\n";
  const migrationMetadata = [
    "key\tvalue",
    "database\tversorgungs_kompass",
    "format_version\t2",
    "postgres_major\t16",
    `source_deployed_revision\t${sourceDeployedRevision}`,
    `target_revision\t${sourceRevision}`,
    `cloud_sql_instance_connection_name\t${cloudSqlConnectionName}`,
    `gke_binding_fingerprint\t${gkeBindingFingerprint}`,
    `gke_freeze_state_sha256\t${gkeSha256}`,
    `global_writer_attestation_sha256\t${"4".repeat(64)}`,
    `namespace_inventory_sha256\t${namespaceInventorySha256}`,
    `database_snapshot_id\t${"A".repeat(8)}-${"B".repeat(8)}-1`,
    `exported_at\t${exportedAt}`,
    ""
  ].join("\n");
  const storageReferenceCounts = [
    "reference_type\trows",
    "contact_images\t0",
    "contact_note_attachments\t0",
    "profile_images\t0",
    "stakeholder_logos\t0",
    ""
  ].join("\n");
  const sums = [
    `${hash(databaseDump)}  database.dump`,
    `${hash(databaseToc)}  database.toc`,
    `${hash(migrationMetadata)}  migration-metadata.tsv`,
    `${hash(rowCounts)}  row-counts.tsv`,
    `${hash(storageReferenceCounts)}  storage-reference-counts.tsv`,
    ""
  ].join("\n");
  writeFileSync(path.join(migrationDirectory, "database.dump"), databaseDump);
  writeFileSync(path.join(migrationDirectory, "database.toc"), databaseToc);
  writeFileSync(path.join(migrationDirectory, "migration-metadata.tsv"), migrationMetadata);
  writeFileSync(path.join(migrationDirectory, "row-counts.tsv"), rowCounts);
  writeFileSync(path.join(migrationDirectory, "storage-reference-counts.tsv"), storageReferenceCounts);
  writeFileSync(path.join(migrationDirectory, "SHA256SUMS"), sums);
  const importedAt = isoBefore(20 * 60 * 1000);
  const importAttestation = [
    "schemaVersion=1",
    `packageSha256=${hash(sums)}`,
    `sourceRevision=${sourceRevision}`,
    `operationId=${compact(importedAt)}-41`,
    `importedAt=${importedAt}`,
    ""
  ].join("\n");
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), importAttestation);
  chmodSync(path.join(stateDirectory, ".database-import-attestation"), 0o600);
  const writeRestoreResult = ({ backupAt, restoreAt }) => {
    rmSync(restoreRoot, { recursive: true, force: true });
    const restoreTest = compact(restoreAt);
    const restoreDirectory = path.join(restoreRoot, restoreTest);
    mkdirSync(restoreDirectory, { recursive: true });
    const source = [
      "schemaVersion=1",
      `restoreTest=${restoreTest}`,
      `snapshotId=${snapshotId}`,
      `backupOperationId=${compact(backupAt)}-42`,
      `sourceRevision=${sourceRevision}`,
      "databaseRuntimeReady=true",
      "objectStorageVerified=true",
      "result=success",
      ""
    ].join("\n");
    writeFileSync(path.join(restoreDirectory, "RESULT.txt"), source);
    return { restoreDirectory, source };
  };
  const currentRestore = writeRestoreResult({
    backupAt: isoBefore(15 * 60 * 1000),
    restoreAt: isoBefore(10 * 60 * 1000)
  });
  writeFileSync(allowedEmails, "operator@example.org\n");
  const identityRows = "operator@example.org\tadmin\thttps://accounts.google.com\tsubject-1\tstandard\t\n";
  const identitySha256 = hash(identityRows);
  const sourceWriterEvidence = [
    "schemaVersion=1",
    "evidenceKind=initial-open-source-writer",
    `gateNonce=${gateNonce}`,
    `migrationPackageSha256=${hash(sums)}`,
    `sourceDeployedRevision=${sourceDeployedRevision}`,
    `targetRevision=${sourceRevision}`,
    `operatorRevision=${sourceRevision}`,
    "gcpProjectId=example-project",
    `cloudSqlInstanceConnectionName=${cloudSqlConnectionName}`,
    "cloudSqlDatabase=versorgungs_kompass",
    `gkeFreezeStateSha256=${gkeSha256}`,
    `gkeBindingFingerprint=${gkeBindingFingerprint}`,
    "frozenDeploymentGeneration=17",
    `namespaceInventorySha256=${namespaceInventorySha256}`,
    `freshGlobalWriterAttestationSha256=${"4".repeat(64)}`,
    `globalWriterAttestedAt=${isoBefore(3 * 60 * 1000)}`,
    "gkeReplicas=0",
    "gkeApiPods=0",
    "foreignNamespaceDbWriterCandidates=0",
    "otherNamespacesDbWriters=none",
    "externalDbWriters=none",
    "cloudSqlOtherClientSessions=0",
    `observedAt=${isoBefore(2 * 60 * 1000)}`,
    ""
  ].join("\n");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySource = publicKey.export({ type: "spki", format: "pem" });
  const sourceWriterSignature = sign(null, Buffer.from(sourceWriterEvidence), privateKey);
  const sourceWriterEvidenceFile = path.join(temporaryRoot, "initial-open-source-writer.attestation");
  const sourceWriterSignatureFile = `${sourceWriterEvidenceFile}.sig`;
  const sourceWriterPublicKeyFile = path.join(temporaryRoot, "initial-open-source-writer.public.pem");
  writeFileSync(sourceWriterEvidenceFile, sourceWriterEvidence);
  writeFileSync(sourceWriterSignatureFile, sourceWriterSignature);
  writeFileSync(sourceWriterPublicKeyFile, publicKeySource);

  const bucketInventory = [
    "schemaVersion=1",
    "gcpProjectId=example-project",
    `sourceRevision=${sourceDeployedRevision}`,
    `targetRevision=${sourceRevision}`,
    `migrationPackageSha256=${hash(sums)}`,
    `gkeFreezeStateSha256=${gkeSha256}`,
    "contactImageBucket=vk-contact-images",
    "contactImageLiveObjects=0",
    "contactNoteAttachmentBucket=vk-contact-note-attachments",
    "contactNoteAttachmentLiveObjects=0",
    "profileImageBucket=vk-profile-images",
    "profileImageLiveObjects=0",
    "stakeholderLogoBucket=vk-stakeholder-logos",
    "stakeholderLogoLiveObjects=0",
    `inventoriedAt=${isoBefore(60 * 1000)}`,
    ""
  ].join("\n");
  const bucketInventoryFile = path.join(temporaryRoot, "cutover-bucket-inventory.conf");
  writeFileSync(bucketInventoryFile, bucketInventory);
  const dnsReadback = [
    "schemaVersion=1",
    `appHost=${appHost}`,
    `targetRevision=${sourceRevision}`,
    "vpsIpv4=203.0.113.42",
    "vpsIpv6=none",
    "vpsResolverA=203.0.113.42",
    "vpsResolverAAAA=none",
    `vpsResolverWwwCname=${appHost}.`,
    "externalResolver=1.1.1.1",
    "externalResolverA=203.0.113.42",
    "externalResolverAAAA=none",
    `externalResolverWwwCname=${appHost}.`,
    `checkedAt=${isoBefore(60 * 1000)}`,
    ""
  ].join("\n");
  const dnsReadbackFile = path.join(temporaryRoot, "cutover-dns-readback.conf");
  writeFileSync(dnsReadbackFile, dnsReadback);
  for (const protectedFile of [
    sourceWriterEvidenceFile,
    sourceWriterSignatureFile,
    sourceWriterPublicKeyFile,
    bucketInventoryFile,
    dnsReadbackFile
  ]) chmodSync(protectedFile, 0o600);
  const runEvidence = () => run([
    "evidence",
    gateFile,
    migrationDirectory,
    stateDirectory,
    appHost,
    sourceRevision,
    hash(publicKeySource)
  ]);
  const gateSourceFor = ({
    approvedAt = now.toISOString().replace(/\.000Z$/u, "Z"),
    importSource = importAttestation,
    restoreSource = currentRestore.source,
    sourceEvidence = sourceWriterEvidence,
    sourceSignature = sourceWriterSignature,
    bucketSource = bucketInventory,
    dnsSource = dnsReadback
  } = {}) => [
    "schemaVersion=2",
    `appHost=${appHost}`,
    `targetRevision=${sourceRevision}`,
    `migrationPackageSha256=${hash(sums)}`,
    `databaseImportAttestationSha256=${hash(importSource)}`,
    `gkeFreezeStateSha256=${gkeSha256}`,
    `sourceWriterGateNonce=${gateNonce}`,
    `sourceWriterEvidenceSha256=${hash(sourceEvidence)}`,
    `sourceWriterSignatureSha256=${hash(sourceSignature)}`,
    `sourceWriterPublicKeySha256=${hash(publicKeySource)}`,
    `backupSnapshotId=${snapshotId}`,
    `restoreResultSha256=${hash(restoreSource)}`,
    `identityAuditSha256=${identitySha256}`,
    `bucketInventorySha256=${hash(bucketSource)}`,
    `dnsReadbackSha256=${hash(dnsSource)}`,
    `approvedAt=${approvedAt}`,
    ""
  ].join("\n");
  const gateSource = gateSourceFor();
  writeFileSync(gateFile, gateSource);

  const evidence = runEvidence();
  assert.equal(evidence.status, 0, evidence.stderr);
  assert.equal(evidence.stdout, [
    hash(gateSource),
    hash(sums),
    snapshotId,
    identitySha256,
    hash(bucketInventory),
    hash(dnsReadback)
  ].join("\t"));

  const driftedMigrationMetadata = migrationMetadata.replace("format_version\t2", "format_version\t3");
  writeFileSync(path.join(migrationDirectory, "migration-metadata.tsv"), driftedMigrationMetadata);
  assert.notEqual(runEvidence().status, 0,
    "Nach dem Import driftende Migrationsmetadaten muessen gegen SHA256SUMS scheitern.");
  writeFileSync(path.join(migrationDirectory, "migration-metadata.tsv"), migrationMetadata);
  assert.notEqual(run([
    "evidence",
    gateFile,
    migrationDirectory,
    stateDirectory,
    appHost,
    sourceRevision,
    "f".repeat(64)
  ]).status, 0, "Ein anderer als der vorab gepinnte Public Key darf das Open-Gate nicht erfuellen.");

  const identityHash = run(["identity-hash", allowedEmails], identityRows);
  assert.equal(identityHash.status, 0, identityHash.stderr);
  assert.equal(identityHash.stdout, identitySha256);
  assert.equal(run(["identity", identitySha256, allowedEmails], identityRows).status, 0);
  assert.notEqual(run(["identity", "f".repeat(64), allowedEmails], identityRows).status, 0);

  writeFileSync(gateFile, gateSource.replace(`appHost=${appHost}`, "appHost=wrong.example.org"));
  assert.notEqual(runEvidence().status, 0);
  writeFileSync(gateFile, gateSource);
  writeFileSync(
    path.join(currentRestore.restoreDirectory, "RESULT.txt"),
    `${readFileSync(path.join(currentRestore.restoreDirectory, "RESULT.txt"), "utf8")}unexpected=true\n`
  );
  assert.notEqual(runEvidence().status, 0);

  writeFileSync(path.join(currentRestore.restoreDirectory, "RESULT.txt"), currentRestore.source);
  writeFileSync(gateFile, gateSource.replace(
    `databaseImportAttestationSha256=${hash(importAttestation)}`,
    `databaseImportAttestationSha256=${"f".repeat(64)}`
  ));
  assert.notEqual(runEvidence().status, 0,
    "Ein beliebiger Import-Attestation-Hash darf das Open-Gate nicht erfuellen.");

  writeFileSync(gateFile, gateSource.replace(
    `bucketInventorySha256=${hash(bucketInventory)}`,
    `bucketInventorySha256=${"d".repeat(64)}`
  ));
  assert.notEqual(runEvidence().status, 0,
    "Ein beliebiger Bucket-Inventur-Hash darf das Open-Gate nicht erfuellen.");
  writeFileSync(gateFile, gateSource.replace(
    `dnsReadbackSha256=${hash(dnsReadback)}`,
    `dnsReadbackSha256=${"e".repeat(64)}`
  ));
  assert.notEqual(runEvidence().status, 0,
    "Ein beliebiger DNS-Readback-Hash darf das Open-Gate nicht erfuellen.");

  const invalidBucketInventory = bucketInventory.replace("contactImageLiveObjects=0", "contactImageLiveObjects=1");
  writeFileSync(bucketInventoryFile, invalidBucketInventory);
  chmodSync(bucketInventoryFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({ bucketSource: invalidBucketInventory }));
  assert.notEqual(runEvidence().status, 0,
    "Eine nicht leere GCS-Inventur darf das Open-Gate nicht erfuellen.");
  writeFileSync(bucketInventoryFile, bucketInventory);
  chmodSync(bucketInventoryFile, 0o600);

  const invalidDnsReadback = dnsReadback.replace("externalResolverA=203.0.113.42", "externalResolverA=203.0.113.43");
  writeFileSync(dnsReadbackFile, invalidDnsReadback);
  chmodSync(dnsReadbackFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({ dnsSource: invalidDnsReadback }));
  assert.notEqual(runEvidence().status, 0,
    "Abweichende VPS- und externe DNS-Antworten duerfen das Open-Gate nicht erfuellen.");
  writeFileSync(dnsReadbackFile, dnsReadback);
  chmodSync(dnsReadbackFile, 0o600);

  const invalidSourceWriterSignature = Buffer.from(sourceWriterSignature);
  invalidSourceWriterSignature[0] ^= 0xff;
  writeFileSync(sourceWriterSignatureFile, invalidSourceWriterSignature);
  chmodSync(sourceWriterSignatureFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({ sourceSignature: invalidSourceWriterSignature }));
  assert.notEqual(runEvidence().status, 0,
    "Eine manipulierte Source-Writer-Signatur darf trotz passendem Dateihash nicht akzeptiert werden.");

  const wrongNonceEvidence = sourceWriterEvidence.replace(`gateNonce=${gateNonce}`, `gateNonce=${"3".repeat(64)}`);
  const wrongNonceSignature = sign(null, Buffer.from(wrongNonceEvidence), privateKey);
  writeFileSync(sourceWriterEvidenceFile, wrongNonceEvidence);
  writeFileSync(sourceWriterSignatureFile, wrongNonceSignature);
  chmodSync(sourceWriterEvidenceFile, 0o600);
  chmodSync(sourceWriterSignatureFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({ sourceEvidence: wrongNonceEvidence, sourceSignature: wrongNonceSignature }));
  assert.notEqual(runEvidence().status, 0,
    "Ein gueltig signierter Source-Readback fuer einen anderen Gate-Nonce darf nicht akzeptiert werden.");

  const wrongNamespaceEvidence = sourceWriterEvidence.replace(
    `namespaceInventorySha256=${namespaceInventorySha256}`,
    `namespaceInventorySha256=${"8".repeat(64)}`
  );
  const wrongNamespaceSignature = sign(null, Buffer.from(wrongNamespaceEvidence), privateKey);
  writeFileSync(sourceWriterEvidenceFile, wrongNamespaceEvidence);
  writeFileSync(sourceWriterSignatureFile, wrongNamespaceSignature);
  chmodSync(sourceWriterEvidenceFile, 0o600);
  chmodSync(sourceWriterSignatureFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({
    sourceEvidence: wrongNamespaceEvidence,
    sourceSignature: wrongNamespaceSignature
  }));
  assert.notEqual(runEvidence().status, 0,
    "Ein gueltig signierter Source-Readback fuer ein anderes Namespace-Inventar darf nicht akzeptiert werden.");

  const staleSourceWriterEvidence = sourceWriterEvidence
    .replace(`globalWriterAttestedAt=${isoBefore(3 * 60 * 1000)}`, `globalWriterAttestedAt=${isoBefore(12 * 60 * 1000)}`)
    .replace(`observedAt=${isoBefore(2 * 60 * 1000)}`, `observedAt=${isoBefore(11 * 60 * 1000)}`);
  const staleSourceWriterSignature = sign(null, Buffer.from(staleSourceWriterEvidence), privateKey);
  writeFileSync(sourceWriterEvidenceFile, staleSourceWriterEvidence);
  writeFileSync(sourceWriterSignatureFile, staleSourceWriterSignature);
  chmodSync(sourceWriterEvidenceFile, 0o600);
  chmodSync(sourceWriterSignatureFile, 0o600);
  writeFileSync(gateFile, gateSourceFor({
    sourceEvidence: staleSourceWriterEvidence,
    sourceSignature: staleSourceWriterSignature
  }));
  assert.notEqual(runEvidence().status, 0,
    "Ein alter Source-Writer-Readback darf das Open-Gate nicht erfuellen.");
  writeFileSync(sourceWriterEvidenceFile, sourceWriterEvidence);
  writeFileSync(sourceWriterSignatureFile, sourceWriterSignature);
  chmodSync(sourceWriterEvidenceFile, 0o600);
  chmodSync(sourceWriterSignatureFile, 0o600);

  const lateImportAt = isoBefore(60 * 1000);
  const lateImportAttestation = importAttestation
    .replace(`operationId=${compact(importedAt)}-41`, `operationId=${compact(lateImportAt)}-41`)
    .replace(`importedAt=${importedAt}`, `importedAt=${lateImportAt}`);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), lateImportAttestation);
  const lateImportRestore = writeRestoreResult({
    backupAt: isoBefore(30 * 1000),
    restoreAt: now.toISOString().replace(/\.000Z$/u, "Z")
  });
  writeFileSync(gateFile, gateSourceFor({
    importSource: lateImportAttestation,
    restoreSource: lateImportRestore.source
  }));
  const preImportSourceWriter = runEvidence();
  assert.notEqual(preImportSourceWriter.status, 0,
    "Ein vor dem attestierten Zielimport erzeugter Source-Writer-Readback darf das Open-Gate nicht erfuellen.");
  assert.match(preImportSourceWriter.stderr, /Source-Writer-Nachweis liegt nicht eindeutig nach dem attestierten Datenbankimport/u);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), importAttestation);
  writeRestoreResult({
    backupAt: isoBefore(15 * 60 * 1000),
    restoreAt: isoBefore(10 * 60 * 1000)
  });

  const equalExportImportOperationAttestation = importAttestation.replace(
    `operationId=${compact(importedAt)}-41`,
    `operationId=${compact(exportedAt)}-41`
  );
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), equalExportImportOperationAttestation);
  writeFileSync(gateFile, gateSourceFor({ importSource: equalExportImportOperationAttestation }));
  const equalExportImportOperation = runEvidence();
  assert.notEqual(equalExportImportOperation.status, 0,
    "Export und Importbeginn mit identischem Sekundentimestamp muessen als mehrdeutig scheitern.");
  assert.match(equalExportImportOperation.stderr, /Datenbankimport beginnt nicht eindeutig nach dem Migrations-Export/u);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), importAttestation);

  const equalSourceImportAt = isoBefore(2 * 60 * 1000);
  const equalSourceImportAttestation = importAttestation
    .replace(`operationId=${compact(importedAt)}-41`, `operationId=${compact(equalSourceImportAt)}-41`)
    .replace(`importedAt=${importedAt}`, `importedAt=${equalSourceImportAt}`);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), equalSourceImportAttestation);
  const equalSourceRestore = writeRestoreResult({
    backupAt: isoBefore(90 * 1000),
    restoreAt: isoBefore(60 * 1000)
  });
  writeFileSync(gateFile, gateSourceFor({
    importSource: equalSourceImportAttestation,
    restoreSource: equalSourceRestore.source
  }));
  const equalImportSourceWriter = runEvidence();
  assert.notEqual(equalImportSourceWriter.status, 0,
    "Import und finaler Source-Writer-Readback mit identischem Sekundentimestamp muessen als mehrdeutig scheitern.");
  assert.match(equalImportSourceWriter.stderr, /nicht eindeutig nach dem attestierten Datenbankimport/u);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), importAttestation);
  writeRestoreResult({
    backupAt: isoBefore(15 * 60 * 1000),
    restoreAt: isoBefore(10 * 60 * 1000)
  });

  const equalRestoreSourceReadback = writeRestoreResult({
    backupAt: isoBefore(3 * 60 * 1000),
    restoreAt: isoBefore(2 * 60 * 1000)
  });
  writeFileSync(gateFile, gateSourceFor({ restoreSource: equalRestoreSourceReadback.source }));
  const equalRestoreSourceWriter = runEvidence();
  assert.notEqual(equalRestoreSourceWriter.status, 0,
    "Restore und finaler Source-Writer-Readback mit identischem Sekundentimestamp muessen scheitern.");
  assert.match(equalRestoreSourceWriter.stderr, /Source-Writer-Nachweis liegt nicht eindeutig nach dem Restore-Test/u);
  writeRestoreResult({
    backupAt: isoBefore(15 * 60 * 1000),
    restoreAt: isoBefore(10 * 60 * 1000)
  });

  writeFileSync(gateFile, gateSourceFor({ approvedAt: isoBefore(11 * 60 * 1000) }));
  assert.notEqual(runEvidence().status, 0,
    "Ein beim aktuellen Apply bereits mehr als zehn Minuten altes Open-Gate darf nicht bestehen.");

  const equalBackupRestoreAt = isoBefore(15 * 60 * 1000);
  const equalBackupRestore = writeRestoreResult({
    backupAt: equalBackupRestoreAt,
    restoreAt: equalBackupRestoreAt
  });
  writeFileSync(gateFile, gateSourceFor({ restoreSource: equalBackupRestore.source }));
  assert.notEqual(runEvidence().status, 0,
    "Restore-Test und Backup mit identischem Sekundentimestamp muessen als mehrdeutig scheitern.");

  const equalBackupAt = isoBefore(15 * 60 * 1000);
  const equalImportAttestation = importAttestation
    .replace(`operationId=${compact(importedAt)}-41`, `operationId=${compact(equalBackupAt)}-41`)
    .replace(`importedAt=${importedAt}`, `importedAt=${equalBackupAt}`);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), equalImportAttestation);
  const equalSecondRestore = writeRestoreResult({
    backupAt: equalBackupAt,
    restoreAt: isoBefore(10 * 60 * 1000)
  });
  writeFileSync(gateFile, gateSourceFor({
    importSource: equalImportAttestation,
    restoreSource: equalSecondRestore.source
  }));
  assert.notEqual(runEvidence().status, 0,
    "Backup und Import mit identischem Sekundentimestamp muessen als mehrdeutig scheitern.");

  const postBackupImport = importAttestation.replace(`importedAt=${importedAt}`, `importedAt=${isoBefore(5 * 60 * 1000)}`);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), postBackupImport);
  writeFileSync(gateFile, gateSourceFor({ importSource: postBackupImport }));
  assert.notEqual(runEvidence().status, 0,
    "Ein vor dem attestierten Import erzeugtes Backup darf das Open-Gate nicht erfuellen.");

  const staleImportedAt = isoBefore(8 * 60 * 60 * 1000);
  const staleImportAttestation = importAttestation
    .replace(`operationId=${compact(importedAt)}-41`, `operationId=${compact(staleImportedAt)}-41`)
    .replace(`importedAt=${importedAt}`, `importedAt=${staleImportedAt}`);
  writeFileSync(path.join(stateDirectory, ".database-import-attestation"), staleImportAttestation);
  const staleRestore = writeRestoreResult({
    backupAt: isoBefore(7.5 * 60 * 60 * 1000),
    restoreAt: isoBefore(7 * 60 * 60 * 1000)
  });
  writeFileSync(gateFile, gateSourceFor({
    importSource: staleImportAttestation,
    restoreSource: staleRestore.source
  }));
  assert.notEqual(runEvidence().status, 0,
    "Ein mehr als sechs Stunden alter Restore-Test darf das Open-Gate nicht erfuellen.");

console.log("Cutover open gate test OK: import, signed source writer, bucket/DNS evidence, post-import backup, fresh restore and identity are fail-closed bound.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
