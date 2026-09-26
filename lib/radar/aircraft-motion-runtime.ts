import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  confirmedInterpolationDurationMs,
  correctionFor,
  createMotionHistory,
  motionAt,
  motionObservationAdvances,
  motionRenderIntervalMs,
  updateMotionHistory,
  visualHeadingForConfirmedPosition,
  type MotionHistory,
} from "@/lib/aircraft/motion";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";
import { setAircraftMarkerHeading, type AircraftMarkerHandle } from "@/lib/radar/aircraft-marker-controller";
import type { RadarPerformanceDiagnosticsSession } from "@/lib/radar/performance-diagnostics";

const MIN_AIRCRAFT_ANIMATION_MS = 300;
const MAX_AIRCRAFT_ANIMATION_MS = 12_000;

interface AircraftAnimationJob {
  handle: AircraftMarkerHandle;
  source: {
    lat: number;
    lon: number;
    observedAt: number | null;
    groundSpeed: number | null;
    track: number | null;
    positionOrigin: string | null;
    positionSource: string | null;
    allowPrediction: false;
  };
  correctionLon: number;
  correctionLat: number;
  correctionStartedAt: number;
  correctionDurationMs: number;
  sourceReceivedAt: number;
  history: MotionHistory;
  visualHeading: number | null;
}

export interface AircraftMotionRuntimeOptions {
  map: MapLibreMap;
  getSelectedHex(): string | null;
  getSelectedTrail(): readonly TrailPoint[];
  scheduleLabelCollision(): void;
  getPerformanceDiagnostics(): RadarPerformanceDiagnosticsSession | null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sourceObservedPerformanceTime(aircraft: AircraftView, receivedAt: number): number | null {
  const observedAt = positionObservedAt(aircraft);
  return observedAt === null ? null : receivedAt - Math.max(0, Date.now() - observedAt);
}

function predictedMarkerPosition(job: AircraftAnimationJob, timestamp: number): [number, number] {
  const motion = motionAt(job.source, timestamp, {
    lon: job.correctionLon,
    lat: job.correctionLat,
    startedAt: job.correctionStartedAt,
    durationMs: job.correctionDurationMs,
  }, job.history, job.visualHeading);
  return [motion.lon, motion.lat];
}

function hasContinuousPrediction(job: AircraftAnimationJob, timestamp: number): boolean {
  const motion = motionAt(job.source, timestamp, {
    lon: job.correctionLon,
    lat: job.correctionLat,
    startedAt: job.correctionStartedAt,
    durationMs: job.correctionDurationMs,
  }, job.history, job.visualHeading);
  return motion.predictionActive || motion.correctionActive;
}

/**
 * Owns the mutable aircraft interpolation state and RAF lifecycle. React owns
 * the desired aircraft set; this runtime owns how confirmed positions move on
 * the MapLibre surface between syncs.
 */
export class AircraftMotionRuntime {
  private readonly jobs = new Map<string, AircraftAnimationJob>();
  private animationFrame: number | null = null;
  private hiddenAt: number | null = null;
  private lastBulkAnimationRenderAt = Number.NEGATIVE_INFINITY;
  private disposed = false;

  constructor(private readonly options: AircraftMotionRuntimeOptions) {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  upsert(aircraft: AircraftView, handle: AircraftMarkerHandle): void {
    if (aircraft.lat === null || aircraft.lon === null) return;
    const marker = handle.marker;
    const now = performance.now();
    const target: [number, number] = [aircraft.lon, aircraft.lat];
    const source: AircraftAnimationJob["source"] = {
      lat: aircraft.lat,
      lon: aircraft.lon,
      observedAt: sourceObservedPerformanceTime(aircraft, now),
      groundSpeed: aircraft.groundSpeed,
      track: aircraft.track,
      positionOrigin: aircraft.provenance?.positionOrigin ?? null,
      positionSource: aircraft.provenance?.positionSource ?? null,
      allowPrediction: false,
    };
    const previous = this.jobs.get(aircraft.icaoHex);
    const createHistory = () => updateMotionHistory(createMotionHistory(), source);

    if (prefersReducedMotion()) {
      marker.setLngLat(target);
      this.jobs.delete(aircraft.icaoHex);
      return;
    }

    if (document.hidden) {
      marker.setLngLat(target);
      const history = createHistory();
      this.jobs.set(aircraft.icaoHex, {
        handle,
        source,
        correctionLon: 0,
        correctionLat: 0,
        correctionStartedAt: now,
        correctionDurationMs: MIN_AIRCRAFT_ANIMATION_MS,
        sourceReceivedAt: now,
        history,
        visualHeading: visualHeadingForConfirmedPosition({ lon: target[0], lat: target[1] }, source, history),
      });
      return;
    }

    if (previous) {
      const current = marker.getLngLat();
      if (!motionObservationAdvances(previous.source, source)) return;

      const nextHistory = updateMotionHistory(previous.history, source);
      const interpolationDurationMs = confirmedInterpolationDurationMs(
        previous.source,
        source,
        now - previous.sourceReceivedAt,
        MIN_AIRCRAFT_ANIMATION_MS,
        MAX_AIRCRAFT_ANIMATION_MS,
      );
      const correction = correctionFor(
        { lon: current.lng, lat: current.lat },
        source,
        now,
        interpolationDurationMs,
        nextHistory,
      );
      const previousInterpolationActive = (previous.correctionLon !== 0 || previous.correctionLat !== 0)
        && now - previous.correctionStartedAt < previous.correctionDurationMs;
      const visualHeading = correction
        ? visualHeadingForConfirmedPosition({ lon: current.lng, lat: current.lat }, source, nextHistory)
        : visualHeadingForConfirmedPosition({ lon: target[0], lat: target[1] }, source, nextHistory);

      previous.history = nextHistory;
      previous.source = source;
      previous.sourceReceivedAt = now;
      previous.correctionStartedAt = now;
      previous.correctionDurationMs = interpolationDurationMs;
      previous.correctionLon = correction?.lon ?? 0;
      previous.correctionLat = correction?.lat ?? 0;
      previous.visualHeading = visualHeading
        ?? (correction && previousInterpolationActive ? previous.visualHeading : null);

      if (!correction) marker.setLngLat(target);

      const heading = motionAt(
        source,
        now,
        correction ?? undefined,
        nextHistory,
        previous.visualHeading,
      ).heading;
      if (heading !== null) setAircraftMarkerHeading(handle, heading, this.options.map.getBearing());
      if (correction) this.schedule();
      return;
    }

    marker.setLngLat(target);
    const history = createHistory();
    this.jobs.set(aircraft.icaoHex, {
      handle,
      source,
      correctionLon: 0,
      correctionLat: 0,
      correctionStartedAt: now,
      correctionDurationMs: MIN_AIRCRAFT_ANIMATION_MS,
      sourceReceivedAt: now,
      history,
      visualHeading: visualHeadingForConfirmedPosition({ lon: target[0], lat: target[1] }, source, history),
    });
  }

  renderedHeading(icaoHex: string, fallback: number | null): number | null {
    const job = this.jobs.get(icaoHex);
    if (!job) return fallback;
    return motionAt(job.source, performance.now(), {
      lon: job.correctionLon,
      lat: job.correctionLat,
      startedAt: job.correctionStartedAt,
      durationMs: job.correctionDurationMs,
    }, job.history, job.visualHeading).heading ?? fallback;
  }

  remove(icaoHex: string): void {
    this.jobs.delete(icaoHex);
  }

  schedule(): void {
    if (this.disposed || document.hidden || this.animationFrame !== null) return;
    if (!this.jobs.size) return;
    if (!Array.from(this.jobs.values()).some((job) => hasContinuousPrediction(job, performance.now()))) return;
    this.animationFrame = window.requestAnimationFrame(this.runAnimations);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.animationFrame !== null) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.hiddenAt = null;
    this.jobs.clear();
  }

  private readonly runAnimations = (timestamp: number): void => {
    this.animationFrame = null;
    if (this.disposed) return;
    if (document.hidden) {
      this.hiddenAt ??= timestamp;
      return;
    }

    if (prefersReducedMotion()) {
      for (const job of this.jobs.values()) {
        job.handle.marker.setLngLat([job.source.lon, job.source.lat]);
      }
      this.jobs.clear();
      this.options.scheduleLabelCollision();
      return;
    }

    const diagnostics = this.options.getPerformanceDiagnostics();
    const frameStartedAt = diagnostics ? performance.now() : 0;
    let markerWrites = 0;
    let continueAnimation = false;
    const selectedAnimationHex = this.options.getSelectedHex();
    const selectedAnimationJob = selectedAnimationHex ? this.jobs.get(selectedAnimationHex) : undefined;
    let selectedAnimationMotion: ReturnType<typeof motionAt> | null = null;
    const bulkFrameIntervalMs = motionRenderIntervalMs(this.jobs.size);
    const bulkFrameDue = bulkFrameIntervalMs === 0
      || timestamp - this.lastBulkAnimationRenderAt >= bulkFrameIntervalMs;
    const mapBearing = this.options.map.getBearing();
    let renderedAnyMarker = false;

    for (const job of this.jobs.values()) {
      const correctionElapsed = timestamp - job.correctionStartedAt >= job.correctionDurationMs;
      const hasCorrection = job.correctionLon !== 0 || job.correctionLat !== 0;
      const renderFinalCorrection = hasCorrection && correctionElapsed;
      const renderThisFrame = job === selectedAnimationJob || bulkFrameDue || renderFinalCorrection;

      if (!renderThisFrame) {
        if (hasCorrection && !correctionElapsed) continueAnimation = true;
        continue;
      }

      const motion = motionAt(job.source, timestamp, {
        lon: job.correctionLon,
        lat: job.correctionLat,
        startedAt: job.correctionStartedAt,
        durationMs: job.correctionDurationMs,
      }, job.history, job.visualHeading);
      job.handle.marker.setLngLat([motion.lon, motion.lat]);
      if (diagnostics) markerWrites += 1;
      if (motion.heading !== null) setAircraftMarkerHeading(job.handle, motion.heading, mapBearing);
      renderedAnyMarker = true;
      if (job === selectedAnimationJob) selectedAnimationMotion = motion;

      if (correctionElapsed) {
        job.correctionLon = 0;
        job.correctionLat = 0;
      }
      if (motion.predictionActive || motion.correctionActive) continueAnimation = true;
    }

    if (bulkFrameDue) this.lastBulkAnimationRenderAt = timestamp;
    if (renderedAnyMarker) this.options.scheduleLabelCollision();

    const selectedTrailTailSource = this.options.map.getSource("selected-trail-live-tail") as GeoJSONSource | undefined;
    if (selectedTrailTailSource && selectedAnimationHex && selectedAnimationJob) {
      const confirmed = this.options.getSelectedTrail();
      const rendered = selectedAnimationMotion
        ? [selectedAnimationMotion.lon, selectedAnimationMotion.lat] as [number, number]
        : predictedMarkerPosition(selectedAnimationJob, timestamp);
      const last = confirmed.at(-1);
      const coordinates = last
        && (Math.abs(last.lon - rendered[0]) > 0.000001 || Math.abs(last.lat - rendered[1]) > 0.000001)
        ? [[last.lon, last.lat], rendered]
        : [];
      selectedTrailTailSource.setData(coordinates.length > 1
        ? {
            type: "Feature",
            properties: { icaoHex: selectedAnimationHex },
            geometry: { type: "LineString", coordinates },
          }
        : { type: "FeatureCollection", features: [] });
    }

    if (diagnostics) {
      diagnostics.recordAnimationFrame(
        performance.now() - frameStartedAt,
        markerWrites,
        this.jobs.size,
      );
    }
    if (continueAnimation) this.animationFrame = window.requestAnimationFrame(this.runAnimations);
  };

  private readonly onVisibilityChange = (): void => {
    if (this.disposed) return;
    if (document.hidden) {
      this.hiddenAt = performance.now();
      if (this.animationFrame !== null) window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      return;
    }
    if (this.hiddenAt !== null) this.hiddenAt = null;
    this.schedule();
  };
}

export function createAircraftMotionRuntime(options: AircraftMotionRuntimeOptions): AircraftMotionRuntime {
  return new AircraftMotionRuntime(options);
}
