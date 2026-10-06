export const WORKSPACES_STORAGE_KEY = "airradar.workspaces.v1";
export const WORKSPACE_VERSION = 1 as const;
export const MAX_WORKSPACES = 12;
export const MAX_WORKSPACE_ENTRIES = 12;

export type WorkspaceEntryType =
  | "radar"
  | "airport"
  | "route"
  | "weather"
  | "airspace"
  | "navigation-integrity"
  | "discover"
  | "statistics"
  | "system"
  | "time-machine";

export interface WorkspaceEntry {
  id: string;
  type: WorkspaceEntryType;
  label: string;
  href: string;
  queryContext?: string | null;
}

export interface SavedWorkspace {
  id: string;
  version: typeof WORKSPACE_VERSION;
  name: string;
  createdAt: string;
  description?: string | null;
  entries: WorkspaceEntry[];
}

const ENTRY_TYPES = new Set<WorkspaceEntryType>([
  "radar",
  "airport",
  "route",
  "weather",
  "airspace",
  "navigation-integrity",
  "discover",
  "statistics",
  "system",
  "time-machine",
]);

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[\r\n\t]+/g, " ");
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}

function cleanOptionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return cleanText(value, maximum) ?? undefined;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function pathnameMatchesType(type: WorkspaceEntryType, pathname: string): boolean {
  if (type === "radar") return pathname === "/";
  if (type === "airport") return /^\/airports\/[A-Za-z0-9-]{2,12}$/.test(pathname);
  if (type === "route") return /^\/routes\/[A-Za-z0-9-]{2,12}\/[A-Za-z0-9-]{2,12}$/.test(pathname);
  if (type === "weather") return pathname === "/weather";
  if (type === "airspace") return pathname === "/airspace";
  if (type === "navigation-integrity") return pathname === "/navigation-integrity";
  if (type === "discover") return pathname === "/discover";
  if (type === "statistics") return pathname === "/statistics";
  if (type === "system") return pathname === "/system";
  return pathname === "/time-machine";
}

export function isCanonicalWorkspaceHref(type: WorkspaceEntryType, href: string): boolean {
  if (!href || href !== href.trim() || href.length > 512 || !href.startsWith("/") || href.startsWith("//")) return false;
  if(/[\u0000-\u001f\u007f]/.test(href)) return false;
  try {
    const url = new URL(href, "https://airradar.invalid");
    if (url.origin !== "https://airradar.invalid" || url.username || url.password) return false;
    return pathnameMatchesType(type, url.pathname);
  } catch {
    return false;
  }
}

export function createWorkspaceEntry(input: {
  id: string;
  type: WorkspaceEntryType;
  label: string;
  href: string;
}): WorkspaceEntry | null {
  const label = cleanText(input.label, 100);
  if (!validId(input.id) || !ENTRY_TYPES.has(input.type) || !label || !isCanonicalWorkspaceHref(input.type, input.href)) return null;
  const url = new URL(input.href, "https://airradar.invalid");
  return {
    id: input.id,
    type: input.type,
    label,
    href: input.href,
    queryContext: url.search ? url.search.slice(1) : null,
  };
}

function parseEntry(value: unknown): WorkspaceEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!validId(row.id) || typeof row.type !== "string" || !ENTRY_TYPES.has(row.type as WorkspaceEntryType)) return null;
  const label = cleanText(row.label, 100);
  if (!label || typeof row.href !== "string" || !isCanonicalWorkspaceHref(row.type as WorkspaceEntryType, row.href)) return null;
  const actualQuery = new URL(row.href, "https://airradar.invalid").search.slice(1);
  if (row.queryContext !== undefined && row.queryContext !== null) {
    if (typeof row.queryContext !== "string" || row.queryContext.length > 300 || row.queryContext !== actualQuery) return null;
  }
  return {
    id: row.id,
    type: row.type as WorkspaceEntryType,
    label,
    href: row.href,
    queryContext: actualQuery || null,
  };
}

function parseWorkspace(value: unknown): SavedWorkspace | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!validId(row.id) || row.version !== WORKSPACE_VERSION || !validTimestamp(row.createdAt) || !Array.isArray(row.entries)) return null;
  if (row.entries.length > MAX_WORKSPACE_ENTRIES) return null;
  const name = cleanText(row.name, 80);
  const description = cleanOptionalText(row.description, 240);
  if (!name || description === undefined) return null;
  const entries = row.entries.map(parseEntry);
  if (entries.some((entry) => entry === null)) return null;
  const typedEntries = entries as WorkspaceEntry[];
  if (new Set(typedEntries.map((entry) => entry.id)).size !== typedEntries.length) return null;
  return {
    id: row.id,
    version: WORKSPACE_VERSION,
    name,
    createdAt: new Date(row.createdAt).toISOString(),
    description,
    entries: typedEntries,
  };
}

export function parseWorkspacesStorage(value: string | null): SavedWorkspace[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > MAX_WORKSPACES) return [];
    const workspaces = parsed.map(parseWorkspace);
    if (workspaces.some((workspace) => workspace === null)) return [];
    const typed = workspaces as SavedWorkspace[];
    if (new Set(typed.map((workspace) => workspace.id)).size !== typed.length) return [];
    return typed;
  } catch {
    return [];
  }
}

export function serializeWorkspaces(workspaces: readonly SavedWorkspace[]): string {
  return JSON.stringify(workspaces.slice(0, MAX_WORKSPACES));
}

export function createWorkspace(
  current: readonly SavedWorkspace[],
  input: { id: string; name: string; createdAt: string; description?: string | null },
): SavedWorkspace[] {
  if (current.length >= MAX_WORKSPACES || !validId(input.id) || !validTimestamp(input.createdAt)) return [...current];
  const name = cleanText(input.name, 80);
  const description = cleanOptionalText(input.description, 240);
  if (!name || description === undefined || current.some((workspace) => workspace.id === input.id)) return [...current];
  return [...current, {
    id: input.id,
    version: WORKSPACE_VERSION,
    name,
    createdAt: new Date(input.createdAt).toISOString(),
    description,
    entries: [],
  }];
}

export function renameWorkspace(current: readonly SavedWorkspace[], id: string, name: string): SavedWorkspace[] {
  const cleaned = cleanText(name, 80);
  if (!cleaned) return [...current];
  return current.map((workspace) => workspace.id === id ? { ...workspace, name: cleaned } : workspace);
}

export function deleteWorkspace(current: readonly SavedWorkspace[], id: string): SavedWorkspace[] {
  return current.filter((workspace) => workspace.id !== id);
}

export function addWorkspaceEntry(
  current: readonly SavedWorkspace[],
  workspaceId: string,
  entry: WorkspaceEntry,
): SavedWorkspace[] {
  if (!parseEntry(entry)) return [...current];
  return current.map((workspace) => {
    if (workspace.id !== workspaceId || workspace.entries.length >= MAX_WORKSPACE_ENTRIES) return workspace;
    if (workspace.entries.some((item) => item.id === entry.id || item.href === entry.href)) return workspace;
    return { ...workspace, entries: [...workspace.entries, entry] };
  });
}

export function removeWorkspaceEntry(
  current: readonly SavedWorkspace[],
  workspaceId: string,
  entryId: string,
): SavedWorkspace[] {
  return current.map((workspace) => workspace.id === workspaceId
    ? { ...workspace, entries: workspace.entries.filter((entry) => entry.id !== entryId) }
    : workspace);
}
