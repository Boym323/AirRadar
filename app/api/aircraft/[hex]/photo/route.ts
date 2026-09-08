import type { AircraftPhotoApiResponse } from "@/lib/aircraft/photo";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getAircraftDetail } from "@/lib/server/history";
import { getAircraftPhoto } from "@/lib/server/aircraft-photo-provider";
import { isAircraftPhotosEnabled } from "@/lib/server/config";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { normalizeIcaoHex } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function response(body: AircraftPhotoApiResponse, status = 200): Response {
  return Response.json(body, { status, headers: noStoreHeaders() });
}

async function existingRegistration(icaoHex: string): Promise<string | null> {
  try {
    const live = getAircraftStateService().getAircraft(icaoHex);
    const liveRegistration = live?.registration?.trim() || live?.enrichment?.metadata?.registration?.trim();
    if (liveRegistration) return liveRegistration;
  } catch {
    // The optional live state must not prevent the photo lookup.
  }

  try {
    const detail = await getAircraftDetail(icaoHex, { includeHistorySummary: false });
    return detail.aircraft?.registration?.trim() || null;
  } catch {
    // PostgreSQL is optional for live radar and for photo lookup.
    return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ hex: string }> }): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraftPhoto");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (!isAircraftPhotosEnabled()) {
    return response({ photo: null, enabled: false, cached: false, provider: "planespotters" });
  }

  const { hex: rawHex } = await context.params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawHex);
  } catch {
    return response({ photo: null, enabled: true, cached: false, provider: "planespotters" }, 400);
  }
  const icaoHex = normalizeIcaoHex(decoded);
  if (!icaoHex) {
    return response({ photo: null, enabled: true, cached: false, provider: "planespotters" }, 400);
  }

  try {
    const registration = await existingRegistration(icaoHex);
    const result = await getAircraftPhoto(icaoHex, registration);
    return response({ photo: result.photo, enabled: true, cached: result.cached, provider: "planespotters" });
  } catch {
    return response({ photo: null, enabled: true, cached: false, provider: "planespotters" });
  }
}
