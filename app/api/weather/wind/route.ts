import { defaultWindAloftProvider, isWindLevel, type WindLevelHpa } from "@/lib/server/wind-aloft";
import { defaultMapContextArchive } from "@/lib/server/map-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawLevel = Number(url.searchParams.get("level") ?? "300");
  if (!isWindLevel(rawLevel)) return Response.json({ error: "Invalid pressure level" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const requestedValid = url.searchParams.get("valid");
  if (requestedValid && !Number.isFinite(Date.parse(requestedValid))) return Response.json({ error: "Invalid valid time" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await defaultWindAloftProvider.getWind(rawLevel as WindLevelHpa, requestedValid);
    void defaultMapContextArchive.addWind(result);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Wind forecast temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
