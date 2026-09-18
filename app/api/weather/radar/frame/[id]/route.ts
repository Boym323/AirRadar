import { defaultWeatherRadarProvider } from "@/lib/server/weather-radar/provider";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{12}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await defaultWeatherRadarProvider.getFrame(id);
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Weather radar frame unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

