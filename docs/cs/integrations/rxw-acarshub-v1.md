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
kód zprávy, strukturované hlášení trasy a UID ze zdroje. Cache se nezapisuje na disk a zprávy po dvou hodinách expirují.

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

## V2: Strukturované informace o trase

Adaptér nově parsuje pouze strukturovaná pole `depa`, `dsta`,
`eta` a `flight` ze zdrojové zprávy. Přijímá úplné dvojice
**třípísmenných IATA / čtyřpísmenných ICAO** kódů letišť,
které se vyskytují v **téže zprávě**, a ETA pouze jako **čas v UTC**
(`HHMM`, `HH:MM` nebo s koncovým `Z`).
Neodvozuje waypointy z polí `text`, `data`, `libacars`
či `decodedText` a netvrdí, že jde o kompletní letový plán.

`GET /api/aircraft/{icao24}/communications?flight=CSA123` vrací
`routeHint` označený `source=rxw-acarshub` a
`confidence=reported` spolu s původním časem příjmu.
Návrh trasy vznikne jen tehdy, když **jedna zpráva** obsahuje obě
letiště, ICAO24 odpovídá letadlu, identifikátor letu se přesně shoduje
s aktuálním callsignem a zpráva není starší než **45 minut**.
Zprávy bez identifikátoru letu mohou zůstat v technických metadatech,
ale nesmí se automaticky přiřadit aktuálnímu letu. Pokud podmínky
nejsou splněny, API vrací null.

Detail letadla v sekci **Datová komunikace** ukazuje nahlášená
letiště a ETA odděleně od stávajících údajů ADSBDB/ADSB.lol
a FlightAware, výslovně jako **neověřené**.
RXW **nepřepisuje** autoritativní `FlightRoute`, nemění historii
letů ani nevytváří nové dotazy do FlightAware.
Indikace trasy zůstávají jen ve stávající omezené paměťové cache
(dvouhodinové uchování zpráv); nepřibývají databázové zápisy
ani další síťové dotazy. Stále je nutný souhlas provozovatele RXW.

## V3: Waypointy H1/FPN a odlišení letadel na radaru

V3 přidává **striktní dekodér známého formátu ACARS H1/FPN** s omezenými
vstupy a pamětí. Funkce má vlastní přepínač: až po souhlasu s využitím obsahu
nastavte zároveň \`RXW_HUB_ENABLED=true\` a \`RXW_FPN_ENABLED=true\`.
Oba přepínače jsou ve výchozím stavu vypnuté. Samotné zapnutí FPN
nevytvoří spojení s RXW.

* Parser přijímá pouze **úplnou jedinou** H1 zprávu s prefixem \`FPN/\`,
  poli \`DA\`, \`AA\` a posloupností waypointů \`F\` (případně rozpoznaný
  úsek \`CR\`). Zpráva musí končit čtyřmi hexadecimálními znaky kontrolního
  součtu; algoritmus **zatím nedokážeme ověřit**.
* Stav \`RP\` znamená **plánováno/hlášeno**, nikoli ověřený aktivní
  letový plán. Stav \`RI\` zneplatní odpovídající starší plán.
  Volitelné ID letu z hlavičky FPN musí odpovídat ID z ACARS.
* Waypointy zachovávají pořadí, názvy, případné letové cesty a explicitní
  GPS souřadnice (\`N01234W123456\` = 1,234°, −123,456°). Neznámé
  souřadnice zůstávají prázdné. Chybějící části zpráv nedoplňujeme odhadem.
* Původní obsah ACARS zpráv se nikdy neukládá do cache ani do databáze,
  nezapisuje do logů a neposílá přes API. Uchovávají se jen povolená
  metadata a nejvýše 80 bodů. Plány jsou omezené na 256 letadel,
  expirují po 45 minutách a párují se výhradně podle **ICAO24 a callsignu**.
* \`GET /api/aircraft/{icao24}/communications?flight=...\` vrací také
  \`waypointPlan\` pouze při přesné shodě. Radar volá
  \`GET /api/aircraft/communications/waypoints\` **jednou za 60 sekund**
  a dostává nejvýše 256 identifikátorů letadel a příslušných letů.
* Letadla s platným RP plánem získají na mapě jemné zlatavé označení
  **FP** a kroužek. Po výběru letadla se vykreslí přerušovaná
  zlatavá trasa **jen mezi sousedními waypointy s explicitními
  souřadnicemi**. Přes neznámé body nebo přerušení se nespojuje.
  Nemění se existující ikony, priorita nouzových stavů, ADS-B stopy,
  ADSBDB/ADSB.lol ani FlightAware.

Podporujeme zatím jen zdokumentovaný H1/FPN. H1/POS, ADS-C,
skládání vícedílných zpráv, syntéza SID/STAR a automatické povýšení
důvěryhodnosti trasy nejsou součástí této etapy.
Dostupnost živých RXW dat a oprávnění provozovatele nejsou potvrzeny.

Testy V3: \`npx vitest run tests/rxw-fpn-waypoints.test.ts\`
