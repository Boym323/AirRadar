import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsDir = path.join(root, "docs");
const targetDir = path.join(docsDir, "cs");
const wikiSourceDir = path.join(docsDir, "wiki", "en");
const wikiTargetDir = path.join(docsDir, "wiki", "cs");

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

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(full);
    }
  }
  return result.sort();
}

function structure(text) {
  const lines = text.split("\n");
  return {
    headings: lines.filter((line) => /^#{1,6}\s/.test(line)).length,
    fences: lines.filter((line) => /^\s*\x60\x60\x60/.test(line)).length,
    tables: lines.filter((line) => /^\s*\|/.test(line)).length,
    orderedLists: lines.filter((line) => /^\s*\d+[.)]\s/.test(line)).length,
  };
}

function markdownLinks(text) {
  return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function compactLength(text) {
  return text.replace(/\s/g, "").length;
}

function isExternalLink(link) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link);
}

function splitLink(link) {
  const hashIndex = link.indexOf("#");
  const withoutHash = hashIndex >= 0 ? link.slice(0, hashIndex) : link;
  const fragment = hashIndex >= 0 ? link.slice(hashIndex + 1) : "";
  const queryIndex = withoutHash.indexOf("?");
  return {
    pathname: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
    query: queryIndex >= 0 ? withoutHash.slice(queryIndex) : "",
    fragment,
  };
}

function logicalRepoPath(filePath) {
  let relative = path.relative(root, filePath).split(path.sep).join("/");
  if (relative.startsWith("docs/cs/")) {
    relative = "docs/" + relative.slice("docs/cs/".length);
  } else if (relative.startsWith("docs/wiki/cs/")) {
    relative = "docs/wiki/" + relative.slice("docs/wiki/cs/".length);
  } else if (relative.startsWith("docs/wiki/en/")) {
    relative = "docs/wiki/" + relative.slice("docs/wiki/en/".length);
  }
  return relative;
}

function normalizedLink(link, fromFile) {
  if (link.startsWith("#")) return { kind: "anchor", value: link };
  if (isExternalLink(link)) return { kind: "external", value: link };

  const parts = splitLink(link);
  if (!parts.pathname) return { kind: "anchor", value: link };

  const resolved = path.resolve(path.dirname(fromFile), parts.pathname);
  return {
    kind: "local",
    value: logicalRepoPath(resolved) + parts.query,
    resolved,
  };
}

function compareLinks(errors, label, sourceText, targetText, sourcePath, targetPath) {
  const sourceLinks = markdownLinks(sourceText);
  const targetLinks = markdownLinks(targetText);

  if (sourceLinks.length !== targetLinks.length) {
    errors.push(label + ": Markdown link count differs (EN " + sourceLinks.length + ", CS " + targetLinks.length + ")");
    return;
  }

  for (let index = 0; index < sourceLinks.length; index += 1) {
    const source = normalizedLink(sourceLinks[index], sourcePath);
    const target = normalizedLink(targetLinks[index], targetPath);

    if (source.kind === "anchor" && target.kind === "anchor") continue;

    if (source.kind !== target.kind || source.value !== target.value) {
      errors.push(
        label + ": Markdown link #" + (index + 1) + " differs logically (EN \"" +
        sourceLinks[index] + "\", CS \"" + targetLinks[index] + "\")",
      );
      continue;
    }

    if (target.kind === "local") {
      const targetWithoutFragment = splitLink(targetLinks[index]).pathname;
      if (targetWithoutFragment && !fs.existsSync(target.resolved)) {
        errors.push(
          label + ": Czech Markdown link #" + (index + 1) + " points to missing path \"" +
          path.relative(root, target.resolved) + "\"",
        );
      }
    }
  }
}

function compareDocument(errors, label, sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    errors.push(label + ": missing Czech translation (" + path.relative(root, targetPath) + ")");
    return;
  }

  const sourceText = read(sourcePath);
  const targetText = read(targetPath);
  const source = structure(sourceText);
  const target = structure(targetText);

  for (const key of Object.keys(source)) {
    if (source[key] !== target[key]) {
      errors.push(label + ": " + key + " differs (EN " + source[key] + ", CS " + target[key] + ")");
    }
  }

  const sourceLength = compactLength(sourceText);
  const targetLength = compactLength(targetText);
  const ratio = sourceLength === 0 ? 1 : targetLength / sourceLength;
  if (ratio < minTranslationRatio || ratio > maxTranslationRatio) {
    errors.push(
      label + ": translation size ratio " + ratio.toFixed(2) + " is outside " +
      minTranslationRatio.toFixed(2) + "-" + maxTranslationRatio.toFixed(2),
    );
  }

  compareLinks(errors, label, sourceText, targetText, sourcePath, targetPath);

  const upperTarget = targetText.toUpperCase();
  for (const marker of failureMarkers) {
    if (upperTarget.includes(marker)) {
      errors.push(label + ": contains translation failure marker \"" + marker + "\"");
    }
  }
}

const errors = [];

const sourceDocuments = walkMarkdown(docsDir).filter((file) => {
  const relative = path.relative(docsDir, file).split(path.sep).join("/");
  return !relative.startsWith("cs/") && !relative.startsWith("wiki/");
});

for (const sourcePath of sourceDocuments) {
  const relative = path.relative(docsDir, sourcePath);
  compareDocument(
    errors,
    relative.split(path.sep).join("/"),
    sourcePath,
    path.join(targetDir, relative),
  );
}

const wikiSources = walkMarkdown(wikiSourceDir);
for (const sourcePath of wikiSources) {
  const relative = path.relative(wikiSourceDir, sourcePath);
  compareDocument(
    errors,
    "wiki/" + relative.split(path.sep).join("/"),
    sourcePath,
    path.join(wikiTargetDir, relative),
  );
}

if (errors.length) {
  console.error("Czech documentation check failed:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log(
  "Czech documentation check passed (" + sourceDocuments.length + " docs, " +
  wikiSources.length + " wiki pages).",
);
