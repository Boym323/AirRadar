import type { AircraftView } from "./types";
import { TAR1090_CATEGORY_ICON_ASSETS, TAR1090_ICON_CODES, TAR1090_GROUND_SQUARE_ICON_ASSET, TAR1090_UNKNOWN_ICON_ASSET } from "./tar1090-icon-map";

export type CanonicalAircraftIconKind = "airplane" | "helicopter" | "glider" | "drone" | "ground";
export type AircraftIconClassification = { kind: CanonicalAircraftIconKind; asset: string | null; reason: string };

type Input = Pick<AircraftView, "aircraftType" | "aircraftDescription" | "enrichment" | "category" | "onGround">;

function candidates(a: Input): string[] {
  const values = [a.enrichment?.metadata?.icaoTypeCode, a.aircraftType, a.enrichment?.metadata?.aircraftType, a.aircraftDescription];
  return [...new Set(values.flatMap(value => {
    if (!value) return [];
    const normalized = value.trim().toUpperCase().replaceAll("-", "");
    return [normalized, ...(value.toUpperCase().match(/[A-Z][A-Z0-9]{2,3}/g) ?? [])];
  }).filter(Boolean))];
}

export function classifyAircraftIcon(a: Input): AircraftIconClassification {
  const category = a.category?.trim().toUpperCase() ?? "";
  const types = candidates(a);
  const type = types.find(value => TAR1090_ICON_CODES.has(value)) ?? types[0] ?? "";
  if (/^C[0-3]$/.test(category)) return { kind: "ground", asset: TAR1090_CATEGORY_ICON_ASSETS[category as keyof typeof TAR1090_CATEGORY_ICON_ASSETS] ?? TAR1090_GROUND_SQUARE_ICON_ASSET, reason: `ADS-B category ${category}` };
  if (category === "A7") return { kind: "helicopter", asset: TAR1090_CATEGORY_ICON_ASSETS.A7 ?? null, reason: "ADS-B category A7 (rotorcraft)" };
  if (category === "B1") return { kind: "glider", asset: TAR1090_CATEGORY_ICON_ASSETS.B1 ?? null, reason: "ADS-B category B1 (glider)" };
  if (category === "B6") return { kind: "drone", asset: TAR1090_CATEGORY_ICON_ASSETS.B6 ?? null, reason: "ADS-B category B6 (UAV)" };
  const helicopter = /^(A139|A149|A169|A189|AS|EC|H(1[0-9]|2[05]|4[67]|5[36]|60|64)|MI(8|17|24)|NH90|R(22|44|66)|S(61|76|92)|PUMA|V22|B412)/.test(type) || /\b(HELICOPTER|ROTORCRAFT|MI[- ]?8|MI[- ]?17)\b/i.test([a.aircraftDescription, a.enrichment?.metadata?.aircraftDescription, a.enrichment?.metadata?.aircraftType].filter(Boolean).join(" "));
  if (helicopter) return { kind: "helicopter", asset: TAR1090_ICON_CODES.has(type) ? `/aircraft-icons-tar1090/${type}.svg` : (TAR1090_CATEGORY_ICON_ASSETS.A7 ?? null), reason: `known rotorcraft type ${type || "from metadata description"}` };
  if (a.onGround) return { kind: "ground", asset: TAR1090_GROUND_SQUARE_ICON_ASSET, reason: "onGround" };
  if (TAR1090_ICON_CODES.has(type)) return { kind: "airplane", asset: `/aircraft-icons-tar1090/${type}.svg`, reason: `tar1090 type ${type}` };
  return { kind: "airplane", asset: TAR1090_UNKNOWN_ICON_ASSET, reason: "unknown aircraft type" };
}
