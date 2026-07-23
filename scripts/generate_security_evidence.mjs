import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  rcTag,
  sourceRevision,
  apiImage,
  apiImageLocalDigest,
  apiImageConfigDigest,
  frontendManifest,
  buildUrl = "",
  observedAt = new Date().toISOString(),
  requireExternalGates = false,
  sourceRoot = root
}) {
  if (!/^poc-v\d+\.\d+\.\d+-rc\.[1-9]\d*$/u.test(rcTag)) fail("Ungültiger PoC-RC-Tag.");
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
  if (!/^sha256:[0-9a-f]{64}$/u.test(frontendBuildManifest.artifactDigest || "")) {
    fail("Das Frontend-Manifest besitzt keinen gültigen Artefakt-Digest.");
  }
  const frontendSbomDigest = propertyValue(
    frontendSbom.metadata?.component,
    "versorgungs-kompass:frontend-artifact-digest"
  );
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
    schemaVersion: "versorgungs-kompass-security-evidence/v1",
    assuranceProfile: requireExternalGates
      ? "software-factory-linked-precheck"
      : "local-poc-precheck",
    observedAt,
    subject: {
      rcTag,
      sourceRevision,
      frontendArtifactDigest: frontendBuildManifest.artifactDigest,
      apiImage,
      apiImageLocalDigest,
      apiImageConfigDigest
    },
    checks: [
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
      localPassed: 7,
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
    rcTag: "",
    sourceRevision: "",
    apiImage: "",
    apiImageLocalDigest: "",
    apiImageConfigDigest: "",
    frontendManifest: "",
    buildUrl: "",
    observedAt: "",
    requireExternalGates: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => argv[++index] || "";
    if (argument === "--report-dir") values.reportDir = next();
    else if (argument === "--output") values.output = next();
    else if (argument === "--rc-tag") values.rcTag = next();
    else if (argument === "--source-revision") values.sourceRevision = next();
    else if (argument === "--api-image") values.apiImage = next();
    else if (argument === "--api-image-local-digest") values.apiImageLocalDigest = next();
    else if (argument === "--api-image-config-digest") values.apiImageConfigDigest = next();
    else if (argument === "--frontend-manifest") values.frontendManifest = next();
    else if (argument === "--build-url") values.buildUrl = next();
    else if (argument === "--observed-at") values.observedAt = next();
    else if (argument === "--require-external-gates") values.requireExternalGates = true;
    else fail(`Unbekanntes Argument: ${argument}`);
  }
  for (const required of [
    "reportDir",
    "output",
    "rcTag",
    "sourceRevision",
    "apiImage",
    "apiImageLocalDigest",
    "apiImageConfigDigest",
    "frontendManifest"
  ]) {
    if (!values[required]) fail(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} ist erforderlich.`);
  }
  return {
    ...values,
    reportDir: path.resolve(values.reportDir),
    output: path.resolve(values.output),
    frontendManifest: path.resolve(values.frontendManifest),
    observedAt: values.observedAt || new Date().toISOString()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const evidence = generateSecurityEvidence(options);
  console.log(`Security-Nachweis erzeugt: ${options.output} (${evidence.summary.status})`);
}
