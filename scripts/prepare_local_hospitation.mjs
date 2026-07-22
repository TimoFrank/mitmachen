import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "frontend/app/versorgungs-kompass.html");
const localDir = resolve(root, "frontend/local-hospitation");
const privateDataPath = resolve(localDir, "hospitation-private-data.js");
const adapterPath = resolve(localDir, "hospitation-local-adapter.js");
const outputPath = resolve(localDir, "versorgungs-kompass.local.html");
const runtimePath = resolve(localDir, "hospitation-local-runtime.js");

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
  '    <script src="../local-hospitation/hospitation-local-adapter.js"></script>'
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

await Promise.all([
  writeFile(outputPath, html, { mode: 0o600 }),
  writeFile(runtimePath, runtime, { mode: 0o600 })
]);

console.log("Lokalen Hospitationseinstieg erzeugt. Oeffnen: http://127.0.0.1:4173/frontend/local-hospitation/");
