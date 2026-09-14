import { describe, expect, it } from "vitest";
import { isAtcValidityValid } from "@/lib/server/atc-validity";

describe("ATC validity intervals", () => {
  const before = new Date("2026-09-12T12:00:00Z");
  const after = new Date("2026-09-14T12:00:00Z");

  it("supports an open start", () => {
    expect(isAtcValidityValid("2026-09-13T00:00:00Z", null, before)).toBe(false);
    expect(isAtcValidityValid("2026-09-13T00:00:00Z", null, after)).toBe(true);
  });

  it("supports an open end", () => {
    expect(isAtcValidityValid(null, "2026-09-13T00:00:00Z", after)).toBe(false);
    expect(isAtcValidityValid(null, "2026-09-13T00:00:00Z", before)).toBe(true);
  });

  it("accepts a fully open or closed interval only in range", () => {
    expect(isAtcValidityValid(null, null, before)).toBe(true);
    expect(isAtcValidityValid("2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z", before)).toBe(false);
    expect(isAtcValidityValid("2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z", new Date("2026-09-13T12:00:00Z"))).toBe(true);
    expect(isAtcValidityValid("2026-09-13T00:00:00Z", "2026-09-14T00:00:00Z", after)).toBe(false);
  });

  it("fails safely for invalid timestamps", () => {
    expect(isAtcValidityValid("not-a-date", null, before)).toBe(false);
    expect(isAtcValidityValid(null, null, new Date("invalid"))).toBe(false);
  });
});
