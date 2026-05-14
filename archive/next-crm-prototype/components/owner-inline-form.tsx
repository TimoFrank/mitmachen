"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/forms";
import { updateOrganizationOwnerAction, updatePersonOwnerAction } from "@/lib/actions";
import { UserOption } from "@/lib/types";

export function OwnerInlineForm({
  entityType,
  entityId,
  ownerId,
  returnTo,
  users
}: {
  entityType: "person" | "organization";
  entityId: number;
  ownerId: number | null;
  returnTo: string;
  users: UserOption[];
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const action =
    entityType === "person"
      ? updatePersonOwnerAction.bind(null, entityId)
      : updateOrganizationOwnerAction.bind(null, entityId);

  return (
    <form action={action} className="owner-inline-form" ref={formRef}>
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className="owner-inline-label">
        <span className="owner-inline-label-copy">
          <svg aria-hidden="true" className="owner-inline-icon" viewBox="0 0 20 20">
            <path
              d="M6.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm7 1a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM2.75 16a3.75 3.75 0 0 1 3.75-3.75h1A3.75 3.75 0 0 1 11.25 16m.5.75v-.5a4.25 4.25 0 0 0-1.4-3.15 4.8 4.8 0 0 1 2.9-.85h.5a3.5 3.5 0 0 1 3.5 3.5v1"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          Owner
        </span>
        <select
          className="owner-inline-select"
          defaultValue={ownerId ?? ""}
          name="ownerId"
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">Nicht zugewiesen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton className="sr-only" pendingLabel="Speichert...">
        Speichern
      </SubmitButton>
    </form>
  );
}
