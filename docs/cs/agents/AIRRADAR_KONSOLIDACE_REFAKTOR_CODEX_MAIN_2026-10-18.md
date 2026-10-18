# AirRadar — konsolidace a refaktor na `main`

[English](../../agents/AIRRADAR_KONSOLIDACE_REFAKTOR_CODEX_MAIN_2026-10-18.md)

**Datum:** 18. října 2026
**Projekt:** [Boym323/AirRadar](https://github.com/Boym323/AirRadar)
**Produkce:** https://airradar.pomykal.cz
**Autorita:** toto zadání doplňuje [AGENTS.md](../../../AGENTS.md), [vývojová pravidla](../../DEVELOPMENT.md) a [release postup](../../RELEASE.md).

## Cíl a důkazy

Snižujte zbytečný kód a provozní náklady pouze podle aktuálních důkazů,
nikoli podle velikosti souboru nebo odhadu. Před odstraněním modulu ověřte
importy, dynamické konzumenty, routy, testy, workflow, externí URL, migrace a
možnost návratu. Výkonové refaktory porovnávejte na srovnatelném zatížení podle
CPU, RSS, event-loop percentilů a chování prohlížeče.

## Vývoj a produkce

Pracujte v samostatném checkoutu na `main`, mimo živý `/var/www/airradar`.
Nevytvářejte běžné branche ani PR. Změny dělejte v malých testovaných
commitech; před pushnutím ověřte upstream, diff a `scripts/release-scope.mjs`.
Push do `main` může spustit automatický deploy, proto před dalším pushnutím
počkejte na CI, CodeQL a případný release předchozí revize.

Nespouštějte build v živém checkoutu, neměňte produkční tajné údaje, nerestartujte
službu ručně a neprovádějte destruktivní databázové operace.

## Veřejné diagnostiky a soukromé zápisy

Sanitizované read-only GET diagnostiky, například `/api/system/status`,
`/api/system/integrations` a omezené performance telemetry, jsou záměrně
veřejné. Nesmějí vracet tokeny, cookies, DB URL, raw chyby providerů, privátní
identifikátory hosta ani přesné souřadnice přijímače. Watchlist, alerty,
konfigurace a jiné administrativní mutace musí samostatně vyžadovat autentizaci
a autorizaci.

[PR #1017](https://github.com/Boym323/AirRadar/pull/1017) neslučujte beze změn,
protože by uzamkl i zamýšlené veřejné diagnostiky.

## Pořadí konsolidace

1. Zaznamenejte aktuální SHA zdrojů i produkce a čerstvou baseline.
2. Odstraňte jen prokazatelně nepoužívané legacy adaptéry a archivní vstupy.
3. Refaktorujte radarové UI/mapu bez druhého SSE klienta, polleru nebo state ownera.
4. Refaktorujte aircraft state, historii a status při zachování `readsb → RAM → SSE`.
5. Track Fusion, Operational Twin a providery vyhodnoťte podle měřené hodnoty.
6. CI a konfiguraci čistěte jen při zachování povinných quality/release gateů.

Každý kandidát dostane výsledek `KEEP`, `MERGE`, `DELETE` nebo `DEFER`.
Odstraňujte pouze části bez aktivního runtime, CI nebo externího konzumenta;
migrace a rollback artefakty zůstávají zachované.

Spusťte relevantní lint, typecheck, testy, features/docs/visual gate,
browser gate a výkonové benchmarky. Rust změny vyžadují parity testy. Krátký
syntetický benchmark není důkazem produkčního zrychlení. Produkční výsledek
uvádějte pouze s přesným SHA, časem, srovnatelnými podmínkami a rozlišením
`PROKÁZÁNO`, `NEPROKÁZÁNO` nebo `NEOVĚŘENO`.

Report uvádí výchozí stav, bottlenecky, změněné soubory, testy, benchmarky,
commity na `main`, CI/CodeQL, ověřenou produkční verzi a zbývající rizika.
Historické audity nejsou důkazem současného produkčního stavu.
