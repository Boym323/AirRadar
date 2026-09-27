# Deployment and operations

Production releases are explicit operational actions and follow
[RELEASE.md](../../RELEASE.md). Do not release from a development worktree,
reset a production database, or expose private receiver coordinates. Database
and optional provider failures should leave the live radar available.
