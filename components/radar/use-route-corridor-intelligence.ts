"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import {
  analyzePublishedRoute,
  buildRouteCorridorIntelligence,
  buildTrajectoryConformance,
  getRouteIntelligenceUpdateSnapshot,
  subscribeRouteIntelligenceUpdates,
  toRouteIntelligenceViewDTO,
  type DynamicRouteState,
  type RouteCorridorSnapshot,
  type RouteCorridorTrackerState,
  type RouteIntelligenceViewDTO,
  type TrajectoryConformanceCounters,
  type TrajectoryConformanceSnapshot,
  type TrajectoryConformanceTrackerState,
} from "@/lib/route-intelligence";

const MAX_ROUTE_REFERENCE_IDS = 24;

interface IdentifierLookupResponse {
  enabled?: boolean;
  available?: boolean;
  points?: AviationNavPoint[];
}

export interface SelectedRouteCorridorState {
  route: RouteIntelligenceViewDTO | null;
  corridor: RouteCorridorSnapshot | null;
  conformance: TrajectoryConformanceSnapshot | null;
  conformanceDiagnostics: TrajectoryConformanceCounters | null;
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

export function useRouteCorridorIntelligence(aircraft: AircraftView | null): SelectedRouteCorridorState {
  const atsVersion = useSyncExternalStore(
    subscribeRouteIntelligenceUpdates,
    getRouteIntelligenceUpdateSnapshot,
    () => 0,
  );
  const identifiers = useMemo(() => routeReferenceIdentifiers(aircraft), [
    aircraft?.icaoHex,
    aircraft?.enrichment?.flightPlan?.filedRoute,
    aircraft?.enrichment?.flightPlan?.waypoints,
    aircraft?.enrichment?.route?.origin,
    aircraft?.enrichment?.route?.destination,
  ]);
  const identifierKey = identifiers.join(",");
  const [referenceSnapshot, setReferenceSnapshot] = useState<{ key: string; points: AviationNavPoint[] }>({ key: "", points: [] });
  const [referenceLoading, setReferenceLoading] = useState(false);
  const referencePoints = referenceSnapshot.key === identifierKey ? referenceSnapshot.points : [];
  const previousDynamicRef = useRef<DynamicRouteState | null>(null);
  const trackerRef = useRef<RouteCorridorTrackerState | null>(null);
  const conformanceTrackerRef = useRef<TrajectoryConformanceTrackerState | null>(null);
  const routeIdentityRef = useRef("");

  useEffect(() => {
    const routeIdentity = `${aircraft?.icaoHex ?? ""}|${aircraft?.enrichment?.flightPlan?.filedRoute ?? aircraft?.enrichment?.flightPlan?.waypoints.join(" ") ?? ""}`;
    if (routeIdentityRef.current === routeIdentity) return;
    routeIdentityRef.current = routeIdentity;
    previousDynamicRef.current = null;
    trackerRef.current = null;
    conformanceTrackerRef.current = null;
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

  const observedAt = aircraft ? Date.parse(aircraft.lastSeen) : NaN;
  const corridorResult = useMemo(() => {
    if (!analysis?.v2 || !aircraft || !Number.isFinite(observedAt)) return null;
    return buildRouteCorridorIntelligence(analysis.v2, {
      observedAt,
      lat: aircraft.lat,
      lon: aircraft.lon,
      trackDeg: aircraft.track,
      groundSpeedKt: aircraft.groundSpeed,
    }, trackerRef.current);
  }, [analysis, aircraft, observedAt]);

  const conformanceResult = useMemo(() => {
    if (!analysis?.v2 || !corridorResult || !Number.isFinite(observedAt)) return null;
    return buildTrajectoryConformance({
      route: analysis.v2,
      corridor: corridorResult.snapshot,
      observedAt,
    }, conformanceTrackerRef.current);
  }, [analysis, corridorResult, observedAt]);

  useEffect(() => {
    if (analysis?.v2 && Number.isFinite(observedAt)) previousDynamicRef.current = analysis.v2.dynamic;
    if (corridorResult) trackerRef.current = corridorResult.tracker;
    if (conformanceResult) conformanceTrackerRef.current = conformanceResult.tracker;
  }, [analysis, corridorResult, conformanceResult, observedAt]);

  return {
    route: analysis ? toRouteIntelligenceViewDTO(analysis, aircraft?.enrichment?.route ?? null) : null,
    corridor: corridorResult?.snapshot ?? null,
    conformance: conformanceResult?.snapshot ?? null,
    conformanceDiagnostics: conformanceResult?.tracker.counters ?? null,
    referenceLoading,
    referencePointCount: referencePoints.length,
  };
}
