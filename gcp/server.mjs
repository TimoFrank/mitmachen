import http from "node:http";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);
const AUTO_SCHEMA = process.env.GCP_DEMO_AUTO_SCHEMA !== "0";
const AUTO_SEED = process.env.GCP_DEMO_AUTO_SEED !== "0";
const DEFAULT_DB_NAME = "versorgungs_kompass";
const DEFAULT_DB_USER = "vk_app";
const CONTACT_IMAGE_BUCKET = process.env.CONTACT_IMAGE_BUCKET || "";
const MAX_CONTACT_IMAGE_BYTES = Number(process.env.CONTACT_IMAGE_MAX_BYTES || 2 * 1024 * 1024);
const CONTACT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const IMPORT_MAX_ROWS = Number(process.env.GCP_DEMO_IMPORT_MAX_ROWS || 100);
const IMPORT_PRIORITIES = new Set(["Hoch", "Mittel", "Niedrig", "Keine / Unbekannt"]);

const IMPORT_FIELD_ALIASES = new Map([
  ["id", "id"],
  ["kontaktid", "id"],
  ["contactid", "id"],
  ["name", "name"],
  ["kontakt", "name"],
  ["person", "name"],
  ["personname", "name"],
  ["fullname", "name"],
  ["organisation", "organization"],
  ["organization", "organization"],
  ["einrichtung", "organization"],
  ["institution", "organization"],
  ["praxis", "organization"],
  ["sektor", "category"],
  ["sector", "category"],
  ["category", "category"],
  ["kategorie", "category"],
  ["fachrichtung", "specialty"],
  ["specialty", "specialty"],
  ["fachbereich", "specialty"],
  ["fokus", "specialty"],
  ["rolle", "contactRole"],
  ["role", "contactRole"],
  ["funktion", "contactRole"],
  ["contactrole", "contactRole"],
  ["prioritaet", "priority"],
  ["priorität", "priority"],
  ["priority", "priority"],
  ["owner", "owner"],
  ["verantwortlich", "owner"],
  ["zustaendig", "owner"],
  ["zuständig", "owner"],
  ["email", "email"],
  ["e-mail", "email"],
  ["emailadresse", "email"],
  ["telefon", "phone"],
  ["phone", "phone"],
  ["tel", "phone"],
  ["linkedin", "linkedin"],
  ["ort", "city"],
  ["city", "city"],
  ["bundesland", "state"],
  ["state", "state"],
  ["plz", "postalCode"],
  ["postalcode", "postalCode"],
  ["postleitzahl", "postalCode"],
  ["lat", "lat"],
  ["latitude", "lat"],
  ["breitengrad", "lat"],
  ["lon", "lon"],
  ["lng", "lon"],
  ["longitude", "lon"],
  ["laengengrad", "lon"],
  ["längengrad", "lon"],
  ["notiz", "note"],
  ["note", "note"],
  ["notes", "note"],
  ["naechsterschritt", "nextStep"],
  ["nächsterschritt", "nextStep"],
  ["nextstep", "nextStep"],
  ["next_step", "nextStep"],
  ["thema", "themes"],
  ["themen", "themes"],
  ["topic", "themes"],
  ["topics", "themes"],
  ["themes", "themes"],
  ["image", "image"],
  ["bild", "image"],
  ["quelle", "sources"],
  ["source", "sources"],
  ["sources", "sources"],
  ["quellen", "sources"],
  ["status", "status"]
]);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"]
]);

const SCHEMA_LOCK_ID = 2026060605;

const CONTACT_FIELD_MAP = [
  ["name", "name"],
  ["organizationId", "organization_id"],
  ["organization", "organization"],
  ["category", "sector"],
  ["contactRole", "role"],
  ["specialty", "specialty"],
  ["postalCode", "postal_code"],
  ["city", "city"],
  ["state", "federal_state"],
  ["lat", "latitude"],
  ["lon", "longitude"],
  ["email", "email"],
  ["phone", "phone"],
  ["priority", "priority"],
  ["ownerId", "owner_id"],
  ["note", "notes"],
  ["nextStep", "next_step"],
  ["status", "status"]
];

const ORGANIZATION_FIELD_MAP = [
  ["name", "name"],
  ["sector", "sector"],
  ["organizationType", "organization_type"],
  ["postalCode", "postal_code"],
  ["city", "city"],
  ["state", "federal_state"],
  ["lat", "latitude"],
  ["lon", "longitude"],
  ["website", "website"],
  ["phone", "phone"],
  ["email", "email"],
  ["notes", "notes"],
  ["status", "status"]
];

let pool;
let readyPromise;
let tokenCache = { accessToken: "", expiresAt: 0 };

function dbConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      ssl: process.env.DB_SSL === "1" ? { rejectUnauthorized: false } : undefined
    };
  }
  return {
    host: process.env.DB_HOST || process.env.PGHOST || "",
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
    database: process.env.DB_NAME || process.env.PGDATABASE || DEFAULT_DB_NAME,
    user: process.env.DB_USER || process.env.PGUSER || DEFAULT_DB_USER,
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || "",
    max: Number(process.env.DB_POOL_MAX || 5)
  };
}

function getPool() {
  if (!pool) {
    const config = dbConfig();
    if (!config.connectionString && !config.host) {
      throw new Error("Keine Datenbankverbindung konfiguriert. DB_HOST oder DATABASE_URL setzen.");
    }
    pool = new Pool(config);
  }
  return pool;
}

function storageEnabled() {
  return Boolean(CONTACT_IMAGE_BUCKET);
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await withSchemaLock(async () => {
        if (AUTO_SCHEMA) await applySchema();
        if (AUTO_SEED) await seedIfEmpty();
      });
    })();
  }
  try {
    await readyPromise;
  } catch (error) {
    readyPromise = undefined;
    throw error;
  }
}

async function withSchemaLock(callback) {
  const client = await getPool().connect();
  try {
    await client.query("select pg_advisory_lock($1)", [SCHEMA_LOCK_ID]);
    await callback();
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [SCHEMA_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

async function applySchema() {
  const schemaPath = path.join(ROOT, "gcp", "cloudsql", "step4_private_schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await getPool().query(schema);
}

function loadDemoData() {
  const codePath = path.join(ROOT, "data", "demo-data.js");
  return readFile(codePath, "utf8").then((source) => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: codePath });
    return sandbox.window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  });
}

async function seedIfEmpty() {
  const { rows } = await getPool().query("select count(*)::int as count from contacts");
  if (rows[0]?.count > 0) return;
  await resetDemoData();
}

async function resetDemoData() {
  const demo = await loadDemoData();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("truncate import_runs, changes, contacts, organizations, profiles restart identity cascade");

    const profiles = Array.isArray(demo.profiles) ? demo.profiles : [];
    for (const profile of profiles) {
      await client.query(
        `insert into profiles
          (id, email, display_name, initials, role, avatar_url, team, bio, active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          profile.id,
          profile.email,
          profile.display_name,
          profile.initials || "",
          profile.role || "editor",
          profile.avatar_url || "",
          profile.team || "",
          profile.bio || "",
          profile.active !== false,
          profile.created_at || new Date().toISOString(),
          profile.updated_at || new Date().toISOString()
        ]
      );
    }

    const actorId = profiles.find((profile) => profile.active !== false)?.id || null;
    const organizations = Array.isArray(demo.organizations) ? demo.organizations : [];
    for (const organization of organizations) {
      await client.query(
        `insert into organizations
          (id, name, normalized_name, sector, organization_type, postal_code, city, federal_state,
           latitude, longitude, website, phone, email, notes, source, status, created_at, created_by, updated_at, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          organization.id,
          organization.name,
          organization.normalizedName || organization.normalized_name || String(organization.name || "").toLowerCase(),
          organization.sector || "",
          organization.organizationType || organization.organization_type || "",
          organization.postalCode || organization.postal_code || "",
          organization.city || "",
          organization.state || organization.federal_state || "",
          numberOrNull(organization.lat ?? organization.latitude),
          numberOrNull(organization.lon ?? organization.longitude),
          organization.website || "",
          organization.phone || "",
          organization.email || "",
          organization.notes || organization.note || "",
          organization.source || "Demo-Datensatz",
          organization.status || "active",
          organization.createdAt || organization.created_at || new Date().toISOString(),
          actorId,
          organization.updatedAt || organization.updated_at || new Date().toISOString(),
          actorId
        ]
      );
    }

    const profileIds = new Set(profiles.map((profile) => profile.id));
    const contacts = Array.isArray(demo.contacts) ? demo.contacts : [];
    for (const contact of contacts) {
      const ownerId = profileIds.has(contact.ownerId) ? contact.ownerId : null;
      await client.query(
        `insert into contacts
          (id, name, organization_id, organization, sector, specialty, role, priority, owner_id,
           postal_code, city, federal_state, latitude, longitude, email, phone, linkedin, topics,
           notes, next_step, source, image_url, image_source_url, image_source_label, image_rights_note,
           image_updated_at, image_updated_by, status, created_at, created_by, updated_at, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)`,
        [
          contact.id,
          contact.name,
          contact.organizationId || contact.organization_id || null,
          contact.organization || "",
          contact.category || contact.sector || "",
          contact.specialty || "",
          contact.contactRole || contact.role || "",
          contact.priority || "Mittel",
          ownerId,
          contact.postalCode || contact.postal_code || "",
          contact.city || "",
          contact.state || contact.federal_state || "",
          numberOrNull(contact.lat ?? contact.latitude),
          numberOrNull(contact.lon ?? contact.longitude),
          contact.email || "",
          contact.phone || "",
          contact.linkedin || "",
          Array.isArray(contact.themes) ? contact.themes : Array.isArray(contact.topics) ? contact.topics : [],
          contact.note || contact.notes || "",
          contact.nextStep || contact.next_step || "",
          Array.isArray(contact.sources) ? contact.sources.join("; ") : contact.source || "",
          normalizeImagePath(contact.image || contact.image_url || ""),
          contact.imageSourceUrl || contact.image_source_url || "",
          contact.imageSourceLabel || contact.image_source_label || "",
          contact.imageRightsNote || contact.image_rights_note || "",
          contact.imageUpdatedAt || contact.image_updated_at || null,
          profileIds.has(contact.imageUpdatedBy || contact.image_updated_by) ? contact.imageUpdatedBy || contact.image_updated_by : null,
          contact.status || "active",
          contact.createdAt || contact.created_at || new Date().toISOString(),
          actorId,
          contact.updatedAt || contact.updated_at || new Date().toISOString(),
          ownerId || actorId
        ]
      );
    }

    const changes = Array.isArray(demo.changes) ? demo.changes : [];
    for (const change of changes) {
      const changedBy = profileIds.has(change.changedBy || change.changed_by) ? change.changedBy || change.changed_by : actorId;
      await client.query(
        `insert into changes
          (contact_id, action, field_name, old_value, new_value, changed_at, changed_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          change.contactId || change.contact_id,
          change.action === "create" ? "create" : "update",
          change.fieldName || change.field_name || "",
          stringifyValue(change.oldValue ?? change.old_value ?? ""),
          stringifyValue(change.newValue ?? change.new_value ?? ""),
          change.changedAt || change.changed_at || new Date().toISOString(),
          changedBy
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function numberOrNull(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeImagePath(value) {
  if (!value) return "";
  return String(value).replace(/^\.\.\//, "/");
}

function stringifyValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function inputValueForField(dbField, value) {
  if (["owner_id", "organization_id"].includes(dbField)) return value || null;
  if (["latitude", "longitude"].includes(dbField)) return numberOrNull(value);
  return String(value ?? "").trim();
}

function isGcsUri(value) {
  return String(value || "").startsWith("gs://");
}

function parseGcsUri(value) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(String(value || ""));
  if (!match) return null;
  return { bucket: match[1], object: match[2] };
}

function objectSegment(value) {
  return String(value || "contact")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "contact";
}

function imageExtension(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/svg+xml") return "svg";
  return "jpg";
}

function parseImagePayload(input) {
  const dataUrl = String(input.dataUrl || input.data_url || "");
  const dataUrlMatch = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  const contentType = String(input.contentType || input.content_type || dataUrlMatch?.[1] || "").trim().toLowerCase();
  const base64 = String(input.base64 || dataUrlMatch?.[2] || "");
  if (!CONTACT_IMAGE_TYPES.has(contentType)) {
    throw new Error("Erlaubt sind JPEG, PNG, WebP oder SVG.");
  }
  if (!base64) throw new Error("Bilddaten fehlen.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("Bilddaten sind leer.");
  if (buffer.length > MAX_CONTACT_IMAGE_BYTES) {
    throw new Error(`Bild ist zu gross. Maximum: ${Math.round(MAX_CONTACT_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }
  return { buffer, contentType };
}

function contactImageUrl(row) {
  const imageUrl = row.image_url || "";
  return isGcsUri(imageUrl) ? `/api/contacts/${encodeURIComponent(row.id)}/image` : imageUrl;
}

async function googleAccessToken() {
  const envToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || "";
  if (envToken) return envToken;
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" }
  });
  if (!response.ok) {
    throw new Error(`Google-Metadata-Token konnte nicht geladen werden (${response.status}).`);
  }
  const payload = await response.json();
  tokenCache = {
    accessToken: payload.access_token || "",
    expiresAt: now + Math.max(60, Number(payload.expires_in || 300) - 60) * 1000
  };
  if (!tokenCache.accessToken) throw new Error("Google-Metadata-Token fehlt.");
  return tokenCache.accessToken;
}

async function storageFetch(url, options = {}) {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Cloud Storage API ${response.status}: ${text.slice(0, 240)}`);
  }
  return response;
}

function storageObjectApiUrl(bucket, object, params = "") {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}${params}`;
}

async function saveStorageObject(objectName, buffer, contentType) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(CONTACT_IMAGE_BUCKET)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  await storageFetch(url, {
    method: "POST",
    headers: {
      "content-type": contentType
    },
    body: buffer
  });
}

async function deleteStorageObject(bucket, object) {
  try {
    await storageFetch(storageObjectApiUrl(bucket, object), { method: "DELETE" });
  } catch (error) {
    if (!String(error.message || "").includes("Cloud Storage API 404")) throw error;
  }
}

async function readStorageObject(bucket, object) {
  const metadataResponse = await storageFetch(storageObjectApiUrl(bucket, object));
  const metadata = await metadataResponse.json();
  const mediaResponse = await storageFetch(storageObjectApiUrl(bucket, object, "?alt=media"));
  const buffer = Buffer.from(await mediaResponse.arrayBuffer());
  return { buffer, contentType: metadata.contentType || "application/octet-stream" };
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "");
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text, delimiter = detectCsvDelimiter(text)) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function csvObjects(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((header) => String(header || "").trim());
  return {
    delimiter,
    headers,
    rows: rows.slice(1).map((cells, index) => {
      const source = {};
      headers.forEach((header, cellIndex) => {
        const mapped = IMPORT_FIELD_ALIASES.get(normalizeImportHeader(header)) || header;
        source[mapped] = String(cells[cellIndex] || "").trim();
      });
      return { rowNumber: index + 2, source };
    })
  };
}

function splitImportList(value) {
  return [...new Set(String(value || "")
    .split(/\s*;\s*|\s*\|\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function importNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return { value: null, valid: true };
  const parsed = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(parsed) ? { value: parsed, valid: true } : { value: null, valid: false };
}

function normalizeImportPriority(value, warnings, rowNumber) {
  const priority = String(value || "").trim();
  if (!priority) return "Mittel";
  if (IMPORT_PRIORITIES.has(priority)) return priority;
  warnings.push(`Zeile ${rowNumber}: Prioritaet '${priority}' wurde auf Mittel gesetzt.`);
  return "Mittel";
}

function normalizeImportStatus(value, warnings, rowNumber) {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "active";
  if (["active", "aktiv"].includes(status)) return "active";
  if (["archived", "archiviert"].includes(status)) return "archived";
  warnings.push(`Zeile ${rowNumber}: Status '${value}' wurde auf active gesetzt.`);
  return "active";
}

function resolveOwnerId(owner, profiles, warnings, rowNumber) {
  const query = String(owner || "").trim().toLowerCase();
  if (!query) return null;
  const profile = profiles.find((item) =>
    item.active !== false &&
    [item.id, item.display_name, item.email, item.initials].some((candidate) => String(candidate || "").trim().toLowerCase() === query)
  );
  if (profile) return profile.id;
  warnings.push(`Zeile ${rowNumber}: Owner '${owner}' ist unbekannt.`);
  return null;
}

function normalizeImportContact(source, context, rowNumber) {
  const warnings = [];
  const errors = [];
  const lat = importNumber(source.lat);
  const lon = importNumber(source.lon);
  if (!lat.valid) warnings.push(`Zeile ${rowNumber}: Breitengrad ist ungueltig und wird ignoriert.`);
  if (!lon.valid) warnings.push(`Zeile ${rowNumber}: Laengengrad ist ungueltig und wird ignoriert.`);
  const name = String(source.name || "").trim();
  if (!name) errors.push(`Zeile ${rowNumber}: Name fehlt.`);
  const organization = String(source.organization || "").trim();
  if (!organization) warnings.push(`Zeile ${rowNumber}: Organisation fehlt.`);
  const ownerId = resolveOwnerId(source.owner, context.profiles, warnings, rowNumber);
  const id = String(source.id || "").trim() || generateId("gcp-import-contact");
  return {
    id,
    name,
    organization,
    organizationId: "",
    category: String(source.category || "").trim(),
    specialty: String(source.specialty || "").trim(),
    contactRole: String(source.contactRole || "").trim(),
    priority: normalizeImportPriority(source.priority, warnings, rowNumber),
    ownerId,
    postalCode: String(source.postalCode || "").trim(),
    city: String(source.city || "").trim(),
    state: String(source.state || "").trim(),
    lat: lat.value,
    lon: lon.value,
    email: String(source.email || "").trim(),
    phone: String(source.phone || "").trim(),
    linkedin: String(source.linkedin || "").trim(),
    themes: splitImportList(source.themes),
    note: String(source.note || "").trim(),
    nextStep: String(source.nextStep || "").trim(),
    image: normalizeImagePath(source.image || ""),
    source: splitImportList(source.sources).join("; ") || "GCP-Import",
    status: normalizeImportStatus(source.status, warnings, rowNumber),
    errors,
    warnings
  };
}

function contactDuplicateKey(contact) {
  return [
    normalizeName(contact.name),
    normalizeName(contact.organization),
    normalizeName(contact.email)
  ].join("|");
}

function existingContactMatch(contact, existingContacts) {
  const email = normalizeName(contact.email);
  const name = normalizeName(contact.name);
  const organization = normalizeName(contact.organization);
  return existingContacts.find((item) => {
    if (contact.id && item.id === contact.id) return true;
    if (email && normalizeName(item.email) === email) return true;
    return name && normalizeName(item.name) === name && organization && normalizeName(item.organization) === organization;
  });
}

async function importPreview(input) {
  const csvText = String(input.csvText || input.csv || input.text || "");
  const fileName = String(input.fileName || input.file_name || "kontakt-import.csv").trim();
  const parsed = csvObjects(csvText);
  const topErrors = [];
  const topWarnings = [];
  if (!parsed.headers.length) topErrors.push("CSV enthaelt keine Kopfzeile.");
  if (!parsed.headers.some((header) => IMPORT_FIELD_ALIASES.get(normalizeImportHeader(header)) === "name" || normalizeImportHeader(header) === "name")) {
    topErrors.push("CSV benoetigt eine Spalte 'name'.");
  }
  if (parsed.rows.length > IMPORT_MAX_ROWS) {
    topErrors.push(`Maximal ${IMPORT_MAX_ROWS} Zeilen pro Demo-Import erlaubt.`);
  }
  const [profiles, organizations, contacts] = await Promise.all([
    listAllProfiles(),
    listOrganizations({ includeArchived: true }),
    listContacts({ includeArchived: true })
  ]);
  const context = { profiles, organizations, contacts };
  const seen = new Set();
  const seenExplicitIds = new Set();
  const organizationNames = new Set(organizations.map((organization) => normalizeName(organization.name)));
  const previewRows = parsed.rows.map(({ rowNumber, source }) => {
    const explicitId = String(source.id || "").trim();
    const contact = normalizeImportContact(source, context, rowNumber);
    const errors = [...contact.errors];
    const warnings = [...contact.warnings];
    const key = contactDuplicateKey(contact);
    if (seen.has(key)) errors.push(`Zeile ${rowNumber}: Kontakt ist im Import doppelt.`);
    seen.add(key);
    if (explicitId) {
      if (seenExplicitIds.has(explicitId)) errors.push(`Zeile ${rowNumber}: Kontakt-ID ist im Import doppelt.`);
      seenExplicitIds.add(explicitId);
    }
    const existing = existingContactMatch(contact, contacts);
    const organizationWillBeCreated = Boolean(contact.organization && !organizationNames.has(normalizeName(contact.organization)));
    if (existing) warnings.push(`Zeile ${rowNumber}: existiert bereits (${existing.name}).`);
    if (organizationWillBeCreated) warnings.push(`Zeile ${rowNumber}: Organisation '${contact.organization}' wird neu angelegt.`);
    const action = errors.length ? "error" : existing ? "skip_existing" : "create";
    return {
      rowNumber,
      action,
      importable: action === "create",
      organizationWillBeCreated,
      contact: {
        ...contact,
        errors: undefined,
        warnings: undefined
      },
      errors,
      warnings
    };
  });
  const errorRows = previewRows.filter((row) => row.errors.length).length;
  const skippedRows = previewRows.filter((row) => row.action === "skip_existing").length;
  const importableRows = previewRows.filter((row) => row.importable).length;
  const warningRows = previewRows.filter((row) => row.warnings.length).length + topWarnings.length;
  return {
    fileName,
    delimiter: parsed.delimiter,
    headers: parsed.headers,
    rows: previewRows,
    summary: {
      totalRows: parsed.rows.length,
      importableRows,
      skippedRows,
      errorRows,
      warningRows,
      newOrganizations: previewRows.filter((row) => row.organizationWillBeCreated && row.importable).length,
      maxRows: IMPORT_MAX_ROWS
    },
    errors: topErrors,
    warnings: topWarnings,
    canCommit: !topErrors.length && errorRows === 0 && importableRows > 0
  };
}

async function getOrCreateImportOrganization(client, contact, actorId) {
  if (!contact.organization) return null;
  const normalized = normalizeName(contact.organization);
  const existing = await client.query("select * from organizations where normalized_name = $1 limit 1", [normalized]);
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await client.query(
    `insert into organizations
      (id, name, normalized_name, sector, organization_type, postal_code, city, federal_state,
       latitude, longitude, source, status, created_by, updated_by)
     values ($1, $2, $3, $4, 'Import', $5, $6, $7, $8, $9, 'GCP-Import', 'active', $10, $10)
     returning *`,
    [
      generateId("gcp-org-import"),
      contact.organization,
      normalized,
      contact.category || "",
      contact.postalCode || "",
      contact.city || "",
      contact.state || "",
      contact.lat,
      contact.lon,
      actorId
    ]
  );
  return inserted.rows[0];
}

async function commitImport(input) {
  if (input.exportConfirmed !== true) {
    throw new Error("Bitte vor dem Import den JSON-Export bestaetigen.");
  }
  const preview = await importPreview(input);
  if (!preview.canCommit) {
    throw new Error("Import kann wegen Fehlern oder fehlenden importierbaren Zeilen nicht gestartet werden.");
  }
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const actorId = await firstProfileId(client);
    const runId = generateId("gcp-import-run");
    const imported = [];
    for (const row of preview.rows.filter((item) => item.importable)) {
      const contact = row.contact;
      const organization = await getOrCreateImportOrganization(client, contact, actorId);
      const inserted = await client.query(
        `insert into contacts
          (id, name, organization_id, organization, sector, specialty, role, priority, owner_id,
           postal_code, city, federal_state, latitude, longitude, email, phone, linkedin, topics,
           notes, next_step, source, image_url, status, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21, $22, $23, $24, $24)
         returning *`,
        [
          contact.id,
          contact.name,
          organization?.id || null,
          organization?.name || contact.organization || "",
          organization?.sector || contact.category || "",
          contact.specialty || "",
          contact.contactRole || "",
          contact.priority || "Mittel",
          contact.ownerId || actorId,
          organization?.postal_code || contact.postalCode || "",
          organization?.city || contact.city || "",
          organization?.federal_state || contact.state || "",
          organization?.latitude ?? contact.lat,
          organization?.longitude ?? contact.lon,
          contact.email || "",
          contact.phone || "",
          contact.linkedin || "",
          Array.isArray(contact.themes) ? contact.themes : [],
          contact.note || "",
          contact.nextStep || "",
          contact.source || "GCP-Import",
          normalizeImagePath(contact.image || ""),
          contact.status || "active",
          actorId
        ]
      );
      await client.query(
        `insert into changes (contact_id, action, field_name, old_value, new_value, changed_by)
         values ($1, 'import', '', '', $2, $3)`,
        [contact.id, contact.name, actorId]
      );
      imported.push(mapContact(inserted.rows[0]));
    }
    const report = {
      fileName: preview.fileName,
      summary: preview.summary,
      rows: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        action: row.action,
        name: row.contact.name,
        organization: row.contact.organization,
        errors: row.errors,
        warnings: row.warnings
      }))
    };
    const run = await client.query(
      `insert into import_runs
        (id, file_name, status, total_rows, valid_rows, imported_contacts, skipped_rows, error_count, warning_count, report, created_by)
       values ($1, $2, 'completed', $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        runId,
        preview.fileName,
        preview.summary.totalRows,
        preview.summary.importableRows,
        imported.length,
        preview.summary.skippedRows,
        preview.summary.errorRows,
        preview.summary.warningRows,
        JSON.stringify(report),
        actorId
      ]
    );
    await client.query("commit");
    return {
      importRun: mapImportRun(run.rows[0]),
      importedContacts: imported,
      preview
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function mapProfile(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    initials: row.initials,
    role: row.role,
    avatar_url: row.avatar_url,
    team: row.team,
    bio: row.bio,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    sector: row.sector,
    organizationType: row.organization_type,
    postalCode: row.postal_code,
    city: row.city,
    state: row.federal_state,
    lat: row.latitude,
    lon: row.longitude,
    website: row.website,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContact(row) {
  return {
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
    organization: row.organization,
    category: row.sector,
    specialty: row.specialty,
    contactRole: row.role,
    priority: row.priority,
    ownerId: row.owner_id,
    postalCode: row.postal_code,
    city: row.city,
    state: row.federal_state,
    lat: row.latitude,
    lon: row.longitude,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    themes: Array.isArray(row.topics) ? row.topics : [],
    note: row.notes,
    nextStep: row.next_step,
    sources: row.source ? String(row.source).split(";").map((item) => item.trim()).filter(Boolean) : [],
    image: contactImageUrl(row),
    imageStoragePath: isGcsUri(row.image_url) ? row.image_url : "",
    imageSourceUrl: row.image_source_url,
    imageSourceLabel: row.image_source_label,
    imageRightsNote: row.image_rights_note,
    imageUpdatedAt: row.image_updated_at,
    imageUpdatedBy: row.image_updated_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapChange(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    action: row.action,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedAt: row.changed_at,
    changedBy: row.changed_by_label || row.changed_by || "GCP Demo"
  };
}

function mapImportRun(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    importedContacts: row.imported_contacts,
    skippedRows: row.skipped_rows,
    errorCount: row.error_count,
    warningCount: row.warning_count,
    report: row.report || {},
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

async function listProfiles() {
  const { rows } = await getPool().query("select * from profiles where active = true order by display_name");
  return rows.map(mapProfile);
}

async function listAllProfiles() {
  const { rows } = await getPool().query("select * from profiles order by display_name");
  return rows.map(mapProfile);
}

async function listOrganizations({ includeArchived = false } = {}) {
  const where = includeArchived ? "" : "where status <> 'archived'";
  const { rows } = await getPool().query(`select * from organizations ${where} order by name`);
  return rows.map(mapOrganization);
}

async function getOrganization(id, client = getPool()) {
  const { rows } = await client.query("select * from organizations where id = $1", [id]);
  return rows[0] || null;
}

async function listContacts({ includeArchived = false } = {}) {
  const where = includeArchived ? "" : "where status <> 'archived'";
  const { rows } = await getPool().query(`select * from contacts ${where} order by name`);
  return rows.map(mapContact);
}

async function getContact(id) {
  const { rows } = await getPool().query("select * from contacts where id = $1", [id]);
  return rows[0] ? mapContact(rows[0]) : null;
}

async function getContactRow(id, client = getPool()) {
  const { rows } = await client.query("select * from contacts where id = $1", [id]);
  return rows[0] || null;
}

async function getContactHistory(id) {
  const { rows } = await getPool().query(
    `select changes.*, profiles.display_name as changed_by_label
     from changes
     left join profiles on profiles.id = changes.changed_by
     where changes.contact_id = $1
     order by changes.changed_at desc, changes.id desc`,
    [id]
  );
  return rows.map(mapChange);
}

async function listChanges() {
  const { rows } = await getPool().query(
    `select changes.*, profiles.display_name as changed_by_label
     from changes
     left join profiles on profiles.id = changes.changed_by
     order by changes.changed_at desc, changes.id desc
     limit 200`
  );
  return rows.map(mapChange);
}

async function listAllChanges() {
  const { rows } = await getPool().query(
    `select changes.*, profiles.display_name as changed_by_label
     from changes
     left join profiles on profiles.id = changes.changed_by
     order by changes.changed_at desc, changes.id desc`
  );
  return rows.map(mapChange);
}

async function listImportRuns() {
  const { rows } = await getPool().query("select * from import_runs order by created_at desc limit 25");
  return rows.map(mapImportRun);
}

function runtimeMetadata() {
  return {
    service: process.env.K_SERVICE || "local-gcp-demo",
    revision: process.env.K_REVISION || "local",
    configuration: process.env.K_CONFIGURATION || "local",
    database: process.env.DB_NAME || process.env.PGDATABASE || DEFAULT_DB_NAME,
    contactImageBucket: CONTACT_IMAGE_BUCKET || null
  };
}

async function getOpsSummary() {
  const { rows } = await getPool().query(
    `select
       (select count(*)::int from profiles) as profiles,
       (select count(*)::int from organizations where status <> 'archived') as active_organizations,
       (select count(*)::int from organizations where status = 'archived') as archived_organizations,
       (select count(*)::int from contacts where status <> 'archived') as active_contacts,
       (select count(*)::int from contacts where status = 'archived') as archived_contacts,
       (select count(*)::int from import_runs) as import_runs,
       (select count(*)::int from changes) as changes,
       (select max(changed_at) from changes) as last_change_at,
       (select max(updated_at) from contacts) as last_contact_update_at`
  );
  const row = rows[0] || {};
  return {
    ok: true,
    backend: "cloud-sql",
    generatedAt: new Date().toISOString(),
    runtime: runtimeMetadata(),
    counts: {
      profiles: row.profiles || 0,
      activeOrganizations: row.active_organizations || 0,
      archivedOrganizations: row.archived_organizations || 0,
      activeContacts: row.active_contacts || 0,
      archivedContacts: row.archived_contacts || 0,
      importRuns: row.import_runs || 0,
      changes: row.changes || 0
    },
    lastChangeAt: row.last_change_at || null,
    lastContactUpdateAt: row.last_contact_update_at || null
  };
}

async function exportDemoData() {
  const [summary, profiles, organizations, contacts, changes, importRuns] = await Promise.all([
    getOpsSummary(),
    listAllProfiles(),
    listOrganizations({ includeArchived: true }),
    listContacts({ includeArchived: true }),
    listAllChanges(),
    listImportRuns()
  ]);
  return {
    exportedAt: new Date().toISOString(),
    exportType: "versorgungs-kompass-gcp-demo",
    summary,
    profiles,
    organizations,
    contacts,
    changes,
    importRuns
  };
}

async function deleteStorageObjectIfNeeded(imageUrl) {
  const parsed = parseGcsUri(imageUrl);
  if (!parsed || parsed.bucket !== CONTACT_IMAGE_BUCKET) return;
  try {
    await deleteStorageObject(parsed.bucket, parsed.object);
  } catch (error) {
    console.warn("Kontaktbild konnte nicht aus Cloud Storage geloescht werden.", error.message);
  }
}

async function updateContactImage(id, input) {
  if (!storageEnabled()) throw new Error("CONTACT_IMAGE_BUCKET ist nicht konfiguriert.");
  const { buffer, contentType } = parseImagePayload(input);
  const client = await getPool().connect();
  let uploadedImageUrl = "";
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from contacts where id = $1 for update", [id]);
    const oldRow = rows[0];
    if (!oldRow) {
      await client.query("rollback");
      return null;
    }
    const actorId = oldRow.owner_id || (await firstProfileId(client));
    const objectName = [
      "contact-images",
      objectSegment(id),
      `${Date.now()}.${imageExtension(contentType)}`
    ].join("/");
    await saveStorageObject(objectName, buffer, contentType);
    const nextImageUrl = `gs://${CONTACT_IMAGE_BUCKET}/${objectName}`;
    uploadedImageUrl = nextImageUrl;
    const sourceLabel = String(input.imageSourceLabel || input.image_source_label || input.sourceLabel || "Cloud Storage").trim();
    const sourceUrl = String(input.imageSourceUrl || input.image_source_url || input.sourceUrl || "").trim();
    const rightsNote = String(input.imageRightsNote || input.image_rights_note || input.rightsNote || "").trim();
    const updated = await client.query(
      `update contacts
       set image_url = $2,
           image_source_url = $3,
           image_source_label = $4,
           image_rights_note = $5,
           image_updated_at = now(),
           image_updated_by = $6,
           updated_by = $6
       where id = $1
       returning *`,
      [id, nextImageUrl, sourceUrl, sourceLabel, rightsNote, actorId]
    );
    await client.query(
      `insert into changes (contact_id, action, field_name, old_value, new_value, changed_by)
       values ($1, 'image_update', 'image', $2, $3, $4)`,
      [id, stringifyValue(oldRow.image_url), nextImageUrl, actorId]
    );
    await client.query("commit");
    await deleteStorageObjectIfNeeded(oldRow.image_url);
    return {
      contact: mapContact(updated.rows[0]),
      changes: await getContactHistory(id)
    };
  } catch (error) {
    await client.query("rollback");
    await deleteStorageObjectIfNeeded(uploadedImageUrl);
    throw error;
  } finally {
    client.release();
  }
}

async function removeContactImage(id) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from contacts where id = $1 for update", [id]);
    const oldRow = rows[0];
    if (!oldRow) {
      await client.query("rollback");
      return null;
    }
    const actorId = oldRow.owner_id || (await firstProfileId(client));
    const updated = await client.query(
      `update contacts
       set image_url = '',
           image_source_url = '',
           image_source_label = '',
           image_rights_note = '',
           image_updated_at = now(),
           image_updated_by = $2,
           updated_by = $2
       where id = $1
       returning *`,
      [id, actorId]
    );
    await client.query(
      `insert into changes (contact_id, action, field_name, old_value, new_value, changed_by)
       values ($1, 'image_remove', 'image', $2, '', $3)`,
      [id, stringifyValue(oldRow.image_url), actorId]
    );
    await client.query("commit");
    await deleteStorageObjectIfNeeded(oldRow.image_url);
    return {
      contact: mapContact(updated.rows[0]),
      changes: await getContactHistory(id)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function readContactImage(id, response) {
  if (!storageEnabled()) {
    sendJson(response, 404, { error: "Kontaktbild-Bucket ist nicht konfiguriert" });
    return;
  }
  const row = await getContactRow(id);
  const parsed = parseGcsUri(row?.image_url);
  if (!row || !parsed || parsed.bucket !== CONTACT_IMAGE_BUCKET) {
    sendJson(response, 404, { error: "Kontaktbild nicht gefunden" });
    return;
  }
  const { buffer, contentType } = await readStorageObject(parsed.bucket, parsed.object);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "private, max-age=300"
  });
  response.end(buffer);
}

async function createOrganization(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Organisationsname ist erforderlich.");
  const actorId = await firstProfileId(getPool());
  const id = String(input.id || "").trim() || generateId("gcp-org");
  const normalizedName = normalizeName(input.normalizedName || input.normalized_name || name);
  const values = [
    id,
    name,
    normalizedName,
    input.sector || "",
    input.organizationType || input.organization_type || "",
    input.postalCode || input.postal_code || "",
    input.city || "",
    input.state || input.federal_state || "",
    numberOrNull(input.lat ?? input.latitude),
    numberOrNull(input.lon ?? input.longitude),
    input.website || "",
    input.phone || "",
    input.email || "",
    input.notes || input.note || "",
    input.source || "GCP-Demo",
    input.status || "active",
    actorId,
    actorId
  ];
  const { rows } = await getPool().query(
    `insert into organizations
      (id, name, normalized_name, sector, organization_type, postal_code, city, federal_state,
       latitude, longitude, website, phone, email, notes, source, status, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     returning *`,
    values
  );
  return mapOrganization(rows[0]);
}

async function patchOrganization(id, input) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from organizations where id = $1 for update", [id]);
    const oldRow = rows[0];
    if (!oldRow) {
      await client.query("rollback");
      return null;
    }
    const dbPatch = {};
    for (const [uiField, dbField] of ORGANIZATION_FIELD_MAP) {
      if (!Object.prototype.hasOwnProperty.call(input, uiField)) continue;
      const nextValue = inputValueForField(dbField, input[uiField]);
      const oldValue = oldRow[dbField] ?? "";
      if (String(oldValue ?? "") === String(nextValue ?? "")) continue;
      dbPatch[dbField] = nextValue;
    }
    if (Object.prototype.hasOwnProperty.call(dbPatch, "name")) {
      dbPatch.normalized_name = normalizeName(dbPatch.name);
    }
    if (!Object.keys(dbPatch).length) {
      await client.query("commit");
      return mapOrganization(oldRow);
    }
    dbPatch.updated_by = await firstProfileId(client);
    const fields = Object.keys(dbPatch);
    const values = fields.map((field) => dbPatch[field]);
    const assignments = fields.map((field, index) => `${field} = $${index + 2}`).join(", ");
    const updated = await client.query(
      `update organizations set ${assignments} where id = $1 returning *`,
      [id, ...values]
    );
    await client.query(
      `update contacts
       set organization = $2,
           sector = $3,
           postal_code = $4,
           city = $5,
           federal_state = $6,
           latitude = $7,
           longitude = $8
       where organization_id = $1`,
      [
        id,
        updated.rows[0].name,
        updated.rows[0].sector || "",
        updated.rows[0].postal_code || "",
        updated.rows[0].city || "",
        updated.rows[0].federal_state || "",
        updated.rows[0].latitude,
        updated.rows[0].longitude
      ]
    );
    await client.query("commit");
    return mapOrganization(updated.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createContact(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Kontaktname ist erforderlich.");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const actorId = input.ownerId || input.owner_id || (await firstProfileId(client));
    const organizationId = input.organizationId || input.organization_id || null;
    const organization = organizationId ? await getOrganization(organizationId, client) : null;
    const id = String(input.id || "").trim() || generateId("gcp-contact");
    const values = [
      id,
      name,
      organizationId,
      organization?.name || input.organization || "",
      organization?.sector || input.category || input.sector || "",
      input.specialty || "",
      input.contactRole || input.role || "",
      input.priority || "Mittel",
      actorId,
      organization?.postal_code || input.postalCode || input.postal_code || "",
      organization?.city || input.city || "",
      organization?.federal_state || input.state || input.federal_state || "",
      numberOrNull(input.lat ?? input.latitude ?? organization?.latitude),
      numberOrNull(input.lon ?? input.longitude ?? organization?.longitude),
      input.email || "",
      input.phone || "",
      input.linkedin || "",
      Array.isArray(input.themes) ? input.themes : Array.isArray(input.topics) ? input.topics : [],
      input.note || input.notes || "",
      input.nextStep || input.next_step || "",
      Array.isArray(input.sources) ? input.sources.join("; ") : input.source || "GCP-Demo",
      normalizeImagePath(input.image || input.image_url || ""),
      input.imageSourceUrl || input.image_source_url || "",
      input.imageSourceLabel || input.image_source_label || "",
      input.imageRightsNote || input.image_rights_note || "",
      input.status || "active",
      actorId,
      actorId
    ];
    const inserted = await client.query(
      `insert into contacts
        (id, name, organization_id, organization, sector, specialty, role, priority, owner_id,
         postal_code, city, federal_state, latitude, longitude, email, phone, linkedin, topics,
         notes, next_step, source, image_url, image_source_url, image_source_label, image_rights_note,
         status, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
       returning *`,
      values
    );
    await client.query(
      `insert into changes (contact_id, action, field_name, old_value, new_value, changed_by)
       values ($1, 'create', '', '', $2, $3)`,
      [id, name, actorId]
    );
    await client.query("commit");
    return {
      contact: mapContact(inserted.rows[0]),
      changes: await getContactHistory(id)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function patchContact(id, input) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from contacts where id = $1 for update", [id]);
    const oldRow = rows[0];
    if (!oldRow) {
      await client.query("rollback");
      return null;
    }

    const dbPatch = {};
    const changes = [];
    for (const [uiField, dbField] of CONTACT_FIELD_MAP) {
      if (!Object.prototype.hasOwnProperty.call(input, uiField)) continue;
      const nextValue = inputValueForField(dbField, input[uiField]);
      const oldValue = oldRow[dbField] ?? "";
      if (String(oldValue ?? "") === String(nextValue ?? "")) continue;
      dbPatch[dbField] = nextValue;
      changes.push({
        fieldName: uiField,
        oldValue,
        newValue: nextValue
      });
    }

    if (Object.prototype.hasOwnProperty.call(dbPatch, "organization_id") && dbPatch.organization_id) {
      const organization = await getOrganization(dbPatch.organization_id, client);
      if (organization) {
        dbPatch.organization = organization.name;
        dbPatch.sector = organization.sector || dbPatch.sector || "";
        dbPatch.postal_code = organization.postal_code || dbPatch.postal_code || "";
        dbPatch.city = organization.city || dbPatch.city || "";
        dbPatch.federal_state = organization.federal_state || dbPatch.federal_state || "";
        dbPatch.latitude = organization.latitude ?? dbPatch.latitude ?? null;
        dbPatch.longitude = organization.longitude ?? dbPatch.longitude ?? null;
      }
    }

    if (!changes.length) {
      await client.query("commit");
      return {
        contact: mapContact(oldRow),
        changes: await getContactHistory(id)
      };
    }

    const actorId = dbPatch.owner_id || oldRow.owner_id || (await firstProfileId(client));
    dbPatch.updated_by = actorId;
    const fields = Object.keys(dbPatch);
    const values = fields.map((field) => dbPatch[field]);
    const assignments = fields.map((field, index) => `${field} = $${index + 2}`).join(", ");
    const updated = await client.query(
      `update contacts set ${assignments} where id = $1 returning *`,
      [id, ...values]
    );

    for (const change of changes) {
      await client.query(
        `insert into changes (contact_id, action, field_name, old_value, new_value, changed_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          contactChangeAction(change.fieldName, change.oldValue, change.newValue),
          change.fieldName,
          stringifyValue(change.oldValue),
          stringifyValue(change.newValue),
          actorId
        ]
      );
    }

    await client.query("commit");
    return {
      contact: mapContact(updated.rows[0]),
      changes: await getContactHistory(id)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function firstProfileId(client) {
  const { rows } = await client.query("select id from profiles where active = true order by display_name limit 1");
  return rows[0]?.id || null;
}

function contactChangeAction(fieldName, oldValue, newValue) {
  if (fieldName === "ownerId") return "owner_change";
  if (fieldName === "status" && oldValue === "active" && newValue === "archived") return "archive";
  if (fieldName === "status" && oldValue === "archived" && newValue === "active") return "restore";
  return "update";
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendJsonDownload(response, filename, payload) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${filename}"`
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(body);
}

async function serveGcpIndex(response) {
  const indexPath = path.join(ROOT, "demo", "index.html");
  let html = await readFile(indexPath, "utf8");
  html = html
    .replace('<link rel="stylesheet" href="./demo.css">', '<link rel="stylesheet" href="/demo/demo.css">')
    .replace('<a class="sidebar-brand" href="./index.html"', '<a class="sidebar-brand" href="/"')
    .replace("Backendlose Demo-Version für internen Testbetrieb.", "GCP-Demo mit Cloud-SQL-Backend.")
    .replace("Lokaler Browserstand", "Cloud SQL Backend")
    .replace("Demo-Daten geladen", "Verbinde mit Cloud SQL ...")
    .replace('<script src="/data/demo-data.js"></script>', '<script>window.VK_DEMO_BACKEND = "api";</script>\n    <script src="/data/demo-data.js"></script>')
    .replace('<script src="./demo-app.js"></script>', '<script src="/demo/demo-app.js"></script>');
  sendText(response, 200, html, "text/html; charset=utf-8");
}

async function serveStatic(pathname, response) {
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES.get(ext) || "application/octet-stream";
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=300"
    });
    response.end(body);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/healthz") {
      await ensureReady();
      sendJson(response, 200, { ok: true, backend: "cloud-sql", runtime: runtimeMetadata() });
      return;
    }

    await ensureReady();

    if (request.method === "GET" && url.pathname === "/api/ops/summary") {
      sendJson(response, 200, await getOpsSummary());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/export") {
      const stamp = new Date().toISOString().slice(0, 10);
      sendJsonDownload(response, `versorgungs-kompass-gcp-demo-export-${stamp}.json`, await exportDemoData());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/import/runs") {
      sendJson(response, 200, { items: await listImportRuns() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/import/preview") {
      const body = await readJson(request);
      sendJson(response, 200, await importPreview(body.import || body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/import/commit") {
      const body = await readJson(request);
      sendJson(response, 201, await commitImport(body.import || body));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const [profiles, organizations, contacts, changes] = await Promise.all([
        listProfiles(),
        listOrganizations({ includeArchived }),
        listContacts({ includeArchived }),
        listChanges()
      ]);
      sendJson(response, 200, { profiles, organizations, contacts, changes });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/reset-demo") {
      await resetDemoData();
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profiles") {
      sendJson(response, 200, { items: await listProfiles() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/organizations") {
      sendJson(response, 200, { items: await listOrganizations({ includeArchived: url.searchParams.get("includeArchived") === "true" }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/organizations") {
      const body = await readJson(request);
      const organization = await createOrganization(body.organization || body);
      sendJson(response, 201, { organization });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/contacts") {
      sendJson(response, 200, { items: await listContacts({ includeArchived: url.searchParams.get("includeArchived") === "true" }) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/contacts") {
      const body = await readJson(request);
      const result = await createContact(body.contact || body);
      sendJson(response, 201, result);
      return;
    }

    const historyMatch = /^\/api\/contacts\/([^/]+)\/history$/.exec(url.pathname);
    if (request.method === "GET" && historyMatch) {
      sendJson(response, 200, { items: await getContactHistory(decodeURIComponent(historyMatch[1])) });
      return;
    }

    const imageMatch = /^\/api\/contacts\/([^/]+)\/image$/.exec(url.pathname);
    if (imageMatch && request.method === "GET") {
      await readContactImage(decodeURIComponent(imageMatch[1]), response);
      return;
    }

    if (imageMatch && request.method === "POST") {
      const body = await readJson(request);
      const result = await updateContactImage(decodeURIComponent(imageMatch[1]), body.image || body);
      if (!result) {
        sendJson(response, 404, { error: "Kontakt nicht gefunden" });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    if (imageMatch && request.method === "DELETE") {
      const result = await removeContactImage(decodeURIComponent(imageMatch[1]));
      if (!result) {
        sendJson(response, 404, { error: "Kontakt nicht gefunden" });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    const contactMatch = /^\/api\/contacts\/([^/]+)$/.exec(url.pathname);
    if (contactMatch && request.method === "GET") {
      const contact = await getContact(decodeURIComponent(contactMatch[1]));
      if (!contact) {
        sendJson(response, 404, { error: "Kontakt nicht gefunden" });
        return;
      }
      sendJson(response, 200, contact);
      return;
    }

    if (contactMatch && request.method === "PATCH") {
      const body = await readJson(request);
      const result = await patchContact(decodeURIComponent(contactMatch[1]), body.contact || body);
      if (!result) {
        sendJson(response, 404, { error: "Kontakt nicht gefunden" });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    const organizationMatch = /^\/api\/organizations\/([^/]+)$/.exec(url.pathname);
    if (organizationMatch && request.method === "GET") {
      const organization = await getOrganization(decodeURIComponent(organizationMatch[1]));
      if (!organization) {
        sendJson(response, 404, { error: "Organisation nicht gefunden" });
        return;
      }
      sendJson(response, 200, mapOrganization(organization));
      return;
    }

    if (organizationMatch && request.method === "PATCH") {
      const body = await readJson(request);
      const organization = await patchOrganization(decodeURIComponent(organizationMatch[1]), body.organization || body);
      if (!organization) {
        sendJson(response, 404, { error: "Organisation nicht gefunden" });
        return;
      }
      sendJson(response, 200, { organization });
      return;
    }

    sendJson(response, 404, { error: "API-Endpunkt nicht gefunden" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "Interner Fehler" });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/demo/" || url.pathname === "/demo/index.html") {
    await serveGcpIndex(response);
    return;
  }
  await serveStatic(decodeURIComponent(url.pathname), response);
});

server.listen(PORT, () => {
  console.log(`Versorgungs-Kompass GCP Demo listening on ${PORT}`);
});
