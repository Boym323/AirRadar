"use client";

import { useEffect, useState, type RefObject } from "react";
import type { ImageSource, Map as MapLibreMap } from "maplibre-gl";
import type { EchoTopCatalog } from "@/lib/server/weather-radar/echotop-provider";
const ECHOTOP_BOUNDS = { west: 11.267, south: 48.047, east: 19.624, north: 51.458 } as const;

export type EchoTopStatus = "idle" | "loading" | "ready" | "stale" | "unavailable";
const SOURCE_ID="chmi-echotop-image";
const LAYER_ID="chmi-echotop-overlay";
const COORDINATES: [[number,number],[number,number],[number,number],[number,number]]=[
  [ECHOTOP_BOUNDS.west,ECHOTOP_BOUNDS.north],
  [ECHOTOP_BOUNDS.east,ECHOTOP_BOUNDS.north],
  [ECHOTOP_BOUNDS.east,ECHOTOP_BOUNDS.south],
  [ECHOTOP_BOUNDS.west,ECHOTOP_BOUNDS.south],
];

/** Isolated, on-demand radar layer; has no SSE or aircraft-state dependencies. */
export function useEchoTopMapLayer(
  mapRef:RefObject<MapLibreMap|null>, mapReady:boolean, show:boolean,
):EchoTopStatus{
  const [status,setStatus]=useState<EchoTopStatus>("idle");
  useEffect(()=>{
    const map=mapRef.current;
    if(!mapReady||!map||!show){setStatus("idle");return;}
    let active=true;
    let latest:string|null=null;
    let previousUrl:string|null=null;
    let interval:ReturnType<typeof setInterval>|null=null;
    const abort=new AbortController();
    const draw=()=>{
      if(!active||!latest||!map.isStyleLoaded())return;
      if(!map.getSource(SOURCE_ID)){
        map.addSource(SOURCE_ID,{
          type:"image",url:latest,coordinates:COORDINATES,
          attribution:'<a href="https://opendata.chmi.cz/" target="_blank" rel="noopener noreferrer">ČHMÚ · CC BY 4.0</a>'
        });
      }else if(previousUrl!==latest){
        (map.getSource(SOURCE_ID) as ImageSource).updateImage({url:latest,coordinates:COORDINATES});
      }
      previousUrl=latest;
      if(!map.getLayer(LAYER_ID)){
        map.addLayer({
          id:LAYER_ID,type:"raster",source:SOURCE_ID,
          paint:{"raster-opacity":0.72,"raster-fade-duration":0}
        },map.getLayer("route-airports-circle")?"route-airports-circle":undefined);
      }
    };
    let pending=false;
    const load=()=>{
      if(pending||!active||abort.signal.aborted)return;
      pending=true;
      void fetch("/api/weather/radar/echotop/frames",{cache:"no-store",signal:abort.signal})
        .then(response=>{
          if(!response.ok)throw Error("Echo Top catalog unavailable");
          return response.json() as Promise<EchoTopCatalog>;
        })
        .then(catalog=>{
          if(!active)return;
          const id=catalog.latestFrameId;
          const frame=catalog.frames.find(candidate=>candidate.id===id);
          if(!catalog.enabled||!catalog.available||!frame){
            setStatus("unavailable");return;
          }
          latest=frame.imageUrl;
          setStatus(frame.stale?"stale":"ready");
          draw();
        })
        .catch(()=>{if(active&&!abort.signal.aborted)setStatus("unavailable");})
        .finally(()=>{pending=false;});
    };
    setStatus("loading");
    map.on("style.load",draw);
    load();
    interval=setInterval(load,5*60_000);
    return ()=>{
      active=false;
      abort.abort();
      if(interval)clearInterval(interval);
      map.off("style.load",draw);
      try{
        if(map.getLayer(LAYER_ID))map.removeLayer(LAYER_ID);
        if(map.getSource(SOURCE_ID))map.removeSource(SOURCE_ID);
      }catch{/* map may have been destroyed by caller */}
    };
  },[mapRef,mapReady,show]);
  return status;
}
