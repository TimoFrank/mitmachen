import { createPersonAction, updatePersonAction } from "@/lib/actions";
import { OrganizationOption, PersonDetail, UserOption } from "@/lib/types";
import { SubmitButton } from "@/components/forms";

const statuses = ["Neu", "Aktiv", "Wartet", "Inaktiv"];

export function PersonForm({
  users,
  organizations,
  personDetail,
  showOwnerField = true,
  returnTo
}: {
  users: UserOption[];
  organizations: OrganizationOption[];
  personDetail?: PersonDetail;
  showOwnerField?: boolean;
  returnTo?: string;
}) {
  const person = personDetail?.person;
  const action = person ? updatePersonAction.bind(null, person.id) : createPersonAction;

  return (
    <form action={action} className="stack">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <div className="form-grid">
        <label>
          Vorname
          <input name="firstName" defaultValue={person?.firstName} required />
        </label>
        <label>
          Nachname
          <input name="lastName" defaultValue={person?.lastName} required />
        </label>
        <label>
          Rolle
          <input name="role" defaultValue={person?.role ?? ""} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={person?.status ?? "Neu"}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          E-Mail
          <input name="email" type="email" defaultValue={person?.email ?? ""} />
        </label>
        <label>
          Telefon
          <input name="phone" defaultValue={person?.phone ?? ""} />
        </label>
        <label>
          Organisation
          <select name="organizationId" defaultValue={person?.organizationId ?? ""}>
            <option value="">Keine</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        {showOwnerField ? (
          <label>
            Owner
            <select name="ownerId" defaultValue={person?.ownerId ?? ""}>
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

      <SubmitButton pendingLabel="Speichert Person...">
        {person ? "Person aktualisieren" : "Person anlegen"}
      </SubmitButton>
    </form>
  );
}
