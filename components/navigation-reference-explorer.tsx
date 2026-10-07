"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import { formatNumber, t } from "@/lib/i18n";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./navigation-reference-explorer.module.css";

interface NavLookupResponse {
  enabled?: boolean;
  available?: boolean;
  points?: AviationNavPoint[];
  source?: string;
  truncated?: boolean;
}

interface AtsRoutePoint {
  id: string;
  name: string;
  kind: "DESIGNATED_POINT" | "NAVAID";
  latitude: number;
  longitude: number;
}

interface AtsRoute {
  designator: string;
  points: AtsRoutePoint[];
}

interface AtsRoutesResponse {
  available?: boolean;
  routes?: AtsRoute[];
  source?: {
    name?: string;
    reference?: string;
    effectiveDate?: string;
  };
}

const MAX_NEARBY = 12;
const MAX_ROUTES = 24;

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

function validIdentifier(value: string): boolean {
  return /^[A-Z0-9]{2,8}$/.test(value);
}

function pointKey(point: AviationNavPoint): string {
  return `${point.kind}:${point.id}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
}

function radarHref(point: AviationNavPoint): string {
  const focus = `${point.kind}:${point.id}:${point.latitude}:${point.longitude}`;
  return `/?navPoint=${encodeURIComponent(focus)}`;
}

function coordinate(value: number): string {
  return new Intl.NumberFormat(t.locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

function detail(point: AviationNavPoint): string {
  return [
    point.type,
    point.frequencyMhz !== null ? `${point.frequencyMhz.toFixed(3)} MHz` : null,
    point.elevationFt !== null ? `${formatNumber(point.elevationFt)} ft` : null,
    point.country,
  ].filter(Boolean).join(" · ");
}

export function NavigationReferenceExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Navigační reference",
    subtitle: "Bounded NAVAID/FIX lookup nad Aviation Weather Center s odděleným kontextem publikovaných ATS tras.",
    back: "Zpět na radar",
    search: "Vyhledat identifikátor",
    placeholder: "např. VLM",
    searchAction: "Hledat",
    invalid: "Zadej 2–8 znakový identifikátor A–Z / 0–9.",
    matches: "Nalezené reference",
    nearby: "Body do 25 NM",
    routes: "Publikované ATS trasy",
    source: "Zdroj",
    results: "Reference",
    resultsDescription: "Přesná shoda identifikátoru z existujícího bounded navigation API.",
    nearbyTitle: "Okolní navigační body",
    nearbyDescription: "Maximálně 12 bodů z bounded 25 NM dotazu kolem první nalezené reference.",
    atsTitle: "ATS route context",
    atsDescription: "Publikované CZ/SK/AT ATS trasy, které obsahují nalezený identifikátor. Jde o samostatný publikovaný zdroj.",
    showRadar: "Zobrazit na radaru",
    loading: "Načítám navigační reference…",
    unavailable: "Navigační reference jsou dočasně nedostupné.",
    atsUnavailable: "ATS route dataset je dočasně nedostupný.",
    empty: "Pro tento identifikátor nebyla nalezena žádná reference.",
    noNearby: "V bounded 25 NM odpovědi nejsou další body.",
    noRoutes: "Nalezený identifikátor není v publikovaném ATS route datasetu.",
    disclosure: "AWC NAVAID/FIX reference jsou globální pomocná navigační data. Publikované ATS trasy z eAIP zůstávají samostatnou autoritativní vrstvou; AirRadar tyto zdroje neslučuje do nové autority ani z nich neinferuje letovou trasu.",
  } : {
    title: "Navigation Reference",
    subtitle: "Bounded NAVAID/FIX lookup from Aviation Weather Center with separate published ATS route context.",
    back: "Back to radar",
    search: "Search identifier",
    placeholder: "e.g. VLM",
    searchAction: "Search",
    invalid: "Enter a 2–8 character A–Z / 0–9 identifier.",
    matches: "Reference matches",
    nearby: "Points within 25 NM",
    routes: "Published ATS routes",
    source: "Source",
    results: "References",
    resultsDescription: "Exact identifier matches from the existing bounded navigation API.",
    nearbyTitle: "Nearby navigation points",
    nearbyDescription: "At most 12 points from a bounded 25 NM query around the first matched reference.",
    atsTitle: "ATS route context",
    atsDescription: "Published CZ/SK/AT ATS routes containing the matched identifier. This is an independent published source.",
    showRadar: "Show on radar",
    loading: "Loading navigation references…",
    unavailable: "Navigation references are temporarily unavailable.",
    atsUnavailable: "The ATS route dataset is temporarily unavailable.",
    empty: "No navigation reference was found for this identifier.",
    noNearby: "No additional points are present in the bounded 25 NM response.",
    noRoutes: "The matched identifier is not present in the published ATS route dataset.",
    disclosure: "AWC NAVAID/FIX references are global supporting navigation data. Published eAIP ATS routes remain a separate authoritative layer; AirRadar does not merge these sources into a new authority or infer a filed route from them.",
  };

  const [input, setInput] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [points, setPoints] = useState<AviationNavPoint[]>([]);
  const [nearby, setNearby] = useState<AviationNavPoint[]>([]);
  const [ats, setAts] = useState<AtsRoutesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [navFailed, setNavFailed] = useState(false);
  const [atsFailed, setAtsFailed] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const routeMatches = useMemo(() => {
    if (!ats?.routes?.length || !points.length) return [];
    const ids = new Set(points.map((point) => normalizeIdentifier(point.id)));
    return ats.routes.filter((route) => route.points.some((point) => {
      return ids.has(normalizeIdentifier(point.id)) || ids.has(normalizeIdentifier(point.name));
    })).slice(0, MAX_ROUTES);
  }, [ats?.routes, points]);

  async function search(identifier: string): Promise<void> {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setNavFailed(false);
    setAtsFailed(false);
    setPoints([]);
    setNearby([]);
    setAts(null);

    const [navResult, atsResult] = await Promise.allSettled([
      fetch(`/api/navigation/data?ids=${encodeURIComponent(identifier)}&kinds=NAVAID,FIX`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("navigation lookup unavailable");
        return response.json() as Promise<NavLookupResponse>;
      }),
      fetch("/api/ats/routes", {
        cache: "force-cache",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("ATS routes unavailable");
        return response.json() as Promise<AtsRoutesResponse>;
      }),
    ]);

    if (controller.signal.aborted) return;

    let matched: AviationNavPoint[] = [];
    if (navResult.status === "fulfilled") {
      matched = Array.isArray(navResult.value.points) ? navResult.value.points : [];
      setPoints(matched);
    } else {
      setNavFailed(true);
    }

    if (atsResult.status === "fulfilled") setAts(atsResult.value);
    else setAtsFailed(true);

    const anchor = matched[0];
    if (anchor) {
      try {
        const response = await fetch(
          `/api/navigation/data?lat=${encodeURIComponent(String(anchor.latitude))}&lon=${encodeURIComponent(String(anchor.longitude))}&radiusNm=25&kinds=NAVAID,FIX`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const payload = await response.json() as NavLookupResponse;
          const anchorKey = pointKey(anchor);
          setNearby((payload.points ?? []).filter((point) => pointKey(point) !== anchorKey).slice(0, MAX_NEARBY));
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }

    if (!controller.signal.aborted) setLoading(false);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const identifier = normalizeIdentifier(input);
    if (!validIdentifier(identifier)) {
      setValidation(copy.invalid);
      return;
    }
    setValidation(null);
    setInput(identifier);
    setSearchedId(identifier);
    window.history.replaceState(null, "", `/navigation?id=${encodeURIComponent(identifier)}`);
    void search(identifier);
  }

  return (
    <main className={styles.page} data-testid="navigation-reference-explorer-v1">
      <PageHeader
        kicker="AIRRADAR · NAVIGATION"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
      />

      <Panel className={styles.searchPanel}>
        <form className={styles.searchForm} onSubmit={submit}>
          <label htmlFor="navigation-reference-id">{copy.search}</label>
          <div className={styles.searchRow}>
            <input
              id="navigation-reference-id"
              value={input}
              onChange={(event) => setInput(event.target.value.toUpperCase())}
              placeholder={copy.placeholder}
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading}>{copy.searchAction}</button>
          </div>
          {validation ? <p className={styles.validation}>{validation}</p> : null}
        </form>
      </Panel>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={searchedId ?? "—"} label="ID" />
        <MetricCard value={searchedId ? formatNumber(points.length) : "—"} label={copy.matches} />
        <MetricCard value={searchedId ? formatNumber(nearby.length) : "—"} label={copy.nearby} detail="≤ 12" />
        <MetricCard value={searchedId ? formatNumber(routeMatches.length) : "—"} label={copy.routes} detail="≤ 24" />
      </MetricStrip>

      <div className={styles.grid}>
        <Panel>
          <SectionHeader
            kicker="AWC NAVAID / FIX"
            title={copy.results}
            description={copy.resultsDescription}
            actions={<StatusBadge variant={navFailed ? "warning" : points.length ? "success" : "neutral"}>{navFailed ? "UNAVAILABLE" : loading ? "LOADING" : "BOUNDED"}</StatusBadge>}
          />
          {loading && !points.length && !navFailed ? <p className={styles.status}>{copy.loading}</p> : navFailed ? (
            <EmptyState title={copy.unavailable} />
          ) : searchedId && points.length ? (
            <div className={styles.pointList}>
              {points.map((point) => (
                <article key={pointKey(point)}>
                  <div className={styles.pointHead}>
                    <div>
                      <strong>{point.id}</strong>
                      <span>{point.kind}{point.name ? ` · ${point.name}` : ""}</span>
                    </div>
                    <StatusBadge variant={point.kind === "NAVAID" ? "success" : "neutral"}>{point.type ?? point.kind}</StatusBadge>
                  </div>
                  <p>{coordinate(point.latitude)}, {coordinate(point.longitude)}</p>
                  <small>{detail(point) || "—"} · {point.source}</small>
                  <Link href={radarHref(point)}>{copy.showRadar}</Link>
                </article>
              ))}
            </div>
          ) : searchedId ? <EmptyState title={copy.empty} /> : <EmptyState title={copy.search} description={copy.placeholder} />}
        </Panel>

        <Panel>
          <SectionHeader kicker="25 NM" title={copy.nearbyTitle} description={copy.nearbyDescription} />
          {nearby.length ? (
            <div className={styles.compactList}>
              {nearby.map((point) => (
                <Link key={pointKey(point)} href={radarHref(point)}>
                  <span><strong>{point.id}</strong><small>{point.kind} · {point.type ?? "—"}</small></span>
                  <span>{coordinate(point.latitude)}, {coordinate(point.longitude)}</span>
                </Link>
              ))}
            </div>
          ) : <EmptyState title={searchedId ? copy.noNearby : copy.search} />}
        </Panel>

        <Panel className={styles.full}>
          <SectionHeader
            kicker="PUBLISHED eAIP"
            title={copy.atsTitle}
            description={copy.atsDescription}
            actions={<StatusBadge variant={atsFailed ? "warning" : ats?.available ? "success" : "neutral"}>{atsFailed ? "UNAVAILABLE" : ats?.available ? "PUBLISHED" : "—"}</StatusBadge>}
          />
          {atsFailed ? <EmptyState title={copy.atsUnavailable} /> : routeMatches.length ? (
            <>
              <div className={styles.routeList}>
                {routeMatches.map((route) => (
                  <div key={route.designator}>
                    <strong>{route.designator}</strong>
                    <span>{route.points.filter((point) => points.some((nav) => normalizeIdentifier(nav.id) === normalizeIdentifier(point.id) || normalizeIdentifier(nav.id) === normalizeIdentifier(point.name))).map((point) => point.name).join(", ")}</span>
                    <small>{formatNumber(route.points.length)} points</small>
                  </div>
                ))}
              </div>
              {ats?.source ? <p className={styles.source}>{copy.source}: {ats.source.name ?? "eAIP"}{ats.source.effectiveDate ? ` · ${ats.source.effectiveDate}` : ""}{ats.source.reference ? ` · ${ats.source.reference}` : ""}</p> : null}
            </>
          ) : <EmptyState title={searchedId ? copy.noRoutes : copy.search} />}
        </Panel>
      </div>

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
