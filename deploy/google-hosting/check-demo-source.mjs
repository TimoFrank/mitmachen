import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const repository = "TimoFrank/mitmachen";
const canonicalOrigins = [
  `git@github.com:${repository}.git`,
  `ssh://git@github.com/${repository}.git`,
  `https://github.com/${repository}.git`,
  `https://github.com/${repository}`
];
const requiredChecks = [
  ["repo-check.yml", "Minimal repository check"],
  ["target-readiness.yml", "Target-Readiness"]
];
const githubActionsAppId = 15368;

function read(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000
    }).trim();
  } catch {
    throw new Error(command === "gh"
      ? "Die GitHub-Prüfungen konnten nicht gelesen werden. Prüfe die Anmeldung mit gh auth status."
      : "Der Git-Stand für die Demo konnte nicht gelesen werden.");
  }
}

function git(...args) {
  return read("git", ["--no-optional-locks", ...args]);
}

function github(path, params) {
  return JSON.parse(read("gh", ["api", `repos/${repository}/${path}?${new URLSearchParams(params)}`, "--hostname", "github.com"]));
}

function checkWorkflow(revision, workflow, checkName) {
  const { total_count: runCount, workflow_runs: runs } = github(`actions/workflows/${workflow}/runs`, {
    branch: "main", event: "push", head_sha: revision, per_page: "100"
  });
  if (!Array.isArray(runs) || runCount !== runs.length || runs.length === 0) {
    throw new Error(`Für ${checkName} fehlt ein eindeutiger Push-Lauf auf main für ${revision}.`);
  }
  const latest = runs.sort((first, second) => second.created_at.localeCompare(first.created_at) || second.id - first.id)[0];
  if (latest.head_sha !== revision || latest.head_branch !== "main" || latest.event !== "push"
    || latest.head_repository?.full_name !== repository || latest.path !== `.github/workflows/${workflow}`
    || !Number.isSafeInteger(latest.id) || !Number.isSafeInteger(latest.check_suite_id)
    || latest.status !== "completed" || latest.conclusion !== "success") {
    throw new Error(`Der neueste Push-Lauf für ${checkName} ist für ${revision} nicht erfolgreich.`);
  }

  const { total_count: checkCount, check_runs: checks } = github(`check-suites/${latest.check_suite_id}/check-runs`, {
    check_name: checkName, filter: "latest", per_page: "100"
  });
  const check = checks?.[0];
  if (checkCount !== 1 || checks?.length !== 1 || !check || check.name !== checkName || check.head_sha !== revision
    || check.app?.id !== githubActionsAppId || check.app?.slug !== "github-actions"
    || check.check_suite?.id !== latest.check_suite_id || !Number.isSafeInteger(check.id)
    || check.details_url !== `https://github.com/${repository}/actions/runs/${latest.id}/job/${check.id}`
    || check.status !== "completed" || check.conclusion !== "success") {
    throw new Error(`GitHub Actions bestätigt ${checkName} für ${revision} nicht als erfolgreich.`);
  }
}

export function checkDemoSource() {
  if (!canonicalOrigins.includes(git("remote", "get-url", "origin"))) {
    throw new Error(`Die Demo kann nur aus einem Checkout von ${repository} veröffentlicht werden.`);
  }
  const revision = git("rev-parse", "--verify", "HEAD");
  if (!/^[a-f0-9]{40}$/u.test(revision) || git("status", "--porcelain=v1", "--untracked-files=normal")) {
    throw new Error("Die Demo benötigt einen sauberen, vollständig eingecheckten Arbeitsstand.");
  }
  if (git("ls-remote", "--exit-code", "origin", "refs/heads/main") !== `${revision}\trefs/heads/main`) {
    throw new Error("Die Demo kann nur aus dem aktuellen Stand von origin/main veröffentlicht werden.");
  }
  for (const [workflow, checkName] of requiredChecks) checkWorkflow(revision, workflow, checkName);
  return revision;
}
