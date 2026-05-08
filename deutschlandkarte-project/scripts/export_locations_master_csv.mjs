import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const projectRoot = path.resolve(process.cwd(), "deutschlandkarte-project");
const dataDir = path.join(projectRoot, "data");
const locationsPath = path.join(dataDir, "locations.js");
const publicPath = path.join(dataDir, "locations-public.js");
const outputPath = path.join(dataDir, "locations-master.csv");

function evaluateWindowScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

const locationsWindow = evaluateWindowScript(locationsPath);
const publicWindow = evaluateWindowScript(publicPath);

const locations = locationsWindow.MAP_LOCATIONS || [];
const approvedIds = new Set((publicWindow.MAP_PUBLIC_APPROVED_SOURCE_IDS || []).map((value) => String(value)));

const columns = [
  "source_id",
  "public_approved",
  "name",
  "category",
  "city",
  "state",
  "street",
  "postal_code",
  "lat",
  "lon",
  "url",
  "description",
  "person_name",
  "person_title",
  "email",
  "primary_system",
  "dq_hint",
  "coordinate_source",
  "logo_url",
  "person_photo"
];

const rows = locations.map((entry) => ({
  source_id: entry.source_id ?? "",
  public_approved: approvedIds.has(String(entry.source_id ?? "")) ? "yes" : "",
  name: entry.name ?? "",
  category: entry.category ?? "",
  city: entry.city ?? "",
  state: entry.state ?? "",
  street: entry.street ?? "",
  postal_code: entry.postal_code ?? "",
  lat: entry.lat ?? "",
  lon: entry.lon ?? "",
  url: entry.url ?? "",
  description: entry.description ?? "",
  person_name: entry.person_name ?? "",
  person_title: entry.person_title ?? "",
  email: entry.email ?? "",
  primary_system: entry.primary_system ?? "",
  dq_hint: entry.dq_hint ?? "",
  coordinate_source: entry.coordinate_source ?? "",
  logo_url: entry.logo_url ?? "",
  person_photo: entry.person_photo ?? ""
}));

const csv = [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
].join("\n");

fs.writeFileSync(outputPath, `${csv}\n`, "utf8");
console.log(`Wrote ${rows.length} rows to ${outputPath}`);
