import { cs } from "./cs";
import { en } from "./en";

export type LocaleKey = "cs" | "en";
export type LocaleDictionary = typeof cs;

export const DEFAULT_LOCALE: LocaleKey = "cs";
export const DEFAULT_INTL_LOCALE = cs.locale;
export const dictionaries: Record<LocaleKey, LocaleDictionary> = { cs, en };
export const t: LocaleDictionary = dictionaries[DEFAULT_LOCALE];

export function getTranslations(locale: string = DEFAULT_LOCALE): LocaleDictionary {
  return dictionaries[locale as LocaleKey] ?? t;
}

function pluralForm(count: number, forms: LocaleDictionary["counts"]["aircraft"], locale: string): string {
  const absolute = Math.abs(count);
  if (locale.startsWith("en")) return absolute === 1 ? forms.one : forms.many;
  if (absolute === 1) return forms.one;
  if (absolute >= 2 && absolute <= 4) return forms.few;
  return forms.many;
}

function countPhrase(count: number, forms: LocaleDictionary["counts"]["aircraft"], dictionary: LocaleDictionary = t): string {
  return `${formatNumber(count, 0, dictionary.locale)} ${pluralForm(count, forms, dictionary.locale)}`;
}

export function formatNumber(value: number | null | undefined, digits = 0, locale = DEFAULT_INTL_LOCALE): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? t.common.emptyValue
    : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

export function formatAltitude(value: number | null | undefined, dictionary: LocaleDictionary = t): string {
  return value === null || value === undefined ? dictionary.common.emptyValue : `${formatNumber(value, 0, dictionary.locale)} ft`;
}

export function formatSpeed(value: number | null | undefined, dictionary: LocaleDictionary = t): string {
  return value === null || value === undefined ? dictionary.common.emptyValue : `${formatNumber(value, 0, dictionary.locale)} kt`;
}

export function formatDistance(value: number | null | undefined, dictionary: LocaleDictionary = t): string {
  return value === null || value === undefined
    ? dictionary.common.emptyValue
    : `${formatNumber(value, value < 10 ? 1 : 0, dictionary.locale)} km`;
}

export function formatTrack(value: number | null | undefined, dictionary: LocaleDictionary = t): string {
  return value === null || value === undefined ? dictionary.common.emptyValue : `${Math.round(value).toString().padStart(3, "0")}°`;
}

export function formatCoordinate(value: number, dictionary: LocaleDictionary = t): string {
  return new Intl.NumberFormat(dictionary.locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

export function formatAge(value: number | null | undefined, dictionary: LocaleDictionary = t): string {
  if (value === null || value === undefined) return dictionary.common.emptyValue;
  const formatted = formatNumber(value, 1, dictionary.locale);
  return dictionary.locale.startsWith("cs") ? `před ${formatted} s` : `${formatted} s ago`;
}

export function formatTime(value: string | null | undefined, dictionary: LocaleDictionary = t): string {
  if (!value) return dictionary.common.emptyValue;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? dictionary.common.emptyValue
    : new Intl.DateTimeFormat(dictionary.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export function formatDateTime(value: string | null | undefined, dictionary: LocaleDictionary = t): string {
  if (!value) return dictionary.common.emptyValue;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? dictionary.common.emptyValue
    : new Intl.DateTimeFormat(dictionary.locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function aircraftCount(count: number, dictionary: LocaleDictionary = t): string {
  return countPhrase(count, dictionary.counts.aircraft, dictionary);
}

export function ruleCount(count: number, dictionary: LocaleDictionary = t): string {
  return countPhrase(count, dictionary.counts.rule, dictionary);
}

export function positionCount(count: number, dictionary: LocaleDictionary = t): string {
  return countPhrase(count, dictionary.counts.position, dictionary);
}

export function aircraftInRange(count: number, dictionary: LocaleDictionary = t): string {
  return `${aircraftCount(count, dictionary)} ${dictionary.radar.aircraftInRange}`;
}

export function visibleAircraft(visible: number, total: number, dictionary: LocaleDictionary = t): string {
  return dictionary.radar.visibleAircraft(
    formatNumber(visible, 0, dictionary.locale),
    formatNumber(total, 0, dictionary.locale),
  );
}

export function watchlistSummary(count: number, dictionary: LocaleDictionary = t): string {
  return count > 0 ? ruleCount(count, dictionary) : dictionary.watchlist.addRule;
}

export function secondaryStats(unique: number, maximum: number, messagesPerSecond: number | null, dictionary: LocaleDictionary = t): string {
  return dictionary.stats.secondary(
    formatNumber(unique, 0, dictionary.locale),
    formatNumber(maximum, 0, dictionary.locale),
    messagesPerSecond === null ? dictionary.common.emptyValue : formatNumber(messagesPerSecond, 1, dictionary.locale),
  );
}

export function flightSummary(callsign: string | null | undefined, dictionary: LocaleDictionary = t): string {
  return callsign ? `${dictionary.history.flight} ${callsign}` : dictionary.history.unknownCallsign;
}

export function historySummary(source: string, positions: number, dictionary: LocaleDictionary = t): string {
  return `${dictionary.history.source}: ${source} · ${positionCount(positions, dictionary)}`;
}

export function watchlistKindLabel(kind: string, dictionary: LocaleDictionary = t): string {
  return dictionary.watchlist.ruleKinds[kind as keyof typeof dictionary.watchlist.ruleKinds] ?? kind;
}

export function formatAtcService(service: string | null | undefined, dictionary: LocaleDictionary = t): string {
  if (!service) return dictionary.atc.defaultService;
  const normalized = service.trim().toLowerCase();
  if (normalized === "area control") return dictionary.atc.services.areaControl;
  if (normalized === "approach") return dictionary.atc.services.approach;
  return service;
}

export function formatAtcNote(note: string | null | undefined, dictionary: LocaleDictionary = t): string {
  if (!note) return dictionary.common.emptyValue;
  return note.trim().toLowerCase() === "sample transmitter location" ? dictionary.atc.sampleTransmitterLocation : note;
}
