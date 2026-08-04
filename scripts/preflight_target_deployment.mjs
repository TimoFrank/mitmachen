import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { formatTechnicalTag, loadReleaseConfig } from "./lib/release_policy.mjs";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const requiredFiles = [
  "api/Dockerfile",
  "deploy/jenkins/Jenkinsfile.gematik",
  "deploy/helm/versorgungs-kompass/Chart.yaml",
  "deploy/helm/versorgungs-kompass/values.yaml",
  "deploy/helm/versorgungs-kompass/values-target-gematik.yaml",
  "deploy/postgres/poc-gematik/README.md",
  "deploy/postgres/poc-gematik/bind-oidc-identity.sql",
  "dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md",
  "deploy/README.md",
  "dokumentation/architektur/API_CONTRACT.md",
  "api/server.mjs",
  "scripts/build_static_frontend.sh",
  "scripts/check_deployment_governance.mjs",
  "scripts/test_deployment_separation.mjs",
  "scripts/verify_release_tag.mjs",
  "scripts/verify_target_release_source.mjs"
];

const requiredCommands = ["docker", "npm", "git", "helm", "kubectl", "curl"];
const optionalCommands = ["trivy"];
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
  "DATA_POLICY",
  "RELEASE_TAG",
  "RELEASE_TAG_OBJECT_SHA",
  "RELEASE_TAG_SIGNER_FINGERPRINT",
  "SOURCE_REVISION",
  "SOURCE_REPOSITORY",
  "BUILD_TAG",
  "EXTERNAL_SECURITY_EVIDENCE_ROOT",
  "REQUIRE_EXTERNAL_SECURITY_EVIDENCE",
  "TARGET_DEPLOYMENT_APPROVED",
  "TARGET_API_ALLOWED_CIDRS_JSON"
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

if (process.env.FRONTEND_BUCKET_URI) {
  if (commandExists("gcloud")) ok("Tool fuer konfiguriertes Frontend-Staging vorhanden: gcloud");
  else {
    failures.push("FRONTEND_BUCKET_URI ist gesetzt, aber gcloud fehlt oder ist nicht im PATH.");
    fail("gcloud fehlt fuer das konfigurierte Frontend-Staging.");
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
    failures.push(`Env fehlt: ${name}`);
    fail(`Env fehlt: ${name}`);
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
const dataPolicy = process.env.DATA_POLICY || "";
if (dataPolicy !== "approved-classes-only") {
  failures.push("DATA_POLICY muss für den internen Nutzungspiloten approved-classes-only sein.");
  fail("DATA_POLICY ist ungültig.");
}

if (authMode !== "oidc") {
  failures.push("Der gematik-Target-Pfad muss API_AUTH_MODE=oidc verwenden.");
  fail("API_AUTH_MODE ist nicht oidc.");
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

try {
  const cidrs = JSON.parse(process.env.TARGET_API_ALLOWED_CIDRS_JSON || "");
  if (!Array.isArray(cidrs) || cidrs.length < 1 || cidrs.length > 32 || new Set(cidrs).size !== cidrs.length) {
    throw new Error("invalid cidr inventory");
  }
  for (const cidr of cidrs) {
    const parts = typeof cidr === "string" ? cidr.split("/") : [];
    const family = parts.length === 2 ? net.isIP(parts[0]) : 0;
    const prefix = Number(parts[1]);
    if (
      !family
      || !/^\d{1,3}$/u.test(parts[1] || "")
      || prefix < 0
      || prefix > (family === 4 ? 32 : 128)
      || cidr === "0.0.0.0/0"
      || cidr === "::/0"
      || /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/u.test(parts[0])
      || /^2001:db8:/iu.test(parts[0])
    ) {
      throw new Error("invalid cidr");
    }
  }
  ok("Geschuetzte Gateway-CIDRs sind geschlossen und frei von Platzhaltern.");
} catch {
  failures.push("TARGET_API_ALLOWED_CIDRS_JSON muss 1 bis 32 eindeutige, zielgeeignete CIDRs enthalten.");
  fail("TARGET_API_ALLOWED_CIDRS_JSON ist ungueltig.");
}

const releaseConfig = loadReleaseConfig();
const releaseTag = process.env.RELEASE_TAG || "";
if (releaseTag && releaseTag !== formatTechnicalTag(releaseConfig.productVersion)) {
  failures.push("RELEASE_TAG muss exakt zur zentralen Produktversion passen.");
  fail("RELEASE_TAG und productVersion stimmen nicht ueberein.");
}

for (const [name, pattern] of [
  ["RELEASE_TAG_OBJECT_SHA", /^[0-9a-f]{40}$/u],
  ["SOURCE_REVISION", /^[0-9a-f]{40}$/u],
  ["RELEASE_TAG_SIGNER_FINGERPRINT", /^[0-9A-F]{40,64}$/u]
]) {
  const value = process.env[name] || "";
  if (value && !pattern.test(value)) {
    failures.push(`${name} besitzt kein gueltiges, vollstaendiges Format.`);
    fail(`${name} ist ungueltig.`);
  }
}

if (process.env.REQUIRE_EXTERNAL_SECURITY_EVIDENCE !== "true") {
  failures.push("REQUIRE_EXTERNAL_SECURITY_EVIDENCE muss fuer den Target-Pfad true sein.");
  fail("Zentrale Security-Evidenz ist nicht verpflichtend aktiviert.");
}
if (process.env.TARGET_DEPLOYMENT_APPROVED !== "true") {
  failures.push("TARGET_DEPLOYMENT_APPROVED muss vor Push und Deployment true sein.");
  fail("Die ausdrueckliche Target-Freigabe fehlt.");
}

const externalEvidenceRoot = process.env.EXTERNAL_SECURITY_EVIDENCE_ROOT || "";
if (!path.isAbsolute(externalEvidenceRoot)) {
  failures.push("EXTERNAL_SECURITY_EVIDENCE_ROOT muss ein absoluter, geschuetzter Node-Pfad sein.");
  fail("EXTERNAL_SECURITY_EVIDENCE_ROOT ist nicht absolut.");
} else {
  try {
    const rootStats = fs.lstatSync(externalEvidenceRoot);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error("invalid root");
    fs.accessSync(externalEvidenceRoot, fs.constants.R_OK);
    let rootIsWritable = true;
    try {
      fs.accessSync(externalEvidenceRoot, fs.constants.W_OK);
    } catch {
      rootIsWritable = false;
    }
    if (rootIsWritable) throw new Error("writable root");
    const canonicalRoot = fs.realpathSync(externalEvidenceRoot);

    const buildTag = process.env.BUILD_TAG || "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u.test(buildTag)) {
      throw new Error("unsafe build tag");
    }
    const buildEvidenceDir = path.join(canonicalRoot, buildTag);
    const buildStats = fs.lstatSync(buildEvidenceDir);
    if (buildStats.isSymbolicLink() || !buildStats.isDirectory()) throw new Error("invalid build dir");
    if (fs.realpathSync(buildEvidenceDir) !== buildEvidenceDir) throw new Error("indirect build dir");
    fs.accessSync(buildEvidenceDir, fs.constants.R_OK);
    let buildDirIsWritable = true;
    try {
      fs.accessSync(buildEvidenceDir, fs.constants.W_OK);
    } catch {
      buildDirIsWritable = false;
    }
    if (buildDirIsWritable) throw new Error("writable build dir");
    ok("Externer build-spezifischer Evidence-Pfad ist lesbar, nicht schreibbar und ohne Symlink.");
  } catch {
    failures.push("EXTERNAL_SECURITY_EVIDENCE_ROOT/<BUILD_TAG> muss fuer Jenkins lesbar, nicht schreibbar und ohne Symlink sein.");
    fail("EXTERNAL_SECURITY_EVIDENCE_ROOT verletzt den geschuetzten Importvertrag.");
  }
}

const sourceRepositoryValue = process.env.SOURCE_REPOSITORY || "";
if (sourceRepositoryValue) {
  try {
    if (normalizeRepositoryUrl(sourceRepositoryValue) !== sourceRepositoryValue) {
      throw new Error("not canonical");
    }
    ok("SOURCE_REPOSITORY ist eine kanonische HTTPS-Quellkennung.");
  } catch {
    failures.push("SOURCE_REPOSITORY muss eine kanonische HTTPS-Repository-URL ohne Zugangsdaten sein.");
    fail("SOURCE_REPOSITORY ist ungueltig.");
  }
}

const sourceVerificationPath = "dist/security-evidence/source-tag-verification.json";
if (fs.existsSync(sourceVerificationPath)) {
  try {
    const verification = JSON.parse(fs.readFileSync(sourceVerificationPath, "utf8"));
    const expectedKeys = [
      "schemaVersion",
      "sourceRepository",
      "gateRevision",
      "releaseTag",
      "productVersion",
      "tagObjectSha",
      "sourceRevision",
      "signerFingerprint",
      "tagSignatureVerified",
      "remote",
      "mainRef",
      "verified"
    ].sort();
    if (
      JSON.stringify(Object.keys(verification).sort()) !== JSON.stringify(expectedKeys)
      || verification.schemaVersion !== "versorgungs-kompass-target-source/v1"
      || !/^[0-9a-f]{40}$/u.test(verification.gateRevision || "")
      || verification.releaseTag !== releaseTag
      || verification.productVersion !== releaseConfig.productVersion
      || verification.tagObjectSha !== process.env.RELEASE_TAG_OBJECT_SHA
      || verification.sourceRevision !== process.env.SOURCE_REVISION
      || verification.signerFingerprint !== process.env.RELEASE_TAG_SIGNER_FINGERPRINT
      || verification.sourceRepository !== sourceRepositoryValue
      || verification.tagSignatureVerified !== true
      || verification.remote !== "origin"
      || verification.mainRef !== "refs/remotes/origin/main"
      || verification.verified !== true
    ) {
      throw new Error("binding mismatch");
    }
    const checkedOutRevision = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      encoding: "utf8"
    }).trim();
    if (checkedOutRevision !== verification.sourceRevision) throw new Error("checkout mismatch");
    ok("Signierter Release-Tag, Tagobjekt, Commit und Checkout sind vollstaendig gebunden.");
  } catch {
    failures.push("source-tag-verification.json ist ungueltig oder gehoert nicht zum aktuellen Target-Checkout.");
    fail("Der signierte Target-Quellnachweis ist widerspruechlich.");
  }
} else {
  failures.push(`${sourceVerificationPath} fehlt.`);
  fail("Der signierte Target-Quellnachweis fehlt.");
}

const targetValues = fs.readFileSync("deploy/helm/versorgungs-kompass/values-target-gematik.yaml", "utf8");
if (!/apiAuthMode:\s*["']?oidc["']?/u.test(targetValues)
    || !/tag:\s*REPLACE_WITH_IMMUTABLE_IMAGE_TAG/u.test(targetValues)
    || /poc-v\d/u.test(targetValues)) {
  failures.push("Das Target-Overlay muss OIDC und einen fail-closed Image-Platzhalter ohne Legacy-Tag verwenden.");
  fail("Das Target-Overlay verletzt den operativen Target-Vertrag.");
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
