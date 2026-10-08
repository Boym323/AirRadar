"use client";

import Link from "next/link";
import { formatTime, t } from "@/lib/i18n";
import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";
import { pageExtrasCopy } from "@/lib/i18n/page-extras";
import { eventReplayQuery } from "@/lib/intelligence/event-replay";

const eventTypes: FlightEventType[] = ["APPROACH", "LANDING", "TAKEOFF", "GO_AROUND", "HOLDING", "DIVERSION", "UNUSUAL_TURN", "ORBIT", "TOP_OF_DESCENT", "AIRSPACE_ENTRY", "AIRSPACE_EXIT"];

export function IntelligencePageContent({ events }: { events: FlightIntelligenceEvent[] }) {
  const routeCopy = pageExtrasCopy(t.locale).intelligence;
  const counts = new Map(eventTypes.map((type) => [type, events.filter((event) => event.type === type).length]));
  const evidenceTypes = t.intelligence.evidenceTypes as Record<string, string>;
  return <main className="secondary-page intelligence-page">
    <header className="intelligence-header">
      <div>
        <p className="eyebrow">{routeCopy.kicker}</p>
        <h1>{t.intelligence.title}</h1>
        <p>{t.intelligence.description}</p>
      </div>
      <div className="intelligence-header-meta"><Link href="/intelligence/analytics">{routeCopy.analytics}</Link><strong>{events.length}</strong><span>{t.intelligence.recentEvents}</span></div>
    </header>
    <div className="intelligence-note">{t.intelligence.disclaimer}</div>
    <section className="intelligence-summary" aria-label={t.intelligence.summary}>
      <div><strong>{events.length}</strong><span>{t.intelligence.recentEvents}</span></div>
      {eventTypes.filter((type) => counts.get(type)).map((type) => <div key={type}><strong>{counts.get(type)}</strong><span>{t.intelligence.types[type]}</span></div>)}
    </section>
    <section className="intelligence-list" aria-label={t.intelligence.title}>
      {events.length ? events.map((event) => <article className={`intelligence-card intelligence-card-${event.type.toLowerCase()}`} key={event.eventKey}>
        <div className="intelligence-card-heading">
          <div><span className="intelligence-time"><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></span><h2>{t.intelligence.types[event.type]}</h2></div>
          <span className={`intelligence-confidence ${event.confidenceLevel}`}>{t.intelligence.confidence[event.confidenceLevel]}</span>
        </div>
        <div className="intelligence-aircraft"><Link href={`/aircraft/${event.icaoHex}`}>{event.callsign || event.registration || event.icaoHex}</Link><span>{event.icaoHex}</span></div>
        <div className="intelligence-location">{event.airportIcao ?? event.sectorId ?? t.intelligence.noLocation}</div>
        <div className="intelligence-evidence"><strong>{t.intelligence.evidence}</strong><ul>{event.evidence.slice(0, 4).map((item) => <li key={item}>{evidenceTypes[item] ?? item}</li>)}</ul></div>
        {eventReplayQuery(event) ? <div className="intelligence-replay" data-testid="event-replay-action"><Link href={{ pathname: "/time-machine", query: eventReplayQuery(event)! }}>{t.intelligence.replayEvent}</Link><span>{t.intelligence.replayWindow}</span></div> : null}
      </article>) : <div className="intelligence-empty"><strong>{t.intelligence.empty}</strong><span>{t.intelligence.emptyHint}</span></div>}
    </section>
  </main>;
}
