import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import {
  buildFlightEvidenceE5,
  type FlightEvidenceObservation,
  type FlightEvidenceLanding,
} from "@/lib/predictive-intelligence/flight-evidence-e5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Query<Row> = {
  where(filter: Record<string, unknown>): Query<Row>;
  orderBy(order: unknown): Query<Row>;
  limit(value: number): Query<Row>;
  all(): Promise<Row[]>;
};
type EvidenceSchema = {
  PredictiveObservation: Query<FlightEvidenceObservation>;
  FlightEvent: Query<FlightEvidenceLanding>;
};
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({error: "Unauthorized"}, {status: 401, headers});
  const { id: raw } = await context.params;
  if (!/^[1-9]\d{0,9}$/.test(raw)) return Response.json({error: "Invalid flight"}, {status: 400, headers});
  const flightId = Number(raw);
  if (!Number.isSafeInteger(flightId) || flightId > 2_147_483_647)
    return Response.json({error: "Invalid flight"}, {status: 400, headers});
  const database = getPrisma();
  if (!database) return Response.json({error: "Evidence unavailable"}, {status: 503, headers});
  const schema = database.orm.public as unknown as EvidenceSchema;
  try {
    const [observations, landings] = await Promise.all([
      trackDbOperation("flight-story.evidence.predictions.query", async () =>
        schema.PredictiveObservation.where({flightId})
          .orderBy({predictedAt: "asc"}).limit(65).all()),
      trackDbOperation("flight-story.evidence.landing.query", async () =>
        schema.FlightEvent.where({flightId, type: "LANDING"})
          .orderBy({occurredAt: "desc"}).limit(33).all()),
    ]);
    const report = buildFlightEvidenceE5({
      flightId, aircraftIcao: observations[0]?.aircraftIcao ?? "",
      observations: observations.slice(0,64), landings: landings.slice(0,32),
      complete: observations.length <= 64 && landings.length <= 32,
    });
    return Response.json(report, {headers});
  } catch {
    return Response.json({error: "Evidence unavailable"}, {status: 503, headers});
  }
}
