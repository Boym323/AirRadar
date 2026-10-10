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
  /** Distinctive aircraft-specific aerodynamic details; bounded procedural geometry. */
  wingSweep?: number;
  winglet?: number;
  tailStyle?: "t" | "standard";
}
const SPEC: Record<string, AirframeSpec> = {
  A318:{group:"single-aisle",length:31.4,span:34.1,radius:2,engines:2,enginePosition:"wing"},
  A319:{group:"single-aisle",length:33.8,span:35.8,radius:2,engines:2,enginePosition:"wing"},
  A320:{group:"single-aisle",length:37.6,span:35.8,radius:2,enginePosition:"wing",engines:2,wingSweep:.17,winglet:.95},
  A20N:{group:"single-aisle",length:37.6,span:35.8,radius:2,enginePosition:"wing",engines:2,wingSweep:.17,winglet:2.1},
  A21N:{group:"single-aisle",length:44.5,span:35.8,radius:2,enginePosition:"wing",engines:2,wingSweep:.17,winglet:2.1},
  A321:{group:"single-aisle",length:44.5,span:35.8,radius:2,enginePosition:"wing",engines:2},
  B737:{group:"single-aisle",length:33.6,span:34.3,radius:2,engines:2,enginePosition:"wing"},
  B738:{group:"single-aisle",length:39.5,span:35.8,radius:2,engines:2,enginePosition:"wing",wingSweep:.25,winglet:2.4},
  B739:{group:"single-aisle",length:42.1,span:35.8,radius:2,engines:2,enginePosition:"wing"},
  B38M:{group:"single-aisle",length:39.5,span:35.9,radius:2,engines:2,enginePosition:"wing",wingSweep:.25,winglet:2.7},
  B39M:{group:"single-aisle",length:42.1,span:35.9,radius:2,engines:2,enginePosition:"wing",wingSweep:.25,winglet:2.7},
  A333:{group:"widebody",length:63.7,span:60.3,radius:3,engines:2,enginePosition:"wing"},
  A359:{group:"widebody",length:66.8,span:64.8,radius:3,engines:2,enginePosition:"wing",wingSweep:.28,winglet:3.3},
  B77W:{group:"widebody",length:73.9,span:64.8,radius:3.1,engines:2,enginePosition:"wing",wingSweep:.32},
  B788:{group:"widebody",length:56.7,span:60.1,radius:2.9,engines:2,enginePosition:"wing"},
  B789:{group:"widebody",length:63,span:60.1,radius:2.9,engines:2,enginePosition:"wing",wingSweep:.31,winglet:2.2},
  B78X:{group:"widebody",length:68.3,span:60.1,radius:2.9,engines:2,enginePosition:"wing",wingSweep:.31,winglet:2.2},
  B744:{group:"four-engine",length:70.6,span:64.4,radius:3.3,engines:4,enginePosition:"wing"},
  A388:{group:"four-engine",length:72.7,span:79.8,radius:3.6,engines:4,enginePosition:"wing"},
  E190:{group:"regional-jet",length:36.2,span:28.7,radius:1.7,engines:2,enginePosition:"wing"},
  E195:{group:"regional-jet",length:38.7,span:28.7,radius:1.7,engines:2,enginePosition:"wing"},
  CRJ9:{group:"regional-jet",length:36.4,span:24.8,radius:1.5,engines:2,enginePosition:"tail",tailStyle:"t"},
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
/** Low-polygon but genuinely three-dimensional meshes; silhouettes, nacelles,
 * fuselage shading, swept wings, wingtip devices, cockpit and cabin glazing.
 * Avoid textures/remote requests to bound memory and GPU upload.
 */
function createModel(s: AirframeSpec): readonly AirframeFace[] {
  const faces: AirframeFace[] = [];
  const L = s.length, W = s.span, R = s.radius;
  if (s.group === "helicopter") {
    tube(faces, 0, -L*.18, L*.20, 0, R, .83);
    tube(faces, 0, -L*.48, -L*.12, 0, R*.16, .55);
    // Rotor blades have actual thickness and opposite surfaces.
    for (const axis of [-1,1]) {
      add(faces, [axis*W*.47,0,R*1.6],[0,.28,R*1.6],[0,-.28,R*1.6],.8);
      add(faces, [0,-W*.38,R*1.6],[.26,0,R*1.6],[-.26,0,R*1.6],.8);
    }
    add(faces,[-R*1.4,-L*.18,-R],[-R*1.4,L*.12,-R],[-R*1.4,L*.12,-R*.8],.48);
    add(faces,[ R*1.4,-L*.18,-R],[ R*1.4,L*.12,-R],[ R*1.4,L*.12,-R*.8],.48);
    // Colored transparent-looking cabin glazing.
    for(const side of [-1,1]){
      add(faces,[side*R*.93, L*.06,R*.5],[side*R*.8,L*.17,R*.5],[side*R*.96,L*.17,-R*.05],.25);
    }
    return faces;
  }
  const sections = [
    {y:-L*.50,r:.08},{y:-L*.39,r:.73},{y:-L*.20,r:1},
    {y:L*.23,r:1},{y:L*.40,r:.70},{y:L*.50,r:.025},
  ];
  for (let k=0;k<sections.length-1;k++) {
    const a=sections[k]!, b=sections[k+1]!;
    for(let i=0;i<8;i++){
      const t=i*Math.PI/4,n=(i+1)*Math.PI/4;
      const p:P=[Math.cos(t)*R*a.r,a.y,Math.sin(t)*R*.90*a.r];
      const q:P=[Math.cos(n)*R*a.r,a.y,Math.sin(n)*R*.90*a.r];
      const u:P=[Math.cos(t)*R*b.r,b.y,Math.sin(t)*R*.90*b.r];
      const v:P=[Math.cos(n)*R*b.r,b.y,Math.sin(n)*R*.90*b.r];
      const shade=.72+Math.max(0,Math.sin(t))*.23;
      add(faces,p,q,u,shade);add(faces,q,v,u,shade);
    }
  }
  const wingZ=s.highWing ? R*.9 : -R*.08;
  const sweep=s.wingSweep ?? ((s.group==="widebody" || s.group==="four-engine") ? .28 : .15);
  for (const side of [-1,1]){
    const root=side*R*.86, tip=side*W*.50;
    const rootFront=L*.12, rootBack=-L*.22;
    const tipFront=L*.12-W*sweep, tipBack=tipFront-L*.105;
    const dihedral=W*.025, thickness=Math.max(.12,R*.14);
    // Wing upper and lower surfaces have real thickness for pitched 3D cameras.
    const wing:P[]=[[root,rootFront,wingZ],[tip,tipFront,wingZ+dihedral],
      [tip,tipBack,wingZ+dihedral],[root,rootBack,wingZ]];
    add(faces,wing[0]!,wing[1]!,wing[2]!, .97);
    add(faces,wing[0]!,wing[2]!,wing[3]!, .90);
    const underside=wing.map(p=>[p[0],p[1],p[2]-thickness] as P);
    add(faces,underside[2]!,underside[1]!,underside[0]!, .63);
    add(faces,underside[3]!,underside[2]!,underside[0]!, .63);
    add(faces,wing[1]!,underside[1]!,wing[2]!, .68);
    add(faces,wing[2]!,underside[1]!,underside[2]!, .68);
    // Airbus sharklets, 737 split scimitars and blended widebody tips.
    if (s.winglet) {
      const tipZ=wingZ+dihedral,tipY=(tipFront+tipBack)/2;
      add(faces,[tip,tipY-.65,tipZ],[tip,tipY+.65,tipZ],[tip+side*.35,tipY,tipZ+s.winglet],.92);
      if(s.winglet>2.5) add(faces,[tip,tipY-.65,tipZ],[tip-side*.30,tipY,tipZ-s.winglet*.45],[tip,tipY+.65,tipZ],.73);
    }
    const tailZ=s.tailStyle==="t" ? R*3.15 : R*.32;
    const tailX=side*W*.20, tailY=-L*.415;
    add(faces,[side*R*.5,tailY+L*.025,tailZ],[tailX,tailY,tailZ+R*.12],[side*R*.5,tailY-L*.035,tailZ],.84);
    add(faces,[side*R*.5,tailY-L*.035,tailZ],[tailX,tailY,tailZ+R*.12],[side*R*.5,tailY+L*.025,tailZ],.62);
  }
  // Vertical stabilizer, with a distinct T-tail profile for CRJs.
  add(faces,[0,-L*.44,R*.35],[0,-L*.35,R*3.45],[0,-L*.50,R*.35],.73);
  add(faces,[0,-L*.50,R*.35],[0,-L*.35,R*3.45],[0,-L*.44,R*.35],.55);
  if(s.engines===1){
    tube(faces,0,L*.36,L*.50,0,R*.35,.58);
    add(faces,[-W*.17,L*.505,.02],[W*.17,L*.505,.02],[0,L*.52,.17],.38);
  } else {
    const mounts=s.engines===4?[.17,.34]:[.27];
    for(const station of mounts) for(const side of [-1,1]){
      const x=side*W*station;
      const y=s.enginePosition==="tail" ? -L*.34:-L*.075;
      const z=s.enginePosition==="tail"? R*.16 : -R*.95;
      const rr=(s.group==="widebody"||s.group==="four-engine" ? R*.45:R*.36);
      tube(faces,x,y-L*.05,y+L*.065,z,rr,.62);
      // Dark nacelle intake ring + fan hint, without animated assets.
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=(i+1)*Math.PI/4;
        add(faces,[x,y+L*.067,z],[x+Math.cos(a)*rr*.82,y+L*.067,z+Math.sin(a)*rr*.82],
          [x+Math.cos(b)*rr*.82,y+L*.067,z+Math.sin(b)*rr*.82],.20);
      }
      // Pylon
      add(faces,[x,y-L*.02,z+rr],[x,y+L*.04,z+rr],[x-side*.15,y,z+rr+R*.65],.66);
    }
  }
  // Cockpit glazing and bounded rows of cabin windows improve silhouette readability.
  for(const side of [-1,1]){
    add(faces,[side*R*.47,L*.402,R*.44],[side*R*.82,L*.345,R*.48],
      [side*R*.67,L*.405,R*.18],.20);
    if(s.group!=="single-prop"){
      const count=Math.min(18,Math.max(6,Math.floor(L/3.8)));
      for(let i=0;i<count;i++){
        const y=-L*.32+i*L*.63/Math.max(1,count-1);
        const x=side*R*.955,z=R*.32;
        add(faces,[x,y,z],[x,y+.55,z],[x,y+.35,z+.25],.33);
      }
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
