data "google_dns_managed_zone" "pre_gematik" {
  project = var.GCP_PROJECT_ID
  name    = var.CLOUD_DNS_MANAGED_ZONE

  depends_on = [google_project_service.required["dns.googleapis.com"]]
}

resource "google_dns_record_set" "pre_gematik" {
  project      = var.GCP_PROJECT_ID
  managed_zone = data.google_dns_managed_zone.pre_gematik.name
  name         = "${var.PUBLIC_HOSTNAME}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.gke_ingress.address]

  lifecycle {
    precondition {
      condition     = endswith("${var.PUBLIC_HOSTNAME}.", data.google_dns_managed_zone.pre_gematik.dns_name)
      error_message = "PUBLIC_HOSTNAME must be located below the configured Cloud DNS managed zone."
    }
  }
}
