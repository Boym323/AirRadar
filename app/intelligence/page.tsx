import Link from "next/link";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { getFlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { formatTime, t } from "@/lib/i18n";
import type { FlightEventType } from "@/lib/intelligence/types";
export const dynamic = "force-dynamic";
export default async function IntelligencePage() {
  const events = await getFlightIntelligenceService().query({ limit: 50 });
  return <AirRadarPageShell><main className="secondary-page"><div className="page-heading"><div><p className="eyebrow">LIVE INTELLIGENCE</p><h1>{t.intelligence.title}</h1><p>{t.intelligence.description}</p></div></div><section className="card-list" aria-label={t.intelligence.title}>{events.length ? events.map((event) => <article className="card" key={event.eventKey}><div className="card-row"><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time><strong>{t.intelligence.types[event.type as FlightEventType]}</strong><span>{event.callsign || event.registration || event.icaoHex}</span></div><div className="muted">{event.airportIcao ?? event.sectorId ?? "—"} · {event.confidenceLevel}</div><ul>{event.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul><Link href={`/aircraft/${event.icaoHex}`}>{event.icaoHex}</Link></article>) : <p>{t.intelligence.empty}</p>}</section></main></AirRadarPageShell>;
}
