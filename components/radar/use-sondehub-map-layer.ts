"use client";

import { useEffect, useState, type RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point, LineString } from "geojson";
import { t, formatDateTime } from "@/lib/i18n";
import type { SondeDetail, SondePoint, SondeSnapshot } from "@/lib/server/sondehub-provider";

export type SondeLayerStatus = "idle" | "loading" | "ready" | "stale" | "unavailable";
const SOURCE = "sondehub-sondes";
const LAYER = "sondehub-sondes-circles";
const TRAIL_SOURCE = "sondehub-trail";
const TRAIL_LAYER = "sondehub-trail-line";
const LANDING_SOURCE = "sondehub-predicted-landing";
const LANDING_LAYER = "sondehub-predicted-landing-circle";
const empty = { type: "FeatureCollection" as const, features: [] };

export function sondeFeatures(points: readonly SondePoint[]): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: points.map((s) => ({
    type: "Feature", properties: { serial: s.serial, model: s.model },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
  })) };
}
function trailFeatures(detail: SondeDetail | null): FeatureCollection<LineString> {
  if (!detail || detail.track.length < 2) return empty;
  return { type: "FeatureCollection", features: [{
    type: "Feature", properties: { serial: detail.serial },
    geometry: { type: "LineString", coordinates: detail.track.map((p) => [p.lon, p.lat]) },
  }] };
}
function landingFeatures(detail: SondeDetail | null): FeatureCollection<Point> {
  if (!detail?.landing) return empty;
  return { type: "FeatureCollection", features: [{
    type: "Feature", properties: { serial: detail.serial },
    geometry: { type: "Point", coordinates: [detail.landing.lon, detail.landing.lat] },
  }] };
}

/** SondeHub is a separate opt-in snapshot layer; never add polling/SSE to aircraft state. */
export function useSondeHubMapLayer(mapRef: RefObject<MapLibreMap | null>, ready: boolean, enabled: boolean): SondeLayerStatus {
  const [status, setStatus] = useState<SondeLayerStatus>("idle");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!enabled) { setStatus("idle"); return; }
    let stopped = false;
    let selection = 0;
    let points: SondePoint[] = [];
    let detail: SondeDetail | null = null;
    let popup: maplibregl.Popup | null = null;
    const abort = new AbortController();

    const put = (id: string, geo: FeatureCollection<Point> | FeatureCollection<LineString>) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(geo);
    const render = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource(TRAIL_SOURCE)) map.addSource(TRAIL_SOURCE, { type: "geojson", data: empty });
      if (!map.getLayer(TRAIL_LAYER)) map.addLayer({ id: TRAIL_LAYER, source: TRAIL_SOURCE, type: "line", paint: { "line-color": "#48d3bb", "line-width": 2, "line-dasharray": [2, 2] } });
      if (!map.getSource(LANDING_SOURCE)) map.addSource(LANDING_SOURCE, { type: "geojson", data: empty });
      if (!map.getLayer(LANDING_LAYER)) map.addLayer({ id: LANDING_LAYER, source: LANDING_SOURCE, type: "circle", paint: { "circle-color": "#e9b75e", "circle-radius": 7, "circle-stroke-color": "#132c31", "circle-stroke-width": 2 } });
      if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: empty });
      if (!map.getLayer(LAYER)) map.addLayer({ id: LAYER, source: SOURCE, type: "circle", paint: { "circle-color": "#48d3bb", "circle-radius": 7, "circle-stroke-color": "#132c31", "circle-stroke-width": 2 } });
      put(SOURCE, sondeFeatures(points));
      put(TRAIL_SOURCE, trailFeatures(detail));
      put(LANDING_SOURCE, landingFeatures(detail));
    };
    const field = (element: HTMLElement, label: string, value: string) => {
      const line = document.createElement("div");
      line.textContent = label + ": " + value;
      element.append(line);
    };
    const click = (event: MapLayerMouseEvent) => {
      const serial: unknown = event.features?.[0]?.properties?.serial;
      if (typeof serial !== "string") return;
      const point = points.find((item) => item.serial === serial);
      if (!point) return;
      const current = ++selection;
      detail = null;
      render();
      popup?.remove();
      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = point.serial + (point.model ? " · " + point.model : "");
      body.append(title);
      field(body, t.layers.sondeAltitude, point.altitudeM.toLocaleString() + " m");
      field(body, t.layers.sondeObserved, formatDateTime(point.observedAt));
      if (point.verticalSpeedMs !== null) field(body, t.layers.sondeVerticalRate, point.verticalSpeedMs.toFixed(1) + " m/s");
      const landing = document.createElement("div");
      landing.textContent = t.layers.sondeLoadingDetail;
      body.append(landing);
      const link = document.createElement("a");
      link.textContent = t.layers.sondeSource;
      link.href = "https://sondehub.org/";
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      body.append(link);
      popup = new maplibregl.Popup({ maxWidth: "320px" }).setLngLat([point.lon, point.lat]).setDOMContent(body).addTo(map);
      void fetch("/api/sondes/" + encodeURIComponent(serial), { signal: abort.signal, cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<SondeDetail> : null)
        .then((value) => {
          if (stopped || selection !== current) return;
          detail = value;
          render();
          landing.textContent = value?.landing
            ? t.layers.sondeLanding + ": " + value.landing.lat.toFixed(3) + "°, " + value.landing.lon.toFixed(3) + "° (" + t.layers.sondeModelEstimate + ")"
            : t.layers.sondeNoPrediction;
        })
        .catch(() => { if (!stopped && selection === current) landing.textContent = t.layers.sondeNoPrediction; });
    };
    map.on("style.load", render);
    render();
    map.on("click", LAYER, click);
    setStatus("loading");
    const center = map.getCenter();
    const params = new URLSearchParams({ lat: center.lat.toFixed(3), lon: center.lng.toFixed(3), radiusKm: "200" });
    void fetch("/api/sondes?" + params.toString(), { signal: abort.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("SondeHub unavailable"); return response.json() as Promise<SondeSnapshot>; })
      .then((result) => {
        if (stopped) return;
        points = result.enabled && result.available ? result.sondes : [];
        setStatus(!result.enabled || !result.available ? "unavailable" : result.stale ? "stale" : "ready");
        render();
      })
      .catch(() => { if (!stopped) setStatus("unavailable"); });
    return () => {
      stopped = true;
      abort.abort();
      popup?.remove();
      map.off("style.load", render);
      map.off("click", LAYER, click);
      for (const id of [LAYER, LANDING_LAYER, TRAIL_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [SOURCE, LANDING_SOURCE, TRAIL_SOURCE]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [mapRef, ready, enabled]);
  return status;
}
