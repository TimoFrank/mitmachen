(function () {
  const config = window.VK_AUTH_CONFIG || {};
  const auth = window.VKAuth;

  if (!auth) return;

  function hex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return hex(digest);
  }

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnTarget = params.get("return");
    if (!returnTarget) return auth.getDefaultUrl();
    if (/^https?:\/\//i.test(returnTarget)) return auth.getDefaultUrl();
    return returnTarget;
  }

  if (auth.isAuthenticated()) {
    window.location.replace(getReturnUrl());
  }

  window.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("login-form");
    const input = document.getElementById("password");
    const error = document.getElementById("login-error");
    const button = document.getElementById("login-submit");
    const title = document.getElementById("login-app-name");
    const subtitle = document.getElementById("login-subtitle");

    if (title) title.textContent = config.appName || "Versorgungs-Kompass";
    if (subtitle) subtitle.textContent = "Das gematik-Hospitationsnetzwerk";
    if (!form || !input || !error || !button) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      error.hidden = true;
      button.disabled = true;
      button.textContent = "Prüfe Passwort …";

      try {
        const hash = await sha256(input.value);
        if (hash !== config.passwordHash) {
          error.hidden = false;
          input.focus();
          input.select();
          return;
        }

        auth.setAuthenticated();
        window.location.replace(getReturnUrl());
      } catch (submitError) {
        console.warn("Login konnte nicht geprüft werden.", submitError);
        error.textContent = "Der Login konnte im Browser nicht geprüft werden.";
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "Öffnen";
      }
    });
  });
})();
