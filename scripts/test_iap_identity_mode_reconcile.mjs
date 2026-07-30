import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const reconcileScript = join(
  repositoryRoot,
  "scripts",
  "reconcile_pre_gematik_iap_identity_mode.sh"
);
const workflow = readFileSync(
  join(repositoryRoot, ".github", "workflows", "deploy-pre-gematik.yml"),
  "utf8"
);
const chartConfigMap = readFileSync(
  join(
    repositoryRoot,
    "deploy",
    "helm",
    "versorgungs-kompass",
    "templates",
    "configmap.yaml"
  ),
  "utf8"
);
const identityPlatformTerraform = readFileSync(
  join(
    repositoryRoot,
    "deploy",
    "terraform",
    "gcp-autopilot",
    "identity-platform.tf"
  ),
  "utf8"
);

function workflowStepScript(name) {
  const startToken = `      - name: ${name}\n`;
  const start = workflow.indexOf(startToken);
  assert.notEqual(start, -1, `Workflow-Schritt fehlt: ${name}`);
  const next = workflow.indexOf("\n      - name: ", start + startToken.length);
  const block = workflow.slice(start, next === -1 ? workflow.length : next);
  const runToken = "        run: |\n";
  const runStart = block.indexOf(runToken);
  assert.notEqual(runStart, -1, `Workflow-Schritt hat keinen Shell-Block: ${name}`);
  return block
    .slice(runStart + runToken.length)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

assert.match(
  workflow,
  /IAP_EXTERNAL_AUTH_API_KEY:\s*\$\{\{\s*vars\.IAP_EXTERNAL_AUTH_API_KEY\s*\}\}/u
);
assert.match(
  workflow,
  /IDENTITY_PLATFORM_API_KEY:\s*\$\{\{\s*vars\.IDENTITY_PLATFORM_API_KEY\s*\}\}/u
);
assert.match(
  workflow,
  /IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256:\s*\$\{\{\s*vars\.IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256\s*\}\}/u
);
assert.match(workflow, /\.client\.apiKey == \$auth_api_key/u);
assert.match(
  workflow,
  /\[\[ "\$IDENTITY_PLATFORM_API_KEY" != "\$IAP_EXTERNAL_AUTH_API_KEY" \]\]/u
);
assert.match(
  workflow,
  /\[\[ "\$IAP_EXTERNAL_LOGIN_PAGE_URI" != "\$\{FRONTEND_BASE_URL\}\/anmelden" \]\]/u
);
assert.match(
  workflow,
  /\.emailPrivacyConfig\.enableImprovedEmailPrivacy == true/u
);
assert.match(
  workflow,
  /google_redirect_uri="https:\/\/steam-capsule-341212\.firebaseapp\.com\/__\/auth\/handler"/u
);
assert.doesNotMatch(
  workflow,
  /\$\{IAP_EXTERNAL_LOGIN_PAGE_URI%\/\}\/__\/auth\/handler/u
);
assert.match(workflow, /now_epoch - google_login_verified_epoch > 24 \* 60 \* 60/u);
assert.match(workflow, /external_expiry_epoch > approved_pilot_end_epoch/u);
assert.match(workflow, /external_expiry_epoch > resource_access_expiry_epoch/u);
assert.match(
  workflow,
  /approvedPasswordResetSucceeded: true[\s\S]*customUi: true[\s\S]*googleLoginSucceeded: true[\s\S]*loginPath: "\/anmelden"[\s\S]*loginPortalMarker: "signin"[\s\S]*passwordActionPath: "\/konto\/passwort-festlegen"[\s\S]*passwordPortalMarker: "password"[\s\S]*selfSignupVisible: false[\s\S]*visibleOptions: \["google\.com", "password"\]/u
);
assert.doesNotMatch(workflow, /hosted-UI|hosted flow|prebuilt hosted/iu);
assert.match(
  workflow,
  /\.passwordPolicyConfig\.passwordPolicyEnforcementState == "ENFORCE"/u
);
assert.match(
  workflow,
  /\.passwordPolicyConfig\.passwordPolicyVersions\[0\]\.customStrengthOptions/u
);
assert.doesNotMatch(workflow, /\.passwordPolicyConfig\.enforcementState/u);
assert.match(
  workflow,
  /bash scripts\/reconcile_pre_gematik_iap_identity_mode\.sh[\s\S]*if \[\[ "\$IAP_IDENTITY_MODE" == "iam" \]\]/u
);
for (const runtimeKey of [
  "IAP_EXTERNAL_LOGIN_PAGE_URI",
  "IAP_EXTERNAL_AUTH_API_KEY",
  "IAP_EXTERNAL_ACCESS_EXPIRES_AT"
]) {
  assert.match(chartConfigMap, new RegExp(`${runtimeKey}:`, "u"));
}
assert.match(identityPlatformTerraform, /disabled_user_signup\s*=\s*true/u);
assert.match(identityPlatformTerraform, /disabled_user_deletion\s*=\s*true/u);
assert.match(identityPlatformTerraform, /allow_duplicate_emails\s*=\s*false/u);
assert.match(identityPlatformTerraform, /allow_tenants\s*=\s*false/u);
assert.match(identityPlatformTerraform, /state\s*=\s*"DISABLED"/u);
assert.match(
  identityPlatformTerraform,
  /timecmp\(var\.IAP_EXTERNAL_ACCESS_EXPIRES_AT, "2026-08-17T16:00:00Z"\) <= 0/u
);
assert.doesNotMatch(
  readFileSync(join(repositoryRoot, "deploy", "terraform", "gcp-autopilot", "identities.tf"), "utf8"),
  /firebaseauth\.configs\.getSecret/u
);
assert.doesNotMatch(workflow, /\.clientSecret/u);

const syntax = spawnSync("bash", ["-n", reconcileScript], { encoding: "utf8" });
assert.equal(syntax.status, 0, `Reconcile-Skript enthält ungültige Bash-Syntax:\n${syntax.stderr}`);
const preflightSyntax = spawnSync("bash", ["-n"], {
  encoding: "utf8",
  input: workflowStepScript("Preflight locked Identity Platform providers without mutation")
});
assert.equal(
  preflightSyntax.status,
  0,
  `Identity-Platform-Preflight enthält ungültige Bash-Syntax:\n${preflightSyntax.stderr}`
);

const fixtureRoot = mkdtempSync(join(tmpdir(), "vk-iap-identity-mode-"));
const binDirectory = join(fixtureRoot, "bin");
const stateDirectory = join(fixtureRoot, "state");
mkdirSync(binDirectory);
mkdirSync(stateDirectory);

const fakeGcloud = join(binDirectory, "gcloud");
writeFileSync(fakeGcloud, `#!/usr/bin/env bash
set -euo pipefail

service=""
if [[ "\${1:-} \${2:-} \${3:-}" == "iap settings get" ]]; then
  shift 3
  while (( $# )); do
    if [[ "$1" == "--service" ]]; then service="$2"; shift 2; else shift; fi
  done
  printf 'settings:get:%s\\n' "$service" >> "$MOCK_GCLOUD_LOG"
  cat "$MOCK_STATE_DIR/settings-\${service}.json"
  exit 0
fi

if [[ "\${1:-} \${2:-} \${3:-}" == "iap settings set" ]]; then
  source_file="$4"
  shift 4
  while (( $# )); do
    if [[ "$1" == "--service" ]]; then service="$2"; shift 2; else shift; fi
  done
  set_call_count="$(( $(cat "$MOCK_SET_COUNTER_FILE") + 1 ))"
  printf '%s\\n' "$set_call_count" > "$MOCK_SET_COUNTER_FILE"
  if [[ ",\${MOCK_FAIL_SET_CALLS:-}," == *",\${set_call_count},"* ]]; then
    printf 'settings:set-failed:%s\\n' "$service" >> "$MOCK_GCLOUD_LOG"
    exit 42
  fi
  printf 'settings:set:%s\\n' "$service" >> "$MOCK_GCLOUD_LOG"
  state_file="$MOCK_STATE_DIR/settings-\${service}.json"
  temporary_file="\${state_file}.tmp"
  jq '.' "$source_file" > "$temporary_file"
  mv "$temporary_file" "$state_file"
  exit 0
fi

if [[ "\${1:-} \${2:-} \${3:-}" == "iap web get-iam-policy" ]]; then
  shift 3
  while (( $# )); do
    if [[ "$1" == "--service" ]]; then service="$2"; shift 2; else shift; fi
  done
  printf 'policy:get:%s\\n' "$service" >> "$MOCK_GCLOUD_LOG"
  cat "$MOCK_STATE_DIR/policy-\${service}.json"
  exit 0
fi

printf 'unexpected:%s\\n' "$*" >> "$MOCK_GCLOUD_LOG"
exit 98
`);
chmodSync(fakeGcloud, 0o755);

const backendServices = ["api-backend", "frontend-backend"];
const approvedPrincipal = "group:versorgungs-kompass-pre-gematik-access@googlegroups.com";
const approvedExpiry = "2026-08-17T16:00:00Z";
const agentTenant = "_123456789";
const loginPageUri = "https://login.example.invalid/auth";
const reauthSettings = {
  method: "ENROLLED_SECOND_FACTORS",
  maxAge: "28800s",
  policyType: "MINIMUM"
};

function approvedPolicy(member = approvedPrincipal) {
  return {
    version: 3,
    etag: "fixture-etag",
    bindings: [{
      role: "roles/iap.httpsResourceAccessor",
      members: [member],
      condition: {
        title: "pre-gematik-pilot-expiry",
        description: "Automatische Sperre zum dokumentierten Ende des pre-gematik-Piloten.",
        expression: `request.time < timestamp("${approvedExpiry}")`
      }
    }]
  };
}

function writeState({
  apiGcip = null,
  frontendGcip = null,
  apiPolicy = approvedPolicy(),
  frontendPolicy = approvedPolicy(),
  apiReauth = reauthSettings,
  frontendReauth = reauthSettings,
  apiExtraAccess = {},
  frontendExtraAccess = {}
} = {}) {
  const serviceState = [
    [backendServices[0], apiGcip, apiPolicy, apiReauth, apiExtraAccess],
    [backendServices[1], frontendGcip, frontendPolicy, frontendReauth, frontendExtraAccess]
  ];
  for (const [service, gcipSettings, policy, reauth, extraAccess] of serviceState) {
    const accessSettings = { reauthSettings: reauth, ...extraAccess };
    if (gcipSettings) accessSettings.gcipSettings = gcipSettings;
    writeFileSync(
      join(stateDirectory, `settings-${service}.json`),
      `${JSON.stringify({ accessSettings })}\n`
    );
    writeFileSync(
      join(stateDirectory, `policy-${service}.json`),
      `${JSON.stringify(policy)}\n`
    );
  }
}

let runCounter = 0;
function reconcile(mode, overrides = {}) {
  runCounter += 1;
  const workDirectory = join(fixtureRoot, `work-${runCounter}`);
  const logFile = join(fixtureRoot, `gcloud-${runCounter}.log`);
  const setCounterFile = join(fixtureRoot, `gcloud-${runCounter}.set-count`);
  mkdirSync(workDirectory);
  writeFileSync(logFile, "");
  writeFileSync(setCounterFile, "0\n");
  const result = spawnSync("bash", [reconcileScript], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      MOCK_STATE_DIR: stateDirectory,
      MOCK_GCLOUD_LOG: logFile,
      MOCK_SET_COUNTER_FILE: setCounterFile,
      IAP_IDENTITY_MODE: mode,
      GCP_PROJECT_ID: "example-project",
      IAP_PROJECT_NUMBER: "123456789",
      IAP_API_BACKEND_SERVICE: backendServices[0],
      IAP_FRONTEND_BACKEND_SERVICE: backendServices[1],
      IAP_RESOURCE_ACCESS_PRINCIPAL: approvedPrincipal,
      IAP_RESOURCE_ACCESS_EXPIRES_AT: approvedExpiry,
      IAP_GCIP_PROJECT_ID: "example-project",
      IAP_GCIP_TENANT_ID: "",
      IAP_EXTERNAL_LOGIN_PAGE_URI: loginPageUri,
      IAP_WORK_DIR: workDirectory,
      ...overrides
    }
  });
  return {
    ...result,
    log: readFileSync(logFile, "utf8")
  };
}

function readSettings(service) {
  return JSON.parse(
    readFileSync(join(stateDirectory, `settings-${service}.json`), "utf8")
  );
}

try {
  writeState();
  const externalCutover = reconcile("external");
  assert.equal(externalCutover.status, 0, externalCutover.stderr);
  assert.equal(
    externalCutover.log.match(/^settings:set:/gmu)?.length,
    2,
    "External-Cutover muss beide geschützten Backends konfigurieren."
  );
  for (const service of backendServices) {
    const settings = readSettings(service).accessSettings;
    assert.deepEqual(settings.gcipSettings, {
      tenantIds: [agentTenant],
      loginPageUri
    });
    assert.equal(
      settings.reauthSettings,
      undefined,
      "External Identities dürfen keine nicht unterstützte IAP-Reauthentication behalten."
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(stateDirectory, `policy-${service}.json`), "utf8")),
      approvedPolicy(),
      "External-Cutover darf die IAM-Rollback-Policy nicht verändern."
    );
  }

  const idempotentExternal = reconcile("external");
  assert.equal(idempotentExternal.status, 0, idempotentExternal.stderr);
  assert.doesNotMatch(
    idempotentExternal.log,
    /^settings:set:/mu,
    "Ein bereits exakter External-Zustand darf nicht erneut mutiert werden."
  );

  writeState({
    apiGcip: { tenantIds: [agentTenant], loginPageUri },
    apiReauth: null
  });
  const mixedExternalSource = reconcile("external");
  assert.notEqual(mixedExternalSource.status, 0);
  assert.match(mixedExternalSource.stderr, /partial IAM\/external identity-source state/u);
  assert.doesNotMatch(mixedExternalSource.log, /^settings:set:/mu);

  const convergeMixedStateToIam = reconcile("iam");
  assert.equal(convergeMixedStateToIam.status, 0, convergeMixedStateToIam.stderr);
  assert.equal(convergeMixedStateToIam.log.match(/^settings:set:/gmu)?.length, 1);
  for (const service of backendServices) {
    assert.equal(readSettings(service).accessSettings.gcipSettings, undefined);
    assert.deepEqual(readSettings(service).accessSettings.reauthSettings, reauthSettings);
  }

  writeState();
  const failedSecondExternalSet = reconcile("external", {
    MOCK_FAIL_SET_CALLS: "2"
  });
  assert.notEqual(failedSecondExternalSet.status, 0);
  assert.match(failedSecondExternalSet.stderr, /rolled back to the exact original settings/u);
  assert.match(failedSecondExternalSet.log, /settings:set-failed:frontend-backend/u);
  for (const service of backendServices) {
    const settings = readSettings(service).accessSettings;
    assert.equal(settings.gcipSettings, undefined);
    assert.deepEqual(settings.reauthSettings, reauthSettings);
  }

  writeState();
  const failedCompensation = reconcile("external", {
    MOCK_FAIL_SET_CALLS: "2,3"
  });
  assert.notEqual(failedCompensation.status, 0);
  assert.match(
    failedCompensation.stderr,
    /::error::Compensating rollback of protected IAP identity settings failed/u
  );

  writeState({
    apiGcip: { tenantIds: [agentTenant], loginPageUri },
    frontendGcip: { tenantIds: [agentTenant], loginPageUri },
    apiReauth: null,
    frontendReauth: null
  });
  const unpinnedIamRollback = reconcile("iam", {
    IAP_GCIP_PROJECT_ID: "",
    IAP_EXTERNAL_LOGIN_PAGE_URI: ""
  });
  assert.notEqual(unpinnedIamRollback.status, 0);
  assert.match(unpinnedIamRollback.stderr, /unpinned or unknown GCIP configuration/u);
  assert.doesNotMatch(unpinnedIamRollback.log, /^settings:set:/mu);

  const iamRollback = reconcile("iam");
  assert.equal(iamRollback.status, 0, iamRollback.stderr);
  assert.equal(iamRollback.log.match(/^settings:set:/gmu)?.length, 2);
  for (const service of backendServices) {
    const settings = readSettings(service).accessSettings;
    assert.equal(settings.gcipSettings, undefined);
    assert.deepEqual(settings.reauthSettings, reauthSettings);
  }

  const idempotentIam = reconcile("iam", {
    IAP_GCIP_PROJECT_ID: "",
    IAP_EXTERNAL_LOGIN_PAGE_URI: ""
  });
  assert.equal(idempotentIam.status, 0, idempotentIam.stderr);
  assert.doesNotMatch(idempotentIam.log, /^settings:set:/mu);

  writeState({
    apiPolicy: { etag: "fixture-empty", bindings: [] },
    frontendPolicy: { etag: "fixture-empty", bindings: [] },
    apiReauth: null,
    frontendReauth: null
  });
  const initialIamBootstrap = reconcile("iam", {
    IAP_GCIP_PROJECT_ID: "",
    IAP_EXTERNAL_LOGIN_PAGE_URI: ""
  });
  assert.equal(initialIamBootstrap.status, 0, initialIamBootstrap.stderr);
  assert.equal(initialIamBootstrap.log.match(/^settings:set:/gmu)?.length, 2);
  for (const service of backendServices) {
    assert.deepEqual(readSettings(service).accessSettings.reauthSettings, reauthSettings);
  }

  writeState({
    apiGcip: { tenantIds: ["_999"], loginPageUri: "https://unknown.example.invalid/" }
  });
  const unknownGcip = reconcile("external");
  assert.notEqual(unknownGcip.status, 0);
  assert.match(unknownGcip.stderr, /Neither the exact IAM source state nor the exact external state/u);
  assert.doesNotMatch(unknownGcip.log, /^settings:set:/mu);

  writeState({ apiPolicy: approvedPolicy("group:unexpected@example.invalid") });
  const driftedRollbackPolicy = reconcile("external");
  assert.notEqual(driftedRollbackPolicy.status, 0);
  assert.match(driftedRollbackPolicy.stderr, /IAM rollback policy/u);
  assert.doesNotMatch(driftedRollbackPolicy.log, /^settings:set:/mu);

  writeState({
    frontendReauth: {
      method: "ENROLLED_SECOND_FACTORS",
      maxAge: "3600s",
      policyType: "MINIMUM"
    }
  });
  const driftedReauth = reconcile("external");
  assert.notEqual(driftedReauth.status, 0);
  assert.match(driftedReauth.stderr, /Neither the exact IAM source state nor the exact external state/u);
  assert.doesNotMatch(driftedReauth.log, /^settings:set:/mu);

  writeState({
    apiExtraAccess: {
      workforceIdentitySettings: {
        workforcePools: ["locations/global/workforcePools/unapproved"]
      }
    }
  });
  const workforceDrift = reconcile("external");
  assert.notEqual(workforceDrift.status, 0);
  assert.match(workforceDrift.stderr, /Workforce Identity/u);
  assert.doesNotMatch(workforceDrift.log, /^settings:set:/mu);

  writeState({
    apiExtraAccess: {
      identitySources: ["WORKFORCE_IDENTITY_FEDERATION"]
    }
  });
  const identitySourceDrift = reconcile("external");
  assert.notEqual(identitySourceDrift.status, 0);
  assert.match(identitySourceDrift.stderr, /identity-source settings/u);
  assert.doesNotMatch(identitySourceDrift.log, /^settings:set:/mu);

  console.log("IAP identity-mode reconcile tests passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
