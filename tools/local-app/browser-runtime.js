(function () {
  "use strict";
  if (window.location.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)) {
    throw new Error("Diese App benötigt ihren lokalen App-Start.");
  }
  const uploadMessage = "Datei-Uploads sind in der lokalen App nicht verfügbar. Texte, Termine und Beobachtungen kannst du hier bearbeiten.";
  const uploadSelector = [
    'input[type="file"]', "#profile-photo-open", "#profile-photo-pick", "#onboarding-photo-button",
    "#imports-start-file", "#imports-start-stakeholder", "#import-start-file", "#import-pick-file", "#import-change-file",
    "#import-format-participants", "#import-csv-button", "[data-add-contact-note-attachment]"
  ].join(",");
  function localUrl(value) {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin || ["blob:", "data:"].includes(url.protocol);
  }
  const originalFetch = window.fetch.bind(window);
  let dataVersion = null;
  const versionReady = originalFetch("/__local/sync/status").then(response => response.ok ? response.json() : null).then(state => { dataVersion = state?.dataVersion || null; }).catch(() => {});
  window.fetch = async function (input, options) {
    const url = typeof input === "string" || input instanceof URL ? input : input.url;
    if (!localUrl(url)) return Promise.reject(new TypeError("Externe Verbindungen sind in der lokalen App deaktiviert."));
    await versionReady;
    const method = String(options?.method || input?.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && new URL(url, location.href).pathname.startsWith("/api/")) {
      const headers = new Headers(options?.headers || input?.headers || {});
      if (dataVersion) headers.set("X-Local-Data-Version", dataVersion);
      const response = await originalFetch(input, { ...options, headers });
      if (response.ok && response.headers.get("x-local-data-version")) dataVersion = response.headers.get("x-local-data-version");
      return response;
    }
    return originalFetch(input, options);
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...options) {
    if (!localUrl(url)) throw new TypeError("Externe Verbindungen sind in der lokalen App deaktiviert.");
    return originalOpen.call(this, method, url, ...options);
  };
  if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { return localUrl(url) ? originalBeacon(url, data) : false; };
  }
  function showUploadMessage() {
    const message = document.getElementById("local-app-message");
    if (message) message.textContent = uploadMessage;
  }
  function notice() {
    if (window.self !== window.top || document.getElementById("local-app-notice")) return;
    const main = document.querySelector(".app-main");
    if (!main) return;
    const bar = document.createElement("div");
    bar.id = "local-app-notice";
    bar.className = "local-app-notice";
    const title = document.createElement("strong");
    title.textContent = "Auf diesem Mac";
    const message = document.createElement("span");
    message.id = "local-app-message";
    message.className = "local-app-notice__message";
    message.textContent = "Der Abgleich wird geprüft …";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const link = document.createElement("a");
    link.href = "/frontend/local-app/sync.html"; link.textContent = "Abgleich öffnen";
    const reload = document.createElement("button");
    reload.type = "button"; reload.className = "action-button action-button--ghost";
    reload.textContent = "Ansicht neu laden"; reload.hidden = true;
    reload.addEventListener("click", () => location.reload());
    bar.append(title, message, link, reload);
    main.prepend(bar);
    async function refreshNotice() { await originalFetch("/__local/sync/status").then(response => response.ok ? response.json() : null).then(state => {
      if (!state) { message.textContent = "Änderungen bleiben auf diesem Mac."; return; }
      reload.hidden = !dataVersion || state.dataVersion === dataVersion;
      if (!reload.hidden) {
        message.textContent = "Ein neuer Datenstand ist verfügbar. Sichere offene Eingaben und lade die Ansicht neu."; return;
      }
      message.textContent = state.conflict ? "Eine Änderung wartet auf deine Entscheidung."
        : state.status === "reconnect" ? "Bitte bestätige die Verbindung in der Live-Anwendung erneut."
        : state.pending ? `${state.pending} lokale Änderungen warten auf den Abgleich.`
        : state.lastSync ? `Zuletzt abgeglichen: ${new Date(state.lastSync).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
        : "Noch nicht mit der Live-Anwendung verbunden.";
    }).catch(() => { message.textContent = "Dein lokaler Stand bleibt verfügbar."; }); }
    refreshNotice();
    originalFetch("/__local/sync/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(refreshNotice).catch(() => {});
    const refreshTimer = setInterval(() => { if (!document.hidden) refreshNotice(); }, 15_000);
    window.addEventListener("pagehide", () => clearInterval(refreshTimer), { once: true });
  }
  function disableUploads(root = document) {
    const controls = [...root.querySelectorAll(uploadSelector)];
    if (root.matches?.(uploadSelector)) controls.unshift(root);
    for (const control of controls) {
      if (!control.disabled) control.disabled = true;
      if (control.dataset.localUploadBlocked !== "true") {
        control.dataset.localUploadBlocked = "true";
        control.setAttribute("aria-disabled", "true");
        control.title = uploadMessage;
        const isVisibleFileInput = control.matches('input[type="file"]') && !control.hidden && !control.classList.contains("visually-hidden");
        const parent = isVisibleFileInput ? control.parentElement : null;
        if (parent && !parent.querySelector(":scope > .local-app-upload-note")) {
          const hint = document.createElement("span");
          hint.className = "local-app-upload-note";
          hint.textContent = "Datei-Uploads sind in der lokalen App deaktiviert.";
          parent.append(hint);
        }
      }
    }
  }
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(uploadSelector)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showUploadMessage();
  }, true);
  for (const name of ["dragover", "drop"]) {
    document.addEventListener(name, (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (name === "drop") showUploadMessage();
    }, true);
  }
  function initialize() {
    notice();
    disableUploads();
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes") {
          if (change.target.matches?.(uploadSelector) && !change.target.disabled) disableUploads(change.target);
        } else {
          for (const node of change.addedNodes) if (node.nodeType === 1) disableUploads(node);
        }
      }
      notice();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
