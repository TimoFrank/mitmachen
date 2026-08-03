/*
 * Öffentliche Demo-API für GitHub Pages.
 *
 * Sie stellt der unveränderten Anwendung dieselben /api-Endpunkte wie der
 * geschützte Zielbetrieb bereit. CRM- und Fachdaten stammen ausschließlich
 * aus demo-data.js. Ein getrennt kuratierter, rein öffentlicher
 * Amtsträger-Datensatz stellt den Gesundheitsausschuss bereit. Änderungen
 * bleiben ausschließlich im Arbeitsspeicher des aktuellen Browser-Tabs.
 * Es werden keine Daten versendet oder dauerhaft gespeichert.
 */
(function () {
  "use strict";

  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  if (CONFIG.dataMode !== "demo" || CONFIG.authMode !== "anonymous-demo") return;

  const OWNER_ONLY_CONTACT_CHANNELS = CONFIG.capabilities?.ownerOnlyContactChannels === true;
  const ALL_DEMO_CONTACTS_INVITABLE = CONFIG.capabilities?.allDemoContactsInvitable === true;
  const NOW = "2026-07-19T12:00:00.000Z";
  const DEMO_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const SENSITIVE_CONTACT_FIELDS = new Set(["email", "phone"]);
  const FORMAT_STATUSES = Object.freeze(["Planung", "Aktiv", "Abgeschlossen", "Archiviert"]);
  const FORMAT_PARTICIPANT_STATUSES = Object.freeze([
    "Kandidat",
    "Eingeladen",
    "Zugesagt",
    "Abgesagt",
    "Keine Rückmeldung",
    "Teilgenommen"
  ]);
  const FORMAT_PARTICIPANT_BATCH_LIMIT = 500;
  const FORMAT_IDEMPOTENCY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  const DIRECTLY_INVITABLE_MITMACHEN_SOURCES = new Set(["online_form", "email", "written"]);
  const baseline = window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  const publicPoliticsDirectory =
    window.VERSORGUNGS_COMPASS_PUBLIC_POLITICS_DIRECTORY || null;
  const originalFetch = window.fetch.bind(window);
  let idCounter = 0;
  let onboardingPreview = false;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createState() {
    const state = clone(baseline);
    state.profiles ||= [];
    const activeProfiles = state.profiles.filter((profile) =>
      profile.active !== false && !["inactive", "archived", "Archiviert"].includes(profile.status)
    );
    let requestedProfileId = "";
    let requestedOnboardingMode = "";
    try {
      const searchParams = new URL(window.location.href).searchParams;
      requestedProfileId = searchParams.get("demoProfile") || "";
      requestedOnboardingMode = searchParams.get("demoOnboarding") || "";
    } catch (_error) {
      requestedProfileId = "";
      requestedOnboardingMode = "";
    }
    onboardingPreview = requestedProfileId === "demo-profile-viewer"
      && requestedOnboardingMode === "fresh";
    state.currentProfileId = activeProfiles.find((profile) => profile.id === requestedProfileId)?.id
      || activeProfiles.find((profile) => profile.role === (CONFIG.demoRole || "admin"))?.id
      || activeProfiles[0]?.id
      || "demo-profile-admin";
    state.contacts ||= [];
    if (ALL_DEMO_CONTACTS_INVITABLE) {
      const profileIds = new Set(state.profiles.map((profile) => profile.id).filter(Boolean));
      state.contacts = state.contacts.map((contact) => {
        const effectiveAt = String(contact.mitmachenConsentEffectiveAt || "").trim();
        const effectiveTime = new Date(effectiveAt).getTime();
        const source = String(contact.mitmachenConsentSource || "").trim();
        const recordedByCandidates = [
          contact.mitmachenConsentRecordedBy,
          contact.ownerId,
          ...(Array.isArray(contact.ownerIds) ? contact.ownerIds : []),
          "demo-profile-admin"
        ];
        const recordedBy = recordedByCandidates.find((candidate) => profileIds.has(candidate))
          || state.profiles[0]?.id
          || "demo-profile-admin";
        const alreadyDirectlyInvitable =
          contact.mitmachenConsentStatus === "granted"
          && DIRECTLY_INVITABLE_MITMACHEN_SOURCES.has(source)
          && Number.isFinite(effectiveTime)
          && effectiveTime <= new Date(NOW).getTime()
          && profileIds.has(contact.mitmachenConsentRecordedBy);
        const wasArchived = ["archived", "Archiviert"].includes(contact.status);
        return {
          ...contact,
          status: wasArchived ? "active" : contact.status,
          note: wasArchived
            ? "Synthetischer Demo-Kontakt für öffentliche Format-Einladungen."
            : contact.note,
          mitmachenConsentStatus: "granted",
          mitmachenConsentEffectiveAt: Number.isFinite(effectiveTime) && effectiveTime <= new Date(NOW).getTime()
            ? effectiveAt
            : NOW,
          mitmachenConsentSource: DIRECTLY_INVITABLE_MITMACHEN_SOURCES.has(source) ? source : "written",
          mitmachenConsentTextVersion: contact.mitmachenConsentTextVersion || "mitmachen-kontakt-v2",
          mitmachenConsentRecordedBy: recordedBy,
          mitmachenConsentNote: alreadyDirectlyInvitable && contact.mitmachenConsentNote
            ? contact.mitmachenConsentNote
            : "Vollständig dokumentierte, rein synthetische #Mitmachen-Einwilligung für Einladungen zu Formaten."
        };
      });
    }
    state.organizations ||= [];
    state.organizationPrimarySystems = state.organizations.flatMap((organization) => organization.primarySystems || []);
    state.expertGroups ||= [];
    state.expertContacts ||= [];
    state.expertOrganizations ||= [];
    state.expertEntityLinks ||= [];
    state.stakeholderTypes ||= [];
    state.stakeholderOrganizations ||= [];
    state.stakeholderPeople ||= [];
    state.savedViews ||= [];
    state.hospitationSlots ||= [];
    state.hospitations ||= [];
    state.hospitationObservations ||= [];
    state.roadmapItems ||= [];
    state.hospitationRoadmapAssessments ||= [];
    state.hospitationUnmetNeeds ||= [];
    state.formats ||= [];
    state.activityEvents ||= [];
    state.notifications ||= [];
    state.registrations ||= [];
    state.contactNotes ||= [];
    state.contactNoteAttachments ||= [];
    state.userSettings ||= {};
    if (onboardingPreview) {
      state.userSettings = {
        ...state.userSettings,
        userId: state.currentProfileId,
        preferences: {
          ...(state.userSettings.preferences || {}),
          onboarding: {
            version: 2,
            currentStep: "welcome"
          }
        }
      };
    }
    state.formatCreateRequests ||= [];
    return state;
  }

  let state = createState();

  function contactOwnerIds(contact = {}) {
    const ownerArrays = [contact.ownerIds, contact.owner_ids].filter(Array.isArray);
    if (ownerArrays.length) {
      const normalizedOwnerIds = [...new Set(ownerArrays.flat().map((ownerId) => String(ownerId || "").trim()).filter(Boolean))];
      if (normalizedOwnerIds.length) return normalizedOwnerIds;
    }
    const ownerId = String(contact.ownerId || contact.owner_id || "").trim();
    return ownerId ? [ownerId] : [];
  }

  function currentProfileOwnsContact(contact = {}) {
    return Boolean(state.currentProfileId) && contactOwnerIds(contact).includes(state.currentProfileId);
  }

  function currentDemoProfile() {
    return state.profiles.find((profile) => profile.id === state.currentProfileId) || state.profiles[0] || {};
  }

  function currentDemoProfileIsAdmin() {
    return String(currentDemoProfile().role || "").toLowerCase() === "admin";
  }

  function isEhcOnlyContact(contact = {}) {
    const ehcStatus = String(contact.ehcConsentStatus || contact.ehc_consent_status || "not_requested");
    const mitmachenStatus = String(contact.mitmachenConsentStatus || contact.mitmachen_consent_status || "not_requested");
    const mitmachenSource = String(contact.mitmachenConsentSource || contact.mitmachen_consent_source || "").trim();
    const hasWrittenMitmachenPermission = mitmachenStatus === "granted"
      && ["online_form", "email", "written"].includes(mitmachenSource);
    const hasEhcHistory = ehcStatus !== "not_requested"
      || [
        contact.ehcConsentEffectiveAt,
        contact.ehc_consent_effective_at,
        contact.ehcConsentSource,
        contact.ehc_consent_source,
        contact.ehcConsentTextVersion,
        contact.ehc_consent_text_version,
        contact.ehcConsentRecordedBy,
        contact.ehc_consent_recorded_by,
        contact.ehcConsentNote,
        contact.ehc_consent_note
      ].some((value) => Boolean(String(value || "").trim()));
    return hasEhcHistory && !hasWrittenMitmachenPermission;
  }

  function restrictedEhcContact(contact = {}) {
    return isEhcOnlyContact(contact) && !currentProfileOwnsContact(contact);
  }

  function projectRestrictedEhcContact(contact = {}) {
    return {
      id: contact.id || "",
      name: "Geschützter EHC-Kontakt",
      displayName: "Geschützter EHC-Kontakt",
      organizationId: "",
      organization: "",
      category: "",
      specialty: "",
      contactRole: "",
      priority: "",
      ownerId: "",
      ownerIds: [],
      owner: "",
      postalCode: "",
      city: "",
      state: "",
      lat: null,
      lon: null,
      email: "",
      phone: "",
      linkedin: "",
      relationshipBasis: contact.relationshipBasis || contact.relationship_basis || "review_required",
      relationshipBasisEffectiveAt: "",
      relationshipBasisRecordedBy: "",
      relationshipBasisNote: "",
      mitmachenConsentStatus: contact.mitmachenConsentStatus || contact.mitmachen_consent_status || "not_requested",
      mitmachenConsentEffectiveAt: "",
      mitmachenConsentSource: "",
      mitmachenConsentTextVersion: "",
      mitmachenConsentRecordedBy: "",
      mitmachenConsentNote: "",
      ehcConsentStatus: contact.ehcConsentStatus || contact.ehc_consent_status || "granted",
      ehcConsentEffectiveAt: "",
      ehcConsentSource: "",
      ehcConsentTextVersion: "",
      ehcConsentRecordedBy: "",
      ehcConsentNote: "",
      themes: [],
      note: "",
      notes: "",
      nextStep: "",
      sources: [],
      image: "",
      imageStoragePath: "",
      imageKind: "",
      imageMimeType: "",
      imageSourceLabel: "",
      imageRightsNote: "",
      status: contact.status || "active",
      createdAt: "",
      updatedAt: "",
      profileAccess: "ehc_restricted",
      contactChannelAccess: "restricted"
    };
  }

  function projectContactForCurrentProfile(contact) {
    if (!contact) return contact;
    const hasAccess = currentProfileOwnsContact(contact);
    if (isEhcOnlyContact(contact)) {
      if (!hasAccess) return projectRestrictedEhcContact(contact);
      return {
        ...contact,
        profileAccess: "ehc_authorized",
        ...(OWNER_ONLY_CONTACT_CHANNELS ? { contactChannelAccess: "owner" } : {})
      };
    }
    if (!OWNER_ONLY_CONTACT_CHANNELS) return contact;
    return {
      ...contact,
      email: hasAccess ? (contact.email || "") : "",
      phone: hasAccess ? (contact.phone || "") : "",
      contactChannelAccess: hasAccess ? "owner" : "restricted"
    };
  }

  function activityContactId(activity = {}) {
    const directContactId = activity.contactId || activity.contact_id || activity.contact?.id || "";
    if (directContactId) return String(directContactId);
    return String(activity.objectType || activity.object_type || "").toLowerCase() === "contact"
      ? String(activity.objectId || activity.object_id || "")
      : "";
  }

  function isSensitiveContactField(fieldName) {
    const normalizedFieldName = String(fieldName || "").trim().toLowerCase();
    if (SENSITIVE_CONTACT_FIELDS.has(normalizedFieldName)) return true;
    const compactFieldName = normalizedFieldName.replace(/[^a-z0-9]/g, "");
    return [...SENSITIVE_CONTACT_FIELDS].some((field) => compactFieldName.endsWith(field));
  }

  function redactSensitiveActivityChanges(changes) {
    if (Array.isArray(changes)) {
      return changes.filter((change) => !isSensitiveContactField(change?.fieldName || change?.field_name));
    }
    if (changes && typeof changes === "object") {
      return Object.fromEntries(Object.entries(changes).filter(([fieldName]) => !isSensitiveContactField(fieldName)));
    }
    return changes;
  }

  function projectActivityForCurrentProfile(activity) {
    if (!activity) return activity;
    const contactId = activityContactId(activity);
    if (!contactId) return activity;
    const contact = state.contacts.find((item) => item.id === contactId);
    if (contact && restrictedEhcContact(contact)) return null;
    if (!OWNER_ONLY_CONTACT_CHANNELS) return activity;
    if (contact && currentProfileOwnsContact(contact)) return activity;
    return {
      ...activity,
      changes: redactSensitiveActivityChanges(activity.changes)
    };
  }

  function projectChangeRowsForCurrentProfile(rows = []) {
    return rows.filter((change) => {
      const contactId = String(change.contactId || change.contact_id || "");
      const contact = state.contacts.find((item) => item.id === contactId);
      if (contact && restrictedEhcContact(contact)) return false;
      if (!OWNER_ONLY_CONTACT_CHANNELS) return true;
      if (!isSensitiveContactField(change.fieldName || change.field_name)) return true;
      return Boolean(contact && currentProfileOwnsContact(contact));
    });
  }

  function projectStateForCurrentProfile() {
    const projected = clone(state);
    projected.contacts = state.contacts.map(projectContactForCurrentProfile);
    projected.activityEvents = state.activityEvents.map(projectActivityForCurrentProfile).filter(Boolean);
    if (Array.isArray(state.changes)) projected.changes = projectChangeRowsForCurrentProfile(state.changes);
    const restrictedContactIds = new Set(state.contacts.filter(restrictedEhcContact).map((contact) => contact.id));
    const hasRestrictedContact = (row = {}) => restrictedContactIds.has(String(row.contactId || row.contact_id || ""));
    projected.contactNotes = state.contactNotes.filter((note) => !hasRestrictedContact(note));
    projected.contactNoteAttachments = state.contactNoteAttachments.filter((attachment) => !hasRestrictedContact(attachment));
    projected.hospitations = state.hospitations.filter((hospitation) => !hasRestrictedContact(hospitation));
    projected.formats = state.formats.map((format) => ({
      ...format,
      participants: (format.participants || []).filter((participant) => !hasRestrictedContact(participant))
    }));
    projected.expertEntityLinks = state.expertEntityLinks.filter((link) => !hasRestrictedContact(link));
    projected.notifications = state.notifications.filter((notification) => {
      const contactId = notification.contactId
        || notification.contact_id
        || (["contact", "person"].includes(notification.objectType) ? notification.objectId : "")
        || (["contact", "person"].includes(notification.entityType) ? notification.entityId : "");
      return !restrictedContactIds.has(String(contactId || ""));
    });
    return clone(projected);
  }

  function bodyHasSensitiveContactFields(body = {}) {
    return [...SENSITIVE_CONTACT_FIELDS].some((field) => Object.hasOwn(body, field));
  }

  function bodySetsSensitiveContactFields(body = {}) {
    return [...SENSITIVE_CONTACT_FIELDS].some((field) =>
      Object.hasOwn(body, field) && String(body[field] || "").trim() !== ""
    );
  }

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-local-${String(idCounter).padStart(3, "0")}`;
  }

  function normalizedEntityName(value = "") {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
  }

  function withDemoContactConsentDefaults(contact = {}) {
    return {
      relationshipBasis: "review_required",
      relationshipBasisEffectiveAt: "",
      relationshipBasisRecordedBy: "",
      relationshipBasisNote: "",
      mitmachenConsentStatus: "not_requested",
      mitmachenConsentEffectiveAt: "",
      mitmachenConsentSource: "",
      mitmachenConsentTextVersion: "",
      mitmachenConsentRecordedBy: "",
      mitmachenConsentNote: "",
      ehcConsentStatus: "not_requested",
      ehcConsentEffectiveAt: "",
      ehcConsentSource: "",
      ehcConsentTextVersion: "",
      ehcConsentRecordedBy: "",
      ehcConsentNote: "",
      ...contact
    };
  }

  function demoReferenceError(message, status = 400) {
    return Object.assign(new Error(message), { status });
  }

  function normalizeDemoHospitationDay(value) {
    const raw = String(value || "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) throw demoReferenceError("Der Hospitationstag muss im Format YYYY-MM-DD angegeben werden.");
    const [, year, month, day] = match.map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day
    ) {
      throw demoReferenceError("Der Hospitationstag ist ungültig.");
    }
    return raw;
  }

  function normalizeDemoEntityReference(reference, label) {
    if (reference === null || typeof reference === "undefined") return null;
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
      throw demoReferenceError(`${label} ist ungültig.`);
    }
    const mode = String(reference.mode || "").trim();
    if (mode === "existing") {
      const id = String(reference.id || "").trim();
      if (!id) throw demoReferenceError(`${label} benötigt eine ID.`);
      return { mode, id, name: "" };
    }
    if (mode === "create") {
      const name = String(reference.name || "").trim().replace(/\s+/g, " ");
      if (!name) throw demoReferenceError(`${label} benötigt einen Namen.`);
      return { mode, id: "", name };
    }
    throw demoReferenceError(`${label} benötigt den Modus "existing" oder "create".`);
  }

  function resolveDemoHospitationEntities(payload = {}, current = {}) {
    const organizationReference = normalizeDemoEntityReference(payload.organization, "Organisation");
    const contactReference = normalizeDemoEntityReference(payload.contact, "Kontakt");
    let organization = null;
    if (organizationReference?.mode === "existing") {
      organization = state.organizations.find((item) => item.id === organizationReference.id) || null;
      if (!organization) throw demoReferenceError("Organisation wurde nicht gefunden.", 404);
    } else if (organizationReference?.mode === "create") {
      organization = state.organizations.find((item) =>
        !["archived", "Archiviert"].includes(item.status)
        && normalizedEntityName(item.name) === normalizedEntityName(organizationReference.name)
      ) || null;
      if (!organization) {
        organization = {
          id: nextId("demo-organization"),
          name: organizationReference.name,
          normalizedName: normalizedEntityName(organizationReference.name),
          sector: payload.sector || "",
          source: "Hospitationstermin",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        state.organizations.unshift(organization);
      }
    }
    let contact = contactReference
      ? null
      : state.contacts.find((item) => item.id === (current.contactId || current.contact_id)) || null;
    if (contactReference?.mode === "existing") {
      contact = state.contacts.find((item) => item.id === contactReference.id) || null;
      if (!contact) throw demoReferenceError("Kontakt wurde nicht gefunden.", 404);
    } else if (contactReference?.mode === "create") {
      const sameNameContacts = state.contacts.filter((item) =>
        !["archived", "Archiviert"].includes(item.status)
        && normalizedEntityName(item.displayName || item.name) === normalizedEntityName(contactReference.name)
      );
      const matchingContacts = organization?.id
        ? sameNameContacts.filter((item) => String(item.organizationId || item.organization_id || "") === organization.id)
        : organization?.name
          ? sameNameContacts.filter((item) => normalizedEntityName(item.organization) === normalizedEntityName(organization.name))
          : sameNameContacts;
      if (matchingContacts.length > 1) {
        throw demoReferenceError("Mehrere bestehende Kontakte haben diesen Namen. Bitte wähle den passenden Kontakt aus.");
      }
      contact = matchingContacts[0] || null;
      if (!contact) {
        contact = withDemoContactConsentDefaults({
          id: nextId("demo-contact"),
          name: contactReference.name,
          displayName: contactReference.name,
          organizationId: organization?.id || "",
          organization: organization?.name || "",
          category: payload.sector || "",
          priority: "Mittel",
          ownerId: payload.ownerId || state.currentProfileId,
          ownerIds: [payload.ownerId || state.currentProfileId].filter(Boolean),
          sources: ["Hospitationstermin"],
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        state.contacts.unshift(contact);
      }
    }
    const contactOrganizationId = String(contact?.organizationId || contact?.organization_id || "").trim();
    if (organization?.id && contactOrganizationId && contactOrganizationId !== organization.id) {
      throw demoReferenceError("Der ausgewählte Kontakt gehört zu einer anderen Organisation.");
    }
    if (!organization && contactOrganizationId) {
      organization = state.organizations.find((item) => item.id === contactOrganizationId) || null;
    }
    if (!organization && contact?.organization) {
      organization = state.organizations.find((item) =>
        normalizedEntityName(item.name) === normalizedEntityName(contact.organization)
      ) || null;
    }
    return { contact, organization };
  }

  function json(payload, status = 200, headers = {}) {
    return new Response(JSON.stringify(clone(payload)), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Versorgungs-Kompass-Demo": "memory-only",
        ...headers
      }
    });
  }

  function error(message, status = 400, code = "", extras = {}) {
    const blockedContactIds = Array.isArray(extras.blockedContactIds)
      ? [...new Set(extras.blockedContactIds.map((contactId) => String(contactId || "").trim()).filter(Boolean))]
      : [];
    const details = extras.details && typeof extras.details === "object"
      ? { ...extras.details }
      : {};
    if (blockedContactIds.length) details.blockedContactIds = blockedContactIds;
    return json({
      error: message,
      ...(code ? { code } : {}),
      ...extras,
      ...(blockedContactIds.length ? { blockedContactIds } : {}),
      ...(Object.keys(details).length ? { details } : {})
    }, status);
  }

  function activeRows(rows, includeArchived) {
    return rows.filter((row) => includeArchived || !["archived", "Archiviert"].includes(row.status));
  }

  function mergeById(target, rows) {
    (rows || []).forEach((row) => {
      const index = target.findIndex((item) => item.id === row.id);
      if (index >= 0) target[index] = { ...target[index], ...row, updatedAt: NOW };
      else target.push({ ...row, id: row.id || nextId("demo-import"), createdAt: NOW, updatedAt: NOW });
    });
  }

  function collectionForPath(path) {
    return {
      "/api/profiles": state.profiles,
      "/api/contacts": state.contacts,
      "/api/organizations": state.organizations,
      "/api/organization-primary-systems": state.organizationPrimarySystems,
      "/api/expert-groups": state.expertGroups,
      "/api/expert-contacts": state.expertContacts,
      "/api/expert-organizations": state.expertOrganizations,
      "/api/expert-entity-links": state.expertEntityLinks,
      "/api/stakeholder-types": state.stakeholderTypes,
      "/api/stakeholder-organizations": state.stakeholderOrganizations,
      "/api/stakeholder-people": state.stakeholderPeople,
      "/api/saved-views": state.savedViews,
      "/api/hospitation-slots": state.hospitationSlots,
      "/api/hospitations": state.hospitations,
      "/api/hospitation-observations": state.hospitationObservations,
      "/api/roadmap-items": state.roadmapItems,
      "/api/hospitation-roadmap-assessments": state.hospitationRoadmapAssessments,
      "/api/hospitation-unmet-needs": state.hospitationUnmetNeeds,
      "/api/formats": state.formats,
      "/api/activities": state.activityEvents,
      "/api/contact-notes": state.contactNotes,
      "/api/contact-note-attachments": state.contactNoteAttachments
    }[path] || null;
  }

  function propertyForResource(resource) {
    return {
      contacts: "contacts",
      organizations: "organizations",
      "organization-primary-systems": "organizationPrimarySystems",
      "expert-contacts": "expertContacts",
      "expert-organizations": "expertOrganizations",
      "expert-entity-links": "expertEntityLinks",
      "hospitation-slots": "hospitationSlots",
      hospitations: "hospitations",
      "hospitation-observations": "hospitationObservations",
      formats: "formats",
      "saved-views": "savedViews"
    }[resource] || "";
  }

  function prefixForResource(resource) {
    return {
      contacts: "demo-contact",
      organizations: "demo-organization",
      "organization-primary-systems": "demo-primary-system",
      "expert-contacts": "demo-expert-contact",
      "expert-organizations": "demo-expert-organization",
      "expert-entity-links": "demo-expert-link",
      "hospitation-slots": "demo-hospitation-slot",
      hospitations: "demo-hospitation",
      "hospitation-observations": "demo-observation",
      formats: "demo-format",
      "saved-views": "demo-view"
    }[resource] || "demo-item";
  }

  async function requestBody(input, init) {
    const body = init?.body;
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch (_error) { return {}; }
    }
    if (body && typeof body === "object" && !(body instanceof FormData)) return body;
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const text = await input.clone().text();
        return text ? JSON.parse(text) : {};
      } catch (_error) {
        return {};
      }
    }
    return {};
  }

  function headerValue(headers, name) {
    if (!headers) return "";
    if (typeof headers.get === "function") return String(headers.get(name) || "");
    const normalizedName = String(name || "").toLowerCase();
    if (Array.isArray(headers)) {
      const match = headers.find(([key]) => String(key || "").toLowerCase() === normalizedName);
      return String(match?.[1] || "");
    }
    const match = Object.entries(headers).find(([key]) => String(key || "").toLowerCase() === normalizedName);
    return String(match?.[1] || "");
  }

  function requestHeaderValue(input, init, name) {
    const initValue = headerValue(init?.headers, name);
    if (initValue) return initValue;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return headerValue(input.headers, name);
    }
    return "";
  }

  function expectedUpdatedAtFromRequest(body = {}, ifMatch = "") {
    return String(body.expectedUpdatedAt || body.expected_updated_at || ifMatch || "")
      .trim()
      .replace(/^W\//u, "")
      .replace(/^"|"$/gu, "");
  }

  function comparableTimestamp(value) {
    const timestamp = new Date(value || "");
    return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : String(value || "");
  }

  function timestampsMatch(left, right) {
    return comparableTimestamp(left) === comparableTimestamp(right);
  }

  function filterActivities(url) {
    const eventKey = url.searchParams.get("eventKey") || "";
    const category = url.searchParams.get("category") || "";
    const action = url.searchParams.get("action") || url.searchParams.get("kind") || "";
    const origin = url.searchParams.get("origin") || "";
    const actor = url.searchParams.get("changedBy") || "";
    const query = (url.searchParams.get("q") || "").toLocaleLowerCase("de");
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    return state.activityEvents.map(projectActivityForCurrentProfile).filter(Boolean).filter((item) => {
      const occurredAt = item.occurredAt || item.occurred_at || "";
      if (eventKey && item.eventKey !== eventKey) return false;
      if (category && item.categoryKey !== category) return false;
      if (action && item.actionKey !== action && item.action !== action) return false;
      if (origin && item.originKey !== origin) return false;
      if (actor && item.actorId !== actor) return false;
      if (from && new Date(occurredAt).getTime() < new Date(from).getTime()) return false;
      if (to && new Date(occurredAt).getTime() > new Date(to).getTime()) return false;
      return !query || JSON.stringify(item).toLocaleLowerCase("de").includes(query);
    });
  }

  function activitySummaryWindow(url, now = new Date()) {
    const fromValue = String(url.searchParams.get("from") || "").trim();
    const toValue = String(url.searchParams.get("to") || "").trim();
    if (!fromValue) return { error: "Der Startzeitpunkt für die Aktivitätsauswertung fehlt." };
    const fromTime = new Date(fromValue).getTime();
    const toTime = toValue ? new Date(toValue).getTime() : now.getTime();
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return { error: "Der Zeitraum für die Aktivitätsauswertung ist ungültig." };
    }
    if (fromTime > toTime) return { error: "Der Startzeitpunkt darf nicht nach dem Endzeitpunkt liegen." };
    if (toTime > now.getTime()) return { error: "Der Endzeitpunkt darf nicht in der Zukunft liegen." };
    if (toTime - fromTime > 31 * 24 * 60 * 60 * 1000) {
      return { error: "Die Aktivitätsauswertung ist auf maximal 31 Tage begrenzt." };
    }
    return {
      from: new Date(fromTime).toISOString(),
      to: new Date(toTime).toISOString()
    };
  }

  function searchContactContent(query, options = {}) {
    const needle = String(query || "").trim().toLocaleLowerCase("de");
    if (!needle) return [];
    const notes = state.contactNotes
      .filter((note) => {
        const contact = state.contacts.find((item) => item.id === (note.contactId || note.contact_id));
        return !contact || !restrictedEhcContact(contact);
      })
      .filter((note) => [note.body, note.text, note.emailSubject].join(" ").toLocaleLowerCase("de").includes(needle))
      .map((note) => ({
        contactId: note.contactId || note.contact_id,
        noteId: note.id,
        resultKind: "free_note",
        title: note.title || "Notiz",
        snippet: note.body || note.text || "",
        occurredAt: note.occurredAt || note.createdAt || note.created_at || NOW,
        rank: 1
      }));
    const attachments = state.contactNoteAttachments
      .filter((attachment) => {
        const contact = state.contacts.find((item) => item.id === (attachment.contactId || attachment.contact_id));
        return !contact || !restrictedEhcContact(contact);
      })
      .filter((attachment) => [attachment.fileName, attachment.file_name, attachment.description, attachment.extractedText, attachment.extracted_text].join(" ").toLocaleLowerCase("de").includes(needle))
      .map((attachment) => ({
        contactId: attachment.contactId || attachment.contact_id,
        noteId: attachment.noteId || attachment.note_id,
        attachmentId: attachment.id,
        resultKind: "attachment",
        title: attachment.fileName || attachment.file_name || "Anhang",
        snippet: attachment.description || attachment.extractedText || attachment.extracted_text || "",
        occurredAt: attachment.uploadedAt || attachment.uploaded_at || NOW,
        rank: 1.2
      }));
    const items = [...attachments, ...notes];
    const seenContactIds = new Set();
    const scopedItems = options.distinctContacts
      ? items.filter((item) => {
          if (seenContactIds.has(item.contactId)) return false;
          seenContactIds.add(item.contactId);
          return true;
        })
      : items;
    return scopedItems.slice(0, Math.max(1, Math.min(Number(options.limit) || 40, 100)));
  }

  function byteArrayFromBase64(value) {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function safeDemoMediaUrl(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(candidate)) return candidate;
    try {
      const url = new URL(candidate, window.location.origin);
      if (["http:", "https:"].includes(url.protocol) && url.origin === window.location.origin && !url.pathname.startsWith("/api/")) return url.href;
    } catch (_error) {
      // Ungültige oder externe Medienreferenzen bleiben in der öffentlichen Demo leer.
    }
    return "";
  }

  function sanitizeDemoMediaFields(property, payload = {}) {
    const sanitized = { ...payload };
    const fields = property === "contacts"
      ? ["image", "imageUrl", "image_url", "avatar", "avatarUrl", "avatar_url"]
      : ["logo", "logoUrl", "logo_url", "image", "imageUrl", "image_url"];
    for (const field of fields) {
      if (Object.hasOwn(sanitized, field)) sanitized[field] = safeDemoMediaUrl(sanitized[field]);
    }
    if (property === "contacts") {
      sanitized.imageStoragePath = "";
      sanitized.image_storage_path = "";
      if (Object.hasOwn(sanitized, "imageSourceUrl")) sanitized.imageSourceUrl = safeDemoMediaUrl(sanitized.imageSourceUrl);
      if (Object.hasOwn(sanitized, "image_source_url")) sanitized.image_source_url = safeDemoMediaUrl(sanitized.image_source_url);
    }
    return sanitized;
  }

  function updateOrganizationPrimarySystems() {
    state.organizations = state.organizations.map((organization) => ({
      ...organization,
      primarySystems: state.organizationPrimarySystems.filter((system) =>
        (system.organizationId || system.organization_id) === organization.id
      )
    }));
  }

  function addDemoActivity({ eventKey, categoryKey, actionKey, objectType, objectId, contactId = "", title, changes = [] }) {
    const profile = state.profiles.find((item) => item.id === state.currentProfileId) || state.profiles[0] || {};
    const contact = state.contacts.find((item) => item.id === contactId) || {};
    state.activityEvents.unshift({
      id: nextId("demo-activity"),
      eventKey,
      categoryKey,
      actionKey,
      objectType,
      objectId,
      contactId,
      title,
      actorId: profile.id || "",
      actor: {
        id: profile.id || "",
        displayName: profile.display_name || profile.displayName || "Systemadministration",
        email: profile.email || "",
        role: profile.role || "admin",
        team: profile.team || ""
      },
      contact: {
        id: contact.id || "",
        name: contact.name || "",
        organization: contact.organization || "",
        sector: contact.category || "",
        city: contact.city || "",
        state: contact.state || ""
      },
      occurredAt: new Date().toISOString(),
      originKey: "demo_memory",
      references: [{ type: objectType, id: objectId, label: contact.name || title }],
      changes,
      metadata: { synthetic: true, memoryOnly: true }
    });
  }

  async function handleDemoApi(url, method, body, ifMatch = "") {
    const path = url.pathname;
    const includeArchived = url.searchParams.get("includeArchived") === "true";

    if (method === "GET" && path === "/api/profile") {
      return json(state.profiles.find((profile) => profile.id === state.currentProfileId) || state.profiles[0] || null);
    }
    if (method === "PATCH" && path === "/api/profile") {
      const index = state.profiles.findIndex((profile) => profile.id === state.currentProfileId);
      if (index < 0) return error("Demo-Profil wurde nicht gefunden.", 404);
      state.profiles[index] = {
        ...state.profiles[index],
        ...body,
        display_name: body.displayName ?? body.display_name ?? state.profiles[index].display_name,
        updated_at: new Date().toISOString()
      };
      return json(state.profiles[index]);
    }
    if (["POST", "DELETE"].includes(method) && path === "/api/profile/avatar") {
      const index = state.profiles.findIndex((profile) => profile.id === state.currentProfileId);
      if (index < 0) return error("Demo-Profil wurde nicht gefunden.", 404);
      state.profiles[index] = {
        ...state.profiles[index],
        avatar_url: method === "POST" && body.data ? `data:${body.contentType || "image/png"};base64,${body.data}` : "",
        updated_at: new Date().toISOString()
      };
      return json(method === "POST" ? { profile: state.profiles[index] } : state.profiles[index]);
    }
    if (method === "GET" && path === "/api/user-settings") return json(state.userSettings);
    if (method === "PUT" && path === "/api/user-settings") {
      state.userSettings = { ...state.userSettings, ...body, userId: state.currentProfileId, updatedAt: new Date().toISOString() };
      return json(state.userSettings);
    }
    if (method === "GET" && path === "/api/politics/health-committee") {
      if (
        publicPoliticsDirectory?.available === true
        && publicPoliticsDirectory.publicDirectory === true
        && publicPoliticsDirectory.memberCount === 38
        && publicPoliticsDirectory.members?.length === 38
      ) {
        return json(clone(publicPoliticsDirectory));
      }
      return json({
        available: false,
        demo: true,
        committee: "Ausschuss für Gesundheit",
        parliamentaryTerm: "21. Wahlperiode",
        membership: "Ordentliche Mitglieder",
        sourceUrl: "https://www.bundestag.de/ausschuesse/gesundheit",
        fetchedAt: null,
        memberCount: 0,
        members: []
      });
    }

    if (path === "/api/network-registrations" && method === "GET") {
      const status = url.searchParams.get("status") || "";
      return json({ items: state.registrations.filter((item) => !status || item.status === status) });
    }
    if (path === "/api/network-registrations" && method === "POST") {
      const registration = {
        ...body,
        id: nextId("demo-registration"),
        status: "neu",
        submittedAt: body.submittedAt || body.submitted_at || new Date().toISOString(),
        submitted_at: body.submittedAt || body.submitted_at || new Date().toISOString(),
        privacyCheckStatus: "synthetic_demo",
        privacy_check_status: "synthetic_demo"
      };
      state.registrations.unshift(registration);
      return json({ ok: true, registration, demo: true, persistence: "memory-only" }, 201);
    }
    const registrationMatch = path.match(/^\/api\/network-registrations\/([^/]+)$/);
    if (registrationMatch && method === "PATCH") {
      const id = decodeURIComponent(registrationMatch[1]);
      const index = state.registrations.findIndex((item) => item.id === id);
      if (index < 0) return error("Synthetische Registrierung wurde nicht gefunden.", 404);
      state.registrations[index] = { ...state.registrations[index], ...body, updatedAt: new Date().toISOString() };
      return json({ registration: state.registrations[index] });
    }

    if (method === "GET" && path === "/api/notifications") {
      const unreadOnly = url.searchParams.get("unreadOnly") === "true";
      const context = url.searchParams.get("context") || "all";
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      const rows = state.notifications.filter((item) => {
        const unread = item.unread !== false && !(item.readAt || item.read_at);
        const contextMatches = context === "all" || !context
          ? true
          : context === "operational"
            ? item.context !== "product"
            : item.context === context;
        return (!unreadOnly || unread) && contextMatches;
      });
      return json({ items: rows.slice(offset, offset + limit), nextOffset: Math.min(rows.length, offset + limit), hasMore: rows.length > offset + limit });
    }
    if (method === "GET" && path === "/api/notifications/summary") {
      const unread = state.notifications.filter((item) => item.context !== "product" && item.unread !== false && !(item.readAt || item.read_at));
      const byContext = unread.reduce((result, item) => ({ ...result, [item.context]: (result[item.context] || 0) + 1 }), {});
      return json({ unreadTotal: unread.length, byContext });
    }
    if (method === "PATCH" && (path === "/api/notifications/read" || /^\/api\/notifications\/[^/]+\/read$/.test(path))) {
      const ids = path === "/api/notifications/read" ? (body.ids || []) : [decodeURIComponent(path.split("/").at(-2))];
      state.notifications = state.notifications.map((item) => ids.includes(item.id || item.eventId)
        ? { ...item, unread: false, readAt: item.readAt || new Date().toISOString() }
        : item);
      return json({ ok: true });
    }

    if (method === "GET" && path === "/api/activities/summary") {
      const summaryWindow = activitySummaryWindow(url);
      if (summaryWindow.error) return error(summaryWindow.error, 400);
      url.searchParams.set("from", summaryWindow.from);
      url.searchParams.set("to", summaryWindow.to);
      return json({ count: filterActivities(url).length, from: summaryWindow.from, to: summaryWindow.to });
    }
    if (method === "GET" && path === "/api/activities") {
      const rows = filterActivities(url);
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
      return json({ items: rows.slice(offset, offset + limit), nextOffset: Math.min(rows.length, offset + limit), hasMore: rows.length > offset + limit, nextCursor: null });
    }
    if (method === "GET" && path === "/api/contact-content-search") {
      return json({
        items: searchContactContent(url.searchParams.get("query") || url.searchParams.get("q"), {
          limit: url.searchParams.get("limit"),
          distinctContacts: url.searchParams.get("distinctContacts") === "true"
        })
      });
    }
    const contactHistoryMatch = path.match(/^\/api\/contacts\/([^/]+)\/history$/);
    if (method === "GET" && contactHistoryMatch) {
      const contactId = decodeURIComponent(contactHistoryMatch[1]);
      return json({ items: filterActivities(url).filter((item) => item.contactId === contactId) });
    }

    const contactImageWriteMatch = path.match(/^\/api\/contacts\/([^/]+)\/image$/);
    if (contactImageWriteMatch && ["POST", "DELETE"].includes(method)) {
      const contactId = decodeURIComponent(contactImageWriteMatch[1]);
      const index = state.contacts.findIndex((item) => item.id === contactId);
      if (index < 0) return error("Synthetischer Kontakt wurde nicht gefunden.", 404);
      if (restrictedEhcContact(state.contacts[index])) {
        return error("EHC-only-Profile dürfen nur von ihren Contact Ownern geändert werden.", 403);
      }
      const contentType = DEMO_IMAGE_TYPES.has(String(body.contentType || "").toLowerCase())
        ? String(body.contentType).toLowerCase()
        : "image/png";
      const imageData = String(body.data || "");
      let imageFileSize = 0;
      if (method === "POST") {
        try { imageFileSize = byteArrayFromBase64(imageData).length; }
        catch (_error) { return error("Das synthetische Kontaktbild ist nicht gültig.", 400); }
        if (!imageData) return error("Das synthetische Kontaktbild ist leer.", 400);
      }
      state.contacts[index] = method === "POST"
        ? {
            ...state.contacts[index],
            image: `data:${contentType};base64,${imageData}`,
            imageStoragePath: "",
            imageKind: "upload",
            imageMimeType: contentType,
            imageFileSize,
            imageWidth: Number(body.width) || 1,
            imageHeight: Number(body.height) || 1,
            imageSourceLabel: body.sourceLabel || "Lokaler Demo-Upload",
            imageRightsNote: body.rightsNote || "",
            imageUpdatedAt: new Date().toISOString(),
            imageUpdatedBy: state.currentProfileId
          }
        : {
            ...state.contacts[index],
            image: "",
            imageStoragePath: "",
            imageKind: "",
            imageMimeType: "",
            imageFileSize: 0,
            imageWidth: 0,
            imageHeight: 0,
            imageSourceLabel: "",
            imageRightsNote: "",
            imageUpdatedAt: new Date().toISOString(),
            imageUpdatedBy: state.currentProfileId
          };
      return json(projectContactForCurrentProfile(state.contacts[index]));
    }

    const entityReadMatch = path.match(/^\/api\/(contacts|organizations|formats|hospitations)\/([^/]+)$/);
    if (method === "GET" && entityReadMatch) {
      const property = propertyForResource(entityReadMatch[1]);
      const row = state[property]?.find((item) => item.id === decodeURIComponent(entityReadMatch[2]));
      return row
        ? json(property === "contacts" ? projectContactForCurrentProfile(row) : row)
        : error("Synthetischer Datensatz wurde nicht gefunden.", 404);
    }

    if (method === "GET") {
      const collection = collectionForPath(path);
      if (collection) {
        let rows = activeRows(collection, includeArchived);
        if (["/api/contact-notes", "/api/contact-note-attachments", "/api/hospitations"].includes(path)) {
          rows = rows.filter((row) => {
            const contact = state.contacts.find((item) => item.id === (row.contactId || row.contact_id));
            return !contact || !restrictedEhcContact(contact);
          });
        }
        if (path === "/api/formats") {
          rows = rows.map((format) => ({
            ...format,
            participants: (format.participants || []).filter((participant) => {
              const contact = state.contacts.find((item) => item.id === (participant.contactId || participant.contact_id));
              return !contact || !restrictedEhcContact(contact);
            })
          }));
        }
        const status = url.searchParams.get("status") || "";
        const stakeholderTypeId = url.searchParams.get("stakeholderTypeId") || "";
        const hospitationId = url.searchParams.get("hospitationId") || "";
        const contactId = url.searchParams.get("contactId") || "";
        const organizationIds = (url.searchParams.get("organizationIds") || "").split(",").filter(Boolean);
        if (status) rows = rows.filter((row) => row.status === status);
        if (stakeholderTypeId) rows = rows.filter((row) => (row.stakeholderTypeId || row.stakeholder_type_id || row.stakeholderType) === stakeholderTypeId);
        if (hospitationId) rows = rows.filter((row) => (row.hospitationId || row.hospitation_id) === hospitationId);
        if (contactId) rows = rows.filter((row) => (row.contactId || row.contact_id) === contactId);
        if (organizationIds.length) rows = rows.filter((row) => organizationIds.includes(row.organizationId || row.organization_id));
        if (path === "/api/contacts") rows = rows.map(projectContactForCurrentProfile);
        return json({ items: rows });
      }
    }

    if (method === "POST" && path === "/api/stakeholder-import") {
      mergeById(state.stakeholderTypes, body.types);
      mergeById(state.stakeholderOrganizations, (body.organizations || []).map((row) => sanitizeDemoMediaFields("stakeholderOrganizations", row)));
      mergeById(state.stakeholderPeople, body.people);
      return json({ types: state.stakeholderTypes, organizations: state.stakeholderOrganizations, people: state.stakeholderPeople });
    }

    if (method === "POST" && path === "/api/contact-notes") {
      const noteContact = state.contacts.find((item) => item.id === (body.contactId || body.contact_id));
      if (noteContact && restrictedEhcContact(noteContact)) {
        return error("Notizen zu EHC-only-Profilen dürfen nur von ihren Contact Ownern erfasst werden.", 403);
      }
      const created = {
        ...body,
        id: body.id || nextId("demo-note"),
        contact_id: body.contactId || body.contact_id,
        body: body.body || body.text || "",
        created_by: state.currentProfileId,
        updated_by: state.currentProfileId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.contactNotes.unshift(created);
      addDemoActivity({ eventKey: "contact.note.created", categoryKey: "note_document", actionKey: "create", objectType: "contact_note", objectId: created.id, contactId: created.contact_id, title: "Gesprächsnotiz ergänzt" });
      return json(created, 201);
    }
    const noteMatch = path.match(/^\/api\/contact-notes\/([^/]+)$/);
    if (noteMatch && ["PATCH", "DELETE"].includes(method)) {
      const id = decodeURIComponent(noteMatch[1]);
      const index = state.contactNotes.findIndex((note) => note.id === id);
      if (index < 0) return error("Synthetische Notiz wurde nicht gefunden.", 404);
      const noteContact = state.contacts.find((item) =>
        item.id === (state.contactNotes[index].contactId || state.contactNotes[index].contact_id)
      );
      if (noteContact && restrictedEhcContact(noteContact)) {
        return error("Notizen zu EHC-only-Profilen dürfen nur von ihren Contact Ownern geändert werden.", 403);
      }
      if (method === "DELETE") {
        state.contactNoteAttachments = state.contactNoteAttachments.filter((attachment) =>
          (attachment.noteId || attachment.note_id) !== id
        );
        state.contactNotes.splice(index, 1);
        return json({ ok: true });
      }
      state.contactNotes[index] = { ...state.contactNotes[index], ...body, body: body.body || body.text || state.contactNotes[index].body, updated_at: new Date().toISOString() };
      return json(state.contactNotes[index]);
    }

    if (method === "POST" && path === "/api/contact-note-attachments") {
      const attachmentContact = state.contacts.find((item) => item.id === (body.contactId || body.contact_id));
      if (attachmentContact && restrictedEhcContact(attachmentContact)) {
        return error("Anhänge zu EHC-only-Profilen dürfen nur von ihren Contact Ownern erfasst werden.", 403);
      }
      const created = {
        ...body,
        id: body.id || nextId("demo-attachment"),
        contact_id: body.contactId || body.contact_id,
        note_id: body.noteId || body.note_id,
        file_name: body.fileName || body.file_name,
        mime_type: body.mimeType || body.mime_type,
        file_size: body.fileSize || body.file_size || 0,
        extracted_text: body.extractedText || body.extracted_text || "",
        extraction_status: body.extractionStatus || body.extraction_status || "complete",
        uploaded_at: new Date().toISOString(),
        uploader_id: state.currentProfileId,
        _demoData: body.data || ""
      };
      state.contactNoteAttachments.push(created);
      return json(created, 201);
    }
    const attachmentContentMatch = path.match(/^\/api\/contact-note-attachments\/([^/]+)\/content$/);
    if (method === "GET" && attachmentContentMatch) {
      const attachment = state.contactNoteAttachments.find((item) => item.id === decodeURIComponent(attachmentContentMatch[1]));
      if (!attachment) return error("Synthetischer Anhang wurde nicht gefunden.", 404);
      const attachmentContact = state.contacts.find((item) =>
        item.id === (attachment.contactId || attachment.contact_id)
      );
      if (attachmentContact && restrictedEhcContact(attachmentContact)) {
        return error("Anhänge zu EHC-only-Profilen sind nur für ihre Contact Owner sichtbar.", 403);
      }
      const content = attachment._demoData
        ? byteArrayFromBase64(attachment._demoData)
        : new TextEncoder().encode(attachment.extractedText || attachment.extracted_text || attachment.description || "Synthetischer Demo-Anhang");
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": attachment.mimeType || attachment.mime_type || "text/plain",
          "X-File-Name": encodeURIComponent(attachment.fileName || attachment.file_name || "demo.txt"),
          "Cache-Control": "no-store"
        }
      });
    }
    const attachmentMatch = path.match(/^\/api\/contact-note-attachments\/([^/]+)$/);
    if (method === "DELETE" && attachmentMatch) {
      const id = decodeURIComponent(attachmentMatch[1]);
      const attachment = state.contactNoteAttachments.find((item) => item.id === id);
      const attachmentContact = state.contacts.find((item) =>
        item.id === (attachment?.contactId || attachment?.contact_id)
      );
      if (attachmentContact && restrictedEhcContact(attachmentContact)) {
        return error("Anhänge zu EHC-only-Profilen dürfen nur von ihren Contact Ownern gelöscht werden.", 403);
      }
      state.contactNoteAttachments = state.contactNoteAttachments.filter((item) => item.id !== id);
      return json({ ok: true });
    }

    const nestedHospitationMatch = path.match(/^\/api\/hospitations(?:\/([^/]+))?$/);
    if (
      nestedHospitationMatch
      && (
        (method === "POST" && (Object.hasOwn(body, "contact") || Object.hasOwn(body, "organization")))
        || (method === "PATCH" && (Object.hasOwn(body, "contact") || Object.hasOwn(body, "organization")))
      )
    ) {
      const previousOrganizations = state.organizations;
      const previousContacts = state.contacts;
      const previousHospitations = state.hospitations;
      state.organizations = [...state.organizations];
      state.contacts = [...state.contacts];
      state.hospitations = [...state.hospitations];
      try {
        let current = {};
        let index = -1;
        if (method === "POST") {
          if (!body.contact) throw demoReferenceError("Für einen neuen Hospitationstermin ist ein Kontakt erforderlich.");
          body.scheduledOn = normalizeDemoHospitationDay(body.scheduledOn || body.scheduled_on);
        } else {
          const id = decodeURIComponent(nestedHospitationMatch[1] || "");
          index = state.hospitations.findIndex((item) => item.id === id);
          if (index < 0) throw demoReferenceError("Synthetischer Datensatz wurde nicht gefunden.", 404);
          current = state.hospitations[index];
          if (Object.hasOwn(body, "scheduledOn") || Object.hasOwn(body, "scheduled_on")) {
            body.scheduledOn = normalizeDemoHospitationDay(body.scheduledOn || body.scheduled_on);
          }
        }
        const resolution = resolveDemoHospitationEntities(body, current);
        const now = new Date().toISOString();
        const normalizedBody = { ...body };
        delete normalizedBody.contact;
        delete normalizedBody.organization;
        delete normalizedBody.scheduled_on;
        if (body.contact) {
          normalizedBody.contactId = resolution.contact?.id || "";
          normalizedBody.contactName = resolution.contact?.name || resolution.contact?.displayName || "";
        }
        if (body.organization || body.contact) {
          normalizedBody.organizationId = resolution.organization?.id || resolution.contact?.organizationId || "";
          normalizedBody.organizationName = resolution.organization?.name || resolution.contact?.organization || "";
        }
        if (method === "POST") {
          const created = {
            ...normalizedBody,
            id: normalizedBody.id || nextId("demo-hospitation"),
            createdAt: normalizedBody.createdAt || now,
            updatedAt: now
          };
          state.hospitations.unshift(created);
          addDemoActivity({
            eventKey: "hospitation.created",
            categoryKey: "hospitation",
            actionKey: "create",
            objectType: "hospitation",
            objectId: created.id,
            contactId: created.contactId,
            title: "Synthetischen Hospitationstermin angelegt"
          });
          return json({
            ...created,
            resolvedContact: body.contact ? projectContactForCurrentProfile(resolution.contact) : null,
            resolvedOrganization: resolution.organization
          }, 201);
        }
        state.hospitations[index] = { ...state.hospitations[index], ...normalizedBody, updatedAt: now };
        return json({
          ...state.hospitations[index],
          resolvedContact: body.contact ? projectContactForCurrentProfile(resolution.contact) : null,
          resolvedOrganization: resolution.organization
        });
      } catch (caughtError) {
        state.organizations = previousOrganizations;
        state.contacts = previousContacts;
        state.hospitations = previousHospitations;
        return error(caughtError?.message || "Hospitation konnte nicht gespeichert werden.", caughtError?.status || 400);
      }
    }

    const createResource = {
      "/api/contacts": ["contacts", "demo-contact", body.contact || body],
      "/api/organizations": ["organizations", "demo-organization", body],
      "/api/organization-primary-systems": ["organizationPrimarySystems", "demo-primary-system", body],
      "/api/expert-contacts": ["expertContacts", "demo-expert-contact", body],
      "/api/expert-organizations": ["expertOrganizations", "demo-expert-organization", body],
      "/api/expert-entity-links": ["expertEntityLinks", "demo-expert-link", body],
      "/api/hospitation-slots": ["hospitationSlots", "demo-hospitation-slot", body],
      "/api/hospitations": ["hospitations", "demo-hospitation", body],
      "/api/hospitation-observations": ["hospitationObservations", "demo-observation", body],
      "/api/formats": ["formats", "demo-format", body],
      "/api/saved-views": ["savedViews", "demo-view", body]
    }[path];
    if (method === "POST" && createResource) {
      const [property, prefix, payload] = createResource;
      const safePayload = sanitizeDemoMediaFields(property, payload);
      const formatIdempotencyKey = property === "formats"
        ? String(safePayload.idempotencyKey || safePayload.idempotency_key || "").trim().toLowerCase()
        : "";
      if (property === "formats" && !formatIdempotencyKey) {
        return error("Für das Anlegen eines Formats fehlt der Idempotenzschlüssel.", 428, "FORMAT_IDEMPOTENCY_KEY_REQUIRED");
      }
      if (property === "formats" && !FORMAT_IDEMPOTENCY_UUID_PATTERN.test(formatIdempotencyKey)) {
        return error("Der Idempotenzschlüssel für die Formatanlage muss eine UUID sein.", 400, "FORMAT_IDEMPOTENCY_KEY_INVALID");
      }
      if (
        property === "formats"
        && safePayload.id
        && String(safePayload.id).trim().toLowerCase() !== formatIdempotencyKey
      ) {
        return error("Format-ID und Idempotenzschlüssel dürfen nicht voneinander abweichen.", 400, "FORMAT_IDEMPOTENCY_KEY_MISMATCH");
      }
      if (
        property === "formats"
        && safePayload.status !== undefined
        && !FORMAT_STATUSES.includes(String(safePayload.status || "").trim())
      ) {
        return error("Der Formatstatus ist ungültig.", 400, "FORMAT_STATUS_INVALID");
      }
      const persistedPayload = property === "formats"
        ? {
            ...Object.fromEntries(Object.entries(safePayload).filter(([key]) => !["idempotencyKey", "idempotency_key"].includes(key))),
            id: formatIdempotencyKey
          }
        : safePayload;
      if (property === "formats") {
        const requestSignature = JSON.stringify(persistedPayload);
        const priorRequest = state.formatCreateRequests.find((entry) =>
          entry.actorId === state.currentProfileId && entry.key === formatIdempotencyKey
        );
        if (priorRequest) {
          if (priorRequest.signature !== requestSignature) {
            return error("Der Idempotenzschlüssel wurde bereits mit anderen Formatdaten verwendet.", 409, "FORMAT_IDEMPOTENCY_CONFLICT");
          }
          const existingFormat = state.formats.find((item) => item.id === priorRequest.formatId);
          if (existingFormat) return json(existingFormat, 201);
        }
      }
      if (
        property === "contacts"
        && isEhcOnlyContact(persistedPayload)
        && !contactOwnerIds(persistedPayload).includes(state.currentProfileId)
      ) {
        return error("EHC-only-Profile dürfen nur für den aktuellen Contact Owner angelegt werden.", 403);
      }
      if (
        property === "contacts"
        && OWNER_ONLY_CONTACT_CHANNELS
        && bodySetsSensitiveContactFields(persistedPayload)
        && !contactOwnerIds(persistedPayload).includes(state.currentProfileId)
      ) {
        return error("E-Mail und Telefon dürfen in der Demo nur von Contact Ownern gesetzt werden.", 403);
      }
      const createdPayload = property === "contacts"
        ? withDemoContactConsentDefaults(persistedPayload)
        : persistedPayload;
      const created = {
        ...createdPayload,
        id: property === "formats" ? formatIdempotencyKey : (createdPayload.id || nextId(prefix)),
        participants: property === "formats" ? (createdPayload.participants || []) : createdPayload.participants,
        createdAt: createdPayload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state[property].unshift(created);
      if (property === "formats") {
        state.formatCreateRequests.push({
          actorId: state.currentProfileId,
          key: formatIdempotencyKey,
          signature: JSON.stringify(persistedPayload),
          formatId: created.id
        });
      }
      if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
      const eventRoot = property === "hospitations" ? "hospitation" : property === "formats" ? "format" : property === "contacts" ? "contact" : "record";
      addDemoActivity({ eventKey: `${eventRoot}.created`, categoryKey: eventRoot === "record" ? "master_data" : eventRoot, actionKey: "create", objectType: eventRoot, objectId: created.id, contactId: created.contactId || (property === "contacts" ? created.id : ""), title: "Synthetischen Demo-Datensatz angelegt" });
      return json(property === "contacts" ? projectContactForCurrentProfile(created) : created, 201);
    }

    const formatLifecycleMatch = path.match(/^\/api\/formats\/([^/]+)\/(archive|restore)$/);
    if (formatLifecycleMatch && method === "POST") {
      if (!currentDemoProfileIsAdmin()) {
        return error("Archivieren und Wiederherstellen von Formaten ist nur für Admins erlaubt.", 403, "FORMAT_ADMIN_REQUIRED");
      }
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatLifecycleMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404);
      const expectedUpdatedAt = expectedUpdatedAtFromRequest(body, ifMatch);
      if (!expectedUpdatedAt) {
        return error("Für die Formataktion fehlt der erwartete Änderungsstand.", 428, "FORMAT_PRECONDITION_REQUIRED");
      }
      if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
        return error("Der erwartete Änderungsstand ist ungültig.", 400, "FORMAT_PRECONDITION_INVALID");
      }
      if (!timestampsMatch(expectedUpdatedAt, format.updatedAt)) {
        return error("Das Format wurde zwischenzeitlich geändert.", 409, "FORMAT_VERSION_CONFLICT");
      }
      const restoring = formatLifecycleMatch[2] === "restore";
      if (!restoring && format.status === "Archiviert") return json(format);
      if (restoring && format.status !== "Archiviert") {
        return error("Nur archivierte Formate können wiederhergestellt werden.", 409, "FORMAT_NOT_ARCHIVED");
      }
      format.status = restoring ? "Planung" : "Archiviert";
      format.updatedAt = new Date().toISOString();
      addDemoActivity({
        eventKey: restoring ? "format.restored" : "format.archived",
        categoryKey: "format",
        actionKey: restoring ? "restore" : "archive",
        objectType: "format",
        objectId: format.id,
        title: restoring ? "Synthetisches Format wiederhergestellt" : "Synthetisches Format archiviert"
      });
      return json(format);
    }

    const updateMatch = path.match(/^\/api\/(contacts|organizations|organization-primary-systems|expert-contacts|expert-organizations|expert-entity-links|hospitation-slots|hospitations|hospitation-observations|formats|saved-views)\/([^/]+)$/);
    if (updateMatch && ["PATCH", "DELETE"].includes(method)) {
      const property = propertyForResource(updateMatch[1]);
      const target = state[property];
      const id = decodeURIComponent(updateMatch[2]);
      const index = target.findIndex((item) => item.id === id);
      if (index < 0) return error("Synthetischer Datensatz wurde nicht gefunden.", 404);
      if (property === "formats") {
        if (method === "DELETE" && !currentDemoProfileIsAdmin()) {
          return error("Formate dürfen nur von Admins gelöscht werden.", 403, "FORMAT_ADMIN_REQUIRED");
        }
        const expectedUpdatedAt = expectedUpdatedAtFromRequest(body, ifMatch);
        if (!expectedUpdatedAt) {
          return error(
            method === "DELETE"
              ? "Zum Löschen des Formats fehlt der erwartete Änderungsstand."
              : "Zum Aktualisieren des Formats fehlt der erwartete Änderungsstand.",
            428,
            "FORMAT_PRECONDITION_REQUIRED"
          );
        }
        if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
          return error("Der erwartete Änderungsstand ist ungültig.", 400, "FORMAT_PRECONDITION_INVALID");
        }
        if (!timestampsMatch(expectedUpdatedAt, target[index].updatedAt)) {
          return error("Das Format wurde zwischenzeitlich geändert.", 409, "FORMAT_VERSION_CONFLICT");
        }
        if (
          method === "PATCH"
          && body.status !== undefined
          && !FORMAT_STATUSES.includes(String(body.status || "").trim())
        ) {
          return error("Der Formatstatus ist ungültig.", 400, "FORMAT_STATUS_INVALID");
        }
        if (
          method === "PATCH"
          && !Object.keys(body).some((key) => !["expectedUpdatedAt", "expected_updated_at"].includes(key))
        ) {
          return error("Keine unterstützten Formatfelder im Request.", 400, "FORMAT_PATCH_EMPTY");
        }
        if (method === "PATCH" && target[index].status === "Archiviert") {
          return error("Archivierte Formate müssen ausdrücklich wiederhergestellt werden.", 409, "FORMAT_RESTORE_ACTION_REQUIRED");
        }
        if (method === "PATCH" && body.status === "Archiviert") {
          return error("Formate müssen über die Archivieren-Aktion archiviert werden.", 409, "FORMAT_ARCHIVE_ACTION_REQUIRED");
        }
      }
      if (property === "contacts" && restrictedEhcContact(target[index])) {
        return error("EHC-only-Profile dürfen nur von ihren Contact Ownern geändert werden.", 403);
      }
      if (method === "DELETE") {
        if (property === "hospitations") {
          state.hospitationObservations = state.hospitationObservations.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
          state.hospitationRoadmapAssessments = state.hospitationRoadmapAssessments.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
          state.hospitationUnmetNeeds = state.hospitationUnmetNeeds.filter((item) => (item.hospitationId || item.hospitation_id) !== id);
        }
        if (property === "organizations") {
          state.organizationPrimarySystems = state.organizationPrimarySystems.filter((item) => (item.organizationId || item.organization_id) !== id);
        }
        target.splice(index, 1);
        if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
        return json({ ok: true });
      }
      const before = target[index];
      const safeBody = sanitizeDemoMediaFields(
        property,
        property === "formats"
          ? Object.fromEntries(Object.entries(body).filter(([key]) => !["expectedUpdatedAt", "expected_updated_at"].includes(key)))
          : body
      );
      if (
        property === "contacts"
        && OWNER_ONLY_CONTACT_CHANNELS
        && bodyHasSensitiveContactFields(safeBody)
        && !currentProfileOwnsContact(before)
      ) {
        return error("E-Mail und Telefon dürfen in der Demo nur von Contact Ownern geändert werden.", 403);
      }
      target[index] = { ...target[index], ...safeBody, updatedAt: new Date().toISOString() };
      if (property === "organizationPrimarySystems") updateOrganizationPrimarySystems();
      if (property === "contacts") {
        addDemoActivity({
          eventKey: "contact.updated",
          categoryKey: "master_data",
          actionKey: "update",
          objectType: "contact",
          objectId: id,
          contactId: id,
          title: "Kontaktdaten aktualisiert",
          changes: Object.keys(safeBody).map((fieldName) => ({ fieldName, oldValue: before[fieldName] ?? "", newValue: safeBody[fieldName] ?? "" }))
        });
      }
      return json(property === "contacts" ? projectContactForCurrentProfile(target[index]) : target[index]);
    }

    const syncMatch = path.match(/^\/api\/hospitations\/([^/]+)\/(observations\/sync|roadmap-assessments|unmet-needs)$/);
    if (method === "PUT" && syncMatch) {
      const hospitationId = decodeURIComponent(syncMatch[1]);
      const property = syncMatch[2] === "observations/sync" ? "hospitationObservations" : syncMatch[2] === "roadmap-assessments" ? "hospitationRoadmapAssessments" : "hospitationUnmetNeeds";
      state[property] = state[property].filter((item) => (item.hospitationId || item.hospitation_id) !== hospitationId);
      const items = (body.items || body.observations || []).map((item) => ({ ...item, id: item.id || nextId("demo-item"), hospitationId, updatedAt: new Date().toISOString() }));
      state[property].push(...items);
      addDemoActivity({ eventKey: "hospitation.documented", categoryKey: "hospitation", actionKey: "document", objectType: "hospitation", objectId: hospitationId, title: "Synthetische Hospitationsauswertung gespeichert" });
      return json({ items });
    }

    const participantContact = (contactId) => state.contacts.find((item) => item.id === contactId);
    const participantStatusNeedsConsent = (status) =>
      ["Eingeladen", "Zugesagt", "Teilgenommen"].includes(String(status || ""));
    const participantContactIsInviteable = (contactId) => {
      const contact = participantContact(contactId);
      return Boolean(
        contact
        && String(contact.mitmachenConsentStatus || contact.mitmachen_consent_status || "") === "granted"
      );
    };
    const participantContactIsAvailable = (contactId) => {
      const contact = participantContact(contactId);
      return Boolean(contact && !["archived", "Archiviert"].includes(contact.status));
    };
    const participantTimestampMatches = timestampsMatch;
    const normalizeParticipantEntries = (items, label, { includeExpectedUpdatedAt = false } = {}) => {
      if (!Array.isArray(items) || items.length < 1 || items.length > FORMAT_PARTICIPANT_BATCH_LIMIT) {
        return {
          failure: error(
            `${label} muss zwischen 1 und ${FORMAT_PARTICIPANT_BATCH_LIMIT} Einträge enthalten.`,
            400,
            "FORMAT_PARTICIPANT_BATCH_SIZE_INVALID"
          )
        };
      }
      const seen = new Set();
      const rows = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const contactId = String(item.contactId || item.contact_id || "").trim();
        if (!contactId) {
          return {
            failure: error(
              `Kontakt-ID in ${label}, Eintrag ${index + 1}, fehlt.`,
              400,
              "FORMAT_PARTICIPANT_CONTACT_REQUIRED"
            )
          };
        }
        if (seen.has(contactId)) {
          return {
            failure: error(
              `Kontakt ${contactId} kommt im selben Batch mehrfach vor.`,
              400,
              "FORMAT_PARTICIPANT_BATCH_DUPLICATE"
            )
          };
        }
        seen.add(contactId);
        const invitationStatus = String(item.invitationStatus || item.invitation_status || "Kandidat").trim();
        if (!FORMAT_PARTICIPANT_STATUSES.includes(invitationStatus)) {
          return {
            failure: error(
              `Ungültiger Beteiligungsstatus. Erlaubt sind: ${FORMAT_PARTICIPANT_STATUSES.join(", ")}.`,
              400,
              "FORMAT_PARTICIPANT_STATUS_INVALID"
            )
          };
        }
        rows.push({
          contactId,
          invitationStatus,
          participantRole: String(item.participantRole || item.participant_role || ""),
          notes: String(item.notes || ""),
          ...(includeExpectedUpdatedAt
            ? { expectedUpdatedAt: String(item.expectedUpdatedAt || item.expected_updated_at || "").trim() }
            : {})
        });
      }
      return { rows };
    };
    const participantConstraintFailure = (rows) => {
      const unavailableContactIds = rows
        .map((row) => row.contactId)
        .filter((contactId) => !participantContactIsAvailable(contactId));
      if (unavailableContactIds.length) {
        return error(
          "Mindestens ein ausgewählter Kontakt ist nicht verfügbar oder archiviert.",
          409,
          "FORMAT_PARTICIPANT_CONTACT_UNAVAILABLE",
          { blockedContactIds: unavailableContactIds }
        );
      }
      const consentBlockedContactIds = rows
        .filter((row) => participantStatusNeedsConsent(row.invitationStatus))
        .map((row) => row.contactId)
        .filter((contactId) => !participantContactIsInviteable(contactId));
      if (consentBlockedContactIds.length) {
        return error(
          "Für Eingeladen, Zugesagt oder Teilgenommen muss eine gültige Mitmachen-Einwilligung vorliegen.",
          409,
          "FORMAT_INVITATION_CONSENT_REQUIRED",
          { blockedContactIds: consentBlockedContactIds }
        );
      }
      return null;
    };
    const archivedParticipantMutationFailure = (format) => format.status === "Archiviert"
      ? error(
          "Archivierte Formate müssen vor Teilnehmeränderungen wiederhergestellt werden.",
          409,
          "FORMAT_RESTORE_ACTION_REQUIRED"
        )
      : null;
    const updateFormatAfterParticipantMutation = (format, actionKey, title, contactId = "") => {
      format.updatedAt = new Date().toISOString();
      addDemoActivity({
        eventKey: "format.participant.updated",
        categoryKey: "format",
        actionKey,
        objectType: "format",
        objectId: format.id,
        contactId,
        title
      });
    };

    const formatParticipantsBatchMatch = path.match(/^\/api\/formats\/([^/]+)\/participants\/batch$/);
    if (formatParticipantsBatchMatch && method === "POST") {
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatParticipantsBatchMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404, "FORMAT_NOT_FOUND");
      const normalized = normalizeParticipantEntries(body.items, "Der Format-Teilnehmer-Batch");
      if (normalized.failure) return normalized.failure;
      const archivedFailure = archivedParticipantMutationFailure(format);
      if (archivedFailure) return archivedFailure;
      const constraintFailure = participantConstraintFailure(normalized.rows);
      if (constraintFailure) return constraintFailure;
      format.participants ||= [];
      const existingIds = new Set(format.participants.map((entry) => entry.contactId || entry.contact_id));
      const newRows = normalized.rows.filter((entry) => !existingIds.has(entry.contactId));
      if (newRows.length) {
        const now = new Date().toISOString();
        format.participants.push(...newRows.map((entry) => ({
          ...entry,
          id: nextId("demo-format-participant"),
          formatId: format.id,
          createdAt: now,
          updatedAt: now
        })));
        updateFormatAfterParticipantMutation(
          format,
          "batch_add",
          `${newRows.length} synthetische Formatkandidaten hinzugefügt`
        );
      }
      return json(format);
    }

    const formatParticipantsImportMatch = path.match(/^\/api\/formats\/([^/]+)\/participants\/import$/);
    if (formatParticipantsImportMatch && method === "POST") {
      if (!currentDemoProfileIsAdmin()) {
        return error("Excel-Import von Formatbeteiligungen ist nur für Admins erlaubt.", 403, "FORMAT_ADMIN_REQUIRED");
      }
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatParticipantsImportMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404, "FORMAT_NOT_FOUND");
      const normalized = normalizeParticipantEntries(
        body.items,
        "Der Format-Einladungsimport",
        { includeExpectedUpdatedAt: true }
      );
      if (normalized.failure) return normalized.failure;
      const archivedFailure = archivedParticipantMutationFailure(format);
      if (archivedFailure) return archivedFailure;
      format.participants ||= [];
      const existingByContactId = new Map(
        format.participants.map((participant) => [participant.contactId || participant.contact_id, participant])
      );
      const rowsToWrite = [];
      const missingPreconditionContactIds = [];
      const versionConflictContactIds = [];
      normalized.rows.forEach((row) => {
        const existing = existingByContactId.get(row.contactId);
        if (!existing) {
          if (row.expectedUpdatedAt) versionConflictContactIds.push(row.contactId);
          else rowsToWrite.push({ ...row, existing: null });
          return;
        }
        const unchanged = (
          String(existing.invitationStatus || existing.invitation_status || "Kandidat") === row.invitationStatus
          && String(existing.participantRole || existing.participant_role || "") === row.participantRole
          && String(existing.notes || "") === row.notes
        );
        if (unchanged) return;
        if (!row.expectedUpdatedAt) {
          missingPreconditionContactIds.push(row.contactId);
          return;
        }
        if (!participantTimestampMatches(row.expectedUpdatedAt, existing.updatedAt || existing.updated_at)) {
          versionConflictContactIds.push(row.contactId);
          return;
        }
        rowsToWrite.push({ ...row, existing });
      });
      if (missingPreconditionContactIds.length) {
        return error(
          "Für geänderte bestehende Importzeilen fehlt der Versionsstand des Teilnehmers.",
          428,
          "FORMAT_PARTICIPANT_IMPORT_PRECONDITION_REQUIRED",
          {
            blockedContactIds: missingPreconditionContactIds,
            details: { reason: "expectedUpdatedAt_required_for_existing_update" }
          }
        );
      }
      if (versionConflictContactIds.length) {
        return error(
          "Mindestens eine Importzeile wurde zwischenzeitlich geändert. Bitte neu laden.",
          409,
          "FORMAT_PARTICIPANT_IMPORT_VERSION_CONFLICT",
          {
            blockedContactIds: versionConflictContactIds,
            details: { reason: "participant_version_conflict" }
          }
        );
      }
      const constraintFailure = participantConstraintFailure(rowsToWrite);
      if (constraintFailure) return constraintFailure;
      if (rowsToWrite.length) {
        const now = new Date().toISOString();
        rowsToWrite.forEach((row) => {
          const participant = {
            ...(row.existing || {}),
            id: row.existing?.id || nextId("demo-format-participant"),
            formatId: format.id,
            contactId: row.contactId,
            invitationStatus: row.invitationStatus,
            participantRole: row.participantRole,
            notes: row.notes,
            createdAt: row.existing?.createdAt || row.existing?.created_at || now,
            updatedAt: now
          };
          const index = format.participants.findIndex(
            (item) => (item.contactId || item.contact_id) === row.contactId
          );
          if (index >= 0) format.participants[index] = participant;
          else format.participants.push(participant);
        });
        updateFormatAfterParticipantMutation(
          format,
          "import",
          `${rowsToWrite.length} synthetische Formatbeteiligungen importiert`
        );
      }
      return json(format);
    }

    const formatParticipantsMatch = path.match(/^\/api\/formats\/([^/]+)\/participants(?:\/([^/]+))?$/);
    if (formatParticipantsMatch && ["POST", "PATCH", "DELETE"].includes(method)) {
      const format = state.formats.find((item) => item.id === decodeURIComponent(formatParticipantsMatch[1]));
      if (!format) return error("Synthetisches Format wurde nicht gefunden.", 404, "FORMAT_NOT_FOUND");
      const archivedFailure = archivedParticipantMutationFailure(format);
      if (archivedFailure) return archivedFailure;
      format.participants ||= [];
      const contactId = String(
        formatParticipantsMatch[2]
          ? decodeURIComponent(formatParticipantsMatch[2])
          : (body.contactId || body.contact_id || "")
      ).trim();
      if (!contactId) {
        return error("Kontakt-ID für Teilnehmer fehlt.", 400, "FORMAT_PARTICIPANT_CONTACT_REQUIRED");
      }
      const index = format.participants.findIndex(
        (item) => (item.contactId || item.contact_id) === contactId
      );
      if (["PATCH", "DELETE"].includes(method) && index < 0) {
        return error("Synthetische Formatteilnahme wurde nicht gefunden.", 404, "FORMAT_PARTICIPANT_NOT_FOUND");
      }
      const existingStatus = index >= 0
        ? (format.participants[index].invitationStatus || format.participants[index].invitation_status || "Kandidat")
        : "Kandidat";
      const requestedStatus = String(body.invitationStatus || body.invitation_status || existingStatus).trim();
      if (method !== "DELETE" && !FORMAT_PARTICIPANT_STATUSES.includes(requestedStatus)) {
        return error(
          `Ungültiger Beteiligungsstatus. Erlaubt sind: ${FORMAT_PARTICIPANT_STATUSES.join(", ")}.`,
          400,
          "FORMAT_PARTICIPANT_STATUS_INVALID"
        );
      }
      const constraintFailure = method === "DELETE"
        ? null
        : participantConstraintFailure([{ contactId, invitationStatus: requestedStatus }]);
      if (constraintFailure) return constraintFailure;
      if (method === "PATCH" || method === "DELETE") {
        const expectedUpdatedAt = expectedUpdatedAtFromRequest(body, ifMatch);
        if (!expectedUpdatedAt) {
          return error(
            "Für die Teilnahmeänderung fehlt der erwartete Änderungsstand.",
            428,
            "FORMAT_PARTICIPANT_PRECONDITION_REQUIRED"
          );
        }
        if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
          return error(
            "Der erwartete Änderungsstand der Teilnahme ist ungültig.",
            400,
            "FORMAT_PARTICIPANT_PRECONDITION_INVALID"
          );
        }
        if (!participantTimestampMatches(
          expectedUpdatedAt,
          format.participants[index].updatedAt || format.participants[index].updated_at
        )) {
          return error(
            "Die Teilnahme wurde zwischenzeitlich geändert.",
            409,
            "FORMAT_PARTICIPANT_VERSION_CONFLICT"
          );
        }
      }
      const now = new Date().toISOString();
      let changed = false;
      if (method === "POST" && index < 0) {
        format.participants.push({
          id: nextId("demo-format-participant"),
          formatId: format.id,
          contactId,
          invitationStatus: requestedStatus,
          participantRole: String(body.participantRole || body.participant_role || ""),
          notes: String(body.notes || ""),
          createdAt: now,
          updatedAt: now
        });
        changed = true;
      }
      if (method === "PATCH") {
        format.participants[index] = {
          ...format.participants[index],
          invitationStatus: requestedStatus,
          ...(body.participantRole !== undefined || body.participant_role !== undefined
            ? { participantRole: String(body.participantRole || body.participant_role || "") }
            : {}),
          ...(body.notes !== undefined ? { notes: String(body.notes || "") } : {}),
          updatedAt: now
        };
        changed = true;
      }
      if (method === "DELETE") {
        format.participants.splice(index, 1);
        changed = true;
      }
      if (changed) {
        updateFormatAfterParticipantMutation(
          format,
          method.toLowerCase(),
          "Synthetische Formatteilnahme aktualisiert",
          contactId
        );
      }
      return json(format);
    }

    return error(`Die lokale Demo-API kennt den Aufruf ${method} ${path} noch nicht.`, 501);
  }

  window.fetch = async function (input, init = {}) {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(requestUrl, window.location.href);
    const method = String(init.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return originalFetch(input, init);
    const body = await requestBody(input, init);
    const ifMatch = requestHeaderValue(input, init, "if-match");
    return handleDemoApi(url, method, body, ifMatch);
  };

  window.VERSORGUNGS_COMPASS_DEMO_RUNTIME = Object.freeze({
    onboardingPreview,
    publicDemo: true,
    persistence: "memory-only",
    resetOnReload: true,
    syntheticOnly: true
  });
  window.VersorgungsCompassDemoApi = Object.freeze({
    active: true,
    reset() {
      state = createState();
      window.dispatchEvent(new CustomEvent("versorgungs-compass:demo-reset"));
      return projectStateForCurrentProfile();
    },
    snapshot() {
      return projectStateForCurrentProfile();
    }
  });

})();
