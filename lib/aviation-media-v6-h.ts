export const AIRPORT_MEDIA_MAX_LINKS = 6;
export type AirportMediaKind = "camera" | "audio";
export interface AirportMediaLink { title: string; url: string; kind: AirportMediaKind; }

export function mediaAirportKey(icao: string): string | null {
  const cleaned = icao.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(cleaned) ? `airradar-v6-h-media:${cleaned}` : null;
}

/** Public HTTPS outbound links only. No embedded playback or server-side URL fetching. */
export function sanitizeAirportMediaLink(value: unknown): AirportMediaLink | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<AirportMediaLink>;
  if (typeof input.title !== "string" || typeof input.url !== "string") return null;
  const title = input.title.trim().slice(0, 80);
  if (!title || input.url.length > 500 || (input.kind !== "camera" && input.kind !== "audio")) return null;
  try {
    const url = new URL(input.url);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || !host.includes(".") || host.startsWith("[") || host.endsWith(".local")) return null;
    if (/^(127|10|0|192\.168|169\.254)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    if (url.port && url.port !== "443") return null;
    return { title, url: url.toString(), kind: input.kind };
  } catch {
    return null;
  }
}
export function parseAirportMediaLinks(raw: string | null): AirportMediaLink[] {
  if (!raw || raw.length > 6_000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.slice(0, AIRPORT_MEDIA_MAX_LINKS).flatMap((item) => {
      const valid = sanitizeAirportMediaLink(item);
      if (!valid || seen.has(valid.url)) return [];
      seen.add(valid.url);
      return [valid];
    });
  } catch { return []; }
}
export function addAirportMediaLink(current: readonly AirportMediaLink[], value: unknown): AirportMediaLink[] {
  const link = sanitizeAirportMediaLink(value);
  if (!link || current.some((item) => item.url === link.url)) return [...current];
  return [...current.slice(0, AIRPORT_MEDIA_MAX_LINKS - 1), link];
}
