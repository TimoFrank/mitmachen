import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
    source: "node_modules/mammoth/mammoth.browser.min.js",
    target: "frontend/vendor/mammoth/mammoth.browser.min.js"
  },
  {
    package: "pdfjs-dist",
    version: "6.1.200",
    source: "node_modules/pdfjs-dist/build/pdf.min.mjs",
    target: "frontend/vendor/pdfjs/pdf.min.mjs"
  },
  {
    package: "pdfjs-dist",
    version: "6.1.200",
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
for (const asset of assets) {
  const source = resolve(root, asset.source);
  const target = resolve(root, asset.target);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  const bytes = await readFile(target);
  manifest.push({
    package: asset.package,
    version: asset.version,
    path: asset.target,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

await writeFile(
  resolve(root, "frontend/vendor/THIRD_PARTY_ASSETS.json"),
  `${JSON.stringify({ generatedFromLockfile: "package-lock.json", assets: manifest }, null, 2)}\n`,
  "utf8"
);
console.log(`Browser vendor assets written: ${manifest.length}`);
