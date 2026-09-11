import { describe, expect, it } from "vitest";
import {
  buildCurrentCzPlan,
  canonicalCzechAirspaceDesignator,
  parseCzActualActivationIndex,
  parseCzActualActivationPreview,
  parseCzAupIndex,
  parseCzPlanPage,
} from "@/lib/airspace-activity/cz-aim";

const AUP_HTML = `<!doctype html><html><body>
<pre>
Plan vyuzivani vzdusneho prostoru Ceske republiky
OD 11. 09. 2026 06:00 DO 12. 09. 2026 06:00
Odesilajici stanoviste: AMC Ceska republika
Datum a cas vydani: 10. 09. 2026 11:15:29
C/ Prostory spravovane AMC (AMA) :
---
P.c. Prostor Spodni hran. Horni hran. Od Do Zodp.stanoviste Dopl.info
1. TSA1 GND F245 06:00 00:15 ARMY FRNG
2. TRA36 F125 F155 08:45 10:45 LKCV OAT
3. TRA37 F095 F420 10:45 14:00 LKVO OAT
D/ Prostory nespravovane AMC (NAM) : N I L
</pre>
</body></html>`;

const UUP_HTML = `<!doctype html><html><body>
<pre>
Aktualizovany plan vyuzivani vzdusneho prostoru Ceske republiky
OD 11. 09. 2026 06:00 DO 12. 09. 2026 06:00
Datum a cas vydani: 11. 09. 2026 07:30:00
C/ Prostory spravovane AMC (AMA) :
---
P.c. Prostor Spodni hran. Horni hran. Od Do Zodp.stanoviste Dopl.info
1. TSA1 GND F245 06:00 00:15 --- CNL
2. TRA36 F125 F155 09:00 11:00 LKCV TIME CHG
D/ Prostory nespravovane AMC (NAM) : N I L
</pre>
</body></html>`;

describe("Czech airspace activity", () => {
  it("discovers the current AUP/UUP links and update time", () => {
    const index = parseCzAupIndex(`
      <html><body>
        <div>Aktualizace dat: 11.09.2026 06:13:05 UTC</div>
        <a href="/data/aup_11092026.htm">Platný AUP</a>
        <a href="/data/uup_11092026_0613_123.htm">Platný UUP</a>
      </body></html>
    `);
    expect(index.aupUrl).toBe("https://aup.rlp.cz/data/aup_11092026.htm");
    expect(index.uupUrls).toEqual(["https://aup.rlp.cz/data/uup_11092026_0613_123.htm"]);
    expect(index.sourceUpdatedAt).toBe("2026-09-11T06:13:05.000Z");
  });

  it("parses AUP validity and moves post-midnight clocks to the following UTC day", () => {
    const page = parseCzPlanPage(AUP_HTML);
    expect(page.validityStart.toISOString()).toBe("2026-09-11T06:00:00.000Z");
    expect(page.validityEnd.toISOString()).toBe("2026-09-12T06:00:00.000Z");
    expect(page.rows).toHaveLength(3);

    const windows = buildCurrentCzPlan(page, "https://aup.rlp.cz/aup", [], new Date("2026-09-11T12:00:00Z"));
    const tsa1 = windows.find((window) => window.designator === "TSA1");
    expect(tsa1).toMatchObject({
      canonicalDesignator: "LKTSA1",
      startsAt: "2026-09-11T06:00:00.000Z",
      endsAt: "2026-09-12T00:15:00.000Z",
      plannedNow: true,
      source: "AUP",
    });
  });

  it("applies UUP cancellation and replacement by AUP sequence number", () => {
    const aup = parseCzPlanPage(AUP_HTML);
    const uup = parseCzPlanPage(UUP_HTML);
    const windows = buildCurrentCzPlan(
      aup,
      "https://aup.rlp.cz/data/aup.htm",
      [{ page: uup, reference: "https://aup.rlp.cz/data/uup.htm" }],
      new Date("2026-09-11T09:30:00Z"),
    );

    expect(windows.some((window) => window.designator === "TSA1")).toBe(false);
    expect(windows.find((window) => window.designator === "TRA36")).toMatchObject({
      sequence: 2,
      canonicalDesignator: "LKTRA36",
      startsAt: "2026-09-11T09:00:00.000Z",
      endsAt: "2026-09-11T11:00:00.000Z",
      plannedNow: true,
      source: "UUP",
    });
    expect(windows.find((window) => window.designator === "TRA37")?.source).toBe("AUP");
  });

  it("discovers the newest delayed actual-activation publication", () => {
    const index = parseCzActualActivationIndex(`
      <html><body><table>
        <tr><td><a href="data/activation/activation.20260909-10_aup.json">activation.20260909-10_aup.json</a></td>
        <td><a href="?actfilename=activation.20260909-10_aup.json&lang=cz&p=act-display">preview</a></td></tr>
      </table></body></html>
    `);
    expect(index.fileName).toBe("activation.20260909-10_aup.json");
    expect(index.periodStart?.toISOString()).toBe("2026-09-09T06:00:00.000Z");
    expect(index.periodEnd?.toISOString()).toBe("2026-09-10T06:00:00.000Z");
    expect(index.sourceUrl).toContain("activation.20260909-10_aup.json");
    expect(index.previewUrl).toContain("act-display");
  });

  it("parses historical actual activation rows without treating them as live status", () => {
    const records = parseCzActualActivationPreview(`
      <html><body><table>
        <tr><th>Airspace</th><th>Name</th><th>From</th><th>To</th><th>Lower</th><th>Upper</th></tr>
        <tr><td>TRA36</td><td>HOLICE</td><td>2026-08-16 08:35</td><td>2026-08-16 23:59</td><td>FL095</td><td>FL325</td></tr>
        <tr><td>TRA7</td><td>KLATOVY</td><td>2026-08-16 07:00</td><td>2026-08-16 13:38</td><td>FL095</td><td>FL155</td></tr>
      </table></body></html>
    `);
    expect(records).toEqual([
      {
        designator: "TRA36",
        canonicalDesignator: "LKTRA36",
        name: "HOLICE",
        startsAt: "2026-08-16T08:35:00.000Z",
        endsAt: "2026-08-16T23:59:00.000Z",
        lowerLimit: "FL095",
        upperLimit: "FL325",
      },
      {
        designator: "TRA7",
        canonicalDesignator: "LKTRA7",
        name: "KLATOVY",
        startsAt: "2026-08-16T07:00:00.000Z",
        endsAt: "2026-08-16T13:38:00.000Z",
        lowerLimit: "FL095",
        upperLimit: "FL155",
      },
    ]);
  });

  it("does not rewrite non-TRA/TSA identifiers", () => {
    expect(canonicalCzechAirspaceDesignator("TRA201")).toBe("LKTRA201");
    expect(canonicalCzechAirspaceDesignator("LKTSA4A")).toBe("LKTSA4A");
    expect(canonicalCzechAirspaceDesignator("A1335")).toBe("A1335");
  });
});
