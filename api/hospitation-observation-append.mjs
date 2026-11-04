import { createHash } from "node:crypto";

const TOP_KEYS = ["mode", "source", "observation", "expectedTargetFingerprint", "expectedCandidateFingerprint", "confirmation"];
const SOURCE_KEYS = ["kind", "recordingId", "sha256", "segmentStart", "segmentEnd", "indexBase"];
const OBSERVATION_KEYS = ["hospitationId", "title", "situation", "description", "limitations", "uncertainty", "immediateConsequence", "provenanceKind", "observedAt", "processPhase", "problemType", "observationType", "settingType", "topics", "involvedRoles", "usageRecommendation"];
const OMIT_VERSION = new Set(["created_at", "created_by", "updated_at", "updated_by"]);

function fail(message, status = 400, code = "observation_append_invalid") {
  return Object.assign(new Error(message), { status, code });
}
function object(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(`${label} muss ein Objekt sein.`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw fail(`${label} enthält unbekannte Felder.`);
  return value;
}
function requiredText(value, label, max = 50000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw fail(`${label} ist ungültig.`);
  return value.trim();
}
export function stableJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function appendFingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
export function parseObservationAppend(input) {
  object(input, TOP_KEYS, "Anfrage");
  if (!["preview", "apply"].includes(input.mode)) throw fail("mode muss preview oder apply sein.");
  const source = object(input.source, SOURCE_KEYS, "Quelle");
  if (source.kind !== "plaud_transcript"
    || typeof source.recordingId !== "string" || !/^of_[a-f0-9]{32}$/.test(source.recordingId)
    || typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw fail("Die Quellenkennung oder Prüfsumme ist ungültig.");
  }
  if (source.indexBase !== 1 || !Number.isSafeInteger(source.segmentStart) || !Number.isSafeInteger(source.segmentEnd) || source.segmentStart < 1 || source.segmentEnd < source.segmentStart || source.segmentEnd > 500000) throw fail("Quellenstellen müssen gültige einsbasierte Segmente sein.");
  const observation = object(input.observation, OBSERVATION_KEYS, "Beobachtung");
  const normalized = {};
  for (const key of ["hospitationId", "title", "situation", "description", "limitations"]) normalized[key] = requiredText(observation[key], key, key === "title" ? 1000 : 50000);
  if (!/^[a-zA-Z0-9:._-]{1,160}$/.test(normalized.hospitationId)) throw fail("Die Besuchskennung ist ungültig.");
  for (const key of OBSERVATION_KEYS.filter((key) => !Object.hasOwn(normalized, key))) {
    if (observation[key] === undefined) continue;
    if (["topics", "involvedRoles"].includes(key)) {
      if (!Array.isArray(observation[key]) || observation[key].length > 50) throw fail(`${key} ist ungültig.`);
      normalized[key] = observation[key].map((item) => requiredText(item, key, 500));
    } else normalized[key] = requiredText(observation[key], key, key === "settingType" ? 160 : 50000);
  }
  const normalizedSource = Object.fromEntries(SOURCE_KEYS.map((key) => [key, source[key]]));
  const id = `obs-plaud-${source.recordingId.slice(3)}-s${source.segmentStart}-${source.segmentEnd}`;
  const result = { mode: input.mode, source: normalizedSource, observation: normalized, id };
  result.candidateFingerprint = appendFingerprint({ id, source: normalizedSource, observation: normalized });
  if (input.mode === "apply") {
    for (const key of ["expectedTargetFingerprint", "expectedCandidateFingerprint"]) {
      if (typeof input[key] !== "string" || !/^[a-f0-9]{64}$/.test(input[key])) throw fail(`${key} fehlt.`);
    }
    if (input.confirmation !== "append-source-observation") throw fail("Die gezielte Übernahme ist nicht bestätigt.");
    if (input.expectedCandidateFingerprint !== result.candidateFingerprint) throw fail("Die Beobachtung weicht von der Vorschau ab.", 409, "observation_append_candidate_drift");
    result.expectedTargetFingerprint = input.expectedTargetFingerprint;
  }
  return result;
}

function dataRecord(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !OMIT_VERSION.has(key)));
}
export function desiredAppendRecord(parsed, targetRows, toDb) {
  const sameId = targetRows.find((row) => row.id === parsed.id);
  const sequence = sameId?.sequence ?? Math.max(0, ...targetRows.map((row) => Number(row.sequence) || 0)) + 1;
  const sourceReference = `PLAUD ${parsed.source.recordingId}. Segmente ${parsed.source.segmentStart} bis ${parsed.source.segmentEnd}, einsbasiert. Transkript-SHA256 ${parsed.source.sha256}.`;
  const record = toDb({
    ...parsed.observation,
    id: parsed.id,
    sequence,
    evidenceType: "source_bound",
    sourceType: "qualitative_observation",
    sourceReference,
    internalUseAllowed: true,
    externalUseAllowed: false,
    status: "active"
  }, parsed.observation.hospitationId);
  record.payload.intakeSource = { ...parsed.source, candidateFingerprint: parsed.candidateFingerprint };
  return record;
}

export function createObservationAppendHandler(deps) {
  return async function appendObservation(request) {
    const parsed = parseObservationAppend(await deps.readValidatedJsonBody(request, TOP_KEYS, "Quellenbeobachtung"));
    const userId = deps.userIdFromToken(request);
    if (!userId) throw fail("Eine angemeldete Sitzung ist erforderlich.", 401);
    // Der vorhandene Lesepfad prüft den Zugriff auf den konkreten Elternbesuch.
    await deps.getHospitation(request, parsed.observation.hospitationId);
    return deps.withDomainTransaction(async (transaction) => {
      // Alle Append- und manuellen Schreibvorgänge serialisieren. Bestehende Zeilen
      // werden ausschließlich gelesen und zu keinem Zeitpunkt erneut gespeichert.
      await deps.databaseQuery(transaction, "lock table public.hospitation_observations in share row exclusive mode", []);
      let parents;
      try {
        // Eine gleichzeitige Löschung hält zuerst die Elternzeile und wartet
        // gegebenenfalls auf die Beobachtungstabelle. Hier nicht zurückwarten.
        parents = await deps.databaseQuery(transaction,
          "select * from public.hospitations where id = $1 for update nowait", [parsed.observation.hospitationId]);
      } catch (error) {
        if (error.code === "55P03") {
          throw fail("Die Hospitation wird gerade geändert. Bitte lade die Vorschau neu.", 409, "observation_append_target_drift");
        }
        throw error;
      }
      if (!parents.rows?.[0]) throw fail("Die Hospitation wurde nicht gefunden.", 404);
      // Den normalen Sichtbarkeitspfad unter der Sperre und über dieselbe
      // Transaktion erneut prüfen.
      await deps.getHospitation(request, parsed.observation.hospitationId, transaction);
      const current = await deps.databaseQuery(transaction, "select * from public.hospitation_observations where hospitation_id = $1 order by id for update", [parsed.observation.hospitationId]);
      const rows = current.rows || [];
      const globalId = await deps.databaseQuery(transaction, "select id, hospitation_id from public.hospitation_observations where id = $1", [parsed.id]);
      if (globalId.rows?.[0] && globalId.rows[0].hospitation_id !== parsed.observation.hospitationId) throw fail("Die Quellenkennung ist bereits einem anderen Besuch zugeordnet.", 409, "observation_append_parent_conflict");
      const targetFingerprint = appendFingerprint({ parent: parents.rows[0], observations: rows });
      const desired = desiredAppendRecord(parsed, rows, deps.hospitationObservationToDb);
      const existing = rows.find((row) => row.id === parsed.id);
      if (existing) {
        if (stableJson(dataRecord(existing)) !== stableJson(dataRecord(desired))) throw fail("Unter dieser Quellenkennung liegt eine andere Beobachtung vor.", 409, "observation_append_id_conflict");
        return { ok: true, mode: parsed.mode, action: "unchanged", targetFingerprint, candidateFingerprint: parsed.candidateFingerprint, item: deps.hospitationObservationToDto(existing) };
      }
      const title = parsed.observation.title.toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
      if (rows.some((row) => String(row.title || "").trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ") === title)) throw fail("Eine gleich benannte Beobachtung ist bereits vorhanden.", 409, "observation_append_potential_duplicate");
      if (parsed.mode === "preview") return { ok: true, mode: "preview", action: "create", targetFingerprint, candidateFingerprint: parsed.candidateFingerprint, item: deps.hospitationObservationToDto(desired) };
      if (parsed.expectedTargetFingerprint !== targetFingerprint) throw fail("Der Besuch oder seine Beobachtungen haben sich seit der Vorschau geändert.", 409, "observation_append_target_drift");
      const now = new Date().toISOString();
      const stored = await deps.cloudSqlRest("hospitation_observations", request, new URLSearchParams({ select: deps.observationFields.join(",") }), {
        method: "POST", headers: { prefer: "return=representation" },
        body: { ...desired, created_by: userId, updated_by: userId, created_at: now, updated_at: now }, transaction
      });
      if (stored?.length !== 1 || stored[0].id !== parsed.id) throw fail("Die Beobachtung wurde nicht eindeutig übernommen.", 409);
      await deps.recordActivityEventInternal(transaction, request, {
        eventKey: "hospitation.updated", entityType: "hospitation_observation", entityId: parsed.id,
        objectLabel: parsed.observation.title, details: { action: "observation.append", hospitationId: parsed.observation.hospitationId }
      });
      return { ok: true, mode: "apply", action: "created", candidateFingerprint: parsed.candidateFingerprint, item: deps.hospitationObservationToDto(stored[0]) };
    });
  };
}
