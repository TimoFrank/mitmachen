import fs from "node:fs";
import path from "node:path";

const [
  configPath = "docs/data/supabase-config.js",
  apiBaseUrl = process.env.API_BASE_URL || "",
  dataMode = process.env.TARGET_DATA_MODE || "api",
  authMode = process.env.TARGET_AUTH_MODE || process.env.API_AUTH_MODE || "trusted-header"
] = process.argv.slice(2);

const allowedDataModes = new Set(["api", "gcp"]);
const allowedAuthModes = new Set(["trusted-header", "sso"]);

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
source = upsertStringProperty(source, "dataMode", dataMode);
source = upsertStringProperty(source, "authMode", authMode);
source = upsertStringProperty(source, "apiBaseUrl", apiBaseUrl);
source = upsertBooleanProperty(source, "requireApiGateway", true);

fs.writeFileSync(configPath, source);

function artifactRootFromConfig(filePath) {
  const normalized = path.normalize(filePath);
  const suffix = path.join("data", "supabase-config.js");
  if (normalized.endsWith(suffix)) return path.dirname(path.dirname(normalized));
  return "";
}

function walkHtmlFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkHtmlFiles(fullPath);
    return entry.isFile() && /\.html$/i.test(entry.name) ? [fullPath] : [];
  });
}

const artifactRoot = artifactRootFromConfig(configPath);
for (const htmlPath of walkHtmlFiles(artifactRoot)) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const stripped = html.replace(/\n?\s*<script\b[^>]*supabase-js[^>]*><\/script>/gi, "");
  if (stripped !== html) fs.writeFileSync(htmlPath, stripped);
}

const result = fs.readFileSync(configPath, "utf8");
const expectedDataMode = new RegExp(`dataMode:\\s*"${dataMode}"`);
const expectedAuthMode = new RegExp(`authMode:\\s*"${authMode}"`);
if (
  !expectedDataMode.test(result) ||
  !expectedAuthMode.test(result) ||
  !/apiBaseUrl:\s*"https:\/\//.test(result) ||
  !/requireApiGateway:\s*true/.test(result) ||
  /supabaseUrl|supabaseAnonKey/.test(result)
) {
  throw new Error("Ziel-Frontend-Artefakt muss API-Modus, Auth-Modus, apiBaseUrl und requireApiGateway=true ohne Supabase-Keys setzen.");
}

console.log(`Target Frontend Config OK: ${configPath} (${dataMode}/${authMode})`);
