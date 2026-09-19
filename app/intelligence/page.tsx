import Link from "next/link";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { formatTime, t } from "@/lib/i18n";
import type { FlightEventType } from "@/lib/intelligence/types";

const eventTypes: FlightEventType[] = ["APPROACH", "LANDING", "TAKEOFF", "GO_AROUND", "HOLDING", "AIRSPACE_ENTRY", "AIRSPACE_EXIT"];

export const dynamic = "force-dynamic";
export default async function IntelligencePage() {
  const events = await getFlightIntelligenceService().query({ limit: 50 });
  const counts = new Map(eventTypes.map((type) => [type, events.filter((event) => event.type === type).length]));
  return <AirRadarPageShell><main className="secondary-page intelligence-page">
    <header className="intelligence-header">
      <div>
        <p className="eyebrow">LIVE INTELLIGENCE</p>
        <h1>{t.intelligence.title}</h1>
        <p>{t.intelligence.description}</p>
      </div>
      <div className="intelligence-header-meta"><strong>{events.length}</strong><span>{t.intelligence.recentEvents}</span></div>
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
        <div className="intelligence-evidence"><strong>{t.intelligence.evidence}</strong><ul>{event.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div>
      </article>) : <div className="intelligence-empty"><strong>{t.intelligence.empty}</strong><span>{t.intelligence.emptyHint}</span></div>}
    </section>
  </main></AirRadarPageShell>;
}
