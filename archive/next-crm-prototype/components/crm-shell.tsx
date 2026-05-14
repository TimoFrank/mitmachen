import Link from "next/link";
import { ReactNode } from "react";
import { GlobalSearch } from "@/components/global-search";
import { NotificationMenu } from "@/components/notification-menu";
import { logoutAction } from "@/lib/actions";
import { getGlobalSearchItems } from "@/lib/db";

const navigation = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/people", label: "Personen", icon: "people" },
  { href: "/organizations", label: "Organisationen", icon: "orgs" }
];

const systemNavigation = [{ href: "/settings", label: "Einstellungen", icon: "orgs", disabled: true }];

function NavigationIcon({ type }: { type: string }) {
  if (type === "home") {
    return (
      <svg aria-hidden="true" className="nav-icon" viewBox="0 0 20 20">
        <path
          d="M3.75 8.75 10 3.75l6.25 5V16a.75.75 0 0 1-.75.75H11.5v-4.5h-3v4.5H4.5A.75.75 0 0 1 3.75 16Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (type === "people") {
    return (
      <svg aria-hidden="true" className="nav-icon" viewBox="0 0 20 20">
        <path
          d="M6.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm7 1a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM2.75 16a3.75 3.75 0 0 1 3.75-3.75h1A3.75 3.75 0 0 1 11.25 16m.5.75v-.5a4.25 4.25 0 0 0-1.4-3.15 4.8 4.8 0 0 1 2.9-.85h.5a3.5 3.5 0 0 1 3.5 3.5v1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 20 20">
      <path
        d="M4.25 4.25h11.5a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1Zm2.25 3h7.5m-7.5 3.5h5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export async function CrmShell({
  title,
  subtitle,
  headerActions,
  hidePageHeader = false,
  currentPath,
  children
}: {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  hidePageHeader?: boolean;
  currentPath?: string;
  children: ReactNode;
}) {
  const searchItems = getGlobalSearchItems();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark-modern" aria-hidden="true">
              <span className="brand-orbit brand-orbit-green" />
              <span className="brand-orbit brand-orbit-blue" />
              <span className="brand-core" />
            </div>
            <div className="brand-lockup">
              <strong>Versorgung</strong>
              <span>internes CRM</span>
            </div>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-label">CRM</p>
            <nav className="nav">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${currentPath === item.href || currentPath?.startsWith(`${item.href}/`) ? " nav-link-active" : ""}`}
                >
                  <NavigationIcon type={item.icon} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-label">System</p>
            <nav className="nav">
              {systemNavigation.map((item) => (
                <span key={item.href} className="nav-link nav-link-disabled">
                  <NavigationIcon type={item.icon} />
                  {item.label}
                </span>
              ))}
            </nav>
          </div>
        </div>

        <form action={logoutAction}>
          <button className="button button-secondary" type="submit">
            Abmelden
          </button>
        </form>
      </aside>

      <main className="content">
        <div className="topbar">
          <GlobalSearch items={searchItems} />
          <div className="topbar-spacer" />
          <NotificationMenu />
          <div className="avatar-chip">TF</div>
        </div>

        {hidePageHeader ? null : (
          <header className="page-header">
            <div>
              <h2>{title}</h2>
              {subtitle ? <p className="muted">{subtitle}</p> : null}
            </div>
            {headerActions ? <div className="page-actions">{headerActions}</div> : null}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
