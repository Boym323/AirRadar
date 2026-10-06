"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicAircraft, PublicStateSnapshot } from "@/lib/aircraft/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { OperationalAttentionSummary } from "@/lib/operational-twin/operational-attention";
import type { RegionalFocusQueue } from "@/lib/operational-twin/regional-focus-queue";
import type { RegionalSituationGraph } from "@/lib/operational-twin/regional-situation";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { formatAltitude, formatNumber, formatTime, t } from "@/lib/i18n";
import {
  ContextBadge,
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./operations-dashboard.module.css";

type SituationResponse = RegionalSituationGraph & {
  attention: OperationalAttentionSummary;
  focusQueue: RegionalFocusQueue;
  attentionGraduation: {
    version: string;
    decision: "PASS" | "WAIT" | "FAIL";
    graduated: boolean;
    scope: string;
  };
};

type IntelligenceResponse = {
  events: FlightIntelligenceEvent[];
  source: string;
};

type AirportFlow = {
  icao: string;
  inbound: number;
  outbound: number;
  total: number;
};

type TrafficPhase = "ground" | "climbing" | "level" | "descending";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function phaseForAircraft(aircraft: PublicAircraft): TrafficPhase {
  if (aircraft.onGround) return "ground";
  const verticalRate = aircraft.verticalRate ?? aircraft.baroRate ?? aircraft.geomRate;
  if (finite(verticalRate) && verticalRate >= 500) return "climbing";
  if (finite(verticalRate) && verticalRate <= -500) return "descending";
  return "level";
}

function airportCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function buildAirportFlows(aircraft: readonly PublicAircraft[]): AirportFlow[] {
  const flows = new Map<string, { inbound: number; outbound: number }>();
  for (const item of aircraft) {
    const origin = airportCode(item.enrichment?.route?.origin);
    const destination = airportCode(item.enrichment?.route?.destination);
    if (origin) {
      const current = flows.get(origin) ?? { inbound: 0, outbound: 0 };
      current.outbound += 1;
      flows.set(origin, current);
    }
    if (destination) {
      const current = flows.get(destination) ?? { inbound: 0, outbound: 0 };
      current.inbound += 1;
      flows.set(destination, current);
    }
  }
  return [...flows.entries()]
    .map(([icao, value]) => ({ icao, ...value, total: value.inbound + value.outbound }))
    .sort((a, b) => b.total - a.total || b.inbound - a.inbound || a.icao.localeCompare(b.icao))
    .slice(0, 4);
}

function eventLabel(type: FlightIntelligenceEvent["type"]): string {
  return type.replaceAll("_", " ");
}

function relativeMinutes(value: number | null): string {
  if (value === null) return t.common.emptyValue;
  return "+" + formatNumber(value) + " min";
}

function confidenceVariant(confidence: string | null | undefined): "observed" | "inferred" | "likely" | "possible" {
  if (confidence === "HIGH" || confidence === "high") return "likely";
  if (confidence === "MEDIUM" || confidence === "medium") return "inferred";
  return "possible";
}

export function OperationsDashboard() {
  const [snapshot, setSnapshot] = useState<PublicStateSnapshot | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [situation, setSituation] = useState<SituationResponse | null>(null);
  const [predictive, setPredictive] = useState<PredictiveOperationsResponse | null>(null);
  const [events, setEvents] = useState<FlightIntelligenceEvent[]>([]);
  const [airportOperations, setAirportOperations] = useState<Record<string, AirportOperationsResponse>>({});
  const [contextFailed, setContextFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const source = new EventSource("/api/stream?coverage=local");
    source.addEventListener("snapshot", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as PublicStateSnapshot;
        if (active) {
          setSnapshot(next);
          setStreamConnected(true);
        }
      } catch {
        if (active) setStreamConnected(false);
      }
    });
    source.onopen = () => { if (active) setStreamConnected(true); };
    source.onerror = () => { if (active) setStreamConnected(false); };
    return () => {
      active = false;
      source.close();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const [situationResponse, intelligenceResponse] = await Promise.all([
          fetch("/api/operations/situation", { cache: "no-store", signal: controller.signal }),
          fetch("/api/intelligence/events?limit=20", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!situationResponse.ok || !intelligenceResponse.ok) throw new Error("operations context unavailable");
        const [nextSituation, nextIntelligence] = await Promise.all([
          situationResponse.json() as Promise<SituationResponse>,
          intelligenceResponse.json() as Promise<IntelligenceResponse>,
        ]);
        if (!active) return;
        setSituation(nextSituation);
        setEvents(nextIntelligence.events);
        setContextFailed(false);

        const focused = [
          ...nextSituation.focusQueue.items.map((item) => item.icaoHex),
          ...nextSituation.nodes.map((item) => item.icaoHex),
        ];
        const hexes = [...new Set(focused)].slice(0, 6);
        if (hexes.length === 0) {
          setPredictive({ generatedAt: new Date().toISOString(), items: [] });
          return;
        }
        const predictiveResponse = await fetch(
          "/api/operations/predictive?hexes=" + encodeURIComponent(hexes.join(",")),
          { cache: "no-store", signal: controller.signal },
        );
        if (!predictiveResponse.ok) throw new Error("predictive operations unavailable");
        const nextPredictive = await predictiveResponse.json() as PredictiveOperationsResponse;
        if (active) setPredictive(nextPredictive);
      } catch (error) {
        if (!active || (error as Error).name === "AbortError") return;
        setContextFailed(true);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const phases = useMemo(() => {
    const result = { airborne: 0, ground: 0, climbing: 0, level: 0, descending: 0 };
    for (const aircraft of snapshot?.aircraft ?? []) {
      const phase = phaseForAircraft(aircraft);
      if (phase === "ground") result.ground += 1;
      else {
        result.airborne += 1;
        result[phase] += 1;
      }
    }
    return result;
  }, [snapshot]);

  const approachAircraft = useMemo(() => {
    const live = new Set((snapshot?.aircraft ?? []).map((aircraft) => aircraft.icaoHex));
    const cutoff = Date.now() - 15 * 60_000;
    return new Set(events
      .filter((event) => event.type === "APPROACH" && live.has(event.icaoHex) && Date.parse(event.occurredAt) >= cutoff)
      .map((event) => event.icaoHex)).size;
  }, [events, snapshot]);

  const airportFlows = useMemo(
    () => buildAirportFlows(snapshot?.aircraft ?? []),
    [snapshot],
  );
  const airportKey = airportFlows.map((item) => item.icao).join(",");

  useEffect(() => {
    if (!airportKey) {
      setAirportOperations({});
      return;
    }
    let active = true;
    const controller = new AbortController();
    const codes = airportKey.split(",").filter(Boolean);
    void Promise.all(codes.map(async (icao) => {
      try {
        const response = await fetch(
          "/api/airports/" + encodeURIComponent(icao) + "/operations?period=24h",
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return null;
        return [icao, await response.json() as AirportOperationsResponse] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!active) return;
      setAirportOperations(Object.fromEntries(entries.filter((entry): entry is readonly [string, AirportOperationsResponse] => entry !== null)));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [airportKey]);

  const predictedArrivals = useMemo(
    () => (predictive?.items ?? [])
      .filter((item) => item.etaAdvisory && item.etaAdvisory.horizonMinutes <= 30)
      .sort((a, b) => (a.etaAdvisory?.horizonMinutes ?? 999) - (b.etaAdvisory?.horizonMinutes ?? 999))
      .slice(0, 6),
    [predictive],
  );

  const terminalArrivals = useMemo(() => {
    const rows = Object.entries(airportOperations).flatMap(([airport, operations]) =>
      (operations.terminalDemandHorizon?.items ?? [])
        .filter((item) => item.etaMinutes !== null && item.etaMinutes <= 30)
        .map((item) => ({
          airport,
          item,
          runway: operations.likelyRunway?.designator ?? null,
        })),
    );
    return rows
      .sort((a, b) => (a.item.etaMinutes ?? 999) - (b.item.etaMinutes ?? 999))
      .slice(0, 8);
  }, [airportOperations]);

  const notableEvents = useMemo(
    () => events
      .filter((event) => ["GO_AROUND", "HOLDING", "DIVERSION", "UNUSUAL_TURN", "ORBIT", "TOP_OF_DESCENT"].includes(event.type))
      .slice(0, 8),
    [events],
  );

  const generatedAt = situation?.generatedAt ?? snapshot?.fetchedAt ?? null;

  return (
    <main className={styles.page}>
      <PageHeader
        kicker="AIRRADAR / OPERATIONS"
        title={t.operations.title}
        description={t.operations.subtitle}
        actions={
          <div className={styles.headerStatus}>
            <StatusBadge variant={streamConnected ? "live" : "stale"}>
              {streamConnected ? t.operations.live : t.operations.reconnecting}
            </StatusBadge>
            {generatedAt ? <span>{t.operations.updated} {formatTime(generatedAt)}</span> : null}
          </div>
        }
      />

      {contextFailed ? (
        <div className={styles.warning}>{t.operations.partialData}</div>
      ) : null}

      <Panel className={styles.heroPanel}>
        <SectionHeader
          kicker={t.operations.liveTrafficKicker}
          title={t.operations.liveTraffic}
          description={t.operations.liveTrafficDescription}
          actions={<Link className={styles.inlineLink} href="/">{t.operations.openRadar} →</Link>}
        />
        <MetricStrip className={styles.metrics}>
          <MetricCard value={snapshot?.aircraft.length ?? t.common.emptyValue} label={t.operations.tracked} detail={snapshot?.provider ?? t.operations.awaitingLiveData} />
          <MetricCard value={phases.airborne} label={t.operations.airborne} />
          <MetricCard value={phases.climbing} label={t.operations.climbing} />
          <MetricCard value={phases.level} label={t.operations.level} />
          <MetricCard value={phases.descending} label={t.operations.descending} />
          <MetricCard value={approachAircraft} label={t.operations.approach} detail={t.operations.approachWindow} />
        </MetricStrip>
      </Panel>

      <div className={styles.grid}>
        <Panel className={styles.panel}>
          <SectionHeader
            kicker={t.operations.airportFlowKicker}
            title={t.operations.airportFlow}
            description={t.operations.airportFlowDescription}
            actions={<Link className={styles.inlineLink} href="/airports">{t.operations.allAirports} →</Link>}
          />
          {airportFlows.length === 0 ? (
            <EmptyState title={t.operations.noAirportFlow} description={t.operations.awaitingRouteData} />
          ) : (
            <div className={styles.airportList}>
              {airportFlows.map((flow) => {
                const operations = airportOperations[flow.icao];
                return (
                  <Link href={"/airports/" + encodeURIComponent(flow.icao)} className={styles.airportRow} key={flow.icao}>
                    <span className={styles.airportIdentity}>
                      <strong>{flow.icao}</strong>
                      <small>{operations?.activity ?? t.operations.liveRoutes}</small>
                    </span>
                    <span className={styles.flowCounts}>
                      <span><small>{t.operations.inbound}</small><strong>{flow.inbound}</strong></span>
                      <span><small>{t.operations.outbound}</small><strong>{flow.outbound}</strong></span>
                    </span>
                    <span className={styles.runway}>
                      <small>{t.operations.runway}</small>
                      <strong>{operations?.likelyRunway ? "RWY " + operations.likelyRunway.designator : t.common.emptyValue}</strong>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className={styles.panel}>
          <SectionHeader
            kicker={t.operations.nextKicker}
            title={t.operations.nextThirty}
            description={t.operations.nextThirtyDescription}
          />
          {predictedArrivals.length > 0 ? (
            <div className={styles.timeline}>
              {predictedArrivals.map((item) => {
                const eta = item.etaAdvisory!;
                return (
                  <Link href={"/aircraft/" + encodeURIComponent(item.icaoHex)} className={styles.timelineRow} key={item.icaoHex}>
                    <span className={styles.timelineTime}>+{eta.horizonMinutes} min</span>
                    <span className={styles.timelineBody}>
                      <strong>{item.label}</strong>
                      <small>{item.destination ?? t.common.emptyValue} · {t.operations.eta} {formatTime(eta.estimatedArrivalAt)}</small>
                    </span>
                    <ContextBadge variant={confidenceVariant(eta.confidence)}>{eta.confidence}</ContextBadge>
                  </Link>
                );
              })}
            </div>
          ) : terminalArrivals.length > 0 ? (
            <>
              <div className={styles.contextNote}>
                <ContextBadge variant="inferred">{t.operations.inferred}</ContextBadge>
                <span>{t.operations.terminalDemandFallback}</span>
              </div>
              <div className={styles.timeline}>
                {terminalArrivals.map(({ airport, item, runway }) => (
                  <Link href={"/aircraft/" + encodeURIComponent(item.icaoHex)} className={styles.timelineRow} key={airport + "-" + item.icaoHex}>
                    <span className={styles.timelineTime}>{relativeMinutes(item.etaMinutes)}</span>
                    <span className={styles.timelineBody}>
                      <strong>{item.label}</strong>
                      <small>{airport}{runway ? " · RWY " + runway : ""} · {formatAltitude(item.altitudeFt)}</small>
                    </span>
                    <ContextBadge variant={item.trackRelation === "TOWARD" ? "likely" : "possible"}>{item.trackRelation}</ContextBadge>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title={t.operations.noUpcoming} description={t.operations.noUpcomingDescription} />
          )}
        </Panel>

        <Panel className={styles.panel + " " + styles.attentionPanel}>
          <SectionHeader
            kicker={t.operations.attentionKicker}
            title={t.operations.attention}
            description={t.operations.attentionDescription}
            actions={
              situation ? (
                <StatusBadge variant={situation.attention.attention > 0 ? "warning" : "success"}>
                  {situation.attention.attention} {t.operations.attentionCount}
                </StatusBadge>
              ) : null
            }
          />
          {situation?.focusQueue.items.length ? (
            <div className={styles.focusList}>
              {situation.focusQueue.items.slice(0, 8).map((item) => (
                <Link href={"/aircraft/" + encodeURIComponent(item.icaoHex)} className={styles.focusRow} key={item.icaoHex}>
                  <span className={styles.focusLevel} data-level={item.level}>{item.level}</span>
                  <span className={styles.focusIdentity}>
                    <strong>{item.label}</strong>
                    <small>{item.types.join(" · ")}</small>
                  </span>
                  <span className={styles.focusMeta}>
                    <strong>{item.totalSignals}</strong>
                    <small>{item.earliestProjectedOffsetMinutes === null ? t.operations.contextOnly : relativeMinutes(item.earliestProjectedOffsetMinutes)}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t.operations.noAttention} description={t.operations.noAttentionDescription} />
          )}
          {situation ? (
            <p className={styles.safetyNote}>
              {t.operations.contextDisclaimer}
              {situation.attentionGraduation.graduated ? " · " + t.operations.graduated : ""}
            </p>
          ) : null}
        </Panel>

        <Panel className={styles.panel}>
          <SectionHeader
            kicker={t.operations.eventsKicker}
            title={t.operations.notableEvents}
            description={t.operations.notableEventsDescription}
            actions={<Link className={styles.inlineLink} href="/intelligence">{t.operations.openIntelligence} →</Link>}
          />
          {notableEvents.length > 0 ? (
            <div className={styles.eventList}>
              {notableEvents.map((event) => (
                <Link href={"/aircraft/" + encodeURIComponent(event.icaoHex)} className={styles.eventRow} key={event.eventKey}>
                  <span className={styles.eventType}>{eventLabel(event.type)}</span>
                  <span className={styles.eventIdentity}>
                    <strong>{event.callsign ?? event.registration ?? event.icaoHex}</strong>
                    <small>{event.airportIcao ?? event.sectorId ?? formatAltitude(event.altitude)}</small>
                  </span>
                  <span className={styles.eventTime}>{formatTime(event.occurredAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t.operations.noNotableEvents} description={t.operations.noNotableEventsDescription} />
          )}
        </Panel>
      </div>
    </main>
  );
}
