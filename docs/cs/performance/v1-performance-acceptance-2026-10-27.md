# AirRadar V1 – výkonnostní přejímka (27. 10. 2026)

**Výsledek:** `PASS_WITH_LIMITATIONS`.

Tento dokument zachycuje aktuální produkční přejímku V1. Čísla jsou
agregovaná; neobsahují tajné hodnoty, tokeny, identity letadel, PID ani raw
diagnostické odpovědi.

## Produkční identita a zdraví

- verze `1.0.555`, commit `a202cfb1`, channel `production`;
- `airradar.service` je aktivní, `NRestarts=0`;
- `/api/health` hlásí PostgreSQL i lokální BEAST/JSON failover jako zdravé;
- `/api/system/status` potvrzuje `rustActive=true`, `parserBackend=rust`,
  `crcBackend=rust`;
- `/api/aircraft`, SSE v1 i SSE v2 vracejí data;
- po posledním restartu nebyla v journalu žádná chyba.

## Aktivní a vypnuté přepínače

Za běhu byly potvrzeny tyto aktivní volby:

| Přepínač | Stav | Skutečné použití |
| --- | --- | --- |
| `AIRRADAR_NATIVE_BEAST` | `1` | Rust BEAST backend aktivní |
| `AIRRADAR_NATIVE_BEAST_PARSER` | `1` | Rust parser potvrzen stavem systému |
| `AIRRADAR_NATIVE_BEAST_CRC` | `1` | Rust CRC potvrzen stavem systému |
| `AIRRADAR_WEATHER_BATCH_INSERT_ENABLED` | `true` | aktivní; nové A/B této volby nebylo provedeno |
| `AIRRADAR_TRACK_FUSION_SHADOW_ENABLED` | `true` | konfiguračně aktivní |
| `AIRRADAR_TRACK_FUSION_DIGITAL_TWIN_ENABLED` | `true` | konfiguračně aktivní |
| `AIRRADAR_OPERATIONAL_TWIN_FORENSICS_ENABLED` | `true` | runtime T57 uvádí forensics jako neaktivní |
| `AIRRADAR_PREDICTIVE_PROSPECTIVE_VALIDATION_ENABLED` | `true` | konfiguračně aktivní |

Vypnuté nebo nepoužité volby:

- `AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED=0`; historický i nový důkaz
  neprokázal dostatečný přínos inline CRC;
- `AIRRADAR_NATIVE_ATC` není nastaveno; nasazený addon neměl potřebný ATC
  symbol, proto zůstává vypnuto;
- `AIRRADAR_ATC_RESOLUTION_ENABLED=false` a
  `AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED=false`;
- `AIRRADAR_ATC_LATITUDE_INDEX` je po testu odstraněno z produkčního `.env`
  a používá default OFF;
- stall evidence a T58 CPU profiler jsou vypnuté.

Auxiliary admin telemetry nyní obsahuje všechna pole požadovaná T57, včetně
`atcShadowPredictionKeys`. Aktuální hodnota je `0`, protože producer shadow
mapy byl v V1 odstraněn a runtime mapu nealokuje. Veřejné projekce toto pole
nezveřejňují.

## Řízené A/B latitude indexu

Původní 180sekundový baseline nebyl plně srovnatelný, proto byl proveden
řízený A/B test. Každá větev měla 58 vzorků po 10 sekundách a trvala 600,6 s.

| Metrika | Index OFF | Index ON |
| --- | ---: | ---: |
| CPU mean / P95 / P99 | 17,663 / 37,843 / 65,033 % | 19,491 / 46,518 / 100,000 % |
| RSS P50 / P95 / P99 | 1333,793 / 1418,078 / 1419,047 MiB | 1292,250 / 1347,156 / 1358,453 MiB |
| event-loop P95 metric P95 | 21,496 ms | 21,643 ms |
| event-loop P99 metric P95 | 39,584 ms | 54,329 ms |
| PostgreSQL transakce/min | 389,834 | 324,600 |
| PostgreSQL insert/update/min | 375,3 / 237,6 | 309,0 / 213,8 |

Index ON měl nižší RSS a nižší databázovou aktivitu, ale horší Node CPU a
event-loop P99. Navíc bylo v běžící V1 vypnuté ATC resolution, takže cesta
latitude indexu se v produkčním ingestu vůbec nespouštěla. Rozdíl proto nelze
připsat indexu. Přepínač nebyl ponechán aktivní.

## T57/T58

- T57 admin preflight: `TELEMETRY_READY`.
- T57 read-only chunk: 31/31 vzorků, 0 missing, 1 stabilní segment,
  `PASS_WITH_LIMITATIONS`.
- T57 chunk CPU mean/P95: `12,013 / 14,163 %`.
- T57 RSS P50/P95: `699,848 / 1313,637 MiB`.
- T57 event-loop window P99 P95: `33,128 ms`; maximum window: `640,156 ms`.
- T58 read-only: 13/13 vzorků, 0 flagged intervalů,
  `PASS_WITH_LIMITATIONS`.
- T58 CPU P50/P95/max: `18,264 / 24,636 / 24,636 %`.
- T58 rolling event-loop P99 P95: `57,049 ms`.

Cgroup throttling bylo `controller_disabled`; nelze jej interpretovat jako
nulové throttling. Plný 24hodinový T57 soak nebyl součástí této přejímky.

## Zdrojová změna, testy a rollback

Chybějící pole auxiliary telemetry bylo opraveno v [PR #1120](https://github.com/Boym323/AirRadar/pull/1120)
v souborech [memory-retention-diagnostics.ts](../../../lib/server/memory-retention-diagnostics.ts)
a [memory-retention-diagnostics.test.ts](../../../tests/memory-retention-diagnostics.test.ts).
Změna byla nasazena standardní CI pipeline; nemění schéma, ingest, bezpečnost
ani existující API kontrakty.

Ověření prošlo: focused T57 projekce 22/22, unit 1816 passed, integration
169 passed, Rust unit 7/7, typecheck, CodeQL a syntetická zátěž 1×/2×/4×.

Konfigurační rollback je uložen v
`/var/backups/airradar/20261027T160928Z-optimization-baseline/.env`.
Zdrojový rollback se provádí revert PR přes standardní release pipeline; do
produkce se nepoužívá `git reset --hard` ani ruční kopírování zdrojů.
