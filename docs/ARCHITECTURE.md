# Architecture

This document describes the selected-feature runtime of the AirRadar cleanup branch in PR #1096, **not** a production deployment. The authoritative page/API ownership is in docs/features.registry.json and the feature selection is recorded in docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json.

## Live aircraft processing

The central aircraft state owner is lib/server/aircraft-state.ts. Local ADS-B aircraft arrive from a configured readsb JSON endpoint and/or Beast connection. lib/server/providers.ts intentionally returns a diagnostic failure rather than synthesizing production aircraft if both are unconfigured. Synthetic receiver data is confined to isolated test fixtures. Optional ADSBHub and ADSB.lol provide bounded, source-affinity-controlled network coverage without impersonating locally received aircraft.

Live snapshots and SSE feed the radar and selected aircraft detail. Receiver coverage and statistics have independent collection/retention paths. Sampled observations are persisted through the retained history services. Snapshot hot paths retain Navigation Integrity observation and receiver statistics, but **do not** evaluate Flight Intelligence, predictive shadow, Operational Digital Twin or the legacy AlertEngine.

## Selected UI and HTTP contracts

Retained user-facing pages are /, /aircraft/[hex], /airports, /airports/[icao], /navigation, /navigation-integrity, /receiver/coverage, /system and /weather.

Retained APIs include /api/aircraft, /api/aircraft/[hex], /api/search, /api/stream, /api/airports, /api/airports/[icao], /api/history/[hex], /api/statistics, /api/atc/sectors, /api/ats/routes, /api/navigation/data, /api/navigation-integrity/current, /api/weather/metar-map, /api/weather/sigmet, /api/map-context/at, /api/map-context/range, /api/ogn/state and /api/ogn/stream. Internal and optional communications, Web Push and protected diagnostics APIs are registered in the feature registry.

Standalone Flight Story, Time Machine, predictive, Operational Twin, retired fleet/watchlist rules, obsolete airport analytics and SID/STAR importer routes are removed. The list of 50 retired API routes and 21 removed pages is in docs/audits/SELECTED-FEATURE-ID-VERIFICATION-2026-10-21.json. External callers of these routes require access-log review before deployment; a passing browser CI does not establish external client compatibility.

## ATC, navigation and receiver

Selected ATC sector geometry, published ATS paths and navigation reference data remain on the live map and in aircraft route context. Optional OGN/FLARM has an independent APRS/DDB/SoftRF receiver and privacy-aware SSE, not an ADS-B history writer. RXW Hub retains ACARS/VDL2 communications metadata; its former live H1/FPN flight-plan overlay is retired. FlightAware paid requests are intentionally on-demand and subject to budget/cache limits. ADSBDB, tar1090-db and airport reference data support aircraft identity and route enrichment.

## Weather and historical map context

Retained weather includes observed METAR/TAF, SIGMET, PIREP, available aircraft observations and CHMI radar frames. The bounded map-context archive retains prior METAR, CHMI and planned Czech AUP/UUP JSON records.

**T12 scheduled collection has stopped.** MapContextArchiveService.poll() invokes live METAR and CHMI radar archival polling only; it does not call the Czech AIM network reader. Previously recorded AUP data is still read via MapContextArchive.resolveAupAt() and the historical /api/map-context/at and /api/map-context/range contracts. MapContextArchive.addAup() remains for archival compatibility, but has no scheduled fetch caller. Do not delete old map-context-aup-v1.json state or historical DTOs.

## Persistence and notifications

PostgreSQL sampled Flight, FlightPosition, FlightEvent and other historical tables, migrations, navigation observations and statistics remain intact even when a presenting UI was removed. Existing alert delivery occurrences remain stored. The independent alert-delivery worker handles durable Pushover deliveries; the Web Push subscription/VAPID endpoints remain. The old rule engine is disabled and not run on every aircraft snapshot. The disabled AlertStatus response remains as a narrow compatibility contract until external consumers are reviewed.

## Security, monitoring and release

Public health/system responses are sanitized; protected provider diagnostics require an authenticated session. Provider requests are bounded and failures may never masquerade as successful local ADS-B. Keep ingress freshness, database/route-cache tails, event-loop T58 latency, RSS/CPU, SSE clients and delivery-queue health observable.

Synthetic 1x/2x/4x benchmarks, TypeScript, Vitest, CodeQL and browser CI validate branch safety, but cannot replace same-workload live production A/B and ingress/client-log checks. The canonical production-source LOC metric uses scripts/code-metrics.mjs. Changes in PR #1096 do not alter running production until a separately authorized merge/deployment and rollback plan.
