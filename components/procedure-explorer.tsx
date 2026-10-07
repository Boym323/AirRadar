"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import type { Procedure, ProcedurePoint, ProcedureType } from "@/lib/route-intelligence/contracts";
import { formatNumber, t } from "@/lib/i18n";
import {
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
} from "@/components/ui-primitives";
import styles from "./procedure-explorer.module.css";

type ProcedureFilter = "ALL" | ProcedureType;

interface ProcedureResponse {
  available?: boolean;
  procedures?: Procedure[];
  truncated?: boolean;
}

const MAX_RENDERED_PROCEDURES = 60;
const MAX_RENDERED_LEGS = 24;

function normalizeAirport(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeDesignator(value: string): string {
  return value.trim().toUpperCase();
}

function runwayLabel(procedure: Procedure): string {
  const { kind, runwayDesignators } = procedure.runwayApplicability;
  if (kind === "ALL") return "ALL";
  if (kind === "UNKNOWN") return "UNKNOWN";
  const prefix = kind === "EXCLUDE" ? "EXCEPT " : "";
  return prefix + (runwayDesignators.length ? runwayDesignators.join(", ") : "—");
}

function pointLabel(point: ProcedurePoint | null): string {
  if (!point) return "—";
  return point.name || point.id;
}

function pointRadarHref(point: ProcedurePoint | null) {
  if (!point?.coordinates || (point.kind !== "FIX" && point.kind !== "NAVAID")) return null;
  const focus = `${point.kind}:${point.id}:${point.coordinates.lat}:${point.coordinates.lon}`;
  return { pathname: "/", query: { navPoint: focus } } as const;
}

function sourceLabel(procedure: Procedure): string {
  return [
    procedure.source.provider,
    procedure.source.countryCode,
    procedure.source.effectiveDate,
    procedure.source.airacCycle ? `AIRAC ${procedure.source.airacCycle}` : null,
  ].filter(Boolean).join(" · ");
}

export function ProcedureExplorer() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Procedure Explorer",
    subtitle: "Publikované SID/STAR procedury podle letiště, typu a designatoru bez inferování skutečně letěné procedury.",
    back: "Zpět na radar",
    airport: "Letiště ICAO",
    type: "Typ",
    designator: "Designator",
    designatorHint: "volitelné",
    search: "Načíst procedury",
    invalidAirport: "ICAO letiště musí mít přesně čtyři písmena.",
    procedures: "Procedury",
    sids: "SID",
    stars: "STAR",
    discontinuities: "Discontinuity",
    results: "Publikované procedury",
    resultsDescription: "Výsledky stávajícího bounded procedure API. Zobrazení je dále omezeno na 60 procedur.",
    loading: "Načítám procedury…",
    unavailable: "Procedure dataset je dočasně nedostupný.",
    empty: "Pro tento filtr nejsou dostupné žádné publikované procedury.",
    legs: "Legy",
    transition: "Transition",
    runway: "Runway applicability",
    source: "Zdroj",
    airportDetail: "Detail letiště",
    sequence: "Sekvence",
    from: "Od",
    to: "Do",
    course: "Kurz",
    moreLegs: "Další legy nejsou v tomto bounded UI zobrazeny.",
    truncated: "API odpověď dosáhla serverového limitu 200 výsledků.",
    disclosure: "Tato stránka zobrazuje publikované procedure reference. Neurčuje, kterou SID/STAR letadlo skutečně letí, a nemění Route Intelligence ani runway inference.",
  } : {
    title: "Procedure Explorer",
    subtitle: "Published SID/STAR procedures by airport, type and designator without inferring the actually flown procedure.",
    back: "Back to radar",
    airport: "Airport ICAO",
    type: "Type",
    designator: "Designator",
    designatorHint: "optional",
    search: "Load procedures",
    invalidAirport: "Airport ICAO must contain exactly four letters.",
    procedures: "Procedures",
    sids: "SID",
    stars: "STAR",
    discontinuities: "Discontinuities",
    results: "Published procedures",
    resultsDescription: "Results from the existing bounded procedure API. Rendering is additionally capped at 60 procedures.",
    loading: "Loading procedures…",
    unavailable: "The procedure dataset is temporarily unavailable.",
    empty: "No published procedure is available for this filter.",
    legs: "Legs",
    transition: "Transition",
    runway: "Runway applicability",
    source: "Source",
    airportDetail: "Airport detail",
    sequence: "Sequence",
    from: "From",
    to: "To",
    course: "Course",
    moreLegs: "Additional legs are not rendered in this bounded UI.",
    truncated: "The API response reached the server cap of 200 results.",
    disclosure: "This page displays published procedure references. It does not determine which SID/STAR an aircraft is actually flying and does not alter Route Intelligence or runway inference.",
  };

  const [airport, setAirport] = useState("");
  const [type, setType] = useState<ProcedureFilter>("ALL");
  const [designator, setDesignator] = useState("");
  const [submittedAirport, setSubmittedAirport] = useState<string | null>(null);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const visibleProcedures = procedures.slice(0, MAX_RENDERED_PROCEDURES);
  const sidCount = procedures.filter((procedure) => procedure.type === "SID").length;
  const starCount = procedures.filter((procedure) => procedure.type === "STAR").length;
  const discontinuityCount = procedures.reduce((sum, procedure) => sum + procedure.discontinuities.length, 0);

  async function loadProcedures(targetAirport: string): Promise<void> {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setFailed(false);
    setProcedures([]);
    setTruncated(false);

    const params = new URLSearchParams({ airport: targetAirport });
    if (type !== "ALL") params.set("type", type);
    const normalizedDesignator = normalizeDesignator(designator);
    if (normalizedDesignator) params.set("designator", normalizedDesignator);

    try {
      const response = await fetch(`/api/procedures?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("procedures unavailable");
      const payload = await response.json() as ProcedureResponse;
      if (!controller.signal.aborted) {
        setProcedures(Array.isArray(payload.procedures) ? payload.procedures : []);
        setTruncated(payload.truncated === true);
        setFailed(payload.available === false);
      }
    } catch (error) {
      if (!controller.signal.aborted && (error as Error).name !== "AbortError") setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const targetAirport = normalizeAirport(airport);
    if (!/^[A-Z]{4}$/.test(targetAirport)) {
      setValidation(copy.invalidAirport);
      return;
    }
    setValidation(null);
    setAirport(targetAirport);
    setSubmittedAirport(targetAirport);
    const params = new URLSearchParams({ airport: targetAirport });
    if (type !== "ALL") params.set("type", type);
    const normalizedDesignator = normalizeDesignator(designator);
    if (normalizedDesignator) params.set("designator", normalizedDesignator);
    window.history.replaceState(null, "", `/procedures?${params.toString()}`);
    void loadProcedures(targetAirport);
  }

  return (
    <main className={styles.page} data-testid="procedure-explorer-v1">
      <PageHeader
        kicker="AIRRADAR · PUBLISHED PROCEDURES"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
      />

      <Panel className={styles.controlsPanel}>
        <form className={styles.form} onSubmit={submit}>
          <label>
            <span>{copy.airport}</span>
            <input value={airport} onChange={(event) => setAirport(event.target.value.toUpperCase())} maxLength={4} placeholder="LKPR" autoComplete="off" spellCheck={false} />
          </label>
          <label>
            <span>{copy.type}</span>
            <SegmentedControl role="tablist" aria-label={copy.type}>
              {(["ALL", "SID", "STAR"] as const).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={type === item} className={type === item ? "active" : ""} onClick={() => setType(item)}>
                  {item}
                </button>
              ))}
            </SegmentedControl>
          </label>
          <label>
            <span>{copy.designator} · {copy.designatorHint}</span>
            <input value={designator} onChange={(event) => setDesignator(event.target.value.toUpperCase())} maxLength={16} placeholder="VLM1A" autoComplete="off" spellCheck={false} />
          </label>
          <button className={styles.submit} type="submit" disabled={loading}>{copy.search}</button>
        </form>
        {validation ? <p className={styles.validation}>{validation}</p> : null}
      </Panel>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={submittedAirport ?? "—"} label={copy.airport} />
        <MetricCard value={submittedAirport ? formatNumber(procedures.length) : "—"} label={copy.procedures} detail={truncated ? "API ≤ 200" : "UI ≤ 60"} />
        <MetricCard value={submittedAirport ? formatNumber(sidCount) : "—"} label={copy.sids} />
        <MetricCard value={submittedAirport ? formatNumber(starCount) : "—"} label={copy.stars} />
        <MetricCard value={submittedAirport ? formatNumber(discontinuityCount) : "—"} label={copy.discontinuities} />
      </MetricStrip>

      <Panel>
        <SectionHeader
          kicker="SID / STAR"
          title={copy.results}
          description={copy.resultsDescription}
          actions={<div className={styles.actions}>
            {submittedAirport ? <Link href={{ pathname: `/airports/${submittedAirport}` }}>{copy.airportDetail}</Link> : null}
            <StatusBadge variant={failed ? "warning" : procedures.length ? "success" : "neutral"}>{failed ? "UNAVAILABLE" : loading ? "LOADING" : submittedAirport ? "PUBLISHED" : "READY"}</StatusBadge>
          </div>}
        />

        {loading ? <p className={styles.status}>{copy.loading}</p> : failed ? (
          <EmptyState title={copy.unavailable} />
        ) : submittedAirport && visibleProcedures.length ? (
          <div className={styles.procedureList}>
            {visibleProcedures.map((procedure) => (
              <details key={procedure.id} className={styles.procedure}>
                <summary>
                  <span>
                    <strong>{procedure.designator}</strong>
                    <small>{procedure.type}{procedure.transition ? ` · ${copy.transition} ${procedure.transition}` : ""}</small>
                  </span>
                  <span>
                    <b>{formatNumber(procedure.legs.length)} {copy.legs}</b>
                    <StatusBadge variant={procedure.discontinuities.length ? "warning" : "neutral"}>{formatNumber(procedure.discontinuities.length)} DISC</StatusBadge>
                  </span>
                </summary>
                <div className={styles.procedureMeta}>
                  <span>{copy.runway}: <strong>{runwayLabel(procedure)}</strong></span>
                  <span>{copy.source}: <strong>{sourceLabel(procedure) || procedure.source.reference}</strong></span>
                </div>
                <div className={styles.legs}>
                  <div className={styles.legHeader}><span>{copy.sequence}</span><span>{copy.from}</span><span>{copy.to}</span><span>{copy.course}</span></div>
                  {[...procedure.legs].sort((left, right) => left.sequence - right.sequence).slice(0, MAX_RENDERED_LEGS).map((leg) => {
                    const fromHref = pointRadarHref(leg.from);
                    const toHref = pointRadarHref(leg.to);
                    return (
                      <div className={styles.leg} key={`${procedure.id}:${leg.sequence}`}>
                        <span>{formatNumber(leg.sequence)} · {leg.type}</span>
                        <span>{fromHref ? <Link href={fromHref}>{pointLabel(leg.from)}</Link> : pointLabel(leg.from)}</span>
                        <span>{toHref ? <Link href={toHref}>{pointLabel(leg.to)}</Link> : pointLabel(leg.to)}</span>
                        <span>{leg.courseDeg === null ? "—" : `${formatNumber(leg.courseDeg, 0)}°`}</span>
                      </div>
                    );
                  })}
                </div>
                {procedure.legs.length > MAX_RENDERED_LEGS ? <p className={styles.note}>{copy.moreLegs}</p> : null}
                {procedure.remarks ? <p className={styles.note}>{procedure.remarks}</p> : null}
              </details>
            ))}
          </div>
        ) : submittedAirport ? <EmptyState title={copy.empty} /> : <EmptyState title={copy.search} description="ICAO · SID / STAR" />}

        {truncated ? <p className={styles.warning}>{copy.truncated}</p> : null}
        {procedures.length > MAX_RENDERED_PROCEDURES ? <p className={styles.note}>{formatNumber(procedures.length - MAX_RENDERED_PROCEDURES)} additional procedures are not rendered.</p> : null}
      </Panel>

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
