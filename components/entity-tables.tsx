"use client";

import type { ReactNode, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { OrganizationListItem, PersonListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function OwnerBadge({ ownerName }: { ownerName: string | null }) {
  return <span className="owner-badge">{ownerName || "Unassigned"}</span>;
}

function PersonInitials({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return <span className="person-avatar">{initials}</span>;
}

function OrganizationInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return <span className="person-avatar organization-avatar">{initials || "OR"}</span>;
}

function TableRow({ href, cells }: { href: string; cells: ReactNode[] }) {
  const router = useRouter();

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr className="crm-table-row" onClick={() => router.push(href)} onKeyDown={handleKeyDown} role="link" tabIndex={0}>
      {cells.map((cell, index) => (
        <td key={index}>{cell}</td>
      ))}
    </tr>
  );
}

export function PeopleTable({ people, createHref }: { people: PersonListItem[]; createHref: string }) {
  const router = useRouter();

  if (people.length === 0) {
    return (
      <div className="empty-state-box">
        <p>Keine Personen passend zur aktuellen Suche.</p>
        <button className="button button-primary" onClick={() => router.push(createHref)} type="button">
          + Person
        </button>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table className="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Rolle</th>
            <th>Organisation</th>
            <th>Owner</th>
            <th>Status</th>
            <th className="align-right">Letzte Aktivitaet</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <TableRow
              key={person.id}
              href={`/people/${person.id}`}
              cells={[
                <div className="table-primary-cell" key="name">
                  <div className="person-name-cell">
                    <PersonInitials firstName={person.firstName} lastName={person.lastName} />
                    <div className="person-name-content">
                      <strong className="person-name-highlight">
                        {person.firstName} {person.lastName}
                      </strong>
                      <span className="table-secondary-text">{person.email || "Kein Kontakt hinterlegt"}</span>
                    </div>
                  </div>
                </div>,
                <span className="table-secondary-text" key="role">{person.role || "Ohne Rolle"}</span>,
                <span className="table-secondary-text" key="org">{person.organizationName || "Keine Organisation"}</span>,
                <OwnerBadge key="owner" ownerName={person.ownerName} />,
                <span className="status-chip status-chip-neutral" key="status">
                  {person.status}
                </span>,
                <span className="table-meta align-right" key="updated">
                  {formatDate(person.updatedAt)}
                </span>
              ]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrganizationsTable({
  organizations,
  createHref
}: {
  organizations: OrganizationListItem[];
  createHref: string;
}) {
  const router = useRouter();

  if (organizations.length === 0) {
    return (
      <div className="empty-state-box">
        <p>Keine Organisationen passend zur aktuellen Suche.</p>
        <button className="button button-primary" onClick={() => router.push(createHref)} type="button">
          + Organisation
        </button>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table className="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sektor</th>
            <th>Stadt</th>
            <th>Bundesland</th>
            <th>Owner</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((organization) => (
            <TableRow
              key={organization.id}
              href={`/organizations/${organization.id}`}
              cells={[
                <div className="table-primary-cell" key="name">
                  <div className="person-name-cell">
                    <OrganizationInitials name={organization.name} />
                    <div className="person-name-content">
                      <strong className="person-name-highlight organization-name-highlight">{organization.name}</strong>
                      <span className="table-secondary-text">
                        {organization.website || "Keine Website hinterlegt"}
                      </span>
                    </div>
                  </div>
                </div>,
                <span className="table-secondary-text" key="sector">{organization.sector || "Nicht zugeordnet"}</span>,
                <span className="table-secondary-text" key="city">{organization.city || "Keine Stadt"}</span>,
                <span className="table-secondary-text" key="state">{organization.state || "Nicht zugeordnet"}</span>,
                <OwnerBadge key="owner" ownerName={organization.ownerName} />,
                <span className="status-chip status-chip-neutral" key="status">
                  {organization.status}
                </span>
              ]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
