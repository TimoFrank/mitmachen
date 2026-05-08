"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OrganizationOption, UserOption } from "@/lib/types";

type PeopleListFiltersProps = {
  query: string;
  status: string;
  role: string;
  organizationId: string;
  ownerId: string;
  roles: string[];
  organizations: OrganizationOption[];
  owners: UserOption[];
};

const statuses = ["", "Neu", "Aktiv", "Wartet", "Inaktiv"];

export function PeopleListFilters({
  query,
  status,
  role,
  organizationId,
  ownerId,
  roles,
  organizations,
  owners
}: PeopleListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(query);
  const [statusValue, setStatusValue] = useState(status);
  const [roleValue, setRoleValue] = useState(role);
  const [organizationValue, setOrganizationValue] = useState(organizationId);
  const [ownerValue, setOwnerValue] = useState(ownerId);

  useEffect(() => {
    setSearchValue(query);
    setStatusValue(status);
    setRoleValue(role);
    setOrganizationValue(organizationId);
    setOwnerValue(ownerId);
  }, [organizationId, ownerId, query, role, status]);

  const statusChips = useMemo(
    () =>
      statuses.map((value) => ({
        value,
        label: value || "Alle Status",
        active: value === statusValue || (!value && !statusValue)
      })),
    [statusValue]
  );

  const updateUrl = useCallback(
    (next: {
      q?: string;
      status?: string;
      role?: string;
      organizationId?: string;
      ownerId?: string;
    }) => {
      const params = new URLSearchParams();
      const values = {
        q: next.q ?? searchValue,
        status: next.status ?? statusValue,
        role: next.role ?? roleValue,
        organizationId: next.organizationId ?? organizationValue,
        ownerId: next.ownerId ?? ownerValue
      };

      if (values.q) params.set("q", values.q);
      if (values.status) params.set("status", values.status);
      if (values.role) params.set("role", values.role);
      if (values.organizationId) params.set("organizationId", values.organizationId);
      if (values.ownerId) params.set("ownerId", values.ownerId);

      startTransition(() => {
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
      });
    },
    [organizationValue, ownerValue, pathname, roleValue, router, searchValue, startTransition, statusValue]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchValue !== query) {
        updateUrl({ q: searchValue });
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [query, searchValue, updateUrl]);

  return (
    <section className="filter-surface">
      <div className="people-filter-top">
        <label className="search-field people-search-field">
          <span className="sr-only">Suche</span>
          <input
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Nach Name, Rolle, Organisation oder Owner suchen..."
            type="search"
            value={searchValue}
          />
        </label>
        <div className="filter-status-indicator">{isPending ? "Aktualisiere..." : "Live-Filter"}</div>
      </div>

      <div className="people-filter-grid">
        <label>
          Rolle
          <select
            name="role"
            onChange={(event) => {
              const value = event.target.value;
              setRoleValue(value);
              updateUrl({ role: value });
            }}
            value={roleValue}
          >
            <option value="">Alle Rollen</option>
            {roles.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organisation
          <select
            name="organizationId"
            onChange={(event) => {
              const value = event.target.value;
              setOrganizationValue(value);
              updateUrl({ organizationId: value });
            }}
            value={organizationValue}
          >
            <option value="">Alle Organisationen</option>
            {organizations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            name="ownerId"
            onChange={(event) => {
              const value = event.target.value;
              setOwnerValue(value);
              updateUrl({ ownerId: value });
            }}
            value={ownerValue}
          >
            <option value="">Alle Owner</option>
            {owners.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="filter-chip-bar">
        {statusChips.map((chip) => (
          <button
            className={`filter-chip${chip.active ? " filter-chip-active" : ""}`}
            key={chip.label}
            onClick={() => {
              setStatusValue(chip.value);
              updateUrl({ status: chip.value });
            }}
            type="button"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}
