import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const defaultBaseUrl = "https://timofrank.github.io/mitmachen";
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
const defaultAssets = [
  "versorgungs-kompass.html",
  "hospitations-dokumentation.html",
  "data/supabase-config.js",
  "data/data-service.js",
  "data/stakeholder-data.js"
];
const assets = String(process.env.PUBLICATION_ASSETS || "")
  .split(",")
  .map((asset) => asset.trim())
  .filter(Boolean);
const publicationAssets = assets.length ? assets : defaultAssets;
const cacheBust = `publication_check=${Date.now()}`;
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readDocsAsset(assetPath) {
  return readFileSync(join(root, "docs", assetPath), "utf8");
}

async function fetchPublicAsset(assetPath) {
  const separator = assetPath.includes("?") ? "&" : "?";
  const url = `${publicBaseUrl}/${assetPath}${separator}${cacheBust}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache"
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function dataModeFromConfig(configText) {
  const match = configText.match(/dataMode\s*:\s*["']([^"']+)["']/);
  return match ? match[1].toLowerCase() : "";
}

function gitFiles(command, argsForCommand) {
  try {
    return execFileSync(command, argsForCommand, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function changedFilesForSupabaseRisk() {
  const files = new Set([
    ...gitFiles("git", ["diff", "--name-only"]),
    ...gitFiles("git", ["diff", "--name-only", "--cached"]),
    ...gitFiles("git", ["diff", "--name-only", "origin/main...HEAD"]),
    ...gitFiles("git", ["show", "--name-only", "--format=", "HEAD"])
  ]);
  return [...files].filter((file) =>
    /^(supabase\/migrations\/|supabase\/schema\.sql|frontend\/data\/stakeholder-data\.js|data\/stakeholder-data\.js|docs\/data\/stakeholder-data\.js)/.test(file)
  );
}

function liveStatusFromInput() {
  if (args.has("--supabase-live-verified")) return "verified";
  if (args.has("--supabase-not-affected")) return "not_affected";
  return String(process.env.SUPABASE_LIVE_STATUS || "").trim().toLowerCase();
}

for (const asset of publicationAssets) {
  try {
    const localContent = readDocsAsset(asset);
    const publicContent = await fetchPublicAsset(asset);
    const localHash = sha256(localContent);
    const publicHash = sha256(publicContent);
    if (localHash !== publicHash) {
      fail(`${asset}: oeffentliche Datei stimmt nicht mit docs/ ueberein (${publicHash.slice(0, 12)} statt ${localHash.slice(0, 12)})`);
    } else {
      console.log(`OK  GitHub Pages asset aktuell: ${asset}`);
    }
  } catch (error) {
    fail(`${asset}: oeffentliche Datei konnte nicht geprueft werden (${error.message})`);
  }
}

let publicDataMode = "";
try {
  publicDataMode = dataModeFromConfig(await fetchPublicAsset("data/supabase-config.js"));
  if (!publicDataMode) warn("dataMode konnte aus der oeffentlichen Supabase-Konfiguration nicht gelesen werden.");
} catch (error) {
  fail(`data/supabase-config.js: dataMode konnte nicht gelesen werden (${error.message})`);
}

const localDataMode = dataModeFromConfig(readDocsAsset("data/supabase-config.js"));
const dataMode = publicDataMode || localDataMode;
if (dataMode === "supabase") {
  const liveStatus = liveStatusFromInput();
  const riskyFiles = changedFilesForSupabaseRisk();
  if (!["verified", "not_affected"].includes(liveStatus)) {
    fail(
      "Supabase-Live-Datenstatus fehlt. Bei dataMode=supabase muss vor einem Sichtbarkeitsabschluss " +
        "`SUPABASE_LIVE_STATUS=verified` nach SQL/REST/MCP-Pruefung oder `SUPABASE_LIVE_STATUS=not_affected` fuer reine Static/UI-Aenderungen gesetzt werden."
    );
  }
  if (liveStatus === "not_affected" && riskyFiles.length) {
    fail(`Supabase-Live-Daten duerfen nicht als not_affected markiert werden; relevante Dateien erkannt: ${riskyFiles.join(", ")}`);
  }
  if (liveStatus === "verified") {
    console.log("OK  Supabase-Live-Datenstatus wurde fuer diesen Abschluss als verified markiert.");
  }
  if (liveStatus === "not_affected") {
    console.log("OK  Supabase-Live-Datenstatus wurde fuer diesen Abschluss als not_affected markiert.");
  }
}

if (warnings.length) {
  console.log("\nHinweise:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.error("\nPublication Verification FAILED:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nPublication Verification OK: GitHub Pages und Live-Datenstatus wurden getrennt geprueft.");
