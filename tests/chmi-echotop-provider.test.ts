import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EchoTopProvider,
  parseEchoTopCatalog,
  parseEchoTopFilename,
} from "@/lib/server/weather-radar/echotop-provider";

const NOW=Date.parse("2026-10-10T20:10:00Z");
const NAME="T_PADV23_C_OKPR_20261010200500.hdf";
afterEach(()=>vi.unstubAllEnvs());

describe("CHMI Echo Top HDF5/ODIM product",()=>{
  it("validates official file names, calendar dates and 2-hour horizon",()=>{
    expect(parseEchoTopFilename(NAME,NOW)?.id).toBe("202610102005");
    expect(parseEchoTopFilename(NAME.replace("20261010","20261310"),NOW)).toBeNull();
    expect(parseEchoTopFilename("T_PADV23_C_OKPR_20261010200533.hdf",NOW)).toBeNull();
    expect(parseEchoTopFilename("T_PADV23_C_OKPR_20261010000000.hdf",NOW)).toBeNull();
    const frames=parseEchoTopCatalog('<a href="'+NAME+'">Echo Top</a>',NOW);
    expect(frames).toMatchObject([{id:"202610102005",stale:false}]);
  });
  it("is off by default without an HDF5 runtime",async()=>{
    vi.stubEnv("CHMI_ECHOTOP_ENABLED","false");
    const fetcher=vi.fn(async()=>new Response("never"));
    const provider=new EchoTopProvider(fetcher as typeof fetch,()=>NOW);
    expect((await provider.getFrames()).available).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("provides bounded catalog and coalesces PNG conversion",async()=>{
    vi.stubEnv("CHMI_ECHOTOP_ENABLED","true");
    const fetcher=vi.fn(async (url:RequestInfo|URL, init?:RequestInit)=>{
      const path=String(url);
      if(init?.method==="HEAD"){
        return new Response(null,{status:path.endsWith("20261010200500.hdf")?200:404,headers:{"content-length":"1024"}});
      }
      return new Response(Uint8Array.of(137,72,68,70,13,10,26,10,1,2));
    });
    const converter=vi.fn(async (_raw:Uint8Array)=>Uint8Array.of(137,80,78,71,13,10,26,10));
    const probe=vi.fn(async()=>true);
    const provider=new EchoTopProvider(fetcher as typeof fetch,()=>NOW,converter,probe);
    const catalog=await provider.getFrames();
    expect(catalog.available).toBe(true);
    expect(catalog.latestFrameId).toBe("202610102005");
    expect(catalog.product).toBe("ECHO_TOP_HGHT");
    expect(catalog.bounds).toEqual({west:11.267,south:48.047,east:19.624,north:51.458});
    const [one,two]=await Promise.all([
      provider.getFrame("202610102005"),provider.getFrame("202610102005")
    ]);
    expect(one).toEqual(two);
    expect(converter).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(3); // two bounded HEAD probes + one HDF GET
  });
});
