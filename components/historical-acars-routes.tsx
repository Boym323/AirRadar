"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { RxwHistoricalRoute } from "@/lib/server/rxw-route-history";
import { createRxwFpnRoute } from "@/lib/radar/rxw-fpn-visual";
import { configureMapLibreWorker } from "@/lib/maplibre-worker";
import { rxwHistoryCopy } from "@/lib/i18n/rxw-history";
import { t } from "@/lib/i18n";
import styles from "@/components/historical-acars-routes.module.css";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256,
      attribution: "© OpenStreetMap contributors" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0b1725" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.6 } },
  ],
};

function ReportedPlanMap({ route }: { route: RxwHistoricalRoute }) {
  const container = useRef<HTMLDivElement | null>(null);
  const geometry = useMemo(() => createRxwFpnRoute({
    icaoHex: route.icaoHex, flight: route.flight, origin: route.origin,
    destination: route.destination, status: "planned", waypoints: route.waypoints,
    positionedCount: route.positionedCount, observedAt: route.observedAt,
    stationId: route.stationId, source: route.source, confidence: "reported",
  }), [route]);
  useEffect(() => {
    if (!container.current) return;
    const positioned = geometry.features.filter(f => f.geometry.type === "Point");
    if (!positioned.length) return;
    configureMapLibreWorker();
    const first = positioned[0].geometry.coordinates;
    const map = new maplibregl.Map({
      container: container.current, style: MAP_STYLE, center: first as [number, number],
      zoom: 6, attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("reported-route", { type: "geojson", data: geometry });
      map.addLayer({ id: "reported-route-line", type: "line", source: "reported-route",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#9b8cff", "line-width": 2.5, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "reported-route-points", type: "circle", source: "reported-route",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#9b8cff", "circle-radius": 4, "circle-stroke-color": "#08111d", "circle-stroke-width": 1 } });
      const bounds = new maplibregl.LngLatBounds(first as [number, number], first as [number, number]);
      for (const point of positioned.slice(1)) bounds.extend(point.geometry.coordinates as [number, number]);
      if (positioned.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 10, duration: 0 });
    });
    return () => map.remove();
  }, [geometry]);
  return <div ref={container} className={styles.map} role="img" aria-label="ACARS waypoint route map" />;
}

export function HistoricalAcarsRoutes({ routes }: { routes: RxwHistoricalRoute[] }) {
  const [index, setIndex] = useState(0);
  const selected = routes[Math.min(index, routes.length - 1)];
  const copy = rxwHistoryCopy(t.locale);
  if (!selected) return null;
  return <section className={"history-card " + styles.section} aria-label={copy.title}>
    <div className={styles.header}><h2>{copy.title}</h2><p>{copy.subtitle}</p></div>
    {routes.length > 1 && <div className={styles.picker}>
      {routes.map((route, i) => <button key={route.id} type="button" className={styles.choice}
        aria-pressed={index === i} onClick={() => setIndex(i)}>
        {route.kind === "FPN" ? copy.typeFpn : copy.typePair}
        {" · "}{new Date(route.observedAt).toLocaleString(t.locale)}
      </button>)}
    </div>}
    <div className={styles.details}>
      <strong>{selected.origin} → {selected.destination}</strong>
      <span>{selected.kind === "FPN" ? copy.typeFpn : copy.typePair}</span>
      <span>{copy.captured}: {new Date(selected.observedAt).toLocaleString(t.locale)}</span>
      <span>{copy.source}: RXW Hub / {selected.protocol}</span>
      {selected.kind === "FPN" && <span>{selected.waypoints.length} {copy.points} · {selected.positionedCount} {copy.located}</span>}
    </div>
    {selected.kind === "FPN" && selected.positionedCount > 0
      ? <ReportedPlanMap key={selected.id} route={selected} />
      : <p className={styles.note}>{copy.noCoordinates}</p>}
    {selected.waypoints.length > 0 && <ol className={styles.fixes}>
      {selected.waypoints.map((fix, i) => <li key={i}>{fix.name}{fix.via ? " · " + fix.via : ""}
        {fix.lat !== null && fix.lon !== null ? " · " + fix.lat.toFixed(3) + "°, " + fix.lon.toFixed(3) + "°" : ""}
      </li>)}
    </ol>}
    <p className={styles.note}>{copy.note}</p>
  </section>;
}
