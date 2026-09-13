#!/usr/bin/env node

import {
  accessSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.umask(0o077);

const FORMAT_VERSION = "1";
const ACTIONS = new Set(["status", "freeze", "unfreeze", "close"]);
const STATE_KEYS = [
  "api_image",
  "api_image_id",
  "api_pod_selector",
  "binding_fingerprint",
  "deployment",
  "deployment_uid",
  "format_version",
  "freeze_started_at",
  "frozen_at",
  "frozen_deployment_generation",
  "frozen_deployment_resource_version",
  "gcp_project_id",
  "gke_cluster_name",
  "gke_location",
  "namespace",
  "namespace_uid",
  "operator_revision",
  "original_replicas",
  "phase",
  "pre_freeze_confirmation",
  "pre_freeze_deployment_generation",
  "pre_freeze_deployment_resource_version",
  "unfreeze_started_at",
  "unfrozen_at",
  "unfrozen_deployment_generation",
  "unfrozen_deployment_resource_version"
].sort();
const CONFIG_KEYS = [
  "ALLOWED_NON_DB_CONTROLLERS",
  "API_CONTAINER",
  "API_DEPLOYMENT",
  "API_DEPLOYMENT_UID",
  "API_IMAGE",
  "API_IMAGE_ID",
  "API_POD_SELECTOR",
  "FORMAT_VERSION",
  "GCP_PROJECT_ID",
  "GKE_CLUSTER_CA_SHA256",
  "GKE_CLUSTER_NAME",
  "GKE_LOCATION",
  "K8S_NAMESPACE",
  "K8S_NAMESPACE_UID",
  "KUBE_API_SERVER",
  "KUBE_CONTEXT",
  "KUBECONFIG_PATH",
  "ORIGINAL_REPLICAS",
  "READBACK_TIMEOUT_SECONDS",
  "STATE_FILE"
].sort();
const DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const RESOURCE_VERSION = /^[0-9]+$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

class FreezeOperatorError extends Error {}

function fail(message) {
  throw new FreezeOperatorError(message);
}

function usage() {
  process.stdout.write(`GKE-API-Deployment-Freeze mit Namespace-Inventur (Vorschau ist der Standard)

Aufruf:
  gke-writer-freeze.mjs status   --config /absoluter/externer/target.conf
  gke-writer-freeze.mjs freeze   --config /absoluter/externer/target.conf
  gke-writer-freeze.mjs freeze   --config /absoluter/externer/target.conf --apply --confirm FREEZE:<sha256>
  gke-writer-freeze.mjs freeze   --config /absoluter/externer/target.conf --readback
  gke-writer-freeze.mjs unfreeze --config /absoluter/externer/target.conf
  gke-writer-freeze.mjs unfreeze --config /absoluter/externer/target.conf --apply --confirm UNFREEZE:<sha256>
  gke-writer-freeze.mjs unfreeze --config /absoluter/externer/target.conf --readback
  gke-writer-freeze.mjs close    --config /absoluter/externer/target.conf
  gke-writer-freeze.mjs close    --config /absoluter/externer/target.conf --apply --confirm CLOSE:<sha256>

Nur --apply veraendert das Deployment. Eine Vorschau liefert die exakt
zustandsgebundene BESTAETIGUNG fuer einen unmittelbar folgenden Apply-Lauf.
Der Nachweis umfasst das konfigurierte Namespace und das exakte API-Deployment,
nicht externe Datenbank-Clients oder Workloads in anderen Namespaces.
Die Ausgabe ist deshalb kein globaler Writer-Nachweis; dieses separate
Cutover-Gate bleibt vor einem finalen Datenbankexport verpflichtend.
`);
}

function parseArguments(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  if (argv.length === 0 || !ACTIONS.has(argv[0])) {
    fail("Erste Angabe muss status, freeze, unfreeze oder close sein.");
  }
  const result = {
    action: argv[0],
    apply: false,
    configPath: "",
    confirm: "",
    help: false,
    readback: false
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      if (result.apply) fail("--apply darf nur einmal gesetzt werden.");
      result.apply = true;
      continue;
    }
    if (argument === "--readback") {
      if (result.readback) fail("--readback darf nur einmal gesetzt werden.");
      result.readback = true;
      continue;
    }
    if (["--config", "--confirm"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`${argument} benoetigt einen Wert.`);
      const property = argument === "--config" ? "configPath" : "confirm";
      if (result[property]) fail(`${argument} darf nur einmal gesetzt werden.`);
      result[property] = value;
      index += 1;
      continue;
    }
    fail(`Unbekannte Angabe: ${argument}`);
  }
  if (!result.configPath) fail("--config ist verpflichtend.");
  if (result.apply && result.readback) fail("--apply und --readback schliessen sich aus.");
  if (result.action === "status" && (result.apply || result.readback || result.confirm)) {
    fail("status ist immer nur lesend und akzeptiert weder --apply, --readback noch --confirm.");
  }
  if (result.action === "close" && result.readback) fail("close besitzt keinen eigenen --readback-Modus.");
  if (result.apply && !result.confirm) fail("--apply benoetigt --confirm aus der aktuellen Vorschau.");
  if (!result.apply && result.confirm) fail("--confirm ist ausschliesslich zusammen mit --apply zulaessig.");
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(object, expected, label) {
  if (!object || typeof object !== "object" || Array.isArray(object)) fail(`${label} ist kein Objekt.`);
  const actual = Object.keys(object).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} besitzt nicht exakt die erlaubten Felder.`);
  }
}

function assertString(value, label, pattern = null) {
  if (typeof value !== "string" || value.length === 0 || (pattern && !pattern.test(value))) {
    fail(`${label} ist ungueltig.`);
  }
  return value;
}

function assertInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(`${label} ist ungueltig.`);
  return value;
}

function fileMode(stat) {
  return stat.mode & 0o777;
}

function assertCanonicalDirectory(directory, label, { protectedMode = false } = {}) {
  if (!path.isAbsolute(directory)) fail(`${label} muss absolut sein.`);
  let info;
  try {
    info = lstatSync(directory);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} muss ein symlinkfreies Verzeichnis sein.`);
  if (realpathSync(directory) !== directory) fail(`${label} muss bereits kanonisch und symlinkfrei sein.`);
  if (protectedMode && (info.uid !== process.getuid() || fileMode(info) !== 0o700)) {
    fail(`${label} muss dem aufrufenden Nutzer gehoeren und Modus 0700 besitzen.`);
  }
  return directory;
}

function assertProtectedFile(file, label) {
  if (!path.isAbsolute(file)) fail(`${label} muss absolut sein.`);
  let info;
  try {
    info = lstatSync(file);
  } catch {
    fail(`${label} fehlt.`);
  }
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} muss eine regulaere symlinkfreie Datei sein.`);
  if (realpathSync(file) !== file) fail(`${label} muss bereits kanonisch und vollstaendig symlinkfrei sein.`);
  if (info.uid !== process.getuid() || fileMode(info) !== 0o600) {
    fail(`${label} muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen.`);
  }
  assertCanonicalDirectory(path.dirname(file), `${label}-Verzeichnis`, { protectedMode: true });
  return file;
}

function assertDisjoint(first, firstLabel, second, secondLabel) {
  const nested = first === second
    || first.startsWith(`${second}${path.sep}`)
    || second.startsWith(`${first}${path.sep}`);
  if (nested) fail(`${firstLabel} und ${secondLabel} muessen in beide Richtungen unverschachtelt sein.`);
}

function resolveExecutable(name) {
  const searchPath = process.env.PATH || "";
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.resolve(directory, name);
    try {
      accessSync(candidate, fsConstants.X_OK);
      const canonical = realpathSync(candidate);
      if (statSync(canonical).isFile()) return candidate;
    } catch {
      // Der naechste PATH-Eintrag kann die gepruefte Datei enthalten.
    }
  }
  fail(`Erforderliches Programm fehlt: ${name}`);
}

function commandEnvironment() {
  const environment = { ...process.env, LC_ALL: "C", LANG: "C" };
  delete environment.KUBECONFIG;
  return environment;
}

function runCommand(binary, argumentsList, label, { accepted = [0], timeout = 30_000 } = {}) {
  const result = spawnSync(binary, argumentsList, {
    encoding: "utf8",
    env: commandEnvironment(),
    maxBuffer: 8 * 1024 * 1024,
    timeout
  });
  if (result.error || !accepted.includes(result.status)) {
    fail(`${label} ist fehlgeschlagen; Zielzustand bleibt unbestaetigt.`);
  }
  return { status: result.status, stderr: result.stderr || "", stdout: result.stdout || "" };
}

function parseJson(output, label) {
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== "object") fail(`${label} ist leer.`);
    return parsed;
  } catch (error) {
    if (error instanceof FreezeOperatorError) throw error;
    fail(`${label} ist kein gueltiges JSON.`);
  }
}

function establishRepository(gitBinary) {
  const invocation = process.argv[1];
  if (!invocation || !path.isAbsolute(invocation)) {
    fail("Der Operator muss ueber seinen absoluten Pfad aufgerufen werden.");
  }
  let invocationInfo;
  try {
    invocationInfo = lstatSync(invocation);
  } catch {
    fail("Operatorpfad ist nicht lesbar.");
  }
  const modulePath = fileURLToPath(import.meta.url);
  if (
    !invocationInfo.isFile()
    || invocationInfo.isSymbolicLink()
    || realpathSync(invocation) !== invocation
    || modulePath !== invocation
  ) {
    fail("Operatorpfad muss absolut, kanonisch und vollstaendig symlinkfrei sein.");
  }
  const projectRoot = realpathSync(path.resolve(path.dirname(modulePath), "../../.."));
  assertCanonicalDirectory(projectRoot, "Repositorypfad");
  const repositoryTop = runCommand(
    gitBinary,
    ["-C", projectRoot, "rev-parse", "--show-toplevel"],
    "Git-Repository-Readback"
  ).stdout.trim();
  if (repositoryTop !== projectRoot || realpathSync(repositoryTop) !== projectRoot) {
    fail("Operator liegt nicht im exakt gebundenen Repository-Root.");
  }
  const status = runCommand(
    gitBinary,
    ["-C", projectRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    "Git-Arbeitskopie-Readback"
  ).stdout.trim();
  if (status !== "") fail("Repository muss fuer den Operatorlauf vollstaendig sauber sein.");
  const relativeOperator = path.relative(projectRoot, modulePath).split(path.sep).join("/");
  runCommand(
    gitBinary,
    ["-C", projectRoot, "ls-files", "--error-unmatch", relativeOperator],
    "Versionierter Operator-Readback"
  );
  const revision = runCommand(
    gitBinary,
    ["-C", projectRoot, "rev-parse", "HEAD"],
    "Operator-Revision-Readback"
  ).stdout.trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) fail("Operator-Revision ist ungueltig.");
  return { projectRoot, revision };
}

function parseConfigFile(configPath, projectRoot) {
  assertProtectedFile(configPath, "GKE-Zielkonfiguration");
  assertDisjoint(configPath, "GKE-Zielkonfiguration", projectRoot, "Repositorypfad");
  const raw = readFileSync(configPath, "utf8");
  if (!raw.endsWith("\n") || raw.includes("\r") || raw.includes("\0")) {
    fail("GKE-Zielkonfiguration muss LF-kodiert sein und mit einem Zeilenumbruch enden.");
  }
  const values = {};
  for (const [index, line] of raw.split("\n").entries()) {
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(`GKE-Zielkonfiguration enthaelt eine ungueltige Zeile ${index + 1}.`);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || value.length === 0 || value !== value.trim()) {
      fail(`GKE-Zielkonfiguration enthaelt eine ungueltige Zeile ${index + 1}.`);
    }
    if (Object.hasOwn(values, key)) fail(`GKE-Zielkonfiguration enthaelt ${key} mehrfach.`);
    values[key] = value;
  }
  exactKeys(values, CONFIG_KEYS, "GKE-Zielkonfiguration");
  if (values.FORMAT_VERSION !== FORMAT_VERSION) fail("FORMAT_VERSION wird nicht unterstuetzt.");
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(values.GCP_PROJECT_ID)) fail("GCP_PROJECT_ID ist ungueltig.");
  if (!DNS_LABEL.test(values.GKE_CLUSTER_NAME) || values.GKE_CLUSTER_NAME.length > 63) fail("GKE_CLUSTER_NAME ist ungueltig.");
  if (!/^[a-z][a-z0-9-]{1,62}$/u.test(values.GKE_LOCATION)) fail("GKE_LOCATION ist ungueltig.");
  if (!DNS_LABEL.test(values.K8S_NAMESPACE) || values.K8S_NAMESPACE.length > 63) fail("K8S_NAMESPACE ist ungueltig.");
  if (!UUID.test(values.K8S_NAMESPACE_UID)) fail("K8S_NAMESPACE_UID ist ungueltig.");
  if (!DNS_LABEL.test(values.API_DEPLOYMENT) || values.API_DEPLOYMENT.length > 63) fail("API_DEPLOYMENT ist ungueltig.");
  if (!UUID.test(values.API_DEPLOYMENT_UID)) fail("API_DEPLOYMENT_UID ist ungueltig.");
  if (values.API_CONTAINER !== "api") fail("API_CONTAINER muss exakt api sein.");
  const allowedControllerKinds = new Set(["CronJob", "DaemonSet", "Deployment", "Job", "StatefulSet"]);
  const allowedNonDbControllers = values.ALLOWED_NON_DB_CONTROLLERS === "none"
    ? []
    : values.ALLOWED_NON_DB_CONTROLLERS.split(",");
  if (values.ALLOWED_NON_DB_CONTROLLERS !== "none" && (
    new Set(allowedNonDbControllers).size !== allowedNonDbControllers.length
    || allowedNonDbControllers.some((entry) => {
      const separator = entry.indexOf("/");
      const kind = entry.slice(0, separator);
      const name = entry.slice(separator + 1);
      return separator < 1 || !allowedControllerKinds.has(kind) || !DNS_LABEL.test(name) || name.length > 63;
    })
    || [...allowedNonDbControllers].sort((first, second) => first.localeCompare(second, "en")).join(",")
      !== values.ALLOWED_NON_DB_CONTROLLERS
  )) fail("ALLOWED_NON_DB_CONTROLLERS ist weder none noch eine kanonisch sortierte Controller-Liste.");
  if (allowedNonDbControllers.includes(`Deployment/${values.API_DEPLOYMENT}`)) {
    fail("Das gebundene API-Deployment darf nicht als fremder Non-DB-Controller attestiert werden.");
  }
  const expectedContext = `gke_${values.GCP_PROJECT_ID}_${values.GKE_LOCATION}_${values.GKE_CLUSTER_NAME}`;
  if (values.KUBE_CONTEXT !== expectedContext) fail("KUBE_CONTEXT ist nicht exakt aus Projekt, Location und Cluster abgeleitet.");
  let apiServer;
  try {
    const parsed = new URL(values.KUBE_API_SERVER);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.origin !== values.KUBE_API_SERVER
    ) fail("KUBE_API_SERVER ist nicht kanonisch.");
    apiServer = parsed.origin;
  } catch (error) {
    if (error instanceof FreezeOperatorError) throw error;
    fail("KUBE_API_SERVER ist ungueltig.");
  }
  if (!/^[a-f0-9]{64}$/u.test(values.GKE_CLUSTER_CA_SHA256)) fail("GKE_CLUSTER_CA_SHA256 ist ungueltig.");
  const selectorEntries = values.API_POD_SELECTOR.split(",").map((entry) => entry.split("="));
  if (selectorEntries.some((entry) => entry.length !== 2)) fail("API_POD_SELECTOR ist ungueltig.");
  const selector = Object.fromEntries(selectorEntries);
  if (
    Object.keys(selector).length !== 3
    || selector["app.kubernetes.io/component"] !== "api"
    || selector["app.kubernetes.io/name"] !== "versorgungs-kompass"
    || !DNS_LABEL.test(selector["app.kubernetes.io/instance"] || "")
  ) {
    fail("API_POD_SELECTOR muss exakt Name, Instanz und API-Komponente binden.");
  }
  const canonicalSelector = Object.entries(selector)
    .sort(([first], [second]) => first.localeCompare(second, "en"))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  if (canonicalSelector !== values.API_POD_SELECTOR) fail("API_POD_SELECTOR ist nicht kanonisch sortiert.");
  const imageMatch = values.API_IMAGE.match(/^([a-z0-9.-]+(?::[0-9]+)?)\/([a-z0-9._/-]+)@sha256:([a-f0-9]{64})$/u);
  if (!imageMatch) fail("API_IMAGE muss ein unveraenderliches Image mit sha256-Digest sein.");
  const region = values.GKE_LOCATION.replace(/-[a-z]$/u, "");
  if (
    imageMatch[1] !== `${region}-docker.pkg.dev`
    || !imageMatch[2].startsWith(`${values.GCP_PROJECT_ID}/`)
  ) {
    fail("API_IMAGE gehoert nicht zur bestaetigten Region und zum bestaetigten Projekt.");
  }
  const imageDigest = imageMatch[3];
  if (
    values.API_IMAGE_ID.length > 1024
    || !/^[A-Za-z0-9._:/@+-]+$/u.test(values.API_IMAGE_ID)
    || !values.API_IMAGE_ID.endsWith(`sha256:${imageDigest}`)
  ) fail("API_IMAGE_ID ist nicht exakt an den Image-Digest gebunden.");
  const originalReplicas = Number(values.ORIGINAL_REPLICAS);
  assertInteger(originalReplicas, "ORIGINAL_REPLICAS", 1, 20);
  if (String(originalReplicas) !== values.ORIGINAL_REPLICAS) fail("ORIGINAL_REPLICAS ist nicht kanonisch.");
  const readbackTimeoutSeconds = Number(values.READBACK_TIMEOUT_SECONDS);
  assertInteger(readbackTimeoutSeconds, "READBACK_TIMEOUT_SECONDS", 30, 600);
  if (String(readbackTimeoutSeconds) !== values.READBACK_TIMEOUT_SECONDS) fail("READBACK_TIMEOUT_SECONDS ist nicht kanonisch.");

  const kubeconfigPath = assertProtectedFile(values.KUBECONFIG_PATH, "KUBECONFIG_PATH");
  assertDisjoint(kubeconfigPath, "KUBECONFIG_PATH", projectRoot, "Repositorypfad");
  if (!path.isAbsolute(values.STATE_FILE)) fail("STATE_FILE muss absolut sein.");
  const stateParent = assertCanonicalDirectory(path.dirname(values.STATE_FILE), "STATE_FILE-Verzeichnis", { protectedMode: true });
  const stateBasename = path.basename(values.STATE_FILE);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(stateBasename)) fail("STATE_FILE besitzt keinen sicheren Dateinamen.");
  if (values.STATE_FILE !== path.join(stateParent, stateBasename)) fail("STATE_FILE muss kanonisch und symlinkfrei adressiert sein.");
  assertDisjoint(values.STATE_FILE, "STATE_FILE", projectRoot, "Repositorypfad");
  if (new Set([configPath, kubeconfigPath, values.STATE_FILE]).size !== 3) {
    fail("Konfiguration, Kubeconfig und Statusdatei muessen getrennte Dateien sein.");
  }

  return Object.freeze({
    allowedNonDbControllers: Object.freeze(allowedNonDbControllers),
    apiContainer: values.API_CONTAINER,
    apiDeployment: values.API_DEPLOYMENT,
    apiDeploymentUid: values.API_DEPLOYMENT_UID,
    apiImage: values.API_IMAGE,
    apiImageId: values.API_IMAGE_ID,
    apiPodSelector: values.API_POD_SELECTOR,
    clusterCaSha256: values.GKE_CLUSTER_CA_SHA256,
    clusterName: values.GKE_CLUSTER_NAME,
    configFingerprint: sha256(raw),
    configPath,
    gcpProjectId: values.GCP_PROJECT_ID,
    kubeApiServer: apiServer,
    kubeContext: values.KUBE_CONTEXT,
    kubeconfigFingerprint: sha256(readFileSync(kubeconfigPath)),
    kubeconfigPath,
    location: values.GKE_LOCATION,
    namespace: values.K8S_NAMESPACE,
    namespaceUid: values.K8S_NAMESPACE_UID,
    originalReplicas,
    readbackTimeoutSeconds,
    selector,
    stateFile: values.STATE_FILE
  });
}

function metadata(
  object,
  label,
  expectedName,
  expectedNamespace = null,
  expectedUid = null,
  { allowDeleting = false } = {}
) {
  const value = object?.metadata;
  if (!value || value.name !== expectedName || (!allowDeleting && value.deletionTimestamp)) {
    fail(`${label} ist nicht exakt gebunden oder wird geloescht.`);
  }
  assertString(value.name, `${label}-Name`, DNS_LABEL);
  if (expectedNamespace !== null && value.namespace !== expectedNamespace) fail(`${label} liegt nicht im bestaetigten Namespace.`);
  if (expectedUid !== null && value.uid !== expectedUid) fail(`${label}-UID weicht von der Zielkonfiguration ab.`);
  assertString(value.uid, `${label}-UID`, UUID);
  assertString(String(value.resourceVersion || ""), `${label}-ResourceVersion`, RESOURCE_VERSION);
  return value;
}

function numericStatus(value) {
  return value === undefined ? 0 : value;
}

function selectorEquals(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualEntries = Object.entries(actual).sort(([first], [second]) => first.localeCompare(second, "en"));
  const expectedEntries = Object.entries(expected).sort(([first], [second]) => first.localeCompare(second, "en"));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function controllerOwner(object, label) {
  const controllers = (object?.metadata?.ownerReferences || []).filter((owner) => owner.controller === true);
  if (controllers.length !== 1) fail(`${label} besitzt nicht exakt einen Controller-Owner.`);
  return controllers[0];
}

function apiContainer(containers, name, label) {
  if (!Array.isArray(containers)) fail(`${label} besitzt keine Containerliste.`);
  const matches = containers.filter((container) => container?.name === name);
  if (matches.length !== 1) fail(`${label} besitzt nicht exakt den API-Container.`);
  return matches[0];
}

function kubectlBase(config, { namespaced = true } = {}) {
  return [
    `--kubeconfig=${config.kubeconfigPath}`,
    `--context=${config.kubeContext}`,
    "--request-timeout=15s",
    ...(namespaced ? [`--namespace=${config.namespace}`] : [])
  ];
}

function verifyStaticTarget(config, binaries, repository) {
  const activeProject = runCommand(
    binaries.gcloud,
    ["config", "get-value", "project", "--quiet"],
    "Aktives-GCP-Projekt-Readback"
  ).stdout.trim();
  if (activeProject !== config.gcpProjectId) fail("Aktives gcloud-Projekt weicht vom bestaetigten Zielprojekt ab.");
  const project = parseJson(runCommand(
    binaries.gcloud,
    ["projects", "describe", config.gcpProjectId, "--format=json"],
    "GCP-Projekt-Readback"
  ).stdout, "GCP-Projekt-Readback");
  if (
    project.projectId !== config.gcpProjectId
    || project.lifecycleState !== "ACTIVE"
    || !/^[0-9]+$/u.test(String(project.projectNumber || ""))
  ) fail("GCP-Projekt ist nicht aktiv oder nicht exakt gebunden.");

  const cluster = parseJson(runCommand(
    binaries.gcloud,
    [
      "container", "clusters", "describe", config.clusterName,
      `--location=${config.location}`,
      `--project=${config.gcpProjectId}`,
      "--format=json"
    ],
    "GKE-Cluster-Readback"
  ).stdout, "GKE-Cluster-Readback");
  const dnsEndpoint = cluster.controlPlaneEndpointsConfig?.dnsEndpointConfig?.endpoint;
  const normalizedDnsEndpoint = typeof dnsEndpoint === "string"
    ? (dnsEndpoint.startsWith("https://") ? dnsEndpoint : `https://${dnsEndpoint}`)
    : "";
  const clusterCa = cluster.masterAuth?.clusterCaCertificate;
  let clusterCaFingerprint = "";
  if (typeof clusterCa === "string" && clusterCa.length > 0) {
    const decoded = Buffer.from(clusterCa, "base64");
    if (decoded.length > 0 && decoded.toString("base64").replace(/=+$/u, "") === clusterCa.replace(/=+$/u, "")) {
      clusterCaFingerprint = sha256(decoded);
    }
  }
  const acceptedSelfLinks = new Set([
    `https://container.googleapis.com/v1/projects/${config.gcpProjectId}/locations/${config.location}/clusters/${config.clusterName}`,
    `https://container.googleapis.com/v1beta1/projects/${config.gcpProjectId}/locations/${config.location}/clusters/${config.clusterName}`,
    `https://container.googleapis.com/v1/projects/${config.gcpProjectId}/zones/${config.location}/clusters/${config.clusterName}`,
    `https://container.googleapis.com/v1beta1/projects/${config.gcpProjectId}/zones/${config.location}/clusters/${config.clusterName}`
  ]);
  if (
    cluster.name !== config.clusterName
    || cluster.location !== config.location
    || cluster.status !== "RUNNING"
    || normalizedDnsEndpoint !== config.kubeApiServer
    || clusterCaFingerprint !== config.clusterCaSha256
    || !acceptedSelfLinks.has(cluster.selfLink)
  ) fail("GKE-Cluster ist nicht laufend oder nicht exakt an Projekt, Location, DNS-Endpunkt und CA gebunden.");

  const currentContext = runCommand(
    binaries.kubectl,
    [`--kubeconfig=${config.kubeconfigPath}`, "config", "current-context"],
    "Kubernetes-Kontext-Readback"
  ).stdout.trim();
  if (currentContext !== config.kubeContext) fail("Aktiver Kubernetes-Kontext weicht vom bestaetigten Kontext ab.");
  const kubeTargetTemplate = "{.clusters[0].cluster.server}{\"\\n\"}"
    + "{.clusters[0].cluster.certificate-authority-data}{\"\\n\"}"
    + "{.clusters[0].cluster.certificate-authority}{\"\\n\"}"
    + "{.clusters[0].cluster.insecure-skip-tls-verify}{\"\\n\"}"
    + "{.clusters[0].cluster.tls-server-name}{\"\\n\"}"
    + "{.clusters[0].cluster.proxy-url}{\"\\n\"}{\"END\\n\"}";
  const kubeTarget = runCommand(
    binaries.kubectl,
    [
      `--kubeconfig=${config.kubeconfigPath}`,
      `--context=${config.kubeContext}`,
      "config", "view", "--minify", "--raw", "-o", `jsonpath=${kubeTargetTemplate}`
    ],
    "Kubernetes-DNS-und-TLS-Readback"
  ).stdout.trimEnd().split("\n");
  if (
    kubeTarget.length !== 7
    || kubeTarget[0] !== config.kubeApiServer
    || kubeTarget[1] !== ""
    || kubeTarget[2] !== ""
    || !["", "false"].includes(kubeTarget[3])
    || kubeTarget[4] !== ""
    || kubeTarget[5] !== ""
    || kubeTarget[6] !== "END"
  ) fail("Kubeconfig-DNS- oder TLS-Ziel weicht vom gebundenen GKE-Cluster ab.");

  const namespace = parseJson(runCommand(
    binaries.kubectl,
    [...kubectlBase(config, { namespaced: false }), "get", "namespace", config.namespace, "-o", "json"],
    "Kubernetes-Namespace-Readback"
  ).stdout, "Kubernetes-Namespace-Readback");
  metadata(namespace, "Kubernetes-Namespace", config.namespace, null, config.namespaceUid);
  if (
    sha256(readFileSync(config.configPath)) !== config.configFingerprint
    || sha256(readFileSync(config.kubeconfigPath)) !== config.kubeconfigFingerprint
  ) fail("Externe Zielkonfiguration oder Kubeconfig wurde waehrend des Readbacks veraendert.");

  const staticBinding = Object.freeze({
    apiDeployment: config.apiDeployment,
    apiDeploymentUid: config.apiDeploymentUid,
    apiImage: config.apiImage,
    apiImageId: config.apiImageId,
    apiPodSelector: config.apiPodSelector,
    clusterCaSha256: config.clusterCaSha256,
    clusterName: config.clusterName,
    configFingerprint: config.configFingerprint,
    gcpProjectId: config.gcpProjectId,
    gcpProjectNumber: String(project.projectNumber),
    kubeApiServer: config.kubeApiServer,
    kubeContext: config.kubeContext,
    kubeconfigFingerprint: config.kubeconfigFingerprint,
    location: config.location,
    namespace: config.namespace,
    namespaceUid: config.namespaceUid,
    operatorRevision: repository.revision,
    originalReplicas: config.originalReplicas
  });
  return Object.freeze({
    ...staticBinding,
    bindingFingerprint: sha256(`versorgungs-kompass-gke-writer-binding-v1\0${JSON.stringify(staticBinding)}`)
  });
}

function getJson(config, binaries, kind, name = "", selector = "") {
  const argumentsList = [...kubectlBase(config), "get", kind];
  if (name) argumentsList.push(name);
  if (selector) argumentsList.push(`--selector=${selector}`);
  argumentsList.push("-o", "json");
  return parseJson(
    runCommand(binaries.kubectl, argumentsList, `${kind}-Readback`).stdout,
    `${kind}-Readback`
  );
}

function listItems(document, label) {
  if (!Array.isArray(document?.items)) fail(`${label} besitzt keine Objektliste.`);
  return document.items;
}

function referencedResourceNames(podSpec) {
  const names = new Set();
  const containers = [
    ...(podSpec?.initContainers || []),
    ...(podSpec?.containers || []),
    ...(podSpec?.ephemeralContainers || [])
  ];
  for (const container of containers) {
    for (const source of container?.envFrom || []) {
      if (source?.secretRef?.name) names.add(source.secretRef.name);
      if (source?.configMapRef?.name) names.add(source.configMapRef.name);
    }
    for (const variable of container?.env || []) {
      if (variable?.valueFrom?.secretKeyRef?.name) names.add(variable.valueFrom.secretKeyRef.name);
      if (variable?.valueFrom?.configMapKeyRef?.name) names.add(variable.valueFrom.configMapKeyRef.name);
    }
  }
  for (const volume of podSpec?.volumes || []) {
    if (volume?.secret?.secretName) names.add(volume.secret.secretName);
    if (volume?.configMap?.name) names.add(volume.configMap.name);
    for (const source of volume?.projected?.sources || []) {
      if (source?.secret?.name) names.add(source.secret.name);
      if (source?.configMap?.name) names.add(source.configMap.name);
    }
    if (volume?.csi?.volumeAttributes?.secretProviderClass) {
      names.add(volume.csi.volumeAttributes.secretProviderClass);
    }
  }
  return names;
}

function writerIndicators(podSpec, labels, { serviceAccounts, targetReferenceNames, targetServiceAccount }) {
  const reasons = new Set();
  const strongDatabaseText = /(?:cloud[-_. ]?sql|postgres(?:ql)?|\bpsql\b|database[_-]?(?:url|host|name|user|password)|db[_-]?(?:host|name|user|password|secret|owner|migrat|proxy))/iu;
  const databaseEnvironmentName = /^(?:DATABASE_URL|DB_.+|PG(?:HOST|HOSTADDR|PORT|DATABASE|USER|PASSWORD|PASSFILE|SERVICE|SERVICEFILE)|CLOUD_SQL.+)$/u;
  const inspectReference = (name, source) => {
    if (typeof name !== "string" || name.length === 0) return;
    if (targetReferenceNames.has(name)) reasons.add(`${source}:API-Referenz`);
    if (strongDatabaseText.test(name)) reasons.add(`${source}:DB-Indikator`);
  };
  const containers = [
    ...(podSpec?.initContainers || []),
    ...(podSpec?.containers || []),
    ...(podSpec?.ephemeralContainers || [])
  ];
  for (const container of containers) {
    const executableText = [
      container?.name,
      container?.image,
      ...(container?.command || []),
      ...(container?.args || [])
    ].filter((value) => typeof value === "string").join(" ");
    if (strongDatabaseText.test(executableText)) reasons.add("Container:DB-oder-Cloud-SQL-Indikator");
    for (const source of container?.envFrom || []) {
      inspectReference(source?.secretRef?.name, "envFrom-Secret");
      inspectReference(source?.configMapRef?.name, "envFrom-ConfigMap");
    }
    for (const variable of container?.env || []) {
      if (databaseEnvironmentName.test(variable?.name || "")) reasons.add("Environment:DB-Indikator");
      if (typeof variable?.value === "string" && strongDatabaseText.test(variable.value)) {
        reasons.add("Environment-Wert:DB-Indikator");
      }
      inspectReference(variable?.valueFrom?.secretKeyRef?.name, "env-Secret");
      inspectReference(variable?.valueFrom?.configMapKeyRef?.name, "env-ConfigMap");
      if (strongDatabaseText.test(variable?.valueFrom?.secretKeyRef?.key || "")) reasons.add("Secret-Key:DB-Indikator");
      if (strongDatabaseText.test(variable?.valueFrom?.configMapKeyRef?.key || "")) reasons.add("ConfigMap-Key:DB-Indikator");
    }
    for (const mount of container?.volumeMounts || []) {
      if (strongDatabaseText.test(`${mount?.name || ""} ${mount?.mountPath || ""}`)) {
        reasons.add("VolumeMount:DB-oder-Cloud-SQL-Indikator");
      }
    }
  }
  for (const volume of podSpec?.volumes || []) {
    inspectReference(volume?.secret?.secretName, "Volume-Secret");
    inspectReference(volume?.configMap?.name, "Volume-ConfigMap");
    for (const source of volume?.projected?.sources || []) {
      inspectReference(source?.secret?.name, "Projected-Secret");
      inspectReference(source?.configMap?.name, "Projected-ConfigMap");
    }
    if (strongDatabaseText.test(JSON.stringify({
      csiDriver: volume?.csi?.driver || "",
      csiSecretProviderClass: volume?.csi?.volumeAttributes?.secretProviderClass || "",
      name: volume?.name || ""
    }))) reasons.add("Volume:DB-oder-Cloud-SQL-Indikator");
  }
  const serviceAccountName = podSpec?.serviceAccountName || "default";
  if (serviceAccountName === targetServiceAccount) reasons.add("ServiceAccount:API-Workload");
  const serviceAccount = serviceAccounts.get(serviceAccountName);
  const workloadIdentity = serviceAccount?.annotations?.["iam.gke.io/gcp-service-account"];
  if (
    typeof workloadIdentity === "string"
    && strongDatabaseText.test(`${serviceAccountName} ${workloadIdentity}`)
  ) reasons.add("Workload-Identity:DB-oder-API-Indikator");
  if (labels?.["app.kubernetes.io/component"] === "api") reasons.add("Label:API-Komponente");
  return [...reasons].sort((first, second) => first.localeCompare(second, "en"));
}

function readWorkload(config, binaries) {
  const deployment = getJson(config, binaries, "deployment", config.apiDeployment);
  if (deployment.apiVersion !== "apps/v1" || deployment.kind !== "Deployment") {
    fail("API-Deployment besitzt nicht die erwartete Ressourcenart.");
  }
  const deploymentMetadata = metadata(
    deployment,
    "API-Deployment",
    config.apiDeployment,
    config.namespace,
    config.apiDeploymentUid
  );
  const generation = assertInteger(deploymentMetadata.generation, "Deployment-Generation", 1, Number.MAX_SAFE_INTEGER);
  if (
    !selectorEquals(deployment.spec?.selector?.matchLabels, config.selector)
    || (deployment.spec?.selector?.matchExpressions || []).length !== 0
  ) fail("API-Deployment-Selektor weicht von der Zielkonfiguration ab.");
  const targetPodSpec = deployment.spec?.template?.spec;
  const deploymentApiContainer = apiContainer(targetPodSpec?.containers, config.apiContainer, "API-Deployment");
  if (deploymentApiContainer.image !== config.apiImage) fail("API-Deployment verwendet nicht das bestaetigte Image.");
  const desiredReplicas = deployment.spec?.replicas;
  assertInteger(desiredReplicas, "Deployment-Replica-Zahl", 0, 20);

  const hpas = getJson(config, binaries, "horizontalpodautoscalers");
  if (!Array.isArray(hpas.items)) fail("HPA-Readback besitzt keine Objektliste.");
  const conflictingHpa = hpas.items.find((hpa) =>
    hpa?.spec?.scaleTargetRef?.kind === "Deployment"
    && hpa.spec.scaleTargetRef.name === config.apiDeployment
  );
  if (conflictingHpa) fail("Ein HorizontalPodAutoscaler kann die API-Deployment-Sperre selbststaendig aufheben.");

  const resourceLists = {
    CronJob: listItems(getJson(config, binaries, "cronjobs"), "CronJob-Readback"),
    DaemonSet: listItems(getJson(config, binaries, "daemonsets"), "DaemonSet-Readback"),
    Deployment: listItems(getJson(config, binaries, "deployments"), "Deployment-Inventur"),
    Job: listItems(getJson(config, binaries, "jobs"), "Job-Readback"),
    ReplicaSet: listItems(getJson(config, binaries, "replicasets"), "ReplicaSet-Inventur"),
    StatefulSet: listItems(getJson(config, binaries, "statefulsets"), "StatefulSet-Readback")
  };
  const allPods = listItems(getJson(config, binaries, "pods"), "Pod-Inventur");
  const allServiceAccounts = listItems(getJson(config, binaries, "serviceaccounts"), "ServiceAccount-Inventur");
  const apiVersionByKind = {
    CronJob: "batch/v1",
    DaemonSet: "apps/v1",
    Deployment: "apps/v1",
    Job: "batch/v1",
    ReplicaSet: "apps/v1",
    StatefulSet: "apps/v1"
  };
  const podSpecFor = (kind, resource) => {
    if (["Deployment", "DaemonSet", "StatefulSet", "Job", "ReplicaSet"].includes(kind)) {
      return resource?.spec?.template?.spec;
    }
    return resource?.spec?.jobTemplate?.spec?.template?.spec;
  };
  const podTemplateLabelsFor = (kind, resource) => {
    if (["Deployment", "DaemonSet", "StatefulSet", "Job", "ReplicaSet"].includes(kind)) {
      return resource?.spec?.template?.metadata?.labels || {};
    }
    return resource?.spec?.jobTemplate?.spec?.template?.metadata?.labels || {};
  };
  const recordsByUid = new Map();
  const recordsByKey = new Map();
  const inventoryRecords = [];
  for (const [kind, resources] of Object.entries(resourceLists)) {
    for (const resource of resources) {
      if (resource?.apiVersion !== apiVersionByKind[kind] || resource?.kind !== kind) {
        fail(`${kind}-Inventur enthaelt eine unerwartete Ressourcenart.`);
      }
      const resourceMetadata = metadata(resource, kind, resource?.metadata?.name, config.namespace);
      const controllers = (resourceMetadata.ownerReferences || []).filter((owner) => owner.controller === true);
      if (controllers.length > 1) fail(`${kind}/${resourceMetadata.name} besitzt mehrere Controller-Owner.`);
      const record = Object.freeze({
        key: `${kind}/${resourceMetadata.name}`,
        kind,
        labels: {
          ...(resourceMetadata.labels || {}),
          ...podTemplateLabelsFor(kind, resource)
        },
        name: resourceMetadata.name,
        owner: controllers[0] || null,
        podSpec: podSpecFor(kind, resource),
        resource,
        resourceVersion: resourceMetadata.resourceVersion,
        uid: resourceMetadata.uid
      });
      if (recordsByUid.has(record.uid) || recordsByKey.has(record.key)) fail("Namespace-Inventur enthaelt doppelte Controller-Identitaeten.");
      recordsByUid.set(record.uid, record);
      recordsByKey.set(record.key, record);
      inventoryRecords.push({
        key: record.key,
        ownerUid: record.owner?.uid || "",
        podSpecFingerprint: sha256(JSON.stringify(record.podSpec || null)),
        resourceVersion: record.resourceVersion,
        uid: record.uid
      });
    }
  }

  const targetDeploymentRecords = resourceLists.Deployment.filter((resource) =>
    resource?.metadata?.name === config.apiDeployment
    && resource?.metadata?.uid === config.apiDeploymentUid
  );
  if (targetDeploymentRecords.length !== 1) fail("Namespace-Inventur enthaelt das gebundene API-Deployment nicht exakt einmal.");
  const targetDeploymentRecord = recordsByUid.get(config.apiDeploymentUid);
  if (
    targetDeploymentRecord.resourceVersion !== deploymentMetadata.resourceVersion
    || sha256(JSON.stringify(targetDeploymentRecord.podSpec || null)) !== sha256(JSON.stringify(targetPodSpec || null))
  ) fail("API-Deployment hat sich waehrend der gebundenen Namespace-Inventur veraendert.");
  const serviceAccounts = new Map();
  for (const serviceAccount of allServiceAccounts) {
    if (serviceAccount?.apiVersion !== "v1" || serviceAccount?.kind !== "ServiceAccount") {
      fail("ServiceAccount-Inventur enthaelt eine unerwartete Ressourcenart.");
    }
    const serviceAccountMetadata = metadata(
      serviceAccount,
      "ServiceAccount",
      serviceAccount?.metadata?.name,
      config.namespace
    );
    if (serviceAccounts.has(serviceAccountMetadata.name)) fail("ServiceAccount-Inventur enthaelt doppelte Namen.");
    serviceAccounts.set(serviceAccountMetadata.name, {
      annotations: serviceAccountMetadata.annotations || {},
      uid: serviceAccountMetadata.uid
    });
    inventoryRecords.push({
      annotationsFingerprint: sha256(JSON.stringify(serviceAccountMetadata.annotations || {})),
      key: `ServiceAccount/${serviceAccountMetadata.name}`,
      resourceVersion: serviceAccountMetadata.resourceVersion,
      uid: serviceAccountMetadata.uid
    });
  }
  const targetServiceAccount = targetPodSpec?.serviceAccountName || "default";
  if (!serviceAccounts.has(targetServiceAccount)) fail("ServiceAccount des API-Deployments fehlt in der Namespace-Inventur.");
  const targetReferenceNames = referencedResourceNames(targetPodSpec);
  const indicatorContext = { serviceAccounts, targetReferenceNames, targetServiceAccount };
  const configuredAllowedRoots = new Set(config.allowedNonDbControllers);
  const actualAllowedRoots = new Set();
  const permittedControllerUids = new Set();
  const candidates = [];
  const recordCandidate = (record, reasons) => {
    candidates.push({ key: record.key, reasons: [...new Set(reasons)].sort() });
  };

  for (const kind of ["Deployment", "StatefulSet", "DaemonSet", "CronJob"]) {
    for (const resource of resourceLists[kind]) {
      const record = recordsByUid.get(resource.metadata.uid);
      if (kind === "Deployment" && record.uid === config.apiDeploymentUid) continue;
      const reasons = writerIndicators(record.podSpec, record.labels, indicatorContext);
      if (!configuredAllowedRoots.has(record.key)) reasons.push("nicht-als-Non-DB-Controller-attestiert");
      else {
        actualAllowedRoots.add(record.key);
        permittedControllerUids.add(record.uid);
      }
      if (reasons.length > 0) recordCandidate(record, reasons);
    }
  }
  for (const resource of resourceLists.Job) {
    const record = recordsByUid.get(resource.metadata.uid);
    if (record.owner) {
      const owner = recordsByUid.get(record.owner.uid);
      if (
        !owner
        || owner.kind !== "CronJob"
        || record.owner.apiVersion !== "batch/v1"
        || record.owner.kind !== owner.kind
        || record.owner.name !== owner.name
        || !permittedControllerUids.has(owner.uid)
      ) {
        recordCandidate(record, ["Job-Owner-ist-nicht-ein-attestierter-CronJob"]);
      } else {
        permittedControllerUids.add(record.uid);
        const reasons = writerIndicators(record.podSpec, record.labels, indicatorContext);
        if (reasons.length > 0) recordCandidate(record, reasons);
      }
    } else {
      const reasons = writerIndicators(record.podSpec, record.labels, indicatorContext);
      if (!configuredAllowedRoots.has(record.key)) reasons.push("nicht-als-Non-DB-Controller-attestiert");
      else {
        actualAllowedRoots.add(record.key);
        permittedControllerUids.add(record.uid);
      }
      if (reasons.length > 0) recordCandidate(record, reasons);
    }
  }
  for (const missing of [...configuredAllowedRoots].filter((key) => !actualAllowedRoots.has(key))) {
    candidates.push({ key: missing, reasons: ["attestierter-Controller-fehlt-im-Namespace"] });
  }

  const targetReplicaSetByUid = new Map();
  const permittedReplicaSetUids = new Set();
  const replicaSetSnapshots = [];
  for (const replicaSet of resourceLists.ReplicaSet) {
    const record = recordsByUid.get(replicaSet.metadata.uid);
    if (!record.owner || record.owner.apiVersion !== "apps/v1" || record.owner.kind !== "Deployment") {
      recordCandidate(record, ["ReplicaSet-ohne-eindeutigen-Deployment-Owner"]);
      continue;
    }
    const replicas = replicaSet.spec?.replicas;
    assertInteger(replicas, "ReplicaSet-Replica-Zahl", 0, 20);
    if (record.owner.uid === config.apiDeploymentUid && record.owner.name === config.apiDeployment) {
      const imageValue = apiContainer(
        replicaSet.spec?.template?.spec?.containers,
        config.apiContainer,
        `${record.key}-API-Container`
      ).image;
      if (
        !selectorEquals(replicaSet.spec?.selector?.matchLabels, config.selector)
        || (replicaSet.spec?.selector?.matchExpressions || []).length !== 0
      ) fail("API-ReplicaSet-Selektor weicht vom gebundenen API-Deployment ab.");
      if (replicas > 0 && imageValue !== config.apiImage) fail("Aktives API-ReplicaSet verwendet nicht das bestaetigte Image.");
      const snapshot = Object.freeze({
        image: imageValue,
        name: record.name,
        readyReplicas: numericStatus(replicaSet.status?.readyReplicas),
        replicas,
        resourceVersion: record.resourceVersion,
        statusReplicas: numericStatus(replicaSet.status?.replicas),
        uid: record.uid
      });
      targetReplicaSetByUid.set(record.uid, snapshot);
      replicaSetSnapshots.push(snapshot);
      continue;
    }
    const owner = recordsByUid.get(record.owner.uid);
    if (
      !owner
      || owner.kind !== "Deployment"
      || record.owner.name !== owner.name
      || !permittedControllerUids.has(owner.uid)
    ) {
      recordCandidate(record, ["ReplicaSet-Owner-ist-nicht-ein-attestiertes-Deployment"]);
      continue;
    }
    permittedReplicaSetUids.add(record.uid);
    const reasons = writerIndicators(record.podSpec, record.labels, indicatorContext);
    if (reasons.length > 0) recordCandidate(record, reasons);
  }
  if (targetReplicaSetByUid.size < 1) fail("API-ReplicaSet-Readback ist leer.");
  replicaSetSnapshots.sort((first, second) => first.name.localeCompare(second.name, "en"));

  const podSnapshots = [];
  for (const pod of allPods) {
    if (pod?.apiVersion !== "v1" || pod?.kind !== "Pod") fail("Pod-Inventur enthaelt eine unerwartete Ressourcenart.");
    const podMetadata = metadata(
      pod,
      "Pod",
      pod?.metadata?.name,
      config.namespace,
      null,
      { allowDeleting: true }
    );
    const controllers = (podMetadata.ownerReferences || []).filter((owner) => owner.controller === true);
    if (controllers.length !== 1) {
      candidates.push({ key: `Pod/${podMetadata.name}`, reasons: ["Standalone-Pod-oder-mehrdeutiger-Owner"] });
      continue;
    }
    const owner = controllers[0];
    const targetReplicaSet = targetReplicaSetByUid.get(owner.uid);
    const ownedByTargetReplicaSet = owner.apiVersion === "apps/v1"
      && owner.kind === "ReplicaSet"
      && owner.name === targetReplicaSet?.name;
    if (ownedByTargetReplicaSet) {
      if (!Object.entries(config.selector).every(([key, value]) => podMetadata.labels?.[key] === value)) {
        fail("API-Pod besitzt nicht die exakt gebundenen Selektorlabels.");
      }
      const podSpecContainer = apiContainer(pod.spec?.containers, config.apiContainer, "API-Pod-Spec");
      if (podSpecContainer.image !== config.apiImage) fail("API-Pod-Spec verwendet nicht das bestaetigte Image.");
      const podStatusContainers = Array.isArray(pod.status?.containerStatuses) ? pod.status.containerStatuses : [];
      const podStatusMatches = podStatusContainers.filter((container) => container?.name === config.apiContainer);
      if (podStatusMatches.length > 1) fail("API-Pod-Status besitzt den API-Container mehrfach.");
      const podStatusContainer = podStatusMatches[0] || {};
      if (podStatusContainer.image && podStatusContainer.image !== config.apiImage) {
        fail("API-Pod-Status verwendet nicht das bestaetigte Image.");
      }
      if (podStatusContainer.imageID && podStatusContainer.imageID !== config.apiImageId) {
        fail("API-Pod-ImageID weicht von der Zielkonfiguration ab.");
      }
      podSnapshots.push(Object.freeze({
        deletionTimestamp: podMetadata.deletionTimestamp || "",
        image: podSpecContainer.image,
        imageId: podStatusContainer.imageID || "",
        name: podMetadata.name,
        phase: pod.status?.phase || "",
        ready: podStatusContainer.ready === true
          && (pod.status?.conditions || []).some((condition) => condition.type === "Ready" && condition.status === "True"),
        resourceVersion: podMetadata.resourceVersion,
        uid: podMetadata.uid
      }));
    } else {
      const ownerRecord = recordsByUid.get(owner.uid);
      const exactOwnerReference = ownerRecord
        && owner.apiVersion === apiVersionByKind[ownerRecord.kind]
        && owner.kind === ownerRecord.kind
        && owner.name === ownerRecord.name;
      const allowedOwner = exactOwnerReference && (
        (owner.kind === "ReplicaSet" && permittedReplicaSetUids.has(owner.uid))
        || permittedControllerUids.has(owner.uid)
      );
      const podRecord = {
        key: `Pod/${podMetadata.name}`,
        labels: podMetadata.labels || {},
        podSpec: pod.spec
      };
      const reasons = writerIndicators(pod.spec, podMetadata.labels || {}, indicatorContext);
      if (!allowedOwner) reasons.push("Pod-Owner-ist-nicht-attestiert");
      if (reasons.length > 0) recordCandidate(podRecord, reasons);
    }
    inventoryRecords.push({
      key: `Pod/${podMetadata.name}`,
      ownerUid: owner.uid,
      podSpecFingerprint: sha256(JSON.stringify(pod.spec || null)),
      resourceVersion: podMetadata.resourceVersion,
      uid: podMetadata.uid
    });
  }
  if (candidates.length > 0) {
    const summary = candidates
      .sort((first, second) => first.key.localeCompare(second.key, "en"))
      .map((candidate) => `${candidate.key}[${candidate.reasons.join("+")}]`)
      .join(", ");
    fail(`Namespace-Inventur lehnt fremde oder potenzielle DB-Writer fail-closed ab: ${summary}`);
  }
  podSnapshots.sort((first, second) => first.name.localeCompare(second.name, "en"));
  inventoryRecords.sort((first, second) => first.key.localeCompare(second.key, "en"));

  return Object.freeze({
    availableReplicas: numericStatus(deployment.status?.availableReplicas),
    deploymentGeneration: generation,
    deploymentResourceVersion: deploymentMetadata.resourceVersion,
    desiredReplicas,
    foreignNamespaceDbWriterCandidates: 0,
    namespaceInventoryFingerprint: sha256(`versorgungs-kompass-namespace-workload-inventory-v1\0${JSON.stringify(inventoryRecords)}`),
    observedGeneration: numericStatus(deployment.status?.observedGeneration),
    pods: podSnapshots,
    readyReplicas: numericStatus(deployment.status?.readyReplicas),
    replicaSets: replicaSetSnapshots,
    statusReplicas: numericStatus(deployment.status?.replicas),
    unavailableReplicas: numericStatus(deployment.status?.unavailableReplicas),
    updatedReplicas: numericStatus(deployment.status?.updatedReplicas)
  });
}

function isStableRunning(workload, config) {
  return workload.foreignNamespaceDbWriterCandidates === 0
    && workload.desiredReplicas === config.originalReplicas
    && workload.observedGeneration === workload.deploymentGeneration
    && workload.statusReplicas === config.originalReplicas
    && workload.updatedReplicas === config.originalReplicas
    && workload.readyReplicas === config.originalReplicas
    && workload.availableReplicas === config.originalReplicas
    && workload.unavailableReplicas === 0
    && workload.replicaSets.reduce((sum, replicaSet) => sum + replicaSet.replicas, 0) === config.originalReplicas
    && workload.replicaSets.reduce((sum, replicaSet) => sum + replicaSet.statusReplicas, 0) === config.originalReplicas
    && workload.pods.length === config.originalReplicas
    && workload.pods.every((pod) =>
      pod.deletionTimestamp === ""
      && pod.phase === "Running"
      && pod.ready
      && pod.image === config.apiImage
      && pod.imageId === config.apiImageId
    );
}

function isStableFrozen(workload) {
  return workload.foreignNamespaceDbWriterCandidates === 0
    && workload.desiredReplicas === 0
    && workload.observedGeneration === workload.deploymentGeneration
    && workload.statusReplicas === 0
    && workload.updatedReplicas === 0
    && workload.readyReplicas === 0
    && workload.availableReplicas === 0
    && workload.unavailableReplicas === 0
    && workload.replicaSets.every((replicaSet) =>
      replicaSet.replicas === 0
      && replicaSet.statusReplicas === 0
      && replicaSet.readyReplicas === 0
    )
    && workload.pods.length === 0;
}

function statePathStatus(stateFile) {
  if (existsSync(stateFile)) return "present";
  try {
    if (lstatSync(stateFile).isSymbolicLink()) return "invalid";
  } catch {
    return "absent";
  }
  return "invalid";
}

function validateStateObject(state, binding) {
  exactKeys(state, STATE_KEYS, "Writer-Freeze-Statusdatei");
  const phases = new Set(["freeze-pending", "frozen", "unfreeze-pending", "unfrozen"]);
  if (state.format_version !== 1 || !phases.has(state.phase)) fail("Writer-Freeze-Statusphase ist ungueltig.");
  const directBindings = {
    api_image: binding.apiImage,
    api_image_id: binding.apiImageId,
    api_pod_selector: binding.apiPodSelector,
    binding_fingerprint: binding.bindingFingerprint,
    deployment: binding.apiDeployment,
    deployment_uid: binding.apiDeploymentUid,
    gcp_project_id: binding.gcpProjectId,
    gke_cluster_name: binding.clusterName,
    gke_location: binding.location,
    namespace: binding.namespace,
    namespace_uid: binding.namespaceUid,
    operator_revision: binding.operatorRevision,
    original_replicas: binding.originalReplicas
  };
  for (const [key, expected] of Object.entries(directBindings)) {
    if (state[key] !== expected) fail(`Writer-Freeze-Statusdatei weicht bei ${key} von der Zielbindung ab.`);
  }
  assertString(state.pre_freeze_confirmation, "Status-pre_freeze_confirmation", /^FREEZE:[a-f0-9]{64}$/u);
  assertString(state.pre_freeze_deployment_resource_version, "Status-pre_freeze_deployment_resource_version", RESOURCE_VERSION);
  assertInteger(state.pre_freeze_deployment_generation, "Status-pre_freeze_deployment_generation", 1, Number.MAX_SAFE_INTEGER);
  assertString(state.freeze_started_at, "Status-freeze_started_at", ISO_TIMESTAMP);
  for (const timestampKey of ["frozen_at", "unfreeze_started_at", "unfrozen_at"]) {
    if (state[timestampKey] !== "") assertString(state[timestampKey], `Status-${timestampKey}`, ISO_TIMESTAMP);
  }
  for (const versionKey of ["frozen_deployment_resource_version", "unfrozen_deployment_resource_version"]) {
    if (state[versionKey] !== "") assertString(state[versionKey], `Status-${versionKey}`, RESOURCE_VERSION);
  }
  for (const generationKey of ["frozen_deployment_generation", "unfrozen_deployment_generation"]) {
    if (state[generationKey] !== 0) assertInteger(state[generationKey], `Status-${generationKey}`, 1, Number.MAX_SAFE_INTEGER);
  }
  if (["frozen", "unfreeze-pending", "unfrozen"].includes(state.phase)) {
    if (!state.frozen_at || !state.frozen_deployment_resource_version || state.frozen_deployment_generation < 1) {
      fail("Writer-Freeze-Statusdatei enthaelt keinen vollstaendigen Freeze-Readback.");
    }
  }
  if (["unfreeze-pending", "unfrozen"].includes(state.phase) && !state.unfreeze_started_at) {
    fail("Writer-Freeze-Statusdatei enthaelt keinen Unfreeze-Startnachweis.");
  }
  if (state.phase === "unfrozen") {
    if (!state.unfrozen_at || !state.unfrozen_deployment_resource_version || state.unfrozen_deployment_generation < 1) {
      fail("Writer-Freeze-Statusdatei enthaelt keinen vollstaendigen Unfreeze-Readback.");
    }
  }
  if (state.phase === "freeze-pending" && (
    state.frozen_at !== ""
    || state.frozen_deployment_resource_version !== ""
    || state.frozen_deployment_generation !== 0
    || state.unfreeze_started_at !== ""
    || state.unfrozen_at !== ""
    || state.unfrozen_deployment_resource_version !== ""
    || state.unfrozen_deployment_generation !== 0
  )) fail("Freeze-Pending-Statusdatei enthaelt unzulaessige spaetere Zustandsfelder.");
  if (state.phase === "frozen" && (
    state.unfreeze_started_at !== ""
    || state.unfrozen_at !== ""
    || state.unfrozen_deployment_resource_version !== ""
    || state.unfrozen_deployment_generation !== 0
  )) fail("Frozen-Statusdatei enthaelt unzulaessige Unfreeze-Felder.");
  if (state.phase === "unfreeze-pending" && (
    state.unfrozen_at !== ""
    || state.unfrozen_deployment_resource_version !== ""
    || state.unfrozen_deployment_generation !== 0
  )) fail("Unfreeze-Pending-Statusdatei enthaelt unzulaessige Abschlussfelder.");
  return state;
}

function readState(config, binding, { required = false } = {}) {
  const pathStatus = statePathStatus(config.stateFile);
  if (pathStatus === "invalid") fail("STATE_FILE ist ein Symlink oder ein ungueltiger Dateityp.");
  if (pathStatus === "absent") {
    if (required) fail("Geschuetzte Writer-Freeze-Statusdatei fehlt.");
    return null;
  }
  assertProtectedFile(config.stateFile, "Writer-Freeze-Statusdatei");
  const raw = readFileSync(config.stateFile, "utf8");
  const state = validateStateObject(parseJson(raw, "Writer-Freeze-Statusdatei"), binding);
  return Object.freeze({ fingerprint: sha256(raw), raw, value: state });
}

function stateJson(state) {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function fsyncParentDirectory(file) {
  const parent = path.dirname(file);
  let descriptor;
  try {
    descriptor = openSync(parent, fsConstants.O_RDONLY);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    fail(`Elternverzeichnis konnte nicht durable synchronisiert werden: ${parent}`);
  }
}

function createStateFile(stateFile, state) {
  let descriptor;
  try {
    descriptor = openSync(stateFile, "wx", 0o600);
    writeFileSync(descriptor, stateJson(state), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncParentDirectory(stateFile);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(stateFile); } catch { /* Noch nicht angelegte Datei. */ }
    fail("Writer-Freeze-Statusdatei konnte vor der Cluster-Aenderung nicht exklusiv angelegt werden.");
  }
  assertProtectedFile(stateFile, "Writer-Freeze-Statusdatei");
}

function replaceStateFile(stateFile, previousFingerprint, state) {
  assertProtectedFile(stateFile, "Writer-Freeze-Statusdatei");
  if (sha256(readFileSync(stateFile)) !== previousFingerprint) {
    fail("Writer-Freeze-Statusdatei wurde seit dem Readback veraendert.");
  }
  const temporary = `${stateFile}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, stateJson(state), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, stateFile);
    fsyncParentDirectory(stateFile);
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* Keine temporaere Datei vorhanden. */ }
    fail("Writer-Freeze-Statusdatei konnte nicht atomar fortgeschrieben werden.");
  }
  assertProtectedFile(stateFile, "Writer-Freeze-Statusdatei");
}

function createApplyLock(lockFile) {
  const lockContents = `${process.pid}\n${new Date().toISOString()}\n`;
  let descriptor;
  try {
    descriptor = openSync(lockFile, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") return null;
    fail("Writer-Freeze-Sperrdatei konnte nicht exklusiv angelegt werden.");
  }
  try {
    writeFileSync(descriptor, lockContents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncParentDirectory(lockFile);
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(lockFile); } catch { /* Unvollstaendige Sperrdatei bleibt fail-closed sichtbar. */ }
    fail("Writer-Freeze-Sperrdatei konnte nicht vollstaendig geschrieben werden.");
  }
  assertProtectedFile(lockFile, "Writer-Freeze-Sperrdatei");
  if (readFileSync(lockFile, "utf8") !== lockContents) {
    fail("Neu angelegte Writer-Freeze-Sperrdatei wurde unerwartet veraendert.");
  }
  return lockContents;
}

function readApplyLock(lockFile) {
  assertProtectedFile(lockFile, "Writer-Freeze-Sperrdatei");
  const raw = readFileSync(lockFile, "utf8");
  const match = raw.match(/^([1-9][0-9]*)\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\n$/u);
  if (!match) {
    fail("Writer-Freeze-Sperrdatei muss exakt zwei Zeilen mit PID und ISO-Zeitstempel enthalten.");
  }
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid > 2_147_483_647) {
    fail("Writer-Freeze-Sperrdatei enthaelt keine gueltige PID.");
  }
  const timestamp = match[2];
  const parsedTimestamp = new Date(timestamp);
  if (Number.isNaN(parsedTimestamp.getTime()) || parsedTimestamp.toISOString() !== timestamp) {
    fail("Writer-Freeze-Sperrdatei enthaelt keinen gueltigen ISO-Zeitstempel.");
  }
  return { pid, raw, timestamp };
}

function assertLockProcessIsGone(lock) {
  let processStatus = "alive";
  try {
    process.kill(lock.pid, 0);
  } catch (error) {
    if (error?.code === "ESRCH") processStatus = "gone";
    else if (error?.code === "EPERM") processStatus = "permission-denied";
    else fail("Prozessstatus der Writer-Freeze-Sperrdatei konnte nicht sicher bestimmt werden.");
  }
  if (processStatus !== "gone") {
    fail("Writer-Freeze-Sperrdatei gehoert zu einem lebenden oder nicht sicher pruefbaren Prozess; PID-Reuse bleibt gesperrt.");
  }
}

function archiveStaleApplyLock(lockFile, lock) {
  const archiveTimestamp = lock.timestamp.replaceAll(":", "-");
  let archiveFile;
  do {
    archiveFile = `${lockFile}.stale-${archiveTimestamp}-${lock.pid}-${randomBytes(8).toString("hex")}`;
  } while (existsSync(archiveFile));
  try {
    renameSync(lockFile, archiveFile);
    fsyncParentDirectory(archiveFile);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("Verwaiste Writer-Freeze-Sperrdatei konnte nicht atomar archiviert werden.");
  }
  assertProtectedFile(archiveFile, "Archivierte Writer-Freeze-Sperrdatei");
  if (readFileSync(archiveFile, "utf8") !== lock.raw) {
    fail("Archivierte Writer-Freeze-Sperrdatei stimmt nicht mit dem geprueften verwaisten Lock ueberein.");
  }
  return true;
}

function withApplyLock(config, callback) {
  const lockFile = `${config.stateFile}.lock`;
  let ownedLock = null;
  for (let attempt = 0; attempt < 4 && ownedLock === null; attempt += 1) {
    ownedLock = createApplyLock(lockFile);
    if (ownedLock !== null) break;
    const existingLock = readApplyLock(lockFile);
    assertLockProcessIsGone(existingLock);
    archiveStaleApplyLock(lockFile, existingLock);
  }
  if (ownedLock === null) {
    fail("Writer-Freeze-Sperrdatei konnte nach Recovery nicht exklusiv angelegt werden.");
  }
  try {
    return callback();
  } finally {
    try {
      assertProtectedFile(lockFile, "Writer-Freeze-Sperrdatei");
      if (readFileSync(lockFile, "utf8") === ownedLock) {
        unlinkSync(lockFile);
        fsyncParentDirectory(lockFile);
      }
    } catch {
      // Eine fremde oder veraenderte Sperrdatei darf beim Abschluss nicht geloescht werden.
    }
  }
}

function confirmation(action, binding, workload, state) {
  const snapshot = {
    action,
    bindingFingerprint: binding.bindingFingerprint,
    deploymentGeneration: workload.deploymentGeneration,
    deploymentResourceVersion: workload.deploymentResourceVersion,
    desiredReplicas: workload.desiredReplicas,
    foreignNamespaceDbWriterCandidates: workload.foreignNamespaceDbWriterCandidates,
    namespaceInventoryFingerprint: workload.namespaceInventoryFingerprint,
    pods: workload.pods,
    replicaSets: workload.replicaSets,
    stateFingerprint: state?.fingerprint || ""
  };
  return `${action.toUpperCase()}:${sha256(`versorgungs-kompass-gke-writer-confirmation-v1\0${JSON.stringify(snapshot)}`)}`;
}

function operationContext(config, binaries, repository) {
  const binding = verifyStaticTarget(config, binaries, repository);
  const workload = readWorkload(config, binaries);
  const state = readState(config, binding);
  return { binding, state, workload };
}

function outputTarget(action, phase, binding, workload, statePhase = "absent") {
  process.stdout.write([
    `AKTION=${action}`,
    `PHASE=${phase}`,
    `ZIEL=${binding.gcpProjectId}/${binding.location}/${binding.clusterName}:${binding.namespace}/${binding.apiDeployment}`,
    `DEPLOYMENT_UID=${binding.apiDeploymentUid}`,
    `REPLICAS=${workload.desiredReplicas}`,
    `API_PODS=${workload.pods.length}`,
    `FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=${workload.foreignNamespaceDbWriterCandidates}`,
    `NAMESPACE_INVENTAR_SHA256=${workload.namespaceInventoryFingerprint}`,
    "NACHWEIS_GRENZE=konfiguriertes-namespace-und-api-deployment",
    "NICHT_ERFASST=externe-db-clients-und-andere-namespaces",
    "EXTERNER_GLOBALER_WRITER_NACHWEIS=separat-erforderlich",
    `IMAGE=${binding.apiImage}`,
    `IMAGE_ID=${binding.apiImageId}`,
    `STATUSDATEI_PHASE=${statePhase}`,
    `OPERATOR_REVISION=${binding.operatorRevision}`
  ].join("\n") + "\n");
}

function status(config, binaries, repository) {
  const context = operationContext(config, binaries, repository);
  if (isStableRunning(context.workload, config)) {
    if (context.state && !["unfreeze-pending", "unfrozen"].includes(context.state.value.phase)) {
      fail("API laeuft, aber die geschuetzte Statusdatei behauptet weiterhin einen aktiven Freeze.");
    }
    outputTarget("status", "running", context.binding, context.workload, context.state?.value.phase || "absent");
    return;
  }
  if (isStableFrozen(context.workload)) {
    if (!context.state || !["freeze-pending", "frozen"].includes(context.state.value.phase)) {
      fail("API ist auf 0 skaliert, aber ein belastbarer Rollback-Nachweis fehlt.");
    }
    outputTarget("status", "frozen", context.binding, context.workload, context.state.value.phase);
    return;
  }
  fail("API-Deployment befindet sich weder im bestaetigten Running- noch im bestaetigten Frozen-Zustand.");
}

function preview(action, config, binaries, repository) {
  const context = operationContext(config, binaries, repository);
  if (action === "freeze") {
    if (!isStableRunning(context.workload, config)) {
      fail("Freeze-Vorschau erfordert die vollstaendig bereite konfigurierte Replica-Zahl und exakte ImageID.");
    }
    if (context.state && context.state.value.phase !== "freeze-pending") {
      fail("Freeze-Vorschau erfordert eine neue STATE_FILE oder einen exakt wiederaufnehmbaren Freeze-Pending-Zustand.");
    }
  } else if (action === "unfreeze") {
    if (!context.state || !["freeze-pending", "frozen", "unfreeze-pending"].includes(context.state.value.phase)) {
      fail("Unfreeze-Vorschau erfordert einen gesicherten aktiven Freeze-Zustand.");
    }
    if (!isStableFrozen(context.workload)) fail("Unfreeze-Vorschau erfordert 0 Deployment-Replikas und 0 API-Pods.");
  } else {
    if (!context.state || !["freeze-pending", "unfrozen"].includes(context.state.value.phase)) {
      fail("Close-Vorschau erfordert einen abgeschlossenen Unfrozen- oder abgebrochenen Freeze-Pending-Zustand.");
    }
    if (!isStableRunning(context.workload, config)) {
      fail("Close-Vorschau erfordert die urspruengliche Replica-Zahl und exakte ImageID.");
    }
  }
  const token = confirmation(
    action,
    context.binding,
    context.workload,
    action === "freeze" ? null : context.state
  );
  if (action === "freeze" && context.state && (
    context.state.value.pre_freeze_confirmation !== token
    || context.state.value.pre_freeze_deployment_resource_version !== context.workload.deploymentResourceVersion
    || context.state.value.pre_freeze_deployment_generation !== context.workload.deploymentGeneration
  )) fail("Freeze-Pending-Zustand kann wegen eines abweichenden Deployment-Readbacks nicht sicher wiederaufgenommen werden.");
  outputTarget(action, "preview", context.binding, context.workload, context.state?.value.phase || "absent");
  process.stdout.write(`BESTAETIGUNG=${token}\n`);
  if (action === "close") process.stdout.write(`ARCHIV_ZIEL=${closedStatePath(config.stateFile, context.state.fingerprint)}\n`);
  return { ...context, token };
}

function closedStatePath(stateFile, stateFingerprint) {
  return `${stateFile}.closed-${stateFingerprint}`;
}

function scale(config, binaries, workload, replicas) {
  runCommand(
    binaries.kubectl,
    [
      ...kubectlBase(config),
      "scale", "deployment", config.apiDeployment,
      `--replicas=${replicas}`,
      `--current-replicas=${workload.desiredReplicas}`,
      `--resource-version=${workload.deploymentResourceVersion}`
    ],
    `API-Deployment-Scale-auf-${replicas}`
  );
}

function waitFor(config, binaries, predicate, label) {
  const deadline = Date.now() + config.readbackTimeoutSeconds * 1000;
  while (true) {
    const workload = readWorkload(config, binaries);
    if (predicate(workload)) return workload;
    if (Date.now() >= deadline) fail(`${label} wurde nicht innerhalb des bestaetigten Zeitfensters erreicht.`);
    const remaining = deadline - Date.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(2_000, remaining));
  }
}

function initialFreezeState(binding, workload, token) {
  return {
    api_image: binding.apiImage,
    api_image_id: binding.apiImageId,
    api_pod_selector: binding.apiPodSelector,
    binding_fingerprint: binding.bindingFingerprint,
    deployment: binding.apiDeployment,
    deployment_uid: binding.apiDeploymentUid,
    format_version: 1,
    freeze_started_at: new Date().toISOString(),
    frozen_at: "",
    frozen_deployment_generation: 0,
    frozen_deployment_resource_version: "",
    gcp_project_id: binding.gcpProjectId,
    gke_cluster_name: binding.clusterName,
    gke_location: binding.location,
    namespace: binding.namespace,
    namespace_uid: binding.namespaceUid,
    operator_revision: binding.operatorRevision,
    original_replicas: binding.originalReplicas,
    phase: "freeze-pending",
    pre_freeze_confirmation: token,
    pre_freeze_deployment_generation: workload.deploymentGeneration,
    pre_freeze_deployment_resource_version: workload.deploymentResourceVersion,
    unfreeze_started_at: "",
    unfrozen_at: "",
    unfrozen_deployment_generation: 0,
    unfrozen_deployment_resource_version: ""
  };
}

function applyFreeze(config, binaries, repository, suppliedConfirmation) {
  return withApplyLock(config, () => {
    const context = preview("freeze", config, binaries, repository);
    if (suppliedConfirmation !== context.token) fail("Freeze-Bestaetigung ist veraltet oder gehoert nicht zum aktuellen Zielzustand.");
    if (!context.state) {
      createStateFile(config.stateFile, initialFreezeState(context.binding, context.workload, context.token));
    }
    scale(config, binaries, context.workload, 0);
    const frozenWorkload = waitFor(config, binaries, isStableFrozen, "Frozen-Readback mit 0 API-Pods");
    const pendingState = readState(config, context.binding, { required: true });
    const frozenState = {
      ...pendingState.value,
      phase: "frozen",
      frozen_at: new Date().toISOString(),
      frozen_deployment_generation: frozenWorkload.deploymentGeneration,
      frozen_deployment_resource_version: frozenWorkload.deploymentResourceVersion
    };
    replaceStateFile(config.stateFile, pendingState.fingerprint, frozenState);
    outputTarget("freeze", "applied-readback-frozen", context.binding, frozenWorkload, "frozen");
  });
}

function applyUnfreeze(config, binaries, repository, suppliedConfirmation) {
  return withApplyLock(config, () => {
    const context = preview("unfreeze", config, binaries, repository);
    if (suppliedConfirmation !== context.token) fail("Unfreeze-Bestaetigung ist veraltet oder gehoert nicht zum aktuellen Zielzustand.");
    const completedFreezeEvidence = context.state.value.phase === "freeze-pending"
      ? {
        frozen_at: new Date().toISOString(),
        frozen_deployment_generation: context.workload.deploymentGeneration,
        frozen_deployment_resource_version: context.workload.deploymentResourceVersion
      }
      : {};
    const pendingState = {
      ...context.state.value,
      ...completedFreezeEvidence,
      phase: "unfreeze-pending",
      unfreeze_started_at: new Date().toISOString()
    };
    validateStateObject(pendingState, context.binding);
    replaceStateFile(config.stateFile, context.state.fingerprint, pendingState);
    scale(config, binaries, context.workload, config.originalReplicas);
    const runningWorkload = waitFor(
      config,
      binaries,
      (workload) => isStableRunning(workload, config),
      "Unfreeze-Readback mit urspruenglicher Replica-Zahl und exakter ImageID"
    );
    const currentState = readState(config, context.binding, { required: true });
    const unfrozenState = {
      ...currentState.value,
      phase: "unfrozen",
      unfrozen_at: new Date().toISOString(),
      unfrozen_deployment_generation: runningWorkload.deploymentGeneration,
      unfrozen_deployment_resource_version: runningWorkload.deploymentResourceVersion
    };
    replaceStateFile(config.stateFile, currentState.fingerprint, unfrozenState);
    outputTarget("unfreeze", "applied-readback-running", context.binding, runningWorkload, "unfrozen");
  });
}

function readback(action, config, binaries, repository) {
  return withApplyLock(config, () => {
    const context = operationContext(config, binaries, repository);
    if (!context.state) fail("Readback erfordert die geschuetzte Writer-Freeze-Statusdatei.");
    if (action === "freeze") {
      if (!["freeze-pending", "frozen"].includes(context.state.value.phase) || !isStableFrozen(context.workload)) {
        fail("Freeze-Readback weist nicht 0 Deployment-Replikas und 0 API-Pods nach.");
      }
      if (context.state.value.phase === "freeze-pending") {
        replaceStateFile(config.stateFile, context.state.fingerprint, {
          ...context.state.value,
          phase: "frozen",
          frozen_at: new Date().toISOString(),
          frozen_deployment_generation: context.workload.deploymentGeneration,
          frozen_deployment_resource_version: context.workload.deploymentResourceVersion
        });
      }
      outputTarget("freeze", "readback-frozen", context.binding, context.workload, "frozen");
      return;
    }
    if (!["unfreeze-pending", "unfrozen"].includes(context.state.value.phase) || !isStableRunning(context.workload, config)) {
      fail("Unfreeze-Readback weist nicht die urspruengliche Replica-Zahl und exakte ImageID nach.");
    }
    if (context.state.value.phase === "unfreeze-pending") {
      replaceStateFile(config.stateFile, context.state.fingerprint, {
        ...context.state.value,
        phase: "unfrozen",
        unfrozen_at: new Date().toISOString(),
        unfrozen_deployment_generation: context.workload.deploymentGeneration,
        unfrozen_deployment_resource_version: context.workload.deploymentResourceVersion
      });
    }
    outputTarget("unfreeze", "readback-running", context.binding, context.workload, "unfrozen");
  });
}

function closeCycle(config, binaries, repository, suppliedConfirmation) {
  return withApplyLock(config, () => {
    const context = preview("close", config, binaries, repository);
    if (suppliedConfirmation !== context.token) {
      fail("Close-Bestaetigung ist veraltet oder gehoert nicht zum aktuellen Zielzustand.");
    }
    const archiveFile = closedStatePath(config.stateFile, context.state.fingerprint);
    if (statePathStatus(archiveFile) === "present") {
      assertProtectedFile(archiveFile, "Writer-Freeze-Archivdatei");
      if (sha256(readFileSync(archiveFile)) !== context.state.fingerprint) {
        fail("Vorhandene Writer-Freeze-Archivdatei stimmt nicht mit dem gebundenen Abschlusszustand ueberein.");
      }
    } else if (statePathStatus(archiveFile) === "invalid") {
      fail("Writer-Freeze-Archivziel ist ein Symlink oder ein ungueltiger Dateityp.");
    } else {
      try {
        linkSync(config.stateFile, archiveFile);
        fsyncParentDirectory(archiveFile);
      } catch {
        fail("Writer-Freeze-Abschlusszustand konnte nicht atomar und ohne Ueberschreiben archiviert werden.");
      }
      assertProtectedFile(archiveFile, "Writer-Freeze-Archivdatei");
      if (sha256(readFileSync(archiveFile)) !== context.state.fingerprint) {
        fail("Neu angelegte Writer-Freeze-Archivdatei stimmt nicht mit dem gebundenen Abschlusszustand ueberein.");
      }
    }
    try {
      unlinkSync(config.stateFile);
      fsyncParentDirectory(config.stateFile);
    } catch {
      fail("Abschlusszustand ist archiviert, aber STATE_FILE konnte nicht fuer einen neuen Zyklus freigegeben werden.");
    }
    const closePhase = context.state.value.phase === "unfrozen"
      ? "archived-new-cycle-ready"
      : "archived-aborted-freeze-new-cycle-ready";
    outputTarget("close", closePhase, context.binding, context.workload, "archived");
    process.stdout.write(`ARCHIV=${archiveFile}\n`);
  });
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const binaries = {
    gcloud: resolveExecutable("gcloud"),
    git: resolveExecutable("git"),
    kubectl: resolveExecutable("kubectl")
  };
  const repository = establishRepository(binaries.git);
  const configPath = options.configPath;
  if (!path.isAbsolute(configPath)) fail("--config muss ein absoluter Pfad sein.");
  const config = parseConfigFile(configPath, repository.projectRoot);
  if (options.action === "status") {
    status(config, binaries, repository);
    return;
  }
  if (options.readback) {
    readback(options.action, config, binaries, repository);
    return;
  }
  if (!options.apply) {
    preview(options.action, config, binaries, repository);
    return;
  }
  if (options.action === "freeze") {
    applyFreeze(config, binaries, repository, options.confirm);
  } else if (options.action === "unfreeze") {
    applyUnfreeze(config, binaries, repository, options.confirm);
  } else {
    closeCycle(config, binaries, repository, options.confirm);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof FreezeOperatorError ? error.message : "Unerwarteter Operatorfehler; Zielzustand bleibt unbestaetigt.";
  process.stderr.write(`FEHLER: ${message}\n`);
  process.exitCode = 1;
}
