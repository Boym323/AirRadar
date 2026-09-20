import type { Aircraft, NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import { AdsbHubProvider } from "@/lib/server/adsbhub-provider";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";
import { AdsbLolRawProvider } from "@/lib/server/adsblol-raw-provider";
import { isAdsbLolHttpFallbackEnabled, isAdsbLolRawEnabled } from "@/lib/server/config";

type Selected = "mixed" | "adsbhub" | "adsblol-raw" | "adsblol-http" | "unavailable";

/** Runs all configured network lanes and publishes their deduplicated union. */
export class NetworkFailoverProvider implements NetworkAircraftProvider {
  readonly name = "network";
  private selected: Selected = "unavailable";
  private transitionAt: string | null = null;
  constructor(
    private readonly hub: AdsbHubProvider,
    private readonly raw: AdsbLolRawProvider | null,
    private readonly http: AdsbLolProvider | null,
  ) {}
  start(): void { this.hub.start(); this.raw?.start(); this.http?.start(); }
  async stop(): Promise<void> { await Promise.all([this.hub.stop(), this.raw?.stop(), this.http?.stop()]); }
  getNextPollDelayMs(): number {
    return Math.min(
      this.hub.getNextPollDelayMs(),
      this.raw?.getNextPollDelayMs?.() ?? Number.POSITIVE_INFINITY,
      this.http?.getNextPollDelayMs?.() ?? Number.POSITIVE_INFINITY,
    );
  }
  async getSnapshot(): Promise<NetworkAircraftSnapshot> {
    const providers = [this.hub, this.raw, this.http].filter((value): value is NonNullable<typeof value> => value !== null);
    const results = await Promise.allSettled(providers.map((provider) => provider.getSnapshot()));
    const snapshots = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const aircraft = new Map<string, Aircraft>();
    for (const snapshot of snapshots) {
      for (const item of snapshot.aircraft) {
        const normalized = item.provenance?.networkSources?.length
          ? item
          : { ...item, provenance: { ...(item.provenance ?? { seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: item.lastSeen, positionOrigin: item.origin ?? "adsblol", positionSource: item.source }), networkSources: [sourceName(item)] } };
        const previous = aircraft.get(item.icaoHex);
        aircraft.set(item.icaoHex, previous ? mergeNetworkObservations(previous, normalized) : normalized);
      }
    }
    this.lastAircraftCount = aircraft.size;
    this.lastPositionedCount = [...aircraft.values()].filter((item) => item.lat !== null && item.lon !== null).length;
    const activeSources = providers
      .map((provider) => provider.getDiagnostics())
      .filter((diagnostics) => diagnostics.status === "online" || diagnostics.status === "degraded");
    this.transition(activeSources.length > 1
      ? "mixed"
      : activeSources[0]?.selectedSource === "adsbhub"
        ? "adsbhub"
        : activeSources[0]?.selectedSource === "raw"
          ? "adsblol-raw"
          : activeSources[0]?.selectedSource === "adsblol-raw"
            ? "adsblol-raw"
            : activeSources[0]?.selectedSource === "adsblol-http" || activeSources[0]?.selectedSource === "http-fallback"
              ? "adsblol-http"
              : "unavailable");
    return {
      aircraft: [...aircraft.values()],
      fetchedAt: snapshots.map((snapshot) => snapshot.fetchedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? new Date().toISOString(),
      provider: this.name,
    };
  }
  getDiagnostics(): NetworkProviderDiagnostics {
    const hub = this.hub.getDiagnostics();
    const raw = this.raw?.getDiagnostics();
    const http = this.http?.getDiagnostics();
    const values = [hub, raw, http].filter((value): value is NetworkProviderDiagnostics => value !== undefined);
    const online = values.some((value) => value.status === "online");
    const usable = values.some((value) => value.status === "online" || value.status === "degraded");
    const primary = values.find((value) => value.status === "online") ?? values[0] ?? hub;
    return {
      ...primary,
      enabled: values.some((value) => value.enabled),
      status: online ? "online" : usable ? "degraded" : primary.status,
      aircraftCount: this.lastAircraftCount,
      positionedAircraftCount: this.lastPositionedCount,
      mlatAircraftCount: values.reduce((sum, value) => sum + value.mlatAircraftCount, 0),
      selectedSource: this.selected,
      lastAttemptAt: latestTimestamp(values.map((value) => value.lastAttemptAt)),
      lastSuccessAt: latestTimestamp(values.map((value) => value.lastSuccessAt)),
      consecutiveFailures: Math.min(...values.map((value) => value.consecutiveFailures)),
      retryAfterMs: values.find((value) => value.retryAfterMs !== null)?.retryAfterMs ?? null,
      activeInternalTracks: values.reduce((sum, value) => sum + (value.activeInternalTracks ?? 0), 0),
      publishedAircraftCount: this.lastAircraftCount,
      adsbPositionCount: Math.max(0, this.lastPositionedCount - values.reduce((sum, value) => sum + (value.mlatPositionCount ?? 0), 0)),
      mlatPositionCount: values.reduce((sum, value) => sum + (value.mlatPositionCount ?? 0), 0),
    };
  }
  private lastAircraftCount = 0;
  private lastPositionedCount = 0;
  private transition(selected: Selected): void { if (this.selected === selected) return; this.selected = selected; this.transitionAt = new Date().toISOString(); }
}

function latestTimestamp(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function sourceName(item: Aircraft): "adsbhub" | "adsblol" {
  return item.origin === "adsbhub" ? "adsbhub" : "adsblol";
}

function mergeNetworkObservations(left: Aircraft, right: Aircraft): Aircraft {
  const leftTime = Date.parse(left.lastSeen);
  const rightTime = Date.parse(right.lastSeen);
  const winner = rightTime >= leftTime ? right : left;
  const other = winner === right ? left : right;
  const sources = [...new Set([...(winner.provenance?.networkSources ?? []), ...(other.provenance?.networkSources ?? []), sourceName(left), sourceName(right)])];
  const provenance = {
    ...(winner.provenance ?? { seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: winner.lastSeen, positionOrigin: winner.origin ?? "adsblol", positionSource: winner.source }),
    seenNetwork: true,
    lastNetworkSeen: winner.lastSeen,
    networkSources: sources,
  };
  const merged = { ...winner, provenance };
  for (const key of ["callsign", "registration", "aircraftType", "aircraftDescription", "lat", "lon", "altitude", "baroAltitude", "geomAltitude", "groundSpeed", "track", "verticalRate", "baroRate", "squawk"] as const) {
    if (merged[key] === null && other[key] !== null) (merged as Record<string, unknown>)[key] = other[key];
  }
  return merged;
}

export function createNetworkFailoverProvider(receiver: ReceiverPosition, enabled: boolean): NetworkFailoverProvider {
  const hub = new AdsbHubProvider(receiver, { enabled });
  const raw = enabled && isAdsbLolRawEnabled() ? new AdsbLolRawProvider(receiver) : null;
  const http = enabled && isAdsbLolHttpFallbackEnabled() ? new AdsbLolProvider(receiver, { enabled: true }) : null;
  return new NetworkFailoverProvider(hub, raw, http);
}
