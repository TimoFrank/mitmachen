(function () {
  const auth = window.VKAuth;
  const runtimeConfig = window.VERSORGUNGS_COMPASS_CONFIG || {};

  if (!auth) return;

  function isAllowedAppReturnPath(pathname) {
    return /\/(?:app\/versorgungs-kompass\.html|app\/hospitation\/index\.html|map\/versorgungs-kompass-map\.html|versorgungs-kompass\.html|hospitation\/index\.html|versorgungs-kompass-map\.html)$/.test(String(pathname || ""));
  }

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnTarget = params.get("return");
    if (!returnTarget) return auth.getDefaultUrl();
    try {
      const candidate = new URL(returnTarget, window.location.href);
      if (candidate.origin !== window.location.origin || !isAllowedAppReturnPath(candidate.pathname)) {
        return auth.getDefaultUrl();
      }
      return candidate.href;
    } catch {
      return auth.getDefaultUrl();
    }
  }

  function isExplicitSignOutReturn() {
    return window.location.hash === "#signed-out";
  }

  function usesExternalIdentityProvider() {
    return ["iap", "oidc"].includes(runtimeConfig.authMode) && runtimeConfig.dataMode === "api";
  }

  window.addEventListener("DOMContentLoaded", function () {
    const copy = document.getElementById("login-copy");
    const externalLoginButton = document.getElementById("external-login-submit");

    if (!usesExternalIdentityProvider()) {
      if (copy) copy.textContent = "Die Anwendung ist fail-closed: Ohne konfigurierte OIDC- oder IAP-Anmeldung ist kein Zugriff möglich.";
      return;
    }

    if (isExplicitSignOutReturn()) {
      if (copy) copy.textContent = "Du bist aus dem Versorgungs-Kompass abgemeldet. Das Konto des Identity Providers bleibt gegebenenfalls im Browser angemeldet.";
      if (externalLoginButton) {
        externalLoginButton.hidden = false;
        externalLoginButton.addEventListener("click", function () {
          window.location.replace(getReturnUrl());
        });
      }
      return;
    }

    if (copy) copy.textContent = "Die Anmeldung erfolgt über den organisationsweiten SSO-Zugang.";
    window.location.replace(getReturnUrl());
  });
})();
