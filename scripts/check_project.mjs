import { execFileSync } from "node:child_process";

const syntaxFiles = [
  "api/server.mjs",
  "frontend/data/data-service.js",
  "scripts/audit_api_gateway.mjs",
  "scripts/audit_public_assets.mjs",
  "scripts/audit_stakeholder_fields.mjs",
  "scripts/check_project.mjs",
  "scripts/check_target_readiness.mjs",
  "scripts/prepare_weekly_release.mjs",
  "scripts/prepare_target_frontend_config.mjs",
  "scripts/preflight_target_deployment.mjs",
  "scripts/test_api_validation.mjs",
  "scripts/verify_publication_state.mjs"
];

const auditCommands = [
  ["node", ["scripts/audit_public_assets.mjs"]],
  ["node", ["scripts/audit_api_gateway.mjs"]],
  ["node", ["scripts/audit_stakeholder_fields.mjs"]],
  ["node", ["scripts/test_api_validation.mjs"]],
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
