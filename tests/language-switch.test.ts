import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getTranslations, normalizeLocalePreference } from "@/lib/i18n";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("persistent Czech / English language switch", () => {
  it("defaults safely to Czech and retains a functional English dictionary", () => {
    expect(DEFAULT_LOCALE).toBe("cs");
    expect(normalizeLocalePreference("en")).toBe("en");
    expect(normalizeLocalePreference("cs")).toBe("cs");
    expect(normalizeLocalePreference("de")).toBe("cs");
    expect(normalizeLocalePreference(null)).toBe("cs");
    expect(getTranslations("en").operations.title).toBe("Operations");
    expect(getTranslations("cs").operations.title).toBe("Provozní přehled");
    expect(getTranslations("en").adminAlerts.createFleet).toBe("Create fleet");
    expect(getTranslations("cs").adminAlerts.createFleet).toBe("Vytvořit flotilu");
    expect(getTranslations("en").uiExtras.networkObservation).toBe("Last NETWORK observation");
    expect(getTranslations("cs").uiExtras.networkObservation).toBe("Poslední síťové pozorování");
  });

  it("mounts the same provider on every route without requiring a document reload", () => {
    const layout = source("app/layout.tsx");
    const provider = source("components/locale-provider.tsx");
    expect(layout).toContain("<LocaleProvider>{children}<CommandPalette /><PwaRegister /></LocaleProvider>");
    expect(provider).toContain('LANGUAGE_STORAGE_KEY = "airradar-language"');
    expect(provider).toContain('window.localStorage.getItem(LANGUAGE_STORAGE_KEY)');
    expect(provider).toContain('window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)');
    expect(provider).toContain('document.documentElement.lang = next');
    expect(provider).toContain('<Fragment key={locale}>{children}</Fragment>');
    expect(provider).not.toContain("location.reload(");
    expect(provider).not.toContain("router.refresh(");
  });

  it("provides visible, accessible CZ/EN selection in desktop, radar and mobile navigation", () => {
    const shell = source("components/airradar-shell.tsx");
    const css = source("app/language-switch.css");
    expect(shell).toContain('aria-label={t.language.label}');
    expect(shell).toContain('aria-pressed={locale === "cs"}');
    expect(shell).toContain('aria-pressed={locale === "en"}');
    expect(shell).toContain('className="desktop-language-switch"');
    expect(shell).toContain('className="mobile-language-switch"');
    expect(shell).toContain('function primaryNavigation()');
    expect(shell).toContain('function moreNavigation()');
    expect(shell).toContain('function radarRailNavigation()');
    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain(".desktop-language-switch { display: none; }");
  });

  it("does not regress localized overlays, administration or aircraft telemetry", () => {
    const receiver = source("components/aircraft-radar-quick-detail.tsx");
    const alerts = source("components/alerts-admin-page.tsx");
    const aviation = source("lib/i18n/airspace-activity.ts");
    expect(receiver).toContain("t.uiExtras.localObservation");
    expect(receiver).not.toContain('label="Last LOCAL observation"');
    expect(alerts).toContain("t.adminAlerts.createFleet");
    expect(alerts).not.toContain(">Create fleet</button>");
    expect(aviation).toContain('t.locale.startsWith("en")');
    expect(aviation).toContain("airspaceActivityMapTranslations.en");
  });
});
