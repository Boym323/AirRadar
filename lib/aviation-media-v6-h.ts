export const AIRPORT_MEDIA_MAX_LINKS = 6;
export type AirportMediaKind = "camera" | "audio";
export interface AirportMediaLink { title: string; url: string; kind: AirportMediaKind; }

export function mediaAirportKey(icao: string): string | null {
  const cleaned = icao.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(cleaned) ? `airradar-v6-h-media:${cleaned}` : null;
}

/** Public HTTPS outbound links. Playback is exclusively via the allowlisted opt-in embed resolver. */
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

/** An explicit publisher-enabled player only; never turn arbitrary URLs into iframes. */
export interface AirportMediaEmbed {
  provider: "youtube";
  iframeUrl: string;
}
/** Official YouTube embeds work for live broadcasts when the video owner permits it.
 * No scraping, stream re-hosting, audio extraction, playlists or channel live lookup.
 */
export function resolveAirportMediaEmbed(link: AirportMediaLink): AirportMediaEmbed | null {
  const safe = sanitizeAirportMediaLink(link);
  if (!safe) return null;
  const url = new URL(safe.url);
  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === "youtu.be") {
    if (!url.search || url.searchParams.has("t")) videoId = url.pathname.slice(1);
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:live|shorts|embed)\/([a-zA-Z0-9_-]{11})\/?$/);
      if (match && !url.search) videoId = match[1]!;
    }
  }
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  // Canonical fixed endpoint: never interpolate or trust user-supplied iframe hosts.
  return { provider: "youtube", iframeUrl: `https://www.youtube-nocookie.com/embed/${videoId}` };
}
