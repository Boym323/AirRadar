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
import type { AircraftView } from "@/lib/aircraft/types";
import type { RadarPerformanceDiagnosticsSession } from "@/lib/radar/performance-diagnostics";

export const AIRCRAFT_WEBGL_LAYER_ID = "aircraft-webgl";
export const AIRCRAFT_WEBGL_INTERACTION_SOURCE_ID = "aircraft-webgl-interaction";
export const AIRCRAFT_WEBGL_HIT_LAYER_ID = "aircraft-webgl-hit";
export const AIRCRAFT_WEBGL_LABEL_LAYER_ID = "aircraft-webgl-label";

const MIN_AIRCRAFT_ANIMATION_MS = 300;
const MAX_AIRCRAFT_ANIMATION_MS = 12_000;
const FLOATS_PER_VERTEX = 8;

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
  hovered: boolean;
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
    uniform mat4 u_matrix;
    uniform float u_pixel_ratio;
    out float v_angle;
    out vec4 v_color;
    void main() {
      gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
      gl_PointSize = a_size * u_pixel_ratio;
      v_angle = a_angle;
      v_color = a_color;
    }
  `);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in float v_angle;
    in vec4 v_color;
    out vec4 fragColor;
    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      p.y = -p.y;
      float c = cos(-v_angle);
      float s = sin(-v_angle);
      vec2 q = mat2(c, -s, s, c) * p;

      bool fuselage = abs(q.x) < 0.065 && q.y > -0.38 && q.y < 0.38;
      bool nose = q.y >= 0.18 && q.y <= 0.44 && abs(q.x) < (0.44 - q.y) * 0.42 + 0.025;
      bool wings = abs(q.y + 0.02) < 0.065 && abs(q.x) < 0.42;
      bool tail = q.y > -0.34 && q.y < -0.20 && abs(q.x) < 0.19;
      if (!(fuselage || nose || wings || tail)) discard;

      fragColor = vec4(v_color.rgb * v_color.a, v_color.a);
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
    let changed = false;
    for (const [hex, job] of this.jobs) {
      const next = hex === icaoHex;
      if (job.hovered === next) continue;
      job.hovered = next;
      changed = true;
    }
    if (changed) {
      this.dirty = true;
      this.map?.triggerRepaint();
    }
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
        hovered: false,
      });
      this.dirty = true;
      this.map?.triggerRepaint();
      return;
    }

    previous.color = color;
    previous.pointSize = pointSize;
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
    if (!this.jobs.delete(icaoHex)) return;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  clear(): void {
    if (!this.jobs.size) return;
    this.jobs.clear();
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  private onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.program = createProgram(gl);
    this.buffer = gl.createBuffer();
    this.vao = gl.createVertexArray();
    if (!this.buffer || !this.vao) throw new Error("Unable to create aircraft WebGL buffers");

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
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
    this.pixelRatioLocation = gl.getUniformLocation(this.program, "u_pixel_ratio");
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

      for (const job of this.jobs.values()) {
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
        const heading = normalizeHeading(motion.heading) ?? 0;
        const screenHeading = (heading - bearing) * Math.PI / 180;
        data[offset++] = mercator.x;
        data[offset++] = mercator.y;
        data[offset++] = screenHeading;
        data[offset++] = job.color[0];
        data[offset++] = job.color[1];
        data[offset++] = job.color[2];
        data[offset++] = job.color[3];
        data[offset++] = job.pointSize * (job.hovered ? 1.3 : 1);
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
    gl.drawArrays(gl.POINTS, 0, this.renderedCount);
    gl.bindVertexArray(null);

    if (activeCorrection) this.map.triggerRepaint();
  }

  private onRemove(gl: WebGL2RenderingContext): void {
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.vao = null;
    this.buffer = null;
    this.program = null;
    this.matrixLocation = null;
    this.pixelRatioLocation = null;
    this.map = null;
    this.renderedCount = 0;
  }
}

export function createAircraftWebglRuntime(options: AircraftWebglRuntimeOptions): AircraftWebglRuntime {
  return new AircraftWebglRuntime(options);
}
