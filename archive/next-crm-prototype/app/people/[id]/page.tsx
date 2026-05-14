import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { EntityHeader } from "@/components/entity-header";
import { NotesStream } from "@/components/notes";
import { SaveToast } from "@/components/save-toast";
import { requireUserId } from "@/lib/auth";
import { getPersonById, getUsers } from "@/lib/db";

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getPersonDemoImage(id: number) {
  if (id === 1) return "/demo-person-lisa.svg";
  if (id === 2) return "/demo-person-jens.svg";
  return undefined;
}

function SectionIcon({ type }: { type: "contact" | "notes" | "organization" }) {
  if (type === "contact") {
    return (
      <svg aria-hidden="true" className="section-icon section-icon-person" viewBox="0 0 20 20">
        <path
          d="M6.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm7 1a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM2.75 16a3.75 3.75 0 0 1 3.75-3.75h1A3.75 3.75 0 0 1 11.25 16"
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
    <svg aria-hidden="true" className="section-icon section-icon-person" viewBox="0 0 20 20">
      <path
        d="M5 4.5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2.5 3h5m-5 3h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default async function PersonDetailPage({
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
  const personDetail = getPersonById(Number(id));

  if (!personDetail) {
    notFound();
  }

  const users = getUsers();
  const personName = `${personDetail.person.firstName} ${personDetail.person.lastName}`;

  return (
    <CrmShell currentPath="/people" hidePageHeader title={personName}>
      <SaveToast saved={saved} />
      <EntityHeader
        accent="person"
        media={{
          alt: `${personName} Profilbild`,
          initials: initials(personDetail.person.firstName, personDetail.person.lastName),
          kindLabel: "Person",
          src: getPersonDemoImage(personDetail.person.id)
        }}
        owner={{
          entityType: "person",
          entityId: personDetail.person.id,
          ownerId: personDetail.person.ownerId
        }}
        contactItems={[
          {
            icon: <SectionIcon type="contact" />,
            label: "E-Mail",
            value: personDetail.person.email || "Nicht hinterlegt"
          },
          {
            icon: <SectionIcon type="contact" />,
            label: "Telefon",
            value: personDetail.person.phone || "Nicht hinterlegt"
          }
        ]}
        returnTo={`/people/${personDetail.person.id}`}
        status={personDetail.person.status}
        subtitle={`${personDetail.person.role || "Ohne Rolle"} · ${personDetail.organizationName || "Keine Organisation"}`}
        title={personName}
        updatedAt={personDetail.person.updatedAt}
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
              entityType="person"
              entityId={personDetail.person.id}
              notes={personDetail.notes}
              returnTo={`/people/${personDetail.person.id}#notes`}
            />
          </section>
        </section>

        <aside className="detail-side-column">
          <section className="detail-panel section-tight detail-panel-person link-panel">
            <div className="section-heading">
              <span className="section-heading-title">
                <SectionIcon type="organization" />
                <h3>Zugehoerige Organisation</h3>
              </span>
            </div>
            {personDetail.organizationName ? (
              <Link className="linked-list-item linked-list-item-person" href={`/organizations/${personDetail.person.organizationId}`}>
                <span className="linked-list-item-copy">
                  <strong>{personDetail.organizationName}</strong>
                  <span>Organisation oeffnen</span>
                </span>
              </Link>
            ) : (
              <p className="muted">Keine Organisation verknuepft.</p>
            )}
          </section>
        </aside>
      </div>
    </CrmShell>
  );
}
