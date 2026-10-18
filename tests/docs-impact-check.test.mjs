import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDocumentationImpact, formatDocumentationImpact } from "../scripts/docs-impact-check.mjs";

test("targeted T58 changes route to T58 docs, without reading other files", () => {
  const report = analyzeDocumentationImpact(["scripts/t58-stall-canary.sh", "docs/T58-PRODUCTION-SOAK.md", "docs/cs/T58-PRODUCTION-SOAK.md"]);
  const matched = report.impacted.find((x) => x.area === "T58 runtime and soak workflows");
  assert.ok(matched);
  assert.equal(matched.documented, true);
  assert.deepEqual(report.untranslated, []);
});

test("native and database work produces bounded review candidates", () => {
  const report = analyzeDocumentationImpact(["native/airradar-native/src/lib.rs", "prisma/contract.prisma"]);
  assert.ok(report.impacted.some((x) => x.area === "Native/Rust integration"));
  assert.ok(report.impacted.some((x) => x.area === "Database schema and migrations"));
  assert.ok(report.impacted.every((x) => x.documented === false));
});

test("English documentation edits missing a Czech partner are reported", () => {
  const report = analyzeDocumentationImpact(["docs/ARCHITECTURE.md", "docs/wiki/en/getting-started.md"]);
  assert.deepEqual(report.untranslated.map((x) => x.partner), [
    "docs/cs/ARCHITECTURE.md",
    "docs/wiki/cs/getting-started.md",
  ]);
  assert.match(formatDocumentationImpact(report), /EN\/CZ edit pairing/);
});

test("historical metadata and paired documentation avoid noisy advisories", () => {
  const report = analyzeDocumentationImpact([
    "CHANGELOG.md", "docs/metrics/code-growth.svg", "docs/CODEX-CONTEXT.md", "docs/cs/CODEX-CONTEXT.md",
  ]);
  assert.equal(report.impacted.length, 0);
  assert.equal(report.untranslated.length, 0);
  assert.match(formatDocumentationImpact(report), /No mapped documentation impact/);
});

test("a root page and a nested API route both point to the feature registry", () => {
  const report = analyzeDocumentationImpact(["app/page.tsx", "app/api/new/route.ts"]);
  assert.ok(report.impacted.some((x) => x.docs.includes("docs/features.registry.json")));
  assert.equal(report.impacted.find((x) => x.area === "Routes and APIs")?.changedFiles, 2);
});
