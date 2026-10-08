import { fileURLToPath } from "node:url";

const critical = [
  /^app\/api\/(?:stream|system|health)(?:\/|$)/,
  /^lib\/server\/(?:sse-capacity|runtime-diagnostics|system-status[^/]*|aircraft-state|source-reliability)(?:\.[cm]?[jt]s|$)/,
  /^scripts\/(?:prepare-standalone|production-gates)\.mjs$/,
  /^deploy\//,
  /^next\.config\.[cm]?[jt]s$/,
];

export function needsCriticalRuntimeSmoke(paths) {
  return paths.some((path) =>
    typeof path === "string" && !path.includes("\0") && critical.some((pattern) => pattern.test(path.replaceAll("\\", "/"))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv.includes("--stdin0")) {
    console.error("Usage: node scripts/ci-critical-scope.mjs --stdin0");
    process.exitCode = 2;
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const paths = Buffer.concat(chunks).toString("utf8").split("\0").filter(Boolean);
    process.stdout.write(needsCriticalRuntimeSmoke(paths) ? "true" : "false");
  }
}
