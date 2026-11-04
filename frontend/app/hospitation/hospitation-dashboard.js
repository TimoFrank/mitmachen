(function () {
  "use strict";
  const controllers = new WeakMap();
  const dialogs = new Set();
  let modalOverflow = null;
  let closeActiveInfo = null;
  function presentDialog(dialog) {
    closeActiveInfo?.();
    if (dialog.open) return;
    if (modalOverflow === null) {
      modalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog.showModal();
  }
  function releaseModalScroll() {
    if (modalOverflow !== null && ![...dialogs].some(dialog=>dialog.open)) {
      document.body.style.overflow = modalOverflow;
      modalOverflow = null;
    }
  }
  let themeSource = null;
  let themeLoadVersion = 0;
  const text = value => String(value ?? "").trim();
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const themeColors = {dokumentation:"#000E52",zugang:"#155FE4",verordnung:"#0F766E",austausch:"#B7791F",beratung:"#7C3AED",praxisbetrieb:"#0891B2",behandlung:"#16A34A",__unassigned:"#D7E0EE"};
  const evidence = {
    reported: "Berichtet",
    source_bound: "Quellengebunden",
    directly_observed: "Direkt beobachtet",
    interpreted: "Interpretation",
    synthetic_source_based: "Synthetisches Beispiel",
    __empty: "Ohne Angabe"
  };
  const sectorColors = { Praxis: "#000E52", Hausarztpraxis: "#155FE4", Facharztpraxis: "#7C3AED", Apotheke: "#0F766E", "": "#D7E0EE" };

  function evidenceKind(record) {
    if (record.evidenceType === "synthetic_source_based" || record.originalEvidenceType === "synthetic_source_based"
      || record.synthetic === true || record.sourceType === "synthetic_source_scenario") return "synthetic_source_based";
    return Object.hasOwn(evidence, record.evidenceType) ? record.evidenceType : "__empty";
  }

  function practiceSubtype(value) {
    const label = text(value);
    if (label === "Diabetes-Facharztpraxis") return "Facharztpraxis";
    return ["Hausarztpraxis", "Facharztpraxis"].includes(label) ? label : "";
  }

  function sectorForVisit(visit, observations) {
    const label = text(visit.sector);
    const registry = window.VersorgungsCompassSectors;
    const sector = practiceSubtype(label) || (registry ? registry.normalizeSector(label) : label);
    if (sector !== "Praxis" || !text(visit.id).startsWith("demo-")) return sector;
    const subtypes = new Set(observations
      .filter(record => record.hospitationId === visit.id && evidenceKind(record) === "synthetic_source_based")
      .map(record => practiceSubtype(record.settingType)).filter(Boolean));
    return subtypes.size === 1 ? [...subtypes][0] : sector;
  }

  function sectorForObservation(record, visitSector) {
    const setting = text(record.settingType);
    const knownSector = window.VersorgungsCompassSectors?.find(setting);
    return practiceSubtype(setting) || (knownSector?.label === setting ? setting : "") || visitSector || knownSector?.label || "";
  }

  function sectorColor(sector) {
    return Object.hasOwn(sectorColors, sector) ? sectorColors[sector] : window.VersorgungsCompassSectors?.colorFor(sector) || "#596F8E";
  }
  const preferenceKey = "hospitation-dashboard-widgets-v2";
  const legacyPreferenceKey = "hospitation-dashboard-widgets-v1";
  function iconMarkup(name) {
    const framework=window.HospitationFrameworkIcons?.svg(name);
    if(framework)return framework;
    const shapes={
      hospitations:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 2v6M17 2v6M3 10.5h18M7.5 14.5h2M13.5 14.5h2M7.5 17.5h2"/>',
      map:'<path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/>',
      themes:'<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9M12 12 6 19"/>',
      sectors:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',
      evidence:'<path d="M14 2H5a1 1 0 0 0-1 1v18h16V8Z"/><path d="M14 2v6h6m-12 6 3 3 5-6"/>',
      coverage:'<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="8" y="2" width="8" height="5" rx="1"/><path d="m8 14 3 3 5-6"/>',
      process:'<circle cx="4" cy="6" r="2"/><circle cx="20" cy="18" r="2"/><path d="M6 6h10a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h6M16 18h2"/>',
      problem:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v.2"/>',
      words:'<path d="M3 5h14M10 5v15M5 20h10M18 11l-4 9m4-9 4 9m-6.5-3h5"/>',
      topics:'<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>',
      products:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M7.5 4.5l9 5v5"/>',
      quotes:'<path d="M4 7h6v6H5c0 3 1 4 4 5m5-11h6v6h-5c0 3 1 4 4 5"/>',
      customize:'<path d="M5 3v6m0 4v8m7-18v12m0 4v2m7-18v3m0 4v11M2 9h6m1 6h6m1-9h6"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.themes}</svg>`;
  }
  const widgetIcon = id => ({map:"map",themes:"themes",sectors:"sectors",evidence:"evidence",coverage:"coverage","process-phases":"process","problem-types":"problem","free-text-terms":"words",topics:"topics","affected-products":"products",quotes:"quotes"}[id] || "pattern");
  const baseWidgets = [
    {id:"map",label:"Deutschlandkarte",note:"Hospitationen nach Bundesland"},
    {id:"themes",label:"Themen der Beobachtungen",note:"Redaktionelle Themenzuordnung"},
    {id:"sectors",label:"Sektoren",note:"Verteilung der beschriebenen Beobachtungen"},
    {id:"evidence",label:"Belegarten",note:"Vorhandene Quellenangaben"},
    {id:"coverage",label:"Dokumentationsstand",note:"Termine mit und ohne Beschreibung"}
  ];
  const defaultWidgets = [...baseWidgets.map(widget=>widget.id),"free-text-terms"];
  function readWidgets(available) {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey));
      if (stored?.schemaVersion === 2 && Array.isArray(stored.widgets)) return new Set(stored.widgets.filter(id=>available.has(id)));
      const legacy = JSON.parse(localStorage.getItem(legacyPreferenceKey));
      if (Array.isArray(legacy)) {
        const selected = new Set(legacy.filter(id=>available.has(id)));
        const previousDefault = [...baseWidgets.map(widget=>widget.id),"process-phases","problem-types","free-text-terms"].filter(id=>available.has(id));
        // Eine abweichende Auswahl gilt als bewusst angepasst und bleibt erhalten.
        const unchangedDefault = selected.size === previousDefault.length && previousDefault.every(id=>selected.has(id));
        const migrated = unchangedDefault ? new Set(defaultWidgets.filter(id=>available.has(id))) : selected;
        try { localStorage.setItem(preferenceKey,JSON.stringify({schemaVersion:2,widgets:[...migrated]})); }
        catch (_error) { /* Die übernommene Auswahl bleibt auch ohne Schreibzugriff erhalten. */ }
        return migrated;
      }
    } catch (_error) { /* Ohne Browserspeicher bleibt die Auswahl in dieser Ansicht erhalten. */ }
    return new Set(defaultWidgets.filter(id=>available.has(id)));
  }

  async function load(source) {
    const version = ++themeLoadVersion;
    themeSource = null;
    if (!source) return false;
    try {
      let value = source;
      if (typeof source === "string") {
        const target = new URL(source, window.location.href);
        if (!["http:", "https:"].includes(target.protocol) || target.origin !== window.location.origin || target.username || target.password) return false;
        const response = await fetch(target.href, { credentials: "same-origin", cache: "no-store", redirect: "error" });
        if (!response.ok) return false;
        value = await response.json();
      }
      if (version !== themeLoadVersion) return false;
      if (value.schemaVersion !== 1 || !Array.isArray(value.themes) || !Array.isArray(value.records) || value.themes.length > 100 || value.records.length > 50000) throw new Error("Ungültige Themenquelle.");
      const ids = new Set();
      for (const item of value.records) {
        if (!text(item.observationId) || ids.has(item.observationId) || typeof item.originalDescription !== "string" || typeof item.originalTitle !== "string") throw new Error("Ungültige Themenverknüpfung.");
        ids.add(item.observationId);
      }
      themeSource = value;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function project(options) {
    const visits = (options.hospitations || []).filter(visit=>visit.status !== "Archiviert").map(visit=>({...visit,
      id:visit.id,name:visit.displayName || visit.contactName || visit.organizationName || visit.location || "Termin",
      city:visit.displayCity || visit.city || "",date:String(visit.displayDate || visit.scheduledOn || visit.startsAt || "").slice(0,10),state:visit.state || "",count:0}));
    const visitsById = new Map(visits.map(visit => [visit.id, visit]));
    const active = (options.observations || []).filter(record=>record.status !== "archived" && !record.derivedFromSummary && visitsById.has(record.hospitationId));
    const described = active.filter(record => text(record.description));
    visits.forEach(visit => { visit.sector = sectorForVisit(visit, described); });
    const definitions = (themeSource?.themes || []).map(theme=>({...theme,count:0}));
    const themes = new Map(definitions.map(theme=>[theme.id,theme]));
    const assignments = new Map((themeSource?.records || []).map(record=>[record.observationId,record]));
    const records = described.map(record=>{
      const assignment = assignments.get(record.id);
      const matches = assignment && text(record.title) === text(assignment.originalTitle) && text(record.description) === text(assignment.originalDescription) && themes.has(assignment.themeId);
      const theme = matches ? assignment.themeId : "__unassigned";
      if (matches) themes.get(theme).count++;
      const visit = visitsById.get(record.hospitationId);
      visit.count++;
      return {...record,id:record.id,number:record._chronologicalNumber || assignment?.number || record.sequence || "?",appointmentId:record.hospitationId,
        sector:sectorForObservation(record, visit.sector),evidenceKind:evidenceKind(record),theme,themeLabel:matches?themes.get(theme).label:"Thema noch offen",
        themeReason:matches?assignment.reason:"Keine passende aktuelle Hauptzuordnung vorhanden.",ambiguity:assignment?.ambiguity || "",
        themeSourceDate:assignment?.sourceDate || "",historicalDisplayId:assignment?.historicalDisplayId || "",
        historicalDisplayCheckedAt:assignment?.historicalDisplayCheckedAt || "",settingType:record.settingType || ""};
    });
    const unassigned = records.filter(record=>record.theme === "__unassigned").length;
    if (unassigned) definitions.push({id:"__unassigned",label:"Thema noch offen",count:unassigned});
    definitions.sort((left,right)=>Number(left.id==="__unassigned")-Number(right.id==="__unassigned") || right.count-left.count);
    const withDescription = visits.filter(visit=>visit.count).length;
    const groups = (options.patterns || []).map(group=>{ const ids=[...(group.observationIds || [])].filter(id=>records.some(record=>record.id===id)); return {type:group.comparisonType || "",problem:group.problemType || "",phase:group.processPhase || "",ids,hospitationCount:new Set(ids.map(id=>records.find(record=>record.id===id)?.appointmentId)).size}; }).filter(group=>group.ids.length && group.hospitationCount >= 2);
    return {records,visits,themes:definitions.filter(theme=>theme.count),themeColors,groups,
      counts:{frameworkRows:active.length,withDescription,withoutDescription:visits.length-withDescription,
        withState:visits.filter(visit=>visit.state).length,withoutState:visits.filter(visit=>!visit.state).length,
        unassigned}};
  }

  function closeDetails() { closeActiveInfo?.(); for (const dialog of [...dialogs].reverse()) if (dialog.open) dialog.close(); releaseModalScroll(); }
  function render(container,options={}) {
    if (!container) return;
    const previous=controllers.get(container);
    const previousBrowser=previous?.browserState?.();
    previous?.close();
    if (options.status !== "ready") {
      container.innerHTML=`<div class="hospitation-dashboard-page"><p>${options.status === "error" ? "Dashboarddaten konnten nicht geladen werden." : "Dashboard wird geladen."}</p></div>`;
      return;
    }
    const page=document.createElement("div");
    page.className="hospitation-dashboard-page";
    page.innerHTML=String.raw`
    <section class="metrics" aria-label="Bestand im Überblick">
      <button type="button" class="metric metric-navy" data-open-visits><div><strong></strong><span>Hospitationen</span></div><span class="metric-art" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="6" y="10" width="36" height="32" rx="5"></rect><path d="M14 5v10M34 5v10M6 21h36M15 29h4M27 29h4M15 35h4"></path></svg></span></button>
      <button type="button" class="metric metric-blue" data-open-observations><div><strong></strong><span>Beschriebene Beobachtungen</span></div><span class="metric-art" data-icon="observations"></span></button>
      <button type="button" class="metric metric-mint" data-open-themes><div><strong></strong><span>Zugeordnete Themen</span></div><span class="metric-art" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18"></circle><path d="M24 6v18h18M24 24 12 38"></path></svg></span></button>
    </section>

    <div class="primary-charts">
      <section class="viz-card map-card" data-widget-section="map" aria-labelledby="hdb-map-heading">
        <div class="chart-heading"><div><h2 id="hdb-map-heading">Hospitationen in Deutschland</h2><span class="chart-caption"></span></div><button class="info-button" data-info="map" aria-label="Deutschlandkarte erklären">i</button></div>
        <div class="map-content"><div id="hdb-germany-map" class="germany-map"></div><div class="hdb-map-summary"><div class="state-ranking" id="hdb-state-ranking"></div><span class="map-scale"><i></i>Termine je Bundesland</span></div></div>
        <div class="map-footer"><div class="hdb-map-switch" role="group" aria-label="Kartenansicht"><button type="button" data-map-mode="distribution" aria-pressed="true">Verteilung</button><button type="button" data-map-mode="sectors" aria-pressed="false">Sektoren</button></div><button type="button" class="text-button" data-map-missing aria-haspopup="dialog"></button></div>
      </section>
      <section class="viz-card themes-card" data-widget-section="themes" aria-labelledby="hdb-themes-heading">
        <div class="chart-heading"><div><h2 id="hdb-themes-heading">Themen der Beobachtungen</h2><span class="chart-caption"></span></div><button class="info-button" data-info="themes" aria-label="Themen der Beobachtungen erklären">i</button></div>
        <div class="theme-chart-layout"><div class="donut-large" id="hdb-theme-donut"></div><div class="chart-legend" id="hdb-theme-list"></div></div>
        <button type="button" class="chart-footer" data-open-themes aria-haspopup="dialog"><span class="hdb-observation-action"><span aria-hidden="true">${iconMarkup("observations")}</span><span>Beobachtungen ansehen</span></span></button>
      </section>
    </div>

    <div class="secondary-charts">
      <section class="viz-card" data-widget-section="sectors" aria-labelledby="hdb-context-heading">
        <div class="chart-heading"><div><h2 id="hdb-context-heading">Sektoren</h2><span class="chart-caption" data-hdb-sector-basis></span></div><button class="info-button" data-info="sectors" aria-label="Sektoren erklären">i</button></div>
        <div class="donut-medium" id="hdb-context-donut"></div><div class="chart-legend" id="hdb-context-legend"></div>
      </section>
      <section class="viz-card" data-widget-section="evidence" aria-labelledby="hdb-evidence-heading">
        <div class="chart-heading"><div><h2 id="hdb-evidence-heading">Dokumentierte Belegarten</h2><span class="chart-caption" data-hdb-evidence-basis></span></div><button class="info-button" data-info="evidence" aria-label="Dokumentierte Belegarten erklären">i</button></div>
        <div class="donut-medium" id="hdb-evidence-donut"></div><div class="chart-legend" id="hdb-evidence-legend"></div>
      </section>
      <section class="viz-card coverage-card" data-widget-section="coverage" aria-labelledby="hdb-coverage-heading">
        <div class="chart-heading"><div><h2 id="hdb-coverage-heading">Dokumentationsstand</h2><span class="chart-caption" data-hdb-coverage-basis></span></div><button class="info-button" data-info="coverage" aria-label="Dokumentationsstand erklären">i</button></div>
        <div class="donut-medium" id="hdb-coverage-donut"></div>
        <div class="chart-legend coverage-legend"><div class="legend-row"><i class="legend-dot" data-tone="mint"></i><span>Mit Beschreibung</span><strong></strong></div><button class="legend-row" data-open="gaps"><i class="legend-dot" data-tone="pale"></i><span>Ohne Beschreibung</span><strong></strong></button></div>
      </section>
    </div>
    <section class="hdb-additional-views" aria-label="Zusätzliche Ansichten">
      <div class="hdb-dashboard-controls"><h2>Zusatzansichten</h2><button type="button" class="secondary-button" data-customize>Ansicht anpassen</button></div>
      <section class="hdb-extra-section" aria-label="Weitere Dashboardbausteine"><div class="hdb-extra-grid" id="hdb-extra-widgets"></div></section>
    </section>
    <dialog id="hdb-observation-browser" class="hdb-browser-dialog" aria-labelledby="hdb-browser-title">
      <div class="dialog-heading"><div class="hdb-overlay-heading"><span class="hdb-overlay-icon" data-icon="observations" aria-hidden="true"></span><div><h2 id="hdb-browser-title">Beobachtungen</h2><span class="result-count" id="hdb-result-count" aria-live="polite"></span></div></div><button type="button" class="icon-button" data-close-browser aria-label="Beobachtungsübersicht schließen">×</button></div>
      <div class="hdb-browser-body" id="hdb-observation-workspace">
        <p class="hdb-browser-hint">Titel auswählen, um Beschreibung und Herkunft zu lesen.</p>
      <form class="filter-bar" id="hdb-filters" role="search" aria-label="Beobachtungen filtern">
        <label class="search-field"><span class="sr-only">Titel, Situation oder Ort suchen</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg><input id="hdb-search" type="search" placeholder="Titel, Situation oder Ort suchen" autocomplete="off"></label>
        <details class="hdb-filter-details" id="hdb-filter-details"><summary>Filter <span id="hdb-filter-count"></span></summary><div class="hdb-filter-fields">
        <label><span>Thema</span><select id="hdb-theme"><option value="">Alle Themen</option></select></label>
        <label><span>Sektor</span><select id="hdb-context"><option value="">Alle Sektoren</option></select></label>
        <label><span>Prozessphase</span><select id="hdb-phase"><option value="">Alle vorhandenen Werte</option></select></label>
        <label><span>Problemtyp</span><select id="hdb-problem"><option value="">Alle Problemtypen</option></select></label>
        <label><span>Hospitation</span><select id="hdb-visit"><option value="">Alle mit Beschreibung</option></select></label>
        <label><span>Belegart</span><select id="hdb-evidence"><option value="">Alle Belegarten</option></select></label>
        <label><span>Bundesland</span><select id="hdb-region"><option value="">Alle Bundesländer</option></select></label>
        </div></details>
      </form>
      <div class="filter-status"><div id="hdb-active-filters" class="active-filters"></div><button class="text-button" id="hdb-reset-filters" hidden>Filter zurücksetzen</button></div>

      <div id="hdb-observation-list" class="observation-list"></div>
      <div id="hdb-empty-state" class="empty-state" hidden><h3>Keine passende Beobachtung</h3><p>Mit weniger Filtern oder einem anderen Suchwort weitersuchen.</p><button class="secondary-button" id="hdb-empty-reset">Alle Filter zurücksetzen</button></div>
      </div>
      <div class="pagination"><span id="hdb-page-range"></span><div><button class="secondary-button" id="hdb-previous-page">← Zurück</button><button class="secondary-button" id="hdb-next-page">Weiter →</button></div></div>
    </dialog>

    <dialog id="hdb-customize" class="hdb-customize-dialog" aria-labelledby="hdb-customize-title">
      <div class="dialog-heading"><div class="hdb-overlay-heading"><span class="hdb-overlay-icon" data-icon="customize" aria-hidden="true"></span><div class="hdb-customize-heading-copy"><h2 id="hdb-customize-title">Ansicht anpassen</h2><span>Wähle, was du sehen möchtest.</span></div></div><button type="button" class="icon-button" data-close-customize aria-label="Anpassung abbrechen">×</button></div>
      <div class="dialog-body"><div id="hdb-widget-options"></div></div>
      <div class="dialog-footer"><button type="button" class="text-button" data-widget-defaults aria-label="Standardansicht wiederherstellen">Zurücksetzen</button><small id="hdb-preference-note">Die Auswahl wird in diesem Browser gespeichert.</small><div class="hdb-customize-actions"><button type="button" class="secondary-button" data-close-customize>Abbrechen</button><button type="button" class="secondary-button hdb-apply-button" data-apply-widgets>Anwenden</button></div></div>
    </dialog>

  <div class="hdb-info-shade" aria-hidden="true" hidden></div>
  <div id="hdb-info-tip" class="hdb-info-tip" popover="manual" role="tooltip"><div class="hdb-info-tip-heading"><span class="hdb-info-tip-icon" aria-hidden="true"></span><strong></strong></div><p></p></div>
  <dialog id="hdb-details" aria-labelledby="hdb-detail-title">
    <div class="dialog-heading"><div class="hdb-overlay-heading"><span class="hdb-overlay-icon" id="hdb-detail-icon" aria-hidden="true"></span><span id="hdb-detail-kicker"></span></div><button class="icon-button" id="hdb-close-details" aria-label="Detailansicht schließen">×</button></div>
    <div class="dialog-body" id="hdb-detail-body"></div>
    <div class="dialog-footer"><span>Lesedetails im Dashboard</span><button class="secondary-button" id="hdb-close-details-bottom">Schließen</button></div>
  </dialog>
`;
    container.replaceChildren(page);
    const data=project(options);
    const $=selector=>page.querySelector(selector.replace(/#([a-z0-9-]+)/g,"#hdb-$1"));
    const visits=new Map(data.visits.map(visit=>[visit.id,visit]));
    const records=new Map(data.records.map(record=>[record.id,record]));
    const problemIds=new Set(options.problemObservationIds || []);
    function categoryStats(field,rows=data.records) {
      const groups=new Map();
      for(const record of rows) {
        const value=text(record[field]);
        const id=value || "__empty";
        if(!groups.has(id))groups.set(id,{id,label:value || "Ohne Angabe",visits:new Set(),ids:[]});
        const group=groups.get(id);
        group.visits.add(record.appointmentId);group.ids.push(record.id);
      }
      return [...groups.values()].map(group=>({...group,count:group.visits.size})).sort((left,right)=>right.count-left.count || left.label.localeCompare(right.label,"de"));
    }
    const phaseStats=categoryStats("processPhase");
    const problemStats=categoryStats("problemType");
    const phaseIndex=new Map(phaseStats.map(group=>[group.id,new Set(group.ids)]));
    const problemIndex=new Map(problemStats.map(group=>[group.id,new Set(group.ids)]));
    const state=previous?.filters || {theme:"",search:"",context:"",phase:"",problem:"",visit:"",evidence:"",region:"",page:0};
    if (state.theme && !data.themes.some(theme=>theme.id===state.theme)) state.theme="";
    if (state.visit && !visits.has(state.visit)) state.visit="";
    const pageSize=12;
    const date=value=>value && Number.isFinite(Date.parse(value)) ? new Date(String(value).slice(0,10)+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}) : "Datum offen";
    const contextLabel=value=>value==="__empty"?"Ohne Angabe":value;
    const visitLabel=visit=>[visit.name,visit.city && visit.city.toLocaleLowerCase("de")!==visit.name.toLocaleLowerCase("de")?visit.city:""].filter(Boolean).join(", ");
    const fact=(label,value)=>`<div><dt>${escape(label)}</dt><dd>${escape(value || "Keine Angabe")}</dd></div>`;
    const paragraph=value=>`<p>${escape(value)}</p>`;
    const dialog=$("#details");
    const browser=$("#observation-browser");
    const customize=$("#customize");
    const widgetNotes={
      "process-phases":"Wo im Ablauf Beobachtungen entstanden sind",
      "problem-types":"Alle gespeicherten Problemtypen",
      "free-text-terms":"Häufige Wörter aus den Dokumentationen",
      topics:"Themen aus den Dokumentationen",
      "affected-products":"Genannte Produkte und Dienste",
      quotes:"Aussagen mit Herkunft lesen"
    };
    const extraWidgets=(options.widgets || []).filter(widget=>widget.id!=="quality").map(widget=>({...widget,
      choiceNote:widgetNotes[widget.id] || widget.choiceNote,
      caption:["process-phases","problem-types"].includes(widget.id)?`${data.records.length} Beschreibungen aus ${new Set(data.records.map(record=>record.appointmentId)).size} Hospitationen`:widget.caption}));
    const catalog=[...baseWidgets,...extraWidgets];
    const available=new Set(catalog.map(widget=>widget.id));
    const visibleWidgets=previous?.widgets || readWidgets(available);
    visibleWidgets.delete("framework");
    visibleWidgets.delete("quality");
    let mapMode=previous?.mapMode?.() || "distribution";
    const collapsedWidgets=previous?.collapsed || new Set((options.widgets || []).map(widget=>widget.id));
    const infoTip=$("#info-tip"), infoShade=page.querySelector(".hdb-info-shade");
    let infoAnchor=null,hideInfoTimer=null,dismissedInfoAnchor=null,lastPointerType="mouse";
    const localDialogs=[browser,customize,dialog];
    localDialogs.forEach(item=>{dialogs.add(item);item.addEventListener("close",releaseModalScroll);});
    controllers.set(container,{filters:state,widgets:visibleWidgets,collapsed:collapsedWidgets,mapMode:()=>mapMode,browserState:()=>({open:browser.open,scroll:$("#observation-workspace").scrollTop}),close(){hideInfo();window.removeEventListener("resize",positionInfo);window.removeEventListener("scroll",positionInfo,true);document.removeEventListener("keydown",infoKeydown);if(closeActiveInfo===hideInfo)closeActiveInfo=null;for(const item of [...localDialogs].reverse()){if(item.open)item.close();dialogs.delete(item);}releaseModalScroll();}});
    page.querySelectorAll("[data-icon]").forEach(element=>{element.innerHTML=iconMarkup(element.dataset.icon);});
    closeActiveInfo=hideInfo;
    page.addEventListener("click",event=>{
      const original=event.target.closest("[data-original-record]");
      if(original){closeDetails();options.openObservation?.(original.dataset.originalRecord);}
    });
    function syncSummary() {
      const metrics=page.querySelectorAll(".metrics strong");
      metrics[0].textContent=String(data.visits.length);
      metrics[1].textContent=String(data.records.length);
      metrics[2].textContent=themeSource?String(data.themes.filter(theme=>theme.id!=="__unassigned").length):"Offen";
      page.querySelector(".map-card .chart-caption").textContent=`${data.counts.withState} Termine mit Bundeslandangabe`;
      page.querySelector("[data-map-missing]").textContent=`${data.counts.withoutState} ohne Bundesland`;
      page.querySelector("[data-map-missing]").setAttribute("aria-label",`${data.counts.withoutState} Termine ohne Bundeslandangabe im Overlay ansehen`);
      page.querySelector("[data-map-missing]").hidden=!data.counts.withoutState;
      page.querySelector(".themes-card .chart-caption").textContent=`${data.records.length} Beschreibungen, ${data.records.length-data.counts.unassigned} redaktionell zugeordnet`;
      page.querySelector("[data-hdb-sector-basis]").textContent=`${data.records.length} beschriebene Beobachtungen`;
      page.querySelector("[data-hdb-evidence-basis]").textContent=`${data.records.length} beschriebene Beobachtungen`;
      page.querySelector("[data-hdb-coverage-basis]").textContent=`${data.visits.length} erfasste Hospitationen`;

      const coverage=page.querySelectorAll(".coverage-legend strong");
      coverage[0].textContent=String(data.counts.withDescription);coverage[1].textContent=String(data.counts.withoutDescription);
    }
  function showDialog(kicker, content, icon="observations") {
    $("#detail-kicker").textContent = kicker;
    $("#detail-icon").innerHTML=iconMarkup(icon);
    $("#detail-body").innerHTML = content;
    presentDialog(dialog);
    $("#detail-body").scrollTop = 0;
    $("#close-details-bottom").textContent=browser.open?"Zurück zur Übersicht":"Schließen";
    $("#close-details").focus();
  }
  $("#close-details").addEventListener("click", () => dialog.close());
  $("#close-details-bottom").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }});

  function avatar(visit) {
    return `<span class="hdb-person-avatar" title="${escape(`Kontakt der Hospitation: ${visit.name}`)}" aria-hidden="true">${visit.avatarMarkup || '<span class="avatar avatar-fallback avatar-sm">?</span>'}</span>`;
  }
  function hideInfo(dismiss=false) {
    clearTimeout(hideInfoTimer);
    if(dismiss===true)dismissedInfoAnchor=infoAnchor;
    if(infoAnchor){infoAnchor.removeAttribute("aria-describedby");infoAnchor.classList.remove("is-info-active");}
    infoAnchor=null;
    if(infoTip.matches(":popover-open"))infoTip.hidePopover();
    infoTip.classList.remove("is-open");infoShade.hidden=true;
  }
  function showInfo(title,description,icon,anchor) {
    if(!anchor || dismissedInfoAnchor===anchor)return;
    clearTimeout(hideInfoTimer);
    if(infoAnchor && infoAnchor!==anchor)hideInfo();
    infoAnchor=anchor;
    anchor.setAttribute("aria-describedby",infoTip.id);anchor.classList.add("is-info-active");
    infoTip.querySelector("strong").textContent=title;
    infoTip.querySelector("p").textContent=description;
    infoTip.querySelector(".hdb-info-tip-icon").innerHTML=iconMarkup(icon || "themes");
    infoShade.hidden=false;
    if(infoTip.showPopover){if(!infoTip.matches(":popover-open"))infoTip.showPopover();}else infoTip.classList.add("is-open");
    positionInfo();
  }
  function positionInfo() {
    if(!infoAnchor)return;
    const rect=infoAnchor.getBoundingClientRect(),card=infoTip.getBoundingClientRect();
    if(rect.bottom<=0 || rect.top>=window.innerHeight || rect.right<=0 || rect.left>=window.innerWidth){hideInfo();return;}
    const left=Math.max(12,Math.min(window.innerWidth-card.width-12,rect.right-card.width));
    let top=rect.bottom+10;
    if(top+card.height>window.innerHeight-12)top=Math.max(12,rect.top-card.height-10);
    infoTip.style.left=`${left}px`;infoTip.style.top=`${top}px`;
  }
  function scheduleInfoClose() {
    clearTimeout(hideInfoTimer);
    hideInfoTimer=setTimeout(()=>{
      if(infoTip.matches(":hover") || infoAnchor?.matches(":hover") || (infoAnchor===document.activeElement && infoAnchor.matches(":focus-visible")))return;
      hideInfo();
    },180);
  }
  function openInfoFor(anchor) {
    if(anchor.hasAttribute("data-info"))openCardInfo(anchor.dataset.info,anchor);
    else if(anchor.hasAttribute("data-widget-info"))openWidgetInfo(anchor.dataset.widgetInfo,anchor);
  }
  function infoKeydown(event) {if(event.key==="Escape" && infoAnchor){event.preventDefault();event.stopPropagation();hideInfo(true);}}
  document.addEventListener("keydown",infoKeydown);
  window.addEventListener("resize",positionInfo);window.addEventListener("scroll",positionInfo,true);
  page.addEventListener("pointerover",event=>{
    if(event.pointerType==="touch")return;
    if(infoTip.contains(event.target)){clearTimeout(hideInfoTimer);return;}
    const anchor=event.target.closest(".info-button[data-info],.info-button[data-widget-info]");
    if(anchor)openInfoFor(anchor);
  });
  page.addEventListener("pointerout",event=>{
    const anchor=event.target.closest(".info-button[data-info],.info-button[data-widget-info]");
    if(anchor && !anchor.contains(event.relatedTarget) && !infoTip.contains(event.relatedTarget)){dismissedInfoAnchor=null;scheduleInfoClose();}
    if(infoTip.contains(event.target) && !infoTip.contains(event.relatedTarget) && !infoAnchor?.contains(event.relatedTarget))scheduleInfoClose();
  });
  page.addEventListener("focusin",event=>{
    const anchor=event.target.closest(".info-button[data-info],.info-button[data-widget-info]");
    if(anchor?.matches(":focus-visible"))openInfoFor(anchor);
  });
  page.addEventListener("focusout",event=>{if(infoAnchor?.contains(event.target)){dismissedInfoAnchor=null;scheduleInfoClose();}});
  page.addEventListener("pointerdown",event=>{
    lastPointerType=event.pointerType;
    if(!event.target.closest(".info-button") && !infoTip.contains(event.target))hideInfo();
  });
  page.addEventListener("click",event=>{
    const anchor=event.target.closest(".info-button[data-info],.info-button[data-widget-info]");
    if(!anchor || !(lastPointerType==="touch" || window.matchMedia("(hover: none)").matches))return;
    if(infoAnchor===anchor)hideInfo();else {dismissedInfoAnchor=null;openInfoFor(anchor);}
  });
  function openCardInfo(id,anchor) {
    const infos={
      themes:["Themen der Beobachtungen","Die Karte gruppiert Beschreibungen nach ihrem redaktionell zugeordneten Thema. Die gespeicherten Codes bleiben getrennt.","themes"],
      sectors:["Sektoren","Zeigt, in welchen Versorgungsbereichen die beschriebenen Beobachtungen entstanden sind. Diabetes-Facharztpraxen zählen hier zu den Facharztpraxen.","pattern"],
      evidence:["Dokumentierte Belegarten","Die Karte zeigt die gespeicherten Belegarten. Synthetische Beispiele haben eine eigene Kategorie.","observations"],
      coverage:["Dokumentationsstand","Gezählt werden Termine mit und ohne beschriebene Beobachtung im Framework. Eine fehlende Beschreibung bedeutet nicht, dass keine Originalquelle vorhanden ist.","hospitations"],
      map:["Hospitationen in Deutschland",mapMode==="sectors"?"Jeder farbige Punkt steht für eine Hospitation. Bei fehlenden Koordinaten wird die vorhandene Orts- oder Bundeslandposition verwendet.":"Die Karte zählt Termine mit gespeicherter Bundeslandangabe. Dunklere Flächen stehen für mehr zugeordnete Termine.","map"]
    };
    if(infos[id])showInfo(...infos[id],anchor);
  }
  function openWidgetInfo(id,anchor) {
    const widget=extraWidgets.find(item=>item.id===id);
    if(!widget)return;
    const description={
      "process-phases":"Gezählt werden Hospitationen je gespeicherter Prozessphase aus allen aktuellen Beschreibungen. Eine Hospitation kann in mehreren Phasen vorkommen.",
      "problem-types":"Gezählt werden Hospitationen je gespeichertem Problemtyp aus allen aktuellen Beschreibungen. Auch offene Angaben und Kein Hindernis bleiben sichtbar.",
      "free-text-terms":"Die Wolke zeigt die zehn häufigsten Wörter aus den abgeschlossenen Hospitationsdokumentationen. Wiederholungen in mehreren Textfeldern können mehrfach zählen.",
      topics:"Gezählt werden Hospitationen mit dem jeweiligen Thema in ihrer Dokumentation.",
      "affected-products":"Gezählt werden Hospitationen, in denen das jeweilige Produkt oder der Dienst als betroffen dokumentiert ist.",
      quotes:"Die Übersicht zeigt vorhandene Zitate. In der Zitatansicht stehen der vollständige Text und seine Herkunft."
    }[id];
    showInfo(widget.label,description || widget.choiceNote || widget.caption,widgetIcon(id),anchor);
  }
  function statMarkup(id,entries) {
    if(!entries.length)return "<p class=\"hdb-widget-note\">Noch keine entsprechenden Angaben.</p>";
    const color={"process-phases":"#155FE4","problem-types":"#7C3AED",topics:"#000E52","affected-products":"#0891B2"}[id] || "#155FE4";
    const maximum=Math.max(...entries.map(entry=>entry.count),1);
    const type=id==="process-phases"?"phase":id==="problem-types"?"problem":"";
    return `<div class="hdb-stat-list" style="--hdb-stat-color:${color}">${entries.map(entry=>{
      const tag=type?"button":"div";
      const action=type?`type="button" data-stat-${type}="${escape(entry.id)}" aria-label="${escape(entry.label)}, ${entry.count} Hospitationen. Zugehörige Beobachtungen ansehen"`:"";
      return `<${tag} class="hdb-stat-row" ${action}><span class="hdb-stat-label">${escape(entry.label)}</span><strong class="hdb-stat-count">${entry.count}</strong>${type?'<span class="hdb-stat-arrow" aria-hidden="true">↗</span>':""}<span class="hdb-stat-track"><i style="--hdb-stat-width:${entry.count/maximum*100}%"></i></span></${tag}>`;
    }).join("")}</div>`;
  }
  function applyWidgets() {
    page.querySelectorAll("[data-widget-section]").forEach(element=>{element.hidden=!visibleWidgets.has(element.dataset.widgetSection);});
    for (const group of page.querySelectorAll(".primary-charts,.secondary-charts")) {
      const count=[...group.children].filter(element=>!element.hidden).length;
      group.hidden=!count;
      group.style.setProperty("--hdb-chart-columns",String(count || 1));
    }
    const host=$("#extra-widgets");
    host.replaceChildren();
    for (const widget of extraWidgets) {
      if (!visibleWidgets.has(widget.id)) continue;
      const content=document.createElement("div");
      const entries=widget.id==="process-phases"?phaseStats:widget.id==="problem-types"?problemStats:widget.stats;
      if (Array.isArray(entries)) content.innerHTML=statMarkup(widget.id,entries);
      else if(widget.render) {
        const template=document.createElement("template");
        template.innerHTML=widget.render();
        const original=template.content.firstElementChild;
        if (!original) continue;
        original.querySelectorAll("[data-hospitation-dashboard-widget-controls],.hospitation-dashboard-section-copy").forEach(element=>element.remove());
        const body=original.querySelector(".hospitation-dashboard-accordion-body") || original;
        if (body===original) body.querySelector(".dashboard-card-head")?.remove();
        content.append(...body.childNodes);
      }
      const card=document.createElement("article");
      card.className="hdb-extra-card viz-card";
      card.dataset.optionalWidget=widget.id;
      const collapsed=collapsedWidgets.has(widget.id);
      card.innerHTML=`<div class="chart-heading"><div><h2>${escape(widget.label)}</h2><span class="chart-caption">${escape(widget.caption || "")}</span></div><div class="hdb-card-actions"><button type="button" class="info-button" data-widget-info="${escape(widget.id)}" aria-label="${escape(widget.label)} erklären">i</button><button type="button" class="hdb-collapse-button" data-collapse-widget="${escape(widget.id)}" aria-expanded="${!collapsed}" aria-controls="hdb-widget-${escape(widget.id)}">${collapsed?"Ausklappen":"Einklappen"}</button></div></div><div class="hdb-extra-content" id="hdb-widget-${escape(widget.id)}" ${collapsed?"hidden":""}></div>`;
      card.querySelector(".hdb-extra-content").append(...content.childNodes);
      if (widget.id==="quotes") {
        const button=document.createElement("button");
        button.type="button";button.className="text-button";
        button.dataset.hospitationDashboardDetail="quotes";button.textContent="Zitate ansehen →";
        card.querySelector(".hdb-extra-content").append(button);
      }
      host.append(card);
    }
    page.querySelector(".hdb-extra-section").hidden=!host.childElementCount;
    page.querySelector(".hdb-additional-views").classList.toggle("is-empty",!host.childElementCount);
  }
  function saveWidgets() {
    try { localStorage.setItem(preferenceKey,JSON.stringify({schemaVersion:2,widgets:[...visibleWidgets]})); }
    catch (_error) { $("#preference-note").textContent="Die Auswahl gilt für diese Sitzung. Der Browserspeicher ist nicht verfügbar."; }
    applyWidgets();
  }
  function openCustomize() {
    const choices=items=>items.map(widget=>`<label class="hdb-widget-option"><span class="hdb-widget-option-icon" aria-hidden="true">${iconMarkup(widgetIcon(widget.id))}</span><span class="hdb-widget-option-copy"><strong>${escape(widget.label)}</strong><small>${escape(widget.choiceNote || widget.note || widget.caption)}</small></span><input type="checkbox" value="${escape(widget.id)}" ${visibleWidgets.has(widget.id)?"checked":""}></label>`).join("");
    $("#widget-options").innerHTML=`<fieldset class="hdb-widget-options"><legend>Hauptansichten</legend>${choices(baseWidgets)}</fieldset><fieldset class="hdb-widget-options"><legend>Zusatzansichten</legend>${choices(extraWidgets)}</fieldset>`;
    customize.dataset.resetCollapsed="false";
    presentDialog(customize);
  }
  page.querySelectorAll("[data-close-customize]").forEach(button=>button.addEventListener("click",()=>customize.close()));
  page.querySelector("[data-widget-defaults]").addEventListener("click",()=>{customize.querySelectorAll("input[type=checkbox]").forEach(input=>{input.checked=defaultWidgets.includes(input.value);});customize.dataset.resetCollapsed="true";});
  page.querySelector("[data-apply-widgets]").addEventListener("click",()=>{
    visibleWidgets.clear();
    customize.querySelectorAll("input[type=checkbox]:checked").forEach(input=>{if(available.has(input.value))visibleWidgets.add(input.value);});
    if(customize.dataset.resetCollapsed==="true") {collapsedWidgets.clear();(options.widgets || []).forEach(widget=>collapsedWidgets.add(widget.id));}
    saveWidgets();customize.close();
  });
  page.addEventListener("click",event=>{
    if(event.target.closest("[data-customize]"))openCustomize();
    const collapse=event.target.closest("[data-collapse-widget]");
    if(collapse){
      const id=collapse.dataset.collapseWidget;
      if(collapsedWidgets.has(id))collapsedWidgets.delete(id);else collapsedWidgets.add(id);
      const expanded=!collapsedWidgets.has(id);
      collapse.setAttribute("aria-expanded",String(expanded));collapse.textContent=expanded?"Einklappen":"Ausklappen";
      page.querySelector(`#hdb-widget-${id}`).hidden=!expanded;
    }
    if(event.target.closest('[data-hospitation-dashboard-detail="quotes"]'))showDialog("Zitate",`<h2 id="hdb-detail-title">Dokumentierte Zitate</h2>${options.renderQuotes?.() || "<p>Keine Zitate erfasst.</p>"}`);
    const visit=event.target.closest("[data-hospitation-dashboard-open]");
    if(visit)openVisit(visit.dataset.hospitationDashboardOpen);
  });

  const evidenceColors = {reported:"#000E52",source_bound:"#0891B2",directly_observed:"#16A34A",interpreted:"#7C3AED",synthetic_source_based:"#B7791F",__empty:"#D7E0EE"};
  const evidenceGroups = Object.entries(evidence).map(([id, label]) => ({
    id, label, color: evidenceColors[id], count: data.records.filter(record => record.evidenceKind === id).length
  })).filter(group => group.count);
  function donut(items, number, unit, type, selected="", label="") {
    const total=items.reduce((sum,item)=>sum+item.count,0);
    const circumference=2*Math.PI*76;
    let offset=0;
    const segments=items.map(item=>{
      const part=total?item.count/total*circumference:0;
      const gap=items.length>1?3:0;
      const attributes=type?`role="button" tabindex="0" data-${type}="${escape(item.id)}" aria-pressed="${selected===item.id}" aria-label="${escape(item.label)}, ${item.count} anzeigen"`:"";
      const segment=`<circle class="donut-segment" cx="110" cy="110" r="76" style="--segment-color:${item.color}" stroke-dasharray="${Math.max(0,part-gap)} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)" ${attributes}><title>${escape(item.label)}: ${item.count}</title></circle>`;
      offset+=part;
      return segment;
    }).join("");
    return `<div class="donut"><svg viewBox="0 0 220 220" role="group" aria-label="${escape(label)}"><circle class="donut-base" cx="110" cy="110" r="76"/>${segments}<text class="donut-number" x="110" y="111" aria-hidden="true">${number}</text><text class="donut-unit" x="110" y="134" aria-hidden="true">${escape(unit)}</text></svg></div>`;
  }
  function legend(items,type,selected="") {
    return items.map(item=>`<button class="legend-row" data-${type}="${escape(item.id)}" aria-pressed="${selected===item.id}" aria-label="${escape(item.label)}, ${item.count} anzeigen"><i class="legend-dot" style="--segment-color:${item.color}" aria-hidden="true"></i><span>${escape(item.label)}</span><strong>${item.count}</strong></button>`).join("");
  }
  function renderThemes() {
    const themes=data.themes.map(theme=>({...theme,color:data.themeColors[text(theme.id).replace(/^demo-/, "")] || "#596F8E"}));
    $("#theme-list").innerHTML=legend(themes,"theme",state.theme);
    $("#theme-donut").innerHTML=donut(themes,String(data.themes.filter(theme=>theme.id!=="__unassigned").length),"Themen","theme",state.theme,"Themen der beschriebenen Beobachtungen");
    const contextKeys=[...new Set([...Object.keys(sectorColors),...data.records.map(record=>record.sector)])];
    const contexts=contextKeys.map(key=>({id:key||"__empty",label:key||"Ohne Angabe",color:sectorColor(key),count:data.records.filter(record=>record.sector===key).length})).filter(item=>item.count);
    $("#context-donut").innerHTML=donut(contexts,String(data.records.length),"Beobachtungen","chart-context",state.context,"Sektoren der beschriebenen Beobachtungen");
    $("#context-legend").innerHTML=legend(contexts,"chart-context",state.context);
    $("#evidence-donut").innerHTML=donut(evidenceGroups,String(data.records.length),"Beobachtungen","chart-evidence",state.evidence,"Belegarten der beschriebenen Beobachtungen");
    $("#evidence-legend").innerHTML=legend(evidenceGroups,"chart-evidence",state.evidence);
  }
  function renderMap() {
    const counts=new Map(),sectorCounts=new Map(),regionSectors=new Map();
    const mapped=data.visits.filter(visit=>visit.state);
    mapped.forEach(visit=>{
      counts.set(visit.state,(counts.get(visit.state)||0)+1);
      const label=visit.sector || "Ohne Angabe";
      sectorCounts.set(label,(sectorCounts.get(label)||0)+1);
      if(!regionSectors.has(visit.state))regionSectors.set(visit.state,new Map());
      const group=regionSectors.get(visit.state);group.set(label,(group.get(label)||0)+1);
    });
    const colors={1:"#B7D1F0",2:"#6FA1DF",3:"#215CB8",4:"#000E52"};
    const centers={"Hessen":[235,510],"Sachsen-Anhalt":[418,356],"Sachsen":[537,465],"Nordrhein-Westfalen":[122,425],"Brandenburg":[569,238],"Niedersachsen":[204,295],"Rheinland-Pfalz":[113,580],"Berlin":[531,303]};
    const geographic=Boolean(options.locationMap?.states?.length);
    const geometry=geographic?options.locationMap:window.MAP_STATE_PATHS_OVERVIEW;
    if (!geometry?.states?.length) { $("#germany-map").textContent="Karte derzeit nicht verfügbar."; return; }
    const shapes=geometry.states.map(region=>{
      const count=counts.get(region.name)||0;
      const description=mapMode==="sectors"&&count?[...regionSectors.get(region.name)].map(([label,n])=>`${label}: ${n}`).join(", "):"";
      const label=`${region.name}: ${count?count+(count===1?" zugeordneter Termin":" zugeordnete Termine"):"keine Bundeslandzuordnung"}${description?". "+description:""}`;
      return `<path class="state-path" d="${escape(region.path)}" fill="${mapMode==="sectors"?"#EDF2FA":colors[Math.min(count,4)]||"#E3EBF6"}" data-region="${escape(region.name)}" role="button" tabindex="0" aria-label="${escape(label)}"><title>${escape(label)}</title></path>`;
    }).join("");
    $("#germany-map").innerHTML=`<svg viewBox="${geometry.viewBox}" data-map-geometry="${geographic?"geographic":"overview"}" role="group" aria-label="Deutschlandkarte, ${mapMode==="sectors"?"Termine nach Sektoren":"regionale Verteilung"}. ${data.counts.withState} Termine mit Bundeslandangabe.">${shapes}</svg>`;
    const svg=$("#germany-map").querySelector("svg");
    let labels="";
    const countPositions=[];
    if(mapMode==="sectors") {
      const placed=[];
      labels=(geometry.points || []).filter(point=>visits.has(point.id)).map(point=>{
        const origin={x:Number(point.x),y:Number(point.y)};
        if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y))return "";
        let position={...origin};
        for(let step=0;step<30 && placed.some(other=>Math.hypot(other.x-position.x,other.y-position.y)<9);step++) {
          const angle=step*2.3999632297,radius=7+Math.floor(step/6)*3;
          position={x:Math.max(8,Math.min(232,origin.x+Math.cos(angle)*radius)),y:Math.max(8,Math.min(284,origin.y+Math.sin(angle)*radius))};
        }
        placed.push(position);
        const visit=visits.get(point.id),label=visit.sector || "Ohne Angabe";
        const originLabel={coordinate:"Vorhandene Koordinate",city:"Ortsposition",state:"Bundeslandposition"}[point.source] || "Ungefähre Position";
        const title=[visitLabel(visit),label,originLabel].join(" · ");
        return `<g class="hdb-visit-map-point" transform="translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})" data-visit-record="${escape(point.id)}" data-position-source="${escape(point.source || "state")}" data-visit-state="${escape(visit.state)}" role="button" tabindex="0" aria-label="${escape(title)}"><title>${escape(title)}</title><circle class="hdb-visit-map-hit" r="7.5"/><circle class="hdb-visit-map-dot" r="3.4" fill="${sectorColor(visit.sector)}"/></g>`;
      }).join("");
    } else labels=[...counts].map(([name,count])=>{
      let point=geographic?null:centers[name];
      if(!point){const shape=[...svg.querySelectorAll("[data-region]")].find(path=>path.dataset.region===name);const bounds=shape?.getBBox();if(bounds)point=[bounds.x+bounds.width/2,bounds.y+bounds.height/2];}
      if(!point)return "";
      let position=point;
      if(geographic) {
        const bounds=svg.viewBox.baseVal;
        let free=null;
        for(let radius=0;radius<=40 && !free;radius+=4) {
          for(let direction=0;direction<(radius?8:1);direction++) {
            const angle=direction*Math.PI/4;
            const candidate=[Math.max(bounds.x+10,Math.min(bounds.x+bounds.width-10,point[0]+Math.cos(angle)*radius)),Math.max(bounds.y+10,Math.min(bounds.y+bounds.height-10,point[1]+Math.sin(angle)*radius))];
            if(!countPositions.some(other=>Math.hypot(other[0]-candidate[0],other[1]-candidate[1])<22)) {free=candidate;break;}
          }
        }
        position=free || point;
        countPositions.push(position);
      }
      const shifted=geographic && Math.hypot(point[0]-position[0],point[1]-position[1])>.5;
      const connector=shifted?`<line x1="${point[0]-position[0]}" y1="${point[1]-position[1]}" x2="0" y2="0"/>`:"";
      return `<g class="state-value${geographic?" state-value--geographic":""}" transform="translate(${position[0]} ${position[1]})" aria-hidden="true">${connector}<circle r="${geographic?10:24}"/><text y="0">${count}</text></g>`;
    }).join("");
    svg.insertAdjacentHTML("beforeend",labels);
    $("#state-ranking").classList.toggle("hdb-map-sector-legend",mapMode==="sectors");
    $("#state-ranking").innerHTML=mapMode==="sectors"?[...sectorCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"de")).map(([label,count])=>`<div class="hdb-map-sector-row"><i class="state-dot" style="--segment-color:${sectorColor(label === "Ohne Angabe" ? "" : label)}" aria-hidden="true"></i><span>${escape(label)}</span><strong>${count}</strong></div>`).join(""):[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"de")).map(([name,count])=>`<button class="state-rank" data-region="${escape(name)}" aria-label="${escape(name)}, ${count} ${count===1?"Termin":"Termine"} ansehen"><i class="state-dot" style="--segment-color:${colors[Math.min(count,4)]}" aria-hidden="true"></i><span>${escape(name)}</span><strong>${count}</strong></button>`).join("");
    page.querySelectorAll("[data-map-mode]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.mapMode===mapMode)));
    page.querySelector(".map-scale").innerHTML=mapMode==="sectors"?"Termine nach Sektor":"<i></i>Termine je Bundesland";
    $("#coverage-donut").innerHTML=donut([{label:"Mit Beschreibung",count:data.counts.withDescription,color:"#00D46A"},{label:"Ohne Beschreibung",count:data.counts.withoutDescription,color:"#E3EBF6"}],`${data.counts.withDescription}<tspan class="donut-denominator"> / ${data.visits.length}</tspan>`,"Hospitationen",null,"",`${data.visits.length} aktive Hospitationen, ${data.counts.withDescription} mit beschriebener Beobachtung und ${data.counts.withoutDescription} ohne`);
  }
  function addOption(select, value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  [...new Set(data.records.map((record) => record.sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"de")).forEach((value) => {
    const count = data.records.filter((record)=>record.sector===value).length;
    addOption($("#context"),value,`${value} (${count})`);
  });
  const withoutSector = data.records.filter(record => !record.sector).length;
  if (withoutSector) addOption($("#context"), "__empty", `Ohne Angabe (${withoutSector})`);
  phaseStats.slice().sort((a,b)=>a.label.localeCompare(b.label,"de")).forEach(group=>addOption($("#phase"),group.id,group.label));
  problemStats.slice().sort((a,b)=>a.label.localeCompare(b.label,"de")).forEach(group=>addOption($("#problem"),group.id,group.label));
  data.visits.filter((visit)=>visit.count).forEach((visit)=>addOption($("#visit"),visit.id,`${visitLabel(visit)} (${visit.count})`));
  data.themes.forEach(theme=>addOption($("#theme"),theme.id,`${theme.label} (${theme.count})`));
  evidenceGroups.forEach(({id,label})=>addOption($("#evidence"),id,label));
  [...new Set(data.visits.map(visit=>visit.state).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"de")).forEach(value=>addOption($("#region"),value,value));
  addOption($("#region"),"__empty","Ohne Bundeslandangabe");

  function matches(record) {
    const visit = visits.get(record.appointmentId);
    const searchText = [record.title,record.description,record.situation,visit.name,visit.city,record.number,record.id].join(" ").toLocaleLowerCase("de");
    return (!state.theme || record.theme === state.theme)
      && (!state.context || (state.context === "__empty" ? !record.sector : record.sector === state.context))
      && (!state.phase || phaseIndex.get(state.phase)?.has(record.id))
      && (!state.problem || problemIndex.get(state.problem)?.has(record.id))
      && (!state.visit || record.appointmentId === state.visit)
      && (!state.evidence || record.evidenceKind === state.evidence)
      && (!state.region || (state.region === "__empty" ? !visit.state : visit.state === state.region))
      && (!state.search || searchText.includes(state.search.toLocaleLowerCase("de").trim()));
  }
  function row(record) {
    const visit=visits.get(record.appointmentId);
    return `<button type="button" class="observation-row hdb-compact-row" data-record="${escape(record.id)}" aria-label="Beobachtung #${escape(record.number)}. ${escape(record.title)}. Hospitation: ${escape(visit.name)}"><span class="record-number">${escape(record.number)}</span>${avatar(visit)}<span class="record-title">${escape(record.title)}</span><span class="hdb-row-arrow" aria-hidden="true">↗</span></button>`;
  }
  function activeFilter(key, label, value) { return `<button class="active-filter" data-remove="${key}" aria-label="${escape(label)} entfernen">${escape(label)}: ${escape(value)} <span aria-hidden="true">×</span></button>`; }
  function renderRecords() {
    const filtered = data.records.filter(matches).sort((left,right)=>Number(left.number)-Number(right.number));
    const pageCount = Math.ceil(filtered.length / pageSize);
    state.page = Math.max(0,Math.min(state.page,pageCount-1));
    const shown = filtered.slice(state.page * pageSize,(state.page+1) * pageSize);
    $("#observation-list").innerHTML = shown.map(row).join("");
    $("#observation-list").hidden = !filtered.length;
    $("#empty-state").hidden = !!filtered.length;
    $("#result-count").textContent = `${filtered.length} ${filtered.length===1 ? "Beobachtung" : "Beobachtungen"} aus ${new Set(filtered.map(record=>record.appointmentId)).size} Hospitationen`;
    $("#page-range").textContent = filtered.length ? `${state.page * pageSize+1} bis ${state.page * pageSize+shown.length} von ${filtered.length}` : "0 Beobachtungen";
    $("#previous-page").disabled = !state.page;
    $("#next-page").disabled = state.page >= pageCount-1;
    const active = [];
    if (state.theme) active.push(activeFilter("theme","Thema",data.themes.find((theme)=>theme.id===state.theme).label));
    if (state.context) active.push(activeFilter("context","Sektor",contextLabel(state.context)));
    if (state.phase) active.push(activeFilter("phase","Phase",state.phase==="__empty"?"Ohne Angabe":state.phase));
    if (state.problem) active.push(activeFilter("problem","Problemtyp",state.problem));
    if (state.visit) active.push(activeFilter("visit","Hospitation",visitLabel(visits.get(state.visit))));
    if (state.evidence) active.push(activeFilter("evidence","Belegart",evidence[state.evidence]));
    if (state.region) active.push(activeFilter("region","Bundesland",state.region === "__empty" ? "Ohne Angabe" : state.region));
    if (state.search) active.push(activeFilter("search","Suche",state.search));
    $("#active-filters").innerHTML = active.join("");
    $("#filter-count").textContent=active.length?`${active.length} aktiv`:"";
    $("#reset-filters").hidden = !active.length;
    renderThemes();
  }
  function syncControls() {
    ["search","theme","context","phase","problem","visit","evidence","region"].forEach((key)=>{ $(`#${key}`).value = state[key]; });
  }
  function reset() { Object.assign(state,{theme:"",search:"",context:"",phase:"",problem:"",visit:"",evidence:"",region:"",page:0}); syncControls(); renderRecords(); }
  function openWorkspace() {
    presentDialog(browser);
    $("#search").focus({preventScroll:true});
  }
  function scrollToList() { openWorkspace(); $("#observation-workspace").scrollTop=0; }
  page.querySelector("[data-close-browser]").addEventListener("click",()=>browser.close());
  browser.addEventListener("click",event=>{if(event.target===browser && (event.clientX<browser.getBoundingClientRect().left || event.clientX>browser.getBoundingClientRect().right || event.clientY<browser.getBoundingClientRect().top || event.clientY>browser.getBoundingClientRect().bottom))browser.close();});
  $("#filters").addEventListener("submit",(event)=>event.preventDefault());
  $("#filter-details").open=Boolean(state.filtersExpanded);
  $("#filter-details").addEventListener("toggle",()=>{state.filtersExpanded=$("#filter-details").open;});
  $("#search").addEventListener("input",(event)=>{state.search=event.target.value;state.page=0;renderRecords();});
  ["theme","context","phase","problem","visit","evidence","region"].forEach((key)=>$(`#${key}`).addEventListener("change",(event)=>{state[key]=event.target.value;state.page=0;renderRecords();}));
  page.addEventListener("click",(event)=>{
    const theme=event.target.closest("[data-theme]");
    const context=event.target.closest("[data-chart-context]");
    const kind=event.target.closest("[data-chart-evidence]");
    const phase=event.target.closest("[data-stat-phase]");
    const problem=event.target.closest("[data-stat-problem]");
    if(theme){reset();state.theme=theme.dataset.theme;}
    else if(context){reset();state.context=context.dataset.chartContext;}
    else if(kind){reset();state.evidence=kind.dataset.chartEvidence;}
    else if(phase){reset();state.phase=phase.dataset.statPhase;}
    else if(problem){reset();state.problem=problem.dataset.statProblem;}
    else return;
    state.page=0;syncControls();renderRecords();scrollToList();$("#search").focus({preventScroll:true});
  });
  page.addEventListener("keydown",event=>{
    if((event.key==="Enter"||event.key===" ")&&event.target.matches("svg [role='button']")){
      event.preventDefault();event.target.dispatchEvent(new MouseEvent("click",{bubbles:true}));
    }
  });
  $("#active-filters").addEventListener("click",(event)=>{
    const button=event.target.closest("[data-remove]");
    if (!button) return;
    state[button.dataset.remove]="";state.page=0;syncControls();renderRecords();
  });
  $("#reset-filters").addEventListener("click",reset);
  $("#empty-reset").addEventListener("click",reset);
  $("#previous-page").addEventListener("click",()=>{state.page--;renderRecords();scrollToList();});
  $("#next-page").addEventListener("click",()=>{state.page++;renderRecords();scrollToList();});

  function openRecord(id) {
    const record=records.get(id);
    if (!record) return;
    const visit=visits.get(record.appointmentId);
    const sourceDateStart = String(record.themeSourceDate || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    const sourceDateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? date(value) : (value || "Keine Angabe");
    const differs = sourceDateStart && sourceDateStart !== visit.date;
    const uncertainty = [...new Set([record.limitations,record.uncertainty].filter(Boolean))].join("\n\n");
    showDialog(`Beobachtung #${record.number}`,`<h2 id="hdb-detail-title">${escape(record.title)}</h2><div class="detail-context"><strong>${escape(visitLabel(visit))}</strong><span>${date(visit.date)} im aktuellen Framework</span><span>${escape(evidence[record.evidenceKind])}</span></div>${record.situation?`<h3>Versorgungssituation</h3>${paragraph(record.situation)}`:""}<h3>Beschreibung</h3>${paragraph(record.description)}<h3>Herkunft</h3><dl class="detail-facts">${fact("Quellenart",record.sourceType === "qualitative_observation" ? "Qualitative Beobachtung" : record.sourceType)}${fact("Quellenangabe",record.source === "documentation" ? "Dokumentation" : record.source)}${fact("Quellenverweis",record.sourceReference)}</dl>${uncertainty?`<h3>Dokumentierte Grenzen</h3>${paragraph(uncertainty)}`:`<div class="detail-note"><p>In den Feldern zu Grenzen und Unsicherheit steht keine Angabe. Das ist kein Nachweis einer abgeschlossenen Quellenprüfung.</p></div>`}<h3>Redaktionelles Thema</h3><dl class="detail-facts">${fact("Thema",record.themeLabel)}${fact("Zuordnungsgrund",record.themeReason)}${record.ambiguity?fact("Abgrenzung",record.ambiguity):""}</dl><h3>Vorhandene Codierung</h3><dl class="detail-facts">${fact("Versorgungskontext",record.settingType)}${fact("Prozessphase",record.processPhase)}${fact("Beobachtungsart",record.observationType)}${fact("Problemtyp",record.problemType)}</dl><h3>Verbindung zum Framework</h3>${groupConnections(record)}<details><summary>Stabile Kennungen und Quellenstand</summary><dl class="detail-facts">${fact("Beobachtungs-ID",record.id)}${fact("Termin-ID",record.appointmentId)}${record.historicalDisplayId ? fact("Historische Kennung", `${record.historicalDisplayId}, geprüft am ${date(record.historicalDisplayCheckedAt.slice(0,10))}`) : ""}${fact("Datum in Themenquelle",sourceDateLabel(record.themeSourceDate))}</dl>${differs?`<div class="detail-note"><p>Die Themenquelle nennt ${sourceDateLabel(record.themeSourceDate)}. Der gespeicherte Termin ist am ${date(visit.date)}.</p></div>`:""}</details><div class="detail-links"><button type="button" class="secondary-button" data-original-record="${escape(record.id)}">Originaleintrag öffnen →</button></div>`);
  }
  function groupConnections(record) {
    const groups=data.groups.filter((group)=>group.ids.includes(record.id));
    if (!groups.length) return `<p>Diese Beschreibung gehört zu keiner der ${data.groups.length} technisch gebildeten Mustergruppen. Daraus folgt keine inhaltliche Bewertung.</p>`;
    return groups.map((group)=>`<p>Gleiche Codes bei ${group.ids.length} Beobachtungen aus ${group.hospitationCount} Hospitationen. Ein Vergleichshinweis, kein bestätigtes Muster.</p><div class="detail-links">${group.ids.filter((id)=>id!==record.id).map((id)=>`<button class="text-button" data-record="${escape(id)}">Beobachtung #${records.get(id).number} lesen →</button>`).join("")}</div>`).join("");
  }
  let visitOverview={region:"",search:"",mode:"all",scroll:0};
  function openVisits(region="",mode="all",restore=false) {
    if (!restore) visitOverview={region,search:"",mode,scroll:0};
    const title=visitOverview.mode==="missingDescription"?"Termine ohne Frameworkbeschreibung":"Hospitationen";
    showDialog(title,`<h2 id="hdb-detail-title" class="sr-only">${title}</h2>${visitOverview.mode==="missingDescription"?"<p>Eine fehlende Beschreibung im Framework belegt keine fehlende Originalquelle.</p>":""}<div class="hdb-visit-controls"><label>Hospitation suchen<input id="hdb-visit-search" type="search" placeholder="Name oder Ort" autocomplete="off"></label><label>Bundesland<select id="hdb-visit-region"><option value="">Alle Bundesländer</option>${[...new Set(data.visits.map(visit=>visit.state).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"de")).map(name=>`<option value="${escape(name)}">${escape(name)}</option>`).join("")}<option value="__empty">Ohne Bundeslandangabe</option></select></label></div><p id="hdb-visits-result" aria-live="polite"></p><ul class="detail-list" id="hdb-visits-list"></ul><div class="detail-links" id="hdb-browse-state"></div>`,"hospitations");
    $("#visit-search").value=visitOverview.search;
    $("#visit-region").value=visitOverview.region;
    const update=()=>{
      const matching=data.visits.filter(visit=>(visitOverview.mode!=="missingDescription" || !visit.count) && (!visitOverview.region || (visitOverview.region==="__empty" ? !visit.state : visit.state===visitOverview.region)) && (!visitOverview.search || [visit.name,visit.city,visit.state].join(" ").toLocaleLowerCase("de").includes(visitOverview.search.toLocaleLowerCase("de").trim())));
      $("#visits-result").textContent=`${matching.length} ${matching.length===1?"Hospitation":"Hospitationen"}`;
      const count=matching.reduce((sum,visit)=>sum+visit.count,0);
      $("#browse-state").innerHTML=visitOverview.region && !visitOverview.search && visitOverview.mode==="all" && count ? `<button type="button" class="secondary-button" data-browse-region="${escape(visitOverview.region)}">${count} Beobachtungen aus diesem Bundesland ansehen →</button>` : "";
      $("#visits-list").innerHTML=matching.length ? matching.map(visit=>`<li class="hdb-visit-row"><button type="button" class="hdb-visit-button" data-visit-record="${escape(visit.id)}">${avatar(visit)}<span class="hdb-visit-identity"><strong>${escape(visit.name)}</strong>${visit.displayOrganization?`<small>${escape(visit.displayOrganization)}</small>`:""}</span><span class="hdb-visit-meta"><time class="hdb-visit-date" datetime="${escape(visit.date)}">${date(visit.date)}</time><span class="hdb-visit-count"><strong class="hdb-visit-count-number">${visit.count}</strong> <span class="hdb-visit-count-label">${visit.count===1?"Beobachtung":"Beobachtungen"}</span></span></span><span class="hdb-row-arrow" aria-hidden="true">↗</span></button></li>`).join("") : "<li>Keine passende Hospitation. Suche oder Bundesland ändern.</li>";
    };
    $("#visit-search").addEventListener("input",event=>{visitOverview.search=event.target.value;update();});
    $("#visit-region").addEventListener("change",event=>{visitOverview.region=event.target.value;update();});
    update();
    $("#detail-body").scrollTop=visitOverview.scroll;
  }
  function openVisit(id) {
    const visit=visits.get(id);
    if (!visit) return;
    const overview=$("#visits-list");
    if (overview) visitOverview.scroll=$("#detail-body").scrollTop;
    showDialog("Hospitation",`<div class="hdb-visit-hero">${avatar(visit)}<div><h2 id="hdb-detail-title">${escape(visit.name)}</h2>${visit.displayOrganization?`<small>${escape(visit.displayOrganization)}</small>`:""}<p>${escape(visit.city || visit.state || "Ort offen")}</p></div></div><dl class="detail-facts">${fact("Datum",date(visit.date))}${fact("Bundesland",visit.state)}${fact("Beschriebene Beobachtungen",String(visit.count))}</dl><div class="detail-links">${visit.count?`<button type="button" class="secondary-button" data-browse-visit="${escape(visit.id)}">${visit.count} Beobachtungen ansehen →</button>`:"<p>Keine beschriebene Beobachtung im aktuellen Frameworkbestand.</p>"}<button type="button" class="text-button" data-return-visits>Zurück zu den Hospitationen</button></div>`,"hospitations");
  }
  function openGaps() { openVisits("","missingDescription"); }
  function openRegion(name) { openVisits(name); }
  function openMapMissing() { openVisits("__empty"); }
  page.addEventListener("click",event=>{
    const region=event.target.closest("[data-region]");
    const visit=event.target.closest("[data-visit-record]");
    const browse=event.target.closest("[data-browse-visit]");
    const browseRegion=event.target.closest("[data-browse-region]");
    if(region)openRegion(region.dataset.region);
    else if(visit)openVisit(visit.dataset.visitRecord);
    else if(browse){dialog.close();reset();state.visit=browse.dataset.browseVisit;syncControls();renderRecords();scrollToList();}
    else if(browseRegion){dialog.close();reset();state.region=browseRegion.dataset.browseRegion;syncControls();renderRecords();scrollToList();}
    else if(event.target.closest("[data-return-visits]"))openVisits("","all",true);
    else if(event.target.closest("[data-open-visits]"))openVisits();
    else if(event.target.closest("[data-map-missing]"))openMapMissing();

    else if(event.target.closest("[data-open-observations],[data-open-themes]")){reset();openWorkspace();}
  });
  page.addEventListener("click",(event)=>{
    const record=event.target.closest("[data-record]");
    if (record) { openRecord(record.dataset.record); return; }
    const open=event.target.closest("[data-open]");
    if (open) { openGaps();return; }
    const mapView=event.target.closest("[data-map-mode]");
    if(mapView && ["distribution","sectors"].includes(mapView.dataset.mapMode)){mapMode=mapView.dataset.mapMode;renderMap();}

  });
  syncSummary();
  renderMap();
  syncControls();
  renderRecords();
  applyWidgets();
  if (previousBrowser?.open) { openWorkspace(); $("#observation-workspace").scrollTop=previousBrowser.scroll; }

  }
  window.HospitationDashboard=Object.freeze({load,render,closeDetails,sectorForVisit,sectorForObservation});
})();
