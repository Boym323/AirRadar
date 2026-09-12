import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(root, "node_modules/maplibre-gl/dist");
const publicDirectory = resolve(root, "public");

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  copyFile(resolve(sourceDirectory, "maplibre-gl-worker.mjs"), resolve(publicDirectory, "maplibre-gl-worker.mjs")),
  copyFile(resolve(sourceDirectory, "maplibre-gl-shared.mjs"), resolve(publicDirectory, "maplibre-gl-shared.mjs")),
]);

console.log("[maplibre-worker] synchronized worker and shared runtime assets");
