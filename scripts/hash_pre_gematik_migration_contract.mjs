#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultMigrationDirectory = fileURLToPath(
  new URL("../deploy/postgres/pre-gematik/migrations/", import.meta.url)
);

export function migrationContractDigest(directory = defaultMigrationDirectory) {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error("The pre-gematik migration contract must contain at least one SQL migration.");
  }

  const manifest = files.map((file) => {
    const bytes = readFileSync(path.join(directory, file));
    return {
      file,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  });
  return `sha256:${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.stdout.write(`${migrationContractDigest()}\n`);
  } catch {
    process.stderr.write("The pre-gematik migration contract digest failed closed.\n");
    process.exitCode = 1;
  }
}
