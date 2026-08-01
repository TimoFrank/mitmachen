#!/usr/bin/env bash

set -euo pipefail

export LC_ALL=C

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PROFILE=""
OUTPUT_ARG=""
API_BASE_URL=""
AUTH_MODE=""
IDENTITY_PLATFORM_API_KEY="${IDENTITY_PLATFORM_API_KEY:-${IAP_EXTERNAL_AUTH_API_KEY:-}}"
IDENTITY_PLATFORM_PROJECT_ID="${IDENTITY_PLATFORM_PROJECT_ID:-${IAP_GCIP_PROJECT_ID:-}}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build_static_frontend.sh --profile pages --output dist/pages
  bash scripts/build_static_frontend.sh --profile target --output dist/target \
    --api-base-url https://example.invalid --auth-mode oidc|iap \
    --identity-platform-api-key "$IDENTITY_PLATFORM_API_KEY" \
    --identity-platform-project-id example-project

Profiles:
  pages   Oeffentliche, anonyme Demo mit synthetischen Fachdaten und
          kuratiertem Amtstraeger-Verzeichnis
  target  Geschuetzte Realanwendung mit ausschliesslichem API-/Gateway-Zugriff
EOF
}

fail() {
  echo "Static frontend build FAILED: $*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      [ "$#" -ge 2 ] || fail "--profile benoetigt einen Wert."
      PROFILE="$2"
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || fail "--output benoetigt einen Wert."
      OUTPUT_ARG="$2"
      shift 2
      ;;
    --api-base-url)
      [ "$#" -ge 2 ] || fail "--api-base-url benoetigt einen Wert."
      API_BASE_URL="$2"
      shift 2
      ;;
    --auth-mode)
      [ "$#" -ge 2 ] || fail "--auth-mode benoetigt einen Wert."
      AUTH_MODE="$2"
      shift 2
      ;;
    --identity-platform-api-key)
      [ "$#" -ge 2 ] || fail "--identity-platform-api-key benoetigt einen Wert."
      IDENTITY_PLATFORM_API_KEY="$2"
      shift 2
      ;;
    --identity-platform-project-id)
      [ "$#" -ge 2 ] || fail "--identity-platform-project-id benoetigt einen Wert."
      IDENTITY_PLATFORM_PROJECT_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unbekanntes Argument: $1"
      ;;
  esac
done

[ "$PROFILE" = "pages" ] || [ "$PROFILE" = "target" ] || fail "--profile muss pages oder target sein."
[ -n "$OUTPUT_ARG" ] || fail "--output fehlt."

if [ "$PROFILE" = "pages" ]; then
  [ -z "$API_BASE_URL" ] || fail "--api-base-url ist nur fuer das target-Profil zulaessig."
  [ -z "$AUTH_MODE" ] || fail "--auth-mode ist nur fuer das target-Profil zulaessig."
else
  [ -n "$API_BASE_URL" ] || fail "--api-base-url fehlt fuer das target-Profil."
  [ -n "$IDENTITY_PLATFORM_API_KEY" ] || fail "--identity-platform-api-key/IDENTITY_PLATFORM_API_KEY fehlt fuer das target-Profil."
  [ -n "$IDENTITY_PLATFORM_PROJECT_ID" ] || fail "--identity-platform-project-id/IDENTITY_PLATFORM_PROJECT_ID fehlt fuer das target-Profil."
  case "$AUTH_MODE" in
    oidc|iap) ;;
    *) fail "--auth-mode muss fuer das target-Profil oidc oder iap sein." ;;
  esac

  IDENTITY_PLATFORM_API_KEY="$IDENTITY_PLATFORM_API_KEY" \
  IDENTITY_PLATFORM_PROJECT_ID="$IDENTITY_PLATFORM_PROJECT_ID" \
  node - "$API_BASE_URL" <<'NODE'
const raw = process.argv[2] || "";
if (/[\u0000-\u001f\u007f"'\\]/.test(raw)) {
  console.error("Static frontend build FAILED: --api-base-url enthaelt unzulaessige Zeichen.");
  process.exit(1);
}
let url;
try {
  url = new URL(raw);
} catch {
  console.error("Static frontend build FAILED: --api-base-url ist keine gueltige URL.");
  process.exit(1);
}
if (
  url.protocol !== "https:" ||
  !url.hostname ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)
) {
  console.error("Static frontend build FAILED: --api-base-url muss ein externer HTTPS-Origin ohne Pfad, Zugangsdaten, Query oder Fragment sein.");
  process.exit(1);
}

const identityPlatformApiKey = process.env.IDENTITY_PLATFORM_API_KEY || "";
if (!/^AIza[0-9A-Za-z_-]{35}$/.test(identityPlatformApiKey)) {
  console.error("Static frontend build FAILED: --identity-platform-api-key muss ein gueltiger Identity-Platform-Web-API-Key sein.");
  process.exit(1);
}

const identityPlatformProjectId = process.env.IDENTITY_PLATFORM_PROJECT_ID || "";
if (
  !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(identityPlatformProjectId) ||
  identityPlatformProjectId.includes("--")
) {
  console.error("Static frontend build FAILED: --identity-platform-project-id muss eine kanonische Google-Cloud-Projekt-ID sein.");
  process.exit(1);
}
NODE
fi

# Der Builder darf ausschliesslich unter dist/ schreiben. Bestehende Symlinks
# im Zielpfad werden abgelehnt, bevor spaeter bereinigt wird.
mkdir -p "$ROOT_DIR/dist"
OUTPUT_DIR="$(node - "$ROOT_DIR" "$OUTPUT_ARG" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [rootInput, outputInput] = process.argv.slice(2);
const root = fs.realpathSync(rootInput);
const output = path.resolve(root, outputInput);
const dist = path.join(root, "dist");

function reject(message) {
  console.error(`Static frontend build FAILED: ${message}`);
  process.exit(1);
}

if (fs.lstatSync(dist).isSymbolicLink()) reject(`Symlink als Staging-Verzeichnis ist nicht zulaessig: ${dist}`);
if (!output.startsWith(`${dist}${path.sep}`)) reject("--output muss unter dist/ liegen.");

const relativeParts = path.relative(dist, output).split(path.sep).filter(Boolean);
let current = dist;
for (const part of ["", ...relativeParts]) {
  if (part) current = path.join(current, part);
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
    reject(`Symlink im Ausgabepfad ist nicht zulaessig: ${current}`);
  }
}

console.log(output);
NODE
)"

STAGE_DIR="$(mktemp -d "$ROOT_DIR/dist/.static-frontend-build.XXXXXX")"

cleanup() {
  if [ -n "${STAGE_DIR:-}" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf -- "$STAGE_DIR"
  fi
}
trap cleanup EXIT

build_pages() {
  mkdir -p \
    "$STAGE_DIR/data" \
    "$STAGE_DIR/demo" \
    "$STAGE_DIR/public/hospitation" \
    "$STAGE_DIR/public/brand/mitmachen/icons" \
    "$STAGE_DIR/public/brand/modules/stakeholder" \
    "$STAGE_DIR/public/brand/modules/hospitation" \
    "$STAGE_DIR/public/brand/modules/formate" \
    "$STAGE_DIR/public/brand/versorgungs-kompass" \
    "$STAGE_DIR/public/media/demo/mitmachen" \
    "$STAGE_DIR/public/media/social" \
    "$STAGE_DIR/deutschlandkarte-project/data" \
    "$STAGE_DIR/state-flags" \
    "$STAGE_DIR/mitmachen" \
    "$STAGE_DIR/hospitation" \
    "$STAGE_DIR/vendor"

  touch "$STAGE_DIR/.nojekyll"
  cp "$ROOT_DIR/politik-offline.html" "$STAGE_DIR/politik-offline.html"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.html"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.css" "$STAGE_DIR/versorgungs-kompass.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass-no-script.css" "$STAGE_DIR/versorgungs-kompass-no-script.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.js" "$STAGE_DIR/versorgungs-kompass.js"
  cp "$FRONTEND_DIR/app/versorgungs-kompass-routes.js" "$STAGE_DIR/versorgungs-kompass-routes.js"
  cp "$FRONTEND_DIR/app/hospitation/index.html" "$STAGE_DIR/hospitation/index.html"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.css" "$STAGE_DIR/hospitation/hospitation.css"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.js" "$STAGE_DIR/hospitation/hospitation.js"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.html" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.css" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.css"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.js" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.html" "$STAGE_DIR/versorgungs-kompass-map.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.css" "$STAGE_DIR/versorgungs-kompass-map.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.js" "$STAGE_DIR/versorgungs-kompass-map.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-map-teaser.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.css" "$STAGE_DIR/versorgungs-kompass-map-teaser.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.js" "$STAGE_DIR/versorgungs-kompass-map-teaser.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.css" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.js" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.js"
  for asset in berlin.svg brandenburg.svg bremen.svg niedersachsen.svg rheinland-pfalz.svg saarland.svg sachsen-anhalt.svg; do
    cp "$FRONTEND_DIR/map/state-flags/$asset" "$STAGE_DIR/state-flags/$asset"
  done

  # Pages verwendet dieselbe App-Shell wie das Target. Ausschliesslich der
  # Runtime- und Datenadapter wird durch eine anonyme, lokale Demo-API ersetzt.
  # Das Amtstraeger-Verzeichnis ist ein getrennter, feldminimierter
  # Pages-Snapshot und gelangt niemals in das Target-Artefakt.
  cp "$FRONTEND_DIR/data/public-politics-directory.js" "$STAGE_DIR/data/public-politics-directory.js"
  cp "$FRONTEND_DIR/data/demo-data.js" "$STAGE_DIR/data/demo-data.js"
  cp "$FRONTEND_DIR/data/demo-api.js" "$STAGE_DIR/data/demo-api.js"
  cp "$FRONTEND_DIR/data/data-service.js" "$STAGE_DIR/data/data-service.js"
  cp "$FRONTEND_DIR/data/sector-registry.js" "$STAGE_DIR/data/sector-registry.js"
  cp "$FRONTEND_DIR/data/hospitation-model.js" "$STAGE_DIR/data/hospitation-model.js"
  cp "$FRONTEND_DIR/data/hospitation-export.js" "$STAGE_DIR/data/hospitation-export.js"
  cp "$FRONTEND_DIR/data/activity-model.js" "$STAGE_DIR/data/activity-model.js"
  cp "$FRONTEND_DIR/data/document-text-extractor.js" "$STAGE_DIR/data/document-text-extractor.js"
  cp -R "$FRONTEND_DIR/vendor/." "$STAGE_DIR/vendor/"

  cat > "$STAGE_DIR/data/runtime-config.js" <<'EOF'
window.VERSORGUNGS_COMPASS_CONFIG = {
  dataMode: "demo",
  authMode: "anonymous-demo",
  demoRole: "admin",
  apiBaseUrl: "",
  apiCredentials: "same-origin",
  requireApiGateway: false,
  cleanUrls: false,
  capabilities: {
    contactRole: true,
    contactConsent: true,
    allDemoContactsInvitable: true,
    ownerOnlyContactChannels: true,
    organizationPrimarySystems: true,
    registrationIntake: true,
    contactImageSources: true,
    organizationAssets: false,
    expertOrganizationAssets: false,
    stakeholderOrganizationAssets: true
  }
};
EOF

  cp "$FRONTEND_DIR/map/data/de-geojson.js" "$STAGE_DIR/deutschlandkarte-project/data/de-geojson.js"
  cp "$FRONTEND_DIR/map/data/city-labels.js" "$STAGE_DIR/deutschlandkarte-project/data/city-labels.js"
  cp "$FRONTEND_DIR/map/data/state-labels.js" "$STAGE_DIR/deutschlandkarte-project/data/state-labels.js"
  cp "$FRONTEND_DIR/map/data/state-polygons.js" "$STAGE_DIR/deutschlandkarte-project/data/state-polygons.js"
  cp "$FRONTEND_DIR/map/data/constituency-polygons.js" "$STAGE_DIR/deutschlandkarte-project/data/constituency-polygons.js"
  for asset in \
    demo-profile-admin.svg \
    demo-profile-editor.svg \
    demo-profile-viewer.svg; do
    if [ -f "$ROOT_DIR/public/$asset" ]; then
      cp "$ROOT_DIR/public/$asset" "$STAGE_DIR/public/$asset"
    fi
  done
  for asset in \
    mark.svg \
    mark-on-dark.svg \
    lockup-horizontal.svg \
    flechtwerk-mark.svg \
    flechtwerk-mark-on-dark.svg \
    flechtwerk-lockup-horizontal.svg \
    flechtwerk-lockup-horizontal-on-dark.svg; do
    cp "$ROOT_DIR/public/brand/mitmachen/$asset" "$STAGE_DIR/public/brand/mitmachen/$asset"
  done
  for asset in app-icon-32.png app-icon-180.png app-icon-192.png app-icon-512.png; do
    cp "$ROOT_DIR/public/brand/mitmachen/icons/$asset" "$STAGE_DIR/public/brand/mitmachen/icons/$asset"
  done
  for module in stakeholder hospitation formate; do
    for asset in mark.svg mark-on-dark.svg lockup-horizontal.svg; do
      cp "$ROOT_DIR/public/brand/modules/$module/$asset" "$STAGE_DIR/public/brand/modules/$module/$asset"
    done
  done
  for asset in mark.svg mark-on-dark.svg lockup-horizontal.svg; do
    cp "$ROOT_DIR/public/brand/versorgungs-kompass/$asset" "$STAGE_DIR/public/brand/versorgungs-kompass/$asset"
  done
  cp "$ROOT_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg" "$STAGE_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"
  cp "$ROOT_DIR/public/media/social/mitmachen-share-v1.png" "$STAGE_DIR/public/media/social/mitmachen-share-v1.png"
  cp "$ROOT_DIR/public/media/social/mitmachen-share-v2.png" "$STAGE_DIR/public/media/social/mitmachen-share-v2.png"
  cp "$ROOT_DIR/public/media/social/mitmachen-share-v3.png" "$STAGE_DIR/public/media/social/mitmachen-share-v3.png"
  cp "$ROOT_DIR/public/media/social/versorgungs-netzwerk-share-v1.png" "$STAGE_DIR/public/media/social/versorgungs-netzwerk-share-v1.png"
  cp "$ROOT_DIR/public/manifest.pages.webmanifest" "$STAGE_DIR/manifest.webmanifest"
  for asset in mitmachen-hospitations-framework.docx mitmachen-hospitations-framework.pdf; do
    if [ -f "$ROOT_DIR/public/hospitation/$asset" ]; then
      cp "$ROOT_DIR/public/hospitation/$asset" "$STAGE_DIR/public/hospitation/$asset"
    fi
  done

  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./map/versorgungs-kompass-#./versorgungs-kompass-#g; s#\.\./map/data/#./deutschlandkarte-project/data/#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./login/login\.html#./login.html#g' "$STAGE_DIR/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/#./public/#g' "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/hospitation/#./public/hospitation/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g; s#\.\./pages/mitmachen/#./mitmachen/#g; s#\.\./mitmachen/#./mitmachen/#g' "$STAGE_DIR/versorgungs-kompass.html"
  perl -0pi -e 's#\.\./\.\./login/auth-#../auth-#g; s#\.\./\.\./data/#../data/#g; s#\.\./versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./\.\./public/brand/#../public/brand/#g; s#\.\./\.\./\.\./public/manifest\.webmanifest#../manifest.webmanifest#g; s#\.\./\.\./\.\./public/app-icon-#../public/app-icon-#g' "$STAGE_DIR/hospitation/index.html"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./public/#../public/#g; s#\.\./public/#../public/#g; s#\.\./\.\./data/#../data/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g' "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's~href="./index\.html"~href="../#home"~g' "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's#public/brand/versorgungs-kompass/icons/app-icon-#public/brand/mitmachen/icons/app-icon-#g' "$STAGE_DIR/versorgungs-kompass.html" "$STAGE_DIR/hospitation/index.html" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./\.\./public/#./public/#g; s#\.\./public/#./public/#g; s#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map.html"
  perl -0pi -e 's#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  perl -0pi -e 's#"start_url": "\.\./frontend/app/versorgungs-kompass\.html"#"start_url": "./\#home"#; s#"start_url": "\.\./app/versorgungs-kompass\.html"#"start_url": "./\#home"#; s#"scope": "\.\./"#"scope": "./"#; s#"src": "\./brand/#"src": "./public/brand/#g; s#"src": "\./app-icon-#"src": "./public/app-icon-#g' "$STAGE_DIR/manifest.webmanifest"

  node - "$STAGE_DIR" "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const repositoryRoot = process.argv[3];
const {
  parseHtmlAttributes,
  scanHtmlStartTags
} = require(path.join(repositoryRoot, "scripts", "html_metadata_tags.cjs"));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
  });
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function injectShareMetadata(html, metadata) {
  const existingTags = scanHtmlStartTags(html, ["link", "meta"])
    .map((tag) => parseHtmlAttributes(tag));
  const unsafeTag = existingTags.find((parsed) =>
    parsed.duplicateNames.length > 0 || parsed.structuralCharacterReferenceNames.length > 0
  );
  if (unsafeTag) {
    throw new Error(`Pages-Build fand mehrdeutige Share-Metadaten fuer ${metadata.url}.`);
  }
  const alreadyHasShareMetadata = existingTags.some((attributes) => {
    attributes = attributes.values;
    const rel = String(attributes.rel || "").toLowerCase().split(/\s+/);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    return rel.includes("canonical") || property.startsWith("og:") || name.startsWith("twitter:");
  });
  if (alreadyHasShareMetadata) {
    throw new Error(`Pages-Build fand bereits Share-Metadaten fuer ${metadata.url}.`);
  }

  const tags = [
    `<link rel="canonical" href="${escapeAttribute(metadata.url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="de_DE" />',
    '<meta property="og:site_name" content="#Mitmachen" />',
    `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(metadata.url)}" />`,
    `<meta property="og:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeAttribute(metadata.image)}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`
  ];

  return html.replace(/\s*<\/head>/, `\n    ${tags.join("\n    ")}\n  </head>`);
}

for (const htmlPath of walk(root)) {
  const html = fs.readFileSync(htmlPath, "utf8").replace(
    /\n?\s*<script\b[^>]*src=["'][^"']*(?:auth-config|auth-guard)\.js[^"']*["'][^>]*><\/script>/gi,
    ""
  );
  fs.writeFileSync(htmlPath, html);
}

const appPath = path.join(root, "versorgungs-kompass.html");
let appHtml = fs.readFileSync(appPath, "utf8");
if (!/<meta\s+name=["']robots["']/i.test(appHtml)) {
  appHtml = appHtml.replace(
    /\s*<\/head>/,
    '\n    <meta name="robots" content="noindex, nofollow" />\n  </head>'
  );
}
appHtml = appHtml.replace(
  /\n?\s*<section\b[^>]*data-target-session[^>]*>[\s\S]*?<\/section>/i,
  ""
);
const dataServiceScript = '<script src="./data/data-service.js"></script>';
if (!appHtml.includes(dataServiceScript)) {
  throw new Error("Pages-Build konnte den Data-Service-Einstieg in der App-Shell nicht finden.");
}
appHtml = appHtml.replace(
  dataServiceScript,
  '<script src="./data/public-politics-directory.js"></script>\n'
    + '    <script src="./data/demo-data.js"></script>\n'
    + '    <script src="./data/demo-api.js"></script>\n    '
    + dataServiceScript
);
const pagesBaseUrl = "https://timofrank.github.io/mitmachen";
const rootShareMetadata = {
  url: `${pagesBaseUrl}/`,
  title: "#Mitmachen",
  description: "Deine Plattform für Austausch, Wissen und Vernetzung.",
  image: `${pagesBaseUrl}/public/media/social/mitmachen-share-v3.png`,
  imageAlt: "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund."
};
appHtml = injectShareMetadata(appHtml, rootShareMetadata);
fs.writeFileSync(appPath, appHtml);
fs.writeFileSync(path.join(root, "index.html"), appHtml);

const registrationPath = path.join(root, "mitmachen", "versorgungs-netzwerk.html");
const registrationHtml = injectShareMetadata(fs.readFileSync(registrationPath, "utf8"), {
  url: `${pagesBaseUrl}/mitmachen/versorgungs-netzwerk.html`,
  title: "Ihre Erfahrung zählt: Digitale Versorgung besser machen",
  description: "Entdecken Sie die Idee des Versorgungs-Netzwerks – als Konzeptdemo mit fiktiven Angaben, ohne echte Anmeldung, Übermittlung oder Speicherung.",
  image: `${pagesBaseUrl}/public/media/social/versorgungs-netzwerk-share-v1.png`,
  imageAlt: "#Mitmachen Versorgungs-Netzwerk: Ihre Erfahrung zählt – Konzeptdemo für digitale Beteiligung."
});
fs.writeFileSync(registrationPath, registrationHtml);

function redirectDocument(target) {
  return injectShareMetadata(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${target}">
    <title>Versorgungs-Kompass Demo</title>
  </head>
  <body><p><a href="${target}">Oeffentliche Demo oeffnen</a></p></body>
</html>
`, rootShareMetadata);
}

fs.writeFileSync(path.join(root, "demo", "index.html"), redirectDocument("../#home"));
NODE

  node - "$STAGE_DIR/data/demo-data.js" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
let source = fs.readFileSync(file, "utf8");
source = source.replaceAll("../../public/", "../public/");
const fallbackAssets = ["demo-profile-admin.svg", "demo-profile-editor.svg", "demo-profile-viewer.svg"];
let doctorIndex = 0;
source = source.replace(
  /(const\s+demoDoctorImage\w+\s*=\s*)demoAssetUrl\("[^"]+"\);/g,
  (_, prefix) => `${prefix}demoAssetUrl("../public/${fallbackAssets[doctorIndex++ % fallbackAssets.length]}");`
);
const profileAssets = ["demo-profile-admin.svg", "demo-profile-editor.svg", "demo-profile-viewer.svg"];
let profileIndex = 0;
source = source.replace(
  /(const\s+demoProfileImage\w+\s*=\s*)"https?:\/\/[^"]+";/g,
  (_, prefix) => `${prefix}demoAssetUrl("../public/${profileAssets[profileIndex++ % profileAssets.length]}");`
);
fs.writeFileSync(file, source);
NODE
}

build_identity_portal() {
  local portal_dir="$FRONTEND_DIR/identity-portal"
  local portal_dist_dir="$portal_dir/dist"

  [ -f "$portal_dir/package-lock.json" ] || fail "Identity-Portal-Lockfile fehlt."
  [ -d "$portal_dir/node_modules" ] || fail "Identity-Portal-Abhaengigkeiten fehlen; zuerst npm ci --prefix frontend/identity-portal ausfuehren."

  npm --prefix "$portal_dir" run build

  node - "$portal_dist_dir" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const portalRoot = process.argv[2];
const expected = [
  "assets/action.css",
  "assets/action.js",
  "assets/app.css",
  "assets/app.js",
  "brand/versorgungs-kompass.svg",
  "index.html",
  "konto/passwort-festlegen/index.html",
  "portal-config.js"
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Identity-Portal darf keine Symlinks enthalten: ${fullPath}`);
    }
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile()
      ? [path.relative(portalRoot, fullPath).split(path.sep).join("/")]
      : [];
  });
}

const actual = walk(portalRoot).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(
    `Identity-Portal-Artefakt weicht von der expliziten Acht-Dateien-Allowlist ab: ${actual.join(", ")}`
  );
}
NODE

  mkdir -p "$STAGE_DIR/public/auth"
  cp -R "$portal_dist_dir/." "$STAGE_DIR/public/auth/"

  IDENTITY_PLATFORM_API_KEY="$IDENTITY_PLATFORM_API_KEY" \
  IDENTITY_PLATFORM_PROJECT_ID="$IDENTITY_PLATFORM_PROJECT_ID" \
  IDENTITY_PORTAL_PROTECTED_ORIGIN="$API_BASE_URL" \
  node - "$STAGE_DIR/public/auth/portal-config.js" <<'NODE'
const fs = require("node:fs");

const configPath = process.argv[2];
const apiKey = process.env.IDENTITY_PLATFORM_API_KEY;
const projectId = process.env.IDENTITY_PLATFORM_PROJECT_ID;
const protectedOrigin = process.env.IDENTITY_PORTAL_PROTECTED_ORIGIN;

const rendered = `/*
 * Browser-visible Identity-Platform-Konfiguration. Die Werte werden fuer jedes
 * Target-Artefakt validiert und explizit injiziert.
 */
window.IDENTITY_PORTAL_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: ${JSON.stringify(apiKey)},
    authDomain: "versorgungs-kompass.de",
    projectId: ${JSON.stringify(projectId)}
  }),
  allowedContinueOrigins: Object.freeze([
    ${JSON.stringify(protectedOrigin)}
  ]),
  privacyPolicyUrl: "https://www.gematik.de/datenschutz",
  legalNoticeUrl: "https://www.gematik.de/impressum",
  supportUrl: "https://www.gematik.de/kontakt",
  enableLocalPreview: false
});
`;

fs.writeFileSync(configPath, rendered, { encoding: "utf8", mode: 0o644 });
NODE

  node - "$STAGE_DIR/public/auth" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const portalRoot = process.argv[2];
const expected = [
  "assets/action.css",
  "assets/action.js",
  "assets/app.css",
  "assets/app.js",
  "brand/versorgungs-kompass.svg",
  "index.html",
  "konto/passwort-festlegen/index.html",
  "portal-config.js"
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unerwarteter Symlink im Portal: ${fullPath}`);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile()
      ? [path.relative(portalRoot, fullPath).split(path.sep).join("/")]
      : [];
  });
}

const actual = walk(portalRoot).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Target enthaelt nicht exakt die acht freigegebenen Portaldateien: ${actual.join(", ")}`);
}

const allSources = actual.map((relative) =>
  fs.readFileSync(path.join(portalRoot, relative), "utf8")
).join("\n");
if (/REPLACE_WITH_|enableLocalPreview:\s*true/.test(allSources)) {
  throw new Error("Target-Portal enthaelt Platzhalter oder aktivierte lokale Vorschau.");
}

const signIn = fs.readFileSync(path.join(portalRoot, "index.html"), "utf8");
const password = fs.readFileSync(
  path.join(portalRoot, "konto", "passwort-festlegen", "index.html"),
  "utf8"
);
if (
  !signIn.includes('data-identity-portal="signin"') ||
  !password.includes('data-identity-portal="password"') ||
  !signIn.includes('src="/public/auth/assets/app.js?v=20260731-1"') ||
  !password.includes('src="/public/auth/assets/action.js?v=20260731-1"')
) {
  throw new Error("Identity-Portal-Dokumente erfuellen den statischen Routingvertrag nicht.");
}
NODE
}

build_target() {
  mkdir -p \
    "$STAGE_DIR/data" \
    "$STAGE_DIR/public/hospitation" \
    "$STAGE_DIR/public/brand/gematik" \
    "$STAGE_DIR/public/brand/mitmachen" \
    "$STAGE_DIR/public/brand/modules" \
    "$STAGE_DIR/public/brand/versorgungs-kompass/icons" \
    "$STAGE_DIR/public/auth" \
    "$STAGE_DIR/public/media/demo/mitmachen" \
    "$STAGE_DIR/public/media/social" \
    "$STAGE_DIR/deutschlandkarte-project/data" \
    "$STAGE_DIR/state-flags" \
    "$STAGE_DIR/mitmachen" \
    "$STAGE_DIR/hospitation" \
    "$STAGE_DIR/vendor"

  touch "$STAGE_DIR/.nojekyll"
  build_identity_portal
  cp "$FRONTEND_DIR/public-entry/index.html" "$STAGE_DIR/public-index.html"
  cp "$FRONTEND_DIR/pages/mitmachen/index.html" "$STAGE_DIR/index.html"
  cp "$FRONTEND_DIR/login/login.html" "$STAGE_DIR/login.html"
  cp "$FRONTEND_DIR/login/login.css" "$STAGE_DIR/login.css"
  cp "$FRONTEND_DIR/login/auth-config.js" "$STAGE_DIR/auth-config.js"
  cp "$FRONTEND_DIR/login/auth-guard.js" "$STAGE_DIR/auth-guard.js"
  cp "$FRONTEND_DIR/login/auth-login.js" "$STAGE_DIR/auth-login.js"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.html"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.css" "$STAGE_DIR/versorgungs-kompass.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass-no-script.css" "$STAGE_DIR/versorgungs-kompass-no-script.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.js" "$STAGE_DIR/versorgungs-kompass.js"
  cp "$FRONTEND_DIR/app/versorgungs-kompass-routes.js" "$STAGE_DIR/versorgungs-kompass-routes.js"
  cp "$FRONTEND_DIR/app/hospitation/index.html" "$STAGE_DIR/hospitation/index.html"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.css" "$STAGE_DIR/hospitation/hospitation.css"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.js" "$STAGE_DIR/hospitation/hospitation.js"
  cp "$FRONTEND_DIR/app/hospitation/import.html" "$STAGE_DIR/hospitation/import.html"
  cp "$FRONTEND_DIR/app/hospitation/import.css" "$STAGE_DIR/hospitation/import.css"
  cp "$FRONTEND_DIR/app/hospitation/import.js" "$STAGE_DIR/hospitation/import.js"
  cp "$FRONTEND_DIR/pages/mitmachen/index.html" "$STAGE_DIR/mitmachen/index.html"
  cp "$FRONTEND_DIR/pages/mitmachen/mitmachen.css" "$STAGE_DIR/mitmachen/mitmachen.css"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.html" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.css" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.css"
  cp "$FRONTEND_DIR/pages/mitmachen/versorgungs-netzwerk.js" "$STAGE_DIR/mitmachen/versorgungs-netzwerk.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.html" "$STAGE_DIR/versorgungs-kompass-map.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.css" "$STAGE_DIR/versorgungs-kompass-map.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map.js" "$STAGE_DIR/versorgungs-kompass-map.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-map-teaser.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.css" "$STAGE_DIR/versorgungs-kompass-map-teaser.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-map-teaser.js" "$STAGE_DIR/versorgungs-kompass-map-teaser.js"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.css" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.css"
  cp "$FRONTEND_DIR/map/versorgungs-kompass-contact-mini-map.js" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.js"
  for asset in berlin.svg brandenburg.svg bremen.svg niedersachsen.svg rheinland-pfalz.svg saarland.svg sachsen-anhalt.svg; do
    cp "$FRONTEND_DIR/map/state-flags/$asset" "$STAGE_DIR/state-flags/$asset"
  done

  # Die Realanwendung erhaelt nur Runtime-/Modellcode. Fachliche Daten kommen
  # ueber das geschuetzte API; statische Kontakt-, Demo-, Experten- und
  # Stakeholder-Fallbacks werden bewusst nicht in das Artefakt kopiert.
  cp "$FRONTEND_DIR/data/runtime-config.js" "$STAGE_DIR/data/runtime-config.js"
  cp "$FRONTEND_DIR/data/sector-registry.js" "$STAGE_DIR/data/sector-registry.js"
  cp "$FRONTEND_DIR/data/hospitation-model.js" "$STAGE_DIR/data/hospitation-model.js"
  cp "$FRONTEND_DIR/data/hospitation-export.js" "$STAGE_DIR/data/hospitation-export.js"
  cp "$FRONTEND_DIR/data/activity-model.js" "$STAGE_DIR/data/activity-model.js"
  cp "$FRONTEND_DIR/data/document-text-extractor.js" "$STAGE_DIR/data/document-text-extractor.js"
  cp "$FRONTEND_DIR/data/data-service.js" "$STAGE_DIR/data/data-service.js"
  cp -R "$FRONTEND_DIR/vendor/." "$STAGE_DIR/vendor/"

  cp "$ROOT_DIR/public/brand/gematik/gematik-logo-standard.png" "$STAGE_DIR/public/brand/gematik/gematik-logo-standard.png"
  cp -R "$ROOT_DIR/public/brand/mitmachen/." "$STAGE_DIR/public/brand/mitmachen/"
  cp -R "$ROOT_DIR/public/brand/modules/." "$STAGE_DIR/public/brand/modules/"
  for asset in mark.svg mark-on-dark.svg lockup-horizontal.svg; do
    cp "$ROOT_DIR/public/brand/versorgungs-kompass/$asset" "$STAGE_DIR/public/brand/versorgungs-kompass/$asset"
  done
  for asset in app-icon-32.png app-icon-180.png app-icon-192.png app-icon-512.png; do
    cp "$ROOT_DIR/public/brand/versorgungs-kompass/icons/$asset" "$STAGE_DIR/public/brand/versorgungs-kompass/icons/$asset"
  done
  cp "$ROOT_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg" "$STAGE_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"
  cp "$ROOT_DIR/public/media/social/mitmachen-share-v3.png" "$STAGE_DIR/public/media/social/mitmachen-share-v3.png"
  cp "$ROOT_DIR/public/manifest.webmanifest" "$STAGE_DIR/manifest.webmanifest"
  for asset in mitmachen-hospitations-framework.docx mitmachen-hospitations-framework.pdf; do
    if [ -f "$ROOT_DIR/public/hospitation/$asset" ]; then
      cp "$ROOT_DIR/public/hospitation/$asset" "$STAGE_DIR/public/hospitation/$asset"
    fi
  done

  cp "$FRONTEND_DIR/map/data/de-geojson.js" "$STAGE_DIR/deutschlandkarte-project/data/de-geojson.js"
  cp "$FRONTEND_DIR/map/data/city-labels.js" "$STAGE_DIR/deutschlandkarte-project/data/city-labels.js"
  cp "$FRONTEND_DIR/map/data/state-labels.js" "$STAGE_DIR/deutschlandkarte-project/data/state-labels.js"
  cp "$FRONTEND_DIR/map/data/state-polygons.js" "$STAGE_DIR/deutschlandkarte-project/data/state-polygons.js"
  cp "$FRONTEND_DIR/map/data/constituency-polygons.js" "$STAGE_DIR/deutschlandkarte-project/data/constituency-polygons.js"

  node - \
    "$FRONTEND_DIR/public-entry/public-entry.css" \
    "$STAGE_DIR/public-index.html" <<'NODE'
const fs = require("node:fs");

const [stylePath, ...documentPaths] = process.argv.slice(2);
const style = fs.readFileSync(stylePath, "utf8").trim();
const markerPattern = /<link rel="stylesheet" href="\.\/public-entry\.css" data-inline-public-styles\s*\/>/g;

if (!style || /@import|url\s*\(/i.test(style) || /<\/style/i.test(style)) {
  throw new Error("Public-Entry-Styles muessen eigenstaendig und sicher inline-faehig sein.");
}

for (const documentPath of documentPaths) {
  const source = fs.readFileSync(documentPath, "utf8");
  const markers = source.match(markerPattern) || [];
  if (markers.length !== 1) {
    throw new Error(`Public-Entry-Dokument erwartet genau einen Style-Marker: ${documentPath}`);
  }
  const rendered = source.replace(
    markerPattern,
    `<style data-public-entry-styles>\n${style}\n    </style>`
  );
  fs.writeFileSync(documentPath, rendered);
}
NODE

  node - \
    "$STAGE_DIR/public-index.html" \
    "$API_BASE_URL" \
    "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [documentPath, targetBaseUrl, repositoryRoot] = process.argv.slice(2);
const {
  parseHtmlAttributes,
  scanHtmlStartTags
} = require(path.join(repositoryRoot, "scripts", "html_metadata_tags.cjs"));

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function injectShareMetadata(html, metadata) {
  const existingTags = scanHtmlStartTags(html, ["link", "meta"])
    .map((tag) => parseHtmlAttributes(tag));
  const unsafeTag = existingTags.find((parsed) =>
    parsed.duplicateNames.length > 0 || parsed.structuralCharacterReferenceNames.length > 0
  );
  if (unsafeTag) {
    throw new Error(`Target-Build fand mehrdeutige Share-Metadaten fuer ${metadata.url}.`);
  }
  const alreadyHasShareMetadata = existingTags.some((attributes) => {
    attributes = attributes.values;
    const rel = String(attributes.rel || "").toLowerCase().split(/\s+/);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    return rel.includes("canonical") || property.startsWith("og:") || name.startsWith("twitter:");
  });
  if (alreadyHasShareMetadata) {
    throw new Error(`Target-Build fand bereits Share-Metadaten fuer ${metadata.url}.`);
  }

  const tags = [
    `<link rel="canonical" href="${escapeAttribute(metadata.url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="de_DE" />',
    '<meta property="og:site_name" content="#Mitmachen" />',
    `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(metadata.url)}" />`,
    `<meta property="og:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeAttribute(metadata.image)}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`
  ];

  return html.replace(/\s*<\/head>/, `\n    ${tags.join("\n    ")}\n  </head>`);
}

const shareUrl = `${targetBaseUrl}/`;
const shareImage = `${targetBaseUrl}/public/media/social/mitmachen-share-v3.png`;
const metadata = {
  url: shareUrl,
  title: "#Mitmachen",
  description: "Deine Plattform für Austausch, Wissen und Vernetzung.",
  image: shareImage,
  imageAlt: "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund."
};
const source = fs.readFileSync(documentPath, "utf8");
fs.writeFileSync(documentPath, injectShareMetadata(source, metadata));
NODE

  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./map/versorgungs-kompass-#./versorgungs-kompass-#g; s#\.\./map/data/#./deutschlandkarte-project/data/#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./login/login\.html#./login.html#g' "$STAGE_DIR/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/#./public/#g' "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/hospitation/#./public/hospitation/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g; s#\.\./pages/mitmachen/#./mitmachen/#g; s#\.\./mitmachen/#./mitmachen/#g' "$STAGE_DIR/versorgungs-kompass.html"
  perl -0pi -e 's#\.\./\.\./login/auth-#../auth-#g; s#\.\./\.\./data/#../data/#g; s#\.\./versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./\.\./public/brand/#../public/brand/#g; s#\.\./\.\./\.\./public/manifest\.webmanifest#../manifest.webmanifest#g; s#\.\./\.\./\.\./public/app-icon-#../public/app-icon-#g' "$STAGE_DIR/hospitation/index.html" "$STAGE_DIR/hospitation/import.html"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./public/#../public/#g; s#\.\./public/#../public/#g; s#\.\./\.\./data/#../data/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g' "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's#\.\./map/versorgungs-kompass-map-teaser\.html#./versorgungs-kompass-map-teaser.html#g; s#\.\./app/versorgungs-kompass-routes\.js#./versorgungs-kompass-routes.js#g; s#\.\./app/versorgungs-kompass\.html#./versorgungs-kompass.html#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g' "$STAGE_DIR/login.html"
  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./\.\./public/#./public/#g; s#\.\./public/#./public/#g; s#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map.html"
  perl -0pi -e 's#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  perl -0pi -e 's#loginPath: "\.\./login/login\.html"#loginPath: "/login.html"#; s#defaultPath: "\.\./app/versorgungs-kompass\.html"#defaultPath: "/start"#' "$STAGE_DIR/auth-config.js"
  perl -0pi -e 's#"start_url": "\.\./frontend/app/versorgungs-kompass\.html"#"start_url": "/start"#; s#"start_url": "\.\./app/versorgungs-kompass\.html"#"start_url": "/start"#; s#"scope": "\.\./"#"scope": "/"#; s#"src": "\./brand/#"src": "./public/brand/#g; s#"src": "\./app-icon-#"src": "./public/app-icon-#g' "$STAGE_DIR/manifest.webmanifest"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./app/hospitation/index\.html#../hospitation/index.html#g; s#\.\./\.\./map/versorgungs-kompass-map-teaser\.html#../versorgungs-kompass-map-teaser.html#g; s#\./versorgungs-netzwerk\.html#./versorgungs-netzwerk.html#g' "$STAGE_DIR/mitmachen/index.html"
  perl -0pi -e 's#\./mitmachen\.css#./mitmachen/mitmachen.css#g; s#\.\./\.\./\.\./public/#./public/#g; s#\.\./\.\./app/versorgungs-kompass\.html#./versorgungs-kompass.html#g' "$STAGE_DIR/index.html"
  perl -0pi -e 's~(?:\.\./|\./)versorgungs-kompass\.html#map~/versorgung/karte~g; s~(?:\.\./|\./)versorgungs-kompass\.html#stakeholders~/stakeholder~g; s~(?:\.\./|\./)versorgungs-kompass\.html#planning~/hospitationen/framework~g; s~(?:\.\./|\./)versorgungs-kompass\.html#formats~/formate~g; s~(?:\.\./|\./)versorgungs-kompass\.html~/start~g' "$STAGE_DIR/index.html" "$STAGE_DIR/mitmachen/index.html"
  perl -0pi -e 's~(href|src)="\./~$1="/~g' "$STAGE_DIR/versorgungs-kompass.html"

  iap_identity_mode="${IAP_IDENTITY_MODE:-iam}"
  iap_external_login_page_uri=""
  iap_external_auth_api_key=""
  if [ "$iap_identity_mode" = "external" ]; then
    iap_external_login_page_uri="${IAP_EXTERNAL_LOGIN_PAGE_URI:-}"
    iap_external_auth_api_key="${IAP_EXTERNAL_AUTH_API_KEY:-}"
  fi

  node "$ROOT_DIR/scripts/prepare_target_frontend_config.mjs" \
    "$STAGE_DIR/data/runtime-config.js" \
    "$API_BASE_URL" \
    api \
    "$AUTH_MODE" \
    "$iap_identity_mode" \
    "$iap_external_login_page_uri" \
    "$iap_external_auth_api_key"

  unset iap_identity_mode iap_external_login_page_uri iap_external_auth_api_key

}

REVISION="$(git -C "$ROOT_DIR" rev-parse --verify HEAD 2>/dev/null || true)"
if ! printf '%s' "$REVISION" | grep -Eq '^[0-9a-fA-F]{7,64}$'; then
  REVISION="unknown"
fi

if [ "$PROFILE" = "pages" ]; then
  build_pages
else
  build_target

  # Die App-Shell wird nicht gecacht, ihre statischen Abhängigkeiten dagegen
  # schon. Eine revisionsgebundene URL stellt sicher, dass nach einem Rollout
  # keine inkompatible JS-/CSS-Version aus dem Browsercache weiterläuft.
  node - "$STAGE_DIR/versorgungs-kompass.html" "$REVISION" <<'NODE'
const fs = require("node:fs");

const [documentPath, revision] = process.argv.slice(2);
const html = fs.readFileSync(documentPath, "utf8");
const versioned = html.replace(
  /(\b(?:src|href)=["'])([^"'?#]+?\.(?:css|m?js))(["'])/gi,
  (match, prefix, assetPath, suffix) => assetPath.endsWith("versorgungs-kompass-no-script.css")
    ? match
    : `${prefix}${assetPath}?v=${revision}${suffix}`
);
fs.writeFileSync(documentPath, versioned);
NODE
fi

ARTIFACT_DIGEST="$(node - "$STAGE_DIR" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const artifactRoot = process.argv[2];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

const files = walk(artifactRoot)
  .map((file) => ({ file, relative: path.relative(artifactRoot, file).split(path.sep).join("/") }))
  .sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0);
const hash = crypto.createHash("sha256");
for (const { file, relative } of files) {
  hash.update(relative);
  hash.update("\0");
  hash.update(fs.readFileSync(file));
  hash.update("\0");
}
console.log(`sha256:${hash.digest("hex")}`);
NODE
)"
printf '{\n  "profile": "%s",\n  "revision": "%s",\n  "artifactDigest": "%s"\n}\n' \
  "$PROFILE" "$REVISION" "$ARTIFACT_DIGEST" > "$STAGE_DIR/build-manifest.json"

mkdir -p "$(dirname "$OUTPUT_DIR")"
rm -rf -- "$OUTPUT_DIR"
mv "$STAGE_DIR" "$OUTPUT_DIR"
STAGE_DIR=""

echo "Static frontend artifact built: $PROFILE -> ${OUTPUT_DIR#$ROOT_DIR/}"
