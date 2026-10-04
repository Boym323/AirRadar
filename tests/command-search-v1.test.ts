import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMAND_SEARCH_RECENT_LIMIT,
  addCommandSearchRecent,
  parseCommandSearchRecents,
  type CommandPaletteRecent,
} from "@/lib/search/command-palette";

function recent(key: string): CommandPaletteRecent {
  return {
    key,
    kind: "command",
    label: key,
    detail: null,
    href: "/",
  };
}

describe("Command Search V1 recents", () => {
  it("deduplicates recent destinations and keeps the newest item first", () => {
    const result = addCommandSearchRecent([recent("a"), recent("b")], recent("b"));
    expect(result.map((item) => item.key)).toEqual(["b", "a"]);
  });

  it("keeps local recents bounded", () => {
    let items: CommandPaletteRecent[] = [];
    for (let index = 0; index < COMMAND_SEARCH_RECENT_LIMIT + 4; index += 1) {
      items = addCommandSearchRecent(items, recent(String(index)));
    }
    expect(items).toHaveLength(COMMAND_SEARCH_RECENT_LIMIT);
    expect(items[0]?.key).toBe(String(COMMAND_SEARCH_RECENT_LIMIT + 3));
  });

  it("rejects malformed localStorage payloads without throwing", () => {
    expect(parseCommandSearchRecents("not-json")).toEqual([]);
    expect(parseCommandSearchRecents(JSON.stringify([{ key: 1 }]))).toEqual([]);
    expect(parseCommandSearchRecents(JSON.stringify([{ key: "x", kind: "command", label: "x", detail: null, href: "javascript:alert(1)" }]))).toEqual([]);
    expect(parseCommandSearchRecents(JSON.stringify([{ key: "x", kind: "command", label: "x", detail: null, href: "//example.com" }]))).toEqual([]);
  });
});

describe("Command Search V1 UI boundary", () => {
  const paletteSource = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");
  const triggerSource = readFileSync(new URL("../components/global-search.tsx", import.meta.url), "utf8");
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const operationsSource = readFileSync(new URL("../components/radar/radar-operations-center.tsx", import.meta.url), "utf8");

  it("mounts one global palette in the root layout and makes topbar search a trigger", () => {
    expect(layoutSource).toContain("<CommandPalette />");
    expect(triggerSource).toContain("requestCommandPaletteOpen");
    expect(triggerSource).not.toContain("/api/search?q=");
    expect(triggerSource).toContain('data-testid="command-palette-trigger"');
  });

  it("owns the only command-search request lane and keeps it debounced/read-only", () => {
    expect(paletteSource).toContain("SEARCH_DEBOUNCE_MS = 220");
    expect(paletteSource).toContain("/api/search?q=");
    expect(paletteSource.match(/fetch\(/g)).toHaveLength(1);
    expect(paletteSource).not.toContain("POST");
    expect(paletteSource).not.toContain("PATCH");
    expect(paletteSource).not.toContain("DELETE");
    expect(paletteSource).not.toContain("new EventSource");
  });

  it("supports global shortcut and full keyboard navigation", () => {
    expect(paletteSource).toContain('event.key.toLocaleLowerCase() !== "k"');
    expect(paletteSource).toContain("event.metaKey");
    expect(paletteSource).toContain("event.ctrlKey");
    expect(paletteSource).toContain('event.key === "ArrowDown"');
    expect(paletteSource).toContain('event.key === "ArrowUp"');
    expect(paletteSource).toContain('event.key === "Enter"');
    expect(paletteSource).toContain('event.key === "Escape"');
    expect(paletteSource).toContain('role="dialog"');
    expect(paletteSource).toContain('role="combobox"');
  });

  it("keeps recents browser-local and deep-links the real Operations Center", () => {
    expect(paletteSource).toContain("window.localStorage");
    expect(paletteSource).toContain('href: "/?operations=1"');
    expect(paletteSource).toContain("requestOperationsCenterOpen");
    expect(operationsSource).toContain('searchParams.get("operations") === "1"');
    expect(operationsSource).toContain("OPEN_OPERATIONS_CENTER_EVENT");
  });
});
