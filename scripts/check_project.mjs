import { execFileSync } from "node:child_process";

const syntaxFiles = [
  "api/security-policy.mjs",
  "api/request-log-privacy.mjs",
  "api/care-sector-model.mjs",
  "api/server.mjs",
  "frontend/data/activity-model.js",
  "frontend/data/data-service.js",
  "frontend/data/demo-api.js",
  "frontend/data/demo-data.js",
  "frontend/data/document-text-extractor.js",
  "frontend/data/hospitation-export.js",
  "frontend/login/auth-guard.js",
  "scripts/audit_api_gateway.mjs",
  "scripts/audit_public_assets.mjs",
  "scripts/audit_target_assets.mjs",
  "scripts/audit_stakeholder_fields.mjs",
  "scripts/check_gcp_autopilot_readiness.mjs",
  "scripts/check_pre_gematik_migration_gcp.mjs",
  "scripts/check_deployment_governance.mjs",
  "scripts/check_markdown_language.mjs",
  "scripts/check_project.mjs",
  "scripts/check_target_readiness.mjs",
  "scripts/extract_inline_frontend_assets.mjs",
  "scripts/generate_pre_gematik_synthetic_seed.mjs",
  "scripts/lib/cloud-sql-managed-proxy.mjs",
  "scripts/lib/pre-gematik-database-migration.mjs",
  "scripts/migrate_supabase_storage_to_gcs.mjs",
  "scripts/migrate_supabase_to_pre_gematik.mjs",
  "scripts/prepare_weekly_release.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  "scripts/prepare_pre_gematik_identity_operator.mjs",
  "scripts/provision_iap_identity_bindings.mjs",
  "scripts/test_activity_model.mjs",
  "scripts/test_activity_pagination.mjs",
  "scripts/test_consent_schema.mjs",
  "scripts/test_contact_notes_schema.mjs",
  "scripts/test_cloud_run_decommission.mjs",
  "scripts/test_care_sector_model.mjs",
  "scripts/test_format_participation_schema.mjs",
  "scripts/test_demo_api.mjs",
  "scripts/test_hospitation_demo_data.mjs",
  "scripts/test_hospitation_document_export.mjs",
  "scripts/test_iap_identity_bindings.mjs",
  "scripts/test_request_log_privacy.mjs",
  "scripts/test_stakeholder_logo_contract.mjs",
  "scripts/test_target_frontend_config.mjs",
  "scripts/test_deployment_separation.mjs",
  "scripts/test_api_postgres_contracts.mjs",
  "scripts/test_api_runtime_config.mjs",
  "scripts/test_api_validation.mjs",
  "scripts/test_auth_avatar_contract.mjs",
  "scripts/test_pre_gematik_postgres_schema.mjs",
  "scripts/test_pre_gematik_migration_gcp.mjs",
  "scripts/test_supabase_cloud_sql_migration.mjs",
  "scripts/test_supabase_storage_migration.mjs",
  "scripts/test_weekly_release.mjs",
  "scripts/test_migration_operator_contract.mjs",
  "scripts/test_security_contracts.mjs",
  "scripts/verify_product_release.mjs",
  "scripts/verify_publication_state.mjs"
];

const auditCommands = [
  ["node", ["scripts/audit_public_assets.mjs"]],
  ["node", ["scripts/audit_api_gateway.mjs"]],
  ["node", ["scripts/audit_stakeholder_fields.mjs"]],
  ["node", ["scripts/test_api_validation.mjs"]],
  ["node", ["scripts/test_auth_avatar_contract.mjs"]],
  ["node", ["scripts/test_activity_model.mjs"]],
  ["node", ["scripts/test_activity_pagination.mjs"]],
  ["node", ["scripts/test_consent_schema.mjs"]],
  ["node", ["scripts/test_contact_notes_schema.mjs"]],
  ["node", ["scripts/test_cloud_run_decommission.mjs"]],
  ["node", ["scripts/test_care_sector_model.mjs"]],
  ["node", ["scripts/test_format_participation_schema.mjs"]],
  ["node", ["scripts/test_hospitation_demo_data.mjs"]],
  ["node", ["scripts/test_demo_api.mjs"]],
  ["node", ["scripts/test_hospitation_document_export.mjs"]],
  ["node", ["scripts/test_iap_identity_bindings.mjs"]],
  ["node", ["scripts/test_request_log_privacy.mjs"]],
  ["node", ["scripts/test_stakeholder_logo_contract.mjs"]],
  ["node", ["scripts/test_target_frontend_config.mjs"]],
  ["node", ["scripts/test_deployment_separation.mjs"]],
  ["node", ["scripts/test_api_postgres_contracts.mjs"]],
  ["node", ["scripts/test_api_runtime_config.mjs"]],
  ["node", ["scripts/test_pre_gematik_postgres_schema.mjs"]],
  ["node", ["scripts/test_pre_gematik_migration_gcp.mjs"]],
  ["node", ["scripts/test_supabase_cloud_sql_migration.mjs"]],
  ["node", ["scripts/test_supabase_storage_migration.mjs"]],
  ["node", ["scripts/test_weekly_release.mjs"]],
  ["node", ["scripts/test_migration_operator_contract.mjs"]],
  ["node", ["scripts/test_security_contracts.mjs"]],
  ["node", ["scripts/prepare_weekly_release.mjs", "--dry-run"]],
  ["node", ["scripts/check_gcp_autopilot_readiness.mjs"]],
  ["node", ["scripts/check_deployment_governance.mjs"]],
  ["node", ["scripts/check_markdown_language.mjs"]],
  ["git", ["diff", "--check"]]
];

const syntaxOnly = process.argv.includes("--syntax");

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

for (const file of syntaxFiles) {
  run(process.execPath, ["--check", file]);
}

if (!syntaxOnly) {
  for (const [command, args] of auditCommands) {
    run(command, args);
  }
}
