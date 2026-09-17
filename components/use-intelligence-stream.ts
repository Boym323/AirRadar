"use client";
import { useEffect, useState } from "react";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
export function useIntelligenceStream(): FlightIntelligenceEvent[] {
  const [events, setEvents] = useState<FlightIntelligenceEvent[]>([]);
  useEffect(() => { let active = true; void fetch("/api/intelligence/events?limit=12").then((response) => response.json()).then((value: { events?: FlightIntelligenceEvent[] }) => { if (active && Array.isArray(value.events)) setEvents(value.events); }).catch(() => undefined); const source = new EventSource("/api/intelligence/stream"); const onEvent = (event: MessageEvent<string>) => { try { const next = JSON.parse(event.data) as FlightIntelligenceEvent; setEvents((current) => [next, ...current.filter((item) => item.eventKey !== next.eventKey)].slice(0, 12)); } catch {} }; source.addEventListener("intelligence", onEvent); return () => { active = false; source.close(); }; }, []);
  return events;
}
