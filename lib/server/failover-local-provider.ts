import type { AircraftProvider } from "@/lib/server/provider";
import type { ProviderSnapshot } from "@/lib/aircraft/types";
import type { BeastLocalProvider, BeastDiagnostics } from "@/lib/server/beast-local-provider";

export class FailoverLocalProvider implements AircraftProvider {
  readonly name = "local-beast+json-failover";
  private active: "beast" | "json" = "json";
  private fallbackSince: number | null = null;
  private recoveryFrames = 0;
  constructor(private readonly beast: BeastLocalProvider, private readonly json: AircraftProvider, private readonly jsonEnabled: boolean) {}
  async getSnapshot(): Promise<ProviderSnapshot> {
    const beastSnapshot = await this.beast.getSnapshot(); const diagnostics = this.beast.getDiagnostics();
    const healthy = diagnostics.status === "healthy" && diagnostics.lastFrameAt !== null;
    if (healthy && this.active === "json") { this.recoveryFrames += diagnostics.framesDecoded > 0 ? 1 : 0; if (this.recoveryFrames >= 3) { this.active = "beast"; this.fallbackSince = null; } }
    if (!healthy) { this.recoveryFrames = 0; if (this.active === "beast" || this.fallbackSince === null) this.fallbackSince ??= Date.now(); this.active = this.jsonEnabled ? "json" : "beast"; }
    if (this.active === "beast") return beastSnapshot;
    if (this.jsonEnabled) { const snapshot = await this.json.getSnapshot(); return { ...snapshot, provider: "readsb-json-fallback" }; }
    return beastSnapshot;
  }
  getDiagnostics(): BeastDiagnostics & { activeSource: "beast" | "json-fallback"; fallbackSince: string | null } { return { ...this.beast.getDiagnostics(), activeSource: this.active === "beast" ? "beast" : "json-fallback", fallbackSince: this.fallbackSince === null ? null : new Date(this.fallbackSince).toISOString() }; }
  abort(): void { this.beast.abort?.(); this.json.abort?.(); }
  async close(): Promise<void> { await this.beast.close?.(); await this.json.close?.(); }
}
