#!/usr/bin/env node

import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  SafeCliError,
  identityTargetFingerprint,
  repositoryRootFromGit
} from "./provision_iap_identity_bindings.mjs";

export const EXPECTED_ALLOWLIST_ADMIN_ROLE = "vk_access_allowlist_admin";

const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const INSTANCE_PATTERN = /^[a-z][a-z0-9-]{1,96}[a-z0-9]$/u;
const DATABASE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new SafeCliError(`${option} benoetigt einen Wert.`);
  return value;
}

export function parseAllowlistOperatorArguments(argv) {
  const result = { help: false, outputDirectory: "", project: "", instance: "", database: "" };
  const valueOptions = new Map([
    ["--output-directory", "outputDirectory"],
    ["--project", "project"],
    ["--instance", "instance"],
    ["--database", "database"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") result.help = true;
    else if (valueOptions.has(argument)) {
      result[valueOptions.get(argument)] = requiredValue(argv, index, argument);
      index += 1;
    } else throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
  }
  return Object.freeze(result);
}

function isInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function validateOutputDirectory(outputDirectory, repositoryRoot) {
  if (!path.isAbsolute(String(outputDirectory || ""))) {
    throw new SafeCliError("--output-directory muss absolut sein.");
  }
  const linkState = await lstat(outputDirectory).catch(() => null);
  if (!linkState || linkState.isSymbolicLink()) {
    throw new SafeCliError("Das geschuetzte Ausgabeverzeichnis fehlt oder ist ein Symlink.");
  }
  const resolved = await realpath(outputDirectory);
  const resolvedRepository = await realpath(repositoryRoot);
  const metadata = await stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || isInside(resolved, resolvedRepository)
  ) {
    throw new SafeCliError("Das Ausgabeverzeichnis muss owner-only und ausserhalb des Git-Worktrees liegen.");
  }
  await access(resolved, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
  return resolved;
}

async function writeCreateOnly(filePath, content) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function prepareAllowlistOperatorFiles(options, {
  repositoryRoot = repositoryRootFromGit(),
  now = new Date(),
  randomBytes = crypto.randomBytes,
  log = console.log
} = {}) {
  if (!PROJECT_PATTERN.test(options.project)) throw new SafeCliError("--project ist ungueltig.");
  if (!INSTANCE_PATTERN.test(options.instance)) throw new SafeCliError("--instance ist ungueltig.");
  if (!DATABASE_PATTERN.test(options.database)) throw new SafeCliError("--database ist ungueltig.");

  const outputDirectory = await validateOutputDirectory(options.outputDirectory, repositoryRoot);
  const loginName = `vk_allowlist_operator_${now.toISOString().slice(0, 10).replaceAll("-", "")}_${randomBytes(5).toString("hex")}`;
  const password = randomBytes(48).toString("base64url");
  const connectionUrl = new URL("postgresql://placeholder/");
  connectionUrl.username = loginName;
  connectionUrl.password = password;
  connectionUrl.hostname = "127.0.0.1";
  connectionUrl.port = "5432";
  connectionUrl.pathname = `/${options.database}`;
  connectionUrl.searchParams.set("sslmode", "disable");

  const files = {
    createUserFlags: path.join(outputDirectory, "allowlist-operator-create-user-flags.json"),
    operatorEnvironment: path.join(outputDirectory, "allowlist-operator.env"),
    operatorName: path.join(outputDirectory, "allowlist-operator-name.txt"),
    manifest: path.join(outputDirectory, "allowlist-operator-manifest.json")
  };
  for (const filePath of Object.values(files)) {
    if (await lstat(filePath).then(() => true).catch(() => false)) {
      throw new SafeCliError("Eine Ausgabedatei existiert bereits; nichts wurde ueberschrieben.");
    }
  }

  const targetFingerprint = identityTargetFingerprint(connectionUrl.toString());
  await writeCreateOnly(files.createUserFlags, `${JSON.stringify({
    "--instance": options.instance,
    "--project": options.project,
    "--type": "BUILT_IN",
    "--password": password,
    "--database-roles": EXPECTED_ALLOWLIST_ADMIN_ROLE,
    "--quiet": true,
    "--format": "none"
  }, null, 2)}\n`);
  await writeCreateOnly(
    files.operatorEnvironment,
    `PRE_GEMATIK_ALLOWLIST_ADMIN_DATABASE_URL=${connectionUrl.toString()}\n`
      + `PRE_GEMATIK_ALLOWLIST_TARGET_SHA256=${targetFingerprint}\n`
  );
  await writeCreateOnly(files.operatorName, `${loginName}\n`);
  await writeCreateOnly(files.manifest, `${JSON.stringify({
    schemaVersion: 1,
    createdAt: now.toISOString(),
    database: options.database,
    requiredRole: EXPECTED_ALLOWLIST_ADMIN_ROLE,
    files: {
      createUserFlags: path.basename(files.createUserFlags),
      operatorEnvironment: path.basename(files.operatorEnvironment),
      operatorName: path.basename(files.operatorName)
    }
  }, null, 2)}\n`);
  log("Geschuetzte create-only Allowlist-Operator-Dateien wurden ohne Zugangsdaten erzeugt.");
  return Object.freeze({ ...files, loginName, targetFingerprint });
}

export function usage() {
  return `Kurzlebigen Allowlist-Operator vorbereiten

node scripts/prepare_pre_gematik_test_access_allowlist_operator.mjs \\
  --output-directory /absolut/owner-only/allowlist-run \\
  --project example-project \\
  --instance vk-pre-gematik-postgres \\
  --database versorgungs_kompass`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseAllowlistOperatorArguments(argv);
  if (options.help) console.log(usage());
  else await prepareAllowlistOperatorFiles(options);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FEHLER: ${error instanceof SafeCliError ? error.message : "Allowlist-Operator-Vorbereitung fehlgeschlagen."}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
