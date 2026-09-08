"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AircraftPhoto, AircraftPhotoApiResponse } from "@/lib/aircraft/photo";
import { aircraftAirportHref, aircraftHistoryHref, aircraftWatchlistHref } from "@/lib/aircraft/detail-links";
import type { AircraftDetailResponse, HistoryFlightSummary } from "@/lib/server/history";
import { formatAltitude, formatDateTime, formatSpeed, formatTrack, t } from "@/lib/i18n";

function valueOrEmpty(value: string | null | undefined): string {
  return value || t.common.emptyValue;
}

export { aircraftAirportHref, aircraftHistoryHref } from "@/lib/aircraft/detail-links";

function flightDuration(flight: HistoryFlightSummary): string {
  const start = Date.parse(flight.startTime);
  const end = Date.parse(flight.endTime ?? flight.lastSeenAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t.common.emptyValue;
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  return `${hours} h ${remainingMinutes} min`;
}

function AirportCodeLink({ code }: { code: string | null }): ReactNode {
  if (!code) return <span>{t.common.emptyValue}</span>;
  return <Link className="airport-link" href={aircraftAirportHref(code)}>{code}</Link>;
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="detail-item-label">{label}</div><div className="detail-item-value">{children}</div></div>;
}

export function AircraftRecentFlights({
  recentFlights,
  loading = false,
  error = null,
}: {
  recentFlights: HistoryFlightSummary[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <section className="detail-section aircraft-recent-flights" aria-labelledby="aircraft-recent-flights-title">
      <h3 id="aircraft-recent-flights-title">{t.history.recentFlights}</h3>
      {loading ? <div className="detail-disclaimer">{t.common.loading}</div> : error ? <div className="detail-disclaimer">{error}</div> : recentFlights.length === 0 ? (
        <div className="detail-disclaimer">{t.history.recentFlightsEmpty}</div>
      ) : (
        <div className="aircraft-recent-flight-list">
          {recentFlights.slice(0, 10).map((flight) => (
            <article className="aircraft-recent-flight" key={flight.id}>
              <div className="aircraft-recent-flight-heading">
                <Link className="aircraft-recent-flight-history" href={aircraftHistoryHref(flight.id)} aria-label={`${t.history.detailFlight}: ${flight.callsign || t.history.unknownCallsign}`}>
                  <strong>{flight.callsign || t.history.unknownCallsign}</strong>
                  <span>{formatDateTime(flight.startTime)}–{formatDateTime(flight.endTime ?? flight.lastSeenAt)}</span>
                </Link>
                <span className="aircraft-recent-flight-type">{flight.aircraftType || t.aircraft.unknownAircraftType}</span>
              </div>
              <div className="aircraft-recent-flight-route" aria-label={t.route.originDestination}>
                <AirportCodeLink code={flight.origin} />
                <span aria-hidden="true"> → </span>
                <AirportCodeLink code={flight.destination} />
              </div>
              <div className="aircraft-recent-flight-meta">
                <DetailValue label={t.history.duration}>{flightDuration(flight)}</DetailValue>
                <DetailValue label={t.history.maxAltitude}>{formatAltitude(flight.maxAltitude)}</DetailValue>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AircraftPhotoCard({ icaoHex, registration }: { icaoHex: string; registration: string | null | undefined }) {
  const [result, setResult] = useState<AircraftPhotoApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const lookupHex = icaoHex === t.common.emptyValue ? null : icaoHex;

  useEffect(() => {
    if (!lookupHex) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setResult(null);
    setImageFailed(false);
    void fetch(`/api/aircraft/${encodeURIComponent(lookupHex)}/photo`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("aircraft photo request failed");
        return await response.json() as AircraftPhotoApiResponse;
      })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lookupHex]);

  const photo: AircraftPhoto | null = result?.photo ?? null;
  if (!lookupHex || imageFailed || (!loading && (!result?.enabled || !photo))) return null;

  const identity = registration?.trim() || lookupHex;
  return (
    <section className="aircraft-card aircraft-photo-card" aria-labelledby="aircraft-photo-title">
      <h2 id="aircraft-photo-title">{t.aircraft.photoTitle}</h2>
      {loading || !photo ? <div className="detail-disclaimer">{t.common.loading}</div> : (
        <>
          <a className="aircraft-photo-link" href={photo.sourceUrl} target="_blank" rel="noreferrer">
            {/* The server validates this URL against the Planespotters host allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="aircraft-photo-thumbnail"
              src={photo.thumbnailUrl}
              alt={`${t.aircraft.photoAlt} ${identity}`}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </a>
          <div className="aircraft-photo-attribution">
            <span>{photo.attribution ?? t.aircraft.photoPhotographerUnknown}</span>
            <span aria-hidden="true"> · </span>
            <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{t.aircraft.photoSource}</a>
          </div>
        </>
      )}
    </section>
  );
}

export function AircraftDetailV2({
  detail,
  liveAircraft,
  loading = false,
  error = null,
  backHref = "/",
}: {
  detail: AircraftDetailResponse | null;
  liveAircraft: AircraftView | null;
  loading?: boolean;
  error?: string | null;
  backHref?: string;
}) {
  const databaseAircraft = detail?.aircraft;
  const metadata = liveAircraft?.enrichment?.metadata;
  const icaoHex = liveAircraft?.icaoHex ?? databaseAircraft?.icaoHex ?? t.common.emptyValue;
  const registration = liveAircraft?.registration ?? metadata?.registration ?? databaseAircraft?.registration;
  const aircraftType = metadata?.icaoTypeCode ?? liveAircraft?.aircraftType ?? databaseAircraft?.aircraftType;
  const model = metadata?.aircraftDescription ?? liveAircraft?.aircraftDescription ?? databaseAircraft?.model;
  const manufacturer = metadata?.manufacturer ?? databaseAircraft?.manufacturer;
  const operator = metadata?.operator ?? databaseAircraft?.operator;
  const registrationCountry = metadata?.registrationCountryCode ?? metadata?.registrationCountry ?? databaseAircraft?.registrationCountryCode ?? databaseAircraft?.registrationCountry;
  const backLink = backHref === "/history" ? "/history" : "/";
  const watchlistHref = icaoHex === t.common.emptyValue ? "/watchlist" : aircraftWatchlistHref(icaoHex, registration);

  return (
    <main className="aircraft-page">
      <header className="aircraft-page-header">
        <Link className="back-link" href={backLink}>{t.history.backToRadar}</Link>
        <div className="aircraft-page-kicker">{t.history.aircraftDetail}</div>
        <h1>{icaoHex}</h1>
        <div className={`aircraft-status ${liveAircraft ? "live" : "offline"}`}>
          {liveAircraft ? t.status.liveReceiver : t.aircraft.notCurrentlyInRange}
        </div>
      </header>

      <div className="aircraft-page-layout">
        <div className="aircraft-primary-column">
          <section className="aircraft-card" aria-labelledby="aircraft-information-title">
            <h2 id="aircraft-information-title">{t.history.aircraftDetail}</h2>
            <div className="detail-grid aircraft-detail-grid">
              <DetailValue label={t.aircraft.icaoHex}>{icaoHex}</DetailValue>
              <DetailValue label={t.aircraft.registration}>{valueOrEmpty(registration)}</DetailValue>
              <DetailValue label={t.aircraft.currentCallsign}>{valueOrEmpty(liveAircraft?.callsign)}</DetailValue>
              <DetailValue label={t.aircraft.aircraftType}>{valueOrEmpty(aircraftType)}</DetailValue>
              <DetailValue label={t.aircraft.manufacturer}>{valueOrEmpty(manufacturer)}</DetailValue>
              <DetailValue label={t.aircraft.modelType}>{valueOrEmpty(model)}</DetailValue>
              <DetailValue label={t.aircraft.operator}>{valueOrEmpty(operator)}</DetailValue>
              <DetailValue label={t.aircraft.registrationCountry}>{valueOrEmpty(registrationCountry)}</DetailValue>
            </div>
            <div className="watchlist-actions"><Link className="primary-button" href={watchlistHref}>{t.watchlist.followAircraft}</Link></div>

            <section className="detail-section" aria-labelledby="aircraft-live-title">
              <h3 id="aircraft-live-title">{t.aircraft.liveAdsb}</h3>
              {liveAircraft ? (
                <div className="detail-grid">
                  <DetailValue label={t.aircraft.altitude}>{formatAltitude(liveAircraft.altitude)}</DetailValue>
                  <DetailValue label={t.aircraft.groundSpeed}>{formatSpeed(liveAircraft.groundSpeed)}</DetailValue>
                  <DetailValue label={t.aircraft.track}>{formatTrack(liveAircraft.track)}</DetailValue>
                </div>
              ) : <div className="detail-disclaimer">{t.aircraft.notCurrentlyInRange}</div>}
            </section>
          </section>
          <AircraftPhotoCard icaoHex={icaoHex} registration={registration} />
        </div>

        <section className="aircraft-card aircraft-recent-card" aria-label={t.history.recentFlights}>
          <AircraftRecentFlights recentFlights={detail?.recentFlights ?? []} loading={loading} error={error} />
        </section>
      </div>
    </main>
  );
}
