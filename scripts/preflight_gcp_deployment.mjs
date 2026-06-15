import { execFileSync } from "node:child_process";
import fs from "node:fs";

const requiredFiles = [
  "Dockerfile",
  "Dockerfile.api",
  "Jenkinsfile",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GCP_GEMATIK.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "api/server.mjs",
  "docs/data/supabase-config.js"
];

const requiredCommands = ["docker", "npm", "git", "gcloud"];
const requiredEnv = [
  "PROJECT_ID",
  "REGION",
  "REPOSITORY",
  "FRONTEND_SERVICE",
  "API_SERVICE",
  "API_BASE_URL",
  "FRONTEND_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY"
];

function ok(message) {
  console.log(`OK  ${message}`);
}

function warn(message) {
  console.log(`WARN ${message}`);
}

function fail(message) {
  console.log(`FAIL ${message}`);
}

function commandExists(command) {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveCommand(command) {
  if (commandExists(command)) return command;
  if (command === "gcloud") {
    const localGcloud = `${process.env.HOME || ""}/google-cloud-sdk/bin/gcloud`;
    if (fs.existsSync(localGcloud)) return localGcloud;
  }
  return "";
}

function commandOutput(command, args = []) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const failures = [];
const warnings = [];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) ok(`Datei vorhanden: ${file}`);
  else {
    failures.push(`Datei fehlt: ${file}`);
    fail(`Datei fehlt: ${file}`);
  }
}

const commands = new Map();
for (const command of requiredCommands) {
  const resolved = resolveCommand(command);
  if (resolved) {
    commands.set(command, resolved);
    ok(`Tool vorhanden: ${command}${resolved === command ? "" : ` (${resolved})`}`);
  }
  else {
    failures.push(`Tool fehlt oder ist nicht im PATH: ${command}`);
    fail(`Tool fehlt oder ist nicht im PATH: ${command}`);
  }
}

if (commands.has("docker")) {
  try {
    commandOutput("docker", ["info"]);
    ok("Docker Daemon erreichbar");
  } catch {
    failures.push("Docker Daemon ist nicht erreichbar.");
    fail("Docker Daemon ist nicht erreichbar.");
  }
}

if (commands.has("gcloud")) {
  const gcloud = commands.get("gcloud");
  const account = commandOutput("sh", ["-lc", `${gcloud} auth list --filter=status:ACTIVE --format='value(account)' | head -1`]);
  const project = commandOutput("sh", ["-lc", `${gcloud} config get-value project 2>/dev/null || true`]);
  if (account) ok(`gcloud Account aktiv: ${account}`);
  else {
    failures.push("Kein aktiver gcloud Account. Bitte gcloud auth login ausfuehren.");
    fail("Kein aktiver gcloud Account.");
  }
  if (project) ok(`gcloud Projekt gesetzt: ${project}`);
  else {
    warnings.push("Kein gcloud Projekt gesetzt. Jenkins kann PROJECT_ID trotzdem per Credential setzen.");
    warn("Kein gcloud Projekt gesetzt.");
  }
}

for (const name of requiredEnv) {
  const value = process.env[name];
  if (value) ok(`Env gesetzt: ${name}`);
  else {
    warnings.push(`Env fehlt lokal: ${name}`);
    warn(`Env fehlt lokal: ${name}`);
  }
}

const apiBaseUrl = process.env.API_BASE_URL || "";
if (apiBaseUrl) {
  if (!apiBaseUrl.startsWith("https://")) {
    failures.push("API_BASE_URL muss fuer Produktivdeployments mit https:// beginnen.");
    fail("API_BASE_URL ist keine HTTPS-URL.");
  } else if (/localhost|127\.0\.0\.1|\[::1\]/i.test(apiBaseUrl)) {
    failures.push("API_BASE_URL darf fuer Produktivdeployments nicht auf localhost zeigen.");
    fail("API_BASE_URL zeigt auf localhost.");
  } else {
    ok("API_BASE_URL ist produktionsgeeignet.");
  }
}

if (warnings.length) {
  console.log("\nHinweise:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.log("\nDeployment Preflight FAILED:");
  failures.forEach((message) => console.log(`- ${message}`));
  process.exit(1);
}

console.log("\nDeployment Preflight OK: lokale Voraussetzungen fuer Jenkins/GCP-Deployment sind erfuellt.");
