import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
  assert.equal(fs.existsSync(path.join(pagesDir, "data", "demo-data.js")), true, "Pages muss den synthetischen Demo-Datensatz enthalten");
  assert.equal(fs.existsSync(path.join(pagesDir, "vendor", "leaflet", "leaflet.js")), true, "Pages muss nur die Kartenbibliothek enthalten");
  assert.match(fs.readFileSync(path.join(pagesDir, "index.html"), "utf8"), /url=\.\/demo\//);
  assert.match(fs.readFileSync(path.join(pagesDir, "demo", "index.html"), "utf8"), /href="\.\.\/public\/app-icon-32\.png"/);
  assertMissing(
    pagesDir,
    "login.html",
    "set-password.html",
    "versorgungs-kompass.html",
    "hospitation",
    "mitmachen",
    "data/runtime-config.js",
    "data/data-service.js",
    "data/versorgungs-kompass-data.js",
    "data/expertenkreis-data.js",
    "data/stakeholder-data.js",
    "data/patienten-data.js",
    "vendor/supabase",
    "vendor/xlsx",
    "vendor/mammoth",
    "vendor/pdfjs",
    "public/stakeholder-logos",
    "public/hospitation-avatars"
  );

  const pagesText = textArtifact(pagesDir);
  assert.doesNotMatch(pagesText, /supabase(?:\.co|-js|AnonKey|Url)|apiBaseUrl|service[_-]?role/i);
  assert.doesNotMatch(pagesText, /expertenkreis-data|stakeholder-data|versorgungs-kompass-data/i);
  assert.doesNotMatch(pagesText, /\bVK_DEMO_BACKEND\b/, "Pages darf keinen umschaltbaren Demo-Backendmodus enthalten");
  assert.doesNotMatch(pagesText, /\bapiRequest\s*\(/, "Pages darf keine API-Hilfsfunktion enthalten");
  assert.doesNotMatch(pagesText, /\/api\//i, "Pages darf keine API-Endpunktroute enthalten");
  assert.doesNotMatch(
    fs.readFileSync(path.join(pagesDir, "versorgungs-kompass-map.html"), "utf8"),
    /runtime-config|auth-config|auth-guard/i,
    "Die oeffentliche Karte darf keine Runtime- oder Auth-Konfiguration referenzieren"
  );

  const pagesDemoAppPath = path.join(pagesDir, "demo", "demo-app.js");
  const cleanPagesDemoApp = fs.readFileSync(pagesDemoAppPath, "utf8");
  for (const [marker, label] of [
    ['window.VK_DEMO_BACKEND = "api";', "Backendmodus"],
    ["function apiRequest() {}", "API-Hilfsfunktion"],
    ['const forbiddenDemoRoute = "/api/contacts";', "API-Endpunktroute"]
  ]) {
    fs.writeFileSync(pagesDemoAppPath, `${cleanPagesDemoApp}\n${marker}\n`);
    const auditResult = spawnSync(process.execPath, [publicAudit, "--artifact-root", pagesDir], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(auditResult.status, 0, `Public Asset Audit muss ${label} fail-closed ablehnen`);
    assert.match(`${auditResult.stderr}\n${auditResult.stdout}`, /Public Asset Audit FAILED/);
  }
  fs.writeFileSync(pagesDemoAppPath, cleanPagesDemoApp);
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

  const targetConfig = fs.readFileSync(path.join(targetDir, "data", "runtime-config.js"), "utf8");
  assert.match(targetConfig, /dataMode:\s*"api"/);
  assert.match(targetConfig, /authMode:\s*"oidc"/);
  assert.match(targetConfig, /apiCredentials:\s*"include"/);
  assert.match(targetConfig, /requireApiGateway:\s*true/);
  assert.ok(targetConfig.includes(`apiBaseUrl: "${apiBaseUrl}"`));
  assert.doesNotMatch(targetConfig, /supabaseUrl|supabaseAnonKey|registrationEndpoint/);

  const configuredApiBaseUrl = /apiBaseUrl:\s*"([^"]+)"/.exec(targetConfig)?.[1];
  assert.equal(configuredApiBaseUrl, apiBaseUrl, "Target-Konfiguration muss ausschliesslich den API-Origin enthalten");
  const contactsApiUrl = new URL(`${configuredApiBaseUrl}/api/contacts`);
  assert.equal(contactsApiUrl.href, `${apiBaseUrl}/api/contacts`, "API-Routen muessen genau einmal an den Origin angehaengt werden");
  assert.equal(contactsApiUrl.pathname, "/api/contacts");
  assert.equal((contactsApiUrl.pathname.match(/\/api(?=\/|$)/g) || []).length, 1, "Die zusammengesetzte URL darf nur eine /api-Route enthalten");

  assert.equal(fs.existsSync(path.join(targetDir, "login.html")), true, "Target muss die geschuetzte Anmeldung enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "versorgungs-kompass.html")), true, "Target muss die Realanwendung enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "data", "data-service.js")), true, "Target muss den API-Datenservice enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "manifest.webmanifest")), true, "Target muss das PWA-Manifest am referenzierten Root-Pfad enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "public", "manifest.webmanifest")), false, "Das Target darf keine zweite, falsch platzierte Manifestkopie enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "vendor", "leaflet", "leaflet.js")), true, "Target muss allgemeine Vendor-Assets enthalten");
  assert.equal(fs.existsSync(path.join(targetDir, "vendor", "xlsx", "xlsx.bundle.js")), true, "Target muss das Export-Asset enthalten");
  assertMissing(
    targetDir,
    "demo",
    "data/demo-data.js",
    "data/versorgungs-kompass-data.js",
    "data/versorgungs-kompass-data.csv",
    "data/expertenkreis-data.js",
    "data/stakeholder-data.js",
    "data/patienten-data.js",
    "vendor/supabase"
  );

  const targetHtml = fs.readFileSync(path.join(targetDir, "versorgungs-kompass.html"), "utf8");
  assert.doesNotMatch(targetHtml, /data\/(?:demo-data|versorgungs-kompass-data|expertenkreis-data|stakeholder-data|patienten-data)\.js/i);
  assert.doesNotMatch(targetHtml, /data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)="demo"/i);
  assert.doesNotMatch(fs.readFileSync(path.join(targetDir, "login.html"), "utf8"), /vendor\/supabase|supabase-js/i);

  const targetThirdPartyManifest = JSON.parse(fs.readFileSync(path.join(targetDir, "vendor", "THIRD_PARTY_ASSETS.json"), "utf8"));
  assert.equal(targetThirdPartyManifest.assets.some((asset) => String(asset.path || "").includes("vendor/supabase/")), false);

  const targetText = textArtifact(targetDir);
  assert.doesNotMatch(targetText, /https:\/\/[a-z0-9-]+\.supabase\.co/i, "Target darf keine direkte Supabase-Projekt-URL enthalten");
  assert.doesNotMatch(targetText, /@supabase\/supabase-js|supabase-js@/i, "Target darf kein Supabase Browser-SDK laden");

  const pagesOnly = new Set(relativeFiles(pagesDir).filter((file) => file !== "build-manifest.json"));
  const forbiddenOverlap = relativeFiles(targetDir).filter((file) => pagesOnly.has(file) && /(?:^|\/)(?:demo|demo-data|demo-profile|demo-person|demo-org)/i.test(file));
  assert.deepEqual(forbiddenOverlap, [], `Demo-Dateien duerfen nicht in das Target gelangen: ${forbiddenOverlap.join(", ")}`);

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

  console.log("Deployment separation test OK: Pages-Demo und geschuetzte Realanwendung besitzen disjunkte Daten-, Auth- und Laufzeitgrenzen.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
