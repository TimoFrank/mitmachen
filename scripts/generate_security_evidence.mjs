import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertNewTechnicalTag,
  formatTechnicalTag,
  loadReleaseConfig,
  parseProductVersion,
  releaseTitle
} from "./lib/release_policy.mjs";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseTagVerifier = path.join(root, "scripts/verify_release_tag.mjs");
const FINGERPRINT_PATTERN = /^[0-9A-F]{40,64}$/u;
const externalGateFiles = new Map([
  ["sonarqube", "sonarqube-gate.json"],
  ["snyk", "snyk-gate.json"],
  ["dependency-track", "dependency-track-gate.json"],
  ["cosign", "cosign-attestation.json"]
]);

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Ungültiges JSON in ${file}: ${error.message}`);
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} muss ein Objekt sein.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${label} verletzt den geschlossenen Nachweisvertrag.`);
  }
}

function sha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function requiredFile(reportDir, name) {
  const file = path.join(reportDir, name);
  if (!existsSync(file)) fail(`Pflichtnachweis fehlt: ${name}`);
  return file;
}

function reportReference(reportDir, name) {
  const file = requiredFile(reportDir, name);
  return { path: name, sha256: sha256(file) };
}

function hardenedGitEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (/^(?:GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)|GIT_(?:DIR|WORK_TREE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|REPLACE_REF_BASE))$/u.test(key)) {
      delete env[key];
    }
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0"
  };
}

function git(sourceRoot, args) {
  const result = spawnSync("git", ["--no-replace-objects", "-C", sourceRoot, ...args], {
    encoding: "utf8",
    env: hardenedGitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) fail(`Git-Trust-Prüfung fehlgeschlagen: ${args[0] || "git"}.`);
  return String(result.stdout || "").trim();
}

function assertReleaseTitle(releaseConfig, actualTitle) {
  const version = releaseConfig.productVersion;
  const { patch } = parseProductVersion(version);
  if (patch > 0) {
    const expected = releaseTitle(version, "hotfix", { policy: releaseConfig.policy });
    if (actualTitle !== expected) fail("Die signierte Tag-Annotation verletzt den Hotfix-Titelvertrag.");
    return actualTitle;
  }
  const marker = "__VK_RELEASE_THEME__";
  const template = releaseTitle(version, "weekly", { theme: marker, policy: releaseConfig.policy });
  if (!template.includes(marker)) {
    if (actualTitle !== template) fail("Die signierte Tag-Annotation verletzt den RC-Titelvertrag.");
    return actualTitle;
  }
  const [prefix, suffix] = template.split(marker);
  const theme = actualTitle.startsWith(prefix) && actualTitle.endsWith(suffix)
    ? actualTitle.slice(prefix.length, actualTitle.length - suffix.length).trim()
    : "";
  if (!theme) fail("Die signierte Tag-Annotation verletzt den Leitthemenvertrag.");
  return actualTitle;
}

function assertRegularTrustAnchor(file) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    fail("Der extern bestätigte Release-Trust-Anchor fehlt.");
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > 1024 * 1024) {
    fail("Der extern bestätigte Release-Trust-Anchor ist keine zulässige reguläre Datei.");
  }
}

function reverifySourceTag({
  sourceRoot,
  sourceVerification,
  releaseConfig,
  expectedRepositoryUrl,
  expectedSignerFingerprint,
  publicKeyFile
}) {
  const normalizedRepository = normalizeRepositoryUrl(expectedRepositoryUrl);
  const normalizedFingerprint = String(expectedSignerFingerprint || "").replaceAll(/\s+/gu, "").toUpperCase();
  if (!FINGERPRINT_PATTERN.test(normalizedFingerprint)) fail("Der geschützte Signer-Fingerprint ist ungültig.");
  if (normalizeRepositoryUrl(sourceVerification.sourceRepository) !== normalizedRepository) {
    fail("Der Tag-Nachweis gehört nicht zur geschützten Repository-Autorität.");
  }
  if (sourceVerification.signerFingerprint !== normalizedFingerprint) {
    fail("Der Tag-Nachweis gehört nicht zum geschützten Signing-Subkey.");
  }
  assertRegularTrustAnchor(publicKeyFile);

  if (git(sourceRoot, ["status", "--porcelain", "--untracked-files=all"])) {
    fail("Der Security-Checkout ist nicht sauber und entspricht daher nicht beweisbar dem signierten Quellstand.");
  }
  if (git(sourceRoot, ["for-each-ref", "--format=%(refname)", "refs/replace"])) {
    fail("Der Security-Checkout enthält unerlaubte Replacement-Refs.");
  }
  for (const relativePath of ["info/grafts", "objects/info/alternates", "objects/info/http-alternates"]) {
    const candidate = path.resolve(sourceRoot, git(sourceRoot, ["rev-parse", "--git-path", relativePath]));
    if (existsSync(candidate)) fail(`Der Security-Checkout enthält eine Git-Objektumleitung (${relativePath}).`);
  }
  if (git(sourceRoot, ["rev-parse", "HEAD^{commit}"]) !== sourceVerification.sourceRevision) {
    fail("Der Security-Checkout entspricht nicht dem signierten Quellcommit.");
  }
  const remoteUrls = git(sourceRoot, [
    "config", "--get-all", `remote.${sourceVerification.remote}.url`
  ]).split("\n").map((value) => value.trim()).filter(Boolean);
  if (
    remoteUrls.length !== 1
    || normalizeRepositoryUrl(remoteUrls[0]) !== normalizedRepository
  ) {
    fail("Der Security-Checkout gehört nicht zur geschützten Repository-Autorität.");
  }
  const mainRevision = git(sourceRoot, [
    "rev-parse", `${sourceVerification.mainRef}^{commit}`
  ]);
  if (mainRevision !== sourceVerification.gateRevision) {
    fail("Der lokale geschützte main-Nachweis widerspricht der Quell-Gate-Revision.");
  }
  git(sourceRoot, [
    "merge-base", "--is-ancestor", sourceVerification.sourceRevision, sourceVerification.mainRef
  ]);
  const actualTitle = assertReleaseTitle(
    releaseConfig,
    git(sourceRoot, ["for-each-ref", "--format=%(contents:subject)", `refs/tags/${sourceVerification.releaseTag}`])
  );

  const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
  const gnupgHome = mkdtempSync(path.join(shortTempRoot, "vk-security-source-gnupg-"));
  try {
    const importResult = spawnSync("gpg", ["--batch", "--import", publicKeyFile], {
      encoding: "utf8",
      env: { ...process.env, GNUPGHOME: gnupgHome },
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (importResult.status !== 0) fail("Der externe Release-Trust-Anchor konnte nicht importiert werden.");
    const secretResult = spawnSync("gpg", ["--batch", "--with-colons", "--list-secret-keys"], {
      encoding: "utf8",
      env: { ...process.env, GNUPGHOME: gnupgHome },
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (secretResult.status !== 0 || /^(?:sec|ssb):/mu.test(String(secretResult.stdout || ""))) {
      fail("Der Release-Trust-Anchor darf kein privates Schlüsselmaterial enthalten.");
    }
    const verifierResult = spawnSync(process.execPath, [
      releaseTagVerifier,
      "--tag", sourceVerification.releaseTag,
      "--commit-sha", sourceVerification.sourceRevision,
      "--fingerprint", normalizedFingerprint,
      "--expected-title", actualTitle,
      "--remote-tag-object-sha", sourceVerification.tagObjectSha
    ], {
      cwd: sourceRoot,
      encoding: "utf8",
      env: hardenedGitEnvironment({ GNUPGHOME: gnupgHome }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (verifierResult.status !== 0) fail("Der signierte Quelltag konnte für den Security-Nachweis nicht erneut verifiziert werden.");
  } finally {
    rmSync(gnupgHome, { recursive: true, force: true });
  }
}

function vulnerabilityCounts(results) {
  const findings = results.flatMap((result) => result.Vulnerabilities || []);
  return {
    total: findings.length,
    high: findings.filter((finding) => finding.Severity === "HIGH").length,
    critical: findings.filter((finding) => finding.Severity === "CRITICAL").length
  };
}

function misconfigurationCounts(results) {
  const findings = results.flatMap((result) => result.Misconfigurations || []);
  return {
    total: findings.length,
    high: findings.filter((finding) => finding.Severity === "HIGH").length,
    critical: findings.filter((finding) => finding.Severity === "CRITICAL").length
  };
}

function validateTrivyReport(report, label, artifactType, requiredResults) {
  if (report.SchemaVersion !== 2 ||
      report.ArtifactType !== artifactType ||
      !Array.isArray(report.Results) ||
      report.Results.length === 0) {
    fail(`${label} besitzt nicht das erwartete Trivy-Format.`);
  }
  for (const result of report.Results) {
    if (!String(result.Target || "").trim() ||
        !String(result.Class || "").trim() ||
        !String(result.Type || "").trim()) {
      fail(`${label} besitzt einen unvollständigen Trivy-Ergebnisblock.`);
    }
  }
  for (const requiredResult of requiredResults) {
    if (!report.Results.some((result) =>
      result.Class === requiredResult.class && result.Type === requiredResult.type
    )) {
      fail(`${label} hat ${requiredResult.label} nicht geprüft.`);
    }
  }
}

function validateCycloneDx(file, label) {
  const bom = readJson(file);
  if (bom.bomFormat !== "CycloneDX" || !/^1\.[4-9]$/u.test(bom.specVersion || "")) {
    fail(`${label} ist keine unterstützte CycloneDX-SBOM.`);
  }
  if (!Array.isArray(bom.components) || bom.components.length === 0) {
    fail(`${label} besitzt keine Komponenten.`);
  }
  if (bom.components.some((component) =>
    !String(component.type || "").trim() ||
    !String(component.name || "").trim() ||
    !String(component.version || "").trim()
  )) {
    fail(`${label} besitzt unvollständige Komponenten.`);
  }
  return bom;
}

function propertyValue(component, name) {
  return component?.properties?.find((property) => property.name === name)?.value || "";
}

function validateExternalGates(reportDir, required, subject) {
  const results = [];
  for (const [tool, filename] of externalGateFiles) {
    const file = path.join(reportDir, filename);
    if (!existsSync(file)) {
      if (required) fail(`Zentrales Software-Factory-Gate fehlt: ${tool}`);
      results.push({ id: tool, status: "not-run" });
      continue;
    }
    const report = readJson(file);
    if (report.tool !== tool) fail(`${filename} weist nicht das erwartete Gate ${tool} nach.`);
    if (report.status !== "passed") fail(`${tool} ist nicht erfolgreich: ${report.status || "ohne Status"}`);
    if (!String(report.analysisId || "").trim()) fail(`${tool} besitzt keine analysisId.`);
    if (!String(report.policyId || "").trim()) fail(`${tool} besitzt keine policyId.`);
    if (report.sourceRevision !== subject.sourceRevision) {
      fail(`${tool} gehört nicht zum geprüften Git-Commit.`);
    }
    const evaluatedAt = String(report.evaluatedAt || "");
    if (Number.isNaN(Date.parse(evaluatedAt))) fail(`${tool} besitzt keinen gültigen Prüfzeitpunkt.`);
    if (tool === "dependency-track") {
      const actualDigests = new Set(report.sbomDigests || []);
      for (const expectedDigest of subject.sbomDigests) {
        if (!actualDigests.has(expectedDigest)) {
          fail(`Dependency-Track gehört nicht zu beiden geprüften SBOMs.`);
        }
      }
    }
    if (tool === "cosign" && report.subject !== subject.apiImage) {
      fail("Cosign gehört nicht zum geprüften API-Image.");
    }
    results.push({
      id: tool,
      status: "reported-passed",
      analysisId: String(report.analysisId),
      policyId: String(report.policyId),
      evaluatedAt,
      report: { path: filename, sha256: sha256(file) }
    });
  }
  return results;
}

export function generateSecurityEvidence({
  reportDir,
  output,
  releaseTag,
  sourceRevision,
  apiImage,
  apiImageLocalDigest,
  apiImageConfigDigest,
  frontendManifest,
  buildUrl = "",
  observedAt = new Date().toISOString(),
  requireExternalGates = false,
  sourceRoot = root,
  expectedRepositoryUrl,
  expectedSignerFingerprint,
  publicKeyFile
}) {
  const releaseConfig = loadReleaseConfig(sourceRoot);
  const { productVersion } = releaseConfig;
  assertNewTechnicalTag(releaseTag, { policy: releaseConfig.policy });
  if (releaseTag !== formatTechnicalTag(productVersion)) {
    fail("Release-Tag und zentrale Produktversion stimmen nicht überein.");
  }
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) fail("Ungültiger Git-Commit.");
  if (!/@sha256:[0-9a-f]{64}$/u.test(apiImage)) fail("Das API-Image muss über einen unveränderlichen Digest referenziert werden.");
  if (!/^sha256:[0-9a-f]{64}$/u.test(apiImageLocalDigest)) {
    fail("Ungültiger lokaler API-Image-Digest.");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(apiImageConfigDigest)) {
    fail("Ungültiger API-Image-Config-Digest.");
  }
  if (Number.isNaN(Date.parse(observedAt))) fail("Ungültiger Prüfzeitpunkt.");
  if (buildUrl) {
    const parsedBuildUrl = new URL(buildUrl);
    if (!["http:", "https:"].includes(parsedBuildUrl.protocol) ||
        parsedBuildUrl.username ||
        parsedBuildUrl.password ||
        parsedBuildUrl.hash) {
      fail("Die Build-URL muss HTTP(S) verwenden und darf keine Zugangsdaten oder Fragmente enthalten.");
    }
  }

  const sourceVerificationFile = requiredFile(reportDir, "source-tag-verification.json");
  const sourceVerification = readJson(sourceVerificationFile);
  assertExactKeys(sourceVerification, [
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
  ], "source-tag-verification.json");
  let sourceRepository;
  try {
    sourceRepository = new URL(sourceVerification.sourceRepository);
  } catch {
    fail("Der Tag-Nachweis besitzt keine gültige Quell-Repository-URL.");
  }
  if (
    sourceVerification.schemaVersion !== "versorgungs-kompass-target-source/v1"
    || sourceRepository.protocol !== "https:"
    || sourceRepository.username
    || sourceRepository.password
    || sourceRepository.search
    || sourceRepository.hash
    || !/^[0-9a-f]{40}$/u.test(sourceVerification.gateRevision || "")
    || sourceVerification.releaseTag !== releaseTag
    || sourceVerification.productVersion !== productVersion
    || !/^[0-9a-f]{40}$/u.test(sourceVerification.tagObjectSha || "")
    || sourceVerification.sourceRevision !== sourceRevision
    || !/^[0-9A-F]{40,64}$/u.test(sourceVerification.signerFingerprint || "")
    || sourceVerification.tagSignatureVerified !== true
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(sourceVerification.remote || "")
    || sourceVerification.mainRef !== `refs/remotes/${sourceVerification.remote}/main`
    || sourceVerification.verified !== true
  ) {
    fail("Der signierte Tag-Nachweis gehört nicht vollständig zur geprüften Target-Quelle.");
  }
  if (!expectedRepositoryUrl) fail("Die geschützte Quell-Repository-URL fehlt.");
  if (!expectedSignerFingerprint) fail("Der geschützte Signer-Fingerprint fehlt.");
  if (!publicKeyFile) fail("Der externe Release-Trust-Anchor fehlt.");
  reverifySourceTag({
    sourceRoot,
    sourceVerification,
    releaseConfig,
    expectedRepositoryUrl,
    expectedSignerFingerprint,
    publicKeyFile: path.resolve(publicKeyFile)
  });

  const apiImageBindingFile = requiredFile(reportDir, "api-image-binding.json");
  const apiImageBinding = readJson(apiImageBindingFile);
  const descriptorChain = apiImageBinding.descriptorChain;
  if (apiImageBinding.schemaVersion !== "versorgungs-kompass-api-image-binding/v1" ||
      apiImageBinding.registryImage !== apiImage ||
      apiImageBinding.registryResolvedLocalDigest !== apiImageLocalDigest ||
      apiImageBinding.localImageDigest !== apiImageLocalDigest ||
      apiImageBinding.imageConfigDigest !== apiImageConfigDigest ||
      !["direct-config", "oci-manifest", "oci-index"].includes(apiImageBinding.archiveFormat) ||
      !Array.isArray(descriptorChain) ||
      descriptorChain.length === 0 ||
      descriptorChain.some((digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest)) ||
      descriptorChain[0] !== apiImageLocalDigest ||
      descriptorChain.at(-1) !== apiImageConfigDigest) {
    fail("Der API-Image-Bindungsnachweis gehört nicht vollständig zum geprüften Image.");
  }
  if (apiImageBinding.archiveFormat === "direct-config" &&
      (descriptorChain.length !== 1 || apiImageLocalDigest !== apiImageConfigDigest)) {
    fail("Der direkte API-Image-Bindungsnachweis ist widersprüchlich.");
  }
  if (apiImageBinding.archiveFormat === "oci-index" &&
      (descriptorChain.length !== 3 || apiImageLocalDigest === apiImageConfigDigest)) {
    fail("Die OCI-Descriptor-Kette des API-Images ist widersprüchlich.");
  }
  if (apiImageBinding.archiveFormat === "oci-manifest" &&
      (descriptorChain.length !== 2 || apiImageLocalDigest === apiImageConfigDigest)) {
    fail("Die OCI-Manifest-Kette des API-Images ist widersprüchlich.");
  }

  const npmAuditFile = requiredFile(reportDir, "npm-audit.json");
  const npmAudit = readJson(npmAuditFile);
  const npmVulnerabilities = npmAudit.metadata?.vulnerabilities;
  if (!npmVulnerabilities) fail("npm-audit.json besitzt keine Vulnerabilitätsmetadaten.");
  for (const severity of ["info", "low", "moderate", "high", "critical", "total"]) {
    if (!Number.isInteger(npmVulnerabilities[severity]) || npmVulnerabilities[severity] < 0) {
      fail(`npm-audit.json besitzt keinen gültigen Wert für ${severity}.`);
    }
  }
  if ((npmVulnerabilities.high || 0) > 0 || (npmVulnerabilities.critical || 0) > 0) {
    fail("npm audit enthält hohe oder kritische Schwachstellen.");
  }

  const npmSignaturesFile = requiredFile(reportDir, "npm-signatures.json");
  const npmSignatures = readJson(npmSignaturesFile);
  if (!Array.isArray(npmSignatures.invalid) || !Array.isArray(npmSignatures.missing)) {
    fail("npm-signatures.json besitzt nicht das erwartete Format.");
  }
  if (npmSignatures.invalid.length || npmSignatures.missing.length) {
    fail("Registry-Signaturen fehlen oder sind ungültig.");
  }

  const semgrepFile = requiredFile(reportDir, "semgrep.json");
  const semgrep = readJson(semgrepFile);
  if (!Array.isArray(semgrep.results) ||
      !Array.isArray(semgrep.errors) ||
      !Array.isArray(semgrep.paths?.scanned) ||
      !Array.isArray(semgrep.paths?.skipped) ||
      semgrep.paths.scanned.length === 0) {
    fail("semgrep.json besitzt nicht das erwartete Format.");
  }
  if (!semgrep.paths.scanned.some((file) =>
    String(file).endsWith("/frontend/app/versorgungs-kompass.js") ||
    file === "frontend/app/versorgungs-kompass.js"
  )) {
    fail("Semgrep hat die zentrale Frontend-Anwendungsdatei nicht geprüft.");
  }
  if (semgrep.results.length) fail("Semgrep enthält blockierende Befunde.");
  if (semgrep.errors.length) fail("Semgrep enthält Parsing- oder Analysefehler.");
  const unsafeSkips = (semgrep.paths?.skipped || []).filter((entry) =>
    ["exceeded_size_limit", "analysis_failed_parser_or_internal_error", "too_many_matches"].includes(entry.reason)
  );
  if (unsafeSkips.length) fail("Semgrep hat sicherheitsrelevante Dateien nicht vollständig geprüft.");

  const gitleaksHistoryFile = requiredFile(reportDir, "gitleaks-history.json");
  const gitleaksTreeFile = requiredFile(reportDir, "gitleaks-tree.json");
  const gitleaksHistory = readJson(gitleaksHistoryFile);
  const gitleaksTree = readJson(gitleaksTreeFile);
  if (!Array.isArray(gitleaksHistory) || !Array.isArray(gitleaksTree)) {
    fail("Gitleaks-Berichte besitzen nicht das erwartete Format.");
  }
  if (gitleaksHistory.length || gitleaksTree.length) fail("Gitleaks enthält nicht freigegebene Funde.");

  const trivyImageFile = requiredFile(reportDir, "trivy-image.json");
  const trivyImage = readJson(trivyImageFile);
  validateTrivyReport(
    trivyImage,
    "Trivy-Image-Bericht",
    "container_image",
    [
      { class: "os-pkgs", type: "alpine", label: "die Alpine-Basispakete" },
      { class: "lang-pkgs", type: "node-pkg", label: "die Node.js-Abhängigkeiten" }
    ]
  );
  if (trivyImage.Metadata?.ImageID !== apiImageConfigDigest) {
    fail("Der Trivy-Image-Bericht gehört nicht zum geprüften API-Image.");
  }
  const imageFindings = vulnerabilityCounts(trivyImage.Results);
  if (imageFindings.high || imageFindings.critical) fail("Trivy enthält hohe oder kritische Image-Funde.");

  const trivyConfigFile = requiredFile(reportDir, "trivy-config.json");
  const trivyConfig = readJson(trivyConfigFile);
  validateTrivyReport(
    trivyConfig,
    "Trivy-Konfigurationsbericht",
    "filesystem",
    [
      { class: "config", type: "dockerfile", label: "das Dockerfile" },
      { class: "config", type: "kubernetes", label: "das Kubernetes-Manifest" }
    ]
  );
  const configFindings = misconfigurationCounts(trivyConfig.Results);
  if (configFindings.high || configFindings.critical) fail("Trivy enthält hohe oder kritische Konfigurationsfunde.");

  const apiSbomFile = requiredFile(reportDir, "api-sbom.cdx.json");
  const frontendSbomFile = requiredFile(reportDir, "frontend-sbom.cdx.json");
  const apiSbom = validateCycloneDx(apiSbomFile, "API-SBOM");
  const frontendSbom = validateCycloneDx(frontendSbomFile, "Frontend-SBOM");
  if (propertyValue(apiSbom.metadata?.component, "aquasecurity:trivy:ImageID") !== apiImageConfigDigest) {
    fail("Die API-SBOM gehört nicht zum geprüften API-Image.");
  }

  const frontendBuildManifest = readJson(frontendManifest);
  if (JSON.stringify(Object.keys(frontendBuildManifest || {}).sort()) !== JSON.stringify(["artifactDigest", "productVersion", "profile", "revision"])) {
    fail("Das Frontend-Manifest verletzt den geschlossenen Versionsvertrag.");
  }
  if (frontendBuildManifest.profile !== "target" ||
      frontendBuildManifest.productVersion !== productVersion ||
      frontendBuildManifest.revision !== sourceRevision) {
    fail("Das Frontend-Manifest gehört nicht zur zentralen Produktversion und Quellrevision.");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(frontendBuildManifest.artifactDigest || "")) {
    fail("Das Frontend-Manifest besitzt keinen gültigen Artefakt-Digest.");
  }
  const frontendSbomDigest = propertyValue(
    frontendSbom.metadata?.component,
    "versorgungs-kompass:frontend-artifact-digest"
  );
  if (frontendSbom.metadata?.component?.version !== productVersion ||
      propertyValue(frontendSbom.metadata?.component, "versorgungs-kompass:product-version") !== productVersion) {
    fail("Die Frontend-SBOM gehört nicht zur zentralen Produktversion.");
  }
  if (propertyValue(frontendSbom.metadata?.component, "versorgungs-kompass:build-profile") !== frontendBuildManifest.profile ||
      propertyValue(frontendSbom.metadata?.component, "versorgungs-kompass:source-revision") !== sourceRevision) {
    fail("Die Frontend-SBOM gehört nicht zum Buildprofil und zur Quellrevision des Frontend-Manifests.");
  }
  const frontendSbomHash = frontendSbom.metadata?.component?.hashes?.find(
    (hash) => hash.alg === "SHA-256"
  )?.content;
  if (frontendSbomDigest !== frontendBuildManifest.artifactDigest ||
      frontendSbomHash !== frontendBuildManifest.artifactDigest.slice("sha256:".length)) {
    fail("Die Frontend-SBOM gehört nicht zum geprüften Frontend-Artefakt.");
  }

  const externalGates = validateExternalGates(reportDir, requireExternalGates, {
    sourceRevision,
    apiImage,
    sbomDigests: [sha256(apiSbomFile), sha256(frontendSbomFile)]
  });
  const externalPassed = externalGates.filter((gate) => gate.status === "reported-passed").length;
  const evidence = {
    schemaVersion: "versorgungs-kompass-security-evidence/v2",
    assuranceProfile: requireExternalGates
      ? "software-factory-linked-precheck"
      : "target-local-precheck",
    observedAt,
    subject: {
      releaseTag,
      productVersion,
      sourceRepository: sourceVerification.sourceRepository,
      tagObjectSha: sourceVerification.tagObjectSha,
      sourceRevision,
      signerFingerprint: sourceVerification.signerFingerprint,
      tagSignatureVerified: true,
      buildProfile: "target",
      authMode: "oidc",
      frontendArtifactDigest: frontendBuildManifest.artifactDigest,
      apiImage,
      apiImageLocalDigest,
      apiImageConfigDigest
    },
    checks: [
      {
        id: "source-tag-signature",
        status: "passed",
        tagObjectSha: sourceVerification.tagObjectSha,
        signerFingerprint: sourceVerification.signerFingerprint,
        report: reportReference(reportDir, "source-tag-verification.json")
      },
      {
        id: "api-image-binding",
        status: "passed",
        archiveFormat: apiImageBinding.archiveFormat,
        descriptorChain,
        report: reportReference(reportDir, "api-image-binding.json")
      },
      {
        id: "npm-audit",
        status: "passed",
        threshold: "HIGH,CRITICAL",
        findings: npmVulnerabilities,
        report: reportReference(reportDir, "npm-audit.json")
      },
      {
        id: "npm-registry-signatures",
        status: "passed",
        findings: { invalid: 0, missing: 0 },
        report: reportReference(reportDir, "npm-signatures.json")
      },
      {
        id: "semgrep",
        status: "passed",
        tool: { name: "Semgrep", version: String(semgrep.version || "") },
        scope: { scanned: semgrep.paths?.scanned?.length || 0, unsafeSkipped: 0 },
        findings: { total: 0 },
        policyDigest: sha256(path.join(sourceRoot, "config/security/semgrep.yml")),
        report: reportReference(reportDir, "semgrep.json")
      },
      {
        id: "gitleaks",
        status: "passed",
        findings: { history: 0, tree: 0 },
        policyDigest: sha256(path.join(sourceRoot, "config/security/gitleaks.toml")),
        reports: [
          reportReference(reportDir, "gitleaks-history.json"),
          reportReference(reportDir, "gitleaks-tree.json")
        ]
      },
      {
        id: "trivy-image",
        status: "passed",
        threshold: "HIGH,CRITICAL",
        findings: imageFindings,
        report: reportReference(reportDir, "trivy-image.json")
      },
      {
        id: "trivy-config",
        status: "passed",
        threshold: "HIGH,CRITICAL",
        findings: configFindings,
        report: reportReference(reportDir, "trivy-config.json")
      }
    ],
    sboms: [
      {
        subject: "api-image",
        components: apiSbom.components.length,
        report: reportReference(reportDir, "api-sbom.cdx.json")
      },
      {
        subject: "frontend",
        components: frontendSbom.components.length,
        report: reportReference(reportDir, "frontend-sbom.cdx.json")
      }
    ],
    externalGates,
    summary: {
      status: "precheck-passed",
      localPassed: 8,
      externalPassed,
      externalNotRun: externalGates.length - externalPassed
    }
  };
  if (buildUrl) evidence.subject.buildUrl = buildUrl;

  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function parseArgs(argv) {
  const values = {
    reportDir: "",
    output: "",
    releaseTag: "",
    sourceRevision: "",
    apiImage: "",
    apiImageLocalDigest: "",
    apiImageConfigDigest: "",
    frontendManifest: "",
    buildUrl: "",
    observedAt: "",
    requireExternalGates: false,
    expectedRepositoryUrl: "",
    expectedSignerFingerprint: "",
    publicKeyFile: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[++index] || "";
    if (argument === "--report-dir") values.reportDir = next();
    else if (argument === "--output") values.output = next();
    else if (argument === "--release-tag") values.releaseTag = next();
    else if (argument === "--source-revision") values.sourceRevision = next();
    else if (argument === "--api-image") values.apiImage = next();
    else if (argument === "--api-image-local-digest") values.apiImageLocalDigest = next();
    else if (argument === "--api-image-config-digest") values.apiImageConfigDigest = next();
    else if (argument === "--frontend-manifest") values.frontendManifest = next();
    else if (argument === "--build-url") values.buildUrl = next();
    else if (argument === "--observed-at") values.observedAt = next();
    else if (argument === "--require-external-gates") values.requireExternalGates = true;
    else if (argument === "--expected-repository-url") values.expectedRepositoryUrl = next();
    else if (argument === "--expected-signer-fingerprint") values.expectedSignerFingerprint = next();
    else if (argument === "--public-key-file") values.publicKeyFile = next();
    else fail(`Unbekanntes Argument: ${argument}`);
  }
  for (const required of [
    "reportDir",
    "output",
    "releaseTag",
    "sourceRevision",
    "apiImage",
    "apiImageLocalDigest",
    "apiImageConfigDigest",
    "frontendManifest",
    "expectedRepositoryUrl",
    "expectedSignerFingerprint",
    "publicKeyFile"
  ]) {
    if (!values[required]) fail(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} ist erforderlich.`);
  }
  return {
    ...values,
    reportDir: path.resolve(values.reportDir),
    output: path.resolve(values.output),
    frontendManifest: path.resolve(values.frontendManifest),
    publicKeyFile: path.resolve(values.publicKeyFile),
    observedAt: values.observedAt || new Date().toISOString()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const evidence = generateSecurityEvidence(options);
  console.log(`Security-Nachweis erzeugt: ${options.output} (${evidence.summary.status})`);
}
