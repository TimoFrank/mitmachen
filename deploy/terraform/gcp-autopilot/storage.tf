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

data "google_iam_policy" "data_bucket" {
  for_each = local.data_buckets

  binding {
    role = (
      each.key == "stakeholder_logos"
      ? "roles/storage.objectViewer"
      : "roles/storage.objectUser"
    )
    members = [local.gke_api_workload_principal]
  }
}

# Daten-Buckets erhalten eine vollstaendig explizite Policy. Dadurch bleiben die
# bei der Bucket-Anlage automatisch gesetzten Legacy-Rechte fuer Project Viewer
# und Project Editor nicht als unbeabsichtigter Zugriffspfad auf Echtdaten aktiv.
resource "google_storage_bucket_iam_policy" "data" {
  for_each = google_storage_bucket.data

  bucket      = each.value.name
  policy_data = data.google_iam_policy.data_bucket[each.key].policy_data

  depends_on = [google_container_cluster.autopilot]
}

# Der bisherige additive Member wird ohne Remote-Loeschung aus dem State geloest;
# die neue autoritative Policy uebernimmt denselben Workload-Zugriff atomar.
removed {
  from = google_storage_bucket_iam_member.workload_object_user

  lifecycle {
    destroy = false
  }
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
