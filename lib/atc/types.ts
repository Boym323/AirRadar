export type Coordinate = [lon: number, lat: number];
export type SectorPolygon = Coordinate[];

export interface AtcFrequency {
  frequencyMhz: number;
  label: string | null;
  isPrimary: boolean;
}

export interface AtcSector {
  id: string;
  name: string;
  atcCallsign: string | null;
  polygons: SectorPolygon[];
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  frequencies: AtcFrequency[];
  validFrom: string | null;
  validTo: string | null;
  country: string | null;
  source: string;
}

export interface AtcSectorMatch {
  sector: AtcSector;
  confidence: "inside" | "boundary";
}

export interface AtcActivity {
  callsign: string | null;
  frequencyMhz: number | null;
  status: "active" | "standby" | "unknown";
  source: string;
  observedAt: string;
}

export interface AtcLookup {
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  observedAt?: Date;
}
