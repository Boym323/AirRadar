import fs from "node:fs";
import path from "node:path";
import type { Procedure, ProcedureType } from "@/lib/route-intelligence/contracts";
import { validateProcedureDataset, type ProcedureDatasetDocument } from "./pipeline";

const DEFAULT_PATH = path.join(process.cwd(), "data/procedures/generated/procedures.json");
let cached: { file: string; mtimeMs: number; repository: ProcedureRepository } | null = null;

export class ProcedureRepository {
  constructor(readonly dataset: ProcedureDatasetDocument) {}
  byAirport(airportIcao: string): Procedure[] { const code = airportIcao.trim().toUpperCase(); return this.dataset.procedures.filter((procedure) => procedure.airportIcao === code); }
  byAirportAndType(airportIcao: string, type: ProcedureType): Procedure[] { return this.byAirport(airportIcao).filter((procedure) => procedure.type === type); }
  byAirportAndDesignator(airportIcao: string, designator: string): Procedure[] { const value = designator.trim().toUpperCase(); return this.byAirport(airportIcao).filter((procedure) => procedure.designator === value); }
}

export function getProcedureDatasetPath(): string { return process.env.PROCEDURES_DATASET_PATH?.trim() || DEFAULT_PATH; }
export function clearProcedureRepositoryCache(): void { cached = null; }
export function loadProcedureRepository(): ProcedureRepository | null {
  const file = getProcedureDatasetPath();
  try {
    const stat = fs.statSync(/*turbopackIgnore: true*/ file);
    if (cached?.file === file && cached.mtimeMs === stat.mtimeMs) return cached.repository;
    const dataset = validateProcedureDataset(JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")));
    const repository = new ProcedureRepository(dataset);
    cached = { file, mtimeMs: stat.mtimeMs, repository };
    return repository;
  } catch { cached = null; return null; }
}

export function lookupProcedures(query: { airport?: string | null; type?: ProcedureType | null; designator?: string | null }): Procedure[] {
  const repository = loadProcedureRepository();
  if (!repository || !query.airport) return [];
  if (query.designator) return repository.byAirportAndDesignator(query.airport, query.designator).filter((procedure) => !query.type || procedure.type === query.type);
  if (query.type) return repository.byAirportAndType(query.airport, query.type);
  return repository.byAirport(query.airport);
}
