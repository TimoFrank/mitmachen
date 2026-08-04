import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relativePath) => readFile(new URL(relativePath, root), "utf8");

const [
  deployment,
  service,
  serviceAccount,
  backendConfig,
  ingress,
  networkPolicy,
  values,
  valuesGcp,
  valuesSchema,
  identities,
  locals,
  armor,
  storage,
  outputs,
  workflow
] = await Promise.all([
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-service.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-serviceaccount.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/password-reset-broker-backendconfig.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/ingress.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml"),
  read("deploy/helm/versorgungs-kompass/values.yaml"),
  read("deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml"),
  read("deploy/helm/versorgungs-kompass/values.schema.json"),
  read("deploy/terraform/gcp-autopilot/identities.tf"),
  read("deploy/terraform/gcp-autopilot/locals.tf"),
  read("deploy/terraform/gcp-autopilot/password-reset-broker.tf"),
  read("deploy/terraform/gcp-autopilot/storage.tf"),
  read("deploy/terraform/gcp-autopilot/outputs.tf"),
  read(".github/workflows/deploy-pre-gematik.yml")
]);

assert.match(deployment, /command:\s*\n\s*- node\s*\n\s*- api\/password-reset-server\.mjs/u);
assert.match(deployment, /automountServiceAccountToken:/u);
assert.match(deployment, /config\.iapIdentityMode must be external/u);
assert.match(deployment, /config\.allowedOrigin must be the canonical HTTPS ingress origin/u);
for (const requiredEnvironment of [
  "PASSWORD_RESET_BROKER_ENABLED",
  "PASSWORD_RESET_ALLOWED_ORIGIN",
  "IAP_GCIP_PROJECT_ID",
  "IAP_GCIP_TENANT_ID",
  "IAP_EXTERNAL_AUTH_API_KEY",
  "PASSWORD_INVITATION_BUCKET"
]) {
  assert.match(deployment, new RegExp(`name: ${requiredEnvironment}`, "u"));
}
assert.doesNotMatch(
  deployment,
  /envFrom|secretKeyRef|DB_PASSWORD|DB_HOST|database|cloud-sql|storage|volumeMounts|\bvolumes:/iu,
  "Der Broker-Pod darf keine API-ConfigMap, Secrets, Datenbank-, Storage- oder Cloud-SQL-Anbindung erben."
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
assert.match(brokerNetworkPolicy, /metadataServer/u);
assert.doesNotMatch(
  brokerNetworkPolicy,
  /port:\s*(?:5432|3307)|cidr:\s*(?:10\.0\.0\.0\/8|172\.16\.0\.0\/12|192\.168\.0\.0\/16)/u,
  "Der Broker darf keinen privaten Datenbank-Egress besitzen."
);

assert.match(values, /passwordResetBroker:\s*\n\s*enabled: false/u);
assert.match(values, /passwordResetBroker:[\s\S]*invitationBucketName: ""/u);
assert.match(valuesGcp, /passwordResetBroker:[\s\S]*enabled: false[\s\S]*invitationBucketName: ""[\s\S]*securityPolicyName: vk-pre-gematik-password-reset/u);
assert.match(values, /passwordResetBroker:[\s\S]*?backendConfig:[\s\S]*?timeoutSec: 45/u);
assert.match(valuesGcp, /passwordResetBroker:[\s\S]*?backendConfig:[\s\S]*?timeoutSec: 45/u);
assert.match(valuesSchema, /"timeoutSec"[\s\S]*?"const": 45/u);
assert.match(valuesSchema, /"invitationBucketName"[\s\S]*"pattern": "\^\$\|\^\[a-z0-9\]/u);

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
assert.match(storage, /objects\/prepared\//u);
assert.match(storage, /objects\/active\//u);
assert.match(storage, /resource "google_storage_bucket_iam_policy" "password_invitation"/u);
assert.match(outputs, /output "PASSWORD_INVITATION_BUCKET" \{[\s\S]*google_storage_bucket\.password_invitation\.name/u);

assert.match(armor, /action\s*=\s*"rate_based_ban"/u);
assert.match(armor, /request\.path == '\/api\/auth\/password-reset'/u);
assert.match(armor, /request\.method == 'POST'/u);
assert.match(armor, /IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME/u);
assert.match(armor, /enforce_on_key\s*=\s*"IP"/u);
assert.match(armor, /action\s*=\s*"deny\(404\)"/u);

assert.match(workflow, /password_reset_broker_enabled="false"[\s\S]*IAP_IDENTITY_MODE" == "external"[\s\S]*password_reset_broker_enabled="true"/u);
assert.match(workflow, /--set passwordResetBroker\.enabled="\$password_reset_broker_enabled"/u);
assert.match(workflow, /PASSWORD_INVITATION_BUCKET:\s*\$\{\{ vars\.PASSWORD_INVITATION_BUCKET \}\}/u);
assert.match(workflow, /--set-string passwordResetBroker\.invitationBucketName="\$PASSWORD_INVITATION_BUCKET"/u);
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

console.log("Password-reset deployment contract checks passed.");
