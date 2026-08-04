import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatTechnicalTag,
  parseProductVersion,
  releaseTitle,
  validateReleaseConfig
} from "./lib/release_policy.mjs";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseTagVerifier = path.join(projectRoot, "scripts/verify_release_tag.mjs");
const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FORBIDDEN_SIDECARS = [
  "workspace-archive",
  "pages-artifacts",
  "private-gke-artifacts",
  "personal-values",
  "secrets",
  "data",
  "oidc-subjects"
];
const FORBIDDEN_GIT_ENV_PATTERN = /^(?:GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)|GIT_(?:DIR|WORK_TREE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|REPLACE_REF_BASE))$/u;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_GIT_OBJECTS = 250_000;
const MAX_GIT_OBJECT_BYTES = 256 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

function fail(message) {
  throw new Error(`Quellübergabe-Prüfung: ${message}`);
}

function argument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] || "" : "";
  if (!value) fail(`--${name} fehlt.`);
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

function gitProbe(args) {
  return spawnSync("git", ["--no-replace-objects", ...args], {
    encoding: "utf8",
    env: hardenedGitEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} muss ein Objekt sein.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${label} verletzt den geschlossenen Vertrag.`);
  }
}

function assertRegularFile(file, label, { maxSize = Number.MAX_SAFE_INTEGER } = {}) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > maxSize) {
    fail(`${label} muss eine reguläre Datei zulässiger Größe sein.`);
  }
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

function assertRepositoryMechanics(repository, label) {
  if (git([`--git-dir=${repository}`, "for-each-ref", "--format=%(refname)", "refs/replace"])) {
    fail(`${label} enthält unerlaubte Replacement-Refs.`);
  }
  for (const relativePath of ["info/grafts", "objects/info/alternates", "objects/info/http-alternates"]) {
    const candidate = path.resolve(git([`--git-dir=${repository}`, "rev-parse", "--git-path", relativePath]));
    try {
      lstatSync(candidate);
      fail(`${label} enthält eine unerlaubte Git-Objektumleitung (${relativePath}).`);
    } catch (error) {
      if (String(error?.message || "").startsWith("Quellübergabe-Prüfung:")) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function assertClosedObjectDatabase(repository, label) {
  const fsck = gitProbe([
    `--git-dir=${repository}`, "fsck", "--strict", "--full", "--no-reflogs", "--unreachable"
  ]);
  const output = `${fsck.stdout || ""}\n${fsck.stderr || ""}`;
  if (fsck.status !== 0) fail(`${label} verletzt die Git-Objektintegrität.`);
  if (/\b(?:dangling|unreachable)\s+(?:blob|tree|commit|tag)\b/iu.test(output)) {
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

function assertReleaseTitle(releaseConfig, actualTitle) {
  const version = releaseConfig.productVersion;
  const { patch } = parseProductVersion(version);
  if (patch > 0) {
    const expected = releaseTitle(version, "hotfix", { policy: releaseConfig.policy });
    if (actualTitle !== expected) fail(`Die Tag-Annotation muss exakt ${JSON.stringify(expected)} lauten.`);
    return;
  }
  const marker = "__VK_RELEASE_THEME__";
  const template = releaseTitle(version, "weekly", { theme: marker, policy: releaseConfig.policy });
  if (!template.includes(marker)) {
    if (actualTitle !== template) fail(`Die Tag-Annotation muss exakt ${JSON.stringify(template)} lauten.`);
    return;
  }
  const [prefix, suffix] = template.split(marker);
  const theme = actualTitle.startsWith(prefix) && actualTitle.endsWith(suffix)
    ? actualTitle.slice(prefix.length, actualTitle.length - suffix.length).trim()
    : "";
  if (!theme) fail("Die Tag-Annotation verletzt den freigegebenen Leitthemenvertrag.");
}

function importTrustAnchorAndVerifyPackage({ publicKeyFile, fingerprint, signaturePath, checksumsPath, gnupgHome }) {
  mkdirSync(gnupgHome, { mode: 0o700 });
  const importResult = spawnSync("gpg", ["--batch", "--import", publicKeyFile], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (importResult.status !== 0) fail("Der extern bestätigte Trust Anchor konnte nicht importiert werden.");
  const secretKeyResult = spawnSync("gpg", ["--batch", "--with-colons", "--list-secret-keys"], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (secretKeyResult.status !== 0 || /^(?:sec|ssb):/mu.test(String(secretKeyResult.stdout || ""))) {
    fail("Der extern bestätigte Trust Anchor darf kein privates Schlüsselmaterial enthalten.");
  }
  const signatureResult = spawnSync("gpg", [
    "--batch", "--status-fd", "1", "--verify", signaturePath, checksumsPath
  ], {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const status = `${signatureResult.stdout || ""}\n${signatureResult.stderr || ""}`;
  const fingerprints = [...status.matchAll(/\[GNUPG:\]\s+VALIDSIG\s+([0-9A-F]+)/giu)]
    .map((match) => match[1].toUpperCase());
  if (signatureResult.status !== 0 || fingerprints.length !== 1 || fingerprints[0] !== fingerprint) {
    fail("SHA256SUMS ist nicht gültig mit dem extern bestätigten Signing-Subkey signiert.");
  }
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${label} ist kein gültiges JSON (${error.message}).`);
  }
}

function readRefInventory(repository) {
  const output = git([
    `--git-dir=${repository}`,
    "for-each-ref",
    "--format=%(objectname) %(refname)",
    "refs"
  ]);
  const refs = {};
  for (const line of output.split("\n").map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{40}) (refs\/.+)$/u);
    if (!match || refs[match[2]]) fail("Das importierte Ref-Inventar ist nicht eindeutig.");
    refs[match[2]] = match[1];
  }
  return Object.fromEntries(Object.entries(refs).sort(([left], [right]) => left.localeCompare(right)));
}

const inputDirectory = path.resolve(argument("input-dir"));
const trustedPublicKeyFile = path.resolve(argument("public-key-file"));
const expectedFingerprint = argument("fingerprint").replaceAll(/\s+/gu, "").toUpperCase();
const expectedRepositoryUrl = normalizeRepositoryUrl(argument("expected-repository-url"));
assertNoInjectedGitConfiguration();
if (!/^[0-9A-F]{40,64}$/u.test(expectedFingerprint)) fail("Der Signer-Fingerprint ist ungültig.");
assertRegularFile(trustedPublicKeyFile, "Extern bestätigter öffentlicher Schlüssel", { maxSize: 1024 * 1024 });

const manifestPath = path.join(inputDirectory, "handoff-manifest.json");
const checksumsPath = path.join(inputDirectory, "SHA256SUMS");
const packagedPublicKeyPath = path.join(inputDirectory, "release-signing-public-key.asc");
const checksumsSignaturePath = path.join(inputDirectory, "SHA256SUMS.asc");
for (const [file, label, maxSize] of [
  [manifestPath, "handoff-manifest.json", 1024 * 1024],
  [checksumsPath, "SHA256SUMS", 1024 * 1024],
  [packagedPublicKeyPath, "Paketierter öffentlicher Schlüssel", 1024 * 1024],
  [checksumsSignaturePath, "Signatur der Paket-Checksummen", 1024 * 1024]
]) {
  assertRegularFile(file, label, { maxSize });
}

// Authentisiere zuerst das unveränderliche Prüfsummenmanifest mit dem extern
// bestätigten Trust Anchor. Erst danach werden Manifestfelder, Dateinamen oder
// Hashwerte aus dem empfangenen Paket als Eingaben für weitere Prüfungen genutzt.
const signatureVerificationRoot = mkdtempSync(path.join(
  process.platform === "darwin" ? "/private/tmp" : tmpdir(),
  "vk-source-handoff-signature-"
));
try {
  importTrustAnchorAndVerifyPackage({
    publicKeyFile: trustedPublicKeyFile,
    fingerprint: expectedFingerprint,
    signaturePath: checksumsSignaturePath,
    checksumsPath,
    gnupgHome: path.join(signatureVerificationRoot, "gnupg")
  });
} finally {
  rmSync(signatureVerificationRoot, { recursive: true, force: true });
}

const manifest = readJson(manifestPath, "handoff-manifest.json");
assertExactKeys(manifest, [
  "schemaVersion",
  "sourceRepository",
  "transferMode",
  "leadingBranch",
  "singleWriterRequired",
  "bidirectionalSyncAllowed",
  "releaseTag",
  "releaseTitle",
  "productVersion",
  "tagObjectSha",
  "sourceRevision",
  "signerFingerprint",
  "tagSignatureVerified",
  "refs",
  "bundle",
  "trustAnchor",
  "forbiddenSidecars"
], "handoff-manifest.json");
assertExactKeys(manifest.bundle, ["file", "sha256", "prerequisites"], "handoff-manifest.json.bundle");
assertExactKeys(manifest.trustAnchor, ["file", "sha256", "confirmation"], "handoff-manifest.json.trustAnchor");

const releaseTag = String(manifest.releaseTag || "");
const expectedBundleName = `versorgungs-kompass-${releaseTag}-source.bundle`;
const bundlePath = path.join(inputDirectory, expectedBundleName);
if (
  manifest.schemaVersion !== "versorgungs-kompass-source-handoff/v1"
  || normalizeRepositoryUrl(manifest.sourceRepository) !== expectedRepositoryUrl
  || manifest.transferMode !== "complete-git-bundle"
  || manifest.leadingBranch !== "refs/heads/main"
  || manifest.singleWriterRequired !== true
  || manifest.bidirectionalSyncAllowed !== false
  || !TAG_PATTERN.test(releaseTag)
  || typeof manifest.releaseTitle !== "string"
  || !manifest.releaseTitle.trim()
  || manifest.releaseTag !== formatTechnicalTag(manifest.productVersion)
  || !SHA_PATTERN.test(manifest.tagObjectSha || "")
  || !SHA_PATTERN.test(manifest.sourceRevision || "")
  || manifest.signerFingerprint !== expectedFingerprint
  || manifest.tagSignatureVerified !== true
  || manifest.bundle.file !== expectedBundleName
  || !DIGEST_PATTERN.test(manifest.bundle.sha256 || "")
  || !Array.isArray(manifest.bundle.prerequisites)
  || manifest.bundle.prerequisites.length !== 0
  || manifest.trustAnchor.file !== "release-signing-public-key.asc"
  || !DIGEST_PATTERN.test(manifest.trustAnchor.sha256 || "")
  || manifest.trustAnchor.confirmation !== "out-of-band-required"
  || JSON.stringify(manifest.forbiddenSidecars) !== JSON.stringify(FORBIDDEN_SIDECARS)
) {
  fail("Das Übergabemanifest verletzt den freigegebenen Vertrag.");
}
assertExactKeys(manifest.refs, Object.keys(manifest.refs), "handoff-manifest.json.refs");
const refNames = Object.keys(manifest.refs);
if (
  JSON.stringify(refNames.filter((ref) => ref.startsWith("refs/heads/"))) !== JSON.stringify(["refs/heads/main"])
  || !refNames.includes(`refs/tags/${releaseTag}`)
  || refNames.some((ref) => !/^refs\/(?:heads\/main|tags\/[A-Za-z0-9._-]+)$/u.test(ref))
  || Object.values(manifest.refs).some((sha) => !SHA_PATTERN.test(sha))
  || manifest.refs["refs/heads/main"] === undefined
  || manifest.refs[`refs/tags/${releaseTag}`] !== manifest.tagObjectSha
) {
  fail("Das Übergabemanifest besitzt kein zulässiges Ref-Inventar.");
}

assertRegularFile(bundlePath, "Git-Bundle", { maxSize: MAX_BUNDLE_BYTES });
const actualFiles = readdirSync(inputDirectory).sort();
const expectedFiles = [
  expectedBundleName,
  "SHA256SUMS",
  "SHA256SUMS.asc",
  "handoff-manifest.json",
  "release-signing-public-key.asc"
].sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  fail("Das Übergabeverzeichnis enthält unerwartete Sidecars.");
}
for (const name of actualFiles) assertRegularFile(path.join(inputDirectory, name), name);

const expectedChecksums = new Map([
  [expectedBundleName, manifest.bundle.sha256.slice("sha256:".length)],
  ["handoff-manifest.json", sha256File(manifestPath, { maxSize: 1024 * 1024 })],
  ["release-signing-public-key.asc", manifest.trustAnchor.sha256.slice("sha256:".length)]
]);
const checksumLines = readFileSync(checksumsPath, "utf8").trimEnd().split("\n");
const parsedChecksums = new Map();
for (const line of checksumLines) {
  const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/u);
  if (!match || parsedChecksums.has(match[2])) fail("SHA256SUMS ist nicht kanonisch.");
  parsedChecksums.set(match[2], match[1]);
}
if (JSON.stringify([...parsedChecksums].sort()) !== JSON.stringify([...expectedChecksums].sort())) {
  fail("SHA256SUMS entspricht nicht dem Manifest.");
}
for (const [name, digest] of parsedChecksums) {
  const maxSize = name === expectedBundleName ? MAX_BUNDLE_BYTES : 1024 * 1024;
  if (sha256File(path.join(inputDirectory, name), { maxSize }) !== digest) {
    fail(`${name} stimmt nicht mit SHA256SUMS überein.`);
  }
}
if (!readFileSync(packagedPublicKeyPath).equals(readFileSync(trustedPublicKeyFile))) {
  fail("Der paketierte öffentliche Schlüssel entspricht nicht dem extern bestätigten Trust Anchor.");
}

const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const temporaryRoot = mkdtempSync(path.join(shortTempRoot, "vk-source-handoff-verify-"));
const emptyRepository = path.join(temporaryRoot, "empty.git");
const importedRepository = path.join(temporaryRoot, "imported.git");
const gnupgHome = path.join(temporaryRoot, "gnupg");
try {
  importTrustAnchorAndVerifyPackage({
    publicKeyFile: trustedPublicKeyFile,
    fingerprint: expectedFingerprint,
    signaturePath: checksumsSignaturePath,
    checksumsPath,
    gnupgHome
  });
  git(["init", "--bare", emptyRepository]);
  git([`--git-dir=${emptyRepository}`, "bundle", "verify", bundlePath]);
  git(["clone", "--mirror", bundlePath, importedRepository]);
  git([`--git-dir=${importedRepository}`, "fsck", "--strict", "--full"]);
  assertRepositoryMechanics(importedRepository, "Das importierte Übergabe-Repository");
  assertClosedObjectDatabase(importedRepository, "Das importierte Übergabe-Repository");
  const importedRefs = readRefInventory(importedRepository);
  if (JSON.stringify(importedRefs) !== JSON.stringify(manifest.refs)) {
    fail("Bundle und Manifest besitzen unterschiedliche Ref-Inventare.");
  }
  if (git([`--git-dir=${importedRepository}`, "rev-parse", `${releaseTag}^{}`]) !== manifest.sourceRevision) {
    fail("Der importierte Release-Tag zeigt auf einen abweichenden Commit.");
  }
  git([
    `--git-dir=${importedRepository}`,
    "merge-base",
    "--is-ancestor",
    manifest.sourceRevision,
    "refs/heads/main"
  ]);

  const tagResult = spawnSync(process.execPath, [
    releaseTagVerifier,
    "--tag", releaseTag,
    "--commit-sha", manifest.sourceRevision,
    "--fingerprint", expectedFingerprint,
    "--expected-title", manifest.releaseTitle,
    "--remote-tag-object-sha", manifest.tagObjectSha
  ], {
    cwd: importedRepository,
    encoding: "utf8",
    env: hardenedGitEnvironment({ GNUPGHOME: gnupgHome }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (tagResult.status !== 0) fail("Die Signaturprüfung des importierten Tagobjekts ist fehlgeschlagen.");

  let taggedConfig;
  try {
    taggedConfig = validateReleaseConfig(JSON.parse(git([
      `--git-dir=${importedRepository}`,
      "show",
      `${manifest.sourceRevision}:config/release.json`
    ])));
  } catch (error) {
    fail(`Der importierte Quellstand besitzt keinen gültigen Release-Vertrag (${error.message}).`);
  }
  if (
    taggedConfig.productVersion !== manifest.productVersion
    || formatTechnicalTag(taggedConfig.productVersion) !== releaseTag
  ) {
    fail("Produktversion, Manifest und importierter Release-Tag stimmen nicht überein.");
  }
  assertReleaseTitle(taggedConfig, manifest.releaseTitle);

  console.log(JSON.stringify({
    releaseTag,
    tagObjectSha: manifest.tagObjectSha,
    sourceRevision: manifest.sourceRevision,
    mainRevision: manifest.refs["refs/heads/main"],
    signerFingerprint: expectedFingerprint,
    bundleSha256: manifest.bundle.sha256,
    refCount: refNames.length,
    verified: true
  }));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
