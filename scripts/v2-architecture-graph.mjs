#!/usr/bin/env node
/**
 * V2-01 architecture dependency audit. Pure static analysis: no app imports,
 * providers, network requests, database connections or runtime side effects.
 *
 * Usage:
 *   node scripts/v2-architecture-graph.mjs [--root=DIR] [--json] [--check] [--strict]
 *   node scripts/v2-architecture-graph.mjs --dot=artifacts/v2-01-dependencies.dot
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirs = ["app", "components", "lib", "scripts"];
const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const extensionSet = new Set(extensions);

function listFiles(root) {
  const files = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "generated") continue;
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(resolved);
      else if (entry.isFile() && extensionSet.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
        files.push(path.relative(root, resolved).replaceAll(path.sep, "/"));
      }
    }
  }
  for (const directory of sourceDirs) walk(path.join(root, directory));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && extensionSet.has(path.extname(entry.name))) files.push(entry.name);
  }
  return files.sort();
}

function extractImports(file, source) {
  const syntax = /\.tsx$|\.jsx$/.test(file) ? ts.ScriptKind.TSX : /\.mjs$|\.js$|\.cjs$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, syntax);
  const result = [];
  function record(moduleName, kind) {
    if (typeof moduleName === "string") result.push({ moduleName, kind });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allTypeOnly = Boolean(clause?.isTypeOnly || (clause && !clause.name
        && named && ts.isNamedImports(named) && named.elements.length > 0
        && named.elements.every((element) => element.isTypeOnly)));
      record(node.moduleSpecifier.text, allTypeOnly ? "type" : "runtime");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const exports = node.exportClause;
      const allTypeOnly = Boolean(node.isTypeOnly || (exports && ts.isNamedExports(exports)
        && exports.elements.length > 0 && exports.elements.every((element) => element.isTypeOnly)));
      record(node.moduleSpecifier.text, allTypeOnly ? "type" : "runtime");
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        record(node.arguments[0].text, "runtime");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const client = ast.statements.some((statement) => ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client");
  return { imports: result, client };
}

function resolveLocal(from, specifier, files, root) {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/")
    ? path.resolve(root, specifier.slice(2))
    : path.resolve(root, path.dirname(from), specifier);
  if (!base.startsWith(root + path.sep)) return null;
  const candidates = [base, ...extensions.map((ext) => base + ext), ...extensions.map((ext) => path.join(base, "index" + ext))];
  for (const candidate of candidates) {
    const name = path.relative(root, candidate).replaceAll(path.sep, "/");
    if (files.has(name)) return name;
  }
  return null;
}

function stronglyConnected(nodes, edges) {
  const neighbors = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) if (edge.kind === "runtime") neighbors.get(edge.from)?.push(edge.to);
  let nextIndex = 0;
  const index = new Map(), low = new Map(), stack = [], active = new Set(), cycles = [];
  function dfs(node) {
    index.set(node, nextIndex);
    low.set(node, nextIndex++);
    stack.push(node); active.add(node);
    for (const to of neighbors.get(node) ?? []) {
      if (!index.has(to)) { dfs(to); low.set(node, Math.min(low.get(node), low.get(to))); }
      else if (active.has(to)) low.set(node, Math.min(low.get(node), index.get(to)));
    }
    if (low.get(node) !== index.get(node)) return;
    const component = [];
    let current;
    do { current = stack.pop(); active.delete(current); component.push(current); } while (current !== node);
    if (component.length > 1 || (neighbors.get(node) ?? []).includes(node)) cycles.push(component.sort());
  }
  for (const node of nodes) if (!index.has(node)) dfs(node);
  return cycles.sort((a, b) => a.join(",").localeCompare(b.join(",")));
}

function classify(file) {
  if (file.startsWith("lib/contracts/")) return "public-dto";
  if (file.startsWith("lib/ports/")) return "provider-port";
  if (file.startsWith("lib/server/")) return "server";
  if (file.startsWith("lib/aircraft/")) return "domain";
  if (file.startsWith("lib/radar/")) return "ui-adapter";
  if (file.startsWith("lib/")) return "shared";
  if (file.startsWith("app/api/")) return "api";
  if (file.startsWith("components/") || file.startsWith("app/")) return "ui";
  return "build-tool";
}

function analyze(root) {
  const paths = listFiles(root), files = new Set(paths), edges = [], clients = new Set();
  for (const from of paths) {
    const source = fs.readFileSync(path.join(root, from), "utf8");
    const parsed = extractImports(from, source);
    if (parsed.client) clients.add(from);
    for (const dependency of parsed.imports) {
      const to = resolveLocal(from, dependency.moduleName, files, root);
      if (to) edges.push({ from, to, kind: dependency.kind });
    }
  }
  const runtimeEdges = edges.filter((edge) => edge.kind === "runtime");
  const cycles = stronglyConnected(paths, runtimeEdges);
  const serverToClient = runtimeEdges.filter((edge) =>
    (classify(edge.from) === "server" || classify(edge.from) === "api") &&
    (classify(edge.to) === "ui" || clients.has(edge.to)));
  const reachableFromClient = new Set(clients);
  const queue = [...clients], bySource = new Map();
  for (const edge of runtimeEdges) {
    if (!bySource.has(edge.from)) bySource.set(edge.from, []);
    bySource.get(edge.from).push(edge.to);
  }
  for (let i = 0; i < queue.length; i++) {
    for (const to of bySource.get(queue[i]) ?? []) {
      if (!reachableFromClient.has(to)) { reachableFromClient.add(to); queue.push(to); }
    }
  }
  const serverInClientGraph = [...reachableFromClient].filter((file) => classify(file) === "server").sort();
  const forbiddenContracts = edges.filter((edge) =>
    (classify(edge.from) === "public-dto" || classify(edge.from) === "provider-port")
    && ["server", "api", "ui", "ui-adapter"].includes(classify(edge.to)));
  const protectedCycles = cycles.filter((cycle) => cycle.some((file) =>
    ["public-dto", "provider-port"].includes(classify(file))));
  const crossLayerImports = edges.filter((edge) => classify(edge.from) !== classify(edge.to));
  return {
    files: paths, edges, clients: [...clients].sort(), cycles, protectedCycles, serverToClient,
    serverInClientGraph, forbiddenContracts, crossLayerImports,
    metrics: {
      files: paths.length, runtimeEdges: runtimeEdges.length,
      typeEdges: edges.length - runtimeEdges.length, cycles: cycles.length,
      crossLayerEdges: crossLayerImports.length,
      serverToClient: serverToClient.length,
      serverModulesInClientRuntimeGraph: serverInClientGraph.length,
      newLayerViolations: forbiddenContracts.length + protectedCycles.length,
    },
  };
}

function main() {
  const options = process.argv.slice(2);
  const rootFlag = options.find((arg) => arg.startsWith("--root="));
  const dotFlag = options.find((arg) => arg.startsWith("--dot="));
  const root = rootFlag ? path.resolve(rootFlag.slice(7)) : sourceRoot;
  const result = analyze(root);
  const strict = options.includes("--strict");
  const failed = result.forbiddenContracts.length || result.protectedCycles.length
    || result.serverToClient.length || (strict && (result.cycles.length || result.serverInClientGraph.length));
  if (options.includes("--json")) {
    console.log(JSON.stringify({
      metrics: result.metrics, clients: result.clients, cycles: result.cycles,
      serverToClient: result.serverToClient, serverInClientGraph: result.serverInClientGraph,
      forbiddenContracts: result.forbiddenContracts,
    }, null, 2));
  } else console.log(JSON.stringify(result.metrics));
  if (dotFlag) {
    const out = path.resolve(dotFlag.slice(6));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, [
      "digraph AirRadar {", "  rankdir=LR;",
      ...result.files.map((file) => "  " + JSON.stringify(file) + " [label=" + JSON.stringify(file) + "];"),
      ...result.edges.map((edge) => "  " + JSON.stringify(edge.from) + " -> " + JSON.stringify(edge.to)
        + (edge.kind === "type" ? " [style=dashed]" : "") + ";"),
      "}",
    ].join("\n") + "\n");
  }
  if (failed && (options.includes("--check") || strict)) {
    console.error("Architecture boundary gate: violations detected. Run with --json to inspect.");
    process.exitCode = 1;
  }
}
main();
