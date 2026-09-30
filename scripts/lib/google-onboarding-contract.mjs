import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  projectIdPin, verifyInstance, verifyOnlineBackupPosture, verifyRecentAutomatedBackup
} from "../check_pre_gematik_migration_gcp.mjs";

export const GOOGLE_ONBOARDING_ENV_KEYS = Object.freeze([
  "GCP_PROJECT_ID", "GCP_REGION", "EXPECTED_TARGET_PROJECT_ID",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME", "PRE_GEMATIK_GCP_PROJECT_SHA256",
  "GOOGLE_APP_SERVICE", "GOOGLE_APP_REVISION", "GOOGLE_RESET_SERVICE", "GOOGLE_RESET_REVISION",
  "GOOGLE_NETWORK", "GOOGLE_SUBNET", "GOOGLE_ONBOARDING_SERVICE_ACCOUNT", "GOOGLE_ONBOARDING_BUCKET",
  "GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND", "GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND"
]);
const resource = /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/u;
const sha = /^sha256:[a-f0-9]{64}$/u;
export class GoogleOnboardingError extends Error {}
export function demand(condition, message) {
  if (!condition) throw new GoogleOnboardingError(message);
}
export function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}
export function exactKeys(value, keys) {
  demand(value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
  "Der Cloud-Run-Onboarding-Vertrag enthält fehlende oder unbekannte Felder.");
}
export function canonicalTime(value) {
  demand(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace("Z", ".000Z"),
  "Eine kanonische UTC-Frist fehlt.");
  return value;
}
export function validateGoogleOnboardingEnvironment(value) {
  const { cloudSqlInstance: ignored, ...env } = value;
  exactKeys(env, GOOGLE_ONBOARDING_ENV_KEYS);
  demand(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(env.GCP_PROJECT_ID)
    && env.EXPECTED_TARGET_PROJECT_ID === env.GCP_PROJECT_ID && env.GCP_REGION === "europe-west3"
    && env.PRE_GEMATIK_GCP_PROJECT_SHA256 === projectIdPin(env.GCP_PROJECT_ID),
  "Projekt, Frankfurt-Region und bestätigter Projekt-Pin müssen übereinstimmen.");
  for (const key of ["GOOGLE_APP_SERVICE", "GOOGLE_APP_REVISION", "GOOGLE_RESET_SERVICE",
    "GOOGLE_RESET_REVISION", "GOOGLE_NETWORK", "GOOGLE_SUBNET", "GOOGLE_ONBOARDING_BUCKET"]) {
    demand(resource.test(env[key]), "Ein Cloud-Run-Ressourcenname ist ungültig.");
  }
  demand(env.GOOGLE_APP_SERVICE !== env.GOOGLE_RESET_SERVICE
    && env.GOOGLE_APP_REVISION.startsWith(`${env.GOOGLE_APP_SERVICE}-`)
    && env.GOOGLE_RESET_REVISION.startsWith(`${env.GOOGLE_RESET_SERVICE}-`)
    && /^[a-z][a-z0-9-]{4,28}[a-z0-9]@/u.test(env.GOOGLE_ONBOARDING_SERVICE_ACCOUNT)
    && env.GOOGLE_ONBOARDING_SERVICE_ACCOUNT.endsWith(`@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`)
    && env.GOOGLE_ONBOARDING_BUCKET.startsWith(`${env.GCP_PROJECT_ID}-`)
    && env.GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND === "true"
    && env.GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND === "false",
  "Nur vollständig neue Testgäste mit eigenem Cloud-Run-Operator sind zugelassen.");
  const connection = env.CLOUD_SQL_INSTANCE_CONNECTION_NAME.split(":");
  demand(connection.length === 3 && connection[0] === env.GCP_PROJECT_ID
    && connection[1] === env.GCP_REGION && resource.test(connection[2])
    && (ignored === undefined || ignored === connection[2]), "Die Cloud-SQL-Zuordnung ist ungültig.");
  return Object.freeze({ ...env, cloudSqlInstance: connection[2] });
}
export function validateGoogleOnboardingRelease(value, env, now = new Date(), { allowExpired = false } = {}) {
  exactKeys(value, ["version", "source_commit", "image", "cloud_sql_proxy_sha256", "approved_until", "invitation_bucket", "pilot_end"]);
  demand(value.version === 2 && /^[a-f0-9]{40}$/u.test(value.source_commit)
    && typeof value.image === "string"
    && value.image.startsWith(`${env.GCP_REGION}-docker.pkg.dev/${env.GCP_PROJECT_ID}/`)
    && /\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/u.test(value.image)
    && sha.test(value.cloud_sql_proxy_sha256)
    && resource.test(value.invitation_bucket) && value.invitation_bucket.startsWith(`${env.GCP_PROJECT_ID}-`)
    && value.invitation_bucket !== env.GOOGLE_ONBOARDING_BUCKET,
  "Der freigegebene Cloud-Run-Operator benötigt Quellcommit, eigenen Digest, Proxy-Pin und getrennte Buckets.");
  canonicalTime(value.approved_until);
  canonicalTime(value.pilot_end);
  demand(Date.parse(value.approved_until) <= Date.parse(value.pilot_end)
    && (allowExpired || Date.parse(value.approved_until) > now.getTime()), "Die Operator-Freigabe ist abgelaufen oder überschreitet die Zugangsfrist.");
  return Object.freeze({ ...value });
}

export function readGcloudJson(args) {
  // Arguments are constructed by this module; stdout/stderr never reach logs.
  try {
    return JSON.parse(execFileSync("gcloud", args, {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, maxBuffer: 4 * 1024 * 1024
    }));
  } catch { throw new Error("Die lesende Cloud-Run-Zielprüfung ist fehlgeschlagen."); }
}
function serviceEnvironment(service, name, revision) {
  demand(service?.metadata?.name === name && !service.metadata.deletionTimestamp
    && service.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True")
    && service.status.latestReadyRevisionName === revision
    && service.status.latestCreatedRevisionName === revision
    && service.status.traffic?.length === 1 && service.status.traffic[0].revisionName === revision
    && service.status.traffic[0].percent === 100 && !service.status.traffic[0].tag,
  "Der Cloud-Run-Dienst liefert nicht ausschließlich die bestätigte Revision aus.");
  const containers = service.spec?.template?.spec?.containers;
  demand(Array.isArray(containers), "Der Cloud-Run-Containervertrag fehlt.");
  const application = containers.find((c) => c.env?.some((e) => e.name === "GOOGLE_HOSTING_ENABLED" && e.value === "1"));
  demand(application && service.spec.template.spec.serviceAccountName, "Der Google-Laufzeitvertrag fehlt.");
  const result = {};
  for (const e of application.env) {
    demand(!Object.hasOwn(result, e.name), "Doppelte Cloud-Run-Konfiguration.");
    // Cloud Run omits `value` for literal empty strings. Secret references
    // must remain unresolved so they cannot satisfy literal policy checks.
    result[e.name] = e.valueFrom ? undefined : (e.value ?? "");
  }
  return result;
}
export async function readGoogleAccessEnd({ project, service, region = "europe-west3" }, {
  read = readGcloudJson, now = () => new Date()
} = {}) {
  demand(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(project) && resource.test(service) && region === "europe-west3",
    "Projekt und Cloud-Run-Anwendungsdienst fehlen.");
  const result = await read(["run", "services", "describe", service, `--project=${project}`, `--region=${region}`, "--format=json"]);
  const env = serviceEnvironment(result, service, result?.status?.latestReadyRevisionName);
  demand(env.API_AUTH_MODE === "identity-platform" && env.IAP_GCIP_PROJECT_ID === project
    && env.GOOGLE_CUTOVER_MODE === "open" && env.IAP_GCIP_TENANT_ID === ""
    && env.ALLOWED_ORIGIN === "https://versorgungs-kompass.de", "Der bestätigte Identity-Platform-Dienst ist nicht geöffnet.");
  const expiry = canonicalTime(env.IAP_EXTERNAL_ACCESS_EXPIRES_AT);
  demand(Date.parse(expiry) > now().getTime(), "Der Anwendungszugang ist abgelaufen.");
  return expiry;
}

export async function checkGoogleOnboardingGcp(raw, release, { read = readGcloudJson, now = () => new Date() } = {}) {
  const env = validateGoogleOnboardingEnvironment(raw);
  validateGoogleOnboardingRelease(release, env, now());
  const projectId = env.GCP_PROJECT_ID;
  const config = { projectId, region: env.GCP_REGION, connectionName: env.CLOUD_SQL_INSTANCE_CONNECTION_NAME, instanceName: env.cloudSqlInstance };
  const readService = (name) => read(["run", "services", "describe", name, `--project=${projectId}`, `--region=${env.GCP_REGION}`, "--format=json"]);
  const [project, app, reset, instance, backups] = await Promise.all([
    read(["projects", "describe", projectId, "--format=json"]), readService(env.GOOGLE_APP_SERVICE), readService(env.GOOGLE_RESET_SERVICE),
    read(["sql", "instances", "describe", env.cloudSqlInstance, `--project=${projectId}`, "--format=json"]),
    read(["sql", "backups", "list", `--instance=${env.cloudSqlInstance}`, `--project=${projectId}`,
      "--filter=status=SUCCESSFUL AND type=AUTOMATED", "--sort-by=~endTime", "--limit=1", "--format=json"])
  ]);
  demand(project.projectId === projectId && project.lifecycleState === "ACTIVE" && /^\d+$/u.test(String(project.projectNumber)), "Das Zielprojekt ist nicht aktiv.");
  const appEnv = serviceEnvironment(app, env.GOOGLE_APP_SERVICE, env.GOOGLE_APP_REVISION);
  const resetEnv = serviceEnvironment(reset, env.GOOGLE_RESET_SERVICE, env.GOOGLE_RESET_REVISION);
  for (const values of [appEnv, resetEnv]) demand(values.IAP_GCIP_PROJECT_ID === projectId
    && values.IAP_GCIP_TENANT_ID === "" && values.GOOGLE_CUTOVER_MODE === "open", "Die Google-Dienste sind nicht exakt projektgebunden geöffnet.");
  demand(appEnv.API_AUTH_MODE === "identity-platform" && appEnv.IAP_IDENTITY_MODE === "external"
    && appEnv.ALLOWED_ORIGIN === "https://versorgungs-kompass.de" && resetEnv.PASSWORD_RESET_ALLOWED_ORIGIN === "https://versorgungs-kompass.de"
    && appEnv.IAP_EXTERNAL_ACCESS_EXPIRES_AT === release.pilot_end && appEnv.DB_NAME === "versorgungs_kompass"
    && resetEnv.PASSWORD_INVITATION_BUCKET === release.invitation_bucket
    && resetEnv.PASSWORD_RESET_BROKER_ENABLED === "1", "Zugang, Datenbank oder Einladungsdienst weichen von der Freigabe ab.");
  const annotations = app.spec.template.metadata?.annotations || {};
  let interfaces;
  try { interfaces = JSON.parse(annotations["run.googleapis.com/network-interfaces"]); } catch { /* fail below */ }
  demand(interfaces?.length === 1 && interfaces[0].network === env.GOOGLE_NETWORK && interfaces[0].subnetwork === env.GOOGLE_SUBNET
    && annotations["run.googleapis.com/vpc-access-egress"] === "private-ranges-only"
    && app.spec.template.spec.containers.some((c) => c.name === "cloud-sql-proxy"
      && c.args?.includes(env.CLOUD_SQL_INSTANCE_CONNECTION_NAME) && c.args.includes("--private-ip"))
    && ![app.spec.template.spec.serviceAccountName, reset.spec.template.spec.serviceAccountName].includes(env.GOOGLE_ONBOARDING_SERVICE_ACCOUNT),
  "Der Operator muss über das bestätigte private Netz mit einer eigenen Identität arbeiten.");
  const privateAddresses = verifyInstance(instance, config);
  const networkResource = `projects/${projectId}/global/networks/${env.GOOGLE_NETWORK}`;
  demand([networkResource, `https://www.googleapis.com/compute/v1/${networkResource}`]
    .includes(instance.settings.ipConfiguration.privateNetwork),
    "Cloud Run und Cloud SQL liegen nicht im bestätigten Netz.");
  const posture = verifyOnlineBackupPosture(instance);
  const recovery = verifyRecentAutomatedBackup(backups, config, now().getTime());
  return Object.freeze({ ok: true, gatePolicy: "online-guest-onboarding",
    fingerprint: digest(JSON.stringify({ env, release, privateAddresses, posture, recovery })),
    targetDatabase: { connectionName: config.connectionName },
    backupPosture: { ...posture, latestSuccessfulAutomatedBackupId: recovery.id, latestSuccessfulAutomatedBackupEndTime: recovery.endTime },
    projectNumber: String(project.projectNumber)
  });
}
