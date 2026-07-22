import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLEANUP_APPLY_ENV,
  CLEANUP_DATABASE_NAME,
  CLEANUP_IMPORT_RUN_ID,
  assertCleanupApplySafety,
  cleanupDatabaseConfig,
  parseCleanupRunnerArguments,
  preprocessCleanupSql
} from "./run_hospitation_import_duplicate_cleanup.mjs";

const source = readFileSync(
  new URL("./cleanup_hospitation_import_duplicates_20260722.sql", import.meta.url),
  "utf8"
);

const dryRunSql = preprocessCleanupSql(source, { apply: false });
assert.match(dryRunSql, /begin isolation level serializable/iu);
assert.match(dryRunSql, /rollback\s*;/iu);
assert.doesNotMatch(dryRunSql, /delete from public\./iu);
assert.doesNotMatch(dryRunSql, /^\s*\\/mu);

const applySql = preprocessCleanupSql(source, { apply: true });
assert.match(applySql, /pg_advisory_xact_lock/iu);
assert.match(applySql, /delete from public\.contacts/iu);
assert.match(applySql, /delete from public\.hospitations/iu);
assert.match(applySql, /delete from public\.organizations/iu);
assert.match(applySql, /commit\s*;/iu);
assert.doesNotMatch(applySql, /rollback\s*;/iu);
assert.doesNotMatch(applySql, /^\s*\\/mu);

assert.deepEqual(parseCleanupRunnerArguments([]), {
  apply: false,
  confirm: "",
  help: false
});
assert.deepEqual(parseCleanupRunnerArguments([
  "--apply",
  `--confirm=${CLEANUP_IMPORT_RUN_ID}`
]), {
  apply: true,
  confirm: CLEANUP_IMPORT_RUN_ID,
  help: false
});
assert.throws(
  () => parseCleanupRunnerArguments(["--apply", "--confirm=falscher-importlauf"]),
  (error) => error.code === "CLEANUP_CONFIRMATION_MISMATCH"
);
assert.throws(
  () => parseCleanupRunnerArguments(["--confirm=x"]),
  (error) => error.code === "CLEANUP_CONFIRM_WITHOUT_APPLY"
);
assert.throws(
  () => parseCleanupRunnerArguments(["--force"]),
  (error) => error.code === "CLEANUP_ARGUMENT_UNKNOWN"
);

const baseEnv = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "5432",
  DB_NAME: CLEANUP_DATABASE_NAME,
  DB_USER: "synthetic-cleanup-user",
  DB_PASSWORD: "synthetic-cleanup-password",
  DB_SSL: "false"
};
const databaseConfig = cleanupDatabaseConfig(baseEnv);
assert.equal(databaseConfig.host, "127.0.0.1");
assert.equal(databaseConfig.database, CLEANUP_DATABASE_NAME);
assert.equal(databaseConfig.ssl, false);
assert.throws(
  () => cleanupDatabaseConfig({ ...baseEnv, DB_HOST: "database.example.invalid" }),
  (error) => error.code === "CLEANUP_DB_NOT_LOOPBACK"
);
assert.throws(
  () => cleanupDatabaseConfig({ ...baseEnv, DATABASE_URL: "postgresql://forbidden" }),
  (error) => error.code === "CLEANUP_DATABASE_URL_FORBIDDEN"
);
assert.throws(
  () => cleanupDatabaseConfig({ ...baseEnv, DB_SSL: "require" }),
  (error) => error.code === "CLEANUP_DB_SSL_INVALID"
);

const applyOptions = parseCleanupRunnerArguments([
  "--apply",
  `--confirm=${CLEANUP_IMPORT_RUN_ID}`
]);
assert.doesNotThrow(() => assertCleanupApplySafety({
  options: applyOptions,
  env: {
    ...baseEnv,
    NODE_ENV: "production",
    [CLEANUP_APPLY_ENV]: CLEANUP_IMPORT_RUN_ID
  },
  databaseConfig
}));
assert.throws(
  () => assertCleanupApplySafety({
    options: applyOptions,
    env: { ...baseEnv, NODE_ENV: "production" },
    databaseConfig
  }),
  (error) => error.code === "CLEANUP_APPLY_ENV_MISSING"
);
assert.throws(
  () => assertCleanupApplySafety({
    options: applyOptions,
    env: {
      ...baseEnv,
      NODE_ENV: "test",
      [CLEANUP_APPLY_ENV]: CLEANUP_IMPORT_RUN_ID
    },
    databaseConfig
  }),
  (error) => error.code === "CLEANUP_NOT_PRODUCTION_ENV"
);

process.stdout.write("Hospitations-Dubletten-Cleanup-Runner-Vertrag ist gruen.\n");
