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
  realpath,
  stat
} from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const WORKSPACE = "/workspace";
const SECRET_INPUT = "/secret-input";
const PROTECTED_INPUT = "/protected-input/run";
const PROTECTED_OUTPUT = "/protected-output/run";
const EVIDENCE_ACKNOWLEDGEMENT = `${PROTECTED_OUTPUT}/.evidence-collected`;
const EVIDENCE_ACKNOWLEDGEMENT_TIMEOUT_MS = 15 * 60 * 1000;
const PROXY_EXECUTABLE = "/usr/local/bin/cloud-sql-proxy";
const IDENTITY_OPERATION = "UPSERT_IAP_IDENTITY_BINDINGS";
const GUEST_ACCESS_OPERATION = "PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST";
const GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION =
  "RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST";
const GUEST_ACCESS_RECONCILE_MODE_ENV =
  "GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND";
const TARGET_DATABASE_NAME = "versorgungs_kompass";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const NON_NEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u;
const PROTECTED_INPUT_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/u;

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

function identitySubjectRemapArguments(environment, { apply = false } = {}) {
  const mode = environment.ALLOW_IDENTITY_SUBJECT_REMAPS;
  if (mode === undefined || mode === "" || mode === "false") return Object.freeze([]);
  if (mode !== "true") {
    throw new MigrationOperatorError(
      "ALLOW_IDENTITY_SUBJECT_REMAPS must be exactly true or false."
    );
  }
  const argumentsList = ["--allow-subject-remaps"];
  if (apply) {
    argumentsList.push(
      "--confirm-subject-remap-count",
      required(
        environment,
        "CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT",
        NON_NEGATIVE_INTEGER_PATTERN
      )
    );
  }
  return Object.freeze(argumentsList);
}

function guestAccessMode(environment) {
  const mode = environment[GUEST_ACCESS_RECONCILE_MODE_ENV];
  if (mode !== "true" && mode !== "false") {
    throw new MigrationOperatorError(
      `${GUEST_ACCESS_RECONCILE_MODE_ENV} must be exactly true or false.`
    );
  }
  return Object.freeze({
    arguments: Object.freeze(
      mode === "true"
        ? ["--reconcile-profile-display-name-and-prebind"]
        : []
    ),
    operation: mode === "true"
      ? GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_OPERATION
      : GUEST_ACCESS_OPERATION
  });
}

function guestAccessTargetProject(environment) {
  const targetProject = required(
    environment,
    "EXPECTED_TARGET_PROJECT_ID",
    PROJECT_PATTERN
  );
  const gatedProject = required(
    environment,
    "GCP_PROJECT_ID",
    PROJECT_PATTERN
  );
  if (targetProject !== gatedProject) {
    throw new MigrationOperatorError(
      "Guest access requires EXPECTED_TARGET_PROJECT_ID and GCP_PROJECT_ID to match exactly."
    );
  }
  return targetProject;
}

export function phaseExecution(phase, environment = process.env) {
  if (phase === "identity-preview") {
    const remapArguments = identitySubjectRemapArguments(environment);
    return Object.freeze({
      script: "scripts/provision_iap_identity_bindings.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/iap-bindings.json`,
        ...remapArguments
      ]),
      protectedInputs: Object.freeze(["iap-bindings.json"]),
      managedTarget: true
    });
  }

  if (phase === "identity-apply") {
    const previewFingerprint = required(
      environment,
      "CONFIRM_IDENTITY_PREVIEW_FINGERPRINT",
      SHA256_PATTERN
    );
    const currentStateFingerprint = required(
      environment,
      "CONFIRM_IDENTITY_CURRENT_STATE_FINGERPRINT",
      SHA256_PATTERN
    );
    const bindingCount = required(
      environment,
      "CONFIRM_IDENTITY_BINDING_COUNT",
      POSITIVE_INTEGER_PATTERN
    );
    const activeBindingCount = required(
      environment,
      "CONFIRM_IDENTITY_ACTIVE_BINDING_COUNT",
      NON_NEGATIVE_INTEGER_PATTERN
    );
    const remapArguments = identitySubjectRemapArguments(environment, { apply: true });
    return Object.freeze({
      script: "scripts/provision_iap_identity_bindings.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/iap-bindings.json`,
        "--apply",
        "--confirm-environment", "pre-gematik",
        "--confirm-database", TARGET_DATABASE_NAME,
        "--confirm-operation", IDENTITY_OPERATION,
        "--confirm-fingerprint", previewFingerprint,
        "--confirm-current-state-fingerprint", currentStateFingerprint,
        "--confirm-binding-count", bindingCount,
        "--confirm-active-binding-count", activeBindingCount,
        "--allow-active-bindings",
        ...remapArguments
      ]),
      protectedInputs: Object.freeze(["iap-bindings.json"]),
      managedTarget: true
    });
  }

  if (phase === "guest-preview") {
    const targetProject = guestAccessTargetProject(environment);
    const mode = guestAccessMode(environment);
    return Object.freeze({
      script: "scripts/provision_pre_gematik_identity_platform_guest_access.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/guest-access.json`,
        ...mode.arguments
      ]),
      protectedInputs: Object.freeze(["guest-access.json"]),
      managedTarget: true,
      guestAccessTargetProject: targetProject
    });
  }

  if (phase === "guest-apply") {
    const targetProject = guestAccessTargetProject(environment);
    const inputFingerprint = required(
      environment,
      "CONFIRM_GUEST_ACCESS_INPUT_FINGERPRINT",
      SHA256_PATTERN
    );
    const currentStateFingerprint = required(
      environment,
      "CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT",
      SHA256_PATTERN
    );
    const mode = guestAccessMode(environment);
    const confirmedOperation = environment.CONFIRM_GUEST_ACCESS_OPERATION;
    if (confirmedOperation !== mode.operation) {
      throw new MigrationOperatorError(
        "CONFIRM_GUEST_ACCESS_OPERATION must exactly match the reviewed guest-preview operation."
      );
    }
    return Object.freeze({
      script: "scripts/provision_pre_gematik_identity_platform_guest_access.mjs",
      arguments: Object.freeze([
        "--input", `${PROTECTED_INPUT}/guest-access.json`,
        ...mode.arguments,
        "--apply",
        "--confirm-environment", "pre-gematik",
        "--confirm-project", targetProject,
        "--confirm-database", TARGET_DATABASE_NAME,
        "--confirm-operation", confirmedOperation,
        "--confirm-fingerprint", inputFingerprint,
        "--confirm-current-state-fingerprint", currentStateFingerprint
      ]),
      protectedInputs: Object.freeze(["guest-access.json"]),
      managedTarget: true,
      guestAccessTargetProject: targetProject
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

export async function waitForEvidenceCollection({
  environment = process.env,
  acknowledgementPath = EVIDENCE_ACKNOWLEDGEMENT,
  timeoutMs = EVIDENCE_ACKNOWLEDGEMENT_TIMEOUT_MS,
  pollIntervalMs = 500
} = {}) {
  if (environment.MIGRATION_OPERATOR_REQUIRE_EVIDENCE_ACK !== "true") return false;
  if (
    !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1
    || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 1
  ) {
    throw new MigrationOperatorError("The protected evidence handoff timing is invalid.");
  }

  process.stdout.write(
    "Access operator outputs are ready; retrieve and acknowledge the protected evidence.\n"
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const metadata = await lstat(acknowledgementPath);
      const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
      if (
        !metadata.isFile()
        || metadata.isSymbolicLink()
        || metadata.uid !== currentUid
        || (metadata.mode & 0o777) !== 0o600
        || metadata.size !== 0
      ) {
        throw new MigrationOperatorError(
          "The protected evidence acknowledgement is malformed."
        );
      }
      return true;
    } catch (error) {
      if (error instanceof MigrationOperatorError) throw error;
      if (error?.code !== "ENOENT") {
        throw new MigrationOperatorError(
          "The protected evidence acknowledgement could not be inspected."
        );
      }
    }
    await delay(pollIntervalMs);
  }
  throw new MigrationOperatorError(
    "Protected evidence was not acknowledged before the bounded handoff timeout."
  );
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

  const childEnvironment = {
    ...environment,
    CLOUD_SQL_AUTH_PROXY_EXECUTABLE: PROXY_EXECUTABLE,
    PRE_GEMATIK_IDENTITY_REPOSITORY_ROOT: WORKSPACE
  };
  if (execution.managedTarget) {
    if (environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE !== "private-ip") {
      throw new MigrationOperatorError("Database phases require the explicit private-ip proxy mode.");
    }
    required(environment, "CLOUD_SQL_AUTH_PROXY_SHA256", SHA256_PATTERN);
    await access(PROXY_EXECUTABLE, fsConstants.X_OK);
    if (phase === "identity-preview" || phase === "identity-apply") {
      childEnvironment.PRE_GEMATIK_IDENTITY_REPOSITORY_ROOT = WORKSPACE;
    }
    if (execution.guestAccessTargetProject) {
      childEnvironment.PRE_GEMATIK_ACCESS_REPOSITORY_ROOT = WORKSPACE;
      childEnvironment.PRE_GEMATIK_ACCESS_EXPECTED_PROJECT_ID =
        execution.guestAccessTargetProject;
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
  await waitForEvidenceCollection({ environment });
  if (!succeeded) {
    throw new MigrationOperatorError("The protected access phase failed; retrieve its owner-only report.");
  }
  process.stdout.write(`Access operator phase ${phase} completed; retrieve protected outputs before cleanup.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof MigrationOperatorError
      ? error.message
      : "The access operator failed safely.";
    process.stderr.write(`MigrationOperatorError: ${message}\n`);
    process.exitCode = 1;
  });
}
