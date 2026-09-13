#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
RESTORE_SNAPSHOT_ID="${2:-}"
[[ "$#" -eq 2 && "$RESTORE_SNAPSHOT_ID" =~ ^[a-f0-9]{64}$ ]] \
  || single_server_die "Aufruf: restore-test.sh /etc/versorgungs-kompass/single-server.env VOLLSTAENDIGE_SNAPSHOT_ID"
[[ "$(uname -s)" == "Linux" ]] || single_server_die "Restore-Test ist nur auf dem Linux-Zielhost vorgesehen."
[[ "$(id -u)" -eq 0 ]] || single_server_die "Restore-Test benoetigt root fuer getrennte Container-UIDs."
single_server_acquire_maintenance_lock restore-test
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers
export RESTORE_SNAPSHOT_ID
restore_execution_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
validation_container_name="versorgungs-kompass-backup-$restore_execution_id-restic-maintenance"
restore_container_name="versorgungs-kompass-backup-$restore_execution_id-restic-restore"
database_restore_container_name="versorgungs-kompass-backup-$restore_execution_id-database-restore-test"
object_restore_container_name="versorgungs-kompass-backup-$restore_execution_id-object-storage-restore-test"
single_server_create_repository_recovery_marker "$restore_execution_id"

single_server_compose run --name "$validation_container_name" --rm --no-deps \
  --entrypoint /usr/bin/restic restic-maintenance \
  snapshots --json "$RESTORE_SNAPSHOT_ID" \
  | node "$SCRIPT_DIR/backup/format-snapshot-inventory.mjs" \
      "$RESTORE_SNAPSHOT_ID" "$SOURCE_REVISION" "$PRODUCT_VERSION" >/dev/null

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
RESTORE_TEST_DIR="$STATE_DIR/restore-tests/$timestamp"
[[ ! -e "$RESTORE_TEST_DIR" ]] || single_server_die "Restore-Testziel existiert bereits."
install -d -m 0700 -o root -g root "$STATE_DIR/restore-tests" "$RESTORE_TEST_DIR"
install -d -m 0700 -o 70 -g 70 "$RESTORE_TEST_DIR/restored"
install -d -m 0700 -o 70 -g 70 "$RESTORE_TEST_DIR/postgres-data"
export RESTORE_TEST_DIR

single_server_compose run --name "$restore_container_name" --rm --no-deps restic-restore

restore_root="$RESTORE_TEST_DIR/restored"
restore_source_root="$restore_root/source"
database_restore_tree="$RESTORE_TEST_DIR/restored/source/database"
object_storage_restore_tree="$RESTORE_TEST_DIR/restored/source/object-storage"
restore_metadata="$restore_root/RESTORE-METADATA"
[[ -f "$restore_metadata" && ! -L "$restore_metadata" ]] \
  || single_server_die "Operationsgebundene Restore-Metadaten fehlen."
mapfile -t restore_metadata_lines <"$restore_metadata"
[[ "${#restore_metadata_lines[@]}" -eq 3 \
   && "${restore_metadata_lines[0]}" == "schemaVersion=1" \
   && "${restore_metadata_lines[1]}" == "snapshotId=$RESTORE_SNAPSHOT_ID" \
   && "${restore_metadata_lines[2]}" =~ ^backupOperationId=[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] \
  || single_server_die "Restore-Metadaten stimmen nicht exakt mit der ausgewaehlten Snapshot-ID ueberein."
RESTORE_BACKUP_OPERATION_ID="${restore_metadata_lines[2]#backupOperationId=}"
export RESTORE_BACKUP_OPERATION_ID
[[ -d "$restore_root" && ! -L "$restore_root" ]] \
  || single_server_die "Wiederhergestelltes Wurzelverzeichnis fehlt oder ist ein Symlink."
[[ -d "$restore_source_root" && ! -L "$restore_source_root" ]] \
  || single_server_die "Wiederhergestelltes Quellverzeichnis fehlt oder ist ein Symlink."
[[ -d "$database_restore_tree" && ! -L "$database_restore_tree" ]] \
  || single_server_die "Wiederhergestellter Datenbankbaum fehlt oder ist ein Symlink."
[[ -d "$object_storage_restore_tree" && ! -L "$object_storage_restore_tree" ]] \
  || single_server_die "Wiederhergestellter Object-Storage-Baum fehlt oder ist ein Symlink."
for traversal_directory in "$restore_root" "$restore_source_root"; do
  [[ "$(stat -c '%u:%g' "$traversal_directory")" == "70:70" ]] \
    || single_server_die "Restore-Traversalverzeichnis muss UID/GID 70:70 behalten."
  chmod 0700 "$traversal_directory"
  [[ "$(stat -c '%a' "$traversal_directory")" == "700" ]] \
    || single_server_die "Restore-Traversalverzeichnis konnte nicht fail-closed auf Modus 0700 gesetzt werden."
done
if find "$database_restore_tree" -xdev \( ! -type d -a ! -type f \) -print -quit | grep -q .; then
  single_server_die "Datenbank-Restorebaum enthaelt einen Symlink oder einen nicht regulaeren Eintrag."
fi
find "$database_restore_tree" -xdev -exec chown --no-dereference 70:70 {} +
find "$database_restore_tree" -xdev -type d -exec chmod 0700 {} +
find "$database_restore_tree" -xdev -type f -exec chmod 0600 {} +
while IFS= read -r -d '' restored_entry; do
  restored_type="$(stat -c '%F' "$restored_entry")"
  restored_owner="$(stat -c '%u:%g' "$restored_entry")"
  restored_mode="$(stat -c '%a' "$restored_entry")"
  [[ "$restored_owner" == "70:70" ]] \
    || single_server_die "Datenbank-Restorebaum besitzt nach Uebergabe eine unerwartete UID/GID."
  if [[ "$restored_type" == "directory" ]]; then
    [[ "$restored_mode" == "700" ]] \
      || single_server_die "Datenbank-Restoreverzeichnis besitzt nach Uebergabe nicht Modus 0700."
  elif [[ "$restored_type" == "regular file" ]]; then
    [[ "$restored_mode" == "600" ]] \
      || single_server_die "Datenbank-Restoredatei besitzt nach Uebergabe nicht Modus 0600."
  else
    single_server_die "Datenbank-Restorebaum enthaelt nach Uebergabe einen unzulaessigen Dateityp."
  fi
done < <(find "$database_restore_tree" -xdev -print0)

# Der Object Storage bleibt strikt unter der gemeinsamen Daten-UID 70 und wird nicht
# fuer den PostgreSQL-Restore umgeschrieben.
if find "$object_storage_restore_tree" -xdev \( ! -type d -a ! -type f \) -print -quit | grep -q .; then
  single_server_die "Object-Storage-Restorebaum enthaelt einen Symlink oder einen nicht regulaeren Eintrag."
fi
find "$object_storage_restore_tree" -xdev -type d -exec chmod 0700 {} +
find "$object_storage_restore_tree" -xdev -type f -exec chmod 0600 {} +
if find "$object_storage_restore_tree" -xdev \( ! -uid 70 -o ! -gid 70 \) -print -quit | grep -q .; then
  single_server_die "Object-Storage-Restorebaum muss unveraendert UID/GID 70:70 gehoeren."
fi
while IFS= read -r -d '' restored_entry; do
  restored_type="$(stat -c '%F' "$restored_entry")"
  restored_mode="$(stat -c '%a' "$restored_entry")"
  if [[ "$restored_type" == "directory" ]]; then
    [[ "$restored_mode" == "700" ]] \
      || single_server_die "Object-Storage-Restoreverzeichnis besitzt nicht Modus 0700."
  elif [[ "$restored_type" == "regular file" ]]; then
    [[ "$restored_mode" == "600" ]] \
      || single_server_die "Object-Storage-Restoredatei besitzt nicht Modus 0600."
  else
    single_server_die "Object-Storage-Restorebaum enthaelt nach der Moduspruefung einen unzulaessigen Dateityp."
  fi
done < <(find "$object_storage_restore_tree" -xdev -print0)

single_server_compose run --name "$database_restore_container_name" --rm --no-deps database-restore-test
single_server_compose run --name "$object_restore_container_name" --rm --no-deps object-storage-restore-test

printf 'schemaVersion=1\nrestoreTest=%s\nsnapshotId=%s\nbackupOperationId=%s\nsourceRevision=%s\ndatabaseRuntimeReady=true\nobjectStorageVerified=true\nresult=success\n' \
  "$timestamp" "$RESTORE_SNAPSHOT_ID" "$RESTORE_BACKUP_OPERATION_ID" "$SOURCE_REVISION" >"$RESTORE_TEST_DIR/RESULT.txt"
chmod 0600 "$RESTORE_TEST_DIR/RESULT.txt"
repository_recovery_marker="$STATE_DIR/.backup-repository-recovery-required"
[[ -f "$repository_recovery_marker" && ! -L "$repository_recovery_marker" ]] \
  || single_server_die "Repository-Recovery-Marker fehlt nach dem vollstaendigen Restore-Test."
single_server_unlink_durable_file "$repository_recovery_marker"
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf 'Restore-Test erfolgreich. Geschuetztes Pruefverzeichnis: %s\n' "$RESTORE_TEST_DIR"
