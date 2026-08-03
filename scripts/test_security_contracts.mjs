import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSensitiveQueryPermission,
  policyForRequest,
  roleRank,
  validateAllowedOriginConfiguration,
  validateIdentityConfiguration
} from "../api/security-policy.mjs";

const projectRoot = new URL("../", import.meta.url);
const projectPath = fileURLToPath(projectRoot);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, projectRoot), "utf8");
const ignoredWalkDirectories = new Set(["node_modules"]);
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.isDirectory() && ignoredWalkDirectories.has(entry.name)) return [];
  const fullPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(fullPath) : entry.isFile() ? [fullPath] : [];
});
const apiSource = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const targetSchema = read("deploy/postgres/pre-gematik/schema.sql");
const targetGrants = read("deploy/postgres/pre-gematik/grants.sql");
const targetRuntimeRole = read("deploy/postgres/pre-gematik/runtime-role.sql");
const targetActivityGrantMigration = read(
  "deploy/postgres/pre-gematik/migrations/202607310001_restrict_activity_event_runtime_grants.sql"
);

assert.equal(roleRank("viewer"), 1);
assert.equal(roleRank("editor"), 2);
assert.equal(roleRank("admin"), 3);
assert.equal(roleRank("unknown"), 0);

for (const [method, pathname, expectedRole, expectedId] of [
  ["GET", "/healthz", "public", "health"],
  ["GET", "/api/contacts", "viewer", "collection.read"],
  ["GET", "/api/activities/summary", "viewer", "activity.summary.read"],
  ["GET", "/api/politics/health-committee", "viewer", "politics.health-committee.read"],
  ["POST", "/api/connectors/typo3/mitmachen-registrations", "public", "connector.typo3.registration.create"],
  ["POST", "/api/contacts", "editor", "test-object.create"],
  ["GET", "/api/export", "admin", "data.export"],
  ["POST", "/api/stakeholder-import", "admin", "bulk.import"],
  ["DELETE", "/api/activities", "viewer", "activity.direct-write-denied"],
  ["OPTIONS", "/api/any-path", "public", "cors.preflight"]
]) {
  const policy = policyForRequest(method, pathname);
  assert.equal(policy?.role, expectedRole, `${method} ${pathname} muss die erwartete Rollenpolicy nutzen.`);
  assert.equal(policy?.id, expectedId, `${method} ${pathname} muss eine nachvollziehbare Policy-ID besitzen.`);
}
assert.equal(policyForRequest("POST", "/api/export"), null, "Nicht freigegebene Methoden muessen fail-closed bleiben.");
assert.equal(policyForRequest("POST", "/api/activities/summary"), null, "Der Aktivitaetszaehler muss strikt read-only bleiben.");
assert.equal(
  policyForRequest("GET", "/api/connectors/typo3/mitmachen-registrations"),
  null,
  "Der TYPO3-Connector darf ausschliesslich den exakten POST-Endpunkt verwenden."
);
assert.equal(policyForRequest("GET", "/api/unbekannt"), null, "Neue Routen muessen bis zur Policy-Entscheidung gesperrt bleiben.");

for (const [method, pathname, expectedRole] of [
  ["GET", "/api/auth/bootstrap", "public"],
  ["GET", "/api/session", "viewer"],
  ["GET", "/api/ops/summary", "admin"],
  ["GET", "/api/ops/checks", "admin"],
  ["GET", "/api/export", "admin"],
  ["GET", "/api/contact-content-search", "viewer"],
  ["GET", "/api/activities/summary", "viewer"],
  ["GET", "/api/contact-notes", "viewer"],
  ["GET", "/api/contact-note-attachments", "viewer"],
  ["GET", "/api/politics/health-committee", "viewer"],
  ["POST", "/api/connectors/typo3/mitmachen-registrations", "public"],
  ["GET", "/api/contact-note-attachments/attachment-1/content", "viewer"],
  ["GET", "/api/organizations/organization-1", "viewer"],
  ["GET", "/api/formats/format-1", "viewer"],
  ["GET", "/api/hospitations/hospitation-1", "viewer"],
  ["GET", "/api/contacts/contact-1/history", "viewer"],
  ["GET", "/api/profile-avatar/profile-1", "viewer"],
  ["GET", "/api/contact-images/contact-1", "viewer"],
  ["GET", "/api/stakeholder-logos/stakeholder-1", "viewer"],
  ["PATCH", "/api/profile", "viewer"],
  ["POST", "/api/profile/avatar", "viewer"],
  ["DELETE", "/api/profile/avatar", "viewer"],
  ["POST", "/api/saved-views", "viewer"],
  ["PATCH", "/api/saved-views/view-1", "viewer"],
  ["DELETE", "/api/saved-views/view-1", "viewer"],
  ["PUT", "/api/user-settings", "viewer"],
  ["PATCH", "/api/notifications/read", "viewer"],
  ["PATCH", "/api/notifications/event-1/read", "viewer"],
  ["POST", "/api/contacts", "editor"],
  ["PATCH", "/api/contacts/contact-1", "editor"],
  ["POST", "/api/organizations", "editor"],
  ["PATCH", "/api/organizations/organization-1", "editor"],
  ["POST", "/api/contact-notes", "editor"],
  ["PATCH", "/api/contact-notes/note-1", "editor"],
  ["DELETE", "/api/contact-notes/note-1", "editor"],
  ["POST", "/api/contact-note-attachments", "editor"],
  ["DELETE", "/api/contact-note-attachments/attachment-1", "editor"],
  ["POST", "/api/contacts/contact-1/image", "editor"],
  ["DELETE", "/api/contacts/contact-1/image", "editor"],
  ["PUT", "/api/hospitations/hospitation-1/observations/sync", "editor"],
  ["PUT", "/api/hospitations/hospitation-1/roadmap-assessments", "editor"],
  ["PUT", "/api/hospitations/hospitation-1/unmet-needs", "editor"],
  ["POST", "/api/formats/format-1/participants", "editor"],
  ["PATCH", "/api/formats/format-1/participants/contact-1", "editor"],
  ["DELETE", "/api/formats/format-1/participants/contact-1", "editor"],
  ["POST", "/api/stakeholder-import", "admin"],
  ["POST", "/api/formats/format-1/participants/import", "admin"],
  ["DELETE", "/api/organization-primary-systems/system-1", "admin"],
  ["DELETE", "/api/expert-entity-links/link-1", "admin"],
  ["DELETE", "/api/hospitation-slots/slot-1", "admin"],
  ["DELETE", "/api/hospitations/hospitation-1", "admin"],
  ["DELETE", "/api/formats/format-1", "admin"]
]) {
  assert.equal(policyForRequest(method, pathname)?.role, expectedRole, `${method} ${pathname}: Rollenmatrix weicht ab.`);
}

const validOidc = {
  NODE_ENV: "production",
  API_AUTH_MODE: "oidc",
  OIDC_ISSUER: "https://identity.example.test/issuer",
  OIDC_AUDIENCE: "versorgungs-kompass",
  OIDC_JWKS_URL: "https://identity.example.test/.well-known/jwks.json"
};
assert.equal(validateIdentityConfiguration(validOidc).mode, "oidc");
const validIap = {
  NODE_ENV: "production",
  API_AUTH_MODE: "iap",
  IAP_JWT_AUDIENCE: "/projects/123/global/backendServices/456"
};
assert.equal(validateIdentityConfiguration(validIap).mode, "iap");
assert.equal(
  validateIdentityConfiguration({ API_AUTH_MODE: "trusted-header" }).mode,
  "trusted-header",
  "Der explizite lokale Adapter darf ausserhalb der Produktion fuer Entwicklung erhalten bleiben."
);

assert.throws(() => validateIdentityConfiguration({}), /API_AUTH_MODE/);
assert.throws(
  () => validateIdentityConfiguration({ NODE_ENV: "production", API_AUTH_MODE: "trusted-header" }),
  /Unsignierte Identity-Header/
);
assert.throws(
  () => validateIdentityConfiguration({ ...validOidc, API_AUTH_ALLOW_DEV_PROFILE: "1" }),
  /Entwicklungs-Authentifizierung/
);
assert.throws(
  () => validateIdentityConfiguration({ NODE_ENV: "production", API_AUTH_MODE: "iap" }),
  /IAP_JWT_AUDIENCE/
);
assert.throws(
  () => validateIdentityConfiguration({ ...validOidc, OIDC_AUDIENCE: "" }),
  /OIDC_ISSUER, OIDC_AUDIENCE und OIDC_JWKS_URL/
);
assert.throws(
  () => validateIdentityConfiguration({ ...validOidc, OIDC_ISSUER: "http://identity.example.test" }),
  /HTTPS-URL/
);
assert.throws(
  () => validateIdentityConfiguration({ ...validOidc, OIDC_JWKS_URL: "https://user:secret@identity.example.test/jwks" }),
  /HTTPS-URL/
);
assert.throws(
  () => validateIdentityConfiguration({ ...validOidc, OIDC_JWKS_URL: "https://identity.example.test/jwks#key" }),
  /HTTPS-URL/
);

assert.equal(
  validateAllowedOriginConfiguration({ NODE_ENV: "production", ALLOWED_ORIGIN: "https://crm.example.test/" }),
  "https://crm.example.test"
);
assert.equal(validateAllowedOriginConfiguration({ ALLOWED_ORIGIN: "http://127.0.0.1:4173" }), "http://127.0.0.1:4173");
assert.throws(() => validateAllowedOriginConfiguration({ NODE_ENV: "production" }), /ALLOWED_ORIGIN/);
assert.throws(
  () => validateAllowedOriginConfiguration({ NODE_ENV: "production", ALLOWED_ORIGIN: "http://crm.example.test" }),
  /HTTPS/
);
assert.throws(
  () => validateAllowedOriginConfiguration({ NODE_ENV: "production", ALLOWED_ORIGIN: "https://crm.example.test/app" }),
  /exakter HTTP\(S\)-Origin/
);

for (const flag of ["includeArchived", "includeInactive"]) {
  const restrictedQuery = new URLSearchParams({ [flag]: "true" });
  assert.throws(
    () => assertSensitiveQueryPermission({ role: "viewer" }, restrictedQuery),
    (error) => error?.status === 403,
    `${flag} muss fuer Nicht-Admins serverseitig gesperrt sein.`
  );
  assert.doesNotThrow(() => assertSensitiveQueryPermission({ role: "admin" }, restrictedQuery));
}
assert.doesNotThrow(() => assertSensitiveQueryPermission({ role: "viewer" }, new URLSearchParams()));

for (const contract of [
  "if (API_AUTH_MODE !== \"iap\") return null;",
  "if (API_AUTH_MODE !== \"oidc\") return null;",
  "![\"ES256\", \"RS256\", \"PS256\"].includes(header.alg)",
  "issuer !== OIDC_ISSUER || !jwtAudienceMatches(payload.aud, OIDC_AUDIENCE)",
  "payload.nbf != null",
  "assertAllowedBrowserOrigin(request);",
  "enforceRequestRateLimit(request, url);",
  "REQUEST_BODY_LIMIT_BYTES",
  "ATTACHMENT_UPLOAD_MODE === \"disabled\"",
  "mimeType !== \"text/plain\"",
  "\"content-security-policy\": \"default-src 'none'; sandbox\"",
  "server.headersTimeout",
  "server.requestTimeout"
]) {
  assert.ok(apiSource.includes(contract), `API-Sicherheitsvertrag fehlt: ${contract}`);
}
assert.match(
  apiSource,
  /select access_scope, scope_ref from public\.identity_bindings limit 0/,
  "Readiness muss den Scope-Vertrag der signierten Identity-Bindungstabelle pruefen."
);

for (const contract of [
  "from public.identity_bindings binding",
  "where binding.issuer = $1",
  "and binding.subject = $2",
  "and binding.active = true",
  "and p.active = true",
  "requireSingleActiveIdentityProfile(rows)",
  "const issuer = String(payload.iss || \"\");"
]) {
  assert.ok(apiSource.includes(contract), `Signierter Identity-Bindungsvertrag fehlt: ${contract}`);
}

for (const contract of [
  "await withDomainTransaction(async (transaction) =>",
  "recordActivityEventInternal(transaction, request",
  "if (!row) {\n      throw Object.assign(new Error(\"Kontakt wurde zwischenzeitlich geaendert.",
  "IMAGE_UPLOAD_MODE === \"disabled\"",
  "process.env.NODE_ENV === \"production\" && IMAGE_UPLOAD_MODE !== \"disabled\"",
  "console.log(JSON.stringify({",
  "process.once(\"unhandledRejection\"",
  "process.once(\"uncaughtException\""
]) {
  assert.ok(apiSource.includes(contract), `API-Resilienzvertrag fehlt: ${contract}`);
}
assert.match(
  apiSource,
  /async function readProfileAvatar[\s\S]{0,400}?await authorizeRequest/,
  "Profilbilder duerfen die API-Autorisierung nicht umgehen."
);
assert.match(
  apiSource,
  /async function readContactImage[\s\S]{0,400}?await authorizeRequest/,
  "Kontaktbilder duerfen die API-Autorisierung nicht umgehen."
);
assert.match(
  apiSource,
  /async function readStakeholderLogo[\s\S]{0,400}?await authorizeRequest/,
  "Stakeholder-Logos duerfen die API-Autorisierung nicht umgehen."
);
assert.match(
  apiSource,
  /access-control-allow-headers[\s\S]{0,160}?authorization, content-type, x-request-id/,
  "Browser-CORS darf keine vertrauenswuerdigen Gateway-Identity-Header freigeben."
);
assert.doesNotMatch(
  apiSource,
  /access-control-allow-headers[^\n]*(?:x-goog-authenticated-user|x-auth-request)/i,
  "Gateway-Identity-Header duerfen nicht aus dem Browser akzeptiert werden."
);

const normalizedTargetSchema = targetSchema.toLowerCase().replace(/\s+/g, " ");
const normalizedTargetGrants = targetGrants.toLowerCase().replace(/\s+/g, " ");
const normalizedTargetRuntimeRole = targetRuntimeRole.toLowerCase().replace(/\s+/g, " ");
const normalizedTargetActivityGrantMigration = targetActivityGrantMigration.toLowerCase().replace(/\s+/g, " ");
for (const contract of [
  "revoke create on schema public from public",
  "create role vk_app_runtime nologin",
  "alter role vk_app_runtime nologin",
  "rolcanlogin",
  "rolsuper",
  "rolcreatedb",
  "rolcreaterole",
  "rolreplication",
  "rolbypassrls"
]) {
  assert.ok(normalizedTargetRuntimeRole.includes(contract), `Cloud-SQL-Laufzeitrollenvertrag fehlt: ${contract}`);
}
for (const contract of [
  "revoke create on schema public from :\"runtime_role\"",
  "grant usage on schema public to :\"runtime_role\"",
  "grant select on table public.identity_bindings to :\"runtime_role\"",
  "revoke all privileges on table public.test_access_allowlist from :\"runtime_role\"",
  "grant select (request_id, issuer, subject, verified_email, status, expires_at) on public.identity_enrollment_requests to :\"runtime_role\"",
  "grant insert (issuer, subject, verified_email, expires_at) on public.identity_enrollment_requests to :\"runtime_role\"",
  "grant update (last_seen_at) on public.identity_enrollment_requests to :\"runtime_role\"",
  "revoke all on function public.pre_gematik_prepare_contact_purpose_write() from public",
  "grant execute on function public.pre_gematik_prepare_contact_purpose_write() to :\"runtime_role\"",
  "revoke all on function public.pre_gematik_log_contact_purpose_change() from public",
  "grant execute on function public.pre_gematik_log_contact_purpose_change() to :\"runtime_role\"",
  "revoke all privileges on table public.activity_events from public",
  "revoke all privileges on table public.activity_events from :\"runtime_role\" cascade",
  "grant select, insert on table public.activity_events to :\"runtime_role\"",
  "revoke update, delete on table public.activity_events from :\"runtime_role\"",
  "revoke all privileges on sequence public.activity_events_id_seq from public",
  "revoke all privileges on sequence public.activity_events_id_seq from :\"runtime_role\" cascade"
]) {
  assert.ok(normalizedTargetGrants.includes(contract), `Cloud-SQL-Grant-Vertrag fehlt: ${contract}`);
}
assert.doesNotMatch(
  targetGrants,
  /grant\s+[^;]*(?:update|delete)[^;]*on\s+table[^;]*public\.activity_events[^;]*to\s+:"runtime_role"/i,
  "Die API-Laufzeitrolle darf das append-only Activity-Ledger nicht verändern oder löschen."
);
for (const contract of [
  "current_user = pg_get_userbyid(target.relowner)",
  "from pg_catalog.pg_auth_members membership",
  "activity_events_id_seq grants must be restricted by the sequence owner",
  "revoke all privileges on table public.activity_events from public",
  "revoke all privileges on table public.activity_events from vk_app_runtime cascade",
  "revoke all privileges (%s) on table public.activity_events from vk_app_runtime cascade",
  "revoke all privileges on sequence public.activity_events_id_seq from public",
  "revoke all privileges on sequence public.activity_events_id_seq from vk_app_runtime cascade",
  "membership.admin_option",
  "not membership.inherit_option",
  "vk_app_runtime memberships must be non-admin and inherited",
  "pg_catalog.aclexplode",
  "privilege.grantee = 0",
  "public activity_events table, column, and sequence privileges must be empty",
  "select with grant option",
  "insert with grant option",
  "has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'update')",
  "has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'references')",
  "has_sequence_privilege('vk_app_runtime', 'public.activity_events_id_seq', 'update')",
  "usage with grant option",
  "raise exception 'vk_app_runtime activity_events privileges are not append-only'"
]) {
  assert.ok(
    normalizedTargetActivityGrantMigration.includes(contract),
    `Activity-Grant-Migration muss fail-closed bleiben: ${contract}`
  );
}
for (const unsafeAttribute of [
  "not rolcanlogin",
  "not rolsuper",
  "not rolcreatedb",
  "not rolcreaterole",
  "not rolreplication",
  "not rolbypassrls"
]) {
  assert.ok(
    normalizedTargetActivityGrantMigration.includes(unsafeAttribute),
    `Activity-Grant-Migration prüft Rollenattribut nicht: ${unsafeAttribute}`
  );
}
for (const contract of [
  "create or replace function public.pre_gematik_prepare_contact_purpose_write() returns trigger language plpgsql security invoker",
  "create or replace function public.pre_gematik_log_contact_purpose_change() returns trigger language plpgsql security invoker",
  "create or replace function public.pre_gematik_log_hospitation_observation_change() returns trigger language plpgsql security invoker"
]) {
  assert.ok(normalizedTargetSchema.includes(contract), `Cloud-SQL-Funktionsvertrag fehlt: ${contract}`);
}
assert.doesNotMatch(
  `${targetSchema}\n${targetGrants}\n${targetRuntimeRole}`,
  /\b(?:anon|authenticated|service_role)\b|auth\.uid\s*\(|create\s+policy|row\s+level\s+security/i,
  "Cloud-SQL-Artefakte dürfen keine ausrangierten Supabase-Rollen- oder RLS-Verträge enthalten."
);

const frontendHtmlFiles = walk(path.join(projectPath, "frontend")).filter((file) => file.endsWith(".html"));
for (const file of frontendHtmlFiles) {
  const relative = path.relative(projectPath, file);
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i, `${relative}: Inline-Skript verletzt die produktive CSP.`);
  assert.doesNotMatch(source, /<style\b/i, `${relative}: Inline-Stylesheet verhindert eine nachvollziehbare CSP.`);
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${relative}: Inline-Event-Handler verletzt script-src-attr 'none'.`);
  assert.doesNotMatch(source, /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, `${relative}: Externe Browser-Skripte muessen lokal vendort sein.`);
  assert.doesNotMatch(source, /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["'](?:https?:)?\/\//i, `${relative}: Externe Stylesheets muessen lokal vendort sein.`);
}

const appSource = read("frontend/app/versorgungs-kompass.js");
const mapSource = read("frontend/map/versorgungs-kompass-map.js");
const authSource = [read("frontend/login/auth-guard.js"), read("frontend/login/auth-login.js")].join("\n");
const targetConfigSource = read("scripts/prepare_target_frontend_config.mjs");
const targetPreflightSource = read("scripts/preflight_target_deployment.mjs");
for (const source of [appSource, mapSource]) {
  assert.doesNotMatch(source, /\.postMessage\s*\([^\n]*,\s*["']\*["']\s*\)/, "postMessage darf keine Wildcard-Origin verwenden.");
}
for (const contract of [
  "event.source !== window.parent",
  "event.origin !== window.location.origin",
  "data.version !== MAP_MESSAGE_VERSION",
  "data.channel !== MAP_MESSAGE_CHANNEL",
  "data.contacts.length > 5_000",
  "latitude < -90 || latitude > 90",
  "longitude < -180 || longitude > 180"
]) {
  assert.ok(mapSource.includes(contract), `Karten-Nachrichtenvertrag fehlt: ${contract}`);
}
for (const contract of [
  "event.origin !== window.location.origin",
  "frame?.contentWindow === event.source",
  "if (!sourceFrame) return",
  "message.channel !== expectedChannel",
  "MAP_MESSAGE_VERSION"
]) {
  assert.ok(appSource.includes(contract), `Parent-Frame-Nachrichtenvertrag fehlt: ${contract}`);
}
assert.doesNotMatch(authSource, /passwordHash|crypto\.subtle\.digest|login-with-alias/i, "Browser-Authentifizierung darf keine lokale Passwort-/Alias-Fallbacklogik enthalten.");
assert.match(authSource, /fail-closed/i, "Der unkonfigurierte Browser-Login muss fail-closed beschrieben sein.");
assert.match(targetConfigSource, /allowedAuthModes = new Set\(\["iap", "oidc"\]\)/, "Das Zielartefakt darf nur signierte Identity-Modi akzeptieren.");
assert.doesNotMatch(targetConfigSource, /allowedAuthModes[^\n]*(?:trusted-header|sso)/, "Unsignierte oder unspezifische Identity-Modi sind im Zielartefakt unzulaessig.");
assert.match(targetPreflightSource, /apiOrigin !== frontendOrigin/, "Frontend und API muessen durch den Ziel-Preflight same-origin erzwungen werden.");
assert.doesNotMatch(targetPreflightSource, /AUTH_EMAIL_HEADER/, "Der Ziel-Preflight darf keinen unsignierten Identity-Header verlangen.");

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
for (const [group, dependencies] of Object.entries({
  dependencies: packageJson.dependencies,
  devDependencies: packageJson.devDependencies
})) {
  for (const [name, version] of Object.entries(dependencies || {})) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${group}.${name} muss exakt gepinnt sein.`);
    assert.equal(packageLock.packages[`node_modules/${name}`]?.version, version, `${name} muss mit dem Lockfile uebereinstimmen.`);
    assert.match(packageLock.packages[`node_modules/${name}`]?.integrity || "", /^sha512-/, `${name} benoetigt eine Registry-Integritaetspruefsumme.`);
  }
}
const apiPackageJson = JSON.parse(read("api/package.json"));
assert.deepEqual(Object.keys(apiPackageJson.dependencies || {}), ["pg"], "Das API-Image darf nur erforderliche Runtime-Abhaengigkeiten installieren.");
const apiDockerfile = read("api/Dockerfile");
assert.match(apiDockerfile, /rm -rf[\s\S]*\/usr\/local\/lib\/node_modules\/npm/, "Die unnoetige globale npm-Toolchain darf nicht im API-Runtime-Image verbleiben.");

const browserAssetManifest = JSON.parse(read("frontend/vendor/THIRD_PARTY_ASSETS.json"));
assert.equal(browserAssetManifest.generatedFromLockfile, "package-lock.json");
assert.deepEqual(
  browserAssetManifest.assets.map((asset) => asset.path).sort(),
  [
    "frontend/vendor/leaflet/images/layers-2x.png",
    "frontend/vendor/leaflet/images/layers.png",
    "frontend/vendor/leaflet/images/marker-icon-2x.png",
    "frontend/vendor/leaflet/images/marker-icon.png",
    "frontend/vendor/leaflet/images/marker-shadow.png",
    "frontend/vendor/leaflet/leaflet.css",
    "frontend/vendor/leaflet/leaflet.js",
    "frontend/vendor/mammoth/mammoth.browser.min.js",
    "frontend/vendor/pdfjs/pdf.min.mjs",
    "frontend/vendor/pdfjs/pdf.worker.min.mjs",
    "frontend/vendor/xlsx/xlsx.bundle.js"
  ],
  "Browser-Abhaengigkeiten muessen exakt und ohne ungenutztes Supabase-SDK inventarisiert sein."
);
for (const asset of browserAssetManifest.assets) {
  const bytes = fs.readFileSync(path.join(projectPath, asset.path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, `${asset.path}: Vendor-Hash stimmt nicht.`);
  assert.equal(packageLock.packages[`node_modules/${asset.package}`]?.version, asset.version, `${asset.path}: Vendor-Version stimmt nicht mit dem Lockfile ueberein.`);
}

const valuesSource = read("deploy/helm/versorgungs-kompass/values.yaml");
const configMapSource = read("deploy/helm/versorgungs-kompass/templates/configmap.yaml");
const frontendNginxSource = read("deploy/helm/versorgungs-kompass/files/frontend-default.conf");
const helmSource = [
  valuesSource,
  configMapSource,
  read("deploy/helm/versorgungs-kompass/templates/deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-serviceaccount.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-backendconfig.yaml"),
  read("deploy/helm/versorgungs-kompass/files/frontend-auth-proxy.conf"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-nginx-configmap.yaml"),
  frontendNginxSource,
  read("deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/poddisruptionbudget.yaml")
].join("\n");
assert.match(
  frontendNginxSource,
  /map \$uri \$vk_frame_ancestors[\s\S]*~\^\/versorgungs-kompass\\\.html\$ "'self'";/,
  "Der Hospitations-Wrapper muss die Vollanwendung ausschließlich gleich-originär einbetten dürfen."
);
assert.match(
  frontendNginxSource,
  /map \$uri \$vk_frame_options[\s\S]*~\^\/versorgungs-kompass\\\.html\$ "SAMEORIGIN";/,
  "X-Frame-Options muss die Vollanwendung für den gleich-originären Hospitations-Wrapper freigeben."
);
for (const [contract, message] of [
  [/\bgzip on;/, "Die Frontend-Auslieferung muss gzip aktivieren."],
  [/\bgzip_comp_level 5;/, "Das gzip-Kompressionsniveau muss CPU und Uebertragungsgroesse ausgewogen halten."],
  [/\bgzip_min_length 1024;/, "Kleine Antworten duerfen nicht unnoetig komprimiert werden."],
  [/\bgzip_proxied any;/, "Auch Antworten hinter dem Ingress muessen komprimierbar bleiben."],
  [/\bgzip_vary on;/, "Komprimierte Antworten muessen den Accept-Encoding-Cache-Key signalisieren."],
  [
    /\bgzip_types[\s\S]*application\/javascript[\s\S]*application\/json[\s\S]*application\/manifest\+json[\s\S]*image\/svg\+xml[\s\S]*text\/css[\s\S]*text\/plain[\s\S]*;/,
    "Die ausgelieferten textbasierten Frontend-Assets muessen vom gzip-Vertrag erfasst sein."
  ],
  [
    /location ~\* \\\.mjs\$ \{[\s\S]*default_type application\/javascript;[\s\S]*try_files \$uri =404;/,
    "Die standardmaessig nicht typisierten PDF.js-Module muessen als gzip-faehiges JavaScript ausgeliefert werden."
  ],
  [
    /map \$request_uri \$vk_cache_control \{[\s\S]*~\*\\\.\(\?:css\|m\?js\|json\|png\|jpe\?g\|gif\|webp\|svg\|ico\|woff2\?\)/,
    "Statische ES-Module muessen denselben begrenzten Browsercache wie klassische JavaScript-Dateien erhalten."
  ],
  [
    /map \$request_uri \$vk_cache_control \{[\s\S]*default "no-store";[\s\S]*~\^\/data\/runtime-config\\\.js\(\?:\\\?\|\$\) "no-store";/,
    "HTML und Runtime-Konfiguration muessen trotz Kompression privat und ungecached bleiben."
  ]
]) {
  assert.match(frontendNginxSource, contract, message);
}
assert.doesNotMatch(
  frontendNginxSource,
  /\bbrotli(?:_|\s)/i,
  "Die Frontend-Konfiguration darf keine nicht garantierte Brotli-Modulabhaengigkeit einfuehren."
);
assert.doesNotMatch(
  helmSource,
  /AUTH_(?:EMAIL|SUBJECT)_HEADER|auth(?:Email|Subject)Header/,
  "Produktive Helm-Artefakte duerfen keine unsignierten Identity-Header konfigurieren."
);
assert.match(
  helmSource,
  /location \^~ \/__\/auth\/[\s\S]*limit_except GET HEAD POST[\s\S]*proxy_pass_request_headers off;[\s\S]*proxy_hide_header Set-Cookie;[\s\S]*proxy_ssl_verify on;[\s\S]*proxy_set_header Authorization "";[\s\S]*proxy_set_header Cookie "";[\s\S]*proxy_pass https:\/\/steam-capsule-341212\.firebaseapp\.com;/,
  "Der oeffentliche Auth-Helper muss methodenbegrenzt, TLS-verifiziert, credentialfrei und auf einen festen Upstream gepinnt sein."
);
assert.match(
  helmSource,
  /logging:[\s\S]*enable: false[\s\S]*iap:[\s\S]*enabled: false/,
  "Das dedizierte Auth-Helper-Backend muss IAP- und zugriffslogfrei bleiben."
);
assert.match(
  configMapSource,
  /if eq \.Values\.config\.apiAuthMode "oidc"[\s\S]*OIDC_AUDIENCE: \{\{ \.Values\.config\.oidcAudience \| quote \}\}[\s\S]*else[\s\S]*OIDC_AUDIENCE: ""[\s\S]*end/,
  "Der IAP-Modus darf keine unbenutzten OIDC-Platzhalter in die Runtime-Config rendern."
);
assert.doesNotMatch(
  `${configMapSource}\n${valuesSource}`,
  /API_AUTH_AUTO_ENROLLMENT_ENABLED|autoEnrollmentEnabled/,
  "Die entfernte Self-Service-Registrierung darf nicht per Runtime-Schalter reaktivierbar bleiben."
);
for (const contract of [
  "automountServiceAccountToken: false",
  "readOnlyRootFilesystem: true",
  "runAsNonRoot: true",
  "seccompProfile:",
  "maxUnavailable: 0",
  "attachmentUploadMode: \"disabled\"",
  "imageUploadMode: \"disabled\"",
  "DB_SSL:"
]) {
  assert.ok(valuesSource.includes(contract) || helmSource.includes(contract), `Helm-Sicherheitsvertrag fehlt: ${contract}`);
}
for (const contract of [
  "path: /api/readyz",
  "kind: NetworkPolicy",
  "kind: PodDisruptionBudget",
  "script-src 'self'",
  "script-src-attr 'none'",
  "frame-ancestors $vk_frame_ancestors",
  "versorgungs-kompass-(?:map|map-teaser|contact-mini-map)",
  "Strict-Transport-Security",
  "X-Content-Type-Options"
]) {
  assert.ok(helmSource.includes(contract), `Deployment-Sicherheitsvertrag fehlt: ${contract}`);
}
assert.doesNotMatch(valuesSource, /tag:\s*latest\b/i, "Produktionsimages duerfen nicht per latest referenziert werden.");

const deployWorkflowSource = read(".github/workflows/deploy-pre-gematik.yml");
const targetReadinessSource = read(".github/workflows/target-readiness.yml");
const jenkinsSource = read("deploy/jenkins/Jenkinsfile.gematik");
const packageScripts = JSON.parse(read("package.json")).scripts;
assert.doesNotMatch(
  packageScripts["build:target"],
  /identity-platform|IDENTITY_PLATFORM|IAP_/i,
  "Der providerneutrale OIDC-Build darf keine GCP-Identity-Platform-Werte weiterreichen."
);
assert.match(
  packageScripts["test:deployment-separation:oidc"],
  /--oidc-only/,
  "Der interne RC benoetigt einen OIDC-only-Artefaktvertrag."
);
assert.match(
  packageScripts["check:poc-rc"],
  /test:deployment-separation:oidc/,
  "Der Software-Factory-RC muss den OIDC-only-Artefaktvertrag ausfuehren."
);
assert.doesNotMatch(
  jenkinsSource,
  /npm ci --prefix frontend\/identity-portal|--identity-platform-(?:api-key|project-id)/,
  "Jenkins darf fuer den internen OIDC-Build weder das GCP-Portal installieren noch GCP-Portalwerte uebergeben."
);
assert.match(
  jenkinsSource,
  /stage\('Install'\)[\s\S]*rm -rf -- frontend\/identity-portal\/node_modules[\s\S]*npm ci[\s\S]*test ! -d frontend\/identity-portal\/node_modules/,
  "Jenkins muss ignorierte Portal-Abhaengigkeiten aus wiederverwendeten Workspaces entfernen und ihre Abwesenheit nachweisen."
);
assert.match(
  jenkinsSource,
  /unset IDENTITY_PLATFORM_API_KEY IDENTITY_PLATFORM_PROJECT_ID[\s\S]*test ! -e "\$FRONTEND_ARTIFACT_DIR\/public\/auth"[\s\S]*test ! -d frontend\/identity-portal\/node_modules/,
  "Jenkins muss den internen OIDC-Build gegen geerbte GCP-Werte und Portalartefakte absichern."
);
assert.match(
  jenkinsSource,
  /git fetch --force --tags origin '\+refs\/heads\/main:refs\/remotes\/origin\/main'[\s\S]*git merge-base --is-ancestor "\$head_sha" refs\/remotes\/origin\/main/,
  "Jenkins darf nur einen auf origin/main enthaltenen PoC-RC ausliefern."
);
assert.match(
  jenkinsSource,
  /expected_version="\$\{rc_tag#poc-v\}"[\s\S]*expected_rc_suffix="\$\{expected_version##\*-\}"[\s\S]*chart_version=[\s\S]*chart_app_version=[\s\S]*poc_image_tag=[\s\S]*\*-"\$expected_rc_suffix"[\s\S]*test "\$chart_app_version" = "\$expected_version"[\s\S]*test "\$poc_image_tag" = "\$rc_tag"/,
  "Jenkins muss RC-Tag, Helm-Chart-Suffix, appVersion und PoC-Image-Tag miteinander abgleichen."
);
assert.match(
  jenkinsSource,
  /stage\('Smoke API image'\)[\s\S]*--env API_AUTH_MODE=oidc[\s\S]*--env OIDC_ISSUER[\s\S]*--env OIDC_AUDIENCE[\s\S]*--env OIDC_JWKS_URL/,
  "Jenkins muss das API-Image im internen OIDC-Modus starten."
);
assert.doesNotMatch(
  jenkinsSource,
  /stage\('Smoke API image'\)[\s\S]*--env API_AUTH_MODE=iap/,
  "Der interne Jenkins-Smoke darf nicht auf den GCP-IAP-Modus zurueckfallen."
);
assert.doesNotMatch(
  targetReadinessSource,
  /npm ci --prefix frontend\/identity-portal/,
  "Der interne Target-Readiness-Job darf die fehlende OIDC-Entkopplung nicht durch Portal-Abhaengigkeiten maskieren."
);
assert.match(
  targetReadinessSource,
  /Build internal OIDC target without GCP portal[\s\S]*test ! -d frontend\/identity-portal\/node_modules[\s\S]*npm run build:target[\s\S]*test ! -e dist\/target\/public\/auth/,
  "Target-Readiness muss den sauberen OIDC-Build ohne GCP-Portal nachweisen."
);
assert.match(
  targetReadinessSource,
  /Build and smoke-test API container[\s\S]*--env API_AUTH_MODE=oidc[\s\S]*--env OIDC_ISSUER=https:\/\/identity\.example\.invalid\/issuer[\s\S]*--env OIDC_AUDIENCE=versorgungs-kompass[\s\S]*--env OIDC_JWKS_URL=https:\/\/identity\.example\.invalid\/\.well-known\/jwks\.json/,
  "Target-Readiness muss den API-Container mit einer vollstaendigen OIDC-Konfiguration starten."
);
assert.match(
  deployWorkflowSource,
  /const appendOnlyTables = \["activity_events"\];[\s\S]*requested\.name = any\(\$2::text\[\]\)[\s\S]*'SELECT'[\s\S]*'INSERT'[\s\S]*not has_any_column_privilege\([^\n]+, 'UPDATE'\)[\s\S]*not has_table_privilege\([^\n]+, 'DELETE'\)/,
  "Der Live-Readiness-Check muss activity_events als append-only prüfen."
);
for (const contract of [
  "membership.admin_option",
  "membership.inherit_option",
  "membership.set_option",
  "has_no_parent_memberships",
  "const publicActivityAcl = await pool.query",
  "pg_catalog.aclexplode",
  "privilege.grantee = 0",
  "'SELECT WITH GRANT OPTION'",
  "'INSERT WITH GRANT OPTION'",
  "not has_any_column_privilege(current_user, format('public.%I', requested.name), 'REFERENCES')",
  "not has_table_privilege(current_user, format('public.%I', requested.name), 'TRIGGER')",
  "not has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'UPDATE')",
  "not has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'USAGE WITH GRANT OPTION')",
  "not has_sequence_privilege(current_user, 'public.activity_events_id_seq', 'SELECT WITH GRANT OPTION')"
]) {
  assert.ok(deployWorkflowSource.includes(contract), `Live-Readiness-Vertrag fehlt: ${contract}`);
}
assert.doesNotMatch(
  deployWorkflowSource,
  /"activity_events", "changes"/,
  "Der Live-Readiness-Check darf activity_events nicht mehr in den generischen CRUD-Vertrag einordnen."
);
const ciSource = [
  read(".github/workflows/repo-check.yml"),
  deployWorkflowSource,
  targetReadinessSource,
  jenkinsSource
].join("\n");
for (const imageReference of [
  /semgrep\/semgrep:1\.164\.0@sha256:[a-f0-9]{64}/,
  /ghcr\.io\/gitleaks\/gitleaks:v8\.30\.1@sha256:[a-f0-9]{64}/,
  /aquasec\/trivy:0\.70\.0@sha256:[a-f0-9]{64}/
]) {
  assert.match(ciSource, imageReference, "Security-Scanner muessen per Version und Digest gepinnt sein.");
}
assert.doesNotMatch(ciSource, /(?:semgrep|gitleaks|trivy)[^\n]*(?::latest\b|\bp\/owasp|\bp\/secrets)/i, "Scanner duerfen weder latest noch unversionierte Remote-Regelsets verwenden.");
assert.match(ciSource, /npm audit signatures/, "Die Registry-Signaturen der npm-Abhaengigkeiten muessen in CI geprueft werden.");
assert.match(ciSource, /fetch-depth:\s*0/, "Der Secret-Scan benoetigt die vollstaendige Git-Historie.");
assert.match(ciSource, /dir \. --config \/repo\/config\/security\/gitleaks\.toml/, "CI muss neben der Historie auch den aktuellen Quellbaum auf Secrets pruefen.");
assert.match(ciSource, /SEMGREP_ENABLE_VERSION_CHECK=0/, "Der netzisolierte Semgrep-Lauf darf nicht auf einen Versionsdienst warten.");
assert.match(ciSource, /semgrep scan[^\n]*--timeout=60[^\n]*--max-target-bytes=5000000/, "Semgrep muss auch die grosse zentrale Anwendungsdatei ohne Regel-Timeout pruefen.");
for (const contract of [
  /--strict/,
  /--timeout=60/,
  /--max-target-bytes=5000000/,
  /--json-output=\/evidence\/semgrep\.json/,
  /--sarif-output=\/evidence\/semgrep\.sarif/
]) {
  assert.match(jenkinsSource, contract, `Jenkins-Semgrep-Vertrag fehlt: ${contract}`);
}
assert.doesNotMatch(jenkinsSource, /--ignore-unfixed/, "Jenkins darf ungefixte HIGH-/CRITICAL-Imagebefunde nicht pauschal ausblenden.");
for (const artifact of [
  "api-image-binding.json",
  "gitleaks-history.json",
  "gitleaks-tree.json",
  "trivy-image.json",
  "trivy-image.sarif",
  "trivy-config.json",
  "trivy-config.sarif",
  "api-sbom.cdx.json",
  "frontend-sbom.cdx.json",
  "security-evidence.json"
]) {
  assert.ok(jenkinsSource.includes(artifact), `Jenkins-Security-Nachweis fehlt: ${artifact}`);
}
assert.match(jenkinsSource, /stage\('Trivy configuration scan'\)/, "Jenkins muss Dockerfile und gerendertes Helm-Artefakt mit Trivy pruefen.");
assert.match(jenkinsSource, /REQUIRE_EXTERNAL_SECURITY_EVIDENCE/, "Jenkins braucht ein explizites Gate für zentrale Software-Factory-Nachweise.");
assert.match(jenkinsSource, /rm -rf -- "\$SECURITY_EVIDENCE_DIR" "\$API_IMAGE_SCAN_DIR"/, "Jenkins muss alte Security-Nachweise vor jedem Lauf entfernen.");
assert.match(jenkinsSource, /build-id\.txt/, "Jenkins darf nur Security-Nachweise des aktuellen Builds archivieren.");
assert.match(jenkinsSource, /--api-image-local-digest "\$API_IMAGE_ID"/, "Jenkins muss den Registry-Digest an das lokal gebaute Image binden.");
assert.match(jenkinsSource, /--api-image-config-digest "\$API_IMAGE_CONFIG_DIGEST"/, "Jenkins muss Trivy und API-SBOM an den Config-Digest des gescannten Images binden.");
assert.match(jenkinsSource, /api-image-archive-binding\.json/, "Jenkins muss die lokale OCI-Descriptor-Kette des API-Images pruefen.");
assert.match(jenkinsSource, /registryResolvedLocalDigest/, "Jenkins muss den Registry-Digest mit dem gescannten lokalen Image verbinden.");
assert.match(
  jenkinsSource,
  /post\s*\{[\s\S]*always\s*\{[\s\S]*archiveArtifacts\([\s\S]*dist\/security-evidence\/\*\*/,
  "Jenkins muss Security-Berichte auch nach einem fehlgeschlagenen Gate archivieren."
);
assert.match(ciSource, /npm run deploy:preflight/, "Jenkins muss den fail-closed Ziel-Preflight vor dem Artefaktbau ausfuehren.");
assert.match(
  deployWorkflowSource,
  /Build and smoke-test API container[\s\S]*--env API_AUTH_MODE=iap[\s\S]*--env ALLOWED_ORIGIN=https:\/\/pre-gematik\.example\.invalid[\s\S]*--env IAP_JWT_AUDIENCE=/,
  "Der produktive API-Container-Smoke-Test muss alle fail-closed Identity- und Origin-Pflichtwerte setzen."
);
assert.match(
  deployWorkflowSource,
  /Require DNS and active certificates before canonical cutover[\s\S]*kubectl[\s\S]*get ingress[\s\S]*kubernetes\.io\/ingress\.global-static-ip-name[\s\S]*status\.loadBalancer\.ingress[\s\S]*length == 1[\s\S]*hostname[\s\S]*dig \+short A/,
  "Der Domain-Cutover muss DNS gegen die einzige, direkt adressierte IPv4 des vorbereiteten statischen Ingress pruefen."
);
assert.ok(
  deployWorkflowSource.includes("awk '/^([0-9]{1,3}[.]){3}[0-9]{1,3}$/{print}'"),
  "Der DNS-Filter muss IPv4-Punkte ohne mehrdeutiges Shell-/Awk-Escaping erkennen."
);
assert.doesNotMatch(
  deployWorkflowSource,
  /gcloud compute addresses describe/,
  "Das Domain-Gate darf keine nicht freigegebene Compute-Address-Leseberechtigung voraussetzen."
);
assert.match(
  ciSource,
  /Scan immutable API image for deploy-blocking vulnerabilities[\s\S]*--severity HIGH,CRITICAL/,
  "Der GitHub-GKE-Pfad muss HIGH/CRITICAL-Imagebefunde vor dem Deployment blockieren."
);

const terraformSql = read("deploy/terraform/gcp-autopilot/sql.tf");
const terraformVariables = read("deploy/terraform/gcp-autopilot/variables.tf");
assert.match(
  terraformSql,
  /availability_type\s*=\s*var\.DB_AVAILABILITY_TYPE/,
  "Cloud SQL muss die bewusst entschiedene Pilot-Verfuegbarkeit verwenden."
);
assert.match(
  terraformVariables,
  /variable "DB_AVAILABILITY_TYPE"[\s\S]*default\s*=\s*"ZONAL"[\s\S]*contains\(\["ZONAL", "REGIONAL"\]/,
  "Die persoenliche Pre-Integration muss kostenbewusst ZONAL bleiben und REGIONAL nur explizit erlauben."
);
assert.match(terraformSql, /retained_backups\s*=\s*14/, "Cloud SQL benoetigt eine definierte Backup-Aufbewahrung.");

console.log("Security Contracts OK: Identity/RBAC, Browsergrenzen, Supply Chain, Uploads, Transaktionen, Cloud SQL, Helm/GKE und Resilienz sind fail-closed abgesichert.");
