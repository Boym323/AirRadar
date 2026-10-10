# Integrace RXW ACARS Hub (V1)

AirRadar může volitelně přijímat **technická metadata bez obsahu komunikace** ze vzdálené
instance [sdr-enthusiasts/docker-acarshub](https://github.com/sdr-enthusiasts/docker-acarshub).
Adaptér používá Socket.IO namespace `/main` a události `acars_msg` a
`acars_msg_batch`. Není potřeba provozovat `dumpvdl2`, `acarsdec` ani druhý SDR přijímač.

## Aktivace

1. **Nejprve potvrďte u provozovatele RXW**, že povoluje automatizovaný přístup
   a další použití technických metadat. Veřejný web ani otevřený zdrojový kód
   aplikace automaticky neudělují oprávnění k využívání rozhraní.
2. Na serveru AirRadar nastavte `RXW_HUB_ENABLED=true`. Výchozí stav je **vypnuto**.
3. Volitelně nastavte `RXW_HUB_URL=https://hub.rxw.cz` (výchozí URL).
   Povoleno je pouze HTTPS bez přihlašovacích údajů v URL.
4. Restartujte AirRadar. Server naváže **jedno sdílené Socket.IO spojení
   na Node proces**.
5. Otevřete detail letadla. Při zapnuté integraci se zobrazí sekce **Datová komunikace**.

Pokud je integrace vypnutá, nevzniká žádné externí spojení, nic se neukládá
a sekce se nezobrazuje.

## Data a ochrana soukromí

Adaptér **neuchovává, nezveřejňuje ani nezapisuje do logů obsah zpráv**, dekódované
ACARS/CPDLC payloady, osobní údaje ani celé původní zprávy. Do omezené paměťové
cache ukládá pouze ICAO24, čas, protokol, frekvenci, identifikátor přijímací stanice,
kód zprávy a UID ze zdroje. Cache se nezapisuje na disk a zprávy po dvou hodinách expirují.

Párování vyžaduje platnou ICAO24 adresu. Nepoužívá ne-ICAO identifikátory readsb
s prefixem `~` ani odhady podle callsignu. Přijaté polohy se **nikdy neslučují
s ADS-B mapou nebo stopami letů**.
Jedno sdílené spojení přijímá zprávy a omezené počáteční dávky; veřejné API čte
pouze místní cache. Výpadek zdroje neblokuje provoz radaru.

Limity: 512 letadel, 20 zpráv na letadlo, 12 000 UID, maximálně 100 položek
v jedné přijaté dávce. Detail letadla čte
`GET /api/aircraft/{icao24}/communications` každých 30 sekund;
API používá existující omezení četnosti požadavků.

## Stav integrace a omezení

API vrací `enabled`, `connection`, `lastReceivedAt` a `messages`
jako JSON bez cache. Stavy spojení: disabled, connecting, connected, disconnected,
error a stopped. Databázová migrace není potřeba.

Ověřen je pouze komunikační protokol původní open-source aplikace.
Dostupnost a oprávnění automatizovaného přístupu ke **hub.rxw.cz** zatím
nebyly potvrzeny. Aktivace vyžaduje souhlas provozovatele.
Zprávy bez ICAO24 se záměrně zahazují. Historie je pouze v paměti procesu,
nejdéle na dvě hodiny; nejde o trvalý archiv.

Testy: `npx vitest run tests/rxw-hub-store.test.ts tests/rxw-hub-service.test.ts`
