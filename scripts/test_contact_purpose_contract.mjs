import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const api = fs.readFileSync(new URL("api/server.mjs", root), "utf8");
const preSchema = fs.readFileSync(new URL("deploy/postgres/pre-gematik/schema.sql", root), "utf8");
const preMigration = fs.readFileSync(
  new URL("deploy/postgres/pre-gematik/migrations/202607270002_add_contact_relationship_basis_and_ehc_consent.sql", root),
  "utf8"
);
const preGrants = fs.readFileSync(new URL("deploy/postgres/pre-gematik/grants.sql", root), "utf8");
const supabaseSchema = fs.readFileSync(new URL("supabase/schema.sql", root), "utf8");
const supabaseMigration = fs.readFileSync(
  new URL("supabase/migrations/20260727000200_add_contact_relationship_basis_and_ehc_consent.sql", root),
  "utf8"
);
const syntheticSeedGenerator = fs.readFileSync(
  new URL("scripts/generate_pre_gematik_synthetic_seed.mjs", root),
  "utf8"
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Startmarke fehlt: ${startMarker}`);
  assert.ok(end > start, `Endmarke fehlt: ${endMarker}`);
  return source.slice(start, end);
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Funktion fehlt: ${name}`);
  const next = source.indexOf("\nfunction ", start + 10);
  assert.ok(next > start, `Funktionsende fehlt: ${name}`);
  return source.slice(start, next);
}

const validationErrorSource = functionSource(api, "validationError");
const purposeRulesSource = sourceBetween(
  api,
  "const MITMACHEN_CONSENT_STATUSES",
  "function contactPatchToDb("
);
const validationContext = vm.createContext({});
vm.runInContext([
  validationErrorSource,
  purposeRulesSource,
  "globalThis.validateRelationshipBasisForTest = validateRelationshipBasis;",
  "globalThis.validateMitmachenConsentForTest = validateMitmachenConsent;",
  "globalThis.validateEhcConsentForTest = validateEhcConsent;"
].join("\n"), validationContext, { filename: "contact-purpose-validation-contract.js" });

const validateRelationshipBasis = validationContext.validateRelationshipBasisForTest;
const validateMitmachenConsent = validationContext.validateMitmachenConsentForTest;
const validateEhcConsent = validationContext.validateEhcConsentForTest;

assert.doesNotThrow(() => validateRelationshipBasis({ relationship_basis: "review_required" }));
assert.doesNotThrow(() => validateRelationshipBasis({
  relationship_basis: "verbal_contact",
  relationship_basis_effective_at: "2026-01-10T10:00:00.000Z",
  relationship_basis_recorded_by: "profile-owner",
  relationship_basis_note: "Persönliches Gespräch auf dem Fachkongress."
}));
assert.throws(
  () => validateRelationshipBasis({ relationship_basis: "active_collaboration" }),
  /Zeitpunkt und erfassende Person/i
);
assert.throws(
  () => validateRelationshipBasis({
    relationship_basis: "verbal_contact",
    relationship_basis_effective_at: "2026-01-10T10:00:00.000Z",
    relationship_basis_recorded_by: "profile-owner"
  }),
  /Nachweisvermerk/i
);
assert.throws(
  () => validateRelationshipBasis({
    relationship_basis: "public_professional_source",
    relationship_basis_effective_at: "2099-01-10T10:00:00.000Z",
    relationship_basis_recorded_by: "profile-owner"
  }),
  /Zukunft/i
);

const validEhcGrant = {
  ehc_consent_status: "granted",
  ehc_consent_effective_at: "2026-01-10T10:00:00.000Z",
  ehc_consent_recorded_by: "profile-owner"
};
assert.doesNotThrow(() => validateEhcConsent({
  ...validEhcGrant,
  ehc_consent_source: "survalyzer_ehc"
}));
assert.throws(
  () => validateEhcConsent({ ...validEhcGrant, ehc_consent_source: "manual_transfer" }),
  /Nachweisvermerk/i
);
assert.throws(
  () => validateEhcConsent({
    ehc_consent_status: "withdrawn",
    ehc_consent_effective_at: ""
  }),
  /gültige[nr] Zeitpunkt/i
);
assert.throws(
  () => validateMitmachenConsent({
    mitmachen_consent_status: "not_requested",
    mitmachen_consent_effective_at: "kein-zeitpunkt"
  }),
  /gültiger Wirksamkeitszeitpunkt/i
);

const mappingSource = sourceBetween(api, "function contactPatchToDb(", "function generatedId(");
const mappingContext = vm.createContext({
  careSectorForWrite: (value) => value || null,
  normalizePriority: (value) => value || "Mittel",
  ownerIdsFromContact: () => [],
  splitList: (value) => Array.isArray(value)
    ? value
    : String(value || "").split(";").map((item) => item.trim()).filter(Boolean)
});
vm.runInContext([
  validationErrorSource,
  purposeRulesSource,
  mappingSource,
  "globalThis.contactPatchToDbForTest = contactPatchToDb;",
  "globalThis.contactCreateToDbForTest = contactCreateToDb;"
].join("\n"), mappingContext, { filename: "contact-purpose-mapping-contract.js" });
const mappedPatch = JSON.parse(JSON.stringify(mappingContext.contactPatchToDbForTest({
  relationshipBasis: "verbal_contact",
  relationshipBasisEffectiveAt: "2026-01-10T10:00:00.000Z",
  relationshipBasisRecordedBy: "client-value",
  relationshipBasisNote: "Fachkongress",
  ehcConsentStatus: "granted",
  ehcConsentEffectiveAt: "2026-01-10T10:00:00.000Z",
  ehcConsentSource: "survalyzer_ehc",
  ehcConsentTextVersion: "ehc-v1",
  ehcConsentRecordedBy: "client-value",
  ehcConsentNote: "Nachweis"
})));
assert.equal(mappedPatch.relationship_basis, "verbal_contact");
assert.equal(mappedPatch.ehc_consent_status, "granted");
assert.equal(mappedPatch.ehc_consent_source, "survalyzer_ehc");
const mappedCreate = JSON.parse(JSON.stringify(mappingContext.contactCreateToDbForTest({ name: "Synthetischer Kontakt" })));
assert.equal(mappedCreate.relationship_basis, "review_required");
assert.equal(mappedCreate.mitmachen_consent_status, "not_requested");
assert.equal(mappedCreate.ehc_consent_status, "not_requested");

const projectionSource = sourceBetween(api, "function isEhcOnlyContact(", "function uniqueIds(");
const projectionContext = vm.createContext({
  roleRank: (role) => ({ viewer: 1, editor: 2, admin: 3 }[String(role || "")] || 0),
  userIdFromToken: (request) => request.currentProfile?.id || "",
  uniqueIds: (values = []) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
});
vm.runInContext([
  projectionSource,
  "globalThis.projectContactForRequestForTest = projectContactForRequest;"
].join("\n"), projectionContext, { filename: "contact-purpose-projection-contract.js" });
const projectContactForRequest = projectionContext.projectContactForRequestForTest;
const rawEhcOnly = {
  id: "contact-ehc",
  ehc_consent_status: "granted",
  mitmachen_consent_status: "not_requested"
};
const fullContact = {
  id: "contact-ehc",
  name: "Erika Mustermann",
  organizationId: "organization-1",
  organization: "Beispielklinik",
  city: "Berlin",
  email: "erika@example.invalid",
  phone: "+49 30 123",
  relationshipBasis: "active_collaboration",
  relationshipBasisEffectiveAt: "2026-01-10T10:00:00.000Z",
  relationshipBasisRecordedBy: "profile-owner",
  relationshipBasisNote: "Projektkontakt",
  mitmachenConsentStatus: "not_requested",
  mitmachenConsentSource: "manual_transfer",
  ehcConsentStatus: "granted",
  ehcConsentEffectiveAt: "2026-01-10T10:00:00.000Z",
  ehcConsentSource: "survalyzer_ehc",
  ehcConsentRecordedBy: "profile-owner",
  ehcConsentNote: "Importnachweis",
  themes: ["E-Rezept"],
  note: "Interne Notiz",
  sources: ["CRM-Import"],
  image: "/api/contact-images/contact-ehc"
};
const viewerRequest = { currentProfile: { id: "profile-viewer", role: "viewer" } };
const ownerRequest = { currentProfile: { id: "profile-owner", role: "editor" } };
const adminRequest = { currentProfile: { id: "profile-admin", role: "admin" } };
const restricted = projectContactForRequest(viewerRequest, fullContact, rawEhcOnly, ["profile-owner"]);
assert.equal(restricted.name, "Geschützter EHC-Kontakt");
assert.equal(restricted.profileAccess, "ehc_restricted");
assert.equal(restricted.relationshipBasis, "active_collaboration");
assert.equal(restricted.ehcConsentStatus, "granted");
for (const field of [
  "organization", "city", "email", "phone", "note", "image",
  "relationshipBasisEffectiveAt", "relationshipBasisRecordedBy", "relationshipBasisNote",
  "mitmachenConsentSource", "ehcConsentEffectiveAt", "ehcConsentSource",
  "ehcConsentRecordedBy", "ehcConsentNote"
]) {
  assert.equal(restricted[field], "", `Der EHC-Stub darf ${field} nicht offenlegen.`);
}
assert.deepEqual(JSON.parse(JSON.stringify(restricted.themes)), []);
assert.equal(
  projectContactForRequest(ownerRequest, fullContact, rawEhcOnly, ["profile-owner"]).profileAccess,
  "ehc_authorized"
);
assert.equal(
  projectContactForRequest(adminRequest, fullContact, rawEhcOnly, []).name,
  "Erika Mustermann"
);
for (const ehcStatus of ["withdrawn", "not_requested"]) {
  const rawHistoricalEhc = {
    ...rawEhcOnly,
    ehc_consent_status: ehcStatus,
    ehc_consent_source: "survalyzer_ehc",
    ehc_consent_effective_at: "2026-02-10T10:00:00.000Z"
  };
  const historicalEhcContact = {
    ...fullContact,
    ehcConsentStatus: ehcStatus
  };
  const historicalProjection = projectContactForRequest(
    viewerRequest,
    historicalEhcContact,
    rawHistoricalEhc,
    ["profile-owner"]
  );
  assert.equal(
    historicalProjection.profileAccess,
    "ehc_restricted",
    `Der EHC-Profilschutz muss nach Status ${ehcStatus} erhalten bleiben.`
  );
  assert.equal(historicalProjection.name, "Geschützter EHC-Kontakt");
  assert.equal(historicalProjection.email, "");
}
const verbalMitmachenProjection = projectContactForRequest(
  viewerRequest,
  {
    ...fullContact,
    mitmachenConsentStatus: "granted",
    mitmachenConsentSource: "verbal_confirmed"
  },
  {
    ...rawEhcOnly,
    mitmachen_consent_status: "granted",
    mitmachen_consent_source: "verbal_confirmed"
  },
  ["profile-owner"]
);
assert.equal(
  verbalMitmachenProjection.profileAccess,
  "ehc_restricted",
  "Eine nur mündliche #Mitmachen-Angabe darf den EHC-Profilschutz nicht aufheben."
);
const writtenMitmachenProjection = projectContactForRequest(
  viewerRequest,
  {
    ...fullContact,
    mitmachenConsentStatus: "granted",
    mitmachenConsentSource: "written"
  },
  {
    ...rawEhcOnly,
    mitmachen_consent_status: "granted",
    mitmachen_consent_source: "written"
  },
  ["profile-owner"]
);
assert.equal(
  writtenMitmachenProjection.profileAccess,
  "standard",
  "Eine schriftlich belegte #Mitmachen-Einwilligung darf den EHC-only-Schutz ablösen."
);

const activityVisibilitySource = sourceBetween(
  api,
  "function activityRowVisibleToRequest(",
  "async function assertContactHistoryVisible("
);
vm.runInContext([
  activityVisibilitySource,
  "globalThis.activityRowVisibleToRequestForTest = activityRowVisibleToRequest;"
].join("\n"), projectionContext, { filename: "contact-purpose-activity-visibility-contract.js" });
const activityRowVisibleToRequest = projectionContext.activityRowVisibleToRequestForTest;
const sensitiveActivityRow = {
  id: "change-secret",
  contact_id: "contact-ehc",
  field_name: "ehc_consent_note",
  new_value: "Vertraulicher Nachweis",
  contacts: {
    ...rawEhcOnly,
    owner_id: "profile-owner",
    owner_ids: ["profile-owner"],
    status: "active",
    name: "Erika Mustermann"
  }
};
assert.equal(activityRowVisibleToRequest(sensitiveActivityRow, viewerRequest), false);
assert.equal(activityRowVisibleToRequest(sensitiveActivityRow, ownerRequest), true);
assert.equal(activityRowVisibleToRequest(sensitiveActivityRow, adminRequest), true);
assert.equal(activityRowVisibleToRequest({
  ...sensitiveActivityRow,
  contact_id: "",
  _visibility_contact_id: "contact-ehc"
}, viewerRequest), false);

const pagingSource = sourceBetween(api, "function createPagedActivitySource(", "async function nextMergedActivity(");
const pagingContext = vm.createContext({
  ACTIVITY_PAGE_SIZE: 500,
  activityMatchesFilters: () => true
});
vm.runInContext([
  pagingSource,
  "globalThis.createPagedActivitySourceForTest = createPagedActivitySource;",
  "globalThis.ensureActivitySourceHeadForTest = ensureActivitySourceHead;"
].join("\n"), pagingContext, { filename: "contact-purpose-activity-paging-contract.js" });
let normalizationCount = 0;
const hiddenSource = pagingContext.createPagedActivitySourceForTest({
  loadPage: async () => [sensitiveActivityRow],
  normalize: () => {
    normalizationCount += 1;
    return { title: "Darf nie entstehen" };
  },
  rawVisible: (row) => activityRowVisibleToRequest(row, viewerRequest),
  filters: {}
});
assert.equal(await pagingContext.ensureActivitySourceHeadForTest(hiddenSource), null);
assert.equal(normalizationCount, 0, "Geschützte Rohzeilen müssen vor der DTO-Bildung verworfen werden.");

const historyGuardSource = sourceBetween(
  api,
  "async function assertContactHistoryVisible(",
  "function normalizedActivityFilterSignature("
);
const historyContext = vm.createContext({
  URLSearchParams,
  roleRank: (role) => ({ viewer: 1, editor: 2, admin: 3 }[String(role || "")] || 0),
  cloudSqlRest: async () => [{
    id: "contact-ehc",
    owner_id: "profile-owner",
    status: "active",
    mitmachen_consent_status: "not_requested",
    ehc_consent_status: "granted"
  }],
  assertEhcContactAccess: async (request) => {
    if (request.currentProfile?.id !== "profile-owner" && request.currentProfile?.role !== "admin") {
      throw Object.assign(new Error("Kontakt wurde nicht gefunden."), { status: 404 });
    }
  }
});
vm.runInContext([
  historyGuardSource,
  "globalThis.assertContactHistoryVisibleForTest = assertContactHistoryVisible;"
].join("\n"), historyContext, { filename: "contact-purpose-history-contract.js" });
await assert.rejects(
  () => historyContext.assertContactHistoryVisibleForTest(viewerRequest, "contact-ehc"),
  (error) => error?.status === 404
);
await assert.doesNotReject(
  () => historyContext.assertContactHistoryVisibleForTest(ownerRequest, "contact-ehc")
);

for (const field of [
  "relationship_basis",
  "relationship_basis_effective_at",
  "relationship_basis_recorded_by",
  "relationship_basis_note",
  "ehc_consent_status",
  "ehc_consent_effective_at",
  "ehc_consent_source",
  "ehc_consent_text_version",
  "ehc_consent_recorded_by",
  "ehc_consent_note"
]) {
  for (const [label, source] of [
    ["API", api],
    ["Pre-gematik-Schema", preSchema],
    ["Pre-gematik-Migration", preMigration],
    ["Supabase-Schema", supabaseSchema],
    ["Supabase-Migration", supabaseMigration]
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `${label} fehlt: ${field}`);
  }
}

for (const sql of [preSchema, preMigration, supabaseSchema, supabaseMigration]) {
  assert.match(sql, /relationship_basis[^;]*default 'review_required'/is);
  assert.match(sql, /ehc_consent_status[^;]*default 'not_requested'/is);
  assert.match(sql, /survalyzer_ehc/i);
  assert.match(sql, /contacts_relationship_basis_verbal_note_check/i);
  assert.match(sql, /contacts_ehc_required_fields_check/i);
  assert.match(sql, /contacts_ehc_evidence_note_check/i);
  assert.match(sql, /new\.relationship_basis_recorded_by\s*:=\s*new\.updated_by/i);
  assert.match(sql, /new\.ehc_consent_recorded_by\s*:=\s*new\.updated_by/i);
}
for (const migration of [preMigration, supabaseMigration]) {
  assert.doesNotMatch(
    migration,
    /update\s+public\.contacts[\s\S]*?ehc_consent_status/i,
    "Bestehende Kontakte dürfen nicht automatisch als EHC klassifiziert werden."
  );
}
assert.match(preGrants, /grant execute on function public\.pre_gematik_prepare_contact_purpose_write\(\)/i);
assert.match(preGrants, /grant execute on function public\.pre_gematik_log_contact_purpose_change\(\)/i);

for (const sql of [supabaseSchema, supabaseMigration]) {
  assert.match(sql, /function public\.can_access_ehc_contact\(target_contact_id text\)/i);
  assert.match(sql, /contact\.owner_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /contact_owner\.profile_id\s*=\s*auth\.uid\(\)/i);
  assert.match(sql, /contacts authenticated read active[\s\S]*can_access_ehc_contact\(id\)/i);
  assert.match(sql, /changes authenticated read[\s\S]*can_access_ehc_contact\(contact_id\)/i);
  assert.match(sql, /activity events active profiles read[\s\S]*can_access_contact_activity/i);
  assert.match(sql, /contact notes team read[\s\S]*can_access_ehc_contact\(contact_id\)/i);
  assert.match(sql, /contact attachments team read[\s\S]*can_access_ehc_contact\(contact_id\)/i);
  assert.match(sql, /contact images team read[\s\S]*can_access_ehc_contact/i);
  assert.match(sql, /hospitations authenticated read active[\s\S]*can_access_contact_reference\(contact_id\)/i);
  assert.match(sql, /format participants authenticated read[\s\S]*can_access_ehc_contact\(contact_id\)/i);
}

assert.match(syntheticSeedGenerator, /relationship_basis:\s*source\.relationshipBasis\s*\|\|\s*"review_required"/);
assert.match(syntheticSeedGenerator, /ehc_consent_status:\s*source\.ehcConsentStatus\s*\|\|\s*"not_requested"/);
assert.match(syntheticSeedGenerator, /ehc_consent_source:\s*source\.ehcConsentSource\s*\|\|\s*null/);

const searchSource = sourceBetween(api, "async function searchContactContent(", "async function listContacts(");
assert.match(searchSource, /c\.ehc_consent_status\s*<>\s*'granted'/);
assert.match(searchSource, /exists\s*\(\s*select 1 from contact_owners/is);
const duplicateSource = sourceBetween(api, "async function assertNoContactDuplicate(", "async function contactIdentityForHospitation(");
assert.match(duplicateSource, /visibleCandidates\s*=\s*result\.rows\.filter/);
assert.match(duplicateSource, /duplicateContactVisibleToRequest/);
const imageReadSource = sourceBetween(api, "async function readContactImage(", "function stakeholderLogoObjectName(");
assert.ok(
  imageReadSource.indexOf("await assertEhcContactAccess") < imageReadSource.indexOf("if (!contact.image_storage_path)"),
  "Die Bildberechtigung muss vor der Bildexistenzprüfung erfolgen."
);
assert.match(imageReadSource, /error\?\.status === 404[\s\S]*Kontaktbild wurde nicht gefunden/);
const noteRowSource = sourceBetween(api, "async function contactNoteRow(", "function assertNoteOwner(");
assert.match(noteRowSource, /error\?\.status === 404[\s\S]*Notiz wurde nicht gefunden/);
const attachmentRowSource = sourceBetween(api, "async function contactNoteAttachmentRow(", "function safeAttachmentName(");
assert.match(attachmentRowSource, /error\?\.status === 404[\s\S]*Anhang wurde nicht gefunden/);
const hospitationSource = sourceBetween(api, "async function listHospitationSlots(", "async function listHospitationObservations(");
assert.match(hospitationSource, /filterRowsByEhcLinkedContact/);
assert.match(hospitationSource, /linkedContactVisibleToRequest/);
assert.match(hospitationSource, /contactId:\s*rows\[0\]\.contact_id/);
const activityAttachSource = sourceBetween(api, "async function attachContactsToChanges(", "async function attachNotificationEvents(");
assert.match(activityAttachSource, /entity_type === "hospitation"/);
assert.match(activityAttachSource, /_visibility_contact_id/);
const createSource = sourceBetween(api, "async function createContact(", "async function getContact(");
assert.match(createSource, /dbContact\.relationship_basis_recorded_by\s*=\s*userId/);
assert.match(createSource, /dbContact\.ehc_consent_recorded_by\s*=\s*userId/);
const patchSource = sourceBetween(api, "async function patchContact(", "function requestIdFromHeader(");
assert.match(patchSource, /select \* from contacts where id = \$1 limit 1 for update/);
assert.match(patchSource, /requestHasEhcContactAccess\(request,\s*currentRow,\s*effectiveOldOwnerIds\)/);
assert.match(patchSource, /CONTACT_PURPOSE_AUDIT_FIELDS/);

console.log("Contact Purpose Contract OK: Zweckachsen, EHC-Projektion, RLS und alle bekannten Identitäts-/Existenzpfade sind abgesichert.");
