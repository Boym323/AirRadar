export interface AirportRunway {
  id: number;
  airportId: number;
  sourceAirportIdent: string;
  lengthFt: number | null;
  widthFt: number | null;
  surface: string | null;
  lighted: boolean | null;
  closed: boolean | null;
  leIdent: string | null;
  leLatitude: number | null;
  leLongitude: number | null;
  leElevationFt: number | null;
  leHeadingDegT: number | null;
  leDisplacedThresholdFt: number | null;
  heIdent: string | null;
  heLatitude: number | null;
  heLongitude: number | null;
  heElevationFt: number | null;
  heHeadingDegT: number | null;
  heDisplacedThresholdFt: number | null;
}

export interface AirportFrequency {
  id: number;
  airportId: number;
  sourceAirportIdent: string;
  type: string;
  description: string | null;
  frequencyMhz: number;
}

export interface Navaid {
  id: number;
  filename: string;
  ident: string;
  name: string;
  type: string;
  frequencyKhz: number | null;
  latitude: number;
  longitude: number;
  elevationFt: number | null;
  country: string | null;
  dmeFrequencyKhz: number | null;
  dmeChannel: string | null;
  dmeLatitude: number | null;
  dmeLongitude: number | null;
  dmeElevationFt: number | null;
  slavedVariationDeg: number | null;
  magneticVariationDeg: number | null;
  usageType: string | null;
  power: string | null;
  associatedAirportId: number | null;
  associatedAirportIdent: string | null;
}

export interface AirportInfrastructure {
  runways: AirportRunway[];
  frequencies: AirportFrequency[];
  navaids: Navaid[];
}

export const EMPTY_AIRPORT_INFRASTRUCTURE: AirportInfrastructure = { runways: [], frequencies: [], navaids: [] };

export function feetToMeters(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 0.3048) : null;
}

export function formatRunwayDimension(lengthFt: number | null, widthFt: number | null): string {
  const length = feetToMeters(lengthFt); const width = feetToMeters(widthFt);
  if (length !== null && width !== null) return `${length.toLocaleString()} × ${width} m`;
  if (length !== null) return `${length.toLocaleString()} m`;
  if (width !== null) return `${width} m`;
  return "—";
}

export function formatFrequencyMhz(value: number): string { return Number.isFinite(value) ? value.toFixed(3) : "—"; }

const NAVAID_MHZ_TYPES = new Set(["VOR", "VOR-DME", "DME", "TACAN", "VORTAC"]);

export function formatNavaidFrequency(type: string, frequencyKhz: number | null): string {
  if (frequencyKhz === null || !Number.isFinite(frequencyKhz)) return "—";
  return NAVAID_MHZ_TYPES.has(type.trim().toUpperCase()) ? `${(frequencyKhz / 1000).toFixed(3)} MHz` : `${frequencyKhz} kHz`;
}

const FREQUENCY_TYPE_ORDER = ["ATIS", "DEL", "GND", "TWR", "APP", "DEP", "CTAF", "UNICOM", "RDO"];
export function sortAirportFrequencies<T extends Pick<AirportFrequency, "type" | "id">>(frequencies: readonly T[]): T[] {
  const priority = (type: string): number => { const index = FREQUENCY_TYPE_ORDER.indexOf(type.toUpperCase()); return index < 0 ? 1000 : index; };
  return [...frequencies].sort((a, b) => priority(a.type) - priority(b.type) || a.type.localeCompare(b.type) || a.id - b.id);
}

export function sortAirportRunways<T extends Pick<AirportRunway, "closed" | "leIdent" | "heIdent">>(runways: readonly T[]): T[] {
  return [...runways].sort((a, b) => Number(a.closed === true) - Number(b.closed === true) || `${a.leIdent ?? ""}/${a.heIdent ?? ""}`.localeCompare(`${b.leIdent ?? ""}/${b.heIdent ?? ""}`, undefined, { numeric: true }) || 0);
}

export function runwaySurfaceLabel(surface: string | null): string {
  const labels: Record<string, string> = { ASP: "Asphalt", ASPH: "Asphalt", CON: "Concrete", CONC: "Concrete", GRS: "Grass", GRSV: "Grass", TURF: "Turf", GRE: "Gravel", WATER: "Water" };
  return surface ? labels[surface.toUpperCase()] ?? surface : "—";
}
