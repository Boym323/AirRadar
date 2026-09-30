# Flight Intelligence V1 audit

Status: implemented on the existing canonical Flight Intelligence path.

| Boundary | Current implementation | Decision |
| --- | --- | --- |
| Live owner | `AircraftStateService` → `FlightIntelligenceService` | Reused; no second poller |
| Pure detector | `lib/intelligence/detector.ts` | Extended with initial climb, cruise entry, destination-independent TOD, and version |
| Airport Operations | `lib/server/airport-movements.ts` | Consumes linked canonical GO_AROUND/HOLDING events with sampled fallback |
| Persistence | Existing `FlightEvent` / unique `eventKey` | Reused; no migration |
| Replay | `lib/intelligence/replay.ts` | Same detector; new event types are comparable |
| Time Machine | `lib/server/time-machine.ts` | Existing occurrence-time bounded event read |
| UI/i18n | Existing Flight Story/intelligence surfaces and EN/CZ dictionaries | Extended labels; shell unchanged |

The existing `HOLDING` and `HOLDING_ENDED` names are retained as AirRadar's
compatibility convention for the requested HOLD_ENTER/HOLD_EXIT semantics.
No separate Airport Operations go-around detector is introduced by this change.
