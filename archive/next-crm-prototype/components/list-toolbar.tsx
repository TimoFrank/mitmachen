type SortOption = "updated" | "name";

type FilterChip = {
  href: string;
  label: string;
  active: boolean;
};

export function HeaderSearch({
  defaultQuery,
  defaultSort,
  defaultStatus,
  searchPlaceholder
}: {
  defaultQuery: string;
  defaultSort: SortOption;
  defaultStatus?: string;
  searchPlaceholder: string;
}) {
  return (
    <form className="header-search-form" method="get">
      {defaultStatus ? <input name="status" type="hidden" value={defaultStatus} /> : null}
      <label className="search-field">
        <span className="sr-only">Suche</span>
        <input defaultValue={defaultQuery} name="q" placeholder={searchPlaceholder} type="search" />
      </label>
      <label className="sort-field">
        <span className="sr-only">Sortierung</span>
        <select defaultValue={defaultSort} name="sort">
          <option value="updated">Zuletzt aktualisiert</option>
          <option value="name">Name</option>
        </select>
      </label>
      <button className="button button-secondary" type="submit">
        Anwenden
      </button>
    </form>
  );
}

export function FilterChipBar({ chips }: { chips: FilterChip[] }) {
  return (
    <div className="filter-chip-bar">
      {chips.map((chip) => (
        <a key={chip.href} className={`filter-chip${chip.active ? " filter-chip-active" : ""}`} href={chip.href}>
          {chip.label}
        </a>
      ))}
    </div>
  );
}
