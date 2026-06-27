import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const requiredFiles = [
  "README.md",
  "dokumentation/README.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md",
  "dokumentation/betrieb-und-deployment/BETRIEB.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "dokumentation/architektur/DATA_MODEL.md",
  "dokumentation/betrieb-und-deployment/artefakte/Jenkinsfile.gematik",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/Chart.yaml",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/values.yaml",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/templates/deployment.yaml",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/templates/service.yaml",
  "dokumentation/betrieb-und-deployment/artefakte/helm/versorgungs-kompass/templates/ingress.yaml",
  "api/Dockerfile",
  "api/server.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs"
];

const requiredText = [
  {
    file: "README.md",
    patterns: [/GitHub Pages/i, /gesch.tzten Backend/i, /gematik-Deployment/i],
    reason: "README trennt aktuelle Testveroeffentlichung und Zielbetrieb."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md",
    patterns: [/GitHub Pages/i, /Cloud Run ist nicht mehr Zielarchitektur/i, /Kubernetes/i],
    reason: "Deployment-Uebersicht ordnet aktuelle und archivierte Pfade ein."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
    patterns: [/Jenkins/i, /Kubernetes/i, /Helm/i, /Shared Postgres/i],
    reason: "gematik-Zieldokument beschreibt Software-Factory und Kubernetes-Pfad."
  },
  {
    file: "dokumentation/architektur/API_CONTRACT.md",
    patterns: [/trusted-header|sso/i, /requireApiGateway/i, /apiBaseUrl/i],
    reason: "API-Vertrag beschreibt Ziel-Auth und Gateway-Grenze."
  },
  {
    file: "scripts/prepare_target_frontend_config.mjs",
    patterns: [/dataMode/, /apiBaseUrl/, /requireApiGateway/],
    reason: "Ziel-Frontend-Konfiguration kann API-Modus erzwingen."
  },
  {
    file: "scripts/preflight_target_deployment.mjs",
    patterns: [/ARTIFACT_REGISTRY/, /K8S_NAMESPACE/, /API_AUTH_MODE/],
    reason: "Preflight kennt zentrale Zielbetriebsvariablen."
  }
];

const syntaxFiles = [
  "api/server.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  "scripts/check_target_readiness.mjs"
];

const failures = [];
const warnings = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`WARN ${message}`);
}

function fail(message) {
  failures.push(message);
  console.log(`FAIL ${message}`);
}

function readText(file) {
  return readFileSync(file, "utf8");
}

for (const file of requiredFiles) {
  if (existsSync(file)) ok(`Vorhanden: ${file}`);
  else fail(`Fehlt: ${file}`);
}

for (const check of requiredText) {
  if (!existsSync(check.file)) continue;
  const source = readText(check.file);
  const missing = check.patterns.filter((pattern) => !pattern.test(source));
  if (missing.length) {
    fail(`${check.file}: erwartete Zielbetriebs-Hinweise fehlen (${missing.map(String).join(", ")}).`);
  } else {
    ok(check.reason);
  }
}

for (const file of syntaxFiles) {
  if (!existsSync(file)) continue;
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "ignore" });
    ok(`Syntax OK: ${file}`);
  } catch {
    fail(`Syntaxfehler: ${file}`);
  }
}

if (existsSync("dokumentation/betrieb-und-deployment/archiv/gcp-prototypen")) {
  ok("GCP-Prototypen liegen im Archiv.");
} else {
  warn("Archivordner fuer fruehere GCP-Prototypen nicht gefunden.");
}

if (existsSync("docs/data/supabase-config.js")) {
  const currentConfig = readText("docs/data/supabase-config.js");
  if (/dataMode:\s*"supabase"/.test(currentConfig)) {
    ok("GitHub-Pages-Artefakt bleibt als aktueller Supabase-Testbetrieb erkennbar.");
  } else {
    warn("docs/data/supabase-config.js zeigt nicht klar auf den aktuellen Supabase-Testbetrieb.");
  }
}

if (warnings.length) {
  console.log("\nHinweise:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.log("\nTarget Readiness Check FAILED:");
  failures.forEach((message) => console.log(`- ${message}`));
  process.exit(1);
}

console.log("\nTarget Readiness Check OK: Zielbetriebs-Dokumente und Migrationsanker sind plausibel.");
