import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { loadAtcContextDataset } from "@/lib/atc-context/engine";
import { analyzePublishedRoute, type RouteIntelligenceNetwork } from "@/lib/route-intelligence";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";
import { buildRouteWeatherContext } from "@/lib/weather/route-weather-context";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function mergedNetwork(dataset: Awaited<ReturnType<typeof loadAtcContextDataset>>): RouteIntelligenceNetwork | null {
  if (!dataset?.routeDocuments.length) return null;
  const first = dataset.routeDocuments[0]!;
  return {
    source: dataset.routeDocuments.length === 1
      ? first.source
      : {
          ...first.source,
          name: dataset.routeDocuments.map((document) => document.source.name).join(" + "),
          reference: dataset.routeDocuments.map((document) => document.source.reference).join(" | "),
        },
    routes: dataset.routeDocuments.flatMap((document) => document.routes),
  };
}

export async function GET(request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let decoded: string;
  try {
    decoded = decodeURIComponent((await context.params).hex);
  } catch {
    return noStore({ status: "unavailable", reason: "invalid_aircraft" }, 400);
  }
  const hex = normalizeIcaoHex(decoded);
  if (!hex) return noStore({ status: "unavailable", reason: "invalid_aircraft" }, 400);

  const live = getAircraftStateService().getAircraft(hex);
  if (!live || live.lat === null || live.lon === null) return noStore({ status: "unavailable", reason: "no_live_position" });

  try {
    const [dataset, sigmets] = await Promise.all([
      loadAtcContextDataset(),
      defaultAviationWeatherProvider.getSigmets(request.signal),
    ]);
    const network = mergedNetwork(dataset);
    if (!network) return noStore({ status: "unavailable", reason: "route_dataset_unavailable" });

    const route = analyzePublishedRoute({
      aircraftRoute: live.enrichment ?? null,
      aircraftPosition: {
        lat: live.lat,
        lon: live.lon,
        track: live.track,
        altitude: live.baroAltitude ?? live.altitude ?? live.geomAltitude,
      },
      atsNetwork: network,
    });
    return noStore(buildRouteWeatherContext(live, route, sigmets));
  } catch (error) {
    console.error("AirRadar route-weather context unavailable", error);
    return noStore({ status: "unavailable", reason: "route_weather_unavailable" }, 503);
  }
}
