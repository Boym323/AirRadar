# Alerts & Fleets V1 audit

Date: 2026-10-02

## Reusable infrastructure

| Area | Existing implementation | V1 decision |
| --- | --- | --- |
| Process ownership | `AircraftStateService` global singleton | Reuse; no second poller |
| Canonical flight events | `FlightIntelligenceService` + `FlightEvent` persistence | Reuse event boundary |
| Admin authorization | `WATCHLIST_ADMIN_TOKEN`, signed session cookie, same-origin check | Reuse for all mutations |
| Runtime state | replaceable in-memory Prisma configuration cache | Reuse; mutations persist first and invalidate atomically |
| History | `AlertOccurrence` / `AlertDelivery` PostgreSQL models | Reuse canonical durable occurrence path |
| HTTP/retries | bounded `fetch`, rate-limit helpers, notifier queue | Reuse and keep provider isolated |
| Maps/geometry | MapLibre UI and existing geographic helpers | Circle math in pure V1 module; no polygons |
| Cleanup | byte-bounded alert ledger compaction | Reuse; no per-alert deletion |

## Audited ownership

- FlightEvent signal evaluation: `AlertEngine.observeIntelligenceEvent()`
- Squawk/geofence transition evaluation: `AlertV1TransitionTracker` from `AlertEngine.observe()`
- Occurrence and delivery persistence: `AlertsFleetsRepository.recordOccurrence()`
- Configuration cache: `AlertsFleetsRepository.loadConfig()`
- Delivery worker/recovery: `AlertDeliveryWorker` and repository claim/recovery methods
- Admin APIs/UI: `app/api/admin/alerts/**` and `/admin/alerts`

Squawk and geofence transitions reuse the FlightEvent occurrence evaluator.
Episode keys use normalized ICAO, transition, and canonical observation time.

## Security findings

Configuration mutations already require the admin session and same-origin
requests. Pushover credentials are server-side environment values. Public
serialization does not include them. Receiver position publication continues
to use the existing public-position policy.

## Scope guardrails

No production database, release, service restart, or deployment was performed.
Existing Flight Intelligence detectors were not duplicated.
