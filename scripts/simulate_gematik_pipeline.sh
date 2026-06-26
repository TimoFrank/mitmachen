#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
RUN_INSTALL="${RUN_INSTALL:-0}"
RUN_SECURITY="${RUN_SECURITY:-0}"
RUN_VISUAL="${RUN_VISUAL:-0}"
RUN_DOCKER="${RUN_DOCKER:-0}"
RUN_TRIVY="${RUN_TRIVY:-0}"
RUN_PUSH="${RUN_PUSH:-0}"
RUN_HELM="${RUN_HELM:-auto}"
DEPLOY_TO_K8S="${DEPLOY_TO_K8S:-0}"
RUN_SMOKE="${RUN_SMOKE:-0}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/simulate_gematik_pipeline.sh [options]

Options:
  --dry-run        Print stages and commands without executing them.
  --install        Run npm ci before checks.
  --with-security  Run npm audit and optional Semgrep/Gitleaks docker scans.
  --with-visual    Run Playwright visual tests.
  --with-docker    Build the API container image.
  --with-trivy     Run Trivy image scan. Requires --with-docker.
  --push-image     Push the API image to ARTIFACT_REGISTRY.
  --with-helm      Run helm lint and helm template. Fails if helm is missing.
  --no-helm        Skip helm validation.
  --deploy-k8s     Deploy the API with Helm to K8S_NAMESPACE.
  --smoke          Run rollout status and health smoke checks where possible.
  --full           Enable install, security, visual, docker, trivy, push, helm and k8s deploy.
  -h, --help       Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --install) RUN_INSTALL=1 ;;
    --with-security) RUN_SECURITY=1 ;;
    --with-visual) RUN_VISUAL=1 ;;
    --with-docker) RUN_DOCKER=1 ;;
    --with-trivy) RUN_TRIVY=1 ;;
    --push-image) RUN_PUSH=1 ;;
    --with-helm) RUN_HELM=1 ;;
    --no-helm) RUN_HELM=0 ;;
    --deploy-k8s) DEPLOY_TO_K8S=1 ;;
    --smoke) RUN_SMOKE=1 ;;
    --full)
      RUN_INSTALL=1
      RUN_SECURITY=1
      RUN_VISUAL=1
      RUN_DOCKER=1
      RUN_TRIVY=1
      RUN_PUSH=1
      RUN_HELM=1
      DEPLOY_TO_K8S=1
      RUN_SMOKE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

BUILD_NUMBER="${BUILD_NUMBER:-local-$(date +%Y%m%d%H%M%S)}"
ARTIFACT_REGISTRY="${ARTIFACT_REGISTRY:-localhost:5001}"
API_SERVICE="${API_SERVICE:-versorgungs-kompass-api}"
API_IMAGE_REPOSITORY="${API_IMAGE_REPOSITORY:-${ARTIFACT_REGISTRY}/${API_SERVICE}}"
API_IMAGE="${API_IMAGE:-${API_IMAGE_REPOSITORY}:${BUILD_NUMBER}}"
API_BASE_URL="${API_BASE_URL:-https://versorgungs-kompass-api.local.test}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://localhost:8088}"
FRONTEND_ARTIFACT_DIR="${FRONTEND_ARTIFACT_DIR:-$ROOT_DIR/.local-gematik/frontend-artifact}"
FRONTEND_PUBLISH_DIR="${FRONTEND_PUBLISH_DIR:-$ROOT_DIR/.local-gematik/published-frontend}"
K8S_NAMESPACE="${K8S_NAMESPACE:-versorgungs-kompass-local}"
HELM_RELEASE="${HELM_RELEASE:-versorgungs-kompass}"
HELM_CHART="${HELM_CHART:-deploy/helm/versorgungs-kompass}"
LOCAL_HELM_VALUES="${LOCAL_HELM_VALUES:-deploy/local/helm-values.local.yaml}"
DB_HOST="${DB_HOST:-host.docker.internal}"
DB_PORT="${DB_PORT:-55432}"
DB_NAME="${DB_NAME:-versorgungs_kompass}"
DB_USER="${DB_USER:-vk_app}"
DB_PASSWORD="${DB_PASSWORD:-vk_local_password}"
DB_PASSWORD_SECRET_NAME="${DB_PASSWORD_SECRET_NAME:-versorgungs-kompass-postgres}"
API_AUTH_MODE="${API_AUTH_MODE:-trusted-header}"
AUTH_EMAIL_HEADER="${AUTH_EMAIL_HEADER:-x-auth-request-email}"
AUTH_SUBJECT_HEADER="${AUTH_SUBJECT_HEADER:-x-auth-request-user}"
PROFILE_IMAGE_BUCKET="${PROFILE_IMAGE_BUCKET:-local-profile-images}"
CONTACT_IMAGE_BUCKET="${CONTACT_IMAGE_BUCKET:-local-contact-images}"

export API_BASE_URL FRONTEND_BASE_URL API_AUTH_MODE AUTH_EMAIL_HEADER AUTH_SUBJECT_HEADER

stage() {
  printf '\n==> %s\n' "$1"
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  "$@"
}

run_shell() {
  printf '+ %s\n' "$*"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  bash -c "$*"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

require() {
  if ! have "$1"; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

warn_missing() {
  echo "WARN: $1 fehlt; Stage wird lokal uebersprungen." >&2
}

api_host() {
  node -e 'console.log(new URL(process.env.API_BASE_URL).host)'
}

stage "Local gematik simulation settings"
cat <<SETTINGS
BUILD_NUMBER=$BUILD_NUMBER
API_IMAGE=$API_IMAGE
API_BASE_URL=$API_BASE_URL
FRONTEND_BASE_URL=$FRONTEND_BASE_URL
FRONTEND_ARTIFACT_DIR=$FRONTEND_ARTIFACT_DIR
FRONTEND_PUBLISH_DIR=$FRONTEND_PUBLISH_DIR
K8S_NAMESPACE=$K8S_NAMESPACE
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
SETTINGS

if [[ "$RUN_INSTALL" == "1" ]]; then
  stage "Install"
  run npm ci
fi

stage "Static checks"
run npm run check

if [[ "$RUN_SECURITY" == "1" ]]; then
  stage "Dependency audit"
  run npm run security:audit

  stage "SAST and secret scan"
  if have docker; then
    run docker run --rm -v "$ROOT_DIR:/src" semgrep/semgrep semgrep scan --config p/javascript --config p/secrets --config p/owasp-top-ten /src
    run docker run --rm -v "$ROOT_DIR:/repo" zricethezav/gitleaks:latest detect --source /repo --no-git --redact --verbose
  else
    warn_missing docker
  fi
fi

if [[ "$RUN_VISUAL" == "1" ]]; then
  stage "Visual smoke"
  run npx playwright install --with-deps chromium
  run npm run test:visual
fi

stage "Prepare frontend artifact"
if [[ "$DRY_RUN" == "1" ]]; then
  run bash scripts/sync_github_pages.sh
  run rm -rf "$FRONTEND_ARTIFACT_DIR" "$FRONTEND_PUBLISH_DIR"
  run mkdir -p "$FRONTEND_ARTIFACT_DIR" "$FRONTEND_PUBLISH_DIR"
  run cp -R "$ROOT_DIR/docs/." "$FRONTEND_ARTIFACT_DIR/"
else
  bash scripts/sync_github_pages.sh
  rm -rf "$FRONTEND_ARTIFACT_DIR" "$FRONTEND_PUBLISH_DIR"
  mkdir -p "$FRONTEND_ARTIFACT_DIR" "$FRONTEND_PUBLISH_DIR"
  cp -R "$ROOT_DIR/docs/." "$FRONTEND_ARTIFACT_DIR/"
fi
run node scripts/prepare_target_frontend_config.mjs "$FRONTEND_ARTIFACT_DIR/data/supabase-config.js" "$API_BASE_URL" api "$API_AUTH_MODE"
run npm run security:api-gateway -- --production-config "$FRONTEND_ARTIFACT_DIR/data/supabase-config.js"

if [[ "$RUN_DOCKER" == "1" ]]; then
  stage "Build API image"
  require docker
  run docker build -f Dockerfile.api -t "$API_IMAGE" .
fi

if [[ "$RUN_TRIVY" == "1" ]]; then
  stage "Trivy image scan"
  require trivy
  run trivy image --exit-code 1 --severity HIGH,CRITICAL "$API_IMAGE"
fi

if [[ "$RUN_PUSH" == "1" ]]; then
  stage "Push API image"
  require docker
  run docker push "$API_IMAGE"
fi

if [[ "$RUN_HELM" == "1" || ( "$RUN_HELM" == "auto" && -x "$(command -v helm 2>/dev/null || true)" ) ]]; then
  stage "Helm validate"
  require helm
  API_HOST="$(api_host)"
  run helm lint "$HELM_CHART" \
    --values "$LOCAL_HELM_VALUES" \
    --set image.repository="$API_IMAGE_REPOSITORY" \
    --set image.tag="$BUILD_NUMBER" \
    --set ingress.host="$API_HOST"
  run_shell "helm template '$HELM_RELEASE' '$HELM_CHART' \
    --namespace '$K8S_NAMESPACE' \
    --values '$LOCAL_HELM_VALUES' \
    --set image.repository='$API_IMAGE_REPOSITORY' \
    --set image.tag='$BUILD_NUMBER' \
    --set ingress.host='$API_HOST' \
    --set config.allowedOrigin='$FRONTEND_BASE_URL' \
    --set config.apiAuthMode='$API_AUTH_MODE' \
    --set config.authEmailHeader='$AUTH_EMAIL_HEADER' \
    --set config.authSubjectHeader='$AUTH_SUBJECT_HEADER' \
    --set database.host='$DB_HOST' \
    --set database.port='$DB_PORT' \
    --set database.name='$DB_NAME' \
    --set database.user='$DB_USER' \
    --set secrets.databasePasswordSecretName='$DB_PASSWORD_SECRET_NAME' \
    --set storage.profileImageBucket='$PROFILE_IMAGE_BUCKET' \
    --set storage.contactImageBucket='$CONTACT_IMAGE_BUCKET' > .local-gematik/versorgungs-kompass-rendered.yaml"
else
  warn_missing helm
fi

stage "Publish frontend artifact"
run cp -R "$FRONTEND_ARTIFACT_DIR/." "$FRONTEND_PUBLISH_DIR/"

if [[ "$DEPLOY_TO_K8S" == "1" ]]; then
  stage "Deploy API to Kubernetes"
  require kubectl
  require helm
  API_HOST="$(api_host)"
  run_shell "kubectl create namespace '$K8S_NAMESPACE' --dry-run=client -o yaml | kubectl apply -f -"
  run_shell "kubectl -n '$K8S_NAMESPACE' create secret generic '$DB_PASSWORD_SECRET_NAME' --from-literal=password='$DB_PASSWORD' --dry-run=client -o yaml | kubectl apply -f -"
  run helm upgrade --install "$HELM_RELEASE" "$HELM_CHART" \
    --namespace "$K8S_NAMESPACE" \
    --values "$LOCAL_HELM_VALUES" \
    --atomic \
    --wait \
    --timeout 10m \
    --set image.repository="$API_IMAGE_REPOSITORY" \
    --set image.tag="$BUILD_NUMBER" \
    --set ingress.host="$API_HOST" \
    --set config.allowedOrigin="$FRONTEND_BASE_URL" \
    --set config.apiAuthMode="$API_AUTH_MODE" \
    --set config.authEmailHeader="$AUTH_EMAIL_HEADER" \
    --set config.authSubjectHeader="$AUTH_SUBJECT_HEADER" \
    --set database.host="$DB_HOST" \
    --set database.port="$DB_PORT" \
    --set database.name="$DB_NAME" \
    --set database.user="$DB_USER" \
    --set secrets.databasePasswordSecretName="$DB_PASSWORD_SECRET_NAME" \
    --set storage.profileImageBucket="$PROFILE_IMAGE_BUCKET" \
    --set storage.contactImageBucket="$CONTACT_IMAGE_BUCKET"
fi

if [[ "$RUN_SMOKE" == "1" ]]; then
  stage "Smoke test"
  if [[ "$DEPLOY_TO_K8S" == "1" ]]; then
    require kubectl
    run kubectl -n "$K8S_NAMESPACE" rollout status "deployment/${HELM_RELEASE}-api" --timeout=180s
  fi
  if [[ -n "${SMOKE_TEST_URL:-}" ]]; then
    run curl -fsS "$SMOKE_TEST_URL/api/healthz"
  else
    echo "SMOKE_TEST_URL nicht gesetzt; externer Health-Check wird uebersprungen."
  fi
fi

stage "Simulation complete"
echo "Frontend artifact: $FRONTEND_ARTIFACT_DIR"
echo "Published frontend copy: $FRONTEND_PUBLISH_DIR"
echo "Rendered Helm manifest: .local-gematik/versorgungs-kompass-rendered.yaml"
