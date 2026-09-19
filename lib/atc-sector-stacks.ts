export interface AtcSectorStack { id: "SOUTH" | "NORTH" | "WEST"; label: string; members: readonly string[]; }

// Canonical IDs verified against the imported Praha ACC sector set. NORTH and
// WEST are intentionally omitted until their vertical relationships are
// unambiguous in every supported AIRAC dataset.
export const ATC_SECTOR_STACKS: readonly AtcSectorStack[] = [
  { id: "SOUTH", label: "SOUTH", members: ["LKAAS", "LKAANSL", "LKAATB"] },
];
