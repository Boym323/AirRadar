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

After installing dependencies and building as that user, install `airradar.service` into `/etc/systemd/system/` and run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
sudo journalctl -u airradar -f
```

Nginx Proxy Manager should proxy to `http://127.0.0.1:3000`. For long-lived SSE responses, turn off proxy buffering (or add `X-Accel-Buffering: no`, which AirRadar already sends) and use a generous read timeout.
