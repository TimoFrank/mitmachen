#!/usr/bin/env node

import crypto from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  openSync,
  realpathSync,
  statSync,
  writeSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPreGematikMigrationGcp } from "./check_pre_gematik_migration_gcp.mjs";

export const OPERATION_CONFIRMATION = "MIGRATE_ALLOWLISTED_SUPABASE_STORAGE_TO_GCS";
export const PROTECTED_SOURCE_BUCKET = "protected-source-assets";

const LIST_PAGE_SIZE = 1000;
const MAX_OBJECTS = 100_000;
const MAX_DIRECTORIES = 100_000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const BACKUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,255}$/u;
const GCS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u;
const OBJECT_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$/u;
const HASH_METADATA_KEY = "versorgungs-kompass-sha256";
const SOURCE_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/u;
const TARGET_PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const NON_NEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const GCP_RESOURCE_NAME_PATTERN = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const STANDARD_W3C_SVG_DOCTYPE_PATTERN = /^<!DOCTYPE\s+svg\s+PUBLIC\s+["']-\/\/W3C\/\/DTD SVG (?:1\.0|1\.1)\/\/EN["']\s+["']https?:\/\/www\.w3\.org\/Graphics\/SVG\/(?:1\.0\/DTD\/svg10|1\.1\/DTD\/svg11)\.dtd["']\s*>/iu;
const PROJECT_ROOT = realpathSync(fileURLToPath(new URL("../", import.meta.url)));

const SOURCE_BUCKET_POLICIES = Object.freeze({
  "profile-images": Object.freeze({
    targetEnv: "PROFILE_IMAGE_BUCKET",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"])
  }),
  "contact-images": Object.freeze({
    targetEnv: "CONTACT_IMAGE_BUCKET",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"])
  }),
  "contact-note-attachments": Object.freeze({
    targetEnv: "CONTACT_NOTE_ATTACHMENT_BUCKET",
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: Object.freeze([
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ])
  }),
  "stakeholder-logos": Object.freeze({
    targetEnv: "STAKEHOLDER_LOGO_BUCKET",
    // Die Ziel-API akzeptiert Logos bewusst nur bis 2 MiB.
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: Object.freeze([
      "application/xml",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/webp",
      "text/xml"
    ])
  })
});

export const ALLOWED_SOURCE_BUCKETS = Object.freeze(Object.keys(SOURCE_BUCKET_POLICIES));

export class StorageMigrationSafetyError extends Error {
  constructor(message, code = "STORAGE_MIGRATION_SAFETY") {
    super(message);
    this.name = "StorageMigrationSafetyError";
    this.code = code;
  }
}

class SourceContentContractError extends Error {
  constructor(object, signatureClass, sha256) {
    super("Source content contract mismatch.");
    this.name = "SourceContentContractError";
    this.sourceBucket = object.sourceBucket;
    this.mimeType = object.mimeType;
    this.signatureClass = signatureClass;
    this.quarantinedObject = Object.freeze({ ...object, signatureClass, sha256 });
  }
}

function safeInteger(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedMimeType(value) {
  if (typeof value !== "string") return "";
  return value.split(";", 1)[0].trim().toLowerCase();
}

function targetMimeType(sourceBucket, sourceMimeType) {
  if (
    sourceBucket === "stakeholder-logos"
    && ["application/xml", "text/xml"].includes(sourceMimeType)
  ) return "image/svg+xml";
  return sourceMimeType;
}

function assertAllowedSourceBucket(sourceBucket) {
  if (sourceBucket === PROTECTED_SOURCE_BUCKET || !Object.hasOwn(SOURCE_BUCKET_POLICIES, sourceBucket)) {
    throw new StorageMigrationSafetyError(
      "A source bucket outside the immutable migration allowlist was requested.",
      "SOURCE_BUCKET_FORBIDDEN"
    );
  }
}

function assertSafeObjectPath(objectName) {
  const byteLength = Buffer.byteLength(String(objectName || ""), "utf8");
  const segments = typeof objectName === "string" ? objectName.split("/") : [];
  if (
    typeof objectName !== "string"
    || !OBJECT_PATH_PATTERN.test(objectName)
    || byteLength > 1024
    || objectName.endsWith("/")
    || objectName.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new StorageMigrationSafetyError("A source object has an unsafe path.", "OBJECT_PATH_UNSAFE");
  }
}

export function migrationTargetObjectName(sourceBucket, sourceObjectName) {
  assertAllowedSourceBucket(sourceBucket);
  assertSafeObjectPath(sourceObjectName);
  if (sourceBucket !== "profile-images") return sourceObjectName;
  const segments = sourceObjectName.split("/");
  if (
    segments.length !== 2
    || !/^[A-Za-z0-9._-]{1,200}$/u.test(segments[0])
    || !/^avatar\.(?:jpg|png|webp)$/iu.test(segments[1])
  ) {
    throw new StorageMigrationSafetyError(
      "A profile image does not match the approved two-segment source contract.",
      "PROFILE_IMAGE_PATH_INVALID"
    );
  }
  const targetName = `profile-images/${sourceObjectName}`;
  assertSafeObjectPath(targetName);
  return targetName;
}

function assertSafeDirectorySegment(segment) {
  if (
    typeof segment !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u.test(segment)
    || segment === "."
    || segment === ".."
  ) {
    throw new StorageMigrationSafetyError("A source directory has an unsafe path segment.", "DIRECTORY_PATH_UNSAFE");
  }
}

function validateBucketName(bucketName) {
  if (
    typeof bucketName !== "string"
    || !GCS_BUCKET_PATTERN.test(bucketName)
    || bucketName.includes("..")
    || bucketName.startsWith("goog")
    || bucketName.includes("google")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(bucketName)
  ) {
    throw new StorageMigrationSafetyError("A required target bucket name is invalid.", "TARGET_BUCKET_INVALID");
  }
  if (bucketName.includes(PROTECTED_SOURCE_BUCKET)) {
    throw new StorageMigrationSafetyError("The protected source archive is forbidden for this migration.", "PROTECTED_BUCKET_FORBIDDEN");
  }
}

function validateSecret(value, label) {
  if (typeof value !== "string" || value.length < 20 || /\s/u.test(value)) {
    throw new StorageMigrationSafetyError(`${label} is missing or malformed.`, "CREDENTIAL_REQUIRED");
  }
  return value;
}

function normalizedSupabaseUrl(value, expectedSourceProjectId) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new StorageMigrationSafetyError("SUPABASE_URL is invalid.", "SOURCE_URL_INVALID");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== `${expectedSourceProjectId}.supabase.co`
    || !["", "/"].includes(parsed.pathname)
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) {
    throw new StorageMigrationSafetyError(
      "SUPABASE_URL does not identify the approved source project.",
      "SOURCE_PROJECT_MISMATCH"
    );
  }
  return parsed.origin;
}

export function buildStorageConfiguration(environment) {
  const expectedSourceProjectId = String(environment.EXPECTED_SOURCE_PROJECT_ID || "");
  const expectedTargetProjectId = String(environment.EXPECTED_TARGET_PROJECT_ID || "");
  const expectedProjectPairFingerprint = String(environment.EXPECTED_STORAGE_PROJECT_PAIR_SHA256 || "");
  if (!SOURCE_PROJECT_ID_PATTERN.test(expectedSourceProjectId) || !TARGET_PROJECT_ID_PATTERN.test(expectedTargetProjectId)) {
    throw new StorageMigrationSafetyError(
      "Protected source and target project identifiers are missing or malformed.",
      "PROJECT_IDENTITY_REQUIRED"
    );
  }
  const actualProjectPairFingerprint = `sha256:${crypto.createHash("sha256")
    .update(`${expectedSourceProjectId}\u0000${expectedTargetProjectId}`)
    .digest("hex")}`;
  if (
    !SHA256_PATTERN.test(expectedProjectPairFingerprint)
    || !crypto.timingSafeEqual(Buffer.from(actualProjectPairFingerprint), Buffer.from(expectedProjectPairFingerprint))
  ) {
    throw new StorageMigrationSafetyError(
      "Protected project identifiers do not match the independently approved SHA-256 pin.",
      "PROJECT_PAIR_FINGERPRINT_MISMATCH"
    );
  }
  const sourceUrl = normalizedSupabaseUrl(environment.SUPABASE_URL, expectedSourceProjectId);
  const sourceServiceRoleKey = validateSecret(environment.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const googleAccessToken = validateSecret(environment.GOOGLE_OAUTH_ACCESS_TOKEN, "GOOGLE_OAUTH_ACCESS_TOKEN");
  const targetRegion = String(environment.GCP_REGION || "");
  const targetNamespace = String(environment.K8S_NAMESPACE || "");
  const expectedBucketIamFingerprint = String(environment.PRE_GEMATIK_DATA_BUCKET_IAM_SHA256 || "");
  if (!GCP_RESOURCE_NAME_PATTERN.test(targetRegion) || !GCP_RESOURCE_NAME_PATTERN.test(targetNamespace)) {
    throw new StorageMigrationSafetyError(
      "The protected target region and namespace are missing or malformed.",
      "TARGET_CONTEXT_REQUIRED"
    );
  }
  if (!SHA256_PATTERN.test(expectedBucketIamFingerprint)) {
    throw new StorageMigrationSafetyError(
      "The independently approved data-bucket IAM fingerprint is missing or malformed.",
      "TARGET_BUCKET_IAM_PIN_REQUIRED"
    );
  }
  const targetBuckets = {};
  const seenTargetBuckets = new Set();
  for (const sourceBucket of ALLOWED_SOURCE_BUCKETS) {
    const targetBucket = environment[SOURCE_BUCKET_POLICIES[sourceBucket].targetEnv];
    validateBucketName(targetBucket);
    if (seenTargetBuckets.has(targetBucket)) {
      throw new StorageMigrationSafetyError("Each data class requires a distinct target bucket.", "TARGET_BUCKET_DUPLICATE");
    }
    seenTargetBuckets.add(targetBucket);
    targetBuckets[sourceBucket] = targetBucket;
  }
  return Object.freeze({
    sourceUrl,
    expectedSourceProjectId,
    expectedTargetProjectId,
    expectedProjectPairFingerprint,
    sourceServiceRoleKey,
    googleAccessToken,
    targetRegion,
    targetNamespace,
    expectedBucketIamFingerprint,
    targetBuckets: Object.freeze(targetBuckets)
  });
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new StorageMigrationSafetyError(`${option} requires a value.`, "CLI_OPTION_INVALID");
  }
  return value;
}

export function parseStorageMigrationArguments(argv) {
  const options = {
    apply: false,
    help: false,
    confirmSourceProject: "",
    confirmTargetProject: "",
    preImportBackupId: "",
    confirmPreviewFingerprint: "",
    confirmOperation: "",
    confirmQuarantinedObjectCount: "",
    manifestOutput: "",
    recoveryJournal: ""
  };
  const valueOptions = new Map([
    ["--confirm-source-project", "confirmSourceProject"],
    ["--confirm-target-project", "confirmTargetProject"],
    ["--pre-import-backup-id", "preImportBackupId"],
    ["--confirm-preview-fingerprint", "confirmPreviewFingerprint"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-quarantined-object-count", "confirmQuarantinedObjectCount"],
    ["--manifest-output", "manifestOutput"],
    ["--recovery-journal", "recoveryJournal"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new StorageMigrationSafetyError("Unknown command-line option.", "CLI_OPTION_INVALID");
    }
  }
  return Object.freeze(options);
}

export function validateApplyConfirmations(options, config = null) {
  const confirmationValues = [
    options.confirmSourceProject,
    options.confirmTargetProject,
    options.preImportBackupId,
    options.confirmPreviewFingerprint,
    options.confirmOperation,
    options.confirmQuarantinedObjectCount
  ];
  if (!options.apply) {
    if (confirmationValues.some(Boolean)) {
      throw new StorageMigrationSafetyError("Apply confirmations are only accepted together with --apply.", "APPLY_FLAG_REQUIRED");
    }
    return;
  }
  if (!config) {
    throw new StorageMigrationSafetyError("Apply validation requires the protected project identity.", "PROJECT_IDENTITY_REQUIRED");
  }
  if (options.confirmSourceProject !== config.expectedSourceProjectId) {
    throw new StorageMigrationSafetyError("Apply requires the exact approved source project confirmation.", "SOURCE_CONFIRMATION_REQUIRED");
  }
  if (options.confirmTargetProject !== config.expectedTargetProjectId) {
    throw new StorageMigrationSafetyError("Apply requires the exact approved target project confirmation.", "TARGET_CONFIRMATION_REQUIRED");
  }
  if (!BACKUP_ID_PATTERN.test(options.preImportBackupId)) {
    throw new StorageMigrationSafetyError("Apply requires a concrete pre-import backup ID.", "BACKUP_CONFIRMATION_REQUIRED");
  }
  if (!SHA256_PATTERN.test(options.confirmPreviewFingerprint)) {
    throw new StorageMigrationSafetyError("Apply requires a valid Preview fingerprint.", "FINGERPRINT_CONFIRMATION_REQUIRED");
  }
  if (options.confirmOperation !== OPERATION_CONFIRMATION) {
    throw new StorageMigrationSafetyError("Apply requires the exact operation confirmation.", "OPERATION_CONFIRMATION_REQUIRED");
  }
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(options.confirmQuarantinedObjectCount)) {
    throw new StorageMigrationSafetyError(
      "Apply requires the exact quarantined source object count from Preview.",
      "QUARANTINE_CONFIRMATION_REQUIRED"
    );
  }
}

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateManifestOutputPath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new StorageMigrationSafetyError(
      "A manifest output path must be absolute.",
      "MANIFEST_PATH_REQUIRED"
    );
  }
  const resolved = path.resolve(value);
  if (isPathInside(resolved, PROJECT_ROOT)) {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest must be written outside the repository.",
      "MANIFEST_PATH_IN_REPOSITORY"
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,200}\.json$/u.test(path.basename(resolved))) {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest requires a safe JSON filename.",
      "MANIFEST_FILENAME_INVALID"
    );
  }
  let realParent;
  try {
    realParent = realpathSync(path.dirname(resolved));
  } catch {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest parent directory must already exist.",
      "MANIFEST_PARENT_INVALID"
    );
  }
  if (isPathInside(realParent, PROJECT_ROOT)) {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest parent must be a real directory outside the repository.",
      "MANIFEST_PARENT_INVALID"
    );
  }
  return path.join(realParent, path.basename(resolved));
}

export function writeProtectedMigrationManifest(manifestPath, manifest) {
  const validatedPath = validateManifestOutputPath(manifestPath);
  let descriptor;
  try {
    descriptor = openSync(validatedPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
  } catch {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest could not be created safely; no path or contents were logged.",
      "MANIFEST_WRITE_FAILED"
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if ((statSync(validatedPath).mode & 0o777) !== 0o600) {
    throw new StorageMigrationSafetyError(
      "The protected migration manifest does not have mode 0600.",
      "MANIFEST_MODE_INVALID"
    );
  }
}

export function validateRecoveryJournalPath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new StorageMigrationSafetyError(
      "A recovery journal path must be absolute.",
      "RECOVERY_JOURNAL_PATH_REQUIRED"
    );
  }
  const resolved = path.resolve(value);
  if (isPathInside(resolved, PROJECT_ROOT)
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,200}\.ndjson$/u.test(path.basename(resolved))) {
    throw new StorageMigrationSafetyError(
      "The protected recovery journal must be a safe NDJSON file outside the repository.",
      "RECOVERY_JOURNAL_PATH_INVALID"
    );
  }
  let realParent;
  try {
    realParent = realpathSync(path.dirname(resolved));
  } catch {
    throw new StorageMigrationSafetyError(
      "The protected recovery journal parent directory must already exist.",
      "RECOVERY_JOURNAL_PATH_INVALID"
    );
  }
  if (isPathInside(realParent, PROJECT_ROOT)) {
    throw new StorageMigrationSafetyError(
      "The protected recovery journal parent must be outside the repository.",
      "RECOVERY_JOURNAL_PATH_INVALID"
    );
  }
  return path.join(realParent, path.basename(resolved));
}

export function createProtectedRecoveryJournal(journalPath) {
  const validatedPath = validateRecoveryJournalPath(journalPath);
  let descriptor;
  try {
    descriptor = openSync(
      validatedPath,
      fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
      0o600
    );
    const fileStat = fstatSync(descriptor);
    if (!fileStat.isFile()
        || (fileStat.mode & 0o777) !== 0o600
        || (typeof process.getuid === "function" && fileStat.uid !== process.getuid())) {
      throw new Error("unsafe-journal");
    }
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    throw new StorageMigrationSafetyError(
      "The owner-only recovery journal could not be opened safely; its path was not logged.",
      "RECOVERY_JOURNAL_OPEN_FAILED"
    );
  }
  return Object.freeze({
    record(value) {
      try {
        writeSync(descriptor, `${JSON.stringify(value)}\n`, undefined, "utf8");
        fsyncSync(descriptor);
      } catch {
        throw new StorageMigrationSafetyError(
          "The recovery journal could not be durably updated; migration stopped.",
          "RECOVERY_JOURNAL_WRITE_FAILED"
        );
      }
    },
    close() {
      closeSync(descriptor);
    }
  });
}

function supabaseHeaders(config) {
  return {
    apikey: config.sourceServiceRoleKey,
    authorization: `Bearer ${config.sourceServiceRoleKey}`
  };
}

function googleHeaders(config) {
  return { authorization: `Bearer ${config.googleAccessToken}` };
}

function encodedObjectPath(objectName) {
  return objectName.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

async function safeFetch(fetchImpl, operation, url, options, acceptedStatuses) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      ...options
    });
  } catch {
    throw new StorageMigrationSafetyError(`The ${operation} request failed without exposing request data.`, "HTTP_REQUEST_FAILED");
  }
  if (!acceptedStatuses.includes(response.status)) {
    throw new StorageMigrationSafetyError(
      `The ${operation} request returned HTTP ${response.status}. Response details were not logged.`,
      "HTTP_STATUS_UNEXPECTED"
    );
  }
  return response;
}

async function safeJson(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new StorageMigrationSafetyError(`The ${operation} response was not valid JSON.`, "HTTP_JSON_INVALID");
  }
}

function databaseReferenceKey(sourceBucket, objectName) {
  return `${sourceBucket}\u0000${objectName}`;
}

function safeDatabaseObjectPath(value, dataClass) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const objectName = String(value);
  try {
    assertSafeObjectPath(objectName);
  } catch {
    throw new StorageMigrationSafetyError(
      `A ${dataClass} database reference has an unsafe object path.`,
      "SOURCE_DATABASE_REFERENCE_INVALID"
    );
  }
  return objectName;
}

function profileImageReference(row, config) {
  if (row.avatar_url === null || row.avatar_url === undefined || String(row.avatar_url).trim() === "") return null;
  let parsed;
  try {
    parsed = new URL(String(row.avatar_url));
  } catch {
    throw new StorageMigrationSafetyError(
      "A profile-image database reference is not an approved Supabase URL.",
      "SOURCE_DATABASE_REFERENCE_INVALID"
    );
  }
  let parts;
  try {
    parts = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    throw new StorageMigrationSafetyError(
      "A profile-image database reference has invalid URL encoding.",
      "SOURCE_DATABASE_REFERENCE_INVALID"
    );
  }
  const profileId = String(row.id || "");
  const fileMatch = /^avatar\.(?:jpg|png|webp)$/iu.exec(parts[6] || "");
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== `${config.expectedSourceProjectId}.supabase.co`
    || parsed.username
    || parsed.password
    || parsed.hash
    || parts.length !== 7
    || parts[0] !== "storage"
    || parts[1] !== "v1"
    || parts[2] !== "object"
    || !["public", "sign", "authenticated"].includes(parts[3])
    || parts[4] !== "profile-images"
    || parts[5] !== profileId
    || !/^[A-Za-z0-9._-]{1,200}$/u.test(profileId)
    || !fileMatch
  ) {
    throw new StorageMigrationSafetyError(
      "A profile-image database reference is outside the approved source contract.",
      "SOURCE_DATABASE_REFERENCE_INVALID"
    );
  }
  return `${profileId}/${fileMatch[0].toLowerCase().replace(".jpeg", ".jpg")}`;
}

function stakeholderLogoReference(row) {
  if (row.logo_url === null || row.logo_url === undefined || String(row.logo_url).trim() === "") return null;
  const prefix = "private://stakeholder-logos/";
  if (!String(row.logo_url).startsWith(prefix)) {
    throw new StorageMigrationSafetyError(
      "A stakeholder-logo database reference is outside the private source contract.",
      "SOURCE_DATABASE_REFERENCE_INVALID"
    );
  }
  return safeDatabaseObjectPath(String(row.logo_url).slice(prefix.length), "stakeholder-logo");
}

async function listSourceReferenceRows(fetchImpl, config, table, columns) {
  const rows = [];
  for (let offset = 0; offset < MAX_OBJECTS; offset += LIST_PAGE_SIZE) {
    const query = new URLSearchParams({ select: columns.join(","), order: `${columns[0]}.asc` });
    const response = await safeFetch(
      fetchImpl,
      "Supabase database reference snapshot",
      `${config.sourceUrl}/rest/v1/${table}?${query.toString()}`,
      {
        method: "GET",
        headers: {
          ...supabaseHeaders(config),
          range: `${offset}-${offset + LIST_PAGE_SIZE - 1}`,
          "range-unit": "items"
        }
      },
      [200, 206]
    );
    const page = await safeJson(response, "Supabase database reference snapshot");
    if (!Array.isArray(page) || page.length > LIST_PAGE_SIZE) {
      throw new StorageMigrationSafetyError(
        "A Supabase database reference response is malformed.",
        "SOURCE_DATABASE_REFERENCE_INVALID"
      );
    }
    for (const row of page) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new StorageMigrationSafetyError(
          "A Supabase database reference row is malformed.",
          "SOURCE_DATABASE_REFERENCE_INVALID"
        );
      }
      rows.push(row);
    }
    if (page.length < LIST_PAGE_SIZE) return rows;
  }
  throw new StorageMigrationSafetyError(
    "The Supabase database reference safety limit was exceeded.",
    "SOURCE_DATABASE_REFERENCE_LIMIT"
  );
}

export async function collectSourceDatabaseStorageReferences({ fetchImpl, config }) {
  const [profiles, contacts, attachments, stakeholderOrganizations] = await Promise.all([
    listSourceReferenceRows(fetchImpl, config, "profiles", ["id", "avatar_url"]),
    listSourceReferenceRows(fetchImpl, config, "contacts", ["id", "image_storage_path"]),
    listSourceReferenceRows(fetchImpl, config, "contact_note_attachments", ["id", "storage_path"]),
    listSourceReferenceRows(fetchImpl, config, "stakeholder_organizations", ["id", "logo_url"])
  ]);
  const references = new Set();
  const add = (sourceBucket, objectName) => {
    if (objectName !== null) references.add(databaseReferenceKey(sourceBucket, objectName));
  };
  for (const row of profiles) add("profile-images", profileImageReference(row, config));
  for (const row of contacts) {
    add("contact-images", safeDatabaseObjectPath(row.image_storage_path, "contact-image"));
  }
  for (const row of attachments) {
    add("contact-note-attachments", safeDatabaseObjectPath(row.storage_path, "contact-note attachment"));
  }
  for (const row of stakeholderOrganizations) {
    add("stakeholder-logos", stakeholderLogoReference(row));
  }
  return Object.freeze({
    references,
    fingerprint: `sha256:${crypto.createHash("sha256")
      .update(JSON.stringify([...references].sort()))
      .digest("hex")}`
  });
}

function sourceObjectFromEntry(sourceBucket, prefix, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new StorageMigrationSafetyError("A source listing entry is malformed.", "SOURCE_ENTRY_INVALID");
  }
  assertSafeDirectorySegment(entry.name);
  const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.id === null || entry.id === undefined) {
    if (entry.metadata !== null && entry.metadata !== undefined) {
      throw new StorageMigrationSafetyError("A source folder entry contains unexpected metadata.", "SOURCE_FOLDER_INVALID");
    }
    assertSafeObjectPath(`${objectName}/placeholder`);
    return Object.freeze({ kind: "directory", name: objectName });
  }
  if (typeof entry.id !== "string" || !entry.id || !entry.metadata || typeof entry.metadata !== "object") {
    throw new StorageMigrationSafetyError("A source object entry is missing immutable metadata.", "SOURCE_ENTRY_INVALID");
  }
  assertSafeObjectPath(objectName);
  const size = safeInteger(entry.metadata.size ?? entry.metadata.contentLength);
  const mimeType = normalizedMimeType(entry.metadata.mimetype ?? entry.metadata.contentType);
  const policy = SOURCE_BUCKET_POLICIES[sourceBucket];
  if (size === null || size < 1 || size > policy.maxBytes) {
    throw new StorageMigrationSafetyError("A source object has an invalid size.", "SOURCE_SIZE_INVALID");
  }
  if (!policy.mimeTypes.includes(mimeType)) {
    throw new StorageMigrationSafetyError("A source object has a MIME type outside its bucket allowlist.", "SOURCE_MIME_INVALID");
  }
  return Object.freeze({
    kind: "object",
    sourceBucket,
    name: objectName,
    targetName: migrationTargetObjectName(sourceBucket, objectName),
    sourceId: entry.id,
    size,
    mimeType,
    targetMimeType: targetMimeType(sourceBucket, mimeType),
    updatedAt: typeof entry.updated_at === "string" ? entry.updated_at : "",
    sourceEtag: typeof entry.metadata.eTag === "string"
      ? entry.metadata.eTag
      : typeof entry.metadata.etag === "string" ? entry.metadata.etag : ""
  });
}

export async function listSupabaseBucketObjects({
  fetchImpl,
  config,
  sourceBucket,
  pageSize = LIST_PAGE_SIZE
}) {
  assertAllowedSourceBucket(sourceBucket);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > LIST_PAGE_SIZE) {
    throw new StorageMigrationSafetyError("Source list page size is invalid.", "LIST_PAGE_SIZE_INVALID");
  }

  const directories = [""];
  const visitedDirectories = new Set();
  const objectNames = new Set();
  const objects = [];
  while (directories.length > 0) {
    const prefix = directories.shift();
    if (visitedDirectories.has(prefix)) {
      throw new StorageMigrationSafetyError("The source directory graph contains a duplicate.", "SOURCE_DIRECTORY_DUPLICATE");
    }
    visitedDirectories.add(prefix);
    if (visitedDirectories.size > MAX_DIRECTORIES) {
      throw new StorageMigrationSafetyError("The source directory limit was exceeded.", "SOURCE_DIRECTORY_LIMIT");
    }

    let offset = 0;
    while (true) {
      const response = await safeFetch(
        fetchImpl,
        "Supabase list",
        `${config.sourceUrl}/storage/v1/object/list/${encodeURIComponent(sourceBucket)}`,
        {
          method: "POST",
          headers: { ...supabaseHeaders(config), "content-type": "application/json" },
          body: JSON.stringify({
            prefix,
            limit: pageSize,
            offset,
            sortBy: { column: "name", order: "asc" }
          })
        },
        [200]
      );
      const entries = await safeJson(response, "Supabase list");
      if (!Array.isArray(entries) || entries.length > pageSize) {
        throw new StorageMigrationSafetyError("The Supabase list response is malformed.", "SOURCE_LIST_INVALID");
      }
      for (const entry of entries) {
        const parsed = sourceObjectFromEntry(sourceBucket, prefix, entry);
        if (parsed.kind === "directory") {
          if (visitedDirectories.has(parsed.name) || directories.includes(parsed.name)) {
            throw new StorageMigrationSafetyError("The source directory graph contains a duplicate.", "SOURCE_DIRECTORY_DUPLICATE");
          }
          directories.push(parsed.name);
        } else {
          if (objectNames.has(parsed.name)) {
            throw new StorageMigrationSafetyError("The source listing contains a duplicate object.", "SOURCE_OBJECT_DUPLICATE");
          }
          objectNames.add(parsed.name);
          objects.push(parsed);
          if (objects.length > MAX_OBJECTS) {
            throw new StorageMigrationSafetyError("The source object limit was exceeded.", "SOURCE_OBJECT_LIMIT");
          }
        }
      }
      offset += entries.length;
      if (entries.length < pageSize) break;
    }
  }
  objects.sort((left, right) => left.name.localeCompare(right.name));
  return Object.freeze(objects);
}

function sourceInventoryFingerprint(objects) {
  const canonical = objects.map((object) => ({
    sourceBucket: object.sourceBucket,
    name: object.name,
    sourceId: object.sourceId,
    size: object.size,
    mimeType: object.mimeType,
    updatedAt: object.updatedAt,
    sourceEtag: object.sourceEtag
  }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function pngImageMetadata(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer || buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let hasImageData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return null;
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      if (length !== 0 || end !== buffer.length || !width || !height || !hasImageData) return null;
      return Object.freeze({ width, height });
    }
    offset = end;
  }
  return null;
}

function jpegImageMetadata(buffer) {
  if (!buffer || buffer.length < 16 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let dimensions = null;
  while (offset + 4 <= buffer.length - 2) {
    if (buffer[offset] !== 0xff) return null;
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) break;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (length < 7) return null;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height) return null;
      dimensions = { width, height };
    }
    if (marker === 0xda) return dimensions;
    offset += length;
  }
  return null;
}

function webpImageMetadata(buffer) {
  if (
    !buffer
    || buffer.length < 25
    || buffer.subarray(0, 4).toString("ascii") !== "RIFF"
    || buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    || buffer.readUInt32LE(4) + 8 !== buffer.length
  ) return null;
  let offset = 12;
  let extendedDimensions = null;
  let imageDimensions = null;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    const paddedEnd = payloadEnd + (chunkSize % 2);
    if (payloadEnd > buffer.length || paddedEnd > buffer.length) return null;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      extendedDimensions = {
        width: 1 + buffer.readUIntLE(payloadStart + 4, 3),
        height: 1 + buffer.readUIntLE(payloadStart + 7, 3)
      };
    } else if (chunkType === "VP8L" && chunkSize >= 5 && buffer[payloadStart] === 0x2f) {
      imageDimensions = {
        width: 1 + (((buffer[payloadStart + 2] & 0x3f) << 8) | buffer[payloadStart + 1]),
        height: 1 + (((buffer[payloadStart + 4] & 0x0f) << 10) | (buffer[payloadStart + 3] << 2) | ((buffer[payloadStart + 2] & 0xc0) >> 6))
      };
    } else if (
      chunkType === "VP8 "
      && chunkSize >= 10
      && buffer[payloadStart + 3] === 0x9d
      && buffer[payloadStart + 4] === 0x01
      && buffer[payloadStart + 5] === 0x2a
    ) {
      imageDimensions = {
        width: buffer.readUInt16LE(payloadStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(payloadStart + 8) & 0x3fff
      };
    }
    offset = paddedEnd;
  }
  if (offset !== buffer.length || !imageDimensions?.width || !imageDimensions?.height) return null;
  return Object.freeze({
    width: Math.max(extendedDimensions?.width || 0, imageDimensions.width),
    height: Math.max(extendedDimensions?.height || 0, imageDimensions.height)
  });
}

function gifImageMetadata(buffer) {
  if (!buffer || buffer.length < 13 || !["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return width && height ? Object.freeze({ width, height }) : null;
}

function dimensionsAreAllowed(metadata) {
  return metadata && metadata.width <= 4096 && metadata.height <= 4096;
}

function decodedUtf8(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return "";
  }
  return text;
}

function removeLeadingXmlTrivia(text) {
  let remainder = text.replace(/^\uFEFF/u, "").trimStart();
  let hadXmlDeclaration = false;
  if (/^<\?xml\b/iu.test(remainder)) {
    const declarationEnd = remainder.indexOf("?>");
    if (declarationEnd < 0) {
      return Object.freeze({ remainder, hadXmlDeclaration: true, malformed: true });
    }
    hadXmlDeclaration = true;
    remainder = remainder.slice(declarationEnd + 2).trimStart();
  }
  while (remainder.startsWith("<!--")) {
    const commentEnd = remainder.indexOf("-->", 4);
    if (commentEnd < 0) {
      return Object.freeze({ remainder, hadXmlDeclaration, malformed: true });
    }
    remainder = remainder.slice(commentEnd + 3).trimStart();
  }
  return Object.freeze({ remainder, hadXmlDeclaration, malformed: false });
}

function removeTrailingXmlComments(text) {
  let remainder = text.trimEnd();
  while (remainder.endsWith("-->")) {
    const commentStart = remainder.lastIndexOf("<!--");
    if (commentStart < 0) return Object.freeze({ remainder, malformed: true });
    remainder = remainder.slice(0, commentStart).trimEnd();
  }
  return Object.freeze({ remainder, malformed: false });
}

function svgSignatureClass(buffer) {
  const text = decodedUtf8(buffer);
  if (!text) return "";
  const leading = removeLeadingXmlTrivia(text);
  if (leading.malformed) return leading.hadXmlDeclaration ? "svg-prolog-invalid" : "";
  let svgDocument = leading.remainder;
  let standardW3cDoctype = false;
  if (/^<!DOCTYPE\s+svg\b/iu.test(leading.remainder)) {
    if (/^<!DOCTYPE\s+svg\b[^>]*\[/iu.test(leading.remainder)) return "svg-doctype-internal-subset";
    const standardDoctype = STANDARD_W3C_SVG_DOCTYPE_PATTERN.exec(leading.remainder);
    if (!standardDoctype) return "svg-doctype-other";
    standardW3cDoctype = true;
    svgDocument = leading.remainder.slice(standardDoctype[0].length).trimStart();
  }
  if (!/^<svg\b/iu.test(svgDocument)) {
    return leading.hadXmlDeclaration ? "xml-non-svg" : "";
  }
  if (/<!DOCTYPE/iu.test(svgDocument)) return "svg-doctype-other";
  if (/<!ENTITY/iu.test(svgDocument)) return "svg-entity";
  if (/<script\b/iu.test(svgDocument)) return "svg-script";
  if (/<foreignObject\b/iu.test(svgDocument)) return "svg-foreign-object";
  if (/\son[a-z]+\s*=/iu.test(svgDocument)) return "svg-event-handler";
  if (/(?:href|src)\s*=\s*["']\s*javascript:/iu.test(svgDocument)) return "svg-javascript-reference";
  if (/(?:href|src)\s*=\s*["']\s*data:/iu.test(svgDocument)) {
    return /(?:href|src)\s*=\s*["']\s*data:image\/(?:png|jpeg|gif|webp);base64,/iu.test(svgDocument)
      ? "svg-embedded-raster-data"
      : "svg-other-data-reference";
  }
  if (/(?:href|src)\s*=\s*["']\s*https?:/iu.test(svgDocument)) return "svg-http-reference";
  if (/(?:href|src)\s*=\s*["']\s*\/\//iu.test(svgDocument)) return "svg-protocol-relative-reference";
  const trailing = removeTrailingXmlComments(svgDocument);
  if (trailing.malformed) return "svg-envelope-invalid";
  if (/<\/svg>$/iu.test(trailing.remainder)) return standardW3cDoctype ? "svg-standard-w3c-doctype" : "safe-svg";
  if (/^<svg\b(?:[^>"']|"[^"]*"|'[^']*')*\/>$/iu.test(trailing.remainder)) {
    return standardW3cDoctype ? "svg-standard-w3c-doctype" : "safe-svg";
  }
  return "svg-envelope-invalid";
}

function isPlainText(buffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return !text.includes("\u0000");
  } catch {
    return false;
  }
}

function contentSignatureClass(buffer) {
  const pngMetadata = pngImageMetadata(buffer);
  if (pngMetadata) return dimensionsAreAllowed(pngMetadata) ? "png" : "png-dimensions-exceeded";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png-structure-invalid";
  }
  const jpegMetadata = jpegImageMetadata(buffer);
  if (jpegMetadata) return dimensionsAreAllowed(jpegMetadata) ? "jpeg" : "jpeg-dimensions-exceeded";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg-structure-invalid";
  const webpMetadata = webpImageMetadata(buffer);
  if (webpMetadata) return dimensionsAreAllowed(webpMetadata) ? "webp" : "webp-dimensions-exceeded";
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return buffer.readUInt32LE(4) + 8 === buffer.length ? "webp-structure-invalid" : "webp-length-mismatch";
  const gifMetadata = gifImageMetadata(buffer);
  if (gifMetadata) return dimensionsAreAllowed(gifMetadata) ? "gif" : "gif-dimensions-exceeded";
  const svgClass = svgSignatureClass(buffer);
  if (svgClass) return svgClass;
  const utf8Text = decodedUtf8(buffer);
  if (/^\s*(?:<!doctype\s+html|<html\b)/iu.test(utf8Text)) return "html";
  if (/^\s*<\?xml\b/iu.test(utf8Text)) return "xml-non-svg";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
    return tail.includes("%%EOF") ? "pdf" : "pdf-without-eof";
  }
  if (
    buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && buffer[2] === 0x03
    && buffer[3] === 0x04
  ) {
    return buffer.includes(Buffer.from("[Content_Types].xml", "ascii"))
      && buffer.includes(Buffer.from("word/", "ascii"))
      ? "docx"
      : "zip-non-docx";
  }
  if (utf8Text && !utf8Text.includes("\u0000")) return "utf8-text";
  return buffer.length === 0 ? "empty" : "unknown-binary";
}

function contentMatchesMimeType(buffer, mimeType) {
  let signatureClass = contentSignatureClass(buffer);
  if (mimeType === "application/pdf" && signatureClass === "pdf") {
    signatureClass = "pdf-malware-scan-required";
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    && signatureClass === "docx"
  ) {
    signatureClass = "docx-malware-scan-required";
  }
  const expectedClasses = {
    "image/png": ["png"],
    "image/jpeg": ["jpeg"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "application/xml": ["safe-svg", "svg-standard-w3c-doctype"],
    "image/svg+xml": ["safe-svg", "svg-standard-w3c-doctype"],
    "text/xml": ["safe-svg", "svg-standard-w3c-doctype"],
    "text/plain": ["utf8-text"]
  };
  return Object.freeze({
    valid: expectedClasses[mimeType]?.includes(signatureClass) === true,
    signatureClass
  });
}

async function downloadSourceObject(fetchImpl, config, object) {
  const response = await safeFetch(
    fetchImpl,
    "Supabase download",
    `${config.sourceUrl}/storage/v1/object/${encodeURIComponent(object.sourceBucket)}/${encodedObjectPath(object.name)}`,
    {
      method: "GET",
      headers: supabaseHeaders(config)
    },
    [200]
  );
  const responseLength = response.headers.get("content-length");
  if (responseLength !== null && safeInteger(responseLength) !== object.size) {
    throw new StorageMigrationSafetyError("A source download size differs from its listing metadata.", "SOURCE_DOWNLOAD_SIZE_MISMATCH");
  }
  const responseMimeType = normalizedMimeType(response.headers.get("content-type"));
  if (responseMimeType && responseMimeType !== object.mimeType) {
    throw new StorageMigrationSafetyError("A source download MIME type differs from its listing metadata.", "SOURCE_DOWNLOAD_MIME_MISMATCH");
  }
  const responseEtag = response.headers.get("etag") || "";
  if (responseEtag.length > 512 || /[\u0000-\u001f\u007f]/u.test(responseEtag)) {
    throw new StorageMigrationSafetyError("A source download returned an invalid transport ETag.", "SOURCE_DOWNLOAD_ETAG_INVALID");
  }
  // Supabase list metadata contains the backing-store ETag, while the authenticated
  // download can expose a proxy/CDN transport ETag (including weak validators).
  // They are not guaranteed to describe the same representation and must not be
  // compared byte-for-byte. Stability is instead proven by the second complete
  // inventory plus the downloaded content SHA-256 below.
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== object.size) {
    throw new StorageMigrationSafetyError("A source object failed downloaded-size validation.", "SOURCE_CONTENT_SIZE_INVALID");
  }
  const contentContract = contentMatchesMimeType(buffer, object.mimeType);
  if (!contentContract.valid) {
    throw new SourceContentContractError(
      object,
      contentContract.signatureClass,
      crypto.createHash("sha256").update(buffer).digest("hex")
    );
  }
  return Object.freeze({
    ...object,
    buffer,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex")
  });
}

export async function collectSourceStorageSnapshot({ fetchImpl, config, sourceReferences = null }) {
  const firstInventory = [];
  for (const sourceBucket of ALLOWED_SOURCE_BUCKETS) {
    firstInventory.push(...await listSupabaseBucketObjects({ fetchImpl, config, sourceBucket }));
  }
  firstInventory.sort((left, right) => (
    left.sourceBucket.localeCompare(right.sourceBucket) || left.name.localeCompare(right.name)
  ));
  const totalBytes = firstInventory.reduce((sum, object) => sum + object.size, 0);
  if (firstInventory.length > MAX_OBJECTS || totalBytes > MAX_TOTAL_BYTES) {
    throw new StorageMigrationSafetyError("The source storage safety limit was exceeded.", "SOURCE_STORAGE_LIMIT");
  }
  const inventoryKeys = new Set(firstInventory.map((object) => databaseReferenceKey(object.sourceBucket, object.name)));
  if (sourceReferences) {
    for (const reference of sourceReferences) {
      if (!inventoryKeys.has(reference)) {
        throw new StorageMigrationSafetyError(
          "A database-referenced source object is absent from the immutable storage inventory.",
          "SOURCE_DATABASE_REFERENCE_MISSING"
        );
      }
    }
  }

  const downloaded = [];
  const quarantined = [];
  const contentContractFailures = new Map();
  for (const object of firstInventory) {
    try {
      const downloadedObject = await downloadSourceObject(fetchImpl, config, object);
      if (sourceReferences && !sourceReferences.has(databaseReferenceKey(object.sourceBucket, object.name))) {
        const { buffer: discardedBuffer, ...quarantinedObject } = downloadedObject;
        void discardedBuffer;
        const signatureClass = "unreferenced-orphan";
        quarantined.push(Object.freeze({ ...quarantinedObject, signatureClass }));
        const aggregateKey = `${object.sourceBucket}\u0000${object.mimeType}\u0000${signatureClass}`;
        const aggregate = contentContractFailures.get(aggregateKey) || {
          sourceBucket: object.sourceBucket,
          mimeType: object.mimeType,
          signatureClass,
          count: 0
        };
        aggregate.count += 1;
        contentContractFailures.set(aggregateKey, aggregate);
      } else {
        downloaded.push(downloadedObject);
      }
    } catch (error) {
      if (!(error instanceof SourceContentContractError)) throw error;
      quarantined.push(error.quarantinedObject);
      const aggregateKey = `${error.sourceBucket}\u0000${error.mimeType}\u0000${error.signatureClass}`;
      const aggregate = contentContractFailures.get(aggregateKey) || {
        sourceBucket: error.sourceBucket,
        mimeType: error.mimeType,
        signatureClass: error.signatureClass,
        count: 0
      };
      aggregate.count += 1;
      contentContractFailures.set(aggregateKey, aggregate);
    }
  }

  const secondInventory = [];
  for (const sourceBucket of ALLOWED_SOURCE_BUCKETS) {
    secondInventory.push(...await listSupabaseBucketObjects({ fetchImpl, config, sourceBucket }));
  }
  secondInventory.sort((left, right) => (
    left.sourceBucket.localeCompare(right.sourceBucket) || left.name.localeCompare(right.name)
  ));
  if (sourceInventoryFingerprint(firstInventory) !== sourceInventoryFingerprint(secondInventory)) {
    throw new StorageMigrationSafetyError("The source inventory changed during the snapshot.", "SOURCE_INVENTORY_CHANGED");
  }
  const quarantineSummary = [...contentContractFailures.values()]
    .sort((left, right) => (
      left.sourceBucket.localeCompare(right.sourceBucket)
      || left.mimeType.localeCompare(right.mimeType)
      || left.signatureClass.localeCompare(right.signatureClass)
    ))
    .map((aggregate) => Object.freeze({ ...aggregate }));
  return Object.freeze({
    objects: Object.freeze(downloaded),
    quarantined: Object.freeze(quarantined),
    quarantineSummary: Object.freeze(quarantineSummary),
    sourceObjectCount: firstInventory.length
  });
}

export function storageSnapshotFingerprint(snapshot, targetBuckets, quarantined = []) {
  const targetKeys = new Set();
  const canonical = snapshot.map((object) => {
    const mappedName = migrationTargetObjectName(object.sourceBucket, object.name);
    const targetKey = `${targetBuckets[object.sourceBucket]}\u0000${mappedName}`;
    if (targetKeys.has(targetKey)) {
      throw new StorageMigrationSafetyError(
        "Multiple source objects map to the same target object.",
        "TARGET_MAPPING_COLLISION"
      );
    }
    targetKeys.add(targetKey);
    return {
      sourceBucket: object.sourceBucket,
      targetBucket: targetBuckets[object.sourceBucket],
      sourceName: object.name,
      targetName: mappedName,
      size: object.size,
      mimeType: object.targetMimeType,
      sha256: object.sha256
    };
  });
  const canonicalQuarantine = quarantined.map((object) => ({
    sourceBucket: object.sourceBucket,
    sourceName: object.name,
    sourceId: object.sourceId,
    size: object.size,
    mimeType: object.mimeType,
    signatureClass: object.signatureClass,
    sha256: object.sha256
  }));
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify({
    schemaVersion: 2,
    migratable: canonical,
    quarantined: canonicalQuarantine
  })).digest("hex")}`;
}

function expectedBucketRole(sourceBucket) {
  return sourceBucket === "stakeholder-logos"
    ? "roles/storage.objectViewer"
    : "roles/storage.objectUser";
}

export function dataBucketIamFingerprint(config, projectNumber) {
  if (!/^\d+$/u.test(String(projectNumber || ""))) {
    throw new StorageMigrationSafetyError("The target project number is invalid.", "TARGET_PROJECT_MISMATCH");
  }
  const workloadPrincipal = `principal://iam.googleapis.com/projects/${projectNumber}/locations/global/`
    + `workloadIdentityPools/${config.expectedTargetProjectId}.svc.id.goog/subject/ns/`
    + `${config.targetNamespace}/sa/versorgungs-kompass-api`;
  const canonical = ALLOWED_SOURCE_BUCKETS.map((sourceBucket) => Object.freeze({
    bucket: config.targetBuckets[sourceBucket],
    role: expectedBucketRole(sourceBucket),
    member: workloadPrincipal
  })).sort((left, right) => left.bucket.localeCompare(right.bucket));
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

function assertExactBucketPolicy(policy, sourceBucket, expectedMember) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy) || !Array.isArray(policy.bindings)) {
    throw new StorageMigrationSafetyError("A target bucket IAM policy is malformed.", "TARGET_BUCKET_IAM_MISMATCH");
  }
  const bindings = policy.bindings.map((binding) => ({
    role: binding?.role,
    members: Array.isArray(binding?.members) ? [...binding.members].sort() : [],
    condition: binding?.condition
  }));
  if (
    bindings.length !== 1
    || bindings[0].role !== expectedBucketRole(sourceBucket)
    || bindings[0].members.length !== 1
    || bindings[0].members[0] !== expectedMember
    || bindings[0].condition !== undefined
  ) {
    throw new StorageMigrationSafetyError(
      "A target data bucket does not have the exact approved workload-only IAM policy.",
      "TARGET_BUCKET_IAM_MISMATCH"
    );
  }
}

async function verifyTargetProjectAndBuckets(fetchImpl, config) {
  const projectResponse = await safeFetch(
    fetchImpl,
    "Google project verification",
    `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(config.expectedTargetProjectId)}`,
    { method: "GET", headers: googleHeaders(config) },
    [200]
  );
  const project = await safeJson(projectResponse, "Google project verification");
  const projectNumber = /^projects\/(\d+)$/u.exec(project?.name || "")?.[1] || "";
  if (project.projectId !== config.expectedTargetProjectId || !projectNumber || project.state !== "ACTIVE") {
    throw new StorageMigrationSafetyError("The Google token did not verify the approved active target project.", "TARGET_PROJECT_MISMATCH");
  }
  const actualIamFingerprint = dataBucketIamFingerprint(config, projectNumber);
  if (!crypto.timingSafeEqual(
    Buffer.from(actualIamFingerprint),
    Buffer.from(config.expectedBucketIamFingerprint)
  )) {
    throw new StorageMigrationSafetyError(
      "The target data-bucket IAM contract does not match its independently approved pin.",
      "TARGET_BUCKET_IAM_PIN_MISMATCH"
    );
  }
  const expectedMember = `principal://iam.googleapis.com/projects/${projectNumber}/locations/global/`
    + `workloadIdentityPools/${config.expectedTargetProjectId}.svc.id.goog/subject/ns/`
    + `${config.targetNamespace}/sa/versorgungs-kompass-api`;

  for (const sourceBucket of ALLOWED_SOURCE_BUCKETS) {
    const bucketResponse = await safeFetch(
      fetchImpl,
      "GCS bucket verification",
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.targetBuckets[sourceBucket])}`
        + "?fields=name,projectNumber,location,iamConfiguration,versioning",
      { method: "GET", headers: googleHeaders(config) },
      [200]
    );
    const bucket = await safeJson(bucketResponse, "GCS bucket verification");
    if (
      bucket.name !== config.targetBuckets[sourceBucket]
      || String(bucket.projectNumber || "") !== projectNumber
      || String(bucket.location || "").toLowerCase() !== config.targetRegion
      || bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
      || bucket.iamConfiguration?.publicAccessPrevention !== "enforced"
      || bucket.versioning?.enabled !== true
    ) {
      throw new StorageMigrationSafetyError(
        "A target bucket is not the approved regional, private, versioned project bucket.",
        "TARGET_BUCKET_MISMATCH"
      );
    }
    const policyResponse = await safeFetch(
      fetchImpl,
      "GCS bucket IAM verification",
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.targetBuckets[sourceBucket])}/iam`
        + "?optionsRequestedPolicyVersion=3",
      { method: "GET", headers: googleHeaders(config) },
      [200]
    );
    assertExactBucketPolicy(
      await safeJson(policyResponse, "GCS bucket IAM verification"),
      sourceBucket,
      expectedMember
    );
  }
}

function gcsObjectMetadataUrl(bucket, objectName) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?fields=name,size,contentType,generation,metadata`;
}

async function inspectTargetObject(fetchImpl, config, object) {
  const targetBucket = config.targetBuckets[object.sourceBucket];
  const targetName = migrationTargetObjectName(object.sourceBucket, object.name);
  const metadataResponse = await safeFetch(
    fetchImpl,
    "GCS object metadata",
    gcsObjectMetadataUrl(targetBucket, targetName),
    { method: "GET", headers: googleHeaders(config) },
    [200, 404]
  );
  if (metadataResponse.status === 404) return Object.freeze({ state: "missing", object });
  const metadata = await safeJson(metadataResponse, "GCS object metadata");
  const size = safeInteger(metadata.size);
  const contentType = normalizedMimeType(metadata.contentType);
  if (
    metadata.name !== targetName
    || size !== object.size
    || contentType !== object.targetMimeType
    || !/^[0-9]+$/u.test(String(metadata.generation || ""))
  ) {
    throw new StorageMigrationSafetyError("A target object conflicts with the source snapshot.", "TARGET_OBJECT_CONFLICT");
  }
  const mediaUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(targetBucket)}/o/${encodeURIComponent(targetName)}`);
  mediaUrl.searchParams.set("alt", "media");
  mediaUrl.searchParams.set("generation", String(metadata.generation));
  const mediaResponse = await safeFetch(
    fetchImpl,
    "GCS object verification",
    mediaUrl.toString(),
    { method: "GET", headers: googleHeaders(config) },
    [200]
  );
  const targetBuffer = Buffer.from(await mediaResponse.arrayBuffer());
  const targetHash = crypto.createHash("sha256").update(targetBuffer).digest("hex");
  if (targetBuffer.length !== object.size || targetHash !== object.sha256) {
    throw new StorageMigrationSafetyError("A target object conflicts with the source SHA-256.", "TARGET_OBJECT_CONFLICT");
  }
  const recordedHash = metadata.metadata?.[HASH_METADATA_KEY];
  if (recordedHash !== undefined && recordedHash !== object.sha256) {
    throw new StorageMigrationSafetyError("A target object has conflicting migration metadata.", "TARGET_HASH_METADATA_CONFLICT");
  }
  return Object.freeze({ state: "identical", object });
}

async function planTargetChanges(fetchImpl, config, snapshot) {
  const missing = [];
  const identical = [];
  for (const object of snapshot) {
    const state = await inspectTargetObject(fetchImpl, config, object);
    if (state.state === "missing") missing.push(object);
    else identical.push(object);
  }
  return Object.freeze({ missing: Object.freeze(missing), identical: Object.freeze(identical) });
}

function multipartUploadBody(object) {
  const targetName = migrationTargetObjectName(object.sourceBucket, object.name);
  const boundary = `vk-storage-${crypto.randomBytes(16).toString("hex")}`;
  const metadata = Buffer.from(JSON.stringify({
    name: targetName,
    contentType: object.targetMimeType,
    cacheControl: "private, no-store",
    metadata: {
      [HASH_METADATA_KEY]: object.sha256,
      "versorgungs-kompass-migration": "supabase-storage-v1"
    }
  }), "utf8");
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, "ascii"),
    metadata,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${object.targetMimeType}\r\n\r\n`, "ascii"),
    object.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, "ascii")
  ]);
  return Object.freeze({ boundary, body });
}

async function createTargetObject(fetchImpl, config, object) {
  const targetBucket = config.targetBuckets[object.sourceBucket];
  const targetName = migrationTargetObjectName(object.sourceBucket, object.name);
  const multipart = multipartUploadBody(object);
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(targetBucket)}/o`);
  uploadUrl.searchParams.set("uploadType", "multipart");
  uploadUrl.searchParams.set("ifGenerationMatch", "0");
  uploadUrl.searchParams.set("fields", "name,size,contentType,generation,metadata");
  const response = await safeFetch(
    fetchImpl,
    "GCS create-only upload",
    uploadUrl.toString(),
    {
      method: "POST",
      headers: {
        ...googleHeaders(config),
        "content-type": `multipart/related; boundary=${multipart.boundary}`
      },
      body: multipart.body
    },
    [200, 201, 412]
  );
  if (response.status === 412) {
    const raced = await inspectTargetObject(fetchImpl, config, object);
    if (raced.state !== "identical") {
      throw new StorageMigrationSafetyError("A concurrent target object creation conflicted.", "TARGET_CREATE_RACE");
    }
    return "identical";
  }
  const created = await safeJson(response, "GCS create-only upload");
  if (
    created.name !== targetName
    || safeInteger(created.size) !== object.size
    || normalizedMimeType(created.contentType) !== object.targetMimeType
    || created.metadata?.[HASH_METADATA_KEY] !== object.sha256
  ) {
    throw new StorageMigrationSafetyError("GCS did not confirm the created object contract.", "TARGET_CREATE_INVALID");
  }
  const verified = await inspectTargetObject(fetchImpl, config, object);
  if (verified.state !== "identical") {
    throw new StorageMigrationSafetyError("The created target object failed verification.", "TARGET_CREATE_VERIFY_FAILED");
  }
  return "created";
}

function quarantineSummaryValue(quarantineSummary) {
  return quarantineSummary.length === 0
    ? "none"
    : quarantineSummary.map((aggregate) => (
      `${aggregate.sourceBucket}/${aggregate.mimeType}/${aggregate.signatureClass}:${aggregate.count}`
    )).join(",");
}

function sourceObjectKey(object) {
  return `${object.sourceBucket}\u0000${object.name}`;
}

export function buildStorageMigrationManifest({
  apply,
  snapshot,
  sourceSnapshot,
  config,
  plan,
  targetStatuses,
  snapshotFingerprint
}) {
  const planStatus = new Map([
    ...plan.missing.map((object) => [sourceObjectKey(object), "planned-create"]),
    ...plan.identical.map((object) => [sourceObjectKey(object), "verified-identical"])
  ]);
  const entries = [
    ...snapshot.map((object) => Object.freeze({
      sourceRef: Object.freeze({ bucket: object.sourceBucket, object: object.name }),
      targetObject: Object.freeze({
        bucket: config.targetBuckets[object.sourceBucket],
        object: migrationTargetObjectName(object.sourceBucket, object.name)
      }),
      sha256: `sha256:${object.sha256}`,
      size: object.size,
      mimeType: object.targetMimeType,
      status: targetStatuses.get(sourceObjectKey(object)) || planStatus.get(sourceObjectKey(object))
    })),
    ...sourceSnapshot.quarantined.map((object) => Object.freeze({
      sourceRef: Object.freeze({ bucket: object.sourceBucket, object: object.name }),
      targetObject: Object.freeze({
        bucket: config.targetBuckets[object.sourceBucket],
        object: migrationTargetObjectName(object.sourceBucket, object.name)
      }),
      sha256: `sha256:${object.sha256}`,
      size: object.size,
      mimeType: object.targetMimeType,
      status: "quarantined",
      reason: object.signatureClass
    }))
  ].sort((left, right) => (
    left.sourceRef.bucket.localeCompare(right.sourceRef.bucket)
    || left.sourceRef.object.localeCompare(right.sourceRef.object)
  ));
  if (entries.some((entry) => !entry.status)) {
    throw new StorageMigrationSafetyError("A manifest entry is missing target status.", "MANIFEST_STATUS_INVALID");
  }
  const payload = Object.freeze({
    schemaVersion: "versorgungs-kompass-storage-manifest-v1",
    mode: apply ? "apply" : "preview",
    sourceProject: config.expectedSourceProjectId,
    targetProject: config.expectedTargetProjectId,
    projectPairFingerprint: config.expectedProjectPairFingerprint,
    snapshotFingerprint,
    sourceObjectCount: sourceSnapshot.sourceObjectCount,
    migratableObjectCount: snapshot.length,
    quarantinedObjectCount: sourceSnapshot.quarantined.length,
    entries: Object.freeze(entries)
  });
  const manifestFingerprint = `sha256:${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  return Object.freeze({ ...payload, manifestFingerprint });
}

function summaryLine({ apply, snapshot, sourceSnapshot, plan, fingerprint, manifestFingerprint, createdCount }) {
  const byteCount = snapshot.reduce((sum, object) => sum + object.size, 0);
  return [
    `mode=${apply ? "APPLY" : "PREVIEW"}`,
    `object_count=${snapshot.length}`,
    `source_object_count=${sourceSnapshot.sourceObjectCount}`,
    `byte_count=${byteCount}`,
    `create_count=${apply ? createdCount : plan.missing.length}`,
    `identical_count=${apply ? snapshot.length - createdCount : plan.identical.length}`,
    `quarantine_count=${sourceSnapshot.quarantined.length}`,
    `quarantine=${quarantineSummaryValue(sourceSnapshot.quarantineSummary)}`,
    `fingerprint=${fingerprint}`,
    `manifest_fingerprint=${manifestFingerprint}`
  ].join(" ");
}

export async function runStorageMigration({
  environment,
  options,
  fetchImpl = fetch,
  log = console.log,
  manifestWriter = writeProtectedMigrationManifest,
  gcpGate = checkPreGematikMigrationGcp,
  journalFactory = createProtectedRecoveryJournal
}) {
  const config = buildStorageConfiguration(environment);
  validateApplyConfirmations(options, config);
  const manifestOutput = validateManifestOutputPath(
    options.manifestOutput || environment.STORAGE_MIGRATION_MANIFEST_PATH || ""
  );
  const requestedJournalPath = options.recoveryJournal
    || environment.STORAGE_MIGRATION_RECOVERY_JOURNAL_PATH
    || "";
  if (!options.apply && requestedJournalPath) {
    throw new StorageMigrationSafetyError(
      "A recovery journal is accepted only together with --apply.",
      "APPLY_FLAG_REQUIRED"
    );
  }
  const recoveryJournalPath = options.apply
    ? validateRecoveryJournalPath(requestedJournalPath)
    : "";
  const referencesBefore = await collectSourceDatabaseStorageReferences({ fetchImpl, config });
  const sourceSnapshot = await collectSourceStorageSnapshot({
    fetchImpl,
    config,
    sourceReferences: referencesBefore.references
  });
  const referencesAfter = await collectSourceDatabaseStorageReferences({ fetchImpl, config });
  if (referencesBefore.fingerprint !== referencesAfter.fingerprint) {
    throw new StorageMigrationSafetyError(
      "The source database storage references changed during the snapshot.",
      "SOURCE_DATABASE_REFERENCES_CHANGED"
    );
  }
  const snapshot = sourceSnapshot.objects;
  const fingerprint = storageSnapshotFingerprint(snapshot, config.targetBuckets, sourceSnapshot.quarantined);
  if (options.apply && options.confirmPreviewFingerprint !== fingerprint) {
    throw new StorageMigrationSafetyError(
      "The current source snapshot differs from the confirmed Preview fingerprint.",
      "PREVIEW_FINGERPRINT_MISMATCH"
    );
  }
  if (
    options.apply
    && Number(options.confirmQuarantinedObjectCount) !== sourceSnapshot.quarantined.length
  ) {
    throw new StorageMigrationSafetyError(
      "The current quarantined source object count differs from the explicit Apply confirmation.",
      "QUARANTINE_COUNT_MISMATCH"
    );
  }

  if (options.apply) {
    const gateEnvironment = Object.freeze({
      ...environment,
      PRE_IMPORT_BACKUP_ID: options.preImportBackupId
    });
    const gateResult = await gcpGate(gateEnvironment);
    if (gateResult?.ok !== true || !SHA256_PATTERN.test(gateResult.fingerprint || "")) {
      throw new StorageMigrationSafetyError(
        "The live GCP migration gate did not return a valid approval receipt.",
        "GCP_GATE_REQUIRED"
      );
    }
  }
  await verifyTargetProjectAndBuckets(fetchImpl, config);
  const plan = await planTargetChanges(fetchImpl, config, snapshot);
  let createdCount = 0;
  const targetStatuses = new Map();
  let manifest;
  let journal;
  try {
    if (options.apply) {
      journal = journalFactory(recoveryJournalPath);
      journal.record({
        event: "apply-start",
        snapshotFingerprint: fingerprint,
        backupId: options.preImportBackupId,
        plannedCreateCount: plan.missing.length
      });
      for (const object of plan.missing) {
        journal.record({
          event: "object-attempt",
          snapshotFingerprint: fingerprint,
          sourceBucket: object.sourceBucket,
          sourceObject: object.name,
          targetBucket: config.targetBuckets[object.sourceBucket],
          targetObject: migrationTargetObjectName(object.sourceBucket, object.name),
          sha256: `sha256:${object.sha256}`
        });
        const result = await createTargetObject(fetchImpl, config, object);
        const status = result === "created" ? "created" : "verified-identical";
        targetStatuses.set(sourceObjectKey(object), status);
        journal.record({
          event: "object-verified",
          snapshotFingerprint: fingerprint,
          sourceBucket: object.sourceBucket,
          sourceObject: object.name,
          status,
          sha256: `sha256:${object.sha256}`
        });
        if (result === "created") createdCount += 1;
      }
    }
    manifest = buildStorageMigrationManifest({
      apply: options.apply,
      snapshot,
      sourceSnapshot,
      config,
      plan,
      targetStatuses,
      snapshotFingerprint: fingerprint
    });
    manifestWriter(manifestOutput, manifest);
    if (journal) {
      journal.record({
        event: "apply-complete",
        snapshotFingerprint: fingerprint,
        manifestFingerprint: manifest.manifestFingerprint,
        createdCount
      });
    }
  } finally {
    journal?.close();
  }
  log(summaryLine({
    apply: options.apply,
    snapshot,
    sourceSnapshot,
    plan,
    fingerprint,
    manifestFingerprint: manifest.manifestFingerprint,
    createdCount
  }));
  return Object.freeze({
    fingerprint,
    objectCount: snapshot.length,
    sourceObjectCount: sourceSnapshot.sourceObjectCount,
    quarantineCount: sourceSnapshot.quarantined.length,
    quarantineSummary: sourceSnapshot.quarantineSummary,
    manifestFingerprint: manifest.manifestFingerprint,
    createdCount,
    plan
  });
}

export function storageMigrationUsage() {
  return `Supabase Storage -> GCS migration

Preview (default, read-only):
  node scripts/migrate_supabase_storage_to_gcs.mjs \\
    --manifest-output /absolute/protected/path/storage-preview.json

Apply after a reviewed Preview:
  node scripts/migrate_supabase_storage_to_gcs.mjs \\
    --apply \\
    --confirm-source-project <protected-source-project-id> \\
    --confirm-target-project <protected-target-project-id> \\
    --pre-import-backup-id <backup-id> \\
    --confirm-preview-fingerprint sha256:<preview-fingerprint> \\
    --confirm-quarantined-object-count <preview-count> \\
    --manifest-output /absolute/protected/path/storage-apply.json \\
    --recovery-journal /absolute/protected/path/storage-apply.ndjson \\
    --confirm-operation ${OPERATION_CONFIRMATION}

Required environment:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_OAUTH_ACCESS_TOKEN
  EXPECTED_SOURCE_PROJECT_ID, EXPECTED_TARGET_PROJECT_ID
  EXPECTED_STORAGE_PROJECT_PAIR_SHA256
  GCP_REGION, K8S_NAMESPACE, PRE_GEMATIK_DATA_BUCKET_IAM_SHA256
  PROFILE_IMAGE_BUCKET, CONTACT_IMAGE_BUCKET
  CONTACT_NOTE_ATTACHMENT_BUCKET, STAKEHOLDER_LOGO_BUCKET
  STORAGE_MIGRATION_MANIFEST_PATH may replace --manifest-output.
  STORAGE_MIGRATION_RECOVERY_JOURNAL_PATH may replace --recovery-journal.

Only database-referenced objects from four immutable source buckets are eligible.
Unreferenced objects and legacy PDF/DOCX files without an approved malware/CDR
scan are quarantined and never uploaded. ${PROTECTED_SOURCE_BUCKET} is always forbidden.
The create-only manifest and durable recovery journal use mode 0600 outside the
repository. Their paths and contents are never logged. No object names, URLs,
credentials or response bodies are logged.`;
}

function safeCliError(error) {
  if (error instanceof StorageMigrationSafetyError) return `${error.name}: ${error.message}`;
  return "StorageMigrationError: Migration failed safely; credentials, URLs and object names were not logged.";
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  let options;
  try {
    options = parseStorageMigrationArguments(argv);
  } catch (error) {
    console.error(safeCliError(error));
    return 2;
  }
  if (options.help) {
    console.log(storageMigrationUsage());
    return 0;
  }
  try {
    await runStorageMigration({ environment, options });
    return 0;
  } catch (error) {
    console.error(safeCliError(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
