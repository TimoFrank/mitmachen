#!/usr/bin/env bash
set -Eeuo pipefail

SINGLE_SERVER_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(CDPATH= cd -- "$SINGLE_SERVER_DIR/../.." && pwd -P)"

single_server_die() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

single_server_install_terminating_signal_traps() {
  trap 'trap - HUP INT TERM; exit 129' HUP
  trap 'trap - HUP INT TERM; exit 130' INT
  trap 'trap - HUP INT TERM; exit 143' TERM
}

single_server_promote_durable_file() {
  local pending="${1:-}" target="${2:-}"
  [[ -f "$pending" && ! -L "$pending" && ! -L "$target" ]] \
    || single_server_die "Durable Datei-Promotion benoetigt ein regulaeres Pending-File und ein symlinkfreies Ziel."
  if [[ "$(uname -s)" == "Linux" ]]; then
    single_server_require_command sync
    sync -f "$pending" || single_server_die "Pending-Datei konnte nicht auf den Datentraeger synchronisiert werden."
  fi
  mv -- "$pending" "$target"
  if [[ "$(uname -s)" == "Linux" ]]; then
    sync -f "$(dirname -- "$target")" \
      || single_server_die "Elternverzeichnis der promoted Datei konnte nicht synchronisiert werden."
  fi
}

single_server_unlink_durable_file() {
  local target="${1:-}"
  [[ -f "$target" && ! -L "$target" ]] \
    || single_server_die "Durable Entfernung benoetigt ein regulaeres symlinkfreies File."
  unlink -- "$target"
  if [[ "$(uname -s)" == "Linux" ]]; then
    single_server_require_command sync
    sync -f "$(dirname -- "$target")" \
      || single_server_die "Elternverzeichnis der entfernten Datei konnte nicht synchronisiert werden."
  fi
}

single_server_require_command() {
  command -v "$1" >/dev/null 2>&1 || single_server_die "Erforderliches Programm fehlt: $1"
}

single_server_assert_narrow_absolute_path() {
  local label="$1" value="$2"
  [[ "$value" == /* ]] || single_server_die "$label muss ein absoluter Pfad sein."
  [[ "$value" != "/" && "$value" != "/etc" && "$value" != "/var" && "$value" != "/var/lib" ]] \
    || single_server_die "$label ist zu breit."
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || single_server_die "$label enthaelt Steuerzeichen."
}

single_server_load_environment() {
  local env_file="${1:-}"
  [[ -n "$env_file" ]] || single_server_die "Pfad zur externen Environment-Datei fehlt."
  [[ "$env_file" == /* ]] || single_server_die "Die Environment-Datei muss als absoluter Pfad angegeben werden."
  [[ -f "$env_file" && -r "$env_file" && ! -L "$env_file" ]] \
    || single_server_die "Environment-Datei fehlt, ist nicht lesbar oder ist ein Symlink."
  if [[ "$(uname -s)" == "Linux" ]]; then
    local env_parent="/etc/versorgungs-kompass" env_parent_mode
    command -v realpath >/dev/null 2>&1 \
      || single_server_die "Erforderliches Programm fehlt vor dem sicheren Environment-Laden: realpath"
    [[ "$env_file" == "/etc/versorgungs-kompass/single-server.env" ]] \
      || single_server_die "Auf Linux darf nur /etc/versorgungs-kompass/single-server.env geladen werden."
    [[ -d "$env_parent" && ! -L "$env_parent" && "$(realpath -e -- "$env_parent")" == "$env_parent" ]] \
      || single_server_die "Das Linux-Environment-Elternverzeichnis ist nicht kanonisch oder ein Symlink."
    [[ "$(stat -c '%u:%g' "$env_parent")" == "0:0" ]] \
      || single_server_die "Das Linux-Environment-Elternverzeichnis muss root:root gehoeren."
    env_parent_mode="$(stat -c '%a' "$env_parent")"
    (( (8#$env_parent_mode & 0022) == 0 )) \
      || single_server_die "Das Linux-Environment-Elternverzeichnis darf nicht gruppen- oder fremdbeschreibbar sein."
    [[ "$(realpath -e -- "$env_file")" == "$env_file" ]] \
      || single_server_die "Die Linux-Environment-Datei oder eine Pfadkomponente ist ein Symlink."
    [[ "$(stat -c '%u:%g' "$env_file")" == "0:0" ]] \
      || single_server_die "Die Linux-Environment-Datei muss root:root gehoeren."
    [[ "$(stat -c '%a' "$env_file")" == "600" ]] \
      || single_server_die "Die Linux-Environment-Datei muss vor dem Laden Modus 0600 besitzen."
  fi

  SINGLE_SERVER_ENV_FILE="$env_file"
  set -a
  # Die Datei ist eine root-geschuetzte, vom Betreiber verwaltete Shell-Environment-Datei.
  # shellcheck disable=SC1090
  source "$env_file"
  set +a

  : "${APP_HOST:?APP_HOST fehlt}"
  : "${APP_ORIGIN:?APP_ORIGIN fehlt}"
  : "${APP_SITE_ADDRESS:?APP_SITE_ADDRESS fehlt}"
  : "${CONFIG_DIR:?CONFIG_DIR fehlt}"
  : "${STATE_DIR:?STATE_DIR fehlt}"
  : "${GOOGLE_OAUTH_CLIENT_ID:?GOOGLE_OAUTH_CLIENT_ID fehlt}"
  : "${INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256:?INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256 fehlt}"
  : "${API_CUTOVER_MODE:?API_CUTOVER_MODE fehlt}"

  [[ "$APP_HOST" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] \
    || single_server_die "APP_HOST muss genau ein kanonischer kleingeschriebener DNS-Name sein."
  [[ "$APP_ORIGIN" == "https://$APP_HOST" ]] \
    || single_server_die "APP_ORIGIN muss exakt https://APP_HOST ohne abschliessenden Slash sein."
  [[ "$APP_SITE_ADDRESS" == "$APP_HOST" ]] \
    || single_server_die "APP_SITE_ADDRESS muss exakt APP_HOST entsprechen."
  [[ "$GOOGLE_OAUTH_CLIENT_ID" =~ ^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$ ]] \
    || single_server_die "GOOGLE_OAUTH_CLIENT_ID ist kein Google-Web-Client."
  [[ "$GOOGLE_OAUTH_CLIENT_ID" != *REPLACE_WITH* ]] \
    || single_server_die "GOOGLE_OAUTH_CLIENT_ID enthaelt noch den Platzhalter aus environment.example."
  [[ "$INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256" =~ ^[a-f0-9]{64}$ ]] \
    || single_server_die "INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256 muss den vorab gepinnten Ed25519-Public-Key hashen."
  [[ "$API_CUTOVER_MODE" =~ ^(closed|open)$ ]] \
    || single_server_die "API_CUTOVER_MODE muss exakt closed oder open sein."

  single_server_assert_narrow_absolute_path CONFIG_DIR "$CONFIG_DIR"
  single_server_assert_narrow_absolute_path STATE_DIR "$STATE_DIR"
  if [[ "${SINGLE_SERVER_LOCAL_TEST:-0}" == "1" ]]; then
    [[ "$(uname -s)" != "Linux" ]] \
      || single_server_die "SINGLE_SERVER_LOCAL_TEST darf auf einem Linux-Zielhost nicht gesetzt sein."
  else
    [[ "$CONFIG_DIR" == "/etc/versorgungs-kompass/secrets" ]] \
      || single_server_die "CONFIG_DIR muss im Live-Betrieb exakt /etc/versorgungs-kompass/secrets sein."
    [[ "$STATE_DIR" == "/var/lib/versorgungs-kompass" ]] \
      || single_server_die "STATE_DIR muss im Live-Betrieb exakt /var/lib/versorgungs-kompass sein."
  fi
  [[ "$CONFIG_DIR" != "$STATE_DIR" && "$CONFIG_DIR" != "$STATE_DIR/"* && "$STATE_DIR" != "$CONFIG_DIR/"* ]] \
    || single_server_die "CONFIG_DIR und STATE_DIR muessen getrennte, nicht verschachtelte Pfade sein."
  [[ "$CONFIG_DIR" != "$PROJECT_ROOT" && "$CONFIG_DIR" != "$PROJECT_ROOT/"* ]] \
    || single_server_die "Secrets duerfen nicht im Git-Checkout liegen."
  [[ "$STATE_DIR" != "$PROJECT_ROOT" && "$STATE_DIR" != "$PROJECT_ROOT/"* ]] \
    || single_server_die "Betriebsdaten duerfen nicht im Git-Checkout liegen."

  SOURCE_URL="${SOURCE_URL:-https://github.com/TimoFrank/mitmachen}"
  LEGACY_PROFILE_IMAGE_BUCKET="${LEGACY_PROFILE_IMAGE_BUCKET:-}"
  [[ "$SOURCE_URL" == "https://github.com/TimoFrank/mitmachen" ]] \
    || single_server_die "SOURCE_URL muss die kanonische Repository-URL sein."
  SOURCE_REVISION="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
  PRODUCT_VERSION="$(sed -nE 's/^[[:space:]]*"productVersion":[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' "$PROJECT_ROOT/config/release.json")"
  [[ "$SOURCE_REVISION" =~ ^[0-9a-f]{40,64}$ ]] || single_server_die "Quellrevision ist ungueltig."
  [[ "$PRODUCT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || single_server_die "Produktversion ist ungueltig."

  export SINGLE_SERVER_ENV_FILE APP_HOST APP_ORIGIN APP_SITE_ADDRESS CONFIG_DIR STATE_DIR API_CUTOVER_MODE
  export GOOGLE_OAUTH_CLIENT_ID INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256 LEGACY_PROFILE_IMAGE_BUCKET
  export SOURCE_URL SOURCE_REVISION PRODUCT_VERSION
}

single_server_assert_api_cutover_mode() {
  local expected_mode="${1:-}" response
  [[ "$expected_mode" =~ ^(closed|open)$ ]] \
    || single_server_die "Erwarteter API-Cutover-Modus muss closed oder open sein."
  response="$(single_server_compose exec -T api node -e '
    fetch("http://127.0.0.1:8080/api/readyz")
      .then(async (result) => {
        if (!result.ok) process.exit(1);
        process.stdout.write(await result.text());
      })
      .catch(() => process.exit(1));
  ')" || single_server_die "API-Readiness samt Cutover-Modus konnte nicht intern gelesen werden."
  EXPECTED_CUTOVER_MODE="$expected_mode" node -e '
    const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    if (input?.ok !== true || input?.cutoverMode !== process.env.EXPECTED_CUTOVER_MODE) process.exit(1);
  ' <<<"$response" || single_server_die "API meldet nicht den erwarteten Cutover-Modus $expected_mode."
}

single_server_compose() {
  local compose_files=(-f "$SINGLE_SERVER_DIR/compose.yaml")
  if [[ -n "${SINGLE_SERVER_COMPOSE_OVERRIDE_FILE:-}" ]]; then
    [[ "${SINGLE_SERVER_LOCAL_TEST:-0}" == "1" && "$(uname -s)" != "Linux" ]] \
      || single_server_die "Ein Compose-Override ist ausschliesslich fuer lokale Nicht-Linux-Tests zulaessig."
    [[ "$SINGLE_SERVER_COMPOSE_OVERRIDE_FILE" == /* \
       && -f "$SINGLE_SERVER_COMPOSE_OVERRIDE_FILE" \
       && ! -L "$SINGLE_SERVER_COMPOSE_OVERRIDE_FILE" ]] \
      || single_server_die "Lokaler Compose-Override muss eine absolute symlinkfreie regulaere Datei sein."
    compose_files+=(-f "$SINGLE_SERVER_COMPOSE_OVERRIDE_FILE")
  fi
  docker compose \
    --env-file "$SINGLE_SERVER_ENV_FILE" \
    --project-directory "$SINGLE_SERVER_DIR" \
    "${compose_files[@]}" \
    "$@"
}

single_server_assert_private_attestation_file() {
  local target="${1:-}" label="${2:-Attestation}"
  [[ -f "$target" && ! -L "$target" ]] \
    || single_server_die "$label fehlt oder ist keine symlinkfreie regulaere Datei."
  if [[ "$(uname -s)" == "Linux" ]]; then
    [[ "$(stat -c '%u:%g' "$target")" == "0:0" && "$(stat -c '%a' "$target")" == "600" ]] \
      || single_server_die "$label muss root:root und Modus 0600 besitzen."
  fi
}

single_server_assert_initial_cutover_attestation() {
  local attestation="$STATE_DIR/.initial-cutover-attestation"
  single_server_assert_private_attestation_file "$attestation" "Initiale Cutover-Attestation"
  single_server_require_command node
  APP_HOST="$APP_HOST" node -e '
    const fs = require("node:fs");
    const source = fs.readFileSync(process.argv[1], "utf8");
    const hex = "[a-f0-9]{64}";
    const revision = "[a-f0-9]{40,64}";
    const escapedHost = process.env.APP_HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `^schemaVersion=1\\nappHost=${escapedHost}\\ninitialRevision=${revision}\\n`
      + `gateSha256=${hex}\\nmigrationPackageSha256=${hex}\\nbackupSnapshotId=${hex}\\n`
      + "preparedAt=\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\\n$"
    );
    if (!pattern.test(source)) process.exit(1);
  ' "$attestation" \
    || single_server_die "Initiale Cutover-Attestation ist nicht exakt an den App-Host und den Voll-Cutover gebunden."
}

single_server_assert_open_attestation() {
  if [[ "$API_CUTOVER_MODE" == "open" ]]; then
    local attestation="$STATE_DIR/.cutover-open-attestation"
    local initial_attestation="$STATE_DIR/.initial-cutover-attestation"
    single_server_assert_initial_cutover_attestation
    single_server_assert_private_attestation_file "$attestation" "Aktuelle Open-Attestation"
    APP_HOST="$APP_HOST" SOURCE_REVISION="$SOURCE_REVISION" node -e '
      const crypto = require("node:crypto");
      const fs = require("node:fs");
      const source = fs.readFileSync(process.argv[1], "utf8");
      const initial = fs.readFileSync(process.argv[2]);
      const initialSha = crypto.createHash("sha256").update(initial).digest("hex");
      const hex = "[a-f0-9]{64}";
      const escapedHost = process.env.APP_HOST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const revision = process.env.SOURCE_REVISION;
      const pattern = new RegExp(
        `^schemaVersion=2\\nmode=open\\nappHost=${escapedHost}\\nauthorizedRevision=${revision}\\n`
        + "authorizationKind=(initial-cutover|code-reopen)\\n"
        + `initialCutoverSha256=${initialSha}\\nauthorizationGateSha256=${hex}\\nbackupSnapshotId=${hex}\\n`
        + "authorizedAt=\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\\n$"
      );
      if (!pattern.test(source)) process.exit(1);
    ' "$attestation" "$initial_attestation" \
      || single_server_die "Aktuelle Open-Attestation ist nicht exakt an Initial-Cutover, App-Host und laufende Revision gebunden."
  fi
}

single_server_assert_api_writer_fence_contract() {
  local control_directory="$STATE_DIR/api-control"
  local contract_file="$control_directory/.writer-fence-ready"
  single_server_require_command sha256sum
  [[ -d "$control_directory" && ! -L "$control_directory" \
     && "$(realpath -e -- "$control_directory")" == "$control_directory" ]] \
    || single_server_die "API-Writer-Fence-Verzeichnis fehlt, ist ein Symlink oder nicht kanonisch."
  [[ -f "$contract_file" && ! -L "$contract_file" ]] \
    || single_server_die "API-Writer-Fence-Sentinel fehlt oder ist keine symlinkfreie regulaere Datei."
  if [[ "$(uname -s)" == "Linux" ]]; then
    [[ "$(stat -c '%u:%g' "$control_directory")" == "0:70" \
       && "$(stat -c '%a' "$control_directory")" == "750" ]] \
      || single_server_die "API-Writer-Fence-Verzeichnis muss root:70 und Modus 0750 besitzen."
    [[ "$(stat -c '%u:%g' "$contract_file")" == "0:70" \
       && "$(stat -c '%a' "$contract_file")" == "440" ]] \
      || single_server_die "API-Writer-Fence-Sentinel muss root:70 und Modus 0440 besitzen."
  fi
  [[ "$(sha256sum "$contract_file" | awk '{print $1}')" == \
     "377b83127c4696bc13b0cbee5f63893c2153dc478651010faa8f76120ff61bdb" ]] \
    || single_server_die "API-Writer-Fence-Sentinel besitzt nicht den erwarteten Vertrag."
}

single_server_assert_no_api_recovery_markers() {
  local marker
  single_server_assert_api_writer_fence_contract
  for marker in \
    "$STATE_DIR/.backup-api-restart-required" \
    "$STATE_DIR/.database-import-recovery-required" \
    "$STATE_DIR/api-control/.cutover-mode-change-pending"; do
    [[ ! -e "$marker" && ! -L "$marker" ]] \
      || single_server_die "Offener Recovery-Marker blockiert jeden API-Start: $marker"
  done
  single_server_assert_open_attestation
}

single_server_assert_no_maintenance_recovery_markers() {
  single_server_assert_no_api_recovery_markers
  local marker="$STATE_DIR/.backup-repository-recovery-required"
  [[ ! -e "$marker" && ! -L "$marker" ]] \
    || single_server_die "Offene Backup-Repository-Recovery blockiert diesen Betriebsschritt: $marker"
}

single_server_create_repository_recovery_marker() {
  local operation_id="${1:-}" marker pending
  [[ "$operation_id" =~ ^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] \
    || single_server_die "Backup-Operation-ID fuer den Repository-Recovery-Marker ist ungueltig."
  marker="$STATE_DIR/.backup-repository-recovery-required"
  pending="$STATE_DIR/.backup-repository-recovery-required.pending.$$"
  [[ ! -L "$marker" && ! -L "$pending" ]] \
    || single_server_die "Repository-Recovery-Marker darf kein Symlink sein."
  if [[ -e "$marker" ]]; then
    [[ -f "$marker" ]] || single_server_die "Repository-Recovery-Marker ist kein regulaeres File."
    grep -qx "operationId=$operation_id" "$marker" \
      || single_server_die "Ein anderer Repository-Recovery-Zyklus ist bereits offen."
    return
  fi
  [[ ! -e "$pending" ]] || single_server_die "Temporaerer Repository-Recovery-Marker existiert bereits."
  (
    umask 077
    printf 'schemaVersion=1\noperationId=%s\nsourceRevision=%s\ncreatedAt=%s\n' \
      "$operation_id" "$SOURCE_REVISION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending"
  )
  chmod 0600 "$pending"
  single_server_promote_durable_file "$pending" "$marker"
}

single_server_remove_interrupted_backup_containers() {
  local operation_id="${1:-}" service container_name project_label service_label oneoff_label container_inventory
  [[ "$operation_id" =~ ^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] \
    || single_server_die "Backup-Operation-ID fuer die Container-Recovery ist ungueltig."
  container_inventory="$(docker container ls --all --format '{{.Names}}')" \
    || single_server_die "Docker-Containerinventar ist fuer die Backup-Recovery nicht lesbar."
  for service in database-dump database-restore-test object-storage-restore-test restic-backup restic-maintenance restic-restore; do
    container_name="versorgungs-kompass-backup-$operation_id-$service"
    if ! grep -Fxq "$container_name" <<<"$container_inventory"; then
      continue
    fi
    project_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_name")"
    service_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_name")"
    oneoff_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$container_name")"
    [[ "$project_label" == "versorgungs-kompass-single-server" \
       && "$service_label" == "$service" \
       && "$oneoff_label" == "True" ]] \
      || single_server_die "Recovery-Container $container_name besitzt unerwartete Compose-Labels."
    docker container rm --force -- "$container_name" >/dev/null \
      || single_server_die "Unterbrochener $service-Container konnte nicht entfernt werden."
  done
  container_inventory="$(docker container ls --all --format '{{.Names}}')" \
    || single_server_die "Docker-Containerinventar konnte nach der Backup-Recovery nicht erneut gelesen werden."
  for service in database-dump database-restore-test object-storage-restore-test restic-backup restic-maintenance restic-restore; do
    container_name="versorgungs-kompass-backup-$operation_id-$service"
    ! grep -Fxq "$container_name" <<<"$container_inventory" \
      || single_server_die "Gebundener Backup-Recovery-Container ist nach dem Entfernen noch vorhanden: $container_name"
  done
}

single_server_remove_interrupted_import_containers() {
  local operation_id="${1:-}" suffix container_name project_label service_label oneoff_label container_inventory
  [[ "$operation_id" =~ ^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$ ]] \
    || single_server_die "Import-Operation-ID fuer die Container-Recovery ist ungueltig."
  container_inventory="$(docker container ls --all --format '{{.Names}}')" \
    || single_server_die "Docker-Containerinventar ist fuer die Import-Recovery nicht lesbar."
  for suffix in database-import database-import-readback; do
    container_name="versorgungs-kompass-import-$operation_id-$suffix"
    if ! grep -Fxq "$container_name" <<<"$container_inventory"; then
      continue
    fi
    project_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_name")"
    service_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_name")"
    oneoff_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$container_name")"
    [[ "$project_label" == "versorgungs-kompass-single-server" \
       && "$service_label" == "database-import" \
       && "$oneoff_label" == "True" ]] \
      || single_server_die "Recovery-Container $container_name besitzt unerwartete Compose-Labels."
    docker container rm --force -- "$container_name" >/dev/null \
      || single_server_die "Unterbrochener Import-Container konnte nicht entfernt werden."
  done
  container_inventory="$(docker container ls --all --format '{{.Names}}')" \
    || single_server_die "Docker-Containerinventar konnte nach der Import-Recovery nicht erneut gelesen werden."
  for suffix in database-import database-import-readback; do
    container_name="versorgungs-kompass-import-$operation_id-$suffix"
    ! grep -Fxq "$container_name" <<<"$container_inventory" \
      || single_server_die "Gebundener Import-Recovery-Container ist nach dem Entfernen noch vorhanden: $container_name"
  done
}

single_server_assert_running_api_revision() {
  local api_container_ids api_container_id expected_image expected_image_id
  local project_label service_label oneoff_label configured_image container_image_id
  local source_label revision_label version_label
  api_container_ids="$(single_server_compose ps --quiet api)"
  [[ "$(printf '%s\n' "$api_container_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')" == "1" ]] \
    || single_server_die "Vor der Sicherung muss genau ein laufender API-Container existieren."
  api_container_id="$(printf '%s\n' "$api_container_ids" | sed '/^$/d')"
  [[ "$api_container_id" =~ ^[a-f0-9]{12,64}$ ]] \
    || single_server_die "API-Container-ID ist ungueltig."
  expected_image="versorgungs-kompass-api:$SOURCE_REVISION"
  expected_image_id="$(docker image inspect --format '{{.Id}}' "$expected_image")" \
    || single_server_die "Das erwartete API-Image fehlt."
  project_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$api_container_id")"
  service_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$api_container_id")"
  oneoff_label="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.oneoff" }}' "$api_container_id")"
  configured_image="$(docker container inspect --format '{{.Config.Image}}' "$api_container_id")"
  container_image_id="$(docker container inspect --format '{{.Image}}' "$api_container_id")"
  source_label="$(docker container inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$api_container_id")"
  revision_label="$(docker container inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$api_container_id")"
  version_label="$(docker container inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$api_container_id")"
  [[ "$project_label" == "versorgungs-kompass-single-server" \
     && "$service_label" == "api" \
     && "$oneoff_label" == "False" \
     && "$configured_image" == "$expected_image" \
     && "$container_image_id" == "$expected_image_id" \
     && "$source_label" == "$SOURCE_URL" \
     && "$revision_label" == "$SOURCE_REVISION" \
     && "$version_label" == "$PRODUCT_VERSION" ]] \
    || single_server_die "Laufender API-Container, Image-ID oder OCI-Provenienz passt nicht exakt zum Checkout."
}

single_server_acquire_maintenance_lock() {
  local operation="${1:-unspecified}"
  SINGLE_SERVER_MAINTENANCE_LOCK="$STATE_DIR/.maintenance.lock"
  [[ -d "$STATE_DIR" && ! -L "$STATE_DIR" ]] \
    || single_server_die "STATE_DIR fehlt oder ist ein Symlink; Betriebssperre nicht moeglich."
  [[ ! -L "$SINGLE_SERVER_MAINTENANCE_LOCK" ]] \
    || single_server_die "Wartungssperrdatei darf kein Symlink sein."
  if command -v flock >/dev/null 2>&1; then
    exec {SINGLE_SERVER_MAINTENANCE_FD}>>"$SINGLE_SERVER_MAINTENANCE_LOCK"
    chmod 0600 "$SINGLE_SERVER_MAINTENANCE_LOCK"
    if ! flock --nonblock "$SINGLE_SERVER_MAINTENANCE_FD"; then
      exec {SINGLE_SERVER_MAINTENANCE_FD}>&-
      single_server_die "Ein anderer Einzelserver-Betriebsschritt haelt die Wartungssperre."
    fi
    : >"$SINGLE_SERVER_MAINTENANCE_LOCK"
    printf 'operation=%s\npid=%s\nstarted_at=%s\n' \
      "$operation" "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      >&"$SINGLE_SERVER_MAINTENANCE_FD"
    SINGLE_SERVER_MAINTENANCE_KIND="flock"
    return
  fi
  [[ "${SINGLE_SERVER_LOCAL_TEST:-0}" == "1" && "$(uname -s)" != "Linux" ]] \
    || single_server_die "flock aus util-linux fehlt; sichere automatische Wartungssperre nicht moeglich."
  SINGLE_SERVER_MAINTENANCE_LOCK="$STATE_DIR/.maintenance-local-test-lock"
  mkdir -m 0700 -- "$SINGLE_SERVER_MAINTENANCE_LOCK" 2>/dev/null \
    || single_server_die "Ein anderer lokaler Einzelserver-Testschritt ist aktiv."
  SINGLE_SERVER_MAINTENANCE_KIND="local-test-directory"
}

single_server_release_maintenance_lock() {
  local lock="${SINGLE_SERVER_MAINTENANCE_LOCK:-}" kind="${SINGLE_SERVER_MAINTENANCE_KIND:-}"
  [[ -n "$lock" ]] || return 0
  if [[ "$kind" == "flock" ]]; then
    flock --unlock "$SINGLE_SERVER_MAINTENANCE_FD" || return 1
    exec {SINGLE_SERVER_MAINTENANCE_FD}>&-
  elif [[ "$kind" == "local-test-directory" ]]; then
    [[ "$lock" == "$STATE_DIR/.maintenance-local-test-lock" && -d "$lock" && ! -L "$lock" ]] || return 1
    rmdir -- "$lock" || return 1
  else
    return 1
  fi
  SINGLE_SERVER_MAINTENANCE_LOCK=""
  SINGLE_SERVER_MAINTENANCE_KIND=""
}

single_server_permanent_services_ready() {
  local permanent_services=(caddy oauth2-proxy frontend api postgres)
  local compose_status
  compose_status="$(single_server_compose ps --format json "${permanent_services[@]}")" || return 1

  PERMANENT_SERVICES="$(IFS=,; printf '%s' "${permanent_services[*]}")" \
    node -e '
      const fs = require("node:fs");
      const expected = process.env.PERMANENT_SERVICES.split(",");
      const raw = fs.readFileSync(0, "utf8").trim();
      if (!raw) process.exit(1);
      let rows;
      try {
        const parsed = JSON.parse(raw);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        try {
          rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
        } catch {
          process.exit(1);
        }
      }
      const ready = expected.every((service) => {
        const matches = rows.filter((row) => row.Service === service);
        if (matches.length !== 1) return false;
        const state = String(matches[0].State || "").toLowerCase();
        const health = String(matches[0].Health || "").toLowerCase();
        return state === "running" && (!health || health === "healthy");
      });
      process.exit(ready ? 0 : 1);
    ' <<<"$compose_status"
}

single_server_wait_for_permanent_services() {
  local attempts="${1:-24}" required_streak="${2:-2}" interval_seconds="${3:-5}"
  local ready_streak=0
  for (( attempt = 1; attempt <= attempts; attempt += 1 )); do
    if single_server_permanent_services_ready; then
      ((ready_streak += 1))
      if (( ready_streak >= required_streak )); then
        return 0
      fi
    else
      ready_streak=0
    fi
    sleep "$interval_seconds"
  done
  return 1
}
