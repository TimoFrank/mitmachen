import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import { renderPublicEntry } from "../../scripts/render_public_entry.mjs";

const rootEntryPath = "/public/medien/versorgungs-startseite.html";
const demoEntryPath = "/demo-entry.html";
const demoManifestPath = "/demo/manifest.webmanifest";
const demoAssetSources = {
  [demoEntryPath]: "./demo-entry.html",
  "/demo-entry.css": "./demo-entry.css",
  [demoManifestPath]: "./demo-manifest.webmanifest",
  "/demo/medien/teilen-v3.png": "../../public/media/social/mitmachen-share-v3.png",
  "/public/media/social/versorgungs-kompass-v1.png": "./share/versorgungs-kompass-v1.png",
  "/demo/medien/rundkompass.svg": "../../frontend/pages/brand/versorgungs-kompass/mark.svg",
  "/demo/medien/rundkompass-32.png": "./demo-icons/rundkompass-32.png",
  "/demo/medien/rundkompass-180.png": "./demo-icons/rundkompass-180.png",
  "/demo/medien/rundkompass-192.png": "./demo-icons/rundkompass-192.png",
  "/demo/medien/rundkompass-512.png": "./demo-icons/rundkompass-512.png",
  "/demo/medien/rundkompass-maskable-512.png": "./demo-icons/rundkompass-maskable-512.png"
};
export const demoAssetPaths = [rootEntryPath, ...Object.keys(demoAssetSources)];
export const demoRoute = "/demo";
const previousDemoRoute = "/Demo";
const demoOrigin = "https://versorgungs-kompass-demo.web.app/";
const previousDemoOrigin = "https://timofrank.github.io/mitmachen/";
const redirects = [previousDemoRoute, "/Demo/", "/demo/"].map(glob => ({ glob, location: demoRoute, statusCode: 302 }));
const previousRedirects = ["/Demo/", demoRoute, "/demo/"].map(glob => ({ glob, location: previousDemoRoute, statusCode: 302 }));
const rewrite = { glob: demoRoute, path: demoEntryPath };
const rootRewrite = { glob: "/", path: rootEntryPath };
const previousRewrite = { glob: previousDemoRoute, path: demoEntryPath };
function hostingAsset(path, bytes) {
  const content = gzipSync(bytes);
  const hash = createHash("sha256").update(content).digest("hex");
  return { path, content, hash };
}
const staticAssets = Object.entries(demoAssetSources).map(([path, source]) =>
  hostingAsset(path, readFileSync(new URL(source, import.meta.url))));
const rootHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self'; worker-src 'self' blob:",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Firebase ergänzt diese beiden Cache-Schlüssel bei dynamischen Antworten.
  "Vary": "Cookie, Origin, Accept-Encoding, need-authorization, x-fh-requested-host",
  "X-Content-Type-Options": "nosniff"
};
function demoHeaders(origin, route, assetDirectives = "") {
  return [route, demoEntryPath].map(glob => ({
    glob,
    headers: {
      "Content-Security-Policy": `default-src 'none'; style-src 'self'; ${assetDirectives}frame-src ${origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY"
    }
  }));
}

function removeKnownRules(current = [], rules) {
  const managedGlobs = new Set(rules.map(rule => rule.glob));
  return current.filter(rule => {
    if (!managedGlobs.has(rule.glob)) return true;
    if (!rules.some(previous => isDeepStrictEqual(rule, previous))) {
      throw new Error(`Hosting-Regel für ${rule.glob} ist bereits anders belegt.`);
    }
    return false;
  });
}

function addRules(current = [], rules, previousRules = []) {
  const additions = new Map(rules.map(rule => [rule.glob, rule]));
  for (const rule of current) {
    if (additions.has(rule.glob) && !isDeepStrictEqual(rule, additions.get(rule.glob))
      && !previousRules.some(previous => isDeepStrictEqual(rule, previous))) {
      throw new Error(`Hosting-Regel für ${rule.glob} ist bereits anders belegt.`);
    }
  }
  return [...rules, ...current.filter(rule => !additions.has(rule.glob))];
}

export function withDemoEntry(config) {
  const currentRedirects = removeKnownRules(config.redirects, previousRedirects.filter(rule => rule.glob === demoRoute));
  const currentRewrites = removeKnownRules(config.rewrites, [previousRewrite]);
  if (currentRedirects.some(rule => rule.glob === rootRewrite.glob)) {
    throw new Error("Hosting-Regel für / ist bereits anders belegt.");
  }
  for (const rule of [...currentRedirects, ...currentRewrites]) {
    if (demoAssetPaths.includes(rule.glob)) throw new Error(`Hosting-Regel für ${rule.glob} ist bereits anders belegt.`);
  }
  for (const rule of currentRewrites) {
    if (redirects.some(redirect => redirect.glob === rule.glob)) {
      throw new Error(`Hosting-Regel für ${rule.glob} ist bereits anders belegt.`);
    }
  }
  const currentHeaders = removeKnownRules(config.headers, [
    demoHeaders(demoOrigin, previousDemoRoute)[0],
    demoHeaders(previousDemoOrigin, previousDemoRoute)[0]
  ]);
  const entryHeaders = [
    ...demoHeaders(demoOrigin, demoRoute, "img-src 'self'; manifest-src 'self'; "),
    { glob: demoManifestPath, headers: { "Content-Type": "application/manifest+json" } },
    ...[rootRewrite.glob, rootEntryPath].map(glob => ({ glob, headers: rootHeaders }))
  ];
  return {
    ...config,
    redirects: addRules(currentRedirects, redirects, previousRedirects),
    rewrites: addRules(currentRewrites, [rewrite, rootRewrite]),
    headers: addRules(currentHeaders, entryHeaders, [
      ...demoHeaders(demoOrigin, demoRoute),
      ...demoHeaders(previousDemoOrigin, demoRoute)
    ])
  };
}

export async function uploadDemoEntry(api, base, versionName, previousFiles = {}, origin = "https://versorgungs-kompass.de") {
  const rootAsset = hostingAsset(rootEntryPath, renderPublicEntry(origin, { googleShareCard: true }));
  const assets = [rootAsset, ...staticAssets];
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
