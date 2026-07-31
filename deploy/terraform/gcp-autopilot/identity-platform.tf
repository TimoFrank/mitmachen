locals {
  # The project Firebase domain remains authorized only as a pre-registered
  # rollback path. The active portal uses the canonical first-party authDomain
  # and OAuth callback through the dedicated /__/auth/ reverse proxy.
  identity_platform_authorized_domains = sort([
    var.IDENTITY_PLATFORM_AUTHORIZED_HOSTNAME,
    "${var.GCP_PROJECT_ID}.firebaseapp.com",
    "iap.googleapis.com",
  ])
}

check "iap_external_identity_contract" {
  assert {
    condition = var.IAP_IDENTITY_MODE != "external" || (
      var.IAP_GCIP_PROJECT_ID == var.GCP_PROJECT_ID &&
      var.IAP_GCIP_TENANT_ID == null &&
      (
        var.IAP_EXTERNAL_ACCESS_EXPIRES_AT == null
        ? false
        : timecmp(var.IAP_EXTERNAL_ACCESS_EXPIRES_AT, "2026-09-30T16:00:00Z") <= 0
      )
    )
    error_message = "External pre-gematik IAP requires the same GCIP project, no tenant, and an explicit hard expiry no later than the approved pilot end."
  }
}

# Identity Platform remains dormant until the deployment workflow explicitly
# configures both protected IAP backends for GCIP agent flow. Keeping the
# project configuration independent from the IAP mode makes IAM rollback
# possible without deleting users or provider configuration.
# The Google provider currently does not expose Identity Platform password
# policy fields. Operators must set ENFORCE/force-upgrade with 14..128
# characters and lowercase, uppercase, numeric, and non-alphanumeric
# requirements through the Identity Platform API. The deployment workflow
# reads and pins that exact policy before any external-identity mutation.
# The provider also does not expose improved email privacy. The custom portal
# requires it to remain enabled; the deployment preflight reads and pins that
# setting before any external-identity mutation.
# notification.sendEmail.callbackUri remains intentionally outside Terraform:
# the API currently rejects updates with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED.
# The deployment preflight accepts only the desired canonical action page or
# the pinned Firebase standard-action fallback while that provider limit lasts.
resource "google_identity_platform_config" "pre_gematik" {
  project                    = var.GCP_PROJECT_ID
  autodelete_anonymous_users = false
  authorized_domains         = local.identity_platform_authorized_domains

  lifecycle {
    prevent_destroy = true
  }

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = true
    }

    phone_number {
      enabled = false
    }

    anonymous {
      enabled = false
    }
  }

  client {
    permissions {
      disabled_user_signup   = true
      disabled_user_deletion = true
    }
  }

  mfa {
    state = "DISABLED"
  }

  multi_tenant {
    allow_tenants = false
  }

  depends_on = [google_project_service.required["identitytoolkit.googleapis.com"]]
}
