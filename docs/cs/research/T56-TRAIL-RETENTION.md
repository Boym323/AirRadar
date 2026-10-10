# T5.6B – Trail Retention Validation

## Důvod

T5.5 zaznamenal výrazný nárůst počtu uchovávaných síťových
trail-pointů a souběžný růst RSS. Samotná korelace není důkaz
úniku paměti. Stávající `updateTrail` již používá omezení:

- lokální traily: pevný limit 600 bodů na letadlo,
- síťové traily: konfigurovatelný `NETWORK_TRAIL_MAX_POINTS`
  (výchozí 120 bodů), spolu s časovým limitem.

Stávající diagnostika zobrazovala **jen celkový počet bodů**,
nikoli skutečné maximum na letadlo nebo porušení limitu.

## Co se mění

`AircraftStateService.getDiagnostics()` nyní sčítá v již existujících
O(n) průchodech mapami následující *anonymní* agregáty pro local/network
odděleně:

- `localTrailMaxPointsPerAircraft`,
  `networkTrailMaxPointsPerAircraft`: nejvyšší počet bodů na letadlo,
- `localTrailAtLimitAircraftCount`,
  `networkTrailAtLimitAircraftCount`: počet letadel přesně na limitu,
- `localTrailOverLimitAircraftCount`,
  `networkTrailOverLimitAircraftCount`: počet letadel nad limitem
  (regresní signál).

Údaje se propisují do **admin** `/api/system/status`, veřejná
projekce je výslovně nulová. Není ukládána ICAO identita ani poloha
žádného letadla. Výpočet pouze doplňuje už existující diagnostický
průchod, nikoliv hot path snapshot updates.

Testy ověřují, že v serverovém stavu jsou limity dodrženy a že
stale eviction síťového letadla vyprázdní jeho trailové agregáty.

## Interpretace a následný audit

Nula nadlimitních letadel je nutná, ale sama o sobě neprokazuje
optimální spotřebu paměti. Ani součet bodů násobený odhadem
96 bajtů na bod není skutečný V8 heap-retainer audit.
Doporučujeme porovnat s T5.6A V8 heap-space a post-major-GC
zjištěními za stabilního procesu, při odpovídajícím provozu.

Žádné změny trail limitů ani doby uchovávání nebyly provedeny.
