"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui-primitives";

interface DbLatencyWindow {
  status: "measured" | "disabled" | "insufficient_data";
  sampleCount: number;
  failedSampleCount: number;
  disabledSampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  lastSampleAt: string | null;
}

interface Data {
  databaseLatency: {
    lastHour: DbLatencyWindow;
    last24Hours: DbLatencyWindow;
  };
  routeCacheLatency: {
    source: string; processLocal: boolean; windowMinutes: number; sampleCount: number;
    p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
  };
  routeProviders: {
    routeset: {
      enabled: boolean; requests: number; success: number; failed: number;
      lastFailureAt: string | null; lastHttpStatus: number | null; nextAllowedAt: string | null;
      blockedUntilAt: string | null; skippedBlocked: number;
      reasons: { http: number; timeout: number; network: number; invalid_response: number; other: number };
    };
    postgres: {
      timeouts: number; queryFailures: number; connectionFailures: number;
      bypassBackoff: number; bypassConcurrency: number; bypassUnconfigured: number;
      lastFailureAt: string | null; lastErrorKind: string | null;
    };
  };
  rxw: {
    enabled: boolean; fpnEnabled: boolean; connection: string;
    receivedEvents: number; receivedItems: number; accepted: number;
    rejectedInvalid: number; rejectedDuplicate: number; unsupportedPayloads: number;
    fpnAccepted: number; fpnRejected: number; plans: number; aircraft: number;
    connectCount: number; disconnectCount: number; connectionErrors: number;
    lastEventAt: string | null; lastAcceptedAt: string | null;
  };
  adsbhub: null | {
    enabled: boolean; status: string; connected: boolean; lastLineAt: string | null;
    linesReceived: number; linesParsed: number; malformedLines: number;
    invalidIcao: number; invalidPosition: number; reconnects: number; activeTracks: number;
  };
  route: {
    enabled: boolean; dbHit: number; dbMiss: number; dbError: number;
    dbBypassed: number; dbWrite: number; validEntries: number | null;
    telemetryFailures: number; lastSavedAt: string | null;
  };
  navigation: {
    observationsCreated: number; rejectedInvalidOrStale: number;
    rejectionReasons: Record<string, number>;
  };
}

export function SystemIntegrationDiagnostics({ locale }: { locale: string }) {
  const cs = locale.startsWith("cs");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/system/integrations", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      setData(await response.json() as Data);
      setError(false);
    } catch {
      setError(true);
      setData(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const fmt = (n: number | null | undefined) => n === null || n === undefined ? "—" : n.toLocaleString(cs ? "cs-CZ" : "en-US");
  const dbSummary = (period: DbLatencyWindow) => period.status === "measured"
    ? `P50 ${fmt(period.p50Ms)} / P95 ${fmt(period.p95Ms)} / P99 ${fmt(period.p99Ms)} ms · ${cs ? "platných" : "valid"} ${fmt(period.sampleCount)}, ${cs ? "chyb" : "failed"} ${fmt(period.failedSampleCount)}`
    : period.status === "disabled" ? (cs ? "DB vypnuta · bez měření" : "DB disabled · not measured")
      : (cs ? "Nedostatek úspěšných vzorků" : "Insufficient successful samples");
  const time = (v: string | null) => v ? new Date(v).toLocaleString(cs ? "cs-CZ" : "en-US") : "—";
  const stateName = (value: string) => !cs ? value : ({
    connected: "připojeno", connecting: "připojování", disconnected: "odpojeno",
    online: "online", offline: "offline", stopped: "zastaveno",
    error: "chyba", degraded: "zhoršeno", disabled: "vypnuto",
  } as Record<string, string>)[value] ?? value;
  const rejectionName = (value: string) => !cs ? value : ({
    no_position: "bez polohy", stale_position: "stará poloha",
    unsupported_source: "nepodporovaný zdroj", on_ground: "na zemi",
    no_integrity_fields: "chybí pole integrity", stale_integrity: "stará integrita",
    position_integrity_skew: "nesoulad času polohy a integrity",
    invalid_telemetry: "neplatná telemetrie", invalid_or_stale_pair: "neúplná nebo zastaralá data",
  } as Record<string, string>)[value] ?? value;
  return <Card className="system-card system-integrations-diagnostics">
    <div className="system-card-header">
      <h2>{cs ? "Provoz datových integrací" : "Data integrations runtime"}</h2>
      <button type="button" onClick={() => { void load(); }}>{cs ? "Obnovit" : "Refresh"}</button>
    </div>
    {error && <p role="status">{cs ? "Provozní diagnostiku se nepodařilo načíst." : "Integration diagnostics could not be loaded."}</p>}
    {!data && !error && <p role="status">{cs ? "Načítání…" : "Loading…"}</p>}
    {data && <div className="system-integration-groups">
      <section className="system-integration-group"><h3>RXW ACARS / FPN</h3><dl className="system-fields">
      <div className="system-field"><dt>RXW ACARS</dt><dd>{data.rxw.enabled ? stateName(data.rxw.connection) : (cs ? "Vypnuto" : "Disabled")} · FPN {data.rxw.fpnEnabled ? "ON" : "OFF"}</dd></div>
      <div className="system-field"><dt>{cs ? "Události / položky / přijaté" : "Events / items / accepted"}</dt><dd>{fmt(data.rxw.receivedEvents)} / {fmt(data.rxw.receivedItems)} / {fmt(data.rxw.accepted)}</dd></div>
      <div className="system-field"><dt>{cs ? "Neplatné / duplicity / formát" : "Invalid / duplicates / shape"}</dt><dd>{fmt(data.rxw.rejectedInvalid)} / {fmt(data.rxw.rejectedDuplicate)} / {fmt(data.rxw.unsupportedPayloads)}</dd></div>
      <div className="system-field"><dt>{cs ? "FPN platné / zamítnuté / aktivní" : "FPN valid / rejected / active"}</dt><dd>{fmt(data.rxw.fpnAccepted)} / {fmt(data.rxw.fpnRejected)} / {fmt(data.rxw.plans)}</dd></div>
      <div className="system-field"><dt>{cs ? "Poslední RXW událost / přijato" : "Last RXW event / accepted"}</dt><dd>{time(data.rxw.lastEventAt)} / {time(data.rxw.lastAcceptedAt)}</dd></div>
      <div className="system-field"><dt>RXW {cs ? "spojení / odpojení / chyby" : "connect / disconnect / errors"}</dt><dd>{fmt(data.rxw.connectCount)} / {fmt(data.rxw.disconnectCount)} / {fmt(data.rxw.connectionErrors)}</dd></div>
      </dl></section>
      <section className="system-integration-group"><h3>ADSBHub</h3><dl className="system-fields">
      <div className="system-field"><dt>ADSBHub</dt><dd>{data.adsbhub ? (data.adsbhub.enabled ? stateName(data.adsbhub.status) : (cs ? "Vypnuto" : "Disabled")) : "—"}</dd></div>
      {data.adsbhub && <div className="system-field"><dt>ADSBHub {cs ? "řádky / platné / chyby / restarty" : "lines / parsed / invalid / reconnects"}</dt><dd>{fmt(data.adsbhub.linesReceived)} / {fmt(data.adsbhub.linesParsed)} / {fmt(data.adsbhub.malformedLines + data.adsbhub.invalidIcao + data.adsbhub.invalidPosition)} / {fmt(data.adsbhub.reconnects)}</dd></div>}
      </dl></section>
      <section className="system-integration-group routes"><h3>{cs ? "Trasy a databázová cache" : "Routes and database cache"}</h3><dl className="system-fields">
      <div className="system-field"><dt>Route DB {cs ? "zásahy / chyby / přemostění" : "hits / errors / bypass"}</dt><dd>{fmt(data.route.dbHit)} / {fmt(data.route.dbError)} / {fmt(data.route.dbBypassed)}</dd></div>
      <div className="system-field"><dt>ADSB.lol Routes · {cs ? "stav" : "status"}</dt><dd>{data.routeProviders.routeset.enabled ? (cs ? "Zapnuto" : "Enabled") : (cs ? "Vypnuto" : "Disabled")} · {fmt(data.routeProviders.routeset.success)} / {fmt(data.routeProviders.routeset.requests)} {cs ? "úspěšných dávek od startu" : "successful batches since startup"}</dd></div>
      <div className="system-field"><dt>ADSB.lol Routes · {cs ? "příčiny chyb" : "failure causes"}</dt><dd>{cs ? "HTTP" : "HTTP"} {fmt(data.routeProviders.routeset.reasons.http)}{data.routeProviders.routeset.lastHttpStatus ? " (" + data.routeProviders.routeset.lastHttpStatus + ")" : ""} · timeout {fmt(data.routeProviders.routeset.reasons.timeout)} · {cs ? "síť" : "network"} {fmt(data.routeProviders.routeset.reasons.network)} · {cs ? "formát" : "format"} {fmt(data.routeProviders.routeset.reasons.invalid_response)} · {cs ? "jiné" : "other"} {fmt(data.routeProviders.routeset.reasons.other)}</dd></div>
      <div className="system-field"><dt>ADSB.lol Routes · {cs ? "poslední chyba" : "last failure"}</dt><dd>{time(data.routeProviders.routeset.lastFailureAt)} · {cs ? "další pokus" : "retry"} {time(data.routeProviders.routeset.nextAllowedAt)}</dd></div>
      {data.routeProviders.routeset.blockedUntilAt && new Date(data.routeProviders.routeset.blockedUntilAt).getTime() > Date.now() &&
        <div className="system-field"><dt>{cs ? "ADSB.lol Routes · přístup odmítnut" : "ADSB.lol Routes · upstream access refused"}</dt><dd>
          {cs ? "Poskytovatel vrací HTTP 401/403. Další dotazy jsou dočasně pozastaveny; lokální cache a další zdroje fungují dál." :
            "Upstream returned HTTP 401/403. Requests are temporarily suspended; local cache and other route sources stay available."}
          {" · "}{cs ? "Nový pokus" : "Next probe"} {time(data.routeProviders.routeset.blockedUntilAt)}
          {" · "}{cs ? "ušetřené dotazy" : "skipped requests"} {fmt(data.routeProviders.routeset.skippedBlocked)}
        </dd></div>}
      <div className="system-field"><dt>PostgreSQL · {cs ? "příčiny chyb" : "failure causes"}</dt><dd>timeout {fmt(data.routeProviders.postgres.timeouts)} · {cs ? "dotaz" : "query"} {fmt(data.routeProviders.postgres.queryFailures)} · {cs ? "spojení" : "connection"} {fmt(data.routeProviders.postgres.connectionFailures)}</dd></div>
      <div className="system-field"><dt>PostgreSQL · {cs ? "obejití: cooldown / limit / nenastaveno" : "bypass: cooldown / capacity / unavailable"}</dt><dd>{fmt(data.routeProviders.postgres.bypassBackoff)} / {fmt(data.routeProviders.postgres.bypassConcurrency)} / {fmt(data.routeProviders.postgres.bypassUnconfigured)}</dd></div>
      <div className="system-field"><dt>{cs ? "SQL operace route cache · P50/P95/P99" : "Route cache SQL operations · P50/P95/P99"}</dt><dd>{data.routeCacheLatency.sampleCount > 0
        ? `${fmt(data.routeCacheLatency.p50Ms)} / ${fmt(data.routeCacheLatency.p95Ms)} / ${fmt(data.routeCacheLatency.p99Ms)} ms · ${fmt(data.routeCacheLatency.sampleCount)} ${cs ? "úspěšných operací od startu, max. 60 min" : "successful operations since startup, up to 60 min"}`
        : (cs ? "Zatím žádné úspěšné SQL operace od startu" : "No successful SQL operations recorded since startup")}</dd></div>
      </dl></section>
      <section className="system-integration-group routes"><h3>{cs ? "Odezva databáze · skutečné minutové vzorky" : "Database latency · real minute probes"}</h3><dl className="system-fields">
        <div className="system-field"><dt>{cs ? "Posledních 60 minut" : "Last 60 minutes"}</dt><dd>{dbSummary(data.databaseLatency.lastHour)}</dd></div>
        <div className="system-field"><dt>{cs ? "Posledních 24 hodin" : "Last 24 hours"}</dt><dd>{dbSummary(data.databaseLatency.last24Hours)}</dd></div>
        <div className="system-field"><dt>{cs ? "Poslední vzorek" : "Last sample"}</dt><dd>{time(data.databaseLatency.lastHour.lastSampleAt)}</dd></div>
        <div className="system-field"><dt>{cs ? "Metodika" : "Method"}</dt><dd>{cs ? "Jeden skutečný kontrolní dotaz za minutu; percentily z úspěšných dotazů, výpadky zvlášť. Nejde o syntetický Soak ani latenci route cache." : "One real DB probe per minute; percentiles of successful queries and separate failed probes. Not synthetic Soak or route cache latency."}</dd></div>
      </dl></section>
      <section className="system-integration-group"><h3>Navigation Integrity</h3><dl className="system-fields">
      <div className="system-field"><dt>Navigation Integrity {cs ? "odmítnutí" : "rejections"}</dt><dd>{Object.entries(data.navigation.rejectionReasons).map(([k, v]) => rejectionName(k) + ": " + fmt(v)).join(" · ") || "—"}</dd></div>
      </dl></section>
    </div>}
  </Card>;
}
