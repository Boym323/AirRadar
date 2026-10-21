# PR #1096 — pre-merge acceptance and rollback runbook (2026-10-21)

**Scope:** `cleanup/selected-features-ui-phase1-20261019` into `main`. Preparation and review only: this runbook authorizes neither a merge nor a production deployment. Merging into `main` can trigger the automated production release and therefore requires explicit owner approval.

## Source-level findings

- User-selected matrix: exactly **88 KEEP** and **90 REMOVE** identifiers, all represented in `docs/audits/SELECTED-FEATURE-KEEP-REMOVE-WITNESSES-2026-10-21.json`.
- Positive witnesses cover 88 KEEP IDs **at family/runtime boundary level**. They establish that relevant entrypoints and shared modules survive, not that each of the 88 individual original feature descriptions is semantically certified.
- The user provided the **exact complete 178-item catalog on 2026-10-21**, now stored verbatim in `docs/audits/SELECTED-FEATURE-CANONICAL-INVENTORY-2026-10-21.json`: **88 KEEP / 90 REMOVE** per the earlier selection. The previous reconstruction differed slightly for P01 and L01; these two labels are corrected. Separate source evidence remains 8 explicitly mapped retired IDs and 82 family-only IDs. Knowing names does **not** certify individual code removal.
- Known overlaps are intentional: retained aircraft detail/history H03/H07/H14 needs components also named in removed H01/H02; R11 retains route and OD/DO context also present in removed H04; R17 retains ATC sector polygons also named in removed T01. Removing these shared dependencies would violate KEEP selection.
- The previous static contract sweep covers 50 deleted Next API routes and 21 deleted pages. `scripts/selected-feature-premerge-audit.mjs` now scans active application/server source strings against the 56 available API route files, plus selected bootstrap and worker lifecycle anchors. AWC upstream `/api/data/*` calls are **not** AirRadar endpoints: they are allowlisted exclusively in the three actual remote provider modules.
- TypeScript/compiler and full browser gates check more than the literal scanner can. Dynamic strings, user state, databases and live ingress still require smoke verification.
- No changed tracked `prisma/migrations/**`, `prisma/schema.prisma`, `deploy/release.sh`, `deploy/recover-previous-build.sh` or `deploy/airradar.service` relative to baseline `bc2f5fc17277f7571b90e358bab3177467e93312`.
- This cleanup must not delete stored ADS-B history, map-context AUP JSON, OGN DDB caches, Web Push subscriptions, Pushover occurrences or existing migrations.

## Merge acceptance gate

1. Verify branch tip against PR #1096 and check `main` has not advanced. If it did, reconcile in a separate commit and rerun everything.
2. Validate the 178 exact user names, existing KEEP/REMOVE decisions, 82 family-only removal proofs and intentional shared dependencies above. Do not claim 178 individually proven implementations. Obtain an explicit risk decision before merging if per-ID source graphs remain unverified.
3. Require successful **CI**, **CodeQL** and **Runtime load scaling benchmarks** at the **same final PR head**. CI must include build/typecheck, Vitest, browser/release validation and performance regression. A past green run on another commit does not count.
4. Execute `node scripts/selected-feature-premerge-audit.mjs` and `npm run features:check`. Every unresolved hardcoded internal API reference is a blocker; the report explicitly distinguishes AWC remote URLs from local Next routes.
5. Confirm receiver/feed freshness, radar SSE, radar map tiles, current ADS-B list, aircraft detail/history/route, ATC/ATS, navigation integrity, airports, current METAR/SIGMET/CHMI, OGN if configured, RXW Hub if enabled, /system sanitized output, saved Web Push subscriptions/Pushover delivery queue.
6. Production T58 baseline (CPU, RSS, event-loop P95/P99 and max, local Beast/readsb staleness, SSE latency and DB/route cache) must be recorded before release and compared with a similarly loaded post-deploy interval. Synthetic 1×/2×/4× is not a live A/B substitute.

## Safe dry-run — production checkout only, read-only

The following commands are **instructions for an approved operator**, not actions executed during this PR audit.

```bash
cd /var/www/airradar
git rev-parse HEAD
sudo ./deploy/release.sh --branch main --dry-run
sudo bash deploy/recover-previous-build.sh
```

`release.sh --dry-run` prints its plan without installing dependencies, migrating schema, restarting the service or switching active build. `recover-previous-build.sh` without flags only inspects the candidate and prints both BUILD_ID values. Do not build in the live production checkout.

## Post-merge controlled deployment

Merge only with owner approval. The existing main CI/deploy path pins a CI-validated build to the release commit, takes build/release locks, performs the checked-in migration workflow, activates isolated `.next` and checks local/public health and static assets. Follow `docs/RELEASE.md`. Verify `/api/version` matches the actual deployed artifact SHA; do not assume it matches this PR head if release metadata commits were created.

Critical regressions: missing aircraft, broken SSE, stale receiver timestamp, failed migration, health outage, missing static assets, persistent >1s event-loop stalls or unexpected memory growth. Capture logs and stop progression immediately.

## Explicit build rollback (only after schema compatibility verification)

The repository has a specific **whole Next runtime** recovery script:
`deploy/recover-previous-build.sh`. Do **not** confuse it with `deploy/rollback-native.sh`, which only disables native Beast parser acceleration.

1. In production, inspect (read-only) `sudo bash deploy/recover-previous-build.sh` and record exact active and previous BUILD_ID strings.
2. Verify that the previous code is schema-compatible with the current DB. This PR changes no migration/schema files, but environment drift or another release may make rollback incompatible.
3. Only after approval, use the previously inspected IDs, for example:

```bash
cd /var/www/airradar
sudo bash deploy/recover-previous-build.sh \
  --apply --acknowledge-schema-compatible \
  --expected-active ACTUAL_ACTIVE_BUILD_ID \
  --expected-previous ACTUAL_PREVIOUS_BUILD_ID
```

The script checks build readiness and version preconditions, holds locks, replaces the active runtime, restarts systemd and verifies local health. It does **not** change Git, SQL schema, rows or tags. Never reset/truncate history tables or delete the archived AUP files as a rollback. After recovery validate both local and public health, static assets, real readsb data, SSE and historical data.

## Decision at writing

Reviewable PR **with explicitly documented limitations**; no merge, database mutation or deployment authorized. Original REMOVE names are restored for all 90; residual proof gap is individual retired implementation call graph for 82 IDs and individual KEEP implementation semantics. Live receiver A/B must follow approved release.
