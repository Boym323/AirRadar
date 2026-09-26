import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import {
  confirmedInterpolationDurationMs,
  correctionFor,
  createMotionHistory,
  motionAt,
  motionObservationAdvances,
  motionRenderIntervalMs,
  normalizeHeading,
  updateMotionHistory,
  visualHeadingForConfirmedPosition,
  type MotionHistory,
  type MotionSource,
} from "@/lib/aircraft/motion";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { aircraftColor, type AircraftColorMode } from "@/lib/aircraft/color-mode";
import { classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { classifyAircraftIcon } from "@/lib/aircraft/icon-classification";
import { TAR1090_UNKNOWN_ICON_ASSET } from "@/lib/aircraft/tar1090-icon-map";
import type { AircraftView } from "@/lib/aircraft/types";
import type { RadarPerformanceDiagnosticsSession } from "@/lib/radar/performance-diagnostics";

export const AIRCRAFT_WEBGL_LAYER_ID = "aircraft-webgl";
export const AIRCRAFT_WEBGL_LABEL_SOURCE_ID = "aircraft-webgl-labels";
export const AIRCRAFT_WEBGL_LABEL_LAYER_ID = "aircraft-webgl-label";

const MIN_AIRCRAFT_ANIMATION_MS = 300;
const MAX_AIRCRAFT_ANIMATION_MS = 12_000;
const FLOATS_PER_VERTEX = 9;
const ICON_ATLAS_SIZE = 64;
const MAX_ICON_ATLAS_LAYERS = 512;
const SPATIAL_GRID_SIZE = 1024;

type Rgba = readonly [number, number, number, number];

interface WebglAircraftJob {
  source: MotionSource;
  correctionLon: number;
  correctionLat: number;
  correctionStartedAt: number;
  correctionDurationMs: number;
  sourceReceivedAt: number;
  history: MotionHistory;
  visualHeading: number | null;
  renderedLon: number;
  renderedLat: number;
  color: Rgba;
  pointSize: number;
  iconAsset: string;
  iconLayer: number;
  spatialCell: number;
}

export interface AircraftWebglRuntimeOptions {
  getPerformanceDiagnostics(): RadarPerformanceDiagnosticsSession | null;
  prefersReducedMotion?(): boolean;
}

function sourceObservedPerformanceTime(aircraft: AircraftView, receivedAt: number): number | null {
  const observedAt = positionObservedAt(aircraft);
  return observedAt === null ? null : receivedAt - Math.max(0, Date.now() - observedAt);
}

function parseCssColor(value: string | null): [number, number, number] | null {
  if (!value) return null;
  const rgb = value.match(/^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/i);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const raw = Number.parseInt(hex[1]!, 16);
    return [((raw >> 16) & 0xff) / 255, ((raw >> 8) & 0xff) / 255, (raw & 0xff) / 255];
  }
  return null;
}

export function aircraftWebglColor(aircraft: AircraftView, mode: AircraftColorMode): Rgba {
  const mapped = parseCssColor(aircraftColor(aircraft, mode));
  if (mapped) return [mapped[0], mapped[1], mapped[2], 0.96];

  switch (classifyAircraftSource(aircraft)) {
    case "NETWORK_ONLY": return [0.565, 0.643, 0.722, 0.82];
    case "OVERLAP": return [0.216, 0.839, 0.753, 1];
    case "LOCAL_ONLY": return [0.216, 0.839, 0.753, 0.96];
    default: return [0.565, 0.643, 0.722, 0.9];
  }
}

export function aircraftWebglIconAsset(aircraft: AircraftView): string {
  return classifyAircraftIcon(aircraft).asset ?? TAR1090_UNKNOWN_ICON_ASSET;
}

function pointSizeFor(aircraft: AircraftView): number {
  switch (classifyAircraftIcon(aircraft).kind) {
    case "ground": return 12;
    case "helicopter": return 16;
    case "glider": return 17;
    case "drone": return 15;
    default: return 18;
  }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create aircraft WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Aircraft WebGL shader failed: ${detail}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, `#version 300 es
    precision highp float;
    layout(location = 0) in vec2 a_pos;
    layout(location = 1) in float a_angle;
    layout(location = 2) in vec4 a_color;
    layout(location = 3) in float a_size;
    layout(location = 4) in float a_icon_layer;
    uniform mat4 u_matrix;
    uniform float u_pixel_ratio;
    uniform int u_hovered_index;
    out float v_angle;
    out vec4 v_color;
    flat out float v_icon_layer;
    void main() {
      gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
      float hoverScale = gl_VertexID == u_hovered_index ? 1.3 : 1.0;
      gl_PointSize = a_size * hoverScale * u_pixel_ratio;
      v_angle = a_angle;
      v_color = a_color;
      v_icon_layer = a_icon_layer;
    }
  `);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in float v_angle;
    in vec4 v_color;
    flat in float v_icon_layer;
    uniform highp sampler2DArray u_icon_atlas;
    out vec4 fragColor;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      p.y = -p.y;
      float c = cos(-v_angle);
      float s = sin(-v_angle);
      vec2 q = mat2(c, -s, s, c) * p;

      float maskAlpha = 1.0;
      if (v_icon_layer >= 0.0) {
        vec2 uv = vec2(q.x + 0.5, 0.5 - q.y);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
        maskAlpha = texture(u_icon_atlas, vec3(uv, v_icon_layer)).a;
        if (maskAlpha < 0.08) discard;
      } else {
        bool fuselage = abs(q.x) < 0.065 && q.y > -0.38 && q.y < 0.38;
        bool nose = q.y >= 0.18 && q.y <= 0.44 && abs(q.x) < (0.44 - q.y) * 0.42 + 0.025;
        bool wings = abs(q.y + 0.02) < 0.065 && abs(q.x) < 0.42;
        bool tail = q.y > -0.34 && q.y < -0.20 && abs(q.x) < 0.19;
        if (!(fuselage || nose || wings || tail)) discard;
      }

      float alpha = v_color.a * maskAlpha;
      fragColor = vec4(v_color.rgb * alpha, alpha);
    }
  `);

  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create aircraft WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Aircraft WebGL program failed: ${detail}`);
  }
  return program;
}

function hasActiveCorrection(job: WebglAircraftJob, timestamp: number): boolean {
  const hasCorrection = job.correctionLon !== 0 || job.correctionLat !== 0;
  return hasCorrection && timestamp - job.correctionStartedAt < job.correctionDurationMs;
}

export class AircraftWebglRuntime {
  readonly layer: CustomLayerInterface;
  private readonly jobs = new Map<string, WebglAircraftJob>();
  private map: MapLibreMap | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private matrixLocation: WebGLUniformLocation | null = null;
  private pixelRatioLocation: WebGLUniformLocation | null = null;
  private hoveredIndexLocation: WebGLUniformLocation | null = null;
  private iconAtlasLocation: WebGLUniformLocation | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private iconTexture: WebGLTexture | null = null;
  private readonly iconLayers = new Map<string, number>();
  private readonly pendingIconAssets = new Set<string>();
  private nextIconLayer = 0;
  private maxIconAtlasLayers = 0;
  private iconAtlasGeneration = 0;
  private readonly renderIndexByHex = new Map<string, number>();
  private readonly spatialBuckets = new Map<number, Set<string>>();
  private hoveredHex: string | null = null;
  private dirty = true;
  private visible = true;
  private lastDataRenderAt = Number.NEGATIVE_INFINITY;
  private lastBearing = Number.NaN;
  private renderedCount = 0;

  constructor(private readonly options: AircraftWebglRuntimeOptions) {
    this.layer = {
      id: AIRCRAFT_WEBGL_LAYER_ID,
      type: "custom",
      renderingMode: "2d",
      onAdd: (map, gl) => this.onAdd(map, gl),
      render: (gl, input) => this.render(gl, input),
      onRemove: (_map, gl) => this.onRemove(gl),
    };
  }

  get size(): number {
    return this.jobs.size;
  }

  has(icaoHex: string): boolean {
    return this.jobs.has(icaoHex);
  }

  getRenderedPosition(icaoHex: string): { lon: number; lat: number } | null {
    const job = this.jobs.get(icaoHex);
    return job ? { lon: job.renderedLon, lat: job.renderedLat } : null;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.map?.triggerRepaint();
  }

  setHovered(icaoHex: string | null): void {
    const next = icaoHex && this.jobs.has(icaoHex) ? icaoHex : null;
    if (this.hoveredHex === next) return;
    this.hoveredHex = next;
    this.map?.triggerRepaint();
  }

  pickAircraftAtPoint(point: { x: number; y: number }, radiusPx = 13): string | null {
    const map = this.map;
    if (!map || !this.visible || !this.jobs.size || radiusPx <= 0) return null;

    const corners = [
      [point.x - radiusPx, point.y - radiusPx],
      [point.x + radiusPx, point.y - radiusPx],
      [point.x - radiusPx, point.y + radiusPx],
      [point.x + radiusPx, point.y + radiusPx],
    ] as const;
    const mercatorCorners = corners.map(([x, y]) => MercatorCoordinate.fromLngLat(map.unproject([x, y])));
    const minX = Math.min(...mercatorCorners.map((corner) => corner.x));
    const maxX = Math.max(...mercatorCorners.map((corner) => corner.x));
    const minY = Math.min(...mercatorCorners.map((corner) => corner.y));
    const maxY = Math.max(...mercatorCorners.map((corner) => corner.y));
    const clampIndex = (value: number) => Math.max(0, Math.min(SPATIAL_GRID_SIZE - 1, Math.floor(value * SPATIAL_GRID_SIZE)));
    const minColumn = clampIndex(minX);
    const maxColumn = clampIndex(maxX);
    const minRow = clampIndex(minY);
    const maxRow = clampIndex(maxY);

    const radiusSquared = radiusPx * radiusPx;
    let nearestHex: string | null = null;
    let nearestDistanceSquared = radiusSquared;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const bucket = this.spatialBuckets.get(row * SPATIAL_GRID_SIZE + column);
        if (!bucket) continue;
        for (const hex of bucket) {
          const job = this.jobs.get(hex);
          if (!job) continue;
          const projected = map.project([job.renderedLon, job.renderedLat]);
          const dx = projected.x - point.x;
          const dy = projected.y - point.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > nearestDistanceSquared) continue;
          nearestDistanceSquared = distanceSquared;
          nearestHex = hex;
        }
      }
    }
    return nearestHex;
  }

  upsert(aircraft: AircraftView, colorMode: AircraftColorMode): void {
    if (aircraft.lat === null || aircraft.lon === null) return;
    if (!Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) return;

    const now = performance.now();
    const target = { lat: aircraft.lat, lon: aircraft.lon };
    const source: MotionSource = {
      lat: aircraft.lat,
      lon: aircraft.lon,
      observedAt: sourceObservedPerformanceTime(aircraft, now),
      groundSpeed: aircraft.groundSpeed,
      track: aircraft.track,
      positionOrigin: aircraft.provenance?.positionOrigin ?? null,
      positionSource: aircraft.provenance?.positionSource ?? null,
      allowPrediction: false,
    };
    const color = aircraftWebglColor(aircraft, colorMode);
    const pointSize = pointSizeFor(aircraft);
    const iconAsset = aircraftWebglIconAsset(aircraft);
    const iconLayer = this.iconLayers.get(iconAsset) ?? -1;
    this.requestIconAsset(iconAsset);
    const previous = this.jobs.get(aircraft.icaoHex);

    if (!previous) {
      const history = updateMotionHistory(createMotionHistory(), source);
      this.jobs.set(aircraft.icaoHex, {
        source,
        correctionLon: 0,
        correctionLat: 0,
        correctionStartedAt: now,
        correctionDurationMs: MIN_AIRCRAFT_ANIMATION_MS,
        sourceReceivedAt: now,
        history,
        visualHeading: visualHeadingForConfirmedPosition(target, source, history),
        renderedLon: aircraft.lon,
        renderedLat: aircraft.lat,
        color,
        pointSize,
        iconAsset,
        iconLayer,
        spatialCell: -1,
      });
      this.dirty = true;
      this.map?.triggerRepaint();
      return;
    }

    previous.color = color;
    previous.pointSize = pointSize;
    previous.iconAsset = iconAsset;
    previous.iconLayer = iconLayer;
    if (!motionObservationAdvances(previous.source, source)) {
      this.dirty = true;
      this.map?.triggerRepaint();
      return;
    }

    const nextHistory = updateMotionHistory(previous.history, source);
    if (this.options.prefersReducedMotion?.()) {
      previous.history = nextHistory;
      previous.source = source;
      previous.sourceReceivedAt = now;
      previous.correctionStartedAt = now;
      previous.correctionDurationMs = 0;
      previous.correctionLon = 0;
      previous.correctionLat = 0;
      previous.visualHeading = visualHeadingForConfirmedPosition(target, source, nextHistory);
      previous.renderedLon = aircraft.lon;
      previous.renderedLat = aircraft.lat;
      this.dirty = true;
      this.map?.triggerRepaint();
      return;
    }

    const interpolationDurationMs = confirmedInterpolationDurationMs(
      previous.source,
      source,
      now - previous.sourceReceivedAt,
      MIN_AIRCRAFT_ANIMATION_MS,
      MAX_AIRCRAFT_ANIMATION_MS,
    );
    const correction = correctionFor(
      { lon: previous.renderedLon, lat: previous.renderedLat },
      source,
      now,
      interpolationDurationMs,
      nextHistory,
    );
    const previousInterpolationActive = (previous.correctionLon !== 0 || previous.correctionLat !== 0)
      && now - previous.correctionStartedAt < previous.correctionDurationMs;
    const visualHeading = correction
      ? visualHeadingForConfirmedPosition({ lon: previous.renderedLon, lat: previous.renderedLat }, source, nextHistory)
      : visualHeadingForConfirmedPosition(target, source, nextHistory);

    previous.history = nextHistory;
    previous.source = source;
    previous.sourceReceivedAt = now;
    previous.correctionStartedAt = now;
    previous.correctionDurationMs = interpolationDurationMs;
    previous.correctionLon = correction?.lon ?? 0;
    previous.correctionLat = correction?.lat ?? 0;
    previous.visualHeading = visualHeading
      ?? (correction && previousInterpolationActive ? previous.visualHeading : null);
    if (!correction) {
      previous.renderedLon = aircraft.lon;
      previous.renderedLat = aircraft.lat;
    }

    this.dirty = true;
    this.map?.triggerRepaint();
  }

  sync(aircraft: readonly AircraftView[], colorMode: AircraftColorMode): void {
    const keep = new Set<string>();
    for (const item of aircraft) {
      keep.add(item.icaoHex);
      this.upsert(item, colorMode);
    }
    for (const hex of [...this.jobs.keys()]) {
      if (!keep.has(hex)) this.remove(hex);
    }
  }

  remove(icaoHex: string): void {
    const job = this.jobs.get(icaoHex);
    if (!job) return;
    this.removeSpatialCell(icaoHex, job);
    this.jobs.delete(icaoHex);
    this.renderIndexByHex.delete(icaoHex);
    if (this.hoveredHex === icaoHex) this.hoveredHex = null;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  clear(): void {
    if (!this.jobs.size && !this.spatialBuckets.size) return;
    this.jobs.clear();
    this.renderIndexByHex.clear();
    this.spatialBuckets.clear();
    this.hoveredHex = null;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  private spatialCellFor(x: number, y: number): number {
    const column = Math.max(0, Math.min(SPATIAL_GRID_SIZE - 1, Math.floor(x * SPATIAL_GRID_SIZE)));
    const row = Math.max(0, Math.min(SPATIAL_GRID_SIZE - 1, Math.floor(y * SPATIAL_GRID_SIZE)));
    return row * SPATIAL_GRID_SIZE + column;
  }

  private updateSpatialCell(icaoHex: string, job: WebglAircraftJob, x: number, y: number): void {
    const nextCell = this.spatialCellFor(x, y);
    if (job.spatialCell === nextCell) return;
    this.removeSpatialCell(icaoHex, job);
    let bucket = this.spatialBuckets.get(nextCell);
    if (!bucket) {
      bucket = new Set<string>();
      this.spatialBuckets.set(nextCell, bucket);
    }
    bucket.add(icaoHex);
    job.spatialCell = nextCell;
  }

  private removeSpatialCell(icaoHex: string, job: WebglAircraftJob): void {
    if (job.spatialCell < 0) return;
    const bucket = this.spatialBuckets.get(job.spatialCell);
    bucket?.delete(icaoHex);
    if (bucket?.size === 0) this.spatialBuckets.delete(job.spatialCell);
    job.spatialCell = -1;
  }

  private requestIconAsset(asset: string): void {
    if (this.iconLayers.has(asset) || this.pendingIconAssets.has(asset)) return;
    const gl = this.gl;
    const texture = this.iconTexture;
    if (!gl || !texture || this.nextIconLayer >= this.maxIconAtlasLayers) return;

    const layer = this.nextIconLayer++;
    const generation = this.iconAtlasGeneration;
    this.pendingIconAssets.add(asset);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      this.pendingIconAssets.delete(asset);
      if (generation !== this.iconAtlasGeneration || this.gl !== gl || this.iconTexture !== texture) return;
      const width = image.naturalWidth || ICON_ATLAS_SIZE;
      const height = image.naturalHeight || ICON_ATLAS_SIZE;
      const scale = Math.min((ICON_ATLAS_SIZE - 8) / width, (ICON_ATLAS_SIZE - 8) / height);
      const drawWidth = Math.max(1, width * scale);
      const drawHeight = Math.max(1, height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = ICON_ATLAS_SIZE;
      canvas.height = ICON_ATLAS_SIZE;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, ICON_ATLAS_SIZE, ICON_ATLAS_SIZE);
      context.drawImage(
        image,
        (ICON_ATLAS_SIZE - drawWidth) / 2,
        (ICON_ATLAS_SIZE - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );

      const previousFlipY = Boolean(gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      // The shader maps the top of the screen-space point to v=0. Keep the
      // north-up SVG source unflipped here, otherwise nose and tail swap.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        layer,
        ICON_ATLAS_SIZE,
        ICON_ATLAS_SIZE,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlipY ? 1 : 0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

      this.iconLayers.set(asset, layer);
      for (const job of this.jobs.values()) {
        if (job.iconAsset === asset) job.iconLayer = layer;
      }
      this.dirty = true;
      this.map?.triggerRepaint();
    };
    image.onerror = () => {
      this.pendingIconAssets.delete(asset);
    };
    image.src = asset;
  }

  private onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.iconAtlasGeneration += 1;
    this.iconLayers.clear();
    this.pendingIconAssets.clear();
    this.nextIconLayer = 0;
    this.maxIconAtlasLayers = Math.min(
      MAX_ICON_ATLAS_LAYERS,
      Math.max(1, Number(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)) || 1),
    );
    this.program = createProgram(gl);
    this.buffer = gl.createBuffer();
    this.vao = gl.createVertexArray();
    this.iconTexture = gl.createTexture();
    if (!this.buffer || !this.vao || !this.iconTexture) throw new Error("Unable to create aircraft WebGL resources");

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.iconTexture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ICON_ATLAS_SIZE, ICON_ATLAS_SIZE, this.maxIconAtlasLayers);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
    this.pixelRatioLocation = gl.getUniformLocation(this.program, "u_pixel_ratio");
    this.hoveredIndexLocation = gl.getUniformLocation(this.program, "u_hovered_index");
    this.iconAtlasLocation = gl.getUniformLocation(this.program, "u_icon_atlas");
    for (const job of this.jobs.values()) {
      job.iconLayer = -1;
      this.requestIconAsset(job.iconAsset);
    }
    this.dirty = true;
  }

  private render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if (!this.program || !this.buffer || !this.vao || !this.map || !this.visible || !this.jobs.size) return;

    const now = performance.now();
    const bearing = this.map.getBearing();
    const frameIntervalMs = motionRenderIntervalMs(this.jobs.size);
    const dataFrameDue = frameIntervalMs === 0 || now - this.lastDataRenderAt >= frameIntervalMs;
    const bearingChanged = !Number.isFinite(this.lastBearing) || Math.abs(bearing - this.lastBearing) > 0.001;
    let activeCorrection = false;

    if (this.dirty || dataFrameDue || bearingChanged) {
      const diagnostics = this.options.getPerformanceDiagnostics();
      const startedAt = diagnostics ? performance.now() : 0;
      const data = new Float32Array(this.jobs.size * FLOATS_PER_VERTEX);
      let offset = 0;
      let vertexIndex = 0;
      this.renderIndexByHex.clear();

      for (const [icaoHex, job] of this.jobs) {
        const motion = motionAt(job.source, now, {
          lon: job.correctionLon,
          lat: job.correctionLat,
          startedAt: job.correctionStartedAt,
          durationMs: job.correctionDurationMs,
        }, job.history, job.visualHeading);

        job.renderedLon = motion.lon;
        job.renderedLat = motion.lat;
        if (!motion.correctionActive) {
          job.correctionLon = 0;
          job.correctionLat = 0;
        } else {
          activeCorrection = true;
        }

        const mercator = MercatorCoordinate.fromLngLat({ lng: motion.lon, lat: motion.lat });
        this.updateSpatialCell(icaoHex, job, mercator.x, mercator.y);
        this.renderIndexByHex.set(icaoHex, vertexIndex);
        vertexIndex += 1;
        const heading = normalizeHeading(motion.heading) ?? 0;
        const screenHeading = (heading - bearing) * Math.PI / 180;
        data[offset++] = mercator.x;
        data[offset++] = mercator.y;
        data[offset++] = screenHeading;
        data[offset++] = job.color[0];
        data[offset++] = job.color[1];
        data[offset++] = job.color[2];
        data[offset++] = job.color[3];
        data[offset++] = job.pointSize;
        data[offset++] = job.iconLayer;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.renderedCount = this.jobs.size;
      this.lastDataRenderAt = now;
      this.lastBearing = bearing;
      this.dirty = false;

      if (diagnostics) {
        diagnostics.recordAnimationFrame(
          performance.now() - startedAt,
          this.jobs.size,
          this.jobs.size,
        );
      }
    } else {
      for (const job of this.jobs.values()) {
        if (hasActiveCorrection(job, now)) {
          activeCorrection = true;
          break;
        }
      }
    }

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    if (this.matrixLocation !== null) gl.uniformMatrix4fv(this.matrixLocation, false, input.defaultProjectionData.mainMatrix);
    if (this.pixelRatioLocation !== null) gl.uniform1f(this.pixelRatioLocation, Math.max(1, window.devicePixelRatio || 1));
    if (this.hoveredIndexLocation !== null) {
      const hoveredIndex = this.hoveredHex ? this.renderIndexByHex.get(this.hoveredHex) ?? -1 : -1;
      gl.uniform1i(this.hoveredIndexLocation, hoveredIndex);
    }
    if (this.iconTexture && this.iconAtlasLocation !== null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.iconTexture);
      gl.uniform1i(this.iconAtlasLocation, 0);
    }
    gl.drawArrays(gl.POINTS, 0, this.renderedCount);
    if (this.iconTexture) gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    gl.bindVertexArray(null);

    if (activeCorrection) this.map.triggerRepaint();
  }

  private onRemove(gl: WebGL2RenderingContext): void {
    this.iconAtlasGeneration += 1;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.iconTexture) gl.deleteTexture(this.iconTexture);
    if (this.program) gl.deleteProgram(this.program);
    this.vao = null;
    this.buffer = null;
    this.iconTexture = null;
    this.program = null;
    this.matrixLocation = null;
    this.pixelRatioLocation = null;
    this.hoveredIndexLocation = null;
    this.iconAtlasLocation = null;
    this.gl = null;
    this.iconLayers.clear();
    this.renderIndexByHex.clear();
    this.spatialBuckets.clear();
    this.hoveredHex = null;
    this.pendingIconAssets.clear();
    this.nextIconLayer = 0;
    this.maxIconAtlasLayers = 0;
    this.map = null;
    this.renderedCount = 0;
  }
}

export function createAircraftWebglRuntime(options: AircraftWebglRuntimeOptions): AircraftWebglRuntime {
  return new AircraftWebglRuntime(options);
}
