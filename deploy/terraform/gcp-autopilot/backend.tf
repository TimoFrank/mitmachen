terraform {
  backend "gcs" {
    prefix = "versorgungs-kompass/pre-gematik/gcp-autopilot"
  }
}
