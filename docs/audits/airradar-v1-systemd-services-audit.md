# AirRadar V1 – audit pomocných služeb

- Datum auditu: 2026-10-28 (Europe/Prague)
- Produkční verze před opravou: `1.0.559`, `53ee531f`
- Produkční verze po opravě: `1.0.560`, `aa3860c08548da4a7b73f107bbd0bcd032af00ca`
- Prostředí: autorizovaný produkční checkout AirRadar V1; AirRadar V2 nebyl měněn
- Verdikt: **PASS_WITH_LIMITATIONS**

## Rozsah a metoda

Kontrolovány byly:

- `airradar-aviation-data-sync.service` a `.timer`;
- `airradar-atc-watchdog.service` a `.timer`;
- související ADS-B watchdog, `airradar.service`, všechny AirRadar timery a případné `readsb`/`dump1090` unity;
- `systemctl status/show/cat`, `systemctl list-timers`, `journalctl`, `systemd-analyze verify`, oprávnění, adresáře, binárky, síťové sockety a PostgreSQL;
- `/api/health`, `/api/health?watchdog=1` a `/api/version`.

Hodnoty `.env`, přístupové údaje, cookies, privátní adresy a citlivý obsah logů nejsou v reportu uvedeny.

## Zjištěný stav

| Komponenta | Stav před opravou / význam `inactive` | Důkaz a klasifikace po opravě |
|---|---|---|
| Ingest `readsb` | Samostatná unit ani lokální binárka `readsb`/`dump1090` na tomto hostu neexistuje. AirRadar používá integrovaný `local-beast+json-failover`; BEAST socket byl připojen a JSON endpoint vrátil platný katalog. | **HEALTHY** – `/api/health` hlásil `readsb.status=ok`, `provider=local-beast+json-failover`, živý `lastReadsbUpdate` a 57–59 letadel. ADSB.lol fallback byl také `status=ok`. |
| `airradar-aviation-data-sync.service` | **FAILED** v běhu 04:43:44–04:45:06, exit 1. CZ, SK a AT importy doběhly; následný SID/STAR krok selhal na `MODULE_NOT_FOUND` pro `scripts/procedures-sync.ts`. | **HEALTHY** – po release byl oneshot spuštěn přes systemd 09:46:08–09:47:32, exit 0; CZ/SK/AT skončily `success`. Po úspěšném `Type=oneshot` běhu je `inactive/dead` očekávané, nikoli chyba. |
| `airradar-aviation-data-sync.timer` | Enabled, active/waiting; failure patřil spuštěné službě, ne timeru. | **HEALTHY** – timer je enabled/active, další plánovaný běh je 2026-10-29 přibližně 04:30 CET (po randomized delay). Ruční ověření bylo ekvivalentem dalšího běhu; samotný plánovaný běh ještě v čase reportu nenastal. |
| `airradar-atc-watchdog.service` | **EXPECTED_INACTIVE** – oneshot se po úspěšném běhu deaktivuje. Opakované běhy vracely exit 0 a `{action:"inactive"}`. | **HEALTHY / EXPECTED_INACTIVE** – timer enabled/active, poslední běh exit 0; nebyl zjištěn důvod k restartu aplikace. |
| `airradar-atc-watchdog.timer` | Enabled, active/waiting, perioda přibližně 1 minuta s náhodným zpožděním. | **HEALTHY** – plánování funguje a poslední běh proběhl úspěšně. |

## Root cause a oprava

Commit [`3f891eac`](https://github.com/Boym323/AirRadar/commit/3f891eac5718aee040d8959214a6f120da30afb4) záměrně odstranil retired SID/STAR modul, skript `scripts/procedures-sync.ts` i příkaz `procedures:sync`. Orchestrátor `scripts/aviation-data-sync.mjs` však na odstraněný skript dál odkazoval. To je prokázaná příčina selhání, nikoli hypotéza.

Oprava v [PR #1126](https://github.com/Boym323/AirRadar/pull/1126) odstranila retired SID/STAR job z orchestrace, ponechala živé ATC importy CZ/SK/AT a přidala regresní test. Funkční změna byla sloučena commitem [`aa3860c0`](https://github.com/Boym323/AirRadar/commit/aa3860c08548da4a7b73f107bbd0bcd032af00ca). Nebyla obnovena vyřazená funkce ani měněna databázová schémata, autentizace, ingest nebo síťová konfigurace.

Služby a timery na serveru jsou shodné s verzovanými jednotkami v `deploy/systemd/`; `systemd-analyze verify` proběhl bez chyby. Uživatel `airradar` měl přístup ke skriptu a databáze byla dostupná. Adresář `data/procedures/generated` zůstává root-owned a není zapisovatelný uživatelem `airradar`; po odstranění retired SID/STAR jobu se do něj tato synchronizace nezapisuje, takže nejde o příčinu opraveného selhání. Je to otevřené riziko pouze při případném budoucím znovuzavedení generovaného výstupu.

## Testy, CI a deployment

- Lokálně: regresní Vitest `1 passed`; relevantní watchdog testy celkem `20 passed`.
- ESLint pro změněné soubory: PASS.
- TypeScript typecheck: PASS.
- PR CI: validation, CodeQL a syntetické load testy 1×/2×/4×: PASS – [PR checks](https://github.com/Boym323/AirRadar/pull/1126).
- Produkční main CI/deployment: [run 40658678316](https://github.com/Boym323/AirRadar/actions/runs/40658678316) – release validation, performance, core/browser gates a deploy PASS.
- Produkční release: [v1.0.560](https://github.com/Boym323/AirRadar/releases/tag/v1.0.560).

## Závěrečné produkční ověření

Po deploymentu:

- `/api/version`: `1.0.560`, commit `aa3860c0`, channel `production`;
- `/api/health`: `status=ok`, application OK, PostgreSQL OK, `readsb.status=ok`, živý BEAST+JSON failover a ATC `sectorCount=114`;
- `/api/health?watchdog=1`: ADSB.lol `status=ok`;
- opravený aviation sync: skutečný systemd běh exit 0, všechny tři retained importy success;
- ATC i ADS-B watchdog: poslední běhy exit 0, jejich timery active/waiting;
- hlavní aplikace: po očekávaném release restartu active/running, bez nových auxiliary warning/error záznamů;
- PostgreSQL: `pg_isready` hlásil accepting connections;
- další timer běh byl ověřen v plánování, ale nebylo čekáno do jeho času; ruční úspěšný běh je skutečné produkční ověření opravené cesty, nikoli syntetický test.

## Otevřená rizika a omezení

- Zdrojová data ATC obsahují známé source-limited/skipped řádky a žádné authoritative transmitter locations; import je přesto úspěšný a aplikace hlásí 114 sektorů. Toto nebylo měněno.
- Veřejný `/api/system` na auditovaném deploymentu vrací 404; autorizovaná systémová diagnostika tímto endpointem nebyla deklarována jako provedená.
- Snapshot CPU/RAM po čerstvém release restartu není dlouhodobý výkonový trend. CI performance gate prošel; dlouhodobý monitoring zůstává provozním úkolem.
- Další plánovaný daily timer běh nebyl v době auditu dosažen. Pokud selže, první kontrola je `journalctl -u airradar-aviation-data-sync.service` a návratový kód oneshotu.

Finální verdikt: **PASS_WITH_LIMITATIONS** – prokázaná závada byla opravena, CI i standardní deployment prošly a opravený oneshot byl v produkci úspěšně ověřen; výše uvedená omezení zůstávají zdokumentována.
