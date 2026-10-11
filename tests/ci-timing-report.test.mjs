import test from "node:test";
import assert from "node:assert/strict";
import { timingReport } from "../scripts/ci-timing-report.mjs";

test("report measures parallel wall clock rather than sum of jobs", () => {
  const report = timingReport({ jobs: [
    { name: "Release scope", conclusion: "success", started_at: "2026-10-11T10:00:00Z", completed_at: "2026-10-11T10:00:05Z" },
    { name: "Release validation", conclusion: "success", started_at: "2026-10-11T10:00:05Z", completed_at: "2026-10-11T10:02:30Z" },
    { name: "Release tests and typecheck", conclusion: "success", started_at: "2026-10-11T10:00:05Z", completed_at: "2026-10-11T10:01:30Z" },
    { name: "Deploy production", conclusion: "success", started_at: "2026-10-11T10:02:30Z", completed_at: "2026-10-11T10:03:00Z" },
  ] });
  assert.equal(report.totalSeconds, 180);
  assert.match(report.markdown, /3m 00s/);
});
test("incomplete deployment never reports a successful total", () => {
  const result = timingReport({ jobs: [{ name: "Deploy production", conclusion: "failure", started_at: "2026-10-11T10:00:00Z" }] });
  assert.equal(result.totalSeconds, null);
});
test("rejects unrecognized input", () => assert.throws(() => timingReport({}), /jobs payload/));
