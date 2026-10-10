import { defaultWeatherRadarProvider, pseudocappiWeatherRadarProvider } from "@/lib/server/weather-radar/provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const product = new URL(request.url).searchParams.get("product") ?? "MAX_Z_MASKED";
  if (product !== "MAX_Z_MASKED" && product !== "PSEUDOCAPPI_2KM") return new Response("Unknown radar product", { status: 400 });
  if (!/^\d{12}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    const provider = product === "PSEUDOCAPPI_2KM" ? pseudocappiWeatherRadarProvider : defaultWeatherRadarProvider;
    const bytes = await provider.getFrame(id);
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Weather radar frame unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

