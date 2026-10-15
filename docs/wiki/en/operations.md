# Deployment and operations

Production releases are explicit operational actions and follow
[RELEASE.md](../../RELEASE.md). Do not release from a development worktree,
reset a production database, or expose private receiver coordinates. Database
and optional provider failures should leave the live radar available.

## Production performance verification

After a controlled release, run the [T58 read-only performance
soak](t58-production-soak.md). One GitHub Actions command collects an hour
of operational telemetry, compares it against T57, and stores sanitized
reports on a separate archive branch without changing production.
The authoritative operator procedure is
[T58-PRODUCTION-SOAK.md](../../T58-PRODUCTION-SOAK.md).
