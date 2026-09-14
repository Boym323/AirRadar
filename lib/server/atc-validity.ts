/** Inclusive validity interval check shared by stored and in-memory ATC data. */
export function isAtcValidityValid(
  validFrom: string | null,
  validTo: string | null,
  observedAt: Date | number = Date.now(),
): boolean {
  const time = observedAt instanceof Date ? observedAt.getTime() : observedAt;
  if (!Number.isFinite(time)) return false;
  const from = validFrom === null ? Number.NEGATIVE_INFINITY : Date.parse(validFrom);
  const to = validTo === null ? Number.POSITIVE_INFINITY : Date.parse(validTo);
  if (!Number.isFinite(from) && from !== Number.NEGATIVE_INFINITY) return false;
  if (!Number.isFinite(to) && to !== Number.POSITIVE_INFINITY) return false;
  return time >= from && time <= to;
}
