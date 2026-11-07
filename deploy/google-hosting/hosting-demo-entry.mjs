import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";

const demoEntryPath = "/demo-entry.html";
export const demoAssetPaths = [demoEntryPath, "/demo-entry.css"];
const demoRoute = "/Demo";
const demoOrigin = "https://versorgungs-kompass-demo.web.app/";
const previousDemoOrigin = "https://timofrank.github.io/mitmachen/";
const redirects = ["/Demo/", "/demo", "/demo/"].map(glob => ({ glob, location: demoRoute, statusCode: 302 }));
const rewrite = { glob: demoRoute, path: demoEntryPath };
const assets = demoAssetPaths.map(path => {
  const content = gzipSync(readFileSync(new URL(`.${path}`, import.meta.url)));
  const hash = createHash("sha256").update(content).digest("hex");
  return { path, content, hash };
});
function demoHeaders(origin) {
  return [demoRoute, demoEntryPath].map(glob => ({
    glob,
    headers: {
      "Content-Security-Policy": `default-src 'none'; style-src 'self'; frame-src ${origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY"
    }
  }));
}

function addRules(current = [], rules, previousRules = []) {
  const additions = new Map(rules.map(rule => [rule.glob, rule]));
  const previous = new Map(previousRules.map(rule => [rule.glob, rule]));
  for (const rule of current) {
    if (additions.has(rule.glob) && !isDeepStrictEqual(rule, additions.get(rule.glob))
      && !isDeepStrictEqual(rule, previous.get(rule.glob))) {
      throw new Error(`Hosting-Regel für ${rule.glob} ist bereits anders belegt.`);
    }
  }
  return [...rules, ...current.filter(rule => !additions.has(rule.glob))];
}

export function withDemoEntry(config) {
  return {
    ...config,
    redirects: addRules(config.redirects, redirects),
    rewrites: addRules(config.rewrites, [rewrite]),
    headers: addRules(config.headers, demoHeaders(demoOrigin), demoHeaders(previousDemoOrigin))
  };
}

export async function uploadDemoEntry(api, base, versionName, previousFiles = {}) {
  const files = { ...previousFiles, ...Object.fromEntries(assets.map(({ path, hash }) => [path, hash])) };
  const { uploadRequiredHashes = [], uploadUrl } = await api(`${base}/${versionName}:populateFiles`, {
    method: "POST", body: { files }
  });
  if (uploadRequiredHashes.length) {
    const url = new URL(uploadUrl);
    const uploads = new Map(assets.map(asset => [asset.hash, asset.content]));
    if (url.origin !== "https://upload-firebasehosting.googleapis.com" || url.pathname !== `/upload/${versionName}/files`
      || url.username || url.password || url.search || url.hash || uploadRequiredHashes.some(hash => !uploads.has(hash))) {
      throw new Error("Firebase fordert einen unerwarteten Datei-Upload an.");
    }
    for (const hash of uploadRequiredHashes) {
      await api(`${uploadUrl}/${hash}`, { method: "POST", body: uploads.get(hash), binary: true });
    }
  }
  return files;
}
