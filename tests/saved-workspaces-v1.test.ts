import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
} from "@/lib/workspaces";

function workspace() {
  return createWorkspace([], {
    id: "workspace_a",
    name: "PRG OPERATIONS",
    description: "Receiver context",
    createdAt: "2026-10-06T20:00:00.000Z",
  })[0]!;
}

describe("Saved Workspaces V1 model", () => {
  it("uses the dedicated versioned browser-local key", () => {
    expect(WORKSPACES_STORAGE_KEY).toBe("airradar.workspaces.v1");
  });

  it("fails closed for corrupt or structurally invalid storage", () => {
    expect(parseWorkspacesStorage("not-json")).toEqual([]);
    expect(parseWorkspacesStorage(JSON.stringify([{ id: "x" }]))).toEqual([]);
    expect(parseWorkspacesStorage(JSON.stringify(Array.from({ length: MAX_WORKSPACES + 1 }, () => ({}))))).toEqual([]);
  });

  it("preserves canonical URLs including safe query state", () => {
    const entry = createWorkspaceEntry({
      id: "entry_1",
      type: "time-machine",
      label: "Replay",
      href: "/time-machine?at=2026-10-06T12%3A00%3A00.000Z&hex=48AF05",
    });
    expect(entry?.href).toBe("/time-machine?at=2026-10-06T12%3A00%3A00.000Z&hex=48AF05");
    expect(entry?.queryContext).toBe("at=2026-10-06T12%3A00%3A00.000Z&hex=48AF05");
    expect(createWorkspaceEntry({ id: "bad", type: "weather", label: "Bad", href: "https://example.com/weather" })).toBeNull();
    expect(createWorkspaceEntry({ id: "bad2", type: "airport", label: "Bad", href: "/system" })).toBeNull();
  });

  it("supports create, rename and delete without exceeding the workspace limit", () => {
    const initial = workspace();
    expect(renameWorkspace([initial], initial.id, "PRG OPS")[0]?.name).toBe("PRG OPS");
    expect(deleteWorkspace([initial], initial.id)).toEqual([]);
    let items = [];
    for (let index = 0; index < MAX_WORKSPACES + 3; index += 1) {
      items = createWorkspace(items, { id: `w_${index}`, name: `W ${index}`, createdAt: "2026-10-06T20:00:00.000Z" });
    }
    expect(items).toHaveLength(MAX_WORKSPACES);
  });

  it("bounds entries, deduplicates canonical hrefs and supports removal", () => {
    let items = [workspace()];
    for (let index = 0; index < MAX_WORKSPACE_ENTRIES + 3; index += 1) {
      const entry = createWorkspaceEntry({ id: `e_${index}`, type: "airport", label: `Airport ${index}`, href: `/airports/LK${String(index).padStart(2, "0")}` })!;
      items = addWorkspaceEntry(items, items[0]!.id, entry);
    }
    expect(items[0]?.entries).toHaveLength(MAX_WORKSPACE_ENTRIES);
    const duplicate = createWorkspaceEntry({ id: "duplicate", type: "airport", label: "Duplicate", href: items[0]!.entries[0]!.href })!;
    expect(addWorkspaceEntry(items, items[0]!.id, duplicate)[0]?.entries).toHaveLength(MAX_WORKSPACE_ENTRIES);
    const removed = removeWorkspaceEntry(items, items[0]!.id, items[0]!.entries[0]!.id);
    expect(removed[0]?.entries).toHaveLength(MAX_WORKSPACE_ENTRIES - 1);
    expect(parseWorkspacesStorage(serializeWorkspaces(removed))).toEqual(removed);
  });
});

describe("Saved Workspaces V1 browser-only boundary", () => {
  const source = readFileSync(new URL("../components/saved-workspaces.tsx", import.meta.url), "utf8");
  const modelSource = readFileSync(new URL("../lib/workspaces.ts", import.meta.url), "utf8");
  it("uses localStorage and has no network or DB lane", () => {
    expect(source).toContain("window.localStorage");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("/api/");
    expect(modelSource).not.toContain("prisma");
    expect(modelSource).not.toContain("fetch(");
  });
});
