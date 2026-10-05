import { OPERATIONAL_TWIN_VERSION } from "@/lib/operational-twin";
import { getOperationalTwinForAircraft } from "@/lib/server/operational-twin";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ hex: string }> },
): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let decoded: string;
  try {
    decoded = decodeURIComponent((await context.params).hex);
  } catch {
    return noStore({ version: OPERATIONAL_TWIN_VERSION, status: "unavailable", reason: "invalid_aircraft" }, 400);
  }

  const hex = normalizeIcaoHex(decoded);
  if (!hex) {
    return noStore({ version: OPERATIONAL_TWIN_VERSION, status: "unavailable", reason: "invalid_aircraft" }, 400);
  }

  try {
    return noStore(await getOperationalTwinForAircraft(hex, request.signal));
  } catch (error) {
    console.error("AirRadar Operational Digital Twin unavailable", error);
    return noStore({
      version: OPERATIONAL_TWIN_VERSION,
      status: "unavailable",
      generatedAt: new Date().toISOString(),
      icaoHex: hex,
      reason: "internal_error",
    }, 503);
  }
}
