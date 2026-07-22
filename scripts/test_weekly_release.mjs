import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generator = fileURLToPath(new URL("./prepare_weekly_release.mjs", import.meta.url));
const fixture = mkdtempSync(path.join(tmpdir(), "versorgungs-release-test-"));

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

function runGenerator(args = [], { expectFailure = false, outputPath = "" } = {}) {
  const env = { ...process.env, RELEASED_TAG: "" };
  if (outputPath) env.GITHUB_OUTPUT = path.join(fixture, outputPath);
  const result = spawnSync(process.execPath, [generator, ...args], {
    cwd: fixture,
    env,
    encoding: "utf8"
  });
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(
      `Generator ${expectFailure ? "sollte fehlschlagen" : "ist fehlgeschlagen"}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  git(["init", "-b", "old-history"]);
  git(["config", "user.name", "Release Test"]);
  git(["config", "user.email", "release-test@example.invalid"]);

  write("old.txt", "discarded history\n");
  git(["add", "."]);
  git(["commit", "-m", "Old private baseline"]);
  git(["tag", "-a", "v0.20.0", "-m", "stale v0.20"]);
  git(["tag", "-a", "v9.0.0", "-m", "stale v9"]);

  git(["checkout", "--orphan", "main"]);
  git(["rm", "-rf", "."]);
  write("config/release.json", `${JSON.stringify({
    schemaVersion: 1,
    baselineVersion: "0.20.0",
    baselineRef: "baseline",
    defaultBump: "minor"
  }, null, 2)}\n`);
  write("frontend/app/versorgungs-kompass.js", `function fixture() {
      const appVersionHistory = [
        { version: "0.20.0", title: "Menschen und Versorgung im Blick" }
      ];
      return appVersionHistory;
}
`);
  write("CHANGELOG.md", `# Changelog

## Version 0.20 - Baseline

1. Juli 2026

Datenschutzbereinigte Baseline.
`);
  write("README.md", `# Fixture

## Schnellstart

Test.
`);
  git(["add", "."]);
  git(["commit", "-m", "Privacy-clean baseline"]);
  git(["tag", "baseline"]);

  const cleanBefore = git(["status", "--porcelain"]);
  const baselineDryRun = runGenerator(["--dry-run"]);
  assert(baselineDryRun.stdout.includes("Kein Release erforderlich"), "Eine leere Baseline muss übersprungen werden.");
  assert(git(["status", "--porcelain"]) === cleanBefore, "--dry-run darf den Arbeitsbaum nicht verändern.");

  write("feature.txt", "contact improvement\n");
  git(["add", "."]);
  git(["commit", "-m", "Improve contact overview"]);
  write("dependency.txt", "dependency update\n");
  git(["add", "."]);
  git(["commit", "-m", "Bump @playwright/test from 1.0.0 to 1.1.0"]);
  runGenerator([], { outputPath: "release-output.txt" });

  const output = read("release-output.txt");
  assert(output.includes("should_release=true"), "Release-Ausgabe muss should_release=true setzen.");
  assert(output.includes("mode=prepare"), "Der erste Lauf muss einen Release vorbereiten.");
  assert(output.includes("tag=v0.21.0"), "Die bereinigte Baseline muss zu v0.21.0 führen.");
  assert(read("CHANGELOG.md").match(/^## Version 0\.21 -/gm)?.length === 1, "Changelog muss 0.21 genau einmal enthalten.");
  assert(read("frontend/app/versorgungs-kompass.js").match(/version: "0\.21\.0"/g)?.length === 1, "App muss 0.21.0 genau einmal enthalten.");
  const releaseNotes = read("release-notes/v0.21.0.md");
  const publicChanges = releaseNotes.split("## Technische Änderungen")[0];
  assert(releaseNotes.includes("## Technische Änderungen"), "Dauerhafte Release Notes fehlen.");
  assert(!publicChanges.includes("Bump @playwright/test"), "Abhängigkeitsupdates dürfen nicht als Anwenderfunktion erscheinen.");
  assert(releaseNotes.includes("Bump @playwright/test"), "Abhängigkeitsupdates müssen technisch nachvollziehbar bleiben.");
  assert(releaseNotes.startsWith("# Mehr Überblick. Mehr Verbindung."), "Bereits verwendete Release-Titel müssen vermieden werden.");
  assert(read("README.md").includes("/releases/tag/v0.21.0"), "README-Link auf das Release fehlt.");

  git(["add", "README.md", "CHANGELOG.md", "frontend/app/versorgungs-kompass.js", "release-notes/v0.21.0.md"]);
  git(["commit", "-m", "Release v0.21.0"]);
  const releaseCommit = git(["rev-parse", "HEAD"]);

  const resume = runGenerator(["--dry-run"]);
  assert(resume.stdout.includes("Fortsetzen für v0.21.0"), "Ein vorbereiteter Release muss fortsetzbar sein.");
  assert(!resume.stdout.includes("v0.22.0"), "Ein unterbrochener Release darf nicht übersprungen werden.");

  git(["tag", "-a", "v0.21.0", "-m", "Versorgungs-Kompass v0.21.0", releaseCommit]);
  const publishedEnv = { ...process.env, RELEASED_TAG: "v0.21.0" };
  const published = spawnSync(process.execPath, [generator, "--dry-run"], {
    cwd: fixture,
    env: publishedEnv,
    encoding: "utf8"
  });
  assert(published.status === 0, published.stderr);
  assert(published.stdout.includes("Kein Release erforderlich"), "Ohne neue Commits darf kein Folgerelease entstehen.");

  write("hotfix.txt", "fixed\n");
  git(["add", "."]);
  git(["commit", "-m", "Fix contact lookup"]);
  const patchPreview = spawnSync(process.execPath, [generator, "--dry-run", "--bump", "patch"], {
    cwd: fixture,
    env: publishedEnv,
    encoding: "utf8"
  });
  assert(patchPreview.status === 0, patchPreview.stderr);
  assert(patchPreview.stdout.includes("Vorschau für v0.21.1"), "Patch-Lauf muss v0.21.1 vorbereiten.");

  write("CHANGELOG.md", `${read("CHANGELOG.md")}\n## Version 0.21.0 - Doppelt\n`);
  const duplicate = spawnSync(process.execPath, [generator, "--dry-run"], {
    cwd: fixture,
    env: publishedEnv,
    encoding: "utf8"
  });
  assert(duplicate.status !== 0, "Doppelte normalisierte Changelog-Versionen müssen fehlschlagen.");

  console.log("Weekly release planner tests passed.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
