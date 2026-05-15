#!/usr/bin/env node

import fs from "node:fs";

const csvPath = process.argv[2] || "data/versorgungs-kompass-data.csv";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const importUserId = process.env.SUPABASE_IMPORT_USER_ID;

if (!supabaseUrl || !serviceRoleKey || !importUserId) {
  console.error("Bitte SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und SUPABASE_IMPORT_USER_ID setzen.");
  process.exit(1);
}

function parseCsv(text) {
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
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function splitList(value) {
  return String(value || "")
    .split(/\s*;\s*|\s*\|\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value) {
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePriority(value) {
  return ["Hoch", "Mittel", "Niedrig"].includes(value) ? value : "Mittel";
}

async function loadProfiles() {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,email,display_name,initials,active`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
}

function resolveOwnerId(owner, profiles) {
  const normalizedOwner = String(owner || "").trim().toLowerCase();
  if (!normalizedOwner) return null;
  const profile = profiles.find((item) =>
    item.active !== false &&
    [item.display_name, item.email, item.initials].some((candidate) => String(candidate || "").trim().toLowerCase() === normalizedOwner)
  );
  return profile?.id || null;
}

function toContact(row, profiles) {
  return {
    id: row.id,
    name: row.name || row.organization || "Unbenannter Kontakt",
    organization: row.organization || null,
    sector: row.category || "Praxis",
    specialty: row.specialty || null,
    priority: normalizePriority(row.priority),
    owner_id: resolveOwnerId(row.owner, profiles),
    postal_code: row.postalCode || null,
    city: row.city || null,
    federal_state: row.state || null,
    latitude: numberOrNull(row.lat),
    longitude: numberOrNull(row.lon),
    email: row.email || null,
    phone: row.phone || null,
    linkedin: row.linkedin || null,
    topics: splitList(row.themes),
    notes: row.note || null,
    source: splitList(row.sources).join("; ") || null,
    image_url: row.image || null,
    status: row.status || "active",
    created_by: importUserId,
    updated_by: importUserId
  };
}

async function upsertContacts(contacts) {
  const response = await fetch(`${supabaseUrl}/rest/v1/contacts?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(contacts)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
}

async function insertImportChanges(contacts) {
  const changes = contacts.map((contact) => ({
    contact_id: contact.id,
    action: "import",
    field_name: null,
    old_value: "",
    new_value: contact.name,
    changed_by: importUserId
  }));
  const response = await fetch(`${supabaseUrl}/rest/v1/changes`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(changes)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
}

const profiles = await loadProfiles();
const [header, ...body] = parseCsv(fs.readFileSync(csvPath, "utf8"));
const keys = header.map((key) => key.trim());
const contacts = body
  .map((cells) => Object.fromEntries(keys.map((key, index) => [key, String(cells[index] || "").trim()])))
  .map((row) => toContact(row, profiles))
  .filter((contact) => contact.id);

for (let index = 0; index < contacts.length; index += 100) {
  const batch = contacts.slice(index, index + 100);
  await upsertContacts(batch);
  await insertImportChanges(batch);
}

console.log(`${contacts.length} Kontakte nach Supabase importiert und im Änderungslog protokolliert.`);
