import { createOrganizationAction, updateOrganizationAction } from "@/lib/actions";
import { OrganizationDetail, UserOption } from "@/lib/types";
import { SubmitButton } from "@/components/forms";

const statuses = ["Lead", "Aktiv", "Wartet", "Inaktiv"];

export function OrganizationForm({
  users,
  organizationDetail,
  showOwnerField = true,
  returnTo
}: {
  users: UserOption[];
  organizationDetail?: OrganizationDetail;
  showOwnerField?: boolean;
  returnTo?: string;
}) {
  const organization = organizationDetail?.organization;
  const action = organization ? updateOrganizationAction.bind(null, organization.id) : createOrganizationAction;

  return (
    <form action={action} className="stack">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <div className="form-grid">
        <label>
          Name
          <input name="name" defaultValue={organization?.name} required />
        </label>
        <label>
          Branche
          <input name="industry" defaultValue={organization?.industry ?? ""} />
        </label>
        <label>
          Website
          <input name="website" type="url" defaultValue={organization?.website ?? ""} />
        </label>
        <label>
          Stadt
          <input name="city" defaultValue={organization?.city ?? ""} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={organization?.status ?? "Lead"}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        {showOwnerField ? (
          <label>
            Owner
            <select name="ownerId" defaultValue={organization?.ownerId ?? ""}>
              <option value="">Nicht zugewiesen</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <SubmitButton pendingLabel="Speichert Organisation...">
        {organization ? "Organisation aktualisieren" : "Organisation anlegen"}
      </SubmitButton>
    </form>
  );
}
