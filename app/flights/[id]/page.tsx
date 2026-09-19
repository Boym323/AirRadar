import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlightDetailPage } from "@/components/flight-detail";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { getFlightStory, HistoryDatabaseUnavailableError } from "@/lib/server/flight-story";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function parseFlightId(value: string): number | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!/^[1-9]\d*$/.test(decoded)) return null;
  const id = Number(decoded);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${t.history.flightDetails} — AirRadar` };
}

export default async function FlightPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const { id: rawId } = await params;
  const id = parseFlightId(rawId);
  if (id === null) notFound();

  try {
    // Compatibility note: the legacy implementation was getHistoryFlight(id);
    // getFlightStory is now the read-only Flight Story boundary.
    const detail = await getFlightStory(id);
    if (!detail) notFound();
    const requestedAt = (await searchParams).at;
    const parsedAt = requestedAt ? Date.parse(requestedAt) : Number.NaN;
    const first = detail.positions[0] ? Date.parse(detail.positions[0].recordedAt) : Date.parse(detail.flight.startTime);
    const last = detail.positions.at(-1) ? Date.parse(detail.positions.at(-1)!.recordedAt) : Date.parse(detail.flight.endTime ?? detail.flight.lastSeenAt);
    const initialAt = Number.isFinite(parsedAt) && Number.isFinite(first) && Number.isFinite(last) ? Math.max(first, Math.min(last, parsedAt)) : null;
    return <AirRadarPageShell><FlightDetailPage detail={detail} initialAt={initialAt} /></AirRadarPageShell>;
  } catch (error) {
    if (!(error instanceof HistoryDatabaseUnavailableError)) throw error;
    return <AirRadarPageShell><main className="flight-page">
      <header className="flight-page-header">
        <div>
          <Link className="back-link" href="/history">{t.history.backToRadar}</Link>
          <div className="aircraft-page-kicker">{t.history.flightDetails}</div>
          <h1>{t.history.databaseUnavailable}</h1>
        </div>
      </header>
    </main></AirRadarPageShell>;
  }
}
