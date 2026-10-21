# P04 / P05 / P06 — selective removal gap against R11 (21 Oct 2026)

**Blocking scope finding.** Exact user catalog identifies P04, P05, P06 as REMOVE, but R11 — *display route between airports and its progress* — is KEEP. Earlier review passed because all three share the same route UI and because the full original titles were not available.

## P04 — Route Intelligence – interpretace letového plánu

**Status:** `SHARED_OWNERSHIP_REVIEW`.

analyzePublishedRoute is invoked while rendering retained R11 route geometry.

**Source evidence:** `components/radar/use-route-corridor-intelligence.ts:130-149`, `lib/route-intelligence/index.ts`.

**Remediation:** Separate minimum published route reconstruction needed by R11 from independent rejected predictive/interpretative extras. Do not remove core route geometry.

## P05 — Route Corridor Intelligence – odchylka od plánované trasy

**Status:** `LIVE_DESELECTED_ANALYTICS`.

buildRouteCorridorIntelligence actively computes corridor deviation/status and presents analytic labels. The user selected REMOVE P05 but KEEP R11 route display.

**Source evidence:** `components/radar/use-route-corridor-intelligence.ts:151-161`, `components/aircraft-radar-quick-detail.tsx:222-249`.

**Remediation:** Remove P05 deviation inference and excess status UI, retaining straightforward published route and optional position/progress needed by R11.

## P06 — Trajectory Conformance – odklon, návrat a pravděpodobné DCT

**Status:** `ACTIVE_DESELECTED_RUNTIME`.

buildTrajectoryConformance still computes in the active selected-aircraft hook and is displayed in radar drawer and Follow HUD; feature registry lists Trajectory Conformance as production. P06 is REMOVE.

**Source evidence:** `components/radar/use-route-corridor-intelligence.ts:163-175`, `components/aircraft-radar-quick-detail.tsx:240-248`, `components/radar/radar-flight-follow-hud.tsx:43-77`, `lib/route-intelligence/conformance.ts`, `docs/features.registry.json:185`.

**Remediation:** Disconnect and remove P06 hook computation, consumers, registry entry, now-orphan source and corresponding obsolete tests, preserving R11 route rendering and selected-weather safety displays.

## Required acceptance tests

After targeted implementation, keep R11 published ATS route map, flight plan geometry, and remaining-route display operational. Remove P06 active conformance state-machine computation and product UI; remove independent P05 analytic classification without destroying plain R11 route progress; retain parsed filed-route data needed for R11 but avoid restoring separate P04 analytics. Update generated feature registry and EN/CS docs, retire obsolete conformance tests, introduce negative regression tests. Gate with TypeScript, full Vitest/browser CI, CodeQL and synthetic load 1×/2×/4×. No main/production changes until owner-approved merge.

**Current disposition:** NOT IMPLEMENTED; PR #1096 remains draft and should not be merged simply because previous CI is green. This finding results from accurate user feature semantics, not a CI failure.
