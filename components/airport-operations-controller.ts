"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AirportWeatherResponse } from "@/components/airport-weather";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";

export const AIRPORT_LIVE_BOARD_REFRESH_MS = 30_000;

export type AirportOperationsLoadStatus = "loading" | "ready" | "partial" | "unavailable";

export interface AirportOperationsControllerState {
  operations: AirportOperationsResponse | null;
  weather: AirportWeatherResponse | null;
  predictive: PredictiveOperationsResponse | null;
  predictiveLoading: boolean;
  predictiveFailed: boolean;
  status: AirportOperationsLoadStatus;
  operationsFailed: boolean;
  weatherFailed: boolean;
  refresh: () => void;
}

export function useAirportOperationsController(
  icaoCode: string,
  predictiveHexes: readonly string[] = [],
): AirportOperationsControllerState {
  const [operations, setOperations] = useState<AirportOperationsResponse | null>(null);
  const [weather, setWeather] = useState<AirportWeatherResponse | null>(null);
  const [predictive, setPredictive] = useState<PredictiveOperationsResponse | null>(null);
  const [operationsFailed, setOperationsFailed] = useState(false);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [predictiveFailed, setPredictiveFailed] = useState(false);
  const [predictiveLoading, setPredictiveLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const predictiveKey = useMemo(
    () => [...new Set(predictiveHexes
      .map((hex) => hex.trim().toUpperCase())
      .filter((hex) => /^[0-9A-F]{6}$/.test(hex)))]
      .sort()
      .slice(0, 6)
      .join(","),
    [predictiveHexes],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOperations(null);
    setWeather(null);
    setOperationsFailed(false);
    setWeatherFailed(false);

    const refreshTimer = window.setTimeout(
      () => setRefreshToken((value) => value + 1),
      AIRPORT_LIVE_BOARD_REFRESH_MS,
    );

    void Promise.allSettled([
      fetch(`/api/airports/${encodeURIComponent(icaoCode)}/operations?period=24h`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("airport operations request failed");
        return await response.json() as AirportOperationsResponse;
      }),
      fetch(`/api/weather/airport/${encodeURIComponent(icaoCode)}`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("airport weather request failed");
        return await response.json() as AirportWeatherResponse;
      }),
    ]).then(([operationsResult, weatherResult]) => {
      if (controller.signal.aborted) return;
      if (operationsResult.status === "fulfilled") setOperations(operationsResult.value);
      else {
        setOperations(null);
        setOperationsFailed(true);
      }
      if (weatherResult.status === "fulfilled") {
        setWeather(weatherResult.value.enabled === false ? null : weatherResult.value);
        setWeatherFailed(false);
      } else {
        setWeather(null);
        setWeatherFailed(true);
      }
      setLoading(false);
    });

    return () => {
      window.clearTimeout(refreshTimer);
      controller.abort();
    };
  }, [icaoCode, refreshToken]);

  useEffect(() => {
    if (!predictiveKey) {
      setPredictive({ generatedAt: new Date().toISOString(), items: [] });
      setPredictiveLoading(false);
      setPredictiveFailed(false);
      return;
    }

    const controller = new AbortController();
    setPredictiveLoading(true);
    setPredictiveFailed(false);
    void fetch(`/api/operations/predictive?hexes=${encodeURIComponent(predictiveKey)}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("airport predictive arrivals request failed");
      return await response.json() as PredictiveOperationsResponse;
    }).then((response) => {
      if (controller.signal.aborted) return;
      // The airport board consumes only PUBLIC advisory fields. Admin previews,
      // when present for an authenticated operator, are deliberately discarded.
      setPredictive({
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
      setPredictiveLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setPredictive(null);
      setPredictiveFailed(true);
      setPredictiveLoading(false);
    });

    return () => controller.abort();
  }, [predictiveKey, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const status: AirportOperationsLoadStatus = loading
    ? "loading"
    : operationsFailed && weatherFailed
      ? "unavailable"
      : operationsFailed || weatherFailed
        ? "partial"
        : "ready";

  return {
    operations,
    weather,
    predictive,
    predictiveLoading,
    predictiveFailed,
    status,
    operationsFailed,
    weatherFailed,
    refresh,
  };
}
