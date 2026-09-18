# Map Context V1

Map Context is optional enrichment rendered beside the live aircraft map. It
never owns aircraft state and is not part of `/api/stream`, readsb polling,
history, statistics, OGN, or flight intelligence.

## Weather radar

The radar provider reads the official ČHMÚ CZRAD `MAX_Z_MASKED` PNG catalog at
`https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/`.
The product is an EPSG:3857 web-map image, produced every five minutes, with
whole-image bounds `[11.267, 48.047]` to `[20.770, 52.167]`. The server parses
only the strict `pacz2gmaps3.z_max3d.YYYYMMDD.hhmm.0.png` filename, rejects
invalid/future timestamps, and exposes a bounded two-hour catalog (maximum 25
frames).

`/api/weather/radar/frames` returns public frame metadata. The frame endpoint
accepts only a validated timestamp ID, constructs the allow-listed ČHMÚ URL,
and validates status, `image/png`, PNG signature, non-empty content, and a 12
MiB payload limit. It is not a generic URL proxy. Catalog requests are cached
for 60 seconds, frame bytes are coalesced and bounded, and catalog failure is
returned as `available: false` when no usable cache exists.

The browser uses one MapLibre image source and swaps its URL without recreating
the map. The radar is below labels, airports, procedures, SIGMET, airspace
outlines, trails, and aircraft. The UI has latest/history mode, real-frame
timeline, play/pause, bounded neighbour prefetch, stale indication after 18
minutes, and persisted opacity (20–100%, default 65%).

## METAR map

The METAR layer reuses `AviationWeatherProvider` and the official Aviation
Weather Center JSON API. A single bounded batch request serves the selected map
area; the browser does not issue one request per airport. The provider keeps a
separate one-entry bounded batch cache while sharing AWC parsing, timeout,
backoff, and failure handling with airport weather.

`/api/weather/metar-map` returns only public map fields: station coordinates,
observation time, flight category, wind, visibility, ceiling, temperature,
dewpoint, QNH, clouds, and raw METAR. Stale observations are weakened and
labelled. MapLibre GeoJSON circles are used instead of React DOM markers.

## Wind aloft

`WindAloftProvider` uses Open-Meteo’s DWD ICON API with the explicit `icon_eu`
model selection. It requests one bounded 0.75° grid for the CZ/SK/AT operating
area and the 850, 700, 500, 300, and 200 hPa pressure levels. Speeds are
requested and displayed in knots; direction is the model’s meteorological
FROM direction and is not reversed. Pressure levels are approximate heights,
not exact Flight Levels.

`/api/weather/wind` whitelists levels and valid times, returns a bounded set of
points, and uses a 30-minute model snapshot cache with stale-if-error. Wind is
labelled `ICON-EU / Model forecast` with model run and valid time where the
transport supplies them. It has its own valid-time selector and does not share
the radar timeline.

## AUP/UUP

The map reuses the existing Czech AUP/UUP pipeline at `/api/airspace/activity`
and its existing provider/cache. The dedicated Map Context toggle renders the
same authoritative sector geometry with planned windows as `PLANNED ACTIVE` or
`UPCOMING`; it never relabels planned allocation as confirmed activation.
Source reference, validity interval, issue/update provenance, vertical limits,
and the existing disclaimer remain available in the map popup.

## Layer lifecycle and failure isolation

Every new layer has independent client state and cleanup: radar image source,
METAR GeoJSON source, wind GeoJSON source, and AUP/UUP views. Data updates use
`updateImage`, `setData`, or paint/layout properties; map instance recreation is
not used for toggles, frame changes, opacity, levels, or valid times. All new
layers default off and preferences use the existing AirRadar `localStorage`
convention.

The z-order is: basemap → radar → AUP/UUP planned fills → ATS/procedures →
SIGMET → wind arrows → airports/METAR → route/trails → aircraft. Provider
failure is local to its layer and never stops the live aircraft path.
