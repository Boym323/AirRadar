import { WatchlistValidationError } from "@/lib/server/watchlist-store";

export function watchlistValidationResponse(error: WatchlistValidationError): Response {
  const messages: Record<WatchlistValidationError["code"], string> = {
    invalid_rule: "Invalid watchlist rule",
    invalid_icao: "Invalid ICAO hex",
    invalid_distance: "Distance must be a positive finite number",
    invalid_cooldown: "Cooldown is below the configured minimum",
    duplicate_rule: "A rule with this id already exists",
  };
  const status = error.code === "duplicate_rule" ? 409 : 400;
  return Response.json({ error: messages[error.code], code: error.code }, { status, headers: { "Cache-Control": "no-store" } });
}
