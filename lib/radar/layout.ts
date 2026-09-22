export interface RadarLayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface RadarMapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RadarLayoutOcclusions {
  mapRect: RadarLayoutRect;
  drawerRect?: RadarLayoutRect | null;
  bottomNavRect?: RadarLayoutRect | null;
  mobile: boolean;
}

const CAMERA_GAP_PX = 20;
const CONTROL_GAP_PX = 10;

function overlapsHorizontally(a: RadarLayoutRect, b: RadarLayoutRect): boolean {
  return a.left < b.right && a.right > b.left;
}

function overlapsVertically(a: RadarLayoutRect, b: RadarLayoutRect): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}

function bottomOcclusion(mapRect: RadarLayoutRect, rect: RadarLayoutRect | null | undefined): number {
  if (!rect || !overlapsHorizontally(mapRect, rect) || rect.top >= mapRect.bottom) return 0;
  return Math.max(0, mapRect.bottom - Math.max(mapRect.top, rect.top));
}

export function radarCameraPadding(
  layout: RadarLayoutOcclusions,
  base: RadarMapPadding = { top: 70, right: 40, bottom: 40, left: 40 },
): RadarMapPadding {
  const padding = { ...base };

  if (layout.mobile) {
    const bottom = Math.max(
      bottomOcclusion(layout.mapRect, layout.drawerRect),
      bottomOcclusion(layout.mapRect, layout.bottomNavRect),
    );
    if (bottom > 0) padding.bottom = Math.max(padding.bottom, Math.ceil(bottom + CAMERA_GAP_PX));
    return padding;
  }

  const drawer = layout.drawerRect;
  if (drawer && overlapsVertically(layout.mapRect, drawer) && drawer.left < layout.mapRect.right) {
    const right = Math.max(0, layout.mapRect.right - Math.max(layout.mapRect.left, drawer.left));
    padding.right = Math.max(padding.right, Math.ceil(right + CAMERA_GAP_PX));
  }

  return padding;
}

export function radarBottomControlOffset(layout: RadarLayoutOcclusions): number {
  if (!layout.mobile) return CONTROL_GAP_PX;
  const bottom = Math.max(
    bottomOcclusion(layout.mapRect, layout.drawerRect),
    bottomOcclusion(layout.mapRect, layout.bottomNavRect),
  );
  return Math.ceil(Math.max(CONTROL_GAP_PX, bottom + CONTROL_GAP_PX));
}
