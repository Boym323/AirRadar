import { getOgnStateService } from "@/lib/server/ogn-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const service = getOgnStateService();
  await service.waitForReady();
  return Response.json(service.getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
