import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33; // 1980-01-01, der frueheste ZIP-Zeitstempel.
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED; // Unix, ZIP 2.0.
const NORMALIZED_EXTERNAL_ATTRIBUTES = (0o100644 << 16) >>> 0;
const MANIFEST_NAME = "build-manifest.json";
const CHECKSUMS_NAME = "SHA256SUMS";
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const ARTIFACT_DIGEST_DOMAIN = Buffer.from("versorgungs-kompass-artifact-tree-v2\0", "utf8");
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(message) {
  throw new Error(`Release-Artefakte: ${message}`);
}

function compareUtf8(left, right) {
  // Entspricht exakt der bestehenden Sortierung des Pages-Builders, dessen
  // artifactDigest hier unabhaengig nachgerechnet wird.
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateRelativeFileName(value) {
  const name = String(value ?? "");
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/")) {
    fail(`unsicherer ZIP-Pfad ${JSON.stringify(name)}.`);
  }
  if (name.normalize("NFC") !== name) {
    fail(`ZIP-Pfad ist nicht NFC-normalisiert: ${JSON.stringify(name)}.`);
  }
  if (/^[A-Za-z]:/u.test(name)) fail(`absoluter Windows-Pfad ist unzulaessig: ${name}.`);
  const segments = name.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail(`unsicherer ZIP-Pfad ${JSON.stringify(name)}.`);
  }
  return name;
}

function walkRegularFiles(rootDirectory) {
  const root = path.resolve(rootDirectory);
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch (error) {
    fail(`Artefaktverzeichnis fehlt (${root}): ${error.message}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`Artefaktwurzel muss ein echtes Verzeichnis sein: ${root}.`);
  }

  const files = [];
  function visit(directory, relativeDirectory = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      validateRelativeFileName(relative);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Symlink ist im Release-Artefakt unzulaessig: ${relative}.`);
      if (stat.isDirectory()) {
        visit(absolute, relative);
      } else if (stat.isFile()) {
        files.push({ name: relative, data: readFileSync(absolute) });
      } else {
        fail(`nur regulaere Dateien sind im Release-Artefakt zulaessig: ${relative}.`);
      }
    }
  }
  visit(root);
  files.sort((left, right) => compareUtf8(left.name, right.name));
  return files;
}

export function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function calculateArtifactDigest(entries) {
  const normalized = [...entries]
    .filter(({ name }) => name !== MANIFEST_NAME)
    .map(({ name, data }) => ({
      name: validateRelativeFileName(name),
      data: Buffer.from(data)
    }))
    .sort((left, right) => compareUtf8(left.name, right.name));
  const seen = new Set();
  const hash = createHash("sha256");
  const lengthPrefix = (value) => {
    const frame = Buffer.alloc(8);
    frame.writeBigUInt64BE(BigInt(value));
    return frame;
  };
  hash.update(ARTIFACT_DIGEST_DOMAIN);
  hash.update(lengthPrefix(normalized.length));
  for (const { name, data } of normalized) {
    if (seen.has(name)) fail(`doppelter Artefaktpfad ${name}.`);
    seen.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    hash.update(lengthPrefix(nameBytes.length));
    hash.update(nameBytes);
    hash.update(lengthPrefix(data.length));
    hash.update(data);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function readArtifactTree(artifactRoot) {
  return walkRegularFiles(artifactRoot);
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

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("ZIP-Endverzeichnis fehlt.");
}

export function parseDeterministicZip(archiveInput) {
  const archive = Buffer.from(archiveInput);
  if (archive.length < 22) fail("ZIP-Datei ist zu kurz.");
  if (archive.length > MAX_ARCHIVE_BYTES) {
    fail(`ZIP-Datei ueberschreitet ${MAX_ARCHIVE_BYTES} Bytes.`);
  }
  const endOffset = findEndOfCentralDirectory(archive);
  if (endOffset + 22 > archive.length) fail("ZIP-Endverzeichnis ist abgeschnitten.");

  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  const commentLength = archive.readUInt16LE(endOffset + 20);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    fail("mehrteilige ZIP-Dateien sind nicht zulaessig.");
  }
  if (commentLength !== 0 || endOffset + 22 !== archive.length) {
    fail("ZIP-Kommentare oder nachgestellte Daten sind nicht zulaessig.");
  }
  if (centralOffset + centralSize !== endOffset) {
    fail("ZIP-Zentralverzeichnis besitzt unzulaessige Luecken oder Offsets.");
  }

  const entries = [];
  const seen = new Set();
  let cursor = centralOffset;
  let expectedLocalOffset = 0;
  let previousName = "";
  let totalUncompressedSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || archive.readUInt32LE(cursor) !== 0x02014b50) {
      fail(`ZIP-Zentraleintrag ${index + 1} ist ungueltig.`);
    }
    const madeBy = archive.readUInt16LE(cursor + 4);
    const needed = archive.readUInt16LE(cursor + 6);
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const dosTime = archive.readUInt16LE(cursor + 12);
    const dosDate = archive.readUInt16LE(cursor + 14);
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const entryCommentLength = archive.readUInt16LE(cursor + 32);
    const startDisk = archive.readUInt16LE(cursor + 34);
    const internalAttributes = archive.readUInt16LE(cursor + 36);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    const nextCursor = nameEnd + extraLength + entryCommentLength;
    if (nextCursor > endOffset) fail(`ZIP-Zentraleintrag ${index + 1} ist abgeschnitten.`);
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      fail(`ZIP-Eintrag ${index + 1} ueberschreitet die erlaubte unkomprimierte Einzelgroesse.`);
    }
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      fail("ZIP-Datei ueberschreitet die erlaubte kumulierte unkomprimierte Groesse.");
    }
    if (
      madeBy !== VERSION_MADE_BY
      || needed !== VERSION_NEEDED
      || flags !== UTF8_FLAG
      || method !== DEFLATE_METHOD
      || dosTime !== FIXED_DOS_TIME
      || dosDate !== FIXED_DOS_DATE
      || extraLength !== 0
      || entryCommentLength !== 0
      || startDisk !== 0
      || internalAttributes !== 0
      || externalAttributes !== NORMALIZED_EXTERNAL_ATTRIBUTES
    ) {
      fail(`ZIP-Zentraleintrag ${index + 1} verletzt den deterministischen Metadatenvertrag.`);
    }

    let name;
    try {
      name = decoder.decode(archive.subarray(nameStart, nameEnd));
    } catch {
      fail(`ZIP-Zentraleintrag ${index + 1} besitzt keinen gueltigen UTF-8-Pfad.`);
    }
    validateRelativeFileName(name);
    if (seen.has(name)) fail(`doppelter ZIP-Pfad ${name}.`);
    if (index > 0 && compareUtf8(previousName, name) >= 0) {
      fail(`ZIP-Pfade sind nicht streng sortiert: ${previousName}, ${name}.`);
    }
    seen.add(name);
    previousName = name;

    if (localOffset !== expectedLocalOffset || localOffset + 30 > centralOffset) {
      fail(`ZIP-Lokaleintrag ${name} besitzt einen unzulaessigen Offset.`);
    }
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
      fail(`lokaler ZIP-Header fuer ${name} fehlt.`);
    }
    const localNeeded = archive.readUInt16LE(localOffset + 4);
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localTime = archive.readUInt16LE(localOffset + 10);
    const localDate = archive.readUInt16LE(localOffset + 12);
    const localCrc = archive.readUInt32LE(localOffset + 14);
    const localCompressedSize = archive.readUInt32LE(localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (
      localNeeded !== needed
      || localFlags !== flags
      || localMethod !== method
      || localTime !== dosTime
      || localDate !== dosDate
      || localCrc !== expectedCrc
      || localCompressedSize !== compressedSize
      || localUncompressedSize !== uncompressedSize
      || localExtraLength !== 0
      || localNameLength !== nameLength
      || localNameEnd > centralOffset
      || !archive.subarray(localNameStart, localNameEnd).equals(archive.subarray(nameStart, nameEnd))
      || dataEnd > centralOffset
    ) {
      fail(`lokaler ZIP-Header fuer ${name} stimmt nicht mit dem Zentralverzeichnis ueberein.`);
    }

    let data;
    try {
      const compressedInput = archive.subarray(dataStart, dataEnd);
      const inflated = inflateRawSync(compressedInput, {
        info: true,
        maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES
      });
      data = inflated.buffer;
      if (inflated.engine.bytesWritten !== compressedInput.length) {
        fail(`ZIP-Inhalt ${name} enthaelt Daten nach dem Deflate-Stream.`);
      }
    } catch (error) {
      if (String(error?.message || "").startsWith("Release-Artefakte:")) throw error;
      fail(`ZIP-Inhalt ${name} kann nicht dekomprimiert werden (${error.message}).`);
    }
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) {
      fail(`ZIP-Inhalt ${name} verletzt Groessen- oder CRC-Nachweis.`);
    }
    entries.push({ name, data });
    expectedLocalOffset = dataEnd;
    cursor = nextCursor;
  }
  if (cursor !== endOffset || expectedLocalOffset !== centralOffset) {
    fail("ZIP-Datei enthaelt nicht referenzierte Daten oder unvollstaendige Eintraege.");
  }
  return entries;
}

function parseManifest(manifestBytes, { tag, commitSha }) {
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"));
  } catch (error) {
    fail(`build-manifest.json ist kein gueltiges JSON (${error.message}).`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("build-manifest.json muss ein Objekt sein.");
  }
  const expectedKeys = ["profile", "productVersion", "revision", "artifactDigest"];
  const actualKeys = Object.keys(manifest);
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`build-manifest.json besitzt unerwartete Felder: ${actualKeys.join(", ")}.`);
  }
  const tagMatch = String(tag).match(TAG_PATTERN);
  if (!tagMatch) fail(`ungueltiger technischer Tag ${JSON.stringify(tag)}.`);
  const productVersion = tag.slice(1);
  if (manifest.profile !== "pages") fail("build-manifest.json muss das Profil pages verwenden.");
  if (manifest.productVersion !== productVersion) {
    fail(`build-manifest.json nennt ${manifest.productVersion} statt ${productVersion}.`);
  }
  if (manifest.revision !== commitSha || !COMMIT_PATTERN.test(manifest.revision)) {
    fail(`build-manifest.json nennt nicht den vollstaendigen Release-Commit ${commitSha}.`);
  }
  if (!DIGEST_PATTERN.test(manifest.artifactDigest || "")) {
    fail("build-manifest.json enthaelt keinen gueltigen Inhaltsdigest.");
  }
  const canonical = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (!canonical.equals(Buffer.from(manifestBytes))) {
    fail("build-manifest.json ist nicht kanonisch serialisiert.");
  }
  return manifest;
}

function expectedAssetNames(tag) {
  if (!TAG_PATTERN.test(String(tag))) fail(`ungueltiger technischer Tag ${JSON.stringify(tag)}.`);
  return {
    archive: `versorgungs-kompass-${tag}-pages.zip`,
    manifest: MANIFEST_NAME,
    checksums: CHECKSUMS_NAME
  };
}

function readStrictReleaseDirectory(releaseDirectory, tag) {
  const root = path.resolve(releaseDirectory);
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch (error) {
    fail(`Release-Verzeichnis fehlt (${root}): ${error.message}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail(`Release-Verzeichnis muss ein echtes Verzeichnis sein: ${root}.`);
  }
  const names = expectedAssetNames(tag);
  const expected = [names.archive, names.manifest, names.checksums].sort(compareUtf8);
  const actual = readdirSync(root).sort(compareUtf8);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`Release-Verzeichnis muss exakt ${expected.join(", ")} enthalten; gefunden: ${actual.join(", ") || "nichts"}.`);
  }
  const contents = {};
  for (const name of expected) {
    const file = path.join(root, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(`Release-Asset muss eine regulaere Datei sein: ${name}.`);
    contents[name] = readFileSync(file);
  }
  return { names, contents };
}

function canonicalChecksums({ archiveName, archiveBytes, manifestBytes }) {
  return Buffer.from(
    `${sha256Hex(manifestBytes)}  ${MANIFEST_NAME}\n${sha256Hex(archiveBytes)}  ${archiveName}\n`,
    "utf8"
  );
}

function assertEntriesMatch(leftEntries, rightEntries, label) {
  if (leftEntries.length !== rightEntries.length) {
    fail(`${label}: Dateianzahl ${leftEntries.length} statt ${rightEntries.length}.`);
  }
  for (let index = 0; index < leftEntries.length; index += 1) {
    const left = leftEntries[index];
    const right = rightEntries[index];
    if (left.name !== right.name || !left.data.equals(right.data)) {
      fail(`${label}: Abweichung bei ${left.name || right.name}.`);
    }
  }
}

export function verifyReleaseArtifacts({ releaseDirectory, tag, commitSha, artifactRoot = "" }) {
  if (!TAG_PATTERN.test(String(tag))) fail(`ungueltiger technischer Tag ${JSON.stringify(tag)}.`);
  if (!COMMIT_PATTERN.test(String(commitSha))) fail(`ungueltiger vollstaendiger Commit ${JSON.stringify(commitSha)}.`);
  const { names, contents } = readStrictReleaseDirectory(releaseDirectory, tag);
  const archiveBytes = contents[names.archive];
  const manifestBytes = contents[names.manifest];
  const expectedChecksums = canonicalChecksums({
    archiveName: names.archive,
    archiveBytes,
    manifestBytes
  });
  if (!expectedChecksums.equals(contents[names.checksums])) {
    fail("SHA256SUMS ist unvollstaendig, manipuliert oder nicht kanonisch sortiert.");
  }

  const manifest = parseManifest(manifestBytes, { tag, commitSha });
  const archiveEntries = parseDeterministicZip(archiveBytes);
  const archivedManifest = archiveEntries.find(({ name }) => name === MANIFEST_NAME);
  if (!archivedManifest) fail("build-manifest.json fehlt im ZIP.");
  if (!archivedManifest.data.equals(manifestBytes)) {
    fail("build-manifest.json im ZIP ist nicht bytegleich mit dem separaten Asset.");
  }
  const actualDigest = calculateArtifactDigest(archiveEntries);
  if (actualDigest !== manifest.artifactDigest) {
    fail(`ZIP-Inhaltsdigest ${actualDigest} stimmt nicht mit ${manifest.artifactDigest} ueberein.`);
  }

  if (artifactRoot) {
    const sourceEntries = readArtifactTree(artifactRoot)
      .map((entry) => entry.name === MANIFEST_NAME ? { ...entry, data: manifestBytes } : entry)
      .sort((left, right) => compareUtf8(left.name, right.name));
    if (!sourceEntries.some(({ name }) => name === MANIFEST_NAME)) {
      fail("lokales Pages-Artefakt enthaelt kein build-manifest.json.");
    }
    const sourceDigest = calculateArtifactDigest(sourceEntries);
    if (sourceDigest !== manifest.artifactDigest) {
      fail(`lokaler Pages-Digest ${sourceDigest} stimmt nicht mit ${manifest.artifactDigest} ueberein.`);
    }
    assertEntriesMatch(archiveEntries, sourceEntries, "ZIP und lokales Pages-Artefakt");
  }

  return {
    archiveName: names.archive,
    archiveSha256: sha256Hex(archiveBytes),
    manifestSha256: sha256Hex(manifestBytes),
    artifactDigest: manifest.artifactDigest,
    productVersion: manifest.productVersion,
    revision: manifest.revision,
    fileCount: archiveEntries.length
  };
}

function parseCliArguments(argv) {
  const values = new Map();
  const allowed = new Set(["release-dir", "tag", "commit-sha", "artifact-root"]);
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
  for (const required of ["release-dir", "tag", "commit-sha"]) {
    if (!values.has(required)) fail(`--${required} fehlt.`);
  }
  return {
    releaseDirectory: values.get("release-dir"),
    tag: values.get("tag"),
    commitSha: values.get("commit-sha"),
    artifactRoot: values.get("artifact-root") || ""
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = verifyReleaseArtifacts(parseCliArguments(process.argv.slice(2)));
    console.log(
      `Release-Artefakte verifiziert: ${result.archiveName}, ${result.fileCount} Dateien, ${result.artifactDigest}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export const releaseArtifactContract = Object.freeze({
  checksumsName: CHECKSUMS_NAME,
  manifestName: MANIFEST_NAME,
  normalizedExternalAttributes: NORMALIZED_EXTERNAL_ATTRIBUTES,
  fixedDosDate: FIXED_DOS_DATE,
  fixedDosTime: FIXED_DOS_TIME,
  utf8Flag: UTF8_FLAG,
  deflateMethod: DEFLATE_METHOD,
  versionMadeBy: VERSION_MADE_BY,
  versionNeeded: VERSION_NEEDED,
  maxArchiveBytes: MAX_ARCHIVE_BYTES,
  maxEntryUncompressedBytes: MAX_ENTRY_UNCOMPRESSED_BYTES,
  maxTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES
});

export function releaseAssetNames(tag) {
  return expectedAssetNames(tag);
}

export function canonicalReleaseChecksums(values) {
  return canonicalChecksums(values);
}
