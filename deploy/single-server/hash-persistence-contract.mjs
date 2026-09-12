#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixedFiles = [
  "deploy/single-server/compose.yaml",
  "deploy/single-server/postgres/10-bootstrap.sh",
  "frontend/data/activity-model.js",
  "frontend/data/sector-registry.js"
];

function fail() {
  process.stderr.write("FEHLER: Persistenzvertrag konnte nicht vollstaendig und symlinkfrei gehasht werden.\n");
  process.exit(1);
}

try {
  function collect(relativeDirectory, predicate = () => true) {
    const absoluteDirectory = path.join(projectRoot, relativeDirectory);
    const directoryStat = lstatSync(absoluteDirectory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail();
    return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(projectRoot, relativePath);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) fail();
      if (stat.isDirectory()) return collect(relativePath, predicate);
      if (!stat.isFile()) fail();
      return predicate(relativePath) ? [relativePath] : [];
    });
  }

  const apiRuntimeFiles = collect("api");
  const postgresContractFiles = collect(
    "deploy/postgres/pre-gematik",
    (relativePath) => relativePath.endsWith(".sql")
  );
  if (apiRuntimeFiles.length === 0 || postgresContractFiles.length === 0) fail();

  const contractFiles = [...new Set([...fixedFiles, ...apiRuntimeFiles, ...postgresContractFiles])].sort();
  const manifest = contractFiles.map((relativePath) => {
    const absolutePath = path.join(projectRoot, relativePath);
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) fail();
    const bytes = readFileSync(absolutePath);
    return {
      path: relativePath,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  });
  process.stdout.write(`${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}\n`);
} catch {
  fail();
}
