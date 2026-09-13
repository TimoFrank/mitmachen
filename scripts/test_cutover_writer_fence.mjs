#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertApiWriterFencePermission,
  validateApiWriterFenceConfiguration
} from "../api/cutover-writer-fence.mjs";

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "vk-writer-fence-test-"));
const fenceDirectory = path.join(temporaryRoot, "api-control");
const readPolicy = { writeClass: "read" };
const writePolicy = { writeClass: "restricted" };

try {
  assert.equal(validateApiWriterFenceConfiguration({}), "");
  assert.equal(validateApiWriterFenceConfiguration({
    API_CUTOVER_MODE_REQUIRED: "1",
    API_WRITER_FENCE_DIRECTORY: fenceDirectory
  }), fenceDirectory);
  assert.throws(
    () => validateApiWriterFenceConfiguration({ API_CUTOVER_MODE_REQUIRED: "1" }),
    /API_WRITER_FENCE_DIRECTORY/u
  );
  assert.throws(
    () => validateApiWriterFenceConfiguration({
      API_CUTOVER_MODE_REQUIRED: "1",
      API_WRITER_FENCE_DIRECTORY: "relative/control"
    }),
    /kanonisches absolutes Verzeichnis/u
  );

  assert.doesNotThrow(() => assertApiWriterFencePermission(fenceDirectory, readPolicy));
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503 && error?.retryAfter === 60,
    "Ein fehlender Sentinel muss Schreibzugriffe sperren."
  );

  mkdirSync(fenceDirectory);
  writeFileSync(path.join(fenceDirectory, ".writer-fence-ready"), "schemaVersion=1\n");
  assert.doesNotThrow(() => assertApiWriterFencePermission(fenceDirectory, writePolicy));

  writeFileSync(path.join(fenceDirectory, ".cutover-mode-change-pending"), "pending\n");
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503 && error?.retryAfter === 60,
    "Ein vorhandener Transition-Marker muss Schreibzugriffe sperren."
  );
  rmSync(path.join(fenceDirectory, ".cutover-mode-change-pending"));

  writeFileSync(path.join(fenceDirectory, "marker-target"), "pending\n");
  symlinkSync("marker-target", path.join(fenceDirectory, ".cutover-mode-change-pending"));
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503,
    "Auch ein Marker-Symlink muss Schreibzugriffe sperren."
  );
  rmSync(path.join(fenceDirectory, ".cutover-mode-change-pending"));

  rmSync(path.join(fenceDirectory, ".writer-fence-ready"));
  writeFileSync(path.join(fenceDirectory, "sentinel-target"), "schemaVersion=1\n");
  symlinkSync("sentinel-target", path.join(fenceDirectory, ".writer-fence-ready"));
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503,
    "Ein Sentinel-Symlink darf den Writer-Fence nicht freigeben."
  );
  rmSync(path.join(fenceDirectory, ".writer-fence-ready"));

  writeFileSync(path.join(fenceDirectory, ".writer-fence-ready"), "schemaVersion=1\n\n");
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503,
    "Ein Sentinel mit zusaetzlichem Zeilenumbruch muss Schreibzugriffe sperren."
  );

  writeFileSync(path.join(fenceDirectory, ".writer-fence-ready"), "schemaVersion=2\n");
  assert.throws(
    () => assertApiWriterFencePermission(fenceDirectory, writePolicy),
    (error) => error?.status === 503,
    "Ein driftender Sentinel muss Schreibzugriffe sperren."
  );

  console.log("Cutover writer fence test OK: missing, invalid and pending control state blocks every write policy.");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
