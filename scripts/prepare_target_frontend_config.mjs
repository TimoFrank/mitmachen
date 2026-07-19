import fs from "node:fs";
import path from "node:path";

const [
  configPath = "",
  apiBaseUrl = process.env.API_BASE_URL || "",
  dataMode = process.env.TARGET_DATA_MODE || "api",
  authMode = process.env.TARGET_AUTH_MODE || process.env.API_AUTH_MODE || "oidc"
] = process.argv.slice(2);

const allowedDataModes = new Set(["api"]);
const allowedAuthModes = new Set(["iap", "oidc"]);

if (!configPath) {
  throw new Error("Pfad zur Ziel-Frontend-Konfiguration fehlt.");
}

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL fehlt fuer das Ziel-Frontend-Artefakt.");
}

if (!allowedDataModes.has(dataMode)) {
  throw new Error(`TARGET_DATA_MODE muss ${[...allowedDataModes].join(" oder ")} sein.`);
}

if (!allowedAuthModes.has(authMode)) {
  throw new Error(`TARGET_AUTH_MODE/API_AUTH_MODE muss ${[...allowedAuthModes].join(" oder ")} sein.`);
}

function upsertStringProperty(source, key, value, anchorKey = "dataMode") {
  const pattern = new RegExp(`${key}:\\s*"[^"]*"`);
  if (pattern.test(source)) return source.replace(pattern, `${key}: "${value}"`);
  const anchor = new RegExp(`${anchorKey}:\\s*"[^"]*"`);
  return source.replace(anchor, (match) => `${match},\n  ${key}: "${value}"`);
}

function upsertBooleanProperty(source, key, value, anchorKey = "apiBaseUrl") {
  const pattern = new RegExp(`${key}:\\s*(true|false)`);
  if (pattern.test(source)) return source.replace(pattern, `${key}: ${value ? "true" : "false"}`);
  const anchor = new RegExp(`${anchorKey}:\\s*"[^"]*"`);
  return source.replace(anchor, (match) => `${match},\n  ${key}: ${value ? "true" : "false"}`);
}

let source = fs.readFileSync(configPath, "utf8");
source = source.replace(/\n\s*supabaseUrl:\s*"[^"]*",?/g, "");
source = source.replace(/\n\s*supabaseAnonKey:\s*"[^"]*",?/g, "");
source = source.replace(/\n\s*registrationEndpoint:\s*"[^"]*",?/g, "");
source = upsertStringProperty(source, "dataMode", dataMode);
source = upsertStringProperty(source, "authMode", authMode);
source = upsertStringProperty(source, "apiBaseUrl", apiBaseUrl);
source = upsertStringProperty(source, "apiCredentials", "include", "apiBaseUrl");
source = upsertBooleanProperty(source, "requireApiGateway", true);

fs.writeFileSync(configPath, source);

function artifactRootFromConfig(filePath) {
  const normalized = path.normalize(filePath);
  const suffix = path.join("data", "runtime-config.js");
  if (normalized.endsWith(suffix)) return path.dirname(path.dirname(normalized));
  return "";
}

function walkFiles(dir, extensions) {
  if (!dir || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, extensions);
    return entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  });
}

const artifactRoot = artifactRootFromConfig(configPath);
for (const htmlPath of walkFiles(artifactRoot, new Set([".html"]))) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const stripped = html.replace(
    /\n?\s*<script\b[^>]*src=["'][^"']*(?:supabase-js|vendor\/supabase\/supabase\.js|data\/(?:demo-data|versorgungs-kompass-data|expertenkreis-data|stakeholder-data|patienten-data)\.js)[^"']*["'][^>]*><\/script>/gi,
    ""
  );
  if (stripped !== html) fs.writeFileSync(htmlPath, stripped);
}

function removeDemoControls(source) {
  let result = source.replace(
    /<div\b[^>]*class=["'][^"']*hospitation-dashboard-preview-toggle[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    (control) => /data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)=["']demo["']/i.test(control)
      ? ""
      : control
  );
  result = result.replace(
    /<button\b(?=[^>]*data-hospitation-(?:data-mode|documentation-data-mode|dashboard-preview-mode)=["']demo["'])[^>]*>[\s\S]*?<\/button>/gi,
    ""
  );
  result = result.replace(/<button\b(?=[^>]*id=["']registrations-reset-demo["'])[^>]*>[\s\S]*?<\/button>/gi, "");
  result = result.replace(/<div\b[^>]*class=["'][^"']*hospitation-data-mode-compact[^"']*["'][^>]*>\s*<\/div>/gi, "");
  return result;
}

for (const surfacePath of walkFiles(artifactRoot, new Set([".html", ".js"]))) {
  const before = fs.readFileSync(surfacePath, "utf8");
  const after = removeDemoControls(before);
  if (after !== before) fs.writeFileSync(surfacePath, after);
}

if (artifactRoot) {
  for (const retiredPath of [
    path.join(artifactRoot, "demo"),
    path.join(artifactRoot, "data", "demo-data.js"),
    path.join(artifactRoot, "data", "versorgungs-kompass-data.js"),
    path.join(artifactRoot, "data", "versorgungs-kompass-data.csv"),
    path.join(artifactRoot, "data", "expertenkreis-data.js"),
    path.join(artifactRoot, "data", "stakeholder-data.js"),
    path.join(artifactRoot, "data", "patienten-data.js")
  ]) {
    fs.rmSync(retiredPath, { recursive: true, force: true });
  }
}

const result = fs.readFileSync(configPath, "utf8");
const expectedDataMode = new RegExp(`dataMode:\\s*"${dataMode}"`);
const expectedAuthMode = new RegExp(`authMode:\\s*"${authMode}"`);
if (
  !expectedDataMode.test(result) ||
  !expectedAuthMode.test(result) ||
  !/apiBaseUrl:\s*"https:\/\//.test(result) ||
  !/apiCredentials:\s*"include"/.test(result) ||
  !/requireApiGateway:\s*true/.test(result) ||
  /supabaseUrl|supabaseAnonKey|registrationEndpoint/.test(result)
) {
  throw new Error("Ziel-Frontend-Artefakt muss API-Modus, Auth-Modus, apiBaseUrl, apiCredentials=include und requireApiGateway=true ohne Supabase-Keys oder -Registrierungsendpunkt setzen.");
}

console.log(`Target Frontend Config OK: ${configPath} (${dataMode}/${authMode})`);
