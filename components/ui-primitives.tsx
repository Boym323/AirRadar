import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

type PrimitiveProps = { children: ReactNode; className?: string };

export function PageHeader({
  title,
  kicker,
  description,
  backLink,
  actions,
  className = "",
  ...props
}: {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  backLink?: ReactNode;
  actions?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <header className={`ui-page-header ${className}`.trim()} {...props}>
      <div className="ui-page-header-main">
        {backLink ? <div className="ui-page-header-back">{backLink}</div> : null}
        {kicker ? <div className="ui-kicker">{kicker}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function MetricStrip({ children, className = "", ...props }: PrimitiveProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-metric-strip ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  ...props
}: PrimitiveProps & HTMLAttributes<HTMLElement>) {
  return (
    <section className={`ui-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function Card({
  children,
  className = "",
  interactive = false,
  ...props
}: PrimitiveProps &
  HTMLAttributes<HTMLElement> & {
    interactive?: boolean;
  }) {
  return (
    <section
      className={`ui-card ${interactive ? "ui-card-interactive" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  kicker,
  description,
  actions,
  className = "",
  ...props
}: {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-section-header ${className}`.trim()} {...props}>
      <div className="ui-section-heading">
        {kicker ? <div className="ui-kicker">{kicker}</div> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-section-actions">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  value,
  label,
  detail,
  className = "",
  ...props
}: {
  value: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <article className={`ui-metric-card ${className}`.trim()} {...props}>
      <strong className="ui-metric-value">{value}</strong>
      <span className="ui-metric-label">{label}</span>
      {detail ? <small className="ui-metric-detail">{detail}</small> : null}
    </article>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "compact" | "default";

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  PrimitiveProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }) {
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function SegmentedControl({
  children,
  className = "",
  ...props
}: PrimitiveProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-segmented-control ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className = "",
  ...props
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-empty-state ${className}`.trim()} {...props}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}

export function MapControl({
  children,
  className = "",
  as: Component = "div",
  ...props
}: PrimitiveProps & { as?: "div" | "summary" } & HTMLAttributes<HTMLElement>) {
  return (
    <Component className={`map-control ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export function MapControlGroup({
  children,
  className = "",
  ...props
}: PrimitiveProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`map-control-group ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function IconButton({
  children,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & PrimitiveProps) {
  return (
    <button
      type={type}
      className={`icon-button ui-icon-button ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function UiIcon({
  name,
}: {
  name: "close" | "back" | "play" | "pause" | "layers" | "search" | "aircraft" | "airport" | "waypoint" | "radar" | "flight" | "statistics" | "time" | "atc" | "system" | "home" | "more";
}) {
  const paths = {
    close: "M6 6 18 18M18 6 6 18",
    back: "m11 5-7 7 7 7M4 12h16",
    play: "m8 5 10 7-10 7Z",
    pause: "M7 5v14M17 5v14",
    layers: "m12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4",
    search: "m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
    aircraft: "m12 3 2 7 6 3v2l-6-1v7h-4v-7l-6 1v-2l6-3 2-7Z",
    airport: "M3 21h18M6 18h12M5 14h14M12 3v11M8 7l4-4 4 4",
    waypoint: "M12 3v18M3 12h18M6 6l12 12M18 6 6 18",
    radar: "M4 12a8 8 0 0 1 16 0M7 12a5 5 0 0 1 10 0M12 12l6-6M12 12h.01",
    flight: "m3 12 7-2 3-7 2 1-1 6 7 2v2l-7 1 1 6-2 1-3-7-7-2v-2Z",
    statistics: "M5 19V9M12 19V5M19 19v-7",
    time: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    atc: "M12 3v18M3 12h18M6 6l12 12M18 6 6 18",
    system: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    home: "M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3V10.5Z",
    more: "M5 12h.1M12 12h.1M19 12h.1",
  } as const;
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export type StatusBadgeVariant =
  | "neutral"
  | "live"
  | "success"
  | "warning"
  | "danger"
  | "stale"
  | "demo";

export type ContextBadgeVariant = "observed" | "inferred" | "likely" | "possible";

export function ContextBadge({
  variant = "observed",
  children,
  className = "",
  ...props
}: PrimitiveProps & { variant?: ContextBadgeVariant } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`context-badge context-badge-${variant} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export function StatusBadge({
  variant = "neutral",
  children,
  className = "",
  ...props
}: PrimitiveProps &
  { variant?: StatusBadgeVariant } &
  HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`status-badge status-badge-${variant} ${className}`.trim()}
      {...props}
    >
      <span className="status-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
