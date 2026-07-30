#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const root = new URL("../", import.meta.url);
const accessRoleSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/access-enrollment-admin-role.sql", root),
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
  console.log("SKIP: Docker is unavailable for the access enrollment role contract.");
  process.exit(0);
}

const containerName = `vk-access-role-pg-${process.pid}`;
const databasePassword = `vk-access-role-contract-${process.pid}`;
const schemaOwner = `vk_access_schema_owner_${process.pid}`;
const schemaOwnerPassword = `vk-access-schema-owner-${process.pid}`;
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
    alter database postgres owner to ${schemaOwner};
  `);
  const ownerAttributes = await adminClient.query(
    `select rolsuper, rolcreaterole
       from pg_catalog.pg_roles
      where rolname = $1`,
    [schemaOwner]
  );
  assert.deepEqual(ownerAttributes.rows, [{ rolsuper: false, rolcreaterole: true }]);

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

  const runRoleImport = () => dockerResult(
    [
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1", "-U", schemaOwner, "-d", "postgres"
    ],
    { input: accessRoleSql }
  );

  const initialImport = runRoleImport();
  assert.equal(initialImport.status, 0, combinedOutput(initialImport));

  const securedReadback = await adminClient.query(`
    select
      pg_get_userbyid(consumer.proowner) as consumer_owner,
      has_function_privilege(
        'vk_access_enrollment_admin',
        touch.oid,
        'EXECUTE'
      ) as touch_execute,
      has_function_privilege(
        'vk_access_enrollment_admin',
        consumer.oid,
        'EXECUTE'
      ) as consumer_execute,
      has_function_privilege('public', consumer.oid, 'EXECUTE') as public_execute
      from pg_catalog.pg_proc touch
      cross join pg_catalog.pg_proc consumer
     where touch.oid = 'public.pre_gematik_touch_updated_at()'::regprocedure
       and consumer.oid =
         'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::regprocedure
  `);
  assert.deepEqual(securedReadback.rows, [{
    consumer_owner: "vk_allowlist_executor",
    touch_execute: true,
    consumer_execute: false,
    public_execute: false
  }]);

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
    /privileges outside the explicit v2 access allowlist/u
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
    ) to vk_access_enrollment_admin
  `);
  const directExecuteImport = runRoleImport();
  assert.notEqual(directExecuteImport.status, 0);
  assert.match(
    combinedOutput(directExecuteImport),
    /privileges outside the explicit v2 access allowlist/u
  );
  await adminClient.query(`
    revoke execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from vk_access_enrollment_admin
  `);

  await adminClient.query(`
    create role vk_access_unsafe_executor nologin noinherit;
    grant execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) to vk_access_unsafe_executor;
    grant vk_access_unsafe_executor to vk_access_enrollment_admin;
  `);
  const inheritedExecuteImport = runRoleImport();
  assert.notEqual(inheritedExecuteImport.status, 0);
  assert.match(
    combinedOutput(inheritedExecuteImport),
    /must not inherit another database role/u
  );
  await adminClient.query(`
    revoke vk_access_unsafe_executor from vk_access_enrollment_admin;
    revoke execute on function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) from vk_access_unsafe_executor;
    drop role vk_access_unsafe_executor;
  `);
  const finalImport = runRoleImport();
  assert.equal(finalImport.status, 0, combinedOutput(finalImport));

  console.log(
    "PostgreSQL access enrollment role ownership and effective function ACL contracts passed."
  );
} finally {
  if (adminClient) await adminClient.end().catch(() => {});
  spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
}
