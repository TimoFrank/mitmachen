import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import { googleApi } from "./google-api.mjs";
import { checkDemoSource } from "./check-demo-source.mjs";

const project = "steam-capsule-341212";
const site = "versorgungs-kompass-demo";
const origin = `https://${site}.web.app`;
const base = "https://firebasehosting.googleapis.com/v1beta1";
const sitePath = `sites/${site}`;
const projectSite = `projects/${project}/${sitePath}`;
const config = {
  headers: [{
    glob: "**",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "frame-ancestors https://versorgungs-kompass.de https://www.versorgungs-kompass.de",
      "X-Robots-Tag": "noindex, nofollow"
    }
  }]
};
const systemFiles = new Set(["/__/firebase/init.js", "/__/firebase/init.json"]);
const root = new URL("../../", import.meta.url);
const [mode, ...extra] = process.argv.slice(2);
if (!["--plan", "--apply"].includes(mode) || extra.length) {
  throw new Error("Aufruf: npm run publish:demo -- --plan|--apply");
}
const run = (command, args, env = process.env) =>
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
const api = googleApi(project);

function collectFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    const route = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return collectFiles(path, route);
    if (!entry.isFile() || route.startsWith("/__/") || /[\\?#\u0000-\u001f]/u.test(route)) {
      throw new Error(`Unzulässiger Dateipfad im Demo-Build: ${route}`);
    }
    const content = gzipSync(readFileSync(path));
    return [{ route, content, hash: createHash("sha256").update(content).digest("hex") }];
  });
}

async function getSite() {
  const hostingSite = await api(`${base}/${projectSite}`, { allow404: true });
  if (hostingSite && (hostingSite.name !== projectSite || hostingSite.type !== "USER_SITE"
    || hostingSite.defaultUrl?.replace(/\/$/u, "") !== origin)) {
    throw new Error("Das Hosting-Ziel stimmt nicht mit der festgelegten Demo-Site überein.");
  }
  return hostingSite;
}

async function getLive() {
  const { releases = [] } = await api(`${base}/${sitePath}/channels/live/releases?pageSize=1`);
  return releases[0];
}

async function waitForPublicManifest(manifest) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`${origin}/build-manifest.json?revision=${manifest.revision}&check=${Date.now()}`, {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000)
      });
      if (response.ok && isDeepStrictEqual(await response.json(), manifest)) return;
    } catch {
      // A newly published site can take a moment to become reachable.
    }
    await pause(3000);
  }
  throw new Error("Die aktive Firebase-Version liefert das erwartete Demo-Manifest noch nicht aus.");
}

async function verifyFileInventory(version, expected) {
  const files = {};
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await api(`${base}/${version}/files?${query}`);
    for (const { path, hash, status } of page.files || []) {
      if (systemFiles.has(path)) continue;
      if (!Object.hasOwn(expected, path) || Object.hasOwn(files, path) || status !== "ACTIVE") {
        throw new Error(`Unerwarteter Dateieintrag in der Firebase-Version: ${path}`);
      }
      files[path] = hash;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!isDeepStrictEqual(files, expected)) throw new Error("Firebase-Dateibestand stimmt nicht mit dem Demo-Build überein.");
}

const revision = checkDemoSource();
const dist = fileURLToPath(new URL("dist", root));
mkdirSync(dist, { recursive: true });
if (lstatSync(dist).isSymbolicLink()) throw new Error("Das Build-Verzeichnis darf kein Symlink sein.");
const temporary = mkdtempSync(join(dist, ".demo-publish-"));
try {
  const artifact = join(temporary, "pages");
  run("bash", ["scripts/build_static_frontend.sh", "--profile", "pages", "--output", artifact]);
  run(process.execPath, ["scripts/audit_public_assets.mjs", "--artifact-root", artifact]);
  const manifest = JSON.parse(readFileSync(join(artifact, "build-manifest.json"), "utf8"));
  if (manifest.profile !== "pages" || manifest.revision !== revision || !/^sha256:[a-f0-9]{64}$/u.test(manifest.artifactDigest)) {
    throw new Error("Demo-Manifest stimmt nicht mit dem geprüften Commit überein.");
  }
  const entries = collectFiles(artifact);
  if (entries.length > 1000) throw new Error("Der Demo-Build überschreitet das Firebase-Limit von 1000 Dateien.");
  const files = Object.fromEntries(entries.map(({ route, hash }) => [route, hash]));
  const hostingSite = await getSite();
  const previous = hostingSite ? await getLive() : undefined;
  const plan = {
    project, site, origin, revision, digest: manifest.artifactDigest,
    files: entries.length, previousVersion: previous?.version?.name || null
  };
  if (mode === "--plan") {
    console.log(JSON.stringify(plan));
  } else {
    if (!hostingSite) {
      await api(`${base}/projects/${project}/sites?siteId=${site}`, { method: "POST", body: {} });
      let createdSite;
      for (let attempt = 0; attempt < 12 && !createdSite; attempt += 1) {
        createdSite = await getSite();
        if (!createdSite) await pause(3000);
      }
      if (!createdSite) throw new Error("Firebase stellt die neue Demo-Site noch bereit. Erneut versuchen, sobald sie erreichbar ist.");
    }
    const { name: version } = await api(`${base}/${sitePath}/versions`, {
      method: "POST", body: { config, labels: { "source-sha": revision } }
    });
    if (!new RegExp(`^${sitePath}/versions/[a-f0-9]{16}$`, "u").test(version || "")) {
      throw new Error("Firebase hat eine unerwartete Versionsadresse geliefert.");
    }
    const { uploadRequiredHashes = [], uploadUrl } = await api(`${base}/${version}:populateFiles`, {
      method: "POST", body: { files }
    });
    const uploads = new Map(entries.map(({ hash, content }) => [hash, content]));
    if (uploadRequiredHashes.length) {
      const url = new URL(uploadUrl);
      if (url.href !== `https://upload-firebasehosting.googleapis.com/upload/${version}/files`
        || uploadRequiredHashes.some(hash => !uploads.has(hash))) {
        throw new Error("Firebase fordert einen unerwarteten Datei-Upload an.");
      }
      for (let index = 0; index < uploadRequiredHashes.length; index += 6) {
        await Promise.all(uploadRequiredHashes.slice(index, index + 6).map(hash =>
          api(`${uploadUrl}/${hash}`, { method: "POST", body: uploads.get(hash), binary: true })
        ));
      }
    }
    await api(`${base}/${version}?updateMask=status`, { method: "PATCH", body: { status: "FINALIZED" } });
    const candidate = await api(`${base}/${version}`);
    if (candidate.status !== "FINALIZED" || candidate.labels?.["source-sha"] !== revision
      || !isDeepStrictEqual(candidate.config, config)) {
      throw new Error("Konfiguration der neuen Demo-Version weicht ab.");
    }
    await verifyFileInventory(version, files);
    if (checkDemoSource() !== revision || (await getLive())?.name !== previous?.name) {
      throw new Error("Der geprüfte Quellstand oder die aktive Demo-Version hat sich während der Vorbereitung geändert.");
    }
    await api(`${base}/${sitePath}/channels/live/releases?versionName=${encodeURIComponent(version)}`, {
      method: "POST", body: { message: `Öffentliche Demo ${revision}` }
    });
    if ((await getLive())?.version?.name !== version) throw new Error("Die Demo-Version wurde nicht als aktiv bestätigt.");
    console.log(JSON.stringify({ ...plan, version }));
    await waitForPublicManifest(manifest);
    run(process.execPath, ["scripts/verify_publication_state.mjs"], {
      ...process.env, PUBLIC_BASE_URL: origin, PUBLICATION_ASSETS: ""
    });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
