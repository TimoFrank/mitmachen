import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.slice(2).includes("--check");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
if (unknownArguments.length) {
  throw new Error(`Unbekannte Argumente: ${unknownArguments.join(", ")}`);
}

const lockfile = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));

function lockedPackage(name) {
  const entry = lockfile.packages?.[`node_modules/${name}`];
  if (!entry?.version || !entry?.license) {
    throw new Error(`Lockfile-Eintrag mit Version und Lizenz fehlt: ${name}`);
  }
  return entry;
}

function versionAtLeast(actual, minimum) {
  const parse = (value) => value.split(".").map((part) => Number.parseInt(part, 10));
  const left = parse(actual);
  const right = parse(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;
    if (leftPart !== rightPart) return leftPart > rightPart;
  }
  return true;
}

async function licenseNotice(name) {
  const packageEntry = lockedPackage(name);
  const license = await readFile(resolve(root, `node_modules/${name}/LICENSE`), "utf8");
  return `${name}@${packageEntry.version} (${packageEntry.license})\n${license.trim()}`;
}

async function verifyInstalledVersion(name, expected) {
  const installed = JSON.parse(await readFile(resolve(root, `node_modules/${name}/package.json`), "utf8"));
  if (installed.version !== expected) {
    throw new Error(`${name}: installierte Version ${installed.version || "unbekannt"} stimmt nicht mit Lockfile ${expected} ueberein.`);
  }
}

async function buildMammothBrowserBundle() {
  const mammoth = lockedPackage("mammoth");
  const xmldom = lockedPackage("@xmldom/xmldom");
  const esbuild = lockedPackage("esbuild");
  if (!versionAtLeast(xmldom.version, "0.8.15")) {
    throw new Error(`@xmldom/xmldom ${xmldom.version} ist fuer das Browser-Bundle nicht sicher genug.`);
  }
  await Promise.all([
    verifyInstalledVersion("mammoth", mammoth.version),
    verifyInstalledVersion("@xmldom/xmldom", xmldom.version),
    verifyInstalledVersion("esbuild", esbuild.version)
  ]);

  const notices = await Promise.all([
    licenseNotice("mammoth"),
    licenseNotice("@xmldom/xmldom")
  ]);
  const banner = `/*!\n${notices.join("\n\n").replaceAll("*/", "* /")}\n*/`;
  const entry = resolve(root, "node_modules/mammoth/lib/index.js");
  const result = await build({
    absWorkingDir: root,
    banner: { js: banner },
    bundle: true,
    entryPoints: [entry],
    format: "iife",
    globalName: "mammoth",
    legalComments: "eof",
    logLevel: "silent",
    metafile: true,
    minify: true,
    platform: "browser",
    write: false
  });

  const inputs = Object.keys(result.metafile.inputs);
  const expectedXmldomInputs = ["conventions", "dom", "entities", "sax", "dom-parser", "index"]
    .map((name) => `node_modules/@xmldom/xmldom/lib/${name}.js`);
  for (const expectedInput of expectedXmldomInputs) {
    if (!inputs.some((input) => input.endsWith(expectedInput))) {
      throw new Error(`xmldom-Buildinput fehlt: ${expectedInput}`);
    }
  }
  if (inputs.some((input) => /node_modules\/mammoth\/mammoth\.browser(?:\.min)?\.js$/u.test(input))) {
    throw new Error("Das verwundbare vorgefertigte Mammoth-Browser-Bundle darf nicht als Buildinput dienen.");
  }
  if (result.outputFiles.length !== 1) {
    throw new Error(`Unerwartete Anzahl Mammoth-Buildausgaben: ${result.outputFiles.length}`);
  }

  return {
    bytes: Buffer.from(result.outputFiles[0].contents),
    bundledPackages: {
      "@xmldom/xmldom": xmldom.version
    },
    build: {
      package: "esbuild",
      version: esbuild.version
    },
    version: mammoth.version
  };
}

const assets = [
  {
    package: "leaflet",
    version: "1.9.4",
    source: "node_modules/leaflet/dist/leaflet.js",
    target: "frontend/vendor/leaflet/leaflet.js"
  },
  {
    package: "leaflet",
    version: "1.9.4",
    source: "node_modules/leaflet/dist/leaflet.css",
    target: "frontend/vendor/leaflet/leaflet.css"
  },
  ...["layers-2x.png", "layers.png", "marker-icon-2x.png", "marker-icon.png", "marker-shadow.png"].map((file) => ({
    package: "leaflet",
    version: "1.9.4",
    source: `node_modules/leaflet/dist/images/${file}`,
    target: `frontend/vendor/leaflet/images/${file}`
  })),
  {
    package: "mammoth",
    version: "1.12.0",
    build: buildMammothBrowserBundle,
    target: "frontend/vendor/mammoth/mammoth.browser.min.js"
  },
  {
    package: "pdfjs-dist",
    version: "6.2.108",
    source: "node_modules/pdfjs-dist/build/pdf.min.mjs",
    target: "frontend/vendor/pdfjs/pdf.min.mjs"
  },
  {
    package: "pdfjs-dist",
    version: "6.2.108",
    source: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    target: "frontend/vendor/pdfjs/pdf.worker.min.mjs"
  },
  {
    package: "xlsx-js-style",
    version: "1.2.0",
    source: "node_modules/xlsx-js-style/dist/xlsx.bundle.js",
    target: "frontend/vendor/xlsx/xlsx.bundle.js"
  }
];

const manifest = [];
const outputs = [];
for (const asset of assets) {
  const packageEntry = lockedPackage(asset.package);
  if (packageEntry.version !== asset.version) {
    throw new Error(`${asset.package}: Buildversion ${asset.version} stimmt nicht mit Lockfile ${packageEntry.version} ueberein.`);
  }

  const built = asset.build
    ? await asset.build()
    : { bytes: await readFile(resolve(root, asset.source)), version: asset.version };
  if (built.version !== asset.version) {
    throw new Error(`${asset.package}: erzeugte Version ${built.version} stimmt nicht mit ${asset.version} ueberein.`);
  }

  const manifestEntry = {
    package: asset.package,
    version: asset.version,
    path: asset.target,
    sha256: createHash("sha256").update(built.bytes).digest("hex")
  };
  if (built.bundledPackages) manifestEntry.bundledPackages = built.bundledPackages;
  if (built.build) manifestEntry.build = built.build;
  manifest.push(manifestEntry);
  outputs.push({ bytes: built.bytes, target: asset.target });
}

const manifestText = `${JSON.stringify({ generatedFromLockfile: "package-lock.json", assets: manifest }, null, 2)}\n`;
const manifestTarget = "frontend/vendor/THIRD_PARTY_ASSETS.json";

async function verifyBytes(relativePath, expected) {
  const actual = await readFile(resolve(root, relativePath));
  if (!actual.equals(expected)) {
    throw new Error(`${relativePath} ist nicht reproduzierbar aus dem Lockfile erzeugt.`);
  }
}

if (checkOnly) {
  for (const output of outputs) await verifyBytes(output.target, output.bytes);
  await verifyBytes(manifestTarget, Buffer.from(manifestText, "utf8"));
  console.log(`Browser vendor assets verified: ${manifest.length}`);
} else {
  for (const output of outputs) {
    const target = resolve(root, output.target);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output.bytes);
  }
  await writeFile(resolve(root, manifestTarget), manifestText, "utf8");
  console.log(`Browser vendor assets written: ${manifest.length}`);
}
