import { describe, expect, it } from "vitest";
import { parseOurAirportsCsv } from "@/lib/airports/ourairports";

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
    expect(parseOurAirportsCsv(csv)).toEqual({ airports: [], skipped: 1 });
  });
});
