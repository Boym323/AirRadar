import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("V5-B3 single cross-tab flight action bar", () => {
  const quick = read("components/aircraft-radar-quick-detail.tsx");
  const drawer = read("components/radar/radar-drawer-details.tsx");
  const app = read("components/airradar-app.tsx");
  const css = read("app/radar-aircraft-panel.css");
  it("wires true existing map-follow state, without another stream or polling", () => {
    expect(app).toContain('following={followSelected}');
    expect(app).toContain('onToggleFollow={() => setFollowSelected((current) => !current)}');
    expect(drawer).toContain('onToggleFollow={onToggleFollow}');
    expect(quick).toContain('data-testid="aircraft-v5-follow"');
    expect(quick).toContain('aria-pressed={following}');
    expect(quick).toContain('disabled={aircraft.lat === null || aircraft.lon === null}');
    expect(quick).not.toContain('fetch(');
  });
  it("offers history, alert rule settings, native sharing and full detail on all tabs", () => {
    const nav = quick.slice(quick.indexOf('data-testid="aircraft-v5-quick-actions"'));
    expect(nav.indexOf('data-testid="aircraft-v5-share"')).toBeLessThan(nav.indexOf('<DetailTabs activeTab'));
    expect(nav).toContain('href={historyHref');
    expect(nav).toContain('href="/alerts"');
    expect(nav).toContain('href={fullDetailHref');
    expect(quick).toContain("navigator.clipboard.writeText(url)");
    expect(quick).toContain("navigator.share");
    expect(quick).toContain('role="status" aria-live="polite"');
    expect(css).toContain('.aircraft-v5-quick-actions .aircraft-quick-action:focus-visible');
    expect(css).toContain('min-height: var(--control-height-touch)');
  });
  it("keeps push alerts separate from local watchlist, and localization symmetric", () => {
    expect(quick).toContain('aria-pressed={watchlisted}');
    expect(quick).toContain('onClick={onToggleWatchlist}');
    for (const lang of ["cs", "en"]) {
      const text = read(`lib/i18n/${lang}.ts`);
      for (const key of ["followMap:", "stopFollowing:", "share:", "linkCopied:", "alerts:", "alertsHint:"]) expect(text).toContain(key);
    }
  });
});
