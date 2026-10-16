import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_NATIVE_RELEASES,
  pendingNativeReleaseTags,
} from "../scripts/reconcile-manual-native-release-tags.mjs";

describe("manual native release reconciliation gate", () => {
  it("never creates more than the two known, historically deployed tags", () => {
    assert.deepEqual(pendingNativeReleaseTags(new Map()), MANUAL_NATIVE_RELEASES);
  });

  it("does nothing when exact tag targets already exist", () => {
    assert.deepEqual(pendingNativeReleaseTags(new Map(
      MANUAL_NATIVE_RELEASES.map(({ tag, commit }) => [tag, commit]),
    )), []);
  });

  it("recovers only missing tags and never overwrites an existing target", () => {
    const [first, second] = MANUAL_NATIVE_RELEASES;
    assert.deepEqual(
      pendingNativeReleaseTags(new Map([[first.tag, first.commit]])),
      [second],
    );
    assert.throws(
      () => pendingNativeReleaseTags(new Map([[second.tag, first.commit]])),
      /native_tag_target_mismatch:v1\.0\.477/,
    );
  });
});
