#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

single_server_load_environment "${1:-}"
single_server_require_command docker
single_server_require_command git
single_server_require_command node
single_server_require_command sed

if [[ "${SINGLE_SERVER_LOCAL_TEST:-0}" != "1" ]]; then
  single_server_require_command flock
  [[ "$(uname -s)" == "Linux" ]] || single_server_die "Live-Preflight ist nur auf dem Linux-Zielhost zulaessig."
  [[ "$(id -u)" -eq 0 ]] || single_server_die "Live-Preflight muss als root laufen."
  [[ "$(stat -c '%u' "$SINGLE_SERVER_ENV_FILE")" == "0" ]] \
    || single_server_die "Environment-Datei muss root gehoeren."
  [[ "$(stat -c '%a' "$SINGLE_SERVER_ENV_FILE")" == "600" ]] \
    || single_server_die "Environment-Datei muss Modus 0600 besitzen."
  [[ -z "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=all)" ]] \
    || single_server_die "Live-Deployment erfordert einen sauberen Git-Checkout."
  [[ "$(git -C "$PROJECT_ROOT" branch --show-current)" == "main" ]] \
    || single_server_die "Live-Deployment darf nur aus dem integrierten main erfolgen."
  git -C "$PROJECT_ROOT" fetch --prune origin
  [[ "$SOURCE_REVISION" == "$(git -C "$PROJECT_ROOT" rev-parse origin/main)" ]] \
    || single_server_die "Lokaler main und origin/main sind nicht exakt identisch."
fi

check_secret_file() {
  local name="$1" minimum_bytes="$2" maximum_bytes="$3" expected_uid="$4"
  local target="$CONFIG_DIR/$name" bytes
  [[ -f "$target" && ! -L "$target" ]] || single_server_die "Secret-Datei fehlt oder ist ein Symlink: $name"
  if [[ "$(uname -s)" == "Linux" ]]; then
    [[ "$(stat -c '%u:%g' "$target")" == "$expected_uid:$expected_uid" ]] \
      || single_server_die "Secret-Datei $name muss UID/GID $expected_uid:$expected_uid gehoeren."
    [[ "$(stat -c '%a' "$target")" == "600" ]] || single_server_die "Secret-Datei $name muss Modus 0600 besitzen."
  fi
  bytes="$(wc -c <"$target" | tr -d '[:space:]')"
  (( bytes >= minimum_bytes && bytes <= maximum_bytes )) || single_server_die "Secret-Datei $name hat eine unzulaessige Laenge."
}

check_single_line_secret() {
  local name="$1" minimum_bytes="$2" maximum_bytes="$3" expected_uid="$4"
  check_secret_file "$name" "$minimum_bytes" "$maximum_bytes" "$expected_uid"
  [[ "$(wc -l <"$CONFIG_DIR/$name" | tr -d '[:space:]')" == "0" ]] \
    || single_server_die "Secret-Datei $name darf keinen Zeilenumbruch enthalten."
}

check_single_line_secret db-owner-password 48 128 70
check_single_line_secret db-app-password 48 128 70
check_single_line_secret identity-bootstrap-hmac 64 64 70
check_single_line_secret google-oauth-client-secret 16 256 65532
check_single_line_secret oauth2-cookie-secret 32 128 65532
check_single_line_secret restic-repository 16 2048 70
check_single_line_secret restic-password 32 256 70
check_secret_file restic-aws-credentials 64 4096 70
check_secret_file allowed-emails 6 1024 65532

grep -Eq '^[a-f0-9]{64}$' "$CONFIG_DIR/identity-bootstrap-hmac" \
  || single_server_die "identity-bootstrap-hmac muss exakt 32 zufaellige Bytes als Hexwert enthalten."

for temporary_identity_file in \
  identity-provision.json \
  identity-approval-secret \
  identity-approval-token; do
  [[ ! -e "$CONFIG_DIR/$temporary_identity_file" && ! -L "$CONFIG_DIR/$temporary_identity_file" ]] \
    || single_server_die "Temporaere Identity-Datei muss vor dem Live-Preflight gezielt bereinigt sein: $temporary_identity_file"
done

grep -Eq '^s3:https://[^[:space:]]+$' "$CONFIG_DIR/restic-repository" \
  || single_server_die "restic-repository muss ein verschluesseltes S3-kompatibles Ziel verwenden."
grep -Eq '^\[default\]$' "$CONFIG_DIR/restic-aws-credentials" \
  || single_server_die "restic-aws-credentials benoetigt ein [default]-Profil."
grep -Eq '^aws_access_key_id[[:space:]]*=[[:space:]]*[^[:space:]]+$' "$CONFIG_DIR/restic-aws-credentials" \
  || single_server_die "S3 Access Key fehlt."
grep -Eq '^aws_secret_access_key[[:space:]]*=[[:space:]]*[^[:space:]]+$' "$CONFIG_DIR/restic-aws-credentials" \
  || single_server_die "S3 Secret Key fehlt."

email_count="$(awk '
  BEGIN { valid=1; count=0 }
  /^[a-z0-9.!#$%&+\/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/ { count++; next }
  { valid=0 }
  END { if (!valid || count < 1 || count > 4) exit 1; print count }
' "$CONFIG_DIR/allowed-emails")" \
  || single_server_die "allowed-emails muss genau 1 bis 4 kleingeschriebene Einzeladressen enthalten."
[[ "$email_count" -ge 1 ]] || single_server_die "E-Mail-Allowlist ist leer."

node "$SCRIPT_DIR/backup/recovery-escrow.mjs" verify "$CONFIG_DIR"
single_server_assert_no_maintenance_recovery_markers
[[ "$API_CUTOVER_MODE" =~ ^(closed|open)$ ]] \
  || single_server_die "API_CUTOVER_MODE muss vor dem Deployment explizit closed oder open sein."

if [[ "$(uname -s)" == "Linux" ]]; then
  check_directory() {
    local target="$1" expected_uid="$2" maximum_mode="$3" actual_uid actual_mode
    [[ -d "$target" && ! -L "$target" ]] || single_server_die "Betriebsverzeichnis fehlt oder ist ein Symlink: $target"
    actual_uid="$(stat -c '%u' "$target")"
    actual_mode="$(stat -c '%a' "$target")"
    [[ "$actual_uid" == "$expected_uid" ]] || single_server_die "Falscher Eigentuemer fuer $target."
    [[ "$actual_mode" == "$maximum_mode" ]] || single_server_die "Falscher Dateimodus fuer $target (erwartet $maximum_mode)."
  }
  check_directory "$CONFIG_DIR" 0 700
  check_directory "$STATE_DIR" 0 700
  check_directory "$STATE_DIR/caddy-data" 1000 700
  check_directory "$STATE_DIR/caddy-config" 1000 700
  check_directory "$STATE_DIR/object-storage" 70 700
  check_directory "$STATE_DIR/backup-staging" 70 700
  check_directory "$STATE_DIR/postgres-data" 70 700
  check_directory "$STATE_DIR/postgres-socket" 70 700
  free_kib="$(df -Pk "$STATE_DIR" | awk 'NR==2 {print $4}')"
  (( free_kib >= 5 * 1024 * 1024 )) || single_server_die "Weniger als 5 GiB freier Speicher im STATE_DIR."

  runtime_secret_image="postgres:16.15-alpine3.24@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685"
  docker run --rm \
    --network none \
    --read-only \
    --user 70:70 \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --volume "$CONFIG_DIR/db-owner-password:/run/secrets/db-owner-password:ro" \
    --volume "$CONFIG_DIR/db-app-password:/run/secrets/db-app-password:ro" \
    --volume "$CONFIG_DIR/identity-bootstrap-hmac:/run/secrets/identity-bootstrap-hmac:ro" \
    --volume "$CONFIG_DIR/restic-repository:/run/secrets/restic-repository:ro" \
    --volume "$CONFIG_DIR/restic-password:/run/secrets/restic-password:ro" \
    --volume "$CONFIG_DIR/restic-aws-credentials:/run/secrets/restic-aws-credentials:ro" \
    "$runtime_secret_image" \
    sh -ec 'for secret in /run/secrets/*; do test -r "$secret" && test -s "$secret"; done'
fi

single_server_compose config --quiet
oauth2_proxy_image="quay.io/oauth2-proxy/oauth2-proxy:v7.15.4@sha256:b1b2021fe8f4004573e8d690dec6c7bb29cc44364572cf8510a05bf3a0ae2ded"
docker run --rm \
  --network none \
  --read-only \
  --user 65532:65532 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --env "OAUTH2_PROXY_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID" \
  --env "OAUTH2_PROXY_REDIRECT_URL=$APP_ORIGIN/oauth2/callback" \
  --env "OAUTH2_PROXY_WHITELIST_DOMAINS=$APP_HOST" \
  --env "OAUTH2_PROXY_TRUSTED_PROXY_IPS=${CADDY_EDGE_IP:-172.31.78.2}/32" \
  --volume "$SCRIPT_DIR/oauth2-proxy.cfg:/etc/oauth2-proxy.cfg:ro" \
  --volume "$CONFIG_DIR/google-oauth-client-secret:/run/secrets/google-oauth-client-secret:ro" \
  --volume "$CONFIG_DIR/oauth2-cookie-secret:/run/secrets/oauth2-cookie-secret:ro" \
  --volume "$CONFIG_DIR/allowed-emails:/run/secrets/allowed-emails:ro" \
  "$oauth2_proxy_image" \
  --config=/etc/oauth2-proxy.cfg --config-test

printf '%s\n' "Einzelserver-Preflight erfolgreich: Host, Quelle, Secrets, Verzeichnisse, Compose und OIDC-Proxy sind konsistent; Cutover-Modus: $API_CUTOVER_MODE."
