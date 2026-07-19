# Cloud Billing budgets emit alerts; they do not cap or suspend project spending.
resource "google_billing_budget" "project" {
  count = var.BILLING_ACCOUNT_ID == null ? 0 : 1

  billing_account = var.BILLING_ACCOUNT_ID
  display_name    = "Versorgungs-Kompass pre-gematik monthly budget"

  amount {
    specified_amount {
      currency_code = var.BUDGET_CURRENCY_CODE
      units         = tostring(floor(var.MONTHLY_BUDGET_AMOUNT))
      nanos         = floor((var.MONTHLY_BUDGET_AMOUNT - floor(var.MONTHLY_BUDGET_AMOUNT)) * 1000000000)
    }
  }

  budget_filter {
    projects        = ["projects/${data.google_project.current.number}"]
    calendar_period = "MONTH"
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = []
    disable_default_iam_recipients   = false
    enable_project_level_recipients  = true
  }

  depends_on = [google_project_service.required["billingbudgets.googleapis.com"]]
}
