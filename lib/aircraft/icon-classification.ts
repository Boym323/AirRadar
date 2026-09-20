import type { AircraftView } from "./types";
import { TAR1090_CATEGORY_ICON_ASSETS, TAR1090_ICON_CODES, TAR1090_GROUND_SQUARE_ICON_ASSET, TAR1090_UNKNOWN_ICON_ASSET } from "./tar1090-icon-map";

export type CanonicalAircraftIconKind = "airplane" | "helicopter" | "glider" | "drone" | "ground";
export type AircraftPresentationKind = CanonicalAircraftIconKind | "a220" | "a320" | "a330" | "a350" | "a380" | "b717" | "b727" | "b737" | "b747" | "b757" | "b767" | "b777" | "b787" | "regional" | "turboprop" | "business-jet" | "general-aviation";
export type AircraftIconClassification = { kind: CanonicalAircraftIconKind; presentationKind: AircraftPresentationKind; asset: string | null; reason: string };

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
  if (/^C[0-3]$/.test(category)) return { kind: "ground", presentationKind: "ground", asset: TAR1090_CATEGORY_ICON_ASSETS[category as keyof typeof TAR1090_CATEGORY_ICON_ASSETS] ?? TAR1090_GROUND_SQUARE_ICON_ASSET, reason: `ADS-B category ${category}` };
  if (["GND", "GRND", "SERV", "EMER", "TWR"].includes(type)) return { kind: "ground", presentationKind: "ground", asset: TAR1090_CATEGORY_ICON_ASSETS.C0 ?? TAR1090_GROUND_SQUARE_ICON_ASSET, reason: `known ground/service type ${type}` };
  if (category === "A7") return { kind: "helicopter", presentationKind: "helicopter", asset: TAR1090_CATEGORY_ICON_ASSETS.A7 ?? null, reason: "ADS-B category A7 (rotorcraft)" };
  if (category === "B1") return { kind: "glider", presentationKind: "glider", asset: TAR1090_CATEGORY_ICON_ASSETS.B1 ?? null, reason: "ADS-B category B1 (glider)" };
  if (category === "B6") return { kind: "drone", presentationKind: "drone", asset: TAR1090_CATEGORY_ICON_ASSETS.B6 ?? null, reason: "ADS-B category B6 (UAV)" };
  const helicopter = /^(A139|A149|A169|A189|AS|EC|H(1[0-9]|2[05]|4[67]|5[36]|60|64)|MI(8|17|24)|NH90|R(22|44|66)|S(61|76|92)|PUMA|V22|B412)/.test(type) || /\b(HELICOPTER|ROTORCRAFT|MI[- ]?8|MI[- ]?17)\b/i.test([a.aircraftDescription, a.enrichment?.metadata?.aircraftDescription, a.enrichment?.metadata?.aircraftType].filter(Boolean).join(" "));
  if (helicopter) return { kind: "helicopter", presentationKind: "helicopter", asset: TAR1090_ICON_CODES.has(type) ? `/aircraft-icons-tar1090/${type}.svg` : (TAR1090_CATEGORY_ICON_ASSETS.A7 ?? null), reason: `known rotorcraft type ${type || "from metadata description"}` };
  const presentationKind: AircraftPresentationKind = /^(A318|A319|A320|A321|A19N|A20N|A21N)$/.test(type) ? "a320" : /^(B737|B738|B739|B37M|B38M|B39M|B3XM)$/.test(type) ? "b737" : /^(E1[3-9]|E2[0-9]|CRJ|RJ[0-9]|ARJ)/.test(type) ? "regional" : /^(AT4|AT7|DH8|DHC|SF3|F50|JS4)/.test(type) ? "turboprop" : /^(GLF|CL[0-9]|LJ[0-9]|E55|FA[0-9]|C5[0-9]|C68|C7[0-9]|PRM|H25|DA[0-9])/.test(type) ? "business-jet" : /^(C[0-4]|P28|P32|P46|PA[0-9]|PC1|TBM|BE[0-9]|SR2|M20|DA4)/.test(type) ? "general-aviation" : "airplane";
  if (TAR1090_ICON_CODES.has(type)) return { kind: "airplane", presentationKind, asset: `/aircraft-icons-tar1090/${type}.svg`, reason: `tar1090 type ${type}` };
  return { kind: "airplane", presentationKind, asset: TAR1090_UNKNOWN_ICON_ASSET, reason: "unknown aircraft type" };
}
