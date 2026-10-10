# Map Context V1/V2

Map Context is optional enrichment rendered beside the live aircraft map. It
never owns aircraft state and is not part of `/api/stream`, readsb polling,
history, statistics, OGN, or flight intelligence. V2 adds Global Map Time and
bounded historical archives; missing context is unavailable rather than a
silent current-data fallback. METAR and wind mutations are coalesced in RAM
and flushed through bounded atomic JSON snapshots; the default flush window is
60 seconds (or 64 mutations), and graceful shutdown flushes pending data. See
[MAP-TIME.md](MAP-TIME.md).

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
minutes, and persisted opacity (20–100%, default 65%). V2 archives validated
frames under a persistent bounded file directory and resolves the newest frame
at or before Global Map Time.

Optional PseudoCAPPI_2km reuses the same strict bounded PNG pipeline with its
own catalog and frame cache. Pass `?product=PSEUDOCAPPI_2KM` on the frames
and image endpoints; omitting it retains MAX-Z behavior. The map selector
distinguishes maximum reflectivity from reflectivity at 2 km above sea level.
This is NOT the Echo Top product: ČHMÚ distributes Echo Top as HDF5, which
requires a separate decoding/conversion pipeline. No extra poller is added.

## Echo Top HDF5 (optional)

ČHMÚ Echo Top (`ETOP`/`HGHT`) measures the maximum height of radar echo
reflectivity >=4 dBZ in **metres AMSL**; it is not cloud-top height or a
certified flight hazard product. The official Mercator EPSG:3857 extent is
11.267°E–19.624°E, 48.047°N–51.458°N. Data are published every five minutes
as ODIM HDF5 at `https://opendata.chmi.cz/meteorology/weather/radar/composite/echotop/hdf5/`.

The optional provider discovers only the recent five-minute HDF files via up to eight allowlisted HEAD probes, avoiding ČHMÚ's growing oldest-first directory index. It validates the published timestamped filename,
8 MiB HDF signature, strict ODIM product/quantity, gain/offset/no-data,
projection, raster bounds and coordinates before a sandboxed converter returns
an RGBA PNG. Both catalog and image caches are bounded. Failures never alter
MAX_Z/PseudoCAPPI, ADS-B/OGN/SSE or weather fusion. Missing dependencies
produce an unavailable state instead of a synthetic image.

Install `python3-h5py` and `python3-numpy` in the runtime container, then
validate a real ČHMÚ HDF file before setting `CHMI_ECHOTOP_ENABLED=true`.
This additional service is OFF by default and requires ČHMÚ CC BY 4.0
attribution. The generated PNG is a visualization only, not raw quantitative
HGHT export.

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

An optional `ALADIN-CE` selection now uses Open-Meteo `v1/forecast` with
`models=chmi_aladin_central_europe_2km`, retaining the same pressure levels,
knots, UTC valid-time handling and independent bounded cache as the default
ICON-EU product. The model selector is an explicit user action; historical wind
archives, Aircraft Weather fusion and Digital Twin continue using canonical
ICON-EU. ALADIN CZ 1 km does **not** supply these pressure-level variables,
so it is not offered as a wind-aloft provider. Open-Meteo hosted free-plan
licensing/usage restrictions must be reviewed before commercial use.

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
