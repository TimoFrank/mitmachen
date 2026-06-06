(function () {
  const DB_FIELDS = [
    "id",
    "name",
    "organization_id",
    "organization",
    "sector",
    "specialty",
    "priority",
    "role",
    "owner_id",
    "postal_code",
    "city",
    "federal_state",
    "latitude",
    "longitude",
    "email",
    "phone",
    "linkedin",
    "topics",
    "notes",
    "source",
    "image_url",
    "image_source_url",
    "image_source_label",
    "image_rights_note",
    "image_updated_at",
    "image_updated_by",
    "status",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const WRITE_FIELDS = DB_FIELDS.filter((field) => !["created_at", "created_by", "updated_at", "updated_by"].includes(field));
  const ORGANIZATION_FIELDS = [
    "id",
    "name",
    "normalized_name",
    "sector",
    "organization_type",
    "postal_code",
    "city",
    "federal_state",
    "latitude",
    "longitude",
    "website",
    "phone",
    "email",
    "notes",
    "source",
    "status",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const CHANGE_FIELDS = ["id", "contact_id", "action", "field_name", "old_value", "new_value", "changed_at", "changed_by"];
  const SAVED_VIEW_FIELDS = [
    "id",
    "owner_id",
    "name",
    "description",
    "scope",
    "view_type",
    "filters",
    "search_query",
    "sort_key",
    "sort_direction",
    "page_size",
    "is_default",
    "created_at",
    "updated_at"
  ];
  const USER_SETTINGS_FIELDS = [
    "user_id",
    "default_view_id",
    "default_view_type",
    "table_density",
    "theme",
    "font_scale",
    "page_size",
    "preferences",
    "created_at",
    "updated_at"
  ];
  const PROFILE_FIELDS = [
    "id",
    "email",
    "display_name",
    "initials",
    "role",
    "active",
    "avatar_url",
    "team",
    "bio",
    "created_at",
    "updated_at"
  ];
  const FORMAT_FIELDS = [
    "id",
    "title",
    "format_type",
    "starts_at",
    "ends_at",
    "location",
    "goal",
    "owner_id",
    "status",
    "notes",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const FORMAT_PARTICIPANT_FIELDS = [
    "id",
    "format_id",
    "contact_id",
    "invitation_status",
    "participant_role",
    "notes",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const EXPERT_GROUP_FIELDS = ["id", "name", "sort_order", "status", "created_at", "updated_at"];
  const EXPERT_CONTACT_FIELDS = [
    "id",
    "name",
    "organization_id",
    "organization",
    "group_id",
    "group_name",
    "specialty",
    "role",
    "city",
    "federal_state",
    "email",
    "phone",
    "linkedin",
    "topics",
    "notes",
    "source",
    "profile_url",
    "status",
    "created_at",
    "updated_at"
  ];
  const EXPERT_ORGANIZATION_FIELDS = [
    "id",
    "name",
    "normalized_name",
    "group_id",
    "group_name",
    "organization_type",
    "city",
    "federal_state",
    "website",
    "phone",
    "email",
    "notes",
    "source",
    "status",
    "created_at",
    "updated_at"
  ];
  const EXPERT_ENTITY_LINK_FIELDS = [
    "id",
    "link_type",
    "contact_id",
    "expert_contact_id",
    "organization_id",
    "expert_organization_id",
    "match_reason",
    "confidence",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const PROFILE_IMAGE_BUCKET = "profile-images";
  const LOCAL_FORMATS_KEY = "versorgungs-kompass-formats-v1";
  const LOCAL_EXPERT_CONTACTS_KEY = "versorgungs-kompass-expert-contacts-v1";
  const LOCAL_EXPERT_ORGANIZATIONS_KEY = "versorgungs-kompass-expert-organizations-v1";
  const LOCAL_EXPERT_ENTITY_LINKS_KEY = "versorgungs-kompass-expert-entity-links-v1";
  const LOCAL_REGISTRATIONS_KEY = "versorgungs-kompass-backend-registrations-v1";
  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  let client = null;
  let profileCache = new Map();
  let contactCache = [];
  let organizationCache = [];
  let expertGroupCache = [];
  let expertContactCache = [];
  let expertOrganizationCache = [];
  let expertEntityLinkCache = [];
  let formatCache = [];
  let savedViewCache = [];
  let userSettingsCache = null;
  let supportsContactOrganizationId = true;
  let supportsContactImageSources = false;
  let supportsContactRole = true;
  let supportsFormats = true;

  function contactSelectFields() {
    return DB_FIELDS.filter((field) => {
      if (!supportsContactOrganizationId && field === "organization_id") return false;
      if (!supportsContactImageSources && field.startsWith("image_") && field !== "image_url") return false;
      if (!supportsContactRole && field === "role") return false;
      return true;
    }).join(",");
  }

  function isMissingOrganizationIdError(error) {
    return /organization_id/i.test(String(error?.message || error?.details || error?.hint || ""));
  }

  function isMissingContactImageSourceError(error) {
    return /image_source_url|image_source_label|image_rights_note|image_updated_at|image_updated_by/i.test(String(error?.message || error?.details || error?.hint || ""));
  }

  function isMissingContactRoleError(error) {
    return /\brole\b/i.test(String(error?.message || error?.details || error?.hint || ""));
  }

  function isConfigured() {
    if (isGcpMode()) return true;
    return Boolean(
      CONFIG.dataMode === "supabase" &&
        CONFIG.supabaseUrl &&
        CONFIG.supabaseAnonKey &&
        !CONFIG.supabaseUrl.includes("YOUR-PROJECT") &&
        !CONFIG.supabaseAnonKey.includes("YOUR-SUPABASE")
    );
  }

  function isGcpMode() {
    return CONFIG.dataMode === "gcp" || CONFIG.dataMode === "gcp-demo";
  }

  function getClient() {
    if (client) return client;
    if (isGcpMode()) {
      client = {
        auth: {
          signOut: async () => ({ error: null })
        }
      };
      return client;
    }
    if (!isConfigured()) throw new Error("Supabase ist noch nicht konfiguriert.");
    if (!window.supabase?.createClient) throw new Error("Supabase Client konnte nicht geladen werden.");
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function apiBaseUrl() {
    return String(CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function requiresApiGateway() {
    return CONFIG.requireApiGateway === true;
  }

  function usesApiGateway() {
    return isGcpMode() || Boolean(apiBaseUrl()) || requiresApiGateway();
  }

  function apiGatewayRequiredError() {
    return new Error("Die API-Schicht ist fuer diesen Datenpfad erforderlich. Bitte apiBaseUrl setzen oder requireApiGateway aktivieren.");
  }

  async function apiRequest(path, { method = "GET", params = {}, body } = {}) {
    const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    const headers = {
      Accept: "application/json"
    };
    if (!isGcpMode()) {
      const { data, error } = await getClient().auth.getSession();
      if (error) throw error;
      const token = data?.session?.access_token;
      if (!token) throw new Error("Bitte zuerst anmelden.");
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url.href, {
      method,
      headers: {
        ...headers
      },
      credentials: CONFIG.apiCredentials || "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API-Anfrage fehlgeschlagen (${response.status}).`);
    return payload;
  }

  function apiContactPayload(payload) {
    return payload?.contact || payload;
  }

  function apiOrganizationPayload(payload) {
    return payload?.organization || payload;
  }

  async function apiGet(path, params = {}) {
    return apiRequest(path, { params });
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
  }

  function isLocalMode() {
    return CONFIG.dataMode === "local" || isDemoMode();
  }

  function isDemoMode() {
    return CONFIG.dataMode === "demo";
  }

  function demoData() {
    return window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function localProfile() {
    if (isDemoMode()) return currentDemoProfile();
    return {
      id: "local-admin",
      email: "local@example.test",
      display_name: "Timo Frank",
      initials: "TF",
      role: "admin",
      active: true,
      avatar_url: "",
      team: "",
      bio: ""
    };
  }

  function currentDemoProfile() {
    const profiles = Array.isArray(demoData().profiles) ? demoData().profiles : [];
    const role = String(CONFIG.demoRole || "admin").toLowerCase();
    return clone(profiles.find((profile) => String(profile.role || "").toLowerCase() === role) || profiles[0] || {
      id: "demo-admin",
      email: "demo.admin@example.test",
      display_name: "Demo Admin",
      initials: "DA",
      role: "admin",
      active: true,
      avatar_url: "",
      team: "",
      bio: ""
    });
  }

  function demoProfiles() {
    const profiles = Array.isArray(demoData().profiles) ? demoData().profiles : [];
    return clone(profiles.length ? profiles : [currentDemoProfile()]);
  }

  function localContacts(options = {}) {
    const rows = isDemoMode() && Array.isArray(demoData().contacts)
      ? demoData().contacts
      : Array.isArray(window.VERSORGUNGS_COMPASS_CONTACTS)
        ? window.VERSORGUNGS_COMPASS_CONTACTS
        : [];
    return rows
      .filter((contact) => options.includeArchived || contact.status !== "archived")
      .map((contact, index) => ({ ...clone(contact), _index: index }));
  }

  function localOrganizations(options = {}) {
    const rows = isDemoMode() && Array.isArray(demoData().organizations) ? demoData().organizations : [];
    const activeContacts = contactCache.length ? contactCache : localContacts({ includeArchived: true });
    return rows
      .filter((organization) => options.includeArchived || organization.status !== "archived")
      .map((organization) => {
        const contactCount = activeContacts.filter((contact) =>
          contact.status !== "archived" &&
          ((organization.id && contact.organizationId === organization.id) || normalizeOrganizationName(contact.organization) === normalizeOrganizationName(organization.name))
        ).length;
        return { ...clone(organization), contactCount };
      });
  }

  function normalizeExpertGroupEntry(entry = {}, index = 0) {
    const name = typeof entry === "string"
      ? entry
      : entry.name || entry.label || entry.group || entry.group_name || "";
    const groupName = String(name || "").trim();
    return {
      id: String((typeof entry === "object" && (entry.id || entry.groupId || entry.group_id)) || "").trim() || `expert-group-${index + 1}`,
      name: groupName,
      sortOrder: Number((typeof entry === "object" && (entry.sortOrder ?? entry.sort_order)) ?? (index + 1) * 10),
      status: String((typeof entry === "object" && entry.status) || "active").trim() || "active"
    };
  }

  function localExpertGroups(options = {}) {
    const rows = Array.isArray(window.VERSORGUNGS_COMPASS_EXPERT_GROUPS) ? window.VERSORGUNGS_COMPASS_EXPERT_GROUPS : [];
    return rows
      .map(normalizeExpertGroupEntry)
      .filter((group) => group.name && (options.includeArchived || group.status !== "archived"))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
  }

  function readLocalCollection(key, label = "lokale Daten") {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn(`${label} konnten nicht gelesen werden.`, error);
      return [];
    }
  }

  function writeLocalCollection(key, items, label = "lokale Daten") {
    try {
      window.localStorage?.setItem(key, JSON.stringify(items));
    } catch (error) {
      console.warn(`${label} konnten nicht gespeichert werden.`, error);
    }
  }

  function mergeLocalRows(seedRows = [], storedRows = []) {
    const byId = new Map();
    seedRows.forEach((row, index) => byId.set(row.id || `seed-${index}`, clone(row)));
    storedRows.forEach((row, index) => {
      const key = row.id || `stored-${index}`;
      byId.set(key, { ...(byId.get(key) || {}), ...clone(row) });
    });
    return [...byId.values()];
  }

  function localExpertContacts(options = {}) {
    const seedRows = Array.isArray(window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS) ? window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS : [];
    const storedRows = readLocalCollection(LOCAL_EXPERT_CONTACTS_KEY, "Lokale Expertenkreis-Kontakte");
    const rows = mergeLocalRows(seedRows, storedRows);
    return rows
      .filter((contact) => options.includeArchived || contact.status !== "archived")
      .map((contact, index) => ({ ...clone(contact), _index: index }));
  }

  function localExpertOrganizations(options = {}) {
    const seedRows = Array.isArray(window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS) ? window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS : [];
    const storedRows = readLocalCollection(LOCAL_EXPERT_ORGANIZATIONS_KEY, "Lokale Expertenkreis-Organisationen");
    const rows = mergeLocalRows(seedRows, storedRows);
    return rows
      .filter((organization) => options.includeArchived || organization.status !== "archived")
      .map((organization) => clone(organization));
  }

  function readLocalExpertEntityLinks() {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(LOCAL_EXPERT_ENTITY_LINKS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Lokale Expertenkreis-Verknuepfungen konnten nicht gelesen werden.", error);
      return [];
    }
  }

  function writeLocalExpertEntityLinks(items) {
    try {
      window.localStorage?.setItem(LOCAL_EXPERT_ENTITY_LINKS_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn("Lokale Expertenkreis-Verknuepfungen konnten nicht gespeichert werden.", error);
    }
  }

  function localExpertEntityLinks() {
    if (!expertEntityLinkCache.length) {
      expertEntityLinkCache = readLocalExpertEntityLinks().map(expertEntityLinkDbToUi);
    }
    return clone(expertEntityLinkCache);
  }

  function persistLocalExpertEntityLinks(items = expertEntityLinkCache) {
    expertEntityLinkCache = items.map(expertEntityLinkDbToUi);
    writeLocalExpertEntityLinks(expertEntityLinkCache);
    return clone(expertEntityLinkCache);
  }

  function persistLocalExpertContacts(items = expertContactCache) {
    expertContactCache = items.map(expertContactDbToUi);
    writeLocalCollection(LOCAL_EXPERT_CONTACTS_KEY, expertContactCache, "Lokale Expertenkreis-Kontakte");
    return clone(expertContactCache);
  }

  function persistLocalExpertOrganizations(items = expertOrganizationCache) {
    expertOrganizationCache = items.map(expertOrganizationDbToUi);
    writeLocalCollection(LOCAL_EXPERT_ORGANIZATIONS_KEY, expertOrganizationCache, "Lokale Expertenkreis-Organisationen");
    return clone(expertOrganizationCache);
  }

  function sampleRegistrationRows() {
    const now = new Date();
    return [
      {
        id: "reg-demo-001",
        submitted_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        status: "neu",
        email: "praxis.team@example.test",
        salutation: "Frau",
        title: "Dr. med.",
        first_name: "Lea",
        last_name: "Muster",
        organization: "Hausarztpraxis Musterstadt",
        sector: "Praxis",
        postal_code: "48143",
        city: "Musterstadt",
        federal_state: "Nordrhein-Westfalen",
        role: "Praxisinhaberin",
        preferred_contact: "E-Mail",
        message: "Wir koennen Einblicke in Anmeldung, ePA und E-Rezept im hausarztlichen Alltag geben.",
        form_version: "mitmachen-versorgungs-netzwerk-form-v1",
        privacy_check_status: "bereit_zur_pruefung",
        consent_processing_version: "registrierung-verarbeitung-v1",
        consent_processing_accepted_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        consent_contact_version: "mitmachen-kontakt-v1",
        consent_contact_accepted_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        consent_text_version: "mitmachen-versorgungs-netzwerk-v1",
        consent_accepted_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        source_url: "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
        duplicate_hint: ""
      },
      {
        id: "reg-demo-002",
        submitted_at: new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString(),
        status: "neu",
        email: "info@apotheke-beispiel.test",
        salutation: "",
        title: "",
        first_name: "Jonas",
        last_name: "Beispiel",
        organization: "Apotheke am Markt",
        sector: "Apotheke",
        postal_code: "04109",
        city: "Leipzig",
        federal_state: "Sachsen",
        role: "Inhaber",
        preferred_contact: "E-Mail",
        message: "Interesse an Rueckmeldungen zu E-Rezept und digitalen Prozessen.",
        form_version: "mitmachen-versorgungs-netzwerk-form-v1",
        privacy_check_status: "bereit_zur_pruefung",
        consent_processing_version: "registrierung-verarbeitung-v1",
        consent_processing_accepted_at: new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString(),
        consent_contact_version: "",
        consent_contact_accepted_at: "",
        consent_text_version: "mitmachen-versorgungs-netzwerk-v1",
        consent_accepted_at: new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString(),
        source_url: "https://www.gematik.de/mitmachen/versorgungs-netzwerk",
        duplicate_hint: "Aehnliche Organisation im CRM pruefen"
      }
    ];
  }

  function normalizeRegistration(row = {}) {
    const submittedAt = row.submittedAt || row.submitted_at || "";
    const processedAt = row.processedAt || row.processed_at || "";
    const legacyConsentAt = row.consentAcceptedAt || row.consent_accepted_at || "";
    const legacyConsentVersion = row.consentTextVersion || row.consent_text_version || "";
    const processingConsentAt = row.consentProcessingAcceptedAt || row.consent_processing_accepted_at || legacyConsentAt || "";
    const processingConsentVersion = row.consentProcessingVersion || row.consent_processing_version || legacyConsentVersion || "";
    const contactConsentAt = row.consentContactAcceptedAt || row.consent_contact_accepted_at || "";
    const contactConsentVersion = row.consentContactVersion || row.consent_contact_version || "";
    return {
      id: String(row.id || row.registration_id || "").trim(),
      submittedAt,
      submitted_at: submittedAt,
      status: String(row.status || "neu").trim() || "neu",
      email: String(row.email || "").trim(),
      salutation: String(row.salutation || row.anrede || "").trim(),
      title: String(row.title || row.academic_title || "").trim(),
      firstName: String(row.firstName || row.first_name || "").trim(),
      first_name: String(row.firstName || row.first_name || "").trim(),
      lastName: String(row.lastName || row.last_name || "").trim(),
      last_name: String(row.lastName || row.last_name || "").trim(),
      organization: String(row.organization || row.einrichtung || "").trim(),
      sector: String(row.sector || row.category || "").trim(),
      postalCode: String(row.postalCode || row.postal_code || row.zip || row.plz || "").trim(),
      postal_code: String(row.postalCode || row.postal_code || row.zip || row.plz || "").trim(),
      city: String(row.city || "").trim(),
      federalState: String(row.federalState || row.federal_state || row.state || "").trim(),
      federal_state: String(row.federalState || row.federal_state || row.state || "").trim(),
      role: String(row.role || row.function || row.position || "").trim(),
      preferredContact: String(row.preferredContact || row.preferred_contact || row.preferredContactWay || row.preferred_contact_way || "").trim(),
      preferred_contact: String(row.preferredContact || row.preferred_contact || row.preferredContactWay || row.preferred_contact_way || "").trim(),
      message: String(row.message || row.nachricht || "").trim(),
      formVersion: String(row.formVersion || row.form_version || "").trim(),
      form_version: String(row.formVersion || row.form_version || "").trim(),
      privacyCheckStatus: String(row.privacyCheckStatus || row.privacy_check_status || "").trim(),
      privacy_check_status: String(row.privacyCheckStatus || row.privacy_check_status || "").trim(),
      consentProcessingVersion: String(processingConsentVersion).trim(),
      consent_processing_version: String(processingConsentVersion).trim(),
      consentProcessingAcceptedAt: String(processingConsentAt).trim(),
      consent_processing_accepted_at: String(processingConsentAt).trim(),
      consentContactVersion: String(contactConsentVersion).trim(),
      consent_contact_version: String(contactConsentVersion).trim(),
      consentContactAcceptedAt: String(contactConsentAt).trim(),
      consent_contact_accepted_at: String(contactConsentAt).trim(),
      consentTextVersion: String(legacyConsentVersion).trim(),
      consent_text_version: String(legacyConsentVersion).trim(),
      consentAcceptedAt: String(legacyConsentAt).trim(),
      consent_accepted_at: String(legacyConsentAt).trim(),
      sourceUrl: String(row.sourceUrl || row.source_url || "").trim(),
      source_url: String(row.sourceUrl || row.source_url || "").trim(),
      duplicateHint: String(row.duplicateHint || row.duplicate_hint || "").trim(),
      duplicate_hint: String(row.duplicateHint || row.duplicate_hint || "").trim(),
      contactId: String(row.contactId || row.contact_id || "").trim(),
      contact_id: String(row.contactId || row.contact_id || "").trim(),
      processedAt,
      processed_at: processedAt,
      processedBy: String(row.processedBy || row.processed_by || "").trim(),
      processed_by: String(row.processedBy || row.processed_by || "").trim()
    };
  }

  function localRegistrations() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LOCAL_REGISTRATIONS_KEY) || "null");
      if (Array.isArray(parsed)) return parsed.map(normalizeRegistration);
    } catch (_error) {
      // Fall back to sample data.
    }
    return sampleRegistrationRows().map(normalizeRegistration);
  }

  function persistLocalRegistrations(rows) {
    window.localStorage.setItem(LOCAL_REGISTRATIONS_KEY, JSON.stringify(rows.map(normalizeRegistration)));
  }

  function resetLocalBackendRegistrations() {
    persistLocalRegistrations(sampleRegistrationRows());
    return localRegistrations();
  }

  function backendBaseUrl() {
    return String(CONFIG.gematikBackendUrl || CONFIG.registrationBackendUrl || "").replace(/\/+$/, "");
  }

  function registrationHeaders() {
    const headers = { "Accept": "application/json", "Content-Type": "application/json" };
    if (CONFIG.gematikBackendToken) headers.Authorization = `Bearer ${CONFIG.gematikBackendToken}`;
    return headers;
  }

  function localSavedViews() {
    if (savedViewCache.length) return clone(savedViewCache);
    savedViewCache = clone(Array.isArray(demoData().savedViews) ? demoData().savedViews : []);
    return clone(savedViewCache);
  }

  function localUserSettings() {
    if (userSettingsCache) return clone(userSettingsCache);
    userSettingsCache = clone(demoData().userSettings || {
      userId: localProfile().id,
      defaultViewId: "",
      defaultViewType: "contacts",
      tableDensity: "comfortable",
      theme: "system",
      fontScale: 1,
      pageSize: 20,
      preferences: {}
    });
    userSettingsCache.userId = localProfile().id;
    return clone(userSettingsCache);
  }

  function readLocalStoredFormats() {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(LOCAL_FORMATS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Lokale Formate konnten nicht gelesen werden.", error);
      return [];
    }
  }

  function writeLocalStoredFormats(items) {
    try {
      window.localStorage?.setItem(LOCAL_FORMATS_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn("Lokale Formate konnten nicht gespeichert werden.", error);
    }
  }

  function localFormats(options = {}) {
    const rows = isDemoMode() && Array.isArray(demoData().formats)
      ? demoData().formats
      : readLocalStoredFormats();
    return clone(rows)
      .filter((format) => options.includeArchived || format.status !== "Archiviert")
      .map((format) => formatDbToUi(format, format.participants || []));
  }

  function persistLocalFormats(items = formatCache) {
    if (!isDemoMode()) writeLocalStoredFormats(items.map((format) => formatDbToUi(format, format.participants || [])));
  }

  function roleCanEdit() {
    return ["admin", "editor"].includes(String(localProfile().role || "").toLowerCase());
  }

  function roleCanAdmin() {
    return String(localProfile().role || "").toLowerCase() === "admin";
  }

  function requireLocalWrite(action = "Diese Aktion") {
    if (!isLocalMode()) return;
    if (!roleCanEdit()) throw new Error(`${action} ist mit Viewer-Rechten nicht erlaubt.`);
  }

  function requireLocalAdmin(action = "Diese Aktion") {
    if (!isLocalMode()) return;
    if (!roleCanAdmin()) throw new Error(`${action} ist nur mit Admin-Rechten erlaubt.`);
  }

  function isMissingFormatsError(error) {
    return /formats|format_participants|relation .* does not exist|schema cache/i.test(String(error?.message || error?.details || error?.hint || ""));
  }

  function formatSetupError(error) {
    const setupError = new Error(
      "Formate sind in Supabase noch nicht eingerichtet. Bitte die Formate-Migrationen in Supabase ausführen, damit Formate nicht nur lokal im Browser gespeichert werden."
    );
    setupError.cause = error;
    return setupError;
  }

  function normalizePriority(value) {
    if (value === "Hoch" || value === "Mittel" || value === "Niedrig") return value;
    return "Mittel";
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "")
      .split(/\s*\|\s*|\s*;\s*|\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function stringifyValue(value) {
    if (value === null || typeof value === "undefined") return "";
    if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function profileName(id) {
    const profile = profileCache.get(id);
    if (!profile) return "";
    const displayName = profile.display_name || profile.email || "";
    const duplicateDisplayName = [...profileCache.values()].filter((item) => item.display_name && item.display_name === profile.display_name).length > 1;
    if (duplicateDisplayName && profile.role) return `${displayName} (${roleLabel(profile.role)})`;
    return displayName;
  }

  function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "editor") return "Editor";
    if (role === "viewer") return "Viewer";
    return role || "Nutzer";
  }

  function initialsFromProfile(profile) {
    const source = profile?.display_name || profile?.email || "VK";
    const parts = String(source).trim().split(/\s+/).filter(Boolean);
    if (profile?.initials) return String(profile.initials).trim().slice(0, 4).toUpperCase();
    if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return String(source).slice(0, 2).toUpperCase();
  }

  function profileSummary(id) {
    const profile = profileCache.get(id);
    return {
      id: id || "",
      displayName: profile?.display_name || profile?.email || "Unbekannter Nutzer",
      initials: initialsFromProfile(profile),
      role: profile?.role || "",
      roleLabel: roleLabel(profile?.role),
      avatarUrl: profile?.avatar_url || ""
    };
  }

  function resolveOwnerId(value) {
    const owner = String(value || "").trim();
    if (!owner) return null;
    if (/^[0-9a-f-]{36}$/i.test(owner)) return owner;
    const normalizedOwner = owner.toLowerCase();
    const profile = [...profileCache.values()].find((item) =>
      [item.display_name, item.email, item.initials].some((candidate) => String(candidate || "").trim().toLowerCase() === normalizedOwner)
    );
    return profile?.id || null;
  }

  function dbToUi(row, index = 0) {
    const topics = splitList(row.topics);
    return {
      id: row.id,
      organizationId: row.organization_id || "",
      name: row.name || "",
      organization: row.organization || "",
      category: row.sector || "Praxis",
      specialty: row.specialty || "",
      contactRole: row.role || "",
      priority: normalizePriority(row.priority),
      owner: profileName(row.owner_id),
      ownerId: row.owner_id || "",
      postalCode: row.postal_code || "",
      city: row.city || "",
      state: row.federal_state || "",
      latitude: row.latitude,
      longitude: row.longitude,
      lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
      lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
      email: row.email || "",
      phone: row.phone || "",
      linkedin: row.linkedin || "",
      themes: topics,
      note: row.notes || "",
      sources: splitList(row.source),
      image: row.image_url || "",
      imageSourceUrl: row.image_source_url || "",
      imageSourceLabel: row.image_source_label || "",
      imageRightsNote: row.image_rights_note || "",
      imageUpdatedAt: row.image_updated_at || "",
      imageUpdatedBy: row.image_updated_by || "",
      status: row.status || "active",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      createdBy: row.created_by || "",
      updatedBy: row.updated_by || "",
      location: [row.postal_code, row.city].filter(Boolean).join(" "),
      topic: topics.length ? `Themen: ${topics.join(" · ")}` : "",
      description: row.sector ? `Sektor: ${row.sector}` : "",
      _index: index
    };
  }

  function changeToUi(row) {
    return {
      id: row.id,
      contactId: row.contact_id,
      action: row.action || "update",
      fieldName: row.field_name || "",
      oldValue: row.old_value || "",
      newValue: row.new_value || "",
      changedAt: row.changed_at || "",
      changedBy: row.changed_by || "",
      user: profileSummary(row.changed_by)
    };
  }

  function savedViewToUi(row) {
    return {
      id: row.id,
      ownerId: row.owner_id || "",
      name: row.name || "Gespeicherte Suche",
      description: row.description || "",
      scope: row.scope || "private",
      viewType: row.view_type || "contacts",
      filters: row.filters || {},
      searchQuery: row.search_query || "",
      sortKey: row.sort_key || "updated_at",
      sortDirection: row.sort_direction || "desc",
      pageSize: row.page_size || 20,
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      owner: profileSummary(row.owner_id)
    };
  }

  function uiToSavedView(view, ownerId) {
    return {
      owner_id: ownerId,
      name: String(view.name || "").trim(),
      description: String(view.description || "").trim() || null,
      scope: view.scope === "team" ? "team" : "private",
      view_type: view.viewType || view.view_type || "contacts",
      filters: view.filters || {},
      search_query: String(view.searchQuery || view.search_query || "").trim(),
      sort_key: view.sortKey || view.sort_key || "updated_at",
      sort_direction: view.sortDirection === "asc" || view.sort_direction === "asc" ? "asc" : "desc",
      page_size: Number(view.pageSize || view.page_size || 20),
      is_default: Boolean(view.isDefault || view.is_default)
    };
  }

  function normalizeFormatStatus(value) {
    const label = String(value || "").trim();
    if (["Planung", "Aktiv", "Abgeschlossen", "Archiviert"].includes(label)) return label;
    if (label === "archived") return "Archiviert";
    return "Planung";
  }

  function normalizeInvitationStatus(value) {
    const label = String(value || "").trim();
    if (["Kandidat", "Eingeladen", "Zugesagt", "Abgesagt", "Keine Rückmeldung", "Teilgenommen"].includes(label)) return label;
    return "Kandidat";
  }

  function participantDbToUi(row) {
    return {
      id: row.id || "",
      formatId: row.format_id || row.formatId || "",
      contactId: row.contact_id || row.contactId || "",
      invitationStatus: normalizeInvitationStatus(row.invitation_status || row.invitationStatus),
      participantRole: row.participant_role || row.participantRole || "",
      notes: row.notes || "",
      createdAt: row.created_at || row.createdAt || "",
      createdBy: row.created_by || row.createdBy || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      updatedBy: row.updated_by || row.updatedBy || ""
    };
  }

  function participantUiToDb(participant, formatId, contactId) {
    return {
      format_id: formatId || participant.formatId || participant.format_id,
      contact_id: contactId || participant.contactId || participant.contact_id,
      invitation_status: normalizeInvitationStatus(participant.invitationStatus || participant.invitation_status),
      participant_role: String(participant.participantRole || participant.participant_role || "").trim() || null,
      notes: String(participant.notes || "").trim() || null
    };
  }

  function formatDbToUi(row, participants = []) {
    return {
      id: row.id || "",
      title: row.title || "Unbenanntes Format",
      formatType: row.format_type || row.formatType || "Roundtable",
      startsAt: row.starts_at || row.startsAt || "",
      endsAt: row.ends_at || row.endsAt || "",
      location: row.location || "",
      goal: row.goal || "",
      ownerId: row.owner_id || row.ownerId || "",
      owner: profileName(row.owner_id || row.ownerId),
      status: normalizeFormatStatus(row.status),
      notes: row.notes || "",
      createdAt: row.created_at || row.createdAt || "",
      createdBy: row.created_by || row.createdBy || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      updatedBy: row.updated_by || row.updatedBy || "",
      participants: participants.map(participantDbToUi)
    };
  }

  function formatUiToDb(format) {
    return {
      title: String(format.title || "").trim(),
      format_type: String(format.formatType || format.format_type || "Roundtable").trim() || "Roundtable",
      starts_at: format.startsAt || format.starts_at || null,
      ends_at: format.endsAt || format.ends_at || null,
      location: String(format.location || "").trim() || null,
      goal: String(format.goal || "").trim() || null,
      owner_id: format.ownerId || format.owner_id || resolveOwnerId(format.owner) || null,
      status: normalizeFormatStatus(format.status),
      notes: String(format.notes || "").trim() || null
    };
  }

  function userSettingsToUi(row) {
    if (!row) return null;
    return {
      userId: row.user_id,
      defaultViewId: row.default_view_id || "",
      defaultViewType: row.default_view_type || "contacts",
      tableDensity: row.table_density || "comfortable",
      theme: row.theme || "system",
      fontScale: Number(row.font_scale || 1),
      pageSize: row.page_size || 20,
      preferences: row.preferences || {},
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  function uiToDb(contact) {
    const db = {
      id: contact.id,
      organization_id: contact.organizationId || contact.organization_id || null,
      name: String(contact.name || "").trim(),
      organization: String(contact.organization || "").trim() || null,
      sector: String(contact.category || contact.sector || "").trim() || "Praxis",
      specialty: String(contact.specialty || "").trim() || null,
      role: String(contact.contactRole || contact.role || "").trim() || null,
      priority: normalizePriority(contact.priority),
      owner_id: contact.ownerId || resolveOwnerId(contact.owner),
      postal_code: contact.postalCode || contact.postal_code || null,
      city: contact.city || null,
      federal_state: contact.state || contact.federal_state || null,
      latitude: Number.isFinite(Number(contact.lat ?? contact.latitude)) ? Number(contact.lat ?? contact.latitude) : null,
      longitude: Number.isFinite(Number(contact.lon ?? contact.longitude)) ? Number(contact.lon ?? contact.longitude) : null,
      email: contact.email || null,
      phone: contact.phone || null,
      linkedin: contact.linkedin || null,
      topics: splitList(contact.themes || contact.topics),
      notes: contact.note || contact.notes || null,
      source: splitList(contact.sources || contact.source).join("; ") || null,
      image_url: contact.image || contact.image_url || null,
      image_source_url: contact.imageSourceUrl || contact.image_source_url || null,
      image_source_label: contact.imageSourceLabel || contact.image_source_label || null,
      image_rights_note: contact.imageRightsNote || contact.image_rights_note || null,
      image_updated_at: contact.imageUpdatedAt || contact.image_updated_at || null,
      image_updated_by: contact.imageUpdatedBy || contact.image_updated_by || null,
      status: contact.status || "active"
    };
    Object.keys(db).forEach((key) => {
      if (!WRITE_FIELDS.includes(key)) delete db[key];
    });
    return db;
  }

  function applyFilters(items, filters = {}) {
    return items.filter((contact) => {
      if (filters.status && contact.status !== filters.status) return false;
      if (filters.sector && contact.category !== filters.sector) return false;
      if (filters.state && contact.state !== filters.state) return false;
      if (filters.priority && contact.priority !== filters.priority) return false;
      return true;
    });
  }

  function normalizeOrganizationName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function organizationDbToUi(row, contactCount = 0) {
    return {
      id: row.id,
      name: row.name || "",
      normalizedName: row.normalized_name || normalizeOrganizationName(row.name),
      sector: row.sector || "",
      organizationType: row.organization_type || "",
      postalCode: row.postal_code || "",
      city: row.city || "",
      state: row.federal_state || "",
      latitude: row.latitude,
      longitude: row.longitude,
      lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
      lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
      website: row.website || "",
      phone: row.phone || "",
      email: row.email || "",
      notes: row.notes || "",
      source: row.source || "",
      status: row.status || "active",
      contactCount,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      createdBy: row.created_by || "",
      updatedBy: row.updated_by || ""
    };
  }

  function expertGroupName(groupId, fallback = "") {
    const group = expertGroupCache.find((item) => item.id === groupId);
    return group?.name || fallback || "";
  }

  function expertGroupDbToUi(row, index = 0) {
    return {
      id: row.id || `expert-group-${index + 1}`,
      name: row.name || "",
      sortOrder: Number(row.sort_order ?? row.sortOrder ?? (index + 1) * 10),
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }

  function expertContactDbToUi(row, index = 0) {
    const groupName = row.group_name || row.groupName || expertGroupName(row.group_id || row.groupId, row.group || row.category || row.sector);
    const topics = splitList(row.topics || row.themes);
    const source = row.source || row.sources || "INA Expertenkreis";
    const profileUrl = row.profile_url || row.profileUrl || row.sourceUrl || row.url || "";
    return {
      id: row.id || `expert-contact-${index + 1}`,
      name: row.name || "",
      organizationId: row.organization_id || row.organizationId || "",
      organization: row.organization || "",
      groupId: row.group_id || row.groupId || "",
      group: groupName,
      category: groupName,
      specialty: row.specialty || "",
      contactRole: row.role || row.contactRole || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      email: row.email || "",
      phone: row.phone || "",
      linkedin: row.linkedin || "",
      themes: topics,
      note: row.notes || row.note || "",
      sources: splitList(source),
      url: profileUrl,
      sourceUrl: profileUrl,
      status: row.status || "active",
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      _index: index
    };
  }

  function expertOrganizationDbToUi(row, contactCount = 0) {
    const groupName = row.group_name || row.groupName || expertGroupName(row.group_id || row.groupId, row.group || row.sector || row.category);
    return {
      id: row.id || "",
      name: row.name || "",
      normalizedName: row.normalized_name || row.normalizedName || normalizeOrganizationName(row.name),
      groupId: row.group_id || row.groupId || "",
      group: groupName,
      sector: groupName,
      organizationType: row.organization_type || row.organizationType || "",
      city: row.city || "",
      state: row.federal_state || row.state || "",
      website: row.website || "",
      phone: row.phone || "",
      email: row.email || "",
      notes: row.notes || "",
      source: row.source || "",
      status: row.status || "active",
      contactCount: Number(row.contact_count ?? row.contactCount ?? contactCount ?? 0),
      createdAt: row.created_at || row.createdAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }

  function expertEntityLinkDbToUi(row = {}) {
    return {
      id: row.id || "",
      linkType: row.link_type || row.linkType || "",
      contactId: row.contact_id || row.contactId || "",
      expertContactId: row.expert_contact_id || row.expertContactId || "",
      organizationId: row.organization_id || row.organizationId || "",
      expertOrganizationId: row.expert_organization_id || row.expertOrganizationId || "",
      matchReason: row.match_reason || row.matchReason || "",
      confidence: Number(row.confidence ?? row.score ?? 0),
      createdAt: row.created_at || row.createdAt || "",
      createdBy: row.created_by || row.createdBy || "",
      updatedAt: row.updated_at || row.updatedAt || "",
      updatedBy: row.updated_by || row.updatedBy || ""
    };
  }

  function expertEntityLinkUiToDb(link = {}) {
    const linkType = String(link.linkType || link.link_type || "").trim();
    return {
      link_type: linkType,
      contact_id: link.contactId || link.contact_id || null,
      expert_contact_id: link.expertContactId || link.expert_contact_id || null,
      organization_id: link.organizationId || link.organization_id || null,
      expert_organization_id: link.expertOrganizationId || link.expert_organization_id || null,
      match_reason: String(link.matchReason || link.match_reason || "").trim() || null,
      confidence: Number.isFinite(Number(link.confidence ?? link.score)) ? Number(link.confidence ?? link.score) : null
    };
  }

  function expertGroupIdForName(name = "", fallbackId = "") {
    const normalized = String(name || "").trim().toLowerCase();
    if (!normalized) return fallbackId || "";
    const group = expertGroupCache.find((item) => String(item.name || "").trim().toLowerCase() === normalized);
    return group?.id || fallbackId || "";
  }

  function expertContactUiToDb(contact = {}) {
    const groupName = String(contact.group || contact.category || contact.groupName || "").trim();
    const groupId = String(contact.groupId || contact.group_id || expertGroupIdForName(groupName)).trim();
    return {
      id: contact.id || `expert-contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(contact.name || "").trim(),
      organization_id: contact.organizationId || contact.organization_id || null,
      organization: String(contact.organization || "").trim() || null,
      group_id: groupId,
      group_name: groupName || expertGroupName(groupId),
      specialty: String(contact.specialty || "").trim() || null,
      role: String(contact.contactRole || contact.role || "").trim() || null,
      city: String(contact.city || "").trim() || null,
      federal_state: String(contact.state || contact.federal_state || "").trim() || null,
      email: String(contact.email || "").trim() || null,
      phone: String(contact.phone || "").trim() || null,
      linkedin: String(contact.linkedin || "").trim() || null,
      topics: splitList(contact.themes || contact.topics),
      notes: String(contact.note || contact.notes || "").trim() || null,
      source: splitList(contact.sources || contact.source).join("; ") || "Manuell angelegt",
      profile_url: String(contact.url || contact.sourceUrl || contact.profileUrl || "").trim() || null,
      status: contact.status || "active"
    };
  }

  function expertOrganizationUiToDb(organization = {}) {
    const groupName = String(organization.group || organization.sector || organization.category || organization.groupName || "").trim();
    const groupId = String(organization.groupId || organization.group_id || expertGroupIdForName(groupName)).trim();
    const name = String(organization.name || "").trim();
    return {
      id: organization.id || `expert-org-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      normalized_name: normalizeOrganizationName(organization.normalizedName || name),
      group_id: groupId || null,
      group_name: groupName || expertGroupName(groupId) || null,
      organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
      city: String(organization.city || "").trim() || null,
      federal_state: String(organization.state || organization.federal_state || "").trim() || null,
      website: String(organization.website || "").trim() || null,
      phone: String(organization.phone || "").trim() || null,
      email: String(organization.email || "").trim() || null,
      notes: String(organization.notes || "").trim() || null,
      source: String(organization.source || "").trim() || "Manuell angelegt",
      status: organization.status || "active"
    };
  }

  function organizationUiToDb(organization) {
    const name = String(organization.name || "").trim();
    return {
      name,
      normalized_name: normalizeOrganizationName(organization.normalizedName || name),
      sector: String(organization.sector || "").trim() || null,
      organization_type: String(organization.organizationType || organization.organization_type || "").trim() || null,
      postal_code: organization.postalCode || organization.postal_code || null,
      city: organization.city || null,
      federal_state: organization.state || organization.federal_state || null,
      latitude: Number.isFinite(Number(organization.lat ?? organization.latitude)) ? Number(organization.lat ?? organization.latitude) : null,
      longitude: Number.isFinite(Number(organization.lon ?? organization.longitude)) ? Number(organization.lon ?? organization.longitude) : null,
      website: String(organization.website || "").trim() || null,
      phone: String(organization.phone || "").trim() || null,
      email: String(organization.email || "").trim() || null,
      notes: String(organization.notes || organization.note || "").trim() || null,
      source: String(organization.source || "").trim() || null,
      status: organization.status || "active"
    };
  }

  async function loadProfiles() {
    if (isLocalMode()) {
      const profiles = isDemoMode() ? demoProfiles() : [localProfile()];
      profileCache = new Map(profiles.map((profile) => [profile.id, profile]));
      return [...profileCache.values()];
    }
    if (usesApiGateway()) {
      const payload = await apiGet("/api/profiles");
      const profiles = Array.isArray(payload.items) ? payload.items : [];
      profileCache = new Map(profiles.map((profile) => [profile.id, profile]));
      return [...profileCache.values()];
    }
    const { data, error } = await getClient()
      .from("profiles")
      .select(PROFILE_FIELDS.join(","))
      .eq("active", true);
    if (error) throw error;
    profileCache = new Map((data || []).map((profile) => [profile.id, profile]));
    return [...profileCache.values()];
  }

  async function getProfiles() {
    if (!profileCache.size) return loadProfiles();
    return [...profileCache.values()];
  }

  async function getCurrentProfile() {
    if (isLocalMode()) {
      const profile = localProfile();
      return profileCache.get(profile.id) || profile;
    }
    if (isGcpMode()) {
      const session = await apiGet("/api/session");
      const profile = session?.profile || null;
      if (profile?.id) profileCache.set(profile.id, profile);
      return profile;
    }
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) return null;
    if (usesApiGateway()) {
      const profile = await apiGet("/api/profile");
      if (profile?.id) profileCache.set(profile.id, profile);
      return profile;
    }
    if (!profileCache.size) await loadProfiles();
    return profileCache.get(userId) || null;
  }

  async function updateCurrentProfile(profile = {}) {
    if (isLocalMode()) {
      requireLocalWrite("Profil speichern");
      const current = localProfile();
      const updated = {
        ...current,
        display_name: String(profile.displayName ?? profile.display_name ?? current.display_name ?? "").trim(),
        initials: String(profile.initials || current.initials || "").trim().slice(0, 4).toUpperCase(),
        team: String(profile.team ?? current.team ?? "").trim(),
        bio: String(profile.bio ?? current.bio ?? "").trim(),
        avatar_url: profile.avatarUrl ?? profile.avatar_url ?? current.avatar_url ?? "",
        updated_at: new Date().toISOString()
      };
      if (!updated.display_name) throw new Error("Bitte trage einen Anzeigenamen ein.");
      profileCache.set(updated.id, updated);
      return updated;
    }
    if (isGcpMode()) {
      const current = await getCurrentProfile();
      if (!current?.id) throw new Error("Im GCP-Pilot ist kein Profil aktiv.");
      const updated = {
        ...current,
        display_name: String(profile.displayName ?? profile.display_name ?? current.display_name ?? "").trim(),
        initials: String(profile.initials || current.initials || "").trim().slice(0, 4).toUpperCase(),
        team: String(profile.team ?? current.team ?? "").trim(),
        bio: String(profile.bio ?? current.bio ?? "").trim(),
        avatar_url: profile.avatarUrl ?? profile.avatar_url ?? current.avatar_url ?? "",
        updated_at: new Date().toISOString()
      };
      if (!updated.display_name) throw new Error("Bitte trage einen Anzeigenamen ein.");
      profileCache.set(updated.id, updated);
      return updated;
    }
    if (usesApiGateway()) {
      const updated = await apiRequest("/api/profile", {
        method: "PATCH",
        body: profile
      });
      if (updated?.id) profileCache.set(updated.id, updated);
      return updated;
    }
    const userId = await getCurrentUserId();
    const payload = {
      display_name: String(profile.displayName ?? profile.display_name ?? "").trim(),
      initials: String(profile.initials || "").trim().slice(0, 4).toUpperCase() || null,
      team: String(profile.team || "").trim() || null,
      bio: String(profile.bio || "").trim() || null,
      avatar_url: profile.avatarUrl ?? profile.avatar_url ?? null,
      updated_at: new Date().toISOString()
    };
    if (!payload.display_name) throw new Error("Bitte trage einen Anzeigenamen ein.");
    const { data, error } = await getClient()
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select(PROFILE_FIELDS.join(","))
      .single();
    if (error) throw error;
    profileCache.set(userId, data);
    return data;
  }

  async function uploadCurrentProfileImage(file) {
    if (isGcpMode()) throw new Error("Profilfoto-Upload ist im GCP-Pilot noch nicht aktiv.");
    if (isLocalMode()) throw new Error("Profilfoto-Upload ist im Demo-Modus nicht verfuegbar.");
    if (!file) throw new Error("Bitte wähle ein Profilfoto aus.");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) throw new Error("Bitte nutze ein JPG-, PNG- oder WebP-Bild.");
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("Das Profilfoto darf maximal 5 MB groß sein.");

    if (usesApiGateway()) {
      const payload = await apiRequest("/api/profile/avatar", {
        method: "POST",
        body: {
          fileName: file.name || "avatar",
          contentType: file.type,
          data: await fileToBase64(file)
        }
      });
      return payload.publicUrl || "";
    }
    const userId = await getCurrentUserId();
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar.${extension}`;
    const { error } = await getClient().storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true
    });
    if (error) throw error;
    const { data } = getClient().storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function removeCurrentProfileImage() {
    if (isGcpMode()) {
      const current = await getCurrentProfile();
      return updateCurrentProfile({ ...(current || {}), avatar_url: null, avatarUrl: null });
    }
    if (isLocalMode()) return updateCurrentProfile({ ...(localProfile() || {}), avatar_url: null, avatarUrl: null });
    if (usesApiGateway()) {
      const updated = await apiRequest("/api/profile/avatar", { method: "DELETE" });
      if (updated?.id) profileCache.set(updated.id, updated);
      return updated;
    }
    const userId = await getCurrentUserId();
    const paths = ["jpg", "jpeg", "png", "webp"].map((extension) => `${userId}/avatar.${extension}`);
    await getClient().storage.from(PROFILE_IMAGE_BUCKET).remove(paths);
    return updateCurrentProfile({ ...(profileCache.get(userId) || {}), avatar_url: null });
  }

  async function loadContacts(options = {}) {
    if (isLocalMode()) {
      contactCache = localContacts(options);
      return contactCache;
    }
    if (usesApiGateway()) {
      const payload = await apiGet("/api/contacts", {
        includeArchived: options.includeArchived ? "true" : "",
        status: options.status || ""
      });
      contactCache = Array.isArray(payload.items) ? payload.items : [];
      return contactCache;
    }
    const supabase = getClient();
    await loadProfiles();
    let query = supabase
      .from("contacts")
      .select(contactSelectFields())
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    if (options.status) query = query.eq("status", options.status);
    const { data, error } = await query;
    if (error) {
      if (supportsContactOrganizationId && isMissingOrganizationIdError(error)) {
        supportsContactOrganizationId = false;
        return loadContacts(options);
      }
      if (supportsContactImageSources && isMissingContactImageSourceError(error)) {
        supportsContactImageSources = false;
        return loadContacts(options);
      }
      if (supportsContactRole && isMissingContactRoleError(error)) {
        supportsContactRole = false;
        return loadContacts(options);
      }
      throw error;
    }
    contactCache = (data || []).map(dbToUi);
    return contactCache;
  }

  async function getContacts(filters = {}) {
    if (!contactCache.length) await loadContacts();
    return applyFilters(contactCache, filters);
  }

  async function getContact(id) {
    const cached = contactCache.find((contact) => contact.id === id);
    if (cached) return cached;
    if (isLocalMode()) {
      const contact = localContacts({ includeArchived: true }).find((item) => item.id === id);
      if (!contact) throw new Error("Kontakt wurde im Demo-Datensatz nicht gefunden.");
      return contact;
    }
    if (usesApiGateway()) {
      return apiGet(`/api/contacts/${encodeURIComponent(id)}`);
    }
    const { data, error } = await getClient().from("contacts").select(contactSelectFields()).eq("id", id).single();
    if (error) {
      if (supportsContactOrganizationId && isMissingOrganizationIdError(error)) {
        supportsContactOrganizationId = false;
        return getContact(id);
      }
      if (supportsContactImageSources && isMissingContactImageSourceError(error)) {
        supportsContactImageSources = false;
        return getContact(id);
      }
      if (supportsContactRole && isMissingContactRoleError(error)) {
        supportsContactRole = false;
        return getContact(id);
      }
      throw error;
    }
    return dbToUi(data);
  }

  async function getContactChanges(contactId, options = {}) {
    if (isLocalMode()) {
      const rows = Array.isArray(demoData().changes) ? demoData().changes : [];
      return clone(rows)
        .filter((change) => (change.contactId || change.contact_id) === contactId)
        .filter((change) => !options.action || (change.action || "update") === options.action)
        .map((change) => ({
          id: change.id,
          contactId: change.contactId || change.contact_id,
          action: change.action || "update",
          fieldName: change.fieldName || change.field_name || "",
          oldValue: change.oldValue || change.old_value || "",
          newValue: change.newValue || change.new_value || "",
          changedAt: change.changedAt || change.changed_at || "",
          changedBy: change.changedBy || change.changed_by || "",
          user: profileSummary(change.changedBy || change.changed_by)
        }));
    }
    if (usesApiGateway()) {
      const payload = await apiGet(`/api/contacts/${encodeURIComponent(contactId)}/history`, {
        action: options.action || ""
      });
      return Array.isArray(payload.items) ? payload.items : [];
    }
    if (!profileCache.size) await loadProfiles();
    let query = getClient()
      .from("changes")
      .select(CHANGE_FIELDS.join(","))
      .eq("contact_id", contactId)
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false });
    if (options.action) query = query.eq("action", options.action);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(changeToUi);
  }

  async function loadBackendRegistrations(options = {}) {
    const status = String(options.status || "").trim();
    if (isLocalMode() || !backendBaseUrl()) {
      return localRegistrations()
        .filter((row) => !status || row.status === status)
        .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
    }
    const url = new URL(`${backendBaseUrl()}/versorgungs-netzwerk/registrierungen`);
    if (status) url.searchParams.set("status", status);
    const response = await fetch(url.href, {
      method: "GET",
      headers: registrationHeaders(),
      credentials: CONFIG.gematikBackendCredentials || "same-origin"
    });
    if (!response.ok) throw new Error(`Registrierungen konnten nicht geladen werden (${response.status}).`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
    return rows.map(normalizeRegistration);
  }

  async function updateBackendRegistration(id, patch = {}) {
    const registrationId = String(id || "").trim();
    if (!registrationId) throw new Error("Registrierungs-ID fehlt.");
    const status = String(patch.status || "").trim();
    if (!status) throw new Error("Registrierungsstatus fehlt.");
    const processedBy = String(patch.processedBy || patch.processed_by || "").trim();
    const processedAt = patch.processedAt || patch.processed_at || new Date().toISOString();
    if (isLocalMode() || !backendBaseUrl()) {
      const rows = localRegistrations();
      const existing = rows.find((row) => row.id === registrationId);
      if (!existing) throw new Error("Registrierung wurde nicht gefunden.");
      const updated = normalizeRegistration({
        ...existing,
        ...patch,
        status,
        processed_at: processedAt,
        processed_by: processedBy
      });
      persistLocalRegistrations(rows.map((row) => (row.id === registrationId ? updated : row)));
      return updated;
    }
    const response = await fetch(`${backendBaseUrl()}/versorgungs-netzwerk/registrierungen/${encodeURIComponent(registrationId)}`, {
      method: "PATCH",
      headers: registrationHeaders(),
      credentials: CONFIG.gematikBackendCredentials || "same-origin",
      body: JSON.stringify({
        ...patch,
        status,
        processed_at: processedAt,
        processed_by: processedBy
      })
    });
    if (!response.ok) throw new Error(`Registrierung konnte nicht aktualisiert werden (${response.status}).`);
    if (response.status === 204) {
      return normalizeRegistration({ id: registrationId, ...patch, status, processed_at: processedAt, processed_by: processedBy });
    }
    return normalizeRegistration(await response.json());
  }

  async function loadOrganizations(options = {}) {
    if (isLocalMode()) {
      organizationCache = localOrganizations(options);
      return clone(organizationCache);
    }
    if (usesApiGateway()) {
      const payload = await apiGet("/api/organizations", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      organizationCache = Array.isArray(payload.items) ? payload.items : [];
      return clone(organizationCache);
    }
    const supabase = getClient();
    let query = supabase
      .from("organizations")
      .select(ORGANIZATION_FIELDS.join(","))
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    const { data, error } = await query;
    if (error) throw error;

    const ids = (data || []).map((row) => row.id);
    const counts = new Map();
    if (ids.length) {
      const { data: linkedContacts, error: countError } = await supabase
        .from("contacts")
        .select("organization_id")
        .in("organization_id", ids)
        .neq("status", "archived");
      if (countError) throw countError;
      (linkedContacts || []).forEach((row) => {
        if (row.organization_id) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
      });
    }
    organizationCache = (data || []).map((row) => organizationDbToUi(row, counts.get(row.id) || 0));
    return clone(organizationCache);
  }

  async function getOrganization(id) {
    if (isLocalMode()) {
      if (!organizationCache.length) organizationCache = localOrganizations({ includeArchived: true });
      const organization = organizationCache.find((item) => item.id === id);
      if (!organization) throw new Error("Organisation wurde im Demo-Datensatz nicht gefunden.");
      return clone(organization);
    }
    if (usesApiGateway()) {
      return apiGet(`/api/organizations/${encodeURIComponent(id)}`);
    }
    const { data, error } = await getClient().from("organizations").select(ORGANIZATION_FIELDS.join(",")).eq("id", id).single();
    if (error) throw error;
    return organizationDbToUi(data);
  }

  async function loadExpertGroups(options = {}) {
    if (isLocalMode() || isGcpMode()) {
      expertGroupCache = localExpertGroups(options);
      return clone(expertGroupCache);
    }
    if (usesApiGateway()) {
      const payload = await apiGet("/api/expert-groups", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      expertGroupCache = Array.isArray(payload.items) ? payload.items.map(expertGroupDbToUi) : [];
      return clone(expertGroupCache);
    }
    let query = getClient()
      .from("expert_groups")
      .select(EXPERT_GROUP_FIELDS.join(","))
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    const { data, error } = await query;
    if (error) throw error;
    expertGroupCache = (data || []).map(expertGroupDbToUi);
    return clone(expertGroupCache);
  }

  async function loadExpertContacts(options = {}) {
    if (isLocalMode() || isGcpMode()) {
      if (!expertGroupCache.length) expertGroupCache = localExpertGroups({ includeArchived: true });
      expertContactCache = localExpertContacts(options).map(expertContactDbToUi);
      return clone(expertContactCache);
    }
    if (usesApiGateway()) {
      if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
      const payload = await apiGet("/api/expert-contacts", {
        includeArchived: options.includeArchived ? "true" : "",
        status: options.status || ""
      });
      expertContactCache = Array.isArray(payload.items) ? payload.items.map(expertContactDbToUi) : [];
      return clone(expertContactCache);
    }
    if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
    let query = getClient()
      .from("expert_contacts")
      .select(EXPERT_CONTACT_FIELDS.join(","))
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    if (options.status) query = query.eq("status", options.status);
    const { data, error } = await query;
    if (error) throw error;
    expertContactCache = (data || []).map(expertContactDbToUi);
    return clone(expertContactCache);
  }

  async function loadExpertOrganizations(options = {}) {
    if (isLocalMode() || isGcpMode()) {
      if (!expertGroupCache.length) expertGroupCache = localExpertGroups({ includeArchived: true });
      expertOrganizationCache = localExpertOrganizations(options).map(expertOrganizationDbToUi);
      return clone(expertOrganizationCache);
    }
    if (usesApiGateway()) {
      if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
      const payload = await apiGet("/api/expert-organizations", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      expertOrganizationCache = Array.isArray(payload.items) ? payload.items.map(expertOrganizationDbToUi) : [];
      return clone(expertOrganizationCache);
    }
    if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
    const supabase = getClient();
    let query = supabase
      .from("expert_organizations")
      .select(EXPERT_ORGANIZATION_FIELDS.join(","))
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    const { data, error } = await query;
    if (error) throw error;

    const ids = (data || []).map((row) => row.id);
    const counts = new Map();
    if (ids.length) {
      const { data: linkedContacts, error: countError } = await supabase
        .from("expert_contacts")
        .select("organization_id")
        .in("organization_id", ids)
        .neq("status", "archived");
      if (countError) throw countError;
      (linkedContacts || []).forEach((row) => {
        if (row.organization_id) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
      });
    }
    expertOrganizationCache = (data || []).map((row) => expertOrganizationDbToUi(row, counts.get(row.id) || 0));
    return clone(expertOrganizationCache);
  }

  async function createExpertContact(contact = {}) {
    if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
    const payload = expertContactUiToDb(contact);
    if (!payload.name) throw new Error("Name des Expertenkreis-Kontakts fehlt.");
    if (!payload.group_id || !payload.group_name) throw new Error("Bitte wähle eine Gruppe für den Expertenkreis-Kontakt.");
    if (isLocalMode() || isGcpMode()) {
      requireLocalWrite("Expertenkreis-Kontakt speichern");
      const created = expertContactDbToUi({
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      persistLocalExpertContacts([created, ...expertContactCache.filter((item) => item.id !== created.id)]);
      return created;
    }
    if (usesApiGateway()) {
      const created = await apiRequest("/api/expert-contacts", {
        method: "POST",
        body: contact
      });
      const normalized = expertContactDbToUi(created);
      expertContactCache = [normalized, ...expertContactCache.filter((item) => item.id !== normalized.id)];
      return normalized;
    }
    const { data, error } = await getClient()
      .from("expert_contacts")
      .insert(payload)
      .select(EXPERT_CONTACT_FIELDS.join(","))
      .single();
    if (error) throw error;
    const created = expertContactDbToUi(data);
    expertContactCache = [created, ...expertContactCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function createExpertOrganization(organization = {}) {
    if (!expertGroupCache.length) await loadExpertGroups({ includeArchived: true });
    const payload = expertOrganizationUiToDb(organization);
    if (!payload.name) throw new Error("Name der Expertenkreis-Organisation fehlt.");
    if (isLocalMode() || isGcpMode()) {
      requireLocalWrite("Expertenkreis-Organisation speichern");
      const created = expertOrganizationDbToUi({
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      persistLocalExpertOrganizations([created, ...expertOrganizationCache.filter((item) => item.id !== created.id)]);
      return created;
    }
    if (usesApiGateway()) {
      const created = await apiRequest("/api/expert-organizations", {
        method: "POST",
        body: organization
      });
      const normalized = expertOrganizationDbToUi(created);
      expertOrganizationCache = [normalized, ...expertOrganizationCache.filter((item) => item.id !== normalized.id)];
      return normalized;
    }
    const { data, error } = await getClient()
      .from("expert_organizations")
      .insert(payload)
      .select(EXPERT_ORGANIZATION_FIELDS.join(","))
      .single();
    if (error) throw error;
    const created = expertOrganizationDbToUi(data);
    expertOrganizationCache = [created, ...expertOrganizationCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function loadExpertEntityLinks() {
    if (isLocalMode() || isGcpMode()) return localExpertEntityLinks();
    if (usesApiGateway()) {
      const payload = await apiGet("/api/expert-entity-links");
      expertEntityLinkCache = Array.isArray(payload.items) ? payload.items.map(expertEntityLinkDbToUi) : [];
      return clone(expertEntityLinkCache);
    }
    const { data, error } = await getClient()
      .from("expert_entity_links")
      .select(EXPERT_ENTITY_LINK_FIELDS.join(","))
      .order("updated_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    expertEntityLinkCache = (data || []).map(expertEntityLinkDbToUi);
    return clone(expertEntityLinkCache);
  }

  async function createExpertEntityLink(link = {}) {
    if (isLocalMode() || isGcpMode()) {
      requireLocalAdmin("Expertenkreis-Verknuepfung bestätigen");
      const created = expertEntityLinkDbToUi({
        ...link,
        id: link.id || `local-expert-link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const exists = expertEntityLinkCache.some((item) =>
        item.linkType === created.linkType &&
        item.contactId === created.contactId &&
        item.expertContactId === created.expertContactId &&
        item.organizationId === created.organizationId &&
        item.expertOrganizationId === created.expertOrganizationId
      );
      if (!exists) persistLocalExpertEntityLinks([created, ...expertEntityLinkCache]);
      return created;
    }
    if (usesApiGateway()) {
      const created = await apiRequest("/api/expert-entity-links", {
        method: "POST",
        body: link
      });
      expertEntityLinkCache = [created, ...expertEntityLinkCache.filter((item) => item.id !== created.id)];
      return expertEntityLinkDbToUi(created);
    }
    const userId = await getCurrentUserId();
    const payload = {
      ...expertEntityLinkUiToDb(link),
      created_by: userId,
      updated_by: userId
    };
    const { data, error } = await getClient()
      .from("expert_entity_links")
      .insert(payload)
      .select(EXPERT_ENTITY_LINK_FIELDS.join(","))
      .single();
    if (error) throw error;
    const created = expertEntityLinkDbToUi(data);
    expertEntityLinkCache = [created, ...expertEntityLinkCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function deleteExpertEntityLink(id) {
    if (isLocalMode() || isGcpMode()) {
      requireLocalAdmin("Expertenkreis-Verknuepfung entfernen");
      persistLocalExpertEntityLinks(expertEntityLinkCache.filter((item) => item.id !== id));
      return true;
    }
    if (usesApiGateway()) {
      await apiRequest(`/api/expert-entity-links/${encodeURIComponent(id)}`, { method: "DELETE" });
      expertEntityLinkCache = expertEntityLinkCache.filter((item) => item.id !== id);
      return true;
    }
    const { error } = await getClient().from("expert_entity_links").delete().eq("id", id);
    if (error) throw error;
    expertEntityLinkCache = expertEntityLinkCache.filter((item) => item.id !== id);
    return true;
  }

  async function createOrganization(organization) {
    if (isLocalMode()) {
      requireLocalWrite("Organisation speichern");
      const name = String(organization?.name || "").trim();
      if (!name) throw new Error("Name der Organisation fehlt.");
      const created = {
        id: organization.id || `local-organization-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        normalizedName: normalizeOrganizationName(name),
        sector: String(organization.sector || "").trim(),
        organizationType: String(organization.organizationType || "").trim(),
        postalCode: String(organization.postalCode || "").trim(),
        city: String(organization.city || "").trim(),
        state: String(organization.state || "").trim(),
        website: String(organization.website || "").trim(),
        phone: String(organization.phone || "").trim(),
        email: String(organization.email || "").trim(),
        source: String(organization.source || "").trim(),
        notes: String(organization.notes || "").trim(),
        status: "active",
        contactCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      organizationCache = [created, ...organizationCache.filter((item) => item.id !== created.id)];
      return clone(created);
    }
    if (usesApiGateway()) {
      const created = apiOrganizationPayload(await apiRequest("/api/organizations", {
        method: "POST",
        body: organization
      }));
      organizationCache = [created, ...organizationCache.filter((item) => item.id !== created.id)];
      return created;
    }
    const userId = await getCurrentUserId();
    const payload = { ...organizationUiToDb(organization), created_by: userId, updated_by: userId };
    if (!payload.name) throw new Error("Name der Organisation fehlt.");
    const { data, error } = await getClient().from("organizations").insert(payload).select(ORGANIZATION_FIELDS.join(",")).single();
    if (error) throw error;
    const created = organizationDbToUi(data);
    organizationCache = [created, ...organizationCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function updateOrganization(id, patch) {
    if (isLocalMode()) {
      requireLocalWrite("Organisation speichern");
      if (!organizationCache.length) organizationCache = localOrganizations({ includeArchived: true });
      const existing = organizationCache.find((item) => item.id === id);
      if (!existing) throw new Error("Organisation wurde im Demo-Datensatz nicht gefunden.");
      const updated = {
        ...existing,
        ...patch,
        id,
        normalizedName: normalizeOrganizationName(patch.name || existing.name),
        updatedAt: new Date().toISOString()
      };
      organizationCache = organizationCache.map((item) => (item.id === id ? updated : item));
      return clone(updated);
    }
    if (usesApiGateway()) {
      const updated = apiOrganizationPayload(await apiRequest(`/api/organizations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      }));
      organizationCache = organizationCache.map((item) => (item.id === id ? updated : item));
      return updated;
    }
    const userId = await getCurrentUserId();
    const payload = {};
    if ("name" in patch) {
      payload.name = String(patch.name || "").trim();
      payload.normalized_name = normalizeOrganizationName(patch.name);
    }
    if ("sector" in patch) payload.sector = String(patch.sector || "").trim() || null;
    if ("organizationType" in patch || "organization_type" in patch) payload.organization_type = String(patch.organizationType || patch.organization_type || "").trim() || null;
    if ("postalCode" in patch || "postal_code" in patch) payload.postal_code = patch.postalCode || patch.postal_code || null;
    if ("city" in patch) payload.city = patch.city || null;
    if ("state" in patch || "federal_state" in patch) payload.federal_state = patch.state || patch.federal_state || null;
    if ("latitude" in patch || "lat" in patch) payload.latitude = Number.isFinite(Number(patch.lat ?? patch.latitude)) ? Number(patch.lat ?? patch.latitude) : null;
    if ("longitude" in patch || "lon" in patch) payload.longitude = Number.isFinite(Number(patch.lon ?? patch.longitude)) ? Number(patch.lon ?? patch.longitude) : null;
    if ("website" in patch) payload.website = String(patch.website || "").trim() || null;
    if ("phone" in patch) payload.phone = String(patch.phone || "").trim() || null;
    if ("email" in patch) payload.email = String(patch.email || "").trim() || null;
    if ("notes" in patch || "note" in patch) payload.notes = String(patch.notes || patch.note || "").trim() || null;
    if ("source" in patch) payload.source = String(patch.source || "").trim() || null;
    if ("status" in patch) payload.status = patch.status || "active";
    payload.updated_by = userId;
    payload.updated_at = new Date().toISOString();
    const { data, error } = await getClient().from("organizations").update(payload).eq("id", id).select(ORGANIZATION_FIELDS.join(",")).single();
    if (error) throw error;
    const updated = organizationDbToUi(data);
    organizationCache = organizationCache.map((item) => (item.id === id ? updated : item));
    return updated;
  }

  async function linkContactToOrganization(contactId, organization) {
    const organizationId = typeof organization === "string" ? organization : organization?.id;
    const organizationName = typeof organization === "string" ? "" : organization?.name;
    return updateContact(contactId, { organizationId, organization: organizationName || undefined });
  }

  async function getSavedViews() {
    if (isGcpMode()) return localSavedViews();
    if (isLocalMode()) return localSavedViews();
    if (usesApiGateway()) {
      const payload = await apiGet("/api/saved-views");
      return Array.isArray(payload.items) ? payload.items : [];
    }
    if (!profileCache.size) await loadProfiles();
    const { data, error } = await getClient()
      .from("saved_views")
      .select(SAVED_VIEW_FIELDS.join(","))
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(savedViewToUi);
  }

  async function createSavedView(view) {
    if (isLocalMode() || isGcpMode()) {
      const created = {
        ...view,
        id: view.id || `demo-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: isGcpMode() ? (await getCurrentProfile())?.id || "gcp-pilot" : localProfile().id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      savedViewCache = [created, ...localSavedViews().filter((item) => item.id !== created.id)];
      return clone(created);
    }
    if (usesApiGateway()) {
      return apiRequest("/api/saved-views", {
        method: "POST",
        body: view
      });
    }
    const userId = await getCurrentUserId();
    const payload = uiToSavedView(view, userId);
    if (!payload.name) throw new Error("Name fuer gespeicherte Suche fehlt.");
    const { data, error } = await getClient().from("saved_views").insert(payload).select(SAVED_VIEW_FIELDS.join(",")).single();
    if (error) throw error;
    return savedViewToUi(data);
  }

  async function updateSavedView(id, patch) {
    if (isLocalMode() || isGcpMode()) {
      savedViewCache = localSavedViews().map((view) => (view.id === id ? { ...view, ...patch, id, updatedAt: new Date().toISOString() } : view));
      const updated = savedViewCache.find((view) => view.id === id);
      if (!updated) throw new Error("Gespeicherte Ansicht wurde im Demo-Modus nicht gefunden.");
      return clone(updated);
    }
    if (usesApiGateway()) {
      return apiRequest(`/api/saved-views/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
    }
    const payload = {};
    if ("name" in patch) payload.name = String(patch.name || "").trim();
    if ("description" in patch) payload.description = String(patch.description || "").trim() || null;
    if ("scope" in patch) payload.scope = patch.scope === "team" ? "team" : "private";
    if ("viewType" in patch || "view_type" in patch) payload.view_type = patch.viewType || patch.view_type || "contacts";
    if ("filters" in patch) payload.filters = patch.filters || {};
    if ("searchQuery" in patch || "search_query" in patch) payload.search_query = String(patch.searchQuery || patch.search_query || "").trim();
    if ("sortKey" in patch || "sort_key" in patch) payload.sort_key = patch.sortKey || patch.sort_key || "updated_at";
    if ("sortDirection" in patch || "sort_direction" in patch) {
      payload.sort_direction = patch.sortDirection === "asc" || patch.sort_direction === "asc" ? "asc" : "desc";
    }
    if ("pageSize" in patch || "page_size" in patch) payload.page_size = Number(patch.pageSize || patch.page_size || 20);
    if ("isDefault" in patch || "is_default" in patch) payload.is_default = Boolean(patch.isDefault || patch.is_default);
    const { data, error } = await getClient().from("saved_views").update(payload).eq("id", id).select(SAVED_VIEW_FIELDS.join(",")).single();
    if (error) throw error;
    return savedViewToUi(data);
  }

  async function deleteSavedView(id) {
    if (isLocalMode() || isGcpMode()) {
      savedViewCache = localSavedViews().filter((view) => view.id !== id);
      return true;
    }
    if (usesApiGateway()) {
      await apiRequest(`/api/saved-views/${encodeURIComponent(id)}`, { method: "DELETE" });
      return true;
    }
    const { error } = await getClient().from("saved_views").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function getUserSettings() {
    if (isGcpMode()) return localUserSettings();
    if (isLocalMode()) return localUserSettings();
    if (usesApiGateway()) return apiGet("/api/user-settings");
    const userId = await getCurrentUserId();
    const { data, error } = await getClient().from("user_settings").select(USER_SETTINGS_FIELDS.join(",")).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return userSettingsToUi(data);
  }

  async function upsertUserSettings(settings = {}) {
    if (isLocalMode() || isGcpMode()) {
      const profile = isGcpMode() ? await getCurrentProfile() : localProfile();
      userSettingsCache = {
        ...localUserSettings(),
        ...settings,
        userId: profile?.id || "gcp-pilot",
        updatedAt: new Date().toISOString()
      };
      return clone(userSettingsCache);
    }
    if (usesApiGateway()) {
      return apiRequest("/api/user-settings", {
        method: "PUT",
        body: settings
      });
    }
    const userId = await getCurrentUserId();
    const payload = {
      user_id: userId,
      default_view_id: settings.defaultViewId || settings.default_view_id || null,
      default_view_type: settings.defaultViewType || settings.default_view_type || "contacts",
      table_density: settings.tableDensity || settings.table_density || "comfortable",
      theme: settings.theme || "system",
      font_scale: Number(settings.fontScale || settings.font_scale || 1),
      page_size: Number(settings.pageSize || settings.page_size || 20),
      preferences: settings.preferences || {}
    };
    const { data, error } = await getClient()
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select(USER_SETTINGS_FIELDS.join(","))
      .single();
    if (error) throw error;
    return userSettingsToUi(data);
  }

  async function getCurrentUserId() {
    if (isLocalMode()) return localProfile().id;
    if (isGcpMode()) {
      const profile = await getCurrentProfile();
      if (!profile?.id) throw new Error("Im GCP-Pilot ist kein Profil aktiv.");
      return profile.id;
    }
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    if (!data.user?.id) throw new Error("Bitte zuerst mit Supabase anmelden.");
    return data.user.id;
  }

  async function createContact(contact, options = {}) {
    if (isLocalMode()) {
      requireLocalWrite("Kontakt speichern");
      const created = {
        ...contact,
        id: contact.id || `local-contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        status: contact.status || "active",
        priority: normalizePriority(contact.priority),
        createdAt: contact.createdAt || new Date().toISOString(),
        updatedAt: contact.updatedAt || new Date().toISOString()
      };
      contactCache = [created, ...contactCache.filter((item) => item.id !== created.id)];
      return created;
    }
    if (usesApiGateway()) {
      const created = apiContactPayload(await apiRequest("/api/contacts", {
        method: "POST",
        body: { contact, options }
      }));
      contactCache = [created, ...contactCache.filter((item) => item.id !== created.id)];
      return created;
    }
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const payload = { ...uiToDb(contact), created_by: userId, updated_by: userId };
    if (!supportsContactOrganizationId) delete payload.organization_id;
    if (!supportsContactImageSources) {
      delete payload.image_source_url;
      delete payload.image_source_label;
      delete payload.image_rights_note;
      delete payload.image_updated_at;
      delete payload.image_updated_by;
    }
    if (!supportsContactRole) delete payload.role;
    let { data, error } = await supabase.from("contacts").insert(payload).select(contactSelectFields()).single();
    if (error && supportsContactRole && isMissingContactRoleError(error)) {
      supportsContactRole = false;
      delete payload.role;
      ({ data, error } = await supabase.from("contacts").insert(payload).select(contactSelectFields()).single());
    }
    if (error) throw error;
    const { error: logError } = await supabase.from("changes").insert({
      contact_id: data.id,
      action: options.action === "import" ? "import" : "create",
      field_name: null,
      old_value: "",
      new_value: options.batchId ? `${data.name || data.id} · Batch ${options.batchId}` : data.name || data.id,
      changed_by: userId
    });
    if (logError) throw logError;
    const created = dbToUi(data);
    contactCache = [created, ...contactCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function updateContact(id, patch) {
    if (isLocalMode()) {
      requireLocalWrite("Kontakt speichern");
      if (!contactCache.length) contactCache = localContacts({ includeArchived: true });
      const existing = contactCache.find((contact) => contact.id === id);
      if (!existing) throw new Error("Kontakt wurde im Demo-Datensatz nicht gefunden.");
      const updated = {
        ...existing,
        ...patch,
        id,
        priority: normalizePriority(patch.priority || existing.priority),
        updatedAt: new Date().toISOString()
      };
      contactCache = contactCache.map((contact) => (contact.id === id ? updated : contact));
      return clone(updated);
    }
    if (usesApiGateway()) {
      const updated = apiContactPayload(await apiRequest(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      }));
      contactCache = contactCache.map((contact) => (contact.id === id ? updated : contact));
      return updated;
    }
    const supabase = getClient();
    const userId = await getCurrentUserId();
    let { data: oldRow, error: oldError } = await supabase.from("contacts").select(contactSelectFields()).eq("id", id).single();
    if (oldError && supportsContactRole && isMissingContactRoleError(oldError)) {
      supportsContactRole = false;
      ({ data: oldRow, error: oldError } = await supabase.from("contacts").select(contactSelectFields()).eq("id", id).single());
    }
    if (oldError) throw oldError;
    const merged = { ...dbToUi(oldRow), ...patch, id };
    if (Object.prototype.hasOwnProperty.call(patch, "ownerId")) {
      merged.ownerId = resolveOwnerId(patch.ownerId);
    } else if (Object.prototype.hasOwnProperty.call(patch, "owner")) {
      merged.ownerId = resolveOwnerId(patch.owner);
    }
    const dbPatch = uiToDb(merged);
    delete dbPatch.id;
    if (!supportsContactOrganizationId) delete dbPatch.organization_id;
    if (!supportsContactRole) delete dbPatch.role;
    if (!["image", "image_url"].some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
      delete dbPatch.image_url;
    }
    if (!["imageSourceUrl", "image_source_url", "imageSourceLabel", "image_source_label", "imageRightsNote", "image_rights_note"].some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
      delete dbPatch.image_source_url;
      delete dbPatch.image_source_label;
      delete dbPatch.image_rights_note;
      delete dbPatch.image_updated_at;
      delete dbPatch.image_updated_by;
    }
    if (!supportsContactImageSources) {
      delete dbPatch.image_source_url;
      delete dbPatch.image_source_label;
      delete dbPatch.image_rights_note;
      delete dbPatch.image_updated_at;
      delete dbPatch.image_updated_by;
    }
    dbPatch.updated_by = userId;
    dbPatch.updated_at = new Date().toISOString();
    let changedFields = Object.keys(dbPatch).filter((field) => stringifyValue(oldRow[field]) !== stringifyValue(dbPatch[field]));
    let { data, error } = await supabase.from("contacts").update(dbPatch).eq("id", id).select(contactSelectFields()).single();
    if (error && supportsContactRole && isMissingContactRoleError(error)) {
      supportsContactRole = false;
      delete dbPatch.role;
      changedFields = changedFields.filter((field) => field !== "role");
      ({ data, error } = await supabase.from("contacts").update(dbPatch).eq("id", id).select(contactSelectFields()).single());
    }
    if (error) throw error;
    if (changedFields.length) {
      const action = dbPatch.status === "archived" ? "archive" : "update";
      const rows = changedFields.map((field) => ({
        contact_id: id,
        action,
        field_name: field,
        old_value: stringifyValue(oldRow[field]),
        new_value: stringifyValue(dbPatch[field]),
        changed_by: userId
      }));
      const { error: logError } = await supabase.from("changes").insert(rows);
      if (logError) throw logError;
    }
    const updated = dbToUi(data);
    contactCache = contactCache.map((contact) => (contact.id === id ? updated : contact));
    return updated;
  }

  async function archiveContact(id) {
    if (isLocalMode()) requireLocalAdmin("Kontakt archivieren");
    return updateContact(id, { status: "archived" }).then((archived) => {
      contactCache = contactCache.filter((contact) => contact.id !== id);
      return archived;
    });
  }

  async function restoreContact(id) {
    if (isLocalMode()) requireLocalAdmin("Kontakt wiederherstellen");
    return updateContact(id, { status: "active" }).then((restored) => {
      contactCache = [restored, ...contactCache.filter((contact) => contact.id !== id)];
      return restored;
    });
  }

  async function loadFormats(options = {}) {
    if (isGcpMode()) {
      formatCache = localFormats(options);
      return formatCache;
    }
    if (isLocalMode() || !supportsFormats) {
      formatCache = localFormats(options);
      return formatCache;
    }
    if (usesApiGateway()) {
      const payload = await apiGet("/api/formats", {
        includeArchived: options.includeArchived ? "true" : ""
      });
      formatCache = Array.isArray(payload.items) ? payload.items : [];
      return formatCache;
    }
    await loadProfiles();
    const { data: rows, error } = await getClient()
      .from("formats")
      .select(FORMAT_FIELDS.join(","))
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true });
    if (error) {
      if (isMissingFormatsError(error)) throw formatSetupError(error);
      throw error;
    }
    const ids = (rows || []).map((row) => row.id);
    let participants = [];
    if (ids.length) {
      const { data: participantRows, error: participantError } = await getClient()
        .from("format_participants")
        .select(FORMAT_PARTICIPANT_FIELDS.join(","))
        .in("format_id", ids)
        .order("updated_at", { ascending: false, nullsFirst: false });
      if (participantError) {
        if (isMissingFormatsError(participantError)) throw formatSetupError(participantError);
        throw participantError;
      }
      participants = participantRows || [];
    }
    const participantsByFormat = participants.reduce((map, participant) => {
      const list = map.get(participant.format_id) || [];
      list.push(participant);
      map.set(participant.format_id, list);
      return map;
    }, new Map());
    formatCache = (rows || [])
      .map((row) => formatDbToUi(row, participantsByFormat.get(row.id) || []))
      .filter((format) => options.includeArchived || format.status !== "Archiviert");
    return formatCache;
  }

  async function createFormat(format) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalWrite("Formate anlegen");
      const now = new Date().toISOString();
      const profile = isGcpMode() ? await getCurrentProfile() : localProfile();
      const created = formatDbToUi({
        ...format,
        id: format.id || `local-format-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: format.ownerId || profile?.id || "gcp-pilot",
        createdAt: now,
        updatedAt: now
      }, []);
      formatCache = [created, ...formatCache.filter((item) => item.id !== created.id)];
      persistLocalFormats(formatCache);
      return created;
    }
    if (usesApiGateway()) {
      const created = await apiRequest("/api/formats", {
        method: "POST",
        body: format
      });
      formatCache = [created, ...formatCache.filter((item) => item.id !== created.id)];
      return created;
    }
    const userId = await getCurrentUserId();
    const payload = { ...formatUiToDb(format), created_by: userId, updated_by: userId };
    if (!payload.title) throw new Error("Titel des Formats fehlt.");
    const { data, error } = await getClient().from("formats").insert(payload).select(FORMAT_FIELDS.join(",")).single();
    if (error) throw error;
    const created = formatDbToUi(data, []);
    formatCache = [created, ...formatCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function updateFormat(id, patch) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalWrite("Formate bearbeiten");
      const now = new Date().toISOString();
      formatCache = formatCache.map((format) => format.id === id ? formatDbToUi({ ...format, ...patch, updatedAt: now }, format.participants || []) : format);
      persistLocalFormats(formatCache);
      return formatCache.find((format) => format.id === id);
    }
    if (usesApiGateway()) {
      const updated = await apiRequest(`/api/formats/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      formatCache = formatCache.map((format) => format.id === id ? updated : format);
      return updated;
    }
    const userId = await getCurrentUserId();
    const payload = { ...formatUiToDb(patch), updated_by: userId, updated_at: new Date().toISOString() };
    if (!Object.prototype.hasOwnProperty.call(patch, "title")) delete payload.title;
    if (!Object.prototype.hasOwnProperty.call(patch, "formatType") && !Object.prototype.hasOwnProperty.call(patch, "format_type")) delete payload.format_type;
    if (!Object.prototype.hasOwnProperty.call(patch, "startsAt") && !Object.prototype.hasOwnProperty.call(patch, "starts_at")) delete payload.starts_at;
    if (!Object.prototype.hasOwnProperty.call(patch, "endsAt") && !Object.prototype.hasOwnProperty.call(patch, "ends_at")) delete payload.ends_at;
    if (!Object.prototype.hasOwnProperty.call(patch, "location")) delete payload.location;
    if (!Object.prototype.hasOwnProperty.call(patch, "goal")) delete payload.goal;
    if (!Object.prototype.hasOwnProperty.call(patch, "ownerId") && !Object.prototype.hasOwnProperty.call(patch, "owner_id") && !Object.prototype.hasOwnProperty.call(patch, "owner")) delete payload.owner_id;
    if (!Object.prototype.hasOwnProperty.call(patch, "status")) delete payload.status;
    if (!Object.prototype.hasOwnProperty.call(patch, "notes")) delete payload.notes;
    const { data, error } = await getClient().from("formats").update(payload).eq("id", id).select(FORMAT_FIELDS.join(",")).single();
    if (error) throw error;
    const existing = formatCache.find((format) => format.id === id);
    const updated = formatDbToUi(data, existing?.participants || []);
    formatCache = formatCache.map((format) => format.id === id ? updated : format);
    return updated;
  }

  async function archiveFormat(id) {
    return updateFormat(id, { status: "Archiviert" });
  }

  async function deleteFormat(id) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalAdmin("Formate löschen");
      formatCache = formatCache.filter((format) => format.id !== id);
      persistLocalFormats(formatCache);
      return true;
    }
    if (usesApiGateway()) {
      await apiRequest(`/api/formats/${encodeURIComponent(id)}`, { method: "DELETE" });
      formatCache = formatCache.filter((format) => format.id !== id);
      return true;
    }
    const { error } = await getClient().from("formats").delete().eq("id", id);
    if (error) throw error;
    formatCache = formatCache.filter((format) => format.id !== id);
    return true;
  }

  async function addFormatParticipant(formatId, contactId, patch = {}) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalWrite("Teilnehmer pflegen");
      const now = new Date().toISOString();
      formatCache = formatCache.map((format) => {
        if (format.id !== formatId) return format;
        const existing = format.participants || [];
        if (existing.some((participant) => participant.contactId === contactId)) return format;
        return {
          ...format,
          participants: [
            participantDbToUi({
              id: `local-participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              formatId,
              contactId,
              invitationStatus: patch.invitationStatus || "Kandidat",
              participantRole: patch.participantRole || "",
              notes: patch.notes || "",
              createdAt: now,
              updatedAt: now
            }),
            ...existing
          ],
          updatedAt: now
        };
      });
      persistLocalFormats(formatCache);
      return formatCache.find((format) => format.id === formatId);
    }
    if (usesApiGateway()) {
      const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants`, {
        method: "POST",
        body: { ...patch, contactId }
      });
      formatCache = formatCache.map((format) => format.id === formatId ? updated : format);
      return updated;
    }
    const userId = await getCurrentUserId();
    const payload = { ...participantUiToDb(patch, formatId, contactId), created_by: userId, updated_by: userId };
    const { error } = await getClient()
      .from("format_participants")
      .upsert(payload, { onConflict: "format_id,contact_id", ignoreDuplicates: true });
    if (error) throw error;
    await updateFormat(formatId, {});
    await loadFormats({ includeArchived: true });
    return formatCache.find((format) => format.id === formatId);
  }

  async function updateFormatParticipant(formatId, contactId, patch = {}) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalWrite("Teilnehmer pflegen");
      const now = new Date().toISOString();
      formatCache = formatCache.map((format) => {
        if (format.id !== formatId) return format;
        return {
          ...format,
          participants: (format.participants || []).map((participant) =>
            participant.contactId === contactId ? participantDbToUi({ ...participant, ...patch, updatedAt: now }) : participant
          ),
          updatedAt: now
        };
      });
      persistLocalFormats(formatCache);
      return formatCache.find((format) => format.id === formatId);
    }
    if (usesApiGateway()) {
      const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        body: patch
      });
      formatCache = formatCache.map((format) => format.id === formatId ? updated : format);
      return updated;
    }
    const userId = await getCurrentUserId();
    const payload = participantUiToDb(patch, formatId, contactId);
    delete payload.format_id;
    delete payload.contact_id;
    payload.updated_by = userId;
    payload.updated_at = new Date().toISOString();
    const { error } = await getClient().from("format_participants").update(payload).eq("format_id", formatId).eq("contact_id", contactId);
    if (error) throw error;
    await updateFormat(formatId, {});
    await loadFormats({ includeArchived: true });
    return formatCache.find((format) => format.id === formatId);
  }

  async function removeFormatParticipant(formatId, contactId) {
    if (isLocalMode() || isGcpMode() || !supportsFormats) {
      requireLocalWrite("Teilnehmer entfernen");
      formatCache = formatCache.map((format) =>
        format.id === formatId ? { ...format, participants: (format.participants || []).filter((participant) => participant.contactId !== contactId) } : format
      );
      persistLocalFormats(formatCache);
      return formatCache.find((format) => format.id === formatId);
    }
    if (usesApiGateway()) {
      const updated = await apiRequest(`/api/formats/${encodeURIComponent(formatId)}/participants/${encodeURIComponent(contactId)}`, {
        method: "DELETE"
      });
      formatCache = formatCache.map((format) => format.id === formatId ? updated : format);
      return updated;
    }
    const { error } = await getClient().from("format_participants").delete().eq("format_id", formatId).eq("contact_id", contactId);
    if (error) throw error;
    await updateFormat(formatId, {});
    await loadFormats({ includeArchived: true });
    return formatCache.find((format) => format.id === formatId);
  }

  async function getDashboardStats(filters = {}) {
    const items = await getContacts(filters);
    return {
      total: items.length,
      bySector: countBy(items, "category"),
      byState: countBy(items, "state"),
      byPriority: countBy(items, "priority")
    };
  }

  async function getMapData(filters = {}) {
    const items = await getContacts(filters);
    return items.filter((contact) => Number.isFinite(contact.lat) && Number.isFinite(contact.lon));
  }

  function countBy(items, key) {
    return items.reduce((counts, item) => {
      const value = item[key] || "Unbekannt";
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  window.dataService = {
    isConfigured,
    getClient,
    loadContacts,
    getContacts,
    getContact,
    getProfiles,
    getCurrentProfile,
    updateCurrentProfile,
    uploadCurrentProfileImage,
    removeCurrentProfileImage,
    getContactChanges,
    loadBackendRegistrations,
    updateBackendRegistration,
    resetLocalBackendRegistrations,
    loadOrganizations,
    getOrganization,
    loadExpertGroups,
    loadExpertContacts,
    loadExpertOrganizations,
    loadExpertEntityLinks,
    createExpertContact,
    createExpertOrganization,
    createExpertEntityLink,
    deleteExpertEntityLink,
    createOrganization,
    updateOrganization,
    linkContactToOrganization,
    getSavedViews,
    createSavedView,
    updateSavedView,
    deleteSavedView,
    getUserSettings,
    upsertUserSettings,
    createContact,
    updateContact,
    archiveContact,
    restoreContact,
    loadFormats,
    createFormat,
    updateFormat,
    archiveFormat,
    deleteFormat,
    addFormatParticipant,
    updateFormatParticipant,
    removeFormatParticipant,
    getDashboardStats,
    getMapData
  };
})();
