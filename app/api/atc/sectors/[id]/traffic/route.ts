import { getSectorTrafficContext } from "@/lib/server/sector-traffic-context";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> { const { id } = await params; const at = new URL(request.url).searchParams.get("at") ?? undefined; try { const value = await getSectorTrafficContext(id, at); return value ? Response.json(value) : Response.json({ error: "Sector not found" }, { status: 404 }); } catch { return Response.json({ error: "Invalid UTC timestamp" }, { status: 400 }); } }
