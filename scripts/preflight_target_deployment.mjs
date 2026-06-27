import { execFileSync } from "node:child_process";
import fs from "node:fs";

const requiredFiles = [
  "api/Dockerfile",
  "dokumentation/betrieb-und-deployment/artefakte/Jenkinsfile.gematik",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/Chart.yaml",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/values.yaml",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "api/server.mjs",
  "docs/data/supabase-config.js"
];

const requiredCommands = ["docker", "npm", "git", "helm"];
const optionalCommands = ["kubectl", "trivy"];
const requiredEnv = [
  "ARTIFACT_REGISTRY",
  "API_IMAGE",
  "API_BASE_URL",
  "FRONTEND_BASE_URL",
  "K8S_NAMESPACE",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD_SECRET_NAME",
  "API_AUTH_MODE",
  "AUTH_EMAIL_HEADER"
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

const failures = [];
const warnings = [];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) ok(`Datei vorhanden: ${file}`);
  else {
    failures.push(`Datei fehlt: ${file}`);
    fail(`Datei fehlt: ${file}`);
  }
}

for (const command of requiredCommands) {
  if (commandExists(command)) ok(`Tool vorhanden: ${command}`);
  else {
    failures.push(`Tool fehlt oder ist nicht im PATH: ${command}`);
    fail(`Tool fehlt oder ist nicht im PATH: ${command}`);
  }
}

for (const command of optionalCommands) {
  if (commandExists(command)) ok(`Optionales Tool vorhanden: ${command}`);
  else {
    warnings.push(`Optionales Tool fehlt lokal: ${command}. Jenkins kann es trotzdem bereitstellen.`);
    warn(`Optionales Tool fehlt lokal: ${command}`);
  }
}

if (commandExists("docker")) {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    ok("Docker Daemon erreichbar");
  } catch {
    warnings.push("Docker Daemon ist lokal nicht erreichbar. In Jenkins muss er erreichbar sein.");
    warn("Docker Daemon ist lokal nicht erreichbar.");
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
    failures.push("API_BASE_URL muss fuer Zieldeployments mit https:// beginnen.");
    fail("API_BASE_URL ist keine HTTPS-URL.");
  } else if (/localhost|127\.0\.0\.1|\[::1\]/i.test(apiBaseUrl)) {
    failures.push("API_BASE_URL darf fuer Zieldeployments nicht auf localhost zeigen.");
    fail("API_BASE_URL zeigt auf localhost.");
  } else {
    ok("API_BASE_URL ist zielgeeignet.");
  }
}

const authMode = process.env.API_AUTH_MODE || "";
if (authMode && !["trusted-header", "sso"].includes(authMode)) {
  failures.push("API_AUTH_MODE muss trusted-header oder sso sein.");
  fail("API_AUTH_MODE ist ungueltig.");
}

const emailHeader = process.env.AUTH_EMAIL_HEADER || "";
if (emailHeader && !/^[a-z0-9-]+$/i.test(emailHeader)) {
  failures.push("AUTH_EMAIL_HEADER muss ein HTTP-Header-Name sein.");
  fail("AUTH_EMAIL_HEADER ist ungueltig.");
}

if (warnings.length) {
  console.log("\nHinweise:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.log("\nTarget Deployment Preflight FAILED:");
  failures.forEach((message) => console.log(`- ${message}`));
  process.exit(1);
}

console.log("\nTarget Deployment Preflight OK: lokale Voraussetzungen fuer Software-Factory/Kubernetes sind plausibel.");
