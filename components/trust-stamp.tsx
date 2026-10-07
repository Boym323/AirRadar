import { trustFreshness, type TrustProvenance } from "@/lib/trust-provenance";
import { t } from "@/lib/i18n";
import styles from "./trust-stamp.module.css";

export function TrustStamp({
  provenance,
  compact = false,
}: {
  provenance: TrustProvenance;
  compact?: boolean;
}) {
  const freshness = trustFreshness(provenance.observedAt, new Date(), provenance.staleAfterMs);
  const cs = t.locale.startsWith("cs");
  const freshnessLabel = freshness.state === "FRESH" ? (cs ? "ČERSTVÉ" : "FRESH")
    : freshness.state === "STALE" ? (cs ? "STARŠÍ" : "STALE")
    : null;
  const title = [
    "Evidence",
    provenance.kind,
    provenance.source,
    freshnessLabel,
    provenance.confidence,
  ].filter(Boolean).join(" · ");
  const className = [
    styles.stamp,
    styles[provenance.kind.toLowerCase()],
    compact ? styles.compact : "",
  ].filter(Boolean).join(" ");

  return <span className={className} title={title} data-trust-kind={provenance.kind}>
    <strong>{provenance.kind}</strong>
    <span>{provenance.source}</span>
    {!compact && freshnessLabel ? <small className={styles[freshness.state.toLowerCase()]}>{freshnessLabel}</small> : null}
    {!compact && provenance.confidence ? <small>{provenance.confidence}</small> : null}
  </span>;
}
