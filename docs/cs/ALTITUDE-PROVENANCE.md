# Provenience výšky a forenzní diagnostika

AirRadar zachází s proveniencí výšky jako se záležitostí jednotlivého pole.
Živé letadlo může mít pozici, výšku, telemetrii a katalogová data z různých
cest; aircraft-level `source` nestačí k vysvětlení výšky.

## Pozorování a pravidla

Každý nový kandidát výšky je interně reprezentován jako
`AltitudeObservation`, který obsahuje hodnotu, zdroj, providera, protokol,
barometrický/GNSS typ, metadata Beast DF/TC, jsou-li dostupná, čas pozorování,
čas přijetí, confidence a vypočtené stáří freshness.

Aktuální pravidla jsou:

1. čerstvý lokální Beast;
2. čerstvý lokální `aircraft.json` (`READSB_JSON`);
3. čerstvá síťová, MLAT nebo TIS-B data;
4. ostatní/neznámá data pouze jako fallback.

Lokální i síťoví kandidáti jsou čerství 30 sekund. Freshness se počítá z
timestampu pozorování výšky, nikoli z nesouvisející zprávy `lastSeen` letadla.

Velký nesoulad je diagnostický signál, nikoli pravidlo absolutní výšky.
Kandidáti lišící se o více než 12 000 ft vytvoří omezený anomaly záznam;
izolovaná vysoká výška se neodmítne jen proto, že je vysoká. Surový Beast
outlier nad 80 000 ft může prohrát proti potvrzenému nižšímu kandidátu, když
je aktivní disagreement guard. Časový skok stejného zdroje se kontroluje proti
24 000 ft/min pro mezery kratší než pět minut; první pozorování, dlouhé mezery
a změny zdroje se zpracují konzervativně.

## Persistence

Nové řádky `FlightPosition` persistují nullable `altitudeSource`,
`altitudeProvider`, `altitudeProtocol`, `altitudeType`,
`altitudeObservedAt` a `altitudeDecisionReason`. Tato pole se zapisují ze
stejného decision objektu jako `altitude`, takže hodnotu a provenienci nelze
vybírat nezávisle. Historické řádky zůstávají NULL; žádný provenance backfill
se neprovádí.

Významná rozhodnutí disagreement a temporal-jump se řídce zapisují do
`AltitudeAnomaly`. Řádek ukládá ICAO, volitelný flight, vybranou hodnotu a
zdroj, reason rozhodnutí, typ anomaly a omezený JSON snapshot kandidátů.
Existující periodická větev retence historie odstraňuje události starší než
nakonfigurovaná retence historie (ve výchozím stavu 30 dní); běžné framy do
databáze nezapisují.

## Diagnostika a bezpečnost

Proces drží v paměti omezené countery, události změny zdroje, nedávné anomaly
snapshoty a 250položkový Beast altitude forensic ring buffer. Admin system
status zveřejňuje tuto diagnostiku pouze po existující kontrole watchlist admin
session. `/api/admin/altitude/:hex` vysvětluje aktuální vybranou hodnotu,
stáří, kandidáty, odmítnuté kandidáty, reason a anomaly pro jedno ICAO.
Veřejné aircraft/SSE serializery neobsahují decision objekty ani snapshoty
kandidátů.
