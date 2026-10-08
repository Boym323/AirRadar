# My Sky Experience V2

## Goal

My Sky V2 makes existing LOCAL receiver data useful within one glance:
which aircraft is over or near the observer, why it is noteworthy, and
how to view it on the radar, open aircraft details or create a watchlist
rule. This is an incremental UX layer on top of **Mobile Spotter V1**,
not a second backend, feed, flight tracker or notification engine.

## Behaviour

The `/spotter` page shows **Over your head / Právě nad vámi** directly
after the existing location selector, ahead of the existing 60-minute
briefing. Location access is requested **only by an explicit user
interaction** with My location / Show my sky; receiver mode remains
the default. Without permission, a readable state is shown rather
than assuming coordinates.

The curated cards use only aircraft with direct LOCAL receiver origin
or independently recorded LOCAL provenance, valid positions and
distance **within 30 km of the observer**. The observer distance and
bearing are calculated in the browser, not from receiver-relative
`distanceKm`. Existing spotter interest scoring supplies explained
reason codes (iconic type, emergency, rare, new, widebody, proximity).
The closest-approach geometry is the same existing bounded kinematic
projection used elsewhere in Spotter. This is **not** a confirmed
flight path or an ATC intent predictor.

A small deterministic top-five list favors interesting, nearby,
overhead and soon-approaching aircraft and retains stable ICAO
tie-breaking. Nearby, interesting and approaching counts cover all
eligible LOCAL aircraft, not just the visible top five. A user can
select an aircraft in this list. Selection controls both the existing
Sky Story and Sky Finder target; if a selected flight disappears from
LOCAL coverage, the currently best eligible flight is shown instead.
No extra polling, coordinates upload or model prediction is created.

## User actions and safeguards

The selected aircraft offers existing links to the live radar
(`/?aircraft=<hex>`), aircraft detail (`/aircraft/<hex>`) and
pre-filled watchlist creation (`/watchlist?icaoHex=<hex>` plus known
registration). This deliberately reuses the existing watchlist rules
and local-only browser notifications; **no notification permission
or persistent watch rule is enabled automatically**.

When the source is stale/unavailable, the My Sky focus never claims
LIVE. The page keeps the existing opt-in background saved-spot flow,
local logbook, visual acquisition, photo/lighting predictions, and
60-minute briefing unchanged. Observer GPS stays private in the
browser unless the user separately and explicitly saves a spot
under the existing protected saved-spots API. The UI displays no
precise observer coordinates.

## Verification

`tests/spotter-my-sky-focus-v2.test.ts` covers LOCAL-only filtering,
invalid positions, observer-vs-receiver geometry, iconic priority,
de-duplication, bounded lists, manual selection/fallback, and reuse
of established watchlist / radar / detail paths. Production browser
smoke captures deterministic `/spotter` desktop and 390 px mobile
onboarding views without silently granting GPS access.

## B2 — Personal Sky Intelligence

The user's **favorites** are explicit ICAO hex identifiers (exactly six hex
characters) persisted under `airradar.my-sky-favorites.v1` in browser
`localStorage`. The bounded, sanitized V1 store holds at most 32
deduplicated favorites. The selected My Sky flight can be added or
removed with a single deliberate button action. Missing, malformed
and oversized storage records fail closed to an empty set; storage
failure shows feedback rather than pretending the favorite was saved.
The browser `storage` event and a local change event synchronize
My Sky and My AirRadar without a new API call.

The *spotted before* counter and timestamp derive **only from
user-confirmed entries** in the existing private Spotter Logbook.
Merely receiving repeated SSE updates never counts as a sighting or
proves an aircraft has passed overhead. The main focus ranking adds
bounded bonuses for explicitly favorited / personally observed aircraft
without replacing the underlying objective spotter-interest reasons.
The logbook is indexed once per focus update for efficient O(1)
per-aircraft lookup. A stale or NETWORK-only track cannot become an
eligible LOCAL sky candidate through personalization.

My AirRadar now surfaces favorite ICAO IDs and LOCAL currently observed
matches, using the *same browser store*. This does not make a
per-browser favorite into a server account preference.

## B3 — Follow Journey and notifications

The My Sky hero exposes the **existing Follow Journey button**
alongside radar, aircraft detail and prefilled watchlist links.
Follow Journey resolves canonical durable/provisional flight identity
only when the user clicks, through its established API and
`airradar.followed-journeys.v1` local store. Favorites, watchlist
rules and Follow Journey remain **distinct opt-in concepts**.

The existing `airradar.spotter-alerts.v1` policy has one new
`favoriteAlertsEnabled` boolean, **false by default**, including
legacy stored preferences. It only makes a favorite eligible
when the *main* alert permission and switch are already enabled
and the same closest-distance, lead-time, approaching-phase
and per-aircraft cooldown limits pass. The existing service-worker
foreground notification mechanism is reused. Both a visible
Spotter tab and live LOCAL stream are required; no push subscriptions
or background polling are added. For background notifications,
users can continue explicitly saving a Spot and configuring existing
server-side watchlist/delivery settings.

## B4 — Closure, performance, consent and release regression

The existing GPS watch remains entirely browser-side and starts
only after the user requests observer mode. Favorites and logbook
contain **no coordinates**. The ranker's work is bounded by the
LOCAL snapshot, max 500 existing private logbook records, and
a top-five view; no database writes or extra SSE connections
are created. Favoriting does not implicitly enable notification
permission or any persistent watch rule. Unknown route and stale
stream states remain explicit.

Automated checks cover browser-store sanitization, caps,
repeated manual sightings, favorite ranking, LOCAL provenance,
cross-page hydration, opt-in alert policy, active-feed notification
guard and follow journey delegation. A production 390 px My AirRadar
visual smoke seeds *only* a fake browser-local favorite and asserts
that the saved ICAO appears. This fixture is isolated per Playwright
page and cannot affect real users or production data.

B is engineering complete after PR CI and CodeQL, production browser
and performance gates, and the post-deploy exact-commit verification
pass. It does **not** mean the user's local browser contains historical
sightings or favorites before they explicitly save them.
