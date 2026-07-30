#!/usr/bin/env bash

set -euo pipefail

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required for IAP identity-mode reconciliation." >&2
    exit 1
  fi
}

for required_name in \
  IAP_IDENTITY_MODE \
  GCP_PROJECT_ID \
  IAP_PROJECT_NUMBER \
  IAP_API_BACKEND_SERVICE \
  IAP_FRONTEND_BACKEND_SERVICE \
  IAP_RESOURCE_ACCESS_PRINCIPAL \
  IAP_WORK_DIR; do
  require_value "$required_name"
done

if [[ "$IAP_IDENTITY_MODE" != "iam" && "$IAP_IDENTITY_MODE" != "external" ]]; then
  echo "IAP_IDENTITY_MODE must be exactly iam or external." >&2
  exit 1
fi
if [[ ! "$GCP_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "GCP_PROJECT_ID is invalid." >&2
  exit 1
fi
if [[ ! "$IAP_PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "IAP_PROJECT_NUMBER must be a numeric Google Cloud project number." >&2
  exit 1
fi
if [[ "$IAP_API_BACKEND_SERVICE" == "$IAP_FRONTEND_BACKEND_SERVICE" ]]; then
  echo "The API and frontend must use distinct protected backend services." >&2
  exit 1
fi
for backend_service in "$IAP_API_BACKEND_SERVICE" "$IAP_FRONTEND_BACKEND_SERVICE"; do
  if [[ ! "$backend_service" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    echo "A protected IAP backend service name is invalid." >&2
    exit 1
  fi
done
if [[ ! -d "$IAP_WORK_DIR" ]]; then
  echo "IAP_WORK_DIR must be an existing private working directory." >&2
  exit 1
fi
if [[ -n "${IAP_GCIP_TENANT_ID:-}" ]]; then
  echo "IAP_GCIP_TENANT_ID must remain empty for project-level GCIP agent flow." >&2
  exit 1
fi
if [[ ! "$IAP_RESOURCE_ACCESS_PRINCIPAL" =~ ^(group|user):[^@[:space:]]+@[^@[:space:]]+$ ]]; then
  echo "IAP_RESOURCE_ACCESS_PRINCIPAL is invalid." >&2
  exit 1
fi

principal_type="${IAP_RESOURCE_ACCESS_PRINCIPAL%%:*}"
condition_expression=""
if [[ "$principal_type" == "group" ]]; then
  require_value IAP_RESOURCE_ACCESS_EXPIRES_AT
  condition_expression="request.time < timestamp(\"${IAP_RESOURCE_ACCESS_EXPIRES_AT}\")"
fi

backend_services=(
  "$IAP_API_BACKEND_SERVICE"
  "$IAP_FRONTEND_BACKEND_SERVICE"
)
enable_external_services=()
disable_external_services=()
empty_iam_policy_count=0
exact_iam_policy_count=0
saw_external_source=0
restore_armed=0
mutation_attempted_services=()
agent_tenant="_${IAP_PROJECT_NUMBER}"
desired_external_settings="${IAP_WORK_DIR}/external-gcip-settings-desired.json"
desired_iam_settings="${IAP_WORK_DIR}/iam-settings-desired.json"

# `gcloud iap settings set` sends no update mask and therefore replaces the
# resource settings. The preflight below accepts only these identity-mode fields
# before either exact replacement is allowed.
jq --null-input \
  --arg tenant "$agent_tenant" \
  --arg login_page_uri "${IAP_EXTERNAL_LOGIN_PAGE_URI:-}" '{
    accessSettings: {
      gcipSettings: {
        tenantIds: [$tenant],
        loginPageUri: $login_page_uri
      }
    }
  }' > "$desired_external_settings"

jq --null-input '{
  accessSettings: {
    reauthSettings: {
      method: "ENROLLED_SECOND_FACTORS",
      maxAge: "28800s",
      policyType: "MINIMUM"
    }
  }
}' > "$desired_iam_settings"

read_settings() {
  local service="$1"
  local destination="$2"
  gcloud iap settings get \
    --project "$GCP_PROJECT_ID" \
    --resource-type=backend-services \
    --service "$service" \
    --format=json > "$destination"
}

write_settings() {
  local service="$1"
  local source="$2"
  gcloud iap settings set "$source" \
    --project "$GCP_PROJECT_ID" \
    --resource-type=backend-services \
    --service "$service" \
    --quiet >/dev/null
}

restore_original_settings() {
  local restore_status=0
  local service
  local original_settings
  local restored_settings

  if (( ${#mutation_attempted_services[@]} > 0 )); then
    for service in "${mutation_attempted_services[@]}"; do
      original_settings="${IAP_WORK_DIR}/${service}-identity-settings-current.json"
      if ! write_settings "$service" "$original_settings"; then
        echo "Compensating rollback could not restore the original IAP settings on ${service}." >&2
        restore_status=1
      fi
    done
  fi

  for service in "${backend_services[@]}"; do
    original_settings="${IAP_WORK_DIR}/${service}-identity-settings-current.json"
    restored_settings="${IAP_WORK_DIR}/${service}-identity-settings-restored.json"
    if ! read_settings "$service" "$restored_settings"; then
      echo "Compensating rollback could not read back IAP settings on ${service}." >&2
      restore_status=1
      continue
    fi
    if ! jq --exit-status --slurp '
      (.[0] | del(.name)) == (.[1] | del(.name))
    ' "$original_settings" "$restored_settings" >/dev/null; then
      echo "Compensating rollback did not restore the exact original IAP settings on ${service}." >&2
      restore_status=1
    fi
  done

  return "$restore_status"
}

on_reconcile_exit() {
  local status=$?
  trap - EXIT
  if [[ "$status" != "0" && "$restore_armed" == "1" ]]; then
    set +e
    if restore_original_settings; then
      echo "The failed two-backend identity-mode mutation was rolled back to the exact original settings." >&2
    else
      echo "::error::Compensating rollback of protected IAP identity settings failed; both backends require immediate read-only inspection." >&2
      status=1
    fi
  fi
  exit "$status"
}
trap on_reconcile_exit EXIT

read_policy() {
  local service="$1"
  local destination="$2"
  gcloud iap web get-iam-policy \
    --project "$GCP_PROJECT_ID" \
    --resource-type=backend-services \
    --service "$service" \
    --format=json > "$destination"
}

gcip_is_inactive() {
  local settings_file="$1"
  jq --exit-status '
    (.accessSettings.gcipSettings // {}) as $gcip
    | (($gcip.tenantIds // []) | length) == 0
      and (($gcip.loginPageUri // "") == "")
  ' "$settings_file" >/dev/null
}

gcip_is_expected_external() {
  local settings_file="$1"
  jq --exit-status \
    --arg tenant "$agent_tenant" \
    --arg login_page_uri "${IAP_EXTERNAL_LOGIN_PAGE_URI:-}" '
      (.accessSettings.gcipSettings // {}) == {
        tenantIds: [$tenant],
        loginPageUri: $login_page_uri
      }
    ' "$settings_file" >/dev/null
}

reauth_is_exact() {
  local settings_file="$1"
  jq --exit-status '
    .accessSettings.reauthSettings == {
      method: "ENROLLED_SECOND_FACTORS",
      maxAge: "28800s",
      policyType: "MINIMUM"
    }
  ' "$settings_file" >/dev/null
}

reauth_is_inactive() {
  local settings_file="$1"
  jq --exit-status '
    ((.accessSettings.reauthSettings // {}) | length) == 0
  ' "$settings_file" >/dev/null
}

has_only_identity_mode_settings() {
  local settings_file="$1"
  jq --exit-status '
    ([
      (.accessSettings // {})
      | keys_unsorted[]
      | select(
          . != "gcipSettings" and
          . != "reauthSettings" and
          . != "identitySources" and
          . != "workforceIdentitySettings"
        )
    ] | length) == 0 and
    (
      ((.accessSettings.identitySources // []) == []) or
      ((.accessSettings.identitySources // []) == ["IDENTITY_SOURCE_UNSPECIFIED"])
    ) and
    (
      (.accessSettings.workforceIdentitySettings // {}) as $workforce
      | (($workforce.workforcePools // []) | length) == 0 and
        (($workforce.oauth2 // {}) | length) == 0
    ) and
    ((.applicationSettings // {}) | length) == 0
  ' "$settings_file" >/dev/null
}

policy_is_exact_iam_rollback_state() {
  local policy_file="$1"
  jq --exit-status \
    --arg member "$IAP_RESOURCE_ACCESS_PRINCIPAL" \
    --arg principal_type "$principal_type" \
    --arg condition_expression "$condition_expression" '
      (.etag | type == "string") and
      (.etag | length) > 0 and
      ([
        keys_unsorted[]
        | select(
            . != "bindings" and
            . != "etag" and
            . != "version" and
            . != "auditConfigs"
          )
      ] | length) == 0 and
      {
        version: (.version // 1),
        bindings: (.bindings // []),
        auditConfigs: (.auditConfigs // [])
      }
      ==
      {
        version: (if $principal_type == "group" then 3 else 1 end),
        bindings: [
          {
            role: "roles/iap.httpsResourceAccessor",
            members: [$member]
          }
          + if $principal_type == "group" then {
              condition: {
                title: "pre-gematik-pilot-expiry",
                description: "Automatische Sperre zum dokumentierten Ende des pre-gematik-Piloten.",
                expression: $condition_expression
              }
            } else {} end
        ],
        auditConfigs: []
      }
    ' "$policy_file" >/dev/null
}

policy_is_empty() {
  local policy_file="$1"
  jq --exit-status '
    (.etag | type == "string") and
    (.etag | length) > 0 and
    ((.bindings // []) | length) == 0 and
    ((.auditConfigs // []) | length) == 0 and
    ([
      keys_unsorted[]
      | select(
          . != "bindings" and
          . != "etag" and
          . != "version" and
          . != "auditConfigs"
        )
    ] | length) == 0
  ' "$policy_file" >/dev/null
}

if [[ "$IAP_IDENTITY_MODE" == "external" ]]; then
  if [[ "${IAP_GCIP_PROJECT_ID:-}" != "$GCP_PROJECT_ID" ]]; then
    echo "External IAP requires IAP_GCIP_PROJECT_ID to match GCP_PROJECT_ID." >&2
    exit 1
  fi
  if [[ -z "${IAP_EXTERNAL_LOGIN_PAGE_URI:-}" ]] || \
     [[ ! "$IAP_EXTERNAL_LOGIN_PAGE_URI" =~ ^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(/[A-Za-z0-9._~%:@+/-]*)?$ ]]; then
    echo "External IAP requires an exact custom HTTPS login page URI." >&2
    exit 1
  fi
fi

# Read and validate every protected backend before mutating either one.
for candidate in "${backend_services[@]}"; do
  current_settings="${IAP_WORK_DIR}/${candidate}-identity-settings-current.json"
  read_settings "$candidate" "$current_settings"
  if ! has_only_identity_mode_settings "$current_settings"; then
    echo "Unexpected resource-specific IAP, Workforce Identity, or identity-source settings exist on ${candidate}; refusing identity-mode mutation." >&2
    exit 1
  fi

  current_policy="${IAP_WORK_DIR}/${candidate}-identity-policy-current.json"
  read_policy "$candidate" "$current_policy"

  if [[ "$IAP_IDENTITY_MODE" == "external" ]]; then
    if ! policy_is_exact_iam_rollback_state "$current_policy"; then
      echo "The protected IAM rollback policy is not in the exact approved state on ${candidate}; refusing external identities." >&2
      exit 1
    fi
    if gcip_is_expected_external "$current_settings" && \
       reauth_is_inactive "$current_settings"; then
      continue
    fi
    if ! gcip_is_inactive "$current_settings" || \
       ! reauth_is_exact "$current_settings"; then
      echo "Neither the exact IAM source state nor the exact external state is active on ${candidate}; refusing external cutover." >&2
      exit 1
    fi
    enable_external_services+=("$candidate")
    continue
  fi

  policy_state=""
  if policy_is_exact_iam_rollback_state "$current_policy"; then
    policy_state="exact"
    exact_iam_policy_count=$((exact_iam_policy_count + 1))
  elif policy_is_empty "$current_policy"; then
    policy_state="empty"
    empty_iam_policy_count=$((empty_iam_policy_count + 1))
  else
    echo "The protected IAM policy is neither empty nor in the exact approved state on ${candidate}; refusing IAM reconciliation." >&2
    exit 1
  fi

  if gcip_is_inactive "$current_settings"; then
    if reauth_is_exact "$current_settings"; then
      continue
    fi
    if reauth_is_inactive "$current_settings"; then
      disable_external_services+=("$candidate")
      continue
    fi
    echo "The IAM backend has a drifted reauthentication setting on ${candidate}; refusing reconciliation." >&2
    exit 1
  fi
  if [[ "${IAP_GCIP_PROJECT_ID:-}" != "$GCP_PROJECT_ID" ]] || \
     [[ -z "${IAP_EXTERNAL_LOGIN_PAGE_URI:-}" ]] || \
     ! gcip_is_expected_external "$current_settings" || \
     ! reauth_is_inactive "$current_settings"; then
    echo "An unpinned or unknown GCIP configuration is active on ${candidate}; refusing IAM rollback." >&2
    exit 1
  fi
  saw_external_source=1
  if [[ "$policy_state" != "exact" ]]; then
    echo "External identities are active but the exact IAM rollback policy is missing on ${candidate}; refusing IAM rollback." >&2
    exit 1
  fi
  disable_external_services+=("$candidate")
done

if [[ "$IAP_IDENTITY_MODE" == "external" ]] && \
   (( ${#enable_external_services[@]} != 0 && ${#enable_external_services[@]} != ${#backend_services[@]} )); then
  echo "The protected backends are in a partial IAM/external identity-source state; refusing external cutover." >&2
  exit 1
fi

if [[ "$IAP_IDENTITY_MODE" == "iam" ]]; then
  if (( empty_iam_policy_count != 0 && exact_iam_policy_count != 0 )); then
    echo "The protected IAM policies are in a partial state; refusing identity-mode mutation." >&2
    exit 1
  fi
  if (( saw_external_source != 0 && empty_iam_policy_count != 0 )); then
    echo "External identities cannot be disabled without both exact IAM rollback policies." >&2
    exit 1
  fi
fi

if (( ${#enable_external_services[@]} > 0 )); then
  restore_armed=1
  for candidate in "${enable_external_services[@]}"; do
    mutation_attempted_services+=("$candidate")
    if ! write_settings "$candidate" "$desired_external_settings"; then
      echo "External identity cutover failed while updating ${candidate}." >&2
      exit 1
    fi
  done
fi
if (( ${#disable_external_services[@]} > 0 )); then
  restore_armed=1
  for candidate in "${disable_external_services[@]}"; do
    mutation_attempted_services+=("$candidate")
    if ! write_settings "$candidate" "$desired_iam_settings"; then
      echo "IAM rollback failed while updating ${candidate}." >&2
      exit 1
    fi
  done
fi

# Verify the complete state after mutation. External mode must keep the IAM
# rollback policies intact while disabling unsupported reauthentication; IAM
# rollback restores the exact eight-hour reauthentication policy.
for candidate in "${backend_services[@]}"; do
  verified_settings="${IAP_WORK_DIR}/${candidate}-identity-settings-verified.json"
  read_settings "$candidate" "$verified_settings"
  if ! has_only_identity_mode_settings "$verified_settings"; then
    echo "Unexpected IAP settings appeared during identity-mode reconciliation on ${candidate}." >&2
    exit 1
  fi

  if [[ "$IAP_IDENTITY_MODE" == "external" ]]; then
    if ! gcip_is_expected_external "$verified_settings" || \
       ! reauth_is_inactive "$verified_settings"; then
      echo "External GCIP agent flow is not exact or unsupported reauthentication remains active on ${candidate}." >&2
      exit 1
    fi
    verified_policy="${IAP_WORK_DIR}/${candidate}-identity-policy-verified.json"
    read_policy "$candidate" "$verified_policy"
    if ! policy_is_exact_iam_rollback_state "$verified_policy"; then
      echo "The IAM rollback policy changed during external identity cutover on ${candidate}." >&2
      exit 1
    fi
  elif ! gcip_is_inactive "$verified_settings" || \
       ! reauth_is_exact "$verified_settings"; then
    echo "GCIP external identities remain active or eight-hour reauthentication is missing after IAM rollback on ${candidate}." >&2
    exit 1
  fi
done

restore_armed=0
