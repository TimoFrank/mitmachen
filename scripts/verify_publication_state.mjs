import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const defaultBaseUrl = "https://timofrank.github.io/mitmachen";
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
const defaultAssets = [
  "index.html",
  "build-manifest.json",
  "demo/index.html",
  "demo/demo-app.js",
  "data/demo-data.js",
  "versorgungs-kompass-map.html"
];
const overriddenAssets = String(process.env.PUBLICATION_ASSETS || "")
  .split(",")
  .map((asset) => asset.trim())
  .filter(Boolean);
const publicationAssets = overriddenAssets.length ? overriddenAssets : defaultAssets;
const forbiddenAssets = [
  "login.html",
  "set-password.html",
  "versorgungs-kompass.html",
  "hospitation/index.html",
  "mitmachen/versorgungs-netzwerk.html",
  "data/runtime-config.js",
  "data/data-service.js",
  "data/versorgungs-kompass-data.js",
  "data/expertenkreis-data.js",
  "data/stakeholder-data.js",
  "data/patienten-data.js"
];
const cacheBust = `publication_check=${Date.now()}`;
const failures = [];

execFileSync(
  "bash",
  [join(root, "scripts", "build_static_frontend.sh"), "--profile", "pages", "--output", "dist/pages"],
  { cwd: root, stdio: "inherit" }
);
execFileSync(
  process.execPath,
  [join(root, "scripts", "audit_public_assets.mjs"), "--artifact-root", "dist/pages"],
  { cwd: root, stdio: "inherit" }
);

function fail(message) {
  failures.push(message);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readPagesAsset(assetPath) {
  return readFileSync(join(root, "dist", "pages", assetPath), "utf8");
}

async function fetchPublicAsset(assetPath) {
  const separator = assetPath.includes("?") ? "&" : "?";
  return fetch(`${publicBaseUrl}/${assetPath}${separator}${cacheBust}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache" }
  });
}

for (const asset of publicationAssets) {
  try {
    const localContent = readPagesAsset(asset);
    const response = await fetchPublicAsset(asset);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    const publicContent = await response.text();
    const localHash = sha256(localContent);
    const publicHash = sha256(publicContent);
    if (localHash !== publicHash) {
      fail(`${asset}: oeffentliche Datei stimmt nicht mit dist/pages ueberein (${publicHash.slice(0, 12)} statt ${localHash.slice(0, 12)})`);
    } else {
      console.log(`OK  Demo-Asset aktuell: ${asset}`);
    }
  } catch (error) {
    fail(`${asset}: oeffentliche Datei konnte nicht geprueft werden (${error.message})`);
  }
}

for (const asset of forbiddenAssets) {
  try {
    const response = await fetchPublicAsset(asset);
    if (response.status !== 404) {
      fail(`${asset}: darf nicht oeffentlich ausgeliefert werden (HTTP ${response.status})`);
    } else {
      console.log(`OK  Geschuetztes/entferntes Asset nicht oeffentlich: ${asset}`);
    }
  } catch (error) {
    fail(`${asset}: Abwesenheit konnte nicht geprueft werden (${error.message})`);
  }
}

if (failures.length) {
  console.error("\nPublication Verification FAILED:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nPublication Verification OK: GitHub Pages liefert ausschliesslich den geprueften Demo-Vertrag; Realapp und geschuetzte Datenpfade sind nicht oeffentlich.");
