#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDir = process.argv[2] || "backups";
const format = (process.env.BACKUP_FORMAT || "csv").toLowerCase();
const date = new Date().toISOString().slice(0, 10);

const tables = [
  "contacts",
  "profiles",
  "changes",
  "activity_events",
  "saved_views",
  "user_settings"
];
const optionalTables = new Set(["activity_events"]);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY als Umgebungsvariablen setzen.");
  process.exit(1);
}

if (!["csv", "json"].includes(format)) {
  console.error("BACKUP_FORMAT muss csv oder json sein.");
  process.exit(1);
}

function csvEscape(value) {
  if (value === null || typeof value === "undefined") return "";
  const text = Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

async function exportTable(table) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    }
  });

  let rows = [];
  if (!response.ok) {
    const details = await response.text();
    const canSkipMissingOptionalTable = optionalTables.has(table) && (
      /PGRST205|42P01|activity_events.*(?:schema cache|does not exist|could not find)|relation .*activity_events.* does not exist/i.test(details)
    );
    if (!canSkipMissingOptionalTable) {
      throw new Error(`${table}: ${response.status} ${response.statusText}: ${details}`);
    }
    console.warn(`${table}: noch nicht verfuegbar; kompatibles leeres Backup wird geschrieben.`);
  } else {
    rows = await response.json();
  }
  const filename = `${table}_backup_${date}.${format}`;
  const content = format === "json" ? `${JSON.stringify(rows, null, 2)}\n` : `${toCsv(rows)}\n`;
  writeFileSync(join(outputDir, filename), content, "utf8");
  console.log(`${filename}: ${rows.length} Zeilen exportiert`);
}

mkdirSync(outputDir, { recursive: true });

for (const table of tables) {
  await exportTable(table);
}

console.log(`Backup abgeschlossen: ${outputDir}`);
