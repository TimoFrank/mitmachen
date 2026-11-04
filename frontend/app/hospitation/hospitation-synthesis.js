(function () {
  "use strict";

  const stages = [
    { id: "hospitations", label: "Hospitationen", singular: "Hospitation", hint: "Planen und dokumentieren" },
    { id: "observations", label: "Beobachtungen", singular: "Beobachtung", hint: "Konkrete Belege" },
    { id: "pattern", label: "Muster", singular: "Muster", hint: "Versorgungsbedarf" },
    { id: "hypothesis", label: "Hypothesen", singular: "Hypothese", hint: "Prüfbare Annahmen" },
    { id: "nextStep", label: "Nächste Schritte", singular: "Nächster Schritt", hint: "Gezielt nachprüfen" }
  ];
  const stagePreferenceKey = "hospitation-framework-stage-v1";
  const roles = { support: "Stützender Hinweis", counterexample: "Gelingender Vergleich", context: "Ergänzender Kontext" };
  let data = null;
  let selection = { hospitationId: "", clusterId: "", observationId: "", patternKey: "", stage: readStagePreference() };
  let current = null;
  const viewStates = Object.create(null);
  let viewMode = "work";
  let showArchive = false;
  let menu = null;
  let detailDrawer = null;
  let detailState = null;
  let detailHistory = [];
  let sourceReturn = null;
  let loadVersion = 0;
  let focusVersion = 0;
  const handlers = new WeakMap();

  const text = (value) => String(value == null ? "" : value).trim();
  const escape = (value) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const unique = (values) => [...new Set(values)];
  const plural = (count, singular, multiple) => `${count} ${count === 1 ? singular : multiple}`;
  const short = (value, limit = 440) => text(value).length > limit ? `${text(value).slice(0, limit).trimEnd()} …` : text(value);
  const recordBadge = (value, observation = false, classes = "", attributes = "") => {
    const reference = text(value) || "?";
    const label = observation && !reference.startsWith("#") ? `#${reference}` : reference;
    const sizeClass = label.length > 5 ? " hs-record-number--long" : label.length > 4 ? " hs-record-number--compact" : "";
    return `<span class="hs-record-number${sizeClass}${classes ? ` ${classes}` : ""}" title="${escape(label)}"${attributes}>${escape(label)}</span>`;
  };
  const list = (value, label, limit = 2000) => {
    if (!Array.isArray(value) || value.length > limit) throw new Error(`Ungültige Auswertung: ${label}.`);
    return value;
  };
  const string = (value, label, required = false) => {
    if (typeof value !== "string" || value.length > 20000 || (required && !value.trim())) throw new Error(`Ungültige Auswertung: ${label}.`);
    return value.trim();
  };
  const optionalString = (value, label) => value == null ? "" : string(value, label);
  const strings = (value, label) => unique(list(value, label).map((entry) => string(entry, label, true)));
  const count = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Ungültige Auswertung: ${label}.`);
    return value;
  };
  const object = (value, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Ungültige Auswertung: ${label}.`);
    return value;
  };
  const httpsUrl = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : "";
    } catch (_) {
      return "";
    }
  };
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };

  function validate(input) {
    object(input, "Datenformat");
    if (input.schemaVersion !== 1) throw new Error("Diese Version der Auswertung wird noch nicht unterstützt.");
    const baseline = object(input.baseline, "Datenbasis");
    const snapshots = Object.create(null);
    if (baseline.observationSnapshots != null) {
      const entries = Object.entries(object(baseline.observationSnapshots, "Beobachtungsstand"));
      if (entries.length > 2000) throw new Error("Die Auswertung enthält zu viele Beobachtungsstände.");
      entries.forEach(([id, value]) => {
        object(value, "Beobachtungsstand");
        snapshots[string(id, "Beobachtungs-ID", true)] = {
          title: optionalString(value.title, "Titel im Beobachtungsstand"),
          description: optionalString(value.description, "Beschreibung im Beobachtungsstand"),
          updatedAt: optionalString(value.updatedAt, "Änderungsdatum im Beobachtungsstand")
        };
      });
    }
    const ids = new Set();
    const clusters = list(input.clusters, "Cluster", 40).map((value) => {
      object(value, "Cluster");
      const id = string(value.id, "Cluster-ID", true);
      if (ids.has(id)) throw new Error("Die Auswertung enthält eine doppelte Cluster-ID.");
      ids.add(id);
      if (!["cluster", "crosscutting"].includes(value.kind)) throw new Error("Unbekannte Art der Erkenntnis.");
      const pattern = object(value.pattern, "Muster");
      const hypothesis = object(value.hypothesis, "Hypothese");
      const nextStep = object(value.nextStep, "Nächster Schritt");
      const study = hypothesis.study == null ? null : object(hypothesis.study, "Prüfvorschlag");
      const gematik = object(value.gematik, "gematik-Bezug");
      const evidenceIds = new Set();
      const evidence = list(value.evidence, "Belege").map((entry) => {
        object(entry, "Beleg");
        const observationId = string(entry.observationId, "Beobachtungs-ID", true);
        if (evidenceIds.has(observationId)) throw new Error("Ein Beleg ist innerhalb eines Clusters mehrfach verknüpft.");
        evidenceIds.add(observationId);
        if (!Object.prototype.hasOwnProperty.call(roles, entry.role)) throw new Error("Unbekannte Rolle eines Belegs.");
        return {
          observationId,
          registerId: optionalString(entry.registerId, "Analysekennung"),
          role: entry.role,
          label: string(entry.label, "Belegbezeichnung", true),
          note: optionalString(entry.note, "Belegeinordnung")
        };
      });
      return {
        id,
        kind: value.kind,
        title: string(value.title, "Clustertitel", true),
        summary: string(value.summary, "Kurzfassung", true),
        pattern: {
          title: string(pattern.title, "Mustertitel", true),
          description: string(pattern.description, "Musterbeschreibung", true),
          careNeed: string(pattern.careNeed, "Versorgungsbedarf", true)
        },
        hypothesis: {
          title: string(hypothesis.title, "Hypothesentitel", true),
          description: string(hypothesis.description, "Hypothesenbeschreibung", true),
          status: optionalString(hypothesis.status, "Hypothesenstatus"),
          study: study ? {
            population: optionalString(study.population, "Zielgruppe"),
            outcome: optionalString(study.outcome, "Messgröße"),
            method: optionalString(study.method, "Prüfmethode"),
            items: study.items == null ? [] : strings(study.items, "Fragebogenentwürfe")
          } : null
        },
        nextStep: {
          title: string(nextStep.title, "Nächster Schritt", true),
          description: string(nextStep.description, "Beschreibung des nächsten Schritts", true),
          checks: strings(nextStep.checks, "Prüffragen"),
          status: optionalString(nextStep.status, "Schrittstatus")
        },
        gematik: {
          topics: strings(gematik.topics, "gematik-Themen"),
          contribution: string(gematik.contribution, "gematik-Beitrag", true),
          boundary: string(gematik.boundary, "Zuständigkeitsgrenze", true),
          sources: list(gematik.sources, "Quellen", 30).map((source) => {
            object(source, "Quelle");
            const url = httpsUrl(string(source.url, "Quellenadresse", true));
            if (!url) throw new Error("Eine Quellenadresse ist keine sichere HTTPS-Adresse.");
            return { title: string(source.title, "Quellentitel", true), url };
          })
        },
        openQuestions: strings(value.openQuestions, "Offene Fragen"),
        evidence,
        assignmentObservationIds: strings(value.assignmentObservationIds, "Zuordnungen")
      };
    });
    if (!clusters.length) throw new Error("Die Auswertung enthält noch keine Cluster.");
    const normalizedBaseline = {
      total: count(baseline.total, "Erfasste Einträge"),
      substantive: count(baseline.substantive, "Inhaltliche Einträge"),
      hospitations: count(baseline.hospitations, "Ausgewertete Hospitationen"),
      completedHospitations: count(baseline.completedHospitations, "Absolvierte Hospitationen"),
      note: optionalString(baseline.note, "Hinweis zur Datenbasis"),
      observationIds: strings(baseline.observationIds, "Ausgewertete Beobachtungs-IDs"),
      excludedObservationIds: strings(baseline.excludedObservationIds, "Ausgeschlossene Beobachtungs-IDs"),
      observationSnapshots: snapshots
    };
    if (normalizedBaseline.substantive > normalizedBaseline.total || normalizedBaseline.hospitations > normalizedBaseline.completedHospitations) {
      throw new Error("Die Zahlen der Datenbasis widersprechen sich.");
    }
    const baselineIds = new Set(normalizedBaseline.observationIds);
    const excludedIds = new Set(normalizedBaseline.excludedObservationIds);
    if (baselineIds.size !== normalizedBaseline.total || excludedIds.size !== normalizedBaseline.total - normalizedBaseline.substantive || [...excludedIds].some((id) => !baselineIds.has(id))) {
      throw new Error("Die Beobachtungs-IDs stimmen nicht mit der Datenbasis überein.");
    }
    clusters.forEach((cluster) => {
      if (linkedIds(cluster).some((id) => excludedIds.has(id) || !baselineIds.has(id))) {
        throw new Error("Ein Cluster verweist auf einen ausgeschlossenen oder nicht ausgewerteten Eintrag.");
      }
    });
    const linkKeys = new Set();
    const patternLinks = list(input.patternLinks || [], "Musterverknüpfungen", 600).map((entry) => {
      object(entry, "Musterverknüpfung");
      const patternKey = string(entry.patternKey, "Musterschlüssel", true);
      const clusterId = string(entry.clusterId, "Hypothesenbezug", true);
      const observationIds = strings(entry.observationIds, "Beobachtungsbezug der Verknüpfung");
      if (!ids.has(clusterId) || !observationIds.length || observationIds.some((id) => excludedIds.has(id) || !baselineIds.has(id))) throw new Error("Eine Musterverknüpfung hat einen ungültigen Belegbezug.");
      if (!Object.prototype.hasOwnProperty.call(roles, entry.relation)) throw new Error("Unbekannte Art einer Musterverknüpfung.");
      const key = JSON.stringify([patternKey, clusterId, entry.relation]);
      if (linkKeys.has(key)) throw new Error("Eine Musterverknüpfung ist doppelt vorhanden.");
      linkKeys.add(key);
      return { patternKey, clusterId, observationIds, relation: entry.relation, note: string(entry.note, "Begründung der Verknüpfung", true) };
    });
    return freeze({
      schemaVersion: 1,
      title: string(input.title, "Titel", true),
      date: string(input.date, "Datum", true),
      reviewStatus: optionalString(input.reviewStatus, "Prüfstatus"),
      baseline: normalizedBaseline,
      clusters,
      patternLinks
    });
  }

  async function load(source) {
    closeDetails();
    const version = ++loadVersion;
    data = null;
    if (!source) return null;
    let parsed = source;
    if (typeof source === "string") {
      const target = new URL(source, window.location.href);
      if (!["http:", "https:"].includes(target.protocol) || target.origin !== window.location.origin || target.username || target.password) {
        throw new Error("Die Auswertung muss aus dieser Anwendung geladen werden.");
      }
      const response = await fetch(target.href, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!response.ok) throw new Error("Die gespeicherte Auswertung konnte nicht geladen werden.");
      if (!/application\/json/i.test(response.headers.get("content-type") || "")) throw new Error("Die Auswertung hat ein unerwartetes Dateiformat.");
      const json = await response.text();
      if (json.length > 5000000) throw new Error("Die Auswertung ist zu groß.");
      try { parsed = JSON.parse(json); } catch (_) { throw new Error("Die Auswertungsdatei ist nicht lesbar."); }
    }
    const validated = validate(parsed);
    if (version !== loadVersion) return data;
    data = validated;
    if (selection.clusterId && !data.clusters.some((cluster) => cluster.id === selection.clusterId)) selection = { hospitationId: "", clusterId: "", observationId: "", patternKey: "", stage: selection.stage };
    return data;
  }

  function linkedIds(cluster) {
    return unique([...cluster.assignmentObservationIds, ...cluster.evidence.map((entry) => entry.observationId)]);
  }

  function clustersForObservation(id) {
    const clusterIds = new Set((data?.patternLinks || []).filter((link) => link.observationIds.includes(String(id))).map((link) => link.clusterId));
    return data ? data.clusters.filter((cluster) => clusterIds.has(cluster.id)) : [];
  }

  function normalizedStage(value) {
    const aliases = { hospitation: "hospitations", appointments: "hospitations", appointment: "hospitations", observation: "observations", patterns: "pattern", hypotheses: "hypothesis", "next-step": "nextStep", "next-steps": "nextStep", nextsteps: "nextStep" };
    const candidate = typeof value === "string" ? value.trim() : "";
    const id = Object.prototype.hasOwnProperty.call(aliases, candidate) ? aliases[candidate] : candidate;
    return stages.some((entry) => entry.id === id) ? id : "";
  }

  function stageId(value) {
    return normalizedStage(value) || "observations";
  }

  function readStagePreference() {
    try { return stageId(window.localStorage.getItem(stagePreferenceKey)); } catch (_) { return "observations"; }
  }

  function saveStagePreference() {
    // Only the active view is stored here. Records and source data stay in their existing stores.
    try { window.localStorage.setItem(stagePreferenceKey, selection.stage); } catch (_) { /* Storage is optional. */ }
  }

  function setStage(stage, options = {}) {
    const next = normalizedStage(stage);
    if (!next) return false;
    closeDetails();
    menu = null;
    selection = options.clearSelection === true
      ? { hospitationId: "", clusterId: "", observationId: "", patternKey: "", stage: next }
      : { ...selection, stage: next };
    if (options.resetFilters === true) { clearViewFilters(); showArchive = false; stateFor(next).mode = "work"; }
    saveStagePreference();
    if (current && options.render !== false) rerender();
    return true;
  }

  function notifyStageChange(previousStage) {
    if (previousStage !== selection.stage && typeof current?.options.onStageChange === "function") current.options.onStageChange(selection.stage);
  }

  function clearViewFilters() {
    closeDetails();
    Object.values(viewStates).forEach((state) => { state.query = ""; state.filters = {}; });
    menu = null;
  }

  function select(clusterId, stage = "observations") {
    if (clusterId && !data?.clusters.some((cluster) => cluster.id === clusterId)) return false;
    selection = { hospitationId: "", clusterId: clusterId || "", observationId: "", patternKey: "", stage: stageId(stage) };
    clearViewFilters();
    return true;
  }

  function selectObservation(id, stage = "observations") {
    if (!text(id)) return false;
    selection = { hospitationId: "", clusterId: "", observationId: text(id), patternKey: "", stage: stageId(stage) };
    clearViewFilters();
    return true;
  }

  function selectHospitation(id, stage = "hospitations") {
    if (!text(id)) return false;
    selection = { hospitationId: text(id), clusterId: "", observationId: "", patternKey: "", stage: stageId(stage) };
    clearViewFilters();
    return true;
  }

  function selectPattern(key, stage = "pattern") {
    if (!text(key)) return false;
    selection = { hospitationId: "", clusterId: "", observationId: "", patternKey: text(key), stage: stageId(stage) };
    clearViewFilters();
    return true;
  }

  function stateFor(stage = selection.stage) {
    return viewStates[stage] ||= { query: "", filters: {}, sort: stage === "hospitations" ? "date" : stage === "observations" ? "number" : stage === "pattern" ? "pattern" : "title", direction: ["observations", "hospitations"].includes(stage) ? "desc" : "asc", columns: null, scrollLeft: 0 };
  }

  function isChanged(row) {
    const snapshot = data?.baseline.observationSnapshots[row.id];
    if (!snapshot) return false;
    if (text(row.title) !== snapshot.title || text(row.description || row.observed) !== snapshot.description) return true;
    const before = Date.parse(snapshot.updatedAt);
    const now = Date.parse(row.updatedAt || row.updated_at || "");
    return Number.isFinite(before) && Number.isFinite(now) && now > before;
  }

  function sourceReference(row) {
    return text(row.sourceReference || row.source_reference || row.payload?.sourceReference);
  }

  function formatDate(value) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function rowContext(row) {
    const origin = row?.hospitation || {};
    const date = origin.date || origin.scheduledOn || origin.scheduled_on;
    return { name: text(origin.organizationName || origin.contactName || "Nicht zugeordnet"), contact: text(origin.contactName), avatarUrl: text(origin.avatarUrl), date: text(origin.dateLabel) || (date ? formatDate(date) : "") };
  }

  function patternLabel(pattern) {
    const value = text(pattern?.problemType);
    return value === "positives Muster / Best Practice" ? "Bewährter Ablauf" : value ? value.charAt(0).toLocaleUpperCase("de-DE") + value.slice(1) : "Noch offen";
  }

  function patternName(pattern) {
    return pattern ? [patternLabel(pattern), pattern.processPhase].filter(Boolean).join(" · ") : "Muster nicht verfügbar";
  }

  function makeModel(options) {
    const observations = (Array.isArray(options.observations) ? options.observations : []).filter((row) => row && row.id && row.status !== "archived" && row.hospitation?.status !== "Archiviert");
    const observationMap = new Map(observations.map((row) => [String(row.id), row]));
    const hospitations = (Array.isArray(options.hospitations) ? options.hospitations : []).filter((row) => row && row.id && row.status !== "Archiviert");
    const archivedHospitations = (Array.isArray(options.archivedHospitations) ? options.archivedHospitations : []).filter((row) => row && row.id);
    const hospitationMap = new Map([...hospitations, ...archivedHospitations].map((row) => [String(row.id), row]));
    const patterns = (Array.isArray(options.patterns) ? options.patterns : []).filter((row) => row && row.key).map((row) => ({ ...row, key: String(row.key), observationIds: unique((Array.isArray(row.observationIds) ? row.observationIds : []).map(String)).filter((id) => observationMap.has(id)), hospitationIds: unique(Array.from(row.hospitationIds || []).map(String)) }));
    const patternMap = new Map(patterns.map((row) => [row.key, row]));
    const links = (data?.patternLinks || []).map((link) => {
      const pattern = patternMap.get(link.patternKey);
      const observationIds = link.observationIds.filter((id) => observationMap.has(id) && pattern?.observationIds.includes(id));
      return { ...link, observationIds, unavailableIds: link.observationIds.filter((id) => !observationIds.includes(id)) };
    }).filter((link) => link.observationIds.length);
    const patternNumbers = new Map(patterns.map((row) => row.key).sort().map((key, index) => [key, index + 1]));
    const clusterNumbers = new Map((data?.clusters || []).map((row) => row.id).sort().map((key, index) => [key, index + 1]));
    return { observations, observationMap, hospitations, archivedHospitations, hospitationMap, patterns, patternMap, patternNumbers, clusterNumbers, links };
  }

  function relevantLinks(model, context = selection) {
    return model.links.filter((link) => (!context.hospitationId || link.observationIds.some((id) => model.observationMap.get(id)?.hospitationId === context.hospitationId)) && (!context.observationId || link.observationIds.includes(context.observationId)) && (!context.patternKey || link.patternKey === context.patternKey) && (!context.clusterId || link.clusterId === context.clusterId));
  }

  function scopedRows(model, stage, context = selection) {
    const links = relevantLinks(model, context);
    if (stage === "hospitations") {
      const visits = model.hospitations.filter((row) => row.contextMatches !== false);
      if (context.hospitationId) return visits.filter((row) => row.id === context.hospitationId);
      if (!(context.hospitationId || context.observationId || context.patternKey || context.clusterId)) return visits;
      const ids = new Set(scopedRows(model, "observations", context).map((row) => row.hospitationId));
      return visits.filter((row) => ids.has(row.id));
    }
    if (stage === "observations") {
      const patternIds = new Set(model.patternMap.get(context.patternKey)?.observationIds || []);
      return model.observations.filter((row) => (!context.hospitationId || row.hospitationId === context.hospitationId) && (!context.observationId || row.id === context.observationId) && (!context.patternKey || patternIds.has(row.id)) && (!context.clusterId || links.some((link) => link.observationIds.includes(row.id))));
    }
    if (stage === "pattern") {
      return model.patterns.filter((pattern) => (!context.hospitationId || pattern.observationIds.some((id) => model.observationMap.get(id)?.hospitationId === context.hospitationId)) && (!context.patternKey || pattern.key === context.patternKey) && (!context.observationId || pattern.observationIds.includes(context.observationId)) && (!context.clusterId || links.some((link) => link.patternKey === pattern.key)));
    }
    return (data?.clusters || []).filter((cluster) => (!context.clusterId || cluster.id === context.clusterId) && (!(context.hospitationId || context.observationId || context.patternKey) || links.some((link) => link.clusterId === cluster.id)));
  }

  function patternLinks(pattern, model) {
    return relevantLinks(model).filter((link) => link.patternKey === pattern.key);
  }

  function clusterLinks(cluster, model) {
    return relevantLinks(model).filter((link) => link.clusterId === cluster.id);
  }

  function recordReference(stage, source, model) {
    const number = stage === "pattern" ? model.patternNumbers.get(source.key) : ["hypothesis", "nextStep"].includes(stage) ? model.clusterNumbers.get(source.id) : Number(source.displayNumber);
    return `${{ hospitations: "T", pattern: "M", hypothesis: "H", nextStep: "N" }[stage] || ""}${String(number || 0).padStart(2, "0")}`;
  }

  function columnDefinitions(stage = selection.stage) {
    const idColumn = { key: "reference", label: "ID", compact: true };
    if (stage === "hospitations") return [
      idColumn,
      { key: "title", label: "Hospitation", required: true, wide: true },
      { key: "contact", label: "Kontakt", filter: true },
      { key: "sector", label: "Sektor", filter: true },
      { key: "date", label: "Termin", filter: true },
      { key: "status", label: "Status", filter: true },
      { key: "observations", label: "Beobachtungen", number: true, filter: true },
      { key: "documentation", label: "Dokumentation", filter: true, defaultHidden: true },
      { key: "owner", label: "Zuständig", filter: true, defaultHidden: true },
      { key: "city", label: "Ort", filter: true, defaultHidden: true }
    ];
    if (stage === "observations") return [
      { key: "number", label: "ID", number: true },
      { key: "title", label: "Beobachtung", required: true, wide: true },
      { key: "origin", label: "Hospitation", filter: true },
      { key: "date", label: "Termin", filter: true },
      { key: "phase", label: "Prozessphase", filter: true, help: "Gespeicherte Kodierung der Beobachtung: In welchem Abschnitt des Versorgungsablaufs liegt sie? Im Beobachtungsdetail einsehbar und bearbeitbar." },
      { key: "patterns", label: "Muster", number: true, filter: true, defaultHidden: true }
    ];
    if (stage === "pattern") return [
      idColumn,
      { key: "pattern", label: "Muster", required: true, filter: true, wide: true },
      { key: "type", label: "Art", filter: true },
      { key: "phase", label: "Prozessphase", filter: true, help: "Gespeicherte Kodierung der Beobachtung: In welchem Abschnitt des Versorgungsablaufs liegt sie? Im Beobachtungsdetail einsehbar und bearbeitbar." },
      { key: "observations", label: "Beobachtungen", number: true, filter: true },
      { key: "hospitations", label: "Hospitationen", number: true, filter: true },
      { key: "hypotheses", label: "Hypothesen", number: true, filter: true }
    ];
    if (stage === "hypothesis") return [
      idColumn,
      { key: "title", label: "Hypothese", required: true, wide: true },
      { key: "population", label: "Zielgruppe", filter: true },
      { key: "outcome", label: "Messgröße", filter: true },
      { key: "patterns", label: "Muster", number: true, filter: true },
      { key: "nextStep", label: "Nächster Schritt", defaultHidden: true }
    ];
    return [
      idColumn,
      { key: "title", label: "Nächster Schritt", required: true, wide: true },
      { key: "population", label: "Zielgruppe", filter: true },
      { key: "hypothesis", label: "Bezugshypothese" },
      { key: "status", label: "Status", filter: true }
    ];
  }

  function tableRows(model, stage = selection.stage) {
    const sourceRows = stage === "hospitations" && showArchive ? model.archivedHospitations : scopedRows(model, stage);
    return sourceRows.map((source) => {
      let values;
      if (stage === "hospitations") {
        values = { reference: recordReference(stage, source, model), title: text(source.organizationName || source.title || source.contactName) || "Hospitation", contact: text(source.contactName) || "Nicht zugeordnet", date: text(source.dateLabel) || formatDate(source.scheduledOn), status: text(source.status) || "Offen", sector: text(source.sector) || "Noch offen", documentation: text(source.documentation) || "Offen", owner: text(source.owner) || "Nicht zugeordnet", city: text(source.city) || "Noch offen", observations: model.observations.filter((row) => row.hospitationId === source.id).length };
      } else if (stage === "observations") {
        const origin = rowContext(source);
        values = { number: Number(source._chronologicalNumber) || 0, title: text(source.title) || "Beobachtung ohne Titel", origin: origin.name, date: origin.date, phase: text(source.processPhase) || "Noch offen", patterns: model.patterns.filter((pattern) => pattern.observationIds.includes(source.id)).length };
      } else if (stage === "pattern") {
        const pathContext = { ...selection, patternKey: source.key };
        const observationCount = scopedRows(model, "observations", pathContext).length;
        const hospitationCount = scopedRows(model, "hospitations", pathContext).length;
        values = { reference: recordReference(stage, source, model), type: text(source.comparisonType) || "Noch offen", pattern: patternLabel(source), phase: text(source.processPhase) || "Noch offen", observations: observationCount, hospitations: hospitationCount, hypotheses: unique(patternLinks(source, model).map((link) => link.clusterId)).length };
      } else if (stage === "hypothesis") {
        values = { reference: recordReference(stage, source, model), title: source.hypothesis.title, population: source.hypothesis.study?.population || "Noch offen", outcome: source.hypothesis.study?.outcome || "Noch offen", patterns: unique(clusterLinks(source, model).map((link) => link.patternKey)).length, nextStep: source.nextStep.title };
      } else {
        values = { reference: recordReference(stage, source, model), title: source.nextStep.title, population: source.hypothesis.study?.population || "Noch offen", hypothesis: source.hypothesis.title, status: source.nextStep.status || "Prüfvorschlag" };
      }
      return { id: String(source.id || source.key), source, values };
    });
  }

  function filteredRows(rows, stage = selection.stage) {
    const state = stateFor(stage);
    const query = state.query.toLocaleLowerCase("de-DE");
    const columns = columnDefinitions(stage);
    const sortedColumn = columns.find((column) => column.key === state.sort);
    return rows.filter((row) => (!query || [...Object.values(row.values), row.source.description, row.source.observed, row.source.title, row.source.searchText].some((value) => text(value).toLocaleLowerCase("de-DE").includes(query))) && Object.entries(state.filters).every(([key, value]) => value === "" || text(row.values[key]) === value)).sort((left, right) => {
      let result;
      if (sortedColumn?.number) result = Number(left.values[state.sort]) - Number(right.values[state.sort]);
      else if (state.sort === "date") {
        const toStamp = (value) => text(value).split(".").reverse().join("-");
        result = toStamp(left.values.date).localeCompare(toStamp(right.values.date));
      } else result = text(left.values[state.sort]).localeCompare(text(right.values[state.sort]), "de", { numeric: true, sensitivity: "base" });
      return (state.direction === "desc" ? -1 : 1) * result || left.id.localeCompare(right.id);
    });
  }

  function visibleColumns(stage = selection.stage) {
    const all = columnDefinitions(stage);
    const visible = stateFor(stage).columns;
    return all.filter((column) => column.required || (visible ? visible.includes(column.key) : !column.defaultHidden));
  }

  const icons = {
    work: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18M3 14h18M8 4v16"></path>',
    read: '<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
    hospitations: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18M12 14v5m-2.5-2.5h5"></path>',
    observations: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.6"></circle>',
    pattern: '<circle cx="6" cy="7" r="2.4"></circle><circle cx="18" cy="7" r="2.4"></circle><circle cx="12" cy="17" r="2.4"></circle><path d="m8.2 8.2 2.6 6.2m5-6.2-2.6 6.2M8.4 7h7.2"></path>',
    hypothesis: '<path d="M9 18h6M10 22h4"></path><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5C14.8 15.3 14.5 16 14.5 17h-5c0-1-.3-1.7-1.3-2.5Z"></path>',
    nextStep: '<path d="M5 19V5M5 6h10l-2 3 2 3H5m9 6 2 2 4-5"></path>',
    search: '<circle cx="10" cy="10" r="6"></circle><path d="m15 15 5 5"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v6m0-10v.5"></path>',
    sort: '<path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"></path>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"></path>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M15 4v16"></path>',
    export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"></path>',
    open: '<path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"></path>',
    chevron: '<path d="m7 10 5 5 5-5"></path>'
  };
  const svg = (name) => window.HospitationFrameworkIcons?.svg(name) || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.chevron}</svg>`;
  const action = (attributes, label, className = "") => `<button type="button" class="hs-link ${className}" ${attributes}>${label}</button>`;
  const empty = (value = "Noch offen") => `<span class="hs-open">${escape(value)}</span>`;

  function stepsMarkup(model) {
    return `<nav class="hospitation-synthesis__steps" aria-label="Auswertungsschritte"><ol>${stages.map((stage) => `<li data-stage-tone="${stage.id}"><button type="button" data-synthesis-stage="${stage.id}" ${selection.stage === stage.id ? 'aria-current="step"' : ""}><span class="hs-step-icon">${svg(stage.id)}</span><span class="hs-step-copy"><strong>${stage.label}</strong></span><span class="hs-step-count">${scopedRows(model, stage.id).length}</span></button></li>`).join("")}</ol></nav>`;
  }

  function pathMarkup(model) {
    if (!(selection.hospitationId || selection.observationId || selection.patternKey || selection.clusterId)) return "";
    const observation = model.observationMap.get(selection.observationId);
    const pattern = model.patternMap.get(selection.patternKey);
    const cluster = data?.clusters.find((entry) => entry.id === selection.clusterId);
    const visit = model.hospitationMap.get(selection.hospitationId);
    const labels = [visit?.organizationName || visit?.contactName || visit?.title, observation?.title, pattern ? patternName(pattern) : "", cluster?.hypothesis.title, cluster?.nextStep.title];
    return `<section class="hs-path" aria-label="Ausgewählte Herleitung"><div class="hs-path-heading"><strong>Ausgewählte Herleitung</strong>${action('data-synthesis-reset', 'Alle Einträge anzeigen <span aria-hidden="true">×</span>')}</div><ol>${stages.map((stage, index) => {
      const rows = scopedRows(model, stage.id);
      const single = rows.length === 1 ? rows[0] : null;
      const singleLabel = single ? stage.id === "pattern" ? patternName(single) : stage.id === "hypothesis" ? single.hypothesis.title : stage.id === "nextStep" ? single.nextStep.title : stage.id === "hospitations" ? single.organizationName || single.contactName || single.title : single.title : "";
      const label = labels[index] || singleLabel || (rows.length ? plural(rows.length, stage.singular, stage.label) : "Verbindung offen");
      return `<li data-stage-tone="${stage.id}"><button type="button" data-synthesis-stage="${stage.id}" title="${escape(label)}"><small>${stage.label}</small><span>${escape(label)}</span></button></li>`;
    }).join("")}</ol></section>`;
  }

  function menuButton(type, label, icon, active = false) {
    return `<button type="button" class="hs-tool ${active ? "is-active" : ""}" data-synthesis-menu="${type}" aria-expanded="${menu?.anchor === `[data-synthesis-menu="${type}"]`}" aria-controls="hs-controls-menu">${svg(icon)}<span>${label}</span>${svg("chevron")}</button>`;
  }

  function positionControls() {
    const panel = current?.container.querySelector("#hs-controls-menu");
    const trigger = menu?.anchor && current?.container.querySelector(menu.anchor);
    if (!panel || !trigger) return;
    const viewport = window.visualViewport;
    const bounds = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0, width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight };
    const rect = trigger.getBoundingClientRect();
    const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
    const mobile = bounds.width <= 600;
    // A virtual keyboard may hide the original trigger while the menu is in use.
    const mobileMenuFocused = mobile && panel.contains(document.activeElement);
    if (!mobileMenuFocused && (rect.bottom < bounds.top || rect.top > bottom || rect.right < bounds.left || rect.left > right)) { closeControls(false); return; }
    // The top layer avoids clipping and stacking contexts from the app shell.
    if (typeof panel.showPopover === "function" && !panel.matches(":popover-open")) panel.showPopover();
    const margin = 12, gap = 8;
    const width = Math.min(menu.type === "filter" ? 370 : 340, bounds.width - margin * 2);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, Math.min(520, bounds.height - margin * 2))}px`;
    const desiredHeight = panel.getBoundingClientRect().height;
    const below = bottom - rect.bottom - margin - gap;
    const above = rect.top - bounds.top - margin - gap;
    const placement = mobile ? "bottom" : below >= desiredHeight || below >= above ? "below" : "above";
    const available = mobile ? bounds.height - margin * 2 : placement === "below" ? below : above;
    panel.style.maxHeight = `${Math.max(0, Math.min(520, available))}px`;
    const height = panel.getBoundingClientRect().height;
    const left = mobile ? bounds.left + (bounds.width - width) / 2 : Math.max(bounds.left + margin, Math.min(rect.left, right - width - margin));
    const top = mobile ? bottom - margin - height : placement === "below" ? rect.bottom + gap : rect.top - height - gap;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(bounds.top + margin, Math.min(top, bottom - height - margin))}px`;
    panel.dataset.placement = placement;
    panel.dataset.positioned = "true";
  }

  function closeControls(restoreFocus = true) {
    const anchor = menu?.anchor;
    menu = null;
    current?.container.querySelector("#hs-controls-menu")?.remove();
    current?.container.querySelectorAll('[data-synthesis-menu], [data-synthesis-filter-open]').forEach((button) => button.setAttribute("aria-expanded", "false"));
    if (restoreFocus && anchor) current?.container.querySelector(anchor)?.focus({ preventScroll: true });
  }

  function toolbarMarkup(rows) {
    const state = stateFor();
    const label = stages.find((stage) => stage.id === selection.stage).label;
    const filterCount = Object.values(state.filters).filter(Boolean).length;
    const modes = [["work", "Arbeitsansicht"], ["read", "Leseansicht"]];
    const views = `<div class="hs-view-switch" role="group" aria-label="Darstellung wählen">${modes.map(([mode, title]) => `<button type="button" data-synthesis-mode="${mode}" aria-pressed="${viewMode === mode}">${svg(mode)}<span>${title}</span></button>`).join("")}</div>`;
    const calendar = selection.stage === "hospitations"
      ? `<button type="button" class="hs-tool hs-tool--calendar${viewMode === "calendar" ? " is-active" : ""}" data-synthesis-mode="calendar" aria-pressed="${viewMode === "calendar"}">${svg("calendar")}<span>Kalender</span></button>` : "";
    const secondaryTool = viewMode === "work" ? menuButton("columns", "Spalten", "columns")
      : viewMode === "read" ? readingSortMarkup() : '<span class="hs-toolbar-slot" aria-hidden="true"></span>';
    const context = selection.stage === "hospitations" && text(current.options.contextLabel)
      ? `<div class="hs-table-summary"><span>Termine für ${escape(current.options.contextLabel)}</span><button type="button" class="hs-tool" data-synthesis-context-clear>Filter aufheben</button></div>` : "";
    const create = selection.stage === "observations" && typeof current.options.createObservation === "function"
      ? '<button type="button" class="hs-tool hs-tool--primary hs-toolbar-create" data-synthesis-create><span aria-hidden="true">+</span><span>Neue Beobachtung</span></button>'
      : selection.stage === "hospitations" && typeof current.options.createHospitation === "function"
        ? '<button type="button" class="hs-tool hs-tool--primary hs-toolbar-create" data-synthesis-create-hospitation><span aria-hidden="true">+</span><span>Hospitation planen</span></button>' : "";
    return `${context}<div class="hs-toolbar" data-has-create="${Boolean(create)}" data-has-calendar="${Boolean(calendar)}">${create}<label class="hs-search">${svg("search")}<span class="hospitation-synthesis__sr-only">${label} durchsuchen</span><input type="search" data-synthesis-search aria-label="${label} durchsuchen" placeholder="${label} durchsuchen" value="${escape(state.query)}" autocomplete="off"></label>${views}<div class="hs-tools hs-toolbar-tools">${menuButton("filter", `Filter${filterCount ? ` (${filterCount})` : ""}`, "filter", !!filterCount)}${secondaryTool}${calendar}</div>${controlsMarkup(rows)}</div>`;
  }

  function footerToolsMarkup() {
    const archive = selection.stage === "hospitations" && current.options.canViewArchive
      ? `<button type="button" class="hs-tool" data-synthesis-archive aria-pressed="${showArchive}">${showArchive ? "Aktuelle Termine" : `Archiv (${current.model.archivedHospitations.length})`}</button>` : "";
    const exportButton = typeof current.options.exportRows === "function" ? menuButton("export", "Export", "export") : "";
    return archive || exportButton ? `<nav class="hs-footer-tools" aria-label="Weitere Aktionen">${archive}${exportButton}</nav>` : "";
  }

  function renderCalendarResults() {
    const host = current?.container.querySelector("[data-synthesis-calendar]");
    if (!host || selection.stage !== "hospitations" || viewMode !== "calendar") return;
    if (!window.HospitationFrameworkCalendar) {
      host.innerHTML = '<p role="status">Der Kalender wird geladen. Bitte lade die Seite erneut.</p>';
      return;
    }
    window.HospitationFrameworkCalendar.render(host, {
      rows: filteredRows(tableRows(current.model)).map((row) => ({ ...row.source, title: row.values.title })),
      openHospitation: current.options.openHospitation
    });
  }

  function readingSortMarkup() {
    const state = stateFor();
    const label = columnDefinitions().find((column) => column.key === state.sort)?.label || "Sortierung";
    return menuButton("sort", `${escape(label)} <span aria-hidden="true">${state.direction === "asc" ? "↑" : "↓"}</span>`, "sort", false).replace('aria-controls=', `aria-label="Sortieren nach ${escape(label)}, ${state.direction === "asc" ? "aufsteigend" : "absteigend"}" aria-controls=`);
  }

  function filterOptions(rows, column, query = "") {
    const state = stateFor();
    const counts = new Map();
    rows.forEach((row) => { const value = text(row.values[column.key]); if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    const values = [...counts.keys()].sort((a, b) => a.localeCompare(b, "de", { numeric: true })).filter((value) => value.toLocaleLowerCase("de-DE").includes(query.toLocaleLowerCase("de-DE")));
    const option = (value, label, count) => `<button type="button" class="hs-menu-option" data-synthesis-filter-value="${column.key}" data-synthesis-filter-choice="${escape(value)}" aria-pressed="${(state.filters[column.key] || "") === value}"><span>${escape(label)}</span><small>${count}</small><span class="hs-option-check" aria-hidden="true">${(state.filters[column.key] || "") === value ? "✓" : ""}</span></button>`;
    return option("", "Alle", rows.length) + values.map((value) => option(value, value, counts.get(value))).join("") + (!values.length ? '<p class="hs-menu-empty">Kein passender Wert.</p>' : "");
  }

  function controlsMarkup(rows) {
    if (!menu || (menu.type === "data" && !data)) return "";
    const state = stateFor(), columns = columnDefinitions();
    let content, title;
    if (menu.type === "sort") {
      title = "Sortieren nach";
      content = `<div class="hs-sort-options" role="group" aria-label="Sortierspalte">${columns.map((column) => `<button type="button" class="hs-menu-option" data-synthesis-sort-field="${column.key}" aria-pressed="${state.sort === column.key}"><span>${column.label}</span><span class="hs-option-check" aria-hidden="true">${state.sort === column.key ? "✓" : ""}</span></button>`).join("")}</div><div class="hs-sort-directions" role="group" aria-label="Sortierrichtung">${[["asc", "Aufsteigend", "↑"], ["desc", "Absteigend", "↓"]].map(([direction, label, arrow]) => `<button type="button" class="hs-menu-option" data-synthesis-sort-order="${direction}" aria-pressed="${state.direction === direction}"><span aria-hidden="true">${arrow}</span><span>${label}</span></button>`).join("")}</div>`;
    } else if (menu.type === "columns") {
      title = "Sichtbare Spalten";
      const visible = visibleColumns().map((column) => column.key);
      content = `<div class="hs-column-options">${columns.map((column) => `<label><input type="checkbox" data-synthesis-column="${column.key}" ${visible.includes(column.key) ? "checked" : ""} ${column.required ? "disabled" : ""}><span>${column.label}</span>${column.required ? '<small>Fest</small>' : ""}</label>`).join("")}</div>`;
    } else if (menu.type === "export") {
      title = "Exportieren";
      content = `<p class="hs-menu-description">${filteredRows(rows).length} gefilterte Einträge mit den gewählten Tabellenspalten.</p><button type="button" class="hs-menu-option" data-synthesis-export="docx"><span>Word-Dokument</span><small>.docx</small></button><button type="button" class="hs-menu-option" data-synthesis-export="pdf"><span>PDF-Dokument</span><small>.pdf</small></button>`;
    } else if (menu.type === "data") {
      title = "Datenstand";
      const notices = dataNotices(current.model);
      content = notices.length ? `<ul class="hs-data-notices">${notices.map((notice) => `<li>${escape(notice)}</li>`).join("")}</ul>` : '<p class="hs-menu-description">Keine Änderungen gegenüber dem Stand der Auswertung erkannt.</p>';
      content += `<div class="hs-data-baseline">${baselineMarkup()}</div>`;
    } else {
      title = "Ansicht filtern";
      const filterColumns = columns.filter((column) => column.filter);
      const column = filterColumns.find((entry) => entry.key === menu.column) || filterColumns[0];
      content = `<div class="hs-filter-fields" role="group" aria-label="Filterspalte">${filterColumns.map((entry) => `<button type="button" class="hs-filter-field" data-synthesis-filter-column="${entry.key}" aria-pressed="${column.key === entry.key}">${entry.label}</button>`).join("")}</div><label class="hs-filter-value-search">${svg("search")}<input type="search" data-synthesis-filter-search aria-label="${escape(column.label)} im Filter suchen" placeholder="${escape(column.label)} suchen" value="${escape(menu.query || "")}" autocomplete="off"></label><div class="hs-filter-values" role="group" aria-label="${escape(column.label)} auswählen">${filterOptions(rows, column, menu.query || "")}</div>${Object.values(state.filters).some(Boolean) ? action('data-synthesis-filter-reset', 'Filter zurücksetzen') : ""}`;
    }
    return `<div class="hs-controls-menu" id="hs-controls-menu" popover="manual" role="region" aria-label="${title}"><strong>${title}</strong>${content}<button type="button" class="hs-menu-close" data-synthesis-menu-close aria-label="Menü schließen">×</button></div>`;
  }

  function dataStatusMarkup(model) {
    if (!data) return "";
    const notices = dataNotices(model);
    return `<button type="button" class="hs-data-status" data-synthesis-menu="data" data-has-notices="${!!notices.length}" aria-expanded="${menu?.type === "data"}" aria-controls="hs-controls-menu">${svg("info")}<span>Datenstand${notices.length ? ` <strong>${plural(notices.length, "Hinweis", "Hinweise")}</strong>` : ""}</span>${svg("chevron")}</button>`;
  }

  function filterStripMarkup() {
    const filters = Object.entries(stateFor().filters).filter(([, value]) => value);
    if (!filters.length) return "";
    return `<div class="hs-filter-strip" aria-label="Aktive Filter">${filters.map(([key, value]) => action(`data-synthesis-filter-clear="${key}"`, `${escape(columnDefinitions().find((column) => column.key === key)?.label || key)}: ${escape(short(value, 80))} <span aria-hidden="true">×</span>`, "hs-filter-chip")).join("")}${action('data-synthesis-filter-reset', 'Alle zurücksetzen')}</div>`;
  }

  function sortMarkup(column) {
    const state = stateFor();
    const direction = state.sort === column.key ? state.direction : "none";
    return `<div class="hs-column-head"><button type="button" class="${direction !== "none" ? "is-sorted" : ""}" data-synthesis-sort="${column.key}" aria-label="${escape(column.label)} ${direction === "none" ? "sortieren" : direction === "asc" ? "aufsteigend sortiert; absteigend sortieren" : "absteigend sortiert; aufsteigend sortieren"}"><span>${column.label}</span><span class="hs-sort" aria-hidden="true">${direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</span></button>${column.filter ? `<button type="button" class="hs-header-filter ${state.filters[column.key] ? "is-active" : ""}" data-synthesis-filter-open="${column.key}" aria-label="${escape(column.label)} filtern${state.filters[column.key] ? `; aktiv: ${escape(state.filters[column.key])}` : ""}" aria-expanded="${menu?.anchor === `[data-synthesis-filter-open="${column.key}"]`}" aria-controls="hs-controls-menu">${svg("filter")}</button>` : ""}${column.help ? `<span class="hs-column-help" tabindex="0" title="${escape(column.help)}" aria-label="${escape(column.help)}">?</span>` : ""}</div>`;
  }

  function observationStatus(row) {
    if (!data) return "";
    if (data.baseline.excludedObservationIds.includes(row.id)) return "Platzhalter";
    if (!data.baseline.observationIds.includes(row.id)) return "Neu · Einordnung offen";
    if (isChanged(row)) return "Verändert · Zuordnung prüfen";
    return "";
  }

  function avatarMarkup(name, value) {
    const initials = text(name).replace(/\b(?:Dr|Prof)\.?/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("de-DE") || "?";
    let src = "";
    try {
      const url = new URL(text(value), window.location.href);
      if (text(value) && ((url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password) || /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(text(value)))) src = url.href;
    } catch (_) { /* Initials are the complete fallback for an unavailable image. */ }
    return `<span class="hs-avatar" aria-hidden="true"><span>${escape(initials)}</span>${src ? `<img src="${escape(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-synthesis-avatar>` : ""}</span>`;
  }

  function identityMarkup(name, contact, avatar) {
    return `<span class="hs-identity">${avatarMarkup(contact || name, avatar)}<span class="hs-identity-copy"><span>${escape(name)}</span>${contact && contact !== name ? `<small>${escape(contact)}</small>` : ""}</span></span>`;
  }

  function dateMarkup(value) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text(value));
    if (!match) return value ? escape(value) : empty("Noch ohne Termin");
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T12:00:00`);
    const formatted = date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    return `<time class="hs-date" datetime="${iso}" title="${escape(formatted)}" aria-label="${escape(formatted)}">${svg("hospitations")}<span>${escape(formatted)}</span></time>`;
  }

  function countLink(attributes, value, singular, multiple, tone) {
    const count = Number(value) || 0;
    const label = plural(count, singular, multiple);
    const density = count === 0 ? "empty" : count <= 1 ? "low" : count <= 3 ? "mid" : count <= 6 ? "high" : "max";
    // Separate light and dark ranges keep text contrast across every numeric shade.
    const stops = [[0, 0], [1, 14], [3, 28], [8, 48], [13, 70], [25, 96]];
    const upper = stops.findIndex(([quantity]) => quantity >= count);
    const [lowCount, lowStrength] = stops[Math.max(0, upper - 1)] || stops.at(-1);
    const [highCount, highStrength] = upper < 0 ? stops.at(-1) : stops[upper];
    const strength = upper < 0 ? 96 : highCount === lowCount ? highStrength
      : lowStrength + (count - lowCount) * (highStrength - lowStrength) / (highCount - lowCount);
    return action(`${attributes} aria-haspopup="dialog" data-stage-tone="${tone}" data-density="${density}" data-count-contrast="${strength >= 76 ? "light" : "dark"}" style="--hs-count-strength:${strength}%" title="${escape(label)} im Detail" aria-label="${escape(label)} im Detail öffnen"`, `<strong>${count}</strong>`, "hs-count-link");
  }

  function statusMarkup(value) {
    const status = text(value) || "Noch offen";
    const pending = /entwurf|ungeprüft|offen|prüf|vorschlag/i.test(status);
    return `<span class="hs-tag ${pending ? "hs-tag--pending" : "hs-tag--neutral"}"><span class="hs-status-dot" aria-hidden="true"></span>${escape(status)}</span>`;
  }

  function studyTitleMarkup(row) {
    return action(`data-synthesis-detail="${escape(row.id)}" aria-haspopup="dialog" title="${escape(row.values.title)}"`, `<span class="hs-table-statement">${escape(row.values.title)}</span>`, "hs-study-title");
  }

  function cellMarkup(row, column, model) {
    const { source, values } = row;
    const value = values[column.key];
    if (column.key === "reference" || column.key === "number") return recordBadge(value, column.key === "number");
    if (column.key === "date") return dateMarkup(value);
    if (column.key === "phase") return `<span class="hs-tag hs-tag--phase">${escape(value)}</span>`;
    if (selection.stage === "hospitations") {
      if (column.key === "title") return action(`data-synthesis-hospitation="${escape(row.id)}"`, escape(value), "hs-main-link");
      if (column.key === "contact") return identityMarkup(value, "", source.avatarUrl);
      if (column.key === "status") return `<span class="hs-tag ${value === "Durchgeführt" ? "hs-tag--success" : "hs-tag--neutral"}">${escape(value)}</span>`;
      if (column.key === "observations") return countLink(`data-synthesis-hospitation="${escape(row.id)}"`, value, "Beobachtung", "Beobachtungen", "observations");
    }
    if (selection.stage === "observations") {
      if (column.key === "title") return `${action(`data-synthesis-observation="${escape(row.id)}"`, escape(value), "hs-main-link")}${observationStatus(source) ? `<small class="hs-record-status">${escape(observationStatus(source))}</small>` : ""}`;
      if (column.key === "patterns") return countLink(`data-synthesis-observation="${escape(row.id)}"`, value, "Muster", "Muster", "pattern");
      if (column.key === "origin") { const origin = rowContext(source); return identityMarkup(origin.name, origin.contact, origin.avatarUrl); }
    }
    if (selection.stage === "pattern") {
      if (column.key === "type") return `<span class="hs-tag ${value === "Gelungener Ablauf" ? "hs-tag--success" : value === "Hindernis" ? "hs-tag--warning" : "hs-tag--neutral"}">${escape(value)}</span>`;
      if (column.key === "pattern") return action(`data-synthesis-detail="${escape(row.id)}" aria-haspopup="dialog"`, escape(value), "hs-main-link");
      if (column.key === "observations") return countLink(`data-synthesis-detail="${escape(row.id)}" data-synthesis-section="observations"`, value, "Beobachtung", "Beobachtungen", "observations");
      if (column.key === "hospitations") return countLink(`data-synthesis-detail="${escape(row.id)}" data-synthesis-section="hospitations"`, value, "Hospitation", "Hospitationen", "hospitations");
      if (column.key === "hypotheses") return countLink(`data-synthesis-detail="${escape(row.id)}" data-synthesis-section="connections"`, value, "Hypothese", "Hypothesen", "hypothesis");
    }
    if (selection.stage === "hypothesis") {
      if (column.key === "title") return studyTitleMarkup(row);
      if (column.key === "patterns") return countLink(`data-synthesis-detail="${escape(row.id)}" data-synthesis-section="connections"`, value, "Muster", "Muster", "pattern");
      if (column.key === "nextStep") return action(`data-synthesis-detail="${escape(row.id)}" data-synthesis-detail-stage="nextStep" aria-haspopup="dialog" aria-label="${escape(value)}" title="${escape(value)}"`, `<span class="hs-related-reference" data-stage-tone="nextStep">${escape(recordReference("nextStep", source, model))}</span><span class="hs-table-preview">${escape(value)}</span>`, "hs-related-link");
    }
    if (selection.stage === "nextStep") {
      if (column.key === "title") return studyTitleMarkup(row);
      if (column.key === "hypothesis") return action(`data-synthesis-detail="${escape(row.id)}" data-synthesis-detail-stage="hypothesis" aria-haspopup="dialog" aria-label="${escape(value)}" title="${escape(value)}"`, `<span class="hs-related-reference" data-stage-tone="hypothesis">${escape(recordReference("hypothesis", source, model))}</span><span class="hs-table-preview">${escape(value)}</span>`, "hs-related-link");
      if (column.key === "status") return statusMarkup(value);
    }
    if (["hypothesis", "nextStep"].includes(selection.stage) && ["population", "outcome"].includes(column.key)) return `<span class="${column.key === "population" ? "hs-population-label" : "hs-metric-label"}" title="${escape(value)}">${escape(short(value, 64))}</span>`;
    return value === "" || value == null ? empty("—") : escape(value);
  }

  function observationEvidence(ids, model) {
    return `<ul class="hs-evidence-list">${unique(ids).map((id) => {
      const row = model.observationMap.get(id);
      if (!row) return `<li>${empty("Beobachtung nicht verfügbar")}</li>`;
      const reference = Number(row._chronologicalNumber) || row.id;
      return `<li><div><span class="hs-evidence-reference">Beobachtung ${escape(reference)}</span>${action(`data-synthesis-observation="${escape(id)}"`, escape(row.title || "Beobachtung ohne Titel"), "hs-main-link")}${isChanged(row) ? '<small class="hs-record-status">Verändert · Zuordnung prüfen</small>' : ""}</div>${action(`data-synthesis-observation="${escape(id)}" aria-haspopup="dialog"`, 'Details <span aria-hidden="true">→</span>')}</li>`;
    }).join("")}</ul>`;
  }

  function connectionMarkup(links, model, stage) {
    if (!links.length) return '<p class="hs-detail-open">Für diese Auswahl ist noch keine Muster-Hypothesen-Verbindung hinterlegt.</p>';
    return `<div class="hs-connections">${links.map((link) => {
      const cluster = data?.clusters.find((entry) => entry.id === link.clusterId);
      const pattern = model.patternMap.get(link.patternKey);
      const showingHypothesis = stage === "hypothesis";
      const destination = showingHypothesis
        ? action(`data-synthesis-detail="${escape(link.patternKey)}" data-synthesis-detail-stage="pattern" aria-haspopup="dialog"`, escape(patternName(pattern)), "hs-main-link")
        : action(`data-synthesis-detail="${escape(cluster.id)}" data-synthesis-detail-stage="hypothesis" aria-haspopup="dialog"`, escape(cluster.hypothesis.title), "hs-main-link");
      return `<section class="hs-connection"><div class="hs-connection-heading"><span class="hs-relation hs-relation--${escape(link.relation)}">${escape(roles[link.relation])}</span>${showingHypothesis ? "" : `<span>${escape(patternName(pattern))}</span>`}</div>${destination}<p>${escape(link.note)}</p>${observationEvidence(link.observationIds, model)}${link.unavailableIds?.length ? '<p class="hospitation-synthesis__warning">Ein Teil dieser Verknüpfung ist nicht mehr im zugehörigen Muster verfügbar. Zuordnung prüfen.</p>' : ""}</section>`;
    }).join("")}</div>`;
  }

  function detailCopy(label, value) {
    return `<article class="observation-detail-copy-block"><div class="observation-detail-field__head"><span>${escape(label)}</span></div><div class="observation-detail-field__value"><div class="observation-detail-field__text"><p>${escape(value)}</p></div></div></article>`;
  }

  function detailCodes(items) {
    return `<dl class="observation-detail-coding-grid hs-detail-code-grid">${items.map(([label, value, tone = "phase"]) => `<div class="observation-detail-coding-item ${value ? "" : "is-empty"}"><dt>${escape(label)}</dt><dd><span class="observation-coding-badge observation-coding-badge--${tone}">${escape(value || "Noch offen")}</span></dd></div>`).join("")}</dl>`;
  }

  function detailSection(label, markup, className = "", section = "") {
    return `<section class="observation-detail-card ${className}${section ? " hs-detail-section-target" : ""}"${section ? ` data-synthesis-detail-section="${section}" tabindex="-1" aria-label="${escape(label)}"` : ""}><h4 class="detail-section-title">${escape(label)}</h4>${markup}</section>`;
  }

  function detailFinding(row, description, label, stage) {
    return `<section class="observation-detail-card observation-detail-card--finding"><div class="observation-detail-heading">${recordBadge(row.values.reference, false, "observation-detail-id")}<h3 class="detail-section-title observation-detail-title" id="synthesis-detail-title">${escape(stage === "pattern" ? patternName(row.source) : row.values.title)}</h3></div>${description ? `<div class="observation-detail-copy-grid">${detailCopy(label, description)}</div>` : ""}</section>`;
  }

  function hospitationSources(ids, model) {
    const visitIds = unique(ids.map((id) => model.observationMap.get(id)?.hospitationId).filter(Boolean));
    if (!visitIds.length) return "";
    return detailSection("Hospitationen", `<div class="hs-source-profiles">${visitIds.map((id) => {
      const visit = model.hospitationMap.get(id);
      if (!visit) return "";
      const name = visit.organizationName || visit.title || visit.contactName || "Hospitation";
      const date = visit.dateLabel || (visit.scheduledOn ? formatDate(visit.scheduledOn) : "");
      return `<article class="hs-source-profile">${identityMarkup(name, visit.contactName, visit.avatarUrl)}<div class="hs-source-profile-meta">${dateMarkup(date)}${action(`data-synthesis-hospitation="${escape(id)}"`, "In Hospitation öffnen", "hs-source-action")}</div></article>`;
    }).join("")}</div>`, "observation-detail-card--source", "hospitations");
  }

  function sourceEvidenceMarkup(entries, model) {
    return `<ul class="hs-source-evidence">${entries.map((entry) => {
      const observation = model.observationMap.get(entry.observationId);
      const reference = observation ? `Beobachtung ${Number(observation._chronologicalNumber) || observation.id}` : entry.registerId || "Beobachtung nicht verfügbar";
      return `<li class="hs-source-evidence-card" data-stage-tone="observations"><div class="hs-source-evidence-head"><span class="hs-evidence-reference"${entry.registerId ? ` title="Register: ${escape(entry.registerId)}"` : ""}>${escape(reference)}</span><span class="hs-relation hs-relation--${escape(entry.role)}">${escape(roles[entry.role])}</span></div>${observation ? `<h5>${action(`data-synthesis-observation="${escape(entry.observationId)}" aria-haspopup="dialog"`, escape(observation.title || "Beobachtung ohne Titel"), "hs-main-link")}</h5><p class="hs-source-evidence-copy">${escape(short(observation.description || observation.observed, 280)) || "Noch keine Beschreibung"}</p>${isChanged(observation) ? '<p class="hospitation-synthesis__warning">Beobachtung verändert – Zuordnung prüfen.</p>' : ""}` : '<p class="hospitation-synthesis__warning">Diese Beobachtung ist im aktuellen Datenstand nicht verfügbar.</p>'}<details class="hs-source-evidence-interpretation"><summary>Einordnung in der Themenauswertung</summary><p class="hs-source-evidence-note"><strong>${escape(entry.label)}</strong>${entry.note ? `<br>${escape(entry.note)}` : ""}</p></details>${observation ? action(`data-synthesis-observation="${escape(entry.observationId)}" aria-haspopup="dialog"`, 'Beobachtung öffnen <span aria-hidden="true">→</span>') : ""}</li>`;
    }).join("")}</ul>`;
  }

  function clusterDetail(row, model, stage) {
    const cluster = row.source;
    const hypothesis = cluster.hypothesis;
    const study = hypothesis.study;
    const links = clusterLinks(cluster, model);
    const isStep = stage === "nextStep";
    const checks = isStep ? cluster.nextStep.checks : study?.items || [];
    const evidenceIds = unique([...cluster.evidence.map((entry) => entry.observationId), ...links.flatMap((link) => link.observationIds)]);
    const codeItems = [["Zielgruppe", study?.population, "phase"], ["Messgröße", study?.outcome, "impact"], ["Prüfansatz", study?.method, "problem"]];
    const destination = isStep ? "hypothesis" : "nextStep";
    const nextAction = action(`data-synthesis-detail="${escape(cluster.id)}" data-synthesis-detail-stage="${destination}" aria-haspopup="dialog"`, `${svg(destination)}<span><small>${isStep ? "Bezugshypothese" : "Nächster Schritt"} ${escape(recordReference(destination, cluster, model))}</small><strong>${escape(isStep ? hypothesis.title : cluster.nextStep.title)}</strong></span>`, "hs-detail-path-action");
    const evidence = cluster.evidence.length ? `${sourceEvidenceMarkup(cluster.evidence.slice(0, 2), model)}${cluster.evidence.length > 2 ? `<details class="observation-detail-assessment hs-detail-disclosure"><summary>Weitere ${cluster.evidence.length - 2} Beobachtungsbelege</summary>${sourceEvidenceMarkup(cluster.evidence.slice(2), model)}</details>` : ""}` : '<p class="hs-detail-open">Für dieses Thema sind noch keine Beobachtungsbelege hinterlegt.</p>';
    return `<div class="observation-detail-content detail-profile hs-detail-body hs-study-detail">${detailFinding(row, isStep ? cluster.nextStep.description : "", "Vorhaben", stage)}<div class="hs-detail-state">${statusMarkup(isStep ? cluster.nextStep.status || "Prüfvorschlag" : hypothesis.status || "Hypothesenentwurf · ungeprüft")}</div>${detailSection("Beobachtungen aus der Themenauswertung", evidence, "hs-detail-evidence", "observations")}<div class="hs-detail-implications"><section class="hs-detail-implication"><h4>Versorgungsbedarf</h4><p>${escape(cluster.pattern.careNeed)}</p></section><section class="hs-detail-implication"><h4>Möglicher gematik-Beitrag</h4><p>${escape(cluster.gematik.contribution)}</p></section></div><div class="hs-detail-next" data-stage-tone="${destination}">${nextAction}</div><details class="observation-detail-assessment hs-detail-disclosure"><summary>${isStep ? "Prüfschritte und Vorgehen" : "Prüfkonzept: Zielgruppe, Messgröße und Methode"}</summary>${!isStep ? detailCopy("Erläuterung der Hypothese", hypothesis.description) : ""}${detailCodes(codeItems)}${checks.length ? `<h4>${isStep ? "Konkretes Vorgehen" : "Fragen für die Erhebung"}</h4><ol class="hs-checks">${checks.map((check, index) => `<li><span aria-hidden="true">${index + 1}</span><p>${escape(check)}</p></li>`).join("")}</ol>` : ""}</details>${detailSection("Verknüpfungen mit Mustern", connectionMarkup(links, model, "hypothesis"), "", "connections")}<details class="observation-detail-assessment hs-detail-disclosure"><summary>Thematische Einordnung, gematik-Bezug und offene Fragen</summary><div>${detailCopy("Thematische Einordnung", cluster.pattern.description)}<div class="hs-topic-list">${cluster.gematik.topics.map((topic) => `<span class="observation-coding-badge observation-coding-badge--phase">${escape(topic)}</span>`).join("")}</div>${detailCopy("Zuständigkeitsgrenze", cluster.gematik.boundary)}${cluster.gematik.sources.length ? `<ul>${cluster.gematik.sources.map((source) => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></li>`).join("")}</ul>` : ""}${cluster.openQuestions.length ? `<h4>Offene Fragen</h4><ul>${cluster.openQuestions.map((question) => `<li>${escape(question)}</li>`).join("")}</ul>` : ""}</div></details>${hospitationSources(evidenceIds, model)}</div>`;
  }

  function rowDetailMarkup(row, model, stage) {
    if (stage !== "pattern") return clusterDetail(row, model, stage);
    const links = patternLinks(row.source, model);
    const observationIds = scopedRows(model, "observations", { ...selection, patternKey: row.source.key }).map((entry) => entry.id);
    return `<div class="observation-detail-content detail-profile hs-detail-body">${detailFinding(row, text(row.source.description), "Muster", stage)}${detailSection("Gemeinsame Kodierung der Beobachtungen", `<p class="hs-coding-note">Alle ${row.source.observationIds.length} zugeordneten Beobachtungen teilen diese Prozessphase, diesen Problemtyp und dieselbe zusammengefasste Beobachtungsart.</p>${detailCodes([["Prozessphase", row.source.processPhase, "phase"], ["Problemtyp", row.source.problemType, "problem"], ["Beobachtungsart", row.source.comparisonType, row.source.comparisonType === "Gelungener Ablauf" ? "usage" : "impact"]])}`, "observation-detail-card--coding")}${detailSection("Zugehörige Beobachtungen", observationEvidence(observationIds, model), "", "observations")}${detailSection("Passende Hypothesen", connectionMarkup(links, model, stage), "", "connections")}${hospitationSources(observationIds, model)}</div>`;
  }

  function patternSummary(rows) {
    const kinds = [
      { name: "Hindernis", label: "Hindernisse", tone: "warning" },
      { name: "Gelungener Ablauf", label: "Gelungene Abläufe", tone: "success" },
      { name: "Kontext", label: "Kontext", tone: "neutral" }
    ];
    unique(rows.map((row) => row.values.type)).filter((name) => !kinds.some((kind) => kind.name === name)).forEach((name) => kinds.push({ name, label: name, tone: "neutral" }));
    const counts = kinds.map((kind) => ({ ...kind, count: rows.filter((row) => row.values.type === kind.name).length }));
    return `<section class="hs-pattern-summary" aria-label="Musterarten"><div class="hs-pattern-summary-heading"><h3>Musterarten</h3><span>${rows.length} Muster in dieser Ansicht</span></div><div class="hs-pattern-summary-bar" aria-hidden="true">${counts.filter((kind) => kind.count).map((kind) => `<span data-pattern-type="${kind.tone}" style="flex-grow:${kind.count}"></span>`).join("")}</div><ul class="hs-pattern-legend">${counts.map((kind) => `<li data-pattern-type="${kind.tone}"><span class="hs-pattern-dot" aria-hidden="true"></span><strong>${kind.count}</strong><span>${escape(kind.label)}</span></li>`).join("")}</ul><div class="hs-pattern-types" aria-label="Alle Musterarten"><span>Alle Arten</span><span class="hs-pattern-type" data-pattern-type="hindernis">Hindernis</span><span class="hs-pattern-type" data-pattern-type="gelungener-ablauf">Gelungener Ablauf</span><span class="hs-pattern-type" data-pattern-type="kontext">Kontext</span></div><details class="hs-pattern-method"><summary>Herkunft der Musterarten</summary><p>Die Musterart fasst die bereits hinterlegte Beobachtungsart zusammen: Hindernis für eine beschriebene Schwierigkeit, gelungener Ablauf für einen nachvollziehbar gelingenden Schritt, Kontext für Bedingungen und Abläufe ohne diese Bewertung. Sie ist keine zusätzliche Bewertung des Musters.</p><p>Die Musteransicht bündelt vergleichbar codierte Beobachtungen aus mindestens zwei Hospitationen. Die fachliche Prüfung erfolgt im Fallvergleich; gleiche Codes allein bestätigen keine Hypothese.</p></details></section>`;
  }

  function readingFacts(items) {
    const available = items.filter(([, value]) => text(value));
    return available.length ? `<dl class="hs-reading-facts">${available.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>` : "";
  }

  function readingSection(label, content) {
    return content ? `<section class="hs-reading-section"><h4 class="hs-reading-section-title">${escape(label)}</h4>${content}</section>` : "";
  }

  function readingSources(ids, model, evidence = []) {
    const observations = unique(ids).map((id) => model.observationMap.get(id)).filter(Boolean);
    return observations.length ? `<ul class="hs-reading-sources">${observations.map((observation) => {
      const role = evidence.find((entry) => entry.observationId === observation.id)?.role;
      return `<li><div class="hs-reading-source-head"><span class="hs-evidence-reference">Beobachtung ${escape(Number(observation._chronologicalNumber) || observation.id)}</span>${role ? `<span class="hs-relation hs-relation--${escape(role)}">${escape(roles[role])}</span>` : ""}${action(`data-synthesis-observation="${escape(observation.id)}" aria-haspopup="dialog"`, escape(observation.title || "Beobachtung ohne Titel"), "hs-reading-source")}</div><p class="hs-reading-source-copy">${escape(short(observation.description || observation.observed, 220)) || "Noch keine Beschreibung"}</p><span class="hs-reading-source-origin">${escape(rowContext(observation).name)}</span>${isChanged(observation) ? '<small class="hs-record-status">Beobachtung verändert – Zuordnung prüfen</small>' : ""}</li>`;
    }).join("")}</ul>` : "";
  }

  function readingPath(label, cluster, destination, model) {
    return `<div class="hs-reading-path" data-stage-tone="${destination}"><span>${escape(label)}</span>${action(`data-synthesis-detail="${escape(cluster.id)}" data-synthesis-detail-stage="${destination}" aria-haspopup="dialog"`, `${recordBadge(recordReference(destination, cluster, model))}<span>${escape(cluster[destination].title)}</span><span aria-hidden="true">→</span>`, "hs-reading-source")}</div>`;
  }

  function readingCard(row, model) {
    const { source, values } = row;
    const stage = selection.stage;
    const reference = values.reference || values.number || "–";
    const target = stage === "hospitations" ? `data-synthesis-hospitation="${escape(row.id)}"` : stage === "observations" ? `data-synthesis-observation="${escape(row.id)}"` : `data-synthesis-detail="${escape(row.id)}"`;
    const title = stage === "pattern" ? values.pattern : values.title;
    let tag = "", context = "", copy = "", evidence = "", facts = "", footer = "", path = "", metadata = "";
    if (stage === "hospitations") {
      tag = `<span class="hs-tag ${values.status === "Durchgeführt" ? "hs-tag--success" : "hs-tag--neutral"}">${escape(values.status)}</span>`;
      context = `${identityMarkup(values.contact, "", source.avatarUrl)}${dateMarkup(values.date)}`;
      const observations = model.observations.filter((entry) => entry.hospitationId === source.id);
      evidence = readingSection("Dokumentierte Beobachtungen", readingSources(observations.slice(0, 2).map((entry) => entry.id), model));
      if (observations.length > 2) evidence += action(`${target} aria-haspopup="dialog"`, `Alle ${observations.length} Beobachtungen in der Hospitation`, "hs-reading-source");
      footer = escape(plural(values.observations, "Beobachtung", "Beobachtungen"));
    } else if (stage === "observations") {
      tag = observationStatus(source) ? statusMarkup(observationStatus(source)) : "";
      copy = escape(source.description || source.observed) || empty("Noch keine Beschreibung");
      facts = `<div class="hs-reading-codes">${detailCodes([["Prozessphase", source.processPhase, "phase"], ["Problemtyp", source.problemType, "problem"], ["Auswirkung", source.impact, "impact"]])}</div>${readingFacts([["Konkrete Folge", source.immediateConsequence], ["Offene Frage", source.uncertainty], ["Quellenbezug", sourceReference(source)]])}`;
      const origin = rowContext(source);
      metadata = `${identityMarkup(origin.name, origin.contact, origin.avatarUrl)}${dateMarkup(origin.date)}`;
    } else if (stage === "pattern") {
      tag = `<span class="hs-pattern-type" data-pattern-type="${values.type === "Hindernis" ? "hindernis" : values.type === "Gelungener Ablauf" ? "gelungener-ablauf" : "kontext"}">${escape(values.type)}</span>`;
      copy = escape(source.description);
      facts = readingSection("Gemeinsame Kodierung der zugeordneten Beobachtungen", `<div class="hs-reading-codes">${detailCodes([["Prozessphase", source.processPhase, "phase"], ["Problemtyp", source.problemType, "problem"]])}</div>`);
      const observations = scopedRows(model, "observations", { ...selection, patternKey: source.key });
      evidence = readingSection("Zugehörige Beobachtungen", readingSources(observations.map((entry) => entry.id), model));
      const clusters = unique(patternLinks(source, model).map((link) => link.clusterId)).map((id) => data?.clusters.find((cluster) => cluster.id === id)).filter(Boolean);
      path = clusters.map((cluster) => readingPath("Verknüpfte Hypothese", cluster, "hypothesis", model)).join("");
      footer = `${escape(plural(values.observations, "Beobachtung", "Beobachtungen"))} aus ${escape(plural(values.hospitations, "Hospitation", "Hospitationen"))}`;
    } else {
      tag = statusMarkup(stage === "hypothesis" ? source.hypothesis.status || "Hypothesenentwurf · ungeprüft" : values.status);
      copy = escape(stage === "nextStep" ? source.nextStep.description : source.hypothesis.description);
      const study = source.hypothesis.study;
      facts = readingFacts([["Versorgungsbedarf", source.pattern.careNeed], ["Zielgruppe", study?.population || "Noch offen"], ["Messgröße", study?.outcome || "Noch offen"], ["Prüfansatz", study?.method || "Noch offen"]]);
      if (stage === "nextStep") {
        evidence = readingSection("Konkretes Vorgehen", source.nextStep.checks.length ? `<ol class="hs-reading-checks">${source.nextStep.checks.map((check) => `<li>${escape(check)}</li>`).join("")}</ol>` : "");
        path = readingPath("Bezugshypothese", source, "hypothesis", model);
      } else {
        evidence = readingSection("Beobachtungen aus der Themenauswertung", readingSources(source.evidence.slice(0, 2).map((entry) => entry.observationId), model, source.evidence));
        if (source.evidence.length > 2) evidence += action(`${target} data-synthesis-section="observations" aria-haspopup="dialog"`, `Alle ${source.evidence.length} Beobachtungsbelege ansehen`, "hs-reading-source");
        path = readingPath("Nächster Schritt", source, "nextStep", model);
      }
      footer = escape(plural(source.evidence.length, "Beleg hinterlegt", "Belege hinterlegt"));
    }
    return `<li class="hs-reading-card" data-synthesis-row="${escape(row.id)}"><div class="hs-reading-card-head"><div class="hs-reading-meta">${recordBadge(reference, selection.stage === "observations")}${metadata}</div>${tag}</div><h3 class="hs-reading-title">${action(`${target} aria-haspopup="dialog"`, escape(title), "hs-reading-open")}</h3>${context ? `<div class="hs-reading-context">${context}</div>` : ""}${copy ? `<p class="hs-reading-copy">${copy}</p>` : ""}${facts}${evidence}${path}<footer class="hs-reading-footer"><span>${footer}</span>${action(`${target} aria-haspopup="dialog" aria-label="${escape(title)} – Details öffnen"`, 'Details <span aria-hidden="true">→</span>')}</footer></li>`;
  }

  function emptyMarkup(rows, items) {
    if (items.length) return "";
    const anyPath = selection.hospitationId || selection.observationId || selection.patternKey || selection.clusterId;
    return `<div class="hs-empty"><strong>${rows.length ? "Keine passenden Einträge" : anyPath ? "Diese Verbindung ist noch offen" : "Noch keine Einträge"}</strong><p>${rows.length ? "Suche oder Filter anpassen." : anyPath ? "Für die ausgewählte Herleitung liegt hier noch keine Verknüpfung vor." : "Neue Einträge erscheinen hier, sobald sie vorliegen."}</p>${rows.length ? action('data-synthesis-view-reset', 'Suche und Filter zurücksetzen') : anyPath ? action('data-synthesis-reset', 'Alle Einträge anzeigen') : ""}</div>`;
  }

  function resultsMarkup(rows, model) {
    // Both presentations share the exact records, order and filter state.
    const items = filteredRows(rows);
    const label = stages.find((stage) => stage.id === selection.stage).label;
    const summary = `<div class="hs-table-summary"><span role="status">${items.length === rows.length ? `${items.length} ${label}` : `${items.length} von ${rows.length} ${label}`}${selection.stage === "hospitations" && showArchive ? " im Archiv" : ""}</span>${dataStatusMarkup(model)}</div>`;
    const content = viewMode === "calendar" && selection.stage === "hospitations"
      ? '<div data-synthesis-calendar></div>' : viewMode === "read" ? `${items.length ? `<ul class="hs-reading-grid" data-stage="${selection.stage}" aria-label="${label} – Leseansicht">${items.map((row) => readingCard(row, model)).join("")}</ul>` : emptyMarkup(rows, items)}` : tableMarkup(rows, model, items);
    return `${summary}${content}${selection.stage === "pattern" ? patternSummary(items) : ""}`;
  }

  function tableMarkup(rows, model, items) {
    const state = stateFor();
    const columns = visibleColumns();
    const label = stages.find((stage) => stage.id === selection.stage).label;
    const noRows = items.length ? "" : `<tr><td colspan="${columns.length}">${emptyMarkup(rows, items)}</td></tr>`;
    return `<div class="hs-table-scroll" tabindex="0" role="region" aria-label="${label}"><table class="hs-table" data-synthesis-table="${selection.stage}" data-column-count="${columns.length}"><caption class="hospitation-synthesis__sr-only">${label} – sortierbare und filterbare Arbeitsansicht</caption><colgroup>${columns.map((column) => `<col class="hs-col-${column.key}${column.wide ? " hs-col-wide" : ""}${column.number ? " hs-col-number" : ""}${column.compact ? " hs-col-id" : ""}">`).join("")}</colgroup><thead><tr>${columns.map((column) => `<th scope="col" class="${state.sort === column.key ? "is-sorted" : ""} ${state.filters[column.key] ? "is-filtered" : ""}" aria-sort="${state.sort === column.key ? state.direction === "asc" ? "ascending" : "descending" : "none"}">${sortMarkup(column)}</th>`).join("")}</tr></thead><tbody>${items.map((row) => {
      return `<tr data-synthesis-row="${escape(row.id)}">${columns.map((column) => `<td data-label="${column.label}" class="${column.number ? "hs-cell-number" : ""}${column.wide ? " hs-cell-main" : ""}">${cellMarkup(row, column, model)}</td>`).join("")}</tr>`;
    }).join("")}${noRows}</tbody></table></div>`;
  }

  function dataNotices(model) {
    if (!data) return [];
    const baselineIds = new Set(data.baseline.observationIds);
    const currentIds = new Set(model.observations.map((row) => row.id));
    const additions = model.observations.filter((row) => !baselineIds.has(row.id)).length;
    const removals = data.baseline.observationIds.filter((id) => !currentIds.has(id)).length;
    const changes = model.observations.filter(isChanged).length;
    const brokenLinks = data.patternLinks.filter((link) => !model.links.some((available) => available.patternKey === link.patternKey && available.clusterId === link.clusterId && available.relation === link.relation && !available.unavailableIds.length)).length;
    const notices = [];
    if (additions) notices.push(`${plural(additions, "neue Beobachtung", "neue Beobachtungen")} – noch nicht eingeordnet.`);
    if (removals) notices.push(`${plural(removals, "Eintrag ist", "Einträge sind")} nicht verfügbar.`);
    if (changes) notices.push(`${plural(changes, "Beobachtung wurde", "Beobachtungen wurden")} verändert – Zuordnung prüfen.`);
    if (brokenLinks) notices.push(`${plural(brokenLinks, "Verknüpfung benötigt", "Verknüpfungen benötigen")} eine Prüfung des Belegbezugs.`);
    return notices;
  }

  function baselineMarkup() {
    if (!data) return "";
    const baseline = data.baseline;
    const status = { draft: "Arbeitsfassung – fachliche Prüfung offen", pending: "Fachliche Prüfung offen", reviewed: "Fachlich geprüft" }[data.reviewStatus] || data.reviewStatus;
    return `<details class="hospitation-synthesis__basis-details"><summary>Stand der Auswertung · ${escape(formatDate(data.date))}</summary><div><p>${escape(baseline.total)} Einträge · ${escape(baseline.substantive)} inhaltliche Beschreibungen aus ${escape(baseline.hospitations)} Hospitationen · ${escape(baseline.completedHospitations)} Hospitationen insgesamt absolviert.</p>${status ? `<p><strong>${escape(status)}</strong></p>` : ""}${baseline.note ? `<p>${escape(baseline.note)}</p>` : ""}<p>${escape(baseline.excludedObservationIds.length)} Platzhalter sind nicht als Beleg ausgewertet. Zuordnungen können sich überschneiden und beschreiben keine Häufigkeit in der Versorgung.</p><p>Die Verbindungen zwischen Mustern und Hypothesen sind begründete Arbeitszuordnungen. Stützender Hinweis, gelingender Vergleich und ergänzender Kontext bleiben getrennt.</p></div></details>`;
  }

  function closeDetails() {
    if (!detailDrawer?.classList.contains("is-open")) return false;
    detailDrawer.classList.remove("is-open");
    detailDrawer.setAttribute("aria-hidden", "true");
    detailState = null;
    detailHistory = [];
    current?.options.onDetailToggle?.();
    return true;
  }

  function clearSourceReturn() {
    sourceReturn?.observer?.disconnect();
    sourceReturn?.button?.remove();
    sourceReturn = null;
  }

  function detailSnapshot() {
    const body = detailDrawer.querySelector("#synthesis-detail-body");
    return { ...detailState, scrollTop: body.scrollTop, disclosures: Array.from(body.querySelectorAll("details")).map((element) => element.open) };
  }

  function restoreDisclosures(saved) {
    detailDrawer.querySelectorAll("#synthesis-detail-body details").forEach((element, index) => {
      if (saved?.disclosures?.[index] != null) element.open = saved.disclosures[index];
    });
  }

  function restoreSourceReturn(saved) {
    if (!saved || !current || saved.hash !== window.location.hash) return;
    detailHistory = saved.history;
    const available = tableRows(current.model, saved.state.stage).some((row) => row.id === saved.state.id);
    if (!available) {
      detailHistory = [];
      const feedback = current.container.querySelector(".hospitation-synthesis__feedback");
      if (feedback) feedback.textContent = "Diese Detailansicht ist nach der Änderung nicht mehr verfügbar.";
      current.container.querySelector('[aria-current="step"]')?.focus({ preventScroll: true });
      return;
    }
    openDetails(saved.state.id, saved.state.stage, "", false);
    restoreDisclosures(saved.state);
    window.requestAnimationFrame(() => {
      if (detailState?.id !== saved.state.id || detailState.stage !== saved.state.stage) return;
      detailDrawer.querySelector("#synthesis-detail-body").scrollTop = saved.scrollTop;
      detailDrawer.querySelectorAll("button")[saved.triggerIndex]?.focus({ preventScroll: true });
    });
  }

  function attachSourceReturn(saved, visit) {
    const source = document.getElementById(visit ? "hospitation-editor-drawer" : "observation-detail-drawer");
    const close = document.getElementById(visit ? "hospitation-editor-close" : "observation-detail-close");
    const header = source?.querySelector(".format-participant-header");
    if (!source?.classList.contains("is-open") || !close || !header) return false;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "hs-drawer-back hs-source-back";
    back.dataset.synthesisSourceBack = "";
    back.textContent = "← Zurück";
    back.setAttribute("aria-label", `Zurück ${saved.state.stage === "pattern" ? "zum Muster" : saved.state.stage === "hypothesis" ? "zur Hypothese" : "zum nächsten Schritt"}`);
    back.title = back.getAttribute("aria-label");
    sourceReturn = { ...saved, button: back, observer: null };
    back.addEventListener("click", async () => {
      const pending = sourceReturn;
      if (!pending) return;
      // Use the original close path so pending edits/saves keep their existing guards.
      close.click();
      if (source.classList.contains("is-open")) return;
      clearSourceReturn();
      await new Promise(window.requestAnimationFrame);
      restoreSourceReturn(pending);
    });
    header.prepend(back);
    const observer = new MutationObserver(() => {
      if (!source.classList.contains("is-open")) clearSourceReturn();
    });
    sourceReturn.observer = observer;
    observer.observe(source, { attributes: true, attributeFilter: ["class"] });
    return true;
  }

  function ensureDetailDrawer() {
    if (detailDrawer) return detailDrawer;
    detailDrawer = document.createElement("aside");
    detailDrawer.id = "synthesis-detail-drawer";
    detailDrawer.className = "format-participant-drawer hs-detail-drawer hospitation-synthesis";
    detailDrawer.setAttribute("aria-hidden", "true");
    detailDrawer.innerHTML = `<div class="format-participant-overlay" data-synthesis-detail-close></div><section class="format-participant-panel" role="dialog" aria-modal="true" aria-labelledby="synthesis-detail-title"><header class="format-participant-header"><button type="button" class="hs-drawer-back" data-synthesis-detail-back hidden aria-label="Zur vorherigen Detailansicht">← Zurück</button><div class="hs-drawer-heading" id="synthesis-detail-label"></div><button type="button" class="import-close" data-dialog-close data-synthesis-detail-close aria-label="Details schließen">×</button></header><div class="format-participant-body" id="synthesis-detail-body"></div></section>`;
    document.body.append(detailDrawer);
    detailDrawer.addEventListener("error", (event) => { if (event.target.matches?.("[data-synthesis-avatar]")) event.target.remove(); }, true);
    detailDrawer.addEventListener("click", (event) => {
      if (event.target.closest("[data-synthesis-detail-close]")) { closeDetails(); return; }
      if (current) handlers.get(current.container)?.(event);
    });
    document.addEventListener("keydown", (event) => {
      if (!detailDrawer.classList.contains("is-open") || event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      closeDetails();
    }, true);
    window.addEventListener("hashchange", () => { closeDetails(); clearSourceReturn(); });
    return detailDrawer;
  }

  function openDetails(id, detailStage = selection.stage, section = "", remember = true) {
    if (!current || !["pattern", "hypothesis", "nextStep"].includes(detailStage)) return;
    const row = tableRows(current.model, detailStage).find((entry) => entry.id === id);
    if (!row) return;
    clearSourceReturn();
    const stage = stages.find((entry) => entry.id === detailStage);
    const drawer = ensureDetailDrawer();
    const wasOpen = drawer.classList.contains("is-open");
    if (wasOpen && detailState && remember) detailHistory.push(detailSnapshot());
    detailState = { id, stage: detailStage, section };
    menu = null;
    current.container.querySelector("#hs-controls-menu")?.remove();
    current.container.querySelectorAll('[aria-expanded="true"]').forEach((element) => element.setAttribute("aria-expanded", "false"));
    drawer.dataset.stageTone = stage.id;
    drawer.querySelector("[data-synthesis-detail-back]").hidden = !detailHistory.length;
    drawer.querySelector("#synthesis-detail-label").innerHTML = `${svg(stage.id)}<span>${stage.singular}</span>`;
    drawer.querySelector("[data-dialog-close]").setAttribute("aria-label", `${stage.singular} schließen`);
    drawer.querySelector("#synthesis-detail-body").innerHTML = rowDetailMarkup(row, current.model, detailStage);
    // Connected attribute changes let the application's shared modal manager
    // handle focus, focus return and inert background for this drawer as well.
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    drawer.querySelector("#synthesis-detail-body").scrollTop = 0;
    current.options.onDetailToggle?.();
    window.requestAnimationFrame(() => {
      if (detailState?.id !== id || detailState?.stage !== detailStage || !drawer.classList.contains("is-open")) return;
      const target = Array.from(drawer.querySelectorAll("[data-synthesis-detail-section]")).find((element) => element.dataset.synthesisDetailSection === section);
      if (target) { target.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true }); }
      else if (wasOpen) drawer.querySelector("[data-dialog-close]").focus({ preventScroll: true });
    });
  }

  const controlsFocusSelectors = ['#hs-controls-menu [aria-pressed="true"]', '#hs-controls-menu input:not(:disabled)', '#hs-controls-menu button:not(:disabled)'];

  function focusTarget(container, selectors) {
    return (Array.isArray(selectors) ? selectors : [selectors]).map((selector) => container.querySelector(selector)).find(Boolean);
  }

  function rerender(focusSelector) {
    if (!current) return;
    const version = ++focusVersion;
    const { container, options } = current;
    render(container, options);
    if (focusSelector) window.requestAnimationFrame(() => {
      // Do not steal focus from a control the user reached since this render.
      if (version !== focusVersion || (document.activeElement !== document.body && document.activeElement?.isConnected)) return;
      focusTarget(container, focusSelector)?.focus({ preventScroll: true });
    });
  }

  function updateTable() {
    if (!current) return;
    const results = current.container.querySelector("[data-synthesis-results]");
    if (results) {
      const scrollLeft = results.querySelector(".hs-table-scroll")?.scrollLeft || 0;
      results.innerHTML = resultsMarkup(tableRows(current.model), current.model);
      const scroller = results.querySelector(".hs-table-scroll");
      if (scroller) scroller.scrollLeft = scrollLeft;
      renderCalendarResults();
      positionControls();
    }
  }

  function followPattern(key, target) {
    selection.patternKey = key;
    selection.stage = stageId(target);
    clearViewFilters();
  }

  function followCluster(id, target, patternKey) {
    selection.clusterId = id;
    if (patternKey) selection.patternKey = patternKey;
    selection.stage = stageId(target);
    clearViewFilters();
  }

  async function externalAction(button) {
    const feedback = current.container.querySelector(".hospitation-synthesis__feedback");
    try {
      if (button.hasAttribute("data-synthesis-export")) {
        if (typeof current.options.exportRows !== "function") throw new Error("Export ist nicht verfügbar.");
        const columns = visibleColumns();
        const payload = { stage: selection.stage, columns: columns.map(({ key, label }) => ({ key, label })), rows: filteredRows(tableRows(current.model)).map((row) => Object.fromEntries(columns.map((column) => [column.key, text(row.values[column.key])]))) };
        await current.options.exportRows(button.dataset.synthesisExport, payload);
        menu = null;
        rerender('[data-synthesis-menu="export"]');
      } else {
        const visit = button.hasAttribute("data-synthesis-hospitation") || button.hasAttribute("data-synthesis-create-hospitation");
        const create = button.hasAttribute("data-synthesis-create") || button.hasAttribute("data-synthesis-create-hospitation");
        const callback = visit ? create ? current.options.createHospitation : current.options.openHospitation : create ? current.options.createObservation : current.options.openObservation;
        if (typeof callback !== "function") throw new Error("Aktion ist nicht verfügbar.");
        clearSourceReturn();
        const saved = !create && detailState && detailDrawer?.contains(button) ? {
          state: detailSnapshot(), history: detailHistory.slice(), hash: window.location.hash,
          scrollTop: detailDrawer.querySelector("#synthesis-detail-body").scrollTop,
          triggerIndex: Array.from(detailDrawer.querySelectorAll("button")).indexOf(button)
        } : null;
        if (closeDetails()) await new Promise(window.requestAnimationFrame);
        try {
          if (await callback(create ? undefined : (visit ? button.dataset.synthesisHospitation : button.dataset.synthesisObservation)) === false) throw new Error("Eintrag ist nicht verfügbar.");
          if (saved) attachSourceReturn(saved, visit);
        } catch (error) {
          restoreSourceReturn(saved);
          throw error;
        }
      }
    } catch (error) {
      if (feedback) feedback.textContent = button.hasAttribute("data-synthesis-export") ? text(error?.message) || "Der Export konnte nicht erstellt werden. Bitte erneut versuchen." : "Der Eintrag konnte nicht geöffnet werden. Bitte den Datenstand neu laden.";
    }
  }

  function bind(container) {
    if (handlers.has(container)) return;
    const handler = async (event) => {
      const button = event.target.closest("button");
      if (!button || (!container.contains(button) && !detailDrawer?.contains(button)) || button.disabled || current?.container !== container) return;
      const ds = button.dataset;
      const state = stateFor();
      const previousStage = selection.stage;
      if (button.hasAttribute("data-synthesis-stage")) {
        closeDetails();
        selection.stage = stageId(ds.synthesisStage); menu = null;
        rerender('.hospitation-synthesis__steps [aria-current="step"]');
        notifyStageChange(previousStage);
      } else if (button.hasAttribute("data-synthesis-archive")) {
        showArchive = !showArchive; closeDetails(); clearViewFilters();
        if (showArchive) state.mode = "work";
        rerender('[data-synthesis-archive]');
      } else if (button.hasAttribute("data-synthesis-context-clear")) {
        if (typeof current.options.clearContext === "function") current.options.clearContext();
      } else if (button.hasAttribute("data-synthesis-mode")) {
        state.mode = ds.synthesisMode === "calendar" && selection.stage === "hospitations" ? "calendar" : ds.synthesisMode === "read" ? "read" : "work";
        viewMode = state.mode; menu = null;
        rerender(`[data-synthesis-mode="${viewMode}"]`);
      } else if (button.hasAttribute("data-synthesis-sort-direction")) {
        state.direction = state.direction === "asc" ? "desc" : "asc";
        rerender('[data-synthesis-sort-direction]');
      } else if (button.hasAttribute("data-synthesis-sort-field")) {
        if (!columnDefinitions().some((column) => column.key === ds.synthesisSortField)) return;
        state.sort = ds.synthesisSortField;
        rerender(`[data-synthesis-sort-field="${state.sort}"]`);
      } else if (button.hasAttribute("data-synthesis-sort-order")) {
        state.direction = ds.synthesisSortOrder === "desc" ? "desc" : "asc";
        menu = null; rerender('[data-synthesis-menu="sort"]');
      } else if (button.hasAttribute("data-synthesis-filter-column")) {
        menu = { ...menu, type: "filter", column: ds.synthesisFilterColumn, query: "" };
        rerender('[data-synthesis-filter-search]');
      } else if (button.hasAttribute("data-synthesis-filter-value")) {
        const anchor = menu?.anchor;
        state.filters[ds.synthesisFilterValue] = ds.synthesisFilterChoice;
        menu = null; rerender(anchor || '[data-synthesis-menu="filter"]');
      } else if (button.hasAttribute("data-synthesis-reset")) {
        select("", selection.stage); rerender('.hospitation-synthesis__steps [aria-current="step"]');
      } else if (button.hasAttribute("data-synthesis-follow-hospitation")) {
        selectHospitation(ds.synthesisFollowHospitation, "observations"); rerender('.hospitation-synthesis__steps [aria-current="step"]');
        notifyStageChange(previousStage);
      } else if (button.hasAttribute("data-synthesis-follow-observation")) {
        selectObservation(ds.synthesisFollowObservation, "pattern"); rerender('.hospitation-synthesis__steps [aria-current="step"]');
        notifyStageChange(previousStage);
      } else if (button.hasAttribute("data-synthesis-follow-pattern")) {
        followPattern(ds.synthesisFollowPattern, ds.synthesisTarget); rerender('.hospitation-synthesis__steps [aria-current="step"]');
        notifyStageChange(previousStage);
      } else if (button.hasAttribute("data-synthesis-follow-cluster")) {
        followCluster(ds.synthesisFollowCluster, ds.synthesisTarget, ds.synthesisPatternKey); rerender('.hospitation-synthesis__steps [aria-current="step"]');
        notifyStageChange(previousStage);
      } else if (button.hasAttribute("data-synthesis-sort")) {
        state.direction = state.sort === ds.synthesisSort && state.direction === "asc" ? "desc" : "asc"; state.sort = ds.synthesisSort;
        rerender(`[data-synthesis-sort="${ds.synthesisSort}"]`);
      } else if (button.hasAttribute("data-synthesis-filter-open")) {
        const anchor = `[data-synthesis-filter-open="${ds.synthesisFilterOpen}"]`;
        menu = menu?.anchor === anchor ? null : { type: "filter", column: ds.synthesisFilterOpen, anchor }; rerender(menu ? '[data-synthesis-filter-search]' : anchor);
      } else if (button.hasAttribute("data-synthesis-menu")) {
        const anchor = `[data-synthesis-menu="${ds.synthesisMenu}"]`;
        menu = menu?.anchor === anchor ? null : { type: ds.synthesisMenu, anchor };
        rerender(menu ? controlsFocusSelectors : anchor);
      } else if (button.hasAttribute("data-synthesis-menu-close")) {
        closeControls();
      } else if (button.hasAttribute("data-synthesis-filter-clear")) {
        delete state.filters[ds.synthesisFilterClear]; rerender('[data-synthesis-menu="filter"]');
      } else if (button.hasAttribute("data-synthesis-filter-reset") || button.hasAttribute("data-synthesis-view-reset")) {
        state.filters = {}; if (button.hasAttribute("data-synthesis-view-reset")) state.query = "";
        menu = null; rerender('[data-synthesis-search]');
      } else if (button.hasAttribute("data-synthesis-detail")) {
        openDetails(ds.synthesisDetail, ds.synthesisDetailStage || selection.stage, ds.synthesisSection || "");
      } else if (button.hasAttribute("data-synthesis-detail-back")) {
        const previous = detailHistory.pop();
        if (previous) {
          openDetails(previous.id, previous.stage, "", false);
          restoreDisclosures(previous);
          window.requestAnimationFrame(() => { if (detailState?.id === previous.id) detailDrawer.querySelector("#synthesis-detail-body").scrollTop = previous.scrollTop; });
        }
      } else if (button.hasAttribute("data-synthesis-observation") || button.hasAttribute("data-synthesis-hospitation") || button.hasAttribute("data-synthesis-create-hospitation") || button.hasAttribute("data-synthesis-create") || button.hasAttribute("data-synthesis-export")) {
        await externalAction(button);
      }
    };
    container.addEventListener("click", handler);
    container.addEventListener("error", (event) => { if (event.target.matches?.("[data-synthesis-avatar]")) event.target.remove(); }, true);
    container.addEventListener("input", (event) => {
      if (current?.container !== container) return;
      if (event.target.matches("[data-synthesis-search]")) {
        stateFor().query = event.target.value;
        updateTable();
      } else if (event.target.matches("[data-synthesis-filter-search]") && menu?.type === "filter") {
        menu.query = event.target.value;
        const column = columnDefinitions().find((entry) => entry.key === menu.column && entry.filter) || columnDefinitions().find((entry) => entry.filter);
        container.querySelector('.hs-filter-values').innerHTML = filterOptions(tableRows(current.model), column, menu.query);
        positionControls();
      }
    });
    container.addEventListener("change", (event) => {
      if (current?.container !== container) return;
      const target = event.target;
      if (target.matches("[data-synthesis-column]")) {
        const visible = new Set(visibleColumns().map((column) => column.key));
        if (target.checked) visible.add(target.dataset.synthesisColumn); else visible.delete(target.dataset.synthesisColumn);
        stateFor().columns = [...visible]; rerender(`[data-synthesis-column="${target.dataset.synthesisColumn}"]`);
      }
    });
    container.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu) { event.preventDefault(); closeControls(); return; }
      const trigger = event.target.closest('[data-synthesis-menu], [data-synthesis-filter-open]');
      if (trigger && event.key === "ArrowDown") {
        event.preventDefault();
        if (!menu || !trigger.matches(menu.anchor)) trigger.click();
        else focusTarget(container, controlsFocusSelectors)?.focus();
        return;
      }
      if (menu && event.target.closest('#hs-controls-menu') && !event.target.matches('input[type="search"]') && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const group = event.target.closest('.hs-sort-options, .hs-sort-directions, .hs-filter-fields, .hs-filter-values, .hs-column-options');
        if (group) {
          const choices = [...group.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
          const index = choices.indexOf(event.target);
          const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + choices.length) % choices.length;
          event.preventDefault(); choices[next]?.focus(); return;
        }
      }
      const button = event.target.closest(".hospitation-synthesis__steps [data-synthesis-stage]");
      if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const index = stages.findIndex((entry) => entry.id === button.dataset.synthesisStage);
      const next = event.key === "Home" ? 0 : event.key === "End" ? stages.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + stages.length) % stages.length;
      const previousStage = selection.stage;
      event.preventDefault(); closeDetails(); selection.stage = stages[next].id; menu = null;
      rerender('.hospitation-synthesis__steps [aria-current="step"]');
      notifyStageChange(previousStage);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!menu || current?.container !== container || event.target.closest('#hs-controls-menu') || event.target.closest(menu.anchor)) return;
      closeControls(false);
    });
    container.addEventListener("focusout", (event) => {
      const panel = event.target.closest('#hs-controls-menu');
      if (!panel) return;
      window.requestAnimationFrame(() => {
        if (menu && panel.isConnected && !panel.contains(document.activeElement) && !document.activeElement?.matches(menu.anchor)) closeControls(false);
      });
    });
    window.addEventListener("resize", positionControls);
    window.visualViewport?.addEventListener("resize", positionControls);
    window.visualViewport?.addEventListener("scroll", positionControls);
    document.addEventListener("scroll", (event) => {
      if (menu && !event.target.closest?.("#hs-controls-menu")) positionControls();
    }, true);
    handlers.set(container, handler);
  }

  function render(container, options = {}) {
    if (!container || typeof container.querySelector !== "function") return false;
    const previousTable = container.querySelector("[data-synthesis-table]");
    if (previousTable) stateFor(previousTable.dataset.synthesisTable).scrollLeft = container.querySelector(".hs-table-scroll")?.scrollLeft || 0;
    const model = makeModel(options);
    current = { container, options, model };
    saveStagePreference();
    if (selection.clusterId && !data?.clusters.some((entry) => entry.id === selection.clusterId)) selection.clusterId = "";
    const rows = tableRows(model);
    viewMode = stateFor().mode || "work";
    container.innerHTML = `<div class="hospitation-synthesis" data-stage-tone="${selection.stage}" data-view-mode="${viewMode}">${stepsMarkup(model)}${pathMarkup(model)}<section class="hs-workspace" aria-label="${stages.find((stage) => stage.id === selection.stage).label}">${toolbarMarkup(rows)}${filterStripMarkup()}<div data-synthesis-results>${resultsMarkup(rows, model)}</div>${footerToolsMarkup()}</section><p class="hospitation-synthesis__feedback" role="status"></p></div>`;
    bind(container);
    renderCalendarResults();
    const scroller = container.querySelector(".hs-table-scroll");
    if (scroller) scroller.scrollLeft = stateFor().scrollLeft;
    // A responsive layout update must not discard the open drawer or its history.
    if (detailState && !tableRows(model, detailState.stage).some((row) => row.id === detailState.id)) closeDetails();
    if (menu) positionControls();
    return true;
  }

  window.HospitationSynthesis = Object.freeze({
    load,
    getData: () => data,
    getSelection: () => ({ ...selection }),
    render,
    setStage,
    selectStage: setStage,
    closeDetails,
    openDetails,
    select,
    selectObservation,
    selectPattern,
    selectHospitation,
    clustersForObservation
  });
})();
