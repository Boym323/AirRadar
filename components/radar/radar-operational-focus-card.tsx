import { formatTime, t } from "@/lib/i18n";
import type { AircraftOperationalFocusItem } from "@/lib/operational-twin/types";
import { IconButton, Panel, StatusBadge, UiIcon } from "@/components/ui-primitives";
import styles from "./radar-operational-focus-card.module.css";

function relativeOffset(minutes: number): string {
  if (minutes <= 0.05) return "NOW";
  return `+${Math.round(minutes * 10) / 10} min`;
}

export function RadarOperationalFocusCard({
  item,
  onClear,
}: {
  item: AircraftOperationalFocusItem;
  onClear: () => void;
}) {
  return (
    <div className={styles.wrap}>
      <Panel
        className={styles.card}
        data-level={item.level}
        data-testid="radar-operational-focus-card"
        aria-label={t.operationalTwin.operationalFocusMapFocused}
      >
        <div className={styles.header}>
          <div className={styles.heading}>
            <span>{t.operationalTwin.operationalFocusMapFocused}</span>
            <StatusBadge variant={item.level === "ATTENTION" ? "danger" : "warning"}>
              {t.operationalTwin.operationalFocusLevel[item.level]}
            </StatusBadge>
          </div>
          <IconButton
            className={styles.clear}
            aria-label={t.operationalTwin.operationalFocusMapClear}
            title={t.operationalTwin.operationalFocusMapClear}
            onClick={onClear}
          >
            <UiIcon name="close" />
          </IconButton>
        </div>

        <div className={styles.body}>
          <span className={styles.type}>{t.operationalTwin.operationalFocusTypes[item.type]}</span>
          <strong>{item.label}</strong>
        </div>

        <div className={styles.meta}>
          <span>{relativeOffset(item.offsetMinutes)}</span>
          <span>{formatTime(item.at)}</span>
          <span>{t.operationalTwin.confidence[item.confidence]}</span>
        </div>

        <small className={styles.source}>
          {item.source}{item.sourceReference ? ` · ${item.sourceReference}` : ""}
        </small>
        <small className={styles.disclaimer}>{t.operationalTwin.operationalFocusMapDisclaimer}</small>
      </Panel>
    </div>
  );
}
