resource "google_secret_manager_secret" "database_password" {
  secret_id = var.DB_PASSWORD_SECRET_NAME

  replication {
    user_managed {
      replicas {
        location = var.GCP_REGION
      }
    }
  }

  annotations = {
    purpose = "Cloud SQL application user password; value is populated outside Terraform"
  }

  depends_on = [google_project_service.required["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_iam_member" "database_password_workload" {
  project   = var.GCP_PROJECT_ID
  secret_id = google_secret_manager_secret.database_password.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.gke_api_workload_principal

  depends_on = [google_container_cluster.autopilot]
}

# The OAuth client is bootstrapped outside Terraform so its credentials never enter state.
# GitHub receives read access only on this one existing secret and materializes a
# namespace-local Kubernetes Secret immediately before Helm reconciles BackendConfig.
resource "google_secret_manager_secret_iam_member" "iap_oauth_bootstrap_deployer" {
  project   = var.GCP_PROJECT_ID
  secret_id = var.IAP_OAUTH_BOOTSTRAP_SECRET_NAME
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"

  depends_on = [google_project_service.required["secretmanager.googleapis.com"]]
}
