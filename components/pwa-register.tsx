"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

export function PwaRegister() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then(setRegistration).catch(() => undefined);
    }
    const onInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    void fetch("/api/push/vapid-public-key").then((response) => response.json() as Promise<{ enabled?: boolean }>).then((config) => setPushAvailable(config.enabled === true)).catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  async function install() { await installEvent?.prompt(); setInstallEvent(null); }
  async function enablePush() {
    if (!registration || !("PushManager" in window) || !("Notification" in window)) return;
    const keyResponse = await fetch("/api/push/vapid-public-key");
    const config = await keyResponse.json() as { publicKey?: string | null };
    if (!config.publicKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(config.publicKey) });
    const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
    if (response.ok) setPushEnabled(true);
  }

  if (!installEvent && !pushAvailable) return null;
  return <aside className="pwa-actions" aria-label="AirRadar PWA">
    {installEvent ? <button type="button" onClick={() => void install()}>{t.pwa.install}</button> : null}
    {pushAvailable && !pushEnabled ? <button type="button" onClick={() => void enablePush()}>{t.pwa.enablePush}</button> : null}
    {pushEnabled ? <span>{t.pwa.pushEnabled}</span> : null}
  </aside>;
}

function urlBase64ToBytes(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
