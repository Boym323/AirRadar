import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput } from "maplibre-gl";
import type { AircraftView } from "@/lib/aircraft/types";

export const RADAR_AIRCRAFT_3D_LAYER_ID = "radar-v6-d-aircraft-3d";
export const RADAR_AIRCRAFT_3D_LIMIT = 12;
const FLOATS_PER_VERTEX = 6;
const FEET_TO_METRES = 0.3048;

export interface Aircraft3dCandidate {
  icaoHex: string;
  lat: number;
  lon: number;
  altitudeM: number;
  heading: number;
  distanceKm: number;
  approximateAltitude: boolean;
  scale: number;
}

export function selectRadarAircraft3d(aircraft: readonly AircraftView[], selectedHex: string | null, limit = RADAR_AIRCRAFT_3D_LIMIT): Aircraft3dCandidate[] {
  const bounded = Math.max(0, Math.min(RADAR_AIRCRAFT_3D_LIMIT, Math.floor(limit) || 0));
  if (!bounded) return [];
  return aircraft.flatMap((item) => {
    const heightFt = item.geomAltitude ?? item.altitude ?? item.baroAltitude;
    if (item.onGround || item.lat === null || item.lon === null || heightFt === null ||
        !Number.isFinite(item.lat) || Math.abs(item.lat) > 85 ||
        !Number.isFinite(item.lon) || Math.abs(item.lon) > 180 ||
        !Number.isFinite(heightFt) || heightFt < -1000 || heightFt > 65000 ||
        item.seenPosSeconds === null || item.seenPosSeconds === undefined || item.seenPosSeconds < 0 || item.seenPosSeconds > 30) return [];
    const type = (item.aircraftType ?? "").toUpperCase();
    return [{ icaoHex: item.icaoHex, lat: item.lat, lon: item.lon, altitudeM: Math.max(0, heightFt * FEET_TO_METRES),
      heading: Number.isFinite(item.track) && item.track !== null ? item.track : 0,
      distanceKm: item.distanceKm ?? Infinity,
      approximateAltitude: item.geomAltitude === null || !Number.isFinite(item.geomAltitude),
      scale: /^(A38|B74|B77)/.test(type) ? 1.8 : /^(C1|P28|DR4)/.test(type) ? 0.6 : 1,
    }];
  }).sort((a,b) => (a.icaoHex === selectedHex ? -1 : b.icaoHex === selectedHex ? 1 : 0) || a.distanceKm-b.distanceKm || a.icaoHex.localeCompare(b.icaoHex)).slice(0,bounded);
}

function createShader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("3D shader unavailable");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`3D shader failed: ${error}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = createShader(gl,gl.VERTEX_SHADER,`#version 300 es
    precision highp float;
    layout(location=0) in vec3 a_pos;
    layout(location=1) in vec3 a_color;
    uniform mat4 u_matrix;
    out vec3 v_color;
    void main(){gl_Position=u_matrix*vec4(a_pos,1.0);v_color=a_color;}
  `);
  const fragment = createShader(gl,gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    in vec3 v_color;
    out vec4 fragColor;
    void main(){fragColor=vec4(v_color,1.0);}
  `);
  const program=gl.createProgram();
  if(!program)throw new Error("3D program unavailable");
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const msg=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(`3D program failed: ${msg}`);}
  return program;
}

const SHAPE = [
  // Fuselage
  [0,23,2, -3,-16,0, 3,-16,0],
  // Left/right wings
  [-3,3,0, -25,-5,0, -3,-5,0],
  [3,3,0, 3,-5,0, 25,-5,0],
  // Stabilizers
  [-2,-13,0, -9,-20,0, -2,-18,0],
  [2,-13,0, 2,-18,0, 9,-20,0],
] as const;

/** A schematic airplane in local metres oriented to ADS-B true track, not a type-correct 3D asset. */
export function aircraft3dVertices(candidates: readonly Aircraft3dCandidate[]): Float32Array {
  const points: number[]=[];
  for(const aircraft of candidates.slice(0,RADAR_AIRCRAFT_3D_LIMIT)){
    const location=MercatorCoordinate.fromLngLat([aircraft.lon,aircraft.lat],aircraft.altitudeM);
    const metre=location.meterInMercatorCoordinateUnits()*aircraft.scale;
    const angle=aircraft.heading*Math.PI/180;
    const forwardEast=Math.sin(angle), forwardNorth=Math.cos(angle);
    const rightEast=Math.cos(angle), rightNorth=-Math.sin(angle);
    const color=aircraft.approximateAltitude ? [1,0.76,0.35] : [0.30,0.93,0.80];
    for(const face of SHAPE){
      for(let i=0;i<face.length;i+=3){
        const right=face[i]!, forward=face[i+1]!,up=face[i+2]!;
        points.push(location.x+(right*rightEast+forward*forwardEast)*metre,
          location.y-(right*rightNorth+forward*forwardNorth)*metre,
          location.z+up*metre,...color);
      }
    }
  }
  return new Float32Array(points);
}

export class RadarAircraft3dRuntime {
  readonly layer: CustomLayerInterface;
  private map: import("maplibre-gl").Map | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private matrixUniform: WebGLUniformLocation | null = null;
  private vertexData = new Float32Array(0);
  private dirty = true;
  constructor() {
    this.layer={id:RADAR_AIRCRAFT_3D_LAYER_ID,type:"custom",renderingMode:"3d",
      onAdd:(map,gl)=>this.onAdd(map,gl),render:(gl,input)=>this.render(gl,input),onRemove:(_map,gl)=>this.dispose(gl)};
  }
  setAircraft(aircraft: readonly AircraftView[], selectedHex: string | null, hidden = false): void {
    const candidates = hidden ? [] : selectRadarAircraft3d(aircraft,selectedHex);
    this.vertexData = aircraft3dVertices(candidates);
    this.dirty = true;
    this.map?.triggerRepaint();
  }
  private onAdd(map: import("maplibre-gl").Map, gl: WebGL2RenderingContext): void {
    this.map=map;this.gl=gl;this.program=createProgram(gl);this.buffer=gl.createBuffer();this.vao=gl.createVertexArray();
    if(!this.buffer||!this.vao)throw new Error("3D buffers unavailable");
    gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    const stride=FLOATS_PER_VERTEX*Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,3*Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
  }
  private render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if(!this.program||!this.buffer||!this.vao||!this.vertexData.length) return;
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(this.dirty){gl.bufferData(gl.ARRAY_BUFFER,this.vertexData,gl.DYNAMIC_DRAW);this.dirty=false;}
    this.matrixUniform=this.matrixUniform??gl.getUniformLocation(this.program,"u_matrix");
    if(this.matrixUniform!==null)gl.uniformMatrix4fv(this.matrixUniform,false,input.defaultProjectionData.mainMatrix);
    gl.drawArrays(gl.TRIANGLES,0,this.vertexData.length/FLOATS_PER_VERTEX);
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
  }
  private dispose(gl: WebGL2RenderingContext): void {
    if(this.vao)gl.deleteVertexArray(this.vao);
    if(this.buffer)gl.deleteBuffer(this.buffer);
    if(this.program)gl.deleteProgram(this.program);
    this.vao=null;this.buffer=null;this.program=null;this.gl=null;this.map=null;this.matrixUniform=null;this.vertexData=new Float32Array(0);
  }
}
export function createRadarAircraft3dRuntime(): RadarAircraft3dRuntime {return new RadarAircraft3dRuntime();}
