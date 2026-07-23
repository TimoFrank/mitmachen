#!/usr/bin/env bash

set -euo pipefail

export LC_ALL=C

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PROFILE=""
OUTPUT_ARG=""
API_BASE_URL=""
AUTH_MODE=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build_static_frontend.sh --profile pages --output dist/pages
  bash scripts/build_static_frontend.sh --profile target --output dist/target \
    --api-base-url https://example.invalid --auth-mode oidc|iap

Profiles:
  pages   Oeffentliche, anonyme Demo mit ausschliesslich synthetischen Daten
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
  case "$AUTH_MODE" in
    oidc|iap) ;;
    *) fail "--auth-mode muss fuer das target-Profil oidc oder iap sein." ;;
  esac

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
    "$STAGE_DIR/public/brand/mitmachen" \
    "$STAGE_DIR/public/brand/versorgungs-kompass" \
    "$STAGE_DIR/public/brand/versorgungs-kompass/icons" \
    "$STAGE_DIR/public/media/demo/mitmachen" \
    "$STAGE_DIR/deutschlandkarte-project/data" \
    "$STAGE_DIR/mitmachen" \
    "$STAGE_DIR/hospitation" \
    "$STAGE_DIR/vendor"

  touch "$STAGE_DIR/.nojekyll"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.html"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.css" "$STAGE_DIR/versorgungs-kompass.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.js" "$STAGE_DIR/versorgungs-kompass.js"
  cp "$FRONTEND_DIR/app/hospitation/index.html" "$STAGE_DIR/hospitation/index.html"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.css" "$STAGE_DIR/hospitation/hospitation.css"
  cp "$FRONTEND_DIR/app/hospitation/hospitation.js" "$STAGE_DIR/hospitation/hospitation.js"
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

  # Pages verwendet dieselbe App-Shell wie das Target. Ausschliesslich der
  # Runtime- und Datenadapter wird durch eine anonyme, lokale Demo-API ersetzt.
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
  capabilities: {
    contactRole: true,
    contactConsent: true,
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
  for asset in \
    demo-profile-admin.svg \
    demo-profile-editor.svg \
    demo-profile-viewer.svg; do
    if [ -f "$ROOT_DIR/public/$asset" ]; then
      cp "$ROOT_DIR/public/$asset" "$STAGE_DIR/public/$asset"
    fi
  done
  cp "$ROOT_DIR/public/brand/mitmachen/mark-on-dark.svg" "$STAGE_DIR/public/brand/mitmachen/mark-on-dark.svg"
  cp "$ROOT_DIR/public/brand/mitmachen/lockup-horizontal.svg" "$STAGE_DIR/public/brand/mitmachen/lockup-horizontal.svg"
  cp "$ROOT_DIR/public/brand/versorgungs-kompass/mark.svg" "$STAGE_DIR/public/brand/versorgungs-kompass/mark.svg"
  cp "$ROOT_DIR/public/brand/versorgungs-kompass/mark-on-dark.svg" "$STAGE_DIR/public/brand/versorgungs-kompass/mark-on-dark.svg"
  for asset in app-icon-32.png app-icon-180.png app-icon-192.png app-icon-512.png; do
    cp "$ROOT_DIR/public/brand/versorgungs-kompass/icons/$asset" "$STAGE_DIR/public/brand/versorgungs-kompass/icons/$asset"
  done
  cp "$ROOT_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg" "$STAGE_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"
  cp "$ROOT_DIR/public/manifest.webmanifest" "$STAGE_DIR/manifest.webmanifest"
  for asset in mitmachen-hospitations-framework.docx mitmachen-hospitations-framework.pdf; do
    if [ -f "$ROOT_DIR/public/hospitation/$asset" ]; then
      cp "$ROOT_DIR/public/hospitation/$asset" "$STAGE_DIR/public/hospitation/$asset"
    fi
  done

  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./map/versorgungs-kompass-#./versorgungs-kompass-#g; s#\.\./map/data/#./deutschlandkarte-project/data/#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./login/login\.html#./login.html#g' "$STAGE_DIR/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/hospitation/#./public/hospitation/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g; s#\.\./pages/mitmachen/#./mitmachen/#g; s#\.\./mitmachen/#./mitmachen/#g' "$STAGE_DIR/versorgungs-kompass.html"
  perl -0pi -e 's#\.\./\.\./login/auth-#../auth-#g; s#\.\./\.\./data/#../data/#g; s#\.\./versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./\.\./public/brand/#../public/brand/#g; s#\.\./\.\./\.\./public/manifest\.webmanifest#../manifest.webmanifest#g; s#\.\./\.\./\.\./public/app-icon-#../public/app-icon-#g' "$STAGE_DIR/hospitation/index.html"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./public/#../public/#g; s#\.\./public/#../public/#g; s#\.\./\.\./data/#../data/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g' "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's#\.\./data/#../data/#g; s#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./app/hospitation/index\.html#../hospitation/index.html#g; s#\.\./\.\./map/versorgungs-kompass-map-teaser\.html#../versorgungs-kompass-map-teaser.html#g; s#\./versorgungs-netzwerk\.html#./versorgungs-netzwerk.html#g' "$STAGE_DIR/mitmachen/index.html"
  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./\.\./public/#./public/#g; s#\.\./public/#./public/#g; s#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map.html"
  perl -0pi -e 's#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  perl -0pi -e 's#"start_url": "\.\./frontend/app/versorgungs-kompass\.html"#"start_url": "./versorgungs-kompass.html"#; s#"start_url": "\.\./app/versorgungs-kompass\.html"#"start_url": "./versorgungs-kompass.html"#; s#"scope": "\.\./"#"scope": "./"#; s#"src": "\./brand/#"src": "./public/brand/#g; s#"src": "\./app-icon-#"src": "./public/app-icon-#g' "$STAGE_DIR/manifest.webmanifest"

  node - "$STAGE_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [fullPath] : [];
  });
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
  '<script src="./data/demo-data.js"></script>\n    <script src="./data/demo-api.js"></script>\n    ' + dataServiceScript
);
fs.writeFileSync(appPath, appHtml);

function redirectDocument(target) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${target}">
    <title>Versorgungs-Kompass Demo</title>
    <link rel="canonical" href="${target}">
  </head>
  <body><p><a href="${target}">Oeffentliche Demo oeffnen</a></p></body>
</html>
`;
}

fs.writeFileSync(path.join(root, "index.html"), redirectDocument("./versorgungs-kompass.html#home"));
fs.writeFileSync(path.join(root, "demo", "index.html"), redirectDocument("../versorgungs-kompass.html#home"));
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

build_target() {
  mkdir -p \
    "$STAGE_DIR/data" \
    "$STAGE_DIR/public/hospitation" \
    "$STAGE_DIR/public/brand/gematik" \
    "$STAGE_DIR/public/brand/mitmachen" \
    "$STAGE_DIR/public/brand/versorgungs-kompass/icons" \
    "$STAGE_DIR/public/media/demo/mitmachen" \
    "$STAGE_DIR/deutschlandkarte-project/data" \
    "$STAGE_DIR/mitmachen" \
    "$STAGE_DIR/hospitation" \
    "$STAGE_DIR/vendor"

  touch "$STAGE_DIR/.nojekyll"
  cp "$FRONTEND_DIR/pages/mitmachen/index.html" "$STAGE_DIR/index.html"
  cp "$FRONTEND_DIR/login/login.html" "$STAGE_DIR/login.html"
  cp "$FRONTEND_DIR/login/login.css" "$STAGE_DIR/login.css"
  cp "$FRONTEND_DIR/login/auth-config.js" "$STAGE_DIR/auth-config.js"
  cp "$FRONTEND_DIR/login/auth-guard.js" "$STAGE_DIR/auth-guard.js"
  cp "$FRONTEND_DIR/login/auth-login.js" "$STAGE_DIR/auth-login.js"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.html"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.css" "$STAGE_DIR/versorgungs-kompass.css"
  cp "$FRONTEND_DIR/app/versorgungs-kompass.js" "$STAGE_DIR/versorgungs-kompass.js"
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
  cp "$ROOT_DIR/public/brand/versorgungs-kompass/mark.svg" "$STAGE_DIR/public/brand/versorgungs-kompass/mark.svg"
  cp "$ROOT_DIR/public/brand/versorgungs-kompass/mark-on-dark.svg" "$STAGE_DIR/public/brand/versorgungs-kompass/mark-on-dark.svg"
  for asset in app-icon-32.png app-icon-180.png app-icon-192.png app-icon-512.png; do
    cp "$ROOT_DIR/public/brand/versorgungs-kompass/icons/$asset" "$STAGE_DIR/public/brand/versorgungs-kompass/icons/$asset"
  done
  cp "$ROOT_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg" "$STAGE_DIR/public/media/demo/mitmachen/versorgungs-netzwerk-concept.svg"
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

  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./map/versorgungs-kompass-#./versorgungs-kompass-#g; s#\.\./map/data/#./deutschlandkarte-project/data/#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./login/login\.html#./login.html#g' "$STAGE_DIR/versorgungs-kompass.html" "$STAGE_DIR/versorgungs-kompass.js"
  perl -0pi -e 's#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/hospitation/#./public/hospitation/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g; s#\.\./pages/mitmachen/#./mitmachen/#g; s#\.\./mitmachen/#./mitmachen/#g' "$STAGE_DIR/versorgungs-kompass.html"
  perl -0pi -e 's#\.\./\.\./login/auth-#../auth-#g; s#\.\./\.\./data/#../data/#g; s#\.\./versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./\.\./public/brand/#../public/brand/#g; s#\.\./\.\./\.\./public/manifest\.webmanifest#../manifest.webmanifest#g; s#\.\./\.\./\.\./public/app-icon-#../public/app-icon-#g' "$STAGE_DIR/hospitation/index.html" "$STAGE_DIR/hospitation/import.html"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./public/#../public/#g; s#\.\./public/#../public/#g; s#\.\./\.\./data/#../data/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g' "$STAGE_DIR/mitmachen/versorgungs-netzwerk.html"
  perl -0pi -e 's#\.\./map/versorgungs-kompass-map-teaser\.html#./versorgungs-kompass-map-teaser.html#g; s#\.\./data/#./data/#g; s#\.\./vendor/#./vendor/#g; s#\.\./\.\./public/brand/#./public/brand/#g; s#\.\./\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./public/manifest\.webmanifest#./manifest.webmanifest#g; s#\.\./\.\./public/app-icon-#./public/app-icon-#g; s#\.\./public/app-icon-#./public/app-icon-#g' "$STAGE_DIR/login.html"
  perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./\.\./public/#./public/#g; s#\.\./public/#./public/#g; s#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map.html"
  perl -0pi -e 's#\.\./vendor/#./vendor/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$STAGE_DIR/versorgungs-kompass-map-teaser.html" "$STAGE_DIR/versorgungs-kompass-contact-mini-map.html"
  perl -0pi -e 's#loginPath: "\.\./login/login\.html"#loginPath: "./login.html"#; s#defaultPath: "\.\./app/versorgungs-kompass\.html"#defaultPath: "./versorgungs-kompass.html"#' "$STAGE_DIR/auth-config.js"
  perl -0pi -e 's#"start_url": "\.\./frontend/app/versorgungs-kompass\.html"#"start_url": "./versorgungs-kompass.html"#; s#"start_url": "\.\./app/versorgungs-kompass\.html"#"start_url": "./versorgungs-kompass.html"#; s#"scope": "\.\./"#"scope": "./"#; s#"src": "\./brand/#"src": "./public/brand/#g; s#"src": "\./app-icon-#"src": "./public/app-icon-#g' "$STAGE_DIR/manifest.webmanifest"
  perl -0pi -e 's#\.\./\.\./\.\./public/#../public/#g; s#\.\./\.\./app/versorgungs-kompass\.html#../versorgungs-kompass.html#g; s#\.\./\.\./app/hospitation/index\.html#../hospitation/index.html#g; s#\.\./\.\./map/versorgungs-kompass-map-teaser\.html#../versorgungs-kompass-map-teaser.html#g; s#\./versorgungs-netzwerk\.html#./versorgungs-netzwerk.html#g' "$STAGE_DIR/mitmachen/index.html"
  perl -0pi -e 's#\./mitmachen\.css#./mitmachen/mitmachen.css#g; s#\.\./\.\./\.\./public/#./public/#g; s#\.\./\.\./app/versorgungs-kompass\.html#./versorgungs-kompass.html#g' "$STAGE_DIR/index.html"

  node "$ROOT_DIR/scripts/prepare_target_frontend_config.mjs" \
    "$STAGE_DIR/data/runtime-config.js" \
    "$API_BASE_URL" \
    api \
    "$AUTH_MODE"

}

if [ "$PROFILE" = "pages" ]; then
  build_pages
else
  build_target
fi

REVISION="$(git -C "$ROOT_DIR" rev-parse --verify HEAD 2>/dev/null || true)"
if ! printf '%s' "$REVISION" | grep -Eq '^[0-9a-fA-F]{7,64}$'; then
  REVISION="unknown"
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
