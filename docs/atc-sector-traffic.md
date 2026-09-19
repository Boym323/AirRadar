# ATC Sector Traffic Context

AirRadar presents Czech eAIP-published sector volumes together with observed
ADS-B traffic from the existing sampled `FlightPosition` history. A traffic
level describes intensity inside a published volume; it is not an operational
ATC status. AirRadar does not currently have a public authoritative source for
the real-time operational sector configuration of Praha ACC.

The traffic API accepts an explicit UTC `at` value for Time Machine requests.
Without it, the current evaluation time is used. A snapshot is classified in
one database window and then matched against the existing `AtcSector`
geometries, including altitude limits. Unknown or non-comparable altitude is
kept conservative by the existing matcher.

`GET /api/atc/sectors/traffic` returns all supported Praha ACC sector
contexts. `GET /api/atc/sectors/:id/traffic` returns one context.
`GET /api/atc/sectors/transitions?at=...&window=1m|5m|15m` counts deduplicated
flight transitions. Unknown observations are not transitions. Short boundary
jitter is collapsed before counting, but transitions are still observational
inferences from sampled history.

The map overlay provides an optional `ATC Sector Traffic` view over the shared
sector source. The `ATC Vertical Traffic` panel currently exposes the verified
SOUTH stack (`LKAAS`, `LKAANSL`, `LKAATB`) in published vertical order. NORTH
and WEST are intentionally not presented until their relationships are
unambiguous across imported AIRAC data. The Sector flows panel uses one
transitions request for the selected 1, 5, or 15 minute window; its entries
represent movement between published volumes, not confirmed ATC handoffs.

The aircraft quick detail reuses the existing point/altitude sector match and
the already loaded batch traffic context. It uses “Published sector” and
“Sector traffic” wording and reports unavailable data as `—` rather than
claiming a current operational assignment. Historical requests use the same
map-time timestamp for traffic, flows, and aircraft context; live requests
refresh traffic at 12 seconds and flows at 15 seconds.

Published frequencies remain owned by the existing `AtcSector` model. No
database migration is required for the current context and transition APIs;
the current model is sufficient for its normalized MHz representation. Channel
designators and 8.33 kHz carrier mapping should not be inferred until the eAIP
import format exposes them explicitly.

Aircraft traffic inside a published sector volume must not be interpreted as
evidence that the sector is currently operated independently.

## Traffic history UI

The `Traffic history` section is lazy-loaded from the historical API and is
not polled with the live map. Ranges map centrally to buckets as follows:
`1h` → `1m`, `6h` → `5m`, `24h` → `15m`, and `7d` → `1h`. Single-sector
history uses one sector request; comparison and SOUTH history use one batch
request for up to three sectors (`TB`, `SL`, and `S`).

The history window ends at the effective Global Map Time. In Time Machine mode
the `at` instant is used rather than the real current time. Missing values are
rendered as gaps/“No data”; they are not converted to zero. Summary values
(peak, average, entries, and exits) are taken from the backend response.
Charts describe aircraft observed within published SOUTH sector volumes and do
not represent the operational ATC sector configuration. Results depend on
AirRadar ADS-B coverage and retained `FlightPosition` data.
