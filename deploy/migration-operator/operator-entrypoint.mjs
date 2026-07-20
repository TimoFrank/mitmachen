#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  constants as fsConstants,
  createWriteStream
} from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat
} from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE = "/workspace";
const SECRET_INPUT = "/secret-input";
const PROTECTED_INPUT = "/protected-input/run";
const PROTECTED_OUTPUT = "/protected-output/run";
const PROXY_EXECUTABLE = "/usr/local/bin/cloud-sql-proxy";
const SYNTHETIC_SEED_ID = "pre-gematik-synthetic-v1";
const STORAGE_OPERATION = "MIGRATE_ALLOWLISTED_SUPABASE_STORAGE_TO_GCS";
const LOGO_REMEDIATION_MANIFEST_FILE = "logo-remediation-preview.json";
const LOGO_REMEDIATION_MANIFEST_PATH = `${PROTECTED_INPUT}/${LOGO_REMEDIATION_MANIFEST_FILE}`;
const LOGO_REMEDIATION_OBJECT_DIRECTORY = `${PROTECTED_INPUT}/logo-remediation-objects`;
const LOGO_REMEDIATION_SCHEMA = "versorgungs-kompass-logo-remediation-v1";
const MAX_LOGO_REMEDIATION_OBJECTS = 128;
const IDENTITY_OPERATION = "UPSERT_IAP_IDENTITY_BINDINGS";
const TARGET_DATABASE_NAME = "versorgungs_kompass";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const NON_NEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const BACKUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,255}$/u;
const PROTECTED_INPUT_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/u;
const LOGO_REMEDIATION_OUTPUT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.png$/u;

export class MigrationOperatorError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationOperatorError";
  }
}

function required(environment, name, pattern) {
  const value = environment[name];
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new MigrationOperatorError(`Required protected operator value ${name} is missing or malformed.`);
  }
  return value;
}

function logoRemediationExecution(environment) {
  const manifestPath = environment.LOGO_REMEDIATION_MANIFEST_PATH || "";
  const objectDirectory = environment.LOGO_REMEDIATION_OBJECT_DIRECTORY || "";
  if (Boolean(manifestPath) !== Boolean(objectDirectory)) {
    throw new MigrationOperatorError(
      "Logo remediation requires both protected operator paths."
    );
  }
  if (!manifestPath) {
    return Object.freeze({
      enabled: false,
      arguments: Object.freeze([]),
      protectedInputs: Object.freeze([])
    });
  }
  if (
    manifestPath !== LOGO_REMEDIATION_MANIFEST_PATH
    || objectDirectory !== LOGO_REMEDIATION_OBJECT_DIRECTORY
  ) {
    throw new MigrationOperatorError(
      "Logo remediation paths must use the fixed owner-only operator locations."
    );
  }
  return Object.freeze({
    enabled: true,
    arguments: Object.freeze([
      "--logo-remediation-manifest", LOGO_REMEDIATION_MANIFEST_PATH,
      "--logo-remediation-object-directory", LOGO_REMEDIATION_OBJECT_DIRECTORY
    ]),
    protectedInputs: Object.freeze([LOGO_REMEDIATION_MANIFEST_FILE])
  });
}

export function phaseExecution(phase, environment = process.env) {
  if (phase === "storage-preview") {
    const logoRemediation = logoRemediationExecution(environment);
    return Object.freeze({
      script: "scripts/migrate_supabase_storage_to_gcs.mjs",
      arguments: Object.freeze([
        "--manifest-output", `${PROTECTED_OUTPUT}/storage-preview.json`,
        ...logoRemediation.arguments
      ]),
      protectedInputs: logoRemediation.protectedInputs,
      logoRemediationBundle: logoRemediation.enabled,
      managedTarget: false
    });
  }

  if (phase === "storage-apply") {
    const logoRemediation = logoRemediationExecution(environment);
    const sourceProject = required(environment, "EXPECTED_SOURCE_PROJECT_ID", /^[a-z0-9][a-z0-9-]{2,62}$/u);
    const targetProject = required(environment, "EXPECTED_TARGET_PROJECT_ID", /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u);
    const backupId = required(environment, "PRE_IMPORT_BACKUP_ID", BACKUP_ID_PATTERN);
    const previewFingerprint = required(environment, "CONFIRM_STORAGE_PREVIEW_FINGERPRINT", SHA256_PATTERN);
    const quarantineCount = required(environment, "CONFIRM_QUARANTINED_OBJECT_COUNT", NON_NEGATIVE_INTEGER_PATTERN);
    return Object.freeze({
      script: "scripts/migrate_supabase_storage_to_gcs.mjs",
      arguments: Object.freeze([
        "--apply",
        "--confirm-source-project", sourceProject,
        "--confirm-target-project", targetProject,
        "--pre-import-backup-id", backupId,
        "--confirm-preview-fingerprint", previewFingerprint,
        "--confirm-quarantined-object-count", quarantineCount,
        "--manifest-output", `${PROTECTED_OUTPUT}/storage-apply.json`,
        "--recovery-journal", `${PROTECTED_OUTPUT}/storage-apply.ndjson`,
        "--confirm-operation", STORAGE_OPERATION,
        ...logoRemediation.arguments
      ]),
      protectedInputs: logoRemediation.protectedInputs,
      logoRemediationBundle: logoRemediation.enabled,
      managedTarget: false
    });
  }

  if (phase === "database-preview") {
    return Object.freeze({
      script: "scripts/migrate_supabase_to_pre_gematik.mjs",
      arguments: Object.freeze([]),
      protectedInputs: Object.freeze(["supabase-root-ca.crt"]),
      logoRemediationBundle: false,
      managedTarget: true,
      requiresSourceCa: true
    });
  }

  if (phase === "database-apply") {
    const backupId = required(environment, "PRE_IMPORT_BACKUP_ID", BACKUP_ID_PATTERN);
    const manifestFingerprint = required(environment, "CONFIRM_STORAGE_MANIFEST_FINGERPRINT", SHA256_PATTERN);
    const sourceFingerprint = required(environment, "CONFIRM_SOURCE_SNAPSHOT_FINGERPRINT", SHA256_PATTERN);
    const quarantineCount = required(environment, "CONFIRM_QUARANTINED_OBJECT_COUNT", NON_NEGATIVE_INTEGER_PATTERN);
    const argumentsList = [
      "--apply",
      "--replace-synthetic-target",
      "--confirm-replacement", SYNTHETIC_SEED_ID,
      "--pre-import-backup-id", backupId,
      "--storage-manifest", `${PROTECTED_INPUT}/storage-apply.json`,
      "--confirm-storage-manifest-fingerprint", manifestFingerprint,
      "--confirm-source-snapshot-fingerprint", sourceFingerprint,
      "--confirm-quarantined-object-count", quarantineCount
    ];
    const bootstrapFingerprint = environment.CONFIRM_BOOTSTRAP_PROFILE_FINGERPRINT;
    if (bootstrapFingerprint !== undefined && bootstrapFingerprint !== "") {
      if (!SHA256_PATTERN.test(bootstrapFingerprint)) {
        throw new MigrationOperatorError(
          "Required protected operator value CONFIRM_BOOTSTRAP_PROFILE_FINGERPRINT is malformed."
        );
      }
      argumentsList.push("--confirm-bootstrap-profile-fingerprint", bootstrapFingerprint);
    }
    return Object.freeze({
      script: "scripts/migrate_supabase_to_pre_gematik.mjs",
      arguments: Object.freeze(argumentsList),
      protectedInputs: Object.freeze(["supabase-root-ca.crt", "storage-apply.json"]),
      logoRemediationBundle: false,
      managedTarget: true,
      requiresSourceCa: true
    });
  }

  if (phase === "identity-preview") {
    return Object.freeze({
      script: "scripts/provision_iap_identity_bindings.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/iap-bindings.json`
      ]),
      protectedInputs: Object.freeze(["iap-bindings.json"]),
      logoRemediationBundle: false,
      managedTarget: true,
      requiresSourceCa: false
    });
  }

  if (phase === "identity-apply") {
    const previewFingerprint = required(
      environment,
      "CONFIRM_IDENTITY_PREVIEW_FINGERPRINT",
      SHA256_PATTERN
    );
    return Object.freeze({
      script: "scripts/provision_iap_identity_bindings.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/iap-bindings.json`,
        "--apply",
        "--confirm-environment", "pre-gematik",
        "--confirm-database", TARGET_DATABASE_NAME,
        "--confirm-operation", IDENTITY_OPERATION,
        "--confirm-fingerprint", previewFingerprint,
        "--allow-active-bindings"
      ]),
      protectedInputs: Object.freeze(["iap-bindings.json"]),
      logoRemediationBundle: false,
      managedTarget: true,
      requiresSourceCa: false
    });
  }

  throw new MigrationOperatorError("MIGRATION_OPERATOR_PHASE is not an allowed one-time operation.");
}

async function createOwnerOnlyDirectory(path) {
  await mkdir(path, { mode: 0o700 });
  await chmod(path, 0o700);
  const metadata = await lstat(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== currentUid
    || (metadata.mode & 0o777) !== 0o700
  ) {
    throw new MigrationOperatorError("A protected operator directory is not owner-only.");
  }
  return realpath(path);
}

function isPathInside(candidate, parent) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === ""
    || (pathFromParent !== ".."
      && !pathFromParent.startsWith(`..${sep}`)
      && !isAbsolute(pathFromParent));
}

export async function resolveProjectedInput(source, inputRoot = SECRET_INPUT) {
  const root = await realpath(inputRoot);
  const linkMetadata = await lstat(source);
  if (!linkMetadata.isFile() && !linkMetadata.isSymbolicLink()) {
    throw new MigrationOperatorError("A required projected operator input is not a file projection.");
  }
  const resolved = await realpath(source);
  if (!isPathInside(resolved, root)) {
    throw new MigrationOperatorError("A projected operator input escapes its read-only Secret mount.");
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > 2 * 1024 * 1024) {
    throw new MigrationOperatorError("A required projected operator input is not a bounded regular file.");
  }
  return resolved;
}

async function copyProtectedInput(
  fileName,
  inputRoot = SECRET_INPUT,
  destinationRoot = PROTECTED_INPUT
) {
  if (!PROTECTED_INPUT_FILE_PATTERN.test(fileName)) {
    throw new MigrationOperatorError("A protected operator input has an unsafe file name.");
  }
  const source = `${inputRoot}/${fileName}`;
  const destination = `${destinationRoot}/${fileName}`;
  // Kubernetes Secret volumes expose each key as a symlink through ..data.
  // Resolve that projection once, prove that its immutable target remains
  // inside the read-only mount, and copy the resolved regular file.
  const resolvedSource = await resolveProjectedInput(source, inputRoot);
  await copyFile(resolvedSource, destination, fsConstants.COPYFILE_EXCL);
  await chmod(destination, 0o600);
  const destinationMetadata = await lstat(destination);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : destinationMetadata.uid;
  if (
    !destinationMetadata.isFile()
    || destinationMetadata.isSymbolicLink()
    || destinationMetadata.uid !== currentUid
    || (destinationMetadata.mode & 0o777) !== 0o600
  ) {
    throw new MigrationOperatorError("A copied operator input is not owner-only.");
  }
}

export function logoRemediationOutputFiles(manifestBytes) {
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"));
  } catch {
    throw new MigrationOperatorError("The protected logo remediation manifest is not valid JSON.");
  }
  if (
    manifest === null
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || manifest.schemaVersion !== LOGO_REMEDIATION_SCHEMA
    || !SHA256_PATTERN.test(manifest.remediationFingerprint || "")
    || !Number.isSafeInteger(manifest.remediatedObjectCount)
    || manifest.remediatedObjectCount < 1
    || manifest.remediatedObjectCount > MAX_LOGO_REMEDIATION_OBJECTS
    || !Array.isArray(manifest.entries)
    || manifest.entries.length !== manifest.remediatedObjectCount
  ) {
    throw new MigrationOperatorError("The protected logo remediation manifest is malformed.");
  }
  const outputFiles = manifest.entries.map((entry) => entry?.outputFile);
  if (
    outputFiles.some((fileName) => (
      typeof fileName !== "string" || !LOGO_REMEDIATION_OUTPUT_PATTERN.test(fileName)
    ))
    || new Set(outputFiles).size !== outputFiles.length
  ) {
    throw new MigrationOperatorError("The protected logo remediation output list is unsafe.");
  }
  return Object.freeze([...outputFiles].sort((left, right) => left.localeCompare(right)));
}

export async function stageLogoRemediationObjects({
  inputRoot = SECRET_INPUT,
  protectedRoot = PROTECTED_INPUT
} = {}) {
  const manifestPath = `${protectedRoot}/${LOGO_REMEDIATION_MANIFEST_FILE}`;
  const manifestMetadata = await lstat(manifestPath);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : manifestMetadata.uid;
  if (
    !manifestMetadata.isFile()
    || manifestMetadata.isSymbolicLink()
    || manifestMetadata.uid !== currentUid
    || (manifestMetadata.mode & 0o777) !== 0o600
    || manifestMetadata.size < 1
    || manifestMetadata.size > 1024 * 1024
  ) {
    throw new MigrationOperatorError("The staged logo remediation manifest is not owner-only.");
  }
  const outputFiles = logoRemediationOutputFiles(await readFile(manifestPath));
  const objectDirectory = `${protectedRoot}/logo-remediation-objects`;
  await createOwnerOnlyDirectory(objectDirectory);
  for (const fileName of outputFiles) {
    await copyProtectedInput(fileName, inputRoot, objectDirectory);
  }
  return Object.freeze({
    manifestPath,
    objectDirectory,
    outputFiles
  });
}

function sourceUrlWithProtectedCa(environment) {
  let parsed;
  try {
    parsed = new URL(environment.SOURCE_DATABASE_URL);
  } catch {
    throw new MigrationOperatorError("SOURCE_DATABASE_URL is missing or malformed.");
  }
  if (parsed.searchParams.getAll("sslrootcert").length !== 1) {
    throw new MigrationOperatorError("SOURCE_DATABASE_URL requires one protected CA path.");
  }
  parsed.searchParams.set("sslrootcert", `${PROTECTED_INPUT}/supabase-root-ca.crt`);
  return parsed.toString();
}

async function writeStatus(status) {
  const path = `${PROTECTED_OUTPUT}/status.json`;
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(status, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function runChild(execution, environment) {
  const logPath = `${PROTECTED_OUTPUT}/${environment.MIGRATION_OPERATOR_PHASE}.log`;
  const log = createWriteStream(logPath, { flags: "wx", mode: 0o600 });
  await new Promise((resolve, reject) => {
    log.once("open", resolve);
    log.once("error", reject);
  });

  const child = spawn(
    process.execPath,
    [`${WORKSPACE}/${execution.script}`, ...execution.arguments],
    {
      cwd: WORKSPACE,
      env: environment,
      stdio: ["ignore", log, log],
      windowsHide: true
    }
  );
  const stopChild = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.once("SIGTERM", stopChild);
  process.once("SIGINT", stopChild);
  const outcome = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    process.removeListener("SIGTERM", stopChild);
    process.removeListener("SIGINT", stopChild);
  });
  await new Promise((resolve, reject) => log.end((error) => error ? reject(error) : resolve()));
  return outcome;
}

export async function main(environment = process.env) {
  process.umask(0o077);
  const phase = environment.MIGRATION_OPERATOR_PHASE;
  const execution = phaseExecution(phase, environment);
  await createOwnerOnlyDirectory(PROTECTED_INPUT);
  await createOwnerOnlyDirectory(PROTECTED_OUTPUT);
  await mkdir(environment.HOME || "/tmp/home", { recursive: true, mode: 0o700 });
  await mkdir(environment.CLOUDSDK_CONFIG || "/tmp/gcloud", { recursive: true, mode: 0o700 });

  for (const fileName of execution.protectedInputs) await copyProtectedInput(fileName);
  if (execution.logoRemediationBundle) await stageLogoRemediationObjects();

  const childEnvironment = {
    ...environment,
    CLOUD_SQL_AUTH_PROXY_EXECUTABLE: PROXY_EXECUTABLE
  };
  if (execution.logoRemediationBundle) {
    childEnvironment.LOGO_REMEDIATION_MANIFEST_PATH = LOGO_REMEDIATION_MANIFEST_PATH;
    childEnvironment.LOGO_REMEDIATION_OBJECT_DIRECTORY = LOGO_REMEDIATION_OBJECT_DIRECTORY;
  }
  if (execution.managedTarget) {
    if (environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE !== "private-ip") {
      throw new MigrationOperatorError("Database phases require the explicit private-ip proxy mode.");
    }
    required(environment, "CLOUD_SQL_AUTH_PROXY_SHA256", SHA256_PATTERN);
    await access(PROXY_EXECUTABLE, fsConstants.X_OK);
    if (execution.requiresSourceCa) {
      childEnvironment.SOURCE_DATABASE_URL = sourceUrlWithProtectedCa(environment);
    }
    if (phase === "identity-preview" || phase === "identity-apply") {
      childEnvironment.PRE_GEMATIK_IDENTITY_REPOSITORY_ROOT = WORKSPACE;
    }
    if (phase === "database-apply") {
      childEnvironment.STORAGE_MIGRATION_MANIFEST_PATH = `${PROTECTED_INPUT}/storage-apply.json`;
    }
  }

  const startedAt = new Date().toISOString();
  const outcome = await runChild(execution, childEnvironment);
  const succeeded = outcome.code === 0 && outcome.signal === null;
  await writeStatus({
    schemaVersion: 1,
    phase,
    succeeded,
    exitCode: outcome.code,
    signal: outcome.signal,
    startedAt,
    finishedAt: new Date().toISOString()
  });
  if (!succeeded) {
    throw new MigrationOperatorError("The protected migration phase failed; retrieve its owner-only report.");
  }
  process.stdout.write(`Migration operator phase ${phase} completed; retrieve protected outputs before cleanup.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof MigrationOperatorError
      ? error.message
      : "The migration operator failed safely.";
    process.stderr.write(`MigrationOperatorError: ${message}\n`);
    process.exitCode = 1;
  });
}
