import fs from "node:fs";
import path from "node:path";
import { validateCzAtsRouteDocument, type CzAtsRouteDocument } from "./cz-routes";

const DEFAULT_PATH = path.join(process.cwd(), "data/ats/generated/sk-routes.json");
let cached: { file: string; mtimeMs: number; document: CzAtsRouteDocument } | null = null;
export function getSkAtsRoutesPath(): string { return process.env.ATS_SK_ROUTES_PATH?.trim() || DEFAULT_PATH; }
export function clearSkAtsRouteCache(): void { cached = null; }
export function loadSkAtsRoutes(): CzAtsRouteDocument | null {
  const file = getSkAtsRoutesPath();
  try {
    const stat = fs.statSync(/*turbopackIgnore: true*/ file);
    if (cached?.file === file && cached.mtimeMs === stat.mtimeMs) return cached.document;
    const document = validateCzAtsRouteDocument(JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as unknown);
    cached = { file, mtimeMs: stat.mtimeMs, document };
    return document;
  } catch { cached = null; return null; }
}
