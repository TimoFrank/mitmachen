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
  "versorgungs-kompass.html",
  "versorgungs-kompass.css",
  "versorgungs-kompass.js",
  "hospitation/index.html",
  "hospitation/hospitation.css",
  "hospitation/hospitation.js",
  "mitmachen/index.html",
  "mitmachen/mitmachen.css",
  "mitmachen/versorgungs-netzwerk.html",
  "mitmachen/versorgungs-netzwerk.css",
  "mitmachen/versorgungs-netzwerk.js",
  "manifest.webmanifest",
  "data/runtime-config.js",
  "data/demo-data.js",
  "data/demo-api.js",
  "data/data-service.js",
  "data/sector-registry.js",
  "data/hospitation-model.js",
  "data/hospitation-export.js",
  "data/activity-model.js",
  "data/document-text-extractor.js",
  "versorgungs-kompass-map.html",
  "versorgungs-kompass-map.css",
  "versorgungs-kompass-map.js",
  "versorgungs-kompass-map-teaser.html",
  "versorgungs-kompass-map-teaser.css",
  "versorgungs-kompass-map-teaser.js",
  "versorgungs-kompass-contact-mini-map.html",
  "versorgungs-kompass-contact-mini-map.css",
  "versorgungs-kompass-contact-mini-map.js",
  "deutschlandkarte-project/data/de-geojson.js",
  "deutschlandkarte-project/data/city-labels.js",
  "deutschlandkarte-project/data/state-labels.js",
  "deutschlandkarte-project/data/state-polygons.js",
  "vendor/THIRD_PARTY_ASSETS.json",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/images/layers-2x.png",
  "vendor/leaflet/images/layers.png",
  "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-shadow.png",
  "vendor/mammoth/mammoth.browser.min.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/xlsx/xlsx.bundle.js",
  "public/brand/mitmachen/lockup-horizontal.svg",
  "public/brand/mitmachen/mark-on-dark.svg",
  "public/brand/versorgungs-kompass/icons/app-icon-180.png",
  "public/brand/versorgungs-kompass/icons/app-icon-192.png",
  "public/brand/versorgungs-kompass/icons/app-icon-32.png",
  "public/brand/versorgungs-kompass/icons/app-icon-512.png",
  "public/brand/versorgungs-kompass/mark-on-dark.svg",
  "public/brand/versorgungs-kompass/mark.svg",
  "public/demo-profile-admin.svg",
  "public/demo-profile-editor.svg",
  "public/demo-profile-viewer.svg",
  "public/hospitation/mitmachen-hospitations-framework.docx",
  "public/hospitation/mitmachen-hospitations-framework.pdf",
  "public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"
]);

for (const required of requiredFiles) {
  assert(actualFiles.includes(required), `${artifactLabel}/${required} fehlt in der Demo-Positivliste`);
}
for (const file of actualFiles) {
  assert(requiredFiles.has(file), `${artifactLabel}/${file} ist nicht fuer die oeffentliche Demo freigegeben`);
}

const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".webmanifest"]);
const firstPartyText = actualFiles
  .filter((file) => textExtensions.has(extname(file)))
  .filter((file) => !file.startsWith("vendor/"))
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
  [/expertenkreis-data|stakeholder-data|patienten-data|versorgungs-kompass-data/i, "statischer Real- oder Fallbackdatensatz"],
  [/auth-guard|auth-login|set-password/i, "Login- oder Authentisierungsoberflaeche"]
]) {
  assert(!pattern.test(firstPartyText), `${artifactLabel} enthaelt ${reason}`);
}

const runtimeConfigPath = join(artifactRoot, "data", "runtime-config.js");
if (existsSync(runtimeConfigPath)) {
  const runtimeConfig = readFileSync(runtimeConfigPath, "utf8");
  assert(/dataMode:\s*["']demo["']/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js erzwingt nicht den Demo-Modus`);
  assert(/authMode:\s*["']anonymous-demo["']/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js erzwingt keine anonyme Demo-Identitaet`);
  assert(/apiBaseUrl:\s*["']["']/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js enthaelt einen externen API-Origin`);
  assert(/requireApiGateway:\s*false/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js fordert unerwartet ein API-Gateway`);
  assert(!/apiBaseUrl:\s*["']https?:/i.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js konfiguriert einen externen API-Zugriff`);
}

const appHtmlPath = join(artifactRoot, "versorgungs-kompass.html");
if (existsSync(appHtmlPath)) {
  const appHtml = readFileSync(appHtmlPath, "utf8");
  const demoDataPosition = appHtml.indexOf("./data/demo-data.js");
  const demoApiPosition = appHtml.indexOf("./data/demo-api.js");
  const dataServicePosition = appHtml.indexOf("./data/data-service.js");
  assert(demoDataPosition >= 0, `${artifactLabel}/versorgungs-kompass.html laedt den synthetischen Datensatz nicht`);
  assert(demoApiPosition > demoDataPosition, `${artifactLabel}/versorgungs-kompass.html laedt die Demo-API nicht nach dem Datensatz`);
  assert(dataServicePosition > demoApiPosition, `${artifactLabel}/versorgungs-kompass.html laedt den API-Vertrag nicht nach der Demo-API`);
  assert(!/(?:auth-config|auth-guard|auth-login)\.js/i.test(appHtml), `${artifactLabel}/versorgungs-kompass.html referenziert Authentisierungscode`);
  assert(!/Willkommen,\s*Timo/i.test(appHtml), `${artifactLabel}/versorgungs-kompass.html enthaelt eine personenbezogene Begruessung`);
  assert(!/data-target-session|id=["']profile-logout["']|IAP-Anmeldung|Angemeldete Sitzung/i.test(appHtml), `${artifactLabel}/versorgungs-kompass.html enthaelt eine irrefuehrende Target-Sitzung`);
  for (const label of ["Versorgung", "Auswertung", "Aktivitäten", "Stakeholder", "Expertenkreis", "Hospitationen", "Beobachtungen", "Fragebogen", "Dashboard", "Formate", "Teams"]) {
    assert(appHtml.includes(label), `${artifactLabel}/versorgungs-kompass.html enthaelt den Voll-App-Bereich ${label} nicht`);
  }
}

assert(!/Willkommen,\s*Timo/i.test(firstPartyText), `${artifactLabel} enthaelt eine personenbezogene Begruessung`);
const publicAppSourcePath = join(artifactRoot, "versorgungs-kompass.js");
if (existsSync(publicAppSourcePath)) {
  const publicAppSource = readFileSync(publicAppSourcePath, "utf8");
  assert(/IS_PUBLIC_DEMO_PROFILE[\s\S]*?window\.location\.reload\(\)/.test(publicAppSource), `${artifactLabel}/versorgungs-kompass.js faengt einen Demo-Logout nicht lokal ab`);
}

const registrationHtmlPath = join(artifactRoot, "mitmachen", "versorgungs-netzwerk.html");
if (existsSync(registrationHtmlPath)) {
  const registrationHtml = readFileSync(registrationHtmlPath, "utf8");
  const registrationAppPosition = registrationHtml.indexOf("./versorgungs-netzwerk.js");
  assert(registrationAppPosition >= 0, `${artifactLabel}/mitmachen/versorgungs-netzwerk.html laedt die Formularlogik nicht`);
  assert(!/data\/(?:runtime-config|demo-data|demo-api)\.js/.test(registrationHtml), `${artifactLabel}/mitmachen/versorgungs-netzwerk.html bindet die Konzeptdemo an einen Daten- oder API-Adapter`);
  assert(!/(?:auth-config|auth-guard|auth-login)\.js/i.test(registrationHtml), `${artifactLabel}/mitmachen/versorgungs-netzwerk.html referenziert Authentisierungscode`);

  const registrationAppPath = join(artifactRoot, "mitmachen", "versorgungs-netzwerk.js");
  if (existsSync(registrationAppPath)) {
    const registrationApp = readFileSync(registrationAppPath, "utf8");
    assert(!/\b(?:fetch|XMLHttpRequest|sendBeacon)\b/.test(registrationApp), `${artifactLabel}/mitmachen/versorgungs-netzwerk.js verwendet eine Transport-API`);
  }
}

const mapHtmlPath = join(artifactRoot, "versorgungs-kompass-map.html");
const mapAppPath = join(artifactRoot, "versorgungs-kompass-map.js");
if (existsSync(mapHtmlPath) && existsSync(mapAppPath)) {
  const mapHtml = readFileSync(mapHtmlPath, "utf8");
  const mapApp = readFileSync(mapAppPath, "utf8");
  assert(/data\/runtime-config\.js/.test(mapHtml), `${artifactLabel}/versorgungs-kompass-map.html laedt die Demo-Runtime nicht`);
  assert(/IS_PUBLIC_DEMO\s*=\s*window\.VERSORGUNGS_COMPASS_CONFIG\?\.dataMode\s*===\s*["']demo["']/.test(mapApp), `${artifactLabel}/versorgungs-kompass-map.js erkennt den oeffentlichen Demo-Modus nicht`);
  assert(/if\s*\(\s*!IS_PUBLIC_DEMO\s*\)\s*\{[\s\S]*?L\.tileLayer\s*\(/.test(mapApp), `${artifactLabel}/versorgungs-kompass-map.js begrenzt externe Kartenkacheln nicht auf den Target-Modus`);
}

const miniMapHtmlPath = join(artifactRoot, "versorgungs-kompass-contact-mini-map.html");
const miniMapAppPath = join(artifactRoot, "versorgungs-kompass-contact-mini-map.js");
if (existsSync(miniMapHtmlPath) && existsSync(miniMapAppPath)) {
  const miniMapHtml = readFileSync(miniMapHtmlPath, "utf8");
  const miniMapApp = readFileSync(miniMapAppPath, "utf8");
  assert(/data\/runtime-config\.js/.test(miniMapHtml), `${artifactLabel}/versorgungs-kompass-contact-mini-map.html laedt die Demo-Runtime nicht`);
  assert(/dataMode\s*!==\s*["']demo["'][\s\S]*?L\.tileLayer\s*\(/.test(miniMapApp), `${artifactLabel}/versorgungs-kompass-contact-mini-map.js begrenzt externe Kartenkacheln nicht auf den Target-Modus`);
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

console.log(`Public Asset Audit OK: ${artifactLabel} enthaelt die gemeinsame Voll-App-Shell mit lokaler synthetischer Demo-Runtime, ohne Login, Supabase oder geschuetzte Fachdaten.`);
