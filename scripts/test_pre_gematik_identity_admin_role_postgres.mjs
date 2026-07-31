#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

import {
  EXPECTED_IAP_ISSUER,
  bindingDocumentFingerprint,
  executeIdentityBindingTransaction,
  validateBindingDocument
} from "./provision_iap_identity_bindings.mjs";

const { Client } = pg;
const root = new URL("../", import.meta.url);
const identityRoleSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/identity-admin-role.sql", root),
  "utf8"
);

function dockerResult(argumentsList, options = {}) {
  return spawnSync("docker", argumentsList, {
    encoding: "utf8",
    input: options.input,
    stdio: options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
  });
}

function docker(argumentsList, options = {}) {
  const result = dockerResult(argumentsList, options);
  if (result.status !== 0) {
    throw new Error(`Docker contract command failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
if (!dockerAvailable) {
  console.log("SKIP: Docker is unavailable for the identity admin role contract.");
  process.exit(0);
}

const containerName = `vk-identity-role-pg-${process.pid}`;
const databasePassword = `vk-identity-role-contract-${process.pid}`;
const schemaOwner = `vk_identity_schema_owner_${process.pid}`;
const schemaOwnerPassword = `vk-identity-schema-owner-${process.pid}`;
const operatorLogin = `vk_identity_operator_${process.pid}`;
const operatorPassword = `vk-identity-operator-${process.pid}`;
let adminClient;

try {
  docker([
    "run", "-d", "--rm",
    "--name", containerName,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-p", "127.0.0.1::5432",
    "postgres:16-alpine"
  ]);

  let port = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const readiness = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres", "-d", "postgres"],
      { stdio: "ignore" }
    );
    if (readiness.status === 0) {
      port = docker(["port", containerName, "5432/tcp"]).split(":").at(-1);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(port, /^[0-9]+$/u, "PostgreSQL test container did not become ready.");

  const adminConnection = {
    host: "127.0.0.1",
    port: Number(port),
    database: "postgres",
    user: "postgres",
    password: databasePassword
  };
  let hostReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidateClient = new Client(adminConnection);
    try {
      await candidateClient.connect();
      adminClient = candidateClient;
      hostReady = true;
      break;
    } catch {
      await candidateClient.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(hostReady, true, "PostgreSQL host port did not become ready.");

  await adminClient.query(`
    create role ${schemaOwner} login createrole password '${schemaOwnerPassword}';
    create role vk_allowlist_executor nologin noinherit;
    create role cloudsqlsuperuser nologin noinherit;
    alter database postgres owner to ${schemaOwner};
  `);
  const ownerAttributes = await adminClient.query(
    `select rolname, rolcanlogin, rolsuper, rolcreaterole
       from pg_catalog.pg_roles
      where rolname = any($1::text[])
      order by rolname`,
    [[schemaOwner, "vk_allowlist_executor"]]
  );
  assert.deepEqual(ownerAttributes.rows, [
    {
      rolname: "vk_allowlist_executor",
      rolcanlogin: false,
      rolsuper: false,
      rolcreaterole: false
    },
    {
      rolname: schemaOwner,
      rolcanlogin: true,
      rolsuper: false,
      rolcreaterole: true
    }
  ]);

  const schemaOwnerClient = new Client({
    host: "127.0.0.1",
    port: Number(port),
    database: "postgres",
    user: schemaOwner,
    password: schemaOwnerPassword
  });
  await schemaOwnerClient.connect();
  try {
    await schemaOwnerClient.query(`
      create table public.profiles (
        id text primary key,
        email text,
        display_name text,
        initials text,
        role text,
        active boolean,
        team text,
        bio text
      );
      create table public.identity_bindings (
        issuer text,
        subject text,
        profile_id text,
        active boolean,
        access_scope text,
        scope_ref text
      );
      create table public.identity_enrollment_requests (
        verified_email text,
        status text,
        applied_profile_id text
      );
      create function public.pre_gematik_touch_updated_at()
      returns trigger
      language plpgsql
      as $function$
      begin
        return new;
      end
      $function$;
      create function public.identity_owner_only_helper()
      returns void
      language sql
      as $function$
        select 1
      $function$;
      create function public.pre_gematik_consume_test_access_allowlist(
        uuid,
        text,
        text,
        text,
        timestamptz,
        timestamptz
      )
      returns void
      language sql
      as $function$
        select 1
      $function$;
      revoke all on function public.identity_owner_only_helper() from public;
      insert into public.profiles (
        id,
        email,
        display_name,
        initials,
        role,
        active,
        team,
        bio
      ) values (
        'profile-preview',
        'preview@example.invalid',
        'Preview',
        'PV',
        'editor',
        true,
        'Test',
        null
      );
      insert into public.identity_bindings (
        issuer,
        subject,
        profile_id,
        active,
        access_scope,
        scope_ref
      ) values (
        '${EXPECTED_IAP_ISSUER}',
        'securetoken.google.com/example-project:preview-subject',
        'profile-preview',
        true,
        'test_only',
        'pre-gematik-external-test'
      );
    `);
  } finally {
    await schemaOwnerClient.end();
  }

  await adminClient.query(`
    alter function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) owner to vk_allowlist_executor;
    revoke all on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from public;
  `);

  const functionOwners = await adminClient.query(`
    select routine.proname, pg_get_userbyid(routine.proowner) as owner
      from pg_catalog.pg_proc routine
     where routine.oid = any(array[
       'public.identity_owner_only_helper()'::regprocedure,
       'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::regprocedure
     ])
     order by routine.proname
  `);
  assert.deepEqual(functionOwners.rows, [
    { proname: "identity_owner_only_helper", owner: schemaOwner },
    {
      proname: "pre_gematik_consume_test_access_allowlist",
      owner: "vk_allowlist_executor"
    }
  ]);

  const runRoleImport = () => dockerResult(
    [
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1", "-U", schemaOwner, "-d", "postgres"
    ],
    { input: identityRoleSql }
  );

  const initialImport = runRoleImport();
  assert.equal(initialImport.status, 0, combinedOutput(initialImport));

  const securedReadback = await adminClient.query(`
    select
      pg_get_userbyid(consumer.proowner) as consumer_owner,
      has_function_privilege(
        'vk_identity_admin',
        touch.oid,
        'EXECUTE'
      ) as touch_execute,
      has_function_privilege(
        'vk_identity_admin',
        helper.oid,
        'EXECUTE'
      ) as helper_execute,
      has_function_privilege(
        'vk_identity_admin',
        consumer.oid,
        'EXECUTE'
      ) as consumer_execute,
      has_function_privilege('public', consumer.oid, 'EXECUTE') as public_execute
      from pg_catalog.pg_proc touch
      cross join pg_catalog.pg_proc helper
      cross join pg_catalog.pg_proc consumer
     where touch.oid = 'public.pre_gematik_touch_updated_at()'::regprocedure
       and helper.oid = 'public.identity_owner_only_helper()'::regprocedure
       and consumer.oid =
         'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::regprocedure
  `);
  assert.deepEqual(securedReadback.rows, [{
    consumer_owner: "vk_allowlist_executor",
    touch_execute: true,
    helper_execute: false,
    consumer_execute: false,
    public_execute: false
  }]);

  await adminClient.query(`
    grant execute on function public.identity_owner_only_helper()
      to vk_identity_admin
  `);
  const ownerControlledRecoveryImport = runRoleImport();
  assert.equal(
    ownerControlledRecoveryImport.status,
    0,
    combinedOutput(ownerControlledRecoveryImport)
  );
  const ownerControlledReadback = await adminClient.query(`
    select has_function_privilege(
      'vk_identity_admin',
      'public.identity_owner_only_helper()',
      'EXECUTE'
    ) as helper_execute
  `);
  assert.deepEqual(ownerControlledReadback.rows, [{ helper_execute: false }]);

  await adminClient.query(`
    grant execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) to public
  `);
  const publicExecuteImport = runRoleImport();
  assert.notEqual(publicExecuteImport.status, 0);
  assert.match(
    combinedOutput(publicExecuteImport),
    /privileges outside the explicit identity-binding allowlist/u
  );
  await adminClient.query(`
    revoke execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from public
  `);
  const publicRecoveryImport = runRoleImport();
  assert.equal(publicRecoveryImport.status, 0, combinedOutput(publicRecoveryImport));

  await adminClient.query(`
    grant execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) to vk_identity_admin
  `);
  const directExecuteImport = runRoleImport();
  assert.notEqual(directExecuteImport.status, 0);
  assert.match(
    combinedOutput(directExecuteImport),
    /privileges outside the explicit identity-binding allowlist/u
  );
  await adminClient.query(`
    revoke execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from vk_identity_admin
  `);

  await adminClient.query(`
    create role vk_identity_unsafe_executor nologin noinherit;
    grant execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) to vk_identity_unsafe_executor;
    grant vk_identity_unsafe_executor to vk_identity_admin;
  `);
  const inheritedExecuteImport = runRoleImport();
  assert.notEqual(inheritedExecuteImport.status, 0);
  assert.match(
    combinedOutput(inheritedExecuteImport),
    /must not inherit another database role/u
  );
  await adminClient.query(`
    revoke vk_identity_unsafe_executor from vk_identity_admin;
    revoke execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from vk_identity_unsafe_executor;
    drop role vk_identity_unsafe_executor;
  `);
  const finalImport = runRoleImport();
  assert.equal(finalImport.status, 0, combinedOutput(finalImport));

  await adminClient.query(`
    create role ${operatorLogin}
      login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
      password '${operatorPassword}';
    grant vk_identity_admin to ${operatorLogin}
      with admin false, inherit true, set true;
  `);
  const operatorMembership = await adminClient.query(
    `select
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
       from pg_catalog.pg_auth_members membership
       join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
       join pg_catalog.pg_roles member_role on member_role.oid = membership.member
      where granted_role.rolname = 'vk_identity_admin'
        and member_role.rolname = $1`,
    [operatorLogin]
  );
  assert.deepEqual(operatorMembership.rows, [{
    admin_option: false,
    inherit_option: true,
    set_option: true
  }]);

  const operatorClient = new Client({
    host: "127.0.0.1",
    port: Number(port),
    database: "postgres",
    user: operatorLogin,
    password: operatorPassword
  });
  await operatorClient.connect();
  try {
    const previewDocument = validateBindingDocument({
      version: 1,
      bindings: [{
        issuer: EXPECTED_IAP_ISSUER,
        subject: "securetoken.google.com/example-project:preview-subject",
        profile_id: "profile-preview",
        active: true
      }]
    });
    const previewLogs = [];
    const previewPlan = await executeIdentityBindingTransaction({
      client: operatorClient,
      document: previewDocument,
      fingerprint: bindingDocumentFingerprint(previewDocument),
      apply: false,
      allowSubjectRemaps: true,
      expectedDatabase: "",
      log: (line) => previewLogs.push(line)
    });
    assert.equal(previewPlan.requestedCount, 1);
    assert.equal(previewPlan.unchanged.length, 1);
    assert.equal(previewPlan.inserts.length, 0);
    assert.equal(previewPlan.updates.length, 0);
    assert.equal(previewPlan.remaps.length, 0);
    assert.equal(previewLogs.length, 1);
    assert.match(previewLogs[0], /mode=PREVIEW/u);
    assert.match(previewLogs[0], /unchanged_count=1/u);

    await assert.rejects(
      operatorClient.query(
        `select id
           from public.profiles
          where id = $1
          for share`,
        ["profile-preview"]
      ),
      (error) => error?.code === "42501",
      "PostgreSQL 16 muss die schreibberechtigungspflichtige Profil-Zeilensperre verweigern."
    );
    await assert.rejects(
      operatorClient.query(
        "update public.profiles set active = false where id = $1",
        ["profile-preview"]
      ),
      (error) => error?.code === "42501",
      "Der exakte Rollenvertrag muss Profilmutationen weiterhin verweigern."
    );
  } finally {
    await operatorClient.end();
  }

  const profileReadback = await adminClient.query(
    "select active from public.profiles where id = $1",
    ["profile-preview"]
  );
  assert.deepEqual(profileReadback.rows, [{ active: true }]);

  console.log(
    "PostgreSQL identity admin role, SELECT-only preview, and function ACL contracts passed."
  );
} finally {
  if (adminClient) await adminClient.end().catch(() => {});
  spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
}
