import { deflateRawSync } from "node:zlib";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateArtifactDigest,
  canonicalReleaseChecksums,
  parseDeterministicZip,
  readArtifactTree,
  releaseArtifactContract,
  releaseAssetNames,
  verifyReleaseArtifacts
} from "./verify_release_artifacts.mjs";

const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function fail(message) {
  throw new Error(`Release-Paket: ${message}`);
}

function compareUtf8(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateEntryName(name) {
  const value = String(name ?? "");
  if (
    !value
    || value.includes("\0")
    || value.includes("\\")
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || value.normalize("NFC") !== value
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(`unsicherer ZIP-Pfad ${JSON.stringify(value)}.`);
  }
  return value;
}

export function createDeterministicZip(inputEntries) {
  if (!Array.isArray(inputEntries) || !inputEntries.length) fail("ZIP benoetigt mindestens eine Datei.");
  const entries = inputEntries
    .map(({ name, data }) => ({ name: validateEntryName(name), data: Buffer.from(data) }))
    .sort((left, right) => compareUtf8(left.name, right.name));
  const seen = new Set();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { name, data } of entries) {
    if (seen.has(name)) fail(`doppelter ZIP-Pfad ${name}.`);
    seen.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    if (nameBytes.length > 0xffff) fail(`ZIP-Pfad ist zu lang: ${name}.`);
    if (data.length > releaseArtifactContract.maxEntryUncompressedBytes) {
      fail(`ZIP-Datei ist zu gross fuer den Vertrag: ${name}.`);
    }
    const compressed = deflateRawSync(data, { level: 9 });
    if (compressed.length > 0xffffffff) fail(`komprimierte ZIP-Datei ist zu gross: ${name}.`);
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(releaseArtifactContract.versionNeeded, 4);
    localHeader.writeUInt16LE(releaseArtifactContract.utf8Flag, 6);
    localHeader.writeUInt16LE(releaseArtifactContract.deflateMethod, 8);
    localHeader.writeUInt16LE(releaseArtifactContract.fixedDosTime, 10);
    localHeader.writeUInt16LE(releaseArtifactContract.fixedDosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(releaseArtifactContract.versionMadeBy, 4);
    centralHeader.writeUInt16LE(releaseArtifactContract.versionNeeded, 6);
    centralHeader.writeUInt16LE(releaseArtifactContract.utf8Flag, 8);
    centralHeader.writeUInt16LE(releaseArtifactContract.deflateMethod, 10);
    centralHeader.writeUInt16LE(releaseArtifactContract.fixedDosTime, 12);
    centralHeader.writeUInt16LE(releaseArtifactContract.fixedDosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(releaseArtifactContract.normalizedExternalAttributes, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + compressed.length;
    if (localOffset > 0xffffffff) fail("ZIP-Datei ueberschreitet den freigegebenen 32-Bit-Vertrag.");
  }

  if (entries.length > 0xffff) fail("ZIP-Datei enthaelt zu viele Dateien.");
  const centralDirectory = Buffer.concat(centralParts);
  if (centralDirectory.length > 0xffffffff) fail("ZIP-Zentralverzeichnis ist zu gross.");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  const archive = Buffer.concat([...localParts, centralDirectory, end]);
  if (archive.length > releaseArtifactContract.maxArchiveBytes) {
    fail("ZIP-Datei ueberschreitet die erlaubte Archivgroesse.");
  }
  parseDeterministicZip(archive);
  return archive;
}

function parseSourceManifest(entries, { productVersion, commitSha }) {
  const manifestEntry = entries.find(({ name }) => name === releaseArtifactContract.manifestName);
  if (!manifestEntry) fail("Pages-Artefakt enthaelt kein build-manifest.json.");
  let sourceManifest;
  try {
    sourceManifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch (error) {
    fail(`Pages-build-manifest.json ist ungueltig (${error.message}).`);
  }
  if (!sourceManifest || typeof sourceManifest !== "object" || Array.isArray(sourceManifest)) {
    fail("Pages-build-manifest.json muss ein Objekt sein.");
  }
  const allowedKeys = new Set(["artifactDigest", "productVersion", "profile", "revision"]);
  const unexpected = Object.keys(sourceManifest).filter((key) => !allowedKeys.has(key));
  if (unexpected.length) fail(`Pages-build-manifest.json besitzt unerwartete Felder: ${unexpected.join(", ")}.`);
  if (sourceManifest.profile !== "pages") fail("Pages-build-manifest.json verwendet nicht das Profil pages.");
  if (sourceManifest.revision !== commitSha) {
    fail(`Pages-build-manifest.json nennt ${sourceManifest.revision} statt ${commitSha}.`);
  }
  if (sourceManifest.productVersion && sourceManifest.productVersion !== productVersion) {
    fail(`Pages-build-manifest.json nennt Produktversion ${sourceManifest.productVersion} statt ${productVersion}.`);
  }
  const artifactDigest = calculateArtifactDigest(entries);
  if (sourceManifest.artifactDigest !== artifactDigest) {
    fail(`Pages-build-manifest.json nennt Inhaltsdigest ${sourceManifest.artifactDigest} statt ${artifactDigest}.`);
  }
  return {
    profile: "pages",
    productVersion,
    revision: commitSha,
    artifactDigest
  };
}

function outputDirectoryState(outputDirectory) {
  if (!existsSync(outputDirectory)) return "missing";
  const stat = lstatSync(outputDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(`Ausgabeziel muss ein echtes Verzeichnis sein: ${outputDirectory}.`);
  }
  if (readdirSync(outputDirectory).length) {
    fail(`Ausgabeziel muss fehlen oder leer sein: ${outputDirectory}.`);
  }
  return "empty";
}

export function packageProductRelease({
  artifactRoot,
  outputDirectory,
  tag,
  commitSha,
  productVersion
}) {
  if (!TAG_PATTERN.test(String(tag))) fail(`ungueltiger technischer Tag ${JSON.stringify(tag)}.`);
  if (!VERSION_PATTERN.test(String(productVersion))) fail(`ungueltige Produktversion ${JSON.stringify(productVersion)}.`);
  if (tag !== `v${productVersion}`) fail(`Tag ${tag} und Produktversion ${productVersion} stimmen nicht ueberein.`);
  if (!COMMIT_PATTERN.test(String(commitSha))) fail(`ungueltiger vollstaendiger Commit ${JSON.stringify(commitSha)}.`);

  const source = path.resolve(artifactRoot);
  const destination = path.resolve(outputDirectory);
  const sourceContainsDestination = destination === source || destination.startsWith(`${source}${path.sep}`);
  const destinationContainsSource = source.startsWith(`${destination}${path.sep}`);
  if (sourceContainsDestination || destinationContainsSource) {
    fail("Pages-Artefakt und Release-Ausgabe duerfen sich nicht ueberlappen.");
  }

  const sourceEntries = readArtifactTree(source);
  const releaseManifest = parseSourceManifest(sourceEntries, { productVersion, commitSha });
  const manifestBytes = Buffer.from(`${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
  const archiveEntries = sourceEntries
    .map((entry) => entry.name === releaseArtifactContract.manifestName
      ? { ...entry, data: manifestBytes }
      : entry)
    .sort((left, right) => compareUtf8(left.name, right.name));
  const archiveBytes = createDeterministicZip(archiveEntries);
  const names = releaseAssetNames(tag);
  const checksumsBytes = canonicalReleaseChecksums({
    archiveName: names.archive,
    archiveBytes,
    manifestBytes
  });

  mkdirSync(path.dirname(destination), { recursive: true });
  const state = outputDirectoryState(destination);
  const temporary = mkdtempSync(path.join(path.dirname(destination), ".release-assets-"));
  try {
    for (const [name, content] of [
      [names.archive, archiveBytes],
      [names.manifest, manifestBytes],
      [names.checksums, checksumsBytes]
    ]) {
      const target = path.join(temporary, name);
      writeFileSync(target, content, { mode: 0o644 });
      chmodSync(target, 0o644);
    }
    const verified = verifyReleaseArtifacts({
      releaseDirectory: temporary,
      tag,
      commitSha,
      artifactRoot: source
    });
    if (state === "empty") rmdirSync(destination);
    renameSync(temporary, destination);
    return {
      ...verified,
      archivePath: path.join(destination, names.archive),
      manifestPath: path.join(destination, names.manifest),
      checksumsPath: path.join(destination, names.checksums)
    };
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readCentralProductVersion() {
  let config;
  try {
    config = JSON.parse(readFileSync(path.join(projectRoot, "config", "release.json"), "utf8"));
  } catch (error) {
    fail(`config/release.json kann nicht gelesen werden (${error.message}).`);
  }
  if (!VERSION_PATTERN.test(String(config?.productVersion))) {
    fail("config/release.json enthaelt keine vollstaendige productVersion.");
  }
  return config.productVersion;
}

function parseCliArguments(argv) {
  const values = new Map();
  const allowed = new Set(["artifact-root", "output-dir", "tag", "commit-sha"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) fail(`unbekanntes Argument ${JSON.stringify(argument)}.`);
    const equals = argument.indexOf("=");
    const name = argument.slice(2, equals === -1 ? undefined : equals);
    if (!allowed.has(name) || values.has(name)) fail(`unbekanntes oder doppeltes Argument --${name}.`);
    const value = equals === -1 ? argv[index += 1] : argument.slice(equals + 1);
    if (!value || value.startsWith("--")) fail(`--${name} benoetigt einen Wert.`);
    values.set(name, value);
  }
  for (const required of ["artifact-root", "output-dir", "tag", "commit-sha"]) {
    if (!values.has(required)) fail(`--${required} fehlt.`);
  }
  return {
    artifactRoot: values.get("artifact-root"),
    outputDirectory: values.get("output-dir"),
    tag: values.get("tag"),
    commitSha: values.get("commit-sha"),
    productVersion: readCentralProductVersion()
  };
}

function writeGithubOutput(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const values = {
    archive_name: result.archiveName,
    archive_path: result.archivePath,
    manifest_path: result.manifestPath,
    checksums_path: result.checksumsPath
  };
  for (const [name, value] of Object.entries(values)) {
    if (String(value).includes("\n") || String(value).includes("\r")) fail(`GitHub-Ausgabe ${name} enthaelt einen Zeilenumbruch.`);
  }
  appendFileSync(
    outputPath,
    `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n")}\n`,
    "utf8"
  );
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = packageProductRelease(parseCliArguments(process.argv.slice(2)));
    writeGithubOutput(result);
    console.log(
      `Release-Paket erstellt: ${result.archiveName}, ${result.fileCount} Dateien, ${result.artifactDigest}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
