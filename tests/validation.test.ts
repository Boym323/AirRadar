import { describe, expect, it } from "vitest";
import { normalizeIcaoHex } from "@/lib/server/validation";

describe("public aircraft identifier validation", () => {
  it.each([["abc123", "ABC123"], [" 896139 ", "896139"], ["~abc123", "~ABC123"]])("normalizes valid readsb aircraft identifier %j", (value, expected) => {
    expect(normalizeIcaoHex(value)).toBe(expected);
  });

  it.each(["", "abc12", "abcdef0", "abc12g", "postgresql://db", "../../etc/passwd"]) ("rejects unsafe ICAO identifier %j", (value) => {
    expect(normalizeIcaoHex(value)).toBeNull();
  });
});
