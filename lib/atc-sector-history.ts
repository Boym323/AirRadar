export type SectorHistoryRange = "1h" | "6h" | "24h" | "7d";
export const SECTOR_HISTORY_BUCKET: Record<SectorHistoryRange, "1m" | "5m" | "15m" | "1h"> = { "1h": "1m", "6h": "5m", "24h": "15m", "7d": "1h" };
export const SECTOR_HISTORY_MS: Record<SectorHistoryRange, number> = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "7d": 604_800_000 };
export type SectorHistoryMetric = "aircraftCount" | "entering" | "leaving" | "averageAltitude" | "averageGroundSpeed";
export interface SectorTrafficHistoryPoint { time: string; aircraftCount: number | null; entering: number | null; leaving: number | null; climbing: number | null; descending: number | null; level: number | null; averageAltitude: number | null; averageGroundSpeed: number | null; }
export interface SectorTrafficHistorySummary { peakAircraftCount: number; peakAircraftAt: string | null; averageAircraftCount: number; totalEntries: number; totalExits: number; busiestBucket: string | null; quietestBucket: string | null; averageGroundSpeed: number | null; averageAltitude: number | null; }
export interface SectorTrafficHistory { sectorId: string; name?: string; from: string; to: string; bucket: "1m" | "5m" | "15m" | "1h"; points: SectorTrafficHistoryPoint[]; }
export interface SectorTrafficHistoryBatch { from: string; to: string; bucket: SectorTrafficHistory["bucket"]; sectors: Array<SectorTrafficHistory & SectorTrafficHistorySummary>; }

export function historyWindow(range: SectorHistoryRange, effectiveAt: Date): { from: Date; to: Date } { return { to: effectiveAt, from: new Date(effectiveAt.getTime() - SECTOR_HISTORY_MS[range]) }; }
