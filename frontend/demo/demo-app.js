(function () {
  const CONTACTS_KEY = "versorgungs-kompass-demo-mode-contacts-v1";
  const CHANGES_KEY = "versorgungs-kompass-demo-mode-changes-v1";
  const SELECTED_KEY = "versorgungs-kompass-demo-mode-selected-contact-v1";
  const CONTACT_COLUMNS_KEY = "versorgungs-kompass-demo-mode-contact-columns-v1";
  const ACTOR = "Demo-Testzugang";
  const data = window.VERSORGUNGS_COMPASS_DEMO_DATA || {};
  const careViewModes = new Set(["contacts", "organizations", "map"]);
  const defaultContactColumnKeys = ["name", "organization", "category", "owner", "updated"];
  const contactTableColumns = [
    { key: "name", label: "Name", template: "minmax(210px, 1.25fr)", required: true },
    { key: "organization", label: "Organisation", template: "minmax(170px, 1fr)" },
    { key: "category", label: "Sektor", template: "minmax(112px, 0.68fr)" },
    { key: "specialty", label: "Fachrichtung", template: "minmax(150px, 0.82fr)" },
    { key: "location", label: "Ort", template: "minmax(130px, 0.72fr)" },
    { key: "state", label: "Bundesland", template: "minmax(142px, 0.72fr)" },
    { key: "owner", label: "Owner", template: "minmax(128px, 0.72fr)" },
    { key: "priority", label: "Priorität", template: "minmax(106px, 0.56fr)" },
    { key: "updated", label: "Aktualisiert", template: "minmax(122px, 0.58fr)" }
  ];

  const state = {
    view: "map",
    profiles: [],
    session: null,
    organizations: [],
    contacts: [],
    changes: [],
    selectedId: "",
    selectedOrganizationId: "",
    filters: {
      query: "",
      sector: "",
      state: "",
      specialty: "",
      ownerId: ""
    },
    visibleContactColumns: loadVisibleContactColumns(),
    filterPanelOpen: false,
    columnMenuOpen: false,
    editMode: false
  };

  const fieldLabels = {
    name: "Name",
    organization: "Organisation",
    contactRole: "Rolle",
    specialty: "Fachrichtung",
    email: "E-Mail",
    phone: "Telefon",
    priority: "Priorität",
    ownerId: "Owner",
    note: "Notiz",
    nextStep: "Nächster Schritt"
  };

  const editFields = Object.keys(fieldLabels);

  const elements = {
    title: document.getElementById("view-title"),
    subtitle: document.getElementById("view-subtitle"),
    status: document.getElementById("status-line"),
    main: document.getElementById("main-view"),
    detail: document.getElementById("detail-panel"),
    reset: document.getElementById("reset-demo"),
    workspace: document.querySelector(".workspace"),
    shell: document.querySelector(".app-shell"),
    careModeActions: document.getElementById("care-mode-actions"),
    careModeButtons: document.querySelectorAll("[data-care-mode]"),
    sidebarCollapse: document.getElementById("sidebar-collapse-button")
  };

  function profileItems() {
    return state.profiles.length ? state.profiles : data.profiles || [];
  }

  function organizationItems() {
    return state.organizations.length ? state.organizations : data.organizations || [];
  }

  function isCareView(view = state.view) {
    return careViewModes.has(view);
  }

  function careCounts() {
    const activeContacts = state.contacts.filter((contact) => contact.status !== "archived").length;
    const activeOrganizations = organizationItems().filter((organization) => organization.status !== "archived").length;
    return {
      contacts: activeContacts,
      organizations: activeOrganizations,
      map: activeContacts
    };
  }

  function updateCareModeTabs() {
    if (!elements.careModeActions) return;
    const visible = isCareView();
    elements.careModeActions.hidden = !visible;
    const counts = careCounts();
    elements.careModeButtons.forEach((button) => {
      const mode = button.dataset.careMode || "contacts";
      const active = state.view === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("tabindex", active ? "0" : "-1");
      const count = button.querySelector(".experts-mode-count");
      if (count) count.textContent = String(counts[mode] ?? 0);
    });
  }

  function loadVisibleContactColumns() {
    try {
      const allowed = new Set(contactTableColumns.map((column) => column.key));
      const saved = JSON.parse(window.localStorage.getItem(CONTACT_COLUMNS_KEY) || "null");
      const normalized = Array.isArray(saved) ? saved.filter((key) => allowed.has(key)) : [];
      if (normalized.length) {
        return contactTableColumns
          .filter((column) => column.required || normalized.includes(column.key))
          .map((column) => column.key);
      }
    } catch (error) {
      console.warn("Spalteneinstellungen konnten nicht geladen werden.", error);
    }
    return [...defaultContactColumnKeys];
  }

  function persistVisibleContactColumns() {
    window.localStorage.setItem(CONTACT_COLUMNS_KEY, JSON.stringify(state.visibleContactColumns));
  }

  function readStored(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function profileLabel(ownerId) {
    const profile = profileItems().find((item) => item.id === ownerId);
    return profile?.display_name || profile?.email || "Nicht zugeordnet";
  }

  function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "editor") return "Editor";
    if (role === "viewer") return "Viewer";
    return "Unbekannt";
  }

  function roleDescription(role) {
    if (role === "admin") return "Lokale Demo-Datenpflege und Zurücksetzen der Demo";
    if (role === "editor") return "Kontakte und Organisationen pflegen";
    if (role === "viewer") return "Lesen, suchen, filtern und Karte nutzen";
    return "Nicht hinterlegt";
  }

  function enforcementLabel(value) {
    if (value === "display-only") return "Nur Anzeige";
    return value || "Nur Anzeige";
  }

  function roleMatrixItems() {
    return state.session?.roleMatrix || [
      { role: "admin", label: "Admin", scope: roleDescription("admin"), note: "In der Demo sichtbar, aber nicht als Zugriffsschutz erzwungen." },
      { role: "editor", label: "Editor", scope: roleDescription("editor"), note: "Beispielrolle für die spätere Realanwendung." },
      { role: "viewer", label: "Viewer", scope: roleDescription("viewer"), note: "Beispielrolle für einen späteren Lesezugriff." }
    ];
  }

  function currentDemoProfile() {
    return state.session?.profile || profileItems().find((profile) => profile.active !== false) || profileItems()[0] || null;
  }

  function buildLocalSession() {
    return {
      authMode: "local-demo-profile",
      authModeLabel: "Lokales Demo-Profil",
      identitySource: "Synthetische Demo-Daten",
      enforcement: "display-only",
      enforcementLabel: "Rollen werden angezeigt, aber noch nicht als Zugriffsschutz erzwungen.",
      profile: currentDemoProfile(),
      roleMatrix: roleMatrixItems()
    };
  }

  function profileAvatar(profile, size = "lg") {
    if (!profile) return `<span class="avatar avatar-${size}" aria-hidden="true">?</span>`;
    const image = profile.avatar_url || profile.avatarUrl || "";
    if (image) {
      return `<img class="avatar avatar-${size}" src="${escapeHtml(image)}" alt="${escapeHtml(`Bild von ${profile.display_name || "Profil"}`)}" data-initials="${escapeHtml(profile.initials || initials(profile.display_name))}">`;
    }
    return `<span class="avatar avatar-${size}" aria-hidden="true">${escapeHtml(profile.initials || initials(profile.display_name))}</span>`;
  }

  function priorityClass(priority) {
    if (priority === "Hoch") return "badge badge--high";
    if (priority === "Mittel") return "badge badge--medium";
    return "badge";
  }

  function asDate(value) {
    if (!value) return "Nicht hinterlegt";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Nicht hinterlegt";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function displayValue(field, value) {
    if (field === "ownerId") return profileLabel(value);
    return value || "Nicht hinterlegt";
  }

  function normalizeContact(contact) {
    return {
      ...contact,
      ownerId: contact.ownerId || "",
      priority: contact.priority || "Keine / Unbekannt",
      themes: Array.isArray(contact.themes) ? contact.themes : []
    };
  }

  function seedChanges() {
    const source = Array.isArray(data.changes) ? data.changes : [];
    const mapped = source.map((change, index) => ({
      id: change.id || `demo-change-seed-${index + 1}`,
      contactId: change.contactId || change.contact_id,
      action: change.action || "update",
      fieldName: change.fieldName || change.field_name || "",
      oldValue: change.oldValue || change.old_value || "",
      newValue: change.newValue || change.new_value || "",
      changedAt: change.changedAt || change.changed_at,
      changedBy: profileLabel(change.changedBy || change.changed_by)
    }));

    const extra = (data.contacts || []).slice(8, 14).map((contact, index) => ({
      id: `demo-change-seed-extra-${index + 1}`,
      contactId: contact.id,
      action: "update",
      fieldName: "ownerId",
      oldValue: "",
      newValue: contact.ownerId || "",
      changedAt: contact.updatedAt,
      changedBy: profileLabel(contact.ownerId)
    }));

    return [...mapped, ...extra];
  }

  function loadState() {
    state.profiles = data.profiles || [];
    state.session = buildLocalSession();
    state.organizations = data.organizations || [];
    const storedContacts = readStored(CONTACTS_KEY);
    const storedChanges = readStored(CHANGES_KEY);
    state.contacts = (storedContacts || data.contacts || [])
      .map(normalizeContact)
      .filter((contact) => contact.status !== "archived");
    state.changes = storedChanges || seedChanges();
    state.selectedId = window.localStorage.getItem(SELECTED_KEY) || state.contacts[0]?.id || "";
  }

  function saveState() {
    writeStored(CONTACTS_KEY, state.contacts);
    writeStored(CHANGES_KEY, state.changes);
    if (state.selectedId) window.localStorage.setItem(SELECTED_KEY, state.selectedId);
  }

  function currentContact() {
    return state.contacts.find((contact) => contact.id === state.selectedId) || state.contacts[0] || null;
  }

  function currentOrganization() {
    return state.organizations.find((organization) => organization.id === state.selectedOrganizationId) || state.organizations[0] || null;
  }

  function uniqueValues(field) {
    return [...new Set(state.contacts.map((contact) => contact[field]).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), "de")
    );
  }

  function filteredContacts() {
    const query = state.filters.query.trim().toLowerCase();
    return state.contacts.filter((contact) => {
      if (contact.status === "archived") return false;
      const haystack = [
        contact.name,
        contact.organization,
        contact.contactRole,
        contact.specialty,
        contact.city,
        contact.state,
        contact.email,
        contact.phone,
        ...(contact.themes || [])
      ]
        .join(" ")
        .toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (state.filters.sector && contact.category !== state.filters.sector) return false;
      if (state.filters.state && contact.state !== state.filters.state) return false;
      if (state.filters.specialty && contact.specialty !== state.filters.specialty) return false;
      if (state.filters.ownerId && contact.ownerId !== state.filters.ownerId) return false;
      return true;
    });
  }

  function avatar(contact, size = "sm") {
    const image = contact.image || "";
    const alt = contact.name ? `Bild von ${contact.name}` : "";
    if (image) {
      return `<img class="avatar avatar-${size}" src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" data-initials="${escapeHtml(initials(contact.name))}">`;
    }
    return `<span class="avatar avatar-${size}" aria-hidden="true">${escapeHtml(initials(contact.name))}</span>`;
  }

  function visibleContactTableColumns() {
    const visible = new Set(state.visibleContactColumns);
    return contactTableColumns.filter((column) => column.required || visible.has(column.key));
  }

  function contactGridTemplate(columns = visibleContactTableColumns()) {
    return columns.map((column) => column.template).join(" ");
  }

  function activeFilterItems() {
    const items = [];
    if (state.filters.query.trim()) items.push({ key: "query", label: "Suche", value: state.filters.query.trim() });
    if (state.filters.sector) items.push({ key: "sector", label: "Sektor", value: state.filters.sector });
    if (state.filters.state) items.push({ key: "state", label: "Bundesland", value: state.filters.state });
    if (state.filters.specialty) items.push({ key: "specialty", label: "Fachrichtung", value: state.filters.specialty });
    if (state.filters.ownerId) items.push({ key: "ownerId", label: "Owner", value: profileLabel(state.filters.ownerId) });
    return items;
  }

  function resetContactFilters() {
    state.filters = {
      query: "",
      sector: "",
      state: "",
      specialty: "",
      ownerId: ""
    };
    const visible = filteredContacts();
    state.selectedId = visible[0]?.id || "";
  }

  function formatShortDate(value) {
    if (!value) return "Nicht hinterlegt";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Nicht hinterlegt";
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
  }

  function contactLocation(contact) {
    return [contact.city, contact.state].filter(Boolean).join(", ");
  }

  function columnHeaderMarkup(column) {
    return `<span class="column-head__label">${escapeHtml(column.label)}</span>`;
  }

  function renderColumnMenu() {
    return `
      <div class="column-menu-shell">
        <button class="action-button action-button--compact" type="button" id="columns-toggle" aria-expanded="${state.columnMenuOpen ? "true" : "false"}" aria-controls="columns-menu">
          <span class="action-button__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <rect x="4" y="5" width="4" height="14" rx="1"></rect>
              <rect x="10" y="5" width="4" height="14" rx="1"></rect>
              <rect x="16" y="5" width="4" height="14" rx="1"></rect>
            </svg>
          </span>
          <span>Spalten</span>
        </button>
        <div class="column-menu" id="columns-menu" ${state.columnMenuOpen ? "" : "hidden"}>
          <div class="column-menu__title">Sichtbare Spalten</div>
          <div class="column-menu__options">
            ${contactTableColumns.map((column) => `
              <label class="column-option">
                <input type="checkbox" data-column-key="${escapeHtml(column.key)}" ${state.visibleContactColumns.includes(column.key) || column.required ? "checked" : ""} ${column.required ? "disabled" : ""}>
                <span>${escapeHtml(column.label)}</span>
              </label>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderActiveFilterRow(contacts) {
    const items = activeFilterItems();
    return `
      <div class="active-filter-row">
        <span class="filter-results">${contacts.length} Kontakt${contacts.length === 1 ? "" : "e"}</span>
        <div class="active-filter-list" aria-label="Aktive Filter">
          ${items.length ? items.map((item) => `
            <span class="active-filter-chip">
              ${escapeHtml(`${item.label}: ${item.value}`)}
              <button type="button" data-clear-filter="${escapeHtml(item.key)}" aria-label="${escapeHtml(`${item.label} entfernen`)}">×</button>
            </span>
          `).join("") : '<span class="active-filter-empty">Keine aktiven Filter</span>'}
        </div>
        <button class="button button--ghost filter-reset" type="button" id="filter-reset-all" ${items.length ? "" : "hidden"}>Zurücksetzen</button>
      </div>
    `;
  }

  function renderCareSearchControls() {
    return `
      <div class="controls care-controls">
        <div class="controls-stack">
          <label class="search-shell search-shell--care" for="filter-query">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input class="search-input" id="filter-query" type="search" value="${escapeHtml(state.filters.query)}" placeholder="Nach Name, Organisation, Thema oder Standort suchen">
          </label>
        </div>
      </div>
    `;
  }

  function renderCareActiveFilterRow(resultCount, resultLabel) {
    const items = activeFilterItems();
    return `
      <div class="active-filter-row" ${items.length ? "" : "hidden"}>
        <span class="filter-results">${resultCount} ${escapeHtml(resultLabel)}</span>
        <div class="active-filter-list" aria-label="Aktive Filter">
          ${items.map((item) => `
            <span class="active-filter-chip">
              ${escapeHtml(`${item.label}: ${item.value}`)}
              <button type="button" data-clear-filter="${escapeHtml(item.key)}" aria-label="${escapeHtml(`${item.label} entfernen`)}">×</button>
            </span>
          `).join("")}
        </div>
        <button class="filter-reset" type="button" id="filter-reset-all">Zurücksetzen</button>
      </div>
    `;
  }

  function renderCareFilterToolbar(resultCount, resultLabel) {
    const filterCount = activeFilterItems().length;
    return `
      <div class="filter-toolbar">
        ${renderCareActiveFilterRow(resultCount, resultLabel)}
        <div class="filter-shell">
          <button class="filter-panel-button" type="button" id="filter-toggle" aria-label="Filter öffnen" aria-expanded="${state.filterPanelOpen ? "true" : "false"}" aria-controls="filter-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M4 7h16"></path>
              <path d="M7 12h10"></path>
              <path d="M10 17h4"></path>
            </svg>
            <span class="filter-panel-button__label">
              Filter
              <span class="filter-panel-button__badge${filterCount ? " is-visible" : ""}">${filterCount}</span>
            </span>
          </button>
          ${renderFilterPanel()}
        </div>
      </div>
    `;
  }

  function renderViewSelectButton() {
    return `
      <div class="view-select-shell">
        <button class="view-select-button" type="button" aria-label="Owner-Ansicht wählen">
          <svg class="view-select-button__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
            <circle cx="9.5" cy="7" r="4"></circle>
            <path d="M20 8v6"></path>
            <path d="M23 11h-6"></path>
          </svg>
          <span>Owner: Alle</span>
          <span class="view-select-button__caret" aria-hidden="true">⌄</span>
        </button>
      </div>
    `;
  }

  function renderFilterPanel() {
    const sectors = uniqueValues("category");
    const states = uniqueValues("state");
    const specialties = uniqueValues("specialty");
    const owners = profileItems().filter((profile) => profile.active !== false);
    return `
      <div class="filter-popover" id="filter-panel" ${state.filterPanelOpen ? "" : "hidden"}>
        <div class="filter-panel-head">
          <div>
            <h2>Filter</h2>
            <p>Sektor, Bundesland, Fachrichtung und Owner eingrenzen.</p>
          </div>
          <button class="icon-button" type="button" id="filter-close" aria-label="Filter schließen">×</button>
        </div>
        <div class="filter-panel-grid">
          <div class="form-field">
            <label for="filter-sector">Sektor</label>
            <select class="select" id="filter-sector" aria-label="Sektor">
              <option value="">Alle Sektoren</option>
              ${sectors.map((sector) => `<option value="${escapeHtml(sector)}" ${sector === state.filters.sector ? "selected" : ""}>${escapeHtml(sector)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="filter-state">Bundesland</label>
            <select class="select" id="filter-state" aria-label="Bundesland">
              <option value="">Alle Bundesländer</option>
              ${states.map((item) => `<option value="${escapeHtml(item)}" ${item === state.filters.state ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="filter-specialty">Fachrichtung</label>
            <select class="select" id="filter-specialty" aria-label="Fachrichtung">
              <option value="">Alle Fachrichtungen</option>
              ${specialties.map((item) => `<option value="${escapeHtml(item)}" ${item === state.filters.specialty ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="filter-owner">Owner</label>
            <select class="select" id="filter-owner" aria-label="Owner">
              <option value="">Alle Owner</option>
              ${owners.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === state.filters.ownerId ? "selected" : ""}>${escapeHtml(profile.display_name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="filter-panel-footer">
          <button class="button button--secondary" type="button" id="filter-panel-reset">Zurücksetzen</button>
          <button class="button button--primary" type="button" id="filter-apply">Anwenden</button>
        </div>
      </div>
    `;
  }

  function renderContactCommandBar(contacts) {
    const columns = visibleContactTableColumns();
    const gridTemplate = `44px ${contactGridTemplate(columns)}`;
    return `
      ${renderCareSearchControls()}
      <div class="view-shell">
        <section class="view-panel is-active" id="view-contacts" data-view-panel="contacts">
          <div class="view-card">
            <div class="table-command-row">
              <div class="table-command-actions"></div>
              <div class="table-command-spacer"></div>
              ${renderCareFilterToolbar(contacts.length, `Kontakt${contacts.length === 1 ? "" : "e"}`)}
              ${renderViewSelectButton()}
              ${renderColumnMenu()}
            </div>
            <div class="table-wrap">
              <section class="table contacts-table" aria-labelledby="kontaktliste-title" style="--contacts-grid-template: ${escapeHtml(gridTemplate)}">
                <div class="thead" id="contacts-table-head">
                  <div class="cell cell--select">
                    <span class="selection-checkbox" aria-hidden="true"></span>
                  </div>
                  ${columns.map((column) => `<div class="cell cell--${escapeHtml(column.key)}">${columnHeaderMarkup(column)}</div>`).join("")}
                </div>
                <div id="contact-list">
                  ${
                    contacts.length
                      ? contacts.map((contact) => renderContactRow(contact, columns)).join("")
                      : '<div class="empty-state">Keine Kontakte für diese Filter.</div>'
                  }
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function syncMapFrame() {
    const frame = document.querySelector(".map-frame");
    if (!frame) return;
    const targetOrigin = new URL(frame.src, window.location.href).origin;
    const send = () => {
      frame.contentWindow?.postMessage({
        type: "versorgungs-kompass-map-data",
        version: 1,
        channel: "contacts",
        context: "contacts",
        contacts: state.contacts.filter((contact) => contact.status !== "archived")
      }, targetOrigin);
    };
    frame.addEventListener("load", send, { once: true });
    setTimeout(send, 400);
  }

  function renderContacts() {
    const contacts = filteredContacts();
    elements.title.textContent = "Versorgung";
    elements.subtitle.textContent = "Ausschließlich synthetische Demo-Kontakte suchen, filtern und lokal bearbeiten.";
    elements.main.innerHTML = renderContactCommandBar(contacts);
    setTimeout(syncMapFrame, 0);
  }

  function normalizeClassPart(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function sectorPillMarkup(value) {
    const label = value || "Nicht hinterlegt";
    const suffix = normalizeClassPart(label);
    return `<span class="contact-sector-pill contact-sector-pill--${escapeHtml(suffix)}">${escapeHtml(label)}</span>`;
  }

  function ownerProfile(ownerId) {
    return profileItems().find((profile) => profile.id === ownerId) || null;
  }

  function ownerAvatarContent(profile, label) {
    const image = profile?.avatar_url || profile?.avatarUrl || "";
    if (image) {
      return `<img src="${escapeHtml(image)}" alt="" data-initials="${escapeHtml(profile.initials || initials(label))}">`;
    }
    return escapeHtml(profile?.initials || initials(label));
  }

  function ownerAvatarStackMarkup(contact) {
    if (!contact.ownerId) {
      return `
        <span class="owner-avatar-stack owner-avatar-stack--empty" title="Kein Owner" aria-label="Kein Owner">
          <span class="owner-avatar-stack__more">Kein Owner</span>
        </span>
      `;
    }
    const profile = ownerProfile(contact.ownerId);
    const label = profileLabel(contact.ownerId);
    return `
      <span class="owner-avatar-stack" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        <span class="owner-avatar-stack__item">${ownerAvatarContent(profile, label)}</span>
      </span>
    `;
  }

  function contactTableCellMarkup(contact, key) {
    const priority = contact.status === "archived" ? "Archiviert" : contact.priority;
    if (key === "name") {
      return `
        <span class="person-cell">
          ${avatar(contact)}
          <strong>${escapeHtml(contact.name)}</strong>
        </span>
      `;
    }
    if (key === "organization") return escapeHtml(contact.organization || "Nicht hinterlegt");
    if (key === "category") return sectorPillMarkup(contact.category);
    if (key === "specialty") return escapeHtml(contact.specialty || "Nicht hinterlegt");
    if (key === "location") return escapeHtml(contactLocation(contact) || "Nicht hinterlegt");
    if (key === "state") return escapeHtml(contact.state || "Nicht hinterlegt");
    if (key === "owner") return ownerAvatarStackMarkup(contact);
    if (key === "priority") return `<span class="${priorityClass(priority)}">${escapeHtml(priority)}</span>`;
    if (key === "updated") return `<span class="contact-date">${escapeHtml(formatShortDate(contact.updatedAt || contact.createdAt))}</span>`;
    return "";
  }

  function renderContactRow(contact, columns = visibleContactTableColumns()) {
    const active = contact.id === state.selectedId ? " is-active" : "";
    return `
      <button class="row care-contact-row${active}" type="button" data-contact-id="${escapeHtml(contact.id)}">
        <div class="cell cell--select">
          <span class="selection-checkbox" aria-hidden="true"></span>
        </div>
        ${columns.map((column) => `
          <div class="cell cell--${escapeHtml(column.key)}" data-label="${escapeHtml(column.label)}">
            ${contactTableCellMarkup(contact, column.key)}
          </div>
        `).join("")}
      </button>
    `;
  }

  function detailLine(label, value, { html = false } = {}) {
    const isEmpty = value == null || value === "";
    return `
      <div class="detail-line${isEmpty ? " detail-line--empty" : ""}">
        <span class="detail-line__label">${escapeHtml(label)}</span>
        <span class="detail-line__value${isEmpty ? " detail-line__value--muted" : ""}">${isEmpty ? "Nicht hinterlegt" : html ? value : escapeHtml(value)}</span>
      </div>
    `;
  }

  function detailLink(value, hrefPrefix = "") {
    if (!value) return "";
    const text = String(value);
    return `<a href="${escapeHtml(`${hrefPrefix}${text}`)}">${escapeHtml(text)}</a>`;
  }

  function externalDetailLink(value) {
    if (!value) return "";
    const url = String(value).startsWith("http") ? String(value) : `https://${value}`;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
  }

  function renderDetail() {
    if (state.view === "organizations") {
      renderOrganizationDetail();
      return;
    }
    const contact = currentContact();
    if (!contact) {
      elements.detail.innerHTML = '<div class="detail-empty">Kein Kontakt ausgewählt.</div>';
      return;
    }

    if (state.editMode) {
      renderEditDetail(contact);
      return;
    }

    const changes = changesForContact(contact.id).slice(0, 5);
    elements.detail.innerHTML = `
      <div class="detail-profile">
        <div class="detail-profile-top">
          <div class="detail-profile-main">
            ${avatar(contact, "lg")}
            <div class="detail-profile-copy">
              <h2>${escapeHtml(contact.name)}</h2>
              <p class="detail-profile-role">${escapeHtml(contact.contactRole || "Rolle nicht hinterlegt")}</p>
              <p>${escapeHtml(contact.organization || "Organisation nicht hinterlegt")}</p>
              <p>${escapeHtml(contactLocation(contact) || "Standort nicht hinterlegt")}</p>
            </div>
          </div>
          <div class="detail-profile-meta">
            <span class="${priorityClass(contact.status === "archived" ? "Archiviert" : contact.priority)}">${escapeHtml(contact.status === "archived" ? "Archiviert" : contact.priority)}</span>
            <span class="chip">${escapeHtml(profileLabel(contact.ownerId))}</span>
          </div>
        </div>
        <div class="detail-profile-actions">
          <button class="button button--primary" type="button" id="edit-contact">Bearbeiten</button>
          <button class="button button--secondary" type="button" id="quick-owner">Owner wechseln</button>
        </div>
      </div>
      <section class="detail-section">
        <h3>Einordnung</h3>
        <div class="detail-line-list">
          ${detailLine("Rolle", contact.contactRole)}
          ${detailLine("Fachrichtung", contact.specialty)}
          ${detailLine("Sektor", contact.category)}
          ${detailLine("Standort", contactLocation(contact))}
          ${detailLine("Owner", profileLabel(contact.ownerId))}
        </div>
      </section>
      <section class="detail-section">
        <h3>Kontaktwege</h3>
        <div class="detail-line-list">
          ${detailLine("E-Mail", detailLink(contact.email, "mailto:"), { html: true })}
          ${detailLine("Telefon", detailLink(contact.phone, "tel:"), { html: true })}
          ${detailLine("LinkedIn", externalDetailLink(contact.linkedin), { html: true })}
        </div>
      </section>
      <section class="detail-section">
        <h3>Themen</h3>
        <div class="chip-list">
          ${(contact.themes || []).length ? contact.themes.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("") : '<span class="muted">Nicht hinterlegt</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Notiz</h3>
        <div class="detail-note-stack">
          <p class="detail-note">${escapeHtml(contact.note || "Nicht hinterlegt")}</p>
          ${contact.nextStep ? `<p class="detail-note"><strong>Nächster Schritt:</strong> ${escapeHtml(contact.nextStep)}</p>` : ""}
        </div>
      </section>
      <section class="detail-section">
        <h3>Bild & Quelle</h3>
        <div class="detail-line-list">
          ${detailLine("Quelle", contact.imageSourceLabel || (contact.image ? "App-Asset" : ""))}
          ${detailLine("Hinweis", contact.imageRightsNote)}
          ${detailLine("Ablage", contact.image ? "Demo-Asset" : "")}
        </div>
      </section>
      <section class="detail-section">
        <h3>Änderungsverlauf</h3>
        <div class="history-list">
          ${changes.length ? changes.map(renderHistoryItem).join("") : '<span class="muted">Noch keine Änderungen für diesen Kontakt.</span>'}
        </div>
      </section>
    `;
  }

  function detailRow(label, value) {
    return `
      <div class="meta-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "Nicht hinterlegt")}</strong>
      </div>
    `;
  }

  function renderEditDetail(contact) {
    const owners = profileItems().filter((profile) => profile.active !== false);
    elements.detail.innerHTML = `
      <form class="edit-form" id="contact-form">
        <div class="detail-top">
          ${avatar(contact, "lg")}
          <div class="detail-title">
            <h2>${escapeHtml(contact.name)}</h2>
            <p>Bearbeitungsmodus</p>
          </div>
        </div>
        <div class="detail-actions">
          <button class="button button--primary" type="submit">Speichern</button>
          <button class="button button--secondary" type="button" id="cancel-edit">Abbrechen</button>
        </div>
        <section class="detail-section">
          <h3>Stammdaten</h3>
          <div class="form-grid">
            ${inputField("name", "Name", contact.name)}
            ${inputField("organization", "Organisation", contact.organization)}
            ${inputField("contactRole", "Rolle", contact.contactRole)}
            ${inputField("specialty", "Fachrichtung", contact.specialty)}
            ${selectField("priority", "Priorität", ["Hoch", "Mittel", "Niedrig", "Keine / Unbekannt"], contact.priority)}
            <div class="form-field">
              <label for="field-ownerId">Owner</label>
              <select class="select" id="field-ownerId" name="ownerId">
                <option value="">Nicht zugeordnet</option>
                ${owners.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === contact.ownerId ? "selected" : ""}>${escapeHtml(profile.display_name)}</option>`).join("")}
              </select>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h3>Kontaktwege</h3>
          <div class="form-grid">
            ${inputField("email", "E-Mail", contact.email, "email")}
            ${inputField("phone", "Telefon", contact.phone)}
          </div>
        </section>
        <section class="detail-section">
          <h3>Notiz</h3>
          <div class="form-grid">
            ${textareaField("note", "Notiz", contact.note)}
            ${textareaField("nextStep", "Nächster Schritt", contact.nextStep)}
          </div>
        </section>
      </form>
    `;
  }

  function renderOrganizationDetail() {
    const organization = currentOrganization();
    if (!organization) {
      elements.detail.innerHTML = '<div class="detail-empty">Keine Organisation ausgewählt.</div>';
      return;
    }
    const contactCount = state.contacts.filter((contact) => contact.organizationId === organization.id && contact.status !== "archived").length;
    elements.detail.innerHTML = `
      <div class="detail-top">
        <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(initials(organization.name))}</span>
        <div class="detail-title">
          <h2>${escapeHtml(organization.name)}</h2>
          <p>${escapeHtml([organization.city, organization.state].filter(Boolean).join(", ") || "Standort nicht hinterlegt")}</p>
          <p>${contactCount} aktive Kontakte</p>
        </div>
      </div>
      <section class="detail-section">
        <h3>Einordnung</h3>
        <div class="meta-grid">
          ${detailRow("Sektor", organization.sector)}
          ${detailRow("Typ", organization.organizationType)}
          ${detailRow("Status", organization.status)}
        </div>
      </section>
      <section class="detail-section">
        <h3>Kontaktwege</h3>
        <div class="meta-grid">
          ${detailRow("Website", organization.website)}
          ${detailRow("E-Mail", organization.email)}
          ${detailRow("Telefon", organization.phone)}
        </div>
      </section>
      <section class="detail-section">
        <h3>Notiz</h3>
        <p class="muted">${escapeHtml(organization.notes || "Nicht hinterlegt")}</p>
      </section>
    `;
  }

  function inputField(name, label, value, type = "text") {
    return `
      <div class="form-field">
        <label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label>
        <input class="input" id="field-${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}">
      </div>
    `;
  }

  function textareaField(name, label, value) {
    return `
      <div class="form-field">
        <label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label>
        <textarea class="textarea" id="field-${escapeHtml(name)}" name="${escapeHtml(name)}">${escapeHtml(value || "")}</textarea>
      </div>
    `;
  }

  function selectField(name, label, options, value) {
    return `
      <div class="form-field">
        <label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label>
        <select class="select" id="field-${escapeHtml(name)}" name="${escapeHtml(name)}">
          ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  function changesForContact(contactId) {
    return state.changes
      .filter((change) => change.contactId === contactId)
      .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime());
  }

  function renderHistoryItem(change) {
    const field = change.fieldName ? fieldLabels[change.fieldName] || change.fieldName : "Kontakt";
    const oldValue = displayValue(change.fieldName, change.oldValue);
    const newValue = displayValue(change.fieldName, change.newValue);
    const detail =
      change.action === "create"
        ? "Kontakt angelegt"
        : `${oldValue} → ${newValue}`;
    return `
      <div class="history-item">
        <span class="history-dot" aria-hidden="true"></span>
        <span class="history-body">
          <strong>${escapeHtml(field)}</strong>
          <span>${escapeHtml(detail)}</span>
          <small>${escapeHtml(asDate(change.changedAt))} · ${escapeHtml(change.changedBy || ACTOR)}</small>
        </span>
      </div>
    `;
  }

  function filteredOrganizations() {
    const query = state.filters.query.trim().toLowerCase();
    return organizationItems()
      .filter((organization) => organization.status !== "archived")
      .filter((organization) => {
        const haystack = [
          organization.name,
          organization.sector,
          organization.organizationType,
          organization.city,
          organization.state,
          organization.website,
          organization.email
        ].join(" ").toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (state.filters.sector && organization.sector !== state.filters.sector) return false;
        if (state.filters.state && organization.state !== state.filters.state) return false;
        return true;
      })
      .map((organization) => ({
        ...organization,
        contactCount: state.contacts.filter((contact) => contact.organizationId === organization.id && contact.status !== "archived").length
      }));
  }

  function renderOrganizations() {
    elements.title.textContent = "Versorgung";
    elements.subtitle.textContent = "Ausschließlich synthetische Demo-Organisationen und ihre Kontaktverteilung.";
    const orgs = filteredOrganizations();
    const gridTemplate = "minmax(260px, 1.4fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) minmax(110px, 0.46fr)";
    elements.main.innerHTML = `
      ${renderCareSearchControls()}
      <div class="view-shell">
        <section class="view-panel is-active" id="view-organizations" data-view-panel="organizations">
          <div class="view-card organizations-workspace">
            <div class="table-command-row table-command-row--organizations">
              <div class="table-command-actions"></div>
              <div class="table-command-spacer"></div>
              ${renderCareFilterToolbar(orgs.length, `Organisation${orgs.length === 1 ? "" : "en"}`)}
            </div>
            <div class="table-wrap">
              <section class="table organizations-table" aria-label="Organisationen" style="--organizations-grid-template: ${escapeHtml(gridTemplate)}">
                <div class="thead">
                  <div>Organisation</div>
                  <div>Sektor</div>
                  <div>Bundesland</div>
                  <div>Kontakte</div>
                </div>
                <div id="organization-list">
                  ${orgs.length ? orgs.map((org) => `
                    <button class="row care-organization-row" type="button" data-organization-id="${escapeHtml(org.id)}">
                      <div class="organization-cell">
                        <span class="organization-logo organization-logo--sm" aria-hidden="true">${escapeHtml(initials(org.name))}</span>
                        <span>
                          <strong>${escapeHtml(org.name)}</strong>
                          <span>${escapeHtml([org.city, org.postalCode].filter(Boolean).join(" · ") || "Standort nicht hinterlegt")}</span>
                        </span>
                      </div>
                      <div>${sectorPillMarkup(org.sector || "Nicht hinterlegt")}</div>
                      <div>${escapeHtml(org.state || "Nicht hinterlegt")}</div>
                      <div><strong>${org.contactCount}</strong></div>
                    </button>
                  `).join("") : '<div class="empty-state">Keine Organisationen für diese Filter.</div>'}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderActivity() {
    elements.title.textContent = "Aktivität";
    elements.subtitle.textContent = "Lokaler Änderungsverlauf für Testbearbeitung und Ownerwechsel.";
    const rows = [...state.changes]
      .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
      .slice(0, 30);
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${state.changes.length}</strong> Änderungen</span>
        <span class="metric"><strong>${ACTOR}</strong></span>
      </div>
      <div class="activity-panel">
        ${rows.map((change) => {
          const contact = state.contacts.find((item) => item.id === change.contactId);
          const field = change.fieldName ? fieldLabels[change.fieldName] || change.fieldName : "Kontakt";
          return `
            <div class="activity-row">
              <span>${escapeHtml(asDate(change.changedAt))}</span>
              <strong>${escapeHtml(contact?.name || "Kontakt")}</strong>
              <span>${escapeHtml(field)}: ${escapeHtml(displayValue(change.fieldName, change.newValue))}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMapView() {
    elements.title.textContent = "Karte";
    elements.subtitle.textContent = "Kartenmodus mit ausschließlich synthetischen Demo-Kontakten.";
    elements.status.textContent = "Synthetische Demo-Daten geladen";
    saveState();
    elements.main.innerHTML = `
      <div class="view-shell">
        <section class="view-panel is-active" id="view-map" data-view-panel="map">
          <div class="view-card view-card--map">
            <iframe
              class="map-frame map-embed-frame"
              title="Versorgungs-Kompass Karten-Modus"
              src="../map/versorgungs-kompass-map.html?embed=1&demo=1&amp;channel=contacts&amp;context=contacts"
              loading="eager"
            ></iframe>
          </div>
        </section>
      </div>
    `;
    setTimeout(syncMapFrame, 0);
  }

  function renderOpsView() {
    elements.title.textContent = "Betrieb";
    elements.subtitle.textContent = "Technischer Status der rein lokalen Browser-Demo.";
    const activeContacts = state.contacts.filter((contact) => contact.status !== "archived").length;
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${activeContacts}</strong> lokale Kontakte</span>
        <span class="metric"><strong>${state.changes.length}</strong> lokale Änderungen</span>
      </div>
      <div class="activity-panel">
        <div class="activity-row">
          <span>Datenspeicher</span>
          <strong>Dieser Browser</strong>
          <span>Keine Serververbindung; Teständerungen bleiben ausschließlich lokal.</span>
        </div>
      </div>
    `;
    elements.detail.innerHTML = '<div class="detail-empty">Die öffentliche Demo enthält keine Server-, Datenbank- oder Betriebsanbindung.</div>';
  }

  function renderProfileView() {
    const profile = currentDemoProfile();
    const session = state.session || buildLocalSession();
    const profiles = profileItems().filter((item) => item.active !== false);
    const role = profile?.role || "editor";
    elements.title.textContent = "Mein Profil";
    elements.subtitle.textContent = "Lokales synthetisches Demo-Profil ohne zentrale Anmeldung.";
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${escapeHtml(profile?.display_name || "Demo-Profil")}</strong></span>
        <span class="metric"><strong>${escapeHtml(roleLabel(role))}</strong> Rolle</span>
        <span class="metric"><strong>${escapeHtml(session.authModeLabel || "Demo-Profil")}</strong></span>
        <span class="metric"><strong>${escapeHtml(profiles.length)}</strong> aktive Profile</span>
      </div>
      <div class="profile-workbench">
        <section class="profile-section">
          <div class="profile-identity">
            ${profileAvatar(profile)}
            <div class="profile-copy">
              <h2>${escapeHtml(profile?.display_name || "Demo-Profil")}</h2>
              <p>${escapeHtml(profile?.email || "Keine E-Mail hinterlegt")}</p>
              <div class="chip-list">
                <span class="chip">${escapeHtml(roleLabel(role))}</span>
                <span class="chip">${escapeHtml(profile?.team || "Demo-Team")}</span>
              </div>
            </div>
          </div>
          <div class="meta-grid">
            ${detailRow("Rolle", roleLabel(role))}
            ${detailRow("Team", profile?.team)}
            ${detailRow("Profil-ID", profile?.id)}
            ${detailRow("Aktiv", profile?.active === false ? "Nein" : "Ja")}
          </div>
        </section>
        <section class="profile-section">
          <div class="profile-section__head">
            <h2>Rollenmodell light</h2>
            <span class="badge">${escapeHtml(enforcementLabel(session.enforcement))}</span>
          </div>
          <div class="activity-panel profile-role-list">
            ${roleMatrixItems().map((item) => `
              <div class="activity-row profile-role-row">
                <span>${escapeHtml(item.label || roleLabel(item.role))}</span>
                <strong>${escapeHtml(item.scope || roleDescription(item.role))}</strong>
                <span>${escapeHtml(item.note || "Noch nicht als Zugriffsschutz aktiv.")}</span>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="profile-section">
          <div class="profile-section__head">
            <h2>Aktive Profile</h2>
            <span class="badge">${escapeHtml(profiles.length)} Profile</span>
          </div>
          <div class="activity-panel">
            ${profiles.map((item) => `
              <div class="activity-row profile-row">
                <span>${profileAvatar(item, "sm")}</span>
                <strong>${escapeHtml(item.display_name || item.email)}</strong>
                <span>${escapeHtml(roleLabel(item.role))} · ${escapeHtml(item.team || "Kein Team")}</span>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
    `;
    elements.detail.innerHTML = `
      <div class="detail-top">
        ${profileAvatar(profile)}
        <div class="detail-title">
          <h2>Profil & Rollen</h2>
          <p>Step 5.5</p>
        </div>
      </div>
      <section class="detail-section">
        <h3>Aktueller Modus</h3>
        <div class="meta-grid">
          ${detailRow("Identität", session.authModeLabel)}
          ${detailRow("Quelle", session.identitySource)}
          ${detailRow("Zugriff", "Noch kein App-Login")}
          ${detailRow("Rollen", "Nur Anzeige")}
        </div>
      </section>
      <section class="detail-section">
        <h3>Audit</h3>
        <p class="muted">Lokale Teständerungen werden dem Demo-Testzugang zugeordnet. Diese Zuordnung dient nur der Funktionsdemonstration und ist keine echte Nutzeranmeldung.</p>
      </section>
      <section class="detail-section">
        <h3>Späterer Anschluss</h3>
        <div class="meta-grid">
          ${detailRow("SSO/Gateway", "Offen")}
          ${detailRow("Nutzerverwaltung", "Nicht aktiv")}
          ${detailRow("Rechteprüfung", "Noch nicht erzwungen")}
        </div>
      </section>
    `;
  }

  function renderImportView() {
    elements.title.textContent = "Importe";
    elements.subtitle.textContent = "In der öffentlichen Demo bewusst deaktiviert.";
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>0</strong> Uploads</span>
        <span class="metric"><strong>0</strong> Server-Schreibvorgänge</span>
      </div>
      <div class="import-workbench">
        <section class="import-section">
          <div class="import-section__head">
            <div>
              <h2>Kein Datenimport in der öffentlichen Demo</h2>
              <p>Die Demo verwendet ausschließlich den versionierten, synthetischen Beispieldatensatz.</p>
            </div>
          </div>
          <div class="activity-panel">
            <div class="activity-row">
              <span>Datengrenze</span>
              <strong>Nur synthetische Demo-Daten</strong>
              <span>Eigene Dateien werden weder ausgewählt noch verarbeitet oder gespeichert.</span>
            </div>
          </div>
        </section>
      </div>
    `;
    elements.detail.innerHTML = `
      <div class="detail-top">
        <span class="avatar avatar-lg" aria-hidden="true">IM</span>
        <div class="detail-title">
          <h2>Klare Datengrenze</h2>
          <p>Öffentliche Demo</p>
        </div>
      </div>
      <section class="detail-section">
        <h3>Regel</h3>
        <div class="meta-grid">
          ${detailRow("Datenquelle", "Synthetischer Demo-Datensatz")}
          ${detailRow("Datei-Upload", "Deaktiviert")}
          ${detailRow("Serverzugriff", "Nicht vorhanden")}
          ${detailRow("Persistenz", "Nur lokale Teständerungen")}
        </div>
      </section>
      <section class="detail-section">
        <h3>Zielbetrieb</h3>
        <p class="muted">Importe gehören ausschließlich in die geschützte Realanwendung und benötigen dort Berechtigungen, Validierung, Protokollierung und ein kontrolliertes Rollback.</p>
      </section>
    `;
  }

  function render() {
    document.querySelectorAll(".primary-tab").forEach((item) => {
      const primaryView = item.dataset.view || "contacts";
      const active =
        primaryView === state.view ||
        (primaryView === "contacts" && (state.view === "contacts" || state.view === "organizations"));
      item.classList.toggle("is-active", active);
    });
    elements.shell?.setAttribute("data-active-view", state.view);
    elements.workspace?.classList.toggle("workspace--map", state.view === "map");
    elements.workspace?.classList.toggle("workspace--care", isCareView());
    updateCareModeTabs();
    if (state.view === "organizations") renderOrganizations();
    else if (state.view === "map") renderMapView();
    else if (state.view === "activity") renderActivity();
    else if (state.view === "ops") renderOpsView();
    else if (state.view === "profile") renderProfileView();
    else if (state.view === "imports") renderImportView();
    else renderContacts();
    if (isCareView()) {
      elements.detail.innerHTML = "";
    } else if (!["ops", "imports", "profile"].includes(state.view)) {
      renderDetail();
    }
    attachMainEvents();
    attachDetailEvents();
  }

  function attachMainEvents() {
    const query = document.getElementById("filter-query");
    const sector = document.getElementById("filter-sector");
    const stateSelect = document.getElementById("filter-state");
    const specialty = document.getElementById("filter-specialty");
    const owner = document.getElementById("filter-owner");
    if (query) query.addEventListener("input", (event) => updateFilter("query", event.target.value));
    if (sector) sector.addEventListener("change", (event) => updateFilter("sector", event.target.value));
    if (stateSelect) stateSelect.addEventListener("change", (event) => updateFilter("state", event.target.value));
    if (specialty) specialty.addEventListener("change", (event) => updateFilter("specialty", event.target.value));
    if (owner) owner.addEventListener("change", (event) => updateFilter("ownerId", event.target.value));

    document.getElementById("filter-toggle")?.addEventListener("click", () => {
      state.filterPanelOpen = !state.filterPanelOpen;
      state.columnMenuOpen = false;
      render();
    });

    document.getElementById("filter-close")?.addEventListener("click", () => {
      state.filterPanelOpen = false;
      render();
    });

    document.getElementById("filter-apply")?.addEventListener("click", () => {
      state.filterPanelOpen = false;
      render();
    });

    document.getElementById("filter-reset-all")?.addEventListener("click", () => {
      resetContactFilters();
      state.filterPanelOpen = false;
      render();
    });

    document.getElementById("filter-panel-reset")?.addEventListener("click", () => {
      resetContactFilters();
      render();
    });

    document.querySelectorAll("[data-clear-filter]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const key = event.currentTarget.dataset.clearFilter;
        if (key && key in state.filters) state.filters[key] = "";
        const visible = filteredContacts();
        state.selectedId = visible[0]?.id || "";
        render();
      });
    });

    document.getElementById("columns-toggle")?.addEventListener("click", () => {
      state.columnMenuOpen = !state.columnMenuOpen;
      state.filterPanelOpen = false;
      render();
    });

    document.querySelectorAll("[data-column-key]").forEach((input) => {
      input.addEventListener("change", (event) => {
        const key = event.currentTarget.dataset.columnKey;
        const column = contactTableColumns.find((item) => item.key === key);
        if (!column || column.required) return;
        if (event.currentTarget.checked) {
          state.visibleContactColumns = contactTableColumns
            .filter((item) => item.required || state.visibleContactColumns.includes(item.key) || item.key === key)
            .map((item) => item.key);
        } else {
          state.visibleContactColumns = state.visibleContactColumns.filter((item) => item !== key);
        }
        persistVisibleContactColumns();
        render();
      });
    });

    document.querySelectorAll("[data-contact-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedId = button.dataset.contactId;
        state.editMode = false;
        state.filterPanelOpen = false;
        state.columnMenuOpen = false;
        saveState();
        render();
      });
    });

    document.querySelectorAll("[data-organization-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOrganizationId = button.dataset.organizationId;
        render();
      });
    });
  }

  function attachDetailEvents() {
    document.getElementById("edit-contact")?.addEventListener("click", () => {
      state.editMode = true;
      renderDetail();
      attachDetailEvents();
    });

    document.getElementById("quick-owner")?.addEventListener("click", cycleOwner);
    document.getElementById("cancel-edit")?.addEventListener("click", () => {
      state.editMode = false;
      renderDetail();
      attachDetailEvents();
    });
    document.getElementById("contact-form")?.addEventListener("submit", saveContactForm);
  }

  function updateFilter(name, value) {
    state.filters[name] = value;
    state.editMode = false;
    const visible = filteredContacts();
    if (visible.length && !visible.some((contact) => contact.id === state.selectedId)) {
      state.selectedId = visible[0].id;
    }
    render();
  }

  function addChange(contactId, fieldName, oldValue, newValue) {
    state.changes.unshift({
      id: `demo-change-local-${Date.now()}-${fieldName}-${Math.random().toString(16).slice(2)}`,
      contactId,
      action: "update",
      fieldName,
      oldValue,
      newValue,
      changedAt: new Date().toISOString(),
      changedBy: ACTOR
    });
  }

  function saveContactForm(event) {
    event.preventDefault();
    const contact = currentContact();
    if (!contact) return;
    const form = new FormData(event.currentTarget);
    const next = { ...contact };
    editFields.forEach((field) => {
      next[field] = String(form.get(field) || "").trim();
    });

    const changed = editFields.filter((field) => String(contact[field] || "") !== String(next[field] || ""));
    if (!changed.length) {
      elements.status.textContent = "Keine Änderung gespeichert";
      state.editMode = false;
      render();
      return;
    }

    changed.forEach((field) => addChange(contact.id, field, contact[field] || "", next[field] || ""));
    next.updatedAt = new Date().toISOString();
    state.contacts = state.contacts.map((item) => (item.id === contact.id ? normalizeContact(next) : item));
    state.editMode = false;
    saveState();
    elements.status.textContent = `${changed.length} Teständerung${changed.length === 1 ? "" : "en"} lokal gespeichert`;
    render();
  }

  function cycleOwner() {
    const contact = currentContact();
    const owners = profileItems().filter((profile) => profile.active !== false);
    if (!contact || !owners.length) return;
    const currentIndex = owners.findIndex((profile) => profile.id === contact.ownerId);
    const nextOwner = owners[(currentIndex + 1) % owners.length];
    addChange(contact.id, "ownerId", contact.ownerId || "", nextOwner.id);
    state.contacts = state.contacts.map((item) =>
      item.id === contact.id ? { ...item, ownerId: nextOwner.id, updatedAt: new Date().toISOString() } : item
    );
    saveState();
    elements.status.textContent = `Owner auf ${nextOwner.display_name} gesetzt`;
    render();
  }

  function attachGlobalEvents() {
    document.querySelectorAll(".primary-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view || "contacts";
        state.editMode = false;
        state.filterPanelOpen = false;
        state.columnMenuOpen = false;
        render();
      });
    });

    elements.careModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.careMode || "contacts";
        state.editMode = false;
        state.filterPanelOpen = false;
        state.columnMenuOpen = false;
        render();
      });
    });

    document.getElementById("sidebar-demo-status")?.addEventListener("click", () => {
      state.view = "ops";
      state.editMode = false;
      state.filterPanelOpen = false;
      state.columnMenuOpen = false;
      render();
    });

    elements.reset.addEventListener("click", () => {
      window.localStorage.removeItem(CONTACTS_KEY);
      window.localStorage.removeItem(CHANGES_KEY);
      window.localStorage.removeItem(SELECTED_KEY);
      loadState();
      state.editMode = false;
      state.view = "map";
      elements.status.textContent = "Synthetische Demo-Daten zurückgesetzt";
      render();
    });

    elements.sidebarCollapse?.addEventListener("click", () => {
      const collapsed = !elements.shell.classList.contains("is-sidebar-collapsed");
      elements.shell.classList.toggle("is-sidebar-collapsed", collapsed);
      elements.sidebarCollapse.setAttribute("aria-label", collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen");
      elements.sidebarCollapse.setAttribute("title", collapsed ? "Menü ausklappen" : "Menü einklappen");
    });

    document.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement) || !target.classList.contains("avatar")) return;
        const fallback = document.createElement("span");
        fallback.className = target.className;
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = target.dataset.initials || "?";
        target.replaceWith(fallback);
      },
      true
    );

    window.addEventListener("message", (event) => {
      if (event.data?.type !== "versorgungs-kompass-open-detail" || !event.data.id) return;
      const contact = state.contacts.find((item) => item.id === event.data.id);
      if (!contact) return;
      state.selectedId = contact.id;
      state.view = "contacts";
      state.editMode = false;
      saveState();
      elements.status.textContent = "Kontakt aus der Karte geöffnet";
      render();
    });
  }

  function start() {
    loadState();
    attachGlobalEvents();
    render();
  }

  start();
})();
