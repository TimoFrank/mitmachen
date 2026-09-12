#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceScript = fileURLToPath(new URL("./export-database.sh", import.meta.url));
const temporaryRoot = mkdtempSync(path.join(realpathSync(os.tmpdir()), "vk-export-wrapper-test-"));
const syntheticSecret = "synthetic-db-secret-must-not-leak";
const sourceRevision = "1".repeat(40);
const projectId = "example-pre-gematik-project";
const region = "europe-west3";
const instanceName = "versorgungs-kompass-db";
const connectionName = `${projectId}:${region}:${instanceName}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options
  });
  assert.equal(result.error, undefined, `Prozess konnte nicht gestartet werden: ${command}`);
  return result;
}

function mustSucceed(command, args, options = {}) {
  const result = run(command, args, options);
  assert.equal(result.status, 0, `${command} fehlgeschlagen:\n${result.stderr || result.stdout}`);
  return result;
}

function expectFailure(script, args, expectedPattern, environment) {
  const result = run(script, args, { env: environment });
  assert.notEqual(result.status, 0, "Negativtest muss fail-closed abbrechen.");
  assert.match(`${result.stdout}\n${result.stderr}`, expectedPattern);
}

function writeExecutable(file, source) {
  writeFileSync(file, source, { mode: 0o700 });
  chmodSync(file, 0o700);
}

try {
  const repository = path.join(temporaryRoot, "repository");
  const migrationDirectory = path.join(repository, "deploy", "single-server", "migration");
  const fakeBin = path.join(temporaryRoot, "bin");
  const libpqDirectory = path.join(temporaryRoot, "libpq");
  const freezeDirectory = path.join(temporaryRoot, "gke-freeze");
  const exportParent = path.join(temporaryRoot, "exports");
  const commandLog = path.join(temporaryRoot, "postgres-command.log");
  for (const directory of [migrationDirectory, fakeBin, libpqDirectory, freezeDirectory, exportParent]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }

  const wrapper = path.join(migrationDirectory, "export-database.sh");
  copyFileSync(sourceScript, wrapper);
  chmodSync(wrapper, 0o755);
  const freezeOperator = path.join(migrationDirectory, "gke-writer-freeze.mjs");
  const namespaceInventorySha256 = "9".repeat(64);
  const gkeBindingFingerprint = "8".repeat(64);
  writeExecutable(freezeOperator, `#!/bin/sh
set -eu
[ "\${1:-}" = "freeze" ]
[ "\${2:-}" = "--config" ]
[ "\${4:-}" = "--readback" ]
printf '%s\n' \
  'AKTION=freeze' \
  'PHASE=readback-frozen' \
  'FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0' \
  'NAMESPACE_INVENTAR_SHA256=${namespaceInventorySha256}' \
  'NACHWEIS_GRENZE=konfiguriertes-namespace-und-api-deployment' \
  'NICHT_ERFASST=externe-db-clients-und-andere-namespaces' \
  'EXTERNER_GLOBALER_WRITER_NACHWEIS=separat-erforderlich' \
  'STATUSDATEI_PHASE=frozen' \
  "OPERATOR_REVISION=\${SYNTHETIC_TARGET_REVISION:?}"
`);

  const logPrelude = `
{
  printf 'TOOL=%s\\n' "$(basename "$0")"
  for argument in "$@"; do printf 'ARG=%s\\n' "$argument"; done
  /usr/bin/env | /usr/bin/sort
  printf '%s\\n' '--'
} >>${JSON.stringify(commandLog)}
`;
  writeExecutable(path.join(fakeBin, "psql"), `#!/bin/sh
set -eu
${logPrelude}
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' 'psql (PostgreSQL) 16.15'
  exit 0
fi
case "$*" in
  *server_version_num*) printf '%s\\n' '160015'; exit 0 ;;
  *current_database*) printf '%s\\n' 'versorgungs_kompass'; exit 0 ;;
esac
input="$(/bin/cat)"
case "$input" in
  *pg_stat_activity*)
    printf '%s\n' 'ok'
    ;;
  *pg_export_snapshot*)
    snapshot_file="$(printf '%s\n' "$input" | /usr/bin/sed -n 's/^\\\\o //p' | /usr/bin/head -n 1)"
    [ -n "$snapshot_file" ]
    printf '%s\n' '00000003-0000001B-1' >"$snapshot_file"
    /bin/sleep 30
    ;;
  *contact_images*)
    printf 'contact_images\\t0\\ncontact_note_attachments\\t0\\nprofile_images\\t0\\nstakeholder_logos\\t0\\n'
    ;;
  *)
    printf 'public\\tcontact_note_attachments\\t0\\npublic\\tcontacts\\t0\\npublic\\tprofiles\\t1\\npublic\\tstakeholder_organizations\\t0\\n'
    ;;
esac
`);
  writeExecutable(path.join(fakeBin, "pg_dump"), `#!/bin/sh
set -eu
${logPrelude}
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' 'pg_dump (PostgreSQL) 16.15'
  exit 0
fi
output=''
for argument in "$@"; do
  case "$argument" in --file=*) output="\${argument#--file=}" ;; esac
done
[ -n "$output" ]
printf '%s\\n' 'synthetic-custom-dump' >"$output"
`);
  writeExecutable(path.join(fakeBin, "pg_restore"), `#!/bin/sh
set -eu
${logPrelude}
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' 'pg_restore (PostgreSQL) 16.15'
  exit 0
fi
printf '%s\\n' '; synthetic archive'
printf '%s\\n' '101; 0 1001 TABLE DATA public contact_note_attachments vk_owner'
printf '%s\\n' '102; 0 1002 TABLE DATA public contacts vk_owner'
printf '%s\\n' '103; 0 1003 TABLE DATA public profiles vk_owner'
printf '%s\\n' '104; 0 1004 TABLE DATA public stakeholder_organizations vk_owner'
`);
  writeExecutable(path.join(fakeBin, "gcloud"), `#!/bin/sh
set -eu
${logPrelude}
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
printf '%s\n' 'unexpected synthetic gcloud command' >&2
exit 41
`);

  writeFileSync(path.join(libpqDirectory, "pg_service.conf"), [
    "[versorgungs-kompass-source]",
    `host=/cloudsql/${connectionName}`,
    "port=5432",
    "dbname=versorgungs_kompass",
    "user=vk_export",
    "sslmode=disable",
    ""
  ].join("\n"), { mode: 0o600 });
  writeFileSync(path.join(libpqDirectory, "source-target.conf"), [
    "FORMAT_VERSION=1",
    `GCP_PROJECT_ID=${projectId}`,
    `CLOUD_SQL_INSTANCE_CONNECTION_NAME=${connectionName}`,
    "CLOUD_SQL_DATABASE=versorgungs_kompass",
    "CLOUD_SQL_USER=vk_export",
    ""
  ].join("\n"), { mode: 0o600 });
  writeFileSync(path.join(libpqDirectory, "pgpass"),
    `/cloudsql/${connectionName}:5432:versorgungs_kompass:vk_export:${syntheticSecret}\n`,
    { mode: 0o600 });
  chmodSync(path.join(libpqDirectory, "pg_service.conf"), 0o600);
  chmodSync(path.join(libpqDirectory, "source-target.conf"), 0o600);
  chmodSync(path.join(libpqDirectory, "pgpass"), 0o600);

  mustSucceed("git", ["init", "-q", repository]);
  mustSucceed("git", ["-C", repository, "config", "user.name", "Migrationstest"]);
  mustSucceed("git", ["-C", repository, "config", "user.email", "migration@test.invalid"]);
  mustSucceed("git", ["-C", repository, "add", "deploy/single-server/migration/export-database.sh", "deploy/single-server/migration/gke-writer-freeze.mjs"]);
  mustSucceed("git", ["-C", repository, "commit", "-q", "-m", "Exportwrapper testen"]);
  const targetRevision = mustSucceed("git", ["-C", repository, "rev-parse", "HEAD"]).stdout.trim();
  const freezeState = path.join(freezeDirectory, "cutover-state.json");
  const freezeConfig = path.join(freezeDirectory, "target.conf");
  const globalWriterAttestation = path.join(freezeDirectory, "global-writer-attestation.conf");
  writeFileSync(freezeState, `${JSON.stringify({
    binding_fingerprint: gkeBindingFingerprint,
    frozen_deployment_generation: 8,
    frozen_deployment_resource_version: "101",
    gcp_project_id: projectId,
    operator_revision: targetRevision,
    phase: "frozen"
  })}\n`, { mode: 0o600 });
  writeFileSync(freezeConfig, `STATE_FILE=${freezeState}\n`, { mode: 0o600 });
  const freezeStateSha256 = createHash("sha256").update(readFileSync(freezeState)).digest("hex");
  writeFileSync(globalWriterAttestation, [
    "FORMAT_VERSION=1",
    `GCP_PROJECT_ID=${projectId}`,
    `CLOUD_SQL_INSTANCE_CONNECTION_NAME=${connectionName}`,
    `GKE_STATE_SHA256=${freezeStateSha256}`,
    `GKE_BINDING_FINGERPRINT=${gkeBindingFingerprint}`,
    `NAMESPACE_INVENTORY_SHA256=${namespaceInventorySha256}`,
    "OTHER_NAMESPACES_DB_WRITERS=none",
    "EXTERNAL_DB_WRITERS=none",
    `ATTESTED_AT=${new Date().toISOString().replace(/\.\d{3}Z$/u, "Z")}`,
    ""
  ].join("\n"), { mode: 0o600 });
  for (const protectedFile of [freezeState, freezeConfig, globalWriterAttestation]) chmodSync(protectedFile, 0o600);

  const environment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    PGPASSWORD: syntheticSecret,
    PGHOST: "must-not-be-used.example.invalid",
    PGSERVICE: "must-not-be-used",
    SYNTHETIC_TARGET_REVISION: targetRevision
  };
  const exportArguments = (directory, revision = sourceRevision) => [
    directory,
    libpqDirectory,
    revision,
    freezeConfig,
    globalWriterAttestation
  ];
  const exportDirectory = path.join(exportParent, "cutover-positive");
  const positive = mustSucceed(wrapper, exportArguments(exportDirectory), {
    env: environment
  });
  assert.match(positive.stdout, /Datenexport erfolgreich/u);
  assert.deepEqual(readdirSync(exportDirectory).sort(), [
    "SHA256SUMS",
    "database.dump",
    "database.toc",
    "migration-metadata.tsv",
    "row-counts.tsv",
    "storage-reference-counts.tsv"
  ]);
  assert.equal(statSync(exportDirectory).mode & 0o777, 0o700);
  for (const name of readdirSync(exportDirectory)) {
    assert.equal(statSync(path.join(exportDirectory, name)).mode & 0o777, 0o600, `${name} muss Modus 0600 besitzen.`);
  }
  const metadata = readFileSync(path.join(exportDirectory, "migration-metadata.tsv"), "utf8");
  assert.match(metadata, /format_version\t2\n/u);
  assert.match(metadata, new RegExp(`source_deployed_revision\\t${sourceRevision}\\n`, "u"));
  assert.match(metadata, new RegExp(`target_revision\\t${targetRevision}\\n`, "u"));
  assert.match(metadata, new RegExp(`gke_freeze_state_sha256\\t${freezeStateSha256}\\n`, "u"));
  assert.match(metadata, new RegExp(`namespace_inventory_sha256\\t${namespaceInventorySha256}\\n`, "u"));
  assert.match(metadata, /database_snapshot_id\t00000003-0000001B-1\n/u);
  const processLog = readFileSync(commandLog, "utf8");
  assert.doesNotMatch(processLog, new RegExp(syntheticSecret, "u"), "Passwort darf weder argv noch Prozessumgebung erreichen.");
  assert.doesNotMatch(processLog, /^PGPASSWORD=/mu, "Geerbtes PGPASSWORD muss vor jedem PostgreSQL-Prozess entfernt sein.");
  assert.doesNotMatch(processLog, /must-not-be-used/u, "Geerbte libpq-Ziele duerfen die gepruefte Konfiguration nicht uebersteuern.");
  assert.match(processLog, new RegExp(`PGPASSFILE=${path.join(libpqDirectory, "pgpass").replaceAll("/", "\\/")}`, "u"));
  assert.match(processLog, /ARG=--snapshot=00000003-0000001B-1/u,
    "Dump und beide Zaehllaeufe muessen an denselben exportierten PostgreSQL-Snapshot gebunden sein.");
  assert.ok((processLog.match(/ARG=--set=SNAPSHOT_ID=00000003-0000001B-1/gu) || []).length >= 2);
  assert.equal((processLog.match(/ARG=--set=EXPECTED_OTHER_SESSIONS=[01]/gu) || []).length, 2,
    "Client-Sessions muessen direkt vor dem Snapshot und vor dessen Freigabe inventarisiert werden.");
  assert.match(processLog, /PGAPPNAME=vk-cutover-export-[1-9][0-9]*/u);

  expectFailure(wrapper, exportArguments(exportDirectory), /EXPORT_DIR muss neu sein/u, environment);
  expectFailure(wrapper, exportArguments(path.join(repository, "nested-export")), /in beide Richtungen unverschachtelt/u, environment);
  expectFailure(wrapper, exportArguments(temporaryRoot), /in beide Richtungen unverschachtelt/u, environment);
  expectFailure(wrapper, [path.join(exportParent, "reverse-nesting"), temporaryRoot, sourceRevision, freezeConfig, globalWriterAttestation], /in beide Richtungen unverschachtelt/u, environment);

  const preexistingEmptyTarget = path.join(exportParent, "preexisting-empty");
  mkdirSync(preexistingEmptyTarget, { mode: 0o700 });
  expectFailure(wrapper, exportArguments(preexistingEmptyTarget), /EXPORT_DIR muss neu sein/u, environment);

  const libpqSymlink = path.join(temporaryRoot, "libpq-link");
  symlinkSync(libpqDirectory, libpqSymlink, "dir");
  expectFailure(wrapper, [path.join(exportParent, "symlink-libpq"), libpqSymlink, sourceRevision, freezeConfig, globalWriterAttestation], /Symlink|symlinkfrei/u, environment);

  const exportParentSymlink = path.join(temporaryRoot, "exports-link");
  symlinkSync(exportParent, exportParentSymlink, "dir");
  expectFailure(wrapper, exportArguments(path.join(exportParentSymlink, "symlink-export")), /kanonisch|Symlink/u, environment);

  const wrapperSymlink = path.join(temporaryRoot, "export-wrapper-link.sh");
  symlinkSync(wrapper, wrapperSymlink, "file");
  assert.equal(lstatSync(wrapperSymlink).isSymbolicLink(), true);
  expectFailure(wrapperSymlink, exportArguments(path.join(exportParent, "symlink-wrapper")), /kanonischen und symlinkfreien Pfad/u, environment);

  const serviceFile = path.join(libpqDirectory, "pg_service.conf");
  const safeServiceConfiguration = readFileSync(serviceFile, "utf8");
  writeFileSync(serviceFile, `${safeServiceConfiguration}sslpassword=${syntheticSecret}\n`, { mode: 0o600 });
  expectFailure(wrapper, exportArguments(path.join(exportParent, "password-in-service")), /pg_service\.conf/u, environment);
  writeFileSync(serviceFile, safeServiceConfiguration, { mode: 0o600 });
  chmodSync(serviceFile, 0o600);

  writeFileSync(
    serviceFile,
    safeServiceConfiguration.replace(
      `host=/cloudsql/${connectionName}`,
      `host=/cloudsql/${connectionName}=unexpected-suffix`
    ),
    { mode: 0o600 }
  );
  expectFailure(
    wrapper,
    exportArguments(path.join(exportParent, "ambiguous-service-host")),
    /pg_service\.conf/u,
    environment
  );
  writeFileSync(serviceFile, safeServiceConfiguration, { mode: 0o600 });
  chmodSync(serviceFile, 0o600);

  const sourceTargetFile = path.join(libpqDirectory, "source-target.conf");
  const safeSourceTargetConfiguration = readFileSync(sourceTargetFile, "utf8");
  writeFileSync(sourceTargetFile,
    safeSourceTargetConfiguration.replace(projectId, "different-pre-gematik-project"),
    { mode: 0o600 });
  expectFailure(wrapper, exportArguments(path.join(exportParent, "wrong-gcp-project")), /Cloud-SQL-Verbindungsname|Aktives gcloud-Projekt/u, environment);
  writeFileSync(sourceTargetFile, safeSourceTargetConfiguration, { mode: 0o600 });
  chmodSync(sourceTargetFile, 0o600);

  const safeGlobalWriterAttestation = readFileSync(globalWriterAttestation, "utf8");
  writeFileSync(
    globalWriterAttestation,
    safeGlobalWriterAttestation.replace("EXTERNAL_DB_WRITERS=none", "EXTERNAL_DB_WRITERS=present"),
    { mode: 0o600 }
  );
  expectFailure(
    wrapper,
    exportArguments(path.join(exportParent, "external-writer-not-frozen")),
    /Globaler Writer-Nachweis/u,
    environment
  );
  writeFileSync(globalWriterAttestation, safeGlobalWriterAttestation, { mode: 0o600 });
  chmodSync(globalWriterAttestation, 0o600);

  expectFailure(wrapper, exportArguments(path.join(exportParent, "invalid-revision"), "not-a-revision"), /SOURCE_DEPLOYED_REVISION/u, environment);
  writeFileSync(path.join(repository, "UNTRACKED"), "dirty\n");
  expectFailure(wrapper, exportArguments(path.join(exportParent, "dirty-repository")), /Repository.*vollstaendig sauber/u, environment);
  rmSync(path.join(repository, "UNTRACKED"));

  console.log("Migration export wrapper test OK: canonical paths, new target, clean revision binding and secret isolation are enforced.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
