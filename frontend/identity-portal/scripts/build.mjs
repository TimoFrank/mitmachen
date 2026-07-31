import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "assets"), { recursive: true });
await cp(path.join(projectRoot, "public"), outputDirectory, { recursive: true });

await build({
  absWorkingDir: projectRoot,
  entryPoints: {
    app: "src/app.jsx",
    action: "src/action.jsx"
  },
  outdir: "dist/assets",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  loader: {
    ".svg": "dataurl"
  },
  minify: true,
  sourcemap: false,
  legalComments: "none",
  entryNames: "[name]"
});

console.log(`Identity portal built in ${outputDirectory}`);
