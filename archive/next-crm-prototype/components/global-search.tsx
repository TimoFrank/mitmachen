"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobalSearchItem } from "@/lib/types";

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function GlobalSearch({ items }: { items: GlobalSearchItem[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLFormElement | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return [];
    }

    return items
      .filter((item) => item.keywords.includes(normalizedQuery) || item.title.toLowerCase().includes(normalizedQuery))
      .slice(0, 7);
  }, [items, query]);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointer);
    return () => window.removeEventListener("mousedown", handlePointer);
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (results[0]) {
      setIsOpen(false);
      router.push(results[0].href);
    }
  }

  return (
    <form
      className="topbar-search"
      onFocus={() => setIsOpen(true)}
      onSubmit={handleSubmit}
      ref={containerRef}
      role="search"
    >
      <svg aria-hidden="true" className="topbar-icon" viewBox="0 0 20 20">
        <path d="M13.9 12.5 17 15.6l-1.4 1.4-3.1-3.1a6 6 0 1 1 1.4-1.4ZM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
      </svg>
      <input
        aria-label="Globale Suche"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder="Personen oder Organisationen suchen..."
        type="search"
        value={query}
      />

      {isOpen && query ? (
        <div className="search-results-panel">
          {results.length > 0 ? (
            results.map((item) => (
              <button
                className="search-result-row"
                key={`${item.kind}-${item.id}`}
                onClick={() => {
                  setIsOpen(false);
                  router.push(item.href);
                }}
                type="button"
              >
                <span className={`search-result-kind search-result-kind-${item.kind}`}>
                  {item.kind === "person" ? "Person" : "Organisation"}
                </span>
                <span className="search-result-copy">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="search-results-empty">Keine Treffer fuer die aktuelle Suche.</div>
          )}
        </div>
      ) : null}
    </form>
  );
}
