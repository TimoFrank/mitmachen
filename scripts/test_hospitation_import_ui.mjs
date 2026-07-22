import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const html = read("frontend/app/hospitation/import.html");
const app = read("frontend/app/hospitation/import.js");
const shellApp = read("frontend/app/hospitation/hospitation.js");
const builder = read("scripts/build_static_frontend.sh");
const pagesBlock = builder.slice(builder.indexOf("build_pages()"), builder.indexOf("build_target()"));
const targetBlock = builder.slice(builder.indexOf("build_target()"));

assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
assert.match(html, /\.\.\/\.\.\/login\/auth-config\.js/);
assert.match(html, /\.\.\/\.\.\/login\/auth-guard\.js/);
assert.match(html, /\.\/import\.js/);
assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>/i, "Importseite darf keine Inline-Skripte enthalten");
assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "Importseite darf keine Inline-Eventhandler enthalten");

for (const contract of [
  'const SCHEMA_VERSION = "hospitation-staging/v1"',
  'const SNAPSHOT_SOURCE = "local-hospitation"',
  'const OWNER_REF = "timo-frank"',
  'const CONFIRMATION = "HOSPITATIONEN IMPORTIEREN"',
  'body: { manifest: state.manifest }',
  'manifestFingerprint: state.preview.manifestFingerprint',
  'targetFingerprint: state.preview.targetFingerprint',
  'backupConfirmed: true',
  'confirmation: CONFIRMATION',
  'String(profile?.role || "").toLowerCase() !== "admin"',
  'url.origin !== window.location.origin'
]) {
  assert.ok(app.includes(contract), `Import-UI-Vertrag fehlt: ${contract}`);
}

for (const route of [
  "/api/profile",
  "/api/admin/hospitation-import/preview",
  "/api/admin/hospitation-import/apply"
]) {
  assert.ok(app.includes(route), `Import-UI referenziert ${route} nicht`);
}

assert.doesNotMatch(app, /\b(?:localStorage|sessionStorage|indexedDB|document\.write|eval)\b/);
assert.doesNotMatch(app, /\.innerHTML\s*=|insertAdjacentHTML/);
assert.doesNotMatch(app, /conflict\?\.message|observation\?\.(?:text|content|description)/i, "Fachinhalte duerfen nicht in der Vorschau gerendert werden");
assert.match(app, /renderItemReview\(preview\.items\)/);
for (const field of ["sourceId", "targetId", "changedFields"]) assert.match(app, new RegExp(`item\\?\\.${field}`));
assert.doesNotMatch(app, /item\?\.label|item\?\.reference/, "Namen oder Beobachtungstitel duerfen nicht in der technischen Prüftabelle erscheinen");
assert.match(app, /elements\.confirmationInput\.value === CONFIRMATION/);
assert.match(app, /elements\.backupCheckbox\.checked/);
assert.match(app, /Produktive Owner-Zuordnung:/);
assert.match(app, /preview\.canApply === true/);
assert.match(app, /preview\.canApply === true && hasChanges/);
assert.match(app, /summary\.total\.conflict === 0/);
assert.match(app, /conflicts\.length === 0/);
assert.match(app, /isCurrent \? "Stand bereits aktuell"/);
for (const entityType of ["organization", "contact", "hospitation", "observation"]) {
  assert.match(app, new RegExp(`${entityType}: ".+"`), `Singularer Entitytyp ${entityType} muss ein sichtbares Label erhalten`);
}

assert.match(shellApp, /config\.dataMode !== "api"/);
assert.match(shellApp, /String\(profile\?\.role \|\| ""\)\.toLowerCase\(\) !== "admin"/);
assert.match(shellApp, /link\.href = "\.\/import\.html"/);
assert.doesNotMatch(pagesBlock, /hospitation\/import\.(?:html|css|js)/, "Der Admin-Operator darf nicht in das Pages-Artefakt gelangen");
for (const file of ["import.html", "import.css", "import.js"]) {
  assert.ok(targetBlock.includes(`app/hospitation/${file}`), `${file} muss in das Target-Artefakt kopiert werden`);
}

console.log("Hospitation import UI test OK: Admin-Gate, Preview/Apply-Vertrag, Datenschutz und Target-only-Auslieferung sind abgesichert.");
