import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "pg";

export const CLEANUP_IMPORT_RUN_ID = "hospitation-staging-9748a7ea68cf3d698eddee0ab17d9eb0c934a236";
export const CLEANUP_DATABASE_NAME = "versorgungs_kompass";
export const CLEANUP_APPLY_ENV = "HOSPITATION_CLEANUP_ALLOW_APPLY";

const cleanupSqlUrl = new URL("./cleanup_hospitation_import_duplicates_20260722.sql", import.meta.url);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DISABLED_SSL_VALUES = new Set(["", "0", "false", "disable", "disabled", "off", "no"]);

function runnerError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function booleanMetaExpression(expression, variables) {
  const normalized = String(expression || "").trim();
  const defined = /^:\{\?([a-z_][a-z0-9_]*)\}$/iu.exec(normalized);
  if (defined) return variables.has(defined[1]);
  const variable = /^:([a-z_][a-z0-9_]*)$/iu.exec(normalized);
  if (variable) return variables.get(variable[1]) === true;
  if (["true", "on", "1"].includes(normalized.toLowerCase())) return true;
  if (["false", "off", "0"].includes(normalized.toLowerCase())) return false;
  throw runnerError(`Nicht unterstuetzte psql-Bedingung im Cleanup-SQL: ${normalized}`, "CLEANUP_SQL_META_UNSUPPORTED");
}

function sqlWithoutComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*--.*$/gmu, "");
}

function assertExactlyOne(source, pattern, message) {
  const matches = source.match(pattern) || [];
  assert.equal(matches.length, 1, message);
}

export function preprocessCleanupSql(source, { apply = false } = {}) {
  const variables = new Map([["apply_cleanup", Boolean(apply)]]);
  const frames = [];
  let active = true;
  const output = [];

  for (const [lineIndex, line] of String(source || "").split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    const ifMatch = /^\\if\s+(.+)$/u.exec(trimmed);
    if (ifMatch) {
      const condition = booleanMetaExpression(ifMatch[1], variables);
      frames.push({ parentActive: active, condition, sawElse: false, line: lineIndex + 1 });
      active = active && condition;
      continue;
    }

    if (/^\\else$/u.test(trimmed)) {
      const frame = frames.at(-1);
      if (!frame || frame.sawElse) {
        throw runnerError(`Ungueltiges \\else in Cleanup-SQL-Zeile ${lineIndex + 1}.`, "CLEANUP_SQL_META_INVALID");
      }
      frame.sawElse = true;
      active = frame.parentActive && !frame.condition;
      continue;
    }

    if (/^\\endif$/u.test(trimmed)) {
      const frame = frames.pop();
      if (!frame) {
        throw runnerError(`Ungueltiges \\endif in Cleanup-SQL-Zeile ${lineIndex + 1}.`, "CLEANUP_SQL_META_INVALID");
      }
      active = frame.parentActive;
      continue;
    }

    if (trimmed.startsWith("\\")) {
      if (/^\\(?:set|pset|echo)\b/u.test(trimmed)) continue;
      throw runnerError(`Nicht unterstuetztes psql-Metakommando in Cleanup-SQL-Zeile ${lineIndex + 1}.`, "CLEANUP_SQL_META_UNSUPPORTED");
    }

    if (active) output.push(line);
  }

  if (frames.length) {
    throw runnerError(`Nicht abgeschlossenes \\if ab Cleanup-SQL-Zeile ${frames.at(-1).line}.`, "CLEANUP_SQL_META_INVALID");
  }

  const sql = output.join("\n").trim();
  if (!sql) throw runnerError("Das vorverarbeitete Cleanup-SQL ist leer.", "CLEANUP_SQL_EMPTY");
  if (/^\s*\\/mu.test(sql)) {
    throw runnerError("Das vorverarbeitete Cleanup-SQL enthaelt noch psql-Metakommandos.", "CLEANUP_SQL_META_REMAINS");
  }

  const executable = sqlWithoutComments(sql);
  assertExactlyOne(
    executable,
    /\bbegin\s+isolation\s+level\s+serializable\s*;/giu,
    "Cleanup-SQL muss exakt eine serielle Transaktion beginnen."
  );
  assert.match(executable, new RegExp(CLEANUP_IMPORT_RUN_ID.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

  if (apply) {
    assertExactlyOne(executable, /\bcommit\s*;/giu, "Apply-SQL muss exakt einen COMMIT enthalten.");
    assert.doesNotMatch(executable, /\brollback\s*;/iu, "Apply-SQL darf keinen ROLLBACK-Zweig enthalten.");
    assert.match(executable, /delete\s+from\s+public\.hospitations/iu);
    assert.match(executable, /delete\s+from\s+public\.contacts/iu);
    assert.match(executable, /delete\s+from\s+public\.organizations/iu);
    assert.match(executable, /pg_advisory_xact_lock/iu);
  } else {
    assertExactlyOne(executable, /\brollback\s*;/giu, "Dry-run-SQL muss exakt einen ROLLBACK enthalten.");
    assert.doesNotMatch(executable, /\bcommit\s*;/iu, "Dry-run-SQL darf keinen COMMIT enthalten.");
    assert.doesNotMatch(executable, /\b(?:update|delete\s+from|merge\s+into|truncate)\b/iu,
      "Dry-run-SQL darf keine bestaendigen Daten aendern oder loeschen.");
    assert.doesNotMatch(executable, /\binsert\s+into\s+(?!_cleanup_)/iu,
      "Dry-run-SQL darf nur seine transaktionalen Temporaertabellen befuellen.");
    assert.doesNotMatch(executable, /\bcreate\s+(?!temporary\s+table\s+_cleanup_)/iu,
      "Dry-run-SQL darf nur benannte Cleanup-Temporaertabellen anlegen.");
    assert.doesNotMatch(executable, /\b(?:alter|drop)\s+(?:table|schema|function|role)\b/iu,
      "Dry-run-SQL darf keine Datenbankobjekte veraendern.");
    assert.doesNotMatch(executable, /pg_advisory_xact_lock/iu,
      "Dry-run-SQL darf keinen exklusiven Cleanup-Lock anfordern.");
  }

  return sql;
}

export function parseCleanupRunnerArguments(argv = []) {
  let apply = false;
  let confirm = "";
  let help = false;

  for (const argument of argv) {
    if (argument === "--apply") {
      if (apply) throw runnerError("--apply darf nur einmal angegeben werden.", "CLEANUP_ARGUMENT_DUPLICATE");
      apply = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument.startsWith("--confirm=")) {
      if (confirm) throw runnerError("--confirm darf nur einmal angegeben werden.", "CLEANUP_ARGUMENT_DUPLICATE");
      confirm = argument.slice("--confirm=".length);
      continue;
    }
    throw runnerError(`Unbekanntes Argument: ${argument}`, "CLEANUP_ARGUMENT_UNKNOWN");
  }

  if (!apply && confirm) {
    throw runnerError("--confirm ist nur gemeinsam mit --apply erlaubt.", "CLEANUP_CONFIRM_WITHOUT_APPLY");
  }
  if (apply && confirm !== CLEANUP_IMPORT_RUN_ID) {
    throw runnerError(
      `Apply verlangt --confirm=${CLEANUP_IMPORT_RUN_ID}.`,
      "CLEANUP_CONFIRMATION_MISMATCH"
    );
  }
  return Object.freeze({ apply, confirm, help });
}

function requiredEnvironmentValue(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw runnerError(`Erforderliche Datenbankkonfiguration fehlt: ${name}.`, "CLEANUP_DB_CONFIG_MISSING");
  return value;
}

export function cleanupDatabaseConfig(env = process.env) {
  if (String(env.DATABASE_URL || "").trim()) {
    throw runnerError("Der Cleanup-Runner akzeptiert absichtlich nur getrennte DB_*-Variablen.", "CLEANUP_DATABASE_URL_FORBIDDEN");
  }
  const host = requiredEnvironmentValue(env, "DB_HOST").toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw runnerError("Der Cleanup-Runner darf nur ueber einen lokalen Cloud-SQL-Proxy zugreifen.", "CLEANUP_DB_NOT_LOOPBACK");
  }
  const port = Number(env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw runnerError("DB_PORT ist ungueltig.", "CLEANUP_DB_PORT_INVALID");
  }
  const sslValue = String(env.DB_SSL || "").trim().toLowerCase();
  if (!DISABLED_SSL_VALUES.has(sslValue)) {
    throw runnerError("Die Loopback-Verbindung muss DB_SSL=disable/false verwenden.", "CLEANUP_DB_SSL_INVALID");
  }
  return Object.freeze({
    host,
    port,
    database: requiredEnvironmentValue(env, "DB_NAME"),
    user: requiredEnvironmentValue(env, "DB_USER"),
    password: requiredEnvironmentValue(env, "DB_PASSWORD"),
    ssl: false,
    application_name: "vk-hospitation-duplicate-cleanup",
    connectionTimeoutMillis: 5000,
    query_timeout: 180000,
    statement_timeout: 180000,
    keepAlive: true
  });
}

export function assertCleanupApplySafety({ options, env = process.env, databaseConfig }) {
  if (!options.apply) return;
  if (options.confirm !== CLEANUP_IMPORT_RUN_ID) {
    throw runnerError("Apply-Bestaetigung stimmt nicht mit dem Importlauf ueberein.", "CLEANUP_CONFIRMATION_MISMATCH");
  }
  if (String(env[CLEANUP_APPLY_ENV] || "").trim() !== CLEANUP_IMPORT_RUN_ID) {
    throw runnerError(
      `${CLEANUP_APPLY_ENV} muss fuer Apply exakt auf die bestaetigte Importlauf-ID gesetzt sein.`,
      "CLEANUP_APPLY_ENV_MISSING"
    );
  }
  if (String(env.NODE_ENV || "").trim().toLowerCase() !== "production") {
    throw runnerError("Apply ist nur mit NODE_ENV=production erlaubt.", "CLEANUP_NOT_PRODUCTION_ENV");
  }
  if (!LOOPBACK_HOSTS.has(String(databaseConfig.host || "").toLowerCase())) {
    throw runnerError("Apply darf nur ueber den lokalen Cloud-SQL-Proxy laufen.", "CLEANUP_DB_NOT_LOOPBACK");
  }
  if (databaseConfig.database !== CLEANUP_DATABASE_NAME) {
    throw runnerError(`Apply ist nur fuer die Datenbank ${CLEANUP_DATABASE_NAME} erlaubt.`, "CLEANUP_DATABASE_MISMATCH");
  }
}

function usage() {
  return [
    "Hospitations-Dubletten-Cleanup (Default: Dry-run)",
    "",
    "Dry-run:",
    "  node scripts/run_hospitation_import_duplicate_cleanup.mjs",
    "",
    "Apply (nur nach Backup und erfolgreichem Dry-run):",
    `  ${CLEANUP_APPLY_ENV}=${CLEANUP_IMPORT_RUN_ID} node scripts/run_hospitation_import_duplicate_cleanup.mjs --apply --confirm=${CLEANUP_IMPORT_RUN_ID}`,
    "",
    "Die Verbindung wird ausschliesslich aus DB_HOST, DB_PORT, DB_NAME, DB_USER,",
    "DB_PASSWORD und DB_SSL gelesen. Zugangsdaten werden nie ausgegeben."
  ].join("\n");
}

export async function runCleanup({ argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseCleanupRunnerArguments(argv);
  if (options.help) {
    return { mode: "help", message: usage() };
  }

  const databaseConfig = cleanupDatabaseConfig(env);
  assertCleanupApplySafety({ options, env, databaseConfig });
  const source = readFileSync(cleanupSqlUrl, "utf8");
  const sql = preprocessCleanupSql(source, { apply: options.apply });
  const client = new Client(databaseConfig);

  try {
    await client.connect();
    await client.query(sql);
    return {
      mode: options.apply ? "apply" : "dry-run",
      message: options.apply
        ? "Cleanup erfolgreich committed. Alle SQL-Postflight-Assertions sind bestanden."
        : "Dry-run erfolgreich. Alle SQL-Preflight-Assertions sind bestanden; die Transaktion wurde zurueckgerollt."
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]));
if (isMain) {
  runCleanup()
    .then((result) => {
      process.stdout.write(`${result.message}\n`);
    })
    .catch((error) => {
      const code = String(error?.code || "CLEANUP_FAILED").replace(/[^A-Z0-9_]/gu, "_");
      process.stderr.write(`Cleanup abgebrochen [${code}]: ${String(error?.message || "Unbekannter Fehler")}\n`);
      process.exitCode = 1;
    });
}
