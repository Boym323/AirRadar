import * as maplibregl from "maplibre-gl";

export const MAPLIBRE_WORKER_URL = "/maplibre-gl-worker.mjs";

let configured = false;

/** Configure MapLibre for Next.js bundles where import.meta.url is not a browser URL. */
export function configureMapLibreWorker(): void {
  if (configured) return;
  maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
  configured = true;
}
