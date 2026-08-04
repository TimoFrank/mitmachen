import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("./prepare_weekly_release.mjs", import.meta.url));
const sourceRoot = path.resolve(path.dirname(generator), "..");
const releaseConfigTemplate = JSON.parse(readFileSync(path.join(sourceRoot, "config/release.json"), "utf8"));
const fixture = mkdtempSync(path.join(tmpdir(), "versorgungs-weekly-release-test-"));

function write(relativePath, content) {
  const target = path.join(fixture, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function read(relativePath) {
  return readFileSync(path.join(fixture, relativePath), "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: fixture, encoding: "utf8" }).trim();
}

function cleanReleaseEnvironment(overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    "GITHUB_OUTPUT",
    "RELEASED_TAG",
    "RELEASE_TYPE",
    "RELEASE_BUMP",
    "THEME",
    "HOTFIX_REASON",
    "HOTFIX_CORRECTION",
    "HOTFIX_RISK",
    "HOTFIX_VERIFICATION"
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides };
}

function runGenerator(args = [], {
  expectFailure = false,
  expectedError = "",
  outputName = "",
  releasedTag = "v0.22.0",
  env: environmentOverrides = {}
} = {}) {
  const releaseEnvironment = releasedTag === null ? {} : { RELEASED_TAG: releasedTag };
  const env = cleanReleaseEnvironment({ ...releaseEnvironment, ...environmentOverrides });
  if (outputName) env.GITHUB_OUTPUT = path.join(fixture, ".git", outputName);
  const result = spawnSync(process.execPath, [generator, ...args], {
    cwd: fixture,
    env,
    encoding: "utf8"
  });
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(
      `Release-Planer ${expectFailure ? "sollte fehlschlagen" : "ist fehlgeschlagen"}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  if (expectedError && !result.stderr.includes(expectedError)) {
    throw new Error(`Erwartete Fehlermeldung fehlt: ${expectedError}\n${result.stderr}`);
  }
  return result;
}

function outputValues(outputName) {
  return Object.fromEntries(
    read(`.git/${outputName}`)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertOutputKeys(values, expectedKeys, label) {
  for (const key of expectedKeys) {
    assert(Object.hasOwn(values, key), `${label} muss das GitHub-Output ${key} enthalten.`);
  }
}

function configWithVersion(version) {
  return `${JSON.stringify({ ...JSON.parse(read("config/release.json")), productVersion: version }, null, 2)}\n`;
}

const hotfixArguments = [
  "--hotfix-reason", "Kontakte konnten in einer Randbedingung nicht zuverlässig zugeordnet werden.",
  "--hotfix-correction", "Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.",
  "--hotfix-risk", "Gering; die Änderung betrifft nur die fehlerhafte Zuordnungslogik.",
  "--hotfix-verification", "Gezielter Regressionstest und vollständige Projektprüfung waren erfolgreich."
];
const secondHotfixArguments = [
  "--hotfix-reason", "Eine zweite Randbedingung konnte die Kontaktsuche verzögern.",
  "--hotfix-correction", "Die Kontaktsuche beendet die zweite Randbedingung jetzt ohne Verzögerung.",
  "--hotfix-risk", "Gering; die Korrektur ist auf den betroffenen Suchpfad begrenzt.",
  "--hotfix-verification", "Regressionstest für beide Randbedingungen und Projektprüfung waren erfolgreich."
];

try {
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Release Test"]);
  git(["config", "user.email", "release-test@example.invalid"]);

  const baselineConfig = {
    ...releaseConfigTemplate,
    productVersion: "0.22.0",
    baselineVersion: "0.22.0",
    baselineRef: "baseline"
  };
  write(".gitignore", "dist/\n");
  write("config/release.json", `${JSON.stringify(baselineConfig, null, 2)}\n`);
  write("frontend/app/versorgungs-kompass.js", `function fixture() {
      const appVersionHistory = [
        { version: "0.22.0", title: "Bestehende Basis" }
      ];
      return appVersionHistory;
}
`);
  write("CHANGELOG.md", `# Changelog

## Version 0.22 - Bestehende Basis

1. August 2026

Die bestehende Produktversion.

### Grundlage

Die bereinigte Baseline ist dokumentiert.
`);
  write("README.md", `# Fixture

## Aktueller Release

- Version: [v0.22.0](https://github.com/TimoFrank/mitmachen/releases/tag/v0.22.0)
- Stand: 1. August 2026
- Kurznotiz: Bestehende Basis
- Demo-Kanal: [GitHub Pages](https://timofrank.github.io/mitmachen/)
`);
  write("dokumentation/release-notes/v0.22.0.md", `# Bestehende Basis

## Das steckt in Version 0.22.0

Die bestehende Produktversion.

## Neue und verbesserte Funktionen

### Grundlage

Die bereinigte Baseline ist dokumentiert.

## Technische Änderungen

- Baseline erstellt.
`);
  git(["add", ".gitignore", "config/release.json", "frontend/app/versorgungs-kompass.js", "CHANGELOG.md", "README.md", "dokumentation/release-notes/v0.22.0.md"]);
  git(["commit", "-m", "Produktbasis 0.22.0 dokumentieren"]);
  git(["tag", "baseline"]);
  git(["tag", "v0.22.0"]);

  const cleanBefore = git(["status", "--porcelain"]);
  const noChange = runGenerator(
    ["--dry-run", "--release-type", "weekly", "--theme", "Test-Leitthema"],
    { outputName: "noop-output.txt" }
  );
  const noChangeOutput = outputValues("noop-output.txt");
  assertOutputKeys(noChangeOutput, [
    "should_release",
    "mode",
    "reason",
    "release_type",
    "current_version",
    "base_ref",
    "planning_head"
  ], "No-Change");
  assert(noChange.stdout.includes("Kein Release erforderlich"), "Ohne Änderungen darf kein Weekly entstehen.");
  assert(noChangeOutput.should_release === "false", "No-Change muss should_release=false ausgeben.");
  assert(noChangeOutput.mode === "noop", "No-Change muss mode=noop ausgeben.");
  assert(noChangeOutput.reason === "no_changes", "No-Change muss seinen Grund ausgeben.");
  assert(noChangeOutput.release_type === "weekly", "No-Change muss den Release-Typ ausgeben.");
  assert(git(["status", "--porcelain"]) === cleanBefore, "Ein Dry-Run darf den Arbeitsbaum nicht verändern.");

  const tagFallbackPreview = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: null }
  );
  assert(tagFallbackPreview.stdout.includes("Kein Release erforderlich"), "Nur der lokale Dry-Run darf auf erreichbare Git-Tags zurückfallen.");
  runGenerator(
    ["--release-type", "weekly"],
    {
      releasedTag: null,
      expectFailure: true,
      expectedError: "RELEASED_TAG muss für einen schreibenden Release-Lauf explizit gesetzt sein"
    }
  );

  git(["checkout", "--quiet", "-b", "empty-commit-noop"]);
  git(["commit", "--allow-empty", "-m", "Leeren Prüflauf dokumentieren"]);
  const emptyCommitNoop = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { outputName: "empty-commit-noop-output.txt" }
  );
  assert(emptyCommitNoop.stdout.includes("Kein Release erforderlich"), "Ein Commit ohne Baumänderung muss noop bleiben.");
  assert(outputValues("empty-commit-noop-output.txt").mode === "noop", "No-Change richtet sich nach dem Baum-Diff, nicht nur nach der Commit-Anzahl.");
  git(["checkout", "--quiet", "main"]);

  git(["checkout", "--quiet", "-b", "invalid-resume-ancestry"]);
  write("ancestry-feature.txt", "candidate\n");
  git(["add", "ancestry-feature.txt"]);
  git(["commit", "-m", "Kandidatenänderung vorbereiten"]);
  runGenerator(["--release-type", "weekly", "--theme", "Ancestry-Test"]);
  git(["add", "config/release.json", "README.md", "CHANGELOG.md", "frontend/app/versorgungs-kompass.js", "dokumentation/release-notes/v0.23.0.md"]);
  git(["commit", "-m", "Testkandidat 0.23.0 vorbereiten"]);
  write("late-base.txt", "published later\n");
  git(["add", "late-base.txt"]);
  git(["commit", "-m", "Veröffentlichte Basis nach Kandidat setzen"]);
  git(["tag", "v0.22.1"]);
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    {
      releasedTag: "v0.22.1",
      expectFailure: true,
      expectedError: "liegt nicht nach der veröffentlichten Basis"
    }
  );
  git(["checkout", "--quiet", "main"]);

  write("feature.txt", "contact improvement\n");
  git(["add", "feature.txt"]);
  git(["commit", "-m", "Kontaktübersicht verbessern"]);
  write("dependency.txt", "dependency update\n");
  git(["add", "dependency.txt"]);
  git(["commit", "-m", "Bump @playwright/test from 1.0.0 to 1.1.0"]);

  runGenerator(
    ["--release-type", "weekly", "--theme", "Test-Leitthema"],
    { outputName: "weekly-output.txt" }
  );
  const weeklyOutput = outputValues("weekly-output.txt");
  assertOutputKeys(weeklyOutput, [
    "should_release",
    "mode",
    "reason",
    "release_type",
    "current_version",
    "base_ref",
    "planning_head",
    "tag",
    "title",
    "version",
    "notes_path",
    "target_sha",
    "github_prerelease",
    "github_latest"
  ], "Weekly");
  assert(weeklyOutput.should_release === "true", "Weekly muss should_release=true ausgeben.");
  assert(weeklyOutput.mode === "prepare", "Der erste Weekly-Lauf muss mode=prepare ausgeben.");
  assert(weeklyOutput.release_type === "weekly", "Weekly muss release_type=weekly ausgeben.");
  assert(weeklyOutput.current_version === "0.22.0", "Die Ausgangsversion muss ausgegeben werden.");
  assert(weeklyOutput.version === "0.23.0" && weeklyOutput.tag === "v0.23.0", "Weekly muss Minor erhöhen und Patch auf 0 setzen.");
  assert(weeklyOutput.title === "Versorgungs-Kompass 0.23.0 — Release Candidate: Test-Leitthema", "Der RC-Titel muss dem Vertrag folgen.");
  assert(weeklyOutput.github_prerelease === "true" && weeklyOutput.github_latest === "false", "Weekly vor 1.0 muss Prerelease und nicht Latest sein.");
  assert(weeklyOutput.notes_path === "dokumentation/release-notes/v0.23.0.md", "Der Notes-Pfad muss deterministisch sein.");
  assert(JSON.parse(read("config/release.json")).productVersion === "0.23.0", "productVersion muss auf 0.23.0 steigen.");
  assert(read("CHANGELOG.md").match(/^## Version 0\.23 -/gm)?.length === 1, "Der Changelog muss das Weekly genau einmal enthalten.");
  assert(read("frontend/app/versorgungs-kompass.js").match(/version: "0\.23\.0"/g)?.length === 1, "Die In-App-Historie muss das Weekly genau einmal enthalten.");
  const weeklyNotes = read("dokumentation/release-notes/v0.23.0.md");
  assert(weeklyNotes.startsWith("# Test-Leitthema"), "Das Weekly benötigt das angegebene Leitthema.");
  assert(weeklyNotes.includes("## Das steckt in Version 0.23.0"), "Die vollständigen Weekly-Notes fehlen.");
  assert(weeklyNotes.includes("## Technische Änderungen"), "Technische Änderungen müssen dokumentiert sein.");
  assert(weeklyNotes.includes("## Prüfungen"), "Die Release-Gates müssen in den Weekly-Notes ausgewiesen sein.");
  assert(weeklyNotes.includes("## Bekannte Einschränkungen"), "Bekannte Kanal- und RC-Einschränkungen müssen ausgewiesen sein.");
  assert(weeklyNotes.includes("Bump @playwright/test"), "Technische Änderungen müssen nachvollziehbar bleiben.");
  assert(read("README.md").includes("/releases/tag/v0.23.0"), "README muss auf die neue zentrale Produktversion zeigen.");

  const preparedStatus = git(["status", "--porcelain"]);
  const dirtyResume = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { outputName: "dirty-resume-output.txt" }
  );
  assert(dirtyResume.stdout.includes("Fortsetzen für v0.23.0"), "Ein uncommitteter vorbereiteter Weekly muss als Resume erkannt werden.");
  assert(outputValues("dirty-resume-output.txt").mode === "resume", "Ein vorbereiteter Weekly muss mode=resume ausgeben.");
  assert(git(["status", "--porcelain"]) === preparedStatus, "Auch ein Resume-Dry-Run darf nichts verändern.");

  git(["add", "config/release.json", "README.md", "CHANGELOG.md", "frontend/app/versorgungs-kompass.js", "dokumentation/release-notes/v0.23.0.md"]);
  git(["commit", "-m", "Wochenrelease 0.23.0 vorbereiten"]);
  const weeklyReleaseCommit = git(["rev-parse", "HEAD"]);
  const committedResume = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { outputName: "committed-resume-output.txt" }
  );
  const committedResumeOutput = outputValues("committed-resume-output.txt");
  assert(committedResume.stdout.includes("Fortsetzen für v0.23.0"), "Ein committeter Kandidat muss fortsetzbar sein.");
  assert(committedResumeOutput.mode === "resume", "Ein committeter Kandidat muss mode=resume ausgeben.");
  assert(committedResumeOutput.target_sha === weeklyReleaseCommit, "Resume muss den exakten Release-Commit ausgeben.");

  git(["tag", "v0.23.0", weeklyReleaseCommit]);
  const taggedResume = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.22.0", outputName: "tagged-resume-output.txt" }
  );
  const taggedResumeOutput = outputValues("tagged-resume-output.txt");
  assert(taggedResume.stdout.includes("Fortsetzen für v0.23.0"), "Ein exakter, noch nicht als GitHub Release veröffentlichter Tag muss fortsetzbar bleiben.");
  assert(taggedResumeOutput.mode === "resume" && taggedResumeOutput.version === "0.23.0", "Der vorhandene exakte Tag muss als Resume erkannt werden.");
  assert(taggedResumeOutput.target_sha === weeklyReleaseCommit, "Der vorhandene exakte Tag muss auf den Release-Commit zeigen.");
  assert(!taggedResume.stdout.includes("v0.24.0"), "Ein vorhandener unveröffentlichter Kandidat darf nicht übersprungen werden.");

  git(["tag", "--force", "v0.23.0", "v0.22.0"]);
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    {
      releasedTag: "v0.23.0",
      expectFailure: true,
      expectedError: "enthält productVersion 0.22.0 statt 0.23.0"
    }
  );
  git(["tag", "--force", "v0.23.0", weeklyReleaseCommit]);

  const publishedWeekly = runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.23.0", outputName: "published-weekly-output.txt" }
  );
  assert(publishedWeekly.stdout.includes("Kein Release erforderlich"), "Ein veröffentlichter RC ohne neue Änderungen darf kein Folgerelease erzeugen.");

  write("hotfix.txt", "fixed\n");
  git(["add", "hotfix.txt"]);
  git(["commit", "-m", "Kontaktzuordnung korrigieren"]);
  runGenerator(
    ["--dry-run", "--release-type", "hotfix"],
    { releasedTag: "v0.23.0", expectFailure: true, expectedError: "Anlass, Korrektur, Risiko und Prüfung" }
  );
  const aliasPreview = runGenerator(
    ["--dry-run", "--bump", "patch", ...hotfixArguments],
    { releasedTag: "v0.23.0" }
  );
  assert(aliasPreview.stdout.includes("Vorschau für v0.23.1"), "--bump patch muss als kompatibler Hotfix-Alias funktionieren.");

  const appBeforeHotfix = read("frontend/app/versorgungs-kompass.js");
  runGenerator(
    ["--release-type", "hotfix", ...hotfixArguments],
    { releasedTag: "v0.23.0", outputName: "hotfix-output.txt" }
  );
  const hotfixOutput = outputValues("hotfix-output.txt");
  assert(hotfixOutput.mode === "prepare" && hotfixOutput.release_type === "hotfix", "Der Hotfix muss explizit vorbereitet werden.");
  assert(hotfixOutput.version === "0.23.1" && hotfixOutput.tag === "v0.23.1", "Der Hotfix muss Patch um eins erhöhen.");
  assert(hotfixOutput.title === "Versorgungs-Kompass 0.23.1 — Release Candidate (Hotfix)", "Der Hotfix-Titel muss dem RC-Vertrag folgen.");
  assert(read("frontend/app/versorgungs-kompass.js") === appBeforeHotfix, "Ein Hotfix darf keinen In-App-Haupteintrag erzeugen.");
  assert(read("CHANGELOG.md").includes("- **Hotfix v0.23.1:** Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig."), "Der Hotfix muss kompakt im laufenden Minor dokumentiert sein.");
  const hotfixNotes = read("dokumentation/release-notes/v0.23.1.md");
  for (const heading of ["## Anlass", "## Korrektur", "## Risiko", "## Prüfung", "## Technische Änderungen"]) {
    assert(hotfixNotes.includes(heading), `Die Hotfix-Notes benötigen ${heading}.`);
  }
  assert(!hotfixNotes.includes("## Neue und verbesserte Funktionen"), "Hotfix-Notes dürfen kein vollständiges Weekly vortäuschen.");

  git(["add", "config/release.json", "README.md", "CHANGELOG.md", "dokumentation/release-notes/v0.23.1.md"]);
  git(["commit", "-m", "Hotfix 0.23.1 vorbereiten"]);
  const hotfixReleaseCommit = git(["rev-parse", "HEAD"]);
  git(["tag", "v0.23.1", hotfixReleaseCommit]);

  write("second-hotfix.txt", "fixed again\n");
  git(["add", "second-hotfix.txt"]);
  git(["commit", "-m", "Kontaktsuche in zweiter Randbedingung korrigieren"]);
  const appBeforeSecondHotfix = read("frontend/app/versorgungs-kompass.js");
  runGenerator(
    ["--release-type", "hotfix", ...secondHotfixArguments],
    { releasedTag: "v0.23.1", outputName: "second-hotfix-output.txt" }
  );
  const secondHotfixOutput = outputValues("second-hotfix-output.txt");
  assert(secondHotfixOutput.version === "0.23.2" && secondHotfixOutput.tag === "v0.23.2", "Der zweite Hotfix muss Patch erneut um eins erhöhen.");
  assert(read("frontend/app/versorgungs-kompass.js") === appBeforeSecondHotfix, "Auch der zweite Hotfix darf keinen In-App-Haupteintrag erzeugen.");
  assert(read("CHANGELOG.md").includes("Hotfix v0.23.1") && read("CHANGELOG.md").includes("Hotfix v0.23.2"), "Beide Hotfixes müssen im laufenden Minor dokumentiert sein.");
  git(["add", "config/release.json", "README.md", "CHANGELOG.md", "dokumentation/release-notes/v0.23.2.md"]);
  git(["commit", "-m", "Hotfix 0.23.2 vorbereiten"]);
  const secondHotfixReleaseCommit = git(["rev-parse", "HEAD"]);
  git(["tag", "v0.23.2", secondHotfixReleaseCommit]);

  const noWeeklyAfterHotfix = runGenerator(
    ["--dry-run", "--release-type", "weekly", "--theme", "Nächstes Weekly"],
    { releasedTag: "v0.23.2" }
  );
  assert(noWeeklyAfterHotfix.stdout.includes("Kein Release erforderlich"), "Der Freitag direkt nach v0.23.2 ohne neue Commits muss noop bleiben.");

  write("next-feature.txt", "network improvement\n");
  git(["add", "next-feature.txt"]);
  git(["commit", "-m", "Netzwerkübersicht erweitern"]);
  runGenerator(
    ["--release-type", "weekly", "--theme", "Netzwerk im Blick"],
    { releasedTag: "v0.23.2", outputName: "carry-forward-output.txt" }
  );
  const carryForwardOutput = outputValues("carry-forward-output.txt");
  assert(carryForwardOutput.version === "0.24.0", "Ein Weekly nach Hotfix muss zum nächsten Minor mit Patch 0 springen.");
  const carryForwardNotes = read("dokumentation/release-notes/v0.24.0.md");
  assert(carryForwardNotes.includes("## Mitgeführte Hotfixes"), "Das nächste echte Weekly muss Hotfixes sichtbar mitführen.");
  assert(carryForwardNotes.includes("Hotfix v0.23.1"), "Der veröffentlichte Hotfix muss in den Weekly-Notes mitgeführt werden.");
  assert(carryForwardNotes.includes("Hotfix v0.23.2"), "Auch der zweite veröffentlichte Hotfix muss in den Weekly-Notes mitgeführt werden.");
  assert(read("CHANGELOG.md").includes("### Hotfix v0.23.1") && read("CHANGELOG.md").includes("### Hotfix v0.23.2"), "Beide Hotfixes müssen im neuen Weekly-Changelog als übernommene Änderungen erscheinen.");
  assert(read("frontend/app/versorgungs-kompass.js").includes("Hotfix v0.23.1:") && read("frontend/app/versorgungs-kompass.js").includes("Hotfix v0.23.2:"), "Beide Hotfixes müssen mit dem nächsten Weekly in der In-App-Historie ankommen.");

  git(["add", "config/release.json", "README.md", "CHANGELOG.md", "frontend/app/versorgungs-kompass.js", "dokumentation/release-notes/v0.24.0.md"]);
  git(["commit", "-m", "Wochenrelease 0.24.0 vorbereiten"]);
  git(["tag", "v0.24.0"]);

  const validConfig = read("config/release.json");
  write("config/release.json", configWithVersion("0.24.1"));
  runGenerator(
    ["--dry-run", "--release-type", "hotfix", ...hotfixArguments],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "Unvollständige Produktversionsprojektion" }
  );
  write("config/release.json", validConfig);

  const validAppHistory = read("frontend/app/versorgungs-kompass.js");
  write("frontend/app/versorgungs-kompass.js", validAppHistory.replace(
    "      const appVersionHistory = [\n",
    "      const appVersionHistory = [\n        { version: \"0.23.1\", title: \"Unzulässiger alter Hotfix\" },\n"
  ));
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "Unzulässige Hotfix-Projektionen" }
  );
  write("frontend/app/versorgungs-kompass.js", validAppHistory);

  const validChangelog = read("CHANGELOG.md");
  write("CHANGELOG.md", `${validChangelog.trimEnd()}\n\n- **Hotfix v0.24.1:** Unzulässige Zukunftsprojektion.\n`);
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "Changelog-Hotfix 0.24.1" }
  );
  write("CHANGELOG.md", validChangelog);

  git(["tag", "v0.25.0"]);
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "Höhere Version als config/release.json.productVersion" }
  );

  write("config/release.json", configWithVersion("1.0.0"));
  runGenerator(
    ["--dry-run", "--release-type", "weekly"],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "ab 1.0.0" }
  );
  write("config/release.json", validConfig);

  runGenerator(
    ["--dry-run", "--release-type", "weekly", "--bump", "patch"],
    { releasedTag: "v0.24.0", expectFailure: true, expectedError: "widerspricht" }
  );

  console.log("Weekly-/Hotfix-Release-Planer erfolgreich getestet.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
