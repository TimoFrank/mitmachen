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
  SafeCliError,
  identityTargetFingerprint,
  repositoryRootFromGit
} from "./provision_iap_identity_bindings.mjs";
import { EXPECTED_ACCESS_ADMIN_ROLE } from "./provision_pre_gematik_test_access.mjs";

const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const INSTANCE_PATTERN = /^[a-z][a-z0-9-]{1,96}[a-z0-9]$/u;
const DATABASE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;

function valueAfter(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new SafeCliError(`${option} benoetigt einen Wert.`);
  return value;
}

export function parseTestAccessOperatorArguments(argv) {
  const options = { help: false, outputDirectory: "", project: "", instance: "", database: "" };
  const values = new Map([
    ["--output-directory", "outputDirectory"],
    ["--project", "project"],
    ["--instance", "instance"],
    ["--database", "database"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (values.has(argument)) {
      options[values.get(argument)] = valueAfter(argv, index, argument);
      index += 1;
    } else throw new SafeCliError("Unbekannte oder unvollstaendige Kommandozeilenoption.");
  }
  return Object.freeze(options);
}

function insideDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function protectedOutputDirectory(outputDirectory, repositoryRoot) {
  if (!path.isAbsolute(String(outputDirectory || ""))) {
    throw new SafeCliError("--output-directory muss ein absoluter geschuetzter Pfad sein.");
  }
  let linkState;
  try {
    linkState = await lstat(outputDirectory);
  } catch {
    throw new SafeCliError("Das geschuetzte Ausgabeverzeichnis existiert nicht.");
  }
  if (linkState.isSymbolicLink()) throw new SafeCliError("Das Ausgabeverzeichnis darf kein Symlink sein.");
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
    throw new SafeCliError("Das Ausgabeverzeichnis muss owner-only und ausserhalb des Git-Worktrees liegen.");
  }
  await access(resolved, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
  return resolved;
}

async function writeCreateOnly(filePath, value) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function prepareTestAccessOperatorFiles(options, {
  repositoryRoot = repositoryRootFromGit(),
  now = new Date(),
  randomBytes = crypto.randomBytes,
  log = console.log
} = {}) {
  if (!PROJECT_PATTERN.test(options.project)) throw new SafeCliError("--project ist ungueltig.");
  if (!INSTANCE_PATTERN.test(options.instance)) throw new SafeCliError("--instance ist ungueltig.");
  if (!DATABASE_PATTERN.test(options.database)) throw new SafeCliError("--database ist ungueltig.");
  const outputDirectory = await protectedOutputDirectory(options.outputDirectory, repositoryRoot);
  const loginName = `vk_access_operator_${now.toISOString().slice(0, 10).replaceAll("-", "")}_${randomBytes(5).toString("hex")}`;
  const password = randomBytes(48).toString("base64url");
  const connectionUrl = new URL("postgresql://placeholder/");
  connectionUrl.username = loginName;
  connectionUrl.password = password;
  connectionUrl.hostname = "127.0.0.1";
  connectionUrl.port = "5432";
  connectionUrl.pathname = `/${options.database}`;
  connectionUrl.searchParams.set("sslmode", "disable");

  const files = {
    createUserFlags: path.join(outputDirectory, "test-access-operator-create-user-flags.json"),
    operatorEnvironment: path.join(outputDirectory, "test-access-operator.env"),
    operatorName: path.join(outputDirectory, "test-access-operator-name.txt"),
    manifest: path.join(outputDirectory, "test-access-operator-manifest.json")
  };
  for (const candidate of Object.values(files)) {
    try {
      await lstat(candidate);
      throw new SafeCliError("Eine Ausgabedatei existiert bereits; nichts wurde ueberschrieben.");
    } catch (error) {
      if (error instanceof SafeCliError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const targetFingerprint = identityTargetFingerprint(connectionUrl.toString());
  await writeCreateOnly(files.createUserFlags, `${JSON.stringify({
    "--instance": options.instance,
    "--project": options.project,
    "--type": "BUILT_IN",
    "--password": password,
    "--database-roles": EXPECTED_ACCESS_ADMIN_ROLE,
    "--quiet": true,
    "--format": "none"
  }, null, 2)}\n`);
  await writeCreateOnly(
    files.operatorEnvironment,
    `PRE_GEMATIK_ACCESS_ADMIN_DATABASE_URL=${connectionUrl.toString()}\n`
      + `PRE_GEMATIK_ACCESS_TARGET_SHA256=${targetFingerprint}\n`
  );
  await writeCreateOnly(files.operatorName, `${loginName}\n`);
  await writeCreateOnly(files.manifest, `${JSON.stringify({
    schemaVersion: 2,
    createdAt: now.toISOString(),
    database: options.database,
    requiredRole: EXPECTED_ACCESS_ADMIN_ROLE,
    files: {
      createUserFlags: path.basename(files.createUserFlags),
      operatorEnvironment: path.basename(files.operatorEnvironment),
      operatorName: path.basename(files.operatorName)
    }
  }, null, 2)}\n`);
  log("Geschuetzte create-only v2-Zugriffsoperator-Dateien wurden ohne Zugangsdatenausgabe erzeugt.");
  return Object.freeze({ ...files, loginName, targetFingerprint });
}

export function usage() {
  return `Kurzlebigen v2-Testzugriffsoperator vorbereiten

node scripts/prepare_pre_gematik_test_access_operator.mjs \\
  --output-directory /absolut/owner-only/access-run \\
  --project example-project \\
  --instance vk-pre-gematik-postgres \\
  --database versorgungs_kompass`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseTestAccessOperatorArguments(argv);
  if (options.help) console.log(usage());
  else await prepareTestAccessOperatorFiles(options);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof SafeCliError
      ? error.message
      : "Die Vorbereitung des v2-Testzugriffsoperators ist fehlgeschlagen.";
    console.error(`FEHLER: ${message}`);
    process.exitCode = error instanceof SafeCliError ? error.exitCode : 1;
  });
}
