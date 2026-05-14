import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="login-card stack">
        <div>
          <p className="eyebrow">404</p>
          <h1>Seite nicht gefunden</h1>
          <p className="muted">Die angeforderte CRM-Ansicht existiert nicht.</p>
        </div>
        <Link href="/" className="button button-primary">
          Zurueck zum Dashboard
        </Link>
      </div>
    </div>
  );
}
