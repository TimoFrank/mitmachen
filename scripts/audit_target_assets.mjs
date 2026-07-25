import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const artifactRootIndex = args.indexOf("--artifact-root");
const artifactRootArgument = artifactRootIndex >= 0 ? args[artifactRootIndex + 1] : "dist/target";

if (!artifactRootArgument || artifactRootArgument.startsWith("-")) {
  throw new Error("--artifact-root erwartet einen Pfad zum gebauten Target-Artefakt.");
}

const artifactRoot = resolve(root, artifactRootArgument);
const artifactLabel = relative(root, artifactRoot) || ".";
const failures = [];

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

for (const required of [
  "build-manifest.json",
  "index.html",
  "login.html",
  "enrollment.html",
  "enrollment.css",
  "enrollment.js",
  "mitmachen/index.html",
  "versorgungs-kompass.html",
  "versorgungs-kompass-routes.js",
  "data/data-service.js",
  "data/runtime-config.js",
  "hospitation/import.html",
  "hospitation/import.css",
  "hospitation/import.js"
]) {
  assert(actualFiles.includes(required), `${artifactLabel}/${required} fehlt im geschuetzten Target-Artefakt`);
}

for (const forbidden of [
  "demo/index.html",
  "data/demo-data.js",
  "data/demo-api.js",
  "data/versorgungs-kompass-data.csv",
  "data/versorgungs-kompass-data.js",
  "data/expertenkreis-data.js",
  "data/stakeholder-data.js",
  "data/patienten-data.js"
]) {
  assert(!actualFiles.includes(forbidden), `${artifactLabel}/${forbidden} ist im Target-Artefakt nicht zulaessig`);
}

for (const forbiddenPrefix of [
  "demo/",
  "vendor/supabase/",
  "public/hospitation-avatars/",
  "public/stakeholder-logos/"
]) {
  assert(!actualFiles.some((file) => file.startsWith(forbiddenPrefix)), `${artifactLabel}/${forbiddenPrefix} darf nicht in das Target-Artefakt gelangen`);
}

const configPath = join(artifactRoot, "data", "runtime-config.js");
if (existsSync(configPath)) {
  const config = readFileSync(configPath, "utf8");
  assert(/dataMode:\s*"api"/.test(config), `${artifactLabel}/data/runtime-config.js erzwingt nicht den API-Modus`);
  assert(/requireApiGateway:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js erzwingt nicht das API-Gateway`);
  assert(/cleanUrls:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js aktiviert die kanonischen Anwendungspfade nicht`);
  assert(/apiCredentials:\s*"include"/.test(config), `${artifactLabel}/data/runtime-config.js sendet keine geschuetzte Sitzung`);
  assert(/authMode:\s*"(?:iap|oidc)"/.test(config), `${artifactLabel}/data/runtime-config.js verwendet keinen erlaubten signierten Auth-Modus`);
  assert(!/ownerOnlyContactChannels:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js darf den Pages-spezifischen Owner-Schutz nicht aktivieren`);
  assert(!/supabaseUrl|supabaseAnonKey|registrationEndpoint/.test(config), `${artifactLabel}/data/runtime-config.js enthaelt direkte Supabase-Browserkonfiguration`);
}

const dataServicePath = join(artifactRoot, "data", "data-service.js");
if (existsSync(dataServicePath)) {
  const dataService = readFileSync(dataServicePath, "utf8");
  assert(dataService.includes("window.dataService"), `${artifactLabel}/data/data-service.js stellt die erwartete API-Schnittstelle nicht bereit`);
  assert(dataService.includes("/api/contacts"), `${artifactLabel}/data/data-service.js enthaelt keinen API-Kontaktpfad`);
  for (const [pattern, reason] of [
    [/(?:window\s*\.\s*)?supabase\b/i, "direkte Supabase-Laufzeit"],
    [/\.\s*from\s*\(/, "direkten .from()-Datenbankzugriff"],
    [/\.\s*rpc\s*\(/, "direkten .rpc()-Datenbankzugriff"],
    [/\.\s*storage\s*\.\s*from\b/, "direkten Storage-Zugriff"],
    [/\blocalStorage\b/, "einen localStorage-Fachdaten-Fallback"],
    [/\bVERSORGUNGS_COMPASS_DEMO_DATA\b/, "einen Demo-Datensatz"],
    [/\b(?:isDemoMode|isLocalMode|demoData|sampleRegistrationRows)\b/, "Demo-/Local-Mode-Code"],
    [/\bresetLocalBackendRegistrations\b/, "den Demo-Reset-Export"],
    [/\b(?:reg-demo-|demo-admin|local-admin)\b/i, "eine synthetische Laufzeitidentitaet oder Demo-Registrierung"],
    [/\b(?:gcp-demo|gcp-pilot)\b/i, "einen GCP-Demo-Modus"],
    [/\b(?:gematikBackendToken|gematikBackendUrl|registrationBackendUrl|registrationBackendToken)\b/, "ein paralleles Registrierungs-Backend oder Browser-Token"],
    [/versorgungs-netzwerk\/registrierungen/i, "den abgeloesten Registrierungs-Backendpfad"],
    [/\b(?:localData|_localData)\b/, "lokale Anhangsdaten"],
    [/versorgungs-kompass-(?:formats|hospitation|roadmap|expert|stakeholder|backend-registrations|activity-events|contact-notes?)-/i, "einen lokalen Fachdatenschluessel"],
    [/sourceMappingURL=/, "eine Source Map mit moeglichem Multi-Mode-Quellcode"]
  ]) {
    assert(!pattern.test(dataService), `${artifactLabel}/data/data-service.js enthaelt ${reason}`);
  }
}

const targetHtmlPath = join(artifactRoot, "versorgungs-kompass.html");
if (existsSync(targetHtmlPath)) {
  const html = readFileSync(targetHtmlPath, "utf8");
  assert(!/data\/(?:demo-data|versorgungs-kompass-data|expertenkreis-data|stakeholder-data|patienten-data)\.js/i.test(html), `${artifactLabel}/versorgungs-kompass.html referenziert statische Demo- oder Realbestandsdaten`);
  assert(!/data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)=["']demo["']/i.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt einen Demo-/Echt-Umschalter`);
  assert(!/id=["']registrations-reset-demo["']/i.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt eine Demo-Reset-Funktion`);
  assert(/data-target-session/.test(html) && /id=["']profile-logout["']/.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt die Target-Sitzungssteuerung nicht`);
}

for (const entryRelativePath of ["index.html", "mitmachen/index.html"]) {
  const entryPath = join(artifactRoot, entryRelativePath);
  if (!existsSync(entryPath)) continue;
  const entryHtml = readFileSync(entryPath, "utf8");
  assert(
    (entryHtml.match(/data-target-enrollment/g) || []).length === 1,
    `${artifactLabel}/${entryRelativePath} muss genau einen eindeutig markierten Testzugang-Einstieg enthalten`
  );
  assert(
    (entryHtml.match(/href=["']\/enrollment\.html["']/g) || []).length === 1,
    `${artifactLabel}/${entryRelativePath} muss genau einmal same-origin auf /enrollment.html verweisen`
  );
  assert(
    !/\.\.\/\.\.\/login\/enrollment\.html/.test(entryHtml),
    `${artifactLabel}/${entryRelativePath} enthaelt noch den Quellpfad der Aktivierungsseite`
  );
}

const enrollmentHtmlPath = join(artifactRoot, "enrollment.html");
const enrollmentAppPath = join(artifactRoot, "enrollment.js");
if (existsSync(enrollmentHtmlPath) && existsSync(enrollmentAppPath)) {
  const enrollmentHtml = readFileSync(enrollmentHtmlPath, "utf8");
  const enrollmentApp = readFileSync(enrollmentAppPath, "utf8");
  assert(/\.\/auth-config\.js/.test(enrollmentHtml) && /\.\/auth-guard\.js/.test(enrollmentHtml), `${artifactLabel}/enrollment.html ist nicht an die Target-Authentisierung gebunden`);
  assert(/\.\/data\/runtime-config\.js/.test(enrollmentHtml), `${artifactLabel}/enrollment.html laedt die geschuetzte Runtime nicht`);
  assert(!/<script(?![^>]+src=)[^>]*>/i.test(enrollmentHtml), `${artifactLabel}/enrollment.html enthaelt ein Inline-Skript`);
  assert(!/\son[a-z]+\s*=/i.test(enrollmentHtml), `${artifactLabel}/enrollment.html enthaelt einen Inline-Eventhandler`);
  for (const contract of [
    '"/api/session"',
    '"/api/auth/auto-enrollment"',
    '"/api/auth/enrollment"',
    'method: "POST"',
    'credentials: "include"',
    "requestId",
    'payload.status === "active"'
  ]) {
    assert(enrollmentApp.includes(contract), `${artifactLabel}/enrollment.js verletzt den Enrollment-Vertrag: ${contract}`);
  }
  assert(!/\b(?:localStorage|sessionStorage|indexedDB|document\.write|eval)\b/.test(enrollmentApp), `${artifactLabel}/enrollment.js speichert Identitaetsdaten lokal oder verwendet unsichere DOM-Auswertung`);
  assert(!/\.innerHTML\s*=|insertAdjacentHTML/.test(enrollmentApp), `${artifactLabel}/enrollment.js rendert Serverantworten als HTML`);
  assert(!/\b(?:email|subject|sub)\b/i.test(enrollmentApp), `${artifactLabel}/enrollment.js darf keine IAP-Identitaetsattribute verarbeiten`);
  assert(/auto-enrollment-result/.test(enrollmentHtml) && /enrollment-fallback-copy/.test(enrollmentHtml), `${artifactLabel}/enrollment.html trennt automatische Aktivierung und manuellen Fallback nicht sichtbar`);
}

const targetAppPath = join(artifactRoot, "versorgungs-kompass.js");
if (existsSync(targetAppPath)) {
  const app = readFileSync(targetAppPath, "utf8");
  for (const [pattern, reason] of [
    [/legacy-owner-assignments|legacyOwnerAssignments/i, "einen fachlichen Owner-Fallback im Browser"],
    [/versorgungs-kompass-favorites|\bfavorites\.(?:add|delete|has)\s*\(/i, "fachliche Kontakt-Favoriten im Browser-Speicher"],
    [/manual-insert-examples|Beispielzeilen einfuegen|Beispielkontakt/i, "einfuellbare Beispieldaten im Realimport"],
    [/teamMemberAssignments/i, "eine hardcodierte Teamzuordnung"],
    [/defaultLocations|defaultOrganizations|priorityCycle/i, "indexbasierte Ersatz-Fachdaten"]
  ]) {
    assert(!pattern.test(app), `${artifactLabel}/versorgungs-kompass.js enthaelt ${reason}`);
  }
  assert(/testMarker/.test(app) && /test-data-badge/.test(app), `${artifactLabel}/versorgungs-kompass.js kennzeichnet isolierte Testdaten nicht sichtbar`);
  assert(/accessScope/.test(app) && /canExport/.test(app), `${artifactLabel}/versorgungs-kompass.js wertet den serverseitigen Testzugriffsvertrag nicht aus`);
}

const targetTeaserPath = join(artifactRoot, "versorgungs-kompass-map-teaser.js");
if (existsSync(targetTeaserPath)) {
  const teaser = readFileSync(targetTeaserPath, "utf8");
  assert(!/TEASER_CONTACTS|basemaps\.cartocdn\.com/i.test(teaser), `${artifactLabel}/versorgungs-kompass-map-teaser.js enthaelt fiktive Kontakte oder einen externen Kartenabruf`);
}

const textExtensions = new Set([".html", ".js", ".json", ".mjs"]);
const targetText = actualFiles
  .filter((file) => textExtensions.has(extname(file)))
  .map((file) => readFileSync(join(artifactRoot, file), "utf8"))
  .join("\n");

for (const [pattern, reason] of [
  [/https:\/\/[a-z0-9-]+\.supabase\.co/i, "eine direkte Supabase-Projekt-URL"],
  [/@supabase\/supabase-js|supabase-js@/i, "das Supabase Browser-SDK"],
  [/service[_-]?role/i, "einen Service-Role-Hinweis"],
  [/storage\/v1\/object\/public\/(?:profile-images|stakeholder-logos|protected-source-assets)/i, "einen oeffentlichen Pfad zu geschuetzten Assets"]
]) {
  assert(!pattern.test(targetText), `${artifactLabel} enthaelt ${reason}`);
}

const targetTextWithoutImportOperator = actualFiles
  .filter((file) => textExtensions.has(extname(file)))
  .filter((file) => !file.startsWith("hospitation/import."))
  .map((file) => readFileSync(join(artifactRoot, file), "utf8"))
  .join("\n");
assert(
  !/(?:local-hospitation|localHospitation|HOSPITATION_PRIVATE|document\.write\s*\()/i.test(targetTextWithoutImportOperator),
  `${artifactLabel} enthaelt ausserhalb des geschuetzten Import-Operators einen lokalen oder privaten Hospitations-Hook`
);

const importHtmlPath = join(artifactRoot, "hospitation", "import.html");
const importAppPath = join(artifactRoot, "hospitation", "import.js");
if (existsSync(importHtmlPath) && existsSync(importAppPath)) {
  const importHtml = readFileSync(importHtmlPath, "utf8");
  const importApp = readFileSync(importAppPath, "utf8");
  assert(/\.\.\/auth-config\.js/.test(importHtml) && /\.\.\/auth-guard\.js/.test(importHtml), `${artifactLabel}/hospitation/import.html ist nicht an die Target-Authentisierung gebunden`);
  assert(/\.\.\/data\/runtime-config\.js/.test(importHtml), `${artifactLabel}/hospitation/import.html laedt die geschuetzte Runtime nicht`);
  assert(!/<script(?![^>]+src=)[^>]*>/i.test(importHtml), `${artifactLabel}/hospitation/import.html enthaelt ein Inline-Skript`);
  assert(!/\son[a-z]+\s*=/i.test(importHtml), `${artifactLabel}/hospitation/import.html enthaelt einen Inline-Eventhandler`);
  for (const contract of [
    'const SCHEMA_VERSION = "hospitation-staging/v1"',
    'const OWNER_REF = "timo-frank"',
    'const CONFIRMATION = "HOSPITATIONEN IMPORTIEREN"',
    '"/api/admin/hospitation-import/preview"',
    '"/api/admin/hospitation-import/apply"',
    'profile?.role || ""',
    'url.origin !== window.location.origin'
  ]) {
    assert(importApp.includes(contract), `${artifactLabel}/hospitation/import.js verletzt den Operatorvertrag: ${contract}`);
  }
  assert(!/\b(?:localStorage|sessionStorage|indexedDB|document\.write|eval)\b/.test(importApp), `${artifactLabel}/hospitation/import.js speichert Fachdaten lokal oder verwendet unsichere DOM-Auswertung`);
  assert(!/\.innerHTML\s*=|insertAdjacentHTML/.test(importApp), `${artifactLabel}/hospitation/import.js rendert Server- oder Dateiinhalte als HTML`);
}

const manifestPath = join(artifactRoot, "build-manifest.json");
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert(manifest.profile === "target", `${artifactLabel}/build-manifest.json ist kein Target-Manifest`);
    assert(/^sha256:[0-9a-f]{64}$/.test(manifest.artifactDigest || ""), `${artifactLabel}/build-manifest.json enthaelt keinen gueltigen Artefakt-Digest`);
  } catch (error) {
    failures.push(`${artifactLabel}/build-manifest.json ist ungueltig: ${error.message}`);
  }
}

if (failures.length) {
  console.error("Target Asset Audit FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Target Asset Audit OK: ${artifactLabel} enthaelt die geschuetzte API-Anwendung ohne Demo-Datensatz, direkte Supabase-Browseranbindung oder oeffentliche Fachassets.`);
