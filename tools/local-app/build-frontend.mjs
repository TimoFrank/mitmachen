import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, lstat, readdir, rename, rm, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";

const execute = promisify(execFile);
const COPY_ROOTS = ["frontend/app", "frontend/data", "frontend/map", "frontend/login", "frontend/vendor", "public"];
const MARKER = ".local-app-frontend.json";
export const LOCAL_APP_START_PATH = "/frontend/app/versorgungs-kompass.html#hospitations";
export const LOCAL_APP_CSP = "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent, child) => { const path = relative(parent, child); return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path)); };

function replaceExactly(source, needle, replacement, count, label) {
  const actual = source.split(needle).length - 1;
  if (actual !== count) throw new Error(`${label}: ${count} bekannte Stellen erwartet, ${actual} gefunden. Lokaler App-Build abgebrochen.`);
  return source.split(needle).join(replacement);
}

function localRuntimeConfig(source) {
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 1000 });
  const capabilities = context.window.VERSORGUNGS_COMPASS_CONFIG?.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) throw new Error("Die Fähigkeiten der Original-App konnten nicht gelesen werden.");
  if (Object.values(capabilities).some((value) => typeof value !== "boolean")) throw new Error("Unerwartetes Format der Original-App-Fähigkeiten.");
  return `window.VERSORGUNGS_COMPASS_CONFIG = Object.freeze(${JSON.stringify({
    dataMode: "api", authMode: "local-only", apiBaseUrl: "", apiCredentials: "same-origin", requireApiGateway: true,
    cleanUrls: false, localApp: true, disableRemoteAssets: true, capabilities
  }, null, 2)});\n`;
}

const authConfig = `window.VK_AUTH_CONFIG = Object.freeze({
  appName: "Versorgungs-Kompass · Lokal", loginFile: "login.html", defaultFile: "versorgungs-kompass.html",
  loginPath: ${JSON.stringify(LOCAL_APP_START_PATH)}, defaultPath: ${JSON.stringify(LOCAL_APP_START_PATH)},
  storageKey: "versorgungs-kompass-local-app", sessionDays: 0
});\n`;

const authGuard = `(function () {
  "use strict";
  if (window.location.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)) {
    throw new Error("Die lokale App darf ausschließlich über den lokalen App-Start geöffnet werden.");
  }
  const start = ${JSON.stringify(LOCAL_APP_START_PATH)};
  const current = () => window.location.pathname + window.location.search + window.location.hash;
  window.VKAuth = Object.freeze({
    config: window.VK_AUTH_CONFIG || {}, isAuthenticated: () => true,
    getStoredSession: () => ({ authenticated: true, localOnly: true }),
    setAuthenticated: () => ({ authenticated: true, localOnly: true }), clearAuthenticated: () => {},
    buildLoginUrl: current, buildLogoutUrl: () => start, getDefaultUrl: () => start,
    reauthenticateIapSession: () => false
  });
  if (/\\/login\\/login\\.html$/.test(window.location.pathname)) window.location.replace(start);
})();\n`;

/** Copy tracked original UI files into outputRoot/web, changing only the local adapter boundary. */
export async function buildFrontend({ sourceRoot, outputRoot, gitRepository = sourceRoot, sourceRevision = null } = {}) {
  if (!sourceRoot || !outputRoot) throw new TypeError("sourceRoot und outputRoot sind erforderlich.");
  sourceRoot = await realpath(resolve(sourceRoot));
  outputRoot = resolve(outputRoot);
  if (inside(sourceRoot, outputRoot) || inside(outputRoot, sourceRoot)) throw new Error("Das lokale App-Paket muss außerhalb des Quell-Repositories liegen.");
  gitRepository = await realpath(resolve(gitRepository));
  const { stdout: repositoryRoot } = await execute("git", ["-C", gitRepository, "rev-parse", "--show-toplevel"]);
  if (await realpath(repositoryRoot.trim()) !== gitRepository) throw new Error("gitRepository muss die Repository-Wurzel sein.");
  if (sourceRoot !== gitRepository && !sourceRevision) throw new Error("Eine archivierte Quelle benötigt ihre ausdrückliche Git-Revision.");
  const requestedRevision = sourceRevision || "HEAD";
  const [{ stdout: tracked }, { stdout: revision }, originalRuntime, browserRuntime, browserStyles] = await Promise.all([
    execute("git", sourceRevision
      ? ["-C", gitRepository, "ls-tree", "-rz", "--name-only", requestedRevision, "--", ...COPY_ROOTS]
      : ["-C", gitRepository, "ls-files", "-z", "--", ...COPY_ROOTS], { maxBuffer: 16 * 1024 * 1024 }),
    execute("git", ["-C", gitRepository, "rev-parse", "--verify", `${requestedRevision}^{commit}`]),
    readFile(resolve(sourceRoot, "frontend/data/runtime-config.js"), "utf8"),
    readFile(new URL("./browser-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("./browser-runtime.css", import.meta.url), "utf8")
  ]);
  const paths = tracked.split("\0").filter(Boolean).sort();
  for (const required of ["frontend/app/versorgungs-kompass.html", "frontend/app/versorgungs-kompass.js", "frontend/app/versorgungs-kompass.css", "frontend/data/data-service.js", "frontend/data/hospitation-model.js", "frontend/data/hospitation-export.js", "frontend/vendor/leaflet/leaflet.js", "frontend/vendor/mammoth/mammoth.browser.min.js", "frontend/vendor/pdfjs/pdf.min.mjs", "frontend/vendor/pdfjs/pdf.worker.min.mjs", "frontend/vendor/xlsx/xlsx.bundle.js", "public/hospitation/mitmachen-hospitations-framework.pdf", "public/hospitation/mitmachen-hospitations-framework.docx"]) {
    if (!paths.includes(required)) throw new Error(`Erforderliche Originaldatei fehlt: ${required}`);
  }
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  outputRoot = await realpath(outputRoot);
  if (inside(sourceRoot, outputRoot) || inside(outputRoot, sourceRoot)) throw new Error("Das App-Ausgabeziel verweist auf das Quell-Repository.");
  const webRoot = resolve(outputRoot, "web");
  let existing = false;
  try {
    const existingStat = await lstat(webRoot);
    if (!existingStat.isDirectory() || existingStat.isSymbolicLink()) throw new Error("Vorhandenes web-Ziel ist kein eigenes App-Verzeichnis.");
    const entries = await readdir(webRoot);
    if (entries.length) {
      const marker = JSON.parse(await readFile(resolve(webRoot, MARKER), "utf8"));
      if (marker.kind !== "versorgungs-kompass-local-frontend" || marker.schemaVersion !== 1) throw new Error("Unbekannter App-Build-Marker.");
    }
    existing = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // ENOENT for the marker, rather than web itself, must not authorize replacement.
    try { await lstat(webRoot); throw new Error("Das vorhandene web-Verzeichnis besitzt keinen gültigen App-Build-Marker."); }
    catch (checkError) { if (checkError.code !== "ENOENT") throw checkError; }
  }
  const staging = resolve(outputRoot, `.web-build-${randomUUID()}`);
  const previous = resolve(outputRoot, `.web-previous-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  const files = [];
  const patches = [];
  async function write(relativePath, content, originalBytes = null, reason = null) {
    const destination = resolve(staging, relativePath);
    if (!inside(staging, destination)) throw new Error("Ungültiger Dateipfad im Frontend-Build.");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, { mode: 0o600 });
    const bytes = Buffer.from(content);
    files.push({ path: relativePath, size: bytes.length, sha256: sha256(bytes), ...(originalBytes ? { sourceSha256: sha256(originalBytes) } : {}) });
    if (reason) patches.push({ path: relativePath, reason });
  }
  try {
    for (const path of paths) {
      if (path.startsWith("/") || path.split("/").includes("..")) throw new Error("Unsicherer versionierter Dateipfad.");
      const source = resolve(sourceRoot, path);
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !inside(sourceRoot, await realpath(source))) throw new Error(`Keine reguläre Originaldatei: ${path}`);
      const original = await readFile(source);
      let content = original;
      let reason = null;
      if (path === "frontend/data/runtime-config.js") {
        content = localRuntimeConfig(originalRuntime); reason = "Lokale API und unveränderte Original-Fähigkeiten";
      } else if (path === "frontend/login/auth-config.js") {
        content = authConfig; reason = "Lokaler App-Einstieg ohne externe Anmeldung";
      } else if (path === "frontend/login/auth-guard.js") {
        content = authGuard; reason = "Anmeldung ausschließlich am lokalen Gateway";
      } else if (path === "frontend/app/versorgungs-kompass.js") {
        content = replaceExactly(original.toString("utf8"), 'if (!allowGenerated || String(window.VERSORGUNGS_COMPASS_CONFIG?.dataMode || "").toLowerCase() === "demo") return null;', 'if (!allowGenerated || window.VERSORGUNGS_COMPASS_CONFIG?.disableRemoteAssets === true || String(window.VERSORGUNGS_COMPASS_CONFIG?.dataMode || "").toLowerCase() === "demo") return null;', 1, "Externe Favicons");
        reason = "Automatische externe Favicons lokal deaktiviert";
      } else if (path === "frontend/map/versorgungs-kompass-map.js") {
        content = replaceExactly(original.toString("utf8"), 'const IS_PUBLIC_DEMO = window.VERSORGUNGS_COMPASS_CONFIG?.dataMode === "demo";', 'const IS_PUBLIC_DEMO = window.VERSORGUNGS_COMPASS_CONFIG?.dataMode === "demo" || window.VERSORGUNGS_COMPASS_CONFIG?.disableRemoteAssets === true;', 1, "Externe Kartenkacheln");
        reason = "Lokale Geometrien ohne externe Kartenkacheln";
      } else if (path === "frontend/map/versorgungs-kompass-contact-mini-map.js") {
        content = replaceExactly(original.toString("utf8"), 'if (window.VERSORGUNGS_COMPASS_CONFIG?.dataMode !== "demo") {', 'if (window.VERSORGUNGS_COMPASS_CONFIG?.dataMode !== "demo" && window.VERSORGUNGS_COMPASS_CONFIG?.disableRemoteAssets !== true) {', 1, "Externe Minikartenkacheln");
        reason = "Lokale Minikarte ohne externe Kartenkacheln";
      } else if (path.startsWith("frontend/") && path.endsWith(".html")) {
        const html = original.toString("utf8");
        content = replaceExactly(html, "</head>", '  <meta http-equiv="Content-Security-Policy" content="' + LOCAL_APP_CSP + '">\n  <script src="/frontend/local-app/browser-runtime.js"></script>\n  <link rel="stylesheet" href="/frontend/local-app/browser-runtime.css">\n</head>', 1, `Lokaler Browser-Schutz (${path})`);
        reason = "Lokaler Browser-Schutz und dezent sichtbarer Lokalhinweis";
      }
      await write(path, content, original, reason);
    }
    await write("frontend/local-app/browser-runtime.js", browserRuntime, null, "Lokaler Browser-Adapter");
    await write("frontend/local-app/browser-runtime.css", browserStyles, null, "Lokaler Hinweissatz");
    for (const name of ["sync.html", "sync.css", "sync-ui.js"]) await write(`frontend/local-app/${name}`, await readFile(new URL(`./${name}`, import.meta.url)), null, "Lokaler Mac-Abgleich");
    const manifest = { schemaVersion: 1, kind: "versorgungs-kompass-local-frontend", builtAt: new Date().toISOString(), sourceRevision: revision.trim(), startPath: LOCAL_APP_START_PATH, csp: LOCAL_APP_CSP, files, patches };
    await writeFile(resolve(staging, MARKER), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    if (existing) await rename(webRoot, previous);
    try { await rename(staging, webRoot); }
    catch (error) { if (existing) await rename(previous, webRoot); throw error; }
    if (existing) await rm(previous, { recursive: true });
    return { ...manifest, webRoot };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
