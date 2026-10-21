"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import {
  analyzePublishedRoute,
  getRouteIntelligenceUpdateSnapshot,
  subscribeRouteIntelligenceUpdates,
  toRouteIntelligenceViewDTO,
  type DynamicRouteState,
  type RouteIntelligenceViewDTO,
} from "@/lib/route-intelligence";

const MAX_ROUTE_REFERENCE_IDS = 24;

interface IdentifierLookupResponse {
  enabled?: boolean;
  available?: boolean;
  points?: AviationNavPoint[];
}

export interface SelectedRouteState {
  route: RouteIntelligenceViewDTO | null;
  referenceLoading: boolean;
  referencePointCount: number;
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function routeReferenceIdentifiers(aircraft: AircraftView | null): string[] {
  const plan = aircraft?.enrichment?.flightPlan;
  if (!plan) return [];
  const text = plan.filedRoute?.trim() || plan.waypoints.join(" ");
  if (!text.trim()) return [];
  const origin = normalized(aircraft?.enrichment?.route?.origin);
  const destination = normalized(aircraft?.enrichment?.route?.destination);
  const ids = text.split(/\s+/)
    .map((token) => token.trim().toUpperCase().replace(/^[,;]+|[,;]+$/g, ""))
    .filter((token) => /^[A-Z0-9]{2,8}$/.test(token))
    .filter((token) => token !== "DCT" && token !== origin && token !== destination)
    .filter((token) => !/^[A-Z][0-9]{1,3}[A-Z]?$/.test(token));
  return [...new Set(ids)].slice(0, MAX_ROUTE_REFERENCE_IDS);
}

function validPoints(value: unknown): AviationNavPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((point): point is AviationNavPoint => {
    if (!point || typeof point !== "object") return false;
    const candidate = point as Partial<AviationNavPoint>;
    return (candidate.kind === "NAVAID" || candidate.kind === "FIX")
      && typeof candidate.id === "string"
      && typeof candidate.latitude === "number"
      && Number.isFinite(candidate.latitude)
      && typeof candidate.longitude === "number"
      && Number.isFinite(candidate.longitude);
  }).slice(0, MAX_ROUTE_REFERENCE_IDS * 4);
}

export function useSelectedRoute(aircraft: AircraftView | null): SelectedRouteState {
  const atsVersion = useSyncExternalStore(
    subscribeRouteIntelligenceUpdates,
    getRouteIntelligenceUpdateSnapshot,
    () => 0,
  );
  const identifiers = useMemo(() => routeReferenceIdentifiers(aircraft), [aircraft]);
  const identifierKey = identifiers.join(",");
  const [referenceSnapshot, setReferenceSnapshot] = useState<{ key: string; points: AviationNavPoint[] }>({ key: "", points: [] });
  const [referenceLoading, setReferenceLoading] = useState(false);
  const referencePoints = referenceSnapshot.key === identifierKey ? referenceSnapshot.points : [];
  const previousDynamicRef = useRef<DynamicRouteState | null>(null);
  const routeIdentityRef = useRef("");

  useEffect(() => {
    const routeIdentity = `${aircraft?.icaoHex ?? ""}|${aircraft?.enrichment?.flightPlan?.filedRoute ?? aircraft?.enrichment?.flightPlan?.waypoints.join(" ") ?? ""}`;
    if (routeIdentityRef.current === routeIdentity) return;
    routeIdentityRef.current = routeIdentity;
    previousDynamicRef.current = null;
  }, [aircraft?.icaoHex, aircraft?.enrichment?.flightPlan?.filedRoute, aircraft?.enrichment?.flightPlan?.waypoints]);

  useEffect(() => {
    const controller = new AbortController();
    if (!identifierKey) {
      setReferenceSnapshot({ key: "", points: [] });
      setReferenceLoading(false);
      return () => controller.abort();
    }
    setReferenceLoading(true);
    void fetch(`/api/navigation/data?ids=${encodeURIComponent(identifierKey)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as IdentifierLookupResponse;
      })
      .then((response) => {
        if (!response?.available) return;
        setReferenceSnapshot({ key: identifierKey, points: validPoints(response.points) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setReferenceLoading(false);
      });
    return () => controller.abort();
  }, [identifierKey]);

  const analysis = useMemo(() => {
    // Keep ATS store invalidation as an explicit dependency of this memo.
    void atsVersion;
    const enrichment = aircraft?.enrichment;
    const plan = enrichment?.flightPlan;
    if (!aircraft || !enrichment || (!plan?.filedRoute && !plan?.waypoints.length)) return null;
    return analyzePublishedRoute({
      aircraftRoute: enrichment,
      atsNetwork: null,
      aircraftPosition: {
        lat: aircraft.lat,
        lon: aircraft.lon,
        track: aircraft.track,
      },
      referencePoints,
      previousDynamicState: previousDynamicRef.current,
    });
  }, [
    aircraft,
    referencePoints,
    atsVersion,
  ]);

  // R11 only: preserve the route matcher progress across successive positions.
  // P05/P06 deviation classification and prediction trackers are intentionally retired.
  useEffect(() => {
    if (analysis?.v2 && aircraft && Number.isFinite(Date.parse(aircraft.lastSeen))) {
      previousDynamicRef.current = analysis.v2.dynamic;
    }
  }, [analysis, aircraft]);

  return {
    route: analysis ? toRouteIntelligenceViewDTO(analysis, aircraft?.enrichment?.route ?? null) : null,
    referenceLoading,
    referencePointCount: referencePoints.length,
  };
}
