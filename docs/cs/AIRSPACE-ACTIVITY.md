# Aktivita českého vzdušného prostoru

AirRadar zveřejňuje českou plánovanou alokaci vzdušného prostoru a zpožděné
historické skutečné aktivace přes `GET /api/airspace/activity`.

## Oddělení zdrojů

Integrace záměrně odděluje dva pojmy:

- **Plán AUP/UUP** (`https://aup.rlp.cz/`) popisuje aktuálně publikovaný
  alokační plán pro období AUP. UUP může rušit nebo měnit položky AUP. Hodiny,
  které se právě nacházejí v okně AUP/UUP, jsou zveřejněny pouze jako
  `plannedNow`; **nejde** o důkaz, že je prostor v daném okamžiku provozně aktivní.
- **Skutečné aktivace** (`https://aim.rlp.cz/?lang=cz&p=act-area`) jsou
  oficiální historické záznamy ŘLP ČR. AIM je popisuje jako skutečné časy
  aktivace/deaktivace ze systémů ŘLP ČR, ale denní JSON soubory běžně publikuje
  se zpožděním 1–2 dnů. AirRadar proto tyto záznamy zveřejňuje jako
  `historicalActual` a nikdy jako live state.

Pro provozní real-time stav musí uživatel ověřit příslušný zdroj ATS/FIC.

## Časový model

Publikační období AUP běží od 06:00 UTC do 06:00 UTC následujícího dne. Časy
řádků před 06:00 patří do následujícího UTC kalendářního dne. Všechny časové
značky vracené API jsou normalizované do ISO 8601 UTC.

## Aplikace UUP

Řádky AUP list-C jsou klíčované svým publikovaným pořadovým číslem. Řádky UUP
list-C se aplikují v publikačním pořadí:

- `CNL` odstraní odpovídající položku AUP;
- jiný řádek UUP nahradí stejné pořadové číslo aktualizovaným vertikálním/časovým oknem;
- nezměněné řádky AUP zůstávají v plánu.

Výstup zachovává publikovaný designátor (`TRA36`) i kanonický český designátor
(`LKTRA36`), aby mapa mohla spojit data plánu/aktivity s importovanou ATC
geometrií bez změny kontraktu statického ATC importu.

## Sémantika živé mapy

Vrstva MapLibre ATC spojuje plánovaná okna AUP/UUP s českou geometrií
`TRA`/`TSA` podle kanonického designátoru. Plán je vizuální kontext
překrytý přes existující ATC geometrii; nemění statický ATC activation contract.

- okno obsahující aktuální UTC čas se vykreslí jako **planned now** s jantarovým zvýrazněním;
- nejbližší budoucí okno se vykreslí jako **planned later** s jemnějším modrým zvýrazněním;
- oblasti bez odpovídajícího plánu zachovají běžný ATC styl;
- stale API data zachovávají stale provenienci a jsou tak explicitně označena;
- ATC popup drží `activationStatus` nezávisle na AUP/UUP a přidává samostatnou
  sekci plánu s UTC časy, vertikálními limity, zdrojem a pořadovým číslem;
- `planned now` se nikdy nevykreslí jako potvrzené `ACTIVE`;
- zpožděné `historicalActual` záznamy jsou záměrně vyřazeny ze živé mapy a
  vyhrazeny pro History/Replay.

Prohlížeč požádá o `/api/airspace/activity` až při prvním zapnutí ATC vrstvy.
Neexistuje žádná browser polling smyčka. Stav mapy se z cacheovaného plánu
přepočítává během běžných renderů radar snapshotu, takže okno plánu může bez
dalšího síťového požadavku přejít z upcoming do planned-now nebo expirovat.

## Runtime hranice

Tato integrace je nezávislá na živých cestách ADS-B/OGN:

- žádný další background poller;
- žádné další SSE spojení;
- žádná PostgreSQL tabulka, změna schématu, index ani migrace;
- žádná PostgreSQL read/write cesta pro airspace activity;
- žádný přístup k `FlightPosition`;
- HTTPS fetch je omezen na `aup.rlp.cz` a `aim.rlp.cz`;
- source body jsou omezeny na 512 KiB a requesty timeoutují po 8 sekundách;
- AUP/UUP se cacheuje v RAM 5 minut, skutečná historie aktivace 30 minut;
- přechodné selhání zdroje vrátí omezený stale last-known-good snapshot, je-li dostupný;
- selhání zdroje nikdy neovlivní `readsb → RAM → SSE`.

## Sémantika API

`planned.status` a `historicalActual.status` jsou nezávislé a mohou mít
`ok`, `stale` nebo `unavailable`.

`planned.windows[].plannedNow` znamená pouze to, že aktuální UTC čas leží
v nejnovějším rozlišeném okně plánu AUP/UUP. Nikdy nesmí být označeno jako
potvrzené `ACTIVE`.

`historicalActual.delayed` je vždy `true`, aby bylo publikační zpoždění
explicitní pro API konzumenty.
