#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const RESOURCE_NAME_PATTERN = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const BACKUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_PIN_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const READ_ONLY_GCLOUD_PREFIXES = Object.freeze([
  Object.freeze(["projects", "describe"]),
  Object.freeze(["container", "clusters", "describe"]),
  Object.freeze(["asset", "search-all-resources"]),
  Object.freeze(["sql", "instances", "describe"]),
  Object.freeze(["sql", "backups", "describe"])
]);

const FORBIDDEN_GCLOUD_ARGUMENTS = new Set([
  "add-iam-policy-binding",
  "create",
  "delete",
  "get-credentials",
  "import",
  "patch",
  "remove-iam-policy-binding",
  "restore",
  "update"
]);

const REQUIRED_ENVIRONMENT = Object.freeze([
  "GCP_PROJECT_ID",
  "GCP_REGION",
  "GKE_CLUSTER_NAME",
  "GKE_LOCATION",
  "K8S_NAMESPACE",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME",
  "PRE_GEMATIK_GCP_PROJECT_SHA256",
  "PRE_IMPORT_BACKUP_ID"
]);

export class MigrationGcpGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MigrationGcpGateError";
    this.code = code;
  }
}

function gateError(code, message) {
  return new MigrationGcpGateError(code, message);
}

function assertNonEmptyString(value, code, message) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw gateError(code, message);
  }
}

function assertResourceName(value, code, message) {
  assertNonEmptyString(value, code, message);
  if (!RESOURCE_NAME_PATTERN.test(value)) {
    throw gateError(code, message);
  }
}

function parseIsoInstant(value, code, message) {
  assertNonEmptyString(value, code, message);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) {
    throw gateError(code, message);
  }
  return milliseconds;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function projectIdPin(projectId) {
  assertNonEmptyString(projectId, "CONFIG_INVALID", "Der GCP-Kontext ist unvollstaendig.");
  return `sha256:${sha256(projectId)}`;
}

function pinsEqual(left, right) {
  if (!SHA256_PIN_PATTERN.test(left) || !SHA256_PIN_PATTERN.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function parseConnectionName(connectionName) {
  assertNonEmptyString(
    connectionName,
    "CONNECTION_NAME_INVALID",
    "Der Cloud-SQL-Verbindungskontext ist ungueltig."
  );
  const parts = connectionName.split(":");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw gateError("CONNECTION_NAME_INVALID", "Der Cloud-SQL-Verbindungskontext ist ungueltig.");
  }
  const [projectId, region, instanceName] = parts;
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw gateError("CONNECTION_NAME_INVALID", "Der Cloud-SQL-Verbindungskontext ist ungueltig.");
  }
  assertResourceName(region, "CONNECTION_NAME_INVALID", "Der Cloud-SQL-Verbindungskontext ist ungueltig.");
  assertResourceName(instanceName, "CONNECTION_NAME_INVALID", "Der Cloud-SQL-Verbindungskontext ist ungueltig.");
  return Object.freeze({ projectId, region, instanceName });
}

export function loadGateConfiguration(environment = process.env) {
  for (const key of REQUIRED_ENVIRONMENT) {
    if (typeof environment[key] !== "string" || environment[key].length === 0 || environment[key] !== environment[key].trim()) {
      throw gateError("CONFIG_MISSING", "Der geschuetzte Migrationskontext ist unvollstaendig.");
    }
  }

  const projectId = environment.GCP_PROJECT_ID;
  const region = environment.GCP_REGION;
  const clusterName = environment.GKE_CLUSTER_NAME;
  const clusterLocation = environment.GKE_LOCATION;
  const namespace = environment.K8S_NAMESPACE;
  const connectionName = environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME;
  const projectPin = environment.PRE_GEMATIK_GCP_PROJECT_SHA256;
  const backupId = environment.PRE_IMPORT_BACKUP_ID;
  const backupNotBefore = environment.PRE_IMPORT_BACKUP_NOT_BEFORE || "";

  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw gateError("CONFIG_INVALID", "Der GCP-Kontext ist ungueltig.");
  }
  assertResourceName(region, "CONFIG_INVALID", "Der GCP-Kontext ist ungueltig.");
  assertResourceName(clusterName, "CONFIG_INVALID", "Der GKE-Kontext ist ungueltig.");
  assertResourceName(clusterLocation, "CONFIG_INVALID", "Der GKE-Kontext ist ungueltig.");
  assertResourceName(namespace, "CONFIG_INVALID", "Der Namespace-Kontext ist ungueltig.");
  if (!SHA256_PIN_PATTERN.test(projectPin)) {
    throw gateError("PROJECT_PIN_INVALID", "Der geschuetzte Projekt-Pin ist ungueltig.");
  }
  if (!BACKUP_ID_PATTERN.test(backupId)) {
    throw gateError("BACKUP_ID_INVALID", "Die konkrete Backup-Referenz ist ungueltig.");
  }
  if (backupNotBefore) {
    parseIsoInstant(backupNotBefore, "BACKUP_TIME_BOUND_INVALID", "Die Backup-Zeitgrenze ist ungueltig.");
  }

  const connection = parseConnectionName(connectionName);
  if (
    clusterLocation !== region
    || connection.projectId !== projectId
    || connection.region !== region
  ) {
    throw gateError("CONTEXT_TUPLE_MISMATCH", "Die geschuetzten GCP-Kontextwerte stimmen nicht ueberein.");
  }

  return Object.freeze({
    projectId,
    projectPin,
    region,
    clusterName,
    clusterLocation,
    namespace,
    connectionName,
    instanceName: connection.instanceName,
    backupId,
    backupNotBefore
  });
}

function normalizeGateConfiguration(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "projectId" in value) {
    return loadGateConfiguration({
      GCP_PROJECT_ID: value.projectId,
      GCP_REGION: value.region,
      GKE_CLUSTER_NAME: value.clusterName,
      GKE_LOCATION: value.clusterLocation,
      K8S_NAMESPACE: value.namespace,
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: value.connectionName,
      PRE_GEMATIK_GCP_PROJECT_SHA256: value.projectPin,
      PRE_IMPORT_BACKUP_ID: value.backupId,
      PRE_IMPORT_BACKUP_NOT_BEFORE: value.backupNotBefore || ""
    });
  }
  return loadGateConfiguration(value);
}

export function isReadOnlyGcloudInvocation(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.some((argument) => typeof argument !== "string")) return false;
  if (!argumentsList.includes("--format=json")) return false;
  if (argumentsList.some((argument) => FORBIDDEN_GCLOUD_ARGUMENTS.has(argument))) return false;
  return READ_ONLY_GCLOUD_PREFIXES.some((prefix) => prefix.every((part, index) => argumentsList[index] === part));
}

export function createGcloudJsonRunner({ execFile = execFileSync } = {}) {
  return async function runGcloudJson(argumentsList) {
    if (!isReadOnlyGcloudInvocation(argumentsList)) {
      throw gateError("GCLOUD_COMMAND_REJECTED", "Ein nicht freigegebener gcloud-Aufruf wurde blockiert.");
    }

    let stdout;
    try {
      stdout = execFile("gcloud", argumentsList, {
        encoding: "utf8",
        env: {
          ...process.env,
          CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
          CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK: "1"
        },
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000
      });
    } catch {
      throw gateError("GCLOUD_READ_FAILED", "Eine erforderliche lesende GCP-Pruefung ist fehlgeschlagen.");
    }

    try {
      return JSON.parse(stdout);
    } catch {
      throw gateError("GCLOUD_JSON_INVALID", "Eine lesende GCP-Pruefung lieferte kein gueltiges JSON.");
    }
  };
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw gateError(code, message);
  }
}

function verifyProject(project, config) {
  assertPlainObject(project, "PROJECT_STATE_INVALID", "Der GCP-Projektstatus konnte nicht bestaetigt werden.");
  if (project.projectId !== config.projectId || project.lifecycleState !== "ACTIVE") {
    throw gateError("PROJECT_STATE_INVALID", "Der GCP-Projektstatus konnte nicht bestaetigt werden.");
  }
}

function verifyCluster(cluster, config) {
  assertPlainObject(cluster, "CLUSTER_CONTEXT_INVALID", "Der GKE-Clusterkontext konnte nicht bestaetigt werden.");
  if (
    cluster.name !== config.clusterName
    || cluster.location !== config.clusterLocation
    || cluster.status !== "RUNNING"
  ) {
    throw gateError("CLUSTER_CONTEXT_INVALID", "Der GKE-Clusterkontext konnte nicht bestaetigt werden.");
  }
}

function verifyNamespaceAssets(assets, config) {
  if (!Array.isArray(assets)) {
    throw gateError("NAMESPACE_CONTEXT_INVALID", "Der Namespace-Kontext konnte nicht bestaetigt werden.");
  }
  const clusterResourceName = `//container.googleapis.com/projects/${config.projectId}/locations/${config.clusterLocation}/clusters/${config.clusterName}`;
  const namespaceResourceName = `${clusterResourceName}/k8s/namespaces/${config.namespace}`;
  const matchingAssets = assets.filter((asset) => (
    asset
    && typeof asset === "object"
    && !Array.isArray(asset)
    && asset.assetType === "k8s.io/Namespace"
    && asset.displayName === config.namespace
    && asset.location === config.clusterLocation
    && asset.parentFullResourceName === clusterResourceName
    && asset.name === namespaceResourceName
  ));
  if (matchingAssets.length !== 1) {
    throw gateError("NAMESPACE_CONTEXT_INVALID", "Der Namespace-Kontext konnte nicht bestaetigt werden.");
  }
}

function verifyInstance(instance, config) {
  assertPlainObject(instance, "SQL_INSTANCE_INVALID", "Die Cloud-SQL-Instanz konnte nicht bestaetigt werden.");
  const ipAddresses = Array.isArray(instance.ipAddresses) ? instance.ipAddresses : [];
  const privateServerAddresses = [...new Set(ipAddresses
    .filter((address) => (
      address
      && address.type === "PRIVATE"
      && typeof address.ipAddress === "string"
      && isIP(address.ipAddress) !== 0
    ))
    .map((address) => address.ipAddress))]
    .sort();
  const hasPublicPrimaryIp = ipAddresses.some((address) => address?.type === "PRIMARY");
  const ipConfiguration = instance.settings?.ipConfiguration;

  if (
    instance.name !== config.instanceName
    || instance.project !== config.projectId
    || instance.region !== config.region
    || instance.connectionName !== config.connectionName
    || instance.state !== "RUNNABLE"
    || instance.databaseVersion !== "POSTGRES_16"
    || privateServerAddresses.length < 1
    || hasPublicPrimaryIp
    || ipConfiguration?.ipv4Enabled !== false
    || typeof ipConfiguration.privateNetwork !== "string"
    || ipConfiguration.privateNetwork.length === 0
  ) {
    throw gateError("SQL_INSTANCE_INVALID", "Die Cloud-SQL-Instanz konnte nicht bestaetigt werden.");
  }
  return Object.freeze(privateServerAddresses);
}

function normalizedBackupId(value) {
  if (typeof value === "string" && BACKUP_ID_PATTERN.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return "";
}

function backupSelfLinkMatches(selfLink, config) {
  if (typeof selfLink !== "string") return false;
  let url;
  try {
    url = new URL(selfLink);
  } catch {
    return false;
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "sqladmin.googleapis.com"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) return false;

  let segments;
  try {
    segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return false;
  }
  const projectsIndex = segments.indexOf("projects");
  const instancesIndex = segments.indexOf("instances");
  const backupsIndex = segments.indexOf("backupRuns");
  return (
    projectsIndex >= 0
    && instancesIndex === projectsIndex + 2
    && backupsIndex === instancesIndex + 2
    && segments[projectsIndex + 1] === config.projectId
    && segments[instancesIndex + 1] === config.instanceName
    && segments[backupsIndex + 1] === config.backupId
    && backupsIndex + 2 === segments.length
  );
}

function verifyBackup(backup, config, nowMilliseconds) {
  assertPlainObject(backup, "BACKUP_INVALID", "Das konkrete Cloud-SQL-Backup konnte nicht bestaetigt werden.");
  const backupEnd = parseIsoInstant(
    backup.endTime,
    "BACKUP_INVALID",
    "Das konkrete Cloud-SQL-Backup konnte nicht bestaetigt werden."
  );
  const lowerBound = config.backupNotBefore
    ? parseIsoInstant(
      config.backupNotBefore,
      "BACKUP_TIME_BOUND_INVALID",
      "Die Backup-Zeitgrenze ist ungueltig."
    )
    : null;

  if (
    normalizedBackupId(backup.id) !== config.backupId
    || backup.instance !== config.instanceName
    || backup.location !== config.region
    || backup.status !== "SUCCESSFUL"
    || !backupSelfLinkMatches(backup.selfLink, config)
    || backupEnd > nowMilliseconds + MAX_CLOCK_SKEW_MS
    || (lowerBound !== null && backupEnd < lowerBound)
  ) {
    throw gateError("BACKUP_INVALID", "Das konkrete Cloud-SQL-Backup konnte nicht bestaetigt werden.");
  }
  return backup.endTime;
}

function canonicalFingerprint(config, backupEndTime, privateServerAddresses) {
  const canonical = JSON.stringify({
    version: 1,
    projectPin: config.projectPin,
    cluster: [config.clusterName, config.clusterLocation, config.namespace],
    cloudSql: [
      config.connectionName,
      "RUNNABLE",
      "POSTGRES_16",
      "PRIVATE",
      privateServerAddresses
    ],
    backup: [config.backupId, "SUCCESSFUL", backupEndTime],
    backupNotBefore: config.backupNotBefore || null
  });
  return `sha256:${sha256(canonical)}`;
}

export async function checkPreGematikMigrationGcp(
  rawConfiguration,
  { runGcloud = createGcloudJsonRunner(), now = () => new Date() } = {}
) {
  const config = normalizeGateConfiguration(rawConfiguration);

  if (!pinsEqual(projectIdPin(config.projectId), config.projectPin)) {
    throw gateError("PROJECT_PIN_MISMATCH", "Der GCP-Projektkontext stimmt nicht mit dem geschuetzten Pin ueberein.");
  }

  const nowValue = now();
  const nowMilliseconds = nowValue instanceof Date ? nowValue.getTime() : Number.NaN;
  if (!Number.isFinite(nowMilliseconds)) {
    throw gateError("CLOCK_INVALID", "Die lokale Zeitbasis ist ungueltig.");
  }

  const projectArguments = [
    "projects", "describe", config.projectId,
    "--format=json"
  ];
  const clusterArguments = [
    "container", "clusters", "describe", config.clusterName,
    `--project=${config.projectId}`,
    `--region=${config.clusterLocation}`,
    "--format=json"
  ];
  const namespaceArguments = [
    "asset", "search-all-resources",
    `--scope=projects/${config.projectId}`,
    "--asset-types=k8s.io/Namespace",
    `--query=displayName=${config.namespace}`,
    "--format=json"
  ];
  const instanceArguments = [
    "sql", "instances", "describe", config.instanceName,
    `--project=${config.projectId}`,
    "--format=json"
  ];
  const backupArguments = [
    "sql", "backups", "describe", config.backupId,
    `--instance=${config.instanceName}`,
    `--project=${config.projectId}`,
    "--format=json"
  ];

  const [project, cluster, namespaceAssets, instance, backup] = await Promise.all([
    runGcloud(projectArguments),
    runGcloud(clusterArguments),
    runGcloud(namespaceArguments),
    runGcloud(instanceArguments),
    runGcloud(backupArguments)
  ]);

  verifyProject(project, config);
  verifyCluster(cluster, config);
  verifyNamespaceAssets(namespaceAssets, config);
  const privateServerAddresses = verifyInstance(instance, config);
  const backupEndTime = verifyBackup(backup, config, nowMilliseconds);

  return Object.freeze({
    ok: true,
    fingerprint: canonicalFingerprint(config, backupEndTime, privateServerAddresses),
    targetDatabase: Object.freeze({
      connectionName: config.connectionName
    })
  });
}

function usage() {
  return [
    "Read-only Pre-Gematik GCP migration gate.",
    "",
    "Konfiguration ausschliesslich ueber Umgebungsvariablen:",
    ...REQUIRED_ENVIRONMENT.map((name) => `  ${name}`),
    "  PRE_IMPORT_BACKUP_NOT_BEFORE  (optional, ISO-8601)",
    "",
    "PRE_GEMATIK_GCP_PROJECT_SHA256 muss aus einem geschuetzten Secret stammen.",
    "Erzeugen Sie den Pin nicht innerhalb dieses Skripts oder im Repository.",
    "Der Checker fuehrt ausschliesslich lesende gcloud-Aufrufe mit JSON-Ausgabe aus."
  ].join("\n");
}

export async function runCli({
  argv = process.argv.slice(2),
  environment = process.env,
  runGcloud = createGcloudJsonRunner(),
  now,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    stdout.write(`${usage()}\n`);
    return 0;
  }
  if (argv.length !== 0) {
    stderr.write("GATE FAIL [ARGUMENTS_REJECTED]\n");
    return 2;
  }

  try {
    const config = loadGateConfiguration(environment);
    const result = await checkPreGematikMigrationGcp(config, { runGcloud, ...(now ? { now } : {}) });
    assert.equal(result.ok, true);
    stdout.write(`GATE PASS ${result.fingerprint}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof MigrationGcpGateError ? error.code : "UNEXPECTED_FAILURE";
    stderr.write(`GATE FAIL [${code}]\n`);
    return 1;
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  process.exitCode = await runCli();
}
