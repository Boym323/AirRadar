"use client";

import { usePathname } from "next/navigation";
import { localizedPageMetadata } from "@/lib/i18n/page-metadata";
import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, normalizeLocalePreference, setClientLocale, type LocaleKey } from "@/lib/i18n";

export const LANGUAGE_STORAGE_KEY = "airradar-language";

type LocaleContextValue = { locale: LocaleKey; setLocale: (next: LocaleKey) => void };

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Match SSR's Czech markup for hydration. Restore the saved language after mounting.
  const [locale, updateLocale] = useState<LocaleKey>(DEFAULT_LOCALE);
  const pathname = usePathname();

  const setLocale = useCallback((next: LocaleKey) => {
    setClientLocale(next);
    document.documentElement.lang = next;
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Storage is optional. */ }
    updateLocale(next);
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* Storage is optional. */ }
    setLocale(normalizeLocalePreference(saved));

    const syncFromAnotherTab = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY) setLocale(normalizeLocalePreference(event.newValue));
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, [setLocale]);

  useEffect(() => {
    const metadata = localizedPageMetadata(pathname ?? "/", locale);
    if (metadata.title) document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", metadata.description);
  }, [locale, pathname]);

  return <LocaleContext.Provider value={{ locale, setLocale }}>
    {/* Remount local UI on change so even existing consumers of the shared t dictionary update.
        No browser navigation or reload; the query cache and URL remain intact. */}
    <Fragment key={locale}>{children}</Fragment>
  </LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale requires LocaleProvider");
  return context;
}
