import * as maplibregl from "maplibre-gl";
import type { AircraftView } from "@/lib/aircraft/types";
import { classifyAircraftIcon, type AircraftPresentationKind } from "@/lib/aircraft/icon-classification";
import { TAR1090_UNKNOWN_ICON_ASSET } from "@/lib/aircraft/tar1090-icon-map";
import { aircraftIconRotationOffset } from "@/lib/aircraft/icon-orientation";
import { resolveAircraftVisualHeading } from "@/lib/aircraft/visual-heading";
import { aircraftColor, type AircraftColorMode } from "@/lib/aircraft/color-mode";
import { aircraftMapLabel } from "@/lib/aircraft/map-labels";
import { formatAltitude } from "@/lib/i18n";
import { classifyAircraftSource } from "@/lib/aircraft/source-awareness";
import { aircraftMarkerClassNames } from "@/lib/radar-ui";
import { aircraftLabelPriorityForState, type AircraftLabelPriority } from "@/lib/radar/aircraft-label-collision";

export type AircraftMarkerKind = AircraftPresentationKind;
export type AircraftMarkerInput = Pick<AircraftView, "aircraftType" | "aircraftDescription" | "enrichment" | "category" | "onGround">;

export interface AircraftMarkerHandle {
  marker: maplibregl.Marker;
  root: HTMLElement;
  rotator: HTMLElement;
  plane: HTMLElement;
  label: HTMLElement;
  labelText: string | null;
  baseLabelText: string | null;
  identityLabel: string;
  labelPriority: AircraftLabelPriority;
  selected: boolean;
  watchlisted: boolean;
  emergency: boolean;
  hovered: boolean;
  labelWidth: number | null;
  labelHeight: number | null;
  geographicHeading: number | null;
  assetOffset: number;
}

export interface AircraftMarkerUpdateOptions {
  selected: boolean;
  watchlisted: boolean;
  emergency: boolean;
  showAircraft: boolean;
  zoom: number;
  colorMode: AircraftColorMode;
  mapBearing: number;
  heading: number | null;
}

const AIRCRAFT_GLYPH_PATHS: Record<AircraftMarkerKind, string> = {
  airplane: "m16 2 4 12 8 5-1 2-9-2-2 10-2-10-9 2-1-2 8-5 4-12Z",
  a220: "m16 2 3 12 8 5-1 2-9-2-1 11h-2l-1-11-9 2-1-2 8-5 3-12Z",
  a320: "m16 2 3 12 9 5-1 2-10-2-1 11-2 0-1-11-10 2-1-2 9-5 3-12ZM10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a330: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a350: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM11 16l-3 1m13-1 3 1M10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  a380: "m16 1 5 12 10 5-1 3-11-2-1 12h-2l-1-12-11 2-1-3 10-5 5-12ZM9 15a1 1 0 1 0 2 0m3 0a1 1 0 1 0 2 0m4 0a1 1 0 1 0 2 0m3 0a1 1 0 1 0 2 0M14 6h4",
  b717: "m16 3 2 12 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-12Z",
  b727: "m16 2 3 12 9 5-1 2-10-2-1 11h-2l-1-11-10 2-1-2 9-5 3-12ZM13 24l-3 2m9-2 3 2",
  b737: "m16 2 3 12 9 5-1 2-10-2-1 11h-2l-1-11-10 2-1-2 9-5 3-12ZM11 16l-2 1m12-1 2 1M12 15a1 1 0 1 0 2 0m6 0a1 1 0 1 0 2 0",
  b747: "m16 2 5 11 9 5-1 3-11-2-1 11h-2l-1-11-11 2-1-3 9-5 5-11ZM14 7h4M10 15a1 1 0 1 0 2 0m8 0a1 1 0 1 0 2 0",
  b757: "m16 2 3 12 10 5-1 2-11-2-1 11h-2l-1-11-11 2-1-2 10-5 3-12Z",
  b767: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM10 17l-2 1m14-1 2 1",
  b777: "m16 2 4 11 10 5-1 3-11-2-1 11h-2l-1-11-11 2-1-3 10-5 4-11Z",
  b787: "m16 2 4 11 9 5-1 3-10-2-1 11h-2l-1-11-10 2-1-3 9-5 4-11ZM11 17l-3 1m13-1 3 1",
  regional: "m16 3 2 12 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-12Z",
  turboprop: "m16 4 2 11 8 4-1 2-9-2-1 9h-1l-1-9-9 2-1-2 8-4 2-11ZM8 13H4m4 3H4m20-3h4m-4 3h4",
  "business-jet": "m16 2 2 13 8 5-1 2-9-3-1 9h-1l-1-9-9 3-1-2 8-5 2-13Z",
  "general-aviation": "m16 3 1 13 9 4-1 2-10-2-1 8h-1l-1-8-10 2-1-2 9-4 1-13Z",
  helicopter: "M16 8v15M9 12h14M6 8h20M16 5v3M12 23h8l3 4H9l3-4Z",
  glider: "m16 3 3 12 10 5-1 2-10-2-2 9-2-9-10 2-1-2 10-5 3-12Z",
  drone: "M16 8v16M8 16h16M10 10h4v4h-4zM18 10h4v4h-4zM10 18h4v4h-4zM18 18h4v4h-4z",
  ground: "M10 11h12l3 8v5H7v-5l3-8Zm1 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
};

export function aircraftIconAsset(aircraft: AircraftMarkerInput): string {
  return classifyAircraftIcon(aircraft).asset ?? TAR1090_UNKNOWN_ICON_ASSET;
}

export function aircraftMarkerKind(aircraft: AircraftMarkerInput): AircraftMarkerKind {
  return classifyAircraftIcon(aircraft).presentationKind;
}

export function aircraftGlyphPath(kind: AircraftMarkerKind): string {
  return AIRCRAFT_GLYPH_PATHS[kind];
}

export function aircraftLabelFor(aircraft: AircraftView): string {
  return aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
}

export function aircraftGlyphMarkup(aircraft: AircraftView): string {
  const asset = aircraftIconAsset(aircraft);
  if (asset) return `<img class="aircraft-glyph aircraft-glyph-asset" src="${asset}" alt="" draggable="false" />`;
  const kind = aircraftMarkerKind(aircraft);
  return `<svg class="aircraft-glyph aircraft-glyph-${kind}" viewBox="0 0 32 32" aria-hidden="true"><path d="${AIRCRAFT_GLYPH_PATHS[kind]}"></path></svg>`;
}

function setClassName(element: HTMLElement, value: string): void {
  if (element.className !== value) element.className = value;
}

export function createAircraftMarkerHandle(
  map: maplibregl.Map,
  aircraft: AircraftView,
  position: [number, number],
  onSelect: (hex: string) => void,
  onInteractionChange?: () => void,
): AircraftMarkerHandle {
  const root = document.createElement("div");
  setClassName(root, "aircraft-marker");
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "0");
  root.setAttribute("aria-hidden", "false");
  const rotator = document.createElement("div");
  rotator.className = "aircraft-plane-rotator";
  const plane = document.createElement("div");
  plane.className = "aircraft-plane";
  const label = document.createElement("div");
  label.className = "aircraft-label";
  label.setAttribute("aria-hidden", "true");
  label.dataset.placement = "bottom";
  label.dataset.collisionHidden = "false";
  root.append(rotator, label);
  rotator.append(plane);
  const handle: AircraftMarkerHandle = {
    marker: new maplibregl.Marker({ element: root, anchor: "center", rotationAlignment: "viewport", pitchAlignment: "viewport" })
      .setLngLat(position)
      .addTo(map),
    root,
    rotator,
    plane,
    label,
    labelText: null,
    baseLabelText: null,
    identityLabel: aircraftLabelFor(aircraft),
    labelPriority: "normal",
    selected: false,
    watchlisted: false,
    emergency: false,
    hovered: false,
    labelWidth: null,
    labelHeight: null,
    geographicHeading: null,
    assetOffset: 0,
  };
  const select = () => onSelect(aircraft.icaoHex);
  root.addEventListener("click", select);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
  const updateInteraction = (active: boolean) => {
    if (!setAircraftMarkerInteractionState(handle, active)) return;
    onInteractionChange?.();
  };
  root.addEventListener("pointerenter", () => updateInteraction(true));
  root.addEventListener("pointerleave", () => updateInteraction(false));
  root.addEventListener("focusin", () => updateInteraction(true));
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) updateInteraction(false);
  });
  return handle;
}

export function updateAircraftMarkerHandle(
  handle: AircraftMarkerHandle,
  aircraft: AircraftView,
  options: AircraftMarkerUpdateOptions,
): boolean {
  const source = classifyAircraftSource(aircraft);
  handle.selected = options.selected;
  handle.watchlisted = options.watchlisted;
  handle.emergency = options.emergency;
  handle.identityLabel = aircraftLabelFor(aircraft);
  const priority = aircraftLabelPriorityForState({ ...options, hovered: handle.hovered });
  const className = aircraftMarkerClassNames({ selected: options.selected, watchlisted: options.watchlisted, emergency: options.emergency, source }).join(" ");
  setClassName(handle.root, className);
  const labelForAria = aircraftLabelFor(aircraft);
  if (handle.root.getAttribute("aria-label") !== labelForAria) handle.root.setAttribute("aria-label", labelForAria);
  const ariaPressed = String(options.selected);
  if (handle.root.getAttribute("aria-pressed") !== ariaPressed) handle.root.setAttribute("aria-pressed", ariaPressed);
  const visibility = options.showAircraft ? "visible" : "hidden";
  if (handle.root.style.visibility !== visibility) handle.root.style.visibility = visibility;

  const markerKind = aircraftMarkerKind(aircraft);
  const iconAsset = aircraftIconAsset(aircraft);
  const iconKey = `${markerKind}|${iconAsset}`;
  if (handle.plane.dataset.iconKey !== iconKey) {
    handle.plane.dataset.iconKey = iconKey;
    handle.plane.dataset.kind = markerKind;
    handle.plane.dataset.iconAsset = iconAsset;
    handle.plane.innerHTML = aircraftGlyphMarkup(aircraft);
    handle.assetOffset = aircraftIconRotationOffset(iconAsset) + aircraftIconRotationOffset(markerKind);
  }
  const color = aircraftColor(aircraft, options.colorMode);
  if (color) handle.plane.style.setProperty("--aircraft-color", color);
  else handle.plane.style.removeProperty("--aircraft-color");

  const baseLabel = aircraftMapLabel(aircraft, options.zoom, formatAltitude(aircraft.altitude));
  handle.baseLabelText = baseLabel;
  const nextLabelText = baseLabel ?? (priority === "selected" || priority === "emergency" || priority === "watchlisted" || priority === "hovered" ? handle.identityLabel : null);
  const contentChanged = handle.labelText !== nextLabelText;
  if (contentChanged) {
    handle.labelText = nextLabelText;
    handle.label.textContent = nextLabelText ?? "";
    handle.labelWidth = null;
    handle.labelHeight = null;
  }
  handle.labelPriority = priority;
  handle.label.dataset.contentEmpty = nextLabelText ? "false" : "true";
  handle.label.dataset.priority = priority;
  setAircraftMarkerHeading(handle, options.heading, options.mapBearing);
  return contentChanged;
}

export function setAircraftMarkerInteractionState(handle: AircraftMarkerHandle, hovered: boolean): boolean {
  if (handle.hovered === hovered) return false;
  handle.hovered = hovered;
  handle.labelPriority = aircraftLabelPriorityForState({
    selected: handle.selected,
    emergency: handle.emergency,
    watchlisted: handle.watchlisted,
    hovered,
  });
  handle.label.dataset.priority = handle.labelPriority;
  const nextLabelText = handle.baseLabelText ?? (handle.labelPriority === "selected" || handle.labelPriority === "emergency" || handle.labelPriority === "watchlisted" || handle.labelPriority === "hovered" ? handle.identityLabel : null);
  if (handle.labelText === nextLabelText) return true;
  handle.labelText = nextLabelText;
  handle.label.textContent = nextLabelText ?? "";
  handle.labelWidth = null;
  handle.labelHeight = null;
  handle.label.dataset.contentEmpty = nextLabelText ? "false" : "true";
  return true;
}

export function setAircraftMarkerHeading(handle: AircraftMarkerHandle, heading: number | null, mapBearing: number): void {
  handle.geographicHeading = heading;
  const screenHeading = resolveAircraftVisualHeading({ motionHeading: heading, assetOffset: handle.assetOffset, mapBearing });
  if (screenHeading === null) return;
  const transform = `rotate(${screenHeading}deg)`;
  if (handle.rotator.style.transform !== transform) handle.rotator.style.transform = transform;
}
