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
  "deploy/helm/versorgungs-kompass/values-target-gematik.yaml",
  "deploy/helm/versorgungs-kompass/values.schema.json",
  "deploy/helm/versorgungs-kompass/templates/deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/service.yaml",
  "deploy/helm/versorgungs-kompass/templates/ingress.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-service.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/files/frontend-public.conf",
  "deploy/postgres/poc-gematik/README.md",
  "deploy/postgres/poc-gematik/bind-oidc-identity.sql",
  "dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md",
  "api/Dockerfile",
  "api/server.mjs",
  "scripts/build_static_frontend.sh",
  "frontend/public-entry/index.html",
  "frontend/public-entry/public-entry.css",
  "scripts/generate_frontend_sbom.mjs",
  "scripts/generate_security_evidence.mjs",
  "scripts/package_source_handoff.mjs",
  "scripts/verify_release_tag.mjs",
  "scripts/verify_source_handoff.mjs",
  "scripts/verify_target_release_source.mjs",
  "scripts/test_target_release_source.mjs",
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
    patterns: [/GitHub Pages/i, /Demo/i, /Datenstand[\s\S]{0,240}geschützten Anwendung/i, /PoC/i],
    reason: "README trennt synthetische Pages-Demo, geschützten Datenstand und gematik-internen PoC."
  },
  {
    file: "dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md",
    patterns: [/Non-Prod/i, /Datenstand.*geschützten Anwendung/i, /OIDC|SSO/i, /PostgreSQL/i, /signiert(?:er|en|e)?[\s\S]{0,80}(?:vX\.Y\.Z-Tag|Quelltag)/i, /vX\.Y\.Z/i, /parallele Weiterentwicklung/i, /Synchronisation.*nicht/i, /erst für Deployment[\s\S]{0,120}freigegeben,\s*wenn/i],
    reason: "PoC-Dokument nennt Zweck, Ressourcen, signierten Quelltag, Release-Trennung und Erfolgskriterien."
  },
  {
    file: "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
    patterns: [/Jenkins/i, /Kubernetes/i, /Helm/i, /signierten, annotierten Quelltag/i, /vX\.Y\.Z/i, /dedizierte.*Datenbank/i, /Identity-Gateway-Vertrag/i, /Authorization: Bearer <JWT>/i, /API kann netzseitig nicht.*Umgehung.*Gateways/i],
    reason: "Technische Referenz beschreibt Software Factory, signierte Quellfreigabe, Kubernetes und den Target-Datenbankpfad."
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
    patterns: [/--profile/, /--output/, /pages/, /target/, /public-index\.html/],
    reason: "Der statische Frontend-Build erzwingt getrennte Pages-/Target-Artefakte und bettet das minimale Public-Dokument ein."
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
    reason: "Preflight kennt zentrale Target-Plattformvariablen."
  },
  {
    file: "api/Dockerfile",
    patterns: [/frontend\/data\/activity-model\.js/, /frontend\/data\/sector-registry\.js/, /USER node/],
    reason: "API-Image enthaelt die Laufzeitabhaengigkeiten des Sektormodells und startet als Non-Root."
  },
  {
    file: "deploy/jenkins/Jenkinsfile.gematik",
    patterns: [
      /name:\s*'RELEASE_TAG'[\s\S]*defaultValue:\s*''/,
      /RELEASE_TAG[\s\S]{0,300}\^v\[0-9\][^\n]*\\\.[^\n]*\\\.[^\n]*\$/,
      /TARGET_DEPLOYMENT_APPROVED[\s\S]{0,300}(?:==|=)\s*['"]?true/i,
      /REQUIRE_EXTERNAL_SECURITY_EVIDENCE[\s\S]{0,300}(?:==|=)\s*['"]?true/i,
      /skipDefaultCheckout\(true\)[\s\S]*stage\('Bootstrap trusted main'\)[\s\S]*branches:\s*\[\[name:\s*'\*\/main'\]\][\s\S]*noTags:\s*true[\s\S]*refspec:\s*'\+refs\/heads\/main:refs\/remotes\/origin\/main'/,
      /withCredentials\(\[[\s\S]*?string\([\s\S]{0,220}variable:\s*'SOURCE_REPOSITORY_URL'/,
      /withCredentials\(\[[\s\S]*?file\([\s\S]{0,220}variable:\s*'RELEASE_TAG_GPG_PUBLIC_KEY_FILE'/,
      /withCredentials\(\[[\s\S]*?string\([\s\S]{0,220}variable:\s*'RELEASE_TAG_GPG_FINGERPRINT'/,
      /verify_target_release_source\.mjs/,
      /--expected-repository-url/,
      /--public-key-file/,
      /--fingerprint/,
      /source-tag-verification\.json/,
      /HELM_TARGET_VALUES[\s\S]{0,180}values-target-gematik\.yaml/,
      /npm run check:target-release/,
      /Smoke API image/,
      /API_AUTH_MODE=oidc/,
      /OIDC_ISSUER/,
      /OIDC_AUDIENCE/,
      /OIDC_JWKS_URL/,
      /api\/healthz/,
      /archiveArtifacts[^\n]*dist\/target/,
      /FRONTEND_BUCKET_URI/,
      /migrationContractDigest/,
      /approved-classes-only/,
      /frontend-sbom\.cdx\.json/,
      /security-evidence\.json/
    ],
    reason: "Jenkins bindet die kontrollierte Target-Freigabe an signierte Quelle, externe Trust Anchors, OIDC-Build und vollständige Nachweise."
  },
  {
    file: "scripts/verify_target_release_source.mjs",
    patterns: [/\^v/, /expected-repository-url/, /public-key-file/, /fingerprint/, /remoteTagObjectSha/, /gateRevision/, /tagSignatureVerified:\s*true/, /verify_release_tag\.mjs/],
    reason: "Das Target-Quell-Gate bindet Produkt-Tag, geschützte Quellautorität, Tagobjekt, main-Bootstrap und Signatur."
  },
  {
    file: "scripts/package_source_handoff.mjs",
    patterns: [/complete-git-bundle/, /refs\/heads\/main/, /refs\/tags\/\*/, /source-tag-verification\.json/, /singleWriterRequired:\s*true/, /bidirectionalSyncAllowed:\s*false/],
    reason: "Die GitLab-Übergabe enthält vollständige Git-Objekte und einen Ein-Schreiber-Vertrag."
  },
  {
    file: "scripts/verify_source_handoff.mjs",
    patterns: [/bundle", "verify"/, /fsck", "--strict", "--full"/, /tagSignatureVerified/, /verify_release_tag\.mjs/, /out-of-band-required/],
    reason: "Die empfangende Seite prüft Bundle, Ref-Inventar, externen Trust Anchor und signiertes Tag erneut."
  },
  {
    file: "scripts/generate_security_evidence.mjs",
    patterns: [/versorgungs-kompass-security-evidence\/v2/, /releaseTag/, /tagObjectSha/, /signerFingerprint/, /tagSignatureVerified/, /source-tag-signature/],
    reason: "Security-Evidenz v2 bindet den signierten Produkt-Tag und seine Quellidentität."
  },
  {
    file: ".github/workflows/target-readiness.yml",
    patterns: [
      /Build internal OIDC target without GCP portal/,
      /test ! -d frontend\/identity-portal\/node_modules/,
      /npm run build:target/,
      /test ! -e dist\/target\/public\/auth/,
      /Build and smoke-test API container/,
      /API_AUTH_MODE=oidc/,
      /OIDC_ISSUER=https:\/\/identity\.example\.invalid\/issuer/,
      /OIDC_AUDIENCE=versorgungs-kompass/,
      /OIDC_JWKS_URL=https:\/\/identity\.example\.invalid\/\.well-known\/jwks\.json/,
      /api\/healthz/,
      /npm run check:target-release/,
      /values-target-gematik\.yaml/
    ],
    reason: "Target-Readiness prueft den portalunabhaengigen OIDC-Build, Containerstart und das Target-Overlay."
  },
  {
    file: ".github/workflows/deploy-pre-gematik.yml",
    patterns: [/dist\/target/, /environment:[\s\S]*name:\s*pre-gematik/, /public_frontend_backend_service/, /gcloud compute url-maps describe/, /data-public-entry="home"/],
    reason: "Die Pre-Integration deployt ein eigenes Target-Artefakt und prueft die getrennte Public-/IAP-Grenze aus einem geschuetzten Environment."
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
  "scripts/package_source_handoff.mjs",
  "scripts/verify_source_handoff.mjs",
  "scripts/verify_target_release_source.mjs",
  "scripts/test_target_release_source.mjs",
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
    reason: "Der Target-Nachweis darf keinen synthetischen Seed oder Demo-Identity-Vertrag als Ziel-Datenstand ausweisen."
  },
  {
    file: "deploy/jenkins/Jenkinsfile.gematik",
    pattern: /poc-v|RC_TAG|--rc-tag|values-poc-gematik|HELM_POC_VALUES/iu,
    reason: "Der aktive Target-Pfad darf keine Legacy-Tag-Autorisierung oder das historische RC-Overlay verwenden."
  },
  {
    file: "deploy/jenkins/Jenkinsfile.gematik",
    pattern: /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|git\s+tag\s+--sign|git\s+fetch[^\n]*(?:--force[^\n]*--tags|--tags[^\n]*--force)/iu,
    reason: "Die Target-Pipeline darf weder private Signierschlüssel erhalten, Tags erzeugen noch Remote-Tags erzwungen übernehmen."
  },
  {
    file: ".github/workflows/target-readiness.yml",
    pattern: /check:poc-rc|values-poc-gematik\.yaml|poc-v/iu,
    reason: "Der operative Readiness-Check muss ausschließlich den neuen Target-Vertrag verwenden."
  },
  {
    file: "scripts/generate_security_evidence.mjs",
    pattern: /\brcTag\b|--rc-tag|poc-v/iu,
    reason: "Security-Evidenz v2 darf keine Legacy-Tagfelder akzeptieren."
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
    fail(`${check.file}: erwartete Target-Hinweise fehlen (${missing.map(String).join(", ")}).`);
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

console.log("\nTarget Readiness Check OK: signierter Quellvertrag, Übergabe und technische Target-Anker sind plausibel.");
