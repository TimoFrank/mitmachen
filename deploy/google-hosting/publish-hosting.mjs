import fs from "node:fs";
import { googleApi } from "./google-api.mjs";
import { renderGoogleServices } from "./render.mjs";

const [filename, mode] = process.argv.slice(2);
if (!filename || mode !== "--apply") throw new Error("Konfiguration und --apply erforderlich.");
const config = JSON.parse(fs.readFileSync(filename, "utf8"));
const { hosting } = renderGoogleServices(config);
if (!/^[a-z][a-z0-9-]{3,28}[a-z0-9]$/u.test(config.siteId || "")) throw new Error("Dedizierte Firebase-Site fehlt.");
const api = googleApi(config.project);
for (const name of [config.appService, config.resetService]) {
  const service = await api(`https://run.googleapis.com/v2/projects/${config.project}/locations/${config.region}/services/${name}`);
  if (service.reconciling || service.terminalCondition?.state !== "CONDITION_SUCCEEDED"
    || service.labels?.["source-sha"] !== config.revision
    || service.template?.containers?.[0]?.image !== config.image) {
    throw new Error(`Cloud Run ${name} ist nicht mit dem erwarteten Release bereit.`);
  }
}
const base = "https://firebasehosting.googleapis.com/v1beta1";
const site = `projects/${config.project}/sites/${config.siteId}`;
if (!(await api(`${base}/${site}`, { allow404: true }))) {
  await api(`${base}/projects/${config.project}/sites?siteId=${config.siteId}`, { method: "POST", body: {} });
}
// Keine privaten Frontend-Dateien auf das öffentliche CDN hochladen: jede
// Anwendungsroute wird vom Cloud-Run-Sitzungsvertrag geschützt.
const version = await api(`${base}/sites/${config.siteId}/versions`, { method: "POST", body: { config: hosting, labels: { "source-sha": config.revision } } });
await api(`${base}/${version.name}:populateFiles`, { method: "POST", body: { files: {} } });
await api(`${base}/${version.name}?updateMask=status`, { method: "PATCH", body: { status: "FINALIZED" } });
const release = await api(`${base}/sites/${config.siteId}/releases?versionName=${encodeURIComponent(version.name)}`, { method: "POST", body: { message: `Google Hosting ${config.revision}` } });
console.log(JSON.stringify({ site: config.siteId, version: version.name, release: release.name, domainChanged: false }));
