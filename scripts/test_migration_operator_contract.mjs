#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MigrationOperatorError,
  phaseExecution,
  resolveProjectedInput,
  waitForEvidenceCollection
} from "../deploy/migration-operator/operator-entrypoint.mjs";
import { renderJob } from "../deploy/migration-operator/render-job.mjs";

const root = new URL("../", import.meta.url);
const dockerfile = readFileSync(new URL("deploy/migration-operator/Dockerfile", root), "utf8");
const dockerignore = readFileSync(new URL("deploy/migration-operator/Dockerfile.dockerignore", root), "utf8");
const operatorEntrypoint = readFileSync(new URL("deploy/migration-operator/operator-entrypoint.mjs", root), "utf8");
const jobTemplate = readFileSync(new URL("deploy/migration-operator/job.template.yaml", root), "utf8");
const operatorRunbook = readFileSync(new URL("deploy/migration-operator/README.md", root), "utf8");
const migrationEnvironmentExample = readFileSync(
  new URL("config/pre-gematik/migration.env.example", root),
  "utf8"
);
const operatorSource = readFileSync(
  new URL("deploy/migration-operator/operator-entrypoint.mjs", root),
  "utf8"
);
const serviceAccount = readFileSync(new URL("deploy/migration-operator/serviceaccount.yaml", root), "utf8");
const networkPolicy = readFileSync(new URL("deploy/migration-operator/networkpolicy.yaml", root), "utf8");

const hardStartConditions = operatorRunbook.match(
  /## Harte Startbedingungen[\s\S]*?(?=\n## 1\.)/u
);
assert.ok(hardStartConditions, "Der differenzierte Startvertrag fehlt.");
assert.match(
  hardStartConditions[0],
  /`identity-preview`\/`identity-apply`[\s\S]*geschlossenes Wartungsfenster[\s\S]*`PRE_IMPORT_BACKUP_ID`/u
);
assert.match(
  hardStartConditions[0],
  /`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true`[\s\S]*`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false`/u
);
assert.match(
  hardStartConditions[0],
  /Anwendung bleibt dabei erreichbar[\s\S]*`PRE_IMPORT_BACKUP_ID` wird weder verlangt/u
);
assert.match(
  hardStartConditions[0],
  /automatische Backups[\s\S]*Point-in-time Recovery \(PITR\)/u
);
assert.match(hardStartConditions[0], /Kein anderer Modus darf dieses Gate verwenden/u);

const fingerprint = `sha256:${"a".repeat(64)}`;
const environment = {
  EXPECTED_TARGET_PROJECT_ID: "target-project-123",
  GCP_PROJECT_ID: "target-project-123",
  CONFIRM_IDENTITY_PREVIEW_FINGERPRINT: fingerprint,
  CONFIRM_IDENTITY_CURRENT_STATE_FINGERPRINT: fingerprint,
  CONFIRM_GUEST_ACCESS_INPUT_FINGERPRINT: fingerprint,
  CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT: fingerprint,
  CONFIRM_GUEST_ACCESS_OPERATION: "PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST",
  CONFIRM_IDENTITY_BINDING_COUNT: "1",
  CONFIRM_IDENTITY_ACTIVE_BINDING_COUNT: "1",
  GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "false",
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "false"
};

for (const retiredPhase of [
  "storage-preview",
  "storage-apply",
  "database-preview",
  "database-apply"
]) {
  assert.throws(
    () => phaseExecution(retiredPhase, environment),
    (error) => error instanceof MigrationOperatorError,
    `Stillgelegte Importphase darf nicht mehr ausführbar sein: ${retiredPhase}`
  );
}

const identityPreview = phaseExecution("identity-preview", environment);
assert.equal(identityPreview.managedTarget, true);
assert.deepEqual(identityPreview.arguments, [
  "--input", "/protected-input/run/iap-bindings.json"
]);
assert.deepEqual(identityPreview.protectedInputs, ["iap-bindings.json"]);

const identityApply = phaseExecution("identity-apply", environment);
assert.equal(identityApply.managedTarget, true);
assert.equal(identityApply.arguments.includes("--apply"), true);
assert.equal(identityApply.arguments.includes("UPSERT_IAP_IDENTITY_BINDINGS"), true);
assert.equal(identityApply.arguments.includes("--allow-active-bindings"), true);
assert.equal(identityApply.arguments.includes(fingerprint), true);
assert.deepEqual(
  identityApply.arguments.slice(
    identityApply.arguments.indexOf("--confirm-current-state-fingerprint"),
    identityApply.arguments.indexOf("--confirm-current-state-fingerprint") + 2
  ),
  ["--confirm-current-state-fingerprint", fingerprint]
);
assert.deepEqual(
  identityApply.arguments.slice(
    identityApply.arguments.indexOf("--confirm-binding-count"),
    identityApply.arguments.indexOf("--confirm-binding-count") + 4
  ),
  ["--confirm-binding-count", "1", "--confirm-active-binding-count", "1"]
);
assert.deepEqual(identityApply.protectedInputs, ["iap-bindings.json"]);
const identityRemapEnvironment = {
  ...environment,
  ALLOW_IDENTITY_SUBJECT_REMAPS: "true",
  CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT: "1"
};
assert.deepEqual(
  phaseExecution("identity-preview", identityRemapEnvironment).arguments,
  [
    "--input", "/protected-input/run/iap-bindings.json",
    "--allow-subject-remaps"
  ]
);
const identityRemapApply = phaseExecution("identity-apply", identityRemapEnvironment);
assert.deepEqual(
  identityRemapApply.arguments.slice(-3),
  ["--allow-subject-remaps", "--confirm-subject-remap-count", "1"]
);
assert.deepEqual(
  phaseExecution("identity-apply", {
    ...identityRemapEnvironment,
    CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT: "0"
  }).arguments.slice(-3),
  ["--allow-subject-remaps", "--confirm-subject-remap-count", "0"],
  "Der bestaetigte Post-Apply-Readback darf als schreibfreier Remap-No-op laufen."
);
for (const invalidRemapCount of ["", "-1"]) {
  assert.throws(
    () => phaseExecution("identity-apply", {
      ...identityRemapEnvironment,
      CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT: invalidRemapCount
    }),
    (error) => error instanceof MigrationOperatorError
  );
}
assert.throws(
  () => phaseExecution("identity-preview", {
    ...environment,
    ALLOW_IDENTITY_SUBJECT_REMAPS: "yes"
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("identity-apply", { ...environment, CONFIRM_IDENTITY_PREVIEW_FINGERPRINT: "" }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("identity-apply", {
    ...environment,
    CONFIRM_IDENTITY_CURRENT_STATE_FINGERPRINT: ""
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("identity-apply", { ...environment, CONFIRM_IDENTITY_BINDING_COUNT: "" }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("identity-apply", { ...environment, CONFIRM_IDENTITY_ACTIVE_BINDING_COUNT: "-1" }),
  (error) => error instanceof MigrationOperatorError
);

const guestPreview = phaseExecution("guest-preview", environment);
assert.equal(guestPreview.managedTarget, true);
assert.deepEqual(guestPreview.arguments, [
  "--input", "/protected-input/run/guest-access.json"
]);
assert.deepEqual(guestPreview.protectedInputs, ["guest-access.json"]);
assert.equal(guestPreview.guestAccessTargetProject, environment.EXPECTED_TARGET_PROJECT_ID);

const guestApply = phaseExecution("guest-apply", environment);
assert.equal(guestApply.managedTarget, true);
assert.deepEqual(guestApply.protectedInputs, ["guest-access.json"]);
assert.deepEqual(guestApply.arguments, [
  "--input", "/protected-input/run/guest-access.json",
  "--apply",
  "--confirm-environment", "pre-gematik",
  "--confirm-project", environment.EXPECTED_TARGET_PROJECT_ID,
  "--confirm-database", "versorgungs_kompass",
  "--confirm-operation", "PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST",
  "--confirm-fingerprint", fingerprint,
  "--confirm-current-state-fingerprint", fingerprint
]);
assert.equal(guestApply.arguments.includes("--create-profile-and-prebind"), false);
assert.equal(guestApply.arguments.includes("--revoke"), false);

const guestReconcileEnvironment = {
  ...environment,
  GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "true",
  CONFIRM_GUEST_ACCESS_OPERATION:
    "RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST"
};
const guestReconcilePreview = phaseExecution(
  "guest-preview",
  guestReconcileEnvironment
);
assert.deepEqual(guestReconcilePreview.arguments, [
  "--input", "/protected-input/run/guest-access.json",
  "--reconcile-profile-display-name-and-prebind"
]);
const guestReconcileApply = phaseExecution(
  "guest-apply",
  guestReconcileEnvironment
);
assert.equal(
  guestReconcileApply.arguments.includes(
    "RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST"
  ),
  true
);
assert.equal(
  guestReconcileApply.arguments.includes(
    "--reconcile-profile-display-name-and-prebind"
  ),
  true
);

const guestCreateProfileEnvironment = {
  ...environment,
  GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "true",
  CONFIRM_GUEST_ACCESS_OPERATION:
    "CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST"
};
const guestCreateProfilePreview = phaseExecution(
  "guest-preview",
  guestCreateProfileEnvironment
);
assert.deepEqual(guestCreateProfilePreview.arguments, [
  "--input", "/protected-input/run/guest-access.json",
  "--create-profile-and-prebind"
]);
const guestCreateProfileApply = phaseExecution(
  "guest-apply",
  guestCreateProfileEnvironment
);
assert.equal(
  guestCreateProfileApply.arguments.includes("--create-profile-and-prebind"),
  true
);
assert.equal(
  guestCreateProfileApply.arguments.includes(
    "CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST"
  ),
  true
);
assert.equal(
  guestCreateProfileApply.arguments.includes(
    "--reconcile-profile-display-name-and-prebind"
  ),
  false
);

const noopStateFingerprint = `sha256:${"b".repeat(64)}`;
const guestNoopApply = phaseExecution("guest-apply", {
  ...guestReconcileEnvironment,
  CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT: noopStateFingerprint
});
assert.equal(
  guestNoopApply.arguments[
    guestNoopApply.arguments.indexOf("--confirm-current-state-fingerprint") + 1
  ],
  noopStateFingerprint,
  "The same guest-apply phase must accept the freshly previewed unchanged state."
);

for (const invalidMode of [undefined, "", "yes", "TRUE", "1"]) {
  const invalidCreateEnvironment = {
    ...environment,
    GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: invalidMode
  };
  assert.throws(
    () => phaseExecution("guest-preview", invalidCreateEnvironment),
    (error) => error instanceof MigrationOperatorError
      && /GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND must be exactly true or false/u.test(
        error.message
      )
  );
  const invalidEnvironment = {
    ...environment,
    GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: invalidMode
  };
  assert.throws(
    () => phaseExecution("guest-preview", invalidEnvironment),
    (error) => error instanceof MigrationOperatorError
      && /must be exactly true or false/u.test(error.message)
  );
}
assert.throws(
  () => phaseExecution("guest-preview", {
    ...environment,
    GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "true",
    GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "true"
  }),
  (error) => error instanceof MigrationOperatorError
    && /mutually exclusive/u.test(error.message)
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    CONFIRM_GUEST_ACCESS_INPUT_FINGERPRINT: ""
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT: ""
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND: "true"
  }),
  (error) => error instanceof MigrationOperatorError
    && /CONFIRM_GUEST_ACCESS_OPERATION must exactly match/u.test(error.message)
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND: "true"
  }),
  (error) => error instanceof MigrationOperatorError
    && /CONFIRM_GUEST_ACCESS_OPERATION must exactly match/u.test(error.message)
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    CONFIRM_GUEST_ACCESS_OPERATION: ""
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("guest-preview", {
    ...environment,
    EXPECTED_TARGET_PROJECT_ID: "FOREIGN"
  }),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("guest-preview", {
    ...environment,
    GCP_PROJECT_ID: "different-project-456"
  }),
  (error) => error instanceof MigrationOperatorError
    && /EXPECTED_TARGET_PROJECT_ID and GCP_PROJECT_ID to match exactly/u.test(error.message)
);
assert.throws(
  () => phaseExecution("guest-apply", {
    ...environment,
    GCP_PROJECT_ID: ""
  }),
  (error) => error instanceof MigrationOperatorError
);

assert.throws(
  () => phaseExecution("shell", environment),
  (error) => error instanceof MigrationOperatorError
);

const projectedInputTestRoot = await mkdtemp(join(tmpdir(), "vk-operator-projected-secret-"));
try {
  const secretRoot = join(projectedInputTestRoot, "secret-input");
  const versionDirectory = join(secretRoot, "..2026_07_20_00_00_00.000000000");
  await mkdir(versionDirectory, { recursive: true, mode: 0o700 });
  const projectedTarget = join(versionDirectory, "iap-bindings.json");
  await writeFile(projectedTarget, "[]", { mode: 0o600 });
  await symlink("..2026_07_20_00_00_00.000000000", join(secretRoot, "..data"));
  const projectedPath = join(secretRoot, "iap-bindings.json");
  await symlink("..data/iap-bindings.json", projectedPath);
  assert.equal(
    await resolveProjectedInput(projectedPath, secretRoot),
    await realpath(projectedTarget),
    "Kubernetes' versioned Secret projection must be accepted after containment verification."
  );

  const outsidePath = join(projectedInputTestRoot, "outside.json");
  await writeFile(outsidePath, "{}", { mode: 0o600 });
  const escapingPath = join(secretRoot, "escaping.json");
  await symlink(outsidePath, escapingPath);
  await assert.rejects(
    resolveProjectedInput(escapingPath, secretRoot),
    (error) => error instanceof MigrationOperatorError
      && /escapes its read-only Secret mount/u.test(error.message)
  );
} finally {
  await rm(projectedInputTestRoot, { recursive: true, force: true });
}

const evidenceHandoffRoot = await mkdtemp(join(tmpdir(), "vk-operator-evidence-handoff-"));
try {
  const acknowledgementPath = join(evidenceHandoffRoot, ".evidence-collected");
  assert.equal(
    await waitForEvidenceCollection({ environment: {}, acknowledgementPath }),
    false
  );
  await writeFile(acknowledgementPath, "", { mode: 0o600 });
  assert.equal(
    await waitForEvidenceCollection({
      environment: { MIGRATION_OPERATOR_REQUIRE_EVIDENCE_ACK: "true" },
      acknowledgementPath,
      timeoutMs: 100,
      pollIntervalMs: 5
    }),
    true
  );
  await writeFile(acknowledgementPath, "not-empty", { mode: 0o600 });
  await assert.rejects(
    waitForEvidenceCollection({
      environment: { MIGRATION_OPERATOR_REQUIRE_EVIDENCE_ACK: "true" },
      acknowledgementPath,
      timeoutMs: 100,
      pollIntervalMs: 5
    }),
    (error) => error instanceof MigrationOperatorError
      && /acknowledgement is malformed/u.test(error.message)
  );
} finally {
  await rm(evidenceHandoffRoot, { recursive: true, force: true });
}

assert.match(dockerfile, /^FROM node:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^FROM gcr\.io\/cloud-sql-connectors\/cloud-sql-proxy:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^FROM gcr\.io\/google\.com\/cloudsdktool\/google-cloud-cli:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^USER 65532:65532$/mu);
assert.match(dockerfile, /^ENTRYPOINT \["node", "\/opt\/operator\/operator-entrypoint\.mjs"\]$/mu);
assert.match(dockerfile, /COPY scripts\/provision_iap_identity_bindings\.mjs/u);
assert.match(
  dockerfile,
  /COPY scripts\/provision_pre_gematik_identity_platform_account\.mjs/u
);
assert.match(
  dockerfile,
  /COPY scripts\/provision_pre_gematik_identity_platform_guest_access\.mjs/u
);
assert.match(dockerfile, /COPY scripts\/provision_pre_gematik_test_access\.mjs/u);
assert.doesNotMatch(dockerfile, /SUPABASE_SERVICE_ROLE_KEY|SOURCE_DATABASE_URL|TARGET_DATABASE_URL/u);
assert.match(dockerignore, /^\*\*$/mu);
assert.match(
  dockerignore,
  /^!scripts\/provision_pre_gematik_identity_platform_account\.mjs$/mu
);
assert.match(
  dockerignore,
  /^!scripts\/provision_pre_gematik_identity_platform_guest_access\.mjs$/mu
);
assert.match(
  dockerignore,
  /^!scripts\/provision_pre_gematik_test_access\.mjs$/mu
);
assert.doesNotMatch(dockerignore, /^!\.env/mu);
assert.match(
  operatorSource,
  /childEnvironment\.PRE_GEMATIK_ACCESS_REPOSITORY_ROOT = WORKSPACE/u
);
assert.match(
  operatorSource,
  /childEnvironment\.PRE_GEMATIK_ACCESS_EXPECTED_PROJECT_ID\s*=\s*\n\s*execution\.guestAccessTargetProject/u
);

assert.match(jobTemplate, /backoffLimit: 0/u);
assert.match(jobTemplate, /activeDeadlineSeconds: 3600/u);
assert.match(jobTemplate, /automountServiceAccountToken: false/u);
assert.match(jobTemplate, /readOnlyRootFilesystem: true/u);
assert.match(jobTemplate, /allowPrivilegeEscalation: false/u);
assert.match(jobTemplate, /runAsNonRoot: true/u);
assert.match(jobTemplate, /kubernetes\.io\/arch: amd64/u);
assert.match(jobTemplate, /CLOUD_SQL_AUTH_PROXY_CONNECT_MODE[\s\S]*value: private-ip/u);
assert.match(jobTemplate, /MIGRATION_OPERATOR_REQUIRE_EVIDENCE_ACK[\s\S]*value: "true"/u);
assert.match(jobTemplate, /secretRef:\s+name: vk-pre-gematik-migration-environment/u);
assert.match(jobTemplate, /secretName: vk-pre-gematik-migration-input/u);
assert.match(jobTemplate, /app\.kubernetes\.io\/component: identity-operator/u);
assert.doesNotMatch(jobTemplate, /optional: true/u);
assert.doesNotMatch(jobTemplate, /service_role|postgresql:\/\/|password:/iu);
assert.match(serviceAccount, /automountServiceAccountToken: false/u);
assert.match(networkPolicy, /ingress: \[\]/u);
assert.doesNotMatch(networkPolicy, /port: 5432/u);
assert.match(networkPolicy, /cidr: 10\.0\.0\.0\/8[\s\S]*port: 3307/u);
assert.match(networkPolicy, /169\.254\.169\.252\/32/u);

for (const role of [
  "roles/container.clusterViewer",
  "roles/cloudasset.viewer",
  "roles/cloudsql.viewer",
  "roles/cloudsql.client",
  "roles/identitytoolkit.viewer",
  "roles/serviceusage.serviceUsageConsumer"
]) {
  assert.match(
    operatorRunbook,
    new RegExp(role.replace(".", "\\."), "u"),
    `Der Access-Operator-Runbookvertrag muss die temporäre IAM-Rolle ${role} benennen.`
  );
}
assert.match(operatorRunbook, /für höchstens 24 Stunden[^\n]*Basisrollen/u);
const guestIamSection = operatorRunbook.match(
  /Nur während `guest-preview` und `guest-apply`[\s\S]*?(?=\n## 3\.)/u
);
assert.ok(guestIamSection, "Der phasenbegrenzte Guest-IAM-Vertrag fehlt.");
assert.match(guestIamSection[0], /roles\/identitytoolkit\.viewer/u);
assert.match(guestIamSection[0], /roles\/serviceusage\.serviceUsageConsumer/u);
assert.match(guestIamSection[0], /firebaseauth\.users\.get/u);
assert.match(guestIamSection[0], /serviceusage\.services\.use/u);
assert.match(
  guestIamSection[0],
  /unmittelbar vor dem ersten `guest-preview`[\s\S]*unmittelbar nach dem letzten Gast-Readback/u
);
assert.match(guestIamSection[0], /nicht für Identity-Phasen/u);

assert.match(
  operatorRunbook,
  /Format `KEY=VALUE`[\s\S]*keine äußeren Shell-Anführungszeichen[\s\S]*percent-encodiert/u
);
assert.match(
  operatorRunbook,
  /Beispieldatei darf deshalb nie unverändert an\s+`kubectl` übergeben werden/u
);
assert.match(
  operatorRunbook,
  /Identity-Admin-Runbook[^\n]*PRE_GEMATIK_IDENTITY_ADMIN\.md/u
);
assert.match(
  operatorRunbook,
  /exakt der `NOLOGIN`-Rolle\s+`vk_identity_admin`[\s\S]*`postgres`, `cloudsqlsuperuser` oder\s+weitere Mitgliedschaften werden abgewiesen/u
);
assert.match(
  operatorRunbook,
  /prepare_pre_gematik_test_access_operator\.mjs[\s\S]*exklusiv\s+`vk_access_enrollment_admin`/u
);
assert.match(
  operatorRunbook,
  /EXPECTED_TARGET_PROJECT_ID[\s\S]*exakt\s+`GCP_PROJECT_ID`/u
);

const identityInputSection = operatorRunbook.match(
  /### Identity-Phasen[\s\S]*?(?=\n### Guest-Phasen)/u
);
assert.ok(identityInputSection, "Der phasenminimale Identity-Inputvertrag fehlt.");
assert.match(identityInputSection[0], /identity-run\/identity-operator\.env/u);
assert.match(identityInputSection[0], /--from-file=iap-bindings\.json=/u);
assert.doesNotMatch(
  identityInputSection[0],
  /guest-access\.json|test-access-operator\.env|identity-platform-readback\.env/u
);

const guestInputSection = operatorRunbook.match(
  /### Guest-Phasen[\s\S]*?(?=\n## 4\.)/u
);
assert.ok(guestInputSection, "Der phasenminimale Guest-Inputvertrag fehlt.");
assert.match(guestInputSection[0], /access-run\/test-access-operator\.env/u);
assert.match(guestInputSection[0], /identity-platform-readback\.env/u);
assert.match(guestInputSection[0], /--from-file=guest-access\.json=/u);
assert.match(guestInputSection[0], /keine\s+Identity-Admin- oder anderen phasenfremden Credentials/u);
assert.doesNotMatch(identityInputSection[0], /guest-access\.json/u);

assert.match(operatorRunbook, /Bewusst\s+kein `kubectl apply`/u);
assert.match(operatorRunbook, /Ein vorhandenes gleichnamiges\s+Secret bedeutet Abbruch/u);
assert.match(
  operatorRunbook,
  /GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND/u
);
assert.match(
  operatorRunbook,
  /GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND/u
);
assert.match(
  operatorRunbook,
  /beide Schalter[\s\S]*akzeptieren exakt `true` oder `false`[\s\S]*gegenseitig ausgeschlossen/u
);
assert.match(
  operatorRunbook,
  /GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true[\s\S]*`--create-profile-and-prebind`[\s\S]*`CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`/u
);
assert.match(
  operatorRunbook,
  /CONFIRM_GUEST_ACCESS_OPERATION[\s\S]*exakt aus demselben Preview/u
);
assert.match(
  migrationEnvironmentExample,
  /^GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=false$/mu
);
assert.match(
  migrationEnvironmentExample,
  /^GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false$/mu
);
assert.match(
  migrationEnvironmentExample,
  /Leave unset only when[\s\S]*GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true[\s\S]*online gate verifies automatic backups and PITR/u
);
assert.match(
  migrationEnvironmentExample,
  /Exactly[\s\S]*create=true plus reconcile=false selects the online new-user contract/u
);

const identityExecutionSection = operatorRunbook.match(
  /### Identity-Vertrag[\s\S]*?(?=\n### Wartungsgebundener Guest-Vertrag)/u
);
assert.ok(identityExecutionSection, "Der Identity-Preview-/Apply-Vertrag fehlt.");
assert.match(identityExecutionSection[0], /`identity-preview` zweimal/u);
assert.match(identityExecutionSection[0], /`identity-apply` genau einmal/u);
assert.match(identityExecutionSection[0], /neuen Ist-Fingerprint/u);
assert.match(identityExecutionSection[0], /CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT=0/u);
assert.match(identityExecutionSection[0], /darf kein\s+`INSERT` oder `UPDATE` erzeugen/u);
assert.match(identityExecutionSection[0], /vollständige Rollback-Roster/u);

const guestExecutionSection = operatorRunbook.match(
  /### Wartungsgebundener Guest-Vertrag[\s\S]*?(?=\n### Online-Neunutzervertrag)/u
);
assert.ok(guestExecutionSection, "Der wartungsgebundene Guest-Preview-/Apply-Vertrag fehlt.");
assert.match(guestExecutionSection[0], /`guest-preview` zweimal/u);
assert.match(guestExecutionSection[0], /`guest-apply` genau einmal/u);
assert.match(guestExecutionSection[0], /`result=unchanged`/u);
assert.match(guestExecutionSection[0], /neuen Ist-Fingerprint/u);
assert.match(
  guestExecutionSection[0],
  /weder ein Profil aktualisieren noch ein Binding anlegen/u
);
assert.match(guestExecutionSection[0], /Preview bleibt unverändert/u);
assert.doesNotMatch(
  guestExecutionSection[0],
  /Neunutzer/u,
  "Die Online-Neunutzeranlage darf nicht in den Wartungsvertrag einsortiert sein."
);

const onlineOnboardingExecutionSection = operatorRunbook.match(
  /### Online-Neunutzervertrag[\s\S]*?(?=\n## 5\.)/u
);
assert.ok(onlineOnboardingExecutionSection, "Der Online-Neunutzervertrag fehlt.");
assert.match(
  onlineOnboardingExecutionSection[0],
  /`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true`[\s\S]*laufender Anwendung/u
);
assert.match(
  onlineOnboardingExecutionSection[0],
  /`guest-preview`[\s\S]*`result=create_profile_and_binding`[\s\S]*vollständig leeren relevanten Istzustand/u
);
assert.match(
  onlineOnboardingExecutionSection[0],
  /Genau ein fachlich bestätigter `guest-apply`[\s\S]*serialisierbaren Transaktion/u
);
assert.match(
  onlineOnboardingExecutionSection[0],
  /neuer `guest-preview`[\s\S]*`result=unchanged`[\s\S]*Mail-Gate/u
);
assert.match(
  onlineOnboardingExecutionSection[0],
  /zweiter No-op-Apply gehört ausdrücklich nicht zum Online-Vertrag/u
);
assert.match(
  onlineOnboardingExecutionSection[0],
  /laufende Anwendung wird weder gesperrt noch skaliert/u
);
assert.match(onlineOnboardingExecutionSection[0], /wird Apply in keinem Modus blind/u);
assert.match(
  onlineOnboardingExecutionSection[0],
  /exponiert `--create-profile-and-prebind` ausschließlich[\s\S]*GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true/u
);
assert.match(onlineOnboardingExecutionSection[0], /`--revoke` bleibt nicht exponiert/u);

const evidenceSection = operatorRunbook.match(
  /## 5\. Geschützte Evidenzübergabe[\s\S]*?(?=\n## 6\.)/u
);
assert.ok(evidenceSection, "Der geschützte Evidence-ACK-Vertrag fehlt.");
assert.match(evidenceSection[0], /kubectl --namespace pre-gematik cp/u);
assert.match(
  evidenceSection[0],
  /sh -c 'umask 077; : > \/protected-output\/run\/\.evidence-collected'/u
);
assert.match(evidenceSection[0], /--for=condition=complete/u);
assert.match(evidenceSection[0], /`succeeded: false`[\s\S]*`Failed` statt\s+`Complete`/u);
assert.match(evidenceSection[0], /endet der Job nach 15 Minuten fail-closed/u);

const cleanupSection = operatorRunbook.match(/## 6\. Vollständiger Cleanup[\s\S]*$/u);
assert.ok(cleanupSection, "Der vollständige Access-Operator-Cleanup fehlt.");
for (const contract of [
  "vk-pre-gematik-migration-environment",
  "vk-pre-gematik-migration-input",
  "vk_identity_admin",
  "vk_access_enrollment_admin",
  "roles/identitytoolkit.viewer",
  "roles/serviceusage.serviceUsageConsumer",
  "networkpolicy/vk-pre-gematik-migration-operator",
  "serviceaccount/vk-pre-gematik-migration-operator"
]) {
  assert.ok(
    cleanupSection[0].includes(contract),
    `Der Cleanup muss ${contract} exakt abdecken.`
  );
}
assert.match(
  cleanupSection[0],
  /erneut gelesenen IAM-Policy bestätigen/u
);
assert.match(
  cleanupSection[0],
  /inerte Kompatibilitätsausnahme für ServiceAccount und NetworkPolicy[\s\S]*weder Job noch Operator-Secrets oder Pods/u
);
assert.match(
  cleanupSection[0],
  /ohne\s+direkten PostgreSQL-Egress/u
);
assert.doesNotMatch(
  `${dockerfile}\n${dockerignore}\n${operatorSource}\n${operatorRunbook}\n${networkPolicy}`,
  /SUPABASE_|\.supabase\.co|migrate_supabase|supabase-root-ca|storage-(?:preview|apply)|database-(?:preview|apply)/iu
);

const image = `europe-west3-docker.pkg.dev/target-project-123/migrations/operator@sha256:${"b".repeat(64)}`;
const rendered = renderJob({
  image,
  projectId: "target-project-123",
  region: "europe-west3"
});
assert.equal(rendered.includes(image), true);
assert.equal(rendered.includes("REPLACE_WITH_IMMUTABLE_OPERATOR_IMAGE"), false);
assert.throws(
  () => renderJob({
    image: `europe-west1-docker.pkg.dev/other-project/repository/operator@sha256:${"b".repeat(64)}`,
    projectId: "target-project-123",
    region: "europe-west3"
  }),
  /outside the approved target project and region/u
);

console.log("Access operator contract checks passed.");
