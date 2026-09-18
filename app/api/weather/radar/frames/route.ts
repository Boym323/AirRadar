import { defaultWeatherRadarProvider } from "@/lib/server/weather-radar/provider";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const catalog = await defaultWeatherRadarProvider.getFrames();
  return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
}

