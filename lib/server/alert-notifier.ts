import type { Aircraft } from "@/lib/aircraft/types";
import type { AlertRule } from "@/lib/server/alert-config";
import type { AlertHistoryReason, AlertHistoryRecordValue, AlertHistoryEventType } from "@/lib/server/alert-history";

export type { AlertHistoryReason, AlertHistoryRecordValue, AlertHistoryEventType };

export interface AircraftAlert {
  aircraft: Aircraft;
  matchedRules: AlertRule[];
  emergency: boolean;
  priority: "normal" | "high";
  type?: AlertHistoryEventType;
  reason?: AlertHistoryReason;
  eventId?: string;
  record?: AlertHistoryRecordValue;
}

export interface AlertNotifier {
  readonly name: string;
  readonly enabled: boolean;
  send(alert: AircraftAlert): Promise<void>;
}

export class AlertDeliveryError extends Error {
  constructor(readonly status: number | null, message = "alert delivery failed") {
    super(message);
    this.name = "AlertDeliveryError";
  }
}

export class NoopAlertNotifier implements AlertNotifier {
  readonly name = "noop";
  readonly enabled = false;

  async send(): Promise<void> {
    // Alerts remain a no-op until a server-side notifier is explicitly configured.
  }
}

function formatAltitude(altitude: number | null): string {
  if (altitude === null || !Number.isFinite(altitude)) return "výška neuvedena";
  return altitude >= 10_000 ? `FL${Math.round(altitude / 100)}` : `${Math.round(altitude)} ft`;
}

function formatTrack(track: number | null): string {
  return track === null || !Number.isFinite(track) ? "směr neuveden" : `směr ${Math.round((track + 360) % 360)}°`;
}

export function formatAircraftAlert(alert: AircraftAlert): string {
  const aircraft = alert.aircraft;
  const label = aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
  if (alert.emergency) {
    return [`🚨 ${label} — nouzový stav hlášen`, "", aircraft.icaoHex, `${formatAltitude(aircraft.altitude)} · ${formatTrack(aircraft.track)}`, "", "airradar.pomykal.cz"].join("\n");
  }

  const type = aircraft.enrichment?.metadata?.aircraftDescription || aircraft.aircraftDescription || aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || "typ neuveden";
  const registration = aircraft.registration || aircraft.enrichment?.metadata?.registration;
  const identity = registration ? `${type} · ${registration}` : type;
  const distance = aircraft.distanceKm === null ? "vzdálenost neuvedena" : `${Math.round(aircraft.distanceKm)} km`;
  const lines = [`✈ ${label} zachycen`, "", identity, `${distance} · ${formatAltitude(aircraft.altitude)}`, formatTrack(aircraft.track)];
  const assignment = aircraft.atc;
  if (assignment && assignment.primaryFrequencyMhz !== null) {
    lines.push("", "Pravděpodobně relevantní ATC:", `${assignment.name} · ${assignment.primaryFrequencyMhz.toFixed(3)} MHz`);
  }
  lines.push("", "airradar.pomykal.cz");
  return lines.join("\n");
}

class PushoverNotifier implements AlertNotifier {
  readonly name = "pushover";
  readonly enabled = true;
  private readonly endpoint = "https://api.pushover.net/1/messages.json";

  constructor(private readonly userKey: string, private readonly apiToken: string) {}

  async send(alert: AircraftAlert): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: this.apiToken,
          user: this.userKey,
          message: formatAircraftAlert(alert),
          title: alert.emergency ? "AirRadar nouzové upozornění" : "AirRadar upozornění",
          priority: alert.priority === "high" ? "1" : "0",
        }),
      });
      if (!response.ok) throw new AlertDeliveryError(response.status);
    } catch (error) {
      if (error instanceof AlertDeliveryError) throw error;
      throw new AlertDeliveryError(null, error instanceof Error ? error.message : "network error");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAlertNotifier(): AlertNotifier {
  const enabled = process.env.PUSHOVER_ENABLED?.trim().toLowerCase() === "true";
  const userKey = process.env.PUSHOVER_USER_KEY?.trim();
  const apiToken = process.env.PUSHOVER_API_TOKEN?.trim();
  if (!enabled) return new NoopAlertNotifier();
  if (!userKey || !apiToken) {
    console.error("AirRadar Pushover notifier disabled: credentials are not configured");
    return new NoopAlertNotifier();
  }
  return new PushoverNotifier(userKey, apiToken);
}
