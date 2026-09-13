import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const serverSource = read("api/server.mjs");
const clientSource = read("frontend/data/data-service.js");

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Vertrag nicht gefunden: ${startMarker}`);
  return source.slice(start, end);
}

function functionsFrom(source, names, sandbox = {}) {
  const context = vm.createContext({
    generatedId: () => "generated-observation",
    splitList: (value) => Array.isArray(value) ? value : String(value || "").split(",").map((item) => item.trim()).filter(Boolean),
    validationError: (message) => Object.assign(new Error(message), { status: 400 }),
    ...sandbox
  });
  vm.runInContext(`${source}\n${names.map((name) => `globalThis.${name} = ${name};`).join("\n")}`, context);
  return Object.fromEntries(names.map((name) => [name, context[name]]));
}

const api = functionsFrom(
  between(serverSource, "function hospitationObservationEvidenceType(", "function hospitationSlotToDb("),
  ["hospitationObservationToDto", "hospitationObservationToDb", "normalizeHospitationObservationPatch"]
);
const modelContext = vm.createContext({ window: {} });
vm.runInContext(read("frontend/data/hospitation-model.js"), modelContext);
const client = functionsFrom(
  between(clientSource, "  function hospitationObservationEvidenceType(", "  function normalizeComparisonRole("),
  ["hospitationObservationDbToUi", "hospitationObservationUiToDb"],
  { hospitationModel: () => modelContext.window.VersorgungsCompassHospitationModel }
);

const legacyCodes = {
  processPhase: "Kommunikation mit anderen Einrichtungen",
  problemType: "Medienbruch",
  impact: "Frust / Belastung",
  observationType: "Gegenbeispiel"
};

for (const evidenceType of ["", "directly_observed", "source_bound", "synthetic_source_based", "reported", "interpreted"]) {
  const observation = {
    id: `contract-${evidenceType || "open"}`,
    hospitationId: "contract-hospitation",
    title: "Fiktiver Quellenvertrag",
    description: "Die fiktive Person öffnet ein Dokument.",
    evidenceType,
    sourceReference: "Fiktive Feldnotiz, Szene 4",
    immediateConsequence: "Die fiktive Rolle wartet.",
    uncertainty: "Die genaue Dauer wurde nicht gemessen.",
    relevanceReason: "Wartezeit im nächsten Fall nachvollziehen.",
    nextStep: "Nächste Situation gemeinsam prüfen.",
    ...legacyCodes
  };
  // Browser DTO -> server columns -> server DTO -> browser model -> columns.
  // This exercises both sides of the real persistence boundary, not a mock
  // that simply echoes the submitted camelCase object.
  const firstDb = api.hospitationObservationToDb(observation);
  assert.equal(firstDb.evidence_type, evidenceType);
  assert.equal(firstDb.payload.evidenceType, evidenceType);
  const firstDto = api.hospitationObservationToDto(firstDb);
  const browserValue = client.hospitationObservationDbToUi(firstDto);
  const clientDb = client.hospitationObservationUiToDb(browserValue);
  const finalDto = api.hospitationObservationToDto(clientDb);
  assert.equal(finalDto.evidenceType, evidenceType, `Quellenart ${evidenceType || "offen"} muss erhalten bleiben.`);
  assert.equal(finalDto.sourceReference, observation.sourceReference);
  for (const field of ["immediateConsequence", "uncertainty", "relevanceReason", "nextStep"]) assert.equal(finalDto[field], observation[field]);
  for (const [field, value] of Object.entries(legacyCodes)) assert.equal(finalDto[field], value, `Bestandscode ${field} darf nicht migriert werden.`);
}

for (const input of [{}, { evidenceType: null }, { evidence_type: null }, { evidenceType: "" }]) {
  assert.equal(api.hospitationObservationToDb(input).evidence_type, "");
  assert.equal(api.hospitationObservationToDto(input).evidenceType, "");
  assert.equal(client.hospitationObservationDbToUi(input).evidenceType, "");
  assert.equal(client.hospitationObservationUiToDb(input).evidence_type, "");
}
const clearedColumn = { evidence_type: "", payload: { evidenceType: "reported" } };
assert.equal(api.hospitationObservationToDto(clearedColumn).evidenceType, "", "Eine explizit geleerte Spalte hat Vorrang vor älterem Payload.");
assert.equal(client.hospitationObservationDbToUi(clearedColumn).evidenceType, "");

const aliases = {
  source_reference: ["sourceReference", "Altquelle"],
  evidence_type: ["evidenceType", "reported"],
  process_phase: ["processPhase", "Aufnahme"],
  problem_type: ["problemType", "Information fehlt"],
  observation_type: ["observationType", "Hindernis"]
};
for (const [alias, [field, previousValue]] of Object.entries(aliases)) {
  for (const patch of [{ [alias]: "" }, { [field]: "" }, { [field]: "", [alias]: previousValue }]) {
    const current = { [field]: previousValue, [alias]: previousValue };
    const db = api.hospitationObservationToDb({ ...current, ...api.normalizeHospitationObservationPatch(patch) });
    const dto = api.hospitationObservationToDto(db);
    assert.equal(dto[field], "", `Explizites Leeren von ${field}/${alias} muss Vorrang vor dem Altwert haben.`);
    const browser = client.hospitationObservationDbToUi(dto);
    const normalized = modelContext.window.VersorgungsCompassHospitationModel.normalizeObservation(browser);
    assert.equal(normalized[field], "", `Modell darf gelöschtes ${field} nicht aus einem Legacy-Alias wiederherstellen.`);
  }
}
assert.equal(api.hospitationObservationToDb({
  evidenceType: "reported",
  ...api.normalizeHospitationObservationPatch({ evidence_type: "source_bound" })
}).evidence_type, "source_bound");

for (const evidenceType of ["interpreted", "directly_observed", "reported", "source_bound", ""]) {
  const existingSeed = {
    evidence_type: evidenceType,
    payload: {
      evidenceType,
      originalEvidenceType: "synthetic_source_based",
      sourceReference: "Fiktive öffentliche Demonstrationsquelle"
    }
  };
  const dto = api.hospitationObservationToDto(existingSeed);
  assert.equal(dto.evidenceType, "synthetic_source_based");
  const browserValue = client.hospitationObservationDbToUi(existingSeed);
  assert.equal(browserValue.evidenceType, "synthetic_source_based");
  assert.equal(browserValue.originalEvidenceType, "synthetic_source_based");
  for (const reclassified of [dto, { ...dto, evidenceType: "directly_observed" }]) {
    const stored = api.hospitationObservationToDb(reclassified);
    assert.equal(stored.evidence_type, "synthetic_source_based");
    assert.equal(stored.payload.originalEvidenceType, "synthetic_source_based");
    assert.equal(stored.payload.evidenceType, "synthetic_source_based");
    assert.equal(client.hospitationObservationUiToDb(reclassified).evidence_type, "synthetic_source_based");
  }
}

assert.throws(() => api.hospitationObservationToDb({ evidenceType: "unknown" }), (error) => error.status === 400);
// Reading an unknown historical value must not invent an empirical source.
assert.equal(api.hospitationObservationToDto({ evidence_type: "unknown" }).evidenceType, "unknown");
assert.equal(client.hospitationObservationDbToUi({ evidence_type: "unknown" }).evidenceType, "unknown");

const { observationInputFields } = functionsFrom(
  `${between(serverSource, "const HOSPITATION_OBSERVATION_INPUT_FIELDS =", "const HOSPITATION_IMPORT_PREVIEW_FIELDS")}\nconst observationInputFields = HOSPITATION_OBSERVATION_INPUT_FIELDS;`,
  ["observationInputFields"]
);
for (const field of ["sourceReference", "immediateConsequence", "uncertainty", "relevanceReason", "nextStep"]) {
  assert.ok(observationInputFields.includes(field), `Das API-Update muss das sichtbare Feld ${field} akzeptieren.`);
}

console.log("Hospitation evidence contract OK: sechs Quellenzustände, Legacy-Roundtrip, Quellenbezug und synthetische Herkunft bleiben erhalten.");
