(function () {
  "use strict";

  let initialized = false;
  let navigate = null;
  let activeOverviewTab = "overview";
  let overview = null;

  function overviewTabFromRoute(value) {
    const explicit = typeof value === "string" ? value : "";
    if (["overview", "questionnaire", "framework", "science"].includes(explicit)) return explicit;
    if (explicit.includes("?")) {
      const tab = new URLSearchParams(explicit.slice(explicit.indexOf("?") + 1)).get("tab");
      if (["overview", "questionnaire", "framework", "science"].includes(tab)) return tab;
    }
    const hash = window.location.hash.slice(1);
    if (hash === "questionnaire") return "questionnaire";
    if (hash === "framework" || hash === "planning") return "framework";
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const tab = new URLSearchParams(hashQuery || window.location.search).get("tab");
    return ["overview", "questionnaire", "framework", "science"].includes(tab) ? tab : "overview";
  }

  function showOverviewTab(value, options = {}) {
    const selected = ["overview", "framework", "science", "questionnaire"].includes(value) ? value : "overview";
    activeOverviewTab = selected;
    window.HospitationOverview?.showTab(selected, options);
    return selected;
  }

  function activateOverviewTab(value, focus = false) {
    showOverviewTab(value, { focus });
    if (navigate) navigate(`hospitation-overview?tab=${value}`);
  }

  function createOverviewTabs() {
    overview = document.getElementById("view-hospitation-overview");
    if (!overview || overview.dataset.workspaceMounted === "true") return;
    window.HospitationOverview?.mount({
      root: overview,
      onNavigate: (route) => {
        showOverviewTab(overviewTabFromRoute(route));
        if (navigate) navigate(route);
      }
    });
    overview.dataset.workspaceMounted = "true";
    showOverviewTab(overviewTabFromRoute());
  }

  function syncSidebar(compassGroup) {
    const hasCompass = Boolean(compassGroup);
    if (hasCompass) document.body.dataset.workspaceCompass = compassGroup;
    else delete document.body.dataset.workspaceCompass;
    document.querySelectorAll("[data-sidebar-group]").forEach((section) => {
      const isCurrentCompass = section.dataset.sidebarGroup === compassGroup;
      section.classList.toggle("workspace-compass-hidden", hasCompass && !isCurrentCompass);
      section.classList.toggle("workspace-compass-focused", isCurrentCompass);
    });
    const home = document.querySelector('.sidebar-home-entry [data-view-tab="home"]');
    const label = home?.querySelector("span");
    if (label) label.textContent = hasCompass ? "Alle Kompasse" : "Startseite";
    if (home) {
      home.title = hasCompass ? "Zur #Mitmachen Startseite" : "Startseite";
      if (hasCompass) home.setAttribute("aria-label", "Alle Kompasse auf der #Mitmachen Startseite");
      else home.removeAttribute("aria-label");
    }
  }

  function init(options = {}) {
    if (typeof options.onNavigate === "function") navigate = options.onNavigate;
    if (initialized) return;
    createOverviewTabs();
    document.body.classList.add("hospitation-workspace-ready");
    initialized = true;
  }

  function sync(view, tab, compassGroup) {
    if (!initialized) return;
    syncSidebar(compassGroup);
    if (view === "hospitationOverview") showOverviewTab(overviewTabFromRoute(tab));
    else if (view === "questionnaire") showOverviewTab("questionnaire");
    else if (view === "framework") showOverviewTab("framework");
  }

  window.HospitationWorkspace = Object.freeze({
    init,
    sync,
    showOverviewTab,
    getOverviewTab: () => activeOverviewTab
  });
})();
