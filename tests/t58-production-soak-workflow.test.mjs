import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(new URL("../.github/workflows/t58-production-soak.yml", import.meta.url), "utf8");

describe("automatic T58 workflow handoff", () => {
  it("keeps every collection job below the observed hosted-job limit", () => {
    assert.equal((workflow.match(/timeout-minutes: 27/g) ?? []).length, 3);
    assert.match(workflow, /name: Collect production T58 \(chunk 1\/3\)/);
    assert.match(workflow, /name: Collect production T58 \(chunk 2\/3\)/);
    assert.match(workflow, /name: Collect and analyze production T58 \(chunk 3\/3\)/);
    assert.match(workflow, /T57_CHUNK_SECONDS: "1200"/);
    assert.match(workflow, /T57_FINALIZE_CHUNK: "1"/);
  });

  it("hands off private checkpoints and archives only sanitized output", () => {
    assert.equal((workflow.match(/name: t58-journal-\$\{\{ github\.run_id \}\}-chunk[123]/g) ?? []).length, 3);
    assert.match(workflow, /retention-days: 7/);
    assert.match(workflow, /name: t58-sanitized-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
    assert.match(workflow, /needs\.collect_3\.outputs\.report_ready == 'true'/);
  });
});
