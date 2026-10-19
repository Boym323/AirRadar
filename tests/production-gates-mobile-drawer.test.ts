import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Production-gates is a runtime-only ESM file consumed by Node.
import { ensureRadarTrafficRowVisible, waitForCompactRadarTrafficDrawer } from "../scripts/production-gates.mjs";

afterEach(() => vi.unstubAllGlobals());

function fixture({ open = false, expanded = false, viewportWidth = 390 } = {}) {
  const steps: string[] = [];
  let trafficOpen = open;
  let mobileExpanded = expanded;

  const aircraftRow = {
    waitFor: vi.fn(async () => {
      if (!trafficOpen || (viewportWidth <= 820 && !mobileExpanded)) {
        throw new Error("aircraft row is hidden");
      }
      steps.push("row-visible");
    }),
  };
  const collapse = {
    waitFor: vi.fn(async () => {
      if (!trafficOpen) throw new Error("collapse button cannot be seen in closed drawer");
      steps.push("collapse-visible");
    }),
    getAttribute: vi.fn(async () => mobileExpanded ? "true" : "false"),
    click: vi.fn(async () => {
      mobileExpanded = true;
      steps.push("expand-click");
    }),
  };
  const sidebar = {
    getAttribute: vi.fn(async () => trafficOpen ? "false" : "true"),
    locator: vi.fn((selector: string) => {
      if (selector === ".mobile-collapse") return collapse;
      if (selector === ".aircraft-row") return { first: () => aircraftRow };
      throw new Error(`Unknown child selector: ${selector}`);
    }),
  };
  const trigger = {
    waitFor: vi.fn(async () => { steps.push("trigger-visible"); }),
    click: vi.fn(async () => {
      trafficOpen = true;
      mobileExpanded = false;
      steps.push("trigger-click");
    }),
  };
  const page = {
    locator: vi.fn((selector: string) => {
      if (selector === '[data-testid="radar-sidebar"]') return sidebar;
      if (selector === '[data-testid="traffic-trigger"]') return trigger;
      if (selector === '[data-testid="radar-sidebar"].drawer-traffic') {
        return { waitFor: async () => {
          if (!trafficOpen) throw new Error("traffic drawer not yet open");
          steps.push("traffic-visible");
        } };
      }
      if (selector === '[data-testid="radar-sidebar"].drawer-traffic:not(.compact)') {
        return { waitFor: async () => {
          if (!trafficOpen || !mobileExpanded) throw new Error("drawer still compact");
          steps.push("expanded-visible");
        } };
      }
      throw new Error(`Unknown selector: ${selector}`);
    }),
  };
  return { page, steps, trigger, collapse, aircraftRow };
}

describe("mobile traffic drawer production smoke synchronization", () => {
  it("waits for the compact traffic drawer", async () => {
    const waitFor = vi.fn(async () => undefined);
    const page = {
      locator: vi.fn(() => ({ waitFor })),
    };

    await waitForCompactRadarTrafficDrawer(page as never, 375);

    expect(page.locator).toHaveBeenCalledWith('[data-testid="radar-sidebar"].drawer-traffic.compact');
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 15_000 });
  });

  it("includes drawer state in the compact traffic timeout diagnostic", async () => {
    vi.stubGlobal("document", { querySelector: () => ({ getAttribute: () => "true" }) });
    vi.stubGlobal("getComputedStyle", () => ({ visibility: "hidden", display: "block" }));
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const sidebarElement = {
      className: "sidebar drawer-closed compact",
      getAttribute: () => "true",
      querySelector: () => ({ getAttribute: () => "false" }),
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    };
    const page = {
      locator: vi.fn((selector: string) => selector.includes(".drawer-traffic.compact")
        ? { waitFor: async () => { throw new Error("drawer missing"); } }
        : { evaluate: async (callback: (element: typeof sidebarElement, width: number) => unknown, width: number) => callback(sidebarElement, width) }),
    };

    await expect(waitForCompactRadarTrafficDrawer(page as never, 375))
      .rejects.toThrow(/Mobile compact traffic drawer did not open:.*375.*drawer missing/);
  });

  it("waits for traffic drawer to open before expanding the initially hidden mobile list", async () => {
    const { page, steps, trigger, collapse, aircraftRow } = fixture();
    const row = await ensureRadarTrafficRowVisible(page, 390, "radar-mobile-selected-expanded");

    expect(row).toBe(aircraftRow);
    expect(trigger.click).toHaveBeenCalledOnce();
    expect(collapse.click).toHaveBeenCalledOnce();
    expect(steps).toEqual([
      "trigger-visible", "trigger-click", "traffic-visible",
      "collapse-visible", "expand-click", "expanded-visible", "row-visible",
    ]);
  });

  it("does not collapse an already-expanded traffic drawer", async () => {
    const { page, steps, trigger, collapse } = fixture({ open: true, expanded: true });
    await ensureRadarTrafficRowVisible(page, 390);

    expect(trigger.click).not.toHaveBeenCalled();
    expect(collapse.click).not.toHaveBeenCalled();
    expect(steps).toEqual(["traffic-visible", "collapse-visible", "expanded-visible", "row-visible"]);
  });

  it("does not require mobile expansion for a desktop viewport", async () => {
    const { page, steps, collapse } = fixture({ viewportWidth: 1366 });
    await ensureRadarTrafficRowVisible(page, 1366, "radar-desktop-selected");

    expect(collapse.waitFor).not.toHaveBeenCalled();
    expect(steps).toEqual(["trigger-visible", "trigger-click", "traffic-visible", "row-visible"]);
  });
});
