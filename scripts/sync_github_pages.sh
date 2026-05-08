#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs"

mkdir -p "$DOCS_DIR/data" "$DOCS_DIR/public" "$DOCS_DIR/deutschlandkarte-project/data"

cp "$ROOT_DIR/login.html" "$DOCS_DIR/login.html"
cp "$ROOT_DIR/versorgungs-kompass.html" "$DOCS_DIR/versorgungs-kompass.html"
cp "$ROOT_DIR/versorgungs-kompass-map.html" "$DOCS_DIR/versorgungs-kompass-map.html"
cp "$ROOT_DIR/versorgungs-kompass-map-teaser.html" "$DOCS_DIR/versorgungs-kompass-map-teaser.html"
cp "$ROOT_DIR/auth-config.js" "$DOCS_DIR/auth-config.js"
cp "$ROOT_DIR/auth-guard.js" "$DOCS_DIR/auth-guard.js"
cp "$ROOT_DIR/auth-login.js" "$DOCS_DIR/auth-login.js"
cp "$ROOT_DIR/data/versorgungs-kompass-data.js" "$DOCS_DIR/data/versorgungs-kompass-data.js"
cp "$ROOT_DIR/data/versorgungs-kompass-data.csv" "$DOCS_DIR/data/versorgungs-kompass-data.csv"
cp "$ROOT_DIR/public/gematik-logo.svg" "$DOCS_DIR/public/gematik-logo.svg"
cp "$ROOT_DIR/deutschlandkarte-project/data/de-geojson.js" "$DOCS_DIR/deutschlandkarte-project/data/de-geojson.js"
cp "$ROOT_DIR/deutschlandkarte-project/data/city-labels.js" "$DOCS_DIR/deutschlandkarte-project/data/city-labels.js"
cp "$ROOT_DIR/deutschlandkarte-project/data/state-labels.js" "$DOCS_DIR/deutschlandkarte-project/data/state-labels.js"
cp "$ROOT_DIR/deutschlandkarte-project/data/state-polygons.js" "$DOCS_DIR/deutschlandkarte-project/data/state-polygons.js"

echo "GitHub Pages assets synchronized to docs/."
