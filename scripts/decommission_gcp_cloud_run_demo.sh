#!/usr/bin/env bash
set -euo pipefail

umask 077

PROJECT_ID=""
PROJECT_NUMBER=""
REGION="europe-west3"
ACTION="plan"
CONFIRMATION=""
EVIDENCE_DIR=""
EVIDENCE_URI=""
RETAIN_UNTIL=""
EXPECTED_MANIFEST_SHA256=""

EXPECTED_PROJECT_ID="steam-capsule-341212"
EXPECTED_PROJECT_NUMBER="765190393967"
EXPECTED_REGION="europe-west3"

LEGACY_SQL_INSTANCE="versorgungs-kompass-gcp-demo-db"
LEGACY_SQL_DATABASE="versorgungs_kompass"
LEGACY_SECRET="versorgungs-kompass-gcp-demo-db-password"
LEGACY_ARTIFACT_REPOSITORY="versorgungs-kompass"
LEGACY_IMAGE_BUCKET="versorgungs-kompass-gcp-demo-images-765190393967"
LEGACY_MIGRATION_BUCKET="versorgungs-kompass-migrations-765190393967"

PROTECTED_SQL_INSTANCE="vk-pre-gematik-postgres"
PROTECTED_GKE_CLUSTER="versorgungs-kompass-pre-gematik"
PAGES_DEMO_URL="https://timofrank.github.io/mitmachen/demo/"

CLOUD_RUN_SERVICES=(
  "versorgungs-kompass-api"
  "versorgungs-kompass-demo"
  "versorgungs-kompass-frontend"
  "versorgungs-kompass-gcp-demo"
)

LEGACY_BUCKETS=(
  "$LEGACY_IMAGE_BUCKET"
  "$LEGACY_MIGRATION_BUCKET"
)

usage() {
  cat <<'EOF'
Usage:
  # Read-only plan (default)
  scripts/decommission_gcp_cloud_run_demo.sh --project PROJECT_ID [--region REGION]

  # Backup and retention snapshot; does not take the services offline
  scripts/decommission_gcp_cloud_run_demo.sh --project PROJECT_ID --snapshot \
    --retain-until YYYY-MM-DD \
    --confirm PROJECT_ID:PROJECT_NUMBER:REGION:snapshot-cloud-run \
    [--evidence-dir PATH] [--evidence-uri gs://BUCKET/PREFIX]

  # Reversible shutdown; requires an approved snapshot manifest
  scripts/decommission_gcp_cloud_run_demo.sh --project PROJECT_ID --offline \
    --evidence-dir PATH --manifest-sha256 SHA256 \
    --confirm PROJECT_ID:PROJECT_NUMBER:REGION:offline-cloud-run

  # Read-only verification
  scripts/decommission_gcp_cloud_run_demo.sh --project PROJECT_ID --verify \
    [--evidence-dir PATH]

Actions are intentionally separate:
  plan      Read-only inventory. This is the default.
  snapshot  Export rollback evidence, create an on-demand SQL backup and a
            logical SQL export, and place temporary holds on legacy objects.
  offline   Clear revision tags, enable the invoker IAM check, remove public
            invoker grants, set Cloud Run manual scaling to 0, and stop the
            legacy Cloud SQL instance. It does not delete resources.
  verify    Check Cloud Run, SQL, legacy URLs, GKE, and the Pages demo without
            changing cloud resources.

There is deliberately no delete/purge action. Permanent deletion is a later,
separately approved change after the recorded retention date.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

set_action() {
  local requested_action="$1"
  if [[ "$ACTION" != "plan" ]]; then
    die "Only one of --snapshot, --offline, or --verify may be selected."
  fi
  ACTION="$requested_action"
}

while (($#)); do
  case "$1" in
    --project)
      [[ $# -ge 2 ]] || die "--project requires a value."
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      [[ $# -ge 2 ]] || die "--region requires a value."
      REGION="$2"
      shift 2
      ;;
    --snapshot)
      set_action "snapshot"
      shift
      ;;
    --offline)
      set_action "offline"
      shift
      ;;
    --verify)
      set_action "verify"
      shift
      ;;
    --confirm)
      [[ $# -ge 2 ]] || die "--confirm requires a value."
      CONFIRMATION="$2"
      shift 2
      ;;
    --evidence-dir)
      [[ $# -ge 2 ]] || die "--evidence-dir requires a value."
      EVIDENCE_DIR="$2"
      shift 2
      ;;
    --evidence-uri)
      [[ $# -ge 2 ]] || die "--evidence-uri requires a value."
      EVIDENCE_URI="${2%/}"
      shift 2
      ;;
    --retain-until)
      [[ $# -ge 2 ]] || die "--retain-until requires a value."
      RETAIN_UNTIL="$2"
      shift 2
      ;;
    --manifest-sha256)
      [[ $# -ge 2 ]] || die "--manifest-sha256 requires a value."
      EXPECTED_MANIFEST_SHA256="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --delete|--purge)
      die "Deletion is intentionally not implemented. Use the separate later deletion change."
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$PROJECT_ID" ]] || {
  echo "--project is required." >&2
  exit 2
}

for command_name in gcloud jq curl; do
  command -v "$command_name" >/dev/null 2>&1 || die "Required command is missing: $command_name"
done

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_COMMAND="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA256_COMMAND="shasum -a 256"
else
  die "Required SHA-256 utility is missing (sha256sum or shasum)."
fi

sha256_file() {
  # SHA256_COMMAND intentionally contains only the trusted command selected above.
  # shellcheck disable=SC2086
  $SHA256_COMMAND "$1" | awk '{print $1}'
}

utc_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

validate_project() {
  local resolved_project resolved_project_number
  resolved_project=$(gcloud projects describe "$PROJECT_ID" --format='value(projectId)')
  [[ "$resolved_project" == "$PROJECT_ID" ]] || die "Resolved project '$resolved_project' does not match '$PROJECT_ID'."
  resolved_project_number=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  [[ "$PROJECT_ID" == "$EXPECTED_PROJECT_ID" ]] \
    || die "This project-specific script only permits project $EXPECTED_PROJECT_ID."
  [[ "$resolved_project_number" == "$EXPECTED_PROJECT_NUMBER" ]] \
    || die "Project number does not match the fixed decommission scope."
  [[ "$REGION" == "$EXPECTED_REGION" ]] \
    || die "This project-specific script only permits region $EXPECTED_REGION."
  PROJECT_NUMBER="$resolved_project_number"
}

retention_epoch() {
  local parsed_date
  [[ "$RETAIN_UNTIL" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--retain-until must use YYYY-MM-DD."
  parsed_date=$(jq -nr --arg value "${RETAIN_UNTIL}T00:00:00Z" '$value | fromdateiso8601 | strftime("%Y-%m-%d")') \
    || die "Invalid retention date: $RETAIN_UNTIL"
  [[ "$parsed_date" == "$RETAIN_UNTIL" ]] || die "Invalid calendar date: $RETAIN_UNTIL"
  jq -nr --arg value "${RETAIN_UNTIL}T00:00:00Z" '$value | fromdateiso8601'
}

validate_retention_date() {
  local retain_epoch now_epoch minimum_epoch
  retain_epoch=$(retention_epoch)
  now_epoch=$(date -u +%s)
  minimum_epoch=$((now_epoch + 14 * 24 * 60 * 60))
  ((retain_epoch >= minimum_epoch)) || die "Retention must extend at least 14 days into the future."
}

validate_retention_not_expired() {
  local retain_epoch now_epoch
  retain_epoch=$(retention_epoch)
  now_epoch=$(date -u +%s)
  ((retain_epoch > now_epoch)) || die "The snapshot retention date has expired. A new decision is required."
}

validate_new_evidence_dir() {
  [[ -n "$EVIDENCE_DIR" ]] || {
    local evidence_timestamp
    evidence_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
    EVIDENCE_DIR=".gcp-decommission-evidence/$evidence_timestamp"
  }
  [[ "$EVIDENCE_DIR" != "/" && "$EVIDENCE_DIR" != "." ]] || die "Unsafe evidence directory: $EVIDENCE_DIR"
  [[ ! -e "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || die "Evidence directory already exists or is a symlink: $EVIDENCE_DIR"
  mkdir -m 700 -p "$EVIDENCE_DIR"
}

validate_existing_evidence_dir() {
  [[ -n "$EVIDENCE_DIR" ]] || die "--evidence-dir is required for the offline action."
  [[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || die "Evidence directory is missing or is a symlink: $EVIDENCE_DIR"
  [[ -f "$EVIDENCE_DIR/manifest.json" ]] || die "Missing evidence manifest: $EVIDENCE_DIR/manifest.json"
  [[ -f "$EVIDENCE_DIR/SNAPSHOT_READY.json" ]] || die "Snapshot is not marked ready: $EVIDENCE_DIR/SNAPSHOT_READY.json"
}

ensure_evidence_bucket_private() {
  local mode="$1" bucket_json bucket_policy
  bucket_json=$(gcloud storage buckets describe "gs://$LEGACY_MIGRATION_BUCKET" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot inspect the evidence bucket."

  if [[ "$mode" == "enforce" ]] \
    && ! jq -e '.public_access_prevention == "enforced"' <<<"$bucket_json" >/dev/null; then
    echo "Enforcing public access prevention on the private evidence bucket"
    gcloud storage buckets update "gs://$LEGACY_MIGRATION_BUCKET" \
      --project="$PROJECT_ID" \
      --public-access-prevention \
      --quiet
    bucket_json=$(gcloud storage buckets describe "gs://$LEGACY_MIGRATION_BUCKET" \
      --project="$PROJECT_ID" \
      --format=json)
  fi

  jq -e \
    --arg name "$LEGACY_MIGRATION_BUCKET" \
    '.name == $name
     and .uniform_bucket_level_access == true
     and .public_access_prevention == "enforced"' \
    <<<"$bucket_json" >/dev/null \
    || die "Evidence bucket must have UBLA and enforced public access prevention."

  bucket_policy=$(gcloud storage buckets get-iam-policy "gs://$LEGACY_MIGRATION_BUCKET" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot inspect evidence bucket IAM."
  jq -e '
    all(.bindings[]?;
      all(.members[]?; . != "allUsers" and . != "allAuthenticatedUsers")
    )
  ' <<<"$bucket_policy" >/dev/null \
    || die "Evidence bucket has a public IAM member."
}

assert_expected_services_present() {
  local inventory_file="$1"
  local service_name
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    jq -e --arg name "$service_name" 'any(.[]; .metadata.name == $name)' "$inventory_file" >/dev/null \
      || die "Expected Cloud Run service is missing from the inventory: $service_name"
  done
}

print_plan() {
  local service_name bucket_name

  echo "READ-ONLY DECOMMISSION PLAN"
  echo "Project: $PROJECT_ID"
  echo "Region:  $REGION"
  echo
  echo "All Cloud Run services in the selected region:"
  gcloud run services list \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='table(metadata.name:label=SERVICE,status.latestReadyRevisionName:label=REVISION,status.url:label=URL)'

  echo
  echo "Expected legacy services, access, and scaling:"
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json \
      | jq -r '
          [
            .metadata.name,
            (.metadata.annotations["run.googleapis.com/scalingMode"] // "auto"),
            (.metadata.annotations["run.googleapis.com/manualInstanceCount"] // "-"),
            .status.url
          ] | @tsv
        ' \
      | awk -F '\t' '{printf "  %-32s scaling=%-8s count=%-3s %s\n", $1, $2, $3, $4}'
    gcloud run services get-iam-policy "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json \
      | jq -r --arg service "$service_name" '
          [.bindings[]? | select(.role == "roles/run.invoker") | .members[]?] as $members
          | "  invokers: " + (if ($members | length) == 0 then "none at service level" else ($members | join(", ")) end)
        '
  done

  echo
  echo "Legacy Cloud SQL instance and recent backups:"
  gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='table(name:label=INSTANCE,state:label=STATE,settings.activationPolicy:label=ACTIVATION,settings.deletionProtectionEnabled:label=DELETION_PROTECTION,settings.backupConfiguration.backupRetentionSettings.retainedBackups:label=AUTOMATED_BACKUPS)'
  gcloud sql backups list \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --limit=8 \
    --sort-by='~endTime' \
    --format='table(id,status,type,endTime,description)'

  echo
  echo "Legacy storage inventory and protection:"
  for bucket_name in "${LEGACY_BUCKETS[@]}"; do
    gcloud storage buckets describe "gs://$bucket_name" \
      --project="$PROJECT_ID" \
      --format='yaml(name,location,soft_delete_policy,retention_policy,versioning_enabled,uniform_bucket_level_access,public_access_prevention)'
    gcloud storage ls --all-versions --long "gs://$bucket_name/**" --project="$PROJECT_ID"
  done

  echo
  echo "Legacy secret and Artifact Registry repository (metadata only):"
  gcloud secrets describe "$LEGACY_SECRET" \
    --project="$PROJECT_ID" \
    --format='table(name.basename():label=SECRET,createTime,replication.automatic:label=AUTOMATIC_REPLICATION)'
  gcloud artifacts repositories describe "$LEGACY_ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --format='table(name.basename():label=REPOSITORY,format,mode,cleanupPolicyDryRun,createTime)'

  echo
  echo "Known producer and routing checks:"
  gcloud run jobs list \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='table(metadata.name:label=CLOUD_RUN_JOB,status.latestCreatedExecution.name:label=LATEST_EXECUTION)'
  gcloud asset search-all-resources \
    --scope="projects/$PROJECT_ID" \
    --asset-types=run.googleapis.com/DomainMapping \
    --format='table(displayName:label=DOMAIN,location:label=LOCATION,additionalAttributes.routeName:label=SERVICE)'

  echo
  echo "Protected target resources (must remain unchanged):"
  gcloud container clusters list \
    --project="$PROJECT_ID" \
    --filter="name=$PROTECTED_GKE_CLUSTER" \
    --format='table(name,location,status,currentMasterVersion)'
  gcloud sql instances describe "$PROTECTED_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='table(name,state,settings.activationPolicy,settings.deletionProtectionEnabled)'

  echo
  echo "Planned mutations after a separately approved snapshot:"
  echo "  - Cloud Run: clear revision tags, require invoker IAM, remove public invokers, scaling=0"
  echo "  - Cloud SQL: keep deletion protection enabled, set activationPolicy=NEVER"
  echo "  - Data resources: no deletion; retained under an explicit not-before date"
  echo "  - Permanent deletion: unavailable in this script"
}

capture_inventory() {
  local target_dir="$1"
  local service_name bucket_name
  mkdir -m 700 -p \
    "$target_dir/project" \
    "$target_dir/cloud-run" \
    "$target_dir/cloud-sql" \
    "$target_dir/storage" \
    "$target_dir/secrets" \
    "$target_dir/artifact-registry" \
    "$target_dir/protected"

  gcloud projects describe "$PROJECT_ID" --format=json >"$target_dir/project/project.json"
  gcloud projects get-iam-policy "$PROJECT_ID" --format=json >"$target_dir/project/project.iam.json"

  gcloud run services list \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json >"$target_dir/cloud-run/services.json"
  assert_expected_services_present "$target_dir/cloud-run/services.json"

  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=export >"$target_dir/cloud-run/${service_name}.yaml"
    gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json >"$target_dir/cloud-run/${service_name}.json"
    gcloud run services get-iam-policy "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json >"$target_dir/cloud-run/${service_name}.iam.json"
    gcloud run revisions list \
      --service="$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json >"$target_dir/cloud-run/${service_name}.revisions.json"
  done

  gcloud run jobs list \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format=json >"$target_dir/cloud-run/jobs.json"
  gcloud asset search-all-resources \
    --scope="projects/$PROJECT_ID" \
    --asset-types=run.googleapis.com/DomainMapping \
    --format=json >"$target_dir/cloud-run/domain-mappings.json"

  gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/cloud-sql/${LEGACY_SQL_INSTANCE}.json"
  gcloud sql databases list \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/cloud-sql/databases.json"
  gcloud sql backups list \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/cloud-sql/backups.json"

  for bucket_name in "${LEGACY_BUCKETS[@]}"; do
    gcloud storage buckets describe "gs://$bucket_name" \
      --project="$PROJECT_ID" \
      --format=json >"$target_dir/storage/${bucket_name}.json"
    gcloud storage ls --all-versions --json "gs://$bucket_name/**" \
      --project="$PROJECT_ID" >"$target_dir/storage/${bucket_name}.objects.json"
    gcloud storage buckets get-iam-policy "gs://$bucket_name" \
      --project="$PROJECT_ID" \
      --format=json >"$target_dir/storage/${bucket_name}.iam.json"
  done

  gcloud secrets describe "$LEGACY_SECRET" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/secrets/${LEGACY_SECRET}.json"
  gcloud secrets versions list "$LEGACY_SECRET" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/secrets/${LEGACY_SECRET}.versions.json"
  gcloud secrets get-iam-policy "$LEGACY_SECRET" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/secrets/${LEGACY_SECRET}.iam.json"

  gcloud artifacts repositories describe "$LEGACY_ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --format=json >"$target_dir/artifact-registry/${LEGACY_ARTIFACT_REPOSITORY}.json"
  gcloud artifacts docker images list \
    "${REGION}-docker.pkg.dev/${PROJECT_ID}/${LEGACY_ARTIFACT_REPOSITORY}" \
    --include-tags \
    --format=json >"$target_dir/artifact-registry/images.json"

  gcloud container clusters list \
    --project="$PROJECT_ID" \
    --filter="name=$PROTECTED_GKE_CLUSTER" \
    --format=json >"$target_dir/protected/gke.json"
  gcloud sql instances describe "$PROTECTED_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/protected/${PROTECTED_SQL_INSTANCE}.json"
  gcloud compute network-endpoint-groups list \
    --project="$PROJECT_ID" \
    --filter='networkEndpointType=SERVERLESS' \
    --format=json >"$target_dir/protected/serverless-negs.json"
  gcloud compute url-maps list \
    --project="$PROJECT_ID" \
    --format=json >"$target_dir/protected/url-maps.json"
}

record_url_statuses() {
  local output_file="$1"
  local service_name url status
  : >"$output_file"
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    url=$(gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format='value(status.url)')
    status=$(curl --silent --show-error --output /dev/null --max-time 20 --write-out '%{http_code}' "$url" || true)
    printf '%s\t%s\t%s\n' "$service_name" "$status" "$url" >>"$output_file"
  done
  status=$(curl --silent --show-error --location --output /dev/null --max-time 20 --write-out '%{http_code}' "$PAGES_DEMO_URL" || true)
  printf '%s\t%s\t%s\n' "github-pages-demo" "$status" "$PAGES_DEMO_URL" >>"$output_file"
}

hold_inventory_objects() {
  local snapshot_dir="$1"
  local bucket_name object_list
  for bucket_name in "${LEGACY_BUCKETS[@]}"; do
    object_list="$snapshot_dir/storage/${bucket_name}.live-object-urls.txt"
    jq -r '.[] | select(.type == "cloud_object") | .url' \
      "$snapshot_dir/storage/${bucket_name}.objects.json" >"$object_list"
    if [[ -s "$object_list" ]]; then
      gcloud storage objects update \
        --read-paths-from-stdin \
        --temporary-hold \
        --project="$PROJECT_ID" \
        --quiet <"$object_list"
    fi
  done
}

write_checksums() {
  local root_dir="$1"
  local checksums_file="$root_dir/SHA256SUMS"
  : >"$checksums_file"
  while IFS= read -r relative_file; do
    printf '%s  %s\n' "$(sha256_file "$root_dir/$relative_file")" "$relative_file" >>"$checksums_file"
  done < <(
    cd "$root_dir"
    find . -type f ! -name SHA256SUMS -print | sed 's#^./##' | LC_ALL=C sort
  )
}

verify_checksums() {
  local root_dir="$1"
  [[ -f "$root_dir/SHA256SUMS" ]] || die "Missing checksum inventory: $root_dir/SHA256SUMS"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$root_dir" && sha256sum --check SHA256SUMS >/dev/null) \
      || die "Checksum verification failed below $root_dir."
  else
    (cd "$root_dir" && shasum -a 256 --check SHA256SUMS >/dev/null) \
      || die "Checksum verification failed below $root_dir."
  fi
}

sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

verify_held_object_integrity() {
  local object_uri="$1" generation="$2" size="$3" crc32c="$4" md5="$5"
  local qualified_uri live_object_json
  [[ -n "$generation" && -n "$size" && -n "$crc32c" ]] \
    || die "Incomplete integrity metadata for retained object: $object_uri"
  qualified_uri="${object_uri}#${generation}"
  live_object_json=$(gcloud storage objects describe "$qualified_uri" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot inspect retained object generation: $qualified_uri"
  jq -e \
    --arg generation "$generation" \
    --arg size "$size" \
    --arg crc32c "$crc32c" \
    --arg md5 "$md5" \
    '
      (((.generation // .metadata.generation) | tostring) == $generation)
      and (((.size // .metadata.size) | tostring) == $size)
      and ((.crc32c_hash // .crc32c // .metadata.crc32c) == $crc32c)
      and ($md5 == "" or (.md5_hash // .md5Hash // .metadata.md5Hash) == $md5)
      and (.temporary_hold == true or .temporaryHold == true or .metadata.temporaryHold == true)
    ' <<<"$live_object_json" >/dev/null \
    || die "Retained object changed or lost its temporary hold: $qualified_uri"
}

verify_remote_prefix_held() {
  local remote_prefix="$1" objects_json object_count
  objects_json=$(gcloud storage ls --all-versions --json "${remote_prefix}/**" \
    --project="$PROJECT_ID") || die "Cannot inspect archived evidence prefix: $remote_prefix"
  object_count=$(jq '[.[] | select(.type == "cloud_object")] | length' <<<"$objects_json")
  ((object_count > 0)) || die "Archived evidence prefix is empty: $remote_prefix"
  jq -e '
    all(.[] | select(.type == "cloud_object");
      .metadata.temporaryHold == true or .temporary_hold == true or .temporaryHold == true
    )
  ' <<<"$objects_json" >/dev/null \
    || die "An archived evidence object lacks its temporary hold: $remote_prefix"
}

verify_remote_object_matches_local() {
  local remote_uri="$1" local_file="$2" local_sha256 remote_sha256
  [[ -f "$local_file" ]] || die "Missing local evidence object: $local_file"
  local_sha256=$(sha256_file "$local_file")
  remote_sha256=$(gcloud storage cat "$remote_uri" \
    --project="$PROJECT_ID" | sha256_stdin) \
    || die "Cannot hash archived evidence object: $remote_uri"
  [[ "$remote_sha256" == "$local_sha256" ]] \
    || die "Archived evidence differs from its checksummed local copy: $remote_uri"
  gcloud storage objects describe "$remote_uri" \
    --project="$PROJECT_ID" \
    --format=json \
    | jq -e '.temporary_hold == true or .temporaryHold == true or .metadata.temporaryHold == true' >/dev/null \
    || die "Archived evidence object is not held: $remote_uri"
}

hold_remote_prefix() {
  local remote_prefix="$1"
  gcloud storage ls --json "${remote_prefix}/**" \
    --project="$PROJECT_ID" \
    | jq -r '.[] | select(.type == "cloud_object") | .url' \
    | gcloud storage objects update \
        --read-paths-from-stdin \
        --temporary-hold \
        --project="$PROJECT_ID" \
        --quiet
}

snapshot_action() {
  local expected_confirmation snapshot_timestamp snapshot_dir project_number
  local backup_description backup_id sql_export_uri manifest_sha256 archive_snapshot_uri manifest_temp_file
  local source_objects_json inventory_sha256
  local sql_export_generation sql_export_size sql_export_crc32c sql_export_md5
  local initial_snapshot_sql_policy snapshot_started_sql="false"

  expected_confirmation="${PROJECT_ID}:${PROJECT_NUMBER}:${REGION}:snapshot-cloud-run"
  [[ "$CONFIRMATION" == "$expected_confirmation" ]] || {
    echo "Snapshot action refused." >&2
    echo "Repeat with: --confirm $expected_confirmation" >&2
    exit 2
  }
  [[ -n "$RETAIN_UNTIL" ]] || die "--retain-until is required for the snapshot action."
  validate_retention_date
  validate_new_evidence_dir

  snapshot_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  snapshot_dir="$EVIDENCE_DIR/pre"
  project_number="$PROJECT_NUMBER"
  if [[ -z "$EVIDENCE_URI" ]]; then
    EVIDENCE_URI="gs://${LEGACY_MIGRATION_BUCKET}/decommission/${snapshot_timestamp}"
  fi
  [[ "$EVIDENCE_URI" == gs://* ]] || die "--evidence-uri must be a gs:// URI."
  [[ "$EVIDENCE_URI" == "gs://${LEGACY_MIGRATION_BUCKET}/"* ]] \
    || die "Evidence must be stored in the allowlisted private migration bucket."
  ensure_evidence_bucket_private "enforce"

  mkdir -m 700 -p "$snapshot_dir"
  echo "Capturing pre-change inventory in $snapshot_dir"
  capture_inventory "$snapshot_dir"
  record_url_statuses "$snapshot_dir/url-status-before.tsv"

  source_objects_json=$(jq -s '
    [
      .[][]
      | select(.type == "cloud_object")
      | {
          bucket: .metadata.bucket,
          name: .metadata.name,
          generation: (.metadata.generation | tostring),
          size: (.metadata.size | tostring),
          crc32c: .metadata.crc32c,
          md5Hash: (.metadata.md5Hash // null),
          url: .url
        }
    ] | sort_by(.bucket, .name, .generation)
  ' \
    "$snapshot_dir/storage/${LEGACY_IMAGE_BUCKET}.objects.json" \
    "$snapshot_dir/storage/${LEGACY_MIGRATION_BUCKET}.objects.json")

  jq -n \
    --arg schemaVersion "2" \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$project_number" \
    --arg region "$REGION" \
    --arg createdAt "$(utc_now)" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg evidenceUri "$EVIDENCE_URI" \
    --arg sqlInstance "$LEGACY_SQL_INSTANCE" \
    --arg sqlDatabase "$LEGACY_SQL_DATABASE" \
    --arg imageBucket "$LEGACY_IMAGE_BUCKET" \
    --arg migrationBucket "$LEGACY_MIGRATION_BUCKET" \
    --arg secret "$LEGACY_SECRET" \
    --arg artifactRepository "$LEGACY_ARTIFACT_REPOSITORY" \
    --arg protectedSql "$PROTECTED_SQL_INSTANCE" \
    --arg protectedGke "$PROTECTED_GKE_CLUSTER" \
    --argjson services "$(printf '%s\n' "${CLOUD_RUN_SERVICES[@]}" | jq -R . | jq -s .)" \
    --argjson sourceObjects "$source_objects_json" \
    '{
      schemaVersion: $schemaVersion,
      projectId: $projectId,
      projectNumber: $projectNumber,
      region: $region,
      createdAt: $createdAt,
      retainUntil: $retainUntil,
      evidenceUri: $evidenceUri,
      scope: {
        cloudRunServices: $services,
        sqlInstance: $sqlInstance,
        sqlDatabase: $sqlDatabase,
        buckets: [$imageBucket, $migrationBucket],
        secret: $secret,
        artifactRepository: $artifactRepository,
        sourceObjects: $sourceObjects
      },
      protected: {
        sqlInstance: $protectedSql,
        gkeCluster: $protectedGke
      },
      deletionAuthorized: false
    }' >"$EVIDENCE_DIR/manifest.json"

  initial_snapshot_sql_policy=$(jq -r '.settings.activationPolicy' \
    "$snapshot_dir/cloud-sql/${LEGACY_SQL_INSTANCE}.json")
  if [[ "$initial_snapshot_sql_policy" != "ALWAYS" ]]; then
    echo "Temporarily starting stopped legacy SQL for the approved snapshot"
    arm_final_snapshot_cleanup
    snapshot_started_sql="true"
  fi
  transition_legacy_sql_activation "ALWAYS" "RUNNABLE"

  echo "Creating fresh on-demand Cloud SQL backup"
  backup_description="cloud-run-decommission-${snapshot_timestamp}-retain-until-${RETAIN_UNTIL}"
  gcloud sql backups create \
    --instance="$LEGACY_SQL_INSTANCE" \
    --description="$backup_description" \
    --project="$PROJECT_ID" \
    --quiet \
    --format=json >"$snapshot_dir/cloud-sql/backup-create.json"

  gcloud sql backups list \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --filter="description=$backup_description AND status=SUCCESSFUL" \
    --sort-by='~endTime' \
    --limit=1 \
    --format=json >"$snapshot_dir/cloud-sql/decommission-backup.json"
  backup_id=$(jq -r '.[0].id // empty' "$snapshot_dir/cloud-sql/decommission-backup.json")
  [[ -n "$backup_id" ]] || die "The on-demand backup was not found with SUCCESSFUL status."

  sql_export_uri="${EVIDENCE_URI}/sql/${LEGACY_SQL_DATABASE}-${snapshot_timestamp}.sql.gz"
  echo "Creating portable SQL export at $sql_export_uri"
  gcloud sql export sql "$LEGACY_SQL_INSTANCE" "$sql_export_uri" \
    --database="$LEGACY_SQL_DATABASE" \
    --project="$PROJECT_ID" \
    --quiet
  gcloud storage objects update "$sql_export_uri" \
    --temporary-hold \
    --project="$PROJECT_ID" \
    --quiet
  gcloud storage objects describe "$sql_export_uri" \
    --project="$PROJECT_ID" \
    --format=json >"$snapshot_dir/cloud-sql/sql-export-object.json"
  sql_export_generation=$(jq -r '.generation // .metadata.generation // empty' \
    "$snapshot_dir/cloud-sql/sql-export-object.json")
  sql_export_size=$(jq -r '(.size // .metadata.size // empty) | tostring' \
    "$snapshot_dir/cloud-sql/sql-export-object.json")
  sql_export_crc32c=$(jq -r '.crc32c_hash // .crc32c // .metadata.crc32c // empty' \
    "$snapshot_dir/cloud-sql/sql-export-object.json")
  sql_export_md5=$(jq -r '.md5_hash // .md5Hash // .metadata.md5Hash // ""' \
    "$snapshot_dir/cloud-sql/sql-export-object.json")
  verify_held_object_integrity "$sql_export_uri" "$sql_export_generation" \
    "$sql_export_size" "$sql_export_crc32c" "$sql_export_md5"

  echo "Applying temporary holds to the six inventoried legacy objects"
  hold_inventory_objects "$snapshot_dir"

  if ! jq -e '.settings.deletionProtectionEnabled == true' \
    "$snapshot_dir/cloud-sql/${LEGACY_SQL_INSTANCE}.json" >/dev/null; then
    echo "Enabling Cloud SQL deletion protection"
    gcloud sql instances patch "$LEGACY_SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --deletion-protection \
      --quiet
  fi

  if [[ "$snapshot_started_sql" == "true" ]]; then
    echo "Restoring the pre-snapshot stopped state of legacy SQL"
    transition_legacy_sql_activation "NEVER" "STOPPED"
    disarm_final_snapshot_cleanup
  fi

  jq -n \
    --arg backupId "$backup_id" \
    --arg backupDescription "$backup_description" \
    --arg sqlExportUri "$sql_export_uri" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg createdAt "$(utc_now)" \
    '{
      backupId: $backupId,
      backupDescription: $backupDescription,
      sqlExportUri: $sqlExportUri,
      retainUntil: $retainUntil,
      createdAt: $createdAt,
      objectProtection: "temporary-hold",
      cloudSqlDeletionProtection: true
    }' >"$snapshot_dir/retention.json"

  write_checksums "$snapshot_dir"
  inventory_sha256=$(sha256_file "$snapshot_dir/SHA256SUMS")

  manifest_temp_file="$EVIDENCE_DIR/manifest.json.tmp"
  jq \
    --arg backupId "$backup_id" \
    --arg backupDescription "$backup_description" \
    --arg sqlExportUri "$sql_export_uri" \
    --arg sqlExportGeneration "$sql_export_generation" \
    --arg sqlExportSize "$sql_export_size" \
    --arg sqlExportCrc32c "$sql_export_crc32c" \
    --arg sqlExportMd5 "$sql_export_md5" \
    --arg inventorySha256 "$inventory_sha256" \
    '.snapshot = {
      backupId: $backupId,
      backupDescription: $backupDescription,
      sqlExportUri: $sqlExportUri,
      sqlExport: {
        uri: $sqlExportUri,
        generation: $sqlExportGeneration,
        size: $sqlExportSize,
        crc32c: $sqlExportCrc32c,
        md5Hash: $sqlExportMd5
      },
      objectProtection: "temporary-hold",
      cloudSqlDeletionProtection: true
    }
    | .inventory = {
        checksumFile: "pre/SHA256SUMS",
        sha256: $inventorySha256
      }' "$EVIDENCE_DIR/manifest.json" >"$manifest_temp_file"
  mv "$manifest_temp_file" "$EVIDENCE_DIR/manifest.json"

  manifest_sha256=$(sha256_file "$EVIDENCE_DIR/manifest.json")
  jq -n \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg readyAt "$(utc_now)" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg evidenceUri "$EVIDENCE_URI" \
    --arg manifestSha256 "$manifest_sha256" \
    --arg backupId "$backup_id" \
    --arg sqlExportUri "$sql_export_uri" \
    --arg sqlExportGeneration "$sql_export_generation" \
    --arg sqlExportSize "$sql_export_size" \
    --arg sqlExportCrc32c "$sql_export_crc32c" \
    --arg sqlExportMd5 "$sql_export_md5" \
    '{
      projectId: $projectId,
      projectNumber: $projectNumber,
      region: $region,
      readyAt: $readyAt,
      retainUntil: $retainUntil,
      evidenceUri: $evidenceUri,
      manifestSha256: $manifestSha256,
      backupId: $backupId,
      sqlExportUri: $sqlExportUri,
      sqlExportGeneration: $sqlExportGeneration,
      sqlExportSize: $sqlExportSize,
      sqlExportCrc32c: $sqlExportCrc32c,
      sqlExportMd5: $sqlExportMd5,
      approvedForDeletion: false
    }' >"$EVIDENCE_DIR/SNAPSHOT_READY.json"
  write_checksums "$EVIDENCE_DIR"

  archive_snapshot_uri="${EVIDENCE_URI}/pre"
  echo "Uploading protected evidence to $archive_snapshot_uri"
  gcloud storage rsync "$EVIDENCE_DIR" "$archive_snapshot_uri" \
    --recursive \
    --project="$PROJECT_ID"
  hold_remote_prefix "$archive_snapshot_uri"

  echo
  echo "SNAPSHOT READY"
  echo "Evidence directory: $EVIDENCE_DIR"
  echo "Evidence archive:   $archive_snapshot_uri"
  echo "Retention not before: $RETAIN_UNTIL"
  echo "Cloud SQL backup ID:  $backup_id"
  echo "Portable SQL export:  $sql_export_uri"
  echo "Manifest SHA-256:      $manifest_sha256"
  echo "No service was taken offline and no resource was deleted."
}

verify_snapshot_gate() {
  local actual_manifest_sha256 backup_id backup_description sql_export_uri schema_version
  local expected_services_json expected_buckets_json inventory_sha256 expected_inventory_sha256
  local sql_export_generation sql_export_size sql_export_crc32c sql_export_md5 archive_snapshot_uri
  local source_object object_url object_bucket object_name object_generation object_size object_crc32c object_md5
  local live_object_json

  validate_existing_evidence_dir
  [[ "$EXPECTED_MANIFEST_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] \
    || die "--manifest-sha256 must be a 64-character SHA-256 value."
  actual_manifest_sha256=$(sha256_file "$EVIDENCE_DIR/manifest.json")
  actual_manifest_sha256=$(printf '%s' "$actual_manifest_sha256" | tr '[:upper:]' '[:lower:]')
  EXPECTED_MANIFEST_SHA256=$(printf '%s' "$EXPECTED_MANIFEST_SHA256" | tr '[:upper:]' '[:lower:]')
  [[ "$actual_manifest_sha256" == "$EXPECTED_MANIFEST_SHA256" ]] \
    || die "Manifest SHA-256 mismatch."

  schema_version=$(jq -r '.schemaVersion' "$EVIDENCE_DIR/manifest.json")
  [[ "$schema_version" == "2" ]] \
    || die "Offline mutation requires evidence manifest schema 2; create a fresh snapshot instead of reusing legacy evidence."

  expected_services_json=$(printf '%s\n' "${CLOUD_RUN_SERVICES[@]}" | jq -R . | jq -s .)
  expected_buckets_json=$(printf '%s\n' "${LEGACY_BUCKETS[@]}" | jq -R . | jq -s .)
  jq -e \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg sqlInstance "$LEGACY_SQL_INSTANCE" \
    --arg sqlDatabase "$LEGACY_SQL_DATABASE" \
    --arg secret "$LEGACY_SECRET" \
    --arg artifactRepository "$LEGACY_ARTIFACT_REPOSITORY" \
    --arg protectedSql "$PROTECTED_SQL_INSTANCE" \
    --arg protectedGke "$PROTECTED_GKE_CLUSTER" \
    --argjson services "$expected_services_json" \
    --argjson buckets "$expected_buckets_json" \
    '
      .schemaVersion == "2"
      and .projectId == $projectId
      and .projectNumber == $projectNumber
      and .region == $region
      and (.scope.cloudRunServices | sort) == ($services | sort)
      and .scope.sqlInstance == $sqlInstance
      and .scope.sqlDatabase == $sqlDatabase
      and (.scope.buckets | sort) == ($buckets | sort)
      and .scope.secret == $secret
      and .scope.artifactRepository == $artifactRepository
      and (.scope.sourceObjects | type) == "array"
      and all(.scope.sourceObjects[];
        (.bucket == $buckets[0] or .bucket == $buckets[1])
        and (.name | type) == "string"
        and (.generation | type) == "string"
        and (.size | type) == "string"
        and (.crc32c | type) == "string"
        and (.url | type) == "string"
      )
      and .protected.sqlInstance == $protectedSql
      and .protected.gkeCluster == $protectedGke
      and .deletionAuthorized == false
      and .snapshot.objectProtection == "temporary-hold"
      and .snapshot.cloudSqlDeletionProtection == true
      and .snapshot.sqlExport.uri == .snapshot.sqlExportUri
      and (.snapshot.sqlExport.generation | type) == "string"
      and (.snapshot.sqlExport.size | type) == "string"
      and (.snapshot.sqlExport.crc32c | type) == "string"
      and (.snapshot.sqlExport.md5Hash | type) == "string"
      and .inventory.checksumFile == "pre/SHA256SUMS"
    ' "$EVIDENCE_DIR/manifest.json" >/dev/null \
    || die "The approved manifest does not exactly match the fixed decommission scope."

  RETAIN_UNTIL=$(jq -r '.retainUntil' "$EVIDENCE_DIR/manifest.json")
  EVIDENCE_URI=$(jq -r '.evidenceUri' "$EVIDENCE_DIR/manifest.json")
  backup_id=$(jq -r '.snapshot.backupId' "$EVIDENCE_DIR/manifest.json")
  backup_description=$(jq -r '.snapshot.backupDescription' "$EVIDENCE_DIR/manifest.json")
  sql_export_uri=$(jq -r '.snapshot.sqlExportUri' "$EVIDENCE_DIR/manifest.json")
  sql_export_generation=$(jq -r '.snapshot.sqlExport.generation' "$EVIDENCE_DIR/manifest.json")
  sql_export_size=$(jq -r '.snapshot.sqlExport.size' "$EVIDENCE_DIR/manifest.json")
  sql_export_crc32c=$(jq -r '.snapshot.sqlExport.crc32c' "$EVIDENCE_DIR/manifest.json")
  sql_export_md5=$(jq -r '.snapshot.sqlExport.md5Hash' "$EVIDENCE_DIR/manifest.json")
  validate_retention_not_expired
  [[ "$EVIDENCE_URI" == "gs://${LEGACY_MIGRATION_BUCKET}/decommission/"* ]] \
    || die "The manifest evidence URI is outside the allowlisted decommission prefix."
  [[ "$sql_export_uri" == "${EVIDENCE_URI}/sql/"* ]] \
    || die "The manifest SQL export URI is outside its evidence prefix."
  ensure_evidence_bucket_private "assert"

  jq -e \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg evidenceUri "$EVIDENCE_URI" \
    --arg manifestSha256 "$EXPECTED_MANIFEST_SHA256" \
    --arg backupId "$backup_id" \
    --arg sqlExportUri "$sql_export_uri" \
    --arg sqlExportGeneration "$sql_export_generation" \
    --arg sqlExportSize "$sql_export_size" \
    --arg sqlExportCrc32c "$sql_export_crc32c" \
    --arg sqlExportMd5 "$sql_export_md5" \
    '
      .projectId == $projectId
      and .projectNumber == $projectNumber
      and .region == $region
      and .retainUntil == $retainUntil
      and .evidenceUri == $evidenceUri
      and (.manifestSha256 | ascii_downcase) == $manifestSha256
      and .backupId == $backupId
      and .sqlExportUri == $sqlExportUri
      and .sqlExportGeneration == $sqlExportGeneration
      and .sqlExportSize == $sqlExportSize
      and .sqlExportCrc32c == $sqlExportCrc32c
      and .sqlExportMd5 == $sqlExportMd5
      and .approvedForDeletion == false
    ' "$EVIDENCE_DIR/SNAPSHOT_READY.json" >/dev/null \
    || die "SNAPSHOT_READY.json does not match the approved manifest."

  expected_inventory_sha256=$(jq -r '.inventory.sha256' "$EVIDENCE_DIR/manifest.json")
  [[ "$expected_inventory_sha256" =~ ^[0-9a-f]{64}$ ]] \
    || die "The manifest inventory checksum is invalid."
  inventory_sha256=$(sha256_file "$EVIDENCE_DIR/pre/SHA256SUMS")
  [[ "$inventory_sha256" == "$expected_inventory_sha256" ]] \
    || die "The inventory checksum file does not match the approved manifest."
  verify_checksums "$EVIDENCE_DIR/pre"
  verify_checksums "$EVIDENCE_DIR"

  archive_snapshot_uri="${EVIDENCE_URI}/pre"
  verify_remote_prefix_held "$archive_snapshot_uri"
  verify_remote_object_matches_local "${archive_snapshot_uri}/manifest.json" "$EVIDENCE_DIR/manifest.json"
  verify_remote_object_matches_local "${archive_snapshot_uri}/SNAPSHOT_READY.json" "$EVIDENCE_DIR/SNAPSHOT_READY.json"
  verify_remote_object_matches_local \
    "${archive_snapshot_uri}/pre/cloud-sql/sql-export-object.json" \
    "$EVIDENCE_DIR/pre/cloud-sql/sql-export-object.json"
  if [[ -f "$EVIDENCE_DIR/pre/SHA256SUMS" ]]; then
    verify_checksums "$EVIDENCE_DIR/pre"
    verify_remote_object_matches_local "${archive_snapshot_uri}/pre/SHA256SUMS" \
      "$EVIDENCE_DIR/pre/SHA256SUMS"
  fi
  verify_remote_object_matches_local "${archive_snapshot_uri}/pre/SHA256SUMS" \
    "$EVIDENCE_DIR/pre/SHA256SUMS"

  gcloud sql backups describe "$backup_id" \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json \
    | jq -e --arg description "$backup_description" \
        '.status == "SUCCESSFUL" and .description == $description' >/dev/null \
    || die "The recorded Cloud SQL backup is not successful."
  verify_held_object_integrity "$sql_export_uri" "$sql_export_generation" \
    "$sql_export_size" "$sql_export_crc32c" "$sql_export_md5"

  while IFS= read -r source_object; do
    object_url=$(jq -r '.url' <<<"$source_object")
    object_bucket=$(jq -r '.bucket' <<<"$source_object")
    object_name=$(jq -r '.name' <<<"$source_object")
    object_generation=$(jq -r '.generation' <<<"$source_object")
    object_size=$(jq -r '.size' <<<"$source_object")
    object_crc32c=$(jq -r '.crc32c' <<<"$source_object")
    object_md5=$(jq -r '.md5Hash // ""' <<<"$source_object")
    [[ "$object_url" == "gs://${object_bucket}/${object_name}#${object_generation}" ]] \
      || die "A source object URI is inconsistent with its manifest fields."
    live_object_json=$(gcloud storage objects describe "$object_url" \
      --project="$PROJECT_ID" \
      --format=json) || die "Cannot inspect retained source object: $object_url"
    jq -e \
      --arg generation "$object_generation" \
      --arg size "$object_size" \
      --arg crc32c "$object_crc32c" \
      --arg md5 "$object_md5" \
      '
        (((.generation // .metadata.generation) | tostring) == $generation)
        and (((.size // .metadata.size) | tostring) == $size)
        and ((.crc32c_hash // .crc32c // .metadata.crc32c) == $crc32c)
        and ($md5 == "" or (.md5_hash // .md5Hash // .metadata.md5Hash) == $md5)
        and (.temporary_hold == true or .temporaryHold == true or .metadata.temporaryHold == true)
      ' <<<"$live_object_json" >/dev/null \
      || die "Retained source object changed or lost its temporary hold: $object_url"
  done < <(jq -c '.scope.sourceObjects[]' "$EVIDENCE_DIR/manifest.json")

  gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json \
    | jq -e '.settings.deletionProtectionEnabled == true' >/dev/null \
    || die "Cloud SQL deletion protection is not enabled."
}

verify_completed_evidence() {
  local actual_manifest_sha256 recorded_manifest_sha256 schema_version backup_id sql_export_uri
  local final_backup_id final_export_uri
  local expected_services_json expected_buckets_json
  local sql_export_generation sql_export_size sql_export_crc32c sql_export_md5
  local final_export_generation final_export_size final_export_crc32c final_export_md5
  local initial_export_metadata_file final_export_metadata_file final_archive_uri final_evidence_dir
  local archive_snapshot_uri final_relative_path final_timestamp

  validate_existing_evidence_dir
  verify_checksums "$EVIDENCE_DIR"

  actual_manifest_sha256=$(sha256_file "$EVIDENCE_DIR/manifest.json")
  recorded_manifest_sha256=$(jq -r '.manifestSha256 | ascii_downcase' "$EVIDENCE_DIR/SNAPSHOT_READY.json")
  [[ "$actual_manifest_sha256" == "$recorded_manifest_sha256" ]] \
    || die "Recorded evidence manifest SHA-256 does not match."

  expected_services_json=$(printf '%s\n' "${CLOUD_RUN_SERVICES[@]}" | jq -R . | jq -s .)
  expected_buckets_json=$(printf '%s\n' "${LEGACY_BUCKETS[@]}" | jq -R . | jq -s .)
  jq -e \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg sqlInstance "$LEGACY_SQL_INSTANCE" \
    --arg sqlDatabase "$LEGACY_SQL_DATABASE" \
    --arg secret "$LEGACY_SECRET" \
    --arg artifactRepository "$LEGACY_ARTIFACT_REPOSITORY" \
    --arg protectedSql "$PROTECTED_SQL_INSTANCE" \
    --arg protectedGke "$PROTECTED_GKE_CLUSTER" \
    --argjson services "$expected_services_json" \
    --argjson buckets "$expected_buckets_json" \
    '
      (.schemaVersion == "1" or .schemaVersion == "2")
      and .projectId == $projectId
      and .projectNumber == $projectNumber
      and .region == $region
      and (.scope.cloudRunServices | sort) == ($services | sort)
      and .scope.sqlInstance == $sqlInstance
      and .scope.sqlDatabase == $sqlDatabase
      and (.scope.buckets | sort) == ($buckets | sort)
      and .scope.secret == $secret
      and .scope.artifactRepository == $artifactRepository
      and .protected.sqlInstance == $protectedSql
      and .protected.gkeCluster == $protectedGke
      and .deletionAuthorized == false
    ' "$EVIDENCE_DIR/manifest.json" >/dev/null \
    || die "Recorded evidence is outside the fixed decommission scope."

  RETAIN_UNTIL=$(jq -r '.retainUntil' "$EVIDENCE_DIR/manifest.json")
  EVIDENCE_URI=$(jq -r '.evidenceUri' "$EVIDENCE_DIR/manifest.json")
  retention_epoch >/dev/null
  [[ "$EVIDENCE_URI" == "gs://${LEGACY_MIGRATION_BUCKET}/decommission/"* ]] \
    || die "Recorded evidence is outside the allowlisted decommission prefix."
  ensure_evidence_bucket_private "assert"

  archive_snapshot_uri="${EVIDENCE_URI}/pre"
  verify_remote_prefix_held "$archive_snapshot_uri"
  verify_remote_object_matches_local "${archive_snapshot_uri}/manifest.json" "$EVIDENCE_DIR/manifest.json"
  verify_remote_object_matches_local "${archive_snapshot_uri}/SNAPSHOT_READY.json" "$EVIDENCE_DIR/SNAPSHOT_READY.json"

  jq -e \
    --arg projectId "$PROJECT_ID" \
    --arg region "$REGION" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg evidenceUri "$EVIDENCE_URI" \
    --arg manifestSha256 "$actual_manifest_sha256" \
    '
      .projectId == $projectId
      and .region == $region
      and .retainUntil == $retainUntil
      and .evidenceUri == $evidenceUri
      and (.manifestSha256 | ascii_downcase) == $manifestSha256
      and .approvedForDeletion == false
    ' "$EVIDENCE_DIR/SNAPSHOT_READY.json" >/dev/null \
    || die "SNAPSHOT_READY.json is inconsistent with the recorded manifest."

  backup_id=$(jq -r '.backupId' "$EVIDENCE_DIR/SNAPSHOT_READY.json")
  sql_export_uri=$(jq -r '.sqlExportUri' "$EVIDENCE_DIR/SNAPSHOT_READY.json")
  schema_version=$(jq -r '.schemaVersion' "$EVIDENCE_DIR/manifest.json")
  if [[ "$schema_version" == "2" ]]; then
    jq -e \
      --arg backupId "$backup_id" \
      --arg sqlExportUri "$sql_export_uri" \
      '.snapshot.backupId == $backupId and .snapshot.sqlExportUri == $sqlExportUri' \
      "$EVIDENCE_DIR/manifest.json" >/dev/null \
      || die "Recorded snapshot artifacts do not match schema-2 manifest."
    sql_export_generation=$(jq -r '.snapshot.sqlExport.generation' "$EVIDENCE_DIR/manifest.json")
    sql_export_size=$(jq -r '.snapshot.sqlExport.size' "$EVIDENCE_DIR/manifest.json")
    sql_export_crc32c=$(jq -r '.snapshot.sqlExport.crc32c' "$EVIDENCE_DIR/manifest.json")
    sql_export_md5=$(jq -r '.snapshot.sqlExport.md5Hash' "$EVIDENCE_DIR/manifest.json")
  else
    initial_export_metadata_file="$EVIDENCE_DIR/pre/cloud-sql/sql-export-object.json"
    [[ -f "$initial_export_metadata_file" ]] \
      || die "Captured initial SQL export integrity metadata is missing."
    sql_export_generation=$(jq -r '.generation // .metadata.generation // empty' "$initial_export_metadata_file")
    sql_export_size=$(jq -r '(.size // .metadata.size // empty) | tostring' "$initial_export_metadata_file")
    sql_export_crc32c=$(jq -r '.crc32c_hash // .crc32c // .metadata.crc32c // empty' "$initial_export_metadata_file")
    sql_export_md5=$(jq -r '.md5_hash // .md5Hash // .metadata.md5Hash // ""' "$initial_export_metadata_file")
  fi
  [[ "$sql_export_uri" == "${EVIDENCE_URI}/sql/"* ]] \
    || die "Recorded initial SQL export is outside the evidence prefix."
  gcloud sql backups describe "$backup_id" \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json \
    | jq -e '.status == "SUCCESSFUL"' >/dev/null \
    || die "The recorded initial Cloud SQL backup is not successful."
  verify_held_object_integrity "$sql_export_uri" "$sql_export_generation" \
    "$sql_export_size" "$sql_export_crc32c" "$sql_export_md5"

  [[ -f "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json" ]] \
    || die "Final post-disable data snapshot evidence is missing."
  jq -e \
    --arg projectId "$PROJECT_ID" \
    --arg region "$REGION" \
    --arg retainUntil "$RETAIN_UNTIL" \
    '
      .projectId == $projectId
      and .region == $region
      and .retainUntil == $retainUntil
      and .servicesDisabledBeforeSnapshot == true
      and .objectProtection == "temporary-hold"
      and .approvedForDeletion == false
    ' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json" >/dev/null \
    || die "Final post-disable snapshot evidence is inconsistent."
  final_backup_id=$(jq -r '.backupId' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
  final_export_uri=$(jq -r '.sqlExportUri' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
  [[ "$final_export_uri" == "${EVIDENCE_URI}/final/"* ]] \
    || die "Final SQL export is outside the evidence prefix."
  gcloud sql backups describe "$final_backup_id" \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json \
    | jq -e '.status == "SUCCESSFUL"' >/dev/null \
    || die "The final post-disable Cloud SQL backup is not successful."

  final_relative_path=${final_export_uri#"${EVIDENCE_URI}/final/"}
  final_timestamp=${final_relative_path%%/*}
  final_evidence_dir="$EVIDENCE_DIR/final/$final_timestamp"
  final_export_metadata_file="$final_evidence_dir/sql-export-object.json"
  [[ -f "$final_export_metadata_file" ]] \
    || die "Captured final SQL export integrity metadata is missing."
  verify_checksums "$final_evidence_dir"
  if jq -e '.sqlExport.generation? != null' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json" >/dev/null; then
    final_export_generation=$(jq -r '.sqlExport.generation' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_size=$(jq -r '.sqlExport.size' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_crc32c=$(jq -r '.sqlExport.crc32c' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_md5=$(jq -r '.sqlExport.md5Hash' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_archive_uri=$(jq -r '.evidenceArchiveUri' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
  else
    final_export_generation=$(jq -r '.generation // .metadata.generation // empty' "$final_export_metadata_file")
    final_export_size=$(jq -r '(.size // .metadata.size // empty) | tostring' "$final_export_metadata_file")
    final_export_crc32c=$(jq -r '.crc32c_hash // .crc32c // .metadata.crc32c // empty' "$final_export_metadata_file")
    final_export_md5=$(jq -r '.md5_hash // .md5Hash // .metadata.md5Hash // ""' "$final_export_metadata_file")
    final_archive_uri="${EVIDENCE_URI}/final/${final_timestamp}/evidence"
  fi
  [[ "$final_archive_uri" == "${EVIDENCE_URI}/final/${final_timestamp}/evidence" ]] \
    || die "Final evidence archive URI is inconsistent with the final export."
  verify_held_object_integrity "$final_export_uri" "$final_export_generation" \
    "$final_export_size" "$final_export_crc32c" "$final_export_md5"
  verify_remote_prefix_held "$final_archive_uri"
  verify_remote_object_matches_local "${final_archive_uri}/FINAL_SNAPSHOT_READY.json" \
    "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json"
  verify_remote_object_matches_local "${final_archive_uri}/sql-export-object.json" \
    "$final_export_metadata_file"
  verify_remote_object_matches_local "${final_archive_uri}/SHA256SUMS" \
    "$final_evidence_dir/SHA256SUMS"

  echo "Recorded initial and final backup/export evidence passed read-only verification."
}

remove_public_invokers() {
  local service_name member policy_json
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    policy_json=$(gcloud run services get-iam-policy "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json)
    for member in allUsers allAuthenticatedUsers; do
      if jq -e --arg member "$member" '
        any(.bindings[]?; .role == "roles/run.invoker" and any(.members[]?; . == $member))
      ' <<<"$policy_json" >/dev/null; then
        gcloud run services remove-iam-policy-binding "$service_name" \
          --project="$PROJECT_ID" \
          --region="$REGION" \
          --member="$member" \
          --role=roles/run.invoker \
          --quiet
      fi
    done
  done
}

assert_services_disabled_for_final_snapshot() {
  local service_name service_json policy_json
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    service_json=$(gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json) || die "Cannot prove post-disable state for $service_name."
    policy_json=$(gcloud run services get-iam-policy "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json) || die "Cannot prove post-disable IAM for $service_name."
    jq -e '
      (.metadata.annotations["run.googleapis.com/scalingMode"] == "manual")
      and ((.metadata.annotations["run.googleapis.com/manualInstanceCount"] | tostring) == "0")
      and all(.status.traffic[]?; (.tag // "") == "")
      and ((.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true")
    ' <<<"$service_json" >/dev/null \
      || die "Final snapshot refused because $service_name is not proven disabled."
    jq -e '
      all(.bindings[]?;
        all(.members[]?; . != "allUsers" and . != "allAuthenticatedUsers")
      )
    ' <<<"$policy_json" >/dev/null \
      || die "Final snapshot refused because $service_name still has a public IAM member."
  done
}

transition_legacy_sql_activation() {
  local desired_policy="$1" desired_state="$2"
  local attempt=1 max_attempts=240 sql_json active_operations

  while ((attempt <= max_attempts)); do
    sql_json=$(gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --format=json 2>/dev/null || true)
    if jq -e \
      --arg policy "$desired_policy" \
      --arg state "$desired_state" \
      '.settings.activationPolicy == $policy and .state == $state' \
      <<<"$sql_json" >/dev/null 2>&1; then
      return 0
    fi

    if active_operations=$(gcloud sql operations list \
      --instance="$LEGACY_SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --filter='status!=DONE' \
      --format='value(name)' 2>/dev/null); then
      if [[ -z "$active_operations" ]]; then
        gcloud sql instances patch "$LEGACY_SQL_INSTANCE" \
          --project="$PROJECT_ID" \
          --activation-policy="$desired_policy" \
          --async \
          --quiet \
          --format='value(name)' >/dev/null 2>&1 || true
      fi
    fi

    if ((attempt % 6 == 0)); then
      echo "Waiting for legacy SQL to reach $desired_state/$desired_policy (attempt $attempt/$max_attempts)" >&2
    fi
    sleep 10
    attempt=$((attempt + 1))
  done

  echo "Legacy SQL did not reach $desired_state/$desired_policy within the retry window." >&2
  return 1
}

FINAL_SNAPSHOT_CLEANUP_ACTIVE="false"

final_snapshot_exit_cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  if [[ "$FINAL_SNAPSHOT_CLEANUP_ACTIVE" == "true" ]]; then
    FINAL_SNAPSHOT_CLEANUP_ACTIVE="false"
    echo "Emergency cleanup: stopping legacy SQL after interrupted final snapshot" >&2
    transition_legacy_sql_activation "NEVER" "STOPPED" \
      || echo "WARNING: emergency SQL stop failed and requires immediate operator action" >&2
  fi
  exit "$exit_status"
}

arm_final_snapshot_cleanup() {
  FINAL_SNAPSHOT_CLEANUP_ACTIVE="true"
  trap final_snapshot_exit_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

disarm_final_snapshot_cleanup() {
  FINAL_SNAPSHOT_CLEANUP_ACTIVE="false"
  trap - EXIT INT TERM
}

create_final_data_snapshot_if_needed() {
  local initial_activation_policy final_timestamp final_dir final_backup_description
  local final_backup_id final_export_uri final_archive_uri
  local final_export_generation final_export_size final_export_crc32c final_export_md5

  assert_services_disabled_for_final_snapshot

  if [[ -f "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json" ]]; then
    jq -e \
      --arg projectId "$PROJECT_ID" \
      --arg region "$REGION" \
      --arg retainUntil "$RETAIN_UNTIL" \
      --arg evidencePrefix "${EVIDENCE_URI}/final/" \
      '.projectId == $projectId
       and .region == $region
       and .retainUntil == $retainUntil
       and .servicesDisabledBeforeSnapshot == true
       and (.evidenceArchiveUri | startswith($evidencePrefix))
       and .approvedForDeletion == false' \
      "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json" >/dev/null \
      || die "The existing final snapshot marker is inconsistent with this offline action."
    final_backup_id=$(jq -r '.backupId' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_uri=$(jq -r '.sqlExportUri' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_generation=$(jq -r '.sqlExport.generation' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_size=$(jq -r '.sqlExport.size' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_crc32c=$(jq -r '.sqlExport.crc32c' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_export_md5=$(jq -r '.sqlExport.md5Hash' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    final_archive_uri=$(jq -r '.evidenceArchiveUri' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")
    [[ "$final_export_uri" == "${EVIDENCE_URI}/final/"* ]] \
      || die "The existing final export is outside the evidence prefix."
    gcloud sql backups describe "$final_backup_id" \
      --instance="$LEGACY_SQL_INSTANCE" \
      --project="$PROJECT_ID" \
      --format=json \
      | jq -e '.status == "SUCCESSFUL"' >/dev/null \
      || die "The recorded final Cloud SQL backup is not successful."
    verify_held_object_integrity "$final_export_uri" "$final_export_generation" \
      "$final_export_size" "$final_export_crc32c" "$final_export_md5"
    verify_remote_prefix_held "$final_archive_uri"
    verify_remote_object_matches_local "${final_archive_uri}/FINAL_SNAPSHOT_READY.json" \
      "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json"

    arm_final_snapshot_cleanup
    transition_legacy_sql_activation "NEVER" "STOPPED"
    disarm_final_snapshot_cleanup
    echo "Final post-disable data snapshot already exists: backup $final_backup_id"
    return
  fi

  initial_activation_policy=$(gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='value(settings.activationPolicy)')
  arm_final_snapshot_cleanup
  if [[ "$initial_activation_policy" != "ALWAYS" ]]; then
    echo "Temporarily starting legacy SQL for the final post-disable snapshot"
  fi
  transition_legacy_sql_activation "ALWAYS" "RUNNABLE"

  final_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  final_dir="$EVIDENCE_DIR/final/$final_timestamp"
  final_backup_description="cloud-run-final-post-disable-${final_timestamp}-retain-until-${RETAIN_UNTIL}"
  final_export_uri="${EVIDENCE_URI}/final/${final_timestamp}/${LEGACY_SQL_DATABASE}.sql.gz"
  final_archive_uri="${EVIDENCE_URI}/final/${final_timestamp}/evidence"
  mkdir -m 700 -p "$final_dir"

  echo "Creating final post-disable Cloud SQL backup"
  gcloud sql backups create \
    --instance="$LEGACY_SQL_INSTANCE" \
    --description="$final_backup_description" \
    --project="$PROJECT_ID" \
    --quiet \
    --format=json >"$final_dir/backup-create.json"
  gcloud sql backups list \
    --instance="$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --filter="description=$final_backup_description AND status=SUCCESSFUL" \
    --sort-by='~endTime' \
    --limit=1 \
    --format=json >"$final_dir/backup.json"
  final_backup_id=$(jq -r '.[0].id // empty' "$final_dir/backup.json")
  [[ -n "$final_backup_id" ]] || die "Final post-disable backup was not found with SUCCESSFUL status."

  echo "Creating final post-disable portable SQL export"
  gcloud sql export sql "$LEGACY_SQL_INSTANCE" "$final_export_uri" \
    --database="$LEGACY_SQL_DATABASE" \
    --project="$PROJECT_ID" \
    --quiet
  gcloud storage objects update "$final_export_uri" \
    --temporary-hold \
    --project="$PROJECT_ID" \
    --quiet
  gcloud storage objects describe "$final_export_uri" \
    --project="$PROJECT_ID" \
    --format=json >"$final_dir/sql-export-object.json"

  final_export_generation=$(jq -r '.generation // .metadata.generation // empty' \
    "$final_dir/sql-export-object.json")
  final_export_size=$(jq -r '(.size // .metadata.size // empty) | tostring' \
    "$final_dir/sql-export-object.json")
  final_export_crc32c=$(jq -r '.crc32c_hash // .crc32c // .metadata.crc32c // empty' \
    "$final_dir/sql-export-object.json")
  final_export_md5=$(jq -r '.md5_hash // .md5Hash // .metadata.md5Hash // ""' \
    "$final_dir/sql-export-object.json")
  verify_held_object_integrity "$final_export_uri" "$final_export_generation" \
    "$final_export_size" "$final_export_crc32c" "$final_export_md5"

  jq -n \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg createdAt "$(utc_now)" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg backupId "$final_backup_id" \
    --arg backupDescription "$final_backup_description" \
    --arg sqlExportUri "$final_export_uri" \
    --arg sqlExportGeneration "$final_export_generation" \
    --arg sqlExportSize "$final_export_size" \
    --arg sqlExportCrc32c "$final_export_crc32c" \
    --arg sqlExportMd5 "$final_export_md5" \
    --arg evidenceArchiveUri "$final_archive_uri" \
    --arg initialManifestSha256 "$EXPECTED_MANIFEST_SHA256" \
    '{
      projectId: $projectId,
      projectNumber: $projectNumber,
      region: $region,
      createdAt: $createdAt,
      retainUntil: $retainUntil,
      backupId: $backupId,
      backupDescription: $backupDescription,
      sqlExportUri: $sqlExportUri,
      sqlExport: {
        uri: $sqlExportUri,
        generation: $sqlExportGeneration,
        size: $sqlExportSize,
        crc32c: $sqlExportCrc32c,
        md5Hash: $sqlExportMd5
      },
      evidenceArchiveUri: $evidenceArchiveUri,
      initialManifestSha256: $initialManifestSha256,
      servicesDisabledBeforeSnapshot: true,
      objectProtection: "temporary-hold",
      approvedForDeletion: false
    }' >"$final_dir/FINAL_SNAPSHOT_READY.json"
  write_checksums "$final_dir"

  echo "Stopping legacy SQL again after the final snapshot"
  transition_legacy_sql_activation "NEVER" "STOPPED"
  disarm_final_snapshot_cleanup

  gcloud storage rsync "$final_dir" "$final_archive_uri" \
    --recursive \
    --project="$PROJECT_ID"
  hold_remote_prefix "$final_archive_uri"
  verify_remote_prefix_held "$final_archive_uri"
  verify_remote_object_matches_local "${final_archive_uri}/FINAL_SNAPSHOT_READY.json" \
    "$final_dir/FINAL_SNAPSHOT_READY.json"
  verify_remote_object_matches_local "${final_archive_uri}/SHA256SUMS" "$final_dir/SHA256SUMS"
  cp "$final_dir/FINAL_SNAPSHOT_READY.json" "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json"
  echo "Final post-disable data snapshot ready: backup $final_backup_id"
}

verify_state() {
  local output_dir="${1:-}"
  local baseline_dir="${2:-}"
  local failures=0 service_name service_json policy_json url status
  local sql_json gke_json protected_sql_json pages_status project_policy_json ancestors_json
  local revisions_json baseline_ready_revision current_ready_revision baseline_revision_names current_revision_names
  local bucket_name objects_json object_count secret_json repository_json

  [[ -z "$output_dir" ]] || mkdir -m 700 -p "$output_dir"
  echo "VERIFYING LEGACY STACK"
  ensure_evidence_bucket_private "assert"

  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    service_json=$(gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json) || die "Cannot describe Cloud Run service: $service_name"
    policy_json=$(gcloud run services get-iam-policy "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json) || die "Cannot read IAM policy for Cloud Run service: $service_name"
    revisions_json=$(gcloud run revisions list \
      --service="$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json) || die "Cannot list revisions for Cloud Run service: $service_name"

    if jq -e '
      (.metadata.annotations["run.googleapis.com/scalingMode"] == "manual")
      and ((.metadata.annotations["run.googleapis.com/manualInstanceCount"] | tostring) == "0")
      and all(.status.traffic[]?; (.tag // "") == "")
      and ((.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true")
    ' <<<"$service_json" >/dev/null; then
      echo "  PASS $service_name: manual scaling 0, no tags, invoker IAM check active"
    else
      echo "  FAIL $service_name: expected manual scaling 0, no tags, and active invoker IAM check" >&2
      failures=$((failures + 1))
    fi

    if [[ -n "$baseline_dir" ]]; then
      [[ -f "$baseline_dir/cloud-run/${service_name}.json" \
        && -f "$baseline_dir/cloud-run/${service_name}.revisions.json" ]] \
        || die "Missing Cloud Run baseline evidence for $service_name."
      baseline_ready_revision=$(jq -r '.status.latestReadyRevisionName' \
        "$baseline_dir/cloud-run/${service_name}.json")
      current_ready_revision=$(jq -r '.status.latestReadyRevisionName' <<<"$service_json")
      baseline_revision_names=$(jq -r '.[].metadata.name' \
        "$baseline_dir/cloud-run/${service_name}.revisions.json" | LC_ALL=C sort)
      current_revision_names=$(jq -r '.[].metadata.name' <<<"$revisions_json" | LC_ALL=C sort)
      if [[ "$current_ready_revision" == "$baseline_ready_revision" \
        && "$current_revision_names" == "$baseline_revision_names" ]]; then
        echo "  PASS $service_name: ready revision and revision set match the pre-change baseline"
      else
        echo "  FAIL $service_name: revision drift from the pre-change baseline" >&2
        failures=$((failures + 1))
      fi
    fi

    if jq -e '
      all(.bindings[]?;
        all(.members[]?; . != "allUsers" and . != "allAuthenticatedUsers")
      )
    ' <<<"$policy_json" >/dev/null; then
      echo "  PASS $service_name: no public IAM member"
    else
      echo "  FAIL $service_name: a public IAM member remains" >&2
      failures=$((failures + 1))
    fi

    url=$(jq -r '.status.url' <<<"$service_json")
    status=$(curl --silent --show-error --output /dev/null --max-time 20 --write-out '%{http_code}' "$url" || true)
    if [[ "$status" == "000" || "$status" =~ ^[45][0-9][0-9]$ ]]; then
      echo "  PASS $service_name: unauthenticated endpoint status $status"
    else
      echo "  FAIL $service_name: unexpected unauthenticated endpoint status $status" >&2
      failures=$((failures + 1))
    fi

    if [[ -n "$output_dir" ]]; then
      printf '%s\n' "$service_json" >"$output_dir/${service_name}.json"
      printf '%s\n' "$policy_json" >"$output_dir/${service_name}.iam.json"
      printf '%s\n' "$revisions_json" >"$output_dir/${service_name}.revisions.json"
      printf '%s\t%s\t%s\n' "$service_name" "$status" "$url" >>"$output_dir/url-status-after.tsv"
    fi
  done

  project_policy_json=$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json) \
    || die "Cannot inspect project IAM policy."
  if jq -e '
    all(.bindings[]?;
      all(.members[]?; . != "allUsers" and . != "allAuthenticatedUsers")
    )
  ' <<<"$project_policy_json" >/dev/null; then
    echo "  PASS project IAM: no project-level public IAM member"
  else
    echo "  FAIL project IAM: a project-level public IAM member remains" >&2
    failures=$((failures + 1))
  fi
  [[ -z "$output_dir" ]] || printf '%s\n' "$project_policy_json" >"$output_dir/project.iam.json"

  ancestors_json=$(gcloud projects get-ancestors "$PROJECT_ID" --format=json) \
    || die "Cannot inspect the project resource hierarchy."
  if jq -e --arg projectId "$PROJECT_ID" \
    'length == 1 and .[0].type == "project" and .[0].id == $projectId' \
    <<<"$ancestors_json" >/dev/null; then
    echo "  PASS resource hierarchy: no folder or organization ancestor can inherit a public invoker"
  else
    echo "  FAIL resource hierarchy: inherited IAM cannot be ruled out for this fixed scope" >&2
    failures=$((failures + 1))
  fi
  [[ -z "$output_dir" ]] || printf '%s\n' "$ancestors_json" >"$output_dir/project.ancestors.json"

  sql_json=$(gcloud sql instances describe "$LEGACY_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot describe legacy Cloud SQL instance."
  if jq -e '
    .state == "STOPPED"
    and .settings.activationPolicy == "NEVER"
    and .settings.deletionProtectionEnabled == true
  ' <<<"$sql_json" >/dev/null; then
    echo "  PASS $LEGACY_SQL_INSTANCE: STOPPED, activation NEVER, deletion protection enabled"
  else
    echo "  FAIL $LEGACY_SQL_INSTANCE: expected STOPPED, activation NEVER, and deletion protection" >&2
    failures=$((failures + 1))
  fi
  [[ -z "$output_dir" ]] || printf '%s\n' "$sql_json" >"$output_dir/${LEGACY_SQL_INSTANCE}.json"

  for bucket_name in "${LEGACY_BUCKETS[@]}"; do
    objects_json=$(gcloud storage ls --all-versions --json "gs://${bucket_name}/**" \
      --project="$PROJECT_ID") || die "Cannot inspect retained objects in $bucket_name."
    object_count=$(jq '[.[] | select(.type == "cloud_object")] | length' <<<"$objects_json")
    if ((object_count > 0)) && jq -e '
      all(.[] | select(.type == "cloud_object");
        .metadata.temporaryHold == true or .temporary_hold == true or .temporaryHold == true
      )
    ' <<<"$objects_json" >/dev/null; then
      echo "  PASS $bucket_name: all $object_count object generation(s) have temporary holds"
    else
      echo "  FAIL $bucket_name: empty inventory or an object generation lacks a temporary hold" >&2
      failures=$((failures + 1))
    fi
    [[ -z "$output_dir" ]] || printf '%s\n' "$objects_json" >"$output_dir/${bucket_name}.objects.json"
  done

  secret_json=$(gcloud secrets describe "$LEGACY_SECRET" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot inspect retained legacy secret."
  echo "  PASS retained secret: $LEGACY_SECRET is present"
  [[ -z "$output_dir" ]] || printf '%s\n' "$secret_json" >"$output_dir/${LEGACY_SECRET}.json"

  repository_json=$(gcloud artifacts repositories describe "$LEGACY_ARTIFACT_REPOSITORY" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --format=json) || die "Cannot inspect retained legacy Artifact Registry repository."
  echo "  PASS retained Artifact Registry repository: $LEGACY_ARTIFACT_REPOSITORY is present"
  [[ -z "$output_dir" ]] || printf '%s\n' "$repository_json" >"$output_dir/${LEGACY_ARTIFACT_REPOSITORY}.repository.json"

  gke_json=$(gcloud container clusters list \
    --project="$PROJECT_ID" \
    --filter="name=$PROTECTED_GKE_CLUSTER" \
    --format=json) || die "Cannot inspect protected GKE cluster."
  if jq -e --arg name "$PROTECTED_GKE_CLUSTER" 'any(.[]; .name == $name and .status == "RUNNING")' <<<"$gke_json" >/dev/null; then
    echo "  PASS protected GKE cluster: $PROTECTED_GKE_CLUSTER is RUNNING"
  else
    echo "  FAIL protected GKE cluster: $PROTECTED_GKE_CLUSTER is not RUNNING" >&2
    failures=$((failures + 1))
  fi
  [[ -z "$output_dir" ]] || printf '%s\n' "$gke_json" >"$output_dir/protected-gke.json"

  protected_sql_json=$(gcloud sql instances describe "$PROTECTED_SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format=json) || die "Cannot inspect protected Cloud SQL instance."
  if jq -e '.settings.activationPolicy == "ALWAYS" and .settings.deletionProtectionEnabled == true' <<<"$protected_sql_json" >/dev/null; then
    echo "  PASS protected SQL instance: $PROTECTED_SQL_INSTANCE remains active and protected"
  else
    echo "  FAIL protected SQL instance: $PROTECTED_SQL_INSTANCE changed unexpectedly" >&2
    failures=$((failures + 1))
  fi
  [[ -z "$output_dir" ]] || printf '%s\n' "$protected_sql_json" >"$output_dir/protected-sql.json"

  pages_status=$(curl --silent --show-error --location --output /dev/null --max-time 20 --write-out '%{http_code}' "$PAGES_DEMO_URL" || true)
  if [[ "$pages_status" == "200" ]]; then
    echo "  PASS GitHub Pages demo: HTTP 200"
  else
    echo "  FAIL GitHub Pages demo: HTTP $pages_status" >&2
    failures=$((failures + 1))
  fi
  if [[ -n "$output_dir" ]]; then
    printf '%s\t%s\t%s\n' "github-pages-demo" "$pages_status" "$PAGES_DEMO_URL" >>"$output_dir/url-status-after.tsv"
  fi

  if ((failures > 0)); then
    echo "Verification failed with $failures finding(s)." >&2
    return 1
  fi
  echo "Verification passed."
}

offline_action() {
  local expected_confirmation service_name service_state_json tags post_dir archive_post_uri verification_timestamp

  expected_confirmation="${PROJECT_ID}:${PROJECT_NUMBER}:${REGION}:offline-cloud-run"
  [[ "$CONFIRMATION" == "$expected_confirmation" ]] || {
    echo "Offline action refused." >&2
    echo "Repeat with: --confirm $expected_confirmation" >&2
    exit 2
  }
  verify_snapshot_gate
  mkdir -m 700 -p "$EVIDENCE_DIR/post"

  echo "Snapshot gate passed. Taking four Cloud Run services reversibly offline."
  for service_name in "${CLOUD_RUN_SERVICES[@]}"; do
    service_state_json=$(gcloud run services describe "$service_name" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --format=json)
    tags=$(jq -r '[.status.traffic[]?.tag // empty] | join(",")' <<<"$service_state_json")
    if [[ -n "$tags" ]]; then
      gcloud run services update-traffic "$service_name" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --clear-tags \
        --quiet
    fi
    if jq -e '
      (.metadata.annotations["run.googleapis.com/scalingMode"] == "manual")
      and ((.metadata.annotations["run.googleapis.com/manualInstanceCount"] | tostring) == "0")
      and ((.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true")
    ' <<<"$service_state_json" >/dev/null; then
      echo "Service $service_name is already disabled with invoker IAM check active"
    else
      gcloud run services update "$service_name" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --scaling=0 \
        --invoker-iam-check \
        --quiet
    fi
  done

  remove_public_invokers

  create_final_data_snapshot_if_needed

  transition_legacy_sql_activation "NEVER" "STOPPED"
  echo "Legacy Cloud SQL instance is stopped and remains deletion-protected"

  verification_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  post_dir="$EVIDENCE_DIR/post/$verification_timestamp"
  verify_state "$post_dir" "$EVIDENCE_DIR/pre"

  jq -n \
    --arg projectId "$PROJECT_ID" \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg region "$REGION" \
    --arg offlineAt "$(utc_now)" \
    --arg retainUntil "$RETAIN_UNTIL" \
    --arg manifestSha256 "$EXPECTED_MANIFEST_SHA256" \
    --arg result "verified-offline" \
    --arg finalBackupId "$(jq -r '.backupId' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")" \
    --arg finalSqlExportUri "$(jq -r '.sqlExportUri' "$EVIDENCE_DIR/FINAL_SNAPSHOT_READY.json")" \
    '{
      projectId: $projectId,
      projectNumber: $projectNumber,
      region: $region,
      offlineAt: $offlineAt,
      retainUntil: $retainUntil,
      manifestSha256: $manifestSha256,
      result: $result,
      finalBackupId: $finalBackupId,
      finalSqlExportUri: $finalSqlExportUri,
      decommissionScopeResourcesDeleted: [],
      resourcesDeleted: []
    }' >"$post_dir/OFFLINE_VERIFIED.json"
  write_checksums "$post_dir"
  write_checksums "$EVIDENCE_DIR"

  archive_post_uri="${EVIDENCE_URI}/post/${verification_timestamp}"
  gcloud storage rsync "$post_dir" "$archive_post_uri" \
    --recursive \
    --project="$PROJECT_ID"
  hold_remote_prefix "$archive_post_uri"

  echo
  echo "LEGACY STACK VERIFIED OFFLINE"
  echo "Cloud Run services remain present with manual scaling 0."
  echo "Cloud SQL remains present with activationPolicy NEVER and deletion protection."
  echo "Backup, export, legacy objects, secret, images, GKE, and target SQL were not deleted."
  echo "Retention not before: $RETAIN_UNTIL"
  echo "Evidence: $EVIDENCE_DIR"
  echo "Permanent deletion requires a separate later change."
}

validate_project

case "$ACTION" in
  plan)
    print_plan
    ;;
  snapshot)
    snapshot_action
    ;;
  offline)
    offline_action
    ;;
  verify)
    if [[ -n "$EVIDENCE_DIR" ]]; then
      verify_completed_evidence
      [[ -d "$EVIDENCE_DIR/pre" ]] || die "Missing pre-change baseline in $EVIDENCE_DIR/pre."
      verification_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
      verification_dir="$EVIDENCE_DIR/verify/$verification_timestamp"
      verify_state "$verification_dir" "$EVIDENCE_DIR/pre"
      write_checksums "$verification_dir"
      echo "Verification evidence: $verification_dir"
    else
      verify_state
    fi
    ;;
  *)
    die "Unsupported action: $ACTION"
    ;;
esac
