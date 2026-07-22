import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const appPath = "frontend/app/versorgungs-kompass.js";
const changelogPath = "CHANGELOG.md";
const readmePath = "README.md";
const releaseConfigPath = "config/release.json";
const releaseNotesDirectory = "release-notes";
const generatedNotesPath = "dist/release/weekly-notes.md";
const defaultIcon = "start";
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

function nextMinorVersion(current) {
  return [current[0], current[1] + 1, 0];
}

function nextPatchVersion(current) {
  return [current[0], current[1], current[2] + 1];
}

function nextVersion(current, bump) {
  if (bump === "minor") return nextMinorVersion(current);
  if (bump === "patch") return nextPatchVersion(current);
  throw new Error(`Unbekannter Versionssprung: ${bump}`);
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
  const output = git(["log", "--format=%H%x09%s", "--no-merges", `${baseRef}..HEAD`]);
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

function releaseBlock({ version, date, title }, heading = "## Aktueller Release") {
  return `${heading}

- Version: [v${version}](https://github.com/TimoFrank/mitmachen/releases/tag/v${version})
- Stand: ${date}
- Kurznotiz: ${title}
- Demo-Kanal: [GitHub Pages](https://timofrank.github.io/mitmachen/demo/)

`;
}

function updateReadme(source, release) {
  const sectionPattern = /(## (?:\d+\.\s*)?Aktueller Release\n\n)[\s\S]*?(?=\n## )/;
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
  return commits
    .slice(0, 50)
    .map(({ sha, subject }) => `- ${subject} ([${sha.slice(0, 7)}](https://github.com/TimoFrank/mitmachen/commit/${sha}))`)
    .join("\n");
}

function notesMarkdown({ version, tag, title, summary, changes, commits, baseRef }) {
  return `# ${title}

${releaseIntroduction}

## Das steckt in Version ${version}

${summary}

## Neue und verbesserte Funktionen

${changesMarkdown(changes)}

## Technische Änderungen

${technicalChangesMarkdown(commits)}

## Links

- Öffentliche Demo: https://timofrank.github.io/mitmachen/demo/
- Vollständiger Vergleich: https://github.com/TimoFrank/mitmachen/compare/${baseRef}...${tag}
- Changelog: https://github.com/TimoFrank/mitmachen/blob/${tag}/CHANGELOG.md
- Interner PoC: Auslieferung über den vereinbarten Target-Kanal
- Technischer Durchstich: https://github.com/TimoFrank/mitmachen/blob/main/dokumentation/betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md
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
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function versionCount(versions, target) {
  return versions.filter((version) => version === target).length;
}

function notesPathFor(version) {
  return `${releaseNotesDirectory}/v${version}.md`;
}

function notesTitle(source, version) {
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`Release Notes für ${version} enthalten keinen Titel.`);
  return title;
}

function verifyBaseRef(ref) {
  if (!gitSucceeds(["cat-file", "-e", `${ref}^{commit}`])) {
    throw new Error(`Release-Basis ${ref} ist im aktuellen Checkout nicht vorhanden.`);
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", ref, "HEAD"])) {
    throw new Error(`Release-Basis ${ref} ist kein Vorfahr von HEAD.`);
  }
}

function releasePlan() {
  const config = JSON.parse(readText(releaseConfigPath));
  if (config.schemaVersion !== 1) throw new Error("config/release.json verwendet eine unbekannte schemaVersion.");
  if (!parseVersion(config.baselineVersion)) throw new Error("config/release.json enthält keine gültige baselineVersion.");
  if (!config.baselineRef) throw new Error("config/release.json enthält keine baselineRef.");

  const appSource = readText(appPath);
  const changelogSource = readText(changelogPath);
  const appVersionList = appVersions(appSource);
  const changelogVersionList = changelogVersions(changelogSource);
  const noteVersionList = noteVersions();
  assertUniqueVersions("Die In-App-Historie", appVersionList);
  assertUniqueVersions("Der Changelog", changelogVersionList);
  assertUniqueVersions("Die Release Notes", noteVersionList);

  const reachableTags = gitTags({ reachableOnly: true });
  const releasedTagWasProvided = Object.hasOwn(process.env, "RELEASED_TAG");
  const releasedTag = releasedTagWasProvided
    ? String(process.env.RELEASED_TAG || "").trim()
    : latestTagName(reachableTags);
  if (releasedTag && !/^v\d+\.\d+\.\d+$/.test(releasedTag)) {
    throw new Error(`RELEASED_TAG ist kein Produkt-Release-Tag: ${releasedTag}`);
  }
  if (releasedTag && !reachableTags.includes(releasedTag)) {
    throw new Error(`Der veröffentlichte Release-Tag ${releasedTag} ist von HEAD aus nicht erreichbar.`);
  }

  const baselineVersion = parseVersion(config.baselineVersion);
  const releasedVersion = parseVersion(releasedTag);
  const currentVersion = highestVersion([config.baselineVersion, releasedTag]);
  if (!currentVersion) throw new Error("Die aktuelle Produktversion konnte nicht bestimmt werden.");

  const releasedTagIsCurrent = releasedVersion && compareVersions(releasedVersion, baselineVersion) >= 0;
  const baseRef = releasedTagIsCurrent ? releasedTag : config.baselineRef;
  verifyBaseRef(baseRef);

  const currentVersionText = formatVersion(currentVersion);
  const planningHead = git(["rev-parse", "HEAD"]);
  const allProjectedVersions = new Set([...appVersionList, ...changelogVersionList, ...noteVersionList]);
  const futureVersions = [...allProjectedVersions]
    .filter((version) => compareVersions(parseVersion(version), currentVersion) > 0)
    .sort((left, right) => compareVersions(parseVersion(left), parseVersion(right)));

  const completePendingVersions = [];
  for (const version of futureVersions) {
    const state = {
      app: versionCount(appVersionList, version),
      changelog: versionCount(changelogVersionList, version),
      notes: versionCount(noteVersionList, version)
    };
    if (state.app === 1 && state.changelog === 1 && state.notes === 1) {
      completePendingVersions.push(version);
      continue;
    }
    throw new Error(
      `Unvollständiger Release-Stand für ${version}: App=${state.app}, Changelog=${state.changelog}, Notes=${state.notes}.`
    );
  }
  if (completePendingVersions.length > 1) {
    throw new Error(`Mehrere unveröffentlichte Releases gefunden: ${completePendingVersions.join(", ")}`);
  }

  if (completePendingVersions.length === 1) {
    const version = completePendingVersions[0];
    const tag = `v${version}`;
    const notesPath = notesPathFor(version);
    const notes = readText(notesPath);
    const targetSha = git(["log", "-1", "--format=%H", "--", notesPath]);
    if (!targetSha) throw new Error(`Der Quell-Commit für ${notesPath} konnte nicht bestimmt werden.`);
    const existingTag = gitTags().includes(tag);
    if (existingTag && git(["rev-list", "-n", "1", tag]) !== targetSha) {
      throw new Error(`${tag} zeigt nicht auf den vorbereiteten Release-Commit ${targetSha}.`);
    }
    const title = notesTitle(notes, version);
    return {
      shouldRelease: true,
      mode: "resume",
      reason: "pending_release",
      version,
      tag,
      title,
      releaseTitle: `Versorgungs-Kompass ${tag}: ${title}`,
      notesPath,
      notes,
      baseRef,
      targetSha,
      planningHead,
      currentVersion: currentVersionText
    };
  }

  const commits = meaningfulCommits(commitsSince(baseRef));
  if (!commits.length) {
    return {
      shouldRelease: false,
      mode: "skip",
      reason: "no_changes",
      currentVersion: currentVersionText,
      baseRef,
      planningHead
    };
  }

  const bump = argumentValue("bump") || process.env.RELEASE_BUMP || config.defaultBump;
  const version = formatVersion(nextVersion(currentVersion, bump));
  const tag = `v${version}`;
  if (allProjectedVersions.has(version)) {
    throw new Error(`Die nächste Version ${version} ist bereits in einem Release-Dokument vorhanden.`);
  }
  if (gitTags().includes(tag)) {
    throw new Error(`Der Tag ${tag} existiert bereits, ist aber kein veröffentlichter Release der aktuellen Historie.`);
  }

  const changes = releaseChanges(commits);
  const { title, summary } = uniqueReleaseTheme(releaseTheme(commits), appSource, version);
  const release = {
    version,
    tag,
    date: releaseDateLabel(),
    title,
    summary,
    changes,
    commits,
    baseRef
  };
  return {
    shouldRelease: true,
    mode: "prepare",
    reason: "changes_detected",
    version,
    tag,
    title,
    releaseTitle: `Versorgungs-Kompass ${tag}: ${title}`,
    notesPath: notesPathFor(version),
    notes: notesMarkdown(release),
    baseRef,
    targetSha: "",
    planningHead,
    currentVersion: currentVersionText,
    release,
    appSource,
    changelogSource
  };
}

const plan = releasePlan();

if (dryRun) {
  if (!plan.shouldRelease) {
    console.log(`Kein Release erforderlich (${plan.reason}); aktuell ist ${plan.currentVersion}.`);
  } else {
    console.log(plan.notes);
    console.log(`${plan.mode === "resume" ? "Fortsetzen" : "Vorschau"} für ${plan.tag}: ${plan.title}`);
  }
} else if (!plan.shouldRelease) {
  writeGithubOutput({
    should_release: "false",
    mode: plan.mode,
    reason: plan.reason,
    current_version: plan.currentVersion,
    base_ref: plan.baseRef,
    planning_head: plan.planningHead
  });
  console.log(`Kein Release erforderlich (${plan.reason}); aktuell ist ${plan.currentVersion}.`);
} else {
  if (plan.mode === "prepare") {
    writeText(appPath, updateAppHistory(plan.appSource, plan.release));
    writeText(changelogPath, updateChangelog(plan.changelogSource, plan.release));
    writeText(readmePath, updateReadme(readText(readmePath), plan.release));
    mkdirSync(releaseNotesDirectory, { recursive: true });
    writeText(plan.notesPath, plan.notes);
  }
  mkdirSync("dist/release", { recursive: true });
  writeText(generatedNotesPath, plan.notes);

  writeGithubOutput({
    should_release: "true",
    mode: plan.mode,
    reason: plan.reason,
    tag: plan.tag,
    title: plan.releaseTitle,
    version: plan.version,
    notes_path: plan.notesPath,
    base_ref: plan.baseRef,
    target_sha: plan.targetSha,
    planning_head: plan.planningHead
  });

  console.log(`${plan.mode === "resume" ? "Fortsetzbar" : "Vorbereitet"}: ${plan.tag} – ${plan.title}`);
}
