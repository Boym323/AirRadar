import { getWeatherAirportResponse } from "@/lib/server/weather-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ icao: string }> }): Promise<Response> {
  const { icao } = await context.params;
  return getWeatherAirportResponse(request, icao);
}
