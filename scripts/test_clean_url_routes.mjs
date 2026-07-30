import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const routeSource = fs.readFileSync(path.join(root, "frontend/app/versorgungs-kompass-routes.js"), "utf8");
const nginxSource = fs.readFileSync(
  path.join(root, "deploy/helm/versorgungs-kompass/files/frontend-default.conf"),
  "utf8"
);

function loadRoutes({
  href = "https://versorgungs-kompass.de/start",
  scriptSrc = "https://versorgungs-kompass.de/versorgungs-kompass-routes.js",
  cleanUrls = true
} = {}) {
  const location = new URL(href);
  const window = {
    location,
    VERSORGUNGS_COMPASS_CONFIG: { cleanUrls }
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    document: {
      currentScript: { src: scriptSrc }
    },
    window
  });
  vm.runInContext(routeSource, context, { filename: "versorgungs-kompass-routes.js" });
  return window.VKAppRoutes;
}

const routes = loadRoutes();
const routeMatrix = new Map([
  ["home", "/start"],
  ["map", "/versorgung/karte"],
  ["contacts", "/versorgung/kontakte"],
  ["organizations", "/versorgung/organisationen"],
  ["analytics", "/versorgung/auswertung"],
  ["quality", "/versorgung/datenqualitaet"],
  ["activities", "/versorgung/aktivitaeten"],
  ["patients", "/stakeholder/patienten"],
  ["politics", "/stakeholder/politik"],
  ["stakeholders", "/stakeholder"],
  ["stakeholders/kv", "/stakeholder/kassenaerztliche-vereinigungen"],
  ["stakeholders/krankenkassen", "/stakeholder/krankenkassen"],
  ["stakeholders/patientenverbaende", "/stakeholder/patientenverbaende"],
  ["stakeholders/krankenhausgesellschaften", "/stakeholder/krankenhausgesellschaften"],
  ["stakeholders/aerztliche-berufsverbaende", "/stakeholder/aerztliche-berufsverbaende"],
  ["experts", "/stakeholder/expertenkreis"],
  ["framework", "/hospitationen/framework"],
  ["hospitations", "/hospitationen"],
  ["hospitations:observations", "/hospitationen/beobachtungen"],
  ["hospitations:patterns", "/hospitationen/muster"],
  ["hospitations:dashboard", "/hospitationen/dashboard"],
  ["questionnaire", "/hospitationen/fragebogen"],
  ["formats", "/formate"],
  ["team", "/teams"],
  ["profile", "/profil"],
  ["profile-notifications", "/profil/benachrichtigungen"],
  ["profile-settings", "/profil/einstellungen"],
  ["profile-changelog", "/profil/aenderungen"],
  ["profile-about", "/profil/ueber-die-app"],
  ["onboarding", "/onboarding"]
]);

for (const [routeToken, expectedPath] of routeMatrix) {
  assert.equal(routes.urlForRouteToken(routeToken), expectedPath, `${routeToken} hat nicht den kanonischen Pfad`);
  assert.ok(routes.routeTokenForPath(expectedPath), `${expectedPath} wird nicht als Anwendungspfad erkannt`);
  assert.ok(routes.isApplicationPath(expectedPath), `${expectedPath} fehlt in der Auth-Allowlist`);
}

assert.equal(
  routes.urlForRouteToken("profile-imports:onlineEntry"),
  "/profil/importe/online-erfassung"
);
assert.equal(
  routes.routeTokenForPath("/profil/importe/online-erfassung/"),
  "profile-imports:onlineEntry"
);
assert.equal(
  routes.urlForRouteToken("person/contact/demo-1?tab=notes&note=n-2"),
  "/personen/versorgung/demo-1?tab=notes&note=n-2"
);
assert.equal(
  routes.routeTokenForPath("/personen/versorgung/demo-1", "?tab=notes&note=n-2"),
  "person/contact/demo-1?tab=notes&note=n-2"
);
assert.equal(
  routes.urlForRouteToken("person/patient/demo-patient"),
  "/personen/patienten/demo-patient"
);
assert.equal(
  routes.routeTokenForPath("/personen/patienten/demo-patient"),
  "person/patient/demo-patient"
);
assert.equal(
  routes.urlForRouteToken("organization/expert/demo-org"),
  "/organisationen/expertenkreis/demo-org"
);
assert.equal(
  routes.routeTokenForPath("/organisationen/expertenkreis/demo-org"),
  "organization/expert/demo-org"
);
assert.equal(routes.isApplicationPath("/organisationen/stakeholder/demo-org/nested"), false);
assert.equal(routes.assetUrl("data/runtime-config.js"), "/data/runtime-config.js");

const sourceRoutes = loadRoutes({
  href: "http://127.0.0.1:4173/frontend/app/versorgungs-kompass.html",
  scriptSrc: "http://127.0.0.1:4173/frontend/app/versorgungs-kompass-routes.js",
  cleanUrls: false
});
assert.equal(sourceRoutes.urlForRouteToken("contacts"), "#contacts");
assert.equal(sourceRoutes.assetUrl("../vendor/xlsx/xlsx.bundle.js"), "/frontend/vendor/xlsx/xlsx.bundle.js");

const standaloneRoutes = loadRoutes({
  href: "https://versorgungs-kompass.de/versorgungs-kompass.html?standalone=hospitation-documentation"
});
assert.equal(standaloneRoutes.cleanUrlsEnabled(), false);
assert.equal(standaloneRoutes.urlForRouteToken("hospitations:observations"), "#hospitations:observations");

const unrelatedStandaloneQueryRoutes = loadRoutes({
  href: "https://versorgungs-kompass.de/versorgung/karte?standalone=invalid"
});
assert.equal(unrelatedStandaloneQueryRoutes.cleanUrlsEnabled(), true);
assert.equal(unrelatedStandaloneQueryRoutes.urlForRouteToken("map"), "/versorgung/karte");

for (const expectedNginxContract of [
  "try_files /versorgungs-kompass.html =404;",
  "try_files $uri $uri/ =404;",
  "^/versorgung/",
  "^/stakeholder",
  "^/hospitationen",
  "^/profil",
  "^/personen/",
  "^/organisationen/"
]) {
  assert.ok(nginxSource.includes(expectedNginxContract), `Nginx-Routenvertrag fehlt: ${expectedNginxContract}`);
}

const stakeholderLocationPattern = nginxSource.match(/location ~ (\^\/stakeholder[^\n]+) \{/);
assert.ok(stakeholderLocationPattern, "Nginx-Stakeholder-Routenvertrag fehlt.");
const stakeholderLocationRegex = new RegExp(stakeholderLocationPattern[1]);
for (const expectedPath of [...routeMatrix.values()].filter((routePath) => routePath.startsWith("/stakeholder"))) {
  assert.ok(stakeholderLocationRegex.test(expectedPath), `${expectedPath} fehlt im Nginx-Stakeholder-Routenvertrag`);
}

console.log(`Clean URL routes OK: ${routeMatrix.size} statische Routen, Detailpfade, Auth-Allowlist und Nginx-App-Shell-Fallback.`);
