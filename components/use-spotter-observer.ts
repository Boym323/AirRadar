"use client";

import { useEffect, useState } from "react";
import { observerFromGeolocation, type SpotterObserverPosition } from "@/lib/spotter-location";

export type SpotterObserverState = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export function observerWatchOptions(highAccuracy: boolean): PositionOptions {
  return { enableHighAccuracy: highAccuracy, maximumAge: highAccuracy ? 15_000 : 60_000, timeout: 10_000 };
}
export function observerFailureState(code: number, permissionDenied: number): SpotterObserverState {
  return code === permissionDenied ? "denied" : "error";
}

/** Owns the single browser GPS watcher. No server persistence or receiver changes. */
export function useSpotterObserver(enabled: boolean, highAccuracy: boolean): {
  observer: SpotterObserverPosition | null;
  observerState: SpotterObserverState;
} {
  const [observer, setObserver] = useState<SpotterObserverPosition | null>(null);
  const [observerState, setObserverState] = useState<SpotterObserverState>("idle");

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setObserver(null);
      setObserverState("unavailable");
      return;
    }
    setObserverState("requesting");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setObserver(observerFromGeolocation(position));
        setObserverState("ready");
      },
      (error) => {
        setObserver(null);
        setObserverState(observerFailureState(error.code, error.PERMISSION_DENIED));
      },
      observerWatchOptions(highAccuracy),
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, highAccuracy]);

  return { observer, observerState };
}
