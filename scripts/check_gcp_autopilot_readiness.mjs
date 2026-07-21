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
  "deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml",
  "deploy/helm/versorgungs-kompass/values.schema.json",
  "deploy/helm/versorgungs-kompass/templates/backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-backendconfig.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-serviceaccount.yaml",
  "deploy/helm/versorgungs-kompass/templates/frontend-service.yaml",
  "deploy/helm/versorgungs-kompass/templates/managedcertificate.yaml",
  "deploy/helm/versorgungs-kompass/templates/networkpolicy.yaml",
  "deploy/helm/versorgungs-kompass/templates/secretsync.yaml",
  "deploy/helm/versorgungs-kompass/templates/serviceaccount.yaml",
  "deploy/terraform/gcp-autopilot/gke.tf",
  "deploy/terraform/gcp-autopilot/budget.tf",
  "deploy/terraform/gcp-autopilot/backend.tf",
  "deploy/terraform/gcp-autopilot/dns.tf",
  "deploy/terraform/gcp-autopilot/identities.tf",
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
      /gcloud secrets versions access latest/,
      /--out-file "\$oauth_source_file"/,
      /create secret generic "\$IAP_OAUTH_CLIENT_CREDENTIALS_SECRET_NAME"/,
      /oauthClientCredentialsSecretName/,
      /IAP_RESOURCE_ACCESS_PRINCIPAL/,
      /\^\(group\|user\):/,
      /group:name@example\.org or user:name@example\.org/,
      /IAP_PROJECT_BREAK_GLASS_SHA256/,
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
      /mitmachen\.timo-frank\.de\|pre-gematik\.versorgungs-kompass\.timo-frank\.de/,
      /primary_certificate_name="\$\{HELM_RELEASE\}-mitmachen"/,
      /alias_certificate_name="\$\{HELM_RELEASE\}-api"/,
      /mitmachen\.timo-frank\.de must be the canonical origin and pre-gematik\.versorgungs-kompass\.timo-frank\.de its redirect-only legacy host/,
      /The canonical and legacy domains do not match the approved pre-gematik certificate pair/,
      /WIF_PROVIDER does not belong to GCP_PROJECT_ID/,
      /gcloud iap web set-iam-policy/,
      /already contains an unknown member, role or condition; refusing automatic reconciliation/,
      /A backend-specific IAP policy contains an unapproved member or role/,
      /--resource-type=backend-services/,
      /api_backend_service/,
      /frontend_backend_service/,
      /if \[\[ -z "\$backends_json" \]\]; then[\s\S]*backends_json='\{\}'/,
      /kubectl[\s\S]*exec[\s\S]*--stdin[\s\S]*node --input-type=module <<'NODE'/,
      /--read-only/,
      /requiredTables/,
      /hospitation_observation_changes/,
      /cloudsqlsuperuser/,
      /vk_app_runtime/,
      /vk_deployment_ddl_must_be_denied/,
      /build_static_frontend\.sh[\s\S]*--profile target[\s\S]*--output dist\/target/,
      /dist\/target\/data\/runtime-config\.js/,
      /steps\.build\.outputs\.digest/,
      /image\.digest/,
      /release_uri="gs:\/\/\$\{FRONTEND_BUCKET\}\/releases\/\$\{FRONTEND_RELEASE_ID\}"/
    ],
    reason: "GitHub Actions nutzt Environment, schluesselloses WIF, DNS-Endpunkt, den zweistufigen IAP-Rollout und den vollstaendigen DB-Vertragscheck."
  },
  {
    file: "api/Dockerfile",
    patterns: [/^FROM\s+node:[^\s]+@sha256:[a-f0-9]{64}/m, /USER node/, /EXPOSE 8080/, /frontend\/data\/activity-model\.js/],
    reason: "API-Image nutzt eine feste Basis-Image-Pruefsumme und ist auf Port 8080 sowie Non-Root-Betrieb vorbereitet."
  },
  {
    file: "api/server.mjs",
    patterns: [/DB_SSL_MODE/, /\/api\/auth\/bootstrap/, /access-control-allow-credentials/, /not\.in\./, /withDomainTransaction/, /hospitation_observation_changes/],
    reason: "API unterstuetzt den Cloud-SQL-TLS-Vertrag, IAP-Browser-Bootstrap und atomare Plain-Postgres-Fachvorgaenge."
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
    patterns: [/demo-profile-admin\.svg/, /demo-profile-editor\.svg/, /demo-profile-viewer\.svg/],
    reason: "Die neutralen Demo-Avatare werden in beide getrennten Frontend-Artefakte uebernommen."
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
    patterns: [/apiAuthMode:\s*iap/, /cloudSqlProxy:/, /secretSync:/, /frontend:/, /contentRevision:/, /managedCertificate:/, /automountServiceAccountToken:\s*false/, /readOnlyRootFilesystem:\s*true/, /cloud-sql-proxy:[^\s]+@sha256:[a-f0-9]{64}/, /google-cloud-cli:[^\s]+@sha256:[a-f0-9]{64}/],
    reason: "GCP-Overlay aktiviert IAP, Cloud-SQL-Proxy, SecretSync, Managed Certificate und gehaertete API-/Frontend-Pods."
  },
  {
    file: "deploy/helm/versorgungs-kompass/templates/frontend-deployment.yaml",
    patterns: [/frontendServiceAccountName/, /automountServiceAccountToken/, /releasePrefix/, /contentRevision/],
    reason: "Frontend nutzt eine eigene Workload-Identity ohne Kubernetes-API-Token und laedt eine unveraenderliche Release-Revision."
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
    patterns: [/assertion\.environment/, /attribute_condition\s*=\s*[^\n]*assertion\.ref/, /roles\/iam\.workloadIdentityUser/, /roles\/cloudsql\.client/, /workload_cloudsql_client[\s\S]*depends_on\s*=\s*\[google_container_cluster\.autopilot\]/, /iap\.webServices\.getIamPolicy/, /iap\.webServices\.setIamPolicy/, /preGematikDeploymentVerifier/, /cloudsql\.instances\.get/, /storage\.buckets\.get/],
    reason: "Workload Identity ist auf Repository, Environment und Git-Ref begrenzt; Cloud-SQL-, Bucket-Metadaten- und granulare IAP-Policy-Rechte sind explizit."
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
  "IAP_PROJECT_BREAK_GLASS_SHA256"
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
