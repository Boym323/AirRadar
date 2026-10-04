"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-primitives";
import { formatDateTime, t } from "@/lib/i18n";
import {
  COMMAND_SEARCH_RECENTS_KEY,
  OPEN_COMMAND_PALETTE_EVENT,
  addCommandSearchRecent,
  parseCommandSearchRecents,
  requestOperationsCenterOpen,
  type CommandPaletteRecent,
} from "@/lib/search/command-palette";
import {
  MAX_GLOBAL_SEARCH_QUERY_LENGTH,
  MIN_GLOBAL_SEARCH_QUERY_LENGTH,
  type AircraftSearchResult,
  type AirportSearchResult,
  type AtsPointSearchResult,
  type FlightSearchResult,
  type GlobalSearchResponse,
  type SmartSearchActionResult,
} from "@/lib/search/types";

const SEARCH_DEBOUNCE_MS = 220;

type SearchResult = AircraftSearchResult | AirportSearchResult | AtsPointSearchResult | FlightSearchResult | SmartSearchActionResult;

interface StaticCommand {
  key: string;
  label: string;
  detail: string;
  href: string;
  icon: "radar" | "time" | "flight" | "airport" | "statistics" | "system";
  keywords: string[];
  action?: "operations";
}

type PaletteItem =
  | { type: "command"; command: StaticCommand }
  | { type: "recent"; recent: CommandPaletteRecent }
  | { type: "result"; result: SearchResult };

function resultKey(item: SearchResult): string {
  if (item.kind === "aircraft") return `aircraft:${item.icaoHex}`;
  if (item.kind === "airport") return `airport:${item.icaoCode}`;
  if (item.kind === "ats-point") return `ats-point:${item.id}`;
  if (item.kind === "flight") return `flight:${item.id}`;
  return `action:${item.intent}:${item.airportIcao ?? ""}`;
}

function smartActionLabels(item: SmartSearchActionResult): { label: string; detail: string } {
  if (item.intent === "go_arounds_today") {
    return { label: t.commandSearch.goAroundsToday, detail: t.commandSearch.goAroundsTodayDetail };
  }
  if (item.intent === "rare_aircraft_today") {
    return { label: t.commandSearch.rareAircraftToday, detail: t.commandSearch.rareAircraftTodayDetail };
  }
  if (item.intent === "airport_operations") {
    return {
      label: t.commandSearch.airportOperations(item.airportIcao ?? t.common.emptyValue),
      detail: t.commandSearch.airportOperationsDetail,
    };
  }
  return {
    label: t.commandSearch.flightsToAirport(item.airportIcao ?? t.common.emptyValue),
    detail: t.commandSearch.flightsToAirportDetail,
  };
}

function resultLabels(item: SearchResult): { label: string; detail: string } {
  if (item.kind === "aircraft") {
    const label = item.callsign || item.registration || item.icaoHex;
    return {
      label,
      detail: [item.aircraftType, item.registration && item.registration !== label ? item.registration : null, item.icaoHex]
        .filter(Boolean).join(" · "),
    };
  }
  if (item.kind === "airport") {
    return {
      label: `${item.iataCode ? `${item.iataCode} · ` : ""}${item.icaoCode}`,
      detail: [item.name, item.city].filter(Boolean).join(" · "),
    };
  }
  if (item.kind === "ats-point") {
    return {
      label: item.name,
      detail: [item.countryCode, item.pointKind === "NAVAID" ? "NAVAID" : "FIX", item.routeDesignators.join(", ")]
        .filter(Boolean).join(" · "),
    };
  }
  if (item.kind === "flight") {
    const label = item.callsign || item.registration || item.icaoHex;
    return {
      label,
      detail: [
        `${item.origin ?? t.common.emptyValue} → ${item.destination ?? t.common.emptyValue}`,
        item.aircraftType,
        formatDateTime(item.startTime),
      ].filter(Boolean).join(" · "),
    };
  }
  return smartActionLabels(item);
}

function resultIcon(item: SearchResult): "aircraft" | "airport" | "waypoint" | "flight" | "time" | "radar" {
  if (item.kind === "aircraft") return "aircraft";
  if (item.kind === "airport") return "airport";
  if (item.kind === "ats-point") return "waypoint";
  if (item.kind === "flight") return "flight";
  if (item.intent === "go_arounds_today" || item.intent === "rare_aircraft_today") return "time";
  return item.intent === "airport_operations" ? "radar" : "flight";
}

function resultKindLabel(item: SearchResult): string {
  if (item.kind === "aircraft") return t.search.aircraftResults;
  if (item.kind === "airport") return t.search.airportResults;
  if (item.kind === "ats-point") return t.search.atsPointResults;
  if (item.kind === "flight") return t.search.flightResults;
  return t.commandSearch.smartActions;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<CommandPaletteRecent[]>([]);

  const commands = useMemo<StaticCommand[]>(() => [
    { key: "live", label: t.commandSearch.liveRadar, detail: t.commandSearch.liveRadarDetail, href: "/", icon: "radar", keywords: ["live", "radar", "map"] },
    { key: "today", label: t.commandSearch.today, detail: t.commandSearch.todayDetail, href: "/recap/daily", icon: "time", keywords: ["today", "daily", "recap", "dnes"] },
    { key: "operations", label: t.commandSearch.operationsCenter, detail: t.commandSearch.operationsCenterDetail, href: "/?operations=1", icon: "radar", keywords: ["operations", "now", "events", "události"], action: "operations" },
    { key: "flights", label: t.commandSearch.flights, detail: t.commandSearch.flightsDetail, href: "/flights", icon: "flight", keywords: ["flights", "history", "lety"] },
    { key: "airports", label: t.commandSearch.airports, detail: t.commandSearch.airportsDetail, href: "/airports", icon: "airport", keywords: ["airports", "letiště"] },
    { key: "statistics", label: t.statistics.title, detail: t.commandSearch.statisticsDetail, href: "/statistics", icon: "statistics", keywords: ["statistics", "stats", "statistiky"] },
    { key: "alerts", label: t.alerts.title, detail: t.commandSearch.alertsDetail, href: "/alerts", icon: "system", keywords: ["alerts", "warnings", "alerty"] },
    { key: "time-machine", label: t.timeMachine.title, detail: t.commandSearch.timeMachineDetail, href: "/time-machine", icon: "time", keywords: ["time machine", "history", "replay"] },
    { key: "system", label: t.system.title, detail: t.commandSearch.systemDetail, href: "/system", icon: "system", keywords: ["system", "health", "status"] },
  ], []);

  useEffect(() => {
    try {
      setRecents(parseCommandSearchRecents(window.localStorage.getItem(COMMAND_SEARCH_RECENTS_KEY)));
    } catch {
      setRecents([]);
    }
  }, []);

  useEffect(() => {
    const openPalette = () => setOpen(true);
    const globalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLocaleLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    window.addEventListener("keydown", globalShortcut, true);
    return () => {
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
      window.removeEventListener("keydown", globalShortcut, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
      setLoading(false);
      setRequestFailed(false);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = query.trim();
    if (normalized.length < MIN_GLOBAL_SEARCH_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setRequestFailed(false);
      return;
    }
    const controller = new AbortController();
    setResults(null);
    setLoading(true);
    setRequestFailed(false);
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Command search request failed");
          return await response.json() as GlobalSearchResponse;
        })
        .then((next) => setResults(next))
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
  }, [open, query]);

  const filteredCommands = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return commands;
    return commands.filter((command) =>
      normalize(command.label).includes(normalized)
      || normalize(command.detail).includes(normalized)
      || command.keywords.some((keyword) => normalize(keyword).includes(normalized)));
  }, [commands, query]);

  const resultItems = useMemo<SearchResult[]>(() => [
    ...(results?.actions ?? []),
    ...(results?.aircraft ?? []),
    ...(results?.airports ?? []),
    ...(results?.atsPoints ?? []),
    ...(results?.flights ?? []),
  ], [results]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    if (!query.trim()) {
      return [
        ...recents.map((recent): PaletteItem => ({ type: "recent", recent })),
        ...commands.map((command): PaletteItem => ({ type: "command", command })),
      ];
    }
    return [
      ...filteredCommands.map((command): PaletteItem => ({ type: "command", command })),
      ...resultItems.map((result): PaletteItem => ({ type: "result", result })),
    ];
  }, [commands, filteredCommands, query, recents, resultItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results, open]);

  function saveRecent(recent: CommandPaletteRecent): void {
    const next = addCommandSearchRecent(recents, recent);
    setRecents(next);
    try {
      window.localStorage.setItem(COMMAND_SEARCH_RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Local recents are optional and must never block navigation.
    }
  }

  function navigate(href: string): void {
    setOpen(false);
    router.push(href as Route);
  }

  function choose(item: PaletteItem): void {
    if (item.type === "command") {
      saveRecent({
        key: `command:${item.command.key}`,
        kind: "command",
        label: item.command.label,
        detail: item.command.detail,
        href: item.command.href,
      });
      if (item.command.action === "operations" && pathname === "/") {
        setOpen(false);
        requestOperationsCenterOpen();
        return;
      }
      navigate(item.command.href);
      return;
    }

    if (item.type === "recent") {
      if (item.recent.key === "command:operations" && pathname === "/") {
        setOpen(false);
        requestOperationsCenterOpen();
        return;
      }
      navigate(item.recent.href);
      return;
    }

    const labels = resultLabels(item.result);
    saveRecent({
      key: resultKey(item.result),
      kind: item.result.kind,
      label: labels.label,
      detail: labels.detail || null,
      href: item.result.href,
    });
    navigate(item.result.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!paletteItems.length) return;
      event.preventDefault();
      setActiveIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % paletteItems.length
        : (current - 1 + paletteItems.length) % paletteItems.length);
      return;
    }
    if (event.key === "Enter" && paletteItems[activeIndex]) {
      event.preventDefault();
      choose(paletteItems[activeIndex]!);
    }
  }

  if (!open) return null;

  let cursor = 0;
  const renderCommand = (command: StaticCommand) => {
    const index = cursor++;
    return <button
      type="button"
      key={command.key}
      id={`command-palette-item-${index}`}
      className={`command-palette-item${index === activeIndex ? " active" : ""}`}
      role="option"
      aria-selected={index === activeIndex}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => choose({ type: "command", command })}
    >
      <span className="command-palette-item-icon" aria-hidden="true"><UiIcon name={command.icon} /></span>
      <span className="command-palette-item-copy"><strong>{command.label}</strong><small>{command.detail}</small></span>
      <span className="command-palette-enter" aria-hidden="true">↵</span>
    </button>;
  };
  const renderRecent = (recent: CommandPaletteRecent) => {
    const index = cursor++;
    return <button
      type="button"
      key={recent.key}
      id={`command-palette-item-${index}`}
      className={`command-palette-item${index === activeIndex ? " active" : ""}`}
      role="option"
      aria-selected={index === activeIndex}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => choose({ type: "recent", recent })}
    >
      <span className="command-palette-item-icon command-palette-recent-icon" aria-hidden="true">↺</span>
      <span className="command-palette-item-copy"><strong>{recent.label}</strong>{recent.detail ? <small>{recent.detail}</small> : null}</span>
    </button>;
  };
  const renderResult = (result: SearchResult) => {
    const index = cursor++;
    const labels = resultLabels(result);
    return <button
      type="button"
      key={resultKey(result)}
      id={`command-palette-item-${index}`}
      className={`command-palette-item${index === activeIndex ? " active" : ""}`}
      role="option"
      aria-selected={index === activeIndex}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => choose({ type: "result", result })}
    >
      <span className="command-palette-item-icon" aria-hidden="true"><UiIcon name={resultIcon(result)} /></span>
      <span className="command-palette-item-copy"><strong>{labels.label}</strong><small>{labels.detail}</small></span>
      <span className="command-palette-result-kind">{resultKindLabel(result)}</span>
    </button>;
  };

  const activeId = paletteItems.length ? `command-palette-item-${Math.min(activeIndex, paletteItems.length - 1)}` : undefined;
  const emptySearch = query.trim().length >= MIN_GLOBAL_SEARCH_QUERY_LENGTH
    && !loading && !requestFailed && filteredCommands.length === 0 && resultItems.length === 0;

  return <div
    className="command-palette-backdrop"
    data-testid="command-palette"
    onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
  >
    <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <header className="command-palette-header">
        <span className="command-palette-search-icon" aria-hidden="true"><UiIcon name="search" /></span>
        <label className="sr-only" htmlFor="command-palette-input" id="command-palette-title">{t.commandSearch.title}</label>
        <input
          ref={inputRef}
          id="command-palette-input"
          value={query}
          maxLength={MAX_GLOBAL_SEARCH_QUERY_LENGTH}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.commandSearch.placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="command-palette-results"
          aria-expanded="true"
          aria-activedescendant={activeId}
        />
        <kbd>Esc</kbd>
      </header>

      <div id="command-palette-results" className="command-palette-results" role="listbox">
        {!query.trim() && recents.length > 0 ? <section className="command-palette-group" aria-label={t.commandSearch.recent}>
          <div className="command-palette-group-title">{t.commandSearch.recent}</div>
          {recents.map(renderRecent)}
        </section> : null}

        {filteredCommands.length > 0 ? <section className="command-palette-group" aria-label={t.commandSearch.commands}>
          <div className="command-palette-group-title">{t.commandSearch.commands}</div>
          {filteredCommands.map(renderCommand)}
        </section> : null}

        {query.trim().length >= MIN_GLOBAL_SEARCH_QUERY_LENGTH ? <>
          {loading ? <div className="command-palette-status">{t.search.loading}</div> : null}
          {requestFailed ? <div className="command-palette-status">{t.search.requestFailed}</div> : null}
          {!loading && !requestFailed && results?.actions.length ? <section className="command-palette-group" aria-label={t.commandSearch.smartActions}>
            <div className="command-palette-group-title">{t.commandSearch.smartActions}</div>
            {results.actions.map(renderResult)}
          </section> : null}
          {!loading && !requestFailed && results?.aircraft.length ? <section className="command-palette-group" aria-label={t.search.aircraftResults}>
            <div className="command-palette-group-title">{t.search.aircraftResults}</div>
            {results.aircraft.map(renderResult)}
          </section> : null}
          {!loading && !requestFailed && results?.airports.length ? <section className="command-palette-group" aria-label={t.search.airportResults}>
            <div className="command-palette-group-title">{t.search.airportResults}</div>
            {results.airports.map(renderResult)}
          </section> : null}
          {!loading && !requestFailed && results?.atsPoints.length ? <section className="command-palette-group" aria-label={t.search.atsPointResults}>
            <div className="command-palette-group-title">{t.search.atsPointResults}</div>
            {results.atsPoints.map(renderResult)}
          </section> : null}
          {!loading && !requestFailed && results?.flights.length ? <section className="command-palette-group" aria-label={t.search.flightResults}>
            <div className="command-palette-group-title">{t.search.flightResults}</div>
            {results.flights.map(renderResult)}
          </section> : null}
          {emptySearch ? <div className="command-palette-status">{t.search.noResults}</div> : null}
        </> : null}
      </div>

      <footer className="command-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> {t.commandSearch.navigate}</span>
        <span><kbd>↵</kbd> {t.commandSearch.open}</span>
        <span><kbd>Esc</kbd> {t.commandSearch.close}</span>
        <span className="command-palette-shortcut">{t.commandSearch.shortcut}</span>
      </footer>
    </section>
  </div>;
}
