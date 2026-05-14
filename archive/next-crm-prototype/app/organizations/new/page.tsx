import { CrmShell } from "@/components/crm-shell";
import { SectionCard } from "@/components/cards";
import { OrganizationForm } from "@/components/organization-form";
import { requireUserId } from "@/lib/auth";
import { getUsers } from "@/lib/db";

export default async function NewOrganizationPage() {
  await requireUserId();

  const users = getUsers();

  return (
    <CrmShell currentPath="/organizations" title="Neue Organisation" subtitle="Neue Firma ohne permanente Inline-Form anlegen.">
      <SectionCard title="Organisation anlegen">
        <OrganizationForm returnTo="/organizations" users={users} />
      </SectionCard>
    </CrmShell>
  );
}
