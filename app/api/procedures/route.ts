import { loadProcedureRepository } from "@/lib/procedures/repository";
import type { ProcedureType } from "@/lib/route-intelligence/contracts";

export const dynamic = "force-dynamic";
const MAX_RESULTS = 200;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const airport = url.searchParams.get("airport")?.trim().toUpperCase() ?? null;
  const typeValue = url.searchParams.get("type")?.trim().toUpperCase() ?? null;
  const designator = url.searchParams.get("designator")?.trim().toUpperCase() ?? null;
  // The map layer needs the complete bounded published dataset. Airport-scoped
  // queries remain available for detail views and route intelligence.
  if (airport !== null && !/^[A-Z]{4}$/.test(airport)) return Response.json({ error: "airport must be a four-letter ICAO code" }, { status: 400 });
  if (typeValue !== null && typeValue !== "SID" && typeValue !== "STAR") return Response.json({ error: "type must be SID or STAR" }, { status: 400 });
  const repository = loadProcedureRepository();
  if (!repository) {
    return Response.json(
      { available: false, status: "unavailable", procedures: [] },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  }
  const procedures = (airport === null
    ? repository.dataset.procedures.filter((procedure) => (!typeValue || procedure.type === typeValue) && (!designator || procedure.designator === designator))
    : designator
      ? repository.byAirportAndDesignator(airport, designator).filter((procedure) => !typeValue || procedure.type === typeValue)
      : typeValue ? repository.byAirportAndType(airport, typeValue as ProcedureType) : repository.byAirport(airport)).slice(0, MAX_RESULTS);
  return Response.json({ available: true, procedures, truncated: procedures.length >= MAX_RESULTS }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
