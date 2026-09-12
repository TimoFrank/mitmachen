#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
single_server_require_command curl
single_server_require_command node

single_server_assert_no_maintenance_recovery_markers
node "$SCRIPT_DIR/backup/recovery-escrow.mjs" verify "$CONFIG_DIR"
single_server_compose ps
if ! single_server_permanent_services_ready; then
  single_server_die "Mindestens einer der fuenf permanenten Dienste fehlt, laeuft nicht oder ist nicht healthy."
fi
single_server_assert_running_api_revision
single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"
curl --fail --silent --show-error --max-time 20 \
  --noproxy "$APP_HOST" --resolve "$APP_HOST:443:127.0.0.1" \
  "$APP_ORIGIN/" >/dev/null
start_status="$(curl --silent --show-error --output /dev/null --max-time 20 --write-out '%{http_code}' \
  --noproxy "$APP_HOST" --resolve "$APP_HOST:443:127.0.0.1" \
  "$APP_ORIGIN/start")"
api_status="$(curl --silent --show-error --output /dev/null --max-time 20 --write-out '%{http_code}' \
  --noproxy "$APP_HOST" --resolve "$APP_HOST:443:127.0.0.1" \
  "$APP_ORIGIN/api/session")"
[[ "$start_status" =~ ^30[2378]$ ]] || single_server_die "Geschuetzter App-Einstieg liefert keinen Login-Redirect."
[[ "$api_status" == "401" ]] || single_server_die "Anonyme API-Anfrage wird nicht mit 401 abgewiesen."
curl --fail --silent --show-error --max-time 20 "$APP_ORIGIN/" >/dev/null
printf '%s\n' "Lokaler Zielstack, kanonischer Origin, Login-Grenze und anonyme API-Ablehnung sind erreichbar; Cutover-Modus: $API_CUTOVER_MODE."
