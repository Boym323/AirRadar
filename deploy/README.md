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
sudo -u airradar npm run prisma:deploy
sudo -u airradar npm run build
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

Use the actual readsb/tar1090 web root in `READSB_BASE_URL`; AirRadar appends
`/data/aircraft.json` and `/data/receiver.json`. Keep the real `.env` readable
by `airradar` but not world-readable (`chmod 640` with an appropriate group).

Optional enrichment is configured in the same server-only `.env`: set `ADSBDB_ENABLED=true` for free, keyless aircraft metadata and route lookups. Keep `FLIGHTAWARE_API_KEY=` empty for the first production deployment; if configured, the current architecture may perform paid AeroAPI flight-plan lookups for currently tracked aircraft with callsigns. Never use a `NEXT_PUBLIC_*` variable for these values. If either provider or PostgreSQL is offline, live readsb polling continues and the UI degrades gracefully.

After installing dependencies and building as that user, install `airradar.service` into `/etc/systemd/system/` and run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
sudo journalctl -u airradar -f
```

Nginx Proxy Manager should proxy to `http://127.0.0.1:3000`. For long-lived SSE responses, turn off proxy buffering (or add `X-Accel-Buffering: no`, which AirRadar already sends) and use a generous read timeout.

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

The service runs as the unprivileged `airradar` user. Verify the resolved Node path with `command -v npm` before installing the unit; if Node is installed outside `/usr/bin`, adjust `ExecStart` to that absolute npm path. Useful checks:

```bash
sudo systemctl status airradar
sudo journalctl -u airradar -n 100 --no-pager
sudo journalctl -u airradar -f
curl -fsS http://127.0.0.1:3000/api/health | jq
```

The health response reports application, PostgreSQL, readsb, last successful readsb update, current aircraft count, and a sanitized diagnostic message. It never returns `DATABASE_URL`, API keys, or passwords.
