import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateSecurityEvidence } from "./generate_security_evidence.mjs";

const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const fixtureRoot = mkdtempSync(path.join(shortTempRoot, "vk-security-evidence-"));
const reportDir = path.join(fixtureRoot, "reports");
const output = path.join(reportDir, "security-evidence.json");
const frontendManifest = path.join(fixtureRoot, "build-manifest.json");
const sourceRoot = path.join(fixtureRoot, "source");
const authorityHome = path.join(fixtureRoot, "authority-gnupg");
const publicKeyFile = path.join(fixtureRoot, "release-signing-public-key.asc");
const privateKeyFile = path.join(fixtureRoot, "forbidden-release-signing-private-key.asc");
const publicKeySymlink = path.join(fixtureRoot, "release-signing-public-key-link.asc");
const expectedRepositoryUrl = "https://git.example.invalid/versorgung/versorgungs-kompass";
const apiImageLocalDigest = `sha256:${"e".repeat(64)}`;
const apiImageConfigDigest = `sha256:${"d".repeat(64)}`;
const apiImagePlatformManifestDigest = `sha256:${"f".repeat(64)}`;
const frontendArtifactDigest = `sha256:${"c".repeat(64)}`;
const productVersion = "0.23.0";
let signingFingerprint = "";
let sourceRevision = "";
let tagObjectSha = "";
const authorityEnv = { ...process.env, GNUPGHOME: authorityHome };

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

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
    releaseTag: "v0.23.0",
    sourceRevision,
    apiImage: `registry.example.invalid/api@sha256:${"b".repeat(64)}`,
    apiImageLocalDigest,
    apiImageConfigDigest,
    frontendManifest,
    buildUrl: "https://jenkins.example.invalid/job/1/",
    observedAt: "2026-07-23T12:00:00.000Z",
    sourceRoot,
    expectedRepositoryUrl,
    expectedSignerFingerprint: signingFingerprint,
    publicKeyFile,
    ...overrides
  });
}

try {
  mkdirSync(authorityHome, { mode: 0o700 });
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-generate-key", "Security Evidence Test <security-evidence@example.invalid>",
    "ed25519", "cert", "1d"
  ], { env: authorityEnv });
  const primaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: authorityEnv });
  const primaryFingerprint = primaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9] || "";
  assert.match(primaryFingerprint, /^[0-9A-F]{40,64}$/u);
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-add-key", primaryFingerprint, "ed25519", "sign", "1d"
  ], { env: authorityEnv });
  const keyRecords = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: authorityEnv }).split("\n").map((line) => line.split(":"));
  const signingSubkeyIndex = keyRecords.findIndex((fields) =>
    fields[0] === "ssb" && String(fields[11] || "").toLowerCase().includes("s")
  );
  signingFingerprint = keyRecords.slice(signingSubkeyIndex + 1)
    .find((fields) => fields[0] === "fpr")?.[9] || "";
  assert.match(signingFingerprint, /^[0-9A-F]{40,64}$/u);
  writeFileSync(
    publicKeyFile,
    `${run("gpg", ["--batch", "--armor", "--export", primaryFingerprint], { env: authorityEnv })}\n`,
    "utf8"
  );
  writeFileSync(
    privateKeyFile,
    `${run("gpg", [
      "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
      "--armor", "--export-secret-keys", primaryFingerprint
    ], { env: authorityEnv })}\n`,
    "utf8"
  );

  run("git", ["init", "-b", "main", sourceRoot]);
  run("git", ["config", "user.name", "Security Evidence Test"], { cwd: sourceRoot });
  run("git", ["config", "user.email", "security-evidence@example.invalid"], { cwd: sourceRoot });
  run("git", ["config", "user.signingkey", `${signingFingerprint}!`], { cwd: sourceRoot });
  run("git", ["config", "gpg.format", "openpgp"], { cwd: sourceRoot });
  run("git", ["remote", "add", "origin", expectedRepositoryUrl], { cwd: sourceRoot });
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(path.join(sourceRoot, "config/security"), { recursive: true });
  const releaseConfig = JSON.parse(readFileSync(path.join(process.cwd(), "config/release.json"), "utf8"));
  releaseConfig.productVersion = productVersion;
  writeFileSync(
    path.join(sourceRoot, "config/release.json"),
    `${JSON.stringify(releaseConfig, null, 2)}\n`,
    "utf8"
  );
  copyFileSync(
    path.join(process.cwd(), "config/security/semgrep.yml"),
    path.join(sourceRoot, "config/security/semgrep.yml")
  );
  copyFileSync(
    path.join(process.cwd(), "config/security/gitleaks.toml"),
    path.join(sourceRoot, "config/security/gitleaks.toml")
  );
  run("git", ["add", "config/release.json", "config/security/semgrep.yml", "config/security/gitleaks.toml"], {
    cwd: sourceRoot
  });
  run("git", ["commit", "-m", "Bereite signierten Security-Teststand vor"], { cwd: sourceRoot });
  sourceRevision = run("git", ["rev-parse", "HEAD"], { cwd: sourceRoot });
  run("git", ["update-ref", "refs/remotes/origin/main", sourceRevision], { cwd: sourceRoot });
  run("git", [
    "tag", "--sign", "--local-user", `${signingFingerprint}!`,
    "-m", "0.23.0-0 Release Candidate", "v0.23.0", sourceRevision
  ], { cwd: sourceRoot, env: authorityEnv });
  tagObjectSha = run("git", ["rev-parse", "v0.23.0^{tag}"], { cwd: sourceRoot });
  const sourceTagVerification = {
    schemaVersion: "versorgungs-kompass-target-source/v1",
    sourceRepository: expectedRepositoryUrl,
    gateRevision: sourceRevision,
    releaseTag: "v0.23.0",
    productVersion,
    tagObjectSha,
    sourceRevision,
    signerFingerprint: signingFingerprint,
    tagSignatureVerified: true,
    remote: "origin",
    mainRef: "refs/remotes/origin/main",
    verified: true
  };
  writeJson("source-tag-verification.json", sourceTagVerification);
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
        version: productVersion,
        hashes: [{ alg: "SHA-256", content: frontendArtifactDigest.slice("sha256:".length) }],
        properties: [
          { name: "versorgungs-kompass:product-version", value: productVersion },
          { name: "versorgungs-kompass:build-profile", value: "target" },
          { name: "versorgungs-kompass:source-revision", value: sourceRevision },
          {
            name: "versorgungs-kompass:frontend-artifact-digest",
            value: frontendArtifactDigest
          }
        ]
      }
    },
    components: [{ type: "library", name: "leaflet", version: "1.9.4" }]
  });
  writeFileSync(frontendManifest, `${JSON.stringify({
    profile: "target",
    productVersion,
    revision: sourceRevision,
    artifactDigest: frontendArtifactDigest
  })}\n`);

  const evidence = generate();
  assert.equal(evidence.schemaVersion, "versorgungs-kompass-security-evidence/v2");
  assert.equal(evidence.summary.status, "precheck-passed");
  assert.equal(evidence.summary.localPassed, 8);
  assert.equal(evidence.assuranceProfile, "target-local-precheck");
  assert.equal(evidence.subject.releaseTag, "v0.23.0");
  assert.equal(evidence.subject.productVersion, productVersion);
  assert.equal(evidence.subject.tagObjectSha, tagObjectSha);
  assert.equal(evidence.subject.signerFingerprint, signingFingerprint);
  assert.equal(evidence.subject.tagSignatureVerified, true);
  assert.equal(evidence.subject.buildProfile, "target");
  assert.equal(evidence.subject.authMode, "oidc");
  assert.equal(evidence.externalGates.every((gate) => gate.status === "not-run"), true);
  assert.throws(() => generate({ requireExternalGates: true }), /Zentrales Software-Factory-Gate fehlt/u);
  assert.throws(() => generate({
    expectedRepositoryUrl: "https://git.example.invalid/andere/quelle"
  }), /geschützten Repository-Autorität/u);
  assert.throws(() => generate({
    expectedSignerFingerprint: "A".repeat(40)
  }), /geschützten Signing-Subkey/u);
  assert.throws(() => generate({ publicKeyFile: privateKeyFile }), /privates Schlüsselmaterial/u);
  symlinkSync(publicKeyFile, publicKeySymlink);
  assert.throws(() => generate({ publicKeyFile: publicKeySymlink }), /keine zulässige reguläre Datei/u);
  unlinkSync(publicKeySymlink);

  run("git", ["remote", "set-url", "origin", "https://git.example.invalid/andere/quelle"], {
    cwd: sourceRoot
  });
  assert.throws(() => generate(), /Security-Checkout gehört nicht zur geschützten Repository-Autorität/u);
  run("git", ["remote", "set-url", "origin", expectedRepositoryUrl], { cwd: sourceRoot });

  const dirtySourceFile = path.join(sourceRoot, "untracked-security-source.txt");
  writeFileSync(dirtySourceFile, "nicht signiert\n", "utf8");
  assert.throws(() => generate(), /Security-Checkout ist nicht sauber/u);
  unlinkSync(dirtySourceFile);

  run("git", ["update-ref", `refs/replace/${sourceRevision}`, sourceRevision], { cwd: sourceRoot });
  assert.throws(() => generate(), /Replacement-Refs/u);
  run("git", ["update-ref", "-d", `refs/replace/${sourceRevision}`], { cwd: sourceRoot });

  const graftFile = path.join(sourceRoot, ".git/info/grafts");
  writeFileSync(graftFile, `${sourceRevision}\n`, "utf8");
  assert.throws(() => generate(), /Git-Objektumleitung/u);
  unlinkSync(graftFile);

  writeJson("source-tag-verification.json", {
    ...sourceTagVerification,
    sourceRevision: "c".repeat(40)
  });
  assert.throws(() => generate(), /signierte Tag-Nachweis gehört nicht vollständig/u);
  writeJson("source-tag-verification.json", {
    ...sourceTagVerification,
    rcTag: "poc-v0.1.0-rc.5"
  });
  assert.throws(() => generate(), /geschlossenen Nachweisvertrag/u);
  writeJson("source-tag-verification.json", sourceTagVerification);

  writeJson("api-image-binding.json", {
    ...apiImageBinding,
    imageConfigDigest: `sha256:${"9".repeat(64)}`
  });
  assert.throws(() => generate(), /Bindungsnachweis gehört nicht vollständig/u);
  writeJson("api-image-binding.json", apiImageBinding);

  const validFrontendSbom = readFileSync(path.join(reportDir, "frontend-sbom.cdx.json"), "utf8");
  const wrongVersionSbom = JSON.parse(validFrontendSbom);
  wrongVersionSbom.metadata.component.version = "999.0.0";
  writeJson("frontend-sbom.cdx.json", wrongVersionSbom);
  assert.throws(() => generate(), /Frontend-SBOM gehört nicht zur zentralen Produktversion/u);
  writeFileSync(path.join(reportDir, "frontend-sbom.cdx.json"), validFrontendSbom);

  for (const [propertyName, value] of [
    ["versorgungs-kompass:build-profile", "pages"],
    ["versorgungs-kompass:source-revision", "b".repeat(40)]
  ]) {
    const wrongBindingSbom = JSON.parse(validFrontendSbom);
    wrongBindingSbom.metadata.component.properties.find((property) => property.name === propertyName).value = value;
    writeJson("frontend-sbom.cdx.json", wrongBindingSbom);
    assert.throws(() => generate(), /Frontend-SBOM gehört nicht zum Buildprofil und zur Quellrevision/u);
  }
  writeFileSync(path.join(reportDir, "frontend-sbom.cdx.json"), validFrontendSbom);

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
      policyId: `${tool}-target-policy`,
      sourceRevision,
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
    sourceRevision,
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
