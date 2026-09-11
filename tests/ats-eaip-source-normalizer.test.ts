import { describe, expect, it } from "vitest";
import { normalizeCzEaipEnr32SegmentAnnotations } from "@/lib/ats/cz-eaip-source-normalizer";

describe("Czech ENR 3.2 source annotation normalizer", () => {
  it("uses VAL_LEN as the authoritative segment object id without changing published values", () => {
    const source = `<?xml version="1.0"?><html><body><table><tr>
      <td>(RNAV <span class="SD">5</span><span class="sdParams">TRTE_SEG;CODE_RNP;1796</span>)</td>
      <td><span class="SD">264</span><span class="sdParams">TRTE_SEG;VAL_MAG_TRACK;1751</span></td>
      <td><span class="SD">9.0</span><span class="sdParams">TRTE_SEG;VAL_LEN;1751</span> <span class="SD">NM</span><span class="sdParams">TRTE_SEG;UOM_DIST;1752</span></td>
    </tr></table></body></html>`;

    const result = normalizeCzEaipEnr32SegmentAnnotations(source);

    expect(result.correctedRows).toBe(1);
    expect(result.correctedAnnotations).toBe(2);
    expect(result.html).toContain("TRTE_SEG;CODE_RNP;1751");
    expect(result.html).toContain("TRTE_SEG;UOM_DIST;1751");
    expect(result.html).toContain(">9.0<");
    expect(result.html).toContain(">NM<");
  });

  it("leaves consistent segment rows unchanged", () => {
    const source = `<?xml version="1.0"?><html><body><table><tr>
      <td><span class="SD">10.0</span><span class="sdParams">TRTE_SEG;VAL_LEN;1800</span> <span class="SD">NM</span><span class="sdParams">TRTE_SEG;UOM_DIST;1800</span></td>
    </tr></table></body></html>`;

    const result = normalizeCzEaipEnr32SegmentAnnotations(source);
    expect(result.correctedRows).toBe(0);
    expect(result.correctedAnnotations).toBe(0);
  });

  it("refuses rows with multiple VAL_LEN object ids", () => {
    const source = `<?xml version="1.0"?><html><body><table><tr>
      <td><span class="SD">9.0</span><span class="sdParams">TRTE_SEG;VAL_LEN;1751</span></td>
      <td><span class="SD">10.0</span><span class="sdParams">TRTE_SEG;VAL_LEN;1800</span></td>
    </tr></table></body></html>`;

    expect(() => normalizeCzEaipEnr32SegmentAnnotations(source)).toThrow(/2 VAL_LEN object ids/);
  });
});
