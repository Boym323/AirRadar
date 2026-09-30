# Flight Intelligence V1

Flight Intelligence má jeden kanonický deterministický engine:
`FlightIntelligenceDetector` v `lib/intelligence/detector.ts`, který vlastní
`FlightIntelligenceService` a volá se z jediné živé snapshot větve
`AircraftStateService`. Historický replay používá stejný detector přes
`lib/intelligence/replay.ts`; nevzniká druhá heuristická implementace.

Normalizovaným vstupem je existující vyčištěné pozorování `Aircraft` a jeho čas.
Detector používá jen dostupná pole a odmítá zastaralá, neuspořádaná, nespojitá a
network-only pozorování. Stav stopy je omezen na 120 vzorků a při úklidu živých
letadel se odstraní.

Fáze jsou `GROUND`, `TAKEOFF`, `CLIMB`, `CRUISE`, `DESCENT`, `APPROACH`,
`FINAL`, `GO_AROUND`, `LANDED` a `UNKNOWN`. Potvrzené přechody používají
hysteresi dvou pozorování, s výjimkou silných provozních přechodů. Události jsou
řídké sémantické řádky v existujícím modelu `FlightEvent`, s identitou založenou
na životním cyklu letu. Selhání persistence nesmí zastavit živý radar.

Události V1 zahrnují `TAKEOFF`, `INITIAL_CLIMB`, `CRUISE_ENTER`,
`TOP_OF_DESCENT`, `APPROACH`, `LANDING`, `GO_AROUND` a zavedené kompatibilní
názvy holdingu `HOLDING`/`HOLDING_ENDED`. Holding vyžaduje trvající geometrii
racetracku, opakované zatáčky, čas, stabilní výšku a stav ve vzduchu. Go-around
vyžaduje potvrzené přiblížení, klesání v malé výšce, trvalé stoupání a vzdalování
od nejbližšího bodu přiblížení.

Události zveřejňují důkazy pravidel, nekalibrovanou úroveň jistoty a
`detectorVersion: flight-intelligence-v1`. Neznámá trasa nebo letiště zůstává
neznámá; zmizení z pokrytí nikdy nevytvoří přistání. První pozorování letadla ve
vzduchu nemůže vytvořit smyšlený vzlet.

Stávající historický read model Airport Operations při navázané kanonické události
`GO_AROUND` nebo `HOLDING` převezme tento výsledek, aby nevznikaly rozpory.
Pro lety bez takové události zachovává fallback nad vzorkovanými pozicemi.

Time Machine čte uložené události s časovým omezením podle jejich výskytu, takže
do staršího okamžiku neunikají budoucí události. V1 nepřidává alerty, predikci ETA,
ML ani událost pro každou pozici.

Viz také: [Time Machine](TIME-MACHINE.md), [Airport Operations](AIRPORT-OPERATIONS.md)
a [anglická verze](../FLIGHT-INTELLIGENCE-V1.md).
