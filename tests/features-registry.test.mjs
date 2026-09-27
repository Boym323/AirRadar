import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  discoverRoutes,
  renderRegistrySection,
  updateFeaturesDocument,
  validateRegistry,
} from "../scripts/features-registry.mjs";

const registry = JSON.parse(
  readFileSync(new URL("../docs/features.registry.json", import.meta.url), "utf8"),
);
const featuresDocument = readFileSync(
  new URL("../docs/FEATURES.md", import.meta.url),
  "utf8",
);

describe("feature registry", () => {
  it("covers every current page and API route without stale surfaces", () => {
    const discovered = discoverRoutes();
    expect(validateRegistry(registry, discovered)).toEqual([]);
    expect(discovered.pages.length).toBeGreaterThan(0);
    expect(discovered.apis.length).toBeGreaterThan(0);
  });

  it("keeps the generated FEATURES.md registry section synchronized", () => {
    const expected = updateFeaturesDocument(
      featuresDocument,
      renderRegistrySection(registry),
    );
    expect(expected).toBe(featuresDocument);
  });

  it("reports missing and stale route ownership", () => {
    const sample = {
      schemaVersion: 1,
      features: [
        {
          id: "sample",
          name: "Sample",
          category: "test",
          status: "production",
          summary: "Sample feature.",
          pages: ["/stale"],
          apis: [],
        },
      ],
    };

    expect(
      validateRegistry(sample, { pages: ["/current"], apis: ["/api/current"] }),
    ).toEqual(
      expect.arrayContaining([
        "unregistered page route: /current",
        "unregistered API route: /api/current",
        "stale registered page route: /stale",
      ]),
    );
  });
});
