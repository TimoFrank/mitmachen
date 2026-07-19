resource "google_service_account" "gke_nodes" {
  account_id   = "vk-pre-gematik-gke-nodes"
  display_name = "Versorgungs-Kompass pre-gematik GKE nodes"
  description  = "Least-privilege node identity for the GKE Autopilot cluster."
}

resource "google_project_iam_member" "gke_nodes" {
  project = var.GCP_PROJECT_ID
  role    = "roles/container.defaultNodeServiceAccount"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = var.WIF_POOL_ID
  display_name              = "GitHub pre-gematik"
  description               = "Keyless GitHub Actions identities restricted to the pre-gematik Environment."

  depends_on = [google_project_service.required["iam.googleapis.com"]]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.WIF_PROVIDER_ID
  display_name                       = "GitHub Actions pre-gematik"

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "assertion.environment"
    "attribute.ref"         = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.GITHUB_REPOSITORY}' && assertion.environment == '${var.GITHUB_ENVIRONMENT}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = var.DEPLOYER_SERVICE_ACCOUNT_ID
  display_name = "GitHub pre-gematik deployer"
  description  = "Keyless application deployer; not an infrastructure administrator."
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.GITHUB_REPOSITORY}"
}

resource "google_project_iam_member" "deployer_gke" {
  project = var.GCP_PROJECT_ID
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_custom_role" "iap_audience_reader" {
  role_id     = "preGematikAudienceReader"
  title       = "Pre-gematik IAP Audience Reader"
  description = "Read only the project number and global backend service metadata required to derive the IAP JWT audience."
  stage       = "GA"
  permissions = [
    "compute.backendServices.get",
    "compute.backendServices.list",
    "resourcemanager.projects.get",
  ]
}

resource "google_project_iam_member" "deployer_iap_audience_reader" {
  project = var.GCP_PROJECT_ID
  role    = google_project_iam_custom_role.iap_audience_reader.name
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_custom_role" "iap_backend_access_binder" {
  role_id     = "preGematikIapBackendBinder"
  title       = "Pre-gematik IAP backend access binder"
  description = "Manage IAM only on individual IAP web services discovered from the pre-gematik GKE Ingress."
  stage       = "GA"
  permissions = [
    "iap.webServices.getIamPolicy",
    "iap.webServices.setIamPolicy",
  ]
}

resource "google_project_iam_member" "deployer_iap_backend_access_binder" {
  project = var.GCP_PROJECT_ID
  role    = google_project_iam_custom_role.iap_backend_access_binder.name
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "workload_cloudsql_client" {
  project = var.GCP_PROJECT_ID
  role    = "roles/cloudsql.client"
  member  = local.gke_api_workload_principal

  # The GKE-managed workload identity pool does not exist until the first
  # cluster has finished provisioning, so IAM must not validate this principal earlier.
  depends_on = [google_container_cluster.autopilot]
}

resource "google_project_iam_member" "iap_access" {
  for_each = var.IAP_ACCESS_MEMBERS

  project = var.GCP_PROJECT_ID
  role    = "roles/iap.httpsResourceAccessor"
  member  = each.value
}
