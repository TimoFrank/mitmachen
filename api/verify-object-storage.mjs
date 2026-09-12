#!/usr/bin/env node

import crypto from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  OBJECT_STORAGE_AREAS,
  createObjectStorage,
  validateObjectName
} from "./object-storage.mjs";

const root = String(process.env.OBJECT_STORAGE_ROOT || "").trim();
if (!path.isAbsolute(root) || root === path.parse(root).root) {
  throw new Error("OBJECT_STORAGE_ROOT ist fuer die Restore-Pruefung ungueltig.");
}
const rootState = await lstat(root);
if (
  rootState.isSymbolicLink()
  || !rootState.isDirectory()
  || (process.platform !== "win32" && (rootState.mode & 0o077) !== 0)
  || (typeof process.getuid === "function" && rootState.uid !== process.getuid())
) {
  throw new Error("Wiederhergestellter Object-Storage-Root verletzt den Owner-/Modusvertrag.");
}

const storage = createObjectStorage({
  env: {
    OBJECT_STORAGE_DRIVER: "filesystem",
    OBJECT_STORAGE_ROOT: root
  }
});
const activeRoot = path.join(root, "v1");
const counts = Object.fromEntries(Object.values(OBJECT_STORAGE_AREAS).map((area) => [area, 0]));
let totalBytes = 0;

async function directories(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const name of names.sort()) {
    const state = await lstat(path.join(directory, name));
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error("Object-Storage-Inventar enthaelt einen unerwarteten Eintrag.");
    }
    result.push(name);
  }
  return result;
}

for (const area of await directories(activeRoot)) {
  if (!Object.values(OBJECT_STORAGE_AREAS).includes(area)) {
    throw new Error("Object-Storage-Inventar enthaelt einen unbekannten Bereich.");
  }
  for (const prefix of await directories(path.join(activeRoot, area))) {
    if (!/^[a-f0-9]{2}$/u.test(prefix)) throw new Error("Object-Storage-Hashprefix ist ungueltig.");
    for (const objectHash of await directories(path.join(activeRoot, area, prefix))) {
      if (!/^[a-f0-9]{64}$/u.test(objectHash) || !objectHash.startsWith(prefix)) {
        throw new Error("Object-Storage-Hashpfad ist ungueltig.");
      }
      const metadata = JSON.parse(await readFile(
        path.join(activeRoot, area, prefix, objectHash, "metadata.json"),
        "utf8"
      ));
      const objectName = validateObjectName(metadata.objectName);
      const expectedHash = crypto.createHash("sha256").update(objectName).digest("hex");
      if (expectedHash !== objectHash) throw new Error("Object-Storage-Name und Hashpfad widersprechen sich.");
      const object = await storage.read(area, "", objectName);
      if (!object) throw new Error("Inventarisiertes Object-Storage-Objekt fehlt.");
      counts[area] += 1;
      totalBytes += object.buffer.length;
    }
  }
}

console.log(JSON.stringify({ ok: true, counts, totalBytes }));
