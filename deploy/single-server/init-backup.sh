#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"
single_server_load_environment "${1:-}"

expected="INIT_VERSORGUNGS_KOMPASS_BACKUP"
[[ "${CONFIRM_BACKUP_REPOSITORY_INIT:-}" == "$expected" ]] \
  || single_server_die "Backup-Initialisierung benoetigt CONFIRM_BACKUP_REPOSITORY_INIT=$expected"

single_server_acquire_maintenance_lock backup-repository-init
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers

if single_server_compose run --rm --no-deps --entrypoint /usr/bin/restic restic-backup cat config >/dev/null 2>&1; then
  single_server_die "Backup-Repository existiert bereits; Initialisierung wird verweigert."
fi
single_server_compose run --rm --no-deps --entrypoint /usr/bin/restic restic-backup init
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
