"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type OrganizationListFiltersProps = {
  query: string;
  status: string;
  sector: string;
  city: string;
  state: string;
  sectors: string[];
  cities: string[];
  states: string[];
};

const statuses = ["", "Lead", "Aktiv", "Wartet", "Inaktiv"];

export function OrganizationListFilters({
  query,
  status,
  sector,
  city,
  state,
  sectors,
  cities,
  states
}: OrganizationListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(query);
  const [statusValue, setStatusValue] = useState(status);
  const [sectorValue, setSectorValue] = useState(sector);
  const [cityValue, setCityValue] = useState(city);
  const [stateValue, setStateValue] = useState(state);

  useEffect(() => {
    setSearchValue(query);
    setStatusValue(status);
    setSectorValue(sector);
    setCityValue(city);
    setStateValue(state);
  }, [city, query, sector, state, status]);

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
      sector?: string;
      city?: string;
      state?: string;
    }) => {
      const params = new URLSearchParams();
      const values = {
        q: next.q ?? searchValue,
        status: next.status ?? statusValue,
        sector: next.sector ?? sectorValue,
        city: next.city ?? cityValue,
        state: next.state ?? stateValue
      };

      if (values.q) params.set("q", values.q);
      if (values.status) params.set("status", values.status);
      if (values.sector) params.set("sector", values.sector);
      if (values.city) params.set("city", values.city);
      if (values.state) params.set("state", values.state);

      startTransition(() => {
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
      });
    },
    [cityValue, pathname, router, searchValue, sectorValue, startTransition, stateValue, statusValue]
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
            placeholder="Nach Name, Sektor, Stadt, Bundesland oder Owner suchen..."
            type="search"
            value={searchValue}
          />
        </label>
        <div className="filter-status-indicator">{isPending ? "Aktualisiere..." : "Live-Filter"}</div>
      </div>

      <div className="organization-filter-grid">
        <label>
          Sektor
          <select
            name="sector"
            onChange={(event) => {
              const value = event.target.value;
              setSectorValue(value);
              updateUrl({ sector: value });
            }}
            value={sectorValue}
          >
            <option value="">Alle Sektoren</option>
            {sectors.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stadt
          <select
            name="city"
            onChange={(event) => {
              const value = event.target.value;
              setCityValue(value);
              updateUrl({ city: value });
            }}
            value={cityValue}
          >
            <option value="">Alle Städte</option>
            {cities.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bundesland
          <select
            name="state"
            onChange={(event) => {
              const value = event.target.value;
              setStateValue(value);
              updateUrl({ state: value });
            }}
            value={stateValue}
          >
            <option value="">Alle Bundesländer</option>
            {states.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
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
