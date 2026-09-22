(() => {
  "use strict";
  const { snapshot, assets, refreshStatus } = JSON.parse(document.getElementById("offline-data").textContent);
  const $ = (id) => document.getElementById(id);
  const number = (value) => Number(value || 0).toLocaleString("de-DE");
  const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("de-DE");
  const canonical = (value) => String(value).replace(/^public\./, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replaceAll("-", "_").toLowerCase();
  const titles = {
    contacts: "Kontakte", organizations: "Organisationen", organization_primary_systems: "Primärsysteme",
    contact_notes: "Gesprächsnotizen", contact_note_attachments: "Notizanhänge", contact_history: "Kontakthistorie",
    contact_histories: "Kontakthistorien", contact_changes: "Kontaktänderungen", contact_change_log: "Kontaktänderungen", changes: "Kontaktänderungen",
    expert_groups: "Expertengruppen", expert_contacts: "Expertinnen und Experten", expert_organizations: "Expertenorganisationen", expert_entity_links: "Expertenverknüpfungen",
    stakeholder_types: "Stakeholder-Gruppen", stakeholder_organizations: "Stakeholder-Organisationen", stakeholder_people: "Stakeholder-Personen",
    hospitations: "Hospitationen", hospitation_slots: "Freie Termine", hospitation_observations: "Beobachtungen", hospitation_observation_history: "Beobachtungshistorie", hospitation_observation_changes: "Beobachtungsänderungen",
    hospitation_request_notes: "Hospitationsnotizen", hospitation_request_messages: "Terminnachrichten",
    roadmap_items: "Roadmap-Themen", hospitation_roadmap_assessments: "Roadmap-Einschätzungen", hospitation_unmet_needs: "Offene Bedarfe",
    formats: "Formate", format_participants: "Formatteilnahmen", format_contacts: "Formatkontakte", format_history: "Formathistorie",
    activity_events: "Aktivitäten", activities: "Aktivitäten", activity_history: "Aktivitätsverlauf", audit_log: "Änderungsprotokoll", audit_logs: "Änderungsprotokolle",
    profiles: "Teamprofile", profile: "Eigenes Profil", user_settings: "Persönliche Einstellungen", saved_views: "Gespeicherte Ansichten",
    notifications: "Benachrichtigungen", notification_events: "Benachrichtigungsereignisse", notification_recipients: "Benachrichtigungsempfänger", network_registrations: "Netzwerk-Anmeldungen", politics: "Politik", health_committee: "Gesundheitsausschuss", bundestag_health_committee: "Gesundheitsausschuss",
    politics_health_committee: "Gesundheitsausschuss", politics_snapshot: "Politik-Snapshot", imports: "Importe", import_runs: "Importverlauf",
    contact_owners: "Kontaktzuständigkeiten", organization_owners: "Organisationszuständigkeiten", hospitation_owners: "Hospitationszuständigkeiten"
  };
  const fieldLabels = {
    id: "Kennung", name: "Name", display_name: "Anzeigename", first_name: "Vorname", last_name: "Nachname", full_name: "Vollständiger Name",
    title: "Titel", salutation: "Anrede", academic_title: "Akademischer Titel", role: "Rolle", contact_role: "Funktion", job_title: "Position",
    organization: "Organisation", organization_name: "Organisation", organization_id: "Organisation", contact_id: "Kontakt", contact_name: "Kontakt",
    expert_contact_id: "Expertenkontakt", expert_organization_id: "Expertenorganisation", expert_group_id: "Expertengruppe", group_id: "Gruppe",
    stakeholder_type_id: "Stakeholder-Gruppe", stakeholder_type: "Stakeholder-Gruppe", stakeholder_organization_id: "Stakeholder-Organisation",
    owner: "Verantwortlich", owner_id: "Verantwortliches Teammitglied", owner_ids: "Zuständige Teammitglieder", owners: "Zuständigkeiten",
    user_id: "Nutzerprofil", profile_id: "Teamprofil", team: "Team", email: "E-Mail", phone: "Telefon", mobile: "Mobiltelefon", linkedin: "LinkedIn",
    website: "Website", url: "Link", profile_url: "Profilseite", city: "Ort", state: "Bundesland", federal_state: "Bundesland", postal_code: "Postleitzahl",
    street: "Straße", address: "Adresse", location: "Ort / Standort", country: "Land", latitude: "Breitengrad", longitude: "Längengrad",
    sector: "Sektor", category: "Kategorie", specialty: "Fachrichtung", organization_type: "Organisationstyp", priority: "Priorität", status: "Status",
    themes: "Themen", topics: "Themen", tags: "Schlagworte", note: "Notiz", notes: "Notizen", description: "Beschreibung", summary: "Zusammenfassung",
    content: "Inhalt", text: "Text", body: "Inhalt", message: "Nachricht", source: "Quelle", sources: "Quellen", source_url: "Quellenlink", source_label: "Quellenbezeichnung",
    created_at: "Angelegt am", updated_at: "Aktualisiert am", deleted_at: "Gelöscht am", archived_at: "Archiviert am", created_by: "Angelegt von", updated_by: "Aktualisiert von",
    image: "Bild", image_url: "Bildlink", image_kind: "Bildart", image_storage_path: "Gespeicherter Bildpfad", image_source_url: "Bildquelle", image_source_label: "Bildquelle", image_rights_note: "Bildrechte",
    avatar_url: "Profilbild", avatar_source_url: "Profilbildquelle", avatar_source_label: "Profilbildquelle", logo_url: "Logo", logo_source_url: "Logoquelle", logo_source_label: "Logoquelle",
    image_mime_type: "Bildformat", image_file_size: "Bildgröße", image_width: "Bildbreite", image_height: "Bildhöhe", image_updated_at: "Bild aktualisiert am", image_updated_by: "Bild aktualisiert von",
    hospitation_id: "Hospitation", slot_id: "Terminangebot", scheduled_on: "Hospitationstag", starts_at: "Beginn", ends_at: "Ende", start_date: "Beginn", end_date: "Ende",
    goal: "Ziel", request_note: "Anfrage / Notiz", documentation_summary: "Dokumentation", documentation_outcome: "Ergebnis", documented_at: "Dokumentiert am",
    follow_up_note: "Nächster Schritt", follow_up_owner_id: "Verantwortlich für Folgeschritt", follow_up_due_at: "Fällig am",
    observation_id: "Beobachtung", sequence: "Reihenfolge", situation: "Situation", situation_context: "Kontext", observed: "Beobachtung", observed_at: "Beobachtet am",
    immediate_consequence: "Unmittelbare Folge", process_phase: "Prozessphase", problem_type: "Problemart", impact: "Auswirkung", observation_type: "Beobachtungsart",
    evidence_type: "Belegart", relevance_score: "Relevanz", usage_recommendation: "Verwendungsempfehlung", next_use: "Nächste Verwendung",
    involved_roles: "Beteiligte Rollen", affected_roles: "Betroffene Rollen", affected_products: "Betroffene Produkte", source_type: "Quellentyp", source_reference: "Belegstelle",
    uncertainty: "Unsicherheit", limitations: "Grenzen der Aussage", setting_type: "Versorgungssetting", internal_use_allowed: "Interne Nutzung freigegeben", external_use_allowed: "Externe Nutzung freigegeben",
    roadmap_item_id: "Roadmap-Thema", assessment: "Einschätzung", rationale: "Begründung", confidence: "Sicherheit", need: "Bedarf", unmet_need: "Offener Bedarf",
    format_id: "Format", format_name: "Format", format_type: "Formatart", participants: "Teilnehmende", participant_role: "Teilnahmerolle", invitation_status: "Einladungsstatus",
    invited_at: "Eingeladen am", confirmed_at: "Bestätigt am", attended: "Teilgenommen", capacity: "Kapazität", agenda: "Agenda",
    note_id: "Gesprächsnotiz", attachment_id: "Anhang", file_name: "Dateiname", filename: "Dateiname", file_size: "Dateigröße", mime_type: "Dateityp", storage_path: "Dateipfad",
    extracted_text: "Dokumentinhalt", extraction_status: "Texterkennung", extraction_error: "Hinweis zur Texterkennung", attachment_count: "Anzahl Anhänge",
    event_key: "Ereignis", category_key: "Kategorie", action_key: "Aktion", object_type: "Objektart", object_id: "Bezugsdatensatz", actor_id: "Ausgelöst von", actor_name: "Ausgelöst von",
    before: "Vorher", after: "Nachher", changes: "Änderungen", payload: "Fachlicher Inhalt", details: "Details", metadata: "Zusatzangaben", data: "Daten", occurred_at: "Zeitpunkt",
    consent: "Einwilligung", consent_status: "Einwilligungsstatus", consent_at: "Einwilligung am", consent_source: "Einwilligungsquelle",
    member_count: "Mitgliederzahl", member_count_scope: "Bezug der Mitgliederzahl", member_count_source_url: "Quelle der Mitgliederzahl", member_count_source_label: "Quelle der Mitgliederzahl", member_count_updated_at: "Mitgliederzahl aktualisiert am",
    system_type: "Systemtyp", product_name: "Produktname", vendor: "Hersteller", version: "Version", system_name: "System", provider: "Anbieter",
    preferences: "Präferenzen", filters: "Filter", view_type: "Ansicht", query: "Suchanfrage", is_default: "Standardansicht", is_read: "Gelesen", read_at: "Gelesen am",
    exported_at: "Sicherungszeitpunkt", source_url: "Quelle", schema_version: "Datenformat-Version", counts: "Datensatzanzahlen", completeness: "Vollständigkeit",
    files: "Dateien", assets: "Gesicherte Dateien", missing: "Fehlende Einträge", warnings: "Hinweise", errors: "Fehler", complete: "Vollständig", successful: "Erfolgreich", success: "Erfolgreich",
    refresh_status: "Aktualisierung", external_sources: "Externe Quellen", table: "Tabelle", record_id: "Datensatz", field: "Feld", relative_path: "Lokaler Dateipfad", size: "Dateigröße in Bytes", sha256: "Prüfsumme (SHA-256)",
    database_complete: "Alle Fachdaten gesichert", private_assets_complete: "Alle gespeicherten Dateien gesichert", expected_private_asset_count: "Erwartete gespeicherte Dateien", captured_private_asset_count: "Gesicherte gespeicherte Dateien", external_images_captured: "Zusätzlich gesicherte externe Bilder", external_references_preserved: "Webverweise ohne lokale Bilddatei", external_asset_results: "Externe Bildquellen", unavailable_references: "Webverweise ohne lokale Bilddatei",
    started_at: "Begonnen am", finished_at: "Abgeschlossen am", checked_at: "Geprüft am", captured_at: "Erfasst am", source: "Quelle", tables: "Tabellen", rows: "Datensätze"
  };
  function words(value) {
    const result = canonical(value).replaceAll("_", " ");
    return result ? result[0].toUpperCase() + result.slice(1) : "Wert";
  }
  const label = (key) => fieldLabels[canonical(key)] || words(key);
  const tableLabel = (key) => titles[canonical(key)] || words(key);
  function groupFor(table) {
    const key = canonical(table);
    if (/^(hospitation|roadmap)/.test(key)) return "Hospitations-Kompass";
    if (/^(expert|stakeholder|politic|health_committee|bundestag)/.test(key)) return "Stakeholder-Kompass";
    if (/^format/.test(key)) return "Format-Kompass";
    if (/^(contact|organization|network_registration)/.test(key)) return "Versorgungs-Kompass";
    if (/^(activity|activities|audit|import|changes)/.test(key)) return "Verlauf und Importe";
    if (/^(profile|user_setting|saved_view|notification)/.test(key)) return "Team und Einstellungen";
    return "Weitere Daten";
  }
  const groups = ["Versorgungs-Kompass", "Stakeholder-Kompass", "Hospitations-Kompass", "Format-Kompass", "Verlauf und Importe", "Team und Einstellungen", "Weitere Daten"];
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function button(text, action, className = "") {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function humanDate(value, withTime = true) {
    if (!value) return "Nicht hinterlegt";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: "Europe/Berlin" }).format(date);
  }
  const rows = [];
  const tablePriority = ["contacts", "organizations", "contact_notes", "contact_note_attachments", "organization_primary_systems", "stakeholder_people", "stakeholder_organizations", "hospitations", "hospitation_observations", "formats"];
  const tableOrder = (table) => tablePriority.includes(canonical(table)) ? tablePriority.indexOf(canonical(table)) : 100;
  const tables = Object.keys(snapshot.data).sort((a, b) => groups.indexOf(groupFor(a)) - groups.indexOf(groupFor(b)) || tableOrder(a) - tableOrder(b) || tableLabel(a).localeCompare(tableLabel(b), "de"));
  const byTable = new Map();
  const byId = new Map();
  const reverseRelations = new Map();
  function get(record, ...keys) {
    if (!record || typeof record !== "object") return "";
    for (const key of keys) {
      const actual = Object.keys(record).find((candidate) => canonical(candidate) === canonical(key));
      const value = actual === undefined ? undefined : record[actual];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }
  function entryTitle(row, index = 0) {
    if (typeof row !== "object" || row === null) return String(row);
    const explicit = get(row, "name", "display_name", "full_name", "title", "file_name", "format_name", "contact_name", "organization_name", "subject", "product_name", "event_key");
    if (explicit) return String(explicit);
    const personName = [get(row, "first_name"), get(row, "last_name")].filter(Boolean).join(" ");
    if (personName) return personName;
    const nested = get(row, "payload", "data");
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedTitle = get(nested, "name", "title", "contact_name", "organization_name", "subject");
      if (nestedTitle) return String(nestedTitle);
    }
    const summary = get(row, "observed", "summary", "note", "notes", "description", "text", "message");
    if (typeof summary === "string" && summary.trim()) return summary.trim().slice(0, 110) + (summary.length > 110 ? " …" : "");
    return String(get(row, "email") || `Datensatz ${index + 1}`);
  }
  function indexReferences(value, owner, key = "", depth = 0) {
    if (depth > 20 || value === null || value === undefined) return;
    if (typeof value === "string" && /(^|_)(id|ids)$/.test(canonical(key)) && canonical(key) !== "id") {
      if (!reverseRelations.has(value)) reverseRelations.set(value, new Set());
      reverseRelations.get(value).add(owner);
    } else if (Array.isArray(value)) value.forEach((item) => indexReferences(item, owner, key, depth + 1));
    else if (typeof value === "object") Object.entries(value).forEach(([childKey, child]) => indexReferences(child, owner, childKey, depth + 1));
  }
  for (const table of tables) {
    const entries = snapshot.data[table].map((record, index) => {
      const entry = { table, record, index, title: entryTitle(record, index), id: String(get(record, "id") || "") };
      entry.searchText = normalize(`${tableLabel(table)} ${table} ${entry.title} ${JSON.stringify(record)}`);
      rows.push(entry);
      if (entry.id) {
        if (!byId.has(entry.id)) byId.set(entry.id, []);
        byId.get(entry.id).push(entry);
      }
      indexReferences(record, entry);
      return entry;
    });
    byTable.set(table, entries);
  }
  const assetByRecord = new Map();
  const missingExternalByRecord = new Map();
  const unavailableReferences = snapshot.externalAssetResults?.unavailableReferences
    || snapshot.completeness?.externalAssetResults?.unavailableReferences
    || snapshot.externalSources?.unavailableReferences || [];
  for (const reference of Array.isArray(unavailableReferences) ? unavailableReferences : []) {
    const key = `${canonical(reference.table)}:${reference.recordId}`;
    if (!missingExternalByRecord.has(key)) missingExternalByRecord.set(key, []);
    missingExternalByRecord.get(key).push(reference);
  }
  function localAssetPath(path) {
    return typeof path === "string" && /^assets\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) && !path.includes("..") ? path : null;
  }
  for (const asset of assets) {
    if (!asset || !localAssetPath(asset.relativePath)) continue;
    const key = `${canonical(asset.table)}:${asset.recordId}`;
    if (!assetByRecord.has(key)) assetByRecord.set(key, []);
    assetByRecord.get(key).push(asset);
  }
  let activeTable = null;
  let currentPage = 1;
  let pageSize = 30;
  let query = "";
  let currentEntry = null;
  let detailHistory = [];
  let searchTimer;
  function setView(table) {
    clearTimeout(searchTimer);
    activeTable = table;
    currentPage = 1;
    query = "";
    $("search").value = "";
    $("clear-search").hidden = true;
    document.querySelector(".sidebar").classList.remove("menu-open");
    $("mobile-menu").setAttribute("aria-expanded", "false");
    $("mobile-menu").textContent = "Bereiche anzeigen";
    render();
    $("view-title").scrollIntoView({ block: "nearest" });
  }
  function renderNavigation() {
    const navigation = $("navigation");
    navigation.replaceChildren();
    const overview = button("Übersicht", () => setView(null), "nav-button");
    overview.dataset.table = "";
    navigation.append(overview);
    for (const group of groups) {
      const members = tables.filter((table) => groupFor(table) === group);
      if (!members.length) continue;
      navigation.append(element("p", "nav-heading", group));
      for (const table of members) {
        const navButton = button("", () => setView(table), "nav-button");
        navButton.dataset.table = table;
        navButton.append(element("span", "", tableLabel(table)), element("span", "nav-count", number(byTable.get(table).length)));
        navigation.append(navButton);
      }
    }
  }
  function renderStats(target) {
    const stats = element("div", "stats");
    const fileCount = new Set(assets.map(asset => asset.relativePath)).size;
    for (const [value, name] of [[rows.length, "Datensätze"], [tables.length, "Datenbereiche"], [fileCount, "Lokale Dateien"]]) {
      const stat = element("div", "stat");
      stat.append(element("strong", "", number(value)), element("span", "", name));
      stats.append(stat);
    }
    target.append(stats);
  }
  function renderOverview(target) {
    renderStats(target);
    const note = element("div", "snapshot-note");
    note.append(element("p", "", "Die Daten dieser Sicherung liegen in diesem Ordner. Suche und Detailansichten funktionieren auch ohne Internet."));
    const completeness = snapshot.completeness || {};
    if (completeness.databaseComplete === true && completeness.privateAssetsComplete === true) {
      let coverage = "Alle Fachdaten und in der Anwendung gespeicherten Dateien sind gesichert.";
      if (Number(completeness.externalImagesCaptured)) coverage += ` ${number(completeness.externalImagesCaptured)} externe Bilder wurden zusätzlich gespeichert.`;
      if (Number(completeness.externalReferencesPreserved)) coverage += ` ${number(completeness.externalReferencesPreserved)} Webverweise bleiben ohne lokale Bilddatei erhalten.`;
      note.append(element("p", "small", coverage));
    }
    note.append(element("p", "small", "Die Kopie zeigt den Sicherungszeitpunkt oben. Spätere Änderungen der Online-Anwendung erscheinen erst nach einer neuen Sicherung."));
    note.append(element("p", "small", "Aktualisieren: Öffne in deinem Programme-Ordner „Versorgungs-Kompass aktualisieren“."));
    if (snapshot.refreshScheduleDescription) note.append(element("p", "small", snapshot.refreshScheduleDescription));
    if (refreshStatus?.message) note.append(element("p", "small", String(refreshStatus.message)));
    if (snapshot.completeness?.complete === false || snapshot.completeness === false) {
      note.append(element("p", "small", "Diese Sicherung ist als unvollständig gekennzeichnet. Die verfügbaren Daten bleiben lesbar; fehlende Bestandteile stehen unter Sicherungsdetails."));
    }
    target.append(note);
    target.append(element("h2", "section-heading", "Gespeicherte Bereiche"));
    const domainList = element("div", "domain-list");
    for (const group of groups) {
      const members = tables.filter((table) => groupFor(table) === group);
      if (!members.length) continue;
      const count = members.reduce((total, table) => total + byTable.get(table).length, 0);
      const card = button("", () => setView(members.find((table) => byTable.get(table).length) || members[0]), "domain-card");
      card.append(element("strong", "", group), element("span", "", `${number(count)} Datensätze · ${number(members.length)} Bereiche`), element("span", "", members.map(tableLabel).join(" · ")));
      domainList.append(card);
    }
    target.append(domainList);
    const manifest = element("details", "manifest");
    manifest.append(element("summary", "", "Sicherungsdetails und Vollständigkeit"));
    const metadata = { exportedAt: snapshot.exportedAt, sourceUrl: snapshot.sourceUrl, schemaVersion: snapshot.schemaVersion };
    if (snapshot.completeness !== undefined) metadata.completeness = snapshot.completeness;
    if (snapshot.counts !== undefined) metadata.counts = snapshot.counts;
    if (snapshot.externalSources !== undefined) metadata.externalSources = snapshot.externalSources;
    if (assets.length) metadata.assets = assets;
    if (refreshStatus && Object.keys(refreshStatus).length) metadata.refreshStatus = refreshStatus;
    for (const [key, value] of Object.entries(snapshot)) {
      if (!["data", "exportedAt", "sourceUrl", "schemaVersion", "completeness", "counts", "externalSources"].includes(key)) metadata[key] = value;
    }
    manifest.append(renderFields(metadata));
    target.append(manifest);
  }
  function recordExcerpt(entry) {
    const nested = get(entry.record, "payload", "data");
    const row = nested && typeof nested === "object" && !Array.isArray(nested) ? { ...entry.record, ...nested } : entry.record;
    const values = [get(row, "organization_name", "organization"), get(row, "city", "location"), get(row, "sector", "category"), get(row, "email"), get(row, "scheduled_on", "starts_at")].filter((value) => value && typeof value !== "object");
    if (values.length) return [...new Set(values.map(String))].join(" · ");
    const text = get(row, "description", "summary", "notes", "note", "text", "observed", "source_reference");
    return typeof text === "string" && text ? text.replace(/\s+/g, " ").slice(0, 220) : "Alle gespeicherten Felder öffnen";
  }
  function renderResults(target, entries) {
    const heading = element("div", "result-heading");
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    heading.append(element("p", "small muted", `${number(entries.length)} ${entries.length === 1 ? "Datensatz" : "Datensätze"}${query ? " gefunden" : " gespeichert"}`));
    const sizeLabel = element("label", "small muted", "Pro Seite ");
    const select = element("select");
    select.setAttribute("aria-label", "Datensätze pro Seite");
    for (const size of [30, 60, 120]) {
      const option = element("option", "", size);
      option.value = String(size);
      option.selected = size === pageSize;
      select.append(option);
    }
    select.addEventListener("change", () => { pageSize = Number(select.value); currentPage = 1; render(); });
    sizeLabel.append(select);
    heading.append(sizeLabel);
    target.append(heading);
    if (!entries.length) {
      target.append(element("div", "empty", query ? "Keine passenden Datensätze. Versuche einen anderen Namen oder Suchbegriff." : "In diesem Bereich sind keine Datensätze gespeichert."));
      return;
    }
    const list = element("div", "records");
    list.setAttribute("role", "list");
    for (const entry of entries.slice((currentPage - 1) * pageSize, currentPage * pageSize)) {
      const row = button("", () => openRecord(entry), "record-row");
      row.setAttribute("aria-label", `${entry.title} – ${tableLabel(entry.table)} öffnen`);
      const main = element("span", "record-main");
      main.append(element("span", "record-name", entry.title), element("span", "record-excerpt", recordExcerpt(entry)));
      const date = get(entry.record, "updated_at", "created_at", "occurred_at");
      row.append(main, element("span", "record-table", tableLabel(entry.table)), element("span", "record-meta", date ? humanDate(date, false) : String(get(entry.record, "status") || "")), element("span", "record-arrow", "›"));
      const item = element("div");
      item.setAttribute("role", "listitem");
      item.append(row);
      list.append(item);
    }
    target.append(list);
    const pagination = element("div", "pagination");
    pagination.append(element("span", "small muted", `${number((currentPage - 1) * pageSize + 1)}–${number(Math.min(currentPage * pageSize, entries.length))} von ${number(entries.length)}`));
    const controls = element("div", "pagination-controls");
    const previous = button("Zurück", () => { currentPage -= 1; render(); });
    previous.disabled = currentPage <= 1;
    const next = button("Weiter", () => { currentPage += 1; render(); });
    next.disabled = currentPage >= totalPages;
    controls.append(previous, element("span", "small", `Seite ${number(currentPage)} / ${number(totalPages)}`), next);
    pagination.append(controls);
    target.append(pagination);
  }
  function render() {
    const content = $("content");
    content.replaceChildren();
    for (const navButton of document.querySelectorAll(".nav-button")) {
      if (!query && navButton.dataset.table === (activeTable || "")) navButton.setAttribute("aria-current", "page");
      else navButton.removeAttribute("aria-current");
    }
    $("view-title").textContent = query ? "Suchergebnisse" : activeTable ? tableLabel(activeTable) : "Übersicht";
    $("view-description").textContent = query ? `Suche in allen ${number(tables.length)} gespeicherten Bereichen.` : activeTable ? groupFor(activeTable) : "Deine Daten aus dem Versorgungs-Kompass, lokal und jederzeit lesbar.";
    if (!query && !activeTable) renderOverview(content);
    else {
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const entries = query ? rows.filter((entry) => terms.every((term) => entry.searchText.includes(term))) : byTable.get(activeTable);
      renderResults(content, entries || []);
      $("announcer").textContent = `${number(entries?.length)} Datensätze ${query ? "gefunden" : "angezeigt"}`;
    }
  }
  function safeExternalUrl(value) {
    if (typeof value !== "string" || !/^(https?:|mailto:|tel:)/i.test(value)) return null;
    try {
      const url = new URL(value);
      return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function referenceTarget(key, value) {
    if (typeof value !== "string" || !/(^|_)(id|ids)$/.test(canonical(key)) || canonical(key) === "id") return null;
    const candidates = byId.get(value) || [];
    if (!candidates.length) return null;
    const stem = canonical(key).replace(/_ids?$/, "");
    const preferred = candidates.find((entry) => canonical(entry.table) === `${stem}s` || canonical(entry.table) === stem);
    return preferred || (candidates.length === 1 ? candidates[0] : null);
  }
  function renderValue(value, key = "", depth = 0) {
    if (value === null || value === undefined || value === "") return element("span", "muted", "Nicht hinterlegt");
    if (typeof value === "boolean") return element("span", "", value ? "Ja" : "Nein");
    if (Array.isArray(value)) {
      if (!value.length) return element("span", "muted", "Keine Einträge");
      const list = element("ol", "array-list");
      value.forEach((item) => { const li = element("li"); li.append(renderValue(item, key, depth + 1)); list.append(li); });
      if (value.length > 8) {
        const details = element("details");
        details.append(element("summary", "", `${number(value.length)} Einträge anzeigen`), list);
        return details;
      }
      return list;
    }
    if (typeof value === "object") {
      if (!Object.keys(value).length) return element("span", "muted", "Keine Angaben");
      if (depth > 12) return element("pre", "field-text", JSON.stringify(value, null, 2));
      return renderFields(value, depth + 1);
    }
    const reference = referenceTarget(key, value);
    if (reference) {
      const wrapper = element("div");
      wrapper.append(button(reference.title, () => openRecord(reference), "relation-link"), element("span", "record-id", value));
      return wrapper;
    }
    const text = String(value);
    if (canonical(key) === "relative_path" && localAssetPath(text)) {
      const link = element("a", "", text);
      link.href = text;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    }
    const url = safeExternalUrl(text);
    if (url) {
      const link = element("a", "", text);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "Externen Link öffnen (Internet gegebenenfalls erforderlich)";
      return link;
    }
    const node = element("span", "field-text", text);
    if (text.length > 1600) {
      const details = element("details");
      details.append(element("summary", "", `${text.slice(0, 150).replace(/\s+/g, " ")} … (${number(text.length)} Zeichen)`), node);
      return details;
    }
    return node;
  }
  function renderFields(record, depth = 0) {
    const list = element("dl", depth ? "field-list nested" : "field-list");
    const identity = ["name", "display_name", "first_name", "last_name", "title", "organization_name", "organization_id", "contact_role", "sector", "city", "state", "email", "phone", "themes", "topics", "notes", "note", "description", "observed"];
    const technical = ["id", "created_at", "updated_at", "created_by", "updated_by"];
    const order = (key) => identity.includes(canonical(key)) ? identity.indexOf(canonical(key)) : technical.includes(canonical(key)) ? 1000 + technical.indexOf(canonical(key)) : 100;
    for (const [key, value] of Object.entries(record).sort(([a], [b]) => order(a) - order(b))) {
      const row = element("div", "field-row");
      const term = element("dt", "", label(key));
      term.append(element("span", "field-key", key));
      const definition = element("dd");
      definition.append(renderValue(value, key, depth));
      row.append(term, definition);
      list.append(row);
    }
    return list;
  }
  function renderAssets(entry, target) {
    const items = assetByRecord.get(`${canonical(entry.table)}:${entry.id}`) || [];
    const missing = missingExternalByRecord.get(`${canonical(entry.table)}:${entry.id}`) || [];
    if (missing.length) {
      const note = element("div", "snapshot-note");
      note.append(element("p", "small", `${missing.length === 1 ? "Ein externes Bild ist" : `${number(missing.length)} externe Bilder sind`} nicht als lokale Datei verfügbar. Die Quellenlinks sind erhalten; alle übrigen Angaben bleiben lesbar.`));
      for (const reference of missing) {
        const url = safeExternalUrl(reference.sourceUrl);
        if (!url) continue;
        const paragraph = element("p", "small");
        const link = element("a", "", `${label(reference.field || "image")} – Online-Quelle öffnen`);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        paragraph.append(link);
        note.append(paragraph);
      }
      target.append(note);
    }
    if (!items.length) return;
    target.append(element("h3", "section-heading", "Lokal gespeicherte Dateien"));
    const list = element("div", "asset-list");
    for (const asset of items) {
      const item = element("div", "asset-item");
      if (/^image\/(png|jpeg|gif|webp|avif)$/.test(asset.mimeType || "")) {
        const image = element("img", "asset-image");
        image.alt = label(asset.field || "image");
        image.src = asset.relativePath;
        image.loading = "lazy";
        item.append(image);
      }
      const fileName = asset.fileName || asset.filename || get(entry.record, "file_name") || `${label(asset.field || "file")} öffnen`;
      const link = element("a", "", fileName);
      link.href = asset.relativePath;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link, element("span", "asset-caption", `${asset.mimeType || "Datei"} · ${number(asset.size)} Bytes · lokal gespeichert`));
      list.append(item);
    }
    target.append(list);
  }
  function openRecord(entry, remember = true) {
    if (remember && currentEntry && $("record-dialog").open && currentEntry !== entry) detailHistory.push(currentEntry);
    currentEntry = entry;
    $("detail-back-row").hidden = !detailHistory.length;
    $("record-title").textContent = entry.title;
    $("record-kind").textContent = tableLabel(entry.table);
    const content = $("record-content");
    content.replaceChildren();
    renderAssets(entry, content);
    content.append(entry.record && typeof entry.record === "object" ? renderFields(entry.record) : renderValue(entry.record));
    const related = [...(reverseRelations.get(entry.id) || [])].filter((candidate) => candidate !== entry);
    if (related.length) {
      content.append(element("h3", "section-heading", `Verknüpfte Einträge (${number(related.length)})`));
      for (const table of tables) {
        const items = related.filter((candidate) => candidate.table === table);
        if (!items.length) continue;
        const group = element("details", "related-group");
        group.open = items.length <= 8;
        group.append(element("summary", "", `${tableLabel(table)} (${number(items.length)})`));
        const list = element("ul", "related-list");
        for (const item of items) {
          const li = element("li");
          li.append(button(item.title, () => openRecord(item), "relation-link"), element("p", "small muted", recordExcerpt(item)));
          list.append(li);
        }
        group.append(list);
        content.append(group);
      }
    }
    $("record-dialog").scrollTop = 0;
    if (!$("record-dialog").open) $("record-dialog").showModal();
    $("close-record").focus();
  }
  $("close-record").addEventListener("click", () => $("record-dialog").close());
  $("record-dialog").addEventListener("close", () => { detailHistory = []; currentEntry = null; });
  $("back-record").addEventListener("click", () => { const previous = detailHistory.pop(); if (previous) openRecord(previous, false); });
  $("record-dialog").addEventListener("click", (event) => {
    if (event.target !== $("record-dialog")) return;
    const box = $("record-dialog").getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $("record-dialog").close();
  });
  $("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = $("search").value.trim();
      currentPage = 1;
      $("clear-search").hidden = !query;
      render();
    }, 150);
  });
  $("clear-search").addEventListener("click", () => {
    clearTimeout(searchTimer);
    query = "";
    $("search").value = "";
    $("clear-search").hidden = true;
    currentPage = 1;
    render();
    $("search").focus();
  });
  $("mobile-menu").addEventListener("click", () => {
    const open = document.querySelector(".sidebar").classList.toggle("menu-open");
    $("mobile-menu").setAttribute("aria-expanded", String(open));
    $("mobile-menu").textContent = open ? "Bereiche ausblenden" : "Bereiche anzeigen";
  });
  $("snapshot-time").textContent = `${humanDate(snapshot.exportedAt)} Uhr (Berlin)`;
  $("source-label").textContent = `Quelle: ${snapshot.sourceUrl || "Versorgungs-Kompass"}`;
  renderNavigation();
  render();
})();
