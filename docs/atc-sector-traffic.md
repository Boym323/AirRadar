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

Published frequencies remain owned by the existing `AtcSector` model. No
database migration is required for the current context and transition APIs;
the current model is sufficient for its normalized MHz representation. Channel
designators and 8.33 kHz carrier mapping should not be inferred until the eAIP
import format exposes them explicitly.

Aircraft traffic inside a published sector volume must not be interpreted as
evidence that the sector is currently operated independently.
