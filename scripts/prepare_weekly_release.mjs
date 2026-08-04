import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  compareProductVersions,
  formatTechnicalTag,
  loadReleaseConfig,
  nextProductVersion,
  parseProductVersion,
  releaseMetadata,
  releaseTitle,
  validateReleaseConfig
} from "./lib/release_policy.mjs";
import { validateProductVersionProjection } from "./lib/release_projection.mjs";

const appPath = "frontend/app/versorgungs-kompass.js";
const changelogPath = "CHANGELOG.md";
const readmePath = "README.md";
const releaseConfigPath = "config/release.json";
const releaseNotesDirectory = "dokumentation/release-notes";
const generatedNotesPath = "dist/release/weekly-notes.md";
const defaultIcon = "start";
const gitFileMaxBuffer = 64 * 1024 * 1024;
const dryRun = process.argv.includes("--dry-run");
const releaseIntroduction =
  "#Mitmachen verbindet Menschen, die die digitale Versorgung gemeinsam gestalten. Der Versorgungs-Kompass macht Kontakte, Organisationen, Wissen und Aktivitäten sichtbar und hilft dem Netzwerk, die Versorgung gemeinsam weiterzuentwickeln.";

const productTourChange = {
  group: "product-tour",
  title: "Schneller im Versorgungs-Kompass ankommen",
  description: "Die Produkttour bündelt den Einstieg in die wichtigsten Bereiche des Versorgungs-Kompass. Sie erklärt zentrale Funktionen mit kurzen Hinweisen und klaren nächsten Schritten. Über die Seitenleiste kann die Tour jederzeit erneut gestartet werden."
};

const registrationFlowChange = {
  group: "registration-flow",
  title: "Sicher ins #Mitmachen-Netzwerk starten",
  description: "Der neue Registrierungs-Flow führt Schritt für Schritt in das geschützte #Mitmachen-Netzwerk. Dabei ist klar erkennbar, welche Angaben benötigt werden und welche Profilinformationen freiwillig sind. Nach der Prüfung können neue Profile kontrolliert mit bestehenden Kontakten und Organisationen im Versorgungs-Kompass verbunden werden."
};

const consentDocumentationChange = {
  group: "consent-documentation",
  title: "Einwilligungen nachvollziehbar dokumentieren",
  description: "Der Versorgungs-Kompass dokumentiert jetzt, ob die erforderliche Einwilligung für #Mitmachen vorliegt. Der Status wird zusammen mit dem Registrierungsprofil festgehalten und bleibt bei der weiteren Bearbeitung nachvollziehbar. So erkennen Verantwortliche, welche Registrierungen vollständig sind und wo noch eine Klärung erforderlich ist."
};

const curatedChanges = new Map([
  ["Expand and enrich app tour", productTourChange],
  ["Improve app tour onboarding and sidebar access", productTourChange],
  ["Clarify optional registration profile", registrationFlowChange],
  ["Build secure network registration flow", registrationFlowChange],
  ["Add #Mitmachen consent tracking", consentDocumentationChange],
  [
    "Kontaktprofil auf Desktop verbreitern",
    {
      group: "desktop-contact-profile",
      title: "Kontaktprofile mit mehr Überblick",
      description: "Kontaktprofile nutzen auf größeren Bildschirmen den verfügbaren Platz besser aus. Angaben, Zuständigkeiten und weitere Details lassen sich dadurch schneller erfassen. Das unterstützt Teams dabei, Kontakte übersichtlich zu prüfen und gemeinsam weiterzubearbeiten."
    }
  ],
  [
    "Add primary systems to organizations",
    {
      group: "organization-primary-systems",
      title: "Primärsysteme bei Organisationen im Blick",
      description: "Organisationen können mit ihren eingesetzten Primärsystemen beschrieben werden. Dadurch werden technische Zusammenhänge im Versorgungsnetzwerk besser sichtbar. Teams erhalten mehr Kontext für Gespräche, Hospitationen und die gemeinsame Weiterentwicklung der Versorgung."
    }
  ]
]);

function readText(path) {
  return readFileSync(path, "utf8");
}

function readTextAt(ref, path) {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: gitFileMaxBuffer
  });
}

function writeText(path, value) {
  writeFileSync(path, value, "utf8");
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

function gitOutput(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function parseVersion(value) {
  const match = String(value || "").match(/^v?(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
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

function appVersions(appSource) {
  return [...appSource.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map((match) => match[1]);
}

function appReleaseTitles(appSource) {
  const marker = "      const appVersionHistory = [\n";
  const start = appSource.indexOf(marker);
  if (start === -1) return [];
  const end = appSource.indexOf("\n      ];", start + marker.length);
  const historySource = end === -1
    ? appSource.slice(start + marker.length)
    : appSource.slice(start + marker.length, end);
  return [...historySource.matchAll(/title:\s*"([^"\n]+)"/g)].map((match) => match[1]);
}

function changelogVersions(source) {
  return [...source.matchAll(/^## Version (\d+\.\d+(?:\.\d+)?)\s+-/gm)].map((match) => formatVersion(parseVersion(match[1])));
}

function noteVersions() {
  if (!existsSync(releaseNotesDirectory)) return [];
  return readdirSync(releaseNotesDirectory)
    .map((name) => name.match(/^v(\d+\.\d+\.\d+)\.md$/)?.[1] || "")
    .filter(Boolean);
}

function assertUniqueVersions(label, versions) {
  const counts = new Map();
  for (const version of versions) {
    const normalized = formatVersion(parseVersion(version));
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([version]) => version);
  if (duplicates.length) {
    throw new Error(`${label} enthält doppelte Versionen: ${duplicates.join(", ")}`);
  }
}

function gitTags({ reachableOnly = false } = {}) {
  const args = reachableOnly
    ? ["tag", "--merged", "HEAD", "--list", "v[0-9]*"]
    : ["tag", "--list", "v[0-9]*"];
  const output = git(args);
  return output ? output.split("\n").filter(Boolean) : [];
}

function releaseDateLabel(now = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
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

function commitsSince(baseRef) {
  const output = git(["log", "--format=%H%x09%s", `${baseRef}..HEAD`]);
  return output
    ? output.split("\n").filter(Boolean).map((line) => {
      const separator = line.indexOf("\t");
      return { sha: line.slice(0, separator), subject: line.slice(separator + 1) };
    })
    : [];
}

function meaningfulCommits(commits) {
  const ignored = [
    /^Release v?\d+\.\d+\.\d+$/i,
    /^Automated weekly release/i
  ];
  return commits.filter(({ subject }) => !ignored.some((pattern) => pattern.test(subject)));
}

function technicalOnlyCommit({ subject }) {
  const value = String(subject || "").trim();
  return /^(?:Bump|Dependabot)\b/i.test(value)
    || /^(?:build|chore|ci|docs?|refactor|test)(?:\(.+\))?:/i.test(value)
    || /^Document\b/i.test(value)
    || /\bdocumentation\b/i.test(value)
    || /^Prepare gematik PoC\b/i.test(value)
    || /\b(?:Artifact Registry|Cloud SQL|GCS|GKE|IAP|migration|PostgreSQL|pre-gematik|runtime role|Terraform)\b/i.test(value);
}

function productCommits(commits) {
  return commits.filter((commit) => !technicalOnlyCommit(commit));
}

function releaseArea(message) {
  const value = String(message || "").toLowerCase();
  if (/registr|network|netzwerk|consent|einwillig|onboarding|app tour/.test(value)) return "Einstieg und #Mitmachen";
  if (/questionnaire|fragebogen|dropdown|select/.test(value)) return "Fragebogen";
  if (/hospitation/.test(value)) return "Hospitationen";
  if (/framework|evidence|beobachtung|codier|hypoth/.test(value)) return "Erkenntnisse und Framework";
  if (/activit|aktivität/.test(value)) return "Aktivitäten";
  if (/map|karte/.test(value)) return "Karte";
  if (/contact|kontakt/.test(value)) return "Kontakte";
  if (/organi|primary system|primärsystem/.test(value)) return "Organisationen";
  if (/format|excel|export|import/.test(value)) return "Formate und Datenaustausch";
  if (/search|suche|filter/.test(value)) return "Suche und Filter";
  if (/mobile|mobil/.test(value)) return "Mobile Nutzung";
  return "Versorgungs-Kompass";
}

function fallbackChange(message) {
  const area = releaseArea(message);
  const value = String(message || "").trim();
  const englishAction = value.match(/^(Add|Autofill|Build|Center|Clarify|Compact|Convert|Expand|Fix|Fuse|Harmonize|Highlight|Implement|Improve|Increase|Make|Mark|Move|Optimize|Polish|Redesign|Refine|Remove|Rename|Replace|Reposition|Reshape|Restrict|Shorten|Show|Simplify|Split|Stack|Strengthen|Structure|Trigger|Tune|Unpin|Update|Use|Align)\b/i)?.[1]?.toLowerCase();
  const likelyGerman = /[äöüß]/i.test(value) || /\b(als|auf|einführen|für|gestalten|im|in|modernisieren|modernisiere|ohne|schärfen|straffen|und|zeigen|zum|zur)\b/i.test(value);

  if (!englishAction && likelyGerman) {
    return {
      title: value.replace(/[.!?]+$/, ""),
      description: `Die Änderung macht den Bereich ${area} klarer und leichter nutzbar. Die wichtigsten Schritte sind schneller nachvollziehbar. So bleibt mehr Zeit für die gemeinsame Arbeit im Versorgungsnetzwerk.`
    };
  }

  if (!englishAction) {
    return {
      title: `Verbesserungen für ${area}`,
      description: `Der Bereich ${area} wurde weiterentwickelt. Die Änderung erleichtert die tägliche Arbeit mit dem Versorgungs-Kompass. Wichtige Informationen und Funktionen sind dadurch schneller erreichbar.`
    };
  }

  if (["add", "build", "implement", "expand"].includes(englishAction)) {
    return {
      title: `Neue Möglichkeiten für ${area}`,
      description: `Der Bereich ${area} erhält neue Funktionen. Damit unterstützt der Versorgungs-Kompass die tägliche Arbeit noch besser. Die Erweiterung schafft zusätzliche Möglichkeiten für die Zusammenarbeit im Netzwerk.`
    };
  }
  if (englishAction === "fix") {
    return {
      title: `${area} zuverlässig nutzen`,
      description: `Eine störende Stelle im Bereich ${area} wurde behoben. Die Funktion arbeitet jetzt verlässlicher. Nutzer können ihre Arbeit dadurch ohne unnötige Unterbrechungen fortsetzen.`
    };
  }
  if (["simplify", "clarify", "improve", "refine", "polish", "optimize", "harmonize", "tune", "update", "strengthen"].includes(englishAction)) {
    return {
      title: `${area} leichter nutzen`,
      description: `Der Bereich ${area} wurde verständlicher und angenehmer gestaltet. Wichtige Informationen und Aktionen sind schneller zu erfassen. Das erleichtert die Orientierung bei der täglichen Arbeit.`
    };
  }
  return {
    title: `${area} übersichtlicher aufgebaut`,
    description: `Inhalte und Bedienelemente im Bereich ${area} sind klarer angeordnet. Das erleichtert die Orientierung im Versorgungs-Kompass. Die nächsten Schritte sind dadurch schneller erkennbar.`
  };
}

function releaseChanges(commits) {
  const usefulCommits = productCommits(commits)
    .map(({ subject }) => subject)
    .slice(0, 12);

  if (!usefulCommits.length) {
    return [{
      group: "technical-foundation",
      title: "Technische Grundlage aktualisiert",
      description: "Abhängigkeiten und technische Komponenten wurden geprüft und aktualisiert. Das hält den Versorgungs-Kompass stabil, sicher und für weitere Verbesserungen bereit. Für die Nutzung entstehen keine neuen Arbeitsschritte."
    }];
  }

  const groupedChanges = new Map();
  for (const message of usefulCommits) {
    const change = curatedChanges.get(message) || fallbackChange(message);
    const group = change.group || change.title;
    if (!groupedChanges.has(group)) groupedChanges.set(group, change);
  }
  return [...groupedChanges.values()].slice(0, 5);
}

function releaseTheme(commits) {
  const relevantCommits = productCommits(commits);
  if (!relevantCommits.length) {
    return {
      title: "Technische Basis gestärkt",
      summary: "Technische Komponenten und Abhängigkeiten wurden aktualisiert. Der Versorgungs-Kompass bleibt damit stabil, sicher und bereit für die nächsten fachlichen Verbesserungen."
    };
  }
  const text = relevantCommits.map(({ subject }) => subject).join(" ").toLowerCase();
  if (/registr|network|netzwerk|consent|einwillig|onboarding|app tour/.test(text)) {
    return {
      title: "Gemeinsam sicher vernetzt",
      summary: "Der Einstieg in #Mitmachen wird sicherer, klarer und persönlicher. Registrierung, Einwilligungen und Produkttour bringen Menschen schneller zu den passenden Kontakten und Funktionen."
    };
  }
  if (/hospitation/.test(text)) {
    return {
      title: "Versorgung erleben, Wissen teilen",
      summary: "Hospitationen lassen sich noch leichter planen, dokumentieren und auswerten. So werden Erfahrungen aus dem Versorgungsalltag zu Wissen, das das ganze Netzwerk weiterbringt."
    };
  }
  if (/framework|evidence|beobachtung|codier|hypoth/.test(text)) {
    return {
      title: "Vom Einblick zur Wirkung",
      summary: "Beobachtungen werden klarer erfasst und Schritt für Schritt zu gemeinsamen Erkenntnissen. Das stärkt die Verbindung zwischen Versorgungsalltag, Framework und Weiterentwicklung."
    };
  }
  if (/questionnaire|fragebogen/.test(text)) {
    return {
      title: "Beobachten. Verstehen. Verbessern.",
      summary: "Der Fragebogen führt schneller durch Beobachtungen und Zusammenhänge. Damit wird wertvolles Wissen aus der Versorgung einfacher nutzbar."
    };
  }
  if (/contact|kontakt|organi|map|karte/.test(text)) {
    return {
      title: "Menschen und Versorgung im Blick",
      summary: "Kontakte, Organisationen und ihr regionaler Kontext werden noch leichter sichtbar. Das hilft #Mitmachen, Verbindungen zu stärken und nächste Schritte gezielt zu planen."
    };
  }
  return {
    title: "Mehr Überblick. Mehr Verbindung.",
    summary: "Der Versorgungs-Kompass wird klarer, verlässlicher und leichter nutzbar. Die neuen Verbesserungen unterstützen das Netzwerk dabei, Wissen zu teilen und gemeinsam ins Handeln zu kommen."
  };
}

function uniqueReleaseTheme(theme, appSource, version) {
  const previousTitles = new Set(appReleaseTitles(appSource));
  if (!previousTitles.has(theme.title)) return theme;

  const fallback = {
    title: "Mehr Überblick. Mehr Verbindung.",
    summary: "Der Versorgungs-Kompass wird klarer, verlässlicher und leichter nutzbar. Die neuen Verbesserungen unterstützen das Netzwerk dabei, Wissen zu teilen und gemeinsam ins Handeln zu kommen."
  };
  if (!previousTitles.has(fallback.title)) return fallback;

  return {
    ...fallback,
    title: `Neues in Version ${compactVersion(version)}`
  };
}

function jsString(value) {
  return JSON.stringify(value);
}

function appReleaseObject({ version, date, title, summary, changes }) {
  return `        {
          version: ${jsString(version)},
          date: ${jsString(date)},
          title: ${jsString(title)},
          icon: ${jsString(defaultIcon)},
          summary: ${jsString(summary)},
          items: [
${changes.map((change) => `            ${jsString(`${change.title}: ${change.description}`)}`).join(",\n")}
          ]
        },`;
}

function updateAppHistory(appSource, release) {
  const marker = "      const appVersionHistory = [\n";
  if (!appSource.includes(marker)) {
    throw new Error("Could not find appVersionHistory marker.");
  }
  if (appVersions(appSource).includes(release.version)) {
    throw new Error(`Die In-App-Historie enthält Version ${release.version} bereits.`);
  }
  return appSource.replace(marker, `${marker}${appReleaseObject(release)}\n`);
}

function changesMarkdown(changes, headingLevel = 3) {
  const prefix = "#".repeat(headingLevel);
  return changes.map((change) => `${prefix} ${change.title}\n\n${change.description}`).join("\n\n");
}

function changelogSection({ version, date, title, summary, changes }) {
  return `## Version ${compactVersion(version)} - ${title}

${date}

${summary}

${changesMarkdown(changes)}

`;
}

function updateChangelog(source, release) {
  if (changelogVersions(source).includes(release.version)) {
    throw new Error(`Der Changelog enthält Version ${release.version} bereits.`);
  }
  const lines = source.split("\n");
  const insertIndex = lines.findIndex((line) => line.startsWith("## Version "));
  if (insertIndex === -1) {
    return `${source.trim()}\n\n${changelogSection(release)}`;
  }
  lines.splice(insertIndex, 0, changelogSection(release).trimEnd(), "");
  return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd()}\n`;
}

function updateChangelogWithHotfix(source, { version, correction }) {
  const parsed = parseProductVersion(version);
  const minorVersion = `${parsed.major}.${parsed.minor}`;
  const headerPattern = new RegExp(`^## Version ${minorVersion.replaceAll(".", "\\.")} -`, "m");
  const header = headerPattern.exec(source);
  if (!header) {
    throw new Error(`Der Hotfix ${version} besitzt keinen bestehenden Changelog-Abschnitt Version ${minorVersion}.`);
  }
  if (new RegExp(`Hotfix v${version.replaceAll(".", "\\.")}(?=[:;,.)!?\\s]|$)`).test(source)) {
    throw new Error(`Der Changelog enthält Hotfix v${version} bereits.`);
  }

  const sectionStart = header.index;
  const rest = source.slice(sectionStart + header[0].length);
  const followingHeaderOffset = rest.search(/^## Version /m);
  const sectionEnd = followingHeaderOffset === -1
    ? source.length
    : sectionStart + header[0].length + followingHeaderOffset;
  const section = source.slice(sectionStart, sectionEnd);
  const previousHotfixOffset = section.search(/^- \*\*Hotfix v\d+\.\d+\.\d+:/m);
  const firstSubheadingOffset = section.search(/^### /m);
  const relativeInsert = previousHotfixOffset >= 0
    ? previousHotfixOffset
    : firstSubheadingOffset >= 0
      ? firstSubheadingOffset
      : section.length;
  const insertIndex = sectionStart + relativeInsert;
  const entry = `- **Hotfix v${version}:** ${correction}\n\n`;
  const prefix = source.slice(0, insertIndex).replace(/\s*$/, "\n\n");
  const suffix = source.slice(insertIndex).replace(/^\s*/, "");
  return `${prefix}${entry}${suffix}`.replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

function releaseBlock({ version, date, title }, heading = "## Aktueller Release") {
  return `${heading}

- Version: [v${version}](https://github.com/TimoFrank/mitmachen/releases/tag/v${version})
- Stand: ${date}
- Kurznotiz: ${title}
- Demo-Kanal: [GitHub Pages](https://timofrank.github.io/mitmachen/)

`;
}

function updateReadme(source, release) {
  const sectionPattern = /(## (?:\d+\.\s*)?Aktueller Release\n\n)[\s\S]*?(?=\n## |\s*$)/;
  if (sectionPattern.test(source)) {
    return source.replace(sectionPattern, (_match, heading) => releaseBlock(release, heading.trim()).trimEnd());
  }
  const quickStartPattern = /(\n## (?:\d+\.\s*)?Schnellstart\n)/;
  if (!quickStartPattern.test(source)) {
    return `${source.trimEnd()}\n\n${releaseBlock(release).trimEnd()}\n`;
  }
  return source.replace(quickStartPattern, `\n${releaseBlock(release)}$1`);
}

function technicalChangesMarkdown(commits) {
  const entries = commits
    .slice(0, 50)
    .map(({ sha, subject }) => `- ${subject} ([${sha.slice(0, 7)}](https://github.com/TimoFrank/mitmachen/commit/${sha}))`)
    .join("\n");
  return entries || "- Keine zusätzlichen Commits seit dem vorherigen Produkt-Release.";
}

function carryoversMarkdown(carryovers) {
  if (!carryovers.length) return "";
  return `
## Mitgeführte Hotfixes

${carryovers.map(({ version, correction }) => `- **Hotfix v${version}:** ${correction}`).join("\n")}
`;
}

function notesMarkdown({
  version,
  tag,
  title,
  summary,
  changes,
  notesChanges = changes,
  commits,
  baseRef,
  carryovers = []
}) {
  return `# ${title}

${releaseIntroduction}

## Das steckt in Version ${version}

${summary}

## Neue und verbesserte Funktionen

${changesMarkdown(notesChanges)}
${carryoversMarkdown(carryovers)}

## Technische Änderungen

${technicalChangesMarkdown(commits)}

## Prüfungen

- Zentrale Version, Release-Unterlagen, Repository- und Browser-Verträge werden auf dem exakten Release-Commit geprüft.
- Der GitHub Release wird erst nach verifiziertem signiertem Tag, geprüftem Pages-Deployment und erfolgreicher Kontrolle aller drei Pflichtartefakte veröffentlicht.

## Bekannte Einschränkungen

- Version ${version} ist ein Release Candidate vor dem gesondert freizugebenden gematik-Zielbetrieb.
- Die öffentliche Pages-Demo arbeitet anonym mit synthetischen Daten; sie ist weder baugleich mit dem privaten GKE-Betrieb noch mit dem OIDC-Target.

## Links

- Öffentliche Demo: https://timofrank.github.io/mitmachen/
- Vollständiger Vergleich: https://github.com/TimoFrank/mitmachen/compare/${baseRef}...${tag}
- Changelog: https://github.com/TimoFrank/mitmachen/blob/${tag}/CHANGELOG.md
- Interner PoC: Auslieferung über den vereinbarten Target-Kanal
- Technischer Durchstich: https://github.com/TimoFrank/mitmachen/blob/main/dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md
`;
}

function hotfixNotesMarkdown({ version, tag, releaseTitle: publicTitle, details, commits, baseRef }) {
  return `# ${publicTitle}

## Anlass

${details.reason}

## Korrektur

${details.correction}

## Risiko

${details.risk}

## Prüfung

${details.verification}

## Technische Änderungen

${technicalChangesMarkdown(commits)}

## Links

- Öffentliche Demo: https://timofrank.github.io/mitmachen/
- Vollständiger Vergleich: https://github.com/TimoFrank/mitmachen/compare/${baseRef}...${tag}
- Changelog: https://github.com/TimoFrank/mitmachen/blob/${tag}/CHANGELOG.md
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

function argumentValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const following = index >= 0 ? process.argv[index + 1] || "" : "";
  return following.startsWith("--") ? "" : following;
}

function notesPathFor(version) {
  return `${releaseNotesDirectory}/v${version}.md`;
}

function notesTitle(source, version) {
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`Release Notes für ${version} enthalten keinen Titel.`);
  return title;
}

function inputValue(argumentName, environmentName) {
  return (argumentValue(argumentName) || process.env[environmentName] || "").trim();
}

function requestedReleaseType(config) {
  const explicit = inputValue("release-type", "RELEASE_TYPE");
  const bump = inputValue("bump", "RELEASE_BUMP");
  if (explicit && !["weekly", "hotfix"].includes(explicit)) {
    throw new Error(`Unbekannter Release-Anlass: ${explicit}`);
  }
  if (bump && !["minor", "patch"].includes(bump)) {
    throw new Error(`Unbekannter Versionssprung: ${bump}`);
  }
  const fromBump = bump === "patch" ? "hotfix" : bump === "minor" ? "weekly" : "";
  if (explicit && fromBump && explicit !== fromBump) {
    throw new Error(`Release-Anlass ${explicit} widerspricht dem Versionssprung ${bump}.`);
  }
  const releaseType = explicit || fromBump || "weekly";
  const expectedBump = config.policy.cadence[releaseType].bump;
  if (bump && bump !== expectedBump) {
    throw new Error(`Der Release-Anlass ${releaseType} benötigt den Versionssprung ${expectedBump}.`);
  }
  return releaseType;
}

function normalizedHotfixDetails() {
  const details = {
    reason: inputValue("hotfix-reason", "HOTFIX_REASON"),
    correction: inputValue("hotfix-correction", "HOTFIX_CORRECTION"),
    risk: inputValue("hotfix-risk", "HOTFIX_RISK"),
    verification: inputValue("hotfix-verification", "HOTFIX_VERIFICATION")
  };
  const missing = Object.entries(details)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Ein Hotfix benötigt Anlass, Korrektur, Risiko und Prüfung (fehlend: ${missing.join(", ")}).`);
  }
  for (const [key, value] of Object.entries(details)) {
    details[key] = value.replace(/\s+/g, " ").trim();
  }
  return details;
}

function notesSection(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!header) return "";
  const contentStart = header.index + header[0].length;
  const remaining = source.slice(contentStart).replace(/^\r?\n+/, "");
  const nextHeader = remaining.search(/^## /m);
  return (nextHeader === -1 ? remaining : remaining.slice(0, nextHeader)).trim();
}

function hotfixDetailsFromNotes(source, version) {
  const details = {
    reason: notesSection(source, "Anlass"),
    correction: notesSection(source, "Korrektur"),
    risk: notesSection(source, "Risiko"),
    verification: notesSection(source, "Prüfung")
  };
  if (Object.values(details).some((value) => !value)) {
    throw new Error(`Die Hotfix-Notes für ${version} benötigen Anlass, Korrektur, Risiko und Prüfung.`);
  }
  return details;
}

function inferTransitionType(fromVersion, toVersion) {
  const from = parseProductVersion(fromVersion);
  const to = parseProductVersion(toVersion);
  if (to.major === from.major && to.minor === from.minor + 1 && to.patch === 0) return "weekly";
  if (to.major === from.major && to.minor === from.minor && to.patch === from.patch + 1) return "hotfix";
  throw new Error(`Der Versionsübergang ${fromVersion} -> ${toVersion} ist weder Weekly noch Hotfix.`);
}

function projectionSources(version, ref = "") {
  const notesPath = notesPathFor(version);
  if (!ref) {
    return {
      readme: readText(readmePath),
      changelog: readText(changelogPath),
      appHistory: readText(appPath),
      releaseNotesExists: existsSync(notesPath),
      notes: existsSync(notesPath) ? readText(notesPath) : ""
    };
  }
  const releaseNotesExists = gitSucceeds(["cat-file", "-e", `${ref}:${notesPath}`]);
  return {
    readme: readTextAt(ref, readmePath),
    changelog: readTextAt(ref, changelogPath),
    appHistory: readTextAt(ref, appPath),
    releaseNotesExists,
    notes: releaseNotesExists ? readTextAt(ref, notesPath) : ""
  };
}

function assertProductProjection(version, { ref = "" } = {}) {
  const sources = projectionSources(version, ref);
  const failures = validateProductVersionProjection({
    productVersion: version,
    readme: sources.readme,
    changelog: sources.changelog,
    appHistory: sources.appHistory,
    releaseNotesExists: sources.releaseNotesExists
  });
  const exactReleaseLink = `https://github.com/TimoFrank/mitmachen/releases/tag/v${version}`;
  if (sources.readme.split(exactReleaseLink).length - 1 !== 1) {
    failures.push(`${readmePath}: v${version} muss genau einmal als aktueller Release verlinkt sein.`);
  }
  if (failures.length) {
    throw new Error(`Unvollständige Produktversionsprojektion für ${version}:\n- ${failures.join("\n- ")}`);
  }
  return sources;
}

function assertNoFutureProjection(
  productVersion,
  appVersionList,
  changelogVersionList,
  changelogSource,
  noteVersionList,
  readmeSource,
  reachableTags
) {
  const current = parseProductVersion(productVersion);
  const weeklyVersion = `${current.major}.${current.minor}.0`;
  const readmeVersionList = [
    ...readmeSource.matchAll(/\/releases\/tag\/v(\d+\.\d+\.\d+)/g)
  ].map((match) => match[1]);
  const hotfixVersionList = [
    ...changelogSource.matchAll(/Hotfix v(\d+\.\d+\.\d+)/g)
  ].map((match) => match[1]);
  const futureEntries = [
    ...appVersionList.filter((version) => compareProductVersions(version, weeklyVersion) > 0).map((version) => `App ${version}`),
    ...changelogVersionList.filter((version) => compareProductVersions(version, weeklyVersion) > 0).map((version) => `Changelog ${version}`),
    ...hotfixVersionList.filter((version) => compareProductVersions(version, productVersion) > 0).map((version) => `Changelog-Hotfix ${version}`),
    ...noteVersionList.filter((version) => compareProductVersions(version, productVersion) > 0).map((version) => `Notes ${version}`),
    ...readmeVersionList.filter((version) => compareProductVersions(version, productVersion) > 0).map((version) => `README ${version}`),
    ...reachableTags
      .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
      .filter((tag) => compareProductVersions(tag.slice(1), productVersion) > 0)
      .map((tag) => `Tag ${tag}`)
  ];
  if (futureEntries.length) {
    throw new Error(`Höhere Version als config/release.json.productVersion gefunden: ${futureEntries.join(", ")}.`);
  }
}

function assertNoForbiddenHotfixProjection(config, appVersionList, changelogVersionList) {
  const forbidden = [
    ...appVersionList
      .filter((version) => parseProductVersion(version).patch > 0)
      .filter((version) => compareProductVersions(version, config.policy.effectiveFromVersion) >= 0)
      .map((version) => `In-App ${version}`),
    ...changelogVersionList
      .filter((version) => parseProductVersion(version).patch > 0)
      .filter((version) => compareProductVersions(version, config.policy.effectiveFromVersion) >= 0)
      .map((version) => `Changelog-Abschnitt ${version}`)
  ];
  if (forbidden.length) {
    throw new Error(`Unzulässige Hotfix-Projektionen gefunden: ${forbidden.join(", ")}.`);
  }
}

function releaseProjectionIsDirty(version) {
  return Boolean(gitOutput([
    "status",
    "--porcelain",
    "--",
    releaseConfigPath,
    readmePath,
    changelogPath,
    appPath,
    notesPathFor(version)
  ]));
}

function hotfixCarryovers(currentVersion) {
  const current = parseProductVersion(currentVersion);
  if (current.patch === 0) return [];
  const carryovers = [];
  for (let patch = 1; patch <= current.patch; patch += 1) {
    const version = `${current.major}.${current.minor}.${patch}`;
    const path = notesPathFor(version);
    if (!existsSync(path)) {
      throw new Error(`Hotfix-Carry-forward ist unvollständig: ${path} fehlt.`);
    }
    const details = hotfixDetailsFromNotes(readText(path), version);
    carryovers.push({ version, correction: details.correction });
  }
  return carryovers;
}

function releaseConfigWithVersion(config, version) {
  return `${JSON.stringify({ ...config, productVersion: version }, null, 2)}\n`;
}

function verifyBaseRef(ref) {
  if (!gitSucceeds(["cat-file", "-e", `${ref}^{commit}`])) {
    throw new Error(`Release-Basis ${ref} ist im aktuellen Checkout nicht vorhanden.`);
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", ref, "HEAD"])) {
    throw new Error(`Release-Basis ${ref} ist kein Vorfahr von HEAD.`);
  }
}

function assertNotesContract(notes, releaseType, version) {
  notesTitle(notes, version);
  if (releaseType === "weekly") {
    for (const heading of [
      `Das steckt in Version ${version}`,
      "Neue und verbesserte Funktionen",
      "Technische Änderungen",
      "Prüfungen",
      "Bekannte Einschränkungen"
    ]) {
      if (!notesSection(notes, heading)) {
        throw new Error(`Die Weekly-Notes für ${version} benötigen den ausgefüllten Abschnitt ${heading}.`);
      }
    }
    return;
  }
  hotfixDetailsFromNotes(notes, version);
  if (!notesSection(notes, "Technische Änderungen")) {
    throw new Error(`Die Hotfix-Notes für ${version} benötigen ausgefüllte technische Änderungen.`);
  }
}

function releasePlan() {
  const config = loadReleaseConfig();
  const releaseType = requestedReleaseType(config);
  const productVersion = config.productVersion;
  const currentParsed = parseProductVersion(productVersion);
  if (currentParsed.major >= 1) {
    throw new Error("Automatische Weekly-/Hotfix-Releases ab 1.0.0 sind ohne Zielbetriebsfreigabe gesperrt.");
  }

  const appSource = readText(appPath);
  const changelogSource = readText(changelogPath);
  const appVersionList = appVersions(appSource);
  const changelogVersionList = changelogVersions(changelogSource);
  const noteVersionList = noteVersions();
  assertUniqueVersions("Die In-App-Historie", appVersionList);
  assertUniqueVersions("Der Changelog", changelogVersionList);
  assertUniqueVersions("Die Release Notes", noteVersionList);
  assertNoForbiddenHotfixProjection(config, appVersionList, changelogVersionList);
  const currentSources = assertProductProjection(productVersion);
  if (compareProductVersions(productVersion, config.policy.effectiveFromVersion) >= 0) {
    assertNotesContract(
      currentSources.notes,
      currentParsed.patch === 0 ? "weekly" : "hotfix",
      productVersion
    );
  }

  const reachableTags = gitTags({ reachableOnly: true });
  assertNoFutureProjection(
    productVersion,
    appVersionList,
    changelogVersionList,
    changelogSource,
    noteVersionList,
    readText(readmePath),
    reachableTags
  );
  const releasedTagWasProvided = Object.hasOwn(process.env, "RELEASED_TAG");
  if (!releasedTagWasProvided && !dryRun) {
    throw new Error("RELEASED_TAG muss für einen schreibenden Release-Lauf explizit gesetzt sein; Git-Tags allein belegen keine GitHub-Veröffentlichung.");
  }
  const releasedTag = releasedTagWasProvided
    ? String(process.env.RELEASED_TAG || "").trim()
    : latestTagName(reachableTags.filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag)));
  if (releasedTag && !/^v\d+\.\d+\.\d+$/.test(releasedTag)) {
    throw new Error(`RELEASED_TAG ist kein Produkt-Release-Tag: ${releasedTag}`);
  }
  if (releasedTag && !reachableTags.includes(releasedTag)) {
    throw new Error(`Der veröffentlichte Release-Tag ${releasedTag} ist von HEAD aus nicht erreichbar.`);
  }

  const releasedVersion = releasedTag ? releasedTag.slice(1) : config.baselineVersion;
  const baseRef = releasedTag || config.baselineRef;
  verifyBaseRef(baseRef);
  if (
    releasedTag
    && compareProductVersions(releasedVersion, config.policy.effectiveFromVersion) >= 0
  ) {
    let releasedConfig;
    try {
      releasedConfig = JSON.parse(readTextAt(releasedTag, releaseConfigPath));
      validateReleaseConfig(releasedConfig);
    } catch (error) {
      throw new Error(`Der veröffentlichte Tag ${releasedTag} enthält keine lesbare zentrale Release-Konfiguration (${error.message}).`);
    }
    if (releasedConfig.productVersion !== releasedVersion) {
      throw new Error(
        `Der veröffentlichte Tag ${releasedTag} enthält productVersion ${releasedConfig.productVersion || "unbekannt"} statt ${releasedVersion}.`
      );
    }
    const releasedSources = assertProductProjection(releasedVersion, { ref: releasedTag });
    const releasedParsed = parseProductVersion(releasedVersion);
    assertNotesContract(
      releasedSources.notes,
      releasedParsed.patch === 0 ? "weekly" : "hotfix",
      releasedVersion
    );
  }
  if (!releasedTag && compareProductVersions(productVersion, config.baselineVersion) !== 0) {
    throw new Error(`Ohne veröffentlichten Produkt-Tag muss productVersion der Baseline ${config.baselineVersion} entsprechen.`);
  }
  const releasedComparison = compareProductVersions(releasedVersion, productVersion);
  if (releasedComparison > 0) {
    throw new Error(`Die veröffentlichte Version ${releasedVersion} liegt über productVersion ${productVersion}.`);
  }

  const planningHead = git(["rev-parse", "HEAD"]);
  if (releasedComparison < 0) {
    const pendingType = inferTransitionType(releasedVersion, productVersion);
    if (pendingType !== releaseType) {
      throw new Error(`Der ausstehende ${pendingType}-Release ${productVersion} kann nicht als ${releaseType} fortgesetzt werden.`);
    }
    const metadata = releaseMetadata(productVersion, { policy: config.policy });
    if (metadata.phase !== "release-candidate") {
      throw new Error(`Der ausstehende Release ${productVersion} ist kein zulässiger automatischer Release Candidate.`);
    }

    const dirtyProjection = releaseProjectionIsDirty(productVersion);
    if (dirtyProjection && !dryRun) {
      throw new Error(`Der ausstehende Release ${productVersion} ist noch nicht committed und kann nur im Dry-Run geprüft werden.`);
    }
    const committedTarget = gitOutput(["log", "-1", "--format=%H", "--", releaseConfigPath]);
    if (!dirtyProjection && !committedTarget) {
      throw new Error(`Der Quell-Commit für ${releaseConfigPath} konnte nicht bestimmt werden.`);
    }
    const targetSha = dirtyProjection ? planningHead : committedTarget;
    if (!gitSucceeds(["merge-base", "--is-ancestor", baseRef, targetSha])) {
      throw new Error(`Der vorbereitete Release-Commit ${targetSha} liegt nicht nach der veröffentlichten Basis ${baseRef}.`);
    }
    let sources = assertProductProjection(productVersion);
    if (!dirtyProjection) {
      const targetConfig = JSON.parse(readTextAt(targetSha, releaseConfigPath));
      if (targetConfig.productVersion !== productVersion) {
        throw new Error(`${targetSha} enthält productVersion ${targetConfig.productVersion} statt ${productVersion}.`);
      }
      sources = assertProductProjection(productVersion, { ref: targetSha });
    }
    assertNotesContract(sources.notes, pendingType, productVersion);

    const tag = formatTechnicalTag(productVersion);
    if (gitTags().includes(tag) && git(["rev-list", "-n", "1", tag]) !== targetSha) {
      throw new Error(`${tag} zeigt nicht auf den vorbereiteten Release-Commit ${targetSha}.`);
    }
    const theme = pendingType === "weekly" ? notesTitle(sources.notes, productVersion) : "";
    const publicTitle = releaseTitle(productVersion, pendingType, { policy: config.policy, theme });
    return {
      shouldRelease: true,
      mode: "resume",
      reason: "pending_release",
      releaseType: pendingType,
      version: productVersion,
      tag,
      title: pendingType === "weekly" ? theme : hotfixDetailsFromNotes(sources.notes, productVersion).correction,
      releaseTitle: publicTitle,
      notesPath: notesPathFor(productVersion),
      notes: sources.notes,
      baseRef,
      targetSha,
      planningHead,
      currentVersion: productVersion,
      metadata
    };
  }

  const allCommits = commitsSince(baseRef);
  const hasChanges = !gitSucceeds(["diff", "--quiet", `${baseRef}..HEAD`, "--"]);
  if (!hasChanges) {
    return {
      shouldRelease: false,
      mode: "noop",
      reason: "no_changes",
      releaseType,
      currentVersion: productVersion,
      baseRef,
      planningHead
    };
  }
  const relevantCommits = meaningfulCommits(allCommits);
  const commits = relevantCommits.length ? relevantCommits : allCommits;

  const version = nextProductVersion(productVersion, releaseType, {
    hasChanges: true,
    policy: config.policy
  });
  const nextParsed = parseProductVersion(version);
  if (nextParsed.major >= 1 || compareProductVersions(version, config.policy.stable.firstVersion) >= 0) {
    throw new Error(`Der automatische Release ${version} würde die gesperrte Stable-Grenze erreichen.`);
  }
  const metadata = releaseMetadata(version, { policy: config.policy });
  if (metadata.phase !== "release-candidate") {
    throw new Error(`Der automatische Release ${version} liegt außerhalb der Release-Candidate-Phase.`);
  }
  const tag = formatTechnicalTag(version);
  if (noteVersionList.includes(version)) {
    throw new Error(`Die nächste Version ${version} ist bereits in den Release Notes vorhanden.`);
  }
  if (gitTags().includes(tag)) {
    throw new Error(`Der Tag ${tag} existiert bereits, ist aber kein veröffentlichter Release der aktuellen Historie.`);
  }

  const date = releaseDateLabel();
  const themeInput = inputValue("theme", "THEME").replace(/\s+/g, " ");
  if (releaseType === "hotfix" && themeInput) {
    throw new Error("Ein Hotfix erhält kein eigenes Leitthema.");
  }
  const carryovers = releaseType === "weekly" ? hotfixCarryovers(productVersion) : [];
  const carryoverChanges = carryovers.map(({ version: hotfixVersion, correction }) => ({
    group: `hotfix-${hotfixVersion}`,
    title: `Hotfix v${hotfixVersion}`,
    description: correction
  }));
  const themeCommits = [
    ...commits,
    ...carryovers.map(({ correction }) => ({ sha: "", subject: correction }))
  ];

  let release;
  let publicTitle;
  let notes;
  let projectedAppSource = appSource;
  let projectedChangelogSource;
  if (releaseType === "weekly") {
    const automaticTheme = uniqueReleaseTheme(releaseTheme(themeCommits), appSource, version);
    const title = themeInput || automaticTheme.title;
    const newChanges = releaseChanges(commits);
    release = {
      version,
      tag,
      date,
      title,
      summary: automaticTheme.summary,
      changes: [...carryoverChanges, ...newChanges],
      notesChanges: newChanges,
      commits,
      baseRef,
      carryovers
    };
    publicTitle = releaseTitle(version, releaseType, { policy: config.policy, theme: title });
    notes = notesMarkdown(release);
    projectedAppSource = updateAppHistory(appSource, release);
    projectedChangelogSource = updateChangelog(changelogSource, release);
  } else {
    const details = normalizedHotfixDetails();
    publicTitle = releaseTitle(version, releaseType, { policy: config.policy });
    release = {
      version,
      tag,
      date,
      title: details.correction,
      details,
      commits,
      baseRef
    };
    notes = hotfixNotesMarkdown({ ...release, releaseTitle: publicTitle });
    projectedChangelogSource = updateChangelogWithHotfix(changelogSource, {
      version,
      correction: details.correction
    });
  }
  assertNotesContract(notes, releaseType, version);

  return {
    shouldRelease: true,
    mode: "prepare",
    reason: "changes_detected",
    releaseType,
    version,
    tag,
    title: release.title,
    releaseTitle: publicTitle,
    notesPath: notesPathFor(version),
    notes,
    baseRef,
    targetSha: "",
    planningHead,
    currentVersion: productVersion,
    metadata,
    release,
    projectedConfigSource: releaseConfigWithVersion(config, version),
    projectedAppSource,
    projectedChangelogSource,
    projectedReadmeSource: updateReadme(readText(readmePath), release)
  };
}

function githubOutputs(plan) {
  const common = {
    should_release: plan.shouldRelease ? "true" : "false",
    mode: plan.mode,
    reason: plan.reason,
    release_type: plan.releaseType,
    current_version: plan.currentVersion,
    base_ref: plan.baseRef,
    planning_head: plan.planningHead
  };
  if (!plan.shouldRelease) return common;
  return {
    ...common,
    tag: plan.tag,
    title: plan.releaseTitle,
    version: plan.version,
    notes_path: plan.notesPath,
    target_sha: plan.targetSha,
    github_prerelease: String(plan.metadata.githubPrerelease),
    github_latest: String(plan.metadata.githubLatest)
  };
}

const plan = releasePlan();

if (dryRun) {
  writeGithubOutput(githubOutputs(plan));
  if (!plan.shouldRelease) {
    console.log(`Kein Release erforderlich (${plan.reason}); aktuell ist ${plan.currentVersion}.`);
  } else {
    console.log(plan.notes);
    console.log(`${plan.mode === "resume" ? "Fortsetzen" : "Vorschau"} für ${plan.tag}: ${plan.releaseTitle}`);
  }
} else if (!plan.shouldRelease) {
  writeGithubOutput(githubOutputs(plan));
  console.log(`Kein Release erforderlich (${plan.reason}); aktuell ist ${plan.currentVersion}.`);
} else {
  if (plan.mode === "prepare") {
    writeText(releaseConfigPath, plan.projectedConfigSource);
    writeText(appPath, plan.projectedAppSource);
    writeText(changelogPath, plan.projectedChangelogSource);
    writeText(readmePath, plan.projectedReadmeSource);
    mkdirSync(releaseNotesDirectory, { recursive: true });
    writeText(plan.notesPath, plan.notes);
    assertProductProjection(plan.version);
  }
  mkdirSync("dist/release", { recursive: true });
  writeText(generatedNotesPath, plan.notes);
  writeGithubOutput(githubOutputs(plan));
  console.log(`${plan.mode === "resume" ? "Fortsetzbar" : "Vorbereitet"}: ${plan.tag} – ${plan.releaseTitle}`);
}
