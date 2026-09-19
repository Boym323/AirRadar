import type { NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";
import { AdsbLolRawProvider } from "@/lib/server/adsblol-raw-provider";
import { isAdsbLolHttpFallbackEnabled } from "@/lib/server/config";

/** Selects one network source at a time; raw and HTTP snapshots are never added together. */
export class AdsbLolFailoverProvider implements NetworkAircraftProvider {
  readonly name = "adsb.lol";
  private selected: "raw" | "http-fallback" | "unavailable" = "unavailable";
  private transitionAt: string | null = null;
  private httpStarted = false;
  constructor(private readonly raw: AdsbLolRawProvider, private readonly http: AdsbLolProvider, private readonly fallbackEnabled = isAdsbLolHttpFallbackEnabled()) {}
  static create(receiver: ReceiverPosition, options: { enabled: boolean }): AdsbLolFailoverProvider {
    const raw = new AdsbLolRawProvider(receiver);
    const http = new AdsbLolProvider(receiver, { enabled: options.enabled });
    return new AdsbLolFailoverProvider(raw, http);
  }
  start(): void { this.raw.start(); }
  async stop(): Promise<void> { await this.raw.stop(); await this.http.stop(); }
  getNextPollDelayMs(): number { return this.selected === "http-fallback" ? this.http.getNextPollDelayMs?.() ?? 10_000 : this.raw.getNextPollDelayMs(); }
  async getSnapshot(): Promise<NetworkAircraftSnapshot> {
    const rawSnapshot = await this.raw.getSnapshot(); const rawDiagnostics = this.raw.getDiagnostics();
    const rawHealthy = rawDiagnostics.status === "online" || rawDiagnostics.status === "degraded";
    if (rawHealthy) { if (this.selected === "http-fallback") { await this.http.stop(); this.httpStarted = false; this.transition("raw"); } else if (this.selected !== "raw") this.transition("raw"); return rawSnapshot; }
    if (!this.fallbackEnabled) { this.transition("unavailable"); return { aircraft: [], fetchedAt: rawSnapshot.fetchedAt, provider: this.name }; }
    if (!this.httpStarted) { this.http.start(); this.httpStarted = true; }
    const snapshot = await this.http.getSnapshot(); if (this.selected !== "http-fallback") this.transition("http-fallback"); return snapshot;
  }
  getDiagnostics(): NetworkProviderDiagnostics {
    const raw = this.raw.getDiagnostics(); const http = this.http.getDiagnostics();
    const selected = this.selected === "raw" ? raw : this.selected === "http-fallback" ? http : raw;
    return { ...selected, enabled: raw.enabled || http.enabled, selectedSource: this.selected, status: this.selected === "raw" ? raw.status : this.selected === "http-fallback" ? http.status : "stale", beastConnected: raw.beastConnected, mlatConnected: raw.mlatConnected, beastLastFrameAt: raw.beastLastFrameAt, mlatLastLineAt: raw.mlatLastLineAt, beastFramesReceived: raw.beastFramesReceived, beastFramesDecoded: raw.beastFramesDecoded, beastDecodeErrors: raw.beastDecodeErrors, mlatLinesReceived: raw.mlatLinesReceived, mlatLinesParsed: raw.mlatLinesParsed, mlatParseErrors: raw.mlatParseErrors, beastReconnects: raw.beastReconnects, mlatReconnects: raw.mlatReconnects, activeInternalTracks: raw.activeInternalTracks, configuredRadiusNm: raw.configuredRadiusNm, lastSourceTransitionAt: this.transitionAt, lastError: raw.lastError ?? http.lastError };
  }
  private transition(source: "raw" | "http-fallback" | "unavailable"): void { this.selected = source; this.transitionAt = new Date().toISOString(); console.info(`[adsb.lol] selected network source=${source}`); }
}
