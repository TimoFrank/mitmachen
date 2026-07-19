variable "GCP_PROJECT_ID" {
  description = "Existing, billing-enabled Google Cloud project ID. This configuration does not create a project."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.GCP_PROJECT_ID))
    error_message = "GCP_PROJECT_ID must be a valid Google Cloud project ID."
  }
}

variable "GCP_REGION" {
  description = "Region for regional services. Frankfurt is europe-west3."
  type        = string
  default     = "europe-west3"
}

variable "BILLING_ACCOUNT_ID" {
  description = "Optional Cloud Billing account ID used to create a project-scoped alerting budget. Null disables budget creation."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.BILLING_ACCOUNT_ID == null ? true : can(regex("^[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}$", var.BILLING_ACCOUNT_ID))
    error_message = "BILLING_ACCOUNT_ID must be null or use XXXXXX-XXXXXX-XXXXXX syntax."
  }
}

variable "MONTHLY_BUDGET_AMOUNT" {
  description = "Monthly alerting budget amount in BUDGET_CURRENCY_CODE. This is not a hard spending limit."
  type        = number
  default     = 100

  validation {
    condition     = var.MONTHLY_BUDGET_AMOUNT > 0
    error_message = "MONTHLY_BUDGET_AMOUNT must be greater than zero."
  }
}

variable "BUDGET_CURRENCY_CODE" {
  description = "ISO 4217 currency code for the optional alerting budget; it must match the billing account currency."
  type        = string
  default     = "EUR"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.BUDGET_CURRENCY_CODE))
    error_message = "BUDGET_CURRENCY_CODE must be a three-letter uppercase ISO 4217 currency code."
  }
}

variable "GKE_CLUSTER_NAME" {
  description = "Name of the GKE Autopilot cluster."
  type        = string
  default     = "versorgungs-kompass-pre-gematik"
}

variable "GKE_LOCATION" {
  description = "Regional GKE location. Null uses GCP_REGION."
  type        = string
  default     = null
  nullable    = true
}

variable "K8S_NAMESPACE" {
  description = "Kubernetes namespace used by the application and its Workload Identity principal."
  type        = string
  default     = "pre-gematik"

  validation {
    condition     = can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", var.K8S_NAMESPACE))
    error_message = "K8S_NAMESPACE must be a valid Kubernetes namespace."
  }
}

variable "GAR_REPOSITORY" {
  description = "Artifact Registry Docker repository ID. The output of the same name is its full repository URI."
  type        = string
  default     = "versorgungs-kompass-pre-gematik"
}

variable "CLOUD_DNS_MANAGED_ZONE" {
  description = "Name of the existing public Cloud DNS managed zone used for the environment record."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]*[a-z0-9])?$", var.CLOUD_DNS_MANAGED_ZONE))
    error_message = "CLOUD_DNS_MANAGED_ZONE must be a valid Cloud DNS managed-zone name."
  }
}

variable "PUBLIC_HOSTNAME" {
  description = "Public non-wildcard hostname for the shared frontend and API ingress."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9.-]*[a-z0-9])$", var.PUBLIC_HOSTNAME)) && !endswith(var.PUBLIC_HOSTNAME, ".")
    error_message = "PUBLIC_HOSTNAME must be a lower-case fully qualified hostname without a trailing dot."
  }
}

variable "FRONTEND_BUCKET" {
  description = "Globally unique frontend bucket name. Null derives a project-specific name."
  type        = string
  default     = null
  nullable    = true
}

variable "PROFILE_IMAGE_BUCKET" {
  description = "Globally unique profile-image bucket name. Null derives a project-specific name."
  type        = string
  default     = null
  nullable    = true
}

variable "CONTACT_IMAGE_BUCKET" {
  description = "Globally unique contact-image bucket name. Null derives a project-specific name."
  type        = string
  default     = null
  nullable    = true
}

variable "CONTACT_NOTE_ATTACHMENT_BUCKET" {
  description = "Globally unique contact-note attachment bucket name. Null derives a project-specific name."
  type        = string
  default     = null
  nullable    = true
}

variable "DB_NAME" {
  description = "Application database name."
  type        = string
  default     = "versorgungs_kompass"
}

variable "DB_USER" {
  description = "Application database user to bootstrap outside Terraform."
  type        = string
  default     = "vk_app"
}

variable "DB_PASSWORD_SECRET_NAME" {
  description = "Secret Manager secret ID. Terraform creates no secret version and stores no password."
  type        = string
  default     = "vk-pre-gematik-postgres-password"
}

variable "IAP_OAUTH_BOOTSTRAP_SECRET_NAME" {
  description = "Existing Secret Manager secret whose latest version is a JSON object with client_id and client_secret."
  type        = string
  default     = "vk-pre-gematik-iap-oauth-bootstrap"

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,255}$", var.IAP_OAUTH_BOOTSTRAP_SECRET_NAME))
    error_message = "IAP_OAUTH_BOOTSTRAP_SECRET_NAME must be a valid Secret Manager secret ID."
  }
}

variable "DB_TIER" {
  description = "Cloud SQL machine tier. db-f1-micro is intended only for this temporary integration test."
  type        = string
  default     = "db-f1-micro"
}

variable "DB_DISK_SIZE_GB" {
  description = "Initial Cloud SQL SSD size in GiB."
  type        = number
  default     = 10

  validation {
    condition     = var.DB_DISK_SIZE_GB >= 10
    error_message = "DB_DISK_SIZE_GB must be at least 10 GiB."
  }
}

variable "GITHUB_REPOSITORY" {
  description = "GitHub repository allowed to use the deployment Workload Identity provider."
  type        = string
  default     = "TimoFrank/mitmachen"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.GITHUB_REPOSITORY))
    error_message = "GITHUB_REPOSITORY must use owner/repository syntax."
  }
}

variable "GITHUB_ENVIRONMENT" {
  description = "GitHub Environment required in the OIDC token."
  type        = string
  default     = "pre-gematik"
}

variable "WIF_POOL_ID" {
  description = "Workload Identity pool ID for GitHub Actions."
  type        = string
  default     = "github-pre-gematik"
}

variable "WIF_PROVIDER_ID" {
  description = "GitHub Actions OIDC provider ID."
  type        = string
  default     = "github-actions"
}

variable "DEPLOYER_SERVICE_ACCOUNT_ID" {
  description = "Account ID of the keyless GitHub deployment service account."
  type        = string
  default     = "github-pre-gematik-deployer"
}

variable "DELETION_PROTECTION" {
  description = "Protect the GKE cluster and Cloud SQL instance against accidental deletion."
  type        = bool
  default     = true
}

variable "IAP_ACCESS_MEMBERS" {
  description = "Project-level break-glass users allowed through IAP. Groups must be bound to the generated backend services instead."
  type        = set(string)
  default     = []

  validation {
    condition     = alltrue([for member in var.IAP_ACCESS_MEMBERS : can(regex("^user:[^@\\s]+@[^@\\s]+$", member))])
    error_message = "IAP_ACCESS_MEMBERS accepts only user: principals for project-level break-glass access."
  }
}

variable "IAP_RESOURCE_ACCESS_GROUP" {
  description = "Google Group bound by the deployment workflow to only the generated API and frontend IAP backend services."
  type        = string
  default     = "group:pre-gematik-access@example.invalid"

  validation {
    condition     = can(regex("^group:[^@\\s]+@[^@\\s]+$", var.IAP_RESOURCE_ACCESS_GROUP))
    error_message = "IAP_RESOURCE_ACCESS_GROUP must use group:name@example.org syntax."
  }
}
