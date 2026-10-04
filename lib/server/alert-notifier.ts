import type { Aircraft } from "@/lib/aircraft/types";
import type { AlertRule } from "@/lib/server/alert-config";
import type { AlertHistoryReason, AlertHistoryRecordValue, AlertHistoryEventType } from "@/lib/server/alert-history";

export type { AlertHistoryReason, AlertHistoryRecordValue, AlertHistoryEventType };

export interface AircraftAlert {
  aircraft: Aircraft;
  matchedRules: AlertRule[];
  emergency: boolean;
  priority: "normal" | "high";
  /**
   * "history_only" records the event but never invokes an external notifier.
   * This lets watchlist product events exist independently of push delivery.
   */
  deliveryMode?: "configured" | "history_only";
  type?: AlertHistoryEventType;
  reason?: AlertHistoryReason;
  eventId?: string;
  radiusKm?: number | null;
  squawk?: string | null;
  record?: AlertHistoryRecordValue;
  intelligence?: {
    eventType: string;
    confidenceLevel: "low" | "medium" | "high";
    airportIcao: string | null;
    sectorId: string | null;
  };
  metadata?: Record<string, string | number | boolean | null>;
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

function formatDistance(distanceKm: number | null): string {
  return distanceKm === null || !Number.isFinite(distanceKm) ? "vzdálenost neuvedena" : `${Math.round(distanceKm)} km`;
}

function alertHeadline(alert: AircraftAlert, label: string): string {
  if (alert.type === "emergency_7500" || alert.type === "emergency_7600" || alert.type === "emergency_7700") {
    return `🚨 ${label} · Squawk ${alert.squawk ?? alert.type.slice(-4)}`;
  }
  if (alert.emergency) return `🚨 ${label} — nouzový stav hlášen`;
  if (alert.type === "entered_radius" && alert.radiusKm !== null && alert.radiusKm !== undefined) {
    return `✈ ${label} vstoupil do ${Math.round(alert.radiusKm)} km`;
  }
  if (alert.type === "aircraft_appeared") return `✈ ${label} zachycen na watchlistu`;
  if (alert.type === "predictive_eta") {
    const destination = typeof alert.metadata?.destinationIcao === "string" ? ` ${alert.metadata.destinationIcao}` : "";
    const horizon = typeof alert.metadata?.horizonMinutes === "number" ? ` za ${Math.round(alert.metadata.horizonMinutes)} min` : "";
    return `✈ ${label} · predikovaná ETA${destination}${horizon}`;
  }
  if (alert.type === "predictive_runway_change") {
    const from = typeof alert.metadata?.changedFrom === "string" ? alert.metadata.changedFrom : "?";
    const runway = typeof alert.metadata?.runway === "string" ? alert.metadata.runway : "?";
    return `✈ ${label} · predikce RWY ${from} → ${runway}`;
  }
  if (alert.type === "new_aircraft") return `✈ ${label} poprvé zachycen`;
  if (alert.type === "reception_record") return `✈ ${label} překonal rekord příjmu`;
  if (alert.type?.startsWith("intelligence_")) {
    const event = alert.type.slice("intelligence_".length).replaceAll("_", " ");
    return `✈ ${label} · intelligence: ${event}`;
  }
  return `✈ ${label} odpovídá sledovanému pravidlu`;
}

export function aircraftAlertUrl(alert: AircraftAlert): string {
  return `https://airradar.pomykal.cz/aircraft/${encodeURIComponent(alert.aircraft.icaoHex)}`;
}

export function formatAircraftAlert(alert: AircraftAlert): string {
  const aircraft = alert.aircraft;
  const label = aircraft.callsign || aircraft.registration || aircraft.enrichment?.metadata?.registration || aircraft.icaoHex;
  const lines = [alertHeadline(alert, label), "", aircraft.icaoHex];

  if (alert.emergency) {
    lines.push(`${formatAltitude(aircraft.altitude)} · ${formatTrack(aircraft.track)}`);
  } else {
    const type = aircraft.enrichment?.metadata?.aircraftDescription || aircraft.aircraftDescription || aircraft.enrichment?.metadata?.icaoTypeCode || aircraft.aircraftType || "typ neuveden";
    const registration = aircraft.registration || aircraft.enrichment?.metadata?.registration;
    const identity = registration ? `${type} · ${registration}` : type;
    lines.push(identity, `${formatDistance(aircraft.distanceKm)} · ${formatAltitude(aircraft.altitude)}`, formatTrack(aircraft.track));
    if (alert.type === "predictive_eta" && alert.metadata) {
      const eta = typeof alert.metadata.estimatedArrivalAt === "string" ? new Date(alert.metadata.estimatedArrivalAt) : null;
      const uncertainty = typeof alert.metadata.uncertaintyMinutes === "number" ? Math.round(alert.metadata.uncertaintyMinutes) : null;
      const confidence = typeof alert.metadata.confidence === "string" ? alert.metadata.confidence : null;
      const context = [
        eta && Number.isFinite(eta.getTime()) ? `ETA ${eta.toISOString().slice(11, 16)} UTC` : null,
        uncertainty !== null ? `± ${uncertainty} min` : null,
        confidence ? `jistota ${confidence}` : null,
      ].filter(Boolean).join(" · ");
      if (context) lines.push(context);
    }
    if (alert.type === "predictive_runway_change" && alert.metadata) {
      const destination = typeof alert.metadata.destinationIcao === "string" ? alert.metadata.destinationIcao : null;
      const confidence = typeof alert.metadata.confidence === "string" ? alert.metadata.confidence : null;
      const context = [destination ? `letiště ${destination}` : null, confidence ? `jistota ${confidence}` : null].filter(Boolean).join(" · ");
      if (context) lines.push(context);
    }
    if (alert.intelligence) {
      const context = [
        `jistota ${alert.intelligence.confidenceLevel}`,
        alert.intelligence.airportIcao ? `letiště ${alert.intelligence.airportIcao}` : null,
        alert.intelligence.sectorId ? `sektor ${alert.intelligence.sectorId}` : null,
      ].filter(Boolean).join(" · ");
      if (context) lines.push(context);
    }
    if (alert.matchedRules.length === 1) lines.push(`Pravidlo: ${alert.matchedRules[0]?.name ?? alert.matchedRules[0]?.id}`);
  }

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
          url: aircraftAlertUrl(alert),
          url_title: "Otevřít detail v AirRadaru",
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
