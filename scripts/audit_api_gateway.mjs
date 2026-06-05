import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientRoots = ["app", "data", "login", "map", "mitmachen", "docs"];
const tableNames = [
  "contacts",
  "organizations",
  "profiles",
  "saved_views",
  "user_settings",
  "formats",
  "format_participants",
  "changes",
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

function assertProductionConfig(configPath) {
  if (!configPath) return;
  const fullPath = path.resolve(root, configPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Produktionskonfiguration fehlt: ${configPath}`);
  }
  const source = fs.readFileSync(fullPath, "utf8");
  const apiBaseUrl = /apiBaseUrl:\s*"([^"]+)"/.exec(source)?.[1] || "";
  const requireApiGateway = /requireApiGateway:\s*true/.test(source);
  if (!/^https:\/\//.test(apiBaseUrl)) {
    throw new Error(`${configPath}: apiBaseUrl muss fuer das Produktionsartefakt eine HTTPS-URL sein.`);
  }
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(apiBaseUrl)) {
    throw new Error(`${configPath}: apiBaseUrl darf im Produktionsartefakt nicht auf localhost zeigen.`);
  }
  if (!requireApiGateway) {
    throw new Error(`${configPath}: requireApiGateway muss im Produktionsartefakt true sein.`);
  }
}

try {
  assertProductionConfig(productionConfigPath);
} catch (error) {
  console.error(`API Gateway Audit FAILED: ${error.message}`);
  process.exit(1);
}

if (!productionConfigPath) {
  console.log("API Gateway Audit SKIPPED: kein Produktionsartefakt angegeben; GitHub-Pages-/lokaler Supabase-Client-Modus ist erlaubt.");
  process.exit(0);
}

const findings = scanClientFiles();
if (findings.length) {
  console.error("API Gateway Audit FAILED: direkte fachliche Supabase-Zugriffe im Browser gefunden.");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}:${finding.column} ${finding.label}: ${finding.match}`);
  }
  process.exit(1);
}

console.log(`API Gateway Audit OK: fachliche Supabase-Zugriffe laufen nicht direkt aus dem Browser. Produktionskonfiguration OK (${productionConfigPath}).`);
