# Alerts & Fleets V1 production record

Result: PASS

## Release

- Previous runtime: `v1.0.242` / `201c18132a620a58bb58a813683b39d458a2f3b0`.
- Corrective release: `v1.0.243`, tag `v1.0.243`.
- Runtime SHA: `6c2b06493c0afbc494be247e56caa333e95d63d3`.
- Corrective source candidate: `8a82ed034974ac7703c1787871f203b8fd548540`.
- Deployment: 2026-10-02 14:02 CEST; migrations applied: `0`.

## Historical data

Production contains 8 pre-fix `FLIGHT_EVENT` occurrences with
`flightEventId = NULL`. They were not modified. The history API returned all 8
and the EN/CZ Alerts UI rendered them safely with fallback context; no
fabricated FlightEvent link, airport, runway, or relation was shown.

## Natural post-fix gate

Temporary rule: `PRODUCTION E2E CANARY — DELETE`, target `ALL_AIRCRAFT`,
trigger `FLIGHT_EVENT / CRUISE_ENTER`, channel `IN_APP`, activated at
2026-10-02 14:03:26 CEST.

Natural linked occurrences observed:

1. FlightEvent `6533`, `CRUISE_ENTER`, aircraft `3C65AE`, at 14:03:39 CEST.
2. FlightEvent `6556`, `CRUISE_ENTER`, aircraft `4D242D`, at 14:04:56 CEST.

Both had valid foreign keys and deterministic source keys. IN_APP delivery was
`PENDING`; no artificial delivery was created. The temporary rule was removed
at 14:06:40 CEST and configuration returned to zero active rules.

## Final audit

- Historical incomplete rows: `8`; backfilled: `0`.
- New incomplete rows after deployment: `0`.
- Duplicate occurrence keys: `0`; duplicate delivery keys: `0`.
- App/DB/receiver/SSE/service health: PASS.
- Production UI smoke: PASS at desktop/tablet/mobile; EN/CZ PASS.
- Pushover: NOT CONFIGURED.

Canary rows are disposable-rule history and may be removed by the normal
rule-delete cascade; their DB/API parity and history visibility were verified
before cleanup. No historical incomplete row was touched.
