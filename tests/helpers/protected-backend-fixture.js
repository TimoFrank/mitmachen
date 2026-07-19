import { readFileSync } from "node:fs";
import vm from "node:vm";

const DEMO_DATA_SOURCE = readFileSync(
  new URL("../../frontend/data/demo-data.js", import.meta.url),
  "utf8"
);

const NOW = "2026-07-19T12:00:00.000Z";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function genericProfiles() {
  return [
    { id: "demo-profile-admin", email: "admin@tests.example.invalid", display_name: "Demo Administration", initials: "DA", role: "admin", active: true, avatar_url: "", team: "Synthetische Tests", created_at: NOW, updated_at: NOW },
    { id: "demo-profile-editor", email: "redaktion@tests.example.invalid", display_name: "Demo Redaktion", initials: "DR", role: "editor", active: true, avatar_url: "", team: "Synthetische Tests", created_at: NOW, updated_at: NOW },
    { id: "demo-profile-viewer", email: "lesekonto@tests.example.invalid", display_name: "Demo Lesekonto", initials: "DL", role: "viewer", active: true, avatar_url: "", team: "Synthetische Tests", created_at: NOW, updated_at: NOW }
  ];
}

function syntheticRegistrations() {
  return [
    {
      id: "demo-registration-001",
      submission_id: "00000000-0000-4000-8000-000000000001",
      submitted_at: "2026-07-19T10:00:00.000Z",
      status: "neu",
      email: "demo-praxis@registrierung.example.invalid",
      salutation: "Frau",
      title: "",
      first_name: "Demo",
      last_name: "Praxisleitung",
      organization: "Demo-Praxis Registrierung",
      sector: "Praxis",
      onboarding_stage: "profile_complete",
      postal_code: "10115",
      city: "Musterstadt",
      federal_state: "Berlin",
      professional_group: "Ärztin / Arzt",
      role: "Synthetische Praxisleitung",
      employment_status: "Vollzeit",
      years_in_profession_band: "11–20 Jahre",
      age_group: "40–49 Jahre",
      employee_count_band: "6–20",
      primary_system_type: "PVS",
      primary_system_vendor: "Demo Systems",
      primary_system_product: "DemoSuite",
      ti_applications: ["ePA", "E-Rezept", "KIM"],
      participation_formats: ["Online-Befragungen", "Hospitationen"],
      interest_topics: ["ePA", "Medikationsprozesse"],
      preferred_contact: "E-Mail",
      message: "Rein synthetischer Registrierungseingang für den geschützten API-Vertrag.",
      form_version: "mitmachen-versorgungs-netzwerk-form-v1",
      privacy_check_status: "bereit_zur_pruefung",
      consent_processing_version: "registrierung-verarbeitung-v1",
      consent_processing_accepted_at: "2026-07-19T10:00:00.000Z",
      consent_contact_version: "mitmachen-kontakt-v1",
      consent_contact_accepted_at: "2026-07-19T10:00:00.000Z",
      email_confirmation_status: "confirmed",
      email_confirmed_at: "2026-07-19T10:01:30.000Z",
      eligibility_confirmed_at: "2026-07-19T10:00:00.000Z",
      privacy_notice_version: "privacy-demo-v1",
      retention_review_at: "2027-01-19T10:00:00.000Z",
      source_url: "https://registrierung.example.invalid/demo",
      duplicate_hint: ""
    },
    {
      id: "demo-registration-002",
      submission_id: "00000000-0000-4000-8000-000000000002",
      submitted_at: "2026-07-18T10:00:00.000Z",
      status: "neu",
      email: "demo-apotheke@registrierung.example.invalid",
      first_name: "Demo",
      last_name: "Apothekenkontakt",
      organization: "Demo-Apotheke Registrierung",
      sector: "Apotheke",
      onboarding_stage: "profile_complete",
      postal_code: "04109",
      city: "Beispielstadt",
      federal_state: "Sachsen",
      professional_group: "Apotheker:in",
      role: "Synthetische Inhaberin",
      primary_system_type: "AVS",
      primary_system_vendor: "Demo Digital",
      primary_system_product: "DemoDesk",
      ti_applications: ["E-Rezept", "KIM"],
      participation_formats: ["Online-Befragungen", "Interviews"],
      interest_topics: ["E-Rezept", "Digitale Kommunikation"],
      preferred_contact: "E-Mail",
      message: "Zweiter rein synthetischer Registrierungseingang.",
      form_version: "mitmachen-versorgungs-netzwerk-form-v1",
      privacy_check_status: "bereit_zur_pruefung",
      consent_processing_version: "registrierung-verarbeitung-v1",
      consent_processing_accepted_at: "2026-07-18T10:00:00.000Z",
      consent_contact_version: "",
      consent_contact_accepted_at: "",
      email_confirmation_status: "confirmed",
      email_confirmed_at: "2026-07-18T10:01:30.000Z",
      eligibility_confirmed_at: "2026-07-18T10:00:00.000Z",
      privacy_notice_version: "privacy-demo-v1",
      retention_review_at: "2027-01-18T10:00:00.000Z",
      source_url: "https://registrierung.example.invalid/demo",
      duplicate_hint: "Ähnliche synthetische Organisation im Testbestand prüfen"
    }
  ];
}

function protectedDomainFixture() {
  const stakeholderTypes = [
    ["kv", "Kassenärztliche Vereinigungen"],
    ["health-insurance", "Krankenkassen"],
    ["patient-associations", "Patientenverbände"],
    ["hospital-associations", "Krankenhausgesellschaften"],
    ["physician-associations", "Ärztliche Berufsverbände"]
  ].map(([id, label], index) => ({ id, label, sortOrder: (index + 1) * 10, status: "active" }));
  const stakeholderOrganizations = [
    { id: "demo-kv-nord", stakeholderTypeId: "kv", name: "Demo-KV Nord", organizationType: "Kassenärztliche Vereinigung", sector: "Ambulante Versorgung", city: "Musterstadt", state: "Nord", memberCount: 3200, memberCountLabel: "3.200", memberCountSourceLabel: "Synthetische Testangabe", website: "https://demo-kv-nord.example.invalid", status: "active" },
    { id: "demo-kv-mitte", stakeholderTypeId: "kv", name: "Demo-KV Mitte", organizationType: "Kassenärztliche Vereinigung", sector: "Ambulante Versorgung", city: "Beispielstadt", state: "Mitte", memberCount: 2100, memberCountLabel: "2.100", memberCountSourceLabel: "Synthetische Testangabe", website: "https://demo-kv-mitte.example.invalid", status: "active" },
    { id: "demo-health-a", stakeholderTypeId: "health-insurance", name: "Demo-Krankenkasse A", organizationType: "Krankenkasse", sector: "Kostenträger", city: "Musterstadt", state: "Nord", memberCount: 5400, memberCountLabel: "5.400", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-health-b", stakeholderTypeId: "health-insurance", name: "Demo-Krankenkasse B", organizationType: "Krankenkasse", sector: "Kostenträger", city: "Beispielstadt", state: "Mitte", memberCount: 4300, memberCountLabel: "4.300", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-patient-neuro", stakeholderTypeId: "patient-associations", name: "Demo-Patientenverband Neuro", organizationType: "Patientenverband", sector: "Neurologie", city: "Musterstadt", state: "Nord", memberCount: 650, memberCountLabel: "650", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-patient-cross", stakeholderTypeId: "patient-associations", name: "Demo-Patientenvertretung Übergreifend", organizationType: "Patientenvertretung", sector: "Übergreifende Beratung", city: "Beispielstadt", state: "Mitte", memberCount: 420, memberCountLabel: "420", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-hospital", stakeholderTypeId: "hospital-associations", name: "Demo-Krankenhausgesellschaft", organizationType: "Krankenhausgesellschaft", sector: "Stationäre Versorgung", city: "Musterstadt", state: "Nord", memberCount: 80, memberCountLabel: "80", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-physician-a", stakeholderTypeId: "physician-associations", name: "Demo-Berufsverband A", organizationType: "Ärztlicher Berufsverband", sector: "Ärztliche Vertretung", city: "Musterstadt", state: "Nord", memberCount: 1800, memberCountLabel: "1.800", memberCountSourceLabel: "Synthetische Testangabe", status: "active" },
    { id: "demo-physician-b", stakeholderTypeId: "physician-associations", name: "Demo-Berufsverband B", organizationType: "Ärztlicher Berufsverband", sector: "Ärztliche Vertretung", city: "Beispielstadt", state: "Mitte", memberCount: 1200, memberCountLabel: "1.200", memberCountSourceLabel: "Synthetische Testangabe", status: "active" }
  ];
  const stakeholderPeople = stakeholderOrganizations.map((organization, index) => ({
    id: `demo-stakeholder-person-${String(index + 1).padStart(2, "0")}`,
    stakeholderTypeId: organization.stakeholderTypeId,
    organizationId: organization.id,
    organization: organization.name,
    name: `Demo-Ansprechperson ${String(index + 1).padStart(2, "0")}`,
    role: "Synthetische Ansprechperson",
    committee: "Demo-Gremium",
    city: organization.city,
    state: organization.state,
    source: "Geschütztes Test-Backend",
    status: "active"
  }));
  return {
    expertGroups: [
      { id: "demo-expert-group-technology", name: "Demo-Wissenschaftliche Einrichtung und Patientenorganisation", sortOrder: 10, status: "active" },
      { id: "demo-expert-group-care", name: "Demo-Versorgungswissenschaft", sortOrder: 20, status: "active" }
    ],
    expertContacts: [
      { id: "demo-expert-contact-01", name: "Demo-Expertenkontakt 01", groupId: "demo-expert-group-technology", group: "Demo-Wissenschaftliche Einrichtung und Patientenorganisation", organizationId: "demo-expert-org-01", organization: "Demo-Expertenorganisation 01", role: "Synthetische Fachperson", status: "active" }
    ],
    expertOrganizations: [
      { id: "demo-expert-org-01", name: "Demo-Expertenorganisation 01", groupId: "demo-expert-group-technology", group: "Demo-Technologie", organizationType: "Synthetische Organisation", status: "active" }
    ],
    expertEntityLinks: [],
    stakeholderTypes,
    stakeholderOrganizations,
    stakeholderPeople
  };
}

function runFixtureScript(source) {
  const fixtureUrl = "https://tests.example.invalid/frontend/data/test-fixture.js";
  const window = { location: { href: fixtureUrl } };
  const sandbox = {
    window,
    document: { currentScript: { src: fixtureUrl } },
    URL,
    Date,
    console: { log() {}, info() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(source, sandbox, { filename: "protected-backend-fixture.js" });
  return window;
}

function observationsFromHospitations(hospitations = []) {
  return hospitations.flatMap((hospitation) => {
    let documentation = hospitation.documentation || {};
    if (typeof hospitation.documentationOutcome === "string") {
      try {
        documentation = JSON.parse(hospitation.documentationOutcome);
      } catch {
        documentation = {};
      }
    }
    return (documentation.observations || []).map((observation, index) => ({
      ...observation,
      id: observation.id || `${hospitation.id}-observation-${index + 1}`,
      hospitationId: hospitation.id,
      situation: observation.situation || observation.situationContext || "",
      description: observation.description || observation.observed || "",
      payload: clone(observation),
      ownerId: observation.ownerId || hospitation.ownerId || "",
      status: observation.status || "active",
      createdAt: observation.createdAt || hospitation.createdAt || NOW,
      updatedAt: observation.updatedAt || hospitation.updatedAt || NOW
    }));
  });
}

function mapPatientFixtures(window, organizations, people) {
  const indicationByOrganization = window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATION_INDICATIONS || {};
  (window.VERSORGUNGS_COMPASS_PATIENT_ORGANIZATIONS || []).forEach((organization) => {
    organizations.push({
      ...organization,
      stakeholderTypeId: "patient-associations",
      stakeholderType: "patient-associations",
      sector: indicationByOrganization[organization.id] || organization.indication || organization.sector || organization.category || "Demo-Indikation"
    });
  });
  (window.VERSORGUNGS_COMPASS_PATIENT_PEOPLE || []).forEach((person) => {
    const organization = organizations.find((item) => item.id === person.organizationId);
    people.push({
      ...person,
      stakeholderTypeId: "patient-associations",
      stakeholderType: "patient-associations",
      sector: person.indication || person.sector || person.category || organization?.sector || "Demo-Indikation"
    });
  });
}

export function createProtectedBackendFixture({ role = "admin", fixtureScript = "", notifications = [], registrations } = {}) {
  const usesDefaultFixture = !String(fixtureScript || "").trim();
  const window = runFixtureScript(usesDefaultFixture ? DEMO_DATA_SOURCE : fixtureScript);
  const demo = window.VERSORGUNGS_COMPASS_PROTECTED_TEST_DATA || window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  const protectedDomain = usesDefaultFixture ? protectedDomainFixture() : {};
  const stakeholderOrganizations = clone(window.VERSORGUNGS_COMPASS_STAKEHOLDER_ORGANIZATIONS || demo.stakeholderOrganizations || protectedDomain.stakeholderOrganizations || []);
  const stakeholderPeople = clone(window.VERSORGUNGS_COMPASS_STAKEHOLDER_PEOPLE || demo.stakeholderPeople || protectedDomain.stakeholderPeople || []);
  mapPatientFixtures(window, stakeholderOrganizations, stakeholderPeople);

  const profiles = clone(demo.profiles?.length ? demo.profiles : genericProfiles());
  let currentProfile = profiles.find((profile) => profile.role === role) || profiles[0] || genericProfiles()[0];
  if (!profiles.some((profile) => profile.role === role)) {
    currentProfile = { ...currentProfile, id: `demo-profile-${role}`, role, display_name: `Demo ${role}` };
    profiles.unshift(currentProfile);
  }
  const contacts = clone(window.VERSORGUNGS_COMPASS_CONTACTS || demo.contacts || []);
  const organizations = clone(demo.organizations || []);
  const hospitations = clone(demo.hospitations || []);
  const formats = clone(demo.formats || []);
  const changes = clone(demo.changes || []);
  const fixture = {
    profiles,
    currentProfileId: currentProfile.id,
    contacts,
    organizations,
    organizationPrimarySystems: organizations.flatMap((organization) => organization.primarySystems || []),
    expertGroups: clone(window.VERSORGUNGS_COMPASS_EXPERT_GROUPS || demo.expertGroups || protectedDomain.expertGroups || []),
    expertContacts: clone(window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS || demo.expertContacts || protectedDomain.expertContacts || []),
    expertOrganizations: clone(window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS || demo.expertOrganizations || protectedDomain.expertOrganizations || []),
    expertEntityLinks: clone(demo.expertEntityLinks || protectedDomain.expertEntityLinks || []),
    stakeholderTypes: clone(window.VERSORGUNGS_COMPASS_STAKEHOLDER_TYPES || demo.stakeholderTypes || protectedDomain.stakeholderTypes || []),
    stakeholderOrganizations,
    stakeholderPeople,
    savedViews: clone(demo.savedViews || []),
    userSettings: clone(demo.userSettings || {
      userId: currentProfile.id,
      defaultViewType: "contacts",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: { onboarding: { version: 1, profileCompletedAt: NOW, tourSkippedAt: NOW } }
    }),
    hospitationSlots: clone(demo.hospitationSlots || []),
    hospitations,
    hospitationObservations: clone(demo.hospitationObservations || observationsFromHospitations(hospitations)),
    roadmapItems: clone(demo.roadmapItems || []),
    hospitationRoadmapAssessments: clone(demo.hospitationRoadmapAssessments || []),
    hospitationUnmetNeeds: clone(demo.hospitationUnmetNeeds || []),
    formats,
    activities: clone(demo.activityEvents || changes),
    changes,
    notifications: clone([...(notifications || []), ...(demo.notifications || [])]),
    registrations: clone(Array.isArray(registrations) ? registrations : (demo.registrations || syntheticRegistrations())),
    contactNotes: clone(demo.contactNotes || []),
    contactNoteAttachments: clone(demo.contactNoteAttachments || [])
  };
  if (usesDefaultFixture) {
    fixture.userSettings = {
      ...(fixture.userSettings || {}),
      userId: currentProfile.id,
      preferences: {
        ...(fixture.userSettings?.preferences || {}),
        onboarding: {
          version: 1,
          profileCompletedAt: NOW,
          tourSkippedAt: NOW,
          ...(fixture.userSettings?.preferences?.onboarding || {})
        }
      }
    };
  }
  return fixture;
}

function activeRows(rows, includeArchived) {
  return rows.filter((row) => includeArchived || !["archived", "Archiviert"].includes(row.status));
}

function collectionResponse(items) {
  return { items: clone(items) };
}

function idFor(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mergeById(target, rows = []) {
  rows.forEach((row) => {
    const index = target.findIndex((item) => item.id === row.id);
    if (index >= 0) target[index] = { ...target[index], ...row };
    else target.push({ ...row });
  });
}

async function fulfillJson(route, payload, status = 200, headers = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(payload)
  });
}

function searchProtectedContent(fixture, query) {
  const needle = String(query || "").trim().toLocaleLowerCase("de");
  if (!needle) return [];
  const noteResults = fixture.contactNotes
    .filter((note) => [note.body, note.text, note.emailSubject].join(" ").toLocaleLowerCase("de").includes(needle))
    .map((note) => ({ contactId: note.contact_id || note.contactId, noteId: note.id, resultKind: "free_note", title: "Notiz", snippet: note.body || note.text || "", occurredAt: note.created_at || note.createdAt || NOW, rank: 1 }));
  const attachmentResults = fixture.contactNoteAttachments
    .filter((attachment) => [attachment.file_name, attachment.fileName, attachment.description, attachment.extracted_text, attachment.extractedText].join(" ").toLocaleLowerCase("de").includes(needle))
    .map((attachment) => ({ contactId: attachment.contact_id || attachment.contactId, noteId: attachment.note_id || attachment.noteId, attachmentId: attachment.id, resultKind: "attachment", title: attachment.file_name || attachment.fileName, snippet: attachment.description || attachment.extracted_text || attachment.extractedText || "", occurredAt: attachment.uploaded_at || attachment.uploadedAt || NOW, rank: 1.2 }));
  return [...attachmentResults, ...noteResults];
}

function activityEventKey(item = {}) {
  const direct = item.eventKey || item.event_key;
  if (direct) return String(direct);
  const action = String(item.action || item.kind || "update");
  if (["create", "import"].includes(action)) return "contact.created";
  if (action === "archive") return "contact.archived";
  if (action === "restore") return "contact.restored";
  return "contact.updated";
}

function activityCategory(item = {}) {
  const direct = item.categoryKey || item.category?.key || item.category;
  if (typeof direct === "string" && direct) return direct;
  const eventKey = activityEventKey(item);
  if (eventKey.startsWith("contact.consent.")) return "consent";
  if (eventKey.startsWith("contact.owner.")) return "ownership";
  if (eventKey.startsWith("hospitation.")) return "hospitation";
  if (eventKey.startsWith("format.")) return "format";
  if (eventKey.startsWith("note.") || eventKey.startsWith("document.") || eventKey.startsWith("email.")) return "note_document";
  if (["contact.created", "contact.archived", "contact.restored"].includes(eventKey)) return "master_data";
  const fieldName = String(item.fieldName || item.field_name || "");
  return ["owner", "owner_id", "owner_ids"].includes(fieldName) ? "ownership" : "master_data";
}

function notificationDto(item = {}) {
  const readAt = item.readAt || item.read_at || "";
  const entityType = String(item.entityType || item.entity_type || "").toLowerCase();
  const context = item.context
    || (entityType === "contact" ? "contacts"
      : entityType === "organization" ? "organizations"
        : ["format", "format_participant"].includes(entityType) ? "formats"
          : entityType === "profile" ? "team" : "all");
  return {
    ...item,
    context,
    readAt,
    unread: item.unread !== false && !readAt
  };
}

function activityOrigin(item = {}) {
  const direct = item.originKey || item.origin?.key || item.originType || item.origin_type;
  if (direct) return String(direct);
  return item.action === "import" ? "data_import" : "legacy";
}

function activityDto(item = {}) {
  if (!item.event_key || item.eventKey) return item;
  const rawChanges = item.changes && typeof item.changes === "object" && !Array.isArray(item.changes)
    ? Object.entries(item.changes).map(([fieldName, value]) => ({
        fieldName,
        oldValue: value?.before ?? value?.oldValue ?? "",
        newValue: value?.after ?? value?.newValue ?? ""
      }))
    : (item.changes || []);
  return {
    ...item,
    eventKey: item.event_key,
    categoryKey: item.category,
    actionKey: item.action,
    objectType: item.entity_type,
    objectId: item.entity_id,
    contactId: item.contact_id || "",
    actorId: item.actor_id || "",
    occurredAt: item.occurred_at || "",
    originKey: item.origin_type || "manual",
    originRef: item.origin_ref || "",
    correlationId: item.correlation_id || "",
    changes: rawChanges
  };
}

function filteredActivities(items = [], searchParams = new URLSearchParams()) {
  const eventKey = String(searchParams.get("eventKey") || "");
  const category = String(searchParams.get("category") || "");
  const kind = String(searchParams.get("kind") || searchParams.get("action") || "");
  const origin = String(searchParams.get("origin") || "");
  const changedBy = String(searchParams.get("changedBy") || "");
  const from = String(searchParams.get("from") || "");
  const to = String(searchParams.get("to") || "");
  const query = String(searchParams.get("q") || "").toLocaleLowerCase("de");
  return items.filter((item) => {
    const itemEventKey = activityEventKey(item);
    const itemCategory = activityCategory(item);
    const itemKind = String(item.actionKey || item.action || item.kind || "");
    const itemOrigin = activityOrigin(item);
    const itemChangedBy = String(item.actorId || item.actor?.id || item.changedBy || item.changed_by || "");
    const occurredAt = String(item.occurredAt || item.occurred_at || item.changedAt || item.changed_at || "");
    if (eventKey && itemEventKey !== eventKey) return false;
    if (category && itemCategory !== category) return false;
    if (kind && itemKind !== kind) return false;
    if (origin && itemOrigin !== origin) return false;
    if (changedBy && itemChangedBy !== changedBy) return false;
    if (from && new Date(occurredAt).getTime() < new Date(from).getTime()) return false;
    if (to && new Date(occurredAt).getTime() > new Date(to).getTime()) return false;
    if (!query) return true;
    return JSON.stringify(item).toLocaleLowerCase("de").includes(query);
  });
}

function consentActivity(previous = {}, updated = {}, profile = {}) {
  const before = String(previous.mitmachenConsentStatus || previous.mitmachen_consent_status || "not_requested");
  const after = String(updated.mitmachenConsentStatus || updated.mitmachen_consent_status || "not_requested");
  if (before === after) return null;
  const eventSuffix = ["granted", "declined", "withdrawn"].includes(after) ? after : "updated";
  return {
    id: idFor("demo-consent-activity"),
    eventKey: `contact.consent.${eventSuffix}`,
    categoryKey: "consent",
    actionKey: eventSuffix,
    objectType: "contact",
    objectId: updated.id,
    contactId: updated.id,
    actorId: profile.id || "",
    actor: {
      id: profile.id || "",
      displayName: profile.display_name || profile.displayName || "Demo Nutzer",
      email: profile.email || "",
      role: profile.role || "viewer",
      team: profile.team || ""
    },
    contact: {
      id: updated.id,
      name: updated.name || "",
      organization: updated.organization || "",
      sector: updated.category || updated.sector || "",
      city: updated.city || "",
      state: updated.state || updated.federal_state || ""
    },
    occurredAt: NOW,
    originKey: "manual",
    references: [{ type: "contact", id: updated.id, label: updated.name || "" }],
    changes: [{ fieldName: "mitmachen_consent_status", oldValue: before, newValue: after }],
    metadata: { entityLabel: updated.name || "" }
  };
}

export async function installProtectedBackend(page, fixture) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON?.() || {};
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const stakeholderTypeId = url.searchParams.get("stakeholderTypeId") || "";

    if (method === "GET" && path === "/api/network-registrations") {
      const status = String(url.searchParams.get("status") || "");
      const rows = fixture.registrations
        .filter((item) => !status || item.status === status)
        .sort((left, right) => String(right.submittedAt || right.submitted_at || "").localeCompare(String(left.submittedAt || left.submitted_at || "")));
      await fulfillJson(route, collectionResponse(rows));
      return;
    }
    const registrationMatch = path.match(/^\/api\/network-registrations\/([^/]+)$/);
    if (method === "PATCH" && registrationMatch) {
      const id = decodeURIComponent(registrationMatch[1]);
      const index = fixture.registrations.findIndex((item) => item.id === id);
      if (index < 0) {
        await fulfillJson(route, { error: "Synthetische Registrierung nicht gefunden" }, 404);
        return;
      }
      fixture.registrations[index] = { ...fixture.registrations[index], ...body, updated_at: NOW };
      await fulfillJson(route, { registration: fixture.registrations[index] });
      return;
    }

    const collections = new Map([
      ["/api/profiles", fixture.profiles],
      ["/api/contacts", fixture.contacts],
      ["/api/organizations", fixture.organizations],
      ["/api/organization-primary-systems", fixture.organizationPrimarySystems],
      ["/api/expert-groups", fixture.expertGroups],
      ["/api/expert-contacts", fixture.expertContacts],
      ["/api/expert-organizations", fixture.expertOrganizations],
      ["/api/expert-entity-links", fixture.expertEntityLinks],
      ["/api/stakeholder-types", fixture.stakeholderTypes],
      ["/api/stakeholder-organizations", fixture.stakeholderOrganizations],
      ["/api/stakeholder-people", fixture.stakeholderPeople],
      ["/api/saved-views", fixture.savedViews],
      ["/api/hospitation-slots", fixture.hospitationSlots],
      ["/api/hospitations", fixture.hospitations],
      ["/api/hospitation-observations", fixture.hospitationObservations],
      ["/api/roadmap-items", fixture.roadmapItems],
      ["/api/hospitation-roadmap-assessments", fixture.hospitationRoadmapAssessments],
      ["/api/hospitation-unmet-needs", fixture.hospitationUnmetNeeds],
      ["/api/formats", fixture.formats],
      ["/api/activities", fixture.activities],
      ["/api/contact-notes", fixture.contactNotes],
      ["/api/contact-note-attachments", fixture.contactNoteAttachments]
    ]);

    if (method === "GET" && path === "/api/profile") {
      await fulfillJson(route, fixture.profiles.find((profile) => profile.id === fixture.currentProfileId) || fixture.profiles[0] || null);
      return;
    }
    if (method === "PATCH" && path === "/api/profile") {
      const index = fixture.profiles.findIndex((profile) => profile.id === fixture.currentProfileId);
      fixture.profiles[index] = { ...fixture.profiles[index], ...body, display_name: body.displayName ?? body.display_name ?? fixture.profiles[index].display_name, updated_at: NOW };
      await fulfillJson(route, fixture.profiles[index]);
      return;
    }
    if (method === "GET" && path === "/api/user-settings") {
      await fulfillJson(route, fixture.userSettings || {});
      return;
    }
    if (method === "PUT" && path === "/api/user-settings") {
      fixture.userSettings = { ...(fixture.userSettings || {}), ...body, userId: fixture.currentProfileId, updatedAt: NOW };
      await fulfillJson(route, fixture.userSettings);
      return;
    }
    if (method === "GET" && path === "/api/notifications") {
      const unreadOnly = url.searchParams.get("unreadOnly") === "true";
      const context = String(url.searchParams.get("context") || "all");
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      const rows = fixture.notifications.filter((item) => {
        const unread = item.unread !== false && !(item.readAt || item.read_at);
        return (!unreadOnly || unread) && (context === "all" || !context || item.context === context);
      });
      await fulfillJson(route, { items: clone(rows.slice(offset, offset + limit).map(notificationDto)), nextOffset: Math.min(rows.length, offset + limit), hasMore: rows.length > offset + limit });
      return;
    }
    if (method === "GET" && path === "/api/notifications/summary") {
      await fulfillJson(route, { unreadTotal: fixture.notifications.filter((item) => item.unread !== false && !(item.readAt || item.read_at)).length, byContext: {} });
      return;
    }
    if (method === "PATCH" && (path === "/api/notifications/read" || /^\/api\/notifications\/[^/]+\/read$/.test(path))) {
      const ids = path === "/api/notifications/read"
        ? (body.ids || [])
        : [decodeURIComponent(path.split("/").at(-2))];
      fixture.notifications = fixture.notifications.map((item) => ids.includes(item.id || item.eventId)
        ? { ...item, readAt: item.readAt || NOW, unread: false }
        : item);
      await fulfillJson(route, { ok: true });
      return;
    }
    if (method === "GET" && path === "/api/contact-content-search") {
      await fulfillJson(route, collectionResponse(searchProtectedContent(fixture, url.searchParams.get("query") || url.searchParams.get("q"))));
      return;
    }
    const contactHistoryMatch = path.match(/^\/api\/contacts\/([^/]+)\/history$/);
    if (method === "GET" && contactHistoryMatch) {
      const contactId = decodeURIComponent(contactHistoryMatch[1]);
      const rows = filteredActivities(fixture.activities, url.searchParams)
        .filter((change) => (change.contactId || change.contact_id) === contactId);
      await fulfillJson(route, collectionResponse(rows.map(activityDto)));
      return;
    }
    const contactImageReadMatch = path.match(/^\/api\/contact-images\/([^/]+)$/);
    if (method === "GET" && contactImageReadMatch) {
      const contact = fixture.contacts.find((item) => item.id === decodeURIComponent(contactImageReadMatch[1]));
      if (!contact?._testImageData) {
        await fulfillJson(route, { error: "Synthetisches Kontaktbild nicht gefunden" }, 404);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: contact._testImageContentType || "image/png",
        body: Buffer.from(contact._testImageData, "base64")
      });
      return;
    }
    const contactImageWriteMatch = path.match(/^\/api\/contacts\/([^/]+)\/image$/);
    if (contactImageWriteMatch && ["POST", "DELETE"].includes(method)) {
      const contactId = decodeURIComponent(contactImageWriteMatch[1]);
      const index = fixture.contacts.findIndex((item) => item.id === contactId);
      if (index < 0) {
        await fulfillJson(route, { error: "Synthetischer Kontakt nicht gefunden" }, 404);
        return;
      }
      const previous = fixture.contacts[index];
      fixture.contacts[index] = method === "POST"
        ? {
            ...previous,
            image: `/api/contact-images/${encodeURIComponent(contactId)}`,
            imageStoragePath: `contact-images/${contactId}/synthetic-test-image`,
            imageKind: "upload",
            imageMimeType: body.contentType || "image/png",
            imageFileSize: Buffer.from(body.data || "", "base64").length,
            imageWidth: Number(body.width) || 1,
            imageHeight: Number(body.height) || 1,
            imageSourceUrl: "",
            imageSourceLabel: body.sourceLabel || "Eigener Upload",
            imageRightsNote: body.rightsNote || "",
            imageUpdatedAt: NOW,
            imageUpdatedBy: fixture.currentProfileId,
            _testImageData: body.data || "",
            _testImageContentType: body.contentType || "image/png"
          }
        : {
            ...previous,
            image: "",
            imageStoragePath: "",
            imageKind: "",
            imageMimeType: "",
            imageFileSize: 0,
            imageWidth: 0,
            imageHeight: 0,
            imageSourceUrl: "",
            imageSourceLabel: "",
            imageRightsNote: "",
            imageUpdatedAt: NOW,
            imageUpdatedBy: fixture.currentProfileId,
            _testImageData: "",
            _testImageContentType: ""
          };
      await fulfillJson(route, clone(fixture.contacts[index]));
      return;
    }
    const entityMatch = path.match(/^\/api\/(contacts|organizations|formats|hospitations)\/([^/]+)$/);
    if (method === "GET" && entityMatch) {
      const key = { contacts: "contacts", organizations: "organizations", formats: "formats", hospitations: "hospitations" }[entityMatch[1]];
      const item = fixture[key].find((row) => row.id === decodeURIComponent(entityMatch[2]));
      await fulfillJson(route, item || { error: "Testdatensatz nicht gefunden" }, item ? 200 : 404);
      return;
    }
    if (method === "GET" && collections.has(path)) {
      if (path === "/api/activities") {
        const rows = filteredActivities(fixture.activities, url.searchParams);
        const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
        await fulfillJson(route, {
          items: clone(rows.slice(offset, offset + limit).map(activityDto)),
          nextOffset: Math.min(rows.length, offset + limit),
          hasMore: rows.length > offset + limit,
          nextCursor: null
        });
        return;
      }
      let rows = activeRows(collections.get(path), includeArchived);
      if (stakeholderTypeId && ["/api/stakeholder-organizations", "/api/stakeholder-people"].includes(path)) {
        rows = rows.filter((row) => (row.stakeholderTypeId || row.stakeholder_type_id || row.stakeholderType) === stakeholderTypeId);
      }
      const hospitationId = url.searchParams.get("hospitationId") || "";
      if (hospitationId && ["/api/hospitation-observations", "/api/hospitation-roadmap-assessments", "/api/hospitation-unmet-needs"].includes(path)) {
        rows = rows.filter((row) => (row.hospitationId || row.hospitation_id) === hospitationId);
      }
      const contactId = url.searchParams.get("contactId") || "";
      if (contactId && ["/api/contact-notes", "/api/contact-note-attachments"].includes(path)) {
        rows = rows.filter((row) => (row.contactId || row.contact_id) === contactId);
      }
      await fulfillJson(route, collectionResponse(rows));
      return;
    }
    if (method === "POST" && path === "/api/stakeholder-import") {
      mergeById(fixture.stakeholderTypes, body.types || []);
      mergeById(fixture.stakeholderOrganizations, body.organizations || []);
      mergeById(fixture.stakeholderPeople, body.people || []);
      await fulfillJson(route, { types: clone(fixture.stakeholderTypes), organizations: clone(fixture.stakeholderOrganizations), people: clone(fixture.stakeholderPeople) });
      return;
    }
    if (method === "POST" && path === "/api/contact-notes") {
      const created = { ...body, id: body.id || idFor("demo-note"), contact_id: body.contactId || body.contact_id, body: body.body || body.text || "", created_by: fixture.currentProfileId, updated_by: fixture.currentProfileId, created_at: NOW, updated_at: NOW };
      fixture.contactNotes.unshift(created);
      await fulfillJson(route, created, 201);
      return;
    }
    const noteMatch = path.match(/^\/api\/contact-notes\/([^/]+)$/);
    if (noteMatch && ["PATCH", "DELETE"].includes(method)) {
      const id = decodeURIComponent(noteMatch[1]);
      const index = fixture.contactNotes.findIndex((note) => note.id === id);
      if (method === "DELETE") fixture.contactNotes.splice(index, 1);
      else fixture.contactNotes[index] = { ...fixture.contactNotes[index], ...body, body: body.body || body.text || fixture.contactNotes[index].body, updated_at: NOW };
      await fulfillJson(route, method === "DELETE" ? { ok: true } : fixture.contactNotes[index]);
      return;
    }
    if (method === "POST" && path === "/api/contact-note-attachments") {
      const created = { ...body, id: body.id || idFor("demo-attachment"), contact_id: body.contactId || body.contact_id, note_id: body.noteId || body.note_id, file_name: body.fileName || body.file_name, mime_type: body.mimeType || body.mime_type, file_size: body.fileSize || body.file_size || 0, extracted_text: body.extractedText || body.extracted_text || "", extraction_status: body.extractionStatus || body.extraction_status || "complete", uploaded_at: NOW, uploader_id: fixture.currentProfileId, _testData: body.data || "" };
      fixture.contactNoteAttachments.push(created);
      await fulfillJson(route, created, 201);
      return;
    }
    const attachmentContentMatch = path.match(/^\/api\/contact-note-attachments\/([^/]+)\/content$/);
    if (method === "GET" && attachmentContentMatch) {
      const attachment = fixture.contactNoteAttachments.find((item) => item.id === decodeURIComponent(attachmentContentMatch[1]));
      const data = attachment?._testData ? Buffer.from(attachment._testData, "base64") : Buffer.from(attachment?.extracted_text || attachment?.extractedText || "", "utf8");
      await route.fulfill({ status: attachment ? 200 : 404, contentType: attachment?.mime_type || attachment?.mimeType || "application/octet-stream", headers: { "x-file-name": encodeURIComponent(attachment?.file_name || attachment?.fileName || "datei") }, body: data });
      return;
    }
    const createCollection = {
      "/api/contacts": [fixture.contacts, "demo-contact", body.contact || body],
      "/api/organizations": [fixture.organizations, "demo-organization", body],
      "/api/organization-primary-systems": [fixture.organizationPrimarySystems, "demo-primary-system", body],
      "/api/expert-contacts": [fixture.expertContacts, "demo-expert-contact", body],
      "/api/expert-organizations": [fixture.expertOrganizations, "demo-expert-organization", body],
      "/api/expert-entity-links": [fixture.expertEntityLinks, "demo-expert-link", body],
      "/api/hospitation-slots": [fixture.hospitationSlots, "demo-hospitation-slot", body],
      "/api/hospitations": [fixture.hospitations, "demo-hospitation", body],
      "/api/hospitation-observations": [fixture.hospitationObservations, "demo-observation", body],
      "/api/formats": [fixture.formats, "demo-format", body],
      "/api/saved-views": [fixture.savedViews, "demo-view", body]
    }[path];
    if (method === "POST" && createCollection) {
      const [target, prefix, payload] = createCollection;
      const created = { ...payload, id: payload.id || idFor(prefix), createdAt: payload.createdAt || NOW, updatedAt: NOW };
      target.unshift(created);
      await fulfillJson(route, created, 201);
      return;
    }
    const updateMatch = path.match(/^\/api\/(contacts|organizations|organization-primary-systems|expert-contacts|expert-organizations|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats|saved-views)\/([^/]+)$/);
    if (updateMatch && ["PATCH", "DELETE"].includes(method)) {
      const key = {
        contacts: "contacts", organizations: "organizations", "organization-primary-systems": "organizationPrimarySystems", "expert-contacts": "expertContacts", "expert-organizations": "expertOrganizations", "expert-entity-links": "expertEntityLinks", "hospitation-slots": "hospitationSlots", hospitations: "hospitations", "hospitation-observations": "hospitationObservations", formats: "formats", "saved-views": "savedViews"
      }[updateMatch[1]];
      const target = fixture[key];
      const id = decodeURIComponent(updateMatch[2]);
      const index = target.findIndex((item) => item.id === id);
      const previous = index >= 0 ? { ...target[index] } : null;
      if (method === "DELETE") target.splice(index, 1);
      else target[index] = { ...target[index], ...body, updatedAt: NOW };
      if (method === "PATCH" && key === "contacts" && previous) {
        const profile = fixture.profiles.find((item) => item.id === fixture.currentProfileId) || fixture.profiles[0] || {};
        const activity = consentActivity(previous, target[index], profile);
        if (activity) fixture.activities.unshift(activity);
      }
      await fulfillJson(route, method === "DELETE" ? { ok: true } : target[index]);
      return;
    }
    const syncMatch = path.match(/^\/api\/hospitations\/([^/]+)\/(observations\/sync|roadmap-assessments|unmet-needs)$/);
    if (method === "PUT" && syncMatch) {
      const hospitationId = decodeURIComponent(syncMatch[1]);
      const key = syncMatch[2] === "observations/sync" ? "hospitationObservations" : syncMatch[2] === "roadmap-assessments" ? "hospitationRoadmapAssessments" : "hospitationUnmetNeeds";
      fixture[key] = fixture[key].filter((item) => (item.hospitationId || item.hospitation_id) !== hospitationId);
      const items = (body.items || body.observations || []).map((item) => ({ ...item, id: item.id || idFor("demo-item"), hospitationId, updatedAt: NOW }));
      fixture[key].push(...items);
      await fulfillJson(route, collectionResponse(items));
      return;
    }
    const formatParticipantsImportMatch = path.match(/^\/api\/formats\/([^/]+)\/participants\/import$/);
    if (formatParticipantsImportMatch && method === "POST") {
      const format = fixture.formats.find((item) => item.id === decodeURIComponent(formatParticipantsImportMatch[1]));
      format.participants ||= [];
      (body.items || []).forEach((entry) => {
        const contactId = entry.contactId || entry.contact_id || "";
        const index = format.participants.findIndex((item) => (item.contactId || item.contact_id) === contactId);
        const participant = {
          ...(index >= 0 ? format.participants[index] : {}),
          ...entry,
          id: index >= 0 ? format.participants[index].id : (entry.id || idFor("demo-format-participant")),
          formatId: format.id,
          contactId,
          updatedAt: NOW
        };
        if (index >= 0) format.participants[index] = participant;
        else format.participants.push(participant);
      });
      format.updatedAt = NOW;
      await fulfillJson(route, format);
      return;
    }
    const formatParticipantsMatch = path.match(/^\/api\/formats\/([^/]+)\/participants(?:\/([^/]+))?$/);
    if (formatParticipantsMatch && ["POST", "PATCH", "DELETE"].includes(method)) {
      const format = fixture.formats.find((item) => item.id === decodeURIComponent(formatParticipantsMatch[1]));
      format.participants ||= [];
      const contactId = formatParticipantsMatch[2] ? decodeURIComponent(formatParticipantsMatch[2]) : (body.contactId || body.contact_id || "");
      if (method === "POST") {
        if (!format.participants.some((item) => (item.contactId || item.contact_id) === contactId)) {
          format.participants.push({ ...body, id: body.id || idFor("demo-format-participant"), formatId: format.id, contactId, updatedAt: NOW });
        }
      } else if (method === "PATCH") {
        const index = format.participants.findIndex((item) => (item.contactId || item.contact_id) === contactId);
        format.participants[index] = { ...format.participants[index], ...body, updatedAt: NOW };
      } else {
        format.participants = format.participants.filter((item) => (item.contactId || item.contact_id) !== contactId);
      }
      format.updatedAt = NOW;
      await fulfillJson(route, format, method === "POST" ? 201 : 200);
      return;
    }
    await fulfillJson(route, { error: `Nicht implementierte Test-API: ${method} ${path}` }, 501);
  });
}
