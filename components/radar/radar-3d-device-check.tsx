"use client";
import { useState } from "react";
import { t } from "@/lib/i18n";

type Result = { supported: boolean; frames: number; medianFrameMs: number | null; p95FrameMs: number | null; maxTextureSize: number | null; renderer: string; mobileViewport: boolean; capturedAt: string; userAgent: string; touchPoints: number; error: string | null };
export function Radar3dDeviceCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const en=t.locale.startsWith("en");
  const measure = async () => {
    if (running) return;
    setRunning(true);
    try {
      const canvas=document.querySelector<HTMLCanvasElement>(".radar-content .maplibregl-canvas");
      const gl=canvas?.getContext("webgl2");
      const ext=gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer=gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0,120) : "WebGL renderer undisclosed";
      const maxTextureSize=gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : null;
      const samples:number[]=[];
      if(gl && document.visibilityState==="visible"){
        let previous=performance.now();
        // A total wall-clock deadline is essential: throttled browsers can
        // deliver many RAF callbacks slightly below the per-frame timeout.
        const deadline = previous + 4000;
        // Observe existing map frames; do not create a second render loop or canvas.
        for(let i=0;i<61 && performance.now()<deadline;i++){
          if (document.visibilityState !== "visible") break;
          // Backgrounded/throttled tabs may never receive another animation
          // frame. Bound each sample so manual device QA always returns a result.
          const now = await new Promise<number | null>(resolve => {
            let settled = false;
            const finish = (value: number | null) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout);
              resolve(value);
            };
            const timeout = window.setTimeout(() => {
              window.cancelAnimationFrame(frame);
              finish(null);
            }, Math.max(1, Math.min(600, deadline - performance.now())));
            const frame = window.requestAnimationFrame(time => finish(time));
          });
          if (now === null) break;
          if (i > 0) samples.push(now - previous);
          previous = now;
        }
      }
      samples.sort((a,b)=>a-b);
      setResult({
        supported:Boolean(gl),frames:samples.length,
        medianFrameMs:samples.length?samples[Math.floor(samples.length*.5)]!:null,
        p95FrameMs:samples.length?samples[Math.floor(samples.length*.95)]!:null,
        maxTextureSize,renderer,mobileViewport:window.innerWidth<768,
        capturedAt:new Date().toISOString(),
        userAgent:navigator.userAgent.slice(0,250), touchPoints:navigator.maxTouchPoints,
        error:null,
      });
    } catch (error) {
      // A map-owned WebGL context may reject secondary context access on some
      // browsers. Always return a diagnostic rather than a silent, stuck spinner.
      setResult({
        supported:false, frames:0,medianFrameMs:null,p95FrameMs:null,
        maxTextureSize:null,renderer:"Unavailable",mobileViewport:window.innerWidth<768,
        capturedAt:new Date().toISOString(),userAgent:navigator.userAgent.slice(0,250),
        touchPoints:navigator.maxTouchPoints,
        error:error instanceof Error ? error.message.slice(0,250) : String(error).slice(0,250),
      });
    } finally { setRunning(false); }
  };
  return <div className="map-layer-sublevel" data-testid="radar-v6-device-qa">
    <button type="button" disabled={running} onClick={() => void measure()}>
      {running ? (en?"Measuring…":"Probíhá měření…") : (en?"Check 3D on this device":"Ověřit 3D na tomto zařízení")}
    </button>
    {result && <div role="status">
      <small>{result.supported?"WebGL2 ✓":"WebGL2 nedostupné"} · {result.renderer} ·
        {result.p95FrameMs!==null?` p95 ${result.p95FrameMs.toFixed(1)} ms / ${result.frames} frames`:" no frame samples"}
        {result.maxTextureSize!==null?` · max texture ${result.maxTextureSize}`:""}</small>
      {result.error && <p role="alert">{en?"Device measurement failed: ":"Měření zařízení selhalo: "}{result.error}</p>}
      <br />
      <small>{en?"Browser-only measurement on the current device, not a certification of other GPUs.":"Měření v prohlížeči tohoto zařízení; neprokazuje výkon na jiných GPU."}</small>
      <br />
      <button type="button" onClick={() => {
        const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:"application/json"}));
        const a=document.createElement("a");a.href=url;a.download="airradar-3d-device-qa.json";a.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}>{en?"Export device evidence":"Exportovat měření zařízení"}</button>
    </div>}
  </div>;
}
