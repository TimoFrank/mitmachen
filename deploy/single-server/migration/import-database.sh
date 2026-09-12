#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SINGLE_SERVER_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SINGLE_SERVER_DIR/common.sh"

single_server_load_environment "${1:-}"
[[ "$API_CUTOVER_MODE" == "closed" ]] \
  || single_server_die "Datenbankimport ist ausschliesslich im konfigurierten Cutover-Modus closed zulaessig."
confirmation="${2:-}"
[[ "$#" -le 2 ]] || single_server_die "Aufruf: import-database.sh /absolut/single-server.env [EXAKTE_BESTAETIGUNG]"

[[ "$(uname -s)" == "Linux" ]] || single_server_die "Datenbankimport ist nur auf dem Linux-Zielhost zulaessig."
[[ "$(id -u)" -eq 0 ]] || single_server_die "Datenbankimport benoetigt root fuer die geschuetzte Betriebssteuerung."
single_server_require_command awk
single_server_require_command docker
single_server_require_command find
single_server_require_command grep
single_server_require_command realpath
single_server_require_command sha256sum
single_server_require_command sort
single_server_require_command stat
single_server_require_command wc

: "${MIGRATION_DIR:?MIGRATION_DIR fehlt in der externen Environment-Datei}"
MIGRATION_MAX_DUMP_BYTES="${MIGRATION_MAX_DUMP_BYTES:-5368709120}"
single_server_assert_narrow_absolute_path MIGRATION_DIR "$MIGRATION_DIR"
[[ "$MIGRATION_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || single_server_die "MIGRATION_DIR darf nur sichere portable Pfadzeichen enthalten."
canonical_migration_dir="$(realpath -e -- "$MIGRATION_DIR")" \
  || single_server_die "MIGRATION_DIR kann nicht kanonisch aufgeloest werden."
[[ "$canonical_migration_dir" == "$MIGRATION_DIR" ]] \
  || single_server_die "MIGRATION_DIR muss bereits ein kanonischer Pfad ohne Symlink oder .. sein."
canonical_state_dir="$(realpath -e -- "$STATE_DIR")" \
  || single_server_die "STATE_DIR kann nicht kanonisch aufgeloest werden."
canonical_config_dir="$(realpath -e -- "$CONFIG_DIR")" \
  || single_server_die "CONFIG_DIR kann nicht kanonisch aufgeloest werden."
[[ "$canonical_migration_dir" != "$PROJECT_ROOT" && "$canonical_migration_dir" != "$PROJECT_ROOT/"* ]] \
  || single_server_die "MIGRATION_DIR darf nicht im Git-Checkout liegen."
[[ "$canonical_migration_dir" != "$canonical_state_dir" && "$canonical_migration_dir" != "$canonical_state_dir/"* && "$canonical_state_dir" != "$canonical_migration_dir/"* ]] \
  || single_server_die "MIGRATION_DIR und STATE_DIR muessen getrennte, nicht verschachtelte Pfade sein."
[[ "$canonical_migration_dir" != "$canonical_config_dir" && "$canonical_migration_dir" != "$canonical_config_dir/"* && "$canonical_config_dir" != "$canonical_migration_dir/"* ]] \
  || single_server_die "MIGRATION_DIR und CONFIG_DIR muessen getrennte, nicht verschachtelte Pfade sein."
[[ "$MIGRATION_MAX_DUMP_BYTES" =~ ^[1-9][0-9]{6,10}$ ]] \
  || single_server_die "MIGRATION_MAX_DUMP_BYTES muss eine enge positive Byte-Grenze sein."
(( MIGRATION_MAX_DUMP_BYTES <= 10737418240 )) \
  || single_server_die "MIGRATION_MAX_DUMP_BYTES darf 10 GiB nicht ueberschreiten."

[[ -d "$MIGRATION_DIR" && ! -L "$MIGRATION_DIR" ]] \
  || single_server_die "Externes Migrationsverzeichnis fehlt oder ist ein Symlink."
[[ "$(stat -c '%u:%g' "$MIGRATION_DIR")" == "70:70" ]] \
  || single_server_die "MIGRATION_DIR muss UID/GID 70:70 gehoeren."
[[ "$(stat -c '%a' "$MIGRATION_DIR")" == "700" ]] \
  || single_server_die "MIGRATION_DIR muss Modus 0700 besitzen."

package_files=(
  database.dump
  database.toc
  migration-metadata.tsv
  row-counts.tsv
  storage-reference-counts.tsv
  SHA256SUMS
)
for name in "${package_files[@]}"; do
  target="$MIGRATION_DIR/$name"
  [[ -f "$target" && ! -L "$target" ]] \
    || single_server_die "Migrationsdatei fehlt, ist kein regulaeres File oder ist ein Symlink: $name"
  [[ "$(stat -c '%u:%g' "$target")" == "70:70" ]] \
    || single_server_die "Migrationsdatei muss UID/GID 70:70 gehoeren: $name"
  [[ "$(stat -c '%a' "$target")" == "600" ]] \
    || single_server_die "Migrationsdatei muss Modus 0600 besitzen: $name"
done

actual_inventory="$(find "$MIGRATION_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)"
expected_inventory="$(printf '%s\n' "${package_files[@]}" | LC_ALL=C sort)"
[[ "$actual_inventory" == "$expected_inventory" ]] \
  || single_server_die "MIGRATION_DIR muss genau die sechs freigegebenen Paketdateien enthalten."

dump_bytes="$(stat -c '%s' "$MIGRATION_DIR/database.dump")"
if ! [[ "$dump_bytes" =~ ^[1-9][0-9]*$ ]] || (( dump_bytes > MIGRATION_MAX_DUMP_BYTES )); then
  single_server_die "database.dump ist leer oder ueberschreitet die konfigurierte Groessengrenze."
fi

awk '
  BEGIN {
    allowed["database.dump"] = 1
    allowed["database.toc"] = 1
    allowed["migration-metadata.tsv"] = 1
    allowed["row-counts.tsv"] = 1
    allowed["storage-reference-counts.tsv"] = 1
  }
  NF != 2 || length($1) != 64 || $1 !~ /^[a-f0-9]+$/ || !($2 in allowed) || seen[$2]++ { invalid=1 }
  END {
    if (NR != 5) invalid=1
    for (name in allowed) if (seen[name] != 1) invalid=1
    exit invalid
  }
' "$MIGRATION_DIR/SHA256SUMS" \
  || single_server_die "SHA256SUMS muss genau einen kanonischen Eintrag je Paketdatei enthalten."

(
  cd "$MIGRATION_DIR"
  sha256sum -c SHA256SUMS >/dev/null
) || single_server_die "SHA256SUMS stimmt nicht mit dem Migrationspaket ueberein."

awk -F '\t' '
  NF != 2 { exit 1 }
  NR == 1 { if ($0 != "key\tvalue") exit 1; next }
  NR == 2 { if ($1 != "database" || $2 != "versorgungs_kompass") exit 1; next }
  NR == 3 { if ($1 != "format_version" || $2 != "2") exit 1; next }
  NR == 4 { if ($1 != "postgres_major" || $2 != "16") exit 1; next }
  NR == 5 {
    if ($1 != "source_deployed_revision" || $2 !~ /^[a-f0-9]+$/ || (length($2) != 40 && length($2) != 64)) exit 1
    next
  }
  NR == 6 {
    if ($1 != "target_revision" || $2 !~ /^[a-f0-9]+$/ || (length($2) != 40 && length($2) != 64)) exit 1
    next
  }
  NR == 7 {
    if ($1 != "cloud_sql_instance_connection_name" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]{0,96}[a-z0-9]$/) exit 1
    next
  }
  NR >= 8 && NR <= 11 {
    expected[8]="gke_binding_fingerprint"
    expected[9]="gke_freeze_state_sha256"
    expected[10]="global_writer_attestation_sha256"
    expected[11]="namespace_inventory_sha256"
    if ($1 != expected[NR] || $2 !~ /^[a-f0-9]{64}$/) exit 1
    next
  }
  NR == 12 {
    if ($1 != "database_snapshot_id" || $2 !~ /^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/) exit 1
    next
  }
  NR == 13 {
    if ($1 != "exported_at" || $2 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/) exit 1
    next
  }
  { exit 1 }
  END { if (NR != 13) exit 1 }
' "$MIGRATION_DIR/migration-metadata.tsv" \
  || single_server_die "migration-metadata.tsv ist nicht kanonisch oder unvollstaendig."
target_revision="$(awk -F '\t' '$1 == "target_revision" { print $2 }' "$MIGRATION_DIR/migration-metadata.tsv")"
: "${SOURCE_REVISION:?SOURCE_REVISION fehlt nach Environment-Pruefung}"
[[ "$target_revision" == "$SOURCE_REVISION" ]] \
  || single_server_die "Zielrevision im Migrationspaket stimmt nicht exakt mit dem Ziel-Checkout ueberein."

MIGRATION_PACKAGE_SHA256="$(sha256sum "$MIGRATION_DIR/SHA256SUMS" | awk '{print $1}')"
[[ "$MIGRATION_PACKAGE_SHA256" =~ ^[a-f0-9]{64}$ ]] \
  || single_server_die "Paketfingerprint ist ungueltig."
expected_confirmation="IMPORT versorgungs_kompass PACKAGE $MIGRATION_PACKAGE_SHA256"
import_marker="$STATE_DIR/.database-import-recovery-required"

load_import_marker() {
  [[ -f "$import_marker" && ! -L "$import_marker" ]] || single_server_die "Import-Recovery-Marker fehlt oder ist kein regulaeres File."
  [[ "$(stat -c '%u:%g' "$import_marker")" == "0:0" && "$(stat -c '%a' "$import_marker")" == "600" ]] \
    || single_server_die "Import-Recovery-Marker muss root:root und Modus 0600 besitzen."
  mapfile -t marker_lines <"$import_marker"
  [[ "${#marker_lines[@]}" -eq 5 \
     && "${marker_lines[0]}" == "schemaVersion=1" \
     && "${marker_lines[1]}" =~ ^operationId=[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ \
     && "${marker_lines[2]}" == "packageSha256=$MIGRATION_PACKAGE_SHA256" \
     && "${marker_lines[3]}" == "sourceRevision=$SOURCE_REVISION" \
     && "${marker_lines[4]}" =~ ^createdAt=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
    || single_server_die "Import-Recovery-Marker passt nicht exakt zu Paket und Checkout."
  import_operation_id="${marker_lines[1]#operationId=}"
}

start_api_after_import_readback() {
  single_server_compose up -d --no-deps api
  if ! (
    single_server_wait_for_permanent_services 24 2 5 \
      && single_server_assert_running_api_revision \
      && single_server_assert_api_cutover_mode closed
  ); then
    single_server_compose stop --timeout 40 api >/dev/null 2>&1 || true
    single_server_die "API wurde nach Import-Readback nicht stabil, revisionsgebunden und closed; Recovery-Marker bleibt erhalten."
  fi
  single_server_unlink_durable_file "$import_marker"
}

if [[ "$confirmation" == "RECOVER" ]]; then
  load_import_marker
  single_server_acquire_maintenance_lock database-import-recovery
  trap 'single_server_release_maintenance_lock || true' EXIT
  single_server_install_terminating_signal_traps
  for blocking_marker in \
    "$STATE_DIR/.backup-api-restart-required" \
    "$STATE_DIR/.backup-repository-recovery-required"; do
    [[ ! -e "$blocking_marker" && ! -L "$blocking_marker" ]] \
      || single_server_die "Backup-Recovery muss vor Import-Recovery abgeschlossen sein: $blocking_marker"
  done
  if single_server_compose ps --status running --services | grep -qx 'api'; then
    single_server_assert_api_cutover_mode closed
    single_server_compose stop -t 40 api
  fi
  if single_server_compose ps --status running --services | grep -qx 'api'; then
    single_server_die "API lief nach dem Stop-Befehl weiter; Import-Recovery wurde nicht begonnen."
  fi
  single_server_remove_interrupted_import_containers "$import_operation_id"
  export MIGRATION_DIR MIGRATION_MAX_DUMP_BYTES MIGRATION_PACKAGE_SHA256
  export MIGRATION_CONFIRMATION="$expected_confirmation" MIGRATION_MODE=readback
  readback_container_name="versorgungs-kompass-import-$import_operation_id-database-import-readback"
  set +e
  single_server_compose run --name "$readback_container_name" --rm --no-deps database-import
  readback_status="$?"
  set -e
  case "$readback_status" in
    0) recovery_result="vollstaendig importiert" ;;
    20) recovery_result="atomar leer; Import kann erneut bestaetigt werden" ;;
    *) single_server_die "Import-Recovery-Readback ist nicht eindeutig. API und Marker bleiben gesperrt." ;;
  esac
  start_api_after_import_readback
  single_server_release_maintenance_lock
  trap - EXIT HUP INT TERM
  printf 'Import-Recovery erfolgreich: %s. Paketfingerprint: %s\n' "$recovery_result" "$MIGRATION_PACKAGE_SHA256"
  exit 0
fi

if [[ -z "$confirmation" ]]; then
  [[ ! -e "$import_marker" && ! -L "$import_marker" ]] \
    || single_server_die "Ein abgebrochener Import erfordert zuerst den Aufruf mit dem zweiten Argument RECOVER."
  printf 'Read-only Paketpruefung erfolgreich. Exakte Bestaetigung:\n%s\n' "$expected_confirmation"
  exit 2
fi
[[ "$confirmation" == "$expected_confirmation" ]] \
  || single_server_die "Importbestaetigung stimmt nicht exakt mit dem aktuellen Paketfingerprint ueberein."
[[ ! -e "$import_marker" && ! -L "$import_marker" ]] \
  || single_server_die "Ein abgebrochener Import erfordert zuerst den Aufruf mit dem zweiten Argument RECOVER."

single_server_acquire_maintenance_lock database-import
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers

running_services="$(single_server_compose ps --status running --services)"
grep -qx 'postgres' <<<"$running_services" \
  || single_server_die "Postgres muss vor dem Import bereits laufen."
grep -qx 'api' <<<"$running_services" \
  || single_server_die "Die API muss vor dem kontrollierten Import laufen."
single_server_assert_running_api_revision
single_server_assert_api_cutover_mode closed

export MIGRATION_DIR MIGRATION_MAX_DUMP_BYTES MIGRATION_PACKAGE_SHA256
export MIGRATION_CONFIRMATION="$confirmation" MIGRATION_MODE=apply

import_operation_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
import_container_name="versorgungs-kompass-import-$import_operation_id-database-import"
pending_marker="$STATE_DIR/.database-import-recovery-required.pending.$$"
[[ ! -e "$pending_marker" && ! -L "$pending_marker" ]] \
  || single_server_die "Temporaerer Import-Recovery-Marker existiert bereits."
(
  umask 077
  printf 'schemaVersion=1\noperationId=%s\npackageSha256=%s\nsourceRevision=%s\ncreatedAt=%s\n' \
    "$import_operation_id" "$MIGRATION_PACKAGE_SHA256" "$SOURCE_REVISION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"$pending_marker"
)
chmod 0600 -- "$pending_marker"
single_server_promote_durable_file "$pending_marker" "$import_marker"

single_server_compose stop -t 40 api
if single_server_compose ps --status running --services | grep -qx 'api'; then
  single_server_die "API lief nach dem Stop-Befehl weiter; Import wurde nicht begonnen."
fi

if ! single_server_compose run --name "$import_container_name" --rm --no-deps database-import; then
  single_server_die "Datenbankimport fehlgeschlagen. API und Recovery-Marker bleiben absichtlich gesperrt; mit RECOVER fortsetzen."
fi

start_api_after_import_readback
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf 'Datenbankimport erfolgreich; API ist wieder healthy. Paketfingerprint: %s\n' "$MIGRATION_PACKAGE_SHA256"
