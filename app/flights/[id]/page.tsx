import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlightDetailPage } from "@/components/flight-detail";
import { getHistoryFlight, HistoryDatabaseUnavailableError } from "@/lib/server/history";
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

export default async function FlightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseFlightId(rawId);
  if (id === null) notFound();

  try {
    const detail = await getHistoryFlight(id);
    if (!detail) notFound();
    return <FlightDetailPage detail={detail} />;
  } catch (error) {
    if (!(error instanceof HistoryDatabaseUnavailableError)) throw error;
    return (
      <main className="flight-page">
        <header className="flight-page-header">
          <div>
            <Link className="back-link" href="/history">{t.history.backToRadar}</Link>
            <div className="aircraft-page-kicker">{t.history.flightDetails}</div>
            <h1>{t.history.databaseUnavailable}</h1>
          </div>
        </header>
      </main>
    );
  }
}
