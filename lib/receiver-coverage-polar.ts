export type PolarCellState = "NO_DATA" | "INSUFFICIENT" | "SUFFICIENT";

export function polarPoint(radius: number, bearingDeg: number, center: number): { x: number; y: number } {
  const angle = (bearingDeg - 90) * Math.PI / 180;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export function annularSectorPath(innerRadius: number, outerRadius: number, startDeg: number, endDeg: number, center: number): string {
  const outerStart = polarPoint(outerRadius, startDeg, center);
  const outerEnd = polarPoint(outerRadius, endDeg, center);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  if (innerRadius <= 0) return `M ${center} ${center} L ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} Z`;
  const innerEnd = polarPoint(innerRadius, endDeg, center);
  const innerStart = polarPoint(innerRadius, startDeg, center);
  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

export function coverageCellState(available: number, threshold: number): PolarCellState {
  if (available <= 0) return "NO_DATA";
  return available < threshold ? "INSUFFICIENT" : "SUFFICIENT";
}

export function coverageRatio(captured: number, available: number): number | null {
  return available > 0 && captured >= 0 ? Math.min(100, captured / available * 100) : null;
}
