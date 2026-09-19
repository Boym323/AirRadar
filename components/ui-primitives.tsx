import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type PrimitiveProps = { children: ReactNode; className?: string };

export function Panel({ children, className = "", ...props }: PrimitiveProps & HTMLAttributes<HTMLElement>) {
  return <section className={`ui-panel ${className}`.trim()} {...props}>{children}</section>;
}

export function MapControl({ children, className = "", as: Component = "div", ...props }: PrimitiveProps & { as?: "div" | "summary" } & HTMLAttributes<HTMLElement>) {
  return <Component className={`map-control ${className}`.trim()} {...props}>{children}</Component>;
}

export function MapControlGroup({ children, className = "", ...props }: PrimitiveProps & HTMLAttributes<HTMLDivElement>) {
  return <div className={`map-control-group ${className}`.trim()} {...props}>{children}</div>;
}

export function IconButton({ children, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & PrimitiveProps) {
  return <button type={type} className={`icon-button ui-icon-button ${className}`.trim()} {...props}>{children}</button>;
}

export type StatusBadgeVariant = "neutral" | "live" | "success" | "warning" | "danger" | "stale" | "demo";

export function StatusBadge({ variant = "neutral", children, className = "", ...props }: PrimitiveProps & { variant?: StatusBadgeVariant } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`status-badge status-badge-${variant} ${className}`.trim()} {...props}><span className="status-badge-dot" aria-hidden="true" />{children}</span>;
}
