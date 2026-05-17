#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs"

mkdir -p "$DOCS_DIR/data" "$DOCS_DIR/public" "$DOCS_DIR/deutschlandkarte-project/data"

cp "$ROOT_DIR/login/login.html" "$DOCS_DIR/login.html"
cp "$ROOT_DIR/login/set-password.html" "$DOCS_DIR/set-password.html"
cp "$ROOT_DIR/app/versorgungs-kompass.html" "$DOCS_DIR/versorgungs-kompass.html"
cp "$ROOT_DIR/map/versorgungs-kompass-map.html" "$DOCS_DIR/versorgungs-kompass-map.html"
cp "$ROOT_DIR/map/versorgungs-kompass-map-teaser.html" "$DOCS_DIR/versorgungs-kompass-map-teaser.html"
cp "$ROOT_DIR/map/versorgungs-kompass-contact-mini-map.html" "$DOCS_DIR/versorgungs-kompass-contact-mini-map.html"
cp "$ROOT_DIR/login/auth-config.js" "$DOCS_DIR/auth-config.js"
cp "$ROOT_DIR/login/auth-guard.js" "$DOCS_DIR/auth-guard.js"
cp "$ROOT_DIR/login/auth-login.js" "$DOCS_DIR/auth-login.js"
cp "$ROOT_DIR/data/versorgungs-kompass-data.js" "$DOCS_DIR/data/versorgungs-kompass-data.js"
cp "$ROOT_DIR/data/versorgungs-kompass-data.csv" "$DOCS_DIR/data/versorgungs-kompass-data.csv"
cp "$ROOT_DIR/data/supabase-config.js" "$DOCS_DIR/data/supabase-config.js"
cp "$ROOT_DIR/data/data-service.js" "$DOCS_DIR/data/data-service.js"
cp "$ROOT_DIR/public/gematik-logo.svg" "$DOCS_DIR/public/gematik-logo.svg"
cp "$ROOT_DIR/public/versorgungs-kompass-logo.png" "$DOCS_DIR/public/versorgungs-kompass-logo.png"
cp "$ROOT_DIR/map/data/de-geojson.js" "$DOCS_DIR/deutschlandkarte-project/data/de-geojson.js"
cp "$ROOT_DIR/map/data/city-labels.js" "$DOCS_DIR/deutschlandkarte-project/data/city-labels.js"
cp "$ROOT_DIR/map/data/state-labels.js" "$DOCS_DIR/deutschlandkarte-project/data/state-labels.js"
cp "$ROOT_DIR/map/data/state-polygons.js" "$DOCS_DIR/deutschlandkarte-project/data/state-polygons.js"

perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./map/versorgungs-kompass-#./versorgungs-kompass-#g; s#\.\./map/data/#./deutschlandkarte-project/data/#g; s#\.\./data/#./data/#g; s#\.\./login/login\.html#./login.html#g' "$DOCS_DIR/versorgungs-kompass.html"
perl -0pi -e 's#\.\./map/versorgungs-kompass-map-teaser\.html#./versorgungs-kompass-map-teaser.html#g; s#\.\./data/#./data/#g' "$DOCS_DIR/login.html"
perl -0pi -e 's#\.\./map/versorgungs-kompass-map-teaser\.html#./versorgungs-kompass-map-teaser.html#g; s#\.\./data/#./data/#g; s#\.\./app/versorgungs-kompass\.html#./versorgungs-kompass.html#g' "$DOCS_DIR/set-password.html"
perl -0pi -e 's#\.\./login/auth-#./auth-#g; s#\.\./public/#./public/#g; s#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$DOCS_DIR/versorgungs-kompass-map.html"
perl -0pi -e 's#\.\./data/#__ROOT_DATA__/#g; s#\./data/#./deutschlandkarte-project/data/#g; s#__ROOT_DATA__/#./data/#g' "$DOCS_DIR/versorgungs-kompass-map-teaser.html" "$DOCS_DIR/versorgungs-kompass-contact-mini-map.html"
perl -0pi -e 's#loginPath: "../login/login.html"#loginPath: "./login.html"#; s#defaultPath: "../app/versorgungs-kompass.html"#defaultPath: "./versorgungs-kompass.html"#' "$DOCS_DIR/auth-config.js"

echo "GitHub Pages assets synchronized to docs/."
