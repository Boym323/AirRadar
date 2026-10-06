import type { AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";
import { formatTime, t } from "@/lib/i18n";
import { StatusBadge } from "@/components/ui-primitives";
import styles from "./radar-operational-focus-summary.module.css";

function offsetLabel(minutes: number): string {
  if (minutes <= 0.05) return "NOW";
  return `+${Math.round(minutes * 10) / 10} min`;
}

export function RadarOperationalFocusSummary({
  focus,
  activeItemId,
  onFocus,
}: {
  focus: AircraftOperationalFocusSummary;
  activeItemId: string | null;
  onFocus: (itemId: string) => void;
}) {
  const hiddenCount = Math.max(0, focus.items.length - 4);
  const visibleItems = focus.items.slice(0, 4);

  return (
    <section className={styles.section} aria-labelledby="aircraft-quick-operational-focus-title" data-testid="aircraft-operational-focus-drawer">
      <div className={styles.heading}>
        <div>
          <span>{t.operationalTwin.kicker}</span>
          <h2 id="aircraft-quick-operational-focus-title">{t.operationalTwin.operationalFocusTitle}</h2>
        </div>
        <StatusBadge variant={focus.level === "ATTENTION" ? "danger" : focus.level === "WATCH" ? "warning" : "neutral"}>
          {t.operationalTwin.operationalFocusLevel[focus.level]}
        </StatusBadge>
      </div>

      <div className={styles.summary}>
        <span>{t.operationalTwin.operationalFocusSummary(focus.attention, focus.watch)}</span>
        {focus.truncated ? <small>{t.operationalTwin.operationalFocusTruncated}</small> : null}
      </div>

      {visibleItems.length ? (
        <div className={styles.items}>
          {visibleItems.map((item) => {
            const active = activeItemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={styles.item}
                data-level={item.level}
                aria-pressed={active}
                onClick={() => onFocus(item.id)}
              >
                <span className={styles.itemLead}>
                  <strong>{offsetLabel(item.offsetMinutes)}</strong>
                  <small>{formatTime(item.at)}</small>
                </span>
                <span className={styles.itemBody}>
                  <span className={styles.itemMeta}>
                    <b>{t.operationalTwin.operationalFocusTypes[item.type]}</b>
                    <small>{t.operationalTwin.confidence[item.confidence]}</small>
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.source}{item.sourceReference ? ` · ${item.sourceReference}` : ""}</small>
                  <em>{active ? t.operationalTwin.operationalFocusDrawerActive : t.operationalTwin.operationalFocusDrawerMapAction}</em>
                </span>
              </button>
            );
          })}
          {hiddenCount > 0 ? <small className={styles.more}>{t.operationalTwin.operationalFocusDrawerMore(hiddenCount)}</small> : null}
        </div>
      ) : (
        <p className={styles.empty}>{t.operationalTwin.operationalFocusNoItems}</p>
      )}

      <p className={styles.disclaimer}>{t.operationalTwin.operationalFocusDisclaimer}</p>
    </section>
  );
}
