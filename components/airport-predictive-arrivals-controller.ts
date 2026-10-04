"use client";

import { useEffect, useMemo, useState } from "react";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";

export const AIRPORT_PREDICTIVE_ARRIVALS_REFRESH_MS = 30_000;

export interface AirportPredictiveArrivalsState {
  data: PredictiveOperationsResponse | null;
  loading: boolean;
  failed: boolean;
}

export function useAirportPredictiveArrivals(hexes: readonly string[]): AirportPredictiveArrivalsState {
  const key = useMemo(() => [...new Set(hexes.map((hex) => hex.trim().toUpperCase()).filter(Boolean))].sort().slice(0, 6).join(","), [hexes]);
  const [data, setData] = useState<PredictiveOperationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!key) {
      setData({ generatedAt: new Date().toISOString(), items: [] });
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(
      () => setRefreshToken((value) => value + 1),
      AIRPORT_PREDICTIVE_ARRIVALS_REFRESH_MS,
    );

    void fetch(`/api/operations/predictive?hexes=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("airport predictive arrivals request failed");
      return await response.json() as PredictiveOperationsResponse;
    }).then((response) => {
      if (controller.signal.aborted) return;
      setData({
        generatedAt: response.generatedAt,
        items: response.items.map((item) => ({
          icaoHex: item.icaoHex,
          label: item.label,
          callsign: item.callsign,
          registration: item.registration,
          destination: item.destination,
          etaAdvisory: item.etaAdvisory,
          runwayAdvisory: item.runwayAdvisory,
          runwayChangeAdvisory: item.runwayChangeAdvisory,
          trajectoryAdvisory: item.trajectoryAdvisory,
        })),
      });
      setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setFailed(true);
      setLoading(false);
    });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, refreshToken]);

  return { data, loading, failed };
}
