import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const requiredFiles = [
  "README.md",
  "dokumentation/README.md",
  "dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "dokumentation/betrieb-und-deployment/ADR_001_DEPLOYMENT_TRENNUNG.md",
  "deploy/README.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "dokumentation/architektur/DATA_MODEL.md",
  "deploy/jenkins/Jenkinsfile.gematik",
  "deploy/helm/versorgungs-kompass/Chart.yaml",
  "deploy/helm/versorgungs-kompass/values.yaml",
  "deploy/helm/versorgungs-kompass/values-poc-gematik.yaml",
  "deploy/helm/versorgungs-kompass/values.schema.json",
  "deploy/helm/versorgungs-kompass/templates/deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/service.yaml",
  "deploy/helm/versorgungs-kompass/templates/ingress.yaml",
  "deploy/postgres/poc-gematik/README.md",
  "deploy/postgres/poc-gematik/bind-oidc-identity.sql",
  "dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md",
  "api/Dockerfile",
  "api/server.mjs",
  "scripts/build_static_frontend.sh",
  "scripts/check_deployment_governance.mjs",
  "scripts/test_deployment_separation.mjs",
  "scripts/prepare_local_hospitation.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/deploy-pre-gematik.yml"
];

const requiredText = [
  {
    file: "README.md",
    patterns: [/GitHub Pages/i, /Demo/i, /Datenstand.*geschützten Anwendung/i, /PoC/i],
    reason: "README trennt synthetische Pages-Demo, geschützten Datenstand und gematik-internen PoC."
  },
  {
    file: "dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md",
    patterns: [/Non-Prod/i, /Datenstand.*geschützten Anwendung/i, /OIDC|SSO/i, /PostgreSQL/i, /RC-Tag/i, /parallele Weiterentwicklung/i, /Synchronisation.*nicht/i],
    reason: "PoC-Dokument nennt Zweck, Ressourcen, Release-Trennung und Erfolgskriterien."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
    patterns: [/Jenkins/i, /Kubernetes/i, /Helm/i, /dedizierte.*Datenbank/i],
    reason: "Technische Referenz beschreibt Software Factory, Kubernetes und den PoC-Datenbankpfad."
  },
  {
    file: "deploy/postgres/poc-gematik/README.md",
    patterns: [/PostgreSQL-16/i, /geschützten Snapshot/i, /Allowlist/i, /bind-oidc-identity\.sql/i, /keine automatische Synchronisation/i],
    reason: "PoC-Runbook trennt Schema, geschützte Datenübernahme und OIDC-Zuordnung."
  },
  {
    file: "deploy/postgres/poc-gematik/bind-oidc-identity.sql",
    patterns: [/issuer/i, /subject/i, /profile_id/i, /profile\.active is true/i, /on conflict \(issuer, subject\)/i],
    reason: "OIDC-Binding akzeptiert nur ein vorhandenes aktives Profil und schützt bestehende Zuordnungen."
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
    file: "scripts/prepare_local_hospitation.mjs",
    patterns: [/frontend\/local-hospitation/, /versorgungs-kompass\.local\.html/, /hospitation-local-runtime\.js/],
    reason: "Die private lokale Variante wird in einen ignorierten, separaten Einstieg erzeugt."
  },
  {
    file: "scripts/prepare_target_frontend_config.mjs",
    patterns: [/dataMode/, /apiBaseUrl/, /requireApiGateway/],
    reason: "Ziel-Frontend-Konfiguration kann API-Modus erzwingen."
  },
  {
    file: "scripts/preflight_target_deployment.mjs",
    patterns: [/ARTIFACT_REGISTRY/, /K8S_NAMESPACE/, /API_AUTH_MODE/],
    reason: "Preflight kennt zentrale PoC-/Target-Plattformvariablen."
  },
  {
    file: "api/Dockerfile",
    patterns: [/frontend\/data\/activity-model\.js/, /frontend\/data\/sector-registry\.js/, /USER node/],
    reason: "API-Image enthaelt die Laufzeitabhaengigkeiten des Sektormodells und startet als Non-Root."
  },
  {
    file: "deploy/jenkins/Jenkinsfile.gematik",
    patterns: [/Smoke API image/, /api\/healthz/, /archiveArtifacts[^\n]*dist\/target/, /FRONTEND_BUCKET_URI/, /migrationContractDigest/, /approved-classes-only/],
    reason: "Jenkins prüft den Containerstart, archiviert das PoC-Frontend und weist die Datenrichtlinie ohne Daten-Snapshot nach."
  },
  {
    file: ".github/workflows/target-readiness.yml",
    patterns: [/Build and smoke-test API container/, /api\/healthz/, /values-poc-gematik\.yaml/],
    reason: "Target-Readiness prueft Containerstart und minimales PoC-Overlay."
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
  "scripts/prepare_local_hospitation.mjs",
  "scripts/check_target_readiness.mjs"
];

const failures = [];
const warnings = [];

const forbiddenText = [
  {
    file: "deploy/jenkins/Jenkinsfile.gematik",
    pattern: /seedDigest|seedVersion|bind-test-identity/iu,
    reason: "Der RC-Nachweis darf keinen synthetischen Seed oder Demo-Identity-Vertrag als PoC-Datenstand ausweisen."
  },
  {
    file: "dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md",
    pattern: /PoC[^\n]{0,120}ausschließlich synthetische|ausschließlich synthetische[^\n]{0,120}PoC/iu,
    reason: "Der interne Nutzungspilot darf nicht mehr als Synthetic-only-PoC beschrieben werden."
  }
];

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
    fail(`${check.file}: erwartete PoC-/Target-Hinweise fehlen (${missing.map(String).join(", ")}).`);
  } else {
    ok(check.reason);
  }
}

for (const check of forbiddenText) {
  if (!existsSync(check.file)) continue;
  if (check.pattern.test(readText(check.file))) fail(`${check.file}: ${check.reason}`);
  else ok(`${check.file}: ${check.reason}`);
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
    ok("Die Target-Quelle ist fail-closed auf den API-Gateway-Pfad eingestellt.");
  } else {
    fail("frontend/data/runtime-config.js muss auf API-Modus mit Gateway-Zwang eingestellt sein.");
  }
}

for (const [file, forbidden] of [
  [".github/workflows/deploy-pre-gematik.yml", /sync_github_pages|docs\/data\/supabase-config|\brsync\b[^\n]*\bdocs\b/],
  ["deploy/jenkins/Jenkinsfile.gematik", /sync_github_pages|docs\/data\/supabase-config|\brsync\b[^\n]*\bdocs\b/]
]) {
  if (existsSync(file) && forbidden.test(readText(file))) {
    fail(`${file}: Target-Deployment ist noch an das GitHub-Pages-Artefakt docs/ gekoppelt.`);
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

console.log("\nTarget Readiness Check OK: PoC-Dokumente, RC-Vertrag und technische Target-Anker sind plausibel.");
