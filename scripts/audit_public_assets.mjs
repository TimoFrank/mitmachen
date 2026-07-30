import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import htmlMetadataTags from "./html_metadata_tags.cjs";

const { parseHtmlAttributes, scanHtmlStartTags } = htmlMetadataTags;

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
  const pngSignature = "89504e470d0a1a0a";
  if (image.length < 45 || image.subarray(0, 8).toString("hex") !== pngSignature) return null;

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

const pagesBaseUrl = "https://timofrank.github.io/mitmachen";
const shareContracts = [
  {
    documents: ["index.html", "versorgungs-kompass.html", "demo/index.html"],
    url: `${pagesBaseUrl}/`,
    title: "#Mitmachen",
    description: "Zusammenarbeit in der Versorgung – auf einen Blick.",
    image: `${pagesBaseUrl}/public/media/social/mitmachen-share-v3.png`,
    imageAlt: "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund.",
    imagePath: "public/media/social/mitmachen-share-v3.png"
  },
  {
    documents: ["mitmachen/versorgungs-netzwerk.html"],
    url: `${pagesBaseUrl}/mitmachen/versorgungs-netzwerk.html`,
    title: "Ihre Erfahrung zählt: Digitale Versorgung besser machen",
    description: "Entdecken Sie die Idee des Versorgungs-Netzwerks – als Konzeptdemo mit fiktiven Angaben, ohne echte Anmeldung, Übermittlung oder Speicherung.",
    image: `${pagesBaseUrl}/public/media/social/versorgungs-netzwerk-share-v1.png`,
    imageAlt: "#Mitmachen Versorgungs-Netzwerk: Ihre Erfahrung zählt – Konzeptdemo für digitale Beteiligung.",
    imagePath: "public/media/social/versorgungs-netzwerk-share-v1.png"
  }
];

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
  "versorgungs-kompass-no-script.css",
  "versorgungs-kompass.js",
  "versorgungs-kompass-routes.js",
  "hospitation/index.html",
  "hospitation/hospitation.css",
  "hospitation/hospitation.js",
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
  "state-flags/berlin.svg",
  "state-flags/brandenburg.svg",
  "state-flags/bremen.svg",
  "state-flags/niedersachsen.svg",
  "state-flags/rheinland-pfalz.svg",
  "state-flags/saarland.svg",
  "state-flags/sachsen-anhalt.svg",
  "deutschlandkarte-project/data/de-geojson.js",
  "deutschlandkarte-project/data/city-labels.js",
  "deutschlandkarte-project/data/state-labels.js",
  "deutschlandkarte-project/data/state-polygons.js",
  "deutschlandkarte-project/data/constituency-polygons.js",
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
  "public/brand/mitmachen/icons/app-icon-180.png",
  "public/brand/mitmachen/icons/app-icon-192.png",
  "public/brand/mitmachen/icons/app-icon-32.png",
  "public/brand/mitmachen/icons/app-icon-512.png",
  "public/brand/mitmachen/lockup-horizontal.svg",
  "public/brand/mitmachen/mark-on-dark.svg",
  "public/brand/mitmachen/mark.svg",
  "public/brand/modules/formate/mark-on-dark.svg",
  "public/brand/modules/formate/mark.svg",
  "public/brand/modules/hospitation/mark-on-dark.svg",
  "public/brand/modules/hospitation/mark.svg",
  "public/brand/modules/stakeholder/mark-on-dark.svg",
  "public/brand/modules/stakeholder/mark.svg",
  "public/brand/versorgungs-kompass/mark-on-dark.svg",
  "public/brand/versorgungs-kompass/mark.svg",
  "public/demo-profile-admin.svg",
  "public/demo-profile-editor.svg",
  "public/demo-profile-viewer.svg",
  "public/hospitation/mitmachen-hospitations-framework.docx",
  "public/hospitation/mitmachen-hospitations-framework.pdf",
  "public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg",
  "public/media/social/mitmachen-share-v1.png",
  "public/media/social/mitmachen-share-v2.png",
  "public/media/social/mitmachen-share-v3.png",
  "public/media/social/versorgungs-netzwerk-share-v1.png"
]);

for (const required of requiredFiles) {
  assert(actualFiles.includes(required), `${artifactLabel}/${required} fehlt in der Demo-Positivliste`);
}
for (const file of actualFiles) {
  assert(requiredFiles.has(file), `${artifactLabel}/${file} ist nicht fuer die oeffentliche Demo freigegeben`);
}

for (const contract of shareContracts) {
  const imagePath = join(artifactRoot, contract.imagePath);
  if (existsSync(imagePath)) {
    const dimensions = inspectPng(imagePath);
    assert(
      dimensions?.width === 1200 && dimensions?.height === 630,
      `${artifactLabel}/${contract.imagePath} muss ein PNG mit 1200 x 630 Pixeln sein`
    );
    assert(
      statSync(imagePath).size <= 600_000,
      `${artifactLabel}/${contract.imagePath} muss fuer Messenger hoechstens 600 KB gross sein`
    );
  }

  for (const document of contract.documents) {
    const documentPath = join(artifactRoot, document);
    if (!existsSync(documentPath)) continue;
    const html = readFileSync(documentPath, "utf8");
    const label = `${artifactLabel}/${document}`;
    assert(canonicalHref(html, label) === contract.url, `${label} verwendet nicht die kanonische Pages-URL`);
    for (const [property, expected] of [
      ["og:type", "website"],
      ["og:locale", "de_DE"],
      ["og:site_name", "#Mitmachen"],
      ["og:title", contract.title],
      ["og:description", contract.description],
      ["og:url", contract.url],
      ["og:image", contract.image],
      ["og:image:secure_url", contract.image],
      ["og:image:type", "image/png"],
      ["og:image:width", "1200"],
      ["og:image:height", "630"],
      ["og:image:alt", contract.imageAlt]
    ]) {
      assert(
        metadataContent(html, "property", property, label) === expected,
        `${label} verwendet fuer ${property} nicht den freigegebenen Wert`
      );
    }
    for (const [name, expected] of [
      ["twitter:card", "summary_large_image"],
      ["twitter:title", contract.title],
      ["twitter:description", contract.description],
      ["twitter:image", contract.image],
      ["twitter:image:alt", contract.imageAlt]
    ]) {
      assert(
        metadataContent(html, "name", name, label) === expected,
        `${label} verwendet fuer ${name} nicht den freigegebenen Wert`
      );
    }
    for (const url of [canonicalHref(html, label), metadataContent(html, "property", "og:url", label), metadataContent(html, "property", "og:image", label)]) {
      try {
        assert(new URL(url).protocol === "https:", `${label} verwendet eine nicht sichere Share-URL: ${url}`);
      } catch {
        assert(false, `${label} verwendet eine ungueltige Share-URL: ${url}`);
      }
    }
  }
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
    assert(
      resolvedReference === artifactRoot || resolvedReference.startsWith(`${artifactRoot}${sep}`),
      `${artifactLabel}/${htmlFile} referenziert ausserhalb des Artefakts: ${reference}`
    );
    assert(existsSync(expectedPath), `${artifactLabel}/${htmlFile} referenziert fehlendes Asset: ${reference}`);
  }
}

for (const [pattern, reason] of [
  [/supabase(?:\.co|-js|AnonKey|Url)|sb_(?:secret|publishable)_/i, "Supabase-Zugriff oder -Konfiguration"],
  [/service[_-]?role/i, "Service-Role-Hinweis"],
  [/\bVK_DEMO_BACKEND\b/, "umschaltbaren Demo-Backendmodus"],
  [/expertenkreis-data|stakeholder-data|patienten-data|versorgungs-kompass-data/i, "statischer Real- oder Fallbackdatensatz"],
  [/auth-guard|auth-login|set-password/i, "Login- oder Authentisierungsoberflaeche"],
  [new RegExp(["arbeits", "raum"].join(""), "i"), "nicht mehr freigegebenes Wording"],
  [/(?:local-hospitation|localHospitation|HOSPITATION_PRIVATE|document\.write\s*\()/i, "lokalen oder privaten Hospitations-Hook"]
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
  assert(/cleanUrls:\s*false/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js darf ohne Rewrite-Server keine Clean URLs aktivieren`);
  assert(/ownerOnlyContactChannels:\s*true/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js aktiviert den Owner-Schutz fuer Kontaktkanaele nicht`);
  assert(/allDemoContactsInvitable:\s*true/.test(runtimeConfig), `${artifactLabel}/data/runtime-config.js gibt nicht alle Demo-Bestandskontakte fuer Einladungen frei`);
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
  for (const brand of ["Versorgungs-Kompass", "Stakeholder-Kompass", "Hospitations-Kompass", "Format-Kompass"]) {
    assert(appHtml.includes(`<strong>${brand}</strong>`), `${artifactLabel}/versorgungs-kompass.html enthaelt die Marke ${brand} nicht auf der Startseite`);
  }
  for (const mark of [
    "public/brand/versorgungs-kompass/mark.svg",
    "public/brand/modules/stakeholder/mark.svg",
    "public/brand/modules/hospitation/mark.svg",
    "public/brand/modules/formate/mark.svg"
  ]) {
    assert(appHtml.includes(mark), `${artifactLabel}/versorgungs-kompass.html referenziert das Signet ${mark} nicht`);
  }
  for (const label of ["Versorgung", "Auswertung", "Aktivitäten", "Stakeholder", "Expertenkreis", "Hospitationen", "Beobachtungen", "Fragebogen", "Dashboard", "Formate", "Teams"]) {
    assert(appHtml.includes(label), `${artifactLabel}/versorgungs-kompass.html enthaelt den Voll-App-Bereich ${label} nicht`);
  }
}

const pagesRootPath = join(artifactRoot, "index.html");
if (existsSync(pagesRootPath) && existsSync(appHtmlPath)) {
  const pagesRootHtml = readFileSync(pagesRootPath, "utf8");
  const appHtml = readFileSync(appHtmlPath, "utf8");
  const noScriptCss = readFileSync(join(artifactRoot, "versorgungs-kompass-no-script.css"), "utf8");
  assert(pagesRootHtml === appHtml, `${artifactLabel}/index.html muss direkt dieselbe App-Shell wie versorgungs-kompass.html ausliefern`);
  assert(/class=["'][^"']*\bapp-shell\b/.test(pagesRootHtml), `${artifactLabel}/index.html enthaelt nicht die App-Shell`);
  assert(/data-view-panel=["']home["']/.test(pagesRootHtml), `${artifactLabel}/index.html enthaelt nicht die Startseite`);
  assert(
    /<noscript>[\s\S]*href=["']\.\/versorgungs-kompass-no-script\.css["'][^>]*data-no-script-home[^>]*>[\s\S]*<\/noscript>/i.test(pagesRootHtml)
      && /\.view-panel\[data-view-panel=["']home["']\]\s*\{[\s\S]*display:\s*block\s*!important/i.test(noScriptCss)
      && /button\[data-home-scroll-cue\]\s*\{[\s\S]*display:\s*none/i.test(noScriptCss),
    `${artifactLabel}/index.html muss die Startseite auch ohne JavaScript sichtbar halten`
  );
  assert(
    /<meta\s+name=["']robots["']\s+content=["']noindex,\s*nofollow["']\s*\/?>/i.test(pagesRootHtml),
    `${artifactLabel}/index.html muss die oeffentliche Demo von der Indexierung ausschliessen`
  );
  assert(!/data-public-entry=["']home["']|data-public-entry-styles|>\s*Demo öffnen(?:\s|<)/i.test(pagesRootHtml), `${artifactLabel}/index.html enthaelt noch den entfernten Pages-Einstieg`);
  assert(!/<meta\s+http-equiv=["']refresh["']/i.test(pagesRootHtml), `${artifactLabel}/index.html darf nicht weiterleiten`);
}
assert(
  !actualFiles.includes("public-entry.css"),
  `${artifactLabel}/public-entry.css darf nicht als zusaetzliche oeffentliche Ressource ausgeliefert werden`
);
assert(!actualFiles.includes("mitmachen/index.html"), `${artifactLabel}/mitmachen/index.html darf nicht oeffentlich ausgeliefert werden`);
assert(!actualFiles.includes("mitmachen/mitmachen.css"), `${artifactLabel}/mitmachen/mitmachen.css darf nicht oeffentlich ausgeliefert werden`);

const manifestPath = join(artifactRoot, "manifest.webmanifest");
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert(manifest.name === "#Mitmachen", `${artifactLabel}/manifest.webmanifest verwendet nicht #Mitmachen als Namen`);
    for (const brand of ["Versorgungs-Kompass", "Stakeholder-Kompass", "Hospitations-Kompass", "Format-Kompass"]) {
      assert(manifest.description?.includes(brand), `${artifactLabel}/manifest.webmanifest nennt ${brand} nicht`);
    }
    assert(manifest.start_url === "./#home", `${artifactLabel}/manifest.webmanifest startet nicht direkt auf der Startseite`);
    assert(manifest.scope === "./", `${artifactLabel}/manifest.webmanifest verwendet nicht den Pages-Scope`);
    assert(
      manifest.icons?.every((icon) => icon.src?.startsWith("./public/brand/mitmachen/icons/")),
      `${artifactLabel}/manifest.webmanifest verwendet nicht durchgehend die #Mitmachen-App-Icons`
    );
  } catch (error) {
    assert(false, `${artifactLabel}/manifest.webmanifest ist ungueltig (${error.message})`);
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
  const approvedResearchHosts = new Set([
    "www.bundesaerztekammer.de",
    "www.bundesgesundheitsministerium.de",
    "www.destatis.de",
    "www.divi.de",
    "www.g-ba.de",
    "www.gematik.de",
    "www.gkv-spitzenverband.de",
    "www.kbv.de",
    "www.rki.de",
  ]);
  assert(/synthetisch|fiktiv/i.test(demoData), `${artifactLabel}/data/demo-data.js ist nicht deutlich als synthetisch gekennzeichnet`);
  assert(/demo-(?:profile|contact|org|hospitation|format)/i.test(demoData), `${artifactLabel}/data/demo-data.js verwendet keine nachvollziehbaren Demo-IDs`);
  assert(!/hospitation-avatars|profile-images|storage\/v1/i.test(demoData), `${artifactLabel}/data/demo-data.js referenziert nicht freigegebene Personenbilder`);

  for (const email of demoData.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
    assert(/@(?:[a-z0-9-]+\.)*example\.(?:test|invalid)$/i.test(email), `${artifactLabel}/data/demo-data.js enthaelt keine klar reservierte Demo-Adresse: ${email}`);
  }
  for (const match of demoData.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    const host = match[1].toLowerCase();
    assert(
      /(?:^|\.)example\.(?:test|invalid)$/.test(host) || approvedResearchHosts.has(host),
      `${artifactLabel}/data/demo-data.js enthaelt nicht freigegebene externe Domain: ${host}`,
    );
  }
}

if (failures.length) {
  console.error("Public Asset Audit FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Public Asset Audit OK: ${artifactLabel} enthaelt die gemeinsame Voll-App-Shell mit lokaler synthetischer Demo-Runtime, ohne Login, Supabase oder geschuetzte Fachdaten.`);
