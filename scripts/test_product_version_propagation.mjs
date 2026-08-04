#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHelmProductVersionProjection } from "./lib/release_projection.mjs";
import { loadReleaseConfig } from "./lib/release_policy.mjs";
import { normalizeRepositoryUrl } from "./normalize_repository_url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function occurrences(source, pattern) {
  return (source.match(pattern) || []).length;
}

const { productVersion } = loadReleaseConfig(root);
const chart = read("deploy/helm/versorgungs-kompass/Chart.yaml");
const values = read("deploy/helm/versorgungs-kompass/values.yaml");
assert.deepEqual(validateHelmProductVersionProjection({ productVersion, chart, values }), []);
const valuesSchema = JSON.parse(read("deploy/helm/versorgungs-kompass/values.schema.json"));
assert.ok(valuesSchema.required.includes("productVersion"));
assert.equal(valuesSchema.properties.productVersion.pattern, "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$");

const helpers = read("deploy/helm/versorgungs-kompass/templates/_helpers.tpl");
assert.match(helpers, /define "versorgungs-kompass\.productVersion"[\s\S]*productVersion must match Chart\.version[\s\S]*productVersion must match Chart\.appVersion/u);
assert.match(helpers, /app\.kubernetes\.io\/version: \{\{ include "versorgungs-kompass\.productVersion"/u);
for (const selectorBlock of helpers.matchAll(/define "versorgungs-kompass\.[^"]*SelectorLabels"[\s\S]*?\{\{- end -\}\}/gu)) {
  assert.doesNotMatch(selectorBlock[0], /app\.kubernetes\.io\/version/u, "Produktversion darf keinen unveränderlichen Deployment-Selector verändern.");
}

for (const template of [
  "deployment.yaml",
  "password-reset-broker-deployment.yaml",
  "frontend-deployment.yaml",
  "frontend-public-deployment.yaml",
  "frontend-auth-proxy-deployment.yaml"
]) {
  const source = read(`deploy/helm/versorgungs-kompass/templates/${template}`);
  assert.match(
    source,
    /template:[\s\S]*?labels:[\s\S]*?app\.kubernetes\.io\/version: \{\{ include "versorgungs-kompass\.productVersion"/u,
    `${template} muss die zentrale Produktversion am Pod ausweisen.`
  );
}

for (const dockerfilePath of ["api/Dockerfile", "deploy/frontend-public/Dockerfile"]) {
  const dockerfile = read(dockerfilePath);
  for (const argument of ["PRODUCT_VERSION", "SOURCE_REVISION", "SOURCE_URL"]) {
    assert.equal(occurrences(dockerfile, new RegExp(`^ARG ${argument}$`, "gmu")), 1, `${dockerfilePath}: Build-Arg ${argument} fehlt oder ist mehrdeutig.`);
    assert.doesNotMatch(dockerfile, new RegExp(`^ARG ${argument}=`, "mu"), `${dockerfilePath}: ${argument} darf keinen stillen Default besitzen.`);
  }
  for (const label of ["version", "revision", "source"]) {
    assert.match(dockerfile, new RegExp(`org\\.opencontainers\\.image\\.${label}=`), `${dockerfilePath}: OCI-Label ${label} fehlt.`);
  }
  assert.match(dockerfile, /PRODUCT_VERSION[\s\S]*grep -Eq '\^\(0\|\[1-9\]\[0-9\]\*\)/u, `${dockerfilePath}: Produktversion muss fail-closed validiert werden.`);
  assert.match(dockerfile, /SOURCE_URL[\s\S]*grep -Eq '\^https:\/\//u, `${dockerfilePath}: Quell-URL muss fail-closed als HTTPS-URL validiert werden.`);
}

for (const [input, expected] of [
  ["https://github.com/TimoFrank/mitmachen.git", "https://github.com/TimoFrank/mitmachen"],
  ["git@github.com:TimoFrank/mitmachen.git", "https://github.com/TimoFrank/mitmachen"],
  ["ssh://git@gitlab.example.de/gruppe/versorgungs-kompass.git", "https://gitlab.example.de/gruppe/versorgungs-kompass"]
]) {
  assert.equal(normalizeRepositoryUrl(input), expected);
}
for (const unsafeUrl of [
  "https://token@gitlab.example.de/gruppe/projekt.git",
  "https://user:secret@gitlab.example.de/gruppe/projekt.git",
  "http://gitlab.example.de/gruppe/projekt.git",
  "file:///workspace/projekt",
  "/workspace/projekt",
  "ssh://git@gitlab.example.de:2222/gruppe/projekt.git",
  "https://gitlab.example.de/gruppe/projekt.git?token=secret"
]) {
  assert.throws(() => normalizeRepositoryUrl(unsafeUrl));
}

const preGematik = read(".github/workflows/deploy-pre-gematik.yml");
assert.match(preGematik, /product_version:\s*\$\{\{ steps\.metadata\.outputs\.product_version \}\}/u);
assert.ok(occurrences(preGematik, /--build-arg PRODUCT_VERSION=/gu) >= 2, "Beide lokalen pre-gematik-Images brauchen die Produktversion.");
assert.ok(occurrences(preGematik, /^\s*PRODUCT_VERSION=\$\{\{ needs\.validate\.outputs\.product_version \}\}$/gmu) >= 2, "Beide Registry-Builds brauchen die Produktversion.");
assert.ok(occurrences(preGematik, /org\.opencontainers\.image\.version=\$\{\{ needs\.validate\.outputs\.product_version \}\}/gu) >= 2, "Beide Registry-Builds brauchen das OCI-Versionslabel.");
assert.match(preGematik, /productVersion: \$product_version/u, "Das private GKE-Deployment-Manifest muss die Produktversion binden.");

const targetReadiness = read(".github/workflows/target-readiness.yml");
for (const argument of ["PRODUCT_VERSION", "SOURCE_REVISION", "SOURCE_URL"]) {
  assert.match(targetReadiness, new RegExp(`--build-arg ${argument}=`), `Target-Readiness übergibt ${argument} nicht.`);
}
assert.match(targetReadiness, /org\.opencontainers\.image\.version/u);

const jenkins = read("deploy/jenkins/Jenkinsfile.gematik");
for (const argument of ["PRODUCT_VERSION", "SOURCE_REVISION", "SOURCE_URL"]) {
  assert.match(jenkins, new RegExp(`--build-arg ${argument}=`), `Software-Factory-Build übergibt ${argument} nicht.`);
}
assert.match(jenkins, /org\.opencontainers\.image\.version/u);
assert.match(
  jenkins,
  /jq --exit-status --raw-output '\.sourceRepository'[\s\S]*source-repository\.txt[\s\S]*env\.SOURCE_REPOSITORY = readFile/u,
  "Die OCI-Quell-URL muss aus dem signierten Target-Quellnachweis stammen."
);
assert.match(jenkins, /source_url="\$SOURCE_REPOSITORY"/u);
assert.match(jenkins, /test "\$source_revision" = "\$SOURCE_REVISION"/u);
assert.doesNotMatch(
  jenkins,
  /source_url="\$\(git config --get remote\.origin\.url|raw_source_url/u,
  "Der Kandidaten-Checkout darf die verifizierte Quellautoritaet nicht neu oder ungeprueft ableiten."
);
const targetSourceVerifier = read("scripts/verify_target_release_source.mjs");
assert.match(
  targetSourceVerifier,
  /validateReleaseConfig\(JSON\.parse\([\s\S]*git\(\["show", `\$\{sourceRevision\}:config\/release\.json`\]\)/u,
  "Das Target-Gate muss die Produktversion aus dem getaggten Quellstand lesen."
);
assert.match(
  targetSourceVerifier,
  /expectedTag = formatTechnicalTag\(releaseConfig\.productVersion\)[\s\S]*releaseTag !== expectedTag/u,
  "Der Target-Produkt-Tag muss exakt zur zentralen Produktversion passen."
);
assert.match(
  jenkins,
  /verify_target_release_source\.mjs[\s\S]*--tag "\$RELEASE_TAG"[\s\S]*helm lint "\$HELM_CHART"[\s\S]*--values "\$HELM_TARGET_VALUES"/u,
  "Jenkins muss erst die getaggte Produktversion verifizieren und danach das Target-Chart mit seinem Versionsvertrag linten."
);

const pages = read(".github/workflows/deploy-pages.yml");
assert.match(pages, /\.productVersion == \$product_version/u, "Pages muss die Produktversion im Build und live prüfen.");

const builder = read("scripts/build_static_frontend.sh");
assert.match(builder, /"productVersion": "%s"/u);
assert.match(builder, /scripts\/print_product_version\.mjs/u);

console.log(`Produktversions-Propagation ist vollständig gebunden: ${productVersion}.`);
