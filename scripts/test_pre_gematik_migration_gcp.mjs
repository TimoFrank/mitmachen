#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  MigrationGcpGateError,
  checkPreGematikMigrationGcp,
  createGcloudJsonRunner,
  isReadOnlyGcloudInvocation,
  loadGateConfiguration,
  projectIdPin,
  runCli
} from "./check_pre_gematik_migration_gcp.mjs";

const NOW = new Date("2030-06-15T12:00:00.000Z");
const TEST_CONTEXT = Object.freeze({
  projectId: "example-protected-project",
  region: "example-region1",
  clusterName: "example-private-cluster",
  namespace: "example-protected-namespace",
  instanceName: "example-private-postgres",
  backupId: "20300615110000"
});

function environment(overrides = {}) {
  return {
    GCP_PROJECT_ID: TEST_CONTEXT.projectId,
    GCP_REGION: TEST_CONTEXT.region,
    GKE_CLUSTER_NAME: TEST_CONTEXT.clusterName,
    GKE_LOCATION: TEST_CONTEXT.region,
    K8S_NAMESPACE: TEST_CONTEXT.namespace,
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${TEST_CONTEXT.projectId}:${TEST_CONTEXT.region}:${TEST_CONTEXT.instanceName}`,
    PRE_GEMATIK_GCP_PROJECT_SHA256: projectIdPin(TEST_CONTEXT.projectId),
    PRE_IMPORT_BACKUP_ID: TEST_CONTEXT.backupId,
    PRE_IMPORT_BACKUP_NOT_BEFORE: "2030-06-15T10:00:00.000Z",
    ...overrides
  };
}

function fixtures(overrides = {}) {
  const clusterResource = `//container.googleapis.com/projects/${TEST_CONTEXT.projectId}/locations/${TEST_CONTEXT.region}/clusters/${TEST_CONTEXT.clusterName}`;
  const base = {
    project: {
      projectId: TEST_CONTEXT.projectId,
      lifecycleState: "ACTIVE"
    },
    cluster: {
      name: TEST_CONTEXT.clusterName,
      location: TEST_CONTEXT.region,
      status: "RUNNING"
    },
    namespaces: [{
      assetType: "k8s.io/Namespace",
      displayName: TEST_CONTEXT.namespace,
      location: TEST_CONTEXT.region,
      parentFullResourceName: clusterResource,
      name: `${clusterResource}/k8s/namespaces/${TEST_CONTEXT.namespace}`
    }],
    instance: {
      name: TEST_CONTEXT.instanceName,
      project: TEST_CONTEXT.projectId,
      region: TEST_CONTEXT.region,
      connectionName: `${TEST_CONTEXT.projectId}:${TEST_CONTEXT.region}:${TEST_CONTEXT.instanceName}`,
      state: "RUNNABLE",
      databaseVersion: "POSTGRES_16",
      ipAddresses: [{ type: "PRIVATE", ipAddress: "10.23.45.67" }],
      settings: {
        ipConfiguration: {
          ipv4Enabled: false,
          privateNetwork: "projects/example-network-host/global/networks/example-private-network"
        }
      }
    },
    backup: {
      id: TEST_CONTEXT.backupId,
      instance: TEST_CONTEXT.instanceName,
      location: TEST_CONTEXT.region,
      status: "SUCCESSFUL",
      endTime: "2030-06-15T11:15:00.000Z",
      selfLink: `https://sqladmin.googleapis.com/sql/v1beta4/projects/${TEST_CONTEXT.projectId}/instances/${TEST_CONTEXT.instanceName}/backupRuns/${TEST_CONTEXT.backupId}`
    }
  };
  return {
    ...base,
    ...overrides
  };
}

function mockRunner(data, calls = []) {
  return async (argumentsList) => {
    calls.push([...argumentsList]);
    assert.equal(isReadOnlyGcloudInvocation(argumentsList), true);
    const signature = argumentsList.slice(0, 3).join(" ");
    if (signature.startsWith("projects describe ")) return structuredClone(data.project);
    if (signature.startsWith("container clusters describe")) return structuredClone(data.cluster);
    if (signature.startsWith("asset search-all-resources")) return structuredClone(data.namespaces);
    if (signature.startsWith("sql instances describe")) return structuredClone(data.instance);
    if (signature.startsWith("sql backups describe")) return structuredClone(data.backup);
    throw new Error("unexpected mock invocation");
  };
}

async function expectGateFailure(overrides, code) {
  const config = loadGateConfiguration(environment(overrides.environment));
  const data = fixtures(overrides.fixtures);
  await assert.rejects(
    checkPreGematikMigrationGcp(config, {
      runGcloud: mockRunner(data),
      now: () => NOW
    }),
    (error) => error instanceof MigrationGcpGateError && error.code === code
  );
}

{
  const calls = [];
  const result = await checkPreGematikMigrationGcp(
    loadGateConfiguration(environment()),
    { runGcloud: mockRunner(fixtures(), calls), now: () => NOW }
  );
  assert.deepEqual(Object.keys(result).sort(), ["fingerprint", "ok", "targetDatabase"]);
  assert.equal(result.ok, true);
  assert.match(result.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(result.targetDatabase, {
    connectionName: `${TEST_CONTEXT.projectId}:${TEST_CONTEXT.region}:${TEST_CONTEXT.instanceName}`
  });
  assert.equal(calls.length, 5);
  assert.equal(calls.every(isReadOnlyGcloudInvocation), true);
  assert.equal(calls.every((call) => call.includes("--format=json")), true);
  assert.equal(
    calls.flat().some((argument) => [
      "create", "delete", "get-credentials", "import", "patch", "restore", "update"
    ].includes(argument)),
    false
  );
}

{
  const calls = [];
  const config = loadGateConfiguration(environment({
    PRE_GEMATIK_GCP_PROJECT_SHA256: `sha256:${"0".repeat(64)}`
  }));
  await assert.rejects(
    checkPreGematikMigrationGcp(config, {
      runGcloud: mockRunner(fixtures(), calls),
      now: () => NOW
    }),
    (error) => error instanceof MigrationGcpGateError && error.code === "PROJECT_PIN_MISMATCH"
  );
  assert.deepEqual(calls, [], "Ein falscher Projekt-Pin muss vor jedem Cloud-Aufruf abbrechen.");
}

await expectGateFailure({ fixtures: { project: { projectId: TEST_CONTEXT.projectId, lifecycleState: "DELETE_REQUESTED" } } }, "PROJECT_STATE_INVALID");
await expectGateFailure({ fixtures: { cluster: { ...fixtures().cluster, location: "other-region1" } } }, "CLUSTER_CONTEXT_INVALID");
await expectGateFailure({ fixtures: { namespaces: [] } }, "NAMESPACE_CONTEXT_INVALID");
await expectGateFailure({ fixtures: { instance: { ...fixtures().instance, state: "SUSPENDED" } } }, "SQL_INSTANCE_INVALID");
await expectGateFailure({ fixtures: { instance: { ...fixtures().instance, databaseVersion: "POSTGRES_15" } } }, "SQL_INSTANCE_INVALID");
await expectGateFailure({ fixtures: { instance: { ...fixtures().instance, ipAddresses: [] } } }, "SQL_INSTANCE_INVALID");
await expectGateFailure({
  fixtures: {
    instance: {
      ...fixtures().instance,
      ipAddresses: [
        ...fixtures().instance.ipAddresses,
        { type: "PRIMARY", ipAddress: "192.0.2.10" }
      ]
    }
  }
}, "SQL_INSTANCE_INVALID");
await expectGateFailure({ fixtures: { backup: { ...fixtures().backup, status: "RUNNING" } } }, "BACKUP_INVALID");
await expectGateFailure({ fixtures: { backup: { ...fixtures().backup, instance: "other-private-postgres" } } }, "BACKUP_INVALID");
await expectGateFailure({ fixtures: { backup: { ...fixtures().backup, endTime: "2030-06-15T09:59:59.000Z" } } }, "BACKUP_INVALID");
await expectGateFailure({
  fixtures: {
    backup: {
      ...fixtures().backup,
      selfLink: `https://sqladmin.googleapis.com/sql/v1beta4/projects/other-protected-project/instances/${TEST_CONTEXT.instanceName}/backupRuns/${TEST_CONTEXT.backupId}`
    }
  }
}, "BACKUP_INVALID");

assert.throws(
  () => loadGateConfiguration(environment({ GKE_LOCATION: "other-region1" })),
  (error) => error instanceof MigrationGcpGateError && error.code === "CONTEXT_TUPLE_MISMATCH"
);
assert.throws(
  () => loadGateConfiguration(environment({ PRE_IMPORT_BACKUP_NOT_BEFORE: "not-a-time" })),
  (error) => error instanceof MigrationGcpGateError && error.code === "BACKUP_TIME_BOUND_INVALID"
);

{
  const rawSensitiveError = new Error(`synthetic failure ${TEST_CONTEXT.projectId} ${TEST_CONTEXT.backupId}`);
  rawSensitiveError.stderr = `${TEST_CONTEXT.namespace}`;
  const runner = createGcloudJsonRunner({
    execFile() {
      throw rawSensitiveError;
    }
  });
  await assert.rejects(
    runner(["projects", "describe", TEST_CONTEXT.projectId, "--format=json"]),
    (error) => (
      error instanceof MigrationGcpGateError
      && error.code === "GCLOUD_READ_FAILED"
      && !error.message.includes(TEST_CONTEXT.projectId)
      && !error.message.includes(TEST_CONTEXT.backupId)
      && !error.message.includes(TEST_CONTEXT.namespace)
    )
  );
}

{
  const written = { stdout: "", stderr: "" };
  const status = await runCli({
    argv: [],
    environment: environment(),
    runGcloud: mockRunner(fixtures()),
    now: () => NOW,
    stdout: { write(value) { written.stdout += value; } },
    stderr: { write(value) { written.stderr += value; } }
  });
  assert.equal(status, 0);
  assert.match(written.stdout, /^GATE PASS sha256:[a-f0-9]{64}\n$/u);
  assert.equal(written.stderr, "");
  for (const sensitiveValue of Object.values(TEST_CONTEXT)) {
    assert.equal(written.stdout.includes(sensitiveValue), false);
    assert.equal(written.stderr.includes(sensitiveValue), false);
  }
}

{
  const written = { stdout: "", stderr: "" };
  const status = await runCli({
    argv: [],
    environment: environment(),
    runGcloud: mockRunner(fixtures({ backup: { ...fixtures().backup, status: "FAILED" } })),
    now: () => NOW,
    stdout: { write(value) { written.stdout += value; } },
    stderr: { write(value) { written.stderr += value; } }
  });
  assert.equal(status, 1);
  assert.equal(written.stdout, "");
  assert.equal(written.stderr, "GATE FAIL [BACKUP_INVALID]\n");
  for (const sensitiveValue of Object.values(TEST_CONTEXT)) {
    assert.equal(written.stderr.includes(sensitiveValue), false);
  }
}

assert.equal(isReadOnlyGcloudInvocation(["container", "clusters", "get-credentials", "example", "--format=json"]), false);
assert.equal(isReadOnlyGcloudInvocation(["sql", "backups", "restore", "example", "--format=json"]), false);
assert.equal(isReadOnlyGcloudInvocation(["projects", "describe", "example"]), false);

console.log("Pre-Gematik GCP migration gate contract OK (read-only, pinned, fail-closed).\n");
