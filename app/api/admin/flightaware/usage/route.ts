import { getFlightAwareApiKey } from "@/lib/server/config";
import { getFlightAwareAccountUsage } from "@/lib/server/flightaware-usage";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { createEnrichmentService, isFlightAwareEnabled } from "@/lib/server/providers";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const key = getFlightAwareApiKey();
  if (!key) return Response.json({ enabled: isFlightAwareEnabled(), providerAvailable: false, providerState: "missing-key", available: false, reason: "missing-key" }, { headers: { "Cache-Control": "no-store" } });
  const usage = await getFlightAwareAccountUsage(key);
  const diagnostics = createEnrichmentService({ persistAdsbDb: false }).getDiagnostics().flightPlan.provider;
  return Response.json({ enabled: isFlightAwareEnabled(), providerAvailable: diagnostics !== null, providerState: diagnostics?.providerState ?? "disabled", available: usage !== null, usage, diagnostics }, { headers: { "Cache-Control": "no-store" } });
}
