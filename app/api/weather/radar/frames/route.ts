import { defaultWeatherRadarProvider, pseudocappiWeatherRadarProvider } from "@/lib/server/weather-radar/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const product = new URL(request.url).searchParams.get("product") ?? "MAX_Z_MASKED";
  if (product !== "MAX_Z_MASKED" && product !== "PSEUDOCAPPI_2KM") return Response.json({ error: "Unknown radar product" }, { status: 400 });
  const provider = product === "PSEUDOCAPPI_2KM" ? pseudocappiWeatherRadarProvider : defaultWeatherRadarProvider;
  const catalog = await provider.getFrames();
  return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
}

