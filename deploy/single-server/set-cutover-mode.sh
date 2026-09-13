#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

action="${1:-}"
env_file="${2:-}"
gate_file=""
confirmation=""
case "$action" in
  open)
    [[ "$#" -ge 3 && "$#" -le 4 ]] \
      || single_server_die "Aufruf: set-cutover-mode.sh open ENV CUTOVER_OPEN_GATES [EXAKTE_BESTAETIGUNG]"
    gate_file="$3"
    confirmation="${4:-}"
    ;;
  reopen-code)
    [[ "$#" -ge 3 && "$#" -le 4 ]] \
      || single_server_die "Aufruf: set-cutover-mode.sh reopen-code ENV CODE_REOPEN_GATES [EXAKTE_BESTAETIGUNG]"
    gate_file="$3"
    confirmation="${4:-}"
    ;;
  closed)
    [[ "$#" -ge 2 && "$#" -le 3 ]] \
      || single_server_die "Aufruf: set-cutover-mode.sh closed ENV [EXAKTE_BESTAETIGUNG]"
    confirmation="${3:-}"
    ;;
  recover-closed)
    [[ "$#" -eq 2 ]] || single_server_die "Aufruf: set-cutover-mode.sh recover-closed ENV"
    ;;
  *) single_server_die "Erste Aktion muss open, reopen-code, closed oder recover-closed sein." ;;
esac

single_server_load_environment "$env_file"
[[ "$(uname -s)" == "Linux" && "$(id -u)" -eq 0 ]] \
  || single_server_die "Der produktive Cutover-Schalter benoetigt root auf dem Linux-Zielhost."
for required_command in awk chmod chown dirname mktemp mv node realpath rm sha256sum stat sync; do
  single_server_require_command "$required_command"
done

pending_marker="$STATE_DIR/api-control/.cutover-mode-change-pending"
open_attestation="$STATE_DIR/.cutover-open-attestation"
initial_attestation="$STATE_DIR/.initial-cutover-attestation"
initial_attestation_candidate="$STATE_DIR/.initial-cutover-attestation.candidate"
closed_attestation="$STATE_DIR/.cutover-closed-attestation"
closed_deployment_attestation="$STATE_DIR/.closed-deployment-attestation"
temporary_file=""
initial_attestation_temporary=""

durable_replace() {
  local source="$1" destination="$2"
  sync -f "$source"
  mv -- "$source" "$destination"
  sync -f "$(dirname -- "$destination")"
}

durable_unlink() {
  local target="$1"
  [[ -f "$target" && ! -L "$target" ]] || return 0
  rm -f -- "$target"
  sync -f "$(dirname -- "$target")"
}

rewrite_environment_mode() {
  local mode="$1" environment_parent
  environment_parent="$(dirname -- "$SINGLE_SERVER_ENV_FILE")"
  temporary_file="$(mktemp "$environment_parent/.single-server.env.pending.XXXXXX")"
  if ! awk -v replacement="$mode" '
    /^API_CUTOVER_MODE=(closed|open)$/ {
      if (++seen != 1) exit 1
      print "API_CUTOVER_MODE=" replacement
      next
    }
    /^API_CUTOVER_MODE=/ { invalid=1; exit 1 }
    { print }
    END { if (seen != 1 || invalid) exit 1 }
  ' "$SINGLE_SERVER_ENV_FILE" >"$temporary_file"; then
    rm -f -- "$temporary_file"
    temporary_file=""
    return 1
  fi
  chmod 0600 -- "$temporary_file"
  chown 0:0 -- "$temporary_file"
  durable_replace "$temporary_file" "$SINGLE_SERVER_ENV_FILE"
  temporary_file=""
}

restart_api_in_mode() {
  local mode="$1"
  API_CUTOVER_MODE="$mode"
  export API_CUTOVER_MODE
  single_server_compose up --detach --no-deps --force-recreate api \
    && single_server_wait_for_permanent_services 24 2 5 \
    && single_server_assert_running_api_revision \
    && single_server_assert_api_cutover_mode "$mode"
}

stop_api_and_assert_stopped() {
  local running_services
  single_server_compose stop --timeout 40 api >/dev/null 2>&1 || return 1
  running_services="$(single_server_compose ps --status running --services)" || return 1
  ! grep -qx api <<<"$running_services"
}

write_pending_marker() {
  local current_mode="$1" desired_mode="$2" pending environment_sha256
  pending="$STATE_DIR/api-control/.cutover-mode-change-pending.pending.$$"
  environment_sha256="$(sha256sum "$SINGLE_SERVER_ENV_FILE" | awk '{print $1}')"
  [[ ! -e "$pending_marker" && ! -L "$pending_marker" && ! -e "$pending" && ! -L "$pending" ]] \
    || single_server_die "Ein offener oder temporaerer Cutover-Recovery-Marker blockiert den Moduswechsel."
  printf 'schemaVersion=1\ntransitionKind=%s\ncurrentMode=%s\ndesiredMode=%s\nsourceRevision=%s\nenvironmentSha256=%s\ncreatedAt=%s\n' \
    "$action" "$current_mode" "$desired_mode" "$SOURCE_REVISION" "$environment_sha256" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending"
  chmod 0600 -- "$pending"
  chown 0:0 -- "$pending"
  durable_replace "$pending" "$pending_marker"
}

validate_pending_marker() {
  single_server_assert_private_attestation_file "$pending_marker" "Cutover-Recovery-Marker"
  SOURCE_REVISION="$SOURCE_REVISION" node -e '
    const fs = require("node:fs");
    const source = fs.readFileSync(process.argv[1], "utf8");
    const lines = source.split("\n");
    if (lines.at(-1) !== "") process.exit(1);
    lines.pop();
    const expectedKeys = [
      "schemaVersion", "transitionKind", "currentMode", "desiredMode",
      "sourceRevision", "environmentSha256", "createdAt"
    ];
    if (lines.length !== expectedKeys.length) process.exit(1);
    const values = new Map();
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const separator = lines[index].indexOf("=");
      if (separator <= 0 || lines[index].slice(0, separator) !== expectedKeys[index]) process.exit(1);
      values.set(expectedKeys[index], lines[index].slice(separator + 1));
    }
    const kind = values.get("transitionKind");
    const currentMode = values.get("currentMode");
    const desiredMode = values.get("desiredMode");
    const semantics = (
      ((kind === "open" || kind === "reopen-code") && currentMode === "closed" && desiredMode === "open")
      || (kind === "closed" && currentMode === "open" && desiredMode === "closed")
    );
    if (
      values.get("schemaVersion") !== "1"
      || !semantics
      || values.get("sourceRevision") !== process.env.SOURCE_REVISION
      || !/^[a-f0-9]{64}$/u.test(values.get("environmentSha256") || "")
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(values.get("createdAt") || "")
    ) process.exit(1);
    process.stdout.write([kind, currentMode, desiredMode].join("\t"));
  ' "$pending_marker" \
    || single_server_die "Cutover-Recovery-Marker ist nicht exakt an eine gueltige Transition und die aktuelle Revision gebunden."
}

validate_open_gate() {
  local gate_values identity_rows readback_container_name revalidated_gate_values
  [[ "$gate_file" == "$CONFIG_DIR/cutover-open-gates.conf" \
     && -f "$gate_file" && ! -L "$gate_file" \
     && "$(realpath -e -- "$gate_file")" == "$gate_file" \
     && "$(stat -c '%u:%g' "$gate_file")" == "0:0" \
     && "$(stat -c '%a' "$gate_file")" == "600" ]] \
    || single_server_die "Open-Gate-Datei muss der kanonische root:root/0600-Pfad cutover-open-gates.conf im CONFIG_DIR sein."
  for evidence_file in \
    "$CONFIG_DIR/initial-open-source-writer.attestation" \
    "$CONFIG_DIR/initial-open-source-writer.attestation.sig" \
    "$CONFIG_DIR/initial-open-source-writer.public.pem" \
    "$CONFIG_DIR/cutover-bucket-inventory.conf" \
    "$CONFIG_DIR/cutover-dns-readback.conf"; do
    single_server_assert_private_attestation_file "$evidence_file" "Initial-Open-Evidenz"
  done
  gate_values="$(node "$SCRIPT_DIR/validate-cutover-open-gates.mjs" evidence \
    "$gate_file" "$MIGRATION_DIR" "$STATE_DIR" "$APP_HOST" "$SOURCE_REVISION" \
    "$INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256")" \
    || single_server_die "Lokale Open-Gates sind nicht vollstaendig und konsistent."
  IFS=$'\t' read -r gate_file_sha256 gate_package_sha256 gate_snapshot_id \
    gate_identity_sha256 gate_bucket_sha256 gate_dns_sha256 <<<"$gate_values"
  for gate_value in "$gate_file_sha256" "$gate_package_sha256" "$gate_snapshot_id" \
    "$gate_identity_sha256" "$gate_bucket_sha256" "$gate_dns_sha256"; do
    [[ "$gate_value" =~ ^[a-f0-9]{64}$ ]] || single_server_die "Open-Gate-Ausgabe ist ungueltig."
  done

  export MIGRATION_PACKAGE_SHA256="$gate_package_sha256"
  export MIGRATION_CONFIRMATION="IMPORT versorgungs_kompass PACKAGE $gate_package_sha256"
  export MIGRATION_MODE=readback
  readback_container_name="versorgungs-kompass-import-open-gate-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  single_server_compose run --name "$readback_container_name" --rm --no-deps database-import \
    || single_server_die "Open-Gate-Datenbank-Readback bestaetigt den vollstaendigen Import nicht."

  identity_rows="$(single_server_compose exec -T postgres sh -ec '
    PGPASSWORD="$(cat /run/secrets/db-owner-password)" exec psql --no-psqlrc --quiet --tuples-only --no-align \
      --field-separator="$(printf "\t")" --set=ON_ERROR_STOP=1 -U vk_owner -d versorgungs_kompass \
      --command="select lower(p.email), p.role, coalesce(b.issuer, ''), coalesce(b.subject, ''), coalesce(b.access_scope, ''), coalesce(b.scope_ref, '') from public.profiles p left join public.identity_bindings b on b.profile_id = p.id and b.active = true where p.active = true order by lower(p.email), b.issuer, b.subject"
  ')" || single_server_die "Open-Gate konnte aktive Profile und Identity-Bindungen nicht lesen."
  node "$SCRIPT_DIR/validate-cutover-open-gates.mjs" identity \
    "$gate_identity_sha256" "$CONFIG_DIR/allowed-emails" <<<"$identity_rows" \
    || single_server_die "Open-Gate verlangt fuer jede Allowlist-Adresse genau eine aktive Google-Bindung."
  revalidated_gate_values="$(node "$SCRIPT_DIR/validate-cutover-open-gates.mjs" evidence \
    "$gate_file" "$MIGRATION_DIR" "$STATE_DIR" "$APP_HOST" "$SOURCE_REVISION" \
    "$INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256")" \
    || single_server_die "Open-Gate ist nach Datenbank- und Identity-Readback nicht mehr frisch oder konsistent."
  [[ "$revalidated_gate_values" == "$gate_values" ]] \
    || single_server_die "Open-Gate-Evidenz driftete waehrend des finalen Ziel-Readbacks."
}

validate_code_reopen_gate() {
  local gate_values identity_rows persistence_contract_sha256 revalidated_gate_values
  [[ "$gate_file" == "$CONFIG_DIR/code-reopen-gates.conf" \
     && -f "$gate_file" && ! -L "$gate_file" \
     && "$(realpath -e -- "$gate_file")" == "$gate_file" \
     && "$(stat -c '%u:%g' "$gate_file")" == "0:0" \
     && "$(stat -c '%a' "$gate_file")" == "600" ]] \
    || single_server_die "Code-Reopen-Gate muss der kanonische root:root/0600-Pfad code-reopen-gates.conf im CONFIG_DIR sein."
  single_server_assert_initial_cutover_attestation
  single_server_assert_private_attestation_file "$closed_attestation" "Closed-Attestation"
  single_server_assert_private_attestation_file "$closed_deployment_attestation" "Closed-Deployment-Attestation"
  persistence_contract_sha256="$(node "$SCRIPT_DIR/hash-persistence-contract.mjs")" \
    || single_server_die "Aktueller Persistenzvertrag konnte nicht gehasht werden."
  [[ "$persistence_contract_sha256" =~ ^[a-f0-9]{64}$ ]] \
    || single_server_die "Persistenzvertrag-Hash ist ungueltig."
  gate_values="$(node "$SCRIPT_DIR/validate-code-reopen-gates.mjs" \
    "$gate_file" "$initial_attestation" "$closed_attestation" "$closed_deployment_attestation" "$STATE_DIR" \
    "$APP_HOST" "$SOURCE_REVISION" "$persistence_contract_sha256")" \
    || single_server_die "Lokale Code-Reopen-Gates sind nicht vollstaendig und konsistent."
  IFS=$'\t' read -r gate_file_sha256 initial_attestation_sha256 gate_snapshot_id \
    gate_identity_sha256 <<<"$gate_values"
  for gate_value in "$gate_file_sha256" "$initial_attestation_sha256" \
    "$gate_snapshot_id" "$gate_identity_sha256"; do
    [[ "$gate_value" =~ ^[a-f0-9]{64}$ ]] || single_server_die "Code-Reopen-Gate-Ausgabe ist ungueltig."
  done

  identity_rows="$(single_server_compose exec -T postgres sh -ec '
    PGPASSWORD="$(cat /run/secrets/db-owner-password)" exec psql --no-psqlrc --quiet --tuples-only --no-align \
      --field-separator="$(printf "\t")" --set=ON_ERROR_STOP=1 -U vk_owner -d versorgungs_kompass \
      --command="select lower(p.email), p.role, coalesce(b.issuer, ''), coalesce(b.subject, ''), coalesce(b.access_scope, ''), coalesce(b.scope_ref, '') from public.profiles p left join public.identity_bindings b on b.profile_id = p.id and b.active = true where p.active = true order by lower(p.email), b.issuer, b.subject"
  ')" || single_server_die "Code-Reopen konnte aktive Profile und Identity-Bindungen nicht lesen."
  node "$SCRIPT_DIR/validate-cutover-open-gates.mjs" identity \
    "$gate_identity_sha256" "$CONFIG_DIR/allowed-emails" <<<"$identity_rows" \
    || single_server_die "Code-Reopen verlangt fuer jede Allowlist-Adresse genau eine aktive Google-Bindung."
  revalidated_gate_values="$(node "$SCRIPT_DIR/validate-code-reopen-gates.mjs" \
    "$gate_file" "$initial_attestation" "$closed_attestation" "$closed_deployment_attestation" "$STATE_DIR" \
    "$APP_HOST" "$SOURCE_REVISION" "$persistence_contract_sha256")" \
    || single_server_die "Code-Reopen-Gate ist nach dem finalen Identity-Readback nicht mehr frisch oder konsistent."
  [[ "$revalidated_gate_values" == "$gate_values" ]] \
    || single_server_die "Code-Reopen-Gate-Evidenz driftete waehrend des finalen Ziel-Readbacks."
}

prepare_initial_attestation() {
  [[ ! -e "$initial_attestation" && ! -L "$initial_attestation" \
     && ! -e "$initial_attestation_candidate" && ! -L "$initial_attestation_candidate" ]] \
    || single_server_die "Initiale Cutover-Attestation oder Kandidat existiert bereits; ein erneuter Voll-Cutover ist gesperrt."
  initial_attestation_temporary="$STATE_DIR/.initial-cutover-attestation.candidate.pending.$$"
  [[ ! -e "$initial_attestation_temporary" && ! -L "$initial_attestation_temporary" ]] \
    || single_server_die "Temporaerer initialer Cutover-Kandidat existiert bereits."
  printf 'schemaVersion=1\nappHost=%s\ninitialRevision=%s\ngateSha256=%s\nmigrationPackageSha256=%s\nbackupSnapshotId=%s\npreparedAt=%s\n' \
    "$APP_HOST" "$SOURCE_REVISION" "$gate_file_sha256" "$gate_package_sha256" "$gate_snapshot_id" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$initial_attestation_temporary"
  chmod 0600 -- "$initial_attestation_temporary"
  chown 0:0 -- "$initial_attestation_temporary"
  single_server_promote_durable_file "$initial_attestation_temporary" "$initial_attestation_candidate"
  initial_attestation_temporary=""
  initial_attestation_sha256="$(sha256sum "$initial_attestation_candidate" | awk '{print $1}')"
  [[ "$initial_attestation_sha256" =~ ^[a-f0-9]{64}$ ]] \
    || single_server_die "Initiale Cutover-Attestation besitzt keinen gueltigen Hash."
}

write_open_attestation() {
  local authorization_kind="$1" authorization_gate_sha256="$2" snapshot_id="$3" initial_sha256="$4" pending
  pending="$STATE_DIR/.cutover-open-attestation.pending.$$"
  [[ ! -e "$pending" && ! -L "$pending" ]] || single_server_die "Temporaere Open-Attestation existiert bereits."
  [[ "$authorization_kind" =~ ^(initial-cutover|code-reopen)$ \
     && "$authorization_gate_sha256" =~ ^[a-f0-9]{64}$ \
     && "$snapshot_id" =~ ^[a-f0-9]{64}$ \
     && "$initial_sha256" =~ ^[a-f0-9]{64}$ ]] \
    || single_server_die "Open-Attestation benoetigt exakt gebundene Autorisierungswerte."
  printf 'schemaVersion=2\nmode=open\nappHost=%s\nauthorizedRevision=%s\nauthorizationKind=%s\ninitialCutoverSha256=%s\nauthorizationGateSha256=%s\nbackupSnapshotId=%s\nauthorizedAt=%s\n' \
    "$APP_HOST" "$SOURCE_REVISION" "$authorization_kind" "$initial_sha256" \
    "$authorization_gate_sha256" "$snapshot_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending"
  chmod 0600 -- "$pending"
  chown 0:0 -- "$pending"
  durable_replace "$pending" "$open_attestation"
}

write_closed_attestation_for_initial_sha() {
  local initial_sha256="$1" pending persistence_contract_sha256
  persistence_contract_sha256="$(node "$SCRIPT_DIR/hash-persistence-contract.mjs")" \
    || single_server_die "Persistenzvertrag konnte vor dem Schliessen nicht gehasht werden."
  [[ "$initial_sha256" =~ ^[a-f0-9]{64}$ && "$persistence_contract_sha256" =~ ^[a-f0-9]{64}$ ]] \
    || single_server_die "Close-Attestierung besitzt ungueltige Hashwerte."
  pending="$STATE_DIR/.cutover-closed-attestation.pending.$$"
  [[ ! -L "$closed_attestation" && ! -e "$pending" && ! -L "$pending" ]] \
    || single_server_die "Closed-Attestation oder ihr temporaeres Ziel ist ein Symlink beziehungsweise bereits offen."
  printf 'schemaVersion=1\nmode=closed\nappHost=%s\nclosedFromRevision=%s\ninitialCutoverSha256=%s\npersistenceContractSha256=%s\nclosedAt=%s\n' \
    "$APP_HOST" "$SOURCE_REVISION" "$initial_sha256" "$persistence_contract_sha256" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending"
  chmod 0600 -- "$pending"
  chown 0:0 -- "$pending"
  durable_replace "$pending" "$closed_attestation"
}

write_closed_attestation() {
  local initial_sha256
  single_server_assert_initial_cutover_attestation
  single_server_assert_open_attestation
  initial_sha256="$(sha256sum "$initial_attestation" | awk '{print $1}')"
  write_closed_attestation_for_initial_sha "$initial_sha256"
}

single_server_acquire_maintenance_lock "cutover-mode-$action"
cleanup_exit() {
  local status="$?"
  if [[ "$status" -ne 0 && -f "$pending_marker" && ! -L "$pending_marker" ]]; then
    stop_api_and_assert_stopped || true
  fi
  if [[ -n "$temporary_file" && -f "$temporary_file" && ! -L "$temporary_file" ]]; then
    rm -f -- "$temporary_file" || true
  fi
  if [[ -n "$initial_attestation_temporary" \
     && -f "$initial_attestation_temporary" && ! -L "$initial_attestation_temporary" ]]; then
    durable_unlink "$initial_attestation_temporary" || true
  fi
  if [[ "$status" -ne 0 \
     && ! -e "$pending_marker" && ! -L "$pending_marker" \
     && -f "$initial_attestation_candidate" && ! -L "$initial_attestation_candidate" ]]; then
    durable_unlink "$initial_attestation_candidate" || true
  fi
  single_server_release_maintenance_lock || true
  return "$status"
}
handle_signal() {
  local signal_number="$1"
  trap - EXIT HUP INT TERM
  if [[ -f "$pending_marker" && ! -L "$pending_marker" ]]; then
    stop_api_and_assert_stopped || true
  fi
  cleanup_exit || true
  exit "$((128 + signal_number))"
}
trap cleanup_exit EXIT
trap 'handle_signal 1' HUP
trap 'handle_signal 2' INT
trap 'handle_signal 15' TERM

if [[ "$action" == "recover-closed" ]]; then
  [[ -f "$pending_marker" && ! -L "$pending_marker" ]] \
    || single_server_die "Kein regulaerer Cutover-Recovery-Marker vorhanden."
  pending_marker_values="$(validate_pending_marker)"
  IFS=$'\t' read -r recovery_transition_kind recovery_current_mode recovery_desired_mode \
    <<<"$pending_marker_values"
  if [[ "$recovery_transition_kind" == "open" ]]; then
    [[ ! -e "$initial_attestation" || ! -e "$initial_attestation_candidate" ]] \
      || single_server_die "Recovery verweigert: kanonische Initial-Attestation und Kandidat duerfen nicht gleichzeitig existieren."
    if [[ -e "$initial_attestation_candidate" || -L "$initial_attestation_candidate" ]]; then
      single_server_assert_private_attestation_file \
        "$initial_attestation_candidate" "Initialer Cutover-Kandidat"
    fi
  fi
  stop_api_and_assert_stopped \
    || single_server_die "Recovery verweigert: API konnte nicht nachweislich gestoppt werden; Hostzustand bleibt unveraendert und der Recovery-Marker erhalten."
  if [[ "$recovery_transition_kind" == "closed" \
     || -e "$initial_attestation" || -L "$initial_attestation" ]]; then
    single_server_assert_initial_cutover_attestation
    recovery_initial_sha256="$(sha256sum "$initial_attestation" | awk '{print $1}')"
    write_closed_attestation_for_initial_sha "$recovery_initial_sha256"
  fi
  rewrite_environment_mode closed \
    || single_server_die "Recovery konnte Environment nicht fail-closed auf closed setzen."
  durable_unlink "$open_attestation"
  if [[ ! -e "$initial_attestation" && ! -L "$initial_attestation" ]]; then
    durable_unlink "$closed_attestation"
    durable_unlink "$initial_attestation_candidate"
  fi
  if ! restart_api_in_mode closed; then
    if stop_api_and_assert_stopped; then
      single_server_die "Recovery konnte closed nicht bestaetigen; API wurde nachweislich gestoppt und der Recovery-Marker bleibt erhalten."
    fi
    single_server_die "KRITISCH: Recovery konnte closed nicht bestaetigen und den API-Container danach nicht nachweislich stoppen; sofortigen manuellen Container-Stopp pruefen."
  fi
  durable_unlink "$pending_marker"
  single_server_release_maintenance_lock
  trap - EXIT HUP INT TERM
  printf 'Cutover-Recovery erfolgreich: Environment und laufende API sind closed.\n'
  exit 0
fi

single_server_assert_no_maintenance_recovery_markers
[[ ! -e "$initial_attestation_candidate" && ! -L "$initial_attestation_candidate" ]] \
  || single_server_die "Verwaister initialer Cutover-Kandidat blockiert den Betriebsschritt; Zustand manuell pruefen."
single_server_assert_running_api_revision
single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"
current_mode="$API_CUTOVER_MODE"
desired_mode="$action"
[[ "$action" != "reopen-code" ]] || desired_mode=open
case "$action" in
  open)
    [[ "$current_mode" == "closed" ]] \
      || single_server_die "Initiale Open-Promotion ist nur aus dem bestaetigten Modus closed zulaessig."
    [[ ! -e "$initial_attestation" && ! -L "$initial_attestation" \
       && ! -e "$closed_attestation" && ! -L "$closed_attestation" \
       && ! -e "$open_attestation" && ! -L "$open_attestation" ]] \
      || single_server_die "Initiale Attestation oder frueherer Close-Zustand existiert bereits; Voll-Cutover darf nicht wiederholt werden."
    validate_open_gate
    expected_confirmation="SET API CUTOVER MODE open FOR $SOURCE_REVISION WITH GATE $gate_file_sha256"
    ;;
  reopen-code)
    [[ "$current_mode" == "closed" ]] \
      || single_server_die "Code-Reopen ist nur aus dem bestaetigten Modus closed zulaessig."
    [[ ! -e "$open_attestation" && ! -L "$open_attestation" ]] \
      || single_server_die "Code-Reopen erwartet im Closed-Zustand keine aktuelle Open-Attestation."
    validate_code_reopen_gate
    expected_confirmation="REOPEN API AFTER CODE UPDATE FOR $SOURCE_REVISION WITH GATE $gate_file_sha256"
    ;;
  closed)
    expected_confirmation="SET API CUTOVER MODE closed FOR $SOURCE_REVISION"
    ;;
esac

if [[ -z "$confirmation" ]]; then
  printf 'Read-only Vorschau: Aktion %s wechselt API_CUTOVER_MODE von %s auf %s. Exakte Bestaetigung:\n%s\n' \
    "$action" "$current_mode" "$desired_mode" "$expected_confirmation"
  exit 2
fi
[[ "$confirmation" == "$expected_confirmation" ]] \
  || single_server_die "Bestaetigung passt nicht exakt zu Modus und ausgecheckter Revision."

if [[ "$current_mode" == "$desired_mode" ]]; then
  single_server_release_maintenance_lock
  trap - EXIT HUP INT TERM
  printf 'API-Cutover-Modus ist bereits %s und wurde am laufenden Prozess bestaetigt.\n' "$desired_mode"
  exit 0
fi

write_pending_marker "$current_mode" "$desired_mode"
stop_api_and_assert_stopped \
  || single_server_die "API konnte vor dem Moduswechsel nicht fail-closed gestoppt werden; Recovery-Marker bleibt erhalten."
[[ "$action" != "closed" ]] || write_closed_attestation
if [[ "$action" == "open" ]]; then
  prepare_initial_attestation
  write_closed_attestation_for_initial_sha "$initial_attestation_sha256"
  write_open_attestation initial-cutover "$gate_file_sha256" "$gate_snapshot_id" "$initial_attestation_sha256"
elif [[ "$action" == "reopen-code" ]]; then
  write_open_attestation code-reopen "$gate_file_sha256" "$gate_snapshot_id" "$initial_attestation_sha256"
fi
rewrite_environment_mode "$desired_mode" \
  || single_server_die "Environment-Promotion fehlgeschlagen; API bleibt nachweislich gestoppt und der Recovery-Marker erhalten."
[[ "$desired_mode" != "closed" ]] || durable_unlink "$open_attestation"
if ! restart_api_in_mode "$desired_mode"; then
  if stop_api_and_assert_stopped; then
    single_server_die "Zielmodus konnte nicht bestaetigt werden; API wurde nachweislich gestoppt, der Recovery-Marker bleibt erhalten und recover-closed ist erforderlich."
  fi
  single_server_die "KRITISCH: Zielmodus konnte nicht bestaetigt und der API-Container danach nicht nachweislich gestoppt werden; sofortigen manuellen Container-Stopp pruefen."
fi
if [[ "$action" == "open" ]]; then
  single_server_promote_durable_file "$initial_attestation_candidate" "$initial_attestation"
  single_server_assert_initial_cutover_attestation
  single_server_assert_open_attestation
elif [[ "$action" == "reopen-code" ]]; then
  single_server_assert_open_attestation
fi
[[ "$desired_mode" != "open" ]] || durable_unlink "$closed_attestation"
[[ "$desired_mode" != "open" ]] || durable_unlink "$gate_file"
durable_unlink "$pending_marker"
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf 'API-Cutover-Aktion %s wurde fuer Revision %s kontrolliert auf Modus %s abgeschlossen.\n' \
  "$action" "$SOURCE_REVISION" "$desired_mode"
