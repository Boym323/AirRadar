# Debian / systemd deployment notes

Create a dedicated service account and grant it ownership of the application directory:

```bash
sudo useradd --system --home /var/www/airradar --shell /usr/sbin/nologin airradar
sudo chown -R airradar:airradar /var/www/airradar
```

AirRadar requires Node.js 22.18+ because it uses the Prisma 8 contract-based PostgreSQL runtime. From the release checkout, install dependencies, emit the contract, apply the checked-in migration, and build:

```bash
cd /var/www/airradar
sudo -u airradar npm ci
sudo -u airradar npm run prisma:generate
sudo -u airradar npm run build
sudo -u airradar npm run prisma:deploy
```

`DATABASE_URL` must be present in `/var/www/airradar/.env` before `prisma:deploy`. If PostgreSQL is intentionally disabled, omit it; demo mode and the in-memory history fallback still work.

For the real receiver, `/var/www/airradar/.env` must at minimum contain:

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
DATABASE_URL=postgresql://airradar:<password>@127.0.0.1:5432/airradar?schema=public
ADSBDB_ENABLED=true
ATC_SAMPLE_ENABLED=false
FLIGHTAWARE_API_KEY=
APP_TIMEZONE=Europe/Prague
```

`WATCHLIST_ADMIN_TOKEN` is the exact server-side secret used to authorize
watchlist rule mutations. It is required for those mutations, must not use a
default or placeholder in production, and must never be exposed through a
`NEXT_PUBLIC_*` variable. If it is missing, watchlist mutations fail closed
with HTTP 503; configure it in the server-only `.env` before enabling the
feature. The production smoke gate uses a test-only token in its isolated child
process and does not configure or modify the production `.env`.

Use the actual readsb/tar1090 web root in `READSB_BASE_URL`; AirRadar appends
`/data/aircraft.json` and `/data/receiver.json`. Keep the real `.env` readable
by `airradar` but not world-readable (`chmod 640` with an appropriate group).

Optional enrichment is configured in the same server-only `.env`: set `ADSBDB_ENABLED=true` for free, keyless aircraft metadata and route lookups. Keep `FLIGHTAWARE_API_KEY=` empty for the first production deployment; if configured, the current architecture may perform paid AeroAPI flight-plan lookups for currently tracked aircraft with callsigns. Never use a `NEXT_PUBLIC_*` variable for these values. If either provider or PostgreSQL is offline, live readsb polling continues and the UI degrades gracefully.

Optional server alerts use `/var/lib/airradar/alerts.json`, a persistent file
created in the systemd-managed state directory. The checked-in `data/alerts.json`
is retained only as a legacy migration source and is never written by the
production service. Configure Pushover only with server-side
`PUSHOVER_ENABLED`, `PUSHOVER_USER_KEY` and `PUSHOVER_API_TOKEN`; never expose
these as `NEXT_PUBLIC_*` variables. Alert delivery is best-effort and does not
block readsb polling. The alert ledger is `/var/lib/airradar/alert-events.jsonl`.

After installing dependencies and building as that user, install `airradar.service` into `/etc/systemd/system/` and run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
sudo journalctl -u airradar -f
```

Normal production releases should use `deploy/release.sh`. It calculates the
next version in the current `package.json` major/minor series, writes ignored
build metadata before `next build`, and creates the matching Git tag only after
the build, migrations, restart and both health checks pass. Release retries on
the same commit reuse the same tag. When the runtime alert config does not yet
exist, the release script creates `/var/lib/airradar` with service ownership
and copies `data/alerts.json` into it without overwriting an existing runtime
file. The old alert-event ledger is never migrated.

Nginx Proxy Manager should proxy to `http://192.168.1.142:3000`. The reverse proxy is separate from the AirRadar LXC, so do not use its own `127.0.0.1`. For long-lived SSE responses, turn off proxy buffering (or add `X-Accel-Buffering: no`, which AirRadar already sends) and use a generous read timeout.

AirRadar uses Server-Sent Events, not WebSocket. In the Proxy Host **Advanced** field add:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

The browser's `EventSource` automatically reconnects after a proxy or network interruption. Keep the standard Proxy Host websocket toggle optional; it is not needed for `/api/stream`.

The service runs as the unprivileged `airradar` user. It starts
`scripts/start-production.mjs` directly so systemd tracks the Node/Next server
as `MainPID`, without an npm or shell parent that could exit before application
cleanup. The wrapper registers the AirRadar shutdown coordinator before
starting Next and sets `NEXT_MANUAL_SIG_HANDLE=1`, leaving one signal owner.
Verify the resolved Node path with `command -v node` before installing the
unit; if Node is installed outside `/usr/bin`, adjust `ExecStart` to that
absolute path. Useful checks:

```bash
sudo systemctl status airradar
sudo journalctl -u airradar -n 100 --no-pager
sudo journalctl -u airradar -f
curl -fsS http://192.168.1.142:3000/api/health | jq
```

The health response reports application, PostgreSQL, readsb, last successful readsb update, current aircraft count, and a sanitized diagnostic message. It never returns `DATABASE_URL`, API keys, or passwords.
