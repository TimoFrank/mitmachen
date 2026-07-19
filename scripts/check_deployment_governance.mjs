import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const failures = [];

const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

for (const retiredPrefix of [
  ".codex-pet-runs/",
  "docs/",
  "output/",
  "outputs/",
  "security/",
  "config/pages-legacy/",
  "dokumentation/betrieb-und-deployment/artefakte/"
]) {
  if (trackedFiles.some((file) => file.startsWith(retiredPrefix) && existsSync(path.join(root, file)))) {
    failures.push(`Veralteter oder lokaler Pfad ist noch versioniert: ${retiredPrefix}`);
  }
}

for (const requiredEntry of [
  "config/README.md",
  "deploy/README.md",
  "dist/README.md",
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
      "frontend/demo",
      "frontend/map",
      "frontend/data/demo-data.js",
      "frontend/data/sector-registry.js",
      "frontend/vendor/leaflet",
      "public/app-icon-32.png",
      "public/gematik-logo.svg",
      "public/demo-profile-admin.svg",
      "public/demo-profile-editor.svg",
      "public/demo-profile-viewer.svg"
    ],
    artifactPath: "dist/pages",
    infrastructureRoot: null,
    githubEnvironment: "github-pages",
    delivery: {
      kind: "github-pages-actions",
      entrypoint: ".github/workflows/deploy-pages.yml",
      trigger: "main-push"
    },
    route: "/demo/",
    dataMode: "demo",
    dataPolicy: "synthetic-only",
    authModes: ["anonymous-demo"],
    forbiddenInputs: [
      "dist/target",
      "deploy",
      "config/pre-gematik",
      "frontend/app",
      "frontend/login",
      "frontend/data/runtime-config.js",
      "frontend/data/data-service.js"
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
    forbiddenInputs: ["dist/pages", "frontend/demo", "frontend/data/demo-data.js"]
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
    forbiddenInputs: ["dist/pages", "frontend/demo", "frontend/data/demo-data.js"]
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
requirePattern(pagesFile, pages, /environment:\s*[\s\S]*?name:\s*github-pages/, "Environment github-pages fehlt.");
requirePattern(pagesFile, pages, /dist\/pages/, "Pages muss aus dist/pages deployen.");
requirePattern(pagesFile, pages, /pages:\s*write/, "pages: write fehlt.");
requirePattern(pagesFile, pages, /id-token:\s*write/, "id-token: write fuer die Pages-Bestaetigung fehlt.");
requirePattern(pagesFile, pages, /audit_public_assets\.mjs/, "Pages muss vor dem Upload gegen die Demo-Positivliste geprueft werden.");
forbidPattern(pagesFile, pages, /dist\/target|pre-gematik|FRONTEND_BUCKET|pages-legacy/, "Pages darf keine Legacy-, Target- oder GCP-Deploymentwerte verwenden.");
requirePattern(pagesFile, pages, /forbidden_path[\s\S]*data\/runtime-config\.js/, "Pages muss nach dem Deployment pruefen, dass keine Target-Runtimekonfiguration oeffentlich ist.");
requirePattern(pagesFile, pages, /forbidden_path[\s\S]*data\/supabase-config\.js/, "Pages muss den historischen Supabase-Konfigurationspfad mit HTTP 404 abnehmen.");

const targetFile = ".github/workflows/deploy-pre-gematik.yml";
const target = read(targetFile);
requirePattern(targetFile, target, /environment:\s*[\s\S]*?name:\s*pre-gematik/, "Environment pre-gematik fehlt.");
requirePattern(targetFile, target, /dist\/target/, "Pre-Integration muss aus dist/target deployen.");
requirePattern(targetFile, target, /image\.digest/, "Helm-Deployment muss den gebauten Image-Digest setzen.");
requirePattern(targetFile, target, /releases\/\$\{?[^\n}]*IMAGE_TAG/, "Frontend muss in einen versionierten Release-Praefix geschrieben werden.");
requirePattern(targetFile, target, /audit_target_assets\.mjs/, "Pre-Integration muss das gebaute Target gegen seine eigene Positiv-/Negativgrenze pruefen.");
forbidPattern(targetFile, target, /audit_public_assets\.mjs\s+--artifact-root\s+dist\/target/, "Der Pages-Demo-Auditor darf nicht auf das Target-Artefakt angewendet werden.");
forbidPattern(targetFile, target, /sync_github_pages\.sh|docs\/data\/supabase-config\.js|\brsync\b[^\n]*\bdocs\b/, "Pre-Integration darf nicht aus dem Pages-Artefakt docs/ deployen.");

const weeklyFile = ".github/workflows/weekly-release.yml";
const weekly = read(weeklyFile);
forbidPattern(weeklyFile, weekly, /git\s+push[^\n]*(?:HEAD:main|origin\s+main)|git\s+push\s+origin\s+HEAD:main/, "Weekly Release darf nicht direkt nach main schreiben.");
requirePattern(weeklyFile, weekly, /pull-requests:\s*write/, "Der vorbereitende Weekly-Release-Prozess muss einen reviewbaren Pull Request erzeugen koennen.");

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

if (failures.length) {
  console.error("Deployment Governance Check FAILED:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Deployment Governance Check OK: Artefakte, Environments, Action-Pins und Reviewgrenzen sind getrennt.");
