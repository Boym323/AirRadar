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

A later separate stage may improve notification preferences or
historical personalization, but it must continue reusing existing
alert and data contracts and must not invent LOCAL coverage.
