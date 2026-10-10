import { describe, expect, it, vi } from "vitest";
import { WindAloftProvider } from "../lib/server/wind-aloft";

const instant = Date.parse("2026-10-10T12:00:00Z");
const payload = {
  latitude: 49.25, longitude: 17.65,
  model_run: "2026-10-10T06:00",
  hourly: {
    time: ["2026-10-10T12:00", "2026-10-10T13:00"],
    wind_speed_300hPa: [40, 45],
    wind_direction_300hPa: [270, 280],
  },
};

describe("ALADIN-CE optional wind model", () => {
  it("uses CHMI 2 km central Europe forecast pressure levels, never CZ 1 km", async () => {
    const mock = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new WindAloftProvider(mock as unknown as typeof fetch, () => instant, "ALADIN-CE");
    const result = await provider.getWind(300);
    expect(result.model).toBe("ALADIN-CE");
    expect(result.provider).toBe("ČHMÚ / Open-Meteo");
    expect(result.levelHpa).toBe(300);
    expect(result.points[0]).toMatchObject({ lat: 49.25, lon: 17.65, speedKt: 40, directionDeg: 270 });
    const url = new URL(String(mock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("models")).toBe("chmi_aladin_central_europe_2km");
    expect(url.searchParams.get("hourly")).toContain("wind_speed_300hPa");
    await provider.getWind(300);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("leaves the default ICON-EU provider canonical and unmodified", async () => {
    const mock = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(payload)));
    const provider = new WindAloftProvider(mock as unknown as typeof fetch, () => instant);
    expect((await provider.getWind(300)).model).toBe("ICON-EU");
    const url = new URL(String(mock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v1/dwd-icon");
    expect(url.searchParams.get("models")).toBe("icon_eu");
  });
});
