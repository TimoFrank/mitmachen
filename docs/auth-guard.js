(function () {
  const config = window.VK_AUTH_CONFIG || {};

  function currentFileName() {
    const parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || config.defaultFile || "versorgungs-kompass.html";
  }

  function getStoredSession() {
    try {
      const raw = window.localStorage.getItem(config.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.authenticated !== true) return null;
      if (!parsed.expiresAt || Date.now() > parsed.expiresAt) return null;
      return parsed;
    } catch (error) {
      console.warn("Konnte Login-Status nicht lesen.", error);
      return null;
    }
  }

  function setStoredSession() {
    const days = Number(config.sessionDays || 30);
    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    const payload = { authenticated: true, expiresAt };
    window.localStorage.setItem(config.storageKey, JSON.stringify(payload));
    return payload;
  }

  function clearStoredSession() {
    try {
      window.localStorage.removeItem(config.storageKey);
    } catch (error) {
      console.warn("Konnte Login-Status nicht entfernen.", error);
    }
  }

  function buildLoginUrl() {
    const loginFile = config.loginFile || "login.html";
    const currentTarget = currentFileName() + window.location.search + window.location.hash;
    const params = new URLSearchParams();
    params.set("return", currentTarget);
    return "./" + loginFile + "?" + params.toString();
  }

  window.VKAuth = {
    config,
    getStoredSession,
    isAuthenticated: function () {
      return Boolean(getStoredSession());
    },
    setAuthenticated: setStoredSession,
    clearAuthenticated: clearStoredSession,
    buildLoginUrl,
    getDefaultUrl: function () {
      return "./" + (config.defaultFile || "versorgungs-kompass.html");
    }
  };

  if (currentFileName() === (config.loginFile || "login.html")) {
    return;
  }

  if (!window.VKAuth.isAuthenticated()) {
    window.location.replace(buildLoginUrl());
  }
})();
