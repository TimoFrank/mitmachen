#!/bin/sh
set -eu
umask 077

password_file="${POSTGRES_PASSWORD_FILE:?POSTGRES_PASSWORD_FILE fehlt}"
app_password_file="${VK_APP_PASSWORD_FILE:?VK_APP_PASSWORD_FILE fehlt}"
[ -n "${EXPECTED_SOURCE_REVISION:-}" ] && printf '%s' "$EXPECTED_SOURCE_REVISION" | grep -Eq '^[a-f0-9]{40,64}$' \
  || { echo "FEHLER: Erwartete Quellrevision fuer den Restore fehlt oder ist ungueltig." >&2; exit 1; }
[ -n "${EXPECTED_PRODUCT_VERSION:-}" ] && printf '%s' "$EXPECTED_PRODUCT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "FEHLER: Erwartete Produktversion fuer den Restore fehlt oder ist ungueltig." >&2; exit 1; }
[ -n "${EXPECTED_BACKUP_OPERATION_ID:-}" ] && printf '%s' "$EXPECTED_BACKUP_OPERATION_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$' \
  || { echo "FEHLER: Erwartete Backup-Operation-ID fehlt oder ist ungueltig." >&2; exit 1; }
[ -f "$password_file" ] || { echo "FEHLER: Restore-Passwortdatei fehlt." >&2; exit 1; }
[ -f "$app_password_file" ] || { echo "FEHLER: App-Passwortdatei fuer den Recovery-Readback fehlt." >&2; exit 1; }
[ -d /restore/source/database/snapshots ] || { echo "FEHLER: Wiederhergestellte Datenbank-Snapshots fehlen." >&2; exit 1; }
[ -d "${PGDATA:?PGDATA fehlt}" ] || { echo "FEHLER: Separates PGDATA fehlt." >&2; exit 1; }
if find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "FEHLER: Restore-Test-PGDATA muss leer sein." >&2
  exit 1
fi

snapshot="/restore/source/database/snapshots/$EXPECTED_BACKUP_OPERATION_ID"
[ -d "$snapshot" ] && [ ! -L "$snapshot" ] \
  || { echo "FEHLER: Exakt operationsgebundener Datenbank-Snapshot fehlt." >&2; exit 1; }

(cd "$snapshot" && sha256sum -c SHA256SUMS >/dev/null)
manifest_revision="$(sed -nE 's/^\{"schemaVersion":1,"backupOperationId":"[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*","createdAt":"[^"]+","database":"versorgungs_kompass","sourceRevision":"([a-f0-9]{40,64})","productVersion":"[0-9]+\.[0-9]+\.[0-9]+","dumpSha256":"[a-f0-9]{64}","tableCountsSha256":"[a-f0-9]{64}"\}$/\1/p' "$snapshot/manifest.json")"
manifest_version="$(sed -nE 's/^\{"schemaVersion":1,"backupOperationId":"[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*","createdAt":"[^"]+","database":"versorgungs_kompass","sourceRevision":"[a-f0-9]{40,64}","productVersion":"([0-9]+\.[0-9]+\.[0-9]+)","dumpSha256":"[a-f0-9]{64}","tableCountsSha256":"[a-f0-9]{64}"\}$/\1/p' "$snapshot/manifest.json")"
manifest_operation="$(sed -nE 's/^\{"schemaVersion":1,"backupOperationId":"([0-9]{8}T[0-9]{6}Z-[1-9][0-9]*)".*/\1/p' "$snapshot/manifest.json")"
[ "$manifest_operation" = "$EXPECTED_BACKUP_OPERATION_ID" ] \
  || { echo "FEHLER: Manifest passt nicht zur ausgewaehlten Backup-Operation." >&2; exit 1; }
[ "$manifest_revision" = "$EXPECTED_SOURCE_REVISION" ] \
  || { echo "FEHLER: Backup-Revision passt nicht zum ausgewaehlten Restore-Checkout." >&2; exit 1; }
[ "$manifest_version" = "$EXPECTED_PRODUCT_VERSION" ] \
  || { echo "FEHLER: Backup-Produktversion passt nicht zum ausgewaehlten Restore-Checkout." >&2; exit 1; }
pg_restore --list "$snapshot/database.dump" >/dev/null

initdb \
  --pgdata="$PGDATA" \
  --username=vk_owner \
  --pwfile="$password_file" \
  --auth-local=scram-sha-256 \
  --auth-host=scram-sha-256 >/dev/null

started=0
cleanup() {
  if [ "$started" = "1" ]; then
    pg_ctl --pgdata="$PGDATA" --mode=fast stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'trap - HUP INT TERM; exit 129' HUP
trap 'trap - HUP INT TERM; exit 130' INT
trap 'trap - HUP INT TERM; exit 143' TERM

pg_ctl --pgdata="$PGDATA" \
  --options="-c listen_addresses= -c unix_socket_directories=/tmp -c unix_socket_permissions=0700" \
  --wait start >/dev/null
started=1
export PGHOST=/tmp PGUSER=vk_owner PGPASSWORD="$(cat "$password_file")"
createdb versorgungs_kompass
pg_restore \
  --dbname=versorgungs_kompass \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  "$snapshot/database.dump"

POSTGRES_USER=vk_owner \
POSTGRES_DB=versorgungs_kompass \
VK_APP_PASSWORD_FILE="$app_password_file" \
  /bin/sh /usr/local/bin/single-server-database-bootstrap >/dev/null

psql --dbname=versorgungs_kompass --no-psqlrc --tuples-only --no-align --field-separator='|' <<'SQL' \
  | sed '/^[[:space:]]*$/d' >"/tmp/restored-table-counts.txt"
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
SQL

cmp -s "$snapshot/table-counts.txt" /tmp/restored-table-counts.txt \
  || { echo "FEHLER: Tabellenmengen stimmen nach Restore nicht ueberein." >&2; exit 1; }
psql --dbname=versorgungs_kompass --no-psqlrc --tuples-only --no-align \
  --command="select to_regclass('public.profiles') is not null and to_regclass('public.identity_bindings') is not null;" \
  | grep -qx 't'

psql --dbname=versorgungs_kompass --no-psqlrc --tuples-only --no-align <<'SQL' \
  | grep -qx 't'
select role.rolcanlogin
   and not role.rolsuper
   and not role.rolcreatedb
   and not role.rolcreaterole
   and not role.rolreplication
   and not role.rolbypassrls
   and (
     select array_agg(granted.rolname order by granted.rolname)
       from pg_catalog.pg_auth_members membership
       join pg_catalog.pg_roles granted on granted.oid = membership.roleid
      where membership.member = role.oid
   ) = array['vk_app_runtime']::name[]
   and has_database_privilege('vk_app', 'versorgungs_kompass', 'CONNECT')
   and has_table_privilege('vk_app', 'public.profiles', 'SELECT')
   and has_table_privilege('vk_app', 'public.identity_bindings', 'SELECT')
  from pg_catalog.pg_roles role
 where role.rolname = 'vk_app';
SQL

PGUSER=vk_app PGPASSWORD="$(cat "$app_password_file")" \
  psql --dbname=versorgungs_kompass --no-psqlrc --tuples-only --no-align \
  --command="select current_user = 'vk_app' and to_regclass('public.profiles') is not null;" \
  | grep -qx 't'

pg_ctl --pgdata="$PGDATA" --mode=fast --wait stop >/dev/null
started=0
unset PGPASSWORD
printf 'Datenbank-Restore aus Quellrevision %s, Tabellenabgleich sowie App-Rollen-/Login-Readback erfolgreich.\n' \
  "$EXPECTED_SOURCE_REVISION"
