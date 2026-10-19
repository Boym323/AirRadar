"use client";

import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";
import { useDatasetQuery } from "@/components/use-dataset-query";

interface RadarAtcMapContextOptions {
  showAtc: boolean;
  showAupUup: boolean;
}

function parseAirspaceResponse(response: Response): Promise<AirspaceActivityResponse> {
  return response.json().then((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || !("planned" in value) || !("historicalActual" in value)) {
      throw new SyntaxError("malformed airspace activity response");
    }
    return value as AirspaceActivityResponse;
  });
}

/**
 * The radar map only needs published sector metadata and optional AUP/UUP state.
 * Traffic counts, transition flows and historical sector analytics belong to
 * the dedicated airspace views and never poll from the radar map.
 */
export function useRadarAtcMapContext({ showAtc, showAupUup }: RadarAtcMapContextOptions) {
  const airspaceDataset = useDatasetQuery<AirspaceActivityResponse>({
    url: "/api/airspace/activity",
    enabled: showAtc || showAupUup,
    cache: "no-store",
    parse: parseAirspaceResponse,
    itemCount: () => 1,
  });
  return { airspaceDataset, airspaceActivity: airspaceDataset.data };
}
