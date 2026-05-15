#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const csvPath = path.join(rootDir, "data", "versorgungs-kompass-data.csv");
const dataJsPath = path.join(rootDir, "data", "versorgungs-kompass-data.js");
const docsCsvPath = path.join(rootDir, "docs", "data", "versorgungs-kompass-data.csv");
const docsJsPath = path.join(rootDir, "docs", "data", "versorgungs-kompass-data.js");

const fields = [
  "id",
  "name",
  "honorificTitle",
  "specialty",
  "category",
  "organization",
  "topic",
  "priority",
  "owner",
  "email",
  "phone",
  "linkedin",
  "location",
  "city",
  "state",
  "street",
  "postalCode",
  "url",
  "description",
  "lat",
  "lon",
  "note",
  "nextStep",
  "image",
  "sources"
];

const allowedPriorities = new Set(["Hoch", "Mittel", "Niedrig"]);
const knownOwners = new Set(["", "Timo Frank", "Mirjam Scholz", "Max Fröhlich", "Johanna Ludwig", "Laila Wahle", "Thomas Kostera", "TF"]);

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((item) => item !== "")) rows.push(row);
  }

  return rows;
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function parseSources(value) {
  if (!value) return [];
  return [...new Set(String(value).split(/\s*;\s*|\s*\|\s*|\n+/).map((item) => item.trim()).filter(Boolean))];
}

function parseNumber(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = Number.parseFloat(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : normalized;
}

function normalizePriority(value) {
  const priority = String(value || "").trim();
  return allowedPriorities.has(priority) ? priority : "Mittel";
}

function normalizeContact(entry) {
  const contact = {};
  for (const field of fields) contact[field] = String(entry[field] ?? "").trim();
  contact.priority = normalizePriority(contact.priority);
  contact.lat = parseNumber(contact.lat);
  contact.lon = parseNumber(contact.lon);
  contact.sources = parseSources(contact.sources);
  return contact;
}

function readContacts() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (!rows.length) throw new Error("CSV ist leer.");

  const [header, ...body] = rows;
  const normalizedHeader = header.map((item) => item.trim());
  const contacts = body.map((cells) => {
    const entry = {};
    normalizedHeader.forEach((key, index) => {
      entry[key] = cells[index] || "";
    });
    return normalizeContact(entry);
  });

  return contacts;
}

function validateContacts(contacts) {
  const errors = [];
  const warnings = [];
  const seenIds = new Set();

  contacts.forEach((contact, index) => {
    const rowNumber = index + 2;
    if (!contact.id) errors.push(`Zeile ${rowNumber}: id fehlt.`);
    if (seenIds.has(contact.id)) errors.push(`Zeile ${rowNumber}: id '${contact.id}' ist doppelt.`);
    seenIds.add(contact.id);

    if (!contact.name) warnings.push(`Zeile ${rowNumber} (${contact.id}): Name ist leer.`);
    if (!allowedPriorities.has(contact.priority)) errors.push(`Zeile ${rowNumber} (${contact.id}): Prioritaet muss Hoch, Mittel oder Niedrig sein.`);
    if (!knownOwners.has(contact.owner)) warnings.push(`Zeile ${rowNumber} (${contact.id}): Owner '${contact.owner}' ist nicht in der bekannten Owner-Liste.`);
  });

  return { errors, warnings };
}

function writeOutputs(contacts) {
  const csvRows = [
    fields.join(","),
    ...contacts.map((contact) =>
      fields
        .map((field) => {
          const value = field === "sources" ? contact.sources.join("; ") : contact[field];
          return csvEscape(value);
        })
        .join(",")
    )
  ];
  const csv = `${csvRows.join("\n")}\n`;
  const jsContacts = contacts.map((contact) => ({
    ...contact,
    lat: contact.lat === "" ? "" : contact.lat,
    lon: contact.lon === "" ? "" : contact.lon
  }));
  const js = `window.VERSORGUNGS_COMPASS_CONTACTS = ${JSON.stringify(jsContacts, null, 2)};\n`;

  fs.writeFileSync(csvPath, csv);
  fs.writeFileSync(docsCsvPath, csv);
  fs.writeFileSync(dataJsPath, js);
  fs.writeFileSync(docsJsPath, js);
}

function main() {
  const contacts = readContacts();
  if (contacts.length > 0 && process.env.ALLOW_PUBLIC_CONTACT_SEED !== "1") {
    console.error("Abbruch: GitHub Pages darf keine echten Kontaktdaten aus CSV/JS ausliefern.");
    console.error("Nutze Supabase fuer produktive Daten. Fuer bewusst synthetische Demo-Seeds: ALLOW_PUBLIC_CONTACT_SEED=1 setzen.");
    process.exit(1);
  }

  const { errors, warnings } = validateContacts(contacts);

  if (errors.length) {
    console.error("Datenvalidierung fehlgeschlagen:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  writeOutputs(contacts);

  console.log(`Kontaktdaten synchronisiert: ${contacts.length} Kontakte`);
  if (warnings.length) {
    console.log("Hinweise:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}

main();
