# Development and testing

Use targeted or changed tests for focused work. Documentation-only changes do
not require the full build or test suite; run `git diff --check` and relevant
documentation checks. Never run a production build in the live checkout while
`airradar.service` is serving traffic.

See [DEVELOPMENT.md](../../DEVELOPMENT.md) for the complete guidance.

The isolated `airradar_dev` database, `.env.dev.local` setup, PROD-to-DEV
refresh guards, migration workflow, and predictive canary safety rules are
documented in the [Development database](../../DEVELOPMENT.md#development-database)
section of the canonical guide.
