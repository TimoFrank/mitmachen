import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Pool } from "pg";

const projectRoot = new URL("../", import.meta.url);
const apiSource = readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const configStart = apiSource.indexOf("const DB_SSL_MODES");
const configEnd = apiSource.indexOf("\nfunction getPool(", configStart);
assert.ok(configStart >= 0 && configEnd > configStart, "Postgres-Runtime-Konfiguration wurde nicht gefunden.");

const tlsFiles = new Map([
  ["/run/secrets/postgres/server-ca.pem", "TEST SERVER CA"],
  ["/run/secrets/postgres/client-cert.pem", "TEST CLIENT CERT"],
  ["/run/secrets/postgres/client-key.pem", "TEST CLIENT KEY"]
]);
const sandbox = {
  URL,
  DEFAULT_DB_NAME: "versorgungs_kompass",
  DEFAULT_DB_USER: "vk_app",
  checkServerIdentity(hostname) {
    return hostname === "postgres.internal.example" ? undefined : new Error(`Falscher Hostname: ${hostname}`);
  },
  readFileSync(filePath) {
    if (!tlsFiles.has(filePath)) throw new Error(`ENOENT: ${filePath}`);
    return tlsFiles.get(filePath);
  }
};
vm.runInNewContext([
  apiSource.slice(configStart, configEnd),
  "globalThis.buildPostgresPoolConfigForTest = buildPostgresPoolConfig;"
].join("\n"), sandbox, { filename: "postgres-runtime-config.js" });

const buildConfig = sandbox.buildPostgresPoolConfigForTest;

const plain = buildConfig({
  DB_HOST: "127.0.0.1",
  DB_NAME: "local_db",
  DB_USER: "local_user",
  DB_PASSWORD: "local-password"
});
assert.equal(plain.host, "127.0.0.1");
assert.equal(plain.database, "local_db");
assert.equal(plain.user, "local_user");
assert.equal(plain.password, "local-password");
assert.equal("ssl" in plain, false, "Lokale Entwicklung bleibt ohne implizites TLS nutzbar.");

const legacyTls = buildConfig({ DB_HOST: "legacy-db.example", DB_SSL: "1" });
assert.equal(legacyTls.ssl.rejectUnauthorized, false, "DB_SSL=1 bleibt rueckwaertskompatibel.");

const explicitlyDisabled = buildConfig({
  DB_HOST: "localhost",
  DB_SSL: "0",
  PGSSLMODE: "verify-full"
});
assert.equal(explicitlyDisabled.ssl, false, "DB_SSL muss vor PGSSLMODE Vorrang haben.");

const verified = buildConfig({
  DB_HOST: "postgres.internal.example",
  DB_SSL_MODE: "verify-full",
  DB_SSL_CA_FILE: "/run/secrets/postgres/server-ca.pem",
  DB_SSL_CERT_FILE: "/run/secrets/postgres/client-cert.pem",
  DB_SSL_KEY_FILE: "/run/secrets/postgres/client-key.pem",
  DB_SSL_SERVERNAME: "postgres.internal.example"
});
assert.equal(verified.ssl.rejectUnauthorized, true);
assert.equal(verified.ssl.ca, "TEST SERVER CA");
assert.equal(verified.ssl.cert, "TEST CLIENT CERT");
assert.equal(verified.ssl.key, "TEST CLIENT KEY");
assert.equal(verified.ssl.servername, "postgres.internal.example");
assert.equal(typeof verified.ssl.checkServerIdentity, "function");
assert.equal(verified.ssl.checkServerIdentity("vom-pg-treiber-ueberschrieben", {}), undefined);

const verifyCa = buildConfig({
  DB_HOST: "10.0.0.8",
  DB_SSL_MODE: "verify-ca",
  DB_SSL_CA: "INLINE TEST CA"
});
assert.equal(verifyCa.ssl.rejectUnauthorized, true);
assert.equal(verifyCa.ssl.ca, "INLINE TEST CA");
assert.equal(typeof verifyCa.ssl.checkServerIdentity, "function");

const urlWithEnvironmentTls = buildConfig({
  DATABASE_URL: "postgres://vk_app:secret@postgres.example/versorgungs_kompass",
  DB_SSL_MODE: "verify-full",
  DB_SSL_CA_FILE: "/run/secrets/postgres/server-ca.pem"
});
assert.equal(urlWithEnvironmentTls.connectionString.includes("postgres.example"), true);
assert.equal(urlWithEnvironmentTls.ssl.rejectUnauthorized, true);
assert.equal(urlWithEnvironmentTls.ssl.ca, "TEST SERVER CA");
const driverPool = new Pool(urlWithEnvironmentTls);
assert.equal(driverPool.options.ssl.rejectUnauthorized, true, "node-postgres muss die TLS-Pruefung uebernehmen.");
assert.equal(driverPool.options.ssl.ca, "TEST SERVER CA", "node-postgres muss die konfigurierte CA uebernehmen.");
await driverPool.end();

const urlControlledTls = buildConfig({
  DATABASE_URL: "postgres://vk_app:secret@postgres.example/versorgungs_kompass?sslmode=verify-full&sslrootcert=%2Frun%2Fsecrets%2Fpostgres%2Fserver-ca.pem"
});
assert.equal("ssl" in urlControlledTls, false, "TLS-Parameter in DATABASE_URL werden an node-postgres durchgereicht.");

assert.throws(() => buildConfig({
  NODE_ENV: "production",
  DB_HOST: "postgres.internal.example",
  DB_SSL_MODE: "verify-ca",
  DB_SSL_CA: "TEST SERVER CA"
}), /verify-full/i, "Produktion muss neben der CA auch den Hostnamen pruefen.");
assert.throws(() => buildConfig({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://vk_app:secret@postgres.example/versorgungs_kompass?sslmode=verify-ca"
}), /verify-full/i, "Auch DATABASE_URL darf in Produktion nicht bei verify-ca stehen bleiben.");
assert.doesNotThrow(() => buildConfig({
  NODE_ENV: "production",
  DB_HOST: "127.0.0.1",
  DB_SSL_MODE: "disable",
  DB_PASSWORD: "local-proxy-password"
}), "Ein lokaler Cloud-SQL-Proxy ist die dokumentierte mTLS-Ausnahme.");
assert.throws(() => buildConfig({
  NODE_ENV: "production",
  DB_HOST: "127.0.0.1",
  DB_SSL_MODE: "disable"
}), /Zugangsdaten/i, "Produktion darf nicht mit leerem DB-Passwort starten.");

assert.throws(() => buildConfig({
  DATABASE_URL: "postgres://vk_app:secret@postgres.example/versorgungs_kompass?sslmode=verify-full",
  DB_SSL: "1"
}), /nicht gleichzeitig/i);
assert.throws(() => buildConfig({
  DATABASE_URL: "postgres://vk_app:secret@postgres.example/versorgungs_kompass?sslmode=verify-full",
  PGSSLROOTCERT: "/run/secrets/postgres/server-ca.pem"
}), /nicht gleichzeitig/i);
assert.throws(() => buildConfig({
  DB_HOST: "postgres.example",
  DB_SSL_MODE: "verify-ca"
}), /benoetigt DB_SSL_CA/i);
assert.throws(() => buildConfig({
  DB_HOST: "postgres.example",
  DB_SSL_MODE: "verify-full",
  DB_SSL_CERT: "CERT WITHOUT KEY"
}), /gemeinsam konfiguriert/i);
assert.throws(() => buildConfig({
  DB_HOST: "postgres.example",
  DB_SSL_MODE: "disable",
  DB_SSL_CA: "UNUSED CA"
}), /obwohl der TLS-Modus disable ist/i);
assert.throws(() => buildConfig({
  DB_HOST: "postgres.example",
  DB_SSL_MODE: "insecure-maybe"
}), /Ungueltiger Postgres-TLS-Modus/i);
assert.throws(() => buildConfig({}), (error) => error.status === 500 && /Postgres-Verbindung fehlt/i.test(error.message));

const dockerfile = readFileSync(new URL("api/Dockerfile", projectRoot), "utf8");
const dockerignore = readFileSync(new URL(".dockerignore", projectRoot), "utf8");
const apiPackage = JSON.parse(readFileSync(new URL("api/package.json", projectRoot), "utf8"));
assert.deepEqual(
  Object.keys(apiPackage.dependencies || {}),
  ["pg"],
  "Das API-Image darf keine unnoetigen Browser-, PDF- oder Office-Abhaengigkeiten installieren."
);
assert.equal(apiPackage.dependencies.pg, "8.21.0", "Die API-Laufzeitabhaengigkeit muss exakt gepinnt sein.");
assert.match(dockerfile, /COPY api\/package\.json api\/package-lock\.json \.\//);
assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
assert.match(dockerfile, /COPY frontend\/data\/activity-model\.js \.\/frontend\/data\/activity-model\.js/);
assert.match(dockerfile, /COPY frontend\/data\/sector-registry\.js \.\/frontend\/data\/sector-registry\.js/);
assert.match(dockerfile, /ENV NODE_ENV=production[\s\\]+PORT=8080/);
assert.match(dockerfile, /\nUSER node\n/);
assert.match(dockerignore, /!frontend\/data\/activity-model\.js/);
assert.match(dockerignore, /!frontend\/data\/sector-registry\.js/);

console.log("API Runtime Config Test OK: Containerinhalt, Non-Root-Start und Postgres-TLS-Modi sind abgesichert.");
