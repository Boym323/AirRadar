# Debian / systemd deployment notes

Create a dedicated service account and grant it ownership of the application directory:

```bash
sudo useradd --system --home /var/www/airradar --shell /usr/sbin/nologin airradar
sudo chown -R airradar:airradar /var/www/airradar
```

After installing dependencies and building as that user, install `airradar.service` into `/etc/systemd/system/` and run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airradar
sudo journalctl -u airradar -f
```

Nginx Proxy Manager should proxy to `http://127.0.0.1:3000`. For long-lived SSE responses, turn off proxy buffering (or add `X-Accel-Buffering: no`, which AirRadar already sends) and use a generous read timeout.
