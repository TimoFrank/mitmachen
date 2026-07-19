resource "google_container_cluster" "autopilot" {
  name     = var.GKE_CLUSTER_NAME
  location = local.gke_location

  enable_autopilot    = true
  deletion_protection = var.DELETION_PROTECTION
  network             = google_compute_network.main.id
  subnetwork          = google_compute_subnetwork.gke.id
  networking_mode     = "VPC_NATIVE"

  release_channel {
    channel = "REGULAR"
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "${local.name_prefix}-pods"
    services_secondary_range_name = "${local.name_prefix}-services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = true
  }

  control_plane_endpoints_config {
    dns_endpoint_config {
      allow_external_traffic = true
    }

    ip_endpoints_config {
      enabled = false
    }
  }

  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  workload_identity_config {
    workload_pool = "${var.GCP_PROJECT_ID}.svc.id.goog"
  }

  cluster_autoscaling {
    auto_provisioning_defaults {
      service_account = google_service_account.gke_nodes.email
      oauth_scopes = [
        "https://www.googleapis.com/auth/cloud-platform",
      ]
    }
  }

  secret_sync_config {
    enabled = true

    rotation_config {
      enabled           = true
      rotation_interval = "300s"
    }
  }

  security_posture_config {
    mode               = "BASIC"
    vulnerability_mode = "VULNERABILITY_BASIC"
  }

  resource_labels = local.labels

  lifecycle {
    precondition {
      condition     = local.gke_location == var.GCP_REGION
      error_message = "This scaffold uses one regional subnet; GKE_LOCATION must equal GCP_REGION."
    }
  }

  depends_on = [
    google_project_iam_member.gke_nodes,
    google_project_service.required["container.googleapis.com"],
    google_project_service.required["secretmanager.googleapis.com"],
  ]
}
