import Link from "next/link";
import { CrmShell } from "@/components/crm-shell";
import { SectionCard, StatCard } from "@/components/cards";
import { requireUserId } from "@/lib/auth";
import { getDashboardStats, getRecentlyAddedOrganizations, getRecentlyAddedPeople } from "@/lib/db";

function PersonGlyph() {
  return (
    <svg aria-hidden="true" className="dashboard-entry-icon" viewBox="0 0 20 20">
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

function OrganizationGlyph() {
  return (
    <svg aria-hidden="true" className="dashboard-entry-icon" viewBox="0 0 20 20">
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

function initials(parts: string[]) {
  return parts
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function DashboardPage() {
  await requireUserId();

  const stats = getDashboardStats();
  const recentPeople = getRecentlyAddedPeople(4);
  const recentOrganizations = getRecentlyAddedOrganizations(4);

  return (
    <CrmShell
      currentPath="/"
      title="Dashboard"
      subtitle="Schneller Einstieg fuer ein kleines internes Team."
      headerActions={
        <>
          <Link className="button button-secondary" href="/organizations/new">
            + Organisation anlegen
          </Link>
          <Link className="button button-primary" href="/people/new">
            + Person anlegen
          </Link>
        </>
      }
    >
      <div className="stats-grid">
        <StatCard className="stat-card-people" href="/people" icon={<PersonGlyph />} label="Personen" value={stats.people} />
        <StatCard
          className="stat-card-organizations"
          href="/organizations"
          icon={<OrganizationGlyph />}
          label="Organisationen"
          value={stats.organizations}
        />
      </div>

      <div className="dashboard-list-grid">
        <SectionCard className="dashboard-list-card dashboard-list-card-people" title="Zuletzt hinzugefügte Personen">
          <div className="table">
            {recentPeople.map((person) => (
              <Link className="table-row dashboard-entry-row" href={`/people/${person.id}`} key={person.id}>
                <span className="dashboard-entry-badge dashboard-entry-badge-person">
                  {initials([person.firstName, person.lastName])}
                </span>
                <span className="dashboard-entry-copy">
                  <span className="dashboard-entry-title">
                    <strong>
                      {person.firstName} {person.lastName}
                    </strong>
                  </span>
                  <span className="muted">{person.organizationName || "Keine Organisation"}</span>
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="dashboard-list-card dashboard-list-card-organizations" title="Zuletzt hinzugefügte Organisationen">
          <div className="table">
            {recentOrganizations.map((organization) => (
              <Link className="table-row dashboard-entry-row" href={`/organizations/${organization.id}`} key={organization.id}>
                <span className="dashboard-entry-badge dashboard-entry-badge-organization">
                  {initials(organization.name.split(" "))}
                </span>
                <span className="dashboard-entry-copy">
                  <span className="dashboard-entry-title">
                    <strong>{organization.name}</strong>
                  </span>
                  <span className="muted">{organization.city || "Keine Stadt"} · {organization.status}</span>
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </CrmShell>
  );
}
