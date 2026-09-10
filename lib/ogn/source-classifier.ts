import type { OgnTrackingSource } from "@/lib/ogn/types";

export type OgnSourceClassification =
  | { action: "accept"; source: OgnTrackingSource; label: string }
  | { action: "drop"; reason: "adsb" | "ground" | "status" | "delayed" | "unknown" };

/**
 * This table is deliberately fail-closed. OGN adds TOCALLs over time and a
 * new destination must not become public aircraft traffic accidentally.
 */
const SOURCE_TABLE: Readonly<Record<string, OgnSourceClassification>> = {
  OGFLR: { action: "accept", source: "flarm", label: "FLARM" },
  OGNFLR: { action: "accept", source: "flarm", label: "FLARM" },
  OGFLR6: { action: "accept", source: "flarm", label: "FLARM" },
  OGFLR7: { action: "accept", source: "flarm", label: "FLARM" },
  OGNTRK: { action: "accept", source: "ogn", label: "OGN Tracker" },
  OGNT: { action: "accept", source: "ogn", label: "OGN Tracker" },
  OGNFNT: { action: "accept", source: "fanet", label: "FANET" },
  OGNSKY: { action: "accept", source: "safesky", label: "SafeSky" },
  OGPAW: { action: "accept", source: "pilotaware", label: "PilotAware" },
  OGNPAW: { action: "accept", source: "pilotaware", label: "PilotAware" },
  OGADSL: { action: "accept", source: "ads_l", label: "ADS-L" },
  OGADSB: { action: "drop", reason: "adsb" },
  OGNSDR: { action: "drop", reason: "ground" },
  OGNDVS: { action: "drop", reason: "ground" },
  OGMSHT: { action: "drop", reason: "status" },
  OGNDELAY: { action: "drop", reason: "delayed" },
  OGNDLY: { action: "drop", reason: "delayed" },
};

export function classifyOgnTocall(tocall: string): OgnSourceClassification {
  const normalized = tocall.trim().toUpperCase();
  return SOURCE_TABLE[normalized] ?? { action: "drop", reason: "unknown" };
}

export function sourceClassificationTable(): Readonly<Record<string, OgnSourceClassification>> {
  return SOURCE_TABLE;
}
