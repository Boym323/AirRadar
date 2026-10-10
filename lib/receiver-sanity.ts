/** Conservative bounds for receiver records; these are data-quality guards. */
export const MAX_PLAUSIBLE_RECEIVER_DISTANCE_KM = 1_000;
export const MAX_PLAUSIBLE_GROUND_SPEED_KT = 700;
export const MAX_PLAUSIBLE_FLIGHT_ALTITUDE_FT = 60_000;

export function plausibleReceiverDistanceKm(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    && value >= 0 && value <= MAX_PLAUSIBLE_RECEIVER_DISTANCE_KM ? value : null;
}
