# AirRadar — canonical 178-feature user inventory (21 Oct 2026)

Feature names are copied exactly from the latest user-provided full checklist. **A checked [x] does not mean all 178 are KEEP**: decisions reflect the earlier selection stored in `SELECTED-FEATURE-MATRIX-2026-10-19.json`.

| ID | Exact user-supplied Czech feature title | Decision | Core system |
|---|---|---|---|
| J01 | Příjem lokálních letadel přes readsb JSON · základ systému | **KEEP** | Yes |
| J02 | Přímý příjem lokálních BEAST TCP rámců | **KEEP** | — |
| J03 | Rust akcelerace BEAST parseru a CRC24 | **KEEP** | — |
| J04 | Automatické přepínání BEAST / JSON při výpadku | **KEEP** | — |
| J05 | Správa živého stavu letadel v RAM · základ systému | **KEEP** | Yes |
| J06 | Veřejné API aktuálních letadel · základ systému | **KEEP** | Yes |
| J07 | Živý stream SSE V1 – celé snapshoty · základ systému | **KEEP** | Yes |
| J08 | Optimalizovaný SSE V2 – delta aktualizace | **KEEP** | — |
| J09 | Ukládání vzorkované historie do PostgreSQL | **KEEP** | — |
| J10 | Demo provoz se simulovanými letadly | **REMOVE** | — |
| J11 | Kontinuita identity letadel, detekce výpadků a deduplikace · základ systému | **KEEP** | Yes |
| R01 | Základní interaktivní mapa MapLibre · základ systému | **KEEP** | Yes |
| R02 | Přepínání LOCAL / EXTENDED pokrytí | **KEEP** | — |
| R03 | Ikony letadel podle typu a směru | **KEEP** | — |
| R04 | Popisky letadel a řízení jejich kolizí | **KEEP** | — |
| R05 | Barevné režimy letadel podle provozních údajů | **KEEP** | — |
| R06 | Živý seznam provozu a filtrování letadel | **KEEP** | — |
| R07 | Detail vybraného letadla v mapovém panelu | **KEEP** | — |
| R08 | Zobrazení živé letové stopy (trail) | **KEEP** | — |
| R09 | Sledování letadla kamerou mapy (follow) | **KEEP** | — |
| R10 | Současné sledování více letadel | **KEEP** | — |
| R11 | Zobrazení trasy mezi letišti a jejího průběhu | **KEEP** | — |
| R12 | Vrstvy okolních letišť | **KEEP** | — |
| R13 | Poloha přijímače, kružnice dosahu a měřítko | **REMOVE** | — |
| R14 | Mapové podklady, vzhled a předvolby vrstev | **KEEP** | — |
| R15 | Mapová HUD lišta a rychlé akce | **KEEP** | — |
| R16 | Režim prezentace mapy | **KEEP** | — |
| R17 | ATC sektory a vysílače přímo v mapě | **KEEP** | — |
| R18 | Volitelné počasí a vzdušné prostory přímo v mapě | **KEEP** | — |
| H01 | Samostatný detail letadla – registrace, typ, operátor | **REMOVE** | — |
| H02 | Katalog a automatické doplňování metadat letadel | **REMOVE** | — |
| H03 | Fotografie letadel z Planespotters | **KEEP** | — |
| H04 | Letový plán, volací znak a letiště OD/DO | **REMOVE** | — |
| H05 | Historie konkrétního letadla a jeho letů | **REMOVE** | — |
| H06 | Detail jednotlivého letu (Flight Story V2) | **REMOVE** | — |
| H07 | Výškový, rychlostní a vertikální profil letu | **KEEP** | — |
| H08 | Historické přehrávání konkrétního letu | **REMOVE** | — |
| H09 | Seznam a vyhledávání historických letů | **REMOVE** | — |
| H10 | Porovnání dvou letů | **REMOVE** | — |
| H11 | Time Machine – přehrávání všech letadel v čase | **REMOVE** | — |
| H12 | Event Replay – ±10 minut kolem události | **REMOVE** | — |
| H13 | Historická identita NEW / RARE / RETURNING | **REMOVE** | — |
| H14 | Souhrny letadla za 7/30 dní a celé období | **KEEP** | — |
| A01 | Katalog letišť a vyhledávání podle ICAO | **KEEP** | — |
| A02 | Detail letiště – dráhy, poloha, vybavení a frekvence | **KEEP** | — |
| A03 | Airport Live Board – přehled provozu letiště | **REMOVE** | — |
| A04 | Odvozené přílety, odlety a průlety | **REMOVE** | — |
| A05 | Vyhodnocení použitých přistávacích drah | **REMOVE** | — |
| A06 | Arrival Sequence / Approach Queue | **REMOVE** | — |
| A07 | Arrival Flow, vytížení a stabilita drah (V8) | **REMOVE** | — |
| A08 | Odhad terminálové poptávky / příletů (V9) | **REMOVE** | — |
| A09 | Provozní výjimky a konfliktní údaje letiště | **REMOVE** | — |
| A10 | Live Airport Network – okolní aktivní letiště | **REMOVE** | — |
| A11 | Porovnání letišť | **REMOVE** | — |
| A12 | Historická statistika provozu letiště za 7/30 dní | **REMOVE** | — |
| T01 | ATC sektory včetně geometrie a výškových hranic | **REMOVE** | — |
| T02 | Samostatný detail ATC sektoru | **REMOVE** | — |
| T03 | ATC frekvence, vysílače a publikované služby | **REMOVE** | — |
| T04 | Pravděpodobné ATC přiřazení vybraného letadla | **REMOVE** | — |
| T05 | ATC handoff – odhad přechodu mezi sektory | **REMOVE** | — |
| T06 | Historie provozu a přechodů mezi sektory – API | **REMOVE** | — |
| T07 | Validace a diagnostika ATC dat | **REMOVE** | — |
| T08 | ATS tratě České republiky | **KEEP** | — |
| T09 | ATS tratě Slovenska a Rakouska | **KEEP** | — |
| T10 | NAVAID/FIX databáze a navigační průzkumník | **KEEP** | — |
| T11 | Letové procedury SID/STAR a procedurální data | **REMOVE** | — |
| T12 | AUP/UUP – plánovaná aktivace vzdušného prostoru | **REMOVE** | — |
| T13 | Navigation Integrity – podezřelé anomálie ADS-B | **KEEP** | — |
| T14 | Navigation Integrity – regionální mapa, historie a analýza | **KEEP** | — |
| W01 | Aktuální METAR a TAF letišť | **KEEP** | — |
| W02 | METAR značky a informace přímo v mapě | **KEEP** | — |
| W03 | Meteorologický radar ČHMÚ s časovou osou | **KEEP** | — |
| W04 | Echo Top – výška radarových odrazů | **KEEP** | — |
| W05 | Model větru ICON-EU v různých letových hladinách | **REMOVE** | — |
| W06 | SIGMET a AirSIGMET výstrahy | **KEEP** | — |
| W07 | PIREP/AIREP hlášení pilotů | **KEEP** | — |
| W08 | Počasí měřené letadly z Mode-S / BDS 4,4 | **KEEP** | — |
| W09 | Profil a kvalita počasí pozorovaného letadlem | **KEEP** | — |
| W10 | Weather Fusion – spojení více zdrojů počasí | **REMOVE** | — |
| W11 | Weather Avoidance – vyhodnocení možné odchylky kvůli počasí | **REMOVE** | — |
| W12 | Počasí na trase zvoleného letu | **REMOVE** | — |
| W13 | Historické mapové počasí v Time Machine | **REMOVE** | — |
| W14 | Weather Corridor – počasí v předpokládaném koridoru | **REMOVE** | — |
| P01 | Flight Intelligence – automatické události letu | **REMOVE** | — |
| P02 | Rozpoznávání holding, go-around, diversion, orbit a neobvyklých zatáček | **REMOVE** | — |
| P03 | Přehled událostí a analytická stránka | **REMOVE** | — |
| P04 | Route Intelligence – interpretace letového plánu | **REMOVE** | — |
| P05 | Route Corridor Intelligence – odchylka od plánované trasy | **REMOVE** | — |
| P06 | Trajectory Conformance – odklon, návrat a pravděpodobné DCT | **REMOVE** | — |
| P07 | Predikce času příletu ETA | **REMOVE** | — |
| P08 | Predikce přistávací dráhy | **REMOVE** | — |
| P09 | Predikce změny přistávací dráhy | **REMOVE** | — |
| P10 | Predikce budoucí trajektorie | **REMOVE** | — |
| P11 | Explainable Prediction – vysvětlení podkladů predikcí | **REMOVE** | — |
| P12 | Prospektivní sběr a validace predikcí | **REMOVE** | — |
| P13 | Readiness a pravidla pro zveřejnění predikcí | **REMOVE** | — |
| P14 | Kalibrace a porovnání predikcí s výsledky | **REMOVE** | — |
| P15 | Predictive Operations Center – souhrn předpovědí | **REMOVE** | — |
| D01 | Digital Twin – základní projekce letu na 30 minut | **REMOVE** | — |
| D02 | 4D koridor – budoucí poloha, výška a čas | **REMOVE** | — |
| D03 | Prediction Timeline v detailu letadla | **REMOVE** | — |
| D04 | Budoucí průniky ATC sektorů a ATS tras | **REMOVE** | — |
| D05 | Průniky s plánovanými AUP/UUP prostory | **REMOVE** | — |
| D06 | Průniky s Navigation Integrity anomáliemi | **REMOVE** | — |
| D07 | Operational Focus – prioritní situace letadla | **REMOVE** | — |
| D08 | Operational Focus Change – změny priorit | **REMOVE** | — |
| D09 | Regional Situation Graph – vazby mezi letadly | **REMOVE** | — |
| D10 | Operational Attention – regionální upozornění | **REMOVE** | — |
| D11 | Regional Focus Queue – pořadí prioritních letadel | **REMOVE** | — |
| D12 | Regionální projekce za 5/15/30 minut | **REMOVE** | — |
| D13 | Validace koridoru proti pozdějším pozicím | **REMOVE** | — |
| D14 | Validace predikovaných událostí | **REMOVE** | — |
| D15 | Truth-first Validation – vyhodnocování podle skutečných událostí | **REMOVE** | — |
| D16 | Ukládání anonymních výsledků kalibrace | **REMOVE** | — |
| D17 | Regional Attention Outcome – kontrola regionálních predikcí | **REMOVE** | — |
| D18 | Regional Attention Graduation – pravidla povýšení modelu | **REMOVE** | — |
| D19 | Trajectory Quality V2 – alternativní vertikální model | **REMOVE** | — |
| D20 | Trajectory Quality V3 – výkonově orientovaný shadow model | **REMOVE** | — |
| D21 | Outcome Validation pro modely V2 a V3 | **REMOVE** | — |
| D22 | Graduation/Promotion – výběr schváleného modelu | **REMOVE** | — |
| D23 | Admin Calibration Center – diagnostika modelů | **REMOVE** | — |
| L01 | Watchlist – pravidla sledování letadel | **REMOVE** | — |
| L02 | Hlídání ICAO, registrace, callsignu, typu a aerolinky | **REMOVE** | — |
| L03 | Upozornění podle vzdálenosti od přijímače | **REMOVE** | — |
| L04 | Fleet Explorer – vlastní sledované flotily | **REMOVE** | — |
| L05 | Geofencing – vlastní sledované geografické oblasti | **REMOVE** | — |
| L06 | Emergency squawk 7500/7600/7700 | **REMOVE** | — |
| L07 | Historie upozornění a událostí | **REMOVE** | — |
| L08 | Pravidla cooldownu a odstranění duplicit | **REMOVE** | — |
| L09 | Notification Center – přijaté/nepřečtené zprávy | **REMOVE** | — |
| L10 | Ztlumení oznámení pro letadlo nebo pravidlo | **REMOVE** | — |
| L11 | Push notifikace do prohlížeče | **KEEP** | — |
| L12 | Externí Pushover upozornění | **KEEP** | — |
| L13 | Delivery Health – stav doručování zpráv | **REMOVE** | — |
| L14 | Alert Rule Simulator – testování pravidel | **REMOVE** | — |
| L15 | Alert Effectiveness Analytics – účinnost upozornění | **REMOVE** | — |
| E01 | ADSBHub – příjem externího síťového provozu | **KEEP** | — |
| E02 | ADSB.lol – surový BEAST/SBS stream | **KEEP** | — |
| E03 | ADSB.lol – HTTP geografická záloha | **KEEP** | — |
| E04 | OGN/FLARM – letadla, kluzáky a další cíle | **KEEP** | — |
| E05 | OGN Device Database – identifikace a ochrana soukromí | **KEEP** | — |
| E06 | SoftRF SQLite – nouzová OGN whitelist databáze | **KEEP** | — |
| E07 | ACARS/VDL2 metadata přes RXW Hub | **KEEP** | — |
| E08 | ACARS H1/FPN waypointy a mapová vrstva | **REMOVE** | — |
| E09 | FlightAware – doplňování letových plánů a diagnostika využití | **KEEP** | — |
| E10 | ADSBDB – externí metadata letadel | **KEEP** | — |
| S01 | Aktuální počítadla letadel a zpráv za sekundu | **KEEP** | — |
| S02 | Denní/7denní/30denní agregované statistiky – API | **KEEP** | — |
| S03 | Receiver Coverage – polární mapa dosahu | **KEEP** | — |
| S04 | Analýza slabých sektorů a spolehlivosti příjmu | **KEEP** | — |
| S05 | Rekordy vzdálenosti a přijatých letadel | **KEEP** | — |
| S06 | Statistiky typů letadel, aerolinek a tratí – API | **KEEP** | — |
| S07 | Historická heatmapa a profil provozu – API | **KEEP** | — |
| S08 | Denní a týdenní recap – zbývající API | **KEEP** | — |
| S09 | Logbook a agregované souhrny přijímače | **KEEP** | — |
| O01 | System Dashboard – stav všech komponent | **KEEP** | — |
| O02 | Veřejná kontrola zdraví aplikace a verze · základ systému | **KEEP** | Yes |
| O03 | Receiver Monitoring – zdraví SDR/readsb příjmu | **KEEP** | — |
| O04 | Diagnostika externích poskytovatelů a integrací | **KEEP** | — |
| O05 | CPU, RAM, GC a event-loop telemetrie | **KEEP** | — |
| O06 | Historie výkonu a aktuálních bottlenecků | **KEEP** | — |
| O07 | Databázová latence, fronty a diagnostika zapisování | **KEEP** | — |
| O08 | Systémové diagnostické SSE streamy | **KEEP** | — |
| O09 | T58 production soak, stall canary a CPU profiling | **KEEP** | — |
| O10 | Výkonové benchmarky a zátěžové testy | **KEEP** | — |
| O11 | Automatické CI, testy, CodeQL a bezpečnostní kontroly · základ systému | **KEEP** | Yes |
| O12 | Automatické nasazení, health check a rollback · základ systému | **KEEP** | Yes |
| O13 | Import/synchronizace eAIP, ATS a letištních dat | **KEEP** | — |
| O14 | Automatická dokumentace, changelog a metriky růstu kódu | **KEEP** | — |
| O15 | Správa přihlášení administrátora a bezpečnostních oprávnění · základ systému | **KEEP** | Yes |
| U01 | Responzivní rozhraní mobil/tablet/desktop · základ systému | **KEEP** | Yes |
| U02 | Instalovatelná PWA aplikace | **KEEP** | — |
| U03 | Offline cache posledního známého stavu | **KEEP** | — |
| U04 | Česká a anglická lokalizace | **KEEP** | — |
| U05 | Globální Command Search a navigace | **KEEP** | — |
| U06 | Oblíbená letiště a lokální uživatelské preference | **KEEP** | — |
| U07 | Sdílené záložkové odkazy na filtrování a analýzy | **KEEP** | — |
| U08 | Klávesové zkratky a rychlé ovládání | **KEEP** | — |

## KEEP/REMOVE shared dependencies

- **T01 REMOVE ↔ R17 KEEP** — Published sector geometry remains for the radar ATC overlay; retire dedicated historical/analytic ATC modules only.
- **T03 REMOVE ↔ R17,A02 KEEP** — Retired standalone ATC frequencies page must not erase transmitters on radar or airport frequency references.
- **H01 REMOVE ↔ H03,H07,H14 KEEP** — An aircraft detail page and backing data are still required for photos, profile and summaries even if H01 standalone metadata feature is rejected.
- **H02 REMOVE ↔ E10,H03 KEEP** — Shared enrichment/metadata is needed by selected external ADSBDB and photos.
- **H04 REMOVE ↔ R11,E09 KEEP** — OD/DO and routing provenance remain necessary for retained route rendering and optional FlightAware.
- **H05 REMOVE ↔ J09,H07,H14 KEEP** — Retiring historical flight browse UI must not erase flight records and profile/time-series APIs.
- **P04 REMOVE ↔ R11 KEEP** — Retain minimal route geometry and published ATS semantics without full rejected predictive intelligence.
- **P05 REMOVE ↔ R11 KEEP** — The retained radar route may need simple corridor display; reject only detached predictive intelligence.
- **P06 REMOVE ↔ R11 KEEP** — Route conformance portions retained for R11 must remain if consumed; reject unrelated standalone predictive reports.
- **S08 REMOVE ↔ S02,S09 KEEP** — Keep residual recap/logbook API requested by user without retired standalone recap page.
- **L13 REMOVE ↔ L11,L12 KEEP** — Retired separate delivery-health dashboard must not remove delivery worker and protected retained delivery status API.
- **W13 REMOVE ↔ W03 KEEP** — Retire Time Machine-only weather playback but retain CHMI time series and historical archive compatibility.

## Evidence limitations

All 178 names are now known, but mapping to source code is still mostly family-level. 82 REMOVE IDs lack one-to-one proof of implementation retirement. Never delete a shared dependency required by a KEEP ID.
