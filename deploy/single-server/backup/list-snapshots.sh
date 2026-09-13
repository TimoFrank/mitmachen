#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
single_server_require_command node
single_server_acquire_maintenance_lock snapshot-inventory
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers
inventory_operation_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
inventory_container_name="versorgungs-kompass-backup-$inventory_operation_id-restic-maintenance"
single_server_create_repository_recovery_marker "$inventory_operation_id"

single_server_compose run --name "$inventory_container_name" --rm --no-deps --entrypoint /usr/bin/restic restic-maintenance \
  snapshots --json --host versorgungs-kompass-single-server --tag versorgungs-kompass \
  | node "$SCRIPT_DIR/backup/format-snapshot-inventory.mjs"

repository_recovery_marker="$STATE_DIR/.backup-repository-recovery-required"
[[ -f "$repository_recovery_marker" && ! -L "$repository_recovery_marker" ]] \
  || single_server_die "Repository-Recovery-Marker fehlt nach dem Snapshot-Inventar."
single_server_unlink_durable_file "$repository_recovery_marker"

single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
