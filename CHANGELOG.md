# Changelog

All notable changes to AirRadar are documented here.

## Unreleased

### Added

- Add Explainable Prediction V1 `Why?/Proč?` panels for readiness-gated ETA, runway, runway-change and trajectory advisories using whitelisted canonical prediction evidence.
- Add Receiver Explorer V2 on `/receiver/coverage` with directional median/P95/max range polar analytics, altitude-band reach, bounded 7/30-day trends, weak-sector health, live ADS-B/MLAT source mix, directional records, and the existing network-reference capture polar without a new ingest or persistence lane.
- Add Live Airport Network V1 to `/airports`, prioritizing browser-local favorite airports and live-route-active airports with canonical Airport Operations, receiver-only approach queue, likely runway, bounded next-arrival estimates, and direct Live Board navigation.
- Add Event Replay V1: replayable Flight Intelligence events can open Time Machine in a bounded ±10-minute window with the matching aircraft preselected when historical data is available.
- Add Daily Aviation Story V1 to `/recap/daily`: busiest-airport ranking, unusual-turn/orbit counts, and bounded quality-controlled aircraft-weather highlights on top of existing receiver, Flight Intelligence, alert, rare-aircraft, and reception-record data.
- Add Prediction Timeline V1 to aircraft detail, reusing the existing Operational Twin situation response to show NOW plus chronological waypoint, ATC, airspace, SIGMET and readiness-gated public prediction events with preserved source, provenance and confidence.
- Add Operations Dashboard V1 at `/operations`, reusing canonical live traffic, Airport Operations, Regional Attention, readiness-gated public ETA with an inferred terminal-demand fallback, and Flight Intelligence without adding a parallel intelligence engine.
- Extend Flight Intelligence with explicit initial-climb, cruise-entry, and
  destination-independent top-of-descent timeline events, detector versioning,
  and canonical Airport Operations parity for linked go-around/holding events.

## [1.0.341] - 2026-10-07

Changes since v1.0.340.

**Features touched:** Mobile / PWA mode, Mobile Spotter Mode, Time Machine, Watchlist, Alerts & Fleet.

### Added

- Add dry-run rule simulator (8da6c4e7)
- Expose rule simulator API (6e457073)
- Add rule simulator UI (955d4a12)
- Add rule simulator route (3903a230)
- Support server-side history query filters (746299ff)
- Expose bounded notification query parameters (c9f944a3)
- Query notification history server-side (18804b07)
- Localize paginated query controls (564adc50)
- Localize paginated query controls (5ea5a5b0)
- Compute bounded effectiveness analytics (9f14a879)
- Expose effectiveness analytics API (b2599cbf)
- Add effectiveness analytics UI (c0767f76)
- Add effectiveness analytics route (56933770)
- Add browser observer geometry (217bdb83)
- Add private my-location mode (a1db8ee2)
- Predict bounded closest approach (3841e79d)
- Add closest-approach copy (84675feb)
- Add closest-approach copy (18fb07c2)
- Surface upcoming closest approaches (429ca782)
- Derive recent overhead passes from Time Machine (162e6cbb)
- Add overhead history copy (be7c7722)
- Add overhead history copy (28602943)
- Add private recent overhead history (52cf3ce9)
- Add explainable interest scoring (5970b236)
- Add spotter interest copy (3990d924)
- Add spotter interest copy (acb0d34e)
- Add explainable look-up recommendations (2e564896)
- Add local alert policy (074fd0d4)
- Add spotter alert copy (ba317d17)
- Add spotter alert copy (a1f286e1)
- Add private local PWA alerts (f3e551f2)
- Add sky finder direction math (0b270ef4)
- Add sky finder copy (d46511d9)
- Add sky finder copy (4e582c00)
- Add sensor-assisted sky finder (4eed4252)

### Changed

- Centralize spotter copy (4c742a10)
- Centralize spotter copy (66d9160f)
- Use shared i18n dictionary (23df3312)

### Fixed

- Gate query pagination on loaded data (84a1361d)
- Repair simulator registry JSON (ca6022d9)
- Repair analytics registry JSON (821a7adb)
- Keep alert tag stable per aircraft pass (8dfac1d5)
- Restore live stream import (8320851a)
- Restore live stream import (3639dfea)
- Restore live stream import (9d2ff4c1)
- Restore live stream import (07914b5f)
- Restore live stream import (b97392c7)
- Restore live stream import (5bc85707)

### Documentation

- Register rule simulator (eb60f76d)
- Describe rule simulator (b5c1b4ee)
- Localize rule simulator (054866c0)
- Register notification query API (ff8892d2)
- Describe notification query API (2dc83969)
- Localize notification query API (902fe67c)
- Register alert analytics (babe4060)
- Describe alert analytics (030d36f7)
- Localize alert analytics (894b40ca)
- Register My Sky capabilities (24139668)
- Document My Sky capabilities (653e525a)
- Document My Sky capabilities (715213dd)

### Maintenance

- Cover rule simulator input (475777e3)
- Cover server-side query filters (5c99ef10)
- Cover effectiveness analytics (c52bdea3)
- Sync generated repository metadata (#508) (669e59b1)
- Support my-location controls (e8a1149a)
- Cover private observer mode (c285799d)
- Add observer geometry coverage (4a9dab02)
- Add closest-approach list (9b02e39c)
- Cover closest-approach prediction (fec3174e)
- Cover recent observer passes (764098fa)
- Add interest cards (41355e22)
- Cover explainable interest scoring (c120e402)
- Add local alert controls (ad5776fa)
- Cover local alert policy (36d1b861)
- Add sky finder compass (9efb7c11)
- Cover sky finder direction math (2c8db508)
- Match deterministic interest ordering (f0161955)
- Match deterministic interest ordering (2b5aa96e)
- Match deterministic interest ordering (6a6596f9)
- Follow query builder contract (db5ed87b)

<details>
<summary>Technical commits</summary>

- feat(alerts): add dry-run rule simulator (8da6c4e7)
- feat(alerts): expose rule simulator API (6e457073)
- feat(alerts): add rule simulator UI (955d4a12)
- feat(alerts): add rule simulator route (3903a230)
- test(alerts): cover rule simulator input (475777e3)
- docs(features): register rule simulator (eb60f76d)
- docs(features): describe rule simulator (b5c1b4ee)
- docs(features): localize rule simulator (054866c0)
- feat(notifications): support server-side history query filters (746299ff)
- feat(notifications): expose bounded notification query parameters (c9f944a3)
- feat(notifications): query notification history server-side (18804b07)
- feat(notifications): localize paginated query controls (564adc50)
- feat(notifications): localize paginated query controls (5ea5a5b0)
- fix(notifications): gate query pagination on loaded data (84a1361d)
- test(notifications): cover server-side query filters (5c99ef10)
- docs(features): register notification query API (ff8892d2)
- docs(features): describe notification query API (2dc83969)
- docs(features): localize notification query API (902fe67c)
- feat(alerts): compute bounded effectiveness analytics (9f14a879)
- feat(alerts): expose effectiveness analytics API (b2599cbf)
- feat(alerts): add effectiveness analytics UI (c0767f76)
- feat(alerts): add effectiveness analytics route (56933770)
- test(alerts): cover effectiveness analytics (c52bdea3)
- docs(features): register alert analytics (babe4060)
- docs(features): describe alert analytics (030d36f7)
- docs(features): localize alert analytics (894b40ca)
- fix(features): repair simulator registry JSON (ca6022d9)
- fix(features): repair analytics registry JSON (821a7adb)
- merge(main): preserve delivery health docs with simulator (cef9d8c0)
- merge(main): preserve delivery health docs with simulator (e933af62)
- merge(main): preserve delivery health docs with simulator (06a6120f)
- Merge main into feat/alert-rule-simulator-v1 (d453c634)
- merge(main): preserve delivery health docs with notification query (8d77f28b)
- merge(main): preserve delivery health docs with analytics (641663fe)
- merge(main): preserve delivery health docs with notification query (1c47645f)
- merge(main): preserve delivery health docs with analytics (d7ce4b91)
- merge(main): preserve delivery health docs with notification query (245440c0)
- merge(main): preserve delivery health docs with analytics (83c32513)
- Merge main into feat/notification-query-api-v1 (5b768e9c)
- Merge main into feat/alert-effectiveness-analytics-v1 (49183388)
- Merge pull request #505 from Boym323/feat/alert-rule-simulator-v1 (7369ac22)
- merge(main): preserve AS and AT docs with notification query (42d1f388)
- merge(main): preserve AS and AT docs with notification query (ec5f5062)
- merge(main): preserve AS and AT docs with notification query (b66ff4df)
- Merge main into feat/notification-query-api-v1 (88481687)
- Merge pull request #506 from Boym323/feat/notification-query-api-v1 (1e1ada18)
- merge(main): preserve AS AT AU docs with analytics (4e266b6e)
- merge(main): preserve AS AT AU docs with analytics (52f2e4b0)
- merge(main): preserve AS AT AU docs with analytics (57c28afd)
- Merge main into feat/alert-effectiveness-analytics-v1 (eb5b7505)
- Merge pull request #507 from Boym323/feat/alert-effectiveness-analytics-v1 (4c5020ca)
- chore(metadata): sync generated repository metadata (#508) (669e59b1)
- feat(spotter): add browser observer geometry (217bdb83)
- feat(spotter): add private my-location mode (a1db8ee2)
- style(spotter): support my-location controls (e8a1149a)
- test(spotter): cover private observer mode (c285799d)
- test(spotter): add observer geometry coverage (4a9dab02)
- refactor(i18n): centralize spotter copy (4c742a10)
- refactor(i18n): centralize spotter copy (66d9160f)
- refactor(spotter): use shared i18n dictionary (23df3312)
- feat(spotter): predict bounded closest approach (3841e79d)
- feat(i18n): add closest-approach copy (84675feb)
- feat(i18n): add closest-approach copy (18fb07c2)
- feat(spotter): surface upcoming closest approaches (429ca782)
- style(spotter): add closest-approach list (9b02e39c)
- test(spotter): cover closest-approach prediction (fec3174e)
- feat(spotter): derive recent overhead passes from Time Machine (162e6cbb)
- feat(i18n): add overhead history copy (be7c7722)
- feat(i18n): add overhead history copy (28602943)
- feat(spotter): add private recent overhead history (52cf3ce9)
- test(spotter): cover recent observer passes (764098fa)
- feat(spotter): add explainable interest scoring (5970b236)
- feat(i18n): add spotter interest copy (3990d924)
- feat(i18n): add spotter interest copy (acb0d34e)
- feat(spotter): add explainable look-up recommendations (2e564896)
- style(spotter): add interest cards (41355e22)
- test(spotter): cover explainable interest scoring (c120e402)
- feat(spotter): add local alert policy (074fd0d4)
- feat(i18n): add spotter alert copy (ba317d17)
- feat(i18n): add spotter alert copy (a1f286e1)
- fix(spotter): keep alert tag stable per aircraft pass (8dfac1d5)
- feat(spotter): add private local PWA alerts (f3e551f2)
- style(spotter): add local alert controls (ad5776fa)
- test(spotter): cover local alert policy (36d1b861)
- feat(spotter): add sky finder direction math (0b270ef4)
- feat(i18n): add sky finder copy (d46511d9)
- feat(i18n): add sky finder copy (4e582c00)
- feat(spotter): add sensor-assisted sky finder (4eed4252)
- style(spotter): add sky finder compass (9efb7c11)
- test(spotter): cover sky finder direction math (2c8db508)
- fix(spotter): restore live stream import (8320851a)
- fix(spotter): restore live stream import (3639dfea)
- fix(spotter): restore live stream import (9d2ff4c1)
- fix(spotter): restore live stream import (07914b5f)
- fix(spotter): restore live stream import (b97392c7)
- fix(spotter): restore live stream import (5bc85707)
- docs(spotter): register My Sky capabilities (24139668)
- docs(spotter): document My Sky capabilities (653e525a)
- docs(cs): document My Sky capabilities (715213dd)
- Merge pull request #509 from Boym323/feat/spotter-my-sky-v1 (1356a224)
- test(spotter): match deterministic interest ordering (f0161955)
- test(spotter): match deterministic interest ordering (2b5aa96e)
- test(spotter): match deterministic interest ordering (6a6596f9)
- Merge pull request #510 from Boym323/feat/spotter-closest-approach-v1 (015c8796)
- Merge pull request #511 from Boym323/feat/spotter-overhead-history-v1 (3720040e)
- Merge pull request #512 from Boym323/feat/spotter-interest-v1 (8854d9d8)
- Merge pull request #513 from Boym323/feat/spotter-alerts-v1 (603b99fb)
- Merge pull request #514 from Boym323/feat/spotter-sky-finder-v1 (c4c805a3)
- test(notifications): follow query builder contract (db5ed87b)
- Merge pull request #515 from Boym323/fix/notification-center-query-regression (ebd5726d)

</details>

## [1.0.340] - 2026-10-07

Changes since v1.0.339.

**Features touched:** Watchlist, Alerts & Fleet.

### Added

- Expose durable delivery health (ebd3b433)
- Summarize durable delivery queue (bcdb9e38)
- Track web push delivery health (7378b666)
- Track legacy pushover health (05af1414)
- Aggregate delivery health (f548eaf1)
- Add delivery health dashboard (420e7ebb)
- Expose delivery health API (caedfd9e)
- Add delivery health route (ff748083)
- Start durable delivery worker (3a0eb90e)
- Stop delivery worker gracefully (a08d63f9)

### Documentation

- Register delivery health (e46d044e)
- Describe delivery health (76c2f407)
- Localize delivery health (0548600d)

### Maintenance

- Sync generated repository metadata (#503) (6c517b21)
- Cover delivery worker startup (eb571b6c)
- Cover delivery health lifecycle (22a00347)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#503) (6c517b21)
- feat(alerts): expose durable delivery health (ebd3b433)
- feat(alerts): summarize durable delivery queue (bcdb9e38)
- feat(alerts): track web push delivery health (7378b666)
- feat(alerts): track legacy pushover health (05af1414)
- feat(alerts): aggregate delivery health (f548eaf1)
- feat(alerts): add delivery health dashboard (420e7ebb)
- feat(alerts): expose delivery health API (caedfd9e)
- feat(alerts): add delivery health route (ff748083)
- feat(alerts): start durable delivery worker (3a0eb90e)
- feat(alerts): stop delivery worker gracefully (a08d63f9)
- test(alerts): cover delivery worker startup (eb571b6c)
- docs(features): register delivery health (e46d044e)
- docs(features): describe delivery health (76c2f407)
- docs(features): localize delivery health (0548600d)
- test(alerts): cover delivery health lifecycle (22a00347)
- Merge pull request #504 from Boym323/feat/delivery-health-v1 (6e422ca4)

</details>

## [1.0.339] - 2026-10-07

Changes since v1.0.338.

**Features touched:** Watchlist, Alerts & Fleet.

### Added

- Define persistent center state (5551081d)
- Persist unread and delivery mutes (a4942120)
- Expose persistent center state (5847695d)
- Distinguish center-only delivery state (15234457)
- Apply aircraft and rule delivery mutes (a53951df)
- Add V2 filters search and rationale (10b461b3)
- Localize center V2 controls (f96a12e0)
- Localize center V2 controls (37f46d20)
- Build Notification Center V2 (540402e8)
- Style Center V2 controls (470fd0ef)

### Changed

- Inject delivery mute policy (f78efd35)

### Fixed

- Preserve center-only group status (fa04998b)
- Localize center-only history status (ffcb2788)
- Localize center-only history status (90b7b8c9)

### Documentation

- Register Notification Center V2 (1a20c525)
- Describe Notification Center V2 (a361bf77)
- Localize Notification Center V2 (683d9dc4)

### Maintenance

- Sync generated repository metadata (#500) (54462367)
- Expect explicit center-only status (dd3ca26b)
- Expect explicit center-only status (cef0d963)
- Expect explicit center-only status (92095f19)
- Expect explicit center-only status (f8594144)
- Keep muted alerts center-only (09731d68)
- Cover Center V2 state filters and mutes (9839fe1c)
- Cover Center V2 boundaries (0d8aadcf)
- Sync generated repository metadata (#502) (2fe6b722)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#500) (54462367)
- feat(notifications): define persistent center state (5551081d)
- feat(notifications): persist unread and delivery mutes (a4942120)
- feat(notifications): expose persistent center state (5847695d)
- feat(notifications): distinguish center-only delivery state (15234457)
- feat(notifications): apply aircraft and rule delivery mutes (a53951df)
- feat(notifications): add V2 filters search and rationale (10b461b3)
- feat(notifications): localize center V2 controls (f96a12e0)
- feat(notifications): localize center V2 controls (37f46d20)
- feat(notifications): build Notification Center V2 (540402e8)
- feat(notifications): style Center V2 controls (470fd0ef)
- test(notifications): expect explicit center-only status (dd3ca26b)
- test(notifications): expect explicit center-only status (cef0d963)
- test(notifications): expect explicit center-only status (92095f19)
- test(notifications): expect explicit center-only status (f8594144)
- testability(notifications): inject delivery mute policy (f78efd35)
- test(notifications): keep muted alerts center-only (09731d68)
- test(notifications): cover Center V2 state filters and mutes (9839fe1c)
- fix(notifications): preserve center-only group status (fa04998b)
- docs(features): register Notification Center V2 (1a20c525)
- docs(features): describe Notification Center V2 (a361bf77)
- docs(features): localize Notification Center V2 (683d9dc4)
- test(notifications): cover Center V2 boundaries (0d8aadcf)
- fix(notifications): localize center-only history status (ffcb2788)
- fix(notifications): localize center-only history status (90b7b8c9)
- chore(metadata): sync generated repository metadata (#502) (2fe6b722)
- Merge main into feat/notification-center-v2 (f99bea0b)
- Merge pull request #501 from Boym323/feat/notification-center-v2 (ba1558a4)

</details>

## [1.0.338] - 2026-10-07

Changes since v1.0.337.

### Added

- Group aircraft event timelines (74a5ca23)
- Localize grouped timelines (4b900e97)
- Localize grouped timelines (895ce6b4)
- Render grouped aircraft timelines (13e5a028)
- Style grouped event timeline (08668563)

### Fixed

- Advance semantic dedup anchor (decc7249)
- Preserve durable intelligence priority (b2fa8383)
- Pluralize grouped event count (41fd8306)

### Documentation

- Register notification grouping (5139955a)
- Describe notification grouping (c6b2a719)
- Localize notification grouping (a6a36d6c)

### Maintenance

- Cover dedup and timeline grouping (b4ae7c2c)

<details>
<summary>Technical commits</summary>

- feat(notifications): group aircraft event timelines (74a5ca23)
- fix(notifications): advance semantic dedup anchor (decc7249)
- feat(notifications): localize grouped timelines (4b900e97)
- feat(notifications): localize grouped timelines (895ce6b4)
- feat(notifications): render grouped aircraft timelines (13e5a028)
- feat(notifications): style grouped event timeline (08668563)
- test(notifications): cover dedup and timeline grouping (b4ae7c2c)
- docs(features): register notification grouping (5139955a)
- docs(features): describe notification grouping (c6b2a719)
- docs(features): localize notification grouping (a6a36d6c)
- fix(notifications): preserve durable intelligence priority (b2fa8383)
- fix(notifications): pluralize grouped event count (41fd8306)
- Merge pull request #499 from Boym323/feat/notification-dedup-grouping-v1 (965303d4)

</details>

## [1.0.337] - 2026-10-07

Changes since v1.0.336.

### Added

- Define preference policy (54e1659f)
- Persist notification preferences (4d3f6c2e)
- Enforce category delivery preferences (3381eaf1)
- Expose authenticated preference controls (03970546)
- Localize preference controls (2a3496af)
- Localize preference controls (4c840a0c)
- Add preference controls to center (8b546f03)
- Style preference controls (c0486bbe)
- Expose preference-aligned categories (9d886008)

### Fixed

- Keep preference parsing type-safe (260907f4)
- Apply preferences to fallback alert types (8e12606f)

### Documentation

- Register notification preferences (8a826734)
- Describe notification preferences (78f6c38c)
- Localize notification preferences (4438476f)

### Maintenance

- Cover preference policy (f0bdae8d)
- Cover push opt-in and off policy (0561879c)
- Cover preference UI boundaries (a1424087)
- Cover durable preference persistence (ab408882)
- Sync generated repository metadata (#497) (39f76689)

<details>
<summary>Technical commits</summary>

- feat(notifications): define preference policy (54e1659f)
- feat(notifications): persist notification preferences (4d3f6c2e)
- feat(notifications): enforce category delivery preferences (3381eaf1)
- feat(notifications): expose authenticated preference controls (03970546)
- feat(notifications): localize preference controls (2a3496af)
- feat(notifications): localize preference controls (4c840a0c)
- feat(notifications): add preference controls to center (8b546f03)
- feat(notifications): style preference controls (c0486bbe)
- feat(notifications): expose preference-aligned categories (9d886008)
- test(notifications): cover preference policy (f0bdae8d)
- test(notifications): cover push opt-in and off policy (0561879c)
- test(notifications): cover preference UI boundaries (a1424087)
- fix(notifications): keep preference parsing type-safe (260907f4)
- fix(notifications): apply preferences to fallback alert types (8e12606f)
- test(notifications): cover durable preference persistence (ab408882)
- docs(features): register notification preferences (8a826734)
- docs(features): describe notification preferences (78f6c38c)
- docs(features): localize notification preferences (4438476f)
- chore(metadata): sync generated repository metadata (#497) (39f76689)
- Merge pull request #498 from Boym323/feat/notification-preferences-v1 (5a92a3a4)

</details>

## [1.0.336] - 2026-10-07

Changes since v1.0.335.

**Features touched:** Watchlist, Alerts & Fleet.

### Added

- Keep noisy informational events center-only (6735095d)

### Maintenance

- Sync generated repository metadata (#495) (66c843bd)
- Guard center-only noise policy (573aa20d)
- Update reception record delivery expectation (5b5bca28)
- Preserve durable first-seen dedup coverage (e0290833)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#495) (66c843bd)
- feat(alerts): keep noisy informational events center-only (6735095d)
- test(alerts): guard center-only noise policy (573aa20d)
- test(alerts): update reception record delivery expectation (5b5bca28)
- test(alerts): preserve durable first-seen dedup coverage (e0290833)
- Merge pull request #496 from Boym323/feat/notification-noise-control-v1 (15411d9f)

</details>

## [1.0.335] - 2026-10-07

Changes since v1.0.334.

**Features touched:** Navigation Integrity.

### Fixed

- Tolerate bounded navigation integrity rate limits (07cc2f06)

### Maintenance

- Sync generated repository metadata (#493) (ef450339)
- Trigger production deploy (1446a096)
- Cover navigation integrity 429 handling (c18b7a3a)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#493) (ef450339)
- chore: trigger production deploy (1446a096)
- fix(gates): tolerate bounded navigation integrity rate limits (07cc2f06)
- test(gates): cover navigation integrity 429 handling (c18b7a3a)
- Merge pull request #494 from Boym323/fix/production-gate-navigation-rate-limit (40a913c8)

</details>

## [1.0.334] - 2026-10-07

Changes since v1.0.333.

**Features touched:** Aircraft Discovery, Airport Intelligence, ATC & ATS Intelligence, Explainable Prediction, Flight Intelligence, Investigation Links, Live Airport Network, Live Radar, Mobile Spotter Mode, Navigation Integrity, Operational Digital Twin, Receiver Coverage, Route Network Explorer, Saved Workspaces, Statistics & Recaps, System Observability, Time Machine, Watchlist, Alerts & Fleet.

### Added

- Add prediction timeline v1 (ef13865d)
- Localize prediction timeline (2a0425c9)
- Localize prediction timeline in English (3050273b)
- Add directional range polar (69f330c1)
- Add event replay link contract (74fdf966)
- Allow bounded event replay windows (df8e42cb)
- Expose bounded event replay window mode (a8e69073)
- Build Receiver Explorer V2 (1239e734)
- Open event replay in Time Machine (39724048)
- Extend daily aviation story contract (f73e3936)
- Compose airport and weather daily highlights (03ac6f83)
- Link replayable intelligence events to Time Machine (f3173239)
- Support bounded 30-day trend (015323cd)
- Expose selected range trend (fb4e447a)
- Localize event replay in Czech (5e1ade46)
- Expose daily weather source status (a1666a8d)
- Localize event replay in English (e21034b9)
- Carry bounded weather status into daily story (835ca793)
- Source daily airport and weather story evidence (70f9f386)
- Present daily aviation story highlights (dc19b4b1)
- Localize daily aviation story (ee01af1a)
- Localize daily aviation story in English (e70b78c5)
- Restore Live Airport Network V1 after rebase (42902224)
- Restore Live Airport Network V1 after rebase (11be3d45)
- Restore Live Airport Network V1 after rebase (3bd743e1)
- Reapply Live Airport Network V1 integration (07a4c400)
- Reapply Live Airport Network V1 integration (753629b1)
- Reapply Czech Live Airport Network localization (985d1e08)
- Reapply English Live Airport Network localization (4780ab67)
- Add route network explorer route (b66f6730)
- Add Route Network Explorer V1 (7b32ad60)
- Expose route network explorer in navigation (315e27a4)
- Add aircraft discovery route (6fae9ece)
- Add Aircraft Discovery V1 (f56ec1bf)
- Expose aircraft discovery in navigation (c2d7d09e)
- Add Watchlist Intelligence V2 (96e92fb7)
- Integrate Watchlist Intelligence V2 (d21c00d7)
- Add prediction evidence explainability contract (4246e0b5)
- Export prediction explainability contract (f4a2e0d8)
- Expose gated ETA explainability evidence (296955bf)
- Expose gated runway explainability evidence (180c5d5d)
- Expose gated runway-change explainability evidence (ef44387e)
- Expose gated trajectory explainability evidence (5df36db2)
- Show explainable predictive advisory evidence (5acf0e75)
- Add Radar Presets V1 (#450) (c6575da1)
- Add Route Network Explorer V1 (#451) (0b051448)
- Add static asset checks and normalize standalone server configuration (c189e8d8)
- Add admin runtime timeline (205800d8)
- Mount runtime timeline for admin detail (6f00d82e)
- Add Weather Operations Center V1 (#458) (129ebdf3)
- Add ATC & Airspace Explorer V1 (#457) (76a3f187)
- Add Route Network Detail V2 (#460) (928e8fab)
- Add Flight Compare V1 (#461) (3ba9f4cc)
- Add navigation integrity center page (fd814b77)
- Implement navigation integrity center (c85abe30)
- Add airport compare page (5b5c87ba)
- Implement airport compare (48f4386d)
- Expand global command palette (8177c3d8)
- Surface movement analytics on airport detail (1cfa1f76)
- Add airport movement analytics (2fc21704)
- Add historical traffic heatmap page (c6a40254)
- Promote historical traffic heatmap product (197cffc3)
- Add heatmap product copy (6b44dcbf)
- Add browser-local workspace model (d9bbf796)
- Add saved workspace UI (719948ef)
- Add workspaces route (e5e330d4)
- Add context replay v3 copy (253e09b5)
- Add context replay v3 copy (5057c710)
- Add historical context availability and event navigation (ff0b84c1)
- Expose workspaces in More navigation (6e2796cb)
- Add safe deep-link query helpers (5caf7a58)
- Deep-link navigation integrity filters (dba74996)
- Deep-link airspace state (774908bd)
- Restore flight compare from URL state (d5095c51)
- Restore airport compare from URL state (fe7971b1)
- Add read-only feed helpers (c59e67b8)
- Add notification center UI (04f5d50d)
- Add notifications route (925c9071)
- Expose notification center in More navigation (4aacd05b)
- Add Airport Compare command now available on main (b189a49a)
- Add Mobile Spotter Mode V1 (#484) (adb9f277)
- Add reference explorer route (0275bccd)
- Add reference explorer (4b6a3971)
- Expose reference explorer (e14140bc)
- Restore app/procedures/page.tsx (88b0db6c)
- Restore components/procedure-explorer.tsx (1b2ec61b)
- Restore components/procedure-explorer.module.css (08c9a47b)
- Restore tests/procedure-explorer-v1-boundary.test.ts (f0b25b06)
- Restore components/airradar-shell.tsx (26c29e99)
- Restore docs/features.registry.json (d5e7c65e)
- Restore app/airspace/sectors/[id]/page.tsx (dfcb1cd0)
- Restore components/atc-sector-detail.tsx (78a082c3)
- Restore components/atc-sector-detail.module.css (ead3d793)
- Restore tests/atc-sector-detail-v1-boundary.test.ts (f0ced3b6)
- Restore components/atc-airspace-explorer.tsx (33acd95b)
- Restore components/atc-airspace-explorer.module.css (af01ad8c)
- Restore app/api/intelligence/analytics/route.ts (fe397b23)
- Restore app/intelligence/analytics/page.tsx (96c84b24)
- Restore components/flight-intelligence-analytics.module.css (364d517e)
- Restore components/flight-intelligence-analytics.tsx (6c80012e)
- Restore lib/intelligence-analytics.ts (2d1dced1)
- Restore lib/server/flight-intelligence-analytics.ts (9e7c198a)
- Restore tests/flight-intelligence-analytics-v1-boundary.test.ts (6d56243a)
- Link analytics from event timeline (40254b26)
- Restore components/atc-sector-detail.tsx (4ed3f91a)
- Restore components/navigation-reference-explorer.tsx (4a71bae8)
- Restore components/procedure-explorer.tsx (0e1b6786)
- Restore lib/investigation-links.ts (83c5a7b8)
- Restore docs/FEATURES.md (dbf2f861)
- Restore docs/cs/FEATURES.md (bd4028e3)

### Changed

- Surface prediction timeline before twin detail (5b318485)
- Sync Reception Records Center V1 with main (b24be1e3)
- Sync Aircraft Type Explorer V1 with main (6d5a1f75)
- Sync Airline & Operator Explorer V1 with main (60291c2e)
- Sync Traffic Rhythm Analytics V1 with main (2bf5bc14)
- Sync Traffic Geography V1 with main (d8e030f4)
- Stack operator explorer on aircraft type explorer (5cdaa6d6)
- Stack traffic rhythm analytics on operator explorer (68a1a58f)
- Stack traffic geography on traffic rhythm (efad9c98)
- Stack investigation links on traffic geography (4f96513b)
- Stack saved workspaces on investigation links (52ebab28)
- Stack notification center on saved workspaces (bdacb018)

### Fixed

- Merge metadata PRs after required checks (#435) (b4665d06)
- Publish metadata validation status (#437) (303ede44)
- Skip duplicate metadata pull request validation (#438) (0b9fc616)
- Render event replay action (ae5f3c8b)
- Handle sparse trend days (893c2a2b)
- Validate and preserve event replay target (0123c77c)
- Bound single-day trend window (2f197d8b)
- Preserve replay target when selecting events (94056d2d)
- Parameterize bounded Time Machine replay window (0ce0ab5c)
- Scope daily story event grid styling (4fba9618)
- Clean event replay route syntax (5f776d57)
- Refresh replay window callback when mode changes (dba4d45f)
- Remove escaped newline from Time Machine server (5f952f79)
- Remove escaped newline from replay route (b9ee6f43)
- Define event replay window constants (9515cd33)
- Repair trend source formatting (26855356)
- Sync Czech Event Replay registry rows (1ad762fc)
- Reject malformed daily weather highlights (e75d2668)
- Normalize trend source lines (bc20df4e)
- Keep weather availability fail-soft in daily story (6ef1e31e)
- Pin automated releases to validated commit (#444) (2ad6e93b)
- Complete daily recap smoke fixture (#445) (273815e7)
- Retry visual smoke navigation after paint race (#446) (6a01484d)
- Retry secondary route smoke navigation (#447) (f3de3b56)
- Support offline local deployments (#448) (f3969841)
- Track receiver explorer route root (f19e1b52)
- Track receiver explorer route root (#449) (51647bcd)
- Keep explainability type import valid (7052bcaa)
- Type aircraft discovery watchlist link (7e723003)
- Keep predictive advisory DTO backward compatible (2d2b29a9)
- Keep predictive advisory DTO backward compatible (e4479448)
- Keep predictive advisory DTO backward compatible (2c6fc252)
- Keep predictive advisory DTO backward compatible (717718b6)
- Keep narrow desktop controls within overlay (0d3e06f2)
- Publish standalone build metadata (821e36d4)
- Tolerate metadata version race for validated artifacts (0be2590f)
- Type route detail link (1211a995)
- Preserve operations recent action (99a9aa39)
- Type airport compare detail links (d0d5f7a6)
- Type canonical workspace links (8887380d)
- Keep test state typed (fef028db)
- Allow existing aircraft and ATC palette icons (93acaaa6)
- Use semantic colors in replay availability (c87987c4)
- Improve navigation handling in assertBrowserSmoke function (1eac2737)
- Keep React type import explicit (33cfaee1)
- Satisfy typed routes and compiler lint (8092f19d)
- Update URL pattern in assertBrowserSmoke function for improved navigation (8a91a2ab)
- Use typed-safe airport link (b44abfc1)
- Align analytics SQL runtime typing (54c7b11c)
- Prune stale production tags before version resolution (bae1d2b4)
- Synchronize production tag namespace before deploy (da8a21ca)
- Let privileged release script own tag synchronization (c73e2edc)
- Trust validated artifact version (76440a54)
- Verify deployed artifact version (147f3d79)

### Documentation

- Register prediction timeline v1 (4528db41)
- Document prediction timeline v1 (64392b96)
- Localize prediction timeline v1 (c00ad427)
- Describe prediction timeline boundaries (69e26f5e)
- Add prediction timeline changelog (fa8b68ed)
- Register event replay v1 (16938900)
- Document event replay v1 (9b88b291)
- Localize event replay v1 (6b4c5db3)
- Add event replay changelog (cc135fee)
- Add Explorer V2 changelog (ee44539d)
- Document Explorer V2 (ca1ae360)
- Localize Explorer V2 (1a6f532f)
- Register daily aviation story coverage (ff4a1797)
- Describe daily aviation story (950e6262)
- Localize daily aviation story (6df2a657)
- Add daily aviation story changelog (5054b587)
- Add Explorer V2 changelog (e633c963)
- Normalize Explorer V2 changelog (fbc3cb3b)
- Preserve changelog formatting (2248fd0b)
- Localize prediction timeline operational twin section (b1505ccc)
- Rebase Live Airport Network registry (6d3bd2d3)
- Rebase Live Airport Network docs (226f5050)
- Rebase Czech Live Airport Network docs (962e704c)
- Rebase Live Airport Network changelog (4b8885b0)
- Register route network explorer v1 (1dadad53)
- Document route network explorer v1 (ef189f0b)
- Localize route network explorer v1 (bb2ec433)
- Add route network explorer changelog (72e3b654)
- Register aircraft discovery v1 (1ad60046)
- Document aircraft discovery v1 (95b0cd6a)
- Localize aircraft discovery v1 (6c96c8a6)
- Add aircraft discovery changelog (2edcba86)
- Register Watchlist Intelligence V2 (c75f0334)
- Document Watchlist Intelligence V2 (009f2afa)
- Localize Watchlist Intelligence V2 (f4c864e0)
- Add Watchlist Intelligence V2 changelog (f52cc0fc)
- Register Explainable Prediction V1 (aafc5e7f)
- Document Explainable Prediction V1 (15b9d595)
- Localize Explainable Prediction V1 (76e87dde)
- Add Explainable Prediction V1 changelog (470e02bf)
- Preserve Czech radar presets registry (762292d9)
- Retain radar presets details (24f0a43c)
- Update changelog for v1.0.335 (cdf5b85e)
- Retain route explorer registry (513c52fe)
- Update changelog for v1.0.336 (fe7dbe3a)
- Update changelog for v1.0.337 (eb033c6d)
- Sync feature registry tables (1b444d3a)
- Update changelog for v1.0.338 (7b9f0209)
- Update changelog for v1.0.339 (a6094d61)
- Register navigation integrity center route (96c7459c)
- Sync navigation integrity feature registry (351b16bf)
- Register airport compare route (2a694953)
- Sync airport compare feature registry (e9fb560e)
- Register historical traffic heatmap route (a0b76b13)
- Sync historical heatmap feature registry (5dc347d6)
- Register saved workspaces (beaad2ff)
- Document saved workspaces (58095c5d)
- Document saved workspaces in Czech (d4046430)
- Register investigation links (a6e2a044)
- Document investigation links (0f65563c)
- Document investigation links in Czech (aad249c0)
- Register notification center (f0e63d1a)
- Document notification center (5e6feb8d)
- Document notification center in Czech (43465192)
- Register navigation reference explorer (a7739395)
- Add navigation reference route (54c31980)
- Add Czech navigation reference route (5c4159a1)
- Restore docs/FEATURES.md (066ad4ce)
- Restore docs/cs/FEATURES.md (868067dd)
- Register ATC sector detail (ca2e2b11)
- Add ATC sector detail route (b8c40f48)
- Add Czech ATC sector detail route (da3514ec)
- Register intelligence analytics (a9539c54)
- Add intelligence analytics surfaces (2c334a58)
- Add Czech intelligence analytics surfaces (826a56fb)
- Restore Investigation Links V2 registry (8d20fa04)

### Maintenance

- Sync generated repository metadata (#436) (8329eb08)
- Add prediction timeline presentation (12fc6ca3)
- Guard prediction timeline v1 boundaries (391d032e)
- Add explorer v2 layout (992027fe)
- Add event replay affordances (9d4793d5)
- Guard Explorer V2 boundaries (7ec7ae4f)
- Cover 30-day trend window (c7556c27)
- Cover 30-day trend window (b2cb19a3)
- Extend daily aviation story layout (322bd246)
- Cover daily airport and weather story (e6e3e3ba)
- Guard event replay v1 boundaries (e24a50e8)
- Target actual FlightPosition reads (69acafaa)
- Normalize Explorer boundary source (f5c1eae7)
- Keep 30-day trend case in suite (f973bfa1)
- Add route network explorer (0a8a09b6)
- Guard route network explorer v1 boundary (1cbccd78)
- Add aircraft discovery (b13cbf9f)
- Guard aircraft discovery v1 boundary (365359b6)
- Add watchlist intelligence v2 (95558aa6)
- Guard Watchlist Intelligence V2 boundary (21e09df1)
- Add explainable prediction evidence panel (e88ecf81)
- Expect explainable advisory evidence (d90f99df)
- Expect explainable advisory evidence (b248d346)
- Expect explainable advisory evidence (08d66464)
- Expect explainable advisory evidence (a46e8006)
- Cover explainable prediction evidence contract (fe9a7991)
- Guard Explainable Prediction V1 boundary (5a3517a1)
- Assert route explorer avoids FlightPosition queries (156bfb6e)
- Expect typed watchlist handoff (cb715150)
- Sync generated repository metadata (#455) (4d0539bb)
- Sync generated repository metadata (#456) (4babbcf6)
- Sync generated repository metadata (#459) (3d2b4846)
- Sync generated repository metadata (#463) (2732d1a0)
- Make documentation-only validation explicit (0a0d9e18)
- Add runtime timeline layout (e7d911b8)
- Cover runtime timeline boundary (b713f207)
- Add navigation integrity center layout (050d1a21)
- Cover navigation integrity center boundary (f5750b85)
- Add airport compare layout (1e8ed0a1)
- Cover airport compare boundary (6436bf24)
- Cover global command palette V1 (7b341953)
- Add airport movement analytics layout (f59c336e)
- Cover airport movement analytics boundary (5668e073)
- Add heatmap active-cell ranking (b28bb48a)
- Cover historical traffic heatmap boundary (84b998fd)
- Add responsive workspace layout (b9a37f98)
- Cover local workspace contract (9ee3ba96)
- Add context replay availability controls (437954bc)
- Cover historical context replay v3 boundary (1cdbb049)
- Cover deep-link roundtrips and boundaries (23b2f4ca)
- Add responsive notification feed (3e26b3a8)
- Cover aggregation and boundaries (c15e27b4)
- Cover Airport Compare command (b98660c5)
- Add reference explorer layout (cb826ec5)
- Cover reference explorer boundaries (25aecb37)
- Assert identifier cap contract (f9e38fe7)
- Follow typed radar deep-link contract (a0265891)
- Follow typed radar deep-link contract (281320d1)
- Assert direct position-history boundary (4d61a76d)
- Restore navigation link V2 coverage (8d92e6f6)
- Trigger production deploy (13f2aee4)
- Expect pruned tag synchronization (fc59cecd)
- Follow pruned tag fetch contract (94db4ebc)
- Pin automated version to validated artifact (6ccb7cdd)

<details>
<summary>Technical commits</summary>

- fix(ci): merge metadata PRs after required checks (#435) (b4665d06)
- fix(ci): publish metadata validation status (#437) (303ede44)
- chore(metadata): sync generated repository metadata (#436) (8329eb08)
- fix(ci): skip duplicate metadata pull request validation (#438) (0b9fc616)
- feat: add prediction timeline v1 (ef13865d)
- style: add prediction timeline presentation (12fc6ca3)
- feat: localize prediction timeline (2a0425c9)
- feat: localize prediction timeline in English (3050273b)
- test: guard prediction timeline v1 boundaries (391d032e)
- docs: register prediction timeline v1 (4528db41)
- feat(receiver): add directional range polar (69f330c1)
- style(receiver): add explorer v2 layout (992027fe)
- feat: add event replay link contract (74fdf966)
- docs: document prediction timeline v1 (64392b96)
- docs: localize prediction timeline v1 (c00ad427)
- feat: allow bounded event replay windows (df8e42cb)
- docs: describe prediction timeline boundaries (69e26f5e)
- feat: expose bounded event replay window mode (a8e69073)
- docs: add prediction timeline changelog (fa8b68ed)
- feat(receiver): build Receiver Explorer V2 (1239e734)
- feat: open event replay in Time Machine (39724048)
- feat: extend daily aviation story contract (f73e3936)
- feat: compose airport and weather daily highlights (03ac6f83)
- feat: link replayable intelligence events to Time Machine (f3173239)
- fix: render event replay action (ae5f3c8b)
- feat(receiver): support bounded 30-day trend (015323cd)
- refactor: surface prediction timeline before twin detail (5b318485)
- feat(receiver): expose selected range trend (fb4e447a)
- fix(receiver): handle sparse trend days (893c2a2b)
- feat: localize event replay in Czech (5e1ade46)
- feat: expose daily weather source status (a1666a8d)
- feat: localize event replay in English (e21034b9)
- feat: carry bounded weather status into daily story (835ca793)
- style: add event replay affordances (9d4793d5)
- feat: source daily airport and weather story evidence (70f9f386)
- fix: validate and preserve event replay target (0123c77c)
- test(receiver): guard Explorer V2 boundaries (7ec7ae4f)
- test(receiver): cover 30-day trend window (c7556c27)
- docs: register event replay v1 (16938900)
- docs: document event replay v1 (9b88b291)
- feat: present daily aviation story highlights (dc19b4b1)
- docs: localize event replay v1 (6b4c5db3)
- fix(receiver): bound single-day trend window (2f197d8b)
- feat: localize daily aviation story (ee01af1a)
- docs: add event replay changelog (cc135fee)
- feat: localize daily aviation story in English (e70b78c5)
- test(receiver): cover 30-day trend window (b2cb19a3)
- style: extend daily aviation story layout (322bd246)
- fix: preserve replay target when selecting events (94056d2d)
- docs(receiver): add Explorer V2 changelog (ee44539d)
- docs(receiver): document Explorer V2 (ca1ae360)
- test: cover daily airport and weather story (e6e3e3ba)
- test: guard event replay v1 boundaries (e24a50e8)
- docs(receiver): localize Explorer V2 (1a6f532f)
- test(receiver): target actual FlightPosition reads (69acafaa)
- fix: parameterize bounded Time Machine replay window (0ce0ab5c)
- fix: scope daily story event grid styling (4fba9618)
- fix: clean event replay route syntax (5f776d57)
- fix: refresh replay window callback when mode changes (dba4d45f)
- fix: remove escaped newline from Time Machine server (5f952f79)
- docs: register daily aviation story coverage (ff4a1797)
- fix: remove escaped newline from replay route (b9ee6f43)
- docs: describe daily aviation story (950e6262)
- fix: define event replay window constants (9515cd33)
- docs: localize daily aviation story (6df2a657)
- fix(receiver): repair trend source formatting (26855356)
- docs: add daily aviation story changelog (5054b587)
- docs(receiver): add Explorer V2 changelog (e633c963)
- fix: sync Czech Event Replay registry rows (1ad762fc)
- fix: reject malformed daily weather highlights (e75d2668)
- fix(receiver): normalize trend source lines (bc20df4e)
- docs(receiver): normalize Explorer V2 changelog (fbc3cb3b)
- docs(receiver): preserve changelog formatting (2248fd0b)
- docs: localize prediction timeline operational twin section (b1505ccc)
- fix: keep weather availability fail-soft in daily story (6ef1e31e)
- test(receiver): normalize Explorer boundary source (f5c1eae7)
- Merge pull request #439 from Boym323/feat/prediction-timeline-v1 (efcb9141)
- test(receiver): keep 30-day trend case in suite (f973bfa1)
- Merge main into feat/receiver-explorer-v2 (739a4043)
- merge main into Daily Aviation Story V1 (56c83e8e)
- Merge pull request #443 from Boym323/feat/daily-aviation-story-v1 (6f711b33)
- merge main into Event Replay V1 (7cc74e4b)
- Merge pull request #442 from Boym323/feat/event-replay-v1 (56617b79)
- fix(deploy): pin automated releases to validated commit (#444) (2ad6e93b)
- feat: restore Live Airport Network V1 after rebase (42902224)
- feat: restore Live Airport Network V1 after rebase (11be3d45)
- feat: restore Live Airport Network V1 after rebase (3bd743e1)
- feat: reapply Live Airport Network V1 integration (07a4c400)
- feat: reapply Live Airport Network V1 integration (753629b1)
- feat: reapply Czech Live Airport Network localization (985d1e08)
- feat: reapply English Live Airport Network localization (4780ab67)
- docs: rebase Live Airport Network registry (6d3bd2d3)
- docs: rebase Live Airport Network docs (226f5050)
- docs: rebase Czech Live Airport Network docs (962e704c)
- docs: rebase Live Airport Network changelog (4b8885b0)
- Merge pull request #440 from Boym323/feat/live-airport-network-v1 (05f5028d)
- Merge main into Receiver Explorer V2 (3cc67b20)
- Merge latest main into Receiver Explorer V2 (8dec6a69)
- Merge pull request #441 from Boym323/feat/receiver-explorer-v2 (10f4346d)
- fix(ci): complete daily recap smoke fixture (#445) (273815e7)
- fix(ci): retry visual smoke navigation after paint race (#446) (6a01484d)
- fix(ci): retry secondary route smoke navigation (#447) (f3de3b56)
- fix(release): support offline local deployments (#448) (f3969841)
- fix(ci): track receiver explorer route root (f19e1b52)
- fix(ci): track receiver explorer route root (#449) (51647bcd)
- feat: add route network explorer route (b66f6730)
- feat: add Route Network Explorer V1 (7b32ad60)
- style: add route network explorer (0a8a09b6)
- feat: expose route network explorer in navigation (315e27a4)
- test: guard route network explorer v1 boundary (1cbccd78)
- docs: register route network explorer v1 (1dadad53)
- docs: document route network explorer v1 (ef189f0b)
- docs: localize route network explorer v1 (bb2ec433)
- docs: add route network explorer changelog (72e3b654)
- feat: add aircraft discovery route (6fae9ece)
- feat: add Aircraft Discovery V1 (f56ec1bf)
- style: add aircraft discovery (b13cbf9f)
- feat: expose aircraft discovery in navigation (c2d7d09e)
- test: guard aircraft discovery v1 boundary (365359b6)
- docs: register aircraft discovery v1 (1ad60046)
- docs: document aircraft discovery v1 (95b0cd6a)
- docs: localize aircraft discovery v1 (6c96c8a6)
- docs: add aircraft discovery changelog (2edcba86)
- feat: add Watchlist Intelligence V2 (96e92fb7)
- style: add watchlist intelligence v2 (95558aa6)
- feat: integrate Watchlist Intelligence V2 (d21c00d7)
- test: guard Watchlist Intelligence V2 boundary (21e09df1)
- docs: register Watchlist Intelligence V2 (c75f0334)
- docs: document Watchlist Intelligence V2 (009f2afa)
- docs: localize Watchlist Intelligence V2 (f4c864e0)
- docs: add Watchlist Intelligence V2 changelog (f52cc0fc)
- feat: add prediction evidence explainability contract (4246e0b5)
- feat: export prediction explainability contract (f4a2e0d8)
- feat: expose gated ETA explainability evidence (296955bf)
- feat: expose gated runway explainability evidence (180c5d5d)
- feat: expose gated runway-change explainability evidence (ef44387e)
- feat: expose gated trajectory explainability evidence (5df36db2)
- style: add explainable prediction evidence panel (e88ecf81)
- feat: show explainable predictive advisory evidence (5acf0e75)
- test: expect explainable advisory evidence (d90f99df)
- test: expect explainable advisory evidence (b248d346)
- test: expect explainable advisory evidence (08d66464)
- test: expect explainable advisory evidence (a46e8006)
- test: cover explainable prediction evidence contract (fe9a7991)
- test: guard Explainable Prediction V1 boundary (5a3517a1)
- fix: keep explainability type import valid (7052bcaa)
- docs: register Explainable Prediction V1 (aafc5e7f)
- docs: document Explainable Prediction V1 (15b9d595)
- docs: localize Explainable Prediction V1 (76e87dde)
- docs: add Explainable Prediction V1 changelog (470e02bf)
- test: assert route explorer avoids FlightPosition queries (156bfb6e)
- fix: type aircraft discovery watchlist link (7e723003)
- test: expect typed watchlist handoff (cb715150)
- fix: keep predictive advisory DTO backward compatible (2d2b29a9)
- fix: keep predictive advisory DTO backward compatible (e4479448)
- fix: keep predictive advisory DTO backward compatible (2c6fc252)
- fix: keep predictive advisory DTO backward compatible (717718b6)
- feat: add Radar Presets V1 (#450) (c6575da1)
- Merge main into route network explorer (06cf0648)
- docs: preserve Czech radar presets registry (762292d9)
- docs: retain radar presets details (24f0a43c)
- feat: add Route Network Explorer V1 (#451) (0b051448)
- fix(radar): keep narrow desktop controls within overlay (0d3e06f2)
- docs: update changelog for v1.0.335 (cdf5b85e)
- chore(metadata): sync generated repository metadata (#455) (4d0539bb)
- feat: add static asset checks and normalize standalone server configuration (c189e8d8)
- Merge remote-tracking branch 'origin/main' (89c7cb07)
- chore(metadata): sync generated repository metadata (#456) (4babbcf6)
- fix(release): publish standalone build metadata (821e36d4)
- merge main into aircraft discovery (2bb3c404)
- docs(features): retain route explorer registry (513c52fe)
- fix(release): tolerate metadata version race for validated artifacts (0be2590f)
- docs: update changelog for v1.0.336 (fe7dbe3a)
- Merge remote-tracking branch 'origin/main' into feat/aircraft-discovery-v1 (2b5eb664)
- Merge pull request #452 from Boym323/feat/aircraft-discovery-v1 (79057775)
- merge main into watchlist intelligence (7408853f)
- docs: update changelog for v1.0.337 (eb033c6d)
- merge main into watchlist intelligence (445a329f)
- chore(metadata): sync generated repository metadata (#459) (3d2b4846)
- docs(cs): sync feature registry tables (1b444d3a)
- Merge pull request #453 from Boym323/feat/watchlist-intelligence-v2 (3f90885f)
- docs: update changelog for v1.0.338 (7b9f0209)
- merge main into explainable prediction (8a8dae6c)
- Merge pull request #454 from Boym323/feat/explainable-prediction-v1 (fdaf2e92)
- docs: update changelog for v1.0.339 (a6094d61)
- chore(metadata): sync generated repository metadata (#463) (2732d1a0)
- ci: make documentation-only validation explicit (0a0d9e18)
- Merge pull request #464 from Boym323/ci/skip-tests-for-docs (239a1521)
- feat(system): add admin runtime timeline (205800d8)
- style(system): add runtime timeline layout (e7d911b8)
- test(system): cover runtime timeline boundary (b713f207)
- feat(system): mount runtime timeline for admin detail (6f00d82e)
- Merge pull request #465 from Boym323/feat/system-runtime-timeline-v1 (58e7a528)
- feat: add Weather Operations Center V1 (#458) (129ebdf3)
- feat: add ATC & Airspace Explorer V1 (#457) (76a3f187)
- feat: add Route Network Detail V2 (#460) (928e8fab)
- feat: add Flight Compare V1 (#461) (3ba9f4cc)
- fix: type route detail link (1211a995)
- feat: add navigation integrity center page (fd814b77)
- feat: implement navigation integrity center (c85abe30)
- style: add navigation integrity center layout (050d1a21)
- test: cover navigation integrity center boundary (f5750b85)
- docs: register navigation integrity center route (96c7459c)
- docs: sync navigation integrity feature registry (351b16bf)
- feat: add airport compare page (5b5c87ba)
- feat: implement airport compare (48f4386d)
- style: add airport compare layout (1e8ed0a1)
- test: cover airport compare boundary (6436bf24)
- docs: register airport compare route (2a694953)
- docs: sync airport compare feature registry (e9fb560e)
- Merge pull request #468 from Boym323/fix/route-network-typed-link (4cd6158f)
- Merge pull request #466 from Boym323/feat/navigation-integrity-center-v1 (7039d093)
- feat(search): expand global command palette (8177c3d8)
- fix(search): preserve operations recent action (99a9aa39)
- test(search): cover global command palette V1 (7b341953)
- fix: type airport compare detail links (d0d5f7a6)
- feat: surface movement analytics on airport detail (1cfa1f76)
- style: add airport movement analytics layout (f59c336e)
- feat: add airport movement analytics (2fc21704)
- test: cover airport movement analytics boundary (5668e073)
- feat: add historical traffic heatmap page (c6a40254)
- style: add heatmap active-cell ranking (b28bb48a)
- feat: promote historical traffic heatmap product (197cffc3)
- feat: add heatmap product copy (6b44dcbf)
- test: cover historical traffic heatmap boundary (84b998fd)
- feat(workspaces): add browser-local workspace model (d9bbf796)
- docs: register historical traffic heatmap route (a0b76b13)
- feat(workspaces): add saved workspace UI (719948ef)
- style(workspaces): add responsive workspace layout (b9a37f98)
- docs: sync historical heatmap feature registry (5dc347d6)
- feat(workspaces): add workspaces route (e5e330d4)
- test(workspaces): cover local workspace contract (9ee3ba96)
- feat: add context replay v3 copy (253e09b5)
- feat: add context replay v3 copy (5057c710)
- feat: add historical context availability and event navigation (ff0b84c1)
- style: add context replay availability controls (437954bc)
- test: cover historical context replay v3 boundary (1cdbb049)
- fix(workspaces): type canonical workspace links (8887380d)
- fix(workspaces): keep test state typed (fef028db)
- Merge pull request #470 from Boym323/feat/airport-compare-v1 (c81c788d)
- feat(workspaces): expose workspaces in More navigation (6e2796cb)
- docs(features): register saved workspaces (beaad2ff)
- docs(features): document saved workspaces (58095c5d)
- docs(features): document saved workspaces in Czech (d4046430)
- feat(investigation): add safe deep-link query helpers (5caf7a58)
- feat(investigation): deep-link navigation integrity filters (dba74996)
- feat(investigation): deep-link airspace state (774908bd)
- feat(investigation): restore flight compare from URL state (d5095c51)
- feat(investigation): restore airport compare from URL state (fe7971b1)
- test(investigation): cover deep-link roundtrips and boundaries (23b2f4ca)
- docs(features): register investigation links (a6e2a044)
- docs(features): document investigation links (0f65563c)
- docs(features): document investigation links in Czech (aad249c0)
- feat(notifications): add read-only feed helpers (c59e67b8)
- feat(notifications): add notification center UI (04f5d50d)
- style(notifications): add responsive notification feed (3e26b3a8)
- feat(notifications): add notifications route (925c9071)
- test(notifications): cover aggregation and boundaries (c15e27b4)
- feat(notifications): expose notification center in More navigation (4aacd05b)
- docs(features): register notification center (f0e63d1a)
- docs(features): document notification center (5e6feb8d)
- docs(features): document notification center in Czech (43465192)
- fix(search): allow existing aircraft and ATC palette icons (93acaaa6)
- feat(search): add Airport Compare command now available on main (b189a49a)
- test(search): cover Airport Compare command (b98660c5)
- fix: use semantic colors in replay availability (c87987c4)
- Merge pull request #474 from Boym323/feat/airport-movement-analytics-v2 (c2aee399)
- Merge pull request #475 from Boym323/feat/historical-traffic-heatmap-v1 (04cc241c)
- rebase: sync Reception Records Center V1 with main (b24be1e3)
- Merge pull request #476 from Boym323/feat/historical-context-replay-v3 (2f7334ef)
- rebase: sync Aircraft Type Explorer V1 with main (6d5a1f75)
- rebase: sync Airline & Operator Explorer V1 with main (60291c2e)
- rebase: sync Traffic Rhythm Analytics V1 with main (2bf5bc14)
- rebase: sync Traffic Geography V1 with main (d8e030f4)
- Merge pull request #478 from Boym323/feat/reception-records-center-v1 (1fce1d43)
- merge main into global command palette (e8d8c0c1)
- merge main into aircraft type explorer (173772b1)
- Merge pull request #472 from Boym323/feat/global-command-palette-v1 (a80064b8)
- merge latest main into aircraft type explorer (efa00122)
- stack operator explorer on aircraft type explorer (5cdaa6d6)
- stack traffic rhythm analytics on operator explorer (68a1a58f)
- stack traffic geography on traffic rhythm (efad9c98)
- Merge pull request #480 from Boym323/feat/aircraft-type-explorer-v1 (61079cd3)
- Merge pull request #481 from Boym323/feat/operator-explorer-v1 (6b65531f)
- Merge pull request #483 from Boym323/feat/traffic-rhythm-analytics-v1 (02722171)
- stack investigation links on traffic geography (4f96513b)
- stack saved workspaces on investigation links (52ebab28)
- stack notification center on saved workspaces (bdacb018)
- Merge pull request #485 from Boym323/feat/traffic-geography-v1 (b77598a5)
- Merge pull request #479 from Boym323/feat/investigation-links-v1 (377c2663)
- Merge pull request #477 from Boym323/feat/saved-workspaces-v1 (22c8c0c8)
- Merge pull request #482 from Boym323/feat/notification-center-v1 (fa2697d2)
- feat: add Mobile Spotter Mode V1 (#484) (adb9f277)
- fix: improve navigation handling in assertBrowserSmoke function (1eac2737)
- feat(navigation): add reference explorer route (0275bccd)
- feat(navigation): add reference explorer (4b6a3971)
- style(navigation): add reference explorer layout (cb826ec5)
- test(navigation): cover reference explorer boundaries (25aecb37)
- feat(navigation): expose reference explorer (e14140bc)
- docs(features): register navigation reference explorer (a7739395)
- docs(features): add navigation reference route (54c31980)
- docs(features): add Czech navigation reference route (5c4159a1)
- fix(navigation): keep React type import explicit (33cfaee1)
- test(navigation): assert identifier cap contract (f9e38fe7)
- fix(navigation): satisfy typed routes and compiler lint (8092f19d)
- fix: update URL pattern in assertBrowserSmoke function for improved navigation (8a91a2ab)
- test(navigation): follow typed radar deep-link contract (a0265891)
- Merge pull request #486 from Boym323/feat/navigation-reference-explorer-v1 (ab878cb4)
- feat(procedures): restore app/procedures/page.tsx (88b0db6c)
- feat(procedures): restore components/procedure-explorer.tsx (1b2ec61b)
- feat(procedures): restore components/procedure-explorer.module.css (08c9a47b)
- feat(procedures): restore tests/procedure-explorer-v1-boundary.test.ts (f0b25b06)
- feat(procedures): restore components/airradar-shell.tsx (26c29e99)
- feat(procedures): restore docs/features.registry.json (d5e7c65e)
- docs(procedures): restore docs/FEATURES.md (066ad4ce)
- docs(procedures): restore docs/cs/FEATURES.md (868067dd)
- fix(procedures): use typed-safe airport link (b44abfc1)
- test(procedures): follow typed radar deep-link contract (281320d1)
- Merge pull request #487 from Boym323/feat/procedure-explorer-v1 [skip ci] (d1cb04aa)
- feat(airspace): restore app/airspace/sectors/[id]/page.tsx (dfcb1cd0)
- feat(airspace): restore components/atc-sector-detail.tsx (78a082c3)
- feat(airspace): restore components/atc-sector-detail.module.css (ead3d793)
- feat(airspace): restore tests/atc-sector-detail-v1-boundary.test.ts (f0ced3b6)
- feat(airspace): restore components/atc-airspace-explorer.tsx (33acd95b)
- feat(airspace): restore components/atc-airspace-explorer.module.css (af01ad8c)
- docs(features): register ATC sector detail (ca2e2b11)
- docs(features): add ATC sector detail route (b8c40f48)
- docs(features): add Czech ATC sector detail route (da3514ec)
- Merge pull request #488 from Boym323/feat/atc-sector-detail-v1 [skip ci] (e51c18cb)
- feat(intelligence): restore app/api/intelligence/analytics/route.ts (fe397b23)
- feat(intelligence): restore app/intelligence/analytics/page.tsx (96c84b24)
- feat(intelligence): restore components/flight-intelligence-analytics.module.css (364d517e)
- feat(intelligence): restore components/flight-intelligence-analytics.tsx (6c80012e)
- feat(intelligence): restore lib/intelligence-analytics.ts (2d1dced1)
- feat(intelligence): restore lib/server/flight-intelligence-analytics.ts (9e7c198a)
- feat(intelligence): restore tests/flight-intelligence-analytics-v1-boundary.test.ts (6d56243a)
- feat(intelligence): link analytics from event timeline (40254b26)
- docs(features): register intelligence analytics (a9539c54)
- docs(features): add intelligence analytics surfaces (2c334a58)
- docs(features): add Czech intelligence analytics surfaces (826a56fb)
- fix(intelligence): align analytics SQL runtime typing (54c7b11c)
- test(intelligence): assert direct position-history boundary (4d61a76d)
- Merge pull request #489 from Boym323/feat/flight-intelligence-analytics-v1 [skip ci] (91615f58)
- feat(investigations): restore components/atc-sector-detail.tsx (4ed3f91a)
- feat(investigations): restore components/navigation-reference-explorer.tsx (4a71bae8)
- feat(investigations): restore components/procedure-explorer.tsx (0e1b6786)
- feat(investigations): restore lib/investigation-links.ts (83c5a7b8)
- feat(investigations): restore docs/FEATURES.md (dbf2f861)
- feat(investigations): restore docs/cs/FEATURES.md (bd4028e3)
- docs(features): restore Investigation Links V2 registry (8d20fa04)
- test(investigations): restore navigation link V2 coverage (8d92e6f6)
- Merge pull request #490 from Boym323/feat/navigation-investigation-links-v2 [skip ci] (d4de8faa)
- chore: trigger production deploy (13f2aee4)
- fix(deploy): prune stale production tags before version resolution (bae1d2b4)
- fix(ci): synchronize production tag namespace before deploy (da8a21ca)
- Merge pull request #491 from Boym323/fix/deploy-version-tag-sync (c5f705de)
- test(release): expect pruned tag synchronization (fc59cecd)
- test(release): follow pruned tag fetch contract (94db4ebc)
- fix(ci): let privileged release script own tag synchronization (c73e2edc)
- fix(deploy): trust validated artifact version (76440a54)
- fix(ci): verify deployed artifact version (147f3d79)
- test(deploy): pin automated version to validated artifact (6ccb7cdd)
- Merge pull request #492 from Boym323/fix/deploy-artifact-version-authority (59655674)

</details>

## [1.0.333] - 2026-10-06

Changes since v1.0.332.

**Features touched:** Airport Intelligence, Operations Dashboard.

### Added

- Add Trajectory Quality V3 Graduation (#422) (b791999)
- Add Flight Follow Mode V1 (#426) (659087a)
- Add Operations Dashboard V1 (#427) (ca94991)

### Fixed

- Merge metadata PRs after dispatched CI (#423) (afb703d)
- Preserve release branch SHA across tag fetch (#424) (c26e650)
- Bootstrap production checkout to validated SHA (#425) (7d359f3)
- Bootstrap legacy production release without sudo git (#428) (ddce97b)
- Include Operations Dashboard in production browser gates (#429) (a074d36)
- Use stable Operations Dashboard selector in browser gate (#430) (c0d7f2a)
- Tolerate Playwright page-close race in production gates (#431) (d9f341d)
- Ensure responsive sweep completes before route smoke to prevent browser teardown (#432) (ab74b5d)
- Allow degraded airport operations in route smoke (#433) (7c366ff)

<details>
<summary>Technical commits</summary>

- feat: add Trajectory Quality V3 Graduation (#422) (b791999)
- fix: merge metadata PRs after dispatched CI (#423) (afb703d)
- fix: preserve release branch SHA across tag fetch (#424) (c26e650)
- fix: bootstrap production checkout to validated SHA (#425) (7d359f3)
- feat: add Flight Follow Mode V1 (#426) (659087a)
- feat: add Operations Dashboard V1 (#427) (ca94991)
- fix: bootstrap legacy production release without sudo git (#428) (ddce97b)
- fix: include Operations Dashboard in production browser gates (#429) (a074d36)
- fix: use stable Operations Dashboard selector in browser gate (#430) (c0d7f2a)
- fix: tolerate Playwright page-close race in production gates (#431) (d9f341d)
- fix: ensure responsive sweep completes before route smoke to prevent browser teardown (#432) (ab74b5d)
- fix(ci): allow degraded airport operations in route smoke (#433) (7c366ff)

</details>

## [1.0.332] - 2026-10-06

Changes since v1.0.331.

**Features touched:** Operational Digital Twin.

### Added

- Add Trajectory Quality Outcome Validation V2 (#420) (c53ab66)

<details>
<summary>Technical commits</summary>

- feat: add Trajectory Quality Outcome Validation V2 (#420) (c53ab66)

</details>

## [1.0.331] - 2026-10-06

Changes since v1.0.330.

### Added

- Add performance-aware Trajectory Quality V3 shadow (#418) (a201f62)

### Maintenance

- Sync generated repository metadata (#417) (035a360)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#417) (035a360)
- feat: add performance-aware Trajectory Quality V3 shadow (#418) (a201f62)

</details>

## [1.0.330] - 2026-10-06

Changes since v1.0.329.

**Features touched:** Mobile / PWA mode, Operational Digital Twin, Statistics & Recaps, System Observability, Watchlist, Alerts & Fleet.

### Added

- Add Trajectory Quality Outcome Validation V1 (#411) (ca61cbf7)
- Add mobile PWA and web push alerts (3766a926)
- Add observed traffic heatmap (7ce9b528)
- Deliver durable alerts through Pushover (831675d6)
- Deliver durable alerts through Pushover (07890013)
- Add Trajectory Quality Graduation V1 (#412) (e47970ee)
- Add proactive receiver monitoring (#415) (7cd7bd6f)
- Add Trajectory Quality Promotion V1 (#416) (28d23eae)

### Documentation

- Regenerate feature registry (73ec9ec2)

### Maintenance

- Sync generated repository metadata (#410) (bac3f8c0)
- Type fetch mock correctly (6b233d68)
- Type fetch mock correctly (8449aa6d)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#410) (bac3f8c0)
- feat: add Trajectory Quality Outcome Validation V1 (#411) (ca61cbf7)
- feat: add mobile PWA and web push alerts (3766a926)
- feat(statistics): add observed traffic heatmap (7ce9b528)
- feat(alerts): deliver durable alerts through Pushover (831675d6)
- feat(alerts): deliver durable alerts through Pushover (07890013)
- feat: add Trajectory Quality Graduation V1 (#412) (e47970ee)
- feat(system): add proactive receiver monitoring (#415) (7cd7bd6f)
- docs(features): regenerate feature registry (73ec9ec2)
- test(alerts): type fetch mock correctly (6b233d68)
- test(alerts): type fetch mock correctly (8449aa6d)
- Merge pull request #414 from Boym323/feat/pushover-pr (8fa64124)
- Merge pull request #413 from Boym323/feat/mobile-pwa (e082f215)
- feat: add Trajectory Quality Promotion V1 (#416) (28d23eae)

</details>

## [1.0.329] - 2026-10-06

Changes since v1.0.328.

**Features touched:** Airport Intelligence.

### Added

- Reapply app/api/airports/[icao]/operations/route.ts (8d2576d9)
- Reapply app/globals.css (3b98db94)
- Reapply components/airport-operations-board.tsx (511999ce)
- Reapply lib/server/airport-operations.ts (2c34733b)
- Restore lib/server/airport-terminal-demand-horizon-v9.ts (cc0c6bd3)
- Restore tests/airport-live-board-v9-boundary.test.ts (24659cd8)
- Restore tests/airport-live-board-v9-terminal-demand.test.ts (b1f808f2)
- Rebase airport v9 copy (6464562c)
- Localize rebased airport v9 copy (4cf8d560)

### Documentation

- Rebase airport live board v9 (dac87bc7)
- Localize rebased airport live board v9 (1349824b)

<details>
<summary>Technical commits</summary>

- feat(airport-v9): reapply app/api/airports/[icao]/operations/route.ts (8d2576d9)
- feat(airport-v9): reapply app/globals.css (3b98db94)
- feat(airport-v9): reapply components/airport-operations-board.tsx (511999ce)
- feat(airport-v9): reapply lib/server/airport-operations.ts (2c34733b)
- feat(airport-v9): restore lib/server/airport-terminal-demand-horizon-v9.ts (cc0c6bd3)
- feat(airport-v9): restore tests/airport-live-board-v9-boundary.test.ts (24659cd8)
- feat(airport-v9): restore tests/airport-live-board-v9-terminal-demand.test.ts (b1f808f2)
- docs: rebase airport live board v9 (dac87bc7)
- docs: localize rebased airport live board v9 (1349824b)
- feat(i18n): rebase airport v9 copy (6464562c)
- feat(i18n): localize rebased airport v9 copy (4cf8d560)
- Merge pull request #407 from Boym323/feat/airport-terminal-demand-horizon-v9 (4259e1f9)

</details>

## [1.0.328] - 2026-10-06

Changes since v1.0.327.

**Features touched:** Live Radar, Operational Digital Twin.

### Added

- Add focus navigation projection (b3179118)
- Add previous next operational focus navigation (79abac5e)
- Add operational focus navigation copy (d3305756)
- Localize operational focus navigation copy (0882d4de)
- Add operational focus change intelligence (e78d2b6a)
- Track operational focus changes across refreshes (d4fe9438)
- Pass focus change intelligence into drawer (bb0ed354)
- Surface focus changes in aircraft situation (6559d226)
- Render operational focus change intelligence (c8c6e1d6)
- Add focus change intelligence copy (5f404856)
- Localize focus change intelligence copy (1e9fe38e)
- Reapply app/api/operations/situation/route.ts (9a6e6407)
- Reapply components/radar/radar-operations-center.module.css (153ff660)
- Reapply components/radar/radar-operations-center.tsx (a808485c)
- Restore lib/operational-twin/regional-focus-queue.ts (b5155783)
- Restore tests/regional-focus-queue.test.ts (eba0af92)
- Rebase regional focus queue copy (e23c09c7)
- Localize rebased regional focus queue copy (260b5146)
- Reapply app/api/admin/operational-twin/calibration/route.ts (9c42ebef)
- Reapply components/digital-twin-calibration-center.tsx (4e60e562)
- Reapply lib/server/aircraft-state.ts (0ebec074)
- Reapply lib/server/operational-twin.ts (bc2ed491)
- Restore lib/operational-twin/aircraft-operational-focus-outcome.ts (12d3976e)
- Restore tests/aircraft-operational-focus-outcome-boundary.test.ts (6fbcb6c1)
- Restore tests/aircraft-operational-focus-outcome.test.ts (299eca4a)
- Rebase focus outcome calibration copy (7fb66067)
- Localize rebased focus outcome calibration copy (9747692b)
- Reapply lib/operational-twin/index.ts (7fa839e7)
- Reapply lib/operational-twin/types.ts (7e05f94b)
- Restore shadow implementation (fde76974)
- Integrate quality shadow with current twin server (2c0ef62f)

### Documentation

- Document operational focus navigation (9185188d)
- Localize operational focus navigation (fcec8420)
- Document focus change intelligence (892b552b)
- Localize focus change intelligence (a4f8e5bd)
- Rebase regional focus queue (57928032)
- Localize rebased regional focus queue (4b9bd11c)
- Rebase operational focus outcome validation (c1081265)
- Localize rebased operational focus outcome validation (35ef49e6)
- Rebase trajectory quality v2 (3b6254fa)
- Localize rebased trajectory quality v2 (e34c850e)

### Maintenance

- Add operational focus navigation controls (a9f31e2e)
- Cover focus navigation order (ae818bc1)
- Lock focus navigation boundary (a1631e0c)
- Sync generated repository metadata (#396) (01538f6e)
- Add focus change presentation (6ff13514)
- Cover focus change intelligence (4f23c0b6)
- Lock focus change refresh boundary (919b42b6)
- Reapply boundary coverage (33897819)
- Restore tests/operational-twin-trajectory-quality-v2-boundary.test.ts (6ca846c5)
- Restore tests/operational-twin-trajectory-quality-v2.test.ts (2849ccf6)

<details>
<summary>Technical commits</summary>

- feat(operational-twin): add focus navigation projection (b3179118)
- feat(radar): add previous next operational focus navigation (79abac5e)
- style(radar): add operational focus navigation controls (a9f31e2e)
- feat(i18n): add operational focus navigation copy (d3305756)
- feat(i18n): localize operational focus navigation copy (0882d4de)
- test(operational-twin): cover focus navigation order (ae818bc1)
- test(radar): lock focus navigation boundary (a1631e0c)
- docs: document operational focus navigation (9185188d)
- docs: localize operational focus navigation (fcec8420)
- Merge pull request #398 from Boym323/feat/aircraft-operational-focus-navigation-v1 (6a7b16d1)
- chore(metadata): sync generated repository metadata (#396) (01538f6e)
- feat(operational-twin): add operational focus change intelligence (e78d2b6a)
- feat(radar): track operational focus changes across refreshes (d4fe9438)
- feat(radar): pass focus change intelligence into drawer (bb0ed354)
- feat(radar): surface focus changes in aircraft situation (6559d226)
- feat(radar): render operational focus change intelligence (c8c6e1d6)
- style(radar): add focus change presentation (6ff13514)
- feat(i18n): add focus change intelligence copy (5f404856)
- feat(i18n): localize focus change intelligence copy (1e9fe38e)
- test(operational-twin): cover focus change intelligence (4f23c0b6)
- test(radar): lock focus change refresh boundary (919b42b6)
- docs: document focus change intelligence (892b552b)
- docs: localize focus change intelligence (a4f8e5bd)
- Merge pull request #403 from Boym323/feat/operational-focus-change-intelligence-v1 (998e2a1d)
- feat(regional-focus): reapply app/api/operations/situation/route.ts (9a6e6407)
- feat(regional-focus): reapply components/radar/radar-operations-center.module.css (153ff660)
- feat(regional-focus): reapply components/radar/radar-operations-center.tsx (a808485c)
- feat(regional-focus): restore lib/operational-twin/regional-focus-queue.ts (b5155783)
- feat(regional-focus): restore tests/regional-focus-queue.test.ts (eba0af92)
- test(regional-focus): reapply boundary coverage (33897819)
- docs: rebase regional focus queue (57928032)
- docs: localize rebased regional focus queue (4b9bd11c)
- feat(i18n): rebase regional focus queue copy (e23c09c7)
- feat(i18n): localize rebased regional focus queue copy (260b5146)
- Merge pull request #404 from Boym323/feat/regional-focus-queue-v1 (33c1329a)
- feat(focus-outcome): reapply app/api/admin/operational-twin/calibration/route.ts (9c42ebef)
- feat(focus-outcome): reapply components/digital-twin-calibration-center.tsx (4e60e562)
- feat(focus-outcome): reapply lib/server/aircraft-state.ts (0ebec074)
- feat(focus-outcome): reapply lib/server/operational-twin.ts (bc2ed491)
- feat(focus-outcome): restore lib/operational-twin/aircraft-operational-focus-outcome.ts (12d3976e)
- feat(focus-outcome): restore tests/aircraft-operational-focus-outcome-boundary.test.ts (6fbcb6c1)
- feat(focus-outcome): restore tests/aircraft-operational-focus-outcome.test.ts (299eca4a)
- docs: rebase operational focus outcome validation (c1081265)
- docs: localize rebased operational focus outcome validation (35ef49e6)
- feat(i18n): rebase focus outcome calibration copy (7fb66067)
- feat(i18n): localize rebased focus outcome calibration copy (9747692b)
- Merge pull request #405 from Boym323/feat/operational-focus-outcome-validation-v1 (4403e81a)
- feat(trajectory-v2): reapply lib/operational-twin/index.ts (7fa839e7)
- feat(trajectory-v2): reapply lib/operational-twin/types.ts (7e05f94b)
- feat(trajectory-v2): restore shadow implementation (fde76974)
- test(trajectory-v2): restore tests/operational-twin-trajectory-quality-v2-boundary.test.ts (6ca846c5)
- test(trajectory-v2): restore tests/operational-twin-trajectory-quality-v2.test.ts (2849ccf6)
- feat(trajectory-v2): integrate quality shadow with current twin server (2c0ef62f)
- docs: rebase trajectory quality v2 (3b6254fa)
- docs: localize rebased trajectory quality v2 (e34c850e)
- Merge pull request #406 from Boym323/feat/digital-twin-trajectory-quality-v2 (76eb08ae)

</details>

## [1.0.327] - 2026-10-06

Changes since v1.0.326.

### Fixed

- Ship published ATS datasets (fccd298e)

<details>
<summary>Technical commits</summary>

- fix(deploy): ship published ATS datasets (fccd298e)
- Merge pull request #402 from Boym323/fix/ship-ats-datasets (3dbd66eb)

</details>

## [1.0.326] - 2026-10-06

Changes since v1.0.325.

**Features touched:** Live Radar, Operational Digital Twin.

### Added

- Render aircraft operational focus (e7c8272b)
- Add operational focus copy (4ff132aa)
- Localize operational focus (94227565)
- Sync components/aircraft-operational-twin.module.css (09cf3299)
- Sync components/aircraft-operational-twin.tsx (e597dbb7)
- Sync components/airradar-app.tsx (0bc55040)
- Sync docs/OPERATIONAL-DIGITAL-TWIN.md (0bf0e4ac)
- Sync docs/cs/OPERATIONAL-DIGITAL-TWIN.md (b120bb79)
- Sync lib/i18n/cs.ts (e6085faf)
- Sync lib/i18n/en.ts (2472af04)
- Add lib/operational-twin/aircraft-operational-focus-ui.ts (dcfe7101)
- Sync lib/operational-twin/index.ts (9278026b)
- Add tests/aircraft-operational-focus-map.test.ts (720dd277)
- Sync tests/aircraft-operational-focus-ui-boundary.test.ts (a43f0fd6)
- Add operational focus map callout (014ebe6c)
- Add focus clear radar href (e1793527)
- Add operational focus radar callout copy (e18fd7d9)
- Localize operational focus radar callout (6021e3ec)
- Show active operational focus callout (2ddd0145)
- Add operational focus drawer summary (b248c901)
- Add operational focus drawer copy (f2cb32aa)
- Localize operational focus drawer copy (9aada61e)
- Surface operational focus in aircraft drawer (2bd245cb)
- Pass operational focus through drawer boundary (33f44f55)
- Wire drawer focus actions to existing map projection (a60dc846)
- Keep active focus visible in compact drawer (3a0fb112)
- Reveal Situation tab for map-focused context (a4b33366)
- Pass focus reveal signal through drawer (51c8bd5b)
- Reveal operational focus drawer from map click (ba4b5b15)

### Fixed

- Type focus radar href (45325ac3)
- Narrow available focus twin (0362effc)
- Keep focus UI client import bounded (314b5ac7)
- Scope operational focus kicker style (d9af19fa)
- Include ATS datasets in standalone runtime (38e7fb09)
- Allow ATS recovery releases (eb695121)

### Documentation

- Update changelog for v1.0.324 (75c004ed)
- Document operational focus UI (f49d99ee)
- Localize operational focus UI (67472a50)
- Document operational focus radar callout (63669596)
- Localize operational focus radar callout (15e83cd7)
- Backfill missing release changelog entries (fb79e7ed)
- Keep changelog aligned with published tags (647909ac)
- Document operational focus drawer (93d22571)
- Localize operational focus drawer (6c9abe7f)
- Document operational focus map drawer sync (ec8fbb2a)
- Localize operational focus map drawer sync (31901b21)

### Maintenance

- Add focus severity treatment (b00ecee8)
- Lock operational focus UI boundary (0ce2fa4f)
- Fix focus UI fetch assertion (129d8ce2)
- Add operational focus map callout (a06f0fea)
- Cover focus clear href (e416bc08)
- Lock operational focus callout boundary (8baf3450)
- Fix focus callout clear assertion (118d75de)
- Sync generated repository metadata (44fd36ca)
- Sync generated repository metadata (9bb91069)
- Add operational focus drawer summary (b238f8a9)
- Cover operational focus drawer boundary (c69a81d0)
- Cover operational focus map drawer sync (3ee5994c)
- Align quick detail contract with focus sync (73cd68f0)

<details>
<summary>Technical commits</summary>

- docs: update changelog for v1.0.324 (75c004ed)
- feat(operational-twin): render aircraft operational focus (e7c8272b)
- style(operational-twin): add focus severity treatment (b00ecee8)
- feat(i18n): add operational focus copy (4ff132aa)
- feat(i18n): localize operational focus (94227565)
- docs: document operational focus UI (f49d99ee)
- docs: localize operational focus UI (67472a50)
- test(operational-twin): lock operational focus UI boundary (0ce2fa4f)
- test(operational-twin): fix focus UI fetch assertion (129d8ce2)
- Merge pull request #392 from Boym323/feat/aircraft-operational-focus-ui-v1 (bb2b4880)
- feat(operational-focus-map): sync components/aircraft-operational-twin.module.css (09cf3299)
- feat(operational-focus-map): sync components/aircraft-operational-twin.tsx (e597dbb7)
- feat(operational-focus-map): sync components/airradar-app.tsx (0bc55040)
- feat(operational-focus-map): sync docs/OPERATIONAL-DIGITAL-TWIN.md (0bf0e4ac)
- feat(operational-focus-map): sync docs/cs/OPERATIONAL-DIGITAL-TWIN.md (b120bb79)
- feat(operational-focus-map): sync lib/i18n/cs.ts (e6085faf)
- feat(operational-focus-map): sync lib/i18n/en.ts (2472af04)
- feat(operational-focus-map): add lib/operational-twin/aircraft-operational-focus-ui.ts (dcfe7101)
- feat(operational-focus-map): sync lib/operational-twin/index.ts (9278026b)
- feat(operational-focus-map): add tests/aircraft-operational-focus-map.test.ts (720dd277)
- feat(operational-focus-map): sync tests/aircraft-operational-focus-ui-boundary.test.ts (a43f0fd6)
- fix(operational-twin): type focus radar href (45325ac3)
- fix(radar): narrow available focus twin (0362effc)
- fix(operational-twin): keep focus UI client import bounded (314b5ac7)
- Merge pull request #393 from Boym323/feat/aircraft-operational-focus-map-v1 (495843a4)
- feat(radar): add operational focus map callout (014ebe6c)
- style(radar): add operational focus map callout (a06f0fea)
- feat(operational-twin): add focus clear radar href (e1793527)
- feat(i18n): add operational focus radar callout copy (e18fd7d9)
- feat(i18n): localize operational focus radar callout (6021e3ec)
- feat(radar): show active operational focus callout (2ddd0145)
- test(operational-twin): cover focus clear href (e416bc08)
- test(radar): lock operational focus callout boundary (8baf3450)
- docs: document operational focus radar callout (63669596)
- docs: localize operational focus radar callout (15e83cd7)
- test(radar): fix focus callout clear assertion (118d75de)
- chore(metadata): sync generated repository metadata (44fd36ca)
- docs: backfill missing release changelog entries (fb79e7ed)
- docs: keep changelog aligned with published tags (647909ac)
- Merge pull request #390 from Boym323/release/v1.0.324 (745e10de)
- chore(metadata): sync generated repository metadata (9bb91069)
- Merge pull request #394 from Boym323/feat/aircraft-operational-focus-map-callout-v1 (94f2985a)
- feat(radar): add operational focus drawer summary (b248c901)
- style(radar): add operational focus drawer summary (b238f8a9)
- feat(i18n): add operational focus drawer copy (f2cb32aa)
- feat(i18n): localize operational focus drawer copy (9aada61e)
- feat(radar): surface operational focus in aircraft drawer (2bd245cb)
- feat(radar): pass operational focus through drawer boundary (33f44f55)
- feat(radar): wire drawer focus actions to existing map projection (a60dc846)
- test(radar): cover operational focus drawer boundary (c69a81d0)
- docs: document operational focus drawer (93d22571)
- docs: localize operational focus drawer (6c9abe7f)
- fix(radar): scope operational focus kicker style (d9af19fa)
- Merge pull request #385 from Boym323/automation/repository-metadata (60a70044)
- Merge pull request #395 from Boym323/feat/aircraft-operational-focus-drawer-v1 (777a2a36)
- feat(radar): keep active focus visible in compact drawer (3a0fb112)
- feat(radar): reveal Situation tab for map-focused context (a4b33366)
- feat(radar): pass focus reveal signal through drawer (51c8bd5b)
- feat(radar): reveal operational focus drawer from map click (ba4b5b15)
- test(radar): cover operational focus map drawer sync (3ee5994c)
- docs: document operational focus map drawer sync (ec8fbb2a)
- docs: localize operational focus map drawer sync (31901b21)
- Merge pull request #397 from Boym323/feat/aircraft-operational-focus-map-drawer-sync-v1 (a1fd2642)
- fix(deploy): include ATS datasets in standalone runtime (38e7fb09)
- Merge pull request #399 from Boym323/fix/standalone-ats-runtime (fded5c93)
- test: align quick detail contract with focus sync (73cd68f0)
- Merge pull request #400 from Boym323/fix/update-quick-detail-contract-test (e3f2c74e)
- fix(deploy): allow ATS recovery releases (eb695121)
- Merge pull request #401 from Boym323/fix/allow-ats-recovery-release (597f8d66)

</details>

## [1.0.325] - 2026-10-06

Changes since v1.0.324.

**Features touched:** Operational Digital Twin.

### Added

- Add aircraft operational focus (69ddabbe)
- Expose operational focus contract (7ebb3d74)
- Export operational focus builder (27405d37)
- Assemble aircraft operational focus (6d53fd21)

### Fixed

- Widen focus event flatMap inference (537c2673)

### Documentation

- Localize aircraft operational focus (4f4046d2)
- Document aircraft operational focus (eea076fa)

### Maintenance

- Cover aircraft operational focus (b8b654bb)
- Lock operational focus boundary (30e9c79e)
- Type focus event labels as strings (bd916c9d)

<details>
<summary>Technical commits</summary>

- feat(operational-twin): add aircraft operational focus (69ddabbe)
- test(operational-twin): cover aircraft operational focus (b8b654bb)
- test(operational-twin): lock operational focus boundary (30e9c79e)
- feat(operational-twin): expose operational focus contract (7ebb3d74)
- feat(operational-twin): export operational focus builder (27405d37)
- feat(operational-twin): assemble aircraft operational focus (6d53fd21)
- docs: localize aircraft operational focus (4f4046d2)
- docs: document aircraft operational focus (eea076fa)
- fix(operational-twin): widen focus event flatMap inference (537c2673)
- test(operational-twin): type focus event labels as strings (bd916c9d)
- Merge pull request #391 from Boym323/feat/aircraft-operational-focus-v1 (409d2d4b)

</details>

## [1.0.324] - 2026-10-06

Changes since v1.0.323.

### Added

- Consolidate calibration and regional attention stack (5fe7ef47)

### Fixed

- Bootstrap artifact deploy and metadata validation (b7fc6aa5)
- Gate standalone runtime on prepared assets (43500284)
- Restore locked Prisma tooling on production (a6094147)

### Maintenance

- Optimize validation and production release pipeline (58adbc81)

<details>
<summary>Technical commits</summary>

- ci: optimize validation and production release pipeline (58adbc81)
- fix(ci): bootstrap artifact deploy and metadata validation (b7fc6aa5)
- feat: consolidate calibration and regional attention stack (5fe7ef47)
- fix(deploy): gate standalone runtime on prepared assets (43500284)
- fix(deploy): restore locked Prisma tooling on production (a6094147)

</details>

## [1.0.323] - 2026-10-06

Changes since v1.0.322.

**Features touched:** Operational Digital Twin, System Observability.

### Added

- Add prospective outcome validator (4ac1b8a5)
- Export outcome validator (2d36f29a)
- Wire outcome validation into live state (cdd7b867)
- Persist regional attention outcome aggregates (e996946b)
- Capture prospective outcome samples (6cd43e68)
- Add admin outcome diagnostics endpoint (50649050)
- Expose regional attention outcome diagnostics (8ae8efa3)
- Add Regional Attention Outcome Validation V1 (#373) (7a65fd98)

### Changed

- Export elevated truth thresholds (97e5ab6c)

### Fixed

- Normalize exported elevated thresholds (79a47150)
- Avoid empty calibration buckets (1dd3ae64)
- Sample Digital Twin calibration from receiver refresh (12a23503)
- Expose refresh-driven calibration sampling (89098bca)

### Documentation

- Document outcome validation V1 (e8afef72)
- Document outcome validation V1 (79af70a8)
- Document outcome validation V1 (2360a200)
- Document outcome validation V1 (2c08751b)
- Register regional attention outcome V1 (36a2a83b)
- Regenerate regional attention outcome summary (f5a262a0)

### Maintenance

- Cover prospective outcome validation (1e111ff5)
- Lock outcome validation boundaries (7e27f686)
- Lock refresh-driven calibration sampling boundary (66cf9790)
- Bump source-map-js to patched 1.2.2 (3a0f7508)

<details>
<summary>Technical commits</summary>

- feat(regional-attention): add prospective outcome validator (4ac1b8a5)
- refactor(regional-situation): export elevated truth thresholds (97e5ab6c)
- fix(regional-situation): normalize exported elevated thresholds (79a47150)
- feat(regional-attention): export outcome validator (2d36f29a)
- feat(regional-attention): wire outcome validation into live state (cdd7b867)
- feat(calibration): persist regional attention outcome aggregates (e996946b)
- feat(regional-attention): capture prospective outcome samples (6cd43e68)
- feat(regional-attention): add admin outcome diagnostics endpoint (50649050)
- feat(system): expose regional attention outcome diagnostics (8ae8efa3)
- test(regional-attention): cover prospective outcome validation (1e111ff5)
- test(regional-attention): lock outcome validation boundaries (7e27f686)
- docs(regional-attention): document outcome validation V1 (e8afef72)
- docs(regional-attention): document outcome validation V1 (79af70a8)
- docs(regional-attention): document outcome validation V1 (2360a200)
- docs(regional-attention): document outcome validation V1 (2c08751b)
- docs(features): register regional attention outcome V1 (36a2a83b)
- docs(features): regenerate regional attention outcome summary (f5a262a0)
- fix(regional-attention): avoid empty calibration buckets (1dd3ae64)
- feat: add Regional Attention Outcome Validation V1 (#373) (7a65fd98)
- fix: sample Digital Twin calibration from receiver refresh (12a23503)
- fix: expose refresh-driven calibration sampling (89098bca)
- test: lock refresh-driven calibration sampling boundary (66cf9790)
- chore: bump source-map-js to patched 1.2.2 (3a0f7508)
- Merge pull request #383 from Boym323/fix/digital-twin-calibration-sampling-v1 (f0709c6d)

</details>

## [1.0.322] - 2026-10-05

Changes since v1.0.321.

### Added

- Add Digital Twin Truth-first Validation V2 (#371) (6397a586)

### Maintenance

- Sync generated repository metadata (#370) (0ee56540)
- Split PR and release validation (ac0534d1)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#370) (0ee56540)
- feat: add Digital Twin Truth-first Validation V2 (#371) (6397a586)
- ci: split PR and release validation (ac0534d1)
- Merge pull request #372 from Boym323/ci/optimize-pr-main-validation (4100abb9)

</details>

## [1.0.321] - 2026-10-05

Changes since v1.0.320.

**Features touched:** Live Radar.

### Added

- Add Regional Operations Center V1 (#368) (2f930db)

### Fixed

- Stabilize command palette browser gate (#369) (a345357)

### Maintenance

- Sync generated repository metadata (#367) (16fa59b)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#367) (16fa59b)
- feat: add Regional Operations Center V1 (#368) (2f930db)
- fix: stabilize command palette browser gate (#369) (a345357)

</details>

## [1.0.320] - 2026-10-05

Changes since v1.0.319.

**Features touched:** Operational Digital Twin.

### Added

- Add Digital Twin calibration persistence V1 (#361) (85db97d)

### Maintenance

- Sync generated repository metadata (#365) (5862e1b)
- Update migration chain gate for calibration persistence (#366) (32042a9)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#365) (5862e1b)
- feat: add Digital Twin calibration persistence V1 (#361) (85db97d)
- test: update migration chain gate for calibration persistence (#366) (32042a9)

</details>

## [1.0.319] - 2026-10-05

Changes since v1.0.318.

### Added

- Add Digital Twin wind timing promotion V1 (#360) (a69c852)

### Maintenance

- Sync generated repository metadata (#364) (86d8f20)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#364) (86d8f20)
- feat: add Digital Twin wind timing promotion V1 (#360) (a69c852)

</details>

## [1.0.318] - 2026-10-05

Changes since v1.0.317.

### Added

- Add Digital Twin truth-first validation V1 (#359) (61426b3)

### Maintenance

- Sync generated repository metadata (#363) (2842c33)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#363) (2842c33)
- feat: add Digital Twin truth-first validation V1 (#359) (61426b3)

</details>

## [1.0.317] - 2026-10-05

Changes since v1.0.316.

**Features touched:** Operational Digital Twin.

### Added

- Add Operational Attention V1 (#358) (da4e0e8)

### Maintenance

- Sync generated repository metadata (#362) (1a91e33)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#362) (1a91e33)
- feat: add Operational Attention V1 (#358) (da4e0e8)

</details>

## [1.0.316] - 2026-10-05

Changes since v1.0.315.

**Features touched:** Operational Digital Twin.

### Added

- Add Regional Situation Graph V1 (#357) (54b072b)

### Maintenance

- Sync generated repository metadata (#356) (97d8508)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#356) (97d8508)
- feat: add Regional Situation Graph V1 (#357) (54b072b)

</details>

## [1.0.315] - 2026-10-05

Changes since v1.0.314.

**Features touched:** Operational Digital Twin.

### Added

- Add Digital Twin wind timing graduation V1 (#355) (f6cb190)

### Maintenance

- Sync generated repository metadata (#354) (a6323a6)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#354) (a6323a6)
- feat: add Digital Twin wind timing graduation V1 (#355) (f6cb190)

</details>

## [1.0.314] - 2026-10-05

Changes since v1.0.313.

**Features touched:** Navigation Integrity, Operational Digital Twin.

### Added

- Add Navigation Integrity Corridor V1 (#353) (851683b)

### Maintenance

- Sync generated repository metadata (#352) (16a779a)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#352) (16a779a)
- feat: add Navigation Integrity Corridor V1 (#353) (851683b)

</details>

## [1.0.313] - 2026-10-05

Changes since v1.0.312.

**Features touched:** Operational Digital Twin.

### Added

- Add Operational Digital Twin Event Outcome Validation V2 (#351) (30dd308)

### Maintenance

- Sync generated repository metadata (#350) (e01f744)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#350) (e01f744)
- feat: add Operational Digital Twin Event Outcome Validation V2 (#351) (30dd308)

</details>

## [1.0.312] - 2026-10-05

Changes since v1.0.311.

**Features touched:** Operational Digital Twin.

### Added

- Add Digital Twin wind-adjusted timing shadow (#347) (6a714ac)

### Maintenance

- Sync generated repository metadata (#346) (f6f06f2)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#346) (f6f06f2)
- feat: add Digital Twin wind-adjusted timing shadow (#347) (6a714ac)

</details>

## [1.0.311] - 2026-10-05

Changes since v1.0.310.

**Features touched:** Operational Digital Twin.

### Added

- Add Operational Digital Twin Outcome Validation V1 (#345) (b18aba6)

### Maintenance

- Sync generated repository metadata (#344) (ad90edd)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#344) (ad90edd)
- feat: add Operational Digital Twin Outcome Validation V1 (#345) (b18aba6)

</details>

## [1.0.310] - 2026-10-05

Changes since v1.0.309.

**Features touched:** Operational Digital Twin.

### Added

- Add Operational Digital Twin V2 map corridor (#343) (71969af)

### Maintenance

- Sync generated repository metadata (#342) (72d2920)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#342) (72d2920)
- feat: add Operational Digital Twin V2 map corridor (#343) (71969af)

</details>

## [1.0.309] - 2026-10-05

Changes since v1.0.308.

**Features touched:** Track Fusion Shadow.

### Added

- Add Track Fusion Outcome Validation V1 (#341) (82e85fe)

### Maintenance

- Sync generated repository metadata (#340) (63f3782)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#340) (63f3782)
- feat: add Track Fusion Outcome Validation V1 (#341) (82e85fe)

</details>

## [1.0.308] - 2026-10-05

Changes since v1.0.307.

**Features touched:** OGN / FLARM.

### Added

- Add Weather Avoidance Intelligence V1 (#339) (f47469b)

### Fixed

- Unify ADS-B and OGN radar labels (#338) (d8c7cc0)

### Maintenance

- Sync generated repository metadata (#337) (1170631)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#337) (1170631)
- feat: add Weather Avoidance Intelligence V1 (#339) (f47469b)
- fix: unify ADS-B and OGN radar labels (#338) (d8c7cc0)

</details>

## [1.0.307] - 2026-10-05

Changes since v1.0.306.

**Features touched:** Track Fusion Shadow.

### Added

- Add Track Fusion Readiness / Graduation V1 (#336) (b57c155)

### Maintenance

- Sync generated repository metadata (#335) (64e2f44)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#335) (64e2f44)
- feat: add Track Fusion Readiness / Graduation V1 (#336) (b57c155)

</details>

## [1.0.306] - 2026-10-05

Changes since v1.0.305.

**Features touched:** Track Fusion Shadow.

### Added

- Add Track Fusion Shadow V1 (#334) (77fc77d)

### Maintenance

- Sync generated repository metadata (#333) (8ed7ded)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#333) (8ed7ded)
- feat: add Track Fusion Shadow V1 (#334) (77fc77d)

</details>

## [1.0.305] - 2026-10-05

Changes since v1.0.304.

**Features touched:** Trajectory Conformance.

### Added

- Add Trajectory Conformance V1 (#332) (b0bd6d9)

### Maintenance

- Sync generated repository metadata (#330) (8186a85)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#330) (8186a85)
- feat: add Trajectory Conformance V1 (#332) (b0bd6d9)

</details>

## [1.0.304] - 2026-10-05

Changes since v1.0.303.

**Features touched:** Operational Digital Twin.

### Added

- Add Weather Corridor Intelligence V1 (#328) (cf50f71)

### Maintenance

- Sync generated repository metadata (#327) (d973ee5)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#327) (d973ee5)
- feat: add Weather Corridor Intelligence V1 (#328) (cf50f71)

</details>

## [1.0.303] - 2026-10-05

Changes since v1.0.302.

**Features touched:** Aircraft & Flight Detail, Live Radar, Map Context & Weather, Operational Digital Twin.

### Added

- Define Operational Digital Twin V1 contracts (3b51fd38)
- Add route-aware 4D trajectory corridor (e4406241)
- Add 4D operational intersection event engine (976ee6b4)
- Compose Operational Digital Twin V1 situation (514df910)
- Add Operational Twin API unavailable contract (63b6a107)
- Assemble bounded Operational Digital Twin V1 (13b34e46)
- Expose bounded aircraft situation API (8f15190c)
- Add explainable Aviation Weather Fusion V1 engine (370e6bb6)
- Add aircraft Operational Twin V1 panel (824eb620)
- Orchestrate fail-soft weather fusion sources (1e951e55)
- Expose Aircraft Weather Fusion V1 API (11ad8554)
- Add Operational Twin V1 to aircraft detail (dc3b3c11)
- Add explainable aircraft Weather Fusion card (9fc9e2a5)
- Surface Weather Fusion on aircraft detail (8b6c3f80)
- Make Operational Twin limitations machine-readable (4f1b1e83)
- Emit stable Operational Twin limitation codes (dd618b1b)
- Add Route Corridor Intelligence V1 (#326) (534d013b)

### Changed

- Expose planned airspace snapshot for bounded consumers (c05c82b8)
- I18n: add Operational Twin V1 copy cs (247a1e90)
- I18n: add Operational Twin V1 copy en (57a7f9e4)
- I18n: add Czech Weather Fusion V1 copy (4f363fd1)
- I18n: add English Weather Fusion V1 copy (baf3ee35)
- I18n: localize Operational Twin limitations cs (130c1449)
- I18n: localize Operational Twin limitations en (40f93a1e)
- Decouple fusion METAR evidence from map cache (2e6379e3)

### Fixed

- Make Operational Twin API response discriminated (75bfdf67)
- Require available corridor for twin situation (33e4a0b7)
- Keep Operational Twin event references bounded (db33daa4)
- Fail closed when fusion risk coverage is incomplete (9e7d7855)
- Tighten Weather Fusion freshness and METAR evidence (3556c734)
- Localize Operational Twin limitation codes (8bd149c1)
- Respect planned airspace vertical windows (fb856799)
- Include invalid aircraft in twin API contract (eea1712b)
- Use per-airport METAR cache for Weather Fusion (da3745d2)
- Make available twin corridor non-null (476224a0)
- Report contextual fusion source availability accurately (01dbbdd2)
- Narrow nullable METAR before fusion mapping (d9d4a9fb)
- Respect aviation weather disablement in fusion PIREP path (5bfd2035)
- Preserve AUP plan narrowing in twin events (3e38bd67)
- Fuse latest weather evidence per field and bound METAR icing (50f72862)
- Preserve both aircraft weather source classes in fusion (3850c125)
- Surface stale aircraft weather sources in fusion (a9b59e1b)

### Performance

- Reuse cached prepared ATC dataset in Digital Twin (06708842)

### Documentation

- Add Operational Digital Twin V1 design (3c282973)
- Add Operational Digital Twin V1 design cs (4feaf1c1)
- Register Operational Digital Twin V1 (e84610d6)
- Expose Operational Digital Twin V1 feature (7bab7daa)
- Document Operational Twin V1 cs (3c0dac8e)
- Document Operational Twin V1 runtime (3e34a8cb)
- Document Operational Twin V1 cs (7413ab62)
- Document Operational Twin V1 runtime (5b0a9056)
- Document Operational Twin V1 cs (21e6777c)
- Document Operational Twin V1 runtime (4e5b2ee0)
- Document Operational Twin V1 cs (6ccd3283)
- Register Aviation Weather Fusion V1 (b7968980)
- Document Aviation Weather Fusion V1 (a001c328)
- Localize Aviation Weather Fusion V1 (b9ca9b6d)
- Describe Weather Fusion model comparison (d8c0283f)
- Localize Weather Fusion model comparison (26669ae7)
- Synchronize Czech feature registry table (103f015b)

### Maintenance

- Sync generated repository metadata (#323) (3441ba1d)
- Add Operational Twin V1 timeline (8dc64bcf)
- Cover Operational Twin V1 corridor (5c8303b9)
- Cover Operational Twin V1 intersections (30c01563)
- Lock Operational Twin V1 boundaries (6a86f073)
- Add Weather Fusion V1 aircraft card (c14110a3)
- Cover Aviation Weather Fusion V1 evidence rules (5d72f1a6)
- Lock Aviation Weather Fusion V1 boundaries (83517b02)
- Clean Weather Fusion orchestration (c5cdb50c)
- Align Weather Fusion METAR fixture with service contract (2b613456)
- Cover fusion freshness and conservative METAR parsing (6a3cc14b)
- Cover per-field fusion and METAR altitude boundary (fe9997e3)
- Remove obsolete fusion latest-row variable (202b6133)
- Simplify fusion aircraft source state (beaaed94)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#323) (3441ba1d)
- feat: define Operational Digital Twin V1 contracts (3b51fd38)
- feat: add route-aware 4D trajectory corridor (e4406241)
- feat: add 4D operational intersection event engine (976ee6b4)
- feat: compose Operational Digital Twin V1 situation (514df910)
- refactor: expose planned airspace snapshot for bounded consumers (c05c82b8)
- feat: add Operational Twin API unavailable contract (63b6a107)
- feat: assemble bounded Operational Digital Twin V1 (13b34e46)
- feat: expose bounded aircraft situation API (8f15190c)
- i18n: add Operational Twin V1 copy cs (247a1e90)
- i18n: add Operational Twin V1 copy en (57a7f9e4)
- fix: make Operational Twin API response discriminated (75bfdf67)
- fix: require available corridor for twin situation (33e4a0b7)
- feat: add explainable Aviation Weather Fusion V1 engine (370e6bb6)
- feat: add aircraft Operational Twin V1 panel (824eb620)
- style: add Operational Twin V1 timeline (8dc64bcf)
- feat: orchestrate fail-soft weather fusion sources (1e951e55)
- feat: expose Aircraft Weather Fusion V1 API (11ad8554)
- feat: add Operational Twin V1 to aircraft detail (dc3b3c11)
- i18n: add Czech Weather Fusion V1 copy (4f363fd1)
- i18n: add English Weather Fusion V1 copy (baf3ee35)
- feat: add explainable aircraft Weather Fusion card (9fc9e2a5)
- feat: surface Weather Fusion on aircraft detail (8b6c3f80)
- test: cover Operational Twin V1 corridor (5c8303b9)
- test: cover Operational Twin V1 intersections (30c01563)
- test: lock Operational Twin V1 boundaries (6a86f073)
- fix: keep Operational Twin event references bounded (db33daa4)
- style: add Weather Fusion V1 aircraft card (c14110a3)
- fix: fail closed when fusion risk coverage is incomplete (9e7d7855)
- docs: add Operational Digital Twin V1 design (3c282973)
- docs: add Operational Digital Twin V1 design cs (4feaf1c1)
- test: cover Aviation Weather Fusion V1 evidence rules (5d72f1a6)
- test: lock Aviation Weather Fusion V1 boundaries (83517b02)
- docs: register Operational Digital Twin V1 (e84610d6)
- docs: expose Operational Digital Twin V1 feature (7bab7daa)
- docs: document Operational Twin V1 cs (3c0dac8e)
- docs: document Operational Twin V1 runtime (3e34a8cb)
- docs: document Operational Twin V1 cs (7413ab62)
- docs: document Operational Twin V1 runtime (5b0a9056)
- docs: document Operational Twin V1 cs (21e6777c)
- docs: document Operational Twin V1 runtime (4e5b2ee0)
- docs: document Operational Twin V1 cs (6ccd3283)
- feat: make Operational Twin limitations machine-readable (4f1b1e83)
- feat: emit stable Operational Twin limitation codes (dd618b1b)
- fix: tighten Weather Fusion freshness and METAR evidence (3556c734)
- i18n: localize Operational Twin limitations cs (130c1449)
- i18n: localize Operational Twin limitations en (40f93a1e)
- chore: clean Weather Fusion orchestration (c5cdb50c)
- fix: localize Operational Twin limitation codes (8bd149c1)
- docs: register Aviation Weather Fusion V1 (b7968980)
- fix: respect planned airspace vertical windows (fb856799)
- docs: document Aviation Weather Fusion V1 (a001c328)
- docs: localize Aviation Weather Fusion V1 (b9ca9b6d)
- perf: reuse cached prepared ATC dataset in Digital Twin (06708842)
- fix: include invalid aircraft in twin API contract (eea1712b)
- refactor: decouple fusion METAR evidence from map cache (2e6379e3)
- fix: use per-airport METAR cache for Weather Fusion (da3745d2)
- test: align Weather Fusion METAR fixture with service contract (2b613456)
- docs: describe Weather Fusion model comparison (d8c0283f)
- docs: localize Weather Fusion model comparison (26669ae7)
- fix: make available twin corridor non-null (476224a0)
- test: cover fusion freshness and conservative METAR parsing (6a3cc14b)
- fix: report contextual fusion source availability accurately (01dbbdd2)
- docs: synchronize Czech feature registry table (103f015b)
- fix: narrow nullable METAR before fusion mapping (d9d4a9fb)
- fix: respect aviation weather disablement in fusion PIREP path (5bfd2035)
- fix: preserve AUP plan narrowing in twin events (3e38bd67)
- fix: fuse latest weather evidence per field and bound METAR icing (50f72862)
- fix: preserve both aircraft weather source classes in fusion (3850c125)
- test: cover per-field fusion and METAR altitude boundary (fe9997e3)
- fix: surface stale aircraft weather sources in fusion (a9b59e1b)
- feat: add Route Corridor Intelligence V1 (#326) (534d013b)
- chore: remove obsolete fusion latest-row variable (202b6133)
- chore: simplify fusion aircraft source state (beaaed94)
- Merge pull request #324 from Boym323/feat/operational-digital-twin-v1 (2864664d)
- merge main into aviation weather fusion (4fc37a94)
- Merge pull request #325 from Boym323/feat/aviation-weather-fusion-v1 (0eca12cc)

</details>

## [1.0.302] - 2026-10-05

Changes since v1.0.301.

### Added

- Add Aviation Nav Data V1 (#321) (03e17c01)

### Maintenance

- Sync generated repository metadata (#322) (9027a4b0)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#322) (9027a4b0)
- feat: add Aviation Nav Data V1 (#321) (03e17c01)

</details>

## [1.0.301] - 2026-10-05

Changes since v1.0.300.

### Added

- Add V8 approach queue state (#319) (76a18b98)

### Maintenance

- Sync generated repository metadata (#318) (54d02adb)
- Bump vite from 8.3.1 to 8.3.2 (#316) (4d18665d)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#318) (54d02adb)
- chore(deps-dev): bump vite from 8.3.1 to 8.3.2 (#316) (4d18665d)
- feat: add V8 approach queue state (#319) (76a18b98)

</details>

## [1.0.300] - 2026-10-05

Changes since v1.0.299.

**Features touched:** Airport Intelligence, Map Context & Weather, System Observability.

### Added

- Add PIREP / AIREP Intelligence V1 (#306) (b53bfcd8)
- Complete Airport Live Board V7 with arrival sequence (#307) (1890fa7e)
- Add Airport Live Board V8 arrival flow intelligence (#310) (1a0dcaac)
- Add Aircraft Continuity Guard V2 (#314) (9a0a6022)

### Fixed

- Preserve aircraft continuity across transient source gaps (#312) (0545042b)

### Maintenance

- Sync generated repository metadata (#308) (59980859)
- Align Airport Intelligence boundary with V8 (#315) (2647506a)

<details>
<summary>Technical commits</summary>

- feat: add PIREP / AIREP Intelligence V1 (#306) (b53bfcd8)
- chore(metadata): sync generated repository metadata (#308) (59980859)
- feat: complete Airport Live Board V7 with arrival sequence (#307) (1890fa7e)
- feat: add Airport Live Board V8 arrival flow intelligence (#310) (1a0dcaac)
- fix: preserve aircraft continuity across transient source gaps (#312) (0545042b)
- feat: add Aircraft Continuity Guard V2 (#314) (9a0a6022)
- test: align Airport Intelligence boundary with V8 (#315) (2647506a)

</details>

## [1.0.299] - 2026-10-04

Changes since v1.0.298.

**Features touched:** Airport Intelligence, Receiver Coverage, Watchlist, Alerts & Fleet.

### Added

- Add Receiver Coverage Intelligence V2 (#300) (541bc789)
- Add Watchlist & Alerts V2 predictive notifications (#302) (7b53ae2a)
- Add Airport Live Board V7 runway stability (#303) (0f429418)

### Maintenance

- Sync generated repository metadata (#301) (f5046aa2)
- Align Receiver Coverage V1 boundary after V2 (#305) (de5a47d7)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#301) (f5046aa2)
- feat: add Receiver Coverage Intelligence V2 (#300) (541bc789)
- feat: add Watchlist & Alerts V2 predictive notifications (#302) (7b53ae2a)
- feat: add Airport Live Board V7 runway stability (#303) (0f429418)
- test: align Receiver Coverage V1 boundary after V2 (#305) (de5a47d7)

</details>

## [1.0.298] - 2026-10-04

Changes since v1.0.297.

**Features touched:** Airport Intelligence, Receiver Coverage, Watchlist, Alerts & Fleet.

### Added

- Add Airport Live Board V6 flow pressure (#297) (afae88b)
- Add Receiver Coverage Intelligence V1 (#298) (5719f2c)
- Complete Aircraft Watchlist & Alerts V1 (#299) (d99feee)

### Maintenance

- Sync generated repository metadata (#296) (556d6f1)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#296) (556d6f1)
- feat: add Airport Live Board V6 flow pressure (#297) (afae88b)
- feat: add Receiver Coverage Intelligence V1 (#298) (5719f2c)
- feat: complete Aircraft Watchlist & Alerts V1 (#299) (d99feee)

</details>

## [1.0.297] - 2026-10-04

Changes since v1.0.296.

### Added

- Complete Predictive Public Rollout V1 (#294) (175d4e7)

### Maintenance

- Sync generated repository metadata (#293) (7246853)
- Align predictive rollout boundary tests with shared engine (#295) (79d9e33)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#293) (7246853)
- feat: complete Predictive Public Rollout V1 (#294) (175d4e7)
- test: align predictive rollout boundary tests with shared engine (#295) (79d9e33)

</details>

## [1.0.296] - 2026-10-04

Changes since v1.0.295.

### Fixed

- Auto-merge repository metadata PRs (#291) (7f4d325)

### Maintenance

- Sync repository metadata (#260) (8653281)

<details>
<summary>Technical commits</summary>

- chore: sync repository metadata (#260) (8653281)
- fix: auto-merge repository metadata PRs (#291) (7f4d325)

</details>

## [1.0.295] - 2026-10-04

Changes since v1.0.294.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Live Board V5 flow pulse (#289) (3dad47e)

<details>
<summary>Technical commits</summary>

- feat: add Airport Live Board V5 flow pulse (#289) (3dad47e)

</details>

## [1.0.294] - 2026-10-04

Changes since v1.0.293.

### Added

- Add Runway Public Rollout V1 (#290) (acdb24b)

<details>
<summary>Technical commits</summary>

- feat: add Runway Public Rollout V1 (#290) (acdb24b)

</details>

## [1.0.293] - 2026-10-04

Changes since v1.0.292.

**Features touched:** Airport Intelligence.

### Added

- Complete Airport Live Board V4 with LANDED journey (#288) (1387cfe)

<details>
<summary>Technical commits</summary>

- feat: complete Airport Live Board V4 with LANDED journey (#288) (1387cfe)

</details>

## [1.0.292] - 2026-10-04

Changes since v1.0.291.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Live Board V4 active journey (#287) (08bc129)

<details>
<summary>Technical commits</summary>

- feat: add Airport Live Board V4 active journey (#287) (08bc129)

</details>

## [1.0.291] - 2026-10-04

Changes since v1.0.290.

### Added

- Add ETA Public Rollout V1 (#284) (4f97d56)

<details>
<summary>Technical commits</summary>

- feat: add ETA Public Rollout V1 (#284) (4f97d56)

</details>

## [1.0.290] - 2026-10-04

Changes since v1.0.289.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Live Board V3 flight correlation (#286) (b56ddbd)

<details>
<summary>Technical commits</summary>

- feat: add Airport Live Board V3 flight correlation (#286) (b56ddbd)

</details>

## [1.0.289] - 2026-10-04

Changes since v1.0.288.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Live Board V2 active traffic (#285) (0450ff5)

<details>
<summary>Technical commits</summary>

- feat: add Airport Live Board V2 active traffic (#285) (0450ff5)

</details>

## [1.0.288] - 2026-10-04

Changes since v1.0.287.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Live Board V1 (#283) (208b26a)

<details>
<summary>Technical commits</summary>

- feat: add Airport Live Board V1 (#283) (208b26a)

</details>

## [1.0.287] - 2026-10-04

Changes since v1.0.286.

**Features touched:** System Observability.

### Added

- Add Predictive Graduation Calibration V1 (#281) (1b159ab)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Graduation Calibration V1 (#281) (1b159ab)

</details>

## [1.0.286] - 2026-10-04

Changes since v1.0.285.

**Features touched:** System Observability.

### Added

- Add Predictive Outcome Truth V1 (#280) (4b65984)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Outcome Truth V1 (#280) (4b65984)

</details>

## [1.0.285] - 2026-10-04

Changes since v1.0.284.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add Predictive Trajectory Advisory V1 (#279) (db8902f)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Trajectory Advisory V1 (#279) (db8902f)

</details>

## [1.0.284] - 2026-10-04

Changes since v1.0.283.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add Predictive Runway Change Advisory V1 (#278) (46a5aa3)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Runway Change Advisory V1 (#278) (46a5aa3)

</details>

## [1.0.283] - 2026-10-04

Changes since v1.0.282.

**Features touched:** Live Radar.

### Added

- Add Predictive Operations Center V1 (#277) (a82daac)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Operations Center V1 (#277) (a82daac)

</details>

## [1.0.282] - 2026-10-04

Changes since v1.0.281.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add Predictive Runway Advisory V1 (#276) (4461ff0)

<details>
<summary>Technical commits</summary>

- feat: add Predictive Runway Advisory V1 (#276) (4461ff0)

</details>

## [1.0.281] - 2026-10-04

Changes since v1.0.280.

### Fixed

- Enforce freshness across public predictive capabilities (#275) (7616b67)

<details>
<summary>Technical commits</summary>

- fix: enforce freshness across public predictive capabilities (#275) (7616b67)

</details>

## [1.0.280] - 2026-10-04

Changes since v1.0.279.

**Features touched:** Aircraft & Flight Detail.

### Fixed

- Auto-expire stale Predictive ETA Advisory (#274) (2354b68)

<details>
<summary>Technical commits</summary>

- fix: auto-expire stale Predictive ETA Advisory (#274) (2354b68)

</details>

## [1.0.279] - 2026-10-04

Changes since v1.0.278.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add Predictive ETA Advisory V1 (#273) (3ccb994)

<details>
<summary>Technical commits</summary>

- feat: add Predictive ETA Advisory V1 (#273) (3ccb994)

</details>

## [1.0.278] - 2026-10-04

Changes since v1.0.277.

### Added

- Add global Command Search V1 palette (#270) (eeb3913)
- Add Command Search V2 historical flights and smart actions (#271) (733b455)
- Add Predictive Graduation Readiness V1 (#272) (bc8c45d)

<details>
<summary>Technical commits</summary>

- feat: add global Command Search V1 palette (#270) (eeb3913)
- feat: add Command Search V2 historical flights and smart actions (#271) (733b455)
- feat: add Predictive Graduation Readiness V1 (#272) (bc8c45d)

</details>

## [1.0.277] - 2026-10-04

Changes since v1.0.276.

**Features touched:** Airport Intelligence.

### Added

- Add Airport Intelligence V3 operations board (#269) (be43070)

<details>
<summary>Technical commits</summary>

- feat: add Airport Intelligence V3 operations board (#269) (be43070)

</details>

## [1.0.276] - 2026-10-04

Changes since v1.0.275.

### Changed

- Break network-to-artifact taint flow in radar benchmark (c4c5c04)

<details>
<summary>Technical commits</summary>

- security: break network-to-artifact taint flow in radar benchmark (c4c5c04)
- Merge pull request #268 from Boym323/security/codeql-radar-no-network-artifact-flow (c505038)

</details>

## [1.0.275] - 2026-10-04

Changes since v1.0.274.

### Fixed

- Place CodeQL suppressions on reported sinks (6aba004)

<details>
<summary>Technical commits</summary>

- fix: place CodeQL suppressions on reported sinks (6aba004)
- Merge pull request #267 from Boym323/security/codeql-medium-suppression-fix (522997a)

</details>

## [1.0.274] - 2026-10-04

Changes since v1.0.273.

### Changed

- Resolve CodeQL network-to-file finding in scripts/sync-tar1090-icons.mjs (aac536e)
- Resolve CodeQL network-to-file finding in scripts/audit-db-write-amplification.mjs (96074bc)
- Resolve CodeQL network-to-file finding in scripts/radar-performance-baseline.mjs (e0d4838)

<details>
<summary>Technical commits</summary>

- security: resolve CodeQL network-to-file finding in scripts/sync-tar1090-icons.mjs (aac536e)
- security: resolve CodeQL network-to-file finding in scripts/audit-db-write-amplification.mjs (96074bc)
- security: resolve CodeQL network-to-file finding in scripts/radar-performance-baseline.mjs (e0d4838)
- Merge pull request #266 from Boym323/security/codeql-medium-cleanup (ae7f47b)

</details>

## [1.0.273] - 2026-10-04

Changes since v1.0.272.

**Features touched:** ATC & ATS Intelligence, OGN / FLARM.

### Changed

- Address CodeQL high finding in scripts/production-gates.mjs (1bba0c6)
- Address CodeQL high finding in tests/update-ogn-softrf.test.ts (e6cc497)
- Address CodeQL high finding in tests/ogn-softrf.test.ts (8b5624e)
- Address CodeQL high finding in tests/ogn-ddb-persistence.test.ts (3758770)
- Address CodeQL high finding in tests/alert-state.test.ts (d60a06d)
- Harden file IO in lib/server/runtime-telemetry.ts (cd0f924)
- Harden file IO in lib/server/aviation-weather-persistence.ts (f9e12c5)
- Harden file IO in lib/server/adsbdb-persistence.ts (31f9bce)
- Harden file IO in lib/ogn/ddb.ts (6cad5bc)
- Remove file TOCTOU in lib/server/alert-history.ts (e903451)
- Remove file TOCTOU in lib/procedures/repository.ts (2f27d04)
- Remove file TOCTOU in lib/ats/cz-routes.ts (da07eca)
- Remove file TOCTOU in lib/ats/sk-routes.ts (6fe640c)
- Remove file TOCTOU in lib/ats/at-routes.ts (cc88055)
- Remove file TOCTOU in lib/ogn/softrf.ts (5b11665)
- Fix strict URL token extraction (900a6dc)
- Normalize URL extraction regex (56fc41e)

### Fixed

- Restore post-write file size probe (cca1d99)

<details>
<summary>Technical commits</summary>

- security: address CodeQL high finding in scripts/production-gates.mjs (1bba0c6)
- security: address CodeQL high finding in tests/update-ogn-softrf.test.ts (e6cc497)
- security: address CodeQL high finding in tests/ogn-softrf.test.ts (8b5624e)
- security: address CodeQL high finding in tests/ogn-ddb-persistence.test.ts (3758770)
- security: address CodeQL high finding in tests/alert-state.test.ts (d60a06d)
- security: harden file IO in lib/server/runtime-telemetry.ts (cd0f924)
- security: harden file IO in lib/server/aviation-weather-persistence.ts (f9e12c5)
- security: harden file IO in lib/server/adsbdb-persistence.ts (31f9bce)
- security: harden file IO in lib/ogn/ddb.ts (6cad5bc)
- security: remove file TOCTOU in lib/server/alert-history.ts (e903451)
- security: remove file TOCTOU in lib/procedures/repository.ts (2f27d04)
- security: remove file TOCTOU in lib/ats/cz-routes.ts (da07eca)
- security: remove file TOCTOU in lib/ats/sk-routes.ts (6fe640c)
- security: remove file TOCTOU in lib/ats/at-routes.ts (cc88055)
- security: remove file TOCTOU in lib/ogn/softrf.ts (5b11665)
- security: fix strict URL token extraction (900a6dc)
- security: normalize URL extraction regex (56fc41e)
- fix: restore post-write file size probe (cca1d99)
- Merge pull request #265 from Boym323/security/codeql-high-cleanup (c5a2e18)

</details>

## [1.0.272] - 2026-10-04

Changes since v1.0.271.

### Added

- Add Flight Story V2 summary and narrative timeline (#264) (f7e5ca6)

<details>
<summary>Technical commits</summary>

- feat: add Flight Story V2 summary and narrative timeline (#264) (f7e5ca6)

</details>

## [1.0.271] - 2026-10-04

Changes since v1.0.270.

**Features touched:** Live Radar, Statistics & Recaps.

### Added

- Expand Operations Center with alerts and airport context (#262) (0aa1462)
- Add Daily Intelligence V2 to daily recap (#263) (35a5fe0)

<details>
<summary>Technical commits</summary>

- feat: expand Operations Center with alerts and airport context (#262) (0aa1462)
- feat: add Daily Intelligence V2 to daily recap (#263) (35a5fe0)

</details>

## [1.0.270] - 2026-10-03

Changes since v1.0.269.

**Features touched:** Live Radar.

### Added

- Add Operations Center V1 to live radar (#259) (b1bcd82)

### Maintenance

- Bump pdfjs-dist to 6.3.289 (9c8b4f0)
- Sync generated repository metadata (1812d47)

<details>
<summary>Technical commits</summary>

- chore(deps): bump pdfjs-dist to 6.3.289 (9c8b4f0)
- chore: sync generated repository metadata (1812d47)
- feat: add Operations Center V1 to live radar (#259) (b1bcd82)

</details>

## [1.0.269] - 2026-10-03

Changes since v1.0.268.

### Maintenance

- Bump dotenv from 17.4.2 to 18.0.5 (341d4da)

<details>
<summary>Technical commits</summary>

- chore(deps-dev): bump dotenv from 17.4.2 to 18.0.5 (341d4da)
- Merge pull request #251 from Boym323/dependabot/npm_and_yarn/dotenv-18.0.5 (d005d94)

</details>

## [1.0.268] - 2026-10-03

Changes since v1.0.267.

### Maintenance

- Make coordinate redaction assertion deterministic (3d02ad7)

<details>
<summary>Technical commits</summary>

- test: make coordinate redaction assertion deterministic (3d02ad7)
- Merge pull request #253 from Boym323/test/system-status-coordinate-redaction (85dc7ac)

</details>

## [1.0.267] - 2026-10-03

Changes since v1.0.266.

### Maintenance

- Bump vite from 7.3.6 to 8.3.1 (0c4926a)

<details>
<summary>Technical commits</summary>

- chore(deps-dev): bump vite from 7.3.6 to 8.3.1 (0c4926a)
- Merge pull request #244 from Boym323/dependabot/npm_and_yarn/vite-8.3.1 (8e7c5f7)

</details>

## [1.0.266] - 2026-10-03

Changes since v1.0.265.

### Maintenance

- Sync generated repository metadata (6cdda41)
- Update GitHub Actions in ci-heavy.yml (ccabfe9)
- Update GitHub Actions in ci.yml (d291bcc)
- Update GitHub Actions in codeql.yml (556a2a1)
- Update GitHub Actions in radar-soak.yml (3050945)
- Update GitHub Actions in repository-metadata.yml (d10a11e)
- Refresh Vitest to 5.0.3 (c7ab817)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (6cdda41)
- Merge pull request #239 from Boym323/automation/repository-metadata (20c5d31)
- chore: update GitHub Actions in ci-heavy.yml (ccabfe9)
- chore: update GitHub Actions in ci.yml (d291bcc)
- chore: update GitHub Actions in codeql.yml (556a2a1)
- chore: update GitHub Actions in radar-soak.yml (3050945)
- chore: update GitHub Actions in repository-metadata.yml (d10a11e)
- chore: refresh Vitest to 5.0.3 (c7ab817)
- Merge pull request #250 from Boym323/chore/dependency-rollup-2026-10-03 (c2e8a23)

</details>

## [1.0.265] - 2026-10-03

Changes since v1.0.264.

### Changed

- Gate production dependency audit (a1636c8)
- Enable Dependabot updates (61d3d5b)
- Add CodeQL analysis (5c2769e)
- Upgrade PDF.js to patched 6.2.108 (52cf28c)
- Refresh patched PDF.js lockfile (f2b3473)
- Disable scripting in ATC PDF parsing (1489c0f)

### Fixed

- Use supported PDF.js extraction hardening (57951b7)
- Align ATC PDF parser with PDF.js 6 API (a5ed706)

<details>
<summary>Technical commits</summary>

- security: gate production dependency audit (a1636c8)
- security: enable Dependabot updates (61d3d5b)
- security: add CodeQL analysis (5c2769e)
- security: upgrade PDF.js to patched 6.2.108 (52cf28c)
- security: refresh patched PDF.js lockfile (f2b3473)
- security: disable scripting in ATC PDF parsing (1489c0f)
- fix: use supported PDF.js extraction hardening (57951b7)
- fix: align ATC PDF parser with PDF.js 6 API (a5ed706)
- Merge pull request #241 from Boym323/security/dependency-code-scanning (99b00bc)

</details>

## [1.0.264] - 2026-10-03

Changes since v1.0.263.

### Changed

- Upgrade Next.js to 16.3.8 (b1e50f2)
- Refresh Next.js 16.3.8 lockfile (690a63f)

<details>
<summary>Technical commits</summary>

- security: upgrade Next.js to 16.3.8 (b1e50f2)
- security: refresh Next.js 16.3.8 lockfile (690a63f)
- Merge pull request #240 from Boym323/security/next-16-3-8 (ddd8c7a)

</details>

## [1.0.263] - 2026-10-03

Changes since v1.0.262.

### Fixed

- Reconcile queued prospective drops (bf73ac2)
- Restore predictive status dropped counter (aa35c06)

### Maintenance

- Sync generated repository metadata (7e2a76f)
- Cover prospective multi-batch integrity drain (a1d6d53)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (7e2a76f)
- Merge pull request #235 from Boym323/automation/repository-metadata (920b6e6)
- fix: reconcile queued prospective drops (bf73ac2)
- fix: restore predictive status dropped counter (aa35c06)
- test: cover prospective multi-batch integrity drain (a1d6d53)
- Merge pull request #238 from Boym323/fix/prospective-accounting-contract (11da5cc)

</details>

## [1.0.262] - 2026-10-03

Changes since v1.0.261.

### Changed

- Instrument prospective attribution accounting (cdb1b78)

<details>
<summary>Technical commits</summary>

- Instrument prospective attribution accounting (cdb1b78)

</details>

## [1.0.261] - 2026-10-03

Changes since v1.0.260.

### Added

- Enhance prospective validation with improved timestamp validation and detailed invalid reason tracking (220289e)

<details>
<summary>Technical commits</summary>

- feat: enhance prospective validation with improved timestamp validation and detailed invalid reason tracking (220289e)

</details>

## [1.0.260] - 2026-10-03

Changes since v1.0.259.

**Features touched:** System Observability.

### Added

- Enhance system status metrics with integrity rejection and persistence suspension details (b32346f)

<details>
<summary>Technical commits</summary>

- feat: enhance system status metrics with integrity rejection and persistence suspension details (b32346f)

</details>

## [1.0.259] - 2026-10-03

Changes since v1.0.257.

### Added

- Implement RadarTrafficHero component and traffic presentation logic (a9fd6dc)
- Update RadarTrafficHero component and related tests for improved metric presentation and accessibility (74a5745)

### Documentation

- Update changelog for v1.0.258 (fcc9c81)

### Maintenance

- Add TypeScript SDK path to VSCode settings (b0ae168)
- Instrument prospective persistence failures (059a575)
- Align quick-detail production gate with traffic hero (501a224)

<details>
<summary>Technical commits</summary>

- chore: add TypeScript SDK path to VSCode settings (b0ae168)
- chore: instrument prospective persistence failures (059a575)
- Merge pull request #236 from Boym323/fix/predictive-persistence-diagnostics (b7ba764)
- feat: implement RadarTrafficHero component and traffic presentation logic (a9fd6dc)
- Merge remote-tracking branch 'origin/main' (fc97cb3)
- docs: update changelog for v1.0.258 (fcc9c81)
- test: align quick-detail production gate with traffic hero (501a224)
- feat: update RadarTrafficHero component and related tests for improved metric presentation and accessibility (74a5745)
- merge main into quick-detail hero contract (54163ce)
- Merge pull request #237 from Boym323/fix/quick-detail-hero-contract (d9f8f71)

</details>

## [1.0.257] - 2026-10-03

Changes since v1.0.256.

### Fixed

- Normalize predictive timestamp invariants (8e79d44)

### Maintenance

- Sync generated repository metadata (#233) (87d4dfe)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#233) (87d4dfe)
- fix: normalize predictive timestamp invariants (8e79d44)
- Merge pull request #234 from Boym323/fix/predictive-timestamp-invariant (afcf9e2)

</details>

## [1.0.256] - 2026-10-03

Changes since v1.0.255.

### Documentation

- Clarify release scope verification (8fc6548)

### Maintenance

- Sync generated repository metadata (#232) (eada2b6)
- Ignore generated predictive validation reports (364cdf3)

<details>
<summary>Technical commits</summary>

- docs: clarify release scope verification (8fc6548)
- chore(metadata): sync generated repository metadata (#232) (eada2b6)
- chore: ignore generated predictive validation reports (364cdf3)

</details>

## [1.0.255] - 2026-10-03

Changes since v1.0.254.

### Maintenance

- Sync generated repository metadata (#231) (7b3208a)
- Prevent production deploys for docs-only changes (6fd5d3e)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#231) (7b3208a)
- ci: prevent production deploys for docs-only changes (6fd5d3e)

</details>

## [1.0.254] - 2026-10-03

Changes since v1.0.253.

### Changed

- Fix predictive prospective validation DEV blockers (adf626f)

### Documentation

- Document isolated development database workflow (b1eea1e)

<details>
<summary>Technical commits</summary>

- fix predictive prospective validation DEV blockers (adf626f)
- docs: document isolated development database workflow (b1eea1e)

</details>

## [1.0.253] - 2026-10-03

Changes since v1.0.252.

### Added

- Implement prospective validation for predictive observations (622b2ae)

### Changed

- Refactor code structure for improved readability and maintainability (58e5d80)

<details>
<summary>Technical commits</summary>

- feat(predictive-intelligence): implement prospective validation for predictive observations (622b2ae)
- Refactor code structure for improved readability and maintainability (58e5d80)

</details>

## [1.0.252] - 2026-10-02

Changes since v1.0.251.

### Added

- Enhance predictive intelligence with destination proximity and runway handling (64fa09d)

<details>
<summary>Technical commits</summary>

- feat: enhance predictive intelligence with destination proximity and runway handling (64fa09d)

</details>

## [1.0.250] - 2026-10-02

Changes since v1.0.249.

### Changed

- Add tests for prospective predictive ground truth contracts (fb90f86)

### Fixed

- Harden prospective ground truth release gate (426847f)

### Documentation

- Record corrective ground truth release gate (514478d)
- Correct ground truth release identity (45ead80)
- Update changelog for v1.0.250 (b39afe9)

<details>
<summary>Technical commits</summary>

- Add tests for prospective predictive ground truth contracts (fb90f86)
- fix: harden prospective ground truth release gate (426847f)
- docs: record corrective ground truth release gate (514478d)
- docs: correct ground truth release identity (45ead80)
- docs: update changelog for v1.0.250 (b39afe9)

</details>

## [1.0.251] - 2026-10-02

Changes since v1.0.250.

**Features touched:** Map Context & Weather, System Observability.

### Fixed

- Map aircraft weather diagnostics into system status (ffbedacf)

### Documentation

- Finalize prospective ground truth release evidence (0cb25a43)
- Update health and performance metrics in ground truth release documentation (7f0aa8cf)

### Maintenance

- Sync generated repository metadata (#230) (e39efff1)

<details>
<summary>Technical commits</summary>

- docs: finalize prospective ground truth release evidence (0cb25a43)
- chore(metadata): sync generated repository metadata (#230) (e39efff1)
- docs: update health and performance metrics in ground truth release documentation (7f0aa8cf)
- Merge remote-tracking branch 'origin/main' (addcf94c)
- fix: map aircraft weather diagnostics into system status (ffbedacf)

</details>

## [1.0.249] - 2026-10-02

Changes since v1.0.248.

### Added

- Implement terminal ground truth classification and reporting (a2003e9)

<details>
<summary>Technical commits</summary>

- feat: implement terminal ground truth classification and reporting (a2003e9)

</details>

## [1.0.248] - 2026-10-02

Changes since v1.0.247.

### Added

- Add predictive intelligence v2 recovery script and related artifacts (7fda393)

<details>
<summary>Technical commits</summary>

- feat: add predictive intelligence v2 recovery script and related artifacts (7fda393)

</details>

## [1.0.247] - 2026-10-02

Changes since v1.0.246.

### Changed

- Add predictive intelligence V1 calibration script and update validation documentation (999d8b2)

<details>
<summary>Technical commits</summary>

- Add predictive intelligence V1 calibration script and update validation documentation (999d8b2)

</details>

## [1.0.246] - 2026-10-02

Changes since v1.0.245.

### Added

- Implement calibration contract, enhance replay functionality, and update related documentation (030b5cb)

<details>
<summary>Technical commits</summary>

- feat(predictive-intelligence): implement calibration contract, enhance replay functionality, and update related documentation (030b5cb)

</details>

## [1.0.245] - 2026-10-02

Changes since v1.0.244.

### Added

- Implement V1 predictive intelligence engine with state management, replay functionality, and associated tests (68d29e6)
- Enhance predictive capabilities with graduation policy and public API integration (97cd55d)

### Maintenance

- Sync generated repository metadata (#229) (567e55d)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (#229) (567e55d)
- feat(predictive-intelligence): implement V1 predictive intelligence engine with state management, replay functionality, and associated tests (68d29e6)
- feat(predictive-intelligence): enhance predictive capabilities with graduation policy and public API integration (97cd55d)

</details>

## [1.0.244] - 2026-10-02

Changes since v1.0.242.

**Features touched:** Navigation Integrity, Watchlist, Alerts & Fleet.

### Fixed

- Resolve canonical FlightEvent ids before occurrence persistence (8a82ed0)

### Documentation

- Update changelog for v1.0.243 (6c2b064)
- Record V1 corrective production pass (1575054)

<details>
<summary>Technical commits</summary>

- fix(alerts): resolve canonical FlightEvent ids before occurrence persistence (8a82ed0)
- docs: update changelog for v1.0.243 (6c2b064)
- docs(alerts): record V1 corrective production pass (1575054)

</details>

## [1.0.242] - 2026-10-02

Changes since v1.0.241.

**Features touched:** Watchlist, Alerts & Fleet.

### Added

- Implement Alerts & Fleets V1 with enhanced FlightEvent handling, corrective audits, and pagination support (201c181)

<details>
<summary>Technical commits</summary>

- feat: implement Alerts & Fleets V1 with enhanced FlightEvent handling, corrective audits, and pagination support (201c181)

</details>

## [1.0.241] - 2026-10-02

Changes since v1.0.240.

### Fixed

- Update production record to reflect BLOCKED status and detailed occurrence data (80a5116)

<details>
<summary>Technical commits</summary>

- fix: update production record to reflect BLOCKED status and detailed occurrence data (80a5116)

</details>

## [1.0.240] - 2026-10-02

Changes since v1.0.238.

**Features touched:** Watchlist, Alerts & Fleet.

### Documentation

- Update changelog for v1.0.238 (7dc0403)
- Update changelog for v1.0.239 (37086ce)
- Record Alerts & Fleets V1 production canary (355a0d3)

<details>
<summary>Technical commits</summary>

- docs: update changelog for v1.0.238 (7dc0403)
- docs: update changelog for v1.0.239 (37086ce)
- docs: record Alerts & Fleets V1 production canary (355a0d3)

</details>

## [1.0.237] - 2026-10-02

Changes since v1.0.236.

### Changed

- Refactor code structure for improved readability and maintainability (0c71fe2)

<details>
<summary>Technical commits</summary>

- Refactor code structure for improved readability and maintainability (0c71fe2)

</details>

## [1.0.236] - 2026-10-02

Changes since v1.0.235.

**Features touched:** Watchlist, Alerts & Fleet.

### Added

- Implement Alerts & Fleets V1 module with typed primitives, transition tracking, and geofence validation (b1cf782)

<details>
<summary>Technical commits</summary>

- feat: implement Alerts & Fleets V1 module with typed primitives, transition tracking, and geofence validation (b1cf782)

</details>

## [1.0.235] - 2026-10-02

Changes since v1.0.234.

### Added

- Adjust BROWSER_LIVE_TRAIL_MAX_POINTS to limit cache size and update test to reflect new logic (a8270bf)

<details>
<summary>Technical commits</summary>

- feat: adjust BROWSER_LIVE_TRAIL_MAX_POINTS to limit cache size and update test to reflect new logic (a8270bf)

</details>

## [1.0.234] - 2026-10-02

Changes since v1.0.233.

**Features touched:** Flight Intelligence.

### Added

- Update Flight Intelligence production report with new canary results and performance metrics, and correct generated timestamp (500da53)

<details>
<summary>Technical commits</summary>

- feat: update Flight Intelligence production report with new canary results and performance metrics, and correct generated timestamp (500da53)

</details>

## [1.0.233] - 2026-10-02

Changes since v1.0.232.

**Features touched:** Flight Intelligence.

### Added

- Enhance Flight Intelligence with new validation and corpus scripts, update database diagnostics, and improve event handling (39c29da)

<details>
<summary>Technical commits</summary>

- feat: enhance Flight Intelligence with new validation and corpus scripts, update database diagnostics, and improve event handling (39c29da)

</details>

## [1.0.232] - 2026-10-01

Changes since v1.0.231.

**Features touched:** Flight Intelligence.

### Documentation

- Record Flight Intelligence V1 validation (55a9c2a)

<details>
<summary>Technical commits</summary>

- docs: record Flight Intelligence V1 validation (55a9c2a)

</details>

## [1.0.231] - 2026-10-01

Changes since v1.0.230.

**Features touched:** Flight Intelligence.

### Added

- Extend Flight Intelligence with new events and detector versioning (95c7ba6)

<details>
<summary>Technical commits</summary>

- feat: extend Flight Intelligence with new events and detector versioning (95c7ba6)

</details>

## [1.0.230] - 2026-09-30

Changes since v1.0.229.

### Changed

- Add post-archive database baseline v2 JSON and markdown files (84b49fa)

<details>
<summary>Technical commits</summary>

- Add post-archive database baseline v2 JSON and markdown files (84b49fa)

</details>

## [1.0.229] - 2026-09-30

Changes since v1.0.228.

### Added

- Update I/O optimization artifacts with deployment details and performance metrics (f12940e)

### Documentation

- Update changelog for v1.0.228 (2bd4b8c)

<details>
<summary>Technical commits</summary>

- docs: update changelog for v1.0.228 (2bd4b8c)
- feat: update I/O optimization artifacts with deployment details and performance metrics (f12940e)

</details>

## [1.0.227] - 2026-09-30

Changes since v1.0.226.

### Added

- Add node write attribution v2 and v3 artifacts for enhanced tracking (d2cd370)
- Add node write attribution v4 artifacts for detailed tracking and analysis (21a9ee3)

### Maintenance

- Sync generated repository metadata (2952bf2)
- Stop auto-merging repository metadata (67953ab)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (2952bf2)
- Merge pull request #228 from Boym323/automation/repository-metadata (ab86b52)
- feat: add node write attribution v2 and v3 artifacts for enhanced tracking (d2cd370)
- ci: stop auto-merging repository metadata (67953ab)
- feat: add node write attribution v4 artifacts for detailed tracking and analysis (21a9ee3)

</details>

## [1.0.238] - 2026-10-02

Changes since v1.0.238.

No user-facing changes.

## [1.0.228] - 2026-09-30

Changes since v1.0.228.

No user-facing changes.

## [1.0.226] - 2026-09-30

Changes since v1.0.223.

### Added

- Enhance weather observation persistence with batch fallback mode and diagnostics (1aebb6f)
- Add integration tests and documentation for weather batch insert with PostgreSQL (dbea4b8)
- Add final post-optimization baseline and closure audit documentation (06e8aae)

### Documentation

- Update changelog for v1.0.224 (f110956)
- Update changelog for v1.0.225 (111a3c2)
- Record weather batch production comparison (2f64691)

### Maintenance

- Sync generated repository metadata (a993bb6)
- Sync generated repository metadata (3fa85cc)
- Sync generated repository metadata (95f56e5)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (a993bb6)
- Merge pull request #225 from Boym323/automation/repository-metadata (e67c150)
- feat: enhance weather observation persistence with batch fallback mode and diagnostics (1aebb6f)
- docs: update changelog for v1.0.224 (f110956)
- chore(metadata): sync generated repository metadata (3fa85cc)
- Merge pull request #226 from Boym323/automation/repository-metadata (740e723)
- feat: add integration tests and documentation for weather batch insert with PostgreSQL (dbea4b8)
- docs: update changelog for v1.0.225 (111a3c2)
- chore(metadata): sync generated repository metadata (95f56e5)
- Merge pull request #227 from Boym323/automation/repository-metadata (4db71dd)
- docs: record weather batch production comparison (2f64691)
- feat: add final post-optimization baseline and closure audit documentation (06e8aae)

</details>

## [1.0.223] - 2026-09-29

Changes since v1.0.222.

**Features touched:** Map Context & Weather.

### Added

- Add weather batch insert design documentation and schema (9ceeb7b)
- Implement batch insert for aircraft weather observations and enhance diagnostics (d231a31)

### Maintenance

- Sync generated repository metadata (f066890)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (f066890)
- Merge pull request #224 from Boym323/automation/repository-metadata (85a5321)
- feat: add weather batch insert design documentation and schema (9ceeb7b)
- feat: implement batch insert for aircraft weather observations and enhance diagnostics (d231a31)

</details>

## [1.0.222] - 2026-09-29

Changes since v1.0.221.

### Documentation

- Record final database attribution measurement (7ce3e84)

### Maintenance

- Sync generated repository metadata (2663ff4)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (2663ff4)
- Merge pull request #223 from Boym323/automation/repository-metadata (bbb2ca2)
- docs: record final database attribution measurement (7ce3e84)

</details>

## [1.0.221] - 2026-09-29

Changes since v1.0.220.

### Added

- Update application DB transaction attribution and autocommit operation attribution (b19ba46)

### Maintenance

- Sync generated repository metadata (737a794)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (737a794)
- Merge pull request #222 from Boym323/automation/repository-metadata (a3345d0)
- feat: update application DB transaction attribution and autocommit operation attribution (b19ba46)

</details>

## [1.0.220] - 2026-09-29

Changes since v1.0.219.

### Documentation

- Record autocommit attribution measurement (740ddd0)

### Maintenance

- Sync generated repository metadata (1d04380)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (1d04380)
- Merge pull request #221 from Boym323/automation/repository-metadata (7213030)
- docs(db): record autocommit attribution measurement (740ddd0)

</details>

## [1.0.219] - 2026-09-29

Changes since v1.0.218.

### Added

- Implement db operation tracking and diagnostics (06f8f7b)

### Maintenance

- Sync generated repository metadata (b0e1860)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (b0e1860)
- Merge pull request #220 from Boym323/automation/repository-metadata (b52213f)
- feat(diagnostics): implement db operation tracking and diagnostics (06f8f7b)

</details>

## [1.0.218] - 2026-09-29

Changes since v1.0.217.

### Added

- Update transaction attribution and canary results (dcba599)

### Maintenance

- Sync generated repository metadata (4048f42)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (4048f42)
- Merge pull request #219 from Boym323/automation/repository-metadata (ce87d5e)
- feat(diagnostics): update transaction attribution and canary results (dcba599)

</details>

## [1.0.217] - 2026-09-29

Changes since v1.0.216.

### Documentation

- Record diagnostics deployment canary (4b0205d)

### Maintenance

- Sync generated repository metadata (53519a0)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (53519a0)
- Merge pull request #218 from Boym323/automation/repository-metadata (92ee769)
- docs: record diagnostics deployment canary (4b0205d)

</details>

## [1.0.216] - 2026-09-29

Changes since v1.0.215.

### Added

- Enhance DB transaction diagnostics with process-local store and identity retention (1d90ba70)

### Documentation

- Record aviation weather persistence canary (2ab44ecc)

### Maintenance

- Sync generated repository metadata (f4a091e1)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (f4a091e1)
- Merge pull request #217 from Boym323/automation/repository-metadata (649b708f)
- docs: record aviation weather persistence canary (2ab44ecc)
- feat(diagnostics): enhance DB transaction diagnostics with process-local store and identity retention (1d90ba70)

</details>

## [1.0.214] - 2026-09-29

Changes since v1.0.212.

### Documentation

- Update changelog for v1.0.213 (89ba0ff)
- Record ADSBDB RAM checkpoint canary (6798494)

### Maintenance

- Sync generated repository metadata (d211dbb)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (d211dbb)
- Merge pull request #215 from Boym323/automation/repository-metadata (a354ad4)
- docs: update changelog for v1.0.213 (89ba0ff)
- docs: record ADSBDB RAM checkpoint canary (6798494)

</details>

## [1.0.212] - 2026-09-29

Changes since v1.0.211.

### Added

- Implement configurable checkpoint intervals and modes (55a205f)

### Maintenance

- Sync generated repository metadata (1cd927d)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (1cd927d)
- Merge pull request #214 from Boym323/automation/repository-metadata (3a71850)
- feat(persistence): implement configurable checkpoint intervals and modes (55a205f)

</details>

## [1.0.211] - 2026-09-29

Changes since v1.0.210.

### Maintenance

- Sync generated repository metadata (a6bcb71)
- Add transaction attribution diagnostics (6bc77f6)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (a6bcb71)
- Merge pull request #213 from Boym323/automation/repository-metadata (d35c6e5)
- chore(db): add transaction attribution diagnostics (6bc77f6)

</details>

## [1.0.210] - 2026-09-29

Changes since v1.0.209.

### Added

- Add node filesystem write attribution artifacts (ded39f0)

### Maintenance

- Sync generated repository metadata (cbef6d8)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (cbef6d8)
- Merge pull request #212 from Boym323/automation/repository-metadata (f25b237)
- feat(artifacts): add node filesystem write attribution artifacts (ded39f0)

</details>

## [1.0.209] - 2026-09-29

Changes since v1.0.207.

**Features touched:** Receiver Coverage.

### Changed

- Add post-optimization runtime baseline artifacts (2cbc6c1)

### Fixed

- Update status to production-measured and enhance metrics in receiver coverage hourly optimization (9e1c589)

### Documentation

- Update changelog for v1.0.208 (8ac5b8d)

### Maintenance

- Sync generated repository metadata (96d4c27)

<details>
<summary>Technical commits</summary>

- fix(optimization): update status to production-measured and enhance metrics in receiver coverage hourly optimization (9e1c589)
- docs: update changelog for v1.0.208 (8ac5b8d)
- chore(metadata): sync generated repository metadata (96d4c27)
- Merge pull request #211 from Boym323/automation/repository-metadata (7a4a4c6)
- Add post-optimization runtime baseline artifacts (2cbc6c1)

</details>

## [1.0.207] - 2026-09-29

Changes since v1.0.206.

### Fixed

- Make hourly coverage cache transaction-safe (0adf3c74)

### Maintenance

- Sync generated repository metadata (cf315abf)
- Add real hourly coverage postgres gate (88050722)

<details>
<summary>Technical commits</summary>

- fix(stats): make hourly coverage cache transaction-safe (0adf3c74)
- chore(metadata): sync generated repository metadata (cf315abf)
- Merge pull request #210 from Boym323/automation/repository-metadata (89b15796)
- test(stats): add real hourly coverage postgres gate (88050722)

</details>

## [1.0.205] - 2026-09-28

Changes since v1.0.204.

### Maintenance

- Sync generated repository metadata (9d0a5e8)
- Ignore local runtime state (dcb018d)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (9d0a5e8)
- Merge pull request #208 from Boym323/automation/repository-metadata (6879440)
- chore(repo): ignore local runtime state (dcb018d)

</details>

## [1.0.204] - 2026-09-28

Changes since v1.0.203.

### Added

- Add initial Prisma configuration and update notifier file (d1ac84c)
- Implement keyboard shortcuts for closing UI elements in AirRadar components (263ccd6)

### Fixed

- Wire radar rail layer toggles (016491f)

### Maintenance

- Sync generated repository metadata (dba857a)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (dba857a)
- Merge pull request #207 from Boym323/automation/repository-metadata (8e668e5)
- feat(config): add initial Prisma configuration and update notifier file (d1ac84c)
- feat(ui): implement keyboard shortcuts for closing UI elements in AirRadar components (263ccd6)
- fix: wire radar rail layer toggles (016491f)

</details>

## [1.0.203] - 2026-09-28

Changes since v1.0.202.

**Features touched:** Airport Intelligence.

### Maintenance

- Sync generated repository metadata (e5908d1)
- Finalize Visual System V3 airport operations polish (b5adb80)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (e5908d1)
- Merge pull request #206 from Boym323/automation/repository-metadata (62aba45)
- style(ui): finalize Visual System V3 airport operations polish (b5adb80)

</details>

## [1.0.202] - 2026-09-28

Changes since v1.0.201.

**Features touched:** Airport Intelligence, Navigation Integrity.

### Added

- Add shadow confidence calibration (ea097f8)
- Add airport operations v2 layer (9d93917)

### Changed

- Implement code changes to enhance functionality and improve performance (5daedb6)

### Maintenance

- Sync generated repository metadata (3144681)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (3144681)
- Merge pull request #205 from Boym323/automation/repository-metadata (78afcd2)
- feat(navigation): add shadow confidence calibration (ea097f8)
- Implement code changes to enhance functionality and improve performance (5daedb6)
- feat(airport): add airport operations v2 layer (9d93917)

</details>

## [1.0.201] - 2026-09-28

Changes since v1.0.200.

**Features touched:** Navigation Integrity.

### Fixed

- Make production forensic audits persistent-data aware (1e76bd4)

### Maintenance

- Sync generated repository metadata (0014882)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (0014882)
- Merge pull request #204 from Boym323/automation/repository-metadata (33f09e1)
- fix(navigation-integrity): make production forensic audits persistent-data aware (1e76bd4)

</details>

## [1.0.200] - 2026-09-28

Changes since v1.0.199.

**Features touched:** Map Context & Weather, Navigation Integrity, Time Machine.

### Added

- Add navigation integrity situational awareness (3c4d6b3)
- Surface historical navigation integrity (17ce056)
- Update aircraft weather quality metrics and improve data integrity (dd8fbf2)
- Enhance candidate evaluation with maturity metrics and structured evidence (8b5730e)

### Maintenance

- Sync generated repository metadata (8321325)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (8321325)
- Merge pull request #203 from Boym323/automation/repository-metadata (9a4f4fe)
- feat(navigation): add navigation integrity situational awareness (3c4d6b3)
- feat(time-machine): surface historical navigation integrity (17ce056)
- feat(aircraft-weather): update aircraft weather quality metrics and improve data integrity (dd8fbf2)
- feat(navigation-integrity): enhance candidate evaluation with maturity metrics and structured evidence (8b5730e)

</details>

## [1.0.199] - 2026-09-28

Changes since v1.0.198.

**Features touched:** Map Context & Weather.

### Changed

- Feat/aircraft weather v1 1 (#202) (ba9a5a6)

### Maintenance

- Sync generated repository metadata (a58179a)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (a58179a)
- Merge pull request #201 from Boym323/automation/repository-metadata (007e5e6)
- Feat/aircraft weather v1 1 (#202) (ba9a5a6)

</details>

## [1.0.198] - 2026-09-28

Changes since v1.0.181.

**Features touched:** Map Context & Weather, Time Machine.

### Added

- Add system health summary and improve time machine controls (c784c2c)
- Implement airports and flights browsing functionality with responsive design (498d5a9)
- Add aircraft weather observations backend (6cac3c3)
- Add aircraft weather radar UI (f4d3758)

### Fixed

- Require aircraft weather profile coordinates (14f9bff)
- Query persisted aircraft weather rows (953981a)
- Type aircraft weather query selector (be94d27)
- Preserve temperatures in weather API reads (f4204c5)
- Share weather diagnostics across bundles (2487d14)
- Ignore provisional weather quality transition (5d38840)
- Use configured receiver for aircraft weather (d1e6e3b)
- Preserve nearby weather observations in queries (1c238d8)
- Keep aircraft weather panel interactive (c170561)
- Raise weather panel above map controls (513d4be)
- Keep weather panel styles within visual budget (8b010bd)

### Performance

- Coalesce aircraft weather persistence (1a71180)

### Documentation

- Update changelog for v1.0.182 (cbb3be5)
- Update changelog for v1.0.183 (cbdc918)
- Update changelog for v1.0.184 (625bc5b)
- Update changelog for v1.0.185 (55e4775)
- Update changelog for v1.0.186 (7a09631)
- Update changelog for v1.0.187 (ec0a67d)
- Update changelog for v1.0.188 (986d37f)
- Record aircraft weather production baseline (719182d)
- Update changelog for v1.0.189 (3ac00d3)
- Update changelog for v1.0.190 (61bc0e3)
- Update changelog for v1.0.191 (6dceadc)
- Register aircraft weather routes (7042278)
- Update changelog for v1.0.192 (abc98d0)
- Update changelog for v1.0.193 (140757b)
- Update changelog for v1.0.194 (cc4a49d)
- Update changelog for v1.0.195 (060b1f7)
- Update changelog for v1.0.196 (a8e2779)
- Update changelog for v1.0.197 (da609ec)

### Maintenance

- Sync generated repository metadata (afe06b8)
- Reconcile V3 integration labels (900ca31)
- Sync generated repository metadata (c5eaeb7)
- Sync generated repository metadata (26c488e)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (afe06b8)
- Merge pull request #198 from Boym323/automation/repository-metadata (d602387)
- feat: add system health summary and improve time machine controls (c784c2c)
- feat: implement airports and flights browsing functionality with responsive design (498d5a9)
- Merge remote-tracking branch 'origin/feat/v3-time-machine' into chore/v3-visual-integration (08c8c0f)
- Merge remote-tracking branch 'origin/feat/v3-airports-flights' into chore/v3-visual-integration (2aecd78)
- chore: reconcile V3 integration labels (900ca31)
- docs: update changelog for v1.0.182 (cbb3be5)
- chore(metadata): sync generated repository metadata (c5eaeb7)
- Merge pull request #199 from Boym323/automation/repository-metadata (cab4563)
- Merge remote-tracking branch 'origin/main' into chore/v3-visual-integration (51d7351)
- Merge V3 final integration (b2ca3bf)
- docs: update changelog for v1.0.183 (cbdc918)
- chore(metadata): sync generated repository metadata (26c488e)
- Merge pull request #200 from Boym323/automation/repository-metadata (5c1c0c0)
- feat: add aircraft weather observations backend (6cac3c3)
- docs: update changelog for v1.0.184 (625bc5b)
- fix: require aircraft weather profile coordinates (14f9bff)
- docs: update changelog for v1.0.185 (55e4775)
- fix: query persisted aircraft weather rows (953981a)
- docs: update changelog for v1.0.186 (7a09631)
- fix: type aircraft weather query selector (be94d27)
- fix: preserve temperatures in weather API reads (f4204c5)
- docs: update changelog for v1.0.187 (ec0a67d)
- fix: share weather diagnostics across bundles (2487d14)
- docs: update changelog for v1.0.188 (986d37f)
- docs: record aircraft weather production baseline (719182d)
- docs: update changelog for v1.0.189 (3ac00d3)
- perf: coalesce aircraft weather persistence (1a71180)
- docs: update changelog for v1.0.190 (61bc0e3)
- fix: ignore provisional weather quality transition (5d38840)
- docs: update changelog for v1.0.191 (6dceadc)
- docs: register aircraft weather routes (7042278)
- docs: update changelog for v1.0.192 (abc98d0)
- feat: add aircraft weather radar UI (f4d3758)
- docs: update changelog for v1.0.193 (140757b)
- fix: use configured receiver for aircraft weather (d1e6e3b)
- docs: update changelog for v1.0.194 (cc4a49d)
- fix: preserve nearby weather observations in queries (1c238d8)
- docs: update changelog for v1.0.195 (060b1f7)
- fix: keep aircraft weather panel interactive (c170561)
- docs: update changelog for v1.0.196 (a8e2779)
- fix: raise weather panel above map controls (513d4be)
- docs: update changelog for v1.0.197 (da609ec)
- fix: keep weather panel styles within visual budget (8b010bd)

</details>

## [Unreleased]

### Added

- Add Aircraft Weather Observations V1 with conservative BDS 4,4 provenance,
  sparse QC persistence, vertical profile aggregation, read-only API routes,
  and bounded admin diagnostics.

## [1.0.181] - 2026-09-27

Changes since v1.0.179.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add Czech localization for project documentation and update related files (de47b90)
- Update Czech documentation and add localization checks (2221b6d)
- Update aircraft radar quick detail component and localization for situation tab (5253e69)
- Improve changelog feature attribution (2594a3c)
- Enhance aircraft detail styling and improve responsiveness in radar panel (1847f2d)

### Fixed

- Enforce tagged release history (0138469)
- Align browser gate with quick-detail tabs (616d699)

### Documentation

- Update changelog for v1.0.180 (ca445e2)
- Complete Czech documentation localization (#196) (786dd95)
- Reconcile release and feature history (adbc14c)

### Maintenance

- Sync generated repository metadata (dcf89f1)
- Validate changelog attribution signals (17226ac)
- Cover tag and feature synchronization (886c038)
- Cover quick-detail tab contract (b27e549)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (dcf89f1)
- Merge pull request #195 from Boym323/automation/repository-metadata (6979721)
- feat: add Czech localization for project documentation and update related files (de47b90)
- Merge remote-tracking branch 'origin/main' (455918a)
- feat(docs): update Czech documentation and add localization checks (2221b6d)
- feat: update aircraft radar quick detail component and localization for situation tab (5253e69)
- docs: update changelog for v1.0.180 (ca445e2)
- docs: complete Czech documentation localization (#196) (786dd95)
- fix(changelog): enforce tagged release history (0138469)
- feat(features): improve changelog feature attribution (2594a3c)
- test(features): validate changelog attribution signals (17226ac)
- test(changelog): cover tag and feature synchronization (886c038)
- docs(changelog): reconcile release and feature history (adbc14c)
- fix(test): align browser gate with quick-detail tabs (616d699)
- test(browser): cover quick-detail tab contract (b27e549)
- Merge pull request #197 from Boym323/fix/changelog-feature-sync-v2 (6c946ba)
- feat: enhance aircraft detail styling and improve responsiveness in radar panel (1847f2d)
- Merge remote-tracking branch 'origin/main' (14a17d9)

</details>

## [1.0.179] - 2026-09-27

Changes since v1.0.178.

### Added

- Add bilingual documentation for AirRadar in English and Czech (7f625b6)

### Maintenance

- Sync generated repository metadata (dc73549)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (dc73549)
- Merge pull request #194 from Boym323/automation/repository-metadata (66a25c1)
- feat: add bilingual documentation for AirRadar in English and Czech (7f625b6)

</details>

## [1.0.178] - 2026-09-27

Changes since v1.0.177.

**Features touched:** Live Radar, System Observability.

### Added

- Update RadarMapLayerMenu for accessibility and improve visual system documentation (8b5629f)
- Enhance aircraft marker and label handling with stale state management and opacity adjustments (2f95379)
- Implement system status streaming API and enhance diagnostics handling (3adcc1a)

### Maintenance

- Sync generated repository metadata (3300bee)
- Sync generated repository metadata (4237ac8)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (3300bee)
- Merge pull request #192 from Boym323/automation/repository-metadata (ba806ba)
- feat: update RadarMapLayerMenu for accessibility and improve visual system documentation (8b5629f)
- Merge remote-tracking branch 'origin/main' (0d1e1e7)
- chore(metadata): sync generated repository metadata (4237ac8)
- Merge pull request #193 from Boym323/automation/repository-metadata (40ab4c9)
- feat: enhance aircraft marker and label handling with stale state management and opacity adjustments (2f95379)
- feat: implement system status streaming API and enhance diagnostics handling (3adcc1a)

</details>

## [1.0.177] - 2026-09-27

Changes since v1.0.176.

**Features touched:** Live Radar.

### Added

- Implement radar navigation and topbar enhancements (5e468ea)
- Enhance map diagnostics with additional metrics and style load handling (153aeda)

### Fixed

- Ensure history link is only clicked when visible in browser smoke test (8c23ad5)

### Maintenance

- Sync generated repository metadata (bafed09)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (bafed09)
- Merge pull request #191 from Boym323/automation/repository-metadata (cf76187)
- feat: implement radar navigation and topbar enhancements (5e468ea)
- fix: ensure history link is only clicked when visible in browser smoke test (8c23ad5)
- feat: enhance map diagnostics with additional metrics and style load handling (153aeda)

</details>

## [1.0.176] - 2026-09-27

Changes since v1.0.173.

**Features touched:** Live Radar.

### Added

- Enhance aircraft telemetry display and navigation sections (97840df)

### Fixed

- Improve network snapshot handling and metadata hydration (bf3d090)
- Improve metadata hydration and snapshot handling (555047d)
- Rebalance aircraft icon optical sizes (d25c780)
- Apply zoom-aware HTML aircraft sizing (c1e37d7)
- Scale WebGL aircraft smoothly with zoom (8ca52a5)
- Keep HTML aircraft sizing smooth during zoom (e8bdc22)
- Restore last-known-good MapLibre runtime (639f6c3)
- Restore last-known-good MapLibre runtime (78393c0)

### Documentation

- Update changelog for v1.0.174 (f8d3a94)
- Update changelog for v1.0.175 (b432152)

### Maintenance

- Sync generated repository metadata (581c5c8)
- Sync generated repository metadata (2c0eed3)
- Sync generated repository metadata (912f893)
- Update dependencies and improve PDF extraction (2eba330)
- Reduce aircraft hover and selection scale (bcfcfe1)
- Cover optical aircraft sizing and zoom scale (89d73e9)
- Enforce zoom-aware HTML WebGL size parity (94a962f)
- Improve browser gate console diagnostics (1ece07c)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (581c5c8)
- Merge pull request #187 from Boym323/automation/repository-metadata (30e9e12)
- fix(aircraft-state): improve network snapshot handling and metadata hydration (bf3d090)
- docs: update changelog for v1.0.174 (f8d3a94)
- chore(metadata): sync generated repository metadata (2c0eed3)
- Merge pull request #188 from Boym323/automation/repository-metadata (c9f8acc)
- feat: enhance aircraft telemetry display and navigation sections (97840df)
- fix(aircraft-state): improve metadata hydration and snapshot handling (555047d)
- docs: update changelog for v1.0.175 (b432152)
- chore(metadata): sync generated repository metadata (912f893)
- Merge pull request #189 from Boym323/automation/repository-metadata (c787f4e)
- chore: update dependencies and improve PDF extraction (2eba330)
- Merge remote-tracking branch 'origin/main' (1a299cb)
- fix(radar): rebalance aircraft icon optical sizes (d25c780)
- fix(radar): apply zoom-aware HTML aircraft sizing (c1e37d7)
- fix(radar): scale WebGL aircraft smoothly with zoom (8ca52a5)
- fix(radar): keep HTML aircraft sizing smooth during zoom (e8bdc22)
- style(radar): reduce aircraft hover and selection scale (bcfcfe1)
- test(radar): cover optical aircraft sizing and zoom scale (89d73e9)
- test(radar): enforce zoom-aware HTML WebGL size parity (94a962f)
- fix(radar): restore last-known-good MapLibre runtime (639f6c3)
- fix(radar): restore last-known-good MapLibre runtime (78393c0)
- Merge pull request #190 from Boym323/fix/aircraft-icon-optical-sizing (383f06c)
- test: improve browser gate console diagnostics (1ece07c)
- Merge remote-tracking branch 'origin/main' (cc07d43)

</details>

## [1.0.173] - 2026-09-27

Changes since v1.0.172.

### Maintenance

- Sync generated repository metadata (e3caf22)
- Refine aviation operations hierarchy (#186) (a137392)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (e3caf22)
- Merge pull request #185 from Boym323/automation/repository-metadata (961bccb)
- style(ui): refine aviation operations hierarchy (#186) (a137392)

</details>

## [1.0.172] - 2026-09-27

Changes since v1.0.171.

### Maintenance

- Sync generated repository metadata (fac7581)
- Enhance UI components with improved spacing and typography (465c578)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (fac7581)
- Merge pull request #183 from Boym323/automation/repository-metadata (283b3d3)
- style(ui): enhance UI components with improved spacing and typography (465c578)
- Merge pull request #184 from Boym323/polish/ui-ux-v3 (d2a3081)

</details>

## [1.0.171] - 2026-09-27

Changes since v1.0.168.

**Features touched:** Live Radar.

### Added

- Use Beast telemetry across aircraft visualizations (4f3b4e8)
- Export plausible transition functions and filter trail points for improved history processing (b560880)

### Fixed

- Avoid generic icons while WebGL assets load (276ccde)
- Refine responsive visual system controls (7b6c2c9)

### Documentation

- Update changelog for v1.0.169 (57aceff)
- Update changelog for v1.0.170 (3ebb175)

### Maintenance

- Sync generated repository metadata (c365fb2)
- Sync generated repository metadata (3e55904)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (c365fb2)
- Merge pull request #180 from Boym323/automation/repository-metadata (a121a7d)
- feat: use Beast telemetry across aircraft visualizations (4f3b4e8)
- feat: export plausible transition functions and filter trail points for improved history processing (b560880)
- Merge remote-tracking branch 'origin/main' (66f8441)
- Merge pull request #179 from Boym323/fix/beast-visualization-coverage (071b176)
- docs: update changelog for v1.0.169 (57aceff)
- chore(metadata): sync generated repository metadata (3e55904)
- Merge pull request #181 from Boym323/automation/repository-metadata (47f5c4f)
- fix(radar): avoid generic icons while WebGL assets load (276ccde)
- docs: update changelog for v1.0.170 (3ebb175)
- fix(ui): refine responsive visual system controls (7b6c2c9)
- Merge pull request #182 from Boym323/audit/visual-system-v2-20260927 (cc75628)

</details>

## [1.0.168] - 2026-09-27

Changes since v1.0.167.

**Features touched:** Live Radar.

### Fixed

- Improve initial metadata hydration for aircraft snapshots (c00569f)

### Maintenance

- Sync generated repository metadata (b40851f)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (b40851f)
- Merge pull request #178 from Boym323/automation/repository-metadata (467e2f8)
- fix: improve initial metadata hydration for aircraft snapshots (c00569f)

</details>

## [1.0.167] - 2026-09-27

Changes since v1.0.164.

**Features touched:** Live Radar.

### Added

- Add extreme altitude audit artifacts and root cause analysis (a41387b)
- Model initial aircraft metadata provider (f4319bd)
- Add fast initial aircraft metadata lookup (fbf5b26)
- Add altitude provenance and forensic diagnostics (730489a)

### Fixed

- Keep live aircraft type stable for first icon render (0d65d3c)
- Use local metadata for initial aircraft icons (816439f)
- Hydrate icon metadata before first live snapshot (8ef2b83)
- Update generatedAt timestamps and currentCommit in JSON artifacts (530a871)

### Documentation

- Update changelog for v1.0.165 (6291c47)
- Update changelog for v1.0.166 (412a538)

### Maintenance

- Sync generated repository metadata (7c3f14c)
- Prevent enrichment-driven icon replacement (37b76c0)
- Require correct icon identity on first snapshot (aa1c852)
- Inspect first snapshot containing the aircraft (c2f03a3)
- Keep first-render fixture within stale window (bee8d87)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (7c3f14c)
- Merge pull request #176 from Boym323/automation/repository-metadata (f61341d)
- feat: add extreme altitude audit artifacts and root cause analysis (a41387b)
- Merge remote-tracking branch 'origin/main' (aad3db4)
- fix(ui): keep live aircraft type stable for first icon render (0d65d3c)
- feat(server): model initial aircraft metadata provider (f4319bd)
- feat(server): add fast initial aircraft metadata lookup (fbf5b26)
- fix(server): use local metadata for initial aircraft icons (816439f)
- fix(radar): hydrate icon metadata before first live snapshot (8ef2b83)
- test(ui): prevent enrichment-driven icon replacement (37b76c0)
- test(radar): require correct icon identity on first snapshot (aa1c852)
- test(radar): inspect first snapshot containing the aircraft (c2f03a3)
- test(radar): keep first-render fixture within stale window (bee8d87)
- Merge pull request #177 from Boym323/fix/aircraft-icons-first-render (8d6ec04)
- docs: update changelog for v1.0.165 (6291c47)
- feat: add altitude provenance and forensic diagnostics (730489a)
- docs: update changelog for v1.0.166 (412a538)
- fix: update generatedAt timestamps and currentCommit in JSON artifacts (530a871)
- Merge remote-tracking branch 'origin/main' (410fb8e)

</details>

## [1.0.164] - 2026-09-27

Changes since v1.0.163.

### Added

- Finalize ADS-B telemetry and aircraft icon sizing (2b8fe7f)

### Changed

- Add script for auditing extreme altitudes in flight data (f53fe7b)

### Maintenance

- Sync generated repository metadata (9a887b5)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (9a887b5)
- Merge pull request #174 from Boym323/automation/repository-metadata (8555701)
- feat: finalize ADS-B telemetry and aircraft icon sizing (2b8fe7f)
- Add script for auditing extreme altitudes in flight data (f53fe7b)
- Merge pull request #175 from Boym323/feat/visual-system-v2-adsb-telemetry-icons (6a9656b)
- Merge remote-tracking branch 'origin/main' (857f906)

</details>

## [1.0.163] - 2026-09-27

Changes since v1.0.162.

### Added

- Implement historical altitude repair script and rollback SQL (dc7457a)

### Maintenance

- Sync generated repository metadata (4504d0e)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (4504d0e)
- Merge pull request #173 from Boym323/automation/repository-metadata (48a9164)
- feat: implement historical altitude repair script and rollback SQL (dc7457a)

</details>

## [1.0.162] - 2026-09-27

Changes since v1.0.156.

**Features touched:** Live Radar.

### Added

- Enhance decoding logic for TC19 and TC28 frames, add tests for ground speed and emergency status (19f40ec)
- Add decoding for TC29 target state and TC31 operational status; update types and serialization (4970307)
- Add ADS-B telemetry support and update normalization logic (5af67c0)
- Implement merging logic for local aircraft and add unit tests (f4c07a4)
- Enhance aircraft telemetry merging with observation times and improve fallback logic (4135ba4)
- Add altitude decoding logic and corresponding tests (016d36d)
- Enhance BeastDecoder to handle short DF11 identity and DF4 altitude replies, and reject untracked AP replies (664c080)
- Enhance Beast Mode-S decoding with local BDS inference and metadata retention (9c2b20f)
- Enhance BeastDecoder and FailoverLocalProvider with timestamp handling and telemetry merging improvements (01da4b1)
- Enhance altitude decoding with ADS-B barometric and GNSS altitude functions (6bc7201)
- Add historical altitude audit script and corresponding npm script (456ea57)

### Changed

- Add SQL script for historical altitude repair and rollback data (777e447)

### Fixed

- Type historical event query (284bd83)

### Documentation

- Update changelog for v1.0.157 (f7060d1)
- Update changelog for v1.0.158 (0b0e3a0)
- Update changelog for v1.0.159 (6ae30c9)
- Update changelog for v1.0.160 (9b082be)
- Update changelog for v1.0.161 (af12d9f)
- Update changelog for v1.0.162 (649f707)

### Maintenance

- Sync generated repository metadata (777f9e9)
- Sync generated repository metadata (fbce3f2)
- Sync generated repository metadata (b728da7)
- Sync generated repository metadata (4a3634a)
- Sync generated repository metadata (45c9e52)
- Sync generated repository metadata (6ca7a6b)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (777f9e9)
- Merge pull request #166 from Boym323/automation/repository-metadata (c50bd65)
- feat(beast-decoder): enhance decoding logic for TC19 and TC28 frames, add tests for ground speed and emergency status (19f40ec)
- docs: update changelog for v1.0.157 (f7060d1)
- feat(beast-decoder): add decoding for TC29 target state and TC31 operational status; update types and serialization (4970307)
- docs: update changelog for v1.0.158 (0b0e3a0)
- chore(metadata): sync generated repository metadata (fbce3f2)
- Merge pull request #167 from Boym323/automation/repository-metadata (6ef0187)
- feat: add ADS-B telemetry support and update normalization logic (5af67c0)
- Merge remote-tracking branch 'origin/main' (37809ce)
- docs: update changelog for v1.0.159 (6ae30c9)
- chore(metadata): sync generated repository metadata (b728da7)
- Merge pull request #168 from Boym323/automation/repository-metadata (994a9df)
- feat: implement merging logic for local aircraft and add unit tests (f4c07a4)
- feat: enhance aircraft telemetry merging with observation times and improve fallback logic (4135ba4)
- feat: add altitude decoding logic and corresponding tests (016d36d)
- docs: update changelog for v1.0.160 (9b082be)
- feat: enhance BeastDecoder to handle short DF11 identity and DF4 altitude replies, and reject untracked AP replies (664c080)
- chore(metadata): sync generated repository metadata (4a3634a)
- Merge pull request #169 from Boym323/automation/repository-metadata (0f8d9ab)
- feat: enhance Beast Mode-S decoding with local BDS inference and metadata retention (9c2b20f)
- feat: enhance BeastDecoder and FailoverLocalProvider with timestamp handling and telemetry merging improvements (01da4b1)
- docs: update changelog for v1.0.161 (af12d9f)
- chore(metadata): sync generated repository metadata (45c9e52)
- Merge pull request #170 from Boym323/automation/repository-metadata (ff9cb94)
- feat: enhance altitude decoding with ADS-B barometric and GNSS altitude functions (6bc7201)
- Merge remote-tracking branch 'origin/main' (a17d635)
- chore(metadata): sync generated repository metadata (6ca7a6b)
- Merge pull request #171 from Boym323/automation/repository-metadata (884e62c)
- feat(audit): add historical altitude audit script and corresponding npm script (456ea57)
- Add SQL script for historical altitude repair and rollback data (777e447)
- docs: update changelog for v1.0.162 (649f707)
- fix(audit): type historical event query (284bd83)

</details>

## [1.0.156] - 2026-09-27

Changes since v1.0.155.

**Features touched:** Statistics & Recaps, System Observability, Time Machine.

### Added

- Centralize map visual palette (3ee0c3f)
- Expand visual system primitives (3c983c6)
- Establish visual system v2 foundation (97988eb)

### Changed

- Use shared map palette in time machine (7e2302e)
- Migrate system status to shared primitives (5f89361)
- Migrate statistics to visual primitives (6d1d89a)

### Fixed

- Correct visual audit regex escaping (6786787)

### Documentation

- Document visual system v2 (f3b1f06)
- Link visual system guide (833beee)
- Enforce visual system rules (6dab95f)

### Maintenance

- Sync generated repository metadata (1dfe927)
- Unify core surfaces and controls (f9a928c)
- Add visual system style budget (09263c3)
- Add visual system audit command (b962690)
- Enforce visual system contract (e70e4d1)
- Enforce visual system budget (5badfb2)
- Capture visual smoke screenshots (d3e6808)
- Upload visual smoke artifacts (784006a)
- Ignore visual audit artifacts (1eb2492)
- Serialize visual screenshot capture (36acfed)
- Keep visual capture outside gate viewport set (efa9729)

<details>
<summary>Technical commits</summary>

- chore(metadata): sync generated repository metadata (1dfe927)
- Merge pull request #164 from Boym323/automation/repository-metadata (3082c91)
- feat(ui): centralize map visual palette (3ee0c3f)
- refactor(ui): use shared map palette in time machine (7e2302e)
- feat(ui): expand visual system primitives (3c983c6)
- feat(ui): establish visual system v2 foundation (97988eb)
- refactor(ui): migrate system status to shared primitives (5f89361)
- refactor(ui): migrate statistics to visual primitives (6d1d89a)
- style(ui): unify core surfaces and controls (f9a928c)
- ci(ui): add visual system style budget (09263c3)
- chore(ui): add visual system audit command (b962690)
- test(ui): enforce visual system contract (e70e4d1)
- ci(ui): enforce visual system budget (5badfb2)
- test(ui): capture visual smoke screenshots (d3e6808)
- ci(ui): upload visual smoke artifacts (784006a)
- fix(ui): correct visual audit regex escaping (6786787)
- chore(ui): ignore visual audit artifacts (1eb2492)
- docs(ui): document visual system v2 (f3b1f06)
- docs(ui): link visual system guide (833beee)
- docs(agents): enforce visual system rules (6dab95f)
- test(ui): serialize visual screenshot capture (36acfed)
- test(ui): keep visual capture outside gate viewport set (efa9729)
- Merge pull request #165 from Boym323/feat/visual-system-v2-phase1 (9f68ff7)

</details>

## [1.0.155] - 2026-09-27

Changes since v1.0.152.

**Features touched:** OGN / FLARM.

### Added

- Implement OGN target deduplication logic and add corresponding tests (b6bc862)
- Enhance OGN deduplication logic to handle exact position matches without altitude (382b2b1)

### Fixed

- Ignore unchanged same-day snapshots (2d666b9)
- Correct altitude decoding for DF17 Q-bit to prevent incorrect values (b2866ed)

### Documentation

- Update changelog for v1.0.153 (7108b0e)
- Update changelog for v1.0.154 (a5c62e2)
- Describe unified metadata automation (e603634)
- Document unified metadata workflow (3c6dfa7)

### Maintenance

- Ignore changelog-only pushes (08c65c3)
- Skip metrics-only deployment (d79a4ed)
- Prevent unchanged same-day churn (754cdce)
- Guard changelog metrics loop (7b8c121)
- Move metadata sync out of release workflow (e22afb3)
- Unify generated repository metadata (08624a9)
- Remove standalone metrics workflow (f00b957)
- Remove standalone changelog workflow (0e10623)
- Cover unified metadata workflow (91f1796)

<details>
<summary>Technical commits</summary>

- fix(metrics): ignore unchanged same-day snapshots (2d666b9)
- ci(metrics): ignore changelog-only pushes (08c65c3)
- ci(release): skip metrics-only deployment (d79a4ed)
- test(metrics): prevent unchanged same-day churn (754cdce)
- test(ci): guard changelog metrics loop (7b8c121)
- fix: correct altitude decoding for DF17 Q-bit to prevent incorrect values (b2866ed)
- feat: implement OGN target deduplication logic and add corresponding tests (b6bc862)
- docs: update changelog for v1.0.153 (7108b0e)
- feat: enhance OGN deduplication logic to handle exact position matches without altitude (382b2b1)
- Merge pull request #161 from Boym323/fix/automation-docs-metrics-loop (759f64d)
- docs: update changelog for v1.0.154 (a5c62e2)
- ci: move metadata sync out of release workflow (e22afb3)
- ci: unify generated repository metadata (08624a9)
- ci: remove standalone metrics workflow (f00b957)
- ci: remove standalone changelog workflow (0e10623)
- docs: describe unified metadata automation (e603634)
- docs(release): document unified metadata workflow (3c6dfa7)
- test(ci): cover unified metadata workflow (91f1796)
- Merge pull request #163 from Boym323/fix/automation-metadata-pr-lifecycle (4606c04)

</details>

## [1.0.152] - 2026-09-27

Changes since v1.0.150.

### Added

- Add canonical aircraft glyph paths and update related components (a4e8d7a)

### Documentation

- Sync changelog through v1.0.150 (0cb37c4)

<details>
<summary>Technical commits</summary>

- docs: sync changelog through v1.0.150 (0cb37c4)
- Merge pull request #160 from Boym323/automation/changelog-sync (35724bf)
- feat: add canonical aircraft glyph paths and update related components (a4e8d7a)

</details>

## [1.0.150] - 2026-09-27

Changes since v1.0.149.

### Added

- Validate feature registry against routes (534a6f6)
- Generate categorized release notes (40a9146)

### Documentation

- Add canonical feature registry (a1b5b5c)
- Generate feature registry inventory (f51d7dd)
- Map changelog scopes to features (a87fa68)
- Require feature registry updates (e34ce39)
- Document feature registry gate (3d1338a)
- Describe categorized changelog (4c240b9)
- Link canonical feature registry (9651ce6)

### Maintenance

- Enforce registry ownership (4d84742)
- Cover categorized release notes (d403f4e)
- Add feature registry commands (6a2594e)
- Enforce feature registry coverage (5f1e1d2)
- Update release entry expectation (9af912f)
- Join expected entry with newlines (0d3c887)

<details>
<summary>Technical commits</summary>

- docs(features): add canonical feature registry (a1b5b5c)
- feat(docs): validate feature registry against routes (534a6f6)
- docs(features): generate feature registry inventory (f51d7dd)
- docs(features): map changelog scopes to features (a87fa68)
- feat(changelog): generate categorized release notes (40a9146)
- test(features): enforce registry ownership (4d84742)
- test(changelog): cover categorized release notes (d403f4e)
- chore(docs): add feature registry commands (6a2594e)
- ci(docs): enforce feature registry coverage (5f1e1d2)
- docs(agents): require feature registry updates (e34ce39)
- docs(dev): document feature registry gate (3d1338a)
- docs(release): describe categorized changelog (4c240b9)
- docs(readme): link canonical feature registry (9651ce6)
- test(changelog): update release entry expectation (9af912f)
- test(changelog): join expected entry with newlines (0d3c887)
- Merge pull request #159 from Boym323/feat/feature-registry-changelog-v2 (6097edd)

</details>

## [1.0.149] - 2026-09-27

Changes since v1.0.147.

**Features touched:** Aircraft & Flight Detail.

### Added

- Add intelligence aircraft detail summary (c16b0f6)

### Performance

- Polish radar rendering path (8b5d26e)

### Documentation

- Sync release changelog (d3292ec)
- Update changelog for v1.0.148 (a39c977)
- Record rendering stream progress (23cc0a5)

### Maintenance

- Update codebase growth (7621c28)

<details>
<summary>Technical commits</summary>

- feat: add intelligence aircraft detail summary (c16b0f6)
- Merge pull request #151 from Boym323/feat/aircraft-detail-v2 (a19d62f)
- chore(metrics): update codebase growth (7621c28)
- Merge pull request #156 from Boym323/automation/codebase-metrics (adcdf68)
- docs: sync release changelog (d3292ec)
- Merge pull request #150 from Boym323/automation/changelog-sync (43df266)
- docs: update changelog for v1.0.148 (a39c977)
- perf: polish radar rendering path (8b5d26e)
- docs: record rendering stream progress (23cc0a5)
- Merge pull request #158 from Boym323/perf/rendering-polish-v2 (c128242)

</details>

## [1.0.147] - 2026-09-27

Changes since v1.0.146:

- feat: add transition-aware intelligence alerts (7f80b0d)
- feat: bound time machine event timeline (ff394ce)
- docs: track UI intelligence wave progress (8e4f123)
- docs: record UI wave pull requests (544d37a)
- docs: record full UI wave test results (09b21d0)
- feat(metrics): backfill daily LOC from Git history (abe1dbe)
- ci(metrics): bootstrap historical LOC once (83b58d0)
- chore(metrics): add history backfill command (47a4b35)
- test(metrics): cover historical daily backfill (38ae1d3)
- docs(metrics): explain historical backfill (8114a6a)
- test(metrics): expose Git scanners (c22b097)
- test(metrics): verify Git history scanner (8e7189d)
- Merge pull request #152 from Boym323/feat/alerting-v2 (2e17aa0)
- chore(metrics): update codebase growth (e97f84b)
- Merge pull request #155 from Boym323/automation/codebase-metrics (4e01ee8)
- Merge pull request #154 from Boym323/feat/code-metrics-history-backfill (c266f22)
- feat(metrics): update code growth metrics and descriptions in SVG and JSON (30a33ee)
- Merge pull request #153 from Boym323/feat/time-machine-v2 (4c0c94a)

## [1.0.146] - 2026-09-27

Changes since v1.0.145:

- docs: sync changelog through v1.0.145 (2970e44)
- feat(intelligence): add go-around episode detector (cac54d5)
- feat(atc): add geometry-based sector boundary prediction (5b5d635)
- feat(weather): add unified freshness and aircraft context (ef33ceb)
- feat(receiver): expose normalized quality telemetry (8cdfd7c)
- docs: record parallel intelligence roadmap progress (64866b1)
- Merge pull request #147 from Boym323/feat/flight-intelligence-v2-stage2 (3a7a50c)
- Merge pull request #148 from Boym323/feat/atc-intelligence-v2 (73622d8)
- Merge pull request #145 from Boym323/feat/weather-intelligence (58a9aa2)
- Merge pull request #146 from Boym323/feat/receiver-quality-dashboard (790d85c)
- Merge pull request #144 from Boym323/automation/changelog-sync (ccf34d1)
- chore(metrics): update codebase growth (9942ab9)
- Merge pull request #149 from Boym323/automation/codebase-metrics (3a1f3b6)

## [1.0.145] - 2026-09-26

Changes since v1.0.144:

- feat(metrics): add codebase LOC collector (ffae064)
- ci(metrics): automate codebase growth chart (1d0c513)
- docs(metrics): initialize code history (4f1718a)
- docs(metrics): add code growth chart placeholder (7397412)
- chore(metrics): expose code metrics command (71df9d0)
- docs(readme): add codebase growth chart (f1678cd)
- test(metrics): cover LOC classification and chart (18b6dec)
- ci(metrics): follow protected main review flow (2ba24e6)
- docs(metrics): document automated review flow (f8e6ae1)
- feat(intelligence): add flight intelligence v2 lifecycle signals (597164b)
- Merge pull request #140 from Boym323/feat/codebase-growth-metrics (dbf957d)
- chore(metrics): update codebase growth (9cf5f5e)
- fix(metrics): quote workflow summary safely (62c4e15)
- Merge pull request #142 from Boym323/automation/codebase-metrics (0a18fb6)
- Merge pull request #141 from Boym323/feat/flight-intelligence-v2-stage1 (f71483b)
- chore(metrics): update codebase growth (ce16185)
- Merge pull request #143 from Boym323/automation/codebase-metrics (f2d931e)

## [1.0.144] - 2026-09-26

Changes since v1.0.143:

- Add diagnostic script for auditing FlightAware routes (aadf157)

## [1.0.143] - 2026-09-26

Changes since v1.0.142:

- fix(radar): keep WebGL aircraft icons north-up (33ec71f)
- test(radar): guard WebGL icon orientation (fe48330)
- Merge pull request #139 from Boym323/fix/webgl-aircraft-icon-orientation (df46519)

## [1.0.142] - 2026-09-26

Changes since v1.0.141:

- fix(alerts): prioritize critical notifications (c3d62f2)
- test(alerts): cover priority queue preemption (680cd50)
- fix(sse): enforce per-client and channel capacity (e92145c)
- fix(sse): identify aircraft stream clients (837e456)
- fix(sse): isolate intelligence stream capacity (5cbf7c2)
- fix(sse): isolate OGN stream capacity (eac91f7)
- test(sse): cover client and channel fairness (0061910)
- test(sse): assert intelligence stream identity (155ce55)
- fix(intelligence): merge pending events into queries (44cd5c2)
- test(intelligence): cover pending event query race (e496390)
- fix(intelligence): suppress stale weather summary signals (debbc95)
- fix(radar): pass SIGMET freshness into situation summary (27ee5ef)
- test(intelligence): cover stale weather summary (5a1c3cf)
- fix(weather): measure SIGMET entry along remaining route (6519f5d)
- test(weather): verify SIGMET entry distance (ea02e5c)
- fix(alerts): reserve queue capacity for critical events (7506bf3)
- test(alerts): verify reserved critical queue capacity (d32cdac)
- fix(intelligence): replay recent events on SSE connect (b5920f1)
- fix(intelligence): merge REST and SSE event windows (d555211)
- test(intelligence): cover SSE connection replay (32a069e)
- test(sse): isolate shared-cap client identities (bcb4c62)
- Merge pull request #138 from Boym323/fix/code-review-findings (81578be)

## [1.0.141] - 2026-09-26

Changes since v1.0.140:

- feat(alerts): add flight-intelligence alert history types (28b7f60)
- feat(alerts): format flight-intelligence notifications (2f56eee)
- feat(alerts): bridge watchlisted flight-intelligence events (4e4590a)
- feat(intelligence): return detected lifecycle events to state owner (624775a)
- feat(alerts): notify on watchlisted intelligence events (d53a8df)
- feat(alerts): expose intelligence history filter (91bd901)
- feat(alerts): show flight-intelligence alert history (7f16658)
- test(alerts): cover watchlisted intelligence notifications (401832b)
- fix(intelligence): preserve low ATC prediction confidence (e8586df)
- test(alerts): include intelligence metadata in history fixture (d35b2a2)
- chore(alerts): retest against updated main (d9b81d4)
- Merge pull request #137 from Boym323/feature/intelligence-alerts (d0a9fbb)

## [1.0.140] - 2026-09-26

Changes since v1.0.139:

- feat(intelligence): derive deterministic flight situation summary (57bc1d7)
- feat(intelligence): add situation summary copy (0361009)
- feat(intelligence): add situation summary copy (ef21b94)
- feat(intelligence): show deterministic flight situation summary (3cb9180)
- style(intelligence): format flight situation summary (7f53d9d)
- test(intelligence): cover flight situation summary (5ffa97c)
- test(intelligence): require situation summary in radar detail (765a1e7)
- fix(intelligence): preserve low ATC prediction confidence (2cfe3b4)
- test(radar): make mobile close gate resilient to rerender (7b88409)
- Merge pull request #136 from Boym323/feature/flight-situation-summary (524adb2)

## [1.0.139] - 2026-09-26

Changes since v1.0.138:

- feat(weather): correlate reconstructed route with SIGMET (b4172d9)
- feat(weather): add route-weather context API (439460a)
- feat(weather): load route weather for selected aircraft (978ed7a)
- feat(weather): pass route weather into aircraft detail (cbf0daa)
- feat(weather): show SIGMETs along reconstructed route (366b0a6)
- feat(weather): add route-weather copy (df1f697)
- feat(weather): add route-weather copy (8a646ac)
- style(weather): format route-weather context (7eda7e8)
- test(weather): cover SIGMETs along reconstructed route (5bd994d)
- test(weather): require reconstructed-route weather UI (8cdab57)
- fix(weather): keep route context on bounded timeout refresh (2a6c3fd)
- perf(weather): keep route context off enrichment critical path (b164362)
- perf(weather): defer route context until ATC is ready (17d7da6)
- test(weather): fixture reconstructed-route weather in browser gate (24b5c88)
- Merge pull request #135 from Boym323/feature/route-weather-intelligence (b10bcae)

## [1.0.138] - 2026-09-26

Changes since v1.0.137:

- feat(weather): derive wind relative to destination bearing (e836aa4)
- feat(weather): expose destination wind context (4bd14f1)
- feat(weather): derive destination-relative wind (7424571)
- feat(weather): pass destination wind context (073ff3f)
- feat(weather): show destination-relative wind (6c44458)
- feat(weather): add destination-wind copy (73d4e76)
- feat(weather): add destination-wind copy (8b2387c)
- test(weather): cover destination-relative wind (84bba00)
- test(weather): require destination-relative wind UI (eec0ea3)
- test(weather): accept destination-aware wind hook (b1049cc)
- Merge main into feature/weather-destination-wind (8832fd0)
- Merge pull request #134 from Boym323/feature/weather-destination-wind (701af8c)

## [1.0.137] - 2026-09-26

Changes since v1.0.136:

- feat(weather): derive wind profile ahead of aircraft (94b0df9)
- feat(weather): expose wind-ahead profile (f97fb7f)
- feat(weather): pass wind-ahead profile to detail (e0c4fb6)
- feat(weather): pass wind-ahead profile to quick detail (5127d99)
- feat(weather): show wind trend ahead of aircraft (0998ff8)
- feat(weather): add wind-ahead copy (ae7ea06)
- feat(weather): add wind-ahead copy (858ddfc)
- test(weather): cover wind-ahead profile trends (3c03604)
- test(weather): require wind-ahead profile UI (1651a18)
- style(weather): format wind-ahead profile (d000fc7)
- Merge pull request #133 from Boym323/feature/weather-wind-ahead (f3d9d01)

## [1.0.136] - 2026-09-26

Changes since v1.0.135:

- feat(weather): reapply wind intelligence on optimized main (85b42f5)

## [1.0.135] - 2026-09-26

Changes since v1.0.134:

- perf(test): reapply production gate optimization (components/use-dataset-query.ts) (b302baa)
- perf(test): reapply production gate optimization (scripts/production-gates.mjs) (5a1f388)
- perf(test): reapply production gate optimization (tests/dataset-query-retry.test.ts) (469221b)
- perf(test): reapply production gate optimization (tests/production-gates.test.ts) (d1aa5f1)
- perf(test): reapply production gate optimization (tests/radar-context-highlight.test.ts) (70fadd9)

## [1.0.134] - 2026-09-26

Changes since v1.0.133:

- refactor(weather): expose short-horizon position projection (45620a7)
- feat(weather): detect course deviation away from SIGMET (b1136ad)
- feat(weather): derive SIGMET trajectory deviation (5cdc1a7)
- feat(weather): pass trajectory deviation context (93360d8)
- feat(weather): surface course deviation near SIGMET (e28d0af)
- feat(weather): add SIGMET deviation copy (eaacf9e)
- feat(weather): add SIGMET deviation copy (066e073)
- style(weather): highlight SIGMET trajectory deviation (0f82451)
- fix(weather): include vertical trend in current SIGMET projection (6747b86)
- test(weather): cover SIGMET trajectory deviation (db19e13)
- test(weather): require SIGMET deviation UI (1275807)
- test(weather): cover turned track that still intersects SIGMET (d6e4435)
- fix(weather): require vertical evidence for medium correlation (daa37c3)
- test(weather): downgrade unknown vertical correlation (571acb2)
- fix(weather): require horizontal SIGMET avoidance for course signal (c989109)
- test(weather): require horizontal avoidance for course signal (1ce07e5)
- Merge pull request #131 from Boym323/feature/weather-trajectory-deviation (19d8ff4)

## [1.0.133] - 2026-09-26

Changes since v1.0.132:

- feat(weather): correlate aircraft with active SIGMETs (c9d3ced)
- feat(weather): load SIGMET context for selected aircraft (5eacc12)
- feat(weather): derive selected-aircraft SIGMET context (5ba3ece)
- feat(weather): pass SIGMET context to aircraft detail (490b9b1)
- feat(weather): show active SIGMET exposure in flight detail (86f26e5)
- feat(weather): add aircraft SIGMET context copy (2ed3e17)
- feat(weather): add aircraft SIGMET context copy (58d1c8e)
- fix(weather): handle SIGMET boundaries and dateline polygons (68d2b22)
- test(weather): cover aircraft SIGMET context (fc45ebb)
- test(weather): require SIGMET context in aircraft detail (aef8095)
- test(weather): cover selected-aircraft SIGMET loading (9525379)
- refactor(weather): separate SIGMET loading from layer visibility (6cf6a9c)
- refactor(weather): keep SIGMET layer state outside data loader (d50a416)
- style(weather): format aircraft SIGMET context (5f211c3)
- feat(weather): project near-term SIGMET entry (2eaa773)
- feat(weather): show projected SIGMET entry ETA (15e4e67)
- feat(weather): add projected SIGMET copy (9ccbbee)
- feat(weather): add projected SIGMET copy (4e3f18a)
- test(weather): cover projected SIGMET entry (2e9c545)
- test(weather): require projected SIGMET UI (7eed9a1)
- Merge pull request #128 from Boym323/feature/weather-intelligence-sigmet (91551a1)

## [1.0.132] - 2026-09-26

Changes since v1.0.131:

- feat(atc): derive estimated handoff context (9b90a5b)
- feat(atc): surface estimated next-sector handoff (d7cd676)
- feat(atc): add handoff estimate copy (ceed09f)
- feat(atc): add handoff estimate copy (fd89ee3)
- test(atc): cover estimated handoff context (a3ba309)
- test(atc): require handoff estimate in quick detail (98a0adb)
- test(radar): wait for mobile drawer close transition (46811bc)
- test(radar): cover drawer transition gate (464f543)
- perf(sse): rebuild ordering once for dense deltas (28b4f96)
- test(sse): cover dense delta order rebuild (e2749da)
- test(radar): stabilize responsive drawer gate (250a781)
- test(radar): stabilize responsive drawer gate (2a1d065)
- test(radar): sync drawer gate fix with WebGL V2 (6cf7a8c)
- test(radar): sync drawer gate fix with WebGL V2 (822f90a)
- chore(radar): sync WebGL V2 base (9665d6c)
- chore(radar): sync WebGL V2 base (afc8f1f)
- chore(radar): sync WebGL V2 base (be5223a)
- chore(radar): sync WebGL V2 base (6ba7fc6)
- chore(radar): sync WebGL V2 base (599b76b)
- chore(radar): sync WebGL V2 base (bf6437e)
- fix(atc): downgrade uncertain handoff confidence (c1e082f)
- test(atc): cover uncertain handoff confidence (3855209)
- Merge pull request #126 from Boym323/test/stabilize-responsive-drawer-gate (cfa481c)
- Merge pull request #127 from Boym323/perf/sse-v2-dense-delta-order (cfeeb71)
- Merge pull request #125 from Boym323/feature/atc-handoff-v1 (a859c16)

## [1.0.131] - 2026-09-26

Changes since v1.0.130:

- perf(radar): add direct indexed WebGL hit testing (fafc454)
- perf(radar): route pointer hits directly to WebGL runtime (552b227)
- test(radar): cover indexed WebGL pointer picking (46bf67b)
- test(radar): gate direct WebGL picking contract (19901e4)
- test(radar): wait for direct WebGL picking runtime (81f8242)
- Merge pull request #124 from Boym323/perf/webgl-direct-hit-testing (141cb6c)

## [1.0.130] - 2026-09-26

Changes since v1.0.129:

- fix(radar): render real aircraft icons in WebGL (d1d1f2c)
- test(radar): require classified WebGL silhouettes (90cf301)
- fix(radar): respect WebGL texture-array limits (c7db8ba)
- Merge pull request #123 from Boym323/fix/webgl-real-aircraft-icons (62feaa5)

## [1.0.129] - 2026-09-26

Changes since v1.0.128:

- perf(radar): add WebGL bulk aircraft runtime (8c3c5a1)
- perf(radar): wire WebGL bulk aircraft layer (6088173)
- perf(radar): split bulk WebGL and special HTML rendering (67e2674)
- perf(radar): gate WebGL bulk renderer through 5000 aircraft (62ea931)
- perf(radar): benchmark WebGL and HTML render paths separately (98af698)
- perf(radar): soak WebGL renderer through 5000 aircraft (d8e6b33)
- test(radar): validate WebGL bulk performance budgets (aea3e5b)
- test(radar): cover WebGL headroom through 5000 aircraft (5c73e67)
- test(radar): update WebGL soak scenarios (2227e84)
- test(radar): cover WebGL aircraft hybrid renderer (781af4a)
- chore(radar): keep WebGL budget lint-clean (46d3bc8)
- perf(radar): preserve bulk motion state across full syncs (14261c9)
- perf(radar): retain WebGL interpolation across full map syncs (784e214)
- perf(radar): decouple bulk labels from motion cadence (07c1436)
- fix(radar): address WebGL review findings (3c0cb4e)
- fix(radar): keep WebGL hit targets on rendered positions (b5377ed)
- test(radar): update production gate for WebGL bulk markers (895cda3)
- test(radar): restore browser smoke state after marker selection (fe8d842)
- Merge pull request #122 from Boym323/perf/webgl-aircraft-layer-v1 (0ce5418)

## [1.0.128] - 2026-09-26

Changes since v1.0.127:

- perf(radar): add 1000-2000 aircraft scenarios (2ba2421)
- perf(radar): capture p95 frame and collision diagnostics (30b25e5)
- perf(radar): report p95 and browser footprint (261c4f3)
- perf(radar): soak realistic 1600-aircraft load (345a5af)
- test(radar): cover 1600-aircraft performance audit (f7714f9)
- test(radar): update expanded performance scenarios (4c967d2)
- test(radar): update 1600-aircraft soak expectation (fb003ee)
- fix(radar-perf): snapshot timings before forced GC (f8a1dc3)
- Merge pull request #120 from Boym323/perf/radar-1600-audit (5a979b7)

## [1.0.127] - 2026-09-26

Changes since v1.0.126:

- docs: sync changelog through v1.0.126 (c3bd29d)
- ci: tolerate changelog PR permission in ci.yml (58b7c3e)
- ci: tolerate changelog PR permission in changelog-sync.yml (4d008c6)
- Merge pull request #118 from Boym323/automation/changelog-sync (653c6d2)
- Merge pull request #119 from Boym323/fix/changelog-sync-pr-permission (04cab03)

## [1.0.126] - 2026-09-26

Changes since v1.0.125:

- test(perf): add radar soak mode (ced271a)
- test(perf): report soak footprint and SSE churn (390d55c)
- chore: add radar soak benchmark command (367bda0)
- chore: ignore radar soak reports (d5ded68)
- ci: add scheduled radar soak workflow (877a616)
- test: cover scheduled radar soak contract (5a6b117)
- test(intelligence): add deterministic history replay core (ea31316)
- test(intelligence): add history replay CLI (ef84e79)
- test(intelligence): cover deterministic replay scoring (bca4030)
- chore(intelligence): add replay command (3a10190)
- test(intelligence): report sampled replay input (4f3697f)
- fix(analytics): remove airport traffic row truncation (36a8f1e)
- test(analytics): cover complete airport traffic sets (116bf36)
- feat(intelligence): aggregate replay quality metrics (4f339c6)
- feat(intelligence): add replay quality report CLI (a502d91)
- chore: add intelligence quality command (9d315ee)
- test(intelligence): cover replay quality metrics (8783bf2)
- perf(analytics): page complete airport traffic reads (37a866d)
- test(analytics): exercise paged airport traffic reads (12fd289)
- perf(history): batch retention cleanup and expose metrics (4b08300)
- test(history): cover batched retention cleanup (3b2f366)
- refactor(radar): extract aircraft motion runtime (9f5a05f)
- refactor(radar): delegate aircraft interpolation lifecycle (0004017)
- refactor(radar): remove legacy animation job reference (7bc7233)
- test(radar): enforce motion runtime boundary (4f26492)
- refactor(radar): extract weather context data lifecycle (6f74d40)
- refactor(radar): delegate weather context lifecycle (17d45c1)
- fix(radar): keep weather image rendering in map boundary (b8608ea)
- fix(radar): remove duplicate SIGMET state (74f11e9)
- test(radar): enforce weather context boundary (91c35ac)
- test(intelligence): use canonical confidence level (58f8cdc)
- feat(runtime): persist bounded telemetry history (fb6f30f)
- feat(runtime): start telemetry with node runtime (6a8597a)
- feat(runtime): flush telemetry during shutdown (be0bf73)
- security(runtime): rate limit telemetry history (acfe0aa)
- feat(runtime): expose admin telemetry history (bf35f5a)
- test(runtime): cover telemetry persistence and bounds (3780870)
- test(runtime): cover telemetry startup (c97b623)
- test(runtime): protect telemetry history endpoint (d6a2595)
- test(runtime): flush telemetry before service shutdown (7ba418e)
- refactor(system): extract status projections (11352c8)
- refactor(system): extract diagnostic state mapping (0c11e56)
- refactor(system): delegate projection and diagnostic mapping (f3ab6ab)
- test(system): enforce status module boundaries (0e5eb1c)
- fix(history): keep retention diagnostics backwards compatible (bd06e5e)
- test(history): use bounded retention fixtures (26124cd)
- test(history): remove obsolete retention constants (7e4d845)
- refactor(system): extract status contract types (0ccd1ff)
- refactor(system): consume extracted status contract (e20a81f)
- refactor(system): remove diagnostics barrel cycle (e8370db)
- refactor(system): remove projection barrel cycle (89607c6)
- refactor(system): remove obsolete extracted type imports (7d5d2d1)
- fix(system): restore extracted type dependency (cd9c617)
- perf(analytics): aggregate airport traffic per page (ab63c44)
- feat(runtime): trend database and provider health (b49d54b)
- test(runtime): cover persisted health telemetry (896c6b1)
- test(runtime): expose health telemetry to admin (6210db8)
- refactor(radar): extract ATC map time context (cff233c)
- refactor(radar): move map-time polling out of app (d75998b)
- test(radar): cover global map-time boundary (3d9338b)
- feat(system): expose history retention diagnostics (b9e01d5)
- feat(system): sanitize history retention metrics (201c5d9)
- security(system): keep retention metrics admin-only (a0adbac)
- test(system): cover admin retention diagnostics (d60750f)
- Merge pull request #101 from Boym323/test/radar-soak (5e89162)
- chore: sync replay branch with main package scripts (284406c)
- Merge pull request #103 from Boym323/fix/airport-traffic-completeness (e5edacb)
- Merge pull request #106 from Boym323/perf/history-retention-v2 (ee2b983)
- Merge pull request #107 from Boym323/refactor/aircraft-motion-runtime (7b2bc14)
- Merge pull request #109 from Boym323/feat/runtime-telemetry-history (bafa45c)
- Merge pull request #110 from Boym323/refactor/system-status-modules (116d858)
- merge main into flight intelligence replay (c8ea9bf)
- merge main into radar weather context (25b7d8b)
- test(radar): follow extracted motion runtime boundaries (43e1ee0)
- test(radar): align runtime animation assertion (2b3be6e)
- test(radar): sync extracted runtime invariants (bcdf673)
- test(radar): sync extracted runtime invariants (d4f0cb0)
- Merge pull request #115 from Boym323/fix/radar-ui-refactor-invariants (779b4a7)
- Merge pull request #102 from Boym323/test/flight-intelligence-replay (681167a)
- chore: sync intelligence quality scripts with main (118c94d)
- merge main into flight intelligence quality (262bf65)
- Merge pull request #104 from Boym323/test/flight-intelligence-quality (885ca27)
- Merge pull request #114 from Boym323/refactor/radar-map-context-clock (eb7e35e)
- chore(release): sync .github/workflows/ci.yml (295dcae)
- chore(release): sync package.json (b232e62)
- chore(release): sync scripts/changelog.mjs (68ffdcc)
- chore(release): sync CHANGELOG.md (d9caf6c)
- chore(release): add changelog sync workflow (fb51756)
- Merge pull request #108 from Boym323/refactor/radar-weather-context (588796a)
- Merge pull request #116 from Boym323/chore/release-metadata-sync-v2 (ba28cac)
- test(weather): follow extracted radar weather context (430b13f)
- test(radar): follow extracted ATC map context (b0dec8a)
- Merge pull request #117 from Boym323/fix/post-merge-radar-refactor-tests (7f3a410)

## [1.0.125] - 2026-09-26

Changes since v1.0.124:

- security: add public system status projection (10a2063)
- security: protect detailed system diagnostics (cb63c70)
- security: share admin session with diagnostics (5f11a64)
- ui: hide admin-only system diagnostics (36082ba)
- test: cover public diagnostics redaction (2de0b88)
- test: cover shared admin session cookie scope (9cf1b5c)
- fix: preserve system status softRf shape (4db4454)
- Merge pull request #100 from Boym323/fix/public-system-diagnostics (c80956a)

## [1.0.104] - 2026-09-20

Changes since v1.0.103:

- fix: update aircraft marker styles and diagnostics integration (4c34230)
- Merge pull request #74 from Boym323/fix/aircraft-marker-anchoring (4610e95)

## [1.0.103] - 2026-09-20

Changes since v1.0.102:

- fix: restore tar1090 aircraft icon heading (fc9badf)

## [1.0.102] - 2026-09-20

Changes since v1.0.101:

- docs: update changelog for v1.0.101 (e0174ae)

## [1.0.100] - 2026-09-20

Changes since v1.0.99:

- perf: cache live snapshots and public SSE serialization (7d83152)
- perf: apply aircraft deltas incrementally in the browser (82a5817)
- perf: split secondary radar panels from initial bundle (1c134b8)
- Merge pull request #71 from Boym323/perf/large-runtime-optimization (0adbe91)

## [1.0.99] - 2026-09-20

Changes since v1.0.98:

- perf: lazy-load secondary radar data (af42f7f)
- Merge pull request #69 from Boym323/perf/data-loading-round-2 (54df60c)
- feat: add function to determine renderable aircraft motion and update motion history handling (86866e3)
- fix: enhance visibility checks for secondary tools in compact and expanded sidebar (9fb4d1d)
- fix: start aircraft state during server startup (309ef0f)
- test: cover eager aircraft startup (b3937cc)
- test: match ATS map query in production gate (368f72b)
- docs: clarify eager aircraft startup lifecycle (3b4a5eb)
- Merge pull request #70 from Boym323/fix/eager-aircraft-state-startup (9983218)

## [1.0.98] - 2026-09-20

Changes since v1.0.97:

- fix: maintain local position authority over network updates in aircraft observation (e4fc29f)

## [1.0.97] - 2026-09-20

Changes since v1.0.96:

- perf: remove route intelligence from live radar (5714cf7)

## [1.0.96] - 2026-09-20

Changes since v1.0.95:

- perf: reduce optional data loading and radar hot-path work (f6f89d4)
- test: reflect lazy ATS route loading (3d015f4)

## [1.0.95] - 2026-09-20

Changes since v1.0.94:

- refactor: update CI workflows to use manual triggers and remove scheduled runs (c448835)
- feat: enhance trail handling by introducing empty trail initialization and refactoring trail selection logic (025b8b8)
- refactor: update CI workflows to remove scheduled runs and adjust trigger conditions fix: reduce maximum trail speed to prevent cross-map segments test: add case to reject implausible cross-map history jumps (5f28764)
- fix: update selected trail handling in radar UI tests for accurate visibility checks (da5b746)

## [1.0.94] - 2026-09-20

Changes since v1.0.93:

- feat: improve animation handling by refining motion selection and prediction logic (97f69ad)
- fix: prevent false cross-map aircraft trail segments (15fe7a5)

## [1.0.93] - 2026-09-20

Changes since v1.0.92:

- feat: enhance motion handling by preventing out-of-order position updates and ensuring continuous heading during turns (ceea2ae)

## [1.0.92] - 2026-09-20

Changes since v1.0.91:

- feat: enhance aircraft radar quick detail with new tabs and filters (7cf46ca)
- fix: correct URL parameter encoding for re-api.adsb.lol endpoint (04ebbe8)

## [1.0.90] - 2026-09-20

Changes since v1.0.89:

- fix: reduce maxWorkers to 2 for improved stability in test configurations (96b1dae)

## [1.0.89] - 2026-09-19

Changes since v1.0.87:

- feat: add receiver polar coverage component and related styles, tests, and utility functions (fbe4950)
- fix: polish radar UI and ATC translations (226197e)
- feat: update CI workflow to conditionally run tests and add unit/integration test configurations (430afec)
- fix(i18n): update aircraft count formatting and improve localization tests (f4c307f)
- chore(release): prepare v1.0.88 (9c5f5bd)
- test: make changed test selection PR-safe (f1399e4)

## [1.0.85] - 2026-09-19

Changes since v1.0.84:

- fix(aircraft): adjust icon rotation for correct visual alignment (7666641)

## [1.0.83] - 2026-09-19

Changes since v1.0.82:

- fix(system): clarify lazy provider health states (19e9d6c)
- Merge pull request #64 from Boym323/fix/system-status-semantics (3eaf05a)

## [1.0.80] - 2026-09-19

Changes since v1.0.79:

- fix: update network provider status handling and improve track data structure (ed634dc)

## [1.0.77] - 2026-09-19

Changes since v1.0.76:

- feat: implement ATC prediction validation and integrate with aircraft context (19de4be)

## [1.0.76] - 2026-09-19

Changes since v1.0.75:

- feat: add next sector prediction to ATC context with distance and ETA estimates (806f290)

## [1.0.75] - 2026-09-19

Changes since v1.0.73:

- feat: enhance UI components and improve status handling in AirRadarApp (55aa68a)
- feat: add active filter chips and enhance filter functionality in AirRadarApp feat: integrate status badge for emergency squawk in AircraftRadarQuickDetail feat: update Czech and English translations for filter and search functionalities (69169bb)
- feat: add RouteSection component to improve route display in AircraftRadarQuickDetail (c94bf8c)
- Add new weather radar images for September 19, 2026 (f7818f7)
- feat: add UI icons for navigation buttons and enhance ATC traffic labels in multiple languages (58e3111)
- feat: add weather radar archive directory to production gate configuration (9dab8d8)
- docs: update changelog for v1.0.74 (fad29bc)
- refactor: remove unused class from expectedQuickOrder in assertBrowserSmoke function (93d21e5)

## [1.0.73] - 2026-09-19

Changes since v1.0.72:

- feat: add benchmark script for ATC A/B correctness audit (f066f16)
- feat: implement sector candidate retrieval and integrate with ATC sector service (c5a657c)

## [1.0.71] - 2026-09-19

Changes since v1.0.70:

- feat: Enhance ADSB.lol integration with raw data support and failover mechanism (680b1c8)

## [1.0.70] - 2026-09-19

Changes since v1.0.69:

- feat: enhance sector traffic processing with test configuration options and improve streaming tests (7fd3feb)

## [1.0.69] - 2026-09-19

Changes since v1.0.58:

- feat: use Beast stream as local ADS-B primary (b15f389)
- Merge pull request #59 from Boym323/feature/local-beast-stream (69acf3b)
- docs: update changelog for v1.0.59 (a20b3cf)
- fix: classify Mode-S frames in Beast diagnostics (c2df232)
- Merge pull request #60 from Boym323/fix/beast-diagnostics (3126295)
- docs: update changelog for v1.0.60 (b99c4d5)
- fix: count valid Beast transport frames (247b656)
- Merge pull request #61 from Boym323/fix/beast-frame-counter (76f5e64)
- docs: update changelog for v1.0.61 (ea8bbc4)
- fix: keep valid Beast frames out of error counter (3301d58)
- Merge pull request #62 from Boym323/fix/beast-decoder-metric (d2e8a4a)
- docs: update changelog for v1.0.62 (6c8079c)
- fix(beast): parse short Mode-S frame length (8fde1ee)
- Merge pull request #63 from Boym323/fix/beast-short-frame-length (6646cfd)
- docs: update changelog for v1.0.63 (1a54124)
- feat: implement sector traffic context retrieval and API endpoints (4f61b98)
- feat: add sector transitions API and update documentation (6c64c09)
- fix: validate geographic coordinates for sectors, airports, and transmitters (84396a4)
- docs: update changelog for v1.0.64 (baa76dc)
- fix: update release script to use FETCH_HEAD for branch resolution (d221255)
- feat: add application icon and update metadata for better PWA support (f174a3d)
- docs: update changelog for v1.0.65 (1db08e1)
- feat: add sector traffic data handling and visualization in AirRadarApp (62bd728)
- feat: implement ATC sector traffic handling and visualization in AirRadarApp (cab8d32)
- fix: prevent service worker html fallback for runtime assets (6a16240)
- fix: restore radar detail order and bounded polling (65fd8eb)
- feat: add sector traffic history API endpoint and validation logic (c2e18dc)
- fix: reject invalid map bounds coordinates (deb0609)
- docs: update changelog for v1.0.66 (19ee6db)
- fix: skip non-finite aircraft marker coordinates (7c1757e)
- docs: update changelog for v1.0.67 (ad7aee2)
- fix: ignore numeric emergency state as map alert (d4b0b9b)
- docs: update changelog for v1.0.68 (1cc8bcd)
- feat: add GET endpoint for sector traffic history with validation (d48ef54)
- feat: implement traffic history UI with lazy loading and historical API integration (9f9c8ae)
- fix: validate numeric fields in aircraft snapshot recording to prevent malformed data (59616b4)
- docs: add performance characteristics section to ATC sector traffic documentation (facace1)
- feat: enhance traffic history processing with coverage details and add benchmark script (68f68b4)
- feat: optimize traffic history processing by releasing raw FlightPosition rows and improving accumulator management (882b816)
- feat: add synthetic benchmark for ATC sector traffic processing and enhance streaming correctness tests (13bdcd6)

## [1.0.58] - 2026-09-19

Changes since v1.0.57:

- feat(intelligence): enhance UI and add event summary with localization support (742fd33)

## [1.0.57] - 2026-09-19

Changes since v1.0.56:

- feat(flights): add synchronized Flight Story (1ba0f60)
- Merge pull request #57 from Boym323/feature/flight-story-v1 (70fe485)
- fix(deploy): recover stale generated Next files (b3eeb31)
- Merge pull request #58 from Boym323/feature/flight-story-v1 (adbb098)

## [1.0.56] - 2026-09-19

Changes since v1.0.55:

- feat(time-machine): add global map time and historical context (c9aa6b7)
- Merge pull request #56 from Boym323/feature/map-context-v2-global-time (f1cad60)

## [1.0.55] - 2026-09-18

Changes since v1.0.54:

- feat(map): add weather and operational context layers (2b0c33f)
- fix(ci): allow MapLibre data image placeholder (2ddf50d)
- fix(map): use valid radar placeholder image (477c011)
- Merge pull request #55 from Boym323/feature/map-context-v1 (f1d19fd)

## [1.0.54] - 2026-09-18

Changes since v1.0.53:

- fix: add allowPublicationDateMismatch option to parseCzEaipEnr21 for flexible date handling (e369d11)

## [1.0.53] - 2026-09-18

Changes since v1.0.52:

- fix: enhance polygon parsing to support both flat and GeoJSON formats for improved data handling (74a1d8a)
- fix: enhance aircraft animation handling with predictive positioning and correction logic for improved accuracy (a4413a3)

## [1.0.52] - 2026-09-18

Changes since v1.0.51:

- fix: refactor procedure visualization to merge consecutive geometry and improve feature generation (b50874e)
- fix: add automatic fitting of ATC layer bounds to improve visibility of sectors (f7a8938)
- fix: update event row structure to include flight callsign and refine aircraft registration handling (3c9f0e3)
- fix: optimize aircraft animation handling for improved performance and visibility during tab changes (5ae9e46)

## [1.0.51] - 2026-09-18

Changes since v1.0.50:

- fix: improve route data handling in aircraft detail components (81fdab9)
- fix: add descending order support for time machine queries (f72e737)

## [1.0.50] - 2026-09-18

Changes since v1.0.49:

- fix: enhance procedure visualization and coordinate extraction logic (7b67f6f)

## [1.0.49] - 2026-09-18

Changes since v1.0.38:

- fix: harden airport movement inference and queries (73da420)
- fix: correct ATC validity and airport visibility (37269c0)
- test: strengthen map layer and migration production gates (5d6a47a)
- fix: avoid runway label for airport overflights (88a3912)
- Merge pull request #17 from Boym323/automation/harden-movement-atc-gates (af78331)
- Improve airport movement intelligence UX (8643082)
- Merge pull request #18 from Boym323/feature/airport-movement-ux (5236afe)
- style: establish visual system v2 (ccaa4c2)
- polish shared visual shell and secondary layouts (b500a1e)
- style: finish visual system v2 mobile polish (46c26d0)
- Merge pull request #19 from Boym323/feature/visual-system-v2 (ab01830)
- docs: update changelog for v1.0.39 (37353dc)
- refactor: improve diagnostics handling in computeAtcContext function (9eda63c)
- refactor: clean up tsconfig.json by removing unnecessary type includes (2724067)
- feat: make desktop radar map-first (e4e6e36)
- fix: clarify traffic drawer trigger (59708aa)
- chore: add 1280 drawer layer review (f812608)
- fix: refine traffic drawer accessibility (d996edc)
- fix: keep radar layers clear of desktop drawer (918b77e)
- test: refresh frontend ux review captures (74d07f1)
- fix: keep mobile traffic sheet above map (9d4ae48)
- chore: remove temporary ux review artifacts (bd980f6)
- fix: address frontend ux v3 review feedback (871915e)
- fix: address final frontend ux review feedback (7b3f489)
- fix: preserve OGN search shortcut focus (c7149c3)
- Merge pull request #20 from Boym323/feature/frontend-ux-v3 (5fe864f)
- fix: enhance live state snapshot to include public aircraft metadata (9890982)
- docs: update changelog for v1.0.40 (a473e04)
- fix: implement retry logic for ADSBDB failures with exponential backoff (fcfc262)
- fix: keep layers menu above map content (c62f00d)
- fix: keep layers menu above map content (8831c17)
- Merge pull request #21 from Boym323/feature/frontend-ux-v3 (1eada41)
- fix: add public metadata serialization for live state snapshots (43e879a)
- Merge remote-tracking branch 'origin/main' (6c31d64)
- ci: validate every public AirRadar domain (9b97c8a)
- ci: restore configured production health domain (2ea0891)
- fix: add turbopackIgnore comment to runtime state path function (37da2f4)
- fix: update CI workflow for concurrency and simplify deployment steps feat: enhance public serialization for aircraft data and improve test coverage (2462d70)
- docs: update changelog for v1.0.41 (18ed19a)
- test: finalize FlightAware release coverage (64d42c5)
- docs: update changelog for v1.0.0-rc.3 (d539439)
- feat: show additional FlightAware flight plan details (691bab9)
- docs: update changelog for v1.0.0-rc.4 (8bc8246)
- feat: add FlightAware usage data JSON file (8e88ac6)
- feat: enhance aircraft detail page with new layout and data sources (5bb0e22)
- docs: update changelog for v1.0.42 (ed30aa2)
- feat: update FlightAware usage data with new timestamps and request details (84ec575)
- feat: finish aircraft detail v3 visual hierarchy (48a8898)
- docs: update changelog for v1.0.43 (ca164a8)
- style: simplify radar aircraft detail panel (fa8dda8)
- style: load radar aircraft panel polish (fa198ec)
- fix: preserve mobile aircraft drawer controls (26a24a5)
- fix: align aircraft drawer close controls with responsive gate (0c88a97)
- Merge pull request #23 from Boym323/ui/radar-aircraft-panel-polish (69f33d1)
- chore: ignore FlightAware usage runtime state (ab01b00)
- chore: add data/flightaware-usage.json to .gitignore (1e2224d)
- Merge branch 'main' of https://github.com/Boym323/AirRadar (5728cf1)
- docs: update changelog for v1.0.44 (13982bf)
- fix: update RouteIntelligencePanel rendering conditions to exclude NO_ROUTE and NO_ATS_DATA statuses (a1aae78)
- fix: update AirRadarApp to set selected ATC context and display additional details when available (fa76466)
- fix: update AirRadarApp and AirspaceCard to improve ATC context handling and live tracking display (364a9fd)
- fix: update aircraft trail handling to retain complete trails while aircraft are live (3753d34)
- fix: add trail points and memory metrics to system status page and diagnostics (262e675)
- fix: update global search to include aircraft focus and adjust href generation (589e3df)
- fix: update href generation for aircraft search results to use a new path format (1b161c4)
- fix: include registration in cache key for aircraft photo retrieval (677e7b3)
- fix: enhance photo retrieval by prioritizing larger thumbnails from Planespotters API (1d4d282)
- fix: update build lock file path to /var/lib/airradar/build.lock in scripts and documentation (e63b93a)
- fix: improve OGN loading logic to ensure proper snapshot handling and prevent race conditions (7040631)
- fix: add escape key functionality to close UI elements in various components (c11dc62)
- fix: implement reduced motion preferences for smoother animations in AirRadarApp (a6232f2)
- fix: enhance drawer action handling and keyboard shortcut event listener for improved UI responsiveness (417bc33)
- fix: update legend line styles and translations for improved clarity in route visualization (81ef86e)
- fix: update aircraft drawer layout for improved visual clarity and interaction (11eb37f)
- fix: remove effective date display from ATC details for improved clarity (5d0c787)
- fix: enhance SIGMET popup content with detailed information and improve translations for clarity (009bb69)
- fix: update GeoJSON type references for improved type safety and consistency (4527353)
- fix: add @types/geojson for improved type definitions and compatibility (0da0564)
- fix: add timeout to SoftRF test suites for improved stability (1961edb)
- Refactor radar aircraft quick detail (0b2e144)
- Fix compact weather browser gate (0dd4a77)
- Stabilize desktop shortcut browser gate (9747c18)
- Stabilize traffic search focus (5cdaa31)
- Retry traffic search focus after drawer render (2ac991d)
- Avoid flaky repeated search focus assertion (7c5faa7)
- Merge pull request #24 from Boym323/refactor/radar-aircraft-quick-detail (bb582bb)
- Přidání watchdog služby a časovače pro sledování ADSB.lol polling (e6cdf63)
- test: prove quick aircraft flow skips FlightAware (9529789)
- Merge remote-tracking branch 'origin/main' (51d9e62)
- perf: optimize CI test and production gates (7fb9d15)
- perf: parallelize independent CI validation (737034e)
- perf: speed up CI and production validation (d375262)
- feat: add flight intelligence events (f9d5ce9)
- fix: satisfy intelligence lint checks (7e4f715)
- fix: chain flight intelligence migration (94a723c)
- test: include flight intelligence migration (7b8fe82)
- Merge pull request #28 from Boym323/feat/flight-intelligence (e74447d)
- docs: update changelog for v1.0.45 (4aae461)
- Merge pull request #29 from Boym323/chore/changelog-v1.0.45 (8ad173d)
- feat: implement Route Intelligence V2 contracts and associated tests (96fc39a)
- fix: align flight intelligence migration indexes (ebd36f7)
- Merge branch 'main' into feat/route-intelligence-v2 (700d210)
- Merge pull request #31 from Boym323/fix/flight-intelligence-migration (50a0307)
- Merge branch 'main' into feat/route-intelligence-v2 (934bf2a)
- Merge pull request #30 from Boym323/feat/route-intelligence-v2 (138756c)
- feat(route-intelligence): unify runway context (1fc7858)
- feat: add Route Intelligence V2 agent scripts and tasks (f1f310d)
- Merge pull request #32 from Boym323/feat/route-intelligence-v2-agent-scripts (6246ce5)
- Merge remote-tracking branch 'origin/main' into ri-v2/runway (0d7218a)
- feat(route-intelligence): add terminal procedure pipeline (3d22cac)
- Merge remote-tracking branch 'origin/main' into ri-v2/procedures (11afc5e)
- feat(route-intelligence): add v2 static route engine (5d5dc2a)
- Merge origin/main into ri-v2/static-engine (d9549c9)
- feat(route-intelligence): add v2 static route engine (e8711ab)
- feat(route-intelligence): add dynamic route analysis (52a2f61)
- feat(route-intelligence): add v2 route UI and visualization (988fb62)
- Merge remote-tracking branch 'origin/main' into ri-v2/dynamic (35f9f1e)
- Merge remote-tracking branch 'origin/main' into ri-v2/ui (2322aac)
- Merge branch 'main' into ri-v2/procedures (b047e40)
- Merge branch 'main' into ri-v2/runway (c58e2dc)
- fix(route-intelligence): complete empty dynamic snapshot (b1befcf)
- Merge pull request #33 from Boym323/ri-v2/procedures (4f328cd)
- Merge branch 'main' into ri-v2/runway (baa65e9)
- Merge branch 'main' into ri-v2/dynamic (1a3908f)
- Merge branch 'main' into ri-v2/ui (79915ac)
- Merge pull request #35 from Boym323/ri-v2/runway (a1e7e6b)
- Merge branch 'main' into ri-v2/ui (ed9d441)
- merge: integrate latest main into dynamic route intelligence (4171962)
- Merge remote-tracking branch 'origin/ri-v2/dynamic' into ri-v2/dynamic (e1ab680)
- Merge pull request #37 from Boym323/ri-v2/ui (9fe094f)
- Merge branch 'main' into ri-v2/dynamic (41ed539)
- Merge remote-tracking branch 'origin/main' into ri-v2/dynamic (2977fba)
- Přidání podmínky pro zobrazení rozsahu kroužků na základě dostupnosti pozice přijímače (09c442b)
- fix(route-intelligence): complete view DTO contract (ef9ed93)
- Merge remote-tracking branch 'origin/ri-v2/dynamic' into ri-v2/dynamic (ed3820e)
- Merge pull request #36 from Boym323/ri-v2/dynamic (05354c7)
- Merge branch 'main' into fix/receiver-range-availability (b7c89f4)
- Merge pull request #38 from Boym323/fix/receiver-range-availability (737b171)
- fix(enrichment): reject stale route destinations by position (4a44b73)
- Merge pull request #39 from Boym323/fix/route-enrichment-position-gate (808c453)
- docs: update changelog for v1.0.46 (da6e356)
- Merge pull request #40 from Boym323/chore/changelog-v1.0.46 (fea01ba)
- feat(map): add independent SID STAR procedure layers (45ceabd)
- Merge branch 'main' into feat/procedure-map-layers (7bb878e)
- Merge pull request #41 from Boym323/feat/procedure-map-layers (ec0b4cd)
- docs: update changelog for v1.0.47 (9dce1b2)
- feat(intelligence): complete route and flight intelligence integration (4a6c750)
- fix(intelligence): remove duplicate procedure import (06c3416)
- feat(time-machine): add historical traffic playback (c32db9a)
- Merge pull request #42 from Boym323/chore/changelog-v1.0.47 (a7734fa)
- fix(procedures): fail soft when dataset is unavailable (b3c1dc9)
- test(procedures): cover unavailable dataset fallback (1698692)
- fix(procedures): preserve existing procedure fixture (d684204)
- feat(coordinates): add parsing for compact DMS coordinates and integrate into EAIP semantic HTML parsing (c723992)
- Merge main into hardening/intelligence-integration (8d562bf)
- Merge pull request #43 from Boym323/hardening/intelligence-integration (c06419e)
- Merge branch 'main' into feat/coordinates-compact-dms (6095d9d)
- Merge pull request #45 from Boym323/feat/coordinates-compact-dms (961f1c6)
- fix(ui): show all route intelligence phases and sources (bde9dc3)
- fix(i18n): label route departure and arrival phases (5ded0c4)
- fix(i18n): add route phase labels (c65e3e8)
- fix(radar): load aviation data needed by selected routes (6c1d754)
- test(radar): cover route intelligence data loading (493b5e4)
- test(i18n): cover dynamic route phases (b70b26c)
- test(ui): cover route intelligence display semantics (5ef093a)
- fix(ui): expose available receiver technical data (10608c4)
- test(ui): cover receiver telemetry display (2f2aa46)
- Merge pull request #46 from Boym323/fix/data-display-audit (f98ec3f)
- merge main into feature/time-machine-v1 (f5cc221)
- Merge pull request #47 from Boym323/feature/time-machine-v1 (c339746)
- fix: use release-generated Next route types (dd3486c)
- Merge pull request #48 from Boym323/fix/release-route-types (2b109c4)
- fix: allow automated release from shared checkout branch (7dead24)
- Merge pull request #49 from Boym323/fix/automated-release-branch (590be77)
- fix: improve airport validation and streamline procedure fetching logic (c357386)
- Merge pull request #50 from Boym323/fix/airport-validation-procedure-fetch (a39a82c)
- fix: update CI workflow to create GitHub release notes and change permissions to write (2b0946d)
- Merge branch 'main' into fix/github-release-notes-workflow (4f9f4b7)
- Merge pull request #51 from Boym323/fix/github-release-notes-workflow (a70798b)
- feat: add aviation data synchronization scripts and systemd service/timer (e44f3de)
- fix: keep automated release checkout synchronized (8d6161d)
- Merge branch 'main' into fix/automated-release-sync (6f2b270)
- Merge pull request #52 from Boym323/fix/automated-release-sync (06e448e)
- fix: resolve release version from production checkout (ea22eb7)
- Merge pull request #53 from Boym323/fix/release-notes-production-version (ccb092d)
- fix: remove fragile release workflow heredoc (4ae4049)
- Merge pull request #54 from Boym323/fix/release-workflow-heredoc (f71fdd0)

## [1.0.124] - 2026-09-26

## What's Changed
* fix(release): keep production build and GitHub release identity aligned by @Boym323 in https://github.com/Boym323/AirRadar/pull/98
* ci: verify production release identity after deploy by @Boym323 in https://github.com/Boym323/AirRadar/pull/99


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.123...v1.0.124

## [1.0.123] - 2026-09-23

## What's Changed
* feat(intelligence): Flight Intelligence V2 by @Boym323 in https://github.com/Boym323/AirRadar/pull/97


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.122...v1.0.123

## [1.0.122] - 2026-09-23

## What's Changed
* Add production radar performance baseline by @Boym323 in https://github.com/Boym323/AirRadar/pull/96


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.121...v1.0.122

## [1.0.121] - 2026-09-23

## What's Changed
* Refactor AirRadarApp into focused radar UI boundaries by @Boym323 in https://github.com/Boym323/AirRadar/pull/94
* Fix post-refactor CI boundary assertions by @Boym323 in https://github.com/Boym323/AirRadar/pull/95


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.120...v1.0.121

## [1.0.120] - 2026-09-23

## What's Changed
* Decouple live aircraft deltas from React rendering by @Boym323 in https://github.com/Boym323/AirRadar/pull/93


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.119...v1.0.120

## [1.0.119] - 2026-09-23

## What's Changed
* Optimize dense radar rendering and add performance diagnostics by @Boym323 in https://github.com/Boym323/AirRadar/pull/92


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.118...v1.0.119

## [1.0.118] - 2026-09-23

## What's Changed
* fix: align aircraft icons with rendered motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/91


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.117...v1.0.118

## [1.0.117] - 2026-09-23

## What's Changed
* Optimize live radar frontend rendering by @Boym323 in https://github.com/Boym323/AirRadar/pull/90


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.116...v1.0.117

## [1.0.116] - 2026-09-23

## What's Changed
* Remove stop-go jitter from live aircraft motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/89


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.115...v1.0.116

## [1.0.115] - 2026-09-23

## What's Changed
* Replace live dead reckoning with confirmed-position interpolation by @Boym323 in https://github.com/Boym323/AirRadar/pull/86
* Update radar UI invariant for confirmed-position motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/87
* Fix stale confirmed-position marker snaps by @Boym323 in https://github.com/Boym323/AirRadar/pull/88


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.114...v1.0.115

## [1.0.114] - 2026-09-23

## What's Changed
* Enable subpixel positioning for moving map markers by @Boym323 in https://github.com/Boym323/AirRadar/pull/85


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.113...v1.0.114

## [1.0.113] - 2026-09-22

## What's Changed
* Stabilize live aircraft motion by @Boym323 in https://github.com/Boym323/AirRadar/pull/84


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.112...v1.0.113

## [1.0.112] - 2026-09-22

## What's Changed
* Polish responsive radar layout and drawer geometry by @Boym323 in https://github.com/Boym323/AirRadar/pull/83


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.111...v1.0.112

## [1.0.111] - 2026-09-22

## What's Changed
* Fix stale aircraft correction after motion polish by @Boym323 in https://github.com/Boym323/AirRadar/pull/82


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.110...v1.0.111

## [1.0.110] - 2026-09-22

## What's Changed
* Polish aircraft motion and radar map visuals by @Boym323 in https://github.com/Boym323/AirRadar/pull/81


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.109...v1.0.110

## [1.0.109] - 2026-09-22

## What's Changed
* Remove GitHub release test lint warnings by @Boym323 in https://github.com/Boym323/AirRadar/pull/80


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.108...v1.0.109

## [1.0.108] - 2026-09-22

## What's Changed
* Fix post-merge AirRadar audit findings by @Boym323 in https://github.com/Boym323/AirRadar/pull/77
* Fix production release publishing after successful deploy by @Boym323 in https://github.com/Boym323/AirRadar/pull/78
* Fix deep audit correctness, privacy and runtime findings by @Boym323 in https://github.com/Boym323/AirRadar/pull/79


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.107...v1.0.108

## [1.0.107] - 2026-09-22

## What's Changed
* Fix runtime regressions from AirRadar audit by @Boym323 in https://github.com/Boym323/AirRadar/pull/76


**Full Changelog**: https://github.com/Boym323/AirRadar/compare/v1.0.106...v1.0.107

## [1.0.106] - 2026-09-20

Changes since v1.0.105:

- fix: implement source affinity to prevent aircraft feed switching during outages (afb16f9d)

## [1.0.105] - 2026-09-20

Changes since v1.0.104:

- fix: correct tar1090 icon rotation to maintain north-up orientation (9b4702bf)
- Merge pull request #75 from Boym323/fix/aircraft-marker-heading (3465cf47)

## [1.0.101] - 2026-09-20

Changes since v1.0.101:

- No user-facing changes.

## [1.0.91] - 2026-09-20

Changes since v1.0.90:

- feat: enhance browser smoke tests with detailed error handling and mobile navigation checks (16fa7a29)
- feat: implement aircraft icon classification logic and corresponding tests (48349d67)
- feat: enhance aircraft icon classification logic and add comprehensive tests (ee86284d)
- feat: enhance browser smoke tests with deterministic viewport matrix and API response handling (65b64206)
- test(browser): stabilize production smoke gate (07cdb863)
- feat: enhance aircraft motion logic with history tracking and update tests (925bd6f2)
- feat: enhance aircraft trail logic with plausibility checks and update tests (687113df)
- feat: add live tail source and layer for selected trail in AirRadarApp (72040c28)
- feat: enhance network failover provider to support concurrent data sources and deduplication (ce622840)
- fix: increase timeout for browser smoke test to accommodate CI context effects (a46cecff)
- feat: update AdsbLolProvider to support re-api circle queries and enhance response validation (645da0a8)
- feat: enhance browser smoke test with detailed diagnostics and fixture request tracking (11d06bdf)
- fix: improve browser smoke test context handling and layer validation (ade2c616)
- fix: refine browser smoke test viewport handling and error logging (9123ff65)

## [1.0.88] - 2026-09-19

Changes since v1.0.87:

- feat: add receiver polar coverage component and related styles, tests, and utility functions (fbe49506)
- fix: polish radar UI and ATC translations (226197e1)
- feat: update CI workflow to conditionally run tests and add unit/integration test configurations (430afec6)
- fix(i18n): update aircraft count formatting and improve localization tests (f4c307f3)

## [1.0.87] - 2026-09-19

Changes since v1.0.86:

- feat: add receiver coverage API and page components (c1ce1ad6)
- fix(coverage): use receiver timezone for historical periods (d72c8cd7)

## [1.0.86] - 2026-09-19

Changes since v1.0.85:

- Add tests for receiver coverage eligibility and aggregation logic (385ae918)
- feat: enhance aircraft motion handling and add coverage analytics diagnostics (4acdd69b)

## [1.0.84] - 2026-09-19

Changes since v1.0.83:

- feat: add source-aware live radar coverage (7e2e3d3c)

## [1.0.82] - 2026-09-19

Changes since v1.0.81:

- Fix ADSBHub position freshness and bound network trails (b30247fd)

## [1.0.81] - 2026-09-19

Changes since v1.0.80:

- fix: make ATC validation attempt outcomes explicit (11d0616d)

## [1.0.79] - 2026-09-19

Changes since v1.0.78:

- fix: bound concurrent ATC shadow evaluations (5f19f473)

## [1.0.78] - 2026-09-19

Changes since v1.0.77:

- feat: add ADSBHub support for enhanced network aircraft tracking (e1c05b4f)
- feat: enhance ATC prediction validation with classification logic and shadow prediction evaluation (19dcf98d)

## [1.0.74] - 2026-09-19

Changes since v1.0.73:

- feat: enhance UI components and improve status handling in AirRadarApp (55aa68a5)
- feat: add active filter chips and enhance filter functionality in AirRadarApp feat: integrate status badge for emergency squawk in AircraftRadarQuickDetail feat: update Czech and English translations for filter and search functionalities (69169bb2)
- feat: add RouteSection component to improve route display in AircraftRadarQuickDetail (c94bf8cd)
- Add new weather radar images for September 19, 2026 (f7818f75)
- feat: add UI icons for navigation buttons and enhance ATC traffic labels in multiple languages (58e3111d)
- feat: add weather radar archive directory to production gate configuration (9dab8d87)

## [1.0.72] - 2026-09-19

Changes since v1.0.71:

- feat: refactor caching mechanism to use lru-cache and update related tests (50a42f0b)
- feat: replace console error logging with logger in aircraft state service tests (fe58f49a)

## [1.0.68] - 2026-09-19

Changes since v1.0.67:

- fix: ignore numeric emergency state as map alert (d4b0b9b3)

## [1.0.67] - 2026-09-19

Changes since v1.0.66:

- fix: skip non-finite aircraft marker coordinates (7c1757ec)

## [1.0.66] - 2026-09-19

Changes since v1.0.65:

- feat: add sector traffic history API endpoint and validation logic (c2e18dc8)
- fix: reject invalid map bounds coordinates (deb06097)

## [1.0.65] - 2026-09-19

Changes since v1.0.64:

- fix: update release script to use FETCH_HEAD for branch resolution (d2212553)
- feat: add application icon and update metadata for better PWA support (f174a3dd)

## [1.0.64] - 2026-09-19

Changes since v1.0.63:

- feat: implement sector traffic context retrieval and API endpoints (4f61b985)
- feat: add sector transitions API and update documentation (6c64c09d)
- fix: validate geographic coordinates for sectors, airports, and transmitters (84396a4f)

## [1.0.63] - 2026-09-19

Changes since v1.0.62:

- fix(beast): parse short Mode-S frame length (8fde1ee3)
- Merge pull request #63 from Boym323/fix/beast-short-frame-length (6646cfd2)

## [1.0.62] - 2026-09-19

Changes since v1.0.61:

- fix: keep valid Beast frames out of error counter (3301d58c)
- Merge pull request #62 from Boym323/fix/beast-decoder-metric (d2e8a4af)

## [1.0.61] - 2026-09-19

Changes since v1.0.60:

- fix: count valid Beast transport frames (247b656f)
- Merge pull request #61 from Boym323/fix/beast-frame-counter (76f5e648)

## [1.0.60] - 2026-09-19

Changes since v1.0.59:

- fix: classify Mode-S frames in Beast diagnostics (c2df232b)
- Merge pull request #60 from Boym323/fix/beast-diagnostics (3126295b)

## [1.0.59] - 2026-09-19

Changes since v1.0.58:

- feat: use Beast stream as local ADS-B primary (b15f3895)
- Merge pull request #59 from Boym323/feature/local-beast-stream (69acf3b8)

## [1.0.47] - 2026-09-17

Changes since v1.0.46:

- Merge pull request #40 from Boym323/chore/changelog-v1.0.46 (fea01ba8)
- feat(map): add independent SID STAR procedure layers (45ceabd7)
- Merge branch 'main' into feat/procedure-map-layers (7bb878ec)
- Merge pull request #41 from Boym323/feat/procedure-map-layers (ec0b4cd3)

## [1.0.46] - 2026-09-17

Changes since v1.0.45:

- Přidání podmínky pro zobrazení rozsahu kroužků na základě dostupnosti pozice přijímače (09c442bd)
- Merge branch 'main' into fix/receiver-range-availability (b7c89f42)
- Merge pull request #38 from Boym323/fix/receiver-range-availability (737b171d)
- fix(enrichment): reject stale route destinations by position (4a44b733)
- Merge pull request #39 from Boym323/fix/route-enrichment-position-gate (808c453f)

## [1.0.45] - 2026-09-17

Changes since v1.0.44:

- fix: update RouteIntelligencePanel rendering conditions to exclude NO_ROUTE and NO_ATS_DATA statuses (a1aae780)
- fix: update AirRadarApp to set selected ATC context and display additional details when available (fa764664)
- fix: update AirRadarApp and AirspaceCard to improve ATC context handling and live tracking display (364a9fd3)
- fix: update aircraft trail handling to retain complete trails while aircraft are live (3753d34d)
- fix: add trail points and memory metrics to system status page and diagnostics (262e675f)
- fix: update global search to include aircraft focus and adjust href generation (589e3df6)
- fix: update href generation for aircraft search results to use a new path format (1b161c43)
- fix: include registration in cache key for aircraft photo retrieval (677e7b36)
- fix: enhance photo retrieval by prioritizing larger thumbnails from Planespotters API (1d4d2822)
- fix: update build lock file path to /var/lib/airradar/build.lock in scripts and documentation (e63b93a5)
- fix: improve OGN loading logic to ensure proper snapshot handling and prevent race conditions (7040631c)
- fix: add escape key functionality to close UI elements in various components (c11dc626)
- fix: implement reduced motion preferences for smoother animations in AirRadarApp (a6232f25)
- fix: enhance drawer action handling and keyboard shortcut event listener for improved UI responsiveness (417bc339)
- fix: update legend line styles and translations for improved clarity in route visualization (81ef86e9)
- fix: update aircraft drawer layout for improved visual clarity and interaction (11eb37f2)
- fix: remove effective date display from ATC details for improved clarity (5d0c7872)
- fix: enhance SIGMET popup content with detailed information and improve translations for clarity (009bb69f)
- fix: update GeoJSON type references for improved type safety and consistency (45273537)
- fix: add @types/geojson for improved type definitions and compatibility (0da0564a)
- fix: add timeout to SoftRF test suites for improved stability (1961edba)
- Refactor radar aircraft quick detail (0b2e1447)
- Fix compact weather browser gate (0dd4a772)
- Stabilize desktop shortcut browser gate (9747c18b)
- Stabilize traffic search focus (5cdaa318)
- Retry traffic search focus after drawer render (2ac991d7)
- Avoid flaky repeated search focus assertion (7c5faa73)
- Merge pull request #24 from Boym323/refactor/radar-aircraft-quick-detail (bb582bb9)
- Přidání watchdog služby a časovače pro sledování ADSB.lol polling (e6cdf63a)
- test: prove quick aircraft flow skips FlightAware (95297895)
- Merge remote-tracking branch 'origin/main' (51d9e622)
- perf: optimize CI test and production gates (7fb9d154)
- perf: parallelize independent CI validation (737034e6)
- perf: speed up CI and production validation (d375262c)
- feat: add flight intelligence events (f9d5ce94)
- fix: satisfy intelligence lint checks (7e4f715a)
- fix: chain flight intelligence migration (94a723c9)
- test: include flight intelligence migration (7b8fe829)
- Merge pull request #28 from Boym323/feat/flight-intelligence (e74447db)

## [1.0.44] - 2026-09-15

Changes since v1.0.43:

- style: simplify radar aircraft detail panel (fa8dda8d)
- style: load radar aircraft panel polish (fa198ec9)
- fix: preserve mobile aircraft drawer controls (26a24a5a)
- fix: align aircraft drawer close controls with responsive gate (0c88a978)
- Merge pull request #23 from Boym323/ui/radar-aircraft-panel-polish (69f33d1f)
- chore: ignore FlightAware usage runtime state (ab01b00b)
- chore: add data/flightaware-usage.json to .gitignore (1e2224d5)
- Merge branch 'main' of https://github.com/Boym323/AirRadar (5728cf13)

## [1.0.43] - 2026-09-15

Changes since v1.0.42:

- feat: update FlightAware usage data with new timestamps and request details (84ec5758)
- feat: finish aircraft detail v3 visual hierarchy (48a88981)

## [1.0.42] - 2026-09-15

Changes since v1.0.0-rc.4:

- feat: add FlightAware usage data JSON file (8e88ac6d)
- feat: enhance aircraft detail page with new layout and data sources (5bb0e22b)

## [1.0.0-rc.4] - 2026-09-15

Changes since v1.0.0-rc.3:

- feat: show additional FlightAware flight plan details (691bab9a)

## [1.0.0-rc.3] - 2026-09-15

Changes since v1.0.41:

- test: finalize FlightAware release coverage (64d42c50)

## [1.0.41] - 2026-09-15

Changes since v1.0.40:

- fix: add turbopackIgnore comment to runtime state path function (37da2f42)
- fix: update CI workflow for concurrency and simplify deployment steps feat: enhance public serialization for aircraft data and improve test coverage (2462d707)

## [1.0.40] - 2026-09-15

Changes since v1.0.39:

- refactor: clean up tsconfig.json by removing unnecessary type includes (27240678)
- feat: make desktop radar map-first (e4e6e366)
- fix: clarify traffic drawer trigger (59708aac)
- chore: add 1280 drawer layer review (f8126086)
- fix: refine traffic drawer accessibility (d996edce)
- fix: keep radar layers clear of desktop drawer (918b77e5)
- test: refresh frontend ux review captures (74d07f13)
- fix: keep mobile traffic sheet above map (9d4ae489)
- chore: remove temporary ux review artifacts (bd980f68)
- fix: address frontend ux v3 review feedback (871915e7)
- fix: address final frontend ux review feedback (7b3f4896)
- fix: preserve OGN search shortcut focus (c7149c32)
- Merge pull request #20 from Boym323/feature/frontend-ux-v3 (5fe864fe)
- fix: enhance live state snapshot to include public aircraft metadata (98909827)

## [1.0.39] - 2026-09-14

Changes since v1.0.38:

- fix: harden airport movement inference and queries (73da4203)
- fix: correct ATC validity and airport visibility (37269c07)
- test: strengthen map layer and migration production gates (5d6a47ac)
- fix: avoid runway label for airport overflights (88a39122)
- Merge pull request #17 from Boym323/automation/harden-movement-atc-gates (af783315)
- Improve airport movement intelligence UX (86430821)
- Merge pull request #18 from Boym323/feature/airport-movement-ux (5236afe9)
- style: establish visual system v2 (ccaa4c2c)
- polish shared visual shell and secondary layouts (b500a1ef)
- style: finish visual system v2 mobile polish (46c26d08)
- Merge pull request #19 from Boym323/feature/visual-system-v2 (ab018303)

## [1.0.38] - 2026-09-12

Changes since v1.0.37:

- feat: add ATS point search functionality and update related components (28d12b5b)

## [1.0.37] - 2026-09-12

Changes since v1.0.36:

- fix: enable production Austrian ATC ATS sync (61e64830)

## [1.0.36] - 2026-09-12

Changes since v1.0.35:

- feat: enhance ATC data structure with airspace type and class; improve runtime state directory handling (17307733)
- feat: add Austria ATC and ATS coverage (021b7dc9)

## [1.0.35] - 2026-09-12

Changes since v1.0.34:

- feat: add scripts for syncing and fetching Slovak air traffic data (8889e794)

## [1.0.34] - 2026-09-12

Changes since v1.0.33:

- feat(changelog): add normalization and version sorting functionality (a3dc4513)
- feat(animation): replace animation frame with low-frequency timer for smoother aircraft movement (13c178d0)

## [1.0.33] - 2026-09-12

Changes since v1.0.32:

- feat(animation): implement aircraft animation job management and optimize rendering (9cb1e8d8)

## [1.0.32] - 2026-09-12

Changes since v1.0.31:

- feat(geo): add distanceToGreatCircleSegmentKm function and coordinate validation (de67b36b)
- feat(adsbdb): persist enrichment cache across restarts (8925da5c)

## [1.0.31] - 2026-09-12

Changes since v1.0.30:

- feat(weather): persist aviation weather cache across restarts (8fa9a07a)

## [1.0.30] - 2026-09-12

Changes since v1.0.29:

- fix(map): configure MapLibre worker for GeoJSON overlays (8729f806)

## [1.0.29] - 2026-09-12

Changes since v1.0.28:

- fix(ui): harden responsive map controls and mobile layout (31d53386)

## [1.0.28] - 2026-09-12

Changes since v1.0.27:

- fix: make aviation map layers recover reliably (b2cb2785)
- feat: add airport movement intelligence v2 (99ca4068)
- chore: remove obsolete visual polish images (5a8cd334)
- feat: add map radius configuration and filter airports within radius (dbfd1355)

## [1.0.27] - 2026-09-12

Changes since v1.0.26:

- feat: enhance airport visibility filtering and add related tests (814db0e7)

## [1.0.26] - 2026-09-12

Changes since v1.0.25:

- fix: keep release checkout free of generated Next files (51ef21f5)
- fix: keep release checkout free of generated Next files (1f7be7df)
- fix: release tested main commit (4adf67ab)
- fix: release tested main commit (ad8b85b1)
- feat: add Czech airspace activity types (c6a3e567)
- feat: parse Czech AUP UUP and actual activations (b409fdf6)
- feat: add Czech airspace activity provider (30900ab9)
- feat: rate limit airspace activity endpoint (572e94d9)
- feat: expose Czech airspace activity API (05fd9c88)
- test: cover Czech airspace activity parsing (4e6d83ba)
- docs: document Czech airspace activity feed (afe471b5)
- Merge main into feature/airspace-activity-aup-uup (e6bcb919)
- Merge pull request #12 from Boym323/feature/airspace-activity-aup-uup (4f65be04)
- fix: add FlightAware upstream cost guard (2a0a54d5)
- fix: make FlightAware enrichment on-demand only (71b7f7b0)
- fix: require explicit FlightAware enablement (358529a1)
- fix: load FlightAware only from aircraft detail (c06a131d)
- refactor: expose FlightAware budget limit safely (d122ef8d)
- test: enforce FlightAware on-demand enrichment (5745be36)
- test: cover FlightAware request budget and pagination (5a831376)
- docs: document FlightAware double opt-in cost guard (5ec09512)
- fix: avoid caching rate-limited partial FlightAware plans (afb9b5d6)
- test: cover FlightAware double opt-in configuration (c8200931)
- feat: add airspace activity map matching (8f2d4771)
- test: cover airspace activity map joins (d991b03d)
- fix: keep airspace map joins country-safe (705e74ac)
- test: reject foreign airspace designators (0074dd07)
- feat: add airspace activity map translations (88dfeb13)
- fix: match embedded Czech TRA TSA names safely (f6b25a82)
- chore: add temporary airspace map UI patcher (9aa1d731)
- chore: add temporary branch UI patch workflow (6b948098)
- feat: visualize planned airspace activity on radar map (d659489e)
- chore: remove temporary airspace map patch workflow (5c9da30e)
- chore: remove temporary airspace map patch helper (b709c1c4)
- test: cover published Czech airspace names (c9e42581)
- docs: describe AUP UUP map semantics (732d5067)
- test: account for lazy airspace activity fetch (f0dfe2f7)
- Merge pull request #14 from Boym323/feature/airspace-activity-map (8291bd32)
- fix: harden FlightAware cost guard (967acfd0)
- merge: update FlightAware cost guard with main (165b6957)
- test: fix FlightAware fetch mock typing (c82754ab)
- test: align FlightAware provider expectations with cost guard (fd3006ab)
- test: clean FlightAware cost guard lint warning (72059430)
- Merge pull request #13 from fix/v1.5c1-flightaware-cost-guard (208b8654)
- fix: enrich direct aircraft detail on demand (c3ef9993)
- fix: expose bounded airport traffic truncation (fdc7dbfc)
- perf: bound SoftRF snapshot loading memory (13f95b6a)
- perf: upsert receiver altitude coverage cells (2c675d57)
- fix: make route intelligence retryable and deterministic (400a5467)
- docs: document route and airspace intelligence (43ba588c)
- chore: apply final review follow-up codemod (5c8a8722)
- fix: complete reviewed radar resilience fixes (c4b82cd4)
- chore: remove temporary review codemod workflow (35ad552e)
- test: type aircraft enrichment fixture as Aircraft (4e495df4)
- Merge pull request #15 from fix/review-followups-20260911 (5a5bfd06)
- docs: update deployment and recovery instructions for clarity and best practices (32c43744)
- refactor: isolate radar live stream hook (70c87391)
- chore: reduce next build tracing warnings (4498f35c)
- feat: add backwards-compatible SSE delta v2 (8648b71c)
- docs: define future airport movement intelligence (4e99545f)
- Merge pull request #16 from Boym323/automation/overnight-sse-delta-v2 (57acf27b)

## [1.0.25] - 2026-09-10

Changes since v1.0.24:

- feat: enhance airport traffic classification logic and add related tests (626ff809)

## [1.0.24] - 2026-09-10

Changes since v1.0.23:

- feat: Enhance air traffic and weather features (c820306b)

## [1.0.23] - 2026-09-10

Changes since v1.0.22:

- feat: add squawk detail to AircraftDetailV2 component (1af6fad5)
- feat: enhance aircraft detail view with flight plan and altitude chart features (0f17e0f7)

## [1.0.22] - 2026-09-10

Changes since v1.0.21:

- fix: keep release builds from modifying tracked config (f8f73f17)

## [1.0.21] - 2026-09-10

Changes since v1.0.20:

- fix: update paths for Next.js release types to version 21023 (1035203c)

## [1.0.20] - 2026-09-10

Changes since v1.0.19:

- fix: update paths for Next.js release types in tsconfig and import statements (17fd5815)
- feat: add systemd service and timer for SoftRF OGN snapshot updates (fd189b4b)

## [1.0.19] - 2026-09-10

Changes since v1.0.18:

- feat: implement SoftRF metadata validation and checksum verification for emergency whitelist (85b29ad6)

## [1.0.18] - 2026-09-10

Changes since v1.0.17:

- feat: implement isolated build directory for production releases (6c6eb5b3)
- chore: update dependencies and devDependencies in package.json (8c520b43)
- chore: update dependencies and configuration for Next.js 16 and Tailwind CSS 4 (e0f7ecc0)

## [1.0.17] - 2026-09-10

Changes since v1.0.16:

- style: improve layout and responsiveness of history and secondary pages (e189a6c3)

## [1.0.16] - 2026-09-10

Changes since v1.0.15:

- Add radar-selected image for visual polish at 1440x900 resolution (1aeee23f)
- docs: update release and development guidelines for build consistency and visual changes (96863989)
- feat: finalize visual polish v2 (211298d3)

## [1.0.15] - 2026-09-10

Changes since v1.0.14:

- feat: update weather status logic to prevent premature offline marking for METAR/TAF (6f88feb3)

## [1.0.14] - 2026-09-10

Changes since v1.0.13:

- feat: optimize release process by running npm ci with local cache and parallelizing lint, typecheck, and tests (d82388e6)
- feat: implement persistent caching for OGN DDB resolutions with file-based storage (85875919)

## [1.0.13] - 2026-09-10

Changes since v1.0.12:

- docs: update recovery runbook to reflect new migration details and safety checks (1c77b204)
- feat: enhance OGN privacy handling and DDB integration (f0aec448)

## [1.0.12] - 2026-09-10

Changes since v1.0.11:

- fix: update OgnStateService to use a fixed timestamp for testing (8e367fae)

## [1.0.11] - 2026-09-10

Changes since v1.0.10:

- feat: enhance OGN DDB handling and improve privacy features (1203fb49)

## [1.0.10] - 2026-09-10

Changes since v1.0.9:

- feat: extend build wait timeout to accommodate longer production builds (98315c29)
- feat: add airports sync script and corresponding tests (043516b6)

## [1.0.9] - 2026-09-10

Changes since v1.0.8:

- feat: Enhance SIGMET handling and diagnostics (45930d92)
- Add new aircraft icons and ground symbols in SVG format (d63c8f98)

## [1.0.8] - 2026-09-10

Changes since v1.0.7:

- feat(weather): integrate aviation weather functionality and diagnostics (033ab5d4)
- feat: enhance production gate logic to support dynamic build metadata versioning (f556b10a)
- feat(env): expand configuration options for receiver and weather integration (aea8d844)

## [1.0.7] - 2026-09-09

Changes since v1.0.6:

- Add new aircraft icons and sync script for tar1090 (47918dc5)

## [1.0.6] - 2026-09-09

Changes since v1.0.5:

- feat: add User-Agent header to ADSB.lol requests (5bac7791)

## [1.0.5] - 2026-09-09

Changes since v1.0.4:

- fix: handle stale network positions and improve aircraft merging logic (e3fcc215)

## [1.0.4] - 2026-09-09

Changes since v1.0.3:

- fix: retain local aircraft in extended coverage even when position is stale or unavailable (4295f1bc)

## [1.0.3] - 2026-09-09

Changes since v1.0.2:

- fix: make ADSB.lol arbitration and polling independent (28fccfec)

## [1.0.2] - 2026-09-09

Changes since v1.0.1:

- feat: Add ADS-B LOL provider and integrate network diagnostics (1e34569e)

## [1.0.1] - 2026-09-09

Changes since v1.0.0:

- feat: integrate Geist font and enhance aircraft detail display (378a8c15)

## [1.0.0-rc.2] - 2026-09-09

Changes since v1.0.0-rc.1:

- fix: cap tar1090 fallback cache by bytes (4a84ee1b)
- test: support release candidate production gates (f45e98c1)

## [1.0.0-rc.1] - 2026-09-09

Changes since v0.1.13:

- fix: bound aircraft metadata catalog memory (6b32fe38)
- perf: optimize recap queries (d1a7d48d)
- perf: compact live stream and bound SSE clients (82088886)
- fix: scope public rate limits per client (9e4167ad)
- fix: protect watchlist mutations (49774910)
- feat: expose bounded runtime diagnostics (91402c90)
- fix: bound alert ledger growth (f687960f)
- chore: prepare stable release metadata (14d4e32e)
- fix: improve PWA and accessibility basics (f55b1af2)
- test: add production stability gates (c91a8d13)
- ops: document backup and recovery (dfb480e9)
- chore: mark production builds with stable channel (8ffb5f8c)
- test: report production payload measurements (35b73966)
- fix: report metadata catalog diagnostics (2a237a47)
- test: stabilize release channel fixture (5e3f0f67)
- fix: bound tar1090 metadata fallback cache (f201265c)
- fix: report process cgroup memory diagnostics (def27a1c)
- test: cover SSE cleanup and client rate isolation (24f24d96)
- docs: document bounded metadata and memory diagnostics (c246715d)
- test: stabilize browser accessibility gate (33b6ef0e)
- feat: support release candidate deployments (b07ecf4c)

## [1.0.0] - 2026-09-09

Changes since v1.0.0-rc.2:

- No user-facing changes.

## [0.1.13] - 2026-09-09

Changes since v0.1.12:

- feat: enhance backfillChangelog to support release dates and commits (eefc3360)
- feat: persist product alert events (df19de6d)
- feat: explain interesting live aircraft (24c21923)
- feat: add daily and weekly receiver recaps (c3cae270)
- feat: expand system source status (7bab251e)
- fix: polish application UX (e72b3146)
- fix: make record alerts restart safe (9e394397)
- docs: document batch 4 product flows (fdebe871)
- fix: bound alert event deduplication (6a8e10c3)
- fix: persist runtime alert state outside source tree (8898a796)

## [0.1.12] - 2026-09-09

Changes since v0.1.11:

- fix: ensure fetch-tags is set to true for changelog tests (69faa806)

## [0.1.11] - 2026-09-09

Changes since v0.1.10:

- feat: add nearby airports (96db59a6)
- feat: add airport traffic heatmap (d3991c93)
- feat: add receiver range rings (541e7ba4)
- feat: add aircraft map color modes (3dc6bc2f)
- feat: improve radar labels (f364c227)
- feat: improve history playback (30b7eeee)
- feat: sync flight profiles with playback (1f83f61b)
- feat: compare receiver statistics periods (9e3efcba)
- fix: keep period comparison at response boundary (d3f64cd9)

## [0.1.10] - 2026-09-09

Changes since v0.1.9:

- feat: implement automatic changelog generation and update release procedure (e36116ef)
- feat: add backfill functionality to changelog generation script and update tests (63d64408)
- fix: correct indentation for fetch-depth in CI workflow (d5471c36)

## [0.1.9] - 2026-09-09

Changes since v0.1.8:

- feat: add observed aircraft fleet (f86c995f)
- feat: add lifetime aircraft statistics (da57af7f)
- feat: detect first-time aircraft observations (65273932)
- feat: classify rare and returning aircraft (39b1c05f)
- feat: add receiver reception records (95fc0dbc)
- feat: add dashboard logbook summary (ca0bf9ef)
- fix: restore statistics test fixtures (c08f5803)

## [0.1.8] - 2026-09-08

Changes since v0.1.7:

- feat: add standalone flight detail (b5eca01e)
- feat: add flight performance profiles (fc766c62)
- feat: add bounded statistics csv export (de9a31ce)
- feat: add radar keyboard shortcuts (248c5463)

## [0.1.7] - 2026-09-08

Changes since v0.1.6:

- docs: organize token-efficient project documentation (9bcc9430)
- feat: add airport traffic summary (40d88454)

## [0.1.6] - 2026-09-08

Changes since v0.1.5:

- feat: add aircraft history summary feature with localization support (e667ac20)

## [0.1.5] - 2026-09-08

Changes since v0.1.4:

- fix: add degree labels to coverage polar chart (61b33e30)

## [0.1.4] - 2026-09-08

Changes since v0.1.3:

- feat: enhance coverage statistics with detailed analysis and summary features (aafc0f80)

## [0.1.3] - 2026-09-08

Changes since v0.1.2:

- feat: add optional aircraft photos (07df353e)

## [0.1.2] - 2026-09-08

Changes since v0.1.1:

- feat: implement ATC frequency validation and update related logic (46cc8c95)

## [0.1.1] - 2026-09-08

Changes since v0.1.0:

- feat: add map aircraft filters (6968cd66)

## [0.1.0] - 2026-09-08

- Initial commit (18c5a6fb)
- feat: add AirRadar ADS-B radar MVP (05af4e5c)
- migrate AirRadar to Prisma 8 (376e9ab9)
- feat: add aircraft state service tests and ATC sector matching tests (b79d880e)
- Add tests for ADSBDB and FlightAware flight plan providers (091e1b68)
- feat: enhance configuration and improve ATC data handling (3cad8ebd)
- feat: add aircraft enrichment merging logic and enhance tests for metadata handling (8b22a1a9)
- feat: enhance aircraft state management and receiver handling (435500ae)
- feat: add timezone configuration and enhance date handling in aircraft state service (9ab87059)
- Add initial database schema and tables for aviation data (d28384aa)
- feat(i18n): add Czech and English translations, update receiver name to use translations (78838628)
- feat: integrate Temporal API and update date handling across the application (95ba8d64)
- feat: enhance aircraft history management with deduplication and retry logic (e8f1fe77)
- feat: refactor git command usage in release script for improved consistency and error handling (2a211735)
- feat: update service and proxy configurations to use production LAN address (962f54e0)
- feat: implement public receiver position handling and rate limiting for API endpoints (2f56a197)
- feat: add ATC import script and validation tests (172a4beb)
- feat(atc): add Czech ATC synchronization and status scripts (2d79c3f9)
- feat: update LOCAL_HEALTH_URL to use production LAN address for Nginx Proxy compatibility (c8c53440)
- feat: Implement ČÚZK Data50 state boundary provider and associated features (d9b18d1e)
- Add initial contract snapshot for PostgreSQL schema with aircraft and flight models (08630614)
- feat: Enhance aircraft metadata and boundary handling with new attributes and validation (ec15a397)
- feat: Add airport data fetching and integrate with route display (9d680de0)
- feat: enhance boundary handling and airport import functionality (52698ebb)
- feat: streamline upsert operations by removing redundant where clauses and adding conflict resolution (38c4f8ab)
- Add Open Sans Semibold font files and README documentation (228e5b7f)
- feat: update aircraft marker styles and SVG paths for improved visuals (6ffb8599)
- feat: use licensed aircraft silhouette icons (2cc35c27)
- fix: thicken aircraft marker strokes (5dc1252a)
- fix: size aircraft markers for map readability (8f32e837)
- feat: enhance aircraft identifier normalization and improve related documentation (c9abf5f0)
- feat: add altitude, ground speed, and track to aircraft trail points and history (21bdc6ea)
- test: use fake timers for observation metadata test (590bad20)
- feat: enhance aircraft history persistence with partial failure reporting (f5819a9b)
- feat: implement aircraft motion timing and animation targets for smoother transitions (ea9e347f)
- feat: enhance flight history functionality with new API endpoints and playback features (89b6d089)
- feat(atc): enhance aviation coordinate parsing and add altitude confidence (b04ea6c5)
- feat(atc): implement relevant ATC frequency panel and associated logic (9c5899bd)
- feat(atc): make summaries prop optional and enhance compatibility with older servers (b5c76812)
- feat: add dynamic export to enable forced dynamic rendering (16be68d8)
- feat: implement server alerts system with Pushover integration (4763b757)
- feat(atc): enhance ATC dataset status management and add comprehensive tests (83e9f03a)
- feat: implement diagnostic policy for Czech eAIP parsing (57882442)
- Add receiver statistics tests and implement persistence mock (4838fe3f)
- feat: implement airport resolver with database fallback and normalization functions (36e772fc)
- feat: add on-demand weather API for airports with METAR/TAF data (d58a35a2)
- feat: add tests for AirportWeatherDisclosure component and its behavior (85e3c759)
- feat: implement shutdown coordinator with cleanup phases and tests (b5998023)
- feat: implement shutdown coordinator with signal handling and production start script (d0c37c51)
- feat: enhance airport visibility and UI controls (e7216598)
- feat: add systemd unit deployment and validation in release process (126e884c)
- feat: add targeted and changed test scripts for improved development workflow (5f116f23)
- feat: add Playwright for testing and enhance radar UI tests for marker positioning (b2c3dbda)
- feat: implement build lock mechanism for production builds and add related tests (53eb09dc)
- feat: add airport detail page with weather and map components, enhance airport navigation (7157af51)
- feat(statistics): add support for statistics range queries and trend charts (b165f668)
- feat: implement aircraft detail page with recent flights and API integration (25228691)
- feat(trail): implement trail point management and selection logic for aircraft history (f2ae4c9c)
- feat(route): add route visualization v2 (5a5b0b0a)
- feat(search): add global aircraft and airport search (1b1b3208)
- test: cover live track route and search integration (a5ce0bbc)
- fix(ci): update GitHub Actions to use checkout and setup-node v5 (c501cb35)
- feat: implement watchlist management API and UI (088c40c3)
- feat: add system status API and frontend page (fad9afc3)
- feat: add versioning API and build metadata management (db0b013f)
