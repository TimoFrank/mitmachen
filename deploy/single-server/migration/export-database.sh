#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

die() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Aufruf: export-database.sh /absolutes/neues-exportziel /absolutes/libpq-verzeichnis SOURCE_DEPLOYED_REVISION /absolutes/gke-freeze.conf /absolutes/global-writer-attestation.conf' >&2
  exit 2
}

[[ "$#" -eq 5 ]] || usage
EXPORT_DIR="$1"
LIBPQ_DIR="$2"
SOURCE_DEPLOYED_REVISION="$3"
GKE_FREEZE_CONFIG="$4"
GLOBAL_WRITER_ATTESTATION="$5"

# Verbindungsparameter aus einer aufrufenden Shell duerfen niemals unbemerkt
# die explizit gepruefte libpq-Konfiguration uebersteuern oder an Kindprozesse
# weitergereicht werden.
unset PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE
unset PGGSSENCMODE PGHOST PGHOSTADDR PGKRBSRVNAME PGOPTIONS PGPASSFILE
unset PGPASSWORD PGPORT PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR
unset PGSSLKEY PGSSLMODE PGSSLNEGOTIATION PGSSLROOTCERT PGSSLSNI
unset PGREQUIREPEER PGTARGETSESSIONATTRS PGUSER

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Erforderliches Programm fehlt: $1"
}

for required_command in awk basename chmod date dirname env find gcloud git grep id mkdir node pg_dump pg_restore psql realpath sed sha256sum sleep sort stat tr unlink wc; do
  require_command "$required_command"
done

stat_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

stat_uid() {
  if stat -c '%u' "$1" >/dev/null 2>&1; then
    stat -c '%u' "$1"
  else
    stat -f '%u' "$1"
  fi
}

stat_size() {
  if stat -c '%s' "$1" >/dev/null 2>&1; then
    stat -c '%s' "$1"
  else
    stat -f '%z' "$1"
  fi
}

canonical_existing_directory() {
  local label="$1" value="$2" canonical
  [[ "$value" == /* ]] || die "$label muss ein absoluter Pfad sein."
  [[ -d "$value" && ! -L "$value" ]] || die "$label fehlt, ist kein Verzeichnis oder ist ein Symlink."
  canonical="$(realpath "$value")" || die "$label kann nicht kanonisch aufgeloest werden."
  [[ "$canonical" == "$value" ]] || die "$label muss bereits kanonisch und vollstaendig symlinkfrei sein."
  printf '%s\n' "$canonical"
}

canonical_protected_file() {
  local label="$1" value="$2" canonical parent
  [[ "$value" == /* ]] || die "$label muss ein absoluter Pfad sein."
  [[ -f "$value" && ! -L "$value" ]] || die "$label fehlt, ist keine regulaere Datei oder ist ein Symlink."
  canonical="$(realpath "$value")" || die "$label kann nicht kanonisch aufgeloest werden."
  [[ "$canonical" == "$value" ]] || die "$label muss bereits kanonisch und vollstaendig symlinkfrei sein."
  parent="$(dirname -- "$value")"
  parent="$(canonical_existing_directory "$label-PARENT" "$parent")"
  [[ "$(stat_uid "$parent")" == "$(id -u)" && "$(stat_mode "$parent")" == "700" ]] \
    || die "$label-Elternverzeichnis muss dem aufrufenden Nutzer gehoeren und Modus 0700 besitzen."
  [[ "$(stat_uid "$value")" == "$(id -u)" && "$(stat_mode "$value")" == "600" ]] \
    || die "$label muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen."
  printf '%s\n' "$canonical"
}

assert_disjoint_paths() {
  local first_label="$1" first="$2" second_label="$3" second="$4"
  [[ "$first" != "$second" && "$first" != "$second/"* && "$second" != "$first/"* ]] \
    || die "$first_label und $second_label muessen in beide Richtungen unverschachtelt sein."
}

canonical_command() {
  local name="$1" located canonical
  located="$(type -P "$name")" || die "Programm ist nicht als Datei aufloesbar: $name"
  [[ "$located" == /* && -f "$located" ]] || die "Programmpfad ist nicht absolut oder regulaer: $name"
  canonical="$(realpath "$located")" || die "Programmpfad ist nicht kanonisch aufloesbar: $name"
  [[ -f "$canonical" && ! -L "$canonical" ]] || die "Kanonisches Programm ist keine regulaere Datei: $name"
  # Multi-Call-Binaries wie BusyBox muessen ueber den urspruenglichen
  # Applet-Pfad aufgerufen werden; der kanonische Zielpfad wurde oben dennoch
  # vollstaendig aufgeloest und geprueft.
  printf '%s\n' "$located"
}

case "$SOURCE_DEPLOYED_REVISION" in
  *[!a-f0-9]*|'') die "SOURCE_DEPLOYED_REVISION muss 40 oder 64 kleingeschriebene Hexzeichen enthalten." ;;
esac
case "${#SOURCE_DEPLOYED_REVISION}" in
  40|64) ;;
  *) die "SOURCE_DEPLOYED_REVISION muss 40 oder 64 kleingeschriebene Hexzeichen enthalten." ;;
esac

script_input="${BASH_SOURCE[0]}"
if [[ "$script_input" == /* ]]; then
  script_candidate="$script_input"
else
  script_candidate="$(pwd -P)/$script_input"
fi
SCRIPT_PATH="$(realpath "$script_candidate")" || die "Skriptpfad kann nicht kanonisch aufgeloest werden."
[[ "$SCRIPT_PATH" == "$script_candidate" && -f "$SCRIPT_PATH" && ! -L "$SCRIPT_PATH" ]] \
  || die "Export-Wrapper muss ueber seinen absoluten, kanonischen und symlinkfreien Pfad laufen."
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd -P)"
PROJECT_ROOT="$(canonical_existing_directory PROJECT_ROOT "$PROJECT_ROOT")"

repository_top="$(git -C "$PROJECT_ROOT" rev-parse --show-toplevel 2>/dev/null)" \
  || die "PROJECT_ROOT ist kein Git-Checkout."
repository_top="$(realpath "$repository_top")" \
  || die "Git-Repositorypfad kann nicht kanonisch aufgeloest werden."
[[ "$repository_top" == "$PROJECT_ROOT" ]] \
  || die "Git-Repositorypfad stimmt nicht exakt mit dem kanonischen PROJECT_ROOT ueberein."
[[ -z "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=normal)" ]] \
  || die "Repository muss fuer einen revisionsgebundenen Export vollstaendig sauber sein."
TARGET_REVISION="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
[[ "$TARGET_REVISION" =~ ^[a-f0-9]{40}$|^[a-f0-9]{64}$ ]] \
  || die "Zielrevision des Repositorys ist ungueltig."

[[ "$EXPORT_DIR" == /* ]] || die "EXPORT_DIR muss ein absoluter Pfad sein."
[[ "$EXPORT_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || die "EXPORT_DIR darf nur sichere portable Pfadzeichen enthalten."
export_basename="$(basename -- "$EXPORT_DIR")"
[[ "$export_basename" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$export_basename" != "." && "$export_basename" != ".." ]] \
  || die "EXPORT_DIR benoetigt einen engen, portablen Verzeichnisnamen."
export_parent_input="$(dirname -- "$EXPORT_DIR")"
EXPORT_PARENT="$(canonical_existing_directory EXPORT_PARENT "$export_parent_input")"
[[ "$EXPORT_DIR" == "$EXPORT_PARENT/$export_basename" ]] \
  || die "EXPORT_DIR muss bereits kanonisch sein und darf weder Symlinkanteile noch .. enthalten."
assert_disjoint_paths EXPORT_DIR "$EXPORT_DIR" PROJECT_ROOT "$PROJECT_ROOT"
[[ ! -e "$EXPORT_DIR" && ! -L "$EXPORT_DIR" ]] \
  || die "EXPORT_DIR muss neu sein und darf vor dem Export nicht existieren."

LIBPQ_DIR="$(canonical_existing_directory LIBPQ_DIR "$LIBPQ_DIR")"
[[ "$LIBPQ_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || die "LIBPQ_DIR darf nur sichere portable Pfadzeichen enthalten."
assert_disjoint_paths LIBPQ_DIR "$LIBPQ_DIR" PROJECT_ROOT "$PROJECT_ROOT"
assert_disjoint_paths EXPORT_DIR "$EXPORT_DIR" LIBPQ_DIR "$LIBPQ_DIR"

GKE_FREEZE_CONFIG="$(canonical_protected_file GKE_FREEZE_CONFIG "$GKE_FREEZE_CONFIG")"
GLOBAL_WRITER_ATTESTATION="$(canonical_protected_file GLOBAL_WRITER_ATTESTATION "$GLOBAL_WRITER_ATTESTATION")"
for protected_file in "$GKE_FREEZE_CONFIG" "$GLOBAL_WRITER_ATTESTATION"; do
  assert_disjoint_paths PROTECTED_CUTOVER_FILE "$protected_file" PROJECT_ROOT "$PROJECT_ROOT"
  assert_disjoint_paths PROTECTED_CUTOVER_FILE "$protected_file" EXPORT_DIR "$EXPORT_DIR"
  assert_disjoint_paths PROTECTED_CUTOVER_FILE "$protected_file" LIBPQ_DIR "$LIBPQ_DIR"
done
[[ "$GKE_FREEZE_CONFIG" != "$GLOBAL_WRITER_ATTESTATION" ]] \
  || die "GKE_FREEZE_CONFIG und GLOBAL_WRITER_ATTESTATION muessen getrennte Dateien sein."

GKE_FREEZE_OPERATOR="$SCRIPT_DIR/gke-writer-freeze.mjs"
[[ -f "$GKE_FREEZE_OPERATOR" && ! -L "$GKE_FREEZE_OPERATOR" && -x "$GKE_FREEZE_OPERATOR" ]] \
  || die "Versionierter GKE-Writer-Freeze-Operator fehlt oder ist nicht ausfuehrbar."
[[ "$(realpath "$GKE_FREEZE_OPERATOR")" == "$GKE_FREEZE_OPERATOR" ]] \
  || die "GKE-Writer-Freeze-Operator ist nicht kanonisch oder symlinkfrei."
git -C "$PROJECT_ROOT" ls-files --error-unmatch "deploy/single-server/migration/gke-writer-freeze.mjs" >/dev/null \
  || die "GKE-Writer-Freeze-Operator ist nicht versioniert."

current_uid="$(id -u)"
[[ "$(stat_uid "$EXPORT_PARENT")" == "$current_uid" && "$(stat_mode "$EXPORT_PARENT")" == "700" ]] \
  || die "EXPORT_PARENT muss dem aufrufenden Nutzer gehoeren und Modus 0700 besitzen."
[[ "$(stat_uid "$LIBPQ_DIR")" == "$current_uid" && "$(stat_mode "$LIBPQ_DIR")" == "700" ]] \
  || die "LIBPQ_DIR muss dem aufrufenden Nutzer gehoeren und Modus 0700 besitzen."

PGSERVICE_FILE="$LIBPQ_DIR/pg_service.conf"
PGPASS_FILE="$LIBPQ_DIR/pgpass"
SOURCE_TARGET_FILE="$LIBPQ_DIR/source-target.conf"
expected_libpq_inventory="$(printf '%s\n' "$PGPASS_FILE" "$PGSERVICE_FILE" "$SOURCE_TARGET_FILE" | LC_ALL=C sort)"
actual_libpq_inventory="$(find "$LIBPQ_DIR" -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)"
[[ "$actual_libpq_inventory" == "$expected_libpq_inventory" ]] \
  || die "LIBPQ_DIR muss genau pg_service.conf, pgpass und source-target.conf enthalten."
for libpq_file in "$PGSERVICE_FILE" "$PGPASS_FILE" "$SOURCE_TARGET_FILE"; do
  [[ -f "$libpq_file" && ! -L "$libpq_file" ]] \
    || die "libpq-Datei fehlt, ist nicht regulaer oder ist ein Symlink: $(basename -- "$libpq_file")"
  [[ "$(realpath "$libpq_file")" == "$libpq_file" ]] \
    || die "libpq-Datei ist nicht kanonisch oder enthaelt einen Symlink: $(basename -- "$libpq_file")"
  [[ "$(stat_uid "$libpq_file")" == "$current_uid" && "$(stat_mode "$libpq_file")" == "600" ]] \
    || die "libpq-Datei muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen: $(basename -- "$libpq_file")"
done

awk -F= '
  NR == 1 { if ($0 != "FORMAT_VERSION=1") exit 1; next }
  NR == 2 { if ($1 != "GCP_PROJECT_ID" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/) exit 1; next }
  NR == 3 { if ($1 != "CLOUD_SQL_INSTANCE_CONNECTION_NAME" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]{0,96}[a-z0-9]$/) exit 1; next }
  NR == 4 { if ($1 != "CLOUD_SQL_DATABASE" || $2 != "versorgungs_kompass") exit 1; next }
  NR == 5 { if ($1 != "CLOUD_SQL_USER" || $2 !~ /^[a-z_][a-z0-9_]{0,62}$/) exit 1; next }
  { exit 1 }
  END { if (NR != 5) exit 1 }
' "$SOURCE_TARGET_FILE" \
  || die "source-target.conf ist nicht der exakte freigegebene Cloud-SQL-Sollvertrag."
GCP_PROJECT_ID="$(awk -F= '$1 == "GCP_PROJECT_ID" { print $2 }' "$SOURCE_TARGET_FILE")"
CLOUD_SQL_INSTANCE_CONNECTION_NAME="$(awk -F= '$1 == "CLOUD_SQL_INSTANCE_CONNECTION_NAME" { print $2 }' "$SOURCE_TARGET_FILE")"
CLOUD_SQL_DATABASE="$(awk -F= '$1 == "CLOUD_SQL_DATABASE" { print $2 }' "$SOURCE_TARGET_FILE")"
CLOUD_SQL_USER="$(awk -F= '$1 == "CLOUD_SQL_USER" { print $2 }' "$SOURCE_TARGET_FILE")"
[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "$GCP_PROJECT_ID:"* ]] \
  || die "Cloud-SQL-Verbindungsname gehoert nicht zum bestaetigten GCP-Projekt."
CLOUD_SQL_INSTANCE_NAME="${CLOUD_SQL_INSTANCE_CONNECTION_NAME##*:}"
CLOUD_SQL_SOCKET_DIR="/cloudsql/$CLOUD_SQL_INSTANCE_CONNECTION_NAME"

active_project="$(gcloud config get-value project --quiet 2>/dev/null)" \
  || die "Aktives gcloud-Projekt konnte nicht gelesen werden."
[[ "$active_project" == "$GCP_PROJECT_ID" ]] \
  || die "Aktives gcloud-Projekt stimmt nicht mit source-target.conf ueberein."
instance_json="$(gcloud sql instances describe "$CLOUD_SQL_INSTANCE_NAME" \
  --project "$GCP_PROJECT_ID" --format=json --quiet)" \
  || die "Cloud-SQL-Instanz konnte nicht read-only bestaetigt werden."
GCP_PROJECT_ID="$GCP_PROJECT_ID" \
CLOUD_SQL_INSTANCE_CONNECTION_NAME="$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
node -e '
  const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (input.connectionName !== process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
      || input.project !== process.env.GCP_PROJECT_ID
      || input.databaseVersion !== "POSTGRES_16"
      || input.state !== "RUNNABLE") process.exit(1);
' <<<"$instance_json" \
  || die "Cloud-SQL-Readback passt nicht exakt zu Projekt, Instanz, PostgreSQL 16 und RUNNABLE-Status."

read_frozen_writer_evidence() {
  local freeze_output namespace_inventory state_values state_file state_sha binding_fingerprint
  freeze_output="$("$GKE_FREEZE_OPERATOR" freeze --config "$GKE_FREEZE_CONFIG" --readback)" \
    || die "GKE-Writer-Freeze-Readback ist fehlgeschlagen. Export bleibt gesperrt."
  for required_line in \
    "AKTION=freeze" \
    "PHASE=readback-frozen" \
    "FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0" \
    "NACHWEIS_GRENZE=konfiguriertes-namespace-und-api-deployment" \
    "NICHT_ERFASST=externe-db-clients-und-andere-namespaces" \
    "EXTERNER_GLOBALER_WRITER_NACHWEIS=separat-erforderlich" \
    "STATUSDATEI_PHASE=frozen" \
    "OPERATOR_REVISION=$TARGET_REVISION"; do
    [[ "$(grep -Fxc "$required_line" <<<"$freeze_output")" == "1" ]] \
      || die "GKE-Writer-Freeze-Readback besitzt nicht den exakt erwarteten Zustand: $required_line"
  done
  namespace_inventory="$(sed -nE 's/^NAMESPACE_INVENTAR_SHA256=([a-f0-9]{64})$/\1/p' <<<"$freeze_output")"
  [[ "$namespace_inventory" =~ ^[a-f0-9]{64}$ ]] \
    || die "GKE-Namespace-Inventarfingerprint fehlt oder ist mehrdeutig."

  state_values="$(awk -F= '$1 == "STATE_FILE" { print substr($0, index($0, "=") + 1) }' "$GKE_FREEZE_CONFIG")"
  [[ "$(wc -l <<<"$state_values" | tr -d '[:space:]')" == "1" && -n "$state_values" ]] \
    || die "GKE-Zielkonfiguration bindet nicht genau eine STATE_FILE."
  state_file="$(canonical_protected_file GKE_FREEZE_STATE "$state_values")"
  assert_disjoint_paths GKE_FREEZE_STATE "$state_file" PROJECT_ROOT "$PROJECT_ROOT"
  assert_disjoint_paths GKE_FREEZE_STATE "$state_file" EXPORT_DIR "$EXPORT_DIR"
  assert_disjoint_paths GKE_FREEZE_STATE "$state_file" LIBPQ_DIR "$LIBPQ_DIR"
  state_sha="$(sha256sum "$state_file" | awk '{print $1}')"
  binding_fingerprint="$(GKE_FREEZE_STATE="$state_file" \
    EXPECTED_GCP_PROJECT_ID="$GCP_PROJECT_ID" \
    EXPECTED_TARGET_REVISION="$TARGET_REVISION" \
    node -e '
      const fs = require("node:fs");
      const state = JSON.parse(fs.readFileSync(process.env.GKE_FREEZE_STATE, "utf8"));
      if (state.phase !== "frozen"
          || state.gcp_project_id !== process.env.EXPECTED_GCP_PROJECT_ID
          || state.operator_revision !== process.env.EXPECTED_TARGET_REVISION
          || !/^[a-f0-9]{64}$/.test(state.binding_fingerprint || "")
          || !/^[0-9]+$/.test(state.frozen_deployment_resource_version || "")
          || !Number.isInteger(state.frozen_deployment_generation)
          || state.frozen_deployment_generation < 1) process.exit(1);
      process.stdout.write(state.binding_fingerprint);
    ')" || die "GKE-Freeze-Statusdatei passt nicht zu Projekt, Zielrevision und Frozen-Readback."
  printf '%s\t%s\t%s\t%s\n' "$state_file" "$state_sha" "$binding_fingerprint" "$namespace_inventory"
}

IFS=$'\t' read -r GKE_FREEZE_STATE_FILE GKE_FREEZE_STATE_SHA256 GKE_BINDING_FINGERPRINT NAMESPACE_INVENTORY_SHA256 \
  <<<"$(read_frozen_writer_evidence)"

GLOBAL_WRITER_ATTESTATION_SHA256="$(sha256sum "$GLOBAL_WRITER_ATTESTATION" | awk '{print $1}')"
validate_global_writer_attestation() {
  local current_attestation_sha256
  current_attestation_sha256="$(sha256sum "$GLOBAL_WRITER_ATTESTATION" | awk '{print $1}')"
  [[ "$current_attestation_sha256" == "$GLOBAL_WRITER_ATTESTATION_SHA256" ]] \
    || die "Globaler Writer-Nachweis wurde waehrend des Exports veraendert."
  GCP_PROJECT_ID="$GCP_PROJECT_ID" \
  CLOUD_SQL_INSTANCE_CONNECTION_NAME="$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  GKE_FREEZE_STATE_SHA256="$GKE_FREEZE_STATE_SHA256" \
  GKE_BINDING_FINGERPRINT="$GKE_BINDING_FINGERPRINT" \
  NAMESPACE_INVENTORY_SHA256="$NAMESPACE_INVENTORY_SHA256" \
  GLOBAL_WRITER_ATTESTATION="$GLOBAL_WRITER_ATTESTATION" \
  node -e '
  const fs = require("node:fs");
  const expected = [
    ["FORMAT_VERSION", "1"],
    ["GCP_PROJECT_ID", process.env.GCP_PROJECT_ID],
    ["CLOUD_SQL_INSTANCE_CONNECTION_NAME", process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME],
    ["GKE_STATE_SHA256", process.env.GKE_FREEZE_STATE_SHA256],
    ["GKE_BINDING_FINGERPRINT", process.env.GKE_BINDING_FINGERPRINT],
    ["NAMESPACE_INVENTORY_SHA256", process.env.NAMESPACE_INVENTORY_SHA256],
    ["OTHER_NAMESPACES_DB_WRITERS", "none"],
    ["EXTERNAL_DB_WRITERS", "none"]
  ];
  const lines = fs.readFileSync(process.env.GLOBAL_WRITER_ATTESTATION, "utf8").split("\n");
  if (lines.at(-1) !== "") process.exit(1);
  lines.pop();
  if (lines.length !== expected.length + 1) process.exit(1);
  for (let index = 0; index < expected.length; index += 1) {
    if (lines[index] !== `${expected[index][0]}=${expected[index][1]}`) process.exit(1);
  }
  const timestamp = /^ATTESTED_AT=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/.exec(lines.at(-1));
  if (!timestamp) process.exit(1);
  const age = Date.now() - Date.parse(timestamp[1]);
  if (!Number.isFinite(age) || age < -30_000 || age > 10 * 60 * 1000) process.exit(1);
  ' || die "Globaler Writer-Nachweis ist nicht aktuell oder nicht exakt an GKE-Freeze und Cloud SQL gebunden."
}
validate_global_writer_attestation

awk -F= \
  -v expected_host="$CLOUD_SQL_SOCKET_DIR" \
  -v expected_database="$CLOUD_SQL_DATABASE" \
  -v expected_user="$CLOUD_SQL_USER" '
    NR == 1 { if ($0 != "[versorgungs-kompass-source]") exit 1; next }
    NR == 2 { if ($0 != "host=" expected_host) exit 1; next }
    NR == 3 { if ($0 != "port=5432") exit 1; next }
    NR == 4 { if ($0 != "dbname=" expected_database) exit 1; next }
    NR == 5 { if ($0 != "user=" expected_user) exit 1; next }
    NR == 6 { if ($0 != "sslmode=disable") exit 1; next }
    { exit 1 }
    END { if (NR != 6) exit 1 }
  ' "$PGSERVICE_FILE" \
  || die "pg_service.conf muss exakt auf den bestaetigten Cloud-SQL-Proxy-Socket zeigen und darf keine Zusatzparameter enthalten."

PSQL_BIN="$(canonical_command psql)"
PG_DUMP_BIN="$(canonical_command pg_dump)"
PG_RESTORE_BIN="$(canonical_command pg_restore)"
SHA256_BIN="$(canonical_command sha256sum)"
ENV_BIN="$(type -P env)" || die "env ist nicht als ausfuehrbare Datei aufloesbar."
[[ "$ENV_BIN" == /* && -x "$ENV_BIN" ]] || die "env besitzt keinen absoluten ausfuehrbaren Programmpfad."
for pg_tool in "$PSQL_BIN" "$PG_DUMP_BIN" "$PG_RESTORE_BIN"; do
  [[ "$("$ENV_BIN" -i LC_ALL=C "$pg_tool" --version)" =~ PostgreSQL[^0-9]*16\. ]] \
    || die "psql, pg_dump und pg_restore muessen jeweils aus PostgreSQL 16 stammen."
done

run_libpq() {
  "$ENV_BIN" -i \
    LC_ALL=C \
    PGAPPNAME="$DATABASE_EXPORT_APPLICATION_NAME" \
    PGSERVICEFILE="$PGSERVICE_FILE" \
    PGPASSFILE="$PGPASS_FILE" \
    PGCONNECT_TIMEOUT=10 \
    "$@"
}

DATABASE_EXPORT_APPLICATION_NAME="vk-cutover-export-$$"
[[ "$DATABASE_EXPORT_APPLICATION_NAME" =~ ^[a-z0-9-]{1,63}$ ]] \
  || die "Interner Datenbank-Exportname ist ungueltig."
source_service='service=versorgungs-kompass-source'
server_version="$(run_libpq "$PSQL_BIN" --dbname="$source_service" --no-password --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='show server_version_num' | tr -d '[:space:]')"
[[ "$server_version" =~ ^16[0-9]{4}$ ]] || die "Quelldatenbank muss PostgreSQL 16 verwenden."
source_database="$(run_libpq "$PSQL_BIN" --dbname="$source_service" --no-password --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='select current_database()' | tr -d '[:space:]')"
[[ "$source_database" == "versorgungs_kompass" ]] || die "libpq-Service zeigt nicht auf die erwartete Quelldatenbank."

assert_other_database_clients() {
  local expected_count="$1" inventory_result
  [[ "$expected_count" =~ ^[01]$ ]] || die "Interner Session-Sollwert ist ungueltig."
  inventory_result="$(run_libpq "$PSQL_BIN" \
    --dbname="$source_service" \
    --no-password \
    --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 \
    --set=EXPECTED_OTHER_SESSIONS="$expected_count" \
    --set=EXPECTED_APPLICATION_NAME="$DATABASE_EXPORT_APPLICATION_NAME" <<'SQL'
with other_clients as (
  select application_name
    from pg_catalog.pg_stat_activity
   where datname = current_database()
     and backend_type = 'client backend'
     and pid <> pg_backend_pid()
)
select case
  when count(*) = :'EXPECTED_OTHER_SESSIONS'::integer
   and count(*) filter (where application_name = :'EXPECTED_APPLICATION_NAME') = :'EXPECTED_OTHER_SESSIONS'::integer
  then 'ok'
  else 'blocked'
end
from other_clients;
SQL
  )" || die "Cloud-SQL-Client-Sessions konnten nicht fail-closed inventarisiert werden."
  [[ "$(tr -d '[:space:]' <<<"$inventory_result")" == "ok" ]] \
    || die "Unerwartete Cloud-SQL-Client-Session blockiert den Export."
}

# Vor dem Snapshot darf ausser diesem kurzen Readback keine Client-Session auf
# der Quelldatenbank bestehen. Damit wird die manuelle globale Attestation
# unmittelbar technisch gegen pg_stat_activity gegengeprueft.
assert_other_database_clients 0

mkdir -m 0700 -- "$EXPORT_DIR" \
  || die "Neues Exportziel konnte nicht atomar angelegt werden."
export_created=1
export_complete=0
snapshot_holder_pid=""
snapshot_id_file="$EXPORT_DIR/.database-snapshot-id"
snapshot_holder_log="$EXPORT_DIR/.database-snapshot-holder.log"
report_partial_export() {
  local status="$?"
  if [[ -n "$snapshot_holder_pid" ]]; then
    kill "$snapshot_holder_pid" 2>/dev/null || true
    wait "$snapshot_holder_pid" 2>/dev/null || true
  fi
  [[ ! -e "$snapshot_id_file" && ! -L "$snapshot_id_file" ]] || unlink -- "$snapshot_id_file" 2>/dev/null || true
  [[ ! -e "$snapshot_holder_log" && ! -L "$snapshot_holder_log" ]] || unlink -- "$snapshot_holder_log" 2>/dev/null || true
  if [[ "$status" -ne 0 && "$export_created" -eq 1 && "$export_complete" -eq 0 ]]; then
    printf 'FEHLER: Unvollstaendiges Exportziel bleibt zur Sichtpruefung gesperrt liegen: %s\n' "$EXPORT_DIR" >&2
  fi
  return "$status"
}
trap report_partial_export EXIT
[[ "$(realpath "$EXPORT_DIR")" == "$EXPORT_DIR" && ! -L "$EXPORT_DIR" ]] \
  || die "Neu angelegtes EXPORT_DIR ist nicht kanonisch oder symlinkfrei."
[[ "$(stat_uid "$EXPORT_DIR")" == "$current_uid" && "$(stat_mode "$EXPORT_DIR")" == "700" ]] \
  || die "Neu angelegtes EXPORT_DIR besitzt nicht UID des Nutzers und Modus 0700."
[[ -z "$(find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
  || die "Neu angelegtes EXPORT_DIR ist nicht leer."

run_libpq "$PSQL_BIN" \
  --dbname="$source_service" \
  --no-password \
  --no-psqlrc --quiet --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 >"$snapshot_holder_log" 2>&1 <<SQL &
begin isolation level repeatable read read only;
select format(
  'lock table %I.%I in share mode;',
  n.nspname,
  c.relname
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname
\\gexec
\\o $snapshot_id_file
select pg_export_snapshot();
\\o
select pg_sleep(1800);
rollback;
SQL
snapshot_holder_pid="$!"
snapshot_attempt=0
while [[ "$snapshot_attempt" -lt 20 && ! -s "$snapshot_id_file" ]]; do
  kill -0 "$snapshot_holder_pid" 2>/dev/null \
    || die "Exportierter Datenbank-Snapshot konnte nicht offen gehalten werden."
  snapshot_attempt=$((snapshot_attempt + 1))
  sleep 1
done
[[ -s "$snapshot_id_file" ]] || die "Datenbank-Snapshot-ID wurde nicht rechtzeitig bereitgestellt."
DATABASE_SNAPSHOT_ID="$(tr -d '[:space:]' <"$snapshot_id_file")"
[[ "$DATABASE_SNAPSHOT_ID" =~ ^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$ ]] \
  || die "Exportierte Datenbank-Snapshot-ID ist ungueltig."

run_libpq "$PG_DUMP_BIN" \
  --dbname="$source_service" \
  --no-password \
  --format=custom \
  --compress=6 \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --snapshot="$DATABASE_SNAPSHOT_ID" \
  --lock-wait-timeout=10000 \
  --file="$EXPORT_DIR/database.dump"
kill -0 "$snapshot_holder_pid" 2>/dev/null \
  || die "Datenbank-Snapshot-Halter endete vor Abschluss des Dumps."

dump_bytes="$(stat_size "$EXPORT_DIR/database.dump")"
if ! [[ "$dump_bytes" =~ ^[1-9][0-9]*$ ]] || (( dump_bytes > 5368709120 )); then
  die "database.dump ist leer oder groesser als 5 GiB."
fi
"$ENV_BIN" -i LC_ALL=C "$PG_RESTORE_BIN" --list "$EXPORT_DIR/database.dump" \
  >"$EXPORT_DIR/database.toc"
awk '
  /^[[:space:]]*$/ { next }
  /^;/ { next }
  /^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public [a-z0-9_]+ [a-zA-Z0-9_]+$/ { allowed++; next }
  /^[0-9]+; [0-9]+ [0-9]+ SEQUENCE SET public [a-z0-9_]+ [a-zA-Z0-9_]+$/ { allowed++; next }
  { invalid=1 }
  END { exit invalid || allowed < 1 }
' "$EXPORT_DIR/database.toc" \
  || die "Dump-TOC enthaelt andere Eintraege als TABLE DATA oder SEQUENCE SET im Schema public."

printf 'schema\ttable\trows\n' >"$EXPORT_DIR/row-counts.tsv"
run_libpq "$PSQL_BIN" \
  --dbname="$source_service" \
  --no-password \
  --no-psqlrc --quiet --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 --set=SNAPSHOT_ID="$DATABASE_SNAPSHOT_ID" --field-separator="$(printf '\t')" <<'SQL' \
  >>"$EXPORT_DIR/row-counts.tsv"
begin isolation level repeatable read read only;
set transaction snapshot :'SNAPSHOT_ID';
select format(
  'select %L::text, %L::text, count(*)::bigint from %I.%I;',
  n.nspname,
  c.relname,
  n.nspname,
  c.relname
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname
\gexec
commit;
SQL

printf 'reference_type\trows\n' >"$EXPORT_DIR/storage-reference-counts.tsv"
run_libpq "$PSQL_BIN" \
  --dbname="$source_service" \
  --no-password \
  --no-psqlrc --quiet --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 --set=SNAPSHOT_ID="$DATABASE_SNAPSHOT_ID" --field-separator="$(printf '\t')" <<'SQL' \
  >>"$EXPORT_DIR/storage-reference-counts.tsv"
begin isolation level repeatable read read only;
set transaction snapshot :'SNAPSHOT_ID';
select reference_type, rows
from (
  select 'contact_images'::text as reference_type,
         count(*)::bigint as rows
  from public.contacts
  where nullif(btrim(image_storage_path), '') is not null
  union all
  select 'contact_note_attachments', count(*)::bigint
  from public.contact_note_attachments
  union all
  select 'profile_images', count(*)::bigint
  from public.profiles
  where avatar_url like 'gs://%'
     or avatar_url like 'private://profile-images/%'
  union all
  select 'stakeholder_logos', count(*)::bigint
  from public.stakeholder_organizations
  where logo_url like 'private://stakeholder-logos/%'
) counts
order by reference_type;
commit;
SQL

expected_storage_counts=$'reference_type\trows\ncontact_images\t0\ncontact_note_attachments\t0\nprofile_images\t0\nstakeholder_logos\t0'
actual_storage_counts="$(<"$EXPORT_DIR/storage-reference-counts.tsv")"
[[ "$actual_storage_counts" == "$expected_storage_counts" ]] \
  || die "Objektreferenzzaehlungen sind nicht fuer alle vier Datenbereiche exakt null."

kill -0 "$snapshot_holder_pid" 2>/dev/null \
  || die "Datenbank-Snapshot-Halter endete vor dem abschliessenden Writer-Readback."
IFS=$'\t' read -r GKE_FREEZE_STATE_FILE_AFTER GKE_FREEZE_STATE_SHA256_AFTER GKE_BINDING_FINGERPRINT_AFTER NAMESPACE_INVENTORY_SHA256_AFTER \
  <<<"$(read_frozen_writer_evidence)"
[[ "$GKE_FREEZE_STATE_FILE_AFTER" == "$GKE_FREEZE_STATE_FILE" \
   && "$GKE_FREEZE_STATE_SHA256_AFTER" == "$GKE_FREEZE_STATE_SHA256" \
   && "$GKE_BINDING_FINGERPRINT_AFTER" == "$GKE_BINDING_FINGERPRINT" \
   && "$NAMESPACE_INVENTORY_SHA256_AFTER" == "$NAMESPACE_INVENTORY_SHA256" ]] \
  || die "GKE-Freeze oder Namespace-Inventar hat sich waehrend des Exports veraendert; Paket wird nicht finalisiert."
validate_global_writer_attestation
# Zu diesem Zeitpunkt darf genau die von diesem Wrapper benannte
# Snapshot-Halter-Session uebrig sein. Jede weitere Client-Session stoppt die
# Finalisierung, waehrend die SHARE-Sperren noch gehalten werden.
assert_other_database_clients 1

kill "$snapshot_holder_pid" 2>/dev/null || true
wait "$snapshot_holder_pid" 2>/dev/null || true
snapshot_holder_pid=""
unlink -- "$snapshot_id_file"
unlink -- "$snapshot_holder_log"

printf 'key\tvalue\ndatabase\tversorgungs_kompass\nformat_version\t2\npostgres_major\t16\nsource_deployed_revision\t%s\ntarget_revision\t%s\ncloud_sql_instance_connection_name\t%s\ngke_binding_fingerprint\t%s\ngke_freeze_state_sha256\t%s\nglobal_writer_attestation_sha256\t%s\nnamespace_inventory_sha256\t%s\ndatabase_snapshot_id\t%s\nexported_at\t%s\n' \
  "$SOURCE_DEPLOYED_REVISION" \
  "$TARGET_REVISION" \
  "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  "$GKE_BINDING_FINGERPRINT" \
  "$GKE_FREEZE_STATE_SHA256" \
  "$GLOBAL_WRITER_ATTESTATION_SHA256" \
  "$NAMESPACE_INVENTORY_SHA256" \
  "$DATABASE_SNAPSHOT_ID" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >"$EXPORT_DIR/migration-metadata.tsv"

(
  cd -- "$EXPORT_DIR"
  "$SHA256_BIN" \
    database.dump \
    database.toc \
    migration-metadata.tsv \
    row-counts.tsv \
    storage-reference-counts.tsv \
    >SHA256SUMS
)
chmod 0600 "$EXPORT_DIR"/*
[[ "$(find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d '[:space:]')" == "6" ]] \
  || die "Fertiges Exportpaket enthaelt nicht exakt sechs regulaere Dateien."

package_fingerprint="$("$SHA256_BIN" "$EXPORT_DIR/SHA256SUMS" | awk '{print $1}')"
export_complete=1
trap - EXIT
printf 'Datenexport erfolgreich. Ziel: %s\nZielrevision: %s\nPaketfingerprint: %s\n' \
  "$EXPORT_DIR" "$TARGET_REVISION" "$package_fingerprint"
