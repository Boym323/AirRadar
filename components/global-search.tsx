"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { MAX_GLOBAL_SEARCH_QUERY_LENGTH, MIN_GLOBAL_SEARCH_QUERY_LENGTH, type AircraftSearchResult, type AirportSearchResult, type AtsPointSearchResult, type GlobalSearchResponse, type SearchHref } from "@/lib/search/types";

const SEARCH_DEBOUNCE_MS = 220;

type SearchItem = AircraftSearchResult | AirportSearchResult | AtsPointSearchResult;

function itemKey(item: SearchItem): string {
  if (item.kind === "aircraft") return `aircraft-${item.icaoHex}`;
  if (item.kind === "airport") return `airport-${item.icaoCode}`;
  return `ats-point-${item.id}`;
}

function aircraftPrimaryLabel(item: AircraftSearchResult): string {
  return item.registration || item.callsign || item.icaoHex;
}

function aircraftSecondaryLabel(item: AircraftSearchResult): string {
  return [
    item.aircraftType,
    item.callsign && item.callsign !== aircraftPrimaryLabel(item) ? item.callsign : null,
    item.icaoHex,
  ].filter(Boolean).join(" · ");
}

function airportPrimaryLabel(item: AirportSearchResult): string {
  return `${item.iataCode ? `${item.iataCode} · ` : ""}${item.icaoCode}`;
}

function airportSecondaryLabel(item: AirportSearchResult): string {
  return [item.name, item.city].filter(Boolean).join(" · ");
}

function atsPointSecondaryLabel(item: AtsPointSearchResult): string {
  return [item.countryCode, item.pointKind === "NAVAID" ? "NAVAID" : "FIX", item.routeDesignators.join(", ")].join(" · ");
}

export function GlobalSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const items = useMemo<SearchItem[]>(() => [
    ...(results?.aircraft ?? []),
    ...(results?.airports ?? []),
    ...(results?.atsPoints ?? []),
  ], [results]);
  const activeItem = items[activeIndex] ?? null;

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < MIN_GLOBAL_SEARCH_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setRequestFailed(false);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    setResults(null);
    setActiveIndex(0);
    setLoading(true);
    setRequestFailed(false);
    setOpen(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search request failed");
          return (await response.json()) as GlobalSearchResponse;
        })
        .then((next) => {
          setResults(next);
          setActiveIndex(0);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setRequestFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function selectItem(item: SearchItem) {
    setOpen(false);
    router.push(item.href as SearchHref);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!items.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Enter" && open && activeItem) {
      event.preventDefault();
      selectItem(activeItem);
    }
  }

  const showDropdown = open && query.trim().length >= MIN_GLOBAL_SEARCH_QUERY_LENGTH;
  const showEmpty = !loading && !requestFailed && results !== null && items.length === 0;

  return (
    <div className="global-search" ref={rootRef}>
      <span className="global-search-icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        className="global-search-input"
        value={query}
        maxLength={MAX_GLOBAL_SEARCH_QUERY_LENGTH}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => { if (results || loading) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder={t.search.globalPlaceholder}
        aria-label={t.search.globalLabel}
        aria-autocomplete="list"
        aria-controls="global-search-results"
        aria-expanded={showDropdown}
        aria-activedescendant={activeItem && showDropdown ? itemKey(activeItem) : undefined}
        role="combobox"
      />
      {showDropdown && <div id="global-search-results" className="global-search-results" role="listbox">
        {loading && <div className="global-search-status">{t.search.loading}</div>}
        {requestFailed && <div className="global-search-status">{t.search.requestFailed}</div>}
        {showEmpty && <div className="global-search-status">{t.search.noResults}</div>}
        {!loading && !requestFailed && results?.aircraft.length ? <section className="global-search-group" aria-label={t.search.aircraftResults}>
          <div className="global-search-group-title">{t.search.aircraftResults}</div>
          {results.aircraft.map((item) => {
            const index = items.findIndex((candidate) => itemKey(candidate) === itemKey(item));
            return <Link
              id={itemKey(item)}
              key={itemKey(item)}
              className={`global-search-item ${index === activeIndex ? "active" : ""}`}
              href={item.href as SearchHref}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => setOpen(false)}
            >
              <span className="global-search-item-primary">{aircraftPrimaryLabel(item)}</span>
              <span className="global-search-item-secondary">{aircraftSecondaryLabel(item)}</span>
            </Link>;
          })}
        </section> : null}
        {!loading && !requestFailed && results?.airports.length ? <section className="global-search-group" aria-label={t.search.airportResults}>
          <div className="global-search-group-title">{t.search.airportResults}</div>
          {results.airports.map((item) => {
            const index = items.findIndex((candidate) => itemKey(candidate) === itemKey(item));
            return <Link
              id={itemKey(item)}
              key={itemKey(item)}
              className={`global-search-item ${index === activeIndex ? "active" : ""}`}
              href={item.href as SearchHref}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => setOpen(false)}
            >
              <span className="global-search-item-primary">{airportPrimaryLabel(item)}</span>
              <span className="global-search-item-secondary">{airportSecondaryLabel(item)}</span>
            </Link>;
          })}
        </section> : null}
        {!loading && !requestFailed && results?.atsPoints.length ? <section className="global-search-group" aria-label={t.search.atsPointResults}>
          <div className="global-search-group-title">{t.search.atsPointResults}</div>
          {results.atsPoints.map((item) => {
            const index = items.findIndex((candidate) => itemKey(candidate) === itemKey(item));
            return <Link id={itemKey(item)} key={itemKey(item)} className={`global-search-item ${index === activeIndex ? "active" : ""}`} href={item.href as SearchHref} role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => setOpen(false)}>
              <span className="global-search-item-primary">{item.name}</span>
              <span className="global-search-item-secondary">{atsPointSecondaryLabel(item)}</span>
            </Link>;
          })}
        </section> : null}
      </div>}
    </div>
  );
}
