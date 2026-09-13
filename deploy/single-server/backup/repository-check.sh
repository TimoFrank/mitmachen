#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"
single_server_acquire_maintenance_lock repository-check
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers
repository_operation_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
repository_container_name="versorgungs-kompass-backup-$repository_operation_id-restic-maintenance"
single_server_create_repository_recovery_marker "$repository_operation_id"

single_server_compose run --name "$repository_container_name" --rm --no-deps \
  -e RESTIC_RETENTION=0 \
  -e RESTIC_PRUNE=0 \
  -e RESTIC_CHECK=1 \
  -e RESTIC_UNLOCK=0 \
  restic-maintenance

repository_recovery_marker="$STATE_DIR/.backup-repository-recovery-required"
[[ -f "$repository_recovery_marker" && ! -L "$repository_recovery_marker" ]] \
  || single_server_die "Repository-Recovery-Marker fehlt nach dem Integritaetscheck."
single_server_unlink_durable_file "$repository_recovery_marker"

single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
