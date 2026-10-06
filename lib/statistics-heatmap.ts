export type StatisticsHeatmapRange = "today" | "7d" | "30d";

export interface StatisticsHeatmapCell { x: number; y: number; count: number; intensity: number; }
export interface StatisticsHeatmapResponse {
  source: "postgres" | "unavailable";
  range: StatisticsHeatmapRange;
  from: string;
  to: string;
  cells: StatisticsHeatmapCell[];
  sampledPositions: number;
  maxCellCount: number;
}

export function parseStatisticsHeatmapRange(value: string | null): StatisticsHeatmapRange | null {
  return value === "today" || value === "7d" || value === "30d" ? value : null;
}

export function statisticsHeatmapCsv(data: StatisticsHeatmapResponse): string {
  return ["x,y,count,intensity", ...data.cells.map((cell) => `${cell.x},${cell.y},${cell.count},${cell.intensity}`)].join("\n") + "\n";
}
