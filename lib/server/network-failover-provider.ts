import type { NetworkProviderDiagnostics, ReceiverPosition } from "@/lib/aircraft/types";
import type { NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import { AdsbHubProvider } from "@/lib/server/adsbhub-provider";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";
import { AdsbLolRawProvider } from "@/lib/server/adsblol-raw-provider";
import { isAdsbLolHttpFallbackEnabled, isAdsbLolRawEnabled } from "@/lib/server/config";

type Selected = "adsbhub" | "adsblol-raw" | "adsblol-http" | "unavailable";

/** Explicit priority chain. Only the selected fallback lane is started. */
export class NetworkFailoverProvider implements NetworkAircraftProvider {
  readonly name = "network";
  private selected: Selected = "unavailable";
  private transitionAt: string | null = null;
  private rawStarted = false;
  private httpStarted = false;
  constructor(
    private readonly hub: AdsbHubProvider,
    private readonly raw: AdsbLolRawProvider | null,
    private readonly http: AdsbLolProvider | null,
  ) {}
  start(): void { this.hub.start(); }
  async stop(): Promise<void> { await this.hub.stop(); if (this.rawStarted) await this.raw?.stop(); if (this.httpStarted) await this.http?.stop(); }
  getNextPollDelayMs(): number {
    if (this.selected === "adsblol-http") return this.http?.getNextPollDelayMs?.() ?? 10_000;
    return this.hub.getNextPollDelayMs();
  }
  async getSnapshot(): Promise<NetworkAircraftSnapshot> {
    const hubSnapshot = await this.hub.getSnapshot();
    const hubDiagnostics = this.hub.getDiagnostics();
    if (hubDiagnostics.status === "online" || hubDiagnostics.status === "degraded") {
      await this.stopFallbacks(); this.transition("adsbhub");
      return { ...hubSnapshot, provider: this.name };
    }
    if (this.raw) {
      if (!this.rawStarted) { this.raw.start(); this.rawStarted = true; }
      const snapshot = await this.raw.getSnapshot();
      const diagnostics = this.raw.getDiagnostics();
      if (diagnostics.status === "online" || diagnostics.status === "degraded") {
        if (this.httpStarted) await this.http?.stop(); this.httpStarted = false; this.transition("adsblol-raw");
        return { ...snapshot, provider: this.name };
      }
    }
    if (this.http) {
      if (!this.httpStarted) { this.http.start(); this.httpStarted = true; }
      const snapshot = await this.http.getSnapshot();
      this.transition("adsblol-http");
      return { ...snapshot, provider: this.name };
    }
    this.transition("unavailable");
    return { aircraft: [], fetchedAt: hubSnapshot.fetchedAt, provider: this.name };
  }
  getDiagnostics(): NetworkProviderDiagnostics {
    const hub = this.hub.getDiagnostics();
    const raw = this.raw?.getDiagnostics();
    const http = this.http?.getDiagnostics();
    const selected = this.selected === "adsbhub" ? hub : this.selected === "adsblol-raw" ? raw : this.selected === "adsblol-http" ? http : hub;
    return { ...(selected ?? hub), enabled: Boolean(hub.enabled || raw?.enabled || http?.enabled), selectedSource: this.selected, lastSourceTransitionAt: this.transitionAt };
  }
  private async stopFallbacks(): Promise<void> { if (this.rawStarted) await this.raw?.stop(); if (this.httpStarted) await this.http?.stop(); this.rawStarted = false; this.httpStarted = false; }
  private transition(selected: Selected): void { if (this.selected === selected) return; this.selected = selected; this.transitionAt = new Date().toISOString(); }
}

export function createNetworkFailoverProvider(receiver: ReceiverPosition, enabled: boolean): NetworkFailoverProvider {
  const hub = new AdsbHubProvider(receiver, { enabled });
  const raw = isAdsbLolRawEnabled() ? new AdsbLolRawProvider(receiver) : null;
  const http = isAdsbLolHttpFallbackEnabled() ? new AdsbLolProvider(receiver, { enabled: true }) : null;
  return new NetworkFailoverProvider(hub, raw, http);
}
