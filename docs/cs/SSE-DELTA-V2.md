# SSE Delta V2

`GET /api/stream` zůstává ve výchozím stavu V1 full-snapshot feedem. Klient
si V2 zvolí pomocí `?v=2`; `coverage=local|extended` se vyjednává nezávisle.

První V2 událost je úplný veřejný live snapshot:

```json
{
  "protocol": "airradar-sse-v2",
  "sequence": "1",
  "aircraft": []
}
```

Další události jsou pojmenované `delta`. Nesou aktuální veřejná snapshot pole
mimo aircraft plus pouze změněná letadla a zmizelé ICAO hexy. Sequence jsou
desetinné stringy a platí pro jedno SSE spojení. Reconnect začíná novým full
snapshotem; klienti nesmějí převádět sequence na JavaScript numbers.

Letadla jsou vždy identifikována ICAO hexem. Změněná položka nahrazuje
předchozí položku klienta, nová položka je v `changed` a každá položka v
`removed` se smaže. Veřejná serializační hranice je sdílena s V1, takže
receiver privacy, sanitizace chyb providerů, route context a coverage sémantika
se neobcházejí.

Server drží pouze jednu veřejnou fingerprint mapu na aktivní V2 spojení. Mapa
je omezena existující SSE client kapacitou a uvolní se při zrušení streamu,
abortu requestu nebo enqueue failure. Pomalá spojení drží jen svůj nejnovější
čekající interní snapshot; delta baseline se posune až poté, co je tento
snapshot skutečně zařazen do fronty.

V1 konzumenti a sekundární stránky zůstávají beze změny. Hlavní radar klient
používá V2 a odmítá malformed nebo out-of-order delty, přičemž se reconnectne
pro nový snapshot místo mutace nejistého stavu.

Sanitizovaná runtime diagnostika `/api/system/status` uvádí aktivní počty
V1/V2, velikost nejnovějšího V2 snapshotu a delta v bajtech a omezené nedávné
delta counts/průměrnou velikost. Neobsahuje payload, historii aircraft identit
ani soukromé souřadnice přijímače.
