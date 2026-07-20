import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  OPERATION_CONFIRMATION,
  PROTECTED_SOURCE_BUCKET,
  StorageMigrationSafetyError,
  buildStorageConfiguration,
  collectSourceStorageSnapshot,
  createProtectedRecoveryJournal,
  listSupabaseBucketObjects,
  migrationTargetObjectName,
  parseStorageMigrationArguments,
  runStorageMigration,
  storageSnapshotFingerprint,
  validateApplyConfirmations,
  validateManifestOutputPath,
  validateRecoveryJournalPath,
  writeProtectedMigrationManifest
} from "./migrate_supabase_storage_to_gcs.mjs";

const EXPECTED_SOURCE_PROJECT_ID = "source-project-test-123";
const EXPECTED_TARGET_PROJECT_ID = "target-project-test-123";
const EXPECTED_PROJECT_PAIR_FINGERPRINT = `sha256:${crypto.createHash("sha256")
  .update(`${EXPECTED_SOURCE_PROJECT_ID}\u0000${EXPECTED_TARGET_PROJECT_ID}`)
  .digest("hex")}`;
const SOURCE_SECRET = "supabase-service-role-secret-value-1234567890";
const GOOGLE_TOKEN = "google-oauth-access-token-value-1234567890";
const TARGET_PROJECT_NUMBER = "123456789";
const TARGET_REGION = "europe-west3";
const TARGET_NAMESPACE = "pre-gematik";
const TARGET_BUCKETS = Object.freeze({
  "profile-images": "vk-pre-profile-images",
  "contact-images": "vk-pre-contact-images",
  "contact-note-attachments": "vk-pre-contact-attachments",
  "stakeholder-logos": "vk-pre-stakeholder-logos"
});
const EXPECTED_WORKLOAD_PRINCIPAL = `principal://iam.googleapis.com/projects/${TARGET_PROJECT_NUMBER}/locations/global/`
  + `workloadIdentityPools/${EXPECTED_TARGET_PROJECT_ID}.svc.id.goog/subject/ns/`
  + `${TARGET_NAMESPACE}/sa/versorgungs-kompass-api`;
const EXPECTED_BUCKET_IAM_FINGERPRINT = `sha256:${crypto.createHash("sha256").update(JSON.stringify(
  Object.entries(TARGET_BUCKETS).map(([sourceBucket, bucket]) => ({
    bucket,
    role: sourceBucket === "stakeholder-logos" ? "roles/storage.objectViewer" : "roles/storage.objectUser",
    member: EXPECTED_WORKLOAD_PRINCIPAL
  })).sort((left, right) => left.bucket.localeCompare(right.bucket))
)).digest("hex")}`;
const ENVIRONMENT = Object.freeze({
  SUPABASE_URL: `https://${EXPECTED_SOURCE_PROJECT_ID}.supabase.co/`,
  EXPECTED_SOURCE_PROJECT_ID,
  EXPECTED_TARGET_PROJECT_ID,
  EXPECTED_STORAGE_PROJECT_PAIR_SHA256: EXPECTED_PROJECT_PAIR_FINGERPRINT,
  SUPABASE_SERVICE_ROLE_KEY: SOURCE_SECRET,
  GOOGLE_OAUTH_ACCESS_TOKEN: GOOGLE_TOKEN,
  GCP_REGION: TARGET_REGION,
  K8S_NAMESPACE: TARGET_NAMESPACE,
  PRE_GEMATIK_DATA_BUCKET_IAM_SHA256: EXPECTED_BUCKET_IAM_FINGERPRINT,
  PROFILE_IMAGE_BUCKET: TARGET_BUCKETS["profile-images"],
  CONTACT_IMAGE_BUCKET: TARGET_BUCKETS["contact-images"],
  CONTACT_NOTE_ATTACHMENT_BUCKET: TARGET_BUCKETS["contact-note-attachments"],
  STAKEHOLDER_LOGO_BUCKET: TARGET_BUCKETS["stakeholder-logos"]
});
const TEST_OUTPUT_DIRECTORY = realpathSync(mkdtempSync(path.join(os.tmpdir(), "vk-storage-migration-run-")));
const TEST_MANIFEST_PATH = path.join(TEST_OUTPUT_DIRECTORY, "storage-migration-manifest.json");
const TEST_RECOVERY_JOURNAL_PATH = path.join(TEST_OUTPUT_DIRECTORY, "storage-migration-recovery.ndjson");

try {
const capturedManifests = [];
function captureManifest(manifestPath, manifest) {
  assert.equal(manifestPath, TEST_MANIFEST_PATH);
  capturedManifests.push(manifest);
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function bytesResponse(buffer, mimeType, etag = "") {
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "content-length": String(buffer.length),
      ...(etag ? { etag } : {})
    }
  });
}

function syntheticPng(width = 10, height = 10) {
  const chunk = (type, data = Buffer.alloc(0)) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length, 0);
    header.write(type, 4, 4, "ascii");
    return Buffer.concat([header, data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT"),
    chunk("IEND")
  ]);
}

function fileEntry(name, buffer, mimeType, id) {
  return {
    name,
    id,
    updated_at: "2026-07-20T06:00:00.000Z",
    metadata: {
      size: buffer.length,
      mimetype: mimeType,
      eTag: `"etag-${id}"`
    }
  };
}

function folderEntry(name) {
  return { name, id: null, updated_at: null, metadata: null };
}

function headerValue(headers, name) {
  if (headers instanceof Headers) return headers.get(name) || "";
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || "";
}

function parseMultipartRequest(options) {
  const contentType = headerValue(options.headers, "content-type");
  const boundary = /boundary=([^;\s]+)/u.exec(contentType)?.[1];
  assert.ok(boundary, "Multipart boundary fehlt.");
  const body = Buffer.from(options.body);
  const headerSeparator = Buffer.from("\r\n\r\n", "ascii");
  const firstHeaderEnd = body.indexOf(headerSeparator);
  assert.ok(firstHeaderEnd >= 0);
  const secondBoundary = Buffer.from(`\r\n--${boundary}\r\n`, "ascii");
  const metadataEnd = body.indexOf(secondBoundary, firstHeaderEnd + headerSeparator.length);
  assert.ok(metadataEnd >= 0);
  const metadata = JSON.parse(body.subarray(firstHeaderEnd + headerSeparator.length, metadataEnd).toString("utf8"));
  const secondHeaderStart = metadataEnd + secondBoundary.length;
  const secondHeaderEnd = body.indexOf(headerSeparator, secondHeaderStart);
  assert.ok(secondHeaderEnd >= 0);
  const finalBoundary = Buffer.from(`\r\n--${boundary}--\r\n`, "ascii");
  const payloadEnd = body.indexOf(finalBoundary, secondHeaderEnd + headerSeparator.length);
  assert.ok(payloadEnd >= 0);
  return {
    metadata,
    buffer: body.subarray(secondHeaderEnd + headerSeparator.length, payloadEnd)
  };
}

function objectKey(bucket, name) {
  return `${bucket}\u0000${name}`;
}

class StorageFetchMock {
  constructor() {
    this.calls = [];
    this.createdNames = [];
    this.downloadCount = 0;
    this.mutateInventoryAfterDownloads = false;
    this.bucketPublicAccessPrevention = "enforced";
    this.bucketLocation = TARGET_REGION.toUpperCase();
    this.extraBucketBinding = null;
    this.profilePng = syntheticPng();
    this.attachment = Buffer.from("Ein synthetischer Testanhang.\n", "utf8");
    this.logo = Buffer.from('<?xml version="1.0"?><!-- safe generator note --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg><!-- safe trailing note -->', "utf8");
    this.sourceFiles = new Map([
      ["profile-images\u0000profile-a/avatar.png", {
        buffer: this.profilePng,
        mimeType: "image/png",
        etag: 'W/"transport-profile-avatar"'
      }],
      ["contact-note-attachments\u0000contact-a/note-a/readme.txt", {
        buffer: this.attachment,
        mimeType: "text/plain",
        etag: 'W/"transport-attachment"'
      }],
      ["stakeholder-logos\u0000logos/partner.svg", {
        buffer: this.logo,
        mimeType: "application/xml",
        etag: 'W/"transport-logo"'
      }]
    ]);
    this.sourceListings = new Map([
      ["profile-images\u0000", [folderEntry("profile-a")]],
      ["profile-images\u0000profile-a", [fileEntry("avatar.png", this.profilePng, "image/png", "profile-avatar")]],
      ["contact-images\u0000", []],
      ["contact-note-attachments\u0000", [folderEntry("contact-a")]],
      ["contact-note-attachments\u0000contact-a", [folderEntry("note-a")]],
      ["contact-note-attachments\u0000contact-a/note-a", [fileEntry("readme.txt", this.attachment, "text/plain", "attachment")]],
      ["stakeholder-logos\u0000", [folderEntry("logos")]],
      ["stakeholder-logos\u0000logos", [fileEntry("partner.svg", this.logo, "application/xml", "logo")]]
    ]);
    this.targetObjects = new Map();
    this.referenceRows = {
      profiles: [{
        id: "profile-a",
        avatar_url: `https://${EXPECTED_SOURCE_PROJECT_ID}.supabase.co/storage/v1/object/sign/`
          + "profile-images/profile-a/avatar.png?token=synthetic"
      }],
      contacts: [],
      contact_note_attachments: [{ id: "attachment-a", storage_path: "contact-a/note-a/readme.txt" }],
      stakeholder_organizations: [{
        id: "stakeholder-a",
        logo_url: "private://stakeholder-logos/logos/partner.svg"
      }]
    };
    this.putTargetObject(
      TARGET_BUCKETS["contact-note-attachments"],
      "contact-a/note-a/readme.txt",
      this.attachment,
      "text/plain",
      "1"
    );
  }

  putTargetObject(bucket, name, buffer, contentType, generation = String(this.targetObjects.size + 1)) {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    this.targetObjects.set(objectKey(bucket, name), {
      name,
      buffer: Buffer.from(buffer),
      contentType,
      generation,
      metadata: { "versorgungs-kompass-sha256": sha256 }
    });
  }

  async fetch(urlValue, options = {}) {
    const url = new URL(urlValue);
    const method = options.method || "GET";
    this.calls.push({ url: url.toString(), method, headers: options.headers || {}, body: options.body });

    if (url.hostname.endsWith("supabase.co")) {
      assert.equal(headerValue(options.headers, "apikey"), SOURCE_SECRET);
      assert.equal(headerValue(options.headers, "authorization"), `Bearer ${SOURCE_SECRET}`);
      const tableMatch = /^\/rest\/v1\/([^/]+)$/u.exec(url.pathname);
      if (tableMatch) {
        assert.equal(method, "GET");
        const rows = this.referenceRows[tableMatch[1]];
        assert.ok(rows, "Unbekannte synthetische Referenztabelle.");
        return jsonResponse(rows);
      }
      const listMatch = /^\/storage\/v1\/object\/list\/([^/]+)$/u.exec(url.pathname);
      if (listMatch) {
        assert.equal(method, "POST");
        const bucket = decodeURIComponent(listMatch[1]);
        assert.notEqual(bucket, PROTECTED_SOURCE_BUCKET);
        const body = JSON.parse(options.body);
        const entries = this.sourceListings.get(`${bucket}\u0000${body.prefix}`) || [];
        return jsonResponse(entries.slice(body.offset, body.offset + body.limit));
      }
      const downloadMatch = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/u.exec(url.pathname);
      if (downloadMatch) {
        assert.equal(method, "GET");
        const bucket = decodeURIComponent(downloadMatch[1]);
        const name = downloadMatch[2].split("/").map(decodeURIComponent).join("/");
        const source = this.sourceFiles.get(`${bucket}\u0000${name}`);
        assert.ok(source, "Unbekannter synthetischer Quelldownload.");
        this.downloadCount += 1;
        if (this.mutateInventoryAfterDownloads && this.downloadCount === this.sourceFiles.size) {
          const changed = this.sourceListings.get("stakeholder-logos\u0000logos").map((entry) => ({
            ...entry,
            updated_at: "2026-07-20T07:00:00.000Z",
            metadata: { ...entry.metadata, eTag: '"changed-backing-store-etag"' }
          }));
          this.sourceListings.set("stakeholder-logos\u0000logos", changed);
        }
        return bytesResponse(source.buffer, source.mimeType, source.etag);
      }
    }

    assert.equal(headerValue(options.headers, "authorization"), `Bearer ${GOOGLE_TOKEN}`);
    if (url.hostname === "cloudresourcemanager.googleapis.com") {
      return jsonResponse({
        name: `projects/${TARGET_PROJECT_NUMBER}`,
        projectId: EXPECTED_TARGET_PROJECT_ID,
        state: "ACTIVE"
      });
    }

    const bucketMetadataMatch = /^\/storage\/v1\/b\/([^/]+)$/u.exec(url.pathname);
    if (bucketMetadataMatch) {
      const bucket = decodeURIComponent(bucketMetadataMatch[1]);
      assert.ok(Object.values(TARGET_BUCKETS).includes(bucket));
      return jsonResponse({
        name: bucket,
        projectNumber: TARGET_PROJECT_NUMBER,
        location: this.bucketLocation,
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
          publicAccessPrevention: this.bucketPublicAccessPrevention
        },
        versioning: { enabled: true }
      });
    }

    const bucketIamMatch = /^\/storage\/v1\/b\/([^/]+)\/iam$/u.exec(url.pathname);
    if (bucketIamMatch) {
      const bucket = decodeURIComponent(bucketIamMatch[1]);
      const sourceBucket = Object.entries(TARGET_BUCKETS).find(([, target]) => target === bucket)?.[0];
      assert.ok(sourceBucket);
      return jsonResponse({
        version: 3,
        bindings: [{
          role: sourceBucket === "stakeholder-logos" ? "roles/storage.objectViewer" : "roles/storage.objectUser",
          members: [EXPECTED_WORKLOAD_PRINCIPAL]
        }, ...(this.extraBucketBinding ? [this.extraBucketBinding] : [])]
      });
    }

    const objectMatch = /^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/u.exec(url.pathname);
    if (objectMatch) {
      const bucket = decodeURIComponent(objectMatch[1]);
      const name = decodeURIComponent(objectMatch[2]);
      const target = this.targetObjects.get(objectKey(bucket, name));
      if (!target) return new Response(null, { status: 404 });
      if (url.searchParams.get("alt") === "media") {
        assert.equal(url.searchParams.get("generation"), target.generation);
        return bytesResponse(target.buffer, target.contentType);
      }
      return jsonResponse({
        name: target.name,
        size: String(target.buffer.length),
        contentType: target.contentType,
        generation: target.generation,
        metadata: target.metadata
      });
    }

    const uploadMatch = /^\/upload\/storage\/v1\/b\/([^/]+)\/o$/u.exec(url.pathname);
    if (uploadMatch) {
      assert.equal(method, "POST");
      assert.equal(url.searchParams.get("uploadType"), "multipart");
      assert.equal(url.searchParams.get("ifGenerationMatch"), "0");
      const bucket = decodeURIComponent(uploadMatch[1]);
      const multipart = parseMultipartRequest(options);
      const key = objectKey(bucket, multipart.metadata.name);
      if (this.targetObjects.has(key)) return new Response(null, { status: 412 });
      const target = {
        name: multipart.metadata.name,
        buffer: Buffer.from(multipart.buffer),
        contentType: multipart.metadata.contentType,
        generation: String(this.targetObjects.size + 1),
        metadata: multipart.metadata.metadata
      };
      this.targetObjects.set(key, target);
      this.createdNames.push(target.name);
      return jsonResponse({
        name: target.name,
        size: String(target.buffer.length),
        contentType: target.contentType,
        generation: target.generation,
        metadata: target.metadata
      });
    }

    throw new Error("Unexpected mock request");
  }
}

function assertSafeFailure(action, pattern) {
  assert.throws(action, (error) => error instanceof StorageMigrationSafetyError && pattern.test(error.message));
}

const config = buildStorageConfiguration(ENVIRONMENT);
assert.equal(config.sourceUrl, `https://${EXPECTED_SOURCE_PROJECT_ID}.supabase.co`);
assert.deepEqual(config.targetBuckets, TARGET_BUCKETS);
assertSafeFailure(() => buildStorageConfiguration({
  ...ENVIRONMENT,
  PROFILE_IMAGE_BUCKET: `vk-${PROTECTED_SOURCE_BUCKET}`
}), /protected source archive/u);
assertSafeFailure(() => buildStorageConfiguration({
  ...ENVIRONMENT,
  PROFILE_IMAGE_BUCKET: TARGET_BUCKETS["contact-images"]
}), /distinct target bucket/u);
assertSafeFailure(() => buildStorageConfiguration({
  ...ENVIRONMENT,
  SUPABASE_URL: "https://different-project.supabase.co"
}), /approved source project/u);
assertSafeFailure(() => buildStorageConfiguration({
  ...ENVIRONMENT,
  EXPECTED_STORAGE_PROJECT_PAIR_SHA256: `sha256:${"0".repeat(64)}`
}), /independently approved SHA-256 pin/u);
assertSafeFailure(() => buildStorageConfiguration({
  ...ENVIRONMENT,
  PRE_GEMATIK_DATA_BUCKET_IAM_SHA256: "not-a-sha256-pin"
}), /independently approved data-bucket IAM fingerprint/u);
assert.equal(
  migrationTargetObjectName("profile-images", "profile-a/avatar.png"),
  "profile-images/profile-a/avatar.png"
);
assert.equal(
  migrationTargetObjectName("stakeholder-logos", "logos/partner.svg"),
  "logos/partner.svg"
);
assert.equal(
  migrationTargetObjectName("contact-images", "contact-a/photo.png"),
  "contact-a/photo.png"
);
assertSafeFailure(
  () => migrationTargetObjectName("profile-images", "avatar.png"),
  /two-segment source contract/u
);
assertSafeFailure(
  () => migrationTargetObjectName("profile-images", "profile-a/nested/avatar.png"),
  /two-segment source contract/u
);
assertSafeFailure(
  () => migrationTargetObjectName("profile-images", "profile-a/avatar.jpeg"),
  /two-segment source contract/u
);
assertSafeFailure(() => storageSnapshotFingerprint([
  {
    sourceBucket: "stakeholder-logos",
    name: "logos/partner.svg",
    size: 10,
    targetMimeType: "image/svg+xml",
    sha256: "a".repeat(64)
  },
  {
    sourceBucket: "stakeholder-logos",
    name: "logos/partner.svg",
    size: 10,
    targetMimeType: "image/svg+xml",
    sha256: "a".repeat(64)
  }
], TARGET_BUCKETS), /same target object/u);

const previewOptions = Object.freeze({
  ...parseStorageMigrationArguments([]),
  manifestOutput: TEST_MANIFEST_PATH
});
validateApplyConfirmations(previewOptions);
assertSafeFailure(() => validateManifestOutputPath("relative-manifest.json"), /must be absolute/u);
assertSafeFailure(
  () => validateManifestOutputPath(path.resolve("storage-manifest.json")),
  /outside the repository/u
);
assertSafeFailure(() => validateApplyConfirmations(parseStorageMigrationArguments([
  "--confirm-source-project", EXPECTED_SOURCE_PROJECT_ID
])), /only accepted together/u);
assertSafeFailure(() => validateApplyConfirmations(parseStorageMigrationArguments([
  "--apply",
  "--confirm-source-project", EXPECTED_SOURCE_PROJECT_ID,
  "--confirm-target-project", EXPECTED_TARGET_PROJECT_ID,
  "--pre-import-backup-id", "backup-valid-123",
  "--confirm-preview-fingerprint", `sha256:${"a".repeat(64)}`,
  "--confirm-operation", "WRONG_OPERATION"
]), config), /exact operation/u);
assertSafeFailure(() => validateApplyConfirmations(parseStorageMigrationArguments([
  "--apply",
  "--confirm-source-project", EXPECTED_SOURCE_PROJECT_ID,
  "--confirm-target-project", EXPECTED_TARGET_PROJECT_ID,
  "--pre-import-backup-id", "backup-valid-123",
  "--confirm-preview-fingerprint", `sha256:${"a".repeat(64)}`,
  "--confirm-operation", OPERATION_CONFIRMATION
]), config), /quarantined source object count/u);

const paginationCalls = [];
const paginationFetch = async (url, options) => {
  paginationCalls.push({ url, body: JSON.parse(options.body) });
  const { prefix, offset } = JSON.parse(options.body);
  if (prefix === "" && offset === 0) {
    return jsonResponse([
      folderEntry("nested"),
      fileEntry("root-a.png", Buffer.alloc(24), "image/png", "root-a")
    ]);
  }
  if (prefix === "" && offset === 2) {
    return jsonResponse([fileEntry("root-b.png", Buffer.alloc(24), "image/png", "root-b")]);
  }
  if (prefix === "nested" && offset === 0) {
    return jsonResponse([fileEntry("child.png", Buffer.alloc(24), "image/png", "child")]);
  }
  return jsonResponse([]);
};
const paginated = await listSupabaseBucketObjects({
  fetchImpl: paginationFetch,
  config,
  sourceBucket: "contact-images",
  pageSize: 2
});
assert.deepEqual(paginated.map((object) => object.name), ["nested/child.png", "root-a.png", "root-b.png"]);
assert.deepEqual(paginationCalls.map((call) => [call.body.prefix, call.body.offset]), [
  ["", 0], ["", 2], ["nested", 0]
]);
await assert.rejects(
  listSupabaseBucketObjects({
    fetchImpl: async () => { throw new Error("should not run"); },
    config,
    sourceBucket: PROTECTED_SOURCE_BUCKET
  }),
  (error) => error instanceof StorageMigrationSafetyError && /immutable migration allowlist/u.test(error.message)
);
await assert.rejects(
  listSupabaseBucketObjects({
    fetchImpl: async () => jsonResponse([fileEntry("unsafe.html", Buffer.alloc(10), "text/html", "unsafe")]),
    config,
    sourceBucket: "contact-images"
  }),
  (error) => error instanceof StorageMigrationSafetyError && /MIME type outside/u.test(error.message)
);
await assert.rejects(
  listSupabaseBucketObjects({
    fetchImpl: async () => jsonResponse([folderEntry("..")]),
    config,
    sourceBucket: "contact-images"
  }),
  (error) => error instanceof StorageMigrationSafetyError && /unsafe path segment/u.test(error.message)
);

const mutatingSourceMock = new StorageFetchMock();
mutatingSourceMock.mutateInventoryAfterDownloads = true;
await assert.rejects(
  collectSourceStorageSnapshot({ fetchImpl: mutatingSourceMock.fetch.bind(mutatingSourceMock), config }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "SOURCE_INVENTORY_CHANGED"
);

const invalidContentMock = new StorageFetchMock();
const privateMarker = "private-object-content-must-not-be-logged";
const oversizedPng = syntheticPng(5000, 10);
const malformedPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16)
]);
const unsafeSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>${privateMarker}</script></svg>`, "utf8");
invalidContentMock.sourceFiles.set("profile-images\u0000profile-a/avatar.png", {
  buffer: oversizedPng,
  mimeType: "image/png",
  etag: 'W/"transport-invalid-profile"'
});
invalidContentMock.sourceListings.set("profile-images\u0000profile-a", [
  fileEntry("avatar.png", oversizedPng, "image/png", "profile-avatar")
]);
invalidContentMock.sourceFiles.set("contact-images\u0000contact-a/private.png", {
  buffer: malformedPng,
  mimeType: "image/png",
  etag: 'W/"transport-invalid-contact"'
});
invalidContentMock.sourceListings.set("contact-images\u0000", [folderEntry("contact-a")]);
invalidContentMock.sourceListings.set("contact-images\u0000contact-a", [
  fileEntry("private.png", malformedPng, "image/png", "contact-image")
]);
invalidContentMock.sourceFiles.set("stakeholder-logos\u0000logos/partner.svg", {
  buffer: unsafeSvg,
  mimeType: "application/xml",
  etag: 'W/"transport-invalid-logo"'
});
invalidContentMock.sourceListings.set("stakeholder-logos\u0000logos", [
  fileEntry("partner.svg", unsafeSvg, "application/xml", "logo")
]);
const invalidSnapshot = await collectSourceStorageSnapshot({
  fetchImpl: invalidContentMock.fetch.bind(invalidContentMock),
  config
});
assert.equal(invalidSnapshot.sourceObjectCount, 4);
assert.equal(invalidSnapshot.objects.length, 1);
assert.equal(invalidSnapshot.quarantined.length, 3);
assert.deepEqual(invalidSnapshot.quarantineSummary, [
  { sourceBucket: "contact-images", mimeType: "image/png", signatureClass: "png-structure-invalid", count: 1 },
  { sourceBucket: "profile-images", mimeType: "image/png", signatureClass: "png-dimensions-exceeded", count: 1 },
  { sourceBucket: "stakeholder-logos", mimeType: "application/xml", signatureClass: "svg-script", count: 1 }
]);

const referencedObjectKeys = new Set([
  objectKey("profile-images", "profile-a/avatar.png"),
  objectKey("contact-note-attachments", "contact-a/note-a/readme.txt"),
  objectKey("stakeholder-logos", "logos/partner.svg")
]);
const orphanMock = new StorageFetchMock();
const orphanPng = syntheticPng(12, 12);
orphanMock.sourceFiles.set("contact-images\u0000contact-a/orphan.png", {
  buffer: orphanPng,
  mimeType: "image/png",
  etag: 'W/"transport-orphan"'
});
orphanMock.sourceListings.set("contact-images\u0000", [folderEntry("contact-a")]);
orphanMock.sourceListings.set("contact-images\u0000contact-a", [
  fileEntry("orphan.png", orphanPng, "image/png", "orphan-contact-image")
]);
const orphanSnapshot = await collectSourceStorageSnapshot({
  fetchImpl: orphanMock.fetch.bind(orphanMock),
  config,
  sourceReferences: referencedObjectKeys
});
assert.equal(orphanSnapshot.objects.length, 3);
assert.equal(orphanSnapshot.quarantined.length, 1);
assert.equal(orphanSnapshot.quarantined[0].signatureClass, "unreferenced-orphan");

const legacyPdfMock = new StorageFetchMock();
const legacyPdf = Buffer.from("%PDF-1.7\nsynthetic test body\n%%EOF", "ascii");
legacyPdfMock.sourceFiles.set("contact-note-attachments\u0000contact-a/note-a/readme.txt", {
  buffer: legacyPdf,
  mimeType: "application/pdf",
  etag: 'W/"transport-pdf"'
});
legacyPdfMock.sourceListings.set("contact-note-attachments\u0000contact-a/note-a", [
  fileEntry("readme.txt", legacyPdf, "application/pdf", "attachment")
]);
const legacyPdfSnapshot = await collectSourceStorageSnapshot({
  fetchImpl: legacyPdfMock.fetch.bind(legacyPdfMock),
  config,
  sourceReferences: referencedObjectKeys
});
assert.ok(legacyPdfSnapshot.quarantined.some((entry) => entry.signatureClass === "pdf-malware-scan-required"));
const missingReferenceMock = new StorageFetchMock();
await assert.rejects(
  collectSourceStorageSnapshot({
    fetchImpl: missingReferenceMock.fetch.bind(missingReferenceMock),
    config,
    sourceReferences: new Set([...referencedObjectKeys, objectKey("contact-images", "missing.png")])
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "SOURCE_DATABASE_REFERENCE_MISSING"
);
const invalidPreviewLogs = [];
const invalidPreview = await runStorageMigration({
  environment: ENVIRONMENT,
  options: previewOptions,
  fetchImpl: invalidContentMock.fetch.bind(invalidContentMock),
  manifestWriter: captureManifest,
  log: (line) => invalidPreviewLogs.push(line)
});
assert.equal(invalidPreview.quarantineCount, 3);
const invalidManifest = capturedManifests.at(-1);
assert.equal(invalidManifest.mode, "preview");
assert.equal(invalidManifest.entries.length, 4);
assert.equal(invalidManifest.entries.filter((entry) => entry.status === "quarantined").length, 3);
assert.match(invalidManifest.manifestFingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.match(invalidPreviewLogs[0], /quarantine_count=3/u);
assert.match(invalidPreviewLogs[0], /contact-images\/image\/png\/png-structure-invalid:1/u);
assert.match(invalidPreviewLogs[0], /profile-images\/image\/png\/png-dimensions-exceeded:1/u);
assert.match(invalidPreviewLogs[0], /stakeholder-logos\/application\/xml\/svg-script:1/u);
for (const privateValue of ["profile-a", "avatar.png", "private.png", "partner.svg", privateMarker]) {
  assert.doesNotMatch(invalidPreviewLogs[0], new RegExp(privateValue, "u"));
}
const quarantineMismatchOptions = parseStorageMigrationArguments([
  "--apply",
  "--confirm-source-project", EXPECTED_SOURCE_PROJECT_ID,
  "--confirm-target-project", EXPECTED_TARGET_PROJECT_ID,
  "--pre-import-backup-id", "cloudsql-pre-import-20260720-001",
  "--confirm-preview-fingerprint", invalidPreview.fingerprint,
  "--confirm-quarantined-object-count", "0",
  "--manifest-output", TEST_MANIFEST_PATH,
  "--recovery-journal", TEST_RECOVERY_JOURNAL_PATH,
  "--confirm-operation", OPERATION_CONFIRMATION
]);
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: quarantineMismatchOptions,
    fetchImpl: invalidContentMock.fetch.bind(invalidContentMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "QUARANTINE_COUNT_MISMATCH"
);
assert.ok(!invalidContentMock.calls.some((call) => call.url.includes("/upload/storage/v1/")),
  "Ein abweichender Quarantaene-Count muss vor dem ersten Upload abbrechen.");

const storageMock = new StorageFetchMock();
const previewLogs = [];
const preview = await runStorageMigration({
  environment: ENVIRONMENT,
  options: previewOptions,
  fetchImpl: storageMock.fetch.bind(storageMock),
  manifestWriter: captureManifest,
  log: (line) => previewLogs.push(line)
});
assert.match(preview.fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(preview.objectCount, 3);
const previewManifest = capturedManifests.at(-1);
assert.equal(preview.manifestFingerprint, previewManifest.manifestFingerprint);
assert.equal(previewManifest.mode, "preview");
assert.equal(previewManifest.snapshotFingerprint, preview.fingerprint);
assert.equal(previewManifest.entries.filter((entry) => entry.status === "planned-create").length, 2);
assert.equal(previewManifest.entries.filter((entry) => entry.status === "verified-identical").length, 1);
assert.ok(previewManifest.entries.some((entry) => (
  entry.sourceRef.bucket === "profile-images"
  && entry.targetObject.object === "profile-images/profile-a/avatar.png"
  && entry.sha256.startsWith("sha256:")
)));
assert.equal(preview.plan.missing.length, 2);
assert.equal(preview.plan.identical.length, 1);
assert.equal(storageMock.createdNames.length, 0, "Preview darf kein Zielobjekt anlegen.");
assert.equal(previewLogs.length, 1);
assert.match(previewLogs[0], /mode=PREVIEW object_count=3 source_object_count=3 byte_count=/u);
assert.match(previewLogs[0], /create_count=2 identical_count=1/u);
assert.match(previewLogs[0], /quarantine_count=0 quarantine=none/u);
for (const secretOrIdentifier of [
  SOURCE_SECRET,
  GOOGLE_TOKEN,
  "profile-a",
  "avatar.png",
  "partner.svg",
  "contact-a",
  ...Object.values(TARGET_BUCKETS),
  "supabase.co",
  "storage.googleapis.com"
]) assert.doesNotMatch(previewLogs[0], new RegExp(secretOrIdentifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

const publicBucketMock = new StorageFetchMock();
publicBucketMock.bucketPublicAccessPrevention = "inherited";
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: previewOptions,
    fetchImpl: publicBucketMock.fetch.bind(publicBucketMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "TARGET_BUCKET_MISMATCH"
);
const broadIamMock = new StorageFetchMock();
broadIamMock.extraBucketBinding = { role: "roles/storage.objectViewer", members: ["allUsers"] };
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: previewOptions,
    fetchImpl: broadIamMock.fetch.bind(broadIamMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "TARGET_BUCKET_IAM_MISMATCH"
);
const iamPinMock = new StorageFetchMock();
await assert.rejects(
  runStorageMigration({
    environment: {
      ...ENVIRONMENT,
      PRE_GEMATIK_DATA_BUCKET_IAM_SHA256: `sha256:${"0".repeat(64)}`
    },
    options: previewOptions,
    fetchImpl: iamPinMock.fetch.bind(iamPinMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "TARGET_BUCKET_IAM_PIN_MISMATCH"
);

const applyOptions = parseStorageMigrationArguments([
  "--apply",
  "--confirm-source-project", EXPECTED_SOURCE_PROJECT_ID,
  "--confirm-target-project", EXPECTED_TARGET_PROJECT_ID,
  "--pre-import-backup-id", "cloudsql-pre-import-20260720-001",
  "--confirm-preview-fingerprint", preview.fingerprint,
  "--confirm-quarantined-object-count", "0",
  "--manifest-output", TEST_MANIFEST_PATH,
  "--recovery-journal", TEST_RECOVERY_JOURNAL_PATH,
  "--confirm-operation", OPERATION_CONFIRMATION
]);
validateApplyConfirmations(applyOptions, config);
const blockedByGcpGateMock = new StorageFetchMock();
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: applyOptions,
    fetchImpl: blockedByGcpGateMock.fetch.bind(blockedByGcpGateMock),
    manifestWriter: captureManifest,
    log: () => {},
    gcpGate: async () => ({ ok: false, fingerprint: "" }),
    journalFactory: () => { throw new Error("Journal darf vor bestandenem GCP-Gate nicht oeffnen."); }
  }),
  (error) => error instanceof StorageMigrationSafetyError && error.code === "GCP_GATE_REQUIRED"
);
assert.ok(!blockedByGcpGateMock.calls.some((call) => call.url.includes("/upload/storage/v1/")),
  "Ein fehlendes GCP-Gate muss vor dem ersten Upload abbrechen.");
const applyLogs = [];
let gcpGateCalls = 0;
const journalEvents = [];
let journalClosed = false;
const applied = await runStorageMigration({
  environment: ENVIRONMENT,
  options: applyOptions,
  fetchImpl: storageMock.fetch.bind(storageMock),
  manifestWriter: captureManifest,
  log: (line) => applyLogs.push(line),
  gcpGate: async (gateEnvironment) => {
    gcpGateCalls += 1;
    assert.equal(
      gateEnvironment.PRE_IMPORT_BACKUP_ID,
      applyOptions.preImportBackupId,
      "Der Gate muss exakt die im Storage-Apply bestaetigte Backup-ID pruefen."
    );
    return { ok: true, fingerprint: `sha256:${"9".repeat(64)}` };
  },
  journalFactory: (journalPath) => {
    assert.equal(journalPath, TEST_RECOVERY_JOURNAL_PATH);
    return {
      record(entry) { journalEvents.push(entry); },
      close() { journalClosed = true; }
    };
  }
});
assert.equal(gcpGateCalls, 1, "Apply muss das frische GCP-Gate exakt einmal ausfuehren.");
assert.equal(journalEvents[0].event, "apply-start");
assert.equal(journalEvents.at(-1).event, "apply-complete");
assert.equal(journalEvents.filter((entry) => entry.event === "object-verified").length, 2);
assert.equal(journalClosed, true, "Das Recovery-Journal muss auch nach erfolgreichem Apply geschlossen werden.");
assert.equal(applied.createdCount, 2);
const applyManifest = capturedManifests.at(-1);
assert.equal(applyManifest.mode, "apply");
assert.equal(applyManifest.snapshotFingerprint, preview.fingerprint);
assert.equal(applyManifest.entries.filter((entry) => entry.status === "created").length, 2);
assert.equal(applyManifest.entries.filter((entry) => entry.status === "verified-identical").length, 1);
assert.deepEqual(storageMock.createdNames.sort(), ["logos/partner.svg", "profile-images/profile-a/avatar.png"],
  "Profile erhalten deterministisch den Zielpraefix; Logo-, Kontakt- und Anhangspfade bleiben unveraendert.");
assert.equal(
  storageMock.targetObjects.get(objectKey(TARGET_BUCKETS["stakeholder-logos"], "logos/partner.svg")).contentType,
  "image/svg+xml",
  "XML-erkannte sichere SVGs muessen fuer die Ziel-API auf den kanonischen MIME-Typ gesetzt werden."
);
assert.match(applyLogs[0], /mode=APPLY object_count=3/u);
assert.match(applyLogs[0], /create_count=2 identical_count=1/u);
assert.ok(storageMock.calls.every((call) => call.method !== "DELETE"), "Die Migration darf nie loeschen.");
assert.ok(storageMock.calls.every((call) => !call.url.includes(PROTECTED_SOURCE_BUCKET)),
  "Das geschuetzte Quellarchiv darf nie angefragt werden.");
const uploadCalls = storageMock.calls.filter((call) => call.method === "POST" && call.url.includes("/upload/storage/v1/"));
assert.equal(uploadCalls.length, 2);
for (const call of uploadCalls) {
  const url = new URL(call.url);
  assert.equal(url.searchParams.get("ifGenerationMatch"), "0", "Uploads muessen create-only sein.");
}

const idempotentLogs = [];
const idempotentPreview = await runStorageMigration({
  environment: ENVIRONMENT,
  options: previewOptions,
  fetchImpl: storageMock.fetch.bind(storageMock),
  manifestWriter: captureManifest,
  log: (line) => idempotentLogs.push(line)
});
assert.equal(idempotentPreview.plan.missing.length, 0);
assert.equal(idempotentPreview.plan.identical.length, 3);
assert.match(idempotentLogs[0], /create_count=0 identical_count=3/u);

const staleFingerprintOptions = Object.freeze({
  ...applyOptions,
  confirmPreviewFingerprint: `sha256:${"0".repeat(64)}`
});
const staleMock = new StorageFetchMock();
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: staleFingerprintOptions,
    fetchImpl: staleMock.fetch.bind(staleMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && /differs from the confirmed Preview/u.test(error.message)
);
assert.ok(!staleMock.calls.some((call) => call.url.includes("/upload/storage/v1/")),
  "Bei abweichendem Preview-Fingerprint darf kein Upload beginnen.");

const conflictMock = new StorageFetchMock();
conflictMock.putTargetObject(
  TARGET_BUCKETS["profile-images"],
  "profile-images/profile-a/avatar.png",
  Buffer.alloc(conflictMock.profilePng.length, 0x41),
  "image/png",
  "99"
);
await assert.rejects(
  runStorageMigration({
    environment: ENVIRONMENT,
    options: previewOptions,
    fetchImpl: conflictMock.fetch.bind(conflictMock),
    manifestWriter: captureManifest,
    log: () => {}
  }),
  (error) => error instanceof StorageMigrationSafetyError && /conflicts with the source SHA-256/u.test(error.message)
);
assert.ok(!conflictMock.calls.some((call) => call.url.includes("/upload/storage/v1/")),
  "Ein Zielkonflikt muss vor dem ersten Upload abbrechen.");
assert.ok(conflictMock.calls.every((call) => call.method !== "DELETE"));

const protectedManifestDirectory = mkdtempSync(path.join(os.tmpdir(), "vk-storage-manifest-test-"));
try {
  const protectedManifestPath = path.join(protectedManifestDirectory, "storage-apply-manifest.json");
  const protectedJournalPath = path.join(protectedManifestDirectory, "storage-apply.ndjson");
  writeProtectedMigrationManifest(protectedManifestPath, applyManifest);
  assert.equal(statSync(protectedManifestPath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(protectedManifestPath, "utf8")), applyManifest);
  assertSafeFailure(
    () => writeProtectedMigrationManifest(protectedManifestPath, applyManifest),
    /could not be created safely/u
  );
  assert.equal(path.basename(validateRecoveryJournalPath(protectedJournalPath)), "storage-apply.ndjson");
  const protectedJournal = createProtectedRecoveryJournal(protectedJournalPath);
  protectedJournal.record({ event: "synthetic-test", fingerprint: preview.fingerprint });
  protectedJournal.close();
  assert.equal(statSync(protectedJournalPath).mode & 0o777, 0o600);
  assert.deepEqual(
    JSON.parse(readFileSync(protectedJournalPath, "utf8").trim()),
    { event: "synthetic-test", fingerprint: preview.fingerprint }
  );
} finally {
  rmSync(protectedManifestDirectory, { recursive: true, force: true });
}

console.log("Supabase-Storage-zu-GCS-Vertrag erfolgreich geprueft.");
} finally {
  rmSync(TEST_OUTPUT_DIRECTORY, { recursive: true, force: true });
}
