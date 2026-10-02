# Alerts & Fleets V1 production record

Result: BLOCKED — one natural occurrence was obtained, but the occurrence did
not persist its canonical `FlightEvent` foreign-key ID, and the production
history UI does not render V1 `AlertOccurrence` rows.

Release: v1.0.239
Runtime SHA: 37086cef3e9c75c036ba5812f78e17f3659e1aaf
Tag: v1.0.239 (verified on deployed runtime metadata)
Activation: 2026-10-02 13:13:20.192 CEST
Migration/build: existing release PASS; no release or restart performed for
this gate.

## Temporary rule

- ID: `c16de7c4-1598-415b-813c-e0fe24955258`
- Name: `PRODUCTION E2E CANARY — DELETE`
- Target: `ALL_AIRCRAFT`
- Trigger: `FLIGHT_EVENT` / `APPROACH`
- Channel: `IN_APP` only
- Pushover: disabled/not configured
- No synthetic data, history edits, or detector changes were made.

Immediate no-retroactive check passed: occurrence count was unchanged at zero
immediately after activation.

## First natural match

- FlightEvent: `5312`
- Type: `APPROACH`
- Occurred: `2026-10-02 13:13:30.009 CEST`
- Aircraft: `48AC82`, callsign `LOT328`
- Occurrence: `alert-v1:c16de7c4-1598-415b-813c-e0fe24955258:FLIGHT_EVENT:48AC82:1790939458296:APPROACH:LZRU:0`
- Created: `2026-10-02 13:13:30.886 CEST`
- End-to-end latency: `877 ms`

The source key is deterministic and matches the canonical event key, but
`AlertOccurrence.flightEventId` is NULL instead of `5312`. This is a real
persistence defect and blocks PASS.

## Idempotency and delivery

During the approximately 2-minute post-match audit, the rule generated 8
distinct natural APPROACH occurrences. There were 8 unique
`ruleId + sourceType + sourceKey` keys and zero duplicate keys; the first
FlightEvent produced exactly one occurrence. IN_APP delivery rows are
intentionally modeled by the canonical repository: 8 rows, all PENDING, with
no Pushover attempt. No duplicate deliveries were observed.

## Cleanup and health

- Temporary rule disabled: YES; occurrence history preserved.
- Production configuration restored: YES; public health reports alerts disabled.
- App: PASS; DB: PASS; receiver: PASS; SSE: not separately browser-tested;
  service: active.
- UI: FAIL for this gate. `/alerts` is the legacy JSONL alert history and does
  not display these PostgreSQL `AlertOccurrence` rows; the admin page exposes
  configuration only.
- Pushover: NOT CONFIGURED.

Next step: fix only the canonical FlightEvent-ID persistence defect and wire
the V1 occurrence history to the intended Alerts history UI, then repeat the
production gate with a new temporary rule.

## Corrective implementation status

The corrective implementation is prepared locally but not deployed. It passes the canonical numeric FlightEvent.id explicitly to persistence, rejects incomplete FLIGHT_EVENT occurrences, verifies the event exists before the atomic occurrence/delivery transaction, renders PostgreSQL V1 rows through the Alerts history API/UI, and preserves deterministic occurrence keys and delivery atomicity.

Read-only audit found 8 incomplete production FLIGHT_EVENT rows, including the known canary row. Their source keys do not deterministically encode a canonical event ID, so no backfill was executed. Production release and the natural post-fix event gate remain pending.
