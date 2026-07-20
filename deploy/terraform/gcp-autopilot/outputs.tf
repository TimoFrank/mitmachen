output "GCP_PROJECT_ID" {
  description = "Google Cloud project ID."
  value       = var.GCP_PROJECT_ID
}

output "GCP_REGION" {
  description = "Region for the pre-gematik environment."
  value       = var.GCP_REGION
}

output "GCP_PROJECT_NUMBER" {
  description = "Google Cloud project number used in the IAP JWT audience."
  value       = data.google_project.current.number
}

output "BILLING_BUDGET_NAME" {
  description = "Optional project-scoped Cloud Billing budget resource name; null when BILLING_ACCOUNT_ID is unset."
  value       = try(google_billing_budget.project[0].name, null)
}

output "GKE_CLUSTER_NAME" {
  description = "GKE Autopilot cluster name."
  value       = google_container_cluster.autopilot.name
}

output "GKE_LOCATION" {
  description = "GKE Autopilot cluster location."
  value       = google_container_cluster.autopilot.location
}

output "WIF_PROVIDER" {
  description = "Full Workload Identity provider resource name for GitHub Actions authentication."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "DEPLOYER_SERVICE_ACCOUNT" {
  description = "Keyless GitHub Actions deployment service account email."
  value       = google_service_account.deployer.email
}

output "GAR_REPOSITORY" {
  description = "Full Artifact Registry repository URI without an image name."
  value       = "${google_artifact_registry_repository.api.location}-docker.pkg.dev/${var.GCP_PROJECT_ID}/${google_artifact_registry_repository.api.repository_id}"
}

output "FRONTEND_BUCKET" {
  description = "Private frontend artifact bucket."
  value       = google_storage_bucket.frontend.name
}

output "PROFILE_IMAGE_BUCKET" {
  description = "Private profile-image bucket."
  value       = google_storage_bucket.data["profile_images"].name
}

output "CONTACT_IMAGE_BUCKET" {
  description = "Private contact-image bucket."
  value       = google_storage_bucket.data["contact_images"].name
}

output "CONTACT_NOTE_ATTACHMENT_BUCKET" {
  description = "Private contact-note attachment bucket."
  value       = google_storage_bucket.data["attachments"].name
}

output "STAKEHOLDER_LOGO_BUCKET" {
  description = "Private stakeholder-logo bucket."
  value       = google_storage_bucket.data["stakeholder_logos"].name
}

output "DB_HOST" {
  description = "Private Cloud SQL address reachable from the GKE VPC."
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "DB_NAME" {
  description = "Application database name."
  value       = google_sql_database.application.name
}

output "DB_USER" {
  description = "Application database user name to bootstrap outside Terraform."
  value       = var.DB_USER
}

output "DB_PASSWORD_SECRET_NAME" {
  description = "Secret Manager secret ID. Add the password as a secret version outside Terraform."
  value       = google_secret_manager_secret.database_password.secret_id
}

output "IAP_OAUTH_BOOTSTRAP_SECRET_NAME" {
  description = "Existing Secret Manager secret read by the deployer to materialize the custom IAP OAuth Kubernetes Secret."
  value       = var.IAP_OAUTH_BOOTSTRAP_SECRET_NAME
}

output "IAP_RESOURCE_ACCESS_GROUP" {
  description = "Group that the workflow binds only to the generated API and frontend IAP backend services."
  value       = var.IAP_RESOURCE_ACCESS_GROUP
}

output "K8S_NAMESPACE" {
  description = "Kubernetes namespace for the pre-gematik deployment."
  value       = var.K8S_NAMESPACE
}

output "GKE_CONTROL_PLANE_DNS_ENDPOINT" {
  description = "IAM-protected GKE DNS endpoint; use gcloud get-credentials --dns-endpoint."
  value       = google_container_cluster.autopilot.control_plane_endpoints_config[0].dns_endpoint_config[0].endpoint
}

output "GKE_INGRESS_IP_NAME" {
  description = "Static global IPv4 resource name for the GKE Ingress annotation."
  value       = google_compute_global_address.gke_ingress.name
}

output "GKE_INGRESS_IP_ADDRESS" {
  description = "Static global IPv4 address to use in DNS."
  value       = google_compute_global_address.gke_ingress.address
}

output "PUBLIC_HOSTNAME" {
  description = "Public hostname managed by the pre-gematik Cloud DNS record."
  value       = var.PUBLIC_HOSTNAME
}

output "PUBLIC_BASE_URL" {
  description = "Shared HTTPS origin for frontend and API."
  value       = "https://${var.PUBLIC_HOSTNAME}"
}

output "CLOUD_DNS_MANAGED_ZONE" {
  description = "Existing Cloud DNS managed-zone name used by the environment."
  value       = data.google_dns_managed_zone.pre_gematik.name
}

output "CLOUD_DNS_NAME_SERVERS" {
  description = "Authoritative Google nameservers that must be delegated at the parent DNS provider."
  value       = data.google_dns_managed_zone.pre_gematik.name_servers
}

output "CLOUD_SQL_INSTANCE_CONNECTION_NAME" {
  description = "Cloud SQL connection name for administrative tooling."
  value       = google_sql_database_instance.postgres.connection_name
}

output "WORKLOAD_IDENTITY_PRINCIPAL" {
  description = "Direct API GKE Workload Identity principal bound to data buckets, Cloud SQL, and the database password secret."
  value       = local.gke_api_workload_principal
}

output "FRONTEND_WORKLOAD_IDENTITY_PRINCIPAL" {
  description = "Direct frontend GKE Workload Identity principal with read-only access to the frontend artifact bucket."
  value       = local.gke_frontend_workload_principal
}
