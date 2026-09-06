import type { AtcSector, AtcTransmitter } from "@/lib/atc/types";
import type { AtcSectorProvider } from "@/lib/server/provider";

// A deliberately small sample covering the Prague receiver. Replace with an
// AIP-backed provider when a licensed/maintained sector dataset is available.
export const SAMPLE_ATC_SECTORS: AtcSector[] = [
  {
    id: "CZ-PRAGUE-RADAR",
    name: "Praha Radar",
    atcCallsign: "PRAGUE RADAR",
    service: "Area control",
    polygons: [[
      [11.4, 48.8], [18.5, 48.8], [18.5, 51.4], [11.4, 51.4], [11.4, 48.8],
    ]],
    lowerAltitudeFt: 24500,
    upperAltitudeFt: null,
    frequencies: [
      { frequencyMhz: 127.350, label: "Praha Radar", isPrimary: true },
      { frequencyMhz: 128.650, label: "Praha Radar", isPrimary: false },
    ],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "AirRadar sample data",
  },
  {
    id: "CZ-PRAGUE-APPROACH",
    name: "Praha Approach",
    atcCallsign: "PRAGUE APPROACH",
    service: "Approach",
    polygons: [[
      [13.4, 49.4], [15.5, 49.4], [15.5, 50.8], [13.4, 50.8], [13.4, 49.4],
    ]],
    lowerAltitudeFt: 3000,
    upperAltitudeFt: 24500,
    frequencies: [
      { frequencyMhz: 118.100, label: "Approach", isPrimary: true },
      { frequencyMhz: 119.175, label: "Approach", isPrimary: false },
    ],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "AirRadar sample data",
  },
];

export const SAMPLE_ATC_TRANSMITTERS: AtcTransmitter[] = [
  { id: "LKPR-APP", name: "Praha Approach", latitude: 50.1008, longitude: 14.26, service: "Approach", frequencyMhz: 118.1, notes: "Sample transmitter location" },
  { id: "LKPR-RADAR", name: "Praha Radar", latitude: 50.0755, longitude: 14.4378, service: "Area control", frequencyMhz: 127.35, notes: "Sample transmitter location" },
];

export class SampleAtcSectorProvider implements AtcSectorProvider {
  readonly name = "sample-atc";

  async getSectors(): Promise<AtcSector[]> {
    return SAMPLE_ATC_SECTORS;
  }
}
