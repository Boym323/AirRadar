# T58 – následná optimalizace latence ADSBDB tras

Datum: 2026-10-16. Vychází z hodinového T58 v1.0.481, který má výrazně
lepší event-loop odezvu, ale stále vykazuje dlouhé `routeResolution` čekání
a významné výkyvy RSS. Toto měření **neprokazuje**, že zpoždění způsobuje
dohledávání letišť; část může být upstream HTTP (limit 3 500 ms), queue
nebo PostgreSQL/cache.

## Konkrétní zjištění v kódu

`AdsbDbProvider.getRoute()` po jedné HTTP odpovědi postupně čekal na
`airport(origin)` a **až potom** začal `airport(destination)`. Každé
volání může číst tabulku letišť (nejprve ICAO, pak IATA); jejich výsledky
jsou nezávislé a nemusejí se předávat mezi sebou.

## Změna

- Spustit obě dohledání současně pomocí `Promise.all`. Zachovat
  předchozí identitu a pořadí výstupních polí origin/destination, DB-first
  resolver a jeho dosavadní fallback při chybách.
- Max. dvě souběžná dohledání letiště **na jeden přijatý route request**;
  vnější limiter Flight Route (6) se nemění. To může zvýšit okamžitý počet
  souběžných dotazů na letiště; **celkový počet dotazů se nemění**.
- Přidat dvě omezené, anonymní časové distribuce:
  `routeMetrics.phases.adsbdbRouteFetch` a
  `routeMetrics.phases.airportResolution`. Obě jsou *await wall time*,
  nikoli měření exkluzivního CPU či doby SQL serveru.
- Regresní testy dokazují, že druhý resolver začne před dokončením prvního,
  že opačné pořadí dokončení nepřehodí letiště a že výpadek jedné DB větve
  zachová původní fallback.

## Ověření

Cílené testy `tests/airport-resolver.test.ts` a
`tests/route-postgres-cache.test.ts`, TypeScript, ESLint, CI, CodeQL.
Žádná migrace, změna TTL/cache identity, služeb, limitů dotazů upstream ani
nativního Rust modulu.

## Interpretace a další krok

Tento patch odstraňuje prokazatelnou **sekvenční čekací závislost**,
ale nemůže dopředu tvrdit procentní zlepšení produkčního `routeResolution`.
Před/po porovnat při podobné zátěži procentily obou nových fází, obecného
`routeResolution`, zátěž DB (pool čekání), CPU, RSS, major GC a event-loop.
Paměťové špičky mohou pocházet z odlišné cesty a nesmí být bez důkazů
připsány této úpravě. Další paměťové optimalizace až po profilování
udržovaných objektů, nikoliv po samotném RSS maximu.
