import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceVerifier = path.join(projectRoot, "scripts/verify_target_release_source.mjs");
const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const FORBIDDEN_GIT_ENV_PATTERN = /^(?:GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)|GIT_(?:DIR|WORK_TREE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|REPLACE_REF_BASE))$/u;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_GIT_OBJECTS = 250_000;
const MAX_GIT_OBJECT_BYTES = 256 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

function fail(message) {
  throw new Error(`Quellübergabe-Paket: ${message}`);
}

function argument(name, { required = true, fallback = "" } = {}) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] || "" : fallback;
  if (required && !value) fail(`--${name} fehlt.`);
  return value;
}

function run(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    fail(`${command} ${args[0] || ""} ist fehlgeschlagen.`.trim());
  }
}

function hardenedGitEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (FORBIDDEN_GIT_ENV_PATTERN.test(key)) delete env[key];
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_TERMINAL_PROMPT: "0"
  };
}

function assertNoInjectedGitConfiguration() {
  const injected = Object.keys(process.env).filter((key) => FORBIDDEN_GIT_ENV_PATTERN.test(key));
  if (injected.length) fail(`Unerlaubte Git-Umgebungssteuerung: ${injected.sort().join(", ")}.`);
}

function git(args, options = {}) {
  return run("git", ["--no-replace-objects", ...args], {
    ...options,
    env: hardenedGitEnvironment(options.env || {})
  });
}

function gitProbe(args, { cwd = process.cwd() } = {}) {
  return spawnSync("git", ["--no-replace-objects", ...args], {
    cwd,
    encoding: "utf8",
    env: hardenedGitEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function assertNoUrlRewrites() {
  const result = gitProbe([
    "config", "--show-origin", "--get-regexp", "^url\\..*\\.(insteadof|pushinsteadof)$"
  ]);
  if (result.status === 0 && String(result.stdout || "").trim()) {
    fail("Git-URL-Rewrite-Regeln sind für die geschützte Quellübergabe verboten.");
  }
  if (![0, 1].includes(result.status)) fail("Die Git-Konfiguration konnte nicht sicher geprüft werden.");
}

function sha256File(file, { maxSize = MAX_BUNDLE_BYTES } = {}) {
  const before = lstatSync(file);
  if (before.isSymbolicLink() || !before.isFile() || before.size < 1 || before.size > maxSize) {
    fail("Eine zu hashende Datei besitzt keine zulässige Form oder Größe.");
  }
  const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let total = 0;
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail("Eine zu hashende Datei wurde während der Prüfung ausgetauscht.");
    }
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      total += bytesRead;
      if (total > maxSize) fail("Eine zu hashende Datei überschreitet die zulässige Größe.");
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
    if (total !== opened.size) fail("Eine zu hashende Datei wurde während der Prüfung verändert.");
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function assertRegularFile(file, label, { maxSize = Number.MAX_SAFE_INTEGER } = {}) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${label} muss eine reguläre Datei sein.`);
  if (stats.size < 1 || stats.size > maxSize) fail(`${label} besitzt keine zulässige Größe.`);
}

function assertRepositoryMechanics(repository, label) {
  if (git([`--git-dir=${repository}`, "for-each-ref", "--format=%(refname)", "refs/replace"])) {
    fail(`${label} enthält unerlaubte Replacement-Refs.`);
  }
  for (const relativePath of ["info/grafts", "objects/info/alternates", "objects/info/http-alternates"]) {
    const candidate = path.resolve(git([`--git-dir=${repository}`, "rev-parse", "--git-path", relativePath]));
    if (existsSync(candidate)) fail(`${label} enthält eine unerlaubte Git-Objektumleitung (${relativePath}).`);
  }
}

function assertClosedObjectDatabase(repository, label) {
  const fsck = gitProbe([
    `--git-dir=${repository}`, "fsck", "--strict", "--full", "--no-reflogs", "--unreachable"
  ]);
  const fsckOutput = `${fsck.stdout || ""}\n${fsck.stderr || ""}`;
  if (fsck.status !== 0) fail(`${label} verletzt die Git-Objektintegrität.`);
  if (/\b(?:dangling|unreachable)\s+(?:blob|tree|commit|tag)\b/iu.test(fsckOutput)) {
    fail(`${label} enthält nicht erreichbare Zusatzobjekte.`);
  }

  const inventory = git([
    `--git-dir=${repository}`,
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objecttype) %(objectsize)"
  ]).split("\n").map((line) => line.trim()).filter(Boolean);
  if (inventory.length > MAX_GIT_OBJECTS) fail(`${label} überschreitet die zulässige Objektzahl.`);
  for (const line of inventory) {
    const match = line.match(/^(?:blob|tree|commit|tag) (\d+)$/u);
    if (!match) fail(`${label} besitzt ein nicht inventarisierbares Git-Objekt.`);
    if (Number(match[1]) > MAX_GIT_OBJECT_BYTES) fail(`${label} enthält ein übergroßes Git-Objekt.`);
  }
}

function readRefInventory(repository) {
  const lines = git([
    `--git-dir=${repository}`,
    "for-each-ref",
    "--format=%(objectname) %(refname)",
    "refs"
  ]).split("\n").map((line) => line.trim()).filter(Boolean);
  const refs = {};
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{40}) (refs\/.+)$/u);
    if (!match || refs[match[2]]) fail("Das Ref-Inventar ist nicht eindeutig.");
    refs[match[2]] = match[1];
  }
  const branchRefs = Object.keys(refs).filter((ref) => ref.startsWith("refs/heads/"));
  if (JSON.stringify(branchRefs) !== JSON.stringify(["refs/heads/main"])) {
    fail("Das Paket darf genau die führende Branch-Referenz refs/heads/main enthalten.");
  }
  if (!Object.keys(refs).some((ref) => ref.startsWith("refs/tags/"))) {
    fail("Das Paket muss die vollständige Tag-Historie enthalten.");
  }
  const forbiddenRefs = Object.keys(refs).filter((ref) => !/^refs\/(?:heads\/main|tags\/[A-Za-z0-9._-]+)$/u.test(ref));
  if (forbiddenRefs.length) {
    fail(`Das Paket enthält unerlaubte Git-Referenzen außerhalb von main und Tags: ${forbiddenRefs.join(", ")}.`);
  }
  return Object.fromEntries(Object.entries(refs).sort(([left], [right]) => left.localeCompare(right)));
}

function signChecksums(checksumsPath, signaturePath, fingerprint) {
  const result = spawnSync("gpg", [
    "--batch", "--yes", "--armor", "--local-user", `${fingerprint}!`,
    "--detach-sign", "--output", signaturePath, checksumsPath
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) fail("SHA256SUMS konnte nicht mit dem externen Release-Signierschlüssel signiert werden.");
}

function verifyDetachedSignature({ publicKeyFile, fingerprint, signaturePath, checksumsPath, gnupgHome }) {
  mkdirSync(gnupgHome, { mode: 0o700 });
  const importResult = spawnSync("gpg", ["--batch", "--import", publicKeyFile], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (importResult.status !== 0) fail("Der öffentliche Release-Signierschlüssel konnte nicht geprüft werden.");
  const secretResult = spawnSync("gpg", ["--batch", "--with-colons", "--list-secret-keys"], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (secretResult.status !== 0 || /^(?:sec|ssb):/mu.test(String(secretResult.stdout || ""))) {
    fail("Der paketierte Trust Anchor darf kein privates Schlüsselmaterial enthalten.");
  }
  const verifyResult = spawnSync("gpg", [
    "--batch", "--status-fd", "1", "--verify", signaturePath, checksumsPath
  ], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const status = `${verifyResult.stdout || ""}\n${verifyResult.stderr || ""}`;
  const fingerprints = [...status.matchAll(/\[GNUPG:\]\s+VALIDSIG\s+([0-9A-F]+)/giu)]
    .map((match) => match[1].toUpperCase());
  if (verifyResult.status !== 0 || fingerprints.length !== 1 || fingerprints[0] !== fingerprint) {
    fail("Die Paket-Checksummen besitzen keine gültige Signatur des erwarteten Signing-Subkeys.");
  }
}

const releaseTag = argument("tag");
const sourceRemote = argument("source-remote", { required: false, fallback: "origin" });
const expectedRepositoryUrl = normalizeRepositoryUrl(argument("expected-repository-url"));
const publicKeyFile = path.resolve(argument("public-key-file"));
const fingerprint = argument("fingerprint").replaceAll(/\s+/gu, "").toUpperCase();
const outputDirectory = path.resolve(argument("output-dir"));

assertNoInjectedGitConfiguration();
if (!TAG_PATTERN.test(releaseTag)) fail("Nur vollständige Produkt-Tags vX.Y.Z sind zulässig.");
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(sourceRemote)) fail("Der Source-Remote-Name ist ungültig.");
if (!/^[0-9A-F]{40,64}$/u.test(fingerprint)) fail("Der Signer-Fingerprint ist ungültig.");
assertRegularFile(publicKeyFile, "Öffentlicher Release-Signierschlüssel", { maxSize: 1024 * 1024 });
assertNoUrlRewrites();

if (existsSync(outputDirectory)) {
  if (!lstatSync(outputDirectory).isDirectory() || readdirSync(outputDirectory).length) {
    fail("Das Ausgabeverzeichnis muss neu oder leer sein.");
  }
} else {
  mkdirSync(outputDirectory, { recursive: true });
}

const rawSourceUrl = git(["config", "--get", `remote.${sourceRemote}.url`]);
const sourceRepository = normalizeRepositoryUrl(rawSourceUrl);
if (sourceRepository !== expectedRepositoryUrl) {
  fail("Der Source-Remote entspricht nicht der geschützten Quellautorität.");
}

const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const temporaryRoot = mkdtempSync(path.join(shortTempRoot, "vk-source-handoff-"));
const sourceVerificationPath = path.join(temporaryRoot, "source-tag-verification.json");
const bareRepository = path.join(temporaryRoot, "source.git");
const emptyVerificationRepository = path.join(temporaryRoot, "bundle-verification.git");
const importedRepository = path.join(temporaryRoot, "bundle-import.git");
const bundleName = `versorgungs-kompass-${releaseTag}-source.bundle`;
const bundlePath = path.join(outputDirectory, bundleName);
const manifestPath = path.join(outputDirectory, "handoff-manifest.json");
const packagedPublicKeyPath = path.join(outputDirectory, "release-signing-public-key.asc");
const checksumsPath = path.join(outputDirectory, "SHA256SUMS");
const checksumsSignaturePath = path.join(outputDirectory, "SHA256SUMS.asc");

try {
  run(process.execPath, [
    sourceVerifier,
    "--tag", releaseTag,
    "--remote", sourceRemote,
    "--expected-repository-url", expectedRepositoryUrl,
    "--public-key-file", publicKeyFile,
    "--fingerprint", fingerprint,
    "--output", sourceVerificationPath
  ]);
  const sourceVerification = JSON.parse(readFileSync(sourceVerificationPath, "utf8"));

  git(["init", "--bare", bareRepository]);
  git([
    `--git-dir=${bareRepository}`,
    "fetch",
    "--no-tags",
    rawSourceUrl,
    "+refs/heads/main:refs/heads/main",
    "+refs/tags/*:refs/tags/*"
  ]);
  const refs = readRefInventory(bareRepository);
  if (refs["refs/heads/main"] !== sourceVerification.gateRevision) {
    fail("Das frisch geladene main entspricht nicht dem verifizierten Quell-Gate.");
  }
  if (refs[`refs/tags/${releaseTag}`] !== sourceVerification.tagObjectSha) {
    fail("Das frisch geladene Tagobjekt entspricht nicht dem Signaturnachweis.");
  }
  if (git([`--git-dir=${bareRepository}`, "rev-parse", `${releaseTag}^{}`]) !== sourceVerification.sourceRevision) {
    fail("Der frisch geladene Tag-Zielcommit entspricht nicht dem Signaturnachweis.");
  }
  git([`--git-dir=${bareRepository}`, "fsck", "--strict", "--full"]);
  assertRepositoryMechanics(bareRepository, "Das frisch geladene Quell-Repository");
  assertClosedObjectDatabase(bareRepository, "Das frisch geladene Quell-Repository");

  const refsToBundle = Object.keys(refs);
  git([`--git-dir=${bareRepository}`, "bundle", "create", bundlePath, ...refsToBundle]);
  assertRegularFile(bundlePath, "Git-Bundle", { maxSize: MAX_BUNDLE_BYTES });

  git(["init", "--bare", emptyVerificationRepository]);
  git([`--git-dir=${emptyVerificationRepository}`, "bundle", "verify", bundlePath]);
  git(["clone", "--mirror", bundlePath, importedRepository]);
  git([`--git-dir=${importedRepository}`, "fsck", "--strict", "--full"]);
  assertRepositoryMechanics(importedRepository, "Das testweise importierte Bundle");
  assertClosedObjectDatabase(importedRepository, "Das testweise importierte Bundle");
  const importedRefs = readRefInventory(importedRepository);
  if (JSON.stringify(importedRefs) !== JSON.stringify(refs)) {
    fail("Das importierte Bundle besitzt ein abweichendes Ref-Inventar.");
  }

  copyFileSync(publicKeyFile, packagedPublicKeyPath);
  assertRegularFile(packagedPublicKeyPath, "Paketierter öffentlicher Release-Signierschlüssel", {
    maxSize: 1024 * 1024
  });
  const bundleSha256 = sha256File(bundlePath);
  const publicKeySha256 = sha256File(packagedPublicKeyPath, { maxSize: 1024 * 1024 });
  const releaseTitleValue = git([
    `--git-dir=${bareRepository}`, "for-each-ref", "--format=%(contents:subject)", `refs/tags/${releaseTag}`
  ]);
  const manifest = {
    schemaVersion: "versorgungs-kompass-source-handoff/v1",
    sourceRepository,
    transferMode: "complete-git-bundle",
    leadingBranch: "refs/heads/main",
    singleWriterRequired: true,
    bidirectionalSyncAllowed: false,
    releaseTag,
    releaseTitle: releaseTitleValue,
    productVersion: sourceVerification.productVersion,
    tagObjectSha: sourceVerification.tagObjectSha,
    sourceRevision: sourceVerification.sourceRevision,
    signerFingerprint: sourceVerification.signerFingerprint,
    tagSignatureVerified: true,
    refs,
    bundle: {
      file: bundleName,
      sha256: `sha256:${bundleSha256}`,
      prerequisites: []
    },
    trustAnchor: {
      file: "release-signing-public-key.asc",
      sha256: `sha256:${publicKeySha256}`,
      confirmation: "out-of-band-required"
    },
    forbiddenSidecars: [
      "workspace-archive",
      "pages-artifacts",
      "private-gke-artifacts",
      "personal-values",
      "secrets",
      "data",
      "oidc-subjects"
    ]
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const checksumLines = [
    [bundleSha256, bundleName],
    [sha256File(manifestPath, { maxSize: 1024 * 1024 }), "handoff-manifest.json"],
    [publicKeySha256, "release-signing-public-key.asc"]
  ].sort((left, right) => left[1].localeCompare(right[1]));
  writeFileSync(
    checksumsPath,
    `${checksumLines.map(([digest, name]) => `${digest}  ${name}`).join("\n")}\n`,
    "utf8"
  );
  signChecksums(checksumsPath, checksumsSignaturePath, fingerprint);
  assertRegularFile(checksumsSignaturePath, "Signatur der Paket-Checksummen", { maxSize: 1024 * 1024 });
  verifyDetachedSignature({
    publicKeyFile: packagedPublicKeyPath,
    fingerprint,
    signaturePath: checksumsSignaturePath,
    checksumsPath,
    gnupgHome: path.join(temporaryRoot, "package-signature-verification-gnupg")
  });

  const actualFiles = readdirSync(outputDirectory).sort();
  const expectedFiles = [
    bundleName,
    "SHA256SUMS",
    "SHA256SUMS.asc",
    "handoff-manifest.json",
    "release-signing-public-key.asc"
  ].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail("Das Quellübergabe-Paket enthält unerwartete Dateien.");
  }
  for (const name of actualFiles) assertRegularFile(path.join(outputDirectory, name), name);

  console.log(JSON.stringify({
    outputDirectory,
    releaseTag,
    tagObjectSha: sourceVerification.tagObjectSha,
    sourceRevision: sourceVerification.sourceRevision,
    bundleSha256: `sha256:${bundleSha256}`,
    refCount: Object.keys(refs).length,
    packaged: true
  }));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
