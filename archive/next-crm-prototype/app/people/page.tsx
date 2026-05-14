import Link from "next/link";
import { CrmShell } from "@/components/crm-shell";
import { PeopleTable } from "@/components/entity-tables";
import { PeopleListFilters } from "@/components/people-list-filters";
import { SaveToast } from "@/components/save-toast";
import { requireUserId } from "@/lib/auth";
import { getPeople, getPersonFilterOptions } from "@/lib/db";
import { SortOption } from "@/lib/types";

export default async function PeoplePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserId();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const role = typeof params.role === "string" ? params.role : "";
  const organizationId = typeof params.organizationId === "string" ? params.organizationId : "";
  const ownerId = typeof params.ownerId === "string" ? params.ownerId : "";
  const saved = typeof params.saved === "string" ? params.saved : undefined;
  const people = getPeople({
    query,
    sort: "updated" as SortOption,
    status,
    role,
    organizationId: organizationId ? Number(organizationId) : null,
    ownerId: ownerId ? Number(ownerId) : null
  });
  const filterOptions = getPersonFilterOptions();

  return (
    <CrmShell
      title="Personen"
      subtitle="Verwalten Sie alle Kontakte in Ihrem CRM-System."
      currentPath="/people"
      headerActions={
        <>
          <Link className="button button-secondary" href="/people/import">
            Kontakte importieren
          </Link>
          <Link className="button button-primary" href="/people/new">
            + Person
          </Link>
        </>
      }
    >
      <SaveToast saved={saved} />
      <PeopleListFilters
        organizationId={organizationId}
        organizations={filterOptions.organizations}
        ownerId={ownerId}
        owners={filterOptions.owners}
        query={query}
        role={role}
        roles={filterOptions.roles}
        status={status}
      />
      <section className="table-section">
        <PeopleTable createHref="/people/new" people={people} />
      </section>
    </CrmShell>
  );
}
