import type { ReactNode } from "react";

export interface RadarTrafficHeroProps {
  sourceLabel: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
  altitude: ReactNode;
  speed: ReactNode;
  track: ReactNode;
  verticalRate: ReactNode;
  className?: string;
  showIdentity?: boolean;
}

function metricState(value: ReactNode): "available" | "missing" {
  return value === null || value === undefined || value === "—" ? "missing" : "available";
}

/** Shared live-traffic header semantics. Data-specific sections remain below it. */
export function RadarTrafficHero({ sourceLabel, primaryLabel, secondaryLabel, altitude, speed, track, verticalRate, className = "", showIdentity = true }: RadarTrafficHeroProps) {
  return <section className={`radar-traffic-hero ${className}`.trim()} data-testid="radar-traffic-hero" aria-label={`${sourceLabel} ${primaryLabel}`}>
    <span className="source-badge source-badge-prominent" data-testid="radar-traffic-hero-source">{sourceLabel}</span>
    {showIdentity && <h2 className="radar-traffic-hero-primary" data-testid="radar-traffic-hero-primary">{primaryLabel}</h2>}
    {showIdentity && secondaryLabel && <p className="radar-traffic-hero-secondary">{secondaryLabel}</p>}
    <div className="radar-traffic-hero-metrics" data-testid="radar-traffic-hero-metrics" aria-label="Live traffic metrics">
      <div data-testid="radar-traffic-hero-metric-altitude" data-state={metricState(altitude)}><strong>{altitude}</strong><span>Altitude</span></div>
      <div data-testid="radar-traffic-hero-metric-speed" data-state={metricState(speed)}><strong>{speed}</strong><span>Speed</span></div>
      <div data-testid="radar-traffic-hero-metric-track" data-state={metricState(track)}><strong>{track}</strong><span>Track</span></div>
      <div data-testid="radar-traffic-hero-metric-vertical-rate" data-state={metricState(verticalRate)}><strong>{verticalRate}</strong><span>V/S</span></div>
    </div>
  </section>;
}
