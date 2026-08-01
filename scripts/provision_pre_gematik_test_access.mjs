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
  EXPECTED_IAP_ISSUER,
  assertFreshGcpMigrationGate,
  identityTargetFingerprint,
  validateIdentityTargetFingerprint
} from "./provision_iap_identity_bindings.mjs";
import {
  CloudSqlManagedProxyError,
  assertManagedCloudSqlProxyMatchesGate,
  startManagedCloudSqlAuthProxy
} from "./lib/cloud-sql-managed-proxy.mjs";
import { checkPreGematikMigrationGcp } from "./check_pre_gematik_migration_gcp.mjs";

const { Client } = pg;

const INPUT_VERSION = 2;
const MAX_IDENTITIES = 500;
const MAX_INPUT_BYTES = 1024 * 1024;
const EXPECTED_ENVIRONMENT = "pre-gematik";
const APPLY_OPERATION = "APPLY_PRE_GEMATIK_TEST_ACCESS_V2";
// Serialize with the legacy binding operator as well as other v2 runs.
const ADVISORY_LOCK_NAME = "versorgungs-kompass:pre-gematik:identity-bindings";
const DATABASE_URL_ENV = "PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL";
const TARGET_FINGERPRINT_ENV = "PRE_GEMATIK_ACCESS_TARGET_SHA256";
const REPOSITORY_ROOT_ENV = "PRE_GEMATIK_ACCESS_REPOSITORY_ROOT";

export const EXPECTED_ACCESS_ADMIN_ROLE = "vk_access_enrollment_admin";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) throw new SafeCliError(`${label} muss ein JSON-Objekt sein.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SafeCliError(`${label} enthaelt fehlende oder nicht erlaubte Felder.`);
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
    throw new SafeCliError(`${label} ist ungueltig.`);
  }
}

function validateIssuer(value, label) {
  assertText(value, label, 2048);
  if (value !== EXPECTED_IAP_ISSUER) {
    throw new SafeCliError(`${label} muss exakt dem freigegebenen IAP-Issuer entsprechen.`);
  }
}

function validateScope(accessScope, scopeRef, label, { enrollment = false } = {}) {
  if (!["standard", "test_only"].includes(accessScope)) {
    throw new SafeCliError(`${label}.access_scope ist ungueltig.`);
  }
  if (accessScope === "standard") {
    if (scopeRef !== null) throw new SafeCliError(`${label}.scope_ref muss fuer standard null sein.`);
    if (enrollment) throw new SafeCliError("Enrollment-Bindungen muessen test_only verwenden.");
    return;
  }
  assertText(scopeRef, `${label}.scope_ref`, 128, /^[a-z0-9][a-z0-9._:-]*$/u);
}

function validateBinding(binding, label) {
  assertExactKeys(
    binding,
    ["issuer", "subject", "profile_id", "active", "access_scope", "scope_ref"],
    label
  );
  validateIssuer(binding.issuer, `${label}.issuer`);
  assertText(binding.subject, `${label}.subject`, 512);
  assertText(binding.profile_id, `${label}.profile_id`, 512);
  if (typeof binding.active !== "boolean") {
    throw new SafeCliError(`${label}.active muss boolean sein.`);
  }
  validateScope(binding.access_scope, binding.scope_ref, label);
  if (binding.access_scope !== "standard") {
    throw new SafeCliError(`${label} darf nur eine bereits bestehende standard-Bindung beschreiben.`);
  }
  return Object.freeze({ ...binding });
}

function validateEnrollment(enrollment, label) {
  assertExactKeys(enrollment, ["request_id", "expected_email", "profile", "binding"], label);
  assertText(
    enrollment.request_id,
    `${label}.request_id`,
    36,
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
  );
  assertText(enrollment.expected_email, `${label}.expected_email`, 320, /^[^@\s]+@[^@\s]+$/u);
  assertExactKeys(
    enrollment.profile,
    ["id", "email", "display_name", "initials", "role", "active", "team", "bio"],
    `${label}.profile`
  );
  assertText(enrollment.profile.id, `${label}.profile.id`, 512);
  assertText(enrollment.profile.email, `${label}.profile.email`, 320, /^[^@\s]+@[^@\s]+$/u);
  assertText(enrollment.profile.display_name, `${label}.profile.display_name`, 256);
  if (enrollment.profile.initials !== null) {
    assertText(enrollment.profile.initials, `${label}.profile.initials`, 16);
  }
  if (!["viewer", "editor"].includes(enrollment.profile.role)) {
    throw new SafeCliError(`${label}.profile.role muss viewer oder editor sein.`);
  }
  if (typeof enrollment.profile.active !== "boolean") {
    throw new SafeCliError(`${label}.profile.active muss boolean sein.`);
  }
  for (const optionalField of ["team", "bio"]) {
    if (enrollment.profile[optionalField] !== null) {
      assertText(enrollment.profile[optionalField], `${label}.profile.${optionalField}`, 2048);
    }
  }
  if (
    enrollment.expected_email.toLocaleLowerCase("en-US")
    !== enrollment.profile.email.toLocaleLowerCase("en-US")
  ) {
    throw new SafeCliError(`${label} enthaelt widerspruechliche E-Mail-Werte.`);
  }
  assertExactKeys(
    enrollment.binding,
    ["active", "access_scope", "scope_ref"],
    `${label}.binding`
  );
  if (typeof enrollment.binding.active !== "boolean") {
    throw new SafeCliError(`${label}.binding.active muss boolean sein.`);
  }
  if (enrollment.binding.active !== enrollment.profile.active) {
    throw new SafeCliError(`${label} muss Profil und Bindung gemeinsam aktivieren oder deaktivieren.`);
  }
  validateScope(
    enrollment.binding.access_scope,
    enrollment.binding.scope_ref,
    `${label}.binding`,
    { enrollment: true }
  );
  return Object.freeze({
    request_id: enrollment.request_id,
    expected_email: enrollment.expected_email,
    profile: Object.freeze({ ...enrollment.profile }),
    binding: Object.freeze({ ...enrollment.binding })
  });
}

function bindingKey(binding) {
  return `${binding.issuer}\u0000${binding.subject}`;
}

function bindingProfileKey(binding) {
  return `${binding.issuer}\u0000${binding.profile_id}`;
}

export function validateAccessDocument(value) {
  assertExactKeys(value, ["version", "bindings", "enrollments"], "Eingabedokument");
  if (value.version !== INPUT_VERSION) {
    throw new SafeCliError(`Eingabedokument muss version ${INPUT_VERSION} verwenden.`);
  }
  if (!Array.isArray(value.bindings) || !Array.isArray(value.enrollments)) {
    throw new SafeCliError("bindings und enrollments muessen Arrays sein.");
  }
  const total = value.bindings.length + value.enrollments.length;
  if (total === 0 || total > MAX_IDENTITIES) {
    throw new SafeCliError(`Der Vollzustand muss 1 bis ${MAX_IDENTITIES} Identitaeten enthalten.`);
  }

  const bindings = value.bindings.map((binding, index) => (
    validateBinding(binding, `bindings[${index}]`)
  ));
  const enrollments = value.enrollments.map((enrollment, index) => (
    validateEnrollment(enrollment, `enrollments[${index}]`)
  ));
  const directBindingKeys = new Set();
  const profileKeys = new Set();
  for (const binding of bindings) {
    const key = bindingKey(binding);
    const profileKey = bindingProfileKey(binding);
    if (directBindingKeys.has(key)) throw new SafeCliError("Doppelte issuer/subject-Bindung.");
    if (profileKeys.has(profileKey)) throw new SafeCliError("Doppelte issuer/profile_id-Bindung.");
    directBindingKeys.add(key);
    profileKeys.add(profileKey);
  }
  const requestIds = new Set();
  for (const enrollment of enrollments) {
    if (requestIds.has(enrollment.request_id)) throw new SafeCliError("Doppelte Enrollment-Referenz.");
    const profileKey = `${EXPECTED_IAP_ISSUER}\u0000${enrollment.profile.id}`;
    if (profileKeys.has(profileKey)) throw new SafeCliError("Doppelte issuer/profile_id-Zuordnung.");
    requestIds.add(enrollment.request_id);
    profileKeys.add(profileKey);
  }

  bindings.sort((left, right) => bindingKey(left).localeCompare(bindingKey(right)));
  enrollments.sort((left, right) => left.request_id.localeCompare(right.request_id));
  return Object.freeze({
    version: INPUT_VERSION,
    bindings: Object.freeze(bindings),
    enrollments: Object.freeze(enrollments)
  });
}

export function accessDocumentFingerprint(document) {
  const canonical = JSON.stringify(validateAccessDocument(document));
  return `sha256:${crypto.createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function stateFingerprint(value) {
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function canonicalBinding(binding) {
  return {
    issuer: binding.issuer,
    subject: binding.subject,
    profile_id: binding.profile_id,
    active: binding.active === true,
    access_scope: binding.access_scope,
    scope_ref: binding.scope_ref
  };
}

function canonicalProfileState(profile) {
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    initials: profile.initials,
    role: profile.role,
    active: profile.active === true,
    team: profile.team,
    bio: profile.bio
  };
}

function canonicalRequestState(request) {
  const expiresAt = new Date(request.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new SafeCliError("Eine Enrollment-Referenz besitzt keinen gueltigen Ablaufzeitpunkt.");
  }
  return {
    request_id: String(request.request_id),
    issuer: request.issuer,
    subject: request.subject,
    verified_email: request.verified_email,
    status: request.status,
    expires_at: expiresAt.toISOString(),
    applied_profile_id: request.applied_profile_id ?? null
  };
}

function sameProfile(actual, expected) {
  return actual.id === expected.id
    && actual.email.toLocaleLowerCase("en-US") === expected.email.toLocaleLowerCase("en-US")
    && actual.display_name === expected.display_name
    && actual.initials === expected.initials
    && actual.role === expected.role
    && actual.active === expected.active
    && actual.team === expected.team
    && actual.bio === expected.bio;
}

function sameBinding(actual, expected) {
  return actual.issuer === expected.issuer
    && actual.subject === expected.subject
    && actual.profile_id === expected.profile_id
    && actual.active === expected.active
    && actual.access_scope === expected.access_scope
    && actual.scope_ref === expected.scope_ref;
}

export function buildAccessPlan(document, profileRows, requestRows, existingBindingRows, now = new Date()) {
  const canonicalDocument = validateAccessDocument(document);
  const profiles = new Map(profileRows.map((profile) => [profile.id, profile]));
  const requests = new Map(requestRows.map((request) => [String(request.request_id), request]));
  const existingByKey = new Map(existingBindingRows.map((binding) => [bindingKey(binding), binding]));
  const existingByProfile = new Map(
    existingBindingRows.map((binding) => [bindingProfileKey(binding), binding])
  );
  const desiredBindings = canonicalDocument.bindings.map(canonicalBinding);
  const directBindingKeys = new Set(desiredBindings.map(bindingKey));
  const profileInserts = [];
  const profileUpdates = [];
  const requestUpdates = [];
  let pendingRequestCount = 0;

  for (const binding of desiredBindings) {
    const existing = existingByKey.get(bindingKey(binding));
    if (!existing) {
      throw new SafeCliError(
        "bindings darf keine neue Direktbindung anlegen; neue Testidentitaeten brauchen ein verifiziertes Enrollment."
      );
    }
    if (
      existing.profile_id !== binding.profile_id
      || existing.access_scope !== "standard"
      || existing.scope_ref !== null
    ) {
      throw new SafeCliError(
        "Eine bestehende Direktbindung darf weder Profil noch access_scope oder scope_ref wechseln."
      );
    }
  }

  if (requests.size !== canonicalDocument.enrollments.length) {
    throw new SafeCliError("Mindestens eine Enrollment-Referenz fehlt in der Zieldatenbank.");
  }

  for (const enrollment of canonicalDocument.enrollments) {
    const request = requests.get(enrollment.request_id);
    if (!request || !["pending", "applied"].includes(request.status)) {
      throw new SafeCliError("Mindestens eine Enrollment-Referenz ist nicht mehr anwendbar.");
    }
    if (
      request.issuer !== EXPECTED_IAP_ISSUER
      || request.verified_email.toLocaleLowerCase("en-US")
        !== enrollment.expected_email.toLocaleLowerCase("en-US")
    ) {
      throw new SafeCliError("Mindestens eine Enrollment-Referenz stimmt nicht mit dem geschuetzten Sollzustand ueberein.");
    }
    if (request.status === "pending" && new Date(request.expires_at).getTime() <= now.getTime()) {
      throw new SafeCliError("Mindestens eine Enrollment-Referenz ist abgelaufen.");
    }
    if (
      request.status === "applied"
      && request.applied_profile_id !== enrollment.profile.id
    ) {
      throw new SafeCliError("Eine angewendete Enrollment-Referenz wuerde auf ein anderes Profil umgebogen.");
    }

    const expectedBinding = canonicalBinding({
      issuer: request.issuer,
      subject: request.subject,
      profile_id: enrollment.profile.id,
      ...enrollment.binding
    });
    desiredBindings.push(expectedBinding);

    const existingProfile = profiles.get(enrollment.profile.id);
    if (!existingProfile) {
      if (request.status !== "pending") {
        throw new SafeCliError("Ein bereits angewendetes Enrollment verweist auf ein fehlendes Profil.");
      }
      profileInserts.push(enrollment.profile);
    } else if (request.status === "pending") {
      throw new SafeCliError("Ein neues Enrollment darf kein bereits vorhandenes Profil uebernehmen.");
    } else if (!sameProfile(existingProfile, enrollment.profile)) {
      profileUpdates.push(enrollment.profile);
    }

    if (request.status === "pending") {
      pendingRequestCount += 1;
      requestUpdates.push({
        request_id: enrollment.request_id,
        issuer: request.issuer,
        subject: request.subject,
        profile_id: enrollment.profile.id
      });
    }
  }

  const desiredBindingKeys = new Set();
  const desiredProfileKeys = new Set();
  for (const binding of desiredBindings) {
    const key = bindingKey(binding);
    const profileKey = bindingProfileKey(binding);
    if (desiredBindingKeys.has(key)) throw new SafeCliError("Der abgeleitete Vollzustand enthaelt ein doppeltes Subject.");
    if (desiredProfileKeys.has(profileKey)) throw new SafeCliError("Der abgeleitete Vollzustand enthaelt ein doppelt gebundenes Profil.");
    desiredBindingKeys.add(key);
    desiredProfileKeys.add(profileKey);
  }

  const unknownExistingCount = existingBindingRows.filter(
    (binding) => !desiredBindingKeys.has(bindingKey(binding))
  ).length;
  if (unknownExistingCount > 0) {
    throw new SafeCliError("Bestehende Bindungen fehlen im v2-Vollzustand; Apply wurde fail-closed abgebrochen.");
  }

  const bindingInserts = [];
  const bindingUpdates = [];
  const unchangedBindings = [];
  for (const binding of desiredBindings) {
    const existing = existingByKey.get(bindingKey(binding));
    if (existing) {
      if (existing.profile_id !== binding.profile_id) {
        throw new SafeCliError("Eine bestehende Subject-Bindung wuerde auf ein anderes Profil umgebogen.");
      }
      if (
        directBindingKeys.has(bindingKey(binding))
        && (
          existing.access_scope !== binding.access_scope
          || existing.scope_ref !== binding.scope_ref
        )
      ) {
        throw new SafeCliError("Eine bestehende Direktbindung darf ihren Scope nicht wechseln.");
      }
      if (sameBinding(existing, binding)) unchangedBindings.push(binding);
      else bindingUpdates.push(binding);
      continue;
    }
    if (directBindingKeys.has(bindingKey(binding))) {
      throw new SafeCliError(
        "bindings darf keine neue Direktbindung anlegen; neue Testidentitaeten brauchen ein verifiziertes Enrollment."
      );
    }
    if (existingByProfile.has(bindingProfileKey(binding))) {
      throw new SafeCliError("Ein Profil besitzt bereits eine andere Subject-Bindung.");
    }
    bindingInserts.push(binding);
  }

  for (const binding of canonicalDocument.bindings) {
    const profile = profiles.get(binding.profile_id);
    if (!profile) throw new SafeCliError("Eine Bestandsbindung verweist auf ein fehlendes Profil.");
    if (binding.active && profile.active !== true) {
      throw new SafeCliError("Eine aktive Bestandsbindung verweist auf ein inaktives Profil.");
    }
  }

  const expectedBindings = desiredBindings.sort((left, right) => (
    bindingKey(left).localeCompare(bindingKey(right))
  ));
  const currentBindings = existingBindingRows.map(canonicalBinding).sort((left, right) => (
    bindingKey(left).localeCompare(bindingKey(right))
  ));
  const currentProfiles = profileRows.map(canonicalProfileState).sort((left, right) => (
    left.id.localeCompare(right.id)
  ));
  const currentRequests = requestRows.map(canonicalRequestState).sort((left, right) => (
    left.request_id.localeCompare(right.request_id)
  ));
  return Object.freeze({
    profileInserts: Object.freeze(profileInserts),
    profileUpdates: Object.freeze(profileUpdates),
    bindingInserts: Object.freeze(bindingInserts),
    bindingUpdates: Object.freeze(bindingUpdates),
    unchangedBindings: Object.freeze(unchangedBindings),
    requestUpdates: Object.freeze(requestUpdates),
    requestedCount: expectedBindings.length,
    activeRequestedCount: expectedBindings.filter((binding) => binding.active).length,
    enrollmentCount: canonicalDocument.enrollments.length,
    pendingRequestCount,
    unknownExistingCount,
    currentStateFingerprint: stateFingerprint({
      version: INPUT_VERSION,
      profiles: currentProfiles,
      requests: currentRequests,
      bindings: currentBindings
    }),
    expectedStateFingerprint: stateFingerprint({ version: INPUT_VERSION, bindings: expectedBindings }),
    expectedBindings: Object.freeze(expectedBindings)
  });
}

function numeric(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  return Number.NaN;
}

function truthy(value) {
  return value === true || value === "t";
}

export function validateAccessAdministrationSession(state) {
  if (
    !truthy(state?.unassumed_session)
    || !truthy(state?.login_can_login)
    || !truthy(state?.login_inherits_roles)
    || truthy(state?.login_superuser)
    || truthy(state?.login_create_database)
    || truthy(state?.login_create_role)
    || truthy(state?.login_replication)
    || truthy(state?.login_bypass_rls)
    || truthy(state?.admin_can_login)
    || truthy(state?.admin_inherits_roles)
    || truthy(state?.admin_superuser)
    || truthy(state?.admin_create_database)
    || truthy(state?.admin_create_role)
    || truthy(state?.admin_replication)
    || truthy(state?.admin_bypass_rls)
    || !truthy(state?.access_admin_member)
    || truthy(state?.cloudsql_superuser_member)
    || truthy(state?.postgres_member)
    || numeric(state?.login_membership_count) !== 1
    || numeric(state?.login_access_admin_membership_count) !== 1
    || numeric(state?.admin_parent_membership_count) !== 0
    || numeric(state?.admin_member_count) !== 2
    || numeric(state?.admin_login_member_count) !== 1
    || numeric(state?.admin_owner_member_count) !== 1
    || numeric(state?.admin_unexpected_member_count) !== 0
    || !truthy(state?.access_objects_share_owner)
  ) {
    throw new SafeCliError("Das Datenbankkonto entspricht nicht dem exklusiven kurzlebigen v2-Zugriffsvertrag.");
  }
}

export async function assumeAccessAdministrationRole(client) {
  const result = await client.query(
    `select
       current_user = session_user as unassumed_session,
       login.rolcanlogin as login_can_login,
       login.rolinherit as login_inherits_roles,
       login.rolsuper as login_superuser,
       login.rolcreatedb as login_create_database,
       login.rolcreaterole as login_create_role,
       login.rolreplication as login_replication,
       login.rolbypassrls as login_bypass_rls,
       admin.rolcanlogin as admin_can_login,
       admin.rolinherit as admin_inherits_roles,
       admin.rolsuper as admin_superuser,
       admin.rolcreatedb as admin_create_database,
       admin.rolcreaterole as admin_create_role,
       admin.rolreplication as admin_replication,
       admin.rolbypassrls as admin_bypass_rls,
       pg_has_role(session_user, 'vk_access_enrollment_admin', 'MEMBER') as access_admin_member,
       pg_has_role(session_user, 'cloudsqlsuperuser', 'MEMBER') as cloudsql_superuser_member,
       pg_has_role(session_user, 'postgres', 'MEMBER') as postgres_member,
       (select count(*)::int from pg_catalog.pg_auth_members where member = login.oid)
         as login_membership_count,
       (select count(*)::int from pg_catalog.pg_auth_members
         where member = login.oid and roleid = admin.oid)
         as login_access_admin_membership_count,
       (select count(*)::int from pg_catalog.pg_auth_members where member = admin.oid)
         as admin_parent_membership_count,
       (select count(*)::int from pg_catalog.pg_auth_members where roleid = admin.oid)
         as admin_member_count,
       (
         select count(*) = 3 and count(distinct relation.relowner) = 1
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname in ('profiles', 'identity_bindings', 'identity_enrollment_requests')
       ) as access_objects_share_owner,
       (select count(*)::int from pg_catalog.pg_auth_members membership
         where membership.roleid = admin.oid
           and membership.member = login.oid
           and not membership.admin_option
           and membership.inherit_option
           and membership.set_option) as admin_login_member_count,
       (
         select count(*)::int
           from pg_catalog.pg_auth_members membership
          where membership.roleid = admin.oid
            and membership.member = (
              select relation.relowner
                from pg_catalog.pg_class relation
                join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
               where namespace.nspname = 'public' and relation.relname = 'profiles'
            )
            and membership.admin_option
            and not membership.inherit_option
            and not membership.set_option
       ) as admin_owner_member_count,
       (
         select count(*)::int
           from pg_catalog.pg_auth_members membership
          where membership.roleid = admin.oid
            and membership.member not in (
              login.oid,
              (
                select relation.relowner
                  from pg_catalog.pg_class relation
                  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
                 where namespace.nspname = 'public' and relation.relname = 'profiles'
              )
            )
       ) as admin_unexpected_member_count
      from pg_catalog.pg_roles login
      join pg_catalog.pg_roles admin on admin.rolname = 'vk_access_enrollment_admin'
     where login.rolname = session_user`
  );
  if (result.rowCount !== 1) throw new SafeCliError("Die dedizierte v2-Zugriffsrolle oder der Login fehlt.");
  validateAccessAdministrationSession(result.rows[0]);
  await client.query("set local role vk_access_enrollment_admin");
}

export function validateAccessAdministrationPrivileges(state) {
  if (
    !truthy(state?.expected_role)
    || !truthy(state?.schema_usage)
    || truthy(state?.schema_create)
    || !truthy(state?.profile_select)
    || truthy(state?.profile_insert)
    || truthy(state?.profile_update)
    || truthy(state?.profile_delete)
    || !truthy(state?.profile_id_insert)
    || !truthy(state?.profile_role_update)
    || !truthy(state?.binding_select)
    || truthy(state?.binding_insert)
    || truthy(state?.binding_update)
    || truthy(state?.binding_delete)
    || !truthy(state?.binding_subject_insert)
    || truthy(state?.binding_subject_update)
    || !truthy(state?.request_select)
    || truthy(state?.request_update)
    || truthy(state?.request_delete)
    || !truthy(state?.request_status_update)
    || truthy(state?.request_email_update)
    || !truthy(state?.touch_execute)
    || numeric(state?.unsafe_other_table_privilege_count) !== 0
    || numeric(state?.unsafe_sequence_privilege_count) !== 0
    || numeric(state?.unsafe_other_function_privilege_count) !== 0
  ) {
    throw new SafeCliError("Die v2-Zugriffsrolle besitzt nicht exakt die freigegebenen Minimalrechte.");
  }
}

export async function checkAccessPrivileges(client) {
  const result = await client.query(
    `select
       current_user = 'vk_access_enrollment_admin' as expected_role,
       has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
       has_schema_privilege(current_user, 'public', 'CREATE') as schema_create,
       has_table_privilege(current_user, 'public.profiles', 'SELECT') as profile_select,
       has_table_privilege(current_user, 'public.profiles', 'INSERT') as profile_insert,
       has_table_privilege(current_user, 'public.profiles', 'UPDATE') as profile_update,
       has_table_privilege(current_user, 'public.profiles', 'DELETE') as profile_delete,
       has_column_privilege(current_user, 'public.profiles', 'id', 'INSERT') as profile_id_insert,
       has_column_privilege(current_user, 'public.profiles', 'role', 'UPDATE') as profile_role_update,
       has_table_privilege(current_user, 'public.identity_bindings', 'SELECT') as binding_select,
       has_table_privilege(current_user, 'public.identity_bindings', 'INSERT') as binding_insert,
       has_table_privilege(current_user, 'public.identity_bindings', 'UPDATE') as binding_update,
       has_table_privilege(current_user, 'public.identity_bindings', 'DELETE') as binding_delete,
       has_column_privilege(current_user, 'public.identity_bindings', 'subject', 'INSERT')
         as binding_subject_insert,
       has_column_privilege(current_user, 'public.identity_bindings', 'subject', 'UPDATE')
         as binding_subject_update,
       has_table_privilege(current_user, 'public.identity_enrollment_requests', 'SELECT')
         as request_select,
       has_table_privilege(current_user, 'public.identity_enrollment_requests', 'UPDATE')
         as request_update,
       has_table_privilege(current_user, 'public.identity_enrollment_requests', 'DELETE')
         as request_delete,
       has_column_privilege(current_user, 'public.identity_enrollment_requests', 'status', 'UPDATE')
         as request_status_update,
       has_column_privilege(current_user, 'public.identity_enrollment_requests', 'verified_email', 'UPDATE')
         as request_email_update,
       has_function_privilege(current_user, 'public.pre_gematik_touch_updated_at()', 'EXECUTE')
         as touch_execute,
       (
         select count(*)::int
           from pg_catalog.pg_class relation
           join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relkind in ('r', 'p', 'v', 'm', 'f')
            and relation.relname not in ('profiles', 'identity_bindings', 'identity_enrollment_requests')
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
       ) as unsafe_other_table_privilege_count,
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
       ) as unsafe_sequence_privilege_count,
       (
         select count(*)::int
           from pg_catalog.pg_proc routine
           join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
          where namespace.nspname = 'public'
            and routine.oid <> 'public.pre_gematik_touch_updated_at()'::pg_catalog.regprocedure
            and has_function_privilege(current_user, routine.oid, 'EXECUTE')
       ) as unsafe_other_function_privilege_count`
  );
  validateAccessAdministrationPrivileges(result.rows[0]);
}

function planSummary(plan, fingerprint, applied) {
  return [
    `mode=${applied ? "APPLY" : "PREVIEW"}`,
    `binding_count=${plan.requestedCount}`,
    `active_binding_count=${plan.activeRequestedCount}`,
    `enrollment_count=${plan.enrollmentCount}`,
    `pending_enrollment_count=${plan.pendingRequestCount}`,
    `profile_insert_count=${plan.profileInserts.length}`,
    `profile_update_count=${plan.profileUpdates.length}`,
    `binding_insert_count=${plan.bindingInserts.length}`,
    `binding_update_count=${plan.bindingUpdates.length}`,
    `unchanged_binding_count=${plan.unchangedBindings.length}`,
    `unknown_existing_count=${plan.unknownExistingCount}`,
    `current_state_fingerprint=${plan.currentStateFingerprint}`,
    `expected_state_fingerprint=${plan.expectedStateFingerprint}`,
    `input_fingerprint=${fingerprint}`
  ].join(" ");
}

export async function executeAccessTransaction({
  client,
  document,
  fingerprint,
  apply,
  confirmedCurrentStateFingerprint = "",
  expectedDatabase,
  now = new Date(),
  log = console.log
}) {
  let transactionOpen = false;
  let commitAttempted = false;
  try {
    await client.query("begin isolation level serializable");
    transactionOpen = true;
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await assumeAccessAdministrationRole(client);
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK_NAME]);
    const databaseResult = await client.query("select current_database() as database_name");
    if (apply && databaseResult.rows[0]?.database_name !== expectedDatabase) {
      throw new SafeCliError("Der tatsaechliche Datenbankname entspricht nicht --confirm-database.");
    }
    await checkAccessPrivileges(client);

    const profileIds = [
      ...new Set([
        ...document.bindings.map((binding) => binding.profile_id),
        ...document.enrollments.map((enrollment) => enrollment.profile.id)
      ])
    ];
    const requestIds = document.enrollments.map((enrollment) => enrollment.request_id);
    const profileResult = await client.query(
      `select id, email, display_name, initials, role, active, team, bio
         from public.profiles
        where id = any($1::text[])`,
      [profileIds]
    );
    const requestResult = requestIds.length === 0
      ? { rows: [] }
      : await client.query(
        `select request_id::text, issuer, subject, verified_email, status, expires_at,
                applied_profile_id
           from public.identity_enrollment_requests
          where request_id = any($1::uuid[])`,
        [requestIds]
      );
    const bindingResult = await client.query(
      `select issuer, subject, profile_id, active, access_scope, scope_ref
         from public.identity_bindings
        order by issuer, subject`
    );
    const plan = buildAccessPlan(
      document,
      profileResult.rows,
      requestResult.rows,
      bindingResult.rows,
      now
    );

    if (apply && confirmedCurrentStateFingerprint !== plan.currentStateFingerprint) {
      throw new SafeCliError(
        "Der aktuelle Testzugriffs-Zustand entspricht nicht dem bestaetigten current_state_fingerprint aus dem Preview."
      );
    }

    if (!apply) {
      await client.query("rollback");
      transactionOpen = false;
      log(planSummary(plan, fingerprint, false));
      return plan;
    }

    for (const profile of plan.profileInserts) {
      await client.query(
        `insert into public.profiles
           (id, email, display_name, initials, role, active, team, bio)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          profile.id,
          profile.email,
          profile.display_name,
          profile.initials,
          profile.role,
          profile.active,
          profile.team,
          profile.bio
        ]
      );
    }
    for (const profile of plan.profileUpdates) {
      const result = await client.query(
        `update public.profiles
            set email = $2,
                display_name = $3,
                initials = $4,
                role = $5,
                active = $6,
                team = $7,
                bio = $8
          where id = $1
            and role in ('viewer', 'editor')`,
        [
          profile.id,
          profile.email,
          profile.display_name,
          profile.initials,
          profile.role,
          profile.active,
          profile.team,
          profile.bio
        ]
      );
      if (result.rowCount !== 1) throw new SafeCliError("Ein Testerprofil wurde konkurrierend veraendert.");
    }
    for (const binding of plan.bindingInserts) {
      await client.query(
        `insert into public.identity_bindings
           (issuer, subject, profile_id, active, access_scope, scope_ref)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          binding.issuer,
          binding.subject,
          binding.profile_id,
          binding.active,
          binding.access_scope,
          binding.scope_ref
        ]
      );
    }
    for (const binding of plan.bindingUpdates) {
      const result = await client.query(
        `update public.identity_bindings
            set active = $4,
                access_scope = $5,
                scope_ref = $6
          where issuer = $1
            and subject = $2
            and profile_id = $3`,
        [
          binding.issuer,
          binding.subject,
          binding.profile_id,
          binding.active,
          binding.access_scope,
          binding.scope_ref
        ]
      );
      if (result.rowCount !== 1) throw new SafeCliError("Eine Bindung wurde konkurrierend veraendert.");
    }
    for (const request of plan.requestUpdates) {
      const result = await client.query(
        `update public.identity_enrollment_requests
            set status = 'applied',
                applied_profile_id = $4
          where request_id = $1::uuid
            and issuer = $2
            and subject = $3
            and status = 'pending'
            and expires_at > now()`,
        [request.request_id, request.issuer, request.subject, request.profile_id]
      );
      if (result.rowCount !== 1) throw new SafeCliError("Ein Enrollment wurde konkurrierend veraendert oder ist abgelaufen.");
    }

    const finalBindingResult = await client.query(
      `select issuer, subject, profile_id, active, access_scope, scope_ref
         from public.identity_bindings
        order by issuer, subject`
    );
    const finalFingerprint = stateFingerprint({
      version: INPUT_VERSION,
      bindings: finalBindingResult.rows.map(canonicalBinding)
    });
    if (
      finalBindingResult.rows.length !== plan.expectedBindings.length
      || finalFingerprint !== plan.expectedStateFingerprint
    ) {
      throw new SafeCliError("Die vollstaendige Abschlusskontrolle der Bindungen ist fehlgeschlagen.");
    }
    const finalRequestResult = requestIds.length === 0
      ? { rows: [] }
      : await client.query(
        `select request_id::text, status, applied_profile_id
           from public.identity_enrollment_requests
          where request_id = any($1::uuid[])`,
        [requestIds]
      );
    if (
      finalRequestResult.rows.length !== requestIds.length
      || finalRequestResult.rows.some((request) => (
        request.status !== "applied"
        || document.enrollments.find(
          (enrollment) => enrollment.request_id === String(request.request_id)
        )?.profile.id !== request.applied_profile_id
      ))
    ) {
      throw new SafeCliError("Die Abschlusskontrolle der Enrollment-Referenzen ist fehlgeschlagen.");
    }
    const enrollmentProfileIds = document.enrollments.map((enrollment) => enrollment.profile.id);
    const finalProfileResult = enrollmentProfileIds.length === 0
      ? { rows: [] }
      : await client.query(
        `select id, email, display_name, initials, role, active, team, bio
           from public.profiles
          where id = any($1::text[])`,
        [enrollmentProfileIds]
      );
    if (
      finalProfileResult.rows.length !== enrollmentProfileIds.length
      || finalProfileResult.rows.some((profile) => {
        const expected = document.enrollments.find(
          (enrollment) => enrollment.profile.id === profile.id
        )?.profile;
        return !expected || !sameProfile(profile, expected);
      })
    ) {
      throw new SafeCliError("Die Abschlusskontrolle der Testerprofile ist fehlgeschlagen.");
    }

    commitAttempted = true;
    try {
      await client.query("commit");
    } catch {
      transactionOpen = false;
      throw new SafeCliError(
        `COMMIT-Ergebnis unbekannt; nicht automatisch wiederholen. `
        + `input_fingerprint=${fingerprint} expected_state_fingerprint=${plan.expectedStateFingerprint}.`,
        1
      );
    }
    transactionOpen = false;
    log(planSummary(plan, fingerprint, true));
    return plan;
  } catch (error) {
    if (transactionOpen && !commitAttempted) {
      await client.query("rollback").catch(() => {});
    }
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
    throw new SafeCliError("Der Git-Worktree konnte nicht sicher bestimmt werden.");
  }
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function loadProtectedAccessDocument(inputPath, { repository = repositoryRoot() } = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new SafeCliError("--input mit einem geschuetzten v2-JSON-Dokument ist erforderlich.");
  }
  const requested = path.resolve(inputPath);
  let linkState;
  try {
    linkState = await fs.lstat(requested);
  } catch {
    throw new SafeCliError("Das geschuetzte Eingabedokument kann nicht gelesen werden.");
  }
  if (linkState.isSymbolicLink()) throw new SafeCliError("Das Eingabedokument darf kein Symlink sein.");
  const resolved = await fs.realpath(requested);
  const resolvedRepository = await fs.realpath(repository);
  const metadata = await fs.stat(resolved);
  if (
    !metadata.isFile()
    || metadata.size === 0
    || metadata.size > MAX_INPUT_BYTES
    || insideDirectory(resolved, resolvedRepository)
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
  ) {
    throw new SafeCliError("Das Eingabedokument muss owner-only und ausserhalb des Git-Worktrees liegen.");
  }
  try {
    return validateAccessDocument(JSON.parse(await fs.readFile(resolved, "utf8")));
  } catch (error) {
    if (error instanceof SafeCliError) throw error;
    throw new SafeCliError("Das geschuetzte Eingabedokument enthaelt kein gueltiges JSON.");
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new SafeCliError(`${option} benoetigt einen Wert.`);
  return value;
}

export function parseAccessArguments(argv) {
  const options = {
    help: false,
    apply: false,
    allowActiveBindings: false,
    input: "",
    confirmEnvironment: "",
    confirmDatabase: "",
    confirmOperation: "",
    confirmFingerprint: "",
    confirmCurrentStateFingerprint: "",
    confirmBindingCount: "",
    confirmEnrollmentCount: "",
    confirmActiveBindingCount: ""
  };
  const values = new Map([
    ["--input", "input"],
    ["--confirm-environment", "confirmEnvironment"],
    ["--confirm-database", "confirmDatabase"],
    ["--confirm-operation", "confirmOperation"],
    ["--confirm-fingerprint", "confirmFingerprint"],
    ["--confirm-current-state-fingerprint", "confirmCurrentStateFingerprint"],
    ["--confirm-binding-count", "confirmBindingCount"],
    ["--confirm-enrollment-count", "confirmEnrollmentCount"],
    ["--confirm-active-binding-count", "confirmActiveBindingCount"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--allow-active-bindings") options.allowActiveBindings = true;
    else if (values.has(argument)) {
      options[values.get(argument)] = optionValue(argv, index, argument);
      index += 1;
    } else throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
  }
  return Object.freeze(options);
}

export function validateAccessConfirmations(options, document, fingerprint) {
  const activeCount = [
    ...document.bindings,
    ...document.enrollments.map((enrollment) => enrollment.binding)
  ].filter((binding) => binding.active).length;
  if (!options.apply) {
    if (options.allowActiveBindings || options.confirmCurrentStateFingerprint) {
      throw new SafeCliError(
        "--allow-active-bindings und --confirm-current-state-fingerprint sind nur mit --apply erlaubt."
      );
    }
    return;
  }
  const countPattern = /^(?:0|[1-9][0-9]*)$/u;
  const confirmations = [
    [options.confirmEnvironment === EXPECTED_ENVIRONMENT, "Umgebung"],
    [options.confirmDatabase.length > 0, "Datenbank"],
    [options.confirmOperation === APPLY_OPERATION, "Operation"],
    [options.confirmFingerprint === fingerprint, "Fingerprint"],
    [
      /^sha256:[a-f0-9]{64}$/u.test(options.confirmCurrentStateFingerprint),
      "Istzustands-Fingerprint"
    ],
    [
      countPattern.test(options.confirmBindingCount)
        && Number(options.confirmBindingCount) === document.bindings.length + document.enrollments.length,
      "Binding-Zahl"
    ],
    [
      countPattern.test(options.confirmEnrollmentCount)
        && Number(options.confirmEnrollmentCount) === document.enrollments.length,
      "Enrollment-Zahl"
    ],
    [
      countPattern.test(options.confirmActiveBindingCount)
        && Number(options.confirmActiveBindingCount) === activeCount,
      "Aktiv-Zahl"
    ]
  ];
  if (confirmations.some(([valid]) => !valid)) {
    throw new SafeCliError(`Apply-Bestaetigungen sind unvollstaendig oder stimmen nicht.`);
  }
  if (activeCount > 0 && !options.allowActiveBindings) {
    throw new SafeCliError("Aktive Bindungen erfordern --allow-active-bindings.");
  }
}

export function usage() {
  return `Geschuetzter v2-Testzugriffsoperator fuer pre-gematik

Preview:
  node scripts/provision_pre_gematik_test_access.mjs --input /geschuetzt/test-access-v2.json

Apply erfordert zusaetzlich --apply, --confirm-environment pre-gematik,
--confirm-database, --confirm-operation ${APPLY_OPERATION}, den Preview-Fingerprint
sowie --confirm-current-state-fingerprint aus demselben Preview und bestaetigte
Binding-, Enrollment- und Aktiv-Zahlen. Die Verbindung kommt nur aus
${DATABASE_URL_ENV}; ${TARGET_FINGERPRINT_ENV} bindet sie an das gepruefte Ziel.
Der Login muss kurzlebig sein und exklusiv ${EXPECTED_ACCESS_ADMIN_ROLE} besitzen.`;
}

function safeError(error) {
  if (error instanceof SafeCliError) return error.message;
  return "Der v2-Testzugriffsoperator ist fehlgeschlagen; Eingabe- und Personendaten wurden nicht ausgegeben.";
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
  const options = parseAccessArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const configuredRepository = environment[REPOSITORY_ROOT_ENV];
  const root = configuredRepository || repositoryRoot();
  if (!path.isAbsolute(root) || root !== path.normalize(root)) {
    throw new SafeCliError(`${REPOSITORY_ROOT_ENV} muss ein normalisierter absoluter Pfad sein.`);
  }
  const document = await loadProtectedAccessDocument(options.input, { repository: root });
  const fingerprint = accessDocumentFingerprint(document);
  validateAccessConfirmations(options, document, fingerprint);
  const connectionString = environment[DATABASE_URL_ENV];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    throw new SafeCliError(`${DATABASE_URL_ENV} fehlt.`);
  }
  validateIdentityTargetFingerprint(connectionString, environment[TARGET_FINGERPRINT_ENV]);

  const useManagedProxy = options.apply
    || environment.CLOUD_SQL_AUTH_PROXY_CONNECT_MODE !== undefined;
  const gateResult = useManagedProxy
    ? await assertFreshGcpMigrationGate(environment, gcpGate)
    : null;
  let proxy = null;
  let client = null;
  try {
    if (gateResult) {
      try {
        proxy = await proxyFactory({
          gateResult,
          targetDatabaseUrl: connectionString,
          environment
        });
        proxyVerifier(proxy, gateResult);
        client = proxy.createClient("vk-test-access-v2-operator");
      } catch (error) {
        if (error instanceof CloudSqlManagedProxyError) throw new SafeCliError(error.message);
        throw error;
      }
    } else {
      client = new ClientClass({
        connectionString,
        application_name: "vk-test-access-v2-operator"
      });
    }
    await client.connect();
    if (proxy) {
      const freshGate = await assertFreshGcpMigrationGate(environment, gcpGate);
      proxyVerifier(proxy, freshGate);
    }
    await executeAccessTransaction({
      client,
      document,
      fingerprint,
      apply: options.apply,
      confirmedCurrentStateFingerprint: options.confirmCurrentStateFingerprint,
      expectedDatabase: options.confirmDatabase
    });
  } finally {
    if (client) await client.end().catch(() => {});
    if (proxy) await proxy.stop().catch(() => {});
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FEHLER: ${safeError(error)}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
