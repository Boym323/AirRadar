"use client";

import type { LocaleDictionary } from "@/lib/i18n";
import { formatNumber, formatDateTime } from "@/lib/i18n";
import type { RouteEnrichmentSnapshot, RouteMetricBucket } from "@/lib/server/route-enrichment-telemetry";
import { Card } from "@/components/ui-primitives";
import styles from "./route-enrichment-panel.module.css";

function count(value: number, dictionary: LocaleDictionary) {
  return formatNumber(value, 0, dictionary.locale);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><dt>{label}</dt><dd>{value}</dd></div>;
}

/** Each bar is one actual UTC hour; empty periods are never backfilled with guesses. */
function HourBar({ bucket, maximum, locale, labels }: {
  bucket: RouteMetricBucket;
  maximum: number;
  locale: string;
  labels: LocaleDictionary["system"]["routeEnrichment"];
}) {
  const ram = bucket.ramHit;
  const db = bucket.dbHit;
  const external = bucket.adsbdbLookup + bucket.adsblolLookup;
  const label = new Intl.DateTimeFormat(locale, { hour: "2-digit", day: "2-digit", month: "2-digit", timeZone: "UTC" })
    .format(new Date(bucket.hour));
  const scale = (value: number) => value === 0 ? "0%" : Math.max(1, (value / maximum) * 100).toFixed(2) + "%";
  const full = label + " UTC — " + labels.chartRam + ": " + ram + ", " + labels.chartDb
    + ": " + db + ", " + labels.chartExternal + ": " + external;
  return <div className={styles.hour} title={full} role="img" aria-label={full}>
    <div className={styles.stacked} aria-hidden="true">
      <div className={styles.external} style={{ height: scale(external) }} />
      <div className={styles.db} style={{ height: scale(db) }} />
      <div className={styles.ram} style={{ height: scale(ram) }} />
    </div>
  </div>;
}

export function RouteEnrichmentPanel({ metrics, dictionary }: { metrics: RouteEnrichmentSnapshot; dictionary: LocaleDictionary }) {
  const labels = dictionary.system.routeEnrichment;
  const t = metrics.totals;
  const f = (value: number) => count(value, dictionary);
  const avg = metrics.databaseAverageLatencyMs === null
    ? labels.notAvailable
    : formatNumber(metrics.databaseAverageLatencyMs, 1, dictionary.locale) + " " + labels.latencyUnit;
  const totalSamples = metrics.buckets.reduce((sum, b) => sum + b.ramHit + b.dbHit + b.adsbdbLookup + b.adsblolLookup, 0);
  const maximum = Math.max(1, ...metrics.buckets.map(b => b.ramHit + b.dbHit + b.adsbdbLookup + b.adsblolLookup));

  return <Card className={styles.card} data-testid="route-enrichment-panel">
    <div className={styles.heading}>
      <div>
        <h2>{labels.title}</h2>
        <p>{labels.summary}</p>
      </div>
      <span className={styles.mode}>{labels.cacheStatus}: {metrics.enabled ? labels.active : labels.inactive}</span>
    </div>

    <dl className={styles.metrics}>
      <Metric label={labels.ramHits} value={f(t.ramHit)} />
      <Metric label={labels.dbHits} value={f(t.dbHit)} />
      <Metric label={labels.dbMisses} value={f(t.dbMiss)} />
      <Metric label={labels.hitRate} value={metrics.databaseHitRate === null ? labels.notAvailable : formatNumber(metrics.databaseHitRate * 100, 1, dictionary.locale) + " %"} />
      <Metric label={labels.validRoutes} value={metrics.validEntries === null ? labels.notAvailable : f(metrics.validEntries)} />
      <Metric label={labels.dbWrites} value={f(t.dbWrite)} />
      <Metric label={labels.adsbdbLookups} value={f(t.adsbdbLookup)} />
      <Metric label={labels.adsblolBatches} value={f(t.adsblolBatch)} />
      <Metric label={labels.adsblolLookups} value={f(t.adsblolLookup)} />
      <Metric label={labels.avgDbLatency} value={avg} />
      <Metric label={labels.dbErrors} value={f(t.dbError)} />
      <Metric label={labels.dbBypassed} value={f(t.dbBypassed)} />
      <Metric label={labels.adsblolErrors} value={f(t.adsblolError)} />
      <Metric label={labels.savedLookups} value={f(metrics.estimatedSavedLookups)} />
      <Metric label={labels.diskPersistence} value={metrics.telemetry.diskEnabled ? labels.diskOn : labels.diskOff} />
      <Metric label={labels.persistErrors} value={f(metrics.telemetry.failures)} />
    </dl>

    <section aria-label={labels.chartTitle} className={styles.chartSection}>
      <div className={styles.chartHeader}>
        <h3>{labels.chartTitle}</h3>
        <div className={styles.legend}>
          <span><i className={styles.ramSwatch} />{labels.chartRam}</span>
          <span><i className={styles.dbSwatch} />{labels.chartDb}</span>
          <span><i className={styles.externalSwatch} />{labels.chartExternal}</span>
        </div>
      </div>
      <div className={styles.chart} role="group" aria-label={labels.chartTitle}>
        {metrics.buckets.map(bucket => <HourBar key={bucket.hour} bucket={bucket}
          maximum={maximum} locale={dictionary.locale} labels={labels} />)}
      </div>
      <div className={styles.axis}>
        <span>{new Date(metrics.buckets[0]?.hour ?? "").toLocaleTimeString(dictionary.locale, { hour: "2-digit", timeZone: "UTC" })} UTC</span>
        <span>{new Date(metrics.buckets[23]?.hour ?? "").toLocaleTimeString(dictionary.locale, { hour: "2-digit", timeZone: "UTC" })} UTC</span>
      </div>
      <p className={styles.note}>{totalSamples === 0 ? labels.notAvailable + ". " : ""}{labels.chartNote}</p>
    </section>
    <div className={styles.foot}>
      <p>{labels.savingNote}</p>
      <p>{labels.lastCount}: {metrics.validEntriesCheckedAt ? formatDateTime(metrics.validEntriesCheckedAt, dictionary) : labels.notAvailable}</p>
    </div>
  </Card>;
}
