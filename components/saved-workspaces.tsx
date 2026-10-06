"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, MetricStrip, PageHeader, Panel, SectionHeader, StatusBadge } from "@/components/ui-primitives";
import { formatDateTime, t } from "@/lib/i18n";
import {
  MAX_WORKSPACE_ENTRIES,
  MAX_WORKSPACES,
  WORKSPACES_STORAGE_KEY,
  addWorkspaceEntry,
  createWorkspace,
  createWorkspaceEntry,
  deleteWorkspace,
  parseWorkspacesStorage,
  removeWorkspaceEntry,
  renameWorkspace,
  serializeWorkspaces,
  type SavedWorkspace,
  type WorkspaceEntryType,
} from "@/lib/workspaces";
import styles from "./saved-workspaces.module.css";

const ENTRY_OPTIONS: Array<{ type: WorkspaceEntryType; labelCs: string; labelEn: string; example: string }> = [
  { type: "radar", labelCs: "Radar", labelEn: "Radar", example: "/" },
  { type: "airport", labelCs: "Letiště", labelEn: "Airport", example: "/airports/LKPR" },
  { type: "route", labelCs: "Trasa", labelEn: "Route", example: "/routes/LKPR/LOWW" },
  { type: "weather", labelCs: "Počasí", labelEn: "Weather", example: "/weather" },
  { type: "airspace", labelCs: "Vzdušný prostor", labelEn: "Airspace", example: "/airspace" },
  { type: "navigation-integrity", labelCs: "Navigation Integrity", labelEn: "Navigation Integrity", example: "/navigation-integrity" },
  { type: "discover", labelCs: "Discover", labelEn: "Discover", example: "/discover" },
  { type: "statistics", labelCs: "Statistiky", labelEn: "Statistics", example: "/statistics" },
  { type: "system", labelCs: "Systém", labelEn: "System", example: "/system" },
  { type: "time-machine", labelCs: "Time Machine", labelEn: "Time Machine", example: "/time-machine" },
];

function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : Math.random().toString(36).slice(2);
  return `${prefix}_${random.slice(0, 32)}`;
}

export function SavedWorkspaces() {
  const cs = t.locale.startsWith("cs");
  const copy = cs ? {
    title: "Uložené workspace",
    subtitle: "Pojmenované pracovní kontexty uložené pouze v tomto prohlížeči. Workspace obsahuje jen odkazy a bezpečný URL stav.",
    workspaces: "Workspace",
    entries: "Položky",
    limit: "Limit",
    create: "Vytvořit workspace",
    name: "Název",
    description: "Popis (volitelný)",
    add: "Přidat",
    rename: "Přejmenovat",
    remove: "Odebrat",
    delete: "Smazat workspace",
    open: "Otevřít",
    addEntry: "Přidat kontext",
    type: "Typ",
    label: "Popisek",
    href: "Canonical URL",
    empty: "Zatím nemáte uložený žádný workspace.",
    noEntries: "Tento workspace zatím nemá položky.",
    invalid: "Zadaná URL neodpovídá vybranému canonical typu.",
    full: "Byl dosažen lokální limit.",
    localOnly: "BROWSER LOCAL",
    created: "Vytvořeno",
  } : {
    title: "Saved Workspaces",
    subtitle: "Named working contexts stored only in this browser. A workspace contains links and safe URL state only.",
    workspaces: "Workspaces",
    entries: "Entries",
    limit: "Limit",
    create: "Create workspace",
    name: "Name",
    description: "Description (optional)",
    add: "Add",
    rename: "Rename",
    remove: "Remove",
    delete: "Delete workspace",
    open: "Open",
    addEntry: "Add context",
    type: "Type",
    label: "Label",
    href: "Canonical URL",
    empty: "You do not have a saved workspace yet.",
    noEntries: "This workspace does not have any entries yet.",
    invalid: "The URL does not match the selected canonical type.",
    full: "The local limit has been reached.",
    localOnly: "BROWSER LOCAL",
    created: "Created",
  };

  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [entryType, setEntryType] = useState<WorkspaceEntryType>("radar");
  const [entryLabel, setEntryLabel] = useState("");
  const [entryHref, setEntryHref] = useState("/");
  const [entryError, setEntryError] = useState(false);

  useEffect(() => {
    let next: SavedWorkspace[] = [];
    try {
      next = parseWorkspacesStorage(window.localStorage.getItem(WORKSPACES_STORAGE_KEY));
    } catch {
      next = [];
    }
    setWorkspaces(next);
    setSelectedId(next[0]?.id ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, serializeWorkspaces(workspaces));
    } catch {
      // Browser-local persistence is optional; the in-memory workspace remains usable.
    }
  }, [loaded, workspaces]);

  const selected = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0] ?? null,
    [selectedId, workspaces],
  );

  useEffect(() => {
    if (!selected) {
      setRenameValue("");
      return;
    }
    setRenameValue(selected.name);
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  function submitWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = newId("workspace");
    const next = createWorkspace(workspaces, {
      id,
      name: newName,
      description: newDescription,
      createdAt: new Date().toISOString(),
    });
    if (next.length === workspaces.length) return;
    setWorkspaces(next);
    setSelectedId(id);
    setNewName("");
    setNewDescription("");
  }

  function chooseEntryType(type: WorkspaceEntryType) {
    setEntryType(type);
    const option = ENTRY_OPTIONS.find((item) => item.type === type);
    if (option) {
      setEntryHref(option.example);
      if (!entryLabel) setEntryLabel(cs ? option.labelCs : option.labelEn);
    }
    setEntryError(false);
  }

  function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const entry = createWorkspaceEntry({
      id: newId("entry"),
      type: entryType,
      label: entryLabel || (cs ? ENTRY_OPTIONS.find((item) => item.type === entryType)?.labelCs ?? entryType : ENTRY_OPTIONS.find((item) => item.type === entryType)?.labelEn ?? entryType),
      href: entryHref,
    });
    if (!entry) {
      setEntryError(true);
      return;
    }
    const next = addWorkspaceEntry(workspaces, selected.id, entry);
    if (next === workspaces || next.every((workspace, index) => workspace.entries.length === workspaces[index]?.entries.length)) return;
    setWorkspaces(next);
    setEntryError(false);
    setEntryLabel("");
  }

  return <main className={styles.page} data-testid="saved-workspaces-v1">
    <PageHeader
      kicker="AIRRADAR / WORKSPACES"
      title={copy.title}
      description={copy.subtitle}
      actions={<StatusBadge variant="neutral">{copy.localOnly}</StatusBadge>}
    />

    <MetricStrip>
      <MetricCard value={workspaces.length} label={copy.workspaces} />
      <MetricCard value={workspaces.reduce((sum, workspace) => sum + workspace.entries.length, 0)} label={copy.entries} />
      <MetricCard value={`${MAX_WORKSPACES} × ${MAX_WORKSPACE_ENTRIES}`} label={copy.limit} />
    </MetricStrip>

    <div className={styles.layout}>
      <Panel className={styles.sidebar}>
        <SectionHeader kicker="LOCAL" title={copy.workspaces} />
        <form className={styles.createForm} onSubmit={submitWorkspace}>
          <label><span>{copy.name}</span><input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} required /></label>
          <label><span>{copy.description}</span><textarea value={newDescription} maxLength={240} rows={2} onChange={(event) => setNewDescription(event.target.value)} /></label>
          <button type="submit" disabled={workspaces.length >= MAX_WORKSPACES}>{copy.create}</button>
        </form>
        {workspaces.length ? <div className={styles.workspaceList}>
          {workspaces.map((workspace) => <button
            key={workspace.id}
            type="button"
            className={workspace.id === selected?.id ? styles.activeWorkspace : ""}
            onClick={() => setSelectedId(workspace.id)}
          >
            <strong>{workspace.name}</strong>
            <span>{workspace.entries.length}/{MAX_WORKSPACE_ENTRIES}</span>
          </button>)}
        </div> : <EmptyState title={copy.empty} />}
      </Panel>

      <Panel className={styles.detail}>
        {selected ? <>
          <div className={styles.detailHeader}>
            <div>
              <span>{copy.created} {formatDateTime(selected.createdAt, t)}</span>
              <h2>{selected.name}</h2>
              {selected.description ? <p>{selected.description}</p> : null}
            </div>
            <button type="button" className={styles.danger} onClick={() => {
              setWorkspaces(deleteWorkspace(workspaces, selected.id));
              setSelectedId(null);
            }}>{copy.delete}</button>
          </div>

          <div className={styles.renameRow}>
            <input value={renameValue} maxLength={80} onChange={(event) => setRenameValue(event.target.value)} aria-label={copy.rename} />
            <button type="button" onClick={() => setWorkspaces(renameWorkspace(workspaces, selected.id, renameValue))}>{copy.rename}</button>
          </div>

          <form className={styles.entryForm} onSubmit={submitEntry}>
            <label>
              <span>{copy.type}</span>
              <select value={entryType} onChange={(event) => chooseEntryType(event.target.value as WorkspaceEntryType)}>
                {ENTRY_OPTIONS.map((option) => <option key={option.type} value={option.type}>{cs ? option.labelCs : option.labelEn}</option>)}
              </select>
            </label>
            <label><span>{copy.label}</span><input value={entryLabel} maxLength={100} onChange={(event) => setEntryLabel(event.target.value)} /></label>
            <label className={styles.hrefField}><span>{copy.href}</span><input value={entryHref} maxLength={512} onChange={(event) => { setEntryHref(event.target.value); setEntryError(false); }} required /></label>
            <button type="submit" disabled={selected.entries.length >= MAX_WORKSPACE_ENTRIES}>{copy.add}</button>
          </form>
          {entryError ? <p className={styles.error} role="alert">{copy.invalid}</p> : null}
          {selected.entries.length >= MAX_WORKSPACE_ENTRIES ? <p className={styles.notice}>{copy.full}</p> : null}

          {selected.entries.length ? <div className={styles.entries}>
            {selected.entries.map((entry) => <article key={entry.id} className={styles.entry}>
              <div><span>{entry.type.replaceAll("-", " ")}</span><strong>{entry.label}</strong><code>{entry.href}</code></div>
              <div className={styles.entryActions}>
                <Link href={entry.href as Route}>{copy.open}</Link>
                <button type="button" onClick={() => setWorkspaces(removeWorkspaceEntry(workspaces, selected.id, entry.id))}>{copy.remove}</button>
              </div>
            </article>)}
          </div> : <EmptyState title={copy.noEntries} />}
        </> : <EmptyState title={copy.empty} />}
      </Panel>
    </div>
  </main>;
}
