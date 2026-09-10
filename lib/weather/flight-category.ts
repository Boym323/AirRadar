import type { FlightCategory, MetarCloudLayer, TafCloudLayer } from "@/lib/weather/types";

function ceilingFt(clouds: Array<MetarCloudLayer | TafCloudLayer>): number | null {
  const ceilings = clouds
    .filter((cloud) => ["BKN", "OVC", "OVX", "VV"].includes(cloud.cover.toUpperCase()))
    .map((cloud) => cloud.baseFtAgl)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  return ceilings.length ? Math.min(...ceilings) : null;
}

/** FAA flight-category thresholds; the worse dimension wins. */
export function deriveFlightCategory(
  clouds: Array<MetarCloudLayer | TafCloudLayer>,
  visibilityMeters: number | null,
  visibilityLessThan = false,
): FlightCategory | null {
  const ceiling = ceilingFt(clouds);
  const visibilitySm = visibilityMeters === null || !Number.isFinite(visibilityMeters)
    ? null
    : visibilityMeters / 1609.344;
  if (ceiling === null && visibilitySm === null) return null;

  const ceilingCategory: FlightCategory = ceiling === null
    ? "VFR"
    : ceiling < 500 ? "LIFR"
      : ceiling < 1_000 ? "IFR"
        : ceiling <= 3_000 ? "MVFR"
          : "VFR";
  const visibilityCategory: FlightCategory = visibilitySm === null
    ? "VFR"
    : visibilityLessThan && visibilitySm <= 1 ? "LIFR"
      : visibilitySm < 1 ? "LIFR"
        : visibilitySm < 3 ? "IFR"
          : visibilitySm <= 5 ? "MVFR"
            : "VFR";
  const rank: Record<FlightCategory, number> = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };
  return rank[ceilingCategory] >= rank[visibilityCategory] ? ceilingCategory : visibilityCategory;
}
