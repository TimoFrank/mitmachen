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
    if (!window.dataService?.isConfigured?.()) window.location.replace(getReturnUrl());
  }

  window.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("login-form");
    const emailField = document.getElementById("email-field");
    const emailInput = document.getElementById("email");
    const input = document.getElementById("password");
    const passwordLabel = document.getElementById("password-label");
    const error = document.getElementById("login-error");
    const button = document.getElementById("login-submit");
    const title = document.getElementById("login-app-name");
    const subtitle = document.getElementById("login-subtitle");
    const copy = document.getElementById("login-copy");
    const useSupabase = Boolean(window.dataService?.isConfigured?.());
    const loginFailureMessage = "Die Anmeldung war nicht erfolgreich. Bitte prüfe Kürzel/E-Mail und Passwort.";

    if (title) title.textContent = config.appName || "Versorgungs-Kompass";
    if (subtitle) subtitle.textContent = "Das gematik-Hospitationsnetzwerk";
    if (!form || !input || !error || !button) return;

    if (useSupabase) {
      emailField.hidden = false;
      emailInput.required = true;
      if (copy) copy.textContent = "Melde dich mit deinem Supabase-Konto an, um den gemeinsamen Datenstand zu öffnen.";
      if (passwordLabel) passwordLabel.textContent = "Supabase-Passwort";
      button.textContent = "Anmelden";
      window.dataService
        .getClient()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) {
            auth.setAuthenticated();
            window.location.replace(getReturnUrl());
          }
        });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      error.hidden = true;
      button.disabled = true;
      button.textContent = useSupabase ? "Melde an …" : "Prüfe Passwort …";

      try {
        if (useSupabase) {
          const supabaseClient = window.dataService.getClient();
          const { data, error: loginError } = await supabaseClient.functions.invoke("login-with-alias", {
            body: {
              identifier: emailInput.value.trim(),
              password: input.value
            }
          });
          if (loginError || data?.error || !data?.session?.access_token || !data?.session?.refresh_token) {
            error.textContent = loginFailureMessage;
            error.hidden = false;
            input.focus();
            return;
          }
          const { error: sessionError } = await supabaseClient.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token
          });
          if (sessionError) {
            error.textContent = loginFailureMessage;
            error.hidden = false;
            input.focus();
            return;
          }
          auth.setAuthenticated();
          window.location.replace(getReturnUrl());
          return;
        }

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
        button.textContent = useSupabase ? "Anmelden" : "Öffnen";
      }
    });
  });
})();
