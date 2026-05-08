import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd(), "deutschlandkarte-project");
const dataDir = path.join(projectRoot, "data");
const inputPath = path.join(dataDir, "locations-master.csv");
const outputPath = path.join(dataDir, "locations.js");

const orderedFields = [
  "name",
  "category",
  "city",
  "state",
  "street",
  "postal_code",
  "lat",
  "lon",
  "url",
  "logo_url",
  "person_photo",
  "description",
  "person_name",
  "person_title",
  "email",
  "primary_system",
  "source_id",
  "dq_hint",
  "coordinate_source"
];

const categoryOrder = ["Arztpraxen", "Krankenhäuser", "Apotheken", "Pflegeeinrichtungen", "Rettungsdienst"];

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current !== "" || row.length) {
    row.push(current);
    rows.push(row);
  }

  const filtered = rows.filter((entry) => entry.some((value) => value !== ""));
  if (!filtered.length) return [];

  const [header, ...body] = filtered;
  return body.map((cells) =>
    header.reduce((entry, key, cellIndex) => {
      entry[key] = cells[cellIndex] ?? "";
      return entry;
    }, {})
  );
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  const text = normalizeText(value).replace(",", ".");
  if (!text) return null;
  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function jsValue(value) {
  return JSON.stringify(value);
}

const csvText = fs.readFileSync(inputPath, "utf8");
const rows = parseCsv(csvText)
  .map((row) => ({
    name: normalizeText(row.name),
    category: normalizeText(row.category),
    city: normalizeText(row.city),
    state: normalizeText(row.state),
    street: normalizeText(row.street),
    postal_code: normalizeText(row.postal_code),
    lat: normalizeNumber(row.lat),
    lon: normalizeNumber(row.lon),
    url: normalizeText(row.url),
    logo_url: normalizeText(row.logo_url),
    person_photo: normalizeText(row.person_photo),
    description: normalizeText(row.description),
    person_name: normalizeText(row.person_name),
    person_title: normalizeText(row.person_title),
    email: normalizeText(row.email),
    primary_system: normalizeText(row.primary_system),
    source_id: normalizeText(row.source_id),
    dq_hint: normalizeText(row.dq_hint),
    coordinate_source: normalizeText(row.coordinate_source)
  }))
  .filter((row) => row.name && row.category && row.city);

const grouped = categoryOrder.map((category) => ({
  category,
  entries: rows.filter((row) => row.category === category)
})).filter((group) => group.entries.length);

const lines = [];
lines.push("// Datenbasis fuer Kartenmarker.");
lines.push("// Generiert aus locations-master.csv.");
lines.push("// Neue Eintraege sollten bevorzugt in der Master-CSV gepflegt werden.");
lines.push("// Pflichtfelder fuer die Karte: name, category, city, lat, lon");
lines.push("");
lines.push("window.MAP_LOCATIONS = [");

grouped.forEach(({ category, entries }, groupIndex) => {
  const hasPrevious = lines[lines.length - 1] !== "window.MAP_LOCATIONS = [";
  if (hasPrevious) lines.push("");
  lines.push(`  // ${category}`);

  entries.forEach((entry, entryIndex) => {
    lines.push("  {");
    orderedFields.forEach((field) => {
      const value = entry[field];
      if (value === "" || value == null) return;
      const formatted = typeof value === "number" ? String(value) : jsValue(value);
      lines.push(`    ${field}: ${formatted},`);
    });
    lines.push(`  }${groupIndex === grouped.length - 1 && entryIndex === entries.length - 1 ? "" : ","}`);
  });
});

lines.push("");
lines.push("];");
lines.push("");

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${rows.length} rows to ${outputPath}`);
