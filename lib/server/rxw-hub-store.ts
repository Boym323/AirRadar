import type { RxwCommunication } from "@/lib/aircraft/rxw-communications";

/** No raw message text, decoded payloads or operational conversations are retained. */
export const RXW_MESSAGE_TTL_MS = 2 * 60 * 60_000;
export const RXW_MAX_AIRCRAFT = 512;
export const RXW_MAX_MESSAGES_PER_AIRCRAFT = 20;
export const RXW_MAX_SEEN_UIDS = 12_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function shortString(value: unknown, length: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > length || /[\x00-\x1f\x7f]/.test(trimmed)) return null;
  return trimmed;
}

/** Only an actual ICAO24 identity is safe to match; never infer one from callsign. */
export function rxwIcaoHex(raw: Record<string, unknown>): string | null {
  const hex = shortString(raw.icao_hex, 6);
  if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  if (typeof raw.icao === "number" && Number.isInteger(raw.icao) && raw.icao >= 0 && raw.icao <= 0xffffff) {
    return raw.icao.toString(16).toUpperCase().padStart(6, "0");
  }
  // Some decoder versions expose the hexadecimal ICAO identifier as a string.
  const fallback = shortString(raw.icao, 6);
  return fallback && /^[0-9a-fA-F]{6}$/.test(fallback) ? fallback.toUpperCase() : null;
}

export function normalizeRxwCommunication(value: unknown, now = Date.now()): RxwCommunication | null {
  const raw = record(value);
  if (!raw) return null;
  const icaoHex = rxwIcaoHex(raw);
  const uid = shortString(raw.uid, 128);
  const protocol = shortString(raw.message_type, 24);
  const stationId = shortString(raw.station_id, 64);
  if (!icaoHex || !uid || !protocol || !stationId) return null;

  const seconds = typeof raw.timestamp === "number" ? raw.timestamp : Number(raw.timestamp);
  const timestampMs = seconds > 1e12 ? seconds : seconds * 1000;
  if (!Number.isFinite(timestampMs) || timestampMs < now - RXW_MESSAGE_TTL_MS || timestampMs > now + 5 * 60_000) return null;

  const numericFreq = typeof raw.freq === "number" ? raw.freq : Number(raw.freq);
  const frequencyMhz = Number.isFinite(numericFreq) && numericFreq > 0 && numericFreq < 500
    ? Math.round(numericFreq * 10000) / 10000
    : null;

  return {
    uid,
    icaoHex,
    timestamp: new Date(timestampMs).toISOString(),
    protocol,
    stationId,
    frequencyMhz,
    label: shortString(raw.label, 16),
  };
}

/** Process-local bounded metadata cache. Never persists or publishes raw ACARS message bodies. */
export class RxwHubMessageStore {
  private readonly aircraft = new Map<string, RxwCommunication[]>();
  private readonly seen = new Map<string, number>();
  private accepted = 0;

  ingest(input: unknown, now = Date.now()): boolean {
    const message = normalizeRxwCommunication(input, now);
    if (!message) return false;
    const key = message.stationId + ":" + message.uid;
    if (this.seen.has(key)) return false;

    this.seen.set(key, now);
    while (this.seen.size > RXW_MAX_SEEN_UIDS) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }

    const previous = this.aircraft.get(message.icaoHex) ?? [];
    const updated = [message, ...previous.filter((item) => Date.parse(item.timestamp) >= now - RXW_MESSAGE_TTL_MS)]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, RXW_MAX_MESSAGES_PER_AIRCRAFT);
    this.aircraft.delete(message.icaoHex);
    this.aircraft.set(message.icaoHex, updated);
    while (this.aircraft.size > RXW_MAX_AIRCRAFT) {
      const oldest = this.aircraft.keys().next().value;
      if (oldest === undefined) break;
      this.aircraft.delete(oldest);
    }
    this.accepted += 1;
    return true;
  }

  list(icaoHex: string, now = Date.now()): RxwCommunication[] {
    if (!/^[0-9A-F]{6}$/.test(icaoHex)) return [];
    const list = this.aircraft.get(icaoHex) ?? [];
    const fresh = list.filter((item) => Date.parse(item.timestamp) >= now - RXW_MESSAGE_TTL_MS);
    if (fresh.length !== list.length) {
      if (fresh.length) this.aircraft.set(icaoHex, fresh);
      else this.aircraft.delete(icaoHex);
    }
    return fresh.slice();
  }

  stats(): { aircraft: number; accepted: number; uids: number } {
    return { aircraft: this.aircraft.size, accepted: this.accepted, uids: this.seen.size };
  }

  clear(): void {
    this.aircraft.clear();
    this.seen.clear();
    this.accepted = 0;
  }
}
