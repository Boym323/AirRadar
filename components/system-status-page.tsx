"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDateTime, formatDistance, formatNumber, getTranslations, type LocaleDictionary, type LocaleKey } from "@/lib/i18n";
import type { SystemStatus, SystemStatusResponse } from "@/lib/server/system-status";

function formatUptime(seconds: number, dictionary: LocaleDictionary): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainingSeconds = total % 60;
  if (dictionary.locale.startsWith("cs")) {
    return days ? `${days} d ${hours} h ${minutes} min` : `${hours} h ${minutes} min ${remainingSeconds} s`;
  }
  return days ? `${days} d ${hours} h ${minutes} min` : `${hours} h ${minutes} min ${remainingSeconds} s`;
}

function formatCount(value: number | null, dictionary: LocaleDictionary): string {
  return value === null ? dictionary.system.notAvailable : formatNumber(value, 0, dictionary.locale);
}

function formatStatus(status: SystemStatus | "demo", dictionary: LocaleDictionary): string {
  return dictionary.system.statusLabels[status];
}

function StatusBadge({ status, dictionary }: { status: SystemStatus | "demo"; dictionary: LocaleDictionary }) {
  return <span className={`system-status-badge ${status}`} data-status={status}>{formatStatus(status, dictionary)}</span>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="system-field"><dt>{label}</dt><dd>{value}</dd></div>;
}

function Card({
  title,
  status,
  dictionary,
  children,
}: {
  title: string;
  status: SystemStatus | "demo";
  dictionary: LocaleDictionary;
  children: React.ReactNode;
}) {
  return <section className="system-card" aria-label={title}>
    <div className="system-card-header"><h2>{title}</h2><StatusBadge status={status} dictionary={dictionary} /></div>
    <dl className="system-fields">{children}</dl>
  </section>;
}

function LinkNav({ dictionary, locale, onLocaleChange }: { dictionary: LocaleDictionary; locale: LocaleKey; onLocaleChange: () => void }) {
  return <nav className="system-nav" aria-label={dictionary.system.navigation}>
    <Link href="/">{dictionary.system.backToRadar}</Link>
    <Link href="/statistics">{dictionary.statistics.title}</Link>
    <Link href="/history">{dictionary.history.title}</Link>
    <Link href="/watchlist">{dictionary.watchlist.title}</Link>
    <button type="button" className="language-button" onClick={onLocaleChange} aria-label={locale === "cs" ? "English" : "Čeština"}>{locale === "cs" ? "EN" : "CZ"}</button>
  </nav>;
}

export function SystemStatusPage() {
  const [locale, setLocale] = useState<LocaleKey>("cs");
  const dictionary = getTranslations(locale);
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/system/status", { cache: "no-store" });
      if (!response.ok) throw new Error("system status request failed");
      setData(await response.json() as SystemStatusResponse);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <main className="history-page system-page">
    <header className="history-page-header system-page-header">
      <div>
        <Link className="back-link" href="/">{dictionary.system.backToRadar}</Link>
        <h1>{dictionary.system.pageTitle}</h1>
        <p className="statistics-subtitle">{dictionary.system.pageSubtitle}</p>
      </div>
      <LinkNav dictionary={dictionary} locale={locale} onLocaleChange={() => setLocale((current) => current === "cs" ? "en" : "cs")} />
    </header>

    <div className="system-toolbar">
      <div className="system-toolbar-status">
        {data && <StatusBadge status={data.status} dictionary={dictionary} />}
        {data && <span>{dictionary.system.checkedAt}: {formatDateTime(data.checkedAt, dictionary)}</span>}
      </div>
      <button type="button" className="primary-button" onClick={() => void load()} disabled={loading}>{loading ? dictionary.system.refreshing : dictionary.system.refresh}</button>
    </div>

    {loading && !data && <p className="system-message">{dictionary.system.loading}</p>}
    {error && <p className="statistics-error" role="alert">{dictionary.system.requestFailed}</p>}

    {data && <div className="system-grid">
      <Card title={dictionary.system.application} status={data.application.status} dictionary={dictionary}>
        <Field label={dictionary.system.applicationName} value={data.application.name} />
        <Field label={dictionary.system.version} value={data.application.version ?? dictionary.system.notAvailable} />
        <Field label={dictionary.system.commit} value={data.application.commit ?? dictionary.system.notAvailable} />
        <Field label={dictionary.system.buildTime} value={formatDateTime(data.application.buildTime, dictionary)} />
        <Field label={dictionary.system.channel} value={data.application.channel} />
        <Field label={dictionary.system.uptime} value={formatUptime(data.application.uptimeSeconds, dictionary)} />
        <Field label={dictionary.system.node} value={data.application.nodeVersion} />
        <Field label={dictionary.system.next} value={data.application.nextVersion ?? dictionary.system.notAvailable} />
        <Field label={dictionary.system.environment} value={data.application.environment} />
        <Field label={dictionary.system.timezone} value={data.application.timezone} />
        <Field label={dictionary.system.startTime} value={formatDateTime(data.application.startedAt, dictionary)} />
      </Card>

      <Card title={dictionary.system.receiver} status={data.receiver.readsb.status} dictionary={dictionary}>
        <Field label={dictionary.system.readsb} value={<StatusBadge status={data.receiver.readsb.status} dictionary={dictionary} />} />
        <Field label={dictionary.system.source} value={`${data.receiver.readsb.provider} · ${data.receiver.readsb.sourceStatus === "live" ? dictionary.system.online : data.receiver.readsb.sourceStatus === "offline" ? dictionary.system.offline : formatStatus("demo", dictionary)}`} />
        <Field label={dictionary.system.aircraftVisible} value={formatNumber(data.receiver.readsb.aircraftCount, 0, dictionary.locale)} />
        <Field label={dictionary.system.messagesPerSecond} value={data.receiver.readsb.messagesPerSecond === null ? dictionary.system.notAvailable : `${formatNumber(data.receiver.readsb.messagesPerSecond, 1, dictionary.locale)}/s`} />
        <Field label={dictionary.system.lastSnapshot} value={formatDateTime(data.receiver.readsb.lastSnapshot, dictionary)} />
        <Field label={dictionary.system.snapshotAge} value={data.receiver.readsb.snapshotAgeSeconds === null ? dictionary.system.notAvailable : `${formatNumber(data.receiver.readsb.snapshotAgeSeconds, 0, dictionary.locale)} ${dictionary.system.seconds}`} />
      </Card>

      <Card title={dictionary.system.database} status={data.database.status} dictionary={dictionary}>
        <Field label={dictionary.system.database} value={data.database.connected ? dictionary.system.connected : formatStatus(data.database.status, dictionary)} />
        <Field label={dictionary.system.historyPersistence} value={<StatusBadge status={data.database.history.status} dictionary={dictionary} />} />
        <Field label={dictionary.system.lastSuccessfulWrite} value={formatDateTime(data.database.history.lastSuccessfulWrite, dictionary)} />
        <Field label={dictionary.system.statisticsPersistence} value={<StatusBadge status={data.database.statistics.status} dictionary={dictionary} />} />
        <Field label={dictionary.system.lastSuccessfulWrite} value={formatDateTime(data.database.statistics.lastSuccessfulWrite, dictionary)} />
      </Card>

      <Card title={dictionary.system.statistics} status={data.statistics.status} dictionary={dictionary}>
        <Field label={dictionary.system.uniqueToday} value={formatNumber(data.statistics.uniqueAircraftToday, 0, dictionary.locale)} />
        <Field label={dictionary.system.maxConcurrentToday} value={formatNumber(data.statistics.maxConcurrentToday, 0, dictionary.locale)} />
        <Field label={dictionary.system.maxDistanceToday} value={formatDistance(data.statistics.maxDistanceTodayKm, dictionary)} />
        <Field label={dictionary.system.coverageBuckets} value={`${formatNumber(data.statistics.coverageBucketsWithData, 0, dictionary.locale)} / ${formatNumber(data.statistics.coverageBucketCount, 0, dictionary.locale)}`} />
        <Field label={dictionary.system.coverageStatus} value={data.statistics.coverageStatus === "ok" ? dictionary.system.coverageReady : dictionary.system.coverageEmpty} />
        <Field label={dictionary.system.timezone} value={`${data.statistics.date} · ${data.statistics.timezone}`} />
      </Card>

      <Card title={dictionary.system.atc} status={data.atc.status} dictionary={dictionary}>
        <Field label={dictionary.system.configured} value={data.atc.configured ? dictionary.system.configured : dictionary.system.disabled} />
        <Field label={dictionary.system.freshness} value={data.atc.freshness === "current" ? dictionary.system.current : data.atc.freshness === "stale" ? dictionary.system.stale : formatStatus(data.atc.status, dictionary)} />
        <Field label={dictionary.system.source} value={data.atc.source ?? dictionary.system.notAvailable} />
        <Field label={dictionary.system.sectors} value={formatNumber(data.atc.sectorCount, 0, dictionary.locale)} />
        <Field label={dictionary.system.relevantFrequencies} value={formatNumber(data.atc.relevantFrequencyCount, 0, dictionary.locale)} />
        <Field label={dictionary.system.effectiveDate} value={formatDateTime(data.atc.effectiveDate, dictionary)} />
        <Field label={dictionary.system.lastVerified} value={formatDateTime(data.atc.lastVerifiedAt, dictionary)} />
        <Field label={dictionary.system.matching} value={formatCount(data.atc.comparison.matching, dictionary)} />
        <Field label={dictionary.system.missing} value={formatCount(data.atc.comparison.missing, dictionary)} />
        <Field label={dictionary.system.extra} value={formatCount(data.atc.comparison.extra, dictionary)} />
        <Field label={dictionary.system.blocking} value={formatCount(data.atc.comparison.blocking, dictionary)} />
      </Card>

      <Card title={dictionary.system.weather} status={data.weather.status} dictionary={dictionary}>
        <Field label={dictionary.system.provider} value={data.weather.provider} />
        <Field label={dictionary.system.enabled} value={data.weather.enabled ? dictionary.system.configured : dictionary.system.disabled} />
        <Field label={dictionary.system.cache} value={`${data.weather.cache.status === "warm" ? dictionary.system.cacheWarm : dictionary.system.cacheEmpty} · ${formatNumber(data.weather.cache.entries, 0, dictionary.locale)} ${dictionary.system.entries}`} />
        <Field label={dictionary.system.airports} value={formatNumber(data.weather.cache.airports, 0, dictionary.locale)} />
      </Card>

      <Card title={dictionary.system.alerts} status={data.alerts.status} dictionary={dictionary}>
        <Field label={dictionary.system.configured} value={data.alerts.enabled ? dictionary.system.configured : dictionary.system.disabled} />
        <Field label={dictionary.system.notifier} value={data.alerts.notifier} />
        <Field label={dictionary.system.rules} value={formatNumber(data.alerts.ruleCount, 0, dictionary.locale)} />
      </Card>

      <Card title={dictionary.system.airportData} status={data.airportData.status} dictionary={dictionary}>
        <Field label={dictionary.system.source} value={data.airportData.source === "database" ? dictionary.system.databaseSource : data.airportData.source === "fallback" ? dictionary.system.fallbackSource : dictionary.system.unavailable} />
        <Field label={dictionary.system.databaseRows} value={data.airportData.rowCount === null ? dictionary.system.notAvailable : `${data.airportData.rowCountIsLowerBound ? "≥ " : ""}${formatNumber(data.airportData.rowCount, 0, dictionary.locale)}`} />
        {data.airportData.fallbackRowCount !== null && <Field label={dictionary.system.fallbackRows} value={formatNumber(data.airportData.fallbackRowCount, 0, dictionary.locale)} />}
      </Card>
    </div>}
  </main>;
}
