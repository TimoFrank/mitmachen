import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(new URL("./verify_product_release.mjs", import.meta.url));
const sourceRoot = path.resolve(path.dirname(verifier), "..");
const releaseConfigTemplate = JSON.parse(readFileSync(path.join(sourceRoot, "config/release.json"), "utf8"));
const fixture = mkdtempSync(path.join(tmpdir(), "versorgungs-product-release-test-"));

function write(relativePath, content) {
  const target = path.join(fixture, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: fixture, encoding: "utf8" }).trim();
}

function runVerifier({
  tag,
  commitSha = git(["rev-parse", "HEAD"]),
  notesPath = `dokumentation/release-notes/${tag}.md`,
  releaseType = "",
  releaseTitle = "",
  artifactRoot = "",
  expectFailure = false,
  expectedError = ""
}) {
  const version = tag.slice(1);
  const effectiveReleaseTitle = releaseTitle || (version.endsWith(".0")
    ? `Versorgungs-Kompass ${version} — Release Candidate: Versorgung vernetzt`
    : `Versorgungs-Kompass ${version} — Release Candidate (Hotfix)`);
  const args = [
    verifier,
    "--tag", tag,
    "--commit-sha", commitSha,
    "--notes-path", notesPath,
    "--release-title", effectiveReleaseTitle
  ];
  if (releaseType) args.push("--release-type", releaseType);
  if (artifactRoot) args.push("--artifact-root", artifactRoot);
  const result = spawnSync(process.execPath, args, {
    cwd: fixture,
    env: { ...process.env },
    encoding: "utf8"
  });
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(
      `Produkt-Release-Verifier ${expectFailure ? "sollte fehlschlagen" : "ist fehlgeschlagen"}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  if (expectedError && !result.stderr.includes(expectedError)) {
    throw new Error(`Erwartete Fehlermeldung fehlt: ${expectedError}\n${result.stderr}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function onCommittedBranch(name, paths, mutate, verify) {
  git(["checkout", "--quiet", "-b", name]);
  mutate();
  git(["add", ...paths]);
  git(["commit", "-m", `Ungültigen Prüffall ${name} erzeugen`]);
  verify(git(["rev-parse", "HEAD"]));
  git(["checkout", "--quiet", "main"]);
}

function releaseConfig(version) {
  return `${JSON.stringify({
    ...releaseConfigTemplate,
    productVersion: version,
    baselineVersion: "0.22.0",
    baselineRef: "baseline"
  }, null, 2)}\n`;
}

const weeklyAppCore = `function fixture() {
      const appVersionHistory = [
        { version: "0.23.0", title: "Versorgung vernetzt" },
        { version: "0.22.0", title: "Bestehende Basis" }
      ];
      return appVersionHistory;
}
`;
const weeklyApp = `${weeklyAppCore}\n/* Commit-Quellen-Puffer: ${"x".repeat(1_100_000)} */\n`;
const weeklyChangelog = `# Changelog

## Version 0.23 - Versorgung vernetzt

4. August 2026

Kontakte und Organisationen sind leichter zu verbinden.

### Netzwerkübersicht

Die Übersicht führt die wichtigsten Informationen zusammen.

## Version 0.22 - Bestehende Basis

Die bestehende Produktversion.
`;
const weeklyReadme = `# Fixture

## Aktueller Release

- Version: [v0.23.0](https://github.com/TimoFrank/mitmachen/releases/tag/v0.23.0)
- Stand: 4. August 2026
- Kurznotiz: Versorgung vernetzt
- Demo-Kanal: [GitHub Pages](https://timofrank.github.io/mitmachen/)
`;
const weeklyNotes = `# Versorgung vernetzt

## Das steckt in Version 0.23.0

Kontakte und Organisationen sind leichter zu verbinden.

## Neue und verbesserte Funktionen

### Netzwerkübersicht

Die Übersicht führt die wichtigsten Informationen zusammen.

## Technische Änderungen

- Release-Vertrag ergänzt.

## Prüfungen

- Repository-, Browser- und Artefaktverträge werden vor Veröffentlichung geprüft.

## Bekannte Einschränkungen

- Die Pages-Demo ist kein Nachweis für GKE oder den gematik-Zielbetrieb.

## Links

- Changelog: https://example.invalid/changelog
`;

try {
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Release Test"]);
  git(["config", "user.email", "release-test@example.invalid"]);
  write(".gitignore", "dist/\n");
  write("config/release.json", releaseConfig("0.23.0"));
  write("frontend/app/versorgungs-kompass.js", weeklyApp);
  write("CHANGELOG.md", weeklyChangelog);
  write("README.md", weeklyReadme);
  write("dokumentation/release-notes/v0.23.0.md", weeklyNotes);
  git(["add", ".gitignore", "config/release.json", "frontend/app/versorgungs-kompass.js", "CHANGELOG.md", "README.md", "dokumentation/release-notes/v0.23.0.md"]);
  git(["commit", "-m", "Wochenrelease 0.23.0 dokumentieren"]);
  git(["tag", "baseline"]);
  const weeklyCommit = git(["rev-parse", "HEAD"]);

  const verifiedWeekly = runVerifier({ tag: "v0.23.0", releaseType: "weekly" });
  assert(verifiedWeekly.stdout.includes("v0.23.0 (weekly)"), "Der Weekly-Verifier muss den erkannten Typ bestätigen.");
  runVerifier({
    tag: "v0.23.0",
    releaseType: "weekly",
    releaseTitle: "Versorgungs-Kompass 0.23.0 — Release Candidate: Falsches Thema",
    expectFailure: true,
    expectedError: "Release-Titel muss exakt"
  });

  write("dokumentation/release-notes/v0.23.0.md", weeklyNotes.replace("## Technische Änderungen", "## Uncommittierte Abweichung"));
  const committedSourceWins = runVerifier({ tag: "v0.23.0", releaseType: "weekly" });
  assert(committedSourceWins.stdout.includes("v0.23.0 (weekly)"), "Der Verifier muss ausschließlich den angegebenen Commit und nicht uncommittierte Dateien prüfen.");
  write("dokumentation/release-notes/v0.23.0.md", weeklyNotes);

  write("dist/pages/build-manifest.json", `${JSON.stringify({
    profile: "pages",
    revision: weeklyCommit,
    artifactDigest: `sha256:${"a".repeat(64)}`
  }, null, 2)}\n`);
  runVerifier({ tag: "v0.23.0", releaseType: "weekly", artifactRoot: "dist/pages" });

  runVerifier({
    tag: "v0.23.1",
    releaseType: "hotfix",
    expectFailure: true,
    expectedError: "entspricht nicht config/release.json.productVersion"
  });
  runVerifier({
    tag: "v0.23.0",
    releaseType: "hotfix",
    expectFailure: true,
    expectedError: "ist weekly, nicht hotfix"
  });
  runVerifier({
    tag: "v0.23.0",
    notesPath: "./dokumentation/release-notes/v0.23.0.md",
    expectFailure: true,
    expectedError: "müssen über dokumentation/release-notes/v0.23.0.md referenziert werden"
  });
  runVerifier({
    tag: "v0.23.0",
    commitSha: "0".repeat(40),
    expectFailure: true,
    expectedError: "entspricht nicht dem Release-Commit"
  });

  const invalidWeeklyNotes = weeklyNotes.replace("## Technische Änderungen", "## Interne Details");
  git(["checkout", "--quiet", "-b", "invalid-weekly-commit-source"]);
  write("dokumentation/release-notes/v0.23.0.md", invalidWeeklyNotes);
  git(["add", "dokumentation/release-notes/v0.23.0.md"]);
  git(["commit", "-m", "Unvollständige Weekly-Notes committen"]);
  const invalidWeeklyCommit = git(["rev-parse", "HEAD"]);
  write("dokumentation/release-notes/v0.23.0.md", weeklyNotes);
  runVerifier({
    tag: "v0.23.0",
    commitSha: invalidWeeklyCommit,
    expectFailure: true,
    expectedError: "Technische Änderungen"
  });
  write("dokumentation/release-notes/v0.23.0.md", invalidWeeklyNotes);
  git(["checkout", "--quiet", "main"]);

  onCommittedBranch(
    "invalid-weekly-duplicate",
    ["frontend/app/versorgungs-kompass.js"],
    () => write("frontend/app/versorgungs-kompass.js", weeklyApp.replace(
      "{ version: \"0.23.0\", title: \"Versorgung vernetzt\" },",
      "{ version: \"0.23.0\", title: \"Versorgung vernetzt\" },\n        { version: \"0.23.0\", title: \"Doppelt\" },"
    )),
    () => runVerifier({
      tag: "v0.23.0",
      expectFailure: true,
      expectedError: "genau einmal enthalten"
    })
  );

  onCommittedBranch(
    "invalid-weekly-future-notes",
    ["dokumentation/release-notes/v0.24.0.md"],
    () => write("dokumentation/release-notes/v0.24.0.md", weeklyNotes.replaceAll("0.23.0", "0.24.0")),
    () => runVerifier({
      tag: "v0.23.0",
      expectFailure: true,
      expectedError: "Höhere Version als config/release.json.productVersion"
    })
  );

  onCommittedBranch(
    "invalid-weekly-app-title",
    ["frontend/app/versorgungs-kompass.js"],
    () => write("frontend/app/versorgungs-kompass.js", weeklyApp.replace(
      "title: \"Versorgung vernetzt\"",
      "title: \"Abweichendes In-App-Thema\""
    )),
    () => runVerifier({
      tag: "v0.23.0",
      expectFailure: true,
      expectedError: "In-App-Titel muss dem Weekly-Leitthema"
    })
  );
  assert(git(["status", "--porcelain"]) === "", "Die negativen Weekly-Tests müssen vollständig zurückgesetzt sein.");

  const hotfixChangelog = weeklyChangelog.replace(
    "### Netzwerkübersicht",
    "- **Hotfix v0.23.1:** Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.\n\n### Netzwerkübersicht"
  );
  const hotfixReadme = weeklyReadme
    .replaceAll("v0.23.0", "v0.23.1")
    .replace(
      "Kurznotiz: Versorgung vernetzt",
      "Kurznotiz: Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig."
    );
  const hotfixNotes = `# Versorgungs-Kompass 0.23.1 — Release Candidate (Hotfix)

## Anlass

Kontakte konnten in einer Randbedingung nicht zuverlässig zugeordnet werden.

## Korrektur

Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.

## Risiko

Gering; die Änderung betrifft nur die fehlerhafte Zuordnungslogik.

## Prüfung

Gezielter Regressionstest und vollständige Projektprüfung waren erfolgreich.

## Technische Änderungen

- Kontaktzuordnung korrigiert.

## Links

- Changelog: https://example.invalid/changelog
`;
  write("config/release.json", releaseConfig("0.23.1"));
  write("CHANGELOG.md", hotfixChangelog);
  write("README.md", hotfixReadme);
  write("dokumentation/release-notes/v0.23.1.md", hotfixNotes);
  git(["add", "config/release.json", "CHANGELOG.md", "README.md", "dokumentation/release-notes/v0.23.1.md"]);
  git(["commit", "-m", "Hotfix 0.23.1 dokumentieren"]);

  const verifiedHotfix = runVerifier({ tag: "v0.23.1" });
  assert(verifiedHotfix.stdout.includes("v0.23.1 (hotfix)"), "Der Verifier muss einen Patch als Hotfix erkennen.");

  const secondCorrection = "Die Kontaktsuche beendet die zweite Randbedingung jetzt ohne Verzögerung.";
  onCommittedBranch(
    "invalid-historical-hotfix-app-entry",
    [
      "config/release.json",
      "frontend/app/versorgungs-kompass.js",
      "CHANGELOG.md",
      "README.md",
      "dokumentation/release-notes/v0.23.2.md"
    ],
    () => {
      write("config/release.json", releaseConfig("0.23.2"));
      write("frontend/app/versorgungs-kompass.js", weeklyApp.replace(
        "{ version: \"0.23.0\", title: \"Versorgung vernetzt\" },",
        "{ version: \"0.23.1\", title: \"Unzulässiger älterer Hotfix\" },\n        { version: \"0.23.0\", title: \"Versorgung vernetzt\" },"
      ));
      write("CHANGELOG.md", hotfixChangelog.replace(
        "- **Hotfix v0.23.1:**",
        `- **Hotfix v0.23.2:** ${secondCorrection}\n\n- **Hotfix v0.23.1:**`
      ));
      write("README.md", hotfixReadme
        .replaceAll("0.23.1", "0.23.2")
        .replace("Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.", secondCorrection));
      write("dokumentation/release-notes/v0.23.2.md", hotfixNotes
        .replaceAll("0.23.1", "0.23.2")
        .replaceAll("Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.", secondCorrection));
    },
    () => runVerifier({
      tag: "v0.23.2",
      expectFailure: true,
      expectedError: "Der Hotfix 0.23.1 darf keinen eigenen In-App-Haupteintrag enthalten"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-app-entry",
    ["frontend/app/versorgungs-kompass.js"],
    () => write("frontend/app/versorgungs-kompass.js", weeklyApp.replace(
      "{ version: \"0.23.0\", title: \"Versorgung vernetzt\" },",
      "{ version: \"0.23.1\", title: \"Unzulässiger Hotfix\" },\n        { version: \"0.23.0\", title: \"Versorgung vernetzt\" },"
    )),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "darf keinen eigenen In-App-Haupteintrag"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-notes",
    ["dokumentation/release-notes/v0.23.1.md"],
    () => write("dokumentation/release-notes/v0.23.1.md", hotfixNotes.replace(
      "## Risiko\n\nGering; die Änderung betrifft nur die fehlerhafte Zuordnungslogik.\n\n",
      ""
    )),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "Risiko"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-changelog",
    ["CHANGELOG.md"],
    () => write("CHANGELOG.md", weeklyChangelog),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "kompakter Eintrag Hotfix v0.23.1 fehlt"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-readme",
    ["README.md"],
    () => write("README.md", hotfixReadme.replace(
      "Kurznotiz: Die Kontaktzuordnung behandelt die Randbedingung jetzt zuverlässig.",
      "Kurznotiz: Abweichende Korrektur"
    )),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "README-Kurznotiz muss der dokumentierten Hotfix-Korrektur entsprechen"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-own-section",
    ["CHANGELOG.md"],
    () => write("CHANGELOG.md", `${hotfixChangelog.trimEnd()}\n\n## Version 0.23.1 - Unzulässiger Hotfix-Abschnitt\n\nSeparater Abschnitt.\n`),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "darf keinen eigenen Changelog-Abschnitt erhalten"
    })
  );

  onCommittedBranch(
    "invalid-hotfix-future-bullet",
    ["CHANGELOG.md"],
    () => write("CHANGELOG.md", hotfixChangelog.replace(
      "### Netzwerkübersicht",
      "- **Hotfix v0.23.2:** Unzulässige Zukunftsprojektion.\n\n### Netzwerkübersicht"
    )),
    () => runVerifier({
      tag: "v0.23.1",
      expectFailure: true,
      expectedError: "Changelog-Hotfix 0.23.2"
    })
  );

  onCommittedBranch(
    "invalid-first-stable",
    ["config/release.json"],
    () => write("config/release.json", releaseConfig("1.0.0")),
    () => runVerifier({
      tag: "v1.0.0",
      expectFailure: true,
      expectedError: "ab 1.0.0"
    })
  );
  assert(git(["status", "--porcelain"]) === "", "Die negativen Hotfix-Tests müssen vollständig zurückgesetzt sein.");

  console.log("Produkt-Release-Verifier erfolgreich getestet.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
