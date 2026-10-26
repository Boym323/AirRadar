# R-02 — stínové porovnání Rust V2 a kandidátní adaptér pro V1

**Stav:** izolovaný návrh, bez přepnutí zdroje dat. V1 zůstává jediným zdrojem pravdy; tento nástroj pouze čte veřejná HTTP API a nijak neupravuje databáze, ingest, SSE ani produkční konfiguraci.

## Rozsah a architektura

Samostatná AirRadarV2 používá Rust/Axum na odděleném DEV LXC a poskytuje `GET /api/v1/aircraft`. V1 poskytuje `GET /api/aircraft?coverage=local`. Srovnávací skript používá pouze dvě existující API; nespouští další dekodér ani socket BEAST.

`lib/server/rust-v2-candidate.ts` validuje snímek V2 a mapuje jej na `ProviderSnapshot` pomocí stávající normalizace V1. **Adaptér není zaregistrován v `createAircraftProvider()`**, nemění runtime ani historii. Nevymýšlí chybějící metadata, Comm-B, údaje přijímače či ATC. Ne-ICAO identita si zachovává `~`, původ MLAT/TIS-B se nezaměňuje za ADS-B. Neplatná a neaktuální data se odmítají; `stale=true` znamená zastaralou *polohu*, nikoli nutně zastaralý příjem identifikátoru.

## Jednorázové ověření

Z prostředí, které vidí obě existující HTTPS služby:

```bash
node scripts/rust-v2-shadow-compare.mjs \
  'https://<V1-HOST>/api/aircraft' \
  'https://<V2-HOST>/api/v1/aircraft'
```

V1 používá vynucené `coverage=local`; V2 nepřijímá parametry URL. Povoleno je pouze HTTPS (případně HTTP na loopbacku), bez přesměrování a přihlašovacích údajů. Každý požadavek má timeout 5 sekund a limit 8 MiB. Výstup obsahuje pouze agregované počty a rozdělení polohových odchylek, nikdy identifikátory, volací značky, souřadnice, URL nebo obsah odpovědí.

## Co je nutné před přepnutím V1 na Rust

1. Úspěšné unit/HTTP testy v GitHub Actions včetně poškozených, zastaralých a non-ICAO dat.
2. Opakované srovnání na stejném zdroji a reprezentativní zátěži, s kontrolou časové odchylky a zdravotního stavu přijímačů.
3. Audit povinných polí a všech konzumentů ve V1: SSE, ATC, alerty, enrichment, historie, statistiky.
4. A/B CPU, RSS, event-loop P95/P99, T58 a I/O; doložený přínos i bezpečný rollback.
5. Výslovné rozhodnutí před aktivací. Samotné začlenění tohoto nepřipojeného adaptéru **nepovoluje** přepnutí zdroje letadel.

## Poznatky z 25. října 2026

Původní porovnání nesprávně považovalo `stale=true` za zastaralý příjem; oprava ponechává čerstvý identifikátor bez neověřené polohy. Rust V2 přidal podporu DF18 (CF0/1) a následně dvojitě potvrzený DF11 s CRC24/PI.

[Opakovaný živý parity test](https://github.com/Boym323/AirRadar/actions/runs/40234262802) naměřil ve třech odečtech V1 39/39/39, Rust 40/40/40, společných 38/38/38, V1-only 1/1/1 a Rust-only 2/2/2. P95 vzdálenosti bylo 0,774/1,029/0,250 km, bez odchylky přes 5 km. Jde o časově oddělené vzorky, nikoliv o dlouhodobý soak nebo důkaz možného přepnutí.

## Omezení a pravidla bezpečné přejímky

Ve V1 nejsou z Rust V2 zatím dostupná úplná provozní metadata včetně pokročilé diagnostiky a statistik, počítadel zpráv, některých atributů letadel, Comm-B ani všech informací o trasách. Nezavádět žádné náhradní hodnoty, které se v odpovědi V2 skutečně nenacházejí. I správný převod DTO pouze potvrzuje tvar a validaci dat, nikoliv jejich úplnost pro současné komponenty V1. Nesprávné časové značky, nepodporované kategorie a podezřelé pozice musí být odmítnuty nebo označeny jako nedostupné.

Každé měření je nutné interpretovat v kontextu datového zdroje a časového posunu. Dvě nezávislé služby mohou ve stejný okamžik vidět odlišný počet letadel i při společném přijímači. Z tohoto důvodu samotné počty identit ani jeden okamžitý rozdíl pozic nejsou podkladem pro rozhodnutí o produkční migraci. Porovnávací nástroj nikdy neobsahuje přihlašovací údaje a nesmí zapisovat žádnou surovou telemetrii na disk nebo do veřejného logu.

[Ověřený DEV deployment podpory DF11](https://github.com/Boym323/AirRadarV2/actions/runs/40235165530) potvrdil samostatný krok ve V2; na aktuálním V1 se kvůli tomu nemění nastavení ingestu, databáze ani plánovače. Pokud není V2 veřejné API dostupné, živá parita zůstává **neprůkazná** a provede se znovu po opravě V2; není dovoleno zaměnit výpadek služby za úspěšné porovnání.
