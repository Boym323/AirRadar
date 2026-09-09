import { getBuildMetadata } from "@/lib/server/version";

const AIRRADAR_HOMEPAGE = "https://airradar.pomykal.cz";

export function getAirRadarUserAgent(component: string): string {
  const suffix = component.trim().replace(/[^a-z0-9._-]+/gi, "-") || "server";
  return `AirRadar/${getBuildMetadata().version} (+${AIRRADAR_HOMEPAGE}; ${suffix})`;
}
