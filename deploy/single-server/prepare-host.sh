#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

single_server_load_environment "${1:-}"
[[ "$(uname -s)" == "Linux" ]] || single_server_die "Host-Vorbereitung ist nur fuer Linux vorgesehen."
[[ "$(id -u)" -eq 0 ]] || single_server_die "Host-Vorbereitung muss einmalig als root laufen."
single_server_require_command install
single_server_require_command mktemp
single_server_require_command mv
single_server_require_command openssl
single_server_require_command realpath
single_server_require_command sync
single_server_require_command tr

assert_existing_safe_parent() {
  local target="$1" expected_uid="$2" actual_mode
  [[ -d "$target" && ! -L "$target" ]] \
    || single_server_die "Erwartetes Host-Elternverzeichnis fehlt oder ist ein Symlink: $target"
  [[ "$(realpath -e -- "$target")" == "$target" ]] \
    || single_server_die "Host-Elternverzeichnis ist nicht kanonisch: $target"
  [[ "$(stat -c '%u' "$target")" == "$expected_uid" ]] \
    || single_server_die "Host-Elternverzeichnis besitzt einen unerwarteten Eigentuemer: $target"
  actual_mode="$(stat -c '%a' "$target")"
  (( (8#$actual_mode & 0022) == 0 )) \
    || single_server_die "Host-Elternverzeichnis darf nicht gruppen- oder fremdbeschreibbar sein: $target"
}

install_safe_directory() {
  local target="$1" parent="$2" mode="$3" owner="$4" group="$5"
  assert_existing_safe_parent "$parent" 0
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -d "$target" && ! -L "$target" ]] \
      || single_server_die "Betriebsziel existiert als Symlink oder Nicht-Verzeichnis: $target"
    [[ "$(realpath -e -- "$target")" == "$target" ]] \
      || single_server_die "Betriebsziel ist nicht kanonisch: $target"
  else
    install -d -m "$mode" -o "$owner" -g "$group" -- "$target"
  fi
  [[ -d "$target" && ! -L "$target" && "$(realpath -e -- "$target")" == "$target" ]] \
    || single_server_die "Betriebsziel konnte nicht sicher angelegt werden: $target"
  chmod "$mode" -- "$target"
  chown "$owner:$group" -- "$target"
}

assert_existing_safe_parent "/etc/versorgungs-kompass" 0
assert_existing_safe_parent "/var/lib" 0
install_safe_directory "$CONFIG_DIR" "/etc/versorgungs-kompass" 0700 0 0
install_safe_directory "$STATE_DIR" "/var/lib" 0700 0 0
install_safe_directory "$STATE_DIR/api-control" "$STATE_DIR" 0750 0 70
install_safe_directory "$STATE_DIR/caddy-data" "$STATE_DIR" 0700 1000 1000
install_safe_directory "$STATE_DIR/caddy-config" "$STATE_DIR" 0700 1000 1000
install_safe_directory "$STATE_DIR/object-storage" "$STATE_DIR" 0700 70 70
install_safe_directory "$STATE_DIR/backup-staging" "$STATE_DIR" 0700 70 70
install_safe_directory "$STATE_DIR/postgres-data" "$STATE_DIR" 0700 70 70
install_safe_directory "$STATE_DIR/postgres-socket" "$STATE_DIR" 0700 70 70

writer_fence_contract="$STATE_DIR/api-control/.writer-fence-ready"
[[ ! -L "$writer_fence_contract" && ( ! -e "$writer_fence_contract" || -f "$writer_fence_contract" ) ]] \
  || single_server_die "Writer-Fence-Sentinel darf kein Symlink oder Nicht-Dateiziel sein."
writer_fence_pending="$(mktemp "$STATE_DIR/api-control/.writer-fence-ready.pending.XXXXXX")"
printf 'schemaVersion=1\n' >"$writer_fence_pending"
chmod 0440 -- "$writer_fence_pending"
chown 0:70 -- "$writer_fence_pending"
sync -f "$writer_fence_pending"
mv -f -- "$writer_fence_pending" "$writer_fence_contract"
sync -f "$STATE_DIR/api-control"

create_hex_secret() {
  local target="$1" owner="$2"
  [[ ! -L "$target" ]] || single_server_die "Secret-Ziel darf kein Symlink sein: $target"
  [[ ! -e "$target" || -f "$target" ]] || single_server_die "Secret-Ziel ist keine regulaere Datei: $target"
  if [[ ! -e "$target" ]]; then
    openssl rand -hex 32 | tr -d '\r\n' >"$target"
    chmod 0600 "$target"
    chown "$owner:$owner" "$target"
  fi
}

create_cookie_secret() {
  local target="$1" owner="$2"
  [[ ! -L "$target" ]] || single_server_die "Secret-Ziel darf kein Symlink sein: $target"
  [[ ! -e "$target" || -f "$target" ]] || single_server_die "Secret-Ziel ist keine regulaere Datei: $target"
  if [[ ! -e "$target" ]]; then
    openssl rand -base64 32 | tr -d '\r\n' >"$target"
    chmod 0600 "$target"
    chown "$owner:$owner" "$target"
  fi
}

create_hex_secret "$CONFIG_DIR/db-owner-password" 70
create_hex_secret "$CONFIG_DIR/db-app-password" 70
create_hex_secret "$CONFIG_DIR/restic-password" 70
create_hex_secret "$CONFIG_DIR/identity-bootstrap-hmac" 70
create_cookie_secret "$CONFIG_DIR/oauth2-cookie-secret" 65532

printf '%s\n' "Host-Verzeichnisse und lokale Zufalls-Secrets sind vorbereitet."
printf '%s\n' "Manuell, owner-only (0600) und mit der genannten numerischen UID bereitzustellen:"
for required_spec in \
  "initial-open-source-writer.public.pem:0" \
  "google-oauth-client-secret:65532" \
  "allowed-emails:65532" \
  "restic-repository:70" \
  "restic-aws-credentials:70"; do
  required="${required_spec%%:*}"
  required_owner="${required_spec##*:}"
  [[ ! -L "$CONFIG_DIR/$required" ]] \
    || single_server_die "Manuelles Secret-Ziel darf kein Symlink sein: $CONFIG_DIR/$required"
  [[ ! -e "$CONFIG_DIR/$required" || -f "$CONFIG_DIR/$required" ]] \
    || single_server_die "Manuelles Secret-Ziel ist keine regulaere Datei: $CONFIG_DIR/$required"
  if [[ ! -f "$CONFIG_DIR/$required" ]]; then
    printf '  - %s (UID/GID %s:%s)\n' "$CONFIG_DIR/$required" "$required_owner" "$required_owner"
  fi
done
