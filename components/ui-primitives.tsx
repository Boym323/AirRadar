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

export function UiIcon({ name }: { name: "close" | "back" | "play" | "pause" | "layers" }) {
  const paths = {
    close: "M6 6 18 18M18 6 6 18",
    back: "m11 5-7 7 7 7M4 12h16",
    play: "m8 5 10 7-10 7Z",
    pause: "M7 5v14M17 5v14",
    layers: "m12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4",
  } as const;
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export type StatusBadgeVariant = "neutral" | "live" | "success" | "warning" | "danger" | "stale" | "demo";

export function StatusBadge({ variant = "neutral", children, className = "", ...props }: PrimitiveProps & { variant?: StatusBadgeVariant } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`status-badge status-badge-${variant} ${className}`.trim()} {...props}><span className="status-badge-dot" aria-hidden="true" />{children}</span>;
}
