"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { Airport } from "@/lib/airports/types";
import type { AirportInfrastructure } from "@/lib/airports/infrastructure";
import { formatNavaidFrequency } from "@/lib/airports/infrastructure";
import { haversineDistanceKm } from "@/lib/geo";
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

function validPoint(lat: number | null, lon: number | null): lat is number {
  return lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

const MAX_INFRASTRUCTURE_MAP_DISTANCE_KM = 50;

export function AirportMap({ airport, infrastructure = { runways: [], frequencies: [], navaids: [] } }: { airport: Airport; infrastructure?: AirportInfrastructure }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runwayData = infrastructure.runways;
  const navaidData = infrastructure.navaids;

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

    const runwayFeatures = runwayData.flatMap((runway) => {
      if (!validPoint(runway.leLatitude, runway.leLongitude) || !validPoint(runway.heLatitude, runway.heLongitude)) return [];
      const leLatitude = runway.leLatitude!; const leLongitude = runway.leLongitude!; const heLatitude = runway.heLatitude!; const heLongitude = runway.heLongitude!;
      if (haversineDistanceKm(airport.latitude, airport.longitude, leLatitude, leLongitude) > MAX_INFRASTRUCTURE_MAP_DISTANCE_KM || haversineDistanceKm(airport.latitude, airport.longitude, heLatitude, heLongitude) > MAX_INFRASTRUCTURE_MAP_DISTANCE_KM) return [];
      return [{ type: "Feature" as const, properties: { leIdent: runway.leIdent ?? "", heIdent: runway.heIdent ?? "", closed: runway.closed === true }, geometry: { type: "LineString" as const, coordinates: [[leLongitude, leLatitude], [heLongitude, heLatitude]] } }];
    });
    const navaidFeatures = navaidData.flatMap((navaid) => {
      if (!validPoint(navaid.latitude, navaid.longitude)) return [];
      const latitude = navaid.latitude; const longitude = navaid.longitude;
      if (haversineDistanceKm(airport.latitude, airport.longitude, latitude, longitude) > MAX_INFRASTRUCTURE_MAP_DISTANCE_KM) return [];
      return [{ type: "Feature" as const, properties: { ident: navaid.ident, type: navaid.type, name: navaid.name, frequency: navaid.frequencyKhz === null ? "" : String(navaid.frequencyKhz), channel: navaid.dmeChannel ?? "" }, geometry: { type: "Point" as const, coordinates: [longitude, latitude] } }];
    });
    const onLoad = () => {
      map.addSource("airport-runways", { type: "geojson", data: { type: "FeatureCollection", features: runwayFeatures } });
      map.addLayer({ id: "airport-runway-casing", type: "line", source: "airport-runways", paint: { "line-color": "#e7c98b", "line-width": 6, "line-opacity": 0.3 } });
      map.addLayer({ id: "airport-runways", type: "line", source: "airport-runways", paint: { "line-color": ["case", ["get", "closed"], "#c27d7d", "#e7c98b"], "line-width": 2, "line-opacity": 0.9 } });
      map.addSource("airport-navaids", { type: "geojson", data: { type: "FeatureCollection", features: navaidFeatures } });
      map.addLayer({ id: "airport-navaids", type: "circle", source: "airport-navaids", paint: { "circle-radius": 5, "circle-color": "#67d8ca", "circle-stroke-color": "#07121e", "circle-stroke-width": 1.5, "circle-opacity": 0.95 } });
      const bounds = new maplibregl.LngLatBounds([airport.longitude, airport.latitude], [airport.longitude, airport.latitude]);
      [...runwayFeatures.flatMap((feature) => feature.geometry.coordinates), ...navaidFeatures.map((feature) => feature.geometry.coordinates)].forEach((coordinate) => bounds.extend(coordinate as [number, number]));
      if (runwayFeatures.length || navaidFeatures.length) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true });
      const onNavaidClick = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0]; const properties = feature?.properties;
        if (!properties) return;
        const frequency = properties.frequency && properties.type ? formatNavaidFrequency(String(properties.type), Number(properties.frequency)) : "";
        popup.setLngLat(event.lngLat).setText([properties.ident, properties.type, frequency, properties.channel ? `DME ${properties.channel}` : "", properties.name].filter(Boolean).join("\n")).addTo(map);
      };
      map.on("click", "airport-navaids", onNavaidClick);
      map.getCanvas().style.cursor = navaidFeatures.length ? "" : map.getCanvas().style.cursor;
      map.once("remove", () => popup.remove());
    };
    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
      marker.remove();
      map.remove();
    };
  }, [airport, runwayData, navaidData]);

  return <div ref={containerRef} className="airport-map" role="img" aria-label={`${t.airport.map}: ${airport.name}`} />;
}
