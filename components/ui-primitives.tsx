import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

type PrimitiveProps = { children: ReactNode; className?: string };

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
  name: "close" | "back" | "play" | "pause" | "layers" | "search" | "aircraft" | "airport" | "waypoint";
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
