"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { GlobalSearch } from "@/components/global-search";
import { UiIcon } from "@/components/ui-primitives";
import { t } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";


export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="language-switch" role="group" aria-label={t.language.label} data-testid="language-switch">
      <button type="button" lang="cs" title={t.language.czech} aria-label={t.language.czech} aria-pressed={locale === "cs"} onClick={() => setLocale("cs")}>CZ</button>
      <button type="button" lang="en" title={t.language.english} aria-label={t.language.english} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    </div>
  );
}

function LogoMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" opacity=".32" />
      <circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      <path className="brand-mark-sweep" d="M20 20 33 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

function primaryNavigation() { return [
  { href: "/", label: t.radar.liveAirPicture, icon: "radar" },
  { href: "/airports", label: t.locale.startsWith("cs") ? "Letiště" : "Airports", icon: "airport" },
  { href: "/weather", label: t.locale.startsWith("cs") ? "Počasí" : "Weather", icon: "system" },
] as const; }

function moreNavigationGroups() {
  const cs = t.locale.startsWith("cs");
  return [
    { id: "aviation", label: cs ? "Letecká data" : "Aviation data", items: [
      { href: "/navigation", label: cs ? "Navigace" : "Navigation" },
      { href: "/navigation-integrity", label: cs ? "Integrita navigace" : "Navigation integrity" },
      { href: "/receiver/coverage", label: cs ? "Pokrytí přijímače" : "Receiver coverage" },
    ] },
    { id: "system", label: cs ? "Systém" : "System", items: [
      { href: "/system", label: t.system.title },
    ] },
  ] as const;
}

function MoreNavigationGroups({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return moreNavigationGroups().map((group) => (
    <div className="navigation-more-group" role="group" aria-label={group.label} key={group.id}>
      <div className="navigation-more-group-title" aria-hidden="true">{group.label}</div>
      {group.items.map(({ href, label }) => {
        const active = pathMatches(pathname, href);
        const attributes = { "aria-current": active ? "page" as const : undefined, className: active ? "active" : undefined };
        return mobile
          ? <a key={href} href={href} {...attributes}>{label}</a>
          : <Link key={href} href={href} {...attributes}>{label}</Link>;
      })}
    </div>
  ));
}

function pathMatches(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function isMorePath(pathname: string): boolean {
  return moreNavigationGroups().some(({ items }) => items.some(({ href }) => pathMatches(pathname, href)))
    || pathname.startsWith("/aircraft");
}

export function UtcClock() {
  const [utc, setUtc] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setUtc(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <time className="topbar-utc" dateTime={utc?.toISOString()} aria-label="UTC"><span>UTC</span>{utc ? utc.toISOString().slice(11, 19) : "--:--:--"}</time>;
}

function radarRailNavigation() { return [
  { href: "/", label: t.radar.liveAirPicture, icon: "radar", active: true },
  { href: "/system", label: t.system.title, icon: "system", active: false },
] as const; }

export function UtcClock() {
  const [utc, setUtc] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setUtc(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className="topbar-utc" dateTime={utc?.toISOString()} aria-label="UTC"><span>UTC</span>{utc ? utc.toISOString().slice(11, 19) : "--:--:--"}</time>;
}

export function RadarNavRail({
  showAtc,
  onShowAtcChange,
  showAirports,
  onShowAirportsChange,
}: {
  showAtc: boolean;
  onShowAtcChange: (show: boolean) => void;
  showAirports: boolean;
  onShowAirportsChange: (show: boolean) => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="radar-nav-rail" aria-label={t.statistics.navigation}>
      <nav className="radar-rail-nav">
        {radarRailNavigation().map(({ href, label, icon, active }) => {
          const isActive = active ? pathname === "/" : pathMatches(pathname, href);
          const link = <Link key={`${label}-${href}`} className={`radar-rail-link ${isActive ? "active" : ""}`} href={href} aria-current={isActive ? "page" : undefined}>
              <span className="radar-rail-icon" aria-hidden="true"><UiIcon name={icon} /></span>
              <span className="radar-rail-label">{label}</span>
            </Link>;
          return link;
        })}
        <button type="button" className={`radar-rail-link ${showAirports ? "active" : ""}`} aria-pressed={showAirports} onClick={() => onShowAirportsChange(!showAirports)}><span className="radar-rail-icon" aria-hidden="true"><UiIcon name="airport" /></span><span className="radar-rail-label">{t.layers.airports}</span></button>
        <button type="button" className={`radar-rail-link ${showAtc ? "active" : ""}`} aria-pressed={showAtc} onClick={() => onShowAtcChange(!showAtc)}><span className="radar-rail-icon" aria-hidden="true"><UiIcon name="atc" /></span><span className="radar-rail-label">{t.layers.atc}</span></button>
      </nav>
    </aside>
  );
}

export function AirRadarTopbar({ heading = false, meta, radarPage = false }: { heading?: boolean; meta?: ReactNode; radarPage?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function closeOpenUi(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const openDetails = target?.closest("details[open]") ?? Array.from(document.querySelectorAll("details[open]")).at(-1);
      if (openDetails instanceof HTMLDetailsElement) {
        openDetails.open = false;
        event.preventDefault();
        return;
      }

      const popupCloseButton = document.querySelector<HTMLButtonElement>(".maplibregl-popup-close-button");
      if (popupCloseButton) {
        popupCloseButton.click();
        event.preventDefault();
        return;
      }

      // Escape acts as a consistent "close page" shortcut when no local
      // popup or disclosure is open. Keep the live radar as the fallback.
      if (pathname !== "/") {
        event.preventDefault();
        if (window.history.length > 1) router.back();
        else router.push("/");
      }
    }

    document.addEventListener("keydown", closeOpenUi);
    return () => document.removeEventListener("keydown", closeOpenUi);
  }, [pathname, router]);

  return (
    <header className={`topbar ${radarPage ? "topbar-radar" : ""}`}>
      <Link className="brand brand-link" href="/" aria-label="AirRadar">
        <LogoMark />
        <span>
          {heading ? <h1 className="brand-title">AirRadar</h1> : <span className="brand-title">AirRadar</span>}
          <span className="brand-subtitle">{t.brand.subtitle}</span>
        </span>
      </Link>
      <GlobalSearch />
      {!radarPage ? <>
        <nav className="topbar-nav" aria-label={t.statistics.navigation}>
          {primaryNavigation().map(({ href, label, icon }) => {
            const active = pathMatches(pathname, href);
            return <Link key={href} className={`topbar-nav-primary ${active ? "active" : ""}`} href={href} aria-current={active ? "page" : undefined}><UiIcon name={icon} /><span>{label}</span></Link>;
          })}
          <details className="topbar-nav-more">
            <summary className={isMorePath(pathname) ? "active" : undefined}>{t.common.more}</summary>
            <div>
              <MoreNavigationGroups pathname={pathname} />
            </div>
          </details>
        </nav>
        {meta ? <div className="topbar-meta">{meta}</div> : null}
        <div className="desktop-language-switch"><LanguageSwitch /></div>
      </> : <div className="topbar-radar-actions">
        <div className="desktop-language-switch"><LanguageSwitch /></div>
        {meta ? <div className="topbar-meta">{meta}</div> : null}
        <details className="topbar-menu">
          <summary aria-label={t.common.more}><UiIcon name="more" /></summary>
          <div>
            <Link href="/system">{t.system.title}</Link>
            <Link href="/airports">{t.locale.startsWith("cs") ? "Letiště" : "Airports"}</Link>
            <Link href="/weather">{t.locale.startsWith("cs") ? "Počasí" : "Weather"}</Link>
            <div className="mobile-language-switch"><LanguageSwitch /></div>
          </div>
        </details>
      </div>}
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const moreActive = isMorePath(pathname);

  const item = (href: Route, label: string, icon: Parameters<typeof UiIcon>[0]["name"], accessibleLabel = label) => {
    const active = pathMatches(pathname, href);
    return <Link prefetch={false} className={active ? "active" : ""} href={href} aria-label={accessibleLabel} aria-current={active ? "page" : undefined}>
      <span className="mobile-bottom-nav-icon" aria-hidden="true"><UiIcon name={icon} /></span>
      <span>{label}</span>
    </Link>;
  };
  return (
    <nav className="mobile-bottom-nav" aria-label={t.statistics.navigation}>
      {item("/", "Radar", "radar", t.radar.liveAirPicture)}
      {item("/weather", t.locale.startsWith("cs") ? "Počasí" : "Weather", "system")}
      {item("/airports", t.locale.startsWith("cs") ? "Letiště" : "Airports", "airport")}
      {item("/navigation-integrity", t.locale.startsWith("cs") ? "Integrita" : "Integrity", "system")}
      <details className="mobile-bottom-more">
        <summary className={moreActive ? "active" : undefined}>
          <span className="mobile-bottom-nav-icon" aria-hidden="true"><UiIcon name="more" /></span>
          <span>{t.common.more}</span>
        </summary>
        <div>
          <MoreNavigationGroups pathname={pathname} mobile />
          <div className="mobile-language-switch"><LanguageSwitch /></div>
        </div>
      </details>
    </nav>
  );
}

export function AirRadarPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="radar-shell airradar-page-shell">
      <a className="skip-to-content" href="#main-content">{t.locale.startsWith("cs") ? "Přejít na obsah" : "Skip to content"}</a>
      <AirRadarTopbar />
      <main id="main-content" className="secondary-page-content" tabIndex={-1}>{children}</main>
      <MobileBottomNav />
    </div>
  );
}
