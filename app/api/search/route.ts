import { searchGlobal, validateSearchQuery } from "@/lib/server/search";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("search");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const rawQuery = new URL(request.url).searchParams.get("q");
  const validation = validateSearchQuery(rawQuery);
  if (validation.error) {
    const message = validation.error === "too_short"
      ? "Search query must contain at least 2 characters"
      : validation.error === "too_long"
        ? "Search query is too long"
        : "Search query is invalid";
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(await searchGlobal(validation.query), {
    headers: { "Cache-Control": "no-store" },
  });
}
