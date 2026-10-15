# AirRadar integration utility audit — 2026-10-15

Scope: current `main` `5da807ac80a7bfa71b3a0becd5f1550ff9d6ae32`, repo wiring, published provider
contracts, T58 #38775992637 aggregated observation, technical audit and
Integration Health incident. This is a source-based value assessment, not
a production usage census. No secrets, live provider probes, production
configuration changes, database writes or deployment were performed.

## Decision framework

A feature must either support a directly visible user outcome (reliable local
radar, identity, route, weather, observed history, meaningful alerts), or
supply measurably useful operational evidence. A feature kept only for possible
future use must be opt-in, isolated, bounded and independently authorized.
Absence of a usage metric is **not** evidence that nobody uses it.

| Integration / feature | Proven user value or technical role | Practical decision | Production usage evidence |
| --- | --- | --- | --- |
| Local readsb, Beast / JSON fallback | Canonical local aircraft, receiver integrity and continuity | **KEEP** primary, with safe failover | Healthy in 2026-10-15 technical audit; 61/61 T58 samples |
| PostgreSQL Flight history, local stats, SSE | Observed flight history, receiver analytics, live display | **KEEP** | Local DB health verified; T58 still has unexplained multi-second stalls |
| tar1090-db and OurAirports | Plane identity and airport/runway reference, local lookup | **KEEP** with sync / hot cache | User-facing routes proven in code; actual click counts unavailable |
| ADSBHub SBS feed | Optional extended live comparison and coverage | **LIMIT** explicit `ADSBHUB_ENABLED` | No independent live source probe in technical audit |
| ADSB.lol raw / geographic HTTP | Optional expanded coverage; raw and HTTP overlap when both enabled | **LIMIT** explicit `ADSBLOL_ENABLED`, bounded requests, fail-soft | No independent HTTP/provider health proof from T58 |
| ADSBDB route + metadata | Free registration, type, origin/destination enrichment | **KEEP** cache/negative cache and rate limits | Route cache counters exist; per-user conversion/use unknown |
| PostgreSQL route cache | Repeat-lookup avoidance but adds DB contention and schema | **EVALUATE** with read-only hit/bypass deltas before expanding | Prior 108 concurrency bypasses and 24 errors; causation unproved |
| ADSB.lol routeset fallback | Could fill missing route; 403/refusal and provider approval required | **HOLD OFF** until permission and benefit proven | BLOCKED refusal cooldown in Integration Health incident |
| FlightAware AeroAPI | Explicit detailed flight status, schedules and filed route | **KEEP OPT-IN**, pay-per-use; never automatic | On-demand path and budget guards verified in code, actual demand unknown |
| AviationWeather.gov, METAR/TAF, SIGMET/PIREP | Relevant and directly presented aviation weather | **KEEP OPT-IN**, cached | Isolated route/UI present; production usage unverified |
| RXW ACARS/VDL / H1-FPN | Niche communications/waypoint evidence, no canonical flight override | **HOLD OFF** without operator permission and measurable demand | Authorization and real live connectivity unverified |
| OGN APRS, official DDB / SoftRF fallback | Glider/FLARM context, privacy-centric but outside ADS-B core | **KEEP OPT-IN** for glider use; review emergency DDB overhead | No user or active-stream metric verified |
| SondeHub REST / MQTT | Balloon-tracking overlay, orthogonal to aircraft radar | **KEEP OPT-IN**; REST first, MQTT only if active clients | Lazy client TTL implemented, production adoption unknown |
| NOAA Kp / Navigation Integrity | General geomagnetic context, not proof of GNSS disruption | **LIMIT** on-demand, no causal alarms | Default off; no demonstrated user demand |
| ALADIN-vs-ICON wind and Echo Top conversion | Specialist comparisons/vertical radar layer | **DEFER** production enablement pending licensing and benefit | Defaults off; Echo Top requires HDF5/Python runtime |
| Planespotters photos | Optional visual identity with attribution restrictions | **KEEP OPT-IN** only on detail demand | Default off; no demand metric |
| Track Fusion shadow, prospective predictive validation, Digital Twin experiments | Readiness evidence, calibration and future accuracy research | **TIME-BOX** by promotion criterion; do not remove without A/B outcome | Shadow paths explicitly do not modify canonical state; T58 does not prove end-user benefit |
| Push/Pushover delivery | Actionable emergency/watchlist alerts | **KEEP** with explicit recipient opt-in and delivery telemetry | Alert engine exists, actual subscriptions / value unverified |

## Confirmed source-level waste: network provider cross-activation

Before this change, `createNetworkAircraftProvider()` passed
`ADSBHUB_ENABLED || ADSBLOL_ENABLED` to one factory. That factory
enabled ADSBHub with this aggregate flag and created ADSB.lol HTTP
based on the same aggregate flag. Thus enabling either integration could
activate the other, irrespective of the other's own primary opt-in.
A disabled ADSBHub's 1,000 ms publish interval also set the aggregate
next-poll minimum even in an HTTP-only configuration. The aggregate
`getSnapshot()` additionally included disabled providers, adding
unnecessary work and a fresh timestamp from an empty lane.

Change: independent lane activation; only enabled lanes are read and
scheduled. No change to output union when two providers are explicitly
enabled. No changes to canonical local ADS-B, SSE protocol, persistence,
privacy, optional paid enrichment, provider rate limits or production
config values.

## Decisions requiring evidence before deletion

1. Record privacy-safe **feature access counts** (not aircraft IDs/IPs)
   for disabled/offline vs successfully used integrations. Do not auto-enable
   providers just to measure demand.
2. Over stable production windows, compare provider requests/min,
   **incremental unique aircraft and position freshness**, overlap ratio
   and server CPU/heap at matched traffic. Network union can be worth its
   cost if it adds coverage rather than duplicate copies.
3. For route sources, track positive-use percentage, cache-hit/bypass deltas,
   provider refusal and accepted route rate; never interpret cache hits as
   exact avoided HTTP calls.
4. For shadow/predictive research features, require prospective accuracy
   improvements against local ground truth and a clear public graduation
   gate before considering further steady-state CPU spend.
5. Keep experimental providers disabled until API/operator authorization and
   attribution terms are established; do not purge corresponding tests or
   historical evidence merely because they are optional.

## Verification

Regression test covers all upstream opt-in combinations, disabled
diagnostics and the HTTP-only 10-second scheduling contract with a mocked
response. CI, typecheck, CodeQL and production performance regression must
pass before merge. Expected polling reduction in an HTTP-only deployment
is **at most ~10x fewer aggregate timer wake-ups** when the only competing
poll interval was the disabled 1-second hub; this is a code-path estimate,
not a measured end-to-end CPU or request savings claim.

## References

- `docs/DATA-SOURCES.md`, `docs/FEATURES.md`, `lib/server/providers.ts`
- `lib/server/network-failover-provider.ts`
- `docs/INTEGRATION-HEALTH-INCIDENT-20261015.md`
- `docs/audits/TECHNICAL-AUDIT-2026-10-15.md`
- [T58 report](https://github.com/Boym323/AirRadar/blob/audit/t58-history/reports/t58/2026/10/15/run-38775992637-attempt-1/comparison.md)

## Follow-up: measure actual network source value before disabling a lane

A read-only admin-only `/api/system/integrations` response now includes
`networkSourceValue`. Once per 60 seconds of active network publishing it
samples configured ADSBHub, ADSB.lol raw and ADSB.lol HTTP snapshots. It
returns per-source reported-aircraft counts, distinct fresh positioned counts,
positions exclusive to one successfully sampled network lane, shared positions,
and the union count. Disabled sources are absent and failures are null;
`complete=false` means the sample cannot prove uniqueness against all
configured sources. Individual aircraft identifiers and positions are never
returned or retained by the diagnostic sampler. The live radar merge and
upstream request cadence are not changed by this measurement.

**Decision rule:** compare several equivalent traffic windows and source
freshness, not a single snapshot. Exclusive network position means unique
*among configured network lanes*, not unique relative to the LOCAL receiver.
Also verify which unique observations are actually visible in Extended mode.
Do not disable a source based on raw message volume alone. The source
merger now avoids per-overlap temporary arrays and sorts; no production
CPU/memory improvement is claimed until measured after deployment.
