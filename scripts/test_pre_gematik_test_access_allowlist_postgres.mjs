#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
import {
  accessDocumentFingerprint,
  executeAccessTransaction,
  validateAccessDocument
} from "./provision_pre_gematik_test_access.mjs";
import {
  allowlistDocumentFingerprint,
  executeAllowlistTransaction,
  validateAllowlistDocument
} from "./provision_pre_gematik_test_access_allowlist.mjs";

const { Client, Pool } = pg;
const root = new URL("../", import.meta.url);
const schemaSql = readFileSync(new URL("deploy/postgres/pre-gematik/schema.sql", root), "utf8");
const runtimeRoleSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/runtime-role.sql", root),
  "utf8"
);
const grantsSql = readFileSync(new URL("deploy/postgres/pre-gematik/grants.sql", root), "utf8");
const allowlistRolesSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/access-allowlist-admin-role.sql", root),
  "utf8"
);
const accessRolesSql = readFileSync(
  new URL("deploy/postgres/pre-gematik/access-enrollment-admin-role.sql", root),
  "utf8"
);

function docker(argumentsList, options = {}) {
  const result = spawnSync("docker", argumentsList, {
    encoding: "utf8",
    input: options.input,
    stdio: options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`Docker contract command failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
if (!dockerAvailable) {
  console.log("SKIP: Docker is unavailable for the PostgreSQL allowlist concurrency contract.");
  process.exit(0);
}

const containerName = `vk-allowlist-pg-${process.pid}`;
const databasePassword = `vk-allowlist-contract-${process.pid}`;
let adminPool;
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
  const adminUrl = `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/postgres?sslmode=disable`;
  adminPool = new Pool({ connectionString: adminUrl, max: 4 });
  let hostReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await adminPool.query("select 1");
      hostReady = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(hostReady, true, "PostgreSQL host port did not become ready.");
  await adminPool.query(schemaSql);
  await adminPool.query(schemaSql);

  docker(
    ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: runtimeRoleSql }
  );
  docker(
    [
      "exec", "-i", containerName,
      "psql", "-v", "ON_ERROR_STOP=1", "-v", "runtime_role=vk_app_runtime",
      "-U", "postgres", "-d", "postgres"
    ],
    { input: grantsSql }
  );
  docker(
    ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: allowlistRolesSql }
  );
  docker(
    ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: accessRolesSql }
  );

  const runtimeLogin = `vk_allowlist_runtime_${process.pid}`;
  const allowlistAdminLogin = `vk_allowlist_admin_${process.pid}`;
  const accessAdminLogin = `vk_access_admin_${process.pid}`;
  const loginPassword = `vk-login-contract-${process.pid}`;
  await adminPool.query(`
    create role cloudsqlsuperuser nologin;
    create role ${runtimeLogin} login inherit password '${loginPassword}'
      in role vk_app_runtime;
    create role ${allowlistAdminLogin} login inherit password '${loginPassword}'
      in role vk_access_allowlist_admin;
    create role ${accessAdminLogin} login inherit password '${loginPassword}'
      in role vk_access_enrollment_admin;
  `);

  const runtimeUrl =
    `postgresql://${runtimeLogin}:${loginPassword}@127.0.0.1:${port}/postgres?sslmode=disable`;
  const allowlistAdminUrl =
    `postgresql://${allowlistAdminLogin}:${loginPassword}@127.0.0.1:${port}/postgres?sslmode=disable`;
  const accessAdminUrl =
    `postgresql://${accessAdminLogin}:${loginPassword}@127.0.0.1:${port}/postgres?sslmode=disable`;

  const invalidAllowlistRows = [
    {
      allowlistId: "81000000-0000-4000-8000-000000000001",
      email: "invalid-profile@example.invalid",
      profileId: "test-user-alice",
      message: "Allowlist profile IDs must be opaque lowercase UUIDv4 values."
    },
    {
      allowlistId: "81000000-0000-4000-8000-000000000002",
      email: "Uppercase@example.invalid",
      profileId: "82000000-0000-4000-8000-000000000002",
      message: "Allowlist emails must already be ASCII-lowercase normalized."
    },
    {
      allowlistId: "81000000-0000-4000-8000-000000000003",
      email: "tést@example.invalid",
      profileId: "82000000-0000-4000-8000-000000000003",
      message: "Allowlist emails must not contain non-ASCII characters."
    },
    {
      allowlistId: "81000000-0000-4000-8000-000000000004",
      email: "wild*card@example.invalid",
      profileId: "82000000-0000-4000-8000-000000000004",
      message: "Allowlist emails must not contain wildcard characters."
    }
  ];
  for (const invalidRow of invalidAllowlistRows) {
    await assert.rejects(
      adminPool.query(
        `insert into public.test_access_allowlist
          (allowlist_id, email_normalized, profile_id, display_name, role, scope_ref, expires_at)
         values ($1, $2, $3, 'Invalid contract row', 'viewer',
           'pre-gematik-external-test-2026-08', now() + interval '1 day')`,
        [invalidRow.allowlistId, invalidRow.email, invalidRow.profileId]
      ),
      (error) => error?.code === "23514",
      invalidRow.message
    );
  }

  const firstAllowlistId = "11111111-1111-4111-8111-111111111111";
  const firstProfileId = "22222222-2222-4222-8222-222222222222";
  let manualRequestId;
  const firstExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const firstAllowlistEntry = {
    allowlist_id: firstAllowlistId,
    email_normalized: "manual-auto@example.invalid",
    profile: {
      id: firstProfileId,
      display_name: "Manual Auto Tester",
      initials: "MA",
      role: "viewer",
      active: true,
      team: "Externer Test",
      bio: null
    },
    access_scope: "test_only",
    scope_ref: "pre-gematik-external-test-2026-08",
    expires_at: firstExpiry,
    desired_state: "active",
    revoke_reason: null
  };
  const initialAllowlistDocument = validateAllowlistDocument({
    version: 1,
    entries: [firstAllowlistEntry]
  });
  const initialOperatorClient = new Client({ connectionString: allowlistAdminUrl });
  await initialOperatorClient.connect();
  try {
    await executeAllowlistTransaction({
      client: initialOperatorClient,
      document: initialAllowlistDocument,
      fingerprint: allowlistDocumentFingerprint(initialAllowlistDocument),
      apply: true,
      expectedDatabase: "postgres",
      expectedCounts: { entries: 1, inserts: 1, revocations: 0 },
      log: () => {}
    });
  } finally {
    await initialOperatorClient.end();
  }

  const manualClient = new Client({ connectionString: runtimeUrl });
  const autoClient = new Client({ connectionString: runtimeUrl });
  await manualClient.connect();
  await autoClient.connect();
  try {
    await manualClient.query("begin");
    await manualClient.query(
      "select pg_advisory_xact_lock(hashtext($1))",
      ["versorgungs-kompass:pre-gematik:identity-bindings"]
    );
    await manualClient.query(
      "select pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2, 0))",
      ["https://cloud.google.com/iap", "manual-auto-subject"]
    );
    const pendingInsert = await manualClient.query(
      `insert into public.identity_enrollment_requests
        (issuer, subject, verified_email, expires_at)
       values ($1, $2, $3, now() + interval '1 day')
       returning request_id`,
      [
        "https://cloud.google.com/iap",
        "manual-auto-subject",
        "manual-auto@example.invalid"
      ]
    );
    manualRequestId = String(pendingInsert.rows[0].request_id);

    let autoSettled = false;
    const autoPromise = autoClient.query(
      `select *
         from public.pre_gematik_consume_test_access_allowlist(
           $1, $2, $3, $4, now(), now() + interval '1 day'
         )`,
      [
        "44444444-4444-4444-8444-444444444444",
        "https://cloud.google.com/iap",
        "manual-auto-subject",
        "MANUAL-AUTO@example.invalid"
      ]
    ).finally(() => {
      autoSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(autoSettled, false, "Auto-consumption must wait for the manual global lock.");
    await manualClient.query("commit");
    const autoResult = await autoPromise;
    assert.equal(autoResult.rowCount, 1);
    assert.equal(String(autoResult.rows[0].request_id), manualRequestId);
    assert.equal(autoResult.rows[0].status, "applied");
    assert.equal(autoResult.rows[0].access_scope, "test_only");
  } finally {
    await manualClient.query("rollback").catch(() => {});
    await manualClient.end();
    await autoClient.end();
  }

  const secondAllowlistId = "55555555-5555-4555-8555-555555555555";
  const secondProfileId = "66666666-6666-4666-8666-666666666666";
  const secondAllowlistEntry = {
    allowlist_id: secondAllowlistId,
    email_normalized: "revoked-race@example.invalid",
    profile: {
      id: secondProfileId,
      display_name: "Revoked Race Tester",
      initials: null,
      role: "editor",
      active: true,
      team: null,
      bio: null
    },
    access_scope: "test_only",
    scope_ref: "pre-gematik-external-test-2026-08",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    desired_state: "active",
    revoke_reason: null
  };
  const expandedAllowlistDocument = validateAllowlistDocument({
    version: 1,
    entries: [
      { ...firstAllowlistEntry, desired_state: "consumed" },
      secondAllowlistEntry
    ]
  });
  const expansionClient = new Client({ connectionString: allowlistAdminUrl });
  await expansionClient.connect();
  try {
    await executeAllowlistTransaction({
      client: expansionClient,
      document: expandedAllowlistDocument,
      fingerprint: allowlistDocumentFingerprint(expandedAllowlistDocument),
      apply: true,
      expectedDatabase: "postgres",
      expectedCounts: { entries: 2, inserts: 1, revocations: 0 },
      log: () => {}
    });
  } finally {
    await expansionClient.end();
  }
  const operatorClient = new Client({ connectionString: allowlistAdminUrl });
  const secondAutoClient = new Client({ connectionString: runtimeUrl });
  await operatorClient.connect();
  await secondAutoClient.connect();
  try {
    await operatorClient.query("begin");
    await operatorClient.query("set local role vk_access_allowlist_admin");
    await operatorClient.query(
      "select pg_advisory_xact_lock(hashtext($1))",
      ["versorgungs-kompass:pre-gematik:identity-bindings"]
    );
    await operatorClient.query(
      `update public.test_access_allowlist
          set revoked_at = now(), revoke_reason = 'Concurrency contract revoke'
        where allowlist_id = $1`,
      [secondAllowlistId]
    );
    let secondAutoSettled = false;
    const secondAutoPromise = secondAutoClient.query(
      `select *
         from public.pre_gematik_consume_test_access_allowlist(
           $1, $2, $3, $4, now(), now() + interval '1 day'
         )`,
      [
        "77777777-7777-4777-8777-777777777777",
        "https://cloud.google.com/iap",
        "revoked-race-subject",
        "revoked-race@example.invalid"
      ]
    ).finally(() => {
      secondAutoSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(secondAutoSettled, false, "Auto-consumption must wait for the operator global lock.");
    await operatorClient.query("commit");
    assert.equal((await secondAutoPromise).rowCount, 0, "Revoked row must not be consumed.");
  } finally {
    await operatorClient.query("rollback").catch(() => {});
    await operatorClient.end();
    await secondAutoClient.end();
  }

  const runtimePool = new Pool({ connectionString: runtimeUrl, max: 1 });
  await assert.rejects(
    runtimePool.query("select email_normalized from public.test_access_allowlist"),
    (error) => error?.code === "42501",
    "Runtime must not enumerate the protected roster."
  );
  await assert.rejects(
    runtimePool.query(
      `insert into public.identity_bindings (issuer, subject, profile_id)
       values ('https://cloud.google.com/iap', 'forbidden', $1)`,
      [firstProfileId]
    ),
    (error) => error?.code === "42501",
    "Runtime must not write bindings directly."
  );
  await runtimePool.end();

  const functionSecurity = await adminPool.query(`
    select
      pg_get_userbyid(routine.proowner) as owner,
      routine.prosecdef,
      routine.proconfig,
      has_function_privilege(
        'vk_app_runtime',
        routine.oid,
        'EXECUTE'
      ) as runtime_execute,
      has_function_privilege('public', routine.oid, 'EXECUTE') as public_execute
      from pg_catalog.pg_proc routine
     where routine.oid =
       'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::regprocedure
  `);
  assert.deepEqual(functionSecurity.rows, [{
    owner: "vk_allowlist_executor",
    prosecdef: true,
    proconfig: ["search_path=pg_catalog, public"],
    runtime_execute: true,
    public_execute: false
  }]);

  const offboardDocument = validateAccessDocument({
    version: 2,
    bindings: [],
    enrollments: [{
      request_id: manualRequestId,
      expected_email: "manual-auto@example.invalid",
      profile: {
        id: firstProfileId,
        email: "manual-auto@example.invalid",
        display_name: "Manual Auto Tester",
        initials: "MA",
        role: "viewer",
        active: false,
        team: "Externer Test",
        bio: null
      },
      binding: {
        active: false,
        access_scope: "test_only",
        scope_ref: "pre-gematik-external-test-2026-08"
      }
    }]
  });
  const accessClient = new Client({ connectionString: accessAdminUrl });
  await accessClient.connect();
  try {
    const offboardFingerprint = accessDocumentFingerprint(offboardDocument);
    const offboardPreview = await executeAccessTransaction({
      client: accessClient,
      document: offboardDocument,
      fingerprint: offboardFingerprint,
      apply: false,
      expectedDatabase: "postgres",
      log: () => {}
    });
    await assert.rejects(
      executeAccessTransaction({
        client: accessClient,
        document: offboardDocument,
        fingerprint: offboardFingerprint,
        apply: true,
        confirmedCurrentStateFingerprint: `sha256:${"0".repeat(64)}`,
        expectedDatabase: "postgres",
        log: () => {}
      }),
      (error) => /current_state_fingerprint/u.test(error?.message || ""),
      "Apply muss einen vom Preview abweichenden Istzustands-Fingerprint ablehnen."
    );
    const stateAfterRejectedApply = await adminPool.query(
      `select binding.active as binding_active, profile.active as profile_active
         from public.identity_bindings binding
         join public.profiles profile on profile.id = binding.profile_id
        where binding.subject = 'manual-auto-subject'`
    );
    assert.deepEqual(
      stateAfterRejectedApply.rows,
      [{ binding_active: true, profile_active: true }],
      "Ein abgewiesener Istzustands-Fingerprint darf keine Teiländerung hinterlassen."
    );
    await executeAccessTransaction({
      client: accessClient,
      document: offboardDocument,
      fingerprint: offboardFingerprint,
      apply: true,
      confirmedCurrentStateFingerprint: offboardPreview.currentStateFingerprint,
      expectedDatabase: "postgres",
      log: () => {}
    });
  } finally {
    await accessClient.end();
  }
  const offboarded = await adminPool.query(
    `select binding.active as binding_active, profile.active as profile_active
       from public.identity_bindings binding
       join public.profiles profile on profile.id = binding.profile_id
      where binding.subject = 'manual-auto-subject'`
  );
  assert.deepEqual(offboarded.rows, [{ binding_active: false, profile_active: false }]);

  console.log("PostgreSQL allowlist concurrency and offboarding contracts passed.");
} finally {
  if (adminPool) await adminPool.end().catch(() => {});
  spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
}
