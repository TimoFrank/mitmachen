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
  /release-gate:[\s\S]*?outputs:[\s\S]*?may_plan:\s*\$\{\{\s*steps\.gate\.outputs\.may_plan\s*\}\}[\s\S]*?may_publish:\s*\$\{\{\s*steps\.gate\.outputs\.may_publish\s*\}\}/,
  "Das Weekly-Gate muss Planung und Veröffentlichung getrennt entscheiden."
);
requirePattern(
  weeklyFile,
  weekly,
  /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/,
  "Das Schedule-Gate muss den tatsaechlichen GitHub-Ausloeser auswerten."
);
requirePattern(
  weeklyFile,
  weekly,
  /PUBLISH_ENABLED:\s*\$\{\{\s*vars\.PRODUCT_RELEASE_PUBLISH_ENABLED\s*\}\}/,
  "Der geplante Weekly Release muss den globalen Publish-Schalter auswerten."
);
requirePattern(
  weeklyFile,
  weekly,
  /SCHEDULE_ENABLED:\s*\$\{\{\s*vars\.WEEKLY_RELEASE_SCHEDULE_ENABLED\s*\}\}/,
  "Der geplante Weekly Release muss die explizite Freigabevariable auswerten."
);
requirePattern(
  weeklyFile,
  weekly,
  /if \[\[ "\$EVENT_NAME" == "schedule" \]\]; then[\s\S]*?SCHEDULE_ENABLED:-[^\n]*!= "true"[\s\S]*?may_plan=false[\s\S]*?PUBLISH_ENABLED:-[^\n]*!= "true"[\s\S]*?may_plan=false/,
  "Der Schedule-Lauf muss bei jedem fehlenden Freigabeschalter fail-closed enden."
);
requirePattern(
  weeklyFile,
  weekly,
  /publish:[\s\S]*?required:\s*true[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/,
  "Ein manueller Weekly-Lauf muss standardmaessig ein schreibfreier Plan sein."
);
requirePattern(
  weeklyFile,
  weekly,
  /plan-release:[\s\S]*?persist-credentials:\s*false[\s\S]*?prepare_weekly_release\.mjs\s+--dry-run\s+--release-type\s+weekly[\s\S]*?signing-readiness:/,
  "Der Weekly-Plan muss ohne persistierte Zugangsdaten und ohne Mutation laufen."
);
const weeklyPlanSection = weekly.match(/\n  plan-release:[\s\S]*?\n  signing-readiness:/)?.[0] || "";
forbidPattern(weeklyFile, weeklyPlanSection, /release-signing|RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE/, "Der schreibfreie Weekly-Plan darf weder Signing-Environment noch private Signing-Secrets referenzieren.");
const weeklyReadinessSection = weekly.match(/\n  signing-readiness:[\s\S]*?\n  prepare-release:/)?.[0] || "";
requirePattern(weeklyFile, weeklyReadinessSection, /environment:[\s\S]*?name:\s*release-signing/, "Publishing muss die isolierte Signing-Bereitschaft vor dem Merge pruefen.");
requirePattern(weeklyFile, weeklyReadinessSection, /RELEASE_TAG_GPG_PRIVATE_KEY:[^\n]*secrets\.RELEASE_TAG_GPG_PRIVATE_KEY/, "Die Signing-Bereitschaft muss den privaten Subkey aus dem Environment lesen.");
requirePattern(weeklyFile, weeklyReadinessSection, /RELEASE_TAG_GPG_PASSPHRASE:[^\n]*secrets\.RELEASE_TAG_GPG_PASSPHRASE/, "Die Signing-Bereitschaft muss die Passphrase getrennt aus dem Environment lesen.");
forbidPattern(weeklyFile, weeklyReadinessSection, /actions\/checkout|actions\/setup-node|npm\s+(?:ci|install)|scripts\//, "Der Signing-Bereitschaftsjob darf keinen Repository-Code ausfuehren.");
requirePattern(
  weeklyFile,
  weekly,
  /prepare-release:[\s\S]*?needs:[\s\S]*?-\s+signing-readiness[\s\S]*?if:\s*needs\.release-gate\.outputs\.may_publish\s*==\s*'true'/,
  "Die Release-Vorbereitung darf erst nach Publish-Gate und Signing-Bereitschaft starten."
);
requirePattern(weeklyFile, weekly, /pull-requests:\s*write/, "Der vorbereitende Weekly-Release-Prozess muss einen reviewbaren Pull Request erzeugen koennen.");
requirePattern(
  weeklyFile,
  weekly,
  /for workflow in repo-check\.yml target-readiness\.yml; do[\s\S]*?known_run_ids[\s\S]*?gh workflow run "\$workflow"[\s\S]*?headSha == \$sha[\s\S]*?index\(\$id\)\) == null[\s\S]*?gh run watch/,
  "Weekly Release muss beide erforderlichen Checks korreliert auf dem exakten Kandidatencommit starten."
);
requirePattern(weeklyFile, weekly, /gh\s+pr\s+checks[\s\S]*?--required[\s\S]*?--watch[\s\S]*?autoMergeRequest/, "Weekly Release muss alle erforderlichen Checks abwarten und vorhandenes Auto-Merge ausschliessen.");
requirePattern(weeklyFile, weekly, /merge_payload=.*[\s\S]*?\{sha:\s*\$sha,\s*merge_method:\s*"squash"[\s\S]*?gh\s+api[\s\S]*?--method\s+PUT[\s\S]*?pulls\/\$\{PR_NUMBER\}\/merge/, "Weekly Release muss den geprueften Head atomar per REST-Squash binden.");
requirePattern(weeklyFile, weekly, /add-paths:\s*\|[\s\S]*?config\/release\.json/, "Die zentrale Produktversion muss Bestandteil des Weekly-Release-PR sein.");
requirePattern(weeklyFile, weekly, /uses:\s*\.\/\.github\/workflows\/publish-release\.yml[\s\S]*?release_type:\s*weekly/, "Weekly Release muss den gemeinsamen Publish-Vertrag mit Typ weekly verwenden.");

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
requirePattern(jenkinsFile, jenkins, /dist\/target/, "Jenkins muss aus dist/target publizieren.");
requirePattern(jenkinsFile, jenkins, /audit_target_assets\.mjs/, "Jenkins muss das Target-Artefakt gegen die Target-Grenze pruefen.");
forbidPattern(jenkinsFile, jenkins, /audit_public_assets\.mjs\s+--artifact-root\s+"?\$FRONTEND_ARTIFACT_DIR"?/, "Der Pages-Demo-Auditor darf nicht auf das Jenkins-Target angewendet werden.");
requirePattern(jenkinsFile, jenkins, /image\.digest/, "Jenkins muss den aufgeloesten API-Image-Digest an Helm uebergeben.");
forbidPattern(jenkinsFile, jenkins, /sync_github_pages\.sh|docs\/data\/supabase-config\.js|\brsync\b[^\n]*\bdocs\b/, "Jenkins darf nicht aus dem Pages-Artefakt docs/ deployen.");

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
