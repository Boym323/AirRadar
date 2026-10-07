"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNumber, t } from "@/lib/i18n";
import {
  TRAFFIC_PROFILE_RANGES,
  type TrafficProfileRange,
  type TrafficProfileResponse,
} from "@/lib/statistics-traffic-profile";
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
import {
  busiestHour,
  busiestWeekday,
  quietestHour,
} from "./traffic-rhythm-metrics";
import styles from "./traffic-rhythm.module.css";

function hourLabel(hour: number): string {
  const next = (hour + 1) % 24;
  return String(hour).padStart(2, "0") + ":00–" + String(next).padStart(2, "0") + ":00";
}

function weekdayLabel(weekday: number, cs: boolean): string {
  const labels = cs
    ? ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels[weekday - 1] ?? "—";
}

function Bar({
  value,
  maximum,
  label,
}: {
  value: number;
  maximum: number;
  label: string;
}) {
  const height = maximum <= 0 ? 0 : Math.max(value > 0 ? 4 : 0, (value / maximum) * 100);
  return (
    <div className={styles.barItem} title={label + " · " + value}>
      <div className={styles.barTrack} aria-hidden="true">
        <span style={{ height: height + "%" }} />
      </div>
      <small>{label}</small>
      <b>{formatNumber(value)}</b>
    </div>
  );
}

export function TrafficRhythmAnalytics() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Rytmus provozu",
    subtitle: "Časový profil receiver-observed Flight instancí podle canonical Flight.startTime.",
    back: "Zpět na radar",
    statistics: "Statistiky",
    range: "Období",
    observed: "Pozorované lety",
    busiestHour: "Nejvytíženější hodina",
    quietestHour: "Nejklidnější hodina",
    busiestWeekday: "Nejvytíženější den",
    hourly: "Hodinový profil",
    hourlyDescription: "24 lokálních hodin; každý persisted Flight se započítá podle Flight.startTime.",
    weekdays: "Profil dnů v týdnu",
    weekdaysDescription: "ISO dny 1–7 (pondělí až neděle) ve stejné aplikační timezone.",
    flights: "pozorovaných letů",
    loading: "Načítám časový profil…",
    unavailable: "Traffic profile je dočasně nedostupný.",
    empty: "Pro zvolené období nejsou uložené Flight instance.",
    disclosure: "Pouze receiver-observed persisted Flight instance. Buckety používají Flight.startTime, stejně jako existující traffic statistics/history vrstva. Nejde o positions/min, message throughput ani počet současně aktivních letadel.",
  } : {
    title: "Traffic Rhythm",
    subtitle: "Time profile of receiver-observed Flight instances by canonical Flight.startTime.",
    back: "Back to radar",
    statistics: "Statistics",
    range: "Range",
    observed: "Observed flights",
    busiestHour: "Busiest hour",
    quietestHour: "Quietest hour",
    busiestWeekday: "Busiest weekday",
    hourly: "Hourly profile",
    hourlyDescription: "24 local hours; every persisted Flight is counted by Flight.startTime.",
    weekdays: "Weekday profile",
    weekdaysDescription: "ISO weekdays 1–7 (Monday through Sunday) in the same application timezone.",
    flights: "observed flights",
    loading: "Loading traffic profile…",
    unavailable: "Traffic profile is temporarily unavailable.",
    empty: "No persisted Flight instances exist for the selected period.",
    disclosure: "Receiver-observed persisted Flight instances only. Buckets use Flight.startTime, matching the existing traffic statistics/history layer. This is not positions/minute, message throughput, or concurrent aircraft count.",
  };

  const [range, setRange] = useState<TrafficProfileRange>("7d");
  const [data, setData] = useState<TrafficProfileResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    void fetch("/api/statistics/traffic-profile?range=" + range, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("traffic profile unavailable");
        return response.json() as Promise<TrafficProfileResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setData(payload);
          setFailed(payload.source === "unavailable");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && (error as Error).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [range]);

  const busyHour = useMemo(() => busiestHour(data?.hourly ?? []), [data]);
  const quietHour = useMemo(() => quietestHour(data?.hourly ?? []), [data]);
  const busyDay = useMemo(() => busiestWeekday(data?.weekdays ?? []), [data]);
  const hourlyMax = Math.max(1, ...(data?.hourly.map((item) => item.count) ?? [0]));
  const weekdayMax = Math.max(1, ...(data?.weekdays.map((item) => item.count) ?? [0]));
  const unavailable = failed || data?.source === "unavailable";
  const zeroData = data?.source === "postgres" && data.observedFlights === 0;

  return (
    <main className={styles.page} data-testid="traffic-rhythm-analytics-v1">
      <PageHeader
        kicker="AIRRADAR · TRAFFIC ANALYTICS"
        title={copy.title}
        description={copy.subtitle}
        backLink={<Link className="back-link" href="/">{copy.back}</Link>}
        actions={<Link className="back-link" href="/statistics">{copy.statistics}</Link>}
      />

      <div className={styles.controls}>
        <span>{copy.range}</span>
        <SegmentedControl role="tablist" aria-label={copy.range}>
          {TRAFFIC_PROFILE_RANGES.map((item) => <button key={item} type="button" role="tab" aria-selected={range === item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item === "7d" ? (cs ? "7 dní" : "7 days") : (cs ? "30 dní" : "30 days")}</button>)}
        </SegmentedControl>
      </div>

      <MetricStrip className={styles.metrics}>
        <MetricCard value={data?.observedFlights === null || !data ? "—" : formatNumber(data.observedFlights)} label={copy.observed} detail={data ? data.timezone : undefined} />
        <MetricCard value={busyHour ? hourLabel(busyHour.hour) : "—"} label={copy.busiestHour} detail={busyHour ? formatNumber(busyHour.count) + " " + copy.flights : undefined} />
        <MetricCard value={quietHour ? hourLabel(quietHour.hour) : "—"} label={copy.quietestHour} detail={quietHour ? formatNumber(quietHour.count) + " " + copy.flights : undefined} />
        <MetricCard value={busyDay ? weekdayLabel(busyDay.weekday, cs) : "—"} label={copy.busiestWeekday} detail={busyDay ? formatNumber(busyDay.count) + " " + copy.flights : undefined} />
      </MetricStrip>

      {unavailable ? <EmptyState title={copy.unavailable} /> : !data ? <p className={styles.status}>{copy.loading}</p> : zeroData ? <EmptyState title={copy.empty} /> : (
        <div className={styles.grid}>
          <Panel>
            <SectionHeader
              kicker="00–23"
              title={copy.hourly}
              description={copy.hourlyDescription}
              actions={<StatusBadge variant="success">FLIGHT.STARTTIME</StatusBadge>}
            />
            <div className={styles.hourChart} role="img" aria-label={copy.hourly}>
              {data.hourly.map((item) => <Bar key={item.hour} value={item.count} maximum={hourlyMax} label={String(item.hour).padStart(2, "0")} />)}
            </div>
          </Panel>

          <Panel>
            <SectionHeader kicker="ISO 1–7" title={copy.weekdays} description={copy.weekdaysDescription} />
            <div className={styles.weekChart} role="img" aria-label={copy.weekdays}>
              {data.weekdays.map((item) => <Bar key={item.weekday} value={item.count} maximum={weekdayMax} label={weekdayLabel(item.weekday, cs)} />)}
            </div>
          </Panel>
        </div>
      )}

      <p className={styles.disclosure}>{copy.disclosure}</p>
    </main>
  );
}
