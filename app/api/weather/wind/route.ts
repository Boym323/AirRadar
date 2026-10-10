import { defaultAladinWindAloftProvider, defaultWindAloftProvider, isWindLevel, type WindLevelHpa } from "@/lib/server/wind-aloft";
import { defaultMapContextArchive } from "@/lib/server/map-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawLevel = Number(url.searchParams.get("level") ?? "300");
  const model = url.searchParams.get("model");
  if (model !== null && model !== "ICON-EU" && model !== "ALADIN-CE") return Response.json({ error: "Invalid wind model" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (!isWindLevel(rawLevel)) return Response.json({ error: "Invalid pressure level" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const requestedValid = url.searchParams.get("valid");
  if (requestedValid && !Number.isFinite(Date.parse(requestedValid))) return Response.json({ error: "Invalid valid time" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await (model === "ALADIN-CE" ? defaultAladinWindAloftProvider : defaultWindAloftProvider).getWind(rawLevel as WindLevelHpa, requestedValid);
    if (result.model === "ICON-EU") void defaultMapContextArchive.addWind(result); // Existing archives and consumers remain ICON-EU only.
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Wind forecast temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
