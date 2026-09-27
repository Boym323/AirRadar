#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const CSS_PATH = resolve(ROOT, "app/globals.css");
const REPORT_PATH = resolve(ROOT, "artifacts/visual-system-audit.json");

const BUDGET = {
  hardcodedColorsOutsideRoot: 393,
  uniqueHardcodedColorsOutsideRoot: 263,
  literalRadiiOutsideRoot: 155,
  literalFontSizesOutsideRoot: 538,
};

const REQUIRED_TOKENS = [
  "--background",
  "--surface",
  "--surface-elevated",
  "--surface-card",
  "--surface-card-strong",
  "--surface-glass",
  "--surface-overlay",
  "--border-default",
  "--border-accent",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--accent",
  "--selected",
  "--success",
  "--warning",
  "--danger",
  "--font-size-2xs",
  "--font-size-xs",
  "--font-size-sm",
  "--font-size-md",
  "--font-size-base",
  "--font-size-lg",
  "--font-size-xl",
  "--font-size-2xl",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-pill",
  "--motion-fast",
  "--motion-medium",
];

function rootBlock(css) {
  const start = css.indexOf(":root {");
  if (start < 0) throw new Error("globals.css is missing :root design tokens");

  let depth = 0;
  for (let index = start; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          root: css.slice(start, index + 1),
          outside: css.slice(0, start) + css.slice(index + 1),
        };
      }
    }
  }

  throw new Error("globals.css has an unterminated :root block");
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

export function analyzeVisualSystem(css) {
  const { root, outside } = rootBlock(css);
  const hardcodedHex = matches(outside, /#[0-9a-fA-F]{3,8}\\b/g);
  const hardcodedRgb = matches(outside, /rgba?\\([^)]*\\)/g);
  const hardcodedColors = [...hardcodedHex, ...hardcodedRgb];
  const literalRadii = matches(outside, /border-radius:\\s*([^;]+)/g)
    .map((value) => value.trim())
    .filter((value) => !value.includes("var(") && value !== "50%");
  const literalFontSizes = matches(outside, /font-size:\\s*([^;]+)/g)
    .map((value) => value.trim())
    .filter((value) => !value.includes("var(") && !value.includes("clamp("));

  return {
    requiredTokensMissing: REQUIRED_TOKENS.filter(
      (token) => !root.includes(token + ":"),
    ),
    hardcodedColorsOutsideRoot: hardcodedColors.length,
    uniqueHardcodedColorsOutsideRoot: new Set(hardcodedColors).size,
    literalRadiiOutsideRoot: literalRadii.length,
    literalFontSizesOutsideRoot: literalFontSizes.length,
    uniqueLiteralRadiiOutsideRoot: [...new Set(literalRadii)].sort(),
    uniqueLiteralFontSizesOutsideRoot: [...new Set(literalFontSizes)].sort(),
  };
}

export function assertVisualSystemBudget(report, budget = BUDGET) {
  const failures = [];
  if (report.requiredTokensMissing.length) {
    failures.push("missing required tokens: " + report.requiredTokensMissing.join(", "));
  }
  for (const [metric, maximum] of Object.entries(budget)) {
    if (report[metric] > maximum) {
      failures.push(metric + "=" + report[metric] + " exceeds budget " + maximum);
    }
  }
  if (failures.length) {
    throw new Error("Visual system audit failed:\\n- " + failures.join("\\n- "));
  }
}

function main() {
  const css = readFileSync(CSS_PATH, "utf8");
  const report = analyzeVisualSystem(css);
  assertVisualSystemBudget(report);

  mkdirSync(resolve(ROOT, "artifacts"), { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify({ budget: BUDGET, report }, null, 2) + "\\n",
    "utf8",
  );

  process.stdout.write(
    "[AirRadar visual] colors=" + report.hardcodedColorsOutsideRoot + "/" + BUDGET.hardcodedColorsOutsideRoot +
      " unique=" + report.uniqueHardcodedColorsOutsideRoot + "/" + BUDGET.uniqueHardcodedColorsOutsideRoot +
      " radii=" + report.literalRadiiOutsideRoot + "/" + BUDGET.literalRadiiOutsideRoot +
      " fontSizes=" + report.literalFontSizesOutsideRoot + "/" + BUDGET.literalFontSizesOutsideRoot + "\\n",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      "[AirRadar visual] " + (error instanceof Error ? error.message : String(error)) + "\\n",
    );
    process.exitCode = 1;
  }
}
