(function () {
  "use strict";

  const tabItems = [["overview", "Aktuelle Einblicke"], ["framework", "Framework"], ["science", "Wissenschaftlicher Hintergrund"], ["questionnaire", "Fragebogen"]];
  const stages = [["hospitations", "Hospitationen"], ["observations", "Beobachtungen"], ["pattern", "Muster"], ["hypothesis", "Hypothesen"], ["nextStep", "Nächste Schritte"]];
  const methodItems = [["observations", "Beobachtung"], ["patterns", "Muster"], ["hypothesis", "Hypothese"], ["evidence", "Nächster Schritt"]];
  const methodGuides = {
    observations: {
      lead: "Eine konkrete Arbeitssituation mit Beteiligten, Ablauf und Quelle festhalten. Beschreibung und Deutung bleiben getrennt.",
      steps: [["Situation beschreiben", "Wer tat bei welchem Anlass was? Nur beschriebene Folgen festhalten."], ["Quelle verknüpfen", "Notiz, Transkript oder datierte Erinnerung zuordnen. Fehlende Angaben bleiben offen."], ["Bei Bedarf codieren", "Passende Begriffe am beschriebenen Text begründen."]]
    },
    patterns: {
      lead: "Mehrere Situationen zu einer gemeinsamen Frage vergleichen und einen wiederkehrenden Zusammenhang begründen.",
      steps: [["Frage wählen", "Welche Aufgabe oder welcher Ablauf wird verglichen?"], ["Beobachtungen vergleichen", "Gemeinsamkeiten und Unterschiede am Text prüfen. Gleiche Codes sind nur ein Vergleichshinweis."], ["Aussage begrenzen", "Passende Fälle und Gegenbeispiele benennen."]]
    },
    hypothesis: {
      lead: "Eine mögliche Erklärung als prüfbare Annahme formulieren. Sie bleibt offen für Gegenbeispiele.",
      steps: [["Zusammenhang benennen", "Welche Bedingung könnte welchen Ablauf beeinflussen?"], ["Prüffrage formulieren", "Woran ließe sich die Annahme erkennen oder widerlegen?"], ["Andere Erklärungen prüfen", "Was würde dagegen sprechen? Die Annahme bleibt bis zur Prüfung ungeprüft."]]
    },
    evidence: {
      lead: "Eine offene Frage durch eine konkrete Handlung weiter klären.",
      steps: [["Frage festhalten", "Was fehlt für eine begründete Aussage?"], ["Handlung wählen", "Eine Quelle prüfen, nachfragen oder gezielt beobachten."], ["Abschluss klären", "Wer übernimmt und wann ist der Schritt erledigt? Planung und geprüftes Ergebnis bleiben getrennt."]]
    }
  };
  const publications = [
    { title: "Using the framework method for the analysis of qualitative data in multi-disciplinary health research", authors: "Gale et al.", year: "2013", license: "CC BY 2.0", image: "gale-2013-first-page.png", original: true, url: "https://link.springer.com/article/10.1186/1471-2288-13-117", summary: "Die Framework Method ordnet qualitative Daten nach Fällen und Themen. Sie unterstützt Vergleiche und erhält den Fallkontext." },
    { title: "Work system design for patient safety: the SEIPS model", authors: "Carayon et al.", year: "2006", image: "carayon-2006-preview.svg", url: "https://qualitysafety.bmj.com/content/15/suppl_1/i50", summary: "SEIPS betrachtet Menschen, Aufgaben, Werkzeuge und Technik, räumliche Umgebung und Organisation im Zusammenspiel. Diese Perspektiven helfen, Beobachtungen im Versorgungskontext einzuordnen." },
    { title: "Using observation to better understand the healthcare context", authors: "Weston, Krein & Harrod", year: "2022", image: "weston-2022-preview.svg", secondary: true, url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10336880/", summary: "Beobachtung erschließt Abläufe, Beteiligte und Kontext. Der Beitrag erläutert Planung, Feldnotizen und Auswertung." },
    { title: "Direct Observation Methods: a Practical Guide for Health Researchers", authors: "Fix et al.", year: "2022", secondary: true, image: "fix-2022-preview.svg", url: "https://pubmed.ncbi.nlm.nih.gov/36406296/", summary: "Ein praktischer Leitfaden zur Planung und Durchführung direkter Beobachtungen in der Gesundheitsforschung." }
  ];
  const calendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg>';
  let current = null;
  let pending = null;
  const text = value => String(value == null ? "" : value).trim();
  const escape = value => text(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const icon = stage => stage === "hospitations" ? calendar : window.HospitationFrameworkIcons?.svg(stage) || "";
  const visitDate = row => text(row?.scheduledOn || row?.startsAt || row?.date).slice(0, 10);
  const visitName = row => text(row?.organizationName || row?.displayOrganization || row?.contactName || row?.displayName) || (row?.city ? `Hospitation in ${text(row.city)}` : "Hospitation");
  const activeVisit = row => row && row.status !== "Archiviert" && !row.archivedAt;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime());
  function dateLabel(value, long = false) {
    if (!validDate(value)) return "Termin offen";
    return new Date(`${value}T12:00:00`).toLocaleDateString("de-DE", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function dateTile(value) {
    if (!validDate(value)) return '<span class="ho-date"><strong>?</strong><span>Offen</span></span>';
    const date = new Date(`${value}T12:00:00`);
    const month = date.toLocaleDateString("de-DE", { month: "short" }).replace(/\.$/, "");
    return `<time class="ho-date" datetime="${escape(value)}" aria-label="${escape(dateLabel(value, true))}"><strong>${date.getDate()}</strong><span>${escape(month)} ${date.getFullYear()}</span></time>`;
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function navigate(route) {
    if (typeof current?.onNavigate === "function") return current.onNavigate(route);
    window.location.hash = route;
    return true;
  }

  function showTab(value) {
    if (!current) return false;
    const key = tabItems.some(([id]) => id === value) ? value : "overview";
    current.tab = key;
    current.root.dataset.overviewTab = key;
    for (const [id] of tabItems) {
      const selected = id === key;
      const button = current.buttons.get(id);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      current.panels.get(id).hidden = !selected;
    }
    return key;
  }
  function activateTab(value, focus = false) {
    if (!current) return;
    if (navigate(`hospitation-overview?tab=${value}`) === false) return;
    showTab(value);
    if (focus) current.buttons.get(value)?.focus();
  }

  function adoptFramework(details, panel, science) {
    details.forEach((detail, index) => {
      const [sourceKey, title] = methodItems[index];
      const stage = { patterns: "pattern", evidence: "nextStep" }[sourceKey] || sourceKey;
      const guide = methodGuides[sourceKey];
      const summary = detail.querySelector(":scope > summary");
      const card = detail.querySelector(".framework-publication-card");
      if (card) science.appendChild(card);
      if (summary) {
        summary.replaceChildren();
        const mark = element("span", "ho-method-icon");
        mark.setAttribute("aria-hidden", "true");
        mark.innerHTML = icon(stage);
        const toggle = element("span", "ho-method-toggle");
        toggle.setAttribute("aria-hidden", "true");
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"></path><path class="ho-method-plus-stem" d="M12 5v14"></path></svg>';
        summary.append(mark, element("strong", "", title), element("span", "ho-method-lead", guide.lead), toggle);
      }
      const body = detail.querySelector(".framework-accordion-body");
      if (body) {
        const flow = element("ol", "ho-method-flow");
        flow.setAttribute("aria-label", `Vorgehen: ${title}`);
        guide.steps.forEach(([heading, description], stepIndex) => {
          const item = element("li", "ho-method-action");
          const number = element("span", "ho-method-action-number", stepIndex + 1);
          number.setAttribute("aria-hidden", "true");
          const copy = element("p", "ho-method-action-copy");
          copy.append(element("strong", "", `${heading}. `), document.createTextNode(description));
          item.append(number, copy);
          flow.appendChild(item);
        });
        body.replaceChildren(flow);
      }
      detail.classList.add("ho-method");
      detail.removeAttribute("style");
      detail.open = false;
      panel.appendChild(detail);
    });
    science.replaceChildren();
    const publicationCard = publication => {
      const card = element("a", "framework-publication-card ho-publication");
      card.href = publication.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      const image = element("img", "ho-publication-image");
      image.src = new URL(`./literature/${publication.image}`, current.scriptUrl).href;
      image.width = 96;
      image.height = 136;
      image.alt = `${publication.original ? "Erste Seite des Originalartikels" : "Typografische Artikelvorschau"}: ${publication.title}`;
      const cover = element("span", "ho-publication-cover");
      cover.appendChild(image);
      const copy = element("span", "ho-publication-copy");
      const citation = [publication.authors, publication.year, publication.license].filter(Boolean).join(" · ");
      copy.append(element("span", "ho-citation", citation), element("strong", "ho-publication-title", publication.title), element("span", "ho-publication-description", publication.summary), element("span", "ho-publication-link", "Artikel lesen ↗"));
      card.append(cover, copy);
      return card;
    };
    const primary = element("div", "ho-science-primary");
    publications.filter(publication => !publication.secondary).forEach(publication => primary.appendChild(publicationCard(publication)));
    const sources = element("section", "ho-science-sources");
    const sourceTitle = element("h3", "ho-science-title", "Weitere Quellen");
    const list = element("ul", "ho-science-source-list");
    [
      ["SEIPS 101", "Holden & Carayon, 2021. Praktische Werkzeuge zur Betrachtung von Arbeitssituationen.", "https://doi.org/10.1136/bmjqs-2020-012538"],
      ["SEIPS 3.0", "Carayon et al., 2020. Versorgungswege über Orte und Zeit betrachten.", "https://doi.org/10.1016/j.apergo.2019.103033"],
      ["Shadowing", "McDonald, 2005. Arbeit im jeweiligen Kontext durch Mitlaufen erschließen.", "https://doi.org/10.1177/1468794105056923"]
    ].forEach(([title, description, url]) => {
      const item = element("li");
      const link = element("a", "ho-science-source");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(element("strong", "", title), element("span", "", description));
      item.appendChild(link);
      list.appendChild(item);
    });
    sources.append(sourceTitle, list);
    const more = element("details", "ho-science-more");
    more.appendChild(element("summary", "", "Beobachtungsmethodik vertiefen"));
    const further = element("div", "ho-science-further");
    publications.filter(publication => publication.secondary).forEach(publication => further.appendChild(publicationCard(publication)));
    more.appendChild(further);
    science.append(primary, sources, more, element("p", "ho-science-note", "Die Schritte des Hospitations-Frameworks und die sechs Prozessphasen sind eigene Arbeitseinteilungen."));
  }

  function adoptQuestionnaire(form, panel) {
    if (!form) {
      panel.appendChild(element("p", "ho-empty", "Der Fragebogen ist derzeit nicht verfügbar."));
      return;
    }
    const layout = element("div", "ho-questionnaire-layout");
    const nav = element("nav", "ho-questionnaire-nav");
    nav.setAttribute("aria-label", "Abschnitte des Fragebogens");
    nav.appendChild(element("span", "ho-questionnaire-nav-label", "Abschnitte"));
    const list = element("ol");
    nav.appendChild(list);
    const mobileLabel = element("label", "ho-questionnaire-mobile", "Abschnitt");
    const mobileSelect = element("select", "ho-questionnaire-picker");
    mobileSelect.setAttribute("aria-label", "Abschnitt des Fragebogens");
    mobileLabel.appendChild(mobileSelect);
    const position = element("span", "ho-questionnaire-position");
    position.setAttribute("aria-live", "polite");
    const steps = [...form.querySelectorAll("details[data-questionnaire-section]")];
    const buttons = [];
    let switching = false;
    function sync(index) {
      if (index < 0) index = 0;
      form.dataset.hoStep = String(index + 1);
      position.textContent = `Abschnitt ${index + 1} von ${steps.length}`;
      mobileSelect.value = String(index);
      buttons.forEach((button, i) => button.setAttribute("aria-current", i === index ? "step" : "false"));
    }
    function choose(index) {
      if (!steps[index]) return;
      switching = true;
      steps.forEach((step, i) => { step.open = i === index; });
      switching = false;
      sync(index);
    }
    steps.forEach((step, index) => {
      const title = text(step.querySelector("h3")?.textContent).replace(/^\d+\s*\|\s*/, "");
      const heading = step.querySelector("h3");
      if (heading) heading.textContent = title;
      const button = element("button", "ho-questionnaire-step");
      button.type = "button";
      if (step.id) button.setAttribute("aria-controls", step.id);
      else { step.id = `ho-questionnaire-section-${index + 1}`; button.setAttribute("aria-controls", step.id); }
      button.append(element("span", "", index + 1), document.createTextNode(title));
      button.addEventListener("click", () => choose(index));
      const item = element("li");
      item.appendChild(button);
      list.appendChild(item);
      buttons.push(button);
      const option = element("option", "", `${index + 1}. ${title}`);
      option.value = String(index);
      mobileSelect.appendChild(option);
      step.addEventListener("toggle", () => {
        if (switching) return;
        if (step.open) choose(index);
        else {
          const active = steps.findIndex(item => item.open);
          if (active < 0) choose(index);
          else sync(active);
        }
      });
    });
    mobileSelect.addEventListener("change", () => choose(Number(mobileSelect.value)));
    form.classList.add("ho-questionnaire-form");
    form.prepend(mobileLabel, position);
    const downloads = form.querySelector(".questionnaire-toolbar--actions-only");
    if (downloads) { downloads.classList.add("ho-questionnaire-downloads"); form.appendChild(downloads); }
    layout.append(nav, form);
    panel.appendChild(layout);
    choose(Math.max(0, steps.findIndex(step => step.open)));
  }

  const scriptUrl = document.currentScript?.src || new URL("./hospitation/hospitation-overview.js", window.location.href).href;
  function mount(options = {}) {
    const root = options.root || document.getElementById("view-hospitation-overview");
    if (!root) return false;
    if (current?.root === root) {
      if (typeof options.onNavigate === "function") current.onNavigate = options.onNavigate;
      return true;
    }
    const form = document.getElementById("hospitation-questionnaire-form");
    const details = methodItems.map(([key]) => document.getElementById(`framework-accordion-${key}`)).filter(Boolean);
    if (form) form.remove();
    details.forEach(detail => detail.remove());
    current = { root, scriptUrl, onNavigate: options.onNavigate, tab: "overview", panels: new Map(), buttons: new Map(), data: {} };
    root.classList.add("ho-mounted");
    const toolbar = element("div", "ho-toolbar");
    toolbar.appendChild(element("h2", "", "Hospitationsframework"));
    const create = element("button", "ho-button ho-button-primary", "Beobachtung erfassen +");
    create.type = "button";
    create.disabled = true;
    create.addEventListener("click", () => current.data.createObservation?.());
    toolbar.appendChild(create);
    current.create = create;
    const process = element("nav", "ho-process");
    process.setAttribute("aria-label", "Hospitationsframework");
    process.innerHTML = `<ol>${stages.map(([id, label]) => `<li><a class="ho-stage" href="#hospitations:synthesis?stage=${id}" data-ho-route="hospitations:synthesis?stage=${id}"><span class="ho-stage-icon">${icon(id)}</span><strong>${label}</strong><span class="ho-count" data-ho-count="${id}">…</span></a></li>`).join("")}</ol>`;
    const tabs = element("div", "ho-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Bereiche der Übersicht");
    tabItems.forEach(([key, label], index) => {
      const button = element("button", "", label);
      button.type = "button";
      button.id = `ho-tab-${key}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `ho-panel-${key}`);
      button.addEventListener("click", () => activateTab(key));
      button.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabItems.length;
        if (event.key === "ArrowLeft") next = (index + tabItems.length - 1) % tabItems.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabItems.length - 1;
        if (next == null) return;
        event.preventDefault();
        activateTab(tabItems[next][0], true);
      });
      tabs.appendChild(button);
      const panel = element("section", `ho-tab-panel ho-tab-panel-${key}`);
      panel.id = `ho-panel-${key}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      current.buttons.set(key, button);
      current.panels.set(key, panel);
    });
    const insights = current.panels.get("overview");
    insights.innerHTML = '<div class="ho-recent-grid"><section class="ho-panel" aria-labelledby="ho-visits-title"><header><h3 id="ho-visits-title">Letzte fünf Hospitationen</h3><a href="#hospitations:synthesis?stage=hospitations" data-ho-route="hospitations:synthesis?stage=hospitations">Alle ansehen →</a></header><ol class="ho-recent-list" data-ho-visits></ol></section><section class="ho-panel" aria-labelledby="ho-observations-title"><header><h3 id="ho-observations-title">Letzte fünf Beobachtungen</h3><a href="#hospitations:synthesis?stage=observations" data-ho-route="hospitations:synthesis?stage=observations">Alle ansehen →</a></header><ol class="ho-recent-list" data-ho-observations></ol></section></div><section class="ho-dashboard" aria-labelledby="ho-dashboard-title"><header><h2 id="ho-dashboard-title">Dashboard</h2><a href="#hospitations:dashboard" data-ho-route="hospitations:dashboard">Dashboard öffnen ↗</a></header><div class="ho-dashboard-summary" data-ho-dashboard></div></section>';
    adoptFramework(details, current.panels.get("framework"), current.panels.get("science"));
    adoptQuestionnaire(form, current.panels.get("questionnaire"));
    root.replaceChildren(toolbar, process, tabs, ...current.panels.values());
    root.addEventListener("click", event => {
      const route = event.target.closest("[data-ho-route]");
      if (route && root.contains(route)) { event.preventDefault(); navigate(route.dataset.hoRoute); return; }
      const visit = event.target.closest("[data-ho-visit]");
      if (visit) current.data.openHospitation?.(visit.dataset.hoVisit);
      const observation = event.target.closest("[data-ho-observation]");
      if (observation) current.data.openObservation?.(observation.dataset.hoObservation);
    });
    showTab("overview");
    render(pending || { status: "loading" });
    return true;
  }

  function render(options = {}) {
    pending = options;
    if (!current) return false;
    current.data = { ...current.data, ...options };
    const data = current.data;
    const ready = data.status === "ready";
    current.create.disabled = !ready || typeof data.createObservation !== "function";
    current.create.hidden = ready && typeof data.createObservation !== "function";
    current.root.dataset.overviewState = ready ? "ready" : data.status === "error" ? "error" : "loading";
    const lists = [current.root.querySelector("[data-ho-visits]"), current.root.querySelector("[data-ho-observations]")];
    const dashboard = current.root.querySelector("[data-ho-dashboard]");
    if (!ready) {
      const message = data.status === "error" ? "Hospitationsdaten konnten nicht geladen werden." : "Hospitationsdaten werden geladen.";
      lists.forEach(list => { list.innerHTML = `<li class="ho-empty">${message}</li>`; });
      dashboard.replaceChildren(element("p", "ho-empty", message));
      current.root.querySelectorAll("[data-ho-count]").forEach(node => { node.textContent = "…"; });
      return true;
    }
    const visits = (Array.isArray(data.hospitations) ? data.hospitations : []).filter(activeVisit);
    const visitMap = new Map(visits.map(row => [String(row.id), row]));
    const observations = (Array.isArray(data.observations) ? data.observations : []).filter(row => row && row.status !== "archived" && !row.archivedAt && visitMap.has(String(row.hospitationId || row.hospitation?.id)));
    const metrics = data.metrics || {};
    const counts = { hospitations: visits.length, observations: metrics.observations ?? observations.length, pattern: metrics.patterns, hypothesis: metrics.hypotheses, nextStep: metrics.nextSteps };
    current.root.querySelectorAll("[data-ho-count]").forEach(node => {
      const count = counts[node.dataset.hoCount];
      node.textContent = count != null && Number.isFinite(Number(count)) ? String(Number(count)) : "…";
    });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const recentVisits = visits.filter(row => validDate(visitDate(row)) && visitDate(row) <= today && ["Durchgeführt", "Dokumentiert"].includes(row.status)).sort((left, right) => visitDate(right).localeCompare(visitDate(left)) || String(left.id).localeCompare(String(right.id))).slice(0, 5);
    const recentObservations = observations.filter(row => text(row.title || row.description || row.observed)).sort((left, right) => text(right.createdAt).localeCompare(text(left.createdAt)) || (Number(right._chronologicalNumber) || 0) - (Number(left._chronologicalNumber) || 0) || text(right.id).localeCompare(text(left.id))).slice(0, 5);
    lists[0].innerHTML = recentVisits.length ? recentVisits.map(row => `<li><button type="button" class="ho-recent-row ho-visit-row" data-ho-visit="${escape(row.id)}">${dateTile(visitDate(row))}<span class="ho-row-copy"><strong>${escape(visitName(row))}</strong><small>${escape([row.contactName && row.contactName !== visitName(row) ? row.contactName : "", row.city].filter(Boolean).join(" · "))}</small></span><span class="ho-row-arrow" aria-hidden="true">→</span></button></li>`).join("") : '<li class="ho-empty">Keine vergangenen Hospitationen vorhanden.</li>';
    lists[1].innerHTML = recentObservations.length ? recentObservations.map(row => {
      const parent = visitMap.get(String(row.hospitationId || row.hospitation?.id)) || row.hospitation || {};
      const number = Number(row._chronologicalNumber) || text(row.displayId || row.sequence) || "?";
      return `<li><button type="button" class="ho-recent-row" data-ho-observation="${escape(row.id)}"><span class="ho-record-number">#${escape(number)}</span><span class="ho-row-copy"><strong>${escape(row.title || "Beobachtung ohne Titel")}</strong><small>${escape(visitName(parent))} · ${escape(dateLabel(visitDate(parent)))}</small></span><span class="ho-row-arrow" aria-hidden="true">→</span></button></li>`;
    }).join("") : '<li class="ho-empty">Keine Beobachtungen vorhanden.</li>';
    const described = observations.filter(row => !row.derivedFromSummary && text(row.description));
    const dashboardModule = window.HospitationDashboard;
    const visitSectors = new Map(visits.map(row => [String(row.id), dashboardModule?.sectorForVisit?.(row, described) ?? text(row.sector)]));
    const sectorCounts = new Map();
    described.forEach(row => {
      const visitSector = visitSectors.get(String(row.hospitationId || row.hospitation?.id));
      const setting = text(row.settingType);
      const sector = dashboardModule?.sectorForObservation?.(row, visitSector)
        ?? (setting === "Diabetes-Facharztpraxis" ? "Facharztpraxis" : setting || visitSector || "");
      sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1);
    });
    const sectors = [["Hausarztpraxis", "Hausarztpraxis", "primary"], ["Facharztpraxis", "Facharztpraxis", "specialist"], ["Apotheke", "Apotheke", "pharmacy"], ["", "Ohne Angabe", "unspecified"]];
    const known = new Set(sectors.map(([key]) => key));
    [...sectorCounts.keys()].filter(key => !known.has(key)).sort().forEach(key => sectors.push([key, key, "unspecified"]));
    const groups = sectors.map(([key, label, tone]) => ({ label, tone, count: sectorCounts.get(key) || 0 })).filter(group => group.count);
    let position = 0;
    const bars = groups.map(group => { const width = described.length ? group.count / described.length * 100 : 0; const mark = `<rect x="${position}" y="0" width="${width}" height="16" class="ho-sector-${group.tone}"></rect>`; position += width; return mark; }).join("");
    const label = groups.map(group => `${group.label}: ${group.count}`).join(", ") || "Keine beschriebenen Beobachtungen";
    dashboard.innerHTML = `<div class="ho-sector-preview"><h3>Beobachtungen nach Sektor</h3><svg class="ho-sector-bar" viewBox="0 0 100 16" preserveAspectRatio="none" role="img" aria-label="${escape(label)}">${bars}</svg><ul class="ho-sector-legend">${groups.map(group => `<li><i class="ho-sector-${group.tone}" aria-hidden="true"></i><span>${escape(group.label)}</span><strong>${group.count}</strong></li>`).join("")}</ul></div>`;
    dashboard.querySelector(".ho-sector-legend").style.setProperty("--ho-sector-columns", groups.map(group => `minmax(max-content, ${Math.max(group.count, 1)}fr)`).join(" "));
    return true;
  }

  window.HospitationOverview = Object.freeze({ mount, render, showTab, getTab: () => current?.tab || "overview" });
})();
