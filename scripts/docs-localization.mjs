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

const errors = [];
for (const name of sources) {
  const sourcePath = path.join(sourceDir, name);
  const targetPath = path.join(targetDir, name);
  if (!fs.existsSync(targetPath)) {
    errors.push(`${name}: missing Czech translation (${path.relative(root, targetPath)})`);
    continue;
  }
  const source = structure(read(sourcePath));
  const target = structure(read(targetPath));
  for (const key of Object.keys(source)) {
    if (source[key] !== target[key]) {
      errors.push(`${name}: ${key} differs (EN ${source[key]}, CS ${target[key]})`);
    }
  }
}

if (errors.length) {
  console.error("Czech documentation check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Czech documentation check passed (${sources.length} documents).`);
