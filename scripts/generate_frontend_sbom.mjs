import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function purlName(packageName) {
  return encodeURIComponent(packageName).replace(/%2F/giu, "/");
}

function packageHash(integrity = "") {
  const match = /^(sha(?:256|384|512))-([A-Za-z0-9+/=]+)$/u.exec(integrity);
  if (!match) return [];
  return [{
    alg: match[1].toUpperCase().replace("SHA", "SHA-"),
    content: Buffer.from(match[2], "base64").toString("hex")
  }];
}

function cycloneDxLicense(value) {
  if (/[()]/u.test(value) || /\s(?:AND|OR|WITH)\s/u.test(value)) {
    return { expression: value };
  }
  const spdxIds = new Set(["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT"]);
  if (spdxIds.has(value)) return { license: { id: value } };
  return { license: { name: value } };
}

function targetAssetPath(sourcePath) {
  return sourcePath.replace(/^frontend\/vendor\//u, "vendor/");
}

export function generateFrontendSbom({
  output,
  artifactRoot = "",
  sourceRoot = root
}) {
  const packageJson = readJson(path.join(sourceRoot, "package.json"));
  const lockfile = readJson(path.join(sourceRoot, "package-lock.json"));
  const assetManifest = readJson(path.join(sourceRoot, "frontend/vendor/THIRD_PARTY_ASSETS.json"));
  const groupedAssets = new Map();

  if (assetManifest.generatedFromLockfile !== "package-lock.json") {
    fail("Das Vendor-Manifest muss aus package-lock.json erzeugt sein.");
  }

  if (artifactRoot) {
    const shippedManifest = path.join(artifactRoot, "vendor/THIRD_PARTY_ASSETS.json");
    if (!existsSync(shippedManifest)) fail("THIRD_PARTY_ASSETS.json fehlt im Frontend-Artefakt.");
    if (sha256(shippedManifest) !== sha256(path.join(sourceRoot, "frontend/vendor/THIRD_PARTY_ASSETS.json"))) {
      fail("Das Vendor-Manifest im Frontend-Artefakt stimmt nicht mit der Quelle überein.");
    }
  }

  for (const asset of assetManifest.assets || []) {
    const sourceFile = path.join(sourceRoot, asset.path);
    if (!existsSync(sourceFile)) fail(`Vendor-Datei fehlt: ${asset.path}`);
    const sourceDigest = sha256(sourceFile);
    if (sourceDigest !== asset.sha256) fail(`Vendor-Hash stimmt nicht: ${asset.path}`);

    if (artifactRoot) {
      const shippedPath = targetAssetPath(asset.path);
      const shippedFile = path.join(artifactRoot, shippedPath);
      if (!existsSync(shippedFile)) fail(`Vendor-Datei fehlt im Frontend-Artefakt: ${shippedPath}`);
      if (sha256(shippedFile) !== asset.sha256) fail(`Vendor-Hash im Frontend-Artefakt stimmt nicht: ${shippedPath}`);
    }

    const key = `${asset.package}@${asset.version}`;
    if (!groupedAssets.has(key)) groupedAssets.set(key, []);
    groupedAssets.get(key).push(asset);
  }

  const directPackageNames = [...new Set(
    [...groupedAssets.values()].map((assets) => assets[0].package)
  )].sort();
  const components = directPackageNames.map((packageName) => {
    const lockEntry = lockfile.packages?.[`node_modules/${packageName}`];
    if (!lockEntry) fail(`Lockfile-Eintrag fehlt: node_modules/${packageName}`);
    const assets = groupedAssets.get(`${packageName}@${lockEntry.version}`) || [];
    if (!assets.length) {
      fail(`Version von ${packageName} stimmt nicht mit dem Vendor-Manifest überein.`);
    }
    if (!lockEntry.license) fail(`Lizenzangabe fehlt im Lockfile: ${packageName}`);

    const purl = `pkg:npm/${purlName(packageName)}@${encodeURIComponent(lockEntry.version)}`;
    const component = {
      type: "library",
      "bom-ref": purl,
      name: packageName,
      version: lockEntry.version,
      hashes: packageHash(lockEntry.integrity),
      licenses: [cycloneDxLicense(lockEntry.license)],
      purl
    };
    if (assets.length) {
      component.properties = assets
        .sort((left, right) => left.path.localeCompare(right.path))
        .flatMap((asset) => [
          { name: "versorgungs-kompass:asset:path", value: targetAssetPath(asset.path) },
          { name: `versorgungs-kompass:asset:sha256:${targetAssetPath(asset.path)}`, value: asset.sha256 }
        ]);
    }
    if (lockEntry.resolved) {
      component.externalReferences = [{ type: "distribution", url: lockEntry.resolved }];
    }
    if (!component.hashes.length) delete component.hashes;
    return component;
  }).sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));

  const applicationRef = `pkg:npm/versorgungs-kompass-frontend@${encodeURIComponent(packageJson.version)}`;
  const metadataProperties = [
    { name: "versorgungs-kompass:source-lockfile", value: "package-lock.json" },
    { name: "versorgungs-kompass:vendor-manifest", value: "frontend/vendor/THIRD_PARTY_ASSETS.json" },
    { name: "versorgungs-kompass:scope", value: "direct-vendored-browser-bundles" },
    { name: "versorgungs-kompass:transitive-bundle-inventory", value: "not-inferred" }
  ];
  if (artifactRoot) {
    const buildManifestPath = path.join(artifactRoot, "build-manifest.json");
    if (!existsSync(buildManifestPath)) fail("build-manifest.json fehlt im Frontend-Artefakt.");
    const buildManifest = readJson(buildManifestPath);
    if (!/^sha256:[0-9a-f]{64}$/u.test(buildManifest.artifactDigest || "")) {
      fail("Das Frontend-Artefakt besitzt keinen gültigen artifactDigest.");
    }
    metadataProperties.push({
      name: "versorgungs-kompass:frontend-artifact-digest",
      value: buildManifest.artifactDigest
    });
  }

  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "application",
        "bom-ref": applicationRef,
        name: "versorgungs-kompass-frontend",
        version: packageJson.version,
        properties: metadataProperties
      }
    },
    components,
    dependencies: [
      {
        ref: applicationRef,
        dependsOn: components.map((component) => component["bom-ref"]).sort()
      },
      ...components.map((component) => ({ ref: component["bom-ref"], dependsOn: [] }))
    ]
  };

  if (artifactRoot) {
    const digest = metadataProperties.find(
      (property) => property.name === "versorgungs-kompass:frontend-artifact-digest"
    ).value;
    bom.metadata.component.hashes = [{ alg: "SHA-256", content: digest.slice("sha256:".length) }];
  }

  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(bom, null, 2)}\n`);
  return bom;
}

function parseArgs(argv) {
  const values = { output: "", artifactRoot: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") values.output = argv[++index] || "";
    else if (argument === "--artifact-root") values.artifactRoot = argv[++index] || "";
    else fail(`Unbekanntes Argument: ${argument}`);
  }
  if (!values.output) fail("--output ist erforderlich.");
  return {
    output: path.resolve(values.output),
    artifactRoot: values.artifactRoot ? path.resolve(values.artifactRoot) : ""
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const bom = generateFrontendSbom(options);
  console.log(`Frontend-SBOM erzeugt: ${options.output} (${bom.components.length} Komponenten)`);
}
