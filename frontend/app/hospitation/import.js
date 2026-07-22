(function () {
  "use strict";

  const SCHEMA_VERSION = "hospitation-staging/v1";
  const SNAPSHOT_SOURCE = "local-hospitation";
  const OWNER_REF = "timo-frank";
  const CONFIRMATION = "HOSPITATIONEN IMPORTIEREN";
  const MAX_FILE_BYTES = 1024 * 1024;
  const ENTITY_CONFIG = [
    { key: "organizations", label: "Organisationen" },
    { key: "contacts", label: "Kontakte" },
    { key: "hospitations", label: "Hospitationen" },
    { key: "observations", label: "Beobachtungen" }
  ];
  const ALLOWED_TOP_LEVEL_KEYS = new Set([
    "schemaVersion",
    "snapshot",
    "ownerRef",
    ...ENTITY_CONFIG.map((entity) => entity.key)
  ]);

  const elements = {
    accessState: document.getElementById("import-access-state"),
    workspace: document.getElementById("import-workspace"),
    user: document.getElementById("import-user"),
    alert: document.getElementById("import-alert"),
    fileInput: document.getElementById("import-file"),
    dropzone: document.getElementById("import-dropzone"),
    fileState: document.getElementById("import-file-state"),
    fileOverview: document.getElementById("import-file-overview"),
    fileName: document.getElementById("import-file-name"),
    fileMeta: document.getElementById("import-file-meta"),
    localCounts: document.getElementById("import-local-counts"),
    removeFile: document.getElementById("import-remove-file"),
    previewButton: document.getElementById("import-preview-button"),
    previewSection: document.getElementById("import-preview-section"),
    previewState: document.getElementById("import-preview-state"),
    ownerMapping: document.getElementById("import-owner-mapping"),
    summaryGrid: document.getElementById("import-summary-grid"),
    planBody: document.getElementById("import-plan-body"),
    itemGroups: document.getElementById("import-item-groups"),
    conflicts: document.getElementById("import-conflicts"),
    conflictList: document.getElementById("import-conflict-list"),
    manifestFingerprint: document.getElementById("import-manifest-fingerprint"),
    targetFingerprint: document.getElementById("import-target-fingerprint"),
    approval: document.getElementById("import-approval"),
    approvalCheckbox: document.getElementById("import-approval-checkbox"),
    backupCheckbox: document.getElementById("import-backup-checkbox"),
    confirmationInput: document.getElementById("import-confirmation"),
    applyButton: document.getElementById("import-apply-button"),
    result: document.getElementById("import-result"),
    resultCopy: document.getElementById("import-result-copy"),
    resultDetails: document.getElementById("import-result-details"),
    secondPreview: document.getElementById("import-second-preview"),
    progressSteps: [...document.querySelectorAll("[data-progress-step]")]
  };

  const state = {
    isAdmin: false,
    manifest: null,
    file: null,
    preview: null,
    busy: false
  };

  function runtimeConfig() {
    return window.VERSORGUNGS_COMPASS_CONFIG || {};
  }

  function sameOriginApiUrl(path) {
    const config = runtimeConfig();
    const configuredBase = String(config.apiBaseUrl || "").replace(/\/+$/, "");
    const url = new URL(`${configuredBase}${path}`, window.location.origin);
    if (url.origin !== window.location.origin) {
      throw new Error("Die Datenübernahme ist nur über die geschützte Anwendungs-Origin verfügbar.");
    }
    return url.href;
  }

  async function apiRequest(path, options = {}) {
    const config = runtimeConfig();
    const headers = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(sameOriginApiUrl(path), {
      method: options.method || "GET",
      headers,
      credentials: config.apiCredentials || "same-origin",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(messageForStatus(response.status));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function messageForStatus(status) {
    if (status === 400) return "Die Staging-Datei entspricht nicht dem freigegebenen Importformat.";
    if (status === 401) return "Die Sitzung ist abgelaufen. Bitte melde dich erneut an.";
    if (status === 403) return "Für diese Datenübernahme ist eine Admin-Berechtigung erforderlich.";
    if (status === 409) return "Der Produktivstand hat sich seit der Vorschau geändert oder enthält Konflikte. Bitte erstelle eine neue Vorschau.";
    if (status === 413) return "Die Staging-Datei ist für die Verarbeitung zu groß.";
    if (status >= 500) return "Die Datenübernahme ist serverseitig gerade nicht verfügbar. Es wurden keine Daten verändert.";
    return `Die Anfrage konnte nicht verarbeitet werden (${status}).`;
  }

  function showAccessDenied(message) {
    elements.accessState.classList.add("is-denied");
    elements.accessState.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "Datenübernahme nicht verfügbar";
    const copy = document.createElement("span");
    copy.textContent = message;
    const link = document.createElement("a");
    link.className = "import-back-link";
    link.href = "./index.html";
    link.textContent = "Zur Hospitations-Dokumentation";
    elements.accessState.append(title, copy, link);
  }

  function showAlert(message) {
    elements.alert.textContent = message;
    elements.alert.hidden = false;
    elements.alert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearAlert() {
    elements.alert.textContent = "";
    elements.alert.hidden = true;
  }

  function setProgress(activeStep) {
    const order = ["file", "preview", "apply"];
    const activeIndex = order.indexOf(activeStep);
    elements.progressSteps.forEach((element) => {
      const index = order.indexOf(element.dataset.progressStep || "");
      element.classList.toggle("is-active", index === activeIndex);
      element.classList.toggle("is-complete", index >= 0 && index < activeIndex);
    });
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validateManifest(manifest) {
    if (!isPlainObject(manifest)) throw new Error("Die Datei enthält kein gültiges Staging-Manifest.");
    const unknownKeys = Object.keys(manifest).filter((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key));
    if (unknownKeys.length || Object.keys(manifest).length !== ALLOWED_TOP_LEVEL_KEYS.size) {
      throw new Error("Die Datei enthält unerwartete oder fehlende Hauptbereiche.");
    }
    if (manifest.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Erwartet wird die Schemaversion ${SCHEMA_VERSION}.`);
    }
    if (manifest.ownerRef !== OWNER_REF) {
      throw new Error("Die Owner-Zuordnung der Datei ist nicht für diesen Import freigegeben.");
    }
    if (!isPlainObject(manifest.snapshot)) throw new Error("Die Snapshot-Metadaten fehlen.");
    const snapshotKeys = Object.keys(manifest.snapshot).sort();
    if (snapshotKeys.join("|") !== "createdAt|id|source") {
      throw new Error("Die Snapshot-Metadaten entsprechen nicht dem freigegebenen Format.");
    }
    if (manifest.snapshot.source !== SNAPSHOT_SOURCE) {
      throw new Error("Die Datei stammt nicht aus dem freigegebenen lokalen Staging-Workflow.");
    }
    if (!String(manifest.snapshot.id || "").trim() || String(manifest.snapshot.id).length > 160) {
      throw new Error("Die Snapshot-ID fehlt oder ist ungültig.");
    }
    const snapshotDate = Date.parse(String(manifest.snapshot.createdAt || ""));
    if (!Number.isFinite(snapshotDate)) throw new Error("Der Zeitpunkt des Snapshots ist ungültig.");
    ENTITY_CONFIG.forEach(({ key, label }) => {
      if (!Array.isArray(manifest[key])) throw new Error(`${label} fehlen als Liste.`);
      if (manifest[key].some((item) => !isPlainObject(item))) {
        throw new Error(`${label} enthalten einen ungültigen Eintrag.`);
      }
    });
    return manifest;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }

  function formatSnapshotDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Zeitpunkt unbekannt";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function appendDefinitionListItem(list, label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    wrapper.append(term, description);
    list.append(wrapper);
  }

  function renderLocalFile() {
    const manifest = state.manifest;
    if (!manifest || !state.file) return;
    elements.fileName.textContent = state.file.name;
    elements.fileMeta.textContent = `${formatBytes(state.file.size)} · Snapshot vom ${formatSnapshotDate(manifest.snapshot.createdAt)}`;
    elements.fileState.textContent = "Datei geprüft";
    elements.fileOverview.hidden = false;
    elements.localCounts.replaceChildren();
    ENTITY_CONFIG.forEach(({ key, label }) => {
      appendDefinitionListItem(elements.localCounts, label, manifest[key].length);
    });
    elements.previewButton.disabled = !state.isAdmin || state.busy;
  }

  function resetApproval() {
    elements.approvalCheckbox.checked = false;
    elements.backupCheckbox.checked = false;
    elements.confirmationInput.value = "";
    updateApplyAvailability();
  }

  function resetPreview() {
    state.preview = null;
    elements.previewSection.hidden = true;
    elements.result.hidden = true;
    elements.summaryGrid.replaceChildren();
    elements.planBody.replaceChildren();
    elements.itemGroups.replaceChildren();
    elements.conflictList.replaceChildren();
    elements.conflicts.hidden = true;
    elements.manifestFingerprint.textContent = "";
    elements.targetFingerprint.textContent = "";
    elements.ownerMapping.textContent = "";
    elements.ownerMapping.hidden = true;
    elements.approval.hidden = false;
    resetApproval();
    setProgress("file");
  }

  function resetFile() {
    state.file = null;
    state.manifest = null;
    elements.fileInput.value = "";
    elements.fileState.textContent = "Noch keine Datei";
    elements.fileOverview.hidden = true;
    elements.fileName.textContent = "";
    elements.fileMeta.textContent = "";
    elements.localCounts.replaceChildren();
    elements.previewButton.disabled = true;
    clearAlert();
    resetPreview();
  }

  async function selectFile(file) {
    clearAlert();
    resetPreview();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      resetFile();
      showAlert("Bitte wähle eine JSON-Datei aus dem lokalen Staging-Export.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      resetFile();
      showAlert("Die JSON-Datei muss größer als 0 Byte und höchstens 1 MB groß sein.");
      return;
    }
    try {
      const text = await file.text();
      const manifest = validateManifest(JSON.parse(text));
      state.file = file;
      state.manifest = manifest;
      renderLocalFile();
    } catch (error) {
      resetFile();
      showAlert(error instanceof SyntaxError ? "Die ausgewählte Datei enthält kein gültiges JSON." : error.message);
    }
  }

  function integer(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
  }

  function normalizedSummary(preview) {
    const summary = isPlainObject(preview?.summary) ? preview.summary : {};
    const result = {};
    ENTITY_CONFIG.forEach(({ key }) => {
      const row = isPlainObject(summary[key]) ? summary[key] : {};
      const items = Array.isArray(preview?.items?.[key]) ? preview.items[key] : [];
      const fromItems = (action) => items.filter((item) => item?.action === action).length;
      result[key] = {
        total: integer(row.total || items.length),
        create: integer(row.create ?? fromItems("create")),
        update: integer(row.update ?? fromItems("update")),
        unchanged: integer(row.unchanged ?? fromItems("unchanged")),
        conflict: integer(row.conflict ?? fromItems("conflict"))
      };
    });
    result.total = ENTITY_CONFIG.reduce((total, { key }) => {
      Object.keys(total).forEach((field) => { total[field] += result[key][field]; });
      return total;
    }, { total: 0, create: 0, update: 0, unchanged: 0, conflict: 0 });
    return result;
  }

  function appendSummaryCard(label, value, accent = false) {
    const card = document.createElement("div");
    card.className = `import-summary-card${accent ? " import-summary-card--accent" : ""}`;
    const copy = document.createElement("span");
    const count = document.createElement("strong");
    copy.textContent = label;
    count.textContent = String(value);
    card.append(copy, count);
    elements.summaryGrid.append(card);
  }

  function renderSummary(summary) {
    elements.summaryGrid.replaceChildren();
    appendSummaryCard("Geplante Änderungen", summary.total.create + summary.total.update, true);
    appendSummaryCard("Neue Datensätze", summary.total.create);
    appendSummaryCard("Aktualisierungen", summary.total.update);
    appendSummaryCard("Konflikte", summary.total.conflict);

    elements.planBody.replaceChildren();
    ENTITY_CONFIG.forEach(({ key, label }) => {
      const values = summary[key];
      const row = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = label;
      row.append(labelCell);
      ["create", "update", "unchanged", "conflict", "total"].forEach((field) => {
        const cell = document.createElement("td");
        cell.textContent = String(values[field]);
        if (["create", "update"].includes(field) && values[field] > 0) cell.className = "is-positive";
        if (field === "conflict" && values[field] > 0) cell.className = "is-blocked";
        row.append(cell);
      });
      elements.planBody.append(row);
    });
  }

  function itemActionLabel(action) {
    return ({
      create: "Neu",
      update: "Aktualisieren",
      unchanged: "Unverändert",
      conflict: "Blockiert"
    })[String(action || "")] || "Prüfen";
  }

  function appendItemCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = String(value || "—");
    if (className) cell.className = className;
    row.append(cell);
  }

  function renderItemReview(previewItems) {
    elements.itemGroups.replaceChildren();
    ENTITY_CONFIG.forEach(({ key, label }) => {
      const items = Array.isArray(previewItems?.[key]) ? previewItems[key] : [];
      if (!items.length) return;
      const changedCount = items.filter((item) => ["create", "update", "conflict"].includes(String(item?.action || ""))).length;
      const details = document.createElement("details");
      details.className = "import-item-group";
      details.open = changedCount > 0;
      const summary = document.createElement("summary");
      const summaryLabel = document.createElement("strong");
      const summaryCount = document.createElement("span");
      summaryLabel.textContent = label;
      summaryCount.textContent = `${items.length} Zuordnungen · ${changedCount} zu prüfen`;
      summary.append(summaryLabel, summaryCount);

      const scroll = document.createElement("div");
      scroll.className = "import-item-table-wrap";
      const table = document.createElement("table");
      table.className = "import-item-table";
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Quell-ID", "Ziel-ID", "Aktion", "Geänderte Felder"].forEach((heading) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = heading;
        headRow.append(cell);
      });
      head.append(headRow);
      const body = document.createElement("tbody");
      items.forEach((item) => {
        const row = document.createElement("tr");
        const action = String(item?.action || "");
        appendItemCell(row, item?.sourceId, "is-identifier");
        appendItemCell(row, item?.targetId, "is-identifier");
        appendItemCell(row, itemActionLabel(action), `is-action is-action--${action || "unknown"}`);
        const fields = Array.isArray(item?.changedFields)
          ? item.changedFields.map((field) => String(field || "").trim()).filter(Boolean)
          : [];
        appendItemCell(row, fields.length ? fields.join(", ") : "—", "is-fields");
        body.append(row);
      });
      table.append(head, body);
      scroll.append(table);
      details.append(summary, scroll);
      elements.itemGroups.append(details);
    });
  }

  function entityLabel(value) {
    const labels = {
      organization: "Organisationen",
      contact: "Kontakte",
      hospitation: "Hospitationen",
      observation: "Beobachtungen"
    };
    return ENTITY_CONFIG.find(({ key }) => key === value)?.label || labels[value] || "Datensätze";
  }

  function conflictCodeLabel(value) {
    const labels = {
      ambiguous_target: "Mehrdeutige Zuordnung",
      ambiguous_match: "Mehrdeutige Zuordnung",
      duplicate_source_id: "Doppelte Staging-ID",
      duplicate_match: "Doppelte Zuordnung",
      hospitation_conflict: "Hospitation nicht eindeutig",
      id_owned_by_other_hospitation: "ID gehört zu anderer Hospitation",
      missing_dependency: "Fehlende Verknüpfung",
      natural_key_owned_by_other_id: "Fachliche Identität bereits vorhanden",
      organization_conflict: "Organisation nicht eindeutig",
      owner_not_found: "Owner nicht gefunden",
      reference_conflict: "Verknüpfung nicht eindeutig",
      validation_error: "Validierungsfehler"
    };
    const normalized = String(value || "unclassified").toLowerCase();
    return labels[normalized] || "Prüfung erforderlich";
  }

  function renderConflicts(conflicts) {
    const aggregate = new Map();
    (Array.isArray(conflicts) ? conflicts : []).forEach((conflict) => {
      const entityType = String(conflict?.entityType || "");
      const code = String(conflict?.code || "");
      const key = `${entityType}\u0000${code}`;
      aggregate.set(key, (aggregate.get(key) || 0) + 1);
    });
    elements.conflictList.replaceChildren();
    elements.conflicts.hidden = aggregate.size === 0;
    aggregate.forEach((count, key) => {
      const [entityType, code] = key.split("\u0000");
      const item = document.createElement("li");
      const label = document.createElement("span");
      const amount = document.createElement("strong");
      label.textContent = `${entityLabel(entityType)} · ${conflictCodeLabel(code)}`;
      amount.textContent = `${count}×`;
      item.append(label, amount);
      elements.conflictList.append(item);
    });
  }

  function isUsableFingerprint(value) {
    return typeof value === "string" && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);
  }

  function renderPreview(preview) {
    const summary = normalizedSummary(preview);
    const conflicts = Array.isArray(preview.conflicts) ? preview.conflicts : [];
    const fingerprintsValid = isUsableFingerprint(preview.manifestFingerprint) && isUsableFingerprint(preview.targetFingerprint);
    const hasChanges = summary.total.create + summary.total.update > 0;
    const isCurrent = !hasChanges && summary.total.conflict === 0 && conflicts.length === 0 && fingerprintsValid;
    state.preview = {
      ...preview,
      isCurrent,
      canApply: preview.canApply === true && hasChanges && summary.total.conflict === 0 && conflicts.length === 0 && fingerprintsValid
    };
    renderSummary(summary);
    renderItemReview(preview.items);
    renderConflicts(conflicts);
    elements.manifestFingerprint.textContent = String(preview.manifestFingerprint || "Nicht verfügbar");
    elements.targetFingerprint.textContent = String(preview.targetFingerprint || "Nicht verfügbar");
    elements.previewState.textContent = isCurrent ? "Stand bereits aktuell" : state.preview.canApply ? "Freigabefähig" : "Prüfung erforderlich";
    elements.previewState.classList.toggle("is-blocked", !state.preview.canApply && !isCurrent);
    const ownerName = String(preview?.owner?.displayName || "").trim();
    elements.ownerMapping.textContent = ownerName ? `Produktive Owner-Zuordnung: ${ownerName}` : "";
    elements.ownerMapping.hidden = !ownerName;
    elements.approval.hidden = isCurrent;
    elements.approval.classList.toggle("is-blocked", !state.preview.canApply);
    elements.approvalCheckbox.disabled = !state.preview.canApply;
    elements.backupCheckbox.disabled = !state.preview.canApply;
    elements.confirmationInput.disabled = !state.preview.canApply;
    elements.previewSection.hidden = false;
    elements.result.hidden = true;
    resetApproval();
    setProgress("preview");
    elements.previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setBusy(busy, action = "") {
    state.busy = busy;
    elements.fileInput.disabled = busy;
    elements.removeFile.disabled = busy;
    elements.previewButton.disabled = busy || !state.isAdmin || !state.manifest;
    elements.previewButton.textContent = busy && action === "preview" ? "Vorschau wird erstellt …" : "Vorschau erstellen";
    elements.applyButton.textContent = busy && action === "apply" ? "Übernahme wird ausgeführt …" : "Geprüften Stand übernehmen";
    updateApplyAvailability();
  }

  async function runPreview() {
    if (!state.manifest || state.busy) return;
    clearAlert();
    setBusy(true, "preview");
    try {
      const preview = await apiRequest("/api/admin/hospitation-import/preview", {
        method: "POST",
        body: { manifest: state.manifest }
      });
      renderPreview(preview);
    } catch (error) {
      resetPreview();
      showAlert(error.message || "Die Vorschau konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  function updateApplyAvailability() {
    const approved = elements.approvalCheckbox.checked;
    const backupConfirmed = elements.backupCheckbox.checked;
    const confirmed = elements.confirmationInput.value === CONFIRMATION;
    elements.applyButton.disabled = state.busy || !state.preview?.canApply || !approved || !backupConfirmed || !confirmed;
  }

  function renderResult(result) {
    const summary = normalizedSummary({ summary: result.summary });
    state.preview.canApply = false;
    elements.resultCopy.textContent = `${summary.total.create + summary.total.update} Änderungen wurden transaktional verarbeitet. Erstelle jetzt eine zweite Vorschau; sie sollte keine weiteren Änderungen mehr ausweisen.`;
    elements.resultDetails.replaceChildren();
    if (result.importRunId) appendDefinitionListItem(elements.resultDetails, "Importlauf", result.importRunId);
    if (result.appliedFingerprint) appendDefinitionListItem(elements.resultDetails, "Ergebnis-Prüfsumme", result.appliedFingerprint);
    elements.result.hidden = false;
    elements.approvalCheckbox.disabled = true;
    elements.backupCheckbox.disabled = true;
    elements.confirmationInput.disabled = true;
    elements.applyButton.disabled = true;
    setProgress("apply");
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function applyPreview() {
    if (!state.manifest || !state.preview?.canApply || state.busy) return;
    if (!elements.approvalCheckbox.checked || !elements.backupCheckbox.checked || elements.confirmationInput.value !== CONFIRMATION) return;
    clearAlert();
    setBusy(true, "apply");
    try {
      const result = await apiRequest("/api/admin/hospitation-import/apply", {
        method: "POST",
        body: {
          manifest: state.manifest,
          manifestFingerprint: state.preview.manifestFingerprint,
          targetFingerprint: state.preview.targetFingerprint,
          backupConfirmed: true,
          confirmation: CONFIRMATION
        }
      });
      renderResult(result);
    } catch (error) {
      showAlert(error.message || "Die Übernahme konnte nicht ausgeführt werden. Es wurden keine Daten verändert.");
      if (error.status === 409) {
        state.preview.canApply = false;
        elements.approval.classList.add("is-blocked");
        elements.approvalCheckbox.disabled = true;
        elements.backupCheckbox.disabled = true;
        elements.confirmationInput.disabled = true;
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyAdminAccess() {
    const config = runtimeConfig();
    if (config.dataMode !== "api" || !["iap", "oidc"].includes(config.authMode)) {
      showAccessDenied("Dieses Werkzeug wird nur in der geschützten Zielumgebung bereitgestellt.");
      return;
    }
    try {
      const profile = await apiRequest("/api/profile");
      if (String(profile?.role || "").toLowerCase() !== "admin") {
        showAccessDenied("Dein Profil besitzt keine Admin-Berechtigung. Es wurden keine Daten geladen.");
        return;
      }
      state.isAdmin = true;
      elements.user.textContent = String(profile.display_name || profile.displayName || profile.email || "Admin");
      elements.accessState.hidden = true;
      elements.workspace.hidden = false;
    } catch (error) {
      showAccessDenied(error.message || "Die Berechtigung konnte nicht geprüft werden.");
    }
  }

  elements.fileInput.addEventListener("change", () => selectFile(elements.fileInput.files?.[0]));
  elements.removeFile.addEventListener("click", resetFile);
  elements.previewButton.addEventListener("click", runPreview);
  elements.approvalCheckbox.addEventListener("change", updateApplyAvailability);
  elements.backupCheckbox.addEventListener("change", updateApplyAvailability);
  elements.confirmationInput.addEventListener("input", updateApplyAvailability);
  elements.applyButton.addEventListener("click", applyPreview);
  elements.secondPreview.addEventListener("click", () => {
    elements.result.hidden = true;
    runPreview();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove("is-dragging");
    });
  });
  elements.dropzone.addEventListener("drop", (event) => selectFile(event.dataTransfer?.files?.[0]));

  verifyAdminAccess();
})();
