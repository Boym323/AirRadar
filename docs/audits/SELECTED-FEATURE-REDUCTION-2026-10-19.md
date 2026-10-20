# Selected-feature reduction — phase 1 (2026-10-19)

This change is **an incomplete, non-deployable-by-default first phase**, not a claim that every
unselected feature has been removed. The source of truth for the accepted and rejected IDs is
the user's explicit keep/remove selection in the ChatGPT conversation on 2026-10-19.

## Removed in phase 1
- 21 obsolete standalone UI routes: historical browser/Flight Story/Time Machine,
  comparisons, intelligence, operations dashboard, procedures, sector explorer,
  watchlist/alerts/fleet/notifications, their admin-only pages and Digital Twin calibration.
- Topbar, mobile, radar rail and command palette links to those routes.
- Generated feature registry references to the deleted pages; backend APIs have not
  been removed in this phase.

## Preservation requirements and dependency conflicts
- **H07 + H14 + S02/S06/S07/S08/S09** require some PostgreSQL sampled history,
  aggregates and/or Flight rows even without historical UI. No schema/tables/data are deleted.
- **R17** needs minimal published ATC sector geometry even though T01–T07 are rejected.
  Do not delete sector geometry required by the preserved map layer.
- **R11** needs a minimal observed/resolved route display, but the full flight-plan and
  route-intelligence / forecasting stack is rejected.
- **L11 + L12** preserve push/Pushover *delivery transports* but reject the alert rule
  editor and historical event analytics. The remaining trigger/delivery policy needs a
  dedicated follow-up design; do not silently disable or invent notifications.
- **W01/W02/W03/W04/W06/W07/W08/W09** remain; wind/Weather Fusion,
  time-machine archives, route and corridor products are rejected.
- **T08/T09/T10** keep ATS and NAVAID/FIX datasets independently of the discarded
  flight-plan prediction stack.
- **E07/E09** retain RXW metadata and FlightAware integration without the rejected
  H1/FPN waypoint overlay or full detail-flight-plan UI.
- **J09** persists sampled history; permanent deletion of database rows or migration
  rollback is explicitly forbidden.

## Validation gate and next steps
1. Run feature registry generation check, typecheck, lint, full Vitest, build, and
   browser smoke. Update stale snapshot/link tests before merging.
2. Inspect server search results for removed /flights and /airspace/sectors links.
   Remove the obsolete result families rather than redirecting misleadingly.
3. Remove each rejected backend lane only after an import/call graph and contract
   review, then prune orphan UI modules, scripts, configuration, localization
   and tests. Keep shared helpers used by retained features.
4. No production deployment until all checks are green and remaining external
   API consumers have been inventoried. Verify release identity and production
   health following deploy. Never run destructive database migrations.

## Phase 2 (staged): remove the live H1/FPN radar overlay

The retained E07 RXW Hub metadata integration is unchanged. The rejected E08 live H1/FPN map functionality no longer registers FPN MapLibre layers or makes 60-second availability and 30-second selected-aircraft waypoint polling requests. Tests ensure the live radar has no FPN imports, layers or client requests. Existing optional RXW API/parser and the historical archive reader remain temporarily intact until independent dependency and persistence review; this is **not** a claim that E08 is completely removed. No database migration or production deploy is performed by this PR.

The aircraft detail RXW metadata panel no longer renders H1/FPN waypoint lists. The sanitized RXW communications and reported structured route hint (E07) remain accessible. Parsing and historical compatibility continue pending the server-side E08 retirement phase.
