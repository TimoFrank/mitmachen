(function () {
  const runtime = window.VERSORGUNGS_COMPASS_CONFIG || {};
  const scriptUrl = new URL(
    document.currentScript?.src || "./versorgungs-kompass-routes.js",
    window.location.href
  );
  const appBaseUrl = new URL("./", scriptUrl);

  const staticRouteEntries = [
    ["home", "start"],
    ["map", "versorgung/karte"],
    ["contacts", "versorgung/kontakte"],
    ["organizations", "versorgung/organisationen"],
    ["analytics", "versorgung/auswertung"],
    ["quality", "versorgung/datenqualitaet"],
    ["activities", "versorgung/aktivitaeten"],
    ["patients", "stakeholder/patienten"],
    ["politics", "stakeholder/politik"],
    ["stakeholders", "stakeholder"],
    ["stakeholders/kv", "stakeholder/kassenaerztliche-vereinigungen"],
    ["stakeholders/krankenkassen", "stakeholder/krankenkassen"],
    ["stakeholders/patientenverbaende", "stakeholder/patientenverbaende"],
    ["stakeholders/krankenhausgesellschaften", "stakeholder/krankenhausgesellschaften"],
    ["stakeholders/aerztliche-berufsverbaende", "stakeholder/aerztliche-berufsverbaende"],
    ["experts", "stakeholder/expertenkreis"],
    ["framework", "hospitationen/framework"],
    ["hospitations", "hospitationen"],
    ["hospitations:observations", "hospitationen/beobachtungen"],
    ["hospitations:patterns", "hospitationen/muster"],
    ["hospitations:dashboard", "hospitationen/dashboard"],
    ["questionnaire", "hospitationen/fragebogen"],
    ["formats", "formate"],
    ["team", "teams"],
    ["profile", "profil"],
    ["profile-notifications", "profil/benachrichtigungen"],
    ["notifications", "profil/benachrichtigungen"],
    ["profile-settings", "profil/einstellungen"],
    ["settings", "profil/einstellungen"],
    ["profile-changelog", "profil/aenderungen"],
    ["changelog", "profil/aenderungen"],
    ["profile-about", "profil/ueber-die-app"],
    ["about", "profil/ueber-die-app"],
    ["onboarding", "onboarding"]
  ];
  const routePathByToken = new Map(staticRouteEntries);
  const routeTokenByPath = new Map();
  staticRouteEntries.forEach(([token, path]) => {
    if (!routeTokenByPath.has(path)) routeTokenByPath.set(path, token);
  });

  const importPathByTab = new Map([
    ["registrations", "profil/importe/registrierungen"],
    ["imports", "profil/importe/dateiimport"],
    ["onlineEntry", "profil/importe/online-erfassung"],
    ["importHistory", "profil/importe/historie"]
  ]);
  const importTabByPath = new Map([...importPathByTab].map(([tab, path]) => [path, tab]));
  const personPathKind = new Map([
    ["contact", "versorgung"],
    ["expert", "expertenkreis"],
    ["stakeholder", "stakeholder"],
    ["patient", "patienten"],
    ["politics", "politik"]
  ]);
  const personTokenKind = new Map([...personPathKind].map(([token, path]) => [path, token]));
  const organizationPathKind = new Map([
    ["care", "versorgung"],
    ["expert", "expertenkreis"],
    ["patient", "patienten"],
    ["stakeholder", "stakeholder"]
  ]);
  const organizationTokenKind = new Map([...organizationPathKind].map(([token, path]) => [path, token]));

  function cleanUrlsEnabled() {
    const standalone = new URLSearchParams(window.location.search).get("standalone") === "hospitation-documentation";
    return runtime.cleanUrls === true && !standalone;
  }

  function normalizeRoutePath(pathname = "") {
    let decoded = String(pathname || "");
    try {
      decoded = decodeURI(decoded);
    } catch {
      return "";
    }
    return decoded.replace(/^\/+|\/+$/g, "");
  }

  function splitRouteToken(routeToken = "") {
    const normalized = String(routeToken || "").replace(/^#/, "");
    const queryIndex = normalized.indexOf("?");
    return {
      token: queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized,
      query: queryIndex >= 0 ? normalized.slice(queryIndex + 1) : ""
    };
  }

  function pathForRouteToken(routeToken = "home") {
    const { token, query } = splitRouteToken(routeToken);
    if (routePathByToken.has(token)) {
      return { path: routePathByToken.get(token), query };
    }

    const importMatch = /^profile-imports(?::(registrations|imports|onlineEntry|importHistory))?$/.exec(token);
    if (importMatch) {
      return {
        path: importPathByTab.get(importMatch[1] || "registrations"),
        query
      };
    }

    const personMatch = /^person\/(contact|expert|stakeholder|patient|politics)\/([^/]+)$/.exec(token);
    if (personMatch) {
      return {
        path: `personen/${personPathKind.get(personMatch[1])}/${personMatch[2]}`,
        query
      };
    }

    const organizationMatch = /^organization\/(care|expert|patient|stakeholder)\/([^/]+)$/.exec(token);
    if (organizationMatch) {
      return {
        path: `organisationen/${organizationPathKind.get(organizationMatch[1])}/${organizationMatch[2]}`,
        query
      };
    }

    return { path: routePathByToken.get("home"), query: "" };
  }

  function relativeAppPath(pathname = window.location.pathname) {
    const absolute = new URL(pathname, window.location.origin);
    const basePath = appBaseUrl.pathname.endsWith("/") ? appBaseUrl.pathname : `${appBaseUrl.pathname}/`;
    if (!absolute.pathname.startsWith(basePath)) return "";
    return normalizeRoutePath(absolute.pathname.slice(basePath.length));
  }

  function routeTokenForPath(pathname = window.location.pathname, search = window.location.search) {
    const relativePath = relativeAppPath(pathname);
    if (!relativePath || relativePath === "versorgungs-kompass.html") return "";

    const staticToken = routeTokenByPath.get(relativePath);
    if (staticToken) return staticToken;

    const importTab = importTabByPath.get(relativePath);
    if (importTab) return `profile-imports:${importTab}`;

    const personMatch = /^personen\/(versorgung|expertenkreis|stakeholder|patienten|politik)\/([^/]+)$/.exec(relativePath);
    if (personMatch) {
      const query = new URLSearchParams(search);
      query.delete("iap_authenticated");
      query.delete("standalone");
      const queryString = query.toString();
      return `person/${personTokenKind.get(personMatch[1])}/${personMatch[2]}${queryString ? `?${queryString}` : ""}`;
    }

    const organizationMatch = /^organisationen\/(versorgung|expertenkreis|patienten|stakeholder)\/([^/]+)$/.exec(relativePath);
    if (organizationMatch) {
      return `organization/${organizationTokenKind.get(organizationMatch[1])}/${organizationMatch[2]}`;
    }

    return "";
  }

  function persistentSearchParams(search = window.location.search) {
    const source = new URLSearchParams(search);
    const result = new URLSearchParams();
    if (source.get("standalone") === "hospitation-documentation") {
      result.set("standalone", "hospitation-documentation");
    }
    return result;
  }

  function urlForRouteToken(routeToken = "home", options = {}) {
    if (!cleanUrlsEnabled()) {
      return `#${String(routeToken || "home").replace(/^#/, "")}`;
    }

    const { path, query } = pathForRouteToken(routeToken);
    const target = new URL(path, appBaseUrl);
    const searchParams = persistentSearchParams(options.search);
    const routeSearch = new URLSearchParams(query);
    routeSearch.forEach((value, key) => searchParams.set(key, value));
    target.search = searchParams.toString();
    target.hash = "";
    return `${target.pathname}${target.search}`;
  }

  function assetUrl(assetPath = "") {
    const normalized = String(assetPath || "").replace(/^\/+/, "");
    const target = new URL(normalized, appBaseUrl);
    return `${target.pathname}${target.search}${target.hash}`;
  }

  function isApplicationPath(pathname = "") {
    const relativePath = relativeAppPath(pathname);
    if (relativePath === "versorgungs-kompass.html") return true;
    if (routeTokenByPath.has(relativePath) || importTabByPath.has(relativePath)) return true;
    if (/^personen\/(?:versorgung|expertenkreis|stakeholder|patienten|politik)\/[^/]+$/.test(relativePath)) return true;
    return /^organisationen\/(?:versorgung|expertenkreis|patienten|stakeholder)\/[^/]+$/.test(relativePath);
  }

  window.VKAppRoutes = Object.freeze({
    appBaseUrl: appBaseUrl.href,
    assetUrl,
    cleanUrlsEnabled,
    isApplicationPath,
    pathForRouteToken,
    routeTokenForPath,
    routes: Object.freeze(Object.fromEntries(staticRouteEntries)),
    urlForRouteToken
  });
})();
