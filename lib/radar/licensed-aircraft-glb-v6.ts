import type { AirframeFace } from "@/lib/radar/aircraft-3d-models-v6";

/**
 * CC BY 4.0 assets by amvlab, pinned to a reviewed upstream commit. No files
 * are redistributed or fetched until the user explicitly enables GLB detail.
 * Sources: https://github.com/amvlab/aircraft-models
 * License: https://creativecommons.org/licenses/by/4.0/
 */
export const LICENSED_AIRCRAFT_CREDIT = "amvlab · CC BY 4.0";
const ROOT = "https://raw.githubusercontent.com/amvlab/aircraft-models/91d835e8e851b2317fe79af291c9fed6153fd525/models/";
const ASSETS = {
  A320: "A320_nologo.glb",
  A350: "A350_nologo.glb",
  A380: "A380_nologo.glb",
  B737: "B737_nologo.glb",
  B787: "B787_nologo.glb",
} as const;
export type LicensedFamily = keyof typeof ASSETS;
const DIMENSIONS: Record<LicensedFamily,{length:number;span:number}> = {
  A320:{length:37.6,span:35.8}, A350:{length:66.8,span:64.8}, A380:{length:72.7,span:79.8},
  B737:{length:39.5,span:35.8}, B787:{length:63,span:60.1},
};
export const MAX_GLB_BYTES = 1_500_000;
export const MAX_GLB_FACES = 1600;
const models = new Map<LicensedFamily, readonly AirframeFace[]>();
const inflight = new Map<LicensedFamily, Promise<void>>();
const failedAt = new Map<LicensedFamily, number>();
export function resolveLicensedFamily(type: string | null | undefined): LicensedFamily | null {
  const code = (type ?? "").trim().toUpperCase();
  if (/^A(318|319|320|321|32N|21N|20N|19N)/.test(code)) return "A320";
  if (/^A35/.test(code)) return "A350";
  if (/^A38/.test(code)) return "A380";
  if (/^B(73|38M|39M|37M)/.test(code)) return "B737";
  if (/^B78/.test(code)) return "B787";
  return null;
}
export function licensedFaces(type: string | null | undefined): readonly AirframeFace[] | null {
  const family = resolveLicensedFamily(type);
  return family ? models.get(family) ?? null : null;
}
type Vec3 = readonly [number, number, number];
type Accessor = { bufferView?: number; byteOffset?: number; count: number; componentType: number; type: string; sparse?: unknown };
type View = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number };
type Node = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; scale?: number[]; rotation?: number[] };
type GlbDoc = { accessors: Accessor[]; bufferViews: View[]; buffers: { byteLength: number }[]; meshes: { primitives: { mode?: number; attributes: { POSITION?: number }; indices?: number }[] }[]; nodes?: Node[]; scenes?: { nodes?: number[] }[]; scene?: number };
const identity = (): number[] => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a: readonly number[], b: readonly number[]): number[] {
  const r = new Array<number>(16).fill(0);
  for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]!+=a[k*4+row]!*b[c*4+k]!;
  return r;
}
function matrix(n: Node): number[] {
  if(n.matrix?.length===16)return n.matrix;
  const [x,y,z,w] = n.rotation?.length===4?n.rotation:[0,0,0,1];
  const [sx,sy,sz]=n.scale?.length===3?n.scale:[1,1,1];
  const [tx,ty,tz]=n.translation?.length===3?n.translation:[0,0,0];
  return [
    (1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,
    2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,
    2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,
    tx,ty,tz,1,
  ];
}
function transform(m: readonly number[], p: Vec3): Vec3 {
  return [m[0]!*p[0]+m[4]!*p[1]+m[8]!*p[2]+m[12]!,
    m[1]!*p[0]+m[5]!*p[1]+m[9]!*p[2]+m[13]!,
    m[2]!*p[0]+m[6]!*p[1]+m[10]!*p[2]+m[14]!];
}
function readAccessor(doc: GlbDoc, bin: DataView, at: number, expected: "VEC3"|"SCALAR"): number[][] {
  const a=doc.accessors[at],v=a && a.bufferView!==undefined?doc.bufferViews[a.bufferView]:undefined;
  if(!a||!v||a.sparse||v.buffer!==0||a.type!==expected||!Number.isInteger(a.count)||a.count<0||a.count>200_000)throw Error("Unsupported GLB accessor");
  const size=a.componentType===5126?4:a.componentType===5125?4:a.componentType===5123?2:a.componentType===5121?1:0;
  if(!size||(expected==="VEC3"&&a.componentType!==5126))throw Error("Unsupported GLB component type");
  const width=expected==="VEC3"?3:1,stride=v.byteStride??width*size, offset=(v.byteOffset??0)+(a.byteOffset??0);
  if(stride<width*size||offset<0||offset+(a.count?a.count-1:0)*stride+width*size>bin.byteLength||offset+a.count*stride>(v.byteOffset??0)+v.byteLength+stride)throw Error("GLB accessor outside buffer view");
  const result:number[][]=[];
  for(let i=0;i<a.count;i++){
    const start=offset+i*stride,row:number[]=[];
    for(let j=0;j<width;j++){
      const p=start+j*size;
      const n=a.componentType===5126?bin.getFloat32(p,true):a.componentType===5125?bin.getUint32(p,true):a.componentType===5123?bin.getUint16(p,true):bin.getUint8(p);
      if(!Number.isFinite(n))throw Error("Invalid vertex coordinate");
      row.push(n);
    }
    result.push(row);
  }
  return result;
}
/** Decode embedded GLB triangles into a bounded local-metre mesh. No textures, scripts, extensions or external URIs. */
export function decodeLicensedGlb(buffer: ArrayBuffer, family: LicensedFamily = "A320"): readonly AirframeFace[] {
  if(buffer.byteLength<28||buffer.byteLength>MAX_GLB_BYTES)throw Error("GLB size limit");
  const header=new DataView(buffer);
  if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==buffer.byteLength)throw Error("Invalid GLB 2 header");
  let pos=12, json:GlbDoc|null=null, binary:DataView|null=null;
  while(pos+8<=buffer.byteLength){
    const length=header.getUint32(pos,true),kind=header.getUint32(pos+4,true);
    pos+=8;
    if(length<0||pos+length>buffer.byteLength)throw Error("Invalid GLB chunk length");
    if(kind===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,pos,length))) as GlbDoc;
    if(kind===0x004e4942)binary=new DataView(buffer,pos,length);
    pos+=length;
  }
  if(!json||!binary||!Array.isArray(json.meshes)||!Array.isArray(json.accessors)||!Array.isArray(json.bufferViews))throw Error("Missing GLB geometry");
  const doc:GlbDoc=json,bin:DataView=binary;
  const raw: [Vec3,Vec3,Vec3][]=[];
  const processMesh=(meshIndex:number,world:readonly number[])=>{
    const mesh=doc.meshes[meshIndex];
    if(!mesh)return;
    for(const p of mesh.primitives){
      if(p.mode!==undefined&&p.mode!==4||p.attributes.POSITION===undefined)continue;
      const xyz=readAccessor(doc,bin,p.attributes.POSITION,"VEC3");
      const ids=p.indices===undefined?xyz.map((_,i)=>[i]):readAccessor(doc,bin,p.indices,"SCALAR");
      for(let i=0;i+2<ids.length;i+=3){
        if(raw.length>=70_000)throw Error("GLB complexity limit");
        const a=xyz[ids[i]![0]!],b=xyz[ids[i+1]![0]!],c=xyz[ids[i+2]![0]!];
        if(!a||!b||!c)throw Error("Invalid GLB index");
        raw.push([transform(world,a as unknown as Vec3),transform(world,b as unknown as Vec3),transform(world,c as unknown as Vec3)]);
      }
    }
  };
  if(doc.nodes?.length){
    const roots=doc.scenes?.[doc.scene??0]?.nodes??doc.nodes.map((_,i)=>i);
    const visit=(id:number,parent:readonly number[],depth:number,seen:Set<number>)=>{
      if(depth>16||seen.has(id))throw Error("GLB cyclic scene");
      const node=doc.nodes![id];if(!node)throw Error("Invalid GLB node");
      const world=mul(parent,matrix(node)), next=new Set(seen);next.add(id);
      if(node.mesh!==undefined)processMesh(node.mesh,world);
      for(const child of node.children??[])visit(child,world,depth+1,next);
    };
    for(const id of roots)visit(id,identity(),0,new Set());
  }else for(let i=0;i<doc.meshes.length;i++)processMesh(i,identity());
  if(raw.length===0)throw Error("No GLB triangles");
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const tri of raw)for(const p of tri)for(let i=0;i<3;i++){min[i]=Math.min(min[i]!,p[i]!);max[i]=Math.max(max[i]!,p[i]!);}
  // glTF Y-up: the longest of X/Z is treated as wingspan, the other as forward.
  const spanAxis=max[0]!-min[0]!>max[2]!-min[2]!?0:2;
  const forwardAxis=spanAxis===0?2:0;
  const span=max[spanAxis]!-min[spanAxis]!,length=max[forwardAxis]!-min[forwardAxis]!;
  if(!Number.isFinite(span)||!Number.isFinite(length)||span<=0||length<=0)throw Error("Degenerate GLB geometry");
  const cx=(min[spanAxis]!+max[spanAxis]!)/2,cy=(min[forwardAxis]!+max[forwardAxis]!)/2,cz=(min[1]!+max[1]!)/2;
  const physical=DIMENSIONS[family];
  const spanScale=physical.span/span, lengthScale=physical.length/length;
  const heightScale=Math.min(spanScale,lengthScale);
  const local=(p:Vec3):Vec3=>[(p[spanAxis]-cx)*spanScale,(p[forwardAxis]-cy)*lengthScale,(p[1]-cz)*heightScale];
  const result:AirframeFace[]=[];
  const stride=Math.max(1,Math.ceil(raw.length/MAX_GLB_FACES));
  for(let i=0;i<raw.length;i+=stride){
    const [a,b,c]=raw[i]!.map(local) as [Vec3,Vec3,Vec3];
    const shade=Math.max(.45,Math.min(1,.7+Math.abs((b[2]-a[2])*(c[0]-a[0])-(c[2]-a[2])*(b[0]-a[0]))/(span*length)*.2));
    result.push([a,b,c,shade]);
  }
  return result;
}
export async function requestLicensedFaces(type: string | null | undefined, onReady: () => void): Promise<void> {
  const family=resolveLicensedFamily(type);
  if(!family||models.has(family))return;
  if(Date.now()-(failedAt.get(family)??-Infinity)<600_000)return;
  let promise=inflight.get(family);
  if(!promise){
    promise=(async()=>{
      const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
      try{
        const response=await fetch(ROOT+ASSETS[family],{signal:ctrl.signal,credentials:"omit",cache:"force-cache"});
        const contentLength=Number(response.headers.get("content-length")||0);
        if(!response.ok||contentLength>MAX_GLB_BYTES)throw Error("GLB unavailable or oversized");
        const bytes=await response.arrayBuffer();
        models.set(family,decodeLicensedGlb(bytes,family));
        onReady();
      }catch{
        failedAt.set(family,Date.now()); // offline/blocked asset: keep local model
      }finally{clearTimeout(timeout);inflight.delete(family);}
    })();
    inflight.set(family,promise);
  }else{await promise;return;}
  await promise;
}
