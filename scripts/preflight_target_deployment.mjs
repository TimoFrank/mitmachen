import { execFileSync } from "node:child_process";
import fs from "node:fs";

const requiredFiles = [
  "api/Dockerfile",
  "deploy/jenkins/Jenkinsfile.gematik",
  "deploy/helm/versorgungs-kompass/Chart.yaml",
  "deploy/helm/versorgungs-kompass/values.yaml",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "dokumentation/betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md",
  "dokumentation/betrieb-und-deployment/BETRIEBSVERANTWORTUNG_RACI.md",
  "dokumentation/betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md",
  "dokumentation/betrieb-und-deployment/ABNAHMEPROTOKOLL_TEMPLATE.md",
  "deploy/README.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "api/server.mjs",
  "scripts/build_static_frontend.sh",
  "scripts/check_deployment_governance.mjs",
  "scripts/test_deployment_separation.mjs"
];

const requiredCommands = ["docker", "npm", "git", "helm"];
const optionalCommands = ["kubectl", "trivy"];
const requiredEnv = [
  "ARTIFACT_REGISTRY",
  "API_IMAGE",
  "API_BASE_URL",
  "FRONTEND_BASE_URL",
  "FRONTEND_BUCKET_URI",
  "K8S_NAMESPACE",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD_SECRET_NAME",
  "API_AUTH_MODE"
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

function validateHttpsOrigin(name, value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const isPlainOrigin = parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && parsed.pathname === "/"
      && !parsed.search
      && !parsed.hash;
    if (!isPlainOrigin || /^(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(parsed.host)) {
      throw new Error("not a deployable HTTPS origin");
    }
    ok(`${name} ist ein zielgeeigneter HTTPS-Origin.`);
    return parsed.origin;
  } catch {
    failures.push(`${name} muss ein HTTPS-Origin ohne Pfad, Credentials, Query oder Fragment sein und darf nicht auf localhost zeigen.`);
    fail(`${name} ist kein zielgeeigneter HTTPS-Origin.`);
    return "";
  }
}

const apiOrigin = validateHttpsOrigin("API_BASE_URL", process.env.API_BASE_URL || "");
const frontendOrigin = validateHttpsOrigin("FRONTEND_BASE_URL", process.env.FRONTEND_BASE_URL || "");
if (apiOrigin && frontendOrigin && apiOrigin !== frontendOrigin) {
  failures.push("API_BASE_URL und FRONTEND_BASE_URL muessen wegen CSP, Cookie- und Gateway-Grenze denselben Origin verwenden.");
  fail("API_BASE_URL und FRONTEND_BASE_URL sind nicht same-origin.");
}

const authMode = process.env.API_AUTH_MODE || "";
if (authMode && !["iap", "oidc"].includes(authMode)) {
  failures.push("API_AUTH_MODE muss fuer ein Zieldeployment signiert ueber iap oder oidc verifiziert werden.");
  fail("API_AUTH_MODE ist ungueltig.");
}

if (authMode === "oidc") {
  for (const name of ["OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL"]) {
    const value = process.env[name]?.trim();
    if (value) ok(`OIDC-Env gesetzt: ${name}`);
    else {
      failures.push(`${name} fehlt fuer API_AUTH_MODE=oidc.`);
      fail(`${name} fehlt fuer API_AUTH_MODE=oidc.`);
    }
  }
  for (const name of ["OIDC_ISSUER", "OIDC_JWKS_URL"]) {
    const value = process.env[name]?.trim();
    if (value && !/^https:\/\//i.test(value)) {
      failures.push(`${name} muss eine HTTPS-URL sein.`);
      fail(`${name} ist keine HTTPS-URL.`);
    }
  }
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
