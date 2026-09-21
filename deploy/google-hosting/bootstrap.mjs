// Additive Einrichtung: keine Löschungen, keine Änderung bestehender Nutzer,
// Datenbanken oder DNS-Einträge. Bestehende IAM-Bindungen bleiben erhalten.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { googleApi, addBinding } from "./google-api.mjs";
import { renderGoogleServices } from "./render.mjs";

const [filename, mode] = process.argv.slice(2);
if (!filename || mode !== "--apply") throw new Error("Explizite Konfigurationsdatei und --apply erforderlich.");
const config = JSON.parse(fs.readFileSync(filename, "utf8"));
renderGoogleServices(config);
const { project, region, network, subnet, stateBucket, invitationBucket } = config;
if (stateBucket.includes("google") || !/^10\.[0-9]+\.[0-9]+\.0\/24$/u.test(config.subnetCidr || "")) throw new Error("Separates /24-Netz und gültiger Zustandsbucket erforderlich.");
if (!/^(user|serviceAccount):[^\s]+@[^\s]+$/u.test(config.policyAdminMember || "")) throw new Error("Der zuständige Infrastruktur-Administrator muss explizit benannt sein.");
const api = googleApi(project);
const gcloud = process.env.GCLOUD_BIN || "gcloud";
execFileSync(gcloud, ["services", "enable", "run.googleapis.com", "firebasehosting.googleapis.com", "identitytoolkit.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "--project", project, "--quiet"], { stdio: "inherit" });
const iam = `https://iam.googleapis.com/v1/projects/${project}`;
const accounts = ["vk-google-api", "vk-google-password-reset"];
for (const accountId of accounts) {
  if (!(await api(`${iam}/serviceAccounts/${accountId}@${project}.iam.gserviceaccount.com`, { allow404: true }))) {
    await api(`${iam}/serviceAccounts`, { method: "POST", body: { accountId, serviceAccount: { displayName: accountId } } });
  }
}
const roleId = "vkGoogleSessionVerifier";
const roleUrl = `${iam}/roles/${roleId}`;
const role = { title: "Google Hosting session verification", description: "Verify existing users and create signed sessions; no user or account changes.", stage: "GA", includedPermissions: ["firebaseauth.users.get", "firebaseauth.users.createSession"] };
const existingRole = await api(roleUrl, { allow404: true });
if (existingRole) {
  if (JSON.stringify([...existingRole.includedPermissions].sort()) !== JSON.stringify([...role.includedPermissions].sort())) throw new Error("Bestehende Sitzungsrolle weicht ab; kein stilles Überschreiben.");
} else await api(`${iam}/roles`, { method: "POST", body: { roleId, role } });
const apiMember = `serviceAccount:${accounts[0]}@${project}.iam.gserviceaccount.com`;
const resetMember = `serviceAccount:${accounts[1]}@${project}.iam.gserviceaccount.com`;
const projectUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`;
const policy = await api(`${projectUrl}:getIamPolicy`, { method: "POST", body: { options: { requestedPolicyVersion: 3 } } });
addBinding(policy, `projects/${project}/roles/${roleId}`, apiMember);
addBinding(policy, "roles/cloudsql.client", apiMember);
addBinding(policy, `projects/${project}/roles/preGematikPasswordResetBroker`, resetMember);
await api(`${projectUrl}:setIamPolicy`, { method: "POST", body: { policy } });

const subnetUrl = `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/subnetworks/${subnet}`;
const existingSubnet = await api(subnetUrl, { allow404: true });
if (existingSubnet) {
  if (existingSubnet.ipCidrRange !== config.subnetCidr || !existingSubnet.network.endsWith(`/networks/${network}`)) throw new Error("Das vorhandene Teilnetz passt nicht zur Konfiguration.");
} else await api(subnetUrl.slice(0, subnetUrl.lastIndexOf("/")), { method: "POST", body: { name: subnet, network: `projects/${project}/global/networks/${network}`, ipCidrRange: config.subnetCidr, privateIpGoogleAccess: true } });

const storage = "https://storage.googleapis.com/storage/v1/b";
const existingBucket = await api(`${storage}/${stateBucket}`, { allow404: true });
if (!existingBucket) {
  await api(`${storage}?project=${project}`, { method: "POST", body: { name: stateBucket, location: region, storageClass: "STANDARD", iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: "enforced" }, versioning: { enabled: false }, softDeletePolicy: { retentionDurationSeconds: "0" }, lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 2 } }] } } });
  await api(`${storage}/${stateBucket}/iam`, { method: "PUT", body: { version: 3, bindings: [
    { role: "roles/storage.objectUser", members: [apiMember, resetMember] },
    { role: `projects/${project}/roles/preGematikPasswordInvitationPolicyAdmin`, members: [config.policyAdminMember] }
  ] } });
} else if (existingBucket.iamConfiguration?.publicAccessPrevention !== "enforced" || !existingBucket.iamConfiguration?.uniformBucketLevelAccess?.enabled || existingBucket.versioning?.enabled || existingBucket.lifecycle?.rule?.[0]?.condition?.age !== 2) {
  throw new Error("Der bestehende Zustandsbucket erfüllt den Schutz- und Löschvertrag nicht.");
}
const statePolicy = await api(`${storage}/${stateBucket}/iam?optionsRequestedPolicyVersion=3`);
if (statePolicy.bindings.some((binding) => binding.members.some((member) => ["allUsers", "allAuthenticatedUsers"].includes(member)) || binding.role.startsWith("roles/storage.legacy"))) throw new Error("Unerwartet breite Rechte im Zustandsbucket.");
addBinding(statePolicy, "roles/storage.objectUser", apiMember);
addBinding(statePolicy, "roles/storage.objectUser", resetMember);
addBinding(statePolicy, `projects/${project}/roles/preGematikPasswordInvitationPolicyAdmin`, config.policyAdminMember);
await api(`${storage}/${stateBucket}/iam`, { method: "PUT", body: statePolicy });
for (const [key, bucket] of Object.entries(config.buckets)) {
  const url = `${storage}/${bucket}/iam`;
  const previous = await api(`${url}?optionsRequestedPolicyVersion=3`);
  addBinding(previous, key === "stakeholderLogos" ? "roles/storage.objectViewer" : "roles/storage.objectUser", apiMember);
  await api(url, { method: "PUT", body: previous });
}
const invitationUrl = `${storage}/${invitationBucket}/iam`;
const invitations = await api(`${invitationUrl}?optionsRequestedPolicyVersion=3`);
addBinding(invitations, `projects/${project}/roles/preGematikPasswordInvitationBroker`, resetMember, {
  title: "active-password-invitations-only", description: "The public broker may read and consume only active invitation objects.",
  expression: `resource.name.startsWith('projects/_/buckets/${invitationBucket}/objects/active/')`
});
await api(invitationUrl, { method: "PUT", body: invitations });
for (const [secret, member] of [[config.databaseSecret.name, apiMember], [config.smtpSecret.name, resetMember]]) {
  const url = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${secret}`;
  const previous = await api(`${url}:getIamPolicy?options.requestedPolicyVersion=3`);
  addBinding(previous, "roles/secretmanager.secretAccessor", member);
  await api(`${url}:setIamPolicy`, { method: "POST", body: { policy: previous } });
}
// Cloud Run protokolliert sonst automatisch vollständige Request-URLs samt
// fachlichen Suchparametern. App-Fehler und Plattformmetriken bleiben erhalten.
const exclusionUrl = `https://logging.googleapis.com/v2/projects/${project}/exclusions/vk-google-request-privacy`;
const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name=("${config.appService}" OR "${config.resetService}" OR "${config.appService}-preview" OR "${config.resetService}-preview") AND logName="projects/${project}/logs/run.googleapis.com%2Frequests"`;
const exclusion = { name: "vk-google-request-privacy", description: "Keine vollständigen Browser-Request-URLs mit Suchparametern speichern; strukturierte App-Fehler bleiben erhalten.", filter, disabled: false };
if (await api(exclusionUrl, { allow404: true })) {
  await api(`${exclusionUrl}?updateMask=description,filter,disabled`, { method: "PATCH", body: exclusion });
} else await api(exclusionUrl.slice(0, exclusionUrl.lastIndexOf("/")), { method: "POST", body: exclusion });
console.log("Cloud-Run-Basis additiv eingerichtet. Bestehende Datenbank, Nutzer und DNS unverändert.");
