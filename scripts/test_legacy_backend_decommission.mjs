import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationContractDigest } from "./hash_pre_gematik_migration_contract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

for (const relativePath of [
  "supabase",
  "scripts/export_supabase_backup.mjs",
  "scripts/import_contacts_to_supabase.mjs",
  "scripts/migrate_supabase_storage_to_gcs.mjs",
  "scripts/migrate_supabase_to_pre_gematik.mjs",
  "scripts/test_supabase_cloud_sql_migration.mjs",
  "scripts/test_supabase_storage_migration.mjs",
  "scripts/lib/pre-gematik-database-migration.mjs"
]) {
  assert.equal(
    fs.existsSync(path.join(root, relativePath)),
    false,
    `Stillgelegter Supabase-Pfad ist wieder vorhanden: ${relativePath}`
  );
}

for (const relativePath of [
  "package.json",
  "package-lock.json",
  "api/package.json",
  "api/package-lock.json"
]) {
  assert.doesNotMatch(
    read(relativePath),
    /@supabase\/|supabase-js/iu,
    `${relativePath} darf keine Supabase-Abhängigkeit enthalten.`
  );
}

const rootPackage = JSON.parse(read("package.json"));
for (const [name, command] of Object.entries(rootPackage.scripts || {})) {
  assert.doesNotMatch(
    `${name} ${command}`,
    /(?:^|[^a-z])supabase(?:[^a-z]|$)/iu,
    `Package-Skript ${name} darf keinen stillgelegten Supabase-Betriebsweg starten.`
  );
}

for (const relativePath of [
  "frontend/data/runtime-config.js",
  "frontend/data/data-service.js",
  "frontend/login/auth-guard.js",
  "frontend/login/auth-login.js",
  "api/server.mjs",
  "api/Dockerfile"
]) {
  assert.doesNotMatch(
    read(relativePath),
    /supabase|service[_-]?role|\.supabase\.co/iu,
    `${relativePath} darf keine Supabase-Laufzeitkopplung enthalten.`
  );
}

const retiredOperationPattern = /migrate_supabase|test_supabase|export_supabase|import_contacts_to_supabase|pre-gematik-database-migration|migrate:pre-gematik|storage-(?:preview|apply)|database-(?:preview|apply)|supabase-root-ca/iu;
for (const relativePath of [
  "deploy/migration-operator/Dockerfile",
  "deploy/migration-operator/Dockerfile.dockerignore",
  "deploy/migration-operator/operator-entrypoint.mjs",
  "deploy/migration-operator/job.template.yaml",
  "deploy/migration-operator/networkpolicy.yaml",
  "config/pre-gematik/migration.env.example",
  ".github/workflows/repo-check.yml",
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/deploy-pre-gematik.yml",
  ".github/workflows/target-readiness.yml",
  "deploy/jenkins/Jenkinsfile.gematik",
  "scripts/check_project.mjs"
]) {
  assert.doesNotMatch(
    read(relativePath),
    retiredOperationPattern,
    `${relativePath} darf keinen stillgelegten Supabase-Betriebsweg enthalten.`
  );
}

for (const relativePath of [
  ".dockerignore",
  ".gitignore",
  ".github/CODEOWNERS"
]) {
  assert.doesNotMatch(
    read(relativePath),
    /(?:^|\n)\/?supabase(?:\/|$)/iu,
    `${relativePath} darf keinen entfernten Supabase-Pfad mehr verwalten.`
  );
}

const activeDeploymentPattern = /SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)|[a-z0-9-]+\.supabase\.co|fntqoqxriipjzfhzxiry|@supabase\/|migrate_supabase|supabase-root-ca/iu;
for (const relativePath of [
  "deploy/helm/versorgungs-kompass/values.yaml",
  "deploy/helm/versorgungs-kompass/values-gcp-autopilot.yaml",
  "deploy/helm/versorgungs-kompass/templates/configmap.yaml",
  "deploy/helm/versorgungs-kompass/templates/deployment.yaml",
  "deploy/terraform/gcp-autopilot/gke.tf",
  "deploy/terraform/gcp-autopilot/sql.tf"
]) {
  assert.doesNotMatch(
    read(relativePath),
    activeDeploymentPattern,
    `${relativePath} darf keine aktive Supabase-Konfiguration enthalten.`
  );
}

const digestFixture = fs.mkdtempSync(path.join(os.tmpdir(), "vk-migration-contract-"));
try {
  assert.throws(
    () => migrationContractDigest(digestFixture),
    /at least one SQL migration/iu,
    "Ein leerer Migrationsvertrag muss fail-closed abgewiesen werden."
  );
  fs.writeFileSync(path.join(digestFixture, "0002_second.sql"), "select 2;\n", "utf8");
  fs.writeFileSync(path.join(digestFixture, "0001_first.sql"), "select 1;\n", "utf8");
  const firstDigest = migrationContractDigest(digestFixture);
  assert.match(firstDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(firstDigest, migrationContractDigest(digestFixture));
  fs.writeFileSync(path.join(digestFixture, "0002_second.sql"), "select 3;\n", "utf8");
  assert.notEqual(
    firstDigest,
    migrationContractDigest(digestFixture),
    "Inhaltsänderungen müssen den Migrationsvertragsdigest verändern."
  );
} finally {
  fs.rmSync(digestFixture, { recursive: true, force: true });
}

console.log("Legacy backend decommission OK: Supabase bleibt aus Runtime, CI und Deployment entfernt.");
