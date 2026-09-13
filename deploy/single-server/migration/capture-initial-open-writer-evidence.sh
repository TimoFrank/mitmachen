#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export LC_ALL=C

die() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Aufruf: capture-initial-open-writer-evidence.sh --migration-dir /absolutes/paket --libpq-dir /absolutes/libpq --gke-config /absolutes/gke-freeze.conf --global-writer-attestation /absoluter/nachweis --gate-nonce 64-hex --output-dir /absolutes/neues-ziel --signing-key /absoluter/ed25519-private-key.pem' >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Erforderliches Programm fehlt: $1"
}

for required_command in awk basename date dirname env find gcloud git grep id mkdir node psql realpath sha256sum sort stat tr wc; do
  require_command "$required_command"
done

stat_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

stat_uid() {
  if stat -c '%u' "$1" >/dev/null 2>&1; then
    stat -c '%u' "$1"
  else
    stat -f '%u' "$1"
  fi
}

canonical_directory() {
  local label="$1" value="$2" canonical
  [[ "$value" == /* ]] || die "$label muss ein absoluter Pfad sein."
  [[ -d "$value" && ! -L "$value" ]] || die "$label fehlt, ist kein Verzeichnis oder ist ein Symlink."
  canonical="$(realpath "$value")" || die "$label kann nicht kanonisch aufgeloest werden."
  [[ "$canonical" == "$value" ]] || die "$label muss bereits kanonisch und vollstaendig symlinkfrei sein."
  printf '%s\n' "$canonical"
}

canonical_protected_directory() {
  local label="$1" value current_uid
  value="$(canonical_directory "$label" "$2")"
  current_uid="$(id -u)"
  [[ "$(stat_uid "$value")" == "$current_uid" && "$(stat_mode "$value")" == "700" ]] \
    || die "$label muss dem aufrufenden Nutzer gehoeren und Modus 0700 besitzen."
  printf '%s\n' "$value"
}

canonical_protected_file() {
  local label="$1" value="$2" canonical parent current_uid
  [[ "$value" == /* ]] || die "$label muss ein absoluter Pfad sein."
  [[ -f "$value" && ! -L "$value" ]] || die "$label fehlt, ist keine regulaere Datei oder ist ein Symlink."
  canonical="$(realpath "$value")" || die "$label kann nicht kanonisch aufgeloest werden."
  [[ "$canonical" == "$value" ]] || die "$label muss bereits kanonisch und vollstaendig symlinkfrei sein."
  parent="$(canonical_protected_directory "$label-Elternverzeichnis" "$(dirname -- "$value")")"
  current_uid="$(id -u)"
  [[ "$(stat_uid "$value")" == "$current_uid" && "$(stat_mode "$value")" == "600" ]] \
    || die "$label muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen."
  [[ "$value" == "$parent/$(basename -- "$value")" ]] \
    || die "$label darf keine mehrdeutigen Pfadanteile enthalten."
  printf '%s\n' "$canonical"
}

assert_disjoint_paths() {
  local first_label="$1" first="$2" second_label="$3" second="$4"
  [[ "$first" != "$second" && "$first" != "$second/"* && "$second" != "$first/"* ]] \
    || die "$first_label und $second_label muessen in beide Richtungen unverschachtelt sein."
}

canonical_command() {
  local name="$1" located canonical
  located="$(type -P "$name")" || die "Programm ist nicht als Datei aufloesbar: $name"
  [[ "$located" == /* && -f "$located" ]] || die "Programmpfad ist nicht absolut oder regulaer: $name"
  canonical="$(realpath "$located")" || die "Programmpfad ist nicht kanonisch aufloesbar: $name"
  [[ -f "$canonical" ]] || die "Kanonisches Programm ist keine regulaere Datei: $name"
  printf '%s\n' "$canonical"
}

MIGRATION_DIR=''
LIBPQ_DIR=''
GKE_FREEZE_CONFIG=''
GLOBAL_WRITER_ATTESTATION=''
GATE_NONCE=''
OUTPUT_DIR=''
SIGNING_KEY=''

set_argument_once() {
  local variable_name="$1" option_name="$2" value="$3"
  [[ -n "$value" ]] || usage
  [[ -z "${!variable_name}" ]] || die "$option_name darf nur einmal angegeben werden."
  printf -v "$variable_name" '%s' "$value"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --migration-dir|--libpq-dir|--gke-config|--global-writer-attestation|--gate-nonce|--output-dir|--signing-key)
      [[ "$#" -ge 2 ]] || usage
      case "$1" in
        --migration-dir) set_argument_once MIGRATION_DIR "$1" "$2" ;;
        --libpq-dir) set_argument_once LIBPQ_DIR "$1" "$2" ;;
        --gke-config) set_argument_once GKE_FREEZE_CONFIG "$1" "$2" ;;
        --global-writer-attestation) set_argument_once GLOBAL_WRITER_ATTESTATION "$1" "$2" ;;
        --gate-nonce) set_argument_once GATE_NONCE "$1" "$2" ;;
        --output-dir) set_argument_once OUTPUT_DIR "$1" "$2" ;;
        --signing-key) set_argument_once SIGNING_KEY "$1" "$2" ;;
      esac
      shift 2
      ;;
    --help|-h) usage ;;
    *) usage ;;
  esac
done

for required_value in MIGRATION_DIR LIBPQ_DIR GKE_FREEZE_CONFIG GLOBAL_WRITER_ATTESTATION GATE_NONCE OUTPUT_DIR SIGNING_KEY; do
  [[ -n "${!required_value}" ]] || usage
done
[[ "$GATE_NONCE" =~ ^[a-f0-9]{64}$ ]] || die "GATE_NONCE muss genau 64 kleingeschriebene Hexzeichen enthalten."

# Geerbte libpq-Parameter duerfen den geprueften Service weder ueberschreiben
# noch in die read-only Kindprozesse gelangen.
unset PGAPPNAME PGCHANNELBINDING PGCLIENTENCODING PGCONNECT_TIMEOUT PGDATABASE
unset PGGSSENCMODE PGHOST PGHOSTADDR PGKRBSRVNAME PGOPTIONS PGPASSFILE
unset PGPASSWORD PGPORT PGSERVICE PGSERVICEFILE PGSSLCERT PGSSLCRL PGSSLCRLDIR
unset PGSSLKEY PGSSLMODE PGSSLNEGOTIATION PGSSLROOTCERT PGSSLSNI
unset PGREQUIREPEER PGTARGETSESSIONATTRS PGUSER
unset NODE_OPTIONS NODE_PATH
unset GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG_COUNT GIT_CONFIG_GLOBAL
unset GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM GIT_DIR GIT_INDEX_FILE
unset GIT_OBJECT_DIRECTORY GIT_WORK_TREE

script_input="${BASH_SOURCE[0]}"
if [[ "$script_input" == /* ]]; then
  script_candidate="$script_input"
else
  script_candidate="$(pwd -P)/$script_input"
fi
SCRIPT_PATH="$(realpath "$script_candidate")" || die "Skriptpfad kann nicht kanonisch aufgeloest werden."
[[ "$SCRIPT_PATH" == "$script_candidate" && -f "$SCRIPT_PATH" && ! -L "$SCRIPT_PATH" ]] \
  || die "Collector muss ueber seinen absoluten, kanonischen und symlinkfreien Pfad laufen."
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd -P)"
PROJECT_ROOT="$(canonical_directory PROJECT_ROOT "$PROJECT_ROOT")"

repository_top="$(git -C "$PROJECT_ROOT" rev-parse --show-toplevel 2>/dev/null)" \
  || die "PROJECT_ROOT ist kein Git-Checkout."
repository_top="$(realpath "$repository_top")" || die "Git-Repositorypfad kann nicht kanonisch aufgeloest werden."
[[ "$repository_top" == "$PROJECT_ROOT" ]] || die "Git-Repositorypfad stimmt nicht exakt mit PROJECT_ROOT ueberein."
[[ -z "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=normal)" ]] \
  || die "Repository muss fuer den revisionsgebundenen Nachweis vollstaendig sauber sein."

MIGRATION_DIR="$(canonical_protected_directory MIGRATION_DIR "$MIGRATION_DIR")"
LIBPQ_DIR="$(canonical_protected_directory LIBPQ_DIR "$LIBPQ_DIR")"
GKE_FREEZE_CONFIG="$(canonical_protected_file GKE_FREEZE_CONFIG "$GKE_FREEZE_CONFIG")"
GLOBAL_WRITER_ATTESTATION="$(canonical_protected_file GLOBAL_WRITER_ATTESTATION "$GLOBAL_WRITER_ATTESTATION")"
SIGNING_KEY="$(canonical_protected_file SIGNING_KEY "$SIGNING_KEY")"

[[ "$OUTPUT_DIR" == /* && "$OUTPUT_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] \
  || die "OUTPUT_DIR muss ein absoluter Pfad mit sicheren portablen Zeichen sein."
output_basename="$(basename -- "$OUTPUT_DIR")"
[[ "$output_basename" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$output_basename" != "." && "$output_basename" != ".." ]] \
  || die "OUTPUT_DIR benoetigt einen engen, portablen Verzeichnisnamen."
OUTPUT_PARENT="$(canonical_protected_directory OUTPUT_PARENT "$(dirname -- "$OUTPUT_DIR")")"
[[ "$OUTPUT_DIR" == "$OUTPUT_PARENT/$output_basename" ]] \
  || die "OUTPUT_DIR muss bereits kanonisch sein und darf weder Symlinkanteile noch .. enthalten."
[[ ! -e "$OUTPUT_DIR" && ! -L "$OUTPUT_DIR" ]] \
  || die "OUTPUT_DIR muss exklusiv neu sein und darf noch nicht existieren."

for external_directory in "$MIGRATION_DIR" "$LIBPQ_DIR" "$OUTPUT_DIR"; do
  assert_disjoint_paths EXTERNER_PFAD "$external_directory" PROJECT_ROOT "$PROJECT_ROOT"
done
assert_disjoint_paths MIGRATION_DIR "$MIGRATION_DIR" LIBPQ_DIR "$LIBPQ_DIR"
assert_disjoint_paths OUTPUT_DIR "$OUTPUT_DIR" MIGRATION_DIR "$MIGRATION_DIR"
assert_disjoint_paths OUTPUT_DIR "$OUTPUT_DIR" LIBPQ_DIR "$LIBPQ_DIR"
for protected_file in "$GKE_FREEZE_CONFIG" "$GLOBAL_WRITER_ATTESTATION" "$SIGNING_KEY"; do
  assert_disjoint_paths GESCHUETZTE_DATEI "$protected_file" PROJECT_ROOT "$PROJECT_ROOT"
  assert_disjoint_paths GESCHUETZTE_DATEI "$protected_file" OUTPUT_DIR "$OUTPUT_DIR"
done
[[ "$GKE_FREEZE_CONFIG" != "$GLOBAL_WRITER_ATTESTATION" \
   && "$GKE_FREEZE_CONFIG" != "$SIGNING_KEY" \
   && "$GLOBAL_WRITER_ATTESTATION" != "$SIGNING_KEY" ]] \
  || die "GKE-Konfiguration, globaler Writer-Nachweis und Signierschluessel muessen getrennte Dateien sein."

package_files=(
  database.dump
  database.toc
  migration-metadata.tsv
  row-counts.tsv
  storage-reference-counts.tsv
  SHA256SUMS
)
expected_inventory="$(printf '%s\n' "${package_files[@]}" | LC_ALL=C sort)"
actual_inventory="$(find "$MIGRATION_DIR" -mindepth 1 -maxdepth 1 -print | while IFS= read -r item; do basename -- "$item"; done | LC_ALL=C sort)"
[[ "$actual_inventory" == "$expected_inventory" ]] \
  || die "MIGRATION_DIR muss genau die sechs freigegebenen Paketdateien enthalten."
current_uid="$(id -u)"
for name in "${package_files[@]}"; do
  target="$MIGRATION_DIR/$name"
  [[ -f "$target" && ! -L "$target" && "$(realpath "$target")" == "$target" ]] \
    || die "Migrationsdatei fehlt, ist nicht kanonisch oder ist ein Symlink: $name"
  [[ "$(stat_uid "$target")" == "$current_uid" && "$(stat_mode "$target")" == "600" ]] \
    || die "Migrationsdatei muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen: $name"
done

awk '
  BEGIN {
    allowed["database.dump"] = 1
    allowed["database.toc"] = 1
    allowed["migration-metadata.tsv"] = 1
    allowed["row-counts.tsv"] = 1
    allowed["storage-reference-counts.tsv"] = 1
  }
  NF != 2 || length($1) != 64 || $1 !~ /^[a-f0-9]+$/ || !($2 in allowed) || seen[$2]++ { invalid=1 }
  END {
    if (NR != 5) invalid=1
    for (name in allowed) if (seen[name] != 1) invalid=1
    exit invalid
  }
' "$MIGRATION_DIR/SHA256SUMS" || die "SHA256SUMS ist nicht der kanonische Paketvertrag."
(
  cd -- "$MIGRATION_DIR"
  sha256sum -c SHA256SUMS >/dev/null
) || die "SHA256SUMS stimmt nicht mit dem Migrationspaket ueberein."

awk -F '\t' '
  NF != 2 { exit 1 }
  NR == 1 { if ($0 != "key\tvalue") exit 1; next }
  NR == 2 { if ($1 != "database" || $2 != "versorgungs_kompass") exit 1; next }
  NR == 3 { if ($1 != "format_version" || $2 != "2") exit 1; next }
  NR == 4 { if ($1 != "postgres_major" || $2 != "16") exit 1; next }
  NR == 5 || NR == 6 {
    expected[5]="source_deployed_revision"; expected[6]="target_revision"
    if ($1 != expected[NR] || $2 !~ /^[a-f0-9]+$/ || (length($2) != 40 && length($2) != 64)) exit 1
    next
  }
  NR == 7 {
    if ($1 != "cloud_sql_instance_connection_name" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]{0,96}[a-z0-9]$/) exit 1
    next
  }
  NR >= 8 && NR <= 11 {
    expected[8]="gke_binding_fingerprint"; expected[9]="gke_freeze_state_sha256"
    expected[10]="global_writer_attestation_sha256"; expected[11]="namespace_inventory_sha256"
    if ($1 != expected[NR] || $2 !~ /^[a-f0-9]{64}$/) exit 1
    next
  }
  NR == 12 {
    if ($1 != "database_snapshot_id" || $2 !~ /^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/) exit 1
    next
  }
  NR == 13 {
    if ($1 != "exported_at" || $2 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/) exit 1
    next
  }
  { exit 1 }
  END { if (NR != 13) exit 1 }
' "$MIGRATION_DIR/migration-metadata.tsv" \
  || die "migration-metadata.tsv ist nicht kanonisch oder unvollstaendig."

metadata_value() {
  local key="$1" value
  value="$(awk -F '\t' -v expected_key="$key" '$1 == expected_key { print $2 }' "$MIGRATION_DIR/migration-metadata.tsv")"
  [[ -n "$value" && "$(printf '%s\n' "$value" | wc -l | tr -d '[:space:]')" == "1" ]] \
    || die "Migrationsmetadatum fehlt oder ist mehrdeutig: $key"
  printf '%s\n' "$value"
}

SOURCE_DEPLOYED_REVISION="$(metadata_value source_deployed_revision)"
TARGET_REVISION="$(metadata_value target_revision)"
CLOUD_SQL_INSTANCE_CONNECTION_NAME="$(metadata_value cloud_sql_instance_connection_name)"
GKE_BINDING_FINGERPRINT="$(metadata_value gke_binding_fingerprint)"
HISTORICAL_GKE_FREEZE_STATE_SHA256="$(metadata_value gke_freeze_state_sha256)"
NAMESPACE_INVENTORY_SHA256="$(metadata_value namespace_inventory_sha256)"
MIGRATION_PACKAGE_SHA256="$(sha256sum "$MIGRATION_DIR/SHA256SUMS" | awk '{print $1}')"
[[ "$MIGRATION_PACKAGE_SHA256" =~ ^[a-f0-9]{64}$ ]] || die "Migrationspaketfingerprint ist ungueltig."

CHECKOUT_REVISION="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
[[ "$CHECKOUT_REVISION" == "$TARGET_REVISION" ]] \
  || die "Sauberer Checkout steht nicht exakt auf targetRevision des Migrationspakets."
git -C "$PROJECT_ROOT" ls-files --error-unmatch \
  "deploy/single-server/migration/capture-initial-open-writer-evidence.sh" \
  "deploy/single-server/migration/gke-writer-freeze.mjs" >/dev/null \
  || die "Collector und GKE-Writer-Freeze-Operator muessen in targetRevision versioniert sein."

GCP_PROJECT_ID="${CLOUD_SQL_INSTANCE_CONNECTION_NAME%%:*}"
CLOUD_SQL_INSTANCE_NAME="${CLOUD_SQL_INSTANCE_CONNECTION_NAME##*:}"
CLOUD_SQL_DATABASE='versorgungs_kompass'
CLOUD_SQL_SOCKET_DIR="/cloudsql/$CLOUD_SQL_INSTANCE_CONNECTION_NAME"

config_single_value() {
  local key="$1" values
  values="$(awk -F= -v expected_key="$key" '$1 == expected_key { print substr($0, index($0, "=") + 1) }' "$GKE_FREEZE_CONFIG")"
  [[ -n "$values" && "$(printf '%s\n' "$values" | wc -l | tr -d '[:space:]')" == "1" ]] \
    || die "GKE-Konfiguration bindet nicht genau einen Wert fuer $key."
  printf '%s\n' "$values"
}

[[ "$(config_single_value GCP_PROJECT_ID)" == "$GCP_PROJECT_ID" ]] \
  || die "GKE-Konfiguration und Migrationspaket binden nicht dasselbe GCP-Projekt."
K8S_NAMESPACE="$(config_single_value K8S_NAMESPACE)"
[[ "$K8S_NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] \
  || die "K8S_NAMESPACE ist ungueltig."
GKE_FREEZE_STATE_FILE="$(config_single_value STATE_FILE)"
GKE_FREEZE_STATE_FILE="$(canonical_protected_file GKE_FREEZE_STATE "$GKE_FREEZE_STATE_FILE")"
assert_disjoint_paths GKE_FREEZE_STATE "$GKE_FREEZE_STATE_FILE" PROJECT_ROOT "$PROJECT_ROOT"
assert_disjoint_paths GKE_FREEZE_STATE "$GKE_FREEZE_STATE_FILE" OUTPUT_DIR "$OUTPUT_DIR"

GKE_FREEZE_OPERATOR="$SCRIPT_DIR/gke-writer-freeze.mjs"
[[ -f "$GKE_FREEZE_OPERATOR" && ! -L "$GKE_FREEZE_OPERATOR" && -x "$GKE_FREEZE_OPERATOR" \
   && "$(realpath "$GKE_FREEZE_OPERATOR")" == "$GKE_FREEZE_OPERATOR" ]] \
  || die "Versionierter GKE-Writer-Freeze-Operator fehlt oder ist nicht kanonisch ausfuehrbar."

read_frozen_writer_evidence() {
  local freeze_output state_values state_sha state_binding state_generation state_namespace state_deployment state_deployment_uid output_values
  freeze_output="$("$GKE_FREEZE_OPERATOR" freeze --config "$GKE_FREEZE_CONFIG" --readback)" \
    || die "GKE-Writer-Freeze-Readback ist fehlgeschlagen; Initial-Open bleibt gesperrt."
  state_values="$(
    GKE_FREEZE_STATE_FILE="$GKE_FREEZE_STATE_FILE" \
    EXPECTED_PROJECT="$GCP_PROJECT_ID" \
    EXPECTED_REVISION="$TARGET_REVISION" \
    EXPECTED_BINDING="$GKE_BINDING_FINGERPRINT" \
    EXPECTED_NAMESPACE="$K8S_NAMESPACE" \
    EXPECTED_STATE_SHA="$HISTORICAL_GKE_FREEZE_STATE_SHA256" \
    node - <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const raw = readFileSync(process.env.GKE_FREEZE_STATE_FILE);
const sha = createHash("sha256").update(raw).digest("hex");
if (sha !== process.env.EXPECTED_STATE_SHA) throw new Error("STATE_FILE weicht vom historischen Exportzustand ab.");
const state = JSON.parse(raw.toString("utf8"));
if (state.phase !== "frozen"
    || state.gcp_project_id !== process.env.EXPECTED_PROJECT
    || state.operator_revision !== process.env.EXPECTED_REVISION
    || state.binding_fingerprint !== process.env.EXPECTED_BINDING
    || state.namespace !== process.env.EXPECTED_NAMESPACE
    || !Number.isSafeInteger(state.frozen_deployment_generation)
    || state.frozen_deployment_generation < 1
    || !/^[0-9]+$/u.test(state.frozen_deployment_resource_version || "")
    || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/u.test(state.deployment || "")
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(state.deployment_uid || "")) {
  throw new Error("STATE_FILE passt nicht exakt zu Paket, Zielrevision und Frozen-Deployment.");
}
process.stdout.write([
  sha,
  state.binding_fingerprint,
  String(state.frozen_deployment_generation),
  state.namespace,
  state.deployment,
  state.deployment_uid
].join("\t"));
NODE
  )" || die "GKE-Freeze-Statusdatei ist nicht unveraendert an das Migrationspaket gebunden."
  IFS=$'\t' read -r state_sha state_binding state_generation state_namespace state_deployment state_deployment_uid <<<"$state_values"

  output_values="$(
    FREEZE_OUTPUT="$freeze_output" \
    EXPECTED_PROJECT="$GCP_PROJECT_ID" \
    EXPECTED_REVISION="$TARGET_REVISION" \
    EXPECTED_NAMESPACE="$state_namespace" \
    EXPECTED_DEPLOYMENT="$state_deployment" \
    EXPECTED_DEPLOYMENT_UID="$state_deployment_uid" \
    EXPECTED_NAMESPACE_SHA="$NAMESPACE_INVENTORY_SHA256" \
    node - <<'NODE'
const { createHash } = require("node:crypto");
const keys = [
  "AKTION", "API_PODS", "DEPLOYMENT_UID", "EXTERNER_GLOBALER_WRITER_NACHWEIS",
  "FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN", "IMAGE", "IMAGE_ID", "NACHWEIS_GRENZE",
  "NAMESPACE_INVENTAR_SHA256", "NICHT_ERFASST", "OPERATOR_REVISION", "PHASE",
  "REPLICAS", "STATUSDATEI_PHASE", "ZIEL"
].sort();
const lines = process.env.FREEZE_OUTPUT.split("\n");
if (lines.some((line) => line.length === 0)) throw new Error("Readback enthaelt Leerzeilen.");
const values = new Map();
for (const line of lines) {
  const separator = line.indexOf("=");
  if (separator < 1) throw new Error("Readback ist nicht kanonisch.");
  const key = line.slice(0, separator);
  if (values.has(key)) throw new Error("Readback enthaelt doppelte Felder.");
  values.set(key, line.slice(separator + 1));
}
if (JSON.stringify([...values.keys()].sort()) !== JSON.stringify(keys)) throw new Error("Readback-Feldmenge ist nicht exakt.");
const expected = new Map([
  ["AKTION", "freeze"],
  ["API_PODS", "0"],
  ["DEPLOYMENT_UID", process.env.EXPECTED_DEPLOYMENT_UID],
  ["EXTERNER_GLOBALER_WRITER_NACHWEIS", "separat-erforderlich"],
  ["FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN", "0"],
  ["NACHWEIS_GRENZE", "konfiguriertes-namespace-und-api-deployment"],
  ["NAMESPACE_INVENTAR_SHA256", process.env.EXPECTED_NAMESPACE_SHA],
  ["NICHT_ERFASST", "externe-db-clients-und-andere-namespaces"],
  ["OPERATOR_REVISION", process.env.EXPECTED_REVISION],
  ["PHASE", "readback-frozen"],
  ["REPLICAS", "0"],
  ["STATUSDATEI_PHASE", "frozen"]
]);
for (const [key, expectedValue] of expected) {
  if (values.get(key) !== expectedValue) throw new Error(`Readback weicht bei ${key} ab.`);
}
const expectedTargetSuffix = `:${process.env.EXPECTED_NAMESPACE}/${process.env.EXPECTED_DEPLOYMENT}`;
if (!values.get("ZIEL").startsWith(`${process.env.EXPECTED_PROJECT}/`)
    || !values.get("ZIEL").endsWith(expectedTargetSuffix)) throw new Error("Readback-Ziel passt nicht zur Statusdatei.");
if (!/^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/u.test(values.get("IMAGE"))) {
  throw new Error("Readback besitzt kein unveraenderliches API-Image.");
}
if (!values.get("IMAGE_ID").endsWith(values.get("IMAGE").slice(values.get("IMAGE").lastIndexOf("sha256:")))) {
  throw new Error("Readback-ImageID passt nicht zum Image-Digest.");
}
process.stdout.write(createHash("sha256").update(process.env.FREEZE_OUTPUT + "\n").digest("hex"));
NODE
  )" || die "GKE-Writer-Freeze-Readback ist nicht der exakte Frozen-Nullzustand."
  printf '%s\t%s\t%s\t%s\t%s\n' "$state_sha" "$state_binding" "$state_generation" "$NAMESPACE_INVENTORY_SHA256" "$output_values"
}

validate_global_writer_attestation() {
  local expected_sha="${1:-}" validation
  validation="$(
    ATTESTATION_FILE="$GLOBAL_WRITER_ATTESTATION" \
    EXPECTED_PROJECT="$GCP_PROJECT_ID" \
    EXPECTED_CONNECTION="$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
    EXPECTED_STATE_SHA="$HISTORICAL_GKE_FREEZE_STATE_SHA256" \
    EXPECTED_BINDING="$GKE_BINDING_FINGERPRINT" \
    EXPECTED_NAMESPACE_SHA="$NAMESPACE_INVENTORY_SHA256" \
    EXPECTED_SHA="$expected_sha" \
    node - <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const raw = readFileSync(process.env.ATTESTATION_FILE);
const sha = createHash("sha256").update(raw).digest("hex");
if (process.env.EXPECTED_SHA && sha !== process.env.EXPECTED_SHA) throw new Error("Globaler Writer-Nachweis wurde ausgetauscht.");
const expected = [
  "FORMAT_VERSION=1",
  `GCP_PROJECT_ID=${process.env.EXPECTED_PROJECT}`,
  `CLOUD_SQL_INSTANCE_CONNECTION_NAME=${process.env.EXPECTED_CONNECTION}`,
  `GKE_STATE_SHA256=${process.env.EXPECTED_STATE_SHA}`,
  `GKE_BINDING_FINGERPRINT=${process.env.EXPECTED_BINDING}`,
  `NAMESPACE_INVENTORY_SHA256=${process.env.EXPECTED_NAMESPACE_SHA}`,
  "OTHER_NAMESPACES_DB_WRITERS=none",
  "EXTERNAL_DB_WRITERS=none"
];
const text = raw.toString("utf8");
if (!text.endsWith("\n")) throw new Error("Globaler Writer-Nachweis besitzt keinen finalen Zeilenumbruch.");
const lines = text.slice(0, -1).split("\n");
if (lines.length !== 9 || lines.slice(0, 8).some((line, index) => line !== expected[index])) {
  throw new Error("Globaler Writer-Nachweis ist nicht exakt an State, Binding und Namespace gebunden.");
}
const timestamp = /^ATTESTED_AT=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/u.exec(lines[8]);
if (!timestamp) throw new Error("Globaler Writer-Nachweis besitzt keinen kanonischen Zeitstempel.");
const age = Date.now() - Date.parse(timestamp[1]);
if (!Number.isFinite(age) || age < -30_000 || age > 10 * 60 * 1000) throw new Error("Globaler Writer-Nachweis ist nicht frisch.");
process.stdout.write(`${sha}\t${timestamp[1]}`);
NODE
  )" || die "Globaler Writer-Nachweis ist veraltet, ausgetauscht oder nicht exakt gebunden."
  printf '%s\n' "$validation"
}

if ! FIRST_FROZEN_EVIDENCE="$(read_frozen_writer_evidence)"; then
  die "Erster GKE-Frozen-Readback konnte nicht belastbar erhoben werden."
fi
IFS=$'\t' read -r FIRST_STATE_SHA FIRST_BINDING FIRST_GENERATION FIRST_NAMESPACE_SHA FIRST_READBACK_SHA \
  <<<"$FIRST_FROZEN_EVIDENCE"
if ! FIRST_GLOBAL_WRITER_EVIDENCE="$(validate_global_writer_attestation)"; then
  die "Frischer globaler Writer-Nachweis konnte nicht belastbar erhoben werden."
fi
IFS=$'\t' read -r GLOBAL_WRITER_ATTESTATION_SHA256 GLOBAL_WRITER_ATTESTED_AT \
  <<<"$FIRST_GLOBAL_WRITER_EVIDENCE"

PGSERVICE_FILE="$LIBPQ_DIR/pg_service.conf"
PGPASS_FILE="$LIBPQ_DIR/pgpass"
SOURCE_TARGET_FILE="$LIBPQ_DIR/source-target.conf"
expected_libpq_inventory="$(printf '%s\n' "$PGPASS_FILE" "$PGSERVICE_FILE" "$SOURCE_TARGET_FILE" | LC_ALL=C sort)"
actual_libpq_inventory="$(find "$LIBPQ_DIR" -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort)"
[[ "$actual_libpq_inventory" == "$expected_libpq_inventory" ]] \
  || die "LIBPQ_DIR muss genau pg_service.conf, pgpass und source-target.conf enthalten."
for libpq_file in "$PGSERVICE_FILE" "$PGPASS_FILE" "$SOURCE_TARGET_FILE"; do
  [[ -f "$libpq_file" && ! -L "$libpq_file" && "$(realpath "$libpq_file")" == "$libpq_file" ]] \
    || die "libpq-Datei fehlt, ist nicht kanonisch oder ist ein Symlink: $(basename -- "$libpq_file")"
  [[ "$(stat_uid "$libpq_file")" == "$current_uid" && "$(stat_mode "$libpq_file")" == "600" ]] \
    || die "libpq-Datei muss dem aufrufenden Nutzer gehoeren und Modus 0600 besitzen: $(basename -- "$libpq_file")"
done

awk -F= '
  NR == 1 { if ($0 != "FORMAT_VERSION=1") exit 1; next }
  NR == 2 { if ($1 != "GCP_PROJECT_ID" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/) exit 1; next }
  NR == 3 { if ($1 != "CLOUD_SQL_INSTANCE_CONNECTION_NAME" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]{0,96}[a-z0-9]$/) exit 1; next }
  NR == 4 { if ($1 != "CLOUD_SQL_DATABASE" || $2 != "versorgungs_kompass") exit 1; next }
  NR == 5 { if ($1 != "CLOUD_SQL_USER" || $2 !~ /^[a-z_][a-z0-9_]{0,62}$/) exit 1; next }
  { exit 1 }
  END { if (NR != 5) exit 1 }
' "$SOURCE_TARGET_FILE" || die "source-target.conf ist nicht der exakte Cloud-SQL-Sollvertrag."
[[ "$(awk -F= '$1 == "GCP_PROJECT_ID" { print $2 }' "$SOURCE_TARGET_FILE")" == "$GCP_PROJECT_ID" \
   && "$(awk -F= '$1 == "CLOUD_SQL_INSTANCE_CONNECTION_NAME" { print $2 }' "$SOURCE_TARGET_FILE")" == "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" ]] \
  || die "source-target.conf weicht vom Migrationspaket ab."
CLOUD_SQL_USER="$(awk -F= '$1 == "CLOUD_SQL_USER" { print $2 }' "$SOURCE_TARGET_FILE")"

awk -F= \
  -v expected_host="$CLOUD_SQL_SOCKET_DIR" \
  -v expected_database="$CLOUD_SQL_DATABASE" \
  -v expected_user="$CLOUD_SQL_USER" '
    NR == 1 { if ($0 != "[versorgungs-kompass-source]") exit 1; next }
    NR == 2 { if ($0 != "host=" expected_host) exit 1; next }
    NR == 3 { if ($0 != "port=5432") exit 1; next }
    NR == 4 { if ($0 != "dbname=" expected_database) exit 1; next }
    NR == 5 { if ($0 != "user=" expected_user) exit 1; next }
    NR == 6 { if ($0 != "sslmode=disable") exit 1; next }
    { exit 1 }
    END { if (NR != 6) exit 1 }
  ' "$PGSERVICE_FILE" || die "pg_service.conf zeigt nicht exakt auf den festen geprueften Quellservice."

active_project="$(gcloud config get-value project --quiet 2>/dev/null)" \
  || die "Aktives gcloud-Projekt konnte nicht gelesen werden."
[[ "$active_project" == "$GCP_PROJECT_ID" ]] \
  || die "Aktives gcloud-Projekt stimmt nicht mit dem Migrationspaket ueberein."
instance_json="$(gcloud sql instances describe "$CLOUD_SQL_INSTANCE_NAME" --project "$GCP_PROJECT_ID" --format=json --quiet)" \
  || die "Cloud-SQL-Instanz konnte nicht read-only bestaetigt werden."
GCP_PROJECT_ID="$GCP_PROJECT_ID" \
CLOUD_SQL_INSTANCE_CONNECTION_NAME="$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
node -e '
  const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (input.connectionName !== process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
      || input.project !== process.env.GCP_PROJECT_ID
      || input.databaseVersion !== "POSTGRES_16"
      || input.state !== "RUNNABLE") process.exit(1);
' <<<"$instance_json" \
  || die "Cloud-SQL-Readback passt nicht exakt zu Projekt, Connection Name, PostgreSQL 16 und RUNNABLE."

PSQL_BIN="$(canonical_command psql)"
ENV_BIN="$(type -P env)" || die "env ist nicht als ausfuehrbare Datei aufloesbar."
[[ "$ENV_BIN" == /* && -x "$ENV_BIN" ]] || die "env besitzt keinen absoluten ausfuehrbaren Programmpfad."
[[ "$("$ENV_BIN" -i LC_ALL=C "$PSQL_BIN" --version)" =~ PostgreSQL[^0-9]*16\. ]] \
  || die "psql muss aus PostgreSQL 16 stammen."

DATABASE_EVIDENCE_APPLICATION_NAME="vk-initial-open-source-writer-$$"
[[ "$DATABASE_EVIDENCE_APPLICATION_NAME" =~ ^[a-z0-9-]{1,63}$ ]] \
  || die "Interner Datenbank-Anwendungsname ist ungueltig."
run_libpq() {
  "$ENV_BIN" -i \
    LC_ALL=C \
    PGAPPNAME="$DATABASE_EVIDENCE_APPLICATION_NAME" \
    PGSERVICEFILE="$PGSERVICE_FILE" \
    PGPASSFILE="$PGPASS_FILE" \
    PGCONNECT_TIMEOUT=10 \
    "$@"
}

source_service='service=versorgungs-kompass-source'
server_version="$(run_libpq "$PSQL_BIN" --dbname="$source_service" --no-password --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='show server_version_num' | tr -d '[:space:]')"
[[ "$server_version" =~ ^16[0-9]{4}$ ]] || die "Quelldatenbank muss PostgreSQL 16 verwenden."
source_database="$(run_libpq "$PSQL_BIN" --dbname="$source_service" --no-password --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='select current_database()' | tr -d '[:space:]')"
[[ "$source_database" == "$CLOUD_SQL_DATABASE" ]] || die "libpq-Service zeigt nicht auf versorgungs_kompass."
other_sessions="$(run_libpq "$PSQL_BIN" \
  --dbname="$source_service" \
  --no-password --no-psqlrc --quiet --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 \
  --set="EXPECTED_APPLICATION_NAME=$DATABASE_EVIDENCE_APPLICATION_NAME" <<'SQL'
with other_clients as (
  select 1
    from pg_catalog.pg_stat_activity
   where backend_type = 'client backend'
     and pid <> pg_backend_pid()
)
select case
  when current_setting('application_name') = :'EXPECTED_APPLICATION_NAME'
   and count(*) = 0
  then '0'
  else 'blocked'
end
from other_clients;
SQL
)" || die "Cloud-SQL-Client-Sessions konnten nicht fail-closed inventarisiert werden."
[[ "$(tr -d '[:space:]' <<<"$other_sessions")" == "0" ]] \
  || die "Mindestens eine andere Cloud-SQL-Client-Session blockiert den Initial-Open-Nachweis."

if ! SECOND_FROZEN_EVIDENCE="$(read_frozen_writer_evidence)"; then
  die "Abschliessender GKE-Frozen-Readback konnte nicht belastbar erhoben werden."
fi
IFS=$'\t' read -r SECOND_STATE_SHA SECOND_BINDING SECOND_GENERATION SECOND_NAMESPACE_SHA SECOND_READBACK_SHA \
  <<<"$SECOND_FROZEN_EVIDENCE"
[[ "$SECOND_STATE_SHA" == "$FIRST_STATE_SHA" \
   && "$SECOND_BINDING" == "$FIRST_BINDING" \
   && "$SECOND_GENERATION" == "$FIRST_GENERATION" \
   && "$SECOND_NAMESPACE_SHA" == "$FIRST_NAMESPACE_SHA" \
   && "$SECOND_READBACK_SHA" == "$FIRST_READBACK_SHA" ]] \
  || die "GKE-Freeze-Readback driftete waehrend der Cloud-SQL-Pruefungen."
if ! FINAL_GLOBAL_WRITER_EVIDENCE="$(validate_global_writer_attestation "$GLOBAL_WRITER_ATTESTATION_SHA256")"; then
  die "Globaler Writer-Nachweis konnte nach den Cloud-SQL-Pruefungen nicht erneut bestaetigt werden."
fi
IFS=$'\t' read -r FINAL_GLOBAL_WRITER_SHA FINAL_GLOBAL_WRITER_ATTESTED_AT \
  <<<"$FINAL_GLOBAL_WRITER_EVIDENCE"
[[ "$FINAL_GLOBAL_WRITER_SHA" == "$GLOBAL_WRITER_ATTESTATION_SHA256" \
   && "$FINAL_GLOBAL_WRITER_ATTESTED_AT" == "$GLOBAL_WRITER_ATTESTED_AT" ]] \
  || die "Globaler Writer-Nachweis driftete waehrend der Cloud-SQL-Pruefungen."
[[ "$(sha256sum "$GKE_FREEZE_STATE_FILE" | awk '{print $1}')" == "$FIRST_STATE_SHA" ]] \
  || die "STATE_FILE driftete nach dem abschliessenden Frozen-Readback."

OBSERVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf -v PAYLOAD '%s\n' \
  'schemaVersion=1' \
  'evidenceKind=initial-open-source-writer' \
  "gateNonce=$GATE_NONCE" \
  "migrationPackageSha256=$MIGRATION_PACKAGE_SHA256" \
  "sourceDeployedRevision=$SOURCE_DEPLOYED_REVISION" \
  "targetRevision=$TARGET_REVISION" \
  "operatorRevision=$TARGET_REVISION" \
  "gcpProjectId=$GCP_PROJECT_ID" \
  "cloudSqlInstanceConnectionName=$CLOUD_SQL_INSTANCE_CONNECTION_NAME" \
  "cloudSqlDatabase=$CLOUD_SQL_DATABASE" \
  "gkeFreezeStateSha256=$FIRST_STATE_SHA" \
  "gkeBindingFingerprint=$FIRST_BINDING" \
  "frozenDeploymentGeneration=$FIRST_GENERATION" \
  "namespaceInventorySha256=$FIRST_NAMESPACE_SHA" \
  "freshGlobalWriterAttestationSha256=$GLOBAL_WRITER_ATTESTATION_SHA256" \
  "globalWriterAttestedAt=$GLOBAL_WRITER_ATTESTED_AT" \
  'gkeReplicas=0' \
  'gkeApiPods=0' \
  'foreignNamespaceDbWriterCandidates=0' \
  'otherNamespacesDbWriters=none' \
  'externalDbWriters=none' \
  'cloudSqlOtherClientSessions=0' \
  "observedAt=$OBSERVED_AT"

PAYLOAD="$PAYLOAD" node - "$SIGNING_KEY" "$OUTPUT_DIR" <<'NODE'
const {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} = require("node:fs");
const path = require("node:path");
const { createPrivateKey, createPublicKey, sign, verify } = require("node:crypto");

const signingKeyPath = process.argv[2];
const outputDirectory = process.argv[3];
const outputParent = path.dirname(outputDirectory);
const payload = Buffer.from(process.env.PAYLOAD || "", "utf8");
const payloadName = "initial-open-source-writer.attestation";
const signatureName = `${payloadName}.sig`;
let outputCreated = false;

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function writeDurable(file, contents) {
  const descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

try {
  if (payload.length === 0 || payload.at(-1) !== 0x0a) throw new Error("Payload besitzt keinen finalen Zeilenumbruch.");
  const signingKeyPem = readFileSync(signingKeyPath, "utf8");
  if (!signingKeyPem.startsWith("-----BEGIN PRIVATE KEY-----\n")
      || !(signingKeyPem.endsWith("\n-----END PRIVATE KEY-----\n")
        || signingKeyPem.endsWith("\n-----END PRIVATE KEY-----"))) {
    throw new Error("Signierschluessel ist kein kanonischer unverschluesselter PKCS#8-PEM-Schluessel.");
  }
  const privateKey = createPrivateKey(signingKeyPem);
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Signierschluessel ist kein privater Ed25519-PKCS#8-Schluessel.");
  }
  const signature = sign(null, payload, privateKey);
  if (signature.length !== 64 || !verify(null, payload, createPublicKey(privateKey), signature)) {
    throw new Error("Ed25519-Signatur konnte nicht lokal verifiziert werden.");
  }
  mkdirSync(outputDirectory, { mode: 0o700 });
  outputCreated = true;
  fsyncDirectory(outputParent);
  if (realpathSync(outputDirectory) !== outputDirectory || statSync(outputDirectory).mode & 0o077) {
    throw new Error("Exklusiv angelegtes Output-Verzeichnis ist nicht kanonisch geschuetzt.");
  }
  writeDurable(path.join(outputDirectory, payloadName), payload);
  writeDurable(path.join(outputDirectory, signatureName), signature);
  fsyncDirectory(outputDirectory);
  fsyncDirectory(outputParent);

  const inventory = readdirSync(outputDirectory).sort();
  if (JSON.stringify(inventory) !== JSON.stringify([payloadName, signatureName])) {
    throw new Error("Output-Inventar ist nach Publikation nicht exakt.");
  }
  for (const name of inventory) {
    const status = lstatSync(path.join(outputDirectory, name));
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600) {
      throw new Error("Output-Datei ist nicht regulaer oder nicht mit Modus 0600 geschuetzt.");
    }
  }
  const directoryStatus = lstatSync(outputDirectory);
  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink() || (directoryStatus.mode & 0o777) !== 0o700) {
    throw new Error("OUTPUT_DIR ist nach Publikation nicht mit Modus 0700 geschuetzt.");
  }
  if (!readFileSync(path.join(outputDirectory, payloadName)).equals(payload)
      || !verify(null, payload, createPublicKey(privateKey), readFileSync(path.join(outputDirectory, signatureName)))) {
    throw new Error("Publizierter Payload oder Signatur weicht vom geprueften Inhalt ab.");
  }
} catch (error) {
  const retained = outputCreated ? " Das exklusiv angelegte unvollstaendige Output-Verzeichnis bleibt fail-closed zur Sichtpruefung erhalten." : "";
  process.stderr.write(`FEHLER: Initial-Open-Nachweis konnte nicht sicher publiziert werden: ${error.message}.${retained}\n`);
  process.exit(1);
}
NODE

printf 'Initial-Open-Writer-Nachweis erfolgreich: %s\nMigrationspaket: %s\nZielrevision: %s\n' \
  "$OUTPUT_DIR" "$MIGRATION_PACKAGE_SHA256" "$TARGET_REVISION"
