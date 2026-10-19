"use client";

import { useEffect, useRef, useState } from "react";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import {
  compareAircraftOperationalFocus,
  type AircraftOperationalFocusChangeSummary,
} from "@/lib/operational-twin/aircraft-operational-focus-change";
import type { AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";
import type { OperationalTwinApiResponse } from "@/lib/operational-twin";
import type { RouteWeatherContext } from "@/lib/weather/route-weather-context";

interface UseRadarAircraftContextOptions {
  aircraftHex: string | null;
  hasPosition: boolean;
}

/** Owns the selected aircraft's bounded, selection-scoped context requests. */
export function useRadarAircraftContext({ aircraftHex, hasPosition }: UseRadarAircraftContextOptions) {
  const [atcContext, setAtcContext] = useState<AtcContextResult | null>(null);
  const [routeWeather, setRouteWeather] = useState<RouteWeatherContext | null>(null);
  const [operationalTwin, setOperationalTwin] = useState<OperationalTwinApiResponse | null>(null);
  const [operationalFocusChanges, setOperationalFocusChanges] = useState<AircraftOperationalFocusChangeSummary | null>(null);
  const [intelligenceEvents, setIntelligenceEvents] = useState<FlightIntelligenceEvent[]>([]);
  const operationalFocusSnapshotsRef = useRef<Map<string, AircraftOperationalFocusSummary>>(new Map());

  useEffect(() => {
    setIntelligenceEvents([]);
    if (!aircraftHex) return;
    const controller = new AbortController();
    void fetch(`/api/intelligence/events?aircraft=${encodeURIComponent(aircraftHex)}&limit=8`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<{ events?: FlightIntelligenceEvent[] }> : null)
      .then((value) => { if (value?.events) setIntelligenceEvents(value.events); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [aircraftHex]);

  useEffect(() => {
    setAtcContext(null);
    if (!aircraftHex || !hasPosition) return;
    let active = true;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    const refresh = async () => {
      // One in-flight request at a time; the sector estimate is advisory, not real-time ATC.
      controller = new AbortController();
      try {
        const response = await fetch(`/api/aircraft/${encodeURIComponent(aircraftHex)}/context`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("ATC context unavailable");
        const value = await response.json() as AtcContextResult;
        if (active) setAtcContext(value);
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          setAtcContext(null);
        }
      } finally {
        controller = null;
        if (active) timer = window.setTimeout(() => { void refresh(); }, 30_000);
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [aircraftHex, hasPosition]);

  useEffect(() => {
    setRouteWeather(null);
    if (!aircraftHex || !hasPosition || atcContext?.status !== "available") return;
    let active = true;
    let timer: number | null = null;
    const refresh = () => {
      void fetch(`/api/aircraft/${encodeURIComponent(aircraftHex)}/route-weather`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok && response.status >= 500) throw new Error("route-weather unavailable");
          return await response.json() as RouteWeatherContext;
        })
        .then((value) => { if (active) setRouteWeather(value); })
        .catch(() => { if (active) setRouteWeather(null); });
    };
    refresh();
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 120_000);
    };
    schedule();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [aircraftHex, hasPosition, atcContext?.status]);

  useEffect(() => {
    setOperationalTwin(null);
    setOperationalFocusChanges(null);
    if (!aircraftHex || !hasPosition) return;
    let active = true;
    let timer: number | null = null;
    const refresh = () => {
      void fetch(`/api/aircraft/${encodeURIComponent(aircraftHex)}/situation`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok && response.status >= 500) throw new Error("operational twin unavailable");
          return await response.json() as OperationalTwinApiResponse;
        })
        .then((value) => {
          if (!active) return;
          setOperationalTwin(value);
          if (value.status !== "available" || !value.operationalFocus) {
            setOperationalFocusChanges(null);
            return;
          }
          const hex = value.aircraft.icaoHex.toUpperCase();
          const previous = operationalFocusSnapshotsRef.current.get(hex) ?? null;
          setOperationalFocusChanges(compareAircraftOperationalFocus(previous, value.operationalFocus));
          operationalFocusSnapshotsRef.current.set(hex, value.operationalFocus);
        })
        .catch(() => {
          if (!active) return;
          setOperationalTwin(null);
          setOperationalFocusChanges(null);
        });
    };
    refresh();
    const schedule = () => {
      timer = window.setTimeout(() => { refresh(); schedule(); }, 60_000);
    };
    schedule();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [aircraftHex, hasPosition]);

  return { atcContext, routeWeather, operationalTwin, operationalFocusChanges, intelligenceEvents };
}
