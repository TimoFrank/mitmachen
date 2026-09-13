#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "$#" -eq 2 ]] || {
  printf '%s\n' "FEHLER: Aufruf: verify-recovery-copy.sh /etc/versorgungs-kompass/single-server.env /absolut/frisch-abgerufen" >&2
  exit 1
}
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$BASH_SOURCE")" && pwd -P)"
SINGLE_SERVER_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SINGLE_SERVER_DIR/common.sh"

single_server_load_environment "$1"
retrieved_directory="$2"
[[ "$(uname -s)" == "Linux" ]] || single_server_die "Recovery-Copy-Pruefung ist nur auf dem Linux-Zielhost zulaessig."
[[ "$(id -u)" -eq 0 ]] || single_server_die "Recovery-Copy-Pruefung benoetigt root."
single_server_require_command cmp
single_server_require_command docker
single_server_require_command find
single_server_require_command node
single_server_require_command realpath
single_server_require_command rmdir
single_server_require_command stat
single_server_require_command unlink

single_server_assert_narrow_absolute_path RETRIEVED_RECOVERY_DIR "$retrieved_directory"
canonical_retrieved_directory="$(realpath -e -- "$retrieved_directory")" \
  || single_server_die "Abgerufener Recovery-Pfad kann nicht kanonisch aufgeloest werden."
[[ "$canonical_retrieved_directory" == "$retrieved_directory" ]] \
  || single_server_die "Abgerufener Recovery-Pfad muss kanonisch und symlinkfrei sein."
for forbidden_root in "$PROJECT_ROOT" "$CONFIG_DIR" "$STATE_DIR"; do
  [[ "$retrieved_directory" != "$forbidden_root" && "$retrieved_directory" != "$forbidden_root/"* && "$forbidden_root" != "$retrieved_directory/"* ]] \
    || single_server_die "Abgerufener Recovery-Pfad muss von Checkout, CONFIG_DIR und STATE_DIR getrennt sein."
done
[[ -d "$retrieved_directory" && ! -L "$retrieved_directory" ]] \
  || single_server_die "Abgerufener Recovery-Pfad ist kein regulaeres Verzeichnis."
[[ "$(stat -c '%u:%g' "$retrieved_directory")" == "0:0" && "$(stat -c '%a' "$retrieved_directory")" == "700" ]] \
  || single_server_die "Abgerufener Recovery-Pfad muss root:root und Modus 0700 besitzen."

expected_inventory="$(printf '%s\n' restic-aws-credentials restic-password restic-repository | sort)"
actual_inventory="$(find "$retrieved_directory" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)"
[[ "$actual_inventory" == "$expected_inventory" ]] \
  || single_server_die "Abgerufener Recovery-Pfad muss genau die drei Restic-Dateien enthalten."
for name in restic-repository restic-password restic-aws-credentials; do
  target="$retrieved_directory/$name"
  [[ -f "$target" && ! -L "$target" ]] || single_server_die "Abgerufene Recovery-Datei fehlt oder ist ein Symlink."
  [[ "$(stat -c '%u:%g' "$target")" == "70:70" && "$(stat -c '%a' "$target")" == "600" ]] \
    || single_server_die "Abgerufene Recovery-Datei muss UID/GID 70:70 und Modus 0600 besitzen."
  cmp -s "$target" "$CONFIG_DIR/$name" \
    || single_server_die "Abgerufene Recovery-Datei passt nicht bytegenau zum aktuellen Restic-Setup."
done

restic_image="restic/restic:0.18.1@sha256:39d9072fb5651c80d75c7a811612eb60b4c06b32ffe87c2e9f3c7222e1797e76"
docker run --rm \
  --read-only \
  --user 70:70 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:size=64m,mode=1777 \
  --env RESTIC_REPOSITORY_FILE=/run/recovery/restic-repository \
  --env RESTIC_PASSWORD_FILE=/run/recovery/restic-password \
  --env AWS_SHARED_CREDENTIALS_FILE=/run/recovery/restic-aws-credentials \
  --env RESTIC_CACHE_DIR=/tmp/restic-cache \
  --volume "$retrieved_directory/restic-repository:/run/recovery/restic-repository:ro" \
  --volume "$retrieved_directory/restic-password:/run/recovery/restic-password:ro" \
  --volume "$retrieved_directory/restic-aws-credentials:/run/recovery/restic-aws-credentials:ro" \
  --entrypoint /bin/sh \
  "$restic_image" \
  -ec 'restic cat config >/dev/null && restic snapshots --host versorgungs-kompass-single-server --tag versorgungs-kompass >/dev/null'

for name in restic-repository restic-password restic-aws-credentials; do
  unlink -- "$retrieved_directory/$name"
done
rmdir -- "$retrieved_directory"
[[ ! -e "$retrieved_directory" && ! -L "$retrieved_directory" ]] \
  || single_server_die "Geprueftes Recovery-Abrufverzeichnis konnte nicht vollstaendig entfernt werden."
node "$SCRIPT_DIR/recovery-escrow.mjs" record-after-tested-retrieval "$CONFIG_DIR"
printf '%s\n' "Frisch abgerufene Off-host-Kopie und Repository-Zugriff sind geprueft; das lokale Abrufverzeichnis wurde entfernt."
