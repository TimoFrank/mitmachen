#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OBJECT_STORAGE_AREAS,
  createObjectStorage,
  validateObjectName
} from "../api/object-storage.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "vk-object-storage-"));
await chmod(root, 0o700);

try {
  const storage = createObjectStorage({
    env: {
      OBJECT_STORAGE_DRIVER: "filesystem",
      OBJECT_STORAGE_ROOT: root
    }
  });
  const area = OBJECT_STORAGE_AREAS.CONTACT_IMAGES;
  const objectName = "contact-images/contact-01/11111111-1111-4111-8111-111111111111.png";
  const content = Buffer.from("synthetic-image-content");

  assert.equal(storage.driver, "filesystem");
  assert.equal(storage.enabled(area, ""), true);
  assert.equal(
    storage.reference(area, "", objectName),
    "private://contact-images/contact-01/11111111-1111-4111-8111-111111111111.png"
  );
  assert.equal((await storage.health()).ok, true);

  await Promise.all([
    storage.save(area, "", objectName, content, "image/png"),
    storage.save(area, "", objectName, content, "image/png")
  ]);
  const loaded = await storage.read(area, "", objectName, {
    maxBytes: 1024,
    allowedContentTypes: ["image/png"]
  });
  assert.equal(loaded.contentType, "image/png");
  assert.deepEqual(loaded.buffer, content);

  const objectHash = crypto.createHash("sha256").update(objectName).digest("hex");
  const objectRoot = path.join(root, "v1", area, objectHash.slice(0, 2), objectHash);
  const metadataPath = path.join(objectRoot, "metadata.json");
  const contentPath = path.join(objectRoot, "content");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(metadata.objectName, objectName);
  assert.equal(metadata.contentSha256, crypto.createHash("sha256").update(content).digest("hex"));
  assert.equal((await lstat(metadataPath)).mode & 0o777, 0o600);
  assert.equal((await lstat(contentPath)).mode & 0o777, 0o600);
  assert.equal((await lstat(objectRoot)).mode & 0o777, 0o700);

  const verifierPath = fileURLToPath(new URL("../api/verify-object-storage.mjs", import.meta.url));
  const verified = spawnSync(process.execPath, [verifierPath], {
    encoding: "utf8",
    env: { ...process.env, OBJECT_STORAGE_ROOT: root }
  });
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.deepEqual(JSON.parse(verified.stdout), {
    ok: true,
    counts: {
      [OBJECT_STORAGE_AREAS.PROFILE_IMAGES]: 0,
      [OBJECT_STORAGE_AREAS.CONTACT_IMAGES]: 1,
      [OBJECT_STORAGE_AREAS.CONTACT_NOTE_ATTACHMENTS]: 0,
      [OBJECT_STORAGE_AREAS.STAKEHOLDER_LOGOS]: 0
    },
    totalBytes: content.length
  });
  const missingRoot = spawnSync(process.execPath, [verifierPath], {
    encoding: "utf8",
    env: { ...process.env, OBJECT_STORAGE_ROOT: path.join(root, "missing") }
  });
  assert.notEqual(missingRoot.status, 0, "Ein fehlender Restore-Root darf nicht als leerer, gueltiger Speicher gelten.");

  await assert.rejects(
    storage.save(area, "", objectName, Buffer.from("different"), "image/png"),
    (error) => error?.status === 409
  );
  await assert.rejects(
    storage.read(area, "", objectName, { maxBytes: 2 }),
    (error) => error?.status === 415
  );
  await assert.rejects(
    storage.read(area, "", objectName, { allowedContentTypes: ["image/jpeg"] }),
    (error) => error?.status === 415
  );

  for (const unsafeName of ["../secret", "/absolute", "a//b", "a/./b", "a/../b", "a\\b", "a\u0000b"]) {
    assert.throws(() => validateObjectName(unsafeName));
  }

  const tamperedName = "contact-images/contact-01/22222222-2222-4222-8222-222222222222.png";
  await storage.save(area, "", tamperedName, content, "image/png");
  const tamperedHash = crypto.createHash("sha256").update(tamperedName).digest("hex");
  const tamperedContentPath = path.join(root, "v1", area, tamperedHash.slice(0, 2), tamperedHash, "content");
  await writeFile(tamperedContentPath, "tampered", { mode: 0o600 });
  await assert.rejects(storage.read(area, "", tamperedName), (error) => error?.status === 415);

  const linkedName = "contact-images/contact-01/33333333-3333-4333-8333-333333333333.png";
  await storage.save(area, "", linkedName, content, "image/png");
  const linkedHash = crypto.createHash("sha256").update(linkedName).digest("hex");
  const linkedContentPath = path.join(root, "v1", area, linkedHash.slice(0, 2), linkedHash, "content");
  const outsidePath = path.join(root, "outside");
  await writeFile(outsidePath, "outside", { mode: 0o600 });
  await unlink(linkedContentPath);
  await symlink(outsidePath, linkedContentPath);
  await assert.rejects(storage.read(area, "", linkedName), (error) => error?.status === 415);

  await storage.remove(area, "", objectName);
  assert.equal(await storage.read(area, "", objectName), null);
  const tombstonePrefix = path.join(root, "deleted", "v1", area, objectHash.slice(0, 2));
  const tombstones = await readdir(tombstonePrefix);
  assert.equal(tombstones.length, 1, "Geloeschte Dateisystemobjekte bleiben fuer Backup/Recovery in Quarantaene.");

  const insecureRoot = path.join(root, "insecure");
  await mkdir(insecureRoot, { mode: 0o755 });
  await chmod(insecureRoot, 0o755);
  const insecureStorage = createObjectStorage({
    env: {
      OBJECT_STORAGE_DRIVER: "filesystem",
      OBJECT_STORAGE_ROOT: insecureRoot
    }
  });
  assert.equal((await insecureStorage.health()).ok, false);
  await assert.rejects(
    insecureStorage.save(area, "", "contact-images/contact-01/44444444-4444-4444-8444-444444444444.png", content, "image/png")
  );

  const gcsRequests = [];
  const gcsStorage = createObjectStorage({
    env: {
      OBJECT_STORAGE_DRIVER: "gcs",
      GOOGLE_OAUTH_ACCESS_TOKEN: "synthetic-token"
    },
    fetchImpl: async (url, options = {}) => {
      gcsRequests.push({ url: String(url), options });
      if (String(url).includes("upload/storage")) {
        return new Response("{}", { status: 200 });
      }
      if (options.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).includes("alt=media")) {
        return new Response(content, {
          status: 200,
          headers: { "content-length": String(content.length), "content-type": "image/png" }
        });
      }
      return new Response(JSON.stringify({
        name: objectName,
        size: String(content.length),
        contentType: "image/png",
        generation: "7"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(gcsStorage.enabled(area, "synthetic-bucket"), true);
  await gcsStorage.save(area, "synthetic-bucket", objectName, content, "image/png");
  const gcsObject = await gcsStorage.read(area, "synthetic-bucket", objectName, {
    maxBytes: 1024,
    allowedContentTypes: ["image/png"]
  });
  assert.deepEqual(gcsObject.buffer, content);
  await gcsStorage.remove(area, "synthetic-bucket", objectName);
  assert(gcsRequests.every(({ options }) => options.headers.authorization === "Bearer synthetic-token"));

  console.log("Object storage tests OK");
} finally {
  await rm(root, { recursive: true, force: true });
}
