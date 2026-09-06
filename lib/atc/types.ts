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
  service?: string | null;
  polygons: SectorPolygon[];
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  frequencies: AtcFrequency[];
  validFrom: string | null;
  validTo: string | null;
  country: string | null;
  source: string;
  sourceReference: string;
  lastVerifiedAt: string;
}

export interface AtcAssignment {
  sectorId: string;
  name: string;
  service: string | null;
  callsign: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesMhz: number[];
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  country: string | null;
  source: string;
  sourceReference: string;
  validFrom: string | null;
  validTo: string | null;
  lastVerifiedAt: string;
  confidence: "inside" | "boundary";
}

export interface AtcTransmitter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  service: string | null;
  frequencyMhz: number;
  notes: string | null;
  source: string;
  sourceReference: string;
  validFrom: string | null;
  validTo: string | null;
  lastVerifiedAt: string;
}

export interface AtcDatasetMetadata {
  status: "sample" | "configured" | "empty" | "unavailable";
  source: string | null;
  sourceReference: string | null;
  effectiveDate: string | null;
  lastVerifiedAt: string | null;
  sectorCount: number;
  transmitterCount: number;
}

export interface AtcDataResponse {
  sectors: AtcSector[];
  transmitters: AtcTransmitter[];
  metadata: AtcDatasetMetadata;
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
