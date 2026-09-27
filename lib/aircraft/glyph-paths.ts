export type CanonicalAircraftGlyphKind = "airplane" | "helicopter" | "glider" | "drone" | "ground";

export const CANONICAL_AIRCRAFT_GLYPH_PATHS: Record<CanonicalAircraftGlyphKind, string> = {
  airplane: "m16 2 4 12 8 5-1 2-9-2-2 10-2-10-9 2-1-2 8-5 4-12Z",
  helicopter: "M16 8v15M9 12h14M6 8h20M16 5v3M12 23h8l3 4H9l3-4Z",
  glider: "m16 3 3 12 10 5-1 2-10-2-2 9-2-9-10 2-1-2 10-5 3-12Z",
  drone: "M16 8v16M8 16h16M10 10h4v4h-4zM18 10h4v4h-4zM10 18h4v4h-4zM18 18h4v4h-4z",
  ground: "M10 11h12l3 8v5H7v-5l3-8Zm1 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
};

export function canonicalAircraftGlyphPath(kind: CanonicalAircraftGlyphKind): string {
  return CANONICAL_AIRCRAFT_GLYPH_PATHS[kind];
}
