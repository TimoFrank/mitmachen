import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import htmlMetadataTags from "./html_metadata_tags.cjs";

const { parseHtmlAttributes, scanHtmlStartTags } = htmlMetadataTags;

const root = process.cwd();
const distRoot = path.join(root, "dist");
fs.mkdirSync(distRoot, { recursive: true });
const fixtureRoot = fs.mkdtempSync(path.join(distRoot, ".deployment-separation-test-"));
const pagesDir = path.join(fixtureRoot, "pages");
const targetDir = path.join(fixtureRoot, "target");
const builder = path.join(root, "scripts", "build_static_frontend.sh");
const publicAudit = path.join(root, "scripts", "audit_public_assets.mjs");
const targetAudit = path.join(root, "scripts", "audit_target_assets.mjs");
const apiBaseUrl = "https://gateway.pre-gematik.example";

const quotedGreaterThanTag = scanHtmlStartTags(
  '<head><meta content="Wrong>Preview" property=og:title></head>',
  ["meta"]
);
assert.equal(quotedGreaterThanTag.length, 1, "Der Metadaten-Scanner darf nicht an > innerhalb von Quotes abbrechen");
assert.equal(parseHtmlAttributes(quotedGreaterThanTag[0]).values.content, "Wrong>Preview");

const duplicateAttributeTag = parseHtmlAttributes('<meta property="og:title" property="not-share" content="Wrong">');
assert.equal(duplicateAttributeTag.values.property, "og:title", "Attributparsing muss wie der Browser den ersten Wert behalten");
assert.deepEqual(duplicateAttributeTag.duplicateNames, ["property"]);

const encodedStructuralTag = parseHtmlAttributes('<meta property="og&#58;title" content="Wrong">');
assert.deepEqual(
  encodedStructuralTag.structuralCharacterReferenceNames,
  ["property"],
  "Zeichenreferenzen in strukturellen Metadaten-Attributen muessen fail-closed markiert werden"
);

function build(...args) {
  execFileSync("bash", [builder, ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function rejected(...args) {
  return spawnSync("bash", [builder, ...args], { cwd: root, encoding: "utf8" });
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(fullPath);
      return entry.isFile() ? [fullPath] : [];
    })
    .sort();
}

function relativeFiles(directory) {
  return filesUnder(directory).map((file) => path.relative(directory, file));
}

function fingerprint(directory, { excludeManifest = false } = {}) {
  const hash = createHash("sha256");
  for (const relative of relativeFiles(directory).filter((file) => !excludeManifest || file !== "build-manifest.json")) {
    hash.update(relative.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(directory, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function textArtifact(directory) {
  const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".webmanifest"]);
  return filesUnder(directory)
    .filter((file) => textExtensions.has(path.extname(file)))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

function assertMissing(directory, ...relativePaths) {
  for (const relativePath of relativePaths) {
    assert.equal(fs.existsSync(path.join(directory, relativePath)), false, `${path.basename(directory)}/${relativePath} muss fehlen`);
  }
}

try {
  build("--profile", "pages", "--output", pagesDir);
  execFileSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], { cwd: root, stdio: "pipe" });
  const firstPagesFingerprint = fingerprint(pagesDir);

  assert.equal(fs.existsSync(path.join(pagesDir, "demo", "index.html")), true, "Pages muss die oeffentliche Demo enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "politik-offline.html")), true, "Pages muss das eigenstaendige Politik-Offline-Modul enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "versorgungs-kompass.html")), true, "Pages muss dieselbe Voll-App-Shell wie das Target enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "public-politics-directory.js")), true, "Pages muss den kuratierten öffentlichen Amtsträger-Datensatz enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "demo-data.js")), true, "Pages muss den synthetischen Demo-Datensatz enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "demo-api.js")), true, "Pages muss den lokalen Demo-API-Adapter enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "data-service.js")), true, "Pages muss denselben API-Vertrag wie das Target enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "runtime-config.js")), true, "Pages muss eine explizite Demo-Runtime enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "vendor", "leaflet", "leaflet.js")), true, "Pages muss die Kartenbibliothek enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "vendor", "xlsx", "xlsx.bundle.js")), true, "Pages muss die Exportbibliothek der Voll-App enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "public", "media", "social", "mitmachen-share-v1.png")), true, "Pages muss das bisherige #Mitmachen-Share-Bild fuer bestehende Vorschauen behalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "public", "media", "social", "mitmachen-share-v2.png")), true, "Pages muss das zweite #Mitmachen-Share-Bild fuer bestehende Vorschauen behalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "public", "media", "social", "mitmachen-share-v3.png")), true, "Pages muss das aktuelle #Mitmachen-Share-Bild enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "public", "media", "social", "versorgungs-netzwerk-share-v1.png")), true, "Pages muss das Netzwerk-Share-Bild enthalten");
  const pagesRootHtml = fs.readFileSync(path.join(pagesDir, "index.html"), "utf8");
  const pagesAliasHtml = fs.readFileSync(path.join(pagesDir, "versorgungs-kompass.html"), "utf8");
  const pagesNoScriptCss = fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-no-script.css"), "utf8");
  assert.equal(pagesRootHtml, pagesAliasHtml, "Pages muss am Root direkt dieselbe App-Shell ausliefern");
  assert.match(pagesRootHtml, /class="app-shell/);
  assert.match(pagesRootHtml, /data-view-panel="home"/);
  assert.match(pagesRootHtml, /<noscript>[\s\S]*href="\.\/versorgungs-kompass-no-script\.css"[^>]*data-no-script-home[^>]*>[\s\S]*<\/noscript>/i);
  assert.match(pagesNoScriptCss, /\.view-panel\[data-view-panel="home"\]\s*\{[\s\S]*display:\s*block\s*!important/i);
  assert.match(pagesNoScriptCss, /button\[data-home-scroll-cue\]\s*\{[\s\S]*display:\s*none/i);
  assert.match(pagesRootHtml, /<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*\/?>/i);
  assert.match(pagesRootHtml, /<link rel="canonical" href="https:\/\/timofrank\.github\.io\/mitmachen\/" \/>/);
  assert.match(pagesRootHtml, /<meta property="og:title" content="#Mitmachen" \/>/);
  assert.match(pagesRootHtml, /<meta property="og:description" content="Deine Plattform für Austausch, Wissen und Vernetzung\." \/>/);
  assert.match(pagesRootHtml, /<meta property="og:image" content="https:\/\/timofrank\.github\.io\/mitmachen\/public\/media\/social\/mitmachen-share-v3\.png" \/>/);
  assert.match(pagesRootHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(
    pagesRootHtml,
    /\.\/data\/public-politics-directory\.js[\s\S]*\.\/data\/demo-data\.js[\s\S]*\.\/data\/demo-api\.js[\s\S]*\.\/data\/data-service\.js/
  );
  assert.doesNotMatch(pagesRootHtml, /data-public-entry="home"|data-public-entry-styles|>\s*Demo öffnen(?:\s|<)/i);
  assert.doesNotMatch(pagesRootHtml, /<meta\s+http-equiv="refresh"/i);
  const pagesDemoAliasHtml = fs.readFileSync(path.join(pagesDir, "demo", "index.html"), "utf8");
  assert.match(pagesDemoAliasHtml, /url=\.\.\/#home/);
  assert.match(pagesDemoAliasHtml, /<link rel="canonical" href="https:\/\/timofrank\.github\.io\/mitmachen\/" \/>/);
  assert.match(pagesDemoAliasHtml, /<meta property="og:image" content="https:\/\/timofrank\.github\.io\/mitmachen\/public\/media\/social\/mitmachen-share-v3\.png" \/>/);
  assert.match(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass.html"), "utf8"),
    /href="\.\/public\/brand\/mitmachen\/icons\/app-icon-32\.png"/
  );
  assert.match(
    fs.readFileSync(path.join(pagesDir, "manifest.webmanifest"), "utf8"),
    /"src": "\.\/public\/brand\/mitmachen\/icons\/app-icon-192\.png"/
  );
  const pagesManifest = JSON.parse(fs.readFileSync(path.join(pagesDir, "manifest.webmanifest"), "utf8"));
  assert.equal(pagesManifest.name, "#Mitmachen");
  for (const brand of ["Versorgungs-Kompass", "Stakeholder-Kompass", "Hospitations-Kompass", "Format-Kompass"]) {
    assert.match(pagesManifest.description, new RegExp(brand));
    assert.match(pagesRootHtml, new RegExp(`<strong>${brand}</strong>`));
  }
  for (const mark of [
    "public/brand/versorgungs-kompass/mark.svg",
    "public/brand/modules/stakeholder/mark.svg",
    "public/brand/modules/hospitation/mark.svg",
    "public/brand/modules/formate/mark.svg"
  ]) {
    assert.match(pagesRootHtml, new RegExp(mark.replaceAll("/", "\\/")));
  }
  assert.equal(pagesManifest.start_url, "./#home");
  assert.equal(pagesManifest.scope, "./");
  assert.equal(
    pagesManifest.icons.every((icon) => icon.src.startsWith("./public/brand/mitmachen/icons/")),
    true
  );
  assertMissing(
    pagesDir,
    "mitmachen/index.html",
    "mitmachen/mitmachen.css",
    "login.html",
    "enrollment.html",
    "enrollment.css",
    "enrollment.js",
    "set-password.html",
    "auth-config.js",
    "auth-guard.js",
    "auth-login.js",
    "demo/demo.css",
    "demo/demo-app.js",
    "data/versorgungs-kompass-data.js",
    "data/expertenkreis-data.js",
    "data/stakeholder-data.js",
    "data/patienten-data.js",
    "vendor/supabase",
    "public/app-icon-32.png",
    "public/app-icon-180.png",
    "public/app-icon-192.png",
    "public/app-icon-512.png",
    "public/gematik-logo.svg",
    "public/format-roundtable-hero.jpg",
    "public/versorgungs-kompass-logo.png",
    "public/stakeholder-logos",
    "public/hospitation-avatars"
  );

  const pagesText = textArtifact(pagesDir);
  assert.doesNotMatch(pagesText, /supabase(?:\.co|-js|AnonKey|Url)|service[_-]?role/i);
  assert.doesNotMatch(pagesText, /expertenkreis-data|stakeholder-data|versorgungs-kompass-data/i);
  assert.doesNotMatch(pagesText, /\bVK_DEMO_BACKEND\b/, "Pages darf keinen umschaltbaren Demo-Backendmodus enthalten");
  assert.doesNotMatch(pagesText, new RegExp(["arbeits", "raum"].join(""), "i"), "Pages enthaelt nicht mehr freigegebenes Wording");

  const pagesConfig = fs.readFileSync(path.join(pagesDir, "data", "runtime-config.js"), "utf8");
  assert.match(pagesConfig, /dataMode:\s*"demo"/);
  assert.match(pagesConfig, /authMode:\s*"anonymous-demo"/);
  assert.match(pagesConfig, /apiBaseUrl:\s*""/);
  assert.match(pagesConfig, /requireApiGateway:\s*false/);
  assert.match(pagesConfig, /ownerOnlyContactChannels:\s*true/);
  assert.match(pagesConfig, /allDemoContactsInvitable:\s*true/);

  const pagesHtml = fs.readFileSync(path.join(pagesDir, "versorgungs-kompass.html"), "utf8");
  const publicPoliticsPosition = pagesHtml.indexOf("./data/public-politics-directory.js");
  const demoDataPosition = pagesHtml.indexOf("./data/demo-data.js");
  const demoApiPosition = pagesHtml.indexOf("./data/demo-api.js");
  const dataServicePosition = pagesHtml.indexOf("./data/data-service.js");
  assert.ok(
    publicPoliticsPosition >= 0
      && publicPoliticsPosition < demoDataPosition
      && demoDataPosition < demoApiPosition
      && demoApiPosition < dataServicePosition,
    "Pages muss Amtsträger-Datensatz, Demo-Daten, Demo-Adapter und API-Vertrag in sicherer Reihenfolge laden"
  );
  assert.doesNotMatch(pagesHtml, /auth-(?:config|guard|login)\.js/i);
  for (const label of ["Versorgung", "Auswertung", "Aktivitäten", "Stakeholder", "Expertenkreis", "Hospitationen", "Beobachtungen", "Fragebogen", "Dashboard", "Formate", "Teams"]) {
    assert.match(pagesHtml, new RegExp(label), `Pages muss den Voll-App-Bereich ${label} enthalten`);
  }
  const pagesRegistrationHtml = fs.readFileSync(path.join(pagesDir, "mitmachen", "versorgungs-netzwerk.html"), "utf8");
  assert.match(pagesRegistrationHtml, /<script src="\.\/versorgungs-netzwerk\.js"><\/script>/);
  assert.match(pagesRegistrationHtml, /<link rel="canonical" href="https:\/\/timofrank\.github\.io\/mitmachen\/mitmachen\/versorgungs-netzwerk\.html" \/>/);
  assert.match(pagesRegistrationHtml, /<meta property="og:title" content="Ihre Erfahrung zählt: Digitale Versorgung besser machen" \/>/);
  assert.match(pagesRegistrationHtml, /<meta property="og:description" content="Entdecken Sie die Idee des Versorgungs-Netzwerks – als Konzeptdemo mit fiktiven Angaben, ohne echte Anmeldung, Übermittlung oder Speicherung\." \/>/);
  assert.match(pagesRegistrationHtml, /<meta property="og:image" content="https:\/\/timofrank\.github\.io\/mitmachen\/public\/media\/social\/versorgungs-netzwerk-share-v1\.png" \/>/);
  assert.match(pagesRegistrationHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.doesNotMatch(
    pagesRegistrationHtml,
    /data\/(?:runtime-config|public-politics-directory|demo-data|demo-api)\.js/,
    "Die Konzeptdemo darf keinen Daten- oder API-Adapter laden"
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(pagesDir, "mitmachen", "versorgungs-netzwerk.js"), "utf8"),
    /\b(?:fetch|XMLHttpRequest|sendBeacon)\b/,
    "Die Konzeptdemo darf keine Transport-API verwenden"
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-map.html"), "utf8"),
    /auth-config|auth-guard/i,
    "Die oeffentliche Karte darf keine Auth-Konfiguration referenzieren"
  );
  assert.match(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-map.js"), "utf8"),
    /IS_PUBLIC_DEMO[\s\S]*if\s*\(\s*!IS_PUBLIC_DEMO\s*\)[\s\S]*L\.tileLayer/,
    "Die oeffentliche Hauptkarte darf externe Kacheln nur ausserhalb des Demo-Modus laden"
  );
  assert.match(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-contact-mini-map.html"), "utf8"),
    /data\/runtime-config\.js/,
    "Die Kontakt-Minikarte muss den Demo-Modus kennen"
  );
  assert.match(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-contact-mini-map.js"), "utf8"),
    /dataMode\s*!==\s*"demo"[\s\S]*L\.tileLayer/,
    "Die Kontakt-Minikarte darf externe Kacheln nur ausserhalb des Demo-Modus laden"
  );

  const pagesPoliticsPath = path.join(
    pagesDir,
    "data",
    "public-politics-directory.js"
  );
  const cleanPagesPolitics = fs.readFileSync(pagesPoliticsPath, "utf8");
  const politicsWrapper = cleanPagesPolitics.match(
    /^([\s\S]*Object\.freeze\()([\s\S]+)(\);\n)$/u
  );
  assert.ok(politicsWrapper, "Der Politik-Snapshot muss einen datenhaltenden Wrapper besitzen");
  const cleanPoliticsPayload = JSON.parse(politicsWrapper[2]);
  for (const [label, mutatePolitics, expectedFailure] of [
    [
      "ein zusätzliches CRM-Feld",
      (payload) => {
        payload.members[0].email = "nicht-freigegeben@example.invalid";
      },
      /nicht freigegebene Felder/
    ],
    [
      "mehr als eine PLZ",
      (payload) => {
        payload.members[0].postalCodes.push("99999");
      },
      /mehr als eine PLZ/
    ],
    [
      "eine Bild-URL bei ausstehender Rechteprüfung",
      (payload) => {
        const reviewRequiredMember = payload.members.find(
          (member) => member.imageRightsStatus === "review_required"
        );
        reviewRequiredMember.imageUrl = "https://www.bundestag.de/not-approved.jpg";
      },
      /ausstehender Rechteprüfung/
    ],
    [
      "einen mehr als 14 Tage alten Abrufzeitpunkt",
      (payload) => {
        payload.fetchedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
      },
      /älter als 14 Tage/
    ],
    [
      "einen unzulässig zukünftigen Abrufzeitpunkt",
      (payload) => {
        payload.fetchedAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
      },
      /unzulässig in der Zukunft/
    ]
  ]) {
    const tamperedPoliticsPayload = structuredClone(cleanPoliticsPayload);
    mutatePolitics(tamperedPoliticsPayload);
    fs.writeFileSync(
      pagesPoliticsPath,
      `${politicsWrapper[1]}${JSON.stringify(tamperedPoliticsPayload, null, 2)}${politicsWrapper[3]}`
    );
    const auditResult = spawnSync(
      process.execPath,
      [publicAudit, "--artifact-root", pagesDir],
      { cwd: root, encoding: "utf8" }
    );
    assert.notEqual(
      auditResult.status,
      0,
      `Public Asset Audit muss ${label} fail-closed ablehnen`
    );
    assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, expectedFailure);
  }
  fs.writeFileSync(pagesPoliticsPath, cleanPagesPolitics);

  const pagesOfflinePoliticsPath = path.join(pagesDir, "politik-offline.html");
  const cleanPagesOfflinePolitics = fs.readFileSync(pagesOfflinePoliticsPath, "utf8");
  const offlinePoliticsWrapper = cleanPagesOfflinePolitics.match(
    /(<script id="offline-data" type="application\/json">)([\s\S]+?)(<\/script>)/u
  );
  assert.ok(offlinePoliticsWrapper, "Das Offline-Modul muss einen eingebetteten Datenstand besitzen");
  const cleanOfflinePoliticsPayload = JSON.parse(offlinePoliticsWrapper[2]);
  for (const [label, mutateOfflinePolitics, expectedFailure] of [
    [
      "ein zusätzliches Mitgliedsfeld",
      (payload) => {
        payload.members[0].email = "nicht-freigegeben@example.invalid";
      },
      /Feld-, PLZ-, Karten- oder Bildrechte-Positivliste/
    ],
    [
      "einen mehr als 14 Tage alten Snapshot",
      (payload) => {
        payload.snapshotAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
      },
      /veralteten oder unzulaessig zukuenftigen Snapshot/
    ]
  ]) {
    const tamperedOfflinePoliticsPayload = structuredClone(cleanOfflinePoliticsPayload);
    mutateOfflinePolitics(tamperedOfflinePoliticsPayload);
    fs.writeFileSync(
      pagesOfflinePoliticsPath,
      cleanPagesOfflinePolitics.replace(
        offlinePoliticsWrapper[0],
        `${offlinePoliticsWrapper[1]}${JSON.stringify(tamperedOfflinePoliticsPayload)}${offlinePoliticsWrapper[3]}`
      )
    );
    const offlineAuditResult = spawnSync(
      process.execPath,
      [publicAudit, "--artifact-root", pagesDir],
      { cwd: root, encoding: "utf8" }
    );
    assert.notEqual(
      offlineAuditResult.status,
      0,
      `Public Asset Audit muss ${label} im Offline-Modul fail-closed ablehnen`
    );
    assert.match(
      `${offlineAuditResult.stderr}\n${offlineAuditResult.stdout}`,
      expectedFailure
    );
  }
  fs.writeFileSync(pagesOfflinePoliticsPath, cleanPagesOfflinePolitics);

  const pagesDemoApiPath = path.join(pagesDir, "data", "demo-api.js");
  const cleanPagesDemoApi = fs.readFileSync(pagesDemoApiPath, "utf8");
  fs.writeFileSync(pagesDemoApiPath, `${cleanPagesDemoApi}\nconst forbiddenSupabaseOrigin = "https://forbidden.supabase.co";\n`);
  let auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(auditResult.status, 0, "Public Asset Audit muss einen Supabase-Origin fail-closed ablehnen");
  assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /Public Asset Audit FAILED/);
  fs.writeFileSync(pagesDemoApiPath, cleanPagesDemoApi);

  const pagesConfigPath = path.join(pagesDir, "data", "runtime-config.js");
  const cleanPagesConfig = fs.readFileSync(pagesConfigPath, "utf8");
  fs.writeFileSync(pagesConfigPath, cleanPagesConfig.replace('apiBaseUrl: ""', 'apiBaseUrl: "https://forbidden.example.invalid"'));
  auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(auditResult.status, 0, "Public Asset Audit muss einen externen Demo-API-Origin fail-closed ablehnen");
  assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /Public Asset Audit FAILED/);
  fs.writeFileSync(pagesConfigPath, cleanPagesConfig);

  const pagesShareImagePath = path.join(pagesDir, "public", "media", "social", "mitmachen-share-v3.png");
  const cleanPagesShareImage = fs.readFileSync(pagesShareImagePath);
  fs.writeFileSync(pagesShareImagePath, cleanPagesShareImage.subarray(0, 24));
  auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(auditResult.status, 0, "Public Asset Audit muss ein abgeschnittenes Share-PNG fail-closed ablehnen");
  assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /muss ein PNG mit 1200 x 630 Pixeln sein/);
  fs.writeFileSync(pagesShareImagePath, cleanPagesShareImage);

  const pagesShareDocuments = ["index.html", "versorgungs-kompass.html", "demo/index.html"];
  for (const [markup, label, expectedFailure] of [
    [
      "<meta property=og:title content=Wrong>",
      "unquoted doppelte Share-Metadaten",
      /muss genau ein property="og:title" enthalten/
    ],
    [
      '<meta content="Wrong>Preview" property=og:title>',
      "> innerhalb eines gequoteten Attributwerts",
      /muss genau ein property="og:title" enthalten/
    ],
    [
      '<meta property="og&#58;title" content="Wrong">',
      "verschleierte strukturelle Attribute",
      /darf name, property oder rel nicht per Zeichenreferenz verschleiern/
    ],
    [
      '<meta property="og:title" property="not-share" content="Wrong">',
      "doppelte Attribute innerhalb eines Meta-Tags",
      /darf in Share-relevanten Tags keine doppelten Attribute enthalten/
    ]
  ]) {
    const cleanPagesShareDocuments = new Map();
    try {
      for (const relativePath of pagesShareDocuments) {
        const documentPath = path.join(pagesDir, relativePath);
        const cleanDocument = fs.readFileSync(documentPath, "utf8");
        cleanPagesShareDocuments.set(documentPath, cleanDocument);
        fs.writeFileSync(documentPath, cleanDocument.replace(/<head>/i, `$&\n    ${markup}`));
      }
      auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
        cwd: root,
        encoding: "utf8"
      });
      assert.notEqual(auditResult.status, 0, `Public Asset Audit muss ${label} fail-closed ablehnen`);
      assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, expectedFailure);
    } finally {
      for (const [documentPath, cleanDocument] of cleanPagesShareDocuments) {
        fs.writeFileSync(documentPath, cleanDocument);
      }
    }
  }

  for (const [relativePath, marker, label] of [
    ["data/demo-api.js", 'window.VK_DEMO_BACKEND = "api";', "umschaltbaren Backendmodus"],
    ["versorgungs-kompass.html", '<script src="./auth-guard.js"></script>', "Auth-Skript"],
    [
      "mitmachen/versorgungs-netzwerk.html",
      '<script src="../data/public-politics-directory.js"></script>',
      "Politik-Snapshot in der Konzeptdemo"
    ]
  ]) {
    const filePath = path.join(pagesDir, relativePath);
    const cleanContent = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(filePath, `${cleanContent}\n${marker}\n`);
    const auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(auditResult.status, 0, `Public Asset Audit muss ${label} fail-closed ablehnen`);
    assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /Public Asset Audit FAILED/);
    fs.writeFileSync(filePath, cleanContent);
  }
  execFileSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], { cwd: root, stdio: "pipe" });

  fs.writeFileSync(path.join(pagesDir, "stale-file.txt"), "must be removed\n");
  build("--profile", "pages", "--output", pagesDir);
  assert.equal(fs.existsSync(path.join(pagesDir, "stale-file.txt")), false, "Build-Ausgaben muessen sauber ersetzt werden");
  assert.equal(fingerprint(pagesDir), firstPagesFingerprint, "Wiederholte Pages-Builds muessen inhaltsgleich sein");

  build(
    "--profile", "target",
    "--output", targetDir,
    "--api-base-url", apiBaseUrl,
    "--auth-mode", "oidc"
  );
  execFileSync(process.execPath, [targetAudit, "--artifact-root", targetDir], { cwd: root, stdio: "pipe" });

  const nestedOfflineDirectory = path.join(targetDir, "nested");
  fs.mkdirSync(nestedOfflineDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(nestedOfflineDirectory, "politik-offline.html"),
    "<!doctype html><title>Nicht zulässige Offline-Kopie</title>\n"
  );
  try {
    const nestedOfflineAuditResult = spawnSync(
      process.execPath,
      [targetAudit, "--artifact-root", targetDir],
      { cwd: root, encoding: "utf8" }
    );
    assert.notEqual(
      nestedOfflineAuditResult.status,
      0,
      "Target Asset Audit muss auch eine verschachtelte Kopie des Offline-Moduls fail-closed ablehnen"
    );
    assert.match(
      `${nestedOfflineAuditResult.stderr}\n${nestedOfflineAuditResult.stdout}`,
      /verschachtelte Kopie von politik-offline\.html/
    );
  } finally {
    fs.rmSync(nestedOfflineDirectory, { recursive: true, force: true });
  }

  const targetAppHtmlPath = path.join(targetDir, "versorgungs-kompass.html");
  const cleanTargetAppHtml = fs.readFileSync(targetAppHtmlPath, "utf8");
  try {
    fs.writeFileSync(
      targetAppHtmlPath,
      `${cleanTargetAppHtml}\n<script src="/data/public-politics-directory.js"></script>\n`
    );
    const targetPoliticsAuditResult = spawnSync(
      process.execPath,
      [targetAudit, "--artifact-root", targetDir],
      { cwd: root, encoding: "utf8" }
    );
    assert.notEqual(
      targetPoliticsAuditResult.status,
      0,
      "Target Asset Audit muss eine Referenz auf den Pages-Politik-Snapshot fail-closed ablehnen"
    );
    assert.match(
      `${targetPoliticsAuditResult.stderr}\n${targetPoliticsAuditResult.stdout}`,
      /referenziert statische Demo- oder Realbestandsdaten/
    );
  } finally {
    fs.writeFileSync(targetAppHtmlPath, cleanTargetAppHtml);
  }

  const targetConfig = fs.readFileSync(path.join(targetDir, "data", "runtime-config.js"), "utf8");
  assert.match(targetConfig, /dataMode:\s*"api"/);
  assert.match(targetConfig, /authMode:\s*"oidc"/);
  assert.match(targetConfig, /apiCredentials:\s*"include"/);
  assert.match(targetConfig, /requireApiGateway:\s*true/);
  assert.doesNotMatch(targetConfig, /ownerOnlyContactChannels:\s*true/);
  assert.doesNotMatch(targetConfig, /allDemoContactsInvitable:\s*true/);
  assert.ok(targetConfig.includes(`apiBaseUrl: "${apiBaseUrl}"`));
  assert.doesNotMatch(targetConfig, /supabaseUrl|supabaseAnonKey|registrationEndpoint/);

  const configuredApiBaseUrl = /apiBaseUrl:\s*"([^"]+)"/.exec(targetConfig)?.[1];
  assert.equal(configuredApiBaseUrl, apiBaseUrl, "Target-Konfiguration muss ausschliesslich den API-Origin enthalten");
  const contactsApiUrl = new URL(`${configuredApiBaseUrl}/api/contacts`);
  assert.equal(contactsApiUrl.href, `${apiBaseUrl}/api/contacts`, "API-Routen muessen genau einmal an den Origin angehaengt werden");
  assert.equal(contactsApiUrl.pathname, "/api/contacts");
  assert.equal((contactsApiUrl.pathname.match(/\/api(?=\/|$)/g) || []).length, 1, "Die zusammengesetzte URL darf nur eine /api-Route enthalten");

  assert.equal(fs.existsSync(path.join(targetDir, "login.html")), true, "Target muss die geschuetzte Anmeldung enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "index.html")), true, "Target muss den zentralen #Mitmachen-Einstieg enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "public-index.html")), true, "Target muss die eigenstaendige oeffentliche Startseite enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "versorgungs-kompass.html")), true, "Target muss die Realanwendung enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "data", "data-service.js")), true, "Target muss den API-Datenservice enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "manifest.webmanifest")), true, "Target muss das PWA-Manifest am referenzierten Root-Pfad enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "public", "manifest.webmanifest")), false, "Das Target darf keine zweite, falsch platzierte Manifestkopie enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "vendor", "leaflet", "leaflet.js")), true, "Target muss allgemeine Vendor-Assets enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "vendor", "xlsx", "xlsx.bundle.js")), true, "Target muss das Export-Asset enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "public", "brand", "mitmachen", "mark-on-dark.svg")), true, "Target muss die #Mitmachen-Sidebar-Marke enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "public", "brand", "mitmachen", "lockup-horizontal.svg")), true, "Target muss die #Mitmachen-Wortmarke enthalten");
  assert.equal(
    fs.existsSync(path.join(targetDir, "public", "media", "social", "mitmachen-share-v3.png")),
    true,
    "Target muss das freigegebene Pages-Share-Bild fuer die oeffentliche Teams-Vorschau enthalten"
  );
  assert.deepEqual(
    fs.readFileSync(path.join(targetDir, "public", "media", "social", "mitmachen-share-v3.png")),
    fs.readFileSync(path.join(pagesDir, "public", "media", "social", "mitmachen-share-v3.png")),
    "Target und Pages muessen exakt dasselbe Share-Bild ausliefern"
  );
  assertMissing(
    targetDir,
    "demo",
    "politik-offline.html",
    "data/public-politics-directory.js",
    "data/demo-data.js",
    "data/demo-api.js",
    "data/versorgungs-kompass-data.js",
    "data/versorgungs-kompass-data.csv",
    "data/expertenkreis-data.js",
    "data/stakeholder-data.js",
    "data/patienten-data.js",
    "vendor/supabase",
    "public-entry.css",
    "public-login.html",
    "enrollment.html",
    "enrollment.css",
    "enrollment.js",
    "public/media/social/mitmachen-share-v1.png",
    "public/media/social/mitmachen-share-v2.png",
    "public/media/social/versorgungs-netzwerk-share-v1.png"
  );

  const targetPublicIndexHtml = fs.readFileSync(path.join(targetDir, "public-index.html"), "utf8");
  assert.equal((targetPublicIndexHtml.match(/data-public-entry-styles/g) || []).length, 1);
  assert.doesNotMatch(targetPublicIndexHtml, /<script\b|<iframe\b|<form\b|<input\b|\ssrc\s*=/i);
  assert.doesNotMatch(targetPublicIndexHtml, /runtime-config|auth-(?:config|guard|login)/i);
  assert.doesNotMatch(targetPublicIndexHtml, /href="\.\/public-entry\.css"/);
  assert.match(targetPublicIndexHtml, /data-public-entry="home"/);
  assert.equal(
    (targetPublicIndexHtml.match(/href="\/api\/auth\/bootstrap\?return=%2Fstart%3Fiap_authenticated%3D1"/gi) || []).length,
    1
  );
  assert.equal((targetPublicIndexHtml.match(/\/api\//g) || []).length, 1);
  assert.match(targetPublicIndexHtml, /data-google-sso-button/);
  assert.match(targetPublicIndexHtml, /Mit Google anmelden/);
  assert.match(targetPublicIndexHtml, /Willkommen im Versorgungs-Kompass/);
  assert.match(targetPublicIndexHtml, /id="zugriff-verweigert"/);
  assert.ok(targetPublicIndexHtml.includes(`<link rel="canonical" href="${apiBaseUrl}/" />`));
  assert.match(targetPublicIndexHtml, /<meta property="og:title" content="#Mitmachen" \/>/);
  assert.match(targetPublicIndexHtml, /<meta property="og:description" content="Deine Plattform für Austausch, Wissen und Vernetzung\." \/>/);
  assert.ok(
    targetPublicIndexHtml.includes(
      `<meta property="og:image" content="${apiBaseUrl}/public/media/social/mitmachen-share-v3.png" />`
    )
  );
  assert.match(targetPublicIndexHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(targetPublicIndexHtml, /<meta name="twitter:description" content="Deine Plattform für Austausch, Wissen und Vernetzung\." \/>/);
  assert.doesNotMatch(targetPublicIndexHtml, /Testzugang aktivieren|enrollment\.html|\b(?:IAP|OIDC|Runtime|API-Gateway)\b/i);

  const targetShareImagePath = path.join(targetDir, "public", "media", "social", "mitmachen-share-v3.png");
  const cleanTargetShareImage = fs.readFileSync(targetShareImagePath);
  fs.writeFileSync(targetShareImagePath, cleanTargetShareImage.subarray(0, 24));
  auditResult = spawnSync(process.execPath, [targetAudit, "--artifact-root", targetDir], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(auditResult.status, 0, "Target Asset Audit muss ein abgeschnittenes Teams-Share-PNG fail-closed ablehnen");
  assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /muss ein PNG mit 1200 x 630 Pixeln sein/);
  fs.writeFileSync(targetShareImagePath, cleanTargetShareImage);
  execFileSync(process.execPath, [targetAudit, "--artifact-root", targetDir], { cwd: root, stdio: "pipe" });
  const targetIndexHtml = fs.readFileSync(path.join(targetDir, "index.html"), "utf8");
  assert.match(targetIndexHtml, /<aside class="module-sidebar"/);
  assert.match(targetIndexHtml, /<h1 id="welcome-title">Gemeinsam Versorgung gestalten\.<\/h1>/);
  assert.match(targetIndexHtml, /href="\/versorgung\/karte"/);
  assert.match(targetIndexHtml, /href="\.\/mitmachen\/mitmachen\.css"/);
  assert.match(targetIndexHtml, /src="\.\/public\/brand\/mitmachen\/lockup-horizontal\.svg"/);
  assert.doesNotMatch(targetIndexHtml, /dokumentation\//, "Der Live-Einstieg darf nicht auf nicht ausgelieferte Repository-Dokumentation verweisen");
  const targetNestedEntryHtml = fs.readFileSync(path.join(targetDir, "mitmachen", "index.html"), "utf8");
  for (const [label, entryHtml] of [
    ["Target-Root", targetIndexHtml],
    ["Target-Modulkopie", targetNestedEntryHtml]
  ]) {
    assert.doesNotMatch(
      entryHtml,
      /data-target-enrollment|Testzugang aktivieren|enrollment\.html/,
      `${label} darf keinen Einstieg zur entfernten Self-Service-Aktivierung enthalten`
    );
  }

  const targetHtml = fs.readFileSync(path.join(targetDir, "versorgungs-kompass.html"), "utf8");
  assert.doesNotMatch(targetHtml, /data\/(?:public-politics-directory|demo-data|versorgungs-kompass-data|expertenkreis-data|stakeholder-data|patienten-data)\.js/i);
  assert.doesNotMatch(targetHtml, /data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)="demo"/i);
  const targetRevision = execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  for (const assetPath of [
    "/data/runtime-config.js",
    "/versorgungs-kompass-routes.js",
    "/versorgungs-kompass.css",
    "/data/data-service.js",
    "/versorgungs-kompass.js"
  ]) {
    const escapedAssetPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      targetHtml,
      new RegExp(`(?:src|href)="${escapedAssetPath}\\?v=${targetRevision}"`),
      `Target-App-Shell muss ${assetPath} revisionsgebunden laden`
    );
  }
  assert.doesNotMatch(fs.readFileSync(path.join(targetDir, "login.html"), "utf8"), /vendor\/supabase|supabase-js/i);

  const targetThirdPartyManifest = JSON.parse(fs.readFileSync(path.join(targetDir, "vendor", "THIRD_PARTY_ASSETS.json"), "utf8"));
  assert.equal(targetThirdPartyManifest.assets.some((asset) => String(asset.path || "").includes("vendor/supabase/")), false);

  const targetText = textArtifact(targetDir);
  assert.doesNotMatch(
    targetText,
    /VERSORGUNGS_COMPASS_PUBLIC_POLITICS_DIRECTORY/,
    "Target darf den statischen Pages-Amtsträger-Datensatz nicht enthalten"
  );
  assert.doesNotMatch(targetText, /https:\/\/[a-z0-9-]+\.supabase\.co/i, "Target darf keine direkte Supabase-Projekt-URL enthalten");
  assert.doesNotMatch(targetText, /https:\/\/timofrank\.github\.io\/mitmachen\/public\/media\/social\//i, "Target darf keine Pages-spezifischen Share-URLs enthalten");
  assert.doesNotMatch(targetText, /@supabase\/supabase-js|supabase-js@/i, "Target darf kein Supabase Browser-SDK laden");
  assert.doesNotMatch(targetText, new RegExp(["arbeits", "raum"].join(""), "i"), "Target enthaelt nicht mehr freigegebenes Wording");

  for (const [relativePath, label] of [
    ["versorgungs-kompass.css", "App-Styles"],
    ["versorgungs-kompass.js", "App-Logik"],
    ["versorgungs-kompass-map.css", "Karten-Styles"],
    ["versorgungs-kompass-map.js", "Karten-Logik"]
  ]) {
    assert.equal(
      fs.readFileSync(path.join(pagesDir, relativePath), "utf8"),
      fs.readFileSync(path.join(targetDir, relativePath), "utf8"),
      `Pages und Target muessen dieselben ${label} verwenden`
    );
  }
  const pagesMapHtml = fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-map.html"), "utf8");
  const targetMapHtml = fs.readFileSync(path.join(targetDir, "versorgungs-kompass-map.html"), "utf8");
  const targetMapAuthScripts = [
    '<script src="./auth-config.js"></script>',
    '<script src="./auth-guard.js"></script>'
  ];
  for (const authScript of targetMapAuthScripts) {
    assert.equal(
      targetMapHtml.split(authScript).length - 1,
      1,
      `Target-Karten-HTML muss ${authScript} genau einmal enthalten`
    );
    assert.doesNotMatch(
      pagesMapHtml,
      new RegExp(authScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `Pages-Karten-HTML darf ${authScript} nicht enthalten`
    );
  }
  const normalizedTargetMapHtml = targetMapHtml.replace(
    /^[ \t]*<script src="\.\/auth-(?:config|guard)\.js"><\/script>[ \t]*\r?\n/gm,
    ""
  );
  assert.equal(
    pagesMapHtml,
    normalizedTargetMapHtml,
    "Pages und Target muessen ausserhalb der expliziten Target-Auth-Skripte dieselbe Karten-HTML verwenden"
  );

  const pagesOnly = new Set(relativeFiles(pagesDir).filter((file) => file !== "build-manifest.json"));
  const approvedPresentationAssets = new Set(["public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"]);
  const forbiddenOverlap = relativeFiles(targetDir).filter((file) =>
    pagesOnly.has(file)
    && /(?:^|\/)(?:demo|demo-data|demo-profile|demo-person|demo-org)/i.test(file)
    && !approvedPresentationAssets.has(file)
  );
  assert.deepEqual(forbiddenOverlap, [], `Demo-Runtime oder Demo-Daten duerfen nicht in das Target gelangen: ${forbiddenOverlap.join(", ")}`);

  for (const [directory, profile] of [[pagesDir, "pages"], [targetDir, "target"]]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "build-manifest.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest).sort(), ["artifactDigest", "profile", "revision"]);
    assert.equal(manifest.profile, profile);
    assert.match(manifest.revision, /^(?:[0-9a-f]{7,64}|unknown)$/i);
    assert.match(manifest.artifactDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(manifest.artifactDigest, `sha256:${fingerprint(directory, { excludeManifest: true })}`);
    assert.doesNotMatch(JSON.stringify(manifest), /supabase|apiBaseUrl|anonKey|registrationEndpoint/i);
  }

  for (const unsafeOutput of [root, path.join(root, "frontend"), distRoot, path.join(root, "docs")]) {
    const result = rejected("--profile", "pages", "--output", unsafeOutput);
    assert.notEqual(result.status, 0, `Gefaehrliches Ausgabeziel muss abgelehnt werden: ${unsafeOutput}`);
  }

  const symlinkOutput = path.join(fixtureRoot, "unsafe-link");
  fs.symlinkSync(path.join(root, "frontend"), symlinkOutput, "dir");
  assert.notEqual(rejected("--profile", "pages", "--output", symlinkOutput).status, 0, "Symlinks muessen abgelehnt werden");

  assert.notEqual(rejected("--profile", "target", "--output", path.join(fixtureRoot, "invalid-auth"), "--api-base-url", apiBaseUrl, "--auth-mode", "password").status, 0);
  assert.notEqual(rejected("--profile", "target", "--output", path.join(fixtureRoot, "missing-api-url"), "--auth-mode", "oidc").status, 0);
  const apiUrlWithPath = rejected(
    "--profile", "target",
    "--output", path.join(fixtureRoot, "api-url-with-path"),
    "--api-base-url", `${apiBaseUrl}/api`,
    "--auth-mode", "oidc"
  );
  assert.notEqual(apiUrlWithPath.status, 0, "--api-base-url muss Pfade ausser / ablehnen");
  assert.match(`${apiUrlWithPath.stderr}\n${apiUrlWithPath.stdout}`, /HTTPS-Origin ohne Pfad/);

  console.log("Deployment separation test OK: Pages und Target teilen die Voll-App-Shell, besitzen aber disjunkte Daten-, Auth- und Laufzeitgrenzen.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
