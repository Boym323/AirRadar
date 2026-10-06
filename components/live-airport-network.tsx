"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicAircraft, PublicStateSnapshot } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { AirportTrafficObservation } from "@/lib/airport-traffic/live";
import { nearbyAirportAircraft } from "@/lib/airport-traffic/live";
import {
  buildAirportCorrelatedTrafficSnapshot,
  buildAirportFlowPressureSummary,
  buildAirportJourneyFlowSummary,
  buildAirportRunwayFlowIntelligence,
} from "@/lib/airport-intelligence/v3";
import { buildAirportArrivalSequence } from "@/lib/airport-intelligence/arrival-sequence-v7";
import { buildAirportArrivalFlowIntelligence, type AirportApproachQueueState } from "@/lib/airport-intelligence/arrival-flow-v8";
import { AIRPORT_LIVE_BOARD_REFRESH_MS } from "@/components/airport-operations-controller";
import { useFavoriteAirports } from "@/components/pwa-register";
import { ContextBadge, EmptyState, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { formatNumber, formatTime, t } from "@/lib/i18n";
import styles from "./live-airport-network.module.css";

const NETWORK_LIMIT = 6;

type RouteActivity = {
  inbound: number;
  outbound: number;
  total: number;
};

type AirportNetworkSummary = {
  airport: Airport;
  favorite: boolean;
  routeActivity: RouteActivity;
  operations: AirportOperationsResponse | null;
  operationsFailed: boolean;
  queue: {
    state: AirportApproachQueueState;
    approachOrFinal: number;
    holding: number;
  } | null;
};

function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{3,4}$/.test(normalized) ? normalized : null;
}

function airportIdentifierMap(airports: readonly Airport[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const airport of airports) {
    map.set(airport.icaoCode.trim().toUpperCase(), airport.icaoCode.trim().toUpperCase());
    const iata = normalizeIdentifier(airport.iataCode);
    if (iata) map.set(iata, airport.icaoCode.trim().toUpperCase());
  }
  return map;
}

function routeActivityForAircraft(
  aircraft: readonly PublicAircraft[],
  identifiers: ReadonlyMap<string, string>,
): Map<string, RouteActivity> {
  const result = new Map<string, RouteActivity>();
  const add = (raw: string | null | undefined, direction: "inbound" | "outbound") => {
    const identifier = normalizeIdentifier(raw);
    const icao = identifier ? identifiers.get(identifier) : null;
    if (!icao) return;
    const current = result.get(icao) ?? { inbound: 0, outbound: 0, total: 0 };
    current[direction] += 1;
    current.total += 1;
    result.set(icao, current);
  };

  for (const item of aircraft) {
    add(item.enrichment?.route?.origin, "outbound");
    add(item.enrichment?.route?.destination, "inbound");
  }
  return result;
}

function uniqueFlightCount(movements: readonly { flightId: number }[]): number {
  return new Set(movements.map((movement) => movement.flightId)).size;
}

function activityVariant(
  activity: AirportOperationsResponse["activity"] | null | undefined,
): "neutral" | "success" | "live" | "warning" {
  if (activity === "BUSY") return "warning";
  if (activity === "MODERATE") return "live";
  if (activity === "LIGHT") return "success";
  return "neutral";
}

function activityLabel(activity: AirportOperationsResponse["activity"] | null | undefined): string {
  if (!activity) return t.browse.networkNoOperations;
  return {
    QUIET: t.airport.operationalQuiet,
    LIGHT: t.airport.operationalLight,
    MODERATE: t.airport.operationalModerate,
    BUSY: t.airport.operationalBusy,
  }[activity];
}

function queueLabel(state: AirportApproachQueueState): string {
  return {
    EMPTY: t.airport.liveBoardV8QueueEmpty,
    LOW_DENSITY: t.airport.liveBoardV8QueueLowDensity,
    ACTIVE: t.airport.liveBoardV8QueueActive,
    BUILDING: t.airport.liveBoardV8QueueBuilding,
    COMPRESSED: t.airport.liveBoardV8QueueCompressed,
    HOLDING_PRESENT: t.airport.liveBoardV8QueueHoldingPresent,
  }[state];
}

export function LiveAirportNetwork({
  airports,
  loading,
}: {
  airports: readonly Airport[];
  loading: boolean;
}) {
  const [favorites, toggleFavorite] = useFavoriteAirports();
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [operations, setOperations] = useState<Record<string, AirportOperationsResponse | null>>({});
  const [failedOperations, setFailedOperations] = useState<Set<string>>(new Set());
  const [observations, setObservations] = useState<Record<string, AirportTrafficObservation[]>>({});
  const previousDistances = useRef(new Map<string, Map<string, number>>());

  useEffect(() => {
    let active = true;
    const source = new EventSource("/api/stream?coverage=local");
    source.addEventListener("snapshot", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        if (!active) return;
        setSnapshot(next);
        setStreamConnected(true);
      } catch {
        // Keep the last valid snapshot.
      }
    });
    source.onopen = () => { if (active) setStreamConnected(true); };
    source.onerror = () => { if (active) setStreamConnected(false); };
    return () => {
      active = false;
      source.close();
    };
  }, []);

  const byIcao = useMemo(
    () => new Map(airports.map((airport) => [airport.icaoCode.trim().toUpperCase(), airport])),
    [airports],
  );
  const identifiers = useMemo(() => airportIdentifierMap(airports), [airports]);
  const routeActivity = useMemo(
    () => routeActivityForAircraft(snapshot?.aircraft ?? [], identifiers),
    [identifiers, snapshot],
  );

  const selectedAirports = useMemo(() => {
    const selected: Airport[] = [];
    const seen = new Set<string>();

    for (const code of favorites) {
      const airport = byIcao.get(code);
      if (!airport || seen.has(code)) continue;
      selected.push(airport);
      seen.add(code);
      if (selected.length >= NETWORK_LIMIT) return selected;
    }

    const liveCodes = [...routeActivity.entries()]
      .sort((left, right) =>
        right[1].total - left[1].total
        || right[1].inbound - left[1].inbound
        || left[0].localeCompare(right[0]))
      .map(([icao]) => icao);

    for (const code of liveCodes) {
      const airport = byIcao.get(code);
      if (!airport || seen.has(code)) continue;
      selected.push(airport);
      seen.add(code);
      if (selected.length >= NETWORK_LIMIT) break;
    }
    return selected;
  }, [byIcao, favorites, routeActivity]);

  const selectedKey = selectedAirports.map((airport) => airport.icaoCode).join(",");

  useEffect(() => {
    if (!snapshot || !selectedKey) {
      setObservations({});
      return;
    }
    const now = Date.parse(snapshot.fetchedAt);
    const next: Record<string, AirportTrafficObservation[]> = {};
    for (const icao of selectedKey.split(",").filter(Boolean)) {
      const airport = byIcao.get(icao);
      if (!airport) continue;
      const previous = previousDistances.current.get(icao) ?? new Map<string, number>();
      const current = nearbyAirportAircraft(
        snapshot.aircraft,
        airport,
        previous,
        Number.isFinite(now) ? now : Date.now(),
      );
      previousDistances.current.set(
        icao,
        new Map(current.map((item) => [item.aircraft.icaoHex, item.distanceKm])),
      );
      next[icao] = current;
    }
    setObservations(next);
  }, [byIcao, selectedKey, snapshot]);

  useEffect(() => {
    if (!selectedKey) {
      setOperations({});
      setFailedOperations(new Set());
      return;
    }

    let active = true;
    let controller = new AbortController();
    const codes = selectedKey.split(",").filter(Boolean);

    const load = async () => {
      controller.abort();
      controller = new AbortController();
      const results = await Promise.all(codes.map(async (icao) => {
        try {
          const response = await fetch(
            "/api/airports/" + encodeURIComponent(icao) + "/operations?period=24h",
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error("airport operations request failed");
          return { icao, value: await response.json() as AirportOperationsResponse, failed: false };
        } catch (error) {
          if ((error as Error).name === "AbortError") return null;
          return { icao, value: null, failed: true };
        }
      }));

      if (!active) return;
      const next: Record<string, AirportOperationsResponse | null> = {};
      const failed = new Set<string>();
      for (const result of results) {
        if (!result) continue;
        next[result.icao] = result.value;
        if (result.failed) failed.add(result.icao);
      }
      setOperations(next);
      setFailedOperations(failed);
    };

    void load();
    const timer = window.setInterval(() => void load(), AIRPORT_LIVE_BOARD_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      controller.abort();
    };
  }, [selectedKey]);

  const summaries = useMemo<AirportNetworkSummary[]>(() => selectedAirports.map((airport) => {
    const icao = airport.icaoCode.trim().toUpperCase();
    const airportOperations = operations[icao] ?? null;
    const airportObservations = observations[icao] ?? [];
    let queue: AirportNetworkSummary["queue"] = null;

    if (airportOperations) {
      const correlated = buildAirportCorrelatedTrafficSnapshot(airportObservations, airportOperations);
      const flow = buildAirportJourneyFlowSummary(correlated);
      const pressure = buildAirportFlowPressureSummary(flow, airportOperations);
      const runwayFlow = buildAirportRunwayFlowIntelligence(airportOperations, null);
      const sequence = buildAirportArrivalSequence({
        airportIcao: icao,
        traffic: correlated,
        predictive: null,
      });
      const arrivalFlow = buildAirportArrivalFlowIntelligence({
        sequence,
        flowPressure: pressure,
        runwayFlow,
        referenceTime: airportOperations.generatedAt,
      });
      queue = arrivalFlow.queue;
    }

    return {
      airport,
      favorite: favorites.includes(icao),
      routeActivity: routeActivity.get(icao) ?? { inbound: 0, outbound: 0, total: 0 },
      operations: airportOperations,
      operationsFailed: failedOperations.has(icao),
      queue,
    };
  }), [failedOperations, favorites, observations, operations, routeActivity, selectedAirports]);

  return (
    <Panel className={styles.panel} data-testid="live-airport-network-v1">
      <SectionHeader
        kicker={t.browse.networkKicker}
        title={t.browse.networkTitle}
        description={t.browse.networkDescription}
        actions={
          <div className={styles.liveState}>
            <StatusBadge variant={streamConnected ? "live" : "stale"}>
              {streamConnected ? t.browse.networkLive : t.browse.networkReconnecting}
            </StatusBadge>
            {snapshot?.fetchedAt ? <span>{formatTime(snapshot.fetchedAt)}</span> : null}
          </div>
        }
      />

      {loading ? (
        <EmptyState title={t.common.loading} description={t.browse.networkLoadingCatalog} />
      ) : summaries.length === 0 ? (
        <EmptyState
          title={t.browse.networkEmpty}
          description={t.browse.networkEmptyDescription}
        />
      ) : (
        <div className={styles.grid}>
          {summaries.map(({ airport, favorite, routeActivity: route, operations: airportOperations, operationsFailed, queue }) => {
            const icao = airport.icaoCode.trim().toUpperCase();
            const nextArrival = airportOperations?.terminalDemandHorizon?.items
              .find((item) => item.etaMinutes !== null) ?? null;
            return (
              <article className={styles.card} key={icao} data-testid={"live-airport-card-" + icao}>
                <div className={styles.cardTop}>
                  <div className={styles.identity}>
                    <span className={styles.codes}>
                      <strong>{icao}</strong>
                      <small>{airport.iataCode || t.common.emptyValue}</small>
                    </span>
                    <span className={styles.location}>
                      <strong>{airport.name}</strong>
                      <small>{[airport.city, airport.country].filter(Boolean).join(" · ") || t.common.emptyValue}</small>
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.favorite}
                    onClick={() => toggleFavorite(icao)}
                    aria-pressed={favorite}
                    aria-label={favorite ? t.pwa.favoriteRemove : t.pwa.favoriteAdd}
                    title={favorite ? t.pwa.favoriteRemove : t.pwa.favoriteAdd}
                  >
                    {favorite ? "★" : "☆"}
                  </button>
                </div>

                <div className={styles.statusRow}>
                  <StatusBadge variant={activityVariant(airportOperations?.activity)}>
                    {operationsFailed ? t.browse.networkUnavailable : activityLabel(airportOperations?.activity)}
                  </StatusBadge>
                  {route.total > 0 ? (
                    <span className={styles.routeCount}>
                      {t.browse.networkLiveRoutes}: {formatNumber(route.total)}
                    </span>
                  ) : null}
                </div>

                <div className={styles.metrics}>
                  <div>
                    <small>{t.browse.networkArrivals}</small>
                    <strong>{airportOperations ? formatNumber(uniqueFlightCount(airportOperations.arrivals)) : t.common.emptyValue}</strong>
                  </div>
                  <div>
                    <small>{t.browse.networkDepartures}</small>
                    <strong>{airportOperations ? formatNumber(uniqueFlightCount(airportOperations.departures)) : t.common.emptyValue}</strong>
                  </div>
                  <div>
                    <small>{t.browse.networkRunway}</small>
                    <strong>{airportOperations?.likelyRunway ? "RWY " + airportOperations.likelyRunway.designator : t.common.emptyValue}</strong>
                  </div>
                  <div>
                    <small>{t.browse.networkQueue}</small>
                    <strong>{queue ? queueLabel(queue.state) : t.common.emptyValue}</strong>
                    {queue && queue.approachOrFinal > 0 ? (
                      <span>{t.browse.networkQueueAircraft(queue.approachOrFinal)}</span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.nextArrival}>
                  <span>
                    <small>{t.browse.networkNextArrival}</small>
                    <strong>
                      {nextArrival
                        ? nextArrival.label + " · ~" + formatNumber(nextArrival.etaMinutes ?? 0, 0) + " min"
                        : t.browse.networkNoInbound}
                    </strong>
                  </span>
                  {nextArrival ? <ContextBadge variant="inferred">{t.operations.inferred}</ContextBadge> : null}
                </div>

                <div className={styles.footer}>
                  <span>
                    {t.browse.networkRouteFlow(route.inbound, route.outbound)}
                  </span>
                  <Link
                    className={styles.openBoard}
                    href={{ pathname: "/airports/" + encodeURIComponent(icao) }}
                  >
                    {t.browse.networkOpenBoard} →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className={styles.disclaimer}>{t.browse.networkDisclaimer}</p>
    </Panel>
  );
}
