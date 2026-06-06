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

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"]
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
    await client.query("truncate changes, contacts, organizations, profiles restart identity cascade");

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
    image: row.image_url,
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

async function listProfiles() {
  const { rows } = await getPool().query("select * from profiles where active = true order by display_name");
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
      sendJson(response, 200, { ok: true, backend: "cloud-sql" });
      return;
    }

    await ensureReady();

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
  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveGcpIndex(response);
    return;
  }
  await serveStatic(decodeURIComponent(url.pathname), response);
});

server.listen(PORT, () => {
  console.log(`Versorgungs-Kompass GCP Demo listening on ${PORT}`);
});
