#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  SafeCliError,
  assertFreshGcpMigrationGate,
  validateIdentityTargetFingerprint
} from "./provision_iap_identity_bindings.mjs";
import {
  CloudSqlManagedProxyError,
  assertManagedCloudSqlProxyMatchesGate,
  startManagedCloudSqlAuthProxy
} from "./lib/cloud-sql-managed-proxy.mjs";
import { checkPreGematikMigrationGcp } from "./check_pre_gematik_migration_gcp.mjs";
import { EXPECTED_ALLOWLIST_ADMIN_ROLE } from "./prepare_pre_gematik_test_access_allowlist_operator.mjs";

const { Client } = pg;

const INPUT_VERSION = 1;
const MAX_ENTRIES = 1000;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const EXPECTED_ENVIRONMENT = "pre-gematik";
const APPLY_OPERATION = "APPLY_PRE_GEMATIK_TEST_ACCESS_ALLOWLIST";
const ADVISORY_LOCK = "versorgungs-kompass:pre-gematik:identity-bindings";
const DATABASE_URL_ENV = "PRE_GEMATIK_ALLOWLIST_ADMIN_DATABASE_URL";
const TARGET_FINGERPRINT_ENV = "PRE_GEMATIK_ALLOWLIST_TARGET_SHA256";
const REPOSITORY_ROOT_ENV = "PRE_GEMATIK_ALLOWLIST_REPOSITORY_ROOT";

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, label) {
  if (!isObject(value)) throw new SafeCliError(`${label} muss ein Objekt sein.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SafeCliError(`${label} enthaelt fehlende oder nicht erlaubte Felder.`);
  }
}

function cleanText(value, label, maximum, pattern) {
  if (
    typeof value !== "string"
    || !value
    || value !== value.trim()
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)
    || (pattern && !pattern.test(value))
  ) {
    throw new SafeCliError(`${label} ist ungueltig.`);
  }
}

function nullableText(value, label, maximum) {
  if (value !== null) cleanText(value, label, maximum);
}

function canonicalIso(value, label) {
  cleanText(value, label, 32);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new SafeCliError(`${label} muss ein kanonischer UTC-ISO-Zeitpunkt sein.`);
  }
  return value;
}

export function validateAllowlistDocument(value) {
  exactKeys(value, ["version", "entries"], "Eingabedokument");
  if (value.version !== INPUT_VERSION) {
    throw new SafeCliError(`Eingabedokument muss version ${INPUT_VERSION} verwenden.`);
  }
  if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) {
    throw new SafeCliError(`entries darf hoechstens ${MAX_ENTRIES} Eintraege enthalten.`);
  }

  const ids = new Set();
  const emails = new Set();
  const profileIds = new Set();
  const entries = value.entries.map((entry, index) => {
    const label = `entries[${index}]`;
    exactKeys(
      entry,
      [
        "allowlist_id",
        "email_normalized",
        "profile",
        "access_scope",
        "scope_ref",
        "expires_at",
        "desired_state",
        "revoke_reason"
      ],
      label
    );
    cleanText(
      entry.allowlist_id,
      `${label}.allowlist_id`,
      36,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
    );
    cleanText(entry.email_normalized, `${label}.email_normalized`, 320, /^[\x21-\x7e]+@[\x21-\x7e]+$/u);
    if (
      entry.email_normalized !== entry.email_normalized.replace(/[A-Z]/gu, (letter) => letter.toLowerCase())
      || (entry.email_normalized.match(/@/gu) || []).length !== 1
      || /[*%]/u.test(entry.email_normalized)
    ) {
      throw new SafeCliError(`${label}.email_normalized muss kleingeschrieben und wildcard-frei sein.`);
    }
    exactKeys(
      entry.profile,
      ["id", "display_name", "initials", "role", "active", "team", "bio"],
      `${label}.profile`
    );
    cleanText(
      entry.profile.id,
      `${label}.profile.id`,
      36,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
    );
    cleanText(entry.profile.display_name, `${label}.profile.display_name`, 256);
    nullableText(entry.profile.initials, `${label}.profile.initials`, 16);
    if (!["viewer", "editor"].includes(entry.profile.role)) {
      throw new SafeCliError(`${label}.profile.role muss viewer oder editor sein.`);
    }
    if (entry.profile.active !== true) {
      throw new SafeCliError(`${label}.profile.active muss fuer Auto-Enrollment true sein.`);
    }
    nullableText(entry.profile.team, `${label}.profile.team`, 256);
    nullableText(entry.profile.bio, `${label}.profile.bio`, 2048);
    if (entry.access_scope !== "test_only") {
      throw new SafeCliError(`${label}.access_scope muss test_only sein.`);
    }
    cleanText(entry.scope_ref, `${label}.scope_ref`, 128, /^[a-z0-9][a-z0-9._:-]*$/u);
    canonicalIso(entry.expires_at, `${label}.expires_at`);
    if (!["active", "consumed", "revoked"].includes(entry.desired_state)) {
      throw new SafeCliError(`${label}.desired_state ist ungueltig.`);
    }
    if (entry.desired_state === "revoked") {
      cleanText(entry.revoke_reason, `${label}.revoke_reason`, 512);
    } else if (entry.revoke_reason !== null) {
      throw new SafeCliError(`${label}.revoke_reason ist nur fuer revoked erlaubt.`);
    }
    if (ids.has(entry.allowlist_id)) throw new SafeCliError("Doppelte Allowlist-ID.");
    if (emails.has(entry.email_normalized)) throw new SafeCliError("Doppelte normalisierte E-Mail.");
    if (profileIds.has(entry.profile.id)) throw new SafeCliError("Doppelte Profil-ID.");
    ids.add(entry.allowlist_id);
    emails.add(entry.email_normalized);
    profileIds.add(entry.profile.id);
    return Object.freeze({
      allowlist_id: entry.allowlist_id,
      email_normalized: entry.email_normalized,
      profile: Object.freeze({ ...entry.profile }),
      access_scope: "test_only",
      scope_ref: entry.scope_ref,
      expires_at: entry.expires_at,
      desired_state: entry.desired_state,
      revoke_reason: entry.revoke_reason
    });
  });
  entries.sort((left, right) => left.allowlist_id.localeCompare(right.allowlist_id));
  return Object.freeze({ version: INPUT_VERSION, entries: Object.freeze(entries) });
}

export function allowlistDocumentFingerprint(document) {
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify(validateAllowlistDocument(document)), "utf8")
    .digest("hex")}`;
}

function databaseRowState(row) {
  if (row.consumed_at) return "consumed";
  if (row.revoked_at) return "revoked";
  return "active";
}

function rowToState(row) {
  return {
    allowlist_id: String(row.allowlist_id),
    email_normalized: row.email_normalized,
    profile: {
      id: row.profile_id,
      display_name: row.display_name,
      initials: row.initials,
      role: row.role,
      active: true,
      team: row.team,
      bio: row.bio
    },
    access_scope: "test_only",
    scope_ref: row.scope_ref,
    expires_at: new Date(row.expires_at).toISOString(),
    desired_state: databaseRowState(row),
    revoke_reason: row.revoke_reason
  };
}

function stateFingerprint(entries) {
  const sorted = entries.map((entry) => ({ ...entry, profile: { ...entry.profile } }))
    .sort((left, right) => left.allowlist_id.localeCompare(right.allowlist_id));
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify({ version: INPUT_VERSION, entries: sorted }), "utf8")
    .digest("hex")}`;
}

function sameImmutable(entry, row) {
  return entry.allowlist_id === String(row.allowlist_id)
    && entry.email_normalized === row.email_normalized
    && entry.profile.id === row.profile_id
    && entry.profile.display_name === row.display_name
    && entry.profile.initials === row.initials
    && entry.profile.role === row.role
    && entry.profile.team === row.team
    && entry.profile.bio === row.bio
    && entry.scope_ref === row.scope_ref
    && entry.expires_at === new Date(row.expires_at).toISOString();
}

export function buildAllowlistPlan(document, rows, now = new Date()) {
  const canonical = validateAllowlistDocument(document);
  const existingById = new Map(rows.map((row) => [String(row.allowlist_id), row]));
  const requestedIds = new Set(canonical.entries.map((entry) => entry.allowlist_id));
  const unknownCount = rows.filter((row) => !requestedIds.has(String(row.allowlist_id))).length;
  if (unknownCount > 0) {
    throw new SafeCliError("Bestehende Allowlist-Eintraege fehlen im Vollzustand.");
  }

  const inserts = [];
  const revocations = [];
  const unchanged = [];
  let consumedCount = 0;
  let expiredActiveCount = 0;
  for (const entry of canonical.entries) {
    const row = existingById.get(entry.allowlist_id);
    if (!row) {
      if (entry.desired_state !== "active") {
        throw new SafeCliError("Neue Allowlist-Eintraege muessen aktiv angelegt werden.");
      }
      if (new Date(entry.expires_at).getTime() <= now.getTime()) {
        throw new SafeCliError("Neue Allowlist-Eintraege duerfen nicht abgelaufen sein.");
      }
      inserts.push(entry);
      continue;
    }
    if (!sameImmutable(entry, row)) {
      throw new SafeCliError("Ein bestehender Allowlist-Eintrag wuerde inhaltlich umgebogen.");
    }
    const currentState = databaseRowState(row);
    if (currentState === "consumed") {
      consumedCount += 1;
      if (entry.desired_state !== "consumed") {
        throw new SafeCliError("Ein konsumierter Allowlist-Eintrag ist unveraenderlich.");
      }
      unchanged.push(entry);
    } else if (currentState === "revoked") {
      if (
        entry.desired_state !== "revoked"
        || entry.revoke_reason !== row.revoke_reason
      ) {
        throw new SafeCliError("Ein widerrufener Allowlist-Eintrag ist unveraenderlich.");
      }
      unchanged.push(entry);
    } else if (entry.desired_state === "revoked") {
      revocations.push(entry);
    } else if (entry.desired_state !== "active") {
      throw new SafeCliError("Nur aktive Allowlist-Eintraege koennen widerrufen werden.");
    } else {
      if (new Date(entry.expires_at).getTime() <= now.getTime()) expiredActiveCount += 1;
      unchanged.push(entry);
    }
  }

  const currentEntries = rows.map(rowToState);
  const expectedEntries = canonical.entries.map((entry) => ({ ...entry, profile: { ...entry.profile } }));
  return Object.freeze({
    inserts: Object.freeze(inserts),
    revocations: Object.freeze(revocations),
    unchanged: Object.freeze(unchanged),
    requestedCount: canonical.entries.length,
    consumedCount,
    expiredActiveCount,
    unknownCount,
    currentStateFingerprint: stateFingerprint(currentEntries),
    expectedStateFingerprint: stateFingerprint(expectedEntries)
  });
}

function truthy(value) {
  return value === true || value === "t";
}

function numberValue(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  return Number.NaN;
}

export function validateAllowlistAdminSession(state) {
  if (
    !truthy(state?.unassumed)
    || !truthy(state?.login_can_login)
    || !truthy(state?.login_inherit)
    || truthy(state?.login_superuser)
    || truthy(state?.login_create_database)
    || truthy(state?.login_create_role)
    || truthy(state?.login_replication)
    || truthy(state?.login_bypass_rls)
    || truthy(state?.admin_can_login)
    || truthy(state?.admin_inherit)
    || truthy(state?.admin_superuser)
    || truthy(state?.admin_create_database)
    || truthy(state?.admin_create_role)
    || truthy(state?.admin_replication)
    || truthy(state?.admin_bypass_rls)
    || !truthy(state?.admin_member)
    || truthy(state?.cloudsql_superuser_member)
    || truthy(state?.postgres_member)
    || numberValue(state?.login_membership_count) !== 1
    || numberValue(state?.login_admin_membership_count) !== 1
    || numberValue(state?.admin_parent_count) !== 0
    || numberValue(state?.admin_member_count) !== 2
    || numberValue(state?.expected_login_membership_count) !== 1
    || numberValue(state?.expected_owner_membership_count) !== 1
  ) {
    throw new SafeCliError("Der Login entspricht nicht dem exklusiven kurzlebigen Allowlist-Rollenvertrag.");
  }
}

async function assumeAllowlistRole(client) {
  const result = await client.query(
    `select
       current_user = session_user as unassumed,
       login.rolcanlogin as login_can_login,
       login.rolinherit as login_inherit,
       login.rolsuper as login_superuser,
       login.rolcreatedb as login_create_database,
       login.rolcreaterole as login_create_role,
       login.rolreplication as login_replication,
       login.rolbypassrls as login_bypass_rls,
       admin.rolcanlogin as admin_can_login,
       admin.rolinherit as admin_inherit,
       admin.rolsuper as admin_superuser,
       admin.rolcreatedb as admin_create_database,
       admin.rolcreaterole as admin_create_role,
       admin.rolreplication as admin_replication,
       admin.rolbypassrls as admin_bypass_rls,
       pg_has_role(session_user, 'vk_access_allowlist_admin', 'MEMBER') as admin_member,
       pg_has_role(session_user, 'cloudsqlsuperuser', 'MEMBER') as cloudsql_superuser_member,
       pg_has_role(session_user, 'postgres', 'MEMBER') as postgres_member,
       (select count(*)::int from pg_catalog.pg_auth_members where member = login.oid)
         as login_membership_count,
       (select count(*)::int from pg_catalog.pg_auth_members
         where member = login.oid and roleid = admin.oid) as login_admin_membership_count,
       (select count(*)::int from pg_catalog.pg_auth_members where member = admin.oid)
         as admin_parent_count,
       (select count(*)::int from pg_catalog.pg_auth_members where roleid = admin.oid)
         as admin_member_count,
       (select count(*)::int from pg_catalog.pg_auth_members membership
         where membership.roleid = admin.oid
           and membership.member = login.oid
           and not membership.admin_option
           and membership.inherit_option
           and membership.set_option) as expected_login_membership_count,
       (
         select count(*)::int
           from pg_catalog.pg_auth_members membership
          where membership.roleid = admin.oid
            and membership.member = (
              select relation.relowner
                from pg_catalog.pg_class relation
                join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
               where namespace.nspname = 'public'
                 and relation.relname = 'test_access_allowlist'
            )
            and membership.admin_option
            and not membership.inherit_option
            and not membership.set_option
       ) as expected_owner_membership_count
      from pg_catalog.pg_roles login
      join pg_catalog.pg_roles admin on admin.rolname = 'vk_access_allowlist_admin'
     where login.rolname = session_user`
  );
  if (result.rowCount !== 1) throw new SafeCliError("Allowlist-Admin-Rolle oder Login fehlt.");
  validateAllowlistAdminSession(result.rows[0]);
  await client.query("set local role vk_access_allowlist_admin");
}

export function validateAllowlistAdminPrivileges(state) {
  if (
    !truthy(state?.expected_role)
    || !truthy(state?.schema_usage)
    || truthy(state?.schema_create)
    || !truthy(state?.allowlist_select)
    || truthy(state?.allowlist_insert)
    || truthy(state?.allowlist_update)
    || truthy(state?.allowlist_delete)
    || !truthy(state?.email_insert)
    || !truthy(state?.revoked_update)
    || truthy(state?.consumed_update)
    || numberValue(state?.other_table_privileges) !== 0
    || numberValue(state?.sequence_privileges) !== 0
  ) {
    throw new SafeCliError("Die Allowlist-Admin-Rolle besitzt nicht exakt die freigegebenen Minimalrechte.");
  }
}

async function checkPrivileges(client) {
  const result = await client.query(
    `select
       current_user = 'vk_access_allowlist_admin' as expected_role,
       has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
       has_schema_privilege(current_user, 'public', 'CREATE') as schema_create,
       has_table_privilege(current_user, 'public.test_access_allowlist', 'SELECT')
         as allowlist_select,
       has_table_privilege(current_user, 'public.test_access_allowlist', 'INSERT')
         as allowlist_insert,
       has_table_privilege(current_user, 'public.test_access_allowlist', 'UPDATE')
         as allowlist_update,
       has_table_privilege(current_user, 'public.test_access_allowlist', 'DELETE')
         as allowlist_delete,
       has_column_privilege(
         current_user,
         'public.test_access_allowlist',
         'email_normalized',
         'INSERT'
       ) as email_insert,
       has_column_privilege(
         current_user,
         'public.test_access_allowlist',
         'revoked_at',
         'UPDATE'
       ) as revoked_update,
       has_column_privilege(
         current_user,
         'public.test_access_allowlist',
         'consumed_at',
         'UPDATE'
       ) as consumed_update,
       (
         select count(*)::int
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relkind in ('r', 'p', 'v', 'm', 'f')
            and relation.relname <> 'test_access_allowlist'
            and (
              has_table_privilege(current_user, relation.oid, 'SELECT')
              or has_table_privilege(current_user, relation.oid, 'INSERT')
              or has_table_privilege(current_user, relation.oid, 'UPDATE')
              or has_table_privilege(current_user, relation.oid, 'DELETE')
              or has_any_column_privilege(current_user, relation.oid, 'SELECT')
              or has_any_column_privilege(current_user, relation.oid, 'INSERT')
              or has_any_column_privilege(current_user, relation.oid, 'UPDATE')
              or has_any_column_privilege(current_user, relation.oid, 'REFERENCES')
            )
       ) as other_table_privileges,
       (
         select count(*)::int
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relkind = 'S'
            and (
              has_sequence_privilege(current_user, relation.oid, 'USAGE')
              or has_sequence_privilege(current_user, relation.oid, 'SELECT')
              or has_sequence_privilege(current_user, relation.oid, 'UPDATE')
            )
       ) as sequence_privileges`
  );
  validateAllowlistAdminPrivileges(result.rows[0]);
}

const SELECT_ALLOWLIST_SQL = `select
  allowlist_id::text,
  email_normalized,
  profile_id,
  display_name,
  initials,
  role,
  team,
  bio,
  scope_ref,
  expires_at,
  consumed_at,
  revoked_at,
  revoke_reason
from public.test_access_allowlist
order by allowlist_id`;

function summary(plan, fingerprint, applied) {
  return [
    `mode=${applied ? "APPLY" : "PREVIEW"}`,
    `entry_count=${plan.requestedCount}`,
    `insert_count=${plan.inserts.length}`,
    `revoke_count=${plan.revocations.length}`,
    `consumed_count=${plan.consumedCount}`,
    `expired_active_count=${plan.expiredActiveCount}`,
    `unchanged_count=${plan.unchanged.length}`,
    `unknown_existing_count=${plan.unknownCount}`,
    `current_state_fingerprint=${plan.currentStateFingerprint}`,
    `expected_state_fingerprint=${plan.expectedStateFingerprint}`,
    `input_fingerprint=${fingerprint}`
  ].join(" ");
}

export async function executeAllowlistTransaction({
  client,
  document,
  fingerprint,
  apply,
  expectedDatabase,
  expectedCounts = null,
  now = new Date(),
  log = console.log
}) {
  let open = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    open = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await assumeAllowlistRole(client);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
    const database = await client.query("select current_database() as database_name");
    if (apply && database.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname stimmt nicht.");
    }
    await checkPrivileges(client);
    const current = await client.query(SELECT_ALLOWLIST_SQL);
    const plan = buildAllowlistPlan(document, current.rows, now);
    if (
      apply
      && (
        !expectedCounts
        || expectedCounts.entries !== plan.requestedCount
        || expectedCounts.inserts !== plan.inserts.length
        || expectedCounts.revocations !== plan.revocations.length
      )
    ) {
      throw new SafeCliError("Der transaktionale Allowlist-Plan weicht vom bestaetigten Preview ab.");
    }
    if (!apply) {
      await client.query("rollback");
      open = false;
      log(summary(plan, fingerprint, false));
      return plan;
    }

    for (const entry of plan.inserts) {
      await client.query(
        `insert into public.test_access_allowlist (
           allowlist_id,
           email_normalized,
           profile_id,
           display_name,
           initials,
           role,
           team,
           bio,
           scope_ref,
           expires_at
         ) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
        [
          entry.allowlist_id,
          entry.email_normalized,
          entry.profile.id,
          entry.profile.display_name,
          entry.profile.initials,
          entry.profile.role,
          entry.profile.team,
          entry.profile.bio,
          entry.scope_ref,
          entry.expires_at
        ]
      );
    }
    for (const entry of plan.revocations) {
      const result = await client.query(
        `update public.test_access_allowlist
            set revoked_at = $2::timestamptz,
                revoke_reason = $3
          where allowlist_id = $1::uuid
            and consumed_at is null
            and revoked_at is null`,
        [entry.allowlist_id, now.toISOString(), entry.revoke_reason]
      );
      if (result.rowCount !== 1) {
        throw new SafeCliError("Ein Allowlist-Eintrag wurde konkurrierend veraendert.");
      }
    }
    const finalRows = await client.query(SELECT_ALLOWLIST_SQL);
    const finalPlan = buildAllowlistPlan(document, finalRows.rows, now);
    if (
      finalPlan.inserts.length !== 0
      || finalPlan.revocations.length !== 0
      || finalPlan.expectedStateFingerprint !== plan.expectedStateFingerprint
      || finalPlan.currentStateFingerprint !== plan.expectedStateFingerprint
    ) {
      throw new SafeCliError("Die Allowlist-Abschlusskontrolle ist fehlgeschlagen.");
    }

    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      open = false;
      throw new SafeCliError(
        `COMMIT-Ergebnis unbekannt; nicht wiederholen. input_fingerprint=${fingerprint} `
        + `expected_state_fingerprint=${plan.expectedStateFingerprint}.`,
        1
      );
    }
    open = false;
    log(summary(plan, fingerprint, true));
    return plan;
  } catch (error) {
    if (open && !commitAttempted) await client.query("rollback").catch(() => {});
    throw error;
  }
}

function repositoryRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    throw new SafeCliError("Git-Worktree konnte nicht bestimmt werden.");
  }
}

function inside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function loadProtectedAllowlistDocument(inputPath, { repository = repositoryRoot() } = {}) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new SafeCliError("--input mit einem geschuetzten Allowlist-Dokument ist erforderlich.");
  }
  const requested = path.resolve(inputPath);
  const linkState = await fs.lstat(requested).catch(() => null);
  if (!linkState || linkState.isSymbolicLink()) {
    throw new SafeCliError("Eingabedokument fehlt oder ist ein Symlink.");
  }
  const resolved = await fs.realpath(requested);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolved);
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_INPUT_BYTES
    || inside(resolved, resolvedRepository)
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
  ) {
    throw new SafeCliError("Eingabedokument muss owner-only und ausserhalb des Git-Worktrees liegen.");
  }
  try {
    return validateAllowlistDocument(JSON.parse(await fs.readFile(resolved, "utf8")));
  } catch (error) {
    if (error instanceof SafeCliError) throw error;
    throw new SafeCliError("Eingabedokument ist kein gueltiges JSON.");
  }
}

function requiredOption(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new SafeCliError(`${option} benoetigt einen Wert.`);
  return value;
}

export function parseAllowlistArguments(argv) {
  const options = {
    help: false,
    apply: false,
    input: "",
    confirmEnvironment: "",
    confirmDatabase: "",
    confirmOperation: "",
    confirmFingerprint: "",
    confirmEntryCount: "",
    confirmInsertCount: "",
    confirmRevokeCount: ""
  };
  const values = new Map([
    ["--input", "input"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-database", "confirmDatabase"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"],
    ["--confirm-entry-count", "confirmEntryCount"],
    ["--confirm-insert-count", "confirmInsertCount"],
    ["--confirm-revoke-count", "confirmRevokeCount"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (values.has(argument)) {
      options[values.get(argument)] = requiredOption(argv, index, argument);
      index += 1;
    } else throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
  }
  return Object.freeze(options);
}

export function validateAllowlistConfirmations(options, plan, fingerprint) {
  if (!options.apply) return;
  const count = /^(?:0|[1-9][0-9]*)$/u;
  if (
    options.confirmEnvironment !== EXPECTED_ENVIRONMENT
    || !options.confirmDatabase
    || options.confirmOperation !== APPLY_OPERATION
    || options.confirmFingerprint !== fingerprint
    || !count.test(options.confirmEntryCount)
    || Number(options.confirmEntryCount) !== plan.requestedCount
    || !count.test(options.confirmInsertCount)
    || Number(options.confirmInsertCount) !== plan.inserts.length
    || !count.test(options.confirmRevokeCount)
    || Number(options.confirmRevokeCount) !== plan.revocations.length
  ) {
    throw new SafeCliError("Apply-Bestaetigungen fehlen oder stimmen nicht mit dem Preview ueberein.");
  }
}

export function usage() {
  return `Geschuetzte Testzugriffs-Allowlist verwalten

Preview:
  node scripts/provision_pre_gematik_test_access_allowlist.mjs --input /geschuetzt/allowlist.json

Apply verlangt zusaetzlich --apply, Umgebung/Datenbank, Operation
${APPLY_OPERATION}, Preview-Fingerprint sowie Entry-/Insert-/Revoke-Zahlen.
Der Login darf ausschliesslich ${EXPECTED_ALLOWLIST_ADMIN_ROLE} besitzen.`;
}

function safeMessage(error) {
  return error instanceof SafeCliError
    ? error.message
    : "Allowlist-Operation fehlgeschlagen; Eingabe- und Personendaten wurden nicht ausgegeben.";
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  {
    ClientClass = Client,
    gcpGate = checkPreGematikMigrationGcp,
    proxyFactory = startManagedCloudSqlAuthProxy,
    proxyVerifier = assertManagedCloudSqlProxyMatchesGate
  } = {}
) {
  const options = parseAllowlistArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const root = environment[REPOSITORY_ROOT_ENV] || repositoryRoot();
  if (!path.isAbsolute(root) || path.normalize(root) !== root) {
    throw new SafeCliError(`${REPOSITORY_ROOT_ENV} muss ein normalisierter absoluter Pfad sein.`);
  }
  const document = await loadProtectedAllowlistDocument(options.input, { repository: root });
  const fingerprint = allowlistDocumentFingerprint(document);
  const connectionString = environment[DATABASE_URL_ENV];
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new SafeCliError(`${DATABASE_URL_ENV} fehlt.`);
  }
  validateIdentityTargetFingerprint(connectionString, environment[TARGET_FINGERPRINT_ENV]);
  const gate = options.apply || environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE !== undefined
    ? await assertFreshGcpMigrationGate(environment, gcpGate)
    : null;

  let proxy = null;
  let client = null;
  try {
    if (gate) {
      try {
        proxy = await proxyFactory({
          gateResult: gate,
          targetDatabaseUrl: connectionString,
          environment
        });
        proxyVerifier(proxy, gate);
        client = proxy.createClient("vk-allowlist-admin");
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) throw new SafeCliError(error.message);
        throw error;
      }
    } else {
      client = new ClientClass({ connectionString, application_name: "vk-allowlist-admin" });
    }
    await client.connect();

    // Preview once inside the same protected DB session to derive the required
    // counters. Apply executes a fresh serializable transaction afterwards.
    const previewPlan = await executeAllowlistTransaction({
      client,
      document,
      fingerprint,
      apply: false,
      expectedDatabase: "",
      log: options.apply ? () => {} : console.log
    });
    validateAllowlistConfirmations(options, previewPlan, fingerprint);
    if (options.apply) {
      if (proxy) {
        const freshGate = await assertFreshGcpMigrationGate(environment, gcpGate);
        proxyVerifier(proxy, freshGate);
      }
      await executeAllowlistTransaction({
        client,
        document,
        fingerprint,
        apply: true,
        expectedDatabase: options.confirmDatabase,
        expectedCounts: {
          entries: Number(options.confirmEntryCount),
          inserts: Number(options.confirmInsertCount),
          revocations: Number(options.confirmRevokeCount)
        },
        log: console.log
      });
    }
  } finally {
    if (client) await client.end().catch(() => {});
    if (proxy) await proxy.stop().catch(() => {});
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FEHLER: ${safeMessage(error)}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
