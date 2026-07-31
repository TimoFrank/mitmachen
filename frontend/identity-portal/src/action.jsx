import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import {
  confirmPasswordReset,
  getAuth,
  verifyPasswordResetCode
} from "firebase/auth";
import mitmachenLockupUrl from "../../../public/brand/mitmachen/lockup-horizontal-on-dark.svg";
import versorgungMarkUrl from "../../../public/brand/versorgungs-kompass/mark-on-dark.svg";
import stakeholderMarkUrl from "../../../public/brand/modules/stakeholder/mark-on-dark.svg";
import hospitationMarkUrl from "../../../public/brand/modules/hospitation/mark-on-dark.svg";
import formateMarkUrl from "../../../public/brand/modules/formate/mark-on-dark.svg";
import "./styles.css";
import {
  assertProductionConfig,
  assertSafeFirebaseDefaults,
  getPortalConfig,
  isLocalPreview
} from "./config.js";
import {
  isPasswordValid,
  parseActionUrl,
  validatePassword
} from "./action-url.js";
import { InlineNotice, PortalShell } from "./shell.jsx";

const root = createRoot(document.getElementById("root"));
const initialActionHref = window.location.href;
const COMPASS_BRANDS = Object.freeze([
  { label: "Versorgung", logoSrc: versorgungMarkUrl },
  { label: "Stakeholder", logoSrc: stakeholderMarkUrl },
  { label: "Hospitation", logoSrc: hospitationMarkUrl },
  { label: "Formate", logoSrc: formateMarkUrl }
]);

function getActionAuth(config) {
  assertSafeFirebaseDefaults();
  const name = "password-action-handler";
  const app =
    getApps().find((candidate) => candidate.name === name) ??
    initializeApp(config.firebase, name);
  const auth = getAuth(app);
  auth.languageCode = "de";
  return auth;
}

function PasswordRules({ password }) {
  const checks = validatePassword(password);
  const labels = {
    length: "14 bis 128 Zeichen",
    lowercase: "ein Kleinbuchstabe",
    uppercase: "ein Großbuchstabe",
    number: "eine Zahl",
    symbol: "ein Sonderzeichen"
  };

  return (
    <ul className="password-rules" aria-label="Passwortanforderungen">
      {Object.entries(checks).map(([key, fulfilled]) => (
        <li key={key} className={fulfilled ? "is-valid" : ""}>
          <span aria-hidden="true">{fulfilled ? "✓" : "○"}</span>
          {labels[key]}
        </li>
      ))}
    </ul>
  );
}

function ResetPasswordForm({ email, onSubmit, preview }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = password.length > 0 && password === confirmation;
  const valid = isPasswordValid(password) && matches;

  async function submit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(password);
    } catch {
      setError(
        "Das Passwort konnte nicht gespeichert werden. Der Link ist möglicherweise abgelaufen."
      );
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card-heading">
        <span className="step-label">{preview ? "Vorschau" : "Persönliche Einladung"}</span>
        <h2>Dein Passwort festlegen</h2>
        <p>
          Für <strong className="safe-email">{email}</strong>
        </p>
      </div>
      <form className="action-form" onSubmit={submit}>
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
          aria-hidden="true"
          tabIndex="-1"
        />
        <label>
          <span>Neues Passwort</span>
          <div className="password-input">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength="14"
              maxLength="128"
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
        </label>
        <PasswordRules password={password} />
        <label>
          <span>Passwort wiederholen</span>
          <div className="password-input">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength="14"
              maxLength="128"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={confirmation.length > 0 && !matches}
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
        </label>
        {confirmation.length > 0 && !matches ? (
          <p className="field-error" role="alert">Die Passwörter stimmen nicht überein.</p>
        ) : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="button button--primary" type="submit" disabled={!valid || busy}>
          {busy ? "Wird gespeichert …" : "Zugang einrichten"}
        </button>
      </form>
    </>
  );
}

function PasswordActionApp({
  config,
  preview = false,
  actionHref = initialActionHref
}) {
  const [state, setState] = useState({
    status: "loading",
    action: preview
      ? { mode: "resetPassword", oobCode: "", continueUrl: "/start" }
      : null,
    email: preview ? "pilotkonto@beispiel.de" : ""
  });
  const auth = useMemo(() => (preview ? null : getActionAuth(config)), [config, preview]);

  useEffect(() => {
    if (preview) {
      setState((current) => ({ ...current, status: "ready" }));
      return;
    }

    let active = true;
    (async () => {
      try {
        const action = parseActionUrl(actionHref, config);
        const email = await verifyPasswordResetCode(auth, action.oobCode);
        if (active) setState({ status: "ready", action, email });
      } catch {
        if (active) setState({ status: "error", action: null, email: "" });
      }
    })();

    return () => {
      active = false;
    };
  }, [actionHref, auth, config, preview]);

  async function resetPassword(password) {
    if (!preview) {
      await confirmPasswordReset(auth, state.action.oobCode, password);
    }
    setState((current) => ({ ...current, status: "success" }));
  }

  let content;
  if (state.status === "loading") {
    content = (
      <div className="loading-block" role="status">
        <span className="spinner" aria-hidden="true" />
        <p>Deine Einladung wird sicher geprüft …</p>
      </div>
    );
  } else if (state.status === "error") {
    content = (
      <InlineNotice
        tone="error"
        title="Dieser Einladungslink ist nicht mehr gültig."
        action={
          <a className="button button--secondary" href="/anmelden">
            Zur Anmeldung
          </a>
        }
      >
        Antworte bitte auf deine Einladungsmail, wenn du einen neuen Link brauchst.
      </InlineNotice>
    );
  } else if (state.status === "success") {
    content = (
      <InlineNotice
        tone="success"
        title="Alles bereit."
        action={
          <a
            className="button button--primary"
            href={state.action.continueUrl || "/start"}
            rel="noreferrer"
          >
            Jetzt anmelden
          </a>
        }
      >
        Dein Passwort wurde gespeichert. Du kannst dich jetzt sicher anmelden.
      </InlineNotice>
    );
  } else {
    content = (
      <ResetPasswordForm
        email={state.email}
        onSubmit={resetPassword}
        preview={preview}
      />
    );
  }

  return (
    <PortalShell
      eyebrow="Geschützter Zugang"
      title="Willkommen"
      intro="Deine Plattform für Austausch, Wissen und Vernetzung."
      config={config}
      compact
      variant="mitmachen"
      senderLogoSrc={mitmachenLockupUrl}
      compassBrands={COMPASS_BRANDS}
    >
      {content}
    </PortalShell>
  );
}

function start() {
  const config = getPortalConfig();
  if (isLocalPreview(config, "action")) {
    root.render(<PasswordActionApp config={config} preview />);
    return;
  }

  // Remove the one-time bearer code before any validation or remote request,
  // including every malformed-link and configuration error path.
  history.replaceState({}, "", window.location.pathname);

  try {
    assertProductionConfig(config);
    assertSafeFirebaseDefaults();
    root.render(<PasswordActionApp config={config} actionHref={initialActionHref} />);
  } catch {
    root.render(
      <PortalShell
        eyebrow="Geschützter Zugang"
        title="Einladung nicht verfügbar"
        intro="Der sichere Einladungslink konnte gerade nicht geöffnet werden."
        config={config}
        compact
        variant="mitmachen"
        senderLogoSrc={mitmachenLockupUrl}
        compassBrands={COMPASS_BRANDS}
      >
        <InlineNotice tone="error" title="Bitte versuche es später erneut.">
          Wenn das Problem bleibt, antworte bitte auf deine Einladungsmail.
        </InlineNotice>
      </PortalShell>
    );
  }
}

start();
