import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const failures = [];

const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const removedWording = ["arbeits", "raum"].join("");
let removedWordingMatches = "";
try {
  removedWordingMatches = execFileSync(
    "git",
    ["grep", "--line-number", "--ignore-case", "-I", "--", removedWording],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
} catch (error) {
  if (error.status !== 1) throw error;
}
if (removedWordingMatches.trim()) {
  failures.push(`Nicht mehr freigegebenes Wording gefunden:\n${removedWordingMatches.trim()}`);
}

for (const retiredPrefix of [
  ".codex-pet-runs/",
  "docs/",
  "dist/",
  "output/",
    "outputs/",
    "security/",
    "config/pages-legacy/",
    "dokumentation/betrieb-und-deployment/artefakte/",
    "frontend/local-hospitation/",
    "tests/local-hospitation.spec.js"
]) {
  if (trackedFiles.some((file) => file.startsWith(retiredPrefix) && existsSync(path.join(root, file)))) {
    failures.push(`Veralteter oder lokaler Pfad ist noch versioniert: ${retiredPrefix}`);
  }
}

for (const requiredEntry of [
  "config/README.md",
  "deploy/README.md",
  "dokumentation/betrieb-und-deployment/BUILD_ARTEFAKTE.md",
  "config/security/semgrep.yml",
  "config/security/gitleaks.toml",
  "config/security/gitleaksignore"
]) {
  if (!trackedFiles.includes(requiredEntry) && !existsSync(path.join(root, requiredEntry))) {
    failures.push(`Strukturanker fehlt: ${requiredEntry}`);
  }
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} fehlt`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  const source = read(relativePath);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    failures.push(`${relativePath}: ungueltiges JSON (${error.message})`);
    return null;
  }
}

function sameValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requirePattern(file, source, pattern, reason) {
  if (!pattern.test(source)) failures.push(`${file}: ${reason}`);
}

function forbidPattern(file, source, pattern, reason) {
  if (pattern.test(source)) failures.push(`${file}: ${reason}`);
}

const profileSchemaFile = "config/deployment-profile.schema.json";
readJson(profileSchemaFile);

const profileExpectations = [
  {
    id: "pages-demo",
    status: "active",
    buildProfile: "pages",
    sourceRoots: [
      "frontend/app",
      "frontend/map",
      "frontend/pages/mitmachen",
      "frontend/data/public-politics-directory.js",
      "frontend/data/demo-data.js",
      "frontend/data/demo-api.js",
      "frontend/data/data-service.js",
      "frontend/data/sector-registry.js",
      "frontend/data/hospitation-model.js",
      "frontend/data/hospitation-export.js",
      "frontend/data/activity-model.js",
      "frontend/data/document-text-extractor.js",
      "frontend/vendor",
      "public"
    ],
    artifactPath: "dist/pages",
    infrastructureRoot: null,
    githubEnvironment: "github-pages",
    delivery: {
      kind: "github-pages-actions",
      entrypoint: ".github/workflows/deploy-pages.yml",
      trigger: "product-release"
    },
    route: "/",
    dataMode: "demo",
    dataPolicy: "synthetic-plus-public-directory",
    authModes: ["anonymous-demo"],
    forbiddenInputs: [
      "dist/target",
      "deploy",
      "config/pre-gematik",
      "api",
      "supabase",
      "frontend/demo",
      "frontend/login",
      "frontend/data/runtime-config.js"
    ]
  },
  {
    id: "pre-gematik",
    status: "pre-integration",
    buildProfile: "target",
    sourceRoots: ["frontend", "public", "api"],
    artifactPath: "dist/target",
    infrastructureRoot: "deploy",
    githubEnvironment: "pre-gematik",
    delivery: {
      kind: "github-actions-gke",
      entrypoint: ".github/workflows/deploy-pre-gematik.yml",
      trigger: "manual-approval"
    },
    route: "/",
    dataMode: "api",
    dataPolicy: "approved-classes-only",
    authModes: ["iap"],
    forbiddenInputs: [
      "dist/pages",
      "public/pages-demo/politik-offline.html",
      "frontend/demo",
      "frontend/data/public-politics-directory.js",
      "frontend/data/demo-data.js"
    ]
  },
  {
    id: "target",
    status: "planned",
    buildProfile: "target",
    sourceRoots: ["frontend", "public", "api"],
    artifactPath: "dist/target",
    infrastructureRoot: "deploy",
    githubEnvironment: null,
    delivery: {
      kind: "software-factory",
      entrypoint: "deploy/jenkins/Jenkinsfile.gematik",
      trigger: "controlled-release"
    },
    route: null,
    dataMode: "api",
    dataPolicy: "approved-classes-only",
    authModes: ["oidc"],
    forbiddenInputs: [
      "dist/pages",
      "public/pages-demo/politik-offline.html",
      "frontend/demo",
      "frontend/identity-portal",
      "frontend/data/public-politics-directory.js",
      "frontend/data/demo-data.js"
    ]
  }
];

for (const expected of profileExpectations) {
  const file = `config/${expected.id}/deployment.json`;
  const profile = readJson(file);
  if (!profile) continue;
  if (profile.$schema !== "../deployment-profile.schema.json") {
    failures.push(`${file}: Schema-Verweis fehlt oder zeigt auf eine andere Datei.`);
  }
  for (const field of [
    "id",
    "status",
    "buildProfile",
    "sourceRoots",
    "artifactPath",
    "infrastructureRoot",
    "githubEnvironment",
    "delivery",
    "route",
    "dataMode",
    "dataPolicy",
    "authModes"
  ]) {
    if (!sameValue(profile[field], expected[field])) {
      failures.push(`${file}: ${field} weicht vom freigegebenen Deploymentvertrag ab.`);
    }
  }
  if (!sameValue(profile.forbiddenInputs, expected.forbiddenInputs)) {
    failures.push(`${file}: forbiddenInputs weicht von der freigegebenen Positiv-/Negativgrenze ab.`);
  }
  const entrypoint = profile.delivery?.entrypoint;
  if (!entrypoint || !existsSync(path.join(root, entrypoint))) {
    failures.push(`${file}: Delivery-Einstieg ${entrypoint || "<leer>"} fehlt.`);
  }
}

const workflowDirectory = path.join(root, ".github/workflows");
const workflowFiles = existsSync(workflowDirectory)
  ? readdirSync(workflowDirectory).filter((file) => /\.ya?ml$/i.test(file)).sort()
  : [];

if (!workflowFiles.length) failures.push("Keine GitHub-Actions-Workflows gefunden.");

for (const workflowName of workflowFiles) {
  const relativePath = `.github/workflows/${workflowName}`;
  const source = read(relativePath);
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)@([^\s#]+)/gm)) {
    const action = match[1];
    const reference = match[2];
    if (action.startsWith("./") || action.startsWith("docker://")) continue;
    if (!/^[a-f0-9]{40}$/i.test(reference)) {
      failures.push(`${relativePath}: externe Action ${action}@${reference} ist nicht auf eine Commit-SHA festgelegt.`);
    }
  }
  forbidPattern(relativePath, source, /^\s*permissions:\s*write-all\s*$/m, "permissions: write-all ist nicht zulaessig.");
  forbidPattern(relativePath, source, /^\s*pull_request_target\s*:/m, "pull_request_target benoetigt eine gesonderte Sicherheitsfreigabe.");
}

const pagesFile = ".github/workflows/deploy-pages.yml";
const pages = read(pagesFile);
forbidPattern(pagesFile, pages, /^\s{2}push:\s*$/m, "Pages darf keinen beweglichen main-Push mehr automatisch als Produktstand ausliefern.");
requirePattern(pagesFile, pages, /workflow_dispatch:[\s\S]*?revision:[\s\S]*?required:\s*true[\s\S]*?release_tag:[\s\S]*?required:\s*true/, "Pages muss exakten Commit und signierten Produkt-Tag verpflichtend anfordern.");
requirePattern(pagesFile, pages, /RELEASE_TAG_GPG_FINGERPRINT:[^\n]*vars\.RELEASE_TAG_GPG_FINGERPRINT[\s\S]*?RELEASE_TAG_GPG_PUBLIC_KEY:[^\n]*vars\.RELEASE_TAG_GPG_PUBLIC_KEY/, "Pages muss den oeffentlichen Repository-Trust-Anchor verwenden.");
requirePattern(pagesFile, pages, /github-tag-verification\.json[\s\S]*?verify_release_tag\.mjs[\s\S]*?--github-verification-json/, "Pages muss lokale und GitHub-seitige Tagverifikation vor dem Build verbinden.");
forbidPattern(pagesFile, pages, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE/, "Pages darf niemals private Signing-Secrets referenzieren.");
requirePattern(pagesFile, pages, /environment:\s*[\s\S]*?name:\s*github-pages/, "Environment github-pages fehlt.");
requirePattern(pagesFile, pages, /dist\/pages/, "Pages muss aus dist/pages deployen.");
requirePattern(pagesFile, pages, /pages:\s*write/, "pages: write fehlt.");
requirePattern(pagesFile, pages, /id-token:\s*write/, "id-token: write fuer die Pages-Bestaetigung fehlt.");
requirePattern(pagesFile, pages, /audit_public_assets\.mjs/, "Pages muss vor dem Upload gegen die Demo-Positivliste geprueft werden.");
requirePattern(pagesFile, pages, /Verify deployed revision belongs to main[\s\S]*git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/, "Pages darf manuell nur Commits deployen, die zu main gehoeren.");
forbidPattern(pagesFile, pages, /dist\/target|pre-gematik|FRONTEND_BUCKET|pages-legacy/, "Pages darf keine Legacy-, Target- oder GCP-Deploymentwerte verwenden.");
requirePattern(pagesFile, pages, /data\/runtime-config\.js[\s\S]*dataMode:[^\n]*demo[\s\S]*authMode:[^\n]*anonymous-demo/, "Pages muss die veroeffentlichte Runtime als anonyme Demo-Konfiguration abnehmen.");
requirePattern(
  pagesFile,
  pages,
  /versorgungs-kompass\.html[\s\S]*public-politics-directory\.js[\s\S]*demo-data\.js[\s\S]*demo-api\.js[\s\S]*data-service\.js/,
  "Pages muss Voll-App-Shell, öffentlichen Amtsträger-Datensatz und Demo-Adapter nach dem Deployment abnehmen."
);
requirePattern(
  pagesFile,
  pages,
  /politik-offline\.html[\s\S]*offlinePolitics[\s\S]*__POLITIK_OFFLINE_READY__/,
  "Pages muss das eigenständige Politik-Offline-Modul ausliefern und nach dem Deployment abnehmen."
);
requirePattern(pagesFile, pages, /root_app_path[\s\S]*class="app-shell[\s\S]*data-view-panel="home"[\s\S]*manifest\.start_url\s*!==\s*"\.\/#home"/, "Pages muss die direkte App-Startseite nach dem Deployment abnehmen.");
requirePattern(pagesFile, pages, /forbidden_path[\s\S]*data\/supabase-config\.js/, "Pages muss den historischen Supabase-Konfigurationspfad mit HTTP 404 abnehmen.");

const targetFile = ".github/workflows/deploy-pre-gematik.yml";
const target = read(targetFile);
requirePattern(targetFile, target, /environment:\s*[\s\S]*?name:\s*pre-gematik/, "Environment pre-gematik fehlt.");
requirePattern(
  targetFile,
  target,
  /Checkout requested revision[\s\S]*?actions\/checkout@[a-f0-9]{40}[\s\S]*?fetch-depth:\s*0[\s\S]*?Run repository checks/,
  "Die Deploy-Validierung benoetigt die vollstaendige Git-Historie fuer den Release-Check."
);
requirePattern(targetFile, target, /dist\/target/, "Pre-Integration muss aus dist/target deployen.");
requirePattern(targetFile, target, /image\.digest/, "Helm-Deployment muss den gebauten Image-Digest setzen.");
requirePattern(targetFile, target, /releases\/\$\{?[^\n}]*(?:IMAGE_TAG|FRONTEND_RELEASE_ID)/, "Frontend muss in einen versionierten Release-Praefix geschrieben werden.");
requirePattern(targetFile, target, /audit_target_assets\.mjs/, "Pre-Integration muss das gebaute Target gegen seine eigene Positiv-/Negativgrenze pruefen.");
forbidPattern(targetFile, target, /audit_public_assets\.mjs\s+--artifact-root\s+dist\/target/, "Der Pages-Demo-Auditor darf nicht auf das Target-Artefakt angewendet werden.");
forbidPattern(targetFile, target, /sync_github_pages\.sh|docs\/data\/supabase-config\.js|\brsync\b[^\n]*\bdocs\b/, "Pre-Integration darf nicht aus dem Pages-Artefakt docs/ deployen.");

const weeklyFile = ".github/workflows/weekly-release.yml";
const weekly = read(weeklyFile);
forbidPattern(weeklyFile, weekly, /git\s+push[^\n]*(?:HEAD:main|origin\s+main)|git\s+push\s+origin\s+HEAD:main/, "Weekly Release darf nicht direkt nach main schreiben.");
requirePattern(
  weeklyFile,
  weekly,
  /schedule:[\s\S]*?cron:\s*"17 9 \* \* 5"[\s\S]*?timezone:\s*Europe\/Berlin/,
  "Weekly Release muss freitags in der vereinbarten Zeitzone planen."
);
requirePattern(
  weeklyFile,
  weekly,
  /workflow_dispatch:[\s\S]*?theme:[\s\S]*?required:\s*false[\s\S]*?type:\s*string/,
  "Der manuelle Weekly-Plan darf optional ein Leitthema erhalten."
);
requirePattern(
  weeklyFile,
  weekly,
  /plan-release:[\s\S]*?permissions:\s*\n\s+contents:\s*read[\s\S]*?persist-credentials:\s*false[\s\S]*?prepare_weekly_release\.mjs\s+--dry-run\s+--release-type\s+weekly[\s\S]*?prepare-release-pr:/,
  "Der Weekly-Plan muss den Releasebedarf ohne Schreibzugriff ermitteln."
);
const weeklyPlanSection = weekly.match(/\n  plan-release:[\s\S]*?\n  prepare-release-pr:/)?.[0] || "";
forbidPattern(weeklyFile, weeklyPlanSection, /contents:\s*write|pull-requests:\s*write|release-signing|secrets\./, "Der schreibfreie Weekly-Plan darf weder Schreibrechte noch Secrets erhalten.");
requirePattern(
  weeklyFile,
  weekly,
  /prepare-release-pr:[\s\S]*?needs:\s*plan-release[\s\S]*?should_release == 'true'[\s\S]*?mode == 'prepare'/,
  "Nur ein tatsaechlich neuer Wochenstand darf einen Draft-PR vorbereiten."
);
requirePattern(
  weeklyFile,
  weekly,
  /ref:\s*\$\{\{\s*needs\.plan-release\.outputs\.planning_head\s*\}\}[\s\S]*?persist-credentials:\s*false/,
  "Die Vorbereitung muss exakt den zuvor schreibfrei geplanten Commit auschecken."
);
requirePattern(
  weeklyFile,
  weekly,
  /EXPECTED_BASELINE_TAG:[\s\S]*?latest_tag[\s\S]*?rerun planning/,
  "Eine geaenderte veröffentlichte Basis muss vor dem Draft-PR abbrechen."
);
requirePattern(weeklyFile, weekly, /git ls-remote origin refs\/heads\/main[\s\S]*?main changed[\s\S]*?rerun planning/, "Ein weitergelaufenes main muss die Draft-Vorbereitung abbrechen.");
requirePattern(
  weeklyFile,
  weekly,
  /pull-requests:\s*write[\s\S]*?branch:\s*timo\/release-\$\{\{\s*steps\.release\.outputs\.tag\s*\}\}/,
  "Weekly Release muss einen reviewbaren PR auf einem timo/-Branch erzeugen."
);
requirePattern(weeklyFile, weekly, /draft:\s*true/, "Weekly Release darf ausschließlich einen Draft-PR erzeugen.");
requirePattern(
  weeklyFile,
  weekly,
  /actions:\s*write[\s\S]*?for workflow in repo-check\.yml target-readiness\.yml; do[\s\S]*?gh workflow run "\$workflow"[\s\S]*?--ref "\$PR_BRANCH"/,
  "Der Draft-PR muss die zwei bestehenden Pflichtworkflows auf seinem Branch anstossen."
);
requirePattern(weeklyFile, weekly, /add-paths:\s*\|[\s\S]*?config\/release\.json/, "Die zentrale Produktversion muss Bestandteil des Weekly-Release-PR sein.");
requirePattern(weeklyFile, weekly, /add-paths:[\s\S]*deploy\/helm\/versorgungs-kompass\/Chart\.yaml[\s\S]*deploy\/helm\/versorgungs-kompass\/values\.yaml/, "Weekly Release muss die Helm-Versionsprojektion vollständig committen.");
forbidPattern(weeklyFile, weekly, /PRODUCT_RELEASE_PUBLISH_ENABLED|WEEKLY_RELEASE_SCHEDULE_ENABLED|release-signing|gh\s+run\s+watch|gh\s+pr\s+checks|gh\s+pr\s+merge|pulls\/\$\{PR_NUMBER\}\/merge|publish-release\.yml|git\s+tag|gh\s+release\s+create|deploy-pre-gematik/, "Weekly Release darf weder auf Checks warten noch mergen, signieren, publizieren oder deployen.");

const mergedWeeklyFile = ".github/workflows/publish-merged-weekly-release.yml";
const mergedWeekly = read(mergedWeeklyFile);
requirePattern(mergedWeeklyFile, mergedWeekly, /pull_request:[\s\S]*?types:[\s\S]*?- closed[\s\S]*?branches:[\s\S]*?- main/, "Post-Merge-Publishing muss ausschließlich auf geschlossene PRs gegen main reagieren.");
forbidPattern(mergedWeeklyFile, mergedWeekly, /pull_request_target/, "Post-Merge-Publishing darf keinen privilegierten pull_request_target-Kontext verwenden.");
requirePattern(mergedWeeklyFile, mergedWeekly, /github\.event\.pull_request\.merged == true[\s\S]*?head\.repo\.full_name == github\.repository[\s\S]*?user\.login == 'github-actions\[bot\]'[\s\S]*?startsWith\(github\.event\.pull_request\.head\.ref, 'timo\/release-v'\)/, "Nur gemergte, vom Freitagslauf erzeugte Same-Repository-Release-PRs duerfen die Publikation anstossen.");
requirePattern(mergedWeeklyFile, mergedWeekly, /checks:\s*read[\s\S]*?commits\/\$\{PR_HEAD_SHA\}\/check-runs[\s\S]*?Minimal repository check[\s\S]*?Target-Readiness[\s\S]*?\.conclusion == "success"/, "Beide Pflichtchecks muessen auf dem exakten Release-PR-Head erfolgreich sein.");
requirePattern(mergedWeeklyFile, mergedWeekly, /ref:\s*\$\{\{\s*github\.event\.pull_request\.merge_commit_sha\s*\}\}[\s\S]*?persist-credentials:\s*false[\s\S]*?prepare_weekly_release\.mjs --dry-run --release-type weekly/, "Der Post-Merge-Plan muss den exakten Merge-Commit read-only rekonstruieren.");
requirePattern(mergedWeeklyFile, mergedWeekly, /prepare_weekly_release\.mjs --dry-run --release-type weekly[\s\S]*?refs\/pull\/\$\{PR_NUMBER\}\/head[\s\S]*?git diff --quiet "\$PR_HEAD_SHA" "\$MERGE_SHA"[\s\S]*?\[\[ "\$MODE" == "resume" \]\][\s\S]*?\[\[ "\$PLANNING_HEAD" == "\$MERGE_SHA" \]\][\s\S]*?\[\[ "\$RELEASE_SHA" == "\$MERGE_SHA" \|\| "\$RELEASE_SHA" == "\$PR_HEAD_SHA" \]\]/, "PR-Head und Merge-Commit muessen denselben freigegebenen Inhalt tragen und den exakten Resume-Vertrag erfuellen.");
requirePattern(mergedWeeklyFile, mergedWeekly, /uses:\s*\.\/\.github\/workflows\/publish-release\.yml[\s\S]*?caller_holds_release_lock:\s*true[\s\S]*?publish:\s*true[\s\S]*?release_type:\s*weekly/, "Der Post-Merge-Ausloeser muss den gemeinsamen Publish-Vertrag verwenden.");
forbidPattern(mergedWeeklyFile, mergedWeekly, /git\s+tag|gh\s+release\s+(?:create|edit)|deploy-pre-gematik\.yml|gh\s+workflow\s+run\s+deploy-pages\.yml/, "Der Post-Merge-Ausloeser darf Tag, Release, Pages oder private Deployments nicht selbst mutieren.");

const signingReadinessFile = ".github/workflows/release-signing-readiness.yml";
const signingReadiness = read(signingReadinessFile);
requirePattern(signingReadinessFile, signingReadiness, /workflow_dispatch:[\s\S]*?permissions:\s*\n\s+contents:\s*read[\s\S]*?environment:[\s\S]*?name:\s*release-signing/, "Signing-Readiness muss manuell, read-only und im geschuetzten Environment laufen.");
forbidPattern(signingReadinessFile, signingReadiness, /actions\/checkout|actions\/setup-node|npm\s|node\s+scripts\/|git\s+(?:tag|push)|gh\s+release|gh\s+workflow\s+run/, "Signing-Readiness darf keinen Repository-Code oder externe Mutationen ausfuehren.");
requirePattern(signingReadinessFile, signingReadiness, /Immutable product release tags[\s\S]*?branches\/main\/protection[\s\S]*?required_status_checks\.strict == true[\s\S]*?Target-Readiness[\s\S]*?immutable-releases[\s\S]*?--detach-sign[\s\S]*?VALIDSIG/, "Signing-Readiness muss Governance, Subkey und Passphrase ohne Publikation beweisen.");

const hotfixFile = ".github/workflows/hotfix-release.yml";
const hotfix = read(hotfixFile);
forbidPattern(hotfixFile, hotfix, /^\s*schedule:\s*$/m, "Hotfixes duerfen keinen Zeitplan besitzen.");
requirePattern(hotfixFile, hotfix, /publish:[\s\S]*?required:\s*true[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/, "Ein manueller Hotfix muss standardmaessig ein schreibfreier Plan sein.");
for (const input of ["reason", "correction", "risk", "verification"]) {
  requirePattern(hotfixFile, hotfix, new RegExp(`\\n      ${input}:[\\s\\S]*?required:\\s*true[\\s\\S]*?type:\\s*string`), `Hotfix-Eingabe ${input} muss verpflichtend sein.`);
}
for (const variable of ["HOTFIX_REASON", "HOTFIX_CORRECTION", "HOTFIX_RISK", "HOTFIX_VERIFICATION"]) {
  const occurrences = hotfix.match(new RegExp(`${variable}:`, "g"))?.length || 0;
  if (occurrences < 2) failures.push(`${hotfixFile}: ${variable} muss sowohl Plan als auch Vorbereitung erreichen.`);
}
requirePattern(hotfixFile, hotfix, /PUBLISH_ENABLED:\s*\$\{\{\s*vars\.PRODUCT_RELEASE_PUBLISH_ENABLED\s*\}\}/, "Hotfix-Publishing muss den globalen Publish-Schalter auswerten.");
requirePattern(hotfixFile, hotfix, /persist-credentials:\s*false[\s\S]*?prepare_weekly_release\.mjs\s+--dry-run\s+--release-type\s+hotfix/, "Der Hotfix-Plan muss ohne persistierte Zugangsdaten und ohne Mutation laufen.");
const hotfixPlanSection = hotfix.match(/\n  plan-release:[\s\S]*?\n  signing-readiness:/)?.[0] || "";
forbidPattern(hotfixFile, hotfixPlanSection, /release-signing|RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE/, "Der schreibfreie Hotfix-Plan darf weder Signing-Environment noch private Signing-Secrets referenzieren.");
const hotfixReadinessSection = hotfix.match(/\n  signing-readiness:[\s\S]*?\n  prepare-release:/)?.[0] || "";
requirePattern(hotfixFile, hotfixReadinessSection, /environment:[\s\S]*?name:\s*release-signing/, "Hotfix-Publishing muss die isolierte Signing-Bereitschaft vor dem Merge pruefen.");
forbidPattern(hotfixFile, hotfixReadinessSection, /actions\/checkout|actions\/setup-node|npm\s+(?:ci|install)|scripts\//, "Der Hotfix-Signing-Bereitschaftsjob darf keinen Repository-Code ausfuehren.");
requirePattern(hotfixFile, hotfix, /prepare-release:[\s\S]*?needs:[\s\S]*?-\s+signing-readiness[\s\S]*?if:\s*needs\.release-gate\.outputs\.may_publish\s*==\s*'true'/, "Die Hotfix-Vorbereitung darf erst nach Publish-Gate und Signing-Bereitschaft starten.");
requirePattern(hotfixFile, hotfix, /git\s+diff\s+--exit-code\s+--\s+frontend\/app\/versorgungs-kompass\.js/, "Ein Hotfix darf den In-App-Changelog nicht veraendern.");
requirePattern(hotfixFile, hotfix, /add-paths:\s*\|[\s\S]*?config\/release\.json/, "Die zentrale Produktversion muss Bestandteil des Hotfix-PR sein.");
requirePattern(hotfixFile, hotfix, /add-paths:[\s\S]*deploy\/helm\/versorgungs-kompass\/Chart\.yaml[\s\S]*deploy\/helm\/versorgungs-kompass\/values\.yaml/, "Hotfix Release muss die Helm-Versionsprojektion vollständig committen.");
requirePattern(
  hotfixFile,
  hotfix,
  /for workflow in repo-check\.yml target-readiness\.yml; do[\s\S]*?known_run_ids[\s\S]*?gh workflow run "\$workflow"[\s\S]*?headSha == \$sha[\s\S]*?index\(\$id\)\) == null[\s\S]*?gh run watch/,
  "Hotfix Release muss beide erforderlichen Checks korreliert auf dem exakten Kandidatencommit starten."
);
requirePattern(hotfixFile, hotfix, /gh\s+pr\s+checks[\s\S]*?--required[\s\S]*?--watch[\s\S]*?autoMergeRequest/, "Hotfix Release muss alle erforderlichen Checks abwarten und vorhandenes Auto-Merge ausschliessen.");
requirePattern(hotfixFile, hotfix, /merge_payload=.*[\s\S]*?\{sha:\s*\$sha,\s*merge_method:\s*"squash"[\s\S]*?gh\s+api[\s\S]*?--method\s+PUT[\s\S]*?pulls\/\$\{PR_NUMBER\}\/merge/, "Hotfix Release muss den geprueften Head atomar per REST-Squash binden.");
requirePattern(hotfixFile, hotfix, /uses:\s*\.\/\.github\/workflows\/publish-release\.yml[\s\S]*?release_type:\s*hotfix/, "Hotfix Release muss den gemeinsamen Publish-Vertrag mit Typ hotfix verwenden.");

const publishReleaseFile = ".github/workflows/publish-release.yml";
const publishRelease = read(publishReleaseFile);
requirePattern(publishReleaseFile, publishRelease, /\^v\(\[0-9\]\+\)\\\.\(\[0-9\]\+\)\\\.\(\[0-9\]\+\)\$/, "Produkt-Releases muessen streng als vX.Y.Z validiert sein.");
requirePattern(publishReleaseFile, publishRelease, /major[^\n]*==\s*"0"|"\$major"\s*==\s*"0"/, "Die Automatisierung muss Releases ab v1.0.0 dem gesonderten Target-Gate ueberlassen.");
requirePattern(publishReleaseFile, publishRelease, /environment:[\s\S]*?name:\s*release-signing/, "Der private Signierschluessel darf nur im Environment release-signing verwendet werden.");
requirePattern(publishReleaseFile, publishRelease, /Reconfirm release governance before tag mutation[\s\S]*?Immutable product release tags[\s\S]*?branches\/main\/protection[\s\S]*?required_status_checks\.strict == true[\s\S]*?enforce_admins\.enabled == true[\s\S]*?Minimal repository check[\s\S]*?Target-Readiness[\s\S]*?immutable-releases[\s\S]*?has\("bypass_actors"\)[\s\S]*?refs\/tags\/v\*[\s\S]*?\["deletion", "update"\]/, "Vor jeder Tag-Mutation muessen Branchschutz ohne Admin-Bypass, Pflichtchecks, Release-Immutability und das bypass-freie v*-Tag-Ruleset gelten.");
requirePattern(publishReleaseFile, publishRelease, /git\s+tag\s+--sign[\s\S]*?--local-user/, "Produkt-Releases benoetigen einen annotierten, mit dem exakten Subkey signierten Tag.");
forbidPattern(publishReleaseFile, publishRelease, /git\s+(?:tag|push)[^\n]*--force/, "Release-Tags duerfen nie erzwungen ersetzt werden.");
requirePattern(publishReleaseFile, publishRelease, /verify-signed-tag:[\s\S]*?permissions:[\s\S]*?contents:\s*read[\s\S]*?verify_release_tag\.mjs/, "Ein separater Job ohne Schreibrecht muss den Remote-Tag pruefen.");
const publicVerificationSection = publishRelease.match(/\n  verify-signed-tag:[\s\S]*?\n  build-and-deploy-pages:/)?.[0] || "";
forbidPattern(publishReleaseFile, publicVerificationSection, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE/, "Die unabhaengige Tag-Pruefung darf keine privaten Signing-Secrets referenzieren.");
requirePattern(publishReleaseFile, publishRelease, /build-and-deploy-pages:[\s\S]*?needs:[\s\S]*?-\s+verify-signed-tag/, "Pages darf erst nach unabhaengiger Tag-Pruefung gebaut werden.");
requirePattern(publishReleaseFile, publishRelease, /package_product_release\.mjs[\s\S]*?verify_release_artifacts\.mjs/, "Die drei Release-Artefakte muessen reproduzierbar gepackt und lokal geprueft werden.");
requirePattern(publishReleaseFile, publishRelease, /versorgungs-kompass-\$\{RELEASE_TAG\}-pages\.zip/, "Das versionierte Pages-ZIP fehlt als Pflichtartefakt.");
requirePattern(publishReleaseFile, publishRelease, /build-manifest\.json/, "build-manifest.json fehlt als Pflichtartefakt.");
requirePattern(publishReleaseFile, publishRelease, /SHA256SUMS/, "SHA256SUMS fehlt als Pflichtartefakt.");
requirePattern(publishReleaseFile, publishRelease, /gh\s+release\s+create/, "GitHub Release muss durch den Publish-Workflow erstellt werden.");
requirePattern(publishReleaseFile, publishRelease, /--verify-tag/, "GitHub Release muss einen vorhandenen Tag verifizieren.");
requirePattern(publishReleaseFile, publishRelease, /verify_product_release\.mjs/, "Publish-Workflow muss Release-Dokumente und Commit pruefen.");
requirePattern(publishReleaseFile, publishRelease, /--draft[\s\S]*?--prerelease[\s\S]*?--latest=false/, "GitHub Releases muessen zuerst als Draft und danach als Prerelease ohne Latest-Status entstehen.");
forbidPattern(publishReleaseFile, publishRelease, /gh\s+release\s+upload[^\n]*--clobber/, "Ein fortgesetzter Draft darf vorhandene Assets nicht ueberschreiben.");
requirePattern(publishReleaseFile, publishRelease, /Unexpected asset in existing draft[\s\S]*?cmp\s+--silent[\s\S]*?missing_assets/, "Ein fortgesetzter Draft muss vorhandene Assets als exakte Teilmenge bytegenau pruefen.");
requirePattern(publishReleaseFile, publishRelease, /isImmutable[\s\S]*?gh\s+release\s+verify\s+"\$RELEASE_TAG"/, "Die Veroeffentlichung muss auf Immutability und Release-Attestierung warten.");
requirePattern(publishReleaseFile, publishRelease, /gh\s+release\s+verify-asset\s+"\$RELEASE_TAG"/, "Jedes heruntergeladene Release-Asset muss gegen seine Attestierung geprueft werden.");
forbidPattern(publishReleaseFile, publishRelease, /deploy-pre-gematik\.yml|dist\/target|\bpre-gematik\b|poc-v/i, "Oeffentliche Produkt-Releases duerfen keinen PoC-, GKE- oder Target-Deploy ausloesen.");

const jenkinsFile = "deploy/jenkins/Jenkinsfile.gematik";
const jenkins = read(jenkinsFile);
const packageFile = "package.json";
const packageConfig = readJson(packageFile);
const packageScripts = packageConfig?.scripts || {};
const targetReadinessFile = ".github/workflows/target-readiness.yml";
const targetReadiness = read(targetReadinessFile);
forbidPattern(targetReadinessFile, targetReadiness, /\n\s+paths:\s*\n/, "Der verpflichtende Target-Readiness-Check darf keine PR-Pfadfilter besitzen.");
const targetValuesFile = "deploy/helm/versorgungs-kompass/values-target-gematik.yaml";
const targetValues = read(targetValuesFile);
const targetSourceVerifierFile = "scripts/verify_target_release_source.mjs";
const targetSourceVerifier = read(targetSourceVerifierFile);
const sourceHandoffPackagerFile = "scripts/package_source_handoff.mjs";
const sourceHandoffPackager = read(sourceHandoffPackagerFile);
const sourceHandoffVerifierFile = "scripts/verify_source_handoff.mjs";
const sourceHandoffVerifier = read(sourceHandoffVerifierFile);
const securityEvidenceFile = "scripts/generate_security_evidence.mjs";
const securityEvidence = read(securityEvidenceFile);

function jenkinsStage(name, nextName) {
  const startMarker = `    stage('${name}') {`;
  const endMarker = `    stage('${nextName}') {`;
  const start = jenkins.indexOf(startMarker);
  const end = jenkins.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    failures.push(`${jenkinsFile}: Stufenvertrag ${name} -> ${nextName} fehlt oder ist falsch angeordnet.`);
    return "";
  }
  return jenkins.slice(start, end);
}

function declaredEvidenceInventory(stageSource, label) {
  const declaration = stageSource.match(/expected_inventory="\$\(printf '%s\\n'\s+([\s\S]*?)\|\s*LC_ALL=C sort\)"/);
  if (!declaration) {
    failures.push(`${jenkinsFile}: ${label} besitzt kein geschlossenes expected_inventory.`);
    return [];
  }
  return [...declaration[1].matchAll(/\b([a-z0-9-]+\.json)\b/g)].map((match) => match[1]);
}

const prePushEvidenceStage = jenkinsStage("Import pre-push Software Factory gates", "Push API image");
const bootstrapStage = jenkinsStage("Bootstrap trusted main", "Verify signed target source");
const verifySourceStage = jenkinsStage("Verify signed target source", "Install");
const pushImageStage = jenkinsStage("Push API image", "Import post-push Cosign attestation");
const postPushAttestationStage = jenkinsStage("Import post-push Cosign attestation", "Helm validate");
const helmValidateStage = jenkinsStage("Helm validate", "Trivy configuration scan");
const assembleEvidenceStage = jenkinsStage("Assemble security evidence", "Stage versioned frontend release");
const frontendReleaseStage = jenkinsStage("Stage versioned frontend release", "Deploy API to Kubernetes");
const deployApiStage = jenkinsStage("Deploy API to Kubernetes", "Smoke test");
const smokeStage = jenkinsStage("Smoke test", "Record technical deployment evidence");
const deploymentEvidenceStage = jenkins.slice(
  jenkins.indexOf("    stage('Record technical deployment evidence') {"),
  jenkins.indexOf("\n  post {")
);

requirePattern(jenkinsFile, jenkins, /agent\s*\{\s*label\s*['"]versorgungs-target-deployer['"]\s*\}/u, "Die Target-Pipeline muss einen dedizierten Deployer-Agenten verwenden.");
requirePattern(jenkinsFile, jenkins, /disableConcurrentBuilds\(\)/u, "Parallele Target-Deployments desselben Jobs muessen gesperrt sein.");
requirePattern(jenkinsFile, jenkins, /GIT_SSH_COMMAND\s*=\s*['"][^'"]*StrictHostKeyChecking=yes[^'"]*['"]/u, "Private Quellzugriffe muessen SSH-Hostschluessel fail-closed pruefen.");
requirePattern(jenkinsFile, jenkins, /credentialsId:\s*['"]versorgungs-target-source-readonly-ssh-key['"]/u, "Der Bootstrap muss den geschuetzten read-only Quellschluessel verwenden.");
requirePattern(jenkinsFile, bootstrapStage, /for required_tool in git node npm gpg jq ssh docker helm kubectl curl[\s\S]*FRONTEND_BUCKET_URI[\s\S]*command -v gcloud/u, "Der geschuetzte Runner muss alle spaeter benoetigten Tools vor Mutationen pruefen.");
requirePattern(jenkinsFile, verifySourceStage, /sshagent\(credentials:\s*\['versorgungs-target-source-readonly-ssh-key'\]\)[\s\S]*protected target source must use an SSH remote/u, "Das Quell-Gate muss den read-only SSH-Zugang explizit binden und HTTPS fail-closed ablehnen.");
requirePattern(jenkinsFile, helmValidateStage, /helmMetaCharacters\s*=\s*\/\[,=\{\}\\\\\]\//u, "Helm-Skalarwerte muessen gegen Metazeicheninjektion validiert werden.");
requirePattern(jenkinsFile, helmValidateStage, /JSON\.parse\(env\.TARGET_API_ALLOWED_CIDRS_JSON\)[\s\S]*net\.isIP/u, "Gateway-CIDRs muessen semantisch validiert werden.");
requirePattern(jenkinsFile, helmValidateStage, /--set-json networkPolicy\.ingress\.apiAllowedCidrs="\$TARGET_API_ALLOWED_CIDRS_JSON"/u, "Helm-Rendering muss geschuetzte Gateway-CIDRs verwenden.");
requirePattern(jenkinsFile, deployApiStage, /versorgungs-target-kubeconfig[\s\S]*versorgungs-target-kube-context[\s\S]*--kubeconfig "\$KUBECONFIG"[\s\S]*--kube-context "\$TARGET_KUBE_CONTEXT"/u, "Deployment muss geschuetztes Kubeconfig und Zielkontext binden.");
requirePattern(jenkinsFile, deployApiStage, /--set-json networkPolicy\.ingress\.apiAllowedCidrs="\$TARGET_API_ALLOWED_CIDRS_JSON"/u, "Deployment muss dieselben Gateway-CIDRs verwenden.");
requirePattern(jenkinsFile, smokeStage, /versorgungs-oidc-smoke-bearer-token[\s\S]*Authorization: Bearer \$OIDC_SMOKE_BEARER_TOKEN[\s\S]*\.authMode == "oidc"[\s\S]*\.profile\.id == \$profile_id[\s\S]*\.profile\.role == \$role/u, "Der Target-Smoke muss positive OIDC-Profil- und Rollenbindung pruefen.");
if ((smokeStage.match(/--connect-timeout 10/g) || []).length !== 3 || (smokeStage.match(/--max-time 30/g) || []).length !== 3) {
  failures.push(`${jenkinsFile}: Alle drei HTTP-Smokes brauchen feste Verbindungs- und Gesamtlaufzeitgrenzen.`);
}
requirePattern("scripts/preflight_target_deployment.mjs", read("scripts/preflight_target_deployment.mjs"), /requiredCommands\s*=\s*\[[^\]]*"curl"[\s\S]*FRONTEND_BUCKET_URI[\s\S]*commandExists\("gcloud"\)/u, "Der fruehe Target-Preflight muss curl und bedingt gcloud pruefen.");
requirePattern(jenkinsFile, deploymentEvidenceStage, /target-deployment-evidence\.json[\s\S]*technicalSmoke:[\s\S]*status:\s*"passed"[\s\S]*operationalAcceptance:[\s\S]*status:\s*"pending"[\s\S]*releaseStatus:\s*"not-authorized"/u, "Der technische Deploymentnachweis muss die ausstehende Betriebsabnahme fail-closed markieren.");

for (const [scriptName, expectedCommand] of [
  ["verify:target-release-source", "node scripts/verify_target_release_source.mjs"],
  ["package:source-handoff", "node scripts/package_source_handoff.mjs"],
  ["verify:source-handoff", "node scripts/verify_source_handoff.mjs"],
  ["test:target-release-source", "node scripts/test_target_release_source.mjs"]
]) {
  if (packageScripts[scriptName] !== expectedCommand) {
    failures.push(`${packageFile}: ${scriptName} muss exakt ${expectedCommand} ausfuehren.`);
  }
}
if (packageScripts["check:poc-rc"] !== "npm run check:target-release") {
  failures.push(`${packageFile}: check:poc-rc darf nur noch als historischer Alias auf check:target-release bestehen.`);
}
if (!/(?:^|&&\s*)npm run test:target-release-source(?:\s*&&|$)/.test(packageScripts["test:release-automation"] || "")) {
  failures.push(`${packageFile}: test:release-automation muss test:target-release-source ausfuehren.`);
}

requirePattern(jenkinsFile, jenkins, /dist\/target/, "Jenkins muss aus dist/target publizieren.");
requirePattern(jenkinsFile, jenkins, /audit_target_assets\.mjs/, "Jenkins muss das Target-Artefakt gegen die Target-Grenze pruefen.");
forbidPattern(jenkinsFile, jenkins, /audit_public_assets\.mjs\s+--artifact-root\s+"?\$FRONTEND_ARTIFACT_DIR"?/, "Der Pages-Demo-Auditor darf nicht auf das Jenkins-Target angewendet werden.");
requirePattern(jenkinsFile, jenkins, /image\.digest/, "Jenkins muss den aufgeloesten API-Image-Digest an Helm uebergeben.");
forbidPattern(jenkinsFile, jenkins, /sync_github_pages\.sh|docs\/data\/supabase-config\.js|\brsync\b[^\n]*\bdocs\b/, "Jenkins darf nicht aus dem Pages-Artefakt docs/ deployen.");
requirePattern(jenkinsFile, jenkins, /name:\s*'RELEASE_TAG'[\s\S]{0,240}defaultValue:\s*''/, "Jenkins muss RELEASE_TAG ohne impliziten Standard anfordern.");
requirePattern(jenkinsFile, jenkins, /RELEASE_TAG[\s\S]{0,500}\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/, "Jenkins muss RELEASE_TAG streng als vX.Y.Z validieren.");
requirePattern(
  jenkinsFile,
  jenkins,
  /skipDefaultCheckout\(true\)[\s\S]*stage\('Bootstrap trusted main'\)[\s\S]*branches:\s*\[\[name:\s*'\*\/main'\]\][\s\S]*noTags:\s*true[\s\S]*refspec:\s*'\+refs\/heads\/main:refs\/remotes\/origin\/main'[\s\S]*stage\('Verify signed target source'\)/,
  "Jenkins muss vor allen Quellpruefungen aus geschuetztem Remote-main bootstrappen."
);
for (const credentialName of [
  "SOURCE_REPOSITORY_URL",
  "RELEASE_TAG_GPG_PUBLIC_KEY_FILE",
  "RELEASE_TAG_GPG_FINGERPRINT"
]) {
  requirePattern(
    jenkinsFile,
    jenkins,
    new RegExp(`withCredentials\\(\\[[\\s\\S]*?(?:file|string)\\([\\s\\S]{0,220}variable:\\s*['\"]${credentialName}['\"]`),
    `${credentialName} muss aus einem extern verwalteten Credential stammen.`
  );
}
const jenkinsParameters = jenkins.match(/\n  parameters \{[\s\S]*?\n  \}\n\n  environment \{/)?.[0] || "";
if (!jenkinsParameters) failures.push(`${jenkinsFile}: Parameterblock kann nicht sicher abgegrenzt werden.`);
forbidPattern(jenkinsFile, jenkinsParameters, /EXTERNAL_SECURITY_EVIDENCE_ROOT/, "Der Evidence-Root darf kein Build-Parameter sein.");
requirePattern(
  jenkinsFile,
  jenkins,
  /EXTERNAL_SECURITY_EVIDENCE_ROOT\s*=\s*credentials\(['"][^'"]+['"]\)/,
  "Der externe Evidence-Root muss aus einem Jenkins-Credential stammen."
);
forbidPattern(
  jenkinsFile,
  jenkins,
  /params\.EXTERNAL_SECURITY_EVIDENCE_ROOT|\$\{params\.EXTERNAL_SECURITY_EVIDENCE_ROOT\}/,
  "Der externe Evidence-Root darf nicht aus frei waehlbaren Parametern projiziert werden."
);
requirePattern(
  jenkinsFile,
  jenkins,
  /verify_target_release_source\.mjs[\s\S]{0,900}--tag\s+"?\$RELEASE_TAG"?[\s\S]{0,900}--expected-repository-url\s+"?\$SOURCE_REPOSITORY_URL"?[\s\S]{0,900}--public-key-file\s+"?\$RELEASE_TAG_GPG_PUBLIC_KEY_FILE"?[\s\S]{0,900}--fingerprint\s+"?\$RELEASE_TAG_GPG_FINGERPRINT"?[\s\S]{0,900}source-tag-verification\.json/,
  "Jenkins muss Quelle, Tagobjekt und externen Trust Anchor vor dem Build gemeinsam verifizieren."
);
for (const approval of ["REQUIRE_EXTERNAL_SECURITY_EVIDENCE", "TARGET_DEPLOYMENT_APPROVED"]) {
  requirePattern(
    jenkinsFile,
    jenkins,
    new RegExp(`(?:test\\s+[\"']?\\$${approval}[\"']?\\s*=\\s*[\"']true[\"']|params\\.${approval}\\s*(?:==|!=)\\s*true)`),
    `${approval}=true muss explizit und fail-closed geprueft werden.`
  );
}
requirePattern(jenkinsFile, jenkins, /HELM_TARGET_VALUES[\s\S]{0,180}values-target-gematik\.yaml/, "Jenkins muss das dedizierte Target-Overlay verwenden.");
requirePattern(jenkinsFile, jenkins, /npm run check:target-release/, "Jenkins muss das operative Target-Release-Gate ausfuehren.");
requirePattern(jenkinsFile, jenkins, /source-tag-verification\.json/, "Jenkins muss den Signatur- und Quellnachweis archivieren.");
forbidPattern(jenkinsFile, jenkins, /poc-v|\bRC_TAG\b|--rc-tag|values-poc-gematik|HELM_POC_VALUES/i, "Jenkins darf keine Legacy-RC-Autorisierung verwenden.");
forbidPattern(
  jenkinsFile,
  jenkins,
  /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|git\s+tag\s+--sign|git\s+fetch[^\n]*(?:--force[^\n]*--tags|--tags[^\n]*--force|\+refs\/tags)/i,
  "Jenkins darf weder private Signiermittel erhalten, Tags erzeugen noch Tags erzwungen laden."
);

const expectedPrePushInventory = [
  "cosign-attestation-ready.json",
  "dependency-track-gate.json",
  "snyk-gate.json",
  "sonarqube-gate.json"
];
if (!sameValue(declaredEvidenceInventory(prePushEvidenceStage, "Pre-push-Evidenz"), expectedPrePushInventory)) {
  failures.push(`${jenkinsFile}: Pre-push-Evidenz muss exakt SonarQube, Snyk, Dependency-Track und Cosign-Bereitschaft enthalten.`);
}
requirePattern(
  jenkinsFile,
  prePushEvidenceStage,
  /case "\$EXTERNAL_SECURITY_EVIDENCE_ROOT" in[\s\S]*\/\*\)[\s\S]*test ! -L "\$EXTERNAL_SECURITY_EVIDENCE_ROOT"[\s\S]*evidence_root="\$\(realpath "\$EXTERNAL_SECURITY_EVIDENCE_ROOT"\)"[\s\S]*test ! -w "\$evidence_root"/,
  "Der externe Evidence-Root muss absolut, symlinkfrei und fuer Jenkins read-only sein."
);
requirePattern(
  jenkinsFile,
  prePushEvidenceStage,
  /external_path="\$evidence_root\/\$BUILD_TAG"[\s\S]*external_dir="\$\(realpath "\$external_path"\)"[\s\S]*test ! -w "\$external_dir"[\s\S]*workspace_dir="\$\(realpath "\$WORKSPACE"\)"[\s\S]*"\$workspace_dir"\|"\$workspace_dir"\/\*/,
  "Der externe Nachweispfad muss build-spezifisch, read-only und ausserhalb des Workspaces liegen."
);
requirePattern(
  jenkinsFile,
  prePushEvidenceStage,
  /source_digest_before="\$\(sha256_file "\$source_file"\)"[\s\S]*cp -- "\$source_file" "\$SECURITY_EVIDENCE_DIR\/\$filename"[\s\S]*source_digest_after="\$\(sha256_file "\$source_file"\)"[\s\S]*imported_digest="\$\(sha256_file "\$SECURITY_EVIDENCE_DIR\/\$filename"\)"[\s\S]*test "\$source_digest_before" = "\$source_digest_after"[\s\S]*test "\$source_digest_before" = "\$imported_digest"/,
  "Externe Pre-push-Nachweise muessen vor und nach der Kopie bytegenau gebunden werden."
);
for (const gate of [
  "sonarqube:sonarqube-gate.json",
  "snyk:snyk-gate.json",
  "dependency-track:dependency-track-gate.json"
]) {
  if (!prePushEvidenceStage.includes(gate)) failures.push(`${jenkinsFile}: Pre-push-Gate fehlt: ${gate}`);
}
for (const binding of [
  ".buildId == $build_id",
  ".releaseTag == $release_tag",
  ".sourceRevision == $source_revision",
  ".sourceRepository == $source_repository",
  ".imageRepository == $image_repository",
  "(.sbomDigests | sort) == ([$api_sbom_digest, $frontend_sbom_digest] | sort)"
]) {
  if (!prePushEvidenceStage.includes(binding)) failures.push(`${jenkinsFile}: Pre-push-Evidenzbindung fehlt: ${binding}`);
}
requirePattern(
  jenkinsFile,
  prePushEvidenceStage,
  /cosign-attestation-ready\.json[\s\S]*schemaVersion == "versorgungs-kompass-cosign-readiness\/v1"[\s\S]*\.status == "ready"/,
  "Cosign-Bereitschaft muss vor dem Push geschlossen validiert werden."
);
forbidPattern(jenkinsFile, prePushEvidenceStage, /(?:^|[^-])cosign-attestation\.json/, "Die digestgebundene Attestation darf vor dem Push nicht vorliegen.");

const expectedPostPushInventory = [
  "cosign-attestation-ready.json",
  "cosign-attestation.json",
  "dependency-track-gate.json",
  "snyk-gate.json",
  "sonarqube-gate.json"
];
if (!sameValue(declaredEvidenceInventory(postPushAttestationStage, "Post-push-Evidenz"), expectedPostPushInventory)) {
  failures.push(`${jenkinsFile}: Post-push-Evidenz darf exakt die digestgebundene Cosign-Attestation ergaenzen.`);
}
requirePattern(
  jenkinsFile,
  postPushAttestationStage,
  /attempt=0[\s\S]*while \[ ! -e "\$attestation_path" \][\s\S]*attempt=\$\(\(attempt \+ 1\)\)[\s\S]*test "\$attempt" -le [1-9][0-9]*[\s\S]*sleep [1-9][0-9]*/,
  "Das Warten auf die Cosign-Attestation muss begrenzt sein."
);
requirePattern(
  jenkinsFile,
  postPushAttestationStage,
  /source_digest_before="\$\(sha256_file "\$resolved_attestation"\)"[\s\S]*cp -- "\$resolved_attestation" "\$SECURITY_EVIDENCE_DIR\/cosign-attestation\.json"[\s\S]*source_digest_after="\$\(sha256_file "\$resolved_attestation"\)"[\s\S]*imported_digest="\$\(sha256_file "\$SECURITY_EVIDENCE_DIR\/cosign-attestation\.json"\)"/,
  "Die Cosign-Attestation muss waehrend der Kopie bytegenau stabil bleiben."
);
for (const binding of [
  ".buildId == $build_id",
  ".releaseTag == $release_tag",
  ".sourceRevision == $source_revision",
  ".sourceRepository == $source_repository",
  ".imageRepository == $image_repository",
  ".subject == $subject",
  "(.sbomDigests | sort) == ([$api_sbom_digest, $frontend_sbom_digest] | sort)"
]) {
  if (!postPushAttestationStage.includes(binding)) failures.push(`${jenkinsFile}: Post-push-Cosign-Bindung fehlt: ${binding}`);
}
requirePattern(
  jenkinsFile,
  postPushAttestationStage,
  /--arg subject "\$API_IMAGE_REPOSITORY@\$API_IMAGE_DIGEST"/,
  "Cosign muss an den exakten Registry-Digest gebunden sein."
);

const orderedTargetStages = [
  "Import pre-push Software Factory gates",
  "Push API image",
  "Import post-push Cosign attestation",
  "Assemble security evidence",
  "Stage versioned frontend release",
  "Deploy API to Kubernetes",
  "Smoke test",
  "Record technical deployment evidence"
].map((name) => jenkins.indexOf(`stage('${name}')`));
if (!orderedTargetStages.every((offset, index) => offset >= 0 && (index === 0 || offset > orderedTargetStages[index - 1]))) {
  failures.push(`${jenkinsFile}: Zweiphasige Evidence-, Push-, Frontend- und Deployment-Reihenfolge ist verletzt.`);
}
requirePattern(
  jenkinsFile,
  assembleEvidenceStage,
  /node scripts\/generate_security_evidence\.mjs "\$@"/,
  "Der finale Security-Nachweis muss in der abgegrenzten Post-push-Assemble-Stufe entstehen."
);
requirePattern(jenkinsFile, pushImageStage, /docker push "\$API_IMAGE"/, "Der Registry-Push muss in der abgegrenzten Push-Stufe liegen.");
if ((jenkins.match(/docker push "\$API_IMAGE"/g) || []).length !== 1) {
  failures.push(`${jenkinsFile}: Es darf genau einen Registry-Push hinter den Pre-push-Gates geben.`);
}

requirePattern(
  jenkinsFile,
  jenkins,
  /GIT_NO_REPLACE_OBJECTS\s*=\s*['"]1['"]/,
  "Jenkins muss Git-Replacement-Objekte fuer den gesamten Target-Lauf deaktivieren."
);
const remoteTagRecheck = /git for-each-ref --format='\%\(refname\)' refs\/replace[\s\S]*git rev-parse --git-path info\/grafts[\s\S]*git config --show-origin --get-regexp '\^url\\\.\.\*\\\.\(insteadof\|pushinsteadof\)\$'[\s\S]*git config --get remote\.origin\.url \| node scripts\/normalize_repository_url\.mjs[\s\S]*test "\$current_source_repository" = "\$SOURCE_REPOSITORY"[\s\S]*git ls-remote --exit-code --refs --tags origin "refs\/tags\/\$RELEASE_TAG"[\s\S]*test "\$1" = "\$RELEASE_TAG_OBJECT_SHA"[\s\S]*test "\$2" = "refs\/tags\/\$RELEASE_TAG"/;
for (const [stageSource, label, sideEffect] of [
  [pushImageStage, "Registry-Push", /docker push "\$API_IMAGE"/],
  [frontendReleaseStage, "Frontend-Staging", /gcloud storage (?:rsync|cp)/],
  [deployApiStage, "Kubernetes-Deployment", /helm upgrade --install/]
]) {
  requirePattern(jenkinsFile, stageSource, remoteTagRecheck, `${label} muss Remote-URL und Tagobjekt erneut pruefen.`);
  requirePattern(jenkinsFile, stageSource, /sshagent\(credentials:\s*\['versorgungs-target-source-readonly-ssh-key'\]\)/u, `${label} muss den geschuetzten read-only Quellschluessel binden.`);
  const lookupCount = (stageSource.match(/git ls-remote --exit-code --refs --tags origin "refs\/tags\/\$RELEASE_TAG"/g) || []).length;
  if (lookupCount !== 1) failures.push(`${jenkinsFile}: ${label} braucht genau einen eindeutigen Tagobjekt-Lookup.`);
  const recheckMatch = stageSource.match(remoteTagRecheck);
  const sideEffectOffset = stageSource.search(sideEffect);
  if (!recheckMatch || sideEffectOffset <= recheckMatch.index + recheckMatch[0].length) {
    failures.push(`${jenkinsFile}: ${label} schreibt vor dem Remote-URL-/Tagobjekt-Recheck.`);
  }
}

requirePattern(
  jenkinsFile,
  frontendReleaseStage,
  /--arg schema_version "2"[\s\S]*--arg product_version "\$product_version"[\s\S]*schemaVersion: \(\$schema_version \| tonumber\)[\s\S]*productVersion: \$product_version/,
  "Das Frontend-Release-Manifest v2 muss productVersion enthalten."
);
requirePattern(
  securityEvidenceFile,
  securityEvidence,
  /Object\.keys\(frontendBuildManifest[\s\S]*"productVersion"[\s\S]*frontendBuildManifest\.productVersion !== productVersion/,
  "Security-Evidenz v2 muss productVersion im geschlossenen Frontend-Buildmanifest pruefen."
);

requirePattern(targetReadinessFile, targetReadiness, /npm run check:target-release/, "Target-Readiness muss den operativen Target-Release-Check verwenden.");
requirePattern(targetReadinessFile, targetReadiness, /values-target-gematik\.yaml/, "Target-Readiness muss das dedizierte Target-Overlay rendern.");
forbidPattern(targetReadinessFile, targetReadiness, /check:poc-rc|values-poc-gematik\.yaml|poc-v/i, "Target-Readiness darf keine Legacy-RC-Autorisierung verwenden.");

requirePattern(targetValuesFile, targetValues, /tag:\s*REPLACE_WITH_IMMUTABLE_IMAGE_TAG/, "Das Target-Overlay braucht einen fail-closed Image-Tag-Platzhalter.");
requirePattern(targetValuesFile, targetValues, /apiAuthMode:\s*"oidc"/, "Das Target-Overlay muss OIDC erzwingen.");
forbidPattern(targetValuesFile, targetValues, /poc-v|rc\.[0-9]+/i, "Das Target-Overlay darf keinen Legacy-RC-Tag enthalten.");

for (const pattern of [
  /remoteRefSha\(remote, remoteTagRef\)/,
  /remoteRefSha\(remote, `\$\{remoteTagRef\}\^\{\}`/,
  /gateRevision !== remoteMainRevision/,
  /sourceRepository !== expectedRepositoryUrl/,
  /verify_release_tag\.mjs/,
  /tagSignatureVerified:\s*true/
]) {
  requirePattern(targetSourceVerifierFile, targetSourceVerifier, pattern, `Target-Quellvertrag fehlt: ${pattern}`);
}
forbidPattern(targetSourceVerifierFile, targetSourceVerifier, /git\s+tag|--force|poc-v|--rc-tag/i, "Der Target-Quellcheck muss read-only und frei von Legacy-Autorisierung bleiben.");

for (const pattern of [/complete-git-bundle/, /refs\/heads\/main/, /refs\/tags\/\*/, /bundle", "verify"/, /singleWriterRequired:\s*true/, /bidirectionalSyncAllowed:\s*false/, /SHA256SUMS\.asc/, /--detach-sign/]) {
  requirePattern(sourceHandoffPackagerFile, sourceHandoffPackager, pattern, `Quelluebergabe-Paketvertrag fehlt: ${pattern}`);
}
for (const pattern of [/assertExactKeys\(manifest/, /bundle", "verify"/, /fsck", "--strict", "--full"/, /out-of-band-required/, /verify_release_tag\.mjs/, /SHA256SUMS\.asc/]) {
  requirePattern(sourceHandoffVerifierFile, sourceHandoffVerifier, pattern, `Quelluebergabe-Pruefvertrag fehlt: ${pattern}`);
}
const firstPackageSignatureCheck = sourceHandoffVerifier.indexOf("importTrustAnchorAndVerifyPackage({");
const firstManifestRead = sourceHandoffVerifier.indexOf('readJson(manifestPath, "handoff-manifest.json")');
if (firstPackageSignatureCheck < 0 || firstManifestRead < 0 || firstPackageSignatureCheck > firstManifestRead) {
  failures.push(`${sourceHandoffVerifierFile}: Die Paket-Signatur muss vor Manifest und Pruefsummen ausgewertet werden.`);
}
forbidPattern(sourceHandoffPackagerFile, sourceHandoffPackager, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|poc-v|--rc-tag/i, "Die Quelluebergabe darf keine privaten Signiermittel oder Legacy-Autorisierung kennen.");
forbidPattern(sourceHandoffVerifierFile, sourceHandoffVerifier, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|poc-v|--rc-tag/i, "Die Handoff-Pruefung darf keine privaten Signiermittel oder Legacy-Autorisierung kennen.");

for (const pattern of [/versorgungs-kompass-security-evidence\/v2/, /releaseTag/, /tagObjectSha/, /signerFingerprint/, /tagSignatureVerified/, /source-tag-signature/, /source-tag-verification\.json/]) {
  requirePattern(securityEvidenceFile, securityEvidence, pattern, `Security-Evidenz-v2-Vertrag fehlt: ${pattern}`);
}
forbidPattern(securityEvidenceFile, securityEvidence, /\brcTag\b|--rc-tag|poc-v/i, "Security-Evidenz v2 darf keine Legacy-RC-Felder akzeptieren.");

const helmDeploymentFile = "deploy/helm/versorgungs-kompass/templates/deployment.yaml";
const helmDeployment = read(helmDeploymentFile);
requirePattern(helmDeploymentFile, helmDeployment, /image\.digest/, "Helm muss Digest-basierte Images unterstuetzen.");

const frontendDeploymentFile = "deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml";
const frontendDeployment = read(frontendDeploymentFile);
requirePattern(frontendDeploymentFile, frontendDeployment, /releasePrefix/, "Frontend-Pods muessen eine versionierte Release-Quelle verwenden.");
requirePattern(frontendDeploymentFile, frontendDeployment, /contentRevision/, "Frontend-Pods muessen eine konkrete Content-Revision verwenden.");

try {
  execFileSync(process.execPath, ["scripts/test_pre_gematik_iap_workflow.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe"
  });
} catch (error) {
  const detail = String(error?.stderr || error?.message || error).trim();
  failures.push(`Pre-gematik-IAP-Workflowvertrag ist ungueltig${detail ? `: ${detail}` : "."}`);
}

if (failures.length) {
  console.error("Deployment Governance Check FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Deployment Governance Check OK: Artefakte, Environments, Action-Pins und Reviewgrenzen sind getrennt.");
