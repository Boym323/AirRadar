# Runtime invarianty

Tyto podmínky jsou trvalé kontrakty runtime. Změna implementace je přípustná
jen tehdy, pokud zachová jejich význam.

- ICAO hex je identita letadla; callsign je pouze pozorování.
- Živý stav a jediný poller `AircraftStateService` zůstávají v jednom procesu.
- Cesta `readsb → RAM → SSE` nesmí být závislá na PostgreSQL.
- `/api/stream` zůstává SSE s omezeným doručením a heartbeat chováním.
- Síťová a OGN pozorování se nesmí vydávat za lokální přijímač.
- ATC výsledek je pravděpodobná shoda polohy, výšky a času, ne důkaz frekvence.
- Veřejné DTO nesmí odhalit tajné údaje, surové chyby providerů ani přesnou
  polohu přijímače bez explicitního režimu.

## Identita a pozorování

- ICAO hex je jediný identifikátor letadla; callsign, registrace a typ jsou
  atributy pozorování nebo obohacení.
- Lokální stav se aktualizuje podle ICAO, nikdy podle callsignu.
- Zastaralé pozorování se nesmí vracet do veřejného snapshotu.
- Síťová pozorování musí zachovat původ a nesmí být vydávána za měření
  lokálního přijímače.

## Proces a doručování

- V procesu běží jediná instance `AircraftStateService` a jediný lokální poller.
- Poller, alerty, statistiky a vzorkování historie nesmí být duplikovány více
  Node workery.
- `/api/stream` je SSE, nikoli WebSocket.
- SSE fronta je omezená a snapshoty se mohou slučovat; heartbeat musí zůstat
  funkční i při absenci nových pozorování.
- Odpojení klienta musí uvolnit jeho baseline a posluchače.

## Persistence a odolnost

- PostgreSQL je volitelný pro živý provoz.
- Selhání databáze, enrichmentu, ATC nebo volitelného provideru nesmí zastavit
  lokální ingest, RAM stav ani živé SSE.
- Síťová a OGN data se nesmí zapisovat do lokální historie, denních statistik,
  `FlightPosition`, lokálních alertů ani zdraví přijímače.
- Retry, cache, fronty, streamy a paginace musí mít omezenou kapacitu.
- Produkční databáze se nesmí resetovat ani destruktivně migrovat.

## Soukromí a bezpečnost

- Veřejná serializace nesmí obsahovat tajné údaje, přihlašovací údaje, surové
  chyby providerů ani přesné souřadnice přijímače ve výchozím režimu.
- ATC výsledek je pouze pravděpodobná shoda polohy, výšky a času; není důkazem
  naladěné frekvence letadla.
- OGN neověřená nebo zastaralá identita se zveřejní anonymně, případně vůbec.
- Cizí síťové RSSI a message count nesmí být použity jako lokální měření.

## Dokumentace a UI

- Uživatelské texty patří do `lib/i18n/`; zavedené letecké termíny se
  nepřekládají nekonzistentně.
- Nová, odstraněná nebo přejmenovaná Next.js stránka či API route vyžaduje
  aktualizaci `docs/features.registry.json` a regeneraci `docs/FEATURES.md`.
- Vizuální změny používají sdílené primitivy a tokeny a nesmí zvyšovat vizuální
  dluh.

Úplný kontrakt je v [anglické verzi](../RUNTIME-INVARIANTS.md).
