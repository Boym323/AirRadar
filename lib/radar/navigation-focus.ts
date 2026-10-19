/** Normalize and validate a bounded map focus token from the URL. */
export interface NavPointFocus {
  kind: "NAVAID" | "FIX";
  id: string;
  lat: number;
  lon: number;
}

export function parseNavPointFocus(value: string | null): NavPointFocus | null {
  if (!value) return null;
  const [kind, id, latText, lonText, ...extra] = value.split(":");
  if (extra.length || (kind !== "NAVAID" && kind !== "FIX") || !/^[A-Z0-9]{2,8}$/.test(id ?? "")) return null;
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { kind, id, lat, lon };
}
