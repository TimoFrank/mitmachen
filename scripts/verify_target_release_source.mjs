import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNewTechnicalTag,
  formatTechnicalTag,
  parseProductVersion,
  releaseTitle,
  validateReleaseConfig
} from "./lib/release_policy.mjs";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseTagVerifier = path.join(projectRoot, "scripts/verify_release_tag.mjs");
const TECHNICAL_TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const FINGERPRINT_PATTERN = /^[0-9A-F]{40,64}$/u;
const FORBIDDEN_GIT_ENV_PATTERN = /^(?:GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)|GIT_(?:DIR|WORK_TREE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|REPLACE_REF_BASE))$/u;

function fail(message) {
  throw new Error(`Target-Quell-Gate: ${message}`);
}

function argument(name, { required = true, fallback = "" } = {}) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] || "" : fallback;
  if (required && !value) fail(`--${name} fehlt.`);
  return value;
}

function run(command, args, { env = process.env, input = undefined } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
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

function git(args) {
  return run("git", ["--no-replace-objects", ...args], { env: hardenedGitEnvironment() });
}

function gitProbe(args) {
  return spawnSync("git", ["--no-replace-objects", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: hardenedGitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function assertHardenedRepository(remote) {
  const rewriteResult = gitProbe([
    "config", "--show-origin", "--get-regexp", "^url\\..*\\.(insteadof|pushinsteadof)$"
  ]);
  if (rewriteResult.status === 0 && String(rewriteResult.stdout || "").trim()) {
    fail("Git-URL-Rewrite-Regeln sind für die geschützte Quellprüfung verboten.");
  }
  if (![0, 1].includes(rewriteResult.status)) fail("Die Git-Konfiguration konnte nicht sicher geprüft werden.");

  const remoteUrls = git(["config", "--get-all", `remote.${remote}.url`])
    .split("\n").map((value) => value.trim()).filter(Boolean);
  if (remoteUrls.length !== 1) fail(`Remote ${remote} muss genau eine URL besitzen.`);
  if (git(["for-each-ref", "--format=%(refname)", "refs/replace"])) {
    fail("Lokale Git-Replacement-Refs sind für die Quellprüfung verboten.");
  }
  for (const relativePath of ["info/grafts", "objects/info/alternates", "objects/info/http-alternates"]) {
    const candidate = path.resolve(process.cwd(), git(["rev-parse", "--git-path", relativePath]));
    if (existsSync(candidate)) fail(`Unerlaubte Git-Objektumleitung gefunden: ${relativePath}.`);
  }
}

function assertReleaseTitle(releaseConfig, actualTitle) {
  const version = releaseConfig.productVersion;
  const { patch } = parseProductVersion(version);
  if (patch > 0) {
    const expected = releaseTitle(version, "hotfix", { policy: releaseConfig.policy });
    if (actualTitle !== expected) fail(`Die Tag-Annotation muss exakt ${JSON.stringify(expected)} lauten.`);
    return actualTitle;
  }

  const marker = "__VK_RELEASE_THEME__";
  const template = releaseTitle(version, "weekly", { theme: marker, policy: releaseConfig.policy });
  if (!template.includes(marker)) {
    if (actualTitle !== template) fail(`Die Tag-Annotation muss exakt ${JSON.stringify(template)} lauten.`);
    return actualTitle;
  }
  const [prefix, suffix] = template.split(marker);
  if (!actualTitle.startsWith(prefix) || !actualTitle.endsWith(suffix)) {
    fail("Die Tag-Annotation verletzt den freigegebenen Release-Titelvertrag.");
  }
  const theme = actualTitle.slice(prefix.length, actualTitle.length - suffix.length).trim();
  if (!theme) fail("Die Tag-Annotation benötigt ein nicht leeres Leitthema.");
  return actualTitle;
}

function normalizeSha(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) fail(`${label} ist keine vollständige Git-SHA.`);
  return normalized;
}

function normalizeFingerprint(value) {
  const normalized = String(value || "").replaceAll(/\s+/gu, "").toUpperCase();
  if (!FINGERPRINT_PATTERN.test(normalized)) fail("Der erwartete Signer-Fingerprint ist ungültig.");
  return normalized;
}

function remoteRefSha(remote, ref, { refsOnly = true } = {}) {
  const args = ["ls-remote"];
  if (refsOnly) args.push("--refs");
  args.push(remote, ref);
  const matches = git(args)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/u))
    .filter((fields) => fields.length === 2 && fields[1] === ref);
  if (matches.length !== 1) fail(`Remote ${remote} muss genau die Referenz ${ref} liefern.`);
  return normalizeSha(matches[0][0], `Remote-Referenz ${ref}`);
}

function verifyPublicKey({ publicKeyFile, fingerprint, gnupgHome, releaseTag, releaseTitleValue, sourceRevision, tagObjectSha }) {
  let keyStats;
  try {
    keyStats = lstatSync(publicKeyFile);
  } catch {
    fail("Die öffentliche Trust-Anchor-Datei ist nicht lesbar.");
  }
  if (keyStats.isSymbolicLink() || !keyStats.isFile() || keyStats.size < 1 || keyStats.size > 1024 * 1024) {
    fail("Die öffentliche Trust-Anchor-Datei besitzt keine zulässige Größe.");
  }
  const importResult = spawnSync("gpg", ["--batch", "--import", publicKeyFile], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (importResult.status !== 0) fail("Der öffentliche Release-Signierschlüssel konnte nicht importiert werden.");
  const secretKeyResult = spawnSync("gpg", ["--batch", "--with-colons", "--list-secret-keys"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: gnupgHome },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (secretKeyResult.status !== 0 || /^(?:sec|ssb):/mu.test(String(secretKeyResult.stdout || ""))) {
    fail("Der Target-Trust-Anchor darf kein privates Schlüsselmaterial enthalten.");
  }

  const verifierResult = spawnSync(process.execPath, [
    releaseTagVerifier,
    "--tag", releaseTag,
    "--commit-sha", sourceRevision,
    "--fingerprint", fingerprint,
    "--expected-title", releaseTitleValue,
    "--remote-tag-object-sha", tagObjectSha
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: hardenedGitEnvironment({ GNUPGHOME: gnupgHome }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (verifierResult.status !== 0) fail("Die Signatur oder Objektbindung des Release-Tags ist ungültig.");
  let verification;
  try {
    verification = JSON.parse(String(verifierResult.stdout || "").trim());
  } catch {
    fail("Der Release-Tag-Verifier lieferte keinen gültigen Nachweis.");
  }
  if (
    verification.tag !== releaseTag
    || verification.tagObjectSha !== tagObjectSha
    || verification.commitSha !== sourceRevision
    || verification.signerFingerprint !== fingerprint
    || verification.verified !== true
  ) {
    fail("Der Release-Tag-Verifier lieferte einen widersprüchlichen Nachweis.");
  }
}

const releaseTag = argument("tag");
const remote = argument("remote", { required: false, fallback: "origin" });
const expectedRepositoryUrl = normalizeRepositoryUrl(argument("expected-repository-url"));
const publicKeyFile = path.resolve(argument("public-key-file"));
const expectedFingerprint = normalizeFingerprint(argument("fingerprint"));
const output = path.resolve(argument("output"));

assertNoInjectedGitConfiguration();
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(remote)) fail("Der Remote-Name ist ungültig.");
if (!TECHNICAL_TAG_PATTERN.test(releaseTag)) fail("Nur vollständige Produkt-Tags vX.Y.Z sind zulässig.");
assertHardenedRepository(remote);

const sourceRepository = normalizeRepositoryUrl(git(["config", "--get", `remote.${remote}.url`]));
if (sourceRepository !== expectedRepositoryUrl) {
  fail("Der konfigurierte Git-Remote entspricht nicht der geschützten Quellautorität.");
}
if (git(["status", "--porcelain", "--untracked-files=all"])) {
  fail("Der Checkout ist nicht sauber.");
}

const remoteTagRef = `refs/tags/${releaseTag}`;
const remoteTagObjectSha = remoteRefSha(remote, remoteTagRef);
const remoteCommitSha = remoteRefSha(remote, `${remoteTagRef}^{}`, { refsOnly: false });
git(["fetch", "--no-tags", remote, `refs/heads/main:refs/remotes/${remote}/main`]);
git(["fetch", "--no-tags", remote, `${remoteTagRef}:${remoteTagRef}`]);

const gateRevision = normalizeSha(git(["rev-parse", "HEAD^{commit}"]), "Quell-Gate-Commit");
const remoteMainRevision = normalizeSha(
  git(["rev-parse", `refs/remotes/${remote}/main^{commit}`]),
  "Remote-main-Commit"
);
if (gateRevision !== remoteMainRevision) {
  fail("Das Quell-Gate muss aus dem aktuellen geschützten Remote-main ausgeführt werden.");
}

const tagObjectSha = normalizeSha(git(["rev-parse", `${releaseTag}^{tag}`]), "Tagobjekt-SHA");
const sourceRevision = normalizeSha(git(["rev-parse", `${releaseTag}^{}`]), "Tag-Zielcommit");
if (tagObjectSha !== remoteTagObjectSha) fail("Lokales und entferntes Tagobjekt unterscheiden sich.");
if (sourceRevision !== remoteCommitSha) {
  fail("Release-Tag und Remote-Zielcommit stimmen nicht überein.");
}
git(["merge-base", "--is-ancestor", sourceRevision, `refs/remotes/${remote}/main`]);

let releaseConfig;
try {
  releaseConfig = validateReleaseConfig(JSON.parse(
    git(["show", `${sourceRevision}:config/release.json`])
  ));
} catch (error) {
  fail(`Der getaggte Quellstand besitzt keinen gültigen Release-Vertrag (${error.message}).`);
}
assertNewTechnicalTag(releaseTag, { policy: releaseConfig.policy });
const expectedTag = formatTechnicalTag(releaseConfig.productVersion);
if (releaseTag !== expectedTag) {
  fail(`${releaseTag} stimmt nicht mit der zentralen Produktversion ${releaseConfig.productVersion} überein.`);
}
const releaseTitleValue = assertReleaseTitle(
  releaseConfig,
  git(["for-each-ref", "--format=%(contents:subject)", remoteTagRef])
);

const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const gnupgHome = mkdtempSync(path.join(shortTempRoot, "vk-target-release-gnupg-"));
chmodSync(gnupgHome, 0o700);
try {
  verifyPublicKey({
    publicKeyFile,
    fingerprint: expectedFingerprint,
    gnupgHome,
    releaseTag,
    releaseTitleValue,
    sourceRevision,
    tagObjectSha
  });
} finally {
  rmSync(gnupgHome, { recursive: true, force: true });
}

const evidence = {
  schemaVersion: "versorgungs-kompass-target-source/v1",
  sourceRepository,
  gateRevision,
  releaseTag,
  productVersion: releaseConfig.productVersion,
  tagObjectSha,
  sourceRevision,
  signerFingerprint: expectedFingerprint,
  tagSignatureVerified: true,
  remote,
  mainRef: `refs/remotes/${remote}/main`,
  verified: true
};

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence));
