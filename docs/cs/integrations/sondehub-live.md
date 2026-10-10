# SondeHub V3 – serverový živý přenos MQTT

SondeHub poskytuje přístup k MQTT přes podepsanou WSS adresu na endpointu
`https://api.v2.sondehub.org/sondes/websocket`. Pro živá data doporučuje
přednostně téma `batch` místo častého dotazování veřejného REST API.
Podepsaná adresa zůstává pouze na serveru.

Pro zapnutí nastavte `SONDEHUB_ENABLED=true` a
`SONDEHUB_MQTT_ENABLED=true`; obě nastavení jsou standardně vypnutá.
Při prvním požadavku na mapovou vrstvu vytvoří AirRadar jedno procesově sdílené
spojení MQTT 3.1.1 s WebSocket subprotokolem `mqtt`. Povolené jsou jen
validované podepsané WSS adresy AWS IoT. Každé spojení používá unikátní
identifikátor klienta a odebírá jen agregované téma `batch`.

Zprávy mají omezenou velikost do 1 MiB, jsou průběžně parsovány, procházejí
stávajícím validátorem SondeHubu a filtrují se na 450 km od nastaveného
přijímače. Paměť drží nejvýše 300 pozorování starých maximálně 15 minut.
Nevzniká nová databáze ani požadavky v ADS-B/OGN/SSE/alert větvích.
Po pěti minutách bez uživatelů vrstvy se MQTT odpojí; další pokus o připojení
nastává nejdříve za 90 sekund. Aktivní prohlížeč obnovuje pouze vlastní API
`/api/sondes` každých 20 sekund. Původní vzdálený REST snímek má stále
samostatnou cache 20 minut.

MQTT je doplňkové a bezpečně selhávající rozšíření. Při výpadku WSS, podepsané
adresy nebo telemetrie zůstává dostupný existující REST snímek SondeHubu
a modelová predikce vybrané sondy. Aktuální poloha sondy není polohou letadla;
predikovaný bod dopadu Tawhiri není skutečně změřené místo přistání.

Atribuce a licence: SondeHub contributors, CC BY-SA 2.0.
https://sondehub.org/ ; https://creativecommons.org/licenses/by-sa/2.0/.
Při dalším šíření odvozených dat je nutné dodržet licenční podmínky.

Jednotkové testy: `npx vitest run tests/sondehub-mqtt.test.ts`.
