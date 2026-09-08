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
