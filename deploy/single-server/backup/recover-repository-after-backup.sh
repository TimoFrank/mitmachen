#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
[[ "$(uname -s)" == "Linux" ]] \
  || single_server_die "Backup-Repository-Recovery ist nur auf dem Linux-Zielhost vorgesehen."
[[ "$(id -u)" -eq 0 ]] \
  || single_server_die "Backup-Repository-Recovery muss als root laufen."

repository_marker="$STATE_DIR/.backup-repository-recovery-required"
[[ -f "$repository_marker" && ! -L "$repository_marker" ]] \
  || single_server_die "Backup-Repository-Recovery-Marker fehlt oder ist kein regulaeres File."
[[ "$(stat -c '%u:%g' "$repository_marker")" == "0:0" && "$(stat -c '%a' "$repository_marker")" == "600" ]] \
  || single_server_die "Backup-Repository-Recovery-Marker muss root:root und Modus 0600 besitzen."
mapfile -t marker_lines <"$repository_marker"
[[ "${#marker_lines[@]}" -eq 4 \
   && "${marker_lines[0]}" == "schemaVersion=1" \
   && "${marker_lines[1]}" =~ ^operationId=[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ \
   && "${marker_lines[2]}" == "sourceRevision=$SOURCE_REVISION" \
   && "${marker_lines[3]}" =~ ^createdAt=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || single_server_die "Backup-Repository-Recovery-Marker passt nicht exakt zum Checkout."
backup_operation_id="${marker_lines[1]#operationId=}"
maintenance_container_name="versorgungs-kompass-backup-$backup_operation_id-restic-maintenance"

single_server_acquire_maintenance_lock backup-repository-recovery
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_remove_interrupted_backup_containers "$backup_operation_id"

for restic_service in restic-backup restic-maintenance restic-restore; do
  restic_inventory="$(docker container ls --all --quiet \
    --filter label=com.docker.compose.project=versorgungs-kompass-single-server \
    --filter "label=com.docker.compose.service=$restic_service")" \
    || single_server_die "Docker-Containerinventar ist fuer die Repository-Recovery nicht lesbar."
  if [[ -n "$restic_inventory" ]]; then
    single_server_die "Ein Restic-Container ist ausserhalb des gebundenen Recovery-Zyklus vorhanden: $restic_service"
  fi
done

snapshot_root="$STATE_DIR/backup-staging/snapshots"
if [[ -d "$snapshot_root" && ! -L "$snapshot_root" ]]; then
  while IFS= read -r -d '' pending_snapshot; do
    [[ "$pending_snapshot" == "$snapshot_root/.pending-"* && -d "$pending_snapshot" && ! -L "$pending_snapshot" ]] \
      || single_server_die "Unerwarteter Pending-Snapshot-Pfad."
    if find "$pending_snapshot" -xdev \( ! -type d -a ! -type f \) -print -quit | grep -q .; then
      single_server_die "Pending-Snapshot enthaelt einen nicht regulaeren Eintrag."
    fi
    if find "$pending_snapshot" -xdev \( ! -uid 70 -o ! -gid 70 \) -print -quit | grep -q .; then
      single_server_die "Pending-Snapshot besitzt unerwartete UID/GID."
    fi
    find "$pending_snapshot" -xdev -type f -exec unlink -- {} +
    find "$pending_snapshot" -xdev -depth -type d -exec rmdir -- {} +
  done < <(find "$snapshot_root" -mindepth 1 -maxdepth 1 -type d -name '.pending-*' -print0)
fi

single_server_compose run --name "$maintenance_container_name" --rm --no-deps \
  -e RESTIC_RETENTION=0 \
  -e RESTIC_PRUNE=0 \
  -e RESTIC_CHECK=1 \
  -e RESTIC_UNLOCK=1 \
  -e RESTIC_RECOVER_OPERATION_ID="$backup_operation_id" \
  -e EXPECTED_SOURCE_REVISION="$SOURCE_REVISION" \
  -e EXPECTED_PRODUCT_VERSION="$PRODUCT_VERSION" \
  restic-maintenance

single_server_unlink_durable_file "$repository_marker"
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf 'Backup-Repository-Recovery und Integritaetspruefung erfolgreich: %s\n' "$backup_operation_id"
