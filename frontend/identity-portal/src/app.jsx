import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup
} from "firebase/auth";
import * as ciap from "gcip-iap";
import "./styles.css";
import {
  assertProductionConfig,
  assertSafeFirebaseDefaults,
  getPortalConfig,
  isLocalPreview
} from "./config.js";
import {
  InlineNotice,
  PortalShell,
  ProgressOverlay
} from "./shell.jsx";

const root = createRoot(document.getElementById("root"));
const progressHost = document.body.appendChild(document.createElement("div"));
progressHost.id = "iap-progress-root";
const progressRoot = createRoot(progressHost);
const ALLOWED_PROVIDERS = new Set(["google.com", "password"]);

function getOrCreateFirebaseApp(firebaseConfig, name) {
  const existing = getApps().find((app) => app.name === name);
  return existing ?? initializeApp(firebaseConfig, name);
}

function normalizeSignInError(error) {
  if (error?.code === "auth/popup-closed-by-user") {
    return "Das Google-Fenster wurde geschlossen. Du kannst es erneut versuchen.";
  }
  if (error?.code === "auth/network-request-failed") {
    return "Die Anmeldung ist gerade nicht erreichbar. Prüfe bitte deine Verbindung.";
  }
  if (error?.code === "auth/too-many-requests") {
    return "Zu viele Versuche. Warte bitte kurz und versuche es später erneut.";
  }
  return "Die Anmeldedaten konnten nicht bestätigt werden.";
}

function SignInPanel({ auth, onCredential, preview = false }) {
  const [view, setView] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function emailSignIn(event) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setError("");
    try {
      onCredential(await signInWithEmailAndPassword(auth, email.trim(), password));
    } catch (signInError) {
      setError(normalizeSignInError(signInError));
      setBusy(false);
    }
  }

  async function googleSignIn() {
    if (preview) return;
    setBusy(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      onCredential(await signInWithPopup(auth, provider));
    } catch (signInError) {
      setError(normalizeSignInError(signInError));
      setBusy(false);
    }
  }

  if (view === "forgot") {
    return (
      <>
        <div className="card-heading">
          <span className="step-label">Hilfe beim Zugang</span>
          <h2>Passwort vergessen?</h2>
          <p>
            Antworte einfach auf deine persönliche Einladungsmail. Wir senden
            dir anschließend einen neuen, sicheren Link.
          </p>
        </div>
        <InlineNotice
          title="Dein Konto bleibt geschützt."
          action={
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setView("signin");
                setError("");
              }}
            >
              ← Zurück zur Anmeldung
            </button>
          }
        >
          Passwörter werden nicht per E-Mail versendet. Der neue Link ist nur
          einmal verwendbar und führt wieder auf versorgungs-kompass.de.
        </InlineNotice>
      </>
    );
  }

  return (
    <>
      <div className="card-heading">
        <span className="step-label">{preview ? "Vorschau" : "Persönlicher Zugang"}</span>
        <h2>Willkommen</h2>
        <p>Wähle den Anmeldeweg, der für dich freigeschaltet wurde.</p>
      </div>
      <button
        className="google-button"
        type="button"
        onClick={googleSignIn}
        disabled={busy}
      >
        <svg className="google-mark" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.205c0-.64-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.329-1.585-5.037-3.71H.956v2.332A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.963 10.71A5.42 5.42 0 0 1 3.68 9c0-.594.102-1.172.283-1.71V4.957H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.043l3.007-2.332Z" />
          <path fill="#EA4335" d="M9 3.58c1.322 0 2.508.455 3.442 1.346l2.58-2.58C13.464.892 11.43 0 9 0A9 9 0 0 0 .956 4.957L3.963 7.29C4.67 5.164 6.656 3.58 9 3.58Z" />
        </svg>
        Mit Google anmelden
      </button>
      <div className="choice-divider" aria-hidden="true">
        <span>oder mit E-Mail und Passwort</span>
      </div>
      <form className="auth-form" onSubmit={emailSignIn}>
        <label>
          <span>E-Mail-Adresse</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <div className="field-group">
          <span className="label-row">
            <label htmlFor="identity-password">Passwort</label>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setView("forgot");
                setError("");
              }}
            >
              Passwort vergessen?
            </button>
          </span>
          <div className="password-input">
            <input
              id="identity-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
              aria-pressed={showPassword}
            >
              {showPassword ? "Ausblenden" : "Anzeigen"}
            </button>
          </div>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? "Anmeldung läuft …" : "Sicher anmelden"}
        </button>
      </form>
      <p className="access-note">
        Noch kein Zugang? Konten werden persönlich eingeladen und nicht
        automatisch angelegt.
      </p>
    </>
  );
}

function renderSignIn(auth, config, onCredential, preview = false) {
  root.render(
    <PortalShell
      eyebrow="Sicher zusammenarbeiten"
      title="Zugang zum Versorgungs-Kompass"
      intro="Melde dich an, um im geschützten Arbeitsbereich Versorgungsangebote gemeinsam weiterzuentwickeln."
      config={config}
    >
      <SignInPanel
        auth={auth}
        onCredential={onCredential}
        preview={preview}
      />
    </PortalShell>
  );
}

function renderMessage(config, options) {
  root.render(
    <PortalShell
      eyebrow="Versorgungs-Kompass"
      title={options.shellTitle}
      intro={options.shellIntro}
      config={config}
      compact
    >
      <InlineNotice tone={options.tone} title={options.title} action={options.action}>
        {options.message}
      </InlineNotice>
    </PortalShell>
  );
}

class VersorgungsKompassAuthHandler {
  languageCode = "de";
  #config;
  #progressVisible = false;
  #auth = null;

  constructor(config) {
    this.#config = config;
  }

  getAuth(apiKey, tenantId) {
    if (tenantId !== null) {
      throw new Error("Mandantenfähige Anmeldung ist für diesen Zugang deaktiviert.");
    }
    if (apiKey !== this.#config.firebase.apiKey) {
      throw new Error("Die angefragte Identity-Platform-Konfiguration ist nicht zulässig.");
    }

    assertSafeFirebaseDefaults();
    const app = getOrCreateFirebaseApp(this.#config.firebase, "iap-project");
    const auth = getAuth(app);
    auth.tenantId = null;
    auth.languageCode = "de";
    this.#auth = auth;
    return auth;
  }

  startSignIn(auth) {
    return new Promise((resolve) => {
      renderSignIn(auth, this.#config, resolve);
    });
  }

  async processUser(user) {
    const providers = new Set(
      user.providerData.map((entry) => entry.providerId).filter(Boolean)
    );
    const providerIsAllowed =
      providers.size === 1 && [...providers].every((id) => ALLOWED_PROVIDERS.has(id));

    if (!providerIsAllowed || !user.emailVerified) {
      await signOut(this.#auth);
      throw new Error(
        "Dieses Konto erfüllt die Freigabeanforderungen für den Pilotzugang nicht."
      );
    }
    return user;
  }

  async completeSignOut() {
    renderMessage(this.#config, {
      shellTitle: "Sicher abgemeldet",
      shellIntro: "Deine Sitzung wurde vollständig beendet.",
      tone: "success",
      title: "Du bist abgemeldet.",
      message:
        "Schließe dieses Fenster, wenn du an einem gemeinsam genutzten Gerät arbeitest."
    });
  }

  showProgressBar() {
    this.#progressVisible = true;
    progressRoot.render(<ProgressOverlay visible />);
  }

  hideProgressBar() {
    this.#progressVisible = false;
    progressRoot.render(<ProgressOverlay visible={this.#progressVisible} />);
  }

  handleError(error) {
    const retry =
      typeof error?.retry === "function" ? (
        <button className="button button--secondary" type="button" onClick={() => error.retry()}>
          Erneut versuchen
        </button>
      ) : null;

    renderMessage(this.#config, {
      shellTitle: "Anmeldung nicht möglich",
      shellIntro: "Der geschützte Zugang konnte nicht hergestellt werden.",
      tone: "error",
      title: "Bitte versuche es erneut.",
      message:
        "Die Anmeldung ist abgelaufen oder konnte nicht sicher abgeschlossen werden.",
      action: retry
    });
  }
}

function startPreview(config) {
  renderSignIn(null, config, () => undefined, true);
}

function start() {
  const config = getPortalConfig();
  if (isLocalPreview(config, "signin")) {
    startPreview(config);
    return;
  }

  // A bare bookmark has no IAP state. Start at the protected application so
  // IAP can return here with its signed mode, state and redirect parameters.
  if (
    window.location.pathname === "/anmelden"
    && window.location.search === ""
    && window.location.hash === ""
  ) {
    window.location.replace("/start");
    return;
  }

  try {
    assertProductionConfig(config);
    assertSafeFirebaseDefaults();
    const handler = new VersorgungsKompassAuthHandler(config);
    new ciap.Authentication(handler).start();
  } catch {
    renderMessage(config, {
      shellTitle: "Anmeldung nicht verfügbar",
      shellIntro: "Die Anmeldeseite ist vorübergehend nicht erreichbar.",
      tone: "error",
      title: "Bitte versuche es später erneut.",
      message: "Wenn das Problem bleibt, antworte bitte auf deine Einladungsmail."
    });
  }
}

start();
