import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Spotter Geolocation Permissions Policy", () => {
  it("permits same-origin GPS access but denies cross-origin delegation and other sensors", async () => {
    const routes = await nextConfig.headers?.();
    const global = routes?.find(route => route.source === "/(.*)");
    const value = global?.headers.find(header => header.key === "Permissions-Policy")?.value;
    expect(value).toBe("camera=(), geolocation=(self), microphone=(), payment=(), usb=()");
    expect(value).not.toContain("geolocation=()");
  });
});
