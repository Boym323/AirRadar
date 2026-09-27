# Configuration

Copy `.env.example` to `.env` for local work. Never commit credentials,
database URLs, or API keys. The primary receiver settings are:

```dotenv
READSB_BASE_URL=http://192.168.1.50:8080
RECEIVER_LAT=50.0755
RECEIVER_LON=14.4378
```

Optional providers such as ADSB.lol and OGN are disabled by default and must
be enabled explicitly. Keep exact receiver coordinates out of public material.
See [data sources](../../DATA-SOURCES.md).
