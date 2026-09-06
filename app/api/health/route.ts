import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";

function safeError(message: string | null): string | null {
  if (!message) return null;
  return message
    .replace(/((?:postgres(?:ql)?):\/\/[^\s/@:]+:)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:password|passwd|secret|token|api[_-]?key|key)=)[^&\s]*/gi, "$1[redacted]")
    .replace(/(x-api-key\s*:\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 240);
}

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
    } catch {
      database = { status: "offline", message: "PostgreSQL query failed" };
    }
  }

  const readsbStatus = snapshot.provider === "mock"
    ? "demo"
    : snapshot.sourceOnline ? "ok" : "offline";
  const databaseRequired = snapshot.provider !== "mock";
  const degraded = readsbStatus === "offline"
    || database.status === "offline"
    || databaseRequired && database.status === "not_configured";
  return Response.json({
    status: degraded ? "degraded" : "ok",
    application: { status: "ok", name: "AirRadar" },
    database,
    source: {
      status: readsbStatus,
      provider: snapshot.provider,
      lastUpdate: snapshot.lastSourceUpdate,
      error: safeError(snapshot.sourceError),
    },
    readsb: {
      status: readsbStatus,
      provider: snapshot.provider,
      lastUpdate: snapshot.lastReadsbUpdate,
      error: safeError(snapshot.lastError),
    },
    aircraftCount: snapshot.aircraft.length,
    lastReadsbUpdate: snapshot.lastReadsbUpdate,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
