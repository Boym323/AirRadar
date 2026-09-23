"use client";

import { memo, useEffect, useRef, useState, type RefObject } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import { t } from "@/lib/i18n";
import { AIRCRAFT_TRAFFIC_ROW_HEIGHT, AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD, aircraftTrafficVirtualRange } from "@/lib/radar/traffic-virtualization";
import { AircraftTrafficRow } from "@/components/aircraft-traffic-row";

interface VisibleRange {
  start: number;
  end: number;
}

interface AircraftTrafficListProps {
  aircraft: readonly AircraftView[];
  totalAircraftCount: number;
  selectedHex: string | null;
  watchlistedHexes: ReadonlySet<string>;
  onSelect: (hex: string) => void;
  scrollRootRef: RefObject<HTMLDivElement | null>;
}

function sameRange(left: VisibleRange, right: VisibleRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function recordTrafficList(totalRows: number, renderedRows: number, virtualized: boolean): void {
  if (typeof window === "undefined") return;
  window.__airradarPerformanceDiagnostics?.recordTrafficList(totalRows, renderedRows, virtualized);
}

function AircraftTrafficListComponent({
  aircraft,
  totalAircraftCount,
  selectedHex,
  watchlistedHexes,
  onSelect,
  scrollRootRef,
}: AircraftTrafficListProps) {
  const virtualized = aircraft.length >= AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD;
  const spaceRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() => ({
    start: 0,
    end: Math.min(aircraft.length, 24),
  }));

  useEffect(() => {
    if (!virtualized) {
      const record = () => recordTrafficList(aircraft.length, aircraft.length, false);
      record();
      window.addEventListener("airradar:performance-diagnostics-ready", record);
      return () => window.removeEventListener("airradar:performance-diagnostics-ready", record);
    }

    const root = scrollRootRef.current;
    const space = spaceRef.current;
    if (!root || !space) return;

    let frame: number | null = null;
    const update = () => {
      frame = null;
      const rootRect = root.getBoundingClientRect();
      const spaceRect = space.getBoundingClientRect();
      const next = aircraftTrafficVirtualRange({
        count: aircraft.length,
        rootTop: rootRect.top,
        rootBottom: rootRect.bottom,
        spaceTop: spaceRect.top,
      });
      setVisibleRange((current) => sameRange(current, next) ? current : next);
      recordTrafficList(aircraft.length, Math.max(0, next.end - next.start), true);
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(update);
    };

    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("airradar:performance-diagnostics-ready", schedule);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(root);
    resizeObserver?.observe(space);
    schedule();

    return () => {
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("airradar:performance-diagnostics-ready", schedule);
      resizeObserver?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [aircraft.length, scrollRootRef, virtualized]);

  if (aircraft.length === 0) {
    return <div id="traffic-list" className="aircraft-list">
      <div className="empty-list">
        <strong>{totalAircraftCount === 0 ? t.radar.waitingForTraffic : t.radar.noMatchingAircraft}</strong>
        {totalAircraftCount === 0 ? t.radar.waitingForTrafficDescription : t.radar.noMatchingAircraftDescription}
      </div>
    </div>;
  }

  if (!virtualized) {
    return <div id="traffic-list" className="aircraft-list">
      {aircraft.map((item) => (
        <AircraftTrafficRow
          key={item.icaoHex}
          aircraft={item}
          selected={selectedHex === item.icaoHex}
          watchlisted={watchlistedHexes.has(item.icaoHex)}
          onSelect={onSelect}
        />
      ))}
    </div>;
  }

  const visibleAircraft = aircraft.slice(visibleRange.start, visibleRange.end);
  return <div id="traffic-list" className="aircraft-list aircraft-list-virtualized" data-total-rows={aircraft.length}>
    <div ref={spaceRef} className="aircraft-list-virtual-space" style={{ height: `${aircraft.length * AIRCRAFT_TRAFFIC_ROW_HEIGHT}px` }}>
      {visibleAircraft.map((item, offset) => {
        const index = visibleRange.start + offset;
        return <div
          key={item.icaoHex}
          className="aircraft-list-virtual-row"
          style={{ transform: `translateY(${index * AIRCRAFT_TRAFFIC_ROW_HEIGHT}px)` }}
        >
          <AircraftTrafficRow
            aircraft={item}
            selected={selectedHex === item.icaoHex}
            watchlisted={watchlistedHexes.has(item.icaoHex)}
            onSelect={onSelect}
          />
        </div>;
      })}
    </div>
  </div>;
}

export const AircraftTrafficList = memo(AircraftTrafficListComponent);
AircraftTrafficList.displayName = "AircraftTrafficList";
