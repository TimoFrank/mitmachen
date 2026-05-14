import { ContactImportWizard } from "@/components/import/contact-import-wizard";
import { CrmShell } from "@/components/crm-shell";
import { requireUserId } from "@/lib/auth";
import { getImportContext } from "@/lib/db";

export default async function ImportPeoplePage() {
  await requireUserId();

  return (
    <CrmShell
      currentPath="/people"
      title="Kontakte importieren"
      subtitle="Gefuehrter Import fuer CSV und Excel mit Vorschau, Feldzuordnung und Pruefung."
    >
      <ContactImportWizard context={getImportContext()} />
    </CrmShell>
  );
}
