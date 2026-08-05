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
import {
  finalizePasswordInvitation,
  isTemporaryPasswordActionError,
  parsePasswordInvitationUrl,
  redeemPasswordInvitation,
  TemporaryPasswordInvitationError
} from "./password-invitation.js";
import { InlineNotice, PortalShell } from "./shell.jsx";

const root = createRoot(document.getElementById("root"));
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

function ResetPasswordForm({ email, invitation = false, onSubmit, preview }) {
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
    } catch (submitError) {
      setError(isTemporaryPasswordActionError(submitError)
        ? "Es gibt gerade eine technische Störung. Bitte versuche es erneut."
        : "Das Passwort konnte nicht gespeichert werden. Der Link ist ungültig oder abgelaufen."
      );
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card-heading">
        <span className="step-label">
          {invitation ? "Persönliche Einladung" : preview ? "Vorschau" : "Sicherer Reset-Link"}
        </span>
        <h2>Neues Passwort festlegen</h2>
        {email ? (
          <p>
            Für <strong className="safe-email">{email}</strong>
          </p>
        ) : (
          <p>Für deinen persönlichen Zugang zum Versorgungs-Kompass.</p>
        )}
      </div>
      <form className="action-form" onSubmit={submit}>
        {email ? (
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
        ) : null}
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
          {busy ? "Wird gespeichert …" : "Passwort speichern"}
        </button>
      </form>
    </>
  );
}

function PasswordActionApp({
  config,
  invitationPreview = false,
  preview = false,
  takeActionHref = null
}) {
  const [state, setState] = useState({
    status: "loading",
    action: preview
      ? { mode: "resetPassword", oobCode: "", continueUrl: "/start" }
      : null,
    email: preview && !invitationPreview ? "pilotkonto@beispiel.de" : "",
    invitationToken: invitationPreview ? "preview" : null
  });
  const auth = useMemo(() => (preview ? null : getActionAuth(config)), [config, preview]);

  useEffect(() => {
    if (preview) {
      setState((current) => ({ ...current, status: "ready" }));
      return;
    }

    let active = true;
    (async () => {
      let parsedAction = null;
      try {
        const actionHref = takeActionHref?.();
        if (typeof actionHref !== "string" || actionHref.length === 0) {
          throw new Error("Die Passwortaktion fehlt.");
        }
        if (new URL(actionHref).hash) {
          const invitation = parsePasswordInvitationUrl(actionHref);
          if (active) {
            setState({
              status: "ready",
              action: null,
              email: "",
              invitationToken: invitation.token
            });
          }
          return;
        }
        parsedAction = parseActionUrl(actionHref, config);
        const email = await verifyPasswordResetCode(auth, parsedAction.oobCode);
        if (active) {
          setState({ status: "ready", action: parsedAction, email, invitationToken: null });
        }
      } catch (error) {
        if (active) {
          const temporary = Boolean(parsedAction) && isTemporaryPasswordActionError(error);
          setState({
            status: temporary ? "temporary-error" : "error",
            action: temporary ? parsedAction : null,
            email: "",
            invitationToken: null
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [auth, config, preview, takeActionHref]);

  async function retryInitialVerification() {
    const action = state.status === "temporary-error" ? state.action : null;
    if (!action) return;
    setState((current) => ({ ...current, status: "loading" }));
    try {
      const email = await verifyPasswordResetCode(auth, action.oobCode);
      setState({ status: "ready", action, email, invitationToken: null });
    } catch (error) {
      const temporary = isTemporaryPasswordActionError(error);
      setState({
        status: temporary ? "temporary-error" : "error",
        action: temporary ? action : null,
        email: "",
        invitationToken: null
      });
    }
  }

  async function resetPassword(password) {
    if (!preview) {
      let action = state.action;
      const invitationToken = state.invitationToken;
      if (!action && invitationToken) {
        const redeemed = await redeemPasswordInvitation(invitationToken);
        if (redeemed.completed) {
          setState((current) => ({
            ...current,
            status: "completed",
            action: null,
            email: "",
            invitationToken: null
          }));
          return;
        }
        try {
          action = parseActionUrl(redeemed.actionUrl, config);
        } catch {
          throw new TemporaryPasswordInvitationError();
        }
        setState((current) => ({
          ...current,
          action
        }));
        const email = await verifyPasswordResetCode(auth, action.oobCode);
        setState((current) => ({ ...current, email }));
      }
      if (!action) throw new Error("Die Passwortaktion fehlt.");
      try {
        await confirmPasswordReset(auth, action.oobCode, password);
      } catch (confirmError) {
        if (invitationToken) {
          try {
            const result = await finalizePasswordInvitation(invitationToken);
            if (result.finalized) {
              setState((current) => ({
                ...current,
                status: "completed",
                action: null,
                email: "",
                invitationToken: null
              }));
              return;
            }
          } catch {
            // Preserve the original confirmation failure when finalization is inconclusive.
          }
        }
        throw confirmError;
      }
      if (invitationToken) {
        try {
          await finalizePasswordInvitation(invitationToken);
        } catch {
          // The password is already set. A later retry can reconcile the issued invitation.
        }
      }
    }
    setState((current) => ({
      ...current,
      status: "success",
      action: null,
      email: "",
      invitationToken: null
    }));
  }

  let content;
  if (state.status === "loading") {
    content = (
      <div className="loading-block" role="status">
        <span className="spinner" aria-hidden="true" />
        <p>Dein sicherer Link wird geprüft …</p>
      </div>
    );
  } else if (state.status === "error") {
    content = (
      <InlineNotice
        tone="error"
        title="Dieser Link ist nicht mehr gültig."
        action={
          <a className="button button--secondary" href="/anmelden">
            Zur Anmeldung
          </a>
        }
      >
        Fordere über die Anmeldung einen neuen Link an.
      </InlineNotice>
    );
  } else if (state.status === "temporary-error") {
    content = (
      <InlineNotice
        tone="error"
        title="Der Link konnte gerade nicht geprüft werden."
        action={
          <button
            className="button button--secondary"
            type="button"
            onClick={retryInitialVerification}
          >
            Erneut versuchen
          </button>
        }
      >
        Es gibt gerade eine technische Störung. Der Link wurde nicht als
        ungültig bewertet.
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
            href={state.action?.continueUrl || "/start"}
            rel="noreferrer"
          >
            Jetzt anmelden
          </a>
        }
      >
        Dein Passwort wurde gespeichert. Du kannst dich jetzt sicher anmelden.
      </InlineNotice>
    );
  } else if (state.status === "completed") {
    content = (
      <InlineNotice
        tone="success"
        title="Das Passwort wurde bereits geändert."
        action={
          <a className="button button--primary" href="/start">
            Zur Anmeldung
          </a>
        }
      >
        Der Einladungslink ist abgeschlossen. Melde dich mit deinem aktuellen
        Passwort an. Falls das nicht klappt, fordere über die Anmeldung einen
        neuen Link an.
      </InlineNotice>
    );
  } else {
    content = (
      <ResetPasswordForm
        email={state.email}
        invitation={Boolean(state.invitationToken)}
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
  if (isLocalPreview(config, "invitation")) {
    root.render(<PasswordActionApp config={config} preview invitationPreview />);
    return;
  }

  let pendingActionHref = window.location.href;

  // Remove the one-time bearer code before any validation or remote request,
  // including every malformed-link and configuration error path.
  history.replaceState({}, "", window.location.pathname);

  const takeActionHref = () => {
    const actionHref = pendingActionHref;
    pendingActionHref = "";
    return actionHref;
  };

  try {
    assertProductionConfig(config);
    assertSafeFirebaseDefaults();
    root.render(<PasswordActionApp config={config} takeActionHref={takeActionHref} />);
  } catch {
    root.render(
      <PortalShell
        eyebrow="Geschützter Zugang"
        title="Reset-Link nicht verfügbar"
        intro="Der sichere Reset-Link konnte gerade nicht geöffnet werden."
        config={config}
        compact
        variant="mitmachen"
        senderLogoSrc={mitmachenLockupUrl}
        compassBrands={COMPASS_BRANDS}
      >
        <InlineNotice tone="error" title="Bitte versuche es später erneut.">
          Wenn das Problem bleibt, fordere über die Anmeldung einen neuen Link an.
        </InlineNotice>
      </PortalShell>
    );
  }
}

start();
