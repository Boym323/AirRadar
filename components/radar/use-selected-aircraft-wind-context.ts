"use client";

import { useEffect, useMemo, useState } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import {
  buildAircraftWindAheadProfile,
  buildAircraftWindContext,
  windLevelForAltitude,
  type AircraftWindAheadProfile,
  type AircraftWindContext,
  type AircraftWindSnapshot,
} from "@/lib/weather/aircraft-wind-context";
import type { RadarLayerDataStatus } from "@/components/radar/use-radar-weather-context";

const REFRESH_MS = 15 * 60_000;

export interface SelectedAircraftWindState {
  context: AircraftWindContext | null;
  ahead: AircraftWindAheadProfile | null;
  status: RadarLayerDataStatus;
}

export function useSelectedAircraftWindContext(aircraft: AircraftView | null): SelectedAircraftWindState {
  const altitudeFt = aircraft?.baroAltitude ?? aircraft?.altitude ?? aircraft?.geomAltitude ?? null;
  const level = aircraft?.onGround ? null : windLevelForAltitude(altitudeFt);
  const [data, setData] = useState<AircraftWindSnapshot | null>(null);
  const [status, setStatus] = useState<RadarLayerDataStatus>("idle");

  useEffect(() => {
    if (level === null) {
      setData(null);
      setStatus("idle");
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const load = async (): Promise<void> => {
      controller?.abort();
      controller = new AbortController();
      setStatus((current) => current === "ready" || current === "stale" ? current : "loading");
      try {
        const response = await fetch(`/api/weather/wind?level=${level}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("wind unavailable");
        const next = await response.json() as AircraftWindSnapshot;
        if (!active || controller.signal.aborted || next.levelHpa !== level) return;
        setData(next);
        setStatus(next.stale ? "stale" : "ready");
      } catch {
        if (active && controller && !controller.signal.aborted) setStatus("unavailable");
      } finally {
        if (active) timer = setTimeout(() => { void load(); }, REFRESH_MS);
      }
    };

    void load();
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [level]);

  const context = useMemo(
    () => data && data.levelHpa === level ? buildAircraftWindContext(aircraft, data) : null,
    [aircraft, data, level],
  );
  const ahead = useMemo(
    () => data && data.levelHpa === level ? buildAircraftWindAheadProfile(aircraft, data) : null,
    [aircraft, data, level],
  );

  return { context, ahead, status };
}
