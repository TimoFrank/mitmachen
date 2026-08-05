resource "google_compute_security_policy" "password_reset_broker" {
  name        = local.password_reset_policy_name
  description = "Public password-reset broker: exact request contract, per-IP throttling, and fail-closed default."
  type        = "CLOUD_ARMOR"

  rule {
    action      = "rate_based_ban"
    priority    = 1000
    description = "Allow only the canonical same-origin password-reset POST and rate-limit it per client IP."
    preview     = false

    match {
      expr {
        expression = "request.path == '/api/auth/password-reset' && request.method == 'POST' && request.headers['host'] == '${var.IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME}' && request.headers['origin'] == 'https://${var.IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME}'"
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = 30
        interval_sec = 300
      }

      ban_duration_sec = 3600

      ban_threshold {
        count        = 120
        interval_sec = 3600
      }
    }
  }

  rule {
    action      = "deny(404)"
    priority    = 2147483647
    description = "Deny every request outside the exact password-reset contract."
    preview     = false

    match {
      versioned_expr = "SRC_IPS_V1"

      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  depends_on = [google_project_service.required["compute.googleapis.com"]]
}
