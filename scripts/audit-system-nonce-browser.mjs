#!/usr/bin/env node
/** CI-only, isolated nonce-enabled /system browser smoke. Never contacts production. */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const port = 42000 + process.pid % 10000;
const stateDirectory=mkdtempSync(join(tmpdir(),"airradar-csp-smoke-"));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {env: {...process.env,
    NODE_ENV:"production", AIRRADAR_STRICT_CSP_SYSTEM_ENABLED:"true",
    AIRRADAR_RUNTIME_STATE_DIRECTORY:stateDirectory,
    DATABASE_URL:"", READSB_BASE_URL:"", ADSBDB_ENABLED:"false",
    ATC_SAMPLE_ENABLED:"false", AIRCRAFT_PHOTOS_ENABLED:"false",
    FLIGHTAWARE_API_KEY:"",
  }, stdio:["ignore","pipe","pipe"]});
const logs=[];
for(const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
  logs.push(chunk.toString()); if(logs.length>100) logs.shift();
});

let browser;
try {
  let ready=false;
  for(let attempt=0; attempt<120; attempt++){
    if(child.exitCode !== null) throw new Error("Next terminated early");
    try {const response=await fetch(base+"/system",{signal:AbortSignal.timeout(1000)});
      if(response.ok){await response.body?.cancel();ready=true;break;}
    } catch {}
    await delay(200);
  }
  if(!ready)throw new Error("Next did not start within 24 seconds");
  const a=await fetch(base+"/system",{headers:{"Cache-Control":"no-cache"}});
  const b=await fetch(base+"/system",{headers:{"Cache-Control":"no-cache"}});
  const getNonce=(response)=>{
    const csp=typeof response.headers === "function"
      ? (response.headers()["content-security-policy"] ?? "")
      : (response.headers.get("content-security-policy") ?? "");
    const script=csp.match(/script-src [^;]+/)?.[0] ?? "";
    if(!csp.includes("script-src-attr 'none'") || script.includes("'unsafe-inline'"))
      throw new Error("Expected strict script-src and blocked inline handlers");
    const nonce=script.match(/'nonce-([A-Za-z0-9+/]{22}==)'/)?.[1];
    if(!nonce)throw new Error("CSP did not provide a 128-bit nonce");
    return nonce;
  };
  const first=getNonce(a), second=getNonce(b);
  if(first===second)throw new Error("CSP nonce reused between requests");
  await a.body?.cancel();await b.body?.cancel();

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const violations=[];
  page.on("console",msg=>{if(/Refused to (execute|load) (?:inline )?script|Content Security Policy/i.test(msg.text()))
    violations.push(msg.text().slice(0,180));});
  const response=await page.goto(base+"/system",{waitUntil:"domcontentloaded",timeout:20000});
  if(!response?.ok())throw new Error("Browser /system returned non-200");
  const browserNonce=getNonce(response);
  const scriptInfo=await page.evaluate(()=>Array.from(document.scripts).map(s=>({nonce:s.nonce,src:Boolean(s.src)})));
  if(!scriptInfo.some(s=>s.nonce===browserNonce))throw new Error("No browser script received the response nonce");
  if(scriptInfo.some(s=>s.nonce!==browserNonce))throw new Error("Browser contains a script without matching nonce");
  await page.waitForTimeout(500);
  if(violations.length)throw new Error("CSP browser violations: "+violations.join(" | "));
  if(!(await page.locator("body").textContent())?.trim())throw new Error("Blank system page");
  console.log(JSON.stringify({status:"PASS",route:"/system",uniqueNonce:true,noncedScripts:scriptInfo.length,
    inlineScriptExecution:"nonce-only",scriptViolations:0}));
} catch(e) {
  console.error("[nonce browser QA]",e instanceof Error?e.message:"unknown",logs.join("").slice(-800));
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  child.kill("SIGTERM");
  for(let i=0;i<20 && child.exitCode===null;i++)await delay(100);
  if(child.exitCode===null)child.kill("SIGKILL");
  rmSync(stateDirectory,{recursive:true,force:true});
}
