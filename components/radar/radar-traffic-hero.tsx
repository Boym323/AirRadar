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
}

/** Shared live-traffic header semantics. Data-specific sections remain below it. */
export function RadarTrafficHero({ sourceLabel, primaryLabel, secondaryLabel, altitude, speed, track, verticalRate, className = "" }: RadarTrafficHeroProps) {
  return <section className={`radar-traffic-hero ${className}`.trim()} aria-label={`${sourceLabel} ${primaryLabel}`}>
    <span className="source-badge source-badge-prominent">{sourceLabel}</span>
    <h2 className="radar-traffic-hero-primary">{primaryLabel}</h2>
    {secondaryLabel && <p className="radar-traffic-hero-secondary">{secondaryLabel}</p>}
    <div className="radar-traffic-hero-metrics">
      <div><strong>{altitude}</strong><span>Altitude</span></div>
      <div><strong>{speed}</strong><span>Speed</span></div>
      <div><strong>{track}</strong><span>Track</span></div>
      <div><strong>{verticalRate}</strong><span>V/S</span></div>
    </div>
  </section>;
}
