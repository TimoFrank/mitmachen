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
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(fullPath) : entry.isFile() ? [fullPath] : [];
});
const apiSource = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const hardeningMigrationPath = walk(path.join(projectPath, "supabase", "migrations"))
  .find((file) => file.endsWith("_reconcile_security_and_protected_storage.sql"));
assert.ok(hardeningMigrationPath, "Die idempotente Supabase-Reconciliation-Migration fehlt.");
const hardeningMigration = fs.readFileSync(hardeningMigrationPath, "utf8");

assert.equal(roleRank("viewer"), 1);
assert.equal(roleRank("editor"), 2);
assert.equal(roleRank("admin"), 3);
assert.equal(roleRank("unknown"), 0);

for (const [method, pathname, expectedRole, expectedId] of [
  ["GET", "/healthz", "public", "health"],
  ["GET", "/api/contacts", "viewer", "collection.read"],
  ["POST", "/api/contacts", "editor", "domain.write"],
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
assert.equal(policyForRequest("GET", "/api/unbekannt"), null, "Neue Routen muessen bis zur Policy-Entscheidung gesperrt bleiben.");

for (const [method, pathname, expectedRole] of [
  ["GET", "/api/auth/bootstrap", "public"],
  ["GET", "/api/session", "viewer"],
  ["GET", "/api/ops/summary", "admin"],
  ["GET", "/api/ops/checks", "admin"],
  ["GET", "/api/export", "admin"],
  ["GET", "/api/contact-content-search", "viewer"],
  ["GET", "/api/contact-notes", "viewer"],
  ["GET", "/api/contact-note-attachments", "viewer"],
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
assert.equal(validateIdentityConfiguration({
  NODE_ENV: "production",
  API_AUTH_MODE: "iap",
  IAP_JWT_AUDIENCE: "/projects/123/global/backendServices/456"
}).mode, "iap");
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
assert.match(apiSource, /select 1 from public\.identity_bindings limit 0/, "Readiness muss die signierte Identity-Bindungstabelle pruefen.");

for (const contract of [
  "from public.identity_bindings binding",
  "where binding.issuer = $1",
  "and binding.subject = $2",
  "and binding.active = true",
  "and p.active = true",
  "if (rows?.length !== 1)",
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

const normalizedMigration = hardeningMigration.toLowerCase().replace(/\s+/g, " ");
for (const contract of [
  "revoke all on schema private from public, anon",
  "grant usage on schema private to authenticated, service_role",
  "create or replace function public.current_profile_role() returns text language sql stable security invoker set search_path = ''",
  "revoke all on function public.handle_new_user() from public, anon, authenticated, service_role",
  "revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role",
  "create or replace function public.create_notification_event",
  "returns uuid language sql security invoker set search_path = ''",
  "create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = ''",
  "alter table private.protected_source_snapshots force row level security",
  "revoke all on table private.protected_source_snapshots from public, anon, authenticated, service_role",
  "protected archives deny browser access",
  "bucket_id not in ('stakeholder-logos', 'protected-source-assets')",
  "profile images team read",
  "alter default privileges in schema public revoke execute on functions from public, anon, authenticated"
]) {
  assert.ok(normalizedMigration.includes(contract), `Supabase-Haertungsvertrag fehlt: ${contract}`);
}
assert.doesNotMatch(
  normalizedMigration,
  /update public\.login_aliases|alter table public\.profiles alter column active|revoke all on public\.login_aliases/,
  "Die enge Reconciliation darf weder Login-Aliase noch fachliche Profilaktivierung veraendern."
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
const helmSource = [
  valuesSource,
  configMapSource,
  read("deploy/helm/versorgungs-kompass/templates/deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/frontend-nginx-configmap.yaml"),
  read("deploy/helm/versorgungs-kompass/files/frontend-default.conf"),
  read("deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml"),
  read("deploy/helm/versorgungs-kompass/templates/poddisruptionbudget.yaml")
].join("\n");
assert.doesNotMatch(
  helmSource,
  /AUTH_(?:EMAIL|SUBJECT)_HEADER|auth(?:Email|Subject)Header/,
  "Produktive Helm-Artefakte duerfen keine unsignierten Identity-Header konfigurieren."
);
assert.match(
  configMapSource,
  /if eq \.Values\.config\.apiAuthMode "oidc"[\s\S]*OIDC_AUDIENCE: \{\{ \.Values\.config\.oidcAudience \| quote \}\}[\s\S]*else[\s\S]*OIDC_AUDIENCE: ""[\s\S]*end/,
  "Der IAP-Modus darf keine unbenutzten OIDC-Platzhalter in die Runtime-Config rendern."
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

const ciSource = [
  read(".github/workflows/repo-check.yml"),
  read(".github/workflows/deploy-pre-gematik.yml"),
  read(".github/workflows/target-readiness.yml"),
  read("deploy/jenkins/Jenkinsfile.gematik")
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
assert.match(ciSource, /npm run deploy:preflight/, "Jenkins muss den fail-closed Ziel-Preflight vor dem Artefaktbau ausfuehren.");
assert.match(
  ciSource,
  /Scan immutable API image for deploy-blocking vulnerabilities[\s\S]*--severity HIGH,CRITICAL/,
  "Der GitHub-GKE-Pfad muss HIGH/CRITICAL-Imagebefunde vor dem Deployment blockieren."
);

const supabaseConfig = read("supabase/config.toml");
assert.match(supabaseConfig, /enable_signup\s*=\s*false/, "Der Supabase-Uebergang darf keine offene Registrierung erlauben.");
assert.match(supabaseConfig, /enable_anonymous_sign_ins\s*=\s*false/, "Anonyme Supabase-Sitzungen muessen deaktiviert sein.");

const terraformSql = read("deploy/terraform/gcp-autopilot/sql.tf");
assert.match(terraformSql, /availability_type\s*=\s*"REGIONAL"/, "Cloud SQL muss fuer den Zielbetrieb regional vorbereitet sein.");
assert.match(terraformSql, /retained_backups\s*=\s*14/, "Cloud SQL benoetigt eine definierte Backup-Aufbewahrung.");

console.log("Security Contracts OK: Identity/RBAC, Browsergrenzen, Supply Chain, Uploads, Transaktionen, Supabase, Helm/GKE und Resilienz sind fail-closed abgesichert.");
