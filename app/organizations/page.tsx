import Link from "next/link";
import { CrmShell } from "@/components/crm-shell";
import { OrganizationsTable } from "@/components/entity-tables";
import { OrganizationListFilters } from "@/components/organization-list-filters";
import { SaveToast } from "@/components/save-toast";
import { requireUserId } from "@/lib/auth";
import { getOrganizationFilterOptions, getOrganizations } from "@/lib/db";

export default async function OrganizationsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserId();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const sector = typeof params.sector === "string" ? params.sector : "";
  const city = typeof params.city === "string" ? params.city : "";
  const state = typeof params.state === "string" ? params.state : "";
  const saved = typeof params.saved === "string" ? params.saved : undefined;
  const organizations = getOrganizations({
    query,
    sort: "updated",
    status,
    sector,
    city,
    state
  });
  const filterOptions = getOrganizationFilterOptions();

  return (
    <CrmShell
      title="Organisationen"
      subtitle="Verwalten Sie alle Organisationen in Ihrem CRM-System."
      currentPath="/organizations"
      headerActions={
        <Link className="button button-primary" href="/organizations/new">
          + Organisation
        </Link>
      }
    >
      <SaveToast saved={saved} />
      <OrganizationListFilters
        cities={filterOptions.cities}
        city={city}
        query={query}
        sector={sector}
        sectors={filterOptions.sectors}
        state={state}
        states={filterOptions.states}
        status={status}
      />
      <section className="table-section">
        <OrganizationsTable createHref="/organizations/new" organizations={organizations} />
      </section>
    </CrmShell>
  );
}
