"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  historyWindow,
  SECTOR_HISTORY_BUCKET,
  type SectorHistoryMetric,
  type SectorHistoryRange,
  type SectorTrafficHistoryBatch,
} from "@/lib/atc-sector-history";
import { t } from "@/lib/i18n";

function HistoryChart({ sectors, metric }: { sectors: SectorTrafficHistoryBatch["sectors"]; metric: SectorHistoryMetric }) {
  const width = 640;
  const height = 180;
  const values = sectors.flatMap((sector) => sector.points.map((point) => point[metric])).filter((value): value is number => value !== null);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const x = (index: number, count: number) => count <= 1 ? 0 : (index / (count - 1)) * width;
  const y = (value: number) => height - ((value - min) / (max - min || 1)) * (height - 12);

  return <svg className="atc-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.atc.historyChart}>
    {sectors.map((sector, sectorIndex) => {
      const segments: string[] = [];
      let current = "";
      sector.points.forEach((point, index) => {
        const value = point[metric];
        if (value === null) {
          if (current) segments.push(current);
          current = "";
        } else {
          current += `${current ? "L" : "M"}${x(index, sector.points.length)} ${y(value)} `;
        }
      });
      if (current) segments.push(current);
      return <g key={sector.sectorId} className={`atc-history-series atc-history-series-${sectorIndex}`}>
        {segments.map((path, i) => <path key={i} d={path} fill="none" stroke="currentColor" />)}
      </g>;
    })}
  </svg>;
}

function TrafficHistory({ sectorId }: { sectorId: string }) {
  const searchParams = useSearchParams();
  const mapAt = searchParams.get("at");
  const effectiveAt = useMemo(() => {
    const parsed = mapAt ? new Date(mapAt) : new Date();
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }, [mapAt]);
  const [range, setRange] = useState<SectorHistoryRange>("24h");
  const [metric, setMetric] = useState<SectorHistoryMetric>("aircraftCount");
  const [state, setState] = useState<"idle" | "loading" | "data" | "empty" | "error">("idle");
  const [data, setData] = useState<SectorTrafficHistoryBatch | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = historyWindow(range, effectiveAt);
    const query = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: SECTOR_HISTORY_BUCKET[range],
    });
    setState("loading");
    void fetch(`/api/atc/sectors/${encodeURIComponent(sectorId)}/history?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("ATC history unavailable");
      const payload = await response.json() as SectorTrafficHistoryBatch["sectors"][number];
      const normalized = { ...payload, sectors: [payload] } as SectorTrafficHistoryBatch;
      if (controller.signal.aborted) return;
      setData(normalized);
      setState(payload.points.length ? "data" : "empty");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
        setState("error");
      }
    });
    return () => controller.abort();
  }, [effectiveAt, range, sectorId]);

  const first = data?.sectors[0];
  const coverage = (data as (SectorTrafficHistoryBatch & { coverage?: { complete: boolean } }) | null)?.coverage;
  return <details className="atc-history" open>
    <summary>{t.atc.trafficHistory}</summary>
    <div className="atc-history-controls">
      <span>{(["1h", "6h", "24h", "7d"] as SectorHistoryRange[]).map((value) =>
        <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value}</button>)}</span>
      <label>{t.atc.metric} <select value={metric} onChange={(event) => setMetric(event.target.value as SectorHistoryMetric)}>
        <option value="aircraftCount">{t.atc.aircraft}</option>
        <option value="entering">{t.atc.entries}</option>
        <option value="leaving">{t.atc.exits}</option>
        <option value="averageAltitude">{t.atc.averageAltitude}</option>
        <option value="averageGroundSpeed">{t.atc.averageSpeed}</option>
      </select></label>
    </div>
    {state === "loading" && <small>{t.atc.loadingHistory}</small>}
    {state === "error" && <small>{t.atc.historyUnavailable}</small>}
    {state === "empty" && <small>{t.atc.noRetainedObservations}</small>}
    {coverage && !coverage.complete && <p role="status">{t.atc.incompleteHistory}</p>}
    {data && state === "data" && <>
      <HistoryChart sectors={data.sectors} metric={metric} />
      <div className="atc-history-summary">
        {first && <>
          <span><b>{t.atc.peak}</b> {first.peakAircraftCount} · {first.peakAircraftAt ? new Date(first.peakAircraftAt).toISOString() : t.layers.atcTrafficNoData}</span>
          <span><b>{t.atc.average}</b> {first.averageAircraftCount}</span>
          <span><b>{t.atc.entries}</b> {first.totalEntries}</span>
          <span><b>{t.atc.exits}</b> {first.totalExits}</span>
        </>}
      </div>
    </>}
    <small>{t.atc.historyDisclaimer}</small>
  </details>;
}

export function SectorTrafficHistoryPanel({ sectorId }: { sectorId: string }) {
  return <TrafficHistory sectorId={sectorId} />;
}
