#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
single_server_require_command node
single_server_require_command unlink
single_server_require_command rmdir

single_server_acquire_maintenance_lock backup
single_server_assert_no_maintenance_recovery_markers
api_must_restart=0
restart_marker="$STATE_DIR/.backup-api-restart-required"
backup_operation_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
dump_container_name="versorgungs-kompass-backup-$backup_operation_id-database-dump"
snapshot_container_name="versorgungs-kompass-backup-$backup_operation_id-restic-backup"
maintenance_container_name="versorgungs-kompass-backup-$backup_operation_id-restic-maintenance"

create_restart_marker() {
  local pending_marker="$STATE_DIR/.backup-api-restart-required.pending.$$"
  [[ ! -e "$restart_marker" && ! -L "$restart_marker" ]] \
    || single_server_die "Ein alter API-Recovery-Marker blockiert das Backup. Zuerst recover-api-after-backup.sh ausfuehren."
  [[ ! -e "$pending_marker" && ! -L "$pending_marker" ]] \
    || single_server_die "Temporärer API-Recovery-Marker existiert bereits."
  (
    umask 077
    printf 'schemaVersion=1\napiWasRunning=true\noperationId=%s\nsourceRevision=%s\ncreatedAt=%s\n' \
      "$backup_operation_id" "$SOURCE_REVISION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending_marker"
  )
  chmod 0600 "$pending_marker"
  single_server_promote_durable_file "$pending_marker" "$restart_marker"
}

clear_restart_marker() {
  [[ -f "$restart_marker" && ! -L "$restart_marker" ]] \
    || single_server_die "API-Recovery-Marker fehlt nach dem Snapshot oder ist kein regulaeres File."
  single_server_unlink_durable_file "$restart_marker"
}

backup_cleanup() {
  status="$?"
  if [[ "$api_must_restart" == "1" ]]; then
    if single_server_remove_interrupted_backup_containers "$backup_operation_id" \
      && single_server_compose up -d --no-deps api >/dev/null 2>&1 \
      && single_server_wait_for_permanent_services 24 2 5 \
      && (single_server_assert_running_api_revision && single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"); then
      api_must_restart=0
      if [[ -f "$restart_marker" && ! -L "$restart_marker" ]]; then
        single_server_unlink_durable_file "$restart_marker" || true
      fi
    fi
  fi
  single_server_release_maintenance_lock || true
  return "$status"
}
trap backup_cleanup EXIT
single_server_install_terminating_signal_traps

running_services="$(single_server_compose ps --status running --services)"
grep -qx 'api' <<<"$running_services" \
  || single_server_die "Die API muss vor dem konsistenten Backup laufen."
single_server_assert_running_api_revision
# Der Repository-Marker wird vor dem ersten API-Stopp dauerhaft geschrieben.
# Damit bleibt selbst bei ENOSPC/I/O und einem anschliessenden harten Abbruch
# immer mindestens ein fail-closed Recovery-Signal fuer Kandidaten, Locks und
# lokale Pending-Dumps erhalten.
single_server_create_repository_recovery_marker "$backup_operation_id"
create_restart_marker
single_server_compose stop -t 40 api
api_must_restart=1
if single_server_compose ps --status running --services | grep -qx 'api'; then
  single_server_die "API lief nach dem Stop-Befehl weiter; Backup wurde nicht begonnen."
fi

single_server_compose run --name "$dump_container_name" --rm --no-deps \
  -e BACKUP_OPERATION_ID="$backup_operation_id" \
  database-dump
single_server_compose run --name "$snapshot_container_name" --rm --no-deps \
  -e RESTIC_OPERATION_ID="$backup_operation_id" \
  -e BACKUP_SOURCE_REVISION="$SOURCE_REVISION" \
  -e BACKUP_PRODUCT_VERSION="$PRODUCT_VERSION" \
  restic-backup

single_server_compose up -d --no-deps api
if ! (
  single_server_wait_for_permanent_services 24 2 5 \
    && single_server_assert_running_api_revision \
    && single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"
); then
  single_server_die "API wurde nach dem Backup nicht stabil, revisions- und modusgebunden gestartet."
fi
api_must_restart=0
clear_restart_marker

# Retention, ein optionaler Prune und Repository-Checks laufen erst nach dem
# stabilen API-Neustart. Der unveraenderliche Restic-Snapshot ist zu diesem
# Zeitpunkt bereits abgeschlossen; lange Wartungsarbeiten verursachen daher
# keine Anwendungsunterbrechung.
single_server_create_repository_recovery_marker "$backup_operation_id"
single_server_compose run --name "$maintenance_container_name" --rm --no-deps \
  -e RESTIC_RETENTION=1 \
  -e RESTIC_PRUNE="${RESTIC_PRUNE:-0}" \
  -e RESTIC_CHECK="${RESTIC_CHECK:-${RESTIC_PRUNE:-0}}" \
  -e RESTIC_UNLOCK=0 \
  -e EXPECTED_SOURCE_REVISION="$SOURCE_REVISION" \
  -e EXPECTED_PRODUCT_VERSION="$PRODUCT_VERSION" \
  restic-maintenance
repository_recovery_marker="$STATE_DIR/.backup-repository-recovery-required"
[[ -f "$repository_recovery_marker" && ! -L "$repository_recovery_marker" ]] \
  || single_server_die "Repository-Recovery-Marker fehlt nach der Wartung."
single_server_unlink_durable_file "$repository_recovery_marker"

# Ein abgelaufener Recovery-Nachweis alarmiert erst, nachdem die aktuelle
# lokale und externe Sicherung versucht wurde. So stoppt ein Governance-Gate
# niemals die eigentliche Datensicherung.
node "$SCRIPT_DIR/backup/recovery-escrow.mjs" verify "$CONFIG_DIR"
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
