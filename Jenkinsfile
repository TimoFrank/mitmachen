pipeline {
  agent any

  environment {
    PROJECT_ID = credentials('gcp-project-id')
    REGION = 'europe-west3'
    REPOSITORY = 'versorgungs-kompass'
    FRONTEND_SERVICE = 'versorgungs-kompass-frontend'
    API_SERVICE = 'versorgungs-kompass-api'
    SUPABASE_URL = credentials('versorgungs-supabase-url')
    SUPABASE_ANON_KEY = credentials('versorgungs-supabase-anon-key')
    API_BASE_URL = credentials('versorgungs-api-base-url')
    FRONTEND_BASE_URL = credentials('versorgungs-frontend-base-url')
    FRONTEND_IMAGE = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${FRONTEND_SERVICE}:${env.BUILD_NUMBER}"
    API_IMAGE = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${API_SERVICE}:${env.BUILD_NUMBER}"
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
          node -e 'const fs=require("fs"); const p="docs/data/supabase-config.js"; let s=fs.readFileSync(p,"utf8"); s=s.replace(/apiBaseUrl:\\s*"[^"]*"/, `apiBaseUrl: "${process.env.API_BASE_URL}"`); s=s.includes("requireApiGateway") ? s.replace(/requireApiGateway:\\s*(true|false)/, "requireApiGateway: true") : s.replace(/apiBaseUrl:\\s*"[^"]*"/, (m) => `${m},\\n  requireApiGateway: true`); fs.writeFileSync(p,s);'
          node -e 'const fs=require("fs"); const s=fs.readFileSync("docs/data/supabase-config.js","utf8"); if(!/apiBaseUrl:\\s*"https?:\\/\\//.test(s) || !/requireApiGateway:\\s*true/.test(s)) throw new Error("Produktionsartefakt muss apiBaseUrl und requireApiGateway=true setzen.");'
          npm run security:api-gateway -- --production-config docs/data/supabase-config.js
        '''
      }
    }

    stage('Build containers') {
      steps {
        sh 'docker build -t "$FRONTEND_IMAGE" .'
        sh 'docker build -f Dockerfile.api -t "$API_IMAGE" .'
      }
    }

    stage('Push containers') {
      steps {
        sh 'gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet'
        sh 'docker push "$FRONTEND_IMAGE"'
        sh 'docker push "$API_IMAGE"'
      }
    }

    stage('Deploy API') {
      steps {
        sh '''
          gcloud run deploy "$API_SERVICE" \
            --project "$PROJECT_ID" \
            --region "$REGION" \
            --image "$API_IMAGE" \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "SUPABASE_URL=$SUPABASE_URL,SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY,ALLOWED_ORIGIN=$FRONTEND_BASE_URL"
        '''
      }
    }

    stage('Deploy frontend') {
      steps {
        sh '''
          gcloud run deploy "$FRONTEND_SERVICE" \
            --project "$PROJECT_ID" \
            --region "$REGION" \
            --image "$FRONTEND_IMAGE" \
            --platform managed \
            --allow-unauthenticated
        '''
      }
    }
  }
}
