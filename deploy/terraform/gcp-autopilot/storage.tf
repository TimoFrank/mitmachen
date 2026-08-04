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

resource "google_storage_bucket" "password_invitation" {
  name                        = local.password_invitation_bucket
  location                    = var.GCP_REGION
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = false
  }

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age = 3
    }
  }

  depends_on = [google_project_service.required["storage.googleapis.com"]]
}

data "google_iam_policy" "password_invitation" {
  binding {
    role    = google_project_iam_custom_role.password_invitation_broker_storage.name
    members = [local.gke_password_reset_workload_principal]

    condition {
      title       = "active-password-invitations-only"
      description = "The public broker may read and consume only active invitation objects."
      expression  = "resource.name.startsWith('projects/_/buckets/${google_storage_bucket.password_invitation.name}/objects/active/')"
    }
  }

  dynamic "binding" {
    for_each = length(var.PASSWORD_INVITATION_OPERATOR_MEMBERS) > 0 ? [true] : []

    content {
      role    = google_project_iam_custom_role.password_invitation_operator_storage.name
      members = sort(tolist(var.PASSWORD_INVITATION_OPERATOR_MEMBERS))

      condition {
        title       = "password-invitation-operators-only"
        description = "Explicit operators may use only prepared and active invitation objects."
        expression  = "resource.name.startsWith('projects/_/buckets/${google_storage_bucket.password_invitation.name}/objects/prepared/') || resource.name.startsWith('projects/_/buckets/${google_storage_bucket.password_invitation.name}/objects/active/')"
      }
    }
  }
}

resource "google_storage_bucket_iam_policy" "password_invitation" {
  bucket      = google_storage_bucket.password_invitation.name
  policy_data = data.google_iam_policy.password_invitation.policy_data

  depends_on = [google_container_cluster.autopilot]
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
