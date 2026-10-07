import { isWatchlistSessionValid, requireWatchlistMutation } from "@/lib/server/watchlist-auth";
import { deleteSpotterSavedSpot, listSpotterSavedSpots, saveSpotterSavedSpot } from "@/lib/server/spotter-saved-spots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  return Response.json({ spots: await listSpotterSavedSpots() }, { headers });
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.name !== "string") throw new Error("name is required");
    const spot = await saveSpotterSavedSpot({
      name: body.name,
      centerLat: Number(body.centerLat),
      centerLon: Number(body.centerLon),
      radiusMeters: Number(body.radiusMeters),
    });
    return Response.json({ spot }, { status: 201, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Saved spot could not be created" },
      { status: 400, headers },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireWatchlistMutation(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) throw new Error("id is required");
    await deleteSpotterSavedSpot(id);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Saved spot could not be removed" },
      { status: 400, headers },
    );
  }
}
