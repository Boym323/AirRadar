"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui-primitives";

interface Data {
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
  const time = (v: string | null) => v ? new Date(v).toLocaleString(cs ? "cs-CZ" : "en-US") : "—";
  return <Card className="system-card system-integrations-diagnostics">
    <div className="system-card-header">
      <h2>{cs ? "Provoz datových integrací" : "Data integrations runtime"}</h2>
      <button type="button" onClick={() => { void load(); }}>{cs ? "Obnovit" : "Refresh"}</button>
    </div>
    {error && <p role="status">{cs ? "Diagnostika není dostupná nebo vyžaduje přihlášení." : "Diagnostics unavailable or admin session required."}</p>}
    {!data && !error && <p role="status">{cs ? "Načítání…" : "Loading…"}</p>}
    {data && <div className="system-fields">
      <div className="system-field"><dt>RXW ACARS</dt><dd>{data.rxw.enabled ? data.rxw.connection : (cs ? "Vypnuto" : "Disabled")} · FPN {data.rxw.fpnEnabled ? "ON" : "OFF"}</dd></div>
      <div className="system-field"><dt>{cs ? "Události / položky / přijaté" : "Events / items / accepted"}</dt><dd>{fmt(data.rxw.receivedEvents)} / {fmt(data.rxw.receivedItems)} / {fmt(data.rxw.accepted)}</dd></div>
      <div className="system-field"><dt>{cs ? "Neplatné / duplicity / formát" : "Invalid / duplicates / shape"}</dt><dd>{fmt(data.rxw.rejectedInvalid)} / {fmt(data.rxw.rejectedDuplicate)} / {fmt(data.rxw.unsupportedPayloads)}</dd></div>
      <div className="system-field"><dt>{cs ? "FPN platné / zamítnuté / aktivní" : "FPN valid / rejected / active"}</dt><dd>{fmt(data.rxw.fpnAccepted)} / {fmt(data.rxw.fpnRejected)} / {fmt(data.rxw.plans)}</dd></div>
      <div className="system-field"><dt>{cs ? "Poslední RXW událost / přijato" : "Last RXW event / accepted"}</dt><dd>{time(data.rxw.lastEventAt)} / {time(data.rxw.lastAcceptedAt)}</dd></div>
      <div className="system-field"><dt>RXW {cs ? "spojení / odpojení / chyby" : "connect / disconnect / errors"}</dt><dd>{fmt(data.rxw.connectCount)} / {fmt(data.rxw.disconnectCount)} / {fmt(data.rxw.connectionErrors)}</dd></div>
      <div className="system-field"><dt>ADSBHub</dt><dd>{data.adsbhub ? (data.adsbhub.enabled ? data.adsbhub.status : (cs ? "Vypnuto" : "Disabled")) : "—"}</dd></div>
      {data.adsbhub && <div className="system-field"><dt>ADSBHub {cs ? "řádky / platné / chyby / restarty" : "lines / parsed / invalid / reconnects"}</dt><dd>{fmt(data.adsbhub.linesReceived)} / {fmt(data.adsbhub.linesParsed)} / {fmt(data.adsbhub.malformedLines + data.adsbhub.invalidIcao + data.adsbhub.invalidPosition)} / {fmt(data.adsbhub.reconnects)}</dd></div>}
      <div className="system-field"><dt>Route DB {cs ? "zásahy / chyby / přemostění" : "hits / errors / bypass"}</dt><dd>{fmt(data.route.dbHit)} / {fmt(data.route.dbError)} / {fmt(data.route.dbBypassed)}</dd></div>
      <div className="system-field"><dt>Navigation Integrity {cs ? "odmítnutí" : "rejections"}</dt><dd>{Object.entries(data.navigation.rejectionReasons).map(([k, v]) => k + ": " + fmt(v)).join(" · ") || "—"}</dd></div>
    </div>}
  </Card>;
}
