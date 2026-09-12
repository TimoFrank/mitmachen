#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
[[ "$(uname -s)" == "Linux" ]] \
  || single_server_die "API-Recovery nach Backup ist nur auf dem Linux-Zielhost vorgesehen."
[[ "$(id -u)" -eq 0 ]] \
  || single_server_die "API-Recovery nach Backup muss als root laufen."

restart_marker="$STATE_DIR/.backup-api-restart-required"
if [[ ! -e "$restart_marker" && ! -L "$restart_marker" ]]; then
  printf '%s\n' "Kein offener API-Recovery-Marker; nichts zu tun."
  exit 0
fi
[[ -f "$restart_marker" && ! -L "$restart_marker" ]] \
  || single_server_die "API-Recovery-Marker ist kein regulaeres File."
[[ "$(stat -c '%u:%g' "$restart_marker")" == "0:0" && "$(stat -c '%a' "$restart_marker")" == "600" ]] \
  || single_server_die "API-Recovery-Marker muss root:root und Modus 0600 besitzen."
mapfile -t marker_lines <"$restart_marker"
[[ "${#marker_lines[@]}" -eq 5 \
   && "${marker_lines[0]}" == "schemaVersion=1" \
   && "${marker_lines[1]}" == "apiWasRunning=true" \
   && "${marker_lines[2]}" =~ ^operationId=[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ \
   && "${marker_lines[3]}" == "sourceRevision=$SOURCE_REVISION" \
   && "${marker_lines[4]}" =~ ^createdAt=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || single_server_die "API-Recovery-Marker passt nicht exakt zum aktuellen Checkout."
backup_operation_id="${marker_lines[2]#operationId=}"

single_server_acquire_maintenance_lock backup-api-recovery
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_create_repository_recovery_marker "$backup_operation_id"
single_server_remove_interrupted_backup_containers "$backup_operation_id"
running_services="$(single_server_compose ps --status running --services)"
for required_service in caddy oauth2-proxy frontend postgres; do
  grep -qx "$required_service" <<<"$running_services" \
    || single_server_die "API-Recovery verweigert: Dauer-Dienst $required_service laeuft nicht."
done

single_server_assert_open_attestation
single_server_compose up -d --no-deps api
if ! (
  single_server_wait_for_permanent_services 24 2 5 \
    && single_server_assert_running_api_revision \
    && single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"
); then
  single_server_compose stop --timeout 40 api >/dev/null 2>&1 || true
  single_server_die "API konnte nach abgebrochenem Backup nicht stabil, revisions- und modusgebunden gestartet werden. Marker bleibt erhalten."
fi
single_server_unlink_durable_file "$restart_marker"
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf '%s\n' "API nach abgebrochenem Backup erfolgreich wiederhergestellt."
