#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const singleServerRoot = path.join(projectRoot, "deploy", "single-server");
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), "utf8");

const compose = read("deploy/single-server/compose.yaml");
const caddy = read("deploy/single-server/caddy/Caddyfile");
const oauth = read("deploy/single-server/oauth2-proxy.cfg");
const common = read("deploy/single-server/common.sh");
const preflight = read("deploy/single-server/preflight.sh");
const prepareHost = read("deploy/single-server/prepare-host.sh");
const deploy = read("deploy/single-server/deploy.sh");
const serviceControl = read("deploy/single-server/service-control.sh");
const cutoverModeControl = read("deploy/single-server/set-cutover-mode.sh");
const cutoverOpenGateValidator = read("deploy/single-server/validate-cutover-open-gates.mjs");
const codeReopenGateValidator = read("deploy/single-server/validate-code-reopen-gates.mjs");
const persistenceContractHasher = read("deploy/single-server/hash-persistence-contract.mjs");
const cutoverIdentityAudit = read("deploy/single-server/cutover-identity-audit.sh");
const systemdService = read("deploy/single-server/systemd/versorgungs-kompass.service");
const status = read("deploy/single-server/status.sh");
const backup = read("deploy/single-server/backup.sh");
const restoreTest = read("deploy/single-server/restore-test.sh");
const postgresBootstrap = read("deploy/single-server/postgres/10-bootstrap.sh");
const postgresDump = read("deploy/single-server/backup/postgres-dump.sh");
const resticBackup = read("deploy/single-server/backup/restic-backup.sh");
const resticMaintenance = read("deploy/single-server/backup/restic-maintenance.sh");
const backupRecovery = read("deploy/single-server/backup/recover-api-after-backup.sh");
const repositoryCheck = read("deploy/single-server/backup/repository-check.sh");
const systemdBackupService = read("deploy/single-server/systemd/versorgungs-kompass-backup.service");
const systemdBackupCheckService = read("deploy/single-server/systemd/versorgungs-kompass-backup-check.service");
const systemdBackupCheckTimer = read("deploy/single-server/systemd/versorgungs-kompass-backup-check.timer");
const resticRestore = read("deploy/single-server/backup/restic-restore.sh");
const snapshotInventoryFormatterPath = path.join(singleServerRoot, "backup", "format-snapshot-inventory.mjs");
const postgresRestoreTest = read("deploy/single-server/backup/postgres-restore-test.sh");
const migrationHostImport = read("deploy/single-server/migration/import-database.sh");
const migrationContainerImport = read("deploy/single-server/migration/container-import.sh");
const migrationExport = read("deploy/single-server/migration/export-database.sh");
const migrationGuide = read("deploy/single-server/migration/README.md");
const objectStorage = read("api/object-storage.mjs");
const identityBootstrap = read("api/identity-bootstrap-claim.mjs");
const identityProvision = read("api/identity-provision.mjs");
const identityProvisionHost = read("deploy/single-server/identity/provision.sh");
const recoveryEscrow = read("deploy/single-server/backup/recovery-escrow.mjs");
const recoveryCopy = read("deploy/single-server/backup/verify-recovery-copy.sh");
const frontendDockerfile = read("deploy/single-server/frontend/Dockerfile");
const frontendDockerignore = read("deploy/single-server/frontend/Dockerfile.dockerignore");
const frontendPrivacy = read("deploy/single-server/frontend/00-privacy.conf");

const signalProbe = spawnSync("bash", ["-c", `
  source ${JSON.stringify(path.join(singleServerRoot, "common.sh"))}
  trap 'printf "cleanup\\n"' EXIT
  single_server_install_terminating_signal_traps
  kill -TERM $$
  printf continued\\n
`], { encoding: "utf8" });
assert.equal(signalProbe.status, 143, "TERM muss den Betriebsschritt mit dem Signalstatus beenden.");
assert.equal(signalProbe.stdout, "cleanup\n", "Nach TERM darf nur EXIT-Cleanup, aber kein weiterer Betriebscode laufen.");

function composeServiceBlocks(source) {
  const servicesStart = source.indexOf("services:\n");
  const servicesEnd = source.indexOf("\nnetworks:\n", servicesStart);
  assert.ok(servicesStart >= 0 && servicesEnd > servicesStart, "Compose muss einen abgegrenzten services-Block besitzen.");
  const services = source.slice(servicesStart + "services:\n".length, servicesEnd);
  const headers = [...services.matchAll(/^  ([a-z0-9][a-z0-9-]*):\s*$/gmu)];
  const blocks = new Map();
  headers.forEach((header, index) => {
    const end = headers[index + 1]?.index ?? services.length;
    blocks.set(header[1], services.slice(header.index, end));
  });
  return blocks;
}

function requireService(blocks, serviceName) {
  const block = blocks.get(serviceName);
  assert.ok(block, `Compose-Service fehlt: ${serviceName}`);
  return block;
}

function assertBefore(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0 && secondIndex > firstIndex, message);
}

function countTrimmedLine(source, expected) {
  return source.split(/\r?\n/u).filter((line) => line.trim() === expected).length;
}

function composeList(block, key) {
  const lines = block.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `    ${key}:`);
  assert.ok(start >= 0, `Compose-Liste fehlt: ${key}`);
  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith("      ")) break;
    if (!line) continue;
    const item = line.match(/^      - (.+)$/u)?.[1]?.trim();
    assert.ok(item, `Compose-Liste ${key} enthaelt einen nicht freigegebenen Eintrag: ${line.trim()}`);
    entries.push(item);
  }
  return entries;
}

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesRecursively(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

const services = composeServiceBlocks(compose);
assert.deepEqual([...services.keys()], [
  "caddy",
  "oauth2-proxy",
  "frontend",
  "api",
  "postgres",
  "database-dump",
  "database-import",
  "restic-backup",
  "restic-maintenance",
  "restic-restore",
  "database-restore-test",
  "object-storage-restore-test",
  "identity-provision"
], "Der Einzelserver muss aus der eng freigegebenen Service-Menge bestehen.");

const caddyService = requireService(services, "caddy");
const servicesWithPublishedPorts = [...services.entries()]
  .filter(([, block]) => /^    ports:\s*$/mu.test(block))
  .map(([name]) => name);
assert.deepEqual(servicesWithPublishedPorts, ["caddy"], "Nur Caddy darf Hostports veroeffentlichen.");
const publishedPorts = composeList(caddyService, "ports");
assert.deepEqual(publishedPorts, [
  "\"80:80\"",
  "\"443:443\"",
  "\"443:443/udp\""
], "Caddy darf ausschliesslich HTTP/HTTPS fuer Redirect, TLS und HTTP/3 veroeffentlichen.");
assert.doesNotMatch(compose, /^\s+network_mode:\s*host\s*$/mu, "Kein Container darf das Hostnetz verwenden.");

for (const [serviceName, block] of services) {
  const image = block.match(/^    image:\s*(.+)$/mu)?.[1]?.trim();
  assert.ok(image, `Compose-Service ${serviceName} muss ein explizites Image besitzen.`);
  if (image.startsWith("versorgungs-kompass-")) {
    assert.match(
      image,
      /^versorgungs-kompass-(?:api|caddy|frontend):\$\{SOURCE_REVISION:\?SOURCE_REVISION fehlt\}$/u,
      `Lokales Image von ${serviceName} muss an SOURCE_REVISION gebunden sein.`
    );
  } else {
    assert.match(
      image,
      /^[^\s@]+:[^\s@/]+@sha256:[a-f0-9]{64}$/u,
      `Externes Image von ${serviceName} muss Version und sha256-Digest pinnen.`
    );
  }
}

for (const dockerfilePath of [
  "api/Dockerfile",
  "deploy/single-server/caddy/Dockerfile",
  "deploy/single-server/frontend/Dockerfile"
]) {
  const dockerfile = read(dockerfilePath);
  const baseImages = [...dockerfile.matchAll(/^FROM\s+([^\s]+).*$/gmu)].map((match) => match[1]);
  assert.ok(baseImages.length > 0, `${dockerfilePath} muss ein Basisimage benennen.`);
  for (const image of baseImages) {
    assert.match(image, /^[^\s@]+:[^\s@/]+@sha256:[a-f0-9]{64}$/u,
      `${dockerfilePath} muss jedes Basisimage mit Version und Digest pinnen.`);
  }
}

const apiService = requireService(services, "api");
const postgresService = requireService(services, "postgres");
const databaseDumpService = requireService(services, "database-dump");
const databaseImportService = requireService(services, "database-import");
const databaseRestoreService = requireService(services, "database-restore-test");
const objectStorageRestoreService = requireService(services, "object-storage-restore-test");
const identityProvisionService = requireService(services, "identity-provision");
assert.match(postgresService, /^    user: "70:70"$/mu, "PostgreSQL muss als Alpine-Postgres-UID/GID 70 laufen.");
assert.match(databaseRestoreService, /^    user: "70:70"$/mu, "Auch der isolierte Restore-Test muss als UID/GID 70 laufen.");
for (const [name, block] of [
  ["api", apiService],
  ["database-dump", databaseDumpService],
  ["database-import", databaseImportService],
  ["restic-backup", requireService(services, "restic-backup")],
  ["restic-maintenance", requireService(services, "restic-maintenance")],
  ["restic-restore", requireService(services, "restic-restore")],
  ["object-storage-restore-test", objectStorageRestoreService],
  ["identity-provision", identityProvisionService]
]) {
  assert.match(block, /^    user: "70:70"$/mu, `${name} muss fuer Daten und dienstgebundene Secrets als UID/GID 70 laufen.`);
}
assert.match(postgresService, /^    network_mode: none$/mu, "PostgreSQL darf kein Containernetz besitzen.");
assert.match(databaseDumpService, /^    network_mode: none$/mu, "Der Datenbank-Dump darf kein Containernetz besitzen.");
assert.match(databaseImportService, /^    network_mode: none$/mu, "Der einmalige Datenbankimport darf kein Containernetz besitzen.");
assert.match(postgresService, /- listen_addresses=\s*$/mu, "PostgreSQL darf nicht auf TCP lauschen.");
assert.match(postgresService, /- unix_socket_directories=\/var\/run\/postgresql\s*$/mu);
assert.match(postgresService, /postgres-socket:\/var\/run\/postgresql\s*$/mu);
assert.match(apiService, /^      DB_HOST: \/run\/postgresql$/mu);
assert.match(apiService, /^      DB_SSL_MODE: disable$/mu);
assert.match(apiService, /postgres-socket:\/run\/postgresql:ro\s*$/mu);
assert.match(databaseDumpService, /^      PGHOST: \/run\/postgresql$/mu);
assert.match(databaseDumpService, /postgres-socket:\/run\/postgresql:ro\s*$/mu);
assert.match(databaseImportService, /^      PGHOST: \/run\/postgresql$/mu);
assert.match(databaseImportService, /postgres-socket:\/run\/postgresql:ro\s*$/mu);
assert.match(databaseImportService, /^      TARGET_SOURCE_REVISION: \$\{SOURCE_REVISION:\?SOURCE_REVISION fehlt\}$/mu);
assert.match(databaseImportService, /\$\{MIGRATION_DIR:-\/tmp\/versorgungs-kompass-migration-not-configured\}:\/migration:ro/u);
assert.match(databaseImportService, /^    entrypoint: \["\/bin\/sh", "\/usr\/local\/bin\/database-import"\]$/mu);
assert.match(prepareHost, /install_safe_directory "\$STATE_DIR\/postgres-data" "\$STATE_DIR" 0700 70 70/u);
assert.match(prepareHost, /install_safe_directory "\$STATE_DIR\/postgres-socket" "\$STATE_DIR" 0700 70 70/u);
assert.match(prepareHost, /install_safe_directory "\$STATE_DIR\/object-storage" "\$STATE_DIR" 0700 70 70/u);
assert.match(prepareHost, /install_safe_directory "\$STATE_DIR\/backup-staging" "\$STATE_DIR" 0700 70 70/u);
assert.match(preflight, /check_directory "\$STATE_DIR\/postgres-data" 70 700/u);
assert.match(preflight, /check_directory "\$STATE_DIR\/postgres-socket" 70 700/u);
assert.match(preflight, /check_directory "\$STATE_DIR\/object-storage" 70 700/u);
assert.match(preflight, /check_directory "\$STATE_DIR\/backup-staging" 70 700/u);
assert.match(preflight, /check_directory "\$CONFIG_DIR" 0 700/u);
assert.match(preflight, /check_directory "\$STATE_DIR" 0 700/u);
assert.match(preflight, /Secret-Datei \$name muss UID\/GID \$expected_uid:\$expected_uid gehoeren/u);
assert.match(postgresService, /unix_socket_permissions=0700/u);

const normalizedBootstrap = postgresBootstrap.toLowerCase();
assert.equal(
  [...postgresBootstrap.matchAll(/psql --username="\$POSTGRES_USER" --dbname="\$POSTGRES_DB"/gu)].length,
  4,
  "Der Bootstrap muss bei einem benutzerdefinierten POSTGRES_USER jede psql-Verbindung explizit adressieren."
);
assert.match(normalizedBootstrap, /create role vk_app login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %l/u);
assert.match(normalizedBootstrap, /alter role vk_app login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;/u);
assert.match(normalizedBootstrap, /grant vk_app_runtime to vk_app;/u);
assert.match(normalizedBootstrap, /is distinct from array\['vk_app_runtime'\]::name\[\]/u,
  "Der Bootstrap muss jede unerwartete Rollenmitgliedschaft fail-closed ablehnen.");

assert.match(apiService, /^      NODE_ENV: production$/mu);
assert.match(apiService, /^      OBJECT_STORAGE_DRIVER: filesystem$/mu);
assert.match(apiService, /^      IMAGE_UPLOAD_MODE: disabled$/mu);
assert.match(apiService, /^      ATTACHMENT_UPLOAD_MODE: disabled$/mu);
assert.match(apiService, /object-storage:\/var\/lib\/versorgungs-kompass\/object-storage\s*$/mu);

assert.equal(countTrimmedLine(caddy, "log {"), 3, "Alle Caddy-Serverbloecke muessen das Accesslog explizit konfigurieren.");
assert.equal(countTrimmedLine(caddy, "output discard"), 3, "Caddy-Accesslogs muessen an allen Listenern verworfen werden.");
assert.match(caddy, /www\.\{\$APP_HOST\}[\s\S]*redir https:\/\/\{\$APP_HOST\}\{uri\} permanent/u,
  "Der bestehende www-CNAME muss ohne eigene App-Origin auf den kanonischen Apex umleiten.");
assert.equal(countTrimmedLine(caddy, "reverse_proxy oauth2-proxy:4180 {"), 2,
  "Oeffentliche geschuetzte Pfade muessen ausschliesslich ueber oauth2-proxy laufen.");
for (const header of [
  "X-Auth-Request-Email",
  "X-Auth-Request-User",
  "X-Auth-Request-Groups",
  "X-Auth-Request-Preferred-Username",
  "X-Auth-Request-Access-Token",
  "X-Forwarded-Email",
  "X-Forwarded-User",
  "X-Forwarded-Groups",
  "X-Forwarded-Preferred-Username",
  "X-Forwarded-Access-Token",
  "X-Goog-Authenticated-User-Email",
  "X-Goog-Authenticated-User-Id",
  "X-Goog-Iap-Jwt-Assertion"
]) {
  assert.equal(countTrimmedLine(caddy, `header_up -${header}`), 2,
    `Caddy muss den vom Client kontrollierbaren Identity-Header ${header} an beiden Proxy-Grenzen entfernen.`);
}
assert.equal(countTrimmedLine(caddy, "header_up -Authorization"), 3,
  "Caddy muss clientseitige Authorization-Header an beiden aeusseren Grenzen und das OIDC-Token vor dem Frontend entfernen.");
assert.equal(countTrimmedLine(caddy, "header_up -Cookie"), 2,
  "Der interne Proxy muss Session-Cookies sowohl vor API als auch Frontend entfernen.");
assert.match(caddy, /@api path \/api\/\*[\s\S]*reverse_proxy api:8080 \{[\s\S]*header_up -Cookie[\s\S]*\}[\s\S]*handle \{[\s\S]*reverse_proxy frontend:8080 \{[\s\S]*header_up -Authorization[\s\S]*header_up -Cookie/u,
  "Nur die API darf das frisch gesetzte OIDC-Authorization-Token erhalten.");
assert.equal(countTrimmedLine(caddy, "header_up X-Real-IP {remote_host}"), 2,
  "Caddy muss die Client-IP an beiden Proxy-Grenzen selbst setzen.");
assert.match(caddy, /^\s*admin off\s*$/mu);
assert.match(caddy, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/u);

for (const contract of [
  'provider = "google"',
  'scope = "openid email"',
  'code_challenge_method = "S256"',
  'client_secret_file = "/run/secrets/google-oauth-client-secret"',
  'authenticated_emails_file = "/run/secrets/allowed-emails"',
  'api_routes = ["^/api(?:/|$)"]',
  "pass_authorization_header = true",
  "pass_access_token = false",
  "pass_basic_auth = false",
  "pass_user_headers = false",
  "skip_auth_strip_headers = true",
  "skip_jwt_bearer_tokens = false",
  'session_store_type = "cookie"',
  'cookie_name = "__Host-vk_session"',
  'cookie_secret_file = "/run/secrets/oauth2-cookie-secret"',
  "cookie_secure = true",
  "cookie_httponly = true",
  'cookie_samesite = "lax"',
  'cookie_csrf_samesite = "lax"',
  'cookie_path = "/"',
  'cookie_refresh = "55m"',
  'cookie_expire = "8h"',
  "request_logging = false",
  "auth_logging = false"
]) {
  assert.ok(oauth.split(/\r?\n/u).map((line) => line.trim()).includes(contract),
    `oauth2-proxy-Vertrag fehlt: ${contract}`);
}
assert.doesNotMatch(oauth, /^\s*cookie_domains\s*=/mu, "Ein __Host-Cookie darf keine Domain-Angabe besitzen.");
const oauthService = requireService(services, "oauth2-proxy");
const oauthComposeImage = oauthService.match(/^    image:\s*(.+)$/mu)?.[1]?.trim();
const oauthPreflightImage = preflight.match(/^oauth2_proxy_image="([^"]+)"$/mu)?.[1];
assert.equal(oauthPreflightImage, oauthComposeImage,
  "Preflight und Laufzeit muessen exakt dasselbe gepinnte OAuth2-Proxy-Image pruefen.");
assert.match(oauthService, /OAUTH2_PROXY_CLIENT_ID: \$\{GOOGLE_OAUTH_CLIENT_ID:\?GOOGLE_OAUTH_CLIENT_ID fehlt\}/u);
assert.match(oauthService, /OAUTH2_PROXY_REDIRECT_URL: \$\{APP_ORIGIN:\?APP_ORIGIN fehlt\}\/oauth2\/callback/u);
assert.match(oauthService, /OAUTH2_PROXY_WHITELIST_DOMAINS: \$\{APP_HOST:\?APP_HOST fehlt\}/u);
assert.match(oauthService, /OAUTH2_PROXY_TRUSTED_PROXY_IPS: \$\{CADDY_EDGE_IP:-172\.31\.78\.2\}\/32/u);
for (const name of ["google-oauth-client-secret", "oauth2-cookie-secret", "allowed-emails"]) {
  assert.match(oauthService, new RegExp(
    `\\$\\{CONFIG_DIR:\\?CONFIG_DIR fehlt\\}/${name}:/run/secrets/${name}:ro`,
    "u"
  ), `oauth2-proxy muss ${name} ueber einen expliziten read-only Bind-Mount erhalten.`);
}
assert.doesNotMatch(compose, /^secrets:\s*$/mu,
  "File-backed Compose-Secrets duerfen keine Linux-UID-Umschreibung vortaeuschen; direkte Bind-Mounts sind erforderlich.");
assert.match(apiService, /^      API_AUTH_MODE: oidc$/mu);
assert.match(apiService, /^      OIDC_ISSUER: https:\/\/accounts\.google\.com$/mu);
assert.match(apiService, /^      OIDC_AUDIENCE: \$\{GOOGLE_OAUTH_CLIENT_ID:\?GOOGLE_OAUTH_CLIENT_ID fehlt\}$/mu);
assert.match(apiService, /^      OIDC_JWKS_URL: https:\/\/www\.googleapis\.com\/oauth2\/v3\/certs$/mu);
assert.match(apiService, /^      OIDC_IDENTITY_BOOTSTRAP_CLAIM_ENABLED: "1"$/mu);
assert.ok(preflight.includes("count < 1 || count > 4"), "Die E-Mail-Allowlist muss auf genau 1 bis 4 Eintraege begrenzt sein.");
assert.ok(preflight.includes("^[a-z0-9.!#$%&+\\/=?^_`{|}~-]+@"),
  "Die E-Mail-Allowlist muss einzelne kanonische kleingeschriebene Adressen validieren.");
assert.ok(!preflight.includes("%&*+\\/"), "OAuth2-Proxy-Wildcards duerfen nicht als Einzeladresse akzeptiert werden.");
assert.match(preflight, /allowed-emails muss genau 1 bis 4 kleingeschriebene Einzeladressen enthalten/u);
assert.equal(
  [...prepareHost.matchAll(/openssl rand -(?:hex|base64) 32 \| tr -d '\\r\\n'/gu)].length,
  2,
  "Automatisch erzeugte Secrets duerfen keinen vom Preflight abgelehnten Zeilenumbruch enthalten."
);
assertBefore(prepareHost, '[[ -e "$target" || -L "$target" ]]', 'chmod "$mode" -- "$target"',
  "Ein bestehendes Betriebsziel muss vor jeder Rechteaenderung auf Symlinks geprueft sein.");
assertBefore(prepareHost, 'realpath -e -- "$target"', 'chmod "$mode" -- "$target"',
  "Ein bestehendes Betriebsziel muss vor jeder Rechteaenderung kanonisch geprueft sein.");
assert.match(prepareHost, /assert_existing_safe_parent "\/etc\/versorgungs-kompass" 0/u);
assert.match(prepareHost, /assert_existing_safe_parent "\/var\/lib" 0/u);
assert.equal((prepareHost.match(/\[\[ ! -L "\$target" \]\]/gu) || []).length, 2,
  "Beide automatisch erzeugten Secret-Typen muessen auch haengende Symlinks abweisen.");
assert.match(prepareHost, /Manuelles Secret-Ziel darf kein Symlink sein/u);
assert.match(prepareHost, /create_hex_secret "\$CONFIG_DIR\/db-owner-password" 70/u);
assert.match(prepareHost, /create_hex_secret "\$CONFIG_DIR\/restic-password" 70/u);
assert.match(prepareHost, /create_hex_secret "\$CONFIG_DIR\/identity-bootstrap-hmac" 70/u);
assert.match(prepareHost, /create_cookie_secret "\$CONFIG_DIR\/oauth2-cookie-secret" 65532/u);
assert.match(preflight, /check_single_line_secret google-oauth-client-secret 16 256 65532/u);
assert.match(preflight, /check_single_line_secret db-owner-password 48 128 70/u);
assert.match(preflight, /check_single_line_secret identity-bootstrap-hmac 64 64 70/u);
assert.match(preflight, /--user 70:70[\s\S]*db-owner-password[\s\S]*restic-aws-credentials/u,
  "Linux-Preflight muss die Daten- und Backup-Secrets als echte Laufzeit-UID lesen.");
assert.match(preflight, /--user 65532:65532[\s\S]*--config=\/etc\/oauth2-proxy\.cfg --config-test/u,
  "OAuth-Preflight muss mit derselben UID wie der Laufzeitcontainer arbeiten.");

assert.equal(frontendPrivacy.trim().split(/\r?\n/u).at(-1), "access_log off;",
  "Der statische Einzelserver-Upstream darf keine personenbezogenen Pfade protokollieren.");
assert.match(frontendDockerfile, /frontend\/00-privacy\.conf \/etc\/nginx\/conf\.d\/00-privacy\.conf/u);
assert.match(frontendDockerfile, /authGateway: "oauth2-proxy"/u);
assert.match(frontendDockerignore, /!deploy\/single-server\/frontend\/00-privacy\.conf/u,
  "Die Datenschutzkonfiguration muss im eng begrenzten Frontend-Buildkontext enthalten sein.");

assert.match(common, /\[\[ "\$APP_ORIGIN" == "https:\/\/\$APP_HOST" \]\]/u,
  "Der Einzelserver darf nur den kanonischen HTTPS-Origin akzeptieren.");
assert.match(common, /\[\[ "\$APP_SITE_ADDRESS" == "\$APP_HOST" \]\]/u,
  "Caddys Site-Adresse darf kein separates oder unverschluesseltes Ziel sein.");
assert.match(common, /\[\[ "\$CONFIG_DIR" == "\/etc\/versorgungs-kompass\/secrets" \]\]/u,
  "Der Live-Betrieb muss den Secret-Pfad exakt festnageln, bevor root Verzeichnisse anlegt oder umberechtigt.");
assert.match(common, /\[\[ "\$STATE_DIR" == "\/var\/lib\/versorgungs-kompass" \]\]/u,
  "Der Live-Betrieb muss den Datenpfad exakt festnageln, bevor root Verzeichnisse anlegt oder umberechtigt.");
assert.match(common, /SINGLE_SERVER_LOCAL_TEST darf auf einem Linux-Zielhost nicht gesetzt sein/u,
  "Der lokale Testschalter darf das produktive Linux-Preflight nicht umgehen.");
assertBefore(common, '[[ "$env_file" == "/etc/versorgungs-kompass/single-server.env" ]]', 'source "$env_file"',
  "Auf Linux muss der exakte Environment-Pfad vor jeder Shell-Auswertung feststehen.");
assertBefore(common, 'realpath -e -- "$env_file"', 'source "$env_file"',
  "Symlinks in der Linux-Environment-Pfadkette muessen vor jeder Shell-Auswertung scheitern.");
assertBefore(common, 'stat -c \'%u:%g\' "$env_file"', 'source "$env_file"',
  "Root-Eigentuemer der Linux-Environment-Datei muss vor jeder Shell-Auswertung geprueft sein.");
assertBefore(common, 'stat -c \'%a\' "$env_file"', 'source "$env_file"',
  "Modus 0600 der Linux-Environment-Datei muss vor jeder Shell-Auswertung geprueft sein.");
assertBefore(common, 'env_parent_mode="$(stat -c \'%a\' "$env_parent")"', 'source "$env_file"',
  "Das Elternverzeichnis der Linux-Environment-Datei muss vor dem Laden gegen Schreibzugriffe Dritter geschuetzt sein.");
assert.match(deploy, /--noproxy "\$APP_HOST" --resolve "\$APP_HOST:443:127\.0\.0\.1"[\s\\]*\n\s*"\$APP_ORIGIN\/"/u,
  "Der Deploy-Smoke muss den neuen lokalen Zielstack pruefen und darf nicht versehentlich den alten DNS-Endpunkt bestaetigen.");
assert.match(deploy, /--resolve "\$APP_HOST:443:127\.0\.0\.1"[\s\\]*\n\s*"\$APP_ORIGIN\/api\/session"/u);
assert.match(common, /single_server_permanent_services_ready\(\)/u);
assert.match(common, /single_server_acquire_maintenance_lock\(\)/u);
assert.match(common, /single_server_assert_running_api_revision\(\)/u);
assert.match(common, /docker image inspect --format '\{\{\.Id\}\}' "\$expected_image"/u);
for (const provenanceField of [
  "com.docker.compose.project",
  "com.docker.compose.service",
  "com.docker.compose.oneoff",
  "org.opencontainers.image.source",
  "org.opencontainers.image.revision",
  "org.opencontainers.image.version"
]) {
  assert.match(common, new RegExp(provenanceField.replaceAll(".", "\\."), "u"),
    `API-Provenienz-Readback fehlt: ${provenanceField}`);
}
assert.match(common, /single_server_remove_interrupted_backup_containers\(\)/u);
assert.match(common, /versorgungs-kompass-backup-\$operation_id-\$service/u,
  "Recovery muss nur die im Marker gebundenen One-off-Dump-/Snapshot-Container adressieren.");
assert.match(common, /com\.docker\.compose\.project/u);
assert.match(common, /com\.docker\.compose\.service/u);
assert.match(common, /com\.docker\.compose\.oneoff/u,
  "Ein abgebrochener Backup-Container darf nur nach exaktem Compose-Label-Readback entfernt werden.");
assert.match(deploy, /single_server_acquire_maintenance_lock deployment/u);
assert.match(serviceControl, /single_server_acquire_maintenance_lock "service-\$action"/u);
assert.match(compose, /API_CUTOVER_MODE_REQUIRED: "1"[\s\S]*API_CUTOVER_MODE: \$\{API_CUTOVER_MODE:\?API_CUTOVER_MODE fehlt\}/u);
assert.match(requireService(composeServiceBlocks(compose), "api"), /restart: "no"/u,
  "Docker darf den API-Writer nach Reboot nicht an den fail-closed systemd-Gates vorbei starten.");
assert.match(common, /single_server_assert_api_cutover_mode/u);
assert.match(common, /SINGLE_SERVER_COMPOSE_OVERRIDE_FILE[\s\S]*SINGLE_SERVER_LOCAL_TEST[\s\S]*!= "Linux"/u,
  "Ein Compose-Override darf den produktiven Linux-Vertrag niemals veraendern.");
assert.match(preflight, /API_CUTOVER_MODE.*closed\|open/u);
assert.match(deploy, /\[\[ "\$#" -eq 2 && "\$expected_cutover_mode" == "closed"[\s\S]*single_server_assert_api_cutover_mode "\$expected_cutover_mode"/u,
  "Deployments muessen den erwarteten closed-Modus als separaten Bedienentscheid verlangen und danach am Prozess lesen.");
assert.match(deploy, /deployment_complete[\s\S]*single_server_compose stop --timeout 40 api/u,
  "Ein nicht vollstaendig abgenommenes Deployment muss die API fail-closed stoppen.");
assert.match(deploy, /\.closed-deployment-attestation[\s\S]*single_server_promote_durable_file/u,
  "Ein vollstaendig geprueftes Closed-Deployment muss eine durable revisionsgebundene Attestation erzeugen.");
assert.match(serviceControl, /single_server_assert_running_api_revision[\s\S]*single_server_assert_api_cutover_mode "\$API_CUTOVER_MODE"/u,
  "Der systemd-Startpfad muss Provenienz und Modus innerhalb desselben fail-closed Schritts bestaetigen.");
assert.match(migrationHostImport, /API_CUTOVER_MODE.*closed[\s\S]*single_server_assert_api_cutover_mode closed/u,
  "Import und API-Neustart duerfen nur im geschlossenen Cutover-Modus laufen.");
assert.match(status, /single_server_assert_api_cutover_mode "\$API_CUTOVER_MODE"/u);
assert.match(cutoverModeControl, /single_server_acquire_maintenance_lock "cutover-mode-\$action"/u);
assert.match(cutoverModeControl, /REOPEN API AFTER CODE UPDATE FOR \$SOURCE_REVISION/u);
assert.match(cutoverModeControl, /\.initial-cutover-attestation/u);
assert.match(cutoverModeControl, /\.cutover-closed-attestation/u);
assert.match(cutoverModeControl, /hash-persistence-contract\.mjs/u);
assert.match(cutoverModeControl, /validate-code-reopen-gates\.mjs/u);
assert.doesNotMatch(cutoverModeControl, /durable_unlink "\$initial_attestation"/u,
  "Die unveraenderliche Initial-Attestation darf beim Schliessen oder Recovery nicht entfernt werden.");
assertBefore(cutoverModeControl, 'sync -f "$source"', 'mv -- "$source" "$destination"',
  "Die neue Environment-Datei muss vor dem atomaren Austausch durable geschrieben sein.");
assertBefore(
  cutoverModeControl,
  'single_server_promote_durable_file "$initial_attestation_pending" "$initial_attestation"',
  'restart_api_in_mode "$desired_mode"',
  "Die kanonische Initial-Attestation muss vor dem ersten offenen API-Start durable vorliegen."
);
assert.match(cutoverModeControl, /stop_api_and_assert_stopped\(\)[\s\S]*single_server_compose stop[\s\S]*running_services="\$\(single_server_compose ps --status running --services\)" \|\| return 1[\s\S]*! grep -qx api/u,
  "Ein Cutover-Stopp muss Befehl und tatsaechlichen Containerzustand gemeinsam bestaetigen.");
assert.match(cutoverModeControl, /recover-closed[\s\S]*stop_api_and_assert_stopped[\s\S]*rewrite_environment_mode closed/u,
  "Recovery darf den Hostzustand erst nach einem nachgewiesenen API-Stopp auf closed umschreiben.");
assert.match(cutoverModeControl, /API wurde nachweislich gestoppt, der Recovery-Marker bleibt erhalten/u,
  "Ein fehlgeschlagener Mode-Wechsel ohne bestaetigten Rueckweg muss die API fail-closed stoppen.");
assert.match(cutoverModeControl, /\.cutover-mode-change-pending[\s\S]*restart_api_in_mode "\$desired_mode"/u,
  "Der Mode-Wechsel muss vor jeder API-Mutation einen durable Recovery-Marker setzen.");
assert.match(cutoverModeControl, /restart_api_in_mode\(\)[\s\S]*&& single_server_assert_running_api_revision[\s\S]*&& single_server_assert_api_cutover_mode/u,
  "Alle Runtime-Gates des Mode-Wechsels muessen explizit verkettet sein.");
assert.match(cutoverModeControl, /validate-cutover-open-gates\.mjs" evidence/u);
for (const openAttestationBinding of [
  "schemaVersion=2\\\\nmode=open",
  "authorizedRevision=${revision}",
  "initialCutoverSha256=${initialSha}"
]) {
  assert.ok(common.includes(openAttestationBinding),
    "Die aktuelle Open-Attestation muss Initial-Cutover und laufende Revision getrennt binden.");
}
assert.match(codeReopenGateValidator, /closedAttestationSha256[\s\S]*closedDeploymentAttestationSha256[\s\S]*persistenceContractSha256[\s\S]*backupSnapshotId[\s\S]*restoreResultSha256[\s\S]*identityAuditSha256/u,
  "Code-Reopen muss Close-Zustand, unveraenderten Persistenzvertrag, Zielbackup, Restore und Identity binden.");
for (const persistenceSource of [
  "deploy/single-server/compose.yaml",
  "deploy/single-server/postgres/10-bootstrap.sh",
  "frontend/data/activity-model.js",
  "frontend/data/sector-registry.js"
]) {
  assert.ok(persistenceContractHasher.includes(persistenceSource),
    `Persistenzvertrag muss die sicherheitsrelevante Quelle ${persistenceSource} enthalten.`);
}
assert.match(persistenceContractHasher, /collect\("api"\)/u,
  "Der leichte Reopen-Pfad muss jede Datei des vollstaendigen API-Runtime-Kontexts hashen.");
assert.match(persistenceContractHasher, /collect\([\s\S]*"deploy\/postgres\/pre-gematik"[\s\S]*endsWith\("\.sql"\)/u,
  "Der leichte Reopen-Pfad muss alle SQL-Dateien des PostgreSQL-Vertrags rekursiv hashen.");
assert.match(cutoverOpenGateValidator, /migrationPackageSha256[\s\S]*gkeFreezeStateSha256[\s\S]*backupSnapshotId[\s\S]*restoreResultSha256[\s\S]*identityAuditSha256[\s\S]*bucketInventorySha256[\s\S]*dnsReadbackSha256/u,
  "Open muss an Migration, alten Writer-Freeze, Backup, Restore, Identity, Bucket-Inventur und DNS-Readback gebunden sein.");
assert.match(cutoverIdentityAudit, /single_server_acquire_maintenance_lock cutover-identity-audit[\s\S]*identity-hash/u,
  "Der personenbezogen sensible Identity-Readback muss gesperrt erfolgen und nur seinen Hash ausgeben.");
assert.match(systemdService, /service-control\.sh start/u);
assert.match(systemdService, /service-control\.sh stop/u,
  "Auch systemd-Start und -Stopp muessen dieselbe Wartungssperre wie das Backup respektieren.");
assert.match(systemdService, /ExecStopPost=.*service-control\.sh stop/u,
  "Ein fehlgeschlagener systemd-Post-Start-Check muss den Stack fail-closed stoppen.");
assert.match(common, /const expected = process\.env\.PERMANENT_SERVICES\.split/u);
assert.match(deploy, /single_server_wait_for_permanent_services 24 2 5/u,
  "Deployment muss alle fuenf Dauer-Dienste stabil pruefen.");
assert.match(status, /single_server_permanent_services_ready/u,
  "Status darf sich nicht allein auf Gateway-Antworten verlassen.");
assertBefore(status, "single_server_permanent_services_ready", 'curl --fail --silent',
  "Backend-Container muessen vor den HTTP-Smokes geprueft werden.");
assert.match(preflight, /single_server_compose config --quiet/u);
assert.match(preflight, /docker run --rm[\s\S]*--network none[\s\S]*--read-only[\s\S]*--config=\/etc\/oauth2-proxy\.cfg --config-test/u);
assert.match(preflight, /oauth2_proxy_image="quay\.io\/oauth2-proxy\/oauth2-proxy:v7\.15\.4@sha256:b1b2021fe8f4004573e8d690dec6c7bb29cc44364572cf8510a05bf3a0ae2ded"/u);

assertBefore(backup, 'single_server_compose run --name "$dump_container_name"', 'single_server_compose run --name "$snapshot_container_name"',
  "Ein Backup muss zuerst den konsistenten PostgreSQL-Dump und danach das Offsite-Backup erzeugen.");
assert.match(backup, /single_server_compose run --name "\$snapshot_container_name" --rm --no-deps/u,
  "Der sequenzielle Restic-One-off darf den Dump nicht als zweite Compose-Abhaengigkeit erneut starten.");
assertBefore(backup, "restic-backup", "recovery-escrow.mjs",
  "Ein abgelaufener Recovery-Nachweis darf erst nach dem eigentlichen Offsite-Backup alarmieren.");
assertBefore(backup, "single_server_compose stop -t 40 api", 'single_server_compose run --name "$dump_container_name"',
  "Die einzige App-Schreibgrenze muss vor dem Datenbankdump gestoppt sein.");
assertBefore(backup, "single_server_assert_running_api_revision", "single_server_compose stop -t 40 api",
  "Backup-Metadaten duerfen erst nach exaktem Readback der laufenden API-Revision gebunden werden.");
assert.match(backup, /restic-backup[\s\S]*single_server_compose up -d --no-deps api/u,
  "Die API darf im Hauptpfad erst nach dem gemeinsamen Datenbank-/Objekt-Snapshot wieder schreiben.");
assertBefore(backup, "single_server_compose up -d --no-deps api", '-e RESTIC_RETENTION=1',
  "Retention und Repository-Wartung duerfen erst nach dem stabilen API-Neustart laufen.");
assert.match(backup, /\.backup-api-restart-required/u,
  "Ein API-Stopp fuer Backups muss crash-sicher als Recovery-Pflicht markiert sein.");
assert.match(systemdBackupService, /ExecStopPost=.*recover-api-after-backup\.sh/u,
  "systemd muss die API auch nach einem harten Abbruch des Backups wiederherstellen.");
assert.match(backupRecovery, /sourceRevision=\$SOURCE_REVISION/u);
assert.match(backupRecovery, /operationId=/u);
assertBefore(backupRecovery, "single_server_remove_interrupted_backup_containers", "single_server_compose up -d --no-deps api",
  "Ein unterbrochener Snapshot darf nicht parallel zur wieder gestarteten API weiterlaufen.");
assert.match(backupRecovery, /single_server_wait_for_permanent_services 24 2 5/u);
assertBefore(backupRecovery, "single_server_wait_for_permanent_services", 'single_server_unlink_durable_file "$restart_marker"',
  "Der Recovery-Marker darf erst nach stabilem API-Readback entfernt werden.");
assert.match(status, /single_server_assert_no_maintenance_recovery_markers/u,
  "Der Betriebsstatus muss alle zentral definierten Recovery-Marker fail-closed pruefen.");
for (const recoveryMarker of [
  ".backup-api-restart-required",
  ".backup-repository-recovery-required",
  ".database-import-recovery-required",
  ".cutover-mode-change-pending"
]) {
  assert.match(common, new RegExp(recoveryMarker.replaceAll(".", "\\."), "u"),
    `Zentraler Recovery-Marker fehlt: ${recoveryMarker}`);
}
assert.match(backup, /single_server_acquire_maintenance_lock backup/u,
  "Ein Backupzyklus muss andere mutierende Wartungsschritte hostweit ausschliessen.");
assertBefore(status, "recovery-escrow.mjs", "single_server_compose ps",
  "Der Betriebsstatus muss einen veralteten Recovery-Escrow-Nachweis sichtbar fehlschlagen lassen.");
assert.match(requireService(services, "restic-backup"), /database-dump:[\s\S]*condition: service_completed_successfully/u);
assert.match(requireService(services, "restic-backup"), /^      RESTIC_CACHE_DIR: \/tmp\/restic-cache$/mu,
  "Der read-only Restic-Backupcontainer braucht einen beschreibbaren Cache unter /tmp.");
assert.match(requireService(services, "restic-restore"), /^      RESTIC_CACHE_DIR: \/tmp\/restic-cache$/mu,
  "Der read-only Restic-Restorecontainer braucht einen beschreibbaren Cache unter /tmp.");
assert.match(postgresDump, /then pg_export_snapshot\(\)/u);
assert.match(postgresDump, /pg_dump[\s\S]*--format=custom[\s\S]*--snapshot="\$snapshot_id"/u);
assert.match(postgresDump, /set transaction snapshot :'SNAPSHOT_ID'/u,
  "Dump und Tabellenzaehlungen muessen denselben exportierten Datenbank-Snapshot verwenden.");
assert.match(postgresDump, /pg_try_advisory_xact_lock\(hashtextextended\('versorgungs-kompass:single-server:database-backup-v1'/u,
  "Auch direkte parallele Dump-Container muessen mit einer automatisch freigegebenen DB-Sperre kollidieren.");
assertBefore(postgresDump, "pg_dump \\", "pg_restore --list", "Der Dump muss vor seiner Strukturpruefung entstehen.");
assert.match(postgresDump, /sha256sum "\$pending\/database\.dump" "\$pending\/table-counts\.txt" "\$pending\/manifest\.json"/u);
assert.match(databaseDumpService, /^      SOURCE_REVISION: \$\{SOURCE_REVISION:\?SOURCE_REVISION fehlt\}$/mu);
assert.match(databaseDumpService, /^      PRODUCT_VERSION: \$\{PRODUCT_VERSION:\?PRODUCT_VERSION fehlt\}$/mu);
assert.match(databaseDumpService, /^      BACKUP_OPERATION_ID: \$\{BACKUP_OPERATION_ID:-\}$/mu);
assert.match(postgresDump, /"sourceRevision":"\$\{SOURCE_REVISION\}"/u);
assert.match(postgresDump, /"productVersion":"\$\{PRODUCT_VERSION\}"/u);
assert.match(postgresDump, /awk 'NR > 3'/u, "Drei lokale Datenbank-Snapshot-Generationen muessen erhalten bleiben.");
assert.match(resticBackup, /"\/source\/database\/snapshots\/\$operation_id"/u);
assertBefore(resticBackup, '"/source/database/snapshots/$operation_id"', "/source/object-storage",
  "Das Offsite-Backup muss den exakt operationsgebundenen Datenbanksnapshot und privaten Object Storage gemeinsam sichern.");
assert.doesNotMatch(resticBackup, /restic (?:forget|prune|check)/u,
  "Der API-Stopp darf keine lang laufende Repository-Wartung enthalten.");
assert.match(resticMaintenance, /--keep-daily 14/u);
assert.match(resticMaintenance, /--keep-weekly 8/u);
assert.match(resticMaintenance, /--keep-monthly 6/u);
assert.match(resticMaintenance, /--group-by host/u,
  "Operationgebundene Datenbankpfade duerfen nicht pro Snapshot eine unendliche Retention-Gruppe bilden.");
assert.match(resticMaintenance, /RESTIC_PRUNE:-0/u);
assert.match(resticMaintenance, /RESTIC_CHECK:-0/u);
assert.match(repositoryCheck, /RESTIC_CHECK=1/u,
  "Die gesonderte Repository-Pruefung muss restic check explizit aktivieren.");
assert.match(systemdBackupCheckService, /repository-check\.sh/u);
assert.match(systemdBackupCheckTimer, /OnCalendar=Sun/u);

assertBefore(restoreTest, 'single_server_compose run --name "$restore_container_name"', 'single_server_compose run --name "$database_restore_container_name"',
  "Der Restore-Test muss zuerst den verschluesselten Snapshot wiederherstellen.");
assertBefore(restoreTest, 'single_server_compose run --name "$database_restore_container_name"', 'single_server_compose run --name "$object_restore_container_name"',
  "Nach dem Datenbank-Restore muss der Object Storage verifiziert werden.");
assertBefore(restoreTest, 'single_server_compose run --name "$object_restore_container_name"', 'single_server_unlink_durable_file "$repository_recovery_marker"',
  "Der persistente Recovery-Marker darf erst nach allen gebundenen Restore-Test-Containern geloescht werden.");
assert.match(restoreTest, /RESTORE_TEST_DIR="\$STATE_DIR\/restore-tests\/\$timestamp"/u);
assert.match(restoreTest, /result=success/u);
assertBefore(restoreTest, 'snapshots --json "$RESTORE_SNAPSHOT_ID"', 'single_server_compose run --name "$restore_container_name"',
  "Der exakt ausgewaehlte Restic-Snapshot muss vor dem Restore strukturell validiert werden.");
assert.match(resticRestore, /restic check[\s\S]*restic restore "\$snapshot_id"/u);
assert.match(resticRestore, /test -d "\/restore\/source\/database\/snapshots\/\$backup_operation_id"/u);
assert.match(resticRestore, /test -d \/restore\/source\/object-storage/u);
assert.match(postgresRestoreTest, /sha256sum -c SHA256SUMS/u);
assert.match(postgresRestoreTest, /manifest_revision[\s\S]*EXPECTED_SOURCE_REVISION/u,
  "Restore muss die im Snapshot gebundene Quellrevision mit dem ausgewaehlten Checkout vergleichen.");
assert.match(postgresRestoreTest, /manifest_version[\s\S]*EXPECTED_PRODUCT_VERSION/u);
assert.match(postgresRestoreTest, /pg_restore[\s\S]*--single-transaction/u);
assert.match(postgresRestoreTest, /cmp -s "\$snapshot\/table-counts\.txt" \/tmp\/restored-table-counts\.txt/u);
assert.match(requireService(services, "object-storage-restore-test"), /command: \["node", "api\/verify-object-storage\.mjs"\]/u);
assertBefore(restoreTest, 'single_server_compose run --name "$restore_container_name" --rm --no-deps restic-restore', "chmod 0700",
  "UID-Uebergaben duerfen erst nach dem abgeschlossenen Restic-Restore stattfinden.");
assert.match(restoreTest, /for traversal_directory in "\$restore_root" "\$restore_source_root"; do[\s\S]*chmod 0700/u,
  "Die beiden Restore-Ahnen muessen der gemeinsamen Daten-UID 70 gehoeren und privat bleiben.");
assert.match(restoreTest, /find "\$database_restore_tree" -xdev -exec chown --no-dereference 70:70 \{\} \+/u);
assert.match(restoreTest, /find "\$database_restore_tree" -xdev -type d -exec chmod 0700 \{\} \+/u);
assert.match(restoreTest, /find "\$database_restore_tree" -xdev -type f -exec chmod 0600 \{\} \+/u);
assert.match(restoreTest, /Object-Storage-Restorebaum muss unveraendert UID\/GID 70:70 gehoeren/u);
assertBefore(restoreTest, "chown --no-dereference 70:70", 'single_server_compose run --name "$database_restore_container_name"',
  "Der PostgreSQL-Testcontainer darf erst nach der geprueften UID-Uebergabe starten.");

const validOperationId = "20260911T120000Z-4242";
const validSnapshotId = "a".repeat(64);
const validSnapshot = {
  hostname: "versorgungs-kompass-single-server",
  id: validSnapshotId,
  paths: [`/source/database/snapshots/${validOperationId}`, "/source/object-storage"],
  tags: [
    "versorgungs-kompass",
    "daily",
    `operation-${validOperationId}`,
    `revision-${"b".repeat(40)}`,
    "version-0.1.0"
  ],
  time: "2026-09-11T12:00:00Z"
};
const validateSnapshotFixture = (snapshot) => spawnSync(
  process.execPath,
  [snapshotInventoryFormatterPath, validSnapshotId, "b".repeat(40), "0.1.0"],
  { cwd: projectRoot, encoding: "utf8", input: JSON.stringify([snapshot]) }
);
assert.equal(validateSnapshotFixture(validSnapshot).status, 0);
for (const invalidSnapshot of [
  { ...validSnapshot, hostname: "fremder-host" },
  { ...validSnapshot, paths: [...validSnapshot.paths, "/unerwartet"] },
  { ...validSnapshot, tags: [...validSnapshot.tags, "revision-" + "c".repeat(40)] },
  { ...validSnapshot, tags: [...validSnapshot.tags, "candidate-20260911T120000Z-4242"] }
]) {
  assert.notEqual(validateSnapshotFixture(invalidSnapshot).status, 0,
    "Mehrdeutige Snapshot-Provenienz, falscher Host oder Zusatzpfade muessen fail-closed scheitern.");
}

assert.match(migrationHostImport, /realpath -e -- "\$MIGRATION_DIR"/u,
  "Das Migrationspaket muss ueber einen kanonischen externen Pfad gebunden sein.");
assert.match(migrationHostImport, /MIGRATION_DIR muss genau die sechs freigegebenen Paketdateien enthalten/u);
assert.match(migrationHostImport, /sha256sum -c SHA256SUMS/u);
assert.match(migrationHostImport, /target_revision="\$\(awk[\s\S]*target_revision/u);
assert.match(migrationHostImport, /\[\[ "\$target_revision" == "\$SOURCE_REVISION" \]\]/u,
  "Der Hostwrapper muss die paketgebundene Zielrevision mit dem Ziel-Checkout vergleichen.");
assert.match(migrationHostImport, /expected_confirmation="IMPORT versorgungs_kompass PACKAGE \$MIGRATION_PACKAGE_SHA256"/u);
assert.match(migrationHostImport,
  /\[\[ "\$confirmation" == "\$expected_confirmation" \]\][\s\S]*single_server_promote_durable_file "\$pending_marker" "\$import_marker"[\s\S]*single_server_compose stop -t 40 api[\s\S]*single_server_compose run --name "\$import_container_name" --rm --no-deps database-import[\s\S]*start_api_after_import_readback/u,
  "Bestaetigung, persistenter Recovery-Marker, API-Stopp, Import und API-Neustart muessen in dieser Reihenfolge erfolgen.");

assert.match(migrationContainerImport, /source_deployed_revision/u,
  "Das Paket muss die echte Quell-Live-Revision getrennt als Provenienz erhalten.");
assert.match(migrationContainerImport, /metadata_target_revision[\s\S]*TARGET_SOURCE_REVISION/u,
  "Der Importcontainer muss target_revision mit der laufenden Zielrevision vergleichen.");
assertBefore(migrationContainerImport, "pg_restore --list", "cmp -s /migration/database.toc",
  "Der Dump-TOC muss neu erzeugt und vor Verwendung bytegenau verglichen werden.");
assert.match(migrationContainerImport, /TABLE DATA public[\s\S]*SEQUENCE SET public/u);
assert.match(migrationContainerImport, /Ziel-Datenbank ist nicht leer/u);
assert.match(migrationContainerImport, /pg_restore[\s\S]*--single-transaction[\s\S]*--data-only[\s\S]*--use-list=\/migration\/database\.toc/u);
assert.match(migrationContainerImport, /cmp -s \/migration\/row-counts\.tsv \/tmp\/imported-row-counts\.tsv/u);
assert.match(migrationContainerImport, /Objektreferenzmanifest muss fuer alle vier GCS-Datenbereiche exakt null ausweisen/u);
assert.match(migrationGuide, /bewusst kein GCS-Importer enthalten/u,
  "Ohne erneut bestaetigte Nullbestaende darf kein impliziter GCS-Import behauptet werden.");
assert.match(migrationExport, /source_service='service=versorgungs-kompass-source'/u,
  "Der Quellexport muss libpq ueber einen festen Servicenamen statt ueber einen DSN im Prozessargument verbinden.");
assert.doesNotMatch(migrationExport, /VK_MIGRATION_SOURCE_DSN/u,
  "Der Quellexport darf keinen expandierten Datenbank-DSN in Prozessargumente uebergeben.");
assert.match(migrationExport, /PGSERVICEFILE="\$PGSERVICE_FILE"/u);
assert.match(migrationExport, /PGPASSFILE="\$PGPASS_FILE"/u);
assert.match(migrationExport, /SOURCE_TARGET_FILE="\$LIBPQ_DIR\/source-target\.conf"/u);
assert.match(migrationExport, /gcloud sql instances describe "\$CLOUD_SQL_INSTANCE_NAME"/u);
assert.match(migrationExport, /input\.connectionName !== process\.env\.CLOUD_SQL_INSTANCE_CONNECTION_NAME/u,
  "Der Export muss seine konkrete produktive Cloud-SQL-Instanz unabhaengig read-only bestaetigen.");
assert.match(migrationExport, /CLOUD_SQL_SOCKET_DIR="\/cloudsql\/\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/u);
assert.match(migrationExport, /stat_uid "\$libpq_file"/u,
  "Service- und Passwortdatei muessen dem ausfuehrenden Administratorkonto gehoeren.");
assert.match(migrationExport, /stat_mode "\$libpq_file"/u,
  "Service- und Passwortdatei muessen owner-only berechtigt sein.");
assert.match(migrationExport, /assert_disjoint_paths EXPORT_DIR "\$EXPORT_DIR" PROJECT_ROOT "\$PROJECT_ROOT"/u);
assert.match(migrationExport, /assert_disjoint_paths EXPORT_DIR "\$EXPORT_DIR" LIBPQ_DIR "\$LIBPQ_DIR"/u);
assert.match(migrationExport, /mkdir -m 0700 -- "\$EXPORT_DIR"/u);
assert.match(migrationExport, /\[\[ "\$#" -eq 5 \]\]/u,
  "Der Export muss GKE-Freeze-Konfiguration und globalen Writer-Nachweis explizit erhalten.");
assert.match(migrationExport, /"\$GKE_FREEZE_OPERATOR" freeze --config "\$GKE_FREEZE_CONFIG" --readback/u);
assert.match(migrationExport, /OTHER_NAMESPACES_DB_WRITERS[\s\S]*EXTERNAL_DB_WRITERS/u,
  "Der Namespace-Operator muss durch einen aktuellen globalen Writer-Nachweis ergaenzt werden.");
assert.match(migrationExport, /NR == 2 \{ if \(\$0 != "host=" expected_host\) exit 1; next \}/u,
  "Der libpq-Service muss jede Zielzeile vollstaendig und ohne mehrdeutige Zusatzwerte pruefen.");
assert.equal((migrationExport.match(/^validate_global_writer_attestation$/gmu) || []).length, 2,
  "Der globale Writer-Nachweis muss vor und nach dem gemeinsamen Snapshot unveraendert und aktuell sein.");
assert.match(migrationExport, /assert_other_database_clients 0[\s\S]*pg_export_snapshot\(\)[\s\S]*assert_other_database_clients 1/u,
  "Cloud-SQL muss vor dem Snapshot exklusiv und vor dessen Freigabe nur mit dem gebundenen Snapshot-Halter belegt sein.");
assert.match(migrationExport, /pg_catalog\.pg_stat_activity[\s\S]*application_name = :'EXPECTED_APPLICATION_NAME'/u);
assert.match(migrationExport, /select pg_export_snapshot\(\)/u);
assert.match(migrationExport, /pg_dump[\s\S]*--snapshot="\$DATABASE_SNAPSHOT_ID"/u);
assert.equal((migrationExport.match(/set transaction snapshot :'SNAPSHOT_ID';/gu) || []).length, 2,
  "Tabellen- und Objektreferenzzaehlungen muessen denselben exportierten DB-Snapshot wie pg_dump verwenden.");
assert.match(migrationExport,
  /IFS=\$'\\t' read -r GKE_FREEZE_STATE_FILE GKE_FREEZE_STATE_SHA256[\s\S]*run_libpq "\$PG_DUMP_BIN"[\s\S]*storage-reference-counts\.tsv[\s\S]*GKE_FREEZE_STATE_FILE_AFTER[\s\S]*read_frozen_writer_evidence/u,
  "Frozen-State und Namespace-Inventar muessen direkt vor und nach dem atomaren Export identisch gelesen werden.");
assert.match(migrationExport, /format_version\\t2/u);
assert.match(migrationHostImport, /format_version" \|\| \$2 != "2"/u);
assert.match(migrationContainerImport, /format_version" \|\| \$2 != "2"/u);
assert.match(migrationGuide, /export-database\.sh/u);

assert.match(identityProvisionService, /^    network_mode: none$/mu);
assert.match(identityProvisionService, /target: \/run\/identity\/provision\.json[\s\S]*create_host_path: false/u,
  "Die sensible Identity-Eingabe darf vom Containerlauf nicht implizit angelegt werden.");
assert.match(identityProvisionHost, /IDENTITY_PROVISION_FILE="\$CONFIG_DIR\/identity-provision\.json"/u);
assert.match(identityProvisionHost, /IDENTITY_APPROVAL_TOKEN_HOST_FILE="\$CONFIG_DIR\/identity-approval-token"/u);
assert.match(identityProvisionHost, /requested_action.*PREVIEW/u);
assert.match(identityProvisionHost, /literalen zweiten Argument APPLY/u);
assert.doesNotMatch(identityProvisionHost, /EXAKTE_BESTAETIGUNG|applyConfirmation/u,
  "Personenbezogen ableitbare Fingerprints duerfen nicht in argv oder Shell-History erscheinen.");
assertBefore(identityProvisionHost, "IDENTITY_PROVISION_MODE=preview", "IDENTITY_PROVISION_MODE=apply",
  "Identity-Provisionierung muss Preview vor Apply erzwingen.");
assert.match(identityBootstrap, /createHmac\("sha256"/u);
assert.match(identityBootstrap, /IDENTITY_BOOTSTRAP_CLAIM_TTL_SECONDS = 15 \* 60/u);
assert.match(identityProvision, /verifyIdentityBootstrapClaim/u,
  "Subject und E-Mail duerfen nur aus dem signierten kurzlebigen Bootstrap-Claim stammen.");
assert.match(identityProvision, /Profil-E-Mail und signierter Google-Claim stimmen nicht exakt/u);
assert.match(identityProvision, /alte IAP-Bindung ist mehrdeutig oder besitzt einen anderen Scope/u,
  "Migrierte test_only-Bindungen duerfen nicht implizit zu standard hochgestuft werden.");
assert.match(identityProvision, /begin isolation level serializable/u);
assert.match(identityProvision, /pg_advisory_xact_lock/u);
assert.match(identityProvision, /deactivate-iap-on-target/u);
assert.doesNotMatch(identityProvision, /persistedStateFingerprint/u);
assert.match(identityProvision, /profile\.display_name === input\.profile\.displayName/u,
  "Der Readback muss alle Profilfelder exakt mit der bestaetigten Eingabe vergleichen.");
assert.doesNotMatch(identityProvision, /emailSha256|subjectSha256/u,
  "Einzelhashes von E-Mail oder stabilem Subject duerfen nicht protokolliert werden.");

assert.match(preflight, /recovery-escrow\.mjs" verify "\$CONFIG_DIR"/u,
  "Live-Preflight muss einen aktuellen Recovery-Escrow-Nachweis erzwingen.");
assert.match(recoveryEscrow, /MAX_ATTESTATION_AGE_MS = 31 \* 24 \* 60 \* 60 \* 1000/u);
assert.match(recoveryEscrow, /storedOffHost !== true/u);
assert.match(recoveryEscrow, /separateFromResticRepository !== true/u);
assert.match(recoveryEscrow, /recoveryAccessTested !== true/u);
assert.match(recoveryEscrow, /metadata\.uid !== 70.*metadata\.gid !== 70.*0o600/su,
  "Kontinuierliche Recovery-Pruefung muss auch Owner und Modus der aktiven Restic-Dateien absichern.");
assert.match(recoveryCopy, /cmp -s "\$target" "\$CONFIG_DIR\/\$name"/u);
assert.match(recoveryCopy, /restic cat config[\s\S]*restic snapshots/u);
assertBefore(recoveryCopy, "restic cat config", "record-after-tested-retrieval",
  "Escrow-Nachweis darf erst nach echtem Zugriff mit der frisch abgerufenen Kopie entstehen.");
assertBefore(recoveryCopy, 'unlink -- "$retrieved_directory/$name"', "record-after-tested-retrieval",
  "Der Escrow-Nachweis darf erst nach vollstaendiger Entfernung der frisch abgerufenen lokalen Schluesselkopie entstehen.");

assert.match(objectStorage, /path\.join\(root, "deleted", "v1", normalizedArea/u,
  "Geloeschte private Objekte muessen in eine getrennte Quarantaene verschoben werden.");
assertBefore(objectStorage, "const tombstone = path.join(", "await rename(paths.objectRoot, tombstone);",
  "Quarantaene muss ueber ein atomisches Verschieben des aktiven Objekts erfolgen.");
assert.match(objectStorage, /Object-Storage-Quarantaeneverzeichnis ist nicht freigegeben/u);

const shellScripts = filesRecursively(singleServerRoot)
  .filter((file) => file.endsWith(".sh"))
  .sort();
assert.ok(shellScripts.length >= 10, "Die erwarteten Einzelserver-Betriebsscripts fehlen.");
for (const file of shellScripts) {
  const relative = path.relative(projectRoot, file);
  const mode = statSync(file).mode & 0o777;
  assert.notEqual(mode & 0o111, 0, `${relative} muss ausfuehrbar sein (aktuell ${mode.toString(8)}).`);
  const source = readFileSync(file, "utf8");
  const firstLine = source.split(/\r?\n/u, 1)[0];
  const interpreter = firstLine === "#!/bin/sh" ? "sh" : firstLine === "#!/usr/bin/env bash" ? "bash" : "";
  assert.ok(interpreter, `${relative} muss einen freigegebenen sh- oder bash-Shebang besitzen.`);
  const syntax = spawnSync(interpreter, ["-n", file], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  assert.equal(syntax.error, undefined, `${relative} konnte nicht mit ${interpreter} geprueft werden.`);
  assert.equal(syntax.status, 0, `${relative} ist syntaktisch ungueltig:\n${syntax.stderr || syntax.stdout}`);
}

console.log("Single-server contract test OK: Exposition, Pins, DB-Socket, Auth, Upload-Stopp, Logging, Backups, Restore und Quarantaene sind abgesichert.");
