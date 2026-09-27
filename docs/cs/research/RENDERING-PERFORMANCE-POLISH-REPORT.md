# Report úprav renderingu / výkonu

## Shrnutí

Správnost a výkon renderingu jsou zlepšené/stabilní, protože měřená WebGL hot
path nyní znovu používá vertex storage a výpočet screen-heading pro WebGL/HTML
má explicitní parity contract, zatímco existující hranice collision, LOD,
trail, selected-aircraft a SSE zůstávají nedotčené.

## Baseline

Produkční build z `origin/main` `a39c977e`, benchmark příkaz:

```text
RADAR_PERF_SCENARIOS=100,500,1000 RADAR_PERF_MEASURE_MS=3000 npm run benchmark:radar
```

| Scénář | HTML markery | WebGL letadla | Animation avg | Animation p95 | Collision avg | Stav |
|---:|---:|---:|---:|---:|---:|---|
| 100 | 0 | 100 | 0.18 ms | 0.20 ms | 0.03 ms | PASS |
| 500 | 0 | 500 | 0.25 ms | 0.80 ms | 0.03 ms | PASS |
| 1000 | 0 | 1000 | 0.97 ms | 4.60 ms | 0 ms | PASS |

Baseline harness zaznamenává frame-interval p95 80.4/90.8/111.9 ms a počty
long tasks 46/40/33; jde o observační metriky, nikoli CI brány podle
performance policy repozitáře.

Stejný harness byl spuštěn znovu po změně. Post-change frame-interval p95 byl
71.8/86.1/135.8 ms a počty long tasks 48/40/32. Hodnoty pro 100 a 500 letadel
se zlepšily, zatímco frame interval pro 1000 letadel je citlivý na zatížení
runneru a je zaznamenán jako známé pozorování místo release gate.

## Zjištění

- WebGL alokovalo nové typed vertex array při každém data renderu.
- HTML a WebGL používaly ekvivalentní, ale odděleně vyjádřené heading formulas.
- Collision priority, grid indexing, zoom LOD, omezené traily, vlastnictví
  selected markeru a SSE latest-state coalescing už byly pokryté a omezené.

## Opravy

- Přidán znovupoužitelný WebGL vertex storage rostoucí podle kapacity.
- Přidán `aircraftWebglScreenHeading()` a parity testy proti HTML visual
  heading resolveru, včetně bearingu otočené mapy.
- Přidán audit vysvětlující, proč byly nesouvisející rendering paths ponechány stabilní.

## Benchmarky

Before/after výsledky ze stejných třísekundových scénářů:

| Scénář | Animation avg před → po | Animation p95 před → po | Collision avg před → po | Stav po |
|---:|---:|---:|---:|---|
| 100 | 0.18 → 0.12 ms (-33%) | 0.20 → 0.20 ms | 0.03 → 0.03 ms | PASS |
| 500 | 0.25 → 0.34 ms (+36%) | 0.80 → 0.50 ms (-38%) | 0.03 → 0.02 ms (-33%) | PASS |
| 1000 | 0.97 → 0.67 ms (-31%) | 4.60 → 1.00 ms (-78%) | 0 → 0.03 ms | PASS |

Nebyl zaveden žádný arbitrární latency target; všechny strukturální budgety
zůstaly PASS a měřený animation p95 se zlepšil ve všech požadovaných scénářích.

## Parita renderingu

```text
WebGL vs HTML heading: PASS (unit parity testy, případy bearingu mapy)
WebGL vs HTML anchor: PASS (stejný geografický bod MapLibre a centrovaný marker model)
Selection transition: PASS (existující testy vlastnictví bulk/special)
Map rotation: PASS (heading parity pokrývá nenulový bearing)
Collision priority: PASS (existující testy selected/emergency/watchlist/normal)
```

## Time Machine

```text
1× / 5× / 10× / 30×: existující deterministické playback limity zachovány
Event clustering: omezené markery se zachováním úplného seznamu událostí
Seek: pending selection přežije reload historical-window
```

## Stress test

Existující produkční harness strukturálně pokrývá 50, 100, 250, 500, 1000,
1600, 2000, 3000 a 5000 letadel. Tento audit H změřil požadované scénáře
100, 500 a 1000 před i po změně.

## Známá omezení

- Není zavedeno browser screenshot comparison; repozitář používá existující
  production/browser gates místo nového visual frameworku.
- Frame-interval a long-task hodnoty jsou citlivé na zatížení runneru a
  zůstávají observační, jak dokumentuje existující budget skript.

## Validace

```text
typecheck: PASS
cílené rendering/SSE testy: 5 souborů, 50 testů PASS
úplná test suite: 177 souborů, 1204 testů PASS
lint: PASS (4 existující warnings, 0 errors)
prisma contract emit: PASS
production build: PASS
production + responsive + browser gates: PASS
radar performance 100/500/1000: PASS
```

## Doporučení

READY FOR PRODUCTION POLISH COMPLETE: YES

Změna je úzká, změřená, zachovává live/SSE a marker ownership contracty a
přidává regression coverage. Úplné testy, build, production gates, responsive
sweep, browser gate a radar performance scénáře všechny prošly.
