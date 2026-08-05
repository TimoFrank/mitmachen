#!/usr/bin/env node

import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  CREATE_OPERATION as IDENTITY_ACCOUNT_CREATE_OPERATION,
  RECOVER_LINK_OPERATION as IDENTITY_ACCOUNT_RECOVERY_OPERATION,
  identityPlatformAccountFingerprint,
  loadProtectedIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  identityPlatformGuestAccessFingerprint,
  loadProtectedIdentityPlatformGuestAccessDocument
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";
import {
  PASSWORD_INVITATION_OPERATION,
  validatePasswordInvitationPostApplyEvidence
} from "./provision_pre_gematik_password_invitation.mjs";
import {
  EXPECTED_PILOT_END,
  WELCOME_EMAIL_OPERATION,
  WELCOME_EMAIL_SENDER_EMAIL,
  WELCOME_EMAIL_SENDER_NAME
} from "./render_pre_gematik_guest_welcome_email.mjs";
import {
  WELCOME_EMAIL_SEND_OPERATION,
  validateWelcomeEmailSmtpConfig
} from "./send_pre_gematik_guest_welcome_email.mjs";
import { renderJob } from "../deploy/migration-operator/render-job.mjs";

export const ONLINE_ONBOARDING_OPERATION = "PREPARE_PRE_GEMATIK_ONLINE_GUEST";
export const ONLINE_ONBOARDING_VERSION = 1;
export const ONLINE_ONBOARDING_READY_STATE = "READY_TO_SEND";
export const ONLINE_ONBOARDING_CLEANUP_STATE = "CLEANUP_COMPLETED_RESUME_REQUIRED";

const EXPECTED_ENVIRONMENT = "pre-gematik";
const TARGET_DATABASE = "versorgungs_kompass";
const JOB_NAME = "vk-pre-gematik-migration-operator";
const ENVIRONMENT_SECRET = "vk-pre-gematik-migration-environment";
const INPUT_SECRET = "vk-pre-gematik-migration-input";
const SERVICE_ACCOUNT = "vk-pre-gematik-migration-operator";
const NETWORK_POLICY = "vk-pre-gematik-migration-operator";
const RUN_LOCK = "vk-pre-gematik-online-onboarding-lock";
const PASSWORD_RESET_DEPLOYMENT = "versorgungs-kompass-password-reset";
const PASSWORD_RESET_CONTAINER = "password-reset-broker";
const JOURNAL_DIRECTORY = "online-onboarding-journal";
const LAST_APPLIED_CONFIGURATION_ANNOTATION = "kubectl.kubernetes.io/last-applied-configuration";
const MAX_PROTECTED_FILE_BYTES = 128 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const PHASE_OUTPUT_TIMEOUT_MS = 12 * 60 * 1000;
const TEMPORARY_IAM_MAXIMUM_MS = 24 * 60 * 60 * 1000;
const TEMPORARY_IAM_MINIMUM_REMAINING_MS = 15 * 60 * 1000;
const CLOUD_SQL_OPERATION_TIMEOUT_MS = 5 * 60 * 1000;
const CLOUD_SQL_CREATE_INTENT_FILE = "cloud-sql-user-create-intent.json";
const CLOUD_SQL_CREATE_OPERATION_FILE = "cloud-sql-user-create-operation.json";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const REGION_PATTERN = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const RESOURCE_PATTERN = /^[a-z][a-z0-9-]{1,96}[a-z0-9]$/u;
const NAMESPACE_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const DATABASE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/u;
const IMAGE_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/u;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u;

export const TEMPORARY_IAM_ROLES = Object.freeze([
  "roles/container.clusterViewer",
  "roles/cloudasset.viewer",
  "roles/cloudsql.viewer",
  "roles/cloudsql.client",
  "roles/identitytoolkit.viewer",
  "roles/serviceusage.serviceUsageConsumer"
]);

const OPERATOR_SOURCE_PATHS = Object.freeze([
  "package.json",
  "package-lock.json",
  "api/package.json",
  "api/package-lock.json",
  "config/pre-gematik/email",
  "deploy/migration-operator/Dockerfile",
  "deploy/migration-operator/job.template.yaml",
  "deploy/migration-operator/networkpolicy.yaml",
  "deploy/migration-operator/operator-entrypoint.mjs",
  "deploy/migration-operator/render-job.mjs",
  "deploy/migration-operator/serviceaccount.yaml",
  "scripts/check_pre_gematik_migration_gcp.mjs",
  "scripts/orchestrate_pre_gematik_online_onboarding.mjs",
  "scripts/prepare_pre_gematik_test_access_operator.mjs",
  "scripts/provision_iap_identity_bindings.mjs",
  "scripts/provision_pre_gematik_identity_platform_account.mjs",
  "scripts/provision_pre_gematik_identity_platform_guest_access.mjs",
  "scripts/provision_pre_gematik_password_invitation.mjs",
  "scripts/provision_pre_gematik_test_access.mjs",
  "scripts/render_pre_gematik_guest_welcome_email.mjs",
  "scripts/send_pre_gematik_guest_welcome_email.mjs",
  "scripts/lib/cloud-sql-managed-proxy.mjs",
  "scripts/lib/target-database-connection.mjs"
]);

const BASE_ENVIRONMENT_KEYS = Object.freeze([
  "GCP_PROJECT_ID",
  "GCP_REGION",
  "GKE_CLUSTER_NAME",
  "GKE_LOCATION",
  "K8S_NAMESPACE",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME",
  "PRE_GEMATIK_GCP_PROJECT_SHA256",
  "EXPECTED_TARGET_PROJECT_ID",
  "GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND",
  "GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND"
]);

const GUEST_REPORT_KEYS = Object.freeze([
  "schema_version",
  "operation",
  "mode",
  "result",
  "identity_platform_account_verified",
  "provider_verified",
  "subject_namespace_verified",
  "access_scope_verified",
  "profile_count",
  "binding_count",
  "active_binding_count",
  "profile_binding_complete",
  "database_transaction_committed",
  "input_fingerprint",
  "current_state_fingerprint",
  "expected_state_fingerprint",
  "online_onboarding_gate"
]);

const ONLINE_GATE_KEYS = Object.freeze([
  "gate_policy",
  "gate_fingerprint",
  "automated_backups",
  "point_in_time_recovery",
  "transaction_log_retention_days",
  "retained_backups",
  "retention_unit",
  "latest_successful_automated_backup_id",
  "latest_successful_automated_backup_end_time"
]);

export class OnlineOnboardingError extends Error {
  constructor(message, exitCode = 2, code = "ONLINE_ONBOARDING_FAILED") {
    super(message);
    this.name = "OnlineOnboardingError";
    this.exitCode = exitCode;
    this.code = code;
  }
}

class CommandExecutionError extends OnlineOnboardingError {
  constructor(label, { exitCode = 1, timedOut = false } = {}) {
    super(
      `${label} ist fehlgeschlagen${timedOut ? " oder hat das Zeitlimit ueberschritten" : ""}.`,
      1,
      "COMMAND_FAILED"
    );
    this.commandExitCode = exitCode;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    throw new OnlineOnboardingError(`${label} muss ein JSON-Objekt sein.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new OnlineOnboardingError(`${label} enthaelt fehlende oder nicht freigegebene Felder.`);
  }
}

function assertText(value, label, maximumLength, pattern) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.length > maximumLength
    || /[\u0000-\u001f\u007f]/u.test(value)
    || (pattern && !pattern.test(value))
  ) {
    throw new OnlineOnboardingError(`${label} ist ungueltig.`);
  }
}

function canonicalTimestamp(value, label) {
  assertText(value, label, 64);
  const parsed = new Date(value);
  const canonical = Number.isFinite(parsed.getTime())
    ? parsed.toISOString().replace(/\.000Z$/u, "Z")
    : "";
  if (!canonical || canonical !== value) {
    throw new OnlineOnboardingError(`${label} muss ein kanonischer UTC-Zeitstempel sein.`);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeStaticResourceMetadata(metadata, label) {
  if (!isPlainObject(metadata)) {
    throw new OnlineOnboardingError(`${label}-Metadaten sind ungueltig.`);
  }
  const labels = metadata.labels == null ? {} : metadata.labels;
  const annotations = metadata.annotations == null ? {} : metadata.annotations;
  if (!isPlainObject(labels) || !isPlainObject(annotations)) {
    throw new OnlineOnboardingError(`${label}-Metadaten sind ungueltig.`);
  }
  const contractAnnotations = { ...annotations };
  delete contractAnnotations[LAST_APPLIED_CONFIGURATION_ANNOTATION];
  const ownerReferences = metadata.ownerReferences == null ? [] : metadata.ownerReferences;
  const finalizers = metadata.finalizers == null ? [] : metadata.finalizers;
  if (!Array.isArray(ownerReferences) || !Array.isArray(finalizers)) {
    throw new OnlineOnboardingError(`${label}-Metadaten sind ungueltig.`);
  }
  return Object.freeze({
    name: metadata.name ?? "",
    namespace: metadata.namespace ?? "",
    generateName: metadata.generateName ?? "",
    labels,
    annotations: contractAnnotations,
    ownerReferences,
    finalizers,
    deletionTimestamp: metadata.deletionTimestamp ?? null,
    deletionGracePeriodSeconds: metadata.deletionGracePeriodSeconds ?? null
  });
}

export function staticKubernetesResourceContract(value, label = "Kubernetes-Ressource") {
  if (!isPlainObject(value)) {
    throw new OnlineOnboardingError(`${label} ist ungueltig.`);
  }
  const common = {
    apiVersion: value.apiVersion ?? "",
    kind: value.kind ?? "",
    metadata: normalizeStaticResourceMetadata(value.metadata, label)
  };
  if (value.kind === "ServiceAccount") {
    const imagePullSecrets = value.imagePullSecrets == null ? [] : value.imagePullSecrets;
    const secrets = value.secrets == null ? [] : value.secrets;
    if (!Array.isArray(imagePullSecrets) || !Array.isArray(secrets)) {
      throw new OnlineOnboardingError(`${label} ist ungueltig.`);
    }
    return Object.freeze({
      ...common,
      automountServiceAccountToken: value.automountServiceAccountToken ?? null,
      imagePullSecrets,
      secrets
    });
  }
  if (value.kind === "NetworkPolicy") {
    if (!isPlainObject(value.spec)) {
      throw new OnlineOnboardingError(`${label} ist ungueltig.`);
    }
    return Object.freeze({
      ...common,
      spec: {
        ...value.spec,
        ingress: value.spec.ingress ?? [],
        egress: value.spec.egress ?? []
      }
    });
  }
  throw new OnlineOnboardingError(`${label} besitzt keinen freigegebenen Ressourcentyp.`);
}

export function staticKubernetesResourceContractsEqual(expected, actual) {
  return canonicalJson(staticKubernetesResourceContract(expected, "Soll-Ressource"))
    === canonicalJson(staticKubernetesResourceContract(actual, "Ist-Ressource"));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function repositoryRoot(cwd = process.cwd()) {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    label: "Git-Worktree-Readback"
  });
  return result.stdout.trim();
}

async function resolveOwnerOnlyFile(filePath, { repository, label, maximumBytes = MAX_PROTECTED_FILE_BYTES }) {
  if (!path.isAbsolute(String(filePath || ""))) {
    throw new OnlineOnboardingError(`${label} muss ein absoluter Dateipfad sein.`);
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(filePath);
  } catch {
    throw new OnlineOnboardingError(`${label} fehlt.`);
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new OnlineOnboardingError(`${label} darf kein Symlink sein.`);
  }
  const [resolved, resolvedRepository] = await Promise.all([
    fs.realpath(filePath),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isFile()
    || metadata.size < 1
    || metadata.size > maximumBytes
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new OnlineOnboardingError(`${label} muss owner-only und ausserhalb des Git-Worktrees liegen.`);
  }
  return resolved;
}

async function resolveOwnerOnlyDirectory(directoryPath, { repository, label }) {
  if (!path.isAbsolute(String(directoryPath || ""))) {
    throw new OnlineOnboardingError(`${label} muss ein absoluter Verzeichnispfad sein.`);
  }
  let linkMetadata;
  try {
    linkMetadata = await fs.lstat(directoryPath);
  } catch {
    throw new OnlineOnboardingError(`${label} fehlt.`);
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new OnlineOnboardingError(`${label} darf kein Symlink sein.`);
  }
  const [resolved, resolvedRepository] = await Promise.all([
    fs.realpath(directoryPath),
    fs.realpath(repository)
  ]);
  const metadata = await fs.stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new OnlineOnboardingError(`${label} muss owner-only und ausserhalb des Git-Worktrees liegen.`);
  }
  await fs.access(resolved, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
  return resolved;
}

async function loadOwnerOnlyJson(filePath, context) {
  const resolved = await resolveOwnerOnlyFile(filePath, context);
  try {
    return JSON.parse(await fs.readFile(resolved, "utf8"));
  } catch {
    throw new OnlineOnboardingError(`${context.label} enthaelt kein gueltiges JSON.`);
  }
}

function parseStrictEnv(contents, expectedKeys, label) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    if (!rawLine || rawLine.startsWith("#")) continue;
    const separator = rawLine.indexOf("=");
    if (separator < 1) throw new OnlineOnboardingError(`${label} enthaelt eine ungueltige Zeile.`);
    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    if (Object.hasOwn(values, key)) throw new OnlineOnboardingError(`${label} enthaelt einen doppelten Schluessel.`);
    assertText(key, `${label}-Schluessel`, 128, /^[A-Z][A-Z0-9_]*$/u);
    assertText(value, `${label}.${key}`, 4096);
    values[key] = value;
  }
  assertExactKeys(values, expectedKeys, label);
  return Object.freeze(values);
}

export function validateOperatorRelease(
  value,
  baseEnvironment,
  now = new Date(),
  { allowExpired = false } = {}
) {
  assertExactKeys(
    value,
    [
      "version",
      "source_commit",
      "image",
      "cloud_sql_proxy_sha256",
      "approved_until",
      "invitation_bucket",
      "pilot_end"
    ],
    "Operator-Release"
  );
  if (value.version !== 1) throw new OnlineOnboardingError("Operator-Release.version muss exakt 1 sein.");
  assertText(value.source_commit, "Operator-Release.source_commit", 40, COMMIT_PATTERN);
  assertText(value.image, "Operator-Release.image", 512, IMAGE_PATTERN);
  assertText(value.cloud_sql_proxy_sha256, "Operator-Release.cloud_sql_proxy_sha256", 71, SHA256_PATTERN);
  assertText(value.invitation_bucket, "Operator-Release.invitation_bucket", 63, BUCKET_PATTERN);
  const approvedUntil = canonicalTimestamp(value.approved_until, "Operator-Release.approved_until");
  const pilotEnd = canonicalTimestamp(value.pilot_end, "Operator-Release.pilot_end");
  if (!allowExpired && Date.parse(approvedUntil) <= now.getTime()) {
    throw new OnlineOnboardingError("Der Operator-Release ist nicht mehr freigegeben.");
  }
  if (pilotEnd !== EXPECTED_PILOT_END || Date.parse(approvedUntil) > Date.parse(pilotEnd)) {
    throw new OnlineOnboardingError("Operator-Freigabe und Pilotfrist sind nicht exakt gebunden.");
  }
  const expectedImagePrefix = `${baseEnvironment.GCP_REGION}-docker.pkg.dev/${baseEnvironment.GCP_PROJECT_ID}/`;
  if (!value.image.startsWith(expectedImagePrefix)) {
    throw new OnlineOnboardingError("Das Operator-Image liegt nicht im bestaetigten Zielprojekt und der Region.");
  }
  if (!value.invitation_bucket.startsWith(`${baseEnvironment.GCP_PROJECT_ID}-`)) {
    throw new OnlineOnboardingError("Der Einladungs-Bucket gehoert nicht zum bestaetigten Zielprojekt.");
  }
  return Object.freeze({ ...value, approved_until: approvedUntil, pilot_end: pilotEnd });
}

export function validateBaseEnvironment(value) {
  assertExactKeys(value, BASE_ENVIRONMENT_KEYS, "Online-Onboarding-Umgebung");
  assertText(value.GCP_PROJECT_ID, "GCP_PROJECT_ID", 30, PROJECT_PATTERN);
  assertText(value.GCP_REGION, "GCP_REGION", 64, REGION_PATTERN);
  assertText(value.GKE_CLUSTER_NAME, "GKE_CLUSTER_NAME", 98, RESOURCE_PATTERN);
  assertText(value.GKE_LOCATION, "GKE_LOCATION", 64, REGION_PATTERN);
  assertText(value.K8S_NAMESPACE, "K8S_NAMESPACE", 63, NAMESPACE_PATTERN);
  assertText(value.CLOUD_SQL_INSTANCE_CONNECTION_NAME, "CLOUD_SQL_INSTANCE_CONNECTION_NAME", 256);
  assertText(value.PRE_GEMATIK_GCP_PROJECT_SHA256, "PRE_GEMATIK_GCP_PROJECT_SHA256", 71, SHA256_PATTERN);
  assertText(value.EXPECTED_TARGET_PROJECT_ID, "EXPECTED_TARGET_PROJECT_ID", 30, PROJECT_PATTERN);
  if (
    value.GCP_PROJECT_ID !== value.EXPECTED_TARGET_PROJECT_ID
    || value.GCP_REGION !== value.GKE_LOCATION
    || value.K8S_NAMESPACE !== EXPECTED_ENVIRONMENT
    || value.GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND !== "true"
    || value.GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND !== "false"
    || value.PRE_GEMATIK_GCP_PROJECT_SHA256 !== sha256(value.GCP_PROJECT_ID)
  ) {
    throw new OnlineOnboardingError("Die Umgebung waehlt nicht exakt den Online-Neunutzervertrag.");
  }
  const connectionParts = value.CLOUD_SQL_INSTANCE_CONNECTION_NAME.split(":");
  if (
    connectionParts.length !== 3
    || connectionParts[0] !== value.GCP_PROJECT_ID
    || connectionParts[1] !== value.GCP_REGION
    || !RESOURCE_PATTERN.test(connectionParts[2])
  ) {
    throw new OnlineOnboardingError("Die Cloud-SQL-Verbindung gehoert nicht exakt zum Zielkontext.");
  }
  return Object.freeze({ ...value, cloudSqlInstance: connectionParts[2] });
}

export function bindOnlineOnboardingDocuments(account, guest, baseEnvironment) {
  if (
    account.project_id !== guest.project_id
    || account.project_id !== baseEnvironment.GCP_PROJECT_ID
    || account.uid !== guest.uid
    || account.email !== guest.email
    || account.display_name !== guest.display_name
  ) {
    throw new OnlineOnboardingError("Account, Gastzugriff und Zielumgebung sind nicht exakt gebunden.");
  }
  return Object.freeze({
    accountFingerprint: identityPlatformAccountFingerprint(account),
    guestFingerprint: identityPlatformGuestAccessFingerprint(guest)
  });
}

export function onlineOnboardingFingerprint({ accountFingerprint, guestFingerprint, baseEnvironment, operatorRelease }) {
  return sha256(
    `versorgungs-kompass-pre-gematik-online-onboarding-v1\0${canonicalJson({
      account_fingerprint: accountFingerprint,
      guest_fingerprint: guestFingerprint,
      environment: baseEnvironment,
      operator_release: operatorRelease
    })}`
  );
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new OnlineOnboardingError(`${option} benoetigt einen Wert.`);
  return value;
}

export function parseOnlineOnboardingArguments(argv) {
  const options = {
    help: false,
    apply: false,
    resume: false,
    accountInput: "",
    guestAccessInput: "",
    operatorRelease: "",
    operatorEnvironment: "",
    identityReadbackEnvironment: "",
    smtpConfig: "",
    runDirectory: "",
    confirmEnvironment: "",
    confirmProject: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--account-input", "accountInput"],
    ["--guest-access-input", "guestAccessInput"],
    ["--operator-release", "operatorRelease"],
    ["--operator-environment", "operatorEnvironment"],
    ["--identity-readback-environment", "identityReadbackEnvironment"],
    ["--smtp-config", "smtpConfig"],
    ["--run-directory", "runDirectory"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-project", "confirmProject"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--resume") options.resume = true;
    else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else throw new OnlineOnboardingError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
  }
  return Object.freeze(options);
}

function validateOptions(options, projectId, fingerprint) {
  for (const key of [
    "accountInput",
    "guestAccessInput",
    "operatorRelease",
    "operatorEnvironment",
    "identityReadbackEnvironment",
    "smtpConfig",
    "runDirectory"
  ]) {
    if (!options[key]) throw new OnlineOnboardingError("Eine erforderliche geschuetzte Eingabe fehlt.");
  }
  if (options.resume && !options.apply) {
    throw new OnlineOnboardingError("--resume ist nur zusammen mit --apply erlaubt.");
  }
  if (!options.apply) {
    if (
      options.confirmEnvironment
      || options.confirmProject
      || options.confirmOperation
      || options.confirmFingerprint
    ) {
      throw new OnlineOnboardingError("Apply-Bestaetigungen sind nur zusammen mit --apply erlaubt.");
    }
    return;
  }
  if (
    options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || options.confirmProject !== projectId
    || options.confirmOperation !== ONLINE_ONBOARDING_OPERATION
    || options.confirmFingerprint !== fingerprint
    || !SHA256_PATTERN.test(options.confirmFingerprint)
  ) {
    throw new OnlineOnboardingError("Apply-Bestaetigungen fuer Umgebung, Projekt, Operation oder Fingerprint fehlen.");
  }
}

function safeSummary({
  apply,
  fingerprint,
  ready = false,
  mailFingerprint = "",
  state = ready ? ONLINE_ONBOARDING_READY_STATE : "PLANNED"
}) {
  return [
    "schema_version=1",
    `operation=${ONLINE_ONBOARDING_OPERATION}`,
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `state=${state}`,
    "mail_sent=false",
    `input_fingerprint=${fingerprint}`,
    ...(mailFingerprint ? [`mail_fingerprint=${mailFingerprint}`] : [])
  ].join("\n");
}

function parseSafeSummary(output, requiredKeys, label) {
  const values = {};
  for (const token of String(output || "").trim().split(/\s+/u)) {
    const separator = token.indexOf("=");
    if (separator < 1) throw new OnlineOnboardingError(`${label} hat kein sicheres Ausgabeformat.`);
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (Object.hasOwn(values, key)) throw new OnlineOnboardingError(`${label} enthaelt doppelte Statuswerte.`);
    values[key] = value;
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(values, key)) throw new OnlineOnboardingError(`${label} ist unvollstaendig.`);
  }
  return Object.freeze(values);
}

export async function runCommand(command, argumentsList, {
  cwd = process.cwd(),
  env = process.env,
  input = "",
  label = "Unterprozess",
  timeoutMs = COMMAND_TIMEOUT_MS,
  acceptedExitCodes = [0],
  maximumOutputBytes = MAX_COMMAND_OUTPUT_BYTES
} = {}) {
  if (
    typeof command !== "string"
    || command.length === 0
    || !Array.isArray(argumentsList)
    || argumentsList.some((argument) => typeof argument !== "string")
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1
    || !Number.isSafeInteger(maximumOutputBytes)
    || maximumOutputBytes < 1
    || !Array.isArray(acceptedExitCodes)
    || acceptedExitCodes.some((code) => !Number.isInteger(code))
  ) {
    throw new OnlineOnboardingError(`${label} hat einen ungueltigen Ausfuehrungsvertrag.`);
  }
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    let timeout = null;
    let forcedTermination = null;
    const child = spawn(command, argumentsList, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forcedTermination);
      callback();
    };
    const requestTermination = () => {
      child.kill("SIGTERM");
      if (forcedTermination) return;
      forcedTermination = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 1_000);
      forcedTermination.unref();
    };
    const collect = (target, chunk) => {
      if (outputExceeded) return target;
      const value = chunk.toString("utf8");
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(value) > maximumOutputBytes) {
        outputExceeded = true;
        requestTermination();
        return target;
      }
      return target + value;
    };
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    child.once("error", () => {
      finish(() => reject(new CommandExecutionError(label)));
    });
    child.once("close", (exitCode, signal) => {
      finish(() => {
        if (outputExceeded || signal || !acceptedExitCodes.includes(exitCode)) {
          reject(new CommandExecutionError(label, { exitCode, timedOut }));
        } else {
          resolve(Object.freeze({ stdout, stderr, exitCode }));
        }
      });
    });
    timeout = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, timeoutMs);
    timeout.unref();
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

const JOURNAL_EVENTS = new Set([
  "STARTED",
  "LOCK_ACQUIRED",
  "ACCOUNT_PREVIEW_CONFIRMED",
  "ACCOUNT_APPLY_INTENT",
  "ACCOUNT_APPLIED",
  "ACCOUNT_APPLY_RECOVERED",
  "GUEST_OPERATOR_PREPARE_INTENT",
  "GUEST_OPERATOR_READY",
  "GUEST_INITIAL_PREVIEW_CONFIRMED",
  "GUEST_APPLY_INTENT",
  "GUEST_APPLIED",
  "GUEST_APPLY_RECOVERED",
  "GUEST_POST_PREVIEW_CONFIRMED",
  "GUEST_OPERATOR_CLEANED",
  "RECOVERY_CLEANUP_COMPLETED",
  "INVITATION_PREVIEW_CONFIRMED",
  "INVITATION_APPLY_INTENT",
  "INVITATION_PREPARED",
  "MAIL_RENDER_PREVIEW_CONFIRMED",
  "MAIL_RENDER_APPLY_INTENT",
  "MAIL_RENDERED",
  "MAIL_SEND_PREVIEW_CONFIRMED",
  "READY_TO_SEND",
  "LOCK_RELEASED"
]);

const JOURNAL_DETAIL_KEYS = new Set([
  "holder_id",
  "lock_uid",
  "phase",
  "result",
  "state",
  "input_fingerprint",
  "current_state_fingerprint",
  "expected_state_fingerprint",
  "resource_uid",
  "mail_fingerprint"
]);
const JOURNAL_RECORD_FILE_PATTERN = /^\d{6}-[A-Z_]+\.json$/u;
const JOURNAL_ATOMIC_FILE_PATTERN = /^\.atomic-[a-f0-9-]{36}$/u;

function safeJournalDetails(value) {
  if (!isPlainObject(value)) throw new OnlineOnboardingError("Journal-Details sind ungueltig.");
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (!JOURNAL_DETAIL_KEYS.has(key)) {
      throw new OnlineOnboardingError("Journal-Details enthalten ein nicht freigegebenes Feld.");
    }
    if (
      typeof item !== "string"
      || item.length < 1
      || item.length > 512
      || !/^[A-Za-z0-9_.:/=-]+$/u.test(item)
    ) {
      throw new OnlineOnboardingError("Journal-Details enthalten einen unsicheren Wert.");
    }
    normalized[key] = item;
  }
  return Object.freeze(normalized);
}

function journalRecordHash(record) {
  return sha256(`versorgungs-kompass-online-onboarding-journal-v1\0${canonicalJson(record)}`);
}

function journalTimestamp(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) throw new OnlineOnboardingError("Journal-Zeit ist ungueltig.");
  return value.toISOString();
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(String(error?.code || ""))) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function assertOwnerOnlyJournalDirectory(directory) {
  const linkMetadata = await fs.lstat(directory);
  const metadata = await fs.stat(directory);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    linkMetadata.isSymbolicLink()
    || !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
  ) {
    throw new OnlineOnboardingError("Das Resume-Journal ist nicht owner-only.");
  }
}

async function assertOwnerOnlyJournalFile(filePath, label, { allowEmpty = false } = {}) {
  const linkMetadata = await fs.lstat(filePath);
  const metadata = await fs.stat(filePath);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    linkMetadata.isSymbolicLink()
    || !metadata.isFile()
    || (!allowEmpty && metadata.size < 1)
    || metadata.size > 32 * 1024
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
  ) {
    throw new OnlineOnboardingError(`${label} ist nicht owner-only.`);
  }
  return metadata;
}

async function writeAtomicCandidate(directory, contents) {
  const candidatePath = path.join(directory, `.atomic-${crypto.randomUUID()}`);
  const handle = await fs.open(candidatePath, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return candidatePath;
}

async function publishOwnerOnlyCreateOnly(directory, fileName, contents) {
  const candidatePath = await writeAtomicCandidate(directory, contents);
  const targetPath = path.join(directory, fileName);
  try {
    await fs.link(candidatePath, targetPath);
    await syncDirectory(directory);
  } finally {
    await fs.unlink(candidatePath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    await syncDirectory(directory);
  }
  return targetPath;
}

async function replaceOwnerOnlyAtomically(directory, fileName, contents) {
  const candidatePath = await writeAtomicCandidate(directory, contents);
  try {
    await fs.rename(candidatePath, path.join(directory, fileName));
    await syncDirectory(directory);
  } finally {
    await fs.unlink(candidatePath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function readExecutionMarker(filePath, holderId, label) {
  await assertOwnerOnlyJournalFile(filePath, label);
  const lines = (await fs.readFile(filePath, "utf8")).trimEnd().split("\n");
  const pid = Number(lines[0]);
  if (
    lines.length !== 2
    || !Number.isSafeInteger(pid)
    || pid < 1
    || lines[1] !== holderId
  ) {
    throw new OnlineOnboardingError(`${label} gehoert nicht sicher zu diesem Journal.`);
  }
  return Object.freeze({ pid, holderId: lines[1], value: `${pid}\n${lines[1]}\n` });
}

function executionProcessIsActive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw new OnlineOnboardingError("Der lokale Lauf-Lock konnte nicht sicher geprueft werden.");
  }
}

async function loadJournalRecords(directory, fingerprint) {
  const allNames = await fs.readdir(directory);
  if (allNames.some((name) => (
    !["active.lock", "active.takeover"].includes(name)
    && !JOURNAL_RECORD_FILE_PATTERN.test(name)
    && !JOURNAL_ATOMIC_FILE_PATTERN.test(name)
  ))) {
    throw new OnlineOnboardingError("Das Resume-Journal enthaelt einen unbekannten Eintrag.");
  }
  const names = allNames.filter((name) => JOURNAL_RECORD_FILE_PATTERN.test(name)).sort();
  const records = [];
  let previousHash = "GENESIS";
  for (let index = 0; index < names.length; index += 1) {
    const expectedSequence = index + 1;
    if (!names[index].startsWith(String(expectedSequence).padStart(6, "0"))) {
      throw new OnlineOnboardingError("Das Resume-Journal hat eine Sequenzluecke.");
    }
    const filePath = path.join(directory, names[index]);
    await assertOwnerOnlyJournalFile(filePath, "Ein Resume-Journal-Eintrag");
    let record;
    try {
      record = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      throw new OnlineOnboardingError("Ein Resume-Journal-Eintrag ist ungueltig.");
    }
    assertExactKeys(
      record,
      ["version", "sequence", "event", "created_at", "fingerprint", "details", "previous_hash", "record_hash"],
      "Resume-Journal-Eintrag"
    );
    if (
      record.version !== 1
      || record.sequence !== expectedSequence
      || !JOURNAL_EVENTS.has(record.event)
      || !Number.isFinite(Date.parse(record.created_at))
      || record.fingerprint !== fingerprint
      || record.previous_hash !== previousHash
      || !SHA256_PATTERN.test(record.record_hash)
    ) {
      throw new OnlineOnboardingError("Die Resume-Journal-Kette ist ungueltig.");
    }
    const details = safeJournalDetails(record.details);
    const unsigned = { ...record, details };
    delete unsigned.record_hash;
    if (journalRecordHash(unsigned) !== record.record_hash) {
      throw new OnlineOnboardingError("Die Resume-Journal-Integritaet ist verletzt.");
    }
    previousHash = record.record_hash;
    records.push(Object.freeze({ ...record, details }));
  }
  if (
    records.length > 0
    && (
      records[0].event !== "STARTED"
      || records.filter((record) => record.event === "STARTED").length !== 1
    )
  ) {
    throw new OnlineOnboardingError("Das Resume-Journal besitzt keinen eindeutigen Startzustand.");
  }
  return records;
}

export class AppendOnlyOnlineOnboardingJournal {
  constructor({ directory, fingerprint, records, now }) {
    this.directory = directory;
    this.fingerprint = fingerprint;
    this.records = records;
    this.now = now;
    this.executionLock = null;
  }

  static async open({ runDirectory, fingerprint, resume, now = () => new Date() }) {
    const directory = path.join(runDirectory, JOURNAL_DIRECTORY);
    let exists = true;
    try {
      await fs.lstat(directory);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      exists = false;
    }
    if (exists && !resume) {
      throw new OnlineOnboardingError("Ein Laufjournal existiert bereits; nur --resume darf es fortsetzen.");
    }
    if (!exists && resume) {
      throw new OnlineOnboardingError("--resume benoetigt ein vorhandenes Laufjournal.");
    }
    if (!exists) {
      await fs.mkdir(directory, { mode: 0o700 });
      await fs.chmod(directory, 0o700);
      await syncDirectory(runDirectory);
    }
    await assertOwnerOnlyJournalDirectory(directory);
    const records = await loadJournalRecords(directory, fingerprint);
    const journal = new AppendOnlyOnlineOnboardingJournal({
      directory,
      fingerprint,
      records,
      now
    });
    if (!journal.has("STARTED")) {
      await journal.append("STARTED", { holder_id: crypto.randomUUID() });
    }
    return journal;
  }

  has(event) {
    return this.records.some((record) => record.event === event);
  }

  last(event) {
    return [...this.records].reverse().find((record) => record.event === event) || null;
  }

  holderId() {
    const holder = this.last("STARTED")?.details?.holder_id;
    assertText(holder, "Journal-Holder", 64, /^[a-f0-9-]{36}$/u);
    return holder;
  }

  async append(event, details = {}) {
    if (!JOURNAL_EVENTS.has(event)) throw new OnlineOnboardingError("Journal-Ereignis ist nicht freigegeben.");
    const safeDetails = safeJournalDetails(details);
    const sequence = this.records.length + 1;
    const unsigned = {
      version: 1,
      sequence,
      event,
      created_at: journalTimestamp(this.now()),
      fingerprint: this.fingerprint,
      details: safeDetails,
      previous_hash: this.records.at(-1)?.record_hash || "GENESIS"
    };
    const record = Object.freeze({
      ...unsigned,
      record_hash: journalRecordHash(unsigned)
    });
    const fileName = `${String(sequence).padStart(6, "0")}-${event}.json`;
    await publishOwnerOnlyCreateOnly(
      this.directory,
      fileName,
      `${JSON.stringify(record, null, 2)}\n`
    );
    this.records.push(record);
    return record;
  }

  async refreshAfterExecutionLock() {
    const expectedHolder = this.holderId();
    const names = await fs.readdir(this.directory);
    let removed = false;
    for (const name of names.filter((entry) => JOURNAL_ATOMIC_FILE_PATTERN.test(entry))) {
      const filePath = path.join(this.directory, name);
      await assertOwnerOnlyJournalFile(filePath, "Ein atomarer Journal-Zwischenstand", {
        allowEmpty: true
      });
      await fs.unlink(filePath);
      removed = true;
    }
    if (removed) await syncDirectory(this.directory);
    const records = await loadJournalRecords(this.directory, this.fingerprint);
    const holder = records.find((record) => record.event === "STARTED")?.details?.holder_id;
    if (holder !== expectedHolder) {
      throw new OnlineOnboardingError("Das Resume-Journal wechselte waehrend der Lock-Uebernahme seinen Holder.");
    }
    this.records = records;
  }

  async clearStaleTakeover(takeoverPath) {
    let marker;
    try {
      marker = await readExecutionMarker(
        takeoverPath,
        this.holderId(),
        "Der lokale Lauf-Lock-Takeover"
      );
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (executionProcessIsActive(marker.pid)) {
      throw new OnlineOnboardingError(
        "Ein lokaler Lauf-Lock-Takeover ist bereits aktiv."
      );
    }
    await fs.unlink(takeoverPath);
    await syncDirectory(this.directory);
  }

  async acquireExecutionLock() {
    const lockPath = path.join(this.directory, "active.lock");
    const takeoverPath = path.join(this.directory, "active.takeover");
    const value = `${process.pid}\n${this.holderId()}\n`;
    await this.clearStaleTakeover(takeoverPath);
    try {
      await publishOwnerOnlyCreateOnly(this.directory, "active.lock", value);
      this.executionLock = value;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let takeoverOwned = false;
      try {
        await publishOwnerOnlyCreateOnly(this.directory, "active.takeover", value);
        takeoverOwned = true;
      } catch (takeoverError) {
        if (takeoverError?.code === "EEXIST") {
          throw new OnlineOnboardingError("Ein paralleler lokaler Resume-Takeover wurde blockiert.");
        }
        throw takeoverError;
      }
      try {
        const existing = await readExecutionMarker(
          lockPath,
          this.holderId(),
          "Der lokale Lauf-Lock"
        );
        if (executionProcessIsActive(existing.pid)) {
          throw new OnlineOnboardingError("Dieser Onboarding-Lauf ist bereits aktiv.");
        }
        await replaceOwnerOnlyAtomically(this.directory, "active.lock", value);
        this.executionLock = value;
      } finally {
        if (takeoverOwned) {
          const marker = await readExecutionMarker(
            takeoverPath,
            this.holderId(),
            "Der lokale Lauf-Lock-Takeover"
          );
          if (marker.value !== value) {
            throw new OnlineOnboardingError("Ein fremder Lauf-Lock-Takeover darf nicht entfernt werden.");
          }
          await fs.unlink(takeoverPath);
          await syncDirectory(this.directory);
        }
      }
    }
    await this.refreshAfterExecutionLock();
  }

  async releaseExecutionLock() {
    if (!this.executionLock) return;
    const lockPath = path.join(this.directory, "active.lock");
    const marker = await readExecutionMarker(
      lockPath,
      this.holderId(),
      "Der lokale Lauf-Lock"
    );
    if (marker.value !== this.executionLock) {
      throw new OnlineOnboardingError("Ein fremder lokaler Lauf-Lock darf nicht entfernt werden.");
    }
    await fs.unlink(lockPath);
    await syncDirectory(this.directory);
    this.executionLock = null;
  }
}

function exactSafeSummary(output, expected, label) {
  const parsed = parseSafeSummary(output, Object.keys(expected), label);
  assertExactKeys(parsed, Object.keys(expected), label);
  for (const [key, value] of Object.entries(expected)) {
    if (value !== null && parsed[key] !== String(value)) {
      throw new OnlineOnboardingError(`${label} entspricht nicht dem erwarteten Vertrag.`);
    }
  }
  return parsed;
}

function validateAccountPreview(output, fingerprint, { recovery = false } = {}) {
  return exactSafeSummary(output, {
    mode: "PREVIEW",
    operation: recovery ? "link-recovery" : "account-create-only",
    account_count: "1",
    target_state: recovery ? "exact-existing" : "absent",
    set_password_link_file_created: "false",
    input_fingerprint: fingerprint
  }, recovery ? "Account-Recovery-Preview" : "Account-Preview");
}

function validateAccountApply(output, fingerprint, { recovery = false } = {}) {
  return exactSafeSummary(output, {
    mode: "APPLY",
    operation: recovery ? "link-recovery" : "account-create-only",
    account_count: "1",
    target_state: recovery ? "exact-existing" : "absent",
    set_password_link_file_created: "true",
    input_fingerprint: fingerprint
  }, recovery ? "Account-Recovery" : "Account-Apply");
}

function validateOnlineGate(gate) {
  assertExactKeys(gate, ONLINE_GATE_KEYS, "Online-Onboarding-Gate");
  if (
    gate.gate_policy !== "online-guest-onboarding"
    || !SHA256_PATTERN.test(gate.gate_fingerprint)
    || gate.automated_backups !== true
    || gate.point_in_time_recovery !== true
    || !Number.isInteger(gate.transaction_log_retention_days)
    || gate.transaction_log_retention_days < 1
    || !Number.isInteger(gate.retained_backups)
    || gate.retained_backups < 1
    || gate.retention_unit !== "COUNT"
    || typeof gate.latest_successful_automated_backup_id !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(gate.latest_successful_automated_backup_id)
    || !Number.isFinite(Date.parse(gate.latest_successful_automated_backup_end_time))
  ) {
    throw new OnlineOnboardingError("Das Online-Onboarding-Gate ist unvollstaendig.");
  }
}

export function validateGuestPhaseReport(value, guestFingerprint, expectedState) {
  assertExactKeys(value, GUEST_REPORT_KEYS, "Gastphasen-Nachweis");
  validateOnlineGate(value.online_onboarding_gate);
  if (
    value.schema_version !== 1
    || value.operation !== GUEST_ACCESS_CREATE_PROFILE_OPERATION
    || value.identity_platform_account_verified !== true
    || value.provider_verified !== "password"
    || value.subject_namespace_verified !== true
    || value.access_scope_verified !== "test_only"
    || value.input_fingerprint !== guestFingerprint
    || !SHA256_PATTERN.test(value.current_state_fingerprint)
    || !SHA256_PATTERN.test(value.expected_state_fingerprint)
  ) {
    throw new OnlineOnboardingError("Der Gastphasen-Nachweis ist nicht exakt gebunden.");
  }
  const states = {
    initial: {
      mode: "PREVIEW", result: "create_profile_and_binding", profile_count: 0,
      binding_count: 0, active_binding_count: 0, profile_binding_complete: false,
      database_transaction_committed: false, fingerprintsEqual: false
    },
    applied: {
      mode: "APPLY", result: "create_profile_and_binding_completed", profile_count: 1,
      binding_count: 1, active_binding_count: 1, profile_binding_complete: true,
      database_transaction_committed: true, fingerprintsEqual: true
    },
    final: {
      mode: "PREVIEW", result: "unchanged", profile_count: 1,
      binding_count: 1, active_binding_count: 1, profile_binding_complete: true,
      database_transaction_committed: false, fingerprintsEqual: true
    }
  };
  const expected = states[expectedState];
  if (!expected) throw new OnlineOnboardingError("Unbekannter Gastphasen-Pruefzustand.");
  for (const [key, item] of Object.entries(expected)) {
    if (key !== "fingerprintsEqual" && value[key] !== item) {
      throw new OnlineOnboardingError("Der Gastphasen-Nachweis hat einen unerwarteten Zustand.");
    }
  }
  const fingerprintsEqual = value.current_state_fingerprint === value.expected_state_fingerprint;
  if (fingerprintsEqual !== expected.fingerprintsEqual) {
    throw new OnlineOnboardingError("Die Gastphasen-Zustandsfingerprints sind unplausibel.");
  }
  return Object.freeze(value);
}

function validateInvitationSummary(output, fingerprint, apply) {
  return exactSafeSummary(output, {
    schema_version: "1",
    operation: PASSWORD_INVITATION_OPERATION,
    mode: apply ? "APPLY" : "PREVIEW",
    prepared_object_created: apply ? "true" : "false",
    link_written: apply ? "true" : "false",
    input_fingerprint: fingerprint
  }, apply ? "Einladungs-Apply" : "Einladungs-Preview");
}

function validateRenderingSummary(output, fingerprint, apply) {
  return exactSafeSummary(output, {
    schema_version: "1",
    operation: WELCOME_EMAIL_OPERATION,
    mode: apply ? "APPLY" : "PREVIEW",
    mail_bundle_created: apply ? "true" : "false",
    input_fingerprint: fingerprint
  }, apply ? "Mail-Rendering-Apply" : "Mail-Rendering-Preview");
}

function validateSenderPreview(output) {
  const parsed = exactSafeSummary(output, {
    schema_version: "1",
    operation: WELCOME_EMAIL_SEND_OPERATION,
    mode: "PREVIEW",
    smtp_accepted: "false",
    invitation_activated: "false",
    mail_fingerprint: null
  }, "SMTP-Versandpreview");
  if (!SHA256_PATTERN.test(parsed.mail_fingerprint)) {
    throw new OnlineOnboardingError("Der SMTP-Versandpreview hat keinen gueltigen Mail-Fingerprint.");
  }
  return parsed;
}

function requireRuntime(runtime) {
  const methods = [
    "preflight",
    "acquireLock",
    "releaseLock",
    "previewAccount",
    "applyAccount",
    "resolveUnknownAccount",
    "prepareGuestOperator",
    "previewGuest",
    "applyGuest",
    "cleanupGuestOperator",
    "prepareInvitation",
    "renderMail",
    "previewMailSend"
  ];
  if (!runtime || methods.some((method) => typeof runtime[method] !== "function")) {
    throw new OnlineOnboardingError("Der Online-Onboarding-Runtimevertrag ist unvollstaendig.");
  }
  return runtime;
}

function resourceUidDetails(result) {
  if (result?.resourceId === undefined) return {};
  assertText(result.resourceId, "Operator-Ressourcen-UID", 128, /^[A-Za-z0-9_.:-]+$/u);
  return { resource_uid: result.resourceId };
}

function journalEventPosition(journal, event) {
  if (Array.isArray(journal.records)) {
    for (let index = journal.records.length - 1; index >= 0; index -= 1) {
      if (journal.records[index]?.event === event) return index;
    }
  }
  const sequence = journal.last(event)?.sequence;
  return Number.isSafeInteger(sequence) ? sequence : -1;
}

function guestCleanupIsCurrent(journal) {
  const cleaned = journalEventPosition(journal, "GUEST_OPERATOR_CLEANED");
  const prepareIntent = journalEventPosition(journal, "GUEST_OPERATOR_PREPARE_INTENT");
  const ready = journalEventPosition(journal, "GUEST_OPERATOR_READY");
  const postPreview = journalEventPosition(journal, "GUEST_POST_PREVIEW_CONFIRMED");
  return cleaned > prepareIntent && cleaned > ready && cleaned > postPreview;
}

async function prepareAccount({ runtime, journal, accountFingerprint }) {
  if (journal.has("ACCOUNT_APPLIED") || journal.has("ACCOUNT_APPLY_RECOVERED")) return;
  if (journal.has("ACCOUNT_APPLY_INTENT")) {
    const recovery = await runtime.resolveUnknownAccount();
    if (recovery?.state === "present") {
      validateAccountPreview(recovery.summary, accountFingerprint, { recovery: true });
      await journal.append("ACCOUNT_APPLY_RECOVERED", {
        state: "exact-existing",
        input_fingerprint: accountFingerprint
      });
      return;
    }
    if (recovery?.state !== "absent") {
      throw new OnlineOnboardingError("Der unbekannte Account-Apply-Ausgang konnte nicht sicher aufgeloest werden.");
    }
  }
  const first = validateAccountPreview(await runtime.previewAccount(), accountFingerprint);
  const second = validateAccountPreview(await runtime.previewAccount(), accountFingerprint);
  if (canonicalJson(first) !== canonicalJson(second)) {
    throw new OnlineOnboardingError("Die beiden Account-Previews sind nicht identisch.");
  }
  if (!journal.has("ACCOUNT_PREVIEW_CONFIRMED")) {
    await journal.append("ACCOUNT_PREVIEW_CONFIRMED", { input_fingerprint: accountFingerprint });
  }
  if (!journal.has("ACCOUNT_APPLY_INTENT")) {
    await journal.append("ACCOUNT_APPLY_INTENT", { input_fingerprint: accountFingerprint });
  }
  validateAccountApply(await runtime.applyAccount(), accountFingerprint);
  await journal.append("ACCOUNT_APPLIED", { input_fingerprint: accountFingerprint });
}

async function prepareGuestAccess({ runtime, journal, guestFingerprint }) {
  if (journal.has("GUEST_POST_PREVIEW_CONFIRMED")) {
    if (!guestCleanupIsCurrent(journal)) {
      await runtime.cleanupGuestOperator();
      await journal.append("GUEST_OPERATOR_CLEANED", { phase: "guest" });
    }
    return;
  }
  let cleanupRequired = true;
  let operationError = null;
  try {
    await journal.append("GUEST_OPERATOR_PREPARE_INTENT", { phase: "guest" });
    await runtime.prepareGuestOperator();
    await journal.append("GUEST_OPERATOR_READY", { phase: "guest" });
    let preview;
    if (journal.has("GUEST_APPLY_INTENT") && !journal.has("GUEST_APPLIED")) {
      preview = await runtime.previewGuest({ purpose: "unknown-apply-readback" });
      try {
        const final = validateGuestPhaseReport(preview.report, guestFingerprint, "final");
        await journal.append("GUEST_APPLY_RECOVERED", {
          result: final.result,
          current_state_fingerprint: final.current_state_fingerprint,
          expected_state_fingerprint: final.expected_state_fingerprint,
          ...resourceUidDetails(preview)
        });
        await journal.append("GUEST_POST_PREVIEW_CONFIRMED", {
          result: final.result,
          current_state_fingerprint: final.current_state_fingerprint,
          expected_state_fingerprint: final.expected_state_fingerprint,
          ...resourceUidDetails(preview)
        });
      } catch (error) {
        if (!(error instanceof OnlineOnboardingError)) throw error;
        preview = { ...preview, report: validateGuestPhaseReport(preview.report, guestFingerprint, "initial") };
      }
    } else if (!journal.has("GUEST_APPLIED")) {
      preview = await runtime.previewGuest({ purpose: "initial" });
      const initial = validateGuestPhaseReport(preview.report, guestFingerprint, "initial");
      if (!journal.has("GUEST_INITIAL_PREVIEW_CONFIRMED")) {
        await journal.append("GUEST_INITIAL_PREVIEW_CONFIRMED", {
          result: initial.result,
          current_state_fingerprint: initial.current_state_fingerprint,
          expected_state_fingerprint: initial.expected_state_fingerprint,
          ...resourceUidDetails(preview)
        });
      }
    }
    if (!journal.has("GUEST_APPLIED") && !journal.has("GUEST_APPLY_RECOVERED")) {
      const initial = validateGuestPhaseReport(preview.report, guestFingerprint, "initial");
      if (!journal.has("GUEST_APPLY_INTENT")) {
        await journal.append("GUEST_APPLY_INTENT", {
          input_fingerprint: guestFingerprint,
          current_state_fingerprint: initial.current_state_fingerprint,
          expected_state_fingerprint: initial.expected_state_fingerprint
        });
      }
      const appliedResult = await runtime.applyGuest({ preview: initial });
      const applied = validateGuestPhaseReport(appliedResult.report, guestFingerprint, "applied");
      await journal.append("GUEST_APPLIED", {
        result: applied.result,
        current_state_fingerprint: applied.current_state_fingerprint,
        expected_state_fingerprint: applied.expected_state_fingerprint,
        ...resourceUidDetails(appliedResult)
      });
    }
    if (!journal.has("GUEST_POST_PREVIEW_CONFIRMED")) {
      const postResult = await runtime.previewGuest({ purpose: "post-apply" });
      const post = validateGuestPhaseReport(postResult.report, guestFingerprint, "final");
      await journal.append("GUEST_POST_PREVIEW_CONFIRMED", {
        result: post.result,
        current_state_fingerprint: post.current_state_fingerprint,
        expected_state_fingerprint: post.expected_state_fingerprint,
        ...resourceUidDetails(postResult)
      });
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (cleanupRequired) {
      try {
        await runtime.cleanupGuestOperator();
        await journal.append("GUEST_OPERATOR_CLEANED", { phase: "guest" });
      } catch (cleanupError) {
        operationError = cleanupError;
      }
    }
  }
  if (operationError) throw operationError;
}

async function prepareInvitationAndMail({ runtime, journal }) {
  if (!journal.has("GUEST_POST_PREVIEW_CONFIRMED") || !guestCleanupIsCurrent(journal)) {
    throw new OnlineOnboardingError("Das Mail-Gate bleibt bis Gast-Readback und vollstaendigem Cleanup geschlossen.");
  }
  let invitationFingerprint = "";
  if (!journal.has("INVITATION_PREPARED")) {
    if (journal.has("INVITATION_APPLY_INTENT")) {
      throw new OnlineOnboardingError(
        "Der Einladungs-Apply-Ausgang ist unbekannt; kein blinder Retry und kein Mailversand."
      );
    }
    const invitationPreview = await runtime.prepareInvitation({ apply: false });
    const preview = parseSafeSummary(
      invitationPreview.summary,
      ["input_fingerprint"],
      "Einladungs-Preview"
    );
    invitationFingerprint = preview.input_fingerprint;
    validateInvitationSummary(invitationPreview.summary, invitationFingerprint, false);
    await journal.append("INVITATION_PREVIEW_CONFIRMED", {
      input_fingerprint: invitationFingerprint
    });
    await journal.append("INVITATION_APPLY_INTENT", {
      input_fingerprint: invitationFingerprint
    });
    const invitationApply = await runtime.prepareInvitation({
      apply: true,
      fingerprint: invitationFingerprint
    });
    validateInvitationSummary(invitationApply.summary, invitationFingerprint, true);
    await journal.append("INVITATION_PREPARED", {
      input_fingerprint: invitationFingerprint
    });
  }

  let renderingFingerprint = "";
  let recoveredSenderPreview = null;
  if (!journal.has("MAIL_RENDERED")) {
    if (journal.has("MAIL_RENDER_APPLY_INTENT")) {
      try {
        recoveredSenderPreview = validateSenderPreview((await runtime.previewMailSend()).summary);
      } catch {
        throw new OnlineOnboardingError(
          "Der Mail-Rendering-Ausgang ist unbekannt; das create-only Paket konnte nicht exakt bestaetigt werden."
        );
      }
      await journal.append("MAIL_RENDERED", {
        state: "verified-existing",
        mail_fingerprint: recoveredSenderPreview.mail_fingerprint
      });
    } else {
      const renderingPreview = await runtime.renderMail({ apply: false });
      const preview = parseSafeSummary(
        renderingPreview.summary,
        ["input_fingerprint"],
        "Mail-Rendering-Preview"
      );
      renderingFingerprint = preview.input_fingerprint;
      validateRenderingSummary(renderingPreview.summary, renderingFingerprint, false);
      await journal.append("MAIL_RENDER_PREVIEW_CONFIRMED", {
        input_fingerprint: renderingFingerprint
      });
      await journal.append("MAIL_RENDER_APPLY_INTENT", {
        input_fingerprint: renderingFingerprint
      });
      const renderingApply = await runtime.renderMail({
        apply: true,
        fingerprint: renderingFingerprint
      });
      validateRenderingSummary(renderingApply.summary, renderingFingerprint, true);
      await journal.append("MAIL_RENDERED", { input_fingerprint: renderingFingerprint });
    }
  }

  const senderPreview = recoveredSenderPreview
    || validateSenderPreview((await runtime.previewMailSend()).summary);
  const confirmedSenderPreview = journal.last("MAIL_SEND_PREVIEW_CONFIRMED");
  if (
    confirmedSenderPreview
    && confirmedSenderPreview.details?.mail_fingerprint !== senderPreview.mail_fingerprint
  ) {
    throw new OnlineOnboardingError(
      "Der erneute SMTP-Versandpreview weicht vom bestaetigten Mail-Fingerprint ab."
    );
  }
  if (!confirmedSenderPreview) {
    await journal.append("MAIL_SEND_PREVIEW_CONFIRMED", {
      mail_fingerprint: senderPreview.mail_fingerprint
    });
  }
  if (!journal.has("READY_TO_SEND")) {
    await journal.append("READY_TO_SEND", {
      state: ONLINE_ONBOARDING_READY_STATE,
      mail_fingerprint: senderPreview.mail_fingerprint
    });
  }
  return senderPreview.mail_fingerprint;
}

export async function executeOnlineOnboardingPreparation(input, {
  runtime,
  journal = null,
  now = () => new Date(),
  log = console.log
} = {}) {
  assertExactKeys(
    input,
    [
      "apply",
      "resume",
      "fingerprint",
      "projectId",
      "accountFingerprint",
      "guestFingerprint",
      "invitationBucket",
      "runDirectory",
      "operatorReleaseExpired"
    ],
    "Online-Onboarding-Ausfuehrung"
  );
  if (typeof input.apply !== "boolean" || typeof input.resume !== "boolean") {
    throw new OnlineOnboardingError("Apply- und Resume-Modus sind ungueltig.");
  }
  if (typeof input.operatorReleaseExpired !== "boolean") {
    throw new OnlineOnboardingError("Der Operator-Release-Status ist ungueltig.");
  }
  if (input.operatorReleaseExpired && !input.resume) {
    throw new OnlineOnboardingError("Ein abgelaufener Operator-Release darf nur sicher bereinigt werden.");
  }
  if (input.resume && !input.apply) {
    throw new OnlineOnboardingError("Resume ist nur fuer einen bestaetigten Apply-Lauf erlaubt.");
  }
  assertText(input.fingerprint, "Onboarding-Fingerprint", 71, SHA256_PATTERN);
  assertText(input.accountFingerprint, "Account-Fingerprint", 71, SHA256_PATTERN);
  assertText(input.guestFingerprint, "Gast-Fingerprint", 71, SHA256_PATTERN);
  assertText(input.projectId, "Zielprojekt", 30, PROJECT_PATTERN);
  assertText(input.invitationBucket, "Einladungs-Bucket", 63, BUCKET_PATTERN);
  if (!input.apply) {
    const summary = safeSummary({ apply: false, fingerprint: input.fingerprint });
    log(summary);
    return Object.freeze({ ready: false, mailSent: false, summary });
  }

  const activeRuntime = requireRuntime(runtime);
  await activeRuntime.preflight({
    fingerprint: input.fingerprint,
    cleanupOnly: input.resume
  });
  const activeJournal = journal || await AppendOnlyOnlineOnboardingJournal.open({
    runDirectory: input.runDirectory,
    fingerprint: input.fingerprint,
    resume: input.resume,
    now
  });
  if (
    typeof activeJournal.has !== "function"
    || typeof activeJournal.last !== "function"
    || typeof activeJournal.append !== "function"
  ) {
    throw new OnlineOnboardingError("Der Resume-Journalvertrag ist unvollstaendig.");
  }
  let lock = null;
  let operationError = null;
  let mailFingerprint = "";
  let cleanupOnlyCompleted = false;
  try {
    await activeJournal.acquireExecutionLock?.();
    const readyRecord = activeJournal.last("READY_TO_SEND");
    mailFingerprint = readyRecord?.details?.mail_fingerprint || "";
    if (
      readyRecord
      && (
        readyRecord.details?.state !== ONLINE_ONBOARDING_READY_STATE
        || !SHA256_PATTERN.test(mailFingerprint)
      )
    ) {
      throw new OnlineOnboardingError(
        "Der READY_TO_SEND-Zustand oder Mail-Fingerprint im Journal ist ungueltig."
      );
    }
    lock = await activeRuntime.acquireLock({
      fingerprint: input.fingerprint,
      holderId: activeJournal.holderId?.() || "injected-test-journal",
      resume: input.resume,
      cleanupOnly: input.operatorReleaseExpired
    });
    assertText(lock?.lockId, "Cluster-Lock-ID", 128, /^[A-Za-z0-9_.:-]+$/u);
    await activeJournal.append("LOCK_ACQUIRED", { lock_uid: lock.lockId });
    if (lock.cleanupOnly === true || input.operatorReleaseExpired) {
      await activeRuntime.cleanupGuestOperator();
      await activeJournal.append("GUEST_OPERATOR_CLEANED", { phase: "cleanup-only" });
      await activeJournal.append("RECOVERY_CLEANUP_COMPLETED", {
        state: ONLINE_ONBOARDING_CLEANUP_STATE
      });
      cleanupOnlyCompleted = true;
    } else {
      if (
        input.resume
        && activeJournal.has("GUEST_OPERATOR_PREPARE_INTENT")
        && !guestCleanupIsCurrent(activeJournal)
      ) {
        await activeRuntime.cleanupGuestOperator();
        await activeJournal.append("GUEST_OPERATOR_CLEANED", { phase: "resume-preflight" });
      }
      if (input.resume) {
        await activeRuntime.preflight({
          fingerprint: input.fingerprint,
          cleanupOnly: false
        });
      }
      if (activeJournal.has("READY_TO_SEND")) {
        const currentSenderPreview = validateSenderPreview(
          (await activeRuntime.previewMailSend()).summary
        );
        if (currentSenderPreview.mail_fingerprint !== mailFingerprint) {
          throw new OnlineOnboardingError(
            "Die versandbereiten Mailartefakte weichen vom READY_TO_SEND-Journal ab."
          );
        }
      } else {
        await prepareAccount({
          runtime: activeRuntime,
          journal: activeJournal,
          accountFingerprint: input.accountFingerprint
        });
        await prepareGuestAccess({
          runtime: activeRuntime,
          journal: activeJournal,
          guestFingerprint: input.guestFingerprint
        });
        mailFingerprint = await prepareInvitationAndMail({
          runtime: activeRuntime,
          journal: activeJournal
        });
      }
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (lock) {
      try {
        await activeRuntime.releaseLock({ lock });
        await activeJournal.append("LOCK_RELEASED", { lock_uid: lock.lockId });
      } catch (releaseError) {
        operationError = releaseError;
      }
    }
    await activeJournal.releaseExecutionLock?.().catch((releaseError) => {
      operationError = releaseError;
    });
  }
  if (operationError) throw operationError;
  if (cleanupOnlyCompleted) {
    const summary = safeSummary({
      apply: true,
      fingerprint: input.fingerprint,
      state: ONLINE_ONBOARDING_CLEANUP_STATE
    });
    log(summary);
    return Object.freeze({
      ready: false,
      mailSent: false,
      cleanupOnly: true,
      summary
    });
  }
  const summary = safeSummary({
    apply: true,
    fingerprint: input.fingerprint,
    ready: true,
    mailFingerprint
  });
  log(summary);
  return Object.freeze({
    ready: true,
    mailSent: false,
    mailFingerprint,
    summary
  });
}

const RESOURCE_OWNER_ANNOTATION = "versorgungs-kompass.de/online-onboarding-holder";
const RESOURCE_FINGERPRINT_ANNOTATION = "versorgungs-kompass.de/online-onboarding-fingerprint";
const OPERATOR_LABELS = Object.freeze({
  "app.kubernetes.io/name": "versorgungs-kompass",
  "app.kubernetes.io/component": "identity-operator"
});

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(String(output || ""));
  } catch {
    throw new OnlineOnboardingError(`${label} lieferte kein gueltiges JSON.`);
  }
}

function protectedProcessEnvironment(additions = {}) {
  const environment = {
    ...process.env,
    CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
    CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK: "1",
    ...additions
  };
  for (const key of [
    "IAP_EXTERNAL_AUTH_API_KEY",
    "PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL",
    "PRE_GEMATIK_ACCESS_TARGET_SHA256",
    "DATABASE_URL",
    "DB_PASSWORD",
    "SMTP_PASSWORD"
  ]) {
    if (!Object.hasOwn(additions, key)) delete environment[key];
  }
  return environment;
}

function ensureSafePathSegment(value, label) {
  assertText(value, label, 128, /^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
  return value;
}

async function writeOwnerOnlyCreateOnly(filePath, contents) {
  const handle = await fs.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function envFileContents(values) {
  return `${Object.keys(values).sort().map((key) => `${key}=${values[key]}`).join("\n")}\n`;
}

function annotateKubernetesDocument(document, holderId, fingerprint) {
  if (!isPlainObject(document) || !isPlainObject(document.metadata)) {
    throw new OnlineOnboardingError("Das Kubernetes-Dokument ist ungueltig.");
  }
  document.metadata.annotations = {
    ...(isPlainObject(document.metadata.annotations) ? document.metadata.annotations : {}),
    [RESOURCE_OWNER_ANNOTATION]: holderId,
    [RESOURCE_FINGERPRINT_ANNOTATION]: fingerprint
  };
  document.metadata.labels = {
    ...(isPlainObject(document.metadata.labels) ? document.metadata.labels : {}),
    ...OPERATOR_LABELS
  };
  return document;
}

function annotateJobManifest(manifest, holderId, fingerprint) {
  const marker = "  labels:\n    app.kubernetes.io/name: versorgungs-kompass\n";
  if (manifest.split(marker).length !== 2) {
    throw new OnlineOnboardingError("Das Operator-Job-Manifest kann nicht sicher gebunden werden.");
  }
  return manifest.replace(
    marker,
    `  annotations:\n`
      + `    ${RESOURCE_OWNER_ANNOTATION}: "${holderId}"\n`
      + `    ${RESOURCE_FINGERPRINT_ANNOTATION}: "${fingerprint}"\n`
      + marker
  );
}

function expectedGkeContext(baseEnvironment) {
  return `gke_${baseEnvironment.GCP_PROJECT_ID}_${baseEnvironment.GKE_LOCATION}_${baseEnvironment.GKE_CLUSTER_NAME}`;
}

export class CommandOnlineOnboardingRuntime {
  constructor(context, { commandRunner = runCommand, now = () => new Date() } = {}) {
    this.context = Object.freeze({ ...context });
    this.commandRunner = commandRunner;
    this.now = now;
    this.holderId = "";
    this.fingerprint = context.fingerprint;
    this.projectNumber = "";
    this.workloadPrincipal = "";
    this.iamConditionTitle = "";
    this.iamConditionExpiry = "";
    this.activeResources = new Map();
    this.accessDirectories = new Set();
    this.phaseCounter = 0;
    this.postEvidencePath = "";
  }

  async command(command, argumentsList, options = {}) {
    return this.commandRunner(command, argumentsList, {
      cwd: this.context.repository,
      env: protectedProcessEnvironment(),
      ...options
    });
  }

  async nodeScript(relativeScript, argumentsList, { environment = {}, timeoutMs } = {}) {
    const result = await this.command(
      process.execPath,
      [path.join(this.context.repository, relativeScript), ...argumentsList],
      {
        label: `Geschuetzter ${path.basename(relativeScript)}-Aufruf`,
        env: protectedProcessEnvironment(environment),
        ...(timeoutMs ? { timeoutMs } : {})
      }
    );
    return result.stdout.trim();
  }

  async gcloud(argumentsList, { label = "GCP-Operation", timeoutMs = 120_000 } = {}) {
    return this.command("gcloud", argumentsList, { label, timeoutMs });
  }

  async kubectl(argumentsList, {
    label = "Kubernetes-Operation",
    timeoutMs = 120_000,
    input = "",
    acceptedExitCodes = [0]
  } = {}) {
    return this.command("kubectl", argumentsList, {
      label,
      timeoutMs,
      input,
      acceptedExitCodes
    });
  }

  async preflight({ cleanupOnly = false } = {}) {
    if (typeof cleanupOnly !== "boolean") {
      throw new OnlineOnboardingError("Der Preflight-Modus ist ungueltig.");
    }
    const { baseEnvironment, operatorRelease, repository } = this.context;
    if (!cleanupOnly) {
      await this.command("git", ["cat-file", "-e", `${operatorRelease.source_commit}^{commit}`], {
        cwd: repository,
        label: "Operator-Quellcommit-Readback"
      });
      for (const sourcePath of OPERATOR_SOURCE_PATHS) {
        await this.command(
          "git",
          ["cat-file", "-e", `${operatorRelease.source_commit}:${sourcePath}`],
          {
            cwd: repository,
            label: "Operator-Quelldatei-Readback"
          }
        );
      }
      const sourceDiff = await this.command(
        "git",
        ["diff", "--quiet", operatorRelease.source_commit, "--", ...OPERATOR_SOURCE_PATHS],
        {
          cwd: repository,
          label: "Operator-Quellstand-Bindung",
          acceptedExitCodes: [0, 1]
        }
      );
      if (sourceDiff.exitCode !== 0) {
        throw new OnlineOnboardingError("Der lokale Operator-Quellvertrag weicht vom freigegebenen Release ab.");
      }
      const sourceStatus = await this.command(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all", "--", ...OPERATOR_SOURCE_PATHS],
        {
          cwd: repository,
          label: "Operator-Quellstand-Status"
        }
      );
      if (sourceStatus.stdout.trim() !== "") {
        throw new OnlineOnboardingError("Der lokale Operator-Quellvertrag enthaelt nicht freigegebene Arbeitskopie-Aenderungen.");
      }
    }

    const configuredProject = (await this.gcloud(
      ["config", "get-value", "project", "--quiet"],
      { label: "Aktives GCP-Projekt" }
    )).stdout.trim();
    if (configuredProject !== baseEnvironment.GCP_PROJECT_ID) {
      throw new OnlineOnboardingError("Das aktive gcloud-Projekt ist nicht das bestaetigte Zielprojekt.");
    }
    const project = parseJsonOutput((await this.gcloud([
      "projects", "describe", baseEnvironment.GCP_PROJECT_ID, "--format=json"
    ], { label: "GCP-Projekt-Readback" })).stdout, "GCP-Projekt-Readback");
    if (
      project.projectId !== baseEnvironment.GCP_PROJECT_ID
      || !/^\d+$/u.test(String(project.projectNumber || ""))
      || project.lifecycleState !== "ACTIVE"
    ) {
      throw new OnlineOnboardingError("Das GCP-Zielprojekt ist nicht aktiv oder nicht exakt gebunden.");
    }
    this.projectNumber = String(project.projectNumber);
    this.workloadPrincipal =
      `principal://iam.googleapis.com/projects/${this.projectNumber}/locations/global/`
      + `workloadIdentityPools/${baseEnvironment.GCP_PROJECT_ID}.svc.id.goog/subject/`
      + `ns/${baseEnvironment.K8S_NAMESPACE}/sa/${SERVICE_ACCOUNT}`;

    const cluster = parseJsonOutput((await this.gcloud([
      "container", "clusters", "describe", baseEnvironment.GKE_CLUSTER_NAME,
      `--location=${baseEnvironment.GKE_LOCATION}`,
      `--project=${baseEnvironment.GCP_PROJECT_ID}`,
      "--format=json"
    ], { label: "GKE-Cluster-Readback" })).stdout, "GKE-Cluster-Readback");
    const gkeDnsEndpoint = cluster.controlPlaneEndpointsConfig?.dnsEndpointConfig?.endpoint;
    if (
      cluster.name !== baseEnvironment.GKE_CLUSTER_NAME
      || cluster.location !== baseEnvironment.GKE_LOCATION
      || cluster.status !== "RUNNING"
      || typeof gkeDnsEndpoint !== "string"
      || gkeDnsEndpoint.length === 0
      || typeof cluster.masterAuth?.clusterCaCertificate !== "string"
      || cluster.masterAuth.clusterCaCertificate.length === 0
    ) {
      throw new OnlineOnboardingError("Der bestaetigte GKE-Cluster ist nicht laufend oder nicht exakt gebunden.");
    }

    const currentContext = (await this.kubectl(
      ["config", "current-context"],
      { label: "Kubernetes-Kontext-Readback" }
    )).stdout.trim();
    if (currentContext !== expectedGkeContext(baseEnvironment)) {
      throw new OnlineOnboardingError("Der aktive Kubernetes-Kontext ist nicht der bestaetigte GKE-Cluster.");
    }
    const kubeTargetTemplate =
      '{.clusters[0].cluster.server}{"\\n"}'
      + '{.clusters[0].cluster.certificate-authority-data}{"\\n"}'
      + '{.clusters[0].cluster.certificate-authority}{"\\n"}'
      + '{.clusters[0].cluster.insecure-skip-tls-verify}{"\\n"}'
      + '{.clusters[0].cluster.tls-server-name}{"\\n"}'
      + '{.clusters[0].cluster.proxy-url}{"\\n"}'
      + '{"END\\n"}';
    const kubeTarget = (await this.kubectl([
      "config", "view", "--minify", "--raw",
      "-o", `jsonpath=${kubeTargetTemplate}`
    ], { label: "Kubernetes-DNS-und-TLS-Readback" })).stdout.trimEnd().split("\n");
    const expectedKubernetesServer = gkeDnsEndpoint.startsWith("https://")
      ? gkeDnsEndpoint
      : `https://${gkeDnsEndpoint}`;
    if (
      kubeTarget.length !== 7
      || kubeTarget[6] !== "END"
      || kubeTarget[0] !== expectedKubernetesServer
      || kubeTarget[1] !== ""
      || kubeTarget[2] !== ""
      || !["", "false"].includes(kubeTarget[3])
      || kubeTarget[4] !== ""
      || kubeTarget[5] !== ""
    ) {
      throw new OnlineOnboardingError(
        "Kubernetes-DNS-Endpunkt oder TLS-Vertrauenskonfiguration weicht vom GKE-Readback ab."
      );
    }
    const namespace = parseJsonOutput((await this.kubectl([
      "get", "namespace", baseEnvironment.K8S_NAMESPACE, "-o", "json"
    ], { label: "Kubernetes-Namespace-Readback" })).stdout, "Kubernetes-Namespace-Readback");
    if (namespace.metadata?.name !== baseEnvironment.K8S_NAMESPACE) {
      throw new OnlineOnboardingError("Der Kubernetes-Namespace ist nicht exakt gebunden.");
    }

    const instance = parseJsonOutput((await this.gcloud([
      "sql", "instances", "describe", baseEnvironment.cloudSqlInstance,
      `--project=${baseEnvironment.GCP_PROJECT_ID}`,
      "--format=json"
    ], { label: "Cloud-SQL-Instanz-Readback" })).stdout, "Cloud-SQL-Instanz-Readback");
    if (
      instance.name !== baseEnvironment.cloudSqlInstance
      || instance.connectionName !== baseEnvironment.CLOUD_SQL_INSTANCE_CONNECTION_NAME
      || instance.region !== baseEnvironment.GCP_REGION
      || instance.state !== "RUNNABLE"
      || instance.databaseVersion !== "POSTGRES_16"
    ) {
      throw new OnlineOnboardingError("Die Cloud-SQL-Zielinstanz ist nicht exakt laufend gebunden.");
    }
    if (!cleanupOnly) {
      const invitationBucket = parseJsonOutput((await this.gcloud([
        "storage", "buckets", "describe",
        `gs://${operatorRelease.invitation_bucket}`,
        "--raw",
        "--format=json"
      ], { label: "Privater Einladungs-Bucket-Readback" })).stdout, "Einladungs-Bucket-Readback");
      if (
        invitationBucket.name !== operatorRelease.invitation_bucket
        || String(invitationBucket.projectNumber || "") !== this.projectNumber
        || String(invitationBucket.location || "").toLowerCase()
          !== baseEnvironment.GCP_REGION.toLowerCase()
        || invitationBucket.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
        || invitationBucket.iamConfiguration?.publicAccessPrevention !== "enforced"
        || invitationBucket.versioning?.enabled === true
        || String(invitationBucket.softDeletePolicy?.retentionDurationSeconds || "0") !== "0"
        || invitationBucket.retentionPolicy != null
      ) {
        throw new OnlineOnboardingError(
          "Der Einladungs-Bucket ist nicht privat, zielgebunden oder fuer einmalige Einladungen konfiguriert."
        );
      }
      await this.gcloud([
        "artifacts", "docker", "images", "describe", operatorRelease.image,
        `--project=${baseEnvironment.GCP_PROJECT_ID}`,
        "--format=none"
      ], { label: "Operator-Image-Digest-Readback" });

      for (const [kind, name, manifestPath] of [
        ["serviceaccount", SERVICE_ACCOUNT, "deploy/migration-operator/serviceaccount.yaml"],
        ["networkpolicy", NETWORK_POLICY, "deploy/migration-operator/networkpolicy.yaml"]
      ]) {
        const metadata = await this.resourceMetadata(kind, name);
        if (metadata && !await this.staticResourceMatchesManifest(kind, name, manifestPath)) {
          throw new OnlineOnboardingError(`${kind}/${name} weicht vom freigegebenen Vertrag ab.`);
        }
      }
    }
    return Object.freeze({ ok: true });
  }

  async resourceMetadata(kind, name) {
    ensureSafePathSegment(kind, "Kubernetes-Ressourcentyp");
    ensureSafePathSegment(name, "Kubernetes-Ressourcenname");
    const template =
      '{{.metadata.uid}}{{"\\n"}}'
      + `{{index .metadata.annotations "${RESOURCE_OWNER_ANNOTATION}"}}{{"\\n"}}`
      + `{{index .metadata.annotations "${RESOURCE_FINGERPRINT_ANNOTATION}"}}{{"\\n"}}`;
    const result = await this.kubectl([
      "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
      "get", kind, name,
      "--ignore-not-found",
      "-o", `go-template=${template}`
    ], { label: `${kind}-Metadaten-Readback` });
    if (!result.stdout.trim()) return null;
    const [uid, holderId = "<no value>", fingerprint = "<no value>"] = result.stdout.trimEnd().split("\n");
    assertText(uid, "Kubernetes-Ressourcen-UID", 128, /^[A-Za-z0-9_.:-]+$/u);
    return Object.freeze({
      uid,
      holderId: holderId === "<no value>" ? "" : holderId,
      fingerprint: fingerprint === "<no value>" ? "" : fingerprint
    });
  }

  async staticResourceMatchesManifest(kind, name, relativePath) {
    ensureSafePathSegment(kind, "Kubernetes-Ressourcentyp");
    ensureSafePathSegment(name, "Kubernetes-Ressourcenname");
    const manifestPath = path.join(this.context.repository, relativePath);
    const expected = parseJsonOutput((await this.kubectl([
      "create", "--dry-run=client", `--filename=${manifestPath}`, "-o", "json"
    ], { label: `${kind}-Sollvertrag-Readback` })).stdout, `${kind}-Sollvertrag-Readback`);
    const actual = parseJsonOutput((await this.kubectl([
      "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
      "get", kind, name, "-o", "json"
    ], { label: `${kind}-Istvertrag-Readback` })).stdout, `${kind}-Istvertrag-Readback`);
    return staticKubernetesResourceContractsEqual(expected, actual);
  }

  async acquireLock({ fingerprint, holderId, resume, cleanupOnly = false }) {
    assertText(holderId, "Cluster-Lock-Holder", 64, /^[A-Za-z0-9_.:-]+$/u);
    if (typeof resume !== "boolean" || typeof cleanupOnly !== "boolean") {
      throw new OnlineOnboardingError("Der Cluster-Lock-Modus ist ungueltig.");
    }
    this.holderId = holderId;
    const namespace = this.context.baseEnvironment.K8S_NAMESPACE;
    const conditionTitle = `vk_online_${holderId.replaceAll("-", "")}`;
    const conditionExpiry = new Date(
      this.now().getTime() + TEMPORARY_IAM_MAXIMUM_MS
    ).toISOString();
    if (!cleanupOnly) {
      try {
        const created = await this.kubectl([
          "--namespace", namespace,
          "create", "configmap", RUN_LOCK,
          `--from-literal=operation=${ONLINE_ONBOARDING_OPERATION}`,
          `--from-literal=fingerprint=${fingerprint}`,
          `--from-literal=holder=${holderId}`,
          `--from-literal=iam_condition_title=${conditionTitle}`,
          `--from-literal=iam_condition_expiry=${conditionExpiry}`,
          "-o", "jsonpath={.metadata.uid}"
        ], { label: "Clusterweiter Onboarding-Lock" });
        const lockId = created.stdout.trim();
        assertText(lockId, "Cluster-Lock-UID", 128, /^[A-Za-z0-9_.:-]+$/u);
        this.iamConditionTitle = conditionTitle;
        this.iamConditionExpiry = conditionExpiry;
        return Object.freeze({ lockId, reused: false, cleanupOnly: false });
      } catch (error) {
        if (!(error instanceof CommandExecutionError) && error?.code !== "COMMAND_FAILED") {
          throw error;
        }
      }
    }
    const existing = parseJsonOutput((await this.kubectl([
      "--namespace", namespace, "get", "configmap", RUN_LOCK, "-o", "json"
    ], { label: "Cluster-Lock-Readback" })).stdout, "Cluster-Lock-Readback");
    const creationTime = Date.parse(existing.metadata?.creationTimestamp);
    const expiryTime = Date.parse(existing.data?.iam_condition_expiry);
    if (
      !resume
      || existing.data?.operation !== ONLINE_ONBOARDING_OPERATION
      || existing.data?.fingerprint !== fingerprint
      || existing.data?.holder !== holderId
      || existing.data?.iam_condition_title !== conditionTitle
      || !Number.isFinite(creationTime)
      || !Number.isFinite(expiryTime)
      || expiryTime <= creationTime
      || expiryTime > creationTime + TEMPORARY_IAM_MAXIMUM_MS
      || !existing.metadata?.uid
    ) {
      throw new OnlineOnboardingError("Ein anderer oder nicht sicher fortsetzbarer Onboarding-Lauf haelt den Cluster-Lock.");
    }
    this.iamConditionTitle = existing.data.iam_condition_title;
    this.iamConditionExpiry = existing.data.iam_condition_expiry;
    return Object.freeze({
      lockId: existing.metadata.uid,
      reused: true,
      cleanupOnly: cleanupOnly
        || expiryTime <= this.now().getTime() + TEMPORARY_IAM_MINIMUM_REMAINING_MS
    });
  }

  async releaseLock({ lock }) {
    const namespace = this.context.baseEnvironment.K8S_NAMESPACE;
    if (
      await this.resourceMetadata("job", JOB_NAME)
      || await this.resourceMetadata("secret", INPUT_SECRET)
      || await this.resourceMetadata("secret", ENVIRONMENT_SECRET)
      || (await this.listAccessOperatorDirectories()).length > 0
      || (await this.listPendingAccessOperatorDirectories()).length > 0
    ) {
      throw new OnlineOnboardingError(
        "Der Cluster-Lock bleibt wegen nicht vollstaendig bereinigter Operator-Ressourcen bestehen."
      );
    }
    const iamPolicy = await this.readProjectIamPolicy();
    if (TEMPORARY_IAM_ROLES.some((role) => this.temporaryRoleBindings(iamPolicy, role).length > 0)) {
      throw new OnlineOnboardingError(
        "Der Cluster-Lock bleibt wegen nicht vollstaendig bereinigter IAM-Rollen bestehen."
      );
    }
    const existing = parseJsonOutput((await this.kubectl([
      "--namespace", namespace, "get", "configmap", RUN_LOCK, "-o", "json"
    ], { label: "Cluster-Lock-Abschlussreadback" })).stdout, "Cluster-Lock-Abschlussreadback");
    if (
      existing.metadata?.uid !== lock.lockId
      || existing.data?.fingerprint !== this.fingerprint
      || existing.data?.holder !== this.holderId
      || existing.data?.operation !== ONLINE_ONBOARDING_OPERATION
      || existing.data?.iam_condition_title !== this.iamConditionTitle
      || existing.data?.iam_condition_expiry !== this.iamConditionExpiry
    ) {
      throw new OnlineOnboardingError("Der Cluster-Lock darf nicht als fremde Ressource geloescht werden.");
    }
    await this.kubectl([
      "--namespace", namespace, "delete", "configmap", RUN_LOCK,
      "--wait=true", "--timeout=60s"
    ], { label: "Cluster-Lock-Cleanup" });
    const absent = await this.kubectl([
      "--namespace", namespace, "get", "configmap", RUN_LOCK,
      "--ignore-not-found", "-o", "name"
    ], { label: "Cluster-Lock-Cleanup-Readback" });
    if (absent.stdout.trim()) throw new OnlineOnboardingError("Der Cluster-Lock wurde nicht vollstaendig entfernt.");
  }

  accountEnvironment() {
    return this.context.identityReadbackEnvironment;
  }

  async previewAccount({ recovery = false } = {}) {
    return this.nodeScript(
      "scripts/provision_pre_gematik_identity_platform_account.mjs",
      [
        "--input", this.context.accountInput,
        ...(recovery ? ["--recover-link-only"] : [])
      ],
      { environment: this.accountEnvironment(), timeoutMs: 120_000 }
    );
  }

  async applyAccount({ recovery = false, outputPath = "" } = {}) {
    const operation = recovery
      ? IDENTITY_ACCOUNT_RECOVERY_OPERATION
      : IDENTITY_ACCOUNT_CREATE_OPERATION;
    const targetOutput = outputPath || path.join(
      this.context.runDirectory,
      recovery
        ? "native-password-reset-link-recovery-do-not-send.txt"
        : "native-password-reset-link-do-not-send.txt"
    );
    const summary = await this.nodeScript(
      "scripts/provision_pre_gematik_identity_platform_account.mjs",
      [
        "--input", this.context.accountInput,
        "--output", targetOutput,
        ...(recovery ? ["--recover-link-only"] : []),
        "--apply",
        "--confirm-environment", EXPECTED_ENVIRONMENT,
        "--confirm-project", this.context.baseEnvironment.GCP_PROJECT_ID,
        "--confirm-operation", operation,
        "--confirm-fingerprint", this.context.accountFingerprint
      ],
      { environment: this.accountEnvironment(), timeoutMs: 180_000 }
    );
    validateAccountApply(summary, this.context.accountFingerprint, { recovery });
    await this.removeGeneratedNativeLink(path.basename(targetOutput));
    return summary;
  }

  async resolveUnknownAccount() {
    try {
      const summary = await this.previewAccount({ recovery: true });
      validateAccountPreview(summary, this.context.accountFingerprint, { recovery: true });
      await this.removeGeneratedNativeLink("native-password-reset-link-do-not-send.txt");
      await this.removeGeneratedNativeLink("native-password-reset-link-recovery-do-not-send.txt");
      return Object.freeze({ state: "present", summary });
    } catch (recoveryError) {
      if (!(recoveryError instanceof CommandExecutionError)) throw recoveryError;
    }
    try {
      const summary = await this.previewAccount();
      validateAccountPreview(summary, this.context.accountFingerprint);
      return Object.freeze({ state: "absent", summary });
    } catch {
      throw new OnlineOnboardingError(
        "Der unbekannte Account-Apply-Ausgang ist weder als exakter Bestand noch als sicher leer nachweisbar."
      );
    }
  }

  async ensureStaticResources() {
    for (const [kind, name, relativePath] of [
      ["serviceaccount", SERVICE_ACCOUNT, "deploy/migration-operator/serviceaccount.yaml"],
      ["networkpolicy", NETWORK_POLICY, "deploy/migration-operator/networkpolicy.yaml"]
    ]) {
      const existing = await this.resourceMetadata(kind, name);
      if (existing) {
        if (!await this.staticResourceMatchesManifest(kind, name, relativePath)) {
          throw new OnlineOnboardingError(`${kind}/${name} weicht vom freigegebenen Vertrag ab.`);
        }
      } else {
        await this.kubectl(
          ["create", `--filename=${path.join(this.context.repository, relativePath)}`],
          { label: `${kind}-Create-only-Bereitstellung` }
        );
        if (!await this.resourceMetadata(kind, name)) {
          throw new OnlineOnboardingError(`${kind}/${name} wurde nicht create-only bereitgestellt.`);
        }
        if (!await this.staticResourceMatchesManifest(kind, name, relativePath)) {
          throw new OnlineOnboardingError(`${kind}/${name} ist nach Create nicht vertragstreu.`);
        }
      }
    }
  }

  async readProjectIamPolicy() {
    return parseJsonOutput((await this.gcloud([
      "projects", "get-iam-policy", this.context.baseEnvironment.GCP_PROJECT_ID,
      "--format=json"
    ], { label: "Projekt-IAM-Readback" })).stdout, "Projekt-IAM-Readback");
  }

  temporaryRoleBindings(policy, role) {
    if (!Array.isArray(policy?.bindings)) return [];
    return policy.bindings.filter((binding) => (
      binding?.role === role
      && Array.isArray(binding.members)
      && binding.members.includes(this.workloadPrincipal)
    ));
  }

  iamConditionArgument() {
    if (!this.iamConditionTitle || !this.iamConditionExpiry) {
      throw new OnlineOnboardingError("Die zeitlich begrenzte IAM-Bindung ist nicht an den Lauf gebunden.");
    }
    return [
      `expression=request.time < timestamp('${this.iamConditionExpiry}')`,
      `title=${this.iamConditionTitle}`,
      "description=Versorgungs-Kompass Online-Onboarding; maximal 24 Stunden"
    ].join(",");
  }

  conditionMatchesRun(binding) {
    return binding?.condition?.title === this.iamConditionTitle
      && binding?.condition?.expression
        === `request.time < timestamp('${this.iamConditionExpiry}')`;
  }

  async addTemporaryIamRoles() {
    if (!this.workloadPrincipal) {
      throw new OnlineOnboardingError("Der Workload-Identity-Principal wurde nicht vorgeprueft.");
    }
    const before = await this.readProjectIamPolicy();
    if (TEMPORARY_IAM_ROLES.some((role) => this.temporaryRoleBindings(before, role).length > 0)) {
      throw new OnlineOnboardingError("Eine temporaere Operator-IAM-Rolle bestand bereits vor diesem Lauf.");
    }
    for (const role of TEMPORARY_IAM_ROLES) {
      await this.gcloud([
        "projects", "add-iam-policy-binding", this.context.baseEnvironment.GCP_PROJECT_ID,
        `--member=${this.workloadPrincipal}`,
        `--role=${role}`,
        `--condition=${this.iamConditionArgument()}`,
        "--quiet",
        "--format=none"
      ], { label: "Temporaere Operator-IAM-Bindung" });
    }
    const after = await this.readProjectIamPolicy();
    if (!TEMPORARY_IAM_ROLES.every((role) => {
      const bindings = this.temporaryRoleBindings(after, role);
      return bindings.length === 1 && this.conditionMatchesRun(bindings[0]);
    })) {
      throw new OnlineOnboardingError("Die temporaeren Operator-IAM-Rollen sind nicht vollstaendig nachgewiesen.");
    }
  }

  async removeTemporaryIamRoles() {
    if (!this.workloadPrincipal) return;
    const policy = await this.readProjectIamPolicy();
    const errors = [];
    for (const role of TEMPORARY_IAM_ROLES) {
      const bindings = this.temporaryRoleBindings(policy, role);
      if (bindings.some((binding) => !this.conditionMatchesRun(binding))) {
        errors.push(new OnlineOnboardingError("Eine temporaere IAM-Rolle gehoert nicht sicher zu diesem Lauf."));
        continue;
      }
      if (bindings.length === 0) continue;
      await this.gcloud([
        "projects", "remove-iam-policy-binding", this.context.baseEnvironment.GCP_PROJECT_ID,
        `--member=${this.workloadPrincipal}`,
        `--role=${role}`,
        `--condition=${this.iamConditionArgument()}`,
        "--quiet",
        "--format=none"
      ], { label: "Temporaerer Operator-IAM-Cleanup" }).catch((error) => errors.push(error));
    }
    await (async () => {
      const after = await this.readProjectIamPolicy();
      if (TEMPORARY_IAM_ROLES.some((role) => this.temporaryRoleBindings(after, role).length > 0)) {
        throw new OnlineOnboardingError("Mindestens eine temporaere Operator-IAM-Rolle ist noch vorhanden.");
      }
    })().catch((error) => errors.push(error));
    if (errors.length > 0) throw errors[0];
  }

  async listAccessOperatorDirectories() {
    const entries = await fs.readdir(this.context.runDirectory, { withFileTypes: true });
    const matching = entries.filter((entry) => /^access-operator-\d{3}$/u.test(entry.name));
    if (matching.some((entry) => !entry.isDirectory())) {
      throw new OnlineOnboardingError("Ein Access-Operator-Pfad ist kein sicheres Verzeichnis.");
    }
    return matching.map((entry) => path.join(this.context.runDirectory, entry.name)).sort();
  }

  async listPendingAccessOperatorDirectories() {
    const entries = await fs.readdir(this.context.runDirectory, { withFileTypes: true });
    const matching = entries.filter((entry) => (
      /^access-operator-\d{3}\.pending-[a-f0-9-]{36}$/u.test(entry.name)
    ));
    if (matching.some((entry) => !entry.isDirectory())) {
      throw new OnlineOnboardingError("Ein unvollstaendiger Access-Operator-Pfad ist kein sicheres Verzeichnis.");
    }
    return matching.map((entry) => path.join(this.context.runDirectory, entry.name)).sort();
  }

  async removePendingAccessOperatorDirectory(directory) {
    const resolvedRunDirectory = path.resolve(this.context.runDirectory);
    const resolvedDirectory = path.resolve(directory);
    const metadata = await fs.lstat(resolvedDirectory);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
    if (
      path.dirname(resolvedDirectory) !== resolvedRunDirectory
      || !/^access-operator-\d{3}\.pending-[a-f0-9-]{36}$/u.test(path.basename(resolvedDirectory))
      || metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || metadata.uid !== currentUid
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    ) {
      throw new OnlineOnboardingError("Das unvollstaendige Access-Operator-Verzeichnis ist nicht sicher gebunden.");
    }
    await fs.rm(resolvedDirectory, { recursive: true, force: false });
    await syncDirectory(resolvedRunDirectory);
  }

  async accessOperatorLogin(directory) {
    const filePath = path.join(directory, "test-access-operator-name.txt");
    const metadata = await fs.lstat(filePath);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
    if (
      metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.uid !== currentUid
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    ) {
      throw new OnlineOnboardingError("Die gepinnte Access-Operator-Namensdatei ist nicht owner-only.");
    }
    const login = (await fs.readFile(filePath, "utf8")).trim();
    assertText(login, "Access-Operator-Login", 96, /^vk_access_operator_[0-9]{8}_[a-f0-9]{10}$/u);
    return login;
  }

  async listCloudSqlUser(login) {
    assertText(login, "Access-Operator-Login", 96, /^vk_access_operator_[0-9]{8}_[a-f0-9]{10}$/u);
    const output = await this.gcloud([
      "sql", "users", "list",
      `--project=${this.context.baseEnvironment.GCP_PROJECT_ID}`,
      `--instance=${this.context.baseEnvironment.cloudSqlInstance}`,
      `--filter=name=${login}`,
      "--format=json"
    ], { label: "Kurzlebiger Cloud-SQL-Login-Readback" });
    const users = parseJsonOutput(output.stdout, "Kurzlebiger Cloud-SQL-Login-Readback");
    if (
      !Array.isArray(users)
      || users.length > 1
      || users.some((user) => !this.accessOperatorCloudSqlUserIdentityMatchesContract(user, login))
    ) {
      throw new OnlineOnboardingError("Der kurzlebige Cloud-SQL-Login ist nicht eindeutig.");
    }
    return users;
  }

  async describeCloudSqlUser(login) {
    assertText(login, "Access-Operator-Login", 96, /^vk_access_operator_[0-9]{8}_[a-f0-9]{10}$/u);
    const output = await this.gcloud([
      "sql", "users", "describe", login,
      `--project=${this.context.baseEnvironment.GCP_PROJECT_ID}`,
      `--instance=${this.context.baseEnvironment.cloudSqlInstance}`,
      "--format=json"
    ], { label: "Kurzlebiger Cloud-SQL-Login-Detailreadback" });
    return parseJsonOutput(output.stdout, "Kurzlebiger Cloud-SQL-Login-Detailreadback");
  }

  accessOperatorCloudSqlUserIdentityMatchesContract(user, login) {
    return (
      isPlainObject(user)
      && user.kind === "sql#user"
      && user.name === login
      && user.host === ""
      && user.instance === this.context.baseEnvironment.cloudSqlInstance
      && user.project === this.context.baseEnvironment.GCP_PROJECT_ID
      && (!Object.hasOwn(user, "type") || user.type === "BUILT_IN")
      && (
        !Object.hasOwn(user, "iamStatus")
        || user.iamStatus === "IAM_STATUS_UNSPECIFIED"
      )
    );
  }

  accessOperatorCloudSqlUserMatchesContract(user, login) {
    return (
      this.accessOperatorCloudSqlUserIdentityMatchesContract(user, login)
      && Array.isArray(user.databaseRoles)
      && user.databaseRoles.length === 1
      && user.databaseRoles[0] === "vk_access_enrollment_admin"
    );
  }

  accessOperatorLoginFingerprint(login) {
    return sha256(`versorgungs-kompass-cloud-sql-access-operator-v1\0${login}`);
  }

  async readAccessOperatorMarker(directory, fileName, keys, label) {
    const filePath = path.join(directory, fileName);
    try {
      await assertOwnerOnlyJournalFile(filePath, label);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    let marker;
    try {
      marker = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      throw new OnlineOnboardingError(`${label} ist ungueltig.`);
    }
    assertExactKeys(marker, keys, label);
    return Object.freeze(marker);
  }

  async writeAccessOperatorMarker(directory, fileName, marker) {
    await writeOwnerOnlyCreateOnly(
      path.join(directory, fileName),
      `${JSON.stringify(marker, null, 2)}\n`
    );
    await syncDirectory(directory);
  }

  validateCloudSqlCreateOperation(operation, expectedName = "") {
    if (!isPlainObject(operation)) {
      throw new OnlineOnboardingError("Die Cloud-SQL-Create-Operation ist ungueltig.");
    }
    assertText(operation.name, "Cloud-SQL-Operation-ID", 256, /^[A-Za-z0-9_.:-]+$/u);
    if (
      (expectedName && operation.name !== expectedName)
      || operation.operationType !== "CREATE_USER"
      || operation.targetProject !== this.context.baseEnvironment.GCP_PROJECT_ID
      || operation.targetId !== this.context.baseEnvironment.cloudSqlInstance
      || !["PENDING", "RUNNING", "DONE"].includes(operation.status)
      || (
        operation.error != null
        && (
          !isPlainObject(operation.error)
          || !Array.isArray(operation.error.errors)
        )
      )
    ) {
      throw new OnlineOnboardingError("Die Cloud-SQL-Create-Operation ist nicht exakt zielgebunden.");
    }
    return Object.freeze({
      name: operation.name,
      status: operation.status,
      failed: (operation.error?.errors?.length || 0) > 0
    });
  }

  async waitForCloudSqlCreateOperation(operationName, { allowFailure = false } = {}) {
    assertText(operationName, "Cloud-SQL-Operation-ID", 256, /^[A-Za-z0-9_.:-]+$/u);
    await this.gcloud([
      "sql", "operations", "wait", operationName,
      `--project=${this.context.baseEnvironment.GCP_PROJECT_ID}`,
      "--timeout=240",
      "--format=none"
    ], {
      label: "Cloud-SQL-Create-Operation-Wartephase",
      timeoutMs: CLOUD_SQL_OPERATION_TIMEOUT_MS
    }).catch((error) => {
      if (!(error instanceof CommandExecutionError)) throw error;
    });
    const described = parseJsonOutput((await this.gcloud([
      "sql", "operations", "describe", operationName,
      `--project=${this.context.baseEnvironment.GCP_PROJECT_ID}`,
      "--format=json"
    ], { label: "Cloud-SQL-Create-Operation-Readback" })).stdout,
    "Cloud-SQL-Create-Operation-Readback");
    const operation = this.validateCloudSqlCreateOperation(described, operationName);
    if (operation.status !== "DONE") {
      throw new OnlineOnboardingError(
        "Die Cloud-SQL-Create-Operation besitzt noch keinen terminalen Zustand."
      );
    }
    if (operation.failed && !allowFailure) {
      throw new OnlineOnboardingError("Die Cloud-SQL-Create-Operation ist fehlgeschlagen.");
    }
    return operation;
  }

  validateAccessOperatorIntent(marker, login) {
    if (!marker) return;
    if (
      marker.version !== 1
      || marker.project_id !== this.context.baseEnvironment.GCP_PROJECT_ID
      || marker.instance !== this.context.baseEnvironment.cloudSqlInstance
      || marker.login_fingerprint !== this.accessOperatorLoginFingerprint(login)
    ) {
      throw new OnlineOnboardingError("Der Cloud-SQL-Create-Intent ist nicht exakt gebunden.");
    }
  }

  validateAccessOperatorOperationMarker(marker, login) {
    if (!marker) return;
    assertText(marker.operation_id, "Cloud-SQL-Operation-ID", 256, /^[A-Za-z0-9_.:-]+$/u);
    if (
      marker.version !== 1
      || marker.project_id !== this.context.baseEnvironment.GCP_PROJECT_ID
      || marker.instance !== this.context.baseEnvironment.cloudSqlInstance
      || marker.login_fingerprint !== this.accessOperatorLoginFingerprint(login)
    ) {
      throw new OnlineOnboardingError("Der Cloud-SQL-Create-Operationsanker ist nicht exakt gebunden.");
    }
  }

  async createAccessOperator() {
    const existingDirectories = await this.listAccessOperatorDirectories();
    const nextIndex = existingDirectories.reduce(
      (maximum, directory) => Math.max(maximum, Number(path.basename(directory).slice(-3))),
      0
    ) + 1;
    if (nextIndex > 999) throw new OnlineOnboardingError("Zu viele Access-Operator-Versuche im Laufverzeichnis.");
    const directory = path.join(
      this.context.runDirectory,
      `access-operator-${String(nextIndex).padStart(3, "0")}`
    );
    const pendingDirectory = `${directory}.pending-${crypto.randomUUID()}`;
    let published = false;
    await fs.mkdir(pendingDirectory, { mode: 0o700 });
    await fs.chmod(pendingDirectory, 0o700);
    try {
      await this.nodeScript(
        "scripts/prepare_pre_gematik_test_access_operator.mjs",
        [
          "--output-directory", pendingDirectory,
          "--project", this.context.baseEnvironment.GCP_PROJECT_ID,
          "--instance", this.context.baseEnvironment.cloudSqlInstance,
          "--database", TARGET_DATABASE
        ]
      );
      const login = await this.accessOperatorLogin(pendingDirectory);
      await fs.rename(pendingDirectory, directory);
      await syncDirectory(this.context.runDirectory);
      published = true;
      this.accessDirectories.add(directory);
      const before = await this.listCloudSqlUser(login);
      if (before.length !== 0) {
        throw new OnlineOnboardingError("Der create-only Access-Operator-Login existiert bereits.");
      }
      const loginFingerprint = this.accessOperatorLoginFingerprint(login);
      await this.writeAccessOperatorMarker(directory, CLOUD_SQL_CREATE_INTENT_FILE, {
        version: 1,
        project_id: this.context.baseEnvironment.GCP_PROJECT_ID,
        instance: this.context.baseEnvironment.cloudSqlInstance,
        login_fingerprint: loginFingerprint
      });
      const createOperation = this.validateCloudSqlCreateOperation(parseJsonOutput((await this.gcloud([
        "sql", "users", "create", login,
        `--flags-file=${path.join(directory, "test-access-operator-create-user-flags.json")}`,
        "--async",
        "--format=json"
      ], { label: "Kurzlebiger Cloud-SQL-Login", timeoutMs: 120_000 })).stdout,
      "Cloud-SQL-Create-Operation"));
      await this.writeAccessOperatorMarker(directory, CLOUD_SQL_CREATE_OPERATION_FILE, {
        version: 1,
        project_id: this.context.baseEnvironment.GCP_PROJECT_ID,
        instance: this.context.baseEnvironment.cloudSqlInstance,
        login_fingerprint: loginFingerprint,
        operation_id: createOperation.name
      });
      await this.waitForCloudSqlCreateOperation(createOperation.name);
      const users = await this.listCloudSqlUser(login);
      if (
        users.length !== 1
        || users[0]?.name !== login
        || users[0]?.kind !== "sql#user"
        || users[0]?.host !== ""
        || users[0]?.instance !== this.context.baseEnvironment.cloudSqlInstance
        || users[0]?.project !== this.context.baseEnvironment.GCP_PROJECT_ID
      ) {
        throw new OnlineOnboardingError("Der kurzlebige Cloud-SQL-Login ist nicht exakt zielgebunden.");
      }
      const user = await this.describeCloudSqlUser(login);
      if (!this.accessOperatorCloudSqlUserMatchesContract(user, login)) {
        throw new OnlineOnboardingError(
          "Der kurzlebige Cloud-SQL-Login hat nicht exakt die freigegebene Rolle."
        );
      }
      return Object.freeze({ directory, login });
    } catch (error) {
      if (!published) {
        await this.removePendingAccessOperatorDirectory(pendingDirectory).catch((cleanupError) => {
          throw cleanupError;
        });
      }
      throw error;
    }
  }

  async deleteAccessOperatorDirectory(directory) {
    const login = await this.accessOperatorLogin(directory);
    const intent = await this.readAccessOperatorMarker(
      directory,
      CLOUD_SQL_CREATE_INTENT_FILE,
      ["version", "project_id", "instance", "login_fingerprint"],
      "Cloud-SQL-Create-Intent"
    );
    const operationMarker = await this.readAccessOperatorMarker(
      directory,
      CLOUD_SQL_CREATE_OPERATION_FILE,
      ["version", "project_id", "instance", "login_fingerprint", "operation_id"],
      "Cloud-SQL-Create-Operationsanker"
    );
    this.validateAccessOperatorIntent(intent, login);
    this.validateAccessOperatorOperationMarker(operationMarker, login);
    if (operationMarker && !intent) {
      throw new OnlineOnboardingError(
        "Der Cloud-SQL-Create-Operationsanker besitzt keinen zugehoerigen Intent."
      );
    }
    let createOperation = null;
    if (operationMarker) {
      createOperation = await this.waitForCloudSqlCreateOperation(operationMarker.operation_id, {
        allowFailure: true
      });
    }
    const users = await this.listCloudSqlUser(login);
    if (!intent && users.length === 1) {
      throw new OnlineOnboardingError(
        "Der vorbestehende Cloud-SQL-Login besitzt keinen Create-Intent; Zugangsverzeichnis und Cluster-Lock bleiben erhalten."
      );
    }
    if (createOperation?.failed && users.length === 1) {
      throw new OnlineOnboardingError(
        "Die fehlgeschlagene Cloud-SQL-Create-Operation darf keinen vorhandenen Login entfernen; Zugangsverzeichnis und Cluster-Lock bleiben erhalten."
      );
    }
    if (intent && !operationMarker && users.length === 0) {
      throw new OnlineOnboardingError(
        "Der Cloud-SQL-Create-Ausgang ist unbekannt; Zugangsverzeichnis und Cluster-Lock bleiben erhalten."
      );
    }
    if (users.length === 1) {
      const user = await this.describeCloudSqlUser(login);
      if (!this.accessOperatorCloudSqlUserMatchesContract(user, login)) {
        throw new OnlineOnboardingError(
          "Der kurzlebige Cloud-SQL-Login ist vor dem Cleanup nicht exakt ziel- und rollengebunden."
        );
      }
      await this.gcloud([
        "sql", "users", "delete", login,
        `--project=${this.context.baseEnvironment.GCP_PROJECT_ID}`,
        `--instance=${this.context.baseEnvironment.cloudSqlInstance}`,
        "--quiet",
        "--format=none"
      ], { label: "Kurzlebiger Cloud-SQL-Login-Cleanup", timeoutMs: 240_000 });
    }
    if ((await this.listCloudSqlUser(login)).length !== 0) {
      throw new OnlineOnboardingError("Der kurzlebige Cloud-SQL-Login wurde nicht vollstaendig entfernt.");
    }
    await fs.rm(directory, { recursive: true, force: false });
    await syncDirectory(this.context.runDirectory);
    this.accessDirectories.delete(directory);
  }

  async prepareGuestOperator() {
    await this.cleanupOwnedPhaseResources();
    for (const directory of await this.listPendingAccessOperatorDirectories()) {
      await this.removePendingAccessOperatorDirectory(directory);
    }
    for (const directory of await this.listAccessOperatorDirectories()) {
      await this.deleteAccessOperatorDirectory(directory);
    }
    await this.removeTemporaryIamRoles();
    await this.ensureStaticResources();
    const access = await this.createAccessOperator();
    this.accessDirectories.add(access.directory);
    await this.addTemporaryIamRoles();
    return Object.freeze({ ready: true });
  }

  async createOwnedSecret(name, sourceArguments) {
    const namespace = this.context.baseEnvironment.K8S_NAMESPACE;
    const draft = parseJsonOutput((await this.kubectl([
      "--namespace", namespace,
      "create", "secret", "generic", name,
      ...sourceArguments,
      "--dry-run=client",
      "-o", "json"
    ], { label: "Kurzlebiges Operator-Secret-Rendering" })).stdout, "Operator-Secret-Rendering");
    annotateKubernetesDocument(draft, this.holderId, this.fingerprint);
    const created = await this.kubectl([
      "--namespace", namespace,
      "create", "--filename=-",
      "-o", "jsonpath={.metadata.uid}"
    ], {
      label: "Kurzlebiges Operator-Secret",
      input: `${JSON.stringify(draft)}\n`
    });
    const uid = created.stdout.trim();
    assertText(uid, "Operator-Secret-UID", 128, /^[A-Za-z0-9_.:-]+$/u);
    this.activeResources.set(`secret/${name}`, uid);
    return uid;
  }

  async createOwnedJob() {
    const { baseEnvironment, operatorRelease } = this.context;
    const rendered = renderJob({
      image: operatorRelease.image,
      projectId: baseEnvironment.GCP_PROJECT_ID,
      region: baseEnvironment.GCP_REGION
    });
    const manifest = annotateJobManifest(rendered, this.holderId, this.fingerprint);
    const created = await this.kubectl([
      "--namespace", baseEnvironment.K8S_NAMESPACE,
      "create", "--filename=-",
      "-o", "jsonpath={.metadata.uid}"
    ], {
      label: "Kurzlebiger Operator-Job",
      input: manifest
    });
    const uid = created.stdout.trim();
    assertText(uid, "Operator-Job-UID", 128, /^[A-Za-z0-9_.:-]+$/u);
    this.activeResources.set(`job/${JOB_NAME}`, uid);
    return uid;
  }

  async deleteOwnedResource(kind, name, { allowMissing = true } = {}) {
    const metadata = await this.resourceMetadata(kind, name);
    if (!metadata) {
      if (allowMissing) return false;
      throw new OnlineOnboardingError(`${kind}/${name} fehlt beim Cleanup.`);
    }
    const trackedUid = this.activeResources.get(`${kind}/${name}`);
    if (
      metadata.holderId !== this.holderId
      || metadata.fingerprint !== this.fingerprint
      || (trackedUid && metadata.uid !== trackedUid)
    ) {
      throw new OnlineOnboardingError(`${kind}/${name} gehoert nicht sicher zu diesem Lauf.`);
    }
    await this.kubectl([
      "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
      "delete", kind, name,
      "--wait=true", "--timeout=120s"
    ], { label: `${kind}-Cleanup` });
    if (await this.resourceMetadata(kind, name)) {
      throw new OnlineOnboardingError(`${kind}/${name} wurde nicht vollstaendig entfernt.`);
    }
    this.activeResources.delete(`${kind}/${name}`);
    return true;
  }

  async findOwnedJobPod(jobUid) {
    const deadline = Date.now() + PHASE_OUTPUT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = parseJsonOutput((await this.kubectl([
        "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
        "get", "pods",
        `--selector=job-name=${JOB_NAME}`,
        "-o", "json"
      ], { label: "Operator-Pod-Readback" })).stdout, "Operator-Pod-Readback");
      const items = Array.isArray(result.items) ? result.items : [];
      if (items.length > 1) {
        throw new OnlineOnboardingError("Mehr als ein Operator-Pod wurde gefunden.");
      }
      if (items.length === 1) {
        const pod = items[0];
        const owner = Array.isArray(pod.metadata?.ownerReferences)
          ? pod.metadata.ownerReferences.find((reference) => reference.kind === "Job")
          : null;
        if (
          owner?.uid !== jobUid
          || owner?.name !== JOB_NAME
          || !pod.metadata?.name
        ) {
          throw new OnlineOnboardingError("Der Operator-Pod gehoert nicht exakt zum create-only Job.");
        }
        return pod.metadata.name;
      }
      await delay(1_500);
    }
    throw new OnlineOnboardingError("Der Operator-Pod wurde nicht rechtzeitig erstellt.");
  }

  async waitForOperatorEvidence(podName) {
    const checkCode =
      "import{stat}from'node:fs/promises';"
      + "try{const s=await stat('/protected-output/run/status.json');process.exit(s.isFile()?0:1)}"
      + "catch{process.exit(1)}";
    const deadline = Date.now() + PHASE_OUTPUT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = await this.kubectl([
        "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
        "exec", podName, "--container=operator", "--",
        "node", "--input-type=module", "--eval", checkCode
      ], {
        label: "Operator-Evidenz-Bereitschaft",
        acceptedExitCodes: [0, 1],
        timeoutMs: 30_000
      });
      if (result.exitCode === 0) return;
      await delay(1_500);
    }
    throw new OnlineOnboardingError("Die geschuetzte Operator-Evidenz wurde nicht rechtzeitig bereitgestellt.");
  }

  async nextEvidenceDirectory(label) {
    ensureSafePathSegment(label, "Evidenzlabel");
    const entries = await fs.readdir(this.context.runDirectory, { withFileTypes: true });
    const prefix = `evidence-${label}-`;
    const existing = entries.filter((entry) => (
      entry.isDirectory()
      && entry.name.startsWith(prefix)
      && /^\d{3}$/u.test(entry.name.slice(prefix.length))
    ));
    const index = existing.length + 1;
    if (index > 999) throw new OnlineOnboardingError("Zu viele Evidenzlaeufe im Laufverzeichnis.");
    const directory = path.join(
      this.context.runDirectory,
      `${prefix}${String(index).padStart(3, "0")}`
    );
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.chmod(directory, 0o700);
    return directory;
  }

  async protectEvidenceDirectory(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const names = entries.map((entry) => entry.name).sort();
    const phaseLogs = names.filter((name) => ["guest-preview.log", "guest-apply.log"].includes(name));
    if (
      !names.includes("status.json")
      || phaseLogs.length !== 1
      || names.some((name) => !["status.json", "guest-preview.log", "guest-apply.log", ".evidence-collected"].includes(name))
    ) {
      throw new OnlineOnboardingError("Die kopierte Operator-Evidenz ist unvollstaendig oder enthaelt Zusatzdateien.");
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new OnlineOnboardingError("Die kopierte Operator-Evidenz enthaelt einen unzulaessigen Eintrag.");
      }
      const filePath = path.join(directory, entry.name);
      const metadata = await fs.stat(filePath);
      if (
        metadata.size > 2 * 1024 * 1024
        || (entry.name === "status.json" && metadata.size > 32 * 1024)
        || (entry.name === ".evidence-collected" && metadata.size !== 0)
      ) {
        throw new OnlineOnboardingError("Eine kopierte Operator-Evidenzdatei ist unplausibel gross.");
      }
      await fs.chmod(filePath, 0o600);
    }
    await fs.chmod(directory, 0o700);
  }

  async collectJobEvidence({
    jobUid,
    label,
    expectedPhase = "",
    requireSuccessfulReport = false,
    allowFailed = false
  }) {
    const podName = await this.findOwnedJobPod(jobUid);
    await this.waitForOperatorEvidence(podName);
    const evidenceDirectory = await this.nextEvidenceDirectory(label);
    let copied = false;
    for (let attempt = 0; attempt < 3 && !copied; attempt += 1) {
      try {
        await this.kubectl([
          "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
          "cp", `${podName}:/protected-output/run/.`, evidenceDirectory,
          "--container=operator"
        ], { label: "Geschuetzte Operator-Evidenzuebergabe", timeoutMs: 120_000 });
        copied = true;
      } catch (error) {
        if (attempt === 2) throw error;
        await delay(1_000);
      }
    }
    await this.protectEvidenceDirectory(evidenceDirectory);
    const statusPath = path.join(evidenceDirectory, "status.json");
    let status;
    try {
      status = JSON.parse(await fs.readFile(statusPath, "utf8"));
    } catch {
      throw new OnlineOnboardingError("Der Operator-Statusnachweis ist ungueltig.");
    }
    assertExactKeys(
      status,
      ["schemaVersion", "phase", "succeeded", "exitCode", "signal", "startedAt", "finishedAt"],
      "Operator-Statusnachweis"
    );
    if (
      status.schemaVersion !== 1
      || !["guest-preview", "guest-apply"].includes(status.phase)
      || (expectedPhase && status.phase !== expectedPhase)
      || typeof status.succeeded !== "boolean"
      || (!Number.isInteger(status.exitCode) && !(status.exitCode === null && typeof status.signal === "string"))
      || (status.signal !== null && typeof status.signal !== "string")
      || !Number.isFinite(Date.parse(status.startedAt))
      || !Number.isFinite(Date.parse(status.finishedAt))
    ) {
      throw new OnlineOnboardingError("Der Operator-Statusnachweis entspricht nicht dem Phasenvertrag.");
    }
    const reportPath = path.join(evidenceDirectory, `${status.phase}.log`);
    let report = null;
    if (status.succeeded || requireSuccessfulReport) {
      try {
        report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      } catch {
        throw new OnlineOnboardingError("Der geschuetzte Gastphasen-Nachweis ist ungueltig.");
      }
    }
    const acknowledgementCode =
      "import{open,stat}from'node:fs/promises';"
      + "const p='/protected-output/run/.evidence-collected';"
      + "try{const h=await open(p,'wx',0o600);await h.close()}"
      + "catch(e){if(e.code!=='EEXIST')throw e;const s=await stat(p);"
      + "if(!s.isFile()||s.size!==0||(s.mode&0o777)!==0o600)process.exit(1)}";
    await this.kubectl([
      "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
      "exec", podName, "--container=operator", "--",
      "node", "--input-type=module", "--eval", acknowledgementCode
    ], { label: "Operator-Evidenzbestaetigung" });
    await this.kubectl([
      "--namespace", this.context.baseEnvironment.K8S_NAMESPACE,
      "wait",
      `--for=condition=${status.succeeded ? "complete" : "failed"}`,
      "--timeout=120s",
      `job/${JOB_NAME}`
    ], { label: "Operator-Phasenabschluss", timeoutMs: 150_000 });
    if (!status.succeeded && !allowFailed) {
      throw new OnlineOnboardingError("Die Gastphase ist fail-closed fehlgeschlagen; Evidenz wurde gesichert.");
    }
    return Object.freeze({
      report,
      reportPath,
      evidenceDirectory,
      resourceId: jobUid,
      succeeded: status.succeeded
    });
  }

  async recoverOwnedJobEvidence() {
    const metadata = await this.resourceMetadata("job", JOB_NAME);
    if (!metadata) return;
    if (metadata.holderId !== this.holderId || metadata.fingerprint !== this.fingerprint) {
      throw new OnlineOnboardingError("Ein vorhandener Operator-Job gehoert nicht sicher zum Resume-Lauf.");
    }
    await this.collectJobEvidence({
      jobUid: metadata.uid,
      label: "recovered-operator-phase",
      allowFailed: true
    }).catch((error) => {
      throw new OnlineOnboardingError(
        "Die offene Operator-Phase konnte vor dem Resume nicht sicher als Evidenz uebernommen werden.",
        1,
        error?.code || "OPERATOR_RECOVERY_FAILED"
      );
    });
  }

  async cleanupOwnedPhaseResources() {
    const errors = [];
    let job = null;
    try {
      job = await this.resourceMetadata("job", JOB_NAME);
    } catch (error) {
      errors.push(error);
    }
    if (job) {
      await this.recoverOwnedJobEvidence().catch((error) => errors.push(error));
      await this.deleteOwnedResource("job", JOB_NAME, { allowMissing: false })
        .catch((error) => errors.push(error));
    }
    await this.deleteOwnedResource("secret", INPUT_SECRET).catch((error) => errors.push(error));
    await this.deleteOwnedResource("secret", ENVIRONMENT_SECRET).catch((error) => errors.push(error));
    if (errors.length > 0) throw errors[0];
  }

  phaseEnvironment(phase, preview = null) {
    const values = {};
    for (const key of BASE_ENVIRONMENT_KEYS) values[key] = this.context.baseEnvironment[key];
    values.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE = "private-ip";
    values.CLOUD_SQL_AUTH_PROXY_SHA256 = this.context.operatorRelease.cloud_sql_proxy_sha256;
    values.MIGRATION_OPERATOR_PHASE = phase;
    if (phase === "guest-apply") {
      values.CONFIRM_GUEST_ACCESS_OPERATION = GUEST_ACCESS_CREATE_PROFILE_OPERATION;
      values.CONFIRM_GUEST_ACCESS_INPUT_FINGERPRINT = preview.input_fingerprint;
      values.CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT = preview.current_state_fingerprint;
    }
    return Object.freeze(values);
  }

  async runGuestPhase({ phase, label, preview = null }) {
    if (!this.holderId) throw new OnlineOnboardingError("Die Gastphase benoetigt den clusterweiten Lauf-Lock.");
    const accessDirectories = await this.listAccessOperatorDirectories();
    const accessDirectory = accessDirectories.at(-1);
    if (!accessDirectory) throw new OnlineOnboardingError("Der kurzlebige Access-Operator fehlt.");
    const phaseEnvironmentPath = path.join(
      this.context.runDirectory,
      `operator-${label}-${crypto.randomUUID()}.env`
    );
    await writeOwnerOnlyCreateOnly(
      phaseEnvironmentPath,
      envFileContents(this.phaseEnvironment(phase, preview))
    );
    let jobUid = "";
    try {
      await this.createOwnedSecret(ENVIRONMENT_SECRET, [
        `--from-env-file=${phaseEnvironmentPath}`,
        `--from-env-file=${path.join(accessDirectory, "test-access-operator.env")}`,
        `--from-env-file=${this.context.identityReadbackEnvironmentPath}`
      ]);
      await this.createOwnedSecret(INPUT_SECRET, [
        `--from-file=guest-access.json=${this.context.guestAccessInput}`
      ]);
      jobUid = await this.createOwnedJob();
      return await this.collectJobEvidence({
        jobUid,
        label,
        expectedPhase: phase,
        requireSuccessfulReport: true
      });
    } finally {
      const cleanupErrors = [];
      await this.deleteOwnedResource("job", JOB_NAME).catch((error) => cleanupErrors.push(error));
      await this.deleteOwnedResource("secret", INPUT_SECRET).catch((error) => cleanupErrors.push(error));
      await this.deleteOwnedResource("secret", ENVIRONMENT_SECRET).catch((error) => cleanupErrors.push(error));
      await fs.unlink(phaseEnvironmentPath).catch((error) => {
        if (error?.code !== "ENOENT") cleanupErrors.push(error);
      });
      if (cleanupErrors.length > 0) throw cleanupErrors[0];
    }
  }

  async previewGuest({ purpose }) {
    const labels = {
      initial: "guest-initial-preview",
      "post-apply": "guest-post-preview",
      "unknown-apply-readback": "guest-unknown-apply-readback"
    };
    const label = labels[purpose];
    if (!label) throw new OnlineOnboardingError("Unbekannter Gastpreview-Zweck.");
    const result = await this.runGuestPhase({ phase: "guest-preview", label });
    if (purpose === "post-apply" || purpose === "unknown-apply-readback") {
      try {
        validateGuestPhaseReport(result.report, this.context.guestFingerprint, "final");
        this.postEvidencePath = result.reportPath;
      } catch {
        if (purpose === "post-apply") throw new OnlineOnboardingError("Der Post-Apply-Gastreadback ist nicht unveraendert.");
      }
    }
    return result;
  }

  async applyGuest({ preview }) {
    return this.runGuestPhase({
      phase: "guest-apply",
      label: "guest-apply",
      preview
    });
  }

  async cleanupGuestOperator() {
    const errors = [];
    await this.cleanupOwnedPhaseResources().catch((error) => errors.push(error));
    await this.removeTemporaryIamRoles().catch((error) => errors.push(error));
    let pendingDirectories = [];
    try {
      pendingDirectories = await this.listPendingAccessOperatorDirectories();
    } catch (error) {
      errors.push(error);
    }
    for (const directory of pendingDirectories) {
      await this.removePendingAccessOperatorDirectory(directory).catch((error) => errors.push(error));
    }
    let accessDirectories = [];
    try {
      accessDirectories = await this.listAccessOperatorDirectories();
    } catch (error) {
      errors.push(error);
    }
    for (const directory of accessDirectories) {
      await this.deleteAccessOperatorDirectory(directory).catch((error) => errors.push(error));
    }
    await (async () => {
      if (await this.resourceMetadata("job", JOB_NAME)) {
        throw new OnlineOnboardingError("Der Operator-Job ist nach dem Cleanup noch vorhanden.");
      }
    })().catch((error) => errors.push(error));
    await (async () => {
      if (
        await this.resourceMetadata("secret", INPUT_SECRET)
        || await this.resourceMetadata("secret", ENVIRONMENT_SECRET)
      ) {
        throw new OnlineOnboardingError("Ein kurzlebiges Operator-Secret ist nach dem Cleanup noch vorhanden.");
      }
    })().catch((error) => errors.push(error));
    if (errors.length > 0) throw errors[0];
    return Object.freeze({ complete: true });
  }

  async discoverPostApplyEvidence() {
    if (this.postEvidencePath) return this.postEvidencePath;
    const entries = await fs.readdir(this.context.runDirectory, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("evidence-")) continue;
      const reportPath = path.join(this.context.runDirectory, entry.name, "guest-preview.log");
      try {
        const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
        validateGuestPhaseReport(report, this.context.guestFingerprint, "final");
        const metadata = await fs.stat(reportPath);
        candidates.push({ reportPath, modified: metadata.mtimeMs });
      } catch {
        // Andere Preview- oder Fehlernachweise sind keine Post-Apply-Evidenz.
      }
    }
    candidates.sort((left, right) => right.modified - left.modified);
    if (candidates.length === 0) {
      throw new OnlineOnboardingError("Der geschuetzte Post-Apply-Gastnachweis fehlt.");
    }
    this.postEvidencePath = candidates[0].reportPath;
    return this.postEvidencePath;
  }

  async removeGeneratedNativeLink(fileName) {
    const filePath = path.join(this.context.runDirectory, fileName);
    let metadata;
    try {
      metadata = await fs.lstat(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
    if (
      metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.uid !== currentUid
      || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    ) {
      throw new OnlineOnboardingError("Der native Reset-Link kann nicht sicher bereinigt werden.");
    }
    await fs.unlink(filePath);
  }

  async prepareInvitation({ apply, fingerprint = "" }) {
    const postApplyEvidence = await this.discoverPostApplyEvidence();
    const linkPath = path.join(this.context.runDirectory, "password-invitation-link.txt");
    const argumentsList = [
      "--account-input", this.context.accountInput,
      "--guest-access-input", this.context.guestAccessInput,
      "--post-apply-evidence", postApplyEvidence,
      "--bucket", this.context.operatorRelease.invitation_bucket
    ];
    if (apply) {
      argumentsList.push(
        "--output", linkPath,
        "--apply",
        "--confirm-environment", EXPECTED_ENVIRONMENT,
        "--confirm-project", this.context.baseEnvironment.GCP_PROJECT_ID,
        "--confirm-operation", PASSWORD_INVITATION_OPERATION,
        "--confirm-fingerprint", fingerprint
      );
    }
    const summary = await this.nodeScript(
      "scripts/provision_pre_gematik_password_invitation.mjs",
      argumentsList,
      { timeoutMs: 180_000 }
    );
    if (apply) {
      await this.removeGeneratedNativeLink("native-password-reset-link-do-not-send.txt");
      await this.removeGeneratedNativeLink("native-password-reset-link-recovery-do-not-send.txt");
    }
    return Object.freeze({ summary });
  }

  async renderMail({ apply, fingerprint = "" }) {
    const argumentsList = [
      "--input", this.context.accountInput,
      "--link-file", path.join(this.context.runDirectory, "password-invitation-link.txt"),
      "--sender-name", WELCOME_EMAIL_SENDER_NAME,
      "--sender-email", WELCOME_EMAIL_SENDER_EMAIL,
      "--pilot-end", EXPECTED_PILOT_END
    ];
    if (apply) {
      argumentsList.push(
        "--output-dir", path.join(this.context.runDirectory, "welcome-mail"),
        "--apply",
        "--confirm-operation", WELCOME_EMAIL_OPERATION,
        "--confirm-fingerprint", fingerprint
      );
    }
    const summary = await this.nodeScript(
      "scripts/render_pre_gematik_guest_welcome_email.mjs",
      argumentsList
    );
    return Object.freeze({ summary });
  }

  async previewMailSend() {
    const summary = await this.nodeScript(
      "scripts/send_pre_gematik_guest_welcome_email.mjs",
      [
        "--input", this.context.accountInput,
        "--link-file", path.join(this.context.runDirectory, "password-invitation-link.txt"),
        "--mail-file", path.join(this.context.runDirectory, "welcome-mail", "welcome.eml"),
        "--smtp-config", this.context.smtpConfigPath,
        "--invitation-bucket", this.context.operatorRelease.invitation_bucket
      ],
      { timeoutMs: 180_000 }
    );
    return Object.freeze({ summary });
  }
}

export function createCommandOnlineOnboardingRuntime(context, dependencies = {}) {
  return new CommandOnlineOnboardingRuntime(context, dependencies);
}

export function usage() {
  return `Beschleunigte Online-Neunutzeranlage bis zur versandbereiten Mail

Read-only Plan:
  node scripts/orchestrate_pre_gematik_online_onboarding.mjs \\
    --account-input /absolut/owner-only/account.json \\
    --guest-access-input /absolut/owner-only/guest-access.json \\
    --operator-release /absolut/owner-only/operator-release.json \\
    --operator-environment /absolut/owner-only/online-onboarding.env \\
    --identity-readback-environment /absolut/owner-only/identity-readback.env \\
    --smtp-config /absolut/owner-only/smtp.json \\
    --run-directory /absolut/owner-only/onboarding-run

Apply bis READY_TO_SEND:
  zusaetzlich --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-project <project-id> \\
    --confirm-operation ${ONLINE_ONBOARDING_OPERATION} \\
    --confirm-fingerprint sha256:<plan-fingerprint>

Eine sichere Fortsetzung verwendet dieselben Angaben plus --resume. Bei
abgelaufenem Release oder zu kurzem IAM-Zeitfenster fuehrt Resume ausschliesslich
die Restbereinigung bis CLEANUP_COMPLETED_RESUME_REQUIRED aus. Dieser
Orchestrator besitzt absichtlich keinen SMTP-Apply-Pfad und versendet keine Mail.`;
}

async function loadOnlineOnboardingContext(options) {
  const repository = await repositoryRoot();
  const [
    account,
    guestAccess,
    releaseDocument,
    operatorEnvironmentFile,
    identityReadbackFile,
    smtpFile,
    runDirectory
  ] = await Promise.all([
    loadProtectedIdentityPlatformAccountDocument(options.accountInput, { repository }),
    loadProtectedIdentityPlatformGuestAccessDocument(options.guestAccessInput, { repository }),
    loadOwnerOnlyJson(options.operatorRelease, {
      repository,
      label: "Die geschuetzte Operator-Release-Datei"
    }),
    resolveOwnerOnlyFile(options.operatorEnvironment, {
      repository,
      label: "Die geschuetzte Online-Onboarding-Umgebung"
    }),
    resolveOwnerOnlyFile(options.identityReadbackEnvironment, {
      repository,
      label: "Die geschuetzte Identity-Platform-Readback-Umgebung"
    }),
    resolveOwnerOnlyFile(options.smtpConfig, {
      repository,
      label: "Die geschuetzte SMTP-Konfiguration"
    }),
    resolveOwnerOnlyDirectory(options.runDirectory, {
      repository,
      label: "Das geschuetzte Onboarding-Laufverzeichnis"
    })
  ]);
  const operatorEnvironment = validateBaseEnvironment(parseStrictEnv(
    await fs.readFile(operatorEnvironmentFile, "utf8"),
    BASE_ENVIRONMENT_KEYS,
    "Online-Onboarding-Umgebung"
  ));
  const identityReadbackEnvironment = parseStrictEnv(
    await fs.readFile(identityReadbackFile, "utf8"),
    ["IAP_EXTERNAL_AUTH_API_KEY"],
    "Identity-Platform-Readback-Umgebung"
  );
  if (!API_KEY_PATTERN.test(identityReadbackEnvironment.IAP_EXTERNAL_AUTH_API_KEY)) {
    throw new OnlineOnboardingError("Der Identity-Platform-Readback-Key ist ungueltig.");
  }
  const smtpDocument = parseJsonOutput(
    await fs.readFile(smtpFile, "utf8"),
    "SMTP-Konfiguration"
  );
  validateWelcomeEmailSmtpConfig(smtpDocument);
  const operatorRelease = validateOperatorRelease(
    releaseDocument,
    operatorEnvironment,
    new Date(),
    { allowExpired: options.apply && options.resume }
  );
  const operatorReleaseExpired = Date.parse(operatorRelease.approved_until) <= Date.now();
  const bound = bindOnlineOnboardingDocuments(account, guestAccess, operatorEnvironment);
  const fingerprint = onlineOnboardingFingerprint({
    ...bound,
    baseEnvironment: operatorEnvironment,
    operatorRelease
  });
  validateOptions(options, operatorEnvironment.GCP_PROJECT_ID, fingerprint);
  return Object.freeze({
    repository,
    account,
    guestAccess,
    accountInput: await fs.realpath(options.accountInput),
    guestAccessInput: await fs.realpath(options.guestAccessInput),
    baseEnvironment: operatorEnvironment,
    operatorRelease,
    identityReadbackEnvironment,
    identityReadbackEnvironmentPath: identityReadbackFile,
    smtpConfigPath: smtpFile,
    runDirectory,
    fingerprint,
    operatorReleaseExpired,
    ...bound
  });
}

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  const options = parseOnlineOnboardingArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const context = await loadOnlineOnboardingContext(options);
  const input = Object.freeze({
    apply: options.apply,
    resume: options.resume,
    fingerprint: context.fingerprint,
    projectId: context.baseEnvironment.GCP_PROJECT_ID,
    accountFingerprint: context.accountFingerprint,
    guestFingerprint: context.guestFingerprint,
    invitationBucket: context.operatorRelease.invitation_bucket,
    runDirectory: context.runDirectory,
    operatorReleaseExpired: context.operatorReleaseExpired
  });
  const runtime = options.apply
    ? createCommandOnlineOnboardingRuntime(context)
    : null;
  return executeOnlineOnboardingPreparation(input, { runtime });
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof OnlineOnboardingError
      ? error.message
      : "Die beschleunigte Online-Neunutzeranlage ist fail-closed fehlgeschlagen.";
    process.stderr.write(`FEHLER: ${message}\n`);
    process.exitCode = error instanceof OnlineOnboardingError ? error.exitCode : 1;
  });
}
