"use client";
import Link from "next/link";
import { formatTime, t } from "@/lib/i18n";
import type { FlightEventType } from "@/lib/intelligence/types";
import { useIntelligenceStream } from "@/components/use-intelligence-stream";
export function IntelligenceFeed() { const events = useIntelligenceStream(); return <section className="intelligence-feed" aria-labelledby="intelligence-feed-title"><div className="section-heading"><h2 id="intelligence-feed-title">{t.intelligence.title}</h2><Link href="/intelligence">{t.common.more}</Link></div>{events.length === 0 ? <p className="muted">{t.intelligence.empty}</p> : <div>{events.slice(0, 6).map((event) => <Link className="intelligence-feed-item" href={`/aircraft/${event.icaoHex}`} key={event.eventKey}><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time><span><strong>{event.callsign || event.registration || event.icaoHex}</strong><small>{t.intelligence.types[event.type as FlightEventType]} · {event.airportIcao ?? event.sectorId ?? "—"}</small></span></Link>)}</div>}</section>; }
