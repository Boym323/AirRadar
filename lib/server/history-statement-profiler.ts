/**
 * Opt-in, bounded, identity-free diagnostics of ORM statement *await* time.
 * This includes database, network and ORM overhead; it is NOT exclusive SQL
 * executor time or process CPU. Never retain queries, ICAO IDs or parameters.
 */
export const HISTORY_STATEMENT_PHASES = [
  "aircraft.lookup", "aircraft.write",
  "flight.lookup", "flight.prior", "flight.write",
  "position.lookup", "position.write", "anomaly.write",
] as const;
export type HistoryStatementPhase = (typeof HISTORY_STATEMENT_PHASES)[number];

type PhaseCounter = { calls: number; failures: number; totalAwaitMs: number; maxAwaitMs: number };
const fresh = (): PhaseCounter => ({ calls: 0, failures: 0, totalAwaitMs: 0, maxAwaitMs: 0 });

export class HistoryStatementProfiler {
  private readonly counters: Record<HistoryStatementPhase, PhaseCounter> =
    Object.fromEntries(HISTORY_STATEMENT_PHASES.map((phase) => [phase, fresh()])) as Record<HistoryStatementPhase, PhaseCounter>;
  private readonly startedAt = new Date().toISOString();

  observe(phase: HistoryStatementPhase, elapsedMs: number, succeeded: boolean): void {
    const counter = this.counters[phase];
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    counter.calls += 1;
    if (!succeeded) counter.failures += 1;
    counter.totalAwaitMs += elapsed;
    counter.maxAwaitMs = Math.max(counter.maxAwaitMs, elapsed);
  }

  diagnostics() {
    return {
      scope: "process-local-opt-in" as const,
      startedAt: this.startedAt,
      semantics: {
        containsIdentities: false as const,
        containsQueries: false as const,
        measures: "statement-await-walltime-not-exclusive-database-or-cpu" as const,
      },
      phases: Object.fromEntries(HISTORY_STATEMENT_PHASES.map((phase) => {
        const counter = this.counters[phase];
        return [phase, {
          ...counter,
          meanAwaitMs: counter.calls ? counter.totalAwaitMs / counter.calls : null,
        }];
      })) as Record<HistoryStatementPhase, PhaseCounter & { meanAwaitMs: number | null }>,
    };
  }
}

export const historyStatementProfiler = new HistoryStatementProfiler();
