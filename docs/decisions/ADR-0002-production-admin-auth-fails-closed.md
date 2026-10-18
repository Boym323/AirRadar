# ADR-0002 — Production administrator authentication fails closed

## Context

AirRadar's administrator and operational-diagnostics routes all use
`isWatchlistSessionValid()`. The previous default treated an unset or false
`AIRRADAR_ADMIN_AUTH_ENABLED` value as an authenticated session. A read-only
probe of the public production host on 2026-10-18 confirmed that the public
deployment returned `configured: false, authenticated: true` and served admin
diagnostics without a session cookie.

## Decision

Production Node processes always require the signed watchlist session and
`WATCHLIST_ADMIN_TOKEN`, regardless of the legacy opt-out value. Non-production
local/demo deployments may still set `AIRRADAR_ADMIN_AUTH_ENABLED=false` when
they are not internet-facing.

The obsolete `lib/server/adsblol-failover-provider.ts` adapter is removed. The
active owner is `lib/server/network-failover-provider.ts`; static repository
search found no runtime, test, route, workflow, or dynamic-import consumer of
the obsolete adapter.

## Consequences

An existing production deployment must provision a secret
`WATCHLIST_ADMIN_TOKEN` before releasing this change. Until then admin routes
return an authentication/configuration error rather than exposing diagnostics.
Public radar, SSE, history, and receiver paths do not depend on administrator
authentication and remain available.

The deleted adapter remains recoverable through Git history. No provider lane,
network source, database schema, or public route is removed.

## Evidence

- Read-only production probes: `/api/watchlist/session` and admin diagnostic
  GET endpoints, 2026-10-18.
- `lib/server/providers.ts` constructs `NetworkFailoverProvider` directly.
- Repository-wide static reference search found only the deleted adapter's own
  path for `adsblol-failover-provider`.
