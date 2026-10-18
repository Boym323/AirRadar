# AirRadar — druhé kolo čištění, rozhodnutí a důkazy (18. 10. 2026)

[English](../../agents/CLEANUP-ROUND2-2026-10-18.md)

> Datovaný dokument ke konkrétnímu úkolu. Nejprve čti [AGENTS.md](../../../AGENTS.md). Novější kód, produkční SHA, CI a měření mají přednost. Nejde o schválení mazání historie DB, užitečných fallbacků, veřejných kontraktů nebo ručního deploye.

## Provedené samostatné změny

| Oblast | Ověřená změna | Limity měření |
| --- | --- | --- |
| Dokumentace vyřazeného modelového větru Digital Twin | [PR #1031](https://github.com/Boym323/AirRadar/pull/1031), main `c8daf6af`. Odstraněny zastaralé EN/CZ sekce Wind Timing i dokumentace neexistujícího `/api/map-context/wind`. PR a main CI zelené. | Pouze dokumentace; modelový vítr ve Weather Fusion zůstává. Žádná změna CPU. |
| Starý katalog SVG ikon | [PR #1032](https://github.com/Boym323/AirRadar/pull/1032), main `fa2a15bf`, [v1.0.525](https://github.com/Boym323/AirRadar/releases/tag/v1.0.525). Odstraněno 184 starých souborů o 1 056 990 zdrojových bajtech. Zachováno 378 souborů tar1090 včetně licence a aktivního vykreslování. Přidán negativní test odkazů na staré assety. PR CI, CodeQL, škálovací testy, produkční deploy/health zelené. | ZIP produkčního artefaktu v1.0.524: 74 766 779 B; v1.0.525: 73 895 942 B. Rozdíl −870 837 B (−1,16 %). Mezi verzemi je též dokumentační commit. Nejde o měření CPU/RAM. |
| Rozdělení GeoJSON helperů radaru | [PR #1033](https://github.com/Boym323/AirRadar/pull/1033), main `17c1afc7`. Čisté generátory GeoJSON pro letiště, METAR a pozorované počasí byly přesunuty z `components/airradar-app.tsx` do modulu; přidány paritní testy. PR CI, CodeQL a syntetické škálování zelené. | Strukturální refaktor, nikoli prokázané zrychlení. Nasazení musí být ověřeno podle přesného main CI SHA. |

## Funkce s reálnými konzumenty — neodstraňovat jen podle názvu

| Kandidát | Ověřený stav kódu | Rozhodnutí | Co je potřeba měřit |
| --- | --- | --- | --- |
| ATC Shadow Prediction | `lib/server/aircraft-state.ts` provozuje omezené fronty a validační výpočet z `lib/server/atc-prediction-validation.ts`; veřejné read-only `/api/atc/validation` z něj čerpá. `isAtcShadowPredictionEnabled()` se implicitně řídí zapnutím ATC resolution. | **ZACHOVAT / optimalizovat po měření**; není dead code. | A/B ON/OFF na shodném syntetickém replay, CPU/event, alokace, P99 event-loop, délka front a kvalita validace. Produkční flagy jen schváleným sanitizovaným read-only postupem. Neměnit přiřazování sektorů. |
| Digital Twin validátory | Při lokálním snapshotu probíhá pět nezávisle měřených truth/outcome vyhodnocení s návaznými reporty a kalibrací. Automatický situační sample je omezen na nejvýše jednou za minutu. | **ZACHOVAT; PROFILOVAT**. | Exkluzivní čas každého validátoru, alokace, parita výstupů. Vnořená měření nesčítat; případné sjednocení průchodů pouze po A/B důkazu. |
| FlightPosition Persistence Shadow | V `lib/server/flight-position-persistence-shadow.ts` je volitelná větev `FLIGHT_POSITION_SHADOW_ENABLED=true`; běžně se její kód rychle vynechá. V System diagnostice má konzumenta. Kanonický writer historie je oddělený. | **PONECHAT VÝCHOZÍ OFF** do vyhodnocení experimentu zápisů. | Měřit aktivní režim; až poté rozhodnout o odstranění a kontraktu. Nesmazat historické pozice ani neměnit sampling na základě pouhého odhadu. |
| ADSBHub / ADSB.lol raw / HTTP fallback | `lib/server/network-failover-provider.ts` zajišťuje nezávislé zdroje, freshness a odolnost. Stejná ICAO neznamená redundantní polohu, MLAT ani fallback. | **ZACHOVAT**. | Sanitizovaný unikátní přínos každého zdroje, výpadky, freshness, síťové bajty a zátěž; poté izolované A/B. Bez změny produkčních provider flagů. |
| Historické auditní artefakty a migrační snapshoty | Zůstává 169 souborů artefaktů (~4 980 487 B) a 48 migračních snapshot souborů (~6 319 116 B). Nejde o důkaz běhového výkonového problému. | **HISTORII ZACHOVAT**. | Stanovit retenční/archivační pravidla před mazáním důkazů; neodstraňovat migrace ani licence jen kvůli velikosti Git repozitáře. |

## Zbývající práce s kódem

- `components/airradar-app.tsx` je i po prvním extrahování velký; pokračovat oddělením čistých mapových transformací a samostatných hooků. Zachovat 2D zdroje, SSE, styly a browser testy.
- `lib/server/aircraft-state.ts`, `lib/server/system-status.ts` a `components/system-status-page.tsx` dále vyžadují cílený refaktor, nikoli hromadné přepisování.
- Úspory CPU, RAM, DB a síťového provozu u těchto kandidátů jsou **NOT_MEASURED**. Nový T58 nebyl v tomto kole spuštěn. Úspěch syntetického benchmarku není důkaz úspory na produkci.
- Žádný druhý poller, ruční deploy, změna produkční konfigurace/tajných hodnot, destruktivní DB ani rušení veřejné diagnostiky bez důkazů.

## Povinný postup dalších změn

Čerstvé upstream/produkční SHA → izolovaný neobsluhující checkout → konkrétní konzumenti → reprodukovatelné A/B (stejné prostředí, typické velikosti, 0/10/100 % změněných záznamů, SSE 0/10/50 dle potřeby) → p50/p95/p99, CPU/alokace/RSS/GC → pozitivní i negativní bezpečnostní testy → lint/typecheck/CI/CodeQL/browser → jediný ověřený neforce zápis → kontrola automatického deploye přesné SHA. Pokud není přínos prokázán, je bezpečnější **NO_CHANGE** než spekulativní mazání.
