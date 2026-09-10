/** Parse a statute-mile visibility value from the Aviation Weather API. */
export function parseStatuteMiles(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;

  let normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.endsWith("SM")) normalized = normalized.slice(0, -2).trim();
  if (normalized.startsWith("M") || normalized.startsWith("P")) normalized = normalized.slice(1).trim();
  if (normalized.endsWith("+")) normalized = normalized.slice(0, -1).trim();
  if (!normalized) return null;

  const parts = normalized.split(/\s+/);
  let parsed: number | null = null;
  if (parts.length === 2) {
    const whole = Number(parts[0]);
    const fraction = parseSimpleFraction(parts[1]);
    parsed = Number.isFinite(whole) && fraction !== null ? whole + fraction : null;
  } else if (parts.length === 1 && normalized.includes("/")) {
    parsed = parseSimpleFraction(normalized);
  } else if (parts.length === 1) {
    const numeric = Number(normalized);
    parsed = Number.isFinite(numeric) ? numeric : null;
  }

  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseSimpleFraction(value: string): number | null {
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const numerator = Number(parts[0].trim());
  const denominator = Number(parts[1].trim());
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator < 0 || denominator <= 0) return null;
  return numerator / denominator;
}
