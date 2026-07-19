resource "google_storage_bucket" "frontend" {
  name                        = local.frontend_bucket
  location                    = var.GCP_REGION
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = 30
      num_newer_versions         = 3
    }
  }

  depends_on = [google_project_service.required["storage.googleapis.com"]]
}

resource "google_storage_bucket" "data" {
  for_each = local.data_buckets

  name                        = each.value
  location                    = var.GCP_REGION
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = 30
      num_newer_versions         = 3
    }
  }

  depends_on = [google_project_service.required["storage.googleapis.com"]]
}

resource "google_storage_bucket_iam_member" "workload_object_user" {
  for_each = google_storage_bucket.data

  bucket = each.value.name
  role   = "roles/storage.objectUser"
  member = local.gke_api_workload_principal

  depends_on = [google_container_cluster.autopilot]
}

resource "google_storage_bucket_iam_member" "frontend_deployer" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_storage_bucket_iam_member" "frontend_deployer_bucket_reader" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_storage_bucket_iam_member" "frontend_workload_viewer" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = local.gke_frontend_workload_principal

  depends_on = [google_container_cluster.autopilot]
}

resource "google_storage_bucket_iam_member" "frontend_workload_bucket_reader" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.legacyBucketReader"
  member = local.gke_frontend_workload_principal

  depends_on = [google_container_cluster.autopilot]
}
