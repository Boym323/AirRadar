import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
const policy = config.match(/Content-Security-Policy", value: "([^"]+)"/)?.[1];
const directive = (name: string) => policy?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + " "));

describe("V6 map provider CSP allowlist", () => {
  it("permits exactly configured satellite and DEM tile origins without a wildcard", () => {
    const connect = directive("connect-src");
    const images = directive("img-src");
    expect(connect).toBeDefined();
    for (const origin of ["https://tiles.maps.eox.at", "https://tiles.mapterhorn.com"]) {
      expect(connect).toContain(origin);
      expect(images).toContain(origin);
    }
    expect(connect).not.toMatch(/https:\/\/\*|\*\.eox|\*\.mapterhorn/);
  });
});
