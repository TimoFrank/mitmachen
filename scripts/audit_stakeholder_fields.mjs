import { readFileSync } from "node:fs";

const requiredStakeholderOrganizationFields = [
  "logo_url",
  "logo_source_url",
  "logo_source_label",
  "member_count",
  "member_count_source_url",
  "member_count_source_label",
  "member_count_updated_at",
  "member_count_scope"
];

function extractArray(source, name, file) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) {
    throw new Error(`${file}: ${name} wurde nicht gefunden.`);
  }
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
}

function auditFile(file) {
  const source = readFileSync(file, "utf8");
  const fields = extractArray(source, "STAKEHOLDER_ORGANIZATION_FIELDS", file);
  const missing = requiredStakeholderOrganizationFields.filter((field) => !fields.has(field));
  if (missing.length) {
    throw new Error(`${file}: STAKEHOLDER_ORGANIZATION_FIELDS fehlt ${missing.join(", ")}.`);
  }
}

auditFile("data/data-service.js");
auditFile("api/server.mjs");

console.log("Stakeholder Field Audit OK: Logo- und Mitgliederfelder werden geladen.");
