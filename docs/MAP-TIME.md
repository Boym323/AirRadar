# Global Map Time V2

Global Map Time is one UTC instant shared by historical traffic playback and
the optional map-context layers. `MapTimeController` is a small client-side
state boundary; it does not own aircraft state or any provider. `/time-machine`
remains the master clock and calls `setTime`/`seek` as playback advances.

## Modes and temporal semantics

- `LIVE` means the normal live radar path. The live aircraft poller and SSE
  path are unchanged.
- `HISTORICAL` means every enabled context layer resolves against the selected
  instant. Current data is never silently substituted for missing history.
- All API instants are timezone-qualified ISO timestamps and are normalized to
  UTC internally.
- Radar and METAR use the newest observed record at or before the requested
  instant. Radar accepts a maximum ten-minute delta; METAR accepts a maximum
  two-hour observation age.
- Wind is a model product. The resolver requires `modelRun <= selected time`,
  then chooses the nearest valid time within one hour and preserves both
  timestamps.
- AUP/UUP uses a revision published at or before the selected time and an
  interval containing the selected time. It remains `PLANNED`, never actual.
- Historical SIGMET is explicitly unavailable until a separate archive exists.

Each result includes the requested time, resolved time, match type, delta,
provider and source kind (`OBSERVED`, `MODEL`, or `PLANNED`). A layer can be
unavailable while traffic and other layers continue.

## Persistence and retention

Radar frames are archived as validated PNG files under
`WEATHER_RADAR_ARCHIVE_DIR/YYYY/MM/DD/HHMM.png`. Downloads use a temporary
file and atomic rename, two-worker backfill, retention cleanup, and an optional
byte cap. The default production location is
`/var/lib/airradar/weather-radar`; it must be persistent storage.

Normalized METAR, wind snapshots, and AUP/UUP revisions use bounded atomic JSON
archives in the same runtime-state parent. They are deduplicated, pruned to
`MAP_CONTEXT_RETENTION_DAYS` (which follows `HISTORY_RETENTION_DAYS` by
default), and are never part of aircraft history or SSE payloads.

## APIs and client performance

- `GET /api/map-context/at?at=...Z` returns a small manifest.
- `GET /api/map-context/range` returns bounded availability ranges.
- Layer data is loaded through `/api/map-context/radar`, `/metar`, `/wind`,
  and `/aup`; archived radar bytes are served by `/radar/frame/:id`.
- Traffic endpoints remain unchanged; context is deliberately not embedded in
  `/api/time-machine/window`.

All `at` values are bounded to the configured retention horizon and reject
invalid or overly-future timestamps. Playback context requests are coalesced,
generation-checked and bucketed at five minutes; a seek aborts prior requests
and old responses cannot overwrite a newer seek. MapLibre sources use explicit
`time-machine-*` IDs and are updated in place.

There is no synthetic backfill: historical availability begins when each
archive first receives data. The resolver is reusable by a future Flight Story
via `resolveContextAt(timestamp)`.
