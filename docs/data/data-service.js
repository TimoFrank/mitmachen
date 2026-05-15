(function () {
  const DB_FIELDS = [
    "id",
    "name",
    "organization",
    "sector",
    "specialty",
    "priority",
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
    "status",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by"
  ];
  const WRITE_FIELDS = DB_FIELDS.filter((field) => !["created_at", "created_by", "updated_at", "updated_by"].includes(field));
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
  const CONFIG = window.VERSORGUNGS_COMPASS_CONFIG || {};
  let client = null;
  let profileCache = new Map();
  let contactCache = [];

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

  function profileSummary(id) {
    const profile = profileCache.get(id);
    return {
      id: id || "",
      displayName: profile?.display_name || profile?.email || "Unbekannter Nutzer",
      initials: profile?.initials || String(profile?.display_name || profile?.email || "UN").slice(0, 2).toUpperCase(),
      role: profile?.role || "",
      roleLabel: roleLabel(profile?.role)
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
      name: row.name || "",
      organization: row.organization || "",
      category: row.sector || "Praxis",
      specialty: row.specialty || "",
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
      name: String(contact.name || "").trim(),
      organization: String(contact.organization || "").trim() || null,
      sector: String(contact.category || contact.sector || "").trim() || "Praxis",
      specialty: String(contact.specialty || "").trim() || null,
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

  async function loadProfiles() {
    const supabase = getClient();
    const { data, error } = await supabase.from("profiles").select("id,email,display_name,initials,role,active").eq("active", true);
    if (error) throw error;
    profileCache = new Map((data || []).map((profile) => [profile.id, profile]));
    return [...profileCache.values()];
  }

  async function getProfiles() {
    if (!profileCache.size) return loadProfiles();
    return [...profileCache.values()];
  }

  async function getCurrentProfile() {
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) return null;
    if (!profileCache.size) await loadProfiles();
    return profileCache.get(userId) || null;
  }

  async function loadContacts(options = {}) {
    const supabase = getClient();
    await loadProfiles();
    let query = supabase
      .from("contacts")
      .select(DB_FIELDS.join(","))
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    if (!options.includeArchived) query = query.neq("status", "archived");
    if (options.status) query = query.eq("status", options.status);
    const { data, error } = await query;
    if (error) throw error;
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
    const supabase = getClient();
    const { data, error } = await supabase.from("contacts").select(DB_FIELDS.join(",")).eq("id", id).single();
    if (error) throw error;
    return dbToUi(data);
  }

  async function getContactChanges(contactId, options = {}) {
    const supabase = getClient();
    if (!profileCache.size) await loadProfiles();
    let query = supabase
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

  async function getSavedViews() {
    const supabase = getClient();
    if (!profileCache.size) await loadProfiles();
    const { data, error } = await supabase
      .from("saved_views")
      .select(SAVED_VIEW_FIELDS.join(","))
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(savedViewToUi);
  }

  async function createSavedView(view) {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const payload = uiToSavedView(view, userId);
    if (!payload.name) throw new Error("Name fuer gespeicherte Suche fehlt.");
    const { data, error } = await supabase.from("saved_views").insert(payload).select(SAVED_VIEW_FIELDS.join(",")).single();
    if (error) throw error;
    return savedViewToUi(data);
  }

  async function updateSavedView(id, patch) {
    const supabase = getClient();
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
    const { data, error } = await supabase.from("saved_views").update(payload).eq("id", id).select(SAVED_VIEW_FIELDS.join(",")).single();
    if (error) throw error;
    return savedViewToUi(data);
  }

  async function deleteSavedView(id) {
    const { error } = await getClient().from("saved_views").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function getUserSettings() {
    const userId = await getCurrentUserId();
    const { data, error } = await getClient().from("user_settings").select(USER_SETTINGS_FIELDS.join(",")).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return userSettingsToUi(data);
  }

  async function upsertUserSettings(settings = {}) {
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
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    if (!data.user?.id) throw new Error("Bitte zuerst mit Supabase anmelden.");
    return data.user.id;
  }

  async function createContact(contact) {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const payload = { ...uiToDb(contact), created_by: userId, updated_by: userId };
    const { data, error } = await supabase.from("contacts").insert(payload).select(DB_FIELDS.join(",")).single();
    if (error) throw error;
    const { error: logError } = await supabase.from("changes").insert({
      contact_id: data.id,
      action: "create",
      field_name: null,
      old_value: "",
      new_value: data.name || data.id,
      changed_by: userId
    });
    if (logError) throw logError;
    const created = dbToUi(data);
    contactCache = [created, ...contactCache.filter((item) => item.id !== created.id)];
    return created;
  }

  async function updateContact(id, patch) {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: oldRow, error: oldError } = await supabase.from("contacts").select(DB_FIELDS.join(",")).eq("id", id).single();
    if (oldError) throw oldError;
    const merged = { ...dbToUi(oldRow), ...patch, id };
    if (Object.prototype.hasOwnProperty.call(patch, "ownerId")) {
      merged.ownerId = resolveOwnerId(patch.ownerId);
    } else if (Object.prototype.hasOwnProperty.call(patch, "owner")) {
      merged.ownerId = resolveOwnerId(patch.owner);
    }
    const dbPatch = uiToDb(merged);
    delete dbPatch.id;
    dbPatch.updated_by = userId;
    dbPatch.updated_at = new Date().toISOString();
    const changedFields = Object.keys(dbPatch).filter((field) => stringifyValue(oldRow[field]) !== stringifyValue(dbPatch[field]));
    const { data, error } = await supabase.from("contacts").update(dbPatch).eq("id", id).select(DB_FIELDS.join(",")).single();
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
    return updateContact(id, { status: "archived" }).then((archived) => {
      contactCache = contactCache.filter((contact) => contact.id !== id);
      return archived;
    });
  }

  async function restoreContact(id) {
    return updateContact(id, { status: "active" }).then((restored) => {
      contactCache = [restored, ...contactCache.filter((contact) => contact.id !== id)];
      return restored;
    });
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
    getContactChanges,
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
    getDashboardStats,
    getMapData
  };
})();
