"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GlobalSearch } from "@/components/global-search";
import { t } from "@/lib/i18n";

function LogoMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" opacity=".32" />
      <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      <path d="M20 20 33 7" stroke="#f3b95f" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

const primaryNavigation = [
  { href: "/", label: t.radar.liveAirPicture },
  { href: "/history", label: t.history.title },
  { href: "/statistics", label: t.statistics.title },
  { href: "/fleet", label: t.fleet.title },
] as const;

const moreNavigation = [
  { href: "/alerts", label: t.alerts.title },
  { href: "/recap/daily", label: t.recap.daily },
  { href: "/recap/weekly", label: t.recap.weekly },
  { href: "/watchlist", label: t.watchlist.title },
  { href: "/system", label: t.system.title },
] as const;

function pathMatches(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function isMorePath(pathname: string): boolean {
  return moreNavigation.some(({ href }) => pathMatches(pathname, href))
    || ["/aircraft", "/airports", "/flights"].some((prefix) => pathname.startsWith(prefix));
}

export function AirRadarTopbar({ heading = false, meta }: { heading?: boolean; meta?: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link className="brand brand-link" href="/" aria-label="AirRadar">
        <LogoMark />
        <span>
          {heading ? <h1 className="brand-title">AirRadar</h1> : <span className="brand-title">AirRadar</span>}
          <span className="brand-subtitle">{t.brand.subtitle}</span>
        </span>
      </Link>
      <GlobalSearch />
      <nav className="topbar-nav" aria-label={t.statistics.navigation}>
        {primaryNavigation.map(({ href, label }) => {
          const active = pathMatches(pathname, href);
          return <Link key={href} className={`topbar-nav-primary ${active ? "active" : ""}`} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
        })}
        <details className="topbar-nav-more">
          <summary className={isMorePath(pathname) ? "active" : undefined}>{t.common.more}</summary>
          <div>
            {moreNavigation.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
          </div>
        </details>
      </nav>
      {meta ? <div className="topbar-meta">{meta}</div> : null}
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const moreActive = isMorePath(pathname);
  return (
    <nav className="mobile-bottom-nav" aria-label={t.statistics.navigation}>
      <Link className={pathMatches(pathname, "/") ? "active" : ""} href="/" aria-current={pathMatches(pathname, "/") ? "page" : undefined}>
        <span className="mobile-bottom-nav-icon" aria-hidden="true">⌁</span>
        <span>{t.radar.liveAirPicture}</span>
      </Link>
      <Link className={pathMatches(pathname, "/history") ? "active" : ""} href="/history" aria-current={pathMatches(pathname, "/history") ? "page" : undefined}>
        <span className="mobile-bottom-nav-icon" aria-hidden="true">◷</span>
        <span>{t.history.title}</span>
      </Link>
      <Link className={pathMatches(pathname, "/statistics") ? "active" : ""} href="/statistics" aria-current={pathMatches(pathname, "/statistics") ? "page" : undefined}>
        <span className="mobile-bottom-nav-icon" aria-hidden="true">▥</span>
        <span>{t.statistics.title}</span>
      </Link>
      <details className="mobile-bottom-more">
        <summary className={moreActive ? "active" : undefined}>
          <span className="mobile-bottom-nav-icon" aria-hidden="true">⋯</span>
          <span>{t.common.more}</span>
        </summary>
        <div>
          <Link href="/fleet">{t.fleet.title}</Link>
          <Link href="/alerts">{t.alerts.title}</Link>
          <Link href="/recap/daily">{t.recap.daily}</Link>
          <Link href="/recap/weekly">{t.recap.weekly}</Link>
          <Link href="/watchlist">{t.watchlist.title}</Link>
          <Link href="/system">{t.system.title}</Link>
        </div>
      </details>
    </nav>
  );
}

export function AirRadarPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="radar-shell airradar-page-shell">
      <AirRadarTopbar />
      <div className="secondary-page-content">{children}</div>
      <MobileBottomNav />
    </div>
  );
}
