# Audit využitelnosti integrací AirRadar — 2026-10-15

Rozsah: aktuální `main` `5da807ac80a7bfa71b3a0becd5f1550ff9d6ae32`,
zapojení ve zdrojovém kódu, dokumentované kontrakty poskytovatelů,
T58 #38775992637, technický audit a incident Integration Health.
Jde o vyhodnocení podle kódu a dostupných agregací, nikoliv
o úplnou statistiku reálného používání. Neproběhly žádné produkční změny,
externí testovací dotazy, operace nad databází ani deploy.

## Rozhodovací kritéria

Každá funkce by měla poskytovat buď přímo viditelný uživatelský výsledek
(spolehlivý lokální radar, identita a trasy letadel, počasí, pozorovaná
historie, užitečná upozornění), nebo měřitelnou provozní diagnostiku.
Experiment, jehož přínos teprve ověřujeme, má být vypnutý do aktivace,
oddělený od radaru, omezený rozpočtem a schválený poskytovatelem.
Nepřítomnost metrik používání **nedokazuje**, že funkci nikdo nevyužívá.

| Integrace / funkce | Doložená role nebo praktický přínos | Doporučení | Důkazy o produkčním využití |
| --- | --- | --- | --- |
| Lokální readsb, Beast a záložní JSON | Kanonická lokální letadla, stav přijímače a kontinuita | **PONECHAT** jako hlavní zdroj | Zdravý v technickém auditu 15. 10.; T58 61/61 vzorků |
| PostgreSQL historie, lokální statistiky, SSE | Sledované lety, statistiky přijímače, živé zobrazení | **PONECHAT** | Databáze dostupná, T58 stále ukazuje nevysvětlené dlouhé stally |
| tar1090-db a OurAirports | Typ a registrace letadla, letiště, dráhy a referenční data | **PONECHAT** s cache a aktualizací | Kód ukazuje zobrazení, ale počty kliknutí nejsou známy |
| ADSBHub SBS stream | Volitelné rozšířené pokrytí a srovnání s lokálním příjmem | **OMEZIT** přepínačem `ADSBHUB_ENABLED` | Produkční provoz streamu nezávisle neověřen |
| ADSB.lol raw a geografické HTTP | Volitelné rozšířené pokrytí; souběh raw/HTTP se může překrývat | **OMEZIT** přepínačem `ADSBLOL_ENABLED` a limity | T58 neprokazuje stav jednotlivých HTTP zdrojů |
| ADSBDB metadata a trasy | Bezplatná registrace, typ a letiště odletu/příletu | **PONECHAT** cache, negativní cache i omezení rychlosti | Čítače cache existují, skutečné využití neznámé |
| PostgreSQL route cache | Šetří opakované dotazy, ale může zatěžovat DB a vyžaduje schéma | **VYHODNOTIT** úspěšnost a obejití cache před rozšířením | Dříve 108 bypassů souběhu a 24 chyb, příčina neprokázána |
| ADSB.lol routeset | Záložní zdroj trasy, poskytovatel ale vrátil odmítnutí 403 | **NEZAPÍNAT** bez svolení a prokázaného přínosu | Potvrzený blokovací cooldown Integration Health |
| FlightAware AeroAPI | Placené podrobnosti letu, plánované a očekávané časy | **PONECHAT NA VYŽÁDÁNÍ**, nikdy automaticky | Kód omezuje výdaje, zájem uživatelů neměřen |
| AviationWeather.gov, METAR/TAF a SIGMET/PIREP | Relevantní počasí přímo dostupné uživateli | **PONECHAT VOLITELNÉ** s cache | Existuje oddělené API a UI, aktivní využití neověřeno |
| RXW ACARS/VDL a H1-FPN | Speciální zprávy a body trasy bez změny kanonických letových dat | **NEZAPÍNAT** bez svolení a reálné poptávky | Oprávnění k přístupu ani konektivita neověřeny |
| OGN APRS, DDB a záložní SoftRF | Přínos pro kluzáky/FLARM, důraz na soukromí, mimo ADS-B jádro | **PONECHAT VOLITELNÉ**, ověřit režii záložní DDB | Metriky používání streamu chybí |
| SondeHub REST a MQTT | Sledování balónů, ne běžného leteckého provozu | **PONECHAT VOLITELNÉ**: REST první, MQTT jen s klienty | Líné spuštění a TTL existují, provozní využití neznámé |
| NOAA Kp a Navigation Integrity | Globální geomagnetický kontext, nikoli důkaz GNSS rušení | **OMEZIT** na výslovný dotaz, bez kauzálních alarmů | Výchozí stav vypnuto, poptávka nedoložena |
| ALADIN/ICON vítr a Echo Top | Odborná modelová srovnání a vertikální meteorologický radar | **ODLOŽIT** spuštění do ověření licence a přínosu | Výchozí stav vypnuto, Echo Top potřebuje Python/HDF5 |
| Planespotters fotografie | Volitelný obrázek letadla s omezeními licence a atribuce | **PONECHAT VOLITELNÉ**, jen při zobrazení detailu | Standardně vypnuto, poptávka neznámá |
| Track Fusion shadow, prediktivní validace a Digital Twin experimenty | Ověřování přesnosti, kalibrace a vývoj budoucích funkcí | **ČASOVĚ OMEZIT** podle dosažitelných metrik; nemazat bez výsledků | Shadow nemění lokální data; T58 nedokazuje uživatelský přínos |
| Push/Pushover upozornění | Užitečná hlášení nouze a watchlistu | **PONECHAT** se souhlasem a metrikami doručování | Alert engine existuje, aktivní odběry nejsou ověřeny |

## Potvrzená neefektivita v kódu: křížová aktivace síťových zdrojů

Před změnou předával `createNetworkAircraftProvider()` do tovární
funkce společný příznak `ADSBHUB_ENABLED || ADSBLOL_ENABLED`.
Na jeho základě se zapínal ADSBHub a vytvářel se i ADSB.lol HTTP
zdroj, bez ohledu na samostatný primární přepínač každého poskytovatele.
Zapnutí jednoho tak mohlo spustit nevyžádané spojení nebo opakované HTTP dotazy.
Navíc i vypnutý ADSBHub určoval minimální periodu publikace 1 000 ms
pro agregát, ačkoliv samotné HTTP bylo nakonfigurováno na 10 sekund.
Prázdné snapshoty vypnutého zdroje se také nadbytečně vyhodnocovaly
a mohly ovlivnit čas poslední aktualizace.

Oprava: nezávislá aktivace, čtení a plánování pouze aktivních zdrojů.
Při explicitním zapnutí obou se jejich data nadále korektně sjednocují
s původem jednotlivých pozorování. Beze změny zůstává lokální ADS-B,
SSE, historie, soukromí, placené obohacování, omezení poskytovatelů
i produkční konfigurace.

## Rozhodnutí, která vyžadují důkazy před odstraněním

1. Sbírat **agregované počty použití funkcí** bez ICAO identifikátorů či IP:
   odlišovat vypnutou, nedostupnou a úspěšně používanou integraci.
   Kvůli měření poskytovatele automaticky nezapínat.
2. Ve stabilních oknech srovnat požadavky na poskytovatele za minutu,
   **počet skutečně nových letadel a čerstvost poloh**, překryv,
   CPU a heap při srovnatelném provozu. Duplicita může mít význam,
   pokud zlepšuje pokrytí a dostupnost.
3. U tras sledovat podíl skutečně použitelných odpovědí,
   zásahy/obejití cache a odmítnutí poskytovatele.
   Počet zásahů cache není přesný počet ušetřených HTTP dotazů.
4. Výzkumné predikce a shadow funkce ponechat jen při
   měřitelném prospektivním zlepšení vůči lokální realitě
   a jasných kritériích pro veřejnou aktivaci.
5. Experimentální integrace držet vypnuté do ověření oprávnění,
   podmínek použití a atribuce. Volitelnost sama o sobě
   není důvod odstranit testy ani historické důkazy.

## Ověření

Regresní testy zahrnují kombinace samostatných přepínačů,
diagnostiku vypnutých zdrojů a HTTP režim s desetisekundovým
intervalem a podvrženou síťovou odpovědí. Před merge musí projít
CI, typecheck, CodeQL a výkonnostní kontroly. V čistě HTTP režimu
může odpadnout až přibližně **90 % probouzení agregačního časovače**,
jestliže jedinou kratší periodou byl vypnutý ADSBHub s 1 sekundou.
Jde o odhad z řídicího toku, **nikoli naměřené úspory CPU ani HTTP**.

## Reference

- `docs/DATA-SOURCES.md`, `docs/FEATURES.md`, `lib/server/providers.ts`
- `lib/server/network-failover-provider.ts`
- `docs/INTEGRATION-HEALTH-INCIDENT-20261015.md`
- `docs/audits/TECHNICAL-AUDIT-2026-10-15.md`
- [T58 report](https://github.com/Boym323/AirRadar/blob/audit/t58-history/reports/t58/2026/10/15/run-38775992637-attempt-1/comparison.md)

## Pokračování: změřit skutečný přínos síťových zdrojů před jejich vypnutím

Odpověď `/api/system/integrations` přístupná pouze administrátorovi nyní
obsahuje `networkSourceValue`. Jednou za 60 sekund aktivního publikování
síťových dat vzorkuje zapnuté snapshoty ADSBHub, ADSB.lol raw a ADSB.lol HTTP.
Pro každý zdroj poskytuje počty hlášených letadel, unikátních čerstvých poloh,
poloh dostupných jen v jednom úspěšně vzorkovaném síťovém zdroji,
překrývajících se poloh a počet unikátních poloh celkem. Vypnuté zdroje
chybějí, selhání má hodnotu null a `complete=false` znamená, že nelze
bezpečně vyhodnotit jedinečnost vůči všem zapnutým zdrojům. Identifikátory
letadel ani souřadnice se do diagnostiky nevypisují a neuchovávají.
Sloučení živého radaru ani frekvenci dotazování zdrojů měření nemění.

**Rozhodovací pravidlo:** porovnat více oken s podobným provozem a
čerstvostí dat, nikoli jeden snapshot. Unikátní síťová poloha znamená
jedinečnost *mezi zapnutými síťovými zdroji*, nikoliv vůči LOKÁLNÍMU přijímači.
Také je nutné ověřit, zda jsou unikátní pozorování skutečně viditelná v
režimu Extended. Zdroj nevypínat jen kvůli objemu zpráv. Sloučení síťových
dat již pro překryv nepoužívá dočasné pole ani řazení; zlepšení CPU/paměti
nelze tvrdit bez měření po nasazení.
