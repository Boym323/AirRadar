"use client";

import { useEffect, useRef, useState } from "react";
import type { MetarMapObservation, SigmetSnapshot } from "@/lib/weather/types";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";

export type RadarLayerDataStatus = "idle" | "loading" | "ready" | "stale" | "unavailable";

export interface WeatherRadarCatalogResponse {
  available: boolean;
  frames: Array<{ id: string; observedAt: string; imageUrl: string; latest: boolean; stale: boolean }>;
  latestFrameId: string | null;
  bounds: { west: number; south: number; east: number; north: number };
}

export interface WindResponse {
  model: string;
  modelRun: string | null;
  validAt: string;
  availableValidTimes: string[];
  levelHpa: WindLevelHpa;
  points: Array<{ lat: number; lon: number; speedKt: number | null; directionDeg: number | null }>;
  stale: boolean;
}

export const EMPTY_SIGMET_DATA: SigmetSnapshot = {
  type: "FeatureCollection",
  features: [],
  fetchedAt: new Date(0).toISOString(),
  stale: false,
};

interface UseRadarWeatherContextOptions {
  showSigmet: boolean;
  loadSigmet: boolean;
  showWeatherRadar: boolean;
  showMetar: boolean;
  showWind: boolean;
  windLevel: WindLevelHpa;
  onSigmetUnavailable(): void;
}

export function useRadarWeatherContext({
  showSigmet,
  loadSigmet,
  showWeatherRadar,
  showMetar,
  showWind,
  windLevel,
  onSigmetUnavailable,
}: UseRadarWeatherContextOptions) {
  const [radarCatalog, setRadarCatalog] = useState<WeatherRadarCatalogResponse | null>(null);
  const [radarFrameId, setRadarFrameId] = useState<string | null>(null);
  const [radarLatestMode, setRadarLatestMode] = useState(true);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarStatus, setRadarStatus] = useState<RadarLayerDataStatus>("idle");
  const [metarObservations, setMetarObservations] = useState<MetarMapObservation[]>([]);
  const [metarStatus, setMetarStatus] = useState<RadarLayerDataStatus>("idle");
  const [windValidAt, setWindValidAt] = useState<string | null>(null);
  const [windData, setWindData] = useState<WindResponse | null>(null);
  const [windStatus, setWindStatus] = useState<RadarLayerDataStatus>("idle");
  const [sigmetEnabled, setSigmetEnabled] = useState<boolean | null>(null);
  const [sigmetData, setSigmetData] = useState<SigmetSnapshot>(EMPTY_SIGMET_DATA);

  const radarGenerationRef = useRef(0);
  const windGenerationRef = useRef(0);
  const sigmetGenerationRef = useRef(0);
  const sigmetUnavailableRef = useRef(onSigmetUnavailable);
  sigmetUnavailableRef.current = onSigmetUnavailable;

  useEffect(() => {
    const generation = ++radarGenerationRef.current;
    if (!showWeatherRadar) {
      setRadarPlaying(false);
      return;
    }

    let active = true;
    const load = async (): Promise<void> => {
      setRadarStatus((current) => current === "ready" || current === "stale" ? current : "loading");
      try {
        const response = await fetch("/api/weather/radar/frames", { cache: "no-store" });
        if (!response.ok) throw new Error("radar catalog unavailable");
        const catalog = await response.json() as WeatherRadarCatalogResponse;
        if (!active || generation !== radarGenerationRef.current) return;
        setRadarCatalog(catalog);
        setRadarStatus(
          catalog.available && catalog.frames.length
            ? catalog.frames.some((frame) => frame.stale) ? "stale" : "ready"
            : "unavailable",
        );
        setRadarFrameId((current) => radarLatestMode
          ? catalog.latestFrameId
          : current && catalog.frames.some((frame) => frame.id === current)
            ? current
            : catalog.latestFrameId);
      } catch {
        if (active && generation === radarGenerationRef.current) setRadarStatus("unavailable");
      }
    };

    let timer: number | null = null;
    const schedule = () => {
      if (active) timer = window.setTimeout(() => { void load().finally(schedule); }, 60_000);
    };
    void load().finally(schedule);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [radarLatestMode, showWeatherRadar]);

  useEffect(() => {
    if (!showWeatherRadar || !radarPlaying || !radarCatalog?.frames.length) return;
    let active = true;
    let timer: number | null = null;
    const advance = () => {
      if (!active) return;
      setRadarFrameId((current) => {
        const index = radarCatalog.frames.findIndex((frame) => frame.id === current);
        return radarCatalog.frames[(index < 0 ? 0 : (index + 1) % radarCatalog.frames.length)]!.id;
      });
      timer = window.setTimeout(advance, 650);
    };
    timer = window.setTimeout(advance, 650);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [radarCatalog, radarPlaying, showWeatherRadar]);

  useEffect(() => {
    if (!showMetar) return;
    let active = true;
    let controller: AbortController | null = null;

    const load = async (): Promise<void> => {
      controller?.abort();
      controller = new AbortController();
      setMetarStatus("loading");
      try {
        const response = await fetch("/api/weather/metar-map", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("METAR map unavailable");
        const data = await response.json() as { observations?: MetarMapObservation[]; stale?: boolean };
        if (!active || !Array.isArray(data.observations)) return;
        setMetarObservations(data.observations);
        setMetarStatus(
          data.stale || data.observations.some((item) => item.stale) ? "stale" : "ready",
        );
      } catch {
        if (active && controller && !controller.signal.aborted) setMetarStatus("unavailable");
      }
    };

    let timer: number | null = null;
    const schedule = () => {
      if (active) timer = window.setTimeout(() => { void load().finally(schedule); }, 5 * 60_000);
    };
    void load().finally(schedule);
    return () => {
      active = false;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [showMetar]);

  useEffect(() => {
    if (!showWind) return;
    const generation = ++windGenerationRef.current;
    const controller = new AbortController();
    setWindStatus("loading");
    const params = new URLSearchParams({ level: String(windLevel) });
    if (windValidAt) params.set("valid", windValidAt);

    fetch(`/api/weather/wind?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("wind unavailable");
        return await response.json() as WindResponse;
      })
      .then((data) => {
        if (generation !== windGenerationRef.current || controller.signal.aborted) return;
        setWindData(data);
        setWindValidAt(data.validAt);
        setWindStatus(data.stale ? "stale" : "ready");
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === windGenerationRef.current) {
          setWindStatus("unavailable");
        }
      });

    return () => controller.abort();
  }, [showWind, windLevel, windValidAt]);

  useEffect(() => {
    const generation = ++sigmetGenerationRef.current;
    if (!loadSigmet) {
      setSigmetData(EMPTY_SIGMET_DATA);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/weather/sigmet", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SIGMET request failed");
        const data = await response.json() as Partial<SigmetSnapshot> & {
          enabled?: boolean;
          available?: boolean;
        };
        if (!active || generation !== sigmetGenerationRef.current || controller.signal.aborted) return;

        if (data.enabled === false || data.available === false) {
          setSigmetEnabled(false);
          sigmetUnavailableRef.current();
          setSigmetData(EMPTY_SIGMET_DATA);
        } else if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
          setSigmetEnabled(true);
          setSigmetData(data as SigmetSnapshot);
        }
      } catch {
        // Keep the last good layer across transient client/API failures.
      } finally {
        if (active && generation === sigmetGenerationRef.current && !controller.signal.aborted) {
          timer = setTimeout(() => { void load(); }, 5 * 60_000);
        }
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [loadSigmet]);

  return {
    radarCatalog,
    radarFrameId,
    setRadarFrameId,
    radarLatestMode,
    setRadarLatestMode,
    radarPlaying,
    setRadarPlaying,
    radarStatus,
    metarObservations,
    metarStatus,
    windValidAt,
    setWindValidAt,
    windData,
    windStatus,
    sigmetEnabled,
    sigmetData,
  };
}
