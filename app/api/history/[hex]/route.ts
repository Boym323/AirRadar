import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAircraftHistory } from "@/lib/server/history";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const { hex } = await context.params;
  const normalizedHex = decodeURIComponent(hex).toUpperCase();
  const service = getAircraftStateService();
  await service.waitForReady();
  const current = service.getSnapshot().aircraft.find((item) => item.icaoHex === normalizedHex) ?? null;
  const history = await getAircraftHistory(normalizedHex, current);
  return Response.json({ icaoHex: normalizedHex, ...history }, { headers: { "Cache-Control": "no-store" } });
}
