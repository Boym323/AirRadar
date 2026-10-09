import { getNavigationIntegrityService, getNavigationWriteMemoDiagnostics } from "@/lib/server/navigation-integrity";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ service: "OK", ...getNavigationIntegrityService().getDiagnostics(), navigationWriteMemo: getNavigationWriteMemoDiagnostics() }, { headers: { "Cache-Control": "no-store" } });
}
