import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relativePath) => readFile(new URL(relativePath, root), "utf8");

const [
  dockerignore,
  dockerfile,
  server,
  deployment,
  service,
  serviceAccount,
  backendConfig,
  ingress,
  networkPolicy,
  secretSync,
  values,
  valuesGcp,
  valuesSchema,
  variables,
  secretsTerraform,
  identities,
  locals,
  armor,
  storage,
  outputs,
  terraformExample,
  environmentExample,
  workflow,
  deploymentGuide
] = await Promise.all([
  read(".dockerignore"),
  read("api/Dockerfile"),
  read("api/password-reset-server.mjs"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-service.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-serviceaccount.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-backendconfig.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/ingress.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/secretsync.yaml"),
  read("deploy/helm/versorgungs-kompass/values.yaml"),
  read("deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml"),
  read("deploy/helm/versorgungs-kompass/values.schema.json"),
  read("deploy/terraform/gcp-autopilot/variables.tf"),
  read("deploy/terraform/gcp-autopilot/secrets.tf"),
  read("deploy/terraform/gcp-autopilot/identities.tf"),
  read("deploy/terraform/gcp-autopilot/locals.tf"),
  read("deploy/terraform/gcp-autopilot/password-reset-broker.tf"),
  read("deploy/terraform/gcp-autopilot/storage.tf"),
  read("deploy/terraform/gcp-autopilot/outputs.tf"),
  read("deploy/terraform/gcp-autopilot/terraform.tfvars.example"),
  read("config/pre-gematik/variables.env.example"),
  read(".github/workflows/deploy-pre-gematik.yml"),
  read("dokumentation/betrieb-und-deployment/DEPLOYMENT_GCP_AUTOPILOT.md")
]);

const resetImagePaths = [
  "config/pre-gematik/email/pre-gematik-password-reset.html",
  "config/pre-gematik/email/pre-gematik-password-reset.txt",
  "config/pre-gematik/email/assets/versorgungs-kompass-mark-on-dark.png",
  "config/pre-gematik/email/assets/stakeholder-mark-on-dark.png",
  "config/pre-gematik/email/assets/hospitation-mark-on-dark.png",
  "config/pre-gematik/email/assets/formate-mark-on-dark.png"
];
for (const imagePath of resetImagePaths) {
  const escapedImagePath = imagePath.replaceAll(".", "\\.");
  assert.match(dockerfile, new RegExp(`COPY ${escapedImagePath}`, "u"));
  assert.match(dockerignore, new RegExp(`^!${escapedImagePath}$`, "mu"));
}
assert.doesNotMatch(dockerignore, /^!config\/pre-gematik\/email\/\*\*$/mu);

assert.match(server, /const SHUTDOWN_TIMEOUT_MS = 25_000;/u);

assert.match(deployment, /command:\s*\n\s*- node\s*\n\s*- api\/password-reset-server\.mjs/u);
assert.match(deployment, /automountServiceAccountToken:/u);
assert.match(deployment, /terminationGracePeriodSeconds: \{\{ \.Values\.terminationGracePeriodSeconds \}\}/u);
assert.match(deployment, /config\.iapIdentityMode must be external/u);
assert.match(deployment, /config\.allowedOrigin must be the canonical HTTPS ingress origin/u);
for (const requiredEnvironment of [
  "PASSWORD_RESET_BROKER_ENABLED",
  "PASSWORD_RESET_ALLOWED_ORIGIN",
  "IAP_GCIP_PROJECT_ID",
  "IAP_GCIP_TENANT_ID",
  "IAP_EXTERNAL_AUTH_API_KEY",
  "PASSWORD_INVITATION_BUCKET",
  "PASSWORD_RESET_SMTP_PASSWORD"
]) {
  assert.match(deployment, new RegExp(`name: ${requiredEnvironment}`, "u"));
}
assert.match(deployment, /passwordResetBroker\.email\.enabled must be true when passwordResetBroker\.enabled is true/u);
assert.match(
  deployment,
  /name: PASSWORD_RESET_SMTP_PASSWORD\s+valueFrom:\s+secretKeyRef:\s+name: \{\{ required "passwordResetBroker\.email\.secretName is required[^"]*" \.Values\.passwordResetBroker\.email\.secretName \| quote \}\}\s+key: \{\{ required "passwordResetBroker\.email\.secretKey is required[^"]*" \.Values\.passwordResetBroker\.email\.secretKey \| quote \}\}/u
);
assert.equal(
  [...deployment.matchAll(/secretKeyRef:/gu)].length,
  1,
  "Der Broker darf genau das dedizierte SMTP-Passwort-Secret referenzieren."
);
assert.doesNotMatch(
  deployment,
  /envFrom|DB_PASSWORD|DB_HOST|database|cloud-sql|storage|volumeMounts|\bvolumes:/iu,
  "Der Broker-Pod darf keine API-ConfigMap, Datenbank-, Storage- oder Cloud-SQL-Anbindung erben."
);

assert.match(service, /cloud\.google\.com\/neg/u);
assert.match(service, /passwordResetBrokerSelectorLabels/u);
assert.match(serviceAccount, /automountServiceAccountToken:/u);
assert.match(backendConfig, /iap:\s*\n\s*enabled: false/u);
assert.match(backendConfig, /logging:\s*\n\s*enable: false/u);
assert.match(backendConfig, /securityPolicy:/u);
assert.match(backendConfig, /X-Password-Reset-Client-IP:\{client_ip_address\}/u);

assert.match(
  ingress,
  /if and \$\.Values\.passwordResetBroker\.enabled \(eq \$host \$\.Values\.ingress\.host\)[\s\S]*path: \/api\/auth\/password-reset\s+pathType: Exact[\s\S]*passwordResetBrokerFullname/u
);
assert.doesNotMatch(
  ingress,
  /path:\s*\/api\/auth\/password-reset\s+pathType:\s*Prefix/u
);

const brokerNetworkPolicy = networkPolicy.match(
  /\{\{- if \.Values\.passwordResetBroker\.enabled \}\}[\s\S]*?app\.kubernetes\.io\/component: password-reset-broker[\s\S]*?(?=\{\{- end \}\}\s*\n\{\{- if \.Values\.frontend\.enabled)/u
)?.[0];
assert.ok(brokerNetworkPolicy, "Die eigene Broker-NetworkPolicy fehlt.");
assert.match(brokerNetworkPolicy, /port: 53/u);
assert.match(brokerNetworkPolicy, /port: 443/u);
assert.match(brokerNetworkPolicy, /protocol: TCP\s+port: 465/u);
assert.match(brokerNetworkPolicy, /metadataServer/u);
assert.deepEqual(
  [...brokerNetworkPolicy.matchAll(/port:\s*([0-9]+)/gu)]
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right),
  [53, 53, 80, 443, 465, 987, 988, 8080],
  "Der Broker-Egress darf neben DNS, HTTPS und Metadata Server ausschließlich SMTPS auf TCP 465 öffnen."
);
assert.doesNotMatch(brokerNetworkPolicy, /port:\s*(?:25|587|2525)/u);
assert.doesNotMatch(
  brokerNetworkPolicy,
  /port:\s*(?:5432|3307)|cidr:\s*(?:10\.0\.0\.0\/8|172\.16\.0\.0\/12|192\.168\.0\.0\/16)/u,
  "Der Broker darf keinen privaten Datenbank-Egress besitzen."
);
const apiNetworkPolicy = networkPolicy.slice(0, networkPolicy.indexOf("{{- if .Values.passwordResetBroker.enabled }}"));
assert.doesNotMatch(
  apiNetworkPolicy,
  /port:\s*465/u,
  "Der allgemeine API-Pod darf keinen SMTP-Egress erhalten."
);

assert.match(values, /passwordResetBroker:\s*\n\s*enabled: false/u);
assert.match(values, /terminationGracePeriodSeconds: 30/u);
assert.match(values, /passwordResetBroker:[\s\S]*invitationBucketName: ""/u);
assert.match(values, /passwordResetBroker:[\s\S]*?email:\s*\n\s*enabled: false\s*\n\s*secretName: ""\s*\n\s*secretKey: "password"/u);
assert.match(valuesGcp, /passwordResetBroker:[\s\S]*enabled: false[\s\S]*invitationBucketName: ""[\s\S]*securityPolicyName: vk-pre-gematik-password-reset/u);
assert.match(valuesGcp, /passwordResetBroker:[\s\S]*?email:\s*\n\s*enabled: false\s*\n\s*secretName: vk-pre-gematik-password-reset-smtp-password\s*\n\s*secretKey: password/u);
assert.match(values, /passwordResetBroker:[\s\S]*?backendConfig:[\s\S]*?timeoutSec: 45/u);
assert.match(valuesGcp, /passwordResetBroker:[\s\S]*?backendConfig:[\s\S]*?timeoutSec: 45/u);
assert.match(valuesSchema, /"timeoutSec"[\s\S]*?"const": 45/u);
assert.match(valuesSchema, /"invitationBucketName"[\s\S]*"pattern": "\^\$\|\^\[a-z0-9\]/u);
assert.match(valuesSchema, /"email": \{[\s\S]*?"additionalProperties": false[\s\S]*?"required": \[[\s\S]*?"enabled"[\s\S]*?"secretName"[\s\S]*?"secretKey"[\s\S]*?\]/u);
assert.match(valuesSchema, /"email": \{[\s\S]*?"enabled": \{\s*"const": true/u);

assert.match(secretSync, /kind: SecretProviderClass[\s\S]*passwordResetBrokerSecretProviderClassName/u);
assert.match(
  secretSync,
  /secrets\/\{\{ required "passwordResetBroker\.email\.secretName is required" \.Values\.passwordResetBroker\.email\.secretName \}\}\/versions/u
);
assert.match(secretSync, /path: "smtp-password"/u);
assert.match(secretSync, /kind: SecretSync[\s\S]*serviceAccountName: \{\{ include "versorgungs-kompass\.passwordResetBrokerServiceAccountName" \. \}\}/u);
assert.match(secretSync, /targetKey: \{\{ required "passwordResetBroker\.email\.secretKey is required"/u);

assert.match(variables, /variable "PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME"/u);
assert.match(variables, /default\s*=\s*"vk-pre-gematik-password-reset-smtp-password"/u);
assert.match(variables, /length\(var\.PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME\) <= 63/u);
assert.match(secretsTerraform, /resource "google_secret_manager_secret" "password_reset_smtp_password"/u);
assert.match(secretsTerraform, /secret_id\s*=\s*var\.PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME/u);
assert.doesNotMatch(
  secretsTerraform,
  /google_secret_manager_secret_version/u,
  "Terraform darf keine SMTP-Passwortversion in den State schreiben."
);
const smtpSecretBinding = secretsTerraform.match(
  /resource "google_secret_manager_secret_iam_member" "password_reset_smtp_password_workload" \{[\s\S]*?\n\}/u
)?.[0];
assert.ok(smtpSecretBinding, "Die secret-spezifische SMTP-Zugriffsbindung fehlt.");
assert.match(smtpSecretBinding, /secret_id\s*=\s*google_secret_manager_secret\.password_reset_smtp_password\.secret_id/u);
assert.match(smtpSecretBinding, /role\s*=\s*"roles\/secretmanager\.secretAccessor"/u);
assert.match(smtpSecretBinding, /member\s*=\s*local\.gke_password_reset_workload_principal/u);
assert.doesNotMatch(smtpSecretBinding, /deployer|gke_api_workload_principal/u);
assert.match(terraformExample, /PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME\s*=\s*"vk-pre-gematik-password-reset-smtp-password"/u);
assert.match(environmentExample, /PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME=vk-pre-gematik-password-reset-smtp-password/u);

const roleBlock = identities.match(
  /resource "google_project_iam_custom_role" "password_reset_broker" \{[\s\S]*?\n\}/u
)?.[0];
assert.ok(roleBlock, "Die eigene Identity-Platform-Custom-Role fehlt.");
const permissions = [...roleBlock.matchAll(/"(firebaseauth\.[^"]+)"/gu)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(permissions, [
  "firebaseauth.users.get",
  "firebaseauth.users.sendEmail"
]);
assert.match(identities, /member\s*=\s*local\.gke_password_reset_workload_principal/u);
assert.match(locals, /sa\/\$\{local\.password_reset_ksa_name\}/u);
assert.match(locals, /password_invitation_bucket\s*=\s*"\$\{var\.GCP_PROJECT_ID\}-vk-pre-gematik-invitations"/u);

const storageRoleBlock = identities.match(
  /resource "google_project_iam_custom_role" "password_invitation_broker_storage" \{[\s\S]*?\n\}/u
)?.[0];
assert.ok(storageRoleBlock, "Die eigene Storage-Custom-Role für Einladungen fehlt.");
const storagePermissions = [...storageRoleBlock.matchAll(/"(storage\.[^"]+)"/gu)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(storagePermissions, [
  "storage.objects.delete",
  "storage.objects.get"
]);
assert.doesNotMatch(storageRoleBlock, /storage\.objects\.(?:create|list|update)/u);

const operatorStorageRoleBlock = identities.match(
  /resource "google_project_iam_custom_role" "password_invitation_operator_storage" \{[\s\S]*?\n\}/u
)?.[0];
assert.ok(operatorStorageRoleBlock, "Die getrennte Storage-Custom-Role für Einladungsoperatoren fehlt.");
const operatorStoragePermissions = [...operatorStorageRoleBlock.matchAll(/"(storage\.[^"]+)"/gu)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(operatorStoragePermissions, [
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.get"
]);
assert.doesNotMatch(operatorStorageRoleBlock, /storage\.objects\.(?:list|update|restore)/u);

const policyAdminRoleBlock = identities.match(
  /resource "google_project_iam_custom_role" "password_invitation_policy_admin" \{[\s\S]*?\n\}/u
)?.[0];
assert.ok(policyAdminRoleBlock, "Die getrennte Policy-Admin-Rolle für den Einladungs-Bucket fehlt.");
const policyAdminPermissions = [...policyAdminRoleBlock.matchAll(/"(storage\.[^"]+)"/gu)]
  .map((match) => match[1])
  .sort();
assert.deepEqual(policyAdminPermissions, [
  "storage.buckets.get",
  "storage.buckets.getIamPolicy",
  "storage.buckets.setIamPolicy"
]);
assert.doesNotMatch(policyAdminRoleBlock, /storage\.objects\./u);
assert.match(variables, /variable "PASSWORD_INVITATION_POLICY_ADMIN_MEMBERS"/u);
assert.match(
  variables,
  /length\(var\.PASSWORD_INVITATION_POLICY_ADMIN_MEMBERS\) > 0/u,
  "Mindestens ein expliziter Policy-Administrator muss Pflicht sein."
);
assert.match(variables, /PASSWORD_INVITATION_POLICY_ADMIN_MEMBERS requires at least one explicit user: principal/u);

assert.match(storage, /resource "google_storage_bucket" "password_invitation" \{/u);
assert.match(
  storage,
  /resource "google_storage_bucket" "password_invitation" \{[\s\S]*name\s*=\s*local\.password_invitation_bucket[\s\S]*location\s*=\s*var\.GCP_REGION[\s\S]*uniform_bucket_level_access\s*=\s*true[\s\S]*public_access_prevention\s*=\s*"enforced"[\s\S]*force_destroy\s*=\s*false/u
);
assert.match(storage, /versioning \{\s*enabled = false\s*\}/u);
assert.match(storage, /soft_delete_policy \{\s*retention_duration_seconds = 0\s*\}/u);
assert.match(storage, /lifecycle_rule \{[\s\S]*type = "Delete"[\s\S]*age = 3[\s\S]*\}/u);
const invitationPolicyStart = storage.indexOf('data "google_iam_policy" "password_invitation"');
const invitationPolicyEnd = storage.indexOf(
  'resource "google_storage_bucket_iam_policy" "password_invitation"',
  invitationPolicyStart
);
const invitationPolicySource = invitationPolicyStart >= 0 && invitationPolicyEnd > invitationPolicyStart
  ? storage.slice(invitationPolicyStart, invitationPolicyEnd)
  : "";
assert.ok(invitationPolicySource, "Die autoritative Einladungs-Bucket-Policy fehlt.");
assert.match(storage, /role\s*=\s*google_project_iam_custom_role\.password_invitation_broker_storage\.name/u);
assert.match(storage, /members\s*=\s*\[local\.gke_password_reset_workload_principal\]/u);
assert.match(
  storage,
  /resource\.name\.startsWith\('projects\/_\/buckets\/\$\{google_storage_bucket\.password_invitation\.name\}\/objects\/active\/'\)/u
);
assert.doesNotMatch(
  invitationPolicySource,
  /roles\/storage\.objectAdmin|google_service_account\.deployer/u,
  "Der GitHub-Deployer darf keine direkten GCS-Rechte auf Einladungsobjekte erhalten."
);
assert.match(storage, /password_invitation_operator_storage\.name/u);
assert.match(storage, /PASSWORD_INVITATION_OPERATOR_MEMBERS/u);
assert.match(storage, /password_invitation_policy_admin\.name/u);
assert.match(storage, /PASSWORD_INVITATION_POLICY_ADMIN_MEMBERS/u);
assert.match(storage, /objects\/prepared\//u);
assert.match(storage, /objects\/active\//u);
assert.match(storage, /resource "google_storage_bucket_iam_policy" "password_invitation"/u);
assert.match(outputs, /output "PASSWORD_INVITATION_BUCKET" \{[\s\S]*google_storage_bucket\.password_invitation\.name/u);
assert.match(deploymentGuide, /temporary_password_invitation_policy_recovery/u);
assert.match(deploymentGuide, /request\.time < timestamp/u);
assert.match(deploymentGuide, /terraform untaint google_storage_bucket_iam_policy\.password_invitation/u);
assert.match(
  deploymentGuide,
  /terraform plan \\\n\s+-target=google_storage_bucket_iam_policy\.password_invitation \\\n\s+-out=password-invitation-policy-recovery\.tfplan/u
);
assert.match(deploymentGuide, /Ein Full-Root-Abgleich erfolgt getrennt/u);
assert.match(deploymentGuide, /\(\$changes\[0\]\.change\.after\.policy_data \| fromjson\) as \$policy/u);
assert.match(deploymentGuide, /\(\(\$changes \| length\) == 1\)/u);
assert.match(
  deploymentGuide,
  /\$changes\[0\]\.address == "google_storage_bucket_iam_policy\.password_invitation"/u
);
assert.match(deploymentGuide, /\$changes\[0\]\.change\.actions == \["update"\]/u);
assert.match(deploymentGuide, /all\(\. != "delete"\)/u);
assert.match(deploymentGuide, /\(\$policy\.bindings \| length\) == 3/u);
assert.match(deploymentGuide, /preGematikPasswordInvitationBroker/u);
assert.match(deploymentGuide, /preGematikPasswordInvitationOperator/u);
assert.match(deploymentGuide, /preGematikPasswordInvitationPolicyAdmin/u);
assert.match(deploymentGuide, /active-password-invitations-only/u);
assert.match(deploymentGuide, /password-invitation-operators-only/u);
assert.match(deploymentGuide, /github-pre-gematik-deployer@/u);
assert.match(deploymentGuide, /bytegenau mit den\s+freigegebenen owner-only Eingabevariablen abzugleichen/u);
assert.match(deploymentGuide, /Jede weitere Adresse oder jede `delete`-Aktion stoppt den Ablauf/u);

const recoveryGateMatch = deploymentGuide.match(
  /# BEGIN PASSWORD_INVITATION_RECOVERY_PLAN_GATE\n([\s\S]*?)\n\s*# END PASSWORD_INVITATION_RECOVERY_PLAN_GATE/u
);
assert.ok(recoveryGateMatch, "Das ausfuehrbare Recovery-Plan-Gate fehlt im Runbook.");
const recoveryGate = recoveryGateMatch[1];
const recoveryProjectId = "example-project";
const recoveryProjectNumber = "123456789";
const recoveryBucket = "example-password-invitations";
const recoveryBrokerRole = `projects/${recoveryProjectId}/roles/preGematikPasswordInvitationBroker`;
const recoveryOperatorRole = `projects/${recoveryProjectId}/roles/preGematikPasswordInvitationOperator`;
const recoveryAdminRole = `projects/${recoveryProjectId}/roles/preGematikPasswordInvitationPolicyAdmin`;
const recoveryBrokerPrincipal =
  `principal://iam.googleapis.com/projects/${recoveryProjectNumber}/locations/global/` +
  `workloadIdentityPools/${recoveryProjectId}.svc.id.goog/subject/ns/pre-gematik/` +
  "sa/versorgungs-kompass-password-reset";
const recoveryBrokerCondition =
  `resource.name.startsWith('projects/_/buckets/${recoveryBucket}/objects/active/')`;
const recoveryOperatorCondition =
  `resource.name.startsWith('projects/_/buckets/${recoveryBucket}/objects/prepared/') || ` +
  `resource.name.startsWith('projects/_/buckets/${recoveryBucket}/objects/active/')`;
const recoveryPolicy = {
  bindings: [
    {
      role: recoveryBrokerRole,
      members: [recoveryBrokerPrincipal],
      condition: {
        title: "active-password-invitations-only",
        expression: recoveryBrokerCondition
      }
    },
    {
      role: recoveryOperatorRole,
      members: ["user:invitation-operator@example.invalid"],
      condition: {
        title: "password-invitation-operators-only",
        expression: recoveryOperatorCondition
      }
    },
    {
      role: recoveryAdminRole,
      members: ["user:invitation-policy-admin@example.invalid"]
    }
  ]
};
const recoveryPlan = (policy = recoveryPolicy, actions = ["update"]) => ({
  resource_changes: [
    {
      address: "google_storage_bucket_iam_policy.password_invitation",
      change: {
        actions,
        after: { policy_data: JSON.stringify(policy) }
      }
    }
  ]
});
const runRecoveryGate = (plan) => {
  const result = spawnSync(
    "jq",
    [
      "--exit-status",
      "--arg", "project_id", recoveryProjectId,
      "--arg", "project_number", recoveryProjectNumber,
      "--arg", "bucket", recoveryBucket,
      recoveryGate
    ],
    { input: JSON.stringify(plan), encoding: "utf8" }
  );
  assert.ifError(result.error);
  return result;
};
const expectRecoveryGateRejects = (label, plan) => {
  const result = runRecoveryGate(plan);
  assert.notEqual(result.status, 0, `${label} darf das Recovery-Plan-Gate nicht passieren.`);
};

assert.equal(
  runRecoveryGate(recoveryPlan()).status,
  0,
  "Die exakte sichere Einladungs-Policy muss das Recovery-Plan-Gate passieren."
);

const recoveryPlanWithExtraResource = structuredClone(recoveryPlan());
recoveryPlanWithExtraResource.resource_changes.push({
  address: "google_storage_bucket.unrelated",
  change: { actions: ["update"], after: {} }
});
expectRecoveryGateRejects("Eine zusaetzliche Ressource", recoveryPlanWithExtraResource);
expectRecoveryGateRejects("Eine Delete-/Create-Aktion", recoveryPlan(recoveryPolicy, ["delete", "create"]));

const broadConditionPolicy = structuredClone(recoveryPolicy);
broadConditionPolicy.bindings[0].condition.expression = `true || ${recoveryBrokerCondition}`;
expectRecoveryGateRejects("Eine immer wahre Broker-Condition", recoveryPlan(broadConditionPolicy));

const foreignPrincipalPolicy = structuredClone(recoveryPolicy);
foreignPrincipalPolicy.bindings[0].members = [recoveryBrokerPrincipal.replace(
  `/projects/${recoveryProjectNumber}/`,
  "/projects/987654321/"
)];
expectRecoveryGateRejects("Ein fremder Workload-Identity-Pool", recoveryPlan(foreignPrincipalPolicy));

const emptyOperatorPolicy = structuredClone(recoveryPolicy);
emptyOperatorPolicy.bindings[1].members = [];
expectRecoveryGateRejects("Eine leere Operator-Bindung", recoveryPlan(emptyOperatorPolicy));

const deployerOperatorPolicy = structuredClone(recoveryPolicy);
deployerOperatorPolicy.bindings[1].members = [
  "serviceAccount:github-pre-gematik-deployer@example-project.iam.gserviceaccount.com"
];
expectRecoveryGateRejects("Der GitHub-Deployer als Operator", recoveryPlan(deployerOperatorPolicy));

const conditionedAdminPolicy = structuredClone(recoveryPolicy);
conditionedAdminPolicy.bindings[2].condition = {
  title: "unexpected-admin-condition",
  expression: "true"
};
expectRecoveryGateRejects("Eine konditionierte Policy-Admin-Bindung", recoveryPlan(conditionedAdminPolicy));
assert.match(deploymentGuide, /gcloud projects remove-iam-policy-binding/u);
assert.match(deploymentGuide, /mittelbar neue\s+Objektrechte vergeben/u);
assert.match(deploymentGuide, /Der State darf nicht mehr `tainted` sein/u);
assert.match(deploymentGuide, /Schritt 5 darf nicht ausgeführt werden/u);
assert.match(deploymentGuide, /Einpersonen-Pilot darf dieselbe namentliche Person\s+in beiden Listen stehen/u);

assert.match(armor, /action\s*=\s*"rate_based_ban"/u);
assert.match(armor, /request\.path == '\/api\/auth\/password-reset'/u);
assert.match(armor, /request\.method == 'POST'/u);
assert.match(armor, /IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME/u);
assert.match(armor, /enforce_on_key\s*=\s*"IP"/u);
assert.match(armor, /action\s*=\s*"deny\(404\)"/u);

assert.match(workflow, /password_reset_broker_enabled="false"[\s\S]*IAP_IDENTITY_MODE" == "external"[\s\S]*password_reset_broker_enabled="true"/u);
assert.match(workflow, /PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME:\s*\$\{\{ vars\.PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME \}\}/u);
assert.match(workflow, /PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME must be a lower-case Secret Manager ID that is also a valid Kubernetes Secret name/u);
assert.match(workflow, /The password-reset SMTP password must use its own dedicated secret identity/u);
assert.match(workflow, /--set passwordResetBroker\.enabled="\$password_reset_broker_enabled"/u);
assert.match(workflow, /PASSWORD_INVITATION_BUCKET:\s*\$\{\{ vars\.PASSWORD_INVITATION_BUCKET \}\}/u);
assert.match(workflow, /--set-string passwordResetBroker\.invitationBucketName="\$PASSWORD_INVITATION_BUCKET"/u);
assert.match(workflow, /--set passwordResetBroker\.email\.enabled="\$password_reset_broker_enabled"/u);
assert.match(workflow, /--set-string passwordResetBroker\.email\.secretName="\$PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME"/u);
assert.match(workflow, /--set-string passwordResetBroker\.email\.secretKey=password/u);
assert.match(workflow, /get secretproviderclass[\s\S]*password_reset_secret_provider_class_name/u);
assert.match(workflow, /projects\/\$\{GCP_PROJECT_ID\}\/secrets\/\$\{PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME\}\/versions\/latest/u);
assert.match(workflow, /get secretsync[\s\S]*PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME/u);
assert.match(workflow, /\.spec\.serviceAccountName == \$expected_ksa/u);
assert.match(workflow, /get secret "\$PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME"[\s\S]*\(\(\.data \| keys\) == \["password"\]\)/u);
assert.match(workflow, /softDeletePolicy\.retentionDurationSeconds[\s\S]*== "0"/u);
assert.match(workflow, /password_reset_service_name="\$\{HELM_RELEASE\}-password-reset"/u);
assert.match(workflow, /resolve_backend_for_service "\$password_reset_service_name"/u);
assert.match(workflow, /services_for\(\$canonical_host; "\/api\/auth\/password-reset"; "Exact"\)/u);
assert.match(workflow, /password_reset_backend_is_hardened/u);
assert.match(workflow, /password_reset_backend_state[\s\S]*\.timeoutSec == 45/u);
assert.match(workflow, /password_reset_response[\s\S]*not-an-email[\s\S]*\{"accepted":true\}/u);
assert.match(
  workflow,
  /backend_services=\("\$backend_service" "\$frontend_backend_service"\)/u,
  "Nur die beiden geschützten Backends dürfen in die IAP-Reconcile-Schleifen gelangen."
);
assert.doesNotMatch(
  workflow.match(/backend_services=\([^\n]+\)/u)?.[0] || "",
  /password_reset/u,
  "Der absichtlich IAP-freie Broker darf nie Teil des IAP-Reconcile-Arrays werden."
);
assert.match(deploymentGuide, /w01abca0\.kasserver\.com:465/u);
assert.match(deploymentGuide, /zugang@versorgungs-kompass\.de/u);
assert.match(deploymentGuide, /PASSWORD_RESET_SMTP_PASSWORD_SECRET_NAME/u);
assert.match(deploymentGuide, /Nur die Passwort-Reset-Workload-Identity erhält `roles\/secretmanager\.secretAccessor` auf genau diesem Secret/u);
assert.match(deploymentGuide, /PASSWORD_RESET_SMTP_PASSWORD` wird erst beim Start eines neuen Broker-Pods/u);
assert.match(deploymentGuide, /rollout restart deployment\/versorgungs-kompass-password-reset/u);
assert.match(deploymentGuide, /rollout status deployment\/versorgungs-kompass-password-reset --timeout=10m/u);

console.log("Password-reset deployment contract checks passed.");
