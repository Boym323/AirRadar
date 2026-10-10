# Upozornění a flotily V1

AirRadar vyhodnocuje upozornění v existující jediné procesní cestě
`AircraftStateService`. Vstupem horké cesty je snapshot přijímače; párování
flotil i stav geozón jsou omezené v paměti a pro jednotlivé ADS-B rámce,
pozice ani opakované squawk rámce se nevytvářejí řádky v databázi.

## Pravidla

ICAO hex a registrace se porovnávají přesně po normalizaci. Volací znak používá
pouze prefix, nikoli fuzzy vyhledávání. Vypnutá flotila, matcher, pravidlo nebo
geozóna nemůže vytvářet nová upozornění.

Události letu vycházejí z kanonické Flight Intelligence; nevzniká druhý
detektor. Opakované vyhodnocení stejné události je bezpečné díky
deterministickému ID výskytu.

U kódů 7500, 7600 a 7700 se upozornění vytváří jen při přechodu do kódu.
Opakované rámce se stejným kódem upozornění nevytvářejí. První snapshot po
restartu slouží jako základní stav. Text upozornění popisuje pozorovaný squawk,
nikoli nezávisle potvrzenou nouzi nebo únos.

Kruhové geozóny používají hysterézní pásmo 100 m a vyžadují dvě po sobě jdoucí
pozorování na nové straně hranice. První pozorování vytvoří základní stav a
nevytvoří ENTER/EXIT.

Konfigurace je chráněna existujícím administrátorským tokenem. Pushover je
serverová integrace; tajné údaje se neposílají do prohlížeče ani do historie.
Historie upozornění zůstává trvalá i při výpadku externího doručování.

## Architektura

Vyhodnocování zůstává součástí existujícího `AircraftStateService`; nevzniká
druhý poller ani druhý detektor událostí Flight Intelligence. Matchery flotil
se načítají jako omezená konfigurace v paměti. Tím se zabrání dotazu do
PostgreSQL při každé změně polohy a zachová se malý počet zápisů do úložiště.

Výskyt upozornění ukládá pouze kompaktní kontext potřebný pro historii:
identifikátor letadla, pravidlo, typ signálu, čas a prezentační metadata.
Kompletní snapshot letadla ani stopa letu se do upozornění nekopírují.

## Doručení

Kanál IN_APP znamená trvalý záznam v historii. Pushover je doplňkový kanál a
jeho tajné údaje zůstávají na serveru. Při timeoutu po přijetí požadavku nelze
u externí HTTP služby matematicky zaručit doručení právě jednou; stav pokusu
proto musí zůstat viditelný jako opakovaný nebo neúspěšný.

## Omezení

Upozornění závisí na lokálně přijatých ADS-B datech. Výpadek přijímače může
skrýt průchod hranicí geozóny a letadlo mimo pokrytí nemůže vytvořit živé
lokální upozornění. Geozóny V1 jsou pouze kruhové; složité polygony, Web Push,
e-mail, SMS a prediktivní upozornění nejsou součástí této verze.

Zpět na [anglickou dokumentaci](../ALERTS-FLEETS.md).


## Fleet Explorer V2 (V6-F, první dodávka)

Existující omezený seznam letadel z watchlistu zůstává jediným zdrojem dat. V6-F přidává vyhledávání v ICAO/registraci/provozovateli/volacím znaku/typu, filtr živá–offline, řazení a souhrn na základě maximálně 100 již načtených položek. Součet pozorování za 30 dní je součtem stávajících hodnot pro jednotlivá letadla, **nikoli** počtem unikátních letů. Nevzniká nový SQL dotaz, stream, API ani dotaz na externího poskytovatele. Analytika letišť a Airport Live Board už mají vlastní produkční implementace; neduplikujeme je.
