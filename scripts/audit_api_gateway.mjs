import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientRoots = ["frontend"];
const tableNames = [
  "contacts",
  "organizations",
  "profiles",
  "saved_views",
  "user_settings",
  "formats",
  "format_participants",
  "hospitation_slots",
  "hospitations",
  "changes",
  "activity_events",
  "expert_groups",
  "expert_contacts",
  "expert_organizations",
  "expert_entity_links"
];
const tablePattern = tableNames.join("|");
const disallowedPatterns = [
  {
    label: "Direkter Supabase-Tabellenzugriff im Browser",
    regex: new RegExp(`(?:supabase|getClient\\s*\\(\\))?\\s*\\.?\\s*from\\s*\\(\\s*["'\`](${tablePattern})["'\`]`, "g")
  },
  {
    label: "Direkter Supabase-Storage-Zugriff im Browser",
    regex: /\.storage\s*\.\s*from\s*\(/g
  },
  {
    label: "Direkte Supabase-REST-URL im Browser",
    regex: new RegExp(`/rest/v1/(${tablePattern})\\b`, "g")
  }
];

const args = process.argv.slice(2);
const productionConfigIndex = args.indexOf("--production-config");
const productionConfigPath = productionConfigIndex >= 0 ? args[productionConfigIndex + 1] : "";
const targetDataModes = new Set(["api"]);
const targetAuthModes = new Set(["iap", "oidc"]);
const supabaseRuntimePatterns = [
  {
    label: "Supabase Browser-SDK im Ziel-Produktionsartefakt",
    regex: /@supabase\/supabase-js|supabase-js@/g
  },
  {
    label: "Direkte Supabase-Projekt-URL im Ziel-Produktionsartefakt",
    regex: /https:\/\/[a-z0-9-]+\.supabase\.co/gi
  }
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(js|mjs|html)$/i.test(entry.name)) return [];
    return [fullPath];
  });
}

function assertActivityEventWriteBoundary() {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const frontendService = read("frontend/data/data-service.js");
  const apiServer = read("api/server.mjs");
  const migration = read("supabase/migrations/20260716095902_create_activity_events.sql");
  const hardeningMigration = read("supabase/migrations/20260716131500_harden_activity_event_ledger.sql");
  const schema = read("supabase/schema.sql");
  const violations = [];
  for (const [file, source] of [["frontend/data/data-service.js", frontendService]]) {
    if (/\brecordActivityEvent\b/.test(source)) violations.push(`${file}: oeffentlicher Activity-Producer vorhanden`);
    if (/from\s*\(\s*["']activity_events["']\s*\)[\s\S]{0,300}?\.insert\s*\(/.test(source)) {
      violations.push(`${file}: direkter Browser-Insert in activity_events vorhanden`);
    }
  }
  if (/request\.method\s*===\s*["']POST["']\s*&&\s*url\.pathname\s*===\s*["']\/api\/activities["']/.test(apiServer)) {
    violations.push("api/server.mjs: generische POST-Route fuer /api/activities vorhanden");
  }
  if (!/\["POST", "PUT", "PATCH", "DELETE"\]\.includes\(request\.method\)[\s\S]{0,120}?url\.pathname\s*===\s*"\/api\/activities"[\s\S]{0,240}?jsonResponse\(response, 405,/.test(apiServer)) {
    violations.push("api/server.mjs: explizite 405-Sperre fuer schreibende /api/activities-Methoden fehlt");
  }
  if (!/async function recordActivityEventInternal\s*\(transaction,\s*request,/.test(apiServer)) {
    violations.push("api/server.mjs: privater serverseitiger Activity-Writer fehlt");
  }
  if (!/recordActivityEventInternal[\s\S]{0,320}?transaction\?\.\[DOMAIN_TRANSACTION\][\s\S]{0,240}?Fachvorgangs-Transaktion/.test(apiServer)) {
    violations.push("api/server.mjs: Activity-Writer erzwingt keine Fachvorgangs-Transaktion");
  }
  for (const [file, source] of [
    ["supabase/migrations/20260716095902_create_activity_events.sql", migration],
    ["supabase/migrations/20260716131500_harden_activity_event_ledger.sql", hardeningMigration],
    ["supabase/schema.sql", schema]
  ]) {
    if (/grant\s+[^;]*insert[^;]*on(?:\s+table)?\s+public\.activity_events\s+to\s+authenticated/i.test(source)) {
      violations.push(`${file}: authenticated besitzt INSERT auf activity_events`);
    }
    if (/grant\s+[^;]*on\s+sequence\s+public\.activity_events_id_seq\s+to\s+[^;]*authenticated/i.test(source)) {
      violations.push(`${file}: authenticated besitzt Rechte auf activity_events_id_seq`);
    }
    if (/create\s+policy[\s\S]{0,240}?on\s+public\.activity_events\s+for\s+insert[\s\S]{0,160}?to\s+authenticated/i.test(source)) {
      violations.push(`${file}: authenticated Insert-Policy fuer activity_events vorhanden`);
    }
    if (/grant\s+[^;]*(?:update|delete)[^;]*on(?:\s+table)?\s+public\.activity_events\s+to\s+service_role/i.test(source)) {
      violations.push(`${file}: service_role darf das append-only Ledger veraendern oder loeschen`);
    }
  }
  for (const [file, source] of [
    ["supabase/migrations/20260716131500_harden_activity_event_ledger.sql", hardeningMigration],
    ["supabase/schema.sql", schema]
  ]) {
    const required = [
      [/grant\s+select\s+on(?:\s+table)?\s+public\.activity_events\s+to\s+authenticated/i, "authenticated SELECT-Grant"],
      [/grant\s+select\s*,\s*insert\s+on(?:\s+table)?\s+public\.activity_events\s+to\s+service_role/i, "serverseitiger INSERT-Grant"],
      [/changes_canonical_reference_pair_check[\s\S]{0,260}?activity_event_id is null[\s\S]{0,120}?canonicalized_at is null/i, "gekoppelte Kanonisierungsfelder"],
      [/changes_activity_event_contact_fkey[\s\S]{0,180}?foreign key\s*\(contact_id,\s*activity_event_id\)[\s\S]{0,180}?references\s+public\.activity_events\s*\(contact_id,\s*id\)/i, "Kontakt-paritaet der Activity-Verknuepfung"],
      [/activity_events_contact_id_fkey[\s\S]{0,180}?references\s+public\.contacts\s*\(id\)[\s\S]{0,80}?on delete restrict/i, "Loeschschutz fuer kontaktbezogene Ereignisse"],
      [/activity_contact_references_match[\s\S]{0,620}?item\s*->>\s*'id'\s+is distinct from\s+p_contact_id/i, "eindeutiger Kontaktbezug fuer Referenzen"],
      [/activity_events_contact_reference_check[\s\S]{0,160}?activity_contact_references_match\s*\(["']?references["']?,\s*contact_id\)/i, "Kontakt-Referenz-Constraint"],
      [/create policy "changes authenticated read"[\s\S]{0,520}?c\.status\s*<>\s*'archived'/i, "Archivschutz fuer changes"],
      [/create policy "changes editor admin insert"[\s\S]{0,420}?activity_event_id is null[\s\S]{0,120}?canonicalized_at is null/i, "serverexklusive Kanonisierungsverknuepfung"],
      [/create policy "activity events active profiles read"[\s\S]{0,620}?c\.status\s*<>\s*'archived'/i, "Archivschutz fuer activity_events"]
    ];
    required.forEach(([pattern, label]) => {
      if (!pattern.test(source)) violations.push(`${file}: ${label} fehlt`);
    });
  }
  if (violations.length) throw new Error(violations.join("\n- "));
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

function scanClientFiles() {
  const findings = [];
  const files = clientRoots.flatMap((dir) => walk(path.join(root, dir)));
  for (const file of files) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of disallowedPatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of source.matchAll(pattern.regex)) {
        const location = lineAndColumn(source, match.index || 0);
        findings.push({
          file: relative,
          line: location.line,
          column: location.column,
          label: pattern.label,
          match: match[0]
        });
      }
    }
  }
  return findings;
}

function configString(source, key) {
  return new RegExp(`${key}:\\s*"([^"]*)"`).exec(source)?.[1] || "";
}

function configBoolean(source, key) {
  return new RegExp(`${key}:\\s*true`).test(source);
}

function assertProductionConfig(configPath) {
  if (!configPath) return null;
  const fullPath = path.resolve(root, configPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Produktionskonfiguration fehlt: ${configPath}`);
  }
  const source = fs.readFileSync(fullPath, "utf8");
  const apiBaseUrl = configString(source, "apiBaseUrl");
  const authMode = configString(source, "authMode");
  const dataMode = configString(source, "dataMode");
  const apiCredentials = configString(source, "apiCredentials");
  const requireApiGateway = configBoolean(source, "requireApiGateway");
  if (!/^https:\/\//.test(apiBaseUrl)) {
    throw new Error(`${configPath}: apiBaseUrl muss fuer das Produktionsartefakt eine HTTPS-URL sein.`);
  }
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(apiBaseUrl)) {
    throw new Error(`${configPath}: apiBaseUrl darf im Produktionsartefakt nicht auf localhost zeigen.`);
  }
  if (!requireApiGateway) {
    throw new Error(`${configPath}: requireApiGateway muss im Produktionsartefakt true sein.`);
  }
  if (targetDataModes.has(dataMode)) {
    if (!targetAuthModes.has(authMode)) {
      throw new Error(`${configPath}: authMode muss im Ziel-Produktionsartefakt iap oder oidc sein.`);
    }
    if (apiCredentials !== "include") {
      throw new Error(`${configPath}: apiCredentials muss fuer den geschuetzten API-Pfad include sein.`);
    }
    if (/supabaseUrl|supabaseAnonKey/.test(source)) {
      throw new Error(`${configPath}: Ziel-Produktionsartefakt darf keine oeffentlichen Supabase-Keys enthalten.`);
    }
    if (/registrationEndpoint/.test(source)) {
      throw new Error(`${configPath}: Ziel-Produktionsartefakt darf keinen Supabase-Registrierungsendpunkt enthalten.`);
    }
  }
  const artifactRoot = path.basename(fullPath) === "runtime-config.js" && path.basename(path.dirname(fullPath)) === "data"
    ? path.dirname(path.dirname(fullPath))
    : path.dirname(fullPath);
  return { dataMode, authMode, apiBaseUrl, apiCredentials, artifactRoot };
}

function scanSupabaseRuntimeArtifacts(artifactRoot = path.join(root, "dist", "target")) {
  const findings = [];
  const files = walk(artifactRoot)
    .filter((file) => !/\/data\/data-service\.js$/.test(file));
  for (const file of files) {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of supabaseRuntimePatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of source.matchAll(pattern.regex)) {
        const location = lineAndColumn(source, match.index || 0);
        findings.push({
          file: relative,
          line: location.line,
          column: location.column,
          label: pattern.label,
          match: match[0]
        });
      }
    }
  }
  return findings;
}

let productionConfig = null;
try {
  assertActivityEventWriteBoundary();
  productionConfig = assertProductionConfig(productionConfigPath);
} catch (error) {
  console.error(`API Gateway Audit FAILED: ${error.message}`);
  process.exit(1);
}

if (!productionConfigPath) {
  console.log("API Gateway Audit OK: Activity-Writer ist serverintern und authenticated bleibt read-only. Produktionsartefakt-Pruefung uebersprungen.");
  process.exit(0);
}

const findings = targetDataModes.has(productionConfig?.dataMode)
  ? scanSupabaseRuntimeArtifacts(productionConfig.artifactRoot)
  : scanClientFiles();
if (findings.length) {
  console.error("API Gateway Audit FAILED: unzulaessige Supabase-Browserpfade im Produktionsartefakt gefunden.");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}:${finding.column} ${finding.label}: ${finding.match}`);
  }
  process.exit(1);
}

console.log(`API Gateway Audit OK: fachliche Supabase-Zugriffe laufen nicht direkt aus dem Browser. Produktionskonfiguration OK (${productionConfigPath}).`);
