import crypto from "node:crypto";
import { careSectorForRead, careSectorForWrite } from "./care-sector-model.mjs";

export const HOSPITATION_IMPORT_SCHEMA_VERSION = "hospitation-staging/v1";
export const HOSPITATION_IMPORT_OWNER_REF = "timo-frank";
export const HOSPITATION_IMPORT_CONFIRMATION = "HOSPITATIONEN IMPORTIEREN";

const ENTITY_TYPES = Object.freeze(["organizations", "contacts", "hospitations", "observations"]);
const IMAGE_KEY = /(?:^|_)(?:image|avatar|logo)(?:_|$)/iu;
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/iu;

const ORGANIZATION_FIELDS = Object.freeze([
  "id", "name", "sector", "organizationType", "postalCode", "city", "state",
  "website", "phone", "email", "notes", "source", "status"
]);
const CONTACT_FIELDS = Object.freeze([
  "id", "name", "organizationId", "organization", "sector", "specialty",
  "contactRole", "priority", "postalCode", "city", "state", "email", "phone",
  "linkedin", "topics", "notes", "source", "status"
]);
const HOSPITATION_FIELDS = Object.freeze([
  "id", "contactId", "contactName", "organizationId", "organizationName", "status",
  "startsAt", "endsAt", "location", "city", "state", "sector", "goal", "topics",
  "requestNote", "documentationSummary", "documentationOutcome", "followUpNote",
  "followUpDueAt", "documentedAt"
]);
const OBSERVATION_FIELDS = Object.freeze([
  "id", "hospitationId", "sequence", "title", "situation", "situationContext",
  "description", "observed", "observedAt", "immediateConsequence", "processPhase",
  "problemType", "impact", "observationType", "evidenceType", "relevanceScore",
  "usageRecommendation", "nextUse", "involvedRoles", "affectedRoles",
  "affectedProducts", "topics", "themes", "theme", "sourceType", "sourceReference",
  "uncertainty", "limitations", "source", "settingType", "internalUseAllowed",
  "externalUseAllowed", "status", "createdAt", "updatedAt"
]);

const FIELD_LIMITS = Object.freeze({
  organizations: 500,
  contacts: 1000,
  hospitations: 1000,
  observations: 5000
});

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "invalid_hospitation_manifest";
  return error;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${label} muss ein JSON-Objekt sein.`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    const imageKeys = unexpected.filter((key) => IMAGE_KEY.test(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)));
    if (imageKeys.length) throw validationError(`${label} darf keine Bilder oder Bildreferenzen enthalten.`);
    throw validationError(`${label} enthaelt nicht unterstuetzte Felder: ${unexpected.join(", ")}.`);
  }
}

function text(value, label, { required = false, max = 10000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw validationError(`${label} fehlt.`);
    return undefined;
  }
  if (typeof value !== "string") throw validationError(`${label} muss Text sein.`);
  const normalized = value.trim();
  if (required && !normalized) throw validationError(`${label} darf nicht leer sein.`);
  if (normalized.length > max) throw validationError(`${label} ist zu lang.`);
  return normalized;
}

function id(value, label) {
  const normalized = text(value, label, { required: true, max: 160 });
  if (!ID_PATTERN.test(normalized)) {
    throw validationError(`${label} muss eine stabile ID aus Buchstaben, Zahlen, Punkt, Doppelpunkt, Unterstrich oder Bindestrich sein.`);
  }
  return normalized;
}

function booleanValue(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw validationError(`${label} muss true oder false sein.`);
  return value;
}

function integer(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw validationError(`${label} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  }
  return value;
}

function timestamp(value, label, { required = false } = {}) {
  const normalized = text(value, label, { required, max: 64 });
  if (normalized === undefined || normalized === "") return normalized;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/u.test(normalized)) {
    throw validationError(`${label} muss ein ISO-8601-Zeitstempel sein.`);
  }
  return parsed.toISOString();
}

function dateValue(value, label) {
  const normalized = text(value, label, { max: 10 });
  if (normalized === undefined || normalized === "") return normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))) {
    throw validationError(`${label} muss ein Datum im Format YYYY-MM-DD sein.`);
  }
  return normalized;
}

function textArray(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw validationError(`${label} muss eine Liste mit hoechstens 100 Eintraegen sein.`);
  const result = value.map((item, index) => text(item, `${label}[${index}]`, { required: true, max: 500 }));
  return [...new Set(result)].sort((left, right) => left.localeCompare(right, "de"));
}

function copyText(source, target, key, outputKey = key, max = 10000) {
  if (Object.prototype.hasOwnProperty.call(source, key)) target[outputKey] = text(source[key], `${source.id || "Eintrag"}.${key}`, { max });
}

function normalizeStatus(value, allowed, fallback, label) {
  if (value === undefined) return undefined;
  const normalized = text(value, label, { required: true, max: 32 });
  if (!allowed.includes(normalized)) throw validationError(`${label} hat einen nicht unterstuetzten Status.`);
  return normalized || fallback;
}

function normalizeOrganization(source, index) {
  const label = `organizations[${index}]`;
  assertAllowedKeys(source, ORGANIZATION_FIELDS, label);
  const result = { id: id(source.id, `${label}.id`), name: text(source.name, `${label}.name`, { required: true, max: 500 }) };
  for (const key of ["sector", "organizationType", "postalCode", "city", "state", "website", "phone", "email", "notes", "source"]) {
    copyText(source, result, key, key, key === "notes" ? 30000 : 2000);
  }
  if (Object.prototype.hasOwnProperty.call(result, "sector")) result.sector = careSectorForWrite(result.sector) || "";
  if (Object.prototype.hasOwnProperty.call(source, "status")) result.status = normalizeStatus(source.status, ["active", "archived"], "active", `${label}.status`);
  return result;
}

function normalizeContact(source, index) {
  const label = `contacts[${index}]`;
  assertAllowedKeys(source, CONTACT_FIELDS, label);
  const result = { id: id(source.id, `${label}.id`), name: text(source.name, `${label}.name`, { required: true, max: 500 }) };
  for (const key of ["organizationId", "organization", "sector", "specialty", "contactRole", "priority", "postalCode", "city", "state", "email", "phone", "linkedin", "notes", "source"]) {
    copyText(source, result, key, key, key === "notes" ? 30000 : 2000);
  }
  if (Object.prototype.hasOwnProperty.call(result, "sector")) result.sector = careSectorForWrite(result.sector) || "";
  if (Object.prototype.hasOwnProperty.call(source, "topics")) result.topics = textArray(source.topics, `${label}.topics`);
  if (Object.prototype.hasOwnProperty.call(result, "priority") && !["Hoch", "Mittel", "Niedrig", "Keine / Unbekannt"].includes(result.priority)) {
    throw validationError(`${label}.priority hat einen nicht unterstuetzten Wert.`);
  }
  if (Object.prototype.hasOwnProperty.call(source, "status")) result.status = normalizeStatus(source.status, ["active", "archived"], "active", `${label}.status`);
  return result;
}

function normalizeHospitation(source, index) {
  const label = `hospitations[${index}]`;
  assertAllowedKeys(source, HOSPITATION_FIELDS, label);
  const result = { id: id(source.id, `${label}.id`) };
  for (const key of ["contactId", "contactName", "organizationId", "organizationName", "location", "city", "state", "sector", "goal", "requestNote", "documentationSummary", "documentationOutcome", "followUpNote"]) {
    copyText(source, result, key, key, ["goal", "requestNote", "documentationSummary", "documentationOutcome", "followUpNote"].includes(key) ? 30000 : 2000);
  }
  if (Object.prototype.hasOwnProperty.call(result, "sector")) result.sector = careSectorForWrite(result.sector) || "";
  if (!result.contactId && !result.contactName && !result.organizationId && !result.organizationName) {
    throw validationError(`${label} benoetigt eine Kontakt- oder Organisationsreferenz.`);
  }
  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    result.status = normalizeStatus(source.status, ["Entwurf", "Angefragt", "Angeboten", "Gebucht", "Abgelehnt", "Abgesagt", "Durchgeführt", "Dokumentiert", "Archiviert"], "Angefragt", `${label}.status`);
  }
  result.startsAt = timestamp(source.startsAt, `${label}.startsAt`, { required: true });
  if (Object.prototype.hasOwnProperty.call(source, "endsAt")) result.endsAt = timestamp(source.endsAt, `${label}.endsAt`);
  if (result.endsAt && result.endsAt < result.startsAt) throw validationError(`${label}.endsAt darf nicht vor startsAt liegen.`);
  if (Object.prototype.hasOwnProperty.call(source, "followUpDueAt")) result.followUpDueAt = dateValue(source.followUpDueAt, `${label}.followUpDueAt`);
  if (Object.prototype.hasOwnProperty.call(source, "documentedAt")) result.documentedAt = timestamp(source.documentedAt, `${label}.documentedAt`);
  if (Object.prototype.hasOwnProperty.call(source, "topics")) result.topics = textArray(source.topics, `${label}.topics`);
  return result;
}

function normalizeObservation(source, index) {
  const label = `observations[${index}]`;
  assertAllowedKeys(source, OBSERVATION_FIELDS, label);
  const result = {
    id: id(source.id, `${label}.id`),
    hospitationId: id(source.hospitationId, `${label}.hospitationId`),
    title: text(source.title, `${label}.title`, { required: true, max: 1000 })
  };
  for (const key of [
    "situation", "situationContext", "description", "observed", "observedAt",
    "immediateConsequence", "processPhase", "problemType", "impact", "observationType",
    "evidenceType", "usageRecommendation", "nextUse", "theme", "sourceType",
    "sourceReference", "uncertainty", "limitations", "source", "settingType"
  ]) copyText(source, result, key, key, 50000);
  if (Object.prototype.hasOwnProperty.call(source, "sequence")) result.sequence = integer(source.sequence, `${label}.sequence`, { min: 1, max: 100000 });
  if (Object.prototype.hasOwnProperty.call(source, "relevanceScore")) result.relevanceScore = integer(source.relevanceScore, `${label}.relevanceScore`, { min: 1, max: 5 });
  for (const key of ["involvedRoles", "affectedRoles", "affectedProducts", "topics", "themes"]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = textArray(source[key], `${label}.${key}`);
  }
  for (const key of ["internalUseAllowed", "externalUseAllowed"]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = booleanValue(source[key], `${label}.${key}`);
  }
  if (Object.prototype.hasOwnProperty.call(result, "evidenceType") && !["directly_observed", "reported", "interpreted"].includes(result.evidenceType)) {
    throw validationError(`${label}.evidenceType hat einen nicht unterstuetzten Wert.`);
  }
  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    const status = normalizeStatus(source.status, ["active"], "active", `${label}.status`);
    result.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(source, "createdAt")) result.createdAt = timestamp(source.createdAt, `${label}.createdAt`);
  if (Object.prototype.hasOwnProperty.call(source, "updatedAt")) result.updatedAt = timestamp(source.updatedAt, `${label}.updatedAt`);
  return result;
}

function assertUniqueIds(items, entityType) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw validationError(`${entityType} enthaelt die ID ${item.id} mehrfach.`);
    seen.add(item.id);
  }
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase("de-DE");
}

function normalizeIdentityText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/&/gu, " und ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

const PERSON_HONORIFIC_TOKENS = new Set([
  "dipl", "diplom", "doz", "doktor", "dr", "ing", "med", "pd", "priv",
  "privatdozent", "prof", "professor"
]);

function canonicalPersonName(value) {
  return normalizeIdentityText(value)
    .split(" ")
    .filter((token) => token && !PERSON_HONORIFIC_TOKENS.has(token))
    .join(" ");
}

const ORGANIZATION_GENERIC_TOKENS = new Set([
  "ag", "apotheke", "apotheken", "arztpraxis", "eg", "ev", "gemeinschaftspraxis",
  "gbr", "gmbh", "hausarzt", "hausarztpraxis", "kg", "mbh", "mit", "mvz", "ohg",
  "praxis", "ug", "und"
]);

function organizationIdentityTokens(value) {
  return [...new Set(normalizeIdentityText(value)
    .split(" ")
    .filter((token) => token && !PERSON_HONORIFIC_TOKENS.has(token) && !ORGANIZATION_GENERIC_TOKENS.has(token)))]
    .sort();
}

function canonicalOrganizationName(value) {
  return organizationIdentityTokens(value).join(" ");
}

function sameKnownCity(left, right) {
  const leftCity = normalizeIdentityText(left);
  const rightCity = normalizeIdentityText(right);
  return Boolean(leftCity && rightCity && leftCity === rightCity);
}

function organizationNamesLikelyVariant(left, right) {
  const leftFull = normalizeIdentityText(left);
  const rightFull = normalizeIdentityText(right);
  if (!leftFull || !rightFull) return false;
  if (leftFull === rightFull) return true;
  const leftTokens = organizationIdentityTokens(left);
  const rightTokens = organizationIdentityTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  if (canonicalOrganizationName(left) === canonicalOrganizationName(right)) return true;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token));
  return shared.length === Math.min(leftTokens.length, rightTokens.length)
    && shared.some((token) => token.length >= 5);
}

function assertNoPotentialOrganizationDuplicates(items) {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    const left = items[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const right = items[rightIndex];
      if (!sameKnownCity(left.city, right.city)) continue;
      if (!organizationNamesLikelyVariant(left.name, right.name)) continue;
      throw validationError(`organizations enthaelt moegliche Dubletten in derselben Stadt (${left.id}, ${right.id}).`);
    }
  }
}

function personSurname(value) {
  const tokens = canonicalPersonName(value).split(" ").filter(Boolean);
  return tokens.at(-1) || "";
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (!left || !right || Math.abs(left.length - right.length) > 1) return false;
  let longer = left;
  let shorter = right;
  if (shorter.length > longer.length) [longer, shorter] = [shorter, longer];
  let differences = 0;
  for (let longIndex = 0, shortIndex = 0; longIndex < longer.length; longIndex += 1) {
    if (longer[longIndex] === shorter[shortIndex]) {
      shortIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (longer.length === shorter.length) shortIndex += 1;
  }
  return true;
}

function assertUniqueNaturalKeys(items, entityType, keyFor) {
  const seen = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    if (seen.has(key) && seen.get(key) !== item.id) {
      throw validationError(`${entityType} enthaelt die gleiche fachliche Identitaet unter mehreren IDs (${seen.get(key)}, ${item.id}).`);
    }
    seen.set(key, item.id);
  }
}

export function normalizeHospitationImportManifest(input) {
  assertAllowedKeys(input, ["schemaVersion", "snapshot", "ownerRef", ...ENTITY_TYPES], "manifest");
  if (input.schemaVersion !== HOSPITATION_IMPORT_SCHEMA_VERSION) {
    throw validationError(`schemaVersion muss ${HOSPITATION_IMPORT_SCHEMA_VERSION} sein.`);
  }
  assertAllowedKeys(input.snapshot, ["id", "createdAt", "source"], "manifest.snapshot");
  const snapshot = {
    id: id(input.snapshot.id, "manifest.snapshot.id"),
    createdAt: timestamp(input.snapshot.createdAt, "manifest.snapshot.createdAt", { required: true }),
    source: text(input.snapshot.source, "manifest.snapshot.source", { required: true, max: 64 })
  };
  if (snapshot.source !== "local-hospitation") throw validationError("manifest.snapshot.source muss local-hospitation sein.");
  if (input.ownerRef !== HOSPITATION_IMPORT_OWNER_REF) throw validationError(`manifest.ownerRef muss ${HOSPITATION_IMPORT_OWNER_REF} sein.`);

  const normalized = {
    schemaVersion: HOSPITATION_IMPORT_SCHEMA_VERSION,
    snapshot,
    ownerRef: HOSPITATION_IMPORT_OWNER_REF
  };
  for (const entityType of ENTITY_TYPES) {
    if (!Array.isArray(input[entityType])) throw validationError(`manifest.${entityType} muss eine Liste sein.`);
    if (input[entityType].length > FIELD_LIMITS[entityType]) throw validationError(`manifest.${entityType} enthaelt zu viele Eintraege.`);
  }
  normalized.organizations = input.organizations.map(normalizeOrganization).sort((a, b) => a.id.localeCompare(b.id));
  normalized.contacts = input.contacts.map(normalizeContact).sort((a, b) => a.id.localeCompare(b.id));
  normalized.hospitations = input.hospitations.map(normalizeHospitation).sort((a, b) => a.id.localeCompare(b.id));
  normalized.observations = input.observations.map(normalizeObservation).sort((a, b) => a.id.localeCompare(b.id));
  for (const entityType of ENTITY_TYPES) assertUniqueIds(normalized[entityType], entityType);
  assertUniqueNaturalKeys(normalized.organizations, "organizations", (item) => `${normalizeIdentityText(item.name)}|${normalizeIdentityText(item.city)}`);
  assertNoPotentialOrganizationDuplicates(normalized.organizations);
  assertUniqueNaturalKeys(normalized.contacts, "contacts", (item) => {
    const person = canonicalPersonName(item.name) || normalizeIdentityText(item.name);
    const city = normalizeIdentityText(item.city);
    return city
      ? `${person}|${city}`
      : `${person}|${item.organizationId || canonicalOrganizationName(item.organization)}`;
  });
  const manifestContactsById = new Map(normalized.contacts.map((item) => [item.id, item]));
  const manifestOrganizationsById = new Map(normalized.organizations.map((item) => [item.id, item]));
  assertUniqueNaturalKeys(normalized.hospitations, "hospitations", (item) => {
    const contact = manifestContactsById.get(item.contactId);
    const person = canonicalPersonName(item.contactName || contact?.name);
    if (person) return `${item.startsAt}|person:${person}`;
    const organization = manifestOrganizationsById.get(item.organizationId);
    return `${item.startsAt}|organization:${canonicalOrganizationName(item.organizationName || organization?.name) || item.organizationId || "unknown"}`;
  });
  assertUniqueNaturalKeys(normalized.observations, "observations", (item) => `${item.hospitationId}|${item.sequence || ""}|${normalizeName(item.title)}`);

  const organizationIds = new Set(normalized.organizations.map((item) => item.id));
  const contactIds = new Set(normalized.contacts.map((item) => item.id));
  const hospitationIds = new Set(normalized.hospitations.map((item) => item.id));
  for (const contact of normalized.contacts) {
    if (contact.organizationId && !organizationIds.has(contact.organizationId)) throw validationError(`Kontakt ${contact.id} verweist auf eine nicht im Snapshot enthaltene Organisation.`);
  }
  for (const hospitation of normalized.hospitations) {
    if (hospitation.contactId && !contactIds.has(hospitation.contactId)) throw validationError(`Hospitation ${hospitation.id} verweist auf einen nicht im Snapshot enthaltenen Kontakt.`);
    if (hospitation.organizationId && !organizationIds.has(hospitation.organizationId)) throw validationError(`Hospitation ${hospitation.id} verweist auf eine nicht im Snapshot enthaltene Organisation.`);
  }
  for (const observation of normalized.observations) {
    if (!hospitationIds.has(observation.hospitationId)) throw validationError(`Beobachtung ${observation.id} verweist auf eine nicht im Snapshot enthaltene Hospitation.`);
  }
  return normalized;
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function manifestFingerprint(manifest) {
  return sha256Fingerprint(manifest);
}

export function targetFingerprint(target, ownerProfile) {
  const state = {
    owner: {
      id: ownerProfile?.id || "",
      display_name: ownerProfile?.display_name || "",
      role: ownerProfile?.role || "",
      active: ownerProfile?.active !== false
    }
  };
  for (const entityType of ENTITY_TYPES) {
    const key = entityType === "observations" ? "hospitation_observations" : entityType;
    state[entityType] = [...(target[key] || target[entityType] || [])]
      .map((row) => canonicalValue(row))
      .sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
  }
  state.contactOwners = [...(target.contact_owners || [])]
    .map((row) => canonicalValue(row))
    .sort((left, right) => `${left.contact_id || ""}|${left.profile_id || ""}`.localeCompare(`${right.contact_id || ""}|${right.profile_id || ""}`));
  return sha256Fingerprint(state);
}

function dbText(value) {
  return value === undefined || value === "" ? null : value;
}

function hasImportContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function sparseImportObject(value, omittedKeys = []) {
  const omitted = new Set(["createdAt", "updatedAt", ...omittedKeys]);
  return Object.fromEntries(Object.entries(value || {}).filter(([key, entry]) => !omitted.has(key) && hasImportContent(entry)));
}

function canAdvanceHospitationStatus(currentValue, nextValue) {
  const current = String(currentValue || "").trim();
  const next = String(nextValue || "").trim();
  const terminal = new Set(["Abgelehnt", "Abgesagt", "Archiviert"]);
  const rank = new Map([
    ["Entwurf", 0],
    ["Angefragt", 1],
    ["Angeboten", 2],
    ["Gebucht", 3],
    ["Durchgeführt", 4],
    ["Dokumentiert", 5]
  ]);
  if (!current || !next || terminal.has(current) || terminal.has(next)) return false;
  return rank.has(current) && rank.has(next) && rank.get(next) >= rank.get(current);
}

function desiredOrganization(source, targetId, targetRow = null) {
  const record = { id: targetId, name: source.name, normalized_name: normalizeName(source.name) };
  const mapping = { sector: "sector", organizationType: "organization_type", postalCode: "postal_code", city: "city", state: "federal_state", website: "website", phone: "phone", email: "email", notes: "notes", source: "source", status: "status" };
  for (const [sourceKey, targetKey] of Object.entries(mapping)) {
    if (targetRow && targetKey === "status") continue;
    if (hasImportContent(source[sourceKey])) record[targetKey] = dbText(source[sourceKey]);
  }
  return record;
}

function desiredContact(source, targetId, organizationId, ownerId, targetRow = null) {
  const record = { id: targetId, name: source.name };
  if (!targetRow || !hasImportContent(targetRow.owner_id)) record.owner_id = ownerId;
  const mapping = { organization: "organization", sector: "sector", specialty: "specialty", contactRole: "role", priority: "priority", postalCode: "postal_code", city: "city", state: "federal_state", email: "email", phone: "phone", linkedin: "linkedin", topics: "topics", notes: "notes", source: "source", status: "status" };
  if (hasImportContent(source.organizationId)) record.organization_id = organizationId;
  for (const [sourceKey, targetKey] of Object.entries(mapping)) {
    if (targetRow && targetKey === "status") continue;
    if (hasImportContent(source[sourceKey])) record[targetKey] = Array.isArray(source[sourceKey]) ? source[sourceKey] : dbText(source[sourceKey]);
  }
  return record;
}

function desiredHospitation(source, targetId, contactId, organizationId, ownerId, targetRow = null) {
  const record = {
    id: targetId,
    starts_at: source.startsAt
  };
  if (!targetRow || !hasImportContent(targetRow.owner_id)) record.owner_id = ownerId;
  if (!targetRow) record.requester_profile_id = ownerId;
  const mapping = { contactName: "contact_name", organizationName: "organization_name", status: "status", endsAt: "ends_at", location: "location", city: "city", state: "federal_state", sector: "sector", goal: "goal", topics: "topics", requestNote: "request_note", documentationSummary: "documentation_summary", documentationOutcome: "documentation_outcome", followUpNote: "follow_up_note", followUpDueAt: "follow_up_due_at", documentedAt: "documented_at" };
  if (hasImportContent(source.contactId)) record.contact_id = contactId;
  if (hasImportContent(source.organizationId)) record.organization_id = organizationId;
  for (const [sourceKey, targetKey] of Object.entries(mapping)) {
    if (targetRow && targetKey === "status" && !canAdvanceHospitationStatus(targetRow.status, source[sourceKey])) continue;
    if (hasImportContent(source[sourceKey])) record[targetKey] = Array.isArray(source[sourceKey]) ? source[sourceKey] : dbText(source[sourceKey]);
  }
  if (!targetRow && (record.documented_at || record.status === "Dokumentiert")) record.documented_by = ownerId;
  return record;
}

function desiredObservation(source, targetId, hospitationId, targetRow = null) {
  const record = {
    id: targetId,
    hospitation_id: hospitationId,
    title: source.title,
    payload: {
      ...(targetRow?.payload && typeof targetRow.payload === "object" && !Array.isArray(targetRow.payload) ? targetRow.payload : {}),
      ...sparseImportObject(source, targetRow ? ["status"] : [])
    }
  };
  if (hasImportContent(source.situation) || hasImportContent(source.situationContext)) record.situation = dbText(source.situation || source.situationContext);
  if (hasImportContent(source.description) || hasImportContent(source.observed)) record.description = dbText(source.description || source.observed);
  const scalarMapping = {
    processPhase: "process_phase",
    problemType: "problem_type",
    impact: "impact",
    observationType: "observation_type",
    evidenceType: "evidence_type",
    relevanceScore: "relevance_score"
  };
  for (const [sourceKey, targetKey] of Object.entries(scalarMapping)) {
    if (hasImportContent(source[sourceKey])) record[targetKey] = sourceKey === "relevanceScore" ? source[sourceKey] : dbText(source[sourceKey]);
  }
  if (hasImportContent(source.usageRecommendation) || hasImportContent(source.nextUse)) record.usage_recommendation = dbText(source.usageRecommendation || source.nextUse);
  if (hasImportContent(source.involvedRoles) || hasImportContent(source.affectedRoles)) record.involved_roles = source.involvedRoles?.length ? source.involvedRoles : source.affectedRoles;
  if (hasImportContent(source.affectedProducts)) record.affected_products = source.affectedProducts;
  if (hasImportContent(source.topics) || hasImportContent(source.themes)) record.topics = source.topics?.length ? source.topics : source.themes;
  if (hasImportContent(source.sequence)) record.sequence = source.sequence;
  if (!targetRow && source.status === "active") {
    record.status = "active";
  }
  return record;
}

function comparable(value) {
  if (value === undefined || value === "") return null;
  return canonicalValue(value);
}

function changedFields(current, desired) {
  return Object.keys(desired)
    .filter((key) => key !== "id" && canonicalJson(comparable(current?.[key])) !== canonicalJson(comparable(desired[key])))
    .sort();
}

function indexRows(rows, keyFor) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFor(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function canonicalTargetTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function conflictItem(entityType, source, code, message, label, reference = "") {
  return { entityType, sourceId: source.id, targetId: "", action: "conflict", reference, label, changedFields: [], code, message, source, record: null, current: null };
}

function plannedItem(entityType, source, targetRow, targetId, record, label, reference = "") {
  const fields = targetRow ? changedFields(targetRow, record) : Object.keys(record).filter((key) => key !== "id").sort();
  return {
    entityType,
    sourceId: source.id,
    targetId,
    action: targetRow ? (fields.length ? "update" : "unchanged") : "create",
    reference,
    label,
    changedFields: fields,
    source,
    record,
    current: targetRow || null
  };
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const idValue = String(row?.id || "");
    if (!idValue || seen.has(idValue)) return false;
    seen.add(idValue);
    return true;
  });
}

function candidateForRows(source, byId, candidateRows) {
  const candidates = uniqueRows(candidateRows);
  if (byId.has(source.id)) {
    const row = byId.get(source.id);
    if (candidates.some((candidate) => candidate.id !== row.id)) {
      return { row: null, conflict: true, code: "natural_key_owned_by_other_id" };
    }
    return { row, conflict: false };
  }
  if (candidates.length > 1) return { row: null, conflict: true, code: "ambiguous_target" };
  return { row: candidates[0] || null, conflict: false };
}

function candidateConflictMessage(result, ambiguousMessage, occupiedMessage) {
  return result.code === "natural_key_owned_by_other_id" ? occupiedMessage : ambiguousMessage;
}

function exactIdFirst(items, targetById) {
  return [...items].sort((left, right) => {
    const leftExact = targetById.has(left.id) ? 0 : 1;
    const rightExact = targetById.has(right.id) ? 0 : 1;
    return leftExact - rightExact || left.id.localeCompare(right.id);
  });
}

function publicItem(item) {
  return {
    entityType: item.entityType,
    sourceId: item.sourceId,
    targetId: item.targetId,
    action: item.action,
    changedFields: item.changedFields
  };
}

function summarize(items) {
  const counts = { total: items.length, create: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const item of items) counts[item.action] += 1;
  return counts;
}

function organizationCandidatesFor(source, rows) {
  const sourceName = normalizeIdentityText(source.name);
  const sourceCity = normalizeIdentityText(source.city);
  const sourceSector = normalizeIdentityText(careSectorForRead(source.sector));
  return uniqueRows((rows || []).filter((row) => {
    const targetName = normalizeIdentityText(row.normalized_name || row.name);
    const targetCity = normalizeIdentityText(row.city);
    const targetSector = normalizeIdentityText(careSectorForRead(row.sector));
    if (sourceSector && targetSector && sourceSector !== targetSector) return false;
    if (sourceCity && targetCity && sourceCity !== targetCity) return false;
    if (sourceName && sourceName === targetName) return true;
    return sameKnownCity(source.city, row.city) && organizationNamesLikelyVariant(source.name, row.name);
  }));
}

function contactOrganizationMatches(source, organizationId, row) {
  if (organizationId && row.organization_id) return organizationId === row.organization_id;
  const sourceOrganization = source.organization;
  const targetOrganization = row.organization;
  return Boolean(sourceOrganization && targetOrganization && organizationNamesLikelyVariant(sourceOrganization, targetOrganization));
}

function contactExactCandidatesFor(source, organizationId, rows) {
  const sourcePerson = canonicalPersonName(source.name);
  const sourceCity = normalizeIdentityText(source.city);
  if (!sourcePerson) return [];
  return uniqueRows((rows || []).filter((row) => {
    if (canonicalPersonName(row.name) !== sourcePerson) return false;
    const targetCity = normalizeIdentityText(row.city);
    if (sourceCity && targetCity) return sourceCity === targetCity;
    return contactOrganizationMatches(source, organizationId, row)
      || (!sourceCity && !targetCity && !organizationId && !source.organization && !row.organization_id && !row.organization);
  }));
}

function contactPotentialDuplicateCandidatesFor(source, organizationId, rows) {
  const sourcePerson = canonicalPersonName(source.name);
  const sourceLastName = personSurname(source.name);
  if (!sourcePerson || !sourceLastName) return [];
  return uniqueRows((rows || []).filter((row) => {
    const targetPerson = canonicalPersonName(row.name);
    if (!targetPerson || targetPerson === sourcePerson) return false;
    if (!sameKnownCity(source.city, row.city)) return false;
    if (!contactOrganizationMatches(source, organizationId, row)) return false;
    return editDistanceAtMostOne(sourceLastName, personSurname(row.name));
  }));
}

function hospitationCandidatesFor(source, contactId, organizationId, sourceContact, rows, targetContactsById) {
  const timestamp = canonicalTargetTimestamp(source.startsAt);
  const sourcePerson = canonicalPersonName(source.contactName || sourceContact?.name);
  const sourceOrganization = canonicalOrganizationName(source.organizationName);
  return uniqueRows((rows || []).filter((row) => {
    if (canonicalTargetTimestamp(row.starts_at) !== timestamp) return false;
    if (contactId && row.contact_id === contactId) return true;
    const targetContact = targetContactsById.get(String(row.contact_id || ""));
    const targetPerson = canonicalPersonName(targetContact?.name || row.contact_name);
    if (sourcePerson && targetPerson) return sourcePerson === targetPerson;
    if (sourcePerson || targetPerson) return false;
    if (organizationId && row.organization_id) return organizationId === row.organization_id;
    const targetOrganization = canonicalOrganizationName(row.organization_name);
    return Boolean(sourceOrganization && targetOrganization && sourceOrganization === targetOrganization);
  }));
}

export function buildHospitationImportPlan(manifest, target, ownerProfile) {
  const rows = {
    organizations: target.organizations || [],
    contacts: target.contacts || [],
    hospitations: target.hospitations || [],
    observations: target.hospitation_observations || target.observations || []
  };
  const byId = Object.fromEntries(ENTITY_TYPES.map((type) => [type, new Map(rows[type].map((row) => [String(row.id), row]))]));
  const natural = {
    observations: indexRows(rows.observations, (row) => `${row.hospitation_id}|${row.sequence || ""}|${normalizeName(row.title)}`)
  };
  const items = { organizations: [], contacts: [], hospitations: [], observations: [] };
  const mappings = { organizations: new Map(), contacts: new Map(), hospitations: new Map() };
  const claimedTargetIds = { organizations: new Map(), contacts: new Map(), hospitations: new Map() };
  const contactOwnerRelations = new Set((target.contact_owners || []).map((row) => `${row.contact_id}|${row.profile_id}`));
  const manifestContactsById = new Map(manifest.contacts.map((row) => [String(row.id), row]));
  const targetContactsById = new Map(rows.contacts.map((row) => [String(row.id), row]));

  for (const source of exactIdFirst(manifest.organizations, byId.organizations)) {
    const result = candidateForRows(source, byId.organizations, organizationCandidatesFor(source, rows.organizations));
    if (result.conflict) {
      items.organizations.push(conflictItem("organization", source, result.code || "ambiguous_target", candidateConflictMessage(result, "Mehrere Produktionsorganisationen passen zu diesem Eintrag.", "Die fachliche Organisationsidentitaet ist bereits einer anderen Produktions-ID zugeordnet."), source.name));
      continue;
    }
    const targetId = result.row?.id || source.id;
    if (claimedTargetIds.organizations.has(targetId)) {
      items.organizations.push(conflictItem("organization", source, "duplicate_target_mapping", `Die Zielorganisation ${targetId} ist bereits dem Snapshot-Eintrag ${claimedTargetIds.organizations.get(targetId)} zugeordnet.`, source.name));
      continue;
    }
    claimedTargetIds.organizations.set(targetId, source.id);
    mappings.organizations.set(source.id, targetId);
    items.organizations.push(plannedItem("organization", source, result.row, targetId, desiredOrganization(source, targetId, result.row), source.name));
  }

  for (const source of exactIdFirst(manifest.contacts, byId.contacts)) {
    const organizationId = source.organizationId ? mappings.organizations.get(source.organizationId) : "";
    if (source.organizationId && !organizationId) {
      items.contacts.push(conflictItem("contact", source, "organization_conflict", "Die referenzierte Organisation ist nicht eindeutig importierbar.", source.name, source.organizationId));
      continue;
    }
    const exactCandidates = contactExactCandidatesFor(source, organizationId, rows.contacts);
    const potentialDuplicateCandidates = contactPotentialDuplicateCandidatesFor(source, organizationId, rows.contacts);
    if (!exactCandidates.length && potentialDuplicateCandidates.length) {
      items.contacts.push(conflictItem(
        "contact",
        source,
        "potential_duplicate_contact",
        potentialDuplicateCandidates.length > 1
          ? "Mehrere aehnliche Produktionskontakte derselben Organisation und Stadt muessen vor dem Import eindeutig zugeordnet werden."
          : "Ein aehnlicher Produktionskontakt derselben Organisation und Stadt muss vor dem Import geprueft und eindeutig zugeordnet werden.",
        source.name,
        source.organizationId || source.organization || ""
      ));
      continue;
    }
    const result = candidateForRows(source, byId.contacts, exactCandidates);
    if (result.conflict) {
      items.contacts.push(conflictItem("contact", source, result.code || "ambiguous_target", candidateConflictMessage(result, "Mehrere Produktionskontakte passen zu diesem Eintrag.", "Die fachliche Kontaktidentitaet ist bereits einer anderen Produktions-ID zugeordnet."), source.name, source.organizationId || source.organization || ""));
      continue;
    }
    const targetId = result.row?.id || source.id;
    if (claimedTargetIds.contacts.has(targetId)) {
      items.contacts.push(conflictItem("contact", source, "duplicate_target_mapping", `Der Zielkontakt ${targetId} ist bereits dem Snapshot-Eintrag ${claimedTargetIds.contacts.get(targetId)} zugeordnet.`, source.name, source.organizationId || source.organization || ""));
      continue;
    }
    claimedTargetIds.contacts.set(targetId, source.id);
    mappings.contacts.set(source.id, targetId);
    const item = plannedItem("contact", source, result.row, targetId, desiredContact(source, targetId, organizationId, ownerProfile.id, result.row), source.name, source.organizationId || source.organization || "");
    item.ensureOwnerRelation = !contactOwnerRelations.has(`${targetId}|${ownerProfile.id}`);
    if (item.ensureOwnerRelation && item.action === "unchanged") {
      item.action = "update";
      item.changedFields = ["ownerIds"];
    } else if (item.ensureOwnerRelation && !item.changedFields.includes("ownerIds")) {
      item.changedFields = [...item.changedFields, "ownerIds"].sort();
    }
    items.contacts.push(item);
  }

  for (const source of exactIdFirst(manifest.hospitations, byId.hospitations)) {
    const contactId = source.contactId ? mappings.contacts.get(source.contactId) : "";
    const organizationId = source.organizationId ? mappings.organizations.get(source.organizationId) : "";
    if ((source.contactId && !contactId) || (source.organizationId && !organizationId)) {
      items.hospitations.push(conflictItem("hospitation", source, "reference_conflict", "Kontakt oder Organisation der Hospitation ist nicht eindeutig importierbar.", source.contactName || source.organizationName || source.id));
      continue;
    }
    const result = candidateForRows(
      source,
      byId.hospitations,
      hospitationCandidatesFor(
        source,
        contactId,
        organizationId,
        manifestContactsById.get(String(source.contactId || "")),
        rows.hospitations,
        targetContactsById
      )
    );
    if (result.conflict) {
      items.hospitations.push(conflictItem("hospitation", source, result.code || "ambiguous_target", candidateConflictMessage(result, "Mehrere Produktionstermine passen zu diesem Eintrag.", "Die fachliche Terminidentitaet ist bereits einer anderen Produktions-ID zugeordnet."), source.contactName || source.organizationName || source.id));
      continue;
    }
    const targetId = result.row?.id || source.id;
    if (claimedTargetIds.hospitations.has(targetId)) {
      items.hospitations.push(conflictItem("hospitation", source, "duplicate_target_mapping", `Der Zieltermin ${targetId} ist bereits dem Snapshot-Eintrag ${claimedTargetIds.hospitations.get(targetId)} zugeordnet.`, source.contactName || source.organizationName || source.id, source.startsAt));
      continue;
    }
    claimedTargetIds.hospitations.set(targetId, source.id);
    mappings.hospitations.set(source.id, targetId);
    items.hospitations.push(plannedItem("hospitation", source, result.row, targetId, desiredHospitation(source, targetId, contactId, organizationId, ownerProfile.id, result.row), source.contactName || source.organizationName || source.id, source.startsAt));
  }

  for (const source of manifest.observations) {
    const hospitationId = mappings.hospitations.get(source.hospitationId);
    if (!hospitationId) {
      items.observations.push(conflictItem("observation", source, "hospitation_conflict", "Die referenzierte Hospitation ist nicht eindeutig importierbar.", source.title, source.hospitationId));
      continue;
    }
    const naturalKey = `${hospitationId}|${source.sequence || ""}|${normalizeName(source.title)}`;
    const sameId = byId.observations.get(source.id) || null;
    const naturalCandidates = natural.observations.get(naturalKey) || [];
    if (sameId && naturalCandidates.some((candidate) => candidate.id !== sameId.id)) {
      items.observations.push(conflictItem("observation", source, "natural_key_owned_by_other_id", "Die gewuenschte Kombination aus Hospitation, Reihenfolge und Bezeichnung ist bereits einer anderen stabilen Beobachtungs-ID zugeordnet.", source.title, source.hospitationId));
      continue;
    }
    if (!sameId && naturalCandidates.length) {
      items.observations.push(conflictItem("observation", source, "natural_key_owned_by_other_id", "Eine Beobachtung mit gleicher Hospitation, Reihenfolge und Bezeichnung existiert bereits unter einer anderen stabilen ID.", source.title, source.hospitationId));
      continue;
    }
    if (sameId && sameId.hospitation_id !== hospitationId) {
      items.observations.push(conflictItem("observation", source, "id_owned_by_other_hospitation", "Die Beobachtungs-ID gehoert bereits zu einer anderen Hospitation.", source.title, source.hospitationId));
      continue;
    }
    const targetId = sameId?.id || source.id;
    items.observations.push(plannedItem("observation", source, sameId, targetId, desiredObservation(source, targetId, hospitationId, sameId), source.title, source.hospitationId));
  }

  const summary = {};
  for (const entityType of ENTITY_TYPES) summary[entityType] = summarize(items[entityType]);
  summary.total = summarize(ENTITY_TYPES.flatMap((entityType) => items[entityType]));
  const conflicts = ENTITY_TYPES.flatMap((entityType) => items[entityType])
    .filter((item) => item.action === "conflict")
    .map((item) => ({ entityType: item.entityType, sourceId: item.sourceId, code: item.code, message: item.message }));
  return {
    manifest,
    ownerProfile,
    summary,
    items,
    publicItems: Object.fromEntries(ENTITY_TYPES.map((entityType) => [entityType, items[entityType].map(publicItem)])),
    conflicts,
    canApply: conflicts.length === 0 && summary.total.create + summary.total.update > 0
  };
}

export function importRunIdForManifest(manifest) {
  return `hospitation-staging-${manifestFingerprint(manifest).slice("sha256:".length, "sha256:".length + 40)}`;
}
