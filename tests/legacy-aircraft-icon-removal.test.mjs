import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const retained = join(root, "public/aircraft-icons-tar1090");
const old = join(root, "public/aircraft-icons");
const sourceDirs = ["app", "components", "lib", "scripts"];
const sourceExtensions = /\.(?:js|jsx|mjs|ts|tsx|css)$/;

function findLegacyReferences(directory) {
  const references = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) references.push(...findLegacyReferences(path));
    else if (entry.isFile() && sourceExtensions.test(entry.name)) {
      if (/(?:public\/|\/)aircraft-icons\//.test(readFileSync(path, "utf8"))) references.push(path);
    }
  }
  return references;
}

describe("removed legacy aircraft icon catalog", () => {
  it("keeps the maintained tar1090 icons while dropping the superseded catalog", () => {
    expect(existsSync(old)).toBe(false);
    expect(existsSync(join(retained, "A320.svg"))).toBe(true);
    expect(existsSync(join(retained, "unknown.svg"))).toBe(true);
  });

  it("does not reference legacy static icon URLs in runtime and build sources", () => {
    expect(sourceDirs.flatMap((dir) => findLegacyReferences(join(root, dir)))).toEqual([]);
  });
});
