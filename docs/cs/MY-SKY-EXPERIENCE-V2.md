# My Sky Experience V2

## Cíl

My Sky V2 převádí existující data z LOCAL přijímače do jednoho
přehledného místa: jaké letadlo je nad uživatelem nebo v jeho okolí,
proč je zajímavé a jak ho otevřít na mapě, v detailu nebo přidat
do sledování. Je to uživatelská nadstavba nad **Mobile Spotter V1**,
nikoli druhý backend, zdroj letadel, tracker či notifikační engine.

## Chování

Na stránce `/spotter` se hned za volbou výchozí polohy zobrazí
**Právě nad vámi**, nad existujícím 60minutovým briefingem. Oprávnění
k poloze se vyžaduje **pouze na základě akce uživatele**
Moje poloha / Ukázat moje nebe. Výchozí režim zůstává přijímač.
Bez povolení se zobrazuje srozumitelná zpráva, nikoli smyšlená
poloha.

Výběr zahrnuje jen letadla přímo z LOCAL přijímače či s potvrzenou
LOCAL proveniencí, s platnou pozicí a vzdáleností maximálně
**30 km od uživatele**. Vzdálenost a azimut se počítají v prohlížeči
z uživatelské polohy, nikoli z `distanceKm` vztažené k přijímači.
Stávající skóre zajímavosti poskytuje vysvětlitelné důvody
(ikonický typ, nouzový stav, vzácné, nové, widebody, blízkost).
Předpokládaný nejbližší průlet je stejná časově omezená
kinematická projekce jako v ostatních částech Spotteru.
**Nejde** o ověřený letový plán ani předpověď pokynů ATC.

Deterministický výběr maximálně pěti karet upřednostní zajímavé,
blízké, přelétající a blížící se letouny. Pořadí je stabilizováno
ICAO identifikátorem. Souhrnné počty pokrývají všechna vhodná
LOCAL letadla, nikoliv jen pět karet. Zvolený letoun ovládá
také existující Sky Story a Sky Finder. Pokud zmizí z LOCAL
příjmu, zobrazí se nyní nejvhodnější zbývající kandidát.
Není potřeba další dotazování serveru, odesílání polohy
ani nový predikční model.

## Uživatelské akce a ochrany

Výběr nabízí stávající odkazy na živý radar
(`/?aircraft=<hex>`), detail letadla (`/aircraft/<hex>`) a
předvyplněné sledování (`/watchlist?icaoHex=<hex>` spolu
s případnou registrací). Využívá se existující watchlist a
lokální notifikace; **není automaticky uděleno žádné oprávnění
ani založeno žádné trvalé pravidlo sledování**.

Při zastaralých nebo nedostupných datech My Sky neslibuje
stav LIVE. Beze změny zůstává opt-in ukládání spotů,
soukromý deník, odhad viditelnosti, fotografické a světelné
podmínky i 60minutový briefing. GPS zůstává v prohlížeči,
dokud uživatel samostatně výslovně neuloží spot přes
existující chráněné API. UI přesné souřadnice nevypisuje.

## Ověření

`tests/spotter-my-sky-focus-v2.test.ts` prověřuje LOCAL-only
data, chybějící polohu, geometrii vůči uživateli, prioritizaci
ikonického typu, deduplikaci, omezený počet karet, výběr
a fallback i opětovné využití stávajících odkazů. Produkční
browser smoke ukládá deterministické desktopové a 390px
mobilní snímky stránky `/spotter` bez automatického
povolení GPS.

## B2 — Personal Sky Intelligence

Uživatelská **oblíbená letadla** jsou výslovně označené šestimístné
hexadecimální ICAO identifikátory uložené pod klíčem
`airradar.my-sky-favorites.v1` v prohlížeči. Omezené a validované
úložiště pojme maximálně 32 unikátních hodnot. Vybrané letadlo
lze jedinou výslovnou akcí přidat nebo odebrat. Poškozený,
nekompatibilní či příliš velký záznam se nepoužije; pokud
prohlížeč zápis odmítne, aplikace zobrazí chybu a nepředstírá
úspěšné uložení. Změny se promítají mezi My Sky a Můj AirRadar
pomocí místní události a standardní události `storage`
bez nového serverového API.

Počet **Už jsem viděl** a čas posledního pozorování pocházejí
výhradně z uživatelem **ručně potvrzených** položek stávajícího
soukromého deníku Spotter. Opakované SSE aktualizace se
nepovažují za pozorování ani potvrzený průlet nad hlavou.
Pořadí v My Sky dostává omezenou bonusovou prioritu pro
oblíbená a dříve ručně pozorovaná letadla, původní
objektivní důvody zajímavosti se nemění. Deník se při
výpočtu indexuje jednou, takže pro každý let jde o rychlé
vyhledání. Personalizace nepovolí NETWORK-only letadlu
obejít podmínku LOCAL příjmu.

Můj AirRadar zobrazuje uložená oblíbená ICAO a jejich
aktuálně pozorované LOCAL záznamy ze **stejného lokálního
úložiště**. Nejde o synchronizaci oblíbených na účet serveru.

## B3 — Sledování letu a upozornění

Hlavní karta My Sky obsahuje vedle odkazů Radar, Detail
a předvyplněný Watchlist také existující tlačítko
**Sledovat tento let (Follow Journey)**. Trvalá nebo
provizorní identita letu se řeší až po kliknutí pomocí
stávajícího API a lokálního úložiště
`airradar.followed-journeys.v1`. Oblíbené letadlo,
Watchlist pravidlo a konkrétní sledovaný let jsou
**samostatné funkce se samostatným souhlasem**.

Do stávající politiky `airradar.spotter-alerts.v1`
přibyl přepínač `favoriteAlertsEnabled`, který je
**výchozím stavem vypnutý**, a to i u starých uložených
nastavení. Oblíbené letadlo se stává kandidátem k
upozornění až po povolení hlavních upozornění a příslušného
oprávnění. Nadále musí splnit limity vzdálenosti,
předstihu, skutečného přibližování a deduplikaci
podle ICAO. Používají se existující upozornění
v otevřeném prohlížeči přes service worker. Nutná
je aktivní stránka Spotter a živá LOCAL data;
nevzniká žádný nový push systém ani služba běžící
na pozadí. Pro serverová upozornění mimo otevřenou
stránku lze nadále výslovně uložit Spot a nastavit
existující Watchlist / doručovací pravidla.

## B4 — Uzavření, výkon, soukromí a regresní brány

Stávající geolokace se počítá pouze v prohlížeči a
zapíná se výslovným přepnutím do režimu Moje poloha.
Oblíbená letadla ani deník **neobsahují souřadnice**.
Výpočet je omezen rozsahem LOCAL snapshotu,
existujícími nejvýše 500 položkami deníku a zobrazením
pěti nejvhodnějších letadel. Nepřibývají databázové
zápisy ani další SSE připojení. Přidání oblíbeného
letadla samo nikdy neaktivuje notifikace nebo
sledovací pravidlo. Neznámé trasy i zastaralý
stream mají nadále viditelné stavy.

Testy ověřují validaci a kapacity lokálního úložiště,
ručně potvrzená pozorování, prioritu oblíbených,
LOCAL provenienci, zobrazení v obou sekcích,
souhlas s upozorněními, živost streamu i předání
sledování původní funkci Follow Journey.
Produkční 390px Playwright kontrola nasazuje pouze
testovací lokální oblíbenou ICAO a ověřuje její
zobrazení v Můj AirRadar. Tato data nejsou
zapsaná do produkční databáze ani jiných prohlížečů.

Etapa B je vývojově uzavřená až po úspěšných PR
CI a CodeQL, produkčních browser a výkonových
kontrolách a potvrzení nasazené verze. Neznamená
to automatické naplnění uživatelského deníku
nebo oblíbených letadel — vznikají až akcemi uživatele.
