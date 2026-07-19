import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const requiredFiles = [
  "README.md",
  "dokumentation/README.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_CHECKLIST.md",
  "dokumentation/betrieb-und-deployment/BETRIEB.md",
  "dokumentation/betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md",
  "dokumentation/betrieb-und-deployment/BETRIEBSVERANTWORTUNG_RACI.md",
  "dokumentation/betrieb-und-deployment/MIGRATION_CUTOVER_ROLLBACK.md",
  "dokumentation/betrieb-und-deployment/ADR_001_DEPLOYMENT_TRENNUNG.md",
  "dokumentation/betrieb-und-deployment/ABNAHMEPROTOKOLL_TEMPLATE.md",
  "deploy/README.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "dokumentation/architektur/DATA_MODEL.md",
  "deploy/jenkins/Jenkinsfile.gematik",
  "deploy/helm/versorgungs-kompass/Chart.yaml",
  "deploy/helm/versorgungs-kompass/values.yaml",
  "deploy/helm/versorgungs-kompass/values.schema.json",
  "deploy/helm/versorgungs-kompass/templates/deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/service.yaml",
  "deploy/helm/versorgungs-kompass/templates/ingress.yaml",
  "api/Dockerfile",
  "api/server.mjs",
  "scripts/build_static_frontend.sh",
  "scripts/check_deployment_governance.mjs",
  "scripts/test_deployment_separation.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/deploy-pre-gematik.yml"
];

const requiredText = [
  {
    file: "README.md",
    patterns: [/GitHub Pages/i, /Legacy|Demo/i, /Zielbetrieb/i],
    reason: "README trennt synthetische Pages-Demo und geschuetzten Zielbetrieb."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md",
    patterns: [/GitHub Pages/i, /dist\/pages/i, /dist\/target/i, /Kubernetes/i],
    reason: "Deployment-Uebersicht ordnet aktuelle und archivierte Pfade ein."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
    patterns: [/Jenkins/i, /Kubernetes/i, /Helm/i, /Shared Postgres/i],
    reason: "gematik-Zieldokument beschreibt Software-Factory und Kubernetes-Pfad."
  },
  {
    file: "dokumentation/architektur/API_CONTRACT.md",
    patterns: [/oidc|iap/i, /requireApiGateway/i, /apiBaseUrl/i],
    reason: "API-Vertrag beschreibt Ziel-Auth und Gateway-Grenze."
  },
  {
    file: "scripts/build_static_frontend.sh",
    patterns: [/--profile/, /--output/, /pages/, /target/],
    reason: "Der statische Frontend-Build erzwingt getrennte Pages- und Target-Artefakte."
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
  },
  {
    file: ".github/workflows/deploy-pre-gematik.yml",
    patterns: [/dist\/target/, /environment:[\s\S]*name:\s*pre-gematik/],
    reason: "Die Pre-Integration deployt ein eigenes Target-Artefakt aus einem geschuetzten Environment."
  },
  {
    file: ".github/workflows/deploy-pages.yml",
    patterns: [/dist\/pages/, /environment:[\s\S]*name:\s*github-pages/],
    reason: "GitHub Pages besitzt einen eigenen Artefakt- und Environment-Pfad."
  }
];

const syntaxFiles = [
  "api/server.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  "scripts/check_deployment_governance.mjs",
  "scripts/test_deployment_separation.mjs",
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
  fail("Veraltete GCP-Prototypen mit persoenlichen Infrastrukturwerten duerfen nicht im oeffentlichen Repository liegen.");
} else {
  ok("Veraltete GCP-Prototypen sind aus dem oeffentlichen Repository entfernt.");
}

if (existsSync("frontend/data/runtime-config.js")) {
  const currentConfig = readText("frontend/data/runtime-config.js");
  if (/dataMode:\s*"api"/.test(currentConfig) && /requireApiGateway:\s*true/.test(currentConfig)) {
    ok("Die Realanwendungsquelle ist fail-closed auf den API-Gateway-Pfad eingestellt.");
  } else {
    fail("frontend/data/runtime-config.js muss auf API-Modus mit Gateway-Zwang eingestellt sein.");
  }
}

for (const [file, forbidden] of [
  [".github/workflows/deploy-pre-gematik.yml", /sync_github_pages|docs\/data\/supabase-config|\brsync\b[^\n]*\bdocs\b/],
  ["deploy/jenkins/Jenkinsfile.gematik", /sync_github_pages|docs\/data\/supabase-config|\brsync\b[^\n]*\bdocs\b/]
]) {
  if (existsSync(file) && forbidden.test(readText(file))) {
    fail(`${file}: Zieldeployment ist noch an das GitHub-Pages-Artefakt docs/ gekoppelt.`);
  } else if (existsSync(file)) {
    ok(`${file}: kein Zieldeployment aus docs/.`);
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
