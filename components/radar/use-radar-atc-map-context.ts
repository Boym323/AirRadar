"use client";

import { useEffect, useMemo, useState } from "react";
import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import type { SectorFlow } from "@/components/atc-sector-traffic-panels";
import { useDatasetQuery } from "@/components/use-dataset-query";

export interface SectorTrafficView {
  sectorId: string;
  name: string;
  at: string;
  vertical: { lower: string | null; upper: string | null };
  traffic: {
    aircraftCount: number;
    entering1m: number;
    entering5m: number;
    entering15m: number;
    leaving1m: number;
    leaving5m: number;
    leaving15m: number;
    climbing: number;
    descending: number;
    level: number;
    averageAltitude: number | null;
    medianAltitude: number | null;
    averageGroundSpeed: number | null;
  };
  trafficLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  frequencies: Array<{ channel: string }>;
  source: { airspace: string; traffic: string };
}

interface SearchParamsLike {
  get(name: string): string | null;
}

interface RadarAtcMapContextOptions {
  showAtc: boolean;
  showAupUup: boolean;
  showAtcTraffic: boolean;
  searchParams: SearchParamsLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAirspaceDataset(value: unknown): value is AirspaceActivityResponse {
  return isRecord(value)
    && Object.prototype.hasOwnProperty.call(value, "planned")
    && Object.prototype.hasOwnProperty.call(value, "historicalActual");
}

async function parseAirspaceResponse(response: Response): Promise<AirspaceActivityResponse> {
  const value: unknown = await response.json();
  if (!parseAirspaceDataset(value)) throw new SyntaxError("malformed airspace activity response");
  return value;
}

function normalizeMapTime(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function useRadarAtcMapContext({
  showAtc,
  showAupUup,
  showAtcTraffic,
  searchParams,
}: RadarAtcMapContextOptions) {
  const requestedAt = useMemo(() => normalizeMapTime(searchParams.get("at")), [searchParams]);
  const [sectorTraffic, setSectorTraffic] = useState<Map<string, SectorTrafficView>>(new Map());
  const [sectorTrafficState, setSectorTrafficState] = useState<"idle" | "loading" | "ready" | "stale" | "unavailable">("idle");
  const [sectorFlowWindow, setSectorFlowWindow] = useState<1 | 5 | 15>(5);
  const [sectorFlows, setSectorFlows] = useState<SectorFlow[]>([]);

  const airspaceDataset = useDatasetQuery<AirspaceActivityResponse>({
    url: "/api/airspace/activity",
    enabled: showAtc || showAupUup,
    cache: "no-store",
    parse: parseAirspaceResponse,
    itemCount: () => 1,
  });

  useEffect(() => {
    if (!showAtcTraffic) {
      setSectorTraffic(new Map());
      setSectorTrafficState("idle");
      return;
    }
    let active = true;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setSectorTrafficState((value) => value === "ready" ? value : "loading");
      try {
        const query = requestedAt ? `?at=${encodeURIComponent(requestedAt)}` : "";
        const response = await fetch(`/api/atc/sectors/traffic${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("traffic unavailable");
        const payload = await response.json() as { sectors?: SectorTrafficView[] };
        if (!active || !Array.isArray(payload.sectors)) throw new Error("invalid traffic response");
        setSectorTraffic(new Map(payload.sectors.map((item) => [item.sectorId, item])));
        setSectorTrafficState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setSectorTrafficState((value) => value === "ready" ? "stale" : "unavailable");
      }
    };

    let timer: number | undefined;
    const schedule = () => {
      if (!requestedAt && active) {
        timer = window.setTimeout(async () => {
          await load();
          schedule();
        }, 12_000);
      }
    };
    void load().then(schedule);
    return () => {
      active = false;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [requestedAt, showAtcTraffic]);

  useEffect(() => {
    if (!showAtcTraffic) {
      setSectorFlows([]);
      return;
    }
    let active = true;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const at = requestedAt ? `&at=${encodeURIComponent(requestedAt)}` : "";
        const response = await fetch(`/api/atc/sectors/transitions?window=${sectorFlowWindow}m${at}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("flows unavailable");
        const payload = await response.json() as { transitions?: SectorFlow[] };
        if (active) setSectorFlows(Array.isArray(payload.transitions) ? payload.transitions : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError") && active) setSectorFlows([]);
      }
    };

    let timer: number | undefined;
    const schedule = () => {
      if (!requestedAt && active) {
        timer = window.setTimeout(async () => {
          await load();
          schedule();
        }, 15_000);
      }
    };
    void load().then(schedule);
    return () => {
      active = false;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [requestedAt, sectorFlowWindow, showAtcTraffic]);

  return {
    requestedAt,
    airspaceDataset,
    airspaceActivity: airspaceDataset.data,
    sectorTraffic,
    sectorTrafficState,
    sectorFlowWindow,
    setSectorFlowWindow,
    sectorFlows,
  };
}
