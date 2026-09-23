export type AircraftLabelPlacement = "top" | "right" | "bottom" | "left";
export type AircraftLabelPriority =
  | "selected"
  | "emergency"
  | "watchlisted"
  | "hovered"
  | "normal"
  | "selectedRouteAirport"
  | "importantAirport"
  | "regularAirport";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AircraftLabelCandidate {
  placement: AircraftLabelPlacement;
  rect: ScreenRect;
}

export interface AircraftLabelCollisionItem {
  id: string;
  point: ScreenPoint;
  width: number;
  height: number;
  priority: AircraftLabelPriority;
  forceVisible?: boolean;
  placements?: readonly AircraftLabelPlacement[];
}

export interface LabelCollisionResult {
  placements: Map<string, AircraftLabelPlacement>;
  hidden: Set<string>;
  candidates: Map<string, AircraftLabelCandidate[]>;
}

const PRIORITY_ORDER: Record<AircraftLabelPriority, number> = {
  selected: 0,
  emergency: 1,
  watchlisted: 2,
  hovered: 3,
  normal: 4,
  selectedRouteAirport: 5,
  importantAirport: 6,
  regularAirport: 7,
};

const DEFAULT_PLACEMENTS: Record<AircraftLabelPriority, readonly AircraftLabelPlacement[]> = {
  selected: ["right", "left", "top", "bottom"],
  emergency: ["right", "left", "top", "bottom"],
  watchlisted: ["right", "left", "top", "bottom"],
  hovered: ["right", "left", "top", "bottom"],
  normal: ["bottom", "right", "left", "top"],
  selectedRouteAirport: ["bottom", "top", "right", "left"],
  importantAirport: ["bottom", "top", "right", "left"],
  regularAirport: ["bottom", "top", "right", "left"],
};

const COLLISION_GRID_SIZE = 96;

function collisionGridCells(rect: ScreenRect, gap = 0): Array<[number, number]> {
  const minX = Math.floor((rect.x - gap) / COLLISION_GRID_SIZE);
  const maxX = Math.floor((rect.x + rect.width + gap) / COLLISION_GRID_SIZE);
  const minY = Math.floor((rect.y - gap) / COLLISION_GRID_SIZE);
  const maxY = Math.floor((rect.y + rect.height + gap) / COLLISION_GRID_SIZE);
  const cells: Array<[number, number]> = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) cells.push([x, y]);
  }
  return cells;
}

function collisionGridKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function addCollisionRect(grid: Map<string, ScreenRect[]>, rect: ScreenRect): void {
  for (const [x, y] of collisionGridCells(rect)) {
    const key = collisionGridKey(x, y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(rect);
    else grid.set(key, [rect]);
  }
}

function collisionGridIntersects(grid: ReadonlyMap<string, readonly ScreenRect[]>, rect: ScreenRect, gap: number): boolean {
  for (const [x, y] of collisionGridCells(rect, gap)) {
    const bucket = grid.get(collisionGridKey(x, y));
    if (!bucket) continue;
    for (const placed of bucket) {
      if (screenRectsIntersect(rect, placed, gap)) return true;
    }
  }
  return false;
}

export function aircraftLabelPriorityRank(priority: AircraftLabelPriority): number {
  return PRIORITY_ORDER[priority];
}

export function aircraftLabelPlacements(priority: AircraftLabelPriority): readonly AircraftLabelPlacement[] {
  return DEFAULT_PLACEMENTS[priority];
}

export function aircraftLabelPriorityForState(state: { selected: boolean; emergency: boolean; watchlisted: boolean; hovered?: boolean }): AircraftLabelPriority {
  if (state.selected) return "selected";
  if (state.emergency) return "emergency";
  if (state.watchlisted) return "watchlisted";
  if (state.hovered) return "hovered";
  return "normal";
}

export function screenRectsIntersect(left: ScreenRect, right: ScreenRect, gap = 0): boolean {
  return left.x - gap < right.x + right.width
    && left.x + left.width + gap > right.x
    && left.y - gap < right.y + right.height
    && left.y + left.height + gap > right.y;
}

export function labelCandidate(point: ScreenPoint, width: number, height: number, placement: AircraftLabelPlacement, gap = 4): AircraftLabelCandidate {
  const halfMarker = 21;
  switch (placement) {
    case "top":
      return { placement, rect: { x: point.x - width / 2, y: point.y - halfMarker - gap - height, width, height } };
    case "right":
      return { placement, rect: { x: point.x + halfMarker + gap, y: point.y - height / 2, width, height } };
    case "left":
      return { placement, rect: { x: point.x - halfMarker - gap - width, y: point.y - height / 2, width, height } };
    case "bottom":
      return { placement, rect: { x: point.x - width / 2, y: point.y + halfMarker + gap, width, height } };
  }
}

export function layoutAircraftLabels(
  items: readonly AircraftLabelCollisionItem[],
  occupied: readonly ScreenRect[] = [],
): LabelCollisionResult {
  const ordered = [...items].sort((left, right) => {
    const priority = aircraftLabelPriorityRank(left.priority) - aircraftLabelPriorityRank(right.priority);
    return priority || left.id.localeCompare(right.id);
  });
  const placements = new Map<string, AircraftLabelPlacement>();
  const hidden = new Set<string>();
  const candidates = new Map<string, AircraftLabelCandidate[]>();
  const collisionGrid = new Map<string, ScreenRect[]>();
  for (const rect of occupied) addCollisionRect(collisionGrid, rect);

  for (const item of ordered) {
    const itemCandidates = (item.placements ?? aircraftLabelPlacements(item.priority))
      .map((placement) => labelCandidate(item.point, item.width, item.height, placement));
    candidates.set(item.id, itemCandidates);
    const selected = itemCandidates.find((candidate) => !collisionGridIntersects(collisionGrid, candidate.rect, 2));
    if (selected) {
      placements.set(item.id, selected.placement);
      addCollisionRect(collisionGrid, selected.rect);
      continue;
    }
    if (item.forceVisible || item.priority === "selected" || item.priority === "emergency") {
      const fallback = itemCandidates[0];
      if (fallback) {
        placements.set(item.id, fallback.placement);
        addCollisionRect(collisionGrid, fallback.rect);
      }
    } else {
      hidden.add(item.id);
    }
  }

  return { placements, hidden, candidates };
}

export interface LabelCollisionScheduler {
  schedule(): void;
  dispose(): void;
}

/** Schedules layout work independently from the 60 FPS aircraft motion loop. */
export function createLabelCollisionScheduler(run: () => void, delayMs = 120): LabelCollisionScheduler {
  let timer: number | null = null;
  return {
    schedule() {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    dispose() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    },
  };
}
