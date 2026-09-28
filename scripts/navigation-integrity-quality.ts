import { mkdir, writeFile } from "node:fs/promises";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";

const OUT = "artifacts/navigation-integrity-quality.json";

type QualityRow = {
  aircraftHex: string;
  observedAt: Date | string | { epochMilliseconds: number };
  source: string;
  altitudeBand: number;
  nic: number | null;
  nacP: number | null;
  nacV: number | null;
  sil: number | null;
  sda: number | null;
  gva: number | null;
  latCell: number;
  lonCell: number;
};

function observedMs(value: QualityRow["observedAt"]): number {
  if (typeof value === "object" && value !== null && "epochMilliseconds" in value) return value.epochMilliseconds;
  return new Date(value).getTime();
}

function countAvailable(rows: QualityRow[], field: keyof QualityRow): number { return rows.filter((row) => row[field] !== null && row[field] !== undefined).length; }
function groupCounts(rows: QualityRow[], key: (row: QualityRow) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) { const value = key(row); result[value] = (result[value] ?? 0) + 1; }
  return result;
}

async function readRows(): Promise<{ rows: QualityRow[]; database: "available" | "unavailable" | "disabled" }> {
  if (!isDatabaseConfigured()) return { rows: [], database: "disabled" };
  const database = getPrisma();
  if (!database) return { rows: [], database: "unavailable" };
  try {
    const rows = await database.orm.public.NavigationIntegrityObservation.select("aircraftHex", "observedAt", "source", "altitudeBand", "nic", "nacP", "nacV", "sil", "sda", "gva", "latCell", "lonCell").limit(50_000).all();
    return { rows: rows as unknown as QualityRow[], database: "available" };
  } catch { return { rows: [], database: "unavailable" }; }
}

const { rows, database } = await readRows();
const current = getNavigationIntegrityService().getCurrent("15m");
const diagnostics = getNavigationIntegrityService().getDiagnostics();
const report = {
  generatedAt: new Date().toISOString(),
  dataTimeSpan: rows.length ? { from: new Date(Math.min(...rows.map((row) => observedMs(row.observedAt)))).toISOString(), to: new Date(Math.max(...rows.map((row) => observedMs(row.observedAt)))).toISOString() } : null,
  database,
  uniqueAircraft: rows.length ? new Set(rows.map((row) => row.aircraftHex)).size : null,
  availability: rows.length ? Object.fromEntries(["nic", "nacP", "nacV", "sil", "sda", "gva"].map((field) => [field, { count: countAvailable(rows, field as keyof QualityRow), rate: countAvailable(rows, field as keyof QualityRow) / rows.length }])) : null,
  bySource: rows.length ? groupCounts(rows, (row) => row.source) : null,
  byAltitudeBand: rows.length ? groupCounts(rows, (row) => String(row.altitudeBand)) : null,
  aircraft: rows.length ? groupCounts(rows, (row) => row.aircraftHex) : null,
  spatialCells: rows.length ? new Set(rows.map((row) => `${row.latCell}:${row.lonCell}:${row.altitudeBand}`)).size : null,
  baseline: { cellsTotal: current.cells.length, cellsWithSufficientBaseline: diagnostics.baselineCellsReady, cellsInsufficient: Math.max(0, current.cells.length - diagnostics.baselineCellsReady) },
  currentAnomalyCandidates: diagnostics.anomalyCandidates,
  activeAnomalies: current.summary.activeAnomalies,
  rejectionReasons: diagnostics.rejectionReasons,
  diagnostics,
  interpretation: "Detector output is a heuristic navigation-integrity anomaly candidate, not proof of GNSS interference or jamming.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT}`);
