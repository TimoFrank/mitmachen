import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const appPath = "frontend/app/versorgungs-kompass.html";
const changelogPath = "CHANGELOG.md";
const readmePath = "README.md";
const defaultIcon = "start";

function readText(path) {
  return readFileSync(path, "utf8");
}

function writeText(path, value) {
  writeFileSync(path, value, "utf8");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseVersion(value) {
  const match = String(value || "").match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function formatVersion(parts) {
  return parts.join(".");
}

function compactVersion(version) {
  return String(version || "").replace(/\.0$/, "");
}

function highestVersion(values) {
  return values
    .map(parseVersion)
    .filter(Boolean)
    .sort(compareVersions)
    .at(-1);
}

function appVersions(appSource) {
  return [...appSource.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map((match) => match[1]);
}

function gitTags() {
  const output = git(["tag", "--list", "v[0-9]*"]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function nextMinorVersion(current) {
  return [current[0], current[1] + 1, 0];
}

function releaseDateLabel(now = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
    year: "numeric"
  }).format(now);
}

function releaseSlug(now = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
    year: "numeric"
  }).format(now);
}

function latestTagName(tags) {
  const parsed = tags
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .filter((entry) => entry.version)
    .sort((left, right) => compareVersions(left.version, right.version));
  return parsed.at(-1)?.tag || "";
}

function commitsSince(tag) {
  if (!tag) return [];
  const output = git(["log", "--format=%s", "--no-merges", `${tag}..HEAD`]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function releaseItems(commits) {
  const ignored = [/^Release v?\d+\.\d+\.\d+$/i, /^Automated weekly release/i];
  const usefulCommits = commits
    .filter((message) => !ignored.some((pattern) => pattern.test(message)))
    .slice(0, 5);

  if (!usefulCommits.length) {
    return [
      "Der Wochenstand dokumentiert den aktuellen stabilen Stand ohne neue fachliche Produktaenderungen.",
      "GitHub Pages, Changelog und Release-Markierung bleiben synchron.",
      "Die bekannten Grenzen von GitHub Pages, Supabase-Datenmodus und separater GCP-Demo bleiben transparent."
    ];
  }

  return [
    ...usefulCommits.map((message) => `Enthaelt: ${message}.`),
    "GitHub Pages, Changelog und Release-Markierung wurden fuer diesen Wochenstand synchronisiert."
  ].slice(0, 6);
}

function jsString(value) {
  return JSON.stringify(value);
}

function appReleaseObject({ version, date, title, summary, items }) {
  return `        {
          version: ${jsString(version)},
          date: ${jsString(date)},
          title: ${jsString(title)},
          icon: ${jsString(defaultIcon)},
          summary: ${jsString(summary)},
          items: [
${items.map((item) => `            ${jsString(item)}`).join(",\n")}
          ]
        },`;
}

function updateAppHistory(appSource, release) {
  const marker = "      const appVersionHistory = [\n";
  if (!appSource.includes(marker)) {
    throw new Error("Could not find appVersionHistory marker.");
  }
  return appSource.replace(marker, `${marker}${appReleaseObject(release)}\n`);
}

function changelogSection({ version, date, title, summary, items }) {
  return `## Version ${compactVersion(version)} - ${title}

${date}

${summary}

${items.map((item) => `- ${item}`).join("\n")}

`;
}

function updateChangelog(source, release) {
  const lines = source.split("\n");
  const insertIndex = lines.findIndex((line) => line.startsWith("## Version "));
  if (insertIndex === -1) {
    return `${source.trim()}\n\n${changelogSection(release)}`;
  }
  lines.splice(insertIndex, 0, changelogSection(release).trimEnd(), "");
  return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd()}\n`;
}

function releaseBlock({ version, date, title }) {
  return `## Aktueller Release

- Version: [v${version}](https://github.com/TimoFrank/mitmachen/releases/tag/v${version})
- Stand: ${date}
- Kurznotiz: ${title}
- Testumgebung: [GitHub Pages](https://timofrank.github.io/mitmachen/versorgungs-kompass.html)

`;
}

function updateReadme(source, release) {
  const block = releaseBlock(release);
  const sectionPattern = /## Aktueller Release\n\n[\s\S]*?(?=\n## )/;
  if (sectionPattern.test(source)) {
    return source.replace(sectionPattern, block.trimEnd());
  }
  const quickStartMarker = "\n## Schnellstart\n";
  if (!source.includes(quickStartMarker)) {
    return `${source.trimEnd()}\n\n${block}`;
  }
  return source.replace(quickStartMarker, `\n${block}${quickStartMarker.trimStart()}`);
}

function notesMarkdown({ version, title, summary, items }) {
  return `Automatisch vorbereiteter Wochenstand fuer Version ${version}.

## Zusammenfassung

${summary}

## Aenderungen

${items.map((item) => `- ${item}`).join("\n")}

## Links

- GitHub Pages: https://timofrank.github.io/mitmachen/versorgungs-kompass.html
- GCP-Demo: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app

## Bekannte Grenzen

- GitHub Pages und Live-Daten koennen auseinanderlaufen, weil die App im Supabase-Datenmodus laeuft.
- Die GCP-Demo ist ein separater Prototyp und nicht automatisch identisch mit GitHub Pages.
- Das gematik-/Kubernetes-Zielbild ist dokumentiert, aber nicht der aktuelle Live-Betrieb.

Release-Titel: ${title}
`;
}

function writeGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = [];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${String(value).replaceAll("\n", "%0A")}`);
  }
  writeFileSync(outputPath, `${lines.join("\n")}\n`, { flag: "a" });
}

const appSource = readText(appPath);
const tags = gitTags();
const currentVersion = highestVersion([...appVersions(appSource), ...tags]);

if (!currentVersion) {
  throw new Error("Could not determine current version.");
}

const nextVersion = formatVersion(nextMinorVersion(currentVersion));
const tag = `v${nextVersion}`;
const date = releaseDateLabel();
const title = `Wochenrelease ${releaseSlug()}`;
const latestTag = latestTagName(tags);
const commits = commitsSince(latestTag);
const items = releaseItems(commits);
const summary = latestTag
  ? `Woechentlicher Release-Stand mit den Aenderungen seit ${latestTag}.`
  : "Erster woechentlicher Release-Stand der automatisierten Releasepflege.";
const release = { version: nextVersion, date, title, summary, items };

writeText(appPath, updateAppHistory(appSource, release));
writeText(changelogPath, updateChangelog(readText(changelogPath), release));
writeText(readmePath, updateReadme(readText(readmePath), release));
writeText(".weekly-release-notes.md", notesMarkdown(release));

writeGithubOutput({
  tag,
  title: `Versorgungs-Kompass ${tag}`,
  version: nextVersion
});

console.log(`Prepared ${tag}: ${title}`);
