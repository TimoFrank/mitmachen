terraform {
  required_version = ">= 1.8.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.29"
    }
  }
}

provider "google" {
  project = var.GCP_PROJECT_ID
  region  = var.GCP_REGION

  default_labels = local.labels
}
