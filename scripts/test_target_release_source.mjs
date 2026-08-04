import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  cpSync,
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
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifier = path.join(projectRoot, "scripts/verify_target_release_source.mjs");
const handoffPackager = path.join(projectRoot, "scripts/package_source_handoff.mjs");
const handoffVerifier = path.join(projectRoot, "scripts/verify_source_handoff.mjs");
const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const fixtureRoot = mkdtempSync(path.join(shortTempRoot, "vk-target-source-"));
const authorityHome = path.join(fixtureRoot, "authority-gnupg");
const repository = path.join(fixtureRoot, "repository");
const remoteRepository = path.join(fixtureRoot, "versorgung", "source.git");
const publicKeyFile = path.join(fixtureRoot, "release-signing-public-key.asc");
const privateKeyFile = path.join(fixtureRoot, "forbidden-release-signing-private-key.asc");
const output = path.join(fixtureRoot, "source-tag-verification.json");
const handoffDirectory = path.join(fixtureRoot, "handoff");
const certificateFile = path.join(fixtureRoot, "git-https-cert.pem");
const certificateKeyFile = path.join(fixtureRoot, "git-https-key.pem");
const serverScript = path.join(fixtureRoot, "git-https-server.mjs");
const serverPortFile = path.join(fixtureRoot, "git-https-port.txt");
const publicKeySymlink = path.join(fixtureRoot, "release-signing-public-key-link.asc");
let sourceUrl = "";
let gitServer;

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

function runVerifier(args, { expectSuccess = false, env = process.env } = {}) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    cwd: repository,
    encoding: "utf8",
    env
  });
  if (expectSuccess) {
    assert.equal(result.status, 0, `Target-Quell-Gate sollte erfolgreich sein:\n${result.stderr}`);
  } else {
    assert.notEqual(result.status, 0, "Target-Quell-Gate sollte fail-closed abbrechen.");
  }
  return result;
}

function verifierArgs(tag, overrides = {}) {
  return [
    "--tag", tag,
    "--remote", "origin",
    "--expected-repository-url", overrides.expectedRepositoryUrl || sourceUrl,
    "--public-key-file", overrides.publicKeyFile || publicKeyFile,
    "--fingerprint", overrides.fingerprint || signingFingerprint,
    "--output", output
  ];
}

let signingFingerprint = "";
const authorityEnv = { ...process.env, GNUPGHOME: authorityHome };

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function waitForFile(file, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  throw new Error(`Zeitüberschreitung beim Warten auf ${file}`);
}

function signChecksums(directory) {
  run("gpg", [
    "--batch", "--yes", "--armor", "--local-user", `${signingFingerprint}!`,
    "--detach-sign", "--output", path.join(directory, "SHA256SUMS.asc"),
    path.join(directory, "SHA256SUMS")
  ], { env: authorityEnv });
}

try {
  mkdirSync(authorityHome, { mode: 0o700 });
  mkdirSync(repository);
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-generate-key", "Target Source Test <target-source@example.invalid>",
    "ed25519", "cert", "1d"
  ], { env: authorityEnv });
  const primaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: authorityEnv });
  const primaryFingerprint = primaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9];
  assert.match(primaryFingerprint || "", /^[0-9A-F]{40,64}$/u);
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-add-key", primaryFingerprint, "ed25519", "sign", "1d"
  ], { env: authorityEnv });
  const fullListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: authorityEnv });
  const records = fullListing.split("\n").map((line) => line.split(":"));
  const signingSubkeyIndex = records.findIndex((fields) =>
    fields[0] === "ssb" && String(fields[11] || "").toLowerCase().includes("s")
  );
  signingFingerprint = records.slice(signingSubkeyIndex + 1)
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

  mkdirSync(path.dirname(remoteRepository), { recursive: true });
  run("git", ["init", "--bare", remoteRepository]);
  run("git", ["config", "http.receivepack", "true"], { cwd: remoteRepository });
  run("git", ["config", "http.uploadpack", "true"], { cwd: remoteRepository });
  run("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    "-keyout", certificateKeyFile, "-out", certificateFile
  ]);
  writeFileSync(serverScript, `
import https from "node:https";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const [projectRoot, certFile, keyFile, portFile] = process.argv.slice(2);
const server = https.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, (request, response) => {
  const requestUrl = new URL(request.url, "https://127.0.0.1");
  const backend = spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: projectRoot,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: requestUrl.pathname,
      QUERY_STRING: requestUrl.search.slice(1),
      REQUEST_METHOD: request.method,
      CONTENT_TYPE: request.headers["content-type"] || "",
      CONTENT_LENGTH: request.headers["content-length"] || "0"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  request.pipe(backend.stdin);
  const chunks = [];
  backend.stdout.on("data", (chunk) => chunks.push(chunk));
  backend.on("close", (code) => {
    const payload = Buffer.concat(chunks);
    const separator = payload.indexOf("\\r\\n\\r\\n");
    if (code !== 0 || separator < 0) {
      response.writeHead(500);
      response.end();
      return;
    }
    const headers = payload.subarray(0, separator).toString("utf8").split("\\r\\n");
    let status = 200;
    for (const header of headers) {
      const index = header.indexOf(":");
      if (index < 0) continue;
      const name = header.slice(0, index);
      const value = header.slice(index + 1).trim();
      if (name.toLowerCase() === "status") status = Number(value.split(" ", 1)[0]);
      else response.setHeader(name, value);
    }
    response.writeHead(status);
    response.end(payload.subarray(separator + 4));
  });
});
server.listen(0, "127.0.0.1", () => writeFileSync(portFile, String(server.address().port)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`, "utf8");
  gitServer = spawn(process.execPath, [
    serverScript, fixtureRoot, certificateFile, certificateKeyFile, serverPortFile
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const serverPort = waitForFile(serverPortFile);
  sourceUrl = `https://127.0.0.1:${serverPort}/versorgung/source.git`;
  process.env.GIT_SSL_CAINFO = certificateFile;
  authorityEnv.GIT_SSL_CAINFO = certificateFile;

  run("git", ["init", "-b", "main"], { cwd: repository });
  run("git", ["config", "user.name", "Target Source Test"], { cwd: repository });
  run("git", ["config", "user.email", "target-source@example.invalid"], { cwd: repository });
  run("git", ["config", "user.signingkey", `${signingFingerprint}!`], { cwd: repository });
  run("git", ["config", "gpg.format", "openpgp"], { cwd: repository });
  run("git", ["remote", "add", "origin", sourceUrl], { cwd: repository });

  const releaseConfig = JSON.parse(readFileSync(path.join(projectRoot, "config/release.json"), "utf8"));
  releaseConfig.productVersion = "0.23.0";
  mkdirSync(path.join(repository, "config"));
  writeFileSync(
    path.join(repository, "config/release.json"),
    `${JSON.stringify(releaseConfig, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(path.join(repository, "source.txt"), "signed target source\n", "utf8");
  run("git", ["add", "config/release.json", "source.txt"], { cwd: repository });
  run("git", ["commit", "-m", "Prepare signed target source"], { cwd: repository });
  const releaseCommit = run("git", ["rev-parse", "HEAD"], { cwd: repository });
  run("git", [
    "tag", "--sign", "--local-user", `${signingFingerprint}!`,
    "-m", "0.23.0-0 Release Candidate", "v0.23.0", releaseCommit
  ], { cwd: repository, env: authorityEnv });
  run("git", ["push", "origin", "refs/heads/main", "refs/tags/v0.23.0"], { cwd: repository });

  const success = runVerifier(verifierArgs("v0.23.0"), { expectSuccess: true });
  const stdoutEvidence = JSON.parse(success.stdout.trim());
  const fileEvidence = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(fileEvidence, stdoutEvidence);
  assert.equal(fileEvidence.schemaVersion, "versorgungs-kompass-target-source/v1");
  assert.equal(fileEvidence.sourceRepository, sourceUrl.replace(/\.git$/u, ""));
  assert.equal(fileEvidence.gateRevision, releaseCommit);
  assert.equal(fileEvidence.releaseTag, "v0.23.0");
  assert.equal(fileEvidence.productVersion, "0.23.0");
  assert.equal(fileEvidence.sourceRevision, releaseCommit);
  assert.equal(fileEvidence.signerFingerprint, signingFingerprint);
  assert.equal(fileEvidence.tagSignatureVerified, true);
  assert.equal(fileEvidence.verified, true);

  const rewriteKey = `url.file://${remoteRepository}.insteadOf`;
  run("git", ["config", "--local", rewriteKey, sourceUrl], { cwd: repository });
  const rewriteResult = runVerifier(verifierArgs("v0.23.0"));
  assert.match(rewriteResult.stderr, /Git-URL-Rewrite-Regeln/u);
  const rewritePackageResult = spawnSync(process.execPath, [
    handoffPackager,
    "--tag", "v0.23.0",
    "--source-remote", "origin",
    "--expected-repository-url", sourceUrl,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--output-dir", path.join(fixtureRoot, "rewrite-handoff")
  ], { cwd: repository, encoding: "utf8", env: authorityEnv });
  assert.notEqual(rewritePackageResult.status, 0, "URL-Rewrites müssen auch den Packager stoppen.");
  assert.match(rewritePackageResult.stderr, /Git-URL-Rewrite-Regeln/u);
  run("git", ["config", "--local", "--unset-all", rewriteKey], { cwd: repository });

  const injectedConfigResult = runVerifier(verifierArgs("v0.23.0"), {
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "url.file:///private/tmp/forbidden.insteadOf",
      GIT_CONFIG_VALUE_0: sourceUrl
    }
  });
  assert.match(injectedConfigResult.stderr, /Unerlaubte Git-Umgebungssteuerung/u);

  run("git", ["update-ref", `refs/replace/${releaseCommit}`, releaseCommit], { cwd: repository });
  const replaceResult = runVerifier(verifierArgs("v0.23.0"));
  assert.match(replaceResult.stderr, /Replacement-Refs/u);
  run("git", ["update-ref", "-d", `refs/replace/${releaseCommit}`], { cwd: repository });

  const graftFile = path.join(repository, ".git/info/grafts");
  writeFileSync(graftFile, `${releaseCommit}\n`, "utf8");
  const graftResult = runVerifier(verifierArgs("v0.23.0"));
  assert.match(graftResult.stderr, /Git-Objektumleitung/u);
  unlinkSync(graftFile);

  symlinkSync(publicKeyFile, publicKeySymlink);
  const symlinkResult = runVerifier(verifierArgs("v0.23.0", { publicKeyFile: publicKeySymlink }));
  assert.match(symlinkResult.stderr, /Trust-Anchor-Datei/u);
  unlinkSync(publicKeySymlink);

  run(process.execPath, [
    handoffPackager,
    "--tag", "v0.23.0",
    "--source-remote", "origin",
    "--expected-repository-url", sourceUrl,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--output-dir", handoffDirectory
  ], { cwd: repository, env: authorityEnv });
  const handoffResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", handoffDirectory,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.equal(handoffResult.status, 0, `Quellübergabe sollte gültig sein:\n${handoffResult.stderr}`);
  const verifiedHandoff = JSON.parse(handoffResult.stdout.trim());
  assert.equal(verifiedHandoff.releaseTag, "v0.23.0");
  assert.equal(verifiedHandoff.sourceRevision, releaseCommit);
  assert.equal(verifiedHandoff.verified, true);

  const tamperedHandoffDirectory = path.join(fixtureRoot, "tampered-signed-handoff");
  cpSync(handoffDirectory, tamperedHandoffDirectory, { recursive: true });
  const tamperedManifestPath = path.join(tamperedHandoffDirectory, "handoff-manifest.json");
  writeFileSync(
    tamperedManifestPath,
    `${readFileSync(tamperedManifestPath, "utf8").trimEnd()}\n\n`,
    "utf8"
  );
  const tamperedChecksumsPath = path.join(tamperedHandoffDirectory, "SHA256SUMS");
  const recomputedChecksums = readFileSync(tamperedChecksumsPath, "utf8")
    .split("\n")
    .map((line) => line.endsWith("  handoff-manifest.json")
      ? `${sha256(tamperedManifestPath)}  handoff-manifest.json`
      : line)
    .join("\n");
  writeFileSync(tamperedChecksumsPath, recomputedChecksums, "utf8");
  const tamperedSignatureResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", tamperedHandoffDirectory,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.notEqual(tamperedSignatureResult.status, 0, "Neu berechnete, aber unsignierte Checksummen müssen scheitern.");
  assert.match(tamperedSignatureResult.stderr, /nicht gültig.*signiert/u);

  const extraRefHandoffDirectory = path.join(fixtureRoot, "extra-ref-handoff");
  cpSync(handoffDirectory, extraRefHandoffDirectory, { recursive: true });
  const extraRefBundleName = `versorgungs-kompass-v0.23.0-source.bundle`;
  const extraRefBundlePath = path.join(extraRefHandoffDirectory, extraRefBundleName);
  unlinkSync(extraRefBundlePath);
  run("git", ["update-ref", "refs/evil/hidden", releaseCommit], { cwd: repository });
  run("git", [
    "bundle", "create", extraRefBundlePath,
    "refs/heads/main", "refs/tags/v0.23.0", "refs/evil/hidden"
  ], { cwd: repository });
  const extraRefManifestPath = path.join(extraRefHandoffDirectory, "handoff-manifest.json");
  const extraRefManifest = JSON.parse(readFileSync(extraRefManifestPath, "utf8"));
  extraRefManifest.refs["refs/evil/hidden"] = releaseCommit;
  extraRefManifest.bundle.sha256 = `sha256:${sha256(extraRefBundlePath)}`;
  writeFileSync(extraRefManifestPath, `${JSON.stringify(extraRefManifest, null, 2)}\n`, "utf8");
  const extraRefChecksumsPath = path.join(extraRefHandoffDirectory, "SHA256SUMS");
  writeFileSync(extraRefChecksumsPath, [
    `${sha256(extraRefBundlePath)}  ${extraRefBundleName}`,
    `${sha256(extraRefManifestPath)}  handoff-manifest.json`,
    `${sha256(path.join(extraRefHandoffDirectory, "release-signing-public-key.asc"))}  release-signing-public-key.asc`
  ].sort((left, right) => left.slice(left.indexOf("  ") + 2).localeCompare(right.slice(right.indexOf("  ") + 2))).join("\n") + "\n", "utf8");
  signChecksums(extraRefHandoffDirectory);
  const extraRefResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", extraRefHandoffDirectory,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.notEqual(extraRefResult.status, 0, "Auch ein gültig signiertes Paket mit Zusatz-Ref muss scheitern.");
  assert.match(extraRefResult.stderr, /Ref-Inventar/u);
  run("git", ["update-ref", "-d", "refs/evil/hidden"], { cwd: repository });

  symlinkSync(publicKeyFile, publicKeySymlink);
  const handoffSymlinkResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", handoffDirectory,
    "--public-key-file", publicKeySymlink,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.notEqual(handoffSymlinkResult.status, 0, "Ein Trust-Anchor-Symlink muss fail-closed scheitern.");
  unlinkSync(publicKeySymlink);

  const handoffManifestPath = path.join(handoffDirectory, "handoff-manifest.json");
  const validHandoffManifest = readFileSync(handoffManifestPath, "utf8");
  const invalidHandoffManifest = JSON.parse(validHandoffManifest);
  invalidHandoffManifest.singleWriterRequired = false;
  writeFileSync(handoffManifestPath, `${JSON.stringify(invalidHandoffManifest, null, 2)}\n`, "utf8");
  const invalidHandoffResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", handoffDirectory,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.notEqual(invalidHandoffResult.status, 0, "Manipuliertes Handoff-Manifest muss scheitern.");
  writeFileSync(handoffManifestPath, validHandoffManifest, "utf8");

  const forbiddenSidecar = path.join(handoffDirectory, "pages-artifact.zip");
  writeFileSync(forbiddenSidecar, "forbidden\n", "utf8");
  const sidecarResult = spawnSync(process.execPath, [
    handoffVerifier,
    "--input-dir", handoffDirectory,
    "--public-key-file", publicKeyFile,
    "--fingerprint", signingFingerprint,
    "--expected-repository-url", sourceUrl
  ], { cwd: repository, encoding: "utf8" });
  assert.notEqual(sidecarResult.status, 0, "Unerwartete Sidecars müssen scheitern.");
  unlinkSync(forbiddenSidecar);

  runVerifier(verifierArgs("poc-v0.1.0-rc.6"));
  runVerifier(verifierArgs("v0.23.0", {
    expectedRepositoryUrl: "https://git.example.invalid/andere/quelle"
  }));
  runVerifier(verifierArgs("v0.23.0", { fingerprint: "A".repeat(40) }));
  runVerifier(verifierArgs("v0.23.0", { publicKeyFile: privateKeyFile }));

  const originalTagObject = run("git", ["rev-parse", "v0.23.0^{tag}"], { cwd: repository });
  run("git", ["tag", "--delete", "v0.23.0"], { cwd: repository });
  run("git", [
    "tag", "--sign", "--local-user", `${signingFingerprint}!`,
    "-m", "Manipuliertes Tagobjekt auf demselben Commit", "v0.23.0", releaseCommit
  ], { cwd: repository, env: authorityEnv });
  const replacedTagObject = run("git", ["rev-parse", "v0.23.0^{tag}"], { cwd: repository });
  assert.notEqual(replacedTagObject, originalTagObject);
  run("git", [
    "push", "origin", "refs/tags/v0.23.0:refs/tags/v0.23.0-replacement"
  ], { cwd: repository });
  run("git", ["update-ref", "refs/tags/v0.23.0", originalTagObject, replacedTagObject], { cwd: repository });
  run("git", [
    `--git-dir=${remoteRepository}`,
    "update-ref", "refs/tags/v0.23.0", replacedTagObject, originalTagObject
  ]);
  run("git", [`--git-dir=${remoteRepository}`, "update-ref", "-d", "refs/tags/v0.23.0-replacement"]);
  run("git", ["update-ref", "refs/tags/v0.23.0", replacedTagObject, originalTagObject], {
    cwd: repository
  });
  const wrongTitleResult = runVerifier(verifierArgs("v0.23.0"));
  assert.match(wrongTitleResult.stderr, /Tag-Annotation/u);
  run("git", [
    `--git-dir=${remoteRepository}`,
    "update-ref", "refs/tags/v0.23.0", originalTagObject, replacedTagObject
  ]);
  run("git", ["update-ref", "refs/tags/v0.23.0", originalTagObject, replacedTagObject], {
    cwd: repository
  });

  run("git", [
    "tag", "--sign", "--local-user", `${signingFingerprint}!`,
    "-m", "Falsche Produktversion", "v0.23.1", releaseCommit
  ], { cwd: repository, env: authorityEnv });
  run("git", ["push", "origin", "refs/tags/v0.23.1"], { cwd: repository });
  runVerifier(verifierArgs("v0.23.1"));

  run("git", ["switch", "-c", "candidate-outside-main"], { cwd: repository });
  const candidateConfig = { ...releaseConfig, productVersion: "0.24.0" };
  writeFileSync(
    path.join(repository, "config/release.json"),
    `${JSON.stringify(candidateConfig, null, 2)}\n`,
    "utf8"
  );
  run("git", ["add", "config/release.json"], { cwd: repository });
  run("git", ["commit", "-m", "Prepare unmerged target source"], { cwd: repository });
  const unmergedCommit = run("git", ["rev-parse", "HEAD"], { cwd: repository });
  run("git", [
    "tag", "--sign", "--local-user", `${signingFingerprint}!`,
    "-m", "Nicht integrierte Quelle", "v0.24.0", unmergedCommit
  ], { cwd: repository, env: authorityEnv });
  run("git", ["push", "origin", "refs/tags/v0.24.0"], { cwd: repository });
  run("git", ["switch", "main"], { cwd: repository });
  runVerifier(verifierArgs("v0.24.0"));

  const dirtyFile = path.join(repository, "untracked.txt");
  writeFileSync(dirtyFile, "dirty\n", "utf8");
  runVerifier(verifierArgs("v0.23.0"));
  unlinkSync(dirtyFile);
} finally {
  if (gitServer && !gitServer.killed) gitServer.kill("SIGTERM");
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Target-Quell-Gate akzeptiert nur den geschützten signierten Produkt-Tag.");
