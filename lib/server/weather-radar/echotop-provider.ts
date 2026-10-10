import { spawn } from "node:child_process";
import { join } from "node:path";

export const ECHOTOP_SOURCE_URL = "https://opendata.chmi.cz/meteorology/weather/radar/composite/echotop/hdf5/";
export const ECHOTOP_BOUNDS = { west: 11.267, south: 48.047, east: 19.624, north: 51.458 } as const;
const FILE_RE = /^T_PADV23_C_OKPR_(\d{14})\.hdf$/;
const ID_RE = /^\d{12}$/;
const MAX_HDF_BYTES = 8 * 1024 * 1024;
const MAX_PNG_BYTES = 12 * 1024 * 1024;
const STALE_MS = 18 * 60_000;
const HORIZON_MS = 2 * 60 * 60_000;
const MAX_FRAMES = 25;

export interface EchoTopFrame {
  id: string;
  observedAt: string;
  imageUrl: string;
  stale: boolean;
}
export interface EchoTopCatalog {
  available: boolean;
  enabled: boolean;
  provider: "CHMI";
  product: "ECHO_TOP_HGHT";
  unit: "m AMSL";
  definition: "Maximum height of radar echoes >= 4 dBZ, NOT a cloud-top height";
  latestFrameId: string | null;
  frames: EchoTopFrame[];
  bounds: typeof ECHOTOP_BOUNDS;
  fetchedAt: string;
}

function validTimestamp(value: string, now: number): string | null {
  if (!/^\d{14}$/.test(value) || value.slice(-2) !== "00") return null;
  const nums = [value.slice(0,4),value.slice(4,6),value.slice(6,8),value.slice(8,10),value.slice(10,12)].map(Number);
  const date = new Date(Date.UTC(nums[0],nums[1]-1,nums[2],nums[3],nums[4],0));
  if (date.getUTCFullYear()!==nums[0] || date.getUTCMonth()+1!==nums[1] ||
    date.getUTCDate()!==nums[2] || date.getUTCHours()!==nums[3] || date.getUTCMinutes()!==nums[4] ||
    date.getTime()>now+10*60_000 || now-date.getTime()>HORIZON_MS) return null;
  return date.toISOString();
}
export function parseEchoTopFilename(name: string, now=Date.now()): { id: string; observedAt: string } | null {
  const m=FILE_RE.exec(name);
  if(!m) return null;
  const observedAt=validTimestamp(m[1], now);
  return observedAt ? { id:m[1].slice(0,12), observedAt } : null;
}
export function parseEchoTopCatalog(html: string, now=Date.now()): EchoTopFrame[] {
  const unique=new Map<string,EchoTopFrame>();
  for(const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
    const file=match[1].split(/[/?#]/).pop()??"";
    const parsed=parseEchoTopFilename(file,now);
    if(parsed) unique.set(parsed.id,{
      ...parsed, imageUrl:"/api/weather/radar/echotop/frame/"+parsed.id,
      stale:now-Date.parse(parsed.observedAt)>STALE_MS,
    });
  }
  return [...unique.values()].sort((a,b)=>a.id.localeCompare(b.id)).slice(-MAX_FRAMES);
}

export function isEchoTopEnabled(): boolean {
  return process.env.CHMI_ECHOTOP_ENABLED?.trim().toLowerCase()==="true";
}

async function boundedBytes(response:Response, max:number):Promise<Uint8Array>{
  if(!response.ok || !response.body)throw Error("Upstream unavailable");
  const declared=Number(response.headers.get("content-length")??0);
  if(declared>max)throw Error("Upstream body too large");
  const chunks:Uint8Array[]=[];
  let n=0;
  const reader=response.body.getReader();
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      n+=value.byteLength;
      if(n>max)throw Error("Upstream body too large");
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  const out=new Uint8Array(n);let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
  return out;
}

function runPython(args:string[],input:Uint8Array|null,limit=MAX_PNG_BYTES,timeout=10_000):Promise<Uint8Array>{
  return new Promise((resolve,reject)=>{
    const child=spawn("python3",args,{cwd:process.cwd(),stdio:["pipe","pipe","pipe"],env:{...process.env, PYTHONNOUSERSITE:"1"}});
    const chunks:Uint8Array[]=[];let size=0;
    let failed=false;
    const fail=()=>{failed=true;child.kill("SIGKILL");};
    const timer=setTimeout(fail,timeout);timer.unref?.();
    child.stdout.on("data",(chunk:Buffer)=>{
      size+=chunk.length;
      if(size>limit){fail();return;}
      chunks.push(chunk);
    });
    child.stderr.on("data",(chunk:Buffer)=>{if(chunk.length>8*1024)fail();});
    child.on("error",(error)=>{clearTimeout(timer);reject(error);});
    child.on("close",(code)=>{
      clearTimeout(timer);
      if(failed||code!==0||size===0){reject(Error("Echo Top converter unavailable or rejected data"));return;}
      const combined=new Uint8Array(size);let pos=0;
      for(const chunk of chunks){combined.set(chunk,pos);pos+=chunk.length;}
      resolve(combined);
    });
    if(input){child.stdin.end(Buffer.from(input));}else child.stdin.end();
  });
}
export async function probeEchoTopConverter():Promise<boolean>{
  try {
    await runPython(["-c","import h5py,numpy;print(1)"],null,1024,5_000);
    return true;
  }catch{return false;}
}
export async function convertEchoTop(raw:Uint8Array):Promise<Uint8Array>{
  if(raw.length<8||raw.length>MAX_HDF_BYTES||!Buffer.from(raw.slice(0,8)).equals(Buffer.from([137,72,68,70,13,10,26,10]))) {
    throw Error("Not bounded HDF5 data");
  }
  const rendered=await runPython([join(process.cwd(),"scripts","chmi-echotop-render.py")],raw);
  if(rendered.length<8||!Buffer.from(rendered.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw Error("Not a PNG image");
  }
  return rendered;
}

export class EchoTopProvider {
  private catalog:{value:EchoTopCatalog;time:number}|null=null;
  private frames=new Map<string,Uint8Array>();
  private fetchingCatalog:Promise<EchoTopCatalog>|null=null;
  private readonly pending=new Map<string,Promise<Uint8Array>>();
  private converterAvailable:{value:boolean;time:number}|null=null;
  constructor(
    private readonly fetcher:typeof fetch=fetch,
    private readonly clock:()=>number=Date.now,
    private readonly converter:(raw:Uint8Array)=>Promise<Uint8Array>=convertEchoTop,
    private readonly probe:()=>Promise<boolean>=probeEchoTopConverter,
  ){}
  private empty():EchoTopCatalog{
    return {available:false,enabled:isEchoTopEnabled(),provider:"CHMI",product:"ECHO_TOP_HGHT",
      unit:"m AMSL",definition:"Maximum height of radar echoes >= 4 dBZ, NOT a cloud-top height",
      latestFrameId:null,frames:[],bounds:ECHOTOP_BOUNDS,fetchedAt:new Date(this.clock()).toISOString()};
  }
  async getFrames():Promise<EchoTopCatalog>{
    if(!isEchoTopEnabled())return this.empty();
    const now=this.clock();
    if(!this.converterAvailable||now-this.converterAvailable.time>5*60_000){
      this.converterAvailable={value:await this.probe().catch(()=>false),time:now};
    }
    if(!this.converterAvailable.value)return this.empty();
    if(this.catalog&&now-this.catalog.time<60_000)return this.catalog.value;
    if(this.fetchingCatalog)return this.fetchingCatalog;
    const request=(async()=>{
      try{
        // ČHMÚ's directory index grows without bound and normally lists oldest
        // files first. Probe a small allowlisted set of recent file names with
        // HEAD instead of downloading/parsing the entire directory.
        const rounded=Math.floor(now / (5*60_000)) * (5*60_000);
        const frames:EchoTopFrame[]=[];
        for(let slot=0;slot<8;slot++){
          const instant=rounded-slot*5*60_000;
          const t=new Date(instant).toISOString().replace(/[-:]/g,"").replace(/T/g,"").slice(0,12);
          const file="T_PADV23_C_OKPR_"+t+"00.hdf";
          const probe=await this.fetcher(ECHOTOP_SOURCE_URL+file,{
            method:"HEAD",cache:"no-store",signal:AbortSignal.timeout(3_000)
          });
          if(!probe.ok)continue;
          const bytes=Number(probe.headers.get("content-length")??"0");
          if(bytes>MAX_HDF_BYTES)continue;
          const observedAt=validTimestamp(t+"00",now);
          if(!observedAt)continue;
          frames.push({
            id:t,observedAt,
            imageUrl:"/api/weather/radar/echotop/frame/"+t,
            stale:now-Date.parse(observedAt)>STALE_MS,
          });
          break;
        }
        const value={...this.empty(),available:frames.length>0,frames,latestFrameId:frames.at(-1)?.id??null};
        this.catalog={value,time:this.clock()};
        return value;
      }catch{return this.catalog?.value??this.empty();}
    })();
    this.fetchingCatalog=request;
    try{return await request;}finally{if(this.fetchingCatalog===request)this.fetchingCatalog=null;}
  }
  async getFrame(id:string):Promise<Uint8Array>{
    if(!isEchoTopEnabled()||!ID_RE.test(id)||!validTimestamp(id+"00",this.clock()))throw Error("Invalid Echo Top frame");
    const old=this.frames.get(id);
    if(old)return old;
    const inflight=this.pending.get(id);if(inflight)return inflight;
    const run=(async()=>{
      const url=ECHOTOP_SOURCE_URL+"T_PADV23_C_OKPR_"+id+"00.hdf";
      const response=await this.fetcher(url,{signal:AbortSignal.timeout(8_000),cache:"no-store"});
      const raw=await boundedBytes(response,MAX_HDF_BYTES);
      const png=await this.converter(raw);
      if(png.length<8||png.length>MAX_PNG_BYTES)throw Error("PNG invalid");
      this.frames.set(id,png);
      while(this.frames.size>3)this.frames.delete(this.frames.keys().next().value!);
      return png;
    })();
    this.pending.set(id,run);
    try{return await run;}finally{this.pending.delete(id);}
  }
}
const singleton=globalThis as typeof globalThis & {__airradarEchoTop?:EchoTopProvider};
export const defaultEchoTopProvider=singleton.__airradarEchoTop??=new EchoTopProvider();
