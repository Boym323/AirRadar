#!/usr/bin/env node

const SAFE_DOCUMENTATION_FILES = new Set([
  "README.md",
  "CHANGELOG.md",
  "docs/metrics/code-history.json",
  "docs/metrics/code-growth.svg",
]);

/** Classify changed paths; unknown and machine-readable paths fail safe to deploy. */
export function classifyPath(filePath) {
  if (SAFE_DOCUMENTATION_FILES.has(filePath)) return "non-deploy";
  if (filePath.startsWith("docs/") && filePath.endsWith(".md")) return "non-deploy";
  return "deploy";
}

export function classifyReleaseScope(files) {
  const classification = files.map((path) => ({ path, scope: classifyPath(path) }));
  return {
    deploy: classification.some(({ scope }) => scope === "deploy"),
    classification,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const files = args[0] === "--stdin0"
    ? (await readStdin()).split("\0").filter(Boolean)
    : args;
  process.stdout.write(`${JSON.stringify(classifyReleaseScope(files))}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
