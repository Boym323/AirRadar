"use client";
import { ATC_SECTOR_STACKS } from "@/lib/atc-sector-stacks";

export interface SectorTrafficPanelItem { sectorId: string; name: string; vertical: { lower: string | null; upper: string | null }; traffic: { aircraftCount: number }; trafficLevel: string; }
export interface SectorFlow { fromSectorId: string; toSectorId: string; count: number; }

export function AtcVerticalTraffic({ traffic }: { traffic: Map<string, SectorTrafficPanelItem> }) {
  return <details className="map-overlay-card atc-traffic-panel"><summary>ATC Vertical Traffic</summary>{ATC_SECTOR_STACKS.map((stack) => <section key={stack.id}><strong>{stack.label}</strong>{stack.members.map((id) => { const item = traffic.get(id); return <div key={id} className="atc-stack-row"><b>{item?.name ?? id}</b><span>{item ? `${item.vertical.lower ?? "—"}–${item.vertical.upper ?? "—"}` : "NO DATA"}</span><span>{item ? `${item.traffic.aircraftCount} aircraft · ${item.trafficLevel}` : "NO DATA"}</span></div>; })}</section>)}<small>Published sector volumes only. Does not indicate official ATC sector activation.</small></details>;
}

export function SectorFlowsPanel({ flows, windowMinutes, onWindowChange }: { flows: SectorFlow[]; windowMinutes: 1 | 5 | 15; onWindowChange: (value: 1 | 5 | 15) => void }) {
  return <details className="map-overlay-card atc-traffic-panel"><summary>Sector flows · {windowMinutes}m</summary><div className="atc-flow-buttons">{([1, 5, 15] as const).map((value) => <button key={value} type="button" aria-pressed={value === windowMinutes} onClick={() => onWindowChange(value)}>{value}m</button>)}</div>{flows.length ? flows.map((flow) => <div key={`${flow.fromSectorId}-${flow.toSectorId}`} className="atc-stack-row"><b>{flow.fromSectorId.replace("LKAA", "")} → {flow.toSectorId.replace("LKAA", "")}</b><span>{flow.count}</span></div>) : <small>No sector transitions in this interval</small>}<small>Flows represent aircraft movement between published ATC sector volumes, not confirmed ATC handoffs.</small></details>;
}
