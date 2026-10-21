# AirRadar V2 — specifikace vytvoření nového projektu

**Datum:** 21. 10. 2026  
**Stav:** zadání implementace, nikoli již realizovaný projekt ani souhlas s produkčním nasazením  
**Cílový repozitář:** https://github.com/Boym323/AirRadarV2 — samostatný repozitář vytvářený vlastníkem.
**Cílová infrastruktura:** nový vyhrazený Proxmox LXC od vlastníka; nepoužívat existující LXC V1.
**Archiv V1:** `archive/v1-before-v2-2026-10-21` zůstává ve V1 jako reference.  
**Dosavadní referenční systém:** https://github.com/Boym323/AirRadar  
**Starší plán:** `docs/audits/AIRRADAR-V2-REWRITE-OPTIMIZATION-TASKS-2026-10-21.md` — tento postupný přepis je nahrazen novým samostatným projektem; dokument ponechat pro historické srovnání, oba plány nevykonávat současně.  
**Rozsah produktu:** 79 požadovaných funkcí KEEP a 99 záměrně vyřazených funkcí REMOVE podle `docs/audits/SELECTED-FEATURE-REVISED-2026-10-21.json` a souvisejících popisů.

## 1. Poslání a základní zásady

Vybudovat **AirRadar V2 jako zcela samostatnou aplikaci v repozitáři `Boym323/AirRadarV2` a novém vyhrazeném LXC**, s využitím zkušeností z V1. Oddělit zdrojový kód, CI, historii Gitu, služby, přihlašovací údaje, provozní adresáře i databázi. **Nepřesouvat** celý původní strom projektu, databázové schéma, obří komponenty React, dosavadní API architekturu ani nahromaděné historické abstrakce. Požadované funkce implementovat nově, jednoduše, měřitelně a s jasným vlastnictvím.

**AirRadar V1 ponechat na `main` po dobu vývoje plně funkční a beze změn.** V2 nesmí opakovaně použít její databázi, tajné klíče, adresáře pro nasazení, jednotku systemd, porty, produkční CI ani měnitelné provozní soubory. Zpočátku pracovat se syntetickými testovacími daty a anonymizovanými záznamy. Druhý zdroj příjmu pouze pro čtení je přípustný až po prokázání nulového dopadu na V1. V2 nesmí vysílat data do feederu, opakovaně odesílat skutečná upozornění ani měnit historii V1. Přepnutí produkce je zvláštní schvalovaný krok.

### Smlouva produktu, nikoli kompatibilita zdrojového kódu

- **Všech 79 ID KEEP tvoří cílový rozsah V2.** Každou funkci implementovat novým kódem a samostatně otestovat. První MVP může mít pouze část funkcí, ale žádná se nesmí potichu prohlásit za hotovou. Stav eviduje `feature-matrix.json`: `NOT_STARTED / IN_PROGRESS / TESTED / ACCEPTED`.
- Všech 99 ID REMOVE je **mimo rozsah**; funkce se nemají vrátit jen proto, že existovaly ve staré knihovně nebo modulu.
- V2 **může mít jiné interní API, databázové schéma i architekturu UI**. Dosavadní wire API V1 není automatickou podmínkou; při využití nebo srovnání starých klientů musí být přesně popsána hranice kompatibility a existovat kontraktní testy.
- Historické lety, polohy a statistiky V1 se **nemusí migrovat**. V2 začne s **prázdným úložištěm historie letů**. Referenční katalogy lze znovu získat ze schválených zdrojů, při zachování licencí, autorství a původu dat.
- Požadované chování zahrnuje příjem readsb/BEAST, identitu a kontinuitu ICAO, lokální a rozšířený provoz, mapu živých letadel, omezené SSE full/delta, historii *od spuštění V2*, statistiky přijímače, navigační vrstvy, počasí, soukromí OGN, administraci, diagnostiku a upozornění podle KEEP.
- Funkce je možné vědomě zjednodušit, avšak změny pozorovatelného chování musí být výslovně schválené, nikoli náhodným důsledkem implementace.

## 2. Doporučený technologický základ (výchozí návrh, nikoli dogma)

| Odpovědnost | Výchozí technologie | Důvod a hranice |
|---|---|---|
| Živý příjem, BEAST/Mode-S/CRC, spojování lokálních a síťových stop, autoritativní RAM a SSE | **Rust (Tokio + Axum)** | Předvídatelná spotřeba CPU a paměti, přímé parsování streamů a jeden vlastník stavu |
| Doménové algoritmy, například prostorové vyhledávání ATC, vektorové transformace a deduplikace | **Rust**, pouze když algoritmus patří do engine | Omezené náklady a profilování před ruční optimalizací |
| Databáze, historie, SQL agregace, indexy, retence | **PostgreSQL 17+**, řízené SQL migrace a **SQLx** z Rustu, pokud vyhovuje | Hromadné operace, typované dotazy, nezávislost na předběžné verzi Prisma |
| Web, mapa MapLibre, panely, PWA, přístupnost a překlady | **TypeScript, Next.js, React, MapLibre** | Vhodná architektura a ekosystém pro prohlížeč |
| Sdílené typy API | Verzovaná smlouva **OpenAPI / JSON Schema** a generovaný TS klient | Bez ručního zdvojování Rust/TS DTO; explicitní verze |
| Offline import a čistění dat, deterministické fixture | **Python nebo Rust**, pokud to má důvod | Python nesmí běžet v živé přijímací cestě |
| Telemetrie | Strukturované logy, trace kompatibilní s OpenTelemetry a metriky typu Prometheus | Viditelnost latencí, front, chyb a hranic služeb |
| CI a kvalita | Cargo testy/clippy/fmt/audit, TS lint/typecheck/Vitest, Playwright, CodeQL/SAST, zátěžové a bezpečnostní testy | Ověřovat přesně ten artefakt, který se vydává |

Nevkládat automaticky Go, dlouhodobé Python služby, Kafka, Redis, Kubernetes, mikroservisy ani druhou databázi. Další jazyky a procesy jsou možné **pouze tehdy, převáží-li prokázaný přínos náklady sestavení, provozu, IPC a obnovy**. Volby evidovat v ADR. Nevytvářet duplicitní orchestrace uvnitř Rustu a Next.js.

### Složení runtime

Začít se **dvěma nasaditelnými programy** a jednou oddělenou databází:

1. `airradarv2-engine`: Rust backend s jedinou autoritou nad živými letadly; adaptéry readsb/BEAST/síť, omezená paměť stop, odběry dat, čtecí API a volitelná údržba. Příjem letadel nesmí záviset na dostupnosti Next.js.
2. `airradarv2-web`: Next.js uživatelské rozhraní a případně malý autentizovaný BFF/proxy. **Nesmí** samo pollovat přijímače, vlastnit druhý stav letadel ani zapisovat vzorkovanou historii.
3. `airradar_v2`: samostatná **databáze PostgreSQL a role s minimálními oprávněními**. Další databázový cluster se nezavádí bez výsledků měření. Údaje a přístupy V1 zůstávají oddělené.

`readsb / BEAST (pouze čtení) ─→ Rust příjem/normalizace ─→ kanonické stopy RAM ─→ Rust SSE/HTTP ─→ Next.js / MapLibre`

`Kanonické stopy RAM ─→ omezená asynchronní fronta vzorků ─→ SQLx/PostgreSQL`

Referenční data, obohacení, počasí, ATC a OGN jsou nezávislé volitelné moduly; jejich chyba nesmí zastavit hlavní systém. Veřejná DTO neobsahují tajemství, citlivé identifikátory ani neschválené přesné souřadnice přijímače.

**Zásadní rozhodnutí:** živý stav letadel vlastní pouze Rust engine. Není nutné zachovat původního vlastníka v Node.js. Zachovává se *princip jediného vlastníka*, nikoli implementační jazyk V1.

### Izolované nasazení: nový Proxmox LXC od vlastníka

Vlastník vytvoří **nový LXC i nový GitHub repozitář**. Lokální vývoj a CI mohou začít po založení repozitáře, přístup do LXC nelze předpokládat před předáním údajů a oprávnění. V1 nadále běží ve svém současném kontejneru.

- Návrh počátečních parametrů: **4 vCPU, RAM 4–8 GiB, disk 40–60 GiB**. Nejde o změřený požadavek, musí se ověřit zátěžovým testem.
- V2 musí mít vlastní hostname/IP, neprivilegovaného uživatele, adresáře například `/opt/airradar-v2` a `/var/lib/airradar-v2` a vlastní jednotky systemd (`airradarv2-engine` a `airradarv2-web`). Jde o návrhy, neexistující prostředky.
- Vyhradit jiné porty, například web `4100` a API `4101`. Nezasahovat do V1 portu `3000`, domény, reverzní proxy, systemd, adresářů ani nasazovacího runneru.
- Použít databázi `airradar_v2` se zvláštní omezenou rolí. Sdílení **serveru** PostgreSQL je přípustné jen po ověření kapacity a oprávnění; schéma a databáze V1 se nesdílejí.
- Začít na fixture/replay. Živý read-only zdroj readsb/BEAST lze povolit až po ověření G-14, že neovlivňuje přijímač V1.
- GitHub Actions V2 musí nejprve jen testovat a sestavovat. Žádný CI release do LXC V1; pozdější nasazení míří výhradně na V2, s vlastními secrets a přesným SHA.
- Nový kontejner popsat v `docs/runbooks/LXC-SETUP.md`: OS, CPU, RAM, disk, porty, síť, systemd, přístupy a zálohy bez zveřejnění citlivých hodnot.

Toto zadání **neopravňuje měnit ani odstranit V1** a samo nevytváří nový LXC. Chybí-li připravený repozitář nebo kontejner, označit závislost jako blokér a pokračovat jen bezpečnou nezávislou prací.

## 3. Databáze V2: čistý start, vysoká propustnost a levná retence

### Oddělené schéma

Konkrétní schéma navrhnout až po výčtu potřebných dotazů, životnosti dat, vlastnictví a akceptovaných funkcí KEEP. Doporučené logické skupiny, **nikoli povinné staré názvy tabulek**:

- `reference`: identita letadel, letiště, dráhy, frekvence, NAVAID, ATC a ATS katalogy, původ a verze dat a stav importů.
- `flight`: jednotlivé lety, vzorkované polohy a kompaktní události *vznikající od startu V2*. Volací znak je pozorovaná vlastnost, ne trvalá identita; normalizovat ICAO i čas.
- `stats`: lehké denní/hodinové agregace, 36 pevných sektorů pokrytí (je-li v požadavcích), přehledy 7/30 dní a omezený logbook.
- `navigation`: omezená historie Navigation Integrity a detekovaných odchylek, dotazy podle časového intervalu.
- `delivery`: odběry upozornění, události, trvalá fronta, nároky na úlohy, opakování a audit doručování.
- `ops`: **omezená** historie provozních a výkonnostních měření oddělená od exportu telemetrie a živého stavu.

Zavést pouze data potřebná pro 79 KEEP. Upřednostnit několik dobře indexovaných dotazů před zbytečně obecným schématem. Neukládat na disk každou ADS-B zprávu.

### Požadované optimalizace

1. Z reprezentativního záznamu odhadnout objem zápisů a růst tabulek. Implementovat **vzorkování a slučování**, omezené fronty a dávkové inserty s limity transakcí, intervalem flush a popsaným chováním po pádu.
2. Na **DEV** datech měřit čtení přes `EXPLAIN (ANALYZE, BUFFERS)`, nikoli zatěžující dotazy v produkci. Optimalizovat složené indexy času a ICAO, stránkování, insert/upsert, agregace, N+1 a přenos dat.
3. Retenci volit podle **způsobu čtení a očekávaného objemu**, zvlášť pro polohy, lety, navigaci, provozní diagnostiky a agregované statistiky. Výchozí hodnoty jsou návrh k měření, nikoli neměnná pravidla.
4. BRIN, partitioning nebo hypertable-like struktury použít **až na základě dat** a zvážení provozní složitosti. Nativní PostgreSQL by měl zpočátku stačit; bez důvodu neinstalovat rozšíření.
5. Sledovat write amplification, objem WAL, autovacuum/bloat, velikost indexů, vytížení poolu, čekání na zámky, latence dotazů p50/p95/p99, CPU/RSS a růst disku. Změny DB konfigurace musí být zdokumentované a vratné.
6. SQLx migrace spravovat a revidovat jako zdrojový kód. Všechny změny V2 nejprve provést v její DEV/staging databázi. Před nasazením ověřit zálohy a obnovení; žádná destruktivní migrace V1.
7. Výpadek historie nebo DB nesmí zastavit živý radar. Historie, profily a přehledy musí po čistém startu ukazovat pravdivý prázdný stav, dokud nejsou dostatečná data.

**Nevyužití migrace historie V1 není oprávněním její data smazat.** Budoucí čištění PostgreSQL V1 vyžaduje po přepnutí provozu zvláštní schválení a prokázanou obnovitelnost.

## 4. Smlouvy služeb a správnost

### Identita letadel a původ dat

- Základní identitou je hex ICAO, včetně popsaných zvláštních ne-ICAO identifikátorů readsb. Volací znak a registrace se mohou měnit a musí být časově ohraničená pozorování.
- Každá stopa nese původ poskytovatele: `local` nebo `network`. Lokální měření jsou autoritativní pro lokální stopy; síťová letadla zůstávají jen v RAM, pokud nová specifikace výslovně nepovolí jinak.
- Testy musí definovat omezená stale okna, výběr zdroje (affinity), mass-drop guard, validitu polohy bez (0,0), časovou sémantiku zdroje a pravidla kontinuity.
- Výpadek poskytovatelů, historické DB, počasí nebo enrichmentu nikdy nesmí zastavit živý příjem.

### API/SSE

- Navrhnout verzované `/api/v1/aircraft`, `/api/v1/aircraft/:id`, `/api/v1/stream` (SSE kompletních snapshotů), `/api/v1/stream?mode=delta` (sekvence, počáteční snapshot, změny a odstranění), historii, statistiky, letecká data, počasí a status. Skutečné endpointy schválit v OpenAPI před implementací; uvedené URL nejsou slibem přesné shody s V1.
- SSE musí mít správný content-type, heartbeat, cleanup po odpojení, per-client omezenou a slučovanou frontu, kapacitní limit a odpověď 503, korektní reconnect a izolaci pomalých klientů. Žádný extra polling providerů na klienta, žádná tajemství ani soukromé souřadnice ve veřejném DTO.
- Vyvarovat se práce úměrné **počet odběratelů × všechna letadla × frekvence změn**. Sdílené kanonické projekce a serializace jednou za tick/publikum zavádět na základě měření.
- Administrační zápisy a soukromý status chránit přihlášením, oprávněním, vhodnou CSRF/origin ochranou a validací vstupů. Sanitizované veřejné zdravotní/provozní diagnostiky zůstávají čitelné anonymně.

### OGN/ATC/počasí

- Soukromí OGN je nepřekročitelná podmínka: `noTracking` a DDB opt-out se vylučují; nerozpoznaná identita se nezveřejní; anonymní veřejné cíle nesmí obsahovat původní adresy ani metadata. OGN se nespojuje s ADS-B historií, alerty ani statistikami přijímače.
- ATC vyjadřuje pravděpodobnou shodu geometrie, výšky a času, nikoli potvrzenou naladěnou frekvenci. Nejistotu AGL/MSL explicitně zaznamenat.
- Počasí používá samostatné TTL cache, stale-if-error a přísná časová okna platnosti. Počasí ani archiv nesmí zatěžovat smyčku živého příjmu.

## 5. Navržené rozvržení nového repozitáře

```text
AirRadarV2/
  AGENTS.md
  README.md
  Cargo.toml
  Cargo.lock
  package.json
  package-lock.json
  .github/workflows/
  apps/
    engine/
      Cargo.toml
      src/
        main.rs
        api/
        ingest/
        tracks/
        sse/
        history/
        aviation/
        weather/
        ogn/
        notifications/
        diagnostics/
    web/
      app/
      components/
      features/
      hooks/
      lib/
      public/
      tests/
  crates/
    domain/
    beast/
    geometry/
    contracts/
  database/
    migrations/
    queries/
    fixtures/
  contracts/
    openapi.yaml
    feature-matrix.json
    public-dto-snapshots/
  tools/
    importers/
    replay/
    benchmarks/
  tests/
    fixtures/
    integration/
    load/
    browser/
  deploy/
    systemd/
    scripts/
    smoke/
  docs/
    adr/
    architecture/
    api/
    runbooks/
    plans/
    reports/
```

Počáteční skeleton musí být **menší** než tento seznam, pokud zatím některé moduly nejsou implementované. Nezakládat předčasně prázdné balíčky ani abstrakce. Každý nový crate musí mít popsaný důvod existence a stabilní vlastnictví.

## 6. Etapy nového projektu, postupně a odděleně

Každé `G-XX` je samostatně proveditelné. Než začne další nezávislá etapa, musí být hotové testy a důkazy té aktuální. Etapy G-00 až G-14 **nesmějí nasazovat ani nahradit produkční V1**.

### G-00 — Nový repozitář, základ a infrastruktura sestavení

Založit **samostatný repozitář `Boym323/AirRadarV2`** s vlastní větví `main` a historií Git. Vyřešit licenci, přidat README, AGENTS.md, schéma architektury, ADR, CI jen pro V2 (**bez deploy jobu**), sken tajemství, Cargo workspace, Next.js aplikaci, pravidla stylu a deterministické sestavení. Připravit návod na samostatný LXC bez zásahu do V1. Repozitář a LXC dodává uživatel; chybějící prostředek je blokér, ne důvod přepsat V1. Připravit oddělenou DEV databázi a fixture. Ověřit, že nejsou znovu použity V1 secrets, DB ani porty.

**Přijetí:** nový checkout se sestaví a otestuje z uzamčených lockfile; lint/typecheck/Cargo projdou; CI artefakt je svázán s přesným SHA; nový repozitář nemá přístup k nasazení V1; V1 zůstává beze změn. Chybějící repo, toolchain, lockfile nebo host jsou označeny PARTIAL/NOT STARTED.

### G-01 — Kontrakty, testovací data a matice funkcí

Přenést **seznam produktových ID, názvů a rozhodnutí**, nikoli původní implementaci. Sepsat ověřitelné scénáře pro 79 KEEP a explicitní vyloučení 99 REMOVE. Zachytit bezpečná deterministická data readsb JSON/BEAST, příklady SSE a API V1 a navigační/meteorologické vzorky bez přesných soukromých souřadnic a tajných klíčů providerů. Verzovat všechna veřejná DTO; parser a změny stavu pokrýt property-based testy.

**Přijetí:** strojově čitelná matice funkcí, výchozí OpenAPI, replay fixture, srovnání sémantiky V1/V2 a popis vědomých odchylek.

### G-02 — Rust jádro: lokální příjem ADS-B a stav (MVP backend)

Implementovat read-only readsb JSON a BEAST adaptéry, parser Mode-S/CRC a jeho testy, normalizovaný model letadla, identitu ICAO, tabulku aktivních RAM stop a omezený lifecycle s jediným vlastníkem. Doplnit failover mezi zdroji, zdraví přijímače, kadenci, zotavení z chyb a nezávislost živého výstupu na databázi. Z V1 používat jen malé **ověřené algoritmy a fixture**, pokud dovoluje licence a regresní parity. Žádné plošné kopírování kódu.

**Přijetí:** opakovatelný replay, shoda parseru Rust s fixture, obnova po výpadku provideru a konstantní/omezené náklady RAM pro očekávané počty letadel.

### G-03 — Rust síťové zdroje, rozhodování o původu a Continuity Guard

Připojit ADSBHub SBS, ADSB.lol raw a HTTP zálohu za samostatnými timeouty a backoff. Sjednotit časové značky, slučování polí, source affinity, sjednocení LOCAL/EXTENDED a ochranu proti hromadnému výpadku stop. Všechny mapy stop u jednotlivých poskytovatelů musí mít limity.

**Přijetí:** správné označení síťových letadel, zachování autority lokálních měření, deduplikace a izolace chyb potvrzená replay zátěží 1×/2×/4×.

### G-04 — Rust REST API a SSE full/delta

Implementovat schválené OpenAPI endpointy a oba protokoly SSE (plný snapshot i změnová delta), připojovací limity, heartbeat, backpressure, omezené sdílení dat a bezpečné DTO. Generovat klientské TS typy. Zveřejnit metriky engine bez nákladného opakovaného výpočtu pro každého klienta.

**Přijetí:** 1/10/100 simulovaných klientů, pomalí odběratelé, reconnect, cleanup, nulový únik dat a změřené P95/P99, CPU a RSS.

### G-05 — Nové PostgreSQL schéma V2, historie a retence

Připravit **samostatnou databázi `airradar_v2`**. Zavést jen potřebné tabulky a SQLx migrace. Zaznamenávat vzorkované polohy a jednotlivé lety s omezenými asynchronními zápisy; implementovat historii/profily/přehledy, indexované časové dotazy, agregace a retenční politiku. **Bez importu historie V1.** Žádné automatické kopírování dat ani připojení zapisovače V2 k V1.

**Přijetí:** výpadek DB nezastaví radar; skutečný replay prokazuje rozumné WAL/IO a CPU; testovat identitu letu, změny času DST, stránkování, selhání dávek, obnovu, retenci i prázdné stavy 7/30 dnů.

### G-06 — Nový frontend: živá mapa a základní UX (MVP)

Navrhnout Next.js/React/MapLibre z malých samostatných komponent: životní cyklus mapy, hook streamu, symboly a popisky letadel, LOCAL/EXTENDED přepínač, seznam a hledání, detail, stopu, sledování a mobilní rozvržení. Nekopírovat monolitickou mapu ani globální CSS. Instance mapy zůstává stabilní a aktualizace zdrojů se dávkují. Měřit počet React commitů a latenci snímků.

**Přijetí:** použitelná mapa na desktopu i mobilu nad replay; bez remountu při výběru letadla, bez neomezených cache a s Playwright testy vzhledu a interakcí.

### G-07 — Letiště, ATC/ATS/NAVAID a Navigation Integrity

Znovu vytvořit katalog, vyhledávání a detail letišť, vybrané ověřené zdroje eAIP/CZ/SK/AT ATS, prostorové indexování ATC, navigační body a Navigation Integrity včetně anomálií a historie. Prostorový index v Rustu jen na základě benchmarku. Katalogy verzovat, zachovat původ zdrojů, atomické výměny a předepsané licence leteckých dat.

**Přijetí:** ekvivalence zvolených viditelných funkcí, stabilní čas prostorových dotazů P95/P99 bez blokace webového event loopu, správné výškové jednotky a nevymýšlení poloh vysílačů.

### G-08 — Počasí a časový kontext mapy

Implementovat aktuální METAR/TAF, časovou osu radaru ČHMÚ, SIGMET/AirSIGMET, palubní počasí BDS a případné nutné archivní projekce. Poskytovatelé mají oddělené limity, cache a časovou platnost. Samotné tickování živého ADS-B nesmí spouštět dotazy na počasí.

**Přijetí:** správný časový posuvník, validní stale-if-error, žádná záplava upstream dotazů a nezměněný ingest při výpadku počasí.

### G-09 — OGN, DDB, SoftRF, RXW a obohacování dat

Oddělit příjem OGN, RAM a SSE od ADS-B; zachovat přísná DDB privacy pravidla, cílené dotazy a cache, nouzový seznam SoftRF a související testy. RXW Hub i metadata FlightAware/ADSBDB/Planespotters přidávat jen na vyžádání a s limity providerů.

**Přijetí:** cíle se zákazem sledování či neurčenou identitou se nesmějí zveřejnit; volitelní provideři degradují bezpečně; metadata nezvyšují počet volání v ingest smyčce.

### G-10 — Notifikace a administrativa

Implementovat odběry a doručování Web Push/Pushover s jediným trvalým stavovým automatem claim/retry. Neznámý kanál se nesmí označit jako SENT. Omezit opakované odeslání v mezích vlastností provideru a popsat limity exactly-once vůči externí síti. Přidat bezpečný admin login, anonymní sanitizovaný health, potřebné rate limity a autorizaci. Shadow V2 nesmí rozesílat skutečné zákaznické alerty.

**Přijetí:** test dvou workerů, restartů a expirovaných claimů; negativní reakce 2xx/429/5xx; oddělení public/admin a žádné duplicitní zprávy ze shadow režimu.

### G-11 — Statistiky, pokrytí přijímače, stav systému a T58

Zavést denní/7/30denní agregace, 36 sektorů příjmu, počítadla, logbook, měření CPU/RSS/heap, frontu databázových zápisů a zdraví integrací. Nízkorežijní telemetrie a skutečný read-only T58 soak doplní pravidelný benchmark 1×/2×/4×.

**Přijetí:** statisticky porovnatelné replay a bezpečná produkční pozorování bez zápisu; diagnostické endpointy nezahřívají volitelné providery a historie měření je omezená.

### G-12 — Dotažení produktu: přístupnost, PWA a všechny interakce

Připravit čisté sémantické UI, případně tmavé/světlé téma, CZ/EN překlady, command search, klávesové zkratky, offline poslední známý snapshot, podporu čteček obrazovky, ovládání klávesnicí a responzivní vzhled. Neimplementovat 99 REMOVE stránek.

**Přijetí:** Playwright desktop/tablet/mobil, úplnost překladů, bezpečnost offline cache a správná invalidace verzovaného obsahu.

### G-13 — Dokončení funkcí a nefunkční odolnost

Ověřit end-to-end všech 79 produktových KEEP scénářů; u každého ID uložit odkazy na reálné důkazy a případné přijaté vědomé odlišnosti. Spustit fuzz/property testy, bezpečnostní audit, CodeQL, zátěž a souběh, backpressure, škodlivé vstupy, výpadek DB a přijímače, chybné secrets a uživatelské browser flow. Popsat provoz a obnovitelnost.

**Přijetí:** žádné KEEP potichu nezmizí; všechny požadavky jsou otestované a přijaté, případně explicitně blokované. Kritická bezpečnostní, soukromá či datová chyba znamená NO-GO.

### G-14 — Paralelní stínový provoz

Spustit AirRadar V2 v **odděleném prostředí**. Read-only zrcadlený feed povolit jen po technickém ověření a schválení, jinak používat deterministický replay. V2 nesmí ve shadow režimu odesílat skutečné alerty ani data feederům, sdílet DB, porty ani konfiguraci. Srovnávat snapshoty, čerstvost, CPU/RSS/síť, SSE reconnect a UX po reprezentativní dobu a pracovat se skutečně změřenými hodnotami. V1 se nesmí ovlivnit.

**Přijetí:** verzovaný protokol stínového testu, srovnatelné vstupy, dokumentované rozdíly a potvrzení nulového dopadu na V1.

### G-15 — Výslovné rozhodnutí o přepnutí a vlastní produkční nasazení V2

**Pouze tato etapa může potenciálně nahradit živou V1 a i zde je nutný výslovný souhlas uživatele s přepnutím a infrastrukturními zásahy.** Připravit vlastní systemd služby, adresáře releasů, oddělené staging/produkční klíče a možnost návratu. Ověřit zálohu databáze V2 **včetně obnovy**, přesný commit sestavení, skutečné zátěžové testy a funkční rollback na V1. Neprovádět nechtěné DNS/proxy změny; přesměrování domény musí být zvlášť povolené. Přepnutí až po kontrole veřejného UI, readsb/BEAST, zápisů historie, DB, OGN privacy, původu dat, počasí, notifikací a T58.

**Přijetí:** jednoznačná zpráva GO/NO-GO. V1 zůstává použitelná jako rollback a nedotknutá až do zvláštního schválení uchovávání či vyřazení.

## 7. Kvalita sestavení, výkonové limity a důkazy

Sledovat nejméně tyto veličiny jako **měření**, nikoli vymyšlená procenta zrychlení:

| Metrika | Způsob měření | Podmínka přijetí |
|---|---|---|
| Čerstvost od příjmu po mapu | Časovaný replay a skutečný read-only shadow záznam | Bez významného zpoždění vůči platné referenci |
| CPU | Stejné vstupy 1×/2×/4×, zvlášť procesy i engine+web | Prokazatelný poměr nákladů a přínosu bez nevysvětlených špiček |
| RSS/heap a alokace | Ustálený provoz a vícehodinový soak | Omezená paměť bez postupného růstu |
| SSE distribuce | 1, 10 a 100 klientů; full a delta | Omezené buffery, zvládnutý reconnect/výpadek a stabilní P95/P99 |
| Databázové zápisy | WAL, insert/dávky, I/O a latence dotazů P95/P99 | V rámci měřených zdrojů a bez DB práce v hot path |
| Parser Rust a kanonický stav | Fixní referenční BEAST/JSON fixture a property testy | Úplná správnost všech známých případů |
| Testy 79 KEEP | Matice s odkazy na testy, UI záznamy a kontrakty | Každý požadavek přijat nebo jeho blokér výslovně uveden |
| Bezpečnost a soukromí | CodeQL, cargo audit, secret scan, OGN a anonymous/admin testy | Žádný kritický únik ani neautorizovaný admin zápis |
| Obnova po výpadku | Kill/restart, DB offline, výpadek feedu, obnovení zálohy | Bezpečný automatický nebo popsaný návrat bez vlivu na V1 |

Konkrétní rozpočty výkonu určit **až po referenčních měřeních G-01/G-02**. Přednost mají smysluplné latence P95/P99 a interakce skutečných uživatelů před syntetickou propustností. Logy a přesné Git SHA ukládat do `docs/reports/`. Pouhé hezčí UI nebo menší počet řádků není důkaz úspěchu.

## 8. Import dat, licence a pravidla používání V1

- V1 je referenční implementace pouze pro čtení; žádné mutace, hot reload, nasazení kódu, úpravy health workflow ani čistění DB.
- V2 smí používat **sanitizované exportované fixture**. Privátní či proprietární provozní data a přihlašovací údaje providerů se nesmí dostat na GitHub. Diagnostiky a logy získávat jen s oprávněním a po anonymizaci.
- Letecké katalogy (letiště, ATC, ATS, NAVAID, regionální omezení, ČHMÚ, počasí) načítat z doložených zdrojů podle licencí a pravidel atribuce. Nevymýšlet skutečné frekvence nebo stanoviště ATC.
- Databáze V2 začíná bez historických letů. Referenční katalogy nejsou historické lety a je třeba je naplnit. Statistiky denní/7/30 dnů i celkový přehled začínají od prvních pozorování V2.
- Historii V1 nikdy nemazat; čistého startu historie V2 dosáhneme právě tím, že stará data nemigrujeme.

## 9. Definice dokončení a výstup pro uživatele

Po každé etapě uvést Git SHA, upravené a nové soubory, změny veřejného API, implementovaná KEEP ID, počty úspěšných/přeskočených testů, výkon před/po při stejném vstupu, rizika a další závislosti. Pokud je úkol blokován, uvést konkrétní chybějící oprávnění nebo zdroj a nechat hotové moduly ve spustitelném stavu.

G-15 je celkově hotovo až tehdy, když je V2 skutečně samostatná aplikace ve vlastním repozitáři a LXC bez provozních závislostí na V1; všech 79 zvolených schopností má individuální testovací důkazy; žádná z 99 vyřazených funkcí se nevrátila bez schválené změny rozsahu; DB i živý zdroj dat jsou nezávislé; desktopové i mobilní UI funguje stabilně; pozorovatelnost a obnova jsou ověřené; provozovatel výslovně povolil bezpečné přepnutí.

---

## 10. Zadání pro spuštění Codexu

> Vytvoř novou implementaci v odděleném repozitáři **`Boym323/AirRadarV2`** podle následující specifikace:
>
> https://github.com/Boym323/AirRadar/blob/main/docs/audits/AIRRADAR-V2-GREENFIELD-BUILD-BRIEF-2026-10-21.md
>
> **Začni pouze etapou G-00**, potom G-01, je-li G-00 zcela ověřena. Stav od prázdného repozitáře V2, nikoli refaktorem starého AirRadaru. Nový vyhrazený LXC zřizuje uživatel; starý kontejner V1 nepoužívej ani dočasně. Inventář funkcí a runtime omezení V1 chápej jako produktové požadavky, nikoli architekturu ke kopírování. Použij Rust/Tokio/Axum pro live engine, TypeScript/Next.js/MapLibre pro UI, PostgreSQL/SQLx pro novou DB a jiné jazyky pouze s odůvodněním.
>
> Neměň ani nenasazuj V1, nesdílej její databázi a porty, neimportuj historii starých letů. Nepoužívej CI/deploy V1 ani její LXC; V2 později dostane vlastní release pipeline. Realizuj produkční úroveň CI, testy, deterministický vývoj, API kontrakty a první skutečně spustitelný skeleton. Zaznamenej commity, výsledky ověření, bezpečnost nasazení a další etapy. Produkci nepřepínej bez zvláštního schválení.
