#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

action="${1:-}"
env_file="${2:-}"
[[ "$#" -eq 2 && "$action" =~ ^(start|stop)$ ]] \
  || single_server_die "Aufruf: service-control.sh start|stop /etc/versorgungs-kompass/single-server.env"
single_server_load_environment "$env_file"
single_server_acquire_maintenance_lock "service-$action"
service_action_complete=0
service_control_cleanup() {
  local status="$?"
  if [[ "$action" == "start" && "$service_action_complete" != "1" ]]; then
    single_server_compose stop --timeout 40 api >/dev/null 2>&1 || true
  fi
  single_server_release_maintenance_lock || true
  return "$status"
}
service_control_signal() {
  local signal_number="$1"
  trap - HUP INT TERM
  exit "$((128 + signal_number))"
}
trap service_control_cleanup EXIT
trap 'service_control_signal 1' HUP
trap 'service_control_signal 2' INT
trap 'service_control_signal 15' TERM

if [[ "$action" == "start" ]]; then
  single_server_assert_no_api_recovery_markers
  single_server_compose up --detach --no-build --remove-orphans --wait --wait-timeout 180
  single_server_assert_running_api_revision
  single_server_assert_api_cutover_mode "$API_CUTOVER_MODE"
else
  single_server_compose stop --timeout 60
fi

service_action_complete=1
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
