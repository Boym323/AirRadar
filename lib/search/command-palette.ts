export const OPEN_COMMAND_PALETTE_EVENT = "airradar:open-command-palette";
export const OPEN_OPERATIONS_CENTER_EVENT = "airradar:open-operations-center";
export const COMMAND_SEARCH_RECENTS_KEY = "airradar.command-search.recents.v1";
export const COMMAND_SEARCH_RECENT_LIMIT = 5;

export type CommandPaletteRecentKind = "command" | "aircraft" | "airport" | "ats-point" | "ats-route" | "sector" | "nav-point" | "flight" | "action";

export interface CommandPaletteRecent {
  key: string;
  kind: CommandPaletteRecentKind;
  label: string;
  detail: string | null;
  href: string;
}

export function requestCommandPaletteOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

export function requestOperationsCenterOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_OPERATIONS_CENTER_EVENT));
}

export function parseCommandSearchRecents(value: string | null): CommandPaletteRecent[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.key !== "string"
        || typeof record.label !== "string"
        || typeof record.href !== "string"
        || !record.href.startsWith("/")
        || record.href.startsWith("//")
        || !["command", "aircraft", "airport", "ats-point", "ats-route", "sector", "nav-point", "flight", "action"].includes(String(record.kind))
      ) return [];
      return [{
        key: record.key,
        kind: record.kind as CommandPaletteRecentKind,
        label: record.label,
        detail: typeof record.detail === "string" ? record.detail : null,
        href: record.href,
      }];
    }).slice(0, COMMAND_SEARCH_RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function addCommandSearchRecent(
  current: readonly CommandPaletteRecent[],
  next: CommandPaletteRecent,
): CommandPaletteRecent[] {
  return [
    next,
    ...current.filter((item) => item.key !== next.key),
  ].slice(0, COMMAND_SEARCH_RECENT_LIMIT);
}
