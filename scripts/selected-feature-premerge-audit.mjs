#!/usr/bin/env node
// Selected-feature premerge audit. Read-only: no build or production side effects.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const matrix = JSON.parse(read("docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json"));
const audit = JSON.parse(read("docs/audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json"));
const failures = [];
const list = (dir, accept) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes:true}).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith("__") ? [] : list(p, accept);
    return e.isFile() && accept(p) ? [p] : [];
  });
};
const codeFile = (p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !p.endsWith(".d.ts");
const filenames = [
  ...["app", "components", "lib", "hooks"].flatMap((p)=>list(path.join(ROOT,p),codeFile)),
  ...["instrumentation.ts","instrumentation.node.ts","middleware.ts"].map((p)=>path.join(ROOT,p)).filter(existsSync),
];
const sources = filenames.map((p)=>({
  filename: path.relative(ROOT,p).split(path.sep).join("/"),
  source: readFileSync(p,"utf8")
}));
const getSource = (name) => sources.find((f)=>f.filename===name)?.source ?? "";
const routeFiles = list(path.join(ROOT,"app","api"),(p)=>/\/route\.(?:ts|js)$/.test(p));
const routes = routeFiles.map((p)=>"/"+path.relative(path.join(ROOT,"app"),p).split(path.sep).join("/").replace(/\/route\.(?:ts|js)$/,""));
const escape = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&");
const matcher = (route) => new RegExp("^"+route.split("/").map((s)=>s.startsWith("[")?"[^/]+":escape(s)).join("/")+"/?$");
const live = routes.map((r)=>({r,rx:matcher(r)}));
const retired = audit.deletedApiRoutes.map((p)=>{
  const r="/"+p.replace(/^app\//,"").replace(/\/route\.ts$/,""); return {r,rx:matcher(r)};
});
const keep = new Set(matrix.keepIds),remove = new Set(matrix.removeIds);
if (keep.size!==88 || remove.size!==90 || [...keep].some((id)=>remove.has(id))) failures.push("Selection matrix expected 88 KEEP and 90 REMOVE with no overlap");
if (routes.length!==56) failures.push("Expected 56 active API routes, actual "+routes.length);
for (const p of audit.preservedEndpoints) if (!existsSync(path.join(ROOT,p))) failures.push("Missing retained API: "+p);
for (const p of [...audit.deletedApiRoutes,...audit.deletedPageEntrypoints]) if (existsSync(path.join(ROOT,p))) failures.push("Retired entrypoint restored: "+p);
const core = [
  "app/page.tsx","app/aircraft/[hex]/page.tsx","app/airports/page.tsx","app/airports/[icao]/page.tsx",
  "app/navigation/page.tsx","app/navigation-integrity/page.tsx","app/receiver/coverage/page.tsx",
  "app/system/page.tsx","app/weather/page.tsx",
  "lib/server/aircraft-state.ts","lib/server/providers.ts","lib/server/local-readsb-provider.ts",
  "lib/server/beast-local-provider.ts","lib/server/history.ts","lib/server/navigation-integrity.ts",
  "lib/server/alert-delivery-worker.ts","lib/server/alerts-fleets-repository.ts",
  "lib/server/map-context.ts","lib/server/ogn-provider.ts","lib/server/rxw-hub-service.ts",
  "lib/radar/airspace-geojson.ts","lib/server/aviation-weather-provider.ts"
];
for(const name of core) if(!existsSync(path.join(ROOT,name))) failures.push("Missing selected runtime anchor: "+name);
const state = getSource("lib/server/aircraft-state.ts");
const bootstrap = getSource("instrumentation.node.ts");
const context = getSource("lib/server/map-context.ts");
for(const [label,source,needle] of [
  ["live network feed",state,"this.networkProvider.start()"],
  ["network feed stop",state,"this.networkProvider.stop()"],
  ["flight history",state,"recordAircraftSnapshot("],
  ["navigation integrity",state,"this.navigationIntegrity.observe("],
  ["delivery start",state,"getAlertDeliveryWorker().start()"],
  ["delivery stop",state,"getAlertDeliveryWorker().stop()"],
  ["bootstrap aircraft",bootstrap,"getAircraftStateService().start()"],
  ["bootstrap RXW",bootstrap,"getRxwHubService().start()"],
  ["bootstrap map context",bootstrap,"defaultMapContextArchiveService.start()"],
  ["historic AUP",context,"async resolveAupAt("],
  ["METAR polling",context,"this.pollMetar()"],
  ["radar polling",context,"defaultWeatherRadarArchive.poll()"]
]) if(!source.includes(needle)) failures.push("Runtime wiring missing: "+label);
if(/pollAup\s*\(|getAirspaceActivity\s*\(/.test(context)) failures.push("Retired T12 fetching in live map context");
if(/this\.alerts\.(?:observe|observeNewAircraft)\s*\(/.test(state)) failures.push("Retired alert rule execution in live state");
const URL_LITERAL=/(["'\x60])(\/api\/[^"'\x60\s]*)\1/g;
const dynamicMarker=String.fromCharCode(36,123);
const references=[], ambiguous=[], externalUpstream=[];
const AWC_PROVIDER_SOURCES = new Set([
  "lib/server/aviation-nav-data-provider.ts",
  "lib/server/aviation-weather-provider.ts",
  "lib/server/pirep-provider.ts",
]);
for(const {filename,source} of sources){
  URL_LITERAL.lastIndex=0;
  let m;
  while((m=URL_LITERAL.exec(source))!==null){
    const raw=m[2].replace(/\\\//g,"/");
    const requested=raw.split("?")[0].split("#")[0];
    if (requested==="/api/") continue;
    const normalized=requested.replace(/\$\{[^}]+\}/g,"__DYNAMIC__");
    // AWC /api/data/* is resolved against an explicit upstream base URL in these
    // three providers. It is not a Next.js route and must not be removed.
    if (AWC_PROVIDER_SOURCES.has(filename) && requested.startsWith("/api/data/")) {
      externalUpstream.push({file:filename,url:requested});
      continue;
    }
    if(live.some(({rx})=>rx.test(normalized))){references.push({file:filename,url:requested});continue;}
    if(requested.includes(dynamicMarker)||requested.endsWith("/")){
      const prefix=normalized.split("__DYNAMIC__")[0];
      if(routes.some((p)=>p.startsWith(prefix))){
        ambiguous.push({file:filename,url:requested});
        continue;
      }
    }
    const type=retired.some(({rx})=>rx.test(normalized))?"Retired API reference":"Unmatched API literal";
    failures.push(type+" "+filename+" "+requested);
  }
}
const outcome={
  status: failures.length?"FAIL":"PASS",
  selection:{keep:keep.size,remove:remove.size,originalPerIdMappingMissing:audit.records.filter((r)=>r.reviewLevel==="GROUP_LEVEL_ONLY").length},
  inspected:{sourceFiles:sources.length,activeApis:routes.length,retiredApis:retired.length,retiredPages:audit.deletedPageEntrypoints.length},
  activeReferences:references.length,externalUpstreamReferences:externalUpstream,ambiguousDynamic:ambiguous,failures,
  limit:"Static literals and retained runtime entrypoints checked; exact original semantics of 82 IDs and production deployment not established."
};
process.stdout.write(JSON.stringify(outcome,null,2)+"\n");
if(failures.length) process.exitCode=1;
