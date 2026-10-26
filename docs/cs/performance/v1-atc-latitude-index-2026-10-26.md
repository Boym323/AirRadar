# AirRadar V1 – index šířkových pásem ATC polygonů (26. 10. 2026)

**Stav:** Implementace a specializovaná CI přejímka PASS v draft PR
[#1114](https://github.com/Boym323/AirRadar/pull/1114).
**Produkční `main` a běžící V1 zůstávají beze změny.**

## Proč
Velké CZ/SK ATC ringy obsahují až desítky tisíc souřadnic.
Dosavadní synchronní ray-casting smyčka `ringContains` procházela všechny
hrany pro každou polohu; to může blokovat Node event loop, zejména
při vícenásobném vyhodnocování ATC kontextu.

## Implementace
- `lib/atc-context/latitude-ring-index.ts`: slabě referencovaný `WeakMap`
  index 0,25° zeměpisné šířky; seznam hran uchováván jako `Uint32Array`.
- Indexují se jen velké **deep-frozen** ringy s 2 048+ body a korektními
  konečnými souřadnicemi, s limity počtu referencí a délky jednotlivé hrany.
  Mutable ringy zůstávají na původním skenování bez cache.
- Rozsahy indexu jsou rozšířené o stejných `1e-9` jako původní test hran;
  nesmí zmizet hraniční bod ani segment ležící na hranici pásma.
- Asynchronní příprava datasetu zavolá `prewarmFrozenAtcRing` a po každých
  nejvýše 1 024 hranách uvolní event loop. Sync cesta používá lazy build.
- Žádné zásahy do DB, ADS-B, zdrojů dat, streamu, UI ani konfigurace.
- Index zanikne, když GC uvolní starý připravený ATC ring.

## Kontrolovaná syntetická A/B zkouška na reálném SK polygonu

[GitHub Actions #40294252784](https://github.com/Boym323/AirRadar/actions/runs/40294252784)
– stejný runner, 128 deterministických souřadnic, 46 993 vrcholů.

| Metrika | Před (bez indexu) | Po (s indexem) |
|---|---:|---:|
| P50 jednoho dotazu | 4,625 ms | 0,128 ms |
| P95 jednoho dotazu | 9,501 ms | 0,418 ms |
| P99 jednoho dotazu | 9,642 ms | 0,475 ms |
| Max jednoho dotazu | 9,904 ms | 0,491 ms |
| CPU všech 128 dotazů | 842,657 ms | 22,080 ms |
| Max zpoždění event loopu | 13,230 ms | 1,220 ms |
| Neshody klasifikace hran | — | **0/128** |
| Jednorázová asynchronní příprava indexu | — | 11,325 ms |

**Limity interpretace:** samotná geometrie na synteticky vybraných polohách
nad skutečným polygonem, nikoli živý end-to-end T58 test, ani CPU celého
produkčního procesu. Údaj o RSS nelze ze dvou krátkých rozdílných časových
oken přímo srovnat. Uváděný CPU poměr ≈0,026 se týká pouze této operace.

[Samostatná CI #40294518103](https://github.com/Boym323/AirRadar/actions/runs/40294518103)
navíc ověřila TypeScript typecheck, ATC engine integraci a index parity PASS.

## Zbývající brány
1. CodeQL a obecné škálovací testy PR bez regresí.
2. Původní V1 CI zatím selhává **před sestavením** na auditu stávajících
   produkčních závislostí (Next.js/undici); neobcházet audit kvůli optimalizaci.
3. Před produkčním sloučením změřit stejné T58 scénáře při reálném provozu:
   CPU, RSS, P95/P99 event-loop, maximální stall, přesnost ATC výběru a
   schopnost rollbacku. Srovnat se stejným hardwarem a verzemi.
4. Konfliktní Rust ATC pilot [PR #1107](https://github.com/Boym323/AirRadar/pull/1107)
   posoudit společně; oba optimalizují stejnou část ATC a bez dalšího A/B
   se nesmějí nasadit současně.
