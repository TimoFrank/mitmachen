#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
[[ "$#" -eq 1 ]] || single_server_die "Aufruf: cutover-identity-audit.sh /etc/versorgungs-kompass/single-server.env"
single_server_load_environment "$1"
[[ "$(uname -s)" == "Linux" && "$(id -u)" -eq 0 ]] \
  || single_server_die "Der Identity-Cutover-Readback benoetigt root auf dem Linux-Zielhost."
[[ "$API_CUTOVER_MODE" == "closed" ]] \
  || single_server_die "Der Identity-Cutover-Readback ist nur im Modus closed zulaessig."

single_server_acquire_maintenance_lock cutover-identity-audit
audit_cleanup() {
  local status="$?"
  single_server_release_maintenance_lock || true
  return "$status"
}
audit_signal() {
  local signal_number="$1"
  trap - HUP INT TERM
  exit "$((128 + signal_number))"
}
trap audit_cleanup EXIT
trap 'audit_signal 1' HUP
trap 'audit_signal 2' INT
trap 'audit_signal 15' TERM
single_server_assert_no_maintenance_recovery_markers
single_server_assert_running_api_revision
single_server_assert_api_cutover_mode closed

identity_rows="$(single_server_compose exec -T postgres sh -ec '
  PGPASSWORD="$(cat /run/secrets/db-owner-password)" exec psql --no-psqlrc --quiet --tuples-only --no-align \
    --field-separator="$(printf "\t")" --set=ON_ERROR_STOP=1 -U vk_owner -d versorgungs_kompass \
    --command="select lower(p.email), p.role, coalesce(b.issuer, ''), coalesce(b.subject, ''), coalesce(b.access_scope, ''), coalesce(b.scope_ref, '') from public.profiles p left join public.identity_bindings b on b.profile_id = p.id and b.active = true where p.active = true order by lower(p.email), b.issuer, b.subject"
')" || single_server_die "Aktive Profile und Identity-Bindungen konnten nicht read-only gelesen werden."
identity_sha256="$(node "$SCRIPT_DIR/validate-cutover-open-gates.mjs" identity-hash \
  "$CONFIG_DIR/allowed-emails" <<<"$identity_rows")" \
  || single_server_die "Identity-Readback passt nicht exakt zur Allowlist und Google-Bindung."

single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf 'identityAuditSha256=%s\n' "$identity_sha256"
