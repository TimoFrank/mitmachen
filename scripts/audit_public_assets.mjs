import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const artifactRootIndex = args.indexOf("--artifact-root");
const artifactRootArgument = artifactRootIndex >= 0 ? args[artifactRootIndex + 1] : "dist/pages";

if (!artifactRootArgument || artifactRootArgument.startsWith("-")) {
  throw new Error("--artifact-root erwartet einen Pfad zum gebauten Pages-Artefakt.");
}

const artifactRoot = resolve(root, artifactRootArgument);
const artifactLabel = relative(root, artifactRoot) || ".";
const failures = [];

if (artifactRootIndex < 0) {
  execFileSync(
    "bash",
    [join(root, "scripts", "build_static_frontend.sh"), "--profile", "pages", "--output", artifactRoot],
    { cwd: root, stdio: "pipe" }
  );
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

assert(existsSync(artifactRoot) && statSync(artifactRoot).isDirectory(), `${artifactLabel} fehlt oder ist kein Verzeichnis`);

const actualFiles = walk(artifactRoot)
  .map((file) => relative(artifactRoot, file).split(sep).join("/"))
  .sort();

const requiredFiles = new Set([
  ".nojekyll",
  "build-manifest.json",
  "index.html",
  "demo/index.html",
  "demo/demo.css",
  "demo/demo-app.js",
  "data/demo-data.js",
  "data/sector-registry.js",
  "versorgungs-kompass-map.html",
  "versorgungs-kompass-map.css",
  "versorgungs-kompass-map.js",
  "deutschlandkarte-project/data/de-geojson.js",
  "deutschlandkarte-project/data/city-labels.js",
  "deutschlandkarte-project/data/state-labels.js",
  "deutschlandkarte-project/data/state-polygons.js",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/images/layers-2x.png",
  "vendor/leaflet/images/layers.png",
  "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-shadow.png",
  "public/app-icon-32.png",
  "public/gematik-logo.svg",
  "public/demo-profile-admin.svg",
  "public/demo-profile-editor.svg",
  "public/demo-profile-viewer.svg"
]);

for (const required of requiredFiles) {
  assert(actualFiles.includes(required), `${artifactLabel}/${required} fehlt in der Demo-Positivliste`);
}
for (const file of actualFiles) {
  assert(requiredFiles.has(file), `${artifactLabel}/${file} ist nicht fuer die oeffentliche Demo freigegeben`);
}

const textExtensions = new Set([".css", ".html", ".js", ".json"]);
const publicText = actualFiles
  .filter((file) => textExtensions.has(extname(file)))
  .map((file) => readFileSync(join(artifactRoot, file), "utf8"))
  .join("\n");

for (const htmlFile of actualFiles.filter((file) => extname(file) === ".html")) {
  const htmlPath = join(artifactRoot, htmlFile);
  const html = readFileSync(htmlPath, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|#|data:|javascript:)/i.test(reference)) continue;
    const cleanReference = reference.split(/[?#]/)[0];
    if (!cleanReference) continue;
    const resolvedReference = resolve(dirname(htmlPath), cleanReference);
    const expectedPath = cleanReference.endsWith("/") ? join(resolvedReference, "index.html") : resolvedReference;
    assert(resolvedReference.startsWith(`${artifactRoot}${sep}`), `${artifactLabel}/${htmlFile} referenziert ausserhalb des Artefakts: ${reference}`);
    assert(existsSync(expectedPath), `${artifactLabel}/${htmlFile} referenziert fehlendes Asset: ${reference}`);
  }
}

for (const [pattern, reason] of [
  [/supabase(?:\.co|-js|AnonKey|Url)|sb_(?:secret|publishable)_/i, "Supabase-Zugriff oder -Konfiguration"],
  [/service[_-]?role/i, "Service-Role-Hinweis"],
  [/\bVK_DEMO_BACKEND\b/, "umschaltbaren Demo-Backendmodus"],
  [/\bapiRequest\s*\(/, "API-Hilfsfunktion"],
  [/\/api\//i, "API-Endpunktroute"],
  [/apiBaseUrl|requireApiGateway|apiCredentials/i, "Target-/API-Runtimekonfiguration"],
  [/expertenkreis-data|stakeholder-data|patienten-data|versorgungs-kompass-data/i, "statischer Real- oder Fallbackdatensatz"],
  [/auth-guard|auth-login|set-password|login\.html/i, "Login- oder Authentisierungsoberflaeche"]
]) {
  assert(!pattern.test(publicText), `${artifactLabel} enthaelt ${reason}`);
}

const demoDataPath = join(artifactRoot, "data", "demo-data.js");
if (existsSync(demoDataPath)) {
  const demoData = readFileSync(demoDataPath, "utf8");
  assert(/synthetisch|fiktiv/i.test(demoData), `${artifactLabel}/data/demo-data.js ist nicht deutlich als synthetisch gekennzeichnet`);
  assert(/demo-(?:profile|contact|org|hospitation|format)/i.test(demoData), `${artifactLabel}/data/demo-data.js verwendet keine nachvollziehbaren Demo-IDs`);
  assert(!/hospitation-avatars|profile-images|storage\/v1/i.test(demoData), `${artifactLabel}/data/demo-data.js referenziert nicht freigegebene Personenbilder`);

  for (const email of demoData.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
    assert(/@(?:[a-z0-9-]+\.)*example\.(?:test|invalid)$/i.test(email), `${artifactLabel}/data/demo-data.js enthaelt keine klar reservierte Demo-Adresse: ${email}`);
  }
  for (const match of demoData.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    const host = match[1].toLowerCase();
    assert(/(?:^|\.)example\.(?:test|invalid)$/.test(host), `${artifactLabel}/data/demo-data.js enthaelt nicht freigegebene externe Domain: ${host}`);
  }
}

if (failures.length) {
  console.error("Public Asset Audit FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Public Asset Audit OK: ${artifactLabel} entspricht der synthetischen Demo-Positivliste ohne Realapp, Login oder geschuetzte Fachdaten.`);
