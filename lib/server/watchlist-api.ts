import { WatchlistValidationError } from "@/lib/server/watchlist-store";

export function watchlistValidationResponse(error: WatchlistValidationError): Response {
  const messages: Record<WatchlistValidationError["code"], string> = {
    invalid_rule: "Invalid watchlist rule",
    invalid_icao: "Invalid ICAO hex",
    invalid_distance: "Distance must be a positive finite number",
    invalid_cooldown: "Cooldown is below the configured minimum",
    invalid_eta_threshold: "ETA threshold must be an integer from 1 to 120 minutes",
    invalid_destination: "Destination must be a four-letter ICAO code and requires an ETA threshold",
    duplicate_rule: "A rule with this id already exists",
  };
  const status = error.code === "duplicate_rule" ? 409 : 400;
  return Response.json({ error: messages[error.code], code: error.code }, { status, headers: { "Cache-Control": "no-store" } });
}
