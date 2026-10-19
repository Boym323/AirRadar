import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseNavPointFocus } from "@/lib/radar/navigation-focus";
import { setOgnDomLabel, type OgnMarkerHandle } from "@/lib/radar/ogn-marker-controller";

describe("Radar OGN label and navigation focus modules", () => {
  it("validates ICAO/NAVAID and FIX URLs before rendering a map focus", () => {
    expect(parseNavPointFocus("FIX:ABCDE:50.1:14.3")).toEqual({ kind: "FIX", id: "ABCDE", lat: 50.1, lon: 14.3 });
    expect(parseNavPointFocus("NAVAID:OKL:49.7:17.4")).toEqual({ kind: "NAVAID", id: "OKL", lat: 49.7, lon: 17.4 });
    for (const candidate of [null, "", "FIX:A:50:14", "FIX:ABCDE:95:14", "FIX:ABCDE:50:181", "FIX:ABCDE:50:14:EXTRA", "NAVAID:AB:abc:14"]) {
      expect(parseNavPointFocus(candidate)).toBeNull();
    }
  });

  it("updates OGN label elements once per actual content change", () => {
    const labelPrimary = { textContent: "" };
    const labelSecondary = { textContent: "", hidden: true };
    const label = { dataset: { contentEmpty: "true" } };
    const handle = {
      labelText: null, labelPrimary, labelSecondary, label,
      labelWidth: 90, labelHeight: 25,
    } as unknown as OgnMarkerHandle;
    expect(setOgnDomLabel(handle, "OK-ABC\n1200 m")).toBe(true);
    expect(handle.labelText).toBe("OK-ABC\n1200 m");
    expect(labelPrimary.textContent).toBe("OK-ABC");
    expect(labelSecondary.textContent).toBe("1200 m");
    expect(labelSecondary.hidden).toBe(false);
    expect(label.dataset.contentEmpty).toBe("false");
    expect(handle.labelWidth).toBeNull();
    expect(handle.labelHeight).toBeNull();
    expect(setOgnDomLabel(handle, "OK-ABC\n1200 m")).toBe(false);
    expect(setOgnDomLabel(handle, null)).toBe(true);
    expect(labelSecondary.hidden).toBe(true);
    expect(label.dataset.contentEmpty).toBe("true");
  });

  it("keeps the app as orchestrator rather than the owner of these standalone helpers", () => {
    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    expect(app).toContain('from "@/lib/radar/navigation-focus"');
    expect(app).toContain('from "@/lib/radar/ogn-marker-controller"');
    expect(app).not.toContain("function parseNavPointFocus(");
    expect(app).not.toContain("function setOgnDomLabel(");
  });
});
