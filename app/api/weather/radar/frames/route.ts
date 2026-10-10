import { defaultCappiRadarProvider, defaultWeatherRadarProvider } from "@/lib/server/weather-radar/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const product = new URL(request.url).searchParams.get("product");
  if (product !== null && product !== "MAX_Z_MASKED" && product !== "PSEUDOCAPPI_2KM") return Response.json({ error: "Invalid radar product" }, { status: 400 });
  const catalog = await (product === "PSEUDOCAPPI_2KM" ? defaultCappiRadarProvider : defaultWeatherRadarProvider).getFrames();
  return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
}

