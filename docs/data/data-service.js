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
  const PROFILE_IMAGE_BUCKET = "profile-images";
  const LOCAL_FORMATS_KEY = "versorgungs-kompass-formats-v1";
  const LOCAL_REGISTRATIONS_KEY = "versorgungs-kompass-backend-registrations-v1";
  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  let client = null;
  let profileCache = new Map();
  let contactCache = [];
  let organizationCache = [];
  let expertGroupCache = [];
  let expertContactCache = [];
  let expertOrganizationCache = [];
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
    return Boolean(
      CONFIG.dataMode === "supabase" &&
        CONFIG.supabaseUrl &&
        CONFIG.supabaseAnonKey &&
        !CONFIG.supabaseUrl.includes("YOUR-PROJECT") &&
        !CONFIG.supabaseAnonKey.includes("YOUR-SUPABASE")
    );
  }

  function getClient() {
    if (client) return client;
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
    return Boolean(apiBaseUrl()) || requiresApiGateway();
  }

  function apiGatewayRequiredError() {
    return new Error("Die API-Schicht ist fuer diesen Datenpfad erforderlich. Bitte apiBaseUrl setzen oder requireApiGateway aktivieren.");
  }

  async function apiRequest(path, { method = "GET", params = {}, body } = {}) {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("Bitte zuerst anmelden.");
    const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(url.href, {
      method,
      headers: {
        ...headers
      },
      credentials: CONFIG.apiCredentials || "same-origin",
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API-Anfrage fehlgeschlagen (${response.status}).`);
    return payload;
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

  function localExpertContacts(options = {}) {
    const rows = Array.isArray(window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS) ? window.VERSORGUNGS_COMPASS_EXPERT_CONTACTS : [];
    return rows
      .filter((contact) => options.includeArchived || contact.status !== "archived")
      .map((contact, index) => ({ ...clone(contact), _index: index }));
  }

  function localExpertOrganizations(options = {}) {
    const rows = Array.isArray(window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS) ? window.VERSORGUNGS_COMPASS_EXPERT_ORGANIZATIONS : [];
    return rows
      .filter((organization) => options.includeArchived || organization.status !== "archived")
      .map((organization) => clone(organization));
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
    throw apiGatewayRequiredError();
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
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) return null;
    if (usesApiGateway()) {
      const profile = await apiGet("/api/profile");
      if (profile?.id) profileCache.set(profile.id, profile);
      return profile;
    }
    throw apiGatewayRequiredError();
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
    if (usesApiGateway()) {
      const updated = await apiRequest("/api/profile", {
        method: "PATCH",
        body: profile
      });
      if (updated?.id) profileCache.set(updated.id, updated);
      return updated;
    }
    throw apiGatewayRequiredError();
  }

  async function uploadCurrentProfileImage(file) {
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
    throw apiGatewayRequiredError();
  }

  async function removeCurrentProfileImage() {
    if (isLocalMode()) return updateCurrentProfile({ ...(localProfile() || {}), avatar_url: null, avatarUrl: null });
    if (usesApiGateway()) {
      const updated = await apiRequest("/api/profile/avatar", { method: "DELETE" });
      if (updated?.id) profileCache.set(updated.id, updated);
      return updated;
    }
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
  }

  async function loadExpertGroups(options = {}) {
    if (isLocalMode()) {
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
    throw apiGatewayRequiredError();
  }

  async function loadExpertContacts(options = {}) {
    if (isLocalMode()) {
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
    throw apiGatewayRequiredError();
  }

  async function loadExpertOrganizations(options = {}) {
    if (isLocalMode()) {
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
    throw apiGatewayRequiredError();
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
      const created = await apiRequest("/api/organizations", {
        method: "POST",
        body: organization
      });
      organizationCache = [created, ...organizationCache.filter((item) => item.id !== created.id)];
      return created;
    }
    throw apiGatewayRequiredError();
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
      const updated = await apiRequest(`/api/organizations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      organizationCache = organizationCache.map((item) => (item.id === id ? updated : item));
      return updated;
    }
    throw apiGatewayRequiredError();
  }

  async function linkContactToOrganization(contactId, organization) {
    const organizationId = typeof organization === "string" ? organization : organization?.id;
    const organizationName = typeof organization === "string" ? "" : organization?.name;
    return updateContact(contactId, { organizationId, organization: organizationName || undefined });
  }

  async function getSavedViews() {
    if (isLocalMode()) return localSavedViews();
    if (usesApiGateway()) {
      const payload = await apiGet("/api/saved-views");
      return Array.isArray(payload.items) ? payload.items : [];
    }
    throw apiGatewayRequiredError();
  }

  async function createSavedView(view) {
    if (isLocalMode()) {
      const created = {
        ...view,
        id: view.id || `demo-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: localProfile().id,
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
    throw apiGatewayRequiredError();
  }

  async function updateSavedView(id, patch) {
    if (isLocalMode()) {
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
    throw apiGatewayRequiredError();
  }

  async function deleteSavedView(id) {
    if (isLocalMode()) {
      savedViewCache = localSavedViews().filter((view) => view.id !== id);
      return true;
    }
    if (usesApiGateway()) {
      await apiRequest(`/api/saved-views/${encodeURIComponent(id)}`, { method: "DELETE" });
      return true;
    }
    throw apiGatewayRequiredError();
  }

  async function getUserSettings() {
    if (isLocalMode()) return localUserSettings();
    if (usesApiGateway()) return apiGet("/api/user-settings");
    throw apiGatewayRequiredError();
  }

  async function upsertUserSettings(settings = {}) {
    if (isLocalMode()) {
      userSettingsCache = {
        ...localUserSettings(),
        ...settings,
        userId: localProfile().id,
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
    throw apiGatewayRequiredError();
  }

  async function getCurrentUserId() {
    if (isLocalMode()) return localProfile().id;
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
      const created = await apiRequest("/api/contacts", {
        method: "POST",
        body: { contact, options }
      });
      contactCache = [created, ...contactCache.filter((item) => item.id !== created.id)];
      return created;
    }
    throw apiGatewayRequiredError();
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
      const updated = await apiRequest(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      contactCache = contactCache.map((contact) => (contact.id === id ? updated : contact));
      return updated;
    }
    throw apiGatewayRequiredError();
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
    throw apiGatewayRequiredError();
  }

  async function createFormat(format) {
    if (isLocalMode() || !supportsFormats) {
      requireLocalWrite("Formate anlegen");
      const now = new Date().toISOString();
      const created = formatDbToUi({
        ...format,
        id: format.id || `local-format-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: format.ownerId || localProfile().id,
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
    throw apiGatewayRequiredError();
  }

  async function updateFormat(id, patch) {
    if (isLocalMode() || !supportsFormats) {
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
    throw apiGatewayRequiredError();
  }

  async function archiveFormat(id) {
    return updateFormat(id, { status: "Archiviert" });
  }

  async function deleteFormat(id) {
    if (isLocalMode() || !supportsFormats) {
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
    throw apiGatewayRequiredError();
  }

  async function addFormatParticipant(formatId, contactId, patch = {}) {
    if (isLocalMode() || !supportsFormats) {
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
    throw apiGatewayRequiredError();
  }

  async function updateFormatParticipant(formatId, contactId, patch = {}) {
    if (isLocalMode() || !supportsFormats) {
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
    throw apiGatewayRequiredError();
  }

  async function removeFormatParticipant(formatId, contactId) {
    if (isLocalMode() || !supportsFormats) {
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
    throw apiGatewayRequiredError();
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
