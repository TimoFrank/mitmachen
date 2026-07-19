resource "google_compute_network" "main" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required["compute.googleapis.com"]]
}

resource "google_compute_subnetwork" "gke" {
  name                     = "${local.name_prefix}-gke"
  region                   = var.GCP_REGION
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.20.0.0/20"
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "${local.name_prefix}-pods"
    ip_cidr_range = "10.24.0.0/14"
  }

  secondary_ip_range {
    range_name    = "${local.name_prefix}-services"
    ip_cidr_range = "10.28.0.0/20"
  }
}

resource "google_compute_global_address" "private_service_access" {
  name          = "${local.name_prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_access.name]

  depends_on = [google_project_service.required["servicenetworking.googleapis.com"]]
}

resource "google_compute_router" "gke" {
  name    = "${local.name_prefix}-router"
  region  = var.GCP_REGION
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "gke" {
  name                               = "${local.name_prefix}-nat"
  router                             = google_compute_router.gke.name
  region                             = google_compute_router.gke.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_compute_global_address" "gke_ingress" {
  name         = "${local.name_prefix}-api"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"

  depends_on = [google_project_service.required["compute.googleapis.com"]]
}
