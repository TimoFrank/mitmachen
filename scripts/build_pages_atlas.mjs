import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'frontend/pages/atlas');
const destination = process.argv[2];
if (!destination) throw new Error('Ausgabeverzeichnis für den Atlas fehlt.');

await mkdir(destination, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { atlas: resolve(source, 'entry.js'), scene: resolve(source, 'scene.js') },
  outdir: destination,
  platform: 'browser',
  target: 'es2021',
  bundle: true,
  minify: true,
  format: 'esm',
  legalComments: 'inline',
});
for (const name of ['relief.webp', 'uebersicht.webp']) {
  await copyFile(resolve(source, name), resolve(destination, name));
}
await copyFile(resolve(root, 'node_modules/three/LICENSE'), resolve(destination, 'THREE-LICENSE.txt'));
