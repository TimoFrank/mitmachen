#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  MIGRATION_VERSION,
  SYNTHETIC_SEED_ID,
  runDatabaseMigration
} from "./lib/pre-gematik-database-migration.mjs";

const HELP = `
Supabase -> pre-gematik PostgreSQL migration (${MIGRATION_VERSION})

Default: read-only dry-run. No row contents or connection strings are logged.

Required environment:
  SOURCE_DATABASE_URL
  TARGET_DATABASE_URL
  EXPECTED_SOURCE_PROJECT_ID
  EXPECTED_TARGET_PROJECT_ID
  EXPECTED_STORAGE_PROJECT_PAIR_SHA256 (independently approved source+target pin)
  EXPECTED_TARGET_DATABASE_NAME
  GCP_PROJECT_ID, GCP_REGION, GKE_CLUSTER_NAME, GKE_LOCATION, K8S_NAMESPACE
  CLOUD_SQL_INSTANCE_CONNECTION_NAME, PRE_GEMATIK_GCP_PROJECT_SHA256

Apply-only requirements:
  PRE_IMPORT_BACKUP_ID
  CLOUD_SQL_AUTH_PROXY_EXECUTABLE (absolute path to approved official binary)
  CLOUD_SQL_AUTH_PROXY_SHA256 (independently approved binary pin)
  STORAGE_MIGRATION_MANIFEST_PATH (owner-only apply manifest outside the repository)
  TARGET_PROFILE_IMAGE_BUCKET
  TARGET_CONTACT_IMAGE_BUCKET
  TARGET_CONTACT_NOTE_ATTACHMENT_BUCKET
  TARGET_STAKEHOLDER_LOGO_BUCKET
  --apply
  --replace-synthetic-target
  --confirm-replacement ${SYNTHETIC_SEED_ID}
  --confirm-storage-manifest-fingerprint <sha256:fingerprint>
  --confirm-source-snapshot-fingerprint <sha256:fingerprint>
  --confirm-quarantined-object-count <count>
  --confirm-bootstrap-profile-fingerprint <sha256:fingerprint>

Options:
  --apply                         Execute the transactional target replacement.
  --replace-synthetic-target      Permit replacement of a proven synthetic target.
  --confirm-replacement <marker>  Must exactly match the synthetic seed marker.
  --pre-import-backup-id <id>     Overrides PRE_IMPORT_BACKUP_ID.
  --target-profile-image-bucket <bucket>
                                  Overrides TARGET_PROFILE_IMAGE_BUCKET.
  --target-contact-image-bucket <bucket>
                                  Overrides TARGET_CONTACT_IMAGE_BUCKET.
  --target-contact-note-attachment-bucket <bucket>
                                  Overrides TARGET_CONTACT_NOTE_ATTACHMENT_BUCKET.
  --target-stakeholder-logo-bucket <bucket>
                                  Overrides TARGET_STAKEHOLDER_LOGO_BUCKET.
  --storage-manifest <path>       Overrides STORAGE_MIGRATION_MANIFEST_PATH.
  --confirm-storage-manifest-fingerprint <sha256:fingerprint>
                                  Must match the completed Storage apply manifest.
  --confirm-source-snapshot-fingerprint <sha256:fingerprint>
                                  Must match the approved current database dry-run.
  --confirm-quarantined-object-count <count>
                                  Must match the apply manifest exactly.
  --confirm-bootstrap-profile-fingerprint <sha256:fingerprint>
                                  Confirm the protected bootstrap profile reported by dry-run.
  --help                          Show this help.
`.trim();

export function parseArguments(argv) {
  const parsed = {
    apply: false,
    replaceSyntheticTarget: false,
    confirmReplacement: "",
    preImportBackupId: "",
    targetProfileImageBucket: "",
    targetContactImageBucket: "",
    targetContactNoteAttachmentBucket: "",
    targetStakeholderLogoBucket: "",
    storageMigrationManifestPath: "",
    confirmStorageManifestFingerprint: "",
    confirmSourceSnapshotFingerprint: "",
    confirmQuarantinedObjectCount: "",
    confirmBootstrapProfileFingerprint: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") parsed.apply = true;
    else if (argument === "--replace-synthetic-target") parsed.replaceSyntheticTarget = true;
    else if (argument === "--confirm-replacement") parsed.confirmReplacement = argv[++index] || "";
    else if (argument === "--pre-import-backup-id") parsed.preImportBackupId = argv[++index] || "";
    else if (argument === "--target-profile-image-bucket") parsed.targetProfileImageBucket = argv[++index] || "";
    else if (argument === "--target-contact-image-bucket") parsed.targetContactImageBucket = argv[++index] || "";
    else if (argument === "--target-contact-note-attachment-bucket") {
      parsed.targetContactNoteAttachmentBucket = argv[++index] || "";
    }
    else if (argument === "--target-stakeholder-logo-bucket") {
      parsed.targetStakeholderLogoBucket = argv[++index] || "";
    }
    else if (argument === "--storage-manifest") parsed.storageMigrationManifestPath = argv[++index] || "";
    else if (argument === "--confirm-storage-manifest-fingerprint") {
      parsed.confirmStorageManifestFingerprint = argv[++index] || "";
    }
    else if (argument === "--confirm-source-snapshot-fingerprint") {
      parsed.confirmSourceSnapshotFingerprint = argv[++index] || "";
    }
    else if (argument === "--confirm-quarantined-object-count") {
      parsed.confirmQuarantinedObjectCount = argv[++index] || "";
    }
    else if (argument === "--confirm-bootstrap-profile-fingerprint") {
      parsed.confirmBootstrapProfileFingerprint = argv[++index] || "";
    }
    else if (argument === "--help" || argument === "-h") parsed.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  let options;
  try {
    options = parseArguments(argv);
  } catch {
    console.error("Invalid command-line options. Use --help.");
    return 2;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }

  try {
    await runDatabaseMigration({
      sourceDatabaseUrl: environment.SOURCE_DATABASE_URL,
      targetDatabaseUrl: environment.TARGET_DATABASE_URL,
      expectedSourceProjectId: environment.EXPECTED_SOURCE_PROJECT_ID,
      expectedTargetProjectId: environment.EXPECTED_TARGET_PROJECT_ID,
      expectedProjectPairFingerprint: environment.EXPECTED_STORAGE_PROJECT_PAIR_SHA256,
      expectedTargetDatabaseName: environment.EXPECTED_TARGET_DATABASE_NAME,
      preImportBackupId: options.preImportBackupId || environment.PRE_IMPORT_BACKUP_ID,
      apply: options.apply,
      replaceSyntheticTarget: options.replaceSyntheticTarget,
      confirmReplacement: options.confirmReplacement,
      targetProfileImageBucket: options.targetProfileImageBucket || environment.TARGET_PROFILE_IMAGE_BUCKET,
      targetContactImageBucket:
        options.targetContactImageBucket || environment.TARGET_CONTACT_IMAGE_BUCKET,
      targetContactNoteAttachmentBucket:
        options.targetContactNoteAttachmentBucket || environment.TARGET_CONTACT_NOTE_ATTACHMENT_BUCKET,
      targetStakeholderLogoBucket:
        options.targetStakeholderLogoBucket || environment.TARGET_STAKEHOLDER_LOGO_BUCKET,
      storageMigrationManifestPath:
        options.storageMigrationManifestPath || environment.STORAGE_MIGRATION_MANIFEST_PATH,
      confirmStorageManifestFingerprint: options.confirmStorageManifestFingerprint,
      confirmSourceSnapshotFingerprint: options.confirmSourceSnapshotFingerprint,
      confirmQuarantinedObjectCount: options.confirmQuarantinedObjectCount,
      confirmBootstrapProfileFingerprint: options.confirmBootstrapProfileFingerprint,
      gcpEnvironment: environment
    });
    return 0;
  } catch (error) {
    console.error(`${error.name || "MigrationError"}: ${error.message || "Migration failed safely."}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
