import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateFrontendSbom } from "./generate_frontend_sbom.mjs";

const root = process.cwd();
const fixtureBase = path.join(root, "dist");
mkdirSync(fixtureBase, { recursive: true });
const fixtureRoot = mkdtempSync(path.join(fixtureBase, ".frontend-sbom-test-"));
const targetRoot = path.join(fixtureRoot, "target");
const sbomPath = path.join(fixtureRoot, "frontend-sbom.cdx.json");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} fehlgeschlagen:\n${result.stdout}\n${result.stderr}`);
}

try {
  run("bash", [
    "scripts/build_static_frontend.sh",
    "--profile", "target",
    "--output", targetRoot,
    "--api-base-url", "https://target.example.invalid",
    "--auth-mode", "oidc"
  ]);

  const bom = generateFrontendSbom({ output: sbomPath, artifactRoot: targetRoot });
  assert.equal(bom.bomFormat, "CycloneDX");
  assert.equal(bom.specVersion, "1.6");
  assert.equal(bom.components.length, 4, "Die SBOM darf keine inneren Bundle-Abhängigkeiten aus dem Lockfile erfinden.");
  const componentNames = new Set(bom.components.map((component) => component.name));
  for (const expected of ["leaflet", "mammoth", "pdfjs-dist", "xlsx-js-style"]) {
    assert.ok(componentNames.has(expected), `${expected} fehlt in der Frontend-SBOM.`);
  }
  for (const forbidden of ["pg", "@playwright/test", "esbuild", "@napi-rs/canvas"]) {
    assert.equal(componentNames.has(forbidden), false, `${forbidden} gehört nicht in die Frontend-SBOM.`);
  }
  assert.equal(
    bom.metadata.component.properties.some(
      (property) =>
        property.name === "versorgungs-kompass:transitive-bundle-inventory" &&
        property.value === "not-inferred"
    ),
    true
  );
  for (const component of bom.components) {
    for (const choice of component.licenses || []) {
      assert.equal(
        Boolean(choice.license?.id?.includes(" OR ") || choice.license?.id?.includes(" AND ")),
        false,
        `SPDX-Ausdruck darf nicht als einzelne Lizenz-ID ausgegeben werden: ${component.name}`
      );
    }
  }
  const componentRefs = new Set(bom.components.map((component) => component["bom-ref"]));
  for (const dependency of bom.dependencies) {
    for (const target of dependency.dependsOn) {
      assert.ok(componentRefs.has(target), `Offene SBOM-Abhängigkeitsreferenz: ${target}`);
    }
  }
  assert.match(readFileSync(sbomPath, "utf8"), /versorgungs-kompass:frontend-artifact-digest/u);
  const firstGeneration = readFileSync(sbomPath, "utf8");
  generateFrontendSbom({ output: sbomPath, artifactRoot: targetRoot });
  assert.equal(readFileSync(sbomPath, "utf8"), firstGeneration, "Die Frontend-SBOM muss reproduzierbar sein.");

  appendFileSync(path.join(targetRoot, "vendor/leaflet/leaflet.js"), "\n// manipuliert\n");
  assert.throws(
    () => generateFrontendSbom({ output: sbomPath, artifactRoot: targetRoot }),
    /Vendor-Hash im Frontend-Artefakt stimmt nicht/u
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Frontend-SBOM-Vertrag ist grün.");
