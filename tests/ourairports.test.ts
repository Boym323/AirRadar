import { describe, expect, it } from "vitest";
import { parseOurAirportsCsv, parseOurAirportsFrequenciesCsv, parseOurAirportsNavaidsCsv, parseOurAirportsRunwaysCsv } from "@/lib/airports/ourairports";

const header = "id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,gps_code,iata_code";

describe("OurAirports import", () => {
  it("selects global medium airports and local smaller landing sites", () => {
    const csv = `${header}\n1,EGLL,large_airport,Heathrow,51.4706,-0.4619,GB,London,EGLL,LHR\n2,LKPR,medium_airport,\"Prague, Ruzyně\",50.1008,14.26,CZ,Prague,LKPR,PRG\n3,LKKB,small_airport,Brno,49.1513,16.6944,CZ,Brno,LKKB,BRQ\n4,EDXX,small_airport,German strip,50,10,DE,Test,EDXX,\n5,USXX,small_airport,US strip,40,-100,US,Test,USXX,\n`;
    const result = parseOurAirportsCsv(csv);

    expect(result.airports).toEqual(expect.arrayContaining([
      expect.objectContaining({ icaoCode: "EGLL", iataCode: "LHR" }),
      expect.objectContaining({ icaoCode: "LKPR", name: "Prague, Ruzyně" }),
      expect.objectContaining({ icaoCode: "LKKB" }),
      expect.objectContaining({ icaoCode: "EDXX" }),
    ]));
    expect(result.airports).not.toEqual(expect.arrayContaining([expect.objectContaining({ icaoCode: "USXX" })]));
  });

  it("skips selected records without a valid ICAO code or coordinates", () => {
    const csv = `${header}\n1,123,medium_airport,Invalid,91,0,CZ,Test,,\n`;
    expect(parseOurAirportsCsv(csv)).toMatchObject({ airports: [], skipped: 1 });
  });

  it("keeps OurAirports ident separate from the canonical gps code", () => {
    const csv = `${header}\n10,CUSTOM1,medium_airport,Custom,50,14,CZ,Test,LKXX,LXX`;
    expect(parseOurAirportsCsv(csv).airports[0]).toMatchObject({ icaoCode: "LKXX", ourAirportsId: 10, ourAirportsIdent: "CUSTOM1" });
  });

  it("parses runway, frequency, and navaid records with tolerant values", () => {
    const runway = `id,airport_ident,length_ft,width_ft,surface,lighted,closed,le_ident,le_latitude_deg,le_longitude_deg,le_elevation_ft,le_heading_degT,le_displaced_threshold_ft,he_ident,he_latitude_deg,he_longitude_deg,he_elevation_ft,he_heading_degT,he_displaced_threshold_ft\n1,CUSTOM1,12188,148,UNKNOWN,1,0,06,50,14,120,60,12,24,50.01,14.03,121,240,20\n2,CUSTOM1,,,,1,1,06,91,14,,,,24,50,14,,,`;
    const frequency = `id,airport_ident,type,description,frequency_mhz\n2,CUSTOM1,TWR,"Tower, primary",118.705\n3,CUSTOM1,UNKNOWN,Backup,118.705`;
    const navaid = `id,filename,ident,name,type,frequency_khz,latitude_deg,longitude_deg,elevation_ft,iso_country,dme_frequency_khz,dme_channel,dme_latitude_deg,dme_longitude_deg,dme_elevation_ft,slaved_variation_deg,magnetic_variation_deg,usageType,power,associated_airport\n4,Custom_VOR_CZ,PRG,Prague,VOR-DME,115300,50.1,14.2,120,CZ,115300,100X,50.1,14.2,120,1.2,2.3,BOTH,HIGH,CUSTOM1\n5,Standalone_NDB_CZ,NER,Nera,NDB,365,50.2,14.3,100,CZ,,,,,,,,,`;
    expect(parseOurAirportsRunwaysCsv(runway).records[0]).toMatchObject({ surface: "UNKNOWN", lighted: true, closed: false, leIdent: "06" });
    expect(parseOurAirportsRunwaysCsv(runway).skipped).toBe(1);
    expect(parseOurAirportsFrequenciesCsv(frequency).records).toHaveLength(2);
    expect(parseOurAirportsFrequenciesCsv(frequency).records[0].frequencyMhz).toBe(118.705);
    expect(parseOurAirportsNavaidsCsv(navaid).records).toHaveLength(2);
    expect(parseOurAirportsNavaidsCsv(navaid).records[0]).toMatchObject({ type: "VOR-DME", frequencyKhz: 115300, associatedAirportIdent: "CUSTOM1" });
  });

  it("fails before importing when a required header changes", () => {
    expect(() => parseOurAirportsFrequenciesCsv("id,airport_ident,type,frequency_mhz\n1,CUSTOM1,TWR,118.7")).toThrow(/missing required column/);
  });
});
