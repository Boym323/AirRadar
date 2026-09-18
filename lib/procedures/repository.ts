import fs from "node:fs";
import path from "node:path";
import type { Procedure, ProcedureType } from "@/lib/route-intelligence/contracts";
import { validateProcedureDataset, type ProcedureDatasetDocument } from "./pipeline";

const DEFAULT_PATH = path.join(process.cwd(), "data/procedures/generated/procedures.json");
let cached: { file: string; mtimeMs: number; repository: ProcedureRepository } | null = null;

export class ProcedureRepository {
  private readonly byAirportIndex = new Map<string, Procedure[]>();
  private readonly byAirportTypeIndex = new Map<string, Procedure[]>();
  private readonly byAirportDesignatorIndex = new Map<string, Procedure[]>();
  constructor(readonly dataset: ProcedureDatasetDocument) {
    for (const procedure of dataset.procedures) {
      const airport = procedure.airportIcao.trim().toUpperCase();
      const designator = procedure.designator.trim().toUpperCase();
      const add = (map: Map<string, Procedure[]>, key: string) => {
        const bucket = map.get(key);
        if (bucket) bucket.push(procedure);
        else map.set(key, [procedure]);
      };
      add(this.byAirportIndex, airport);
      add(this.byAirportTypeIndex, `${airport}:${procedure.type}`);
      add(this.byAirportDesignatorIndex, `${airport}:${designator}`);
    }
  }
  byAirport(airportIcao: string): Procedure[] { return this.byAirportIndex.get(airportIcao.trim().toUpperCase()) ?? []; }
  byAirportAndType(airportIcao: string, type: ProcedureType): Procedure[] { return this.byAirportTypeIndex.get(`${airportIcao.trim().toUpperCase()}:${type}`) ?? []; }
  byAirportAndDesignator(airportIcao: string, designator: string): Procedure[] { return this.byAirportDesignatorIndex.get(`${airportIcao.trim().toUpperCase()}:${designator.trim().toUpperCase()}`) ?? []; }
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
