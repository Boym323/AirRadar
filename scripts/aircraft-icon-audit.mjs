#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const ICON_DIRECTORY = resolve(ROOT, "public/aircraft-icons-tar1090");
const REPORT_PATH = resolve(ROOT, "artifacts/aircraft-icon-audit.json");

function numberAttribute(source, name) {
  const match = source.match(new RegExp(`\\b${name}=["']([0-9]+(?:\\.[0-9]+)?)`));
  return match ? Number(match[1]) : null;
}

function viewBox(source) {
  const match = source.match(/\bviewBox=["']\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+([0-9]+(?:\.\d+)?)\s+([0-9]+(?:\.\d+)?)\s*["']/i);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) };
}

export function inspectAircraftIconSvg(source, file = "unknown.svg") {
  const width = numberAttribute(source, "width");
  const height = numberAttribute(source, "height");
  const box = viewBox(source);
  const sourceWidth = box?.width ?? width;
  const sourceHeight = box?.height ?? height;
  const aspectRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : null;
  const aspectSpread = aspectRatio ? Math.max(aspectRatio, 1 / aspectRatio) : null;
  return {
    file,
    code: basename(file, ".svg").toUpperCase(),
    declaredWidth: width,
    declaredHeight: height,
    viewBox: box,
    aspectRatio,
    aspectSpread,
    orientation: aspectRatio === null ? "unknown" : aspectRatio > 1.08 ? "landscape" : aspectRatio < 0.92 ? "portrait" : "square",
  };
}

export function auditAircraftIcons(directory = ICON_DIRECTORY) {
  const files = readdirSync(directory).filter((file) => file.endsWith(".svg")).sort();
  const icons = files.map((file) => inspectAircraftIconSvg(readFileSync(resolve(directory, file), "utf8"), file));
  const invalid = icons.filter((icon) => !icon.viewBox || icon.aspectRatio === null || !Number.isFinite(icon.aspectRatio));
  const aspectOutliers = icons
    .filter((icon) => icon.aspectSpread !== null && icon.aspectSpread >= 2.25)
    .sort((a, b) => (b.aspectSpread ?? 0) - (a.aspectSpread ?? 0));
  const byOrientation = {
    portrait: icons.filter((icon) => icon.orientation === "portrait").length,
    landscape: icons.filter((icon) => icon.orientation === "landscape").length,
    square: icons.filter((icon) => icon.orientation === "square").length,
    unknown: icons.filter((icon) => icon.orientation === "unknown").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    directory: "public/aircraft-icons-tar1090",
    count: icons.length,
    invalidCount: invalid.length,
    byOrientation,
    aspectOutliers: aspectOutliers.slice(0, 40),
    icons,
  };
}

function main() {
  const report = auditAircraftIcons();
  if (report.invalidCount > 0) {
    throw new Error(`${report.invalidCount} aircraft SVG icons have missing or invalid viewBox geometry`);
  }
  mkdirSync(resolve(ROOT, "artifacts"), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  const outliers = report.aspectOutliers.slice(0, 8).map((icon) => `${icon.code}=${icon.aspectSpread?.toFixed(2)}x`).join(", ");
  process.stdout.write(
    `[AirRadar icons] assets=${report.count} portrait=${report.byOrientation.portrait} landscape=${report.byOrientation.landscape} square=${report.byOrientation.square} aspectOutliers>=2.25x: ${outliers || "none"}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[AirRadar icons] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
