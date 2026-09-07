import { normalizeAircraftIdentifier } from "@/lib/aircraft/identity";

export function normalizeIcaoHex(value: unknown): string | null {
  return normalizeAircraftIdentifier(value);
}
