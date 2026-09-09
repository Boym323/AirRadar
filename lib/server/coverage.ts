import type { CoverageMode } from "@/lib/aircraft/types";

export function parseCoverage(value: string | null | undefined): CoverageMode {
  return value?.trim().toLowerCase() === "extended" ? "extended" : "local";
}
