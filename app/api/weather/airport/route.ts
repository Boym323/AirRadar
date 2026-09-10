import { getWeatherAirportsResponse } from "@/lib/server/weather-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return getWeatherAirportsResponse(request, url.searchParams.get("icao") ?? url.searchParams.get("ids"));
}
