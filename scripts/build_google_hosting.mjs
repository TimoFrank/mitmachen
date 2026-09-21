import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist/google-hosting");
const origin = process.env.API_BASE_URL || "";
const apiKey = process.env.IAP_EXTERNAL_AUTH_API_KEY || "";
const projectId = process.env.IAP_GCIP_PROJECT_ID || "";
execFileSync("bash", ["scripts/build_static_frontend.sh", "--profile", "target", "--output", "dist/google-hosting", "--api-base-url", origin, "--auth-mode", "iap", "--identity-platform-api-key", apiKey, "--identity-platform-project-id", projectId], {
  cwd: root, stdio: "inherit", env: { ...process.env, IAP_IDENTITY_MODE: "external", IAP_EXTERNAL_LOGIN_PAGE_URI: `${origin}/anmelden` }
});

function transform(relative, globalName, update) {
  const filename = path.join(output, relative);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { timeout: 1000 });
  const value = update(context.window[globalName]);
  fs.writeFileSync(filename, `window.${globalName} = Object.freeze(${JSON.stringify(value, null, 2)});\n`);
}
transform("data/runtime-config.js", "VERSORGUNGS_COMPASS_CONFIG", (value) => ({
  ...value, apiBaseUrl: "", apiCredentials: "same-origin", authMode: "oidc", identityProvider: "google-hosting", iapIdentityMode: "iam",
  iapExternalLoginPageUri: "", iapExternalAuthApiKey: ""
}));
transform("public/auth/portal-config.js", "IDENTITY_PORTAL_CONFIG", (value) => ({
  ...value, sessionMode: "google-hosting", enableLocalPreview: false
}));
const manifestPath = path.join(output, "build-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.rmSync(manifestPath);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error("Google-Artefakte dürfen keine Symlinks enthalten.");
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}
const files = walk(output).map((filename) => ({ filename, relative: path.relative(output, filename).split(path.sep).join("/") })).sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
const hash = crypto.createHash("sha256");
function frame(value) { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes; }
hash.update(Buffer.from("versorgungs-kompass-artifact-tree-v2\0"));
hash.update(frame(files.length));
for (const { filename, relative } of files) {
  const name = Buffer.from(relative);
  const content = fs.readFileSync(filename);
  hash.update(frame(name.length)); hash.update(name); hash.update(frame(content.length)); hash.update(content);
}
fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, profile: "google-hosting", artifactDigest: `sha256:${hash.digest("hex")}` }, null, 2) + "\n");
console.log("Google-Hosting-Artefakt mit serverseitigen Sitzungen erstellt.");
