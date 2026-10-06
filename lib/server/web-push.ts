import webpush from "web-push";
import type { AlertNotifier, AircraftAlert } from "@/lib/server/alert-notifier";
import { listWebPushSubscriptions, removeWebPushSubscription } from "@/lib/server/web-push-store";

export function getWebPushPublicKey(): string | null {
  const value = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  return value || null;
}

function credentials(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = getWebPushPublicKey();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function isWebPushConfigured(): boolean { return credentials() !== null; }

export class WebPushNotifier implements AlertNotifier {
  readonly name = "web-push";
  readonly enabled: boolean;

  constructor() { this.enabled = Boolean(credentials()); }

  async send(alert: AircraftAlert): Promise<void> {
    const config = credentials();
    if (!config) return;
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    const payload = JSON.stringify({ title: alert.emergency ? "AirRadar · nouzový squawk" : "AirRadar · upozornění", body: `${alert.aircraft.callsign || alert.aircraft.registration || alert.aircraft.icaoHex} · ${alert.squawk ? `Squawk ${alert.squawk}` : alert.type === "entered_radius" ? "vstup do sledované zóny" : "sledované letadlo"}`, url: `/aircraft/${encodeURIComponent(alert.aircraft.icaoHex)}`, tag: alert.eventId ?? alert.type ?? "airradar-alert" });
    for (const subscription of await listWebPushSubscriptions()) {
      try { await webpush.sendNotification(subscription, payload, { TTL: 3600 }); }
      catch (error) {
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
        if (status === 404 || status === 410) await removeWebPushSubscription(subscription.endpoint);
        else throw error;
      }
    }
  }
}
