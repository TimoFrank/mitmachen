"use client";

const notifications = [
  {
    title: "Owner-Wechsel",
    body: "Timo Frank wurde als neuer Owner fuer Nordstadt Pflegezentrum hinzugefuegt.",
    meta: "vor 12 Minuten"
  },
  {
    title: "Neue Notiz",
    body: "Bei Klarwerk Gesundheit wurde eine interne Notiz hinterlegt.",
    meta: "vor 38 Minuten"
  },
  {
    title: "Wiedervorlage",
    body: "Lisa Hartmann wartet noch auf Rueckmeldung zum naechsten Schritt.",
    meta: "heute"
  }
] as const;

export function NotificationMenu() {
  return (
    <div className="notification-menu">
      <button className="icon-button notification-trigger" type="button" aria-label="Benachrichtigungen">
        <svg aria-hidden="true" className="topbar-icon" viewBox="0 0 20 20">
          <path d="M10 3.5A4.5 4.5 0 0 0 5.5 8v2.4l-1.3 2.2A1 1 0 0 0 5 14h10a1 1 0 0 0 .8-1.4l-1.3-2.2V8A4.5 4.5 0 0 0 10 3.5Zm0 13a2.3 2.3 0 0 1-2.1-1.4h4.2A2.3 2.3 0 0 1 10 16.5Z" />
        </svg>
        <span className="notification-dot" />
      </button>

      <div className="notification-panel" role="dialog" aria-label="Benachrichtigungen">
        <div className="notification-panel-header">
          <strong>Benachrichtigungen</strong>
          <span>3 neu</span>
        </div>
        <div className="notification-list">
          {notifications.map((notification) => (
            <div className="notification-item" key={notification.title}>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <span>{notification.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
