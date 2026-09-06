import type { FlightPlan } from "@/lib/aircraft/types";
import type { FlightPlanProvider } from "@/lib/server/provider";

interface FlightAwareFlight extends Record<string, unknown> {
  ident?: string;
  scheduled_out?: string;
  actual_out?: string | null;
  scheduled_in?: string;
  estimated_in?: string | null;
  filed_route?: string | null;
  waypoints?: string[] | null;
}

interface FlightAwareResponse { flights?: FlightAwareFlight[] }

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function endpoint(callsign: string): string {
  return `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(callsign.trim().toUpperCase())}`;
}

export class FlightAwareFlightPlanProvider implements FlightPlanProvider {
  readonly name = "flightaware-aeroapi";

  constructor(private readonly apiKey: string) {}

  async getFlightPlan(callsign: string, observedAt: Date): Promise<FlightPlan | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(endpoint(callsign), {
        cache: "no-store",
        signal: controller.signal,
        headers: { "x-apikey": this.apiKey, Accept: "application/json" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`FlightAware returned HTTP ${response.status}`);
      const payload = await response.json() as FlightAwareResponse;
      const flight = payload.flights?.[0];
      if (!flight) return null;
      return {
        callsign: stringValue(flight.ident) ?? callsign.trim().toUpperCase(),
        scheduledDeparture: stringValue(flight.scheduled_out),
        actualDeparture: stringValue(flight.actual_out),
        scheduledArrival: stringValue(flight.scheduled_in),
        estimatedArrival: stringValue(flight.estimated_in),
        filedRoute: stringValue(flight.filed_route),
        waypoints: Array.isArray(flight.waypoints) ? flight.waypoints.filter((item): item is string => typeof item === "string") : [],
        source: this.name,
        retrievedAt: observedAt.toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

