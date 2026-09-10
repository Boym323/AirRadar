# Dynamic airspace activation research

Status: design only for v1.2. The imported eAIP geometry remains **published
airspace** context. It does not prove that a sector is currently active, so
the runtime activation value remains `UNKNOWN` until an authoritative,
machine-readable operational feed is configured.

## Sources reviewed

- The official [AIM ŘLP ČR](https://aim.rlp.cz/) site is the national source
  for Czech AIP, NOTAM and airspace-use information. Its [ENR 1.1.9.7
  procedure](https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-1.1-cz-CZ.html) states
  that AUP is issued for the following operational day and that same-day
  changes are published through UUP; it also names `aup.rlp.cz` as the web
  publication location.
- The [EUROCONTROL EAUP/UUP portal guidance](https://www.nm.eurocontrol.int/HELP/EAUP.html)
  describes the European AUP and updated plans and their validity display.
- EUROCONTROL's [airspace data management service](https://www.eurocontrol.int/service/airspace-data-management)
  and [NM B2B service](https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services)
  describe the authoritative integration direction: structured airspace data,
  EAUP/EUUP and NOTAM implementation through protected operational services.

## Recommendation

Use the official Czech AUP/UUP publication as the first operational source for
Czech temporary areas, with EUROCONTROL NM B2B/Airspace Availability as the
European fallback or future multi-country source. Use NOTAM as corroborating
operational information, not as a replacement for a structured airspace
identity/validity feed.

The integration should be a separately configured server-side provider, not a
runtime HTML scraper:

1. obtain a documented machine-readable feed and its access/licence terms;
2. join records to imported AIP geometry by stable airspace identifier and
   validity interval;
3. validate time, vertical limits, geometry and activation semantics;
4. retain source reference, effective/valid times and last verification;
5. publish `ACTIVE` or `INACTIVE` only from that validated operational record,
   otherwise publish `UNKNOWN`.

The public pages currently provide no documented API contract, authentication
method, or stable identifier mapping suitable for a safe release integration.
EUROCONTROL NM B2B requires an operational stakeholder profile and its NM view
is not identical to the officially published AIP. Therefore v1.2 stops at
design: no scraping, new polling lane, or datasource is enabled, and no
published polygon is promoted to `ACTIVE`.
