import type { RadarLayerDataStatus } from "@/components/radar/use-radar-weather-context";

export interface RadarWeatherFrame {
  observedAt: string;
  stale: boolean;
}

export type RadarWeatherViewState = "off" | "loading" | "ready" | "stale" | "unavailable";

/** UI state belongs to the selected frame, not an unrelated old catalog entry. */
export function radarWeatherPresentation(
  enabled: boolean,
  status: RadarLayerDataStatus,
  selectedFrame: RadarWeatherFrame | null,
): { state: RadarWeatherViewState; observedAt: string | null } {
  if (!enabled) return { state: "off", observedAt: null };
  if (status === "unavailable") return { state: "unavailable", observedAt: null };
  if (status === "loading" || status === "idle" || !selectedFrame) return { state: "loading", observedAt: null };
  return { state: selectedFrame.stale || status === "stale" ? "stale" : "ready", observedAt: selectedFrame.observedAt };
}
