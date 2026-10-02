# Alerts & Fleets V1 production record

Result: PARTIAL — production release and stable canary passed; no natural
FlightEvent occurred during the bounded observation window.

Release: v1.0.239
Runtime SHA: 37086cef3e9c75c036ba5812f78e17f3659e1aaf
Tag: v1.0.239 (verified on runtime SHA)
Deployment: 2026-10-02 12:14:58 CEST service start
Migration: PASS; database already up to date, 0 migrations applied.
Production build: PASS through the canonical isolated release workflow.
Health: local and public health PASS; service active; DB and receiver OK.

Canary: 45 minutes, zero enabled rules before setup, then one temporary
low-noise fleet/rule targeting ICAO `89617E`; channel IN_APP only; Pushover
disabled. No synthetic events were sent. The temporary configuration was
removed after the canary.

Observed totals: 0 AlertOccurrence, 0 AlertDelivery, 0 duplicate occurrence
keys, 0 duplicate occurrence/channel deliveries, 0 retrying/failed/stale
deliveries. Service, DB, and receiver were healthy in all 45 samples.

FlightEvent: no natural matching event observed; deterministic and real
PostgreSQL occurrence/dedupe evidence PASS.
Squawk: no natural special squawk observed; deterministic/restart evidence
PASS.
Geofence: no production geofence created; deterministic/real PostgreSQL
evidence PASS.
Pushover: NOT CONFIGURED / disabled; no provider call made.
