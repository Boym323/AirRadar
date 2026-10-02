# Alerts & Fleets V1 audit

Date: 2026-10-02

## Reusable infrastructure

| Area | Existing implementation | V1 decision |
| --- | --- | --- |
| Process ownership | `AircraftStateService` global singleton | Reuse; no second poller |
| Canonical flight events | `FlightIntelligenceService` + `FlightEvent` persistence | Reuse event boundary |
| Admin authorization | `WATCHLIST_ADMIN_TOKEN`, signed session cookie, same-origin check | Reuse for all mutations |
| Runtime state | atomic files under `/var/lib/airradar` | Reuse for configuration/state |
| History | bounded append-only JSONL ledger | Reuse for compact durable occurrences |
| HTTP/retries | bounded `fetch`, rate-limit helpers, notifier queue | Reuse and keep provider isolated |
| Maps/geometry | MapLibre UI and existing geographic helpers | Circle math in pure V1 module; no polygons |
| Cleanup | byte-bounded alert ledger compaction | Reuse; no per-alert deletion |

## Gaps found

Typed fleet/rule/geofence primitives were missing. The existing watchlist rules
were identity-oriented and the existing engine used a server-wide cooldown.
There was no typed circular-geofence hysteresis tracker. A separate durable
database queue is also not present; the current notifier queue is bounded but
in-memory, so delivery restart recovery remains the next implementation item.

## Security findings

Configuration mutations already require the admin session and same-origin
requests. Pushover credentials are server-side environment values. Public
serialization does not include them. Receiver position publication continues
to use the existing public-position policy.

## Scope guardrails

No Prisma migration, production release, database reset, or deployment was
performed during this audit/change. Existing Flight Intelligence detectors were
not duplicated.
