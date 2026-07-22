import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "frontend/app/versorgungs-kompass.html");
const shellSourcePath = resolve(root, "frontend/app/hospitation/index.html");
const localDir = resolve(root, "frontend/local-hospitation");
const privateDataPath = resolve(localDir, "hospitation-private-data.js");
const adapterPath = resolve(localDir, "hospitation-local-adapter.js");
const outputPath = resolve(localDir, "versorgungs-kompass.local.html");
const shellOutputPath = resolve(localDir, "index.html");
const runtimePath = resolve(localDir, "hospitation-local-runtime.js");
const stagingToolsPath = resolve(localDir, "hospitation-staging-tools.js");

await Promise.all([access(privateDataPath), access(adapterPath)]);

function replaceOnce(source, marker, replacement, label) {
  const first = source.indexOf(marker);
  const second = first < 0 ? -1 : source.indexOf(marker, first + marker.length);
  if (first < 0 || second >= 0) {
    throw new Error(`${label}: erwartete genau einen Marker.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + marker.length);
}

let html = await readFile(sourcePath, "utf8");
html = replaceOnce(html, "<head>", '<head>\n    <base href="../app/" />', "head");

const sharedBootstrap = [
  '    <script src="../data/runtime-config.js"></script>',
  '    <script src="../login/auth-config.js"></script>',
  '    <script src="../login/auth-guard.js"></script>'
].join("\n");

html = replaceOnce(
  html,
  sharedBootstrap,
  '    <script src="../local-hospitation/hospitation-local-runtime.js"></script>',
  "runtime/auth bootstrap"
);

const serviceMarker = '    <script src="../data/data-service.js"></script>';
html = replaceOnce(html, serviceMarker, [
  serviceMarker,
  '    <script src="../local-hospitation/hospitation-private-data.js"></script>',
  '    <script src="../local-hospitation/hospitation-local-adapter.js"></script>',
  '    <script src="../local-hospitation/hospitation-staging-tools.js"></script>'
].join("\n"), "data-service");

const runtime = `(function () {
  "use strict";
  window.VERSORGUNGS_COMPASS_CONFIG = {
    dataMode: "local",
    authMode: "local-only",
    apiBaseUrl: "",
    apiCredentials: "same-origin",
    requireApiGateway: false,
    capabilities: {
      contactRole: true,
      contactConsent: true,
      organizationPrimarySystems: true,
      registrationIntake: true,
      contactImageSources: true,
      organizationAssets: false,
      expertOrganizationAssets: false,
      stakeholderOrganizationAssets: true
    }
  };
  const currentUrl = () => window.location.href;
  window.VKAuth = {
    isAuthenticated: () => true,
    setAuthenticated: function () {},
    clearAuthenticated: function () {},
    buildLoginUrl: currentUrl,
    buildLogoutUrl: currentUrl,
    getDefaultUrl: currentUrl
  };
})();
`;

const stagingTools = `(function () {
  "use strict";

  const store = window.LocalHospitationStore;
  if (!store || typeof store.snapshot !== "function") return;

  const OWNER_REF = "timo-frank";
  const ORGANIZATION_FIELDS = [
    "id", "name", "sector", "organizationType", "postalCode", "city", "state",
    "website", "phone", "email", "notes", "source", "status"
  ];
  const CONTACT_FIELDS = [
    "id", "name", "organizationId", "organization", "sector", "specialty",
    "contactRole", "priority", "postalCode", "city", "state", "email", "phone",
    "linkedin", "topics", "notes", "source", "status"
  ];
  const HOSPITATION_FIELDS = [
    "id", "contactId", "contactName", "organizationId", "organizationName", "status",
    "startsAt", "endsAt", "location", "city", "state", "sector", "goal", "topics",
    "requestNote", "documentationSummary", "documentationOutcome", "followUpNote",
    "followUpDueAt", "documentedAt"
  ];
  const OBSERVATION_FIELDS = [
    "id", "hospitationId", "sequence", "title", "situation", "situationContext",
    "description", "observed", "observedAt", "immediateConsequence", "processPhase",
    "problemType", "impact", "observationType", "evidenceType", "relevanceScore",
    "usageRecommendation", "nextUse", "involvedRoles", "affectedRoles",
    "affectedProducts", "topics", "themes", "theme", "sourceType", "sourceReference",
    "uncertainty", "limitations", "source", "settingType", "internalUseAllowed",
    "externalUseAllowed", "status", "createdAt", "updatedAt"
  ];

  function pick(record, fields) {
    return Object.fromEntries(fields.filter(function (key) {
      return Object.prototype.hasOwnProperty.call(record || {}, key) && record[key] !== undefined;
    }).map(function (key) { return [key, record[key]]; }));
  }

  function textList(value) {
    if (Array.isArray(value)) return value.map(function (item) { return String(item || "").trim(); }).filter(Boolean);
    return String(value || "").split(/\\s*[;,|]\\s*/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function textSource(value) {
    return Array.isArray(value) ? textList(value).join("; ") : String(value || "").trim();
  }

  function canonicalOrganization(item) {
    const result = pick(item, ORGANIZATION_FIELDS);
    if (!("notes" in result) && item && Object.prototype.hasOwnProperty.call(item, "note")) result.notes = item.note;
    if (!("source" in result) && item && Object.prototype.hasOwnProperty.call(item, "sources")) result.source = textSource(item.sources);
    else if ("source" in result) result.source = textSource(result.source);
    return result;
  }

  function canonicalContact(item) {
    const result = pick(item, CONTACT_FIELDS);
    if (!("sector" in result) && item && Object.prototype.hasOwnProperty.call(item, "category")) result.sector = item.category;
    if (!("topics" in result) && item && (Object.prototype.hasOwnProperty.call(item, "themes") || Object.prototype.hasOwnProperty.call(item, "topics"))) {
      result.topics = textList(item.themes || item.topics);
    } else if ("topics" in result) result.topics = textList(result.topics);
    if (!("notes" in result) && item && Object.prototype.hasOwnProperty.call(item, "note")) result.notes = item.note;
    if (!("source" in result) && item && Object.prototype.hasOwnProperty.call(item, "sources")) result.source = textSource(item.sources);
    else if ("source" in result) result.source = textSource(result.source);
    return result;
  }

  function isActiveObservation(item) {
    const status = String(item && item.status || "").trim().toLowerCase();
    return status !== "archived" && status !== "archiviert";
  }

  function canonicalObservation(item) {
    const result = pick(item, OBSERVATION_FIELDS);
    result.status = String(result.status || "").trim() || "active";
    return result;
  }

  function snapshotEnvelope() {
    const state = store.snapshot();
    const createdAt = new Date().toISOString();
    return {
      schemaVersion: "hospitation-staging/v1",
      snapshot: {
        id: window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "local-" + createdAt.replace(/[^0-9]/g, ""),
        createdAt: createdAt,
        source: "local-hospitation"
      },
      ownerRef: OWNER_REF,
      organizations: (Array.isArray(state.organizations) ? state.organizations : []).map(canonicalOrganization),
      contacts: (Array.isArray(state.contacts) ? state.contacts : []).map(canonicalContact),
      hospitations: (Array.isArray(state.hospitations) ? state.hospitations : []).map(function (item) { return pick(item, HOSPITATION_FIELDS); }),
      observations: (Array.isArray(state.observations) ? state.observations : []).filter(isActiveObservation).map(canonicalObservation)
    };
  }

  store.exportSnapshot = snapshotEnvelope;
  store.downloadSnapshot = function () {
    const envelope = snapshotEnvelope();
    const stamp = envelope.snapshot.createdAt.replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(envelope, null, 2) + "\\n"], {
      type: "application/json;charset=utf-8"
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "hospitation-staging-" + stamp + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(href); }, 0);
    return envelope;
  };

  function installExportControl() {
    if (document.getElementById("local-hospitation-staging-export")) return;
    const control = document.createElement("aside");
    control.id = "local-hospitation-staging-export";
    control.setAttribute("aria-label", "Lokaler Staging-Export");
    control.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:10020;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.16);font:600 13px/1.35 system-ui,sans-serif;color:#334155";
    const status = document.createElement("span");
    status.textContent = "Nur lokal";
    status.style.cssText = "font-weight:500;color:#64748b";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Staging-Snapshot exportieren";
    button.style.cssText = "border:0;border-radius:8px;padding:8px 11px;background:#0f766e;color:#fff;font:inherit;cursor:pointer";
    button.addEventListener("click", function () {
      store.downloadSnapshot();
      status.textContent = "Snapshot gespeichert";
      setTimeout(function () { status.textContent = "Nur lokal"; }, 3500);
    });
    control.append(status, button);
    document.body.append(control);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installExportControl, { once: true });
  else installExportControl();
})();
`;

let localShell = await readFile(shellSourcePath, "utf8");
const shellBootstrap = [
  '    <script src="../../data/runtime-config.js"></script>',
  '    <script src="../../login/auth-config.js"></script>',
  '    <script src="../../login/auth-guard.js"></script>'
].join("\n");
localShell = replaceOnce(localShell, "<title>Hospitations-Dokumentation</title>", "<title>Hospitations-Dokumentation · lokal</title>", "local shell title");
localShell = replaceOnce(localShell, '    <link rel="manifest" href="../../../public/manifest.webmanifest" />\n', "", "local shell manifest");
localShell = replaceOnce(localShell, shellBootstrap, "", "local shell auth bootstrap");
localShell = replaceOnce(
  localShell,
  '    <link rel="stylesheet" href="./hospitation.css" />',
  [
    '    <link rel="stylesheet" href="../app/hospitation/hospitation.css" />',
    '    <link rel="stylesheet" href="./hospitation-local-shell.css" />'
  ].join("\n"),
  "local shell styles"
);
localShell = localShell
  .replaceAll("../../../public/", "../../public/")
  .replaceAll(
    "../versorgungs-kompass.html?standalone=hospitation-documentation#",
    "./versorgungs-kompass.local.html?standalone=hospitation-documentation&amp;localHospitation=1#"
  )
  .replace("<span>Wird geladen...</span>", "<span>Lokale Daten und Modul werden geladen...</span>")
  .replace('    <script src="./hospitation.js"></script>', '    <script src="../app/hospitation/hospitation.js"></script>');

await Promise.all([
  writeFile(outputPath, html, { mode: 0o600 }),
  writeFile(shellOutputPath, localShell, { mode: 0o600 }),
  writeFile(runtimePath, runtime, { mode: 0o600 }),
  writeFile(stagingToolsPath, stagingTools, { mode: 0o600 })
]);

console.log("Lokalen Hospitationseinstieg erzeugt. Direkt im Browser oeffnen: frontend/local-hospitation/index.html");
