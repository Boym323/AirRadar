import { describe, expect, it } from "vitest";
import { decodeLicensedGlb, resolveLicensedFamily, MAX_GLB_BYTES, MAX_GLB_FACES } from "@/lib/radar/licensed-aircraft-glb-v6";

function fixture(): ArrayBuffer {
  const positions=new Float32Array([0,0,0, 12,0,0, 0,0,6]);
  const json=JSON.stringify({
    asset:{version:"2.0"},buffers:[{byteLength:positions.byteLength}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3"}],
    meshes:[{primitives:[{attributes:{POSITION:0},mode:4}]}],
  });
  const encoded=new TextEncoder().encode(json);
  const padded=(encoded.length+3)&~3;
  const size=12+8+padded+8+positions.byteLength;
  const buffer=new ArrayBuffer(size),v=new DataView(buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,size,true);
  v.setUint32(12,padded,true);v.setUint32(16,0x4e4f534a,true);
  new Uint8Array(buffer,20,encoded.length).set(encoded);
  new Uint8Array(buffer,20+encoded.length,padded-encoded.length).fill(32);
  v.setUint32(20+padded,positions.byteLength,true);v.setUint32(24+padded,0x004e4942,true);
  new Uint8Array(buffer,28+padded).set(new Uint8Array(positions.buffer));
  return buffer;
}
describe("V6 CC-BY GLB asset parser",()=>{
  it("maps only supported ICAO model families",()=>{
    expect(resolveLicensedFamily("A388")).toBe("A380");
    expect(resolveLicensedFamily("A20N")).toBe("A320");
    expect(resolveLicensedFamily("B77W")).toBeNull();
    expect(resolveLicensedFamily("B789")).toBe("B787");
    expect(resolveLicensedFamily("C172")).toBeNull();
  });
  it("decodes self-contained glTF 2 triangles without external content",()=>{
    const faces=decodeLicensedGlb(fixture());
    expect(faces).toHaveLength(1);
    expect(faces.every(f=>f.slice(0,3).flat().every(Number.isFinite))).toBe(true);
    expect(faces.length).toBeLessThanOrEqual(MAX_GLB_FACES);
  });
  it("rejects malformed or oversized binary payloads",()=>{
    expect(()=>decodeLicensedGlb(new ArrayBuffer(MAX_GLB_BYTES+1))).toThrow();
    expect(()=>decodeLicensedGlb(new ArrayBuffer(40))).toThrow();
  });
});


describe("licensed GLB source integration (explicit CI gate)", () => {
  const families = ["A320","A350","A380","B737","B787"] as const;
  it.skipIf(process.env.RUN_LIVE_GLB_ASSET_AUDIT !== "1")("decodes all pinned CC BY assets", async () => {
    const root = "https://raw.githubusercontent.com/amvlab/aircraft-models/91d835e8e851b2317fe79af291c9fed6153fd525/models/";
    for (const family of families) {
      const response = await fetch(`${root}${family}_nologo.glb`, { signal: AbortSignal.timeout(12_000) });
      expect(response.ok, `${family} source status`).toBe(true);
      expect(response.headers.get("access-control-allow-origin"), `${family} CORS`).toBe("*");
      const bytes = await response.arrayBuffer();
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_GLB_BYTES);
      const faces = decodeLicensedGlb(bytes, family);
      expect(faces.length, `${family} faces`).toBeGreaterThan(20);
      expect(faces.length).toBeLessThanOrEqual(MAX_GLB_FACES);
      expect(faces.every(face => face.slice(0,3).flat().every(Number.isFinite))).toBe(true);
    }
  }, 90_000);
});
