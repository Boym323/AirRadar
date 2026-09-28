"use client";

import { useEffect, useState } from "react";
import type { NavigationIntegrityAnomaly, NavigationIntegrityClassification, NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

export interface NavigationIntegrityAircraftResponse {
  aircraft: {
    latest: NavigationIntegrityObservation | null;
    classification: NavigationIntegrityClassification | null;
    regionalContext: { state: string; affectedAircraft: number; anomaly: NavigationIntegrityAnomaly | null };
  };
}

export function useNavigationIntegrityContext(icaoHex: string): NavigationIntegrityAircraftResponse["aircraft"] | null {
  const [response, setResponse] = useState<NavigationIntegrityAircraftResponse | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/navigation-integrity/aircraft/${encodeURIComponent(icaoHex)}`, { cache: "no-store" })
      .then((result) => result.ok ? result.json() as Promise<NavigationIntegrityAircraftResponse> : null)
      .then((value) => { if (active) setResponse(value); })
      .catch(() => { if (active) setResponse(null); });
    return () => { active = false; };
  }, [icaoHex]);

  return response?.aircraft ?? null;
}
