"use client";

import { useCallback, useEffect, useState } from "react";
import type { AirportWeatherResponse } from "@/components/airport-weather";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";

export type AirportOperationsLoadStatus = "loading" | "ready" | "partial" | "unavailable";

export interface AirportOperationsControllerState {
  operations: AirportOperationsResponse | null;
  weather: AirportWeatherResponse | null;
  status: AirportOperationsLoadStatus;
  operationsFailed: boolean;
  weatherFailed: boolean;
  refresh: () => void;
}

export function useAirportOperationsController(icaoCode: string): AirportOperationsControllerState {
  const [operations, setOperations] = useState<AirportOperationsResponse | null>(null);
  const [weather, setWeather] = useState<AirportWeatherResponse | null>(null);
  const [operationsFailed, setOperationsFailed] = useState(false);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOperationsFailed(false);
    setWeatherFailed(false);

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

    return () => controller.abort();
  }, [icaoCode, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const status: AirportOperationsLoadStatus = loading
    ? "loading"
    : operationsFailed && weatherFailed
      ? "unavailable"
      : operationsFailed || weatherFailed
        ? "partial"
        : "ready";

  return { operations, weather, status, operationsFailed, weatherFailed, refresh };
}
