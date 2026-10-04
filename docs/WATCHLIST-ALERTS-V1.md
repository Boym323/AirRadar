# Aircraft Watchlist & Alerts V1

Aircraft Watchlist & Alerts V1 completes the existing server watchlist as one
product surface instead of a collection of separate alert primitives.

## Scope

The watchlist can match aircraft by ICAO hex, registration, exact callsign,
callsign wildcard, aircraft type, or airline. Existing distance constraints and
the shared alert cooldown remain unchanged.

The integrated activity feed includes rule-bound events from the existing alert
and Flight Intelligence pipelines:

- first detection of a matching aircraft,
- entry into a configured receiver-radius threshold,
- likely takeoff and landing,
- approach, go-around, confirmed holding, diversion and top of descent,
- transitions to special squawks 7500, 7600 and 7700.

No second flight-event detector is introduced.

## History-only special squawk semantics

Special-squawk detection is now independent of external delivery. If a matching
watchlist aircraft transitions to 7500, 7600 or 7700 while global emergency push
delivery is disabled, AirRadar still records a bounded watchlist event and marks
delivery as disabled. It does not invoke Pushover.

When global emergency alerts are enabled, the existing high-priority delivery
path remains unchanged. Matching watchlist rule ids are attached to the same
event so the event can also appear in the integrated watchlist activity feed.

The first live snapshot remains a baseline and cannot create a startup squawk
storm.

## API and UI

`GET /api/watchlist/activity` returns bounded alert-history entries associated
with the currently configured watchlist rule ids. Optional query parameters:

- `page`
- `pageSize` (maximum 50)
- `ruleId` (only a currently configured watchlist rule can be selected)

The route uses the existing public watchlist rate limit and returns
`Cache-Control: no-store`.

The `/watchlist` page shows the latest 20 rule-bound events and refreshes the
panel every 30 seconds. It does not create another SSE connection.

## Boundaries

- No database migration is required.
- Existing `alerts.json` rule storage remains authoritative for the simple
  watchlist.
- Existing Flight Intelligence remains authoritative for movement events.
- Existing alert history remains the event ledger.
- Pushover configuration is not exposed to the browser.
- Receiver coverage gaps can still hide a transition.
