import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { googleApi } from "./google-api.mjs";
import { demoAssetPaths, demoRoute, uploadDemoEntry, withDemoEntry } from "./hosting-demo-entry.mjs";

const [project, site, expectedVersion, mode, ...extra] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{4,29}$/u.test(project || "") || !/^[a-z][a-z0-9-]{4,29}$/u.test(site || "")
  || !/^[a-f0-9]{16}$/u.test(expectedVersion || "") || !["--plan", "--apply"].includes(mode) || extra.length) {
  throw new Error("Aufruf: node deploy/google-hosting/publish-demo-entry.mjs <Projekt> <Site> <Live-Versions-ID> --plan|--apply");
}
const git = (...args) => execFileSync("git", args, { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
if (mode === "--apply" && (git("status", "--porcelain") || git("ls-remote", "origin", "refs/heads/main").split(/\s/u)[0] !== revision)) {
  throw new Error("Veröffentlichen ist nur aus dem sauberen aktuellen origin/main möglich.");
}
const domain = "versorgungs-kompass.de";
const base = "https://firebasehosting.googleapis.com/v1beta1";
const sitePath = `sites/${site}`;
const api = googleApi(project);
const customDomain = await api(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}/customDomains/${domain}`);
if (customDomain.hostState !== "HOST_ACTIVE") throw new Error("Die Hauptdomain ist für diese Firebase-Site nicht aktiv.");
const getLive = async () => {
  const { releases = [] } = await api(`${base}/${sitePath}/channels/live/releases?pageSize=1`);
  return releases[0];
};
const live = await getLive();
if (live?.version?.name !== `${sitePath}/versions/${expectedVersion}`) throw new Error("Die aktive Firebase-Version hat sich geändert.");
const previous = await api(`${base}/${live.version.name}`);
const systemFiles = ["/__/firebase/init.js", "/__/firebase/init.json"];
const filesFor = async name => {
  const { files = [], nextPageToken } = await api(`${base}/${name}/files`);
  if (nextPageToken || files.some(({ path, hash, status }) =>
    ![...systemFiles, ...demoAssetPaths].includes(path) || !/^[a-f0-9]{64}$/u.test(hash) || status !== "ACTIVE")) {
    throw new Error("Unerwartete Dateien in der Firebase-Version.");
  }
  return Object.fromEntries(files.map(({ path, hash }) => [path, hash]));
};
const previousFiles = await filesFor(previous.name);
// Firebase fügt diese reservierten Systemdateien selbst hinzu.
const reusableFiles = Object.fromEntries(Object.entries(previousFiles).filter(([path]) => !systemFiles.includes(path)));
const config = withDemoEntry(previous.config);
const plan = { domain, site, previous: previous.name, revision, path: demoRoute };
if (mode === "--plan") {
  console.log(JSON.stringify(plan));
} else {
  const labels = { ...previous.labels, "demo-entry-sha": revision };
  const version = await api(`${base}/${sitePath}/versions`, { method: "POST", body: { config, labels } });
  const files = await uploadDemoEntry(api, base, version.name, reusableFiles);
  await api(`${base}/${version.name}?updateMask=status`, { method: "PATCH", body: { status: "FINALIZED" } });
  const [candidate, candidateFiles] = await Promise.all([api(`${base}/${version.name}`), filesFor(version.name)]);
  if (candidate.status !== "FINALIZED" || !isDeepStrictEqual(candidate.config, config)
    || !isDeepStrictEqual(candidate.labels, labels)
    || !isDeepStrictEqual(candidateFiles, { ...previousFiles, ...files })) {
    throw new Error("Konfiguration oder Dateibestand der neuen Firebase-Version weicht ab.");
  }
  if ((await getLive())?.name !== live.name) throw new Error("Die aktive Firebase-Freigabe hat sich während der Vorbereitung geändert.");
  const release = await api(`${base}/${sitePath}/channels/live/releases?versionName=${encodeURIComponent(version.name)}`, {
    method: "POST", body: { message: `Öffentlicher Demo-Einstieg ${revision}` }
  });
  console.log(JSON.stringify({ ...plan, version: version.name, release: release.name }));
  if ((await getLive())?.version?.name !== version.name) throw new Error("Die neue Firebase-Freigabe wurde noch nicht als aktiv bestätigt.");
}
