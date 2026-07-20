#!/usr/bin/env node

import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  open,
  realpath,
  stat
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_IDENTITY_ADMIN_ROLE,
  SafeCliError,
  identityTargetFingerprint,
  repositoryRootFromGit
} from "./provision_iap_identity_bindings.mjs";

const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const INSTANCE_PATTERN = /^[a-z][a-z0-9-]{1,96}[a-z0-9]$/u;
const DATABASE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = "5432";

function requiredOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new SafeCliError(`${option} benoetigt einen Wert.`);
  }
  return value;
}

export function parseIdentityOperatorArguments(argv) {
  const options = {
    help: false,
    outputDirectory: "",
    project: "",
    instance: "",
    database: ""
  };
  const valueOptions = new Map([
    ["--output-directory", "outputDirectory"],
    ["--project", "project"],
    ["--instance", "instance"],
    ["--database", "database"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (valueOptions.has(argument)) {
      options[valueOptions.get(argument)] = requiredOptionValue(argv, index, argument);
      index += 1;
    } else {
      throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
    }
  }
  return Object.freeze(options);
}

function insideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function validateProtectedOutputDirectory(outputDirectory, repositoryRoot) {
  if (!path.isAbsolute(String(outputDirectory || ""))) {
    throw new SafeCliError("--output-directory muss ein absoluter geschuetzter Pfad sein.");
  }
  let linkState;
  try {
    linkState = await lstat(outputDirectory);
  } catch {
    throw new SafeCliError("Das geschuetzte Ausgabeverzeichnis existiert nicht.");
  }
  if (linkState.isSymbolicLink()) {
    throw new SafeCliError("Das geschuetzte Ausgabeverzeichnis darf kein symbolischer Link sein.");
  }
  const resolved = await realpath(outputDirectory);
  const resolvedRepository = await realpath(repositoryRoot);
  const metadata = await stat(resolved);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (
    !metadata.isDirectory()
    || metadata.uid !== currentUid
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
    || insideDirectory(resolved, resolvedRepository)
  ) {
    throw new SafeCliError(
      "Das Ausgabeverzeichnis muss owner-only sein, dem Aufrufer gehoeren und ausserhalb des Git-Worktrees liegen."
    );
  }
  await access(resolved, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
  return resolved;
}

function validateConfiguration(options) {
  if (!PROJECT_PATTERN.test(options.project)) {
    throw new SafeCliError("--project ist keine gueltige GCP-Projektkennung.");
  }
  if (!INSTANCE_PATTERN.test(options.instance)) {
    throw new SafeCliError("--instance ist kein gueltiger Cloud-SQL-Instanzname.");
  }
  if (!DATABASE_PATTERN.test(options.database)) {
    throw new SafeCliError("--database ist kein gueltiger PostgreSQL-Datenbankname.");
  }
}

async function writeOwnerOnlyJson(filePath, value) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeOwnerOnlyText(filePath, value) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function prepareIdentityOperatorFiles(options, {
  repositoryRoot = repositoryRootFromGit(),
  now = new Date(),
  randomBytes = crypto.randomBytes,
  log = console.log
} = {}) {
  validateConfiguration(options);
  const outputDirectory = await validateProtectedOutputDirectory(
    options.outputDirectory,
    repositoryRoot
  );
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = randomBytes(5).toString("hex");
  const loginName = `vk_identity_operator_${datePart}_${randomPart}`;
  const password = randomBytes(48).toString("base64url");
  const connectionUrl = new URL("postgresql://placeholder/");
  connectionUrl.username = loginName;
  connectionUrl.password = password;
  connectionUrl.hostname = TARGET_HOST;
  connectionUrl.port = TARGET_PORT;
  connectionUrl.pathname = `/${options.database}`;
  connectionUrl.searchParams.set("sslmode", "disable");

  const createUserFlagsPath = path.join(outputDirectory, "identity-operator-create-user-flags.json");
  const operatorEnvironmentPath = path.join(outputDirectory, "identity-operator.env");
  const operatorNamePath = path.join(outputDirectory, "identity-operator-name.txt");
  const manifestPath = path.join(outputDirectory, "identity-operator-manifest.json");

  for (const candidate of [
    createUserFlagsPath,
    operatorEnvironmentPath,
    operatorNamePath,
    manifestPath
  ]) {
    try {
      await lstat(candidate);
      throw new SafeCliError("Mindestens eine geschuetzte Ausgabedatei existiert bereits; nichts wurde ueberschrieben.");
    } catch (error) {
      if (error instanceof SafeCliError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const targetFingerprint = identityTargetFingerprint(connectionUrl.toString());
  await writeOwnerOnlyJson(createUserFlagsPath, {
    "--instance": options.instance,
    "--project": options.project,
    "--type": "BUILT_IN",
    "--password": password,
    "--database-roles": EXPECTED_IDENTITY_ADMIN_ROLE,
    "--quiet": true,
    "--format": "none"
  });
  await writeOwnerOnlyText(
    operatorEnvironmentPath,
    `PRE_GEMATIK_IDENTITY_ADMIN_DATABASE_URL=${connectionUrl.toString()}\n`
      + `PRE_GEMATIK_IDENTITY_TARGET_SHA256=${targetFingerprint}\n`
  );
  await writeOwnerOnlyText(operatorNamePath, `${loginName}\n`);
  await writeOwnerOnlyJson(manifestPath, {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    database: options.database,
    requiredRole: EXPECTED_IDENTITY_ADMIN_ROLE,
    files: {
      createUserFlags: path.basename(createUserFlagsPath),
      operatorEnvironment: path.basename(operatorEnvironmentPath),
      operatorName: path.basename(operatorNamePath)
    }
  });
  log("Geschuetzte, create-only Identity-Operator-Dateien wurden ohne Ausgabe von Zugangsdaten erzeugt.");
  return Object.freeze({
    createUserFlagsPath,
    operatorEnvironmentPath,
    operatorNamePath,
    manifestPath,
    loginName,
    targetFingerprint
  });
}

export function usage() {
  return `Geschuetzte Zugangsdaten fuer einen kurzlebigen pre-gematik Identity-Operator erzeugen

node scripts/prepare_pre_gematik_identity_operator.mjs \\
  --output-directory /absolut/geschuetzt/identity-run \\
  --project example-pre-gematik-project \\
  --instance vk-pre-gematik-postgres \\
  --database versorgungs_kompass

Das bestehende Ausgabeverzeichnis muss owner-only, ausserhalb des Git-Worktrees und
dem aufrufenden Betriebssystemkonto zugeordnet sein. Vier Dateien werden create-only
mit Modus 0600 geschrieben. Zugangsdaten werden nie auf stdout oder stderr ausgegeben.`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseIdentityOperatorArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  await prepareIdentityOperatorFiles(options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof SafeCliError
      ? error.message
      : "Die geschuetzte Vorbereitung des Identity-Operators ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
