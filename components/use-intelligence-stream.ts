"use client";
import { useEffect, useState } from "react";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";

function mergeEvents(
  current: FlightIntelligenceEvent[],
  incoming: FlightIntelligenceEvent[],
): FlightIntelligenceEvent[] {
  const byKey = new Map<string, FlightIntelligenceEvent>();
  for (const event of current) byKey.set(event.eventKey, event);
  for (const event of incoming) byKey.set(event.eventKey, event);
  return [...byKey.values()]
    .sort((left, right) =>
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || Date.parse(right.detectedAt) - Date.parse(left.detectedAt)
      || right.eventKey.localeCompare(left.eventKey))
    .slice(0, 12);
}

export function useIntelligenceStream(enabled = true): FlightIntelligenceEvent[] {
  const [events, setEvents] = useState<FlightIntelligenceEvent[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;

    const source = new EventSource("/api/intelligence/stream");
    const onEvent = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as FlightIntelligenceEvent;
        setEvents((current) => mergeEvents(current, [next]));
      } catch {}
    };
    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as FlightIntelligenceEvent[];
        if (Array.isArray(next)) setEvents((current) => mergeEvents(current, next));
      } catch {}
    };
    source.addEventListener("intelligence", onEvent);
    source.addEventListener("intelligence-snapshot", onSnapshot);

    void fetch("/api/intelligence/events?limit=12", { signal: controller.signal })
      .then((response) => response.json())
      .then((value: { events?: FlightIntelligenceEvent[] }) => {
        if (active && Array.isArray(value.events)) setEvents((current) => mergeEvents(current, value.events!));
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
      source.removeEventListener("intelligence", onEvent);
      source.removeEventListener("intelligence-snapshot", onSnapshot);
      source.close();
    };
  }, [enabled]);
  return events;
}
