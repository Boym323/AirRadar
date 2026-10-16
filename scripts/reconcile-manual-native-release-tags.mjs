import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const MANUAL_NATIVE_RELEASES = Object.freeze([
  { tag: "v1.0.476", commit: "7d52997d1c8b3d49b3de098954cb1d19b1c4888e" },
  { tag: "v1.0.477", commit: "47a1286df70651b3cdc0ede28ac8d1d9154a7d67" },
]);

export function pendingNativeReleaseTags(currentTags) {
  const missing = [];
  for (const { tag, commit } of MANUAL_NATIVE_RELEASES) {
    const existing = currentTags.get(tag);
    if (existing && existing !== commit) {
      throw new Error("native_tag_target_mismatch:" + tag);
    }
    if (!existing) missing.push({ tag, commit });
  }
  return missing;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function remoteTagMap() {
  const lines = git("ls-remote", "--refs", "--tags", "origin").split("\n").filter(Boolean);
  return new Map(lines.map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return [ref.replace(/^refs\/tags\//, ""), sha];
  }));
}

async function main() {
  // Never enable this tag mutation in a PR, fork, manual execution, or
  // replay against a later unrelated branch.
  if (process.env.GITHUB_EVENT_NAME !== "push" ||
      process.env.GITHUB_REF !== "refs/heads/main" ||
      process.env.GITHUB_REPOSITORY !== "Boym323/AirRadar") {
    throw new Error("native_tag_repair_main_push_only");
  }

  const head = git("rev-parse", "HEAD");
  if (head !== process.env.GITHUB_SHA) throw new Error("native_tag_repair_head_mismatch");
  for (const { commit } of MANUAL_NATIVE_RELEASES) {
    if (git("rev-parse", "--verify", commit + "^{commit}") !== commit) {
      throw new Error("native_tag_repair_commit_not_available");
    }
    git("merge-base", "--is-ancestor", commit, head);
  }

  const pending = pendingNativeReleaseTags(remoteTagMap());
  if (pending.length === 0) {
    console.log("[AirRadar release] Manual native release tags already verified.");
    return;
  }

  // Public immutable deployed identity is a second guard against adding
  // historical tags from unrelated work. No privileged endpoint or secret.
  const response = await fetch("https://airradar.pomykal.cz/api/version", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("native_tag_repair_live_identity_unavailable");
  const version = await response.json();
  if (version.version !== "1.0.477" ||
      version.commit !== "47a1286d" ||
      version.channel !== "production") {
    throw new Error("native_tag_repair_live_identity_mismatch");
  }

  // Restore exactly the two documented manual release boundaries. No force,
  // no tag rewrite, no GitHub Release fabrication. Atomic push or no changes.
  for (const { tag, commit } of pending) git("tag", tag, commit);
  git("push", "--atomic", "origin", ...pending.map(({ tag }) => "refs/tags/" + tag));
  const after = pendingNativeReleaseTags(remoteTagMap());
  if (after.length) throw new Error("native_tag_repair_verification_failed");
  console.log("[AirRadar release] Verified manual native release tags restored: " +
    pending.map(({ tag }) => tag).join(", "));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[AirRadar release] " + (error instanceof Error ? error.message : "native_tag_repair_failed"));
    process.exitCode = 1;
  });
}
