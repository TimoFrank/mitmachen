(function () {
  const runtime = window.VERSORGUNGS_COMPASS_CONFIG || {};
  const card = document.getElementById("enrollment-card");
  const title = document.getElementById("enrollment-title");
  const lead = document.getElementById("enrollment-lead");
  const statusPanel = document.getElementById("enrollment-status");
  const statusCopy = document.getElementById("enrollment-status-copy");
  const submitButton = document.getElementById("enrollment-submit");
  const fallbackCopy = document.getElementById("enrollment-fallback-copy");
  const autoResult = document.getElementById("auto-enrollment-result");
  const autoResultCopy = document.getElementById("auto-result-title");
  const result = document.getElementById("enrollment-result");
  const requestIdElement = document.getElementById("enrollment-request-id");
  const expiryElement = document.getElementById("enrollment-expiry");
  const copyButton = document.getElementById("enrollment-copy");
  const appLink = document.getElementById("open-application");
  const retryButton = document.getElementById("enrollment-retry");

  function apiUrl(pathname) {
    const base = String(runtime.apiBaseUrl || "").replace(/\/+$/, "");
    const url = new URL(`${base}${pathname}`, window.location.href);
    if (url.origin !== window.location.origin) {
      throw new Error("Der Testzugang darf nur über denselben geschützten Origin registriert werden.");
    }
    return url.href;
  }

  function setPage(view, heading, description) {
    if (card) card.dataset.view = view;
    if (title) title.textContent = heading;
    if (lead) lead.textContent = description;
  }

  function setStatus(state, message, visible = true) {
    if (statusPanel) {
      statusPanel.dataset.state = state;
      statusPanel.hidden = !visible;
    }
    if (statusCopy) statusCopy.textContent = message;
  }

  function hideActions() {
    if (fallbackCopy) fallbackCopy.hidden = true;
    if (submitButton) {
      submitButton.hidden = true;
      submitButton.disabled = true;
      submitButton.textContent = "Freigabe anfragen";
    }
    if (autoResult) autoResult.hidden = true;
    if (result) result.hidden = true;
    if (appLink) appLink.hidden = true;
    if (retryButton) retryButton.hidden = true;
  }

  function showChecking(heading = "Testzugang aktivieren", description = "Wir prüfen deine Einladung. Das dauert nur einen Moment.") {
    hideActions();
    setPage("checking", heading, description);
    setStatus("loading", "Einladung wird geprüft …");
  }

  function showError(description, { retry = true } = {}) {
    hideActions();
    setPage("error", "Aktivierung gerade nicht möglich", description);
    setStatus("error", "Bitte versuche es erneut.");
    if (retryButton) retryButton.hidden = !retry;
  }

  function friendlyExpiry(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return "";
    return `Gültig bis ${new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed)}`;
  }

  async function responsePayload(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function showActive({ alreadyActive = false } = {}) {
    hideActions();
    setPage(
      "success",
      alreadyActive ? "Willkommen zurück" : "Alles bereit",
      alreadyActive ? "Dein Zugang ist bereits aktiv." : "Dein Testzugang wurde aktiviert."
    );
    setStatus("active", "", false);
    if (autoResultCopy) autoResultCopy.textContent = "Du kannst den Versorgungs-Kompass jetzt öffnen.";
    if (autoResult) autoResult.hidden = false;
    if (appLink) appLink.hidden = false;
  }

  function showManualFallback() {
    hideActions();
    setPage(
      "fallback",
      "Freigabe anfragen",
      "Für dein Konto ist noch keine Einladung hinterlegt."
    );
    setStatus("ready", "", false);
    if (fallbackCopy) fallbackCopy.hidden = false;
    if (submitButton) {
      submitButton.hidden = false;
      submitButton.disabled = false;
    }
  }

  async function confirmActivatedSession() {
    const response = await fetch(apiUrl("/api/session"), {
      credentials: "include",
      headers: { accept: "application/json" }
    });
    return response.ok;
  }

  async function attemptAutoEnrollment() {
    showChecking();
    try {
      const response = await fetch(apiUrl("/api/auth/auto-enrollment"), {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" }
      });
      const payload = await responsePayload(response);
      if (response.status === 201 && payload.status === "active") {
        if (!await confirmActivatedSession()) {
          showError("Dein Zugang wurde angelegt. Bitte prüfe ihn noch einmal.");
          return;
        }
        showActive();
        return;
      }
      if (response.status === 404) {
        showManualFallback();
        return;
      }
      if (response.status === 409) {
        showError("Diese Einladung kann nicht erneut verwendet werden. Wende dich bitte an das Projektteam.", {
          retry: false
        });
        return;
      }
      showError("Versuche es bitte noch einmal. Wenn das Problem bleibt, wende dich an das Projektteam.");
    } catch {
      showError("Versuche es bitte noch einmal. Wenn das Problem bleibt, wende dich an das Projektteam.");
    }
  }

  async function checkSession() {
    showChecking();
    if (runtime.dataMode !== "api" || runtime.authMode !== "iap") {
      showError("Der Testzugang ist gerade nicht verfügbar. Bitte versuche es später erneut.", {
        retry: false
      });
      return;
    }

    try {
      const response = await fetch(apiUrl("/api/session"), {
        credentials: "include",
        headers: { accept: "application/json" }
      });
      if (response.ok) {
        showActive({ alreadyActive: true });
        return;
      }
      if (response.status !== 403) {
        showError("Deine Anmeldung konnte nicht bestätigt werden. Öffne bitte deinen Einladungslink erneut.");
        return;
      }
      await attemptAutoEnrollment();
    } catch {
      showError("Versuche es bitte noch einmal. Wenn das Problem bleibt, wende dich an das Projektteam.");
    }
  }

  function showRequestFailure(message, { retry = true } = {}) {
    setPage("fallback", "Freigabe anfragen", message);
    setStatus("error", "", false);
    if (fallbackCopy) fallbackCopy.hidden = true;
    if (submitButton) {
      submitButton.hidden = !retry;
      submitButton.disabled = !retry;
      submitButton.textContent = "Erneut versuchen";
    }
  }

  async function submitEnrollment() {
    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.textContent = "Anfrage wird gesendet …";
    setPage("checking", "Freigabe anfragen", "Wir senden deine Anfrage.");
    setStatus("loading", "Anfrage wird gesendet …");

    try {
      const response = await fetch(apiUrl("/api/auth/enrollment"), {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" }
      });
      const payload = await responsePayload(response);
      if (response.status !== 202 || typeof payload.requestId !== "string") {
        if (response.status === 409) {
          showRequestFailure("Für dieses Konto kann keine neue Anfrage erstellt werden. Wende dich bitte an das Projektteam.", {
            retry: false
          });
          return;
        }
        showRequestFailure("Die Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.");
        return;
      }

      hideActions();
      if (requestIdElement) requestIdElement.textContent = payload.requestId;
      if (expiryElement) expiryElement.textContent = friendlyExpiry(payload.expiresAt);
      setPage(
        "requested",
        "Anfrage gesendet",
        "Sende die Vorgangsnummer über den vereinbarten Kontaktweg an das Projektteam."
      );
      setStatus("active", "", false);
      if (result) result.hidden = false;
    } catch {
      showRequestFailure("Die Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.");
    }
  }

  async function copyRequestId() {
    const value = String(requestIdElement?.textContent || "").trim();
    if (!value || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      if (copyButton) copyButton.textContent = "Kopiert";
    } catch {
      if (copyButton) copyButton.textContent = "Nicht kopiert";
    }
  }

  if (appLink && window.VKAuth?.getDefaultUrl) {
    appLink.href = window.VKAuth.getDefaultUrl();
  }
  submitButton?.addEventListener("click", submitEnrollment);
  copyButton?.addEventListener("click", copyRequestId);
  retryButton?.addEventListener("click", checkSession);
  window.addEventListener("DOMContentLoaded", checkSession);
})();
