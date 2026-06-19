pipeline {
  agent any

  environment {
    ARTIFACT_REGISTRY = credentials('versorgungs-artifact-registry')
    API_SERVICE = 'versorgungs-kompass-api'
    API_IMAGE_REPOSITORY = "${ARTIFACT_REGISTRY}/${API_SERVICE}"
    API_IMAGE = "${API_IMAGE_REPOSITORY}:${env.BUILD_NUMBER}"
    API_BASE_URL = credentials('versorgungs-api-base-url')
    FRONTEND_BASE_URL = credentials('versorgungs-frontend-base-url')
    FRONTEND_BUCKET_URI = credentials('versorgungs-frontend-bucket-uri')
    K8S_NAMESPACE = credentials('versorgungs-k8s-namespace')
    HELM_RELEASE = 'versorgungs-kompass'
    HELM_CHART = 'deploy/helm/versorgungs-kompass'
    DB_HOST = credentials('versorgungs-postgres-host')
    DB_PORT = '5432'
    DB_NAME = 'versorgungs_kompass'
    DB_USER = 'vk_app'
    DB_PASSWORD_SECRET_NAME = credentials('versorgungs-postgres-password-secret-name')
    API_AUTH_MODE = 'trusted-header'
    AUTH_EMAIL_HEADER = 'x-auth-request-email'
    AUTH_SUBJECT_HEADER = 'x-auth-request-user'
    PROFILE_IMAGE_BUCKET = credentials('versorgungs-profile-image-bucket')
    CONTACT_IMAGE_BUCKET = credentials('versorgungs-contact-image-bucket')
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Static checks') {
      steps {
        sh 'npm run check'
      }
    }

    stage('Dependency audit') {
      steps {
        sh 'npm run security:audit'
      }
    }

    stage('SAST') {
      steps {
        sh 'docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan --config p/javascript --config p/secrets --config p/owasp-top-ten /src'
      }
    }

    stage('Secret scan') {
      steps {
        sh 'docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --no-git --redact --verbose'
      }
    }

    stage('Visual smoke') {
      steps {
        sh 'npx playwright install --with-deps chromium'
        sh 'npm run test:visual'
      }
    }

    stage('Prepare frontend artifact') {
      steps {
        sh 'bash scripts/sync_github_pages.sh'
        sh '''
          node scripts/prepare_target_frontend_config.mjs docs/data/supabase-config.js "$API_BASE_URL" api "$API_AUTH_MODE"
          npm run security:api-gateway -- --production-config docs/data/supabase-config.js
        '''
      }
    }

    stage('Build API image') {
      steps {
        sh 'docker build -f Dockerfile.api -t "$API_IMAGE" .'
      }
    }

    stage('Trivy image scan') {
      steps {
        sh 'trivy image --exit-code 1 --severity HIGH,CRITICAL "$API_IMAGE"'
      }
    }

    stage('Push API image') {
      steps {
        sh '''
          REGISTRY_HOST="$(printf "%s" "$ARTIFACT_REGISTRY" | cut -d/ -f1)"
          if command -v gcloud >/dev/null 2>&1; then
            gcloud auth configure-docker "$REGISTRY_HOST" --quiet
          fi
          docker push "$API_IMAGE"
        '''
      }
    }

    stage('Helm validate') {
      steps {
        sh '''
          API_HOST="$(node -e 'console.log(new URL(process.env.API_BASE_URL).host)')"
          helm lint "$HELM_CHART" \
            --set image.repository="$API_IMAGE_REPOSITORY" \
            --set image.tag="$BUILD_NUMBER" \
            --set ingress.host="$API_HOST"
          helm template "$HELM_RELEASE" "$HELM_CHART" \
            --namespace "$K8S_NAMESPACE" \
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
            --set storage.contactImageBucket="$CONTACT_IMAGE_BUCKET" >/tmp/versorgungs-kompass-rendered.yaml
        '''
      }
    }

    stage('Publish frontend artifact') {
      steps {
        sh 'gcloud storage rsync --recursive --delete-unmatched-destination-objects docs "$FRONTEND_BUCKET_URI"'
      }
    }

    stage('Deploy API to Kubernetes') {
      steps {
        sh '''
          API_HOST="$(node -e 'console.log(new URL(process.env.API_BASE_URL).host)')"
          helm upgrade --install "$HELM_RELEASE" "$HELM_CHART" \
            --namespace "$K8S_NAMESPACE" \
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
        '''
      }
    }

    stage('Smoke test') {
      steps {
        sh '''
          kubectl -n "$K8S_NAMESPACE" rollout status "deployment/${HELM_RELEASE}-api" --timeout=180s
          curl -fsS "$API_BASE_URL/api/healthz"
        '''
      }
    }
  }
}
