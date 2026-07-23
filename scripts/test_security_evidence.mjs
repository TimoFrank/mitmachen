import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateSecurityEvidence } from "./generate_security_evidence.mjs";

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "vk-security-evidence-"));
const reportDir = path.join(fixtureRoot, "reports");
const output = path.join(reportDir, "security-evidence.json");
const frontendManifest = path.join(fixtureRoot, "build-manifest.json");
const apiImageLocalDigest = `sha256:${"e".repeat(64)}`;
const apiImageConfigDigest = `sha256:${"d".repeat(64)}`;
const apiImagePlatformManifestDigest = `sha256:${"f".repeat(64)}`;
const frontendArtifactDigest = `sha256:${"c".repeat(64)}`;

function writeJson(name, value) {
  writeFileSync(path.join(reportDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function digest(name) {
  return `sha256:${createHash("sha256").update(readFileSync(path.join(reportDir, name))).digest("hex")}`;
}

function generate(overrides = {}) {
  return generateSecurityEvidence({
    reportDir,
    output,
    rcTag: "poc-v0.1.0-rc.1",
    sourceRevision: "a".repeat(40),
    apiImage: `registry.example.invalid/api@sha256:${"b".repeat(64)}`,
    apiImageLocalDigest,
    apiImageConfigDigest,
    frontendManifest,
    buildUrl: "https://jenkins.example.invalid/job/1/",
    observedAt: "2026-07-23T12:00:00.000Z",
    ...overrides
  });
}

try {
  mkdirSync(reportDir, { recursive: true });
  writeJson("npm-audit.json", {
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }
  });
  writeJson("npm-signatures.json", { invalid: [], missing: [] });
  writeJson("semgrep.json", {
    version: "1.164.0",
    results: [],
    errors: [],
    paths: {
      scanned: ["api/server.mjs", "frontend/app/versorgungs-kompass.js"],
      skipped: []
    }
  });
  writeJson("gitleaks-history.json", []);
  writeJson("gitleaks-tree.json", []);
  const apiImageBinding = {
    schemaVersion: "versorgungs-kompass-api-image-binding/v1",
    registryImage: `registry.example.invalid/api@sha256:${"b".repeat(64)}`,
    registryResolvedLocalDigest: apiImageLocalDigest,
    localImageDigest: apiImageLocalDigest,
    imageConfigDigest: apiImageConfigDigest,
    archiveFormat: "oci-index",
    descriptorChain: [
      apiImageLocalDigest,
      apiImagePlatformManifestDigest,
      apiImageConfigDigest
    ]
  };
  writeJson("api-image-binding.json", apiImageBinding);
  const trivyImageReport = {
    SchemaVersion: 2,
    ArtifactName: "api-image.tar",
    ArtifactType: "container_image",
    Metadata: { ImageID: apiImageConfigDigest },
    Results: [
      { Target: "api-image.tar (alpine 3.24.1)", Class: "os-pkgs", Type: "alpine" },
      { Target: "Node.js", Class: "lang-pkgs", Type: "node-pkg" }
    ]
  };
  const trivyConfigReport = {
    SchemaVersion: 2,
    ArtifactName: "/scan",
    ArtifactType: "filesystem",
    Results: [
      { Target: "Dockerfile", Class: "config", Type: "dockerfile" },
      { Target: "target.yaml", Class: "config", Type: "kubernetes" }
    ]
  };
  writeJson("trivy-image.json", trivyImageReport);
  writeJson("trivy-config.json", trivyConfigReport);
  writeJson("api-sbom.cdx.json", {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        type: "container",
        name: "api-image.tar",
        properties: [{ name: "aquasecurity:trivy:ImageID", value: apiImageConfigDigest }]
      }
    },
    components: [{ type: "library", name: "pg", version: "8.21.0" }]
  });
  writeJson("frontend-sbom.cdx.json", {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        type: "application",
        name: "versorgungs-kompass-frontend",
        hashes: [{ alg: "SHA-256", content: frontendArtifactDigest.slice("sha256:".length) }],
        properties: [{
          name: "versorgungs-kompass:frontend-artifact-digest",
          value: frontendArtifactDigest
        }]
      }
    },
    components: [{ type: "library", name: "leaflet", version: "1.9.4" }]
  });
  writeFileSync(frontendManifest, `${JSON.stringify({ artifactDigest: frontendArtifactDigest })}\n`);

  const evidence = generate();
  assert.equal(evidence.summary.status, "precheck-passed");
  assert.equal(evidence.summary.localPassed, 7);
  assert.equal(evidence.externalGates.every((gate) => gate.status === "not-run"), true);
  assert.throws(() => generate({ requireExternalGates: true }), /Zentrales Software-Factory-Gate fehlt/u);

  writeJson("api-image-binding.json", {
    ...apiImageBinding,
    imageConfigDigest: `sha256:${"9".repeat(64)}`
  });
  assert.throws(() => generate(), /Bindungsnachweis gehört nicht vollständig/u);
  writeJson("api-image-binding.json", apiImageBinding);

  writeJson("trivy-image.json", {});
  assert.throws(() => generate(), /erwartete Trivy-Format/u);
  writeJson("trivy-image.json", trivyImageReport);

  writeJson("trivy-image.json", {
    ...trivyImageReport,
    Results: trivyImageReport.Results.filter((result) => result.Class !== "os-pkgs")
  });
  assert.throws(() => generate(), /Alpine-Basispakete nicht geprüft/u);
  writeJson("trivy-image.json", trivyImageReport);

  for (const [tool, filename] of [
    ["sonarqube", "sonarqube-gate.json"],
    ["snyk", "snyk-gate.json"],
    ["dependency-track", "dependency-track-gate.json"],
    ["cosign", "cosign-attestation.json"]
  ]) {
    const report = {
      tool,
      status: "passed",
      analysisId: `${tool}-analysis-1`,
      policyId: `${tool}-poc-policy`,
      sourceRevision: "a".repeat(40),
      evaluatedAt: "2026-07-23T12:05:00.000Z"
    };
    if (tool === "dependency-track") {
      report.sbomDigests = [
        digest("api-sbom.cdx.json"),
        digest("frontend-sbom.cdx.json")
      ];
    }
    if (tool === "cosign") {
      report.subject = `registry.example.invalid/api@sha256:${"b".repeat(64)}`;
    }
    writeJson(filename, report);
  }
  const releaseEvidence = generate({ requireExternalGates: true });
  assert.equal(releaseEvidence.assuranceProfile, "software-factory-linked-precheck");
  assert.equal(releaseEvidence.summary.status, "precheck-passed");
  assert.equal(releaseEvidence.summary.externalPassed, 4);
  assert.equal(
    releaseEvidence.externalGates.every((gate) => gate.status === "reported-passed"),
    true
  );

  writeJson("snyk-gate.json", {
    tool: "snyk",
    status: "passed",
    analysisId: "snyk-analysis-2",
    policyId: "snyk-poc-policy",
    sourceRevision: "a".repeat(40),
    evaluatedAt: ""
  });
  assert.throws(() => generate({ requireExternalGates: true }), /gültigen Prüfzeitpunkt/u);

  writeJson("semgrep.json", {
    version: "1.164.0",
    results: [],
    errors: [{ message: "PartialParsing" }],
    paths: { scanned: ["frontend/app/versorgungs-kompass.js"], skipped: [] }
  });
  assert.throws(() => generate(), /Parsing- oder Analysefehler/u);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Security-Evidenz-Vertrag ist grün.");
