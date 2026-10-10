import type { RxwWaypoint, RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";

export const RXW_FPN_MAX_TEXT_LENGTH = 8192;
export const RXW_FPN_MAX_WAYPOINTS = 80;
const MAX_FIELDS = 24;
const KNOWN_ROUTE_FIELDS = new Set(["F", "CR"]);

/** Convert ACARS H1/FPN millidegree coordinates (not degrees/minutes). */
export function parseFpnCoordinate(value: string): { lat: number; lon: number } | null {
  const match = /^([NS])(\d{5})([EW])(\d{6})$/.exec(value.toUpperCase());
  if (!match) return null;
  const lat = Number(match[2]) / 1000 * (match[1] === "S" ? -1 : 1);
  const lon = Number(match[4]) / 1000 * (match[3] === "W" ? -1 : 1);
  return lat <= 90 && lon <= 180 ? { lat, lon } : null;
}

function airport(value: string): string | null {
  const code = value.toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(code) || ["ZZZZ", "XXXX", "XXX", "UNK", "NIL"].includes(code)) return null;
  return code;
}

function flight(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(normalized) ? normalized : null;
}

function airway(value: string): boolean {
  return /^(?:[A-Z]{1,2}\d{1,4}[A-Z]?|[A-Z]{1,2}\d{1,3}[A-Z]\d?)$/.test(value);
}

type ParseResult = Omit<RxwWaypointPlan, "icaoHex" | "stationId" | "observedAt" | "source" | "confidence">;

/**
 * Strict, independent H1/FPN decoder. Only allowlisted route fields are read
 * from the transient ACARS body; the body is never stored or returned.
 *
 * There is no checksum algorithm available, so the final 4-hex suffix is only
 * stripped, never treated as a verified checksum.
 * Multipart payloads are not reconstructed; incomplete messages fail closed.
 */
export function parseRxwH1Fpn(text: unknown, acarsFlight: unknown): ParseResult | null {
  if (typeof text !== "string" || text.length > RXW_FPN_MAX_TEXT_LENGTH) return null;
  const body = text.trim();
  if (!/^FPN\//i.test(body) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) return null;
  const groups = body.split(":");
  if (groups.length < 7 || groups.length % 2 !== 1 || groups.length > MAX_FIELDS * 2 + 1) return null;
  const header = groups[0].toUpperCase();
  const headerMatch = /^FPN\/(?:(?:FN([A-Z0-9]{2,10})\/)?(RP|RI))$/.exec(header);
  if (!headerMatch) return null;
  const status = headerMatch[2] === "RP" ? "planned" : "inactive";
  const reportedFlight = flight(typeof acarsFlight === "string" ? acarsFlight : "");
  const headerFlight = headerMatch[1] ?? null;
  if (headerFlight && reportedFlight && headerFlight !== reportedFlight) return null;
  const flightId = headerFlight ?? reportedFlight;
  if (!flightId) return null;

  const terminal = groups.at(-1) ?? "";
  // Without an actual checksum, the last four coordinate digits are also
  // hexadecimal. Do not mistake them for a checksum and silently truncate a
  // valid final fix into an invalid one.
  const lastRouteToken = terminal.split(".").at(-1)?.split(",").at(-1)?.trim() ?? "";
  if (parseFpnCoordinate(lastRouteToken)) return null;
  if (!/[0-9A-F]{4}$/.test(terminal.toUpperCase())) return null;
  groups[groups.length - 1] = terminal.slice(0, -4);

  let origin: string | null = null;
  let destination: string | null = null;
  const routeValues: Array<{ key: string; value: string }> = [];
  for (let i = 1; i < groups.length; i += 2) {
    const key = groups[i].toUpperCase();
    const value = groups[i + 1].toUpperCase().trim();
    if (!value || value.length > RXW_FPN_MAX_TEXT_LENGTH) return null;
    if (key === "DA") {
      const parsed = airport(value);
      if (!parsed || (origin && origin !== parsed)) return null;
      origin = parsed;
    } else if (key === "AA") {
      const parsed = airport(value);
      if (!parsed || (destination && destination !== parsed)) return null;
      destination = parsed;
    } else if (KNOWN_ROUTE_FIELDS.has(key)) {
      routeValues.push({ key, value });
    }
  }
  if (!origin || !destination || origin === destination) return null;
  const preferred = routeValues.filter((item) => item.key === "F");
  const candidates = preferred.length ? preferred : routeValues.filter((item) => item.key === "CR" && item.value.includes("."));
  if (!candidates.length) return null;
  const waypoints: RxwWaypoint[] = [];
  let pendingAirway: string | null = null;
  let gap = false;
  for (const [segmentIndex, segment] of candidates.entries()) {
    // Repeated F fields may be unrelated procedure legs; never join them.
    if (segmentIndex > 0) { gap = true; pendingAirway = null; }
    for (const part of segment.value.split(".")) {
      if (!part) continue;
      if (airway(part)) {
        pendingAirway = part;
        continue;
      }
      const components = part.split(",");
      const coordinate = components.length === 1 ? parseFpnCoordinate(components[0])
        : components.length === 2 ? parseFpnCoordinate(components[1]) : null;
      const name = components.length === 1 && coordinate ? components[0]
        : components.length === 2 && coordinate ? components[0]
        : components.length === 1 && /^[A-Z0-9]{2,8}$/.test(components[0]) ? components[0] : null;
      if (!name || ["VECTOR", "DISCO", "DISCONT", "DIRECT", "DCT"].includes(name)) {
        gap = true;
        pendingAirway = null;
        continue;
      }
      if (waypoints.length >= RXW_FPN_MAX_WAYPOINTS) return null;
      const previous = waypoints.at(-1);
      const isConsecutiveDuplicate = previous?.name === name && previous.lat === (coordinate?.lat ?? null)
        && previous.lon === (coordinate?.lon ?? null);
      if (!isConsecutiveDuplicate) {
        waypoints.push({
          name,
          lat: coordinate?.lat ?? null,
          lon: coordinate?.lon ?? null,
          via: pendingAirway,
          breakBefore: gap || waypoints.length === 0,
        });
      }
      gap = false;
      pendingAirway = null;
    }
  }
  if (waypoints.length < 2) return null;
  return {
    flight: flightId,
    origin,
    destination,
    status,
    waypoints,
    positionedCount: waypoints.filter((point) => point.lat !== null).length,
  };
}
