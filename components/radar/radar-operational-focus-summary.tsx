import type { AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";
import { formatTime, t } from "@/lib/i18n";
import { StatusBadge, UiIcon } from "@/components/ui-primitives";
import { aircraftOperationalFocusNavigation } from "@/lib/operational-twin/aircraft-operational-focus-ui";
import { aircraftOperationalFocusChangeByItem, type AircraftOperationalFocusChangeSummary } from "@/lib/operational-twin/aircraft-operational-focus-change";
import styles from "./radar-operational-focus-summary.module.css";

function offsetLabel(minutes: number): string {
  if (minutes <= 0.05) return "NOW";
  return `+${Math.round(minutes * 10) / 10} min`;
}

export function RadarOperationalFocusSummary({
  focus,
  changes,
  activeItemId,
  onFocus,
}: {
  focus: AircraftOperationalFocusSummary;
  changes: AircraftOperationalFocusChangeSummary | null;
  activeItemId: string | null;
  onFocus: (itemId: string) => void;
}) {
  const activeItem = activeItemId ? focus.items.find((item) => item.id === activeItemId) ?? null : null;
  const navigation = aircraftOperationalFocusNavigation(focus.items, activeItemId);
  const changeByItem = aircraftOperationalFocusChangeByItem(changes);
  const resolvedChanges = changes?.changes.filter((change) => change.kind === "RESOLVED").slice(0, 3) ?? [];
  const firstItems = focus.items.slice(0, 4);
  const visibleItems = activeItem && !firstItems.some((item) => item.id === activeItem.id)
    ? [...firstItems.slice(0, 3), activeItem]
    : firstItems;
  const hiddenCount = Math.max(0, focus.items.length - visibleItems.length);

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

      {changes && changes.changes.length > 0 ? (
        <div className={styles.changeSummary} data-testid="aircraft-operational-focus-changes">
          <strong>{t.operationalTwin.operationalFocusChangeTitle}</strong>
          <span>
            {[
              changes.counts.ESCALATED ? t.operationalTwin.operationalFocusChangeCount("ESCALATED", changes.counts.ESCALATED) : null,
              changes.counts.NEW ? t.operationalTwin.operationalFocusChangeCount("NEW", changes.counts.NEW) : null,
              changes.counts.UPDATED ? t.operationalTwin.operationalFocusChangeCount("UPDATED", changes.counts.UPDATED) : null,
              changes.counts.DEESCALATED ? t.operationalTwin.operationalFocusChangeCount("DEESCALATED", changes.counts.DEESCALATED) : null,
              changes.counts.RESOLVED ? t.operationalTwin.operationalFocusChangeCount("RESOLVED", changes.counts.RESOLVED) : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </div>
      ) : null}

      {focus.items.length ? (
        <div className={styles.navigation} role="group" aria-label={t.operationalTwin.operationalFocusDrawerNavigation}>
          <button
            type="button"
            className={styles.navigationButton}
            disabled={!navigation.previousItem}
            aria-label={t.operationalTwin.operationalFocusDrawerPrevious}
            onClick={() => {
              if (navigation.previousItem) onFocus(navigation.previousItem.id);
            }}
          >
            <UiIcon name="back" />
          </button>
          <span className={styles.navigationPosition}>
            {t.operationalTwin.operationalFocusDrawerPosition(
              navigation.currentIndex === null ? 0 : navigation.currentIndex + 1,
              navigation.total,
            )}
          </span>
          <button
            type="button"
            className={styles.navigationButton}
            disabled={!navigation.nextItem}
            aria-label={t.operationalTwin.operationalFocusDrawerNext}
            onClick={() => {
              if (navigation.nextItem) onFocus(navigation.nextItem.id);
            }}
          >
            <span className={styles.navigationNextIcon}><UiIcon name="back" /></span>
          </button>
        </div>
      ) : null}

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
                  {changeByItem.get(item.id) ? (
                    <span className={styles.changeBadge} data-change={changeByItem.get(item.id)?.kind}>
                      {t.operationalTwin.operationalFocusChangeKinds[changeByItem.get(item.id)!.kind]}
                    </span>
                  ) : null}
                  <strong>{item.label}</strong>
                  <small>{item.source}{item.sourceReference ? ` · ${item.sourceReference}` : ""}</small>
                  <em>{active ? t.operationalTwin.operationalFocusDrawerActive : t.operationalTwin.operationalFocusDrawerMapAction}</em>
                </span>
              </button>
            );
          })}
          {hiddenCount > 0 ? <small className={styles.more}>{t.operationalTwin.operationalFocusDrawerMore(hiddenCount)}</small> : null}
          {resolvedChanges.length > 0 ? (
            <div className={styles.resolved}>
              {resolvedChanges.map((change) => (
                <span key={change.itemId}>
                  <b>{t.operationalTwin.operationalFocusChangeKinds.RESOLVED}</b>
                  {change.previousItem?.label ?? change.itemId}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={styles.empty}>{t.operationalTwin.operationalFocusNoItems}</p>
      )}

      <p className={styles.disclaimer}>{t.operationalTwin.operationalFocusDisclaimer}</p>
    </section>
  );
}
