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
  ["press", "/stakeholder/presse"],
  ["stakeholders", "/stakeholder"],
  ["stakeholders/kv", "/stakeholder/kassenaerztliche-vereinigungen"],
  ["stakeholders/krankenkassen", "/stakeholder/krankenkassen"],
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
assert.equal(routes.routeTokenForPath("/onboarding"), "onboarding");

for (const view of ["people", "organizations", "indications"]) {
  assert.equal(
    routes.urlForRouteToken(`patients?view=${view}`),
    `/stakeholder/patienten?view=${view}`,
    `Patientenansicht ${view} bleibt in der kanonischen URL erhalten`
  );
  assert.equal(
    routes.routeTokenForPath("/stakeholder/patienten", `?view=${view}`),
    `patients?view=${view}`,
    `Patientenansicht ${view} bleibt beim Einlesen erhalten`
  );
}
assert.equal(
  routes.urlForRouteToken("stakeholders/patientenverbaende"),
  "/stakeholder/patienten?view=organizations"
);
assert.equal(
  routes.urlForRouteToken("stakeholders/patientenverbaende?view=people"),
  "/stakeholder/patienten?view=organizations"
);
const legacyPatientOrganizationsRoute = routes.pathForRouteToken("stakeholders/patientenverbaende");
assert.equal(legacyPatientOrganizationsRoute.path, "stakeholder/patienten");
assert.equal(legacyPatientOrganizationsRoute.query, "view=organizations");
assert.equal(
  routes.routeTokenForPath("/stakeholder/patientenverbaende"),
  "patients?view=organizations"
);
assert.equal(
  routes.routeTokenForPath("/stakeholder/patientenverbaende/", "?view=people"),
  "patients?view=organizations"
);
assert.equal(
  routes.routes["stakeholders/patientenverbaende"],
  "stakeholder/patienten",
  "Der alte Token verweist im veröffentlichten Routenvertrag auf den kanonischen Pfad"
);
assert.equal(routes.isApplicationPath("/stakeholder/patientenverbaende"), true);

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
  routes.urlForRouteToken("person/politics/demo-politik"),
  "/personen/politik/demo-politik"
);
assert.equal(
  routes.routeTokenForPath("/personen/politik/demo-politik"),
  "person/politics/demo-politik"
);
assert.equal(
  routes.urlForRouteToken("person/press/demo-presse"),
  "/personen/presse/demo-presse"
);
assert.equal(
  routes.routeTokenForPath("/personen/presse/demo-presse"),
  "person/press/demo-presse"
);
assert.equal(
  routes.urlForRouteToken("organization/expert/demo-org"),
  "/organisationen/expertenkreis/demo-org"
);
assert.equal(
  routes.routeTokenForPath("/organisationen/expertenkreis/demo-org"),
  "organization/expert/demo-org"
);
assert.equal(
  routes.urlForRouteToken("organization/press/demo-medium"),
  "/organisationen/presse/demo-medium"
);
assert.equal(
  routes.routeTokenForPath("/organisationen/presse/demo-medium"),
  "organization/press/demo-medium"
);
assert.equal(routes.isApplicationPath("/organisationen/stakeholder/demo-org/nested"), false);
assert.equal(routes.assetUrl("data/runtime-config.js"), "/data/runtime-config.js");

const sourceRoutes = loadRoutes({
  href: "http://127.0.0.1:4173/frontend/app/versorgungs-kompass.html",
  scriptSrc: "http://127.0.0.1:4173/frontend/app/versorgungs-kompass-routes.js",
  cleanUrls: false
});
assert.equal(sourceRoutes.urlForRouteToken("contacts"), "#contacts");
assert.equal(
  sourceRoutes.urlForRouteToken("stakeholders/patientenverbaende"),
  "#patients?view=organizations"
);
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

const topLevelLocationLine = nginxSource
  .split("\n")
  .find((line) => line.includes("(?:start|onboarding|formate|teams)"));
const topLevelLocationPattern = topLevelLocationLine?.trim().match(/^location ~ (.+) \{$/);
assert.ok(topLevelLocationPattern, "Nginx-Vertrag für kanonische Top-Level-Anwendungspfade fehlt.");
const topLevelLocationRegex = new RegExp(topLevelLocationPattern[1]);
assert.ok(topLevelLocationRegex.test("/onboarding"), "/onboarding fehlt im Nginx-Anwendungspfadvertrag");
assert.equal(topLevelLocationRegex.test("/onboarding/details"), false, "Verschachtelte unbekannte Onboarding-Pfade dürfen nicht auf die App-Shell fallen");

const stakeholderLocationPattern = nginxSource.match(/location ~ (\^\/stakeholder[^\n]+) \{/);
assert.ok(stakeholderLocationPattern, "Nginx-Stakeholder-Routenvertrag fehlt.");
const stakeholderLocationRegex = new RegExp(stakeholderLocationPattern[1]);
for (const expectedPath of [...routeMatrix.values()].filter((routePath) => routePath.startsWith("/stakeholder"))) {
  assert.ok(stakeholderLocationRegex.test(expectedPath), `${expectedPath} fehlt im Nginx-Stakeholder-Routenvertrag`);
}
assert.ok(
  stakeholderLocationRegex.test("/stakeholder/patientenverbaende"),
  "Der alte Patientenverbände-Pfad fehlt als App-Shell-Alias im Nginx-Routenvertrag"
);

const personLocationPattern = nginxSource.match(/location ~ (\^\/personen[^\n]+) \{/);
assert.ok(personLocationPattern, "Nginx-Personen-Routenvertrag fehlt.");
const personLocationRegex = new RegExp(personLocationPattern[1]);
assert.ok(
  personLocationRegex.test("/personen/presse/demo-presse"),
  "/personen/presse/:id fehlt im Nginx-Personen-Routenvertrag"
);

const organizationLocationPattern = nginxSource.match(/location ~ (\^\/organisationen[^\n]+) \{/);
assert.ok(organizationLocationPattern, "Nginx-Organisations-Routenvertrag fehlt.");
const organizationLocationRegex = new RegExp(organizationLocationPattern[1]);
assert.ok(
  organizationLocationRegex.test("/organisationen/presse/demo-medium"),
  "/organisationen/presse/:id fehlt im Nginx-Organisations-Routenvertrag"
);

console.log(`Clean URL routes OK: ${routeMatrix.size} statische Routen, Detailpfade, Auth-Allowlist und Nginx-App-Shell-Fallback.`);
