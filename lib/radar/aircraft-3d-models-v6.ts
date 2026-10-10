/** Bounded, locally generated low-poly airframes (no remote 3D assets or provider calls).
 * These are recognizable *family approximations*, not licensed type-accurate CAD/GLTF models.
 * Coordinate system: x=right, y=forward, z=up; dimensions in metres.
 */
export type AirframeGroup = "single-prop" | "regional-jet" | "single-aisle" | "widebody" | "four-engine" | "helicopter" | "generic";
type P = readonly [number, number, number];
export type AirframeFace = readonly [P, P, P, number];
export interface AirframeSpec {
  group: AirframeGroup;
  length: number;
  span: number;
  radius: number;
  engines: 0 | 1 | 2 | 4;
  enginePosition: "wing" | "tail" | "nose" | "none";
  highWing?: boolean;
}
const SPEC: Record<string, AirframeSpec> = {
  A318:{group:"single-aisle",length:31.4,span:34.1,radius:2,engines:2,enginePosition:"wing"},
  A319:{group:"single-aisle",length:33.8,span:35.8,radius:2,engines:2,enginePosition:"wing"},
  A320:{group:"single-aisle",length:37.6,span:35.8,radius:2,enginePosition:"wing",engines:2},
  A321:{group:"single-aisle",length:44.5,span:35.8,radius:2,enginePosition:"wing",engines:2},
  B737:{group:"single-aisle",length:33.6,span:34.3,radius:2,engines:2,enginePosition:"wing"},
  B738:{group:"single-aisle",length:39.5,span:35.8,radius:2,engines:2,enginePosition:"wing"},
  B739:{group:"single-aisle",length:42.1,span:35.8,radius:2,engines:2,enginePosition:"wing"},
  B38M:{group:"single-aisle",length:39.5,span:35.9,radius:2,engines:2,enginePosition:"wing"},
  A333:{group:"widebody",length:63.7,span:60.3,radius:3,engines:2,enginePosition:"wing"},
  A359:{group:"widebody",length:66.8,span:64.8,radius:3,engines:2,enginePosition:"wing"},
  B77W:{group:"widebody",length:73.9,span:64.8,radius:3.1,engines:2,enginePosition:"wing"},
  B788:{group:"widebody",length:56.7,span:60.1,radius:2.9,engines:2,enginePosition:"wing"},
  B789:{group:"widebody",length:63,span:60.1,radius:2.9,engines:2,enginePosition:"wing"},
  B744:{group:"four-engine",length:70.6,span:64.4,radius:3.3,engines:4,enginePosition:"wing"},
  A388:{group:"four-engine",length:72.7,span:79.8,radius:3.6,engines:4,enginePosition:"wing"},
  E190:{group:"regional-jet",length:36.2,span:28.7,radius:1.7,engines:2,enginePosition:"wing"},
  E195:{group:"regional-jet",length:38.7,span:28.7,radius:1.7,engines:2,enginePosition:"wing"},
  CRJ9:{group:"regional-jet",length:36.4,span:24.8,radius:1.5,engines:2,enginePosition:"tail"},
  C172:{group:"single-prop",length:8.3,span:11,radius:.65,engines:1,enginePosition:"nose",highWing:true},
  C182:{group:"single-prop",length:8.8,span:11,radius:.7,engines:1,enginePosition:"nose",highWing:true},
  PA28:{group:"single-prop",length:7.3,span:10.7,radius:.63,engines:1,enginePosition:"nose"},
  R44:{group:"helicopter",length:11.7,span:10,radius:.9,engines:0,enginePosition:"none"},
  H145:{group:"helicopter",length:13.6,span:11,radius:1,engines:0,enginePosition:"none"},
};
const DEFAULT: AirframeSpec = {group:"generic",length:37,span:34,radius:1.9,engines:2,enginePosition:"wing"};
const modelCache = new Map<string, readonly AirframeFace[]>();
export function resolveAirframeSpec(type: string | null | undefined): AirframeSpec {
  const code=(type??"").trim().toUpperCase();
  return SPEC[code] ?? (code.startsWith("B73") ? SPEC.B738 : code.startsWith("A32") ? SPEC.A320 : DEFAULT);
}
const add=(faces: AirframeFace[],a:P,b:P,c:P,shade=1)=>faces.push([a,b,c,shade]);
function tube(faces: AirframeFace[], x: number, yA: number, yB: number, z: number, r: number, shade=.67):void {
  const sides=8;
  for(let i=0;i<sides;i++){
    const t=i*2*Math.PI/sides, n=(i+1)*2*Math.PI/sides;
    const a:P=[x+Math.cos(t)*r,yA,z+Math.sin(t)*r], b:P=[x+Math.cos(n)*r,yA,z+Math.sin(n)*r];
    const c:P=[x+Math.cos(t)*r,yB,z+Math.sin(t)*r], d:P=[x+Math.cos(n)*r,yB,z+Math.sin(n)*r];
    add(faces,a,b,c,shade);add(faces,b,d,c,shade);
  }
}
function createModel(s: AirframeSpec): readonly AirframeFace[] {
  const faces:AirframeFace[]=[];
  const L=s.length, W=s.span, R=s.radius;
  if(s.group==="helicopter"){
    tube(faces,0,-L*.16,L*.20,0,R,.87);
    // tail boom, skids, main and tail rotors
    tube(faces,0,-L*.48,-L*.10,0,R*.18,.55);
    add(faces,[-W*.5,0,R*1.65],[W*.5,0,R*1.65],[0,.45,R*1.65],.9);
    add(faces,[0,-W*.45,R*1.65],[0,W*.45,R*1.65],[.45,0,R*1.65],.9);
    add(faces,[-R*1.4,-L*.18,-R],[-R*1.4,L*.12,-R],[-R*1.4,L*.12,-R*.8],.5);
    add(faces,[R*1.4,-L*.18,-R],[R*1.4,L*.12,-R],[R*1.4,L*.12,-R*.8],.5);
    return faces;
  }
  const sections = [
    {y:-L*.5,r:.14},{y:-L*.39,r:.72},{y:-L*.2,r:1},
    {y:L*.23,r:1},{y:L*.4,r:.7},{y:L*.5,r:.03}
  ];
  for(let k=0;k<sections.length-1;k++){
    const a=sections[k]!,b=sections[k+1]!;
    for(let i=0;i<8;i++){
      const t=i*Math.PI/4,n=(i+1)*Math.PI/4;
      const p:P=[Math.cos(t)*R*a.r,a.y,Math.sin(t)*R*.9*a.r];
      const q:P=[Math.cos(n)*R*a.r,a.y,Math.sin(n)*R*.9*a.r];
      const u:P=[Math.cos(t)*R*b.r,b.y,Math.sin(t)*R*.9*b.r];
      const v:P=[Math.cos(n)*R*b.r,b.y,Math.sin(n)*R*.9*b.r];
      add(faces,p,q,u,.75+Math.max(0,Math.sin(t))*.2);
      add(faces,q,v,u,.75+Math.max(0,Math.sin(n))*.2);
    }
  }
  const z=s.highWing ? R*.9 : 0;
  for(const sign of [-1,1]){
    const root=sign*R*.85,tip=sign*W*.5;
    const rootFront=L*.12,rootBack=-L*.22,tipFront=-L*.035,tipBack=-L*.14;
    add(faces,[root,rootFront,z],[tip,tipFront,z+W*.035],[tip,tipBack,z+W*.035],.97);
    add(faces,[root,rootFront,z],[tip,tipBack,z+W*.035],[root,rootBack,z],.85);
    // horizontal stabilizer
    const ty=-L*.41,tw=W*.21;
    add(faces,[sign*R*.6,ty+L*.03,R*.1],[sign*tw,ty,R*.17],[sign*R*.5,ty-L*.035,R*.1],.88);
  }
  // vertical fin
  add(faces,[0,-L*.43,R*.3],[0,-L*.37,R*3.4],[0,-L*.50,R*.3],.64);
  if(s.engines===1) {
    tube(faces,0,L*.36,L*.5,0,R*.30,.54);
    add(faces,[-W*.18,L*.51,0],[W*.18,L*.51,0],[0,L*.52,.14],.48);
  } else {
    const mounts=s.engines===4 ? [.17,.34] : [.27];
    for(const pos of mounts)for(const sign of [-1,1]){
      const x=sign*W*pos,y=s.enginePosition==="tail"?-L*.33:-L*.08;
      tube(faces,x,y-L*.047,y+L*.055,s.enginePosition==="tail" ? R*.18 : -R*.82,
        s.group==="widebody"||s.group==="four-engine"? R*.39:R*.34,.60);
    }
  }
  return faces;
}
/** Geometry cache is keyed by a finite catalog, never by arbitrary aircraft identifiers. */
export function airframeModelFaces(type: string | null | undefined): readonly AirframeFace[] {
  const code=(type??"").trim().toUpperCase();
  const key=SPEC[code] ? code : code.startsWith("B73") ? "B738" : code.startsWith("A32") ? "A320" : "__generic";
  let model=modelCache.get(key);
  if(!model){model=createModel(resolveAirframeSpec(code));modelCache.set(key,model);}
  return model;
}
export function airframeFaceCount(type: string): number { return airframeModelFaces(type).length; }
