#!/usr/bin/env node

import crypto from "node:crypto";
import {
  chmod,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MAX_ATTESTATION_AGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SECRET_NAMES = Object.freeze([
  "restic-repository",
  "restic-password",
  "restic-aws-credentials"
]);
const HASH_KEYS = Object.freeze({
  "restic-repository": "resticRepositorySha256",
  "restic-password": "resticPasswordSha256",
  "restic-aws-credentials": "resticAwsCredentialsSha256"
});

function die(message) {
  process.stderr.write("FEHLER: " + message + "\n");
  process.exit(1);
}

function sha256(buffer) {
  return "sha256:" + crypto.createHash("sha256").update(buffer).digest("hex");
}

async function secretHashes(configDirectory) {
  const directoryLinkMetadata = await lstat(configDirectory);
  const directoryMetadata = await stat(configDirectory);
  if (
    directoryLinkMetadata.isSymbolicLink()
    || !directoryMetadata.isDirectory()
    || await realpath(configDirectory) !== configDirectory
  ) {
    throw new Error("CONFIG_DIR muss ein kanonisches, symlinkfreies Verzeichnis sein.");
  }
  if (
    process.platform === "linux"
    && (directoryMetadata.uid !== 0 || directoryMetadata.gid !== 0 || (directoryMetadata.mode & 0o777) !== 0o700)
  ) {
    throw new Error("CONFIG_DIR muss root:root und Modus 0700 besitzen.");
  }
  const hashes = {};
  for (const name of SECRET_NAMES) {
    const target = path.join(configDirectory, name);
    const linkMetadata = await lstat(target);
    const metadata = await stat(target);
    if (linkMetadata.isSymbolicLink() || !metadata.isFile() || metadata.size < 1 || metadata.size > 4096) {
      throw new Error("Restic-Recovery-Datei ist kein eng begrenztes regulaeres File: " + name);
    }
    if (
      process.platform === "linux"
      && (metadata.uid !== 70 || metadata.gid !== 70 || (metadata.mode & 0o777) !== 0o600)
    ) {
      throw new Error("Restic-Recovery-Datei muss UID/GID 70:70 und Modus 0600 besitzen: " + name);
    }
    hashes[HASH_KEYS[name]] = sha256(await readFile(target));
  }
  return hashes;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function validateDocument(document, expectedHashes, now = Date.now()) {
  const keys = [
    "schemaVersion",
    "createdAt",
    "storedOffHost",
    "separateFromResticRepository",
    "recoveryAccessTested",
    ...Object.values(HASH_KEYS)
  ];
  if (!exactKeys(document, keys) || document.schemaVersion !== 1) {
    throw new Error("Recovery-Escrow-Nachweis hat nicht das freigegebene Schema.");
  }
  if (
    document.storedOffHost !== true
    || document.separateFromResticRepository !== true
    || document.recoveryAccessTested !== true
  ) {
    throw new Error("Recovery-Escrow-Nachweis bestaetigt nicht alle drei Pflicht-Gates.");
  }
  if (
    typeof document.createdAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(document.createdAt)
  ) {
    throw new Error("Recovery-Escrow-Zeitpunkt ist nicht kanonisch.");
  }
  const createdAt = Date.parse(document.createdAt);
  if (
    !Number.isFinite(createdAt)
    || createdAt > now + MAX_FUTURE_SKEW_MS
    || createdAt < now - MAX_ATTESTATION_AGE_MS
  ) {
    throw new Error("Recovery-Escrow-Nachweis ist zukuenftig oder aelter als 31 Tage.");
  }
  for (const key of Object.values(HASH_KEYS)) {
    if (
      typeof document[key] !== "string"
      || !/^sha256:[a-f0-9]{64}$/u.test(document[key])
      || document[key] !== expectedHashes[key]
    ) {
      throw new Error("Recovery-Escrow-Fingerprint passt nicht zu den aktuellen Restic-Dateien.");
    }
  }
}

async function assertAttestationFile(target) {
  const linkMetadata = await lstat(target);
  const metadata = await stat(target);
  if (linkMetadata.isSymbolicLink() || !metadata.isFile() || metadata.size < 2 || metadata.size > 8192) {
    throw new Error("Recovery-Escrow-Nachweis ist keine zulaessige regulaere Datei.");
  }
  if (
    process.platform === "linux"
    && (metadata.uid !== 0 || metadata.gid !== 0 || (metadata.mode & 0o777) !== 0o600)
  ) {
    throw new Error("Recovery-Escrow-Nachweis muss root:root und Modus 0600 besitzen.");
  }
}

async function writeAttestation(configDirectory, hashes) {
  const target = path.join(configDirectory, "recovery-escrow-attestation.json");
  const temporary = target + ".pending-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
  const document = {
    schemaVersion: 1,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    storedOffHost: true,
    separateFromResticRepository: true,
    recoveryAccessTested: true,
    ...hashes
  };
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(document) + "\n", "utf8");
  } finally {
    await handle.close();
  }
  await chmod(temporary, 0o600);
  try {
    const current = await lstat(target);
    if (current.isSymbolicLink() || !current.isFile()) {
      throw new Error("Bestehendes Recovery-Escrow-Ziel ist kein regulaeres File.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  await rename(temporary, target);
  await assertAttestationFile(target);
  process.stdout.write("Recovery-Escrow-Nachweis wurde ohne Secret-Inhalte aktualisiert.\n");
}

async function main() {
  const [mode, configDirectory] = process.argv.slice(2);
  if (!new Set(["verify", "record-after-tested-retrieval"]).has(mode) || !path.isAbsolute(configDirectory || "")) {
    die("Aufruf: recovery-escrow.mjs verify|record-after-tested-retrieval /absolutes/CONFIG_DIR");
  }
  const hashes = await secretHashes(configDirectory);
  if (mode === "record-after-tested-retrieval") {
    await writeAttestation(configDirectory, hashes);
    return;
  }
  const target = path.join(configDirectory, "recovery-escrow-attestation.json");
  await assertAttestationFile(target);
  const document = JSON.parse(await readFile(target, "utf8"));
  validateDocument(document, hashes);
  process.stdout.write("Recovery-Escrow-Nachweis ist aktuell und passt zu den Restic-Dateien.\n");
}

main().catch((error) => die(
  error instanceof SyntaxError
    ? "Recovery-Escrow-Nachweis enthaelt kein gueltiges JSON."
    : error?.message || "Recovery-Escrow-Pruefung ist fehlgeschlagen."
));
