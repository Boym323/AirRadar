"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AircraftView } from "@/lib/aircraft/types";
import type { SpotterObserverPosition } from "@/lib/spotter-location";
import { observerGeometry } from "@/lib/spotter-location";
import { positionAgeMs } from "@/lib/aircraft/source-merge";
import { projectAircraftToCamera } from "@/lib/spotter-camera-ar-projection";
import { formatAltitude, formatDistance, t } from "@/lib/i18n";
import { Button } from "@/components/ui-primitives";
import styles from "./spotter-camera-ar.module.css";

type CameraState = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "failed";

interface SpotterCameraARProps {
  available: boolean;
  visible: boolean;
  observer: SpotterObserverPosition | null;
  heading: number | null;
  elevation: number | null;
  feedLive: boolean;
  aircraft: readonly AircraftView[];
}

/** The camera stays entirely in the browser. Nothing is recorded, uploaded, or added to the SSE stream. */
export function SpotterCameraAR({ available, visible, observer, heading, elevation, feedLive, aircraft }: SpotterCameraARProps) {
  const english = t.locale.startsWith("en");
  const [active, setActive] = useState(false);
  const [state, setState] = useState<CameraState>("idle");
  const [tiltCorrection, setTiltCorrection] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!active || !visible) return;
    let canceled = false;
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } })
      .then(async (media) => {
        if (canceled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          try { await videoRef.current.play(); } catch { /* Autoplay may be blocked. */ }
        }
        if (!canceled) setState("ready");
      })
      .catch((error: unknown) => {
        if (canceled) return;
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
        setState(denied ? "denied" : "failed");
      });
    return () => {
      canceled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, visible]);

  const labels = useMemo(() => {
    if (!observer || heading === null || elevation === null || !feedLive || !available || state !== "ready") return [];
    const now = Date.now();
    return aircraft.flatMap((item) => {
      if (positionAgeMs(item, now) > 20_000) return [];
      const geometry = observerGeometry(item, observer);
      if (geometry?.elevationDeg === null || geometry?.elevationDeg === undefined) return [];
      const projection = projectAircraftToCamera(geometry.bearingDeg, geometry.elevationDeg, heading, elevation + tiltCorrection);
      return projection ? [{
        hex: item.icaoHex,
        name: item.callsign || item.registration || item.icaoHex,
        altitude: formatAltitude(item.altitude),
        distance: formatDistance(geometry.horizontalDistanceKm),
        ...projection,
      }] : [];
    }).sort((a, b) => Math.abs(a.azimuthDeltaDeg) + Math.abs(a.elevationDeltaDeg) - (Math.abs(b.azimuthDeltaDeg) + Math.abs(b.elevationDeltaDeg))).slice(0, 8);
  }, [aircraft, available, elevation, feedLive, heading, observer, state, tiltCorrection]);

  const enable = () => {
    if (active) { setActive(false); setState("idle"); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setState("unavailable"); return; }
    setState("requesting");
    setActive(true);
  };

  return <section className={styles.root} data-testid="spotter-camera-ar" aria-label={english ? "Camera aircraft overlay" : "Letadla v obrazu kamery"}>
    <div className={styles.toolbar}>
      <strong>{english ? "Camera AR" : "Kamera AR"}</strong>
      <Button size="compact" variant={active ? "primary" : "secondary"} disabled={!available || !observer} onClick={enable}>
        {active ? english ? "Stop camera" : "Vypnout kameru" : english ? "Enable camera AR" : "Zapnout kameru AR"}
      </Button>
    </div>
    {!available && <p className={styles.note}>{english ? "First enable Sky Finder and allow compass access. Portrait orientation is required." : "Nejprve zapni Sky Finder a povol kompas. Telefon musí být na výšku."}</p>}
    {state === "denied" && <p className={styles.note} role="status">{english ? "Camera permission denied. Change it in browser settings." : "Přístup ke kameře byl zamítnut. Změň oprávnění v prohlížeči."}</p>}
    {state === "unavailable" && <p className={styles.note} role="status">{english ? "Camera needs HTTPS and browser camera support." : "Kamera vyžaduje HTTPS a podporu prohlížeče."}</p>}
    {state === "failed" && <p className={styles.note} role="status">{english ? "Camera unavailable. Sky Finder remains usable." : "Kamera není dostupná. Sky Finder zůstává funkční."}</p>}
    {active && <div className={styles.viewport}>
      <video ref={videoRef} className={styles.video} autoPlay muted playsInline aria-label={english ? "Live rear camera" : "Živý obraz zadní kamery"} />
      {state === "requesting" && <span className={styles.status}>{english ? "Waiting for camera permission…" : "Čekám na povolení kamery…"}</span>}
      {state === "ready" && (!feedLive || heading === null || elevation === null) && <span className={styles.status}>{english ? "Waiting for fresh receiver data and calibrated compass/tilt." : "Čekám na čerstvá data přijímače a kalibraci kompasu/náklonu."}</span>}
      {state === "ready" && labels.map((marker) => <a className={styles.marker} key={marker.hex} href={`/aircraft/${marker.hex}`} style={{ left: `${marker.xPercent}%`, top: `${marker.yPercent}%` }} title={english ? "Open aircraft" : "Otevřít letadlo"}>
        <strong>{marker.name}</strong><span>{marker.altitude} · {marker.distance}</span>
      </a>)}
      {state === "ready" && <span className={styles.crosshair} aria-hidden="true">+</span>}
      {state === "ready" && <div className={styles.legend}>{english ? "Approximate AR · not certified" : "Orientační AR · není určeno k navigaci"} · {labels.length}</div>}
    </div>}
    {active && state === "ready" && <label className={styles.calibration}>{english ? "Tilt calibration" : "Kalibrace náklonu"}
      <input type="range" min="-20" max="20" step="1" value={tiltCorrection} onChange={(event) => setTiltCorrection(Number(event.target.value))} />
      <span>{tiltCorrection > 0 ? "+" : ""}{tiltCorrection}°</span>
    </label>}
    <small className={styles.note}>{english ? "Camera video remains on this device. Overlay positions are approximate and depend on GPS, compass, phone tilt and locally observed ADS-B positions." : "Obraz kamery zůstává v zařízení. Polohy jsou orientační a závisí na GPS, kompasu, náklonu telefonu a lokálně zachycených ADS-B polohách."}</small>
  </section>;
}
