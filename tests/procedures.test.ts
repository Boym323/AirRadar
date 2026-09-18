import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/procedures/route";
import { clearProcedureRepositoryCache, ProcedureParseError, ProcedureValidationError, ProcedureRepository, parseOfficialProcedureSource, validateProcedureDataset } from "@/lib/procedures";
import type { ProcedureSource } from "@/lib/route-intelligence/contracts";

const source: ProcedureSource = { countryCode: "CZ", provider: "AIM test eAIP", reference: "https://aim.rlp.cz/eaip/test", effectiveDate: "2026-09-03", airacCycle: "2609", amendment: "AIP AMDT 10/26", retrievedAt: "2026-09-17T20:00:00Z" };
const point = (id: string, name: string, lat: number, lon: number) => `<span data-point-id="${id}" data-point-name="${name}" data-point-kind="FIX" data-lat="${lat}" data-lon="${lon}" data-source-reference="fixture">${name}</span>`;
const html = `<table>
<tr data-procedure-type="SID" data-procedure-designator="TACLO" data-transition="BODAL" data-runways="24" data-leg-sequence="1" data-leg-type="TRACK" data-from-point-id="RW24" data-to-point-id="TACLO" data-course-deg="240">${point("RW24", "RWY24", 50.1, 14.25)}${point("TACLO", "TACLO", 50.2, 14.4)}</tr>
<tr data-procedure-type="SID" data-procedure-designator="TACLO" data-transition="BODAL" data-runways="24" data-leg-sequence="2" data-discontinuity="true">DISCONTINUITY</tr>
<tr data-procedure-type="SID" data-procedure-designator="TACLO" data-transition="BODAL" data-runways="24" data-leg-sequence="3" data-leg-type="DIRECT" data-from-point-id="TACLO" data-to-point-id="BODAL">${point("TACLO", "TACLO", 50.2, 14.4)}${point("BODAL", "BODAL", 50.3, 14.6)}</tr>
</table>`;

afterEach(() => { delete process.env.PROCEDURES_DATASET_PATH; clearProcedureRepositoryCache(); });

describe("SID/STAR procedure pipeline", () => {
  it("parses a valid SID with transition, runway applicability, ordered legs and discontinuity", () => {
    const result = parseOfficialProcedureSource(html, { airportIcao: "LKPR", source });
    expect(result.procedures[0]).toMatchObject({ airportIcao: "LKPR", type: "SID", designator: "TACLO", transition: "BODAL", runwayApplicability: { kind: "INCLUDE", runwayDesignators: ["24"] } });
    expect(result.procedures[0].legs.map((leg) => leg.type)).toEqual(["TRACK", "DISCONTINUITY", "DIRECT"]);
    expect(result.procedures[0].discontinuities).toHaveLength(1);
    expect(result.procedures[0].source).toEqual(source);
  });

  it("accepts a STAR and partial geometry while preserving the contract source", () => {
    const star = html.replace(/data-procedure-type="SID"/g, "data-procedure-type=\\"STAR\\"").replace(/data-procedure-designator="TACLO"/g, "data-procedure-designator=\\"BODAL1A\\"").replace(/data-transition="BODAL"/g, "data-transition=\\"\\"").replace(/data-runways="24"/g, "data-runways=\\"\\"").replace('data-lat="50.1"', 'data-lat=""');
    const result = parseOfficialProcedureSource(star, { airportIcao: "LZIB", source: { ...source, countryCode: "SK" } });
    expect(result.procedures[0].type).toBe("STAR");
    expect(result.procedures[0].legs.some((leg) => leg.from?.coordinates === null)).toBe(true);
  });

  it("rejects malformed source and bad provenance/effective date", () => {
    expect(() => parseOfficialProcedureSource("<html><body>chart only</body></html>", { airportIcao: "LKPR", source })).toThrow(ProcedureParseError);
    const document = parseOfficialProcedureSource(html, { airportIcao: "LKPR", source });
    expect(() => validateProcedureDataset({ ...document, source: { ...source, provider: "" } })).toThrow(ProcedureValidationError);
    expect(() => validateProcedureDataset({ ...document, source: { ...source, effectiveDate: "03-09-2026" } })).toThrow(/effectiveDate/);
  });

  it("rejects duplicate procedures, invalid coordinates, and dangling references", () => {
    const document = parseOfficialProcedureSource(html, { airportIcao: "LKPR", source });
    expect(() => validateProcedureDataset({ ...document, procedures: [...document.procedures, document.procedures[0]], counts: { ...document.counts, procedures: 2 } })).toThrow(/duplicated/);
    const invalid = structuredClone(document) as typeof document;
    invalid.procedures[0].legs[0].from!.coordinates = { lat: 91, lon: 14 };
    expect(() => validateProcedureDataset(invalid)).toThrow(/coordinates/);
    const dangling = structuredClone(document) as typeof document;
    dangling.procedures[0].discontinuities[0].beforePointId = "MISSING";
    expect(() => validateProcedureDataset(dangling)).toThrow(/dangling|conflicting/);
  });

  it("provides airport, type, designator lookups and a bounded API", async () => {
    const document = parseOfficialProcedureSource(html, { airportIcao: "LKPR", source });
    const repository = new ProcedureRepository(document);
    expect(repository.byAirport("lkpr")).toHaveLength(1);
    expect(repository.byAirportAndType("LKPR", "SID")).toHaveLength(1);
    expect(repository.byAirportAndDesignator("LKPR", "taclo")).toHaveLength(1);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "airradar-procedures-"));
    const file = path.join(directory, "procedures.json");
    fs.writeFileSync(file, JSON.stringify(document));
    process.env.PROCEDURES_DATASET_PATH = file;
    clearProcedureRepositoryCache();
    const response = await GET(new Request("http://localhost/api/procedures?airport=LKPR&type=SID"));
    expect(response.status).toBe(200);
    expect((await response.json()).procedures).toHaveLength(1);
  });

  it("fails soft with an empty successful response when the dataset is unavailable", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "airradar-procedures-missing-"));
    process.env.PROCEDURES_DATASET_PATH = path.join(directory, "procedures.json");
    clearProcedureRepositoryCache();

    const response = await GET(new Request("http://localhost/api/procedures?airport=LKPR"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, status: "unavailable", procedures: [] });
  });
});
