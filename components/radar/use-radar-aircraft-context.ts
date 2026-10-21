"use client";

import { useEffect, useState } from "react";
import type { AtcContextResult } from "@/lib/atc-context/types";

interface UseRadarAircraftContextOptions {
  aircraftHex: string | null;
  hasPosition: boolean;
}

/** Owns the selected aircraft's bounded, selection-scoped context requests. */
export function useRadarAircraftContext({ aircraftHex, hasPosition }: UseRadarAircraftContextOptions) {
  const [atcContext, setAtcContext] = useState<AtcContextResult | null>(null);

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

  return { atcContext };
}
