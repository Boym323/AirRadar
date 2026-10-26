# R-02 — read-only Rust V2 shadow and V1 adapter

Status: **isolated PR only, V1 runtime unchanged**. This work is independent
of R-01 (ATC native geometry). Nothing is deployed, no switch is enabled.
V1 stays the source of truth for the current production radar.

## Existing engine reuse, not a second rewrite

AirRadarV2 already implements a real Rust/Axum aircraft engine on its **own
separate DEV LXC**, with read-only readsb/BEAST ingest and
`GET /api/v1/aircraft`. V1 exposes `GET /api/aircraft?coverage=local`.
The two services may independently sample the same receiver. This stage
does **not** open a new BEAST socket, spawn a service or install anything
on the operator's computer; it consumes the two existing HTTP snapshots.
It does not modify or query either database.

`lib/server/rust-v2-candidate.ts` converts the bounded, verified Rust V2
snapshot into V1's `ProviderSnapshot` by reusing V1 normalization. It is
**deliberately not registered in `createAircraftProvider()`**. It is neither
production-enabled nor used to write V1 history: absent V2 registration,
route, geometry altitude, Comm-B, receiver message counts and advanced
diagnostics cannot be fabricated. Non-ICAO addresses retain their leading
`~`; non-ADS-B provenance is kept distinct. Malformed/stale state fails
closed; stale/unverified positions are omitted.

## Run a one-shot read-only parity comparison

From an environment with access to both existing HTTPS API endpoints:

```bash
node scripts/rust-v2-shadow-compare.mjs \
  'https://<V1-HOST>/api/aircraft' \
  'https://<V2-HOST>/api/v1/aircraft'
```

V1 query is forcibly set to `coverage=local`; V2 accepts no query
parameters. Only HTTPS (or loopback HTTP) is allowed. Fetches have a 5s
deadline, bounded memory (8 MiB/response), no redirects and no credentials
in the URL. Stdout reports only **aggregate counts and distance distributions**;
no callsign, hex, coordinates, URL, user data or raw body. No file writing.

A single call is **not** proof of parity: V1 and V2 sample at different
times, may cover different decoders, and V1's local view may contain fields
V2 lacks. Compare over multiple manual runs at representative load and
assess freshness drift, overlapping identities, positional p95, unmatched
classes and receiver health before proposing actual cutover.

## Acceptance gates before any V1 live-state ownership change

1. GitHub `Rust V2 Candidate Compatibility` CI PASS including malformed,
   stale, and id-provenance tests.
2. V2 Rust DEV sustained read-only ingest and V1 state side by side, matching
   receiver source, with no production DB connection/writes from V2.
3. Define the full V1 required-field coverage and compatibility plan for
   SSE, ATC, alerts, enrichments, history and local statistics.
4. CPU/RSS/event-loop P95/P99/T58 and database I/O A/B with matching
   receiver data; prove cutover has measurable benefit.
5. Explicit operator-authorized canary/rollback and approval before any
   V1 `main` push (V1 main can auto-deploy production).

This PR provides a working test and measurement foundation; it **does not**
claim a complete Rust rewrite or an already measured CPU reduction.

## Živý výsledek 25. 10. 2026 — DF18/DF11 a opravená stale semantika

**Oprava měřicího nástroje:** Rust V2 `stale=true` označuje neaktuální
**polohu**, nikoli neaktuální příjem letadla. Původní shadow implementace
vyřazovala i čerstvě slyšená letadla bez polohy, a tím nadhodnocovala
V1-only rozdíl. `rustV2ToV1Candidate()` teď zachovává čerstvý identifikátor,
ale přiděluje souřadnice jen při validované čerstvé poloze.

- V2 `main` `de282bf5` přidal ověřené DF18 CF0/1, výsledek původního
  srovnání ještě obsahoval chybný filtr `stale`.
- Po opravě filtru V1/Rust bylo V1-only už jen 3/5/5 (většinou DF11 bez
  polohy), nikoli dříve hlášených 10–16.
- V2 `main` `931cdffe` přidal CRC24/PI validovaný a dvojitě potvrzený DF11;
  [DEV nasazení PASS](https://github.com/Boym323/AirRadarV2/actions/runs/40235165530).
- [Opakovaný živý parity test po DF11](https://github.com/Boym323/AirRadar/actions/runs/40234262802):
  V1 39/39/39, Rust 40/40/40, shodných 38/38/38,
  pouze V1 1/1/1 a pouze Rust 2/2/2. Rozdíl P95 polohy
  0,774/1,029/0,250 km; bez outlieru přes 5 km.
- Tyto časově oddělené tři snímky nejsou úplný dlouhodobý soak,
  CPU/RAM benchmark ani schválení provozního přepnutí.

V1 PR #1108 zůstává samostatný **read-only nástroj a nepřipojený kandidátní
adaptér**. Na V1 `main` ani do jeho DB nic nepíše.
