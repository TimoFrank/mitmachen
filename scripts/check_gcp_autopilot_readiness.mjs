import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const strictEnvironment = process.argv.includes("--environment");

const requiredFiles = [
  ".github/workflows/deploy-pre-gematik.yml",
  ".dockerignore",
  "api/Dockerfile",
  "api/server.mjs",
  "scripts/test_api_postgres_contracts.mjs",
  "scripts/test_pre_gematik_postgres_schema.mjs",
  "scripts/generate_pre_gematik_synthetic_seed.mjs",
  "scripts/build_static_frontend.sh",
  "scripts/test_deployment_separation.mjs",
  "scripts/reconcile_pre_gematik_iap_identity_mode.sh",
  "scripts/test_iap_identity_mode_reconcile.mjs",
  "frontend/public-entry/index.html",
  "frontend/public-entry/public-entry.css",
  "frontend/identity-portal/package-lock.json",
  "frontend/identity-portal/public/index.html",
  "frontend/identity-portal/public/konto/passwort-festlegen/index.html",
  "frontend/identity-portal/src/app.jsx",
  "frontend/identity-portal/src/action.jsx",
  "dokumentation/betrieb-und-deployment/DEPLOYMENT_GCP_AUTOPILOT.md",
  "deploy/postgres/pre-gematik/README.md",
  "deploy/postgres/pre-gematik/schema.sql",
  "deploy/postgres/pre-gematik/runtime-role.sql",
  "deploy/postgres/pre-gematik/grants.sql",
  "deploy/postgres/pre-gematik/seed.example.sql",
  "deploy/postgres/pre-gematik/seed.synthetic.sql",
  "deploy/postgres/pre-gematik/seed.synthetic-profile-avatars.sql",
  "public/demo-profile-admin.svg",
  "public/demo-profile-editor.svg",
  "public/demo-profile-viewer.svg",
  "public/media/social/mitmachen-share-v3.png",
  "deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml",
  "deploy/helm/versorgungs-kompass/values.schema.json",
  "deploy/helm/versorgungs-kompass/templates/configmap.yaml",
  "deploy/helm/versorgungs-kompass/templates/backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-serviceaccount.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-public-service.yaml",
  "deploy/helm/versorgungs-kompass/files/frontend-auth-proxy.conf",
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-configmap.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-serviceaccount.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-service.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-serviceaccount.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-service.yaml",
  "deploy/helm/versorgungs-kompass/files/frontend-public.conf",
  "deploy/frontend-public/Dockerfile",
  "deploy/helm/versorgungs-kompass/templates/managedcertificate.yaml",
  "deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml",
  "deploy/helm/versorgungs-kompass/templates/secretsync.yaml",
  "deploy/helm/versorgungs-kompass/templates/serviceaccount.yaml",
  "deploy/terraform/gcp-autopilot/gke.tf",
  "deploy/terraform/gcp-autopilot/budget.tf",
  "deploy/terraform/gcp-autopilot/backend.tf",
  "deploy/terraform/gcp-autopilot/dns.tf",
  "deploy/terraform/gcp-autopilot/identities.tf",
  "deploy/terraform/gcp-autopilot/identity-platform.tf",
  "deploy/terraform/gcp-autopilot/outputs.tf",
  "deploy/terraform/gcp-autopilot/secrets.tf",
  "deploy/terraform/gcp-autopilot/sql.tf",
  "deploy/terraform/gcp-autopilot/storage.tf",
  "deploy/terraform/gcp-autopilot/terraform.tfvars.example",
  "deploy/terraform/gcp-autopilot/versions.tf"
];

const contentChecks = [
  {
    file: ".github/workflows/deploy-pre-gematik.yml",
    patterns: [
      /environment:\s*(?:pre-gematik|[\s\S]*?name:\s*pre-gematik)/,
      /google-github-actions\/auth@/,
      /workload_identity_provider/,
      /--dns-endpoint/,
      /helm upgrade\s+--install|helm upgrade --install/,
      /FRONTEND_BUCKET/,
      /iapJwtAudience/,
      /IAP_OAUTH_BOOTSTRAP_SECRET_NAME/,
      /IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME/,
      /IDENTITY_PLATFORM_API_KEY:\s*\$\{\{\s*vars\.IDENTITY_PLATFORM_API_KEY\s*\}\}/,
      /IDENTITY_PLATFORM_API_KEY must provide the browser-visible Identity Platform Web API key in every identity mode/,
      /\[\[ "\$IDENTITY_PLATFORM_API_KEY" != "\$IAP_EXTERNAL_AUTH_API_KEY" \]\]/,
      /\[\[ "\$IAP_EXTERNAL_LOGIN_PAGE_URI" != "\$\{FRONTEND_BASE_URL\}\/anmelden" \]\]/,
      /gcloud secrets versions access latest/,
      /--out-file "\$oauth_source_file"/,
      /create secret generic "\$IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME"/,
      /oauthClientCredentialsSecretName/,
      /IAP_RESOURCE_ACCESS_PRINCIPAL/,
      /\^\(group\|user\):/,
      /group:name@example\.org or user:name@example\.org/,
      /IAP_PROJECT_BREAK_GLASS_SHA256/,
      /HOSPITATION_IMPORT_OWNER_PROFILE_ID/,
      /config\.hospitationImportOwnerProfileId="\$HOSPITATION_IMPORT_OWNER_PROFILE_ID"/,
      /Project-level IAP break-glass membership differs from the protected approved policy pin/,
      /DEPLOYER_SERVICE_ACCOUNT does not belong to GCP_PROJECT_ID/,
      /GAR_REPOSITORY does not belong to GCP_PROJECT_ID\/GCP_REGION/,
      /CLOUD_SQL_INSTANCE_CONNECTION_NAME does not belong to GCP_PROJECT_ID\/GCP_REGION/,
      /All frontend and protected data buckets must be distinct/,
      /gcloud storage buckets describe[^\n]+--raw/,
      /projectNumber/,
      /uniformBucketLevelAccess\.enabled == true/,
      /publicAccessPrevention == "enforced"/,
      /gcloud artifacts docker tags list/,
      /Artifact Registry returned an invalid tag inventory/,
      /gcloud storage objects list/,
      /Cloud Storage returned an invalid release-marker inventory/,
      /domain_mode="prepare"/,
      /domain_mode="canonical"/,
      /DOMAIN_MODE: \$\{\{ steps\.config\.outputs\.domain_mode \}\}/,
      /The approved canonical origin must be either mitmachen\.timo-frank\.de during certificate preparation or versorgungs-kompass\.de after cutover/,
      /gke\.managedCertificate\.name=\$\{HELM_RELEASE\}-domain/,
      /gke\.managedCertificate\.domains\[1\]=www\.versorgungs-kompass\.de/,
      /gke\.managedCertificate\.additionalCertificates\[0\]\.name=\$\{HELM_RELEASE\}-mitmachen/,
      /gke\.managedCertificate\.additionalCertificates\[1\]\.name=\$\{HELM_RELEASE\}-api/,
      /API_HOST does not match an approved pre-gematik domain mode/,
      /Require DNS and active certificates before canonical cutover/,
      /dig \+short A "\$host"/,
      /All approved ManagedCertificates must be spec-identical and Active before canonical cutover/,
      /The preparation release must expose all approved hosts and certificates before cutover/,
      /domain-cutover-probe\?source=deployment/,
      /Redirect contract failed for/,
      /WIF_PROVIDER does not belong to GCP_PROJECT_ID/,
      /gcloud iap web set-iam-policy/,
      /A backend-specific IAP policy differs from the exact approved state; clear both resource policies in the controlled cutover before retrying/,
      /A backend-specific IAP policy does not match the exact approved principal policy/,
      /--resource-type=backend-services/,
      /api_backend_service/,
      /frontend_backend_service/,
      /public_frontend_backend_service/,
      /gcloud compute url-maps describe/,
      /public_entry_iap_enabled/,
      /force_public_iap_enabled "\$existing_public_backend"/,
      /--iap=disabled/,
      /deploy_release "\$iap_audience" false/,
      /data-public-entry="home"/,
      /frontend\.publicEntry\.rootAliasHosts\[0\]=www\.versorgungs-kompass\.de/,
      /\/public\/media\/social\/mitmachen-share-v3\.png/,
      /WhatsApp\/2\.24\.7\.75 A/,
      /whatsapp_share_status/,
      /public_ingress_is_isolated/,
      /public_url_map_is_isolated/,
      /data-public-login-button/,
      /data-identity-portal="signin"/,
      /data-identity-portal="password"/,
      /\/konto\/passwort-festlegen/,
      /\/public\/auth\/assets\/app\.js/,
      /\.emailPrivacyConfig\.enableImprovedEmailPrivacy == true/,
      /https:\/\/versorgungs-kompass\.de\/__\/auth\/handler/,
      /customUi: true/,
      /Protected path \$\{protected_path\} did not return an IAP-generated boundary response/,
      /matrix_aliases=\([\s\S]*\/;probe[\s\S]*\/anmelden;probe/,
      /Matrix alias \$\{matrix_alias\} returned a stateful, redirected, IAP-mixed, or public-entry 404/,
      /Matrix alias \$\{matrix_alias\} returned \$\{status\} without an IAP boundary marker/,
      /wait_for_boundary/,
      /backend-services get-health/,
      /Restore fail-closed public boundary after failed cutover/,
      /kubectl[\s\S]*exec[\s\S]*--stdin[\s\S]*node --input-type=module <<'NODE'/,
      /--read-only/,
      /requiredTables/,
      /hospitation_observation_changes/,
      /cloudsqlsuperuser/,
      /vk_app_runtime/,
      /vk_deployment_ddl_must_be_denied/,
      /build_static_frontend\.sh[\s\S]*--profile target[\s\S]*--output dist\/target/,
      /--identity-platform-api-key "\$IDENTITY_PLATFORM_API_KEY"/,
      /--identity-platform-project-id "\$GCP_PROJECT_ID"/,
      /dist\/target\/data\/runtime-config\.js/,
      /steps\.build\.outputs\.digest/,
      /image\.digest/,
      /release_uri="gs:\/\/\$\{FRONTEND_BUCKET\}\/releases\/\$\{FRONTEND_RELEASE_ID\}"/
    ],
    reason: "GitHub Actions nutzt Environment, schluesselloses WIF, DNS-Endpunkt, den zweistufigen IAP-Rollout, explizite Teams-/WhatsApp-Crawler-Smokes und den vollstaendigen DB-Vertragscheck."
  },
  {
    file: "api/Dockerfile",
    patterns: [/^FROM\s+node:[^\s]+@sha256:[a-f0-9]{64}/m, /USER node/, /EXPOSE 8080/, /frontend\/data\/activity-model\.js/],
    reason: "API-Image nutzt eine feste Basis-Image-Pruefsumme und ist auf Port 8080 sowie Non-Root-Betrieb vorbereitet."
  },
  {
    file: "api/server.mjs",
    patterns: [/DB_SSL_MODE/, /\/api\/auth\/bootstrap/, /access-control-allow-credentials/, /not\.in\./, /withDomainTransaction/, /hospitation_observation_changes/, /HOSPITATION_IMPORT_OWNER_PROFILE_ID/],
    reason: "API unterstuetzt den Cloud-SQL-TLS-Vertrag, IAP-Browser-Bootstrap und atomare Plain-Postgres-Fachvorgaenge."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/configmap.yaml",
    patterns: [/HOSPITATION_IMPORT_OWNER_PROFILE_ID:\s*\{\{ \.Values\.config\.hospitationImportOwnerProfileId \| quote \}\}/],
    reason: "Die stabile Hospitations-Owner-Profil-ID wird aus Helm in die API-Laufzeitkonfiguration verdrahtet."
  },
  {
    file: "deploy/helm/versorgungs-kompass/values.schema.json",
    patterns: [/"hospitationImportOwnerProfileId"/, /\[A-Za-z0-9\]\[A-Za-z0-9\._:-\]/],
    reason: "Das Helm-Schema begrenzt die Hospitations-Owner-Profil-ID auf das kanonische ID-Format."
  },
  {
    file: "deploy/postgres/pre-gematik/schema.sql",
    patterns: [/kein freigegebenes gematik-zielschema/i, /create table if not exists public\.profiles/i, /create table if not exists public\.import_runs/i, /create table if not exists public\.hospitation_observation_changes/i, /changes_canonical_reference_pair_check/i, /pre_gematik_log_hospitation_observation_change/i],
    reason: "Das temporaere PostgreSQL-16-Schema deckt Kern-, Ops- und Beobachtungs-Audit-Vertraege ab."
  },
  {
    file: "deploy/postgres/pre-gematik/runtime-role.sql",
    patterns: [/create role vk_app_runtime nologin/i, /alter role vk_app_runtime nologin/i, /revoke create on schema public from public/i],
    reason: "Die feste NOLOGIN-Laufzeitrolle entzieht PUBLIC das Erstellen von Objekten im public-Schema."
  },
  {
    file: "deploy/postgres/pre-gematik/grants.sql",
    patterns: [/\\if\s+:\{\?runtime_role\}/, /grant usage on schema public to :"runtime_role"/i, /rolcanlogin/i, /grant usage, select on sequence/i, /revoke all on function/i],
    reason: "Die NOLOGIN-Laufzeitrolle wird verpflichtend parametrisiert und erhaelt nur explizite App-Rechte."
  },
  {
    file: "deploy/postgres/pre-gematik/seed.synthetic.sql",
    patterns: [/pre-gematik-synthetic-v1/, /pg_advisory_xact_lock/i, /on conflict \("id"\) do nothing/i, /Synthetic map-contact verification failed/i],
    reason: "Der synthetische Pre-Integrationsseed ist versioniert, kollisionsgeschuetzt, idempotent und prueft den Kartenvertrag transaktional."
  },
  {
    file: "deploy/postgres/pre-gematik/seed.synthetic-profile-avatars.sql",
    patterns: [/pre-gematik-synthetic-profile-avatars-v1/, /pg_advisory_xact_lock/i, /demo-profile-admin/, /public\/demo-profile-admin\.svg/, /Synthetic profile-avatar verification failed/i],
    reason: "Der Demo-Avatar-Patch ist versioniert, auf reservierte Profile begrenzt und transaktional verifiziert."
  },
  {
    file: "scripts/build_static_frontend.sh",
    patterns: [
      /demo-profile-admin\.svg/,
      /demo-profile-editor\.svg/,
      /demo-profile-viewer\.svg/,
      /mitmachen-share-v3\.png/,
      /build_identity_portal/,
      /--identity-platform-api-key/,
      /--identity-platform-project-id/,
      /Target enthaelt nicht exakt die acht freigegebenen Portaldateien/
    ],
    reason: "Die getrennten Artefakte enthalten nur ihre freigegebenen Demo-, Share- und acht exakt allowgelisteten Identity-Portal-Dateien."
  },
  {
    file: "frontend/public-entry/index.html",
    patterns: [
      /data-public-entry="home"/,
      /data-public-login-button/,
      /href="\/start"/
    ],
    reason: "Der oeffentliche Root-CTA verweist providerneutral auf das eigene Identity-Portal."
  },
  {
    file: "frontend/identity-portal/public/index.html",
    patterns: [
      /data-identity-portal="signin"/,
      /\/public\/auth\/assets\/app\.css/,
      /\/public\/auth\/assets\/app\.js/,
      /\/public\/auth\/portal-config\.js/
    ],
    reason: "Die statische Anmeldeseite besitzt den gepinnten Marker und laedt nur lokale Portal-Artefakte."
  },
  {
    file: "frontend/identity-portal/public/konto/passwort-festlegen/index.html",
    patterns: [
      /data-identity-portal="password"/,
      /\/public\/auth\/assets\/action\.css/,
      /\/public\/auth\/assets\/action\.js/,
      /\/public\/auth\/portal-config\.js/
    ],
    reason: "Der statische Passwortaktions-Handler besitzt einen eigenen Marker und nur lokale Portal-Artefakte."
  },
  {
    file: "frontend/identity-portal/src/app.jsx",
    patterns: [
      /GoogleAuthProvider/,
      /signInWithEmailAndPassword/,
      /Mit Google anmelden/,
      /E-Mail-Adresse/
    ],
    reason: "Das Custom UI bietet ausschliesslich die vorgesehenen Google- und E-Mail/Passwort-Anmeldewege."
  },
  {
    file: "deploy/helm/versorgungs-kompass/files/frontend-auth-proxy.conf",
    patterns: [
      /location \^~ \/__\/auth\//,
      /limit_except GET HEAD POST/,
      /proxy_pass_request_headers off/,
      /proxy_ssl_name steam-capsule-341212\.firebaseapp\.com/,
      /proxy_ssl_verify on/,
      /proxy_redirect off/,
      /proxy_set_header Authorization ""/,
      /proxy_set_header Cookie ""/,
      /access_log off/
    ],
    reason: "Der kanonische Auth-Helper ist ein logfreier, methodenbegrenzter Festziel-Proxy mit TLS-Pruefung und entfernt Browser-/IAP-Credentials."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml",
    patterns: [
      /cidr: 10\.0\.0\.0\/8/,
      /port: 5432/,
      /port: 3307/
    ],
    reason: "Die API-NetworkPolicy erlaubt PostgreSQL und den privaten Cloud-SQL-Proxy-Transport nur in private Adressbereiche."
  },
  {
    file: "deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml",
    patterns: [/apiAuthMode:\s*iap/, /cloudSqlProxy:/, /secretSync:/, /frontend:/, /contentRevision:/, /publicEntry:[\s\S]*enabled:\s*true[\s\S]*image:[\s\S]*digest:\s*sha256:[a-f0-9]{64}[\s\S]*iap:[\s\S]*enabled:\s*true/, /managedCertificate:/, /automountServiceAccountToken:\s*false/, /readOnlyRootFilesystem:\s*true/, /cloud-sql-proxy:[^\s]+@sha256:[a-f0-9]{64}/, /google-cloud-cli:[^\s]+@sha256:[a-f0-9]{64}/],
    reason: "GCP-Overlay aktiviert IAP für App/API und den fail-closed Public-Bootstrap sowie Cloud-SQL-Proxy, SecretSync, Managed Certificate und gehaertete Pods."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/configmap.yaml",
    patterns: [
      /IAP_IDENTITY_MODE/,
      /IAP_GCIP_PROJECT_ID/,
      /IAP_EXTERNAL_LOGIN_PAGE_URI/,
      /IAP_EXTERNAL_AUTH_API_KEY/,
      /IAP_EXTERNAL_ACCESS_EXPIRES_AT/
    ],
    reason: "Helm verdrahtet den expliziten IAM-/External-Modus und die gepinnten External-Loginwerte in die API-Laufzeit."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml",
    patterns: [/frontendServiceAccountName/, /automountServiceAccountToken/, /releasePrefix/, /contentRevision/, /checksum\/frontend-nginx-config/],
    reason: "Frontend nutzt eine eigene Workload-Identity ohne Kubernetes-API-Token, laedt eine unveraenderliche Release-Revision und rollt bei geaenderter Nginx-Domainkonfiguration neu aus."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-public-deployment.yaml",
    patterns: [/publicImageDigest/, /frontendPublicSelectorLabels/, /frontendPublicServiceAccountName/, /automountServiceAccountToken/, /image:\s*"\{\{ \$publicImageRepository \}\}@\{\{ \$publicImageDigest \}\}"/, /_healthz/],
    reason: "Das dedizierte Public-Deployment nutzt ausschließlich ein digest-gepinntes Zwei-Dateien-Webroot aus HTML und PNG sowie eine eigene KSA ohne Kubernetes-API-Token."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-deployment.yaml",
    patterns: [
      /frontendAuthProxyServiceAccountName/,
      /automountServiceAccountToken/,
      /enableServiceLinks: false/,
      /checksum\/frontend-auth-proxy-nginx/,
      /_healthz/
    ],
    reason: "Das dedizierte Auth-Helper-Deployment verwendet seine tokenlose KSA, keine Service-Links und eine gehashte, health-gepruefte Konfiguration."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-auth-proxy-backendconfig.yaml",
    patterns: [/logging:[\s\S]*enable: false[\s\S]*iap:[\s\S]*enabled: false/],
    reason: "Das Auth-Helper-Backend ist explizit IAP-frei und deaktiviert Load-Balancer-Zugriffslogging."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-public-backendconfig.yaml",
    patterns: [/frontendPublicBackendConfigName/, /if \.Values\.frontend\.publicEntry\.backendConfig\.iap\.enabled[\s\S]*iap:[\s\S]*enabled:\s*true[\s\S]*oauthclientCredentials:/],
    reason: "Das Public-Backend aktiviert Custom-OAuth-IAP fail-closed und laesst IAP beim kontrollierten direkten Compute-Cutover bewusst unverwaltet."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/ingress.yaml",
    patterns: [
      /\$publicRootAliasHosts := \.Values\.frontend\.publicEntry\.rootAliasHosts/,
      /or \(eq \$host \$\.Values\.ingress\.host\) \(hasKey \$publicRootAliasHostSet \$host\)/,
      /path:\s*\/[\s\S]*pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /if eq \$host \$\.Values\.ingress\.host[\s\S]*path:\s*\/anmelden[\s\S]*pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/konto\/passwort-festlegen\s+pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/public\/auth\/portal-config\.js\s+pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/public\/auth\/assets\/app\.js\s+pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/public\/auth\/assets\/action\.js\s+pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/public\/auth\/brand\/versorgungs-kompass\.svg\s+pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /path:\s*\/public\/media\/social\/mitmachen-share-v3\.png[\s\S]*pathType:\s*Exact[\s\S]*frontendPublicFullname/,
      /if and \$\.Values\.frontend\.enabled \(hasKey \$redirectHosts \$host\)[\s\S]*path:\s*\/[\s\S]*pathType:\s*Prefix[\s\S]*frontendFullname/
    ],
    reason: "Das Public-Backend erhaelt am Apex nur die exakt freigegebenen Portal-, Asset-, Root- und Share-Pfade und am www-Alias nur Exact /."
  },
  {
    file: "deploy/helm/versorgungs-kompass/files/frontend-public.conf",
    patterns: [
      /map \$request_uri \$public_entry_document/,
      /map \$request_uri \$public_share_image_document/,
      /map \$request_uri \$public_auth_document/,
      /merge_slashes off/,
      /if \(\$public_entry_document = ""\)/,
      /location = \/anmelden[\s\S]*try_files \/public\/auth\/index\.html =404/,
      /location = \/konto\/passwort-festlegen[\s\S]*try_files \/public\/auth\/konto\/passwort-festlegen\/index\.html =404/,
      /location \^~ \/public\/auth\/[\s\S]*if \(\$public_auth_document = ""\)/,
      /public\/auth\/portal-config\.js/,
      /public\/auth\/assets\/app\.js/,
      /public\/auth\/assets\/action\.js/,
      /public\/auth\/brand\/versorgungs-kompass\.svg/,
      /location = \/public\/media\/social\/mitmachen-share-v3\.png/,
      /try_files \/\$public_share_image_document =404/,
      /default-src 'none'/,
      /script-src 'none'/,
      /~\^\/anmelden[\s\S]*"default-src 'none'[\s\S]*script-src 'self'/,
      /Cache-Control "no-store"/
    ],
    reason: "Der Public-nginx serviert beide Portal-Aliase und nur die expliziten lokalen Identity-/Share-Artefakte; Near-Misses und Mutationen bleiben gesperrt."
  },
  {
    file: "deploy/frontend-public/Dockerfile",
    patterns: [
      /nginx-unprivileged:[^\s]+@sha256:[a-f0-9]{64}/,
      /COPY --chown=101:101 dist\/target\/public-index\.html/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/index\.html/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/konto\/passwort-festlegen\/index\.html/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/portal-config\.js/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/assets\/app\.js/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/assets\/action\.js/,
      /COPY --chown=101:101 dist\/target\/public\/auth\/brand\/versorgungs-kompass\.svg/,
      /COPY --chown=101:101 dist\/target\/public\/media\/social\/mitmachen-share-v3\.png/,
      /find \/usr\/share\/nginx\/html -type f[\s\S]*= "10"/,
      /find \/usr\/share\/nginx\/html\/public\/auth -type f[\s\S]*= "8"/,
      /test -f \/usr\/share\/nginx\/html\/public\/media\/social\/mitmachen-share-v3\.png/,
      /data-public-login-button/,
      /data-identity-portal="signin"/,
      /data-identity-portal="password"/,
      /frontend-public\.conf/,
      /USER 101:101/,
      /nginx -t/
    ],
    reason: "Das Public-Image enthaelt exakt Root, Share-Bild und acht allowgelistete Portaldateien auf einem gepinnten Non-Root-Basisimage."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/deployment.yaml",
    patterns: [/image\.digest/, /repository[^\n]*@/],
    reason: "Das API-Deployment kann das gepruefte Container-Image unveraenderlich per Digest referenzieren."
  },
  {
    file: "deploy/helm/versorgungs-kompass/values.yaml",
    patterns: [/sync:[\s\S]*runAsNonRoot:\s*true[\s\S]*runAsUser:\s*1000[\s\S]*nginx:/],
    reason: "Der Google-CLI-Sync laeuft als registrierter cloudsdk-Nutzer und bleibt Non-Root."
  },
  {
    file: "deploy/helm/versorgungs-kompass/values.yaml",
    patterns: [/\nsecurityContext:\n[\s\S]*?runAsNonRoot:\s*true[\s\S]*?runAsUser:\s*1000[\s\S]*?runAsGroup:\s*1000/],
    reason: "Der API-Container nutzt die numerische UID und GID des registrierten Node-Nutzers."
  },
  {
    file: "deploy/terraform/gcp-autopilot/budget.tf",
    patterns: [
      /google_billing_budget/,
      /projects\/\$\{data\.google_project\.current\.number\}/,
      /threshold_percent\s*=\s*0\.5/,
      /threshold_percent\s*=\s*0\.8/,
      /spend_basis\s*=\s*"FORECASTED_SPEND"/
    ],
    reason: "Das optionale Projektbudget warnt bei abgestuften Istkosten und prognostizierter Ueberschreitung."
  },
  {
    file: "deploy/terraform/gcp-autopilot/gke.tf",
    patterns: [/enable_autopilot\s*=\s*true/, /enable_private_nodes\s*=\s*true/, /enable_private_endpoint\s*=\s*true/, /ip_endpoints_config[\s\S]*enabled\s*=\s*false/, /secret_sync_config/],
    reason: "Terraform definiert einen privaten Autopilot-Cluster mit DNS-Control-Plane und SecretSync."
  },
  {
    file: "deploy/terraform/gcp-autopilot/identities.tf",
    patterns: [/assertion\.environment/, /attribute_condition\s*=\s*[^\n]*assertion\.ref/, /roles\/iam\.workloadIdentityUser/, /roles\/cloudsql\.client/, /workload_cloudsql_client[\s\S]*depends_on\s*=\s*\[google_container_cluster\.autopilot\]/, /iap\.webServices\.getIamPolicy/, /iap\.webServices\.setIamPolicy/, /compute\.urlMaps\.get/, /preGematikPublicBackendCutover[\s\S]*compute\.backendServices\.update[\s\S]*compute\.healthChecks\.useReadOnly/, /preGematikDeploymentVerifier/, /cloudsql\.instances\.get/, /storage\.buckets\.get/],
    reason: "Workload Identity ist auf Repository, Environment und Git-Ref begrenzt; Cloud-SQL-, Bucket-, URL-Map-, Public-Cutover- und granulare IAP-Policy-Rechte sind explizit."
  },
  {
    file: "deploy/terraform/gcp-autopilot/identity-platform.tf",
    patterns: [
      /google_identity_platform_config/,
      /allow_duplicate_emails\s*=\s*false/,
      /disabled_user_signup\s*=\s*true/,
      /disabled_user_deletion\s*=\s*true/,
      /state\s*=\s*"DISABLED"/,
      /allow_tenants\s*=\s*false/,
      /prevent_destroy\s*=\s*true/
    ],
    reason: "Identity Platform ist auf admin-angelegte E-Mail-Konten ohne MFA, Duplikate, Self-Signup oder Tenants begrenzt und loeschgeschuetzt."
  },
  {
    file: "scripts/reconcile_pre_gematik_iap_identity_mode.sh",
    patterns: [
      /gcipSettings/,
      /ENROLLED_SECOND_FACTORS/,
      /workforceIdentitySettings/,
      /restore_original_settings/,
      /Compensating rollback/
    ],
    reason: "Die IAP-Umschaltung ist auf zwei geschuetzte Backends, exakte Identity Sources und einen verifizierten compensating rollback begrenzt."
  },
  {
    file: "deploy/terraform/gcp-autopilot/storage.tf",
    patterns: [/gke_frontend_workload_principal/, /gke_api_workload_principal/, /frontend_deployer_bucket_reader[\s\S]*roles\/storage\.legacyBucketReader/, /frontend_workload_bucket_reader[\s\S]*roles\/storage\.legacyBucketReader/, /frontend_workload_viewer/, /data\s+"google_iam_policy"\s+"data_bucket"/, /each\.key\s*==\s*"stakeholder_logos"[\s\S]*roles\/storage\.objectViewer[\s\S]*roles\/storage\.objectUser/, /members\s*=\s*\[local\.gke_api_workload_principal\]/, /resource\s+"google_storage_bucket_iam_policy"\s+"data"/, /removed\s*\{[\s\S]*from\s*=\s*google_storage_bucket_iam_member\.workload_object_user[\s\S]*destroy\s*=\s*false/, /frontend_workload_viewer[\s\S]*depends_on\s*=\s*\[google_container_cluster\.autopilot\]/, /frontend_workload_bucket_reader[\s\S]*depends_on\s*=\s*\[google_container_cluster\.autopilot\]/],
    reason: "Frontend-Sync und Deployment bleiben getrennt; alle privaten Daten-Buckets erhalten eine autoritative, ausschliesslich auf den API-Workload begrenzte IAM-Policy."
  },
  {
    file: "deploy/terraform/gcp-autopilot/sql.tf",
    patterns: [/POSTGRES_16/, /private_network/, /point_in_time_recovery_enabled\s*=\s*true/, /deletion_protection/],
    reason: "Cloud SQL ist privat, gesichert und loeschgeschuetzt vorbereitet."
  },
  {
    file: "deploy/terraform/gcp-autopilot/secrets.tf",
    patterns: [/google_secret_manager_secret/, /replication/, /database_password_workload[\s\S]*depends_on\s*=\s*\[google_container_cluster\.autopilot\]/, /iap_oauth_bootstrap_deployer/, /secret_id\s*=\s*var\.IAP_OAUTH_BOOTSTRAP_SECRET_NAME/, /roles\/secretmanager\.secretAccessor/],
    reason: "Secret Manager stellt nur den Datenbank-Secret-Container und secret-spezifische OAuth-Leserechte bereit; Werte bleiben ausserhalb des Terraform-State."
  }
];

const forbiddenChecks = [
  {
    files: ["deploy/helm/versorgungs-kompass/templates/frontend-public-deployment.yaml"],
    patterns: [/\binitContainers\b/, /\bgcloud\b/, /\bgs:\/\//, /frontend-public-content/],
    reason: "Der oeffentliche Pod darf weder GCS-Zugang noch einen Runtime-Sync besitzen."
  },
  {
    files: ["deploy/helm/versorgungs-kompass/templates/frontend-public-serviceaccount.yaml"],
    patterns: [/\bannotations:/],
    reason: "Die oeffentliche KSA darf keine frei konfigurierbare Cloud-Identity-Annotation besitzen."
  },
  {
    files: [".github/workflows/deploy-pre-gematik.yml"],
    patterns: [/backends_json:-\{\}/, /-- node --input-type=module --eval '/],
    reason: "IAP-JSON und DB-Smoke-Skript muessen ohne Shell-bedingte Zeichenveraenderungen ausgewertet werden."
  },
  {
    files: [".github/workflows/deploy-pre-gematik.yml"],
    patterns: [/credentials_json\s*:/, /DB_PASSWORD\s*:/, /--from-literal=(?:client_id|client_secret)/, /sync_github_pages\.sh/, /docs\/data\/supabase-config\.js/, /\brsync\b[^\n]*\bdocs\b/, /echo "- Resource-specific IAP group:/, /echo "- IAP audience:/, /echo "- Frontend release:.*gs:\/\//],
    reason: "Workflow darf weder Service-Account-Key noch Datenbankpasswort transportieren und OAuth-Werte nicht als Prozessargumente uebergeben. Das Target-Artefakt darf nicht aus docs/ stammen."
  },
  {
    files: ["deploy/postgres/pre-gematik/schema.sql"],
    patterns: [/\bauth\./i, /\bstorage\./i, /\bservice_role\b/i, /enable\s+row\s+level\s+security/i, /create\s+policy/i, /\bgrant\s+/i],
    reason: "Das aktive Plain-Postgres-Schema darf keine Supabase-Auth-/Storage-/RLS-/Rollenobjekte enthalten."
  },
  {
    files: [
      "deploy/terraform/gcp-autopilot/secrets.tf",
      "deploy/terraform/gcp-autopilot/sql.tf"
    ],
    patterns: [/google_secret_manager_secret_version/, /password\s*=\s*var\./],
    reason: "Passwoerter duerfen nicht in Terraform-State geschrieben werden."
  }
];

const requiredEnvironment = [
  "GCP_PROJECT_ID",
  "GCP_REGION",
  "GKE_CLUSTER_NAME",
  "GKE_LOCATION",
  "WIF_PROVIDER",
  "DEPLOYER_SERVICE_ACCOUNT",
  "GAR_REPOSITORY",
  "API_BASE_URL",
  "FRONTEND_BASE_URL",
  "FRONTEND_BUCKET",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD_SECRET_NAME",
  "IAP_OAUTH_BOOTSTRAP_SECRET_NAME",
  "PROFILE_IMAGE_BUCKET",
  "CONTACT_IMAGE_BUCKET",
  "CONTACT_NOTE_ATTACHMENT_BUCKET",
  "STAKEHOLDER_LOGO_BUCKET",
  "CLOUD_SQL_INSTANCE_CONNECTION_NAME",
  "GKE_INGRESS_IP_NAME",
  "K8S_NAMESPACE",
  "IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME",
  "IAP_RESOURCE_ACCESS_PRINCIPAL",
  "IAP_PROJECT_BREAK_GLASS_SHA256",
  "HOSPITATION_IMPORT_OWNER_PROFILE_ID"
];

const failures = [];

function ok(message) {
  console.log(`OK   ${message}`);
}

function fail(message) {
  failures.push(message);
  console.log(`FAIL ${message}`);
}

function source(file) {
  return readFileSync(file, "utf8");
}

for (const file of requiredFiles) {
  if (existsSync(file)) ok(`Vorhanden: ${file}`);
  else fail(`Fehlt: ${file}`);
}

for (const check of contentChecks) {
  if (!existsSync(check.file)) continue;
  const text = source(check.file);
  const missing = check.patterns.filter((pattern) => !pattern.test(text));
  if (missing.length) {
    fail(`${check.file}: Vertrag unvollstaendig (${missing.map(String).join(", ")}).`);
  } else {
    ok(check.reason);
  }
}

const storageTerraform = source("deploy/terraform/gcp-autopilot/storage.tf");
const dataPolicyStart = storageTerraform.indexOf('data "google_iam_policy" "data_bucket"');
const dataPolicyEnd = storageTerraform.indexOf('resource "google_storage_bucket_iam_policy" "data"', dataPolicyStart);
const dataPolicySource = dataPolicyStart >= 0 && dataPolicyEnd > dataPolicyStart
  ? storageTerraform.slice(dataPolicyStart, dataPolicyEnd)
  : "";
if (!dataPolicySource) {
  fail("Die autoritative IAM-Definition fuer private Daten-Buckets konnte nicht abgegrenzt werden.");
} else if (/deployer|serviceAccount:|project(?:Viewer|Editor)|allUsers|allAuthenticatedUsers/i.test(dataPolicySource)) {
  fail("Die Daten-Bucket-Policy darf weder Deployer/Projektrollen noch oeffentliche oder statische Service-Account-Member enthalten.");
} else {
  ok("Die Daten-Bucket-Policy enthaelt keinen Deployer-, Projektrollen- oder oeffentlichen Zugriffspfad.");
}

for (const check of forbiddenChecks) {
  const violations = [];
  for (const file of check.files) {
    if (!existsSync(file)) continue;
    const text = source(file);
    for (const pattern of check.patterns) {
      if (pattern.test(text)) violations.push(`${file}: ${pattern}`);
    }
  }
  if (violations.length) fail(`${check.reason} Gefunden: ${violations.join(", ")}`);
  else ok(check.reason);
}

const terraformExample = source(
  "deploy/terraform/gcp-autopilot/terraform.tfvars.example"
);
const projectIapMembers = terraformExample.match(/IAP_ACCESS_MEMBERS\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
if (/group:/.test(projectIapMembers)) {
  fail("IAP_ACCESS_MEMBERS darf keine projektweite Gruppe enthalten; Gruppen werden ressourcenspezifisch gebunden.");
} else if (!/user:[^"\s]+@[^"\s]+/.test(projectIapMembers)) {
  fail("Der direkte Break-glass-Nutzer fehlt in IAP_ACCESS_MEMBERS.");
} else {
  ok("Projektweiter IAP-Zugriff enthaelt nur den direkten Break-glass-Nutzer.");
}

if (!/IAP_RESOURCE_ACCESS_PRINCIPAL\s*=\s*"group:[a-z0-9._%+-]+@example\.invalid"/i.test(terraformExample)) {
  fail("Die ressourcenspezifische pre-gematik IAP-Gruppe fehlt als neutraler example.invalid-Platzhalter in terraform.tfvars.example.");
} else {
  ok("Die regulaere IAP-Gruppe ist separat und ohne reale Gruppenadresse fuer ressourcenspezifische Bindungen deklariert.");
}

for (const file of [
  "scripts/check_gcp_autopilot_readiness.mjs",
  "scripts/test_api_postgres_contracts.mjs",
  "scripts/test_pre_gematik_postgres_schema.mjs",
  "api/server.mjs"
]) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "ignore" });
    ok(`Syntax OK: ${file}`);
  } catch {
    fail(`Syntaxfehler: ${file}`);
  }
}

if (strictEnvironment) {
  for (const name of requiredEnvironment) {
    const value = process.env[name]?.trim();
    if (value) ok(`Environment-Variable gesetzt: ${name}`);
    else fail(`Environment-Variable fehlt: ${name}`);
  }

  const iapIdentityMode = process.env.IAP_IDENTITY_MODE?.trim() || "iam";
  if (!["iam", "external"].includes(iapIdentityMode)) {
    fail("IAP_IDENTITY_MODE muss iam oder external sein.");
  } else {
    ok(`IAP-Identity-Modus gueltig: ${iapIdentityMode}`);
  }
  if (iapIdentityMode === "external") {
    for (const name of [
      "IAP_GCIP_PROJECT_ID",
      "IAP_EXTERNAL_LOGIN_PAGE_URI",
      "IAP_EXTERNAL_AUTH_API_KEY",
      "IAP_EXTERNAL_ACCESS_EXPIRES_AT",
      "IDENTITY_PLATFORM_PASSWORD_POLICY_SHA256",
      "IDENTITY_PLATFORM_GOOGLE_LOGIN_VERIFIED_AT",
      "IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256"
    ]) {
      const value = process.env[name]?.trim();
      if (value) ok(`External-IAP-Variable gesetzt: ${name}`);
      else fail(`External-IAP-Variable fehlt: ${name}`);
    }
    if (process.env.IAP_GCIP_TENANT_ID?.trim()) {
      fail("IAP_GCIP_TENANT_ID muss fuer den project-level Pilot leer bleiben.");
    }
    if (
      process.env.IAP_GCIP_PROJECT_ID?.trim()
      && process.env.IAP_GCIP_PROJECT_ID.trim() !== process.env.GCP_PROJECT_ID?.trim()
    ) {
      fail("IAP_GCIP_PROJECT_ID muss exakt GCP_PROJECT_ID entsprechen.");
    }
  }

  const apiBaseUrl = process.env.API_BASE_URL?.trim();
  const frontendBaseUrl = process.env.FRONTEND_BASE_URL?.trim();
  if (apiBaseUrl && frontendBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl);
      const frontendUrl = new URL(frontendBaseUrl);
      if (apiUrl.protocol !== "https:" || frontendUrl.protocol !== "https:") {
        fail("API_BASE_URL und FRONTEND_BASE_URL muessen HTTPS verwenden.");
      } else if (apiUrl.origin !== frontendUrl.origin) {
        fail("GCP Autopilot erwartet Frontend und API fuer IAP unter demselben Origin.");
      } else {
        ok("Frontend und API verwenden denselben HTTPS-Origin.");
      }
    } catch {
      fail("API_BASE_URL oder FRONTEND_BASE_URL ist keine gueltige URL.");
    }
  }

  const hospitationImportOwnerProfileId = process.env.HOSPITATION_IMPORT_OWNER_PROFILE_ID?.trim();
  if (hospitationImportOwnerProfileId) {
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(hospitationImportOwnerProfileId)) {
      ok("HOSPITATION_IMPORT_OWNER_PROFILE_ID verwendet das kanonische stabile ID-Format.");
    } else {
      fail("HOSPITATION_IMPORT_OWNER_PROFILE_ID ist keine gueltige stabile Profil-ID.");
    }
  }
}

if (failures.length) {
  console.log("\nGCP Autopilot Readiness FAILED:");
  failures.forEach((message) => console.log(`- ${message}`));
  process.exit(1);
}

console.log(
  strictEnvironment
    ? "\nGCP Autopilot Readiness OK: Repository und Environment-Vertrag sind vollstaendig."
    : "\nGCP Autopilot Readiness OK: Das Repository-Scaffold ist vollstaendig. Fuer reale Variablen zusaetzlich --environment verwenden."
);
