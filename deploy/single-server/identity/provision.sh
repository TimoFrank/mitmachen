#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SINGLE_SERVER_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=../common.sh
source "$SINGLE_SERVER_DIR/common.sh"

single_server_load_environment "${1:-}"
requested_action="${2:-PREVIEW}"
[[ "$#" -le 2 && "$requested_action" =~ ^(PREVIEW|APPLY)$ ]] \
  || single_server_die "Aufruf: provision.sh /etc/versorgungs-kompass/single-server.env [APPLY]"
[[ "$(uname -s)" == "Linux" ]] || single_server_die "Identity-Provisionierung ist nur auf dem Linux-Zielhost zulaessig."
[[ "$(id -u)" -eq 0 ]] || single_server_die "Identity-Provisionierung benoetigt root fuer die geschuetzte Betriebssteuerung."
single_server_require_command docker
single_server_require_command openssl
single_server_require_command realpath
single_server_require_command stat
single_server_require_command tr
single_server_require_command unlink

IDENTITY_PROVISION_FILE="$CONFIG_DIR/identity-provision.json"
IDENTITY_APPROVAL_SECRET_HOST_FILE="$CONFIG_DIR/identity-approval-secret"
IDENTITY_APPROVAL_TOKEN_HOST_FILE="$CONFIG_DIR/identity-approval-token"
[[ -f "$IDENTITY_PROVISION_FILE" && ! -L "$IDENTITY_PROVISION_FILE" ]] \
  || single_server_die "Geschuetzte Identity-Eingabedatei fehlt oder ist ein Symlink."
[[ "$(realpath -e -- "$IDENTITY_PROVISION_FILE")" == "$IDENTITY_PROVISION_FILE" ]] \
  || single_server_die "Identity-Eingabedatei oder eine Pfadkomponente ist nicht kanonisch."
[[ "$(stat -c '%u:%g' "$IDENTITY_PROVISION_FILE")" == "70:70" ]] \
  || single_server_die "Identity-Eingabedatei muss UID/GID 70:70 gehoeren."
[[ "$(stat -c '%a' "$IDENTITY_PROVISION_FILE")" == "600" ]] \
  || single_server_die "Identity-Eingabedatei muss Modus 0600 besitzen."
input_bytes="$(stat -c '%s' "$IDENTITY_PROVISION_FILE")"
(( input_bytes >= 2 && input_bytes <= 65536 )) \
  || single_server_die "Identity-Eingabedatei besitzt eine unzulaessige Groesse."

postgres_container="$(single_server_compose ps -q postgres)"
[[ -n "$postgres_container" ]] || single_server_die "Postgres-Container laeuft nicht."
[[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres_container")" == "healthy" ]] \
  || single_server_die "Postgres-Container ist nicht healthy."

export IDENTITY_PROVISION_FILE IDENTITY_APPROVAL_SECRET_HOST_FILE IDENTITY_APPROVAL_TOKEN_HOST_FILE
if [[ "$requested_action" == "PREVIEW" ]]; then
  for pending_file in "$IDENTITY_APPROVAL_SECRET_HOST_FILE" "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"; do
    [[ ! -e "$pending_file" && ! -L "$pending_file" ]] \
      || single_server_die "Eine alte Identity-Bestaetigung liegt noch vor; vor einem neuen Preview gezielt bereinigen: $pending_file"
  done
  openssl rand -hex 32 | tr -d '\r\n' >"$IDENTITY_APPROVAL_SECRET_HOST_FILE"
  : >"$IDENTITY_APPROVAL_TOKEN_HOST_FILE"
  chown 70:70 "$IDENTITY_APPROVAL_SECRET_HOST_FILE" "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"
  chmod 0600 "$IDENTITY_APPROVAL_SECRET_HOST_FILE" "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"
  export IDENTITY_PROVISION_MODE=preview
  if ! preview_output="$(single_server_compose run --rm --no-deps -T identity-provision)"; then
    unlink "$IDENTITY_APPROVAL_SECRET_HOST_FILE" 2>/dev/null || true
    unlink "$IDENTITY_APPROVAL_TOKEN_HOST_FILE" 2>/dev/null || true
    single_server_die "Read-only Identity-Preview ist fehlgeschlagen."
  fi
  preview_output="$(printf '%s\n' "$preview_output" | "$SCRIPT_DIR/validate-preview-output.sh")" \
    || single_server_die "Identity-Preview lieferte nicht exakt die vier erlaubten Ausgabezeilen."
  [[ "$(stat -c '%u:%g' "$IDENTITY_APPROVAL_TOKEN_HOST_FILE")" == "70:70" \
      && "$(stat -c '%a' "$IDENTITY_APPROVAL_TOKEN_HOST_FILE")" == "600" ]] \
    || single_server_die "Identity-Bestaetigungsdatei besitzt unerwartete Metadaten."
  approval_token="$(<"$IDENTITY_APPROVAL_TOKEN_HOST_FILE")"
  [[ "$approval_token" =~ ^approve-v1\.[1-9][0-9]{9}\.[a-f0-9]{64}$ ]] \
    || single_server_die "Identity-Preview hat keine gueltige geschuetzte Bestaetigung hinterlegt."
  printf '%s\n' "$preview_output"
  printf '%s\n' "Read-only Preview erfolgreich. Innerhalb von 15 Minuten mit dem literalen zweiten Argument APPLY fortfahren; der zustandsgebundene Token bleibt owner-only und erscheint weder in argv noch im Log."
  exit 2
fi

for approval_file in "$IDENTITY_APPROVAL_SECRET_HOST_FILE" "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"; do
  [[ -f "$approval_file" && ! -L "$approval_file" ]] \
    || single_server_die "Geschuetzte Identity-Bestaetigung fehlt; zuerst PREVIEW ausfuehren."
  [[ "$(realpath -e -- "$approval_file")" == "$approval_file" \
      && "$(stat -c '%u:%g' "$approval_file")" == "70:70" \
      && "$(stat -c '%a' "$approval_file")" == "600" ]] \
    || single_server_die "Geschuetzte Identity-Bestaetigung besitzt unerwartete Pfad- oder Dateimetadaten."
done
single_server_acquire_maintenance_lock identity-provision
trap 'single_server_release_maintenance_lock || true' EXIT
single_server_install_terminating_signal_traps
single_server_assert_no_maintenance_recovery_markers
export IDENTITY_PROVISION_MODE=apply
single_server_compose run --rm --no-deps -T identity-provision
unlink "$IDENTITY_PROVISION_FILE"
unlink "$IDENTITY_APPROVAL_SECRET_HOST_FILE"
unlink "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"
for removed_file in "$IDENTITY_PROVISION_FILE" "$IDENTITY_APPROVAL_SECRET_HOST_FILE" "$IDENTITY_APPROVAL_TOKEN_HOST_FILE"; do
  [[ ! -e "$removed_file" && ! -L "$removed_file" ]] \
    || single_server_die "Temporaere Identity-Datei konnte nicht vollstaendig entfernt werden: $removed_file"
done
single_server_release_maintenance_lock
trap - EXIT HUP INT TERM
printf '%s\n' "Identity-Provisionierung und Readback erfolgreich; Eingabe und kurzlebige Bestaetigung wurden entfernt."
