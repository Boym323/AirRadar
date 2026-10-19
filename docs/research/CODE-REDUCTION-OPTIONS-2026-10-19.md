# AirRadar source reduction: options (2026-10-19)

[Česky](../cs/research/CODE-REDUCTION-OPTIONS-2026-10-19.md)

**Status: proposal, not permission to delete listed production features.** Baseline from `docs/metrics/code-history.json`, release v1.0.536 (`3961d366`): 139,974 nonempty production-source lines, 45,625 test lines. Target is **below 100,000 production lines**: remove at least 39,975 net lines. The metric counts scripts and code artifacts, but excludes tests, documentation, migrations and public assets.

## Verified source-file floor, not expected net savings

| Functional candidate | Exclusive/prefix-matched production LOC | Impact of deleting the entire capability | Decision |
| --- | ---: | --- | --- |
| OGN/FLARM | 3,082 | Loses independent OGN APRS, privacy-aware OGN targets/map/SSE and DDB/SoftRF support | Candidate if unused |
| FlightAware | 406 | Loses paid flight-plan enrichment and billing/usage endpoint; shared integrations also require cleanup | Candidate only if API unused |
| ACARS/VDL2 (RXW) | 1,170 | Loses ACARS FPN waypoints, communications and historical ACARS route presentation | **Preserve pending explicit decision** |
| Digital Twin | 9,625 | Loses truth/outcome calibration, situation & regional attention; shared radar/prediction consumers are impacted | Split by generation, do not remove wholesale |
| Predictive capability | 5,251 | Loses ETA/runway/trajectory readiness and advisories; Digital Twin interactions must be preserved or removed together | High-impact decision |
| Advanced weather | 6,570 | Loses weather APIs, radar/PIREP/SIGMET/context and selected-aircraft weather intelligence | Split into baseline METAR and costly extras |
| Airport operations/intelligence | 6,280 | Loses airport boards, arrival/runway inference, movements and multiple APIs | Split catalog from inference/analytics |

**Non-additive totals**: prefix groups overlap (e.g., `components/airport-weather.tsx` is included in airport and weather), and shared code, tests, UI controls, config, migrations and translations are not fully captured. These sizes are **neither proved dead code nor verified deletion savings**. All seven groups sum to 32,384 LOC before overlap, still below the 39,975 line gap; merely removing all listed group files cannot reach the target.

## Keep regardless of the size target

- Local readsb/Beast ingest, ICAO identity, global single AircraftStateService, ADS-B local truth, bounded state and trails, network arbitration.
- SSE V2 stream, source freshness and failover, health & sanitized public diagnostics, access-controlled mutations.
- Production history and associated migrations/data compatibility until an explicit separate migration plan exists.
- Tests required to preserve safety, parity, source privacy, deployment and T58 instrumentation. T53/T57 utilities are **still imported by T58**.

## Suggested staged plan

1. **Evidence first:** collect feature utilization using sanitized traffic counts and deployed flags (no secrets or aircraft identities); verify optional integration is *disabled or unused* before removing. Preserve rollback commit and confirm external consumers.
2. **Low-risk targeted removals:** unused views, abandoned generations of shadow-only experiments, duplicate presenters and manual scripts only after checking workflows, package commands, deployment/systemd and documented external invocations.
3. **Optional decommission:** FlightAware (if no paid API), OGN (if not used); remove full stack atomically with tests and EN/CZ doc/feature-registry updates. Preserve RXW/ACARS unless explicitly retired.
4. **High-impact reduction:** choose either advanced weather + airport inference, or prediction/obsolete Twin calibration generations, not both blindly. Validate aircraft detail, NOW panel, SSE, event-loop tails and PostgreSQL compatibility.
5. **Close the gap:** separately reduce module duplication based on a module-level call graph and run controlled before/after measurements. Avoid minification, excluded-directory moves, test deletion purely for a metric, or migration/history resets.

## Gates for each removal

- No orphaned Next.js route or stale feature registry; run `npm run features:check`, `npm run docs:check`, lint, typecheck and full relevant Vitest.
- CI/CodeQL/production browser and 1×/2×/4× synthetic scaling; T58 before/after for ingest or event-loop-sensitive changes.
- Record old/new production LOC on *the exact SHA*, not just estimated candidate size.
- Deploy via normal release CI only; verify deployed release identity and Integration Health before another deploy-bearing change.

Follow-on optimization: airport operations reports use one history scan and a shared timestamp ordering; no extra history store is introduced, and core airports/METAR stay unchanged.
