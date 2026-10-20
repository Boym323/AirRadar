import type { AtcSector } from "@/lib/atc/types";
/**
 * AirRadar's civilian ATC layer uses the VHF air-ground voice allocation.
 * The lower 108-117.975 MHz navigation allocation and UHF allocations are
 * intentionally excluded from this panel.
 */
export const ATC_MIN_FREQUENCY_MHZ = 118;
export const ATC_MAX_FREQUENCY_MHZ = 136.975;

export function isSupportedAtcFrequencyMhz(value: number): boolean {
  return Number.isFinite(value)
    && value >= ATC_MIN_FREQUENCY_MHZ
    && value <= ATC_MAX_FREQUENCY_MHZ;
}

/** Channel/spacing provenance independent of retired sector traffic analytics. */
export function frequencyLabel(f: AtcSector["frequencies"][number]): { channel: string; carrierHz: number | null; spacing: "KHZ_25" | "KHZ_8_33" | "UNKNOWN" } {
  const channel = f.label?.trim() || f.frequencyMhz.toFixed(3);
  return { channel, carrierHz: Math.round(f.frequencyMhz * 1_000_000), spacing: f.spacing ?? "UNKNOWN" };
}
