# AirRadar technical audit — 2026-10-15

## Executive summary

This is a read-only audit of the current repository and the served public
production diagnostics. No production service, database, cooldown, provider
configuration, secret, migration, build, or release was changed.

At the observation boundary (15:04 UTC / 17:04 CEST), production served
`1.0.462`, commit `e8282c48`, while the current source `main` was
`475c40ed`. Production health was HTTP 200: application, database and local
receiver were healthy, with 73 local aircraft in the sampled response.

The audit did not prove a PostgreSQL execution-time root cause for the
historical P95/P99 values. The current telemetry separates several facts:

- database health was OK; the last-hour database latency distribution had
  P50 4 ms, P95 986 ms and P99 4,994 ms across 62 samples; the 24-hour P99
  was 1,153 ms;
- route-cache diagnostics recorded 108 concurrency bypasses and 24 DB errors
  in the current rolling counters; this is application admission/error
  evidence, not proof that PostgreSQL executed a 5-second statement;
- ADSB.lol routeset was in a persisted refusal cooldown until 20:37 CEST,
  with 115 blocked lookups and no new probe; it remains
  `BLOCKED_BY_PROVIDER_APPROVAL` operationally;
- the runtime sample had event-loop P50/P95/P99 of approximately
  20.1/21.0/59.6 ms, but one bounded window reached 4,152 ms. Causality is
  not established; no speculative runtime rewrite was made;
- RSS was approximately 1.48 GiB and heap used approximately 617 MiB at the
  sampled point. This is a pressure signal, not proof of a memory leak.

The concrete implementation delivered by this audit is a bounded
`npm run audit:integrations` orchestrator with read-only, offline fixture and
CI modes, sanitized JSON/Markdown output, status classification, and
regression tests. It never sends provider probes or database writes.

## 1. Repository, deployment and GitHub state

| Item | Evidence | Result |
| --- | --- | --- |
| Current checkout | `475c40ed942c30713026e17eafda0858feac6c98` | `main`, clean tracked tree before audit |
| Served production | `/api/version` | `1.0.462`, `e8282c48`, production channel |
| Current source vs production | ancestry check | current `main` is metadata-only ahead of served release |
| Open PRs | GitHub PR search | none |
| Latest successful CI | [run 38753979148](https://github.com/Boym323/AirRadar/actions/runs/38753979148) | success for served release commit |
| Latest CodeQL | [run 38752725190](https://github.com/Boym323/AirRadar/actions/runs/38752725190) | success on application commit `90b17978` |
| T58 soak | [run 38754621669](https://github.com/Boym323/AirRadar/actions/runs/38754621669) | in progress; no result claimed |

The requested optimization/security PRs are merged into the served commit's
ancestry: [#895](https://github.com/Boym323/AirRadar/pull/895),
[#896](https://github.com/Boym323/AirRadar/pull/896),
[#898](https://github.com/Boym323/AirRadar/pull/898),
[#899](https://github.com/Boym323/AirRadar/pull/899),
[#902](https://github.com/Boym323/AirRadar/pull/902), and
[#906](https://github.com/Boym323/AirRadar/pull/906). This ancestry check is
not a substitute for a matched production benchmark after each optimization.

## 2. Production status and provider matrix

The production observations below were obtained with bounded GET requests.
Raw aircraft payloads, aircraft identifiers, positions, provider error text,
credentials and database rows were not written to the audit output.

| Area/provider | Status | Evidence or limitation |
| --- | --- | --- |
| readsb / local Beast + JSON failover | VERIFIED HEALTHY | Health reports a live local source; sampled aircraft count 73. |
| PostgreSQL availability | VERIFIED HEALTHY | Health reports database `ok`; this is not a pool/lock/SQL-cause proof. |
| ADSBHub | NOT VERIFIED | Implemented and inventoried; no active provider probe was issued. |
| ADSB.lol live coverage | NOT VERIFIED | Source reliability was present in runtime status, but no separate live-provider probe was issued by this audit. |
| ADSB.lol HTTP fallback | NOT VERIFIED | No active fallback request was issued. |
| ADSB.lol routeset | BLOCKED | Refusal cooldown active; no new POST was sent. Provider approval remains required. |
| OGN APRS-IS | NOT VERIFIED | On-demand/live integration was not probed. |
| OGN DDB | NOT VERIFIED | No refresh request was issued. |
| SoftRF snapshot | NOT VERIFIED | Local snapshot freshness was not independently collected in production. |
| ADSBDB | NOT VERIFIED | No external enrichment request was issued. |
| RXW Hub / FPN | NOT VERIFIED | No active hub request was issued. |
| Aviation Weather / METAR / TAF / SIGMET / PIREP | NOT VERIFIED | On-demand integrations were not probed. |
| Airport/aircraft metadata | NOT VERIFIED | Repository boundaries exist; production freshness was not exposed by the safe endpoint. |
| ATC sectors/routes/points | NOT VERIFIED | Dataset code and tests exist; activation was not changed and the production geometry canary was not run. |

`AIRRADAR_ATC_RESOLUTION_ENABLED=false` and
`AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED=false` are the local deployment
configuration values. The health endpoint reports 114 configured sectors.
Automatic resolution was not enabled by this audit.

## 3. PostgreSQL and route cache

### Evidence

The public process telemetry does not expose PostgreSQL pool acquisition,
server-side SQL execution, lock wait, or event-loop scheduling as separate
values. Therefore P95/P99 values are inclusive application observations and
must not be read as a single PostgreSQL statement taking 4,994 ms.

Current read-only counters:

| Metric | Value |
| --- | ---: |
| Database latency samples, last hour | 62 |
| Database P50 / P95 / P99, last hour | 4 / 986 / 4,994 ms |
| Database P50 / P95 / P99, last 24 hours | 6 / 205 / 1,153 ms |
| Route DB errors | 24 |
| Route DB bypasses | 2,085 |
| Route-cache concurrency bypasses since process start | 108 |
| Route-cache timeouts | 0 |
| Route-cache connection failures | 0 |
| Route-cache SQL timing P50 / P95 / P99 | 7.4 / 33.8 / 88.5 ms |

The route cache already has bounded foreground concurrency, a separate lower
write limit, circuit/backoff state, timeout accounting that retains the slot
until the underlying promise settles, and no runtime DDL. The measured
concurrency bypasses are therefore a real symptom but do not justify raising
limits or timeout values without pool and DB-side evidence. No index or
database migration is proposed by this audit.

### Root-cause classification

| Candidate cause | Result |
| --- | --- |
| Database unreachable | Not supported by current health; NOT the demonstrated cause |
| PostgreSQL lock/deadlock | NOT VERIFIED; no production read-only lock inspection was available in this run |
| Connection-pool acquisition wait | NOT VERIFIED |
| SQL execution time | NOT isolated from inclusive client timing |
| Application concurrency admission | CONFIRMED symptom: 108 route-cache concurrency bypasses |
| External routeset refusal | CONFIRMED and independent: cooldown with no new request |
| Node scheduling/GC cause of 4.15 s stall | UNKNOWN; correlation only, not established |

The exact database latency root cause remains `INSUFFICIENT EVIDENCE`.

## 4. Runtime, memory, SSE and ATC

The current runtime endpoint reported 15 bounded event-loop windows. The
largest maximum was 4,152 ms, while point-in-time P50/P95/P99 were about
20.1/21.0/59.6 ms. This disproves neither the historical 7.4 s event nor a
memory leak. It does show that multi-second scheduling stalls still occur in
the recent observation window and require a protected soak with CPU, GC,
cgroup throttling and phase attribution.

Memory was approximately 1.48 GiB RSS, 617 MiB heap used and 923 MiB heap
total. No heap snapshot was collected because it could contain sensitive
runtime data. Long-lived structures are bounded in source for trails,
metadata, SSE capacity, enrichment, ATC and provider queues; retention is not
verified without a multi-window soak or isolated profile.

SSE fan-out was not load-tested. The production sample had zero active SSE
clients, so it cannot validate one-, five- or twenty-client browser behavior.
The existing #895 implementation remains bounded/coalesced and preserves V1
and V2 sequence state; no public protocol change was made.

The ATC implementation contains asynchronous dataset preparation, bounding-box
candidate indexing, immutable atomic publication, vertical filtering and
freshness/generation guards. Existing differential/geometry tests are present.
Production activation and the requested 50/100/250/500-aircraft benchmark
were not run in this audit.

## 5. Security and data handling

- `.env` is ignored by Git and has mode `0600`, owned by the service account.
- `.env.dev.local` is ignored by Git and was corrected from `0644` to `0600`;
  it targets the isolated `airradar_dev` database. No secret values were read
  into the report.
- No secret value, token, password, database URL, raw position or aircraft
  identifier is present in the generated audit artifact.
- Production has `AIRRADAR_ADMIN_AUTH_ENABLED=false`. This is an intentional
  private-receiver deployment mode in the current source, but it means the
  admin diagnostics boundary relies on network privacy. Enabling auth requires
  operator approval and a configured token; it was not changed here.
- CodeQL hardening from #896 is in the served commit ancestry. Latest observed
  CodeQL was successful, but no claim is made that a new PR has no alerts
  until its own CodeQL run completes.

## 6. Implemented changes

| Area | Original problem | Change | Verification | Status |
| --- | --- | --- | --- | --- |
| Integration diagnostics | Existing script covered only route counters and did not provide one machine-readable audit verdict | Added `scripts/integration-audit.mjs` with read-only/offline/CI modes, bounded GETs, timeouts, sanitized projections, provider inventory, comparison hook and JSON/Markdown output | 2 dedicated Vitest tests, syntax check, diff check | FIXED LOCALLY; CI PENDING |
| Security regression | Audit output must not become a raw HTTP/file sink | Added allowlist projections and safety flags; fixture test rejects raw aircraft payload leakage | Dedicated Vitest regression passes | FIXED LOCALLY; CI PENDING |
| CI visibility | Integration health had no persisted sanitized report artifact | Workflow now runs the audit and uploads only its bounded JSON/Markdown artifacts | Workflow change awaits CI | FIXED LOCALLY; CI PENDING |
| Local development secret permissions | `.env.dev.local` was world-readable (`0644`) | Changed mode to `0600`; contents unchanged | `stat`, isolated DB target check | FIXED LOCALLY |

No change was made to routeset request behavior, provider authorization,
ATC activation, database schema, pool limits, retries, SSE protocol, or
production deployment.

## 7. Performance comparison

There is no valid before/after production experiment for this audit. Existing
T57/T58 and PR benchmark figures are observational or synthetic and have
different commits/workloads. The current evidence is recorded as:

| Measurement | Current | Comparable before/after claim |
| --- | ---: | --- |
| DB P95/P99 last hour | 986 / 4,994 ms | No; inclusive telemetry and no matched baseline |
| Route-cache SQL P50/P95/P99 | 7.4 / 33.8 / 88.5 ms | No; rolling process sample, not a controlled experiment |
| Event-loop max in returned windows | 4,152 ms | No; no matched soak or causal attribution |
| RSS / heap used | 1.48 GiB / 617 MiB | No; point-in-time sample only |

The correct conclusion is `INSUFFICIENT EVIDENCE` for production speedup or
leak elimination. Synthetic benchmarks and existing differential tests remain
useful regression gates, not production causality evidence.

## 8. CI, PR and release plan

The audit branch is intended for one reviewable PR containing the audit
automation and tests. It must pass Vitest, TypeScript, ESLint, production
build/release-preview, browser gates, performance regression and CodeQL before
merge. No PR was opened or merged during this audit, and no release was run.

After explicit approval, the safe rollout is:

1. Review the generated audit artifact and exact PR checks.
2. Merge only through protected `main`; do not merge automatically from this
   audit session.
3. Let the normal CI/deploy process validate and deploy the pinned artifact;
   do not run `npm run build` in the live checkout.
4. Run the new audit in read-only mode after deployment and retain its sanitized
   artifact.
5. Run a separate authenticated, read-only 30–60 minute soak with process
   identity, route queue/admission, DB operation, event-loop, GC, RSS and SSE
   aggregates. Do not load-test production SSE without explicit approval.
6. For routeset, contact ADSB.lol and obtain production approval before any
   cooldown recovery request. Do not reset the cooldown or change identity to
   bypass refusal.

Rollback of the audit code is a normal application release rollback through
`deploy/release.sh`; no database rollback is needed because this change has no
schema migration. The `.env.dev.local` permission correction is local and
reversible with an explicit operator action, but `0600` should be retained.

## 9. Final status

### HOTOVO

- Current source, served identity, recent PR ancestry, CI/CodeQL state and
  public production health were checked.
- Read-only diagnostics were collected without provider POSTs, DB writes,
  restarts, migrations or release actions.
- Concrete route-cache, routeset, latency-tail, runtime-stall and memory
  findings were separated from unsupported causal claims.
- Bounded integration audit automation, regression tests and CI artifact
  plumbing were added.
- Local `.env.dev.local` permissions were corrected to `0600`.

### ČEKÁ NA SCHVÁLENÍ

- Any production release or deploy of this branch.
- Any routeset recovery probe or provider-approval request.
- Enabling ATC resolution, changing admin auth, changing DB settings/limits,
  or running production SSE/browser load.

### NEOVĚŘENO

- PostgreSQL pool acquisition vs lock wait vs server SQL execution root cause.
- Full provider freshness/connectivity matrix for on-demand integrations.
- ATC production geometry canary and 50/100/250/500-aircraft benchmark.
- Real browser SSE fan-out, reconnect and backpressure with 1/5/20 clients.
- Memory retention/leak proof and causal source of the recent 4.15 s event-loop
  maximum.
- New branch CI, CodeQL, production build and browser gates until GitHub runs.
