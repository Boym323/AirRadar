import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";
import { toPublicHealthResponse } from "@/lib/server/public-health";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getAtcData } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("health");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  const snapshot = service.getSnapshot();
  let database: { status: "ok" | "offline" | "not_configured" };

  if (!isDatabaseConfigured()) {
    database = { status: "not_configured" };
  } else {
    try {
      const prisma = getPrisma();
      if (!prisma) throw new Error("Prisma client is not configured");
      await prisma.orm.public.Aircraft.limit(1).all();
      database = { status: "ok" };
    } catch {
      database = { status: "offline" };
    }
  }
  const atc = (await getAtcData()).metadata;
  return Response.json(toPublicHealthResponse(snapshot, database, undefined, atc, service.getAlertStatus()), {
    headers: { "Cache-Control": "no-store" },
  });
}
