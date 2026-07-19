data "google_project" "current" {
  project_id = var.GCP_PROJECT_ID
}

locals {
  environment       = "pre-gematik"
  gke_location      = coalesce(var.GKE_LOCATION, var.GCP_REGION)
  api_ksa_name      = "versorgungs-kompass-api"
  frontend_ksa_name = "versorgungs-kompass-frontend"
  name_prefix       = "vk-pre-gematik"

  labels = {
    application = "versorgungs-kompass"
    environment = local.environment
    managed_by  = "terraform"
  }

  frontend_bucket = coalesce(
    var.FRONTEND_BUCKET,
    "${var.GCP_PROJECT_ID}-${local.name_prefix}-frontend"
  )
  profile_image_bucket = coalesce(
    var.PROFILE_IMAGE_BUCKET,
    "${var.GCP_PROJECT_ID}-${local.name_prefix}-profiles"
  )
  contact_image_bucket = coalesce(
    var.CONTACT_IMAGE_BUCKET,
    "${var.GCP_PROJECT_ID}-${local.name_prefix}-contacts"
  )
  contact_note_attachment_bucket = coalesce(
    var.CONTACT_NOTE_ATTACHMENT_BUCKET,
    "${var.GCP_PROJECT_ID}-${local.name_prefix}-attachments"
  )

  data_buckets = {
    profile_images = local.profile_image_bucket
    contact_images = local.contact_image_bucket
    attachments    = local.contact_note_attachment_bucket
  }

  gke_api_workload_principal      = "principal://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.GCP_PROJECT_ID}.svc.id.goog/subject/ns/${var.K8S_NAMESPACE}/sa/${local.api_ksa_name}"
  gke_frontend_workload_principal = "principal://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.GCP_PROJECT_ID}.svc.id.goog/subject/ns/${var.K8S_NAMESPACE}/sa/${local.frontend_ksa_name}"
}
