import { defaultWeatherRadarArchive } from "@/lib/server/map-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{12}$/.test(id)) return new Response("Not found", { status: 404 });
  const bytes = await defaultWeatherRadarArchive.getFrame(id);
  return bytes ? new Response(bytes as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } }) : new Response("Not found", { status: 404 });
}
