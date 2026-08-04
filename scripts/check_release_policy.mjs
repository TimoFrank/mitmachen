import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadReleaseConfig } from "./lib/release_policy.mjs";
import {
  validateHelmProductVersionProjection,
  validateProductVersionProjection
} from "./lib/release_projection.mjs";

const root = process.cwd();
const failures = [];
const config = loadReleaseConfig(root);

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} fehlt.`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  const source = read(relativePath);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    failures.push(`${relativePath} enthält kein gültiges JSON (${error.message}).`);
    return null;
  }
}

function requireText(relativePath, pattern, message) {
  const source = read(relativePath);
  if (source && !pattern.test(source)) failures.push(`${relativePath}: ${message}`);
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveSchemaReference(schema, reference) {
  if (!reference.startsWith("#/")) return null;
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, part) => current?.[part], schema);
}

function validateJsonSchema(value, schemaNode, rootSchema, location = "$") {
  const schemaFailures = [];
  if (!schemaNode || typeof schemaNode !== "object") {
    return [`${location}: ungültiger Schema-Knoten.`];
  }
  if (schemaNode.$ref) {
    const target = resolveSchemaReference(rootSchema, schemaNode.$ref);
    if (!target) return [`${location}: Schema-Referenz ${schemaNode.$ref} ist nicht auflösbar.`];
    return validateJsonSchema(value, target, rootSchema, location);
  }
  if (Object.hasOwn(schemaNode, "const") && !sameJsonValue(value, schemaNode.const)) {
    schemaFailures.push(`${location}: Wert entspricht nicht der Schema-Konstante.`);
  }
  if (schemaNode.enum && !schemaNode.enum.some((candidate) => sameJsonValue(value, candidate))) {
    schemaFailures.push(`${location}: Wert ist nicht im Schema-Enum enthalten.`);
  }

  if (schemaNode.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [...schemaFailures, `${location}: Objekt erwartet.`];
    }
    for (const key of schemaNode.required ?? []) {
      if (!Object.hasOwn(value, key)) schemaFailures.push(`${location}.${key}: Pflichtfeld fehlt.`);
    }
    if (schemaNode.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schemaNode.properties ?? {}, key)) {
          schemaFailures.push(`${location}.${key}: zusätzliches Feld ist laut Schema nicht erlaubt.`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(schemaNode.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        schemaFailures.push(...validateJsonSchema(value[key], propertySchema, rootSchema, `${location}.${key}`));
      }
    }
  } else if (schemaNode.type === "array") {
    if (!Array.isArray(value)) return [...schemaFailures, `${location}: Array erwartet.`];
    if (schemaNode.minItems !== undefined && value.length < schemaNode.minItems) {
      schemaFailures.push(`${location}: weniger als ${schemaNode.minItems} Einträge.`);
    }
    if (schemaNode.maxItems !== undefined && value.length > schemaNode.maxItems) {
      schemaFailures.push(`${location}: mehr als ${schemaNode.maxItems} Einträge.`);
    }
    if (schemaNode.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      schemaFailures.push(`${location}: Einträge müssen eindeutig sein.`);
    }
    value.forEach((item, index) => {
      schemaFailures.push(...validateJsonSchema(item, schemaNode.items ?? {}, rootSchema, `${location}[${index}]`));
    });
  } else if (schemaNode.type === "string") {
    if (typeof value !== "string") return [...schemaFailures, `${location}: Zeichenkette erwartet.`];
    if (schemaNode.minLength !== undefined && value.length < schemaNode.minLength) {
      schemaFailures.push(`${location}: Zeichenkette ist kürzer als ${schemaNode.minLength}.`);
    }
    if (schemaNode.pattern && !new RegExp(schemaNode.pattern).test(value)) {
      schemaFailures.push(`${location}: Zeichenkette entspricht nicht dem Schema-Muster.`);
    }
  }
  return schemaFailures;
}

function validateClosedSchemaObjects(schemaNode, location = "$schema") {
  const schemaFailures = [];
  if (!schemaNode || typeof schemaNode !== "object") return schemaFailures;
  if (schemaNode.type === "object" && schemaNode.additionalProperties === false) {
    const properties = Object.keys(schemaNode.properties ?? {}).sort();
    const required = [...(schemaNode.required ?? [])].sort();
    if (!sameJsonValue(properties, required)) {
      schemaFailures.push(`${location}: properties und required müssen für den geschlossenen Vertrag identisch sein.`);
    }
  }
  for (const [key, child] of Object.entries(schemaNode.properties ?? {})) {
    schemaFailures.push(...validateClosedSchemaObjects(child, `${location}.properties.${key}`));
  }
  for (const [key, child] of Object.entries(schemaNode.$defs ?? {})) {
    schemaFailures.push(...validateClosedSchemaObjects(child, `${location}.$defs.${key}`));
  }
  return schemaFailures;
}

const schema = readJson("config/release.schema.json");
if (schema) {
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    failures.push("config/release.schema.json: JSON-Schema-Version weicht vom Release-Vertrag ab.");
  }
  if (schema.$id !== "release.schema.json") {
    failures.push("config/release.schema.json: $id weicht vom Release-Vertrag ab.");
  }
  if (schema.properties?.schemaVersion?.const !== config.schemaVersion) {
    failures.push("config/release.schema.json: schemaVersion stimmt nicht mit dem validierten Release-Vertrag überein.");
  }
  failures.push(...validateClosedSchemaObjects(schema));
  failures.push(...validateJsonSchema(config, schema, schema));
}

const expectedProfiles = new Map([
  ["pages-demo", { profile: "pages-demo", authMode: "anonymous-demo", deliveryKind: "github-pages-actions" }],
  ["private-gke", { profile: "pre-gematik", authMode: "iap", deliveryKind: "github-actions-gke" }],
  ["gematik-target", { profile: "target", authMode: "oidc", deliveryKind: "software-factory" }]
]);

for (const channel of config.policy.deliveryChannels) {
  const expected = expectedProfiles.get(channel.id);
  const profile = readJson(`config/${channel.deploymentProfile}/deployment.json`);
  if (!expected || !profile) continue;
  if (channel.deploymentProfile !== expected.profile) failures.push(`${channel.id}: falsches Deployment-Profil.`);
  if (!profile.authModes?.includes(expected.authMode)) failures.push(`${channel.id}: Auth-Modus ${expected.authMode} fehlt im Deployment-Profil.`);
  if (profile.delivery?.kind !== expected.deliveryKind) failures.push(`${channel.id}: Delivery-Art weicht vom Release-Vertrag ab.`);
}

const version = config.productVersion;
failures.push(...validateProductVersionProjection({
  productVersion: version,
  readme: read("README.md"),
  changelog: read("CHANGELOG.md"),
  appHistory: read("frontend/app/versorgungs-kompass.js"),
  releaseNotesExists: existsSync(path.join(root, `dokumentation/release-notes/v${version}.md`))
}));
failures.push(...validateHelmProductVersionProjection({
  productVersion: version,
  chart: read("deploy/helm/versorgungs-kompass/Chart.yaml"),
  values: read("deploy/helm/versorgungs-kompass/values.yaml")
}));

for (const [relativePath, patterns] of [
  ["dokumentation/betrieb-und-deployment/PRODUKT_RELEASE_PROZESS.md", [
    /vX\.Y\.Z/,
    /Release Candidate/,
    /GitHub-Prerelease/,
    /v1\.0\.0/,
    /git verify-tag/,
    /Pages-Demo/,
    /privates GKE/,
    /gematik-Zielpfad/
  ]],
  ["dokumentation/betrieb-und-deployment/REPOSITORY_GOVERNANCE.md", [
    /signiert(?:er|en), annotiert(?:er|en) Git-Tag/,
    /GitLab/,
    /keine Cross-Channel-Promotion/
  ]],
  ["dokumentation/betrieb-und-deployment/ADR_001_DEPLOYMENT_TRENNUNG.md", [
    /drei Auslieferungskanäle/,
    /GitHub Pages/,
    /privates GKE/,
    /gematik-Zielpfad/
  ]]
]) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    if (source && !pattern.test(source)) failures.push(`${relativePath}: Vertragsanker ${pattern} fehlt.`);
  }
}

if (failures.length) {
  console.error("Release-Policy-Prüfung fehlgeschlagen:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release policy check passed for product version ${config.productVersion}.`);
