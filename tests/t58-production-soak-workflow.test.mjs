import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(new URL("../.github/workflows/t58-production-soak.yml", import.meta.url), "utf8");
const chunkWorkflow = readFileSync(new URL("../.github/workflows/t58-soak-chunk.yml", import.meta.url), "utf8");

describe("automatic T58 workflow handoff", () => {
  it("keeps every collection job below the observed hosted-job limit", () => {
    assert.equal((workflow.match(/chunk_seconds: 540/g) ?? []).length, 7);
    assert.equal((workflow.match(/name: Collect production T58 \(chunk [1-6]\/7\)/g) ?? []).length, 6);
    assert.match(workflow, /name: Collect and analyze production T58 \(chunk 7\/7\)/);
    assert.equal((chunkWorkflow.match(/timeout-minutes: 9/g) ?? []).length, 1);
    assert.match(chunkWorkflow, /T57_CHUNK_SECONDS: \$\{\{ inputs\.chunk_seconds \}\}/);
    assert.match(chunkWorkflow, /T57_FINALIZE_CHUNK: \$\{\{ inputs\.finalize && '1' \|\| '0' \}\}/);
  });

  it("hands off private checkpoints and archives only sanitized output", () => {
    assert.match(chunkWorkflow, /name: t58-journal-\$\{\{ github\.run_id \}\}-chunk\$\{\{ inputs\.chunk \}\}/);
    assert.match(chunkWorkflow, /retention-days: 7/);
    assert.match(chunkWorkflow, /name: t58-sanitized-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
    assert.match(workflow, /needs\.chunk_7\.outputs\.report_ready == 'true'/);
    assert.match(chunkWorkflow, /T57_PUBLIC_ONLY: "1"/);
    assert.doesNotMatch(chunkWorkflow, /T58_WATCHLIST_ADMIN_TOKEN/);
    assert.match(chunkWorkflow, /verdict !== "PASS_WITH_LIMITATIONS"/);
  });
});
