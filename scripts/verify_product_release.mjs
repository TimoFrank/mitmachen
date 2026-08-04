import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  compareProductVersions,
  parseProductVersion,
  releaseMetadata,
  releaseTitle,
  validateReleaseConfig
} from "./lib/release_policy.mjs";
import { validateProductVersionProjection } from "./lib/release_projection.mjs";

const gitFileMaxBuffer = 64 * 1024 * 1024;

function argument(name, { required = true } = {}) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  let value = inline === undefined ? "" : inline.slice(prefix.length);
  if (inline === undefined) {
    const index = process.argv.indexOf(`--${name}`);
    const following = index >= 0 ? process.argv[index + 1] || "" : "";
    value = following.startsWith("--") ? "" : following;
  }
  if (required && !value) throw new Error(`--${name} fehlt.`);
  return value;
}

function read(file) {
  return readFileSync(file, "utf8");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readAt(ref, file) {
  return execFileSync("git", ["show", `${ref}:${file}`], {
    encoding: "utf8",
    maxBuffer: gitFileMaxBuffer
  });
}

function pathsAt(ref, directory) {
  const output = git(["ls-tree", "-r", "--name-only", ref, "--", directory]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function appTitleFor(appSource, version) {
  const match = new RegExp(`version:\\s*"${escapeRegExp(version)}"`).exec(appSource);
  if (!match) return "";
  const remaining = appSource.slice(match.index + match[0].length);
  const nextVersion = remaining.search(/\bversion:\s*"\d+\.\d+\.\d+"/);
  const entrySource = nextVersion === -1 ? remaining : remaining.slice(0, nextVersion);
  const titleLiteral = entrySource.match(/title:\s*("(?:\\.|[^"\\])*")/)?.[1];
  if (!titleLiteral) return "";
  try {
    return JSON.parse(titleLiteral);
  } catch {
    return "";
  }
}

function section(source, heading) {
  const escaped = escapeRegExp(heading);
  const header = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!header) return "";
  const remaining = source.slice(header.index + header[0].length).replace(/^\r?\n+/, "");
  const nextHeader = remaining.search(/^## /m);
  return (nextHeader === -1 ? remaining : remaining.slice(0, nextHeader)).trim();
}

function assertNonemptySection(notes, heading, version) {
  if (!section(notes, heading)) {
    throw new Error(`Release Notes für ${version} benötigen den ausgefüllten Abschnitt „${heading}“.`);
  }
}

function inferredReleaseType(version) {
  return parseProductVersion(version).patch === 0 ? "weekly" : "hotfix";
}

function assertProjectionCounts({ version, releaseType, readme, changelog, appSource, policy }) {
  const parsed = parseProductVersion(version);
  const compactVersion = `${parsed.major}.${parsed.minor}`;
  const weeklyVersion = `${compactVersion}.0`;
  const escapedVersion = escapeRegExp(version);
  const escapedCompact = escapeRegExp(compactVersion);
  const escapedWeekly = escapeRegExp(weeklyVersion);
  const releaseLink = `https://github.com/TimoFrank/mitmachen/releases/tag/v${version}`;

  if (readme.split(releaseLink).length - 1 !== 1) {
    throw new Error(`README muss genau einmal auf v${version} verweisen.`);
  }

  const changelogHeaderCount = occurrences(
    changelog,
    new RegExp(`^## Version ${escapedCompact} -`, "gm")
  );
  if (changelogHeaderCount !== 1) {
    throw new Error(`Der Changelog muss den Abschnitt Version ${compactVersion} genau einmal enthalten.`);
  }
  const disallowedPatchHeaders = [...changelog.matchAll(/^## Version (\d+)\.(\d+)\.(\d+)\s+-/gm)]
    .map((match) => `${match[1]}.${match[2]}.${match[3]}`)
    .filter((entry) => compareProductVersions(entry, policy.effectiveFromVersion) >= 0);
  if (disallowedPatchHeaders.length) {
    throw new Error(`Hotfix ${disallowedPatchHeaders[0]} darf keinen eigenen Changelog-Abschnitt erhalten.`);
  }

  const weeklyAppCount = occurrences(
    appSource,
    new RegExp(`version:\\s*"${escapedWeekly}"`, "g")
  );
  if (weeklyAppCount !== 1) {
    throw new Error(`Die In-App-Historie muss die Wochenversion ${weeklyVersion} genau einmal enthalten.`);
  }

  const disallowedPatchVersions = [...appSource.matchAll(/version:\s*"(\d+)\.(\d+)\.(\d+)"/g)]
    .map((match) => ({
      version: `${match[1]}.${match[2]}.${match[3]}`,
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3])
    }))
    .filter((entry) => entry.patch > 0
      && compareProductVersions(entry.version, policy.effectiveFromVersion) >= 0);
  if (disallowedPatchVersions.length) {
    throw new Error(`Der Hotfix ${disallowedPatchVersions[0].version} darf keinen eigenen In-App-Haupteintrag enthalten.`);
  }

  if (releaseType === "weekly") return;

  const hotfixCount = occurrences(
    changelog,
    new RegExp(`^- \\*\\*Hotfix v${escapedVersion}:\\*\\*`, "gm")
  );
  if (hotfixCount !== 1) {
    throw new Error(`Der Changelog muss Hotfix v${version} genau einmal kompakt dokumentieren.`);
  }
}

function assertNotesContract(notes, version, releaseType) {
  const title = notes.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`Release Notes für ${version} enthalten keinen Titel.`);

  if (releaseType === "weekly") {
    for (const heading of [
      `Das steckt in Version ${version}`,
      "Neue und verbesserte Funktionen",
      "Technische Änderungen",
      "Prüfungen",
      "Bekannte Einschränkungen"
    ]) {
      assertNonemptySection(notes, heading, version);
    }
    return { title };
  }

  for (const heading of ["Anlass", "Korrektur", "Risiko", "Prüfung", "Technische Änderungen"]) {
    assertNonemptySection(notes, heading, version);
  }
  if (/^## (?:Das steckt in Version|Neue und verbesserte Funktionen)\b/m.test(notes)) {
    throw new Error(`Hotfix-Notes für ${version} müssen kompakt bleiben.`);
  }
  return { title, correction: section(notes, "Korrektur") };
}

function assertDocumentationConsistency({
  version,
  releaseType,
  publishedTitle,
  noteContract,
  readme,
  changelog,
  appSource,
  policy
}) {
  const parsed = parseProductVersion(version);
  const compactVersion = `${parsed.major}.${parsed.minor}`;
  const expectedPublishedTitle = releaseTitle(version, releaseType, {
    theme: releaseType === "weekly" ? noteContract.title : "",
    policy
  });
  if (publishedTitle !== expectedPublishedTitle) {
    throw new Error(`Release-Titel muss exakt „${expectedPublishedTitle}“ lauten.`);
  }
  if (releaseType === "weekly") {
    const expectedChangelogHeader = `## Version ${compactVersion} - ${noteContract.title}`;
    if (changelog.split(expectedChangelogHeader).length - 1 !== 1) {
      throw new Error(`Leitthema „${noteContract.title}“ muss genau einmal den Changelog-Abschnitt ${compactVersion} benennen.`);
    }
    if (readme.split(`- Kurznotiz: ${noteContract.title}`).length - 1 !== 1) {
      throw new Error(`README-Kurznotiz muss dem Weekly-Leitthema „${noteContract.title}“ entsprechen.`);
    }
    if (appTitleFor(appSource, version) !== noteContract.title) {
      throw new Error(`In-App-Titel muss dem Weekly-Leitthema „${noteContract.title}“ entsprechen.`);
    }
    return;
  }

  const expectedTitle = releaseTitle(version, "hotfix", { policy });
  if (noteContract.title !== expectedTitle) {
    throw new Error(`Hotfix-Notes müssen den Titel „${expectedTitle}“ tragen.`);
  }
  const expectedChangelogItem = `- **Hotfix v${version}:** ${noteContract.correction}`;
  if (changelog.split(expectedChangelogItem).length - 1 !== 1) {
    throw new Error(`Hotfix-Korrektur muss genau einmal identisch im Changelog dokumentiert sein.`);
  }
  if (readme.split(`- Kurznotiz: ${noteContract.correction}`).length - 1 !== 1) {
    throw new Error("README-Kurznotiz muss der dokumentierten Hotfix-Korrektur entsprechen.");
  }
}

function assertNoFutureProjection({ version, readme, changelog, appSource, notePaths }) {
  const appVersions = [...appSource.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)]
    .map((match) => match[1]);
  const changelogVersions = [...changelog.matchAll(/^## Version (\d+)\.(\d+)(?:\.(\d+))?\s+-/gm)]
    .map((match) => `${match[1]}.${match[2]}.${match[3] || "0"}`);
  const readmeVersions = [...readme.matchAll(/\/releases\/tag\/v(\d+\.\d+\.\d+)/g)]
    .map((match) => match[1]);
  const hotfixVersions = [...changelog.matchAll(/Hotfix v(\d+\.\d+\.\d+)/g)]
    .map((match) => match[1]);
  const noteVersions = notePaths
    .map((entry) => path.basename(entry).match(/^v(\d+\.\d+\.\d+)\.md$/)?.[1] || "")
    .filter(Boolean);
  const futureEntries = [
    ...appVersions.map((entry) => ["App", entry]),
    ...changelogVersions.map((entry) => ["Changelog", entry]),
    ...hotfixVersions.map((entry) => ["Changelog-Hotfix", entry]),
    ...readmeVersions.map((entry) => ["README", entry]),
    ...noteVersions.map((entry) => ["Notes", entry])
  ]
    .filter(([, entry]) => compareProductVersions(entry, version) > 0)
    .map(([source, entry]) => `${source} ${entry}`);
  if (futureEntries.length) {
    throw new Error(`Höhere Version als config/release.json.productVersion gefunden: ${futureEntries.join(", ")}.`);
  }
}

const tag = argument("tag");
const commitSha = argument("commit-sha");
const notesPath = argument("notes-path");
const publishedTitle = argument("release-title");
const artifactRoot = argument("artifact-root", { required: false });
const explicitReleaseType = argument("release-type", { required: false });

if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Ungültiger Produkt-Tag: ${tag}`);
if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error(`Ungültiger Release-Commit: ${commitSha}`);
if (explicitReleaseType && !["weekly", "hotfix"].includes(explicitReleaseType)) {
  throw new Error(`Unbekannter Release-Anlass: ${explicitReleaseType}`);
}

const version = tag.slice(1);
const head = git(["rev-parse", "HEAD"]);
if (head !== commitSha) throw new Error(`HEAD ${head} entspricht nicht dem Release-Commit ${commitSha}.`);

const config = validateReleaseConfig(JSON.parse(readAt(commitSha, "config/release.json")));
if (config.productVersion !== version) {
  throw new Error(`Der Tag ${tag} entspricht nicht config/release.json.productVersion ${config.productVersion}.`);
}
const parsedVersion = parseProductVersion(version);
if (parsedVersion.major >= 1) {
  throw new Error("Automatische Produkt-Releases ab 1.0.0 sind ohne nachgewiesene Zielbetriebsfreigabe gesperrt.");
}

const releaseType = inferredReleaseType(version);
if (explicitReleaseType && explicitReleaseType !== releaseType) {
  throw new Error(`Version ${version} ist ${releaseType}, nicht ${explicitReleaseType}.`);
}
const metadata = releaseMetadata(version, { policy: config.policy });
if (metadata.phase !== "release-candidate"
    || metadata.githubPrerelease !== true
    || metadata.githubLatest !== false) {
  throw new Error(`Version ${version} erfüllt den GitHub-Vertrag für Release Candidates nicht.`);
}

const expectedNotesPath = `dokumentation/release-notes/v${version}.md`;
if (notesPath !== expectedNotesPath) {
  throw new Error(`Release Notes müssen über ${expectedNotesPath} referenziert werden.`);
}
if (!gitSucceeds(["cat-file", "-e", `${commitSha}:${notesPath}`])) {
  throw new Error(`Release Notes fehlen im Release-Commit: ${notesPath}`);
}

const appSource = readAt(commitSha, "frontend/app/versorgungs-kompass.js");
const changelog = readAt(commitSha, "CHANGELOG.md");
const readme = readAt(commitSha, "README.md");
const notes = readAt(commitSha, notesPath);
const projectionFailures = validateProductVersionProjection({
  productVersion: version,
  readme,
  changelog,
  appHistory: appSource,
  releaseNotesExists: true
});
if (projectionFailures.length) {
  throw new Error(`Unvollständige Produktversionsprojektion für ${version}:\n- ${projectionFailures.join("\n- ")}`);
}
assertNoFutureProjection({
  version,
  readme,
  changelog,
  appSource,
  notePaths: pathsAt(commitSha, "dokumentation/release-notes")
});
assertProjectionCounts({
  version,
  releaseType,
  readme,
  changelog,
  appSource,
  policy: config.policy
});
const noteContract = assertNotesContract(notes, version, releaseType);
assertDocumentationConsistency({
  version,
  releaseType,
  publishedTitle,
  noteContract,
  readme,
  changelog,
  appSource,
  policy: config.policy
});

if (artifactRoot) {
  const manifestPath = path.join(artifactRoot, "build-manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Build-Manifest fehlt: ${manifestPath}`);
  const manifest = JSON.parse(read(manifestPath));
  if (manifest.profile !== "pages") throw new Error("Release-Artefakt verwendet nicht das Pages-Profil.");
  if (manifest.revision !== commitSha) {
    throw new Error(`Build-Manifest referenziert ${manifest.revision} statt ${commitSha}.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.artifactDigest || "")) {
    throw new Error("Build-Manifest enthält keinen gültigen Artefakt-Digest.");
  }
}

console.log(`Produkt-Release verifiziert: ${tag} (${releaseType}) @ ${commitSha}`);
