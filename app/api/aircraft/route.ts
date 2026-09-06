import { getAircraftStateService } from "@/lib/server/aircraft-state";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(service.getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
