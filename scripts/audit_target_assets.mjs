import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import htmlMetadataTags from "./html_metadata_tags.cjs";

const { parseHtmlAttributes, scanHtmlStartTags } = htmlMetadataTags;

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

function parsedMetadataTags(html, tagNames, label) {
  return scanHtmlStartTags(html, tagNames).map((tag) => {
    const parsed = parseHtmlAttributes(tag);
    assert(
      parsed.duplicateNames.length === 0,
      `${label} darf in Share-relevanten Tags keine doppelten Attribute enthalten: ${parsed.duplicateNames.join(", ")}`
    );
    assert(
      parsed.structuralCharacterReferenceNames.length === 0,
      `${label} darf name, property oder rel nicht per Zeichenreferenz verschleiern`
    );
    return parsed.values;
  });
}

function metadataContent(html, attribute, key, label) {
  const matches = parsedMetadataTags(html, ["meta"], label)
    .filter((attributes) => String(attributes[attribute] || "").toLowerCase() === key.toLowerCase());
  assert(matches.length === 1, `${label} muss genau ein ${attribute}="${key}" enthalten`);
  return matches[0]?.content;
}

function canonicalHref(html, label) {
  const matches = parsedMetadataTags(html, ["link"], label)
    .filter((attributes) => String(attributes.rel || "").toLowerCase().split(/\s+/).includes("canonical"));
  assert(matches.length === 1, `${label} muss genau einen Canonical-Link enthalten`);
  return matches[0]?.href;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(filePath) {
  const image = readFileSync(filePath);
  if (image.length < 45 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;

  let offset = 8;
  let width;
  let height;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset + 12 <= image.length) {
    const length = image.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > image.length) return null;

    const type = image.subarray(typeStart, dataStart).toString("ascii");
    const expectedCrc = image.readUInt32BE(dataEnd);
    if (crc32(image.subarray(typeStart, dataEnd)) !== expectedCrc) return null;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return null;
      width = image.readUInt32BE(dataStart);
      height = image.readUInt32BE(dataStart + 4);
      sawHeader = true;
    } else if (type === "IHDR") {
      return null;
    }
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || chunkEnd !== image.length) return null;
      sawEnd = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
  }

  if (!sawHeader || !sawImageData || !sawEnd || offset !== image.length) return null;
  return { width, height };
}

assert(existsSync(artifactRoot) && statSync(artifactRoot).isDirectory(), `${artifactLabel} fehlt oder ist kein Verzeichnis`);

const actualFiles = walk(artifactRoot)
  .map((file) => relative(artifactRoot, file).split(sep).join("/"))
  .sort();

for (const required of [
  "build-manifest.json",
  "index.html",
  "public-index.html",
  "login.html",
  "mitmachen/index.html",
  "versorgungs-kompass.html",
  "versorgungs-kompass.css",
  "versorgungs-kompass-no-script.css",
  "versorgungs-kompass.js",
  "versorgungs-kompass-routes.js",
  "versorgungs-kompass-map.html",
  "versorgungs-kompass-map.css",
  "versorgungs-kompass-map.js",
  "data/data-service.js",
  "data/runtime-config.js",
  "hospitation/import.html",
  "hospitation/import.css",
  "hospitation/import.js",
  "public/brand/mitmachen/flechtwerk-lockup-horizontal-on-dark.svg",
  "public/brand/mitmachen/flechtwerk-lockup-horizontal.svg",
  "public/brand/mitmachen/flechtwerk-mark-on-dark.svg",
  "public/brand/mitmachen/flechtwerk-mark.svg",
  "public/brand/mitmachen/lockup-horizontal.svg",
  "public/brand/mitmachen/mark-on-dark.svg",
  "public/brand/mitmachen/mark.svg",
  "public/brand/modules/formate/lockup-horizontal.svg",
  "public/brand/modules/formate/mark-on-dark.svg",
  "public/brand/modules/formate/mark.svg",
  "public/brand/modules/hospitation/lockup-horizontal.svg",
  "public/brand/modules/hospitation/mark-on-dark.svg",
  "public/brand/modules/hospitation/mark.svg",
  "public/brand/modules/stakeholder/lockup-horizontal.svg",
  "public/brand/modules/stakeholder/mark-on-dark.svg",
  "public/brand/modules/stakeholder/mark.svg",
  "public/brand/versorgungs-kompass/lockup-horizontal.svg",
  "public/brand/versorgungs-kompass/mark-on-dark.svg",
  "public/brand/versorgungs-kompass/mark.svg",
  "public/media/social/mitmachen-share-v3.png"
]) {
  assert(actualFiles.includes(required), `${artifactLabel}/${required} fehlt im geschuetzten Target-Artefakt`);
}

for (const forbidden of [
  "public-login.html",
  "enrollment.html",
  "enrollment.css",
  "enrollment.js",
  "demo/index.html",
  "politik-offline.html",
  "data/public-politics-directory.js",
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
assert(
  !actualFiles.some((file) => file === "politik-offline.html" || file.endsWith("/politik-offline.html")),
  `${artifactLabel} darf keine verschachtelte Kopie von politik-offline.html enthalten`
);

for (const forbiddenPrefix of [
  "demo/",
  "vendor/supabase/",
  "public/hospitation-avatars/",
  "public/stakeholder-logos/"
]) {
  assert(!actualFiles.some((file) => file.startsWith(forbiddenPrefix)), `${artifactLabel}/${forbiddenPrefix} darf nicht in das Target-Artefakt gelangen`);
}

const approvedPublicAuthFiles = [
  "public/auth/assets/action.css",
  "public/auth/assets/action.js",
  "public/auth/assets/app.css",
  "public/auth/assets/app.js",
  "public/auth/brand/versorgungs-kompass.svg",
  "public/auth/index.html",
  "public/auth/konto/passwort-festlegen/index.html",
  "public/auth/portal-config.js"
].sort();
const actualPublicAuthFiles = actualFiles
  .filter((file) => file.startsWith("public/auth/"))
  .sort();

const configPath = join(artifactRoot, "data", "runtime-config.js");
let targetBaseUrl = "";
let targetAuthMode = "";
if (existsSync(configPath)) {
  const config = readFileSync(configPath, "utf8");
  assert(/dataMode:\s*"api"/.test(config), `${artifactLabel}/data/runtime-config.js erzwingt nicht den API-Modus`);
  assert(/requireApiGateway:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js erzwingt nicht das API-Gateway`);
  assert(/cleanUrls:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js aktiviert die kanonischen Anwendungspfade nicht`);
  assert(/apiCredentials:\s*"include"/.test(config), `${artifactLabel}/data/runtime-config.js sendet keine geschuetzte Sitzung`);
  targetAuthMode = /authMode:\s*"(iap|oidc)"/.exec(config)?.[1] || "";
  assert(Boolean(targetAuthMode), `${artifactLabel}/data/runtime-config.js verwendet keinen erlaubten signierten Auth-Modus`);
  assert(!/ownerOnlyContactChannels:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js darf den Pages-spezifischen Owner-Schutz nicht aktivieren`);
  assert(!/allDemoContactsInvitable:\s*true/.test(config), `${artifactLabel}/data/runtime-config.js darf keine synthetische Demo-Einladungsfreigabe aktivieren`);
  assert(!/supabaseUrl|supabaseAnonKey|registrationEndpoint/.test(config), `${artifactLabel}/data/runtime-config.js enthaelt direkte Supabase-Browserkonfiguration`);
  targetBaseUrl = /apiBaseUrl:\s*"([^"]+)"/.exec(config)?.[1] || "";
  try {
    const parsedTargetBaseUrl = new URL(targetBaseUrl);
    assert(
      parsedTargetBaseUrl.protocol === "https:" && parsedTargetBaseUrl.origin === targetBaseUrl,
      `${artifactLabel}/data/runtime-config.js enthaelt keinen sicheren kanonischen Target-Origin`
    );
  } catch {
    assert(false, `${artifactLabel}/data/runtime-config.js enthaelt keinen gueltigen Target-Origin`);
  }
}

if (targetAuthMode === "iap") {
  assert(
    JSON.stringify(actualPublicAuthFiles) === JSON.stringify(approvedPublicAuthFiles),
    `${artifactLabel}/public/auth muss fuer IAP exakt die acht freigegebenen Identity-Portal-Dateien enthalten`
  );
} else if (targetAuthMode === "oidc") {
  assert(
    actualPublicAuthFiles.length === 0,
    `${artifactLabel}/public/auth ist im providerneutralen OIDC-Artefakt nicht zulaessig`
  );
}

const shareImagePath = join(artifactRoot, "public", "media", "social", "mitmachen-share-v3.png");
if (existsSync(shareImagePath)) {
  const approvedShareImagePath = join(root, "public", "media", "social", "mitmachen-share-v3.png");
  const dimensions = inspectPng(shareImagePath);
  assert(
    dimensions?.width === 1200 && dimensions?.height === 630,
    `${artifactLabel}/public/media/social/mitmachen-share-v3.png muss ein PNG mit 1200 x 630 Pixeln sein`
  );
  assert(
    statSync(shareImagePath).size <= 600_000,
    `${artifactLabel}/public/media/social/mitmachen-share-v3.png muss fuer Messenger hoechstens 600 KB gross sein`
  );
  assert(
    existsSync(approvedShareImagePath)
      && readFileSync(shareImagePath).equals(readFileSync(approvedShareImagePath)),
    `${artifactLabel}/public/media/social/mitmachen-share-v3.png muss bytegleich mit dem freigegebenen Pages-Bild sein`
  );
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
  const noScriptCss = readFileSync(join(artifactRoot, "versorgungs-kompass-no-script.css"), "utf8");
  assert(!/data\/(?:public-politics-directory|demo-data|versorgungs-kompass-data|expertenkreis-data|stakeholder-data|patienten-data)\.js/i.test(html), `${artifactLabel}/versorgungs-kompass.html referenziert statische Demo- oder Realbestandsdaten`);
  assert(/<noscript>[\s\S]*href=["']\/versorgungs-kompass-no-script\.css["'][^>]*data-no-script-home[^>]*>[\s\S]*<\/noscript>/i.test(html), `${artifactLabel}/versorgungs-kompass.html bindet den statischen Startseiten-Fallback nicht ein`);
  assert(/\.view-panel\[data-view-panel=["']home["']\]\s*\{[\s\S]*display:\s*block\s*!important/i.test(noScriptCss), `${artifactLabel}/versorgungs-kompass-no-script.css haelt die Startseite nicht sichtbar`);
  assert(!/data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)=["']demo["']/i.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt einen Demo-/Echt-Umschalter`);
  assert(!/id=["']registrations-reset-demo["']/i.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt eine Demo-Reset-Funktion`);
  assert(/data-target-session/.test(html) && /id=["']profile-logout["']/.test(html), `${artifactLabel}/versorgungs-kompass.html enthaelt die Target-Sitzungssteuerung nicht`);
}

for (const relativePath of ["index.html", "mitmachen/index.html"]) {
  const entryPath = join(artifactRoot, relativePath);
  if (!existsSync(entryPath)) continue;
  const entryHtml = readFileSync(entryPath, "utf8");
  assert(
    !/data-target-enrollment|Testzugang aktivieren|(?:login\/)?enrollment\.html/i.test(entryHtml),
    `${artifactLabel}/${relativePath} darf keinen Self-Service-Testzugang mehr anbieten`
  );
}

for (const relativePath of ["public-index.html"]) {
  const documentPath = join(artifactRoot, relativePath);
  if (!existsSync(documentPath)) continue;
  const html = readFileSync(documentPath, "utf8");
  assert(
    /data-public-entry=["']home["']/.test(html),
    `${artifactLabel}/${relativePath} besitzt nicht den erwarteten Public-Entry-Marker`
  );
  assert(
    (html.match(/<style\b[^>]*data-public-entry-styles[^>]*>/gi) || []).length === 1,
    `${artifactLabel}/${relativePath} muss genau einen eingebetteten Public-Styleblock enthalten`
  );
  assert(
    !/<link\b[^>]*rel=[\"']stylesheet[\"']/i.test(html),
    `${artifactLabel}/${relativePath} darf kein oeffentliches Stylesheet nachladen`
  );
  assert(
    !/<script\b|<iframe\b|<form\b|<input\b|<button\b|<object\b|<embed\b/i.test(html),
    `${artifactLabel}/${relativePath} darf keine aktive oder eingebettete Laufzeit enthalten`
  );
  assert(
    !/\ssrc\s*=|\son[a-z]+\s*=|@import|url\s*\(/i.test(html),
    `${artifactLabel}/${relativePath} darf keine externen Unterressourcen oder Inline-Handler enthalten`
  );
  assert(
    !/(?:runtime-config|auth-(?:config|guard|login)|supabase|localStorage|sessionStorage|indexedDB)/i.test(html),
    `${artifactLabel}/${relativePath} enthaelt geschuetzte Laufzeit- oder Datenzugriffe`
  );
  const apiReferences = html.match(/\/api\//gi) || [];
  assert(
    apiReferences.length === 0,
    `${artifactLabel}/${relativePath} enthaelt einen nicht freigegebenen API-Pfad`
  );
  assert(
    (html.match(/href=[\"']\/start[\"']/gi) || []).length === 1
      && /data-public-login-button/.test(html),
    `${artifactLabel}/${relativePath} muss exakt einmal den geschuetzten Target-Einstieg ausloesen`
  );
  assert(
    !/data-google-sso-button|Mit Google anmelden/i.test(html),
    `${artifactLabel}/${relativePath} darf keinen Google-only-CTA mehr enthalten`
  );
}

const publicIndexPath = join(artifactRoot, "public-index.html");
if (existsSync(publicIndexPath)) {
  const html = readFileSync(publicIndexPath, "utf8");
  const label = `${artifactLabel}/public-index.html`;
  const shareUrl = `${targetBaseUrl}/`;
  const shareImage = `${targetBaseUrl}/public/media/social/mitmachen-share-v3.png`;
  const headEnd = html.toLowerCase().indexOf("</head>");
  assert(headEnd >= 0, `${label} enthaelt keinen geschlossenen head-Bereich`);
  assert(
    Buffer.byteLength(html.slice(0, headEnd + "</head>".length), "utf8") <= 300_000,
    `${label} muss den vollstaendigen Open-Graph-head innerhalb der ersten 300 KB fuer WhatsApp ausliefern`
  );
  assert(canonicalHref(html, label) === shareUrl, `${label} verwendet nicht die kanonische Target-URL`);
  for (const [property, expected] of [
    ["og:type", "website"],
    ["og:locale", "de_DE"],
    ["og:site_name", "#Mitmachen"],
    ["og:title", "#Mitmachen"],
    ["og:description", "Deine Plattform für Austausch, Wissen und Vernetzung."],
    ["og:url", shareUrl],
    ["og:image", shareImage],
    ["og:image:secure_url", shareImage],
    ["og:image:type", "image/png"],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    ["og:image:alt", "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund."]
  ]) {
    assert(
      metadataContent(html, "property", property, label) === expected,
      `${label} verwendet fuer ${property} nicht denselben freigegebenen Wert wie Pages`
    );
  }
  for (const [name, expected] of [
    ["twitter:card", "summary_large_image"],
    ["twitter:title", "#Mitmachen"],
    ["twitter:description", "Deine Plattform für Austausch, Wissen und Vernetzung."],
    ["twitter:image", shareImage],
    ["twitter:image:alt", "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund."]
  ]) {
    assert(
      metadataContent(html, "name", name, label) === expected,
      `${label} verwendet fuer ${name} nicht denselben freigegebenen Wert wie Pages`
    );
  }
  assert(
    (html.match(/href=[\"']\/start[\"']/gi) || []).length === 1
      && /data-public-login-button/.test(html)
      && !/data-public-action-note|Google oder einem persönlich freigeschalteten E-Mail-Konto/.test(html),
    `${artifactLabel}/public-index.html muss ausschließlich den providerneutralen CTA ueber den geschuetzten Target-Einstieg enthalten`
  );
  assert(
    /<h1[^>]*>Willkommen\.<\/h1>/.test(html)
      && /data-home-compass-rotation/.test(html)
      && ["Versorgungs-Kompass", "Stakeholder-Kompass", "Hospitations-Kompass", "Format-Kompass"].every((name) => html.includes(name))
      && /home-hero__brand/.test(html),
    `${artifactLabel}/public-index.html muss Begrüßung, vier Kompasse und große #Mitmachen-Marke der eingeloggten Startseite übernehmen`
  );
  assert(
    !/home-compass-rotation__control|home-scroll-cue|Bereiche ansehen/.test(html),
    `${artifactLabel}/public-index.html darf im nicht eingeloggten Zustand weder Animationssteuerung noch Bereichs-CTA enthalten`
  );
  for (const area of ["Versorgung", "Stakeholder", "Hospitation", "Formate"]) {
    assert(html.includes(`<strong>${area}</strong>`), `${artifactLabel}/public-index.html beschreibt den Bereich ${area} nicht`);
  }
  assert(
    /id=["']zugriff-verweigert["'][\s\S]*role=["']alert["']/.test(html)
      && /Anmeldung nicht möglich\./.test(html),
    `${artifactLabel}/public-index.html enthaelt keinen neutralen, scriptfreien 403-Zustand`
  );
  assert(
    !/data-target-enrollment|Testzugang aktivieren|href=[\"']\/enrollment\.html[\"']/i.test(html),
    `${artifactLabel}/public-index.html darf keinen Self-Service-Einstieg enthalten`
  );
}

const identityPortalDocuments = [
  {
    relativePath: "public/auth/index.html",
    marker: "signin",
    stylesheet: "/public/auth/assets/app.css?v=20260731-1",
    script: "/public/auth/assets/app.js?v=20260731-1"
  },
  {
    relativePath: "public/auth/konto/passwort-festlegen/index.html",
    marker: "password",
    stylesheet: "/public/auth/assets/action.css?v=20260731-1",
    script: "/public/auth/assets/action.js?v=20260731-1"
  }
];
for (const { relativePath, marker, stylesheet, script } of targetAuthMode === "iap" ? identityPortalDocuments : []) {
  const documentPath = join(artifactRoot, relativePath);
  if (!existsSync(documentPath)) continue;
  const html = readFileSync(documentPath, "utf8");
  assert(
    new RegExp(`data-identity-portal=[\"']${marker}[\"']`).test(html),
    `${artifactLabel}/${relativePath} besitzt nicht den erwarteten Identity-Portal-Marker ${marker}`
  );
  assert(
    (html.match(new RegExp(`href=[\"']${stylesheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`, "g")) || []).length === 1
      && (html.match(new RegExp(`src=[\"']${script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`, "g")) || []).length === 1
      && (html.match(/src=[\"']\/public\/auth\/portal-config\.js[\"']/g) || []).length === 1
      && (html.match(/href=[\"']\/public\/auth\/brand\/versorgungs-kompass\.svg[\"']/g) || []).length === 1,
    `${artifactLabel}/${relativePath} referenziert nicht exakt seine freigegebenen lokalen Portal-Artefakte`
  );
  assert(
    !/<script\b[^>]*\bsrc=[\"']https?:|<link\b[^>]*\bhref=[\"']https?:|@import|url\s*\(\s*[\"']?https?:/i.test(html),
    `${artifactLabel}/${relativePath} darf keine externe Browser-Runtime nachladen`
  );
  assert(
    !/Konto erstellen|Jetzt registrieren|Selbst registrieren|Sign[\s-]?up/i.test(html),
    `${artifactLabel}/${relativePath} darf keine Selbstregistrierung anbieten`
  );
}

const identityPortalConfigPath = join(artifactRoot, "public", "auth", "portal-config.js");
if (targetAuthMode === "iap" && existsSync(identityPortalConfigPath)) {
  const config = readFileSync(identityPortalConfigPath, "utf8");
  assert(!/REPLACE_/.test(config), `${artifactLabel}/public/auth/portal-config.js enthaelt einen nicht ersetzten Platzhalter`);
  assert(
    /apiKey:\s*"AIza[0-9A-Za-z_-]{35}"/.test(config),
    `${artifactLabel}/public/auth/portal-config.js enthaelt keinen gueltigen Identity-Platform-Web-API-Key`
  );
  assert(
    /authDomain:\s*"versorgungs-kompass\.de"/.test(config)
      && /projectId:\s*"steam-capsule-341212"/.test(config),
    `${artifactLabel}/public/auth/portal-config.js ist nicht auf das freigegebene Identity-Platform-Projekt gepinnt`
  );
  assert(
    new RegExp(`allowedContinueOrigins:\\s*Object\\.freeze\\(\\[\\s*["']${targetBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*\\]\\)`).test(config),
    `${artifactLabel}/public/auth/portal-config.js erlaubt nicht exakt den geschuetzten Target-Origin`
  );
  assert(
    !/passwordResetContinueUrl/.test(config),
    `${artifactLabel}/public/auth/portal-config.js darf kein browsersteuerbares Passwort-Reset-Ziel enthalten`
  );
  assert(
    /enableLocalPreview:\s*false/.test(config),
    `${artifactLabel}/public/auth/portal-config.js darf den lokalen Vorschau-Modus im Target nicht aktivieren`
  );
}

const identityPortalAppPath = join(artifactRoot, "public", "auth", "assets", "app.js");
if (targetAuthMode === "iap" && existsSync(identityPortalAppPath)) {
  const app = readFileSync(identityPortalAppPath, "utf8");
  assert(
    /Mit Google anmelden/.test(app)
      && /E-Mail-Adresse/.test(app)
      && /Reset-Link senden/.test(app)
      && /\/api\/auth\/password-reset/.test(app),
    `${artifactLabel}/public/auth/assets/app.js muss Google, E-Mail/Passwort und den Broker-Reset anbieten`
  );
  assert(
    !/sendPasswordResetEmail/.test(app),
    `${artifactLabel}/public/auth/assets/app.js darf Identity Platform nicht direkt zum Reset-Mail-Versand aufrufen`
  );
  assert(
    /\/public\/auth\/brand\/versorgungs-kompass\.svg/.test(app)
      && !/[\"']\/brand\/versorgungs-kompass\.svg[\"']/.test(app),
    `${artifactLabel}/public/auth/assets/app.js darf das Markenasset nur ueber den freigegebenen Public-Auth-Pfad laden`
  );
  assert(
    !/Konto erstellen|Jetzt registrieren|Selbst registrieren|createUserWithEmailAndPassword/i.test(app),
    `${artifactLabel}/public/auth/assets/app.js enthaelt eine nicht freigegebene Selbstregistrierung`
  );
}

assert(
  !actualFiles.includes("public-entry.css"),
  `${artifactLabel}/public-entry.css darf nicht als zusaetzliche oeffentliche Ressource ausgeliefert werden`
);

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

if (targetAuthMode === "oidc") {
  for (const [pattern, reason] of [
    [/steam-capsule-341212|firebaseapp\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/i, "eine GCP-/Firebase-Laufzeitadresse"],
    [/\b(?:IDENTITY_PLATFORM|IAP_GCIP|IAP_EXTERNAL_AUTH_API_KEY)\b|AIza[0-9A-Za-z_-]{35}/, "GCP-IAP-/Identity-Platform-Konfiguration"]
  ]) {
    assert(!pattern.test(targetText), `${artifactLabel} enthaelt im OIDC-Modus ${reason}`);
  }
}

for (const [pattern, reason] of [
  [/https:\/\/[a-z0-9-]+\.supabase\.co/i, "eine direkte Supabase-Projekt-URL"],
  [/@supabase\/supabase-js|supabase-js@/i, "das Supabase Browser-SDK"],
  [/service[_-]?role/i, "einen Service-Role-Hinweis"],
  [/VERSORGUNGS_COMPASS_PUBLIC_POLITICS_DIRECTORY/, "den statischen Pages-Amtsträger-Datensatz"],
  [/(?:__POLITIK_OFFLINE_READY__|id=["']offline-data["']|politik-offline\.html)/i, "das eigenstaendige Pages-Politik-Offline-Modul"],
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

console.log(`Target Asset Audit OK: ${artifactLabel} enthaelt die geschuetzte API-Anwendung im ${targetAuthMode || "unbekannten"}-Modus ohne Demo-Datensatz, direkte Supabase-Browseranbindung oder oeffentliche Fachassets.`);
