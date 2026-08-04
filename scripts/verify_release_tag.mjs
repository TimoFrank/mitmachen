import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

function argument(name, { required = true } = {}) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] || "" : "";
  if (required && !value) throw new Error(`--${name} fehlt.`);
  return value;
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function gitSucceeds(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "ignore", "ignore"]
  });
  return result.status === 0;
}

function normalizeFingerprint(value) {
  const normalized = String(value || "").replaceAll(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-F]{40,64}$/.test(normalized)) {
    throw new Error("Der erwartete Signer-Fingerprint ist ungueltig.");
  }
  return normalized;
}

function assertSha(value, label) {
  const normalized = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error(`${label} ist keine vollstaendige Git-SHA.`);
  return normalized;
}

function assertDedicatedSigningSubkey(expectedFingerprint) {
  const result = spawnSync("gpg", [
    "--batch",
    "--with-colons",
    "--with-subkey-fingerprint",
    "--list-keys"
  ], {
    encoding: "utf8",
    env: process.env
  });
  if (result.status !== 0) throw new Error("Der oeffentliche Release-Signierschluessel ist nicht lesbar.");

  const primaryKeys = [];
  const signingSubkeys = [];
  let pendingSigningSubkey = null;
  for (const line of String(result.stdout || "").split("\n")) {
    const fields = line.split(":");
    if (fields[0] === "pub") {
      // GnuPG uses uppercase capabilities on a Primary record for aggregate
      // abilities supplied by subkeys. Direct Primary capabilities are lowercase.
      const capabilities = String(fields[11] || "");
      primaryKeys.push({ canCertify: capabilities.includes("c"), canSign: capabilities.includes("s") });
      pendingSigningSubkey = null;
    } else if (fields[0] === "sub") {
      const capabilities = String(fields[11] || "").toLowerCase();
      pendingSigningSubkey = capabilities.includes("s")
        ? { algorithm: fields[3], curve: String(fields[16] || "").toLowerCase() }
        : null;
    } else if (fields[0] === "fpr" && pendingSigningSubkey) {
      signingSubkeys.push({
        ...pendingSigningSubkey,
        fingerprint: String(fields[9] || "").toUpperCase()
      });
      pendingSigningSubkey = null;
    }
  }
  if (primaryKeys.length !== 1 || !primaryKeys[0].canCertify || primaryKeys[0].canSign) {
    throw new Error("Der Release-Primary-Key muss cert-only sein und darf nicht signieren.");
  }
  if (
    signingSubkeys.length !== 1
    || signingSubkeys[0].fingerprint !== expectedFingerprint
    || signingSubkeys[0].algorithm !== "22"
    || signingSubkeys[0].curve !== "ed25519"
  ) {
    throw new Error("Der Release-Key braucht genau einen dedizierten Ed25519-Signing-Subkey mit dem erwarteten Fingerprint.");
  }
}

function verifyTagSignature(tag, expectedFingerprint) {
  const result = spawnSync("git", ["verify-tag", "--raw", tag], {
    encoding: "utf8",
    env: process.env
  });
  const status = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`git verify-tag ist fuer ${tag} fehlgeschlagen.`);
  }
  const fingerprints = [...status.matchAll(/\[GNUPG:\]\s+VALIDSIG\s+([0-9A-F]+)/giu)]
    .map((match) => match[1].toUpperCase());
  if (fingerprints.length !== 1) {
    throw new Error(`${tag} enthaelt nicht genau eine gueltige OpenPGP-Signatur.`);
  }
  if (fingerprints[0] !== expectedFingerprint) {
    throw new Error(`Der Signer-Fingerprint von ${tag} entspricht nicht dem erwarteten Fingerprint.`);
  }
  return fingerprints[0];
}

function verifyGithubPayload(path, expected) {
  const payload = JSON.parse(readFileSync(path, "utf8"));
  if (payload.tag !== expected.tag) throw new Error("GitHub meldet einen abweichenden Tagnamen.");
  if (String(payload.sha || "").toLowerCase() !== expected.tagObjectSha) {
    throw new Error("GitHub meldet einen abweichenden Tagobjekt-SHA.");
  }
  if (payload.object?.type !== "commit") throw new Error("Das GitHub-Tagobjekt zeigt nicht direkt auf einen Commit.");
  if (String(payload.object?.sha || "").toLowerCase() !== expected.commitSha) {
    throw new Error("Das GitHub-Tagobjekt zeigt auf einen abweichenden Commit.");
  }
  if (payload.verification?.verified !== true || payload.verification?.reason !== "valid") {
    throw new Error("GitHub hat die Signatur des Tagobjekts nicht als valid verifiziert.");
  }
  if (typeof payload.verification?.signature !== "string" || !payload.verification.signature.trim()) {
    throw new Error("GitHub liefert keine Signatur fuer das Tagobjekt.");
  }
  if (typeof payload.verification?.verified_at !== "string" || !payload.verification.verified_at.trim()) {
    throw new Error("GitHub liefert keinen Verifikationszeitpunkt fuer das Tagobjekt.");
  }
}

function verifyPublishedReleaseMetadata(path, expected) {
  const payload = JSON.parse(readFileSync(path, "utf8"));
  if (payload.tagName !== expected.tag) throw new Error("Die GitHub-Release-Metadaten nennen einen abweichenden Tag.");
  if (expected.title && payload.name !== expected.title) {
    throw new Error("Die GitHub-Release-Metadaten nennen einen abweichenden Titel.");
  }
  if (
    payload.isDraft !== false
    || payload.isPrerelease !== true
    || payload.isImmutable !== true
    || payload.isLatest !== false
  ) {
    throw new Error("Der veroeffentlichte Baseline-Release muss finaler, unveraenderlicher Prerelease und nicht Latest sein.");
  }
}

const tag = argument("tag");
const commitSha = assertSha(argument("commit-sha"), "Der erwartete Release-Commit");
const expectedFingerprint = normalizeFingerprint(argument("fingerprint"));
const expectedTitle = argument("expected-title", { required: false });
const remoteTagObject = argument("remote-tag-object-sha", { required: false });
const githubVerificationPath = argument("github-verification-json", { required: false });
const publishedReleaseMetadataPath = argument("published-release-metadata-json", { required: false });

if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Ungueltiger Produkt-Tag: ${tag}`);
assertDedicatedSigningSubkey(expectedFingerprint);
if (!gitSucceeds(["show-ref", "--verify", `refs/tags/${tag}`])) throw new Error(`Tag ${tag} fehlt.`);

const objectType = git(["cat-file", "-t", tag]);
if (objectType !== "tag") throw new Error(`${tag} ist kein annotiertes Tagobjekt.`);

const tagObjectSha = assertSha(git(["rev-parse", `${tag}^{tag}`]), "Der Tagobjekt-SHA");
const resolvedCommit = assertSha(git(["rev-parse", `${tag}^{}`]), "Der aufgeloeste Tag-Commit");
if (resolvedCommit !== commitSha) {
  throw new Error(`${tag} zeigt auf ${resolvedCommit} statt auf ${commitSha}.`);
}

const tagObject = git(["cat-file", "-p", tag]);
const header = tagObject.split("\n\n", 1)[0].split("\n");
const objectHeader = header.find((line) => line.startsWith("object "))?.slice("object ".length).toLowerCase();
const typeHeader = header.find((line) => line.startsWith("type "))?.slice("type ".length);
const tagHeader = header.find((line) => line.startsWith("tag "))?.slice("tag ".length);
if (objectHeader !== commitSha || typeHeader !== "commit" || tagHeader !== tag) {
  throw new Error(`Die Header des Tagobjekts ${tag} sind nicht konsistent.`);
}

if (expectedTitle) {
  const actualTitle = git(["for-each-ref", "--format=%(contents:subject)", `refs/tags/${tag}`]);
  if (actualTitle !== expectedTitle) throw new Error(`Die Annotation von ${tag} entspricht nicht dem Release-Titel.`);
}

const signerFingerprint = verifyTagSignature(tag, expectedFingerprint);

if (remoteTagObject) {
  const normalizedRemoteObject = assertSha(remoteTagObject, "Der Remote-Tagobjekt-SHA");
  if (normalizedRemoteObject !== tagObjectSha) {
    throw new Error(`Remote und lokales Tagobjekt fuer ${tag} unterscheiden sich.`);
  }
}

if (githubVerificationPath) {
  verifyGithubPayload(githubVerificationPath, { tag, tagObjectSha, commitSha });
}
if (publishedReleaseMetadataPath) {
  verifyPublishedReleaseMetadata(publishedReleaseMetadataPath, { tag, title: expectedTitle });
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `tag_object_sha=${tagObjectSha}\ncommit_sha=${commitSha}\nsigner_fingerprint=${signerFingerprint}\n`,
    "utf8"
  );
}

console.log(JSON.stringify({
  tag,
  tagObjectSha,
  commitSha,
  signerFingerprint,
  verified: true
}));
