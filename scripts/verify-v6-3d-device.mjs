#!/usr/bin/env node
/**
 * Physical browser/device 3D acceptance probe.
 * Run against an AirRadar build in a REAL Chrome browser (or Android Chrome via CDP).
 * Local Playwright browser is useful for smoke only and never proves hardware GPU.
 *
 * AIRRADAR_DEVICE_CDP=http://127.0.0.1:9222
 * AIRRADAR_URL=https://airradar.pomykal.cz node scripts/verify-v6-3d-device.mjs --require-hardware
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.AIRRADAR_URL;
const endpoint = process.env.AIRRADAR_DEVICE_CDP;
const requireHardware = process.argv.includes("--require-hardware");
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error("Set AIRRADAR_URL to the tested AirRadar server.");
  process.exit(2);
}
const u = new URL(baseUrl);
u.searchParams.set("mapDiagnostics", "1");
const output = resolve(process.env.AIRRADAR_DEVICE_REPORT_DIR || "artifacts/v6-gpu-device");
const timeoutMs = 25_000;
const browser = endpoint ? await chromium.connectOverCDP(endpoint) : await chromium.launch({ headless: false });
const context = endpoint ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1366, height: 900 } });
if (!context) throw new Error("CDP did not expose a browser context");
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
const result = { timestamp: new Date().toISOString(), url: u.toString(), realDeviceRequired: requireHardware,
  browser: await browser.version(), cdp: Boolean(endpoint), gpu: null, frameTimesMs: null, state: "pending", errors };
try {
  await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const layers = page.locator(".map-layers");
  await layers.waitFor({ timeout: timeoutMs });
  await layers.evaluate((el) => { el.open = true; });
  await page.getByTestId("radar-v6-d-terrain").locator("select").selectOption("3d");
  await page.waitForFunction(() => {
    const m = window.__airradarMapForDiagnostics;
    return Boolean(m && m.getTerrain() && m.getLayer("radar-v6-d-aircraft-3d") && m.getPitch() >= 50);
  }, undefined, { timeout: timeoutMs });
  // Query the exact MapLibre context; GPU renderer is only verifiable if the browser exposes it.
  result.gpu = await page.evaluate(() => {
    const map = window.__airradarMapForDiagnostics;
    const canvas = map?.getCanvas();
    const gl = canvas?.getContext("webgl2");
    if (!gl) return { webgl2: false, renderer: null, vendor: null, hardwareEvidence: false };
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const software = /swiftshader|llvmpipe|softpipe|software rasterizer|mesa offscreen/i.test(String(renderer));
    return { webgl2: true, renderer: String(renderer), vendor: String(vendor),
      hardwareEvidence: Boolean(debug && renderer && !software), software,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), lost: gl.isContextLost() };
  });
  if (!result.gpu.webgl2 || result.gpu.lost) throw new Error("WebGL2 is unavailable or lost");
  if (requireHardware && !result.gpu.hardwareEvidence) {
    throw new Error("Hardware renderer could not be confirmed (software or hidden GPU identity).");
  }
  // Measure the actual radar redraw path, not only requestAnimationFrame timing.
  result.frameTimesMs = await page.evaluate(() => new Promise((done, reject) => {
    const map = window.__airradarMapForDiagnostics;
    if (!map) { reject(new Error("No radar map diagnostics instance")); return; }
    const samples = [];
    let last = performance.now();
    const deadline = window.setTimeout(() => { map.off("render", onRender); reject(new Error("Render samples timed out")); }, 10_000);
    function onRender() {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      if (samples.length >= 90) {
        window.clearTimeout(deadline);
        map.off("render", onRender);
        samples.sort((a,b) => a - b);
        done({ count: samples.length, p50: samples[Math.floor(samples.length*.5)],
          p95: samples[Math.floor(samples.length*.95)], max: samples.at(-1) });
      } else map.triggerRepaint();
    }
    map.on("render", onRender);
    map.triggerRepaint();
  }));
  await page.screenshot({ path: resolve(output, "3d-active.png"), animations: "disabled" });
  await layers.evaluate((el) => { el.open = true; });
  await page.getByTestId("radar-v6-d-terrain").locator("select").selectOption("2d");
  await page.waitForFunction(() => {
    const m = window.__airradarMapForDiagnostics;
    return Boolean(m && !m.getTerrain() && !m.getLayer("radar-v6-d-aircraft-3d"));
  }, undefined, { timeout: timeoutMs });
  result.state = "pass";
} catch (error) {
  result.state = "fail";
  result.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "report.json"), JSON.stringify(result, null, 2)+"\n");
  await page.close();
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}
