#!/bin/sh
set -eu
umask 077

password_file="${PGPASSWORD_FILE:?PGPASSWORD_FILE fehlt}"
operation_id="${BACKUP_OPERATION_ID:-}"
printf '%s' "$operation_id" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$' \
  || { echo "FEHLER: BACKUP_OPERATION_ID ist ungueltig." >&2; exit 1; }
[ -n "${SOURCE_REVISION:-}" ] && printf '%s' "$SOURCE_REVISION" | grep -Eq '^[a-f0-9]{40,64}$' \
  || { echo "FEHLER: Quellrevision fuer das Backup ist ungueltig." >&2; exit 1; }
[ -n "${PRODUCT_VERSION:-}" ] && printf '%s' "$PRODUCT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "FEHLER: Produktversion fuer das Backup ist ungueltig." >&2; exit 1; }
[ -f "$password_file" ] || { echo "FEHLER: Datenbankpasswortdatei fehlt." >&2; exit 1; }
PGPASSWORD="$(cat "$password_file")"
export PGPASSWORD
[ -n "$PGPASSWORD" ] && [ "$(printf '%s' "$PGPASSWORD" | wc -c)" -ge 24 ] \
  || { echo "FEHLER: Datenbankpasswortdatei ist ungueltig." >&2; exit 1; }

snapshot_root="/backup/snapshots"
pending="$snapshot_root/.pending-$operation_id"
final="$snapshot_root/$operation_id"
mkdir -p -m 0700 "$snapshot_root"
snapshot_holder_pid=""
snapshot_holder_backend_pid=""
snapshot_holder_application="versorgungs-kompass-backup-$operation_id"
terminate_snapshot_holder() {
  if printf '%s' "$snapshot_holder_backend_pid" | grep -Eq '^[1-9][0-9]*$'; then
    psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --set=BACKEND_PID="$snapshot_holder_backend_pid" \
      --set=EXPECTED_APP="$snapshot_holder_application" <<'SQL' >/dev/null 2>&1 || true
select pg_terminate_backend(pid)
from pg_catalog.pg_stat_activity
where pid = :'BACKEND_PID'::integer
  and datname = current_database()
  and usename = current_user
  and application_name = :'EXPECTED_APP';
SQL
    snapshot_holder_backend_pid=""
  fi
  if [ -n "$snapshot_holder_pid" ]; then
    kill "$snapshot_holder_pid" 2>/dev/null || true
    wait "$snapshot_holder_pid" 2>/dev/null || true
    snapshot_holder_pid=""
  fi
}
cleanup() {
  status="$?"
  terminate_snapshot_holder
  if [ -d "$pending" ]; then
    find "$pending" -type f -exec unlink {} \; 2>/dev/null || true
    rmdir "$pending" 2>/dev/null || true
  fi
  unset PGPASSWORD
  return "$status"
}
trap cleanup EXIT
trap 'trap - HUP INT TERM; exit 129' HUP
trap 'trap - HUP INT TERM; exit 130' INT
trap 'trap - HUP INT TERM; exit 143' TERM
[ ! -e "$final" ] || { echo "FEHLER: Backup-Zeitstempel existiert bereits." >&2; exit 1; }
mkdir -m 0700 "$pending"

snapshot_id_file="$pending/.snapshot-id"
snapshot_backend_pid_file="$pending/.snapshot-backend-pid"
snapshot_holder_log="$pending/.snapshot-holder.log"
PGAPPNAME="$snapshot_holder_application" \
psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  >"$snapshot_holder_log" 2>&1 <<SQL &
begin isolation level repeatable read read only;
\o $snapshot_backend_pid_file
select pg_backend_pid();
\o
\o $snapshot_id_file
select case
  when pg_try_advisory_xact_lock(hashtextextended('versorgungs-kompass:single-server:database-backup-v1', 0))
    then pg_export_snapshot()
  else 'LOCKED'
end;
\o
select pg_sleep(600);
rollback;
SQL
snapshot_holder_pid="$!"
snapshot_attempt=0
while [ "$snapshot_attempt" -lt 20 ] \
  && { [ ! -s "$snapshot_id_file" ] || [ ! -s "$snapshot_backend_pid_file" ]; }; do
  kill -0 "$snapshot_holder_pid" 2>/dev/null \
    || { echo "FEHLER: Datenbank-Snapshot konnte nicht offen gehalten werden." >&2; exit 1; }
  snapshot_attempt=$((snapshot_attempt + 1))
  sleep 1
done
[ -s "$snapshot_id_file" ] \
  || { echo "FEHLER: Datenbank-Snapshot-ID wurde nicht rechtzeitig bereitgestellt." >&2; exit 1; }
[ -s "$snapshot_backend_pid_file" ] \
  || { echo "FEHLER: Datenbank-Snapshot-Backend-ID wurde nicht rechtzeitig bereitgestellt." >&2; exit 1; }
snapshot_holder_backend_pid="$(tr -d '[:space:]' <"$snapshot_backend_pid_file")"
printf '%s' "$snapshot_holder_backend_pid" | grep -Eq '^[1-9][0-9]*$' \
  || { echo "FEHLER: Datenbank-Snapshot-Backend-ID ist ungueltig." >&2; exit 1; }
snapshot_id="$(tr -d '[:space:]' <"$snapshot_id_file")"
printf '%s' "$snapshot_id" | grep -Eq '^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$' \
  || { echo "FEHLER: Exportierte Datenbank-Snapshot-ID ist ungueltig." >&2; exit 1; }

pg_dump \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --snapshot="$snapshot_id" \
  --lock-wait-timeout=10000 \
  --file="$pending/database.dump"
pg_restore --list "$pending/database.dump" >/dev/null

psql --no-psqlrc --quiet --tuples-only --no-align --field-separator='|' \
  --set=ON_ERROR_STOP=1 --set=SNAPSHOT_ID="$snapshot_id" <<'SQL' \
  | sed '/^[[:space:]]*$/d' >"$pending/table-counts.txt"
begin isolation level repeatable read read only;
set transaction snapshot :'SNAPSHOT_ID';
select format(
  'select %L::text, count(*)::bigint from %I.%I;',
  schemaname || '.' || tablename,
  schemaname,
  tablename
)
from pg_catalog.pg_tables
where schemaname = 'public'
order by tablename
\gexec
commit;
SQL

terminate_snapshot_holder
unlink "$snapshot_id_file"
unlink "$snapshot_backend_pid_file"
unlink "$snapshot_holder_log"

dump_sha256="$(sha256sum "$pending/database.dump" | awk '{print $1}')"
counts_sha256="$(sha256sum "$pending/table-counts.txt" | awk '{print $1}')"
cat >"$pending/manifest.json" <<EOF
{"schemaVersion":1,"backupOperationId":"${operation_id}","createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","database":"${PGDATABASE}","sourceRevision":"${SOURCE_REVISION}","productVersion":"${PRODUCT_VERSION}","dumpSha256":"${dump_sha256}","tableCountsSha256":"${counts_sha256}"}
EOF
sha256sum "$pending/database.dump" "$pending/table-counts.txt" "$pending/manifest.json" \
  | sed "s#$pending/##" >"$pending/SHA256SUMS"
chmod 0600 "$pending"/*
mv "$pending" "$final"
unset PGPASSWORD

# Drei lokale Generationen ueberbruecken einen voruebergehenden Offsite-Ausfall.
find "$snapshot_root" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z-*' -print \
  | sort -r \
  | awk 'NR > 3' \
  | while IFS= read -r old_snapshot; do
      case "$old_snapshot" in
        "$snapshot_root"/20??????T??????Z-*)
          old_operation_id="${old_snapshot##*/}"
          printf '%s' "$old_operation_id" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$' \
            || { echo "FEHLER: Unerwartete lokale Backup-Operation-ID." >&2; exit 1; }
          find "$old_snapshot" -type f -exec unlink {} \;
          rmdir "$old_snapshot"
          ;;
        *) echo "FEHLER: Unerwarteter Backup-Pfad: $old_snapshot" >&2; exit 1 ;;
      esac
    done

trap - EXIT HUP INT TERM

printf 'Datenbank-Snapshot %s erfolgreich erstellt.\n' "$operation_id"
