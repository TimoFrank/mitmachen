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

  function getHashParams() {
    return new URLSearchParams(window.location.hash.replace(/^#/, ""));
  }

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnTarget = params.get("return");
    if (!returnTarget) return auth.getDefaultUrl();
    if (/^https?:\/\//i.test(returnTarget) || returnTarget.startsWith("//")) return auth.getDefaultUrl();
    return returnTarget;
  }

  function getPasswordSetupType() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = getHashParams();
    return params.get("type") || hashParams.get("type") || "";
  }

  function hasPasswordSetupToken() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = getHashParams();
    const type = getPasswordSetupType();
    return (
      params.has("code") ||
      params.has("token_hash") ||
      params.has("token") ||
      hashParams.has("access_token") ||
      type === "invite" ||
      type === "recovery"
    );
  }

  if (hasPasswordSetupToken()) {
    window.location.replace(new URL("set-password.html" + window.location.search + window.location.hash, window.location.href).toString());
    return;
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
      if (copy) copy.textContent = "Willkommen zurück. Melde dich an und arbeite direkt im Versorgungs-Kompass weiter.";
      if (passwordLabel) passwordLabel.textContent = "Passwort";
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
          const identifier = emailInput.value.trim();
          const isEmailLogin = identifier.includes("@");
          const { data, error: loginError } = isEmailLogin
            ? await supabaseClient.auth.signInWithPassword({
                email: identifier,
                password: input.value
              })
            : await supabaseClient.functions.invoke("login-with-alias", {
                body: {
                  identifier,
                  password: input.value
                }
              });
          if (loginError || data?.error || !data?.session?.access_token || !data?.session?.refresh_token) {
            error.textContent = loginFailureMessage;
            error.hidden = false;
            input.focus();
            return;
          }
          if (!isEmailLogin) {
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
