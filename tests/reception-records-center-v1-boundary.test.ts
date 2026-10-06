import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/records/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/reception-records-center.tsx", import.meta.url), "utf8");
const receptionRoute = readFileSync(new URL("../app/api/reception-records/route.ts", import.meta.url), "utf8");
const logbookRoute = readFileSync(new URL("../app/api/logbook/summary/route.ts", import.meta.url), "utf8");

describe("Reception Records Center V1 boundary", () => {
  it("owns /records as a thin UI over existing bounded sources", () => {
    expect(page).toContain("<ReceptionRecordsCenter />");
    expect(center).toContain('fetch("/api/reception-records"');
    expect(center).toContain('fetch("/api/logbook/summary"');
    expect(center).not.toContain("/api/records");
    expect(center).not.toContain("getPrisma");
  });

  it("keeps the two sources fail-soft and links aircraft canonically", () => {
    expect(center).toContain("recordsFailed");
    expect(center).toContain("summaryFailed");
    expect(center).toContain("encodeURIComponent(item.icaoHex)");
    expect(center).toContain('reason === "new" || reason === "rare" || reason === "returning" || reason === "record"');
  });

  it("does not introduce a history scan or FlightPosition analytics", () => {
    expect(receptionRoute).toContain("getReceptionRecords");
    expect(logbookRoute).toContain("getLogbookSummary");
    expect(center).not.toContain("FlightPosition");
    expect(center).not.toContain("/history");
    expect(center).toContain("60_000");
  });
});
