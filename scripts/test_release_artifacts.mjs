import assert from "node:assert/strict";
import {
  appendFileSync,
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createDeterministicZip,
  packageProductRelease
} from "./package_product_release.mjs";
import {
  calculateArtifactDigest,
  canonicalReleaseChecksums,
  parseDeterministicZip,
  readArtifactTree,
  releaseArtifactContract,
  releaseAssetNames,
  sha256Hex,
  verifyReleaseArtifacts
} from "./verify_release_artifacts.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const packageScript = path.join(projectRoot, "scripts", "package_product_release.mjs");
const verifyScript = path.join(projectRoot, "scripts", "verify_release_artifacts.mjs");
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "versorgungs-release-assets-"));
const commitSha = "a".repeat(40);
const tag = "v0.23.0";
const productVersion = "0.23.0";

function write(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function sourceManifest(artifactRoot, overrides = {}) {
  const digest = calculateArtifactDigest(readArtifactTree(artifactRoot));
  return {
    profile: "pages",
    revision: commitSha,
    artifactDigest: digest,
    ...overrides
  };
}

function createPagesArtifact(directory, overrides = {}) {
  mkdirSync(directory, { recursive: true });
  write(path.join(directory, ".nojekyll"), Buffer.alloc(0));
  write(path.join(directory, "index.html"), "<!doctype html><title>Demo</title>\n");
  write(path.join(directory, "safe", "file"), "deterministic path test\n");
  write(path.join(directory, "safe", "tile"), "duplicate path test\n");
  write(path.join(directory, "nested", "ärzte.txt"), "Ärztinnen und Ärzte\n");
  write(path.join(directory, "build-manifest.json"), "{}\n");
  write(
    path.join(directory, "build-manifest.json"),
    `${JSON.stringify(sourceManifest(directory, overrides), null, 2)}\n`
  );
}

function expectFailure(callback, pattern, label) {
  assert.throws(callback, pattern, label);
}

function copyRelease(source, name) {
  const destination = path.join(fixtureRoot, name);
  cpSync(source, destination, { recursive: true });
  return destination;
}

function rewriteChecksums(releaseDirectory, releaseTag) {
  const names = releaseAssetNames(releaseTag);
  const archiveBytes = readFileSync(path.join(releaseDirectory, names.archive));
  const manifestBytes = readFileSync(path.join(releaseDirectory, names.manifest));
  writeFileSync(
    path.join(releaseDirectory, names.checksums),
    canonicalReleaseChecksums({ archiveName: names.archive, archiveBytes, manifestBytes })
  );
}

function replaceAllBytes(input, beforeText, afterText) {
  const before = Buffer.from(beforeText, "utf8");
  const after = Buffer.from(afterText, "utf8");
  assert.equal(before.length, after.length, "Testmutation benoetigt gleich lange Namen.");
  const output = Buffer.from(input);
  let offset = 0;
  let replacements = 0;
  while ((offset = output.indexOf(before, offset)) !== -1) {
    after.copy(output, offset);
    offset += after.length;
    replacements += 1;
  }
  assert(replacements >= 2, `Testmutation fand ${beforeText} nicht in lokalem und zentralem ZIP-Header.`);
  return output;
}

function appendHiddenCompressedByte(input) {
  const archive = Buffer.from(input);
  const oldEndOffset = archive.length - 22;
  const oldCentralOffset = archive.readUInt32LE(oldEndOffset + 16);
  const oldCompressedSize = archive.readUInt32LE(oldCentralOffset + 20);
  const localOffset = archive.readUInt32LE(oldCentralOffset + 42);
  const mutated = Buffer.concat([
    archive.subarray(0, oldCentralOffset),
    Buffer.from([0]),
    archive.subarray(oldCentralOffset)
  ]);
  const centralOffset = oldCentralOffset + 1;
  const endOffset = oldEndOffset + 1;
  mutated.writeUInt32LE(oldCompressedSize + 1, localOffset + 18);
  mutated.writeUInt32LE(oldCompressedSize + 1, centralOffset + 20);
  mutated.writeUInt32LE(centralOffset, endOffset + 16);
  return mutated;
}

try {
  const formerlyAmbiguousTree = calculateArtifactDigest([
    { name: "a", data: Buffer.from("x\0b\0y") }
  ]);
  const distinctTree = calculateArtifactDigest([
    { name: "a", data: Buffer.from("x") },
    { name: "b", data: Buffer.from("y") }
  ]);
  assert.notEqual(
    formerlyAmbiguousTree,
    distinctTree,
    "Längenpräfixe müssen Dateigrenzen auch bei NUL-Bytes eindeutig binden."
  );

  const pagesRoot = path.join(fixtureRoot, "pages");
  createPagesArtifact(pagesRoot);

  const outputOne = path.join(fixtureRoot, "release-one");
  const first = packageProductRelease({
    artifactRoot: pagesRoot,
    outputDirectory: outputOne,
    tag,
    commitSha,
    productVersion
  });
  assert.deepEqual(
    readdirSync(outputOne).sort(),
    ["SHA256SUMS", "build-manifest.json", `versorgungs-kompass-${tag}-pages.zip`].sort(),
    "Das Release-Verzeichnis muss exakt drei Assets enthalten."
  );
  const firstVerification = verifyReleaseArtifacts({
    releaseDirectory: outputOne,
    tag,
    commitSha,
    artifactRoot: pagesRoot
  });
  assert.equal(firstVerification.productVersion, productVersion);
  assert.equal(firstVerification.revision, commitSha);
  assert.equal(firstVerification.archiveName, `versorgungs-kompass-${tag}-pages.zip`);
  assert.equal(firstVerification.archiveSha256, sha256Hex(readFileSync(first.archivePath)));

  const changedTime = new Date("2037-12-31T23:59:58Z");
  for (const entry of readArtifactTree(pagesRoot)) {
    const file = path.join(pagesRoot, ...entry.name.split("/"));
    utimesSync(file, changedTime, changedTime);
    chmodSync(file, entry.name === "index.html" ? 0o755 : 0o600);
  }
  const outputTwo = path.join(fixtureRoot, "release-two");
  const second = packageProductRelease({
    artifactRoot: pagesRoot,
    outputDirectory: outputTwo,
    tag,
    commitSha,
    productVersion
  });
  assert.equal(
    sha256Hex(readFileSync(first.archivePath)),
    sha256Hex(readFileSync(second.archivePath)),
    "Dateizeiten und lokale Rechte duerfen den ZIP-Hash nicht veraendern."
  );
  for (const asset of readdirSync(outputOne)) {
    assert(
      readFileSync(path.join(outputOne, asset)).equals(readFileSync(path.join(outputTwo, asset))),
      `${asset} muss bei identischem Inhalt bytegleich reproduziert werden.`
    );
  }

  const downloaded = copyRelease(outputOne, "downloaded");
  assert.doesNotThrow(() => verifyReleaseArtifacts({
    releaseDirectory: downloaded,
    tag,
    commitSha
  }), "Ein erneut heruntergeladenes exaktes Assetset muss ohne Quellbaum pruefbar sein.");

  const archiveEntries = parseDeterministicZip(readFileSync(first.archivePath));
  const standaloneManifest = readFileSync(first.manifestPath);
  assert(
    archiveEntries.find(({ name }) => name === "build-manifest.json")?.data.equals(standaloneManifest),
    "Manifest im ZIP und separates Manifest muessen bytegleich sein."
  );
  assert.equal(
    calculateArtifactDigest(archiveEntries),
    JSON.parse(standaloneManifest).artifactDigest,
    "Der Manifest-Digest muss aus dem ZIP-Inhalt nachgerechnet werden."
  );

  const withExtraAsset = copyRelease(outputOne, "extra-asset");
  write(path.join(withExtraAsset, "unexpected.txt"), "not allowed\n");
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: withExtraAsset, tag, commitSha }),
    /muss exakt/u,
    "Zusaetzliche Release-Assets muessen scheitern."
  );

  const withoutManifest = copyRelease(outputOne, "missing-asset");
  unlinkSync(path.join(withoutManifest, "build-manifest.json"));
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: withoutManifest, tag, commitSha }),
    /muss exakt/u,
    "Fehlende Release-Assets muessen scheitern."
  );

  const linkedManifest = copyRelease(outputOne, "linked-manifest");
  unlinkSync(path.join(linkedManifest, "build-manifest.json"));
  symlinkSync(first.manifestPath, path.join(linkedManifest, "build-manifest.json"));
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: linkedManifest, tag, commitSha }),
    /regulaere Datei/u,
    "Symlinks duerfen auch nach dem Download kein Release-Asset ersetzen."
  );

  const changedManifest = copyRelease(outputOne, "changed-manifest");
  appendFileSync(path.join(changedManifest, "build-manifest.json"), " ");
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: changedManifest, tag, commitSha }),
    /SHA256SUMS/u,
    "Manifest-Manipulation muss bereits am Checksum-Gate scheitern."
  );

  const changedArchive = copyRelease(outputOne, "changed-archive");
  const changedArchivePath = path.join(changedArchive, releaseAssetNames(tag).archive);
  const damagedBytes = readFileSync(changedArchivePath);
  damagedBytes[Math.floor(damagedBytes.length / 2)] ^= 0xff;
  writeFileSync(changedArchivePath, damagedBytes);
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: changedArchive, tag, commitSha }),
    /SHA256SUMS/u,
    "ZIP-Manipulation muss bereits am Checksum-Gate scheitern."
  );

  const changedChecksums = copyRelease(outputOne, "changed-checksums");
  const checksumsPath = path.join(changedChecksums, "SHA256SUMS");
  const checksumLines = readFileSync(checksumsPath, "utf8").trimEnd().split("\n").reverse();
  writeFileSync(checksumsPath, `${checksumLines.join("\n")}\n`);
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: changedChecksums, tag, commitSha }),
    /SHA256SUMS/u,
    "Nicht kanonisch sortierte Checksummen muessen scheitern."
  );

  const changedInnerFile = copyRelease(outputOne, "changed-inner-file");
  const changedInnerArchivePath = path.join(changedInnerFile, releaseAssetNames(tag).archive);
  const changedInnerEntries = parseDeterministicZip(readFileSync(changedInnerArchivePath))
    .map((entry) => entry.name === "index.html" ? { ...entry, data: Buffer.from("tampered\n") } : entry);
  writeFileSync(changedInnerArchivePath, createDeterministicZip(changedInnerEntries));
  rewriteChecksums(changedInnerFile, tag);
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: changedInnerFile, tag, commitSha }),
    /ZIP-Inhaltsdigest/u,
    "Manipulierter ZIP-Inhalt muss trotz passend erneuerter Assetchecksumme scheitern."
  );

  const changedInnerManifest = copyRelease(outputOne, "changed-inner-manifest");
  const changedInnerManifestArchive = path.join(changedInnerManifest, releaseAssetNames(tag).archive);
  const divergentManifestEntries = parseDeterministicZip(readFileSync(changedInnerManifestArchive))
    .map((entry) => entry.name === "build-manifest.json"
      ? { ...entry, data: Buffer.from(`${entry.data.toString("utf8")}\n`) }
      : entry);
  writeFileSync(changedInnerManifestArchive, createDeterministicZip(divergentManifestEntries));
  rewriteChecksums(changedInnerManifest, tag);
  expectFailure(
    () => verifyReleaseArtifacts({ releaseDirectory: changedInnerManifest, tag, commitSha }),
    /nicht bytegleich/u,
    "Abweichendes Manifest im ZIP muss scheitern."
  );

  const safeArchive = createDeterministicZip([{ name: "safe/file", data: Buffer.from("safe") }]);
  expectFailure(
    () => parseDeterministicZip(appendHiddenCompressedByte(safeArchive)),
    /Daten nach dem Deflate-Stream/u,
    "Nicht vom Deflate-Stream verbrauchte ZIP-Daten müssen scheitern."
  );
  expectFailure(
    () => parseDeterministicZip(replaceAllBytes(safeArchive, "safe/file", "../x/file")),
    /unsicherer ZIP-Pfad/u,
    "Pfadtraversal im ZIP muss scheitern."
  );
  expectFailure(
    () => parseDeterministicZip(replaceAllBytes(safeArchive, "safe/file", "/bad/file")),
    /unsicherer ZIP-Pfad/u,
    "Absolute ZIP-Pfade muessen scheitern."
  );

  const twoEntryArchive = createDeterministicZip([
    { name: "aa.txt", data: Buffer.from("one") },
    { name: "bb.txt", data: Buffer.from("two") }
  ]);
  expectFailure(
    () => parseDeterministicZip(replaceAllBytes(twoEntryArchive, "bb.txt", "aa.txt")),
    /doppelter ZIP-Pfad|nicht streng sortiert/u,
    "Doppelte ZIP-Pfade muessen scheitern."
  );
  expectFailure(
    () => createDeterministicZip([
      { name: "same.txt", data: Buffer.from("one") },
      { name: "same.txt", data: Buffer.from("two") }
    ]),
    /doppelter ZIP-Pfad/u,
    "Der Paketierer darf keine doppelten Pfade erzeugen."
  );

  const symlinkMetadataArchive = Buffer.from(safeArchive);
  const endOffset = symlinkMetadataArchive.length - 22;
  const centralOffset = symlinkMetadataArchive.readUInt32LE(endOffset + 16);
  symlinkMetadataArchive.writeUInt32LE((0o120777 << 16) >>> 0, centralOffset + 38);
  expectFailure(
    () => parseDeterministicZip(symlinkMetadataArchive),
    /deterministischen Metadatenvertrag/u,
    "Symlink-Metadaten im ZIP muessen scheitern."
  );

  const oversizedEntryArchive = Buffer.from(safeArchive);
  const oversizedEndOffset = oversizedEntryArchive.length - 22;
  const oversizedCentralOffset = oversizedEntryArchive.readUInt32LE(oversizedEndOffset + 16);
  oversizedEntryArchive.writeUInt32LE(
    releaseArtifactContract.maxEntryUncompressedBytes + 1,
    oversizedCentralOffset + 24
  );
  expectFailure(
    () => parseDeterministicZip(oversizedEntryArchive),
    /unkomprimierte Einzelgroesse/u,
    "Ein fremdes ZIP darf vor dem Inflate keine uebergrosse Ausgabe deklarieren."
  );

  const symlinkPath = path.join(pagesRoot, "unsafe-link");
  symlinkSync("index.html", symlinkPath);
  expectFailure(
    () => packageProductRelease({
      artifactRoot: pagesRoot,
      outputDirectory: path.join(fixtureRoot, "symlink-output"),
      tag,
      commitSha,
      productVersion
    }),
    /Symlink/u,
    "Symlinks im Pages-Quellartefakt muessen scheitern."
  );
  unlinkSync(symlinkPath);

  for (const [label, overrides, expected] of [
    ["wrong-profile", { profile: "target" }, /Profil pages/u],
    ["wrong-revision", { revision: "c".repeat(40) }, /statt/u],
    ["wrong-digest", { artifactDigest: `sha256:${"0".repeat(64)}` }, /Inhaltsdigest/u],
    ["wrong-source-version", { productVersion: "0.23.1" }, /Produktversion/u]
  ]) {
    const invalidPages = path.join(fixtureRoot, label);
    createPagesArtifact(invalidPages, overrides);
    expectFailure(
      () => packageProductRelease({
        artifactRoot: invalidPages,
        outputDirectory: path.join(fixtureRoot, `${label}-output`),
        tag,
        commitSha,
        productVersion
      }),
      expected,
      `${label} im Pages-Quellmanifest muss scheitern.`
    );
  }

  expectFailure(
    () => packageProductRelease({
      artifactRoot: pagesRoot,
      outputDirectory: path.join(fixtureRoot, "version-mismatch"),
      tag,
      commitSha,
      productVersion: "0.23.1"
    }),
    /stimmen nicht ueberein/u,
    "Tag und zentrale Produktversion muessen zusammenpassen."
  );
  expectFailure(
    () => packageProductRelease({
      artifactRoot: pagesRoot,
      outputDirectory: path.join(fixtureRoot, "short-commit"),
      tag,
      commitSha: commitSha.slice(0, 12),
      productVersion
    }),
    /vollstaendiger Commit/u,
    "Kurze Commit-SHAs muessen scheitern."
  );

  const staleOutput = path.join(fixtureRoot, "stale-output");
  write(path.join(staleOutput, "old.txt"), "stale\n");
  expectFailure(
    () => packageProductRelease({
      artifactRoot: pagesRoot,
      outputDirectory: staleOutput,
      tag,
      commitSha,
      productVersion
    }),
    /fehlen oder leer/u,
    "Der Paketierer darf keine alten Ausgaben verdecken."
  );

  expectFailure(
    () => packageProductRelease({
      artifactRoot: pagesRoot,
      outputDirectory: path.join(pagesRoot, "release-assets"),
      tag,
      commitSha,
      productVersion
    }),
    /nicht ueberlappen/u,
    "Release-Ausgabe darf nicht in das Pages-Artefakt geschrieben werden."
  );

  const cliProductVersion = JSON.parse(
    readFileSync(path.join(projectRoot, "config", "release.json"), "utf8")
  ).productVersion;
  const cliTag = `v${cliProductVersion}`;
  const cliCommit = "b".repeat(40);
  const cliPages = path.join(fixtureRoot, "cli-pages");
  createPagesArtifact(cliPages, { revision: cliCommit });
  const cliOutput = path.join(fixtureRoot, "cli-release");
  const githubOutput = path.join(fixtureRoot, "github-output.txt");
  const packageResult = spawnSync(process.execPath, [
    packageScript,
    "--artifact-root", cliPages,
    "--output-dir", cliOutput,
    "--tag", cliTag,
    "--commit-sha", cliCommit
  ], {
    cwd: projectRoot,
    env: { ...process.env, GITHUB_OUTPUT: githubOutput },
    encoding: "utf8"
  });
  assert.equal(packageResult.status, 0, `Package-CLI fehlgeschlagen:\n${packageResult.stderr}`);
  const githubOutputText = readFileSync(githubOutput, "utf8");
  assert.match(githubOutputText, new RegExp(`archive_name=versorgungs-kompass-${cliTag}-pages\\.zip`, "u"));
  assert.match(githubOutputText, /archive_path=/u);
  assert.match(githubOutputText, /manifest_path=/u);
  assert.match(githubOutputText, /checksums_path=/u);

  const verifyResult = spawnSync(process.execPath, [
    verifyScript,
    "--release-dir", cliOutput,
    "--tag", cliTag,
    "--commit-sha", cliCommit,
    "--artifact-root", cliPages
  ], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(verifyResult.status, 0, `Verify-CLI fehlgeschlagen:\n${verifyResult.stderr}`);
  assert.match(verifyResult.stdout, /Release-Artefakte verifiziert/u);

  console.log("Release artifact contract tests passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
