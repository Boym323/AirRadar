import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("patched sharp production dependency", () => {
  it("pins the patched sharp and bundled libvips versions used by Next image optimization", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

    expect(pkg.overrides?.sharp).toBe("0.35.5");
    expect(lock.packages?.["node_modules/sharp"]?.version).toBe("0.35.5");
    expect(lock.packages?.["node_modules/@img/sharp-libvips-linux-x64"]?.version).toBe("1.3.4");
    expect(lock.packages?.["node_modules/@img/sharp-linux-x64"]?.version).toBe("0.35.5");
  });
});
