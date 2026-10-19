import type { Marker } from "maplibre-gl";
import type { AircraftLabelCollisionHandle } from "@/lib/radar/aircraft-label-controller";

/** Controller-local DOM handles for the optional OGN overlay. */
export interface OgnMarkerHandle extends AircraftLabelCollisionHandle {
  marker: Marker;
  root: HTMLElement;
  icon: HTMLElement;
  rotator: HTMLElement;
  labelPrimary: HTMLElement;
  labelSecondary: HTMLElement;
  label: HTMLElement;
  labelText: string | null;
  labelPriority: "selected" | "normal" | "stale";
  labelWidth: number | null;
  labelHeight: number | null;
}

/** No DOM writes are performed for a repeated label, even during live refresh. */
export function setOgnDomLabel(handle: OgnMarkerHandle, value: string | null): boolean {
  if (handle.labelText === value) return false;
  handle.labelText = value;
  const [primary = "", secondary = ""] = value?.split("\n", 2) ?? [];
  handle.labelPrimary.textContent = primary;
  handle.labelSecondary.textContent = secondary;
  handle.labelSecondary.hidden = !secondary;
  handle.label.dataset.contentEmpty = value ? "false" : "true";
  handle.labelWidth = null;
  handle.labelHeight = null;
  return true;
}
