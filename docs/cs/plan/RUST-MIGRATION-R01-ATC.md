# AirRadar V1 → Rust: R-01 pilot geometrie ATC

Stav: **připraveno pro sloučení jako volitelný, neaktivní pilot**. Produkční
provoz se bez výslovného schválení aktivace nemění. Projekt nesahá na zdroj
letadel V1, databázi, ingest ani veřejná API; V2 zůstává oddělená.

## Rozsah
- Existující volitelný N-API doplněk získává `atcRingContains`, který pracuje
  s kompaktním prstencem uloženým jako f64.
- `matchAtcRing` může po zapnutí nahradit výpočet průniku ATC, ale zachovává
  ohraničující obdélníky, výšku, platnost, kontext a tvar veřejné odpovědi.
- Žádný nový zdroj pravdy, žádné nové zápisy historie, další BEAST socket ani
  duplicitní ingest dat se nezavádějí.
- Srovnání Rust/TypeScript pokrývá 5 000 deterministických bodů, hranice
  polygonů a hraniční případy.
- Starší nativní doplňky bez nového symbolu přejdou automaticky na původní
  javascriptový výpočet.
- Aktivace vyžaduje současně `AIRRADAR_NATIVE_BEAST=1` a
  `AIRRADAR_NATIVE_ATC=1` s absolutní cestou k doplňku. Výchozí stav je OFF.
- Volitelný index zeměpisné šířky z #1114 ve V1 zůstává zachován a pilot Rustu
  jej nezapíná; má vlastní konfigurační přepínač.

## Podmínky
1. Před sloučením neaktivního kódu musí projít Rust jednotkové testy,
   nativní parita, TypeScript, ATC integrace, CodeQL a produkční přejímka.
2. **Před produkční aktivací** je nutný shodný lokální replay a porovnání
   CPU, p95/p99 event-loop, maximálních T58 stallů, RSS a rollbacku ON → OFF.
3. V1 si ponechá správu letadel i dosavadní režim archivace a údržby; oba
   ATC akcelerátory současně neaktivovat bez společného A/B ověření.
4. Případný přesun správy letadel a SSE do V2 vyžaduje samostatný audit,
   read-only shadow porovnání a kontrolovaný přechod.

Prošlé testy samy o sobě nedokládají snížení CPU ani paměti produkce.
