import React from "react";

export function PortalShell({
  eyebrow,
  title,
  intro,
  children,
  config,
  compact = false,
  variant = "product",
  senderLogoSrc = "",
  compassBrands = []
}) {
  const isMitmachen = variant === "mitmachen";

  return (
    <main
      className={`shell${compact ? " shell--compact" : ""}${
        isMitmachen ? " shell--mitmachen" : ""
      }`}
    >
      <section className="brand-panel" aria-labelledby="portal-title">
        {isMitmachen ? (
          <div className="sender-lockup">
            <img
              className="sender-logo"
              src={senderLogoSrc}
              alt="#Mitmachen"
              width="480"
              height="112"
            />
          </div>
        ) : (
          <a className="brand-link" href="/" aria-label="Versorgungs-Kompass Startseite">
            <img
              className="brand-logo"
              src="/public/auth/brand/versorgungs-kompass.svg"
              alt="Versorgungs-Kompass"
              width="920"
              height="112"
            />
          </a>
        )}
        <div className="brand-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1 id="portal-title">{title}</h1>
          <p>{intro}</p>
        </div>
        {isMitmachen ? (
          <ul className="compass-brands" aria-label="Kompass-Marken">
            {compassBrands.map((brand) => (
              <li className="compass-brand" key={brand.label}>
                <img
                  src={brand.logoSrc}
                  alt=""
                  aria-hidden="true"
                  width="64"
                  height="64"
                />
                <span>{brand.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="trust-list" aria-label="Hinweise zum Zugang">
          <li>
            <span className="trust-icon" aria-hidden="true">✓</span>
            Nur persönlich freigegebene Konten
          </li>
          <li>
            <span className="trust-icon" aria-hidden="true">✓</span>
            Geschützte und verschlüsselte Anmeldung
          </li>
          <li>
            <span className="trust-icon" aria-hidden="true">✓</span>
            Kein zusätzliches Google-Konto erforderlich
          </li>
        </ul>
      </section>

      <section className="content-panel">
        <div className="content-card">{children}</div>
        <footer className="portal-footer">
          {isMitmachen ? (
            <span className="portal-footer__sender">#Mitmachen</span>
          ) : null}
          <a
            href={config?.privacyPolicyUrl || "https://www.gematik.de/datenschutz"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutz
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={config?.legalNoticeUrl || "https://www.gematik.de/impressum"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Impressum
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={config?.supportUrl || "https://www.gematik.de/kontakt"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Hilfe &amp; Kontakt
          </a>
        </footer>
      </section>
    </main>
  );
}

export function ProgressOverlay({ visible }) {
  if (!visible) return null;
  return (
    <div className="progress-overlay" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      Deine Anmeldung wird sicher abgeschlossen …
    </div>
  );
}

export function InlineNotice({ tone = "info", title, children, action }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
