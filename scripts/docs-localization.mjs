import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "docs");
const targetDir = path.join(sourceDir, "cs");
const sources = [
  "ARCHITECTURE.md",
  "DATA-FLOWS.md",
  "DATA-SOURCES.md",
  "DEVELOPMENT.md",
  "FEATURES.md",
  "RELEASE.md",
  "RUNTIME-INVARIANTS.md",
  "VISUAL-SYSTEM.md",
];

const wikiSourceDir = path.join(sourceDir, "wiki", "en");
const wikiTargetDir = path.join(sourceDir, "wiki", "cs");
const wikiSources = [
  "README.md",
  "getting-started.md",
  "architecture.md",
  "configuration.md",
  "development.md",
  "operations.md",
];

const failureMarkers = [
  "QUERY LENGTH LIMIT EXCEEDED",
  "TRANSLATION FAILED",
  "TODO: TRANSLATE",
];

const minTranslationRatio = 0.75;
const maxTranslationRatio = 1.35;

function read(file) {
  return fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

function structure(text) {
  const lines = text.split("\n");
  return {
    headings: lines.filter((line) => /^#{1,6}\s/.test(line)).length,
    fences: lines.filter((line) => /^\s*```/.test(line)).length,
    tables: lines.filter((line) => /^\s*\|/.test(line)).length,
    orderedLists: lines.filter((line) => /^\s*\d+[.)]\s/.test(line)).length,
  };
}

function markdownLinks(text) {
  return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .sort();
}

function compactLength(text) {
  return text.replace(/\s/g, "").length;
}

function compareDocument(errors, label, sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    errors.push(`${label}: missing Czech translation (${path.relative(root, targetPath)})`);
    return;
  }

  const sourceText = read(sourcePath);
  const targetText = read(targetPath);
  const source = structure(sourceText);
  const target = structure(targetText);

  for (const key of Object.keys(source)) {
    if (source[key] !== target[key]) {
      errors.push(`${label}: ${key} differs (EN ${source[key]}, CS ${target[key]})`);
    }
  }

  const sourceLength = compactLength(sourceText);
  const targetLength = compactLength(targetText);
  const ratio = sourceLength === 0 ? 1 : targetLength / sourceLength;
  if (ratio < minTranslationRatio || ratio > maxTranslationRatio) {
    errors.push(
      `${label}: translation size ratio ${ratio.toFixed(2)} is outside ` +
        `${minTranslationRatio.toFixed(2)}-${maxTranslationRatio.toFixed(2)}`,
    );
  }

  const sourceLinks = markdownLinks(sourceText);
  const targetLinks = markdownLinks(targetText);
  if (JSON.stringify(sourceLinks) !== JSON.stringify(targetLinks)) {
    errors.push(`${label}: Markdown link destinations differ between EN and CS`);
  }

  for (const marker of failureMarkers) {
    if (targetText.toUpperCase().includes(marker)) {
      errors.push(`${label}: contains translation failure marker "${marker}"`);
    }
  }
}

const errors = [];

for (const name of sources) {
  compareDocument(
    errors,
    name,
    path.join(sourceDir, name),
    path.join(targetDir, name),
  );
}

for (const name of wikiSources) {
  compareDocument(
    errors,
    `wiki/${name}`,
    path.join(wikiSourceDir, name),
    path.join(wikiTargetDir, name),
  );
}

if (errors.length) {
  console.error("Czech documentation check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Czech documentation check passed (${sources.length} authoritative documents, ` +
    `${wikiSources.length} wiki pages).`,
);
