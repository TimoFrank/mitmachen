#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MigrationOperatorError,
  logoRemediationOutputFiles,
  phaseExecution,
  resolveProjectedInput,
  stageLogoRemediationObjects
} from "../deploy/migration-operator/operator-entrypoint.mjs";
import { renderJob } from "../deploy/migration-operator/render-job.mjs";

const root = new URL("../", import.meta.url);
const dockerfile = readFileSync(new URL("deploy/migration-operator/Dockerfile", root), "utf8");
const dockerignore = readFileSync(new URL("deploy/migration-operator/Dockerfile.dockerignore", root), "utf8");
const jobTemplate = readFileSync(new URL("deploy/migration-operator/job.template.yaml", root), "utf8");
const operatorRunbook = readFileSync(new URL("deploy/migration-operator/README.md", root), "utf8");
const serviceAccount = readFileSync(new URL("deploy/migration-operator/serviceaccount.yaml", root), "utf8");
const networkPolicy = readFileSync(new URL("deploy/migration-operator/networkpolicy.yaml", root), "utf8");

const fingerprint = `sha256:${"a".repeat(64)}`;
const environment = {
  EXPECTED_SOURCE_PROJECT_ID: "source-project-ref",
  EXPECTED_TARGET_PROJECT_ID: "target-project-123",
  PRE_IMPORT_BACKUP_ID: "backup-20260720",
  CONFIRM_STORAGE_PREVIEW_FINGERPRINT: fingerprint,
  CONFIRM_STORAGE_MANIFEST_FINGERPRINT: fingerprint,
  CONFIRM_SOURCE_SNAPSHOT_FINGERPRINT: fingerprint,
  CONFIRM_QUARANTINED_OBJECT_COUNT: "0",
  CONFIRM_BOOTSTRAP_PROFILE_FINGERPRINT: fingerprint
};

assert.deepEqual(
  phaseExecution("storage-preview", environment).arguments,
  ["--manifest-output", "/protected-output/run/storage-preview.json"]
);
const storageApply = phaseExecution("storage-apply", environment);
assert.equal(storageApply.arguments.includes("--apply"), true);
assert.equal(storageApply.arguments.includes("MIGRATE_ALLOWLISTED_SUPABASE_STORAGE_TO_GCS"), true);
assert.equal(storageApply.arguments.includes("/protected-output/run/storage-apply.ndjson"), true);

const logoEnvironment = {
  ...environment,
  LOGO_REMEDIATION_MANIFEST_PATH: "/protected-input/run/logo-remediation-preview.json",
  LOGO_REMEDIATION_OBJECT_DIRECTORY: "/protected-input/run/logo-remediation-objects"
};
const logoStoragePreview = phaseExecution("storage-preview", logoEnvironment);
assert.equal(logoStoragePreview.logoRemediationBundle, true);
assert.deepEqual(logoStoragePreview.protectedInputs, ["logo-remediation-preview.json"]);
assert.equal(
  logoStoragePreview.arguments.includes("/protected-input/run/logo-remediation-preview.json"),
  true
);
assert.equal(
  logoStoragePreview.arguments.includes("/protected-input/run/logo-remediation-objects"),
  true
);
const logoStorageApply = phaseExecution("storage-apply", logoEnvironment);
assert.equal(logoStorageApply.logoRemediationBundle, true);
assert.deepEqual(logoStorageApply.protectedInputs, ["logo-remediation-preview.json"]);
assert.throws(
  () => phaseExecution("storage-preview", {
    ...environment,
    LOGO_REMEDIATION_MANIFEST_PATH: "/protected-input/run/logo-remediation-preview.json"
  }),
  (error) => error instanceof MigrationOperatorError
    && /requires both protected operator paths/u.test(error.message)
);
assert.throws(
  () => phaseExecution("storage-preview", {
    ...logoEnvironment,
    LOGO_REMEDIATION_OBJECT_DIRECTORY: "/tmp/logo-remediation-objects"
  }),
  (error) => error instanceof MigrationOperatorError
    && /fixed owner-only operator locations/u.test(error.message)
);

const databasePreview = phaseExecution("database-preview", environment);
assert.equal(databasePreview.managedTarget, true);
assert.deepEqual(databasePreview.protectedInputs, ["supabase-root-ca.crt"]);

const databaseApply = phaseExecution("database-apply", environment);
assert.equal(databaseApply.arguments.includes("--replace-synthetic-target"), true);
assert.equal(databaseApply.arguments.includes("pre-gematik-synthetic-v1"), true);
assert.equal(databaseApply.arguments.includes("/protected-input/run/storage-apply.json"), true);
assert.deepEqual(databaseApply.protectedInputs, ["supabase-root-ca.crt", "storage-apply.json"]);

assert.throws(
  () => phaseExecution("shell", environment),
  (error) => error instanceof MigrationOperatorError
);
assert.throws(
  () => phaseExecution("storage-apply", { ...environment, CONFIRM_QUARANTINED_OBJECT_COUNT: "-1" }),
  (error) => error instanceof MigrationOperatorError
);

const projectedInputTestRoot = await mkdtemp(join(tmpdir(), "vk-operator-projected-secret-"));
try {
  const secretRoot = join(projectedInputTestRoot, "secret-input");
  const versionDirectory = join(secretRoot, "..2026_07_20_00_00_00.000000000");
  await mkdir(versionDirectory, { recursive: true, mode: 0o700 });
  const projectedTarget = join(versionDirectory, "supabase-root-ca.crt");
  await writeFile(projectedTarget, "synthetic-ca-for-path-contract", { mode: 0o600 });
  await symlink("..2026_07_20_00_00_00.000000000", join(secretRoot, "..data"));
  const projectedPath = join(secretRoot, "supabase-root-ca.crt");
  await symlink("..data/supabase-root-ca.crt", projectedPath);
  assert.equal(
    await resolveProjectedInput(projectedPath, secretRoot),
    await realpath(projectedTarget),
    "Kubernetes' versioned Secret projection must be accepted after containment verification."
  );

  const logoOutputFiles = ["01.resvg.png", "02.resvg.png"];
  const logoManifest = {
    schemaVersion: "versorgungs-kompass-logo-remediation-v1",
    remediatedObjectCount: logoOutputFiles.length,
    remediationFingerprint: fingerprint,
    entries: logoOutputFiles.map((outputFile) => ({ outputFile }))
  };
  assert.deepEqual(
    logoRemediationOutputFiles(Buffer.from(JSON.stringify(logoManifest))),
    logoOutputFiles
  );
  assert.throws(
    () => logoRemediationOutputFiles(Buffer.from(JSON.stringify({
      ...logoManifest,
      entries: [{ outputFile: "../unsafe.png" }, { outputFile: "02.resvg.png" }]
    }))),
    (error) => error instanceof MigrationOperatorError
      && /output list is unsafe/u.test(error.message)
  );
  assert.throws(
    () => logoRemediationOutputFiles(Buffer.from(JSON.stringify({
      ...logoManifest,
      entries: [{ outputFile: "01.resvg.png" }, { outputFile: "01.resvg.png" }]
    }))),
    (error) => error instanceof MigrationOperatorError
      && /output list is unsafe/u.test(error.message)
  );

  for (const [index, outputFile] of logoOutputFiles.entries()) {
    const projectedOutput = join(versionDirectory, outputFile);
    await writeFile(projectedOutput, `synthetic-safe-png-${index}`, { mode: 0o600 });
    await symlink(`..data/${outputFile}`, join(secretRoot, outputFile));
  }
  await writeFile(join(versionDirectory, "unreferenced.png"), "must-not-be-staged", { mode: 0o600 });
  await symlink("..data/unreferenced.png", join(secretRoot, "unreferenced.png"));
  const protectedRoot = join(projectedInputTestRoot, "protected-input");
  await mkdir(protectedRoot, { mode: 0o700 });
  await writeFile(
    join(protectedRoot, "logo-remediation-preview.json"),
    JSON.stringify(logoManifest),
    { mode: 0o600 }
  );
  const stagedLogoBundle = await stageLogoRemediationObjects({
    inputRoot: secretRoot,
    protectedRoot
  });
  assert.deepEqual(stagedLogoBundle.outputFiles, logoOutputFiles);
  assert.deepEqual(await readdir(stagedLogoBundle.objectDirectory), logoOutputFiles);
  const stagedDirectoryMetadata = await lstat(stagedLogoBundle.objectDirectory);
  assert.equal(stagedDirectoryMetadata.mode & 0o777, 0o700);
  for (const [index, outputFile] of logoOutputFiles.entries()) {
    const stagedOutput = join(stagedLogoBundle.objectDirectory, outputFile);
    const metadata = await lstat(stagedOutput);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(await readFile(stagedOutput, "utf8"), `synthetic-safe-png-${index}`);
  }

  const outsidePath = join(projectedInputTestRoot, "outside.json");
  await writeFile(outsidePath, "{}", { mode: 0o600 });
  const escapingPath = join(secretRoot, "escaping.json");
  await symlink(outsidePath, escapingPath);
  await assert.rejects(
    resolveProjectedInput(escapingPath, secretRoot),
    (error) => error instanceof MigrationOperatorError
      && /escapes its read-only Secret mount/u.test(error.message)
  );
} finally {
  await rm(projectedInputTestRoot, { recursive: true, force: true });
}

assert.match(dockerfile, /^FROM node:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^FROM gcr\.io\/cloud-sql-connectors\/cloud-sql-proxy:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^FROM gcr\.io\/google\.com\/cloudsdktool\/google-cloud-cli:[^\n]+@sha256:[a-f0-9]{64}/mu);
assert.match(dockerfile, /^USER 65532:65532$/mu);
assert.match(dockerfile, /^ENTRYPOINT \["node", "\/opt\/operator\/operator-entrypoint\.mjs"\]$/mu);
assert.doesNotMatch(dockerfile, /SUPABASE_SERVICE_ROLE_KEY|SOURCE_DATABASE_URL|TARGET_DATABASE_URL/u);
assert.match(dockerignore, /^\*\*$/mu);
assert.doesNotMatch(dockerignore, /^!\.env/mu);

assert.match(jobTemplate, /backoffLimit: 0/u);
assert.match(jobTemplate, /activeDeadlineSeconds: 3600/u);
assert.match(jobTemplate, /automountServiceAccountToken: false/u);
assert.match(jobTemplate, /readOnlyRootFilesystem: true/u);
assert.match(jobTemplate, /allowPrivilegeEscalation: false/u);
assert.match(jobTemplate, /runAsNonRoot: true/u);
assert.match(jobTemplate, /kubernetes\.io\/arch: amd64/u);
assert.match(jobTemplate, /CLOUD_SQL_AUTH_PROXY_CONNECT_MODE[\s\S]*value: private-ip/u);
assert.match(jobTemplate, /secretRef:\s+name: vk-pre-gematik-migration-environment/u);
assert.match(jobTemplate, /secretName: vk-pre-gematik-migration-input/u);
assert.doesNotMatch(jobTemplate, /service_role|postgresql:\/\/|password:/iu);
assert.match(serviceAccount, /automountServiceAccountToken: false/u);
assert.match(networkPolicy, /ingress: \[\]/u);
assert.match(networkPolicy, /- ports:\s+- protocol: TCP\s+port: 5432/u);
assert.match(networkPolicy, /169\.254\.169\.252\/32/u);
assert.match(operatorRunbook, /separate[^\n]*Env-Datei/u);
assert.match(operatorRunbook, /kubectl --from-env-file/u);
assert.match(operatorRunbook, /keine\s+äußeren Shell-Anführungszeichen/u);
assert.match(operatorRunbook, /percent-encodiert/u);
assert.match(operatorRunbook, /Bewusst kein\s+`kubectl apply`/u);
assert.match(operatorRunbook, /erneuert ihn nicht automatisch/u);
assert.match(operatorRunbook, /\/protected-input\/run\/logo-remediation-preview\.json/u);
assert.match(operatorRunbook, /demselben\s+unveränderten Logo-Remediation-Bundle/u);

const image = `europe-west3-docker.pkg.dev/target-project-123/migrations/operator@sha256:${"b".repeat(64)}`;
const rendered = renderJob({
  image,
  projectId: "target-project-123",
  region: "europe-west3"
});
assert.equal(rendered.includes(image), true);
assert.equal(rendered.includes("REPLACE_WITH_IMMUTABLE_OPERATOR_IMAGE"), false);
assert.throws(
  () => renderJob({
    image: `europe-west1-docker.pkg.dev/other-project/repository/operator@sha256:${"b".repeat(64)}`,
    projectId: "target-project-123",
    region: "europe-west3"
  }),
  /outside the approved target project and region/u
);

console.log("Migration operator contract checks passed.");
