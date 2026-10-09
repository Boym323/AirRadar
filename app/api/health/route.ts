import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";
import { toPublicHealthResponse } from "@/lib/server/public-health";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getAtcData } from "@/lib/server/providers";
import { measureRuntimeAsync } from "@/lib/server/runtime-performance";
import type { AtcDatasetMetadata } from "@/lib/atc/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bound each dependency independently. A timed-out database request may still
// finish in the background; this endpoint does not start retries or polling.
const READY_TIMEOUT_MS = 1500;
const DB_TIMEOUT_MS = 1500;
const ATC_TIMEOUT_MS = 1000;

function deadline<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("health_dependency_timeout")), ms);
      timer.unref?.();
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

const unavailableAtc: AtcDatasetMetadata = {
  status: "unavailable",
  source: null,
  sourceReference: null,
  effectiveDate: null,
  lastVerifiedAt: null,
  sectorCount: 0,
  transmitterCount: 0,
};

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("health", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  try {
    await measureRuntimeAsync("health.ready", 0, () => deadline(service.waitForReady(), READY_TIMEOUT_MS));
  } catch {
    return Response.json({ status: "degraded", error: "Service not ready" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const snapshot = service.getSnapshot();
  let database: { status: "ok" | "offline" | "not_configured" };

  if (!isDatabaseConfigured()) {
    database = { status: "not_configured" };
  } else {
    try {
      await measureRuntimeAsync("health.database", 0, () => deadline((async () => {
        const prisma = getPrisma();
        if (!prisma) throw new Error("Prisma client is not configured");
        await prisma.orm.public.Aircraft.limit(1).all();
      })(), DB_TIMEOUT_MS));
      database = { status: "ok" };
    } catch {
      database = { status: "offline" };
    }
  }

  const atc = await measureRuntimeAsync("health.atc", 0, () =>
    deadline(getAtcData().then((value) => value.metadata), ATC_TIMEOUT_MS)
      .catch(() => unavailableAtc));
  return Response.json(toPublicHealthResponse(snapshot, database, undefined, atc, service.getAlertStatus()), {
    headers: { "Cache-Control": "no-store" },
  });
}
