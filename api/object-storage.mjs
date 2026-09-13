import crypto from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  statfs,
  unlink
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

export const OBJECT_STORAGE_AREAS = Object.freeze({
  PROFILE_IMAGES: "profile-images",
  CONTACT_IMAGES: "contact-images",
  CONTACT_NOTE_ATTACHMENTS: "contact-note-attachments",
  STAKEHOLDER_LOGOS: "stakeholder-logos"
});

const ALLOWED_AREAS = new Set(Object.values(OBJECT_STORAGE_AREAS));
const ALLOWED_DRIVERS = new Set(["gcs", "filesystem"]);
const METADATA_FILE = "metadata.json";
const CONTENT_FILE = "content";
const METADATA_MAX_BYTES = 16 * 1024;
const MIN_FREE_BYTES = 128 * 1024 * 1024;

function storageError(message, status = 500, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.status = status;
  return error;
}

function cleanContentType(value) {
  const contentType = String(value || "").toLowerCase().split(";", 1)[0].trim();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(contentType)) {
    throw storageError("Object-Storage-MIME-Typ ist nicht freigegeben.", 415);
  }
  return contentType;
}

function validateArea(area) {
  const normalized = String(area || "");
  if (!ALLOWED_AREAS.has(normalized)) {
    throw storageError("Unbekannter privater Object-Storage-Bereich.");
  }
  return normalized;
}

export function validateObjectName(value) {
  const objectName = String(value || "");
  const parts = objectName.split("/");
  if (
    !objectName
    || Buffer.byteLength(objectName, "utf8") > 2048
    || objectName.startsWith("/")
    || objectName.endsWith("/")
    || /[\\\u0000-\u001f\u007f]/u.test(objectName)
    || parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw storageError("Object-Storage-Name ist nicht freigegeben.", 415);
  }
  return objectName;
}

function exactMetadataKeys(value) {
  const expected = ["contentSha256", "contentType", "createdAt", "objectName", "schemaVersion", "size"].sort();
  const actual = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function fsyncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveFile(filePath, content, mode) {
  const handle = await open(filePath, "wx", mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function safeFilesystemRoot(value) {
  const root = String(value || "").trim();
  if (!root || !path.isAbsolute(root) || root === path.parse(root).root) {
    throw new Error("OBJECT_STORAGE_ROOT muss fuer den Dateisystem-Treiber ein enger absoluter Pfad sein.");
  }
  return path.normalize(root);
}

function objectPaths(root, area, objectName) {
  const objectHash = sha256Hex(Buffer.from(objectName, "utf8"));
  const areaRoot = path.join(root, "v1", area);
  const prefixRoot = path.join(areaRoot, objectHash.slice(0, 2));
  const objectRoot = path.join(prefixRoot, objectHash);
  return Object.freeze({ areaRoot, prefixRoot, objectRoot, objectHash });
}

async function assertPrivateDirectory(directory, { expectedUid = null, requireWritable = true } = {}) {
  const linkState = await lstat(directory);
  if (linkState.isSymbolicLink() || !linkState.isDirectory()) {
    throw storageError("Privater Object Storage ist kein regulaeres Verzeichnis.");
  }
  if (process.platform !== "win32" && (linkState.mode & 0o077) !== 0) {
    throw storageError("Privater Object Storage muss owner-only berechtigt sein.");
  }
  if (expectedUid !== null && linkState.uid !== expectedUid) {
    throw storageError("Privater Object Storage gehoert nicht dem API-Laufzeitkonto.");
  }
  const requiredAccess = fsConstants.R_OK | fsConstants.X_OK | (requireWritable ? fsConstants.W_OK : 0);
  await access(directory, requiredAccess);
  return linkState;
}

async function ensureHashedParents(root, area, paths) {
  await assertPrivateDirectory(root, {
    expectedUid: typeof process.getuid === "function" ? process.getuid() : null
  });
  const v1Root = path.join(root, "v1");
  for (const directory of [v1Root, paths.areaRoot, paths.prefixRoot]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const state = await lstat(directory);
    if (state.isSymbolicLink() || !state.isDirectory() || (process.platform !== "win32" && (state.mode & 0o077) !== 0)) {
      throw storageError("Object-Storage-Zielverzeichnis ist nicht freigegeben.");
    }
  }
}

async function readFilesystemObject(root, area, objectName, options = {}) {
  await assertPrivateDirectory(root, {
    expectedUid: typeof process.getuid === "function" ? process.getuid() : null,
    requireWritable: false
  });
  const normalizedArea = validateArea(area);
  const normalizedName = validateObjectName(objectName);
  const paths = objectPaths(root, normalizedArea, normalizedName);
  let directoryState;
  try {
    directoryState = await lstat(paths.objectRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (directoryState.isSymbolicLink() || !directoryState.isDirectory()) {
    throw storageError("Object-Storage-Eintrag ist kein regulaeres Verzeichnis.", 415);
  }
  const canonicalRoot = await realpath(root);
  const expectedObjectRoot = path.join(canonicalRoot, path.relative(root, paths.objectRoot));
  if (await realpath(paths.objectRoot) !== expectedObjectRoot) {
    throw storageError("Object-Storage-Eintrag darf keine symbolischen Pfadbestandteile enthalten.", 415);
  }
  const entries = (await readdir(paths.objectRoot)).sort();
  if (entries.length !== 2 || entries[0] !== CONTENT_FILE || entries[1] !== METADATA_FILE) {
    throw storageError("Object-Storage-Eintrag enthaelt unerwartete Dateien.", 415);
  }

  const metadataPath = path.join(paths.objectRoot, METADATA_FILE);
  const contentPath = path.join(paths.objectRoot, CONTENT_FILE);
  const [metadataState, contentState] = await Promise.all([lstat(metadataPath), lstat(contentPath)]);
  if (
    metadataState.isSymbolicLink()
    || contentState.isSymbolicLink()
    || !metadataState.isFile()
    || !contentState.isFile()
    || metadataState.size < 2
    || metadataState.size > METADATA_MAX_BYTES
    || (process.platform !== "win32" && ((metadataState.mode | contentState.mode) & 0o077) !== 0)
  ) {
    throw storageError("Object-Storage-Dateien sind nicht freigegeben.", 415);
  }

  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (cause) {
    throw storageError("Object-Storage-Metadaten sind ungueltig.", 415, cause);
  }
  const contentType = cleanContentType(metadata?.contentType);
  const size = Number(metadata?.size);
  const createdAt = String(metadata?.createdAt || "");
  let canonicalCreatedAt = "";
  try { canonicalCreatedAt = new Date(createdAt).toISOString(); } catch {}
  if (
    !exactMetadataKeys(metadata)
    || metadata.schemaVersion !== 1
    || metadata.objectName !== normalizedName
    || !Number.isSafeInteger(size)
    || size < 1
    || size !== contentState.size
    || !/^[a-f0-9]{64}$/u.test(String(metadata.contentSha256 || ""))
    || canonicalCreatedAt !== createdAt
    || (options.maxBytes > 0 && size > options.maxBytes)
    || (options.allowedContentTypes?.length > 0 && !options.allowedContentTypes.includes(contentType))
  ) {
    throw storageError("Object-Storage-Metadaten sind nicht freigegeben.", 415);
  }
  const buffer = await readFile(contentPath);
  if (buffer.length !== size || !timingSafeTextEqual(sha256Hex(buffer), metadata.contentSha256)) {
    throw storageError("Object-Storage-Inhalt stimmt nicht mit seinen Metadaten ueberein.", 415);
  }
  return Object.freeze({ buffer, contentType });
}

async function saveFilesystemObject(root, area, objectName, buffer, contentType) {
  const normalizedArea = validateArea(area);
  const normalizedName = validateObjectName(objectName);
  const normalizedType = cleanContentType(contentType);
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
    throw storageError("Object-Storage-Inhalt muss ein nicht-leerer Buffer sein.", 415);
  }
  const paths = objectPaths(root, normalizedArea, normalizedName);
  await ensureHashedParents(root, normalizedArea, paths);

  const existing = await readFilesystemObject(root, normalizedArea, normalizedName).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    if (existing.contentType === normalizedType && existing.buffer.equals(buffer)) return true;
    throw storageError("Object-Storage-Eintrag existiert bereits mit anderem Inhalt.", 409);
  }

  const temporaryRoot = path.join(paths.prefixRoot, `.tmp-${paths.objectHash}-${crypto.randomUUID()}`);
  await mkdir(temporaryRoot, { mode: 0o700 });
  try {
    const metadata = Object.freeze({
      schemaVersion: 1,
      objectName: normalizedName,
      contentType: normalizedType,
      size: buffer.length,
      contentSha256: sha256Hex(buffer),
      createdAt: new Date().toISOString()
    });
    await writeExclusiveFile(path.join(temporaryRoot, CONTENT_FILE), buffer, 0o600);
    await writeExclusiveFile(path.join(temporaryRoot, METADATA_FILE), `${JSON.stringify(metadata)}\n`, 0o600);
    await fsyncDirectory(temporaryRoot);
    try {
      await rename(temporaryRoot, paths.objectRoot);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
      const winner = await readFilesystemObject(root, normalizedArea, normalizedName);
      if (!winner || winner.contentType !== normalizedType || !winner.buffer.equals(buffer)) {
        throw storageError("Paralleler Object-Storage-Schreibvorgang hatte abweichenden Inhalt.", 409);
      }
      await unlink(path.join(temporaryRoot, CONTENT_FILE));
      await unlink(path.join(temporaryRoot, METADATA_FILE));
      await rmdir(temporaryRoot);
    }
    await fsyncDirectory(paths.prefixRoot);
    return true;
  } catch (error) {
    for (const fileName of [CONTENT_FILE, METADATA_FILE]) {
      await unlink(path.join(temporaryRoot, fileName)).catch(() => {});
    }
    await rmdir(temporaryRoot).catch(() => {});
    throw error;
  }
}

async function deleteFilesystemObject(root, area, objectName) {
  const normalizedArea = validateArea(area);
  const normalizedName = validateObjectName(objectName);
  const paths = objectPaths(root, normalizedArea, normalizedName);
  const existing = await readFilesystemObject(root, normalizedArea, normalizedName);
  if (!existing) return;

  const deletedPrefixRoot = path.join(root, "deleted", "v1", normalizedArea, paths.objectHash.slice(0, 2));
  for (const directory of [
    path.join(root, "deleted"),
    path.join(root, "deleted", "v1"),
    path.join(root, "deleted", "v1", normalizedArea),
    deletedPrefixRoot
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const state = await lstat(directory);
    if (state.isSymbolicLink() || !state.isDirectory() || (process.platform !== "win32" && (state.mode & 0o077) !== 0)) {
      throw storageError("Object-Storage-Quarantaeneverzeichnis ist nicht freigegeben.");
    }
  }
  const tombstone = path.join(
    deletedPrefixRoot,
    `${paths.objectHash}-${Date.now()}-${crypto.randomUUID()}`
  );
  await rename(paths.objectRoot, tombstone);
  await fsyncDirectory(paths.prefixRoot);
  await fsyncDirectory(deletedPrefixRoot);
}

async function readBoundedResponseBuffer(response, maximumBytes = 0) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (maximumBytes > 0 && declaredLength > maximumBytes) {
    throw storageError("Object-Storage-Objekt ueberschreitet die erlaubte Groesse.", 415);
  }
  if (!maximumBytes || !response.body?.getReader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw storageError("Object-Storage-Objekt ueberschreitet die erlaubte Groesse.", 415);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function createObjectStorage({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const driver = String(env.OBJECT_STORAGE_DRIVER || "gcs").trim().toLowerCase();
  if (!ALLOWED_DRIVERS.has(driver)) {
    throw new Error("OBJECT_STORAGE_DRIVER muss gcs oder filesystem sein.");
  }
  const root = driver === "filesystem" ? safeFilesystemRoot(env.OBJECT_STORAGE_ROOT) : "";
  const timeoutMs = Math.max(1000, Number(env.OUTBOUND_FETCH_TIMEOUT_MS || 5000));

  async function googleAccessToken() {
    if (env.GOOGLE_OAUTH_ACCESS_TOKEN) return env.GOOGLE_OAUTH_ACCESS_TOKEN;
    const response = await fetchImpl("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "metadata-flavor": "Google" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw storageError("Google-Access-Token fuer Cloud Storage konnte nicht gelesen werden.");
    const payload = await response.json();
    return payload.access_token || "";
  }

  async function storageFetch(url, options = {}) {
    const token = await googleAccessToken();
    const response = await fetchImpl(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      const error = storageError(`Cloud-Storage-Anfrage fehlgeschlagen (${response.status}).`, response.status);
      error.details = details;
      throw error;
    }
    return response;
  }

  function enabled(area, bucket = "") {
    validateArea(area);
    return driver === "filesystem" ? Boolean(root) : Boolean(bucket);
  }

  function reference(area, bucket, objectName) {
    const normalizedArea = validateArea(area);
    const normalizedName = validateObjectName(objectName);
    if (driver === "gcs") {
      if (!bucket) throw storageError("Cloud-Storage-Bucket ist nicht konfiguriert.");
      return `gs://${bucket}/${normalizedName}`;
    }
    const prefix = `${normalizedArea}/`;
    const relativeName = normalizedName.startsWith(prefix)
      ? normalizedName.slice(prefix.length)
      : normalizedName;
    return `private://${normalizedArea}/${relativeName}`;
  }

  async function save(area, bucket, objectName, buffer, contentType) {
    if (!enabled(area, bucket)) throw storageError("Object Storage ist nicht konfiguriert.");
    if (driver === "filesystem") return saveFilesystemObject(root, area, objectName, buffer, contentType);
    const normalizedName = validateObjectName(objectName);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(normalizedName)}`;
    const response = await storageFetch(url, {
      method: "POST",
      headers: { "content-type": cleanContentType(contentType) },
      body: buffer
    });
    return response.ok;
  }

  async function remove(area, bucket, objectName) {
    if (!objectName || !enabled(area, bucket)) return;
    if (driver === "filesystem") return deleteFilesystemObject(root, area, objectName);
    const normalizedName = validateObjectName(objectName);
    await storageFetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(normalizedName)}`, {
      method: "DELETE"
    });
  }

  async function read(area, bucket, objectName, options = {}) {
    if (!enabled(area, bucket)) return null;
    if (driver === "filesystem") return readFilesystemObject(root, area, objectName, options);
    const normalizedName = validateObjectName(objectName);
    const metadataUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(normalizedName)}`);
    metadataUrl.searchParams.set("fields", "name,size,contentType,generation");
    const metadata = await storageFetch(metadataUrl.toString());
    if (metadata.status === 404) return null;
    const meta = await metadata.json();
    const size = Number(meta.size);
    const contentType = cleanContentType(meta.contentType || "application/octet-stream");
    const generation = String(meta.generation || "");
    if (
      meta.name !== normalizedName
      || !Number.isSafeInteger(size)
      || size < 1
      || (options.maxBytes > 0 && size > options.maxBytes)
      || !/^[0-9]+$/u.test(generation)
      || (options.allowedContentTypes?.length > 0 && !options.allowedContentTypes.includes(contentType))
    ) {
      throw storageError("Cloud-Storage-Objektmetadaten sind nicht freigegeben.", 415);
    }
    const mediaUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(normalizedName)}`);
    mediaUrl.searchParams.set("alt", "media");
    mediaUrl.searchParams.set("generation", generation);
    const media = await storageFetch(mediaUrl.toString());
    if (media.status === 404) return null;
    const buffer = await readBoundedResponseBuffer(media, options.maxBytes || 0);
    if (buffer.length !== size) throw storageError("Cloud-Storage-Objekt stimmt nicht mit seinen Metadaten ueberein.", 415);
    return Object.freeze({ buffer, contentType });
  }

  async function health() {
    if (driver === "gcs") {
      return Object.freeze({ ok: true, driver, writable: null, freeBytes: null });
    }
    try {
      await assertPrivateDirectory(root, {
        expectedUid: typeof process.getuid === "function" ? process.getuid() : null
      });
      const space = await statfs(root);
      const freeBytes = Number(space.bavail) * Number(space.bsize);
      return Object.freeze({ ok: Number.isFinite(freeBytes) && freeBytes >= MIN_FREE_BYTES, driver, writable: true, freeBytes });
    } catch {
      return Object.freeze({ ok: false, driver, writable: false, freeBytes: null });
    }
  }

  return Object.freeze({ driver, enabled, reference, save, remove, read, health });
}
