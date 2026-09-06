import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const service = getAircraftStateService();
  await service.waitForReady();
  const snapshot = service.getSnapshot();
  let database: { status: string; message?: string };

  if (!isDatabaseConfigured()) {
    database = { status: "not_configured", message: "DATABASE_URL is not set" };
  } else {
    try {
      const prisma = getPrisma();
      if (!prisma) throw new Error("Prisma client is not configured");
      await prisma.orm.public.Aircraft.limit(1).all();
      database = { status: "ok" };
    } catch (error) {
      database = { status: "offline", message: error instanceof Error ? error.message : "Database unavailable" };
    }
  }

  const readsbStatus = snapshot.provider === "mock"
    ? "demo"
    : snapshot.readsbOnline ? "ok" : "offline";
  const degraded = readsbStatus === "offline" || database.status === "offline";
  return Response.json({
    status: degraded ? "degraded" : "ok",
    application: { status: "ok", name: "AirRadar" },
    database,
    readsb: {
      status: readsbStatus,
      provider: snapshot.provider,
      lastUpdate: snapshot.lastReadsbUpdate,
      error: snapshot.lastError,
    },
    aircraftCount: snapshot.aircraft.length,
    lastReadsbUpdate: snapshot.lastReadsbUpdate,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
