# Aircraft Watchlist & Alerts V2

Watchlist & Alerts V2 connects the existing watchlist to the public predictive
advisory layer without creating a second prediction or readiness path.

## Rule options

Each watchlist rule can optionally configure:

- an ETA threshold from 1 to 120 minutes;
- an optional four-letter destination ICAO for the ETA threshold; and
- predicted runway-change notifications.

Existing identity, distance and enabled-state matching remains authoritative.

## PUBLIC-only predictive source

Predictive alerts are evaluated only from the same public advisory builders used
by the aircraft prediction API:

- `buildPublicEtaAdvisory()`;
- `buildPublicRunwayChangeAdvisory()`; and
- the effective policy produced by predictive readiness enforcement.

The alert engine never consumes admin previews or raw SHADOW predictions. A
configured PUBLIC capability that loses readiness fails closed before the alert
engine sees an advisory.

One cached readiness report is evaluated for the whole aircraft batch rather
than once per aircraft.

## Event semantics

ETA emits once when a matching rule is inside its configured threshold. The
persistent event key is stable across small ETA drift by combining aircraft,
callsign, destination, a bounded arrival-time bucket and the configured
threshold.

Runway change emits once for each distinct readiness-gated public transition,
keyed by aircraft, change timestamp, previous runway and new runway.

Both event families use the existing alert history, delivery queue, notifier,
rule last-trigger state and bounded persistent deduplication.

## Boundaries

- no database migration;
- no new client poller or SSE connection;
- no new prediction engine;
- no SHADOW notification path;
- no notifier credentials exposed to the browser.
