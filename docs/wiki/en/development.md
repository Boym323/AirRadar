# Development and testing

Use targeted or changed tests for focused work. Documentation-only changes do
not require the full build or test suite; run `git diff --check` and relevant
documentation checks. Never run a production build in the live checkout while
`airradar.service` is serving traffic.

See [DEVELOPMENT.md](../../DEVELOPMENT.md) for the complete guidance.
