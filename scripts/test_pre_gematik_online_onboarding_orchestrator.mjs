#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXPECTED_CONTINUE_URL,
  validateIdentityPlatformAccountDocument
} from "./provision_pre_gematik_identity_platform_account.mjs";
import {
  GUEST_ACCESS_CREATE_PROFILE_OPERATION,
  validateIdentityPlatformGuestAccessDocument
} from "./provision_pre_gematik_identity_platform_guest_access.mjs";
import {
  PASSWORD_INVITATION_OPERATION
} from "./provision_pre_gematik_password_invitation.mjs";
import {
  WELCOME_EMAIL_OPERATION
} from "./render_pre_gematik_guest_welcome_email.mjs";
import {
  WELCOME_EMAIL_SEND_OPERATION
} from "./send_pre_gematik_guest_welcome_email.mjs";
import {
  ONLINE_ONBOARDING_OPERATION,
  ONLINE_ONBOARDING_CLEANUP_STATE,
  ONLINE_ONBOARDING_READY_STATE,
  ONLINE_ONBOARDING_VERSION,
  AppendOnlyOnlineOnboardingJournal,
  CommandOnlineOnboardingRuntime,
  OnlineOnboardingError,
  TEMPORARY_IAM_ROLES,
  bindOnlineOnboardingDocuments,
  executeOnlineOnboardingPreparation,
  onlineOnboardingFingerprint,
  parseOnlineOnboardingArguments,
  runCommand,
  validateBaseEnvironment,
  validateOperatorRelease
} from "./orchestrate_pre_gematik_online_onboarding.mjs";

function safeFailure(action, pattern) {
  assert.throws(
    action,
    (error) => error instanceof OnlineOnboardingError && pattern.test(error.message)
  );
}

async function safeRejection(action, pattern) {
  await assert.rejects(
    action,
    (error) => error instanceof OnlineOnboardingError && pattern.test(error.message)
  );
}

const projectRoot = new URL("../", import.meta.url);
const [
  environmentExample,
  releaseExampleText,
  operatorRunbook,
  externalIdentityRunbook
] = await Promise.all([
  fs.readFile(
    new URL("config/pre-gematik/online-onboarding.env.example", projectRoot),
    "utf8"
  ),
  fs.readFile(
    new URL(
      "config/pre-gematik/online-onboarding-operator-release.example.json",
      projectRoot
    ),
    "utf8"
  ),
  fs.readFile(new URL("deploy/migration-operator/README.md", projectRoot), "utf8"),
  fs.readFile(
    new URL(
      "dokumentation/betrieb-und-deployment/PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md",
      projectRoot
    ),
    "utf8"
  )
]);

const exampleEnvironment = Object.fromEntries(
  environmentExample
    .split(/\r?\n/u)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      assert.ok(separator > 0, "Die Beispielumgebung enthaelt eine ungueltige Zeile.");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);
assert.deepEqual(Object.keys(exampleEnvironment).sort(), [
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME",
  "EXPECTED_TARGET_PROJECT_ID",
  "GCP_PROJECT_ID",
  "GCP_REGION",
  "GKE_CLUSTER_NAME",
  "GKE_LOCATION",
  "GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND",
  "GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND",
  "K8S_NAMESPACE",
  "PRE_GEMATIK_GCP_PROJECT_SHA256"
]);
assert.equal(Object.hasOwn(exampleEnvironment, "PRE_IMPORT_BACKUP_ID"), false);
assert.equal(exampleEnvironment.GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND, "true");
assert.equal(
  exampleEnvironment.GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND,
  "false"
);

const releaseExample = JSON.parse(releaseExampleText);
assert.deepEqual(Object.keys(releaseExample).sort(), [
  "approved_until",
  "cloud_sql_proxy_sha256",
  "image",
  "invitation_bucket",
  "pilot_end",
  "source_commit",
  "version"
]);
assert.match(releaseExample.image, /@sha256:REPLACE_WITH_EXACT_64_HEX_IMAGE_DIGEST$/u);
assert.doesNotMatch(releaseExample.image, /:latest|:main|:stable/iu);

for (const runbook of [operatorRunbook, externalIdentityRunbook]) {
  assert.match(runbook, /`READY_TO_SEND`/u);
  assert.match(runbook, /`mail_sent=false`/u);
  assert.match(runbook, /vier bis acht Minuten/u);
}
assert.match(externalIdentityRunbook, /`SEND_PRE_GEMATIK_GUEST_WELCOME_EMAIL`/u);
assert.match(
  externalIdentityRunbook,
  /kein Wartungsfenster, keinen (?:Application|App)-Lock,[\s\S]{0,80}kein\s+Skalieren/u
);

{
  const processDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-process-"));
  const childMarker = path.join(processDirectory, "child-continued-after-sigterm");
  const startedAt = Date.now();
  try {
    await safeRejection(
      () => runCommand(
        process.execPath,
        [
          "--eval",
          "process.on('SIGTERM',()=>{});process.stdout.write('x'.repeat(256));"
            + "setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'continued'),200);"
            + "setInterval(()=>{},1000);",
          childMarker
        ],
        {
          label: "Ausgabegrenzen-Testprozess",
          timeoutMs: 5_000,
          maximumOutputBytes: 32
        }
      ),
      /Ausgabegrenzen-Testprozess/u
    );
    assert.ok(
      Date.now() - startedAt >= 800,
      "Die Ausgabegrenze darf nicht vor dem tatsaechlichen Prozessende als beendet gelten."
    );
    assert.equal(
      await fs.readFile(childMarker, "utf8"),
      "continued",
      "Der Testprozess muss SIGTERM ignoriert haben, bevor SIGKILL den Abschluss erzwingt."
    );
  } finally {
    await fs.rm(processDirectory, { recursive: true, force: true });
  }
}

const projectId = "steam-capsule-341212";
const region = "europe-west3";
const now = new Date("2026-08-05T08:00:00.000Z");
const baseEnvironmentValue = {
  GCP_PROJECT_ID: projectId,
  GCP_REGION: region,
  GKE_CLUSTER_NAME: "versorgungs-kompass-pre-gematik",
  GKE_LOCATION: region,
  K8S_NAMESPACE: "pre-gematik",
  CLOUD_SQL_INSTANCE_CONNECTION_NAME:
    `${projectId}:${region}:versorgungs-kompass-pre-gematik`,
  PRE_GEMATIK_GCP_PROJECT_SHA256:
    `sha256:${crypto.createHash("sha256").update(projectId).digest("hex")}`,
  EXPECTED_TARGET_PROJECT_ID: projectId,
  GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "true",
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "false"
};
const baseEnvironment = validateBaseEnvironment(baseEnvironmentValue);

assert.equal(ONLINE_ONBOARDING_VERSION, 1);
assert.equal(ONLINE_ONBOARDING_OPERATION, "PREPARE_PRE_GEMATIK_ONLINE_GUEST");
assert.equal(ONLINE_ONBOARDING_CLEANUP_STATE, "CLEANUP_COMPLETED_RESUME_REQUIRED");
assert.equal(ONLINE_ONBOARDING_READY_STATE, "READY_TO_SEND");
assert.equal(baseEnvironment.cloudSqlInstance, "versorgungs-kompass-pre-gematik");
assert.deepEqual(TEMPORARY_IAM_ROLES, [
  "roles/container.clusterViewer",
  "roles/cloudasset.viewer",
  "roles/cloudsql.viewer",
  "roles/cloudsql.client",
  "roles/identitytoolkit.viewer",
  "roles/serviceusage.serviceUsageConsumer"
]);

for (const [change, pattern] of [
  [{ EXPECTED_TARGET_PROJECT_ID: "different-project-123" }, /Online-Neunutzervertrag/u],
  [{ GKE_LOCATION: "europe-west1" }, /Online-Neunutzervertrag/u],
  [{ GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "false" }, /Online-Neunutzervertrag/u],
  [{ GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "true" }, /Online-Neunutzervertrag/u],
  [{ CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${projectId}:europe-west1:foreign` }, /Cloud-SQL/u]
]) {
  safeFailure(
    () => validateBaseEnvironment({ ...baseEnvironmentValue, ...change }),
    pattern
  );
}
safeFailure(
  () => validateBaseEnvironment({ ...baseEnvironmentValue, PRE_IMPORT_BACKUP_ID: "forbidden" }),
  /nicht freigegebene Felder/u
);

const operatorReleaseValue = {
  version: 1,
  source_commit: "b".repeat(40),
  image:
    `${region}-docker.pkg.dev/${projectId}/versorgungs-kompass-pre-gematik/`
    + `vk-access-operator@sha256:${"c".repeat(64)}`,
  cloud_sql_proxy_sha256: `sha256:${"d".repeat(64)}`,
  approved_until: "2026-09-30T15:00:00Z",
  invitation_bucket: `${projectId}-vk-pre-gematik-invitations`,
  pilot_end: "2026-09-30T16:00:00Z"
};
const operatorRelease = validateOperatorRelease(operatorReleaseValue, baseEnvironment, now);
assert.equal(operatorRelease.image, operatorReleaseValue.image);

function createPreflightCommandRunner({
  gkeEndpoint = "gke.example.invalid",
  gkeCa = "synthetic-cluster-ca",
  kubeEndpoint = `https://${gkeEndpoint}`,
  kubeCa = gkeCa,
  bucketOverrides = {}
} = {}) {
  return async (command, argumentsList) => {
    const success = (stdout = "") => Object.freeze({ stdout, stderr: "", exitCode: 0 });
    if (command === "git") return success();
    if (command === "gcloud" && argumentsList[0] === "config") return success(`${projectId}\n`);
    if (command === "gcloud" && argumentsList[0] === "projects") {
      return success(JSON.stringify({
        projectId,
        projectNumber: "123456789012",
        lifecycleState: "ACTIVE"
      }));
    }
    if (command === "gcloud" && argumentsList[0] === "container") {
      return success(JSON.stringify({
        name: baseEnvironment.GKE_CLUSTER_NAME,
        location: baseEnvironment.GKE_LOCATION,
        status: "RUNNING",
        controlPlaneEndpointsConfig: { dnsEndpointConfig: { endpoint: gkeEndpoint } },
        masterAuth: { clusterCaCertificate: gkeCa }
      }));
    }
    if (command === "gcloud" && argumentsList[0] === "sql") {
      return success(JSON.stringify({
        name: baseEnvironment.cloudSqlInstance,
        connectionName: baseEnvironment.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
        region: baseEnvironment.GCP_REGION,
        state: "RUNNABLE",
        databaseVersion: "POSTGRES_16"
      }));
    }
    if (command === "gcloud" && argumentsList[0] === "storage") {
      return success(JSON.stringify({
        name: operatorRelease.invitation_bucket,
        projectNumber: "123456789012",
        location: baseEnvironment.GCP_REGION,
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
          publicAccessPrevention: "enforced"
        },
        versioning: { enabled: false },
        softDeletePolicy: { retentionDurationSeconds: "0" },
        retentionPolicy: null,
        ...bucketOverrides
      }));
    }
    if (command === "gcloud" && argumentsList[0] === "artifacts") return success();
    if (command === "kubectl" && argumentsList[0] === "config" && argumentsList[1] === "current-context") {
      return success(
        `gke_${projectId}_${baseEnvironment.GKE_LOCATION}_${baseEnvironment.GKE_CLUSTER_NAME}\n`
      );
    }
    if (command === "kubectl" && argumentsList[0] === "config" && argumentsList[1] === "view") {
      return success(`${kubeEndpoint}\n${kubeCa}\nfalse\n`);
    }
    if (command === "kubectl" && argumentsList[0] === "get" && argumentsList[1] === "namespace") {
      return success(JSON.stringify({ metadata: { name: baseEnvironment.K8S_NAMESPACE } }));
    }
    if (command === "kubectl" && argumentsList.includes("--ignore-not-found")) return success();
    throw new Error(`Unerwarteter Preflight-Befehl: ${command} ${argumentsList.join(" ")}`);
  };
}

{
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      fingerprint: `sha256:${"a".repeat(64)}`
    },
    { commandRunner: createPreflightCommandRunner() }
  );
  assert.deepEqual(await runtime.preflight(), { ok: true });
}

{
  const calls = [];
  const runner = createPreflightCommandRunner();
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      fingerprint: `sha256:${"a".repeat(64)}`
    },
    {
      commandRunner: async (command, argumentsList, options) => {
        calls.push([command, ...argumentsList]);
        return runner(command, argumentsList, options);
      }
    }
  );
  assert.deepEqual(await runtime.preflight({ cleanupOnly: true }), { ok: true });
  assert.equal(calls.some((call) => call[0] === "git"), false);
  assert.equal(calls.some((call) => call[1] === "storage"), false);
  assert.equal(calls.some((call) => call[1] === "artifacts"), false);
}

for (const [change, pattern] of [
  [{ kubeEndpoint: "https://different-gke.example.invalid" }, /Endpoint oder Cluster-CA/u],
  [{ kubeCa: "different-cluster-ca" }, /Endpoint oder Cluster-CA/u],
  [{ bucketOverrides: { projectNumber: "999999999999" } }, /Einladungs-Bucket/u],
  [{
    bucketOverrides: {
      iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true },
        publicAccessPrevention: "inherited"
      }
    }
  }, /Einladungs-Bucket/u],
  [{ bucketOverrides: { versioning: { enabled: true } } }, /Einladungs-Bucket/u]
]) {
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      fingerprint: `sha256:${"a".repeat(64)}`
    },
    { commandRunner: createPreflightCommandRunner(change) }
  );
  await safeRejection(() => runtime.preflight(), pattern);
}

{
  const holderId = "12345678-1234-4123-8123-123456789abc";
  const lockFingerprint = `sha256:${"f".repeat(64)}`;
  const conditionTitle = "vk_online_12345678123441238123123456789abc";
  const existingLock = {
    metadata: {
      uid: "synthetic-cluster-lock-uid",
      creationTimestamp: "2026-08-04T08:10:00.000Z"
    },
    data: {
      operation: ONLINE_ONBOARDING_OPERATION,
      fingerprint: lockFingerprint,
      holder: holderId,
      iam_condition_title: conditionTitle,
      iam_condition_expiry: "2026-08-05T08:10:00.000Z"
    }
  };
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      fingerprint: lockFingerprint
    },
    {
      now: () => new Date("2026-08-05T08:00:00.000Z"),
      commandRunner: async (command, argumentsList) => {
        assert.equal(command, "kubectl");
        if (argumentsList.includes("create")) {
          throw new OnlineOnboardingError("synthetic lock exists", 1, "COMMAND_FAILED");
        }
        return Object.freeze({
          stdout: `${JSON.stringify(existingLock)}\n`,
          stderr: "",
          exitCode: 0
        });
      }
    }
  );
  const lock = await runtime.acquireLock({
    fingerprint: lockFingerprint,
    holderId,
    resume: true
  });
  assert.equal(lock.cleanupOnly, true);

  const expiredRuntime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      fingerprint: lockFingerprint
    },
    {
      now: () => new Date("2026-08-05T08:00:00.000Z"),
      commandRunner: async () => Object.freeze({
        stdout: `${JSON.stringify({
          ...existingLock,
          metadata: {
            ...existingLock.metadata,
            creationTimestamp: "2026-08-04T07:00:00.000Z"
          },
          data: {
            ...existingLock.data,
            iam_condition_expiry: "2026-08-05T07:00:00.000Z"
          }
        })}\n`,
        stderr: "",
        exitCode: 0
      })
    }
  );
  assert.equal((await expiredRuntime.acquireLock({
    fingerprint: lockFingerprint,
    holderId,
    resume: true,
    cleanupOnly: true
  })).cleanupOnly, true);

  const overlongRuntime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      fingerprint: lockFingerprint
    },
    {
      now: () => new Date("2026-08-05T08:00:00.000Z"),
      commandRunner: async () => Object.freeze({
        stdout: `${JSON.stringify({
          ...existingLock,
          data: {
            ...existingLock.data,
            iam_condition_expiry: "2026-08-05T08:10:00.001Z"
          }
        })}\n`,
        stderr: "",
        exitCode: 0
      })
    }
  );
  await safeRejection(
    () => overlongRuntime.acquireLock({
      fingerprint: lockFingerprint,
      holderId,
      resume: true,
      cleanupOnly: true
    }),
    /nicht sicher fortsetzbarer/u
  );
}

{
  const calls = [];
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      fingerprint: `sha256:${"7".repeat(64)}`
    },
    {
      commandRunner: async (command, argumentsList) => {
        calls.push([command, ...argumentsList]);
        if (
          command === "git"
          && argumentsList[0] === "cat-file"
          && argumentsList.at(-1).endsWith(":scripts/orchestrate_pre_gematik_online_onboarding.mjs")
        ) {
          throw new OnlineOnboardingError("Quelldatei fehlt im Commit.");
        }
        if (command === "git" && argumentsList[0] === "cat-file") {
          return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
        }
        throw new Error(`Unerwarteter Befehl: ${command}`);
      }
    }
  );
  await safeRejection(() => runtime.preflight(), /Quelldatei fehlt/u);
  assert.equal(
    calls.some((call) => call.includes(`${operatorRelease.source_commit}:scripts/orchestrate_pre_gematik_online_onboarding.mjs`)),
    true,
    "Der freigegebene Commit muss jede ausgefuehrte Orchestrator-Quelldatei enthalten."
  );
  assert.equal(calls.some((call) => call[0] === "gcloud"), false);
}

{
  const calls = [];
  const runtime = new CommandOnlineOnboardingRuntime(
    {
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      fingerprint: `sha256:${"8".repeat(64)}`
    },
    {
      commandRunner: async (command, argumentsList) => {
        calls.push([command, ...argumentsList]);
        if (command === "git" && argumentsList[0] === "cat-file") {
          return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
        }
        if (command === "git" && argumentsList[0] === "diff") {
          return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
        }
        if (command === "git" && argumentsList[0] === "status") {
          return Object.freeze({
            stdout: "?? scripts/orchestrate_pre_gematik_online_onboarding.mjs\n",
            stderr: "",
            exitCode: 0
          });
        }
        throw new Error(`Unerwarteter Befehl: ${command}`);
      }
    }
  );
  await safeRejection(() => runtime.preflight(), /Arbeitskopie-Aenderungen/u);
  assert.equal(calls.some((call) => call[0] === "gcloud"), false);
}

{
  const deletions = [];
  const evidenceFailure = new OnlineOnboardingError("Synthetische Evidenzuebernahme fehlgeschlagen.");
  const runtime = new CommandOnlineOnboardingRuntime({
    baseEnvironment,
    operatorRelease,
    repository: "/synthetic/repository",
    fingerprint: `sha256:${"9".repeat(64)}`
  });
  runtime.resourceMetadata = async (kind) => (
    kind === "job"
      ? { uid: "job-uid", holderId: "holder", fingerprint: runtime.fingerprint }
      : null
  );
  runtime.recoverOwnedJobEvidence = async () => {
    throw evidenceFailure;
  };
  runtime.deleteOwnedResource = async (kind, name) => {
    deletions.push(`${kind}/${name}`);
  };
  await assert.rejects(
    runtime.cleanupOwnedPhaseResources(),
    (error) => error === evidenceFailure
  );
  assert.deepEqual(deletions, [
    "job/vk-pre-gematik-migration-operator",
    "secret/vk-pre-gematik-migration-input",
    "secret/vk-pre-gematik-migration-environment"
  ]);
}

for (const [change, at, pattern] of [
  [{ image: operatorReleaseValue.image.replace(/@sha256:.+$/u, ":latest") }, now, /image/u],
  [{ image: operatorReleaseValue.image.replace(projectId, "different-project-123") }, now, /Zielprojekt/u],
  [{ invitation_bucket: "different-project-123-invitations" }, now, /Bucket/u],
  [{ approved_until: "2026-08-05T07:59:59.999Z" }, now, /nicht mehr freigegeben/u],
  [{ approved_until: "2026-09-30T16:00:00.001Z" }, now, /Pilotfrist/u]
]) {
  safeFailure(
    () => validateOperatorRelease({ ...operatorReleaseValue, ...change }, baseEnvironment, at),
    pattern
  );
}
assert.equal(
  validateOperatorRelease(
    { ...operatorReleaseValue, approved_until: "2026-08-05T07:59:59.999Z" },
    baseEnvironment,
    now,
    { allowExpired: true }
  ).approved_until,
  "2026-08-05T07:59:59.999Z"
);
safeFailure(
  () => validateOperatorRelease({ ...operatorReleaseValue, mutable_tag: "latest" }, baseEnvironment, now),
  /nicht freigegebene Felder/u
);

const account = validateIdentityPlatformAccountDocument({
  version: 1,
  project_id: projectId,
  uid: "online_guest_test_001",
  email: "guest@example.invalid",
  display_name: "Online Guest Test",
  email_ownership_verified: true,
  continue_url: EXPECTED_CONTINUE_URL
});
const guest = validateIdentityPlatformGuestAccessDocument({
  version: 1,
  project_id: projectId,
  uid: account.uid,
  email: account.email,
  profile_id: "12345678-1234-4123-8123-123456789abc",
  display_name: account.display_name,
  role: "viewer",
  scope_ref: "external-pilot:synthetic-online-test"
});
const binding = bindOnlineOnboardingDocuments(account, guest, baseEnvironment);
assert.match(binding.accountFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.match(binding.guestFingerprint, /^sha256:[a-f0-9]{64}$/u);

safeFailure(
  () => bindOnlineOnboardingDocuments(
    account,
    validateIdentityPlatformGuestAccessDocument({ ...guest, email: "other@example.invalid" }),
    baseEnvironment
  ),
  /nicht exakt gebunden/u
);

const fingerprint = onlineOnboardingFingerprint({
  accountFingerprint: binding.accountFingerprint,
  guestFingerprint: binding.guestFingerprint,
  baseEnvironment,
  operatorRelease
});
assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(
  fingerprint,
  onlineOnboardingFingerprint({
    operatorRelease: { ...operatorRelease },
    baseEnvironment: { ...baseEnvironment },
    guestFingerprint: binding.guestFingerprint,
    accountFingerprint: binding.accountFingerprint
  })
);
assert.notEqual(
  fingerprint,
  onlineOnboardingFingerprint({
    accountFingerprint: binding.accountFingerprint,
    guestFingerprint: `sha256:${"e".repeat(64)}`,
    baseEnvironment,
    operatorRelease
  })
);

const commonArguments = [
  "--account-input", "/protected/account.json",
  "--guest-access-input", "/protected/guest-access.json",
  "--operator-release", "/protected/operator-release.json",
  "--operator-environment", "/protected/operator.env",
  "--identity-readback-environment", "/protected/identity-readback.env",
  "--smtp-config", "/protected/smtp.json",
  "--run-directory", "/protected/run"
];
const previewOptions = parseOnlineOnboardingArguments(commonArguments);
assert.equal(previewOptions.apply, false);
assert.equal(previewOptions.resume, false);

const applyOptions = parseOnlineOnboardingArguments([
  ...commonArguments,
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", projectId,
  "--confirm-operation", ONLINE_ONBOARDING_OPERATION,
  "--confirm-fingerprint", fingerprint
]);
assert.equal(applyOptions.apply, true);
assert.equal(applyOptions.confirmFingerprint, fingerprint);
assert.equal(
  parseOnlineOnboardingArguments([...commonArguments, "--apply", "--resume"]).resume,
  true
);
safeFailure(
  () => parseOnlineOnboardingArguments(["--unknown"]),
  /Unbekannte oder unvollstaendige/u
);
safeFailure(
  () => parseOnlineOnboardingArguments(["--account-input"]),
  /benoetigt einen Wert/u
);

const emptyStateFingerprint = `sha256:${"1".repeat(64)}`;
const completeStateFingerprint = `sha256:${"2".repeat(64)}`;
const invitationFingerprint = `sha256:${"3".repeat(64)}`;
const renderingFingerprint = `sha256:${"4".repeat(64)}`;
const mailFingerprint = `sha256:${"5".repeat(64)}`;
const gateFingerprint = `sha256:${"6".repeat(64)}`;

function safeSummary(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
}

function accountSummary({ apply, recovery = false } = {}) {
  return safeSummary({
    mode: apply ? "APPLY" : "PREVIEW",
    operation: recovery ? "link-recovery" : "account-create-only",
    account_count: 1,
    target_state: recovery ? "exact-existing" : "absent",
    set_password_link_file_created: apply,
    input_fingerprint: binding.accountFingerprint
  });
}

const onlineGate = Object.freeze({
  gate_policy: "online-guest-onboarding",
  gate_fingerprint: gateFingerprint,
  automated_backups: true,
  point_in_time_recovery: true,
  transaction_log_retention_days: 7,
  retained_backups: 14,
  retention_unit: "COUNT",
  latest_successful_automated_backup_id: "1785808800000",
  latest_successful_automated_backup_end_time: "2026-08-04T03:04:28.112Z"
});

function guestReport(state) {
  const states = {
    initial: {
      mode: "PREVIEW",
      result: "create_profile_and_binding",
      profile_count: 0,
      binding_count: 0,
      active_binding_count: 0,
      profile_binding_complete: false,
      database_transaction_committed: false,
      current_state_fingerprint: emptyStateFingerprint,
      expected_state_fingerprint: completeStateFingerprint
    },
    applied: {
      mode: "APPLY",
      result: "create_profile_and_binding_completed",
      profile_count: 1,
      binding_count: 1,
      active_binding_count: 1,
      profile_binding_complete: true,
      database_transaction_committed: true,
      current_state_fingerprint: completeStateFingerprint,
      expected_state_fingerprint: completeStateFingerprint
    },
    final: {
      mode: "PREVIEW",
      result: "unchanged",
      profile_count: 1,
      binding_count: 1,
      active_binding_count: 1,
      profile_binding_complete: true,
      database_transaction_committed: false,
      current_state_fingerprint: completeStateFingerprint,
      expected_state_fingerprint: completeStateFingerprint
    }
  };
  return {
    schema_version: 1,
    operation: GUEST_ACCESS_CREATE_PROFILE_OPERATION,
    ...states[state],
    identity_platform_account_verified: true,
    provider_verified: "password",
    subject_namespace_verified: true,
    access_scope_verified: "test_only",
    input_fingerprint: binding.guestFingerprint,
    online_onboarding_gate: { ...onlineGate }
  };
}

function invitationSummary(apply) {
  return safeSummary({
    schema_version: 1,
    operation: PASSWORD_INVITATION_OPERATION,
    mode: apply ? "APPLY" : "PREVIEW",
    prepared_object_created: apply,
    link_written: apply,
    input_fingerprint: invitationFingerprint
  });
}

function renderingSummary(apply) {
  return safeSummary({
    schema_version: 1,
    operation: WELCOME_EMAIL_OPERATION,
    mode: apply ? "APPLY" : "PREVIEW",
    mail_bundle_created: apply,
    input_fingerprint: renderingFingerprint
  });
}

function senderPreviewSummary() {
  return safeSummary({
    schema_version: 1,
    operation: WELCOME_EMAIL_SEND_OPERATION,
    mode: "PREVIEW",
    smtp_accepted: false,
    invitation_activated: false,
    mail_fingerprint: mailFingerprint
  });
}

class MemoryJournal {
  constructor(initial = []) {
    this.records = initial.map(({ event, details = {} }) => ({ event, details: { ...details } }));
    this.executionLockCalls = [];
  }

  has(event) {
    return this.records.some((record) => record.event === event);
  }

  last(event) {
    return [...this.records].reverse().find((record) => record.event === event) || null;
  }

  holderId() {
    return "synthetic-journal-holder";
  }

  async append(event, details = {}) {
    const record = { event, details: { ...details } };
    this.records.push(record);
    return record;
  }

  async acquireExecutionLock() {
    this.executionLockCalls.push("acquire");
  }

  async releaseExecutionLock() {
    this.executionLockCalls.push("release");
  }
}

function createRuntime(overrides = {}) {
  const calls = [];
  const invoke = async (method, argumentsValue, defaultValue) => {
    calls.push({ method, arguments: argumentsValue });
    if (Object.hasOwn(overrides, method)) {
      return overrides[method](argumentsValue);
    }
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  };
  const runtime = {
    preflight: (value) => invoke("preflight", value),
    acquireLock: (value) => invoke("acquireLock", value, { lockId: "synthetic-lock-001" }),
    releaseLock: (value) => invoke("releaseLock", value),
    previewAccount: () => invoke("previewAccount", {}, accountSummary({ apply: false })),
    applyAccount: () => invoke("applyAccount", {}, accountSummary({ apply: true })),
    resolveUnknownAccount: () => invoke(
      "resolveUnknownAccount",
      {},
      { state: "present", summary: accountSummary({ apply: false, recovery: true }) }
    ),
    prepareGuestOperator: () => invoke("prepareGuestOperator", {}),
    previewGuest: (value) => invoke(
      "previewGuest",
      value,
      { report: guestReport(value.purpose === "initial" ? "initial" : "final") }
    ),
    applyGuest: (value) => invoke("applyGuest", value, { report: guestReport("applied") }),
    cleanupGuestOperator: () => invoke("cleanupGuestOperator", {}),
    prepareInvitation: (value) => invoke(
      "prepareInvitation",
      value,
      { summary: invitationSummary(value.apply) }
    ),
    renderMail: (value) => invoke(
      "renderMail",
      value,
      { summary: renderingSummary(value.apply) }
    ),
    previewMailSend: () => invoke(
      "previewMailSend",
      {},
      { summary: senderPreviewSummary() }
    ),
    sendMail: (value) => invoke("sendMail", value, { accepted: true })
  };
  return { runtime, calls };
}

function executionInput(overrides = {}) {
  return {
    apply: true,
    resume: false,
    fingerprint,
    projectId,
    accountFingerprint: binding.accountFingerprint,
    guestFingerprint: binding.guestFingerprint,
    invitationBucket: operatorRelease.invitation_bucket,
    runDirectory: "/protected/synthetic-run",
    operatorReleaseExpired: false,
    ...overrides
  };
}

{
  const logs = [];
  const planned = await executeOnlineOnboardingPreparation(
    executionInput({ apply: false }),
    { log: (value) => logs.push(value) }
  );
  assert.deepEqual(
    { ready: planned.ready, mailSent: planned.mailSent },
    { ready: false, mailSent: false }
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /mode=PREVIEW/u);
  assert.match(logs[0], /state=PLANNED/u);
  assert.match(logs[0], /mail_sent=false/u);
}

await safeRejection(
  () => executeOnlineOnboardingPreparation(
    executionInput({ apply: false, resume: true }),
    { log: () => {} }
  ),
  /Resume/u
);

await safeRejection(
  () => executeOnlineOnboardingPreparation(
    executionInput({ operatorReleaseExpired: true }),
    { runtime: createRuntime().runtime, journal: new MemoryJournal(), log: () => {} }
  ),
  /abgelaufener Operator-Release/u
);

await safeRejection(
  () => executeOnlineOnboardingPreparation(executionInput(), { runtime: {}, journal: new MemoryJournal() }),
  /Runtimevertrag/u
);

const happyJournal = new MemoryJournal();
const happyFixture = createRuntime();
const happyLogs = [];
const happy = await executeOnlineOnboardingPreparation(executionInput(), {
  runtime: happyFixture.runtime,
  journal: happyJournal,
  log: (value) => happyLogs.push(value)
});
assert.equal(happy.ready, true);
assert.equal(happy.mailSent, false);
assert.equal(happy.mailFingerprint, mailFingerprint);
assert.match(happy.summary, /state=READY_TO_SEND/u);
assert.match(happy.summary, /mail_sent=false/u);
assert.deepEqual(
  happyFixture.calls.map((call) => call.method),
  [
    "preflight",
    "acquireLock",
    "previewAccount",
    "previewAccount",
    "applyAccount",
    "prepareGuestOperator",
    "previewGuest",
    "applyGuest",
    "previewGuest",
    "cleanupGuestOperator",
    "prepareInvitation",
    "prepareInvitation",
    "renderMail",
    "renderMail",
    "previewMailSend",
    "releaseLock"
  ]
);
assert.equal(
  happyFixture.calls.filter((call) => call.method === "previewAccount").length,
  2
);
assert.equal(
  happyFixture.calls.filter((call) => call.method === "applyAccount").length,
  1
);
assert.equal(
  happyFixture.calls.filter((call) => call.method === "applyGuest").length,
  1
);
assert.deepEqual(
  happyFixture.calls
    .filter((call) => call.method === "previewGuest")
    .map((call) => call.arguments.purpose),
  ["initial", "post-apply"]
);
assert.equal(happyFixture.calls.some((call) => call.method === "sendMail"), false);
assert.deepEqual(happyJournal.executionLockCalls, ["acquire", "release"]);
for (const event of [
  "ACCOUNT_APPLIED",
  "GUEST_APPLIED",
  "GUEST_POST_PREVIEW_CONFIRMED",
  "GUEST_OPERATOR_CLEANED",
  "INVITATION_PREPARED",
  "MAIL_RENDERED",
  "MAIL_SEND_PREVIEW_CONFIRMED",
  "READY_TO_SEND"
]) {
  assert.equal(happyJournal.has(event), true, `Journal-Ereignis fehlt: ${event}`);
}

{
  const accountRecoveryJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLY_INTENT", details: { input_fingerprint: binding.accountFingerprint } }
  ]);
  const accountRecoveryFixture = createRuntime();
  const recovered = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: accountRecoveryFixture.runtime, journal: accountRecoveryJournal, log: () => {} }
  );
  assert.equal(recovered.ready, true);
  assert.equal(
    accountRecoveryFixture.calls.filter((call) => call.method === "resolveUnknownAccount").length,
    1
  );
  assert.equal(accountRecoveryFixture.calls.some((call) => call.method === "applyAccount"), false);
  assert.equal(accountRecoveryJournal.has("ACCOUNT_APPLY_RECOVERED"), true);
}
const serializedHappyJournal = JSON.stringify(happyJournal.records);
for (const protectedValue of [
  account.email,
  account.uid,
  account.display_name,
  guest.profile_id,
  guest.scope_ref,
  "synthetic-smtp-password",
  "https://versorgungs-kompass.de/konto/passwort-festlegen#einladung="
]) {
  assert.equal(
    serializedHappyJournal.includes(protectedValue),
    false,
    "Das Journal enthaelt personenbezogene oder geheime Werte."
  );
  assert.equal(happyLogs.some((line) => line.includes(protectedValue)), false);
}

{
  const resumedJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED", details: { input_fingerprint: binding.accountFingerprint } },
    {
      event: "GUEST_APPLY_INTENT",
      details: {
        input_fingerprint: binding.guestFingerprint,
        current_state_fingerprint: emptyStateFingerprint,
        expected_state_fingerprint: completeStateFingerprint
      }
    }
  ]);
  const resumedFixture = createRuntime({
    previewGuest: ({ purpose }) => {
      assert.equal(purpose, "unknown-apply-readback");
      return { report: guestReport("final") };
    }
  });
  const resumed = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: resumedFixture.runtime, journal: resumedJournal, log: () => {} }
  );
  assert.equal(resumed.ready, true);
  assert.equal(resumedFixture.calls.some((call) => call.method === "applyGuest"), false);
  assert.equal(resumedFixture.calls.some((call) => call.method === "previewAccount"), false);
  assert.equal(resumedFixture.calls.some((call) => call.method === "applyAccount"), false);
  assert.equal(
    resumedFixture.calls.filter((call) => call.method === "previewGuest").length,
    1
  );
  assert.equal(resumedJournal.has("GUEST_APPLY_RECOVERED"), true);
  assert.equal(resumedJournal.has("GUEST_POST_PREVIEW_CONFIRMED"), true);
  assert.equal(resumedJournal.has("GUEST_OPERATOR_CLEANED"), true);
}

{
  const staleCleanupJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_OPERATOR_READY" },
    { event: "GUEST_APPLY_INTENT" },
    { event: "GUEST_OPERATOR_CLEANED" }
  ]);
  const failedCleanup = new Error("synthetic recovered-attempt cleanup failure");
  const firstResume = createRuntime({
    previewGuest: ({ purpose }) => {
      assert.equal(purpose, "unknown-apply-readback");
      return { report: guestReport("final") };
    },
    cleanupGuestOperator: async () => {
      throw failedCleanup;
    }
  });
  await assert.rejects(
    executeOnlineOnboardingPreparation(
      executionInput({ resume: true }),
      { runtime: firstResume.runtime, journal: staleCleanupJournal, log: () => {} }
    ),
    (error) => error === failedCleanup
  );
  assert.equal(firstResume.calls.some((call) => call.method === "prepareInvitation"), false);

  const secondResume = createRuntime();
  const completed = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: secondResume.runtime, journal: staleCleanupJournal, log: () => {} }
  );
  assert.equal(completed.ready, true);
  const secondMethods = secondResume.calls.map((call) => call.method);
  assert.equal(secondMethods.includes("prepareGuestOperator"), false);
  assert.equal(secondMethods.includes("previewGuest"), false);
  assert.ok(secondMethods.indexOf("cleanupGuestOperator") < secondMethods.indexOf("prepareInvitation"));
}

{
  const failure = new Error("synthetic unknown guest commit outcome");
  const failedJournal = new MemoryJournal();
  const failedFixture = createRuntime({
    applyGuest: async () => {
      throw failure;
    }
  });
  await assert.rejects(
    executeOnlineOnboardingPreparation(executionInput(), {
      runtime: failedFixture.runtime,
      journal: failedJournal,
      log: () => {}
    }),
    (error) => error === failure
  );
  const failedMethods = failedFixture.calls.map((call) => call.method);
  assert.ok(failedMethods.indexOf("cleanupGuestOperator") > failedMethods.indexOf("applyGuest"));
  assert.ok(failedMethods.indexOf("releaseLock") > failedMethods.indexOf("cleanupGuestOperator"));
  assert.equal(failedMethods.includes("prepareInvitation"), false);
  assert.equal(failedMethods.includes("renderMail"), false);
  assert.equal(failedMethods.includes("previewMailSend"), false);
  assert.equal(failedMethods.includes("sendMail"), false);
  assert.equal(failedJournal.has("GUEST_APPLY_INTENT"), true);
  assert.equal(failedJournal.has("GUEST_APPLIED"), false);
  assert.equal(failedJournal.has("GUEST_OPERATOR_CLEANED"), true);
  assert.equal(failedJournal.has("READY_TO_SEND"), false);
}

{
  const cleanupFailure = new Error("synthetic cleanup failure");
  const cleanupJournal = new MemoryJournal();
  const cleanupFixture = createRuntime({
    cleanupGuestOperator: async () => {
      throw cleanupFailure;
    }
  });
  await assert.rejects(
    executeOnlineOnboardingPreparation(executionInput(), {
      runtime: cleanupFixture.runtime,
      journal: cleanupJournal,
      log: () => {}
    }),
    (error) => error === cleanupFailure
  );
  assert.equal(
    cleanupFixture.calls.some((call) => call.method === "prepareInvitation"),
    false
  );
  assert.equal(cleanupFixture.calls.some((call) => call.method === "previewMailSend"), false);
  assert.equal(cleanupFixture.calls.some((call) => call.method === "sendMail"), false);
  assert.equal(cleanupJournal.has("GUEST_OPERATOR_CLEANED"), false);
  assert.equal(cleanupJournal.has("READY_TO_SEND"), false);
}

{
  const cleanupResumeJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_POST_PREVIEW_CONFIRMED" }
  ]);
  const cleanupResumeFixture = createRuntime();
  const resumed = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: cleanupResumeFixture.runtime, journal: cleanupResumeJournal, log: () => {} }
  );
  assert.equal(resumed.ready, true);
  assert.deepEqual(
    cleanupResumeFixture.calls
      .filter((call) => ["prepareGuestOperator", "previewGuest", "applyGuest", "cleanupGuestOperator"].includes(call.method))
      .map((call) => call.method),
    ["cleanupGuestOperator"]
  );
  assert.equal(cleanupResumeJournal.has("GUEST_OPERATOR_CLEANED"), true);
}

{
  const cleanupOnlyJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_OPERATOR_PREPARE_INTENT", details: { phase: "guest" } }
  ]);
  const cleanupOnlyFixture = createRuntime({
    acquireLock: () => ({
      lockId: "synthetic-lock-cleanup-only",
      cleanupOnly: true
    })
  });
  const cleaned = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true, operatorReleaseExpired: true }),
    { runtime: cleanupOnlyFixture.runtime, journal: cleanupOnlyJournal, log: () => {} }
  );
  assert.equal(cleaned.ready, false);
  assert.equal(cleaned.mailSent, false);
  assert.equal(cleaned.cleanupOnly, true);
  assert.match(cleaned.summary, /state=CLEANUP_COMPLETED_RESUME_REQUIRED/u);
  assert.deepEqual(
    cleanupOnlyFixture.calls.map((call) => call.method),
    ["preflight", "acquireLock", "cleanupGuestOperator", "releaseLock"]
  );
  assert.deepEqual(cleanupOnlyFixture.calls[0].arguments, {
    fingerprint,
    cleanupOnly: true
  });
  assert.equal(cleanupOnlyJournal.has("RECOVERY_CLEANUP_COMPLETED"), true);
  assert.equal(cleanupOnlyJournal.has("READY_TO_SEND"), false);
}

{
  const shortIamJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_OPERATOR_PREPARE_INTENT", details: { phase: "guest" } }
  ]);
  const shortIamFixture = createRuntime({
    preflight: ({ cleanupOnly }) => {
      if (!cleanupOnly) {
        throw new Error("Ein Forward-Preflight darf vor der Restbereinigung nicht laufen.");
      }
    },
    acquireLock: () => ({
      lockId: "synthetic-lock-short-iam",
      cleanupOnly: true
    })
  });
  const cleaned = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: shortIamFixture.runtime, journal: shortIamJournal, log: () => {} }
  );
  assert.equal(cleaned.cleanupOnly, true);
  assert.deepEqual(
    shortIamFixture.calls.map((call) => call.method),
    ["preflight", "acquireLock", "cleanupGuestOperator", "releaseLock"]
  );
  assert.equal(shortIamJournal.has("RECOVERY_CLEANUP_COMPLETED"), true);
}

{
  const renderingResumeJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_POST_PREVIEW_CONFIRMED" },
    { event: "GUEST_OPERATOR_CLEANED" },
    { event: "INVITATION_PREPARED" },
    { event: "MAIL_RENDER_APPLY_INTENT" }
  ]);
  const renderingResumeFixture = createRuntime();
  const resumed = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: renderingResumeFixture.runtime, journal: renderingResumeJournal, log: () => {} }
  );
  assert.equal(resumed.ready, true);
  assert.equal(renderingResumeFixture.calls.some((call) => call.method === "renderMail"), false);
  assert.equal(
    renderingResumeFixture.calls.filter((call) => call.method === "previewMailSend").length,
    1
  );
  assert.equal(renderingResumeJournal.has("MAIL_RENDERED"), true);
}

{
  const changedPreviewJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_POST_PREVIEW_CONFIRMED" },
    { event: "GUEST_OPERATOR_CLEANED" },
    { event: "INVITATION_PREPARED" },
    { event: "MAIL_RENDERED" },
    {
      event: "MAIL_SEND_PREVIEW_CONFIRMED",
      details: { mail_fingerprint: mailFingerprint }
    }
  ]);
  const changedPreviewFixture = createRuntime({
    previewMailSend: () => ({
      summary: safeSummary({
        schema_version: 1,
        operation: WELCOME_EMAIL_SEND_OPERATION,
        mode: "PREVIEW",
        smtp_accepted: false,
        invitation_activated: false,
        mail_fingerprint: `sha256:${"a".repeat(64)}`
      })
    })
  });
  await safeRejection(
    () => executeOnlineOnboardingPreparation(
      executionInput({ resume: true }),
      { runtime: changedPreviewFixture.runtime, journal: changedPreviewJournal, log: () => {} }
    ),
    /Versandpreview weicht/u
  );
  assert.equal(changedPreviewJournal.has("READY_TO_SEND"), false);
}

{
  const unknownInvitationJournal = new MemoryJournal([
    { event: "ACCOUNT_APPLIED" },
    { event: "GUEST_OPERATOR_READY" },
    { event: "GUEST_POST_PREVIEW_CONFIRMED" },
    { event: "GUEST_OPERATOR_CLEANED" },
    { event: "INVITATION_APPLY_INTENT", details: { input_fingerprint: invitationFingerprint } }
  ]);
  const unknownInvitationFixture = createRuntime();
  await safeRejection(
    () => executeOnlineOnboardingPreparation(
      executionInput({ resume: true }),
      { runtime: unknownInvitationFixture.runtime, journal: unknownInvitationJournal, log: () => {} }
    ),
    /Einladungs-Apply-Ausgang ist unbekannt/u
  );
  const methods = unknownInvitationFixture.calls.map((call) => call.method);
  assert.equal(methods.includes("prepareInvitation"), false);
  assert.equal(methods.includes("renderMail"), false);
  assert.equal(methods.includes("previewMailSend"), false);
  assert.equal(methods.includes("sendMail"), false);
  assert.equal(unknownInvitationJournal.has("READY_TO_SEND"), false);
}

{
  const completedJournal = new MemoryJournal([
    {
      event: "READY_TO_SEND",
      details: { state: ONLINE_ONBOARDING_READY_STATE, mail_fingerprint: mailFingerprint }
    }
  ]);
  const completedFixture = createRuntime();
  const completed = await executeOnlineOnboardingPreparation(
    executionInput({ resume: true }),
    { runtime: completedFixture.runtime, journal: completedJournal, log: () => {} }
  );
  assert.equal(completed.ready, true);
  assert.equal(completed.mailSent, false);
  assert.equal(completed.mailFingerprint, mailFingerprint);
  assert.deepEqual(
    completedFixture.calls.map((call) => call.method),
    ["preflight", "acquireLock", "preflight", "previewMailSend", "releaseLock"]
  );
  assert.equal(
    completedFixture.calls.filter((call) => call.method === "previewMailSend").length,
    1
  );
  assert.deepEqual(
    completedFixture.calls
      .filter((call) => call.method === "preflight")
      .map((call) => call.arguments.cleanupOnly),
    [true, false]
  );
  assert.equal(completedFixture.calls.some((call) => call.method === "sendMail"), false);
}

{
  const completedJournal = new MemoryJournal([
    {
      event: "READY_TO_SEND",
      details: { state: ONLINE_ONBOARDING_READY_STATE, mail_fingerprint: mailFingerprint }
    }
  ]);
  const changedFixture = createRuntime({
    previewMailSend: () => ({
      summary: safeSummary({
        schema_version: 1,
        operation: WELCOME_EMAIL_SEND_OPERATION,
        mode: "PREVIEW",
        smtp_accepted: false,
        invitation_activated: false,
        mail_fingerprint: `sha256:${"a".repeat(64)}`
      })
    })
  });
  await safeRejection(
    () => executeOnlineOnboardingPreparation(
      executionInput({ resume: true }),
      { runtime: changedFixture.runtime, journal: completedJournal, log: () => {} }
    ),
    /Mailartefakte weichen/u
  );
  assert.equal(changedFixture.calls.some((call) => call.method === "sendMail"), false);
}

{
  const invalidReadyJournal = new MemoryJournal([
    {
      event: "READY_TO_SEND",
      details: { state: "PLANNED", mail_fingerprint: mailFingerprint }
    }
  ]);
  const invalidReadyFixture = createRuntime();
  await safeRejection(
    () => executeOnlineOnboardingPreparation(
      executionInput({ resume: true }),
      { runtime: invalidReadyFixture.runtime, journal: invalidReadyJournal, log: () => {} }
    ),
    /READY_TO_SEND/u
  );
  assert.deepEqual(
    invalidReadyFixture.calls.map((call) => call.method),
    ["preflight"]
  );
}

{
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-access-"));
  await fs.chmod(runDirectory, 0o700);
  const helperFailure = new OnlineOnboardingError("Synthetischer Helper-Abbruch.");
  try {
    const runtime = new CommandOnlineOnboardingRuntime({
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      runDirectory,
      fingerprint
    });
    runtime.nodeScript = async (_script, argumentsList) => {
      const outputDirectory = argumentsList[argumentsList.indexOf("--output-directory") + 1];
      await fs.writeFile(
        path.join(outputDirectory, "test-access-operator-create-user-flags.json"),
        "{}\n",
        { mode: 0o600 }
      );
      throw helperFailure;
    };
    await assert.rejects(runtime.createAccessOperator(), (error) => error === helperFailure);
    assert.deepEqual(await fs.readdir(runDirectory), []);

    const stalePending = path.join(
      runDirectory,
      "access-operator-001.pending-12345678-1234-4123-8123-123456789abc"
    );
    await fs.mkdir(stalePending, { mode: 0o700 });
    await fs.writeFile(path.join(stalePending, "partial-secret"), "partial\n", { mode: 0o600 });
    const cloudCalls = [];
    runtime.gcloud = async (argumentsList) => {
      cloudCalls.push(argumentsList);
      throw new Error("Ein unveroeffentlichtes Pending-Verzeichnis darf keinen Cloud-Aufruf ausloesen.");
    };
    runtime.resourceMetadata = async () => null;
    assert.deepEqual(await runtime.cleanupGuestOperator(), { complete: true });
    assert.deepEqual(await fs.readdir(runDirectory), []);
    assert.deepEqual(cloudCalls, []);

    runtime.iamConditionTitle = "vk_online_exact";
    runtime.iamConditionExpiry = "2026-08-06T08:00:00.000Z";
    assert.equal(runtime.conditionMatchesRun({
      condition: {
        title: runtime.iamConditionTitle,
        expression: `request.time < timestamp('${runtime.iamConditionExpiry}')`
      }
    }), true);
    assert.equal(runtime.conditionMatchesRun({
      condition: {
        title: runtime.iamConditionTitle,
        expression:
          `request.time < timestamp('${runtime.iamConditionExpiry}') || resource.name.startsWith('projects/')`
      }
    }), false);
  } finally {
    await fs.rm(runDirectory, { recursive: true, force: true });
  }
}

{
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-sql-op-"));
  await fs.chmod(runDirectory, 0o700);
  const login = "vk_access_operator_20260805_aaaaaaaaaa";
  let userPresent = false;
  const cloudCalls = [];
  try {
    const runtime = new CommandOnlineOnboardingRuntime({
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      runDirectory,
      fingerprint
    });
    runtime.nodeScript = async (_script, argumentsList) => {
      const outputDirectory = argumentsList[argumentsList.indexOf("--output-directory") + 1];
      await fs.writeFile(
        path.join(outputDirectory, "test-access-operator-create-user-flags.json"),
        "{}\n",
        { mode: 0o600 }
      );
      await fs.writeFile(
        path.join(outputDirectory, "test-access-operator-name.txt"),
        `${login}\n`,
        { mode: 0o600 }
      );
    };
    runtime.listCloudSqlUser = async () => userPresent
      ? [{ name: login, type: "BUILT_IN", databaseRoles: ["vk_access_enrollment_admin"] }]
      : [];
    runtime.gcloud = async (argumentsList) => {
      cloudCalls.push(argumentsList);
      if (argumentsList[1] === "users" && argumentsList[2] === "create") {
        return Object.freeze({
          stdout: `${JSON.stringify({
            name: "operation-create-user-001",
            operationType: "CREATE_USER",
            targetProject: projectId,
            targetId: baseEnvironment.cloudSqlInstance,
            status: "PENDING"
          })}\n`,
          stderr: "",
          exitCode: 0
        });
      }
      if (argumentsList[1] === "operations" && argumentsList[2] === "wait") {
        return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
      }
      if (argumentsList[1] === "operations" && argumentsList[2] === "describe") {
        userPresent = true;
        return Object.freeze({
          stdout: `${JSON.stringify({
            name: "operation-create-user-001",
            operationType: "CREATE_USER",
            targetProject: projectId,
            targetId: baseEnvironment.cloudSqlInstance,
            status: "DONE"
          })}\n`,
          stderr: "",
          exitCode: 0
        });
      }
      if (argumentsList[1] === "users" && argumentsList[2] === "assign-roles") {
        return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
      }
      if (argumentsList[1] === "users" && argumentsList[2] === "delete") {
        userPresent = false;
        return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
      }
      throw new Error(`Unerwarteter Cloud-SQL-Befehl: ${argumentsList.join(" ")}`);
    };
    const access = await runtime.createAccessOperator();
    assert.equal(access.login, login);
    assert.equal(userPresent, true);
    safeFailure(
      () => runtime.validateCloudSqlCreateOperation({
        name: "operation-create-user-foreign",
        operationType: "CREATE_USER",
        targetProject: "different-project-123",
        targetId: baseEnvironment.cloudSqlInstance,
        status: "DONE"
      }),
      /nicht exakt zielgebunden/u
    );
    assert.equal(
      cloudCalls.some((call) => call.includes("--async") && call.includes("--format=json")),
      true
    );
    assert.equal(
      cloudCalls.some((call) => call[1] === "users" && call[2] === "assign-roles"),
      false,
      "Die freigegebene Datenbankrolle muss atomar mit CREATE_USER gesetzt werden."
    );
    await runtime.deleteAccessOperatorDirectory(access.directory);
    assert.equal(userPresent, false);
    assert.deepEqual(await fs.readdir(runDirectory), []);
  } finally {
    await fs.rm(runDirectory, { recursive: true, force: true });
  }
}

{
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-sql-unknown-"));
  await fs.chmod(runDirectory, 0o700);
  const login = "vk_access_operator_20260805_bbbbbbbbbb";
  let userPresent = false;
  try {
    const runtime = new CommandOnlineOnboardingRuntime({
      baseEnvironment,
      operatorRelease,
      repository: "/synthetic/repository",
      runDirectory,
      fingerprint
    });
    runtime.nodeScript = async (_script, argumentsList) => {
      const outputDirectory = argumentsList[argumentsList.indexOf("--output-directory") + 1];
      await fs.writeFile(
        path.join(outputDirectory, "test-access-operator-create-user-flags.json"),
        "{}\n",
        { mode: 0o600 }
      );
      await fs.writeFile(
        path.join(outputDirectory, "test-access-operator-name.txt"),
        `${login}\n`,
        { mode: 0o600 }
      );
    };
    runtime.listCloudSqlUser = async () => userPresent
      ? [{ name: login, type: "BUILT_IN", databaseRoles: ["vk_access_enrollment_admin"] }]
      : [];
    runtime.gcloud = async (argumentsList) => {
      if (argumentsList[1] === "users" && argumentsList[2] === "create") {
        throw new OnlineOnboardingError("synthetic unknown create", 1, "COMMAND_FAILED");
      }
      if (argumentsList[1] === "users" && argumentsList[2] === "delete") {
        userPresent = false;
        return Object.freeze({ stdout: "", stderr: "", exitCode: 0 });
      }
      throw new Error(`Unerwarteter Cloud-SQL-Befehl: ${argumentsList.join(" ")}`);
    };
    await safeRejection(() => runtime.createAccessOperator(), /unknown create/u);
    const [directory] = await runtime.listAccessOperatorDirectories();
    assert.ok(directory);
    await safeRejection(
      () => runtime.deleteAccessOperatorDirectory(directory),
      /Create-Ausgang ist unbekannt/u
    );
    assert.deepEqual(await runtime.listAccessOperatorDirectories(), [directory]);

    userPresent = true;
    await runtime.deleteAccessOperatorDirectory(directory);
    assert.deepEqual(await fs.readdir(runDirectory), []);
  } finally {
    await fs.rm(runDirectory, { recursive: true, force: true });
  }
}

{
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-journal-"));
  await fs.chmod(runDirectory, 0o700);
  try {
    const journal = await AppendOnlyOnlineOnboardingJournal.open({
      runDirectory,
      fingerprint,
      resume: false,
      now: () => new Date("2026-08-05T08:00:00.000Z")
    });
    await journal.append("ACCOUNT_PREVIEW_CONFIRMED", {
      input_fingerprint: binding.accountFingerprint
    });
    const journalDirectory = path.join(runDirectory, "online-onboarding-journal");
    const files = (await fs.readdir(journalDirectory)).sort();
    assert.deepEqual(files, [
      "000001-STARTED.json",
      "000002-ACCOUNT_PREVIEW_CONFIRMED.json"
    ]);
    for (const file of files) {
      const metadata = await fs.stat(path.join(journalDirectory, file));
      assert.equal(metadata.mode & 0o777, 0o600);
      const contents = await fs.readFile(path.join(journalDirectory, file), "utf8");
      assert.equal(contents.includes(account.email), false);
      assert.equal(contents.includes(account.uid), false);
    }
    const interruptedCandidate = path.join(
      journalDirectory,
      ".atomic-12345678-1234-4123-8123-123456789abc"
    );
    await fs.writeFile(interruptedCandidate, "{\"partial\":", { mode: 0o600 });
    const resumed = await AppendOnlyOnlineOnboardingJournal.open({
      runDirectory,
      fingerprint,
      resume: true,
      now: () => new Date("2026-08-05T08:01:00.000Z")
    });
    assert.equal(resumed.has("ACCOUNT_PREVIEW_CONFIRMED"), true);
    await resumed.acquireExecutionLock();
    await assert.rejects(fs.lstat(interruptedCandidate), (error) => error?.code === "ENOENT");
    const activeLockContents = await fs.readFile(
      path.join(journalDirectory, "active.lock"),
      "utf8"
    );
    assert.equal(activeLockContents, `${process.pid}\n${journal.holderId()}\n`);
    await resumed.releaseExecutionLock();

    const competingResume = await AppendOnlyOnlineOnboardingJournal.open({
      runDirectory,
      fingerprint,
      resume: true,
      now: () => new Date("2026-08-05T08:01:00.000Z")
    });

    await fs.writeFile(
      path.join(journalDirectory, "active.lock"),
      `2147483647\n${journal.holderId()}\n`,
      { mode: 0o600 }
    );
    await fs.writeFile(
      path.join(journalDirectory, "active.takeover"),
      `2147483647\n${journal.holderId()}\n`,
      { mode: 0o600 }
    );
    await competingResume.acquireExecutionLock();
    await assert.rejects(
      fs.lstat(path.join(journalDirectory, "active.takeover")),
      (error) => error?.code === "ENOENT"
    );
    await competingResume.releaseExecutionLock();

    await fs.writeFile(
      path.join(journalDirectory, "active.lock"),
      `2147483647\n${journal.holderId()}\n`,
      { mode: 0o600 }
    );
    const takeoverResults = await Promise.allSettled([
      resumed.acquireExecutionLock(),
      competingResume.acquireExecutionLock()
    ]);
    assert.equal(
      takeoverResults.filter((result) => result.status === "fulfilled").length,
      1,
      "Genau ein paralleler Resume darf den stale lokalen Lock uebernehmen."
    );
    assert.equal(
      takeoverResults.filter((result) => result.status === "rejected").length,
      1
    );
    const winner = takeoverResults.findIndex((result) => result.status === "fulfilled");
    await [resumed, competingResume][winner].releaseExecutionLock();

    await fs.writeFile(
      path.join(journalDirectory, "active.lock"),
      `2147483647\n${journal.holderId()}\n`,
      { mode: 0o600 }
    );
    await fs.writeFile(
      path.join(journalDirectory, "active.takeover"),
      "malformed\n",
      { mode: 0o600 }
    );
    const malformedResume = await AppendOnlyOnlineOnboardingJournal.open({
      runDirectory,
      fingerprint,
      resume: true
    });
    await safeRejection(
      () => malformedResume.acquireExecutionLock(),
      /Takeover.*Journal/u
    );
    await fs.unlink(path.join(journalDirectory, "active.takeover"));
    await fs.unlink(path.join(journalDirectory, "active.lock"));

    const protectedRecordPath = path.join(journalDirectory, "000003-ACCOUNT_APPLIED.json");
    await fs.writeFile(protectedRecordPath, "sentinel\n", { mode: 0o600 });
    await assert.rejects(
      journal.append("ACCOUNT_APPLIED", { input_fingerprint: binding.accountFingerprint }),
      (error) => error?.code === "EEXIST"
    );
    assert.equal(await fs.readFile(protectedRecordPath, "utf8"), "sentinel\n");
    await fs.unlink(protectedRecordPath);

    await fs.writeFile(path.join(journalDirectory, "unexpected.txt"), "blocked\n", { mode: 0o600 });
    await safeRejection(
      () => AppendOnlyOnlineOnboardingJournal.open({
        runDirectory,
        fingerprint,
        resume: true
      }),
      /unbekannten Eintrag/u
    );
  } finally {
    await fs.rm(runDirectory, { recursive: true, force: true });
  }
}

{
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "vk-online-onboarding-empty-journal-"));
  await fs.chmod(runDirectory, 0o700);
  const journalDirectory = path.join(runDirectory, "online-onboarding-journal");
  try {
    await fs.mkdir(journalDirectory, { mode: 0o700 });
    const recovered = await AppendOnlyOnlineOnboardingJournal.open({
      runDirectory,
      fingerprint,
      resume: true,
      now: () => new Date("2026-08-05T08:00:00.000Z")
    });
    assert.equal(recovered.has("STARTED"), true);
    assert.deepEqual(await fs.readdir(journalDirectory), ["000001-STARTED.json"]);
  } finally {
    await fs.rm(runDirectory, { recursive: true, force: true });
  }
}

console.log(
  "Online-Onboarding-Orchestrator-Vertrag OK: gepinnte Zielkonfiguration, "
  + "Exactly-once-Apply, read-only Recovery, Cleanup, Resume und harte "
  + "READY_TO_SEND-Versandgrenze sind fail-closed."
);
