(function () {
  const CONTACTS_KEY = "versorgungs-kompass-demo-mode-contacts-v1";
  const CHANGES_KEY = "versorgungs-kompass-demo-mode-changes-v1";
  const SELECTED_KEY = "versorgungs-kompass-demo-mode-selected-contact-v1";
  const ACTOR = "Demo-Testzugang";
  const API_MODE = window.VK_DEMO_BACKEND === "api";
  const data = window.VERSORGUNGS_COMPASS_DEMO_DATA || {};

  const state = {
    view: "contacts",
    profiles: [],
    session: null,
    organizations: [],
    contacts: [],
    changes: [],
    selectedId: "",
    selectedOrganizationId: "",
    showArchived: false,
    opsSummary: null,
    opsLoading: false,
    opsError: "",
    importText: "",
    importFileName: "",
    importPreview: null,
    importRuns: [],
    importRunsLoaded: false,
    importLoading: false,
    importError: "",
    importExportConfirmed: false,
    importResult: null,
    filters: {
      query: "",
      sector: "",
      state: "",
      ownerId: ""
    },
    editMode: false,
    createMode: false,
    organizationEditMode: false,
    organizationCreateMode: false
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
    sidebarCollapse: document.getElementById("sidebar-collapse-button")
  };

  function profileItems() {
    return state.profiles.length ? state.profiles : data.profiles || [];
  }

  function organizationItems() {
    return state.organizations.length ? state.organizations : data.organizations || [];
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
    if (role === "admin") return "Datenpflege, Import, Export und Demo-Reset";
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
      { role: "admin", label: "Admin", scope: roleDescription("admin"), note: "In der Demo sichtbar, aber nicht erzwungen." },
      { role: "editor", label: "Editor", scope: roleDescription("editor"), note: "Später für normale CRM-Pflege geeignet." },
      { role: "viewer", label: "Viewer", scope: roleDescription("viewer"), note: "Später für reine Leserechte geeignet." }
    ];
  }

  function currentDemoProfile() {
    return state.session?.profile || profileItems().find((profile) => profile.active !== false) || profileItems()[0] || null;
  }

  function buildLocalSession() {
    return {
      authMode: API_MODE ? "demo-profile" : "local-demo-profile",
      authModeLabel: API_MODE ? "Demo-Profil ohne Login" : "Lokales Demo-Profil",
      identitySource: API_MODE ? "Cloud SQL" : "Demo-Daten",
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

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `API-Fehler ${response.status}`);
    }
    return payload;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Datei konnte nicht gelesen werden.")));
      reader.readAsDataURL(file);
    });
  }

  function fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Datei konnte nicht gelesen werden.")));
      reader.readAsText(file);
    });
  }

  function sampleImportCsv() {
    return [
      "name;organization;category;specialty;role;priority;owner;email;phone;city;state;postalCode;lat;lon;themes;note;nextStep",
      "Dr. Mira Hoffmann;MVZ Demo West;Ambulante Versorgung;Pädiatrie;Ärztliche Leitung;Mittel;Demo Admin;mira.hoffmann@example.test;+49 221 000000;Köln;Nordrhein-Westfalen;50667;50.9375;6.9603;Pilot|Kinder;Demo-Import;Kontakt prüfen",
      "Jonas Richter;Klinikum Demo Nord;Krankenhaus;Entlassmanagement;Koordination;Hoch;Demo Admin;jonas.richter@example.test;+49 40 000000;Hamburg;Hamburg;20095;53.5511;9.9937;Nachsorge|Kooperation;Demo-Import;Termin abstimmen"
    ].join("\n");
  }

  function importActionLabel(action) {
    if (action === "create") return "Neu";
    if (action === "skip_existing") return "Dubletten-Skip";
    if (action === "error") return "Fehler";
    return "Prüfen";
  }

  function importActionClass(action) {
    if (action === "create") return "badge badge--success";
    if (action === "skip_existing") return "badge badge--medium";
    if (action === "error") return "badge badge--danger";
    return "badge";
  }

  function clearImportDraft() {
    state.importText = "";
    state.importFileName = "";
    state.importPreview = null;
    state.importLoading = false;
    state.importError = "";
    state.importExportConfirmed = false;
    state.importResult = null;
  }

  function seedChanges() {
    const source = Array.isArray(data.changes) ? data.changes : [];
    const mapped = source.map((change, index) => ({
      id: change.id || `seed-${index + 1}`,
      contactId: change.contactId || change.contact_id,
      action: change.action || "update",
      fieldName: change.fieldName || change.field_name || "",
      oldValue: change.oldValue || change.old_value || "",
      newValue: change.newValue || change.new_value || "",
      changedAt: change.changedAt || change.changed_at,
      changedBy: profileLabel(change.changedBy || change.changed_by)
    }));

    const extra = (data.contacts || []).slice(8, 14).map((contact, index) => ({
      id: `seed-extra-${index + 1}`,
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

  async function loadBackendState() {
    const payload = await apiRequest("/api/bootstrap?includeArchived=true");
    state.profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    state.session = payload.session || buildLocalSession();
    state.organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
    state.contacts = (Array.isArray(payload.contacts) ? payload.contacts : []).map(normalizeContact);
    state.changes = Array.isArray(payload.changes) ? payload.changes : [];
    state.selectedId = window.localStorage.getItem(SELECTED_KEY) || state.contacts[0]?.id || "";
    if (state.selectedId && !state.contacts.some((contact) => contact.id === state.selectedId)) {
      state.selectedId = state.contacts[0]?.id || "";
    }
    state.selectedOrganizationId = state.selectedOrganizationId || state.organizations[0]?.id || "";
  }

  async function loadState() {
    if (API_MODE) {
      try {
        await loadBackendState();
        elements.status.textContent = `${state.contacts.length} Kontakte aus Cloud SQL geladen`;
        return;
      } catch (error) {
        console.error(error);
        elements.status.textContent = `Cloud-SQL-Backend nicht erreichbar: ${error.message}`;
      }
    }

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
    if (API_MODE) {
      if (state.selectedId) window.localStorage.setItem(SELECTED_KEY, state.selectedId);
      return;
    }
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
      if (!state.showArchived && contact.status === "archived") return false;
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

  function renderToolbar() {
    const sectors = uniqueValues("category");
    const states = uniqueValues("state");
    const owners = profileItems().filter((profile) => profile.active !== false);
    return `
      <div class="toolbar">
        <input class="input" id="filter-query" type="search" value="${escapeHtml(state.filters.query)}" placeholder="Kontakte suchen">
        <select class="select" id="filter-sector" aria-label="Sektor">
          <option value="">Alle Sektoren</option>
          ${sectors.map((sector) => `<option value="${escapeHtml(sector)}" ${sector === state.filters.sector ? "selected" : ""}>${escapeHtml(sector)}</option>`).join("")}
        </select>
        <select class="select" id="filter-state" aria-label="Bundesland">
          <option value="">Alle Bundesländer</option>
          ${states.map((item) => `<option value="${escapeHtml(item)}" ${item === state.filters.state ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
        <select class="select" id="filter-owner" aria-label="Owner">
          <option value="">Alle Owner</option>
          ${owners.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === state.filters.ownerId ? "selected" : ""}>${escapeHtml(profile.display_name)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  function syncMapFrame() {
    const frame = document.querySelector(".map-frame");
    if (!frame) return;
    const send = () => {
      frame.contentWindow?.postMessage({
        type: "versorgungs-kompass-map-data",
        contacts: state.contacts.filter((contact) => contact.status !== "archived")
      }, "*");
    };
    frame.addEventListener("load", send, { once: true });
    setTimeout(send, 400);
  }

  function renderContacts() {
    const contacts = filteredContacts();
    const highCount = contacts.filter((contact) => contact.priority === "Hoch").length;
    const missingOwner = contacts.filter((contact) => !contact.ownerId).length;
    const archivedCount = state.contacts.filter((contact) => contact.status === "archived").length;
    elements.title.textContent = "Kontakte";
    elements.subtitle.textContent = API_MODE
      ? "Kontakte suchen, filtern, lesen und Änderungen in Cloud SQL speichern."
      : "Kontakte suchen, filtern, lesen und Demo-Änderungen lokal simulieren.";
    elements.main.innerHTML = `
      ${renderToolbar()}
      <div class="summary-strip">
        <span class="metric"><strong>${contacts.length}</strong> Kontakte</span>
        <span class="metric"><strong>${highCount}</strong> hohe Priorität</span>
        <span class="metric"><strong>${missingOwner}</strong> ohne Owner</span>
        ${API_MODE ? `<button class="button button--secondary" type="button" id="create-contact">Kontakt anlegen</button>` : ""}
        ${API_MODE ? `<button class="button button--secondary" type="button" id="toggle-archived">${state.showArchived ? "Aktive anzeigen" : `Archiv anzeigen (${archivedCount})`}</button>` : ""}
      </div>
      <div class="contact-list">
        <div class="list-head" aria-hidden="true">
          <span>Kontakt</span>
          <span>Organisation</span>
          <span>Sektor</span>
          <span>Owner</span>
          <span>Priorität</span>
        </div>
        ${
          contacts.length
            ? contacts.map(renderContactRow).join("")
            : '<div class="empty-state">Keine Kontakte für diese Filter.</div>'
        }
      </div>
    `;
    setTimeout(syncMapFrame, 0);
  }

  function renderContactRow(contact) {
    const active = contact.id === state.selectedId ? " is-active" : "";
    const priority = contact.status === "archived" ? "Archiviert" : contact.priority;
    return `
      <button class="contact-row${active}" type="button" data-contact-id="${escapeHtml(contact.id)}">
        <span class="person-cell">
          ${avatar(contact)}
          <span>
            <strong>${escapeHtml(contact.name)}</strong>
            <span>${escapeHtml(contact.contactRole || "Rolle nicht hinterlegt")}</span>
          </span>
        </span>
        <span class="cell">${escapeHtml(contact.organization || "Nicht hinterlegt")}</span>
        <span class="cell">${escapeHtml(contact.category || "Nicht hinterlegt")}</span>
        <span class="cell">${escapeHtml(profileLabel(contact.ownerId))}</span>
        <span class="cell"><span class="${priorityClass(priority)}">${escapeHtml(priority)}</span></span>
      </button>
    `;
  }

  function renderDetail() {
    if (state.view === "organizations") {
      renderOrganizationDetail();
      return;
    }
    if (state.createMode) {
      renderCreateContactDetail();
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
      <div class="detail-top">
        ${avatar(contact, "lg")}
        <div class="detail-title">
          <h2>${escapeHtml(contact.name)}</h2>
          <p>${escapeHtml(contact.organization || "Organisation nicht hinterlegt")}</p>
          <p>${escapeHtml([contact.city, contact.state].filter(Boolean).join(", ") || "Standort nicht hinterlegt")}</p>
        </div>
      </div>
      <div class="detail-actions">
        <button class="button button--primary" type="button" id="edit-contact">Bearbeiten</button>
        <button class="button button--secondary" type="button" id="quick-owner">Owner wechseln</button>
        ${API_MODE ? `<button class="button button--secondary" type="button" id="archive-contact">${contact.status === "archived" ? "Wiederherstellen" : "Archivieren"}</button>` : ""}
      </div>
      <section class="detail-section">
        <h3>Einordnung</h3>
        <div class="meta-grid">
          ${detailRow("Rolle", contact.contactRole)}
          ${detailRow("Fachrichtung", contact.specialty)}
          ${detailRow("Sektor", contact.category)}
          ${detailRow("Priorität", contact.priority)}
          ${detailRow("Owner", profileLabel(contact.ownerId))}
        </div>
      </section>
      <section class="detail-section">
        <h3>Kontaktwege</h3>
        <div class="meta-grid">
          ${detailRow("E-Mail", contact.email)}
          ${detailRow("Telefon", contact.phone)}
          ${detailRow("LinkedIn", contact.linkedin)}
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
        <p class="muted">${escapeHtml(contact.note || "Nicht hinterlegt")}</p>
      </section>
      <section class="detail-section">
        <h3>Bild & Quelle</h3>
        <div class="meta-grid">
          ${detailRow("Quelle", contact.imageSourceLabel || (contact.image ? "Demo-Asset" : ""))}
          ${detailRow("Hinweis", contact.imageRightsNote)}
          ${detailRow("Ablage", contact.imageStoragePath ? "Cloud Storage" : contact.image ? "App-Asset" : "")}
        </div>
        ${API_MODE ? `
          <form class="form-grid" id="contact-image-form">
            <div class="form-field">
              <label for="field-contact-image">Bilddatei</label>
              <input class="input" id="field-contact-image" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml">
            </div>
            ${inputField("imageSourceLabel", "Quelle", contact.imageSourceLabel || "Cloud Storage")}
            ${inputField("imageRightsNote", "Rechtehinweis", contact.imageRightsNote || "Demo-/freigegebenes Bild")}
            <div class="detail-actions">
              <button class="button button--primary" type="submit">Bild hochladen</button>
              ${contact.image ? '<button class="button button--secondary" type="button" id="remove-contact-image">Bild entfernen</button>' : ""}
            </div>
          </form>
        ` : ""}
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

  function renderCreateContactDetail() {
    const owners = profileItems().filter((profile) => profile.active !== false);
    const orgs = organizationItems().filter((organization) => organization.status !== "archived");
    elements.detail.innerHTML = `
      <form class="edit-form" id="contact-create-form">
        <div class="detail-top">
          <span class="avatar avatar-lg" aria-hidden="true">+</span>
          <div class="detail-title">
            <h2>Kontakt anlegen</h2>
            <p>Neuer Cloud-SQL-Kontakt</p>
          </div>
        </div>
        <div class="detail-actions">
          <button class="button button--primary" type="submit">Anlegen</button>
          <button class="button button--secondary" type="button" id="cancel-create">Abbrechen</button>
        </div>
        <section class="detail-section">
          <h3>Stammdaten</h3>
          <div class="form-grid">
            ${inputField("name", "Name", "")}
            <div class="form-field">
              <label for="field-organizationId">Organisation</label>
              <select class="select" id="field-organizationId" name="organizationId">
                <option value="">Nicht zugeordnet</option>
                ${orgs.map((org) => `<option value="${escapeHtml(org.id)}">${escapeHtml(org.name)}</option>`).join("")}
              </select>
            </div>
            ${inputField("contactRole", "Rolle", "")}
            ${inputField("specialty", "Fachrichtung", "")}
            ${selectField("priority", "Priorität", ["Hoch", "Mittel", "Niedrig", "Keine / Unbekannt"], "Mittel")}
            <div class="form-field">
              <label for="field-ownerId">Owner</label>
              <select class="select" id="field-ownerId" name="ownerId">
                ${owners.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.display_name)}</option>`).join("")}
              </select>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h3>Kontaktwege</h3>
          <div class="form-grid">
            ${inputField("email", "E-Mail", "", "email")}
            ${inputField("phone", "Telefon", "")}
          </div>
        </section>
        <section class="detail-section">
          <h3>Notiz</h3>
          <div class="form-grid">
            ${textareaField("note", "Notiz", "")}
            ${textareaField("nextStep", "Nächster Schritt", "")}
          </div>
        </section>
      </form>
    `;
  }

  function renderOrganizationDetail() {
    const organization = currentOrganization();
    if (state.organizationCreateMode || state.organizationEditMode) {
      const model = state.organizationCreateMode ? {} : organization || {};
      elements.detail.innerHTML = renderOrganizationForm(model);
      return;
    }
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
      ${API_MODE ? `
        <div class="detail-actions">
          <button class="button button--primary" type="button" id="edit-organization">Bearbeiten</button>
        </div>
      ` : ""}
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

  function renderOrganizationForm(organization) {
    const isCreate = state.organizationCreateMode;
    return `
      <form class="edit-form" id="organization-form">
        <div class="detail-top">
          <span class="avatar avatar-lg" aria-hidden="true">${isCreate ? "+" : escapeHtml(initials(organization.name))}</span>
          <div class="detail-title">
            <h2>${isCreate ? "Organisation anlegen" : escapeHtml(organization.name || "Organisation bearbeiten")}</h2>
            <p>${isCreate ? "Neue Cloud-SQL-Organisation" : "Bearbeitungsmodus"}</p>
          </div>
        </div>
        <div class="detail-actions">
          <button class="button button--primary" type="submit">${isCreate ? "Anlegen" : "Speichern"}</button>
          <button class="button button--secondary" type="button" id="cancel-organization-edit">Abbrechen</button>
        </div>
        <section class="detail-section">
          <h3>Stammdaten</h3>
          <div class="form-grid">
            ${inputField("name", "Name", organization.name)}
            ${inputField("sector", "Sektor", organization.sector)}
            ${inputField("organizationType", "Typ", organization.organizationType)}
            ${inputField("postalCode", "PLZ", organization.postalCode)}
            ${inputField("city", "Ort", organization.city)}
            ${inputField("state", "Bundesland", organization.state)}
          </div>
        </section>
        <section class="detail-section">
          <h3>Kontaktwege</h3>
          <div class="form-grid">
            ${inputField("website", "Website", organization.website)}
            ${inputField("email", "E-Mail", organization.email, "email")}
            ${inputField("phone", "Telefon", organization.phone)}
          </div>
        </section>
        <section class="detail-section">
          <h3>Notiz</h3>
          <div class="form-grid">
            ${textareaField("notes", "Notiz", organization.notes)}
          </div>
        </section>
      </form>
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

  function renderOrganizations() {
    elements.title.textContent = "Organisationen";
    elements.subtitle.textContent = API_MODE
      ? "Organisationen und Kontaktverteilung aus Cloud SQL."
      : "Organisationen und Kontaktverteilung aus dem Demo-Datenbestand.";
    const orgs = organizationItems().map((organization) => ({
      ...organization,
      contactCount: state.contacts.filter((contact) => contact.organizationId === organization.id && contact.status !== "archived").length
    }));
    const activeContactCount = state.contacts.filter((contact) => contact.status !== "archived").length;
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${orgs.length}</strong> Organisationen</span>
        <span class="metric"><strong>${activeContactCount}</strong> aktive Kontakte</span>
        ${API_MODE ? '<button class="button button--secondary" type="button" id="create-organization">Organisation anlegen</button>' : ""}
      </div>
      <div class="org-list">
        <div class="list-head" aria-hidden="true">
          <span>Organisation</span>
          <span>Sektor</span>
          <span>Bundesland</span>
          <span>Kontakte</span>
        </div>
        ${orgs.map((org) => `
          <button class="org-row" type="button" data-organization-id="${escapeHtml(org.id)}">
            <span>
              <strong>${escapeHtml(org.name)}</strong>
              <span>${escapeHtml([org.city, org.postalCode].filter(Boolean).join(" · "))}</span>
            </span>
            <span>${escapeHtml(org.sector || "Nicht hinterlegt")}</span>
            <span>${escapeHtml(org.state || "Nicht hinterlegt")}</span>
            <span><strong>${org.contactCount}</strong></span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderActivity() {
    elements.title.textContent = "Aktivität";
    elements.subtitle.textContent = API_MODE
      ? "Serverseitiger Änderungsverlauf für Bearbeitung und Ownerwechsel."
      : "Lokaler Änderungsverlauf für Demo-Bearbeitung und Ownerwechsel.";
    const rows = [...state.changes]
      .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
      .slice(0, 30);
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${state.changes.length}</strong> Änderungen</span>
        <span class="metric"><strong>${API_MODE ? "Cloud SQL" : ACTOR}</strong></span>
      </div>
      <div class="activity-panel">
        ${rows.map((change) => {
          const contact = state.contacts.find((item) => item.id === change.contactId);
          const field = change.fieldName ? fieldLabels[change.fieldName] || change.fieldName : "Kontakt";
          return `
            <div class="activity-row">
              <span>${escapeHtml(asDate(change.changedAt))}</span>
              <strong>${escapeHtml(contact?.name || "Demo-Kontakt")}</strong>
              <span>${escapeHtml(field)}: ${escapeHtml(displayValue(change.fieldName, change.newValue))}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMapView() {
    elements.title.textContent = "Karte";
    elements.subtitle.textContent = API_MODE
      ? "Original-Kartenmodus mit Kontakten aus Cloud SQL."
      : "Original-Kartenmodus mit denselben Demo-Kontakten.";
    elements.status.textContent = API_MODE ? "Original-Kartenmodus mit Cloud-SQL-Daten" : "Original-Kartenmodus mit Demo-Daten";
    saveState();
    elements.main.innerHTML = `
      <div class="map-frame-shell">
        <iframe
          class="map-frame"
          title="Versorgungs-Kompass Karten-Modus"
          src="/map/versorgungs-kompass-map.html?embed=1&demo=1"
          loading="eager"
        ></iframe>
      </div>
    `;
  }

  function renderOpsView() {
    elements.title.textContent = "Betrieb";
    elements.subtitle.textContent = API_MODE
      ? "Kompakter Status für die private Cloud-Run-Demo."
      : "Lokaler Demo-Status für den Browserstand.";
    if (!API_MODE) {
      const activeContacts = state.contacts.filter((contact) => contact.status !== "archived").length;
      elements.main.innerHTML = `
        <div class="summary-strip">
          <span class="metric"><strong>${activeContacts}</strong> lokale Kontakte</span>
          <span class="metric"><strong>${state.changes.length}</strong> lokale Änderungen</span>
        </div>
        <div class="activity-panel">
          <div class="activity-row">
            <span>Backend</span>
            <strong>localStorage</strong>
            <span>Kein Cloud-SQL-Betrieb aktiv.</span>
          </div>
        </div>
      `;
      elements.detail.innerHTML = '<div class="detail-empty">Betriebschecks sind in der GCP-Demo aktiv.</div>';
      return;
    }

    const summary = state.opsSummary;
    const counts = summary?.counts || {};
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${counts.activeContacts ?? "..."}</strong> aktive Kontakte</span>
        <span class="metric"><strong>${counts.archivedContacts ?? "..."}</strong> archiviert</span>
        <span class="metric"><strong>${counts.activeOrganizations ?? "..."}</strong> Organisationen</span>
        <span class="metric"><strong>${counts.changes ?? "..."}</strong> Änderungen</span>
      </div>
      <div class="summary-strip">
        <button class="button button--secondary" type="button" id="refresh-ops">Status aktualisieren</button>
        <button class="button button--secondary" type="button" id="download-export">JSON exportieren</button>
      </div>
      <div class="activity-panel">
        ${state.opsError ? `
          <div class="activity-row">
            <span>Status</span>
            <strong>Fehler</strong>
            <span>${escapeHtml(state.opsError)}</span>
          </div>
        ` : ""}
        <div class="activity-row">
          <span>Backend</span>
          <strong>${escapeHtml(summary?.backend || "Cloud SQL")}</strong>
          <span>${state.opsLoading ? "Status wird geladen ..." : "API erreichbar"}</span>
        </div>
        <div class="activity-row">
          <span>Letzte Änderung</span>
          <strong>${escapeHtml(asDate(summary?.lastChangeAt))}</strong>
          <span>Änderungsverlauf in Cloud SQL</span>
        </div>
        <div class="activity-row">
          <span>Revision</span>
          <strong>${escapeHtml(summary?.runtime?.revision || "Nicht geladen")}</strong>
          <span>${escapeHtml(summary?.runtime?.service || "Cloud Run")}</span>
        </div>
      </div>
    `;
    elements.detail.innerHTML = `
      <div class="detail-top">
        <span class="avatar avatar-lg" aria-hidden="true">GCP</span>
        <div class="detail-title">
          <h2>Betriebssicherheit</h2>
          <p>Step 5.2</p>
        </div>
      </div>
      <section class="detail-section">
        <h3>Aktiver Schutz</h3>
        <div class="meta-grid">
          ${detailRow("Backups", "Täglich, 7 Backups")}
          ${detailRow("PITR", "7 Tage")}
          ${detailRow("Deletion Protection", "Aktiv")}
        </div>
      </section>
      <section class="detail-section">
        <h3>Export</h3>
        <p class="muted">Der JSON-Export enthält Profile, Organisationen, Kontakte und Verlauf als Rückfallpunkt vor Importen oder größeren Tests.</p>
      </section>
    `;
    if (!summary && !state.opsLoading && !state.opsError) refreshOpsSummary();
  }

  function renderProfileView() {
    const profile = currentDemoProfile();
    const session = state.session || buildLocalSession();
    const profiles = profileItems().filter((item) => item.active !== false);
    const role = profile?.role || "editor";
    elements.title.textContent = "Mein Profil";
    elements.subtitle.textContent = API_MODE
      ? "Demo-Akteur und Rollenmodell aus Cloud SQL."
      : "Lokales Demo-Profil ohne zentrale Anmeldung.";
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
        <p class="muted">Schreibende Aktionen werden in Cloud SQL weiterhin dem Demo-Akteur zugeordnet. Diese Zuordnung ist fachlich sichtbar, aber noch keine echte Nutzeranmeldung.</p>
      </section>
      <section class="detail-section">
        <h3>Späterer Anschluss</h3>
        <div class="meta-grid">
          ${detailRow("SSO/IAP", "Offen")}
          ${detailRow("Nutzerverwaltung", "Nicht aktiv")}
          ${detailRow("Rechteprüfung", "Noch nicht erzwungen")}
        </div>
      </section>
    `;
  }

  function renderImportView() {
    elements.title.textContent = "Importe";
    elements.subtitle.textContent = API_MODE
      ? "Kontakte kontrolliert in Cloud SQL übernehmen."
      : "Lokaler Importentwurf für die spätere GCP-Demo.";
    const preview = state.importPreview;
    const summary = preview?.summary || {};
    const rows = Array.isArray(preview?.rows) ? preview.rows : [];
    const topMessages = [...(preview?.errors || []), ...(preview?.warnings || [])];
    const canCommit = API_MODE && preview?.canCommit && state.importExportConfirmed && !state.importLoading;
    elements.main.innerHTML = `
      <div class="summary-strip">
        <span class="metric"><strong>${summary.totalRows ?? "-"}</strong> Zeilen</span>
        <span class="metric"><strong>${summary.importableRows ?? "-"}</strong> importierbar</span>
        <span class="metric"><strong>${summary.skippedRows ?? "-"}</strong> Dubletten</span>
        <span class="metric"><strong>${summary.errorRows ?? "-"}</strong> Fehler</span>
        <span class="metric"><strong>${summary.newOrganizations ?? "-"}</strong> neue Organisationen</span>
      </div>
      <div class="import-workbench">
        <section class="import-section">
          <div class="import-section__head">
            <div>
              <h2>CSV-Import</h2>
              <p>${escapeHtml(state.importFileName || "Keine Datei ausgewählt")}</p>
            </div>
            <button class="button button--secondary" type="button" id="insert-import-sample">Beispiel einfügen</button>
          </div>
          <div class="form-grid">
            <label class="form-field">
              <span>Datei</span>
              <input class="input" type="file" id="import-file" accept=".csv,text/csv">
            </label>
            <label class="form-field">
              <span>CSV-Daten</span>
              <textarea class="textarea import-textarea" id="import-text" spellcheck="false">${escapeHtml(state.importText)}</textarea>
            </label>
          </div>
          ${state.importError ? `<div class="import-message import-message--error">${escapeHtml(state.importError)}</div>` : ""}
          ${topMessages.length ? `
            <div class="import-message import-message--warning">
              ${topMessages.map((message) => `<span>${escapeHtml(message)}</span>`).join("")}
            </div>
          ` : ""}
          <div class="import-actions">
            <button class="button button--secondary" type="button" id="preview-import" ${state.importLoading ? "disabled" : ""}>Vorschau prüfen</button>
            <button class="button button--secondary" type="button" id="download-before-import" ${API_MODE ? "" : "disabled"}>JSON exportieren</button>
            <label class="import-confirm">
              <input type="checkbox" id="confirm-import-export" ${state.importExportConfirmed ? "checked" : ""} ${API_MODE ? "" : "disabled"}>
              <span>Export liegt vor</span>
            </label>
            <button class="button button--primary" type="button" id="commit-import" ${canCommit ? "" : "disabled"}>Import übernehmen</button>
          </div>
        </section>
        <section class="import-section import-section--preview">
          <div class="import-section__head">
            <div>
              <h2>Vorschau</h2>
              <p>${preview ? `${escapeHtml(preview.headers?.length || 0)} erkannte Spalten` : "Noch nicht geprüft"}</p>
            </div>
            ${state.importLoading ? '<span class="badge">Lädt</span>' : ""}
          </div>
          ${state.importResult ? `
            <div class="import-message import-message--success">
              <span>${escapeHtml(state.importResult.importedContacts?.length || 0)} Kontakte importiert.</span>
              <span>Importlauf: ${escapeHtml(state.importResult.importRun?.id || "")}</span>
            </div>
          ` : ""}
          <div class="activity-panel import-preview-list">
            ${rows.length ? rows.slice(0, 30).map((row) => {
              const messages = [...(row.errors || []), ...(row.warnings || [])];
              return `
                <div class="activity-row import-preview-row">
                  <span>Zeile ${escapeHtml(row.rowNumber)}</span>
                  <strong>${escapeHtml(row.contact?.name || "Ohne Name")}</strong>
                  <span>${escapeHtml(row.contact?.organization || "Keine Organisation")}</span>
                  <span class="${importActionClass(row.action)}">${escapeHtml(importActionLabel(row.action))}</span>
                  ${messages.length ? `<small>${messages.map(escapeHtml).join(" · ")}</small>` : "<small>Bereit</small>"}
                </div>
              `;
            }).join("") : '<div class="empty-state">Noch keine Importvorschau vorhanden.</div>'}
          </div>
        </section>
      </div>
    `;
    elements.detail.innerHTML = `
      <div class="detail-top">
        <span class="avatar avatar-lg" aria-hidden="true">IM</span>
        <div class="detail-title">
          <h2>Import-Schutz</h2>
          <p>Step 5.4</p>
        </div>
      </div>
      <section class="detail-section">
        <h3>Grenzen</h3>
        <div class="meta-grid">
          ${detailRow("Modus", API_MODE ? "Cloud SQL" : "Lokal")}
          ${detailRow("Format", "CSV")}
          ${detailRow("Zeilen", `${summary.maxRows || 100} pro Lauf`)}
          ${detailRow("Schreiben", "Erst nach Vorschau")}
        </div>
      </section>
      <section class="detail-section">
        <h3>Importhistorie</h3>
        <div class="history-list">
          ${state.importRuns.length ? state.importRuns.slice(0, 6).map((run) => `
            <div class="history-item">
              <span class="history-dot" aria-hidden="true"></span>
              <div class="history-body">
                <strong>${escapeHtml(run.fileName || "CSV-Import")}</strong>
                <span>${escapeHtml(run.importedContacts || 0)} Kontakte · ${escapeHtml(asDate(run.createdAt))}</span>
              </div>
            </div>
          `).join("") : '<span class="muted">Noch keine abgeschlossenen Importe.</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Audit</h3>
        <p class="muted">Jeder übernommene Kontakt bekommt einen Importeintrag im Änderungsverlauf. Der Importlauf wird separat gespeichert.</p>
      </section>
    `;
    if (API_MODE && !state.importRunsLoaded && !state.importLoading) loadImportRuns();
  }

  function render() {
    document.querySelectorAll(".primary-tab").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.view === state.view);
    });
    elements.workspace?.classList.toggle("workspace--map", state.view === "map");
    if (state.view === "organizations") renderOrganizations();
    else if (state.view === "map") renderMapView();
    else if (state.view === "activity") renderActivity();
    else if (state.view === "ops") renderOpsView();
    else if (state.view === "profile") renderProfileView();
    else if (state.view === "imports") renderImportView();
    else renderContacts();
    if (state.view === "map") {
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
    const owner = document.getElementById("filter-owner");
    if (query) query.addEventListener("input", (event) => updateFilter("query", event.target.value));
    if (sector) sector.addEventListener("change", (event) => updateFilter("sector", event.target.value));
    if (stateSelect) stateSelect.addEventListener("change", (event) => updateFilter("state", event.target.value));
    if (owner) owner.addEventListener("change", (event) => updateFilter("ownerId", event.target.value));

    document.getElementById("refresh-ops")?.addEventListener("click", () => {
      state.opsError = "";
      refreshOpsSummary();
    });

    document.getElementById("download-export")?.addEventListener("click", () => {
      window.location.assign("/api/export");
    });

    document.getElementById("download-before-import")?.addEventListener("click", () => {
      window.location.assign("/api/export");
    });

    document.getElementById("insert-import-sample")?.addEventListener("click", () => {
      state.importText = sampleImportCsv();
      state.importFileName = "demo-import.csv";
      state.importPreview = null;
      state.importResult = null;
      state.importError = "";
      elements.status.textContent = "Importbeispiel eingefügt";
      render();
    });

    document.getElementById("import-file")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.importText = await fileToText(file);
        state.importFileName = file.name;
        state.importPreview = null;
        state.importResult = null;
        state.importError = "";
        elements.status.textContent = `${file.name} geladen`;
        render();
      } catch (error) {
        console.error(error);
        state.importError = error.message;
        elements.status.textContent = `Datei konnte nicht gelesen werden: ${error.message}`;
        render();
      }
    });

    document.getElementById("import-text")?.addEventListener("input", (event) => {
      state.importText = event.target.value;
      state.importPreview = null;
      state.importResult = null;
      state.importError = "";
    });

    document.getElementById("preview-import")?.addEventListener("click", previewImportCsv);

    document.getElementById("confirm-import-export")?.addEventListener("change", (event) => {
      state.importExportConfirmed = event.target.checked;
      render();
    });

    document.getElementById("commit-import")?.addEventListener("click", commitImportCsv);

    document.getElementById("create-contact")?.addEventListener("click", () => {
      state.createMode = true;
      state.editMode = false;
      renderDetail();
      attachDetailEvents();
    });

    document.getElementById("toggle-archived")?.addEventListener("click", () => {
      state.showArchived = !state.showArchived;
      state.editMode = false;
      state.createMode = false;
      const visible = filteredContacts();
      state.selectedId = visible[0]?.id || "";
      render();
    });

    document.getElementById("create-organization")?.addEventListener("click", () => {
      state.organizationCreateMode = true;
      state.organizationEditMode = false;
      renderDetail();
      attachDetailEvents();
    });

    document.querySelectorAll("[data-contact-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedId = button.dataset.contactId;
        state.editMode = false;
        state.createMode = false;
        saveState();
        render();
      });
    });

    document.querySelectorAll("[data-organization-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOrganizationId = button.dataset.organizationId;
        state.organizationCreateMode = false;
        state.organizationEditMode = false;
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
    document.getElementById("archive-contact")?.addEventListener("click", toggleArchiveContact);
    document.getElementById("remove-contact-image")?.addEventListener("click", removeContactImage);
    document.getElementById("cancel-edit")?.addEventListener("click", () => {
      state.editMode = false;
      renderDetail();
      attachDetailEvents();
    });
    document.getElementById("cancel-create")?.addEventListener("click", () => {
      state.createMode = false;
      renderDetail();
      attachDetailEvents();
    });
    document.getElementById("edit-organization")?.addEventListener("click", () => {
      state.organizationEditMode = true;
      state.organizationCreateMode = false;
      renderDetail();
      attachDetailEvents();
    });
    document.getElementById("cancel-organization-edit")?.addEventListener("click", () => {
      state.organizationEditMode = false;
      state.organizationCreateMode = false;
      renderDetail();
      attachDetailEvents();
    });
    document.getElementById("contact-form")?.addEventListener("submit", saveContactForm);
    document.getElementById("contact-create-form")?.addEventListener("submit", saveNewContactForm);
    document.getElementById("organization-form")?.addEventListener("submit", saveOrganizationForm);
    document.getElementById("contact-image-form")?.addEventListener("submit", saveContactImageForm);
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
      id: `local-${Date.now()}-${fieldName}-${Math.random().toString(16).slice(2)}`,
      contactId,
      action: "update",
      fieldName,
      oldValue,
      newValue,
      changedAt: new Date().toISOString(),
      changedBy: ACTOR
    });
  }

  async function saveContactForm(event) {
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

    if (API_MODE) {
      elements.status.textContent = "Speichere Änderung in Cloud SQL ...";
      try {
        const payload = await apiRequest(`/api/contacts/${encodeURIComponent(contact.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ contact: next })
        });
        if (payload.contact) {
          state.contacts = state.contacts.map((item) => (item.id === contact.id ? normalizeContact(payload.contact) : item));
        }
        if (Array.isArray(payload.changes)) {
          const otherChanges = state.changes.filter((change) => change.contactId !== contact.id);
          state.changes = [...payload.changes, ...otherChanges];
        }
        state.editMode = false;
        saveState();
        elements.status.textContent = `${changed.length} Änderung${changed.length === 1 ? "" : "en"} in Cloud SQL gespeichert`;
        render();
      } catch (error) {
        console.error(error);
        elements.status.textContent = `Speichern fehlgeschlagen: ${error.message}`;
      }
      return;
    }

    changed.forEach((field) => addChange(contact.id, field, contact[field] || "", next[field] || ""));
    next.updatedAt = new Date().toISOString();
    state.contacts = state.contacts.map((item) => (item.id === contact.id ? normalizeContact(next) : item));
    state.editMode = false;
    saveState();
    elements.status.textContent = `${changed.length} Demo-Änderung${changed.length === 1 ? "" : "en"} lokal gespeichert`;
    render();
  }

  async function saveNewContactForm(event) {
    event.preventDefault();
    if (!API_MODE) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      organizationId: String(form.get("organizationId") || "").trim(),
      contactRole: String(form.get("contactRole") || "").trim(),
      specialty: String(form.get("specialty") || "").trim(),
      priority: String(form.get("priority") || "Mittel").trim(),
      ownerId: String(form.get("ownerId") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      note: String(form.get("note") || "").trim(),
      nextStep: String(form.get("nextStep") || "").trim()
    };
    if (!payload.name) {
      elements.status.textContent = "Name ist erforderlich";
      return;
    }
    elements.status.textContent = "Lege Kontakt in Cloud SQL an ...";
    try {
      const result = await apiRequest("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ contact: payload })
      });
      state.selectedId = result.contact?.id || state.selectedId;
      state.createMode = false;
      await loadBackendState();
      elements.status.textContent = "Kontakt in Cloud SQL angelegt";
      render();
    } catch (error) {
      console.error(error);
      elements.status.textContent = `Anlegen fehlgeschlagen: ${error.message}`;
    }
  }

  async function toggleArchiveContact() {
    if (!API_MODE) return;
    const contact = currentContact();
    if (!contact) return;
    const nextStatus = contact.status === "archived" ? "active" : "archived";
    elements.status.textContent = nextStatus === "archived" ? "Archiviere Kontakt ..." : "Stelle Kontakt wieder her ...";
    try {
      const result = await apiRequest(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ contact: { status: nextStatus } })
      });
      await loadBackendState();
      state.selectedId = result.contact?.id || state.contacts.find((item) => item.status !== "archived")?.id || "";
      if (nextStatus === "archived" && !state.showArchived) {
        state.selectedId = state.contacts.find((item) => item.status !== "archived")?.id || "";
      }
      elements.status.textContent = nextStatus === "archived" ? "Kontakt archiviert" : "Kontakt wiederhergestellt";
      render();
    } catch (error) {
      console.error(error);
      elements.status.textContent = `Statuswechsel fehlgeschlagen: ${error.message}`;
    }
  }

  async function saveOrganizationForm(event) {
    event.preventDefault();
    if (!API_MODE) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      sector: String(form.get("sector") || "").trim(),
      organizationType: String(form.get("organizationType") || "").trim(),
      postalCode: String(form.get("postalCode") || "").trim(),
      city: String(form.get("city") || "").trim(),
      state: String(form.get("state") || "").trim(),
      website: String(form.get("website") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      notes: String(form.get("notes") || "").trim()
    };
    if (!payload.name) {
      elements.status.textContent = "Organisationsname ist erforderlich";
      return;
    }
    const isCreate = state.organizationCreateMode;
    const organization = currentOrganization();
    elements.status.textContent = isCreate ? "Lege Organisation in Cloud SQL an ..." : "Speichere Organisation in Cloud SQL ...";
    try {
      const result = await apiRequest(isCreate ? "/api/organizations" : `/api/organizations/${encodeURIComponent(organization.id)}`, {
        method: isCreate ? "POST" : "PATCH",
        body: JSON.stringify({ organization: payload })
      });
      state.selectedOrganizationId = result.organization?.id || state.selectedOrganizationId;
      state.organizationCreateMode = false;
      state.organizationEditMode = false;
      await loadBackendState();
      elements.status.textContent = isCreate ? "Organisation angelegt" : "Organisation gespeichert";
      render();
    } catch (error) {
      console.error(error);
      elements.status.textContent = `Organisation speichern fehlgeschlagen: ${error.message}`;
    }
  }

  async function refreshOpsSummary() {
    if (!API_MODE || state.opsLoading) return;
    state.opsLoading = true;
    elements.status.textContent = "Lade Betriebsstatus ...";
    try {
      state.opsSummary = await apiRequest("/api/ops/summary");
      state.opsError = "";
      elements.status.textContent = "Betriebsstatus geladen";
    } catch (error) {
      console.error(error);
      state.opsError = error.message;
      elements.status.textContent = `Betriebsstatus fehlgeschlagen: ${error.message}`;
    } finally {
      state.opsLoading = false;
      if (state.view === "ops") render();
    }
  }

  async function loadImportRuns({ force = false } = {}) {
    if (!API_MODE || (!force && state.importRunsLoaded)) return;
    try {
      const payload = await apiRequest("/api/import/runs");
      state.importRuns = Array.isArray(payload.items) ? payload.items : [];
      state.importRunsLoaded = true;
      if (state.view === "imports") render();
    } catch (error) {
      console.error(error);
      state.importRunsLoaded = true;
      state.importError = error.message;
      if (state.view === "imports") render();
    }
  }

  async function previewImportCsv() {
    if (!API_MODE) {
      state.importError = "Die Vorschau schreibt später gegen die GCP-API. Lokal ist nur der Entwurf sichtbar.";
      elements.status.textContent = "Importvorschau benötigt die GCP-API";
      render();
      return;
    }
    if (!state.importText.trim()) {
      state.importError = "Bitte CSV-Daten einfügen oder eine CSV-Datei wählen.";
      elements.status.textContent = "CSV fehlt";
      render();
      return;
    }
    state.importLoading = true;
    state.importError = "";
    state.importResult = null;
    elements.status.textContent = "Prüfe Importvorschau ...";
    render();
    try {
      state.importPreview = await apiRequest("/api/import/preview", {
        method: "POST",
        body: JSON.stringify({
          csvText: state.importText,
          fileName: state.importFileName || "kontakt-import.csv"
        })
      });
      const count = state.importPreview.summary?.importableRows || 0;
      elements.status.textContent = `${count} Kontakt${count === 1 ? "" : "e"} importierbar`;
    } catch (error) {
      console.error(error);
      state.importError = error.message;
      elements.status.textContent = `Importvorschau fehlgeschlagen: ${error.message}`;
    } finally {
      state.importLoading = false;
      if (state.view === "imports") render();
    }
  }

  async function commitImportCsv() {
    if (!API_MODE || !state.importPreview?.canCommit) return;
    if (!state.importExportConfirmed) {
      state.importError = "Bitte vor dem Import den JSON-Export bestätigen.";
      elements.status.textContent = "Export-Bestätigung fehlt";
      render();
      return;
    }
    state.importLoading = true;
    state.importError = "";
    elements.status.textContent = "Übernehme Import in Cloud SQL ...";
    render();
    try {
      const result = await apiRequest("/api/import/commit", {
        method: "POST",
        body: JSON.stringify({
          csvText: state.importText,
          fileName: state.importFileName || "kontakt-import.csv",
          exportConfirmed: true
        })
      });
      state.importResult = result;
      state.importPreview = result.preview || state.importPreview;
      state.importExportConfirmed = false;
      state.importRunsLoaded = false;
      state.opsSummary = null;
      await loadBackendState();
      await loadImportRuns({ force: true });
      state.selectedId = result.importedContacts?.[0]?.id || state.selectedId;
      elements.status.textContent = `${result.importedContacts?.length || 0} Kontakt${result.importedContacts?.length === 1 ? "" : "e"} importiert`;
    } catch (error) {
      console.error(error);
      state.importError = error.message;
      elements.status.textContent = `Import fehlgeschlagen: ${error.message}`;
    } finally {
      state.importLoading = false;
      if (state.view === "imports") render();
    }
  }

  async function saveContactImageForm(event) {
    event.preventDefault();
    if (!API_MODE) return;
    const contact = currentContact();
    const fileInput = event.currentTarget.elements.file;
    const file = fileInput?.files?.[0];
    if (!contact || !file) {
      elements.status.textContent = "Bitte zuerst eine Bilddatei auswählen";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type)) {
      elements.status.textContent = "Erlaubt sind JPEG, PNG, WebP oder SVG";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      elements.status.textContent = "Bild ist zu groß. Maximum: 2 MB";
      return;
    }
    elements.status.textContent = "Lade Bild in Cloud Storage hoch ...";
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await apiRequest(`/api/contacts/${encodeURIComponent(contact.id)}/image`, {
        method: "POST",
        body: JSON.stringify({
          dataUrl,
          contentType: file.type,
          fileName: file.name,
          imageSourceLabel: String(event.currentTarget.elements.imageSourceLabel?.value || "").trim(),
          imageRightsNote: String(event.currentTarget.elements.imageRightsNote?.value || "").trim()
        })
      });
      await loadBackendState();
      state.selectedId = result.contact?.id || contact.id;
      elements.status.textContent = "Bild in Cloud Storage gespeichert";
      render();
    } catch (error) {
      console.error(error);
      elements.status.textContent = `Bildupload fehlgeschlagen: ${error.message}`;
    }
  }

  async function removeContactImage() {
    if (!API_MODE) return;
    const contact = currentContact();
    if (!contact) return;
    elements.status.textContent = "Entferne Kontaktbild ...";
    try {
      const result = await apiRequest(`/api/contacts/${encodeURIComponent(contact.id)}/image`, {
        method: "DELETE"
      });
      await loadBackendState();
      state.selectedId = result.contact?.id || contact.id;
      elements.status.textContent = "Kontaktbild entfernt";
      render();
    } catch (error) {
      console.error(error);
      elements.status.textContent = `Bild konnte nicht entfernt werden: ${error.message}`;
    }
  }

  async function cycleOwner() {
    const contact = currentContact();
    const owners = profileItems().filter((profile) => profile.active !== false);
    if (!contact || !owners.length) return;
    const currentIndex = owners.findIndex((profile) => profile.id === contact.ownerId);
    const nextOwner = owners[(currentIndex + 1) % owners.length];
    if (API_MODE) {
      elements.status.textContent = "Speichere Ownerwechsel in Cloud SQL ...";
      try {
        const payload = await apiRequest(`/api/contacts/${encodeURIComponent(contact.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ contact: { ownerId: nextOwner.id } })
        });
        if (payload.contact) {
          state.contacts = state.contacts.map((item) => (item.id === contact.id ? normalizeContact(payload.contact) : item));
        }
        if (Array.isArray(payload.changes)) {
          const otherChanges = state.changes.filter((change) => change.contactId !== contact.id);
          state.changes = [...payload.changes, ...otherChanges];
        }
        saveState();
        elements.status.textContent = `Owner auf ${nextOwner.display_name} gesetzt`;
        render();
      } catch (error) {
        console.error(error);
        elements.status.textContent = `Ownerwechsel fehlgeschlagen: ${error.message}`;
      }
      return;
    }
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
        state.createMode = false;
        state.organizationCreateMode = false;
        state.organizationEditMode = false;
        state.opsError = "";
        render();
      });
    });

    document.getElementById("sidebar-demo-status")?.addEventListener("click", () => {
      state.view = "ops";
      state.editMode = false;
      state.createMode = false;
      state.organizationCreateMode = false;
      state.organizationEditMode = false;
      state.opsError = "";
      render();
    });

    elements.reset.addEventListener("click", async () => {
      if (API_MODE) {
        elements.status.textContent = "Setze Cloud-SQL-Demo zurück ...";
        try {
          await apiRequest("/api/reset-demo", { method: "POST", body: "{}" });
          await loadBackendState();
          state.editMode = false;
          state.createMode = false;
          state.organizationCreateMode = false;
          state.organizationEditMode = false;
          state.opsSummary = null;
          state.opsError = "";
          state.importRunsLoaded = false;
          state.importRuns = [];
          clearImportDraft();
          state.view = "contacts";
          elements.status.textContent = "Cloud-SQL-Demo zurückgesetzt";
          render();
        } catch (error) {
          console.error(error);
          elements.status.textContent = `Zurücksetzen fehlgeschlagen: ${error.message}`;
        }
        return;
      }
      window.localStorage.removeItem(CONTACTS_KEY);
      window.localStorage.removeItem(CHANGES_KEY);
      window.localStorage.removeItem(SELECTED_KEY);
      loadState();
      state.editMode = false;
      state.createMode = false;
      state.organizationCreateMode = false;
      state.organizationEditMode = false;
      state.opsSummary = null;
      state.opsError = "";
      state.importRunsLoaded = false;
      state.importRuns = [];
      clearImportDraft();
      state.view = "contacts";
      elements.status.textContent = "Demo-Daten zurückgesetzt";
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

  async function start() {
    await loadState();
    if (API_MODE) {
      const statusButton = document.getElementById("sidebar-demo-status");
      const statusTitle = statusButton?.querySelector("strong");
      const statusHint = statusButton?.querySelector("span:last-child");
      if (statusTitle) statusTitle.textContent = "GCP Demo";
      if (statusHint) statusHint.textContent = "Cloud SQL Backend";
    }
    attachGlobalEvents();
    render();
  }

  start();
})();
