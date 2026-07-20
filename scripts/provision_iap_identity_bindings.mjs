#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  TargetDatabaseConnectionError,
  validateTargetDatabaseConnection
} from "./lib/target-database-connection.mjs";
import { checkPreGematikMigrationGcp } from "./check_pre_gematik_migration_gcp.mjs";
import {
  CloudSqlManagedProxyError,
  assertCloudSqlGateTarget,
  assertManagedCloudSqlProxyMatchesGate,
  startManagedCloudSqlAuthProxy
} from "./lib/cloud-sql-managed-proxy.mjs";

const { Client } = pg;

const EXPECTED_ENVIRONMENT = "pre-gematik";
const INPUT_VERSION = 1;
const MAX_BINDINGS = 500;
const MAX_INPUT_BYTES = 1024 * 1024;
const APPLY_OPERATION_CONFIRMATION = "UPSERT_IAP_IDENTITY_BINDINGS";
const DATABASE_URL_ENV = "PRE_GEMATIK_IDENTITY_ADMIN_DATABASE_URL";
const TARGET_FINGERPRINT_ENV = "PRE_GEMATIK_IDENTITY_TARGET_SHA256";
const ADVISORY_LOCK_NAME = "versorgungs-kompass:pre-gematik:identity-bindings";
export const EXPECTED_IAP_ISSUER = "https://cloud.google.com/iap";

export class SafeCliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "SafeCliError";
    this.exitCode = exitCode;
  }
}

export class IdentityCommitOutcomeUnknownError extends SafeCliError {
  constructor(inputFingerprint, expectedStateFingerprint) {
    super(
      `COMMIT-Ergebnis ist unbekannt. Keine automatische Wiederholung. `
      + `Mit einer neuen Read-only-Verbindung den vollstaendigen Bindungszustand pruefen: `
      + `input_fingerprint=${inputFingerprint} expected_state_fingerprint=${expectedStateFingerprint}.`,
      1
    );
    this.name = "IdentityCommitOutcomeUnknownError";
    this.code = "IDENTITY_COMMIT_OUTCOME_UNKNOWN";
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new SafeCliError(`${label} muss ein JSON-Objekt sein.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SafeCliError(`${label} enthaelt fehlende oder nicht erlaubte Felder.`);
  }
}

function assertCleanText(value, label, maximumLength) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new SafeCliError(`${label} muss eine nicht-leere, unveraenderte Zeichenkette sein.`);
  }
  if (value.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new SafeCliError(`${label} hat eine unzulaessige Laenge oder enthaelt Steuerzeichen.`);
  }
}

function validateIssuer(issuer) {
  assertCleanText(issuer, "issuer", 2048);
  if (issuer !== EXPECTED_IAP_ISSUER) {
    throw new SafeCliError(`issuer muss exakt dem freigegebenen IAP-Issuer ${EXPECTED_IAP_ISSUER} entsprechen.`);
  }
}

function validateSubject(subject) {
  assertCleanText(subject, "subject", 512);
}

function validateProfileId(profileId) {
  assertCleanText(profileId, "profile_id", 512);
}

export function validateBindingDocument(value) {
  assertExactKeys(value, ["version", "bindings"], "Eingabedokument");
  if (value.version !== INPUT_VERSION) {
    throw new SafeCliError(`Eingabedokument muss version ${INPUT_VERSION} verwenden.`);
  }
  if (!Array.isArray(value.bindings) || value.bindings.length === 0 || value.bindings.length > MAX_BINDINGS) {
    throw new SafeCliError(`bindings muss zwischen 1 und ${MAX_BINDINGS} Eintraege enthalten.`);
  }

  const bindingKeys = new Set();
  const profileKeys = new Set();
  const bindings = value.bindings.map((binding, index) => {
    const label = `bindings[${index}]`;
    assertExactKeys(binding, ["issuer", "subject", "profile_id", "active"], label);
    validateIssuer(binding.issuer);
    validateSubject(binding.subject);
    validateProfileId(binding.profile_id);
    if (typeof binding.active !== "boolean") {
      throw new SafeCliError(`${label}.active muss true oder false sein.`);
    }

    const bindingKey = `${binding.issuer}\u0000${binding.subject}`;
    const profileKey = `${binding.issuer}\u0000${binding.profile_id}`;
    if (bindingKeys.has(bindingKey)) {
      throw new SafeCliError("Eingabedokument enthaelt eine doppelte issuer/subject-Bindung.");
    }
    if (profileKeys.has(profileKey)) {
      throw new SafeCliError("Eingabedokument enthaelt eine doppelte issuer/profile_id-Bindung.");
    }
    bindingKeys.add(bindingKey);
    profileKeys.add(profileKey);

    return Object.freeze({
      issuer: binding.issuer,
      subject: binding.subject,
      profile_id: binding.profile_id,
      active: binding.active
    });
  });

  bindings.sort((left, right) => (
    left.issuer.localeCompare(right.issuer)
    || left.subject.localeCompare(right.subject)
    || left.profile_id.localeCompare(right.profile_id)
  ));
  return Object.freeze({ version: INPUT_VERSION, bindings: Object.freeze(bindings) });
}

export function bindingDocumentFingerprint(document) {
  const canonicalDocument = validateBindingDocument(document);
  const canonical = JSON.stringify(canonicalDocument);
  return `sha256:${crypto.createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function bindingStateFingerprint(bindings) {
  const canonicalBindings = bindings.map((binding) => ({
    issuer: binding.issuer,
    subject: binding.subject,
    profile_id: binding.profile_id,
    active: binding.active
  })).sort((left, right) => (
    left.issuer.localeCompare(right.issuer)
    || left.subject.localeCompare(right.subject)
    || left.profile_id.localeCompare(right.profile_id)
  ));
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify({ version: INPUT_VERSION, bindings: canonicalBindings }), "utf8")
    .digest("hex")}`;
}

function isInsideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function loadProtectedBindingDocument(inputPath, { repositoryRoot } = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new SafeCliError("--input mit dem Pfad zu einer geschuetzten JSON-Datei ist erforderlich.");
  }

  const requestedPath = path.resolve(inputPath);
  let linkStat;
  try {
    linkStat = await fs.lstat(requestedPath);
  } catch {
    throw new SafeCliError("Die angegebene Eingabedatei kann nicht gelesen werden.");
  }
  if (linkStat.isSymbolicLink()) {
    throw new SafeCliError("Die geschuetzte Eingabedatei darf kein symbolischer Link sein.");
  }

  const resolvedPath = await fs.realpath(requestedPath);
  const root = repositoryRoot ? await fs.realpath(repositoryRoot) : null;
  if (root && isInsideDirectory(resolvedPath, root)) {
    throw new SafeCliError("Die geschuetzte Eingabedatei muss ausserhalb des Git-Worktrees liegen.");
  }

  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_INPUT_BYTES) {
    throw new SafeCliError("Die Eingabedatei muss eine nicht-leere regulaere JSON-Datei unter 1 MiB sein.");
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new SafeCliError("Die Eingabedatei muss private Dateirechte besitzen (z. B. chmod 600).");
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new SafeCliError("Die Eingabedatei muss dem aufrufenden Betriebssystemkonto gehoeren.");
  }

  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  } catch {
    throw new SafeCliError("Die geschuetzte Eingabedatei enthaelt kein gueltiges JSON.");
  }
  return validateBindingDocument(parsed);
}

function requiredOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new SafeCliError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseArguments(argv) {
  const options = {
    apply: false,
    allowActiveBindings: false,
    help: false,
    input: "",
    confirmEnvironment: "",
    confirmDatabase: "",
    confirmOperation: "",
    confirmFingerprint: ""
  };
  const valueOptions = new Map([
    ["--input", "input"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-database", "confirmDatabase"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--allow-active-bindings") {
      options.allowActiveBindings = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (valueOptions.has(argument)) {
      const optionValue = requiredOptionValue(argv, index, argument);
      options[valueOptions.get(argument)] = optionValue;
      index += 1;
    } else {
      throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
    }
  }
  return Object.freeze(options);
}

export function assertIdentityTargetDatabaseConnection(connectionString) {
  try {
    return validateTargetDatabaseConnection(connectionString);
  } catch (error) {
    if (error instanceof TargetDatabaseConnectionError) {
      throw new SafeCliError(error.message);
    }
    throw error;
  }
}

export function identityTargetFingerprint(connectionString) {
  const target = assertIdentityTargetDatabaseConnection(connectionString);
  const canonicalTarget = `${target.hostname}\u0000${target.port}\u0000${target.database}`;
  return `sha256:${crypto.createHash("sha256").update(canonicalTarget, "utf8").digest("hex")}`;
}

export function validateIdentityTargetFingerprint(connectionString, expectedFingerprint) {
  const actualFingerprint = identityTargetFingerprint(connectionString);
  if (
    typeof expectedFingerprint !== "string"
    || !/^sha256:[a-f0-9]{64}$/u.test(expectedFingerprint)
    || !crypto.timingSafeEqual(Buffer.from(actualFingerprint), Buffer.from(expectedFingerprint))
  ) {
    throw new SafeCliError("Das Datenbankziel entspricht nicht dem geschuetzten Ziel-Fingerprint.");
  }
  return actualFingerprint;
}

export function validateExecutionConfirmations(options, document, fingerprint) {
  assert.equal(typeof fingerprint, "string");
  const activeRequestedCount = document.bindings.filter((binding) => binding.active).length;

  if (!options.apply) {
    if (options.allowActiveBindings) {
      throw new SafeCliError("--allow-active-bindings ist nur zusammen mit --apply erlaubt.");
    }
    return;
  }
  if (options.confirmEnvironment !== EXPECTED_ENVIRONMENT) {
    throw new SafeCliError(`Apply erfordert --confirm-environment ${EXPECTED_ENVIRONMENT}.`);
  }
  if (!options.confirmDatabase) {
    throw new SafeCliError("Apply erfordert --confirm-database mit dem erwarteten Datenbanknamen.");
  }
  if (options.confirmOperation !== APPLY_OPERATION_CONFIRMATION) {
    throw new SafeCliError(`Apply erfordert --confirm-operation ${APPLY_OPERATION_CONFIRMATION}.`);
  }
  if (options.confirmFingerprint !== fingerprint) {
    throw new SafeCliError("Apply erfordert den exakten Fingerprint aus dem unmittelbar zuvor geprueften Preview.");
  }
  if (activeRequestedCount > 0 && !options.allowActiveBindings) {
    throw new SafeCliError("Aktive Bindungen erfordern zusaetzlich --allow-active-bindings.");
  }
}

function bindingKey(binding) {
  return `${binding.issuer}\u0000${binding.subject}`;
}

function profileBindingKey(binding) {
  return `${binding.issuer}\u0000${binding.profile_id}`;
}

export function buildIdentityBindingPlan(document, profileRows, existingRows) {
  const profiles = new Map(profileRows.map((profile) => [profile.id, profile]));
  const existingByBinding = new Map(existingRows.map((binding) => [bindingKey(binding), binding]));
  const existingByProfile = new Map(existingRows.map((binding) => [profileBindingKey(binding), binding]));
  const requestedKeys = new Set(document.bindings.map(bindingKey));
  const unknownExistingCount = existingRows.filter((binding) => !requestedKeys.has(bindingKey(binding))).length;
  const missingProfiles = document.bindings.filter((binding) => !profiles.has(binding.profile_id));
  const inactiveProfileActivations = document.bindings.filter((binding) => (
    binding.active && profiles.has(binding.profile_id) && profiles.get(binding.profile_id).active !== true
  ));
  if (missingProfiles.length > 0) {
    throw new SafeCliError(`Die Zieldatenbank enthaelt ${missingProfiles.length} angeforderte Profile nicht.`);
  }
  if (inactiveProfileActivations.length > 0) {
    throw new SafeCliError(`${inactiveProfileActivations.length} aktive Bindungen verweisen auf inaktive Profile.`);
  }
  if (unknownExistingCount > 0) {
    throw new SafeCliError(
      `${unknownExistingCount} bestehende Bindungen fehlen im vollstaendigen Sollzustand; der Vorgang wurde fail-closed abgebrochen.`
    );
  }

  const inserts = [];
  const updates = [];
  const unchanged = [];
  let remapConflicts = 0;
  let profileCollisions = 0;
  for (const requested of document.bindings) {
    const existing = existingByBinding.get(bindingKey(requested));
    if (existing) {
      if (existing.profile_id !== requested.profile_id) {
        remapConflicts += 1;
      } else if (existing.active !== requested.active) {
        updates.push(requested);
      } else {
        unchanged.push(requested);
      }
      continue;
    }
    const existingProfileBinding = existingByProfile.get(profileBindingKey(requested));
    if (existingProfileBinding) {
      profileCollisions += 1;
    } else {
      inserts.push(requested);
    }
  }
  if (remapConflicts > 0) {
    throw new SafeCliError(`${remapConflicts} bestehende Bindungen wuerden auf andere Profile umgebogen; der Vorgang wurde abgebrochen.`);
  }
  if (profileCollisions > 0) {
    throw new SafeCliError(`${profileCollisions} Profile besitzen fuer denselben issuer bereits eine andere Bindung; der Vorgang wurde abgebrochen.`);
  }

  return Object.freeze({
    inserts: Object.freeze(inserts),
    updates: Object.freeze(updates),
    unchanged: Object.freeze(unchanged),
    requestedCount: document.bindings.length,
    activeRequestedCount: document.bindings.filter((binding) => binding.active).length,
    deactivateCount: updates.filter((binding) => !binding.active).length,
    existingCount: existingRows.length,
    unknownExistingCount,
    currentStateFingerprint: bindingStateFingerprint(existingRows),
    expectedStateFingerprint: bindingDocumentFingerprint(document)
  });
}

export function formatPlanSummary(plan, fingerprint, applied) {
  const fields = {
    mode: applied ? "APPLY" : "PREVIEW",
    requested_count: plan.requestedCount,
    active_requested_count: plan.activeRequestedCount,
    insert_count: plan.inserts.length,
    update_count: plan.updates.length,
    deactivate_count: plan.deactivateCount,
    unchanged_count: plan.unchanged.length,
    unknown_existing_count: plan.unknownExistingCount,
    current_state_fingerprint: plan.currentStateFingerprint,
    expected_state_fingerprint: plan.expectedStateFingerprint,
    fingerprint
  };
  return Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(" ");
}

function booleanPrivilege(value) {
  return value === true || value === "t";
}

export async function executeIdentityBindingTransaction({
  client,
  document,
  fingerprint,
  apply,
  expectedDatabase,
  log = console.log
}) {
  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);

    const databaseResult = await client.query("select current_database() as database_name");
    if (apply && databaseResult.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname entspricht nicht --confirm-database.");
    }

    const privilegeResult = await client.query(
      `select
         has_table_privilege(current_user, 'public.profiles', 'SELECT') as profile_select,
         has_table_privilege(current_user, 'public.identity_bindings', 'SELECT') as binding_select,
         has_table_privilege(current_user, 'public.identity_bindings', 'INSERT') as binding_insert,
         has_table_privilege(current_user, 'public.identity_bindings', 'UPDATE') as binding_update`
    );
    const privileges = privilegeResult.rows[0] || {};
    if (!booleanPrivilege(privileges.profile_select) || !booleanPrivilege(privileges.binding_select)) {
      throw new SafeCliError("Das Datenbankkonto besitzt nicht die erforderlichen Leserechte.");
    }
    if (apply && (!booleanPrivilege(privileges.binding_insert) || !booleanPrivilege(privileges.binding_update))) {
      throw new SafeCliError("Das Datenbankkonto besitzt nicht die erforderlichen administrativen Schreibrechte.");
    }

    const profileIds = [...new Set(document.bindings.map((binding) => binding.profile_id))];
    const profileResult = await client.query(
      "select id, active from public.profiles where id = any($1::text[])",
      [profileIds]
    );
    const existingResult = await client.query(
      "select issuer, subject, profile_id, active from public.identity_bindings order by issuer, subject"
    );
    const plan = buildIdentityBindingPlan(document, profileResult.rows, existingResult.rows);

    if (!apply) {
      await client.query("rollback");
      transactionOpen = false;
      log(formatPlanSummary(plan, fingerprint, false));
      return plan;
    }

    for (const binding of plan.inserts) {
      await client.query(
        `insert into public.identity_bindings (issuer, subject, profile_id, active)
         values ($1, $2, $3, $4)`,
        [binding.issuer, binding.subject, binding.profile_id, binding.active]
      );
    }
    for (const binding of plan.updates) {
      const updateResult = await client.query(
        `update public.identity_bindings
            set active = $4,
                updated_at = now()
          where issuer = $1
            and subject = $2
            and profile_id = $3`,
        [binding.issuer, binding.subject, binding.profile_id, binding.active]
      );
      if (updateResult.rowCount !== 1) {
        throw new SafeCliError("Eine bestehende Bindung wurde waehrend der Transaktion veraendert; Apply wurde abgebrochen.");
      }
    }

    const finalStateResult = await client.query(
      "select issuer, subject, profile_id, active from public.identity_bindings order by issuer, subject"
    );
    const expectedFinalCount = plan.existingCount + plan.inserts.length;
    const finalStateFingerprint = bindingStateFingerprint(finalStateResult.rows);
    if (
      finalStateResult.rows.length !== expectedFinalCount
      || !crypto.timingSafeEqual(
        Buffer.from(finalStateFingerprint),
        Buffer.from(plan.expectedStateFingerprint)
      )
    ) {
      throw new SafeCliError("Die vollstaendige Abschlusskontrolle des Bindungszustands ist fehlgeschlagen; Apply wurde abgebrochen.");
    }
    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      transactionOpen = false;
      throw new IdentityCommitOutcomeUnknownError(fingerprint, plan.expectedStateFingerprint);
    }
    transactionOpen = false;
    log(formatPlanSummary(plan, fingerprint, true));
    return plan;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      try {
        await client.query("rollback");
      } catch {
        // Die urspruengliche, bereits bereinigte Fehlermeldung hat Vorrang.
      }
    }
    throw error;
  }
}

export function repositoryRootFromGit(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw new SafeCliError("Der Git-Worktree konnte nicht sicher bestimmt werden.");
  }
}

export function usage() {
  return `IAP-Identity-Bindungen fuer pre-gematik sicher provisionieren

Preview (Standard, immer Rollback):
  node scripts/provision_iap_identity_bindings.mjs --input /geschuetzter/pfad/bindings.json

Apply nach geprueftem Preview:
  node scripts/provision_iap_identity_bindings.mjs \\
    --input /geschuetzter/pfad/bindings.json \\
    --apply \\
    --confirm-environment ${EXPECTED_ENVIRONMENT} \\
    --confirm-database versorgungs_kompass \\
    --confirm-operation ${APPLY_OPERATION_CONFIRMATION} \\
    --confirm-fingerprint sha256:<fingerprint-aus-preview> \\
    [--allow-active-bindings]

Die Datenbankverbindung wird ausschliesslich aus ${DATABASE_URL_ENV} gelesen. Ein
Ein Preview darf ein Remote-Ziel nur mit sslmode=verify-full und absoluter CA-Datei
verwenden. Apply verlangt eine Loopback-Credential-Vorlage mit sslmode=disable. Zusaetzlich
wird ${TARGET_FINGERPRINT_ENV} (SHA-256 ueber Host, Port und Datenbank) geprueft.
Apply fuehrt zusaetzlich den read-only GCP-/Cloud-SQL-/Backup-Gate mit den
Operatorvariablen aus config/pre-gematik/migration.env.example erneut aus und
startet den per SHA-256 gepinnten offiziellen Cloud SQL Auth Proxy selbst fuer
exakt den dort freigegebenen Instanznamen auf einem privaten Unix-Socket.
Die JSON-Datei muss ausserhalb des Git-Worktrees liegen und private Dateirechte besitzen.`;
}

function safeErrorMessage(error) {
  if (error instanceof SafeCliError) return error.message;
  const code = typeof error?.code === "string" && /^[A-Z0-9]{2,12}$/u.test(error.code)
    ? ` (Code ${error.code})`
    : "";
  return `Die Datenbankoperation ist fehlgeschlagen${code}. Verbindungs- und Eingabedaten wurden nicht ausgegeben.`;
}

export async function assertFreshGcpMigrationGate(environment, gcpGate = checkPreGematikMigrationGcp) {
  const gateResult = await gcpGate(environment);
  try {
    assertCloudSqlGateTarget(gateResult);
  } catch (error) {
    if (!(error instanceof CloudSqlManagedProxyError)) throw error;
    throw new SafeCliError(
      "Apply erfordert ein frisches erfolgreiches GCP-, Cloud-SQL- und Backup-Gate."
    );
  }
  return gateResult;
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  {
    ClientClass = Client,
    gcpGate = checkPreGematikMigrationGcp,
    cloudSqlProxyFactory = startManagedCloudSqlAuthProxy,
    managedProxyGateVerifier = assertManagedCloudSqlProxyMatchesGate
  } = {}
) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const repositoryRoot = repositoryRootFromGit();
  const document = await loadProtectedBindingDocument(options.input, { repositoryRoot });
  const fingerprint = bindingDocumentFingerprint(document);
  validateExecutionConfirmations(options, document, fingerprint);

  const connectionString = env[DATABASE_URL_ENV];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    throw new SafeCliError(`Die Umgebungsvariable ${DATABASE_URL_ENV} fehlt.`);
  }
  validateIdentityTargetFingerprint(connectionString, env[TARGET_FINGERPRINT_ENV]);
  const gateResult = options.apply ? await assertFreshGcpMigrationGate(env, gcpGate) : null;

  let managedProxy = null;
  let client = null;
  try {
    if (gateResult) {
      try {
        managedProxy = await cloudSqlProxyFactory({
          gateResult,
          targetDatabaseUrl: connectionString,
          environment: env
        });
        managedProxyGateVerifier(managedProxy, gateResult);
        client = managedProxy.createClient("vk-iap-identity-provisioner");
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) throw new SafeCliError(error.message);
        throw error;
      }
    } else {
      client = new ClientClass({
        connectionString,
        application_name: "vk-iap-identity-provisioner"
      });
    }
    await client.connect();
    if (managedProxy) {
      try {
        const freshGateResult = await assertFreshGcpMigrationGate(env, gcpGate);
        managedProxyGateVerifier(managedProxy, freshGateResult);
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) {
          throw new SafeCliError(error.message);
        }
        throw error;
      }
    }
    await executeIdentityBindingTransaction({
      client,
      document,
      fingerprint,
      apply: options.apply,
      expectedDatabase: options.confirmDatabase,
      log: console.log
    });
  } finally {
    if (client) await client.end().catch(() => {});
    if (managedProxy) await managedProxy.stop().catch(() => {});
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FEHLER: ${safeErrorMessage(error)}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
