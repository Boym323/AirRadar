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

Případná další etapa může zlepšit preference upozornění
a historickou personalizaci. Musí však používat dosavadní
kontrakty dat a notifikací a nevymýšlet pokrytí přijímače.
