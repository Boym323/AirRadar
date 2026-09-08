"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { Airport } from "@/lib/airports/types";
import { t } from "@/lib/i18n";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "/fonts/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#091522" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.62, "raster-saturation": -0.74, "raster-contrast": 0.16, "raster-brightness-min": 0.06, "raster-brightness-max": 0.9 } },
  ],
};

export function AirportMap({ airport }: { airport: Airport }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [airport.longitude, airport.latitude],
      zoom: 10,
      minZoom: 3,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const markerElement = document.createElement("div");
    markerElement.className = "airport-detail-marker";
    markerElement.setAttribute("aria-label", `${airport.icaoCode} ${airport.name}`);
    markerElement.title = airport.name;
    const marker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
      .setLngLat([airport.longitude, airport.latitude])
      .addTo(map);

    return () => {
      marker.remove();
      map.remove();
    };
  }, [airport]);

  return <div ref={containerRef} className="airport-map" role="img" aria-label={`${t.airport.map}: ${airport.name}`} />;
}
