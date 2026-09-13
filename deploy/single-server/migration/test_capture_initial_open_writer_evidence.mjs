#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceCollector = fileURLToPath(new URL("./capture-initial-open-writer-evidence.sh", import.meta.url));
const temporaryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), "vk-initial-open-writer-test-"));

const projectId = "example-pre-gematik-project";
const region = "europe-west3";
const instanceName = "versorgungs-kompass-db";
const connectionName = `${projectId}:${region}:${instanceName}`;
const namespace = "pre-gematik";
const deployment = "versorgungs-kompass-api";
const deploymentUid = "22222222-2222-4222-8222-222222222222";
const bindingFingerprint = "8".repeat(64);
const namespaceInventorySha256 = "9".repeat(64);
const gateNonce = "7".repeat(64);
const sourceDeployedRevision = "1".repeat(40);
const syntheticSecret = "synthetic-secret-must-not-leak";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.error, undefined, `Prozess konnte nicht gestartet werden: ${command}`);
  return result;
}

function mustSucceed(command, args, options = {}) {
  const result = run(command, args, options);
  assert.equal(result.status, 0, `${command} fehlgeschlagen:\n${result.stderr || result.stdout}`);
  return result;
}

function writeProtected(file, contents) {
  writeFileSync(file, contents, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeExecutable(file, contents) {
  writeFileSync(file, contents, { mode: 0o755 });
  chmodSync(file, 0o755);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function isoSeconds(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

try {
  const repository = path.join(temporaryRoot, "repository");
  const migrationScriptDirectory = path.join(repository, "deploy", "single-server", "migration");
  const packageDirectory = path.join(temporaryRoot, "migration-package");
  const libpqDirectory = path.join(temporaryRoot, "libpq");
  const protectedDirectory = path.join(temporaryRoot, "protected");
  const outputParent = path.join(temporaryRoot, "outputs");
  const fakeBin = path.join(temporaryRoot, "bin");
  for (const directory of [migrationScriptDirectory, packageDirectory, libpqDirectory, protectedDirectory, outputParent, fakeBin]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }

  const collector = path.join(migrationScriptDirectory, "capture-initial-open-writer-evidence.sh");
  copyFileSync(sourceCollector, collector);
  chmodSync(collector, 0o755);

  const freezeCounter = path.join(protectedDirectory, "freeze-counter");
  const freezeMode = path.join(protectedDirectory, "freeze-mode");
  writeProtected(freezeCounter, "0\n");
  writeProtected(freezeMode, "stable\n");
  const freezeOperator = path.join(migrationScriptDirectory, "gke-writer-freeze.mjs");
  writeExecutable(freezeOperator, `#!/bin/sh
set -eu
[ "\${1:-}" = "freeze" ]
[ "\${2:-}" = "--config" ]
[ "\${4:-}" = "--readback" ]
counter="$(/bin/cat ${JSON.stringify(freezeCounter)})"
counter="$((counter + 1))"
printf '%s\n' "$counter" >${JSON.stringify(freezeCounter)}
namespace_sha=${JSON.stringify(namespaceInventorySha256)}
if [ "$(/bin/cat ${JSON.stringify(freezeMode)})" = "drift" ] && [ "$counter" -eq 2 ]; then
  namespace_sha=${JSON.stringify("6".repeat(64))}
fi
printf '%s\n' \\
  'AKTION=freeze' \\
  'PHASE=readback-frozen' \\
  'ZIEL=${projectId}/${region}/versorgungs-kompass-pre-gematik:${namespace}/${deployment}' \\
  'DEPLOYMENT_UID=${deploymentUid}' \\
  'REPLICAS=0' \\
  'API_PODS=0' \\
  'FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0' \\
  "NAMESPACE_INVENTAR_SHA256=$namespace_sha" \\
  'NACHWEIS_GRENZE=konfiguriertes-namespace-und-api-deployment' \\
  'NICHT_ERFASST=externe-db-clients-und-andere-namespaces' \\
  'EXTERNER_GLOBALER_WRITER_NACHWEIS=separat-erforderlich' \\
  'IMAGE=europe-west3-docker.pkg.dev/${projectId}/versorgungs-kompass/api@sha256:${"b".repeat(64)}' \\
  'IMAGE_ID=containerd://sha256:${"b".repeat(64)}' \\
  'STATUSDATEI_PHASE=frozen' \\
  "OPERATOR_REVISION=$(git -C ${JSON.stringify(repository)} rev-parse HEAD)"
`);

  mustSucceed("git", ["init", "-q", repository]);
  mustSucceed("git", ["-C", repository, "config", "user.name", "Collector-Test"]);
  mustSucceed("git", ["-C", repository, "config", "user.email", "collector@test.invalid"]);
  mustSucceed("git", ["-C", repository, "add",
    "deploy/single-server/migration/capture-initial-open-writer-evidence.sh",
    "deploy/single-server/migration/gke-writer-freeze.mjs"]);
  mustSucceed("git", ["-C", repository, "commit", "-q", "-m", "Initial-Open-Collector testen"]);
  const targetRevision = mustSucceed("git", ["-C", repository, "rev-parse", "HEAD"]).stdout.trim();

  const stateFile = path.join(protectedDirectory, "cutover-state.json");
  const baseState = {
    binding_fingerprint: bindingFingerprint,
    deployment,
    deployment_uid: deploymentUid,
    format_version: 1,
    freeze_started_at: "2026-09-13T08:00:00.000Z",
    frozen_at: "2026-09-13T08:01:00.000Z",
    frozen_deployment_generation: 8,
    frozen_deployment_resource_version: "101",
    gcp_project_id: projectId,
    namespace,
    operator_revision: targetRevision,
    phase: "frozen"
  };
  const baseStateRaw = `${JSON.stringify(baseState, null, 2)}\n`;
  writeProtected(stateFile, baseStateRaw);
  const historicalStateSha256 = sha256(Buffer.from(baseStateRaw));

  const gkeConfig = path.join(protectedDirectory, "gke-freeze.conf");
  writeProtected(gkeConfig, [
    "FORMAT_VERSION=1",
    `GCP_PROJECT_ID=${projectId}`,
    `K8S_NAMESPACE=${namespace}`,
    `STATE_FILE=${stateFile}`,
    ""
  ].join("\n"));

  const globalWriterAttestation = path.join(protectedDirectory, "global-writer-attestation.conf");
  function setGlobalWriterAttestation({
    attestedAt = isoSeconds(),
    stateSha256 = historicalStateSha256,
    binding = bindingFingerprint,
    namespaceSha256 = namespaceInventorySha256
  } = {}) {
    writeProtected(globalWriterAttestation, [
      "FORMAT_VERSION=1",
      `GCP_PROJECT_ID=${projectId}`,
      `CLOUD_SQL_INSTANCE_CONNECTION_NAME=${connectionName}`,
      `GKE_STATE_SHA256=${stateSha256}`,
      `GKE_BINDING_FINGERPRINT=${binding}`,
      `NAMESPACE_INVENTORY_SHA256=${namespaceSha256}`,
      "OTHER_NAMESPACES_DB_WRITERS=none",
      "EXTERNAL_DB_WRITERS=none",
      `ATTESTED_AT=${attestedAt}`,
      ""
    ].join("\n"));
  }
  setGlobalWriterAttestation();

  writeProtected(path.join(libpqDirectory, "pg_service.conf"), [
    "[versorgungs-kompass-source]",
    `host=/cloudsql/${connectionName}`,
    "port=5432",
    "dbname=versorgungs_kompass",
    "user=vk_export",
    "sslmode=disable",
    ""
  ].join("\n"));
  writeProtected(path.join(libpqDirectory, "source-target.conf"), [
    "FORMAT_VERSION=1",
    `GCP_PROJECT_ID=${projectId}`,
    `CLOUD_SQL_INSTANCE_CONNECTION_NAME=${connectionName}`,
    "CLOUD_SQL_DATABASE=versorgungs_kompass",
    "CLOUD_SQL_USER=vk_export",
    ""
  ].join("\n"));
  writeProtected(path.join(libpqDirectory, "pgpass"),
    `/cloudsql/${connectionName}:5432:versorgungs_kompass:vk_export:${syntheticSecret}\n`);

  const metadata = [
    "key\tvalue",
    "database\tversorgungs_kompass",
    "format_version\t2",
    "postgres_major\t16",
    `source_deployed_revision\t${sourceDeployedRevision}`,
    `target_revision\t${targetRevision}`,
    `cloud_sql_instance_connection_name\t${connectionName}`,
    `gke_binding_fingerprint\t${bindingFingerprint}`,
    `gke_freeze_state_sha256\t${historicalStateSha256}`,
    `global_writer_attestation_sha256\t${"4".repeat(64)}`,
    `namespace_inventory_sha256\t${namespaceInventorySha256}`,
    "database_snapshot_id\t00000003-0000001B-1",
    "exported_at\t2026-09-13T08:02:00Z",
    ""
  ].join("\n");
  const packageContents = new Map([
    ["database.dump", "synthetic-dump\n"],
    ["database.toc", "synthetic-toc\n"],
    ["migration-metadata.tsv", metadata],
    ["row-counts.tsv", "schema\ttable\trows\npublic\tprofiles\t1\n"],
    ["storage-reference-counts.tsv", "reference_type\trows\ncontact_images\t0\n"]
  ]);
  for (const [name, contents] of packageContents) writeProtected(path.join(packageDirectory, name), contents);
  writeProtected(path.join(packageDirectory, "SHA256SUMS"), [...packageContents]
    .map(([name, contents]) => `${sha256(Buffer.from(contents))}  ${name}`)
    .join("\n") + "\n");
  const migrationPackageSha256 = sha256(readFileSync(path.join(packageDirectory, "SHA256SUMS")));

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signingKey = path.join(protectedDirectory, "initial-open-signing-key.pem");
  writeProtected(signingKey, privateKey.export({ format: "pem", type: "pkcs8" }));

  const databaseMode = path.join(protectedDirectory, "database-mode");
  const databaseLog = path.join(protectedDirectory, "database-command.log");
  writeProtected(databaseMode, "zero\n");
  writeProtected(databaseLog, "");

  writeExecutable(path.join(fakeBin, "gcloud"), `#!/bin/sh
set -eu
if [ "\${1:-}" = "config" ] && [ "\${2:-}" = "get-value" ] && [ "\${3:-}" = "project" ]; then
  printf '%s\n' ${JSON.stringify(projectId)}
  exit 0
fi
if [ "\${1:-}" = "sql" ] && [ "\${2:-}" = "instances" ] && [ "\${3:-}" = "describe" ]; then
  printf '%s\n' ${JSON.stringify(JSON.stringify({
    connectionName,
    project: projectId,
    databaseVersion: "POSTGRES_16",
    state: "RUNNABLE"
  }))}
  exit 0
fi
printf '%s\n' 'unerwarteter synthetischer gcloud-Aufruf' >&2
exit 41
`);

  writeExecutable(path.join(fakeBin, "psql"), `#!/bin/sh
set -eu
{
  printf 'PGAPPNAME=%s\n' "\${PGAPPNAME-unset}"
  printf 'PGSERVICEFILE=%s\n' "\${PGSERVICEFILE-unset}"
  printf 'PGPASSFILE=%s\n' "\${PGPASSFILE-unset}"
  printf 'PGPASSWORD=%s\n' "\${PGPASSWORD-unset}"
  printf '%s\n' '--'
} >>${JSON.stringify(databaseLog)}
if [ "\${1:-}" = "--version" ]; then
  printf '%s\n' 'psql (PostgreSQL) 16.15'
  exit 0
fi
case "$*" in
  *server_version_num*) printf '%s\n' '160015'; exit 0 ;;
  *current_database*) printf '%s\n' 'versorgungs_kompass'; exit 0 ;;
esac
input="$(/bin/cat)"
case "$input" in
  *pg_stat_activity*)
    if [ "$(/bin/cat ${JSON.stringify(databaseMode)})" = "zero" ]; then
      printf '%s\n' '0'
    else
      printf '%s\n' 'blocked'
    fi
    ;;
  *) printf '%s\n' 'unerwartete synthetische SQL-Anweisung' >&2; exit 42 ;;
esac
`);

  const environment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    PGPASSWORD: syntheticSecret,
    PGHOST: "must-not-be-used.invalid",
    PGSERVICE: "must-not-be-used"
  };

  function collectorArgs(outputDirectory) {
    return [
      "--migration-dir", packageDirectory,
      "--libpq-dir", libpqDirectory,
      "--gke-config", gkeConfig,
      "--global-writer-attestation", globalWriterAttestation,
      "--gate-nonce", gateNonce,
      "--output-dir", outputDirectory,
      "--signing-key", signingKey
    ];
  }

  function resetReadbacks(mode = "stable") {
    writeProtected(freezeCounter, "0\n");
    writeProtected(freezeMode, `${mode}\n`);
  }

  function expectFailure(label, outputDirectory, expectedPattern) {
    resetReadbacks();
    const result = run(collector, collectorArgs(outputDirectory), { env: environment });
    assert.notEqual(result.status, 0, `${label}: Negativtest muss fail-closed abbrechen.`);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedPattern, `${label}: Fehlermeldung muss die Sperrursache benennen.`);
    assert.equal(existsSync(outputDirectory), false, `${label}: Fehler darf kein Teiloutput-Verzeichnis publizieren.`);
  }

  const positiveOutput = path.join(outputParent, "positive");
  resetReadbacks();
  const positiveResult = run(collector, collectorArgs(positiveOutput), { env: environment });
  assert.equal(positiveResult.status, 0, `Positivlauf fehlgeschlagen:\n${positiveResult.stderr || positiveResult.stdout}`);
  const payloadFile = path.join(positiveOutput, "initial-open-source-writer.attestation");
  const signatureFile = `${payloadFile}.sig`;
  assert.equal(existsSync(payloadFile), true);
  assert.equal(existsSync(signatureFile), true);
  assert.equal(statSync(positiveOutput).mode & 0o777, 0o700);
  assert.equal(statSync(payloadFile).mode & 0o777, 0o600);
  assert.equal(statSync(signatureFile).mode & 0o777, 0o600);
  const payload = readFileSync(payloadFile);
  const signature = readFileSync(signatureFile);
  assert.equal(signature.length, 64, "Ed25519-Signatur muss 64 rohe Bytes besitzen.");
  assert.equal(verify(null, payload, publicKey, signature), true, "Detached Signatur muss offline mit dem Public Key pruefbar sein.");
  const payloadText = payload.toString("utf8");
  assert.match(payloadText, /\n$/u, "Payload braucht einen finalen Zeilenumbruch.");
  const payloadLines = payloadText.trimEnd().split("\n");
  assert.deepEqual(payloadLines.slice(0, 22), [
    "schemaVersion=1",
    "evidenceKind=initial-open-source-writer",
    `gateNonce=${gateNonce}`,
    `migrationPackageSha256=${migrationPackageSha256}`,
    `sourceDeployedRevision=${sourceDeployedRevision}`,
    `targetRevision=${targetRevision}`,
    `operatorRevision=${targetRevision}`,
    `gcpProjectId=${projectId}`,
    `cloudSqlInstanceConnectionName=${connectionName}`,
    "cloudSqlDatabase=versorgungs_kompass",
    `gkeFreezeStateSha256=${historicalStateSha256}`,
    `gkeBindingFingerprint=${bindingFingerprint}`,
    "frozenDeploymentGeneration=8",
    `namespaceInventorySha256=${namespaceInventorySha256}`,
    `freshGlobalWriterAttestationSha256=${sha256(readFileSync(globalWriterAttestation))}`,
    payloadLines[15],
    "gkeReplicas=0",
    "gkeApiPods=0",
    "foreignNamespaceDbWriterCandidates=0",
    "otherNamespacesDbWriters=none",
    "externalDbWriters=none",
    "cloudSqlOtherClientSessions=0"
  ]);
  assert.match(payloadLines[15], /^globalWriterAttestedAt=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  assert.match(payloadLines[22], /^observedAt=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  assert.equal(payloadLines.length, 23, "Payload-Schema darf keine Zusatzfelder enthalten.");

  const databaseLogText = readFileSync(databaseLog, "utf8");
  assert.match(databaseLogText, /PGAPPNAME=vk-initial-open-source-writer-[1-9][0-9]*/u);
  assert.match(databaseLogText, new RegExp(`PGSERVICEFILE=${path.join(libpqDirectory, "pg_service.conf").replaceAll("/", "\\/")}`, "u"));
  assert.match(databaseLogText, new RegExp(`PGPASSFILE=${path.join(libpqDirectory, "pgpass").replaceAll("/", "\\/")}`, "u"));
  assert.doesNotMatch(databaseLogText, new RegExp(syntheticSecret, "u"));
  assert.doesNotMatch(databaseLogText, /must-not-be-used/u);

  setGlobalWriterAttestation({ attestedAt: isoSeconds(new Date(Date.now() - 11 * 60 * 1000)) });
  expectFailure("stale attestation", path.join(outputParent, "stale-attestation"), /Writer-Nachweis.*veraltet|nicht frisch/u);

  setGlobalWriterAttestation({ stateSha256: "3".repeat(64) });
  expectFailure("wrong state binding", path.join(outputParent, "wrong-state-attestation"), /Writer-Nachweis.*gebunden|Writer-Nachweis.*ausgetauscht/u);

  setGlobalWriterAttestation();
  writeProtected(stateFile, `${JSON.stringify({
    ...baseState,
    freeze_started_at: "2026-09-13T09:00:00.000Z",
    frozen_at: "2026-09-13T09:01:00.000Z",
    frozen_deployment_generation: 9,
    frozen_deployment_resource_version: "202"
  }, null, 2)}\n`);
  expectFailure("unfreeze/refreeze", path.join(outputParent, "refrozen-state"), /historischen Exportzustand|Statusdatei.*unveraendert/u);

  writeProtected(stateFile, baseStateRaw);
  setGlobalWriterAttestation();
  writeProtected(databaseMode, "other-session\n");
  expectFailure("other session", path.join(outputParent, "other-session"), /andere Cloud-SQL-Client-Session/u);

  writeProtected(databaseMode, "zero\n");
  const driftOutput = path.join(outputParent, "drift-between-readbacks");
  resetReadbacks("drift");
  const driftResult = run(collector, collectorArgs(driftOutput), { env: environment });
  assert.notEqual(driftResult.status, 0, "Drift zwischen Readbacks muss fail-closed abbrechen.");
  assert.match(`${driftResult.stdout}\n${driftResult.stderr}`, /Readback.*Frozen-Nullzustand|driftete/u);
  assert.equal(existsSync(driftOutput), false, "Readback-Drift darf keinen Teiloutput publizieren.");

  process.stdout.write("Initial-Open-Writer-Collector: Positivlauf und Kernnegative erfolgreich.\n");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
