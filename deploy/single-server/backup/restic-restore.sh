#!/bin/sh
set -eu
umask 077

[ -d /restore ] || { echo "FEHLER: Restore-Ziel fehlt." >&2; exit 1; }
if find /restore -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "FEHLER: Restore-Ziel muss leer sein." >&2
  exit 1
fi

restic cat config >/dev/null
restic check
snapshot_id="${RESTORE_SNAPSHOT_ID:-}"
printf '%s' "$snapshot_id" | grep -Eq '^[a-f0-9]{64}$' \
  || { echo "FEHLER: RESTORE_SNAPSHOT_ID muss eine vollstaendige Snapshot-ID sein." >&2; exit 1; }
snapshot_json="$(restic snapshots --json "$snapshot_id")"
operation_tags="$(printf '%s\n' "$snapshot_json" | grep -Eo '"operation-[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*"' | tr -d '"')"
[ "$(printf '%s\n' "$operation_tags" | sed '/^$/d' | wc -l | tr -d '[:space:]')" = "1" ] \
  || { echo "FEHLER: Snapshot besitzt keine eindeutige Backup-Operation-ID." >&2; exit 1; }
backup_operation_id="${operation_tags#operation-}"
printf '%s' "$snapshot_json" | grep -Fq '"versorgungs-kompass"' \
  && printf '%s' "$snapshot_json" | grep -Fq '"daily"' \
  && printf '%s' "$snapshot_json" | grep -Fq "\"revision-${EXPECTED_SOURCE_REVISION:-missing}\"" \
  && printf '%s' "$snapshot_json" | grep -Fq "\"version-${EXPECTED_PRODUCT_VERSION:-missing}\"" \
  || { echo "FEHLER: Snapshot ist nicht final oder passt nicht zu Revision/Version des Restore-Checkouts." >&2; exit 1; }
restic restore "$snapshot_id" \
  --target /restore

test -d "/restore/source/database/snapshots/$backup_operation_id"
test -d /restore/source/database/snapshots
test -d /restore/source/object-storage
printf 'schemaVersion=1\nsnapshotId=%s\nbackupOperationId=%s\n' \
  "$snapshot_id" "$backup_operation_id" > /restore/RESTORE-METADATA
chmod 0600 /restore/RESTORE-METADATA
printf '%s\n' "Ausgewaehlter verschluesselter Snapshot wurde operationsgebunden wiederhergestellt."
