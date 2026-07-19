(function () {
  const config = window.VK_AUTH_CONFIG || {};

  function runtimeConfig() {
    return window.VERSORGUNGS_COMPASS_CONFIG || {};
  }

  function currentFileName() {
    const parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || config.defaultFile || "versorgungs-kompass.html";
  }

  function currentPathFromLogin() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const fileName = parts.pop() || config.defaultFile || "versorgungs-kompass.html";
    const folderName = parts.pop();
    const relativePath = folderName ? `../${folderName}/${fileName}` : `../${fileName}`;
    return relativePath + window.location.search + window.location.hash;
  }

  function usesExternalIdentityProvider() {
    const runtime = runtimeConfig();
    return ["iap", "oidc"].includes(runtime.authMode) && runtime.dataMode === "api";
  }

  function iapBootstrapStorageKey() {
    const apiBaseUrl = String(runtimeConfig().apiBaseUrl || "").replace(/\/+$/, "");
    return apiBaseUrl ? `vk-iap-bootstrap:${apiBaseUrl}` : "";
  }

  function clearAuthenticated() {
    try {
      window.localStorage.removeItem(config.storageKey);
    } catch (error) {
      console.warn("Konnte veralteten lokalen Login-Marker nicht entfernen.", error);
    }
    const storageKey = iapBootstrapStorageKey();
    if (!storageKey) return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Konnte IAP-Bootstrap-Status nicht entfernen.", error);
    }
  }

  function buildLoginUrl() {
    const loginPath = config.loginPath || "./" + (config.loginFile || "login.html");
    const params = new URLSearchParams();
    params.set("return", currentPathFromLogin());
    return loginPath + "?" + params.toString();
  }

  function buildLogoutUrl() {
    const runtime = runtimeConfig();
    if (runtime.authMode !== "iap") return buildLoginUrl() + "#signed-out";
    const loginPath = config.loginPath || "./" + (config.loginFile || "login.html");
    const logoutUrl = new URL(loginPath, window.location.href);
    logoutUrl.search = "";
    logoutUrl.hash = "signed-out";
    logoutUrl.searchParams.set("gcp-iap-mode", "CLEAR_LOGIN_COOKIE");
    return logoutUrl.href;
  }

  function isExplicitSignOutPage() {
    return currentFileName() === (config.loginFile || "login.html") && window.location.hash === "#signed-out";
  }

  function bootstrapIapSession() {
    const runtime = runtimeConfig();
    if (runtime.authMode !== "iap" || runtime.dataMode !== "api") return false;
    const apiBaseUrl = String(runtime.apiBaseUrl || "").replace(/\/+$/, "");
    if (!/^https:\/\//i.test(apiBaseUrl)) return false;

    const markerName = "iap_authenticated";
    const storageKey = iapBootstrapStorageKey();
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(markerName) === "1") {
      try {
        window.sessionStorage.setItem(storageKey, "1");
      } catch {
        // Der aktuelle Seitenaufruf ist bereits authentifiziert; Storage ist nur eine Optimierung.
      }
      currentUrl.searchParams.delete(markerName);
      window.history.replaceState({}, "", currentUrl.href);
      return false;
    }

    try {
      if (window.sessionStorage.getItem(storageKey) === "1") return false;
    } catch {
      // Ohne Session Storage wird der Bootstrap bei einer späteren Navigation erneut ausgeführt.
    }

    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set(markerName, "1");
    const bootstrapUrl = new URL(`${apiBaseUrl}/api/auth/bootstrap`);
    bootstrapUrl.searchParams.set("return", returnUrl.href);
    window.location.replace(bootstrapUrl.href);
    return true;
  }

  window.VKAuth = {
    config,
    isAuthenticated: usesExternalIdentityProvider,
    setAuthenticated: function () {},
    clearAuthenticated,
    buildLoginUrl,
    buildLogoutUrl,
    getDefaultUrl: function () {
      return config.defaultPath || "./" + (config.defaultFile || "versorgungs-kompass.html");
    }
  };

  if (isExplicitSignOutPage()) return;
  if (bootstrapIapSession()) return;
  if (currentFileName() === (config.loginFile || "login.html")) return;

  if (!usesExternalIdentityProvider()) {
    window.location.replace(buildLoginUrl());
  }
})();
