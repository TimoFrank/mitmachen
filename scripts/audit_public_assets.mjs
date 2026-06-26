import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const publicFiles = [
  "frontend/data/versorgungs-kompass-data.csv",
  "frontend/data/versorgungs-kompass-data.js",
  "docs/data/versorgungs-kompass-data.csv",
  "docs/data/versorgungs-kompass-data.js",
  "frontend/data/supabase-config.js",
  "docs/data/supabase-config.js"
];

const failures = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const relativePath of publicFiles) {
  assert(statSync(join(root, relativePath)).isFile(), `${relativePath} fehlt`);
}

const seedCsv = read("frontend/data/versorgungs-kompass-data.csv");
const docsSeedCsv = read("docs/data/versorgungs-kompass-data.csv");
const seedJs = read("frontend/data/versorgungs-kompass-data.js");
const docsSeedJs = read("docs/data/versorgungs-kompass-data.js");
const config = read("frontend/data/supabase-config.js");
const docsConfig = read("docs/data/supabase-config.js");

assert(seedCsv.split(/\r?\n/).filter(Boolean).length === 1, "frontend/data/versorgungs-kompass-data.csv darf nur die Header-Zeile enthalten");
assert(docsSeedCsv.split(/\r?\n/).filter(Boolean).length === 1, "docs/data/versorgungs-kompass-data.csv darf nur die Header-Zeile enthalten");
assert(seedJs.includes("window.VERSORGUNGS_COMPASS_CONTACTS = [];"), "frontend/data/versorgungs-kompass-data.js muss leer bleiben");
assert(docsSeedJs.includes("window.VERSORGUNGS_COMPASS_CONTACTS = [];"), "docs/data/versorgungs-kompass-data.js muss leer bleiben");

for (const [label, content] of [
  ["frontend/data/supabase-config.js", config],
  ["docs/data/supabase-config.js", docsConfig]
]) {
  const dataMode = /dataMode\s*:\s*["']([^"']+)["']/.exec(content)?.[1] || "";
  assert(!/service[_-]?role/i.test(content), `${label} enthaelt Service-Role-Hinweis`);
  assert(!/sb_secret_/i.test(content), `${label} enthaelt moeglich geheimen Supabase-Key`);
  if (dataMode === "api") {
    assert(!/supabaseAnonKey|supabaseUrl/.test(content), `${label} darf im Ziel-API-Modus keine Supabase-Keys enthalten`);
    assert(/authMode\s*:\s*["'](trusted-header|sso)["']/.test(content), `${label} muss im Ziel-API-Modus einen freigegebenen authMode setzen`);
    assert(/requireApiGateway\s*:\s*true/.test(content), `${label} muss im Ziel-API-Modus requireApiGateway=true setzen`);
  } else {
    assert(/supabaseAnonKey/.test(content), `${label} enthaelt keinen anon/publishable Key`);
  }
}

const suspiciousPublicSeedText = [seedCsv, docsSeedCsv, seedJs, docsSeedJs].join("\n");
assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(suspiciousPublicSeedText), "Oeffentliche Seed-Dateien enthalten E-Mail-Adressen");
assert(!/linkedin\.com/i.test(suspiciousPublicSeedText), "Oeffentliche Seed-Dateien enthalten LinkedIn-URLs");
assert(!/\+?\d[\d\s()./-]{7,}\d/.test(suspiciousPublicSeedText), "Oeffentliche Seed-Dateien enthalten moegliche Telefonnummern");

if (failures.length) {
  console.error("Public Asset Audit fehlgeschlagen:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Public Asset Audit OK: keine oeffentlichen Kontakt-Seeds oder Service-Role-Keys gefunden.");
