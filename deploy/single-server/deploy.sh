#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

env_file="${1:-}"
expected_cutover_mode="${2:-}"
[[ "$#" -eq 2 && "$expected_cutover_mode" == "closed" ]] \
  || single_server_die "Aufruf: deploy.sh /etc/versorgungs-kompass/single-server.env closed"
"$SCRIPT_DIR/preflight.sh" "$env_file"
single_server_load_environment "$env_file"
[[ "$API_CUTOVER_MODE" == "$expected_cutover_mode" ]] \
  || single_server_die "Explizit erwarteter und konfigurierter API-Cutover-Modus stimmen nicht ueberein."
single_server_require_command npm
single_server_require_command node
single_server_require_command curl

single_server_acquire_maintenance_lock deployment
deployment_complete=0
deployment_attestation_pending=""
deployment_cleanup() {
  local status="$?"
  if [[ "$deployment_complete" != "1" ]]; then
    single_server_compose stop --timeout 40 api >/dev/null 2>&1 || true
  fi
  if [[ -n "$deployment_attestation_pending" \
     && -f "$deployment_attestation_pending" && ! -L "$deployment_attestation_pending" ]]; then
    rm -f -- "$deployment_attestation_pending" || true
  fi
  single_server_release_maintenance_lock || true
  return "$status"
}
deployment_signal() {
  local signal_number="$1"
  trap - HUP INT TERM
  exit "$((128 + signal_number))"
}
trap deployment_cleanup EXIT
trap 'deployment_signal 1' HUP
trap 'deployment_signal 2' INT
trap 'deployment_signal 15' TERM
single_server_assert_no_maintenance_recovery_markers

npm --prefix "$PROJECT_ROOT" ci --ignore-scripts
API_BASE_URL="$APP_ORIGIN" TARGET_AUTH_MODE=oidc AUTH_GATEWAY=oauth2-proxy npm --prefix "$PROJECT_ROOT" run build:target
single_server_compose build --pull
single_server_compose up --detach --remove-orphans

if ! single_server_wait_for_permanent_services 24 2 5; then
  single_server_compose ps >&2 || true
  single_server_die "Nicht alle permanenten Dienste sind stabil running beziehungsweise healthy."
fi
single_server_assert_running_api_revision
single_server_assert_api_cutover_mode "$expected_cutover_mode"

single_server_compose ps
curl --fail --silent --show-error --max-time 20 \
  --noproxy "$APP_HOST" --resolve "$APP_HOST:443:127.0.0.1" \
  "$APP_ORIGIN/" >/dev/null
api_status="$(curl --silent --show-error --output /dev/null --max-time 20 --write-out '%{http_code}' \
  --noproxy "$APP_HOST" --resolve "$APP_HOST:443:127.0.0.1" \
  "$APP_ORIGIN/api/session")"
[[ "$api_status" == "401" ]] || single_server_die "Anonyme API-Anfrage wurde nicht mit 401 abgewiesen."
curl --fail --silent --show-error --max-time 20 "$APP_ORIGIN/" >/dev/null

deployment_attestation="$STATE_DIR/.closed-deployment-attestation"
deployment_attestation_pending="$STATE_DIR/.closed-deployment-attestation.pending.$$"
[[ ! -L "$deployment_attestation" \
   && ! -e "$deployment_attestation_pending" && ! -L "$deployment_attestation_pending" ]] \
  || single_server_die "Closed-Deployment-Attestation oder ihr temporaeres Ziel ist unsicher."
persistence_contract_sha256="$(node "$SCRIPT_DIR/hash-persistence-contract.mjs")" \
  || single_server_die "Persistenzvertrag konnte nach dem geschlossenen Deployment nicht gehasht werden."
[[ "$persistence_contract_sha256" =~ ^[a-f0-9]{64}$ ]] \
  || single_server_die "Persistenzvertrag-Hash des Deployments ist ungueltig."
(
  umask 077
  printf 'schemaVersion=1\nmode=closed\nappHost=%s\ndeployedRevision=%s\npersistenceContractSha256=%s\ndeployedAt=%s\n' \
    "$APP_HOST" "$SOURCE_REVISION" "$persistence_contract_sha256" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"$deployment_attestation_pending"
)
chmod 0600 -- "$deployment_attestation_pending"
if [[ "$(uname -s)" == "Linux" ]]; then
  chown 0:0 -- "$deployment_attestation_pending"
fi
single_server_promote_durable_file "$deployment_attestation_pending" "$deployment_attestation"
deployment_attestation_pending=""

deployment_complete=1
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM

printf 'Einzelserver wurde aus Commit %s lokal sowie ueber den kanonischen Origin %s geprueft.\n' \
  "$SOURCE_REVISION" "$APP_ORIGIN"
