# Lightweight ATC in the AirRadar main map (2026-10-19)

## Scope
The main radar map displays **published ATC sectors** and essential metadata: names, service, provenance, effective dates, frequencies, vertical limits and transmitter locations. Planned AUP/UUP activity loads only when its independent map layer is enabled. Selected aircraft still have published ATC/ATS context and a handoff estimate; these are neither confirmed radio communications nor an authoritative real-time ATC sector configuration.

## What the main map no longer does
- Does not poll `/api/atc/sectors/traffic` every 12 seconds.
- Does not poll `/api/atc/sectors/transitions` every 15 seconds.
- Does not render the separate ATC Vertical Traffic / Sector Flows panels or the three extra MapLibre traffic overlays.
- Does not present inferred traffic counts as proof of actual ATC assignment or radio use in the selected aircraft details.
- Refreshes selected-aircraft ATC/ATS context with non-overlapping requests, at least 30 seconds apart, and aborts stale requests when the selected aircraft changes.

- MapLibre ATC and transmitter GeoJSON are memoized from the published datasets and enabled layers. Source updates go through a single replay path, avoiding duplicate setData transfers when camera padding or the map UI changes.

## Contracts preserved
Database schema, eAIP import, published ATC/ATS geometry, altitude-aware assignment, `/api/atc/sectors`, `/api/airspace/activity`, `/api/aircraft/[hex]/context` and the dedicated `/airspace` and `/airspace/sectors/[id]` views remain unchanged. Historical traffic and transition endpoints remain available to other consumers. V1 radar presets discard the retired `showAtcTraffic` flag when reading legacy snapshots without losing other layer options.

## Performance and verification
Periodic queries are eliminated from the main map **only when the former traffic layer would have been enabled**. No percentage CPU saving is claimed before an isolated benchmark. Required checks: lint, typecheck, Vitest, production build, relevant browser gates, CodeQL, synthetic scaling and manual verification of the ATC/AUP toggles, sector popups, selected aircraft context and a saved legacy preset.
