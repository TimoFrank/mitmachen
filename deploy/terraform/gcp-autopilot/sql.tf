resource "google_sql_database_instance" "postgres" {
  name             = "${local.name_prefix}-postgres"
  region           = var.GCP_REGION
  database_version = "POSTGRES_16"

  deletion_protection = var.DELETION_PROTECTION

  settings {
    tier                        = var.DB_TIER
    edition                     = "ENTERPRISE"
    availability_type           = "REGIONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = var.DB_DISK_SIZE_GB
    disk_autoresize             = true
    deletion_protection_enabled = var.DELETION_PROTECTION
    pricing_plan                = "PER_USE"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      location                       = var.GCP_REGION
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
  }

  lifecycle {
    ignore_changes = [settings[0].disk_size]
  }

  depends_on = [
    google_project_service.required["sqladmin.googleapis.com"],
    google_service_networking_connection.private_service_access,
  ]
}

resource "google_sql_database" "application" {
  name      = var.DB_NAME
  instance  = google_sql_database_instance.postgres.name
  charset   = "UTF8"
  collation = "en_US.UTF8"
}
