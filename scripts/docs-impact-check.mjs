/**
 * Advisory documentation-impact check for a Git diff.
 * Intentionally never mutates docs or blocks a PR on heuristic mappings.
 * Authoritative checks remain docs:check and features:check.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rules = [
  { name: "Native/Rust integration", matches: (p) => p.startsWith("native/"), docs: ["native/airradar-native/README.md", "docs/ARCHITECTURE.md"] },
  { name: "Aircraft ingest, network and event loop", matches: (p) => /^lib\/(server|radar)\//.test(p) && /(aircraft|beast|ingest|network|snapshot|state|sse|stream|fusion|twin|crc)/i.test(p), docs: ["docs/DATA-FLOWS.md", "docs/RUNTIME-INVARIANTS.md"] },
  { name: "External data providers", matches: (p) => /^lib\//.test(p) && /(provider|adsb|rxw|ogn|sondehub|flightaware)/i.test(p), docs: ["docs/DATA-SOURCES.md"] },
  { name: "Database schema and migrations", matches: (p) => /^(prisma\/|migrations\/)/.test(p), docs: ["docs/DEVELOPMENT.md", "docs/DATA-FLOWS.md"] },
  { name: "Routes and APIs", matches: (p) => /^app\/.*\/(page|route)\.[cm]?[jt]sx?$/.test(p), docs: ["docs/features.registry.json", "docs/FEATURES.md"] },
  { name: "UI and design system", matches: (p) => /^(components\/|app\/)/.test(p) && /\.[jt]sx?$/.test(p), docs: ["docs/VISUAL-SYSTEM.md"] },
  { name: "T58 runtime and soak workflows", matches: (p) => /^((\.github\/workflows\/|scripts\/|lib\/server\/).*t58|tests\/t58)/i.test(p), docs: ["docs/T58-PRODUCTION-SOAK.md"] },
  { name: "Release and recovery", matches: (p) => /^(deploy\/|\.github\/workflows\/(ci|ci-heavy|repository-metadata|codeql)\.yml$)/.test(p), docs: ["docs/RELEASE.md", "docs/RECOVERY.md"] },
];

function pairedDocument(path) {
  if (path.startsWith("docs/wiki/en/") && path.endsWith(".md")) return "docs/wiki/cs/" + path.slice("docs/wiki/en/".length);
  if (!path.startsWith("docs/") || path.startsWith("docs/cs/") || path.startsWith("docs/wiki/") || !path.endsWith(".md")) return null;
  return "docs/cs/" + path.slice("docs/".length);
}

export function analyzeDocumentationImpact(inputPaths) {
  const changed = new Set(inputPaths.filter(Boolean).map((p) => p.replaceAll("\\", "/")));
  const impacted = rules.flatMap((rule) => {
    const sourceFiles = [...changed].filter(rule.matches);
    if (sourceFiles.length === 0) return [];
    const documented = rule.docs.some((doc) => changed.has(doc));
    return [{ area: rule.name, docs: rule.docs, changedFiles: sourceFiles.length, documented }];
  });
  const untranslated = [...changed].flatMap((path) => {
    const partner = pairedDocument(path);
    return partner && !changed.has(partner) ? [{ source: path, partner }] : [];
  });
  return { count: changed.size, impacted, untranslated };
}

export function formatDocumentationImpact(report) {
  const out = ["## Documentation impact (advisory)", ""];
  out.push("Heuristic reminders only; no generated changes and no deployment authorization.");
  if (report.impacted.length === 0 && report.untranslated.length === 0) out.push("", "No mapped documentation impact detected.");
  for (const item of report.impacted) {
    const status = item.documented ? "reviewed in diff" : "review recommended";
    out.push("", "- " + item.area + ": **" + status + "** (" + item.changedFiles + " matching files). Candidates: " + item.docs.map((p) => "`" + p + "`").join(", "));
  }
  for (const item of report.untranslated) out.push("", "- EN/CZ edit pairing: `" + item.source + "` changed without `" + item.partner + "`.");
  out.push("", "Confirm semantic accuracy manually. Run `npm run docs:check` and `npm run features:check` as applicable.", "");
  return out.join("\n");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}

function main() {
  const flag = process.argv.indexOf("--base");
  const base = flag >= 0 ? process.argv[flag + 1] : git(["merge-base", "HEAD", "origin/main"]);
  if (!base || base.startsWith("-")) throw new Error("Provide a valid git base using --base <sha>");
  const raw = execFileSync("git", ["diff", "--name-only", "-z", base, "HEAD"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const content = formatDocumentationImpact(analyzeDocumentationImpact(raw.split("\0")));
  console.log(content);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, content + "\n", "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error("Documentation impact check could not run:", error.message);
    process.exitCode = 1;
  }
}
