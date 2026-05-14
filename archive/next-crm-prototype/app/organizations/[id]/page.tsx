import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { EntityHeader } from "@/components/entity-header";
import { NotesStream } from "@/components/notes";
import { SaveToast } from "@/components/save-toast";
import { requireUserId } from "@/lib/auth";
import { getOrganizationById, getUsers } from "@/lib/db";

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getOrganizationDemoImage(id: number) {
  if (id === 1) return "/demo-org-nordstadt.svg";
  if (id === 2) return "/demo-org-klarwerk.svg";
  return undefined;
}

function SectionIcon({ type }: { type: "contacts" | "website" | "notes" }) {
  if (type === "contacts") {
    return (
      <svg aria-hidden="true" className="section-icon section-icon-organization" viewBox="0 0 20 20">
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

  return (
    <svg aria-hidden="true" className="section-icon section-icon-organization" viewBox="0 0 20 20">
      <path
        d="M4.5 5.5h11m-9.5 4.5h8m-8 4.5h5.5M4.5 3.5h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default async function OrganizationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserId();
  const { id } = await params;
  const pageParams = await searchParams;
  const saved = typeof pageParams.saved === "string" ? pageParams.saved : undefined;
  const organizationDetail = getOrganizationById(Number(id));

  if (!organizationDetail) {
    notFound();
  }

  const users = getUsers();
  const organization = organizationDetail.organization;

  return (
    <CrmShell currentPath="/organizations" hidePageHeader title={organization.name}>
      <SaveToast saved={saved} />
      <EntityHeader
        accent="organization"
        media={{
          alt: `${organization.name} Einrichtungsbild`,
          initials: initials(organization.name),
          kindLabel: "Organisation",
          src: getOrganizationDemoImage(organization.id)
        }}
        owner={{
          entityType: "organization",
          entityId: organization.id,
          ownerId: organization.ownerId
        }}
        contactItems={[
          {
            icon: <SectionIcon type="contacts" />,
            label: "Stadt",
            value: organization.city || "Nicht hinterlegt"
          },
          {
            icon: <SectionIcon type="website" />,
            label: "Website",
            value: organization.website ? (
              <a href={organization.website} rel="noreferrer" target="_blank">
                {organization.website}
              </a>
            ) : (
              "Nicht hinterlegt"
            )
          }
        ]}
        returnTo={`/organizations/${organization.id}`}
        status={organization.status}
        subtitle={`${organization.industry || "Kein Sektor"} · ${organization.city || "Keine Stadt"}`}
        title={organization.name}
        updatedAt={organization.updatedAt}
        users={users}
      />

      <div className="detail-grid">
        <section className="detail-main-column">
          <section className="detail-panel detail-panel-minimal section-tight" id="notes">
            <div className="section-heading">
              <span className="section-heading-title">
                <SectionIcon type="notes" />
                <h3>Notizen und Verlauf</h3>
              </span>
            </div>
            <NotesStream
              entityType="organization"
              entityId={organization.id}
              notes={organizationDetail.notes}
              returnTo={`/organizations/${organization.id}#notes`}
            />
          </section>
        </section>

        <aside className="detail-side-column">
          <section className="detail-panel section-tight detail-panel-organization link-panel">
            <div className="section-heading">
              <span className="section-heading-title">
                <SectionIcon type="contacts" />
                <h3>Zugehoerige Personen</h3>
              </span>
            </div>
            <div className="linked-list">
              {organizationDetail.contacts.length === 0 ? (
                <p className="muted">Noch keine Personen verknuepft.</p>
              ) : (
                organizationDetail.contacts.map((contact) => (
                  <Link className="linked-list-item linked-list-item-organization" key={contact.id} href={`/people/${contact.id}`}>
                    <span className="linked-list-item-copy">
                      <strong>{contact.name}</strong>
                      <span>Person oeffnen</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </CrmShell>
  );
}
