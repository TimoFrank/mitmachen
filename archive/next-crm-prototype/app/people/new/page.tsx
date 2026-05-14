import { CrmShell } from "@/components/crm-shell";
import { SectionCard } from "@/components/cards";
import { PersonForm } from "@/components/person-form";
import { requireUserId } from "@/lib/auth";
import { getOrganizationsForSelect, getUsers } from "@/lib/db";

export default async function NewPersonPage() {
  await requireUserId();

  const users = getUsers();
  const organizations = getOrganizationsForSelect();

  return (
    <CrmShell currentPath="/people" title="Neue Person" subtitle="Neuen Kontakt ohne Listenbruch anlegen.">
      <SectionCard title="Person anlegen">
        <PersonForm organizations={organizations} returnTo="/people" users={users} />
      </SectionCard>
    </CrmShell>
  );
}
