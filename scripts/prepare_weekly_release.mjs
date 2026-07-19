import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const appPath = "frontend/app/versorgungs-kompass.js";
const changelogPath = "CHANGELOG.md";
const readmePath = "README.md";
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
  const ignored = [/^Release v?\d+\.\d+\.\d+$/i, /^Automated weekly release/i];
  const usefulCommits = commits
    .filter((message) => !ignored.some((pattern) => pattern.test(message)))
    .slice(0, 12);

  if (!usefulCommits.length) {
    return [
      {
        title: "Stabil und bereit für die nächste Woche",
        description: "Der Versorgungs-Kompass bleibt auf einem geprüften und verlässlichen Stand. Das Team kann direkt mit Kontakten, Organisationen, Hospitationen und Erkenntnissen weiterarbeiten. Damit ist eine stabile Grundlage für die nächste gemeinsame Weiterentwicklung geschaffen."
      }
    ];
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
  const text = commits.join(" ").toLowerCase();
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

function notesMarkdown({ version, title, summary, changes }) {
  return `# ${title}

${releaseIntroduction}

## Das steckt in Version ${version}

${summary}

## Neue und verbesserte Funktionen

${changesMarkdown(changes)}

## Links

- Oeffentliche Demo: https://timofrank.github.io/mitmachen/demo/
- Geschuetzte Realanwendung: Auslieferung ueber den freigegebenen internen Target-Kanal
- Zielbetrieb und IT-Uebergabe: https://github.com/TimoFrank/mitmachen/blob/main/dokumentation/betrieb-und-deployment/IT_UEBERGABE_ZIELBETRIEB.md
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
const latestTag = latestTagName(tags);
const commits = commitsSince(latestTag);
const changes = releaseChanges(commits);
const { title, summary } = releaseTheme(commits);
const release = { version: nextVersion, date, title, summary, changes };

if (dryRun) {
  console.log(notesMarkdown(release));
  console.log(`Vorschau für ${tag}: ${title}`);
} else {
  writeText(appPath, updateAppHistory(appSource, release));
  writeText(changelogPath, updateChangelog(readText(changelogPath), release));
  writeText(readmePath, updateReadme(readText(readmePath), release));
  mkdirSync("dist/release", { recursive: true });
  writeText("dist/release/weekly-notes.md", notesMarkdown(release));

  writeGithubOutput({
    tag,
    title: `Versorgungs-Kompass ${tag}: ${title}`,
    version: nextVersion
  });

  console.log(`Vorbereitet: ${tag} – ${title}`);
}
