import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLOUD_SQL_PROXY_IMAGE = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f";

export function renderGoogleServices(config) {
  const { project, region, image, revision, origin, appService, resetService, network, subnet, sqlConnectionName, database, databaseUser, databaseSecret, smtpSecret, cartoSecret, stateBucket, invitationBucket, apiKey, accessExpiresAt, buckets } = config;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(project || "") || region !== "europe-west3") throw new Error("Projekt und Frankfurt-Region müssen explizit festgelegt sein.");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw new Error("Der kanonische Origin muss HTTPS verwenden.");
  if (!image?.startsWith(`${region}-docker.pkg.dev/${project}/`) || !/@sha256:[a-f0-9]{64}$/u.test(image)) throw new Error("Ein eigener unveränderlicher Image-Digest ist erforderlich.");
  if (!/^[a-f0-9]{40}$/u.test(revision || "")) throw new Error("Die vollständige Quellrevision fehlt.");
  if (!sqlConnectionName?.startsWith(`${project}:${region}:`)) throw new Error("Die Datenbank muss im selben Projekt und in Frankfurt liegen.");
  if (![database, databaseUser].every((value) => /^[a-z][a-z0-9_]{1,62}$/u.test(value || ""))) throw new Error("Datenbank und Laufzeitrolle fehlen.");
  if (!/^AIza[0-9A-Za-z_-]{35}$/u.test(apiKey || "") || !Number.isFinite(Date.parse(accessExpiresAt))) throw new Error("Identity-Platform-Konfiguration fehlt.");
  for (const value of [appService, resetService, network, subnet, stateBucket, invitationBucket, databaseSecret?.name, smtpSecret?.name, ...["profiles", "contacts", "attachments", "stakeholderLogos"].map((key) => buckets?.[key])]) {
    if (!/^[a-z][a-z0-9_-]{1,62}$/u.test(value || "")) throw new Error("Ein Ressourcenname fehlt oder ist ungültig.");
  }
  if (!["closed", "open"].includes(config.cutoverMode || "closed")) throw new Error("Ungültiger Umschaltzustand.");
  if (cartoSecret && !/^[a-z][a-z0-9_-]{1,62}$/u.test(cartoSecret.name || "")) throw new Error("Ungültiger CARTO-Secret-Name.");
  if (config.cutoverMode === "open" && !cartoSecret) throw new Error("Vor der Freigabe das domainbeschränkte CARTO-Secret einrichten.");
  if (config.resetIngressHost && (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/u.test(config.resetIngressHost)
    || !config.resetIngressHost.startsWith(`${resetService}-`))) throw new Error("Der Passwortdienst benötigt seinen eigenen expliziten Cloud-Run-Hostname.");
  if (config.cutoverMode === "open" && !config.resetIngressHost) throw new Error("Vor der Freigabe den tatsächlichen Passwortdienst-Host bestätigen.");
  const shared = {
    NODE_ENV: "production", GOOGLE_HOSTING_ENABLED: "1", GOOGLE_STATE_BUCKET: stateBucket,
    GOOGLE_CUTOVER_MODE: config.cutoverMode || "closed", IAP_GCIP_PROJECT_ID: project,
    IAP_GCIP_TENANT_ID: "", IAP_EXTERNAL_AUTH_API_KEY: apiKey
  };
  const env = (values) => Object.entries(values).map(([name, value]) => ({ name, value: String(value) }));
  const secret = (name, value) => ({ name, valueFrom: { secretKeyRef: { name: value.name, key: String(value.version) } } });
  for (const value of [databaseSecret, smtpSecret, ...(cartoSecret ? [cartoSecret] : [])]) if (!/^[1-9][0-9]*$/u.test(String(value.version))) throw new Error("Secret-Versionen müssen numerisch gepinnt sein.");
  const service = (name, account, containers, networked) => ({
    apiVersion: "serving.knative.dev/v1", kind: "Service",
    metadata: { name, labels: { "cloud.googleapis.com/location": region, "source-sha": revision, "managed-by": "vk-google-hosting" }, annotations: { "run.googleapis.com/ingress": "all" } },
    spec: {
      template: {
        metadata: { annotations: {
          "autoscaling.knative.dev/minScale": "0", "autoscaling.knative.dev/maxScale": "2",
          "run.googleapis.com/cpu-throttling": "true", "run.googleapis.com/startup-cpu-boost": "false",
          "run.googleapis.com/execution-environment": "gen2",
          ...(networked ? {
            "run.googleapis.com/network-interfaces": JSON.stringify([{ network, subnetwork: subnet }]),
            "run.googleapis.com/vpc-access-egress": "private-ranges-only",
            "run.googleapis.com/container-dependencies": JSON.stringify({ application: ["cloud-sql-proxy"] })
          } : {})
        } },
        spec: { serviceAccountName: `${account}@${project}.iam.gserviceaccount.com`, containerConcurrency: 20, timeoutSeconds: 60, containers }
      },
      traffic: [{ latestRevision: true, percent: 100 }]
    }
  });
  const app = service(appService, "vk-google-api", [
    {
      name: "application", image, ports: [{ containerPort: 8080 }],
      resources: { limits: { cpu: "1", memory: "512Mi" } },
      env: [
        ...env({ ...shared, API_AUTH_MODE: "identity-platform", ALLOWED_ORIGIN: origin,
          IAP_IDENTITY_MODE: "external", IAP_EXTERNAL_LOGIN_PAGE_URI: `${origin}/anmelden`, IAP_EXTERNAL_ACCESS_EXPIRES_AT: accessExpiresAt,
          DB_HOST: "127.0.0.1", DB_PORT: "5432", DB_SSL: "disable", DB_NAME: database, DB_USER: databaseUser,
          DB_POOL_MAX: "3", DB_APPLICATION_NAME: appService, API_LOG_REQUESTS: "0",
          IMAGE_UPLOAD_MODE: "disabled", ATTACHMENT_UPLOAD_MODE: "disabled", TYPO3_CONNECTOR_ENABLED: "0",
          GOOGLE_ALIAS_HOSTS: (config.aliases || []).join(","),
          PROFILE_IMAGE_BUCKET: buckets.profiles, CONTACT_IMAGE_BUCKET: buckets.contacts,
          CONTACT_NOTE_ATTACHMENT_BUCKET: buckets.attachments, STAKEHOLDER_LOGO_BUCKET: buckets.stakeholderLogos,
          ...(config.importOwnerProfileId ? { HOSPITATION_IMPORT_OWNER_PROFILE_ID: config.importOwnerProfileId } : {})
        }), secret("DB_PASSWORD", databaseSecret), ...(cartoSecret ? [secret("CARTO_BASEMAP_API_KEY", cartoSecret)] : [])
      ],
      startupProbe: { httpGet: { path: "/api/readyz", port: 8080 }, initialDelaySeconds: 0, timeoutSeconds: 6, periodSeconds: 6, failureThreshold: 30 }
    },
    {
      name: "cloud-sql-proxy", image: CLOUD_SQL_PROXY_IMAGE,
      args: ["--private-ip", "--address=0.0.0.0", "--port=5432", "--lazy-refresh", "--structured-logs", "--quiet", "--health-check", "--http-address=0.0.0.0", "--http-port=9090", sqlConnectionName],
      resources: { limits: { cpu: "1", memory: "128Mi" } },
      startupProbe: { httpGet: { path: "/startup", port: 9090 }, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 60 }
    }
  ], true);
  const reset = service(resetService, "vk-google-password-reset", [{
    name: "password-reset", image, command: ["node"], args: ["api/password-reset-server.mjs"], ports: [{ containerPort: 8080 }],
    resources: { limits: { cpu: "1", memory: "512Mi" } },
    env: [...env({ ...shared, PASSWORD_RESET_BROKER_ENABLED: "1", PASSWORD_RESET_ALLOWED_ORIGIN: origin, PASSWORD_RESET_CLOUD_RUN_HOST: config.resetIngressHost || "", PASSWORD_INVITATION_BUCKET: invitationBucket }), secret("PASSWORD_RESET_SMTP_PASSWORD", smtpSecret)],
    startupProbe: { httpGet: { path: "/healthz", port: 8080 }, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 30 }
  }], false);
  const hosting = { rewrites: [
    { glob: "/api/auth/password-reset", run: { serviceId: resetService, region } },
    { glob: "**", run: { serviceId: appService, region } }
  ], headers: [{ glob: "**", headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }] };
  return { app, reset, hosting };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Konfigurationsdatei und externes Ausgabeverzeichnis fehlen.");
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [name, value] of Object.entries(renderGoogleServices(JSON.parse(fs.readFileSync(input, "utf8"))))) {
    fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  }
}
